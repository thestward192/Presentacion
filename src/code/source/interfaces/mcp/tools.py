"""Tools de MCP para Talent Acquisition (Pre-Screening).

Convencion del repo: talent_acquisition_<recurso>_<operacion>, ver
docs/TOOL_NAMING.md. El wiring del adapter concreto para VacancySourcePort
(carpeta, Outlook o Gmail) vive en infrastructure/cloud/source_factory.py,
seleccionado por TALENT_ACQUISITION_SOURCE_BACKEND; el de
CandidateMatchScorerPort (heuristica determinista o Laya) vive en
infrastructure/scoring/match_scorer_factory.py, seleccionado por
TALENT_ACQUISITION_MATCH_SCORER_BACKEND -- los use_cases reciben el port
por inyeccion y no saben que hay detras.
"""

from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Literal

import httpx
from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

try:
    from typesafe_sdk import TypeSafeError
except ImportError:
    TypeSafeError = None

from novahub_people_mcp.contracts.module_status import ModuleStatus
from novahub_people_mcp.platform.config.settings import get_settings

from ...application.use_cases.build_prescreening_conversation import (
    BuildPrescreeningConversation,
)
from ...application.use_cases.detect_cv_inconsistencies import DetectCvInconsistencies
from ...application.use_cases.generate_interview_handoff import GenerateInterviewHandoff
from ...application.use_cases.generate_screening_report import GenerateScreeningReport
from ...application.use_cases.get_job_description import GetJobDescription
from ...application.use_cases.get_module_status import GetModuleStatus
from ...application.use_cases.get_prescreening_question import GetPrescreeningQuestion
from ...application.use_cases.list_candidate_cvs import ListCandidateCvs
from ...application.use_cases.rank_candidates import RankCandidates
from ...domain.prescreening import (
    CandidateAnswer,
    CandidateCv,
    CvInconsistencyReport,
    DocumentUnreadableError,
    InterviewHandoff,
    JobDescription,
    MatchEvaluation,
    PrescreeningConversation,
    PrescreeningQuestion,
    ScreeningReport,
    ScreeningReportBatchResult,
    UnsupportedDocumentFormatError,
    VacancyNotFoundError,
)
from ...infrastructure.cloud.outlook_cv_reader import OutlookCvReader
from ...infrastructure.cloud.source_factory import build_vacancy_source_adapter
from ...infrastructure.folder_source.folder_vacancy_source_adapter import (
    FolderVacancySourceAdapter,
)
from ...infrastructure.reports.excel_screening_report_writer import ExcelScreeningReportWriter
from ...infrastructure.scoring.match_scorer_factory import build_match_scorer

# De donde se toma el CV en las tools del informe y la conversacion:
# la carpeta de la vacante o los adjuntos recientes del buzon de Outlook.
CvSource = Literal["folder", "outlook"]

_JD_ERRORS = (
    VacancyNotFoundError,
    UnsupportedDocumentFormatError,
    DocumentUnreadableError,
    FileNotFoundError,
)


def register_tools(mcp: MCPServer) -> None:
    """Register MCP Tools owned by Talent Acquisition."""

    settings = get_settings()
    source = build_vacancy_source_adapter(settings)
    # Prueba: CVs desde el buzon de Outlook de Payroll, mismas credenciales.
    # Lee los adjuntos con el mismo codigo que la carpeta de la vacante.
    outlook_cv_reader = OutlookCvReader(
        tenant_id=settings.ms_graph_tenant_id,
        client_id=settings.ms_graph_client_id,
        client_secret=settings.ms_graph_client_secret,
        mailbox=settings.payroll_outlook_mailbox,
        folder=FolderVacancySourceAdapter(inbox_dir=settings.talent_acquisition_inbox_dir),
    )

    status_use_case = GetModuleStatus()
    get_job_description_uc = GetJobDescription(source=source)
    list_cvs_uc = ListCandidateCvs(source=source)
    evaluate_match_uc = build_match_scorer(settings)
    detect_inconsistencies_uc = DetectCvInconsistencies()
    generate_report_uc = GenerateScreeningReport()
    get_question_uc = GetPrescreeningQuestion()
    rank_candidates_uc = RankCandidates(evaluate_match=evaluate_match_uc)
    build_conversation_uc = BuildPrescreeningConversation()
    generate_handoff_uc = GenerateInterviewHandoff()
    screening_report_writer = ExcelScreeningReportWriter()

    @contextmanager
    def _translate_scorer_errors() -> Generator[None, None, None]:
        """TypeSafeError (auth invalida, timeout, rate limit, etc. contra
        Jev/Laya) sale del SDK con un mensaje tecnico en ingles que el
        cliente MCP suele mostrar como 'Error executing tool' sin detalle.
        Lo traducimos a un ToolError explicito, con el recordatorio de que
        un cambio reciente en TYPESAFE_API_KEY o el backend requiere
        reiniciar el servidor MCP (Settings se cachea por proceso)."""
        try:
            yield
        except (ModuleNotFoundError, RuntimeError) as exc:
            # El adapter de Jev/Laya envuelve el ModuleNotFoundError en un RuntimeError.
            missing = exc if isinstance(exc, ModuleNotFoundError) else exc.__cause__
            if not (isinstance(missing, ModuleNotFoundError) and missing.name == "typesafe_sdk"):
                raise
            raise ToolError(
                "El scorer de matching esta configurado como 'typesafe' (Jev/Laya) pero "
                "falta instalar el SDK: corre 'uv sync --dev --extra laya' y reinicia el "
                "servidor MCP, o usa TALENT_ACQUISITION_MATCH_SCORER_BACKEND=deterministic."
            ) from exc
        except Exception as exc:
            if TypeSafeError is not None and isinstance(exc, TypeSafeError):
                backend = settings.talent_acquisition_match_scorer_backend
                raise ToolError(
                    f"Fallo el scorer de matching (backend={backend!r}): {exc} "
                    "Si cambiaste TYPESAFE_API_KEY, el backend o la base_url hace poco, "
                    "reinicia el servidor MCP para que relea el .env."
                ) from exc
            raise

    def _get_job_description(vacancy_id: str) -> JobDescription:
        try:
            return get_job_description_uc.execute(vacancy_id)
        except _JD_ERRORS as exc:
            raise ToolError(str(exc)) from exc

    def _list_cvs(vacancy_id: str) -> list[CandidateCv]:
        try:
            return list_cvs_uc.execute(vacancy_id)
        except VacancyNotFoundError as exc:
            raise ToolError(str(exc)) from exc

    def _list_cvs_from(vacancy_id: str, cv_source: CvSource) -> list[CandidateCv]:
        if cv_source == "folder":
            return _list_cvs(vacancy_id)
        try:
            return outlook_cv_reader.list_candidate_cvs(vacancy_id)
        except VacancyNotFoundError as exc:
            raise ToolError(str(exc)) from exc
        except (RuntimeError, httpx.HTTPError) as exc:
            raise ToolError(f"No se pudo leer Outlook: {exc}") from exc

    def _get_cv(vacancy_id: str, candidate_id: str, cv_source: CvSource = "folder") -> CandidateCv:
        cvs = _list_cvs_from(vacancy_id, cv_source)
        matches = [c for c in cvs if c.candidate_id == candidate_id]
        if not matches:
            where = " en Outlook (ultimas 24 horas)" if cv_source == "outlook" else ""
            raise ToolError(
                f"No existe el CV de {candidate_id} para la vacante {vacancy_id}{where}"
            )
        return matches[0]

    def _build_screening_report(
        vacancy_id: str, candidate_id: str, cv_source: CvSource = "folder"
    ) -> ScreeningReport:
        job = _get_job_description(vacancy_id)
        cv = _get_cv(vacancy_id, candidate_id, cv_source)
        with _translate_scorer_errors():
            evaluation = evaluate_match_uc.execute(job, cv)
        inconsistencies = detect_inconsistencies_uc.execute(cv)
        return generate_report_uc.execute(cv, evaluation, inconsistencies)

    @mcp.tool(name="talent_acquisition_integration_status_get")
    async def get_integration_status() -> ModuleStatus:
        """
        Return module integration status and declared capabilities.

        Read-only starter Tool. It does not access employee/candidate PII.
        """
        return status_use_case.execute()

    @mcp.tool(name="talent_acquisition_job_description_get")
    async def job_description_get(vacancy_id: str) -> JobDescription:
        """
        Obtiene el JD estructurado de una vacante.

        Devuelve las skills must-have (requirements), las skills
        nice-to-have (nice_to_have) y los anos minimos de experiencia.
        """
        return _get_job_description(vacancy_id)

    @mcp.tool(name="talent_acquisition_candidate_cv_list")
    async def candidate_cv_list(vacancy_id: str) -> list[CandidateCv]:
        """
        Lista los CVs recibidos para una vacante, ya estructurados.

        Si la vacante no existe devuelve un error indicandolo; si existe pero
        aun no tiene CVs devuelve una lista vacia.
        """
        return _list_cvs(vacancy_id)

    @mcp.tool(name="talent_acquisition_outlook_cv_list")
    async def outlook_cv_list(vacancy_id: str) -> list[CandidateCv]:
        """
        PRUEBA: lee como CVs de la vacante los adjuntos PDF/Word de los
        correos de las ultimas 24 horas (maximo 25 correos) del buzon de
        Outlook de Payroll. Solo lectura: no marca ni mueve correos.
        """
        try:
            return outlook_cv_reader.list_candidate_cvs(vacancy_id)
        except VacancyNotFoundError as exc:
            raise ToolError(str(exc)) from exc
        except (RuntimeError, httpx.HTTPError) as exc:
            raise ToolError(f"No se pudo leer Outlook: {exc}") from exc

    @mcp.tool(name="talent_acquisition_candidate_match_evaluate")
    async def candidate_match_evaluate(
        vacancy_id: str, candidate_id: str, cv_source: CvSource = "folder"
    ) -> MatchEvaluation:
        """Evalua un candidato contra el JD y devuelve una nota de cumplimiento.

        cv_source: "folder" (default) lee el CV de la carpeta de la vacante;
        "outlook" lo lee de los adjuntos recientes del buzon de Outlook.
        """
        job = _get_job_description(vacancy_id)
        cv = _get_cv(vacancy_id, candidate_id, cv_source)
        with _translate_scorer_errors():
            return evaluate_match_uc.execute(job, cv)

    @mcp.tool(name="talent_acquisition_candidate_cv_detect_inconsistencies")
    async def candidate_cv_detect_inconsistencies(
        vacancy_id: str, candidate_id: str, cv_source: CvSource = "folder"
    ) -> CvInconsistencyReport:
        """Detecta gaps de experiencia e informacion contradictoria en el CV.

        cv_source: "folder" (default) lee el CV de la carpeta de la vacante;
        "outlook" lo lee de los adjuntos recientes del buzon de Outlook.
        """
        cv = _get_cv(vacancy_id, candidate_id, cv_source)
        return detect_inconsistencies_uc.execute(cv)

    @mcp.tool(name="talent_acquisition_screening_report_generate")
    async def screening_report_generate(
        vacancy_id: str, candidate_id: str, cv_source: CvSource = "folder"
    ) -> ScreeningReport:
        """
        Genera el informe final de pre-screening para el reclutador.

        Consolida nota (score), evidencia (matched/missing_requirements) e
        inconsistencias del CV. recommendation es "avanzar", "revisar",
        "descartar" o "no_procesable"; en este ultimo caso el CV era ilegible
        o vacio, score es null y unprocessable_reason explica el motivo.
        El CV puede venir en PDF, Word (.docx), Markdown o texto.

        cv_source: "folder" (default) toma el CV de la carpeta de la vacante;
        "outlook" lo toma de los adjuntos recientes del buzon de Outlook (usa
        los candidate_id de talent_acquisition_outlook_cv_list). El JD siempre
        sale de la carpeta de la vacante.
        """
        return _build_screening_report(vacancy_id, candidate_id, cv_source)

    @mcp.tool(name="talent_acquisition_prescreening_question_get")
    async def prescreening_question_get(vacancy_id: str, candidate_id: str) -> PrescreeningQuestion:
        """
        Nice to have: sugiere la primera pregunta de un pre-screening conversacional.

        A validar con el equipo si se construye la conversacion completa.
        """
        job = _get_job_description(vacancy_id)
        cv = _get_cv(vacancy_id, candidate_id)
        with _translate_scorer_errors():
            evaluation = evaluate_match_uc.execute(job, cv)
        return get_question_uc.execute(evaluation)

    @mcp.tool(name="talent_acquisition_candidate_ranking_top_n")
    async def candidate_ranking_top_n(vacancy_id: str, top_n: int = 20) -> list[MatchEvaluation]:
        """
        Rankea TODOS los CVs de la vacante contra el JD y devuelve los top_n mejores.

        Pensado para "de esta carpeta con 100 CVs, dame los 20 mejores": no
        importa cuantos CVs haya en la carpeta de la vacante, esto evalua a
        todos con el mismo criterio de candidate_match.evaluate y devuelve
        solo los top_n, ordenados de mayor a menor score.
        """
        job = _get_job_description(vacancy_id)
        candidates = _list_cvs(vacancy_id)
        if not candidates:
            raise ToolError(f"No hay CVs en la carpeta de la vacante {vacancy_id}")
        with _translate_scorer_errors():
            return rank_candidates_uc.execute(job, candidates, top_n)

    @mcp.tool(name="talent_acquisition_screening_report_create")
    async def screening_report_create(
        vacancy_id: str,
        threshold: float | None = None,
        output_dir: str | None = None,
    ) -> ScreeningReportBatchResult:
        """
        Corre el scoring de TODOS los candidatos de una vacante contra su JD
        y genera un .xlsx con dos pestanas: 'Coincidencias' (score >=
        threshold, con los requisitos que cumplieron) y 'Descartados' (el
        resto, con lo que les falta).

        threshold (0.0-1.0) por defecto usa
        TALENT_ACQUISITION_MATCH_THRESHOLD del .env (0.7 de fabrica).
        output_dir acepta cualquier ruta (absoluta, relativa, o con "~"
        para el home del usuario); si se omite, usa
        TALENT_ACQUISITION_MATCH_REPORT_DIR. El resultado siempre trae la
        ruta absoluta real donde quedo el archivo.
        """
        job = _get_job_description(vacancy_id)
        candidates = _list_cvs(vacancy_id)
        if not candidates:
            raise ToolError(f"No hay CVs en la fuente configurada para la vacante {vacancy_id}")

        effective_threshold = (
            threshold if threshold is not None else settings.talent_acquisition_match_threshold
        )

        matched_rows: list[dict[str, object]] = []
        discarded_rows: list[dict[str, object]] = []
        with _translate_scorer_errors():
            for cv in candidates:
                evaluation = evaluate_match_uc.execute(job, cv)
                row = {
                    "candidate_id": evaluation.candidate_id,
                    "score": evaluation.score,
                    "matched_requirements": evaluation.matched_requirements,
                    "missing_requirements": evaluation.missing_requirements,
                }
                if evaluation.score >= effective_threshold:
                    matched_rows.append(row)
                else:
                    discarded_rows.append(row)

        output_path = screening_report_writer.write(
            vacancy_id=vacancy_id,
            matched_rows=matched_rows,
            discarded_rows=discarded_rows,
            output_dir=output_dir or settings.talent_acquisition_match_report_dir,
        )

        return ScreeningReportBatchResult(
            vacancy_id=vacancy_id,
            file_path=str(output_path),
            generated_at=datetime.now(UTC),
            matched_count=len(matched_rows),
            discarded_count=len(discarded_rows),
            threshold=effective_threshold,
        )

    @mcp.tool(name="talent_acquisition_prescreening_conversation_get")
    async def prescreening_conversation_get(
        vacancy_id: str, candidate_id: str, cv_source: CvSource = "folder"
    ) -> PrescreeningConversation:
        """
        (Nice to have) Guion de una conversacion breve bot-candidato antes de la
        entrevista humana: saludo, hasta 5 preguntas y cierre.

        Las preguntas salen del informe de pre-screening, en este orden: pedir
        el CV de nuevo si era ilegible (unica pregunta), aclarar inconsistencias,
        verificar requisitos faltantes, motivacion y disponibilidad.

        El agente hace las preguntas al candidato en lenguaje natural, una a la
        vez, y despues envia las respuestas con
        talent_acquisition_prescreening_handoff_generate usando cada question_id.

        cv_source: "folder" (default) o "outlook", igual que en
        talent_acquisition_screening_report_generate.
        """
        report = _build_screening_report(vacancy_id, candidate_id, cv_source)
        return build_conversation_uc.execute(report)

    @mcp.tool(name="talent_acquisition_prescreening_handoff_generate")
    async def prescreening_handoff_generate(
        vacancy_id: str,
        candidate_id: str,
        answers: list[CandidateAnswer],
        cv_source: CvSource = "folder",
    ) -> InterviewHandoff:
        """
        (Nice to have) Hoja de traspaso al reclutador despues de la conversacion.

        Recibe las respuestas del candidato como [{question_id, answer}] (los
        question_id de talent_acquisition_prescreening_conversation_get) y
        devuelve cada pregunta con su respuesta, las preguntas sin responder, la
        nota y recomendacion del informe y el siguiente paso ("entrevista_humana"
        o "solicitar_cv"). No decide si el candidato pasa: eso lo hace el humano.

        cv_source: el mismo que se uso en la conversacion ("folder" u "outlook").
        """
        report = _build_screening_report(vacancy_id, candidate_id, cv_source)
        conversation = build_conversation_uc.execute(report)
        return generate_handoff_uc.execute(report, conversation, answers)

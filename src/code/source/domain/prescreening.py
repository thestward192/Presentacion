"""Modelos de dominio del pre-screening de candidatos (Talent Acquisition).

No saben si el JD/CV vino de una carpeta, un ATS o LinkedIn -- eso es
decision de infrastructure/.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

class VacancyNotFoundError(LookupError):
    """La vacante pedida no existe en la fuente de JDs."""

    def __init__(self, vacancy_id: str) -> None:
        super().__init__(f"No existe la vacante {vacancy_id}")
        self.vacancy_id = vacancy_id


class UnsupportedDocumentFormatError(ValueError):
    """El documento viene en un formato que no se sabe leer (.doc, .xls...)."""

    def __init__(self, filename: str) -> None:
        super().__init__(f"Formato de documento no soportado: {filename}")
        self.filename = filename


class DocumentUnreadableError(ValueError):
    """El documento existe pero no se le pudo sacar texto (PDF escaneado, corrupto...)."""

    def __init__(self, filename: str, reason: str) -> None:
        super().__init__(f"No se pudo leer {filename}: {reason}")
        self.filename = filename


@dataclass(frozen=True)
class JobDescription:
    vacancy_id: str
    requirements: list[str]
    nice_to_have: list[str] = field(default_factory=list)
    min_experience_years: float | None = None
    # Texto completo de la vacante, cuando esta disponible (ej. un JD real
    # en prosa libre que no matchea el formato "Requisito: X"). Los
    # adapters deterministas lo ignoran; un scorer basado en un modelo de
    # decision (ej. Laya) lo usa para tener contexto aunque `requirements`
    # quede vacio.
    raw_text: str = ""


@dataclass(frozen=True)
class CandidateCv:
    candidate_id: str
    vacancy_id: str
    years_experience: float | None
    skills: list[str]
    raw_text: str = ""
    # Lo llena el adapter cuando el archivo existe pero no se pudo leer o
    # estructurar (encoding roto, campo numerico con texto, etc.).
    read_error: str | None = None

    @property
    def unreadable_reason(self) -> str | None:
        """Motivo por el que el CV no se puede evaluar, o None si es legible."""
        if self.read_error:
            return self.read_error
        if not self.raw_text.strip() and not self.skills:
            return "El CV llego vacio: sin texto ni skills declarados"
        return None


@dataclass(frozen=True)
class MatchEvaluation:
    candidate_id: str
    vacancy_id: str
    score: float  # 0.0 - 1.0
    matched_requirements: list[str] = field(default_factory=list)
    missing_requirements: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class CvInconsistencyReport:
    candidate_id: str
    issues: list[str] = field(default_factory=list)

    @property
    def has_issues(self) -> bool:
        return bool(self.issues)


@dataclass(frozen=True)
class ScreeningReport:
    candidate_id: str
    vacancy_id: str
    score: float | None  # None cuando el CV es "no_procesable": no se evaluo
    missing_requirements: list[str]
    inconsistencies: list[str]
    recommendation: str  # "avanzar" | "revisar" | "descartar" | "no_procesable"
    # Evidencia: requisitos del JD que el CV si cubre.
    matched_requirements: list[str] = field(default_factory=list)
    unprocessable_reason: str | None = None


@dataclass(frozen=True)
class PrescreeningQuestion:
    candidate_id: str
    question: str


@dataclass(frozen=True)
class ScreeningReportBatchResult:
    """Resultado de generar el reporte Excel de screening en lote (todos
    los candidatos de una vacante vs su JD) en un solo .xlsx."""

    vacancy_id: str
    file_path: str
    generated_at: datetime
    matched_count: int
    discarded_count: int
    threshold: float


@dataclass(frozen=True)
class ConversationQuestion:
    question_id: str  # "q1", "q2"... estable para cruzar con las respuestas
    # "solicitar_cv" | "aclarar_inconsistencia" | "verificar_requisito"
    # | "motivacion" | "disponibilidad"
    topic: str
    question: str


@dataclass(frozen=True)
class PrescreeningConversation:
    """Guion breve que el agente usa para conversar con el candidato."""

    candidate_id: str
    vacancy_id: str
    greeting: str
    questions: list[ConversationQuestion]
    closing: str


@dataclass(frozen=True)
class CandidateAnswer:
    question_id: str
    answer: str


@dataclass(frozen=True)
class AnsweredQuestion:
    question_id: str
    topic: str
    question: str
    answer: str | None  # None si el candidato no la respondio


@dataclass(frozen=True)
class InterviewHandoff:
    """Hoja de traspaso al reclutador: no decide, solo consolida."""

    candidate_id: str
    vacancy_id: str
    score: float | None
    recommendation: str
    answers: list[AnsweredQuestion]
    unanswered_questions: list[str]  # question_id sin respuesta
    next_step: str  # "entrevista_humana" | "solicitar_cv"

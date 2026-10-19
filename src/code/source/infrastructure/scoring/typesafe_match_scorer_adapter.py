"""Adapter que califica un CV contra el JD de una vacante usando un modelo
de decision via el SDK oficial `typesafe-sdk` (extra opcional 'laya' de
este proyecto: pip install '.[laya]'). El mismo cliente sirve para dos
destinos, elegidos solo por `base_url`/`model`/`api_key` -- cero cambios de
codigo entre uno y otro:

  - Laya local, servido por Ollaya (daemon "Ollama para modelos de
    decision") detras de una API wire-compatible con TypeSafe
    (base_url=http://localhost:11435, model="laya").
  - Jev hospedado en la nube de TypeSafe (base_url=https://api.typesafe.ai,
    model="jev-latest", requiere TYPESAFE_API_KEY real).

Implementa CandidateMatchScorerPort igual que EvaluateCandidateMatch: nada
en application/ ni en interfaces/mcp sabe que esto llama a un modelo.

Una sola llamada a system_one() resuelve dos cosas para el mismo CV:
  - Un Score global ("que tan bien cumple en general") -> MatchEvaluation.score,
    normalizado a 0.0-1.0 segun la cantidad de niveles de _OVERALL_FIT_CRITERIA.
  - Un Noul (si/no con probabilidad) por cada requisito del JD -> matched/missing.

La experiencia minima (anos) sigue siendo una comparacion numerica exacta,
igual que en EvaluateCandidateMatch: no tiene sentido pedirle a un modelo
que compare dos numeros.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ...domain.prescreening import CandidateCv, JobDescription, MatchEvaluation

_EXPERIENCE_CRITERION = "experiencia_minima"

_OVERALL_FIT_CRITERIA = [
    "No cumple ningun requisito obligatorio de la vacante",
    "Cumple menos de la mitad de los requisitos",
    "Cumple la mayoria de los requisitos, con brechas menores",
    "Cumple todos los requisitos obligatorios de la vacante",
]

_NOUL_YES_THRESHOLD = 0.5


def _candidate_state(job: JobDescription, cv: CandidateCv) -> str:
    years = cv.years_experience if cv.years_experience is not None else "(no declarado)"
    sections = [
        f"Vacante {job.vacancy_id}:",
        f"Requisitos: {', '.join(job.requirements) or '(ninguno)'}",
        f"Deseables: {', '.join(job.nice_to_have) or '(ninguno)'}",
    ]
    if not job.requirements and job.raw_text:
        # Solo cuando NO hay requisitos estructurados (JD real en prosa
        # libre que no matcheo "Requisito: X" -- ver
        # FolderVacancySourceAdapter). Si ya hay `requirements`, repetir el
        # JD completo aca es puro ruido que infla el prompt y hace que
        # modelos con contexto chico (como laya) trunquen el state.
        sections.append(f"Descripcion completa de la vacante:\n{job.raw_text}")
    sections.append(
        f"Candidato {cv.candidate_id}:\n"
        f"Skills declarados: {', '.join(cv.skills) or '(ninguno)'}\n"
        f"Anos de experiencia: {years}\n\n"
        f"CV completo:\n{cv.raw_text}"
    )
    return "\n\n".join(sections)


@dataclass
class TypeSafeMatchScorerAdapter:
    base_url: str
    api_key: str = "ollaya-local"
    # Sin esto, el SDK pide "jev-latest" (el default de la nube de
    # TypeSafe) aunque base_url apunte a un Ollaya local -- siempre hay que
    # pasar el nombre real del modelo servido en ese base_url (ver
    # match_scorer_factory.py, que lo toma de Settings).
    model: str | None = None
    timeout_seconds: float = 30.0

    def _client(self) -> Any:
        try:
            from typesafe_sdk import TypeSafeClient
        except ImportError as exc:
            raise RuntimeError(
                "Falta la dependencia 'typesafe-sdk'. Instala el extra "
                "opcional 'laya' de este proyecto (pip install '.[laya]')."
            ) from exc

        return TypeSafeClient(
            api_key=self.api_key,
            base_url=self.base_url,
            model=self.model,
            timeout=self.timeout_seconds,
        )

    def execute(self, job: JobDescription, cv: CandidateCv) -> MatchEvaluation:
        try:
            from typesafe_sdk import Noul, NoulCriteria, Score
        except ImportError as exc:
            raise RuntimeError(
                "Falta la dependencia 'typesafe-sdk'. Instala el extra "
                "opcional 'laya' de este proyecto (pip install '.[laya]')."
            ) from exc

        questions: dict[str, Any] = {
            "overall_fit": Score(
                instructions=(
                    "Evaluando el CV completo contra los requisitos de la vacante, "
                    "que tan bien cumple este candidato?"
                ),
                criteria=_OVERALL_FIT_CRITERIA,
            ),
        }
        for index, requirement in enumerate(job.requirements):
            # Criteria explicito en vez de dejarle la interpretacion del
            # limite si/no al modelo -- sin esto, un modelo chico tiende a
            # decir "si" ante cualquier mencion tangencial (ver hallazgo
            # real: perfiles de otra disciplina pasando como cumplidos).
            questions[f"requirement_{index}"] = Noul(
                instructions=f"El candidato cumple con el requisito: {requirement!r}?",
                criteria=NoulCriteria(
                    true=(
                        "El CV menciona explicitamente experiencia, un proyecto concreto o "
                        "una habilidad que demuestra este requisito puntual"
                    ),
                    false=(
                        "El CV no menciona nada relacionado con este requisito, o solo lo "
                        "menciona de forma vaga/tangencial sin evidencia concreta"
                    ),
                ),
            )

        with self._client() as client:
            response = client.system_one(state=_candidate_state(job, cv), questions=questions)

        matched = [
            requirement
            for index, requirement in enumerate(job.requirements)
            if response.answers[f"requirement_{index}"].noul >= _NOUL_YES_THRESHOLD
        ]
        missing = [r for r in job.requirements if r not in matched]

        if job.min_experience_years is not None:
            experience_ok = (
                cv.years_experience is not None and cv.years_experience >= job.min_experience_years
            )
            if not experience_ok:
                missing.append(f"{_EXPERIENCE_CRITERION}_{job.min_experience_years}_anos")

        max_level = len(_OVERALL_FIT_CRITERIA) - 1
        overall_score = response.answers["overall_fit"].score
        score = round(overall_score / max_level, 2) if max_level else 1.0

        return MatchEvaluation(
            candidate_id=cv.candidate_id,
            vacancy_id=job.vacancy_id,
            score=score,
            matched_requirements=matched,
            missing_requirements=missing,
        )

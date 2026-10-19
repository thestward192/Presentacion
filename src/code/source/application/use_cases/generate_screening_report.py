"""Tool: talent_acquisition_screening_report_generate

Consolida nota + evidencia + inconsistencias en un solo informe para el
reclutador. Orden de las reglas (la primera que aplica gana):

1. CV ilegible o vacio -> "no_procesable". No se da nota ni recomendacion
   sobre algo que no se pudo leer.
2. Hay inconsistencias -> "revisar". No se decide "avanzar" ni "descartar"
   sobre datos que no se sabe si son ciertos, el mismo principio que en el
   modulo de Nominas.
3. score >= umbral -> "avanzar"; si no, "descartar".
"""

from __future__ import annotations

from novahub_people_mcp.modules.talent_acquisition.domain.prescreening import (
    CandidateCv,
    CvInconsistencyReport,
    MatchEvaluation,
    ScreeningReport,
)

_ADVANCE_THRESHOLD = 0.7


class GenerateScreeningReport:
    def execute(
        self,
        cv: CandidateCv,
        evaluation: MatchEvaluation,
        inconsistencies: CvInconsistencyReport,
    ) -> ScreeningReport:
        unreadable_reason = cv.unreadable_reason
        if unreadable_reason is not None:
            return ScreeningReport(
                candidate_id=cv.candidate_id,
                vacancy_id=cv.vacancy_id,
                score=None,
                missing_requirements=[],
                inconsistencies=[],
                recommendation="no_procesable",
                matched_requirements=[],
                unprocessable_reason=unreadable_reason,
            )

        if inconsistencies.has_issues:
            recommendation = "revisar"
        elif evaluation.score >= _ADVANCE_THRESHOLD:
            recommendation = "avanzar"
        else:
            recommendation = "descartar"

        return ScreeningReport(
            candidate_id=evaluation.candidate_id,
            vacancy_id=evaluation.vacancy_id,
            score=evaluation.score,
            missing_requirements=evaluation.missing_requirements,
            inconsistencies=inconsistencies.issues,
            recommendation=recommendation,
            matched_requirements=evaluation.matched_requirements,
        )

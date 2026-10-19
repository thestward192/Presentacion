"""Tool: talent_acquisition_candidate_cv_detect_inconsistencies

Logica pura y deliberadamente simple para fines de entrenamiento: valida
que la experiencia declarada en estructura y la mencionada en el texto
libre no se contradigan, y que el CV no llegue vacio.
"""

from __future__ import annotations

import re

from novahub_people_mcp.modules.talent_acquisition.domain.prescreening import (
    CandidateCv,
    CvInconsistencyReport,
)

_YEARS_MENTION = re.compile(r"(\d+)\s*(?:anos|años|years)", re.IGNORECASE)


class DetectCvInconsistencies:
    def execute(self, cv: CandidateCv) -> CvInconsistencyReport:
        issues: list[str] = []

        if not cv.raw_text.strip() and not cv.skills:
            issues.append("El CV llego vacio: sin texto ni skills declarados")

        mentioned_years = {int(m.group(1)) for m in _YEARS_MENTION.finditer(cv.raw_text)}
        if cv.years_experience is not None and mentioned_years:
            declared = int(cv.years_experience)
            if declared not in mentioned_years and abs(declared - min(mentioned_years)) > 1:
                issues.append(
                    f"Experiencia declarada ({cv.years_experience} anos) no coincide con "
                    f"lo mencionado en el texto libre ({sorted(mentioned_years)})"
                )

        if cv.years_experience is None and mentioned_years:
            issues.append(
                "El CV menciona anos de experiencia en el texto libre pero no se "
                "pudo estructurar el campo years_experience"
            )

        return CvInconsistencyReport(candidate_id=cv.candidate_id, issues=issues)

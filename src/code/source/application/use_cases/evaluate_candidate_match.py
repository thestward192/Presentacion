"""Tool: talent_acquisition_candidate_match_evaluate

Logica pura: no toca ningun sistema externo. Un requisito cuenta como
cumplido si aparece (sin distinguir mayusculas) entre los skills del
candidato o en el texto libre de su CV.
"""

from __future__ import annotations

from novahub_people_mcp.modules.talent_acquisition.domain.prescreening import (
    CandidateCv,
    JobDescription,
    MatchEvaluation,
)

_EXPERIENCE_CRITERION = "experiencia_minima"


def _covers(requirement: str, cv: CandidateCv) -> bool:
    needle = requirement.lower()
    if any(needle in skill.lower() for skill in cv.skills):
        return True
    return needle in cv.raw_text.lower()


class EvaluateCandidateMatch:
    def execute(self, job: JobDescription, cv: CandidateCv) -> MatchEvaluation:
        matched = [r for r in job.requirements if _covers(r, cv)]
        missing = [r for r in job.requirements if r not in matched]

        criteria_total = len(job.requirements)
        criteria_met = len(matched)

        if job.min_experience_years is not None:
            criteria_total += 1
            experience_ok = (
                cv.years_experience is not None and cv.years_experience >= job.min_experience_years
            )
            if experience_ok:
                criteria_met += 1
            else:
                missing.append(f"{_EXPERIENCE_CRITERION}_{job.min_experience_years}_anos")

        score = 1.0 if criteria_total == 0 else round(criteria_met / criteria_total, 2)

        return MatchEvaluation(
            candidate_id=cv.candidate_id,
            vacancy_id=job.vacancy_id,
            score=score,
            matched_requirements=matched,
            missing_requirements=missing,
        )

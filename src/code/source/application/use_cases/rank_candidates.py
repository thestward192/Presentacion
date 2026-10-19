"""Tool: talent_acquisition_candidate_ranking_top_n

Responde "de esta carpeta con N CVs, dame los top_n mejores para este JD".
Reusa el mismo CandidateMatchScorerPort que ya usan candidate_match.evaluate
y screening_report.generate (determinista por defecto, o el backend que
este configurado -- ver infrastructure/scoring/match_scorer_factory.py)
sobre TODOS los candidatos de la vacante, y ordena. Funciona igual con 5
CVs que con 100: el limite lo pone top_n, no el tamano de la carpeta.
"""

from __future__ import annotations

from dataclasses import dataclass

from novahub_people_mcp.modules.talent_acquisition.application.ports.candidate_match_scorer_port import (  # noqa: E501
    CandidateMatchScorerPort,
)
from novahub_people_mcp.modules.talent_acquisition.domain.prescreening import (
    CandidateCv,
    JobDescription,
    MatchEvaluation,
)


@dataclass
class RankCandidates:
    evaluate_match: CandidateMatchScorerPort

    def execute(
        self, job: JobDescription, candidates: list[CandidateCv], top_n: int
    ) -> list[MatchEvaluation]:
        evaluations = [self.evaluate_match.execute(job, cv) for cv in candidates]
        evaluations.sort(key=lambda e: (-e.score, e.candidate_id))
        return evaluations[:top_n]

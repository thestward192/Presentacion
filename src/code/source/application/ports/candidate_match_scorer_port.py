"""Puerto de entrada: como se califica un CV contra el JD de una vacante.

Hoy lo implementa application/use_cases/evaluate_candidate_match.py
(heuristica determinista de substring-matching, sin red). Tambien lo puede
implementar un adapter que llame a un modelo de decision (ej. Laya corriendo
local via Ollaya) -- mismo puerto, mismo contrato, seleccionable por config
en infrastructure/scoring/match_scorer_factory.py.
"""

from __future__ import annotations

from typing import Protocol

from ...domain.prescreening import CandidateCv, JobDescription, MatchEvaluation


class CandidateMatchScorerPort(Protocol):
    def execute(self, job: JobDescription, cv: CandidateCv) -> MatchEvaluation:
        """Califica un CV contra el JD y devuelve el detalle del match."""
        ...

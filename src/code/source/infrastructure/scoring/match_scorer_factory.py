"""Selecciona el CandidateMatchScorerPort concreto segun
TALENT_ACQUISITION_MATCH_SCORER_BACKEND.

Unico lugar que decide "heuristica determinista" vs "modelo de decision
via TypeSafe" a partir de Settings. interfaces/mcp/tools.py solo llama a
build_match_scorer(settings) y no conoce ninguno de los dos por nombre.
"""

from __future__ import annotations

from novahub_people_mcp.platform.config.settings import Settings

from ...application.ports.candidate_match_scorer_port import CandidateMatchScorerPort
from ...application.use_cases.evaluate_candidate_match import EvaluateCandidateMatch
from .typesafe_match_scorer_adapter import TypeSafeMatchScorerAdapter


def build_match_scorer(settings: Settings) -> CandidateMatchScorerPort:
    backend = settings.talent_acquisition_match_scorer_backend

    if backend == "deterministic":
        return EvaluateCandidateMatch()

    if backend == "typesafe":
        return TypeSafeMatchScorerAdapter(
            base_url=settings.talent_acquisition_typesafe_base_url,
            api_key=settings.typesafe_api_key or "ollaya-local",
            model=settings.talent_acquisition_typesafe_model,
        )

    raise RuntimeError(
        f"TALENT_ACQUISITION_MATCH_SCORER_BACKEND={backend!r} invalido. "
        "Usa 'deterministic' o 'typesafe'."
    )

"""Puerto de entrada: de donde vienen el JD y los CVs de una vacante.

Hoy lo implementa infrastructure/folder_source (una carpeta por vacante).
Manana puede ser un ATS externo o LinkedIn -- mismo puerto, otro adapter.
"""

from __future__ import annotations

from typing import Protocol

from novahub_people_mcp.modules.talent_acquisition.domain.prescreening import (
    CandidateCv,
    JobDescription,
)


class VacancySourcePort(Protocol):
    def get_job_description(self, vacancy_id: str) -> JobDescription:
        """Devuelve el JD estructurado de una vacante."""
        ...

    def list_candidate_cvs(self, vacancy_id: str) -> list[CandidateCv]:
        """Devuelve los CVs recibidos para esa vacante, ya estructurados.

        Lanza VacancyNotFoundError si la vacante no existe.
        """
        ...

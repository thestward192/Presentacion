"""Adapter de entrada: JD y CVs viven en una carpeta por vacante.

Formato esperado, dentro de <inbox_dir>/<vacancy_id>/:

  job_description.pdf | .docx | .md | .txt
    De cualquier formato se saca el texto con document_text_extractor y se
    estructura de una de dos formas:
    - Formato estructurado (trae "requirement:" / "nice_to_have:" /
      "min_experience_years:" antes de un "---"), como en la carpeta
      centralizada de vacantes:
        requirement: Python avanzado
        nice_to_have: Kubernetes
        min_experience_years: 5
        ---
        (descripcion libre de la vacante)
    - La vacante en texto libre, tal como se publica en NovaHub (titulo,
      "Sobre el puesto", "Requisitos", "Deseable"...): la estructura
      FreeTextJobDescriptionParser.

  cv_<candidate_id>.pdf | .docx | .md | .txt
    El texto se saca con document_text_extractor y se estructura de una de
    dos formas:
    - Formato estructurado (trae "candidate_id:" o "years_experience:"):
        candidate_id: C-001
        years_experience: 4
        skills: Python, SQL, Docker
        ---
        (texto libre: resumen, experiencia narrada, etc.)
    - CV real en texto libre: lo estructura FreeTextCvParser.
    Un CV que no se puede leer (formato no soportado, PDF escaneado o danado)
    NO rompe la vacante: se devuelve con read_error y el informe lo marca
    "no_procesable".

  El prefijo "cv_" no es obligatorio: cualquier .pdf/.docx/.md/.txt de la
  carpeta que no sea job_description.* cuenta como CV, y su candidate_id sale
  del nombre de archivo. Asi se puede apuntar directo a una carpeta
  compartida con CVs reales sin renombrarlos.

El JD conserva su texto completo en raw_text para un scorer basado en un
modelo de decision (Jev/Laya), aunque requirements quede vacio.

Implementa VacancySourcePort. Nada en application/ ni en interfaces/mcp
sabe que esto es una carpeta.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from pathlib import Path

from novahub_people_mcp.modules.talent_acquisition.domain.prescreening import (
    CandidateCv,
    DocumentUnreadableError,
    JobDescription,
    UnsupportedDocumentFormatError,
    VacancyNotFoundError,
)

from ..parsers.free_text_cv_parser import FreeTextCvParser
from ..parsers.free_text_job_description_parser import FreeTextJobDescriptionParser
from ..text_extraction.document_text_extractor import SUPPORTED_EXTENSIONS, extract_text

# Si el CV trae alguna de estas claves, viene en el formato estructurado.
_STRUCTURED_CV_KEYS = {"candidate_id", "years_experience"}
_JOB_DESCRIPTION_STEM = "job_description"
# Si el JD trae alguna de estas claves, viene en el formato estructurado.
_STRUCTURED_JD_KEYS = {"requirement", "nice_to_have", "min_experience_years"}


def _is_candidate_file(path: Path) -> bool:
    """cv_* en cualquier formato (los no soportados salen "no_procesable");
    sin el prefijo, solo los formatos que se saben leer."""
    if not path.is_file() or path.stem.lower() == _JOB_DESCRIPTION_STEM:
        return False
    return path.name.lower().startswith("cv_") or path.suffix.lower() in SUPPORTED_EXTENSIONS


def _derive_candidate_id(cv_path: Path) -> str:
    stem = cv_path.stem
    return stem[len("cv_") :] if stem.lower().startswith("cv_") else stem


def _parse_kv_lines(text: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for line in text.splitlines():
        if line.strip() == "---":
            break
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        pairs.append((key.strip().lower(), value.strip()))
    return pairs


@dataclass
class FolderVacancySourceAdapter:
    inbox_dir: Path
    jd_parser: FreeTextJobDescriptionParser = field(default_factory=FreeTextJobDescriptionParser)
    cv_parser: FreeTextCvParser = field(default_factory=FreeTextCvParser)

    def __post_init__(self) -> None:
        self.inbox_dir = Path(self.inbox_dir)
        self.inbox_dir.mkdir(parents=True, exist_ok=True)

    def get_job_description(self, vacancy_id: str) -> JobDescription:
        path = self._find_job_description(vacancy_id)
        text = extract_text(path)
        fields = _parse_kv_lines(text)
        if _STRUCTURED_JD_KEYS & {key for key, _ in fields}:
            job = _parse_structured_jd(vacancy_id, fields)
        else:
            job = self.jd_parser.parse(vacancy_id, text)
        return replace(job, raw_text=text)

    def _find_job_description(self, vacancy_id: str) -> Path:
        candidates = {
            p.suffix.lower(): p for p in (self.inbox_dir / vacancy_id).glob("job_description.*")
        }
        if not candidates:
            raise VacancyNotFoundError(vacancy_id)
        # Si hubiera varios formatos, gana el primero de SUPPORTED_EXTENSIONS.
        for extension in SUPPORTED_EXTENSIONS:
            if extension in candidates:
                return candidates[extension]
        # Solo hay formatos que no se leen (.doc, .xls...): extract_text da el error claro.
        return next(iter(candidates.values()))

    def list_candidate_cvs(self, vacancy_id: str) -> list[CandidateCv]:
        vacancy_dir = self.inbox_dir / vacancy_id
        # Sin carpeta no hay vacante; una carpeta sin CVs si existe y devuelve [].
        if not vacancy_dir.is_dir():
            raise VacancyNotFoundError(vacancy_id)
        return [
            self._read_cv(vacancy_id, cv_path)
            for cv_path in sorted(vacancy_dir.iterdir())
            if _is_candidate_file(cv_path)
        ]

    def _read_cv(self, vacancy_id: str, cv_path: Path) -> CandidateCv:
        fallback_id = _derive_candidate_id(cv_path)
        # Un CV ilegible no debe tumbar la lectura de toda la vacante: se
        # devuelve marcado y el informe lo reporta "no_procesable".
        try:
            text = extract_text(cv_path)
        except UnicodeDecodeError:
            return _unreadable_cv(
                fallback_id, vacancy_id, "El archivo del CV no se pudo leer como texto UTF-8"
            )
        except (UnsupportedDocumentFormatError, DocumentUnreadableError) as exc:
            return _unreadable_cv(fallback_id, vacancy_id, str(exc))

        fields = dict(_parse_kv_lines(text))
        if _STRUCTURED_CV_KEYS & fields.keys():
            return _parse_structured_cv(fallback_id, vacancy_id, text, fields)
        return self.cv_parser.parse(fallback_id, vacancy_id, text)


def _parse_structured_jd(vacancy_id: str, fields: list[tuple[str, str]]) -> JobDescription:
    requirements: list[str] = []
    nice_to_have: list[str] = []
    min_experience_years: float | None = None
    for key, value in fields:
        if key == "requirement" and value:
            requirements.append(value)
        elif key == "nice_to_have" and value:
            nice_to_have.append(value)
        elif key == "min_experience_years":
            try:
                min_experience_years = float(value)
            except ValueError:
                min_experience_years = None
    return JobDescription(
        vacancy_id=vacancy_id,
        requirements=requirements,
        nice_to_have=nice_to_have,
        min_experience_years=min_experience_years,
    )


def _unreadable_cv(candidate_id: str, vacancy_id: str, reason: str) -> CandidateCv:
    return CandidateCv(
        candidate_id=candidate_id,
        vacancy_id=vacancy_id,
        years_experience=None,
        skills=[],
        read_error=reason,
    )


def _parse_structured_cv(
    fallback_id: str, vacancy_id: str, text: str, fields: dict[str, str]
) -> CandidateCv:
    raw_text = text.split("---", 1)[1].strip() if "---" in text else ""
    skills_raw = fields.get("skills", "")
    skills = [s.strip() for s in skills_raw.split(",") if s.strip()]

    years_experience: float | None = None
    read_error: str | None = None
    years_raw = fields.get("years_experience")
    if years_raw:
        try:
            years_experience = float(years_raw)
        except ValueError:
            read_error = f"years_experience no es un numero: '{years_raw}'"

    return CandidateCv(
        candidate_id=fields.get("candidate_id", fallback_id),
        vacancy_id=vacancy_id,
        years_experience=years_experience,
        skills=skills,
        raw_text=raw_text,
        read_error=read_error,
    )

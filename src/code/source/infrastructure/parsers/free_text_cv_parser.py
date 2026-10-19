"""Parser de CV en texto libre, como llega un CV real en PDF o Word.

Del CV solo se extrae lo que se compara contra el JD:

  Desarrolladora Backend .NET – Nexora Software S.A.        <- puesto (pasantia?)
  Marzo 2022 – Actualidad (4 años y 7 meses) | Bogotá       <- periodo laboral
  - Diseño de APIs REST con C# y ASP.NET Core.
  Tecnologías utilizadas: C#, ASP.NET Core, SQL Server,     <- skills (la lista
  Git, Docker.                                                 puede seguir abajo)

Tambien entiende el formato con solo anos y una seccion de habilidades:

  EXPERIENCIA                                               <- seccion
  Senior AI Engineer — Finlytics (2022 - Actualidad)        <- periodo (solo anos)
  HABILIDADES                                               <- seccion
  - Python (avanzado), FastAPI                              <- skills, una o varias
  - LLMs: Anthropic, OpenAI                                    por linea

- years_experience: suma de los periodos laborales en meses inclusivos. Los
  periodos superpuestos cuentan una vez, las pasantias no cuentan y
  "Actualidad" se calcula hasta el mes de `today`. Un periodo "2019 - 2022"
  (solo anos) cuenta de enero de 2019 a diciembre de 2021, y solo se toma
  dentro de la seccion de experiencia, para no confundirlo con estudios.
- skills: lo declarado en las lineas "Tecnologias utilizadas:" y "Habilidades:"
  (o "Habilidades tecnicas:"), y cada linea dentro de una seccion de
  habilidades.
- raw_text: el CV completo, para que el match busque evidencia en todo el texto.

Si el CV no trae periodos laborales ni tecnologias (p. ej. una plantilla sin
llenar), sale con read_error: no hay informacion que evaluar y el informe lo
marca "no_procesable".
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date

from ...domain.prescreening import CandidateCv

_MONTHS = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}
_MONTH = "(" + "|".join(_MONTHS) + ")"
_PERIOD = re.compile(
    rf"\b{_MONTH}\s+(?:de\s+)?(\d{{4}})\s*[-–—]\s*"
    rf"(?:{_MONTH}\s+(?:de\s+)?(\d{{4}})|(actualidad|presente|actual|hoy))\b"
)
# "(2019 - 2022)", "2022 – Actualidad": periodo con solo anos.
_YEAR_PERIOD = re.compile(
    r"\b((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2}|actualidad|presente|actual|hoy)\b"
)
_EXPERIENCE = "experience"
_SKILLS = "skills"
_OTHER = "other"
_SECTION_HEADINGS = {
    _EXPERIENCE: (
        "experiencia",
        "experiencia laboral",
        "experiencia profesional",
        "historial laboral",
    ),
    _SKILLS: (
        "habilidades",
        "habilidades tecnicas",
        "skills",
        "competencias tecnicas",
        "conocimientos tecnicos",
        "tecnologias",
        "herramientas",
    ),
    _OTHER: (
        "perfil",
        "perfil profesional",
        "resumen",
        "resumen profesional",
        "educacion",
        "formacion",
        "formacion academica",
        "estudios",
        "certificaciones",
        "certificaciones y cursos",
        "cursos",
        "idiomas",
        "proyectos",
        "proyectos personales",
        "logros",
        "referencias",
        "contacto",
    ),
}
_INTERNSHIP = re.compile(r"\b(pasantia|pasante|trainee|practicante|practicas?|intern(ship)?)\b")
# "Tecnologias utilizadas: ...", "Habilidades: ...", "Habilidades tecnicas: ...".
_TECHNOLOGIES = re.compile(
    r"^\s*[•\-*]?\s*(tecnologias(\s+utilizadas)?|habilidades(\s+tecnicas)?|tecnicas)\s*:"
)

NO_INFORMATION = (
    "El CV no contiene informacion evaluable: sin experiencia laboral ni tecnologias declaradas"
)


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def _month_index(month: str, year: str) -> int:
    return int(year) * 12 + _MONTHS[month] - 1


def _section_of(line: str) -> str | None:
    """Si la linea es un titulo de seccion conocido ("EXPERIENCIA", "Habilidades:"),
    devuelve cual; si no, None."""
    heading = _normalize(line).strip().strip(":").strip()
    for section, headings in _SECTION_HEADINGS.items():
        if heading in headings:
            return section
    return None


def _sections(lines: list[str]) -> list[str | None]:
    """Para cada linea, la seccion en la que esta (None antes del primer titulo)."""
    current: str | None = None
    result: list[str | None] = []
    for line in lines:
        current = _section_of(line) or current
        result.append(current)
    return result


def _work_periods(lines: list[str], today: date) -> list[tuple[int, int]]:
    """Periodos laborales (mes_inicio, mes_fin) como indices de mes, sin pasantias."""
    periods: list[tuple[int, int]] = []
    previous = ""
    today_index = today.year * 12 + today.month - 1
    for line, section in zip(lines, _sections(lines), strict=True):
        normalized = _normalize(line)
        period: tuple[int, int] | None = None

        match = _PERIOD.search(normalized)
        year_match = _YEAR_PERIOD.search(normalized) if section == _EXPERIENCE else None
        if match:
            start = _month_index(match.group(1), match.group(2))
            end = today_index if match.group(5) else _month_index(match.group(3), match.group(4))
            period = (start, end)
        elif year_match:
            start = int(year_match.group(1)) * 12
            end_raw = year_match.group(2)
            end = today_index if not end_raw.isdigit() else max(int(end_raw) * 12 - 1, start)
            period = (start, end)

        if period:
            # El puesto va en la linea anterior al periodo (o en la misma).
            is_internship = _INTERNSHIP.search(previous) or _INTERNSHIP.search(normalized)
            if not is_internship and period[1] >= period[0]:
                periods.append(period)
        if normalized.strip():
            previous = normalized
    return periods


def _total_months(periods: list[tuple[int, int]]) -> int:
    """Meses inclusivos; los periodos que se superponen cuentan una sola vez."""
    total = 0
    current_start, current_end = None, None
    for start, end in sorted(periods):
        if current_end is None or start > current_end:
            if current_end is not None:
                total += current_end - current_start + 1
            current_start, current_end = start, end
        else:
            current_end = max(current_end, end)
    if current_end is not None:
        total += current_end - current_start + 1
    return total


def _technologies(lines: list[str]) -> list[str]:
    skills: list[str] = []
    seen: set[str] = set()

    def add_all(value: str) -> None:
        for skill in value.split(","):
            skill = skill.strip().rstrip(".").strip()
            if skill and skill.lower() not in seen:
                seen.add(skill.lower())
                skills.append(skill)

    for i, (line, section) in enumerate(zip(lines, _sections(lines), strict=True)):
        if _TECHNOLOGIES.match(_normalize(line)):
            value = line.split(":", 1)[1].strip()
            # Un PDF corta la lista en varias lineas: sigue mientras termine en coma.
            j = i + 1
            while value.endswith(",") and j < len(lines):
                value = f"{value} {lines[j].strip()}"
                j += 1
            add_all(value)
        elif section == _SKILLS and _section_of(line) is None:
            # Linea dentro de la seccion de habilidades: "- Python, FastAPI" o
            # "LLMs: Anthropic, OpenAI" (se quita la vineta y la categoria).
            item = re.sub(r"^[^\w(]+", "", line).strip()
            add_all(item.split(":", 1)[1] if ":" in item else item)
    return skills


@dataclass
class FreeTextCvParser:
    today: date = field(default_factory=date.today)

    def parse(self, candidate_id: str, vacancy_id: str, text: str) -> CandidateCv:
        lines = text.splitlines()
        periods = _work_periods(lines, self.today)
        skills = _technologies(lines)

        years_experience = round(_total_months(periods) / 12, 1) if periods else None

        return CandidateCv(
            candidate_id=candidate_id,
            vacancy_id=vacancy_id,
            years_experience=years_experience,
            skills=skills,
            raw_text=text.strip(),
            read_error=None if periods or skills else NO_INFORMATION,
        )

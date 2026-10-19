"""Escribe el reporte de screening en lote (todos los candidatos de una
vacante vs su JD) en un .xlsx con dos pestanas.

'Coincidencias': candidatos con score >= umbral, con su score y los
requisitos que cumplieron. 'Descartados': el resto, con lo que les falta.

No sabe nada de MatchEvaluation: recibe filas ya armadas (dict) por quien
orquesta el reporte (ver talent_acquisition_screening_report_create en
interfaces/mcp/tools.py). Mismo patron que
payroll/infrastructure/reports/excel_match_report_writer.py.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.worksheet.worksheet import Worksheet

_HEADERS = ("candidate_id", "score", "matched_requirements", "missing_requirements")

_HEADER_LABELS: dict[str, str] = {
    "candidate_id": "Candidato",
    "score": "Score",
    "matched_requirements": "Requisitos cumplidos",
    "missing_requirements": "Requisitos faltantes",
}


class ExcelScreeningReportWriter:
    def write(
        self,
        *,
        vacancy_id: str,
        matched_rows: list[dict[str, Any]],
        discarded_rows: list[dict[str, Any]],
        output_dir: str | Path,
        filename: str | None = None,
    ) -> Path:
        # expanduser() + resolve(): acepta "~/Desktop/reportes" o una ruta
        # relativa y siempre devuelve una ruta absoluta sin ambiguedad --
        # importante corriendo como MCP server, donde el cwd del proceso
        # no es necesariamente donde el usuario espera encontrar el archivo.
        output_dir = Path(output_dir).expanduser().resolve()
        output_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        filename = filename or f"screening_report_{vacancy_id}_{timestamp}.xlsx"
        output_path = output_dir / filename

        workbook = Workbook()
        matched_sheet = workbook.active
        matched_sheet.title = "Coincidencias"
        _write_sheet(matched_sheet, matched_rows)

        discarded_sheet = workbook.create_sheet("Descartados")
        _write_sheet(discarded_sheet, discarded_rows)

        workbook.save(output_path)
        return output_path


def _write_sheet(sheet: Worksheet, rows: list[dict[str, Any]]) -> None:
    sheet.append([_HEADER_LABELS[key] for key in _HEADERS])
    for cell in sheet[1]:
        cell.font = Font(bold=True)

    for row in rows:
        sheet.append([_excel_safe(row.get(key)) for key in _HEADERS])

    for column_cells in sheet.columns:
        lengths = [len(str(cell.value)) for cell in column_cells if cell.value is not None]
        width = min(max(lengths, default=10) + 2, 60)
        sheet.column_dimensions[column_cells[0].column_letter].width = width


def _excel_safe(value: Any) -> Any:
    """openpyxl no acepta listas en una celda -- matched/missing_requirements
    son list[str] en MatchEvaluation."""
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return value

"""Saca el texto plano de un documento (PDF, Word, Markdown o texto).

Solo convierte formato: no interpreta nada. El texto resultante lo
estructuran los parsers (JD hoy, CV manana). En Word, los titulos se
devuelven como "# titulo" (igual que en Markdown), los items de lista como
"- item" y las filas de tabla como "celda | celda", para que los parsers vean
la misma forma sin importar de que formato vino el documento.
"""

from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.document import Document as DocxDocument
from docx.table import Table
from docx.text.paragraph import Paragraph
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from ...domain.prescreening import DocumentUnreadableError, UnsupportedDocumentFormatError

SUPPORTED_EXTENSIONS = (".pdf", ".docx", ".md", ".txt")


def _read_plain_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _read_pdf(path: Path) -> str:
    try:
        reader = PdfReader(path)
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except PdfReadError as exc:
        raise DocumentUnreadableError(path.name, "el PDF esta danado") from exc


def _docx_paragraph_text(paragraph: Paragraph) -> str:
    text = paragraph.text.strip()
    if not text:
        return ""
    p_pr = paragraph._p.pPr
    style_id = p_pr.pStyle.val if p_pr is not None and p_pr.pStyle is not None else ""
    if style_id.lower().startswith(("heading", "titulo", "título")):
        return f"# {text}"  # igual que un titulo de Markdown
    # La lista puede venir de la numeracion del parrafo o del estilo ("List Bullet").
    if (p_pr is not None and p_pr.numPr is not None) or style_id.lower().startswith("list"):
        return f"- {text}"
    return text


def _read_docx(path: Path) -> str:
    try:
        document: DocxDocument = Document(str(path))
    except Exception as exc:  # python-docx no expone un error propio de archivo invalido
        raise DocumentUnreadableError(path.name, "el Word esta danado") from exc

    # Se recorre el cuerpo en orden para que tablas y parrafos no se desordenen.
    lines: list[str] = []
    for element in document.element.body.iterchildren():
        tag = element.tag.rsplit("}", 1)[-1]
        if tag == "p":
            lines.append(_docx_paragraph_text(Paragraph(element, document)))
        elif tag == "tbl":
            for row in Table(element, document).rows:
                cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
                lines.append(" | ".join(c for c in cells if c))
    return "\n".join(lines)


_READERS = {
    ".pdf": _read_pdf,
    ".docx": _read_docx,
    ".md": _read_plain_text,
    ".txt": _read_plain_text,
}


def extract_text(path: Path) -> str:
    """Devuelve el texto del documento o lanza un error de dominio claro."""
    reader = _READERS.get(path.suffix.lower())
    if reader is None:
        raise UnsupportedDocumentFormatError(path.name)
    text = reader(path)
    if not text.strip():
        raise DocumentUnreadableError(path.name, "no contiene texto (¿PDF escaneado?)")
    return text

// Extractos de código REAL de talent_acquisition/. Los archivos .py se importan
// tal cual (?raw) y se recortan por nombre de función o clase: nada se copia a
// mano, y si una función cambia de nombre el build falla en vez de mentir.

import folderAdapter from '../../../talent_acquisition/infrastructure/folder_source/folder_vacancy_source_adapter.py?raw';
import textExtractor from '../../../talent_acquisition/infrastructure/text_extraction/document_text_extractor.py?raw';
import cvParser from '../../../talent_acquisition/infrastructure/parsers/free_text_cv_parser.py?raw';
import scorerPort from '../../../talent_acquisition/application/ports/candidate_match_scorer_port.py?raw';
import sourcePort from '../../../talent_acquisition/application/ports/vacancy_source_port.py?raw';
import evaluateMatch from '../../../talent_acquisition/application/use_cases/evaluate_candidate_match.py?raw';
import rankCandidates from '../../../talent_acquisition/application/use_cases/rank_candidates.py?raw';
import detectInconsistencies from '../../../talent_acquisition/application/use_cases/detect_cv_inconsistencies.py?raw';
import screeningReport from '../../../talent_acquisition/application/use_cases/generate_screening_report.py?raw';
import conversation from '../../../talent_acquisition/application/use_cases/build_prescreening_conversation.py?raw';
import handoff from '../../../talent_acquisition/application/use_cases/generate_interview_handoff.py?raw';
import domain from '../../../talent_acquisition/domain/prescreening.py?raw';
import typesafeAdapter from '../../../talent_acquisition/infrastructure/scoring/typesafe_match_scorer_adapter.py?raw';
import scorerFactory from '../../../talent_acquisition/infrastructure/scoring/match_scorer_factory.py?raw';
import excelWriter from '../../../talent_acquisition/infrastructure/reports/excel_screening_report_writer.py?raw';
import mcpTools from '../../../talent_acquisition/interfaces/mcp/tools.py?raw';

const FILES = {
  'infrastructure/folder_source/folder_vacancy_source_adapter.py': folderAdapter,
  'infrastructure/text_extraction/document_text_extractor.py': textExtractor,
  'infrastructure/parsers/free_text_cv_parser.py': cvParser,
  'application/ports/candidate_match_scorer_port.py': scorerPort,
  'application/ports/vacancy_source_port.py': sourcePort,
  'application/use_cases/evaluate_candidate_match.py': evaluateMatch,
  'application/use_cases/rank_candidates.py': rankCandidates,
  'application/use_cases/detect_cv_inconsistencies.py': detectInconsistencies,
  'application/use_cases/generate_screening_report.py': screeningReport,
  'application/use_cases/build_prescreening_conversation.py': conversation,
  'application/use_cases/generate_interview_handoff.py': handoff,
  'domain/prescreening.py': domain,
  'infrastructure/scoring/typesafe_match_scorer_adapter.py': typesafeAdapter,
  'infrastructure/scoring/match_scorer_factory.py': scorerFactory,
  'infrastructure/reports/excel_screening_report_writer.py': excelWriter,
  'interfaces/mcp/tools.py': mcpTools,
} as const;

export type SourceFile = keyof typeof FILES;

export interface Excerpt {
  id: string;
  file: SourceFile;
  title: string;
  /** Pares [número de línea real, texto]. Puede tener huecos (docstrings omitidos). */
  lines: [number, string][];
}

interface Spec {
  file: SourceFile;
  /** Función, método o clase a extraer. */
  symbol?: string;
  /** Alternativa: rango entre la primera línea que contiene `from` y la que contiene `to`. */
  from?: string;
  to?: string;
  /** Quita el docstring de la función para que el extracto sea corto. */
  dropDocstring?: boolean;
  /** Nombre de la pestaña (por defecto, el símbolo o el archivo). */
  title?: string;
}

function sourceLines(file: SourceFile): string[] {
  return FILES[file].replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
}

const indentOf = (line: string) => line.length - line.trimStart().length;

function symbolRange(lines: string[], symbol: string): [number, number] {
  const header = new RegExp(`^\\s*(async\\s+)?(def|class)\\s+${symbol}\\b`);
  let start = lines.findIndex((line) => header.test(line));
  if (start === -1) throw new Error(`No existe ${symbol} en el código`);
  const defIndent = indentOf(lines[start]);
  while (start > 0 && lines[start - 1].trim().startsWith('@')) start -= 1;

  // La firma puede ocupar varias líneas: termina cuando se cierran los paréntesis.
  let i = lines.findIndex((line) => header.test(line));
  let depth = 0;
  for (; i < lines.length; i += 1) {
    for (const char of lines[i]) {
      if (char === '(' || char === '[') depth += 1;
      if (char === ')' || char === ']') depth -= 1;
    }
    if (depth <= 0 && lines[i].trimEnd().endsWith(':')) break;
  }
  let end = i;
  for (let j = i + 1; j < lines.length; j += 1) {
    if (lines[j].trim() === '') continue;
    if (indentOf(lines[j]) <= defIndent) break;
    end = j;
  }
  return [start, end];
}

function dropDocstring(numbered: [number, string][], bodyStart: number): [number, string][] {
  const first = numbered.findIndex(([n, text]) => n > bodyStart && text.trim() !== '');
  if (first === -1) return numbered;
  const text = numbered[first][1].trim();
  const quote = text.startsWith('"""') ? '"""' : text.startsWith("'''") ? "'''" : null;
  if (!quote) return numbered;
  let last = first;
  if (!(text.length > 3 && text.endsWith(quote))) {
    last = numbered.findIndex(([, t], idx) => idx > first && t.includes(quote));
  }
  return [...numbered.slice(0, first), ...numbered.slice(last + 1)];
}

function build(id: string, spec: Spec): Excerpt {
  const lines = sourceLines(spec.file);
  let start: number;
  let end: number;
  if (spec.symbol) {
    [start, end] = symbolRange(lines, spec.symbol);
  } else {
    start = lines.findIndex((line) => line.includes(spec.from!));
    end = lines.findIndex((line, idx) => idx >= start && line.includes(spec.to!));
    if (start === -1 || end === -1) throw new Error(`Rango no encontrado en ${spec.file}`);
  }
  let numbered: [number, string][] = lines
    .slice(start, end + 1)
    .map((text, offset) => [start + offset + 1, text]);
  if (spec.dropDocstring && spec.symbol) {
    const header = numbered.findIndex(([, t]) => t.trimEnd().endsWith(':') && !t.trim().startsWith('@'));
    numbered = dropDocstring(numbered, numbered[Math.max(header, 0)][0]);
  }
  // Sangría común fuera, para que el extracto no empiece desplazado.
  const minIndent = Math.min(...numbered.filter(([, t]) => t.trim()).map(([, t]) => indentOf(t)));
  numbered = numbered.map(([n, t]) => [n, t.slice(Math.min(minIndent, indentOf(t)))]);
  return { id, file: spec.file, title: spec.title ?? spec.symbol ?? spec.file.split('/').pop()!, lines: numbered };
}

const SPECS: Record<string, Spec> = {
  // Oscar
  'jd.get': { file: 'infrastructure/folder_source/folder_vacancy_source_adapter.py', symbol: 'get_job_description' },
  'jd.find': { file: 'infrastructure/folder_source/folder_vacancy_source_adapter.py', symbol: '_find_job_description' },
  'jd.extract': { file: 'infrastructure/text_extraction/document_text_extractor.py', symbol: 'extract_text', dropDocstring: true },
  'jd.structured': { file: 'infrastructure/folder_source/folder_vacancy_source_adapter.py', symbol: '_parse_structured_jd' },
  'cv.list': { file: 'infrastructure/folder_source/folder_vacancy_source_adapter.py', symbol: 'list_candidate_cvs' },
  'cv.isfile': { file: 'infrastructure/folder_source/folder_vacancy_source_adapter.py', symbol: '_is_candidate_file' },
  'cv.read': { file: 'infrastructure/folder_source/folder_vacancy_source_adapter.py', symbol: '_read_cv' },
  'cv.pdf': { file: 'infrastructure/text_extraction/document_text_extractor.py', symbol: '_read_pdf' },
  'cv.periods': { file: 'infrastructure/parsers/free_text_cv_parser.py', symbol: '_work_periods', dropDocstring: true },
  'cv.months': { file: 'infrastructure/parsers/free_text_cv_parser.py', symbol: '_total_months', dropDocstring: true },
  'cv.tech': { file: 'infrastructure/parsers/free_text_cv_parser.py', symbol: '_technologies' },
  'cv.parse': { file: 'infrastructure/parsers/free_text_cv_parser.py', symbol: 'FreeTextCvParser' },
  // Randall
  'match.port': { file: 'application/ports/candidate_match_scorer_port.py', symbol: 'CandidateMatchScorerPort' },
  'match.covers': { title: 'EvaluateCandidateMatch', file: 'application/use_cases/evaluate_candidate_match.py', from: 'def _covers', to: 'missing_requirements=missing,' },
  'match.jev': { title: 'TypeSafeMatchScorerAdapter.execute', file: 'infrastructure/scoring/typesafe_match_scorer_adapter.py', symbol: 'execute' },
  'match.factory': { file: 'infrastructure/scoring/match_scorer_factory.py', symbol: 'build_match_scorer' },
  'match.rank': { file: 'application/use_cases/rank_candidates.py', symbol: 'RankCandidates' },
  'inc.detect': { title: 'DetectCvInconsistencies', file: 'application/use_cases/detect_cv_inconsistencies.py', from: '_YEARS_MENTION =', to: 'return CvInconsistencyReport' },
  // Stward
  'report.chain': { file: 'interfaces/mcp/tools.py', symbol: '_build_screening_report' },
  'report.unreadable': { file: 'domain/prescreening.py', symbol: 'unreadable_reason' },
  'report.rules': { title: 'GenerateScreeningReport', file: 'application/use_cases/generate_screening_report.py', from: '_ADVANCE_THRESHOLD =', to: 'matched_requirements=evaluation.matched_requirements' },
  'conv.build': { title: 'BuildPrescreeningConversation.execute', file: 'application/use_cases/build_prescreening_conversation.py', symbol: 'execute' },
  'conv.requirement': { file: 'application/use_cases/build_prescreening_conversation.py', symbol: '_requirement_question' },
  'conv.handoff': { title: 'GenerateInterviewHandoff.execute', file: 'application/use_cases/generate_interview_handoff.py', symbol: 'execute' },
  // Reporte Excel
  'excel.tool': { file: 'interfaces/mcp/tools.py', symbol: 'screening_report_create', dropDocstring: true },
  'excel.write': { file: 'infrastructure/reports/excel_screening_report_writer.py', symbol: 'write' },
};

const cache = new Map<string, Excerpt>();

export function excerpt(id: string): Excerpt {
  let found = cache.get(id);
  if (!found) {
    const spec = SPECS[id];
    if (!spec) throw new Error(`Extracto desconocido: ${id}`);
    found = build(id, spec);
    cache.set(id, found);
  }
  return found;
}

/** Número de línea real de la primera línea del extracto que contiene `needle`. */
export function lineOf(id: string, needle: string): number {
  const hit = excerpt(id).lines.find(([, text]) => text.includes(needle));
  if (!hit) throw new Error(`"${needle}" no aparece en el extracto ${id}`);
  return hit[0];
}

/** Valida al arrancar que todas las líneas citadas por las demos existen en el código. */
export function assertLines(refs: { excerpt: string; line: string }[]): void {
  for (const ref of refs) lineOf(ref.excerpt, ref.line);
}

/** Nombres de las tools registradas en interfaces/mcp/tools.py (@mcp.tool(name=...)). */
export function registeredTools(): string[] {
  return [...FILES['interfaces/mcp/tools.py'].matchAll(/@mcp\.tool\(name="([^"]+)"\)/g)].map((m) => m[1]);
}

/** Valores de una tupla de strings a nivel de módulo, p. ej. SUPPORTED_EXTENSIONS. */
export function tupleConstant(file: SourceFile, name: string): string[] {
  const match = FILES[file].match(new RegExp(String.raw`^${name}\s*=\s*\(([^)]*)\)`, 'm'));
  if (!match) throw new Error(`No existe la constante ${name} en ${file}`);
  return [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

/** Valor literal de una constante simple, p. ej. _ADVANCE_THRESHOLD = 0.7. */
export function scalarConstant(file: SourceFile, name: string): string {
  const match = FILES[file].match(new RegExp(String.raw`^${name}\s*=\s*(.+)$`, 'm'));
  if (!match) throw new Error(`No existe la constante ${name} en ${file}`);
  return match[1].trim();
}

/** Construye todos los extractos: si alguna función desapareció del código, falla al arrancar. */
export function validateExcerpts(): void {
  Object.keys(SPECS).forEach((id) => excerpt(id));
}

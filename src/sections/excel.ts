import { callCard } from '../components/call';
import { createDemo } from '../components/demo';
import { section, toolSheet } from '../components/layout';
import { h } from '../core/dom';
import { nameOf, who } from '../core/names';
import { baseName, findEvent, formatMs, formatRecordedAt, formatScore, traceUrl } from '../core/trace-loader';
import type { Step } from '../core/trace-player';
import type { ScreeningReportBatchResult, Traces } from '../core/types';
import { howExcel } from './how';
import type { Sheet } from '../core/xlsx';

export interface ExcelData {
  sheets: Sheet[];
  fileName: string;
  url: string;
}

export function excelUrl(traces: Traces): { fileName: string; url: string } {
  const event = findEvent(traces.excel, (e) => !e.is_error, 'reporte Excel');
  const fileName = baseName((event.result as ScreeningReportBatchResult).file_path);
  return { fileName, url: traceUrl(`excel/${fileName}`) };
}

function sheetTable(sheet: Sheet): HTMLElement {
  const [header, ...rows] = sheet.rows;
  return h(
    'div.table-wrap.xlsx-table',
    {},
    h(
      'table.data',
      {},
      h('thead', {}, h('tr', {}, ...header.map((cell, i) => h(i === 1 ? 'th.num' : 'th', {}, cell)))),
      h(
        'tbody',
        {},
        ...rows.map((row) =>
          h('tr', {}, ...header.map((_, i) => h(i === 1 ? 'td.num.mono' : i === 0 ? 'td.mono' : 'td.xlsx-list', {}, row[i] ?? ''))),
        ),
      ),
    ),
  );
}

function preview(data: ExcelData): HTMLElement {
  const panes = data.sheets.map((sheet) => sheetTable(sheet));
  const tabs = data.sheets.map((sheet, i) => {
    const tab = h('button.sheet-tab', { type: 'button', role: 'tab', 'aria-selected': String(i === 0) }, `${sheet.name} (${sheet.rows.length - 1})`);
    tab.addEventListener('click', () => {
      tabs.forEach((t, j) => t.setAttribute('aria-selected', String(j === i)));
      panes.forEach((p, j) => (p.hidden = j !== i));
    });
    return tab;
  });
  panes.forEach((p, j) => (p.hidden = j !== 0));
  return h(
    'div.xlsx',
    {},
    h(
      'div.xlsx-head',
      {},
      h('p.mono.xlsx-name', {}, data.fileName),
      h('a.btn', { href: data.url, download: data.fileName }, 'Descargar el Excel real'),
    ),
    ...panes,
    h('div.sheet-tabs', { role: 'tablist', 'aria-label': 'Pestañas del Excel' }, ...tabs),
  );
}

export function excelReport(traces: Traces, data: ExcelData): HTMLElement[] {
  const event = findEvent(traces.excel, (e) => !e.is_error, 'reporte Excel');
  const result = event.result as ScreeningReportBatchResult;
  const recordedAt = formatRecordedAt(traces.index.recorded_at);
  const [matchedSheet, discardedSheet] = data.sheets;
  type Row = { id: string; score: number; matched: boolean };
  const toRows = (sheet: Sheet, matched: boolean): Row[] => sheet.rows.slice(1).map((r) => ({ id: r[0], score: Number(r[1]), matched }));
  // La tool evalúa en el orden de la carpeta (nombres de archivo ordenados).
  const rows = [...toRows(matchedSheet, true), ...toRows(discardedSheet, false)].sort((a, b) => (a.id < b.id ? -1 : 1));
  const perCandidate = Math.round(event.duration_ms / rows.length);

  const demo = createDemo({
    label: 'Demo: el reporte en Excel',
    recordedAt,
    build: () => {
      const steps: Step[] = [
        { label: `Se piden todos los candidatos de la vacante en un Excel. Mínimo para coincidir: ${formatScore(result.threshold)}.`, realMs: event.duration_ms, code: { excerpt: 'excel.tool', line: 'effective_threshold = (' } },
        ...rows.map((row) => ({
          label: `${nameOf(row.id)}: nota ${formatScore(row.score)}, va a ${row.matched ? matchedSheet.name : discardedSheet.name}.`,
          code: { excerpt: 'excel.tool', line: row.matched ? 'matched_rows.append(row)' : 'discarded_rows.append(row)' },
          dwellMs: 520,
        })),
        { label: 'Escribe el archivo con dos pestañas.', code: { excerpt: 'excel.write', line: 'matched_sheet.title = "Coincidencias"' } },
        {
          label: `Listo: ${result.matched_count} coincidencias y ${result.discarded_count} descartados, en ${formatMs(event.duration_ms)}.`,
          code: { excerpt: 'excel.write', line: 'workbook.save(output_path)' },
          hold: 1200,
        },
      ];
      const last = steps.length - 1;
      const card = (row: Row, i: number) =>
        h('li.xcard', { 'data-step': rows.indexOf(row) + 1, style: `--i:${i}` }, h('span.xcard-id', {}, who(row.id)), h('span.mono.xcard-score', {}, formatScore(row.score)));
      const column = (title: string, list: Row[], kind: string) =>
        h(`div.xcol.xcol-${kind}`, {}, h('p.xcol-title', {}, title, h('span.xcol-count.mono', {}, String(list.length))), h('ol.xcards', {}, ...list.map(card)));

      const stage = h(
        'div.excel-stage',
        {},
        callCard(event, 0, 'Calificar a todos los candidatos y guardar el resultado en Excel'),
        h(
          'div.xcols',
          {},
          column(`${matchedSheet.name} (nota ≥ ${formatScore(result.threshold)})`, rows.filter((r) => r.matched), 'ok'),
          column(discardedSheet.name, rows.filter((r) => !r.matched), 'muted'),
        ),
        h(
          'div.result-strip',
          { 'data-step': last },
          h('div.stat', {}, h('span.stat-n', {}, result.matched_count), h('span.stat-l', {}, 'coincidencias')),
          h('div.stat', {}, h('span.stat-n', {}, result.discarded_count), h('span.stat-l', {}, 'descartados')),
          h('div.stat', {}, h('span.stat-n', {}, formatMs(event.duration_ms)), h('span.stat-l', {}, `para ${rows.length} CVs (unos ${perCandidate} ms cada uno)`)),
        ),
      );
      return { stage, steps, excerpts: ['excel.tool', 'excel.write'] };
    },
  });

  return toolSheet({
    id: 'excel',
    chapter: 'Excel',
    kicker: 'Toda la vacante · Reporte en Excel',
    title: 'Toda la vacante en un Excel',
    lead: 'Con un solo pedido se califica a todos los candidatos y se entrega un Excel listo para trabajar.',
    task: 'talent_acquisition_screening_report_create',
    tools: [event.tool],
    simple: {
      receives: 'La vacante, con todos sus CVs.',
      does: `Califica a cada candidato y lo separa según llegue o no al mínimo (${formatScore(result.threshold)}).`,
      delivers: `Un Excel con dos pestañas: ${matchedSheet.name}, con lo que cumplen, y ${discardedSheet.name}, con lo que les falta.`,
    },
    why: 'el resultado de toda la vacante queda en un archivo que se puede filtrar, compartir y guardar.',
    under: [
      h('span', {}, 'Tool ', h('code', {}, 'screening_report_create'), ' en interfaces/mcp/tools.py; escribe con ', h('code', {}, 'ExcelScreeningReportWriter.write'), '.'),
      'Evalúa a cada uno con el scorer configurado (Jev en la traza).',
      'El umbral sale de TALENT_ACQUISITION_MATCH_THRESHOLD (0.7 de fábrica) o del argumento threshold.',
      'Devuelve la ruta del archivo, cuántos coinciden y cuántos se descartan.',
    ],
    demo: demo.el,
    demoTitle: 'Los 20 candidatos, uno por uno, a su pestaña',
    how: howExcel(traces, data),
    slides: [
      section(
        { id: 'excel-archivo', chapter: 'El archivo', kicker: 'Toda la vacante · Reporte en Excel', title: 'El Excel real que generó la herramienta', compact: true },
        h('div', { 'data-reveal': '' }, preview(data)),
      ),
    ],
  });
}

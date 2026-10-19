// Texto de un documento (raw_text de la traza) con marcas que se encienden en
// un paso dado del reproductor (data-step).

import { h } from '../core/dom';

export interface Mark {
  /** Texto exacto o expresión regular (con /g marca todas las apariciones). */
  find: string | RegExp;
  step: number;
  kind?: 'accent' | 'ok' | 'warn' | 'bad';
  /** Marca la línea completa donde aparece. */
  wholeLine?: boolean;
}

/** El extractor de PDF deja viñetas como el carácter DEL (0x7f); se muestran como "•". */
export function cleanText(text: string): string {
  return text.replace(/\u007f/g, '•');
}

export function docText(raw: string, marks: Mark[], label: string): HTMLElement {
  const text = cleanText(raw);
  const ranges: { start: number; end: number; mark: Mark }[] = [];
  for (const mark of marks) {
    const hits: [number, number][] = [];
    if (typeof mark.find === 'string') {
      const at = text.indexOf(mark.find);
      if (at !== -1) hits.push([at, at + mark.find.length]);
    } else {
      const regex = new RegExp(mark.find.source, mark.find.flags.includes('g') ? mark.find.flags : `${mark.find.flags}g`);
      for (const m of text.matchAll(regex)) {
        hits.push([m.index!, m.index! + m[0].length]);
        if (!mark.find.flags.includes('g')) break;
      }
    }
    for (let [start, end] of hits) {
      if (mark.wholeLine) {
        start = text.lastIndexOf('\n', start - 1) + 1;
        const nl = text.indexOf('\n', end);
        end = nl === -1 ? text.length : nl;
      }
      if (!ranges.some((r) => start < r.end && end > r.start)) ranges.push({ start, end, mark });
    }
  }
  ranges.sort((a, b) => a.start - b.start);

  const pre = h('pre.doc-text', { 'aria-label': label });
  let cursor = 0;
  for (const range of ranges) {
    pre.append(text.slice(cursor, range.start));
    pre.append(h('mark.doc-mark', { 'data-step': range.mark.step, class: `mark-${range.mark.kind ?? 'accent'}` }, text.slice(range.start, range.end)));
    cursor = range.end;
  }
  pre.append(text.slice(cursor));
  return pre;
}

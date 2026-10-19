// Nombres legibles de los candidatos. El candidate_id es el nombre del archivo
// (sin tildes ni eñes: "AI02_Mateo_Cede_o"); el nombre real es la primera línea
// del texto del CV en la traza ("Mateo Cedeño").

import { h } from './dom';
import type { CandidateCv } from './types';

const names = new Map<string, string>();

export function setCandidateNames(cvs: CandidateCv[]): void {
  for (const cv of cvs) {
    const first = cv.raw_text.split('\n')[0]?.trim();
    if (first && first.length < 60) names.set(cv.candidate_id, first);
  }
}

/** Nombre real si se conoce; si no, el id sin prefijo y con espacios. */
export function nameOf(id: string): string {
  return names.get(id) ?? id.replace(/^[A-Z]{2}\d{2}_/, '').replace(/_/g, ' ');
}

/** Nombre en vista simple; candidate_id en vista técnica. */
export function who(id: string, tag: 'span' | 'code' = 'span'): HTMLElement {
  return h(`${tag}.who`, {}, h('span.plain-only', {}, nameOf(id)), h('span.tech-only.mono', {}, id));
}

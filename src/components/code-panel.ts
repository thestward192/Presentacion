// Panel derecho del walkthrough: extracto real con resaltado y línea activa.

import { excerpt, lineOf } from '../code/excerpts';
import { h } from '../core/dom';
import { highlightPython } from '../core/highlight';

export interface CodePanel {
  el: HTMLElement;
  show(excerptId: string, needle?: string): void;
  setExcerpts(ids: string[]): void;
}

export function createCodePanel(ids: string[]): CodePanel {
  const tabs = h('div.code-tabs', { role: 'tablist', 'aria-label': 'Archivos de código' });
  const path = h('div.code-path.mono');
  const body = h('div.code-body', { tabindex: 0, 'aria-label': 'Extracto de código' });
  const el = h('figure.code-panel', {}, h('div.code-head', {}, tabs, path), body);

  const views = new Map<string, { pre: HTMLElement; rows: Map<number, HTMLElement> }>();
  let current = '';

  function view(id: string) {
    let found = views.get(id);
    if (found) return found;
    const ex = excerpt(id);
    const html = highlightPython(ex.lines.map(([, text]) => text));
    const rows = new Map<number, HTMLElement>();
    const pre = h('pre.code', { 'data-excerpt': id });
    let previous = ex.lines[0]?.[0] ?? 0;
    ex.lines.forEach(([number], i) => {
      if (number > previous + 1) pre.append(h('span.code-gap', { 'aria-hidden': 'true' }, h('span.ln', {}, ''), h('span.lc', {}, '...')));
      previous = number;
      const row = h('span.code-line', {}, h('span.ln', { 'aria-hidden': 'true' }, number), h('span.lc', { html: html[i] }));
      rows.set(number, row);
      pre.append(row);
    });
    found = { pre, rows };
    views.set(id, found);
    return found;
  }

  function setExcerpts(list: string[]): void {
    tabs.replaceChildren(
      ...list.map((id) =>
        h(
          'button.code-tab.mono',
          { type: 'button', role: 'tab', 'data-id': id, 'aria-selected': String(id === current) },
          excerpt(id).title,
        ),
      ),
    );
    tabs.hidden = list.length < 2;
    tabs.querySelectorAll<HTMLButtonElement>('.code-tab').forEach((tab) =>
      tab.addEventListener('click', () => show(tab.dataset.id!)),
    );
    if (!list.includes(current)) show(list[0]);
  }

  function show(id: string, needle?: string): void {
    const v = view(id);
    const switched = current !== id;
    if (switched) {
      current = id;
      body.replaceChildren(v.pre);
      path.textContent = `talent_acquisition/${excerpt(id).file}`;
      tabs.querySelectorAll<HTMLElement>('.code-tab').forEach((tab) =>
        tab.setAttribute('aria-selected', String(tab.dataset.id === id)),
      );
    }
    v.pre.querySelectorAll('.is-active').forEach((row) => row.classList.remove('is-active'));
    if (!needle) return;
    const row = v.rows.get(lineOf(id, needle));
    if (!row) return;
    row.classList.add('is-active');
    // Desplaza solo el panel, nunca la página.
    const top = Math.max(0, row.offsetTop - body.clientHeight / 2 + row.clientHeight / 2);
    const far = Math.abs(top - body.scrollTop) > body.clientHeight;
    body.scrollTo({ top, behavior: switched || far ? 'auto' : 'smooth' });
  }

  setExcerpts(ids);
  return { el, show, setExcerpts };
}

/** Fragmento corto y estático: solo las líneas del extracto que contienen cada aguja. */
export function codeSnippet(excerptId: string, needles: string[]): HTMLElement {
  const ex = excerpt(excerptId);
  const picked = needles.map((needle) => {
    const number = lineOf(excerptId, needle);
    return ex.lines.find(([n]) => n === number)!;
  });
  const minIndent = Math.min(...picked.map(([, t]) => t.length - t.trimStart().length));
  const html = highlightPython(picked.map(([, t]) => t.slice(minIndent)));
  const pre = h('pre.code.code-snippet');
  let previous = -1;
  picked.forEach(([number], i) => {
    if (previous !== -1 && number > previous + 1) pre.append(h('span.code-gap', { 'aria-hidden': 'true' }, h('span.ln', {}, ''), h('span.lc', {}, '...')));
    previous = number;
    pre.append(h('span.code-line', {}, h('span.ln', { 'aria-hidden': 'true' }, number), h('span.lc', { html: html[i] })));
  });
  return h('figure.snippet', {}, h('figcaption.code-path.mono', {}, `talent_acquisition/${ex.file}`), pre);
}

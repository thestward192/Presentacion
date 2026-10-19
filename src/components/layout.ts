// Piezas de maquetación: bloques a pantalla completa (slides), ficha de tool
// dividida en bloques, portada de cada responsable y etiquetas de estado.

import { h, s } from '../core/dom';
import type { Recommendation } from '../core/types';

type Child = Node | null | undefined | false;

/** Un bloque a pantalla completa. El contenido se ajusta al alto disponible. */
export function slide(o: { id: string; title: string; className?: string }, ...children: Child[]): HTMLElement {
  return h(
    'section.slide',
    { id: o.id, class: o.className, 'data-title': o.title, 'aria-label': o.title },
    h('div.slide-viewport', {}, h('div.slide-inner', {}, ...children.filter(Boolean) as Node[])),
  );
}

export interface SectionOptions {
  id: string;
  /** Nombre corto del bloque (indicador lateral). */
  chapter: string;
  kicker?: string;
  title: string;
  lead?: string;
  className?: string;
  /** Encabezado compacto, para bloques con demos o gráficos grandes. */
  compact?: boolean;
}

export function sectionHead(o: { id: string; kicker?: string; title: string; lead?: string; compact?: boolean }): HTMLElement {
  return h(
    'header.section-head',
    { class: o.compact ? 'is-compact' : '', 'data-reveal': '' },
    o.kicker ? h('p.kicker', {}, o.kicker) : null,
    h(o.compact ? 'h3' : 'h2', { id: `${o.id}-title`, class: 'head-title' }, o.title),
    o.lead ? h('p.lead', {}, o.lead) : null,
  );
}

export function section(o: SectionOptions, ...children: Child[]): HTMLElement {
  return slide({ id: o.id, title: o.chapter, className: o.className }, sectionHead(o), ...children);
}

export interface ToolSheetOptions {
  id: string;
  chapter: string;
  /** Nombre corto de la tarea, en simple ("Paso 1 · Leer la vacante"). */
  kicker: string;
  title: string;
  lead: string;
  owner?: string;
  /** Nombre técnico de la tarea y tools MCP (solo vista técnica). */
  task: string;
  tools: string[];
  simple: { receives: string; does: string; delivers: string };
  why: string;
  under: (string | Node)[];
  demo: HTMLElement;
  /** Título de la demo, en simple. */
  demoTitle?: string;
  demoExtra?: HTMLElement[];
  introExtra?: HTMLElement[];
  failCase?: HTMLElement;
  /** Animación "cómo se arma", justo después de la presentación. */
  how?: HTMLElement;
  slides?: HTMLElement[];
}

/** Una ficha de tool en bloques: presentación, demo, caso que falla y extras. */
export function toolSheet(o: ToolSheetOptions): HTMLElement[] {
  const ownerLine = h(
    'p.owner-line',
    { 'data-reveal': '' },
    o.owner ? h('span.owner-chip', {}, h('span.owner-dot', { 'aria-hidden': 'true' }), o.owner) : null,
    h('span.tech-only', {}, 'Tarea: ', h('code', {}, o.task)),
    h('span.tech-only', {}, o.tools.length > 1 ? 'Tools MCP: ' : 'Tool MCP: ', ...o.tools.flatMap((tool, i) => [i ? ', ' : '', h('code.tool-name', {}, tool)])),
  );
  const flow = h(
    'ol.simple-flow',
    { 'aria-label': 'Cómo funciona, en simple' },
    h('li', { 'data-reveal': '' }, h('span.sf-n', {}, '1'), h('div', {}, h('p.sf-k', {}, 'Recibe'), h('p.sf-t', {}, o.simple.receives))),
    h('li', { 'data-reveal': '' }, h('span.sf-n', {}, '2'), h('div', {}, h('p.sf-k', {}, 'Hace'), h('p.sf-t', {}, o.simple.does))),
    h('li', { 'data-reveal': '' }, h('span.sf-n', {}, '3'), h('div', {}, h('p.sf-k', {}, 'Entrega'), h('p.sf-t', {}, o.simple.delivers))),
  );
  const why = h('p.why', { 'data-reveal': '' }, h('strong', {}, 'Para el reclutador'), o.why);
  const tech = h('div.tech-details.tech-only', { 'data-reveal': '' }, h('h3', {}, 'Detalle técnico'), h('ul.ticks', {}, ...o.under.map((item) => h('li', {}, item))));

  const intro = slide(
    { id: o.id, title: o.chapter, className: 'slide-sheet' },
    h(
      'div.sheet-hero',
      {},
      h('div.sheet-left', {}, sectionHead({ id: o.id, kicker: o.kicker, title: o.title, lead: o.lead }), ownerLine, why),
      h('div.sheet-right', {}, flow),
    ),
    tech,
    ...(o.introExtra ?? []),
  );

  titleDemo(o.demo, o.kicker, o.demoTitle ?? 'Míralo funcionar con datos reales');
  const demo = slide(
    { id: `${o.id}-demo`, title: `${o.chapter}: demo`, className: 'slide-demo' },
    h('div.demo-host', { 'data-reveal': '' }, o.demo),
    ...(o.demoExtra ?? []),
  );

  const fail = o.failCase
    ? slide(
        { id: `${o.id}-falla`, title: `${o.chapter}: si algo sale mal`, className: 'slide-fail' },
        sectionHead({ id: `${o.id}-falla`, kicker: o.kicker, title: 'Cuando algo sale mal', compact: true }),
        o.failCase,
      )
    : null;

  return [intro, ...(o.how ? [o.how] : []), demo, ...(fail ? [fail] : []), ...(o.slides ?? [])];
}

/** Pone kicker y título en la barra superior de una demo. */
export function titleDemo(demo: HTMLElement, kicker: string, title: string): void {
  demo.querySelector('.demo-heading')?.replaceChildren(h('p.demo-kicker', {}, kicker), h('h3.demo-title', {}, title));
}

export function failCase(title: string, ...children: (Node | string)[]): HTMLElement {
  return h('div.fail-case', { 'data-reveal': '' }, h('p.fail-title', {}, title), ...children);
}

/** Portada de cada responsable: abre su página. */
export function heroSlide(o: { id: string; number: string; name: string; role: string; tasks: string[]; techTasks: string[] }): HTMLElement {
  const line = s(
    'svg',
    { class: 'hero-line', viewBox: '0 0 600 40', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    s('path', { d: 'M0 20 C 150 0, 300 40, 450 20 S 590 10, 600 20', pathLength: 1 }),
  );
  return slide(
    { id: o.id, title: o.name, className: 'slide-hero' },
    h('p.hero-number', { 'data-reveal': '', 'aria-hidden': 'true' }, o.number),
    h('p.kicker', { 'data-reveal': '' }, o.role),
    h('h2.hero-name', { 'data-reveal': '' }, ...o.name.split(' ').map((word, i) => h('span.hero-word', { style: `--w:${i}` }, word))),
    h('div', { 'data-reveal': '' }, line),
    h(
      'ul.hero-tasks',
      { 'data-reveal': '' },
      ...o.tasks.map((task, i) => h('li', {}, h('span.plain-only', {}, task), h('code.tech-only', {}, o.techTasks[i] ?? task))),
    ),
  );
}

const STATUS_LABEL: Record<Recommendation, string> = {
  avanzar: 'avanzar',
  revisar: 'revisar',
  descartar: 'descartar',
  no_procesable: 'no procesable',
};

export function statusPill(status: Recommendation): HTMLElement {
  return h(`span.pill.pill-${status}`, {}, STATUS_LABEL[status]);
}

export function toggle<T extends string>(
  label: string,
  options: { value: T; text: string }[],
  initial: T,
  onChange: (value: T) => void,
): { el: HTMLElement; set(value: T): void } {
  const el = h('div.toggle', { role: 'radiogroup', 'aria-label': label }, h('span.toggle-label', {}, label));
  const buttons = options.map((option) => {
    const button = h('button.toggle-btn', { type: 'button', role: 'radio', 'data-value': option.value }, option.text);
    button.addEventListener('click', () => {
      set(option.value);
      onChange(option.value);
    });
    el.append(button);
    return button;
  });
  function set(value: T) {
    buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === value)));
  }
  set(initial);
  return { el, set };
}

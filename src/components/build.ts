// Animación "cómo se arma la herramienta": a la izquierda lo que recibe, al
// centro la herramienta que se va armando pieza por pieza y a la derecha lo
// que entrega. Solo avanza al tocar un botón.
//
// Cada elemento del escenario declara cuándo cambia:
//   data-at="n"    aparece desde el paso n
//   data-cur="n m" se resalta en los pasos n y m
//   data-off="n"   se apaga desde el paso n
//   data-upto="n"  desaparece después del paso n
//   data-mark="n"  queda marcado desde el paso n
//   data-count     número que cuenta hacia arriba al aparecer (data-to, data-dec)
// Dibujar el paso i es solo alternar clases: avanzar y retroceder da lo mismo.

import { h } from '../core/dom';
import { prefersReducedMotion } from '../core/motion';

export interface BuildStep {
  /** Nombre corto de la pieza que se agrega a la herramienta. */
  piece: string;
  title: string;
  text: string;
}

export interface BuildOptions {
  /** Nombre de la herramienta, en simple. */
  tool: string;
  /** Rótulo sobre el nombre (por defecto "Herramienta"). */
  toolKicker?: string;
  steps: BuildStep[];
  /** 'pipe': recibe | herramienta | entrega. 'wide': piezas arriba y un escenario ancho. */
  layout?: 'pipe' | 'wide';
  input?: { title: string; body: HTMLElement };
  output?: { title: string; body: HTMLElement };
  stage?: HTMLElement;
  hint?: string;
  onStep?: (step: number, root: HTMLElement) => void;
}

const has = (list: string | undefined, n: number) => (list ?? '').split(' ').filter(Boolean).map(Number).includes(n);

function countUp(el: HTMLElement, on: boolean): void {
  const to = Number(el.dataset.to ?? 0);
  const dec = Number(el.dataset.dec ?? 0);
  const fmt = (v: number) => v.toLocaleString('es', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  if (!on) {
    el.textContent = fmt(0);
    el.dataset.done = '';
    return;
  }
  if (el.dataset.done === '1') return;
  el.dataset.done = '1';
  if (prefersReducedMotion()) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const dur = Number(el.dataset.ms ?? 900);
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    el.textContent = fmt(to * (1 - Math.pow(1 - t, 3)));
    if (t < 1 && el.dataset.done === '1') requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function buildAnim(o: BuildOptions): HTMLElement {
  const total = o.steps.length;
  const pieces = o.steps.map((step, i) =>
    h('li.bt-piece', { 'data-n': i + 1, style: `--i:${i}` }, h('span.bt-piece-n', {}, String(i + 1)), h('span.bt-piece-t', {}, step.piece)),
  );
  const tool = h(
    'div.bt-tool',
    {},
    h('div.bt-tool-head', {}, h('span.bt-gear', { 'aria-hidden': 'true' }), h('div', {}, h('p.bt-tool-k', {}, o.toolKicker ?? 'Herramienta'), h('p.bt-tool-name', {}, o.tool))),
    h('ol.bt-pieces', { 'aria-label': 'Piezas de la herramienta' }, ...pieces),
    h('p.bt-tool-ready', {}, 'Herramienta lista'),
  );
  const wire = (dir: string) => h(`div.bt-wire.bt-wire-${dir}`, { 'aria-hidden': 'true' }, h('span.bt-packet'));
  const col = (kind: string, part?: { title: string; body: HTMLElement }) =>
    part ? h(`div.bt-col.bt-${kind}`, {}, h('p.bt-col-title', {}, part.title), part.body) : null;

  const scene =
    (o.layout ?? 'pipe') === 'pipe'
      ? h('div.bt-scene.is-pipe', {}, col('in', o.input), wire('a'), tool, wire('b'), col('out', o.output))
      : h('div.bt-scene.is-wide', {}, tool, h('div.bt-wide-stage', {}, o.stage ?? null));

  const caption = h('div.bt-caption', { 'aria-live': 'polite' });
  const dots = o.steps.map((step, i) => {
    const dot = h('button.bt-dot', { type: 'button', 'aria-label': `Paso ${i + 1}: ${step.piece}` });
    dot.addEventListener('click', () => go(i + 1));
    return dot;
  });
  const prev = h('button.step-nav', { type: 'button' }, 'Anterior');
  const next = h('button.step-nav.is-primary', { type: 'button' }, 'Empezar');
  const bar = h('div.bt-bar', {}, caption, h('div.bt-nav', {}, prev, h('div.bt-dots', {}, ...dots), next));
  const root = h('div.build', { 'data-at': 0 }, scene, bar);
  let current = 0;

  function go(target: number): void {
    current = Math.max(0, Math.min(total, target));
    root.dataset.at = String(current);
    root.classList.toggle('is-started', current > 0);
    root.classList.toggle('is-ready', current === total);
    pieces.forEach((piece, i) => {
      piece.classList.toggle('is-on', i < current);
      piece.classList.toggle('is-current', i === current - 1);
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-on', i < current);
      dot.setAttribute('aria-current', String(i === current - 1));
    });
    root.querySelectorAll<HTMLElement>('[data-at],[data-cur],[data-off],[data-upto],[data-mark]').forEach((el) => {
      if (el === root) return;
      const at = el.dataset.at;
      const upto = el.dataset.upto;
      const shown = (at === undefined || current >= Number(at)) && (upto === undefined || current <= Number(upto));
      el.classList.toggle('is-shown', shown);
      el.classList.toggle('is-current', has(el.dataset.cur, current));
      el.classList.toggle('is-off', el.dataset.off !== undefined && current >= Number(el.dataset.off));
      el.classList.toggle('is-marked', el.dataset.mark !== undefined && current >= Number(el.dataset.mark));
    });
    root.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
      const host = el.closest<HTMLElement>('[data-at]');
      countUp(el, !host || host === root || host.classList.contains('is-shown'));
    });
    // El paquete que viaja por los cables se reinicia en cada paso.
    root.querySelectorAll<HTMLElement>('.bt-packet').forEach((p) => {
      p.classList.remove('is-go');
      void p.offsetWidth;
      if (current > 0) p.classList.add('is-go');
    });
    const step = o.steps[current - 1];
    caption.replaceChildren(
      ...(step
        ? [h('p.bt-cap-k', {}, `Paso ${current} de ${total}`), h('p.bt-cap-t', {}, step.title), h('p.bt-cap-p', {}, step.text)]
        : [h('p.bt-cap-hint', {}, o.hint ?? 'Toca "Empezar" o usa la flecha derecha para verla funcionar paso a paso.')]),
    );
    prev.toggleAttribute('disabled', current === 0);
    next.textContent = current === 0 ? 'Empezar' : current === total ? 'Volver al inicio' : 'Siguiente';
    o.onStep?.(current, root);
    root.dispatchEvent(new CustomEvent('content:change', { bubbles: true }));
  }

  prev.addEventListener('click', () => go(current - 1));
  next.addEventListener('click', () => go(current === total ? 0 : current + 1));
  document.addEventListener('slide:leave', (event) => {
    if ((event.target as Element).contains(root)) window.setTimeout(() => go(0), 900);
  });
  // Primer dibujo cuando el árbol ya está armado (onStep puede buscar nodos).
  queueMicrotask(() => go(0));
  return root;
}

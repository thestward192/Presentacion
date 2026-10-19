// Demo por pasos: escenario (izquierda) + código real sincronizado (derecha),
// controlada por el reproductor de trazas común.
//
// El escenario se construye una sola vez con el estado final completo; cada
// elemento declara en qué paso aparece (data-step) y, si corresponde, hasta
// cuál sigue visible (data-until). Dibujar el paso i es solo alternar clases,
// por eso avanzar y retroceder es idempotente.

import { assertLines } from '../code/excerpts';
import { h } from '../core/dom';
import { prefersReducedMotion } from '../core/motion';
import { TracePlayer, type Step } from '../core/trace-player';
import { createCodePanel, type CodePanel } from './code-panel';
import { createControls } from './controls';

export interface DemoContent {
  stage: HTMLElement;
  steps: Step[];
  /** Pestañas del panel de código, en orden. Sin código: demo a ancho completo. */
  excerpts?: string[];
}

export interface DemoOptions {
  label: string;
  recordedAt: string;
  build: () => DemoContent;
  onRender?: (index: number, player: TracePlayer, stage: HTMLElement) => void;
  /** Controles extra (selector de caso, toggle de scorer) arriba de la demo. */
  toolbar?: HTMLElement[];
  note?: string;
}

export interface Demo {
  el: HTMLElement;
  player: TracePlayer;
  rebuild(autoplay?: boolean): void;
}

const registry: Demo[] = [];

/** La demo del bloque visible (para los atajos de teclado). */
export function demoInView(scope: Element): Demo | undefined {
  return registry.find((demo) => scope.contains(demo.el));
}

export function createDemo(options: DemoOptions): Demo {
  const caption = h('div.demo-caption', { 'aria-live': 'polite' });
  const counter = h('span.demo-counter.mono');
  const progress = h('div.demo-progress', { 'aria-hidden': 'true' });
  const stageHost = h('div.demo-stage');
  // La demo no arranca sola: se muestra este botón hasta que alguien la inicia.
  const startButton = h(
    'button.demo-start',
    { type: 'button' },
    h('span.demo-start-icon', { 'aria-hidden': 'true' }),
    h('span.demo-start-text', {}, 'Ver cómo funciona'),
  );
  const left = h('div.demo-left', {}, h('div.demo-narration', {}, counter, caption), progress, h('div.demo-stage-wrap', {}, stageHost, startButton));
  const right = h('div.demo-right');
  const player = new TracePlayer([]);
  const controls = createControls(player, options.label);

  const badge = h(
    'p.demo-badge',
    {},
    h('span.badge-dot', { 'aria-hidden': 'true' }),
    `Ejecución real grabada el ${options.recordedAt}, con CVs de prueba`,
    options.note ? h('span.demo-note', {}, ` · ${options.note}`) : null,
  );

  const body = h('div.demo-body', {}, left, right);
  // El título lo pone quien ubica la demo en su bloque (ver toolSheet).
  const heading = h('div.demo-heading', {}, h('p.demo-kicker', {}, options.label));
  const el = h(
    'div.demo',
    { role: 'group', 'aria-label': options.label },
    h('div.demo-top', {}, heading, controls),
    h('div.demo-sub', {}, h('div.demo-toolbar', {}, ...(options.toolbar ?? [])), badge),
    body,
  );

  let code: CodePanel | null = null;
  let stage: HTMLElement = h('div');
  let started = false;

  function render(index: number): void {
    const steps = player.steps;
    stage.querySelectorAll<HTMLElement>('[data-step]').forEach((item) => {
      const from = Number(item.dataset.step);
      const until = item.dataset.until !== undefined ? Number(item.dataset.until) : Infinity;
      const on = index >= from && index < until;
      item.classList.toggle('is-on', on);
      item.classList.toggle('is-current', index === from);
    });
    stage.querySelectorAll<HTMLElement>('[data-run]').forEach((item) => {
      const at = Number(item.dataset.run);
      const running = index === at && player.state === 'playing' && !prefersReducedMotion();
      item.style.setProperty('--run-ms', `${player.runningMs(steps[at] ?? { label: '' })}ms`);
      item.classList.toggle('is-running', running);
      item.classList.toggle('is-done', index > at || (index === at && !running));
    });
    const step = steps[index];
    counter.textContent = index < 0 ? `0 / ${steps.length}` : `${index + 1} / ${steps.length}`;
    caption.textContent = step ? step.label : 'Presiona "Ver cómo funciona" para empezar.';
    const waiting = index < 0 && player.state === 'idle';
    startButton.hidden = !waiting;
    el.classList.toggle('is-waiting', waiting);
    progress.querySelectorAll('i').forEach((dot, i) => dot.classList.toggle('is-on', i <= index));
    if (code && step?.code) code.show(step.code.excerpt, step.code.line);
    else if (code && index < 0) code.show(currentExcerpts[0]);
    options.onRender?.(index, player, stage);
  }

  let currentExcerpts: string[] = [];

  function rebuild(autoplay = started): void {
    const content = options.build();
    assertLines(content.steps.flatMap((step) => (step.code ? [step.code] : [])));
    stage = content.stage;
    stageHost.replaceChildren(stage);
    currentExcerpts = content.excerpts ?? [];
    if (currentExcerpts.length) {
      if (!code) {
        code = createCodePanel(currentExcerpts);
        right.append(code.el);
      } else code.setExcerpts(currentExcerpts);
      body.classList.remove('is-full');
    } else body.classList.add('is-full');
    progress.replaceChildren(...content.steps.map(() => h('i')));
    player.setSteps(content.steps);
    if (autoplay) start();
    el.dispatchEvent(new CustomEvent('content:change', { bubbles: true }));
  }

  function start(): void {
    started = true;
    if (prefersReducedMotion()) player.showFinal();
    else player.play();
  }
  startButton.addEventListener('click', start);

  player.onStep((index) => render(index));
  // Al pasar a vista técnica el panel de código se vuelve visible: recentra la línea activa.
  window.addEventListener('viewchange', () => requestAnimationFrame(() => render(player.index)));
  player.onState(() => render(player.index));
  rebuild(false);

  const demo = { el, player, rebuild };
  registry.push(demo);
  return demo;
}

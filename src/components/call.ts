import { h } from '../core/dom';
import { formatMs, shortTool } from '../core/trace-loader';
import type { TraceEvent } from '../core/types';

/**
 * Llamada a una herramienta, con indicador "trabajando" del largo de duration_ms.
 * Vista simple: qué se pidió en palabras; vista técnica: la llamada real.
 */
export function callCard(event: TraceEvent, step: number, plain: string): HTMLElement {
  const args = Object.entries(event.args)
    .filter(([key]) => key !== 'output_dir')
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(', ');
  return h(
    'div.call',
    { 'data-step': step, 'data-run': step },
    h(
      'div.call-head',
      {},
      h('span.call-kind', {}, h('span.plain-only', {}, 'Pedido al sistema'), h('span.tech-only', {}, 'Llamada a tool')),
      h('span.call-time.mono', {}, `respondió en ${formatMs(event.duration_ms)}`),
    ),
    h('p.call-plain.plain-only', {}, plain),
    h('code.call-code.tech-only', {}, `${shortTool(event.tool)}(${args})`),
    h('div.run-bar', { 'aria-hidden': 'true' }, h('i')),
  );
}

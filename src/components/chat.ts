// Chats animados (reclutador ↔ Claude, bot ↔ candidato), reproducidos con el
// mismo TracePlayer: cada mensaje es un paso; una llamada a tool son dos pasos
// (la llamada con su indicador "ejecutando" del largo de duration_ms, y el
// resultado real).

import { h } from '../core/dom';
import { formatMs, shortTool } from '../core/trace-loader';
import type { Step } from '../core/trace-player';
import type { TraceEvent } from '../core/types';
import type { DemoContent } from './demo';

export type ChatMessage =
  | { kind: 'right' | 'left'; author: string; text: string | HTMLElement; tag?: string; label: string; code?: Step['code'] }
  | { kind: 'tool'; event: TraceEvent; plain: string; summary: HTMLElement | string; label: string; resultLabel: string; code?: Step['code'] }
  | { kind: 'card'; content: HTMLElement; label: string; code?: Step['code'] };

function argsText(args: Record<string, unknown>): string {
  return Object.entries(args)
    .filter(([key]) => key !== 'output_dir') // ruta local de quien grabó: no se muestra
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(', ');
}

export function createChat(messages: ChatMessage[], title: string): DemoContent {
  const steps: Step[] = [];
  const log = h('div.chat-log', { role: 'log', 'aria-label': title });

  for (const message of messages) {
    const at = steps.length;
    if (message.kind === 'tool') {
      const { event } = message;
      steps.push({ label: message.label, realMs: event.duration_ms, code: message.code });
      steps.push({ label: message.resultLabel, code: message.code });
      log.append(
        h(
          'div.bubble.bubble-tool',
          { 'data-step': at, 'data-run': at },
          h(
            'div.tool-head',
            {},
            h('span.tool-kind', {}, h('span.plain-only', {}, 'Usa una herramienta'), h('span.tech-only', {}, 'Llamada a tool')),
            h('span.tool-time.mono', {}, formatMs(event.duration_ms)),
          ),
          h('p.tool-plain.plain-only', {}, message.plain),
          h('code.tool-call.tech-only', {}, `${shortTool(event.tool)}(${argsText(event.args)})`),
          h('div.run-bar', { 'aria-hidden': 'true' }, h('i')),
          h('div.run-state.mono', {}, h('span.run-on', {}, 'trabajando'), h('span.run-off', {}, event.is_error ? 'error' : 'listo')),
        ),
        h(
          'div.bubble.bubble-result',
          { 'data-step': at + 1, class: event.is_error ? 'is-error' : '' },
          h('div.tool-head', {}, h('span.tool-kind', {}, event.is_error ? 'Error de la tool' : 'Resultado')),
          typeof message.summary === 'string' ? h('p', {}, message.summary) : message.summary,
        ),
      );
    } else if (message.kind === 'card') {
      steps.push({ label: message.label, code: message.code, hold: 1400 });
      log.append(h('div.chat-card', { 'data-step': at }, message.content));
    } else {
      steps.push({ label: message.label, code: message.code });
      log.append(
        h(
          `div.bubble.bubble-${message.kind}`,
          { 'data-step': at },
          h('div.bubble-author', {}, message.author, message.tag ? h('span.bubble-tag', {}, message.tag) : null),
          h('div.typing', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
          h('div.bubble-text', {}, message.text),
        ),
      );
    }
  }

  return { stage: h('div.chat', {}, log), steps };
}

/** Mantiene a la vista el último mensaje (desplaza el chat, no la página). */
export function followChat(stage: HTMLElement): void {
  const log = stage.querySelector<HTMLElement>('.chat-log');
  if (!log) return;
  const visible = log.querySelectorAll<HTMLElement>('[data-step].is-on');
  const last = visible[visible.length - 1];
  const target = last ? last.offsetTop + last.offsetHeight - log.clientHeight + 24 : 0;
  const top = Math.max(0, target);
  log.scrollTo({ top, behavior: Math.abs(top - log.scrollTop) > log.clientHeight ? 'auto' : 'smooth' });
}

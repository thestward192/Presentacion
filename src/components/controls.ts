import { h } from '../core/dom';
import type { TracePlayer } from '../core/trace-player';

const SPEEDS = [0.5, 1, 2];

export function createControls(player: TracePlayer, label: string): HTMLElement {
  const button = (text: string, action: () => void, extra = '') => {
    const el = h('button.ctl', { type: 'button', class: extra }, text);
    el.addEventListener('click', action);
    return el;
  };

  const play = button('Reproducir', () => player.toggle(), 'ctl-primary');
  const prev = button('Anterior', () => player.prev());
  const next = button('Siguiente', () => player.next());
  const replay = button('Repetir', () => player.replay());
  prev.setAttribute('aria-label', 'Paso anterior');
  next.setAttribute('aria-label', 'Paso siguiente');

  const speed = h('div.ctl-speed', { role: 'radiogroup', 'aria-label': 'Velocidad' });
  for (const value of SPEEDS) {
    const option = h(
      'button.ctl.ctl-seg',
      { type: 'button', role: 'radio', 'aria-checked': String(value === player.speed) },
      `${value.toLocaleString('es')}×`,
    );
    option.addEventListener('click', () => {
      player.setSpeed(value);
      speed.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === option)));
    });
    speed.append(option);
  }

  const sync = () => {
    play.textContent = player.state === 'playing' ? 'Pausa' : 'Reproducir';
    play.setAttribute('aria-pressed', String(player.state === 'playing'));
    prev.disabled = player.index <= 0;
    next.disabled = player.index >= player.last;
  };
  player.onState(sync);
  player.onStep(sync);

  return h('div.controls', { role: 'toolbar', 'aria-label': `Controles: ${label}` }, play, prev, next, replay, speed);
}

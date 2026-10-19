// "Cómo lo trabajamos": la forma de trabajo del equipo, contada como una
// animación por pasos (mismo motor que las herramientas).

import { buildAnim } from '../components/build';
import { section } from '../components/layout';
import { h } from '../core/dom';
import { TEAM } from './intro';

export function teamwork(): HTMLElement {
  const handoffs = ['Ficha de la vacante y de cada CV', 'Nota y datos por aclarar'];

  const relay = h(
    'div.tw-relay',
    {},
    ...TEAM.flatMap((member, i) => [
      h(
        'div.hw-card.tw-member',
        { 'data-at': 1, style: `--i:${i * 3}` },
        h('span.tw-avatar', { 'aria-hidden': 'true' }, member.name.split(' ').slice(0, 2).map((w) => w[0]).join('')),
        h('p.hw-sheet-t', {}, member.name.split(' ').slice(0, 2).join(' ')),
        h('ul.tw-tasks', {}, ...member.tasks.map((task) => h('li', {}, task))),
      ),
      i < TEAM.length - 1
        ? h('div.tw-pass', { 'data-at': 2, style: `--i:${i * 3 + 1}` }, h('span.tw-arrow', { 'aria-hidden': 'true' }), h('span.tw-pass-t', {}, handoffs[i]))
        : null,
    ]),
  );

  const stage = h(
    'div.tw-stage',
    {},
    relay,
    h(
      'div.tw-row',
      {},
      h(
        'div.hw-card.tw-swap',
        { 'data-at': 3 },
        h('p.hw-field-k', {}, 'Piezas que se pueden cambiar'),
        h('div.tw-slot', {}, h('span.tw-old', {}, 'Búsqueda exacta'), h('span.tw-new', {}, 'Jev')),
        h('p.hw-muted', {}, 'Cambiamos la forma de calificar sin tocar el resto.'),
      ),
      h(
        'div.hw-card.tw-human',
        { 'data-at': 4 },
        h('p.hw-field-k', {}, 'Decide una persona'),
        h('p.hw-strong', {}, 'Las herramientas preparan la información; el reclutador decide.'),
      ),
    ),
  );

  const anim = buildAnim({
    tool: 'Nuestra forma de trabajar',
    toolKicker: 'Equipo',
    layout: 'wide',
    stage,
    hint: 'Toca "Empezar" o usa la flecha derecha para ver cómo nos organizamos.',
    steps: [
      { piece: 'Una etapa por persona', title: 'Cada uno se encargó de una etapa', text: 'Oscar lee, Randall califica y verifica, Stward recomienda y conversa con el candidato.' },
      { piece: 'Una misma ficha', title: 'Las etapas se pasan la misma ficha', text: 'Lo que entrega una herramienta es justo lo que necesita la siguiente.' },
      { piece: 'Piezas cambiables', title: 'Cada pieza se puede cambiar por otra', text: 'Así pasamos de una búsqueda exacta de palabras a Jev, que lee como una persona.' },
      { piece: 'La persona decide', title: 'La decisión final es de una persona', text: 'Nada se descarta solo: lo dudoso se marca para revisarlo.' },
    ],
  });

  return section(
    { id: 'equipo', chapter: 'Cómo lo trabajamos', kicker: 'Cómo lo trabajamos', title: 'Tres personas, una cadena', lead: 'Cada uno construyó una parte, y todas encajan.', compact: true, className: 'slide-how' },
    h('div', { 'data-reveal': '' }, anim),
  );
}

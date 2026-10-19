import { section } from '../components/layout';
import { h, s } from '../core/dom';

interface WalkStep {
  key: string;
  /** Título corto para la fila de pasos. */
  short: string;
  title: string;
  body: (string | Node)[];
}

/**
 * Diagrama + fila de pasos + panel de detalle. Nada se mueve solo: el
 * diagrama cambia únicamente cuando se toca un paso o "Siguiente".
 */
function steppedDiagram(diagram: SVGElement, steps: WalkStep[], order: string[][], hint: string): HTMLElement {
  const detail = h('div.step-detail', { 'aria-live': 'polite' });
  const tabs = steps.map((step, i) => {
    const tab = h('button.step-tab', { type: 'button', 'aria-pressed': 'false' }, h('span.step-tab-n', {}, String(i + 1)), h('span.step-tab-t', {}, step.short));
    tab.addEventListener('click', () => activate(i));
    return tab;
  });
  const prev = h('button.step-nav', { type: 'button', 'aria-label': 'Paso anterior' }, 'Anterior');
  const next = h('button.step-nav.is-primary', { type: 'button', 'aria-label': 'Paso siguiente' }, 'Siguiente');
  let current = -1;

  function activate(index: number): void {
    current = Math.max(-1, Math.min(steps.length - 1, index));
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-pressed', String(i === current));
      tab.classList.toggle('is-done', i < current);
    });
    const done = new Set(order.slice(0, Math.max(0, current)).flat());
    const active = new Set(order[current] ?? []);
    diagram.classList.toggle('has-active', current >= 0);
    diagram.querySelectorAll<SVGElement>('[data-key]').forEach((el) => {
      const keys = (el.dataset.key ?? '').split(' ');
      const on = keys.some((k) => active.has(k));
      el.classList.toggle('is-active', on);
      el.classList.toggle('is-done', !on && keys.some((k) => done.has(k)));
    });
    const step = steps[current];
    detail.classList.toggle('is-empty', !step);
    detail.replaceChildren(
      ...(step
        ? [h('p.step-detail-k', {}, `Paso ${current + 1} de ${steps.length}`), h('h3.step-detail-t', {}, step.title), ...step.body.map((b) => (typeof b === 'string' ? h('p.step-detail-p', {}, b) : b))]
        : [h('p.step-detail-hint', {}, hint)]),
    );
    prev.toggleAttribute('disabled', current <= 0);
    // El detalle cambia de alto: el bloque se vuelve a ajustar a la pantalla.
    detail.dispatchEvent(new CustomEvent('content:change', { bubbles: true }));
    next.textContent = current < 0 ? 'Empezar' : current >= steps.length - 1 ? 'Volver al inicio' : 'Siguiente';
  }

  prev.addEventListener('click', () => activate(current - 1));
  next.addEventListener('click', () => activate(current >= steps.length - 1 ? -1 : current + 1));
  const root = h(
    'div.stepped',
    {},
    h('div.figure.figure-stepped', { 'data-reveal': '' }, diagram),
    h('div.steps-bar', { 'data-reveal': '' }, prev, h('div.step-tabs', {}, ...tabs), next),
    h('div', { 'data-reveal': '' }, detail),
  );
  // Al salir del bloque vuelve al inicio, para que la próxima vez empiece de cero.
  document.addEventListener('slide:leave', (event) => {
    if ((event.target as Element).contains(root)) window.setTimeout(() => activate(-1), 900);
  });
  activate(-1);
  return root;
}

/** Nodo de diagrama: caja redondeada con dos líneas y responsable. */
function boxNode(key: string, x: number, y: number, w: number, nh: number, label: string[], sub: string, extra = ''): SVGElement {
  return s(
    'g',
    { class: `flow-node ${extra}`.trim(), 'data-key': key },
    s('rect', { x, y, width: w, height: nh, rx: 16 }),
    s('text', { x: x + 16, y: y + 30, class: 'd-title d-left flow-label' }, label[0]),
    s('text', { x: x + 16, y: y + 51, class: 'd-title d-left flow-label' }, label[1] ?? ''),
    s('text', { x: x + 16, y: y + 72, class: 'd-sub d-left' }, sub),
  );
}

/** Línea base tenue + línea de progreso que se dibuja al activarse. */
function link(key: string, d: string): SVGElement[] {
  return [s('path', { class: 'link-base', d }), s('path', { class: 'link-progress', 'data-key': key, d, pathLength: 1 })];
}

// ---------------------------------------------------------------------------
// Recorrido completo
// ---------------------------------------------------------------------------

export function flow(): HTMLElement {
  const main = [
    { key: 'jd', label: ['Leer la', 'vacante'], who: 'Oscar' },
    { key: 'cv', label: ['Leer los', 'CVs'], who: 'Oscar' },
    { key: 'eval', label: ['Calificar', 'cada CV'], who: 'Randall' },
    { key: 'inc', label: ['Revisar datos', 'que no cuadran'], who: 'Randall' },
    { key: 'report', label: ['Informe con', 'recomendación'], who: 'Stward' },
    { key: 'conv', label: ['Conversación', 'con el candidato'], who: 'Stward' },
    { key: 'handoff', label: ['Entrega al', 'reclutador'], who: 'Stward' },
  ];
  const w = 150;
  const nh = 86;
  const gap = 22;
  const y0 = 16;
  const xOf = (i: number) => 10 + i * (w + gap);
  const sy = 166;
  const branchX = xOf(2) + w / 2;
  const side = [
    { key: 'rank', label: ['Ranking de', 'la vacante'], who: 'Randall', x: xOf(3) + 40 },
    { key: 'excel', label: ['Reporte', 'en Excel'], who: 'toda la vacante', x: xOf(4) + 100 },
  ];
  const width = xOf(7) - gap + 20;

  const svg = s(
    'svg',
    { class: 'diagram stepped-diagram', viewBox: `0 0 ${width} 288`, role: 'img', 'aria-label': 'Recorrido: leer la vacante, leer los CVs, calificar, revisar datos, informe, conversación y entrega; en paralelo ranking y Excel' },
    ...main.slice(0, -1).flatMap((_n, i) => link(main[i + 1].key, `M${xOf(i) + w} ${y0 + nh / 2} L${xOf(i + 1)} ${y0 + nh / 2}`)),
    ...link('rank', `M${branchX} ${y0 + nh} C ${branchX} ${sy + nh / 2}, ${side[0].x - 60} ${sy + nh / 2}, ${side[0].x} ${sy + nh / 2}`),
    ...link(
      'excel',
      `M${branchX} ${y0 + nh} L${branchX} ${sy + nh + 4} Q${branchX} ${sy + nh + 14} ${branchX + 10} ${sy + nh + 14} L${side[1].x + w / 2 - 10} ${sy + nh + 14} Q${side[1].x + w / 2} ${sy + nh + 14} ${side[1].x + w / 2} ${sy + nh + 4} L${side[1].x + w / 2} ${sy + nh}`,
    ),
    ...main.map((n, i) => boxNode(n.key, xOf(i), y0, w, nh, n.label, n.who)),
    ...side.map((n) => boxNode(n.key, n.x, sy, w, nh, n.label, n.who, 'is-side')),
    s('text', { x: width - 10, y: sy + 30, class: 'd-caption flow-caption' }, 'en paralelo,'),
    s('text', { x: width - 10, y: sy + 50, class: 'd-caption flow-caption' }, 'para toda la vacante'),
  );

  const steps: WalkStep[] = [
    { key: 'oscar', short: 'Oscar', title: 'Oscar: entender la vacante y los CVs', body: ['La descripción del puesto se convierte en una lista de requisitos, y cada CV en años de experiencia y habilidades.'] },
    { key: 'randall', short: 'Randall', title: 'Randall: calificar y verificar', body: ['Cada candidato recibe una nota de 0 a 1, con lo que cumple y lo que le falta, y se marcan los datos que se contradicen.'] },
    { key: 'stward', short: 'Stward', title: 'Stward: recomendar y conversar', body: ['Un informe con recomendación, unas pocas preguntas para el candidato y una hoja lista para la entrevista.'] },
    { key: 'lote', short: 'Toda la vacante', title: 'Para toda la vacante a la vez', body: ['El ranking ordena a todos los candidatos y el reporte en Excel separa a los que cumplen de los que no.'] },
  ];
  const order = [['jd', 'cv'], ['eval', 'inc', 'rank'], ['report', 'conv', 'handoff'], ['rank', 'excel']];

  return section(
    {
      id: 'flujo',
      className: 'slide-walk',
      chapter: 'Recorrido',
      kicker: 'El recorrido completo',
      title: 'De la vacante a la entrevista',
      lead: 'Siete pasos en orden, cada uno con su responsable.',
    },
    steppedDiagram(svg, steps, order, 'Toca "Empezar" o un responsable para recorrer los pasos.'),
  );
}

// ---------------------------------------------------------------------------
// Cómo está hecho
// ---------------------------------------------------------------------------

export function architecture(): HTMLElement {
  const W = 1200;
  const cy = 150;
  const layers = [
    { key: 'ring-outer', x: 110, y: 14, w: 980, h: 272, rx: 44, label: 'Conexiones con el exterior' },
    { key: 'ring-app', x: 290, y: 52, w: 620, h: 196, rx: 36, label: 'Pasos del proceso' },
    { key: 'ring-domain', x: 470, y: 90, w: 260, h: 120, rx: 28, label: 'Reglas' },
  ];
  const nodes = [
    { key: 'folder', x: 50, label: 'Carpeta', sub: 'CVs y vacante' },
    { key: 'adapter', x: 200, label: 'Lector', sub: 'abre los archivos' },
    { key: 'usecase', x: 380, label: 'Proceso', sub: 'califica y decide' },
    { key: 'rules', x: 600, label: 'Reglas', sub: 'de la empresa' },
    { key: 'tool', x: 1000, label: 'Herramienta', sub: 'para el asistente' },
    { key: 'agent', x: 1150, label: 'Asistente', sub: 'conversa' },
  ];
  const linkKeys = ['adapter', 'usecase', 'rules', 'tool', 'agent'];

  const svg = s(
    'svg',
    { class: 'diagram stepped-diagram arch-diagram', viewBox: `0 0 ${W} 300`, role: 'img', 'aria-label': 'Capas: reglas al centro, pasos del proceso alrededor y conexiones con el exterior; de la carpeta al asistente' },
    ...layers.map((l) =>
      s(
        'g',
        { class: 'arch-layer', 'data-key': `${l.key} layers` },
        s('rect', { x: l.x, y: l.y, width: l.w, height: l.h, rx: l.rx }),
        s('text', { x: l.x + l.w / 2, y: l.y + 24, class: 'd-ring-label' }, l.label),
      ),
    ),
    ...nodes.slice(0, -1).flatMap((n, i) => link(linkKeys[i], `M${n.x + 14} ${cy} L${nodes[i + 1].x - 14} ${cy}`)),
    ...nodes.map((n) =>
      s(
        'g',
        { class: 'arch-node', 'data-key': n.key === 'rules' ? 'rules usecase' : n.key },
        s('circle', { class: 'arch-halo', cx: n.x, cy, r: 26 }),
        s('circle', { class: 'arch-dot', cx: n.x, cy, r: 12 }),
        s('text', { x: n.x, y: cy + 44, class: 'd-title arch-label' }, n.label),
        s('text', { x: n.x, y: cy + 64, class: 'd-sub' }, n.sub),
      ),
    ),
    // Piezas intercambiables
    s(
      'g',
      { class: 'arch-alt', 'data-key': 'swap' },
      s('rect', { x: 130, y: 236, width: 140, height: 34, rx: 17 }),
      s('text', { x: 200, y: 258, class: 'd-sub' }, 'o Outlook, o Gmail'),
      s('rect', { x: 300, y: 236, width: 160, height: 34, rx: 17 }),
      s('text', { x: 380, y: 258, class: 'd-sub' }, 'reglas exactas o Jev'),
    ),
  );

  const tech = (...items: (string | Node)[]) => h('div.tech-only.step-tech', {}, ...items);
  const steps: WalkStep[] = [
    {
      key: 'layers',
      short: 'Las capas',
      title: 'Las reglas, en el centro',
      body: [
        'Lo importante (cómo se califica, cuándo se recomienda avanzar) vive en el centro. No depende de dónde llegan los CVs ni de quién pregunta.',
        tech(h('p', {}, 'Arquitectura hexagonal: dominio y casos de uso al centro; infraestructura e interfaces afuera.')),
      ],
    },
    {
      key: 'folder',
      short: 'Carpeta',
      title: 'Los CVs llegan a una carpeta',
      body: ['Una carpeta por vacante con la descripción del puesto y los CVs, en PDF, Word o texto.', tech(h('p', {}, h('code', {}, '<inbox_dir>/<vacancy_id>/')))],
    },
    {
      key: 'adapter',
      short: 'Lector',
      title: 'Un lector abre los archivos',
      body: ['Convierte cada archivo en datos ordenados: requisitos, años de experiencia y habilidades.', tech(h('p', {}, h('code', {}, 'FolderVacancySourceAdapter'), ' implementa ', h('code', {}, 'VacancySourcePort'), '.'))],
    },
    {
      key: 'usecase',
      short: 'Proceso',
      title: 'El proceso aplica las reglas',
      body: ['Califica, busca contradicciones y arma la recomendación. No sabe si los datos vinieron de una carpeta o de un correo.', tech(h('p', {}, 'Casos de uso en ', h('code', {}, 'application/use_cases/'), ', con el puerto inyectado.'))],
    },
    {
      key: 'tool',
      short: 'Herramienta',
      title: 'Cada paso es una herramienta',
      body: ['El asistente no puede hacer nada fuera de estas herramientas.', tech(h('p', {}, h('code', {}, 'interfaces/mcp/tools.py'), ' publica cada caso de uso como ', h('code', {}, 'talent_acquisition_<recurso>_<operacion>'), '.'))],
    },
    { key: 'agent', short: 'Asistente', title: 'El asistente las usa', body: ['Elige la herramienta adecuada y le explica el resultado al reclutador.'] },
    {
      key: 'swap',
      short: 'Cambiar piezas',
      title: 'Se cambian piezas sin tocar las reglas',
      body: [
        'Si mañana los CVs llegan por correo, o se quiere calificar de otra forma, se cambia la pieza de afuera desde la configuración. Las reglas del centro siguen igual.',
        tech(
          h(
            'ul.config-list.mono',
            {},
            h('li', {}, 'TALENT_ACQUISITION_SOURCE_BACKEND', h('span', {}, 'folder_inbox · email_outlook · email_gmail')),
            h('li', {}, 'TALENT_ACQUISITION_MATCH_SCORER_BACKEND', h('span', {}, 'deterministic · typesafe')),
          ),
        ),
      ],
    },
  ];
  const order = [['layers', 'ring-outer', 'ring-app', 'ring-domain'], ['folder'], ['adapter'], ['usecase', 'rules'], ['tool'], ['agent'], ['swap', 'adapter', 'usecase']];

  return section(
    {
      id: 'arquitectura',
      className: 'slide-walk',
      chapter: 'Cómo está hecho',
      kicker: 'Cómo está construido',
      title: 'Piezas que se pueden cambiar sin romper nada',
      lead: 'Como un enchufe: las reglas quedan en el centro y lo de afuera se puede cambiar sin rehacer el resto.',
    },
    steppedDiagram(svg, steps, order, 'Toca "Empezar" o una pieza para ver cómo se conecta todo.'),
  );
}

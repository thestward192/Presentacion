import { registeredTools } from '../code/excerpts';
import { mountCover3D } from '../components/cover3d';
import { section, slide } from '../components/layout';
import { h, s } from '../core/dom';
import { nameOf } from '../core/names';
import { findEvent, formatScore } from '../core/trace-loader';
import type { ListResult, MatchEvaluation, Traces } from '../core/types';

export const TEAM = [
  { name: 'Oscar Zúñiga Sánchez', tasks: ['Leer la vacante', 'Leer los CVs'], tech: 'ta_leer_jd · ta_leer_cv' },
  { name: 'Randall Carranza Solano', tasks: ['Calificar candidatos', 'Detectar datos que no cuadran'], tech: 'ta_evaluar_cumplimiento · ta_detectar_inconsistencias' },
  { name: 'Stward Serrano Sánchez', tasks: ['Informe para el reclutador', 'Conversación con el candidato'], tech: 'ta_generar_informe_prescreening · ta_conversacion_prescreening' },
];

export function cover(traces: Traces): HTMLElement {
  const recorded = new Date(traces.index.recorded_at);
  const month = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(recorded);
  const el = slide(
    { id: 'portada', title: 'Portada', className: 'slide-cover' },
    h('p.kicker', { 'data-reveal': '' }, 'Talent Acquisition'),
    h('h1#portada-title.cover-title', { 'data-reveal': '' }, 'Pre-Screening', h('br'), h('span.grad', {}, 'con MCP')),
    h(
      'p.cover-lead',
      { 'data-reveal': '' },
      'Un asistente que ayuda al reclutador a hacer el primer filtro de candidatos: lee la vacante y los CVs, los califica con el mismo criterio y prepara la información para decidir. La decisión siempre es de una persona.',
    ),
    h(
      'ul.team',
      { 'data-reveal': '' },
      ...TEAM.map((member, i) =>
        h(
          'li.team-card',
          { style: `--i:${i}` },
          h('p.team-name', {}, member.name),
          h('p.team-tasks.plain-only', {}, member.tasks.join(' · ')),
          h('p.team-tasks.mono.tech-only', {}, member.tech),
        ),
      ),
    ),
    h(
      'p.cover-meta',
      { 'data-reveal': '' },
      h('span', {}, month.charAt(0).toUpperCase() + month.slice(1)),
      h('span.sep', { 'aria-hidden': 'true' }, '/'),
      h('span', {}, 'Demos con ejecuciones reales sobre CVs de prueba'),
    ),
  );
  mountCover3D(el);
  return el;
}

/** Una pila de CVs (los 20 de la traza) que se ordena sola con la nota de Jev. */
export function problem(traces: Traces): HTMLElement {
  const ranking = findEvent(
    traces.match,
    (e) => e.tool.endsWith('candidate_ranking_top_n') && e.scorer === 'typesafe',
    'ranking con Jev',
  ).result as ListResult<MatchEvaluation>;
  const threshold = traces.match.threshold;

  const cards = ranking.result.map((evaluation, rank) => {
    // Desorden determinista (no aleatorio) para que la pila se vea igual siempre.
    const jitterX = ((rank * 37) % 23) - 11;
    const jitterY = ((rank * 53) % 19) - 9;
    const rotate = ((rank * 29) % 17) - 8;
    const col = rank % 4;
    const row = Math.floor(rank / 4);
    const passes = evaluation.score >= threshold;
    return h(
      'li.cv-card',
      {
        class: passes ? 'is-top' : '',
        style: [
          `--px:calc(1.5 * (100% + 12px) + ${jitterX * 3}px)`,
          `--py:calc(2 * (100% + 10px) + ${jitterY * 3}px)`,
          `--pr:${rotate}deg`,
          `--sx:calc(${col} * (100% + 12px))`,
          `--sy:calc(${row} * (100% + 10px))`,
          `--i:${rank}`,
        ].join(';'),
      },
      h('span.cv-id', {}, h('span.plain-only', {}, nameOf(evaluation.candidate_id)), h('span.tech-only.mono', {}, evaluation.candidate_id)),
      h('span.cv-rank.mono', {}, String(rank + 1).padStart(2, '0')),
      h('span.cv-score.mono', {}, formatScore(evaluation.score)),
    );
  });

  return section(
    {
      id: 'problema',
      chapter: 'Problema',
      kicker: 'El problema',
      title: 'Decenas de CVs por vacante',
      lead: 'Cada vacante recibe decenas de CVs en PDF. Revisarlos uno por uno toma horas y cada persona los lee distinto.',
    },
    h(
      'div.problem',
      {},
      h(
        'div.problem-text',
        { 'data-reveal': '' },
        h('div.before-after', {}, h('p.ba-k', {}, 'Hoy'), h('p', {}, 'Abrir cada PDF, buscar los requisitos a ojo y anotar quién sirve.')),
        h('div.before-after.is-after', {}, h('p.ba-k', {}, 'Con el asistente'), h('p', {}, 'Todos los CVs se leen y se califican con el mismo criterio, y cada nota viene con su justificación.')),
        h('p.muted', {}, `A la derecha, 20 CVs de prueba de una vacante de Senior AI Engineer, ordenados por su nota. Resaltados: los que superan el mínimo de ${formatScore(threshold)}.`),
      ),
      h('ol.cv-pile', { 'data-reveal': '', 'aria-label': 'CVs ordenados por nota' }, ...cards),
    ),
  );
}

export function mcp(): HTMLElement {
  const tools = registeredTools();
  const nodes = [
    { x: 20, title: 'Reclutador', sub: 'pregunta y decide' },
    { x: 260, title: 'Asistente (Claude)', sub: 'entiende y explica' },
    { x: 500, title: 'Herramientas (MCP)', sub: 'leen, califican, informan' },
    { x: 740, title: 'CVs y vacantes', sub: 'carpeta de la empresa' },
  ];
  const w = 200;
  const svg = s(
    'svg',
    { class: 'diagram mcp-diagram', viewBox: '0 0 960 170', role: 'img', 'aria-label': 'El reclutador habla con el asistente, el asistente usa las herramientas y las herramientas leen los CVs' },
    ...nodes.slice(0, -1).map((node, i) =>
      s(
        'g',
        { class: 'd-link', style: `--i:${i}` },
        s('line', { x1: node.x + w, y1: 70, x2: nodes[i + 1].x, y2: 70, pathLength: 1 }),
        s('path', { d: `M${nodes[i + 1].x - 8} 64 L${nodes[i + 1].x} 70 L${nodes[i + 1].x - 8} 76`, class: 'd-head' }),
      ),
    ),
    ...nodes.map((node, i) =>
      s(
        'g',
        { class: i === 2 ? 'd-node is-accent' : 'd-node', style: `--i:${i}` },
        s('rect', { x: node.x, y: 34, width: w, height: 72, rx: 8 }),
        s('text', { x: node.x + w / 2, y: 66, class: 'd-title' }, node.title),
        s('text', { x: node.x + w / 2, y: 88, class: 'd-sub' }, node.sub),
      ),
    ),
    s('text', { x: 240, y: 140, class: 'd-caption' }, 'pide en palabras'),
    s('text', { x: 480, y: 140, class: 'd-caption' }, 'usa la herramienta'),
    s('text', { x: 720, y: 140, class: 'd-caption' }, 'lee los archivos'),
  );

  return section(
    {
      id: 'mcp',
      chapter: 'MCP',
      kicker: 'Qué es un MCP',
      title: 'Un asistente con herramientas aprobadas',
      lead: 'Claude entiende lo que pide el reclutador, pero no inventa datos ni toca archivos por su cuenta: solo usa las herramientas que el equipo le preparó. Ese conjunto de herramientas es el MCP.',
    },
    h('div.figure', { 'data-reveal': '' }, svg),
    h(
      'div.three',
      { 'data-reveal': '' },
      h('div.point', {}, h('h3', {}, 'El asistente'), h('p', {}, 'Entiende la pregunta, elige qué herramienta usar y explica el resultado en palabras.')),
      h('div.point', {}, h('h3', {}, 'Las herramientas'), h('p', {}, 'Siguen reglas fijas: leen, califican e informan siempre igual. No conversan ni deciden.')),
      h('div.point', {}, h('h3', {}, 'El reclutador'), h('p', {}, 'Recibe la nota, la evidencia y una recomendación, y es quien decide.')),
    ),
    h(
      'details.disclosure.tech-only',
      { 'data-reveal': '' },
      h('summary', {}, `Las ${tools.length} tools registradas en interfaces/mcp/tools.py`),
      h('ul.tool-list', {}, ...tools.map((tool) => h('li', {}, h('code', {}, tool)))),
    ),
  );
}

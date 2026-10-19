import { callCard } from '../components/call';
import { createDemo } from '../components/demo';
import { docText } from '../components/doc-text';
import { section, slide, titleDemo, toggle, toolSheet } from '../components/layout';
import { h, s } from '../core/dom';
import { nameOf, who } from '../core/names';
import { findEvent, formatMs, formatRecordedAt, formatScore } from '../core/trace-loader';
import type { Step } from '../core/trace-player';
import { howEvaluate, howInconsistencies, howJev, howRanking } from './how';
import type { CandidateCv, ComparisonRow, CvInconsistencyReport, JobDescription, ListResult, MatchEvaluation, Scorer, TraceEvent, Traces } from '../core/types';

const EXPERIENCE_PREFIX = 'experiencia_minima_';

function rankingOf(traces: Traces, scorer: Scorer): TraceEvent<ListResult<MatchEvaluation>> {
  return findEvent(
    traces.match,
    (e) => e.tool.endsWith('candidate_ranking_top_n') && e.scorer === scorer,
    `ranking ${scorer}`,
  ) as TraceEvent<ListResult<MatchEvaluation>>;
}

function evaluations(traces: Traces): TraceEvent<MatchEvaluation>[] {
  return traces.match.events.filter((e) => e.tool.endsWith('candidate_match_evaluate')) as TraceEvent<MatchEvaluation>[];
}

function cvsById(traces: Traces): Map<string, CandidateCv> {
  const list = findEvent(traces.cv, (e) => e.args.vacancy_id === traces.index.vacancy, 'CVs').result!.result;
  return new Map(list.map((cv) => [cv.candidate_id, cv]));
}


// ---------------------------------------------------------------------------
// Calificar cada CV
// ---------------------------------------------------------------------------

export function evaluateMatch(traces: Traces): HTMLElement[] {
  const jd = findEvent(traces.jd, (e) => !e.is_error, 'JD').result as JobDescription;
  const threshold = traces.match.threshold;
  const recordedAt = formatRecordedAt(traces.index.recorded_at);
  const cvs = cvsById(traces);
  const candidates = [...new Set(evaluations(traces).map((e) => e.args.candidate_id as string))];
  let candidate = candidates[0];

  const candidatePicker = toggle(
    'Candidato',
    candidates.map((id) => ({ value: id, text: nameOf(id) })),
    candidate,
    (value) => {
      candidate = value;
      demo.rebuild();
    },
  );

  const demo = createDemo({
    label: 'Demo: Jev califica un CV',
    recordedAt,
    toolbar: [candidatePicker.el],
    build: () => {
      const jev = evaluations(traces).find((e) => e.scorer === 'typesafe' && e.args.candidate_id === candidate);
      if (!jev) throw new Error(`Falta candidate_match_evaluate de ${candidate}`);
      const result = jev.result!;
      const cv = cvs.get(candidate);
      const name = nameOf(candidate);
      const expOk = !result.missing_requirements.some((m) => m.startsWith(EXPERIENCE_PREFIX));
      const passes = result.score >= threshold;

      const steps: Step[] = [
        { label: `Jev recibe la vacante y el CV completo de ${name}.`, realMs: jev.duration_ms, code: { excerpt: 'match.jev', line: 'response = client.system_one(' } },
        ...jd.requirements.map((req) => ({
          label: `¿Cumple "${req}"? ${result.matched_requirements.includes(req) ? 'Sí.' : 'No.'}`,
          code: { excerpt: 'match.jev', line: 'if response.answers[f"requirement_{index}"].noul >= _NOUL_YES_THRESHOLD' },
          dwellMs: 1200,
        })),
        {
          label: `¿Tiene al menos ${jd.min_experience_years} años de experiencia? Tiene ${cv?.years_experience?.toLocaleString('es') ?? 'sin dato'}: ${expOk ? 'sí' : 'no'}.`,
          code: { excerpt: 'match.jev', line: 'cv.years_experience is not None and cv.years_experience >= job.min_experience_years' },
        },
        {
          label: `Nota final: ${formatScore(result.score)}. ${passes ? 'Llega' : 'No llega'} al mínimo de ${formatScore(threshold)}.`,
          code: { excerpt: 'match.jev', line: 'score = round(overall_score / max_level, 2) if max_level else 1.0' },
          hold: 1200,
        },
      ];
      const expStep = jd.requirements.length + 1;
      const scoreStep = expStep + 1;

      const check = (ok: boolean, step: number) =>
        h('span.check', { 'data-step': step, class: ok ? 'is-ok' : 'is-no', 'aria-label': ok ? 'cumple' : 'no cumple' }, h('i'));
      const rows = jd.requirements.map((req, i) =>
        h('li.req-row', { 'data-step': i + 1 }, check(result.matched_requirements.includes(req), i + 1), h('span.req-row-t', {}, req)),
      );
      const total = jd.requirements.length + 1;
      const met = result.matched_requirements.length + (expOk ? 1 : 0);

      // Anillo de nota: se llena hasta la nota y marca el mínimo.
      const r = 62;
      const c = 2 * Math.PI * r;
      const angle = threshold * 360 - 90;
      const gauge = s(
        'svg',
        { class: 'gauge', viewBox: '0 0 160 160', 'aria-hidden': 'true' },
        s('circle', { class: 'gauge-track', cx: 80, cy: 80, r }),
        s('circle', { class: 'gauge-fill', cx: 80, cy: 80, r, style: `--c:${c};--v:${c * (1 - result.score)}` }),
        s('line', {
          class: 'gauge-min',
          x1: 80 + Math.cos((angle * Math.PI) / 180) * (r - 12),
          y1: 80 + Math.sin((angle * Math.PI) / 180) * (r - 12),
          x2: 80 + Math.cos((angle * Math.PI) / 180) * (r + 12),
          y2: 80 + Math.sin((angle * Math.PI) / 180) * (r + 12),
        }),
      );

      const stage = h(
        'div.jev-eval',
        {},
        h(
          'div.jev-eval-left',
          {},
          callCard(jev, 0, `Jev lee el CV completo de ${name}`),
          h('ol.req-rows', {}, ...rows, h('li.req-row.is-exp', { 'data-step': expStep }, check(expOk, expStep), h('span.req-row-t', {}, `Al menos ${jd.min_experience_years} años de experiencia`, h('span.req-row-sub', {}, `tiene ${cv?.years_experience?.toLocaleString('es') ?? '-'}`)))),
        ),
        h(
          'div.jev-eval-right',
          {},
          h(
            'div.gauge-card',
            { 'data-step': scoreStep, class: passes ? 'is-pass' : 'is-fail' },
            h('div.gauge-wrap', {}, gauge, h('div.gauge-center', {}, h('strong.gauge-n', {}, formatScore(result.score)), h('span.gauge-l', {}, 'nota'))),
            h('p.gauge-msg', {}, passes ? 'Llega al mínimo' : 'No llega al mínimo', h('span', {}, ` (${formatScore(threshold)})`)),
            h('p.gauge-sub', {}, `Cumple ${met} de ${total} puntos`),
          ),
        ),
      );
      return { stage, steps, excerpts: ['match.jev', 'match.port', 'match.factory'] };
    },
  });

  return toolSheet({
    id: 'evaluar',
    chapter: 'Calificar',
    kicker: 'Paso 3 · Calificar cada CV',
    title: 'Una nota de 0 a 1 por candidato',
    lead: 'Cada CV se compara contra los requisitos de la vacante. El resultado es una nota, con lo que cumple y lo que le falta.',
    owner: 'Randall Carranza Solano',
    task: 'ta_evaluar_cumplimiento',
    tools: ['talent_acquisition_candidate_match_evaluate', 'talent_acquisition_candidate_ranking_top_n'],
    simple: {
      receives: 'La lista de requisitos de la vacante y el CV del candidato.',
      does: 'Jev lee el CV completo y responde, requisito por requisito, si se cumple. La experiencia mínima se compara como número.',
      delivers: 'Una nota de 0 a 1, lo que cumple y lo que le falta.',
    },
    why: 'cada nota viene con su evidencia, y todos los candidatos se califican con el mismo criterio.',
    under: [
      h('span', {}, 'Jev (TypeSafe) se usa a través del puerto común ', h('code', {}, 'CandidateMatchScorerPort'), '; ', h('code', {}, 'build_match_scorer'), ' lo elige por configuración.'),
      'La experiencia mínima es una comparación numérica, no la decide el modelo.',
      'Devuelve score, matched_requirements y missing_requirements. El ranking evalúa a todos y ordena de mayor a menor.',
      'Jev no devuelve las probabilidades por requisito: el código las usa (sí si noul >= 0.5) pero no salen en la respuesta.',
    ],
    demo: demo.el,
    demoTitle: 'Así califica Jev un CV, requisito por requisito',
    how: howEvaluate(traces),
    slides: [
      howRanking(traces),
      section(
        { id: 'ranking', chapter: 'Ranking de los 20', kicker: 'Paso 3 · Calificar cada CV', title: 'Toda la vacante, ordenada por nota', compact: true, className: 'slide-chart' },
        rankingChart(traces),
      ),
    ],
  });
}

// ---------------------------------------------------------------------------
// Ranking de los 20, reordenable
// ---------------------------------------------------------------------------

function rankingChart(traces: Traces): HTMLElement {
  const threshold = traces.match.threshold;
  const jev = rankingOf(traces, 'typesafe');
  const ranking = jev.result!.result;
  const passing = ranking.filter((e) => e.score >= threshold).length;

  const list = h(
    'ol.rank-list',
    { style: `--rows:${ranking.length}` },
    ...ranking.map((evaluation, position) => {
      const total = evaluation.matched_requirements.length + evaluation.missing_requirements.filter((m) => !m.startsWith(EXPERIENCE_PREFIX)).length;
      return h(
        'li.rank-row',
        { class: evaluation.score >= threshold ? 'is-pass' : '', 'data-scorer': 'typesafe', style: `--y:${position}` },
        h('span.rank-pos.mono', {}, String(position + 1)),
        h('span.rank-id', {}, who(evaluation.candidate_id)),
        h('span.rank-track', {}, h('i.rank-fill', { style: `--w:${evaluation.score * 100}%` }), h('i.rank-threshold', { style: `--t:${threshold * 100}%` })),
        h('span.rank-value.mono', {}, formatScore(evaluation.score)),
        h('span.rank-detail', {}, `cumple ${evaluation.matched_requirements.length} de ${total}`),
      );
    }),
  );

  return h(
    'div.chart-card.rank-card',
    { 'data-reveal': '' },
    h('div.chart-head', {}, h('p.chart-caption', {}, `${passing} de ${ranking.length} candidatos llegan al mínimo de ${formatScore(threshold)}. Jev calificó a todos en ${formatMs(jev.duration_ms)}.`)),
    h('div.rank-legend', { 'aria-hidden': 'true' }, h('span', {}, '#'), h('span', {}, 'Candidato'), h('span.rank-legend-track', {}, h('span', {}, '0'), h('span.rank-legend-t', { style: `--t:${threshold * 100}%` }, `mínimo ${formatScore(threshold)}`), h('span', {}, '1')), h('span', {}, 'Nota')),
    list,
  );
}

// ---------------------------------------------------------------------------
// Jev vs búsqueda exacta (sección destacada)
// ---------------------------------------------------------------------------

export function whyJev(traces: Traces): HTMLElement[] {
  const threshold = traces.match.threshold;
  const comparison = traces.match.comparison;
  const det = rankingOf(traces, 'deterministic').result!.result;
  const jev = rankingOf(traces, 'typesafe').result!.result;
  const jd = findEvent(traces.jd, (e) => !e.is_error, 'JD').result as JobDescription;

  const best = jev[0];
  const bestName = nameOf(best.candidate_id);
  const bestRow = comparison.find((row) => row.candidate_id === best.candidate_id)!;

  // Ejemplo: un requisito que Jev encuentra y la búsqueda exacta no.
  const example =
    jd.requirements.find((r) => r.includes('CI/CD') && bestRow.jev_matched.includes(r) && !bestRow.deterministic_matched.includes(r)) ??
    bestRow.jev_matched.find((r) => !bestRow.deterministic_matched.includes(r));

  const avg = (scorer: Scorer) => {
    const list = evaluations(traces).filter((e) => e.scorer === scorer);
    return Math.round(list.reduce((sum, e) => sum + e.duration_ms, 0) / list.length);
  };
  const range = (list: MatchEvaluation[]) => `${formatScore(Math.min(...list.map((e) => e.score)))} a ${formatScore(Math.max(...list.map((e) => e.score)))}`;
  const pass = (list: MatchEvaluation[]) => list.filter((e) => e.score >= threshold).length;
  const rankTime = (scorer: Scorer) => formatMs(rankingOf(traces, scorer).duration_ms);

  const statRows: [string, string, string][] = [
    [`Candidatos que llegan al mínimo (${formatScore(threshold)})`, String(pass(det)), String(pass(jev))],
    [
      `La mejor candidata (${bestName})`,
      `nota ${formatScore(bestRow.deterministic_score)}: no le encontró ninguno de los ${jd.requirements.length} requisitos`,
      `nota ${formatScore(bestRow.jev_score)}: cumple ${bestRow.jev_matched.length} de ${jd.requirements.length}`,
    ],
    ['Notas, de la más baja a la más alta', range(det), range(jev)],
    ['Tiempo por candidato', `${avg('deterministic')} ms`, `${avg('typesafe')} ms`],
    ['Tiempo para los 20', rankTime('deterministic'), rankTime('typesafe')],
  ];

  const concept = section(
    {
      id: 'jev',
      chapter: 'Por qué Jev',
      kicker: 'Antes de calificar · Por qué Jev',
      title: 'Los requisitos son frases, no palabras sueltas',
      lead: 'Un CV dice lo mismo con otras palabras. Buscar el texto exacto no lo encuentra; un modelo de IA que lee el CV completo, sí.',
      className: 'feature',
    },
    h(
      'div.jev-intro',
      { 'data-reveal': '' },
      h(
        'div.jev-card',
        {},
        h('p.jev-k', {}, 'Búsqueda exacta', h('span.tech-only', {}, ' (determinista)')),
        h('p', {}, 'Busca cada requisito, palabra por palabra, dentro del CV. Es rápida, pero si el CV lo dice de otra forma, no lo encuentra.'),
        h('p.jev-file.mono.tech-only', {}, 'application/use_cases/evaluate_candidate_match.py'),
      ),
      h(
        'div.jev-card.is-jev',
        {},
        h('p.jev-k', {}, 'Jev, un modelo de IA', h('span.tech-only', {}, ` (TypeSafe · ${traces.match.jev_model})`)),
        h('p', {}, 'Lee la vacante y el CV completos, como lo haría una persona, y responde por cada requisito si se cumple o no. Además da una valoración global.'),
        h('p.jev-file.mono.tech-only', {}, 'infrastructure/scoring/typesafe_match_scorer_adapter.py'),
      ),
      h(
        'p.jev-port',
        {},
        'Se elige una u otra en la configuración, sin cambiar nada más del sistema.',
        h(
          'span.tech-only',
          {},
          ' Los dos cumplen el puerto ',
          h('code', {}, 'CandidateMatchScorerPort'),
          ' y se eligen en ',
          h('code', {}, 'build_match_scorer'),
          ' con ',
          h('code', {}, 'TALENT_ACQUISITION_MATCH_SCORER_BACKEND'),
          '.',
        ),
      ),
    ),
  );

  const exampleSlide = example ? jevExample(traces, example, best.candidate_id, bestRow, jd.requirements.length) : null;

  const numbers = section(
    { id: 'jev-numeros', chapter: 'Los números', kicker: 'Por qué Jev', title: 'Con los 20 CVs de prueba', compact: true, className: 'feature' },
    h(
      'div.table-wrap',
      { 'data-reveal': '' },
      h(
        'table.data.compare',
        {},
        h('caption', {}, `Los ${comparison.length} CVs de prueba, calificados de las dos formas.`),
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, h('i.key-det'), 'Búsqueda exacta'), h('th', {}, h('i.key-jev'), 'Jev'))),
        h('tbody', {}, ...statRows.map(([label, a, b]) => h('tr', {}, h('th', { scope: 'row' }, label), h('td', {}, a), h('td', {}, b)))),
      ),
    ),
    h('p.honest', { 'data-reveal': '' }, honestNote(traces, jev)),
  );

  const chart = section(
    { id: 'jev-grafico', chapter: 'Nota por candidato', kicker: 'Por qué Jev', title: 'La nota de cada candidato, de las dos formas', compact: true, className: 'feature slide-chart' },
    dumbbell(traces),
  );

  return [concept, ...(exampleSlide ? [exampleSlide] : []), howJev(traces), numbers, chart];
}

/**
 * Ejemplo animado (avanza solo al tocar): la vacante pide una frase; la
 * búsqueda exacta la busca tal cual y no la encuentra; Jev lee el CV y
 * encuentra la evidencia.
 */
function jevExample(traces: Traces, requirement: string, candidateId: string, row: ComparisonRow, totalReqs: number): HTMLElement {
  const cv = cvsById(traces).get(candidateId)!;
  const name = nameOf(candidateId);
  const from = cv.raw_text.indexOf('HABILIDADES');
  const to = cv.raw_text.indexOf('EXPERIENCIA');
  const excerptText = from >= 0 && to > from ? cv.raw_text.slice(from, to) : cv.raw_text;
  const recordedAt = formatRecordedAt(traces.index.recorded_at);

  const demo = createDemo({
    label: 'Ejemplo: búsqueda exacta y Jev',
    recordedAt,
    build: () => {
      const steps: Step[] = [
        { label: `La vacante pide: "${requirement}".`, dwellMs: 2200 },
        { label: 'La búsqueda exacta busca esa frase, tal cual, dentro del CV.', dwellMs: 2600 },
        { label: 'No la encuentra: el CV no dice esa frase exacta. Para la búsqueda exacta, no cumple.', dwellMs: 2600 },
        { label: 'Jev lee el CV completo y encuentra la evidencia: Docker, Git y GitHub Actions (CI/CD). Cumple.', dwellMs: 3000 },
        { label: `Con los ${totalReqs} requisitos pasa lo mismo.`, hold: 1500 },
      ];
      const stage = h(
        'div.why-stage',
        {},
        h('div.why-req', { 'data-step': 0 }, h('p.why-k', {}, 'La vacante pide'), h('p.why-phrase', {}, `"${requirement}"`)),
        h(
          'div.why-cv',
          {},
          h('p.panel-title', {}, `CV de ${name}`),
          h(
            'div.why-cv-text',
            {},
            docText(
              excerptText,
              [
                { find: 'Docker', step: 3, kind: 'ok' },
                { find: /\bGit\b(?!Hub)/, step: 3, kind: 'ok' },
                { find: 'GitHub Actions (CI/CD)', step: 3, kind: 'ok' },
              ],
              `Habilidades de ${name}`,
            ),
            h('i.scan-line', { 'data-step': 1, 'data-until': 2 }),
          ),
        ),
        h(
          'div.why-lanes',
          {},
          h(
            'div.why-lane',
            {},
            h('p.why-lane-t', {}, h('i.key-det'), 'Búsqueda exacta'),
            h('p.why-lane-s.is-wait', { 'data-step': -1, 'data-until': 1 }, 'esperando'),
            h('p.why-lane-s.is-busy', { 'data-step': 1, 'data-until': 2 }, 'buscando la frase...'),
            h('p.why-lane-s', { 'data-step': 2 }, h('span.verdict.v-bad', {}, 'no lo encontró')),
          ),
          h(
            'div.why-lane.is-jev',
            {},
            h('p.why-lane-t', {}, h('i.key-jev'), 'Jev'),
            h('p.why-lane-s.is-wait', { 'data-step': -1, 'data-until': 3 }, 'esperando'),
            h('p.why-lane-s', { 'data-step': 3 }, h('span.verdict.v-ok', {}, 'cumple')),
          ),
        ),
        h(
          'div.why-total',
          { 'data-step': 4 },
          h('div', {}, h('p.why-k', {}, 'Búsqueda exacta'), h('p.why-big', {}, `${row.deterministic_matched.length} de ${totalReqs}`), h('p.why-sub', {}, `requisitos · nota ${formatScore(row.deterministic_score)}`)),
          h('div.is-jev', {}, h('p.why-k', {}, 'Jev'), h('p.why-big', {}, `${row.jev_matched.length} de ${totalReqs}`), h('p.why-sub', {}, `requisitos · nota ${formatScore(row.jev_score)}`)),
        ),
      );
      return { stage, steps };
    },
  });
  titleDemo(demo.el, 'Por qué Jev · un ejemplo real', 'El mismo requisito, dicho con otras palabras');
  return slide({ id: 'jev-ejemplo', title: 'Un ejemplo real', className: 'slide-demo' }, h('div.demo-host', { 'data-reveal': '' }, demo.el));
}

/** Nota honesta, con un ejemplo de variación tomado de las propias trazas si existe. */
function honestNote(traces: Traces, ranking: MatchEvaluation[]): string {
  const reports = traces.report.events.filter((e) => e.scorer === 'typesafe' && e.result && e.result.score !== null);
  const varied = reports
    .map((e) => ({ report: e.result!, ranked: ranking.find((r) => r.candidate_id === e.result!.candidate_id) }))
    .find(({ report, ranked }) => ranked && ranked.score !== report.score);
  const example = varied
    ? ` Por ejemplo, ${nameOf(varied.report.candidate_id)} obtuvo ${formatScore(varied.ranked!.score)} en una ejecución y ${formatScore(varied.report.score)} en otra.`
    : '';
  return `A tener en cuenta: Jev es un modelo de IA y su nota puede variar un poco entre una ejecución y otra.${example} Además, para calificar, el CV se envía al servicio de TypeSafe.`;
}

/** 20 candidatos: nota con búsqueda exacta y con Jev sobre el mismo eje, con el mínimo. */
function dumbbell(traces: Traces): HTMLElement {
  const threshold = traces.match.threshold;
  const rows = [...traces.match.comparison].sort((a, b) => b.jev_score - a.jev_score || a.candidate_id.localeCompare(b.candidate_id));
  const tooltip = h('div.tooltip', { role: 'status', hidden: true });

  const list = h(
    'ol.dumbbell',
    { 'aria-label': 'Nota con búsqueda exacta y con Jev por candidato' },
    ...rows.map((row, i) => {
      const lo = Math.min(row.deterministic_score, row.jev_score);
      const hi = Math.max(row.deterministic_score, row.jev_score);
      const name = nameOf(row.candidate_id);
      const item = h(
        'li.db-row',
        { tabindex: 0, style: `--i:${i}`, 'aria-label': `${name}: búsqueda exacta ${formatScore(row.deterministic_score)}, Jev ${formatScore(row.jev_score)}` },
        h('span.db-id', {}, who(row.candidate_id)),
        h(
          'span.db-track',
          {},
          h('i.db-threshold', { style: `--t:${threshold * 100}%` }),
          h('i.db-span', { style: `--a:${lo * 100}%;--b:${hi * 100}%` }),
          h('i.db-dot.db-det', { style: `--x:${row.deterministic_score * 100}%` }),
          h('i.db-dot.db-jev', { style: `--x:${row.jev_score * 100}%` }),
        ),
      );
      const show = () => {
        tooltip.hidden = false;
        tooltip.replaceChildren(
          h('p.tt-title', {}, name),
          h('p', {}, h('i.key-det'), `Búsqueda exacta ${formatScore(row.deterministic_score)} · ${row.deterministic_matched.length} requisitos`),
          h('p', {}, h('i.key-jev'), `Jev ${formatScore(row.jev_score)} · ${row.jev_matched.length} requisitos`),
        );
        const box = item.getBoundingClientRect();
        const host = list.getBoundingClientRect();
        tooltip.style.top = `${box.bottom - host.top + 6}px`;
      };
      item.addEventListener('mouseenter', show);
      item.addEventListener('focus', show);
      item.addEventListener('mouseleave', () => (tooltip.hidden = true));
      item.addEventListener('blur', () => (tooltip.hidden = true));
      return item;
    }),
  );

  return h(
    'figure.chart-card.db-card',
    { 'data-reveal': '' },
    h(
      'div.chart-head',
      {},
      h('p.chart-caption', {}, 'Con búsqueda exacta, todos quedan abajo del mínimo. Jev separa a los perfiles que sí calzan.'),
      h('ul.legend', {}, h('li', {}, h('i.key-det'), 'Búsqueda exacta'), h('li', {}, h('i.key-jev'), 'Jev'), h('li', {}, h('i.key-threshold'), `Mínimo ${formatScore(threshold)}`)),
    ),
    h('div.db-axis', { 'aria-hidden': 'true' }, h('span'), h('span.db-scale', {}, ...[0, 0.25, 0.5, 0.75, 1].map((v) => h('span', { style: `--x:${v * 100}%` }, formatScore(v))))),
    h('div.db-host', {}, list, tooltip),
    h(
      'details.disclosure',
      {},
      h('summary', {}, 'Ver como tabla'),
      h(
        'div.table-wrap',
        {},
        h(
          'table.data',
          {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Candidato'), h('th.num', {}, 'Búsqueda exacta'), h('th.num', {}, 'Jev'), h('th.num', {}, 'Requisitos (exacta / Jev)'))),
          h(
            'tbody',
            {},
            ...rows.map((row) =>
              h(
                'tr',
                {},
                h('td', {}, who(row.candidate_id)),
                h('td.num.mono', {}, formatScore(row.deterministic_score)),
                h('td.num.mono', {}, formatScore(row.jev_score)),
                h('td.num.mono', {}, `${row.deterministic_matched.length} / ${row.jev_matched.length}`),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Datos que no cuadran
// ---------------------------------------------------------------------------

const YEARS_MENTION = /(\d+)\s*(?:anos|años|years)/gi; // mismo patrón que _YEARS_MENTION

export function inconsistencies(traces: Traces): HTMLElement[] {
  const events = traces.inconsistencies.events as TraceEvent<CvInconsistencyReport>[];
  const cvs = cvsById(traces);
  const withIssue = events.find((e) => e.result && e.result.issues.length)!;
  const clean = events.find((e) => e.result && !e.result.issues.length)!;
  const flagged = events.filter((e) => e.result?.issues.length);
  const recordedAt = formatRecordedAt(traces.index.recorded_at);

  const caseCard = (event: TraceEvent<CvInconsistencyReport>) => {
    const id = event.result!.candidate_id;
    const cv = cvs.get(id)!;
    const issue = event.result!.issues[0];
    // Menciones: las del mensaje real si hay inconsistencia; si no, las del texto visible.
    const mentioned = issue
      ? (issue.match(/\(\[([\d, ]+)\]\)/)?.[1].split(',').map((n) => Number(n.trim())) ?? [])
      : [...new Set([...cv.raw_text.matchAll(YEARS_MENTION)].map((m) => Number(m[1])))];
    const declared = Math.trunc(cv.years_experience ?? 0);
    const profile = cv.raw_text.slice(cv.raw_text.indexOf('PERFIL'), cv.raw_text.indexOf('HABILIDADES'));
    const matches = mentioned.includes(declared);
    return h(
      'div.inc-case',
      { class: issue ? 'has-issue' : 'no-issue' },
      h('div.inc-head', {}, h('p.inc-name', {}, nameOf(id)), callCard(event, 0, `Revisar el CV de ${nameOf(id)}`)),
      h('div.panel', {}, h('p.panel-title', {}, 'Lo que dice su perfil'), docText(profile, [{ find: YEARS_MENTION, step: 1, kind: issue ? 'warn' : 'ok' }], `Perfil de ${nameOf(id)}`)),
      h(
        'dl.inc-compare',
        {},
        h('div', { 'data-step': 1 }, h('dt', {}, 'El CV dice'), h('dd', {}, `${mentioned.join(' y ')} años de experiencia`)),
        h('div', { 'data-step': 2 }, h('dt', {}, 'Sumando sus trabajos'), h('dd', {}, `${cv.years_experience?.toLocaleString('es')} años`)),
        h(
          'div',
          { 'data-step': 3 },
          h('dt', {}, '¿Coincide?'),
          h('dd', {}, matches ? 'Sí, coincide.' : `No: hay ${Math.abs(declared - Math.min(...mentioned))} años de diferencia (se acepta hasta 1).`),
          h('dd.mono.tech-only', {}, `int(${cv.years_experience}) = ${declared}; ${declared} ${matches ? '∈' : '∉'} {${mentioned.join(', ')}}${matches ? '' : `; |${declared} − ${Math.min(...mentioned)}| > 1`}`),
        ),
      ),
      h('p.inc-result', { 'data-step': 4, class: issue ? 'is-warn' : 'is-ok' }, issue ? 'Se marca para revisar' : 'Sin datos que no cuadren', h('span.tech-only.inc-raw', {}, issue ? ` · ${issue}` : '')),
    );
  };

  const demo = createDemo({
    label: 'Demo: revisar datos que no cuadran',
    recordedAt,
    build: () => {
      const steps: Step[] = [
        { label: 'Se revisan dos CVs.', realMs: Math.max(withIssue.duration_ms, clean.duration_ms), code: { excerpt: 'inc.detect', line: 'def execute(self, cv: CandidateCv)' } },
        { label: 'Busca en el texto cuántos años de experiencia dice tener cada persona.', code: { excerpt: 'inc.detect', line: 'mentioned_years = {int(m.group(1)) for m in _YEARS_MENTION.finditer(cv.raw_text)}' } },
        { label: 'Lo compara con los años que salen de sumar sus trabajos.', code: { excerpt: 'inc.detect', line: 'declared = int(cv.years_experience)' } },
        { label: 'Si la diferencia es de más de 1 año, es un dato que no cuadra.', code: { excerpt: 'inc.detect', line: 'if declared not in mentioned_years and abs(declared - min(mentioned_years)) > 1:' }, hold: 500 },
        { label: `${nameOf(withIssue.result!.candidate_id)} queda marcada para revisar; ${nameOf(clean.result!.candidate_id)}, no.`, code: { excerpt: 'inc.detect', line: 'Experiencia declarada (' } },
      ];
      const stage = h('div.inc-stage', {}, caseCard(withIssue), caseCard(clean));
      return { stage, steps, excerpts: ['inc.detect'] };
    },
  });

  return toolSheet({
    id: 'inconsistencias',
    chapter: 'Datos que no cuadran',
    kicker: 'Paso 4 · Revisar datos que no cuadran',
    title: 'Detectar lo que el CV se contradice',
    lead: 'Por ejemplo, un perfil que dice "6 años de experiencia" cuando sus trabajos suman casi 9.',
    owner: 'Randall Carranza Solano',
    task: 'ta_detectar_inconsistencias',
    tools: [withIssue.tool],
    simple: {
      receives: 'El CV ya leído: lo que dice el texto y los años calculados.',
      does: 'Compara los años que la persona dice tener con los que suman sus trabajos.',
      delivers: 'La lista de datos que no cuadran, o ninguna si todo coincide.',
    },
    why: 'no se descarta ni se avanza a nadie sobre un dato dudoso: primero se aclara.',
    under: [
      'Compara years_experience (entero) con las menciones "N años" del texto; si no está entre ellas y difiere en más de 1 de la menor, lo reporta.',
      'También detecta CVs vacíos y años mencionados que no se pudieron estructurar.',
      'Devuelve la lista de issues.',
    ],
    demo: demo.el,
    demoTitle: 'Dos CVs, uno con un dato que no cuadra',
    how: howInconsistencies(traces),
    introExtra: [
      h(
        'div.inc-summary',
        { 'data-reveal': '' },
        h('p', {}, h('strong', {}, `${flagged.length} de ${events.length}`), ' CVs de prueba tienen un dato de experiencia que no cuadra.'),
        h('div.file-chips.is-static', {}, ...events.map((e) => h('span.chip', { class: e.result?.issues.length ? 'chip-warn' : 'chip-ok', title: e.result?.issues[0] ?? 'sin datos que no cuadren' }, who(e.result?.candidate_id ?? '')))),
        h('p.muted', {}, 'Parte de estos avisos se debe a los CVs de prueba: varios se escribieron en 2024, y "hasta la actualidad" hoy suma más años de los que dice el perfil.'),
      ),
    ],
  });
}

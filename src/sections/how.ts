// "Cómo se arma": una animación por herramienta que la construye pieza por
// pieza con datos reales de las trazas, sin código. Avanza solo con botones.

import { buildAnim } from '../components/build';
import { section, statusPill } from '../components/layout';
import { h, s } from '../core/dom';
import { nameOf } from '../core/names';
import { findEvent, formatScore } from '../core/trace-loader';
import type {
  CandidateCv,
  CvInconsistencyReport,
  InterviewHandoff,
  JobDescription,
  ListResult,
  MatchEvaluation,
  PrescreeningConversation,
  ScreeningReport,
  ScreeningReportBatchResult,
  Traces,
} from '../core/types';
import type { Sheet } from '../core/xlsx';

type Attrs = Record<string, string | number | undefined>;

const EXPERIENCE = /^experiencia_minima_(\d+(?:\.\d+)?)_anos$/;
const num = (n: number, dec = 1) => n.toLocaleString('es', { maximumFractionDigits: dec });
const years = (n: number) => `${num(n)} ${n === 1 ? 'año' : 'años'}`;
/** Texto de la traza con las tildes que el código omite ("anos" → "años"). */
const accents = (text: string) => text.replace(/\banos\b/g, 'años').replace(/\bIngles\b/g, 'Inglés');

// ---------------------------------------------------------------------------
// Piezas visuales comunes
// ---------------------------------------------------------------------------

function doc(name: string, lines: HTMLElement[], attrs: Attrs = {}): HTMLElement {
  return h(
    'div.hw-doc',
    attrs,
    h('div.hw-doc-head', {}, h('span.hw-file', { 'aria-hidden': 'true' }), h('span.hw-doc-name', {}, name)),
    h('div.hw-lines', {}, ...lines),
  );
}

function line(text: string | Node, attrs: Attrs = {}, kind = ''): HTMLElement {
  return h('div.hw-line', { ...attrs, class: kind }, text);
}

function field(label: string, value: Node | string, attrs: Attrs = {}): HTMLElement {
  return h('div.hw-field', attrs, h('p.hw-field-k', {}, label), h('div.hw-field-v', {}, value));
}

function chip(text: string, attrs: Attrs = {}, kind = ''): HTMLElement {
  return h('span.hw-chip', { ...attrs, class: kind }, text);
}

function counter(to: number, dec: number, attrs: Attrs = {}): HTMLElement {
  return h('span.hw-count', { 'data-count': '', 'data-to': to, 'data-dec': dec, ...attrs }, '0');
}

function from(text: string): HTMLElement {
  return h('p.hw-from', {}, text);
}

function howSlide(id: string, chapter: string, kicker: string, title: string, lead: string, anim: HTMLElement): HTMLElement {
  return section({ id, chapter, kicker, title, lead, compact: true, className: 'slide-how' }, h('div', { 'data-reveal': '' }, anim));
}

function jdOf(traces: Traces): JobDescription {
  return findEvent(traces.jd, (e) => !e.is_error, 'JD').result as JobDescription;
}

function cvsOf(traces: Traces): CandidateCv[] {
  return findEvent(traces.cv, (e) => e.args.vacancy_id === traces.index.vacancy, 'CVs').result!.result;
}

function jevRanking(traces: Traces): MatchEvaluation[] {
  const event = findEvent(traces.match, (e) => e.tool.endsWith('candidate_ranking_top_n') && e.scorer === 'typesafe', 'ranking Jev');
  return (event.result as ListResult<MatchEvaluation>).result;
}

/** Líneas visibles del CV en la traza (sin el recorte final ni datos enmascarados). */
function cvLines(cv: CandidateCv, max: number): string[] {
  return cv.raw_text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.includes('[...]') && !l.includes('<telefono>'))
    .map((l) => l.replace('<correo>', 'correo oculto'))
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// Oscar · Leer la vacante
// ---------------------------------------------------------------------------

export function howJd(traces: Traces): HTMLElement {
  const jd = jdOf(traces);
  const lines = [
    ...jd.requirements.map((r) => line(h('span', {}, h('b.hw-key', {}, 'requirement: '), accents(r)), { 'data-at': 2, 'data-mark': 3, 'data-cur': 4 }, 'is-req')),
    ...jd.nice_to_have.map((r) => line(h('span', {}, h('b.hw-key', {}, 'nice_to_have: '), r), { 'data-at': 2, 'data-mark': 3, 'data-cur': 5 }, 'is-nice')),
    line(h('span', {}, h('b.hw-key', {}, 'min_experience_years: '), String(jd.min_experience_years ?? '-')), { 'data-at': 2, 'data-mark': 3, 'data-cur': 6 }, 'is-min'),
    line('---', { 'data-at': 2, 'data-off': 3 }, 'is-sep'),
    line('Job Description - Senior AI Engineer', { 'data-at': 2, 'data-off': 3, 'data-cur': 7 }, 'is-prose'),
    line('Modalidad, responsabilidades y beneficios…', { 'data-at': 2, 'data-off': 3, 'data-cur': 7 }, 'is-prose'),
  ].map((el, i) => (el.style.setProperty('--i', String(i)), el));

  const input = h(
    'div.hw-stack',
    {},
    h('div.hw-formats', { 'data-at': 1 }, chip('PDF'), chip('Word'), chip('Texto'), h('span.hw-muted', {}, 'el formato que llegue')),
    doc('Documento de la vacante', lines, { 'data-at': 1 }),
  );
  const output = h(
    'div.hw-card.hw-sheet',
    { 'data-at': 4 },
    h('p.hw-sheet-t', {}, 'Ficha de la vacante'),
    field('Obligatorios', h('div.hw-chips', {}, ...jd.requirements.map((r, i) => chip(accents(r), { 'data-at': 4, style: `--i:${i}` }, 'is-req'))), { 'data-at': 4 }),
    field('Deseables', h('div.hw-chips', {}, ...jd.nice_to_have.map((r, i) => chip(r, { 'data-at': 5, style: `--i:${i}` }, 'is-nice'))), { 'data-at': 5 }),
    field('Experiencia mínima', h('p.hw-big', {}, counter(jd.min_experience_years ?? 0, 0), h('span.hw-unit', {}, ' años')), { 'data-at': 6 }),
    field('Texto completo', h('p.hw-muted', {}, 'Se guarda para que Jev tenga todo el contexto.'), { 'data-at': 7 }),
  );

  const anim = buildAnim({
    tool: 'Leer la vacante',
    input: { title: 'Recibe', body: input },
    output: { title: 'Entrega', body: output },
    steps: [
      { piece: 'Buscar el documento', title: 'Encuentra el documento de la vacante', text: 'Lo busca en la carpeta de la vacante, venga en PDF, Word o texto.' },
      { piece: 'Sacar el texto', title: 'Saca el texto del documento', text: 'Del archivo solo importa lo escrito: se lee línea por línea.' },
      {
        piece: 'Reconocer cada parte',
        title: 'Reconoce qué es cada línea',
        text: 'Esta vacante marca cada requisito con una etiqueta. Si viniera en texto libre, busca los títulos "Requisitos" y "Deseable".',
      },
      { piece: 'Lista de obligatorios', title: `Arma los ${jd.requirements.length} requisitos obligatorios`, text: 'Es la lista contra la que se mide a cada candidato.' },
      { piece: 'Lista de deseables', title: `Separa los ${jd.nice_to_have.length} deseables`, text: 'Suman contexto, pero no son obligatorios.' },
      { piece: 'Experiencia mínima', title: `Lee la experiencia mínima: ${jd.min_experience_years ?? '-'} años`, text: 'Se guarda como número, para compararla después sin interpretaciones.' },
      { piece: 'Guardar el texto', title: 'Guarda el texto completo', text: 'La descripción en prosa no se pierde: Jev la usa como contexto. La ficha de la vacante queda lista.' },
    ],
  });
  return howSlide('leer-jd', 'Leer la vacante', 'Herramienta de Oscar', 'Leer la vacante', 'Convierte la descripción del puesto en una lista clara de requisitos. Ejemplo: la vacante de prueba Senior AI Engineer.', anim);
}

// ---------------------------------------------------------------------------
// Oscar · Leer los CVs
// ---------------------------------------------------------------------------

export function howCv(traces: Traces): HTMLElement {
  const cvs = cvsOf(traces);
  const cv = cvs[0];
  const name = nameOf(cv.candidate_id);
  const text = cvLines(cv, 18);
  const expAt = text.findIndex((l) => /^EXPERIENCIA/i.test(l));
  const skillsAt = text.findIndex((l) => /^HABILIDADES/i.test(l));
  const lines = text.map((l, i) => {
    const isPeriod = /\((?:19|20)\d{2}\s*[-–—]/.test(l);
    const isSkill = i > skillsAt && skillsAt >= 0 && (expAt < 0 || i < expAt);
    const attrs: Attrs = { 'data-at': 2, style: `--i:${i}` };
    if (isPeriod || i === expAt) Object.assign(attrs, { 'data-mark': 3, 'data-cur': '3 4' });
    if (isSkill || i === skillsAt) Object.assign(attrs, { 'data-mark': 5, 'data-cur': 5 });
    return line(l, attrs, isPeriod || i === expAt ? 'is-req' : isSkill || i === skillsAt ? 'is-nice' : '');
  });
  const periods = text.filter((l) => /\((?:19|20)\d{2}\s*[-–—]/.test(l)).map((l) => l.match(/\(([^)]+)\)/)![1].replace('Actualidad', 'hoy'));
  const shown = cv.skills.slice(0, 12);

  const input = h(
    'div.hw-stack',
    {},
    h(
      'div.hw-files',
      { 'data-at': 1 },
      ...cvs.map((c, i) => h('span.hw-file-mini', { class: i === 0 ? 'is-picked' : '', style: `--i:${i}`, title: nameOf(c.candidate_id) })),
      h('span.hw-muted', {}, `${cvs.length} archivos, con el nombre que traigan`),
    ),
    doc(`CV de ${name}`, lines, { 'data-at': 1 }),
  );
  const output = h(
    'div.hw-card.hw-sheet',
    { 'data-at': 3 },
    h('p.hw-sheet-t', {}, `Ficha de ${name}`),
    field(
      'Trabajos encontrados',
      h(
        'div.hw-timeline',
        {},
        ...periods.map((p, i) => h('div.hw-tl', { 'data-at': 3, style: `--i:${i}` }, h('span.hw-tl-bar'), h('span.hw-tl-t', {}, p))),
        h('div.hw-tl.is-faint', { 'data-at': 3, style: `--i:${periods.length}` }, h('span.hw-tl-bar'), h('span.hw-tl-t', {}, 'trabajos anteriores')),
      ),
      { 'data-at': 3 },
    ),
    field(
      'Años de experiencia',
      h(
        'div',
        {},
        h('p.hw-big', {}, counter(cv.years_experience ?? 0, 1), h('span.hw-unit', {}, ' años')),
        h('div.hw-rules', {}, chip('las pasantías no cuentan', {}, 'is-rule'), chip('lo que se superpone cuenta una vez', {}, 'is-rule')),
      ),
      { 'data-at': 4 },
    ),
    field(
      'Habilidades',
      h('div.hw-chips', {}, ...shown.map((s, i) => chip(s, { 'data-at': 5, style: `--i:${i}` }, 'is-nice')), cv.skills.length > shown.length ? chip(`+${cv.skills.length - shown.length} más`, { 'data-at': 5, style: `--i:${shown.length}` }, 'is-more') : null),
      { 'data-at': 5 },
    ),
    field('Texto completo', h('p.hw-muted', {}, 'Se guarda entero: ahí Jev busca la evidencia.'), { 'data-at': 6 }),
  );

  const anim = buildAnim({
    tool: 'Leer los CVs',
    input: { title: 'Recibe', body: input },
    output: { title: 'Entrega', body: output },
    steps: [
      { piece: 'Tomar cada archivo', title: `Toma los ${cvs.length} CVs de la vacante`, text: 'Tal como llegaron, sin renombrarlos. Aquí seguimos uno: el de ' + name + '.' },
      { piece: 'Sacar el texto', title: 'Saca el texto del CV', text: 'Funciona con PDF, Word o texto. Si un archivo está dañado, lo marca y sigue con el resto.' },
      { piece: 'Encontrar los trabajos', title: 'Encuentra cada trabajo y sus fechas', text: 'Busca la sección de experiencia y los periodos "desde – hasta". "Actualidad" se cuenta hasta hoy.' },
      { piece: 'Sumar el tiempo', title: `Suma el tiempo trabajado: ${years(cv.years_experience ?? 0)}`, text: 'Cuenta meses. Las pasantías no suman y dos trabajos al mismo tiempo cuentan una sola vez.' },
      { piece: 'Anotar habilidades', title: `Anota sus ${cv.skills.length} habilidades`, text: 'Las toma de la sección de habilidades y de las líneas "Tecnologías utilizadas".' },
      { piece: 'Guardar el texto', title: 'Guarda el texto completo', text: 'Si un CV no trae trabajos ni habilidades, sale marcado como "sin información" en vez de inventar datos.' },
    ],
  });
  return howSlide('leer-cv', 'Leer los CVs', 'Herramienta de Oscar', 'Leer los CVs', `Saca de cada CV los años de experiencia y las habilidades. Ejemplo: el CV de prueba de ${name}.`, anim);
}

// ---------------------------------------------------------------------------
// Por qué Jev · cómo decide por dentro
// ---------------------------------------------------------------------------

const FIT_LEVELS = ['No cumple ningún requisito obligatorio', 'Cumple menos de la mitad', 'Cumple la mayoría, con brechas menores', 'Cumple todos los obligatorios'];

export function howJev(traces: Traces): HTMLElement {
  const jd = jdOf(traces);
  const ranking = jevRanking(traces);
  // Un candidato con respuestas mixtas muestra mejor el sí y el no.
  const pick = ranking.find((e) => e.matched_requirements.length > 0 && e.missing_requirements.some((m) => EXPERIENCE.test(m))) ?? ranking[0];
  const cv = cvsOf(traces).find((c) => c.candidate_id === pick.candidate_id)!;
  const name = nameOf(pick.candidate_id);
  const expMissing = pick.missing_requirements.find((m) => EXPERIENCE.test(m));
  const level = pick.score * (FIT_LEVELS.length - 1);
  const minYears = jd.min_experience_years ?? 0;
  const yearsOk = (cv.years_experience ?? 0) >= minYears;

  const stage = h(
    'div.jv-grid',
    {},
    h(
      'div.jv-input',
      { 'data-at': 1 },
      h('div.hw-card.jv-mini', {}, h('p.hw-field-k', {}, 'Vacante'), h('p.hw-strong', {}, `${jd.requirements.length} requisitos obligatorios`), h('p.hw-muted', {}, `y ${minYears} años de experiencia mínima`)),
      h('span.jv-plus', { 'aria-hidden': 'true' }, '+'),
      h('div.hw-card.jv-mini', {}, h('p.hw-field-k', {}, `CV de ${name}`), h('p.hw-strong', {}, `${cv.skills.length} habilidades · ${years(cv.years_experience ?? 0)}`), h('p.hw-muted', {}, 'y el texto completo')),
      h('div.jv-criteria', { 'data-at': 3 }, h('p.hw-field-k', {}, 'Cómo debe responder'), h('p', {}, h('b.is-yes', {}, 'Sí: '), 'el CV muestra experiencia, un proyecto o una habilidad concreta.'), h('p', {}, h('b.is-no', {}, 'No: '), 'no lo menciona, o solo de forma vaga.')),
    ),
    h(
      'ol.jv-questions',
      { 'data-at': 2 },
      ...jd.requirements.map((r, i) => {
        const yes = pick.matched_requirements.includes(r);
        return h(
          'li.jv-q',
          { 'data-at': 2, style: `--i:${i}` },
          h('span.jv-q-t', {}, '¿Cumple "', accents(r), '"?'),
          h('span.jv-a', { 'data-at': 4, class: yes ? 'is-yes' : 'is-no', style: `--i:${i}` }, yes ? 'sí' : 'no'),
        );
      }),
    ),
    h(
      'div.jv-ladder',
      { 'data-at': 5 },
      h('p.hw-field-k', {}, 'Nota general: ¿en qué nivel está?'),
      h(
        'div.jv-levels',
        { style: `--lv:${level}` },
        ...FIT_LEVELS.map((t, i) => h('div.jv-level', { class: Math.round(level) === i ? 'is-hit' : '', style: `--l:${i}` }, h('span.jv-level-n', {}, String(i)), h('span', {}, t))).reverse(),
        h('span.jv-marker', { 'aria-hidden': 'true' }, h('span', {}, formatScore(pick.score))),
      ),
    ),
    h(
      'div.jv-exp',
      { 'data-at': 6 },
      h('p.hw-field-k', {}, 'Experiencia mínima: una comparación exacta'),
      h(
        'div.jv-bars',
        { style: `--max:${Math.max(minYears, cv.years_experience ?? 0) * 1.15}` },
        h('div.jv-bar', { style: `--v:${cv.years_experience ?? 0}` }, h('span.jv-bar-fill', { class: yearsOk ? 'is-ok' : 'is-bad' }), h('span.jv-bar-t', {}, `${name}: ${years(cv.years_experience ?? 0)}`)),
        h('div.jv-bar', { style: `--v:${minYears}` }, h('span.jv-bar-fill.is-need'), h('span.jv-bar-t', {}, `Pide: ${minYears} años`)),
      ),
      h('p.hw-muted', {}, yearsOk ? 'Llega al mínimo.' : 'No llega al mínimo: se anota como faltante.'),
    ),
    h(
      'div.jv-result',
      { 'data-at': 6 },
      h('p.hw-field-k', {}, 'Resultado'),
      h('p.hw-big', {}, formatScore(pick.score)),
      h('p.hw-muted', {}, `Cumple ${pick.matched_requirements.length} de ${jd.requirements.length}${expMissing ? ' · no llega a la experiencia' : ''}`),
    ),
  );

  const anim = buildAnim({
    tool: 'Jev',
    layout: 'wide',
    stage,
    hint: 'Toca "Empezar" o usa la flecha derecha para ver cómo decide Jev, paso a paso.',
    steps: [
      { piece: 'Juntar vacante y CV', title: 'Recibe la vacante y el CV completo', text: `No solo la lista de habilidades: todo el texto del CV de ${name}.` },
      { piece: 'Una pregunta por requisito', title: `Se hace ${jd.requirements.length} preguntas, una por requisito`, text: 'Cada requisito se responde por separado, con un sí o un no.' },
      { piece: 'Exigir evidencia', title: 'Exige evidencia concreta', text: 'Una mención de pasada no alcanza: tiene que haber experiencia, un proyecto o una habilidad que lo demuestre.' },
      {
        piece: 'Responder sí o no',
        title: `Responde: ${pick.matched_requirements.length} sí y ${jd.requirements.length - pick.matched_requirements.length} no`,
        text: 'Cuenta como sí cuando Jev está al menos 50 % seguro. Por ejemplo, "Docker básico" sin CI/CD no alcanza para "Docker, Git y CI/CD".',
      },
      { piece: 'Nota general', title: `Ubica al candidato en una escala de 4 niveles: ${formatScore(pick.score)}`, text: 'La nota es esa posición llevada de 0 a 1: puede quedar entre dos niveles.' },
      {
        piece: 'Comparar la experiencia',
        title: 'La experiencia mínima se compara como número',
        text: 'Comparar dos números no necesita un modelo: es una cuenta exacta. Con eso, Jev entrega la nota, lo que cumple y lo que falta.',
      },
    ],
  });
  return howSlide('jev', 'Cómo califica Jev', 'Presenta Oscar', 'Cómo califica Jev', `Lee el CV completo como lo haría una persona y responde requisito por requisito. Ejemplo con sí y no: ${name}.`, anim);
}

// ---------------------------------------------------------------------------
// Randall · Calificar un CV
// ---------------------------------------------------------------------------

export function howEvaluate(traces: Traces): HTMLElement {
  const jd = jdOf(traces);
  const threshold = traces.match.threshold;
  const jev = findEvent(traces.match, (e) => e.tool.endsWith('candidate_match_evaluate') && e.scorer === 'typesafe', 'evaluación Jev').result as MatchEvaluation;
  const cv = cvsOf(traces).find((c) => c.candidate_id === jev.candidate_id)!;
  const name = nameOf(jev.candidate_id);
  const minYears = jd.min_experience_years ?? 0;
  const yearsOk = (cv.years_experience ?? 0) >= minYears;
  const circ = 2 * Math.PI * 52;

  const stage = h(
    'div.ev-grid',
    {},
    h(
      'div.hw-card.ev-in.ev-jd',
      { 'data-at': 1 },
      from('Viene de: Leer la vacante'),
      h('p.hw-sheet-t', {}, 'Ficha de la vacante'),
      h('div.hw-chips', {}, ...jd.requirements.map((r) => chip(accents(r), {}, 'is-req'))),
      h('p.hw-muted', {}, `Mínimo ${minYears} años de experiencia`),
    ),
    h(
      'div.ev-core',
      {},
      h('div.ev-engine', { 'data-at': 3 }, h('span.ev-engine-ring', { 'aria-hidden': 'true' }), h('span.ev-engine-t', {}, 'Jev')),
      h(
        'ol.ev-rows',
        { 'data-at': 4 },
        ...jd.requirements.map((r, i) => {
          const ok = jev.matched_requirements.includes(r);
          return h('li.ev-row', { style: `--i:${i}` }, h('span.ev-check', { class: ok ? 'is-ok' : 'is-no' }, h('i')), h('span', {}, accents(r)));
        }),
      ),
    ),
    h(
      'div.hw-card.ev-in.ev-cv',
      { 'data-at': 2 },
      from('Viene de: Leer los CVs'),
      h('p.hw-sheet-t', {}, `Ficha de ${name}`),
      h('p.hw-strong', {}, years(cv.years_experience ?? 0)),
      h('div.hw-chips', {}, ...cv.skills.slice(0, 9).map((s) => chip(s, {}, 'is-nice')), chip(`+${Math.max(0, cv.skills.length - 9)}`, {}, 'is-more')),
      h('p.hw-muted', {}, 'y el texto completo'),
    ),
    h(
      'div.hw-card.ev-exp',
      { 'data-at': 5 },
      h('p.hw-field-k', {}, 'Experiencia'),
      h('p.hw-big', {}, num(cv.years_experience ?? 0), h('span.hw-unit', {}, ` ${yearsOk ? '≥' : '<'} ${minYears} años`)),
      h('p', { class: yearsOk ? 'hw-ok' : 'hw-bad' }, yearsOk ? 'Llega al mínimo' : 'No llega al mínimo'),
    ),
    h(
      'div.hw-card.ev-score',
      { 'data-at': 6 },
      h(
        'div.ev-gauge',
        {},
        s('svg', { viewBox: '0 0 120 120', html: `<circle class="ev-g-track" cx="60" cy="60" r="52"/><circle class="ev-g-fill" cx="60" cy="60" r="52" style="--c:${circ};--v:${circ * (1 - jev.score)}"/>` }),
        h('span.ev-g-n', {}, counter(jev.score, 2, { 'data-ms': 1300 })),
      ),
      h(
        'div',
        {},
        h('p.hw-field-k', {}, 'Nota'),
        h('p.hw-strong', {}, `Cumple ${jev.matched_requirements.length} de ${jd.requirements.length} requisitos`),
        h('p', { class: jev.score >= threshold ? 'hw-ok' : 'hw-bad' }, `${jev.score >= threshold ? 'Llega' : 'No llega'} al mínimo de ${formatScore(threshold)}`),
      ),
    ),
  );

  const anim = buildAnim({
    tool: 'Calificar un CV',
    layout: 'wide',
    stage,
    steps: [
      { piece: 'Pedir la vacante', title: 'Usa la ficha de la vacante', text: 'La que armó la herramienta "Leer la vacante": los requisitos y la experiencia mínima.' },
      { piece: 'Pedir el CV', title: `Usa la ficha de ${name}`, text: 'La que armó "Leer los CVs": años de experiencia, habilidades y texto completo.' },
      { piece: 'Pasárselas a Jev', title: 'Le pasa las dos fichas a Jev', text: 'Jev lee el CV completo contra cada requisito, como lo haría una persona.' },
      { piece: 'Requisito por requisito', title: `Revisa los ${jd.requirements.length} requisitos uno por uno`, text: 'Cada uno queda como cumplido o como faltante, con lo que encontró en el CV.' },
      { piece: 'Comparar la experiencia', title: `Compara la experiencia: ${years(cv.years_experience ?? 0)} contra ${minYears}`, text: 'Es una comparación exacta de números.' },
      { piece: 'Calcular la nota', title: `Entrega la nota: ${formatScore(jev.score)}`, text: `De 0 a 1, junto con lo que cumple y lo que le falta. El mínimo para avanzar es ${formatScore(threshold)}.` },
    ],
  });
  return howSlide('evaluar', 'Calificar cada CV', 'Herramienta de Randall', 'Calificar cada CV', 'Junta la vacante y el CV y saca una nota de 0 a 1, con lo que cumple y lo que falta.', anim);
}

// ---------------------------------------------------------------------------
// Randall · Ranking de la vacante
// ---------------------------------------------------------------------------

export function howRanking(traces: Traces): HTMLElement {
  const ranking = jevRanking(traces);
  const files = [...ranking].sort((a, b) => (a.candidate_id < b.candidate_id ? -1 : 1));
  const cols = 4;
  const top = 5;
  const counts = new Map<number, number>();
  ranking.forEach((e) => counts.set(e.score, (counts.get(e.score) ?? 0) + 1));

  const cards = files.map((e, i) => {
    const rank = ranking.indexOf(e);
    const tie = (counts.get(e.score) ?? 0) > 1;
    return h(
      'div.rk-card',
      {
        'data-at': 1,
        'data-cur': tie ? 4 : undefined,
        'data-off': rank >= top ? 5 : undefined,
        style: `--i:${i};--c0:${i % cols};--r0:${Math.floor(i / cols)};--c1:${rank % cols};--r1:${Math.floor(rank / cols)}`,
      },
      h('span.rk-pos', {}, String(rank + 1)),
      h('span.rk-name', {}, nameOf(e.candidate_id)),
      h('span.rk-score', { 'data-at': 2, style: `--i:${i}` }, formatScore(e.score)),
    );
  });
  const stage = h(
    'div.rk-stage',
    {},
    h('div.rk-board', { style: `--rows:${Math.ceil(files.length / cols)}` }, ...cards, h('div.rk-cut', { 'data-at': 5, style: `--r:${Math.floor(top / cols)};--c:${top % cols}` }, h('span', {}, `Hasta aquí: top ${top}, por ejemplo`))),
  );

  const anim = buildAnim({
    tool: 'Ranking de la vacante',
    layout: 'wide',
    stage,
    onStep: (step, root) => root.querySelector('.rk-board')!.classList.toggle('is-sorted', step >= 3),
    steps: [
      { piece: 'Pedir todos los CVs', title: `Toma los ${files.length} CVs de la vacante`, text: 'En el orden de la carpeta. Funciona igual con 5 que con 100.' },
      { piece: 'Calificar a cada uno', title: 'Califica a cada uno con Jev', text: 'Usa la misma herramienta "Calificar un CV", una vez por candidato.' },
      { piece: 'Ordenar por nota', title: 'Ordena de mayor a menor nota', text: 'El mejor queda primero.' },
      { piece: 'Desempatar', title: 'Si hay empate, desempata por nombre de archivo', text: 'Así el orden sale siempre igual, sin depender de la suerte.' },
      { piece: 'Entregar los primeros', title: 'Entrega los primeros que se pidan', text: `El reclutador elige cuántos quiere ver; aquí, los ${top} primeros.` },
    ],
  });
  return howSlide('ranking', 'Ranking', 'Herramienta de Randall', 'Ranking de la vacante', 'Califica a todos los candidatos y los ordena de mejor a peor. Con los 20 CVs de prueba.', anim);
}

// ---------------------------------------------------------------------------
// Randall · Datos que no cuadran
// ---------------------------------------------------------------------------

export function howInconsistencies(traces: Traces): HTMLElement {
  const reports = traces.inconsistencies.events.map((e) => e.result as CvInconsistencyReport);
  const flagged = reports.filter((r) => r.issues.length);
  const target = flagged.find((r) => r.candidate_id.startsWith('AI')) ?? flagged[0];
  const cv = cvsOf(traces).find((c) => c.candidate_id === target.candidate_id)!;
  const name = nameOf(cv.candidate_id);
  const mentioned = [...new Set([...cv.raw_text.matchAll(/(\d+)\s*(?:anos|años|years)/gi)].map((m) => Number(m[1])))];
  const declared = Math.trunc(cv.years_experience ?? 0);
  const diff = Math.abs(declared - Math.min(...mentioned));
  const clean = cvsOf(traces).find((c) => reports.find((r) => r.candidate_id === c.candidate_id && !r.issues.length) && /\d+\s*años/.test(c.raw_text))!;

  const mark = (text: string) => {
    const parts = text.split(/(\d+\s*(?:anos|años|years))/i);
    return h('span', {}, ...parts.map((p, i) => (i % 2 ? h('mark.hw-hit', { 'data-mark': 2, 'data-cur': '2 3' }, p) : p)));
  };
  const lines = cvLines(cv, 14).map((l, i) => line(mark(l), { 'data-at': 1, style: `--i:${i}` }));

  const output = h(
    'div.hw-stack',
    {},
    field('Años calculados con las fechas', h('p.hw-big', {}, counter(cv.years_experience ?? 0, 1), h('span.hw-unit', {}, ' años')), { 'data-at': 1, 'data-cur': 3 }),
    field('Años que menciona el texto', h('p.hw-big', {}, mentioned.join(' y '), h('span.hw-unit', {}, ' años')), { 'data-at': 2, 'data-cur': 3 }),
    h(
      'div.hw-card.ic-compare',
      { 'data-at': 3 },
      h('div.ic-nums', {}, h('span.ic-n', {}, String(declared)), h('span.ic-vs', {}, 'frente a'), h('span.ic-n', {}, mentioned.join(', '))),
      h('p', {}, `Diferencia de ${diff} años. Se tolera hasta 1.`),
    ),
    h('div.hw-card.ic-flag', { 'data-at': 4 }, h('p.hw-field-k', {}, 'Dato que no cuadra'), h('p', {}, `La experiencia calculada (${years(cv.years_experience ?? 0)}) no coincide con lo que dice el texto (${mentioned.join(', ')}).`), h('p.hw-muted', {}, 'No descarta a nadie: pide aclararlo.')),
    h(
      'div.hw-card.ic-all',
      { 'data-at': 5 },
      h('p.hw-big', {}, counter(flagged.length, 0), h('span.hw-unit', {}, ` de ${reports.length} CVs`)),
      h('p.hw-muted', {}, `con un dato que aclarar. En cambio, ${nameOf(clean.candidate_id)} dice ${clean.raw_text.match(/(\d+)\s*años/)![1]} años y se calcularon ${num(clean.years_experience ?? 0)}: coincide.`),
    ),
  );

  const anim = buildAnim({
    tool: 'Revisar datos que no cuadran',
    input: { title: 'Recibe', body: doc(`CV de ${name}`, lines, { 'data-at': 1 }) },
    output: { title: 'Entrega', body: output },
    steps: [
      { piece: 'Traer los años calculados', title: `Toma los años calculados: ${years(cv.years_experience ?? 0)}`, text: 'Los que sumó "Leer los CVs" a partir de las fechas de cada trabajo.' },
      { piece: 'Buscar "N años"', title: 'Busca en el texto frases como "6 años"', text: 'Lo que la persona escribió sobre sí misma.' },
      { piece: 'Comparar', title: `Compara: ${declared} frente a ${mentioned.join(', ')}`, text: 'Si el número calculado aparece en el texto, o la diferencia es de 1 año o menos, todo cuadra.' },
      { piece: 'Marcar el dato', title: 'Marca el dato que no cuadra', text: 'No decide nada: deja una nota para que se aclare con el candidato.' },
      { piece: 'Repetir con todos', title: `Lo hace con los ${reports.length} CVs`, text: 'También avisa si un CV llega vacío o si menciona años que no se pudieron calcular.' },
    ],
  });
  return howSlide('inconsistencias', 'Datos que no cuadran', 'Herramienta de Randall', 'Datos que no cuadran', `Avisa cuando el CV se contradice, para aclararlo antes de decidir. Ejemplo: ${name}.`, anim);
}

// ---------------------------------------------------------------------------
// Stward · Informe con recomendación
// ---------------------------------------------------------------------------

export function howReport(traces: Traces): HTMLElement {
  const events = traces.report.events.filter((e) => e.scorer === 'typesafe' && !e.is_error);
  const report = (events.find((e) => e.result?.recommendation === 'revisar') ?? events[0]).result as ScreeningReport;
  const name = nameOf(report.candidate_id);
  const threshold = traces.match.threshold;
  const inc = report.inconsistencies.length;
  const gate = (n: number, q: string, yes: string, no: string, exit: 'no_procesable' | 'revisar' | 'avanzar', attrs: Attrs, answer: string, exitNo?: 'descartar') =>
    h(
      'div.rp-gate',
      attrs,
      h('span.rp-n', {}, String(n)),
      h('p.rp-q', {}, q),
      h('div.rp-exits', {}, h('span.rp-exit', {}, h('span.hw-muted', {}, `${yes} → `), statusPill(exit)), h('span.rp-exit.is-next', {}, h('span.hw-muted', {}, `${no} → `), exitNo ? statusPill(exitNo) : 'siguiente pregunta')),
      h('p.rp-answer', {}, answer),
    );

  const stage = h(
    'div.rp-grid',
    {},
    h(
      'div.rp-inputs',
      {},
      h('div.hw-card', { 'data-at': 1, style: '--i:0' }, from('De: Leer los CVs'), h('p.hw-strong', {}, 'CV legible')),
      h('div.hw-card', { 'data-at': 1, style: '--i:1' }, from('De: Calificar'), h('p.hw-strong', {}, `Nota ${formatScore(report.score)}`)),
      h('div.hw-card', { 'data-at': 1, style: '--i:2' }, from('De: Datos que no cuadran'), h('p.hw-strong', {}, `${inc} ${inc === 1 ? 'dato' : 'datos'} por aclarar`)),
    ),
    h(
      'div.rp-gates',
      {},
      gate(1, '¿No se pudo leer el CV?', 'sí', 'no', 'no_procesable', { 'data-at': 2, 'data-cur': 2, 'data-mark': 2 }, 'Se pudo leer: sigue.'),
      gate(2, '¿Hay datos que no cuadran?', 'sí', 'no', 'revisar', { 'data-at': 3, 'data-cur': 3, 'data-mark': 3, class: inc ? 'is-decides' : '' }, inc ? 'Sí: aquí se decide.' : 'No: sigue.'),
      gate(3, `¿La nota llega a ${formatScore(threshold)}?`, 'sí', 'no', 'avanzar', { 'data-at': 3, 'data-off': inc ? 3 : undefined, 'data-cur': 5 }, 'No hace falta preguntar.', 'descartar'),
    ),
    h(
      'div.hw-card.rp-report',
      { 'data-at': 4 },
      h('p.hw-sheet-t', {}, `Informe de ${name}`),
      h('div.rp-rec', {}, statusPill(report.recommendation)),
      h('p', {}, `Nota ${formatScore(report.score)}: ${(report.score ?? 0) >= threshold ? 'llegaría al mínimo' : 'no llega al mínimo'}, pero primero hay que aclarar un dato.`),
      h('p.hw-muted', {}, `Cumple ${report.matched_requirements.length} requisitos · le faltan ${report.missing_requirements.length}`),
    ),
  );

  const anim = buildAnim({
    tool: 'Informe con recomendación',
    layout: 'wide',
    stage,
    steps: [
      { piece: 'Juntar las tres piezas', title: 'Junta lo que entregaron las otras herramientas', text: 'Si el CV se pudo leer, la nota y los datos que no cuadran.' },
      { piece: 'Pregunta 1', title: '¿Se pudo leer el CV?', text: 'Si no, la recomendación es "no procesable": no se califica lo que no se pudo leer.' },
      { piece: 'Pregunta 2', title: '¿Hay algún dato que no cuadra?', text: `${name} tiene uno, así que queda en "revisar". La primera pregunta que se cumple decide.` },
      { piece: 'Escribir el informe', title: 'Escribe el informe', text: 'Recomendación, nota, lo que cumple y lo que le falta, para que el reclutador lo lea en un minuto.' },
      { piece: 'Pregunta 3', title: `Si todo cuadra: ¿la nota llega a ${formatScore(threshold)}?`, text: 'Con la nota alcanza, "avanzar"; si no, "descartar". Son cuatro salidas posibles.' },
    ],
  });
  return howSlide('informe', 'Informe', 'Herramienta de Stward', 'Informe con recomendación', `Junta todo y recomienda qué hacer con cada candidato. Ejemplo: ${name}.`, anim);
}

// ---------------------------------------------------------------------------
// Stward · Conversación y hoja para el reclutador
// ---------------------------------------------------------------------------

const TOPIC: Record<string, string> = {
  aclarar_inconsistencia: 'Aclarar un dato',
  verificar_requisito: 'Verificar un requisito',
  motivacion: 'Motivación',
  disponibilidad: 'Disponibilidad',
  solicitar_cv: 'Pedir el CV',
};

export function howConversation(traces: Traces): HTMLElement {
  const convEvent = findEvent(traces.conversation, (e) => e.tool.endsWith('conversation_get') && e.args.vacancy_id === traces.index.vacancy, 'conversación');
  const conv = convEvent.result as PrescreeningConversation;
  const handoff = findEvent(traces.conversation, (e) => e.tool.endsWith('handoff_generate') && e.args.candidate_id === conv.candidate_id && e.args.vacancy_id === conv.vacancy_id, 'hoja').result as InterviewHandoff;
  const report = traces.report.events.find((e) => e.scorer === 'typesafe' && e.args.candidate_id === conv.candidate_id && e.args.vacancy_id === conv.vacancy_id)?.result as ScreeningReport | undefined;
  const name = nameOf(conv.candidate_id);
  const missing = report?.missing_requirements.length ?? 0;
  const lanes = [
    { key: 'aclarar_inconsistencia', at: 2, title: '1. Lo que no cuadra' },
    { key: 'verificar_requisito', at: 3, title: '2. Requisitos que faltan' },
    { key: 'motivacion disponibilidad', at: 4, title: '3. Motivación y disponibilidad' },
  ];

  const stage = h(
    'div.cv2-grid',
    {},
    h(
      'div.hw-card.cv2-report',
      { 'data-at': 1 },
      from('De: Informe con recomendación'),
      h('p.hw-sheet-t', {}, `Informe de ${name}`),
      report ? statusPill(report.recommendation) : null,
      h('p.hw-muted', {}, `${report?.inconsistencies.length ?? 0} dato por aclarar · ${missing} requisitos faltantes`),
    ),
    h(
      'div.cv2-lanes',
      {},
      ...lanes.map((lane) => {
        const qs = conv.questions.filter((q) => lane.key.split(' ').includes(q.topic));
        return h(
          'div.cv2-lane',
          { 'data-at': lane.at, 'data-cur': lane.at },
          h('p.hw-field-k', {}, lane.title),
          qs.length
            ? h('div', {}, ...qs.map((q, i) => h('div.cv2-q', { style: `--i:${i}` }, h('span.cv2-id', {}, q.question_id), h('span', {}, h('b', {}, TOPIC[q.topic] ?? q.topic), ' · ', accents(q.question)))))
            : h('p.hw-muted', {}, 'No hay: no se pregunta nada aquí.'),
        );
      }),
      h('p.cv2-max', { 'data-at': 4 }, 'Máximo 5 preguntas, en este orden.'),
    ),
    h(
      'div.cv2-right',
      {},
      h(
        'div.cv2-chat',
        { 'data-at': 5 },
        h('p.hw-field-k', {}, 'Responde el candidato (respuestas de ejemplo)'),
        ...handoff.answers.map((a, i) =>
          h('div.cv2-bubble', { class: a.answer ? '' : 'is-empty', style: `--i:${i}` }, h('span.cv2-id', {}, a.question_id), a.answer ? accents(a.answer) : 'sin responder'),
        ),
      ),
      h(
        'div.hw-card.cv2-handoff',
        { 'data-at': 6 },
        h('p.hw-sheet-t', {}, 'Hoja para el reclutador'),
        h('p', {}, `Respondió ${handoff.answers.length - handoff.unanswered_questions.length} de ${handoff.answers.length} · sin responder: ${handoff.unanswered_questions.join(', ') || 'ninguna'}`),
        h('p.hw-strong', {}, handoff.next_step === 'entrevista_humana' ? 'Siguiente paso: entrevista con una persona' : 'Siguiente paso: pedir el CV de nuevo'),
        h('p.hw-muted', {}, 'No decide si pasa: eso lo decide el reclutador.'),
      ),
    ),
  );

  const anim = buildAnim({
    tool: 'Conversación con el candidato',
    layout: 'wide',
    stage,
    steps: [
      { piece: 'Leer el informe', title: `Parte del informe de ${name}`, text: 'Las preguntas salen de lo que dice el informe, no de una lista fija.' },
      { piece: 'Primero, lo que no cuadra', title: 'Primero pregunta por lo que no cuadra', text: 'Le pide al candidato que lo explique con sus palabras.' },
      { piece: 'Luego, lo que falta', title: 'Luego, por los requisitos que faltan', text: missing ? 'Puede que lo tenga aunque el CV no lo diga.' : `${name} los cumple todos: no hace falta preguntar.` },
      { piece: 'Si queda espacio', title: 'Si queda espacio: motivación y disponibilidad', text: 'Nunca más de 5 preguntas, para que la conversación sea corta.' },
      { piece: 'Recibir respuestas', title: 'El candidato responde', text: 'Las respuestas de esta prueba son de ejemplo. Lo que quede sin responder también se anota.' },
      { piece: 'Hoja para el reclutador', title: 'Arma la hoja para el reclutador', text: 'Junta el informe con las respuestas. La decisión final siempre es de una persona.' },
    ],
  });
  return howSlide('conversacion', 'Conversación', 'Herramienta de Stward', 'Conversación con el candidato', `Prepara unas pocas preguntas y deja todo listo para la entrevista. Ejemplo: ${name}.`, anim);
}

// ---------------------------------------------------------------------------
// Cierre · Reporte en Excel
// ---------------------------------------------------------------------------

export function howExcel(traces: Traces, data: { sheets: Sheet[]; fileName: string }): HTMLElement {
  const result = findEvent(traces.excel, (e) => !e.is_error, 'reporte Excel').result as ScreeningReportBatchResult;
  const [matchedSheet, discardedSheet] = data.sheets;
  type Row = { id: string; score: number; matched: boolean };
  const toRows = (sheet: Sheet, matched: boolean): Row[] => sheet.rows.slice(1).map((r) => ({ id: r[0], score: Number(r[1]), matched }));
  const matched = toRows(matchedSheet, true);
  const discarded = toRows(discardedSheet, false);
  const rows = [...matched, ...discarded].sort((a, b) => (a.id < b.id ? -1 : 1));
  const cols = 5;

  const cards = rows.map((row, i) => {
    const j = row.matched ? matched.indexOf(row) : discarded.indexOf(row);
    const c1 = row.matched ? 0 : 1 + (j % (cols - 1));
    const r1 = row.matched ? j : Math.floor(j / (cols - 1));
    return h(
      'div.xb-card',
      { 'data-at': 1, 'data-mark': 2, class: row.matched ? 'is-match' : 'is-out', style: `--i:${i};--c0:${i % cols};--r0:${Math.floor(i / cols)};--c1:${c1};--r1:${r1}` },
      h('span.xb-name', {}, nameOf(row.id)),
      h('span.xb-score', {}, formatScore(row.score)),
    );
  });
  const headers = matchedSheet.rows[0] ?? [];
  const stage = h(
    'div.xb-stage',
    {},
    h(
      'div.xb-board',
      { style: `--rows:${Math.max(Math.ceil(rows.length / cols), Math.ceil(discarded.length / (cols - 1)), matched.length)}` },
      h('p.xb-tab.is-match', { 'data-at': 3 }, `${matchedSheet.name} · ${matched.length}`),
      h('p.xb-tab.is-out', { 'data-at': 3 }, `${discardedSheet.name} · ${discarded.length}`),
      ...cards,
    ),
    h(
      'div.xb-bottom',
      {},
      h('div.xb-cols', { 'data-at': 4 }, ...headers.map((t, i) => h('span.xb-col', { style: `--i:${i}` }, t))),
      h('div.xb-file', { 'data-at': 5 }, h('span.xb-icon', { 'aria-hidden': 'true' }, 'XLSX'), h('div', {}, h('p.hw-strong.mono', {}, data.fileName), h('p.hw-muted', {}, `${result.matched_count} coincidencias · ${result.discarded_count} descartados`))),
    ),
  );

  const anim = buildAnim({
    tool: 'Reporte en Excel',
    layout: 'wide',
    stage,
    onStep: (step, root) => root.querySelector('.xb-board')!.classList.toggle('is-split', step >= 3),
    steps: [
      { piece: 'Calificar a todos', title: `Califica a los ${rows.length} candidatos de la vacante`, text: 'Con la misma herramienta "Calificar un CV".' },
      { piece: 'Aplicar el mínimo', title: `Marca a quienes llegan a ${formatScore(result.threshold)}`, text: 'El mínimo es el mismo que usa el informe para recomendar "avanzar".' },
      { piece: 'Separar en dos pestañas', title: 'Los separa en dos pestañas', text: `"${matchedSheet.name}" para los que llegan y "${discardedSheet.name}" para el resto.` },
      { piece: 'Escribir las columnas', title: 'Escribe cuatro columnas por candidato', text: 'Nombre, nota, requisitos cumplidos y requisitos que faltan.' },
      { piece: 'Guardar el archivo', title: 'Guarda el archivo con la fecha', text: 'Un Excel que se puede abrir, filtrar y compartir sin la herramienta.' },
    ],
  });
  return howSlide('excel', 'Reporte en Excel', 'Para toda la vacante', 'Reporte en Excel', 'Un archivo con quién cumple y quién no, listo para compartir. Con los 20 CVs de prueba.', anim);
}

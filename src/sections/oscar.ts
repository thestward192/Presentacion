import { tupleConstant } from '../code/excerpts';
import { callCard } from '../components/call';
import { codeSnippet } from '../components/code-panel';
import { createDemo } from '../components/demo';
import { docText } from '../components/doc-text';
import { failCase, toolSheet } from '../components/layout';
import { h } from '../core/dom';
import { nameOf, who } from '../core/names';
import { findEvent, formatMs, formatRecordedAt } from '../core/trace-loader';
import type { Step } from '../core/trace-player';
import { howCv, howJd } from './how';
import type { CandidateCv, JobDescription, Traces } from '../core/types';

const years = (n: number) => `${n.toLocaleString('es')} ${n === 1 ? 'año' : 'años'}`;

/** Nombre del puesto tal como lo escribe el JD ("Senior AI Engineer"); si no, el id. */
export function vacancyTitle(jd: JobDescription): string {
  return jd.raw_text.match(/Job Description\s*[-–]\s*(.+)/)?.[1].trim() ?? jd.vacancy_id;
}

/** Quita el prefijo técnico del cliente MCP para mostrar solo el mensaje. */
export function plainError(error: string | null): string {
  return (error ?? '').replace(/^Error executing tool [\w]+:\s*/, '');
}

export function readJd(traces: Traces): HTMLElement[] {
  const ok = findEvent(traces.jd, (e) => !e.is_error, 'lectura del JD');
  const failed = findEvent(traces.jd, (e) => e.is_error, 'vacante inexistente');
  const jd = ok.result as JobDescription;
  const title = vacancyTitle(jd);
  const extensions = tupleConstant('infrastructure/text_extraction/document_text_extractor.py', 'SUPPORTED_EXTENSIONS');
  const recordedAt = formatRecordedAt(traces.index.recorded_at);

  const demo = createDemo({
    label: 'Demo: leer la vacante',
    recordedAt,
    build: () => {
      const steps: Step[] = [
        { label: `Se pide la vacante ${title}.`, realMs: ok.duration_ms, code: { excerpt: 'jd.get', line: 'path = self._find_job_description' } },
        { label: 'Encuentra el documento de la vacante y saca su texto.', code: { excerpt: 'jd.extract', line: 'reader = _READERS.get' } },
        { label: 'Reconoce qué es obligatorio, qué es deseable y cuánta experiencia piden.', code: { excerpt: 'jd.get', line: 'if _STRUCTURED_JD_KEYS &' }, hold: 400 },
        { label: `Arma la lista de ${jd.requirements.length} requisitos obligatorios.`, code: { excerpt: 'jd.structured', line: 'requirements.append(value)' }, hold: 600 },
        { label: `Agrega ${jd.nice_to_have.length} deseables y la experiencia mínima.`, code: { excerpt: 'jd.structured', line: 'min_experience_years = float(value)' } },
        { label: 'La vacante queda lista para comparar contra cada CV.', code: { excerpt: 'jd.get', line: 'return replace(job, raw_text=text)' } },
      ];

      const list = (items: string[], step: number) =>
        h('ol.req-list', {}, ...items.map((item, i) => h('li.req-item', { 'data-step': step, style: `--i:${i}` }, item)));

      const stage = h(
        'div.jd-stage',
        {},
        callCard(ok, 0, `Leer la vacante ${title}`),
        h(
          'div.jd-cols.jd-cols-3',
          {},
          h(
            'div.panel',
            { 'data-step': 1 },
            h('p.panel-title', {}, h('span.plain-only', {}, 'Documento de la vacante'), h('span.tech-only', {}, `${jd.vacancy_id}/job_description.* (${extensions.join(', ')})`)),
            docText(
              jd.raw_text,
              [
                { find: /^(requirement|nice_to_have|min_experience_years):/gm, step: 2 },
                { find: /^---$/m, step: 2, kind: 'warn' },
              ],
              'Texto de la vacante',
            ),
          ),
          h(
            'div.panel.jd-out',
            { 'data-step': 3 },
            h('p.panel-title', {}, 'Requisitos obligatorios', h('span.tech-only', {}, ' · requirements')),
            list(jd.requirements, 3),
          ),
          h(
            'div.panel.jd-out',
            { 'data-step': 4 },
            h('p.panel-title', {}, 'Deseables', h('span.tech-only', {}, ' · nice_to_have')),
            list(jd.nice_to_have, 4),
            h('p.panel-title.jd-min', {}, 'Experiencia mínima', h('span.tech-only', {}, ' · min_experience_years')),
            h('p.out-value', {}, `${jd.min_experience_years ?? '-'} años`),
          ),
        ),
        h(
          'div.result-strip',
          { 'data-step': 5 },
          h('div.stat', {}, h('span.stat-n', {}, jd.requirements.length), h('span.stat-l', {}, 'requisitos obligatorios')),
          h('div.stat', {}, h('span.stat-n', {}, jd.nice_to_have.length), h('span.stat-l', {}, 'deseables')),
          h('div.stat', {}, h('span.stat-n', {}, jd.min_experience_years ?? '-'), h('span.stat-l', {}, 'años de experiencia mínima')),
        ),
      );
      return { stage, steps, excerpts: ['jd.get', 'jd.find', 'jd.extract', 'jd.structured'] };
    },
  });

  return toolSheet({
    id: 'leer-jd',
    chapter: 'Leer la vacante',
    kicker: 'Paso 1 · Leer la vacante',
    title: 'Entender qué pide el puesto',
    lead: 'La descripción del puesto se convierte en una lista clara: requisitos obligatorios, deseables y años de experiencia.',
    owner: 'Oscar Zúñiga Sánchez',
    task: 'ta_leer_jd',
    tools: [ok.tool],
    simple: {
      receives: 'La descripción del puesto, en PDF, Word o texto.',
      does: 'Separa lo obligatorio de lo deseable y lee cuántos años de experiencia se piden.',
      delivers: 'Una lista de requisitos con la que se compara cada CV.',
    },
    why: 'todos los candidatos se miden contra la misma lista, escrita una sola vez.',
    under: [
      h('span', {}, 'Busca ', h('code', {}, 'job_description.*'), ' en la carpeta de la vacante y extrae el texto con ', h('code', {}, 'extract_text'), '.'),
      'Si trae el bloque requirement: / nice_to_have: / min_experience_years: antes de "---", lo lee directo; si no, FreeTextJobDescriptionParser interpreta el texto libre.',
      'Conserva el texto completo en raw_text para que Jev tenga contexto.',
    ],
    demo: demo.el,
    demoTitle: 'Así lee la vacante Senior AI Engineer',
    how: howJd(traces),
    failCase: failCase(
      'Si se pide una vacante que no existe',
      h(
        'div.fail-grid',
        {},
        h(
          'div',
          {},
          h('p', {}, 'El sistema no inventa nada: responde con un aviso claro que el asistente le explica al reclutador.'),
          h('p.fail-error', {}, h('span.plain-only', {}, plainError(failed.error)), h('span.tech-only.mono', {}, failed.error ?? '')),
          h('p.muted', {}, `Respondió en ${formatMs(failed.duration_ms)}.`),
        ),
        h('div.tech-only', {}, codeSnippet('jd.find', ['if not candidates:', 'raise VacancyNotFoundError(vacancy_id)'])),
      ),
    ),
  });
}

export function readCv(traces: Traces): HTMLElement[] {
  const ok = findEvent(traces.cv, (e) => e.args.vacancy_id === traces.index.vacancy, 'CVs de la vacante');
  const broken = findEvent(traces.cv, (e) => e.args.vacancy_id === traces.index.broken_vacancy, 'vacante con archivos ilegibles');
  const cvs = ok.result!.result;
  const brokenCvs = broken.result!.result;
  const sample = cvs[0] as CandidateCv;
  const sampleName = nameOf(sample.candidate_id);
  const unreadable = cvs.filter((cv) => cv.read_error).length;
  const recordedAt = formatRecordedAt(traces.index.recorded_at);

  // Periodos de EXPERIENCIA visibles en el texto recortado de la traza.
  const experience = sample.raw_text.slice(sample.raw_text.indexOf('EXPERIENCIA'));
  const visiblePeriods = [...experience.matchAll(/\(((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2}|Actualidad|Presente|Actual|Hoy)\)/gi)];
  const recorded = new Date(traces.index.recorded_at);

  const demo = createDemo({
    label: 'Demo: leer los CVs',
    recordedAt,
    note: 'el texto del CV se muestra recortado',
    build: () => {
      const steps: Step[] = [
        { label: 'Se piden todos los CVs de la vacante.', realMs: ok.duration_ms, code: { excerpt: 'cv.list', line: 'for cv_path in sorted(vacancy_dir.iterdir())' } },
        { label: `Toma los ${cvs.length} archivos tal como llegaron, sin renombrarlos.`, code: { excerpt: 'cv.isfile', line: 'return path.name.lower().startswith("cv_")' }, hold: 500 },
        { label: `Abre el CV de ${sampleName} y saca su texto.`, code: { excerpt: 'cv.read', line: 'text = extract_text(cv_path)' } },
        { label: `Busca sus trabajos y suma el tiempo: ${years(sample.years_experience ?? 0)} de experiencia.`, code: { excerpt: 'cv.months', line: 'total += current_end - current_start + 1' }, hold: 800 },
        { label: `Anota sus habilidades: ${sample.skills.length} en total.`, code: { excerpt: 'cv.tech', line: 'elif section == _SKILLS and _section_of(line) is None:' }, hold: 600 },
        { label: `Hace lo mismo con todos: ${cvs.length} CVs leídos, ${unreadable === 0 ? 'ninguno ilegible' : `${unreadable} ilegibles`}.`, code: { excerpt: 'cv.parse', line: 'years_experience = round(_total_months(periods) / 12, 1) if periods else None' } },
      ];

      const monthYear = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(recorded);
      const timeline = h(
        'div.timeline',
        { 'data-step': 3 },
        h('p.panel-title', {}, 'Tiempo trabajado'),
        ...visiblePeriods.map((m) => {
          const end = /^\d+$/.test(m[2]) ? m[2] : `hoy (${monthYear})`;
          return h('div.tl-row', {}, h('span.tl-bar', {}), h('span.tl-label', {}, `${m[1]} a ${end}`));
        }),
        h('div.tl-row.tl-hidden', {}, h('span.tl-bar', {}), h('span.tl-label', {}, 'Trabajos anteriores (fuera del texto recortado)')),
        h('p.tl-total', {}, 'Total: ', h('strong', {}, `${years(sample.years_experience ?? 0)} de experiencia`)),
        h('p.muted.tech-only', {}, 'Las pasantías no cuentan y los periodos que se superponen cuentan una sola vez.'),
      );

      const stage = h(
        'div.cv-stage',
        {},
        callCard(ok, 0, 'Leer todos los CVs de la vacante'),
        h(
          'div.file-chips',
          { 'data-step': 1 },
          ...cvs.map((cv, i) => h('span.chip.chip-file', { style: `--i:${i}`, class: cv.candidate_id === sample.candidate_id ? 'is-picked' : '' }, who(cv.candidate_id))),
        ),
        h(
          'div.cv-cols',
          {},
          h(
            'div.panel',
            { 'data-step': 2 },
            h('p.panel-title', {}, `CV de ${sampleName}`),
            docText(
              sample.raw_text,
              [
                { find: 'EXPERIENCIA', step: 3 },
                { find: /\((?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|Actualidad)\)/g, step: 3 },
                { find: /HABILIDADES\n[\s\S]*?(?=\nEXPERIENCIA)/, step: 4, kind: 'ok' },
              ],
              'Texto del CV',
            ),
          ),
          h(
            'div.cv-side',
            {},
            timeline,
            h(
              'div.panel',
              { 'data-step': 4 },
              h('p.panel-title', {}, 'Habilidades'),
              h('div.skill-cloud', {}, ...sample.skills.map((skill, i) => h('span.chip.chip-skill', { 'data-step': 4, style: `--i:${i}` }, skill))),
            ),
          ),
        ),
        h(
          'div.result-strip',
          { 'data-step': 5 },
          h('div.stat', {}, h('span.stat-n', {}, cvs.length), h('span.stat-l', {}, 'CVs leídos')),
          h('div.stat', {}, h('span.stat-n', {}, unreadable), h('span.stat-l', {}, 'ilegibles')),
          h('div.stat', {}, h('span.stat-n', {}, formatMs(ok.duration_ms)), h('span.stat-l', {}, 'para toda la vacante')),
        ),
      );
      return { stage, steps, excerpts: ['cv.list', 'cv.isfile', 'cv.read', 'cv.periods', 'cv.months', 'cv.tech', 'cv.parse'] };
    },
  });

  const tableRows = cvs.map((cv) =>
    h('tr', {}, h('td', {}, who(cv.candidate_id)), h('td.num.mono', {}, cv.years_experience?.toLocaleString('es') ?? '-'), h('td.num.mono', {}, cv.skills.length)),
  );

  return toolSheet({
    id: 'leer-cv',
    chapter: 'Leer los CVs',
    kicker: 'Paso 2 · Leer los CVs',
    title: 'Leer todos los CVs, lleguen como lleguen',
    lead: 'Cada CV se convierte en tres datos que se pueden comparar: años de experiencia, habilidades y el texto completo.',
    owner: 'Oscar Zúñiga Sánchez',
    task: 'ta_leer_cv',
    tools: [ok.tool],
    simple: {
      receives: 'Los CVs de la vacante, en PDF, Word o texto, con el nombre que traigan.',
      does: 'Suma el tiempo de cada trabajo y anota las habilidades declaradas.',
      delivers: 'Por cada candidato: años de experiencia, habilidades y texto completo.',
    },
    why: 'no hay que abrir PDFs uno por uno ni calcular años a mano, y un archivo dañado no frena al resto.',
    under: [
      'Toma todos los archivos de la carpeta salvo el JD; el candidate_id sale del nombre del archivo.',
      'Suma los periodos laborales en meses; los periodos solo con años cuentan dentro de EXPERIENCIA, las pasantías no cuentan y los superpuestos cuentan una vez.',
      'Lee las skills de la sección HABILIDADES y de las líneas "Tecnologías utilizadas:".',
      'Un archivo dañado no rompe la vacante: ese CV queda marcado con read_error.',
      'En la traza, la regex de teléfonos del script de grabación enmascaró periodos como "(2019 - 2022)"; el total de años es el real.',
    ],
    demo: demo.el,
    demoTitle: 'Así lee los CVs de una vacante de prueba',
    how: howCv(traces),
    introExtra: [
      h(
        'details.disclosure',
        { 'data-reveal': '' },
        h('summary', {}, `Ver los ${cvs.length} candidatos leídos (años y cantidad de habilidades)`),
        h('div.table-wrap', {}, h('table.data', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Candidato'), h('th.num', {}, 'Años'), h('th.num', {}, 'Habilidades'))), h('tbody', {}, ...tableRows))),
      ),
    ],
    failCase: failCase(
      'Si un archivo no se puede abrir',
      h(
        'div.fail-grid',
        {},
        h(
          'div',
          {},
          h(
            'p',
            {},
            `En otra vacante de prueba, los ${brokenCvs.length} archivos no eran PDF reales. El sistema no se detiene: marca cada CV como ilegible y sigue. Más adelante, el informe los muestra como "no procesable".`,
          ),
          h('div.file-chips.is-static', {}, ...brokenCvs.map((cv) => h('span.chip.chip-bad', { title: cv.read_error ?? '' }, who(cv.candidate_id)))),
          h('p.fail-error', {}, plainError(brokenCvs[0]?.read_error ?? '')),
        ),
        h(
          'div.snippets.tech-only',
          {},
          codeSnippet('cv.pdf', ['except PdfReadError as exc:', 'raise DocumentUnreadableError(path.name, "el PDF esta danado")']),
          codeSnippet('cv.read', ['except (UnsupportedDocumentFormatError, DocumentUnreadableError) as exc:', 'return _unreadable_cv(fallback_id, vacancy_id, str(exc))']),
        ),
      ),
    ),
  });
}

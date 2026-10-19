import { scalarConstant } from '../code/excerpts';
import { callCard } from '../components/call';
import { createChat, followChat, type ChatMessage } from '../components/chat';
import { createDemo } from '../components/demo';
import { section, statusPill, toggle, toolSheet } from '../components/layout';
import { h } from '../core/dom';
import { nameOf, who } from '../core/names';
import { formatRecordedAt, formatScore } from '../core/trace-loader';
import type { Step } from '../core/trace-player';
import { howConversation, howReport } from './how';
import type { InterviewHandoff, PrescreeningConversation, ScreeningReport, TraceEvent, Traces } from '../core/types';

const CASE_LABEL: Record<string, string> = {
  'mejor nota con Jev': 'La mejor candidata',
  'CV con inconsistencia -> revisar': 'Un dato que no cuadra',
  'nota mas baja': 'La nota más baja',
  'archivo ilegible -> no_procesable': 'CV ilegible',
};

const caseLabel = (note: string) => CASE_LABEL[note] ?? note;

// ---------------------------------------------------------------------------
// Informe de pre-screening: embudo de reglas
// ---------------------------------------------------------------------------

export function screeningReport(traces: Traces): HTMLElement[] {
  const events = traces.report.events as TraceEvent<ScreeningReport>[];
  const notes = [...new Set(events.map((e) => e.note))];
  const threshold = Number(scalarConstant('application/use_cases/generate_screening_report.py', '_ADVANCE_THRESHOLD'));
  const recordedAt = formatRecordedAt(traces.index.recorded_at);
  let note = notes[0];

  const casePicker = toggle(
    'Caso',
    notes.map((n) => ({ value: n, text: caseLabel(n) })),
    note,
    (value) => {
      note = value;
      demo.rebuild();
    },
  );

  const demo = createDemo({
    label: 'Demo: la recomendación',
    recordedAt,
    toolbar: [casePicker.el],
    build: () => {
      const event = events.find((e) => e.note === note && e.scorer === 'typesafe')!;
      const report = event.result!;
      const unreadable = report.unprocessable_reason !== null;
      const hasIssues = report.inconsistencies.length > 0;
      const passes = (report.score ?? 0) >= threshold;
      // Qué regla aplica, derivado de los datos (y verificado contra la recomendación real).
      const applies = unreadable ? 0 : hasIssues ? 1 : passes ? 2 : 3;
      const expected = ['no_procesable', 'revisar', 'avanzar', 'descartar'][applies];
      if (expected !== report.recommendation) console.warn(`La traza no sigue las reglas: ${report.candidate_id}`);

      const rules = [
        { title: '¿Se pudo leer el CV?', result: 'no_procesable', line: 'if unreadable_reason is not None:', detail: unreadable ? 'No: el archivo está dañado' : 'Sí, se leyó bien' },
        { title: '¿Tiene datos que no cuadran?', result: 'revisar', line: 'if inconsistencies.has_issues:', detail: hasIssues ? 'Sí: la experiencia no coincide' : 'No' },
        { title: `¿Llega a la nota mínima (${formatScore(threshold)})?`, result: 'avanzar', line: 'elif evaluation.score >= _ADVANCE_THRESHOLD:', detail: passes ? `Sí: tiene ${formatScore(report.score)}` : `No: tiene ${formatScore(report.score)}` },
        { title: 'Si nada de lo anterior aplica', result: 'descartar', line: 'recommendation = "descartar"', detail: 'No cumple lo suficiente' },
      ] as const;

      const steps: Step[] = [
        {
          label: `Entra el caso de ${nameOf(report.candidate_id)}, con su nota y su revisión de datos.`,
          realMs: event.duration_ms,
          code: { excerpt: 'report.chain', line: 'return generate_report_uc.execute(cv, evaluation, inconsistencies)' },
        },
        ...rules.slice(0, applies + 1).map((rule, i) => ({
          label: `${rule.title.endsWith('?') ? `${rule.title} ${rule.detail}` : `${rule.title}: ${rule.detail.toLowerCase()}`}. ${i === applies ? `Recomendación: ${rule.result.replace('_', ' ')}.` : 'Pasa a la siguiente pregunta.'}`,
          code: { excerpt: 'report.rules', line: rule.line },
          hold: i === applies ? 500 : 0,
        })),
        {
          label: 'El informe queda listo para el reclutador, con la evidencia.',
          code: { excerpt: 'report.rules', line: unreadable ? 'recommendation="no_procesable",' : 'recommendation=recommendation,' },
          hold: 900,
        },
      ];
      const finalStep = steps.length - 1;

      // Marcador que baja pregunta por pregunta hasta la que decide.
      const marker = h('li.funnel-marker', { 'aria-hidden': 'true', 'data-step': 1 }, h('span.funnel-chip', {}, nameOf(report.candidate_id)));
      const funnel = h(
        'ol.funnel',
        { 'data-applies': applies },
        marker,
        ...rules.map((rule, i) =>
          h(
            'li.rule',
            { class: i < applies ? 'is-skip' : i === applies ? 'is-hit' : 'is-off', 'data-step': i + 1, style: `--i:${i}` },
            h('span.rule-n.mono', {}, i + 1),
            h('div.rule-body', {}, h('p.rule-title', {}, rule.title), h('p.rule-detail', {}, i <= applies ? rule.detail : 'no se evalúa')),
            h('span.rule-out', {}, statusPill(rule.result)),
          ),
        ),
      );

      const reportCard = h(
        'div.report-card',
        { 'data-step': finalStep },
        h('div.report-head', {}, h('p.report-who', {}, 'Informe de ', who(report.candidate_id)), statusPill(report.recommendation)),
        h(
          'dl.report-grid',
          {},
          h('div', {}, h('dt', {}, 'Nota'), h('dd.mono', {}, report.score === null ? 'sin nota' : formatScore(report.score))),
          h('div', {}, h('dt', {}, 'Requisitos que cumple'), h('dd.mono', {}, `${report.matched_requirements.length}`)),
          h('div', {}, h('dt', {}, 'Requisitos que le faltan'), h('dd.mono', {}, `${report.missing_requirements.length}`)),
          h('div', {}, h('dt', {}, 'Datos que no cuadran'), h('dd.mono', {}, `${report.inconsistencies.length}`)),
        ),
        report.unprocessable_reason ? h('p.report-note', {}, `Motivo: ${report.unprocessable_reason}`) : null,
        report.inconsistencies.length ? h('p.report-note', {}, report.inconsistencies[0]) : null,
      );

      const stage = h(
        'div.report-stage',
        {},
        callCard(event, 0, `Preparar el informe de ${nameOf(report.candidate_id)}`),
        h('p.case-meta', { 'data-step': 0 }, `Caso: ${caseLabel(note)}. Cuatro preguntas en orden; la primera que se cumple decide.`),
        funnel,
        reportCard,
      );
      return { stage, steps, excerpts: ['report.rules', 'report.chain', 'report.unreadable'] };
    },
    onRender: (index, _player, stage) => {
      const funnel = stage.querySelector<HTMLElement>('.funnel');
      if (!funnel) return;
      const applies = Number(funnel.dataset.applies);
      funnel.style.setProperty('--at', String(Math.max(0, Math.min(applies, index - 1))));
    },
  });

  // Los cuatro casos, cada uno con la regla que lo decidió.
  const reason = (r: ScreeningReport): string => {
    if (r.recommendation === 'no_procesable') return 'El archivo no se pudo leer: se pide de nuevo.';
    if (r.recommendation === 'revisar') return `Tiene un dato que no cuadra. Nota ${formatScore(r.score)}, pero primero se aclara.`;
    if (r.recommendation === 'avanzar') return `Nota ${formatScore(r.score)}: llega al mínimo y sus datos son coherentes.`;
    return `Nota ${formatScore(r.score)}: no llega al mínimo.`;
  };
  const rule: Record<string, string> = { no_procesable: 'Pregunta 1', revisar: 'Pregunta 2', avanzar: 'Pregunta 3', descartar: 'Pregunta 4' };
  const cases = h(
    'div.case-grid',
    {},
    ...notes.map((n, i) => {
      const r = events.find((e) => e.note === n && e.scorer === 'typesafe')!.result!;
      return h(
        'article.case-card',
        { 'data-reveal': '', class: `is-${r.recommendation}`, style: `--i:${i}` },
        h('p.case-k', {}, caseLabel(n)),
        h('p.case-name', {}, who(r.candidate_id)),
        h('div.case-pill', {}, statusPill(r.recommendation)),
        h('p.case-reason', {}, reason(r)),
        h('p.case-rule', {}, `Decidió la ${rule[r.recommendation].toLowerCase()}`),
      );
    }),
  );

  return toolSheet({
    id: 'informe',
    chapter: 'Recomendación',
    kicker: 'Paso 5 · La recomendación',
    title: 'Un informe con una recomendación clara',
    lead: 'Todo lo anterior se junta en un solo informe para el reclutador, con una de cuatro recomendaciones: avanzar, revisar, descartar o no procesable.',
    owner: 'Stward Serrano Sánchez',
    task: 'ta_generar_informe_prescreening',
    tools: ['talent_acquisition_screening_report_generate'],
    simple: {
      receives: 'La nota del candidato, lo que cumple y los datos que no cuadran.',
      does: 'Hace cuatro preguntas en orden; la primera que se cumple decide la recomendación.',
      delivers: 'Un informe con la recomendación y la evidencia que la respalda.',
    },
    why: 'cada recomendación se puede explicar, y nadie se descarta por un dato dudoso: primero se revisa.',
    under: [
      'Regla 1: CV ilegible o sin información -> no_procesable (sin nota, con el motivo en unprocessable_reason).',
      'Regla 2: tiene inconsistencias -> revisar.',
      `Regla 3: score >= _ADVANCE_THRESHOLD (${formatScore(threshold)}, fijo en el código) -> avanzar.`,
      'Regla 4: si no -> descartar.',
      h('span', {}, h('code', {}, '_build_screening_report'), ' en tools.py encadena JD -> CV -> nota -> inconsistencias -> informe.'),
    ],
    demo: demo.el,
    demoTitle: 'Cuatro preguntas en orden, la primera que se cumple decide',
    how: howReport(traces),
    slides: [
      section(
        { id: 'informe-casos', chapter: 'Los cuatro casos', kicker: 'Paso 5 · La recomendación', title: 'Lo que muestran los cuatro casos', compact: true },
        cases,
        h('p.key-message', { 'data-reveal': '' }, keyMessage(events, threshold)),
      ),
    ],
  });
}

/** Mensaje clave derivado de las trazas: un dato que no cuadra pesa más que la nota. */
function keyMessage(events: TraceEvent<ScreeningReport>[], threshold: number): string {
  const jev = events.filter((e) => e.scorer === 'typesafe').map((e) => e.result!);
  const overruled = jev.filter((r) => r.recommendation === 'revisar' && r.inconsistencies.length);
  if (!overruled.length) return 'La primera pregunta que se cumple decide la recomendación.';
  const describe = (r: ScreeningReport) => `${nameOf(r.candidate_id)} (nota ${formatScore(r.score)}${(r.score ?? 0) >= threshold ? ', que llega al mínimo' : ''})`;
  return `Un dato que no cuadra pesa más que la nota: ${overruled.map(describe).join(' y ')} ${overruled.length > 1 ? 'quedan' : 'queda'} en "revisar" hasta aclararlo.`;
}

// ---------------------------------------------------------------------------
// Conversación bot ↔ candidato y hoja de traspaso
// ---------------------------------------------------------------------------

const TOPIC_LINE: Record<string, string> = {
  solicitar_cv: 'topic="solicitar_cv",',
  aclarar_inconsistencia: '"aclarar_inconsistencia",',
  verificar_requisito: 'topics_and_questions.append(("verificar_requisito", _requirement_question(requirement)))',
  motivacion: 'topics_and_questions.append(("motivacion", "Por que te interesa esta posicion?"))',
  disponibilidad: '("disponibilidad", "Cual es tu disponibilidad para una entrevista con el equipo?")',
};

const TOPIC_LABEL: Record<string, string> = {
  solicitar_cv: 'pedir el CV de nuevo',
  aclarar_inconsistencia: 'aclarar un dato',
  verificar_requisito: 'confirmar un requisito',
  motivacion: 'motivación',
  disponibilidad: 'disponibilidad',
};

const NEXT_STEP: Record<string, string> = { entrevista_humana: 'Entrevista con una persona del equipo', solicitar_cv: 'Pedir el CV de nuevo' };

export function conversation(traces: Traces): HTMLElement[] {
  const events = traces.conversation.events;
  const scripts = events.filter((e) => e.tool.endsWith('prescreening_conversation_get')) as TraceEvent<PrescreeningConversation>[];
  const handoffs = events.filter((e) => e.tool.endsWith('prescreening_handoff_generate')) as TraceEvent<InterviewHandoff>[];
  const recordedAt = formatRecordedAt(traces.index.recorded_at);
  let index = 0;

  const casePicker = toggle(
    'Caso',
    scripts.map((e, i) => ({ value: String(i), text: e.result!.questions[0]?.topic === 'solicitar_cv' ? 'CV ilegible' : `${nameOf(e.result!.candidate_id)} (a revisar)` })),
    '0',
    (value) => {
      index = Number(value);
      demo.rebuild();
    },
  );

  const demo = createDemo({
    label: 'Demo: conversación con el candidato',
    recordedAt,
    toolbar: [casePicker.el],
    note: 'las respuestas del candidato son de ejemplo',
    build: () => {
      const scriptEvent = scripts[index];
      const script = scriptEvent.result!;
      const handoffEvent = handoffs.find((e) => e.args.candidate_id === script.candidate_id && e.args.vacancy_id === script.vacancy_id)!;
      const handoff = handoffEvent.result!;
      const answers = new Map((handoffEvent.args.answers as { question_id: string; answer: string }[]).map((a) => [a.question_id, a.answer]));
      const unreadable = script.questions[0]?.topic === 'solicitar_cv';

      const messages: ChatMessage[] = [
        {
          kind: 'tool',
          event: scriptEvent,
          plain: `Preparar las preguntas para ${nameOf(script.candidate_id)}`,
          label: `El asistente pide las preguntas para ${nameOf(script.candidate_id)}.`,
          resultLabel: `${script.questions.length} ${script.questions.length === 1 ? 'pregunta' : 'preguntas'}, elegidas según su informe.`,
          summary: h('ol.script-list', {}, ...script.questions.map((q, i) => h('li', {}, `${i + 1}. ${TOPIC_LABEL[q.topic] ?? q.topic}`))),
          code: { excerpt: 'conv.build', line: 'def execute(self, report: ScreeningReport)' },
        },
        {
          kind: 'left',
          author: 'Asistente',
          text: script.greeting,
          label: 'Saludo.',
          code: { excerpt: 'conv.build', line: unreadable ? 'greeting=f"Hola, gracias por postularte a la vacante {report.vacancy_id}."' : 'greeting = (' },
        },
      ];
      for (const q of script.questions) {
        messages.push({
          kind: 'left',
          author: 'Asistente',
          tag: TOPIC_LABEL[q.topic] ?? q.topic,
          text: q.question,
          label: `Pregunta: ${TOPIC_LABEL[q.topic] ?? q.topic}.`,
          code: { excerpt: 'conv.build', line: TOPIC_LINE[q.topic] ?? 'questions = [' },
        });
        const answer = answers.get(q.question_id);
        if (answer) {
          messages.push({ kind: 'right', author: 'Candidato', tag: 'respuesta de ejemplo', text: answer, label: 'El candidato responde (respuesta de ejemplo).' });
        }
      }
      messages.push(
        {
          kind: 'left',
          author: 'Asistente',
          text: script.closing,
          label: 'Cierre.',
          code: { excerpt: 'conv.build', line: unreadable ? 'closing="Cuando recibamos tu CV' : 'closing=(' },
        },
        {
          kind: 'tool',
          event: handoffEvent,
          plain: 'Armar la hoja para el reclutador con las respuestas',
          label: 'El asistente entrega las respuestas para armar la hoja del reclutador.',
          resultLabel: 'Cada respuesta queda junto a su pregunta; las que faltan, marcadas como pendientes.',
          summary: (() => {
            const answered = handoff.answers.length - handoff.unanswered_questions.length;
            const pending = handoff.unanswered_questions.length;
            return `${answered} ${answered === 1 ? 'respondida' : 'respondidas'}, ${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}.`;
          })(),
          code: { excerpt: 'conv.handoff', line: 'by_id = {a.question_id: a.answer.strip() for a in answers if a.answer.strip()}' },
        },
        {
          kind: 'card',
          label: `Hoja para el reclutador. Siguiente paso: ${NEXT_STEP[handoff.next_step] ?? handoff.next_step}.`,
          code: { excerpt: 'conv.handoff', line: '"solicitar_cv" if report.recommendation == "no_procesable" else "entrevista_humana"' },
          content: handoffCard(handoff),
        },
      );

      const chat = createChat(messages, 'Conversación con el candidato');
      return { stage: chat.stage, steps: chat.steps, excerpts: ['conv.build', 'conv.requirement', 'conv.handoff'] };
    },
    onRender: (_index, _player, stage) => followChat(stage),
  });

  return toolSheet({
    id: 'conversacion',
    chapter: 'Conversación',
    kicker: 'Paso 6 · Conversación con el candidato',
    title: 'Unas pocas preguntas antes de la entrevista',
    lead: 'El asistente conversa brevemente con el candidato para aclarar lo pendiente, y deja una hoja lista para la persona que hará la entrevista.',
    owner: 'Stward Serrano Sánchez',
    task: 'ta_conversacion_prescreening',
    tools: ['talent_acquisition_prescreening_conversation_get', 'talent_acquisition_prescreening_handoff_generate'],
    simple: {
      receives: 'El informe del candidato.',
      does: 'Elige hasta 5 preguntas: aclarar datos que no cuadran, confirmar requisitos, motivación y disponibilidad. Si el CV no se pudo leer, solo pide reenviarlo.',
      delivers: 'Una hoja con cada respuesta junto a su pregunta, lo que quedó pendiente y el siguiente paso.',
    },
    why: 'llega a la entrevista con las dudas ya conversadas. El asistente no decide: solo prepara la información.',
    under: [
      'Guion a partir del informe, máximo 5 preguntas, en orden: solicitar_cv (única si no es procesable), aclarar_inconsistencia, verificar_requisito, motivacion, disponibilidad.',
      'El agente conversa en lenguaje natural; el MCP no conversa ni decide.',
      'Traspaso: cruza respuestas por question_id, lista unanswered_questions y define next_step: entrevista_humana o solicitar_cv.',
      'No guarda nada: el guion se regenera con las mismas reglas.',
      'Las respuestas de la traza son dos textos fijos del script de grabación; por eso no siempre corresponden a la pregunta.',
    ],
    demo: demo.el,
    demoTitle: 'Una conversación de principio a fin',
    how: howConversation(traces),
    demoExtra: [
      h(
        'p.muted.sample-note',
        { 'data-reveal': '' },
        'Las preguntas y la hoja final son reales. Las respuestas del candidato son de ejemplo, escritas para la demo, y no siempre corresponden a la pregunta.',
      ),
    ],
  });
}

function handoffCard(handoff: InterviewHandoff): HTMLElement {
  return h(
    'div.handoff-card',
    {},
    h('div.report-head', {}, h('p.panel-title', {}, 'Hoja para el reclutador'), statusPill(handoff.recommendation)),
    h(
      'dl.report-grid',
      {},
      h('div', {}, h('dt', {}, 'Candidato'), h('dd', {}, who(handoff.candidate_id))),
      h('div', {}, h('dt', {}, 'Nota'), h('dd.mono', {}, handoff.score === null ? 'sin nota' : formatScore(handoff.score))),
      h('div', {}, h('dt', {}, 'Siguiente paso'), h('dd', {}, h('strong', {}, NEXT_STEP[handoff.next_step] ?? handoff.next_step))),
    ),
    h(
      'ul.qa-list',
      {},
      ...handoff.answers.map((a) =>
        h(
          'li',
          { class: a.answer === null ? 'is-pending' : '' },
          h('p.qa-q', {}, h('code.tech-only', {}, `${a.question_id} `), TOPIC_LABEL[a.topic] ?? a.topic),
          h('p.qa-a', {}, a.answer ?? 'Sin responder'),
        ),
      ),
    ),
  );
}

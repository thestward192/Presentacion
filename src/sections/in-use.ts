import { createChat, followChat, type ChatMessage } from '../components/chat';
import { createDemo } from '../components/demo';
import { slide, statusPill, titleDemo } from '../components/layout';
import { h } from '../core/dom';
import { nameOf, who } from '../core/names';
import { findEvent, formatRecordedAt, formatScore } from '../core/trace-loader';
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
  TraceEvent,
  Traces,
} from '../core/types';
import type { ExcelData } from './excel';

const TOPIC: Record<string, string> = {
  aclarar_inconsistencia: 'aclarar un dato',
  verificar_requisito: 'confirmar un requisito',
  motivacion: 'motivación',
  disponibilidad: 'disponibilidad',
  solicitar_cv: 'pedir el CV de nuevo',
};

/**
 * Caso de punta a punta que usa las 9 herramientas grabadas en las trazas:
 * vacante, CVs, ranking, evaluación, datos que no cuadran, informe,
 * conversación, hoja para el reclutador y Excel.
 */
export function inUse(traces: Traces, excel: ExcelData): HTMLElement {
  const vacancy = traces.index.vacancy;
  const jdEvent = findEvent(traces.jd, (e) => !e.is_error, 'JD');
  const jd = jdEvent.result as JobDescription;
  const cvEvent = findEvent(traces.cv, (e) => e.args.vacancy_id === vacancy, 'CVs');
  const cvs = (cvEvent.result as ListResult<CandidateCv>).result;
  const rankEvent = findEvent(traces.match, (e) => e.tool.endsWith('candidate_ranking_top_n') && e.scorer === 'typesafe', 'ranking Jev') as TraceEvent<ListResult<MatchEvaluation>>;
  const ranking = rankEvent.result!.result;
  const threshold = traces.match.threshold;
  const best = ranking[0];
  const evalEvent = findEvent(traces.match, (e) => e.tool.endsWith('candidate_match_evaluate') && e.scorer === 'typesafe' && e.args.candidate_id === best.candidate_id, 'evaluación de la mejor') as TraceEvent<MatchEvaluation>;
  const evaluation = evalEvent.result!;

  // La candidata "a revisar": la que tiene guion de conversación en la vacante principal.
  const scriptEvent = findEvent(traces.conversation, (e) => e.tool.endsWith('prescreening_conversation_get') && e.args.vacancy_id === vacancy, 'guion') as TraceEvent<PrescreeningConversation>;
  const target = scriptEvent.args.candidate_id as string;
  const targetName = nameOf(target);
  const targetRank = ranking.findIndex((e) => e.candidate_id === target);
  const incEvent = findEvent(traces.inconsistencies, (e) => e.args.candidate_id === target, 'inconsistencias') as TraceEvent<CvInconsistencyReport>;
  const reportEvent = findEvent(traces.report, (e) => e.scorer === 'typesafe' && e.args.candidate_id === target && e.args.vacancy_id === vacancy, 'informe') as TraceEvent<ScreeningReport>;
  const report = reportEvent.result!;
  const script = scriptEvent.result!;
  const handoffEvent = findEvent(traces.conversation, (e) => e.tool.endsWith('prescreening_handoff_generate') && e.args.candidate_id === target, 'traspaso') as TraceEvent<InterviewHandoff>;
  const handoff = handoffEvent.result!;
  const excelEvent = findEvent(traces.excel, (e) => !e.is_error, 'Excel');
  const batch = excelEvent.result as ScreeningReportBatchResult;
  const recordedAt = formatRecordedAt(traces.index.recorded_at);

  const passing = ranking.filter((e) => e.score >= threshold);
  const excelMatched = excel.sheets[0].rows.slice(1).map((r) => r[0]);
  const issue = incEvent.result!.issues[0];
  const declared = cvs.find((cv) => cv.candidate_id === target)?.years_experience;
  const mentioned = issue?.match(/\(\[([\d, ]+)\]\)/)?.[1];
  const answered = handoff.answers.length - handoff.unanswered_questions.length;

  const messages: ChatMessage[] = [
    { kind: 'right', author: 'Reclutador', text: `¿Quiénes son los mejores candidatos para ${jd.raw_text.match(/Job Description\s*[-–]\s*(.+)/)?.[1].trim() ?? vacancy}?`, label: 'El reclutador pregunta en lenguaje natural.' },
    {
      kind: 'tool', event: jdEvent, plain: 'Leer la vacante',
      label: 'El asistente lee la vacante.', resultLabel: 'Ya sabe qué pide el puesto.',
      summary: `${jd.requirements.length} requisitos obligatorios, ${jd.nice_to_have.length} deseables, al menos ${jd.min_experience_years} años de experiencia.`,
    },
    {
      kind: 'tool', event: cvEvent, plain: 'Leer los CVs recibidos',
      label: 'Lee los CVs recibidos.', resultLabel: `${cvs.length} CVs leídos.`,
      summary: `${cvs.length} CVs leídos, ${cvs.filter((cv) => cv.read_error).length} ilegibles.`,
    },
    {
      kind: 'tool', event: rankEvent, plain: `Calificar y ordenar a los ${ranking.length} candidatos`,
      label: 'Califica y ordena a todos.', resultLabel: 'Los tres primeros.',
      summary: h('ol.mini-rank', {}, ...ranking.slice(0, 3).map((e) => h('li', {}, who(e.candidate_id), h('span.mono', {}, formatScore(e.score))))),
    },
    {
      kind: 'left', author: 'Asistente',
      text: `${passing.map((p) => `${nameOf(p.candidate_id)} (${formatScore(p.score)})`).join(' y ')} llegan al mínimo de ${formatScore(threshold)}. ${targetName} queda ${targetRank + 1}.ª con ${formatScore(ranking[targetRank].score)}, justo debajo.`,
      label: 'Resume el ranking.',
    },
    { kind: 'right', author: 'Reclutador', text: `¿Por qué ${nameOf(best.candidate_id)} está primera?`, label: 'El reclutador pide la justificación.' },
    {
      kind: 'tool', event: evalEvent, plain: `Revisar requisito por requisito el CV de ${nameOf(best.candidate_id)}`,
      label: 'Revisa su CV requisito por requisito.', resultLabel: 'El detalle de la evaluación.',
      summary: `Cumple ${evaluation.matched_requirements.length} de ${jd.requirements.length} requisitos; le faltan ${evaluation.missing_requirements.length}.`,
    },
    {
      kind: 'left', author: 'Asistente',
      text: `Cumple los ${evaluation.matched_requirements.length} requisitos, por ejemplo "${evaluation.matched_requirements[1] ?? evaluation.matched_requirements[0]}".`,
      label: 'Explica con evidencia.',
    },
    { kind: 'right', author: 'Reclutador', text: `${targetName} quedó cerca. ¿Hay algo raro en su CV?`, label: 'El reclutador pregunta por otra candidata.' },
    {
      kind: 'tool', event: incEvent, plain: `Buscar datos que no cuadren en el CV de ${targetName}`,
      label: 'Busca datos que no cuadren.', resultLabel: issue ? 'Encontró uno.' : 'No encontró nada.',
      summary: issue ? 'La experiencia que declara no coincide con la que suman sus trabajos.' : 'Sin datos que no cuadren.',
    },
    {
      kind: 'left', author: 'Asistente',
      text: issue && mentioned ? `Sí: su perfil dice ${mentioned} años de experiencia, pero sus trabajos suman ${declared?.toLocaleString('es')}. Conviene aclararlo antes de decidir.` : 'No encontré datos que no cuadren.',
      label: 'Explica el hallazgo.',
    },
    { kind: 'right', author: 'Reclutador', text: 'Dame su informe.', label: 'El reclutador pide el informe.' },
    {
      kind: 'tool', event: reportEvent, plain: `Preparar el informe de ${targetName}`,
      label: 'Prepara el informe.', resultLabel: 'Informe con recomendación.',
      summary: h('p.inline-report', {}, statusPill(report.recommendation), h('span.mono', {}, ` nota ${formatScore(report.score)}`), ` · cumple ${report.matched_requirements.length} requisitos · ${report.inconsistencies.length} dato por aclarar`),
    },
    { kind: 'right', author: 'Reclutador', text: 'Prepárale unas preguntas para aclararlo.', label: 'El reclutador pide la conversación.' },
    {
      kind: 'tool', event: scriptEvent, plain: `Preparar las preguntas para ${targetName}`,
      label: 'Prepara las preguntas.', resultLabel: `${script.questions.length} preguntas.`,
      summary: h('ol.script-list', {}, ...script.questions.map((q, i) => h('li', {}, `${i + 1}. ${TOPIC[q.topic] ?? q.topic}`))),
    },
    {
      kind: 'left', author: 'Asistente',
      text: `Listo. Conversé con ${targetName} y respondió ${answered} de ${handoff.answers.length} preguntas.`,
      label: 'El asistente conversa con la candidata (respuestas de ejemplo).',
    },
    {
      kind: 'tool', event: handoffEvent, plain: 'Armar la hoja para la entrevista',
      label: 'Arma la hoja para el reclutador.', resultLabel: 'Hoja lista.',
      summary: `${answered} ${answered === 1 ? 'respondida' : 'respondidas'}, ${handoff.unanswered_questions.length} ${handoff.unanswered_questions.length === 1 ? 'pendiente' : 'pendientes'}. Siguiente paso: ${handoff.next_step === 'entrevista_humana' ? 'entrevista con una persona del equipo' : 'pedir el CV de nuevo'}.`,
    },
    { kind: 'right', author: 'Reclutador', text: 'Perfecto. Pásame toda la vacante en Excel.', label: 'El reclutador pide el Excel.' },
    {
      kind: 'tool', event: excelEvent, plain: 'Calificar a toda la vacante y guardar el Excel',
      label: 'Califica a toda la vacante y guarda el Excel.', resultLabel: 'Archivo listo.',
      summary: h(
        'div.inline-excel',
        {},
        h('p', {}, `${batch.matched_count} coincidencias · ${batch.discarded_count} descartados`),
        h('a.btn.btn-small', { href: excel.url, download: excel.fileName }, h('span.plain-only', {}, 'Descargar el Excel'), h('span.tech-only', {}, excel.fileName)),
      ),
    },
    {
      kind: 'left', author: 'Asistente',
      text:
        `Aquí está: ${batch.matched_count} coincidencias y ${batch.discarded_count} descartados.` +
        (excelMatched.includes(target) && !passing.some((p) => p.candidate_id === target) ? ` Esta vez ${targetName} llegó justo al mínimo: la nota de Jev puede variar un poco entre ejecuciones.` : '') +
        ' La decisión final es tuya.',
      label: 'Entrega el reporte; decide el reclutador.',
    },
  ];

  const demo = createDemo({
    label: 'Chat: reclutador y asistente',
    recordedAt,
    build: () => createChat(messages, 'Conversación entre el reclutador y el asistente'),
    onRender: (_index, _player, stage) => followChat(stage),
    note: 'las 9 herramientas y sus resultados son reales; los mensajes están redactados para la demo',
  });
  titleDemo(demo.el, 'Así se usa', 'Un caso completo, con todas las herramientas');

  return slide(
    { id: 'en-uso', title: 'Así se usa', className: 'slide-demo slide-usage' },
    h('p.slide-intro-line', { 'data-reveal': '' }, 'Antes de ver cómo funciona por dentro, así lo vive el reclutador: pregunta en lenguaje natural y el asistente usa las herramientas.'),
    h('div.demo-host.chat-host', { 'data-reveal': '' }, demo.el),
  );
}

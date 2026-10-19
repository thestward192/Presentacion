// Formato de las trazas grabadas por scripts/grabar_trazas.py (ver 04_trace_replay.md).

export type Scorer = 'deterministic' | 'typesafe';

export interface TraceEvent<R = unknown> {
  tool: string;
  args: Record<string, unknown>;
  scorer: Scorer;
  started_at: string;
  duration_ms: number;
  is_error: boolean;
  result: R | null;
  error: string | null;
  note: string;
}

export interface TraceFile<R = unknown> {
  trace: string;
  title: string;
  events: TraceEvent<R>[];
  [extra: string]: unknown;
}

export interface TraceIndex {
  recorded_at: string;
  source: string;
  vacancy: string;
  broken_vacancy: string;
  jev_model: string;
  notes: string[];
  files: string[];
}

// Salidas estructuradas de las tools (mismos campos que domain/prescreening.py).

export interface JobDescription {
  vacancy_id: string;
  requirements: string[];
  nice_to_have: string[];
  min_experience_years: number | null;
  raw_text: string;
}

export interface CandidateCv {
  candidate_id: string;
  vacancy_id: string;
  years_experience: number | null;
  skills: string[];
  raw_text: string;
  read_error: string | null;
}

export interface MatchEvaluation {
  candidate_id: string;
  vacancy_id: string;
  score: number;
  matched_requirements: string[];
  missing_requirements: string[];
}

export interface CvInconsistencyReport {
  candidate_id: string;
  issues: string[];
}

export type Recommendation = 'avanzar' | 'revisar' | 'descartar' | 'no_procesable';

export interface ScreeningReport {
  candidate_id: string;
  vacancy_id: string;
  score: number | null;
  missing_requirements: string[];
  inconsistencies: string[];
  recommendation: Recommendation;
  matched_requirements: string[];
  unprocessable_reason: string | null;
}

export interface ConversationQuestion {
  question_id: string;
  topic: string;
  question: string;
}

export interface PrescreeningConversation {
  candidate_id: string;
  vacancy_id: string;
  greeting: string;
  questions: ConversationQuestion[];
  closing: string;
}

export interface InterviewHandoff {
  candidate_id: string;
  vacancy_id: string;
  score: number | null;
  recommendation: Recommendation;
  answers: (ConversationQuestion & { answer: string | null })[];
  unanswered_questions: string[];
  next_step: 'entrevista_humana' | 'solicitar_cv';
}

export interface ScreeningReportBatchResult {
  vacancy_id: string;
  file_path: string;
  generated_at: string;
  matched_count: number;
  discarded_count: number;
  threshold: number;
}

export interface ComparisonRow {
  candidate_id: string;
  deterministic_score: number;
  jev_score: number;
  deterministic_matched: string[];
  jev_matched: string[];
  jev_missing: string[];
}

/** Las tools que devuelven listas vienen envueltas en { result: [...] }. */
export interface ListResult<T> {
  result: T[];
}

export interface Traces {
  index: TraceIndex;
  jd: TraceFile<JobDescription>;
  cv: TraceFile<ListResult<CandidateCv>>;
  match: TraceFile<MatchEvaluation | ListResult<MatchEvaluation>> & {
    comparison: ComparisonRow[];
    threshold: number;
    jev_model: string;
  };
  inconsistencies: TraceFile<CvInconsistencyReport>;
  report: TraceFile<ScreeningReport>;
  conversation: TraceFile<PrescreeningConversation | InterviewHandoff>;
  excel: TraceFile<ScreeningReportBatchResult>;
}

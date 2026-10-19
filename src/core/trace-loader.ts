import type { TraceEvent, TraceFile, TraceIndex, Traces } from './types';

const BASE = `${import.meta.env.BASE_URL}traces/`;

// Cada sección sabe qué traza usa por su prefijo, no por el nombre completo:
// así se pueden reemplazar las trazas por otras grabaciones sin tocar código.
const SLOTS: Record<keyof Omit<Traces, 'index'>, string> = {
  jd: '01_',
  cv: '02_',
  match: '03_',
  inconsistencies: '04_',
  report: '05_',
  conversation: '06_',
  excel: '07_',
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(BASE + path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (${response.status})`);
  return (await response.json()) as T;
}

export async function loadTraces(): Promise<Traces> {
  const index = await fetchJson<TraceIndex>('index.json');
  const entries = await Promise.all(
    Object.entries(SLOTS).map(async ([slot, prefix]) => {
      const file = index.files.find((name) => name.startsWith(prefix));
      if (!file) throw new Error(`index.json no lista ninguna traza ${prefix}*.json`);
      return [slot, await fetchJson<TraceFile>(file)] as const;
    }),
  );
  return { index, ...Object.fromEntries(entries) } as Traces;
}

export function traceUrl(path: string): string {
  return BASE + path;
}

/** Busca un evento por tool, scorer y argumentos. Falla fuerte si la traza cambió. */
export function findEvent<R>(
  file: TraceFile<R>,
  predicate: (event: TraceEvent<R>) => boolean,
  description: string,
): TraceEvent<R> {
  const event = file.events.find(predicate);
  if (!event) throw new Error(`La traza ${file.trace} no tiene el evento: ${description}`);
  return event;
}

export function shortTool(tool: string): string {
  return tool.replace(/^talent_acquisition_/, '');
}

export function formatRecordedAt(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date);
}

export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toLocaleString('es', { maximumFractionDigits: 1 })} s`;
  return `${ms} ms`;
}

export function formatScore(score: number | null): string {
  if (score === null) return 'sin nota';
  return score.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Nombre de archivo sin la ruta local (no se muestran rutas de la máquina que grabó). */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

// Reproductor de trazas: una sola implementación para demos, chats y walkthroughs.
//
// Recibe una lista de pasos (derivados de eventos reales de traces/) y avanza
// por ellos con Reproducir / Pausa / Paso anterior / Paso siguiente / Repetir y
// velocidad. No sabe dibujar nada: avisa del paso actual y quien lo escucha
// dibuja el estado de forma idempotente, así "paso anterior" no tiene que
// deshacer animaciones.

export interface Step {
  /** Texto corto que narra el paso. */
  label: string;
  /** Duración real en la traza (duration_ms), si el paso es una llamada. */
  realMs?: number;
  /** Pausa extra de lectura, en ms, antes del siguiente paso. */
  hold?: number;
  /** Tiempo total fijo en pantalla (pasos rápidos sin duración propia en la traza). */
  dwellMs?: number;
  /** Línea de código asociada (ver components/code-panel.ts). */
  code?: { excerpt: string; line: string };
}

export type PlayerState = 'idle' | 'playing' | 'paused' | 'ended';

type Listener = (index: number, player: TracePlayer) => void;

/**
 * Escala de tiempo: la raíz cuadrada conserva el orden (lo lento se ve lento)
 * sin que 5,5 s de Jev bloqueen la demo ni 4 ms sean invisibles.
 */
export function scaledMs(realMs: number): number {
  return Math.round(Math.min(2800, Math.max(220, Math.sqrt(realMs) * 34)));
}

const READING_MS = 1100;

export class TracePlayer {
  steps: Step[];
  index = -1;
  state: PlayerState = 'idle';
  speed = 1;
  private timer: number | undefined;
  private listeners: Listener[] = [];
  private stateListeners: ((state: PlayerState) => void)[] = [];

  constructor(steps: Step[]) {
    this.steps = steps;
  }

  get last(): number {
    return this.steps.length - 1;
  }

  onStep(listener: Listener): void {
    this.listeners.push(listener);
  }

  onState(listener: (state: PlayerState) => void): void {
    this.stateListeners.push(listener);
  }

  /** Tiempo que el paso queda en pantalla antes de avanzar (ya con velocidad). */
  dwell(step: Step): number {
    if (step.dwellMs !== undefined) return step.dwellMs / this.speed;
    const running = step.realMs !== undefined ? scaledMs(step.realMs) : 0;
    return (running + READING_MS + (step.hold ?? 0)) / this.speed;
  }

  /** Lo que dura el indicador "ejecutando" de una llamada, con la velocidad actual. */
  runningMs(step: Step): number {
    return step.realMs !== undefined ? scaledMs(step.realMs) / this.speed : 0;
  }

  setSteps(steps: Step[]): void {
    this.stop();
    this.steps = steps;
    this.index = -1;
    this.setState('idle');
    this.emit();
  }

  goTo(index: number): void {
    this.index = Math.max(-1, Math.min(this.last, index));
    this.emit();
    if (this.index >= this.last && this.state === 'playing') {
      this.stop();
      this.setState('ended');
    }
  }

  play(): void {
    if (this.index >= this.last) this.index = -1;
    this.setState('playing');
    this.tick();
  }

  pause(): void {
    this.stop();
    this.setState('paused');
  }

  toggle(): void {
    if (this.state === 'playing') this.pause();
    else this.play();
  }

  next(): void {
    this.pauseIfPlaying();
    this.goTo(this.index + 1);
    if (this.index >= this.last) this.setState('ended');
  }

  prev(): void {
    this.pauseIfPlaying();
    this.goTo(this.index - 1);
  }

  replay(): void {
    this.stop();
    this.index = -1;
    this.emit();
    this.play();
  }

  /** Estado final sin animación (prefers-reduced-motion). */
  showFinal(): void {
    this.stop();
    this.goTo(this.last);
    this.setState('ended');
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    if (this.state === 'playing') {
      this.stop();
      this.tick(true);
    }
  }

  private tick(resume = false): void {
    if (!resume) this.goTo(this.index + 1);
    if (this.state !== 'playing') return;
    const step = this.steps[this.index];
    this.timer = window.setTimeout(() => this.tick(), step ? this.dwell(step) : 0);
  }

  private pauseIfPlaying(): void {
    if (this.state === 'playing') this.pause();
  }

  private stop(): void {
    window.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private setState(state: PlayerState): void {
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.index, this);
  }
}

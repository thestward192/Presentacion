// Estado compartido: el scorer elegido en un toggle se refleja en todas las demos.

import type { Scorer } from './types';

let scorer: Scorer = 'typesafe';
const listeners = new Set<(value: Scorer) => void>();

export const scorerStore = {
  get: () => scorer,
  set(value: Scorer) {
    if (value === scorer) return;
    scorer = value;
    listeners.forEach((listener) => {
      try {
        listener(value);
      } catch (error) {
        console.error(error);
      }
    });
  },
  subscribe(listener: (value: Scorer) => void) {
    listeners.add(listener);
  },
};

export const SCORER_LABEL: Record<Scorer, string> = {
  deterministic: 'Búsqueda exacta',
  typesafe: 'Jev',
};

import { scorerStore } from '../core/store';
import type { Scorer } from '../core/types';
import { toggle } from './layout';

/** Toggle "Determinista | Jev" sincronizado entre todas las demos. */
export function scorerToggle(): HTMLElement {
  const control = toggle<Scorer>(
    'Calificar con',
    [
      { value: 'deterministic', text: 'Búsqueda exacta' },
      { value: 'typesafe', text: 'Jev' },
    ],
    scorerStore.get(),
    (value) => scorerStore.set(value),
  );
  scorerStore.subscribe((value) => control.set(value));
  return control.el;
}

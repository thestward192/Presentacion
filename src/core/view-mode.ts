// Vista simple (por defecto, para todo público) o técnica (código, tools, detalles).
// Lo técnico lleva la clase .tech-only y lo simple .plain-only; el CSS decide qué se ve.

const KEY = 'ta-presentacion-vista';
export type ViewMode = 'simple' | 'tech';

function stored(): ViewMode {
  try {
    return localStorage.getItem(KEY) === 'tech' ? 'tech' : 'simple';
  } catch {
    return 'simple';
  }
}

export function currentView(): ViewMode {
  return document.documentElement.dataset.view === 'tech' ? 'tech' : 'simple';
}

function apply(mode: ViewMode): void {
  document.documentElement.dataset.view = mode;
  window.dispatchEvent(new CustomEvent('viewchange', { detail: mode }));
}

export function initViewToggle(button: HTMLButtonElement): void {
  const sync = () => {
    const tech = currentView() === 'tech';
    button.setAttribute('aria-pressed', String(tech));
    button.title = tech ? 'Ocultar código y detalles técnicos (C)' : 'Mostrar código y detalles técnicos (C)';
  };
  button.addEventListener('click', () => {
    const next: ViewMode = currentView() === 'tech' ? 'simple' : 'tech';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* sin almacenamiento: vale solo para esta visita */
    }
    apply(next);
    sync();
  });
  apply(stored());
  sync();
}

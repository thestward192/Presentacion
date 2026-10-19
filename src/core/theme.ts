// Modo claro / oscuro: sigue al sistema hasta que el usuario elige; luego recuerda.

const KEY = 'ta-presentacion-tema';
type Theme = 'light' | 'dark';

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return stored() ?? (systemDark.matches ? 'dark' : 'light');
}

function apply(theme: Theme | null): void {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

export function initTheme(button: HTMLButtonElement): () => void {
  apply(stored());

  const sync = () => {
    const theme = currentTheme();
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.setAttribute('aria-label', theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    button.dataset.theme = theme;
    button.querySelector('.theme-label')!.textContent = theme === 'dark' ? 'Oscuro' : 'Claro';
  };

  const toggle = () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* sin almacenamiento: el cambio vale solo para esta visita */
    }
    apply(next);
    sync();
  };

  button.addEventListener('click', toggle);
  systemDark.addEventListener('change', () => {
    if (!stored()) sync();
  });
  sync();
  return toggle;
}

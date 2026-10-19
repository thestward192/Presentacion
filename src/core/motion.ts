// Animaciones disparadas por scroll con IntersectionObserver, sin librerías.

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

export function prefersReducedMotion(): boolean {
  return reducedQuery.matches;
}

/** Ejecuta `callback` la primera vez que `el` entra en pantalla. */
export function onceVisible(el: Element, callback: () => void, threshold = 0.35): void {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        callback();
      }
    },
    { threshold },
  );
  observer.observe(el);
}

/** Agrega .is-in a cada [data-reveal] cuando entra (capas, flechas, tarjetas). */
export function revealOnScroll(root: ParentNode = document): void {
  const targets = root.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)');
  if (prefersReducedMotion()) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.25, rootMargin: '0px 0px -8% 0px' },
  );
  targets.forEach((el) => observer.observe(el));
}

/**
 * Scrollytelling: cada [data-scrolly-step] del texto activa su clave en el
 * diagrama sticky cuando cruza la franja central de la pantalla.
 */
export function scrollytelling(
  steps: HTMLElement[],
  onActivate: (key: string, index: number) => void,
): void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        steps.forEach((step) => step.classList.toggle('is-active', step === el));
        onActivate(el.dataset.scrollyStep ?? '', steps.indexOf(el));
      }
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  steps.forEach((step) => observer.observe(step));
}

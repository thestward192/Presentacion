// Presentación por bloques: cada página (Introducción, Oscar, Randall, Stward,
// Cierre) es una serie de bloques a pantalla completa. La rueda, las flechas o
// deslizar no desplazan la página: animan la salida del bloque actual y la
// entrada del siguiente. Al terminar una página se pasa a la siguiente.

import { demoInView } from '../components/demo';
import { h } from './dom';
import { prefersReducedMotion } from './motion';

export interface Page {
  id: string;
  title: string;
  slides: HTMLElement[];
}

interface Position {
  page: number;
  slide: number;
}

const TRANSITION_MS = 850;
const MIN_ZOOM = 0.72;

/** Control del mazo desde afuera (presentación compartida en vivo). */
export interface DeckControl {
  current(): number;
  /** Ir a un bloque sin avisar a los oyentes (el cambio vino de otro presentador). */
  show(index: number): void;
  slideAt(index: number): HTMLElement | undefined;
  /** Avisa cada vez que alguien cambia de bloque en esta pantalla. */
  onNavigate(listener: (index: number) => void): void;
}

export function createDeck(root: HTMLElement, pages: Page[]): DeckControl {
  const listeners: ((index: number) => void)[] = [];
  const flat = pages.flatMap((page, p) => page.slides.map((el, s) => ({ el, page: p, slide: s })));
  let current = -1;
  let busyUntil = 0;

  // -- Estructura -----------------------------------------------------------
  root.replaceChildren(...flat.map(({ el }) => el));
  flat.forEach(({ el, page }) => {
    el.dataset.page = pages[page].id;
    el.querySelectorAll<HTMLElement>('[data-reveal]').forEach((item, i) => item.style.setProperty('--d', String(i)));
  });

  // Barra de páginas (control segmentado estilo iOS) y puntos laterales.
  const segment = document.querySelector<HTMLElement>('.page-tabs')!;
  const pill = h('span.page-pill', { 'aria-hidden': 'true' });
  const tabs = pages.map((page, p) => {
    const tab = h('button.page-tab', { type: 'button', role: 'tab', 'aria-selected': 'false' }, page.title);
    tab.addEventListener('click', () => go(indexOf({ page: p, slide: 0 })));
    return tab;
  });
  segment.replaceChildren(pill, ...tabs);

  const dots = h('nav.dots', { 'aria-label': 'Bloques de esta página' });
  const footer = h('div.deck-footer', { 'aria-live': 'polite' });
  const hint = h('div.scroll-hint', { 'aria-hidden': 'true' }, 'Usa las flechas del teclado o los botones de la derecha para avanzar');
  document.body.append(dots, footer, hint);

  const ambient = document.querySelector<HTMLElement>('.ambient');

  function indexOf(pos: Position): number {
    return flat.findIndex((item) => item.page === pos.page && item.slide === pos.slide);
  }

  // -- Ajuste al alto disponible ---------------------------------------------
  function fit(el: HTMLElement): void {
    const viewport = el.querySelector<HTMLElement>('.slide-viewport')!;
    const inner = el.querySelector<HTMLElement>('.slide-inner')!;
    inner.style.zoom = '1';
    const small = innerWidth < 760;
    const avail = viewport.clientHeight;
    const natural = inner.scrollHeight;
    const zoom = small ? 1 : Math.max(MIN_ZOOM, Math.min(1, avail / natural));
    inner.style.zoom = String(zoom);
    viewport.classList.toggle('is-overflow', natural * zoom > avail + 2);
  }
  const fitAll = () => flat.forEach(({ el }) => fit(el));

  // -- Navegación -----------------------------------------------------------
  function go(target: number, instant = false, notify = true): void {
    if (target < 0 || target >= flat.length || target === current) return;
    const previous = current;
    current = target;
    const { page, slide } = flat[current];
    busyUntil = performance.now() + (instant ? 0 : TRANSITION_MS);

    flat.forEach(({ el }, i) => {
      el.classList.toggle('is-active', i === current);
      el.classList.toggle('is-before', i < current);
      el.classList.toggle('is-after', i > current);
      el.toggleAttribute('inert', i !== current);
    });

    const active = flat[current].el;
    // Las animaciones internas se repiten cada vez que se entra al bloque.
    requestAnimationFrame(() => active.querySelectorAll('[data-reveal]').forEach((item) => item.classList.add('is-in')));
    if (previous >= 0) {
      const left = flat[previous].el;
      window.setTimeout(() => {
        if (!left.classList.contains('is-active')) left.querySelectorAll('[data-reveal]').forEach((item) => item.classList.remove('is-in'));
      }, TRANSITION_MS);
      left.dispatchEvent(new CustomEvent('slide:leave', { bubbles: true }));
    }
    active.dispatchEvent(new CustomEvent('slide:enter', { bubbles: true }));

    // Página activa: control segmentado, fondo y puntos.
    document.body.dataset.page = pages[page].id;
    if (ambient) ambient.dataset.page = String(page);
    tabs.forEach((tab, p) => tab.setAttribute('aria-selected', String(p === page)));
    const tab = tabs[page];
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.style.width = `${tab.offsetWidth}px`;

    const pageSlides = pages[page].slides;
    dots.replaceChildren(
      ...pageSlides.map((el, s) => {
        const dot = h('button.dot', { type: 'button', 'aria-label': el.dataset.title ?? `Bloque ${s + 1}`, 'aria-current': s === slide ? 'step' : undefined }, h('span.dot-label', {}, el.dataset.title ?? ''));
        dot.addEventListener('click', () => go(indexOf({ page, slide: s })));
        return dot;
      }),
    );
    footer.replaceChildren(h('span.footer-page', {}, pages[page].title), h('span.footer-sep', {}, '/'), h('span', {}, active.dataset.title ?? ''), h('span.footer-count', {}, `${slide + 1} de ${pageSlides.length}`));
    hint.classList.toggle('is-hidden', current !== 0);
    document.querySelector('.deck-up')?.toggleAttribute('disabled', current === 0);
    document.querySelector('.deck-down')?.toggleAttribute('disabled', current === flat.length - 1);

    history.replaceState(null, '', `#${pages[page].id}/${slide + 1}`);
    if (notify) listeners.forEach((listener) => listener(current));
  }

  const next = () => go(current + 1);
  const prev = () => go(current - 1);
  const canMove = () => performance.now() >= busyUntil;

  // -- Botones de navegación ----------------------------------------------------
  // La rueda y el arrastre NO cambian de bloque: solo desplazan el contenido.
  // Se cambia con estos botones o con las flechas del teclado.
  const upButton = h('button.deck-btn.deck-up', { type: 'button', 'aria-label': 'Bloque anterior' }, h('i'));
  const downButton = h('button.deck-btn.deck-down', { type: 'button', 'aria-label': 'Bloque siguiente' }, h('i'));
  upButton.addEventListener('click', () => canMove() && prev());
  downButton.addEventListener('click', () => canMove() && next());
  document.body.append(h('div.deck-arrows', {}, upButton, downButton));

  // -- Teclado -------------------------------------------------------------------
  addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target instanceof Element ? event.target : document.body;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const onControl = target.closest('button, a, summary, [role="radio"], [role="tab"]');
    const demo = () => demoInView(flat[current].el);

    switch (event.key) {
      case 'ArrowDown':
      case 'PageDown':
        event.preventDefault();
        if (canMove()) next();
        break;
      case 'ArrowUp':
      case 'PageUp':
        event.preventDefault();
        if (canMove()) prev();
        break;
      case 'Home':
        event.preventDefault();
        go(indexOf({ page: flat[current].page, slide: 0 }));
        break;
      case 'End':
        event.preventDefault();
        go(indexOf({ page: flat[current].page, slide: pages[flat[current].page].slides.length - 1 }));
        break;
      case 'ArrowRight':
      case 'ArrowLeft': {
        const d = demo();
        if (!d) {
          // Animaciones por pasos ("Cómo se arma", Recorrido, Cómo está hecho):
          // derecha avanza un paso, izquierda retrocede; al final no vuelve sola al inicio.
          const nav = flat[current].el.querySelector('.bt-nav, .steps-bar');
          if (!nav) return;
          event.preventDefault();
          const buttons = nav.querySelectorAll<HTMLButtonElement>('.step-nav');
          const back = buttons[0];
          const forward = nav.querySelector<HTMLButtonElement>('.step-nav.is-primary');
          if (event.key === 'ArrowLeft') {
            if (back && !back.disabled) back.click();
          } else if (forward && forward.textContent !== 'Volver al inicio') {
            forward.click();
          }
          return;
        }
        event.preventDefault();
        if (event.key === 'ArrowRight') d.player.next();
        else d.player.prev();
        break;
      }
      case ' ': {
        if (onControl) return;
        event.preventDefault();
        const d = demo();
        if (d) d.player.toggle();
        else if (canMove()) next();
        break;
      }
      case 't':
      case 'T':
        document.querySelector<HTMLButtonElement>('.theme-toggle')?.click();
        break;
      case 'c':
      case 'C':
        document.querySelector<HTMLButtonElement>('.view-toggle')?.click();
        break;
      default:
        if (/^[1-9]$/.test(event.key) && Number(event.key) <= pages.length) {
          go(indexOf({ page: Number(event.key) - 1, slide: 0 }));
        }
    }
  });

  // -- Reajustes ---------------------------------------------------------------
  let resizeTimer: number | undefined;
  addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      fitAll();
      const tab = tabs[flat[current]?.page ?? 0];
      pill.style.transform = `translateX(${tab.offsetLeft}px)`;
      pill.style.width = `${tab.offsetWidth}px`;
    }, 120);
  });
  addEventListener('viewchange', () => requestAnimationFrame(fitAll));
  root.addEventListener('content:change', (event) => {
    const el = (event.target as Element).closest<HTMLElement>('.slide');
    if (el) requestAnimationFrame(() => fit(el));
  });
  root.addEventListener('toggle', (event) => {
    const el = (event.target as Element).closest<HTMLElement>('.slide');
    if (el) fit(el);
  }, true);
  void document.fonts?.ready.then(fitAll);

  // -- Inicio: bloque indicado en la dirección (#oscar/2) o el primero --------
  fitAll();
  const [pageId, number] = location.hash.slice(1).split('/');
  const startPage = Math.max(0, pages.findIndex((page) => page.id === pageId));
  const start = indexOf({ page: startPage, slide: Math.max(0, Number(number || 1) - 1) });
  document.documentElement.classList.toggle('reduced-motion', prefersReducedMotion());
  go(start === -1 ? 0 : start, true, false);

  return {
    current: () => current,
    show: (index) => go(index, false, false),
    slideAt: (index) => flat[index]?.el,
    onNavigate: (listener) => listeners.push(listener),
  };
}

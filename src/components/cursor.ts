// Cursor propio: un punto del color de acento y un anillo que lo sigue con
// suavidad. Sobre lo que se puede tocar, el anillo crece; al hacer clic, se
// encoge. Solo en dispositivos con mouse; en pantallas táctiles no aparece.

import { h } from '../core/dom';
import { prefersReducedMotion } from '../core/motion';

const INTERACTIVE = 'a, button, summary, [role="tab"], [role="radio"], .db-row, .step-tab, input, select';

export function initCursor(): void {
  if (!matchMedia('(pointer: fine)').matches) return;
  const dot = h('div.cursor-dot', { 'aria-hidden': 'true' });
  const ring = h('div.cursor-ring', { 'aria-hidden': 'true' });
  document.body.append(ring, dot);
  document.documentElement.classList.add('has-cursor');

  let x = innerWidth / 2;
  let y = innerHeight / 2;
  let rx = x;
  let ry = y;
  let visible = false;

  addEventListener('pointermove', (event) => {
    x = event.clientX;
    y = event.clientY;
    dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (!visible) {
      visible = true;
      rx = x;
      ry = y;
      document.documentElement.classList.add('cursor-visible');
    }
    const target = event.target instanceof Element ? event.target : null;
    ring.classList.toggle('is-hover', !!target?.closest(INTERACTIVE));
    ring.classList.toggle('is-text', !!target?.closest('pre, code, .doc-text, p, td, li') && !target?.closest(INTERACTIVE));
  }, { passive: true });
  addEventListener('pointerdown', () => ring.classList.add('is-down'));
  addEventListener('pointerup', () => ring.classList.remove('is-down'));
  document.addEventListener('pointerleave', () => {
    visible = false;
    document.documentElement.classList.remove('cursor-visible');
  });

  const follow = () => {
    const ease = prefersReducedMotion() ? 1 : 0.2;
    rx += (x - rx) * ease;
    ry += (y - ry) * ease;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
}

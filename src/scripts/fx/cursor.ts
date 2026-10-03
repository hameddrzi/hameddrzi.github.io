// Custom cursor (desktop fine pointer only). DOM lives in Cursor.astro.
import { gsap } from 'gsap';
import { finePointer, prefersReduced } from './env';

const HOVERABLE = 'a, button, [role="button"], [data-magnetic], label, summary, select, input, textarea';

export function initCursor(): void {
  const root = document.querySelector<HTMLElement>('[data-cursor-root]');
  if (!root || !finePointer() || prefersReduced()) return;
  const dot = root.querySelector<HTMLElement>('[data-cursor-dot]')!;
  const ring = root.querySelector<HTMLElement>('[data-cursor-ring]')!;
  const pill = root.querySelector<HTMLElement>('[data-cursor-pill]')!;
  const label = root.querySelector<HTMLElement>('[data-cursor-label]')!;
  if (!dot || !ring || !pill || !label) return;

  const html = document.documentElement;
  const q = (el: HTMLElement, d: number) => ({
    x: gsap.quickTo(el, 'x', { duration: d, ease: 'power3.out' }),
    y: gsap.quickTo(el, 'y', { duration: d, ease: 'power3.out' }),
  });
  const qd = q(dot, 0.08);
  const qr = q(ring, 0.55);
  const qp = q(pill, 0.35);
  let seen = false;

  const show = () => root.classList.add('is-visible');
  const hide = () => root.classList.remove('is-visible');

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const { clientX: x, clientY: y } = e;
    if (!seen) {
      seen = true;
      gsap.set([dot, ring, pill], { x, y });
      html.classList.add('has-cursor');
    }
    show();
    qd.x(x); qd.y(y); qr.x(x); qr.y(y); qp.x(x); qp.y(y);
  }, { passive: true });

  // touch input: hand back to native and hide the custom cursor
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') { hide(); html.classList.remove('has-cursor'); seen = false; return; }
    root.classList.add('is-down');
  });
  window.addEventListener('pointerup', () => root.classList.remove('is-down'));
  document.documentElement.addEventListener('mouseleave', hide);
  document.addEventListener('mouseleave', hide);
  window.addEventListener('blur', hide);

  let lastLabel = '';
  const resolve = (target: EventTarget | null) => {
    const t = target instanceof Element ? target : null;
    const labelled = t?.closest<HTMLElement>('[data-cursor]');
    const text = labelled?.dataset.cursor?.trim() || '';
    if (labelled && text) {
      if (text !== lastLabel) { label.textContent = text; lastLabel = text; }
      root.classList.add('is-label');
      root.classList.remove('is-hover');
      return;
    }
    root.classList.remove('is-label');
    root.classList.toggle('is-hover', !!(labelled || t?.closest(HOVERABLE)));
  };
  document.addEventListener('pointerover', (e) => resolve(e.target), { passive: true });
  // content can move under a still pointer while scrolling
  window.addEventListener('scroll', () => {
    if (!seen) return;
    const x = Number(gsap.getProperty(dot, 'x'));
    const y = Number(gsap.getProperty(dot, 'y'));
    resolve(document.elementFromPoint(x, y));
  }, { passive: true });
}

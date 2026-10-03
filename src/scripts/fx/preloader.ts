// Preloader: real progress (fonts + portrait + window load) with min/max durations, then a curtain split.
// Resolves when the curtain starts opening (that's when app:ready fires).
import { gsap } from 'gsap';
import { prefersReduced } from './env';

const KEY = 'hd:visited';

function visitedBefore(): boolean {
  try { const v = sessionStorage.getItem(KEY) === '1'; sessionStorage.setItem(KEY, '1'); return v; } catch { return false; }
}

export function runPreloader(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-preloader]');
  const html = document.documentElement;
  if (!root) return Promise.resolve();
  root.style.animation = 'none'; // cancel the CSS failsafe, JS is in charge now

  const reduced = prefersReduced();
  const repeat = visitedBefore();
  const minDur = reduced ? 0.3 : repeat ? 0.6 : 1.6;
  const maxDur = reduced ? 1.5 : repeat ? 1.4 : 4;

  const countEl = root.querySelector<HTMLElement>('[data-pl-count]');
  const lineEl = root.querySelector<HTMLElement>('[data-pl-line]');
  const chars = Array.from(root.querySelectorAll<HTMLElement>('[data-pl-char]'));
  const top = root.querySelector<HTMLElement>('[data-pl-top]');
  const bottom = root.querySelector<HTMLElement>('[data-pl-bottom]');
  const content = root.querySelector<HTMLElement>('[data-pl-content]');

  // --- real loading tasks
  const tasks: Promise<unknown>[] = [];
  const timeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
  tasks.push(timeout((document as any).fonts?.ready ?? Promise.resolve(), 3500));
  tasks.push(new Promise<void>((res) => {
    const img = new Image();
    img.onload = img.onerror = () => res();
    img.src = '/img/hamed.png';
  }));
  tasks.push(document.readyState === 'complete' ? Promise.resolve() : new Promise<void>((r) => window.addEventListener('load', () => r(), { once: true })));
  let done = 0;
  tasks.forEach((t) => t.then(() => { done++; }));

  if (!reduced) gsap.set(chars, { yPercent: 110, opacity: 0 });
  const shown = new Set<number>();
  const GLYPH = '#%&/<>_=+*0123456789';

  return new Promise<void>((resolve) => {
    const t0 = performance.now();
    let p = 0;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (countEl) countEl.textContent = '100';
      try { sessionStorage.setItem(KEY, '1'); } catch { /* noop */ }
      let readyDone = false;
      const ready = () => {
        if (readyDone) return;
        readyDone = true;
        html.classList.add('is-ready');
        html.classList.remove('is-loading');
        window.dispatchEvent(new Event('app:ready'));
        resolve();
      };
      const cleanup = () => { root.style.display = 'none'; root.setAttribute('aria-hidden', 'true'); };

      if (document.hidden) { ready(); cleanup(); return; }
      if (reduced) {
        ready();
        gsap.to(root, { autoAlpha: 0, duration: 0.4, onComplete: cleanup });
        return;
      }
      // hard failsafe: even if the ticker stalls (background tab) the curtain never stays up
      window.setTimeout(() => { if (!html.classList.contains('is-ready')) ready(); cleanup(); }, 3500);
      const tl = gsap.timeline({ onComplete: cleanup });
      tl.set(chars, { yPercent: 0, opacity: 1 })
        .to(lineEl, { scaleX: 1, duration: 0.25, ease: 'power2.out' })
        .to(chars, { yPercent: -110, duration: 0.6, ease: 'expo.in', stagger: { each: 0.025, from: 'center' } }, '+=0.12')
        .to(content?.querySelectorAll('[data-pl-fade]') || [], { autoAlpha: 0, y: -12, duration: 0.45, ease: 'power2.in' }, '<')
        .to(lineEl, { scaleY: 6, opacity: 0, duration: 0.5, ease: 'power2.in' }, '-=0.15')
        .add(ready, '-=0.2')
        .to(top, { yPercent: -101, duration: 1.15, ease: 'expo.inOut' }, '<')
        .to(bottom, { yPercent: 101, duration: 1.15, ease: 'expo.inOut' }, '<');
    };

    const step = () => {
      const el = (performance.now() - t0) / 1000;
      const timeFrac = Math.min(1, el / minDur);
      // unfinished tasks creep forward so the counter never freezes
      const creep = 0.85 * (1 - Math.exp(-el / 1.2));
      const real = (done + (tasks.length - done) * creep) / tasks.length;
      let target = done === tasks.length ? Math.min(1, timeFrac) : Math.min(real, timeFrac);
      if (el >= maxDur) target = 1;
      p += (target - p) * (repeat ? 0.25 : 0.12);
      if (target === 1 && p > 0.995) p = 1;

      if (countEl) countEl.textContent = String(Math.round(p * 100)).padStart(3, '0');
      if (lineEl) lineEl.style.transform = `scaleX(${p})`;
      chars.forEach((c, i) => {
        if (shown.has(i)) return;
        if (p >= ((i + 1) / (chars.length + 1)) * 0.92) {
          shown.add(i);
          if (reduced) return;
          const final = c.dataset.plChar || c.textContent || '';
          gsap.to(c, { yPercent: 0, opacity: 1, duration: 0.7, ease: 'expo.out' });
          let n = 0;
          const iv = window.setInterval(() => {
            c.textContent = n++ < 5 && final.trim() ? GLYPH[(Math.random() * GLYPH.length) | 0] : final;
            if (n > 5) window.clearInterval(iv);
          }, 45);
        }
      });
      if (p >= 1) { finish(); return; }
      next();
    };
    // rAF is paused in hidden tabs: fall back to a timer so loading still completes
    const next = () => (document.hidden ? window.setTimeout(step, 50) : requestAnimationFrame(step));
    next();
  });
}

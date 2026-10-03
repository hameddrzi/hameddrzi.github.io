// FX attribute layer (CONTRACT §4.2). Auto-inits on the whole document; call refreshFx(root) for
// content added later. Reveal-type effects wait for `app:ready` before they can play.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { splitText, type SplitMode, type SplitResult } from './split';
import { scrambleText } from './scramble';
import { prefersReduced, finePointer, onReady, debounce, scan } from './env';

gsap.registerPlugin(ScrollTrigger);

const DONE = 'fxInit'; // dataset flag per element+effect: data-fx-init="split reveal ..."
const claim = (el: HTMLElement, key: string): boolean => {
  const cur = (el.dataset[DONE] || '').split(' ');
  if (cur.includes(key)) return false;
  el.dataset[DONE] = (cur.filter(Boolean).concat(key)).join(' ');
  return true;
};
const delayOf = (el: HTMLElement) => parseFloat(el.dataset.delay || '0') || 0;

/* ------------------------------------------------------------------ */
/* enter queue: things that enter on the same frame get a small stagger */
let queue: { el: HTMLElement; play: (d: number) => void }[] = [];
let queued = false;
function enqueue(el: HTMLElement, play: (d: number) => void) {
  queue.push({ el, play });
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    const batch = queue.sort((a, b) => {
      const p = a.el.compareDocumentPosition(b.el);
      return p & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    queue = [];
    queued = false;
    batch.forEach((q, i) => q.play(Math.min(i, 8) * 0.08 + delayOf(q.el)));
  });
}

// ScrollTrigger drives the reveal; an IntersectionObserver backs it up so nothing can stay hidden
// if trigger positions go stale (late layout changes, pins added by other sections, background tabs).
function whenInView(el: HTMLElement, cb: () => void, start = 'top 90%') {
  let fired = false;
  const fire = () => { if (fired) return; fired = true; io?.disconnect(); cb(); };
  let io: IntersectionObserver | undefined;
  onReady(() => {
    ScrollTrigger.create({ trigger: el, start, once: true, onEnter: fire });
    if ('IntersectionObserver' in window) {
      let t: number | undefined;
      io = new IntersectionObserver((entries) => {
        const vis = entries.some((e) => e.isIntersecting);
        window.clearTimeout(t);
        if (vis) t = window.setTimeout(fire, 900);
      }, { threshold: 0 });
      io.observe(el);
    }
    // anything above the viewport when we become ready (e.g. restored scroll) shows immediately
    if (el.getBoundingClientRect().bottom < 0) fire();
  });
}

/* ------------------------------------------------------------------ */
/* data-split */
const splits: SplitResult[] = [];
const pendingLines = new Set<SplitResult>();

function initSplit(el: HTMLElement) {
  const raw = (el.dataset.split || 'words').trim() as SplitMode;
  const mode: SplitMode = raw === 'chars' || raw === 'lines' ? raw : 'words';
  const res = splitText(el, mode);
  splits.push(res);
  el.classList.add('is-split');
  const reduced = prefersReduced();
  if (reduced) { el.classList.add('is-revealed'); return; }

  const pieces = mode === 'chars' ? res.chars : res.words;
  gsap.set(pieces, { yPercent: 140, rotate: mode === 'chars' ? 0 : 4, transformOrigin: '0% 100%' });
  if (mode === 'lines') pendingLines.add(res);

  whenInView(el, () =>
    enqueue(el, (delay) => {
      pendingLines.delete(res);
      const base = { yPercent: 0, rotate: 0, duration: 1.15, ease: 'expo.out', delay };
      let tween: gsap.core.Tween | gsap.core.Timeline;
      if (mode === 'lines') {
        res.relayout();
        const tl = gsap.timeline({ delay });
        res.lines.forEach((line, i) => tl.to(line, { yPercent: 0, rotate: 0, duration: 1.15, ease: 'expo.out' }, i * 0.1));
        tween = tl;
      } else if (mode === 'chars') {
        tween = gsap.to(pieces, { ...base, stagger: { each: Math.min(0.03, 0.6 / pieces.length) } });
      } else {
        tween = gsap.to(pieces, { ...base, stagger: { each: Math.min(0.06, 0.7 / pieces.length) } });
      }
      tween.eventCallback('onComplete', () => {
        el.classList.add('is-revealed');
        gsap.set(pieces, { clearProps: 'transform,willChange' });
      });
    }),
  );
}

/* ------------------------------------------------------------------ */
/* data-reveal */
function initReveal(el: HTMLElement) {
  if (prefersReduced()) { el.classList.add('is-revealed'); return; }
  const kind = (el.dataset.reveal || 'up').trim();
  const from: gsap.TweenVars =
    kind === 'clip' ? { clipPath: 'inset(100% 0% 0% 0%)', y: 40 }
    : kind === 'fade' ? { autoAlpha: 0 }
    : { y: 56, autoAlpha: 0 };
  const to: gsap.TweenVars =
    kind === 'clip' ? { clipPath: 'inset(0% 0% 0% 0%)', y: 0, duration: 1.4, ease: 'expo.inOut' }
    : kind === 'fade' ? { autoAlpha: 1, duration: 1.4, ease: 'power2.out' }
    : { y: 0, autoAlpha: 1, duration: 1.3, ease: 'expo.out' };
  gsap.set(el, from);
  whenInView(el, () =>
    enqueue(el, (delay) =>
      gsap.to(el, {
        ...to, delay,
        onComplete: () => {
          el.classList.add('is-revealed');
          gsap.set(el, { clearProps: kind === 'clip' ? 'clipPath,transform' : 'transform,opacity,visibility' });
        },
      }),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* data-magnetic */
function initMagnetic(el: HTMLElement) {
  if (!finePointer() || prefersReduced()) return;
  const strength = parseFloat(el.dataset.magnetic || '') || 0.35;
  const inner = el.querySelector<HTMLElement>('[data-magnetic-inner]');
  const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
  const ixTo = inner ? gsap.quickTo(inner, 'x', { duration: 0.6, ease: 'power3.out' }) : null;
  const iyTo = inner ? gsap.quickTo(inner, 'y', { duration: 0.6, ease: 'power3.out' }) : null;
  let rect: DOMRect | null = null;
  el.addEventListener('pointerenter', () => {
    const x = Number(gsap.getProperty(el, 'x')) || 0;
    const y = Number(gsap.getProperty(el, 'y')) || 0;
    const r = el.getBoundingClientRect();
    rect = new DOMRect(r.left - x, r.top - y, r.width, r.height);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !rect) return;
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    xTo(dx * strength); yTo(dy * strength);
    ixTo?.(dx * strength * 0.5); iyTo?.(dy * strength * 0.5);
  });
  el.addEventListener('pointerleave', () => {
    rect = null;
    gsap.to(inner ? [el, inner] : el, { x: 0, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.35)', overwrite: true });
  });
}

/* ------------------------------------------------------------------ */
/* data-scramble */
function initScramble(el: HTMLElement) {
  el.dataset.fxText = el.textContent || '';
  if (prefersReduced()) return;
  whenInView(el, () => enqueue(el, (d) => gsap.delayedCall(d, () => scrambleText(el))), 'top 95%');
  const host = el.closest<HTMLElement>('a, button') || el;
  host.addEventListener('pointerenter', () => scrambleText(el));
  if (host !== el) host.addEventListener('focus', () => scrambleText(el));
}

/* ------------------------------------------------------------------ */
/* data-parallax */
function initParallax(el: HTMLElement) {
  if (prefersReduced()) return;
  const f = parseFloat(el.dataset.parallax || '0.2') || 0.2;
  gsap.fromTo(el,
    { y: () => -f * window.innerHeight * 0.5 },
    {
      y: () => f * window.innerHeight * 0.5, ease: 'none',
      scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
    });
}

/* ------------------------------------------------------------------ */
/* data-count */
function initCount(el: HTMLElement) {
  const raw = el.dataset.count || '0';
  const target = parseFloat(raw) || 0;
  const decimals = (raw.split('.')[1] || '').length;
  const suffix = el.dataset.suffix || '';
  const prefix = el.dataset.prefix || '';
  const fmt = (v: number) => `${prefix}${v.toFixed(decimals)}${suffix}`;
  if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', fmt(target));
  if (prefersReduced()) { el.textContent = fmt(target); return; }
  el.textContent = fmt(0);
  const o = { v: 0 };
  whenInView(el, () =>
    enqueue(el, (delay) =>
      gsap.to(o, {
        v: target, delay, duration: target <= 5 ? 1.2 : 2.2, ease: 'power3.out',
        onUpdate: () => { el.textContent = fmt(decimals ? o.v : Math.round(o.v)); },
        onComplete: () => { el.textContent = fmt(target); },
      }),
    ),
  );
}

/* ------------------------------------------------------------------ */
const EFFECTS: [string, string, (el: HTMLElement) => void][] = [
  ['[data-split]', 'split', initSplit],
  ['[data-reveal]', 'reveal', initReveal],
  ['[data-magnetic]', 'magnetic', initMagnetic],
  ['[data-scramble]', 'scramble', initScramble],
  ['[data-parallax]', 'parallax', initParallax],
  ['[data-count]', 'count', initCount],
];

/** Initialise every FX attribute under root (idempotent per element). data-cursor is handled globally by the cursor. */
export function refreshFx(root: ParentNode = document): void {
  for (const [sel, key, fn] of EFFECTS) {
    scan<HTMLElement>(sel, root).forEach((el) => { if (claim(el, key)) { try { fn(el); } catch (e) { console.warn('[fx]', key, e); } } });
  }
  onReady(() => ScrollTrigger.refresh());
}

let booted = false;
export function initFx(): void {
  if (booted) return;
  booted = true;
  refreshFx(document);
  // lines must be re-measured when width changes (only for not-yet-revealed ones; revealed text reflows freely)
  let lastW = window.innerWidth;
  window.addEventListener('resize', debounce(() => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    pendingLines.forEach((s) => s.relayout());
  }, 200));
}

export { splitText, scrambleText };

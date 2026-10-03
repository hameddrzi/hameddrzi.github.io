// App shell (Agent "shell"): Lenis + ScrollTrigger, preloader lifecycle, FX attributes, cursor, clocks.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initFx, refreshFx } from './fx';
import { initCursor } from './fx/cursor';
import { runPreloader } from './fx/preloader';
import { startClocks } from './fx/clock';
import { prefersReduced } from './fx/env';

gsap.registerPlugin(ScrollTrigger);

declare global {
  interface Window {
    __lenis?: Lenis;
    __refreshFx?: typeof refreshFx;
  }
}

export { refreshFx };

function navHeight(): number {
  const bar = document.querySelector<HTMLElement>('[data-nav-bar]');
  return bar ? bar.offsetHeight : 0;
}

/** Scroll to an element / y / '#id' with Lenis when present, native otherwise. */
export function scrollToTarget(target: string | number | HTMLElement, opts: { immediate?: boolean } = {}): void {
  let el: HTMLElement | null = null;
  if (typeof target === 'string') {
    if (target === '#' || target === '#top') el = document.getElementById('top') || null;
    else { try { el = document.querySelector<HTMLElement>(target); } catch { el = null; } }
    if (!el && (target === '#' || target === '#top')) target = 0;
    else if (!el) return;
  } else if (target instanceof HTMLElement) el = target;

  // only offset for the nav when the target has less top padding than the nav is tall
  let offset = 0;
  if (el && el.id !== 'top') {
    const pad = parseFloat(getComputedStyle(el).paddingTop) || 0;
    if (pad < navHeight()) offset = -navHeight();
  }
  const lenis = window.__lenis;
  if (lenis) {
    lenis.scrollTo(el ?? (target as number), {
      offset, immediate: opts.immediate, force: true,
      duration: 1.6, easing: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    });
  } else if (el) {
    const y = el.getBoundingClientRect().top + window.scrollY + offset;
    window.scrollTo({ top: el.id === 'top' ? 0 : y, behavior: opts.immediate || prefersReduced() ? 'auto' : 'smooth' });
  } else {
    window.scrollTo({ top: target as number, behavior: opts.immediate || prefersReduced() ? 'auto' : 'smooth' });
  }
  // move focus for keyboard / screen-reader users without a second jump
  if (el) {
    if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }
}

let started = false;
export function initApp(): void {
  if (started) return;
  started = true;
  const html = document.documentElement;
  const reduced = prefersReduced();
  html.classList.add('fx', 'is-loading');
  if (reduced) html.classList.add('reduced');

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const initialHash = location.hash;
  try { ScrollTrigger.clearScrollMemory('manual'); } catch { /* older gsap */ }
  window.scrollTo(0, 0);

  // --- Lenis smooth scroll synced with ScrollTrigger
  let lenis: Lenis | undefined;
  if (!reduced) {
    try {
      // syncTouch false: touch devices keep 100% native scrolling (momentum, iOS bars), only wheel is smoothed
      lenis = new Lenis({ lerp: 0.095, wheelMultiplier: 1, smoothWheel: true, syncTouch: false, anchors: false, autoRaf: false } as any);
      window.__lenis = lenis;
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis!.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
      lenis.stop();
    } catch (e) {
      console.warn('[app] lenis failed, using native scroll', e);
      lenis = undefined;
    }
  }

  // --- in-page anchors
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.getAttribute('href') || '#';
    if (href !== '#' && href !== '#top' && !document.querySelector(href)) return;
    e.preventDefault();
    scrollToTarget(href);
  });

  // --- FX + cursor + clocks
  window.__refreshFx = refreshFx;
  initFx();
  initCursor();
  startClocks();

  // --- layout-affecting async things → refresh triggers
  const refresh = () => ScrollTrigger.refresh();
  // the intro always starts at the top (the browser may still try to restore the old position on load)
  const toTop = () => {
    if (html.classList.contains('is-ready')) return;
    window.__lenis ? window.__lenis.scrollTo(0, { immediate: true, force: true }) : window.scrollTo(0, 0);
  };
  window.addEventListener('load', () => { toTop(); requestAnimationFrame(toTop); }, { once: true });
  (document as any).fonts?.ready?.then(refresh);
  if (document.readyState === 'complete') requestAnimationFrame(refresh);
  else window.addEventListener('load', refresh, { once: true });

  // --- preloader → ready (with a safety net so the site can never stay locked)
  let finalized = false;
  const finalize = () => {
    if (finalized) return;
    finalized = true;
    window.clearTimeout(safety);
    toTop();
    if (!html.classList.contains('is-ready')) {
      html.classList.add('is-ready');
      window.dispatchEvent(new Event('app:ready'));
    }
    html.classList.remove('is-loading');
    lenis?.start();
    ScrollTrigger.refresh();
    if (initialHash && initialHash.length > 1) {
      setTimeout(() => scrollToTarget(initialHash), 400);
    }
  };
  const safety = window.setTimeout(() => {
    const pl = document.querySelector<HTMLElement>('[data-preloader]');
    if (pl) pl.style.display = 'none';
    finalize();
  }, 9000);
  runPreloader()
    .catch((e) => console.warn('[app] preloader error', e))
    .finally(finalize);
}

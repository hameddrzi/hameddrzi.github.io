// Shared runtime helpers for the Projects section and its micro-demos.
// OWNER: Agent "projects".

export const reducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const finePointer = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Run `cb` once the shell's preloader is done (or right away if it already finished). */
export function whenReady(cb: () => void): void {
  const html = document.documentElement;
  if (html.classList.contains('is-ready')) {
    cb();
    return;
  }
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cb();
  };
  window.addEventListener('app:ready', run, { once: true });
  // Safety net: if the shell never fires app:ready, don't leave the demos dead.
  window.setTimeout(run, 6000);
}

/**
 * Calls `onChange(true)` when `el` is on screen AND the tab is visible, `onChange(false)` otherwise.
 * Demos use it to start/stop their timers and RAF loops.
 */
export function visibilityGate(el: Element, onChange: (running: boolean) => void, rootMargin = '0px'): () => void {
  let inView = false;
  let running = false;
  const update = () => {
    const next = inView && !document.hidden;
    if (next !== running) {
      running = next;
      onChange(next);
    }
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) inView = e.isIntersecting;
      update();
    },
    { rootMargin },
  );
  io.observe(el);
  document.addEventListener('visibilitychange', update);
  return () => {
    io.disconnect();
    document.removeEventListener('visibilitychange', update);
  };
}

/** Is the project panel containing `el` the currently active one (centered in the viewport)? */
export const isPanelActive = (el: Element): boolean =>
  !!el.closest('.pj-panel')?.classList.contains('is-active');

/** Tiny RAF loop with dt in seconds (clamped so a resumed loop never jumps). */
export function rafLoop(step: (dt: number, now: number) => void) {
  let id = 0;
  let last = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt, now / 1000);
    id = requestAnimationFrame(frame);
  };
  return {
    start() {
      if (id) return;
      last = performance.now();
      id = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(id);
      id = 0;
    },
    get running() {
      return id !== 0;
    },
  };
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+';
/** Local scramble-to-text (used for text that changes on state, which the shell's data-scramble doesn't cover). */
export function scrambleTo(el: HTMLElement, text: string, duration = 520): void {
  const anyEl = el as HTMLElement & { __scr?: number; __tok?: number };
  const tok = (anyEl.__tok = (anyEl.__tok || 0) + 1);
  if (anyEl.__scr) cancelAnimationFrame(anyEl.__scr);
  if (reducedMotion()) {
    el.textContent = text;
    return;
  }
  const start = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    const reveal = Math.floor(p * text.length);
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      out += i < reveal || c === ' ' ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    if (p < 1) anyEl.__scr = requestAnimationFrame(tick);
    else anyEl.__scr = 0;
  };
  anyEl.__scr = requestAnimationFrame(tick);
  // safety: rAF is throttled in background tabs; never leave the label scrambled
  window.setTimeout(() => {
    if (anyEl.__tok !== tok) return;
    if (anyEl.__scr) cancelAnimationFrame(anyEl.__scr);
    anyEl.__scr = 0;
    el.textContent = text;
  }, duration + 80);
}

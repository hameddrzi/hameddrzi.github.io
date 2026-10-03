// Scramble/decode effect for short (mono) text.
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>_-+=*';
const running = new WeakMap<HTMLElement, number>();

export function scrambleText(el: HTMLElement, opts: { duration?: number; text?: string } = {}): void {
  const target = opts.text ?? el.dataset.fxText ?? el.textContent ?? '';
  if (!el.dataset.fxText) el.dataset.fxText = target;
  if (el.children.length) return; // only plain-text nodes are safe to rewrite
  const dur = (opts.duration ?? Math.min(1.1, 0.35 + target.length * 0.03)) * 1000;
  const prev = running.get(el);
  if (prev) cancelAnimationFrame(prev);
  const start = performance.now();
  const chars = Array.from(target);
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    let out = '';
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (c === ' ' || c === ' ' || /[·.,:—–\-/@]/.test(c)) { out += c; continue; }
      // left-to-right resolve with a little randomness
      const threshold = (i / chars.length) * 0.75 + 0.25;
      out += t >= threshold ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    if (t < 1) running.set(el, requestAnimationFrame(tick));
    else { el.textContent = target; running.delete(el); }
  };
  running.set(el, requestAnimationFrame(tick));
}

// Lightweight text splitter. Keeps inline markup (e.g. <span class="serif">) intact,
// wraps every word in an overflow-hidden mask, and optionally every char in its own piece.
// Lines are computed from word positions (no DOM restructuring), so nested markup survives
// and a resize only needs a re-measure.

export type SplitMode = 'words' | 'chars' | 'lines';

export interface SplitResult {
  el: HTMLElement;
  mode: SplitMode;
  masks: HTMLElement[];   // one per word
  words: HTMLElement[];   // .fx-piece per word (moves inside its mask) — for words/lines modes
  chars: HTMLElement[];   // .fx-piece per char — chars mode only
  lines: HTMLElement[][]; // groups of word pieces sharing a visual line
  relayout: () => void;   // re-measure lines
  revert: () => void;
}

const WS = /(\s+)/;

export function splitText(el: HTMLElement, mode: SplitMode = 'words'): SplitResult {
  const original = el.innerHTML;
  const label = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', label);

  const masks: HTMLElement[] = [];
  const words: HTMLElement[] = [];
  const chars: HTMLElement[] = [];

  const walk = (node: Node) => {
    const kids = Array.from(node.childNodes);
    for (const k of kids) {
      if (k.nodeType === Node.TEXT_NODE) {
        const text = k.textContent || '';
        if (!text.trim()) continue; // keep pure whitespace as-is
        const frag = document.createDocumentFragment();
        for (const part of text.split(WS)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); continue; }
          const mask = document.createElement('span');
          mask.className = 'fx-mask';
          mask.setAttribute('aria-hidden', 'true');
          const piece = document.createElement('span');
          piece.className = 'fx-piece fx-word';
          if (mode === 'chars') {
            piece.classList.remove('fx-piece');
            for (const ch of Array.from(part)) {
              const c = document.createElement('span');
              c.className = 'fx-piece fx-char';
              c.textContent = ch;
              piece.appendChild(c);
              chars.push(c);
            }
          } else {
            piece.textContent = part;
          }
          mask.appendChild(piece);
          frag.appendChild(mask);
          masks.push(mask);
          words.push(piece);
        }
        node.replaceChild(frag, k);
      } else if (k.nodeType === Node.ELEMENT_NODE) {
        const e = k as HTMLElement;
        if (e.tagName === 'BR') continue;
        // nested inline element: keep it, split inside; hide its own a11y tree (parent has aria-label)
        e.setAttribute('aria-hidden', 'true');
        walk(e);
      }
    }
  };
  walk(el);

  const lines: HTMLElement[][] = [];
  const relayout = () => {
    lines.length = 0;
    let lastTop = -Infinity;
    let cur: HTMLElement[] = [];
    masks.forEach((m, i) => {
      const top = m.offsetTop;
      if (Math.abs(top - lastTop) > 4 && cur.length) { lines.push(cur); cur = []; }
      lastTop = top;
      cur.push(words[i]);
    });
    if (cur.length) lines.push(cur);
  };
  relayout();

  return {
    el, mode, masks, words, chars, lines, relayout,
    revert: () => { el.innerHTML = original; },
  };
}

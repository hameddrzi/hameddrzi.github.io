// Shared environment helpers for the shell FX layer.
export const prefersReduced = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const finePointer = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export const isReady = (): boolean => document.documentElement.classList.contains('is-ready');

/** Run cb once the app is ready (preloader finished). Runs immediately if it already fired. */
export function onReady(cb: () => void): void {
  if (isReady()) { cb(); return; }
  window.addEventListener('app:ready', () => cb(), { once: true });
}

export const debounce = <T extends (...a: any[]) => void>(fn: T, ms = 150) => {
  let t: number | undefined;
  return (...a: Parameters<T>) => { window.clearTimeout(t); t = window.setTimeout(() => fn(...a), ms); };
};

export const qsa = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll<T>(sel as any)) as T[];

/** Include root itself if it matches. */
export const scan = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] => {
  const out = qsa<T>(sel, root);
  if (root instanceof Element && root.matches(sel)) out.unshift(root as unknown as T);
  return out;
};

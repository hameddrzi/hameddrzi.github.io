/// <reference lib="webworker" />
/* Generates the procedural forms off the main thread (same seeds + permutation as the main thread). */
import { generators, makePermutation, mulberry32, shuffleWith, formSeed, PERM_SEED, type FormName } from './forms';

type Name = Exclude<FormName, 'about' | 'hero'>;

self.onmessage = (e: MessageEvent<{ count: number; names: Name[] }>) => {
  const { count, names } = e.data;
  const perm = makePermutation(count, mulberry32(PERM_SEED));
  for (const name of names) {
    const arr = shuffleWith(generators[name](count, mulberry32(formSeed(name))), perm);
    (self as unknown as Worker).postMessage({ name, arr }, [arr.buffer]);
  }
};

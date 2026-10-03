/*
 * Portrait sampler: turns /img/hamed.png into a particle bust.
 *
 * The photo is a dark-haired subject on a light, flat beige wall. Additive particles on a dark page read as
 * "light", so to keep the face reading as a normal (positive) image we:
 *   1. segment the subject from the wall with a flood fill from the border (wall = light, low-chroma, smooth),
 *   2. inside the subject, weight density by luminance (lit skin glows, hair/shirt stay sparse but present)
 *      plus Sobel edges so eyes/brows/nose/mouth/hairline get crisp contour lines,
 *   3. give the face a gentle convex depth so the parallax reads as 3D.
 * If the segmentation looks wrong (too little / too much subject) it falls back to darkness+edge weighting.
 */
import { Writer, fillDust, gauss, type Rng } from './forms';

const S = 220; // sampling resolution

export async function loadPortrait(url: string, n: number, r: Rng): Promise<Float32Array> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();

  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(img, 0, 0, S, S);
  const px = ctx.getImageData(0, 0, S, S).data;

  const N = S * S;
  const L = new Float32Array(N);
  const chroma = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const R = px[i * 4] / 255, G = px[i * 4 + 1] / 255, B = px[i * 4 + 2] / 255;
    L[i] = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    chroma[i] = (R - B) / Math.max(R, 1e-3);
  }

  // Sobel edges on luminance
  const edge = new Float32Array(N);
  let emax = 1e-6;
  for (let y = 1; y < S - 1; y++)
    for (let x = 1; x < S - 1; x++) {
      const i = y * S + x;
      const gx = L[i - S + 1] + 2 * L[i + 1] + L[i + S + 1] - L[i - S - 1] - 2 * L[i - 1] - L[i + S - 1];
      const gy = L[i + S - 1] + 2 * L[i + S] + L[i + S + 1] - L[i - S - 1] - 2 * L[i - S] - L[i - S + 1];
      const e = Math.hypot(gx, gy);
      edge[i] = e;
      if (e > emax) emax = e;
    }
  for (let i = 0; i < N; i++) edge[i] = Math.min(1, edge[i] / (emax * 0.45));

  // --- background flood fill from the border
  const bg = new Uint8Array(N);
  const bgLike = (i: number) => L[i] > 0.6 && chroma[i] < 0.33;
  const stack: number[] = [];
  for (let k = 0; k < S; k++) {
    for (const i of [k, (S - 1) * S + k, k * S, k * S + S - 1]) if (bgLike(i) && !bg[i]) { bg[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % S, y = (i / S) | 0;
    const nb = [x > 0 ? i - 1 : -1, x < S - 1 ? i + 1 : -1, y > 0 ? i - S : -1, y < S - 1 ? i + S : -1];
    for (const j of nb) {
      if (j < 0 || bg[j]) continue;
      if (bgLike(j) && Math.abs(L[j] - L[i]) < 0.03) { bg[j] = 1; stack.push(j); }
    }
  }
  // grow the background by 1px to remove the halo
  const bg2 = bg.slice();
  for (let y = 1; y < S - 1; y++)
    for (let x = 1; x < S - 1; x++) {
      const i = y * S + x;
      if (!bg[i] && (bg[i - 1] || bg[i + 1] || bg[i - S] || bg[i + S]) && L[i] > 0.5) bg2[i] = 1;
    }
  let subject = 0;
  for (let i = 0; i < N; i++) if (!bg2[i]) subject++;
  const frac = subject / N;
  const segmented = frac > 0.12 && frac < 0.8;

  // --- weights
  const weight = new Float32Array(N);
  const bright = new Float32Array(N);
  let total = 0;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const u = x / S, v = y / S;
      // face region: a soft boost so features get the particle budget
      const fx = (u - 0.5) / 0.17, fy = (v - 0.4) / 0.22;
      const face = Math.exp(-(fx * fx + fy * fy));
      let wgt: number, b: number;
      if (segmented) {
        if (bg2[i]) { weight[i] = 0; continue; }
        const lum = Math.pow(L[i], 1.5);
        wgt = 0.1 + lum * 1.15 + edge[i] * 0.9;
        wgt *= 1 + face * 0.9;
        b = 0.18 + lum * 1.1 + edge[i] * 0.45;
      } else {
        const dark = Math.max(0, (0.85 - L[i]) / 0.85);
        wgt = Math.pow(dark, 1.4) * 0.6 + edge[i] * 1.6;
        wgt *= 1 + face * 0.8;
        b = 0.3 + edge[i] + dark * 0.4;
      }
      weight[i] = wgt;
      bright[i] = b;
      total += wgt;
    }

  // --- importance sampling through a CDF
  const cdf = new Float32Array(N);
  let acc = 0;
  for (let i = 0; i < N; i++) { acc += weight[i] / total; cdf[i] = acc; }
  const w = new Writer(n);
  const count = w.take(0.93);
  const SIZE = 4.5; // world width of the image
  for (let k = 0; k < count; k++) {
    const t = r();
    let lo = 0, hi = N - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < t) lo = m + 1; else hi = m; }
    const x = lo % S, y = (lo / S) | 0;
    const u = (x + r()) / S, v = (y + r()) / S;
    const wx = (u - 0.5) * SIZE;
    const wy = (0.5 - v) * SIZE + 0.05;
    // convex head + slight relief from luminance
    const dx = (u - 0.5) / 0.2, dy = (v - 0.42) / 0.3;
    const z = 0.55 * Math.exp(-(dx * dx + dy * dy)) + (L[lo] - 0.5) * 0.12 + gauss(r) * 0.015;
    w.push(wx, wy, z, Math.min(1.5, bright[lo]));
  }
  fillDust(w, r, 2.9, 6.5, 0.15);
  return w.arr;
}

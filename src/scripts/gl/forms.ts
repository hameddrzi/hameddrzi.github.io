/*
 * Procedural particle forms. Each generator returns Float32Array(count * 4):
 * xyz = position in normalised world space (fits roughly a radius-2.2 sphere), w = brightness/size weight.
 * Generators fill "parts" in order; leftovers become ambient dust. One shared permutation is applied
 * to every form (see shuffleWith) so the morph pairing stays coherent while any prefix of the buffer
 * (drawRange) is still a uniform random subset.
 */

export const FORMS = ['hero', 'about', 'experience', 'voice', 'cookwhat', 'heart', 'medcheck', 'skills', 'contact'] as const;
export type FormName = (typeof FORMS)[number];
export const isForm = (v: unknown): v is FormName => typeof v === 'string' && (FORMS as readonly string[]).includes(v);

// Shared constants with the vertex shader.
export const VORTEX = { r0: 0.05, r: 2.6, pow: 1.6, twist: 7.0, depth: 3.0 };
export const VOICE = { r0: 1.12, ri: 0.9, cut: 2.02 };
export const PIN = { x: 0.35, z: 0.15 };

export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const gauss = (r: Rng) => {
  const u = Math.max(r(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * r());
};
type V3 = [number, number, number];
export function onSphere(r: Rng): V3 {
  const z = r() * 2 - 1;
  const a = r() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return [Math.cos(a) * s, Math.sin(a) * s, z];
}
const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// smooth pseudo noise from sines (deterministic, cheap; enough for organic shapes)
function sinNoise(x: number, y: number, z: number) {
  return (
    Math.sin(x * 1.7 + y * 0.9 + 1.3) * Math.cos(y * 1.3 - z * 1.1 + 0.7) * 0.5 +
    Math.sin(z * 2.3 + x * 1.9 + 4.1) * Math.sin(y * 2.7 + 2.2) * 0.3 +
    Math.sin(x * 4.1 - z * 3.7 + y * 3.3) * 0.2
  );
}

function rotX(p: V3, a: number): V3 { const c = Math.cos(a), s = Math.sin(a); return [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]]; }
function rotY(p: V3, a: number): V3 { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; }
function rotZ(p: V3, a: number): V3 { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]]; }

export class Writer {
  arr: Float32Array;
  i = 0;
  constructor(public n: number) { this.arr = new Float32Array(n * 4); }
  get left() { return this.n - this.i; }
  push(x: number, y: number, z: number, w: number) {
    if (this.i >= this.n) return;
    const o = this.i * 4;
    this.arr[o] = x; this.arr[o + 1] = y; this.arr[o + 2] = z; this.arr[o + 3] = w;
    this.i++;
  }
  /** number of particles for a fraction of the total, clamped to what's left */
  take(frac: number) { return Math.min(this.left, Math.floor(this.n * frac)); }
}

/** fill the rest of the buffer with sparse ambient dust */
export function fillDust(w: Writer, r: Rng, rMin = 2.7, rMax = 6.5, bright = 0.22) {
  while (w.left > 0) {
    const d = onSphere(r);
    const rad = lerp(rMin, rMax, Math.pow(r(), 0.7));
    w.push(d[0] * rad * 1.3, d[1] * rad * 0.85, Math.min(d[2] * rad - 1.0, 2.2), bright * (0.4 + r()));
  }
}

// ------------------------------------------------------------------------------------------
export function seed(n: number, r: Rng) {
  const w = new Writer(n);
  const core = w.take(0.72);
  for (let i = 0; i < core; i++) {
    const d = onSphere(r);
    const rad = Math.abs(gauss(r)) * 0.06;
    w.push(d[0] * rad, d[1] * rad, d[2] * rad, 0.18);
  }
  fillDust(w, r, 3, 9, 0.12);
  return w.arr;
}

// ------------------------------------------------------------------------------------------
/*
 * HERO — "algorithmic core": a processor die on a circuit board. The traces form a graph; per-particle
 * graph membership (edge endpoints + position along it) is returned so the engine can run a Dijkstra
 * traversal wave (and data packets) through the circuit from a new root every cycle.
 */
export interface Graph {
  nodes: V3[];
  adj: number[][];
  /** per particle: edge endpoint A / B (A === B for node particles, -1 for dust) */
  pA: Int16Array;
  pB: Int16Array;
  /** per particle: position along the edge (0 at A) */
  pT: Float32Array;
  /** per particle: 1 = rendered as a 0/1 glyph */
  glyph: Uint8Array;
  /** per particle: random packet phase of its trace (-1 = not on a trace) */
  phase: Float32Array;
  /** terminal via pads (candidate traversal roots) */
  vias: number[];
}

/**
 * CPU package + die + pins, with PCB traces routed out of every pin (straight → 45° bend → straight),
 * ending in via pads, plus a few T-branches. Node 0 is the chip itself (all chip particles belong to it),
 * so a Dijkstra traversal from node 0 visibly floods out of the processor along the traces.
 * Layout is in the x/y plane (board at z = 0, chip raised toward +z); the engine tilts the group.
 */
export function heroGraph(n: number, r: Rng, pinsPerSide: number, glyphFrac: number): { pos: Float32Array; graph: Graph } {
  const nodes: V3[] = [[0, 0, 0.12]];
  const edges: { a: number; b: number; trace: number; virt?: boolean }[] = [];
  const addNode = (p: V3) => { nodes.push(p); return nodes.length - 1; };
  const PKG = 0.56, DIE = 0.33, CHIP_Z = 0.13, PIN_L = 0.1;
  const LANE = 0.13, FAN = 1.05;
  const vias: number[] = [];
  let traceId = 0;
  // routes are generated for the "right" side and rotated for the others
  const rot = (x: number, y: number, side: number): V3 => {
    const a = (side * Math.PI) / 2;
    const c = Math.cos(a), s = Math.sin(a);
    return [x * c - y * s, x * s + y * c, 0];
  };
  for (let side = 0; side < 4; side++) {
    for (let k = 0; k < pinsPerSide; k++) {
      const py = ((k + 0.5) / pinsPerSide - 0.5) * 2 * (PKG - 0.08);
      const tr = traceId++;
      const base = addNode(rot(PKG, py, side));
      const tip = addNode(rot(PKG + PIN_L, py, side));
      edges.push({ a: 0, b: base, trace: tr, virt: true });
      edges.push({ a: base, b: tip, trace: tr });
      // straight → 45° fan-out → straight → via
      const x1 = PKG + PIN_L + LANE;
      const dy = py * FAN;
      const b1 = addNode(rot(x1, py, side));
      const b2 = addNode(rot(x1 + Math.abs(dy), py + dy, side));
      const len3 = 0.22 + r() * 0.75 + (k % 3 === 1 ? 0.25 : 0);
      const xe = x1 + Math.abs(dy) + len3;
      const v = addNode(rot(xe, py + dy, side));
      edges.push({ a: tip, b: b1, trace: tr }, { a: b1, b: b2, trace: tr }, { a: b2, b: v, trace: tr });
      vias.push(v);
      // occasional T-branch off the last straight run: 45° then straight to its own via
      if (r() < 0.32) {
        const sx = x1 + Math.abs(dy) + len3 * (0.3 + r() * 0.4);
        const sgn = py >= 0 ? 1 : -1;
        const d = 0.08 + r() * 0.08;
        const j = addNode(rot(sx, py + dy, side));
        const jb = addNode(rot(sx + d, py + dy + sgn * d, side));
        const jv = addNode(rot(sx + d + 0.12 + r() * 0.25, py + dy + sgn * d, side));
        edges.push({ a: b2, b: j, trace: tr, virt: true }, { a: j, b: jb, trace: tr }, { a: jb, b: jv, trace: tr });
        vias.push(jv);
      }
    }
  }
  const N = nodes.length;
  const adj: number[][] = Array.from({ length: N }, () => []);
  for (const e of edges) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
  const tracePhase = Array.from({ length: traceId }, () => r());
  const real = edges.filter((e) => !e.virt);
  const len = (e: { a: number; b: number }) => Math.hypot(nodes[e.a][0] - nodes[e.b][0], nodes[e.a][1] - nodes[e.b][1]);
  const cdf: number[] = [];
  let acc = 0;
  for (const e of real) { acc += len(e); cdf.push(acc); }
  const pickEdge = () => {
    const t = r() * acc;
    let lo = 0, hi = cdf.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < t) lo = m + 1; else hi = m; }
    return real[lo];
  };

  const w = new Writer(n);
  const g: Graph = {
    nodes, adj, vias,
    pA: new Int16Array(n).fill(-1), pB: new Int16Array(n).fill(-1),
    pT: new Float32Array(n), glyph: new Uint8Array(n), phase: new Float32Array(n).fill(-1),
  };
  const put = (x: number, y: number, z: number, br: number, a: number, b: number, t: number, glyph = 0, phase = -1) => {
    const i = w.i;
    if (i >= n) return;
    g.pA[i] = a; g.pB[i] = b; g.pT[i] = t; g.glyph[i] = glyph; g.phase[i] = phase;
    w.push(x, y, z, br);
  };
  const rectEdge = (h: number) => {
    // random point on the perimeter of a square of half-size h
    const e = r() * 4, s = Math.floor(e), u = (e - s) * 2 - 1;
    return s === 0 ? [h, u * h] : s === 1 ? [-h, u * h] : s === 2 ? [u * h, h] : [u * h, -h];
  };

  // ---- 0/1 glyphs along the traces (some of them drift up off the board in the shader)
  const glyphs = w.take(glyphFrac);
  for (let i = 0; i < glyphs; i++) {
    const e = pickEdge();
    const t = r();
    const A = nodes[e.a], B = nodes[e.b];
    put(lerp(A[0], B[0], t) + gauss(r) * 0.05, lerp(A[1], B[1], t) + gauss(r) * 0.05, 0.05 + r() * 0.12, 0.8, e.a, e.b, t, 1, tracePhase[e.trace]);
  }
  // ---- chip (all belong to node 0)
  const C = 0;
  const pkgOutline = w.take(0.07);
  for (let i = 0; i < pkgOutline; i++) {
    const [x, y] = rectEdge(PKG);
    const top = r() < 0.65;
    put(x + gauss(r) * 0.003, y + gauss(r) * 0.003, top ? CHIP_Z - 0.03 : 0, top ? 1.1 : 0.55, C, C, 0);
  }
  const pkgFill = w.take(0.05);
  for (let i = 0; i < pkgFill; i++) {
    const x = (r() * 2 - 1) * PKG, y = (r() * 2 - 1) * PKG;
    if (Math.max(Math.abs(x), Math.abs(y)) < DIE + 0.02) { i--; continue; }
    put(x, y, CHIP_Z - 0.03, 0.22, C, C, 0);
  }
  // pin-1 marker dot
  const marker = w.take(0.004);
  for (let i = 0; i < marker; i++) {
    const d = onSphere(r);
    put(-PKG + 0.1 + d[0] * 0.025, PKG - 0.1 + d[1] * 0.025, CHIP_Z - 0.02, 1.3, C, C, 0);
  }
  const dieOutline = w.take(0.045);
  for (let i = 0; i < dieOutline; i++) {
    const [x, y] = rectEdge(DIE);
    put(x + gauss(r) * 0.0025, y + gauss(r) * 0.0025, CHIP_Z, 1.35, C, C, 0);
  }
  // die: fine grid of cells (8×8) with a few lit blocks
  const CELLS = 8;
  const dieGrid = w.take(0.11);
  for (let i = 0; i < dieGrid; i++) {
    const k = Math.floor(r() * (CELLS - 1)) + 1;
    const c = -DIE + (k / CELLS) * 2 * DIE;
    const u = (r() * 2 - 1) * DIE;
    const horiz = r() < 0.5;
    put(horiz ? u : c, horiz ? c : u, CHIP_Z, 0.65, C, C, 0);
  }
  const dieBlocks = w.take(0.035);
  const lit: [number, number][] = [];
  for (let k = 0; k < 9; k++) lit.push([Math.floor(r() * CELLS), Math.floor(r() * CELLS)]);
  for (let i = 0; i < dieBlocks; i++) {
    const [cx, cy] = lit[Math.floor(r() * lit.length)];
    const cell = (2 * DIE) / CELLS;
    put(-DIE + (cx + 0.15 + r() * 0.7) * cell, -DIE + (cy + 0.15 + r() * 0.7) * cell, CHIP_Z, 0.9, C, C, 0);
  }
  // ---- pins + traces (edges with particles)
  const traces = w.take(0.56);
  for (let i = 0; i < traces; i++) {
    const e = pickEdge();
    const t = r();
    const A = nodes[e.a], B = nodes[e.b];
    const isPin = e.a !== 0 && Math.max(Math.abs(A[0]), Math.abs(A[1])) < PKG + 0.01;
    const wdt = isPin ? 0.012 : 0.0035;
    // pins are short flat legs: width across the trace direction
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
    const off = (r() * 2 - 1) * wdt;
    put(lerp(A[0], B[0], t) - (dy / L) * off, lerp(A[1], B[1], t) + (dx / L) * off, isPin ? lerp(CHIP_Z * 0.5, 0, t) : gauss(r) * 0.003,
      isPin ? 1.05 : 0.6, e.a, e.b, t, 0, tracePhase[e.trace]);
  }
  // ---- via pads: small rings
  const viaP = w.take(0.06);
  for (let i = 0; i < viaP; i++) {
    const v = vias[Math.floor(r() * vias.length)];
    const a = r() * TAU, rr = (r() < 0.75 ? 0.032 : 0.012) + gauss(r) * 0.002;
    put(nodes[v][0] + Math.cos(a) * rr, nodes[v][1] + Math.sin(a) * rr, 0, 1.15, v, v, 0);
  }
  fillDust(w, r);
  return { pos: w.arr, graph: g };
}

// ------------------------------------------------------------------------------------------
/** used for "about" until the portrait image has loaded: a soft head/shoulders bust */
export function bust(n: number, r: Rng) {
  const w = new Writer(n);
  const head = w.take(0.4);
  for (let i = 0; i < head; i++) {
    const d = onSphere(r);
    w.push(d[0] * 0.62, d[1] * 0.8 + 0.75, d[2] * 0.6, 0.7);
  }
  const body = w.take(0.45);
  for (let i = 0; i < body; i++) {
    const x = (r() * 2 - 1);
    const y = r();
    const half = 0.45 + y * 1.4;
    w.push(x * half, -0.3 - y * 1.5, gauss(r) * 0.12, 0.45);
  }
  fillDust(w, r);
  return w.arr;
}

// ------------------------------------------------------------------------------------------
function experience(n: number, r: Rng) {
  const w = new Writer(n);
  const cols = 4, rows = 4, layers = 3;
  const sx = 0.98, sz = 0.78, sy = 0.62;
  const W = 0.78, D = 0.56;
  const cells: { c: V3; rowsN: number; lift: number }[] = [];
  for (let l = 0; l < layers; l++)
    for (let row = 0; row < rows; row++)
      for (let c = 0; c < cols; c++) {
        if (l === 2 && row === 0 && c === 3) continue; // 47 cells
        const lift = r() < 0.18 ? 0.08 + r() * 0.12 : 0;
        cells.push({
          c: [(c - (cols - 1) / 2) * sx, (l - (layers - 1) / 2) * sy + lift, (row - (rows - 1) / 2) * sz],
          rowsN: 3 + Math.floor(r() * 4),
          lift,
        });
      }
  const iso = (p: V3): V3 => {
    let q = rotY(p, -0.72);
    q = rotX(q, 0.52);
    return [q[0] * 1.02, q[1] * 1.02 + 0.05, q[2] * 1.02];
  };
  const panel = w.take(0.86);
  for (let i = 0; i < panel; i++) {
    const cell = cells[Math.floor(r() * cells.length)];
    const k = r();
    let x: number, y: number, z: number, br: number;
    if (k < 0.42) {
      // outline of the slab (top + bottom rectangle)
      const e = r() * 4;
      const side = Math.floor(e);
      const u = e - side;
      const top = r() < 0.7;
      y = top ? 0.03 : -0.03;
      if (side === 0) { x = lerp(-W / 2, W / 2, u); z = -D / 2; }
      else if (side === 1) { x = W / 2; z = lerp(-D / 2, D / 2, u); }
      else if (side === 2) { x = lerp(W / 2, -W / 2, u); z = D / 2; }
      else { x = -W / 2; z = lerp(D / 2, -D / 2, u); }
      br = top ? 1.0 : 0.55;
    } else if (k < 0.58) {
      // header bar (brighter)
      x = lerp(-W / 2, W / 2, r());
      z = -D / 2 + 0.06 + r() * 0.05;
      y = 0.03;
      br = 1.25;
    } else if (k < 0.86) {
      // table rows
      const rowI = Math.floor(r() * cell.rowsN);
      x = lerp(-W / 2 + 0.06, W / 2 - (0.06 + 0.25 * ((rowI * 7) % 3) / 3), r());
      z = -D / 2 + 0.17 + (rowI + 0.5) * ((D - 0.22) / cell.rowsN);
      y = 0.03;
      br = 0.6;
    } else {
      // vertical edges (slab thickness)
      const cx = r() < 0.5 ? -W / 2 : W / 2, cz = r() < 0.5 ? -D / 2 : D / 2;
      x = cx; z = cz; y = lerp(-0.03, 0.03, r());
      br = 0.7;
    }
    const p = iso([cell.c[0] + x + gauss(r) * 0.004, cell.c[1] + y + gauss(r) * 0.004, cell.c[2] + z + gauss(r) * 0.004]);
    w.push(p[0], p[1], p[2], br);
  }
  // relations: thin vertical links between some stacked cells
  const links = w.take(0.05);
  for (let i = 0; i < links; i++) {
    const c = Math.floor(r() * cols), row = Math.floor(r() * rows);
    const x = (c - (cols - 1) / 2) * sx + 0.3, z = (row - (rows - 1) / 2) * sz;
    const y = lerp(-sy, sy, r());
    const p = iso([x, y, z]);
    w.push(p[0], p[1], p[2], 0.45);
  }
  fillDust(w, r);
  return w.arr;
}

// ------------------------------------------------------------------------------------------
function voice(n: number, r: Rng) {
  const w = new Writer(n);
  const bars = 132;
  const len: number[] = [];
  for (let k = 0; k < bars; k++) {
    const a = (k / bars) * TAU;
    const env = 0.5 + 0.3 * Math.sin(a * 3 + 0.6) * Math.cos(a * 2 - 0.3) + 0.2 * Math.sin(a * 7);
    len.push(clamp(0.18 + env * 0.55 + r() * 0.2, 0.12, VOICE.cut - VOICE.r0 - 0.08));
  }
  const ring = w.take(0.12);
  for (let i = 0; i < ring; i++) {
    const a = r() * TAU;
    const rad = 1.0 + gauss(r) * 0.012;
    w.push(Math.cos(a) * rad, Math.sin(a) * rad, gauss(r) * 0.02, 1.0);
  }
  const outer = w.take(0.56);
  for (let i = 0; i < outer; i++) {
    const k = Math.floor(r() * bars);
    const a = (k / bars) * TAU;
    const s = r();
    const rad = VOICE.r0 + s * len[k];
    const tw = (r() - 0.5) * 0.026;
    const ca = Math.cos(a), sa = Math.sin(a);
    w.push(ca * rad - sa * tw, sa * rad + ca * tw, gauss(r) * 0.025, 1.05 - s * 0.45);
  }
  const inner = w.take(0.1);
  for (let i = 0; i < inner; i++) {
    const k = Math.floor(r() * bars);
    const a = ((k + 0.5) / bars) * TAU;
    const s = r();
    const rad = VOICE.ri - s * len[k] * 0.4;
    const ca = Math.cos(a), sa = Math.sin(a);
    const tw = (r() - 0.5) * 0.018;
    w.push(ca * rad - sa * tw, sa * rad + ca * tw, gauss(r) * 0.02, 0.7 - s * 0.3);
  }
  const core = w.take(0.05);
  for (let i = 0; i < core; i++) {
    const d = onSphere(r);
    const rad = Math.abs(gauss(r)) * 0.13;
    w.push(d[0] * rad, d[1] * rad, d[2] * rad, 1.0);
  }
  const orbit = w.take(0.08);
  for (let i = 0; i < orbit; i++) {
    const a = r() * TAU;
    const rad = 2.22 + gauss(r) * 0.01;
    const dash = Math.sin(a * 60) > 0.2 ? 0.45 : 0.12;
    w.push(Math.cos(a) * rad, Math.sin(a) * rad, gauss(r) * 0.02, dash);
  }
  fillDust(w, r, 2.6, 6.5, 0.18);
  return w.arr;
}

// ------------------------------------------------------------------------------------------
function cookwhat(n: number, r: Rng) {
  const w = new Writer(n);
  const R = 1.45, cy = 0.05;
  const bowl = w.take(0.44);
  for (let i = 0; i < bowl; i++) {
    const d = onSphere(r);
    if (d[1] > 0) d[1] = -d[1];
    const rad = r() < 0.6 ? R : R - 0.07;
    // fade the very bottom a bit, emphasise toward the rim
    w.push(d[0] * rad, d[1] * rad * 0.82 + cy, d[2] * rad, 0.45 + (1 + d[1]) * 0.5);
  }
  const rim = w.take(0.08);
  for (let i = 0; i < rim; i++) {
    const a = r() * TAU;
    const rad = R - 0.035 + gauss(r) * 0.02;
    w.push(Math.cos(a) * rad, cy + gauss(r) * 0.012, Math.sin(a) * rad, 1.15);
  }
  const foot = w.take(0.03);
  for (let i = 0; i < foot; i++) {
    const a = r() * TAU;
    const rad = 0.55 + gauss(r) * 0.01;
    w.push(Math.cos(a) * rad, cy - R * 0.82 - 0.06 + gauss(r) * 0.01, Math.sin(a) * rad, 0.8);
  }
  // ingredient clusters orbiting above
  type Ing = { c: V3; s: number; kind: number };
  const ings: Ing[] = [];
  const K = 9;
  for (let k = 0; k < K; k++) {
    const a = (k / K) * TAU + r() * 0.3;
    const rad = 0.55 + (k % 3) * 0.38;
    ings.push({ c: [Math.cos(a) * rad, 0.75 + r() * 0.95, Math.sin(a) * rad], s: 0.14 + r() * 0.16, kind: k % 4 });
  }
  const ing = w.take(0.36);
  for (let i = 0; i < ing; i++) {
    const g = ings[Math.floor(r() * K)];
    let p: V3;
    if (g.kind === 0) {
      const d = onSphere(r); p = [d[0] * g.s, d[1] * g.s, d[2] * g.s]; // tomato / pea
    } else if (g.kind === 1) {
      // cube (cheese)
      const f = Math.floor(r() * 6), u = r() * 2 - 1, v = r() * 2 - 1, s = g.s * 0.8;
      const ax = f >> 1, sg = f & 1 ? 1 : -1;
      p = ax === 0 ? [sg * s, u * s, v * s] : ax === 1 ? [u * s, sg * s, v * s] : [u * s, v * s, sg * s];
      p = rotY(rotX(p, 0.6), 0.5);
    } else if (g.kind === 2) {
      // leaf: flat ellipse with a vein
      const a = r() * TAU, rr = Math.sqrt(r());
      p = [Math.cos(a) * rr * g.s * 1.6, Math.sin(a) * rr * g.s * 0.6, 0];
      if (r() < 0.25) p = [lerp(-1.6, 1.6, r()) * g.s, 0, 0];
      p = rotZ(rotX(p, 0.9), 0.5);
    } else {
      // cluster of small peas
      const sub = Math.floor(r() * 5);
      const off: V3 = [Math.cos(sub * 1.3) * g.s * 0.8, Math.sin(sub * 2.1) * g.s * 0.6, Math.sin(sub * 0.7) * g.s * 0.8];
      const d = onSphere(r);
      p = [off[0] + d[0] * g.s * 0.35, off[1] + d[1] * g.s * 0.35, off[2] + d[2] * g.s * 0.35];
    }
    w.push(g.c[0] + p[0], g.c[1] + p[1], g.c[2] + p[2], 0.95);
  }
  // steam wisps rising from the bowl
  const steam = w.take(0.04);
  for (let i = 0; i < steam; i++) {
    const s = r();
    const k = Math.floor(r() * 3);
    const x = (k - 1) * 0.45 + Math.sin(s * 9 + k) * 0.12;
    w.push(x + gauss(r) * 0.02, cy + 0.1 + s * 1.6, Math.cos(s * 7 + k) * 0.1, 0.35 * (1 - s));
  }
  fillDust(w, r);
  // recentre vertically
  for (let i = 0; i < n; i++) w.arr[i * 4 + 1] -= 0.1;
  return w.arr;
}

// ------------------------------------------------------------------------------------------
/** (x² + 9/4 y² + z² − 1)³ − x² z³ − 9/80 y² z³, with z vertical and y depth */
function heartF(x: number, y: number, z: number) {
  const a = x * x + 2.25 * y * y + z * z - 1;
  return a * a * a - x * x * z * z * z - 0.1125 * y * y * z * z * z;
}
function heart(n: number, r: Rng) {
  const w = new Writer(n);
  const S = 1.32;
  const place = (x: number, y: number, z: number, br: number) => {
    // heart space (x, depth y, up z) -> world (x, up, depth); tilt like an anatomical heart
    let p: V3 = [x * S, z * S - 0.25, y * S];
    p = rotZ(p, 0.16);
    w.push(p[0], p[1], p[2], br);
  };
  const surf = w.take(0.74);
  for (let i = 0; i < surf; i++) {
    const d = onSphere(r);
    // march outward then bisect
    let lo = 0, hi = 0;
    for (let s = 0.04; s < 2; s += 0.04) {
      if (heartF(d[0] * s, d[1] * s, d[2] * s) > 0) { hi = s; break; }
      lo = s;
    }
    if (hi === 0) { i--; continue; }
    for (let k = 0; k < 14; k++) {
      const m = (lo + hi) / 2;
      if (heartF(d[0] * m, d[1] * m, d[2] * m) > 0) hi = m; else lo = m;
    }
    const rr = lo + gauss(r) * 0.01;
    place(d[0] * rr, d[1] * rr, d[2] * rr, 0.75 + r() * 0.4);
  }
  const inner = w.take(0.07);
  let made = 0;
  while (made < inner) {
    const x = r() * 2.4 - 1.2, y = r() * 1.6 - 0.8, z = r() * 2.4 - 1.15;
    if (heartF(x, y, z) < 0) { place(x, y, z, 0.3); made++; }
  }
  // great vessels (aorta arch + two branches) as tube surfaces
  const tubes: { p0: V3; p1: V3; p2: V3; rad: number }[] = [
    { p0: [0.1, 0.05, 0.7], p1: [0.12, 0.05, 1.45], p2: [-0.42, 0.08, 1.22], rad: 0.12 },
    { p0: [-0.25, 0.12, 0.75], p1: [-0.32, 0.15, 1.1], p2: [-0.38, 0.2, 1.35], rad: 0.07 },
    { p0: [0.38, -0.05, 0.78], p1: [0.5, -0.05, 1.1], p2: [0.58, -0.1, 1.32], rad: 0.075 },
  ];
  const ves = w.take(0.06);
  for (let i = 0; i < ves; i++) {
    const tb = tubes[i % 3 === 0 ? 0 : r() < 0.5 ? 1 : 2];
    const t = r();
    const q = (k: number) => (1 - t) * (1 - t) * tb.p0[k] + 2 * (1 - t) * t * tb.p1[k] + t * t * tb.p2[k];
    const a = r() * TAU;
    const rr = tb.rad * (1 - t * 0.25);
    place(q(0) + Math.cos(a) * rr, q(1) + Math.sin(a) * rr, q(2) + Math.sin(a + 1.3) * rr * 0.3, 0.55);
  }
  fillDust(w, r);
  return w.arr;
}

// ------------------------------------------------------------------------------------------
function terrainH(x: number, z: number) {
  return 0.1 * Math.sin(x * 1.3) * Math.cos(z * 1.1) + 0.05 * Math.sin(x * 2.7 + z * 1.9);
}
function medcheck(n: number, r: Rng) {
  const w = new Writer(n);
  const X = 2.5, Z = 1.9, sp = 0.3;
  const streets = w.take(0.44);
  for (let i = 0; i < streets; i++) {
    const alongX = r() < 0.5;
    let x: number, z: number, br: number;
    if (alongX) {
      const k = Math.round((r() * 2 - 1) * (Z / sp));
      z = k * sp; x = (r() * 2 - 1) * X; br = k % 4 === 0 ? 0.95 : 0.45;
    } else {
      const k = Math.round((r() * 2 - 1) * (X / sp));
      x = k * sp; z = (r() * 2 - 1) * Z; br = k % 4 === 0 ? 0.95 : 0.45;
    }
    if (r() < 0.12) {
      // diagonal avenue
      const t = r() * 2 - 1; x = t * X; z = t * Z * 0.8 + 0.2; br = 0.9;
    }
    w.push(x + gauss(r) * 0.006, terrainH(x, z), z + gauss(r) * 0.006, br);
  }
  const blocks = w.take(0.12);
  for (let i = 0; i < blocks; i++) {
    const x = (r() * 2 - 1) * X, z = (r() * 2 - 1) * Z;
    w.push(x, terrainH(x, z) + r() * 0.03, z, 0.2);
  }
  const rings = w.take(0.06);
  for (let i = 0; i < rings; i++) {
    const k = Math.floor(r() * 3);
    const a = r() * TAU, rad = 0.3 + k * 0.26 + gauss(r) * 0.008;
    const x = PIN.x + Math.cos(a) * rad, z = PIN.z + Math.sin(a) * rad;
    w.push(x, terrainH(x, z) + 0.01, z, 1.0 - k * 0.2);
  }
  // pin: teardrop (sphere head + cone to tip), with a bright inner dot
  const pin = w.take(0.22);
  const hy = 1.25, hr = 0.36, tipY = 0.32; // tip above the ground so the "pin" mask in the shader is clean
  for (let i = 0; i < pin; i++) {
    const k = r();
    let p: V3, br = 1.0;
    if (k < 0.55) {
      const d = onSphere(r);
      p = [d[0] * hr, hy + d[1] * hr, d[2] * hr];
    } else if (k < 0.9) {
      const t = r();
      const y = lerp(hy - hr * 0.55, tipY, t);
      const rad = hr * 0.83 * Math.pow(1 - t, 1.15);
      const a = r() * TAU;
      p = [Math.cos(a) * rad, y, Math.sin(a) * rad];
    } else {
      const d = onSphere(r);
      p = [d[0] * 0.12, hy + d[1] * 0.12, d[2] * 0.12 + hr * 0.75];
      br = 1.4;
    }
    w.push(PIN.x + p[0], p[1], PIN.z + p[2], br);
  }
  fillDust(w, r);
  for (let i = 0; i < n; i++) w.arr[i * 4 + 1] -= 0.45;
  return w.arr;
}

// ------------------------------------------------------------------------------------------
function skills(n: number, r: Rng) {
  const w = new Writer(n);
  const core = w.take(0.1);
  for (let i = 0; i < core; i++) {
    const d = onSphere(r);
    const rad = Math.abs(gauss(r)) * 0.17;
    w.push(d[0] * rad, d[1] * rad, d[2] * rad, 1.1);
  }
  const rings = [
    { R: 0.75, tx: 1.25, tz: 0.15 },
    { R: 1.2, tx: 1.05, tz: -0.45 },
    { R: 1.68, tx: 1.4, tz: 0.4 },
    { R: 2.15, tx: 1.2, tz: -0.12 },
  ];
  for (let k = 0; k < rings.length; k++) {
    const g = rings[k];
    const cnt = w.take(0.19);
    const nodes = [r() * TAU, r() * TAU, r() * TAU];
    for (let i = 0; i < cnt; i++) {
      let p: V3, br = 0.65 + r() * 0.3;
      if (r() < 0.14) {
        const a = nodes[Math.floor(r() * 3)];
        const d = onSphere(r);
        const s = 0.07;
        p = [Math.cos(a) * g.R + d[0] * s, d[1] * s, Math.sin(a) * g.R + d[2] * s];
        br = 1.3;
      } else {
        const a = r() * TAU;
        const rad = g.R + gauss(r) * 0.035;
        p = [Math.cos(a) * rad, gauss(r) * 0.012, Math.sin(a) * rad];
      }
      p = rotZ(rotX(p, g.tx - Math.PI / 2 + 0.0), g.tz);
      w.push(p[0], p[1], p[2], br);
    }
  }
  fillDust(w, r);
  return w.arr;
}

// ------------------------------------------------------------------------------------------
function contact(n: number, r: Rng) {
  const w = new Writer(n);
  const arms = 6;
  const cnt = w.take(0.86);
  for (let i = 0; i < cnt; i++) {
    const s = Math.pow(r(), 0.85);
    const arm = Math.floor(r() * arms);
    const rad = VORTEX.r0 + VORTEX.r * Math.pow(1 - s, VORTEX.pow) + gauss(r) * 0.03 * (1 - s * 0.6);
    const a = (arm / arms) * TAU + s * VORTEX.twist + gauss(r) * 0.16 * (1 - s * 0.5);
    w.push(Math.cos(a) * rad, Math.sin(a) * rad, -s * VORTEX.depth + gauss(r) * 0.04, 0.55 + s * 0.6);
  }
  fillDust(w, r, 2.9, 6.5);
  return w.arr;
}

// ------------------------------------------------------------------------------------------
export const generators: Record<Exclude<FormName, 'about' | 'hero'>, (n: number, r: Rng) => Float32Array> = {
  experience, voice, cookwhat, heart, medcheck, skills, contact,
};

/** deterministic per-form seed (shared by the main thread and the worker) */
export const formSeed = (name: FormName | 'seed') => 0x9e3779b1 ^ ((FORMS.indexOf(name as FormName) + 7) * 2654435761);
export const PERM_SEED = 0x5167a1;

/** Fisher–Yates permutation shared by every form */
export function makePermutation(n: number, r: Rng) {
  const p = new Uint32Array(n);
  for (let i = 0; i < n; i++) p[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  return p;
}
export function shuffleWith(src: Float32Array, perm: Uint32Array) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < perm.length; i++) {
    const s = perm[i] * 4, d = i * 4;
    out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3];
  }
  return out;
}

/*
 * "ONE SIGNAL" — the persistent particle world behind the whole site.
 *
 * One THREE.Points cloud, two vec4 position buffers (from / to) and a uniform morph progress with a
 * per-particle delay, so changes of form ripple through the field instead of snapping. Per-form look
 * (palette, noise, size, behaviours like waveform / heartbeat / vortex) is a set of numbers that are
 * damped toward the active form every frame, so nothing pops.
 *
 * DOM contract (CONTRACT.md §4.1):
 *   [data-gl="<form>"] [data-gl-side="left|right|center"]  — active = element containing the viewport centre, deepest wins
 *   window 'gl:form'   {form, side?} | null                 — force / release a form
 *   window 'gl:pulse'  {strength?}                          — shockwave
 *   window 'gl:accent' {color} | null                       — tint
 *   emits  'gl:formchange' {form}
 *   html.has-gl / html.no-gl
 */
import * as THREE from 'three';
import gsap from 'gsap';
import {
  FORMS, isForm, type FormName, type Graph, generators, heroGraph, seed, bust, mulberry32, makePermutation, shuffleWith, onSphere, formSeed, PERM_SEED,
} from './forms';
import { loadPortrait } from './portrait';
import { vertexShader, fragmentShader } from './shaders';
import type { Post } from './post';

type Side = 'left' | 'right' | 'center';

interface Style {
  colA: string; colB: string; colC: string;
  noise: number; noiseSpeed: number; size: number; alpha: number;
  spin: number; tiltX: number; facing: number; sway: number; scale: number;
  breath: number; wave: number; beat: number; orbit: number; terrain: number; vortex: number; graph: number;
}
const base: Omit<Style, 'colA' | 'colB' | 'colC'> = {
  noise: 0.02, noiseSpeed: 0.2, size: 1, alpha: 0.85, spin: 0, tiltX: 0, facing: 0, sway: 0.08, scale: 1,
  breath: 0, wave: 0, beat: 0, orbit: 0, terrain: 0, vortex: 0, graph: 0,
};
const LIME = '#d7ff3a', WHITE = '#f2f0ea', VIOLET = '#8b7bff';
const STYLES: Record<FormName | 'seed', Style> = {
  seed: { ...base, colA: LIME, colB: WHITE, colC: VIOLET, noise: 0.05 },
  // algorithmic core: CPU + PCB traces, crisp (very low noise); lime is reserved for the traversal front / packets
  hero: { ...base, colA: '#efe9dc', colB: '#c4bcff', colC: LIME, noise: 0.004, noiseSpeed: 0.15, facing: 1, sway: 0.3, tiltX: 0.52, alpha: 0.95, size: 0.9, scale: 0.88, graph: 1 },
  about: { ...base, colA: WHITE, colB: '#eadcc4', colC: LIME, noise: 0.008, noiseSpeed: 0.15, size: 0.8, alpha: 0.78, facing: 1 },
  experience: { ...base, colA: LIME, colB: WHITE, colC: VIOLET, noise: 0.01, size: 0.85, alpha: 0.85, facing: 1 },
  voice: { ...base, colA: '#7cf7ff', colB: WHITE, colC: VIOLET, noise: 0.012, size: 0.95, facing: 1, wave: 1 },
  cookwhat: { ...base, colA: '#ffb547', colB: '#fff0d6', colC: LIME, noise: 0.018, spin: 0.12, tiltX: 0.42, orbit: 1 },
  heart: { ...base, colA: '#ff4d6d', colB: '#ff9aae', colC: VIOLET, noise: 0.014, facing: 1, sway: 0.55, tiltX: 0.05, beat: 1 },
  medcheck: { ...base, colA: VIOLET, colB: '#d9dcff', colC: LIME, noise: 0.012, spin: 0.07, tiltX: 0.62, terrain: 1 },
  skills: { ...base, colA: LIME, colB: WHITE, colC: VIOLET, noise: 0.018, spin: 0.09, tiltX: 0.22 },
  contact: { ...base, colA: LIME, colB: VIOLET, colC: WHITE, noise: 0.015, facing: 1, vortex: 1 },
};
const NUM_KEYS = Object.keys(base) as (keyof typeof base)[];

const CAM_Z = 7;
const FOV = 40;

let started = false;

/** 2-cell glyph atlas ("0" | "1") sampled in the fragment shader via gl_PointCoord */
function makeGlyphAtlas() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  const draw = () => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 128, 64);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "500 50px 'JetBrains Mono', ui-monospace, monospace";
    ctx.fillText('0', 32, 35);
    ctx.fillText('1', 96, 35);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw).catch(() => {});
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function initGL(canvasArg: HTMLCanvasElement | null) {
  if (started || typeof window === 'undefined') return;
  started = true;
  const root = document.documentElement;

  let canvas = canvasArg;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'gl';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);
  }
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: 'var(--z-gl, 0)',
    pointerEvents: 'none', display: 'block',
  } as Partial<CSSStyleDeclaration>);

  let renderer: THREE.WebGLRenderer;
  try {
    if (!webglAvailable()) throw new Error('WebGL unavailable');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
  } catch (err) {
    console.warn('[gl] disabled:', err);
    root.classList.add('no-gl');
    root.classList.remove('has-gl');
    canvas.style.display = 'none';
    return;
  }
  try {
    run(canvas, renderer);
    root.classList.add('has-gl');
  } catch (err) {
    console.error('[gl] failed:', err);
    root.classList.add('no-gl');
    canvas.style.display = 'none';
    try { renderer.dispose(); } catch { /* noop */ }
  }
}

function run(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer) {
  const mqMobile = window.matchMedia('(max-width: 767px)');
  const mqCoarse = window.matchMedia('(pointer: coarse)');
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = mqReduce.matches;
  mqReduce.addEventListener?.('change', (e) => { reduced = e.matches; });

  const cores = navigator.hardwareConcurrency || 4;
  const mobileDevice = mqMobile.matches || mqCoarse.matches;
  const lowEnd = mobileDevice || cores <= 4;
  const COUNT = mobileDevice ? 16000 : lowEnd ? 32000 : 72000;
  let dprCap = mobileDevice ? 1.5 : 1.75;
  // Post (bloom + CA/vignette/grain) is opt-in: it measured ~60→24fps at 1080p on a GTX 1650-class GPU
  // because the whole particle pass moves to an offscreen target. Enable with ?glpost=1 or <html data-gl-post>.
  // Desktop only; the adaptive monitor still turns it off if frames get slow.
  const postFlag = /[?&]glpost=1\b/.test(location.search) || document.documentElement.hasAttribute('data-gl-post');
  let usePost = postFlag && !mobileDevice && cores >= 6;

  // ---------------------------------------------------------------- scene
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 60);
  camera.position.set(0, 0, CAM_Z);
  renderer.setClearColor(0x050507, 1);

  const group = new THREE.Group();
  scene.add(group);

  // ---------------------------------------------------------------- forms
  const rng = mulberry32(PERM_SEED);
  const perm = makePermutation(COUNT, rng);
  const formCache = new Map<FormName | 'seed', Float32Array>();
  const genTimes: Record<string, number> = {};
  const PINS = mobileDevice ? 7 : lowEnd ? 9 : 11; // pins per chip side (= traces per side)
  const GLYPH_FRAC = mobileDevice ? 0.01 : 0.015;
  let graph: Graph | null = null;
  const graphAttrArr = new Float32Array(COUNT * 4).fill(-1);
  const permuteTyped = <T extends Int16Array | Float32Array | Uint8Array>(src: T): T => {
    const out = new (src.constructor as { new (n: number): T })(src.length);
    for (let i = 0; i < COUNT; i++) out[i] = src[perm[i]];
    return out;
  };
  const genForm = (name: FormName | 'seed'): Float32Array => {
    let arr = formCache.get(name);
    if (arr) return arr;
    const r = mulberry32(formSeed(name));
    const t0 = performance.now();
    let raw: Float32Array;
    if (name === 'seed') raw = seed(COUNT, r);
    else if (name === 'hero') {
      const res = heroGraph(COUNT, r, PINS, GLYPH_FRAC);
      raw = res.pos;
      const g = res.graph;
      graph = { ...g, pA: permuteTyped(g.pA), pB: permuteTyped(g.pB), pT: permuteTyped(g.pT), glyph: permuteTyped(g.glyph), phase: permuteTyped(g.phase) };
    }
    else if (name === 'about') raw = bust(COUNT, r); // replaced once the portrait loads
    else raw = generators[name](COUNT, r);
    arr = shuffleWith(raw, perm);
    formCache.set(name, arr);
    genTimes[name] = Math.round(performance.now() - t0);
    return arr;
  };

  // ---------------------------------------------------------------- geometry
  const dirs = new Float32Array(COUNT * 3);
  const rand = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    const d = onSphere(rng);
    dirs[i * 3] = d[0]; dirs[i * 3 + 1] = d[1]; dirs[i * 3 + 2] = d[2];
    rand[i * 4] = rng(); rand[i * 4 + 1] = rng(); rand[i * 4 + 2] = rng(); rand[i * 4 + 3] = rng();
  }
  const fromArr = new Float32Array(genForm('seed'));
  const toArr = new Float32Array(fromArr);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(dirs, 3));
  const fromAttr = new THREE.BufferAttribute(fromArr, 4).setUsage(THREE.DynamicDrawUsage);
  const toAttr = new THREE.BufferAttribute(toArr, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aFrom', fromAttr);
  geo.setAttribute('aTo', toAttr);
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  const graphAttr = new THREE.BufferAttribute(graphAttrArr, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aGraph', graphAttr);

  /** Dijkstra (path length) from `root`; writes normalised distance + traversal-direction edge position per particle */
  const runBFS = (root: number) => {
    const g = graph;
    if (!g) return;
    const N = g.nodes.length;
    const hop = new Float64Array(N).fill(Infinity);
    const done = new Uint8Array(N);
    hop[root] = 0;
    for (let it = 0; it < N; it++) {
      let a = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && hop[i] < best) { best = hop[i]; a = i; }
      if (a < 0) break;
      done[a] = 1;
      const pa = g.nodes[a];
      for (const b of g.adj[a]) {
        const pb = g.nodes[b];
        const d = best + Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
        if (d < hop[b]) hop[b] = d;
      }
    }
    let maxHop = 1e-3;
    for (let i = 0; i < N; i++) if (Number.isFinite(hop[i])) maxHop = Math.max(maxHop, hop[i]);
    for (let i = 0; i < N; i++) if (!Number.isFinite(hop[i])) hop[i] = maxHop;
    for (let i = 0; i < COUNT; i++) {
      const o = i * 4, a = g.pA[i];
      if (a < 0) { graphAttrArr[o] = -1; graphAttrArr[o + 1] = -1; graphAttrArr[o + 2] = 0; graphAttrArr[o + 3] = 0; continue; }
      const b = g.pB[i], t = g.pT[i];
      const hA = hop[a], hB = hop[b];
      graphAttrArr[o] = (hA + (hB - hA) * t) / maxHop;
      graphAttrArr[o + 1] = a === b ? -1 : hA <= hB ? t : 1 - t;
      graphAttrArr[o + 2] = g.glyph[i];
      graphAttrArr[o + 3] = Math.max(0, g.phase[i]);
    }
    graphAttr.needsUpdate = true;
  };
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

  genForm('hero');
  if (graph) runBFS(0); // first traversal floods out of the chip (also drives the intro "routing")

  const col = (h: string) => new THREE.Color(h);
  const U = {
    uTime: { value: 0 },
    uMorph: { value: 1 },
    uSpread: { value: 0.45 },
    uArc: { value: 0.35 },
    uExplode: { value: 0 },
    uNoise: { value: 0.05 },
    uNoiseSpeed: { value: 0.2 },
    uSize: { value: 0.0135 * Math.sqrt(72000 / COUNT) },
    uPixelRatio: { value: 1 },
    uViewportH: { value: window.innerHeight },
    uAlpha: { value: 0.85 },
    uOpacity: { value: 1 },
    uBreath: { value: 0 }, uWave: { value: 0 }, uBeat: { value: 0 },
    uOrbit: { value: 0 }, uTerrain: { value: 0 }, uVortex: { value: 0 },
    uMouse: { value: new THREE.Vector3(99, 99, 0) },
    uMouseStrength: { value: 0 },
    uPulseCenter: { value: new THREE.Vector3() },
    uPulseRadius: { value: 0 },
    uPulseStrength: { value: 0 },
    uScrollVel: { value: 0 },
    uColA: { value: col(LIME) }, uColB: { value: col(WHITE) }, uColC: { value: col(VIOLET) },
    uAccent: { value: col(LIME) }, uAccentMix: { value: 0 },
    uGraph: { value: 0 },
    uWaveT: { value: -1 },
    uBuild: { value: 0 },
    uSignal: { value: col(LIME) },
    uViolet: { value: col(VIOLET) },
    uGlyphs: { value: makeGlyphAtlas() },
  };
  const baseSize0 = U.uSize.value;
  let baseSize = baseSize0;
  let drawFrac = 1;
  const material = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  group.add(points);

  // ---------------------------------------------------------------- style state (damped)
  const cur: Record<string, number> = {};
  for (const key of NUM_KEYS) cur[key] = STYLES.seed[key];
  const curCol = { a: col(LIME), b: col(WHITE), c: col(VIOLET) };
  let targetStyle: Style = STYLES.seed;
  const tgtCol = { a: col(LIME), b: col(WHITE), c: col(VIOLET) };
  const setTargetStyle = (name: FormName | 'seed') => {
    targetStyle = STYLES[name];
    tgtCol.a.set(targetStyle.colA); tgtCol.b.set(targetStyle.colB); tgtCol.c.set(targetStyle.colC);
  };

  // ---------------------------------------------------------------- morphing
  const morph = U.uMorph;
  let morphTween: gsap.core.Tween | null = null;
  const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

  /** bake the currently visible interpolated positions into `from` (exactly mirrors the shader) */
  const bake = () => {
    const m = morph.value;
    if (m >= 1) { fromArr.set(toArr); return; }
    const spread = U.uSpread.value, arc = U.uArc.value, build = U.uBuild.value;
    for (let i = 0; i < COUNT; i++) {
      const o = i * 4;
      let delay = rand[o];
      if (build > 0) {
        const gx = graphAttrArr[o], gy = graphAttrArr[o + 1], gz = graphAttrArr[o + 2];
        const bd = gx < 0 ? rand[o] : gz > 0.5 ? 0.85 + rand[o] * 0.15 : gy < 0 && gx < 0.05 ? rand[o] * 0.22 : 0.28 + 0.6 * gx;
        delay += (bd - delay) * build;
      }
      let p = (m - delay * spread) / (1 - spread);
      p = p <= 0 ? 0 : p >= 1 ? 1 : ease(p);
      const a = Math.sin(p * Math.PI) * arc * (0.5 + rand[o + 1]);
      const d = i * 3;
      fromArr[o] += (toArr[o] - fromArr[o]) * p + dirs[d] * a;
      fromArr[o + 1] += (toArr[o + 1] - fromArr[o + 1]) * p + dirs[d + 1] * a;
      fromArr[o + 2] += (toArr[o + 2] - fromArr[o + 2]) * p + dirs[d + 2] * a;
      fromArr[o + 3] += (toArr[o + 3] - fromArr[o + 3]) * p;
    }
  };

  let shown: FormName | 'seed' = 'seed';
  const morphTo = (name: FormName | 'seed', opts: { duration?: number; spread?: number; arc?: number; build?: number } = {}) => {
    const fast = reduced;
    const duration = fast ? 0.5 : opts.duration ?? 1.7;
    bake();
    U.uBuild.value = opts.build ?? 0;
    toArr.set(genForm(name));
    fromAttr.needsUpdate = true;
    toAttr.needsUpdate = true;
    U.uSpread.value = fast ? 0 : opts.spread ?? 0.45;
    U.uArc.value = fast ? 0 : opts.arc ?? 0.38;
    morph.value = 0;
    morphTween?.kill();
    morphTween = gsap.to(morph, { value: 1, duration, ease: 'none', overwrite: true });
    shown = name;
    setTargetStyle(name);
  };

  // ---------------------------------------------------------------- portrait (async)
  const portraitUrl = '/img/hamed.png'; // site is deployed at the root (CONTRACT §2)
  const loadAbout = () => {
    loadPortrait(portraitUrl, COUNT, mulberry32(0xab07))
      .then((raw) => {
        formCache.set('about', shuffleWith(raw, perm));
        if (shown === 'about') morphTo('about', { duration: 1.4, spread: 0.5, arc: 0.2 });
      })
      .catch((e) => console.warn('[gl] portrait failed, using fallback', e));
  };

  // Pre-generate the other forms in a worker so the intro never hitches; anything still missing when
  // it's needed is generated synchronously by genForm (fallback when workers are unavailable).
  const idle = (cb: () => void) =>
    ('requestIdleCallback' in window ? (window as Window).requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 60));
  const workerForms = FORMS.filter((f) => f !== 'hero' && f !== 'about');
  try {
    const worker = new Worker(new URL('./forms.worker.ts', import.meta.url), { type: 'module' });
    let received = 0;
    worker.onmessage = (e: MessageEvent<{ name: FormName; arr: Float32Array }>) => {
      if (!formCache.has(e.data.name)) formCache.set(e.data.name, e.data.arr);
      if (++received >= workerForms.length) worker.terminate();
    };
    worker.onerror = () => worker.terminate();
    worker.postMessage({ count: COUNT, names: workerForms });
  } catch {
    // no module workers: generate lazily on demand
  }
  let portraitRequested = false;
  const requestPortrait = () => {
    if (portraitRequested) return;
    portraitRequested = true;
    idle(loadAbout);
  };

  // ---------------------------------------------------------------- DOM: active form detection
  let glEls: HTMLElement[] = [];
  const requery = () => { glEls = Array.from(document.querySelectorAll<HTMLElement>('[data-gl]')); };
  requery();
  let moTimer = 0;
  const mo = new MutationObserver(() => {
    if (moTimer) return;
    moTimer = window.setTimeout(() => { moTimer = 0; requery(); }, 200);
  });
  mo.observe(document.body, { childList: true, subtree: true });
  window.setInterval(requery, 1000);

  let override: { form: FormName; side: Side | null } | null = null;
  const parseSide = (v: unknown): Side | null => (v === 'left' || v === 'right' || v === 'center' ? v : null);

  // Hero framing: fit the circuit into the gap between the two giant name words (Hero.astro's
  // [data-hero-word="a"|"b"]), centred vertically in it. Falls back to default framing if absent.
  const HERO_UNIT_H = 4.45; // world height of the hero form at group scale 1 (tilted board incl. traces)
  let heroGap: { cy: number; h: number } | null = null;
  const measureHeroGap = () => {
    const a = document.querySelector<HTMLElement>('[data-hero-word="a"]');
    const b = document.querySelector<HTMLElement>('[data-hero-word="b"]');
    if (!a || !b) { heroGap = null; return; }
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const h = rb.top - ra.bottom;
    heroGap = h > 80 ? { cy: (ra.bottom + rb.top) / 2, h } : null;
  };

  let detectedForm: FormName = 'hero';
  let detectedSide: Side = 'center';
  const detect = () => {
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    let best: HTMLElement | null = null;
    for (const el of glEls) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) continue;
      if (!best || best.contains(el)) best = el;
    }
    if (best) {
      const f = best.dataset.gl;
      if (isForm(f)) {
        detectedForm = f;
        detectedSide = parseSide(best.dataset.glSide) ?? 'center';
      }
    } else if (window.scrollY < window.innerHeight * 0.5) {
      detectedForm = 'hero';
      detectedSide = 'center';
    }
  };

  let introStarted = false;
  let wantForm: FormName = 'hero';
  let wantSince = 0;
  let side: Side = 'center';
  const desired = () => (override ? override.form : detectedForm);

  const commit = (now: number) => {
    const f = desired();
    side = override ? override.side ?? 'center' : detectedSide;
    if (f !== wantForm) { wantForm = f; wantSince = now; }
    if (!introStarted) return;
    // short debounce so fast scrolling through a section doesn't thrash
    if (wantForm === 'about') requestPortrait();
    if (wantForm !== shown && (override || now - wantSince > 0.12)) {
      morphTo(wantForm);
      window.dispatchEvent(new CustomEvent('gl:formchange', { detail: { form: wantForm } }));
    }
  };

  // ---------------------------------------------------------------- events
  window.addEventListener('gl:form', ((e: CustomEvent) => {
    const d = e.detail as { form?: string; side?: string } | null;
    if (d && isForm(d.form)) override = { form: d.form, side: parseSide(d.side) };
    else override = null;
  }) as EventListener);

  const pulse = { radius: 0, strength: 0 };
  const firePulse = (strength = 1) => {
    if (reduced) return;
    group.getWorldPosition(U.uPulseCenter.value);
    pulse.radius = 0.1;
    pulse.strength = Math.min(2, Math.max(0.1, strength));
    gsap.killTweensOf(pulse);
    gsap.to(pulse, { radius: 7, duration: 1.6, ease: 'power2.out' });
    gsap.to(pulse, { strength: 0, duration: 1.6, ease: 'power2.in' });
  };
  window.addEventListener('gl:pulse', ((e: CustomEvent) => {
    const s = Number((e.detail as { strength?: number } | null)?.strength ?? 1);
    firePulse(Number.isFinite(s) ? s : 1);
  }) as EventListener);

  window.addEventListener('gl:accent', ((e: CustomEvent) => {
    const c = (e.detail as { color?: string | null } | null)?.color;
    if (c) {
      try { U.uAccent.value.set(c); } catch { /* bad colour */ }
      gsap.to(U.uAccentMix, { value: 1, duration: 0.8, ease: 'power2.out', overwrite: true });
    } else {
      gsap.to(U.uAccentMix, { value: 0, duration: 0.8, ease: 'power2.out', overwrite: true });
    }
  }) as EventListener);

  // pointer (content sits above the canvas, so listen on window)
  const mouseNdc = new THREE.Vector2(0, 0);
  const mouseSm = new THREE.Vector2(0, 0);
  let pointerActive = false;
  let lastMove = 0;
  const setPointer = (x: number, y: number) => {
    mouseNdc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    pointerActive = true;
    lastMove = performance.now();
  };
  // touch: pointermove gets cancelled as soon as the page scrolls, so track touches directly
  const onTouch = (e: TouchEvent) => { const t = e.touches[0]; if (t) setPointer(t.clientX, t.clientY); };
  window.addEventListener('touchstart', onTouch, { passive: true });
  window.addEventListener('touchmove', onTouch, { passive: true });
  const release = () => { pointerActive = false; };
  window.addEventListener('touchend', release, { passive: true });
  window.addEventListener('touchcancel', release, { passive: true });
  window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') release(); }, { passive: true });
  window.addEventListener('pointercancel', release, { passive: true });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') setPointer(e.clientX, e.clientY);
  }, { passive: true });
  document.addEventListener('pointerleave', release);
  window.addEventListener('blur', () => { pointerActive = false; });

  // ---------------------------------------------------------------- intro
  const startIntro = () => {
    if (introStarted) return;
    introStarted = true;
    detect();
    const f = desired();
    // portrait sampling is ~40ms of main-thread work: keep it out of the intro unless it's needed now
    if (f === 'about') requestPortrait();
    else window.setTimeout(requestPortrait, reduced ? 200 : 3400);
    wantForm = f;
    if (reduced) {
      morphTo(f, { duration: 0.6 });
    } else {
      if (f === 'hero') genForm('hero');
      morphTo(f, { duration: f === 'hero' ? 3.2 : 2.8, spread: f === 'hero' ? 0.7 : 0.6, arc: f === 'hero' ? 0.15 : 0.9, build: f === 'hero' ? 1 : 0 });
      const peak = f === 'hero' ? 0.0 : 1; // the hero "builds" (chip, then routed traces) rather than exploding
      gsap.timeline()
        .to(U.uExplode, { value: peak, duration: 0.75, ease: 'expo.out' })
        .to(U.uExplode, { value: 0, duration: 1.8, ease: 'power3.inOut' });
      gsap.delayedCall(0.05, () => firePulse(1.2));
    }
    window.dispatchEvent(new CustomEvent('gl:formchange', { detail: { form: f } }));
  };
  if (document.documentElement.classList.contains('is-ready')) {
    // let the first frame render the collapsed state, then go
    requestAnimationFrame(() => startIntro());
  } else {
    window.addEventListener('app:ready', () => startIntro(), { once: true });
    window.setTimeout(startIntro, 8000); // safety net if the preloader never reports
  }

  // ---------------------------------------------------------------- post (lazy, desktop only)
  let post: Post | null = null;
  const loadPost = () => {
    if (!usePost || post) return;
    import('./post')
      .then(({ createPost }) => {
        if (!usePost) return;
        post = createPost(renderer, scene, camera);
        post.setSize(window.innerWidth, window.innerHeight, currentDpr);
      })
      .catch((e) => { console.warn('[gl] post disabled', e); usePost = false; });
  };

  // ---------------------------------------------------------------- resize
  let currentDpr = 1;
  let isNarrow = mqMobile.matches;
  // Mobile URL bars change innerHeight while scrolling. Use the large viewport height for the canvas and
  // ignore height-only changes smaller than 150px so the drawing buffer is not reallocated mid-scroll.
  if (mobileDevice && window.CSS?.supports?.('height', '100lvh')) canvas.style.height = '100lvh';
  let lastW = 0, lastH = 0;
  const resize = (force = false) => {
    const w = window.innerWidth;
    let h = window.innerHeight;
    if (!force && mobileDevice && lastW === w && Math.abs(h - lastH) < 150) return;
    if (mobileDevice && lastW === w) h = Math.max(h, lastH);
    lastW = w; lastH = h;
    currentDpr = Math.min(window.devicePixelRatio || 1, dprCap);
    isNarrow = w < 768;
    renderer.setPixelRatio(currentDpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    U.uPixelRatio.value = currentDpr;
    U.uViewportH.value = h;
    post?.setSize(w, h, currentDpr);
  };
  resize(true);
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => resize());
  });
  loadPost();

  // ---------------------------------------------------------------- loop
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const lenisHolder = window as unknown as { __lenis?: { velocity?: number; scroll?: number } };

  const WAVE_PERIOD = 4.2;
  let waveCycle = 0;
  let lastRoot = -1;
  const tmpV = new THREE.Vector3();
  const pickRoot = () => {
    const g = graph;
    if (!g) return;
    const N = g.nodes.length;
    // mostly the chip (packets shoot out of the processor), sometimes a via pad (wave flows back in)
    let root = Math.random() < 0.6 ? 0 : g.vias[Math.floor(Math.random() * g.vias.length)];
    if (pointerActive) {
      points.updateMatrixWorld();
      let bd = 0.45; // only when the cursor is actually near the circuit
      for (let i = 0; i < N; i++) {
        const nd = g.nodes[i];
        tmpV.set(nd[0], nd[1], nd[2]).applyMatrix4(points.matrixWorld);
        const d = Math.hypot(tmpV.x - U.uMouse.value.x, tmpV.y - U.uMouse.value.y);
        if (d < bd && i !== lastRoot) { bd = d; root = i; }
      }
    }
    if (root === lastRoot && root !== 0) root = 0;
    lastRoot = root;
    runBFS(root);
  };

  let time = 0;
  let last = performance.now();
  let lastDetect = 0;
  let lastScrollY = window.scrollY;
  let scrollVel = 0;
  let spinAngle = 0;
  let groupX = 0;
  let groupScale = 1;
  let groupY = 0;
  let opacity = 1;
  let dolly = 0;
  // perf monitor
  let perfAcc = 0, perfFrames = 0, perfStep = 0, slowWindows = 0;
  const perfStart = performance.now();

  const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));

  const frame = () => {
    const now = performance.now();
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = Math.min(rawDt, 1 / 20);
    time += dt * (reduced ? 0.25 : 1);
    U.uTime.value = time;

    if (now - lastDetect > 100) {
      lastDetect = now;
      detect();
      if (cur.graph > 0.01) measureHeroGap();
    }
    commit(now / 1000);

    // ---- style damping
    const k = 1 - Math.exp(-2.4 * dt);
    for (const key of NUM_KEYS) cur[key] += (targetStyle[key] - cur[key]) * k;
    curCol.a.lerp(tgtCol.a, k); curCol.b.lerp(tgtCol.b, k); curCol.c.lerp(tgtCol.c, k);
    U.uColA.value.copy(curCol.a); U.uColB.value.copy(curCol.b); U.uColC.value.copy(curCol.c);
    const motion = reduced ? 0.25 : 1;
    U.uNoise.value = cur.noise * (reduced ? 0.5 : 1);
    U.uNoiseSpeed.value = cur.noiseSpeed;
    U.uSize.value = baseSize * cur.size * Math.sqrt(Math.max(0.3, groupScale)); // keep density constant when the form shrinks
    U.uAlpha.value = cur.alpha;
    U.uBreath.value = cur.breath * motion;
    U.uWave.value = cur.wave * (reduced ? 0.3 : 1);
    U.uBeat.value = cur.beat * (reduced ? 0.3 : 1);
    U.uOrbit.value = cur.orbit;
    U.uTerrain.value = cur.terrain;
    U.uVortex.value = cur.vortex;
    U.uGraph.value = cur.graph;

    // ---- BFS traversal wave: a new root every cycle (near the cursor when hovering)
    const wt = time / WAVE_PERIOD;
    const cyc = Math.floor(wt);
    if (cyc !== waveCycle) {
      waveCycle = cyc;
      if (cur.graph > 0.01) pickRoot();
    }
    U.uWaveT.value = (wt - cyc) * 1.25 - 0.05;

    // ---- scroll velocity
    const sy = window.scrollY;
    let v = lenisHolder.__lenis?.velocity;
    if (typeof v !== 'number' || !Number.isFinite(v)) v = rawDt > 0 ? (sy - lastScrollY) / (rawDt * 60) : 0;
    lastScrollY = sy;
    const vTarget = reduced ? 0 : Math.max(-1.5, Math.min(1.5, v / 35));
    scrollVel = damp(scrollVel, vTarget, 6, dt);
    U.uScrollVel.value = scrollVel;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, sy / maxScroll));

    // ---- pointer
    if (now - lastMove > (mobileDevice ? 1200 : 2500)) pointerActive = false;
    mouseSm.x = damp(mouseSm.x, mouseNdc.x, 5, dt);
    mouseSm.y = damp(mouseSm.y, mouseNdc.y, 5, dt);
    U.uMouseStrength.value = damp(U.uMouseStrength.value, pointerActive && !reduced ? 1 : 0, 3, dt);

    // ---- placement
    const visH = 2 * Math.tan((FOV * Math.PI) / 360) * CAM_Z;
    const visW = visH * camera.aspect;
    const sideSign = isNarrow ? 0 : side === 'left' ? -1 : side === 'right' ? 1 : 0;
    const tx = sideSign * 0.26 * visW;
    groupX = damp(groupX, tx, 2.6, dt);
    const fit = Math.min(1, (visW * 0.5) / 2.6); // keep forms inside narrow/portrait viewports
    let sScale = (isNarrow ? Math.min(0.78, Math.max(0.5, fit * 1.12)) : (sideSign !== 0 ? 0.86 : 1) * Math.max(0.55, fit)) * cur.scale;
    let ty = 0;
    if (!isNarrow && heroGap && cur.graph > 0.001) {
      const pxToWorld = visH / window.innerHeight;
      // allow ~30% overflow so traces tuck behind the letters, but never below a readable size
      const heroScale = Math.min(sScale, Math.max(0.5, (heroGap.h * 1.3 * pxToWorld) / HERO_UNIT_H));
      sScale += (heroScale - sScale) * cur.graph;
      ty = (window.innerHeight / 2 - heroGap.cy) * pxToWorld * cur.graph;
    }
    groupY = damp(groupY, ty, 2.6, dt);
    group.position.y = groupY;
    groupScale = damp(groupScale, sScale, 2.6, dt);
    opacity = damp(opacity, isNarrow ? 0.55 : 1, 2, dt);
    U.uOpacity.value = opacity;
    group.position.x = groupX;
    group.scale.setScalar(groupScale);

    // ---- rotation: spin for spinning forms; facing forms settle on the nearest full turn
    spinAngle += cur.spin * dt * motion;
    if (cur.facing > 0.5) {
      const nearest = Math.round(spinAngle / (Math.PI * 2)) * Math.PI * 2;
      spinAngle = damp(spinAngle, nearest, 1.6 * cur.facing, dt);
    }
    const sway = Math.sin(time * 0.35) * cur.sway * cur.facing;
    group.rotation.y = spinAngle + sway + mouseSm.x * 0.22 * motion;
    group.rotation.x = cur.tiltX - mouseSm.y * 0.14 * motion;

    // ---- camera: parallax + scroll-linked dolly
    dolly = damp(dolly, reduced ? 0 : Math.sin(progress * Math.PI * 3) * 0.35, 2, dt);
    camera.position.x = damp(camera.position.x, mouseSm.x * 0.3 * motion, 3, dt);
    camera.position.y = damp(camera.position.y, mouseSm.y * 0.2 * motion, 3, dt);
    camera.position.z = CAM_Z + dolly;
    camera.lookAt(group.position.x * 0.15, 0, 0);

    // ---- mouse in world (z=0 plane)
    raycaster.setFromCamera(mouseSm, camera);
    if (raycaster.ray.intersectPlane(plane, hit)) U.uMouse.value.copy(hit);

    // ---- pulse
    U.uPulseRadius.value = pulse.radius;
    U.uPulseStrength.value = pulse.strength;

    if (post && usePost) post.render(time);
    else renderer.render(scene, camera);

    // ---- adaptive quality (after the intro settles)
    if (now - perfStart > 4000 && rawDt < 0.5) {
      perfAcc += rawDt; perfFrames++;
      if (perfAcc > 2) {
        const avgMs = (perfAcc / perfFrames) * 1000;
        perfAcc = 0; perfFrames = 0;
        slowWindows = avgMs > 24 ? slowWindows + 1 : 0;
        if (slowWindows >= 2 && perfStep < 4) {
          slowWindows = 0;
          // step down: post off → DPR 1 → 60% particles → 40% particles
          perfStep++;
          if (usePost) { usePost = false; post?.dispose(); post = null; }
          else if (dprCap > 1) { dprCap = 1; resize(true); }
          else {
            drawFrac = drawFrac > 0.6 ? 0.6 : 0.4;
            geo.setDrawRange(0, Math.floor(COUNT * drawFrac));
            baseSize = baseSize0 * Math.sqrt(1 / drawFrac) * 0.9;
          }
          console.info(`[gl] quality step ${perfStep} (avg ${avgMs.toFixed(1)}ms)`);
        }
      }
    }
  };

  // ---------------------------------------------------------------- lifecycle
  let running = false;
  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    renderer.setAnimationLoop(frame);
  };
  const stop = () => {
    running = false;
    renderer.setAnimationLoop(null);
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    fromAttr.needsUpdate = true;
    toAttr.needsUpdate = true;
    if (!document.hidden) start();
  }, false);

  if (!document.hidden) start();

  // debug handle (harmless in production)
  (window as unknown as { __gl?: unknown }).__gl = {
    get form() { return shown; },
    count: COUNT,
    morphTo: (f: FormName) => morphTo(f),
    pulse: firePulse,
    get post() { return !!post; },
    set post(v: boolean) { usePost = v; if (v) loadPost(); },
    get genTimes() { return genTimes; },
    get debug() { return { waveT: U.uWaveT.value, morph: morph.value, explode: U.uExplode.value, scrollVel: U.uScrollVel.value, pulse: pulse.strength, perfStep }; },
  };
}

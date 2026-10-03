import { simplexNoise } from './noise.glsl';
import { VORTEX, VOICE } from './forms';

const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/*
 * Attributes
 *   position : vec3   random unit direction (morph arc + intro explosion)
 *   aFrom    : vec4   xyz = source form position, w = brightness/size weight
 *   aTo      : vec4   xyz = target form position, w = brightness/size weight
 *   aRand    : vec4   x = morph delay, y = size rand, z = colour rand, w = phase / sparkle
 *   aGraph   : vec4   hero graph: x = normalised BFS hop (-1 = none), y = position along edge in traversal
 *                     direction (-1 = node/none), z = 1 if drawn as a 0/1 glyph, w = packet phase of its edge
 *
 * Per-form behaviours (breath, wave, beat, orbit, terrain, vortex) are blended weights,
 * never branches, so switching forms never pops.
 */
export const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uMorph;
uniform float uSpread;
uniform float uArc;
uniform float uExplode;

uniform float uNoise;
uniform float uNoiseSpeed;
uniform float uSize;
uniform float uPixelRatio;
uniform float uViewportH;
uniform float uAlpha;
uniform float uOpacity;

uniform float uBreath;
uniform float uWave;
uniform float uBeat;
uniform float uOrbit;
uniform float uTerrain;
uniform float uVortex;

uniform vec3 uMouse;
uniform float uMouseStrength;
uniform vec3 uPulseCenter;
uniform float uPulseRadius;
uniform float uPulseStrength;
uniform float uScrollVel;

uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform vec3 uAccent;
uniform float uAccentMix;

// hero graph ("algorithmic core")
uniform float uGraph;     // 0..1 weight of the graph behaviour
uniform float uWaveT;     // BFS front position in hop space (-0.05 .. 1.2)
uniform float uBuild;     // 1 during the intro: nodes first, then edges grow out of them
uniform vec3 uSignal;
uniform vec3 uViolet;

attribute vec4 aFrom;
attribute vec4 aTo;
attribute vec4 aRand;
attribute vec4 aGraph;

varying vec3 vColor;
varying float vAlpha;
varying float vGlyph;
varying float vDigit;

${simplexNoise}

const float PI = 3.141592653589793;

vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

float easeInOutCubic(float p) {
  return p < 0.5 ? 4.0 * p * p * p : 1.0 - pow(-2.0 * p + 2.0, 3.0) * 0.5;
}

// lub-dub at ~72 bpm (1.2 Hz)
float heartbeat(float t) {
  float ph = fract(t * 1.2);
  float lub = exp(-pow((ph - 0.06) * 18.0, 2.0));
  float dub = exp(-pow((ph - 0.26) * 20.0, 2.0)) * 0.6;
  return lub + dub;
}

// pseudo audio level for an angle around the ring
float audio(float a, float t) {
  vec2 c = vec2(cos(a), sin(a));
  float s = 0.45 + 0.35 * sin(a * 5.0 + t * 2.3) * sin(a * 2.0 - t * 1.7);
  s += 0.45 * snoise(vec3(c * 1.6, t * 1.3));
  s += 0.25 * snoise(vec3(c * 4.0, t * 2.7));
  float kick = pow(0.5 + 0.5 * sin(t * 6.2831 * 1.05), 10.0);
  return clamp(s + kick * 0.45, 0.05, 1.7);
}

void main() {
  float t = uTime;

  // ---- morph (per-particle staggered progress + curved path) ----
  // intro "build": node particles first, then edges extend from both ends, glyphs last
  // intro "autorouter": the chip assembles first, then traces route outward from the pins, glyphs last
  float buildDelay = aGraph.x < 0.0 ? aRand.x
    : aGraph.z > 0.5 ? 0.85 + aRand.x * 0.15
    : (aGraph.y < 0.0 && aGraph.x < 0.05) ? aRand.x * 0.22
    : 0.28 + 0.6 * aGraph.x;
  float delay = mix(aRand.x, buildDelay, uBuild);
  float p = clamp((uMorph - delay * uSpread) / (1.0 - uSpread), 0.0, 1.0);
  p = easeInOutCubic(p);
  float arc = sin(p * PI);
  vec3 pos = mix(aFrom.xyz, aTo.xyz, p) + position * arc * uArc * (0.5 + aRand.y);
  float w = mix(aFrom.w, aTo.w, p);
  float glow = 0.0;

  // ---- hero: breathing core ----
  if (uBreath > 0.001) {
    float r = length(pos);
    float breathe = sin(t * 1.25) * 0.035 + snoise(pos * 1.4 + t * 0.25) * 0.05;
    pos *= 1.0 + uBreath * breathe * smoothstep(2.4, 0.6, r);
  }

  // ---- voice: radial audio bars ----
  if (uWave > 0.001) {
    float r = length(pos.xy);
    float a = atan(pos.y, pos.x);
    float lvl = audio(a, t);
    float outer = smoothstep(${f(VOICE.r0 - 0.02)}, ${f(VOICE.r0 + 0.01)}, r) * (1.0 - smoothstep(${f(VOICE.cut)}, ${f(VOICE.cut + 0.08)}, r));
    float inner = 1.0 - smoothstep(${f(VOICE.ri - 0.01)}, ${f(VOICE.ri + 0.02)}, r);
    inner *= smoothstep(0.3, 0.4, r);
    float k = mix(1.0, 0.25 + 1.25 * lvl, uWave);
    float rOut = ${f(VOICE.r0)} + (r - ${f(VOICE.r0)}) * k;
    float rIn = ${f(VOICE.ri)} - (${f(VOICE.ri)} - r) * k;
    float nr = mix(r, rOut, outer);
    nr = mix(nr, rIn, inner);
    // the inner ring and core breathe with the kick
    float ring = (1.0 - outer) * (1.0 - inner);
    nr *= 1.0 + ring * uWave * 0.04 * lvl;
    pos.xy *= nr / max(r, 1e-4);
    glow += uWave * (outer + inner) * lvl * 0.5;
  }

  // ---- heart: beat ----
  if (uBeat > 0.001) {
    float b = heartbeat(t);
    pos *= 1.0 + uBeat * b * 0.085;
    glow += uBeat * b * 0.6;
  }

  // ---- cookwhat: ingredients orbit above the bowl ----
  if (uOrbit > 0.001) {
    float m = smoothstep(0.35, 0.6, pos.y) * uOrbit;
    float ang = atan(pos.z, pos.x);
    pos.xz = rot2(pos.xz, -t * 0.32 * m);
    pos.y += sin(t * 1.4 + ang * 3.0) * 0.07 * m;
  }

  // ---- medcheck: rolling terrain + bobbing pin ----
  if (uTerrain > 0.001) {
    float pin = smoothstep(0.22, 0.32, pos.y);
    float ground = 1.0 - pin;
    pos.y += uTerrain * ground * (sin(pos.x * 2.1 + t * 0.9) * cos(pos.z * 1.7 + t * 0.6) * 0.07);
    pos.y += uTerrain * pin * (sin(t * 1.8) * 0.08 + 0.04);
    // ripple rings around the pin base
    float d = length(pos.xz - vec2(${f(0.35)}, ${f(0.15)}));
    float rip = sin(d * 9.0 - t * 3.0) * exp(-d * 1.6) * 0.035;
    pos.y += uTerrain * ground * rip;
    glow += uTerrain * ground * max(rip, 0.0) * 8.0;
  }

  // ---- contact: spiral vortex flowing into the centre ----
  if (uVortex > 0.001) {
    float r = length(pos.xy);
    float m = uVortex * (1.0 - smoothstep(${f(VORTEX.r0 + VORTEX.r - 0.05)}, ${f(VORTEX.r0 + VORTEX.r + 0.05)}, r));
    float s = 1.0 - pow(clamp((r - ${f(VORTEX.r0)}) / ${f(VORTEX.r)}, 0.0, 1.0), ${f(1 / VORTEX.pow)});
    float arm = atan(pos.y, pos.x) - s * ${f(VORTEX.twist)};
    float dz = pos.z + s * ${f(VORTEX.depth)};
    float s2 = fract(s + t * 0.055);
    float r2 = ${f(VORTEX.r0)} + ${f(VORTEX.r)} * pow(1.0 - s2, ${f(VORTEX.pow)});
    float a2 = arm + s2 * ${f(VORTEX.twist)} + t * 0.22;
    vec3 v = vec3(cos(a2) * r2, sin(a2) * r2, -s2 * ${f(VORTEX.depth)} + dz);
    pos = mix(pos, v, m);
    w *= mix(1.0, smoothstep(0.0, 0.08, s2) * smoothstep(1.0, 0.82, s2), m);
  }

  // ---- hero glyphs: ~45% of the 0/1 digits drift up off the board like a data stream
  float gDrift = aGraph.z * uGraph * step(aRand.z, 0.45);
  if (gDrift > 0.001) {
    float f = fract(t * 0.09 + aRand.w);
    pos.z += f * 1.1 * gDrift;
    w *= mix(1.0, sin(f * PI), gDrift);
  }

  // ---- alive: noise drift ----
  float nt = t * uNoiseSpeed;
  float vel = abs(uScrollVel);
  vec3 drift = flow3(pos * 0.9 + vec3(0.0, nt, nt * 0.6));
  pos += drift * (uNoise * (0.55 + aRand.z * 0.9) + vel * 0.08);
  // scroll stretch: particles smear along y with velocity
  pos.y += uScrollVel * 0.22 * (aRand.w - 0.5);

  // ---- intro explosion ----
  pos += position * uExplode * (1.2 + aRand.y * 3.6);

  vec4 world = modelMatrix * vec4(pos, 1.0);

  // ---- cursor: repel + swirl on the z=0 plane ----
  vec2 dm = world.xy - uMouse.xy;
  float dist = length(dm);
  float fall = smoothstep(1.15, 0.0, dist) * uMouseStrength;
  vec2 dir = dm / max(dist, 1e-4);
  // the circuit stays crisp under the cursor: it lights up rather than being pushed around
  float push = 1.0 - 0.8 * uGraph;
  world.xy += (dir * fall * 0.42 + vec2(-dir.y, dir.x) * fall * 0.22) * push;
  world.z += fall * 0.35 * push;
  glow += fall * 0.6;

  // ---- pulse shockwave ----
  if (uPulseStrength > 0.001) {
    vec3 dp = world.xyz - uPulseCenter;
    float d = length(dp);
    float ring = exp(-pow((d - uPulseRadius) * 2.6, 2.0));
    world.xyz += (dp / max(d, 1e-4)) * ring * uPulseStrength * 0.55;
    glow += ring * uPulseStrength * 1.2;
  }

  vec4 mv = viewMatrix * world;
  gl_Position = projectionMatrix * mv;

  // ---- hero graph: BFS traversal front, visited state, data packets, cursor activation
  float gOn = uGraph * step(0.0, aGraph.x);
  float front = 0.0, visited = 0.0, packet = 0.0;
  if (gOn > 0.001) {
    front = exp(-pow((aGraph.x - uWaveT) * 15.0, 2.0)) * gOn;
    // the chip is dense: let the front flash it, but softer than the traces
    if (aGraph.y < 0.0 && aGraph.x < 0.05) front *= 0.45;
    visited = step(aGraph.x, uWaveT) * (1.0 - smoothstep(1.0, 1.18, uWaveT)) * gOn;
    if (aGraph.y >= 0.0) {
      // packets ride the path distance, so they run continuously along a whole trace
      float ph = fract(aGraph.x * 2.6 - t * 0.5 + aGraph.w);
      packet = smoothstep(0.05, 0.0, ph) * gOn * (0.3 + 0.7 * visited);
    }
  }
  float hover = fall * gOn;
  glow += front * 1.1 + packet * 1.3 + hover * 0.6;

  float glyph = aGraph.z * uGraph;
  vGlyph = glyph;
  float flip = floor(t * (0.35 + aRand.z * 0.9) + aRand.w * 37.0);
  vDigit = step(0.5, fract(sin(flip * 12.9898 + aRand.y * 78.233) * 43758.5453));

  float sizeRand = mix(0.45 + aRand.y * aRand.y * 1.7, 4.6, glyph);
  float size = uSize * sizeRand * (0.55 + w * 0.6) * (1.0 + glow * 0.35);
  gl_PointSize = clamp(size * projectionMatrix[1][1] * uViewportH * 0.5 / max(-mv.z, 0.1) * uPixelRatio, 0.0, 22.0 * uPixelRatio);

  vec3 col = mix(uColA, uColB, smoothstep(0.15, 0.85, aRand.z));
  col = mix(col, uColC, step(0.93, aRand.w) * 0.85);
  col = mix(col, uAccent, uAccentMix * 0.65);
  // graph colouring: dim edges, lime front, violet "visited", white-lime packets
  col = mix(col, uViolet, visited * (1.0 - front) * 0.45);
  col = mix(col, uSignal, clamp(front * 0.95 + hover * 0.7, 0.0, 1.0));
  col = mix(col, vec3(0.92, 1.0, 0.62), packet);
  col = mix(col, uSignal * 1.1, glyph * 0.6);
  col += glow * 0.25;
  vColor = col;

  float depthFade = smoothstep(16.0, 5.0, -mv.z) * smoothstep(1.8, 4.2, -mv.z);
  float graphDim = 1.0 - gOn * 0.45 * (1.0 - glyph);
  vAlpha = uOpacity * uAlpha * (0.25 + w * 0.75) * depthFade * (1.0 + glow * 0.5) * graphDim;
}
`;

export const fragmentShader = /* glsl */ `
uniform sampler2D uGlyphs; // 2 cells: "0" | "1"
varying vec3 vColor;
varying float vAlpha;
varying float vGlyph;
varying float vDigit;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float soft = exp(-d * d * 14.0) * step(d, 0.5);
  float core = exp(-d * d * 70.0);
  vec3 dotCol = vColor * soft + vec3(1.0, 0.98, 0.94) * core * 0.55;
  float dotA = soft * 0.85 + core * 0.4;
  float glyphA = 0.0;
  if (vGlyph > 0.001) {
    vec2 uv = vec2((gl_PointCoord.x + vDigit) * 0.5, 1.0 - gl_PointCoord.y);
    glyphA = texture2D(uGlyphs, uv).r;
  }
  vec3 col = mix(dotCol, vColor * 1.25, vGlyph);
  float a = mix(dotA, glyphA, vGlyph);
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a * vAlpha);
  #include <colorspace_fragment>
}
`;

/* Final composite: chromatic aberration (radial), vignette, fine grain. */
export const finalPassShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uCA: { value: 0.0045 },
    uVignette: { value: 0.55 },
    uInk: { value: null as unknown },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uCA;
    uniform float uVignette;
    uniform vec3 uInk;
    varying vec2 vUv;
    // Dave Hoskins' hash (no sin, stable precision)
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 c = vUv - 0.5;
      float d2 = dot(c, c);
      vec2 off = c * uCA * (0.4 + d2 * 4.0);
      vec4 base = texture2D(tDiffuse, vUv);
      float r = texture2D(tDiffuse, vUv + off).r;
      float b = texture2D(tDiffuse, vUv - off).b;
      vec3 col = vec3(r, base.g, b);
      col *= mix(1.0, smoothstep(0.85, 0.15, d2 * 2.2), uVignette);
      // multiplicative grain: never lifts the black background
      col *= 1.0 + (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 517.0) - 0.5) * 0.08;
      gl_FragColor = vec4(max(col, 0.0) + uInk, 1.0);
    }
  `,
};

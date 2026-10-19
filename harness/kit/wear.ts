/**
 * Procedural surface wear on plain arrays (no DOM, so it is tested): scratches, stains, dents and flaking, as three fields the
 * normal-map generator (normals.ts) uses. Same seed = same wear.
 *
 *   height  px units, 0 = untouched, negative = cut into the surface (scratch grooves, dents, flaked patches). Added to the height
 *           field before the normals are taken, so lights catch every one of them.
 *   dull    0..1, how much shine the spot loses (a stain or a groove scatters light; polished metal around it still shines).
 *   dirt    0..1, how much ambient light the spot loses (crevices, grime): the AO channel on high quality.
 *
 * Features scale with the image (about 128 px is the reference size): a 512 px map gets bigger dents and longer scratches, not
 * a denser pattern. Cost is value noise per pixel for stains and flakes (two octaves each), the rest is a few hundred splats.
 */
import { rng as makeRng, type Rng } from './rng';
import type { WearMix } from './material';

export interface WearFields {
  height: Float32Array;
  dull: Float32Array;
  dirt: Float32Array;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** One octave of value noise in 0..1 over w x h with lattice spacing `cell` px. */
function valueNoise(w: number, h: number, cell: number, r: Rng): Float32Array {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = r.next();
  const out = new Float32Array(w * h);
  const xi = new Int32Array(w);
  const xt = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const f = x / cell;
    xi[x] = Math.floor(f);
    const t = f - xi[x];
    xt[x] = t * t * (3 - 2 * t);
  }
  for (let y = 0; y < h; y++) {
    const f = y / cell;
    const yi = Math.floor(f);
    const t = f - yi;
    const yt = t * t * (3 - 2 * t);
    const r0 = yi * gw;
    const r1 = r0 + gw;
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const i = xi[x];
      const a = g[r0 + i] + (g[r0 + i + 1] - g[r0 + i]) * xt[x];
      const b = g[r1 + i] + (g[r1 + i + 1] - g[r1 + i]) * xt[x];
      out[o + x] = a + (b - a) * yt;
    }
  }
  return out;
}

/** Whole part of `n` plus one more with the probability of its fraction. */
const stochastic = (n: number, r: Rng) => Math.floor(n) + (r.next() < n - Math.floor(n) ? 1 : 0);

export function wearFields(w: number, h: number, mix: WearMix, seed: number | string): WearFields | null {
  const total = mix.scratch + mix.stain + mix.dent + mix.flake;
  if (!(total > 0.01) || w < 4 || h < 4) return null;
  const r = makeRng(`wear:${seed}`);
  const size = Math.max(w, h);
  const unit = size / 128;
  const area = (w * h) / (128 * 128);
  const height = new Float32Array(w * h);
  const dull = new Float32Array(w * h);
  const dirt = new Float32Array(w * h);

  // stains: broad blotches that kill the shine and darken a little
  if (mix.stain > 0.01) {
    const a = valueNoise(w, h, Math.max(4, size / 5), r.fork('s1'));
    const b = valueNoise(w, h, Math.max(3, size / 12), r.fork('s2'));
    const lo = 0.72 - 0.1 * Math.min(2, mix.stain);
    for (let i = 0; i < height.length; i++) {
      const s = smooth(lo, lo + 0.2, 0.65 * a[i] + 0.35 * b[i]);
      dull[i] = Math.max(dull[i], s * 0.6);
      dirt[i] = Math.max(dirt[i], s * 0.2);
    }
  }

  // flakes: patches where the top layer is gone: a hard-edged step down, dull, a little dark
  if (mix.flake > 0.01) {
    const a = valueNoise(w, h, Math.max(4, size / 14), r.fork('f1'));
    const b = valueNoise(w, h, Math.max(3, size / 30), r.fork('f2'));
    const thr = 0.84 - 0.1 * Math.min(2, mix.flake);
    for (let i = 0; i < height.length; i++) {
      const s = smooth(thr, thr + 0.025, 0.6 * a[i] + 0.4 * b[i]);
      if (s <= 0) continue;
      height[i] -= s * 1.0;
      dull[i] = Math.max(dull[i], s * 0.5);
      dirt[i] = Math.max(dirt[i], s * 0.25);
    }
  }

  // dents: smooth round dips, depth in proportion to their radius so every size slopes alike
  const dents = stochastic(mix.dent * 5 * area, r);
  for (let n = 0; n < dents; n++) {
    const cx = r.range(0, w);
    const cy = r.range(0, h);
    const rad = r.range(3, 11) * Math.max(0.5, unit);
    const depth = rad * r.range(0.2, 0.4);
    const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(w - 1, Math.ceil(cx + rad));
    const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(h - 1, Math.ceil(cy + rad));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / rad;
        if (d >= 1) continue;
        const k = (1 - d * d) * (1 - d * d);
        const i = y * w + x;
        height[i] -= depth * k;
        dull[i] = Math.max(dull[i], k * 0.3);
        dirt[i] = Math.max(dirt[i], k * 0.2);
      }
  }

  // scratches: thin grooves, mostly one way (a brushed or worn direction), some crossing it
  const scratches = stochastic(mix.scratch * 16 * area, r);
  const main = r.range(0, Math.PI);
  for (let n = 0; n < scratches; n++) {
    const ang = r.chance(0.25) ? r.range(0, Math.PI) : main + r.range(-0.45, 0.45);
    const len = size * r.range(0.12, 0.5);
    const depth = r.range(0.4, 1.2) * Math.max(0.6, unit * 0.6);
    const cx = r.range(0, w);
    const cy = r.range(0, h);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const steps = Math.ceil(len / 0.6);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const taper = Math.sin(t * Math.PI) ** 0.6;
      const x = cx + dx * (t - 0.5) * len;
      const y = cy + dy * (t - 0.5) * len;
      const xf = Math.floor(x), yf = Math.floor(y);
      const fx = x - xf, fy = y - yf;
      for (let j = 0; j < 4; j++) {
        const px = xf + (j & 1), py = yf + (j >> 1);
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const wt = ((j & 1 ? fx : 1 - fx) * (j & 2 ? fy : 1 - fy)) * taper;
        const i = py * w + px;
        height[i] = Math.min(height[i], -depth * wt);
        dull[i] = Math.max(dull[i], wt * 0.7);
        dirt[i] = Math.max(dirt[i], wt * depth * 0.12);
      }
    }
  }
  return { height, dull, dirt };
}

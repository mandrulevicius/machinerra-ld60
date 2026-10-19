/**
 * The maths of the screen transitions (transition.ts), apart from the DOM so it can be tested.
 *
 * Every wipe is a field f in 0..1 over a low-resolution grid: f is the moment (progress) at which that cell gets covered.
 * Coverage of a cell at progress p is `coverage(f, p, soft)`: 0 at p = 0 everywhere, 1 at p = 1 everywhere, `soft` is the
 * width of the soft edge as a share of the progress. Revealing runs p back from 1 to 0 over the same field (`flip` mirrors the
 * wipe, so a slab leaves on the far side, and reseeds the random kinds).
 */
export type WipeKind = 'fade' | 'wipe' | 'iris' | 'blocks' | 'dissolve';

export interface WipeOpts {
  /** The point an iris closes on, 0..1 of the screen. Default the centre. */
  at?: [number, number];
  /** The reveal half: mirror the wipe, reseed blocks and dissolve. */
  flip?: boolean;
  seed?: number;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (t: number) => t * t * (3 - 2 * t);

/** Coverage 0..1 of a cell whose threshold is `f`, at progress `p`. */
export const coverage = (f: number, p: number, soft: number) => clamp01((p * (1 + soft) - f) / soft);

/** Integer hash to 0..1. */
export function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise, smooth between hashed lattice points. */
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Replace values by their rank, so thresholds are evenly spread and the wipe moves at a steady pace. */
function rank(f: Float32Array) {
  const idx = Array.from(f.keys()).sort((a, b) => f[a] - f[b]);
  const n = f.length - 1 || 1;
  idx.forEach((i, r) => (f[i] = r / n));
}

/** Thresholds for a `w` x `h` grid; `blocks` uses one cell per grid point, the rest sample smoothly. null for a plain fade. */
export function field(kind: WipeKind, w: number, h: number, o: WipeOpts = {}): Float32Array | null {
  if (kind === 'fade') return null;
  const f = new Float32Array(w * h);
  const seed = (o.seed ?? 1) + (o.flip ? 7919 : 0);
  const aspect = w / h;
  const [ax, ay] = o.at ?? [0.5, 0.5];
  // farthest corner from the iris point, in aspect-corrected units
  const dmax = Math.hypot(Math.max(ax, 1 - ax) * aspect, Math.max(ay, 1 - ay)) || 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const v = (y + 0.5) / h;
      let t: number;
      if (kind === 'wipe') t = ((o.flip ? 1 - u : u) + 0.25 * v) / 1.25;
      else if (kind === 'iris') t = 1 - Math.hypot((u - ax) * aspect, v - ay) / dmax;
      else if (kind === 'blocks') t = 0.65 * hash(x, y, seed) + 0.35 * ((x + y) / (w + h - 2 || 1));
      else t = 0.6 * valueNoise(u * 5 * aspect, v * 5, seed) + 0.3 * valueNoise(u * 11 * aspect, v * 11, seed + 1) + 0.1 * valueNoise(u * 23 * aspect, v * 23, seed + 2);
      f[y * w + x] = t;
    }
  }
  if (kind === 'dissolve') rank(f);
  return f;
}

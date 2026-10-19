/**
 * Terrain shapes: the ground of a place (or of a larger handcrafted area) as named shapes with a size, a roughness and an
 * edge seed, not as a grid of characters. A place file lists them next to its parts (`blob`, `band`: `levels/places/*.json`,
 * `places.ts` reads them), and after the land is generated `rasterise` paints them onto its tiles under the place, turned
 * and mirrored like the parts. Pure; the land's random stream is never touched (the edge wobble comes from the shape's own
 * `seed`), so a shape changes the ground under a place and nothing else about a land.
 *
 *   blob  an ellipse (`rx`, `ry`) turned by `angle`: a dune, a rock, a patch of hardpan
 *   band  a strip (`length` x `width`) turned by `angle`, bowed sideways by `bend` at its middle: a path, a dune ridge, a dry bed
 *
 * `ground` is what it paints (`sand`, `dune`, `hardpan`, `rock`). Later shapes paint over earlier ones; painting open
 * ground over rock opens it. All lengths are tiles from the place's centre here (the file holds px: `parseShape`).
 * `rough` 0..1 wobbles the edge with the same kind of smooth value noise the land is made of, plus a finer octave, so a
 * shape does not read smoother than the ground beside it; 0 is a clean outline.
 */
export type Ground = 'sand' | 'dune' | 'hardpan' | 'rock';
export const GROUNDS: readonly Ground[] = ['sand', 'dune', 'hardpan', 'rock'];

interface Base {
  ground: Ground;
  /** Centre of the shape, tiles from the place's centre (before the land's turn). */
  x: number;
  y: number;
  /** Radians. */
  angle: number;
  /** 0 clean .. 1 ragged. */
  rough: number;
  /** Seeds the edge wobble. */
  seed: number;
}
export interface Blob extends Base { kind: 'blob'; rx: number; ry: number }
export interface Band extends Base { kind: 'band'; length: number; width: number; bend: number }
export type Shape = Blob | Band;

/** How a place sits in a land: its centre (tiles), the turn (radians) and the mirror (-1 flips x) applied to every part. */
export interface Frame { x: number; y: number; rot: number; mir: 1 | -1 }

/** The most the edge moves at `rough` 1, tiles. */
const WOBBLE = 3;

const hash = (seed: number, x: number, y: number) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth value noise in 0..1. */
const vnoise = (seed: number, x: number, y: number) => {
  const ix = Math.floor(x), iy = Math.floor(y);
  const s = (t: number) => t * t * (3 - 2 * t);
  const tx = s(x - ix), ty = s(y - iy);
  const a = hash(seed, ix, iy), b = hash(seed, ix + 1, iy), c = hash(seed, ix, iy + 1), d = hash(seed, ix + 1, iy + 1);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
};
/** The edge's push at a point, -0.5..0.5: a slow swell and a finer ripple. */
export const edgeNoise = (seed: number, x: number, y: number) => 0.65 * vnoise(seed, x / 2.6, y / 2.6) + 0.35 * vnoise(seed + 101, x / 1.1, y / 1.1) - 0.5;

/** Distance outside the shape's outline, tiles (negative inside), at a point in the place's own frame. */
function outside(s: Shape, lx: number, ly: number) {
  const dx = lx - s.x, dy = ly - s.y;
  const c = Math.cos(-s.angle), n = Math.sin(-s.angle);
  const px = dx * c - dy * n, py = dx * n + dy * c;
  if (s.kind === 'blob') return (Math.hypot(px / Math.max(s.rx, 0.01), py / Math.max(s.ry, 0.01)) - 1) * Math.min(s.rx, s.ry);
  const half = s.length / 2;
  const t = Math.max(-1, Math.min(1, px / Math.max(half, 0.01)));
  const bow = s.bend * (1 - t * t);
  return Math.hypot(Math.max(0, Math.abs(px) - half), py - bow) - s.width / 2;
}

/** Is the point (tiles, in the place's own frame) under the shape? */
export const covers = (s: Shape, lx: number, ly: number) => outside(s, lx, ly) + s.rough * WOBBLE * 2 * edgeNoise(s.seed, lx, ly) <= 0;

/** The farthest the shapes reach from the place's centre, tiles. */
export function reach(shapes: readonly Shape[]) {
  let m = 0;
  for (const s of shapes) {
    const r = s.kind === 'blob' ? Math.max(s.rx, s.ry) : s.length / 2 + s.width / 2 + Math.abs(s.bend);
    m = Math.max(m, Math.hypot(s.x, s.y) + r + s.rough * WOBBLE);
  }
  return m;
}

/**
 * Paint the shapes, in order, onto the tiles they cover; `paint` is called per tile (the caller keeps the land's border
 * and anything it wants kept). Returns the number of calls.
 */
export function rasterise(shapes: readonly Shape[], f: Frame, w: number, h: number, paint: (x: number, y: number, ground: Ground) => void) {
  if (!shapes.length) return 0;
  const r = Math.ceil(reach(shapes)) + 1;
  const cos = Math.cos(f.rot), sin = Math.sin(f.rot);
  let n = 0;
  for (const s of shapes)
    for (let ty = Math.max(0, Math.floor(f.y - r)); ty <= Math.min(h - 1, Math.ceil(f.y + r)); ty++)
      for (let tx = Math.max(0, Math.floor(f.x - r)); tx <= Math.min(w - 1, Math.ceil(f.x + r)); tx++) {
        // The tile in the place's own frame: undo the turn, then the mirror (parts are placed as centre + R * (mir * x, y)).
        const dx = tx - f.x, dy = ty - f.y;
        const lx = (dx * cos + dy * sin) * f.mir, ly = -dx * sin + dy * cos;
        if (covers(s, lx, ly)) {
          paint(tx, ty, s.ground);
          n++;
        }
      }
  return n;
}

/** The entity types a place file may hold as shapes. */
export const SHAPE_TYPES = ['blob', 'band'] as const;
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * A shape from its level-file entity (px, degrees, `scale` multiplying its size); `px` is the tile size. Throws, naming
 * the entity, when it is not a valid shape.
 */
export function parseShape(e: { id: string; type: string; x: number; y: number; rotation?: number; scale?: number; props?: Record<string, unknown> }, px: number): Shape {
  const p = e.props ?? {};
  const ground = (p.ground ?? 'hardpan') as Ground;
  if (!GROUNDS.includes(ground)) throw new Error(`shape ${e.id}: ground "${String(p.ground)}" is not one of ${GROUNDS.join(', ')}`);
  const k = num(e.scale, 1) / px;
  const base = { ground, x: e.x / px, y: e.y / px, angle: (num(e.rotation, 0) * Math.PI) / 180, rough: Math.max(0, Math.min(1, num(p.rough, 0.3))), seed: Math.floor(num(p.seed, 1)) };
  if (e.type === 'blob') return { kind: 'blob', ...base, rx: num(p.rx, 96) * k, ry: num(p.ry, 64) * k };
  if (e.type === 'band') return { kind: 'band', ...base, length: num(p.length, 256) * k, width: num(p.width, 48) * k, bend: num(p.bend, 0) * k };
  throw new Error(`shape ${e.id}: unknown shape type "${e.type}" (${SHAPE_TYPES.join(', ')})`);
}

/**
 * Collision shapes from art: image -> mask -> low-res outline -> polygon with a vertex budget (+ hull, Arcade boxes/circle).
 * Pure functions on RGBA bytes and masks (vitest-friendly); only `shapesFromTexture` / `addMatterImage` / `applyArcade*` touch Phaser.
 * All shapes are in SOURCE IMAGE PIXELS (top-left origin); multiply by the sprite's scale. Findings: games/lab/src/scenes/Collision.ts.
 *
 *   const set = shapesFromTexture(this.textures, 'hero', { budgets: [16] });   // once at load; cached per key + options
 *   addMatterImage(this, 'hero', set.polys[16], x, y, 0.2);                    // concave outline -> Matter body, sprite aligned
 *   applyArcadeBox(sprite.body, set.core);                                     // or applyArcadeCircle(sprite.body, set.circle)
 *
 * `ShapeSet` is plain JSON: `JSON.stringify(set)` and commit it next to the art to review or hand-edit instead of recomputing.
 */
import type Phaser from 'phaser';

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Circle {
  x: number;
  y: number;
  r: number;
}
/** 1 = solid. */
export interface Mask {
  w: number;
  h: number;
  data: Uint8Array;
}

export interface MaskOptions {
  /** What counts as empty: 'transparent' (alpha below `alpha`), 'color' (the corner colour, for opaque line art), 'auto' (colour if the image border is opaque). */
  background?: 'auto' | 'transparent' | 'color';
  /** Per-channel colour distance still counted as background (default 40: absorbs anti-aliasing and jpeg/webp noise). */
  tolerance?: number;
  /** Alpha below this is empty (default 16). */
  alpha?: number;
  /** Solid = everything not reachable from the image edge through background, so enclosed white areas inside line art count as solid (default true). False keeps real holes. */
  fillHoles?: boolean;
}

export interface ShapeOptions extends MaskOptions {
  /** Vertex budgets to produce (default [16]). Matter wants <= 16 per polygon (lab Physics probe). */
  budgets?: number[];
  /** The outline is traced on a mask downsampled to this many cells on the long side (default 128). */
  maxDim?: number;
  /** Horizontal bands for `bands` (default 4). */
  bands?: number;
}

export interface ShapeSet {
  /** Source image size. */
  w: number;
  h: number;
  /** Simplified outline (closed, no repeated first point) per vertex budget. */
  polys: Record<number, Pt[]>;
  /** Convex hull of the outline, simplified to the largest budget (convex stays convex). */
  hull: Pt[];
  /** Tight bounding box of the solid pixels. */
  box: Rect;
  /** Bounding box after trimming 5% of the area off each side per axis: the usual single Arcade hitbox (ignores horns, arms, tails). */
  core: Rect;
  /** One box per horizontal band (several Arcade static bodies or custom overlap tests). */
  bands: Rect[];
  /** Circle with the same area as the silhouette, at its centroid. */
  circle: Circle;
  /** Silhouette area in source px^2. */
  area: number;
  /** Compute time for the whole pipeline (mask to shapes), ms. */
  ms: number;
}

// ---------- mask ----------

/** RGBA bytes to a solid mask. See MaskOptions. */
export function maskFromRGBA(rgba: ArrayLike<number>, w: number, h: number, o: MaskOptions = {}): Mask {
  const alpha = o.alpha ?? 16;
  const tol = o.tolerance ?? 40;
  const px = (x: number, y: number) => (y * w + x) * 4;
  let useColor = o.background === 'color';
  if (o.background === undefined || o.background === 'auto') {
    let opaque = 0;
    let n = 0;
    for (let x = 0; x < w; x++) for (const y of [0, h - 1]) (n++, rgba[px(x, y) + 3] >= 255 - alpha && opaque++);
    for (let y = 1; y < h - 1; y++) for (const x of [0, w - 1]) (n++, rgba[px(x, y) + 3] >= 255 - alpha && opaque++);
    useColor = opaque / n > 0.95;
  }
  const r0 = rgba[0];
  const g0 = rgba[1];
  const b0 = rgba[2];
  const isBg = (i: number) =>
    rgba[i + 3] < alpha ||
    (useColor && Math.abs(rgba[i] - r0) <= tol && Math.abs(rgba[i + 1] - g0) <= tol && Math.abs(rgba[i + 2] - b0) <= tol);

  const data = new Uint8Array(w * h);
  if (o.fillHoles === false) {
    for (let p = 0; p < w * h; p++) data[p] = isBg(p * 4) ? 0 : 1;
    return { w, h, data };
  }
  // Flood fill the background from every edge pixel (4-connected); solid = not reached.
  const reached = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number) => {
    if (!reached[p] && isBg(p * 4)) (reached[p] = 1), stack.push(p);
  };
  for (let x = 0; x < w; x++) (push(x), push((h - 1) * w + x));
  for (let y = 0; y < h; y++) (push(y * w), push(y * w + w - 1));
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  for (let p = 0; p < w * h; p++) data[p] = reached[p] ? 0 : 1;
  return { w, h, data };
}

/** Shrinks so the long side has `maxDim` cells (never enlarges). A cell is solid when at least half its pixels are. `cell` = source px per cell. */
export function downsample(m: Mask, maxDim: number): { mask: Mask; cell: number } {
  const cell = Math.max(1, Math.max(m.w, m.h) / maxDim);
  if (cell === 1) return { mask: m, cell };
  const w = Math.ceil(m.w / cell);
  const h = Math.ceil(m.h / cell);
  const data = new Uint8Array(w * h);
  for (let cy = 0; cy < h; cy++) {
    const y0 = Math.round(cy * cell);
    const y1 = Math.min(m.h, Math.round((cy + 1) * cell));
    for (let cx = 0; cx < w; cx++) {
      const x0 = Math.round(cx * cell);
      const x1 = Math.min(m.w, Math.round((cx + 1) * cell));
      let s = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += m.data[y * m.w + x];
      const n = (x1 - x0) * (y1 - y0); // 0 for a rounding-only sliver at the far edge: never solid
      data[cy * w + cx] = n > 0 && s * 2 >= n ? 1 : 0;
    }
  }
  return { mask: { w, h, data }, cell };
}

// ---------- outline: marching squares ----------

// Cell corners TL TR BR BL (bit 8 4 2 1) -> segments between edge midpoints T R B L. Saddles (5, 10) join the diagonal so thin diagonals stay connected.
const SEGS: Record<number, [string, string][]> = {
  1: [['L', 'B']], 2: [['B', 'R']], 3: [['L', 'R']], 4: [['T', 'R']], 5: [['T', 'L'], ['B', 'R']], 6: [['T', 'B']], 7: [['T', 'L']],
  8: [['T', 'L']], 9: [['T', 'B']], 10: [['T', 'R'], ['L', 'B']], 11: [['T', 'R']], 12: [['L', 'R']], 13: [['R', 'B']], 14: [['L', 'B']],
};

/** All closed contours of the solid region, in mask pixel-edge coordinates (pixel i spans i..i+1), as loops without a repeated first point. */
export function trace(m: Mask): Pt[][] {
  const { w, h, data } = m;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[y * w + x]);
  const K = 2 * Math.max(w, h) + 8;
  const key = (dx: number, dy: number) => (dx + 2) * K + (dy + 2);
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  // Doubled coordinates: pixel centre (i, j) is (2i+1, 2j+1); edge midpoints sit between centres.
  for (let j = -1; j < h; j++) {
    for (let i = -1; i < w; i++) {
      const c = at(i, j) * 8 + at(i + 1, j) * 4 + at(i + 1, j + 1) * 2 + at(i, j + 1);
      if (c === 0 || c === 15) continue;
      const mid: Record<string, number> = { T: key(2 * i + 2, 2 * j + 1), R: key(2 * i + 3, 2 * j + 2), B: key(2 * i + 2, 2 * j + 3), L: key(2 * i + 1, 2 * j + 2) };
      for (const [a, b] of SEGS[c]) link(mid[a], mid[b]);
    }
  }
  const loops: Pt[][] = [];
  const seen = new Set<number>();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop: Pt[] = [];
    let prev = -1;
    let cur = start;
    do {
      seen.add(cur);
      loop.push({ x: (Math.floor(cur / K) - 2) / 2, y: ((cur % K) - 2) / 2 });
      const [a, b] = adj.get(cur)!;
      const next = a !== prev ? a : b;
      prev = cur;
      cur = next;
    } while (cur !== start);
    loops.push(loop);
  }
  return loops;
}

// ---------- polygons ----------

export function polygonArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function polygonCentroid(p: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i];
    const r = p[(i + 1) % p.length];
    const f = q.x * r.y - r.x * q.y;
    a += f;
    cx += (q.x + r.x) * f;
    cy += (q.y + r.y) * f;
  }
  return a === 0 ? { ...p[0] } : { x: cx / (3 * a), y: cy / (3 * a) };
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = dx * dx + dy * dy;
  const t = l === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Douglas-Peucker for a closed polygon: anchored at the point farthest from the first, so no corner is lost to the start index. */
export function simplify(pts: Pt[], tol: number): Pt[] {
  const n = pts.length;
  if (n <= 3) return pts.slice();
  let far = 1;
  for (let i = 2; i < n; i++) if (Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y) > Math.hypot(pts[far].x - pts[0].x, pts[far].y - pts[0].y)) far = i;
  const keep = new Uint8Array(n);
  keep[0] = keep[far] = 1;
  const rec = (a: number, b: number) => {
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i % n], pts[a % n], pts[b % n]);
      if (d > maxD) (maxD = d), (idx = i);
    }
    if (idx >= 0 && maxD > tol) (keep[idx % n] = 1, rec(a, idx), rec(idx, b));
  };
  rec(0, far);
  rec(far, n);
  return pts.filter((_, i) => keep[i]);
}

/** The finest Douglas-Peucker simplification with at most `budget` vertices (bisects the tolerance). */
export function fitBudget(pts: Pt[], budget: number): Pt[] {
  if (pts.length <= budget) return pts.slice();
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  let hi = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  let lo = 0;
  let best = simplify(pts, hi);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const s = simplify(pts, mid);
    if (s.length <= budget) (hi = mid, (best = s));
    else lo = mid;
  }
  return best;
}

/** Andrew's monotone chain. */
export function convexHull(pts: Pt[]): Pt[] {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half(p.slice().reverse())];
}

export function pointInPolygon(x: number, y: number, p: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (p[i].y > y !== p[j].y > y && x < ((p[j].x - p[i].x) * (y - p[i].y)) / (p[j].y - p[i].y) + p[i].x) inside = !inside;
  }
  return inside;
}

/** Largest distance from a vertex of either closed polygon to the other's edges (symmetric, vertex-sampled Hausdorff): the worst error of `a` against `b` in px. */
export function maxDeviation(a: Pt[], b: Pt[]): number {
  const toEdges = (p: Pt, poly: Pt[]) => Math.min(...poly.map((q, i) => segDist(p, q, poly[(i + 1) % poly.length])));
  return Math.max(...a.map((p) => toEdges(p, b)), ...b.map((p) => toEdges(p, a)));
}

/** Intersection over union of a polygon (source px) and a mask whose cells are `cell` source px: 1 = same silhouette. */
export function polygonIoU(poly: Pt[], m: Mask, cell = 1): number {
  let inter = 0;
  let union = 0;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const a = m.data[y * m.w + x] === 1;
      const b = pointInPolygon((x + 0.5) * cell, (y + 0.5) * cell, poly);
      if (a && b) inter++;
      if (a || b) union++;
    }
  }
  return union ? inter / union : 1;
}

// ---------- Arcade approximations ----------

function bounds(m: Mask, y0 = 0, y1 = m.h): Rect | null {
  let x0 = m.w;
  let x1 = -1;
  let ya = m.h;
  let yb = -1;
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < m.w; x++)
      if (m.data[y * m.w + x]) (x0 = Math.min(x0, x), x1 = Math.max(x1, x), ya = Math.min(ya, y), yb = Math.max(yb, y));
  return x1 < 0 ? null : { x: x0, y: ya, w: x1 - x0 + 1, h: yb - ya + 1 };
}

/** Box after dropping the outermost `trim` of the solid area on each side, per axis. */
function trimmedBox(m: Mask, trim: number): Rect {
  const lo = (sums: number[]) => {
    const total = sums.reduce((a, b) => a + b, 0);
    let acc = 0;
    let a = 0;
    while (a < sums.length - 1 && acc + sums[a] <= total * trim) acc += sums[a++];
    acc = 0;
    let b = sums.length - 1;
    while (b > a && acc + sums[b] <= total * trim) acc += sums[b--];
    return [a, b + 1];
  };
  const cols = new Array(m.w).fill(0);
  const rows = new Array(m.h).fill(0);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.data[y * m.w + x]) (cols[x]++, rows[y]++);
  const [x0, x1] = lo(cols);
  const [y0, y1] = lo(rows);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const scaleRect = (r: Rect, k: number): Rect => ({ x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k });

// ---------- pipeline ----------

/** The whole pipeline on RGBA bytes. Throws when the image has no solid pixels. */
export function buildShapes(rgba: ArrayLike<number>, w: number, h: number, o: ShapeOptions = {}): ShapeSet {
  const t0 = performance.now();
  const { mask, cell } = downsample(maskFromRGBA(rgba, w, h, o), o.maxDim ?? 128);
  const loops = trace(mask).sort((a, b) => polygonArea(b) - polygonArea(a));
  if (!loops.length) throw new Error('buildShapes: no solid pixels (check the background option)');
  const clamp = (p: Pt) => ({ x: Math.min(w, p.x * cell), y: Math.min(h, p.y * cell) });
  const outline = loops[0].map(clamp);
  const budgets = o.budgets ?? [16];
  const polys: Record<number, Pt[]> = {};
  for (const b of budgets) polys[b] = fitBudget(outline, b);
  const bandCount = o.bands ?? 4;
  const box = bounds(mask)!;
  const rows = box.h / bandCount;
  const bands: Rect[] = [];
  for (let i = 0; i < bandCount; i++) {
    const r = bounds(mask, box.y + Math.round(i * rows), box.y + Math.round((i + 1) * rows));
    if (r) bands.push(scaleRect(r, cell));
  }
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) if (mask.data[y * mask.w + x]) (area++, (cx += x + 0.5), (cy += y + 0.5));
  const cellArea = cell * cell;
  return {
    w,
    h,
    polys,
    hull: fitBudget(convexHull(outline), Math.max(...budgets)),
    box: scaleRect(box, cell),
    core: scaleRect(trimmedBox(mask, 0.05), cell),
    bands,
    circle: { x: (cx / area) * cell, y: (cy / area) * cell, r: Math.sqrt((area * cellArea) / Math.PI) },
    area: area * cellArea,
    ms: performance.now() - t0,
  };
}

// ---------- Phaser glue ----------

const cache = new Map<string, ShapeSet>();

/** RGBA bytes of a loaded texture (image or canvas), at full size. */
export function readPixels(textures: Phaser.Textures.TextureManager, key: string): { data: Uint8ClampedArray; w: number; h: number } {
  const src = textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const w = (src as HTMLImageElement).naturalWidth || src.width;
  const h = (src as HTMLImageElement).naturalHeight || src.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

/** `buildShapes` on a loaded texture. Computed once per key + options; run it in create() or after load. */
export function shapesFromTexture(textures: Phaser.Textures.TextureManager, key: string, o: ShapeOptions = {}): ShapeSet {
  const id = key + JSON.stringify(o);
  const hit = cache.get(id);
  if (hit) return hit;
  const { data, w, h } = readPixels(textures, key);
  const set = buildShapes(data, w, h, o);
  cache.set(id, set);
  return set;
}

export function clearShapeCache() {
  cache.clear();
}

/** A Matter image whose body is the (concave) polygon `poly` (source px) scaled by `scale`. The sprite is re-origined on the body's centre of mass so it lines up and rotates around it. */
export function addMatterImage(
  scene: Phaser.Scene,
  key: string,
  poly: Pt[],
  x: number,
  y: number,
  scale: number,
  options: Phaser.Types.Physics.Matter.MatterBodyConfig = {},
): Phaser.Physics.Matter.Image {
  // Verts stay in source px: Matter images scale their body with setScale, so scaling the verts too would shrink the body twice.
  const img = scene.matter.add.image(x, y, key, undefined, { ...options, shape: { type: 'fromVerts', verts: poly, minimumArea: 1 } });
  img.setScale(scale);
  const frame = img.frame;
  const c = polygonCentroid(poly);
  img.setOrigin(c.x / frame.realWidth, c.y / frame.realHeight);
  return img;
}

/** Arcade: one box hitbox from a rect in source px (e.g. `set.core`). The body scales with the sprite. */
export function applyArcadeBox(body: Phaser.Physics.Arcade.Body, r: Rect) {
  body.setSize(r.w, r.h, false).setOffset(r.x, r.y);
}

/** Arcade: one circle hitbox (e.g. `set.circle`). */
export function applyArcadeCircle(body: Phaser.Physics.Arcade.Body, c: Circle) {
  body.setCircle(c.r, c.x - c.r, c.y - c.r);
}

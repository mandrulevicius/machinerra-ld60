/**
 * Wear: the ground and the backgrounds are old, used, patched, broken (Minos: "too clean ... more wear, to have more
 * details"). A seeded pass that runs on the land's paint after `paintGround` has made it and before the buried tech is laid
 * (`groundart.ts` calls `wearGround` once); it adds to what Laimonas's painters made and never edits their painting.
 *
 * Two layers, each drawn on its own canvas and masked by the mesa mask (`rocky`) before it lands on the ground:
 *  - the rock pass (mesa tops, dungeon walls): tonal blotches, cracks, weathering streaks down the cliffs;
 *  - the ground pass: big tonal blotches (bleached, soot-dark, patches of other ground), worn paths from the lift to the
 *    ruins with the old tyre ruts along some, drag marks, cracks, oil / rust / scorch stains, small debris (bolts, glass,
 *    wire, casings) alone and in spills. The city adds faded road paint, potholes and manholes; a dungeon adds cracked tiles,
 *    grime at the wall bases, water stains and rubble in the corners.
 * Everything is quiet: low alpha, ground-near colours, no red, no glow (threats and pickups stay the loudest things; a pickup
 * is lit and bigger than any debris here). The same seed paints the same wear. Cost: one pass per land, never per frame.
 *
 * Danger sites (`dangerwear.ts`) get much heavier wear on top: scorch, gouges, oil, wreckage, trampling.
 *
 * Add a biome: a `WEAR` row (its colours) and a `MIX` row (how much of each); nothing else. Counts are per area of ground,
 * so a bigger land or a dungeon gets the same density.
 */
import { T, type BiomeDef } from './sim/defs';
import { Ter, type MapData } from './sim/mapgen';
import { dangerSites, paintDanger } from './dangerwear';

type P = [number, number];
type Paint = BiomeDef['paint'];

/** A land's wear colours: burnt black (char, for danger sites), its light (bleach), dark (soot), oil, rust, two other grounds, crack, junk metal, brass, glass, trodden path. */
export interface Look { char: string; bleach: string; soot: string; oil: string; rust: string; patchA: string; patchB: string; crack: string; metal: string; brass: string; glass: string; path: string }

const WEAR: Record<Paint, Look> = {
  desert: { char: '#2a1c14', bleach: '#f6e6c4', soot: '#4a3426', oil: '#2a2220', rust: '#a8643a', patchA: '#b88a5a', patchB: '#948a74', crack: '#4a3220', metal: '#8a7048', brass: '#c8a050', glass: '#a4b4a8', path: '#f2dcb4' },
  demon: { char: '#060406', bleach: '#a0705e', soot: '#120a0c', oil: '#0c0a10', rust: '#6a4022', patchA: '#3a2a2c', patchB: '#5a4a48', crack: '#0a0608', metal: '#3a2c2c', brass: '#6a5038', glass: '#6a6a70', path: '#4a3a3a' },
  jungle: { char: '#10180e', bleach: '#b8c47c', soot: '#1c281a', oil: '#14181a', rust: '#8a5530', patchA: '#5a4a30', patchB: '#3e5a3a', crack: '#1c2214', metal: '#6a5a3a', brass: '#a88a48', glass: '#8aa49a', path: '#6a5a38' },
  city: { char: '#14141a', bleach: '#b4b4b0', soot: '#26262c', oil: '#14141a', rust: '#8a5a3a', patchA: '#5a5a60', patchB: '#7a7a78', crack: '#1e1e22', metal: '#6a6e78', brass: '#a08a50', glass: '#98aab0', path: '#8a8884' },
  snow: { char: '#3a3a4c', bleach: '#ffffff', soot: '#6a6a78', oil: '#3a3a48', rust: '#9a7a5a', patchA: '#a0b0c4', patchB: '#c8d4e4', crack: '#5a6682', metal: '#6a7284', brass: '#a89868', glass: '#b0c4d0', path: '#9aa6bc' },
  ether: { char: '#100c28', bleach: '#b8b4f0', soot: '#1c1840', oil: '#120e30', rust: '#5a4a90', patchA: '#403a88', patchB: '#7068b8', crack: '#1a1440', metal: '#5a5090', brass: '#8a80c0', glass: '#a8b0e0', path: '#4a4490' },
};

/** How much of each wear a land gets (1 = the base density): crack, rut, stain, junk, patch, blotch; `haze` scales the big tonal blotches' strength, `ink` the cracks' and ruts' (darker ground needs more to read). */
const MIX: Record<Paint, { crack: number; rut: number; stain: number; junk: number; patch: number; blotch: number; haze: number; ink: number }> = {
  desert: { crack: 1, rut: 1, stain: 1, junk: 1, patch: 1, blotch: 1, haze: 1, ink: 1 },
  demon: { crack: 1.6, rut: 0.4, stain: 1.2, junk: 0.8, patch: 1, blotch: 1.2, haze: 0.7, ink: 1.5 },
  jungle: { crack: 0.35, rut: 0.8, stain: 0.8, junk: 0.8, patch: 1.4, blotch: 1.2, haze: 0.6, ink: 1.6 },
  city: { crack: 1.6, rut: 0.3, stain: 1.4, junk: 1.4, patch: 0.6, blotch: 0.9, haze: 0.7, ink: 1.2 },
  snow: { crack: 0.8, rut: 1.2, stain: 0.9, junk: 0.7, patch: 1.2, blotch: 1.1, haze: 1, ink: 1 },
  ether: { crack: 1, rut: 0.3, stain: 0.5, junk: 0.6, patch: 0.8, blotch: 1, haze: 0.75, ink: 1.2 },
};

/** Base density per million game px of ground (or of rock, for the rock pass); a guess, tuned by eye. */
const PER_M = { blotch: 24, crack: 16, rut: 5, drag: 3, stain: 16, patch: 9, spill: 3.5, junk: 110, pothole: 5, manhole: 2, lane: 4, rockBlotch: 55, rockCrack: 30, fleck: 400, streak: 40 };

const TAU = Math.PI * 2;

/** The jittered-seed generator of the wear (own stream, so adding wear never moves what other passes draw). */
function stream(seed: number) {
  let s = (seed ^ 0x5bd1e995) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function layerCanvas(w: number, h: number) {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  return el;
}

/**
 * Lay the wear on the painted ground `c` (W x H texels, `k` game px each). `rocky` marks the mesa texels (and the soot ring),
 * the walls of a dungeon; it is read, not changed.
 */
export function wearGround(c: CanvasRenderingContext2D, m: MapData, k: number, rocky: Uint8Array, W: number, H: number, paint: Paint, seed: number) {
  const dungeon = typeof m.seed === 'string' && m.seed.startsWith('dungeon:');
  /** A city dungeon's floor is tiles: its cracks turn at right angles. */
  const tiled = dungeon && paint === 'city';
  const look = WEAR[paint], mix = MIX[paint];
  const rnd = stream(seed);
  const GW = W * k, GH = H * k;
  const rockAt = (x: number, y: number) => {
    const i = Math.floor(y / k), j = Math.floor(x / k);
    return i < 0 || j < 0 || i >= H || j >= W || rocky[i * W + j] === 1;
  };
  const tileAt = (x: number, y: number) => m.ter[Math.min(m.h - 1, Math.max(0, Math.floor(y / T))) * m.w + Math.min(m.w - 1, Math.max(0, Math.floor(x / T)))];
  let rockN = 0;
  for (let i = 0; i < rocky.length; i++) rockN += rocky[i];
  const openFrac = 1 - rockN / rocky.length;
  const MP = (GW * GH) / 1e6; // area in million game px
  const nGround = (per: number, mult = 1) => Math.round(per * MP * openFrac * mult);
  const nRock = (per: number) => Math.round(per * MP * (1 - openFrac));

  // The mesa mask: opaque where rock. A layer is multiplied by it (rock pass) or cut by it (ground pass).
  const mask = layerCanvas(W, H);
  {
    const mc = mask.getContext('2d')!;
    const id = mc.createImageData(W, H), d32 = new Uint32Array(id.data.buffer);
    for (let i = 0; i < rocky.length; i++) if (rocky[i]) d32[i] = 0xff000000;
    mc.putImageData(id, 0, 0);
  }
  const layer = layerCanvas(W, H);
  const L = layer.getContext('2d')!;
  const reset = () => {
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalCompositeOperation = 'source-over';
    L.globalAlpha = 1;
    L.clearRect(0, 0, W, H);
    L.setTransform(1 / k, 0, 0, 1 / k, 0, 0);
    L.lineJoin = 'round';
    L.lineCap = 'round';
  };
  /** Put the layer on the ground, through the mask: `keep` rock or `cut` it away. */
  const land = (onRock: boolean) => {
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalCompositeOperation = onRock ? 'destination-in' : 'destination-out';
    L.globalAlpha = 1;
    L.drawImage(mask, 0, 0);
    L.globalCompositeOperation = 'source-over';
    c.drawImage(layer, 0, 0);
  };

  const spot = (open: boolean, tries = 40): P | null => {
    for (let i = 0; i < tries; i++) {
      const x = rnd() * GW, y = rnd() * GH;
      if (rockAt(x, y) === !open) return [x, y];
    }
    return null;
  };
  /** An open spot on one of these tiles (city asphalt, paving), clear of rock round it. */
  const onTiles = (tiles: number[], clear: number): P | null => {
    for (let i = 0; i < 60; i++) {
      const x = rnd() * GW, y = rnd() * GH;
      if (!tiles.includes(tileAt(x, y)) || rockAt(x, y) || rockAt(x + clear, y) || rockAt(x - clear, y) || rockAt(x, y + clear) || rockAt(x, y - clear)) continue;
      return [x, y];
    }
    return null;
  };

  // ---- drawing helpers (game px) ----
  /** A flat blob of paint with an irregular edge, stacked in `levels` shrinking steps so it reads as contour bands. */
  const blob = (x: number, y: number, r: number, col: string, a: number, sq = 1, rot = 0, levels = 3) => {
    const n = 12 + Math.floor(rnd() * 6);
    const rad = Array.from({ length: n }, () => 0.66 + rnd() * 0.52);
    const cs = Math.cos(rot), sn = Math.sin(rot);
    L.fillStyle = col;
    L.globalAlpha = a;
    for (let lv = 0; lv < levels; lv++) {
      const s = 1 - lv * 0.32, ox = (rnd() - 0.5) * r * 0.12, oy = (rnd() - 0.5) * r * 0.12;
      const pts: P[] = rad.map((q, i) => {
        const an = (i / n) * TAU, lx = Math.cos(an) * r * s * q, ly = Math.sin(an) * r * s * q * sq;
        return [x + ox + lx * cs - ly * sn, y + oy + lx * sn + ly * cs];
      });
      L.beginPath();
      L.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        L.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      }
      L.closePath();
      L.fill();
    }
    L.globalAlpha = 1;
  };
  const stroke = (pts: P[], col: string, a: number, w: number, dx = 0, dy = 0) => {
    if (pts.length < 2) return;
    L.strokeStyle = col;
    L.globalAlpha = a;
    L.lineWidth = w;
    L.beginPath();
    pts.forEach(([x, y], i) => (i ? L.lineTo(x + dx, y + dy) : L.moveTo(x + dx, y + dy)));
    L.stroke();
    L.globalAlpha = 1;
  };
  /** A crack network: a walk that wanders (or, in a dungeon, turns at right angles along the tiles) and forks. */
  const crackNet = (x: number, y: number, len: number, grid: boolean, out: { pts: P[]; w: number }[], depth = 0, ang = rnd() * TAU) => {
    const step = grid ? 8 : 6, pts: P[] = [[x, y]];
    let a = grid ? Math.round(ang / (Math.PI / 2)) * (Math.PI / 2) : ang, d = 0;
    while (d < len) {
      if (grid) { if (rnd() < 0.09) a += (rnd() < 0.5 ? 1 : -1) * (Math.PI / 2); } else a += (rnd() - 0.5) * 0.6;
      x += Math.cos(a) * step; y += Math.sin(a) * step; d += step;
      pts.push([x, y]);
      if (depth < 2 && rnd() < 0.05) crackNet(x, y, (len - d) * 0.6, grid, out, depth + 1, a + (rnd() < 0.5 ? 1 : -1) * (grid ? Math.PI / 2 : 0.9));
    }
    out.push({ pts, w: depth ? 1 : 1.5 });
  };
  const cracks = (n: number, open: boolean, grid: boolean, dark: string, light: string, a = 1) => {
    const nets: { pts: P[]; w: number }[] = [];
    for (let i = 0; i < n; i++) {
      const p = spot(open);
      if (p) crackNet(p[0], p[1], 50 + rnd() * 150, grid, nets);
    }
    for (const q of nets) stroke(q.pts, light, 0.3 * a * mix.ink, q.w, 1.1, 1.1);
    for (const q of nets) stroke(q.pts, dark, Math.min(1, 0.5 * a * mix.ink), q.w);
  };
  /** A path that bends slowly from (x, y), `n` steps of `step` px, stopping at rock. */
  const trail = (x: number, y: number, ang: number, n: number, step: number): P[] => {
    const pts: P[] = [[x, y]];
    let curv = 0;
    for (let i = 0; i < n; i++) {
      curv = Math.max(-0.07, Math.min(0.07, curv + (rnd() - 0.5) * 0.05));
      ang += curv;
      x += Math.cos(ang) * step; y += Math.sin(ang) * step;
      if (rockAt(x, y)) break;
      pts.push([x, y]);
    }
    return pts;
  };
  /** Two wheel ruts along a path, fading in and out, the tread ticking across them in places. */
  const ruts = (pts: P[], tread: boolean) => {
    const n = pts.length - 1;
    if (n < 4) return;
    const gap = 11;
    for (const side of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const nx = (-(y1 - y0) / len) * side * (gap / 2), ny = ((x1 - x0) / len) * side * (gap / 2);
        const env = Math.pow(Math.sin((Math.PI * (i + 0.5)) / n), 0.6);
        L.lineCap = 'butt';
        stroke([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny]], look.soot, 0.4 * mix.ink * env, 3.4);
        stroke([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny]], look.bleach, 0.22 * mix.ink * env, 1.1, 2, 2);
        if (tread && i % 2 === 0) stroke([[x0 + nx - (nx / (gap / 2)) * 2, y0 + ny - (ny / (gap / 2)) * 2], [x0 + nx + (nx / (gap / 2)) * 2, y0 + ny + (ny / (gap / 2)) * 2]], look.soot, 0.2 * env, 1);
        L.lineCap = 'round';
      }
    }
  };
  /** One stain: oil (dark, with a few drips), rust (orange-brown, with a run-off streak), scorch (soot, flecked). */
  const stain = (x: number, y: number, kind: number) => {
    const r = 9 + rnd() * 24;
    if (kind < 0.4) {
      blob(x, y, r, look.oil, 0.2, 0.7 + rnd() * 0.3, rnd() * TAU);
      for (let i = 0; i < 3; i++) blob(x + (rnd() - 0.5) * r * 2.2, y + (rnd() - 0.5) * r * 2.2, 2 + rnd() * 3, look.oil, 0.3, 1, 0, 1);
    } else if (kind < 0.75) {
      const rot = rnd() * TAU;
      blob(x, y, r * 0.8, look.rust, 0.22, 0.5, rot);
      stroke([[x, y], [x + Math.cos(rot) * r * 2, y + Math.sin(rot) * r * 2]], look.rust, 0.16, 3 + rnd() * 3);
    } else {
      blob(x, y, r, look.soot, 0.22, 0.85, rnd() * TAU);
      for (let i = 0; i < 12; i++) {
        const a = rnd() * TAU, r0 = r * 0.8, r1 = r * (1.1 + rnd() * 0.5);
        stroke([[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r1, y + Math.sin(a) * r1]], look.soot, 0.2, 1.2);
      }
    }
  };
  /** One small thing lying on the ground: a bolt, nut, glass sliver, wire, shell casing or metal chip, with its shadow to the lower right. */
  const junk = (x: number, y: number) => {
    const kind = Math.floor(rnd() * 6), rot = rnd() * TAU, sz = 2.2 + rnd() * 2.2;
    L.save();
    L.translate(x, y);
    L.rotate(rot);
    const body = (draw: () => void, fill: string, a = 0.85) => {
      L.save(); L.translate(1.3, 1.3); L.globalAlpha = 0.28; L.fillStyle = look.soot; L.beginPath(); draw(); L.fill(); L.restore();
      L.globalAlpha = a; L.fillStyle = fill; L.beginPath(); draw(); L.fill();
      L.globalAlpha = 0.5; L.strokeStyle = look.soot; L.lineWidth = 0.8; L.stroke();
      L.globalAlpha = 1;
    };
    const hex = (r: number) => () => { for (let i = 0; i < 6; i++) L.lineTo(Math.cos((i / 6) * TAU) * r, Math.sin((i / 6) * TAU) * r); L.closePath(); };
    if (kind === 0) body(hex(sz * 0.8), look.metal);
    else if (kind === 1) { body(hex(sz), look.metal); L.globalAlpha = 0.7; L.fillStyle = look.soot; L.beginPath(); L.arc(0, 0, sz * 0.38, 0, TAU); L.fill(); }
    else if (kind === 2) body(() => { L.moveTo(-sz, -sz * 0.3); L.lineTo(sz * 1.5, 0); L.lineTo(-sz * 0.2, sz * 0.7); L.closePath(); }, look.glass, 0.6);
    else if (kind === 3) {
      L.lineWidth = 1.1; L.strokeStyle = look.soot; L.globalAlpha = 0.65;
      L.beginPath(); L.moveTo(-sz * 2, 0); L.bezierCurveTo(-sz, -sz * 1.4, sz, sz * 1.4, sz * 2.2, 0); L.stroke();
      L.strokeStyle = look.metal; L.globalAlpha = 0.5; L.lineWidth = 0.5; L.stroke();
    } else if (kind === 4) {
      body(() => L.rect(-sz, -sz * 0.45, sz * 2, sz * 0.9), look.brass);
      L.globalAlpha = 0.6; L.fillStyle = look.soot; L.beginPath(); L.arc(sz * 0.55, 0, sz * 0.25, 0, TAU); L.fill();
    } else body(() => { L.moveTo(-sz, -sz * 0.4); L.lineTo(-sz * 0.2, -sz * 0.9); L.lineTo(sz, -sz * 0.2); L.lineTo(sz * 0.7, sz * 0.7); L.lineTo(-sz * 0.6, sz * 0.5); L.closePath(); }, look.metal);
    L.restore();
  };
  /** A pebble: a few-sided stone, lit on the top left. */
  const stone = (x: number, y: number, r: number, col: string) => {
    const n = 5 + Math.floor(rnd() * 3), pts: P[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rnd() * 0.4, q = r * (0.7 + rnd() * 0.4); pts.push([x + Math.cos(a) * q, y + Math.sin(a) * q * 0.85]); }
    const path = (dx: number, dy: number) => { L.beginPath(); pts.forEach(([px, py], i) => (i ? L.lineTo(px + dx, py + dy) : L.moveTo(px + dx, py + dy))); L.closePath(); };
    L.globalAlpha = 0.3; L.fillStyle = look.soot; path(1.6, 1.6); L.fill();
    L.globalAlpha = 0.9; L.fillStyle = col; path(0, 0); L.fill();
    L.globalAlpha = 0.55; L.strokeStyle = look.soot; L.lineWidth = 0.9; L.stroke();
    L.globalAlpha = 0.4; L.strokeStyle = look.bleach; L.lineWidth = 0.8;
    L.beginPath(); L.moveTo(pts[0][0] - 0.3, pts[0][1] - 0.3); L.lineTo(pts[n - 1][0] - 0.3, pts[n - 1][1] - 0.3); L.lineTo(pts[n - 2][0] - 0.3, pts[n - 2][1] - 0.3); L.stroke();
    L.globalAlpha = 1;
  };

  // ================= the rock pass =================
  reset();
  const rockBlotches = nRock(PER_M.rockBlotch) * mix.blotch;
  for (let i = 0; i < rockBlotches; i++) {
    const p = spot(false);
    if (!p) continue;
    const kind = rnd();
    blob(p[0], p[1], 40 + rnd() * 110, kind < 0.5 ? look.soot : kind < 0.8 ? look.bleach : look.rust, (kind < 0.5 ? 0.15 : 0.12) * mix.haze, 0.6 + rnd() * 0.4, rnd() * TAU);
  }
  // Erosion flecks: pits and chips in the stone.
  for (let i = 0, n = nRock(PER_M.fleck); i < n; i++) {
    const p = spot(false);
    if (!p) continue;
    L.globalAlpha = 0.3 + rnd() * 0.2;
    L.fillStyle = rnd() < 0.7 ? look.soot : look.bleach;
    L.fillRect(p[0], p[1], 1.6 + rnd() * 2, 1.6 + rnd());
  }
  L.globalAlpha = 1;
  cracks(Math.round(nRock(PER_M.rockCrack) * (dungeon ? 1.4 : 1) * mix.crack), false, false, look.crack, look.bleach, 1.4);
  for (let i = 0, n = nRock(8) * mix.stain; i < n; i++) {
    const p = spot(false);
    if (p) stain(p[0], p[1], rnd() < 0.5 ? 0.5 : 0.9);
  }
  // Weathering streaks down a cliff face (a rock texel with open ground a half tile below it).
  for (let i = 0, n = nRock(PER_M.streak); i < n; i++) {
    const p = spot(false);
    if (!p || rockAt(p[0], p[1] + T * 0.55)) continue;
    const len = 8 + rnd() * 22;
    stroke([[p[0], p[1] - len], [p[0] + (rnd() - 0.5) * 3, p[1]]], look.soot, 0.2, 1.6 + rnd() * 1.6);
  }
  land(true);

  // ================= the ground pass =================
  reset();
  // Big tonal blotches: sun-bleached, soot-dark, other ground.
  for (let i = 0, n = nGround(PER_M.blotch, mix.blotch); i < n; i++) {
    const p = spot(true);
    if (!p) continue;
    const kind = rnd(), r = 60 + rnd() * 170;
    if (kind < 0.4) blob(p[0], p[1], r, look.bleach, 0.13 * mix.haze, 0.55 + rnd() * 0.45, rnd() * TAU);
    else if (kind < 0.75) blob(p[0], p[1], r, look.soot, 0.12 * mix.haze, 0.55 + rnd() * 0.45, rnd() * TAU);
    else blob(p[0], p[1], r * 0.7, rnd() < 0.5 ? look.patchA : look.patchB, 0.14 * mix.haze, 0.6 + rnd() * 0.4, rnd() * TAU);
  }
  // Patches of other ground (gravel, packed earth), speckled.
  for (let i = 0, n = nGround(PER_M.patch, mix.patch * (dungeon ? 0.5 : 1)); i < n; i++) {
    const p = spot(true);
    if (!p) continue;
    const r = 28 + rnd() * 70, col = rnd() < 0.5 ? look.patchA : look.patchB, rot = rnd() * TAU, sq = 0.55 + rnd() * 0.45;
    blob(p[0], p[1], r, col, 0.3, sq, rot, 2);
    for (let j = 0, dots = Math.round(r * 1.4); j < dots; j++) {
      const a = rnd() * TAU, q = Math.sqrt(rnd()) * r * 0.8;
      const dx = Math.cos(a) * q, dy = Math.sin(a) * q * sq;
      L.globalAlpha = 0.4;
      L.fillStyle = rnd() < 0.5 ? look.soot : look.bleach;
      L.fillRect(p[0] + dx * Math.cos(rot) - dy * Math.sin(rot), p[1] + dx * Math.sin(rot) + dy * Math.cos(rot), 1.6, 1.6);
    }
    L.globalAlpha = 1;
  }
  if (dungeon) {
    // Grime at the wall bases: the rock mask blurred out over the floor, in soot, then spots of it where the wall meets the floor.
    const g = layerCanvas(W, H), gc = g.getContext('2d')!;
    if ('filter' in gc) gc.filter = `blur(${Math.round(7 / k)}px)`;
    gc.drawImage(mask, 0, 0);
    gc.filter = 'none';
    gc.globalCompositeOperation = 'source-in';
    gc.fillStyle = look.soot;
    gc.fillRect(0, 0, W, H);
    L.save();
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalAlpha = 0.9;
    L.drawImage(g, 0, 0);
    L.restore();
    for (let i = 0, n = nGround(120); i < n; i++) {
      const p = spot(true);
      if (!p || !(rockAt(p[0] - 9, p[1]) || rockAt(p[0] + 9, p[1]) || rockAt(p[0], p[1] - 9) || rockAt(p[0], p[1] + 9))) continue;
      blob(p[0], p[1], 12 + rnd() * 22, look.soot, 0.2, 0.7, rnd() * TAU, 2);
    }
    // Water stains: dark patches with a pale tide line.
    for (let i = 0, n = nGround(PER_M.stain, 3); i < n; i++) {
      const p = spot(true);
      if (!p) continue;
      const r = 14 + rnd() * 34;
      blob(p[0], p[1], r, look.oil, 0.22, 0.7 + rnd() * 0.3, rnd() * TAU, 2);
      L.globalAlpha = 0.2; L.strokeStyle = look.bleach; L.lineWidth = 1.2;
      L.beginPath(); L.ellipse(p[0], p[1], r * 1.02, r * 0.78, rnd() * TAU, 0.2, 3.2); L.stroke();
      L.globalAlpha = 1;
    }
  }
  // Worn paths from the lift to some ruins and seeps (a straight line with a clear way), the ruts along some of them.
  const goals: P[] = dungeon ? [] : [...m.ruins, ...m.seeps].map((s) => [s.x * T, s.y * T] as P);
  const from: P = [m.lift.x * T, m.lift.y * T];
  const clearLine = (a: P, b: P) => {
    for (let i = 1; i < 12; i++) if (rockAt(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12)) return false;
    return true;
  };
  const picks = goals.filter((g) => Math.hypot(g[0] - from[0], g[1] - from[1]) > 160 && clearLine(from, g)).sort(() => rnd() - 0.5).slice(0, 4);
  for (const g of picks) {
    const dist = Math.hypot(g[0] - from[0], g[1] - from[1]), n = Math.max(3, Math.ceil(dist / 70)), pts: P[] = [from];
    const nx = -(g[1] - from[1]) / dist, ny = (g[0] - from[0]) / dist;
    for (let i = 1; i < n; i++) {
      const t = i / n, j = (rnd() - 0.5) * 60;
      pts.push([from[0] + (g[0] - from[0]) * t + nx * j, from[1] + (g[1] - from[1]) * t + ny * j]);
    }
    pts.push(g);
    // Corners cut three times: a bend, not a kink; then walked at about 12 px for the ruts.
    let smooth = pts;
    for (let it = 0; it < 3; it++) {
      const next: P[] = [smooth[0]];
      for (let i = 0; i < smooth.length - 1; i++) {
        const a = smooth[i], b = smooth[i + 1];
        next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      next.push(smooth[smooth.length - 1]);
      smooth = next;
    }
    stroke(smooth, look.path, 0.06, 26);
    stroke(smooth, look.path, 0.07, 14);
    if (rnd() < 0.6) ruts(smooth, rnd() < 0.5);
  }
  // Loose ruts, and drag marks that end where the thing was left.
  if (!dungeon) {
    for (let i = 0, n = nGround(PER_M.rut, mix.rut); i < n; i++) {
      const p = spot(true);
      if (p) ruts(trail(p[0], p[1], rnd() * TAU, 20 + Math.floor(rnd() * 40), 12), rnd() < 0.5);
    }
  }
  for (let i = 0, n = nGround(PER_M.drag, dungeon ? 0.5 : 1); i < n; i++) {
    const p = spot(true);
    if (!p) continue;
    const pts = trail(p[0], p[1], rnd() * TAU, 8 + Math.floor(rnd() * 16), 10);
    if (pts.length < 4) continue;
    stroke(pts, look.soot, 0.14, 7);
    stroke(pts, look.soot, 0.2, 1.2, 0, -3.4);
    stroke(pts, look.soot, 0.2, 1.2, 0, 3.4);
    const e = pts[pts.length - 1];
    for (let j = 0; j < 4; j++) junk(e[0] + (rnd() - 0.5) * 14, e[1] + (rnd() - 0.5) * 14);
  }
  // Cracks: cracked tiles in a dungeon, fissures elsewhere.
  cracks(nGround(PER_M.crack, mix.crack * (dungeon ? 3 : 1)), true, tiled, look.crack, look.bleach, dungeon ? 1.5 : 1);
  // Stains (a dungeon has its water stains above).
  if (!dungeon) for (let i = 0, n = nGround(PER_M.stain, mix.stain); i < n; i++) {
    const p = spot(true);
    if (p) stain(p[0], p[1], rnd());
  }
  if (paint === 'city' && !dungeon) {
    const FADED = '#c8a850', WHITE = '#d8d8d0';
    // Faded road paint on the asphalt: a lane's dashes, a crosswalk's stripes; part of each worn away.
    for (let i = 0, n = nGround(PER_M.lane, 1); i < n; i++) {
      const p = onTiles([Ter.Sand], 20);
      if (!p) continue;
      const horiz = rnd() < 0.5, cross = rnd() < 0.35;
      for (let j = 0, cnt = cross ? 6 : 5 + Math.floor(rnd() * 5); j < cnt; j++) {
        if (rnd() < 0.22) continue;
        const o = j * (cross ? 10 : 46), dx = horiz ? o : 0, dy = horiz ? 0 : o;
        const x = p[0] + dx, y = p[1] + dy, hx = cross ? (horiz ? 0 : 26) : horiz ? 30 : 0, hy = cross ? (horiz ? 26 : 0) : horiz ? 0 : 30;
        if (rockAt(x, y) || rockAt(x + hx, y + hy) || tileAt(x, y) !== Ter.Sand || tileAt(x + hx, y + hy) !== Ter.Sand) continue;
        stroke([[x, y], [x + hx * (0.5 + rnd() * 0.5), y + hy * (0.5 + rnd() * 0.5)]], cross ? WHITE : FADED, 0.14 + rnd() * 0.2, cross ? 5 : 3.4);
      }
    }
    // Potholes: a dark bowl, the lit rim at the lower right, chips of road round it.
    for (let i = 0, n = nGround(PER_M.pothole, 1); i < n; i++) {
      const p = onTiles([Ter.Sand, Ter.Hardpan], 16);
      if (!p) continue;
      const r = 8 + rnd() * 9, sq = 0.65 + rnd() * 0.3, rot = rnd() * TAU;
      blob(p[0], p[1], r * 1.5, look.soot, 0.14, sq, rot, 1);
      blob(p[0], p[1], r, look.soot, 0.55, sq, rot, 1);
      blob(p[0] - 1.2, p[1] - 1.2, r * 0.6, '#000000', 0.3, sq, rot, 1);
      L.globalAlpha = 0.4; L.strokeStyle = look.bleach; L.lineWidth = 1.5;
      L.beginPath(); L.ellipse(p[0], p[1], r, r * sq, rot, -0.3, 1.7); L.stroke();
      L.globalAlpha = 1;
      for (let j = 0; j < 5; j++) { const a = rnd() * TAU, q = r * (1.3 + rnd() * 0.7); stone(p[0] + Math.cos(a) * q, p[1] + Math.sin(a) * q, 1.4 + rnd() * 1.6, look.patchB); }
    }
    // Manhole covers: an iron disc in a worn ring, crossed with ribs.
    for (let i = 0, n = nGround(PER_M.manhole, 1); i < n; i++) {
      const p = onTiles([Ter.Sand, Ter.Hardpan], 14);
      if (!p) continue;
      const r = 8.5;
      L.globalAlpha = 0.7; L.fillStyle = look.soot; L.beginPath(); L.arc(p[0], p[1], r + 1.6, 0, TAU); L.fill();
      L.globalAlpha = 0.9; L.fillStyle = look.metal; L.beginPath(); L.arc(p[0], p[1], r, 0, TAU); L.fill();
      L.globalAlpha = 0.5; L.fillStyle = look.rust; L.beginPath(); L.arc(p[0] + 2, p[1] + 2, r * 0.6, 0, TAU); L.fill();
      L.globalAlpha = 0.6; L.strokeStyle = look.soot; L.lineWidth = 1;
      L.beginPath(); L.moveTo(p[0] - r, p[1]); L.lineTo(p[0] + r, p[1]); L.moveTo(p[0], p[1] - r); L.lineTo(p[0], p[1] + r); L.moveTo(p[0] - r * 0.6, p[1] - r * 0.6); L.lineTo(p[0] + r * 0.6, p[1] + r * 0.6); L.moveTo(p[0] + r * 0.6, p[1] - r * 0.6); L.lineTo(p[0] - r * 0.6, p[1] + r * 0.6); L.stroke();
      L.globalAlpha = 0.5; L.strokeStyle = look.bleach; L.lineWidth = 1.2;
      L.beginPath(); L.arc(p[0], p[1], r - 0.6, Math.PI * 1.05, Math.PI * 1.55); L.stroke();
      L.globalAlpha = 1;
    }
  }
  if (dungeon) {
    // Rubble in the corners: stones heaped where two walls meet.
    for (let tries = 0, got = 0, want = nGround(90); tries < 20000 && got < want; tries++) {
      const p = spot(true, 4);
      if (!p) continue;
      const hx = rockAt(p[0] - 12, p[1]) ? -1 : rockAt(p[0] + 12, p[1]) ? 1 : 0, hy = rockAt(p[0], p[1] - 12) ? -1 : rockAt(p[0], p[1] + 12) ? 1 : 0;
      if (!hx || !hy) continue;
      got++;
      const cx = p[0] + hx * 6, cy = p[1] + hy * 6;
      for (let j = 0, cnt = 5 + Math.floor(rnd() * 5); j < cnt; j++) stone(cx + (rnd() - 0.5) * 20 - hx * rnd() * 4, cy + (rnd() - 0.5) * 20 - hy * rnd() * 4, 2 + rnd() * 3.5, rnd() < 0.5 ? look.patchB : look.patchA);
    }
  }
  // Small debris: spills (a crate came apart) and lone pieces.
  for (let i = 0, n = nGround(PER_M.spill, mix.junk * (dungeon ? 2 : 1)); i < n; i++) {
    const p = spot(true);
    if (!p) continue;
    const r = 24 + rnd() * 36;
    for (let j = 0, cnt = 6 + Math.floor(rnd() * 8); j < cnt; j++) {
      const a = rnd() * TAU, q = Math.sqrt(rnd()) * r;
      if (!rockAt(p[0] + Math.cos(a) * q, p[1] + Math.sin(a) * q)) junk(p[0] + Math.cos(a) * q, p[1] + Math.sin(a) * q);
    }
  }
  for (let i = 0, n = nGround(PER_M.junk, mix.junk * (dungeon ? 2 : 1)); i < n; i++) {
    const p = spot(true);
    if (p) junk(p[0], p[1]);
  }
  // Danger sites (hives, the dungeon entrance, arenas, rescue sites...): much heavier wear, over everything above.
  paintDanger({ L, rnd, look, rockAt, blob, stroke, trail }, dangerSites(m));
  land(false);
}

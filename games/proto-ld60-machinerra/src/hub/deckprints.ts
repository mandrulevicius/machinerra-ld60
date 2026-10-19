/**
 * The crew's prints on the deck (P58 G), plain TS: you never see the NPCs walk, the prints say they did. Each NPC aboard has one
 * habitual errand, there and back by two different ways (Minos: "where they went, and where they got back. doesnt have to be
 * shortest route"), each with its own character (`ERRANDS`, from the plan's hints: the Planner detours past every lot and stops at
 * the window, the Expeditioner paces the lift's rim, Hob stamps hard and stops at his kettle, the Kicker goes in straight kicks
 * with long gaps, Sprocket pauses at every robot by the lift, the Oracle circles the altar, the Trader wanders to the lift and back
 * the long way, counting; Dr. Gasket meets the lift and comes back past the bench, a guess). Prints are black.
 *
 * The ways are found on a coarse grid of the deck (`route`: breadth first, then pulled straight where the floor allows), so a
 * trail never crosses open air. Each trip lays the errand again a little apart (`errandPrints`), so trips that pile up while she
 * is gone wear into paths. Also used for her rounds (`walk`). Add an errand: an `ERRANDS` row.
 */
import { rng, type Rng } from '../../../../harness/kit/rng';
import { Strider } from '../../../../harness/kit/world/logic';
import { ALTAR, ARRIVE, BENCH, DECK, LEVER, ROOMS, TABLE, WINDOW } from './layout';
import type { Stamp } from './princess';

export interface Pt { x: number; y: number; pause?: boolean }
export type Floor = (x: number, y: number) => boolean;

/** The grid the ways are found on (px a cell), and the step the straight-line check samples the floor at. */
const GRID = { cell: 20, los: 6, search: 8 };

/** Can (a) see (b) along the floor. */
const clear = (a: Pt, b: Pt, floor: Floor) => {
  const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / GRID.los));
  for (let i = 1; i < n; i++) if (!floor(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false;
  return true;
};

/** A floor looked up from a grid of `cell` px made once (the deck's own test is slow: thousands of prints ask it). */
export function fastFloor(floor: Floor, cell = 8): Floor {
  const W = Math.ceil(DECK.w / cell), H = Math.ceil(DECK.h / cell);
  const ok = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) ok[j * W + i] = floor((i + 0.5) * cell, (j + 0.5) * cell) ? 1 : 0;
  return (x, y) => {
    const i = Math.floor(x / cell), j = Math.floor(y / cell);
    return i >= 0 && j >= 0 && i < W && j < H && ok[j * W + i] === 1;
  };
}

/** The floor as grid cells (1 floor, 2 not), made once per floor function. */
const grids = new WeakMap<Floor, Uint8Array>();
function gridOf(floor: Floor, W: number, H: number) {
  let ok = grids.get(floor);
  if (ok) return ok;
  const C = GRID.cell;
  ok = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) ok[j * W + i] = floor((i + 0.5) * C, (j + 0.5) * C) ? 1 : 2;
  grids.set(floor, ok);
  return ok;
}

/** A way from (a) to (b) over the floor: the grid's shortest, pulled straight. (a) or (b) off the floor go from the nearest floor cell; no way at all: the straight line. */
export function route(a: Pt, b: Pt, floor: Floor): Pt[] {
  if (clear(a, b, floor) && floor(a.x, a.y) && floor(b.x, b.y)) return [a, b];
  const C = GRID.cell, W = Math.ceil(DECK.w / C), H = Math.ceil(DECK.h / C);
  const ok = gridOf(floor, W, H);
  const near = (p: Pt) => {
    const ci = Math.floor(p.x / C), cj = Math.floor(p.y / C);
    for (let r = 0; r <= GRID.search; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i >= 0 && j >= 0 && i < W && j < H && ok[j * W + i] === 1) return j * W + i;
        }
    return -1;
  };
  const s = near(a), t = near(b);
  if (s < 0 || t < 0) return [a, b];
  const from = new Int32Array(W * H).fill(-1);
  from[s] = s;
  const q = [s];
  for (let k = 0; k < q.length && from[t] < 0; k++) {
    const c = q[k], ci = c % W, cj = (c - ci) / W;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const n = j * W + i;
        if (ok[n] !== 1 || from[n] >= 0) continue;
        if (di && dj && (ok[cj * W + i] !== 1 || ok[j * W + ci] !== 1)) continue; // no corner cutting
        from[n] = c;
        q.push(n);
      }
  }
  if (from[t] < 0) return [a, b];
  const cells: Pt[] = [];
  for (let c = t; ; c = from[c]) {
    cells.push({ x: ((c % W) + 0.5) * C, y: (Math.floor(c / W) + 0.5) * C });
    if (c === s) break;
  }
  cells.reverse();
  const pts = [floor(a.x, a.y) ? a : cells[0], ...cells.slice(1, -1), floor(b.x, b.y) ? b : cells[cells.length - 1]];
  // Pull it straight: from each point, on to the farthest one in plain sight.
  const out: Pt[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(pts[i], pts[j], floor)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/** A walk through waypoints (each leg routed); a waypoint's `pause` stays on the point it marks. */
export function walk(points: Pt[], floor: Floor): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const leg = route(points[i], points[i + 1], floor);
    out.push(...(i === 0 ? leg : leg.slice(1)));
    if (points[i + 1].pause) out[out.length - 1] = { ...out[out.length - 1], pause: true };
  }
  return out.length ? out : points.slice();
}

/** How a walker prints: stride and gap (px), size and opacity of a print; the Kicker's kicks (prints on, prints off), the Trader's wander and count (a stop every n prints). */
export interface Gait { stride: number; gap: number; scale: number; alpha: number; kicks?: [number, number]; wobble?: { amp: number; wave: number }; count?: number }
export const GAIT: Gait = { stride: 24, gap: 11, scale: 0.44, alpha: 0.36 };
/** The crew's prints are black (Minos). */
export const CREW_INK = 0x141210;

/** One NPC's errand: the way out and the way back (waypoints), how they walk. */
export interface Errand { out: Pt[]; back: Pt[]; gait: Gait; loop?: boolean }
/** Where the errands go: the NPC's own spot, the built lots' fronts, Hob's kettle, how many robots the workshop keeps. */
export interface DeckCtx { floor: Floor; spot: (id: string) => Pt | null; lots: Pt[]; kettle: Pt | null; robots: number }

const at = (x: number, y: number, pause = false): Pt => ({ x, y, ...(pause && { pause }) });
const LIFT = ROOMS.find((r) => r.id === 'lift')!;
/** The window's sill inside the colony manager, the altar's step, the bench's front, the table's sides. */
const SILL = at(WINDOW.x - 60, WINDOW.y);
const STEP = at(ALTAR.x, ALTAR.y + 110);
const BENCH_FRONT = at(BENCH.x, BENCH.y + 80);
const SIDE = { w: at(TABLE.x - 175, TABLE.y + 30), e: at(TABLE.x + 175, TABLE.y + 30), n: at(TABLE.x, TABLE.y - 150), s: at(TABLE.x, TABLE.y + 165) };

/**
 * The errands (P58 G's hints; the routes are the agent's guesses). `s` is where the NPC stands. An NPC aboard with no row walks to
 * the course table and back.
 */
export const ERRANDS: Record<string, (s: Pt, c: DeckCtx) => Errand> = {
  // The Planner detours past every lot and stops at the window; comes back past the table.
  cityPlanner: (s, c) => ({
    out: [s, ...[...c.lots].sort((a, b) => Math.atan2(a.y - TABLE.y, a.x - TABLE.x) - Math.atan2(b.y - TABLE.y, b.x - TABLE.x)), { ...SILL, pause: true }],
    back: [SILL, SIDE.s, s],
    gait: { ...GAIT, stride: 22 },
  }),
  // The Expeditioner goes to the lift and paces its rim; comes back round the table's north side.
  expeditioner: (s) => {
    const rim = (a: number) => at(ARRIVE.x + Math.cos(a) * 78, ARRIVE.y + Math.sin(a) * 52);
    const pace = [0.2, 1.4, 2.6, 1.4, 0.2, 1.4, 2.6].map((a) => rim(a));
    return { out: [s, SIDE.w, ...pace], back: [pace[pace.length - 1], SIDE.n, s], gait: { ...GAIT, stride: 28 } };
  },
  // Hob stamps hard to the bench and the lift's lever, comes back the other way and stops at his kettle.
  hob: (s, c) => ({ out: [s, BENCH_FRONT, at(LEVER.x + 30, LEVER.y + 60)], back: [at(LEVER.x + 30, LEVER.y + 60), SIDE.s, s, { ...(c.kettle ?? at(s.x + 34, s.y)), pause: true }], gait: { ...GAIT, stride: 21, scale: 0.52, alpha: 0.62 } }),
  // The Kicker: straight kicks with long gaps, to the lift by the table's west side, back by its south.
  kicker: (s) => ({ out: [s, SIDE.w, at(ARRIVE.x + 40, ARRIVE.y - 20)], back: [at(ARRIVE.x + 40, ARRIVE.y - 20), SIDE.s, s], gait: { ...GAIT, stride: 30, kicks: [2, 3] } }),
  // Sprocket pauses at the bench, then at every robot standing by the lift; comes back past the table.
  sprocket: (s, c) => {
    const n = Math.max(1, Math.min(6, c.robots));
    const row = Array.from({ length: n }, (_, i) => at(LIFT.x + LIFT.w - 56, LIFT.y + 120 + i * 48, true));
    return { out: [s, { ...BENCH_FRONT, pause: true }, ...row], back: [row[row.length - 1], SIDE.s, s], gait: { ...GAIT, stride: 20, scale: 0.38 } };
  },
  // The Oracle circles the altar: once and a quarter round, then back the other way to her throne.
  highPriest: (s) => {
    const o = { x: ALTAR.x, y: ALTAR.y + 95 }, ring = (a: number) => at(o.x + Math.cos(a) * 105, o.y + Math.sin(a) * 58);
    const out = Array.from({ length: 21 }, (_, i) => ring(-Math.PI / 2 + (i / 16) * Math.PI * 2));
    const back = Array.from({ length: 9 }, (_, i) => ring(-Math.PI / 2 + (20 / 16) * Math.PI * 2 - (i / 16) * Math.PI * 2));
    return { out: [s, ...out], back: [...back, s], gait: { ...GAIT, stride: 22, scale: 0.4 }, loop: true };
  },
  // The Trader wanders to the lift, counting as she goes; comes back the long way, through the workshop and round by the church.
  trader: (s) => ({
    out: [s, SIDE.s, at(ARRIVE.x + 50, ARRIVE.y + 40)],
    back: [at(ARRIVE.x + 50, ARRIVE.y + 40), SIDE.n, BENCH_FRONT, SIDE.n, SIDE.e, STEP, s],
    gait: { ...GAIT, wobble: { amp: 14, wave: 150 }, count: 9 },
  }),
  // Dr. Gasket meets the lift (who came up limping), and comes back past the bench (a guess).
  gasket: (s) => ({ out: [s, SIDE.s, { ...at(ARRIVE.x + 60, ARRIVE.y - 10), pause: true }], back: [at(ARRIVE.x + 60, ARRIVE.y - 10), SIDE.n, BENCH_FRONT, s], gait: { ...GAIT } }),
};
const DEFAULT = (s: Pt): Errand => ({ out: [s, SIDE.s], back: [SIDE.s, SIDE.e, s], gait: GAIT });

/** A standing pair (a stop): both feet side by side, facing `h` (radians). */
const stand = (p: Pt, h: number, g: Gait, jit: () => number): Stamp[] =>
  [-1, 1].map((side) => ({ x: p.x + Math.cos(h + Math.PI / 2) * side * g.gap * 0.6 + jit(), y: p.y + Math.sin(h + Math.PI / 2) * side * g.gap * 0.6 + jit(), a: (h * 180) / Math.PI + 90 + jit() * 3, tint: CREW_INK, alpha: g.alpha, scale: g.scale }));

/** Prints along a walk with a gait: a stride's alternate feet, the stops, the kicks' gaps, the wander. `r` shifts the trip a little. */
export function printsAlong(path: Pt[], g: Gait, floor: Floor, r: Rng, tint = CREW_INK): Stamp[] {
  const out: Stamp[] = [];
  const shift = { x: r.range(-6, 6), y: r.range(-6, 6) };
  const jit = () => r.range(-1.5, 1.5);
  const strider = new Strider(g.stride, g.gap);
  let walked = 0, n = 0, last = 0;
  const put = (x: number, y: number, h: number, side: number) => {
    n++;
    if (g.kicks && (n - 1) % (g.kicks[0] + g.kicks[1]) >= g.kicks[0]) return; // airborne: a long kick between landings
    if (!floor(x, y)) return;
    out.push({ x: x + jit(), y: y + jit(), a: (h * 180) / Math.PI + 90 + jit() * 4, tint, alpha: g.alpha, scale: g.scale });
    if (g.count && n % g.count === 0) out.push(...stand({ x, y }, h + side * 0.4, g, jit)); // stops to count
  };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(d / 4));
    const h = Math.atan2(b.y - a.y, b.x - a.x);
    for (let k = 1; k <= steps; k++) {
      let x = a.x + ((b.x - a.x) * k) / steps + shift.x, y = a.y + ((b.y - a.y) * k) / steps + shift.y;
      walked += d / steps;
      if (g.wobble) {
        const w = Math.sin((walked / g.wobble.wave) * Math.PI * 2) * g.wobble.amp;
        const wx = x + Math.cos(h + Math.PI / 2) * w, wy = y + Math.sin(h + Math.PI / 2) * w;
        if (floor(wx, wy)) (x = wx), (y = wy);
      }
      const p = strider.step(x, y);
      if (p) put(p.x, p.y, p.heading, p.side);
      last = h;
    }
    if (b.pause && floor(b.x + shift.x, b.y + shift.y)) {
      out.push(...stand({ x: b.x + shift.x, y: b.y + shift.y }, last, g, jit));
      out.push(...stand({ x: b.x + shift.x, y: b.y + shift.y + 4 }, last + 0.9, g, jit)); // and turns, looking
    }
  }
  return out;
}

/** One NPC's errand, its two ways found once (`walk`), for every trip it was aboard. */
export function errandOf(id: string, c: DeckCtx): { out: Pt[]; back: Pt[]; gait: Gait } | null {
  const s = c.spot(id);
  if (!s) return null;
  const e = (ERRANDS[id] ?? DEFAULT)(s, c);
  const go = (pts: Pt[]) => (e.loop ? pts : walk(pts, c.floor));
  // The Oracle's ring is walked as drawn (it circles the altar, it does not look for a way); its ends join her throne by the floor.
  return { out: go(e.out), back: go(e.back), gait: e.gait };
}

/** The prints of every trip since the last sweep: each crew member's errand, out and back, a little apart each time. `skip` counts trips already laid elsewhere. */
export function tripPrints(trips: string[][], c: DeckCtx, first = 0): Stamp[] {
  const ways = new Map<string, ReturnType<typeof errandOf>>();
  const out: Stamp[] = [];
  trips.forEach((crew, t) => {
    for (const id of crew) {
      if (!ways.has(id)) ways.set(id, errandOf(id, c));
      const e = ways.get(id);
      if (!e) continue;
      const r = rng(`trip:${first + t}:${id}`);
      out.push(...printsAlong(e.out, e.gait, c.floor, r), ...printsAlong(e.back, e.gait, c.floor, r));
    }
  });
  return out;
}

/** The ways the crew wore (the dust's worn paths): every errand's out and back as walks. */
export function wornWays(crew: string[], c: DeckCtx): Pt[][] {
  return crew.flatMap((id) => {
    const e = errandOf(id, c);
    return e ? [e.out, e.back] : [];
  });
}

/**
 * The dust while she is gone (P58 D), by stage: 1 a film over the floor, 2 drifts along the rooms' walls and in their corners,
 * 3 thicker, with the crew's busiest ways worn through it. `lay` are soft blobs (the kit's `world-soft`, 64 px, at `scale`),
 * `wear` the points a soft brush wipes for the worn paths. Guesses, judged on the deck.
 */
export const DUST = { tint: 0x8f8b84, speck: 0x7a7266, grit: [0, 3, 6, 9], film: [0, 0.1, 0.17, 0.24], drift: [0, 0, 0.3, 0.45], step: 84, filmScale: 3.4, edge: 34, wear: { every: 24, scale: 0.95, alpha: 0.6 } };
export function dustOf(stage: number, floor: Floor, ways: Pt[][], r: Rng): { lay: Stamp[]; wear: Pt[] } {
  const lay: Stamp[] = [];
  if (stage <= 0) return { lay, wear: [] };
  const blob = (x: number, y: number, scale: number, alpha: number) => lay.push({ x, y, a: r.range(0, 360), tint: DUST.tint, alpha, scale });
  for (let y = DUST.step / 2; y < DECK.h; y += DUST.step)
    for (let x = DUST.step / 2; x < DECK.w; x += DUST.step) {
      const px = x + r.range(-20, 20), py = y + r.range(-20, 20);
      if (!floor(px, py)) continue;
      blob(px, py, DUST.filmScale * r.range(0.85, 1.15), DUST.film[stage] * r.range(0.7, 1.1));
      // Grit: small irregular specks, more with every stage, so it reads as dust and not as fog.
      for (let i = 0; i < DUST.grit[stage]; i++) {
        const gx = px + r.range(-DUST.step / 2, DUST.step / 2), gy = py + r.range(-DUST.step / 2, DUST.step / 2);
        if (floor(gx, gy)) lay.push({ x: gx, y: gy, a: r.range(0, 360), tint: DUST.speck, alpha: r.range(0.25, 0.5), scale: r.range(0.06, 0.16), speck: true });
      }
    }
  if (stage >= 2)
    for (const room of ROOMS) {
      const inset = 30, x0 = room.x + inset, x1 = room.x + room.w - inset, y0 = room.y + inset, y1 = room.y + room.h - inset;
      const edge = (ax: number, ay: number, bx: number, by: number) => {
        const n = Math.ceil(Math.hypot(bx - ax, by - ay) / DUST.edge);
        for (let i = 0; i <= n; i++) {
          const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
          if (floor(x, y) && r.chance(0.8)) blob(x, y, r.range(0.9, 1.7), DUST.drift[stage] * r.range(0.5, 1));
        }
      };
      edge(x0, y0, x1, y0);
      edge(x0, y1, x1, y1);
      edge(x0, y0, x0, y1);
      edge(x1, y0, x1, y1);
      for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) for (let i = 0; i < 4; i++) if (floor(cx, cy)) blob(cx + r.range(-14, 14), cy + r.range(-14, 14), r.range(1.4, 2.4), DUST.drift[stage]);
    }
  const wear: Pt[] = [];
  if (stage >= 3)
    for (const w of ways)
      for (let i = 0; i < w.length - 1; i++) {
        const a = w[i], b = w[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / DUST.wear.every));
        for (let k = 0; k <= n; k++) wear.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
      }
  return { lay, wear };
}

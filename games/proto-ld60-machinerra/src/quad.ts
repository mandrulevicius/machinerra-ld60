/**
 * Four-legged foes rigged (P7, plain TS, tests beside it; `legview.ts` draws it): the painting is cut into a body (the whole
 * drawing's own frame without its legs and head), a head on its neck, and four legs of a thigh and a shin each, so a walker's feet
 * follow its distance walked (the same footfalls as `foemotion.ts`), its poses can hold them (crouched for a pounce's wind-up,
 * stretched in the leap, braced for a ram, limp when fallen) and its head can bob and drop. The cut is `tools/mob-svg.cjs` from
 * `rigs.json` (Laimonas's own `limb()` legs, each split at its knee; the head cut off at its neck); everything the view needs of
 * it is derived here from the same file (`quad.test.ts` checks the boxes against the tool).
 *
 * The walk is a foot path, not a swing: each foot's target is planted (it moves back under the body at the body's own speed, so it
 * does not slide as far as the leg's reach allows) and then lifted and brought forward, and a two-bone solve (`solve`) bends the
 * knee to meet it, the way the drawing bends it. The body dips a little while it walks so the legs have the bend to reach with
 * (`dip`), and the legs lengthen as the body hops. The foot path's width is the stride, the footsteps' (`STEP.stride`) over the
 * kind's `cadence`: a short-legged or skittish foe takes shorter, quicker steps than its prints and sounds say, which is the one
 * place feet and prints disagree. A held pose is angles (`HoldDef`): a thigh's swing and a knee's flexion, blended in by `mix`.
 *
 * Add a kind: its cuts in `rigs.json` and the frames (the tool's header), a `QUADS` row (gait numbers and holds). Every number
 * is a first guess.
 */
import rigs from './rigs.json';
import { MOVE, type Tune } from './foemotion';
import { STEP, foeGait } from './footsteps';
import type { Enemy } from './sim/defs';

/** A frame of the rig: its drawing's box in game px (the frame adds a 2 px margin all round) and the pivot in that box. */
export interface Bone {
  frame: string;
  box: [number, number];
  pivot: [number, number];
}

export interface LegDef {
  thigh: Bone;
  shin: Bone;
  /** The hip in the body's drawing, and from it the knee and the foot as drawn (game px of the drawing, the kind's scale applied). */
  at: [number, number];
  knee: [number, number];
  foot: [number, number];
  /** The two bones' lengths. */
  upper: number;
  lower: number;
  /** Which side of the hip-to-foot line the knee is on at rest (the solve keeps it there), and the way the shin turns to fold more (the way it is turned from the thigh at rest). */
  side: 1 | -1;
  flex: 1 | -1;
  /** Drawn behind the body (the far side), a front leg, and its place in the trot: 0 or 1, diagonal pairs together. */
  far: boolean;
  front: boolean;
  phase: 0 | 1;
}

export interface HeadDef extends Bone {
  /** The neck in the body's drawing. */
  at: [number, number];
}

/** A pose the legs are held in, and what it does to the body. */
export type Hold = 'crouch' | 'leap' | 'brace' | 'flail' | 'limp';
export interface HoldDef {
  /** Rear and front legs: [thigh swing (rad, positive = the foot swung back), knee flexion (rad, positive folds the shin further, negative straightens it)]. */
  rear: [number, number];
  front: [number, number];
  /** The body sinks this many game px (the legs are bent under it). */
  drop: number;
  /** The head's nod (rad, positive = down, the horns forward). */
  head: number;
  /** The near front leg also paws: radians of swing, at `RIG.paw` Hz. */
  paw?: number;
}

/**
 * A kind's gait numbers. `cadence`: footfalls per footsteps' stride, more is shorter, quicker steps (skittish), less longer,
 * slower ones (heavy); `hop`: the body's hop as a multiple of its gait's (`MOVE.bounce`), springy above 1, heavy below.
 */
export interface GaitDef extends Tune {
  /** How high a foot lifts in its swing (game px of the drawing). */
  lift: number;
  /** The head's nod per px the body's hop leads it (rad). */
  nod: number;
}

export interface QuadDef {
  /** The whole painting (the fallback, and what a crowd's farthest show) and the body without legs and head: the same box. */
  whole: string;
  body: string;
  box: [number, number];
  head: HeadDef;
  /** The legs in the order of `rigs.json`. */
  legs: [LegDef, LegDef, LegDef, LegDef];
  gait: GaitDef;
  /** What the foot path comes to: the stride in px of the view, the foot's half travel and the body's dip while walking (game px of the drawing; the dip in px). */
  stride: number;
  reach: number;
  dip: number;
  /** The poses it holds; a kind that never holds one has none. */
  holds: Partial<Record<Hold, HoldDef>>;
}

/** Game px a drawing unit is on screen (`mobHeight`'s 1.15), and the body's sprite origin in its frame (`FoeView`'s grounded sprites). */
export const UNIT = 1.15;
export const ORIGIN = { x: 0.5, y: 0.92 };
/** The frame's margin round the drawing's box (the SVG's viewBox). */
export const MARGIN = 2;
/** How far the body may sink while walking, px, and the share of a leg's full length the solve may reach to. */
const DIP_MAX = 3;
const STRETCH = 0.97;

type Rigs = Record<string, { k?: number; head: { box: number[]; neck: number[] }; legs: { id: string; far: boolean; front: boolean; phase: 0 | 1; pts: number[][]; w: number }[] }>;
const RIGS = rigs as unknown as Rigs;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A bone's box and pivot, as the tool makes them (`boneBox`): the points' extent and a margin for the stroke, the pivot the first point. */
export function boneBox(pts: number[][], w: number, k = 1): { box: [number, number]; pivot: [number, number] } {
  const m = (w / 2 + 1.2) * k;
  const xs = pts.map((p) => p[0] * k), ys = pts.map((p) => p[1] * k);
  const x0 = Math.min(...xs) - m, y0 = Math.min(...ys) - m;
  return { box: [r1(Math.max(...xs) + m - x0), r1(Math.max(...ys) + m - y0)], pivot: [xs[0] - x0, ys[0] - y0] };
}

const ang = (x: number, y: number) => Math.atan2(y, x);
/** The turn from angle a to b, in (-pi, pi]. */
const turn = (a: number, b: number) => {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
};

function legsOf(kind: string): QuadDef['legs'] {
  const rig = RIGS[kind], k = rig.k ?? 1;
  return rig.legs.map((l) => {
    const [h, kn, f] = l.pts.map((p) => [p[0] * k, p[1] * k] as [number, number]);
    const knee: [number, number] = [kn[0] - h[0], kn[1] - h[1]], foot: [number, number] = [f[0] - h[0], f[1] - h[1]];
    const shin: [number, number] = [f[0] - kn[0], f[1] - kn[1]];
    const t = boneBox([l.pts[0], l.pts[1]], l.w, k), s = boneBox([l.pts[1], l.pts[2]], l.w, k);
    return {
      thigh: { frame: `foe/${kind}-leg-${l.id}-thigh`, ...t },
      shin: { frame: `foe/${kind}-leg-${l.id}-shin`, ...s },
      at: h, knee, foot,
      upper: Math.hypot(...knee), lower: Math.hypot(...shin),
      side: knee[0] * foot[1] - knee[1] * foot[0] > 0 ? -1 : 1,
      flex: turn(ang(...knee), ang(...shin)) >= 0 ? 1 : -1,
      far: l.far, front: l.front, phase: l.phase,
    } as LegDef;
  }) as QuadDef['legs'];
}

function headOf(kind: string): HeadDef {
  const { head, k = 1 } = RIGS[kind];
  const [x0, y0, x1, y1] = head.box;
  return { frame: `foe/${kind}-head`, box: [r1((x1 - x0) * k), r1((y1 - y0) * k)], pivot: [(head.neck[0] - x0) * k, (head.neck[1] - y0) * k], at: [head.neck[0] * k, head.neck[1] * k] };
}

/** The foot path a kind walks: the stride, how far the foot can travel either side of its rest, and how far the body sinks for the legs to reach (see the header). */
function path(legs: QuadDef['legs'], enemy: Enemy, g: GaitDef) {
  const gait = foeGait(enemy);
  if (gait === 'none') throw new Error(`${enemy} has no gait to rig`);
  const stride = STEP.stride[gait] / g.cadence;
  const want = stride / 2 / UNIT;
  const hopU = (MOVE.bounce[gait] * g.hop) / UNIT;
  // How far each leg reaches sideways at a given sink, and the sink that lets all of them take the wanted step.
  const reachAt = (l: LegDef, dip: number) => Math.sqrt(Math.max(0, (STRETCH * (l.upper + l.lower)) ** 2 - (l.foot[1] + hopU - dip) ** 2)) - Math.abs(l.foot[0]);
  const need = Math.max(0, ...legs.map((l) => l.foot[1] + hopU - Math.sqrt(Math.max(0, (STRETCH * (l.upper + l.lower)) ** 2 - (Math.abs(l.foot[0]) + want) ** 2))));
  const dipU = Math.min(need, DIP_MAX / UNIT);
  const reach = Math.max(0, Math.min(want, ...legs.map((l) => reachAt(l, dipU))));
  return { stride, reach, dip: dipU * UNIT };
}

function quad(enemy: Enemy, whole: string, box: [number, number], gait: GaitDef, holds: QuadDef['holds']): QuadDef {
  const legs = legsOf(whole.slice(4));
  return { whole, body: `${whole}-body`, box, head: headOf(whole.slice(4)), legs, gait, ...path(legs, enemy, gait), holds };
}

const SPRAWL: HoldDef = { rear: [0.85, 0.5], front: [-0.65, 0.5], drop: 1.5, head: 0.5 };
const FLAIL: { flail: HoldDef } = { flail: { rear: [0, 0], front: [0, 0], drop: 0, head: 0 } };

export const QUADS: Partial<Record<Enemy, QuadDef>> = {
  // The pounce-cat: a low, quiet walk; a crouch for its wind-up, the leap with its front legs reaching and its rear legs thrown back.
  cat: quad('cat', 'foe/cat', [46, 28], { cadence: 1.3, hop: 1, lift: 3.5, nod: 0.05 }, {
    crouch: { rear: [0.5, 0.9], front: [-0.3, 0.7], drop: 2.5, head: 0.35 },
    leap: { rear: [1.1, -0.2], front: [-1.1, -0.2], drop: 0, head: -0.25 },
    limp: SPRAWL, ...FLAIL,
  }),
  // The ramjet boar: it sets its legs and drops its head and paws before it rams, and holds them braced through the run.
  boar: quad('boar', 'foe/boar', [52, 34], { cadence: 1.6, hop: 0.8, lift: 2.5, nod: 0.06 }, {
    brace: { rear: [0.35, 0.3], front: [-0.4, 0.15], drop: 1, head: 0.5, paw: 0.35 },
    limp: SPRAWL, ...FLAIL,
  }),
  // The ram-goat: a springy trot, high-stepping, a big bounce; it tips its horns forward to charge.
  goat: quad('goat', 'foe/goat', [42, 36], { cadence: 1.8, hop: 1.8, lift: 5, nod: 0.07 }, {
    brace: { rear: [0.3, 0.4], front: [-0.35, 0.2], drop: 1.5, head: 0.55 },
    limp: SPRAWL, ...FLAIL,
  }),
  // The bleater: skittish, short quick steps, a small quick bounce; it has no wind-up.
  bleater: quad('bleater', 'foe/bleater', [28, 22], { cadence: 2, hop: 1.3, lift: 3, nod: 0.08 }, { limp: SPRAWL, ...FLAIL }),
  // The carousel charger: heavy, long slow steps, little bounce; it lowers its head and sets its legs to charge.
  charger: quad('charger', 'foe/charger', [58, 46], { cadence: 1.1, hop: 0.6, lift: 3, nod: 0.05 }, {
    brace: { rear: [0.3, 0.3], front: [-0.3, 0.1], drop: 1.5, head: 0.4, paw: 0.3 },
    limp: SPRAWL, ...FLAIL,
  }),
  // The cart crawler: small legs under a basket, quick steps; its handle ducks when it charges.
  cart: quad('cart', 'foe/cart', [40, 30], { cadence: 1.5, hop: 1, lift: 2, nod: 0.12 }, {
    brace: { rear: [0.3, 0.3], front: [-0.3, 0.3], drop: 1, head: 0.3 },
    limp: SPRAWL, ...FLAIL,
  }),
};

/** The rigged kind this foe is, if it is one. */
export const quadOf = (kind: Enemy): QuadDef | undefined => QUADS[kind];

/** Where a point of the drawing's box sits from the body sprite's origin (game px, facing right, y down). */
export function fromOrigin(q: QuadDef, x: number, y: number): [number, number] {
  const [w, h] = q.box;
  return [x - ORIGIN.x * (w + 2 * MARGIN) + MARGIN, y - ORIGIN.y * (h + 2 * MARGIN) + MARGIN];
}
/** A bone's sprite origin: its pivot as a fraction of its frame. */
export const pivotOrigin = (b: Bone): [number, number] => [(b.pivot[0] + MARGIN) / (b.box[0] + 2 * MARGIN), (b.pivot[1] + MARGIN) / (b.box[1] + 2 * MARGIN)];

/** The paw's rate (Hz), how fast a leg eases into a held pose (per second), how fast the walk fades in and out, the flail. */
export const RIG = { paw: 2.5, hold: 14, amp: 10, still: 8, pace: 30, flail: { rad: 0.9, flex: 0.6, hz: 3 } };

/**
 * Two bones to a foot target `(tx, ty)` from the hip (game px of the drawing, y down): the thigh's turn from its drawn angle and
 * the shin's turn from its drawn angle (rad, positive = clockwise on screen, a foot swung back). A target out of reach is brought to
 * the nearest the leg can make; the knee stays on the side it is drawn on. Writes into `out` and returns it.
 */
export function solve(l: LegDef, tx: number, ty: number, out: [number, number] = [0, 0]): [number, number] {
  const a = l.upper, b = l.lower;
  const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, Math.hypot(tx, ty)));
  const to = ang(tx, ty);
  const g = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
  // Knee side: the knee as drawn is on `side` of the hip-to-foot line (+1: its angle is greater, clockwise from the line).
  const t1 = to + l.side * g;
  const kx = a * Math.cos(t1), ky = a * Math.sin(t1);
  const px = d * Math.cos(to), py = d * Math.sin(to);
  const thigh = turn(ang(...l.knee), t1);
  const s2 = ang(px - kx, py - ky);
  const shin = turn(ang(l.foot[0] - l.knee[0], l.foot[1] - l.knee[1]), s2);
  out[0] = thigh;
  out[1] = turn(thigh, shin);
  return out;
}

/** Where the foot ends up from the hip for a thigh turn and a knee turn (the knee turn from the thigh's): the solve's check. */
export function footAt(l: LegDef, thigh: number, knee: number): [number, number] {
  const c1 = Math.cos(thigh), s1 = Math.sin(thigh), c2 = Math.cos(thigh + knee), s2 = Math.sin(thigh + knee);
  const sx = l.foot[0] - l.knee[0], sy = l.foot[1] - l.knee[1];
  return [l.knee[0] * c1 - l.knee[1] * s1 + sx * c2 - sy * s2, l.knee[0] * s1 + l.knee[1] * c1 + sx * s2 + sy * c2];
}

export interface QuadState {
  /** The walk's swing now, 0..1 (eased with the speed). */
  amp: number;
  /** 0 walking .. 1 held (eased). */
  mix: number;
  /** The pose it held last, which it eases out of when released. */
  last: Hold | null;
  /** Each leg's thigh turn and knee turn now (rad; the knee's from the thigh's), the head's nod (rad), its drop behind the body (px), and how far the body sinks (px). */
  thigh: [number, number, number, number];
  knee: [number, number, number, number];
  nod: number;
  late: number;
  drop: number;
}
export const newQuad = (): QuadState => ({ amp: 0, mix: 0, last: null, thigh: [0, 0, 0, 0], knee: [0, 0, 0, 0], nod: 0, late: 0, drop: 0 });

/** What a step reads of the foe: the footfalls walked (`Motion.walk`: a leg's cycle is two), its speed (px/s), the body's hop and the head's (`Motive`, px), the pose, a clock for the paw and the flail, a number of its own. */
export interface QuadIn {
  walk: number;
  speed: number;
  hop: number;
  late: number;
  hold: Hold | null;
  t: number;
  seed: number;
}

const tmp: [number, number] = [0, 0];

/** Advance the legs and head by dt seconds. */
export function stepQuad(q: QuadDef, st: QuadState, dt: number, o: QuadIn) {
  const want = Math.min(1, Math.max(0, (o.speed - RIG.still) / RIG.pace));
  st.amp += (want - st.amp) * Math.min(1, dt * RIG.amp);
  const hold = o.hold;
  if (hold && q.holds[hold]) st.last = hold;
  const held = hold && q.holds[hold] ? hold : st.last;
  const h = held ? q.holds[held] : undefined;
  st.mix += ((hold && h ? 1 : 0) - st.mix) * Math.min(1, dt * RIG.hold);
  if (st.mix < 0.001 && !hold) st.last = null;
  const amp = st.amp, g = q.gait;
  for (let i = 0; i < 4; i++) {
    const l = q.legs[i];
    // The foot path: planted, it moves back under the body as the body goes by; then it lifts and comes forward.
    const p = (((o.walk + l.phase) % 2) + 2) % 2;
    const swing = p < 1;
    const s = swing ? Math.cos(Math.PI * p) : 2 * p - 3;
    solve(l, l.foot[0] - q.reach * amp * s, l.foot[1] + o.hop / UNIT - (q.dip / UNIT) * amp - (swing ? g.lift * amp * Math.sin(Math.PI * p) : 0), tmp);
    let t = tmp[0], k = tmp[1];
    if (h) {
      let ht = (l.front ? h.front : h.rear)[0], hk = l.flex * (l.front ? h.front : h.rear)[1];
      if (held === 'flail') {
        const w = Math.sin(o.t * Math.PI * 2 * RIG.flail.hz + i * 1.7 + o.seed);
        ht = w * RIG.flail.rad;
        hk = l.flex * (0.5 + 0.5 * Math.sin(o.t * Math.PI * 2 * RIG.flail.hz + i * 1.7 + o.seed + 1.4)) * RIG.flail.flex;
      } else if (h.paw && l.front && !l.far) {
        const w = Math.sin(o.t * Math.PI * 2 * RIG.paw);
        ht += w * h.paw;
        hk += l.flex * (0.5 - 0.5 * w) * h.paw;
      }
      t += (ht - t) * st.mix;
      k += (hk - k) * st.mix;
    }
    st.thigh[i] = t;
    st.knee[i] = k;
  }
  // The head: held down or up by the pose, and it trails the body's hop by a beat, so it sags as the body rises and nods with the stride.
  const lag = o.hop - o.late;
  const flailNod = held === 'flail' ? Math.sin(o.t * Math.PI * 2 * RIG.flail.hz + o.seed) * 0.5 : 0;
  st.nod = (h ? (held === 'flail' ? flailNod : h.head) * st.mix : 0) + g.nod * lag;
  st.late = lag;
  st.drop = (h ? h.drop * st.mix : 0) + q.dip * amp * (1 - st.mix);
  return st;
}

/**
 * Arms with elbows on painted foes (P50, plain TS, tests beside it; `armview.ts` draws it): wherever a painting already has an arm
 * (the commuter's briefcase arm, the officer's baton arm, the spanner monkey's two, the mannequin's two) it is cut at the elbow
 * and hung from the shoulder the way P7's legs hang from the hip (`quad.ts`). The body is the painting without its arms; each arm
 * is an upper arm and a forearm with whatever the hand holds. The cut is `tools/mob-svg.cjs` from `arms.json`; everything the view
 * needs is derived here from the same file (`arms.test.ts` checks the boxes against the tool).
 *
 * The pose is joint angles from the drawn arm (radians, positive = clockwise on screen; a foe faces right, so a swing forward is
 * negative): walking, an arm swings against the leg on its side and the elbow curls with it; a wind-up draws the arm back and
 * cocks the forearm; the strike throws it forward, the elbow straightening; a twisted foe's arms keep the wrong rhythm (both swing
 * together, the elbows jitter); a flung foe's flail. The beats are the sim's own: a lunge's tell, a bolt about to go (`gunT`), a
 * blow about to land (`cd`), and the `sting` and `spit` events. A kind with no row here has no arms to move.
 * Add a kind: its cut in `arms.json` and the frames (the tool's header), the item in the tool's `ARM_ITEMS`, a `GAITS` row.
 * Painted foes (P50 preview): Laimonas's swarmer, drone and the Ironback and the shade's drawing are cut in pixels, not drawn in two
 * pieces (`tools/cut-painted-arms.py` from `armscut.json`, into art/foe/<kind>-body and -arm-*; his files are never edited). Their
 * rows (`PAINTED_ARMS`) are live unless `?v.paintedArms=plain` (the `paintedArms` slot; cut by default, Minos approved the cuts).
 * Every number is a first guess.
 */
import { slot } from '../../../harness/kit/variants';
import arms from './arms.json';
import cuts from './armscut.json';
import { MARGIN, ORIGIN, UNIT, type Bone } from './quad';
import type { Enemy } from './sim/defs';

export interface ArmDef {
  id: string;
  upper: Bone;
  lower: Bone;
  /** The shoulder in the body's drawing, and from it the elbow and the hand as drawn (game px of the drawing). */
  at: [number, number];
  elbow: [number, number];
  hand: [number, number];
  upperLen: number;
  lowerLen: number;
  /** Drawn behind the body, and its place in the walk's counter-swing (0 or 1). */
  far: boolean;
  phase: 0 | 1;
}

/** How a kind's arms move (radians; a pose is [upper turn, elbow turn from the upper]). */
export interface ArmGait {
  /** The walk's swing of the upper arm and the elbow's curl with it. */
  swing: number;
  curl: number;
  /** The wind-up (the arm drawn back, the forearm cocked) and the strike (thrown forward). */
  wind: [number, number];
  strike: [number, number];
  /** The arm that does the attack: the others follow at `follow` of it. */
  lead: string;
  follow: number;
}

export interface ArmsDef {
  /** The whole painting (the fallback, and what a crowd's farthest show) and the body without arms: the same box. */
  whole: string;
  body: string;
  box: [number, number];
  /** Where the body sprite's origin sits down its height: a ground foe 0.92 (`ORIGIN.y`), a flier 0.5 (`FoeView`). */
  oy: number;
  arms: ArmDef[];
  gait: ArmGait;
}

type Json = Record<string, { arms: { id: string; far: boolean; phase: 0 | 1; pts: number[][]; w: number; up: number[]; low: number[] }[] }>;
const JSON_ARMS = arms as unknown as Json;

/** A box [x0, y0, x1, y1] as the frame's box and the pivot (a point in the drawing) inside it. */
const bone = (frame: string, [x0, y0, x1, y1]: number[], [px, py]: number[]): Bone => ({ frame, box: [r1(x1 - x0), r1(y1 - y0)], pivot: [r1(px - x0), r1(py - y0)] });
const r1 = (v: number) => Math.round(v * 10) / 10;

function armsOf(kind: string): ArmDef[] {
  return JSON_ARMS[kind].arms.map((a) => {
    const [s, e, h] = a.pts;
    const elbow: [number, number] = [e[0] - s[0], e[1] - s[1]], hand: [number, number] = [h[0] - s[0], h[1] - s[1]];
    return {
      id: a.id,
      upper: bone(`foe/${kind}-arm-${a.id}-upper`, a.up, s),
      lower: bone(`foe/${kind}-arm-${a.id}-lower`, a.low, e),
      at: [s[0], s[1]], elbow, hand,
      upperLen: Math.hypot(...elbow), lowerLen: Math.hypot(h[0] - e[0], h[1] - e[1]),
      far: a.far, phase: a.phase,
    };
  });
}

function row(kind: string, box: [number, number], gait: ArmGait): ArmsDef {
  return { whole: `foe/${kind}`, body: `foe/${kind}-body`, box, oy: ORIGIN.y, arms: armsOf(kind), gait };
}

/** A painting's stored pixels (2x its game size, `sizes.json`) in the drawing's game px (the frame's margin is not in a drawing's own coordinates). */
const PX = 1 / (2 * UNIT);
const fromPx = (v: number) => v * PX - MARGIN;
type Cut = { src?: string; size: [number, number]; arms: { id: string; far: boolean; phase: 0 | 1; pts: number[][] }[] };
const CUTS = cuts as unknown as Record<string, Cut>;

/** A cut painting's row: every piece is the painting's whole canvas, so each bone's box is the body's and its pivot the joint in it. */
function painted(kind: string, ground: boolean, gait: ArmGait): ArmsDef {
  const c = CUTS[kind], base = c.src ?? kind;
  const box: [number, number] = [fromPx(c.size[0]), fromPx(c.size[1])];
  const whole = [0, 0, ...box];
  return {
    whole: `foe/${base}`, body: `foe/${base}-body`, box, oy: ground ? ORIGIN.y : 0.5, gait,
    arms: c.arms.map((a) => {
      const [s, e, h] = a.pts.map(([x, y]) => [fromPx(x), fromPx(y)]);
      const elbow: [number, number] = [e[0] - s[0], e[1] - s[1]], hand: [number, number] = [h[0] - s[0], h[1] - s[1]];
      return {
        id: a.id,
        upper: bone(`foe/${base}-arm-${a.id}-upper`, whole, s),
        lower: bone(`foe/${base}-arm-${a.id}-lower`, whole, e),
        at: [s[0], s[1]], elbow, hand,
        upperLen: Math.hypot(...elbow), lowerLen: Math.hypot(h[0] - e[0], h[1] - e[1]),
        far: a.far, phase: a.phase,
      };
    }),
  };
}

export const ARMS: Partial<Record<Enemy, ArmsDef>> = {
  // The commuter: a stiff walker, the briefcase arm swings and comes up for a blow.
  commuter: row('commuter', [26, 44], { swing: 0.35, curl: 0.25, wind: [0.7, -1], strike: [-1, -0.15], lead: 'near', follow: 0.4 }),
  // The officer: the baton arm; it raises the arm to level the taser and snaps it out.
  officer: row('officer', [28, 46], { swing: 0.3, curl: 0.25, wind: [0.5, -1.2], strike: [-0.9, -0.1], lead: 'near', follow: 0.4 }),
  // The spanner monkey: quick, loose arms; the raised arm cocks the spanner back and throws it.
  monkey: row('monkey', [30, 32], { swing: 0.5, curl: 0.4, wind: [0.9, -0.8], strike: [-1.1, -0.1], lead: 'raised', follow: 0.5 }),
  // The display model: stiff, long arms; both swing, the one with the tag leads.
  mannequin: row('mannequin', [22, 46], { swing: 0.22, curl: 0.12, wind: [0.6, -0.7], strike: [-0.9, -0.1], lead: 'right', follow: 0.7 }),
};

/**
 * The cut paintings (P50, on unless `?v.paintedArms=plain`): a swarmer's scythe arm, a drone's hook and cannon, the shade's two, the
 * Ironback's two forelegs. The gaits are a first guess: an arm is drawn hanging (the Ironback's, the shade's) or reaching out
 * (the swarmer's, the cannon), and its wind-up and strike are turns from there (negative: counter-clockwise, a forward swing for a
 * hanging arm and a raise for one reaching right).
 */
export const PAINTED_ARMS: Partial<Record<Enemy, ArmsDef>> = {
  // The swarmer: the scythe arm reaches out; it lifts the blades back and chops down.
  swarmer: painted('swarmer', false, { swing: 0.3, curl: 0.25, wind: [-0.5, -0.5], strike: [0.45, 0.5], lead: 'scythe', follow: 1 }),
  // The drone: the cannon arm kicks back as it fires; the hook arm sways.
  drone: painted('drone', true, { swing: 0.2, curl: 0.15, wind: [0.1, 0.25], strike: [-0.15, -0.3], lead: 'cannon', follow: 0.5 }),
  // The shade: long arms hang; they rise as it lunges and sweep forward.
  shade: painted('shade', true, { swing: 0.25, curl: 0.15, wind: [0.5, -0.4], strike: [-0.9, -0.2], lead: 'right', follow: 0.8 }),
  // The Ironback: its forelegs swing as it knuckle-walks, and rear up for the blow.
  gorilla: painted('gorilla', true, { swing: 0.3, curl: 0.1, wind: [0.5, -0.2], strike: [-0.7, 0.1], lead: 'near', follow: 0.6 }),
};

/** The painted foes' arms are cut by default (Minos: "cuts seem fine"); `?v.paintedArms=plain` shows Laimonas's uncut art. */
export const paintedArms = slot('paintedArms', { cut: 'cut', plain: 'plain' });

/** The arms this foe has, if its kind has any. */
export const armsOfKind = (kind: Enemy): ArmsDef | undefined => ARMS[kind] ?? (paintedArms.value === 'plain' ? undefined : PAINTED_ARMS[kind]);

/** Where a point of the drawing's box sits from the body sprite's origin (game px, facing right, y down): the kind's box, a ground sprite's origin. */
export function fromOrigin(box: [number, number], x: number, y: number, oy = ORIGIN.y): [number, number] {
  return [x - ORIGIN.x * (box[0] + 2 * MARGIN) + MARGIN, y - oy * (box[1] + 2 * MARGIN) + MARGIN];
}

/** How fast the swing fades in and out with the speed, and how quickly an arm eases into a pose, per second; a strike's seconds; a flail's rate (Hz) and size; a twisted foe's elbow jitter (rad, Hz). */
export const ARM_RIG = { amp: 10, pace: 30, still: 8, ease: 18, strike: 0.28, flail: { hz: 3, rad: 1 }, jitter: { rad: 0.18, hz: 11 } };

export interface ArmState {
  /** The walk's swing now (0..1, eased with the speed), how wound up (0..1) and how struck (0..1, decays). */
  amp: number;
  wind: number;
  strike: number;
  /** Each arm's upper turn and elbow turn now (rad). */
  upper: number[];
  elbow: number[];
}
export const newArms = (n: number): ArmState => ({ amp: 0, wind: 0, strike: 0, upper: new Array(n).fill(0), elbow: new Array(n).fill(0) });

/** What a step reads of the foe. */
export interface ArmIn {
  /** Footfalls walked (`Motion.walk`) and speed (px/s). */
  walk: number;
  speed: number;
  /** Winding up for a blow or a bolt now. */
  wind: boolean;
  /** A blow or a bolt just went (the `sting` or `spit` event): seconds ago it was, or -1. */
  struck: number;
  twisted: boolean;
  flung: boolean;
  /** A clock (s) and a number of its own. */
  t: number;
  seed: number;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Advance the arms by dt seconds. */
export function stepArms(def: ArmsDef, st: ArmState, dt: number, o: ArmIn) {
  const G = def.gait;
  const want = clamp01((o.speed - ARM_RIG.still) / ARM_RIG.pace);
  st.amp += (want - st.amp) * Math.min(1, dt * ARM_RIG.amp);
  st.wind += ((o.wind ? 1 : 0) - st.wind) * Math.min(1, dt * ARM_RIG.ease);
  st.strike = o.struck >= 0 ? clamp01(1 - o.struck / ARM_RIG.strike) : 0;
  def.arms.forEach((a, i) => {
    // Walking: against the leg on its side (a twisted foe's arms swing together, the wrong rhythm, a little faster).
    const p = Math.PI * (o.walk * (o.twisted ? 1.3 : 1) + (o.twisted ? 0 : a.phase));
    const sw = Math.sin(p);
    let up = -G.swing * st.amp * sw, el = -G.curl * st.amp * (0.5 + 0.5 * sw);
    // The attack: the lead arm wholly, the others as far as `follow`.
    const share = a.id === G.lead ? 1 : G.follow;
    up = lerp(up, G.wind[0], st.wind * share);
    el = lerp(el, G.wind[1], st.wind * share);
    if (st.strike > 0) {
      up = lerp(up, G.strike[0], st.strike * share);
      el = lerp(el, G.strike[1], st.strike * share);
    }
    if (o.twisted) el += ARM_RIG.jitter.rad * Math.sin(o.t * Math.PI * 2 * ARM_RIG.jitter.hz + o.seed + i * 2.1);
    if (o.flung) {
      up = Math.sin(o.t * Math.PI * 2 * ARM_RIG.flail.hz + i * 1.7 + o.seed) * ARM_RIG.flail.rad;
      el = -0.6 - 0.5 * Math.sin(o.t * Math.PI * 2 * ARM_RIG.flail.hz + i * 1.7 + o.seed + 1.4);
    }
    st.upper[i] += (up - st.upper[i]) * Math.min(1, dt * ARM_RIG.ease);
    st.elbow[i] += (el - st.elbow[i]) * Math.min(1, dt * ARM_RIG.ease);
  });
  return st;
}

/** Where the hand ends up from the shoulder for an upper turn and an elbow turn (the check the pose keeps its elbow). */
export function handAt(a: ArmDef, upper: number, elbow: number): [number, number] {
  const c1 = Math.cos(upper), s1 = Math.sin(upper), c2 = Math.cos(upper + elbow), s2 = Math.sin(upper + elbow);
  const hx = a.hand[0] - a.elbow[0], hy = a.hand[1] - a.elbow[1];
  return [a.elbow[0] * c1 - a.elbow[1] * s1 + hx * c2 - hy * s2, a.elbow[0] * s1 + a.elbow[1] * c1 + hx * s2 + hy * c2];
}

export { UNIT };

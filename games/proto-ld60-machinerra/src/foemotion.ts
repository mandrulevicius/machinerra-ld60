/**
 * How a foe's painting moves (P7, plain TS, tests beside it; `foeview.ts` applies it, `legview.ts` hangs legs on it). A walker's
 * body hops once per footfall (the stride is the footsteps' `STEP.stride` over the kind's `cadence`) and rocks a little from side to
 * side; a flier hovers (the view's bob); both lean into the way they go, eased, more in a rush. Every body breathes: a slow,
 * faint swell, fainter while it moves. A body with no legs to carry its motion (a flier, a ghost, a walker not yet rigged, `quad.ts`)
 * also stretches a little along its way (`stretchOf`); a rigged walker does not (its legs carry it), nor does a chain. Squash is left
 * to events (a hit, a dash, a kick: `Squash` in `playhost.ts`). Every number is a guess, tuned by eye.
 */
import { STEP, type Gait } from './footsteps';

/** What a view keeps per foe: distance walked in footfalls, and the eased lean (radians, into its way). */
export interface Motion {
  walk: number;
  lean: number;
}
export const newMotion = (): Motion => ({ walk: 0, lean: 0 });

export const MOVE = {
  /** The lean at a full pace (rad): a walker tips a little, a flier more; a rush leans `rush` times as far. */
  lean: { walk: 0.1, fly: 0.2 },
  rush: 1.5,
  /** The speed (px/s) at which a foe is at full pace, and under which its feet stand still. */
  pace: 120,
  still: 30,
  /** How high the body hops per footfall (px), by gait; a tread rumbles. */
  bounce: { foot: 1.8, paw: 1.4, tread: 0.5 } as Record<Exclude<Gait, 'none'>, number>,
  /** The side-to-side rock of a walker (rad). */
  rock: 0.03,
  /** How fast the lean eases (per second). */
  ease: 8,
  /** The head trails the body's hop by this many footfalls (`Motive.late`). */
  headLag: 0.3,
  /** The speed stretch of a body with no legs: along its way by speed over `div`, at most `walk` (`rush` in a rush); about half what it was before it was taken out. */
  stretch: { div: 1400, walk: 0.15, rush: 0.25 },
  /** A body's breathing: the swell (a share of its size) at rest and at a full pace, and its rate (Hz). */
  breath: { idle: 0.03, moving: 0.012, hz: 0.3 },
};

export interface Motive {
  /** The body's lift off the ground this frame (px, up) and its rock (rad). */
  hop: number;
  rock: number;
  /** The same hop a beat late, which a head is hung on. */
  late: number;
}

/** A kind's own gait (`quad.ts` `Tune`): footfalls per stride, and the hop as a multiple of the gait's. */
export interface Tune {
  cadence: number;
  hop: number;
}

/** Advance a foe's motion by dt seconds at `speed` px/s. `gait` is how it walks (`none` and no legs: a flier or a slider). */
export function stepMotion(m: Motion, dt: number, speed: number, gait: Gait, fly: boolean, rush: boolean, out: Motive = { hop: 0, rock: 0, late: 0 }, tune?: Tune): Motive {
  const pace = Math.min(1, speed / MOVE.pace);
  const mv = Math.min(1, Math.max(0, (speed - 8) / (MOVE.still - 8)));
  if (gait !== 'none') m.walk += (speed * dt * (tune?.cadence ?? 1)) / STEP.stride[gait];
  const target = (fly ? MOVE.lean.fly : MOVE.lean.walk) * pace * (rush ? MOVE.rush : 1);
  m.lean += (target - m.lean) * Math.min(1, dt * MOVE.ease);
  if (gait === 'none') {
    out.hop = 0;
    out.rock = 0;
    out.late = 0;
  } else {
    const b = MOVE.bounce[gait] * (tune?.hop ?? 1) * mv;
    out.hop = Math.abs(Math.sin(Math.PI * m.walk)) * b;
    out.late = Math.abs(Math.sin(Math.PI * (m.walk - MOVE.headLag))) * b;
    out.rock = gait === 'tread' ? 0 : Math.sin(Math.PI * m.walk) * MOVE.rock * mv;
  }
  return out;
}

/** The stretch along its way of a body with no legs (a share of its size: wider by it, flatter by 0.6 of it). */
export const stretchOf = (speed: number, rush: boolean) => Math.min(rush ? MOVE.stretch.rush : MOVE.stretch.walk, speed / MOVE.stretch.div);

/** A body's breathing as a scale (1 at the breath out, up to 1 + the swell at the breath in) at `now` seconds, `seed` a number of its own so a herd does not breathe together. */
export function breathOf(now: number, seed: number, speed: number): number {
  const b = MOVE.breath, pace = Math.min(1, speed / MOVE.pace);
  return 1 + (b.idle + (b.moving - b.idle) * pace) * (0.5 + 0.5 * Math.sin(Math.PI * 2 * (now * b.hz + seed * 0.37)));
}

/**
 * The lift's climb as drawn (pure; `LiftView` and the Ascent read it). The sim only says when the lift is rising and when
 * it is done (`MISSION.riseTime`); how far up the platform is at a moment is drawing.
 *
 * One smooth curve, no joins: a small settle (the cable taking the weight) that eases in and back out, under a climb that
 * starts from rest and speeds up, so position and speed never jump. The climb is sized to the view: it carries the platform
 * off the top of the screen about `LIFT.exit` of the way through, whatever the zoom, and the camera rises a share of it
 * (`LIFT.follow`) so it never snaps. Numbers are guesses by eye.
 */

/** Share of the rise the camera follows, and when (as a share of the rise time) the platform has left the screen. */
export const LIFT = { follow: 0.3, exit: 0.85, dip: 6, dipT: 0.35, power: 2.2 };

/** Where a robot's feet may stand on the lift's deck, px from the lift's centre (the deck in `art.ts` at `LIFT_SCALE`, less a margin for the feet). */
export const DECK = { hw: 60, top: -16, bottom: 43 };

/** Game px the platform climbs by the end of the rise, given its foot is `gap` px below the view's top edge when it starts. */
export function reach(gap: number): number {
  return (gap + 10) / (1 - LIFT.follow) / LIFT.exit ** LIFT.power;
}

/** The settle: 0 at rest, 1 at `dipT`, easing back to 0 (no kinks: its speed is 0 at the start and the peak). */
const settle = (t: number) => {
  const u = t / LIFT.dipT;
  return u * u * Math.exp(2 * (1 - u));
};

/** Game px up from the deck at `t` seconds into a rise of `T` seconds that ends `end` px up (negative while it settles). */
export function liftUp(t: number, T: number, end: number): number {
  if (t <= 0) return 0;
  return end * (Math.min(1, t / T) ** LIFT.power) - LIFT.dip * settle(t);
}

/** The platform's speed (px/s) at `t`: the derivative of `liftUp`, for tests and the dust. */
export function liftSpeed(t: number, T: number, end: number): number {
  if (t <= 0 || t >= T) return 0;
  const u = t / LIFT.dipT;
  return (end * LIFT.power * (t / T) ** (LIFT.power - 1)) / T - (LIFT.dip * (2 * u * Math.exp(2 * (1 - u)) * (1 - u))) / LIFT.dipT;
}

/** Smoothstep: 0 to 1 over `u` 0 to 1, with no speed at either end. */
export const smooth = (u: number) => {
  const k = Math.min(1, Math.max(0, u));
  return k * k * (3 - 2 * k);
};

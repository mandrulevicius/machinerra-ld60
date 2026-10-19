/**
 * A carried robot's swing (P7, `botview.ts`): it hangs from its carrier's grip like a pendulum. The carrier's sideways
 * acceleration drives it (it lags when he sets off and swings on when he stops), each of his steps nudges it, and it settles
 * when he stands. Pure maths; the view sets the pivot and draws the robot at `th` from it.
 */

/** Pendulum numbers (guesses by feel): the swing's length (px), its pull (px/s^2, so a period of about a second), damping, a step's nudge (rad/s), the most it swings (rad). */
export const DANGLE = { len: 22, g: 900, damp: 3.2, kick: 1.1, max: 1.1 };

export interface Dangle {
  /** The angle from hanging straight down, positive to the right (screen), and its speed. */
  th: number;
  w: number;
  /** The carrier's sideways speed last frame (px/s), smoothed, to read its acceleration from. */
  vx: number;
  /** The carrier's last footfall (the view's step count) and the side the next nudge goes to. */
  step: number;
  side: 1 | -1;
  /** Seconds to the next puff of dust from dragged feet. */
  dust: number;
}

export const newDangle = (step = 0): Dangle => ({ th: 0, w: 0, vx: 0, step, side: 1, dust: 0 });

/** Advance it by dt seconds with the pivot accelerating `ax` px/s^2 to the right. */
export function stepDangle(d: Dangle, ax: number, dt: number) {
  const sub = Math.max(1, Math.ceil(dt / 0.01));
  const h = dt / sub;
  for (let i = 0; i < sub; i++) {
    d.w += (-(DANGLE.g / DANGLE.len) * Math.sin(d.th) - DANGLE.damp * d.w - (ax / DANGLE.len) * Math.cos(d.th)) * h;
    d.th += d.w * h;
    if (Math.abs(d.th) > DANGLE.max) {
      d.th = Math.sign(d.th) * DANGLE.max;
      if (d.w * d.th > 0) d.w *= -0.3;
    }
  }
}

/** A carrier's footfall: a nudge, alternating sides. */
export function nudge(d: Dangle) {
  d.w += d.side * DANGLE.kick;
  d.side = d.side === 1 ? -1 : 1;
}

/** The carrier's acceleration from its sideways speed now against last frame (smoothed so a frame's jitter does not whip it); updates `d.vx`. */
export function accelOf(d: Dangle, vxNow: number, dt: number) {
  const k = Math.min(1, dt / 0.06);
  const v = d.vx + (vxNow - d.vx) * k;
  const a = dt > 0 ? (v - d.vx) / dt : 0;
  d.vx = v;
  return Math.max(-2500, Math.min(2500, a));
}

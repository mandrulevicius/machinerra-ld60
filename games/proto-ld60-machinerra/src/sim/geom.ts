/** Plain geometry the sim and its neighbours share (one copy: do not redefine these in a module). Pure. */

export interface Pt {
  x: number;
  y: number;
}

/** Distance between two points given as numbers (the hot path: no object needed). */
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Distance between two things that have an `x` and `y`. */
export const distOf = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** An angle folded into -PI..PI. */
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

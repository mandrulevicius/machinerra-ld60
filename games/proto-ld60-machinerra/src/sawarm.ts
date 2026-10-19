/**
 * The Guard's saw arm on screen (pure; `botview.ts` draws it, the rule is `sim/combat.ts` `sawStroke`): the painting's forearm and saw
 * (`crew/guard-saw`, cut by `tools/cut-guard-saw.py` from `crew/guard`, which keeps the rest as `crew/guard-body`) turn about the
 * elbow, a chop: the forearm lifts, comes down through the foe and settles back. Both pieces are the whole canvas of the painting
 * (`CANVAS` px, the same as the tool's), so the arm lies exactly on the body at rest. Every number is a first guess.
 */
export const SAW_ARM = {
  /** The painting's canvas and where its origin sits (botview's `setOrigin(0.5, 0.97)`). */
  canvas: [82, 100] as const,
  origin: [0.5, 0.97] as const,
  /** The elbow the forearm turns about, and the middle of the blade, in canvas px. */
  elbow: [57, 51] as const,
  blade: [70, 62] as const,
  /** The stroke: lift (radians, counter-clockwise on screen with the arm to the right), chop, and the seconds each takes, then back to rest. */
  lift: -0.9,
  chop: 1.0,
  times: [0.07, 0.09, 0.14] as const,
};
/** Seconds a stroke's motion lasts. */
export const STROKE = SAW_ARM.times[0] + SAW_ARM.times[1] + SAW_ARM.times[2];

const ease = (k: number) => k * k * (3 - 2 * k);

/** How far the forearm is turned (radians, clockwise on screen, for an arm that points right) `t` seconds into a stroke; 0 outside one. */
export function swingAt(t: number): number {
  const { lift, chop, times } = SAW_ARM;
  if (t <= 0 || t >= STROKE) return 0;
  if (t < times[0]) return lift * ease(t / times[0]);
  if (t < times[0] + times[1]) return lift + (chop - lift) * ease((t - times[0]) / times[1]);
  return chop * (1 - ease((t - times[0] - times[1]) / times[2]));
}

/**
 * Where a point of the painting's canvas (`px`, `py`, canvas px) lies in the world for a body sprite at (`x`, `y`) with the scale
 * (`sx`, `sy`), mirrored if `flip` is -1, turned by `rot` (radians) about its origin.
 */
export function canvasPoint(px: number, py: number, x: number, y: number, sx: number, sy: number, flip: 1 | -1, rot: number) {
  const [w, h] = SAW_ARM.canvas, [ox, oy] = SAW_ARM.origin;
  const dx = (px - w * ox) * sx * flip, dy = (py - h * oy) * sy;
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: x + dx * c - dy * s, y: y + dx * s + dy * c };
}

/**
 * The Communicator's antenna as a short chain (P7 polish; pure maths, `commview.ts` draws it). A rope of a few segments
 * (`makeRope`, `pull`: `chain.ts`) hangs up from the top of his head: each point is sprung toward standing upright, and the
 * body's move drags it only in part, so it lags his walk, leans, and whips back. A footfall, a kick and a dash nudge it; a
 * little wave (`wave`) runs up it, more as he moves or when it is struck. Every number is a first guess.
 */
import { makeRope, pull, wave, type Rope } from './chain';

export const ANTENNA = {
  /** Points above the base (so n + 1 segments) and the gap between two, px. */
  n: 3,
  gap: 2.4,
  /** The spring back to upright (per s^2) and its damping (per s). */
  spring: 380,
  damp: 11,
  /** The share of the body's move that the rope does not follow (the lag). */
  inertia: 0.6,
  /** Velocity (px/s at the tip) a footfall, a kick and a dash add. */
  step: 55,
  kick: 190,
  dash: 300,
  /** The wave: px side to side at rest, at a run, and when struck; radians a point along. */
  wave: { rest: 0.35, run: 0.9, shock: 1.6, k: 0.9 },
};

export interface Antenna {
  rope: Rope;
  vx: number[];
  vy: number[];
  phase: number;
  /** 0..1, set by a strike and fading. */
  shock: number;
  /** The base last frame. */
  px: number;
  py: number;
  /** Speed of the body (px/s), for the wave. */
  speed: number;
  ready: boolean;
}

export const newAntenna = (): Antenna => ({ rope: makeRope(ANTENNA.n, 0, 0, 0, 1, ANTENNA.gap), vx: Array(ANTENNA.n + 1).fill(0), vy: Array(ANTENNA.n + 1).fill(0), phase: 0, shock: 0, px: 0, py: 0, speed: 0, ready: false });

/** Lay it upright on the base and still. */
function relay(a: Antenna, bx: number, by: number) {
  a.rope = makeRope(ANTENNA.n, bx, by, 0, 1, ANTENNA.gap);
  a.vx.fill(0);
  a.vy.fill(0);
  a.px = bx;
  a.py = by;
  a.ready = true;
}

/** Advance it by dt seconds with its base at (bx, by) (a jump of the base, a teleport or a first frame, lays it upright again). */
export function stepAntenna(a: Antenna, bx: number, by: number, dt: number) {
  const A = ANTENNA, r = a.rope;
  if (!a.ready || Math.hypot(bx - a.px, by - a.py) > 60) relay(a, bx, by);
  dt = Math.min(dt, 0.05);
  const dx = bx - a.px, dy = by - a.py;
  a.speed = dt > 0 ? Math.hypot(dx, dy) / dt : 0;
  a.px = bx;
  a.py = by;
  for (let i = 0; i <= A.n; i++) {
    // The body moved: the rope follows only part of it, then springs back toward standing up.
    r.x[i] += dx * (1 - A.inertia);
    r.y[i] += dy * (1 - A.inertia);
    a.vx[i] += ((bx - r.x[i]) * A.spring - A.damp * a.vx[i]) * dt;
    a.vy[i] += ((by - A.gap * (i + 1) - r.y[i]) * A.spring - A.damp * a.vy[i]) * dt;
    r.x[i] += a.vx[i] * dt;
    r.y[i] += a.vy[i] * dt;
  }
  pull(r, bx, by, A.gap);
  a.shock = Math.max(0, a.shock - dt * 2.2);
  a.phase += dt * (6 + Math.min(1, a.speed / 90) * 10 + a.shock * 30);
}

/** A strike (a kick, a dash, a footfall's nudge): the antenna is thrown against the way `(ux, uy)` the body went, more toward its tip. */
export function whipAntenna(a: Antenna, ux: number, uy: number, power: number, shock = power / 200) {
  const n = ANTENNA.n;
  for (let i = 0; i <= n; i++) {
    const k = (i + 1) / (n + 1);
    a.vx[i] -= ux * power * k;
    a.vy[i] -= uy * power * k * 0.5;
  }
  a.shock = Math.min(1, a.shock + shock);
}

/** A footfall's nudge, alternating sides (`side` +1 or -1). */
export function nudgeAntenna(a: Antenna, side: 1 | -1) {
  whipAntenna(a, side, 0, ANTENNA.step, 0);
}

/** The points to draw (the base, then n + 1 more; the last is the tip): the rope with the wave over it. Writes into `out`. */
export function antennaPoints(a: Antenna, bx: number, by: number, out: { x: number[]; y: number[] }) {
  const A = ANTENNA, W = A.wave, r = a.rope, n = A.n;
  const amp = W.rest + (W.run - W.rest) * Math.min(1, a.speed / 90) + W.shock * a.shock;
  out.x[0] = bx;
  out.y[0] = by;
  for (let i = 0; i <= n; i++) {
    const prevX = i ? r.x[i - 1] : bx, prevY = i ? r.y[i - 1] : by;
    const tx = r.x[i] - prevX, ty = r.y[i] - prevY, m = Math.hypot(tx, ty) || 1;
    const off = wave(i + 1, n + 1, a.phase, amp, W.k) * ((i + 1) / (n + 1));
    out.x[i + 1] = r.x[i] - (ty / m) * off;
    out.y[i + 1] = r.y[i] + (tx / m) * off;
  }
  return out;
}

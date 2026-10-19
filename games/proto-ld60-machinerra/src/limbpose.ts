/**
 * The poses of a foe's elite limbs (P50; pure maths, `limbview.ts` draws them): where a claw's elbow and pincer are, and where
 * the points of a tentacle's rope lie, for the sim's limb mode and its time left (`Hornet.limbs`, `sim/limbs.ts`). Angles in
 * radians, the screen's y down, lengths in px at the foe's own scale. Every number is a first guess.
 *
 * A claw is two bones from the shoulder, solved like the legs' (`quad.ts`): the elbow bends away from the body. Idle it rests
 * folded at its side; the wind-up draws it back (`BACK`) and the strike swings the pincer round its half to the front
 * (`FRONT`) with the arm straightening, then it comes home. A tentacle hangs and sways; the wind-up rears it up and back
 * with its tip aimed; the strike snaps the rope straight to the locked spot; it coils back (`makeRope`, `wave`: `chain.ts`).
 */
import { LIMBS } from './sim/defs';
import type { LimbMode } from './sim/limbs';
import { makeRope, wave, type Rope } from './chain';

const RAD = Math.PI / 180;
/** A claw's angle from the foe's heading (toward its own side): at rest, drawn back for the wind-up, swung through to the front. */
export const CLAW_ANGLE = { rest: 70 * RAD, back: 150 * RAD, front: 20 * RAD };
/** How long (s) a claw takes to fold back to its rest after a strike. */
const HOME = 0.45;
/** How far out a claw's arm reaches, as a share of its full length: folded, drawn back, in the swing. */
const EXT = { rest: 0.55, back: 0.7, swing: 1 };

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const inOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2);
const out = (u: number) => 1 - (1 - u) ** 3;

/** A claw's tip: its angle from the heading (rad, toward its side) and its extension (0..1 of the arm). */
export interface ClawPose {
  phi: number;
  ext: number;
  /** How far through the swing it is (0 not swinging, 1 done): the swoosh follows it. */
  swing: number;
}

/** The claw for a mode and the seconds left in it. */
export function clawPose(mode: LimbMode, t: number, o: ClawPose = { phi: 0, ext: 0, swing: 0 }): ClawPose {
  const C = LIMBS.claw;
  o.swing = 0;
  if (mode === 'wind') {
    const u = inOut(clamp(1 - t / C.wind));
    o.phi = lerp(CLAW_ANGLE.rest, CLAW_ANGLE.back, u);
    o.ext = lerp(EXT.rest, EXT.back, u);
  } else if (mode === 'strike') {
    const u = clamp(1 - t / C.strike);
    o.swing = u;
    o.phi = lerp(CLAW_ANGLE.back, CLAW_ANGLE.front, out(u));
    o.ext = lerp(EXT.back, EXT.swing, clamp(u * 3));
  } else if (mode === 'rest') {
    const k = inOut(clamp((C.rest - t) / HOME));
    o.phi = lerp(CLAW_ANGLE.front, CLAW_ANGLE.rest, k);
    o.ext = lerp(EXT.swing, EXT.rest, k);
    o.swing = k < 1 ? 1 : 0;
  } else {
    o.phi = CLAW_ANGLE.rest;
    o.ext = EXT.rest;
  }
  return o;
}

/** The elbow of two bones `l1` and `l2` from (sx, sy) to a tip at (tx, ty), on the side away from (ox, oy) (the body). The tip is brought to the nearest the arm can reach. */
export function twoBone(sx: number, sy: number, tx: number, ty: number, l1: number, l2: number, ox: number, oy: number, o = { ex: 0, ey: 0, tx: 0, ty: 0 }) {
  const dx = tx - sx, dy = ty - sy;
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const ux = dx / (Math.hypot(dx, dy) || 1), uy = dy / (Math.hypot(dx, dy) || 1);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const px = -uy, py = ux;
  const e1x = sx + ux * a + px * h, e1y = sy + uy * a + py * h;
  const e2x = sx + ux * a - px * h, e2y = sy + uy * a - py * h;
  const far1 = Math.hypot(e1x - ox, e1y - oy) >= Math.hypot(e2x - ox, e2y - oy);
  o.ex = far1 ? e1x : e2x;
  o.ey = far1 ? e1y : e2y;
  o.tx = sx + ux * d;
  o.ty = sy + uy * d;
  return o;
}

/** What a tentacle is doing: how far it is reared (0 hanging, 1 up and back), how far its tip has lashed to the spot (0..1), the tip's glow (0..1: red while winding). */
export interface WhipPose {
  rear: number;
  spot: number;
  glow: number;
}

/** The tentacle for a mode and the seconds left in it. */
export function whipPose(mode: LimbMode, t: number, o: WhipPose = { rear: 0, spot: 0, glow: 0 }): WhipPose {
  const W = LIMBS.whip;
  const restLen = W.cooldown - W.wind - W.strike;
  if (mode === 'wind') {
    const u = clamp(1 - t / W.wind);
    o.rear = inOut(u);
    o.spot = 0;
    o.glow = u;
  } else if (mode === 'strike') {
    const u = clamp(1 - t / W.strike);
    o.rear = 1;
    o.spot = out(u);
    o.glow = 1 - 0.4 * u;
  } else if (mode === 'rest') {
    const v = clamp(1 - t / Math.max(0.01, restLen));
    o.spot = 1 - out(clamp(v * 2));
    o.rear = 1 - inOut(clamp(v * 2 - 1));
    o.glow = 0.6 * (1 - v);
  } else {
    o.rear = o.spot = o.glow = 0;
  }
  return o;
}

/** A tentacle's geometry in px: its idle droop (straight down and a little out), how high and far back it rears, the sway. */
export const WHIP_LOOK = { hang: 26, out: 9, riseUp: 38, riseBack: 6, sway: 3.2, arch: 14 };

/**
 * The points a tentacle's rope should lie on (`rope`, plates 0..n-1 then the tip at n): from the shoulder (sx, sy) to a tip that is
 * the blend of the hanging, rearing and lashing tips, with the wave over it (`wave`, `chain.ts`) and the rise's arch.
 * `out`: +1 / -1, the side the tentacle hangs on; `back`: the way back from the foe's heading (+1 / -1 on x).
 */
export function whipPoints(want: Rope, n: number, sx: number, sy: number, tx: number, ty: number, p: WhipPose, side: 1 | -1, back: 1 | -1, t: number, phase: number) {
  const L = WHIP_LOOK;
  const hx = sx + side * L.out, hy = sy + L.hang;
  const rx = sx + back * L.riseBack + side * L.out * 0.4, ry = sy - L.riseUp;
  let px = hx + (rx - hx) * p.rear, py = hy + (ry - hy) * p.rear;
  px += (tx - px) * p.spot;
  py += (ty - py) * p.spot;
  // The wave is still while it lashes straight; the arch is the rope bowing as it is drawn back.
  const calm = 1 - p.spot;
  const amp = (L.sway + 4 * p.rear * (0.6 + 0.4 * Math.sin(t * 9 + phase))) * calm;
  const arch = L.arch * Math.sin(Math.PI * p.rear) * calm;
  const dx = px - sx, dy = py - sy, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let i = 0; i <= n; i++) {
    const s = (i + 1) / (n + 1);
    const off = wave(i, n, t * 2.6 + phase, amp, 0.75);
    want.x[i] = sx + dx * s + nx * off;
    want.y[i] = sy + dy * s + ny * off - arch * Math.sin(Math.PI * s) * 0.6;
  }
  want.x[n] = px;
  want.y[n] = py;
  return want;
}

export const newWhip = (n: number, x: number, y: number): Rope => makeRope(n, x, y, 0, 1, 1);

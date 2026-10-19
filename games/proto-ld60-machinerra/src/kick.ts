/**
 * The kick's pose over time (P7), pure: the drawing only; the sim's kick (`controller.ts` `kickStep`, `swing`) has already landed
 * when the animation starts, so its wind-up is a beat of chamber that begins with the press and the snap is quick. The leg is two
 * bones from the hip in the vertical plane along the aim: `s` forward along the aim, `z` up (px at his size).
 * Phases (guesses, not the sim's): chamber (the knee comes up, the body leans back), snap (the leg strikes out along the aim),
 * hold (the leg stays out, the trail and the puff), recover (the leg comes home).
 */

export const KICK_ANIM = { wind: 0.07, snap: 0.06, hold: 0.1, back: 0.22 };
export const KICK_TIME = KICK_ANIM.wind + KICK_ANIM.snap + KICK_ANIM.hold + KICK_ANIM.back;
/** The painted-pose look (`commkick.ts` `KICK_LOOK = 'pose'`): no chamber, so the pose lands with the hit, a quick snap, a hold, a short recovery. */
export const POSE_ANIM = { wind: 0, snap: 0.04, hold: 0.12, back: 0.2 };
export const animTime = (a: typeof KICK_ANIM) => a.wind + a.snap + a.hold + a.back;

/** `cham` (0..1) how far the knee is drawn up, `ext` (0..1) how far the leg is out; `lean` is the body's, back (negative) then forward. */
export interface KickPose {
  cham: number;
  ext: number;
  lean: number;
}

const out = (u: number) => 1 - (1 - u) ** 3;
const inOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2);
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

/** The pose t seconds after the kick began; null once it is over. */
export function kickPose(t: number, anim = KICK_ANIM): KickPose | null {
  const { wind, snap, hold, back } = anim;
  if (t < 0 || t >= animTime(anim)) return null;
  if (t < wind) {
    const u = inOut(t / wind);
    return { cham: u, ext: 0, lean: -u };
  }
  if (t < wind + snap) {
    const u = out((t - wind) / snap);
    return { cham: 1 - u, ext: u, lean: -1 + 2 * u };
  }
  if (t < wind + snap + hold) return { cham: 0, ext: 1, lean: 1 };
  const u = inOut(clamp01((t - wind - snap - hold) / back));
  return { cham: 0, ext: 1 - u, lean: 1 - u };
}

export interface V2 {
  s: number;
  z: number;
}

/** Where the foot is (the ankle) for a pose: standing under the hip, the heel drawn up behind in the chamber, out along the aim at the snap. `H` is the hip's height, `R` how far the ankle reaches, `high` (0..1) how much more the boot is lifted for a kick along the screen's vertical. */
export function footAt(p: KickPose, H: number, R: number, o: V2, high = 0): V2 {
  const cs = -4 * p.cham, cz = 0.4 * H * p.cham; // chamber
  o.s = cs + (R - cs) * p.ext;
  o.z = cz + ((0.76 + 0.24 * high) * H - cz) * p.ext; // a kick along the screen's depth (up or down it) is foreshortened: lift the boot so it still reads
  // The ankle hangs at hip height less the shin's end: standing, it is a boot's height off the ground.
  o.z = Math.max(o.z, 0.09 * H);
  return o;
}

/**
 * Two bones from the hip (0, H) to an ankle at (fs, fz), thigh `l1` and shin `l2`, the knee bending forward (+s). An ankle out of
 * reach is pulled in along the line to it. Returns the knee and the ankle as placed.
 */
export function twoBone(H: number, fs: number, fz: number, l1: number, l2: number, out: { ks: number; kz: number; as: number; az: number }) {
  let dx = fs, dz = fz - H;
  let d = Math.hypot(dx, dz) || 1e-6;
  const max = (l1 + l2) * 0.999;
  if (d > max) {
    dx = (dx / d) * max;
    dz = (dz / d) * max;
    d = max;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uz = dz / d;
  // The perpendicular that points forward (+s): (-uz, ux) when the leg points down; flip it if it would go backward.
  let px = -uz, pz = ux;
  if (px < 0) (px = -px), (pz = -pz);
  out.ks = ux * a + px * h;
  out.kz = H + uz * a + pz * h;
  out.as = dx;
  out.az = H + dz;
  return out;
}

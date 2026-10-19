/**
 * Procedural legs (docs/techniques.md, procedural animation): plain maths, no Phaser, so the gait is testable. A body
 * moves; each foot stays planted on the ground until it has drifted too far from where its leg wants it, then steps to
 * that spot (ahead of the body's motion), lifting over the ground it crosses. Two-bone IK bends the leg (`twoBone`).
 * Legs alternate in two groups (a tetrapod gait: a leg may step only while no leg of the other group is in the air),
 * unless it is stretched too far, when it goes anyway. Heights come from `heightAt`, so feet climb what they cross.
 *
 * Coordinates are world x, y (px) and z up (px); the view draws z as a lift on the screen's y.
 */

export interface V3 { x: number; y: number; z: number }

/** A leg's mount and rest spot in the body frame: `f` forward, `s` to its side (px). */
export interface LegDef { hip: [number, number]; rest: [number, number]; group: 0 | 1; side: -1 | 1 }
export interface Leg extends LegDef {
  foot: V3;
  from: V3;
  to: V3;
  /** 0: planted. 0..1: stepping, how far along. */
  t: number;
  /** Seconds the step in the air takes, and how high it lifts (px). */
  dur: number;
  lift: number;
  /** Its own stride, as a share of the gait's (so the feet do not all go at once). */
  eager: number;
  /** A pose holds the foot there (e.g. rearing up before a pounce): the gait leaves it alone. */
  hold: V3 | null;
}
export interface Body { x: number; y: number; ang: number; vx: number; vy: number }

export interface GaitOpts {
  /** Drift (px) from the rest spot at which a planted foot steps. */
  stride: number;
  /** The foot lands this many seconds of travel ahead of the rest spot. */
  lead: number;
  /** Seconds a step takes standing still, the fastest it gets, and how much each px/s of speed shortens it. */
  stepT: number;
  stepMin: number;
  stepSpeed: number;
  /** How high a foot lifts (px), plus whatever step up it makes. */
  lift: number;
  /** Most legs in the air at once. */
  maxStep: number;
  /** The two groups take turns (false: only `maxStep` counts: a wrong, stumbling gait). */
  alternate: boolean;
  /** Farthest a foot may be from its hip (px, in 3D): a foot beyond it is dragged in. */
  reach: number;
  /** Random scatter (px) added to where a foot lands, and the chance a second of a planted foot twitching to a new spot while the body is still. */
  jitter: number;
  twitch: number;
  heightAt: (x: number, y: number) => number;
  rand: () => number;
}

const hypot3 = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * `n` legs (even), half to a side, the front ones reaching forward and the back ones back, `size` scales every length.
 * Index 0..n/2-1 are the left side front to back, then the right side. The groups alternate along and across.
 */
export function legLayout(n: number, size = 1): LegDef[] {
  const m = n / 2;
  const out: LegDef[] = [];
  for (const side of [-1, 1] as const)
    for (let j = 0; j < m; j++) {
      const u = m > 1 ? j / (m - 1) : 0.5;
      const ang = ((38 + 110 * u) * Math.PI) / 180; // from the forward axis: the front leg points ahead, the back one behind
      const len = (30 - 5 * Math.abs(2 * u - 1)) * size;
      const hip: [number, number] = [(9 - 17 * u) * size, side * 5 * size];
      out.push({ hip, rest: [hip[0] + Math.cos(ang) * len, side * (5 * size + Math.sin(ang) * len)], group: ((j + (side > 0 ? 1 : 0)) % 2) as 0 | 1, side });
    }
  return out;
}

export function makeLegs(defs: LegDef[], body: Body, o: Pick<GaitOpts, 'heightAt' | 'rand'>): Leg[] {
  return defs.map((d) => {
    const leg = { ...d, foot: { x: 0, y: 0, z: 0 }, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, t: 0, dur: 0.15, lift: 4, eager: 0.85 + 0.3 * o.rand(), hold: null } as Leg;
    plantAtRest(leg, body, o.heightAt);
    return leg;
  });
}

export const toWorld = (b: Body, f: number, s: number): { x: number; y: number } => {
  const c = Math.cos(b.ang), sn = Math.sin(b.ang);
  return { x: b.x + c * f - sn * s, y: b.y + sn * f + c * s };
};
export const hipOf = (leg: Leg, b: Body, z: number): V3 => ({ ...toWorld(b, leg.hip[0], leg.hip[1]), z });

/** Set a foot down on its rest spot at once (a landing, or a body that has just come into view). */
export function plantAtRest(leg: Leg, b: Body, heightAt: (x: number, y: number) => number) {
  const p = toWorld(b, leg.rest[0], leg.rest[1]);
  leg.foot = { x: p.x, y: p.y, z: heightAt(p.x, p.y) };
  leg.t = 0;
  leg.hold = null;
}

/**
 * Two-bone IK: the knee of a leg with a thigh `a` and a shin `b` from `hip` to `foot`, bent upward (the knee is the
 * point at distance a from the hip and b from the foot, in the vertical plane through both, above the line between them).
 * A foot beyond reach is treated as at full stretch; `out` is the side to bend toward when the foot is straight below.
 */
export function twoBone(hip: V3, foot: V3, a: number, b: number, out = { x: 1, y: 0 }): V3 {
  let dx = foot.x - hip.x, dy = foot.y - hip.y, dz = foot.z - hip.z;
  const D = Math.hypot(dx, dy, dz) || 1e-6;
  dx /= D;
  dy /= D;
  dz /= D;
  const d = Math.min(Math.max(D, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const x = (d * d + a * a - b * b) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  // The bend points up, taken off the leg's own line.
  let nx = -dz * dx, ny = -dz * dy, nz = 1 - dz * dz;
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-3) {
    nx = out.x;
    ny = out.y;
    nz = 0;
  } else {
    nx /= nl;
    ny /= nl;
    nz /= nl;
  }
  return { x: hip.x + dx * x + nx * h, y: hip.y + dy * x + ny * h, z: hip.z + dz * x + nz * h };
}

/**
 * Advance every leg by `dt`. `z` is the body's hip height (the legs' mounts). Returns how many are in the air.
 */
export function stepLegs(legs: Leg[], b: Body, z: number, dt: number, o: GaitOpts): number {
  const speed = Math.hypot(b.vx, b.vy);
  const air = [0, 0];
  for (const l of legs) if (l.t > 0 && !l.hold) air[l.group]++;
  let total = air[0] + air[1];
  for (const l of legs) {
    const rest = toWorld(b, l.rest[0], l.rest[1]);
    if (l.hold) {
      l.foot = { ...l.hold };
      l.t = 0;
      continue;
    }
    // It lands ahead of the rest spot by what the body will travel meanwhile (but no more than a stride), and steps again once it trails that spot's midpoint by a stride.
    const limit = o.stride * l.eager;
    const k = speed > 1e-3 ? Math.min(o.lead, (limit * 1.4) / speed) : 0;
    const ahead = { x: rest.x + b.vx * k, y: rest.y + b.vy * k };
    const mid = { x: rest.x + b.vx * k * 0.5, y: rest.y + b.vy * k * 0.5 };
    if (l.t > 0) {
      // In the air: it keeps aiming at where the leg will want it by the time it lands.
      l.to.x = ahead.x;
      l.to.y = ahead.y;
      l.to.z = o.heightAt(ahead.x, ahead.y);
      l.t += dt / l.dur;
      if (l.t >= 1) {
        l.t = 0;
        l.foot = { ...l.to };
        total--;
        air[l.group]--;
      } else {
        const k = ease(l.t);
        l.foot = { x: l.from.x + (l.to.x - l.from.x) * k, y: l.from.y + (l.to.y - l.from.y) * k, z: l.from.z + (l.to.z - l.from.z) * k + Math.sin(Math.PI * l.t) * l.lift };
      }
    } else {
      l.foot.z = o.heightAt(l.foot.x, l.foot.y);
      const drift = Math.hypot(l.foot.x - mid.x, l.foot.y - mid.y);
      const free = (o.alternate ? air[1 - l.group] === 0 : true) && total < o.maxStep;
      const twitch = speed < 8 && o.twitch > 0 && o.rand() < o.twitch * dt;
      const hip0 = hipOf(l, b, z);
      const stretched = hypot3(hip0, l.foot) > o.reach * 0.93; // about to run out of leg: step now
      if ((drift > limit && free) || drift > limit * 1.7 || stretched || twitch) {
        const jx = (o.rand() - 0.5) * 2 * o.jitter, jy = (o.rand() - 0.5) * 2 * o.jitter;
        l.from = { ...l.foot };
        l.to = { x: ahead.x + jx, y: ahead.y + jy, z: o.heightAt(ahead.x, ahead.y) };
        l.dur = Math.max(o.stepMin, o.stepT - speed * o.stepSpeed) * (o.jitter > 0 ? 0.65 + 0.7 * o.rand() : 1);
        l.lift = o.lift + Math.max(0, l.to.z - l.from.z);
        l.t = 1e-6;
        total++;
        air[l.group]++;
      }
    }
    // A foot never stays farther from its hip than the leg reaches: it is dragged in.
    const hip = hipOf(l, b, z);
    const d = hypot3(hip, l.foot);
    if (d > o.reach) {
      const q = o.reach / d;
      l.foot.x = hip.x + (l.foot.x - hip.x) * q;
      l.foot.y = hip.y + (l.foot.y - hip.y) * q;
      l.foot.z = hip.z + (l.foot.z - hip.z) * q;
    }
  }
  return total;
}

/** The hip height the legs ask of the body: `stand` above the ground the planted feet are on, and a little lower the more of them are in the air. */
export function hipHeight(legs: Leg[], stand: number, dip = 2.2): number {
  let ground = 0, planted = 0, air = 0;
  for (const l of legs) {
    if (l.t > 0 || l.hold) air++;
    else {
      ground += l.foot.z;
      planted++;
    }
  }
  return (planted ? ground / planted : 0) + stand - (dip * air) / legs.length;
}

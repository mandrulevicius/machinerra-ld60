/**
 * The legs a robot in spider legs walks on (P53), plain TS (no Phaser) so the pose is testable. Four legs from the Crawlcam's gait
 * (`sim/gait.ts`: a planted foot steps ahead of the body once it has drifted a stride, over the ground it crosses, the legs in two
 * groups that take turns), each a thigh and a shin joined at a knee found by two-bone IK (`twoBone`, the maths `legview.ts` uses
 * for P7's quadrupeds). Heights come from the land (`heightAt`: `elevAt` in `sim/spider.ts`), so the feet climb a mesa's edge as a
 * slope and the hips ride up with them. The body faces forward along +x: the layout is the same mirrored, so a robot turning round
 * need not re-plant its feet.
 * `botlegview.ts` draws it, `botview.ts` owns the robot's body. Every number is the Crawlcam's (`spider.ts` `D`) times `size`: a guess.
 */
import { hipHeight, hipOf, legLayout, makeLegs, stepLegs, twoBone, type Body, type GaitOpts, type Leg, type V3 } from './sim/gait';

/** The Crawlcam's leg numbers (px at size 1) and the share of them a robot's legs take (guesses). */
export const BOT_LEGS = { n: 4, size: 0.9, thigh: 22.5, shin: 25, stand: 14, stride: 17, lift: 6, dip: 2.2, lead: 0.12 };
/** The leg's lengths, hip height and the lift of a step, px. */
export const LEN = { thigh: BOT_LEGS.thigh * BOT_LEGS.size, shin: BOT_LEGS.shin * BOT_LEGS.size, stand: BOT_LEGS.stand * BOT_LEGS.size };

export interface BotLegSet {
  body: Body;
  legs: Leg[];
  opts: GaitOpts;
  /** The hips' height above the sea level of the map (px): the planted feet's ground plus `LEN.stand`, a little lower the more feet are in the air and the faster it goes. */
  z: number;
  /** The speed it is walking at (px/s), eased from the changes in its position. */
  vx: number;
  vy: number;
}

/** One leg as screen-ready points: world x, y and z up (the view draws z as a lift). `far`: its foot is behind the body (drawn behind it); `air`: it is stepping. */
export interface LegPose { hip: V3; knee: V3; foot: V3; far: boolean; air: boolean }

export function newBotLegs(x: number, y: number, heightAt: (x: number, y: number) => number, rand: () => number = Math.random): BotLegSet {
  const size = BOT_LEGS.size;
  const opts: GaitOpts = {
    stride: BOT_LEGS.stride * size, lead: BOT_LEGS.lead, stepT: 0.2, stepMin: 0.085, stepSpeed: 0.0008, lift: BOT_LEGS.lift * size, maxStep: 2, alternate: true,
    reach: (BOT_LEGS.thigh + BOT_LEGS.shin) * size * 0.97, jitter: 0, twitch: 0, heightAt, rand,
  };
  const body: Body = { x, y, ang: 0, vx: 0, vy: 0 };
  const legs = makeLegs(legLayout(BOT_LEGS.n, size), body, opts);
  return { body, legs, opts, z: LEN.stand + heightAt(x, y), vx: 0, vy: 0 };
}

/** Plant every foot on its rest spot at once (the robot has just come into view, or has been carried). */
export function replant(s: BotLegSet, x: number, y: number) {
  s.body.x = x;
  s.body.y = y;
  s.vx = s.vy = s.body.vx = s.body.vy = 0;
  for (const l of s.legs) {
    const p = { x: x + l.rest[0], y: y + l.rest[1] };
    l.foot = { x: p.x, y: p.y, z: s.opts.heightAt(p.x, p.y) };
    l.t = 0;
  }
  s.z = LEN.stand + s.opts.heightAt(x, y);
}

/** The robot is now at (x, y), `dt` s after it was at its last one: the feet step, the hips ease to their height. */
export function stepBotLegs(s: BotLegSet, x: number, y: number, dt: number) {
  const b = s.body;
  const k = Math.min(1, dt * 12);
  // Its speed comes from where it was, eased: the sim moves it in small steps.
  s.vx += ((x - b.x) / Math.max(dt, 1e-3) - s.vx) * k;
  s.vy += ((y - b.y) / Math.max(dt, 1e-3) - s.vy) * k;
  b.x = x;
  b.y = y;
  b.vx = s.vx;
  b.vy = s.vy;
  stepLegs(s.legs, b, s.z, dt, s.opts);
  const speed = Math.hypot(s.vx, s.vy);
  const want = hipHeight(s.legs, LEN.stand, BOT_LEGS.dip * BOT_LEGS.size) - Math.min(2.2, speed * 0.012) * BOT_LEGS.size;
  s.z += (want - s.z) * Math.min(1, dt * 14);
}

/** Where each leg's hip, knee and foot are now. */
export function poseBotLegs(s: BotLegSet, out: LegPose[] = []): LegPose[] {
  const b = s.body;
  s.legs.forEach((l, i) => {
    const hip = hipOf(l, b, s.z);
    const knee = twoBone(hip, l.foot, LEN.thigh, LEN.shin, { x: 0, y: l.side });
    const p = (out[i] ??= { hip, knee, foot: l.foot, far: false, air: false });
    p.hip = hip;
    p.knee = knee;
    p.foot = l.foot;
    p.far = l.foot.y < b.y;
    p.air = l.t > 0;
  });
  return out;
}

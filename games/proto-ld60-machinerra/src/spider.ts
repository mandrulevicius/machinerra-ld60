/**
 * The Crawlcam on screen: a body with procedural legs. Nothing here is animated by frames. Each leg is a thigh and a shin
 * joined at a knee found by two-bone IK from the hip (on the body) to the foot (on the ground); the feet plant and step
 * by the rules in sim/gait.ts (a foot steps when it has drifted too far, ahead of where the spider is going, over the
 * ground it crosses, the legs in two groups that take turns). The body leans into its velocity, dips as legs lift and
 * rides up on the rock its feet stand on. The sim's modes show in the pose: rearing up before a pounce (front legs up,
 * the lens flaring, the landing ringed on the ground), all legs tucked in the leap, wide and low after it, the front legs
 * waving before a cable. The twisted form has ten legs that stumble and twitch, and wears the aura.
 * Play.ts only builds `SpiderViews`, calls `update` after the hornets, and forwards events.
 */
import Phaser from 'phaser';
import type { Audio } from '../../../harness/kit';
import type { World } from '../../../harness/kit/world';
import { S as TEX, } from './art';
import { SPIDER, TWISTED, bossOf } from './sim/defs';
import { hipHeight, hipOf, legLayout, makeLegs, plantAtRest, stepLegs, toWorld, twoBone, type Body, type GaitOpts, type Leg, type V3 } from './sim/gait';
import type { Hornet, Sim, SimEvent } from './sim/sim';
import { elevAt, legCount } from './sim/spider';
import { leanAt } from './shadowview';
import { SPIDER_ART } from './spiderart';
import { DANGER, DANGER_TWISTED, LINE } from './house';

type Img = Phaser.GameObjects.Image;
type Gfx = Phaser.GameObjects.Graphics;

/** Hooks into the scene (Play builds these), so this file stays about the spider. */
export interface SpiderHooks {
  scene: Phaser.Scene;
  sim: Sim;
  world: World;
  sfx: (key: string, x?: number, y?: number, o?: { gain?: number; vary?: number }) => void;
  flash: (x: number, y: number, color: number, intensity?: number) => void;
  burst: (x: number, y: number, o: { color: number; size?: number }) => void;
  shake: (size: 'small' | 'medium') => void;
  /** Hit-stop for `ms` (the kit's juice). */
  stop: (ms: number) => void;
  flashSprite: (obj: Img, ms?: number) => void;
  ring: (g: Gfx, x: number, y: number, r: number, color: number, alpha: number, t: number, flat?: number) => void;
}

/** Design numbers (px at scale 1; every length is multiplied by the spider's size). */
const D = { scale: 0.8, elite: 1.3, thigh: 22.5, shin: 25, stand: 14, stride: 19, lift: 6, dip: 2.2 };
/** The smash when one dies (guesses): hit-stop ms and the least gap between two, the pieces' flight s, how far they fly (px, times its size), how high, how long they lie (s). */
const SMASH = { stop: 40, gap: 220, fly: 0.5, far: [16, 46] as [number, number], high: [12, 30] as [number, number], lie: 5, bodyLie: 7 };
const RED = DANGER;
const CYAN = 0x3df2ff;

interface Spring { s: number; v: number }
const spring = (q: Spring, dt: number) => {
  q.v += (-260 * q.s - 18 * q.v) * dt;
  q.s += q.v * dt;
};
const kick = (q: Spring, amount: number) => (q.v += amount * 30);

interface LegView { femur: Img; shin: Img; knee: Img }
interface View {
  n: number;
  size: number;
  twisted: boolean;
  body: Img;
  legs: Leg[];
  views: LegView[];
  body3: Body;
  z: number;
  lean: { x: number; y: number };
  sq: Spring;
  shadow: Img;
  lens: Img;
  led: Img;
  aura?: Img;
  eyes: Img[];
  hitT: number;
  off: boolean;
  tickT: number;
  wasGo: boolean;
  was: string;
  opts: GaitOpts;
  rand: () => number;
  seed: number;
  /** Where the legs were last frame (planted or not), for footfalls. */
  air: boolean[];
}

export class SpiderViews {
  private views = new Map<number, View>();
  private stopAt = 0;

  constructor(private h: SpiderHooks) {}

  private sizeOf(h: Hornet) {
    // A Crawlcam boss (level 1's, `BOSSES.spider`) is its def's `scale` times a plain one.
    return D.scale * (h.boss ? bossOf(h.kind).scale : h.elite ? D.elite : 1) * (h.twisted ? 1.04 : 1) * (h.small ? 0.65 : 1);
  }

  private build(h: Hornet): View {
    const { scene } = this.h;
    const n = legCount(h);
    const size = this.sizeOf(h);
    let seed = (h.id * 2654435761) >>> 0;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const tw = h.twisted;
    const opts: GaitOpts = {
      stride: D.stride * size, lead: 0.15, stepT: tw ? 0.16 : 0.2, stepMin: tw ? 0.06 : 0.085, stepSpeed: 0.0008, lift: D.lift * size, maxStep: tw ? 5 : 4, alternate: !tw,
      reach: (D.thigh + D.shin) * size * 0.97, jitter: tw ? 3.5 * size : 0, twitch: tw ? 2.5 : 0,
      heightAt: (x, y) => elevAt(this.h.sim.map.ter, this.h.sim.W, this.h.sim.H, x, y),
      rand,
    };
    const S = h.spider!;
    const body3: Body = { x: h.x, y: h.y, ang: S.ang, vx: h.vx, vy: h.vy };
    const legs = makeLegs(legLayout(n, size), body3, opts);
    const mk = (key: string) => scene.add.image(h.x, h.y, key);
    const views = legs.map(() => ({ femur: mk('spider-femur').setOrigin(0, 0.5), shin: mk('spider-tibia').setOrigin(0, 0.5), knee: mk('spider-joint') }));
    const body = mk('spider-body').setScale(size / TEX);
    const shadow = scene.add.image(h.x, h.y, 'world-soft').setTint(this.h.world.shadows.tint).setDepth(-3.5);
    const lens = scene.add.image(h.x, h.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(RED);
    const led = scene.add.image(h.x, h.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(CYAN);
    return { n, size, twisted: tw, body, legs, views, body3, z: D.stand * size, lean: { x: 0, y: 0 }, sq: { s: 0, v: 0 }, shadow, lens, led, eyes: [], hitT: 0, off: false, tickT: 0, wasGo: false, was: S.mode, opts, rand, seed: h.id, air: legs.map(() => false) };
  }

  private drop(v: View) {
    for (const l of v.views) {
      l.femur.destroy();
      l.shin.destroy();
      l.knee.destroy();
    }
    v.shadow.destroy();
    v.lens.destroy();
    v.led.destroy();
    v.aura?.destroy();
    v.eyes.forEach((e) => e.destroy());
  }

  /** Dress and place every spider, step its legs, draw the tells and cables; spiders that are gone fall apart. */
  update(dt: number, g: Gfx) {
    const { sim, scene } = this.h;
    const view = scene.cameras.main.worldView;
    const now = scene.time.now;
    const live = new Set<number>();
    const byId = new Map<number, { h: Hornet; v: View }>();
    for (const h of sim.hornets) {
      if (!h.spider || h.dead) continue;
      live.add(h.id);
      let v = this.views.get(h.id);
      if (v && (v.n !== legCount(h) || v.twisted !== h.twisted)) {
        this.drop(v);
        v = undefined;
      }
      if (!v) {
        v = this.build(h);
        this.views.set(h.id, v);
      }
      byId.set(h.id, { h, v });
      this.pose(h, v, dt, now, g, view);
    }
    for (const [id, v] of this.views) if (!live.has(id)) this.fall(id, v);
    this.cables(g, byId, now);
  }

  private pose(h: Hornet, v: View, dt: number, now: number, g: Gfx, view: Phaser.Geom.Rectangle) {
    const { sim, world } = this.h;
    const S = h.spider!;
    const s = v.size;
    const margin = 180;
    const onView = h.x > view.x - margin && h.x < view.right + margin && h.y > view.y - margin && h.y < view.bottom + margin;
    if (!onView) {
      if (!v.off) this.show(v, false);
      v.off = true;
      return;
    }
    const b = v.body3;
    b.x = h.x;
    b.y = h.y;
    b.vx = h.vx;
    b.vy = h.vy;
    b.ang = S.ang;
    if (v.off) {
      // Back in view after a while away: its feet are wherever the body left them.
      v.off = false;
      b.ang = S.ang;
      for (const l of v.legs) plantAtRest(l, b, v.opts.heightAt);
      v.z = D.stand * s;
      this.show(v, true);
    }
    spring(v.sq, dt);
    v.hitT -= dt;
    const mode = S.mode;
    const speed = Math.hypot(h.vx, h.vy);
    const hipZ0 = v.z;
    // Poses: legs the gait leaves alone while the spider rears up, waves, or flies.
    const m = v.n / 2;
    const front = [0, m];
    for (let i = 0; i < v.n; i++) v.legs[i].hold = null;
    const hold = (i: number, f: number, sd: number, z: number) => {
      const l = v.legs[i];
      const p = toWorld(b, l.hip[0] + f * s, l.side * sd * s);
      l.hold = { x: p.x, y: p.y, z: hipZ0 + z * s };
    };
    if (mode === 'tellPounce') {
      const p = 1 - Math.max(0, S.t) / (h.twisted ? TWISTED.spider.dash.tell : SPIDER.pounce.tell);
      for (const i of front) hold(i, 10 + 6 * p, 10 + 3 * p + Math.sin(now / 35 + i) * 0.8 * (h.twisted ? 3 : 1), 22 + 8 * p);
      if (m > 3) for (const i of [1, m + 1]) hold(i, 8, 20, 12 + 4 * p);
    } else if (mode === 'tellWeb') {
      for (const i of front) hold(i, 17, 5 + Math.sin(now / 55 + i * 2) * 3, 10 + Math.sin(now / 80 + i) * 2);
    } else if (mode === 'leap') {
      for (let i = 0; i < v.n; i++) {
        const l = v.legs[i];
        const p = toWorld(b, l.rest[0] * 0.3 + l.hip[0] * 0.7, l.rest[1] * 0.38);
        l.hold = { x: p.x, y: p.y, z: hipZ0 - 5 * s + 3 * s };
      }
    }
    const was = v.legs.map((l) => l.t > 0);
    stepLegs(v.legs, b, v.z, dt, v.opts);
    // Footfalls: a quiet tick as a foot comes down.
    v.tickT -= dt;
    v.legs.forEach((l, i) => {
      if (was[i] && l.t === 0 && !l.hold && v.tickT <= 0 && speed > 15 && v.rand() < 0.55) {
        v.tickT = 0.06;
        this.h.sfx('tick', h.x, h.y, { gain: h.elite ? 0.5 : 0.32, vary: 0.2 });
      }
    });
    // The body: hips ride the ground the planted feet are on, lower as legs lift, crouched when fast; the sim adds its own lift (a leap's arc, rearing up).
    const wantZ = hipHeight(v.legs, D.stand * s, D.dip * s) + S.z - Math.min(2.2, speed * 0.012) * s;
    v.z += (wantZ - v.z) * Math.min(1, dt * (mode === 'leap' ? 30 : 14));
    const lk = Math.min(1, dt * 10);
    const lx = Phaser.Math.Clamp(h.vx * 0.035, -5, 5) * s, ly = Phaser.Math.Clamp(h.vy * 0.035, -5, 5) * s;
    v.lean.x += (lx - v.lean.x) * lk;
    v.lean.y += (ly - v.lean.y) * lk;

    // Draw. Screen y is world y less height.
    const a = D.thigh * s, bl = D.shin * s;
    const hipBody: Body = { ...b, x: b.x + v.lean.x, y: b.y + v.lean.y };
    const tint = v.hitT > 0 ? 0xff9a70 : h.twisted ? 0xe0a0c0 : h.elite ? 0xffd0d0 : 0xffffff;
    const bodyTint = v.hitT > 0 ? 0xff9a70 : h.twisted ? 0xffb4cc : h.elite ? 0xffd0d0 : 0xffffff;
    const sc = (p: V3) => ({ x: p.x, y: p.y - p.z });
    // The twisted one is all but invisible, only its lens burning (P13): a hit, a rearing, a cable or a leap show it, so no blow comes unannounced.
    const ghost = !h.twisted ? 1 : v.hitT > 0 ? 0.9 : mode === 'tellPounce' || mode === 'tellWeb' || mode === 'leap' ? 0.6 : 0.14;
    const shudder = mode === 'tellPounce' ? (h.twisted ? 1.8 : 1.1) : 0;
    const jx = shudder ? (v.rand() - 0.5) * 2 * shudder : 0, jy = shudder ? (v.rand() - 0.5) * 2 * shudder : 0;
    for (let i = 0; i < v.n; i++) {
      const l = v.legs[i], lv = v.views[i];
      const hip = hipOf(l, hipBody, v.z);
      const out = { x: -Math.sin(b.ang) * l.side, y: Math.cos(b.ang) * l.side };
      const knee = twoBone(hip, l.foot, a, bl, out);
      const H = sc(hip), K = sc(knee), F = sc(l.foot);
      const depth = (l.foot.y < b.y ? b.y - 1.5 : b.y + 1.5) + (l.t > 0 ? 0.2 : 0);
      this.segment(lv.femur, H.x + jx, H.y + jy, K.x + jx, K.y + jy, SPIDER_ART.femur.w, s * 0.95, depth, tint, ghost);
      this.segment(lv.shin, K.x + jx, K.y + jy, F.x, F.y, SPIDER_ART.tibia.w, s * 0.95, depth + 0.1, tint, ghost);
      lv.knee.setPosition(K.x + jx, K.y + jy).setScale((s * 0.9) / TEX).setDepth(depth + 0.2).setTint(tint).setAlpha(ghost).setVisible(true);
    }
    // Body sprite: heading, a squash from hits and the leap, the lens and LEDs glowing.
    const bodyX = hipBody.x + jx, bodyY = hipBody.y - v.z + 1.5 * s + jy;
    const stretch = mode === 'leap' ? 0.14 : mode === 'tellPounce' ? 0.06 : 0;
    v.body.setPosition(bodyX, bodyY).setRotation(S.ang).setFlipY(Math.cos(S.ang) < 0).setScale((s * (1 + v.sq.s * 0.7 + stretch)) / TEX, (s * (1 - v.sq.s * 0.5 - stretch * 0.4)) / TEX).setDepth(b.y + 2 + v.z * 0.08).setTint(bodyTint).setAlpha(ghost).setVisible(true);
    const fx = Math.cos(S.ang), fy = Math.sin(S.ang);
    const lensX = bodyX + fx * 13 * s, lensY = bodyY + fy * 13 * s;
    const tellP = mode === 'tellPounce' ? 1 - Math.max(0, S.t) / (h.twisted ? TWISTED.spider.dash.tell : SPIDER.pounce.tell) : mode === 'tellWeb' ? 0.5 : 0;
    const flare = tellP ? 0.6 + 1.1 * tellP + 0.5 * Math.sin(now / 30) : 0.42 + 0.06 * Math.sin(now / 240 + h.id);
    const col = h.twisted ? DANGER_TWISTED : RED;
    v.lens.setPosition(lensX, lensY).setTint(col).setScale(flare * s * 0.42).setAlpha(Math.min(1, 0.55 + tellP * 0.6)).setDepth(b.y + 3).setVisible(true);
    const ledPulse = 0.5 + 0.5 * Math.sin(now / (mode === 'tellWeb' ? 60 : 300) + h.id);
    v.led.setPosition(bodyX - fx * 8 * s, bodyY - fy * 8 * s).setTint(h.twisted ? 0xff60a0 : mode === 'tellWeb' ? 0xffffff : CYAN).setScale((0.5 + (mode === 'tellWeb' ? 0.7 * ledPulse : 0.1 * ledPulse)) * s * 0.42).setAlpha((0.45 + 0.4 * ledPulse) * ghost).setDepth(b.y + 3).setVisible(true);
    // Its shadow stays on the ground under it (smaller and fainter the higher it is).
    const hi = Math.max(0, v.z - D.stand * s);
    // It leans to the light as a thing as high as its hips would (shadowview.ts).
    const lean = leanAt(world, h.x, h.y);
    v.shadow.setVisible(world.shadows.enabled).setPosition(h.x + lean.x * v.z * 0.5, h.y + 3 + lean.y * v.z * 0.5).setScale((0.85 * s) / (1 + hi * 0.012), 0.45 * s).setAlpha(Math.max(0.16, 0.5 - hi * 0.005) * lean.a);
    // The twisted: an aura on the ground, a turning ring, more eyes with the menace.
    const aura = sim.auraOf(h);
    if (aura) {
      if (!v.aura) v.aura = this.h.scene.add.image(h.x, h.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(DANGER);
      const pulse = 0.5 + 0.5 * Math.sin(now / 260 + h.id);
      const mn = h.menacing ? 1 : 0, bf = mn * sim.buff; // only a menacing one wears the menace (a bigger halo, more eyes)
      v.aura.setVisible(true).setPosition(h.x, h.y + 4).setDepth(h.y - 6).setScale(((2 * aura.radius) / 128) * (1 + 0.15 * mn), ((2 * aura.radius) / 128) * 0.62 * (1 + 0.15 * mn)).setAlpha(0.2 + 0.08 * pulse + 0.05 * Math.min(bf, 4) + 0.06 * mn);
      this.h.ring(g, h.x, h.y + 4, aura.radius, DANGER, 0.3 + 0.2 * pulse, now + h.id * 300);
      const n = 3 + mn + Math.min(4, Math.floor(bf));
      while (v.eyes.length < n) v.eyes.push(this.h.scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xff2858));
      v.eyes.forEach((e, i) => {
        const side = i % 2 ? 1 : -1;
        const row = Math.floor(i / 2);
        const px = bodyX + fx * (5 + row * 3.2) * s - fy * side * (5 - row * 0.8) * s, py = bodyY + fy * (5 + row * 3.2) * s + fx * side * (5 - row * 0.8) * s - 1;
        e.setPosition(px, py).setScale(0.1 * s).setAlpha(0.7 + 0.3 * Math.sin(now / 130 + i * 2 + h.id)).setDepth(b.y + 3.5).setVisible(i < n);
      });
    }
    // The tells on the ground.
    this.tells(g, h, S, now);
  }

  private tells(g: Gfx, h: Hornet, S: NonNullable<Hornet['spider']>, now: number) {
    const col = h.twisted ? DANGER_TWISTED : RED;
    if (S.mode === 'tellPounce') {
      const tell = h.twisted ? TWISTED.spider.dash.tell : SPIDER.pounce.tell;
      const p = 1 - Math.max(0, S.t) / tell;
      const locked = S.t <= SPIDER.pounce.lock;
      const R = SPIDER.pounce.radius;
      // Before the lock the mark follows its target faintly; locked it burns, closing in on the spot.
      g.lineStyle(LINE.effect, col, locked ? 0.7 : 0.25).lineBetween(h.x, h.y, S.tx, S.ty);
      g.fillStyle(col, locked ? 0.16 + 0.3 * p : 0.07);
      g.fillEllipse(S.tx, S.ty + 2, R * 2, R * 1.25);
      this.h.ring(g, S.tx, S.ty + 2, R * (locked ? 1 + 0.5 * (S.t / SPIDER.pounce.lock) : 1.5), col, locked ? 0.95 : 0.4, now * 1.4, 0.62);
      if (locked) g.lineStyle(LINE.effect, 0xffffff, 0.8).strokeEllipse(S.tx, S.ty + 2, R * 2, R * 1.25);
    } else if (S.mode === 'tellWeb') {
      const t = this.h.sim.bot(h.target);
      if (t) g.lineStyle(LINE.effect, DANGER, 0.25 + 0.4 * (1 - S.t / SPIDER.web.tell)).lineBetween(h.x, h.y - 8, t.x, t.y - 8);
    } else if (S.mode === 'leap') {
      g.lineStyle(LINE.effect, col, 0.5).strokeEllipse(S.tx, S.ty + 2, SPIDER.pounce.radius * 2, SPIDER.pounce.radius * 1.25);
    }
  }

  /** Cables: the shot in flight trails one to its spider, and a tethered robot is held on one, humming with cyan pulses. */
  private cables(g: Gfx, byId: Map<number, { h: Hornet; v: View }>, now: number) {
    const { sim } = this.h;
    const mouth = (e: { h: Hornet; v: View }) => {
      const S = e.h.spider!;
      return { x: e.v.body3.x + Math.cos(S.ang) * 20 * e.v.size, y: e.v.body3.y - e.v.z + Math.sin(S.ang) * 20 * e.v.size };
    };
    for (const s of sim.shots) {
      const e = s.web && !s.dead ? byId.get(s.by) : undefined;
      if (e) this.cable(g, mouth(e), { x: s.x, y: s.y }, 2, now, 1);
    }
    for (const bot of sim.bots) {
      if (!bot.web || bot.dead) continue;
      const e = byId.get(bot.web.by);
      if (!e) continue;
      const left = bot.web.t;
      const m = mouth(e);
      const taut = Math.min(1, Math.hypot(bot.x - m.x, bot.y - m.y) / (SPIDER.web.leash * 32 * 0.5));
      if (left < 0.5 && Math.floor(now / 60) % 2) continue; // it frays and lets go
      this.cable(g, m, { x: bot.x, y: bot.y - 14 }, 13 * (1 - taut * 0.7), now, 1);
      g.fillStyle(0xe8edf2, 0.9).fillCircle(bot.x, bot.y - 14, 3.2);
    }
  }

  private cable(g: Gfx, a: { x: number; y: number }, b: { x: number; y: number }, sag: number, now: number, alpha: number) {
    const n = 10;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      pts.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u + sag * 4 * u * (1 - u) });
    }
    g.lineStyle(LINE.effect + 2 * LINE.outline, 0x050607, 0.85 * alpha);
    g.beginPath().moveTo(pts[0].x, pts[0].y);
    for (const p of pts) g.lineTo(p.x, p.y);
    g.strokePath();
    g.lineStyle(LINE.effect, 0xeef3f7, alpha);
    g.beginPath().moveTo(pts[0].x, pts[0].y);
    for (const p of pts) g.lineTo(p.x, p.y);
    g.strokePath();
    for (let k = 0; k < 3; k++) {
      const u = ((now / 420 + k / 3) % 1) * n;
      const i = Math.min(n - 1, Math.floor(u)), f = u - i;
      g.fillStyle(DANGER, 0.95 * alpha).fillCircle(pts[i].x + (pts[i + 1].x - pts[i].x) * f, pts[i].y + (pts[i + 1].y - pts[i].y) * f, 1.6);
    }
  }

  private segment(im: Img, x0: number, y0: number, x1: number, y1: number, texLen: number, thick: number, depth: number, tint: number, alpha = 1) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 0.01;
    im.setPosition(x0, y0).setRotation(Math.atan2(dy, dx)).setScale(len / (texLen * TEX), thick / TEX).setFlipY(dx < 0).setDepth(depth).setTint(tint).setAlpha(alpha).setVisible(true);
  }

  private show(v: View, on: boolean) {
    for (const l of v.views) {
      l.femur.setVisible(on);
      l.shin.setVisible(on);
      l.knee.setVisible(on);
    }
    v.body.setVisible(on);
    v.shadow.setVisible(on);
    v.lens.setVisible(on);
    v.led.setVisible(on);
    v.aura?.setVisible(on);
    v.eyes.forEach((e) => e.setVisible(on));
  }

  /**
   * A downed spider smashes: the lens, the rear plate and the legs fly off in one arc each (a single tween drives them all)
   * and lie on the sand for `SMASH.lie` s as remains; the front plate stays with the body. A bigger one throws farther.
   * A little hit-stop and a burst, at most one stop in `SMASH.gap` ms so a pack dying together does not stall the game.
   */
  private fall(id: number, v: View) {
    const { scene, world } = this.h;
    this.views.delete(id);
    v.aura?.destroy();
    v.eyes.forEach((e) => e.destroy());
    v.led.destroy();
    v.shadow.destroy();
    if (v.off) {
      for (const l of v.views) {
        l.femur.destroy();
        l.shin.destroy();
        l.knee.destroy();
      }
      v.lens.destroy();
      v.body.destroy();
      return;
    }
    const cx = v.body.x, cy = v.body.y;
    const now = performance.now();
    if (now - this.stopAt > SMASH.gap) {
      this.stopAt = now;
      this.h.stop(SMASH.stop);
    }
    this.h.burst(cx, cy, { color: 0x9aa4ae, size: 0.9 * v.size });
    this.h.flash(cx, cy, v.twisted ? DANGER_TWISTED : RED, 0.9);
    // The body: the front plate stays and lies; the rear half is a piece of its own.
    const bw = v.body.width, bh = v.body.height, half = bw / 2;
    const plate = scene.add.image(v.body.x, v.body.y, 'spider-body').setCrop(0, 0, half, bh).setScale(v.body.scaleX, v.body.scaleY).setRotation(v.body.rotation).setFlipY(v.body.flipY).setTint(0x506070);
    v.body.setCrop(half, 0, half, bh).setTint(0x506070).setDepth(cy + 2);
    scene.tweens.add({ targets: v.body, y: cy + 8, angle: v.body.angle + (v.rand() < 0.5 ? 40 : -40), duration: 280, ease: 'Quad.easeIn' });
    world.remains.add(v.body, { life: SMASH.bodyLie, smudge: { key: 'world-splat', tint: 0x202830, alpha: 0.45, scale: 0.3, kind: false } });
    // The pieces: where each starts, how far it goes (away from the body, with a twist), how high, how it spins, whether it stays.
    const drop = v.z * 0.5 + 4;
    interface Piece { im: Img; x0: number; y0: number; dx: number; dy: number; peak: number; r0: number; spin: number; keep: boolean }
    const pieces: Piece[] = [];
    const add = (im: Img, keep: boolean, far = 1) => {
      const a = Math.atan2(im.y - cy, im.x - cx) + (v.rand() - 0.5) * 1.6;
      const d = (SMASH.far[0] + v.rand() * (SMASH.far[1] - SMASH.far[0])) * v.size / D.scale * far;
      pieces.push({ im, x0: im.x, y0: im.y, dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.7, peak: (SMASH.high[0] + v.rand() * (SMASH.high[1] - SMASH.high[0])) * (0.6 + v.size), r0: im.rotation, spin: (v.rand() - 0.5) * 9, keep });
      im.setTint(0x7a8a98);
    };
    add(plate, true, 0.8);
    v.views.forEach((l, i) => {
      const keep = i % 2 === 0; // half the legs lie there; the rest vanish on landing, so a pack dying together stays cheap
      add(l.femur, keep);
      add(l.shin, keep);
      add(l.knee, false);
    });
    add(v.lens, false, 1.1);
    const lens = v.lens;
    scene.tweens.addCounter({
      from: 0, to: 1, duration: SMASH.fly * 1000, ease: 'Linear',
      onUpdate: (t: Phaser.Tweens.Tween) => {
        const u = t.getValue() ?? 1, e = 1 - (1 - u) * (1 - u), up = 4 * u * (1 - u);
        for (const p of pieces) {
          if (!p.im.scene) continue;
          const y = p.y0 + p.dy * e - p.peak * up + drop * u * u;
          p.im.setPosition(p.x0 + p.dx * e, y).setRotation(p.r0 + p.spin * e).setDepth(p.y0 + p.dy * e + drop + 3);
        }
      },
      onComplete: () => {
        for (const p of pieces) {
          if (!p.im.scene) continue;
          if (p.im === lens) scene.tweens.add({ targets: lens, alpha: 0, scale: lens.scale * 0.4, duration: 260, onComplete: () => lens.destroy() });
          else if (p.keep) {
            p.im.setDepth(p.im.y - 2);
            world.remains.add(p.im, { life: SMASH.lie, smudge: false });
          } else scene.tweens.add({ targets: p.im, alpha: 0, delay: 150, duration: 300, onComplete: () => p.im.destroy() });
        }
      },
    });
  }

  /** Events the spiders react to: footfalls are their own; these are the moments (tells, the leap, the cable, the landing, a hit). */
  event(e: SimEvent) {
    const { sim } = this.h;
    if (e.e === 'hit' && e.on === 'hornet') {
      let best: { h: Hornet; v: View } | null = null, bd = 28;
      for (const h of sim.hornets) {
        const v = h.spider && this.views.get(h.id);
        const d = Math.hypot(h.x - e.x, h.y - e.y);
        if (v && d < bd) {
          bd = d;
          best = { h, v };
        }
      }
      if (best) {
        best.v.hitT = 0.1;
        kick(best.v.sq, -0.25);
        this.h.flashSprite(best.v.body, 70);
      }
      return;
    }
    if (e.e !== 'spider') return;
    const h = e.h, v = this.views.get(h.id);
    const x = h.x, y = h.y;
    switch (e.what) {
      case 'tellPounce':
        this.h.sfx('servo', x, y, { gain: h.elite ? 0.8 : 0.6, vary: 0.1 });
        if (v) kick(v.sq, 0.3);
        break;
      case 'tellWeb':
        this.h.sfx('servo', x, y, { gain: 0.35, vary: 0.2 });
        break;
      case 'leap':
        this.h.sfx('swish', x, y, { gain: 0.7, vary: 0.1 });
        this.h.burst(x, y + 6, { color: 0xc8a070, size: 0.7 });
        if (v) kick(v.sq, 0.5);
        break;
      case 'drop': // from off the map: a bigger dust puff and a thud, no blow
      case 'land': {
        const lx = e.x ?? x, ly = e.y ?? y;
        const drop = e.what === 'drop';
        this.h.sfx('thump', lx, ly, { gain: drop ? 0.7 : 0.55, vary: 0.1 });
        this.h.burst(lx, ly + 4, { color: 0xc8a070, size: drop ? 1.7 : 1.1 });
        if (e.hits) {
          this.h.burst(lx, ly - 14, { color: CYAN, size: 0.6 });
          this.h.shake('small');
        }
        if (v) {
          // Down hard and wide: the feet splay out and the body squashes.
          const b = v.body3;
          b.x = lx;
          b.y = ly;
          for (const l of v.legs) {
            plantAtRest(l, b, v.opts.heightAt);
            l.foot.x = b.x + (l.foot.x - b.x) * 1.14;
            l.foot.y = b.y + (l.foot.y - b.y) * 1.14;
          }
          kick(v.sq, -0.8);
        }
        break;
      }
      case 'web':
        this.h.sfx('thwip', x, y, { gain: 0.6, vary: 0.1 });
        if (v) kick(v.sq, 0.35);
        break;
      case 'snare':
        if (e.bot) {
          this.h.burst(e.bot.x, e.bot.y - 14, { color: 0xeef3f7, size: 0.8 });
          this.h.sfx('thwip', e.bot.x, e.bot.y, { gain: 0.5, vary: 0.2 });
        }
        break;
    }
  }
}

/** Spiders' sounds, synthesised: a tick for a footfall, a rising servo whine for a tell, the cable's thwip. */
export function installSpiderSounds(a: Audio) {
  if (!a.ctx) return;
  const SR = 44100;
  const make = (sec: number, fn: (t: number) => number) => {
    const out = new Float32Array(Math.floor(sec * SR));
    for (let i = 0; i < out.length; i++) out[i] = fn(i / SR);
    return out;
  };
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let hp = 0;
  const env = (t: number, atk: number, dec: number) => (t < atk ? t / atk : Math.exp(-(t - atk) / dec));
  a.addBuffer('tick', make(0.045, (t) => {
    const n = noise();
    const y = n - hp;
    hp += (n - hp) * 0.3;
    return (y * 0.5 + Math.sin(2 * Math.PI * 2300 * t) * 0.5) * env(t, 0.0008, 0.007) * 0.8;
  }));
  a.addBuffer('servo', make(0.75, (t) => {
    const f = 260 + 1500 * (t / 0.7) ** 1.6;
    return (Math.sin(2 * Math.PI * f * t + Math.sin(t * 60) * 1.4) * 0.5 + Math.sin(2 * Math.PI * f * 2.01 * t) * 0.15) * Math.min(1, t / 0.08) * (t < 0.7 ? 1 : Math.max(0, (0.75 - t) / 0.05)) * 0.34;
  }));
  a.addBuffer('thwip', make(0.2, (t) => {
    const n = noise();
    return (Math.sin(2 * Math.PI * (1100 - 3800 * t) * t) * 0.45 + n * 0.25) * env(t, 0.003, 0.05) * 0.8;
  }));
  const s = a.sfx;
  s.group('tick', ['tick'], { max: 4, priority: 1, vary: 0.25, density: true, gain: 0.5 });
  s.group('servo', ['servo'], { max: 2, priority: 4, vary: 0.08, reverb: 0.15, gain: 0.6 });
  s.group('thwip', ['thwip'], { max: 2, priority: 3, vary: 0.12, gain: 0.55 });
}

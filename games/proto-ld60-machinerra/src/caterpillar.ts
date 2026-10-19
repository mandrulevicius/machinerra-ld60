/**
 * The caterpillars on screen (the sim: sim/caterpillar.ts for the mother, a plain walker for the baby). Nothing is animated
 * by frames. The head is the foe's position; the pods follow its path (a trail of where the head has been, each pod `gap` px
 * further along it, so a coil is a coil and a lunge unrolls it), each pod on a pair of procedural legs: feet plant and step
 * by sim/gait.ts, knees by two-bone IK, as the Crawlcam's (spider.ts). The pods ride on their legs; the mother's front pods
 * rise with her head when it lifts and rears. Her jaw is four pieces at the head's front: the top and bottom plates part
 * up and down and the two tusks swing out to the sides as `GrubState.jaw` opens; her lens flares red while she rears and
 * the lunge's lane burns on the ground from the moment its line is locked. On death it smashes like the Crawlcam (`SMASH`).
 * Play lists it after the spiders; `FoeView` skips the kind.
 */
import Phaser from 'phaser';
import { S as TEX } from './art';
import { GRUB_ART } from './caterpillarart';
import { DANGER, LINE } from './house';
import { ViewBase, kick, ring, spring, type G, type Img, type Squash } from './playhost';
import { leanAt } from './shadowview';
import { CATERPILLAR } from './sim/defs';
import { grubDef, lungeLen } from './sim/caterpillar';
import { hipOf, makeLegs, plantAtRest, stepLegs, twoBone, type Body, type GaitOpts, type Leg, type LegDef } from './sim/gait';
import type { Hornet, SimEvent } from './sim/sim';
import { elevAt } from './sim/spider';

/** Design numbers (px at size 1; guesses): the baby's draw size, pod height on its legs, leg bones, how far the feet stand out, a step's stride and lift; how many pods behind the head rise with it. */
const D = { baby: 0.9, stand: 4.5, thigh: 6.5, shin: 7.5, out: 12, stride: 5.5, lift: 3, neck: 3.5 };
/** The smash (as the Crawlcam's, spider.ts). */
const SMASH = { stop: 40, gap: 220, fly: 0.5, far: [12, 40] as [number, number], high: [10, 26] as [number, number], lie: 5, bodyLie: 7 };
const KINDS = new Set(['caterpillar']);
/** Is this foe drawn here (`FoeView` skips it)? */
export const isCaterpillar = (h: { kind: string }) => KINDS.has(h.kind);

interface LegView { thigh: Img; shin: Img }
interface Pod { img: Img; shadow: Img; body: Body; legs: Leg[]; lv: LegView[]; z: number }
interface Jaw { top: Img; bot: Img; left: Img; right: Img; maw: Img }
interface View {
  tusked: boolean;
  size: number;
  gap: number;
  head: Img;
  headShadow: Img;
  lens: Img;
  jaw?: Jaw;
  pods: Pod[];
  trail: { x: number; y: number }[];
  sq: Squash;
  hitT: number;
  off: boolean;
  tickT: number;
  opts: GaitOpts;
  rand: () => number;
  z: number;
}

export class CaterpillarView extends ViewBase {
  private views = new Map<number, View>();
  private stopAt = 0;

  private sizeOf(h: Hornet) {
    return D.baby * (h.grub ? grubDef(h).scale : 1) * (h.small ? 0.65 : 1);
  }

  private build(h: Hornet): View {
    const scene = this.scene;
    const size = this.sizeOf(h);
    const C = h.grub ? CATERPILLAR.tusked : CATERPILLAR.baby;
    const gap = C.gap * size;
    let seed = (h.id * 2654435761) >>> 0;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const opts: GaitOpts = {
      stride: D.stride * size, lead: 0.12, stepT: 0.16, stepMin: 0.06, stepSpeed: 0.0006, lift: D.lift * size, maxStep: 1, alternate: true,
      reach: (D.thigh + D.shin) * size * 0.97, jitter: 0, twitch: 0,
      heightAt: (x, y) => elevAt(this.sim.map.ter, this.sim.W, this.sim.H, x, y) * 0.4,
      rand,
    };
    const ang = h.grub?.ang ?? -Math.PI / 2;
    const trail = [{ x: h.x, y: h.y }, { x: h.x - Math.cos(ang) * gap * (C.segs + 2), y: h.y - Math.sin(ang) * gap * (C.segs + 2) }];
    const soft = () => scene.add.image(h.x, h.y, 'world-soft').setTint(this.w.shadows.tint).setDepth(-3.5);
    const pods: Pod[] = [];
    for (let i = 0; i < C.segs; i++) {
      const body: Body = { x: h.x - Math.cos(ang) * gap * (i + 1), y: h.y - Math.sin(ang) * gap * (i + 1), ang, vx: 0, vy: 0 };
      // Two legs a pod, out to each side and a little back; the pairs take turns down the body (a ripple).
      const defs: LegDef[] = ([-1, 1] as const).map((side) => ({ hip: [0, side * 2.5 * size] as [number, number], rest: [-1.5 * size, side * D.out * size] as [number, number], group: ((i + (side > 0 ? 1 : 0)) % 2) as 0 | 1, side }));
      const legs = makeLegs(defs, body, opts);
      const lv = legs.map(() => ({ thigh: scene.add.image(0, 0, 'grub-leg').setOrigin(0, 0.5), shin: scene.add.image(0, 0, 'grub-leg').setOrigin(0, 0.5) }));
      pods.push({ img: scene.add.image(body.x, body.y, 'grub-seg').setScale(size / TEX), shadow: soft(), body, legs, lv, z: D.stand * size });
    }
    const head = scene.add.image(h.x, h.y, h.grub ? 'grub-skull' : 'grub-head').setScale(size / TEX);
    const lens = scene.add.image(h.x, h.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(DANGER);
    const jaw = h.grub
      ? {
          top: scene.add.image(0, 0, 'grub-jaw').setOrigin(0, 0.5),
          bot: scene.add.image(0, 0, 'grub-jaw').setOrigin(0, 0.5),
          left: scene.add.image(0, 0, 'grub-tusk').setOrigin(0, 0.5),
          right: scene.add.image(0, 0, 'grub-tusk').setOrigin(0, 0.5),
          maw: scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(DANGER),
        }
      : undefined;
    return { tusked: !!h.grub, size, gap, head, headShadow: soft(), lens, jaw, pods, trail, sq: { s: 0, v: 0 }, hitT: 0, off: false, tickT: 0, opts, rand, z: 0 };
  }

  private parts(v: View): Img[] {
    const out: Img[] = [v.head, v.headShadow, v.lens];
    if (v.jaw) out.push(v.jaw.top, v.jaw.bot, v.jaw.left, v.jaw.right, v.jaw.maw);
    for (const p of v.pods) out.push(p.img, p.shadow, ...p.lv.flatMap((l) => [l.thigh, l.shin]));
    return out;
  }

  update(dt: number, g: G) {
    const sim = this.sim;
    const view = this.scene.cameras.main.worldView;
    const now = this.scene.time.now;
    const live = new Set<number>();
    for (const h of sim.hornets) {
      if (h.dead || !isCaterpillar(h)) continue;
      live.add(h.id);
      let v = this.views.get(h.id);
      if (!v) {
        v = this.build(h);
        this.views.set(h.id, v);
      }
      this.pose(h, v, dt, now, g, view);
    }
    for (const [id, v] of this.views) if (!live.has(id)) this.fall(id, v);
  }

  /** Lay the trail: the head's path, newest first, kept as long as the body. */
  private follow(h: Hornet, v: View) {
    const t = v.trail;
    const d = Math.hypot(h.x - t[0].x, h.y - t[0].y);
    if (d > 60 * v.size) {
      // A jump (a kick's fling, a dev move): the body is laid straight behind.
      const a = Math.atan2(t[0].y - h.y, t[0].x - h.x);
      v.trail = [{ x: h.x, y: h.y }, { x: h.x + Math.cos(a) * v.gap * (v.pods.length + 2), y: h.y + Math.sin(a) * v.gap * (v.pods.length + 2) }];
      return;
    }
    if (d > 1.5) t.unshift({ x: h.x, y: h.y });
    else t[0] = { x: h.x, y: h.y };
    const want = v.gap * (v.pods.length + 2);
    let len = 0;
    for (let i = 1; i < t.length; i++) {
      const s = Math.hypot(t[i].x - t[i - 1].x, t[i].y - t[i - 1].y);
      if (len + s >= want) {
        const k = (want - len) / (s || 1);
        t[i] = { x: t[i - 1].x + (t[i].x - t[i - 1].x) * k, y: t[i - 1].y + (t[i].y - t[i - 1].y) * k };
        t.length = i + 1;
        return;
      }
      len += s;
    }
    // Too short (just made): it goes on straight from the last point.
    const a = t.length > 1 ? Math.atan2(t[t.length - 1].y - t[t.length - 2].y, t[t.length - 1].x - t[t.length - 2].x) : Math.PI / 2;
    const last = t[t.length - 1];
    t.push({ x: last.x + Math.cos(a) * (want - len), y: last.y + Math.sin(a) * (want - len) });
  }

  /** The point `dist` px along the trail from the head. */
  private along(v: View, dist: number) {
    const t = v.trail;
    let len = 0;
    for (let i = 1; i < t.length; i++) {
      const s = Math.hypot(t[i].x - t[i - 1].x, t[i].y - t[i - 1].y);
      if (len + s >= dist) {
        const k = (dist - len) / (s || 1);
        return { x: t[i - 1].x + (t[i].x - t[i - 1].x) * k, y: t[i - 1].y + (t[i].y - t[i - 1].y) * k };
      }
      len += s;
    }
    return { ...t[t.length - 1] };
  }

  private pose(h: Hornet, v: View, dt: number, now: number, g: G, view: Phaser.Geom.Rectangle) {
    const s = v.size;
    const S = h.grub;
    const margin = 120 + v.gap * v.pods.length;
    if (!(h.x > view.x - margin && h.x < view.right + margin && h.y > view.y - margin && h.y < view.bottom + margin)) {
      if (!v.off) for (const im of this.parts(v)) im.setVisible(false);
      v.off = true;
      return;
    }
    this.follow(h, v);
    if (v.off) {
      v.off = false;
      for (const p of v.pods) for (const l of p.legs) plantAtRest(l, p.body, v.opts.heightAt);
    }
    spring(v.sq, dt);
    v.hitT -= dt;
    const mode = S?.mode ?? 'crawl';
    const jaw = S?.jaw ?? 0;
    const headZ = S?.z ?? 0;
    const lean = leanAt(this.w, h.x, h.y);
    const tint = v.hitT > 0 ? 0xff9a70 : h.twisted ? 0xe0a0c0 : 0xffffff;
    // The head's way: the mother's from her state, a baby's along its path.
    let ang: number;
    if (S) ang = S.ang;
    else {
      const p = this.along(v, v.gap * 0.6);
      ang = Math.atan2(h.y - p.y, h.x - p.x);
    }
    // Pods: along the trail, each riding its legs; the front ones rise with the head.
    let prev = { x: h.x, y: h.y };
    let lowest = h.y; // the nearest pod to the viewer: a raised head draws over the whole body
    const a = D.thigh * s, b = D.shin * s;
    const stand = D.stand * s;
    v.pods.forEach((p, i) => {
      const at = this.along(v, v.gap * (i + 1));
      const pa = Math.atan2(prev.y - at.y, prev.x - at.x);
      const bd = p.body;
      bd.vx = (at.x - bd.x) / Math.max(dt, 1e-3);
      bd.vy = (at.y - bd.y) / Math.max(dt, 1e-3);
      bd.x = at.x;
      bd.y = at.y;
      bd.ang = pa;
      prev = at;
      lowest = Math.max(lowest, at.y);
      const rise = Math.max(0, 1 - (i + 1) / D.neck);
      const was = p.legs.map((l) => l.t > 0);
      stepLegs(p.legs, bd, p.z, dt, v.opts);
      if (v.tusked && p.legs.some((l, k) => was[k] && l.t === 0) && v.tickT <= 0 && Math.hypot(bd.vx, bd.vy) > 20 && v.rand() < 0.25) {
        v.tickT = 0.07;
        this.sfx('tick', bd.x, bd.y, { gain: 0.35, vary: 0.25 });
      }
      p.z = stand + headZ * rise + Math.sin(now / 140 - i * 0.9) * 0.4 * s;
      for (let k = 0; k < p.legs.length; k++) {
        const l = p.legs[k], lv = p.lv[k];
        const hip = hipOf(l, bd, p.z);
        const out = { x: -Math.sin(pa) * l.side, y: Math.cos(pa) * l.side };
        const knee = twoBone(hip, l.foot, a, b, out);
        const depth = (l.foot.y < bd.y ? bd.y - 1.5 : bd.y + 1.5) + (l.t > 0 ? 0.2 : 0);
        this.segment(lv.thigh, hip.x, hip.y - hip.z, knee.x, knee.y - knee.z, GRUB_ART.leg.w, s * 1.4, depth, tint);
        this.segment(lv.shin, knee.x, knee.y - knee.z, l.foot.x, l.foot.y - l.foot.z, GRUB_ART.leg.w, s * 1.2, depth + 0.1, tint);
      }
      const wob = 1 + v.sq.s * 0.3 * Math.max(0, 1 - i / 3);
      p.img.setPosition(bd.x, bd.y - p.z).setRotation(pa).setScale((s * wob) / TEX, (s * (1 - (wob - 1) * 0.6)) / TEX).setDepth(bd.y + 2 + p.z * 0.08).setTint(tint).setVisible(true);
      const hi = p.z - stand;
      p.shadow.setVisible(this.w.shadows.enabled).setPosition(bd.x + lean.x * p.z * 0.4, bd.y + 2 + lean.y * p.z * 0.4).setScale((0.3 * s) / (1 + hi * 0.02), 0.2 * s).setAlpha(Math.max(0.14, 0.42 - hi * 0.006) * lean.a);
    });
    v.tickT -= dt;

    // The head: drawn up by its lift; in the rear it draws back along its line.
    const fx = Math.cos(ang), fy = Math.sin(ang);
    const back = mode === 'rear' ? Math.min(1, jaw * 1.2) * 3 * s : 0;
    const hd = (headZ > 3 * s ? lowest + 4 : h.y + 3) + v.z * 0.08;
    v.z += (stand + headZ - v.z) * Math.min(1, dt * 20);
    const hx = h.x - fx * back, hy = h.y - fy * back - v.z;
    const st = (mode === 'lunge' ? 0.12 : 0) + v.sq.s * 0.5;
    v.head.setPosition(hx, hy).setRotation(ang).setFlipY(fx < 0).setScale((s * (1 + st)) / TEX, (s * (1 - st * 0.5)) / TEX).setDepth(hd).setTint(tint).setVisible(true);
    v.headShadow.setVisible(this.w.shadows.enabled).setPosition(h.x + lean.x * v.z * 0.4, h.y + 2 + lean.y * v.z * 0.4).setScale((0.36 * s) / (1 + headZ * 0.02), 0.24 * s).setAlpha(Math.max(0.14, 0.45 - headZ * 0.006) * lean.a);
    // The lens: a dim red at rest, flaring as she lifts her head and rears.
    const tell = mode === 'lift' ? 0.4 : mode === 'rear' ? 0.5 + jaw : mode === 'spiral' ? 0.3 : 0;
    const flare = (tell ? 0.5 + tell + 0.35 * Math.sin(now / 35) : 0.35 + 0.05 * Math.sin(now / 240 + h.id)) * s * 0.16;
    const lx = hx + fx * 4 * s, ly = hy + fy * 4 * s;
    v.lens.setPosition(lx, ly).setScale(flare).setAlpha(Math.min(1, 0.5 + tell * 0.4)).setDepth(hd + 1).setVisible(true);
    if (v.jaw) this.drawJaw(v, hx, hy, ang, jaw, hd, tint);
    if (S) this.tells(g, h, now);
  }

  /** The four pieces at the head's front: top and bottom part up and down, the tusks swing out, all as `jaw` opens. */
  private drawJaw(v: View, hx: number, hy: number, ang: number, jaw: number, depth: number, tint: number) {
    const J = v.jaw!;
    const s = v.size;
    const fx = Math.cos(ang), fy = Math.sin(ang);
    const px = -fy, py = fx; // the head's left-to-right across
    const left = fx < 0; // facing left, the plates swap which is up
    const up = left ? 1 : -1;
    const ox = hx + fx * 7.5 * s, oy = hy + fy * 7.5 * s;
    const sc = s / TEX;
    // Top and bottom plates: apart on the screen's up and down, tips turned away from each other.
    const gap = (0.6 + jaw * 4.5) * s;
    J.top.setPosition(ox, oy - gap).setRotation(ang + up * jaw * 0.55).setFlipY(left).setScale(sc).setDepth(depth + 0.15).setTint(tint).setVisible(true);
    J.bot.setPosition(ox, oy + gap * 0.8).setRotation(ang - up * jaw * 0.5).setFlipY(!left).setScale(sc).setDepth(depth + 0.05).setTint(tint).setVisible(true);
    // The tusks: one each side, curving forward, swinging out.
    for (const side of [-1, 1] as const) {
      const im = side < 0 ? J.left : J.right;
      const bx = hx + fx * 4 * s + px * side * 6.5 * s, by = hy + fy * 4 * s + py * side * 6.5 * s;
      im.setPosition(bx, by).setRotation(ang + side * (0.22 + jaw * 0.85)).setFlipY(side > 0).setScale(sc * 1.3).setDepth(depth + 0.2).setTint(tint).setVisible(true);
    }
    // The open mouth burns red: the tell.
    J.maw.setPosition(ox + fx * 3 * s, oy + fy * 3 * s).setScale(jaw * s * 0.13 * (0.9 + 0.1 * Math.sin(this.scene.time.now / 40))).setAlpha(jaw * 0.7).setDepth(depth + 0.1).setVisible(jaw > 0.02);
  }

  /** On the ground: a turning ring round the coil while it winds; the lunge's lane from the moment its line is locked. */
  private tells(g: G, h: Hornet, now: number) {
    const S = h.grub!;
    const C = grubDef(h).charge, k = grubDef(h).scale;
    const R = CATERPILLAR.bite * k;
    if (S.mode === 'spiral') {
      const cx = h.x - Math.cos(S.th) * S.rad, cy = h.y - Math.sin(S.th) * S.rad;
      ring(g, cx, cy + 2, CATERPILLAR.spiral.r0 * k * 1.15, DANGER, 0.35, now * 3 * S.dir);
    } else if (S.mode === 'rear' || S.mode === 'lunge') {
      const k = S.mode === 'rear' ? 1 - Math.max(0, S.t) / C.tell : 1;
      const fade = S.mode === 'lunge' ? Math.max(0, S.t / C.time) : 1;
      const len = lungeLen(h);
      const ux = (S.tx - S.sx) / (len || 1), uy = (S.ty - S.sy) / (len || 1);
      const nx = -uy * R, ny = ux * R * 0.62; // the lane's half width, flattened like the ground
      const pts = [
        { x: S.sx + nx, y: S.sy + ny }, { x: S.tx + nx, y: S.ty + ny },
        { x: S.tx - nx, y: S.ty - ny }, { x: S.sx - nx, y: S.sy - ny },
      ];
      const lane = () => {
        g.beginPath().moveTo(pts[0].x, pts[0].y);
        for (const q of pts) g.lineTo(q.x, q.y);
        g.closePath();
      };
      g.fillStyle(DANGER, (0.08 + 0.22 * k) * fade);
      lane();
      g.fillPath();
      g.lineStyle(LINE.effect, DANGER, (0.35 + 0.5 * k) * fade);
      lane();
      g.strokePath();
      if (k > 0.6 && S.mode === 'rear') g.lineStyle(LINE.effect, 0xffffff, 0.6 * (k - 0.6) / 0.4).lineBetween(S.sx, S.sy, S.tx, S.ty);
    }
  }

  private segment(im: Img, x0: number, y0: number, x1: number, y1: number, texLen: number, thick: number, depth: number, tint: number) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 0.01;
    im.setPosition(x0, y0).setRotation(Math.atan2(dy, dx)).setScale(len / (texLen * TEX), thick / TEX).setFlipY(dx < 0).setDepth(depth).setTint(tint).setVisible(true);
  }

  /** A downed caterpillar smashes: the head, every pod and half the legs fly off in an arc each (one tween drives them all) and lie a while as remains. */
  private fall(id: number, v: View) {
    const { scene, w } = this;
    this.views.delete(id);
    for (const p of v.pods) p.shadow.destroy();
    v.headShadow.destroy();
    v.lens.destroy();
    v.jaw?.maw.destroy();
    if (v.off) {
      for (const im of this.parts(v)) if (im.scene) im.destroy();
      return;
    }
    const cx = v.head.x, cy = v.head.y;
    const t = performance.now();
    if (t - this.stopAt > SMASH.gap) {
      this.stopAt = t;
      this.k.juice.stop(SMASH.stop);
    }
    this.k.fx.burst(cx, cy, { color: 0x9aa4ae, size: 0.7 * v.size });
    this.flash(cx, cy, DANGER, 0.8);
    interface Piece { im: Img; x0: number; y0: number; dx: number; dy: number; peak: number; r0: number; spin: number; keep: boolean }
    const pieces: Piece[] = [];
    const add = (im: Img, keep: boolean, from: { x: number; y: number }) => {
      const a = Math.atan2(im.y - from.y, im.x - from.x) + (v.rand() - 0.5) * 2;
      const d = (SMASH.far[0] + v.rand() * (SMASH.far[1] - SMASH.far[0])) * (0.5 + v.size * 0.5);
      pieces.push({ im, x0: im.x, y0: im.y, dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.7, peak: (SMASH.high[0] + v.rand() * (SMASH.high[1] - SMASH.high[0])) * (0.6 + v.size * 0.4), r0: im.rotation, spin: (v.rand() - 0.5) * 9, keep });
      im.setTint(0x7a8a98);
    };
    add(v.head, true, { x: cx, y: cy + 4 });
    if (v.jaw) for (const im of [v.jaw.top, v.jaw.bot, v.jaw.left, v.jaw.right]) add(im, true, { x: cx, y: cy });
    v.pods.forEach((p, i) => {
      const at = { x: p.img.x + (v.rand() - 0.5) * 4, y: p.img.y + 3 };
      add(p.img, i % 2 === 0, at);
      p.lv.forEach((l, k) => {
        add(l.thigh, (i + k) % 3 === 0, at);
        add(l.shin, false, at);
      });
    });
    scene.tweens.addCounter({
      from: 0, to: 1, duration: SMASH.fly * 1000, ease: 'Linear',
      onUpdate: (tw: Phaser.Tweens.Tween) => {
        const u = tw.getValue() ?? 1, e = 1 - (1 - u) * (1 - u), up = 4 * u * (1 - u);
        for (const p of pieces) {
          if (!p.im.scene) continue;
          p.im.setPosition(p.x0 + p.dx * e, p.y0 + p.dy * e - p.peak * up + 6 * u * u).setRotation(p.r0 + p.spin * e).setDepth(p.y0 + p.dy * e + 6);
        }
      },
      onComplete: () => {
        for (const p of pieces) {
          if (!p.im.scene) continue;
          if (p.keep) {
            p.im.setDepth(p.im.y - 2);
            w.remains.add(p.im, { life: p.im === v.head ? SMASH.bodyLie : SMASH.lie, smudge: false });
          } else scene.tweens.add({ targets: p.im, alpha: 0, delay: 150, duration: 300, onComplete: () => p.im.destroy() });
        }
      },
    });
  }

  event(e: SimEvent) {
    if (e.e === 'hit' && e.on === 'hornet') {
      for (const h of this.sim.hornets) {
        const v = isCaterpillar(h) ? this.views.get(h.id) : undefined;
        if (v && Math.hypot(h.x - e.x, h.y - e.y) < 30 * v.size) {
          v.hitT = 0.1;
          kick(v.sq, -0.25);
          this.k.juice.flashSprite(v.head, 70);
          break;
        }
      }
      return;
    }
    if (e.e === 'sting' && isCaterpillar(e.h)) {
      const v = this.views.get(e.h.id);
      if (v) kick(v.sq, 0.3); // a bite: the head snaps forward
      return;
    }
    if (e.e !== 'grub') return;
    const h = e.h, v = this.views.get(h.id);
    switch (e.what) {
      case 'spiral':
        this.sfx('swish', h.x, h.y, { gain: 0.6, vary: 0.1 });
        this.k.fx.burst(h.x, h.y + 4, { color: 0xc8a070, size: 0.8 });
        break;
      case 'lift':
        this.sfx('tick', h.x, h.y, { gain: 0.7, vary: 0.05 });
        if (v) kick(v.sq, 0.25);
        break;
      case 'rear':
        this.sfx('servo', h.x, h.y, { gain: 0.9, vary: 0.05 });
        break;
      case 'lunge':
        this.sfx('swish', h.x, h.y, { gain: 0.9, vary: 0.05 });
        this.k.fx.burst(h.x, h.y + 4, { color: 0xc8a070, size: 1 });
        if (v) kick(v.sq, 0.6);
        break;
      case 'rest':
        this.sfx('thump', e.x ?? h.x, e.y ?? h.y, { gain: 0.6, vary: 0.1 });
        this.k.fx.burst(e.x ?? h.x, (e.y ?? h.y) + 4, { color: 0xc8a070, size: 1.2 });
        if (v) kick(v.sq, -0.6);
        break;
      case 'bite':
        this.sfx('tick', h.x, h.y, { gain: 0.6, vary: 0.2 });
        if (v) kick(v.sq, 0.3);
        break;
    }
  }

  debug() {
    return { caterpillarViews: this.views.size };
  }
}

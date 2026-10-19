/**
 * Arms with elbows on screen (P50, maths in `arms.ts`): the commuter, officer, spanner monkey and display model are a body (the
 * painting without its arms, `FoeView`'s sprite) with an upper arm from each shoulder and a forearm from each elbow, hung on it
 * as `legview.ts` hangs legs. The arms swing against the legs, wind up and throw with the foe's own beats (a lunge's tell, a bolt
 * or a blow about to go, the `sting` and `spit` events), go wrong for a twisted foe, flail when it is kicked, and go limp with the
 * body when it falls (they follow it down, then stay as remains). `FoeView` still owns the foe; this view reads its sprite.
 * Cost: only the `ARM_CAP` foes nearest the view's centre wear their pieces (two to four sprites each); a farther one shows its
 * whole painting, arms and all; a foe off screen is not stepped.
 * Add a kind: an `ARMS` row (`arms.ts`); nothing here changes.
 */
import { atlas } from '../../../harness/kit/assets';
import { ARM_RIG, armsOfKind, fromOrigin, newArms, paintedArms, stepArms, type ArmIn, type ArmState, type ArmsDef } from './arms';
import { ViewBase, type G, type HornetView, type Img } from './playhost';
import { UNIT, pivotOrigin, type Bone } from './quad';
import { FOES } from './sim/defs';
import type { Hornet, SimEvent } from './sim/sim';

/** How many armed foes wear their pieces at once (the legs' `RIG_CAP` family, a first guess), the margin outside the view a foe is still stepped, and the slack before a foe loses its place. */
export const ARM_CAP = 24;
const NEAR = 100;
const SLACK = 3;
/** A fallen foe's arms follow its body this long (`FoeView.hornetDown` tweens it), then stay as remains. */
const FALL = 0.45;
/** An arm hangs this far out and bent when its foe is down. */
const LIMP = { upper: 0.35, elbow: -0.25 };

interface Live {
  def: ArmsDef;
  /** Upper arm and forearm of each arm in turn. */
  parts: Img[];
  st: ArmState;
  rigged: boolean;
  spr: Img;
  base: number;
  seed: number;
  /** Game time of the last blow or bolt (the events), -1 before any. */
  struckAt: number;
}
interface Corpse {
  c: Live;
  age: number;
}

export class ArmView extends ViewBase {
  private live = new Map<number, Live>();
  private corpses: Corpse[] = [];
  private cand: { h: Hornet; v: HornetView; d: number }[] = [];
  private painted = new Map<ArmsDef, boolean>();
  private struck = new Map<number, number>();
  private inp: ArmIn = { walk: 0, speed: 0, wind: false, struck: -1, twisted: false, flung: false, t: 0, seed: 0 };
  /** How many wear pieces now (`ARM_CAP`; set it from the console to compare: `0` is every foe whole). */
  cap = ARM_CAP;

  event(e: SimEvent) {
    if (e.e === 'sting' || e.e === 'spit') this.struck.set(e.h.id, this.scene.time.now / 1000);
  }

  update(dt: number, _g: G) {
    const sim = this.sim;
    if (this.variant !== paintedArms.name) this.recut();
    const view = this.scene.cameras.main.worldView;
    const now = this.scene.time.now / 1000;
    const cx = view.centerX, cy = view.centerY;
    const cand = this.cand;
    cand.length = 0;
    for (const h of sim.hornets) {
      if (h.dead) continue;
      const def = armsOfKind(h.kind);
      const v = def && this.hornets.get(h.id);
      if (!def || !v || !v.painted || !this.has(def)) continue;
      const on = h.x > view.x - NEAR && h.x < view.right + NEAR && h.y > view.y - NEAR && h.y < view.bottom + NEAR;
      const c = this.live.get(h.id);
      if (!on) {
        if (c?.rigged) for (const p of c.parts) p.setVisible(false);
        continue;
      }
      cand.push({ h, v, d: Math.hypot(h.x - cx, h.y - cy) });
    }
    cand.sort((p, q) => p.d - q.d);
    for (let rank = 0; rank < cand.length; rank++) {
      const { h, v } = cand[rank];
      const def = armsOfKind(h.kind)!;
      let c = this.live.get(h.id);
      const want = rank < (c?.rigged ? this.cap + SLACK : this.cap - SLACK);
      if (!want) {
        if (c?.rigged) this.strip(v, c);
        continue;
      }
      if (!c) this.live.set(h.id, (c = this.make(h, v, def)));
      if (!c.rigged) this.dress(v, c);
      this.pose(h, v, c, dt, now);
    }
    for (const [id, c] of this.live) if (!this.hornets.has(id)) this.fall(id, c);
    this.follow(dt);
  }

  /** The `paintedArms` variant the live foes were dressed under. */
  private variant = paintedArms.name;

  /** The variant changed (dev, `?v.paintedArms=`): every foe in pieces goes back to its whole painting and the view starts over. */
  private recut() {
    this.variant = paintedArms.name;
    for (const [id, c] of this.live) {
      const v = this.hornets.get(id);
      if (v && c.rigged) this.strip(v, c);
      for (const p of c.parts) p.destroy();
    }
    this.live.clear();
  }

  /** The atlas has every frame of this kind's cut (asked once). */
  private has(def: ArmsDef) {
    let ok = this.painted.get(def);
    if (ok === undefined) {
      const tex = this.scene.textures.exists('atlas') ? this.scene.textures.get('atlas') : undefined;
      ok = !!tex && tex.has(def.body) && def.arms.every((a) => tex.has(a.upper.frame) && tex.has(a.lower.frame));
      this.painted.set(def, ok);
    }
    return ok;
  }

  private make(h: Hornet, v: HornetView, def: ArmsDef): Live {
    const art = atlas(this.scene);
    const parts = def.arms.flatMap((a) => [a.upper.frame, a.lower.frame]).map((f) => art.image(h.x, h.y, f).setVisible(false));
    return { def, parts, st: newArms(def.arms.length), rigged: false, spr: v.spr, base: v.base, seed: h.id * 1.3, struckAt: -1 };
  }

  /** The body takes its frame without arms and the pieces show. */
  private dress(v: HornetView, c: Live) {
    c.rigged = true;
    v.forms = [c.def.body, c.def.body];
    v.form = c.def.body;
    v.spr.setFrame(c.def.body);
  }

  /** Back to the whole painting (a crowd's farthest). */
  private strip(v: HornetView, c: Live) {
    c.rigged = false;
    v.forms = [c.def.whole, c.def.whole];
    v.form = c.def.whole;
    v.spr.setFrame(c.def.whole);
    for (const p of c.parts) p.setVisible(false);
  }

  /** Is it winding up a blow or a bolt: a lunge's tell, a bolt about to go, a blow about to land. */
  private winding(h: Hornet): boolean {
    if (h.brain.state === 'tell') return true;
    const F = FOES[h.kind];
    if (F.ranged) return h.gunT > 0 && h.gunT < 0.35;
    const t = this.sim.bot(h.target);
    return !!t && !t.dead && h.cd < 0.3 && Math.hypot(t.x - h.x, t.y - h.y) < h.reach * 1.6;
  }

  private pose(h: Hornet, v: HornetView, c: Live, dt: number, now: number) {
    const i = this.inp;
    i.walk = v.motion.walk;
    i.speed = Math.hypot(h.vx, h.vy);
    i.wind = this.winding(h);
    const at = this.struck.get(h.id);
    i.struck = at === undefined ? -1 : now - at < ARM_RIG.strike ? now - at : -1;
    i.twisted = h.twisted;
    i.flung = !!h.fling || this.sim.limp(h);
    i.t = now;
    i.seed = c.seed;
    stepArms(c.def, c.st, dt, i);
    this.lay(v.spr, c, c.st, v.base);
  }

  /** A bone's sprite set on its pivot: turned, scaled and dressed as the body is. */
  private put(img: Img, b: Bone, spr: Img, x: number, y: number, rot: number, depth: number) {
    const [ox, oy] = pivotOrigin(b);
    img
      .setVisible(spr.visible)
      .setOrigin(spr.flipX ? 1 - ox : ox, oy)
      .setFlipX(spr.flipX)
      .setPosition(x, y)
      .setRotation(rot)
      .setScale(spr.scaleX, spr.scaleY)
      .setDepth(depth)
      .setAlpha(spr.alpha);
    if (spr.isTinted) img.setTint(spr.tintTopLeft).setTintMode(spr.tintMode);
    else img.clearTint();
  }

  /** Put the pieces on the body sprite: each upper arm at its shoulder, turned by the body's turn and its own, each forearm at the upper arm's elbow turned by both. */
  private lay(spr: Img, c: Live, st: ArmState, base: number) {
    const flip = spr.flipX, sgn = flip ? -1 : 1, rot = spr.rotation;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const ux = (UNIT * spr.scaleX) / base, uy = (UNIT * spr.scaleY) / base;
    const def = c.def;
    def.arms.forEach((a, i) => {
      const [lx, ly] = fromOrigin(def.box, a.at[0], a.at[1], def.oy);
      const X = sgn * lx * ux, Y = ly * uy;
      const sx = spr.x + X * cos - Y * sin, sy = spr.y + X * sin + Y * cos;
      const d = spr.depth + (a.far ? -0.5 : 0.5);
      const r1 = rot + sgn * st.upper[i];
      this.put(c.parts[2 * i], a.upper, spr, sx, sy, r1, d);
      const ex = sgn * a.elbow[0] * ux, ey = a.elbow[1] * uy;
      this.put(c.parts[2 * i + 1], a.lower, spr, sx + ex * Math.cos(r1) - ey * Math.sin(r1), sy + ex * Math.sin(r1) + ey * Math.cos(r1), r1 + sgn * st.elbow[i], d + 0.01);
    });
  }

  /** The foe fell: its arms follow the body down, limp, for a moment (`follow`). */
  private fall(id: number, c: Live) {
    this.live.delete(id);
    this.struck.delete(id);
    if (!c.rigged || !c.spr.scene) return c.parts.forEach((p) => p.destroy());
    this.corpses.push({ c, age: 0 });
  }

  private follow(dt: number) {
    for (let n = this.corpses.length - 1; n >= 0; n--) {
      const k = this.corpses[n], c = k.c;
      k.age += dt;
      if (!c.spr.scene) {
        c.parts.forEach((p) => p.destroy());
        this.corpses.splice(n, 1);
        continue;
      }
      // Slack: each arm eases to hanging out and bent, then they stay as the body does and fade with it.
      c.st.upper = c.st.upper.map((u) => u + (LIMP.upper - u) * Math.min(1, dt * 14));
      c.st.elbow = c.st.elbow.map((e) => e + (LIMP.elbow - e) * Math.min(1, dt * 14));
      this.lay(c.spr, c, c.st, c.base);
      if (k.age >= FALL) {
        for (const p of c.parts) this.w.remains.add(p, { life: 10 });
        this.corpses.splice(n, 1);
      }
    }
  }

  debug() {
    let rigged = 0;
    for (const c of this.live.values()) if (c.rigged) rigged++;
    return { armView: { rigged, whole: this.live.size - rigged, falling: this.corpses.length, cap: this.cap } };
  }
}

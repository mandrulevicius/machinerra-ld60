/**
 * Four-legged foes on screen (P7, maths in `quad.ts`): the pounce-cat, the ramjet boar, the goat, the bleater, the carousel charger
 * and the cart crawler are a body (`FoeView`'s sprite, its frame swapped for the painting without legs or head) with four legs
 * (a thigh from the hip and a shin from the knee each) and a head on its neck hung on it. The feet are walked by the distance the
 * foe has covered, so they agree with the footfalls (`foemotion.ts`) and plant instead of sliding; the head bobs a beat behind the
 * body's hop. A wind-up holds the pose (the cat crouches, the boar sets, drops its head and paws, the goat tips its horns forward), a
 * leap stretches the legs, a kick sets them flailing; a fallen foe's pieces go limp with its body (they follow it down, then stay as
 * remains). `FoeView` still owns the foe: the body's position, lean, breath, tint, alpha and shadow; this view only reads them and
 * lays the pieces.
 * Cost control: only the `RIG_CAP` rigged foes nearest the view's centre wear their pieces (nine sprites each); a farther one shows
 * its whole painting (hopping and leaning, no legs), and a foe off screen is not stepped.
 * Add a kind: a `QUADS` row (`quad.ts`); nothing here changes.
 */
import { atlas } from '../../../harness/kit/assets';
import { ViewBase, type G, type HornetView, type Img } from './playhost';
import { QUADS, UNIT, fromOrigin, newQuad, pivotOrigin, stepQuad, type Bone, type Hold, type QuadDef, type QuadIn, type QuadState } from './quad';
import type { Hornet } from './sim/sim';

/** How many rigged foes wear their pieces at once (a first guess: the measure is in the P7 plan), and how far outside the view a foe is still stepped. */
export const RIG_CAP = 24;
const NEAR = 100;
/** A foe past the cap takes its pieces back only when it is this many places inside it (so two at the edge do not trade places each frame). */
const SLACK = 3;
/** A fallen foe's pieces follow its body this long (the body's fall is `FoeView.hornetDown`), then stay as remains. */
const FALL = 0.45;

interface Live {
  def: QuadDef;
  /** Thigh and shin of each leg in turn (`def.legs` order), then the head last. */
  parts: Img[];
  st: QuadState;
  /** The pieces are on and the body is the frame without them. */
  rigged: boolean;
  /** The body sprite, kept for the fall, and its scale at rest. */
  spr: Img;
  base: number;
  seed: number;
}
interface Corpse {
  c: Live;
  age: number;
}

export class LegView extends ViewBase {
  private live = new Map<number, Live>();
  private corpses: Corpse[] = [];
  private cand: { h: Hornet; v: HornetView; d: number }[] = [];
  private painted = new Map<QuadDef, boolean>();
  private inp: QuadIn = { walk: 0, speed: 0, hop: 0, late: 0, hold: null, t: 0, seed: 0 };
  /** How many wear pieces now (`RIG_CAP`; set it from the console to compare: `0` is every foe whole). */
  cap = RIG_CAP;

  update(dt: number, _g: G) {
    const sim = this.sim;
    const view = this.scene.cameras.main.worldView;
    const now = this.scene.time.now / 1000;
    const cx = view.centerX, cy = view.centerY;
    const cand = this.cand;
    cand.length = 0;
    for (const h of sim.hornets) {
      if (h.boss || !QUADS[h.kind]) continue;
      const v = this.hornets.get(h.id);
      if (!v || !v.painted) continue;
      const def = QUADS[h.kind]!;
      if (!this.has(def)) continue;
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
      const def = QUADS[h.kind]!;
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

  /** The atlas has every frame of this rig (asked once). */
  private has(def: QuadDef) {
    let ok = this.painted.get(def);
    if (ok === undefined) {
      const tex = this.scene.textures.exists('atlas') ? this.scene.textures.get('atlas') : undefined;
      ok = !!tex && tex.has(def.body) && tex.has(def.head.frame) && def.legs.every((l) => tex.has(l.thigh.frame) && tex.has(l.shin.frame));
      this.painted.set(def, ok);
    }
    return ok;
  }

  private make(h: Hornet, v: HornetView, def: QuadDef): Live {
    const art = atlas(this.scene);
    const parts = [...def.legs.flatMap((l) => [l.thigh.frame, l.shin.frame]), def.head.frame].map((f) => art.image(h.x, h.y, f).setVisible(false));
    return { def, parts, st: newQuad(), rigged: false, spr: v.spr, base: v.base, seed: h.id * 1.9 };
  }

  /** The body takes its frame without legs and head and the pieces show. */
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

  /** What the legs are held in by what the foe is doing (a table by kind in `quad.ts`: a hold a kind lacks is not taken). */
  private holdOf(h: Hornet): Hold | null {
    if (h.fling || this.sim.limp(h)) return 'flail';
    const s = h.brain.state;
    if (s === 'go') return h.kind === 'cat' ? 'leap' : 'brace';
    if (s === 'tell') return h.kind === 'cat' ? 'crouch' : 'brace';
    return null;
  }

  private pose(h: Hornet, v: HornetView, c: Live, dt: number, now: number) {
    const i = this.inp;
    i.walk = v.motion.walk;
    i.speed = Math.hypot(h.vx, h.vy);
    i.hop = v.hop;
    i.late = v.late;
    i.hold = this.holdOf(h);
    i.t = now;
    i.seed = c.seed;
    stepQuad(c.def, c.st, dt, i);
    v.spr.y += c.st.drop;
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

  /**
   * Put the pieces on the body sprite: each leg's thigh at its hip, turned by the body's turn and its own, the shin at the thigh's knee
   * turned by the thigh's and its own bend; the head at its neck, nodded, and lagging the hop a little behind it; all dressed as the body is.
   */
  private lay(spr: Img, c: Live, st: QuadState, base: number) {
    const flip = spr.flipX, sgn = flip ? -1 : 1, rot = spr.rotation;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const ux = (UNIT * spr.scaleX) / base, uy = (UNIT * spr.scaleY) / base;
    const def = c.def;
    for (let i = 0; i < 4; i++) {
      const l = def.legs[i];
      const [lx, ly] = fromOrigin(def, l.at[0], l.at[1]);
      const X = sgn * lx * ux, Y = ly * uy;
      const hx = spr.x + X * cos - Y * sin, hy = spr.y + X * sin + Y * cos;
      const d = spr.depth + (l.far ? -0.5 : 0.5);
      const r1 = rot + sgn * st.thigh[i];
      this.put(c.parts[2 * i], l.thigh, spr, hx, hy, r1, d);
      // The knee, from the hip along the drawn thigh (in the leg's own flipped frame, then turned by the thigh's turn).
      const kx = sgn * l.knee[0] * ux, ky = l.knee[1] * uy;
      this.put(c.parts[2 * i + 1], l.shin, spr, hx + kx * Math.cos(r1) - ky * Math.sin(r1), hy + kx * Math.sin(r1) + ky * Math.cos(r1), r1 + sgn * st.knee[i], d + 0.01);
    }
    const [nx, ny] = fromOrigin(def, def.head.at[0], def.head.at[1]);
    const X = sgn * nx * ux, Y = ny * uy;
    this.put(c.parts[8], def.head, spr, spr.x + X * cos - Y * sin, spr.y + X * sin + Y * cos + st.late, rot + sgn * st.nod, spr.depth + 0.8);
  }

  /** The foe fell: its pieces follow the body down, limp, for a moment (`follow`). */
  private fall(id: number, c: Live) {
    this.live.delete(id);
    if (!c.rigged || !c.spr.scene) return c.parts.forEach((p) => p.destroy());
    this.corpses.push({ c, age: 0 });
  }

  private follow(dt: number) {
    const i = this.inp;
    for (let n = this.corpses.length - 1; n >= 0; n--) {
      const k = this.corpses[n], c = k.c;
      k.age += dt;
      if (!c.spr.scene) {
        c.parts.forEach((p) => p.destroy());
        this.corpses.splice(n, 1);
      } else if (k.age >= FALL) {
        // Still: they stay as the body does, and fade with it.
        this.lay(c.spr, c, c.st, c.base);
        for (const p of c.parts) this.w.remains.add(p, { life: 10 });
        this.corpses.splice(n, 1);
      } else {
        i.walk = i.speed = i.hop = i.late = 0;
        i.hold = 'limp';
        i.t = 0;
        i.seed = 0;
        stepQuad(c.def, c.st, dt, i);
        this.lay(c.spr, c, c.st, c.base);
      }
    }
  }

  debug() {
    let rigged = 0;
    for (const c of this.live.values()) if (c.rigged) rigged++;
    return { legs: { rigged, whole: this.live.size - rigged, falling: this.corpses.length, cap: this.cap } };
  }
}

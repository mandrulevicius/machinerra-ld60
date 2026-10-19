/**
 * Long-bodied foes on screen (P7, maths in `chain.ts`): the rattler, Old Rattlejaw and the vein-crawler are a head, plates and a
 * tail, each its own sprite, following the head's path. `FoeView` still owns the foe (its head is the sprite it makes, with the
 * tint, alpha, shadow, night dress and tells); this view lays the body behind it, lifts and turns the head, and tears the body
 * down when the foe falls. The sim's moments show on the body: the strike's wind-up is the coil (the rattler rears over it, the
 * rattle stands and shakes), the strike unwinds it, a hit or a kick sets the whole body flailing, and a vein-crawler's plates
 * dim where they are in the rock.
 * Add a long-bodied foe: a row in `CHAINS` (`chain.ts`) and its frames; nothing here changes.
 */
import Phaser from 'phaser';
import { atlas } from '../../../harness/kit/assets';
import { CHAINS, chainKey, corpseAt, corpseLife, makeChain, newPose, poseChain, relay, stepChain, type ChainDef, type ChainKey, type ChainPose, type ChainState } from './chain';
import { ViewBase, type G, type HornetView, type Img } from './playhost';
import { HORNET, TIER } from './sim/defs';
import type { Hornet } from './sim/sim';
import { groundShadow } from './shadowview';

type Shadow = ReturnType<typeof groundShadow>;
interface Live {
  key: ChainKey;
  def: ChainDef;
  st: ChainState;
  pose: ChainPose;
  /** The plates (n of them) and the tail piece, in the pose's order. */
  imgs: Img[];
  /** One shadow under every `SHADE.every` plates (the blob rides on the plate `SHADE.at` into each run): a plate each cost a sprite and a pass. */
  shadows: Shadow[];
  /** Off screen: not stepped, its plates hidden; laid straight behind the head again when it comes back. */
  parked: boolean;
  hp: number;
  /** The head's origin as set (it moves with the flip). */
  flip: boolean;
}

/** A blob of shadow serves a run of this many plates, riding on the plate at `at` in it, this much wider and flatter than a plate's own. */
const SHADE = { every: 3, at: 1, wide: 2.2, flat: 0.6 };

/** Plates inside rock (a vein-crawler's) are drawn this dim. */
const ROCK = { alpha: 0.5, tint: 0x8a7a70 };

export class ChainView extends ViewBase {
  private live = new Map<number, Live>();

  update(dt: number, _g: G) {
    const sim = this.sim;
    const view = this.scene.cameras.main.worldView;
    const now = this.scene.time.now / 1000;
    for (const h of sim.hornets) {
      const key = chainKey(h);
      if (!key) continue;
      const v = this.hornets.get(h.id);
      if (!v || v.form !== CHAINS[key].head) continue; // FoeView made it a whole painting (no part frames in the atlas)
      let c = this.live.get(h.id);
      if (!c) this.live.set(h.id, (c = this.make(h, key, v)));
      this.step(h, v, c, dt, now, view);
    }
    for (const [id, c] of this.live) if (!this.hornets.has(id)) this.down(id, c);
  }

  private make(h: Hornet, key: ChainKey, v: HornetView): Live {
    const def: ChainDef = CHAINS[key];
    const art = atlas(this.scene);
    const face = Math.atan2(h.vy, h.vx || 1) || ((h.id * 2.4) % (Math.PI * 2));
    const st = makeChain(def, h.x, h.y, face, h.id % 2 ? 1 : -1, this.sizeOf(h));
    const imgs: Img[] = [];
    const shadows: Shadow[] = [];
    for (let i = 0; i <= def.n; i++) {
      const frame = i === def.n ? def.tail : def.seg2 && i % 2 ? def.seg2 : def.seg;
      const img = art.image(h.x, h.y, frame);
      if (i === def.n) img.setOrigin(...def.tailJoint);
      imgs.push(img);
      if (i < def.n && i % SHADE.every === SHADE.at) shadows.push(groundShadow(this.w, img, { big: h.boss, wide: SHADE.wide, flat: SHADE.flat }));
    }
    v.spr.setOrigin(...def.headJoint);
    return { key, def, st, pose: newPose(def.n), imgs, shadows, parked: false, hp: h.hp, flip: false };
  }

  /** A foe's size against its kind's drawing (elites larger, the brood's young smaller), as `FoeView` scales its painting. */
  private sizeOf(h: Hornet) {
    return (h.elite && !h.boss ? HORNET.elite.scale * 0.9 : 1) * (h.small ? TIER.small : 1);
  }

  private step(h: Hornet, v: HornetView, c: Live, dt: number, now: number, view: Phaser.Geom.Rectangle) {
    const sim = this.sim, def = c.def, st = c.st;
    const f = this.sizeOf(h);
    const br = h.brain;
    const strike = br.state === 'go' || br.state === 'charge';
    const wind = br.state.startsWith('tell');
    let aim: number | null = null;
    if ((strike || br.state === 'tell' || br.state === 'tellCharge') && (br.dx || br.dy)) aim = Math.atan2(br.dy, br.dx);
    else {
      const t = sim.bot(h.target);
      if (t && !t.dead) aim = Math.atan2(t.y - 10 - h.y, t.x - h.x);
    }
    const hurt = h.hp < c.hp - 0.01;
    c.hp = h.hp;
    // Off screen nothing is drawn, so nothing is stepped: it keeps facing its way, and is laid straight behind the head when it returns.
    const on = h.x > view.x - 220 && h.x < view.right + 220 && h.y > view.y - 220 && h.y < view.bottom + 220;
    const spr = v.spr;
    if (!on) {
      if (!c.parked) {
        c.parked = true;
        for (const i of c.imgs) i.setVisible(false);
      }
      if (Math.hypot(h.vx, h.vy) > 25) st.face = Math.atan2(h.vy, h.vx);
      return;
    }
    if (c.parked) {
      c.parked = false;
      relay(st, def, h.x, h.y, f);
    }
    stepChain(st, def, { x: h.x, y: h.y, vx: h.vx, vy: h.vy, wind, strike, aim, flung: !!h.fling || this.sim.limp(h), hurt }, dt, f);
    const pose = poseChain(st, def, h.x, h.y, f, now, c.pose);
    // The head: pinned at its neck joint, turned and lifted; its origin follows the flip (a mirrored frame mirrors its joint).
    const hd = pose.head;
    if (c.flip !== hd.flip) {
      c.flip = hd.flip;
      spr.setOrigin(hd.flip ? 1 - def.headJoint[0] : def.headJoint[0], def.headJoint[1]);
    }
    const base = v.base * f * (1 + v.sq.s * 0.5);
    spr.setPosition(hd.x, hd.y - hd.lift).setFlipX(hd.flip).setScale(base, base * (1 - v.sq.s * 0.3)).setRotation(hd.angle).setDepth(h.y + 0.6);
    v.shadow.raise = hd.lift;
    // The plates and the tail: deepest at the tail, so each sits over the one behind it where they cross.
    const rock = def.rock;
    const sc = base;
    for (let i = 0; i < c.imgs.length; i++) {
      const p = pose.parts[i], img = c.imgs[i];
      img.setVisible(true).setPosition(p.x, p.y - p.lift).setRotation(p.angle).setScale(sc).setDepth(p.y + (c.imgs.length - i) * 0.01);
      if (i % SHADE.every === SHADE.at && i < def.n) c.shadows[(i - SHADE.at) / SHADE.every].raise = p.lift;
      // Dressed as the head is (elite red, twisted violet, a wind-up's heat), and as far there as it is.
      if (spr.isTinted) img.setTint(spr.tintTopLeft).setTintMode(spr.tintMode);
      else img.clearTint();
      let a = spr.alpha;
      if (rock && sim.blocked(p.x, p.y)) {
        a *= ROCK.alpha;
        img.setTint(ROCK.tint);
      }
      img.setAlpha(a);
    }
    if (rock && sim.blocked(h.x, h.y)) {
      spr.setAlpha(spr.alpha * ROCK.alpha);
      spr.setTint(ROCK.tint);
    }
  }

  /**
   * The foe fell: the plates go limp where they lie, darken, stay a while as its head does (`remains`), then fade (the head is
   * `FoeView`'s fall). One tween is the whole corpse (`corpseAt` gives each plate its moment); one off screen is just dropped.
   */
  private down(id: number, c: Live) {
    this.live.delete(id);
    if (c.parked) return c.imgs.forEach((img) => img.destroy());
    const y0 = c.imgs.map((img) => img.y), a0 = c.imgs.map((img) => img.angle), da = c.imgs.map(() => Phaser.Math.Between(-25, 25));
    c.imgs.forEach((img) => img.setTint(0x506070));
    const t = { ms: 0 };
    this.scene.tweens.add({
      targets: t,
      ms: corpseLife(c.imgs.length),
      duration: corpseLife(c.imgs.length),
      onUpdate: () => {
        c.imgs.forEach((img, i) => {
          const k = corpseAt(i, t.ms);
          img.setY(y0[i] + 3 * k.limp).setAngle(a0[i] + da[i] * k.limp).setAlpha(k.alpha);
        });
      },
      onComplete: () => c.imgs.forEach((img) => img.destroy()),
    });
  }

  debug() {
    return { chains: [...this.live.values()].map((c) => ({ key: c.key, coil: +c.st.coil.toFixed(2), shock: +c.st.shock.toFixed(2), speed: Math.round(c.st.speed) })) };
  }
}

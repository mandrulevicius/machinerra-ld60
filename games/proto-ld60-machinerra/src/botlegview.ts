/**
 * A robot's spider legs on screen (P53): the pose is `botlegs.ts` (planted feet that step ahead, hips that ride up a mesa's edge), this is
 * the drawing: a thigh, a shin and a knee joint per leg (`botleg-*` textures, `botlegart.ts`), the legs behind the body drawn behind it and
 * the ones in front over it. `BotsView` owns the robot's body and calls `step` (before it places the body: it returns how far the hips have
 * lifted the body above the map's ground) and `draw` (after it has dressed the body: the legs wear its tint and fade). Pieces are plain
 * sprites, made when a robot puts the legs on and gone when it takes them off or is hauled away.
 */
import type Phaser from 'phaser';
import { S as TEX } from './art';
import { BOT_LEGS, LEN, newBotLegs, poseBotLegs, replant, stepBotLegs, type BotLegSet, type LegPose } from './botlegs';
import { BOT_LEG_ART } from './botlegart';
import { elevAt } from './sim/spider';
import type { Sim } from './sim/sim';

type Img = Phaser.GameObjects.Image;
interface Piece { femur: Img; shin: Img; knee: Img }

export class BotLegSprites {
  private set: BotLegSet;
  private pieces: Piece[];
  private poses: LegPose[] = [];
  /** It was not on screen last frame: its feet are wherever the body left them, so plant them at rest when it returns. */
  private away = false;

  constructor(private scene: Phaser.Scene, sim: Sim, x: number, y: number) {
    this.set = newBotLegs(x, y, (px, py) => elevAt(sim.map.ter, sim.W, sim.H, px, py), Math.random);
    this.pieces = this.set.legs.map(() => ({
      femur: scene.add.image(x, y, 'botleg-femur').setOrigin(0, 0.5).setVisible(false),
      shin: scene.add.image(x, y, 'botleg-tibia').setOrigin(0, 0.5).setVisible(false),
      knee: scene.add.image(x, y, 'botleg-joint').setVisible(false),
    }));
  }

  /** The body is at (x, y) `dt` s after its last frame: step the feet. Returns the px the body rides above the ground's sea level (a mesa's top lifts it). */
  step(x: number, y: number, dt: number, onScreen: boolean): number {
    if (!onScreen) {
      this.away = true;
      return this.set.z - LEN.stand;
    }
    if (this.away) {
      this.away = false;
      replant(this.set, x, y);
    }
    stepBotLegs(this.set, x, y, dt);
    return this.set.z - LEN.stand;
  }

  /** Lay the pieces. (`dx`, `dy`): where the body is drawn from where it is in the world (it slides onto the lift). `depth`: the body's. */
  draw(dx: number, dy: number, depth: number, tint: number | null, alpha: number, visible: boolean) {
    const poses = poseBotLegs(this.set, this.poses);
    const s = BOT_LEGS.size;
    this.pieces.forEach((p, i) => {
      const o = poses[i];
      p.femur.setVisible(visible);
      p.shin.setVisible(visible);
      p.knee.setVisible(visible);
      if (!visible) return;
      const d = depth + (o.far ? -1.5 : 1.5) + (o.air ? 0.2 : 0);
      const H = { x: o.hip.x + dx, y: o.hip.y - o.hip.z + dy }, K = { x: o.knee.x + dx, y: o.knee.y - o.knee.z + dy }, F = { x: o.foot.x + dx, y: o.foot.y - o.foot.z + dy };
      this.seg(p.femur, H, K, BOT_LEG_ART.femur.w, s * 0.8, d, tint, alpha);
      this.seg(p.shin, K, F, BOT_LEG_ART.tibia.w, s * 0.8, d + 0.1, tint, alpha);
      p.knee.setPosition(K.x, K.y).setScale((s * 0.75) / TEX).setDepth(d + 0.2).setAlpha(alpha);
      if (tint === null) p.knee.clearTint();
      else p.knee.setTint(tint);
    });
  }

  private seg(im: Img, a: { x: number; y: number }, b: { x: number; y: number }, texLen: number, thick: number, depth: number, tint: number | null, alpha: number) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 0.01;
    im.setPosition(a.x, a.y).setRotation(Math.atan2(dy, dx)).setScale(len / (texLen * TEX), thick / TEX).setFlipY(dx < 0).setDepth(depth).setAlpha(alpha);
    if (tint === null) im.clearTint();
    else im.setTint(tint);
  }

  /** Where the feet and knees are (screen px offsets aside), for the tests and the pane. */
  debug() {
    return { z: +this.set.z.toFixed(1), feet: this.set.legs.map((l) => ({ x: Math.round(l.foot.x), y: Math.round(l.foot.y), z: +l.foot.z.toFixed(1), air: l.t > 0 })) };
  }

  destroy() {
    for (const p of this.pieces) {
      p.femur.destroy();
      p.shin.destroy();
      p.knee.destroy();
    }
  }
}

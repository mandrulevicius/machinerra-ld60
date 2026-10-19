/**
 * Two small helpers for effects that come and go in a fight (V4):
 * `FadePool` reuses Graphics for one-shot flashes, lines and rings that fade out (a counter-driven update in place of a tween per event);
 * `GlowBands` keeps the additive 'glow' sprites in two Layers, so their draws sit together and do not break the batch of the sprites by them.
 */
import Phaser from 'phaser';

type Gfx = Phaser.GameObjects.Graphics;
type Img = Phaser.GameObjects.Image;

interface Fade {
  g: Gfx;
  age: number;
  dur: number;
  grow: number;
  ease: (t: number) => number;
}

const linear = (t: number) => t;
export const quadOut = (t: number) => t * (2 - t);

export class FadePool {
  private free: Gfx[] = [];
  private live: Fade[] = [];

  constructor(private scene: Phaser.Scene) {}

  /** A cleared Graphics to draw into; it fades to nothing over `ms` (growing to `grow` times its size) and is then kept for the next. */
  spawn(o: { depth: number; ms: number; add?: boolean; x?: number; y?: number; grow?: number; ease?: (t: number) => number }): Gfx {
    const g = this.free.pop() ?? this.scene.add.graphics();
    g.setPosition(o.x ?? 0, o.y ?? 0).setScale(1).setAlpha(1).setDepth(o.depth).setBlendMode(o.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL).setVisible(true);
    this.live.push({ g, age: 0, dur: o.ms / 1000, grow: o.grow ?? 1, ease: o.ease ?? linear });
    return g;
  }

  /** Age every fade by `dt` seconds. */
  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i];
      f.age += dt;
      const t = Math.min(1, f.age / f.dur), e = f.ease(t);
      f.g.setAlpha(1 - e);
      if (f.grow !== 1) f.g.setScale(1 + (f.grow - 1) * e);
      if (t < 1) continue;
      f.g.clear().setVisible(false);
      this.free.push(f.g);
      this.live[i] = this.live[this.live.length - 1];
      this.live.pop();
    }
  }
}

/** Under the units (over the ground's shadows) and over the units (under the effects at 71000). */
const UNDER = -3;
const OVER = 70000;

export class GlowBands {
  private under: Phaser.GameObjects.Layer;
  private over: Phaser.GameObjects.Layer;

  constructor(scene: Phaser.Scene) {
    this.under = scene.add.layer().setDepth(UNDER);
    this.over = scene.add.layer().setDepth(OVER);
  }

  /** A new additive 'glow' sprite in a band. Additive draws add up in any order, so inside a band they carry no depth. */
  glow(scene: Phaser.Scene, band: 'under' | 'over', tint: number, x = 0, y = 0): Img {
    const img = scene.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(tint);
    (band === 'under' ? this.under : this.over).add(img);
    return img;
  }
}

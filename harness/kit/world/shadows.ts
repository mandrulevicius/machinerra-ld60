import Phaser from 'phaser';
import { quality } from '../state';
import type { Obj } from './cull';
import { MARK_SOFT, ensureTextures } from './textures';

export interface ShadowOpts {
  /** Width as a fraction of the object's display width (default 1). */
  scale?: number;
  /** Opacity (default: the world's `shadows.alpha`, 0.35). */
  alpha?: number;
  /** Squash: shadow height / width (default 0.5, an ellipse on the ground). */
  squash?: number;
  /** Distance from the object's centre down to its feet, as a fraction of its display height (default 0.4). */
  foot?: number;
  /** Extra offset of this shadow, px, on top of the world's `light`. */
  dx?: number;
  dy?: number;
  /** Texture key of the shadow's shape (default `MARK_SOFT`, a soft ellipse): a game's own white-on-clear shape, centred on the contact point. */
  key?: string;
  /** Colour of this shadow (default: the world's `shadows.tint`, black). */
  tint?: number;
}

export interface Shadow {
  /** How far the object is off the ground: scales the light offset (0 = right under it, 1 = normal, 3 = flying high). Changing it is cheap: use it for jumps. */
  height: number;
  /** Pixels the object has been lifted from the ground by its own drawing (a rise, a climb): the shadow stays on the ground. */
  raise: number;
  alpha: number;
  remove(): void;
}

interface Item extends Required<Omit<ShadowOpts, 'alpha' | 'key' | 'tint'>> {
  obj: Obj & { displayWidth: number; displayHeight: number };
  im: Phaser.GameObjects.Image;
  h: Shadow;
}

/**
 * Soft blob shadows: one tinted, squashed sprite under each object, drawn below the objects, following them while they are
 * visible. Honors `quality.shadows`: off hides them all and skips the updates. A shadow disappears with its object
 * (destroyed) or while it is invisible or inactive (culled, pooled).
 * `light` is the offset a height-1 shadow gets, i.e. the direction light comes from: {x: 8, y: 6} throws shadows down-right.
 */
export class Shadows {
  /** Offset direction for every shadow, px at height 1 (default none: shadows sit straight under objects). */
  light = { x: 0, y: 0 };
  alpha = 0.35;
  /** Colour of new shadows (default black): the land's shade, so a shadow matches the ones painted into the ground. */
  tint = 0x000000;
  /**
   * Throw one shadow another way: called each frame for every visible shadow with its foot (x, y) and `o`, preset to
   * `{ x: light.x, y: light.y, a: 1 }`; change `o.x`, `o.y` (the lean at height 1) or `o.a` (an alpha multiplier). Use it for a
   * light that is not the world's (a lamp, a fire). Null: every shadow takes `light`.
   */
  lean: ((x: number, y: number, o: { x: number; y: number; a: number }) => void) | null = null;
  private o = { x: 0, y: 0, a: 1 };
  private items = new Set<Item>();
  private on: boolean;
  private off: () => void;

  constructor(private scene: Phaser.Scene, private depth = -50) {
    ensureTextures(scene);
    this.on = quality().get().shadows;
    this.off = quality().on(() => this.setOn(quality().get().shadows));
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.off();
      this.items.clear();
    });
  }

  get count() {
    return this.items.size;
  }
  /** True while `quality.shadows` is on. */
  get enabled() {
    return this.on;
  }

  add(obj: Obj, o: ShadowOpts = {}): Shadow {
    const im = this.scene.add.image(obj.x, obj.y, o.key ?? MARK_SOFT).setTint(o.tint ?? this.tint).setDepth(this.depth).setVisible(false);
    const item: Item = {
      obj: obj as Item['obj'],
      im,
      scale: o.scale ?? 1,
      squash: o.squash ?? 0.5,
      foot: o.foot ?? 0.4,
      dx: o.dx ?? 0,
      dy: o.dy ?? 0,
      h: {
        height: 1,
        raise: 0,
        alpha: o.alpha ?? this.alpha,
        remove: () => {
          im.destroy();
          this.items.delete(item);
        },
      },
    };
    this.items.add(item);
    return item.h;
  }

  update() {
    if (!this.on) return;
    for (const it of this.items) {
      const { obj, im, h } = it;
      if (!obj.scene) {
        h.remove();
        continue;
      }
      const show = obj.visible && obj.active;
      if (im.visible !== show) im.setVisible(show);
      if (!show) continue;
      const w = (obj.displayWidth * it.scale) / im.width;
      const o = this.o;
      o.x = this.light.x;
      o.y = this.light.y;
      o.a = 1;
      const fx = obj.x + it.dx, fy = obj.y + obj.displayHeight * it.foot + it.dy + h.raise;
      this.lean?.(fx, fy, o);
      im.setPosition(fx + o.x * h.height, fy + o.y * h.height)
        .setScale(w, w * it.squash)
        .setAlpha(h.alpha * o.a);
    }
  }

  private setOn(v: boolean) {
    this.on = v;
    if (!v) for (const it of this.items) it.im.setVisible(false);
  }
}

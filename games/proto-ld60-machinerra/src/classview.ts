/**
 * The class overlay (dev, P47 part A): every classified thing on screen (`sim/classes.ts`) as a flat patch of its class's
 * colour over a dimmed land, so one screenshot shows whether locations stand out from the open ground: scenery grey, loot
 * gold, interact cyan, centre red. Toggle: dev `classes [on|off]` (group `world`, `classcmd.ts`), the F10 Game tab, the
 * bench's C key. `npm run land` shoots a whole land with it.
 *
 * It costs nothing off: nothing is built until it is first turned on, `update` returns at once while off, and turning it
 * off hides what it built. On, a frame is one dim rectangle and one Graphics redrawn for the things in view.
 * Both scenes use it: Play lists it among its views, the place bench calls `update` itself. It only needs a scene and a
 * function that lists the classed things.
 */
import type Phaser from 'phaser';
import type { Classed, ThingClass } from './sim/classes';
import { THING_CLASSES } from './sim/classes';
import type { View } from './playhost';

/** One flat colour per class (guesses). */
export const CLASS_COLOR: Record<ThingClass, number> = { scenery: 0x8c8c94, loot: 0xffc832, interact: 0x28d8ff, centre: 0xff2a2a };
const DIM = { color: 0x0d0b09, alpha: 0.64 };
/** Above every sprite, shadow and light the world draws, under the HUD text (97000+). */
const DEPTH = 90000;
/** A patch is never smaller than this on screen (px), so a far zoom shows what is there. */
const MIN_SCREEN = 5;

export class ClassOverlay implements View {
  private dim?: Phaser.GameObjects.Rectangle;
  private g?: Phaser.GameObjects.Graphics;
  private _on = false;
  private counts: Record<ThingClass, number> = { scenery: 0, loot: 0, interact: 0, centre: 0 };

  constructor(private scene: Phaser.Scene, private things: () => Classed[]) {}

  get on() {
    return this._on;
  }

  set(on: boolean) {
    this._on = on;
    if (on && !this.dim) {
      this.dim = this.scene.add.rectangle(0, 0, 10, 10, DIM.color, DIM.alpha).setOrigin(0).setDepth(DEPTH);
      this.g = this.scene.add.graphics().setDepth(DEPTH + 1);
    }
    this.dim?.setVisible(on);
    this.g?.setVisible(on);
    if (on) this.update();
    else this.g?.clear();
  }

  toggle() {
    this.set(!this._on);
    return this._on;
  }

  /** Every frame: the dim follows the view, the patches are redrawn for the classed things inside it. */
  update() {
    if (!this._on || !this.dim || !this.g) return;
    const cam = this.scene.cameras.main, v = cam.worldView, g = this.g;
    this.dim.setPosition(v.x - 2, v.y - 2).setSize(v.width + 4, v.height + 4);
    g.clear();
    this.counts = { scenery: 0, loot: 0, interact: 0, centre: 0 };
    const minR = MIN_SCREEN / 2 / cam.zoom, line = 1 / cam.zoom;
    // Scenery first, centres last, so the heart is never hidden under a wall.
    const list = this.things().filter((t) => t.x + t.r >= v.x - 40 && t.x - t.r <= v.right + 40 && t.y + t.r >= v.y - 40 && t.y - t.r <= v.bottom + 40);
    for (const cls of THING_CLASSES) {
      for (const t of list) {
        if (t.cls !== cls) continue;
        this.counts[cls]++;
        const r = Math.max(t.r, minR);
        g.fillStyle(CLASS_COLOR[cls], 1).fillRoundedRect(t.x - r, t.y - r, r * 2, r * 2, r * 0.35);
        g.lineStyle(line, 0x0d0b09, 0.9).strokeRoundedRect(t.x - r, t.y - r, r * 2, r * 2, r * 0.35);
      }
    }
  }

  /** How many of each class the land holds in all, on screen or not (only asked for while it is on). */
  totals() {
    const n: Record<ThingClass, number> = { scenery: 0, loot: 0, interact: 0, centre: 0 };
    for (const t of this.things()) n[t.cls]++;
    return n;
  }

  debug() {
    return { classes: { on: this._on, counts: { ...this.counts }, ...(this._on && { total: this.totals() }), colors: Object.fromEntries(THING_CLASSES.map((c) => [c, '#' + CLASS_COLOR[c].toString(16).padStart(6, '0')])) } };
  }

  destroy() {
    this.dim?.destroy();
    this.g?.destroy();
    this.dim = this.g = undefined;
  }
}

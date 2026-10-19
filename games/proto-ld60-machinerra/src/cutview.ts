/**
 * The Oracle's cutscene look (P59 C, Minos: "when time stopped due to oracle speaking, should zoom into player, everything
 * else greyed out, to signify a cutscene"). Drawn from sim state alone: while `sim.lessons.hush` holds (`sim/lessons.ts`), the
 * camera eases in on the Communicator and the world greys and dims; he stays in colour; both ease back when the pause ends
 * (the player's press or act ends it, never a timer: `decisions.md` "reading pace"). The HUD's side (her panel at centre, the
 * rest dimmed) is `Hud.update`'s `mc-cut` class.
 * How: one colour-matrix filter on the main camera (one full-screen pass, inactive and free while no pause holds) and a second
 * camera, visible only during a pause, that draws his own pieces over the greyed view; it ignores every other object, checked
 * each frame of a pause so a thing made mid-pause stays grey.
 * A pause that waits for the call (`barrage`) keeps the hive it is about on screen: the zoom stops where the hive still fits.
 */
import type Phaser from 'phaser';
import { ViewBase } from './playhost';
import { T } from './sim/defs';
import { LESSON } from './sim/lessons';

/** Guesses: `zoom` the camera's zoom times this at full cut, `dim` how much darker the grey world is, `ease` share per second the look moves, `fit` the share of the half view a hive may take in the call's pause. */
export const CUT = { zoom: 1.6, dim: 0.25, ease: 2.5, fit: 0.8 };

const smooth = (k: number) => k * k * (3 - 2 * k);

export class CutView extends ViewBase {
  /** 0 no cut .. 1 full cut, eased by `CUT.ease`. */
  private amt = 0;
  private grey?: Phaser.Filters.ColorMatrix;
  private cam?: Phaser.Cameras.Scene2D.Camera;
  private zoom = 1;

  update(dt: number) {
    const on = !!this.sim.lessons.hush;
    this.amt = Math.max(0, Math.min(1, this.amt + (on ? 1 : -1) * CUT.ease * dt));
    const main = this.scene.cameras.main;
    const e = smooth(this.amt);
    if (!this.grey) {
      if (!e) return;
      this.grey = main.filters!.internal.addColorMatrix();
    }
    this.grey.active = e > 0;
    if (this.cam) this.cam.visible = e > 0;
    if (!e) return;
    const m = this.grey.colorMatrix;
    m.reset();
    m.saturate(-e);
    m.brightness(1 - CUT.dim * e, true);
    // `CommandMode.update` sets the player's zoom every frame before the views: the cut multiplies it.
    const base = main.zoom;
    let z = base * (1 + (CUT.zoom - 1) * e);
    const c = this.sim.controller;
    if (this.sim.lessons.hush?.until === 'barrage') {
      const hive = this.sim.nests.find((n) => !n.dead && Math.hypot(n.x - c.x, n.y - c.y) < LESSON.hive * T);
      if (hive) {
        const dx = Math.abs(hive.x - c.x) + 1, dy = Math.abs(hive.y - c.y) + 1;
        z = Math.max(base, Math.min(z, (CUT.fit * main.width) / 2 / dx, (CUT.fit * main.height) / 2 / dy));
      }
    }
    this.zoom = z;
    main.setZoom(z);
  }

  /** After every view has moved the camera and made its objects: the colour camera follows the main one and draws only him. */
  late() {
    if (!this.amt) return;
    const main = this.scene.cameras.main;
    const cam = (this.cam ??= this.scene.cameras.add(main.x, main.y, main.width, main.height).setName('cut'));
    cam.visible = true;
    cam.setZoom(main.zoom).setScroll(main.scrollX, main.scrollY);
    const mine = this.pieces();
    for (const o of this.scene.children.list) if (!mine.has(o) && !(o.cameraFilter & cam.id)) cam.ignore(o);
    for (const o of mine) o.cameraFilter &= ~cam.id;
  }

  /** The Communicator's own pieces: his body and what hangs on it. */
  private pieces() {
    const c = this.comm, v = this.bots.get(this.sim.controller.id);
    return new Set<Phaser.GameObjects.GameObject>([...(v ? [v.spr] : []), ...(c ? [c.shovel, c.hat, c.pack, c.glow, c.bead, c.antenna, ...c.cans] : [])]);
  }

  debug() {
    return { cut: { on: !!this.sim.lessons.hush, k: +this.amt.toFixed(2), zoom: +this.zoom.toFixed(2), colourCam: !!this.cam?.visible } };
  }
}

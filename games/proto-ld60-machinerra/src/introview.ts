/**
 * Mission 1's old works on screen (`sim/intro.ts`): the crash landing as the scene opens, the shovel lying where he will find it,
 * the dazed Crawlcams' stars, the falls of the den's blockage and the lift's, and a free respawn's flash. The cues on the floor
 * and the HUD's reveals are the onboard's (`cueview.ts`, `hud.ts`); the Oracle's lines are her panel's.
 * Every look and number here is a guess.
 */
import type Phaser from 'phaser';
import { ViewBase, type G } from './playhost';
import { T } from './sim/defs';
import { introLetters } from './sim/intro';
import type { SimEvent } from './sim/sim';

/** The dazed stars: how many, their orbit (px) and how fast they turn (radians a second). */
const DAZE = { n: 3, r: 11, spin: 3.2, color: 0xffe9a0 };

export class IntroView extends ViewBase {
  private shovel: Phaser.GameObjects.Image | null = null;
  private landed = false;
  private t = 0;

  update(dt: number, g: G) {
    const sim = this.sim, run = sim.intro;
    if (!run) return;
    this.t += dt;
    if (!this.landed) {
      // He comes down through the roof: a thump, dust and a shake as the scene opens.
      this.landed = true;
      const c = sim.controller;
      this.k.juice.shake('medium');
      this.k.fx.burst(c.x, c.y + 6, { color: 0xc8a070, size: 2.2 });
      this.sfx('crunch', c.x, c.y, { gain: 0.9 });
      const v = introLetters().v?.[0];
      if (v && !run.armed) this.shovel = this.scene.add.image((v.x + 0.5) * T, (v.y + 0.5) * T, 'gear-shovel').setScale(0.32).setRotation(-0.6).setDepth((v.y + 0.5) * T);
    }
    if (this.shovel) this.shovel.y += Math.sin(this.t * 2.4) * 0.06;
    // Dazed: small stars turning over its head.
    for (const h of sim.hornets) {
      if (!h.dazed || h.dead) continue;
      for (let i = 0; i < DAZE.n; i++) {
        const a = this.t * DAZE.spin + (i / DAZE.n) * Math.PI * 2;
        g.fillStyle(DAZE.color, 0.85);
        g.fillCircle(h.x + Math.cos(a) * DAZE.r, h.y - 30 + Math.sin(a) * DAZE.r * 0.4, 2);
      }
    }
  }

  event(e: SimEvent) {
    if (e.e !== 'intro') return;
    const x = e.x ?? this.sim.controller.x, y = e.y ?? this.sim.controller.y;
    switch (e.what) {
      case 'shovel':
        this.shovel?.destroy();
        this.shovel = null;
        this.sfx('pickup', x, y);
        break;
      case 'open':
      case 'lift':
        this.k.juice.shake('medium');
        this.k.fx.burst(x, y, { color: 0xb0a090, size: 2.4 });
        this.sfx('crunch', x, y);
        break;
      case 'respawn':
        this.flash(x, y, 0xffd070, 2.2);
        this.k.fx.burst(x, y, { color: 0xffd070, size: 1.2 });
        break;
    }
  }

  destroy() {
    this.shovel?.destroy();
  }
}

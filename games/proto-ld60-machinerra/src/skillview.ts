/**
 * The robots' abilities at work on screen (P15; the rules are `sim/botskills.ts`): the Boilermancer's steam clouds rolling on
 * the ground, the Lamplighter's flares (a light and a bright disc until they burn out), a Stalker's stroke and its stealth.
 * A view of the mission (`playhost.ts`): `event` for the `ability` events, `update` each frame with the world's graphics.
 */
import Phaser from 'phaser';
import { FRIEND, LINE } from './house';
import { ViewBase, type Light } from './playhost';
import { areasOf } from './sim/botskills';
import type { SimEvent } from './sim/sim';

export class SkillView extends ViewBase {
  /** The light of each flare lying on the ground (by area id), removed when it burns out. */
  private lights = new Map<number, Light>();

  event(e: SimEvent) {
    if (e.e !== 'ability') return;
    switch (e.what) {
      case 'cloud':
        this.sfx('swish', e.x, e.y, { gain: 0.4, vary: 0.2 });
        this.k.fx.burst(e.x, e.y - 8, { color: 0xeeeeee, size: 1.1 });
        break;
      case 'flare':
        this.sfx('zap', e.x, e.y, { gain: 0.35, vary: 0.1 });
        this.flash(e.x, e.y - 10, 0xfff0b0, 3);
        break;
      case 'stab':
        this.k.fx.burst(e.x, e.y - 10, { color: e.back ? 0xff5040 : 0xe8e8ee, size: e.back ? 0.7 : 0.4 });
        if (e.back) this.floater(e.x, e.y - 34, 'from behind', '#ffd0c0', 800, 12);
        this.sfx('swish', e.x, e.y, { gain: 0.3, vary: 0.3 });
        break;
      case 'hide':
        this.k.fx.burst(e.x, e.y - 12, { color: 0x6a5a80, size: 0.5 });
        break;
      case 'show':
        this.k.fx.burst(e.x, e.y - 12, { color: 0xa0a0b0, size: 0.3 });
        break;
    }
  }

  update(_dt: number, g: Phaser.GameObjects.Graphics) {
    const time = this.scene.time.now;
    const live = new Set<number>();
    for (const a of areasOf(this.sim)) {
      live.add(a.id);
      const fade = Math.min(1, a.ttl / 1.2); // the last second thins out
      if (a.puddle) {
        // Wet Season: a still pool where the cloud was.
        g.fillStyle(0x5a9ccf, 0.3 * fade).fillEllipse(a.x, a.y, a.r * 2, a.r * 1.24);
        g.lineStyle(LINE.effect, 0x8cc4ee, 0.5 * fade).strokeEllipse(a.x, a.y, a.r * 2, a.r * 1.24);
      } else if (a.kind === 'cloud') {
        // A rolling bank of steam: a few soft puffs drifting round the middle, and its edge.
        for (let i = 0; i < 7; i++) {
          const ang = time / 900 + (i * Math.PI * 2) / 7 + a.id, rr = a.r * (0.35 + 0.3 * Math.sin(time / 700 + i * 1.7));
          const x = a.x + Math.cos(ang) * rr, y = a.y + Math.sin(ang) * rr * 0.62 - 6, s = a.r * (0.32 + 0.06 * Math.sin(time / 500 + i));
          g.fillStyle(0xf2f2f2, 0.28 * fade).fillEllipse(x, y, s * 2, s * 1.5);
        }
        g.lineStyle(LINE.effect, FRIEND, 0.45 * fade).strokeEllipse(a.x, a.y, a.r * 2, a.r * 1.24);
      } else {
        const pulse = 1 + 0.06 * Math.sin(time / 120 + a.id);
        g.fillStyle(0xfff0b0, 0.14 * fade).fillEllipse(a.x, a.y, a.r * 2 * pulse, a.r * 1.24 * pulse);
        g.fillStyle(0xffe890, 0.9 * fade).fillCircle(a.x, a.y - 12, 5);
        g.lineStyle(LINE.effect, 0xfff0b0, 0.5 * fade).strokeEllipse(a.x, a.y, a.r * 2, a.r * 1.24);
        let l = this.lights.get(a.id);
        if (!l) {
          l = this.k.lights.add(a.x, a.y - 12, { color: 0xfff0b0, radius: a.r * 1.6, intensity: 1.4 });
          this.lights.set(a.id, l);
        }
        l.setIntensity(1.4 * fade);
      }
    }
    for (const [id, l] of this.lights)
      if (!live.has(id)) {
        this.k.lights.remove(l);
        this.lights.delete(id);
      }
  }
}

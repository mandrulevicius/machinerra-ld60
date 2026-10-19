/**
 * The sniffer dog on screen (P42; rules in `sim/companions.ts`): it trots after the Communicator (two run frames), stops with its
 * nose out toward what it smells (a thin pale scent line out of the nose, a few ticks along it), digs at a mound (Good Nose) and
 * barks (a floater, a woof, the Oracle says the rest). It rides the lift if it is on it. The stray cat's place draws its own cat
 * (`placeviewsq.ts`); the cat's events (an eaten gob, tamed) are heard here.
 * Add a companion look: its frames in `placeartq.ts`, a branch in `update`.
 */
import { S } from './art';
import { LINE } from './house';
import { ViewBase, type Img } from './playhost';
import { groundShadow } from './shadowview';
import type { Shadow } from '../../../harness/kit';
import type Phaser from 'phaser';
import type { SimEvent } from './sim/sim';

/** How the scent line looks: its colour and how far it reaches from the nose, px. */
const SCENT = { color: 0xd8f0ff, reach: 70 };

export class CompanionView extends ViewBase {
  private img: Img | null = null;
  private shadow: Shadow | null = null;
  private last = { x: 0, y: 0 };

  private make() {
    const d = this.sim.dog;
    if (!d || this.img) return;
    this.img = this.w.cull.add(this.scene.add.image(d.bot.x, d.bot.y, 'dog-stand').setScale(1 / S).setOrigin(0.5, 0.88), { mobile: true });
    this.shadow = groundShadow(this.w, this.img, { fine: true });
    this.last = { x: d.bot.x, y: d.bot.y };
  }

  update(_dt: number, g: Phaser.GameObjects.Graphics) {
    const sim = this.sim, d = sim.dog;
    if (!d) return;
    this.make();
    const img = this.img!;
    const b = d.bot, now = this.scene.time.now;
    const up = sim.phase === 'rising' && sim.onLift(b, 1.6) ? this.host.rise() : 0;
    const moved = Math.hypot(b.x - this.last.x, b.y - this.last.y) > 0.3;
    this.last = { x: b.x, y: b.y };
    const digging = d.digT > 0;
    const key = digging ? 'dog-dig' : d.pointing ? 'dog-point' : moved ? `dog-run-${Math.floor(now / 130) % 2}` : 'dog-stand';
    if (img.texture.key !== key) img.setTexture(key);
    const east = d.pointing ? Math.cos(d.aim) >= 0 : b.face >= 0;
    img.setFlipX(!east);
    img.setPosition(b.x, b.y - up + (moved && !d.pointing ? -Math.abs(Math.sin(now / 65)) * 2 : 0)).setDepth(b.y);
    this.w.cull.moved(img);
    if (this.shadow) this.shadow.raise = up;
    // The scent: a pale line out of the nose toward what it points at, ticks travelling along it.
    if (d.pointing && d.target) {
      const nx = b.x + (east ? 20 : -20), ny = b.y - 14 - up;
      const a = d.aim;
      g.lineStyle(LINE.accent, SCENT.color, 0.4).lineBetween(nx, ny, nx + Math.cos(a) * SCENT.reach, ny + Math.sin(a) * SCENT.reach);
      for (let i = 0; i < 3; i++) {
        const f = (((now / 700 + i / 3) % 1) * SCENT.reach) | 0;
        g.fillStyle(SCENT.color, 0.8 - f / (SCENT.reach * 1.3)).fillCircle(nx + Math.cos(a) * f, ny + Math.sin(a) * f, 2);
      }
    }
  }

  event(e: SimEvent) {
    if (e.e === 'dog') {
      const name = this.sim.dog?.name ?? 'The dog';
      if (e.what === 'join') this.sfx('woof', e.x, e.y, { gain: 0.8 });
      else if (e.what === 'point') {
        this.sfx('ears', e.x, e.y, { gain: 0.5 });
        if (this.sim.dog) this.floater(this.sim.dog.bot.x, this.sim.dog.bot.y - 34, '?', '#d8f0ff', 900, 20);
      } else if (e.what === 'bark') {
        this.sfx('woof', e.x, e.y, { gain: 1 });
        this.floater(e.x, e.y - 40, e.text === 'twisted' ? 'WOOF!' : 'Woof. Woof.', '#ffd98a', 1600, 22);
        this.flash(e.x, e.y - 20, 0xffd98a, 1);
      } else if (e.what === 'dig') this.sfx('rock', e.x, e.y, { gain: 0.4 });
      else if (e.what === 'dug') {
        this.sfx('pickup', e.x, e.y, { gain: 0.7 });
        this.k.fx.burst(e.x, e.y - 6, { color: 0xa07a4c, size: 0.9 });
      } else if (e.what === 'home') this.floater(e.x, e.y - 40, `${name} is home`, '#ffd98a', 2400, 20);
    } else if (e.e === 'cat') {
      this.sfx('mew', e.x, e.y, { gain: 0.8 });
      if (e.what === 'eat') this.floater(e.x, e.y - 24, 'crunch', '#fff3d6', 1000, 16);
      else {
        this.floater(e.x, e.y - 40, 'tamed', '#ffd98a', 2800, 22);
        this.flash(e.x, e.y - 20, 0xffd98a, 1.4);
        this.k.fx.burst(e.x, e.y - 14, { color: 0xffd98a, size: 0.8 });
      }
    }
  }

  debug() {
    const d = this.sim.dog;
    return d ? { dog: { texture: this.img?.texture.key ?? null, pointing: d.pointing } } : {};
  }

  destroy() {
    this.img?.destroy();
    this.shadow = null;
  }
}

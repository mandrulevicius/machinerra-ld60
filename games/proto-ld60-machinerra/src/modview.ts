/**
 * Weapon mods at work on screen (P57; the rules are `sim/mods.ts`): the stab, the Gramophone Horn's chord (arcs of sound), the
 * brass pigeons in flight, the echo's ring, the Gimbal's thrown weapon, the Tuning Fork's ring, the stopped clock, the Teapot's
 * whistle and burst, the Lightning Rod's bolt from the Wanderer. A view of the mission (`playhost.ts`): `event` for the `mod`
 * events, `update` each frame for what flies (pigeons, the thrown weapon). Placeholders drawn in code, like the rest of the gear.
 */
import Phaser from 'phaser';
import { LINE } from './house';
import type { Img, G } from './playhost';
import { ViewBase } from './playhost';
import { itemOfWeapon } from './sim/gear';
import type { SimEvent } from './sim/sim';

const BRASS = '#c8963c', BRASS_HI = '#f0cf7a', SOOT = '#1d1a17';

/** A brass pigeon, facing right, 28 x 20 (drawn at 2x). */
function pigeonTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('mod-pigeon')) return;
  const cv = document.createElement('canvas');
  cv.width = 56;
  cv.height = 40;
  const c = cv.getContext('2d')!;
  c.lineWidth = 3;
  c.strokeStyle = SOOT;
  c.lineJoin = 'round';
  const blob = (x: number, y: number, rx: number, ry: number, fill: string, rot = 0) => {
    c.beginPath();
    c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    c.stroke();
  };
  blob(26, 22, 18, 11, BRASS, -0.1); // body
  c.beginPath(); // tail
  c.moveTo(10, 20);
  c.lineTo(0, 14);
  c.lineTo(2, 28);
  c.closePath();
  c.fillStyle = '#9a6a2a';
  c.fill();
  c.stroke();
  blob(42, 14, 7, 7, BRASS_HI); // head
  c.beginPath(); // beak
  c.moveTo(48, 13);
  c.lineTo(55, 16);
  c.lineTo(48, 18);
  c.closePath();
  c.fillStyle = '#e0e0e0';
  c.fill();
  c.stroke();
  c.beginPath(); // wing
  c.moveTo(18, 20);
  c.quadraticCurveTo(26, 4, 36, 18);
  c.quadraticCurveTo(28, 26, 18, 20);
  c.fillStyle = '#e8c060';
  c.fill();
  c.stroke();
  c.beginPath(); // eye: a small cyan lamp
  c.arc(43, 12, 1.8, 0, Math.PI * 2);
  c.fillStyle = '#3df2ff';
  c.fill();
  scene.textures.addCanvas('mod-pigeon', cv);
}

export class ModView extends ViewBase {
  private pigeons = new Map<number, Img>();
  private boom: Img | null = null;

  constructor(host: ConstructorParameters<typeof ViewBase>[0]) {
    super(host);
    pigeonTexture(this.scene);
  }

  /** A graphics object at (x, y) that grows and fades: arcs, rings, a clock face. */
  private pulse(x: number, y: number, draw: (g: G) => void, o: { ms: number; from: number; to?: number; blend?: boolean }) {
    const g = this.scene.add.graphics({ x, y }).setDepth(71000);
    if (o.blend) g.setBlendMode(Phaser.BlendModes.ADD);
    draw(g);
    g.setScale(o.from);
    // It opens fast and fades late: the shape stays readable for most of its life.
    this.scene.tweens.add({ targets: g, scale: o.to ?? 1, duration: o.ms, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({ targets: g, alpha: 0, duration: o.ms, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
  }

  /** A stroke with a dark underlay, so it reads on the pale sand as well as in the dark. */
  private line(g: G, w: number, color: number, alpha: number, f: () => void) {
    g.lineStyle(w + 4, 0x1d1a17, alpha * 0.6);
    f();
    g.lineStyle(w, color, alpha);
    f();
  }

  event(e: SimEvent) {
    if (e.e !== 'mod') return;
    const { x, y } = e;
    const fx = this.k.fx;
    switch (e.what) {
      case 'stab': {
        const a = e.a ?? 0, r = e.r ?? 50;
        this.pulse(x, y - 14, (g) => this.line(g, LINE.effect + 2, 0xfff0c0, 1, () => g.lineBetween(Math.cos(a) * 12, Math.sin(a) * 12, Math.cos(a) * (r + 8), Math.sin(a) * (r + 8))), { ms: 200, from: 0.8, to: 1.1 });
        this.sfx('hit', x + Math.cos(a) * r, y, { gain: 0.6, vary: 0.2 });
        break;
      }
      case 'chord': {
        // Arcs of sound opening out in front of him, over a gold flash.
        const a = e.a ?? 0, r = e.r ?? 170;
        this.pulse(x, y - 14, (g) => {
          for (let i = 1; i <= 3; i++) this.line(g, 8 - i, i === 3 ? 0xfff2c0 : 0xf6d880, 1 - i * 0.12, () => g.beginPath().arc(0, 0, (r * i) / 3, a - 0.6, a + 0.6).strokePath());
        }, { ms: 560, from: 0.55, to: 1.05 });
        this.flash(x + Math.cos(a) * 50, y + Math.sin(a) * 50, 0xffe0a0, 1.6);
        this.sfx('horn', x, y, { gain: 0.45 });
        this.k.juice.shake('small');
        break;
      }
      case 'pigeon':
        fx.burst(x, y - 20, { color: 0xf0cf7a, size: 0.4 });
        this.sfx('blip', x, y, { gain: 0.6, vary: 0.1 });
        break;
      case 'peck':
        fx.burst(x, y - 22, { color: 0xe8e0cc, size: 0.35 });
        this.sfx('click', x, y, { gain: 0.5, vary: 0.2 });
        break;
      case 'echo':
        this.pulse(x, y - 8, (g) => this.line(g, LINE.effect, 0x3df2ff, 1, () => g.strokeCircle(0, 0, 18)), { ms: 420, from: 0.4, to: 1.6 });
        this.sfx('blip', x, y, { gain: 0.4, vary: 0.1 });
        break;
      case 'throw':
        this.sfx('swish', x, y, { gain: 0.7, vary: 0.1 });
        break;
      case 'catch':
        this.sfx('click', x, y, { gain: 0.7 });
        this.flash(x, y - 10, 0xfff0c0, 0.7);
        break;
      case 'ring': {
        const r = e.r ?? 70;
        this.pulse(x, y - 10, (g) => {
          this.line(g, LINE.effect + 1, 0xfff6d0, 1, () => g.strokeCircle(0, 0, r));
          this.line(g, LINE.detail, 0xfff6d0, 0.6, () => g.strokeCircle(0, 0, r * 0.7));
        }, { ms: 440, from: 0.2, to: 1 });
        this.sfx('bell', x, y, { gain: 0.4, vary: 0.05 });
        break;
      }
      case 'clock': {
        // The clock face over the foe: twelve ticks and two hands, frosted, and everything in it still.
        const r = e.r ?? 90;
        this.pulse(x, y - 10, (g) => {
          g.fillStyle(0xcfeeff, 0.28).fillCircle(0, 0, r);
          this.line(g, LINE.effect + 1, 0xe8f6ff, 1, () => g.strokeCircle(0, 0, r));
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            this.line(g, LINE.detail + 1, 0xe8f6ff, 0.95, () => g.lineBetween(Math.cos(a) * r * 0.84, Math.sin(a) * r * 0.84, Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97));
          }
          this.line(g, LINE.effect + 1, 0xffffff, 1, () => g.lineBetween(0, 0, 0, -r * 0.7).lineBetween(0, 0, r * 0.4, 0));
        }, { ms: 1100, from: 0.7, to: 1 });
        this.flash(x, y - 10, 0xcfeeff, 1.6);
        this.sfx('bell', x, y, { gain: 0.7, vary: 0 });
        break;
      }
      case 'whistle': {
        fx.burst(x, y - 30, { color: 0xeaf2f8, size: 0.7 });
        this.sfx('whistle', x, y, { gain: 0.5 });
        if (e.r) {
          this.pulse(x, y - 10, (g) => {
            g.fillStyle(0xf4f8fb, 0.55).fillCircle(0, 0, e.r!);
            this.line(g, LINE.effect, 0xffffff, 0.9, () => g.strokeCircle(0, 0, e.r!));
          }, { ms: 480, from: 0.2, to: 1 });
          this.sfx('hiss', x, y, { gain: 0.7 });
          this.k.juice.shake('small');
        }
        break;
      }
      case 'skybolt': {
        // From the Wanderer, far above, straight down on the foe.
        const pts: [number, number][] = [[x + 22, y - 520]];
        for (let i = 1; i < 6; i++) pts.push([x + (Math.random() - 0.5) * 50 * (1 - i / 6), y - 520 + (i / 6) * 520]);
        pts.push([x, y - 12]);
        const g = this.scene.add.graphics().setDepth(72000);
        g.lineStyle(LINE.effect + 10, 0x4a78d8, 0.55).beginPath().moveTo(pts[0][0], pts[0][1]);
        for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
        g.strokePath();
        g.lineStyle(LINE.effect + 3, 0xffffff, 1).beginPath().moveTo(pts[0][0], pts[0][1]);
        for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
        g.strokePath();
        this.scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
        this.flash(x, y - 12, 0xcfe4ff, 2.2);
        fx.burst(x, y - 12, { color: 0xcfe4ff, size: 0.8 });
        this.sfx('zap', x, y, { gain: 0.9, vary: 0.05 });
        this.sfx('boom', x, y, { gain: 0.4, vary: 0.1 });
        this.k.juice.shake('small');
        break;
      }
      case 'valve':
        fx.burst(x, y - 24, { color: 0xeaf2f8, size: 0.9 });
        this.sfx('hiss', x, y, { gain: 0.9 });
        break;
      case 'armed':
        fx.burst(x, y - 26, { color: 0xeaf2f8, size: 0.3 });
        this.sfx('blip', x, y, { gain: 0.3, vary: 0.05 });
        break;
      case 'refund':
        fx.burst(x, y - 30, { color: 0xcfeeff, size: 0.35 });
        this.sfx('heal', x, y, { gain: 0.25, vary: 0.1 });
        break;
      case 'magnet':
        this.pulse(x, y - 8, (g) => this.line(g, LINE.detail + 1, 0xff6a5a, 0.8, () => g.strokeCircle(0, 0, e.r ?? 150)), { ms: 420, from: 1, to: 0.15 });
        break;
    }
  }

  /** The pigeons in the air and the weapon the Gimbal threw. */
  update(_dt: number, _g: G) {
    const time = this.scene.time.now;
    const live = new Set<number>();
    for (const s of this.sim.shots) {
      if (!s.pigeon || s.dead) continue;
      live.add(s.id);
      let img = this.pigeons.get(s.id);
      if (!img) {
        img = this.scene.add.image(s.x, s.y, 'mod-pigeon').setScale(0.8).setDepth(70500);
        this.pigeons.set(s.id, img);
      }
      const perched = s.pigeon.pecks < 3 || (s.vx === 0 && s.vy === 0);
      const bob = perched ? Math.abs(Math.sin(time / 60)) * -5 : Math.sin(time / 70 + s.id) * 3;
      img.setPosition(s.x, s.y - 10 + bob);
      if (s.vx !== 0) img.setFlipX(s.vx < 0);
      img.setRotation(perched ? 0 : Math.atan2(s.vy, Math.abs(s.vx) || 1) * (s.vx < 0 ? -1 : 1) * 0.5);
    }
    for (const [id, img] of this.pigeons) {
      if (live.has(id)) continue;
      img.destroy();
      this.pigeons.delete(id);
    }
    const b = this.sim.lug.boom;
    if (b && !this.boom) this.boom = this.scene.add.image(b.x, b.y, `gear-${itemOfWeapon(b.weapon)}`).setScale(0.5).setDepth(70500);
    if (b && this.boom) this.boom.setPosition(b.x, b.y - 14).setRotation(b.spin);
    if (!b && this.boom) {
      this.boom.destroy();
      this.boom = null;
    }
  }

  destroy() {
    for (const img of this.pigeons.values()) img.destroy();
    this.pigeons.clear();
    this.boom?.destroy();
    this.boom = null;
  }
}

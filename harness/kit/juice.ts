/**
 * Juice: shake, flash, zoom punch, hit-stop, sprite flash, sized small/medium/big by the variant
 * ("feedback scaled to importance").
 * Lab facts (Juice probe): camera effects run on the real clock, so they keep going through a hit-stop; the zoom punch
 * uses cam.zoomTo (a tween on cam.zoom would freeze). Hit-stop freezes this scene's tweens, timers, particle emitters
 * and arcade/matter physics, and ends on performance.now() (a delayedCall would be frozen too).
 * Your own update() movement is not frozen: skip it while `juice.frozen`.
 *
 *   const j = kit(this).juice;
 *   j.hit('big');                   shake + flash + punch + hit-stop together
 *   j.shake('small'); j.flash(); j.punch(); j.stop(80); j.flashSprite(enemy);
 */
import Phaser from 'phaser';
import { slot } from './variants';
import { theme } from './theme';

export type Size = 'small' | 'medium' | 'big';
type Table<T> = Record<Size, T>;
export interface JuiceLook {
  /** [ms, intensity] */
  shake: Table<[number, number]>;
  /** ms; 0 = none */
  flash: Table<number>;
  /** [zoom, ms]; zoom 1 = none */
  punch: Table<[number, number]>;
  /** hit-stop ms */
  stop: Table<number>;
}

export const juiceSlot = slot<JuiceLook>('juice', {
  punchy: {
    shake: { small: [100, 0.004], medium: [200, 0.01], big: [320, 0.018] },
    flash: { small: 0, medium: 80, big: 140 },
    punch: { small: [1, 0], medium: [1.03, 70], big: [1.07, 90] },
    stop: { small: 0, medium: 60, big: 110 },
  },
  subtle: {
    shake: { small: [80, 0.002], medium: [140, 0.005], big: [220, 0.009] },
    flash: { small: 0, medium: 0, big: 90 },
    punch: { small: [1, 0], medium: [1, 0], big: [1.03, 80] },
    stop: { small: 0, medium: 30, big: 60 },
  },
  wild: {
    shake: { small: [140, 0.008], medium: [260, 0.018], big: [420, 0.03] },
    flash: { small: 50, medium: 110, big: 180 },
    punch: { small: [1.02, 50], medium: [1.06, 80], big: [1.12, 110] },
    stop: { small: 30, medium: 90, big: 160 },
  },
});

type Pausable = { timeScale: number };

export class Juice {
  frozen = false;
  private until = 0;
  private restore: (() => void)[] = [];
  private baseZoom: number | null = null;

  constructor(private scene: Phaser.Scene) {
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
      this.unfreeze();
    });
  }

  private get cam() {
    return this.scene.cameras.main;
  }

  hit(size: Size = 'medium') {
    this.shake(size);
    this.flash(size);
    this.punch(size);
    this.stop(size);
  }

  shake(size: Size = 'medium') {
    const [ms, k] = juiceSlot.value.shake[size];
    if (ms) this.cam.shake(ms, k, true);
  }

  /** Full-screen flash in the theme's paper colour (or `color`). */
  flash(size: Size = 'medium', color = theme().c.paper) {
    const ms = juiceSlot.value.flash[size];
    if (ms) this.cam.flash(ms, (color >> 16) & 255, (color >> 8) & 255, color & 255, true);
  }

  punch(size: Size = 'medium') {
    const [z, ms] = juiceSlot.value.punch[size];
    if (z === 1 || !ms) return;
    const cam = this.cam;
    this.baseZoom ??= cam.zoom;
    const base = this.baseZoom;
    cam.zoomTo(base * z, ms, 'Quad.easeOut', true, (_c: unknown, p: number) => {
      if (p < 1) return;
      cam.zoomTo(base, ms * 2.5, 'Sine.easeOut', true, (_c2: unknown, p2: number) => {
        if (p2 >= 1) this.baseZoom = null;
      });
    });
  }

  /** Hit-stop for `ms` of real time (or the variant's ms for a size). */
  stop(msOrSize: number | Size = 'medium') {
    const ms = typeof msOrSize === 'number' ? msOrSize : juiceSlot.value.stop[msOrSize];
    if (!ms) return;
    if (!this.frozen) this.freeze();
    this.until = Math.max(this.until, performance.now() + ms);
  }

  /** White fill flash on one object (v4: setTint + TintModes.FILL). */
  flashSprite(obj: Phaser.GameObjects.GameObject & { setTint: Function; setTintMode: Function; clearTint: Function }, ms = 80) {
    obj.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    const end = performance.now() + ms;
    const off = () => {
      if (performance.now() < end) return;
      this.scene.events.off(Phaser.Scenes.Events.UPDATE, off);
      if (obj.scene) obj.setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
    };
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, off);
  }

  private freeze() {
    const s = this.scene as any;
    const pause = (o: Pausable) => {
      const prev = o.timeScale;
      o.timeScale = 0;
      this.restore.push(() => (o.timeScale = prev));
    };
    pause(s.tweens);
    pause(s.time);
    for (const o of s.children.list) if (o instanceof Phaser.GameObjects.Particles.ParticleEmitter) pause(o);
    const arcade = s.physics?.world;
    if (arcade && !arcade.isPaused) {
      arcade.pause();
      this.restore.push(() => arcade.resume());
    }
    const matter = s.matter?.world;
    if (matter && matter.enabled) {
      matter.pause();
      this.restore.push(() => matter.resume());
    }
    this.frozen = true;
  }

  private unfreeze() {
    this.restore.forEach((f) => f());
    this.restore = [];
    this.frozen = false;
    this.until = 0;
  }

  private tick() {
    if (this.frozen && performance.now() >= this.until) this.unfreeze();
  }
}

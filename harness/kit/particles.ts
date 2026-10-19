/**
 * Particle presets: burst, trail, ambient. One shared look per variant; counts scale with quality.particles,
 * the additive halo ("fake glow": a big faint copy, far cheaper than a glow filter) needs quality.glow.
 * Lab facts this rests on (Particles probe): cost follows ALIVE particles (~1.4 ms per 1000 on an Intel UHD,
 * budget ~5k), so every emitter has maxAliveParticles; fixed `frequency` in ms, never 0 (fps-dependent counts).
 *
 *   const fx = kit(this).fx;
 *   fx.burst(x, y);                      fx.burst(x, y, { color: 'danger', size: 2 });
 *   fx.trail(sprite);                    fx.ambient();
 */
import Phaser from 'phaser';
import { slot } from './variants';
import { theme, type Theme } from './theme';
import { quality } from './state';

export interface ParticleLook {
  texture: 'soft' | 'square' | 'spark';
  additive: boolean;
  /** Alpha of the halo copy; 0 = none. */
  halo: number;
  burst: { count: number; speed: number; lifespan: number; scale: number; gravity: number };
  trail: { perSecond: number; lifespan: number; scale: number };
  ambient: { perSecond: number; lifespan: number; scale: number; alpha: number };
}

export const particleSlot = slot<ParticleLook>('particles', {
  clean: {
    texture: 'soft', additive: true, halo: 0,
    burst: { count: 24, speed: 320, lifespan: 700, scale: 0.5, gravity: 200 },
    trail: { perSecond: 60, lifespan: 500, scale: 0.6 },
    ambient: { perSecond: 12, lifespan: 5000, scale: 0.35, alpha: 0.4 },
  },
  sparkly: {
    texture: 'spark', additive: true, halo: 0.18,
    burst: { count: 48, speed: 420, lifespan: 900, scale: 0.45, gravity: 120 },
    trail: { perSecond: 90, lifespan: 650, scale: 0.5 },
    ambient: { perSecond: 25, lifespan: 6000, scale: 0.3, alpha: 0.6 },
  },
  chunky: {
    texture: 'square', additive: false, halo: 0,
    burst: { count: 16, speed: 260, lifespan: 600, scale: 1, gravity: 500 },
    trail: { perSecond: 30, lifespan: 400, scale: 0.8 },
    ambient: { perSecond: 6, lifespan: 4000, scale: 0.6, alpha: 0.5 },
  },
});

/** Hard caps per emitter at particles x1 (the halo copy has its own). */
const CAP = { burst: 1500, trail: 400, ambient: 600 };

export type ColorKey = 'accent' | 'good' | 'warn' | 'danger' | 'fx1' | 'fx2' | 'fx3' | 'paper' | 'ink';
export const resolveColor = (t: Theme, c: ColorKey | number | undefined, fallback: number) =>
  typeof c === 'number' ? c : c === undefined ? fallback : c.startsWith('fx') ? t.fx[Number(c[2]) - 1] : t.c[c as keyof Theme['c']];

function makeTexture(scene: Phaser.Scene, kind: ParticleLook['texture']) {
  const key = `kit-p-${kind}`;
  if (scene.textures.exists(key)) return key;
  const size = kind === 'square' ? 12 : 32;
  const t = scene.textures.createCanvas(key, size, size)!;
  const c = t.getContext();
  if (kind === 'square') {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, size, size);
  } else {
    const r = size / 2;
    const g = c.createRadialGradient(r, r, r * (kind === 'spark' ? 0.35 : 0.1), r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
  }
  t.refresh();
  return key;
}

const darken = (c: number, k: number) => Phaser.Display.Color.IntegerToColor(c).darken(k).color;

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
interface Opts { color?: ColorKey | number; size?: number }
interface Live { kind: 'trail' | 'ambient'; target?: Phaser.GameObjects.GameObject; opts: Opts; emitters: Emitter[] }

export class ParticleFx {
  /** Burst emitters by colour (an emitter's colour ramp is fixed per config). */
  private bursts = new Map<string, Emitter[]>();
  private live: Live[] = [];
  /** Depth for new emitters. */
  depth = 10;

  constructor(private scene: Phaser.Scene) {}

  burst(x: number, y: number, opts: Opts = {}) {
    const L = particleSlot.value;
    const mult = quality().get().particles;
    const key = `${opts.color ?? 'fx1'}|${opts.size ?? 1}`;
    let ems = this.bursts.get(key);
    if (!ems) {
      ems = this.make('burst', opts);
      this.bursts.set(key, ems);
    }
    const n = Math.max(1, Math.round(L.burst.count * mult));
    ems[0].explode(n, x, y);
    if (ems[1]) ems[1].explode(Math.max(1, Math.round(n / 3)), x, y);
  }

  /** Follows `target` until it is destroyed or stop() is called on the returned handle. */
  trail(target: Phaser.GameObjects.GameObject, opts: Opts = {}) {
    return this.addLive({ kind: 'trail', target, opts, emitters: [] });
  }

  /** Slow motes over the camera view. */
  ambient(opts: Opts = {}) {
    return this.addLive({ kind: 'ambient', opts, emitters: [] });
  }

  /** Every emitter this owns (hit-stop freezes these). */
  emitters(): Emitter[] {
    return [...[...this.bursts.values()].flat(), ...this.live.flatMap((l) => l.emitters)];
  }

  alive() {
    let n = 0;
    for (const ems of this.bursts.values()) for (const e of ems) n += e.getAliveParticleCount();
    for (const l of this.live) for (const e of l.emitters) n += e.getAliveParticleCount();
    return n;
  }

  /** Rebuild everything with the current variant, theme and quality (the kit calls this on change). */
  refresh() {
    this.bursts.forEach((ems) => ems.forEach((e) => e.destroy()));
    this.bursts.clear();
    for (const l of this.live) {
      l.emitters.forEach((e) => e.destroy());
      l.emitters = this.make(l.kind, l.opts, l.target);
    }
  }

  destroy() {
    this.emitters().forEach((e) => e.destroy());
    this.bursts.clear();
    this.live = [];
  }

  private addLive(l: Live) {
    l.emitters = this.make(l.kind, l.opts, l.target);
    this.live.push(l);
    const stop = () => {
      l.emitters.forEach((e) => e.destroy());
      this.live = this.live.filter((x) => x !== l);
    };
    l.target?.once(Phaser.GameObjects.Events.DESTROY, stop);
    return { stop, get emitters() { return l.emitters; } };
  }

  private make(kind: 'burst' | 'trail' | 'ambient', opts: Opts, target?: Phaser.GameObjects.GameObject): Emitter[] {
    const L = particleSlot.value;
    const q = quality().get();
    const t = theme();
    const tex = makeTexture(this.scene, L.texture);
    const color = resolveColor(t, opts.color, t.fx[0]);
    const size = opts.size ?? 1;
    const ramp = L.additive ? [0xffffff, color, darken(color, 30)] : [color, color, darken(color, 25)];
    const blendMode = L.additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL;
    let cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
    if (kind === 'burst') {
      const b = L.burst;
      cfg = {
        emitting: false,
        lifespan: { min: b.lifespan * 0.6, max: b.lifespan },
        speed: { min: b.speed * 0.25, max: b.speed * size },
        angle: { min: 0, max: 360 },
        gravityY: b.gravity,
        scale: { start: b.scale * size, end: 0 },
        alpha: { start: 1, end: 0, ease: 'cubic.in' },
        color: ramp,
        colorEase: 'quad.out',
        maxAliveParticles: Math.ceil(CAP.burst * q.particles),
      };
    } else if (kind === 'trail') {
      const tr = L.trail;
      cfg = {
        lifespan: tr.lifespan,
        frequency: 1000 / Math.max(1, tr.perSecond * q.particles),
        speed: { min: 0, max: 25 },
        scale: { start: tr.scale * size, end: 0 },
        alpha: { start: 0.9, end: 0 },
        color: ramp,
        follow: target as Phaser.Types.Math.Vector2Like | undefined,
        maxAliveParticles: Math.ceil(CAP.trail * q.particles),
      };
    } else {
      const a = L.ambient;
      const cam = this.scene.cameras.main;
      cfg = {
        lifespan: { min: a.lifespan * 0.7, max: a.lifespan },
        frequency: 1000 / Math.max(0.5, a.perSecond * q.particles),
        speed: { min: 4, max: 22 },
        angle: { min: 200, max: 340 },
        scale: { start: 0, end: a.scale * size, ease: 'sine.out' },
        alpha: { start: a.alpha, end: 0 },
        tint: color,
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, 0, cam.width, cam.height) } as any,
        maxAliveParticles: Math.ceil(CAP.ambient * q.particles),
      };
      if (L.texture === 'square') cfg.scale = { start: a.scale * size, end: 0 };
    }
    const core = this.scene.add.particles(0, 0, tex, { ...cfg, blendMode }).setDepth(this.depth);
    const out = [core];
    if (L.halo > 0 && q.glow && kind !== 'ambient') {
      const s = cfg.scale as { start: number; end: number };
      const halo = this.scene.add
        .particles(0, 0, makeTexture(this.scene, 'soft'), {
          ...cfg,
          scale: { start: s.start * 3, end: 0 },
          alpha: { start: L.halo, end: 0 },
          color: [color, darken(color, 30)],
          frequency: typeof cfg.frequency === 'number' ? cfg.frequency * 3 : undefined,
          blendMode: Phaser.BlendModes.ADD,
        })
        .setDepth(this.depth - 1);
      out.push(halo);
    }
    return out;
  }
}

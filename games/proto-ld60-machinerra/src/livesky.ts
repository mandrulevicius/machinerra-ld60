/**
 * The land's weather for the live ground (pure, no Phaser; `groundlive.ts` draws it): a wind that wanders, gusts that
 * arrive when they like, and the D-city passing overhead now and then. Seeded by the land, so a replay of a seed has the
 * same sky; nothing here is gameplay (no rule reads it). Times are seconds of scene time, distances land px.
 *
 *   const sky = new LiveSky(seed);  sky.step(dt, camX, camY);  sky.windX, sky.gust, sky.zep ...
 *   sky.passNow(camX, camY);        // dev: the D-city's shadow crosses the view now
 */
import { rng, type Rng } from '../../../harness/kit/rng';

/** How the sky behaves (seconds, px, px/s). */
export const SKY_LIFE = {
  /** The wind's heading drifts toward a new one every `turn` s, easing at `ease` a second. */
  turn: [18, 45] as const,
  ease: 0.06,
  /** A gust: the next arrives after `gap` s, swells over `rise`, holds `hold`, dies over `fall`. */
  gap: [5, 16] as const,
  rise: 1.4,
  hold: [1.5, 4] as const,
  fall: 3,
  /** Clouds and drift travel this fast, more in a gust (`gustMul` at a full gust). */
  cloud: 16,
  drift: 70,
  gustMul: 1.8,
  /** The D-city: the first pass after `first` s, then every `every` s; it crosses at `speed`, from `reach` px before the view's centre to as far past. */
  first: [25, 70] as const,
  every: [100, 220] as const,
  speed: 85,
  reach: 1500,
  /** Its shadow's strength at the middle of a pass. */
  dark: 0.42,
};

export interface ZepPass {
  /** Where the pass started and its heading (rad). */
  x0: number;
  y0: number;
  a: number;
  /** Seconds since it started. */
  t: number;
}

export class LiveSky {
  /** The wind's heading (unit vector) and the current gust, 0..1. */
  windX = 1;
  windY = 0;
  gust = 0;
  /** How far clouds and drift have travelled (integrated, so a turning wind never makes them jump). */
  cloudX = 0;
  cloudY = 0;
  drift = 0;
  /** The D-city's pass in progress, or null. */
  pass: ZepPass | null = null;
  private r: Rng;
  private a: number;
  private aTo: number;
  private turnT: number;
  private gustT: number;
  private gustAge = -1;
  private gustHold = 0;
  private zepT: number;

  constructor(seed: number | string) {
    this.r = rng(`live-sky/${seed}`);
    this.a = this.aTo = this.r.range(0, Math.PI * 2);
    this.turnT = this.r.range(...SKY_LIFE.turn);
    this.gustT = this.r.range(...SKY_LIFE.gap);
    this.zepT = this.r.range(...SKY_LIFE.first);
  }

  step(dt: number, camX: number, camY: number) {
    const L = SKY_LIFE, r = this.r;
    if ((this.turnT -= dt) <= 0) {
      this.turnT = r.range(...L.turn);
      this.aTo = this.a + r.range(-1.2, 1.2);
    }
    this.a += (this.aTo - this.a) * Math.min(1, dt * L.ease);
    this.windX = Math.cos(this.a);
    this.windY = Math.sin(this.a);
    // Gusts: swell, hold, die; then wait for the next.
    if (this.gustAge < 0 && (this.gustT -= dt) <= 0) {
      this.gustAge = 0;
      this.gustHold = r.range(...L.hold);
    }
    if (this.gustAge >= 0) {
      const g = (this.gustAge += dt);
      this.gust = g < L.rise ? g / L.rise : g < L.rise + this.gustHold ? 1 : Math.max(0, 1 - (g - L.rise - this.gustHold) / L.fall);
      if (g > L.rise + this.gustHold + L.fall) {
        this.gustAge = -1;
        this.gust = 0;
        this.gustT = r.range(...L.gap);
      }
    }
    const push = 1 + (L.gustMul - 1) * this.gust;
    this.cloudX += this.windX * L.cloud * push * dt;
    this.cloudY += this.windY * L.cloud * push * dt;
    this.drift += L.drift * push * dt;
    // The D-city: wait, then cross the view along the wind (give or take), and fade out past it.
    if (this.pass) {
      this.pass.t += dt;
      if (this.pass.t * L.speed > L.reach * 2) this.pass = null;
    } else if ((this.zepT -= dt) <= 0) {
      this.zepT = r.range(...L.every);
      this.passNow(camX, camY);
    }
  }

  /** Blow a gust now (dev). */
  gustNow() {
    if (this.gustAge < 0) this.gustT = 0;
  }

  /** Start a pass now, crossing near (camX, camY). */
  passNow(camX: number, camY: number) {
    const a = this.a + this.r.range(-0.6, 0.6), off = this.r.range(-260, 260);
    this.pass = { x0: camX - Math.cos(a) * SKY_LIFE.reach - Math.sin(a) * off, y0: camY - Math.sin(a) * SKY_LIFE.reach + Math.cos(a) * off, a, t: 0 };
  }

  /** The D-city's shadow now: x, y, heading, strength (0 with no pass). */
  zep(): [number, number, number, number] {
    const p = this.pass;
    if (!p) return [0, 0, 0, 0];
    const d = p.t * SKY_LIFE.speed, k = d / (SKY_LIFE.reach * 2);
    const fade = Math.min(1, k * 5, (1 - k) * 5);
    return [p.x0 + Math.cos(p.a) * d, p.y0 + Math.sin(p.a) * d, p.a, SKY_LIFE.dark * Math.max(0, fade)];
  }
}

/**
 * The live ground: one shader quad over the painted land (`groundlive.frag`), under the marks and everything standing, so
 * a land is never a still picture: cloud shadows slide with the wind, the D-city's shadow crosses the view now and then,
 * gusts blow streaks of the land's dust, old metal glints, motes float (fireflies, embers, wisps, snow), the Wastes and the
 * Ether breathe. The weather is `LiveSky` (pure, seeded by the land); each biome's look is a `LIVE` row, keyed by its
 * `paint`. Down a dungeon there is no sky: `BELOW` keeps only the glints and a little dust.
 *
 * Play owns one (`create`) and calls `update` every frame; dev `live [on|off|zep|gust]` (group `mission`). Add a biome:
 * a `LIVE` row for its `paint`. Cost: one full-screen pass (~1 ms on the pane's Intel UHD, `findings/performance-gpu.md`).
 */
import Phaser from 'phaser';
import { addShader, type KitShader } from '../../../harness/kit/shader';
import frag from './groundlive.frag?raw';
import { LiveSky } from './livesky';
import type { BiomeDef } from './sim/defs';

type V3 = [number, number, number];
export interface LiveLook {
  /** Cloud shadow strength (by day) and the colour shadows lean to. */
  cloud: number;
  shade: V3;
  /** The D-city passes over (never under a canopy of stone). */
  zep: boolean;
  /** Streaks the wind carries: strength and colour (lit by the sky). */
  drift: number;
  driftCol: V3;
  /** Glints: cell px, share of cells that hold one, visibility by day and by night, colour. */
  glint: [number, number, number, number];
  glintCol: V3;
  /** Motes: cell px, share, rise px/s (negative falls), size px; visibility by day and night; colour (their own light). */
  mote: [number, number, number, number];
  moteVis: [number, number];
  moteCol: V3;
  /** Leaf shade and sun spots, swaying. */
  canopy: number;
  /** The breathing glow: strength, scale px, speed; colour. */
  pulse: [number, number, number];
  pulseCol: V3;
}

const NONE = { glint: [1, 0, 0, 0], glintCol: [0, 0, 0], mote: [1, 0, 0, 1], moteVis: [0, 0], moteCol: [0, 0, 0], canopy: 0, pulse: [0, 1, 0], pulseCol: [0, 0, 0] } satisfies Partial<LiveLook>;

/** Each biome's live ground, by `Biome.paint`. Shadows lean cool and violet, as on the painted NPCs; light leans warm. */
export const LIVE: Record<BiomeDef['paint'], LiveLook> = {
  desert: { ...NONE, cloud: 0.3, shade: [0.32, 0.34, 0.62], zep: true, drift: 0.3, driftCol: [1, 0.88, 0.66], glint: [74, 0.22, 1, 0.12], glintCol: [1, 0.9, 0.62], mote: [110, 0.12, 5, 1.1], moteVis: [0, 0.35], moteCol: [1, 0.8, 0.5] },
  jungle: { ...NONE, cloud: 0.16, shade: [0.12, 0.3, 0.32], zep: true, drift: 0.08, driftCol: [0.6, 0.85, 0.3], canopy: 1, mote: [84, 0.26, 4, 1.6], moteVis: [0.05, 1], moteCol: [0.75, 1, 0.35] },
  city: { ...NONE, cloud: 0.26, shade: [0.26, 0.3, 0.48], zep: true, drift: 0.1, driftCol: [0.85, 0.82, 0.74], glint: [58, 0.3, 0.9, 0.3], glintCol: [0.8, 0.95, 1] },
  snow: { ...NONE, cloud: 0.3, shade: [0.36, 0.46, 0.82], zep: true, drift: 0.5, driftCol: [1, 1, 1], glint: [34, 0.32, 1, 0.35], glintCol: [0.85, 0.95, 1], mote: [64, 0.3, -18, 1.2], moteVis: [0.45, 0.35], moteCol: [0.9, 0.95, 1] },
  demon: { ...NONE, cloud: 0.18, shade: [0.24, 0.06, 0.1], zep: true, drift: 0.25, driftCol: [0.62, 0.5, 0.5], mote: [80, 0.3, 22, 1.4], moteVis: [0.55, 1], moteCol: [1, 0.42, 0.12], pulse: [0.22, 260, 0.8], pulseCol: [1, 0.22, 0.06] },
  ether: { ...NONE, cloud: 0.22, shade: [0.2, 0.12, 0.42], zep: false, drift: 0.18, driftCol: [0.62, 0.58, 1], glint: [82, 0.2, 0.6, 1], glintCol: [0.6, 1, 1], mote: [120, 0.22, 6, 3], moteVis: [0.5, 0.9], moteCol: [0.55, 0.82, 1], pulse: [0.2, 340, 0.5], pulseCol: [0.5, 0.3, 1] },
};

/** The D-hub's air: dust drifting in the lamplight over the deck, nothing else (its own land below has the land's look). */
export const HUB_AIR: Partial<LiveLook> = { cloud: 0, zep: false, drift: 0, canopy: 0, glint: [1, 0, 0, 0], mote: [64, 0.32, 5, 1.1], moteVis: [0.32, 0.32], moteCol: [1, 0.84, 0.58], pulse: [0, 1, 0] };

/** Down a dungeon: the land's glints at their night strength, a little dust in the lamps, nothing from the sky. */
const below = (l: LiveLook): LiveLook => ({ ...l, cloud: 0, zep: false, drift: 0, canopy: 0, mote: [96, 0.2, 3, 1], moteVis: [0.18, 0.18], moteCol: [1, 0.9, 0.7], pulse: [l.pulse[0] * 0.5, l.pulse[1], l.pulse[2]] });

const rgb = (c: number): V3 => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

export class GroundLive {
  readonly sky: LiveSky;
  private sh: KitShader<Record<string, number | number[]>>;
  private look: LiveLook;

  constructor(scene: Phaser.Scene, o: { w: number; h: number; seed: number | string; paint: BiomeDef['paint']; below: boolean; depth: number; look?: Partial<LiveLook> }) {
    this.sky = new LiveSky(o.seed);
    this.look = { ...(o.below ? below(LIVE[o.paint]) : LIVE[o.paint]), ...o.look };
    const l = this.look;
    let s = 0;
    for (const ch of String(o.seed)) s = (s * 31 + ch.charCodeAt(0)) % 997;
    this.sh = addShader(scene, {
      frag,
      x: o.w / 2, y: o.h / 2, w: o.w, h: o.h,
      uniforms: {
        uSeed: s, uDay: 1, uAmb: [1, 1, 1],
        uCloudOff: [0, 0], uCloud: l.cloud, uShade: l.shade, uZep: [0, 0, 0, 0],
        uWind: [1, 0], uDriftOff: 0, uGust: 0, uDrift: l.drift, uDriftCol: l.driftCol,
        uGlint: l.glint, uGlintCol: l.glintCol, uMote: l.mote, uMoteCol: l.moteCol, uMoteVis: l.moteVis,
        uCanopy: l.canopy, uPulse: [...l.pulse, 0], uPulseCol: l.pulseCol, uDetail: 2,
      },
    });
    this.sh.setDepth(o.depth);
  }

  get on() {
    return this.sh.visible;
  }
  set on(v: boolean) {
    this.sh.setVisible(v);
  }

  /** Lie over another image (the hub's land far below, which drifts and scrolls slower): its place, size and scroll. */
  follow(img: Phaser.GameObjects.Image) {
    this.sh.setPosition(img.x - (img.originX - 0.5) * img.displayWidth, img.y - (img.originY - 0.5) * img.displayHeight);
    this.sh.setScale(img.displayWidth / this.sh.width, img.displayHeight / this.sh.height).setScrollFactor(img.scrollFactorX, img.scrollFactorY);
  }

  /** How many passes run (tier.ts `DETAIL`): 2 all (the default), 1 and 0 lighter on a slow machine. */
  get detail() {
    return this.sh.u.uDetail as number;
  }
  set detail(v: number) {
    this.sh.u.uDetail = v;
  }

  destroy() {
    this.sh.destroy();
  }

  /** Every frame: `night` 0..1 (the sky's), `ambient` the light's colour, the camera's centre in land px. */
  update(dt: number, night: number, ambient: number, camX: number, camY: number) {
    const sky = this.sky, u = this.sh.u;
    sky.step(dt, camX, camY);
    u.uDay = 1 - night;
    u.uAmb = rgb(ambient);
    u.uCloudOff = [-sky.cloudX, -sky.cloudY];
    u.uWind = [sky.windX, sky.windY];
    u.uDriftOff = sky.drift;
    u.uGust = sky.gust;
    u.uZep = this.look.zep ? sky.zep() : [0, 0, 0, 0];
  }

  /** What `debugState()` shows. */
  state() {
    const s = this.sky;
    return { on: this.on, detail: this.detail, wind: [+s.windX.toFixed(2), +s.windY.toFixed(2)], gust: +s.gust.toFixed(2), zep: s.pass ? s.zep().map((v) => Math.round(v * 100) / 100) : null };
  }
}

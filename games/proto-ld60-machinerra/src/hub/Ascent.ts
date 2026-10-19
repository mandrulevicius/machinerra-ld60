/**
 * Mission end to hub: it picks up where the mission's rise ended (`Play.ascentData`: the view the lift left the land in; the
 * lift is just above that view's top edge, still climbing), the view zooms out to the whole land under the zeppelin's shadow
 * (all a mission ever sees of it) and the Zeppelin Wanderer comes into view above it, the lift docks, then a kit transition
 * cuts into the hub. Use or a click skips. A first version: the land is the mission's own (same seed), the zeppelin
 * drawn in code. The timeline runs on the frame delta, so `__game.step(n)` plays it too.
 */
import Phaser from 'phaser';
import { inputFor, kit, promptHtml, transition, type SceneKit } from '../../../../harness/kit';
import { GROUND_PX, LIFT_SCALE, liftFoot, makeArt, paintGround, S } from '../art';
import { house } from '../house';
import { MesaShadows, fixedLean } from '../mesashadow';
import { sunLean } from '../sun';
import { BIOMES, T, type BiomeId } from '../sim/defs';
import { shadeOf } from '../shadowview';
import { generate, type MapData } from '../sim/mapgen';
import { makeZeppelinArt, zeppelinShape } from './art';
import { installHubSounds } from './sound';
import { HUB_MUSIC, playMusic } from '../sound';
import type { Haul } from './state';
import './hub.css';

/**
 * The zeppelin's texels per drawn unit. It is seen close (up to ZEP_SHOW game px per unit at the start), so the 1x
 * texture of the hub's map was soft beside the sands: 3 texels per unit is about 1 texel per screen px there, the
 * ground's density.
 */
export const ZEP_PX = 3;
const ZEP_SHOW = 3.4;

/** `zeppelin-near`: the Wanderer at ZEP_PX texels a unit in the house style, for close views (here and the title). */
export function makeZeppelinNear(scene: Phaser.Scene) {
  if (scene.textures.exists('zeppelin-near')) return;
  const t = scene.textures.createCanvas('zeppelin-near', 860 * ZEP_PX, 420 * ZEP_PX)!;
  house(t.getContext(), 860, 420, ZEP_PX, (c) => zeppelinShape(c));
  t.refresh();
}

/** The view's pull-back, then the hold on the zeppelin (its last `fade` is the cover coming down, so the cut falls as the hold ends). */
const MS = { zoom: 4300, hold: 2200, fade: 450 };
/** The zeppelin hangs this far north-west of its shadow (the mission's sun casts shadows to the south-east). */
const UP = { x: 260, y: 220 };
/** The hour whose sun leans the mesas' shadows here (afternoon: they point south-east like the zeppelin's). */
const AFTERNOON = 16;

type Img = Phaser.GameObjects.Image;
/** The view the mission's rise ended in: its centre and zoom, and the world y of its top edge. */
interface From { x: number; y: number; zoom: number; top: number }
/** What the mission hands on: the haul, the land (`map`: as it was painted; without it, a dev start, the seed's) and the view it left. */
interface AscentData { haul?: Haul; seed?: number | string; biome?: BiomeId; map?: MapData; from?: From }
interface View { lift: { x: number; y: number }; from: From; zx: number; zy: number; liftImg: Img; zep: Img; shadow: Img; cap: HTMLElement; z1: number; puffs: number }

const ease = (k: number) => 0.5 - Math.cos(Math.PI * Phaser.Math.Clamp(k, 0, 1)) / 2;

export class Ascent extends Phaser.Scene {
  private k!: SceneKit;
  private data_: AscentData = {};
  private done = false;
  private phase = 'rise';
  private e = 0;
  private v: View | null = null;
  private mesas: MesaShadows | null = null;

  constructor() {
    super('Ascent');
  }

  create(data: AscentData) {
    this.data_ = data ?? {};
    this.done = false;
    this.phase = 'rise';
    this.e = 0;
    const k = (this.k = kit(this));
    k.background();
    makeArt(this);
    makeZeppelinArt(this);
    installHubSounds(k.audio);
    playMusic(k.audio, HUB_MUSIC, { fade: 3 });
    makeZeppelinNear(this);
    const map = data?.map ?? generate(data?.seed ?? 1, undefined, undefined, data?.biome ?? 'desert');
    const W = map.w * T, H = map.h * T;
    const ground = paintGround(this, map, GROUND_PX);
    this.add.image(0, 0, ground).setOrigin(0).setScale(GROUND_PX);
    // The mesas' shadows lean south-east, as the zeppelin's does (the hour is a guess: a mission can end at any).
    const lift = { x: (map.lift.x + 0.5) * T, y: (map.lift.y + 0.5) * T };
    this.mesas = new MesaShadows(this, ground, { depth: 0.1, tint: shadeOf(BIOMES[data?.biome ?? 'desert'].paint) });
    // Its shadow lies over the lift, as it did over the whole mission; the zeppelin itself is up and to the north-west.
    // It hangs well north of the lift, so the lift (still climbing, as it left the mission's view) rises into its shadow and on to it.
    const zx = Phaser.Math.Clamp(lift.x - UP.x, 950, W - 1100), zy = Phaser.Math.Clamp(lift.y - 700, 450, H - 450);
    const shadow = this.add.image(zx + UP.x, zy + UP.y, 'zeppelin-shadow').setScale(2.1).setAlpha(0.5);
    // Where the mission left off; without it (a dev start) the view of a mission centred on the lift.
    const from = data?.from ?? { x: lift.x, y: lift.y - 20, zoom: 1, top: lift.y - 20 - 360 };
    // Above the zeppelin and its shadow, so it is never hidden as they fade in; its foot starts a little inside the old view's top edge.
    const liftImg = this.add.image(lift.x, from.top + 30, 'lift').setOrigin(0.5, 1).setScale(LIFT_SCALE / S).setDepth(2);
    const zep = this.add.image(zx, zy, 'zeppelin-near').setScale(ZEP_SHOW / ZEP_PX).setAlpha(0);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.setZoom(from.zoom);
    cam.centerOn(from.x, from.y);
    k.audio.sfx.play('lift', { gain: 0.5 });

    const ui: HTMLElement = this.registry.get('ui');
    const h = data?.haul;
    ui.innerHTML = `<div class="hb-ascent">The Zeppelin Wanderer<small>${h ? `The lift docks with ${h.scrap ?? 0} scrap and ${h.robots.length} robots aboard.` : 'The lift rises.'} ${promptHtml('{use} skip')}</small></div>`;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (ui.innerHTML = ''));
    this.v = { lift, from, zx, zy, liftImg, zep, shadow, cap: ui.querySelector('.hb-ascent') as HTMLElement, z1: Math.max(1280 / W, 720 / H) * 1.02, puffs: 0 };
    this.input.once('pointerdown', () => this.toHub());
  }

  update(_t: number, ms: number) {
    if (inputFor(this).pressed('use')) this.toHub();
    const v = this.v;
    if (!v) return;
    const e = (this.e += Math.min(ms, 50));
    this.phase = e < MS.zoom ? 'zoom' : 'hold';
    // The view pulls back over the whole land from where the mission left it; the zeppelin, nearer the camera, shrinks faster
    // into view; the lift, above the old view's edge, climbs to its belly and is gone.
    const z = e / MS.zoom;
    const k = ease(z), lz = ease(z / 0.8), zk = ease(z / 0.7);
    const cam = this.cameras.main;
    this.mesas?.update(cam.worldView, fixedLean(sunLean(AFTERNOON)));
    const f = v.from;
    // The lift keeps the speed it left the mission with and slows as it nears the belly (an ease-out); the view holds it in
    // the upper part of the frame, then lets go of it for the zeppelin as it docks.
    const u = Math.min(1, z / 0.8), lp = 1 - (1 - u) * (1 - u);
    const ly = f.top + 30, by = Math.min(v.zy + 60, ly - 40);
    const lx = v.lift.x + (v.zx - v.lift.x) * lp, lyNow = ly + (by - ly) * lp;
    const zoom = f.zoom + (v.z1 - f.zoom) * k;
    cam.setZoom(zoom);
    const m = ease(z);
    cam.centerOn(lx + (v.zx - lx) * m, (lyNow + 140 / zoom) + (v.zy + 120 - (lyNow + 140 / zoom)) * m);
    v.liftImg.setPosition(lx, lyNow);
    v.liftImg.setScale((LIFT_SCALE * (1 - lz) + 0.6 * lz) / S).setAlpha(1 - lz * lz);
    v.zep.setAlpha(zk).setScale((ZEP_SHOW - 1.4 * zk) / ZEP_PX);
    v.shadow.setAlpha(0.5 - 0.08 * k);
    if (z > 0.6) v.cap.classList.add('is-on');
    // Hold: the Wanderer drifts on, its chimneys smoking; then the cut.
    const hold = Math.max(0, e - MS.zoom);
    const drift = 140 * (hold / (MS.hold + 800)) ** 2;
    v.zep.x = v.zx + drift;
    v.shadow.x = v.zx + UP.x + drift;
    if (hold > v.puffs * 350 && v.puffs < 6) {
      v.puffs++;
      this.k.fx.burst(v.zep.x - 560, v.zep.y + (v.puffs % 2 ? -100 : 100) * Math.random(), { color: 0xf4efe6, size: 2 });
    }
    if (hold >= MS.hold - MS.fade) this.toHub();
  }

  private toHub() {
    if (this.done) return;
    this.done = transition(this, 'Hub', { haul: this.data_.haul }, { ms: MS.fade });
  }

  debugState() {
    return { phase: this.phase, ms: Math.round(this.e), zoom: +this.cameras.main.zoom.toFixed(3), haul: this.data_.haul?.id ?? null, seed: this.data_.seed };
  }
}

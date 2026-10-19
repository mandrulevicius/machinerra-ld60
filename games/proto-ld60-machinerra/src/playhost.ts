/**
 * What a view of the mission is and what it may ask of the scene. Play (`Play.ts`) owns the scene, the input and the main
 * loop; everything the player sees and hears is made by a view that Play creates with a `PlayHost` and keeps in its
 * `views` list. Each frame Play runs every view's `update(dt, g)` in the list's order (what the lines `g` draw over is
 * decided by it), then every view's `late(dt)`; every sim event goes to every view's `event(e)` in that order.
 *
 * Add a view: a file with a class extending `ViewBase` (its `sim`, `k`, `w`, `sfx`, `floater`, `flash` read like the scene's)
 * that implements what it needs of `View`, and one line in `Play.makeViews`' list. Views never reach into each other:
 * what two share is on the host (`bots`, `hornets`, `comm`, `used`, `lamps`...) or goes through its methods.
 */
import Phaser from 'phaser';
import type { SceneKit, Shadow, World } from '../../../harness/kit';
import type { CommDir } from './comm';
import type { CommandMode } from './commandmode';
import type { Motion } from './foemotion';
import type { Guide } from './guideview';
import type { Hud } from './hud';
import { LINE } from './house';
import type { Inventory } from './inventory';
import type { Lamp } from './lamps';
import type { MapView } from './mapview';
import type { DungeonCarry } from './missionstart';
import type { PlaceViews } from './places';
import type { Selection } from './sim/command';
import type { QuestLog } from './questlog';
import type { AnomalyId, BiomeId } from './sim/defs';
import type { Bot, Sim, SimEvent } from './sim/sim';
import type { StatusView } from './statusview';

export type Img = Phaser.GameObjects.Image;
export type Light = Phaser.GameObjects.Light;
export type G = Phaser.GameObjects.Graphics;

/** A springy deformation: `s` is the squash (negative) or stretch (positive) of a sprite, 0 at rest. */
export interface Squash {
  s: number;
  v: number;
}
/** What the player has done that a lesson waits for (`Play.teach`). */
export interface Used {
  swung: boolean;
  kicked: boolean;
  shotSecondary: boolean;
}
export interface BotView {
  spr: Img;
  /** Its blob shadow on the ground (`shadowview.ts`). */
  shadow: Shadow;
  light: Light;
  badge: Phaser.GameObjects.Text;
  crew: number;
  /** It was on its own order when the badge was last drawn (P3). */
  own?: boolean;
  bob: number;
  step: number;
  sq: Squash;
  pumpT: number;
  pump: number;
  flashT: number;
  bark?: Phaser.GameObjects.Text;
  barkT: number;
  base: number;
  /** Where it was last frame and the way it is heading (unit vector): the stoked robot's swoosh trails behind it (`stokeview.ts`). */
  way?: { x: number; y: number; ux: number; uy: number };
  /** Its crew's worn head and back pieces (`worn-<id>`), made on first draw. */
  kit?: { head: Img; back: Img };
  /** A Guard's saw arm (`crew/guard-saw`, `sawarm.ts`), the seconds into its stroke (undefined at rest) and the stroke's angle. */
  arm?: Img;
  sawT?: number;
  sawA?: number;
}
/** A hornet's night dress: the aura's glow on the ground and the glowing eyes (more of them as the menace grows). */
export interface HornetView {
  spr: Img;
  sq: Squash;
  shadow: Shadow;
  aura?: Img;
  eyes: Img[];
  painted: boolean;
  ground: boolean;
  base: number;
  /** Footfalls walked and the eased lean (`foemotion.ts`). */
  motion: Motion;
  /** The body's hop this frame (px, up) and the same hop a beat late, which a rigged head hangs on (`foemotion.ts`, `legview.ts`). */
  hop: number;
  late: number;
  /** A long-bodied foe (`chain.ts`): no breathing and no stretch on its head. */
  chain: boolean;
  /** The shadow's own alpha (hidden while a boss is up in a leap). */
  shAlpha?: number;
  /** The three-stage look's extras (`foeview.ts`): a menacing body's glow, and the pale edge light behind a dark one. */
  stage?: { glow?: Img; rim?: Img };
  /** A boss's painted frames (`bossForms`) and the form it shows now. */
  forms?: [string, string, string?];
  form?: string;
}
/** The can that came off the pack for a revive: falls, tips over and pours into the Communicator until it is spent. */
export interface Spill {
  img: Img;
  t: number;
  x: number;
  y: number;
  spent: number;
}
/** The Communicator's walk cycles (art/communicator/<view>-<0..7>, Brushed flat, from Laimonas's character sheet): which way they look, and the antenna. */
export interface CommState {
  dir: CommDir;
  px: number;
  py: number;
  pingT: number;
  tip: Light;
  /** The antenna's signal glow (`sim.signals`, `warmth`): a bead on the tip with a halo, and the warmth it shows now (0 cold .. 1 warm, eased). */
  glow: Img;
  bead: Phaser.GameObjects.Arc;
  warm: number;
  shovel: Img;
  /** What he wears that shows (`worn-<id>`): the head piece, the pack piece; `weapon` the swing's texture. */
  hat: Img;
  pack: Img;
  worn: string;
  swing: { t: number; a: number; arc: number; reach: number; turn: number } | null;
  lookT: number;
  turn: number;
  kneelT: number;
  cans: Img[];
  spill: Spill | null;
}

/** What a view may ask of the mission scene. */
export interface PlayHost {
  scene: Phaser.Scene;
  k: SceneKit;
  w: World;
  sim: Sim;
  readonly hud: Hud;
  readonly guide: Guide;
  readonly statuses: StatusView;
  /** The frame's shared graphics (cleared at the start of `Play.draw`), over the world. */
  readonly gfx: G;
  /** The robots on screen, the enemies, the Communicator's own state: shared by whoever draws or kicks them. */
  readonly bots: Map<number, BotView>;
  readonly hornets: Map<number, HornetView>;
  readonly comm: CommState;
  readonly used: Used;
  /** Where this mission is: its seed and the land's biome, tier and anomaly (a restart replays them). */
  readonly land: { seed: number | string; biome: BiomeId; tier: number; anomaly: AnomalyId; id?: string | null };
  /** The painted ground's texture key (`paintGround`). */
  readonly groundKey: string;
  /** Down a dungeon: what he carried down (`DungeonLink`); null on a land. */
  readonly down: DungeonCarry | null;
  /** The root the mission's DOM goes in (a dungeon's own layer over the land's). */
  readonly ui: HTMLElement;
  /** The mission is over (the results or the climb-out has started). */
  ended: boolean;
  /** The live tunes the views read (F10 Kit tab). */
  readonly t: { music: boolean; lampBudget: boolean; stageTint: boolean };
  /** The music is in its fight colour (`MusicView`). */
  readonly fight: boolean;
  /** The panels Play opens from input. */
  readonly map: MapView;
  readonly cmd: CommandMode;
  /** The robots picked for command mode (the map's and the main view's share it). */
  readonly pick: Selection;
  readonly inv: Inventory;
  readonly log: QuestLog;
  toggleMap(open?: boolean): void;
  /** The authored places' views (`places.ts`). */
  readonly places: PlaceViews;
  /** The crew's lamps as their robots want them this frame: `BotsView` fills it, `LightView` spends the light budget on it. */
  readonly lamps: Lamp[];
  /** The lift's drawing, and whether a dungeon's climb-out has faded the screen out already. */
  readonly liftSpr: Img;
  readonly riseFaded: boolean;
  /** The land's ruins on screen, by ruin id. */
  readonly ruins: Map<number, Img>;
  /** The lights the enemies burn (they count against the light cap). */
  foeLights(): Light[];
  /** The Communicator's own frames, wings and swing for this frame (`CommView.draw`), called from the robots' loop between placing his sprite and the rest of it. */
  drawComm(b: Bot, v: BotView, dt: number): void;
  /** Put on what the gear says each body wears (after any gear change). */
  dressComm(): void;
  /** Register the dev commands again (after waking from a dungeon). */
  commands(): void;
  /** A prop standing in the land, dressed for its biome (biomedress.ts), with its mound (and lip, if buried): feet at (x, footY), depth by its feet. */
  place(key: string, x: number, footY: number, scale?: number): Img;
  /** The land's dressed copy of a texture, for swapping one on a placed prop. */
  dress(key: string): string;
  sfx(key: string, x?: number, y?: number, o?: { gain?: number; vary?: number }): void;
  floater(x: number, y: number, text: string, color: string, ms?: number, size?: number): void;
  banner(text: string, ms?: number): void;
  wash(color: string): void;
  flash(x: number, y: number, color: number, intensity?: number): void;
  /** 0 bright .. 1 deep night. */
  night(): number;
  /** How far (px) the lift has risen this frame: whatever stands on it rises too. */
  rise(): number;
  /** Lift the Communicator's sprite this many px (climbing the mast). */
  climb(y: number): void;
  /** A walking robot's foot comes down (prints and a step: `footview.ts`). */
  footfall(b: Bot): void;
}

/** One thing the mission shows: any of these, as it needs. */
export interface View {
  /** Every sim event, each frame after the sim has stepped. */
  event?(e: SimEvent): void;
  /** Every frame after the sim, in the views list's order; `g` is the frame's shared graphics, cleared before the first. */
  update?(dt: number, g: G): void;
  /** Every frame once every view has updated: whatever needs to see the others' lights and hints first. */
  late?(dt: number): void;
  /** What `debugState()` adds for it. */
  debug?(): Record<string, unknown>;
  destroy?(): void;
}

/** A view's reads of the scene, named as the scene names them (so code moved out of Play keeps its words). */
export abstract class ViewBase {
  event?(e: SimEvent): void;
  update?(dt: number, g: G): void;
  late?(dt: number): void;
  debug?(): Record<string, unknown>;
  destroy?(): void;
  constructor(protected host: PlayHost) {}
  get scene() { return this.host.scene; }
  get k() { return this.host.k; }
  get w() { return this.host.w; }
  get sim() { return this.host.sim; }
  get hud() { return this.host.hud; }
  get guide() { return this.host.guide; }
  get statuses() { return this.host.statuses; }
  get gfx() { return this.host.gfx; }
  get bots() { return this.host.bots; }
  get hornets() { return this.host.hornets; }
  get comm() { return this.host.comm; }
  get used() { return this.host.used; }
  sfx(key: string, x?: number, y?: number, o?: { gain?: number; vary?: number }) { this.host.sfx(key, x, y, o); }
  floater(x: number, y: number, text: string, color: string, ms?: number, size?: number) { this.host.floater(x, y, text, color, ms, size); }
  flash(x: number, y: number, color: number, intensity?: number) { this.host.flash(x, y, color, intensity); }
}

/** Violet, the dark's colour (twisted enemies). */
export const VIOLET = 0xb040ff;
/** The oil stain a hurt robot or the tap leaves. */
export const CRUDE_STAIN = 0x0c0a08;

/** Squash or stretch a sprite: it springs back (`spring`). */
export const kick = (q: Squash, amount: number) => (q.v += amount * 30);
/** Critically-underdamped spring: overshoots once, so a squash follows through into a stretch. */
export const spring = (q: Squash, dt: number) => {
  q.v += (-q.s * 420 - q.v * 16) * dt;
  q.s += q.v * dt;
};

/** A turning ring of dashes on the ground (an ellipse: the ground seen from above). */
export function ring(g: G, x: number, y: number, r: number, color: number, alpha: number, t: number, flat = 0.62) {
  const n = 18;
  g.lineStyle(LINE.effect, color, alpha);
  for (let i = 0; i < n; i += 2) {
    const a0 = t / 1800 + (i / n) * Math.PI * 2, a1 = a0 + (1.4 / n) * Math.PI * 2;
    g.lineBetween(x + Math.cos(a0) * r, y + Math.sin(a0) * r * flat, x + Math.cos(a1) * r, y + Math.sin(a1) * r * flat);
  }
}

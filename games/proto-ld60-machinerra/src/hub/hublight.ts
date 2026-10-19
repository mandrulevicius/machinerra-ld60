/**
 * The hub's light, in three moods set by the visit (`moodOf`: the first is day, each later one a random mood seeded by the visit; the F10 Game tab and
 * `hub mood` pick one by hand): `MOODS` holds each mood's ambient, the land's veil, how much the
 * lantern, the wall lamps and the lots' lamps burn, and the way shadows fall. The look eases between moods, so a change never pops.
 * Day is bright and warm. Evening is the hub as Minos first asked for it (dark deck and catwalks, the land far below light, as if
 * the Wanderer lit it with a few soft spotlights). Night is near-total darkness: the lantern, the lots' lamps and the land's pools
 * do all the lighting. Built lots and the wall lamps light the evening and the night, not the day.
 * - The Communicator carries a lantern, and a second light that lingers where he was (`LIGHT.wake`): a catwalk is lit only
 *   around him as he passes.
 * - The grates and the land seen through them are not lit by lights (the land is a flat image), so the lantern and its wake also
 *   lay a soft additive halo on the catwalk (`HALO`): that is what shows a catwalk lit around him.
 * - A built lot lights its own area (`lotLamp`); an open one stays dark. The five rooms' wall lamps burn low at the start and
 *   brighter the more is built (`ROOM_GLOW`).
 * - The land: the painted land is veiled in a dark overlay with light cut out of it (`land`): in the evening a few soft pools that stay
 *   put, at night a few spotlights sweeping slowly (`SPOTS`; the veil is a small canvas redrawn `VEIL.fps` times a second while they move; on the kit's low quality they stand still at `VEIL.stillAt` and the veil is drawn once).
 * - Shadows: every lit light throws (`DeckShadows.lights`), so they lean away from the Communicator's lantern and a lot's lamp.
 * - A look to try (`hubLook.cone`, saved per browser; the F10 Game tab and `hub cone` flip it): the lantern a cone (`CONE`, evening and
 *   night: a fan of lights and a wedge of halo ahead of him, turning with his facing, and a small glow at his feet).
 * The lights are spent under the cap like the mission's crew lamps (`lamps.ts`: near ones merge, the farthest go dark) and ease
 * to what is chosen, so none pops. Fixed lights the scene adds itself (the table's glass, the Oracle's eye) count against the cap.
 * Every number is a guess, tuned by eye.
 */
import Phaser from 'phaser';
import { quality, type SceneKit } from '../../../../harness/kit';
import { chooseSpots, follow, inView, type Lamp } from '../lamps';
import type { CommDir } from '../comm';
import type { DeckShadows } from '../shadowview';
import type { Src, Vec } from '../sun';
import { moodOf, veilKey, type Mood } from './hubmood';
import { lotOf, ROOMS, SLOTS, WALKWAYS } from './layout';
import { LOT_BUILDINGS, NPCS } from './state';

type Light = Phaser.GameObjects.Light;
type Img = Phaser.GameObjects.Image;

export { moodOf, type Mood };
/** What a mood is (all guesses, tuned by eye): the deck's ambient, the live land's look (`night` 0..1, ambient), how much of the dark veil lies on the land, how much the lantern / the wall lamps / the lots' lamps burn, the share of the lights' lean in the shadows, the sun's lean, and the contact shadows' nudge from the light (px) and width (x the footprint). */
interface MoodDef {
  ambient: number;
  land: { night: number; ambient: number };
  veil: number;
  /** 0: the land's soft pools stand still (evening); 1: spotlights sweep (night). */
  spots: number;
  lantern: number;
  room: number;
  lot: number;
  shade: number;
  sun: Vec;
  nudge: number;
  wide: number;
}
export const MOODS: Record<Mood, MoodDef> = {
  day: { ambient: 0xd2c2a6, land: { night: 0, ambient: 0xffffff }, veil: 0, spots: 0, lantern: 0, room: 0.2, lot: 0, shade: 0, sun: { x: 0.32, y: 0.4 }, nudge: 6, wide: 1.3 },
  evening: { ambient: 0x2a2d48, land: { night: 0.7, ambient: 0x585a7a }, veil: 1, spots: 0, lantern: 1, room: 1, lot: 1, shade: 1, sun: { x: 0.32, y: 0.4 }, nudge: 9, wide: 1.3 },
  night: { ambient: 0x06070d, land: { night: 0.8, ambient: 0x484a68 }, veil: 1, spots: 1, lantern: 1.25, room: 0.4, lot: 0.85, shade: 1, sun: { x: 0.32, y: 0.4 }, nudge: 9, wide: 1.3 },
};

/** The hub's looks (dev toggles, saved in this browser): `mood` one by hand or `auto` by the tier just flown; `cone` the lantern lighting only the way he faces (evening and night). Flip: `hubLook.set({ mood: 'night' })`. */
export interface Look {
  mood: Mood | 'auto';
  cone: boolean;
}
const KEY = 'machinerra.hubLook';
const look: Look = { mood: 'auto', cone: false };
try {
  const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
  look.mood = v.mood === 'day' || v.mood === 'evening' || v.mood === 'night' ? v.mood : 'auto';
  look.cone = v.cone === true;
} catch { /* no storage: the defaults */ }
export const hubLook = {
  get: (): Readonly<Look> => look,
  set(o: Partial<Look>) {
    Object.assign(look, o);
    try {
      localStorage.setItem(KEY, JSON.stringify(look));
    } catch { /* not saved */ }
  },
};
/**
 * The cone: lights along his facing (distance ahead, radius, intensity: each wider than the last, so together they make a cone),
 * the wedge of halo that shows it on the unlit grates (reach in px, half angle in degrees), the glow at his feet, and how fast
 * the cone turns to a new facing (per second).
 */
const CONE = {
  fan: [[50, 105, 0.8], [125, 150, 0.8], [210, 195, 0.7]] as [number, number, number][],
  halo: { reach: 430, half: 33, alpha: 0.5 },
  feet: { r: 85, i: 0.7 },
  turn: 9,
};

/** Which way the Communicator faces on screen, from the view his sprite shows (`commDir`) and which way it is mirrored. */
export function facingOf(dir: CommDir, face: number): Vec {
  const f = face < 0 ? -1 : 1, d = Math.SQRT1_2;
  if (dir === 'back') return { x: 0, y: -1 };
  if (dir === 'front') return { x: 0, y: 1 };
  if (dir === 'side') return { x: f, y: 0 };
  return { x: f * d, y: dir === 'backside' ? -d : d };
}

/** Wall lamps: along each room's north wall (not in a doorway), where the lamp pictures hang. */
export const ROOM_LAMPS: [number, number][] = ROOMS.flatMap((r) => {
  const n = Math.max(2, Math.round(r.w / 160));
  return Array.from({ length: n }, (_, i) => r.x + ((i + 0.5) * r.w) / n)
    .filter((x) => !WALKWAYS.some((w) => w.y < r.y && x > w.x - 20 && x < w.x + w.w + 20))
    .map((x): [number, number] => [x, r.y + 18]);
});

const LIGHT = {
  /** The Communicator's lantern, and the light that lags behind him (full strength at `far` px behind, none standing still). */
  lantern: { color: 0xffc878, r: 250, i: 1.1 },
  wake: { color: 0xffb860, r: 210, i: 0.75, far: 70, rate: 1.7 },
  /** A wall lamp: warm, and how bright the rooms burn from nothing built to everything built (`ROOM_GLOW`). */
  room: { color: 0xffb860, r: 270 },
  /** A built lot's light: warm, its reach as a share of the lot's diagonal. */
  lot: { color: 0xffc070, reach: 0.55, max: 360, i: 0.8 },
};
const ROOM_GLOW = { base: 0.45, more: 0.6 };
/** The halos under the Communicator's lights: texture px, the most alpha, and the depth (over the floor, under everything standing). */
const HALO = { size: 256, alpha: 0.38, depth: -4.9 };
const OFF = 0.015, SPARE = 0.2;
/** How fast a light eases (per second) to its target: coming on, going out, gliding when merged. */
const RATE = { on: 3.2, off: 5, move: 12 };
/** Ids of the pool's lamps. */
const ID = { lantern: 1, wake: 2, cone: 4, room: 10, lot: 100 };

/** The land's pools in the evening: where (px from the land's anchor), how wide (radius). Broad and few. */
const POOLS: [number, number, number][] = [
  [-560, -330, 460], [20, -470, 410], [610, -280, 480],
  [-430, 250, 420], [140, 330, 500], [650, 360, 410],
];
/** The night's spotlights (guesses): each sweeps an ellipse about a centre (px from the land's anchor: x, y, half-width, half-height, period in seconds, phase, radius). Slow, and apart. */
const SPOTS: [number, number, number, number, number, number, number][] = [
  [-380, -100, 260, 110, 71, 0.0, 250],
  [330, -150, 230, 100, 53, 2.1, 220],
  [-80, 150, 320, 110, 89, 4.0, 270],
  [450, 120, 160, 90, 63, 5.3, 200],
];
/** The veil: size in world px, its canvas's shrink, colour, the night's colour, the warm tint of light, and how often the night's spotlights are redrawn. */
const VEIL = { w: 2400, h: 1800, scale: 6, colour: 'rgba(12,14,34,0.8)', night: 'rgba(8,9,24,0.9)', warm: 'rgba(255,196,128,0.10)', fps: 20, /** The moment the spotlights hold on the low quality setting (a guess: where `SPOTS` stand at the start). */ stillAt: 0 };

/** A mood as numbers that ease (colours as channels). */
const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const pack = (r: number, g: number, b: number) => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
const flat = (m: MoodDef) => {
  const [ar, ag, ab] = rgb(m.ambient), [lr, lg, lb] = rgb(m.land.ambient);
  return { ar, ag, ab, lr, lg, lb, ln: m.land.night, veil: m.veil, spots: m.spots, lantern: m.lantern, room: m.room, lot: m.lot, shade: m.shade, sx: m.sun.x, sy: m.sun.y, nudge: m.nudge, wide: m.wide };
};
type Now = ReturnType<typeof flat>;
/** How fast the look eases between moods (per second). */
const MOOD_RATE = 2.5;
/** The first visit's dim deck (`firstvisit.ts`): the ambient it sinks to, and the lantern he carries through it in any mood, so he is never lost in the dark. */
const DIM = { ambient: 0x3c3026, lantern: 1 };

/** The hub's lights, spent under the cap. Make it once the lit things stand (`create`), give it the lots (`lots`), call `update` every frame. */
export class HubLight {
  private pool = new Map<number, Light>();
  private lead = new Map<number, number>();
  private built = new Set<string>();
  private wake = { x: 0, y: 0 };
  private src: Src[] = [];
  private lit = 0;
  private halos: Img[] = [];
  private coneHalo: Img;
  /** The cone's heading (radians), eased toward his facing; `null` until the first frame. */
  private aim: number | null = null;
  private veil: Img | null = null;
  private veilTex: Phaser.Textures.CanvasTexture | null = null;
  /** What the veil was last drawn for, so it is drawn only when it changed. */
  private veilKey = '';
  private visit = 0;
  private cur: Now | null = null;
  private ambientNow = -1;
  private dimmed = false;
  /** How many things there are to build (stations, houses, improvements). */
  private readonly total = NPCS.filter((n) => n.station).length + LOT_BUILDINGS.length;

  constructor(private scene: Phaser.Scene, private k: SceneKit, private shade: DeckShadows, me: { x: number; y: number }) {
    this.wake = { x: me.x, y: me.y };
    scene.lights.setAmbientColor(MOODS[this.mood()].ambient);
    const tx = scene.textures;
    if (!tx.exists('hub-halo')) {
      const tex = tx.createCanvas('hub-halo', HALO.size, HALO.size)!, c = tex.getContext(), m = HALO.size / 2;
      const g = c.createRadialGradient(m, m, 0, m, m, m);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.4)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, HALO.size, HALO.size);
      tex.refresh();
    }
    if (!tx.exists('hub-cone')) {
      const a = (CONE.halo.half * Math.PI) / 180, w = 448, L = w - 24, h = Math.ceil(2 * L * Math.sin(a)) + 48, tex = tx.createCanvas('hub-cone', w, h)!, c = tex.getContext();
      c.filter = 'blur(10px)';
      const g = c.createRadialGradient(0, h / 2, 0, 0, h / 2, L);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, h / 2);
      c.arc(0, h / 2, L, -a, a);
      c.closePath();
      c.fill();
      c.filter = 'none';
      tex.refresh();
    }
    this.coneHalo = scene.add.image(me.x, me.y, 'hub-cone').setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setTint(LIGHT.lantern.color).setDepth(HALO.depth).setVisible(false);
    this.halos = [LIGHT.lantern, LIGHT.wake].map((l) => scene.add.image(me.x, me.y, 'hub-halo').setBlendMode(Phaser.BlendModes.ADD).setTint(l.color).setDepth(HALO.depth).setVisible(false));
  }

  /** The lots that stand now (the save's `stations`): each lights its area, the rest are dark. */
  lots(stations: Record<string, string>, missions = 0) {
    this.built = new Set(Object.values(stations));
    this.visit = missions;
  }

  /** The first visit's guide dims the deck (or lifts the dim): the mood's look eases to it like a change of mood. */
  dim(on: boolean) {
    this.dimmed = on;
  }

  /** The mood now: the one picked by hand, else the visit's (`moodOf`). */
  mood(): Mood {
    return look.mood === 'auto' ? moodOf(this.visit) : look.mood;
  }

  /** The live land's look now (`night` 0..1 and ambient), for `GroundLive.update`. */
  landLook() {
    const c = this.cur ?? flat(MOODS[this.mood()]);
    return { night: c.ln, ambient: pack(c.lr, c.lg, c.lb) };
  }

  /** 0 (nothing built) to 1 (everything). */
  progress() {
    return Math.min(1, this.built.size / this.total);
  }

  /**
   * The land far below by night: a dark veil over it with light cut out, as if lit from the Wanderer: a few broad soft pools in the
   * evening, at night a few spotlights sweeping slowly (`drawVeil`). It scrolls with the land and is anchored on the zeppelin, so the
   * land slides by under the lights.
   */
  land(anchor: { x: number; y: number }, scroll: number, depth: number): Img {
    const key = 'hub-veil';
    const tx = this.scene.textures;
    if (tx.exists(key)) tx.remove(key);
    this.veilTex = tx.createCanvas(key, VEIL.w / VEIL.scale, VEIL.h / VEIL.scale)!;
    this.veilKey = '';
    this.drawVeil(0, 0);
    return (this.veil = this.k.lights.unlit(this.scene.add.image(anchor.x, anchor.y, key).setScale(VEIL.scale).setScrollFactor(scroll).setDepth(depth)));
  }

  /** Draw the veil: `spots` 0 the evening's standing pools, 1 the night's sweeping spotlights (between: both, faded, while the mood eases). */
  private drawVeil(spots: number, now: number) {
    const tex = this.veilTex;
    if (!tex) return;
    const c = tex.getContext(), w = VEIL.w / VEIL.scale, h = VEIL.h / VEIL.scale, k = 1 / VEIL.scale;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, w, h);
    c.fillStyle = VEIL.colour;
    c.fillRect(0, 0, w, h);
    if (spots > 0.01) {
      c.globalAlpha = spots;
      c.fillStyle = VEIL.night;
      c.fillRect(0, 0, w, h);
    }
    const pool = (x: number, y: number, r: number, stops: [number, string][]) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      for (const [at, col] of stops) g.addColorStop(at, col);
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const cut: [number, string][] = [[0, 'rgba(0,0,0,1)'], [0.4, 'rgba(0,0,0,0.9)'], [0.75, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']];
    const beam: [number, string][] = [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.95)'], [0.8, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']];
    const warm: [number, string][] = [[0, VEIL.warm], [1, 'rgba(255,196,128,0)']];
    const spot = ([cx, cy, ax, ay, period, ph, r]: (typeof SPOTS)[number]) => {
      const t = (now / period) * Math.PI * 2 + ph;
      return { x: w / 2 + (cx + Math.sin(t) * ax) * k, y: h / 2 + (cy + Math.sin(t * 1.7 + ph) * ay) * k, r: r * k };
    };
    if (spots < 0.99) {
      c.globalCompositeOperation = 'destination-out';
      c.globalAlpha = 1 - spots;
      for (const [dx, dy, r] of POOLS) pool(w / 2 + dx * k, h / 2 + dy * k, r * k, cut);
      c.globalCompositeOperation = 'source-over';
      for (const [dx, dy, r] of POOLS) pool(w / 2 + dx * k, h / 2 + dy * k, r * k * 0.8, warm);
    }
    if (spots > 0.01) {
      c.globalCompositeOperation = 'destination-out';
      c.globalAlpha = spots;
      for (const sp of SPOTS) { const p = spot(sp); pool(p.x, p.y, p.r, beam); }
      c.globalCompositeOperation = 'source-over';
      for (const sp of SPOTS) { const p = spot(sp); pool(p.x, p.y, p.r * 0.8, warm); }
    }
    c.globalAlpha = 1;
    tex.refresh();
  }

  /** The lamps as the scene wants them now. */
  private targets(now: number, me: { x: number; y: number }, cone: boolean, m: Now): Lamp[] {
    const w = this.wake, far = Math.hypot(w.x - me.x, w.y - me.y);
    const out: Lamp[] = [];
    const L = m.lantern;
    if (L > 0.02 && cone) {
      out.push({ id: ID.lantern, x: me.x, y: me.y - 22, r: CONE.feet.r, i: CONE.feet.i * L, solo: true });
      const a = this.aim ?? 0;
      CONE.fan.forEach(([d, r, i], k) => out.push({ id: ID.cone + k, x: me.x + Math.cos(a) * d, y: me.y - 22 + Math.sin(a) * d * 0.8, r, i: i * L, solo: true }));
    } else if (L > 0.02) {
      out.push({ id: ID.lantern, x: me.x, y: me.y - 22, r: LIGHT.lantern.r, i: LIGHT.lantern.i * L, solo: true });
      out.push({ id: ID.wake, x: w.x, y: w.y - 22, r: LIGHT.wake.r, i: LIGHT.wake.i * L * Math.min(1, far / LIGHT.wake.far), solo: true });
    }
    // The lamps breathe a little and now and then one dips (as the old deck lamps did).
    const flick = (j: number) => 1 + Math.sin(now * (3 + j * 0.7) + j) * 0.04 + (Math.sin(now * 17 + j * 3) > 0.97 ? -0.15 : 0);
    const glow = (ROOM_GLOW.base + ROOM_GLOW.more * this.progress()) * m.room;
    ROOM_LAMPS.forEach(([x, y], j) => out.push({ id: ID.room + j, x, y: y + 40, r: LIGHT.room.r, i: glow * flick(j) }));
    SLOTS.forEach((s, j) => {
      if (!this.built.has(s.id) || m.lot < 0.02) return;
      const l = lotOf(s.id), r = Math.min(LIGHT.lot.max, LIGHT.lot.reach * Math.hypot(l.w, l.h));
      out.push({ id: ID.lot + j, x: l.x + l.w / 2, y: l.y + l.h * 0.45, r, i: LIGHT.lot.i * m.lot * flick(j + 5) });
    });
    return out;
  }

  private light(id: number, at: { x: number; y: number; r: number }): Light {
    let l = this.pool.get(id);
    if (!l) {
      const c = id >= ID.lot ? LIGHT.lot.color : id >= ID.room ? LIGHT.room.color : id === ID.wake ? LIGHT.wake.color : LIGHT.lantern.color;
      this.pool.set(id, (l = this.k.lights.add(at.x, at.y, { color: c, radius: at.r, intensity: 0 })));
      l.setVisible(false);
    }
    return l;
  }

  /** Every frame: spend the light budget, ease the lights, tell the shadows which ones throw. `me` is the Communicator's feet. */
  update(dt: number, me: { x: number; y: number }, facing: Vec = { x: 0, y: -1 }) {
    const lm = this.scene.lights, view = this.scene.cameras.main.worldView, now = this.scene.time.now / 1000;
    const cap = lm.maxLights > 0 ? lm.maxLights : 8;
    const { cone } = look, to = flat(MOODS[this.mood()]);
    if (this.dimmed) {
      [to.ar, to.ag, to.ab] = rgb(DIM.ambient);
      to.lantern = Math.max(to.lantern, DIM.lantern);
    }
    if (!this.cur) this.cur = to;
    else for (const k of Object.keys(to) as (keyof Now)[]) this.cur[k] = follow(this.cur[k], to[k], dt, MOOD_RATE);
    const m = this.cur;
    const amb = pack(m.ar, m.ag, m.ab);
    if (amb !== this.ambientNow) {
      lm.setAmbientColor(amb);
      this.ambientNow = amb;
    }
    if (this.veil) {
      this.veil.setAlpha(m.veil).setVisible(m.veil > 0.01);
      // Standing pools are drawn once (and again while the mood eases to or from the spotlights); the spotlights sweep at `VEIL.fps`.
      const low = quality().get().level === 'low';
      const key = veilKey(m.veil, m.spots, now, low, VEIL.fps);
      if (key && key !== this.veilKey) {
        this.drawVeil(m.spots, low ? VEIL.stillAt : now);
        this.veilKey = key;
      }
    }
    this.shade.mood({ night: m.shade, sun: { x: m.sx, y: m.sy }, nudge: m.nudge, wide: m.wide });
    const want = Math.atan2(facing.y, facing.x);
    if (this.aim === null) this.aim = want;
    else this.aim += Math.atan2(Math.sin(want - this.aim), Math.cos(want - this.aim)) * Math.min(1, dt * CONE.turn);
    this.wake.x = follow(this.wake.x, me.x, dt, LIGHT.wake.rate);
    this.wake.y = follow(this.wake.y, me.y, dt, LIGHT.wake.rate);
    const lamps = this.targets(now, me, cone, m);
    for (const l of lamps) this.light(l.id, l);
    const mine = new Set(this.pool.values());
    // Lights that burn at nothing take no slot of the cap; the rest the scene added (fixtures, the near glow, a burst) are spent first.
    let others = 0;
    for (const l of lm.lights) {
      if (mine.has(l)) continue;
      l.setVisible(l.intensity > OFF);
      if (l.visible && inView({ x: l.x, y: l.y, r: l.radius }, view)) others++;
    }
    const budget = Math.max(1, cap - others - Math.ceil(cap * SPARE));
    const { spots, lit } = chooseSpots(lamps, { view, budget, focus: { x: view.centerX, y: view.centerY }, prev: this.lead });
    this.lit = lit;
    const lead = new Map<number, (typeof spots)[number]>();
    this.lead.clear();
    for (const s of spots) {
      lead.set(s.lead, s);
      for (const id of s.ids) this.lead.set(id, s.lead);
    }
    this.src.length = 0;
    for (const [id, l] of this.pool) {
      const s = lead.get(id);
      if (s && s.i > 0) {
        if (l.intensity < OFF || s.solo) l.setPosition(s.x, s.y).setRadius(s.r);
        else l.setPosition(follow(l.x, s.x, dt, RATE.move), follow(l.y, s.y, dt, RATE.move)).setRadius(follow(l.radius, s.r, dt, RATE.move));
        l.setIntensity(s.solo ? s.i : follow(l.intensity, s.i, dt, RATE.on));
      } else l.setIntensity(follow(l.intensity, 0, dt, RATE.off));
      l.setVisible(l.intensity > OFF);
    }
    // Every light that burns throws shadows away from itself, the scene's fixtures too.
    for (const l of lm.lights) if (l.visible && l.intensity > 0.1) this.src.push({ x: l.x, y: l.y + 16, r: l.radius, i: l.intensity });
    this.shade.lights(this.src);
    [ID.lantern, ID.wake].forEach((id, j) => {
      const l = this.pool.get(id), h = this.halos[j];
      if (!l) return void h.setVisible(false);
      h.setVisible(l.visible).setPosition(l.x, l.y + 8).setScale((l.radius * 1.5) / HALO.size).setAlpha((HALO.alpha * l.intensity) / LIGHT.lantern.i);
    });
    // The cone's wedge of halo rides the first fan light's intensity (it comes on and goes out with the cone).
    const fan = this.pool.get(ID.cone), ch = this.coneHalo;
    const on = !!fan && fan.visible && cone;
    ch.setVisible(on);
    if (on) ch.setPosition(me.x, me.y - 14).setRotation(this.aim!).setScale(CONE.halo.reach / (448 - 24)).setAlpha((CONE.halo.alpha * fan!.intensity) / CONE.fan[0][2]);
  }

  debug() {
    return { look: { ...look }, mood: this.mood(), dimmed: this.dimmed, visit: this.visit, spots: this.cur ? +this.cur.spots.toFixed(2) : null, aim: this.aim === null ? null : +((this.aim * 180) / Math.PI).toFixed(0), progress: +this.progress().toFixed(2), built: this.built.size, pool: this.pool.size, burning: [...this.pool.values()].filter((l) => l.visible).length, spotsInView: this.lit, throwing: this.src.length };
  }
}

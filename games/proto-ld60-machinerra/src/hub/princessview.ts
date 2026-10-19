/**
 * The Princess on the deck (P58), drawing and feel only (rules in `princess.ts`, state in `princessslice.ts`):
 * - her dock, the copper ring by the lift (the Planner's pencil "bird bath" once act 3 is done and before she is home; empty and
 *   dark while she is gone, Rumba sitting in it),
 * - her rounds: a slow, tidy lap of the stations with a pause at each; she stops and turns to him when he passes; at night she
 *   charges on her dock; Rumba rides her now and then,
 * - her pile of sweepings by the dock (E picks it up, `Hub.use`),
 * - the deck's prints (P58 G) on three of the kit's baked mark layers: the old prints (every trip and trail since the last sweep),
 *   the dust over them (`dustOf`), and this absence's prints over the dust (the crew's last errands and his walk in),
 * - his boots: coming home, he prints the deck in the land's colour for a few dozen steps (`TRAIL`), kept in the slice,
 * - the return sweep: back from the Ether she rolls once across the deck and the dust and every print go with her.
 * The scene (`Hub.ts`) makes one in `create` and calls `update` every frame; `npcAt` asks `pos()` where she is.
 */
import Phaser from 'phaser';
import { rng } from '../../../../harness/kit/rng';
import { Marks } from '../../../../harness/kit/world/marks';
import { Strider } from '../../../../harness/kit/world/logic';
import { MARK_FOOT, MARK_SOFT, MARK_SPLAT } from '../../../../harness/kit/world/textures';
import type { SceneKit } from '../../../../harness/kit';
import { canvas, COL, FLOOR, S } from '../art';
import { makeCompanionArt } from '../placeartq';
import type { BiomeId } from '../sim/defs';
import { type DeckCtx, DUST, dustOf, type Pt, tripPrints, walk, wornWays } from './deckprints';
import { ALTAR, ARRIVE, BENCH, boothBlocks, DECK, LEVER, ROOMS, TABLE, walkable, WINDOW } from './layout';
import { addTrail, bake, dustStage, pickUp, pileText, PRINT_COLOUR, rides, type Stamp, swept } from './princess';
import { princessSave } from './princessslice';
import { fitted, RINGS } from './princessdocks';
import { talkSave } from './talkslice';
import type { HubState } from './state';

type Img = Phaser.GameObjects.Image;

/** Her dock: by the lift's hatch, its south-west corner (a guess); her pile beside it. */
export const DOCK = { x: ARRIVE.x - 100, y: ARRIVE.y + 72 };
export const PILE = { x: DOCK.x + 54, y: DOCK.y + 26, reach: 70 };
/** Her rounds: glide speed (px/s), the pause at each stop (s), how near he must be for her to stop and face him (px). Guesses. */
export const ROUND = { speed: 55, pause: 2.6, near: 110 };
/** His boots coming home: prints laid, the last share fading out, stride and gap, size, opacity of the first. Guesses. */
export const TRAIL = { prints: 46, fade: 0.35, stride: 27, gap: 13, scale: 0.5, alpha: 0.8 };
/** The return sweep: her speed (px/s), the broom's size (x the 64 px soft blob), seconds of the last fade. */
export const SWEEP_LOOK = { speed: 520, brush: 5, fade: 0.7 };
/** Depths of the three layers (over the deck and the grates, under the shadows). */
const DEPTH = { old: -7.9, dust: -7.85, fresh: -7.8, dock: -7.6 };

const LIFT = ROOMS.find((r) => r.id === 'lift')!;
const centre = (id: string) => {
  const r = ROOMS.find((x) => x.id === id)!;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};
const P = (x: number, y: number, pause = false): Pt => ({ x, y, ...(pause && { pause }) });
const SOUTH = P(TABLE.x, TABLE.y + 165), NORTH = P(TABLE.x, TABLE.y - 150), EAST = P(TABLE.x + 175, TABLE.y + 30), WEST = P(TABLE.x - 175, TABLE.y + 30);
/** Her lap of the stations: the lever, the course table, the bench, the altar, the window, home; a pause at each. */
const ROUNDS: Pt[] = [P(DOCK.x, DOCK.y, true), P(LEVER.x + 40, LEVER.y + 70, true), WEST, P(SOUTH.x, SOUTH.y, true), P(BENCH.x, BENCH.y + 80, true), NORTH, EAST, P(ALTAR.x, ALTAR.y + 110, true), EAST, P(WINDOW.x - 60, WINDOW.y, true), SOUTH, WEST, P(DOCK.x, DOCK.y)];
/** The return sweep: once through every room and back to her dock. */
const SWEEP_WAY: Pt[] = [P(DOCK.x, DOCK.y), P(ARRIVE.x, ARRIVE.y), P(LIFT.x + 60, LIFT.y + 80), WEST, NORTH, centre('workshop'), NORTH, EAST, centre('church'), EAST, SOUTH, centre('colony'), SOUTH, WEST, P(DOCK.x, DOCK.y)];

/** What the view needs of the hub scene. */
export interface PrincessHost {
  scene: Phaser.Scene;
  k: SceneKit;
  me: Img;
  /** Her image (the hub's NPC sprite) and its own scale. */
  img: () => Img | undefined;
  hub: () => HubState;
  /** She is home and not wanted at the altar (the blessing). */
  active: () => boolean;
  night: () => boolean;
  /** In conversation with her. */
  talking: () => boolean;
  cat: () => boolean;
  /** Rumba's spot (`HubCompanions.catAway`). */
  catAway: (at: { x: number; y: number } | null | undefined) => void;
  /** The pencil berth is drawn (act 3 done). */
  pencil: () => boolean;
  ctx: () => DeckCtx;
  setCut: (c: (() => void) | null) => void;
  speak: (text: string) => void;
  banner: (text: string) => void;
  /** The pile is his: scrap and relics to the stock, parts to the stores. */
  take: (pile: NonNullable<ReturnType<typeof pickUp>['pile']>) => void;
}

/** One stop or stretch of her rounds. */
interface Leg { a: Pt; b: Pt; t: number }

export class PrincessView {
  private old: Marks;
  private dust: Marks;
  private fresh: Marks;
  private dock: Img;
  private rings: Phaser.GameObjects.Graphics;
  private ringsDrawn = -1;
  private pile: Img;
  private lamp: Phaser.GameObjects.Light;
  private rider: Img;
  private legs: Leg[] = [];
  private period = 0;
  private t = 0;
  private at: Pt = { x: DOCK.x, y: DOCK.y };
  private face = 1;
  private moving = false;
  private riding = false;
  private moteT = 0;
  /** His boots: the land's colour, prints still to lay, the prints laid. */
  private boots: { b: BiomeId; left: number; laid: number[]; strider: Strider } | null = null;
  /** The return sweep in progress. */
  private sweep: { way: Pt[]; i: number; d: number; wiped: number; fading: number } | null = null;
  private stats = { stamps: { old: 0, dust: 0, fresh: 0 }, bakeMs: 0, parts: {} as Record<string, number> };
  private forceRide: boolean | null = null;

  constructor(private h: PrincessHost) {
    const scene = h.scene;
    this.old = new Marks(scene, DECK.w, DECK.h, 1024, DEPTH.old, 0);
    this.dust = new Marks(scene, DECK.w, DECK.h, 1024, DEPTH.dust, 0);
    this.fresh = new Marks(scene, DECK.w, DECK.h, 1024, DEPTH.fresh, 0);
    makeDockArt(scene);
    makeCompanionArt(scene);
    this.dock = scene.add.image(DOCK.x, DOCK.y, 'princess-dock').setScale(1 / S).setDepth(DEPTH.dock).setVisible(false);
    this.rings = scene.add.graphics().setDepth(DEPTH.dock + 0.01);
    this.pile = scene.add.image(PILE.x, PILE.y, 'princess-pile').setScale(1 / S).setOrigin(0.5, 0.8).setDepth(PILE.y).setVisible(false);
    this.lamp = h.k.lights.add(DOCK.x - 40, DOCK.y - 18, { color: 0x9cff9a, radius: 70, intensity: 0 });
    this.rider = scene.add.image(0, 0, 'cat-sit').setScale(1 / S).setOrigin(0.5, 0.9).setVisible(false);
    this.draw();
    this.plan();
    this.t = rng(`round:${h.hub().missions}`).range(0, this.period);
    this.riding = rides(h.hub().missions, h.cat());
  }

  /** Where she is (npcAt). */
  pos(): Pt {
    return this.at;
  }

  /** The facts her talk reads: Rumba aboard, at her dock at night. */
  facts() {
    return { 'cat.riding': this.ridingNow() ? 1 : 0, atDock: this.h.night() ? 1 : 0, cat: this.h.cat() ? 1 : 0 };
  }

  /** One ring in the dock for each old dock fitted (`fitted`); redrawn only when the count or the light changes. */
  private drawRings(n: number | false, lit: boolean) {
    const k = (n || 0) + (lit ? 0.5 : 0);
    if (k === this.ringsDrawn) return;
    this.ringsDrawn = k;
    const g = this.rings.clear();
    for (let i = 0; i < (n || 0); i++) {
      const rx = 31 - i * 4.5;
      g.lineStyle(2.4, RINGS[i], lit ? 1 : 0.35).strokeEllipse(DOCK.x, DOCK.y, rx * 2, rx * 2 * (13 / 36));
    }
  }

  /** Her pile as a thing in reach, while there is one. */
  thing() {
    return princessSave.get().pile ? { kind: 'station' as const, id: 'sweepings', name: 'Her sweepings', verb: 'pick up her sweepings', x: PILE.x, y: PILE.y, reach: PILE.reach } : null;
  }

  /** What the mouse may light up here: her pile, while there is one (the hub's hover, `hover.ts`). */
  hoverables() {
    return this.pile.visible ? [{ id: 'sweepings', img: this.pile }] : [];
  }

  pickUp() {
    const got = pickUp(princessSave.get());
    if (!got.pile) return;
    princessSave.set(got.state);
    this.h.take(got.pile);
    this.h.banner(pileText(got.pile));
    this.h.k.audio.sfx.play('pickup');
    for (let i = 0; i < 4; i++) this.h.k.fx.burst(PILE.x + (i - 1.5) * 8, PILE.y - 6, { color: 0xd8c8a8, size: 0.5 });
    this.pile.setVisible(false);
  }

  /** His boots are dirty with this land as he comes home (after the return sweep if one is owed). */
  dirtyBoots(b: BiomeId) {
    this.boots = { b, left: TRAIL.prints, laid: [], strider: new Strider(TRAIL.stride, TRAIL.gap) };
  }

  /** The sweep is owed: play it now (the hub, a little after it opens). */
  get owed() {
    return princessSave.get().deck.owed;
  }

  // ------------------------------------------------------------ the deck's layers

  /** Lay the old prints, the dust and this absence's prints from the slice (once, as the hub opens; again after a dev change). */
  draw() {
    const t0 = performance.now();
    for (const m of [this.old, this.dust, this.fresh]) {
      m.clear();
      m.alpha = 1;
    }
    const st = princessSave.get(), d = st.deck, c = this.h.ctx();
    const older = d.trips.slice(0, -1), last = d.trips.slice(-1);
    const his = (list: typeof d.his): Stamp[] =>
      list.flatMap((t) => {
        const out: Stamp[] = [];
        for (let i = 0; i + 2 < t.p.length; i += 3) out.push({ x: t.p[i], y: t.p[i + 1], a: t.p[i + 2], tint: PRINT_COLOUR[t.b], alpha: trailAlpha(i / 3, t.p.length / 3), scale: TRAIL.scale, glow: t.b === 'ether' });
        return out;
      });
    const lay = (m: Marks, stamps: Stamp[]) => {
      for (const s of stamps) {
        m.stamp(MARK_FOOT, s.x, s.y, { tint: s.tint, alpha: s.alpha, angle: s.a, scale: s.scale, kind: false });
        if (s.glow) m.stamp(MARK_FOOT, s.x, s.y, { tint: s.tint, alpha: s.alpha * 0.6, angle: s.a, scale: s.scale * 1.3, kind: false, blend: Phaser.BlendModes.ADD });
      }
      return stamps.length;
    };
    const stage = dustStage(d.dust);
    // With dust on the deck his last trail lies under it too; with her home the deck holds only this absence anyway.
    const t1 = performance.now();
    const oldStamps = bake([...tripPrints(older, c), ...his(stage ? d.his : d.his.slice(0, -1))]);
    const t2 = performance.now();
    this.stats.stamps.old = lay(this.old, oldStamps);
    const t3 = performance.now();
    const dust = dustOf(stage, c.floor, stage >= 3 ? wornWays([...new Set(d.trips.flat())], c) : [], rng(`dust:${d.dust}`));
    for (const s of dust.lay) this.dust.stamp(s.speck ? MARK_SPLAT : MARK_SOFT, s.x, s.y, { tint: s.tint, alpha: s.alpha, angle: s.a, scale: s.scale, kind: false });
    for (const p of dust.wear) this.dust.erase(p.x, p.y, DUST.wear.scale, DUST.wear.alpha);
    this.stats.stamps.dust = dust.lay.length;
    this.stats.stamps.fresh = lay(this.fresh, bake([...tripPrints(last, c, older.length), ...his(stage ? [] : d.his.slice(-1))]));
    this.stats.bakeMs = Math.round(performance.now() - t0);
    this.stats.parts = { prints: Math.round(t2 - t1), stampOld: Math.round(t3 - t2), rest: Math.round(performance.now() - t3) };
  }

  /** Her rounds as legs and pauses through the stations (routed over the deck). */
  private plan() {
    const way = walk(ROUNDS, this.h.ctx().floor);
    this.legs = [];
    for (let i = 0; i < way.length - 1; i++) {
      const a = way[i], b = way[i + 1];
      if (a.pause) this.legs.push({ a, b: a, t: ROUND.pause });
      this.legs.push({ a, b, t: Math.hypot(b.x - a.x, b.y - a.y) / ROUND.speed });
    }
    this.period = this.legs.reduce((s, l) => s + l.t, 0);
  }

  private ridingNow() {
    return (this.forceRide ?? this.riding) && this.h.cat() && this.h.active() && !this.h.night();
  }

  // ------------------------------------------------------------ every frame

  update(dt: number) {
    this.old.update(dt * 1000);
    this.dust.update(dt * 1000);
    this.fresh.update(dt * 1000);
    const h = this.h, st = princessSave.get(), img = h.img();
    const home = h.active(), stolen = h.hub().story?.wife === 'stolen';
    const now = h.scene.time.now / 1000;
    // The dock: built the day she comes home (and kept, dark, while she is gone); the Planner's pencil before.
    const built = home || stolen || h.hub().story?.wife === 'home';
    this.dock.setVisible(built || h.pencil()).setTexture(built ? (home ? 'princess-dock' : 'princess-dock-off') : 'princess-dock-pencil');
    this.lamp.setIntensity(home ? (h.night() ? 0.5 + 0.3 * Math.sin(now * 2.4) : 0.35) : 0);
    this.drawRings(built && fitted(talkSave.get()), home);
    this.pile.setVisible(!!st.pile);
    if (this.sweep) return this.sweeping(dt, img);
    this.walkHome(dt);
    if (!home || !img || this.sweep) {
      this.rider.setVisible(false);
      h.catAway(stolen ? { x: DOCK.x, y: DOCK.y + 4 } : undefined); // gone: Rumba sits in the empty ring and will not move
      return;
    }
    // Night: on the dock, charging. Day: the rounds, stopping for him and in conversation.
    const near = Math.hypot(h.me.x - this.at.x, h.me.y - this.at.y) < ROUND.near;
    if (h.night()) {
      this.at = { x: DOCK.x, y: DOCK.y + 2 };
      this.moving = false;
    } else if (!h.talking() && !near) {
      this.t = (this.t + dt) % this.period;
      const was = this.at;
      this.at = this.posAt(this.t);
      const dx = this.at.x - was.x;
      this.moving = Math.hypot(dx, this.at.y - was.y) > 0.01;
      if (Math.abs(dx) > 0.02) this.face = dx > 0 ? -1 : 1; // her painting faces left
    } else {
      this.moving = false;
      if (Math.abs(h.me.x - this.at.x) > 4) this.face = h.me.x > this.at.x ? -1 : 1;
    }
    // A glide, not a walk: a faint hover and a lean into the way.
    const hover = this.moving ? Math.sin(now * 9) * 0.6 : 0;
    if (!h.talking()) img.setPosition(this.at.x, this.at.y + 6 + hover).setDepth(this.at.y + 6).setAngle(this.moving ? -this.face * 2 : 0);
    img.setFlipX(this.face < 0);
    if (this.moving && (this.moteT -= dt) <= 0) {
      this.moteT = 0.5;
      this.mote(this.at.x - this.face * -10, this.at.y + 4);
    }
    // Rumba rides on top now and then, unbothered; her own spot stays empty meanwhile.
    const ride = this.ridingNow();
    h.catAway(ride ? null : undefined);
    this.rider.setVisible(ride);
    if (ride) this.rider.setPosition(img.x - this.face * 2, img.y - img.displayHeight * 0.86).setDepth(img.depth + 1).setFlipX(this.face < 0);
  }

  /** Where the rounds have her at time t. */
  private posAt(t: number): Pt {
    for (const l of this.legs) {
      if (t <= l.t) {
        const u = l.t ? t / l.t : 1;
        return { x: l.a.x + (l.b.x - l.a.x) * u, y: l.a.y + (l.b.y - l.a.y) * u };
      }
      t -= l.t;
    }
    return { x: DOCK.x, y: DOCK.y };
  }

  /** A puff of what she picked up, behind her. */
  private mote(x: number, y: number) {
    const p = this.h.scene.add.image(x, y, 'hub-cloud').setScale(0.035).setAlpha(0.45).setTint(0xd8d0c0).setDepth(y - 1);
    this.h.k.lights.unlit(p);
    this.h.scene.tweens.add({ targets: p, y: y - 8, scale: 0.07, alpha: 0, duration: 700, onComplete: () => p.destroy() });
  }

  /** His dirty boots print the deck as he walks in, fading; the trail is kept once they run clean. */
  private walkHome(_dt: number) {
    const b = this.boots;
    if (!b || this.h.scene.cameras.main === undefined) return;
    const p = b.strider.step(this.h.me.x, this.h.me.y + 2);
    if (!p) return;
    const i = TRAIL.prints - b.left, a = Math.round((p.heading * 180) / Math.PI + 90);
    const alpha = trailAlpha(i, TRAIL.prints);
    this.fresh.stamp(MARK_FOOT, p.x, p.y, { tint: PRINT_COLOUR[b.b], alpha, angle: a, scale: TRAIL.scale, kind: false });
    if (b.b === 'ether') this.fresh.stamp(MARK_FOOT, p.x, p.y, { tint: PRINT_COLOUR.ether, alpha: alpha * 0.6, angle: a, scale: TRAIL.scale * 1.3, kind: false, blend: Phaser.BlendModes.ADD });
    b.laid.push(Math.round(p.x), Math.round(p.y), a);
    if (--b.left <= 0) this.keepTrail();
  }

  /** Keep his trail in the slice (the boots ran clean, or the scene closes mid-trail). */
  keepTrail() {
    const b = this.boots;
    this.boots = null;
    if (b?.laid.length) princessSave.set(addTrail(princessSave.get(), b.b, b.laid));
  }

  // ------------------------------------------------------------ the return sweep

  /** Back from the Ether: she rolls once across the deck and the dust and every print go with her. A beat with no words, then her line. */
  playSweep(after?: () => void) {
    if (this.sweep) return;
    this.sweep = { way: walk(SWEEP_WAY, this.h.ctx().floor), i: 0, d: 0, wiped: 0, fading: -1 };
    this.at = { x: DOCK.x, y: DOCK.y };
    this.h.setCut(() => this.endSweep(after));
    this.h.k.audio.sfx.play('hiss', { gain: 0.3 });
    this.afterSweep = after ?? null;
  }
  private afterSweep: (() => void) | null = null;

  private sweeping(dt: number, img: Img | undefined) {
    const s = this.sweep!;
    const cam = this.h.scene.cameras.main;
    if (s.fading >= 0) {
      s.fading += dt;
      const a = Math.max(0, 1 - s.fading / SWEEP_LOOK.fade);
      for (const m of [this.old, this.dust, this.fresh]) m.alpha = a;
      if (a <= 0) this.endSweep(this.afterSweep ?? undefined);
      return;
    }
    let move = SWEEP_LOOK.speed * dt;
    while (move > 0 && s.i < s.way.length - 1) {
      const a = s.way[s.i], b = s.way[s.i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
      const step = Math.min(move, len - s.d);
      s.d += step;
      move -= step;
      const u = len ? s.d / len : 1;
      this.at = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      if (Math.abs(b.x - a.x) > 1) this.face = b.x > a.x ? -1 : 1;
      if (s.d >= len - 0.01) {
        s.i++;
        s.d = 0;
      }
    }
    s.wiped += SWEEP_LOOK.speed * dt;
    if (s.wiped > 18) {
      s.wiped = 0;
      for (const m of [this.old, this.dust, this.fresh]) m.erase(this.at.x, this.at.y, SWEEP_LOOK.brush);
      this.mote(this.at.x + this.face * 14, this.at.y + 2);
      this.mote(this.at.x + this.face * 20, this.at.y - 4);
    }
    if (img) img.setVisible(true).setPosition(this.at.x, this.at.y + 6).setDepth(this.at.y + 6).setFlipX(this.face < 0).setAngle(-this.face * 4);
    // The camera rides with her.
    const k = Math.min(1, dt * 4);
    cam.scrollX += (this.at.x - cam.width / 2 - cam.scrollX) * k;
    cam.scrollY += (this.at.y - 30 - cam.height / 2 - cam.scrollY) * k;
    if (s.i >= s.way.length - 1) s.fading = 0;
  }

  private endSweep(after?: () => void) {
    if (!this.sweep) return;
    this.sweep = null;
    for (const m of [this.old, this.dust, this.fresh]) {
      m.clear();
      m.alpha = 1;
    }
    princessSave.set(swept(princessSave.get()));
    this.h.setCut(null);
    this.at = { x: DOCK.x, y: DOCK.y };
    this.h.scene.time.delayedCall(500, () => this.h.speak(this.h.cat() ? 'You let the cat sleep in my dock.' : 'Nobody swept. I could tell from the Ether.'));
    after?.();
    this.afterSweep = null;
  }

  // ------------------------------------------------------------ dev

  /** A dev override: Rumba rides (on), never (off), or as the visit rolled (null). */
  ride(v: boolean | null) {
    this.forceRide = v;
  }

  debug() {
    return {
      at: { x: Math.round(this.at.x), y: Math.round(this.at.y) },
      moving: this.moving,
      riding: this.ridingNow(),
      sweeping: !!this.sweep,
      boots: this.boots ? { land: this.boots.b, left: this.boots.left } : null,
      deck: { ...princessSave.get().deck, his: princessSave.get().deck.his.length, trips: princessSave.get().deck.trips.length, stage: dustStage(princessSave.get().deck.dust) },
      pile: princessSave.get().pile,
      stamps: this.stats.stamps,
      bakeMs: this.stats.bakeMs,
      bakeParts: this.stats.parts,
      marks: { old: this.old.stats, dust: this.dust.stats, fresh: this.fresh.stats },
    };
  }
}

/** A trail's opacity at print i of n: full, then fading over the last `TRAIL.fade` share as the boots run clean. */
const trailAlpha = (i: number, n: number) => {
  const from = n * (1 - TRAIL.fade);
  return TRAIL.alpha * (i < from ? 1 : Math.max(0.15, 1 - (i - from) / (n - from)));
};

/** The floor her rounds and the crew's errands use: the deck, round the table, bench, lever and the booths and their props. */
export function deckFloor(s: HubState): (x: number, y: number) => boolean {
  const blocks = [
    { x: TABLE.x, y: TABLE.y, r: 100 },
    { x: BENCH.x, y: BENCH.y - 15, r: 70 },
    { x: LEVER.x, y: LEVER.y, r: 26 },
    ...boothBlocks(s.stations),
  ];
  return (x, y) => walkable(x, y) && blocks.every((b) => Math.hypot(x - b.x, (y - b.y) * 1.6) >= b.r);
}

/** The dock (a copper ring on the deck, contacts and a pilot lamp: lit, dark), the Planner's pencil berth, her pile. */
function makeDockArt(scene: Phaser.Scene) {
  FLOOR.add('princess-dock');
  FLOOR.add('princess-dock-off');
  const ring = (lit: boolean) => (c: CanvasRenderingContext2D) => {
    c.fillStyle = 'rgba(20,14,10,0.35)';
    c.beginPath();
    c.ellipse(60, 32, 52, 22, 0, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = COL.copper;
    c.beginPath();
    c.ellipse(60, 30, 48, 19, 0, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 2;
    c.strokeStyle = COL.copperHi;
    c.beginPath();
    c.ellipse(60, 29, 48, 19, Math.PI, 0, Math.PI);
    c.stroke();
    c.strokeStyle = COL.brassLo;
    c.beginPath();
    c.ellipse(60, 30, 36, 13, 0, 0, Math.PI * 2);
    c.stroke();
    // Two brass contacts at the back, the pilot lamp on its little post.
    c.fillStyle = COL.brass;
    c.fillRect(50, 16, 6, 5);
    c.fillRect(64, 16, 6, 5);
    c.fillStyle = COL.iron;
    c.fillRect(18, 10, 4, 14);
    c.fillStyle = lit ? '#b8ffb0' : '#3a3a34';
    c.beginPath();
    c.arc(20, 9, 4, 0, Math.PI * 2);
    c.fill();
  };
  canvas(scene, 'princess-dock', 120, 60, ring(true));
  canvas(scene, 'princess-dock-off', 120, 60, ring(false));
  if (!scene.textures.exists('princess-dock-pencil')) {
    const t = scene.textures.createCanvas('princess-dock-pencil', 120 * S, 60 * S)!;
    const c = t.getContext();
    c.scale(S, S);
    c.strokeStyle = 'rgba(200,196,186,0.75)';
    c.lineWidth = 1.2;
    c.setLineDash([4, 3]);
    c.beginPath();
    c.ellipse(60, 30, 48, 19, 0, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(200,196,186,0.8)';
    c.font = 'italic 8px serif';
    c.fillText('bird bath', 40, 56);
    t.refresh();
  }
  canvas(scene, 'princess-pile', 34, 20, (c) => {
    c.fillStyle = '#b8ad9a';
    c.beginPath();
    c.ellipse(17, 14, 15, 6, 0, Math.PI, 0);
    c.quadraticCurveTo(26, 4, 17, 3);
    c.quadraticCurveTo(8, 4, 2, 14);
    c.fill();
    c.fillStyle = '#8a8070';
    c.beginPath();
    c.ellipse(17, 14, 15, 3, 0, 0, Math.PI);
    c.fill();
    // A few glints of scrap in it.
    c.fillStyle = COL.brassHi;
    for (const [x, y] of [[11, 9], [20, 7], [24, 11]]) c.fillRect(x, y, 2, 2);
    c.fillStyle = COL.ironHi;
    c.fillRect(15, 11, 3, 2);
  });
}

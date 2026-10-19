/**
 * Mission 1's old works (`games/ludum-dare-60/docs/onboarding.md`): the hand-made dungeon he crash-lands in after the fall,
 * one path that teaches one thing at a time, its mini-boss and the lift home. Plain TS; the Sim holds one as `Sim.intro` on the
 * land `levels/lands/intro.json`, whose ASCII rows draw the layout: rock and floor for the land, and the letters below for this
 * module (the land file's own `lift` and `seep` entities are the lift and the tap).
 *
 * Why a land file and not a `HANDCRAFTED` dungeon: a dungeon is entered from a land and climbs back out to it (`Dungeon` scene,
 * `dungeonlink.ts`), and its rooms are generated; a land file is drawn by hand tile by tile and its lift ends the mission the
 * usual way (results, the Ascent, the hub). What the dungeon has that the intro wants (no clock, no sky, no arrivals from the
 * rim, the dark) the Sim and the views read from `Sim.intro` instead.
 *
 * Legend (one character a tile; `INTRO_KEYS`):
 *   S  where he lands         k  a checkpoint (a fall stands him up at the last one he reached)
 *   w  a crumbling wall piece (a plug; one piece broken brings its whole plug down)
 *   1  a dazed Crawlcam before the first plug (it comes back if it dies before the plug falls, so the lesson cannot lock)
 *   2, 3  a dazed Crawlcam and a dazed one standing right behind it
 *   v  the shovel             c  the Crawlcam that walks over once the shovel is in hand
 *   $  the scrap pile (room A)  f  a room's foe (leashed to its room)  b  a baby caterpillar beside them  T  the tap (room B; the land's seep)
 *   x  crates on room C's door  B  Bellows, lying downed  g  his three guards
 *   =  the den's blockage (sealed until the three rooms are done)  M  the mini-boss (the Tusked Caterpillar, `caterpillar.ts`)  |  the lift's blockage (falls with it)
 * Dazed foes (`Hornet.dazed`) cannot move or attack (`foes.ts` `fly`); a kick still sends them flying.
 *
 * Steps (`IntroRun.step`, shown in `debugState().intro`): kick, crash, shovel, walker, rooms, den, lift.
 * Onboarding (`onboard.ts`; the land's `emptyHud` starts the HUD empty): each cue is placed as he comes near its thing and taken when
 * it is done (the onboard glows the first untaken one only): the kick engraved before each dazed pair, the shovel under the shovel,
 * the swing beside it, the scrap under the pile, the tap, Use at Bellows. HUD pieces show with what needs them: the weapon with the
 * shovel, oil when he is first hurt or reaches the tap, the objective in the hall, scrap at the pile, the crew list when Bellows stands.
 * Add a beat: a letter in the land's rows and in `INTRO_KEYS`, its rule in `step`, its line in `introlines.ts`.
 */
import { LEVEL1, T, TAP, type Material } from './defs';
import { dist } from './geom';
import { LANDS } from './lands';
import { tie } from './leash';
import { spawnBoss } from './boss';
import { spawnHornet } from './foes';
import { addProp, breakProp, type Prop } from './props';
import { INTRO_ICONS, INTRO_LINES, INTRO_WITHIN, MOMENT, type IntroLine } from './introlines';
import type { Spot } from './mapgen';
import type { Cue, HudId } from './onboard';
import type { Bot, Hornet, Loot, Sim } from './sim';

/** The intro land's id (`levels/lands/intro.json`). */
export const INTRO_LAND = 'intro';

/**
 * Numbers, all guesses except `oil` (onboarding.md: half oil). `wall`: a plug's pieces (a worn wood wall, cracked from the start).
 * `foe`/`guard`: a room's foes wake within `wake` tiles and hunt no farther than `tiles` from where they stand. `boss`: the den's.
 * `shovel`: px he must come within. `check`: tiles from a checkpoint that count as reaching it. `down`: seconds he lies before a
 * free respawn, standing up with `oil` of his bar. `key`: seconds before the first plug's dazed Crawlcam comes back.
 * `dazedHp`: the share of its health a dazed Crawlcam stands with (Minos: hurt and stunned, about 10%), so any crash kills it.
 * Placing the dazed ones: about half a kick's travel (`KICK.knock`, about 4.6 tiles on open ground) from what they crash into.
 */
export const INTRO = {
  oil: 0.5,
  wall: { material: 'wood' as Material, wear: 0.45 },
  foe: { wake: 6, tiles: 9 },
  guard: { wake: 6, tiles: 8 },
  boss: { wake: 8, tiles: 16 },
  shovel: 26,
  check: 2.5,
  down: 2,
  key: 2,
  dazedHp: 0.1,
};

export const INTRO_KEYS = 'Sk w123vc$fbTxB g=M|'.replace(/ /g, '');
export type IntroStep = 'kick' | 'crash' | 'shovel' | 'walker' | 'rooms' | 'den' | 'lift' | 'done';
export type IntroRoom = 'scrap' | 'tap' | 'bellows';
/** The places a dev command jumps to (`intro go <where>`): the steps' spots, by name. */
export const INTRO_SPOTS = ['start', 'plug', 'pair', 'shovel', 'hall', 'scrap', 'tap', 'bellows', 'den', 'boss', 'lift'] as const;
export type IntroSpot = (typeof INTRO_SPOTS)[number];

/** Every tile of each letter in the land's rows. */
export function introLetters(rows = LANDS[INTRO_LAND]?.rows?.rows ?? []): Record<string, Spot[]> {
  const out: Record<string, Spot[]> = {};
  rows.forEach((r, y) => [...r].forEach((ch, x) => INTRO_KEYS.includes(ch) && (out[ch] ??= []).push({ x, y })));
  return out;
}

const px = (s: Spot): Spot => ({ x: (s.x + 0.5) * T, y: (s.y + 0.5) * T });
const sealed = 1e9;

/** The old works while the mission runs: what each beat holds and how far he has got. */
export class IntroRun {
  readonly at: Record<string, Spot[]>;
  readonly start: Spot;
  /** The checkpoint he stands up at after a fall (px). */
  check: Spot;
  plug: Prop[] = [];
  den: Prop[] = [];
  gate: Prop[] = [];
  crates: Prop[] = [];
  key: Hornet | null = null;
  keyT = 0;
  pair: Hornet[] = [];
  walker: Hornet | null = null;
  boss: Hornet | null = null;
  bellows: Bot | null = null;
  guards: Hornet[] = [];
  pile: Loot[] = [];
  /** He has the shovel in hand; the rooms done; he has stood in the tap's steam; the den's way and the lift's are open. */
  armed = false;
  tapped = false;
  rooms: Record<IntroRoom, boolean> = { scrap: false, tap: false, bellows: false };
  open = false;
  lift = false;
  /** Lines said by this module (also in `Sim.said`). */
  private lines = new Set<IntroLine>();
  /** The onboard's cue ids, by name (placed once). */
  private cues: Record<string, number> = {};

  constructor(readonly sim: Sim) {
    this.at = introLetters();
    this.start = px(this.at.S?.[0] ?? sim.map.lift);
    this.check = { ...this.start };
  }

  /** Lay the old works out and put him on the floor where he fell: half oil, nothing in hand. */
  setup() {
    const { sim, at } = this;
    const c = sim.controller;
    Object.assign(c, this.start);
    c.hold = { ...this.start };
    c.hp = c.maxHp * INTRO.oil;
    sim.unarmed = true;
    // The generic land lines do not run here; the tap's own is this module's.
    sim.said.add('tap-heal');
    sim.said.add('spider'); // the Crawlcam's general line (`spider.ts`): down here the beats teach it one at a time
    for (const b of sim.bots) if (b !== c) Object.assign(b, sim.passableNear(this.start.x + 30, this.start.y + 20));
    const wall = (s: Spot, m: Material, wear: number) => addProp(sim, { kind: 'wall', x: s.x, y: s.y, material: m, wear });
    this.plug = (at.w ?? []).map((s) => wall(s, INTRO.wall.material, INTRO.wall.wear));
    this.den = (at['='] ?? []).map((s) => this.seal(wall(s, 'concrete', 1)));
    this.gate = (at['|'] ?? []).map((s) => this.seal(wall(s, 'brass', 1)));
    this.crates = (at.x ?? []).map((s) => addProp(sim, { kind: 'crate', x: s.x, y: s.y, wear: 0.7 }));
    this.key = at[1]?.[0] ? this.dazed(at[1][0]) : null;
    this.pair = [...(at[2] ?? []), ...(at[3] ?? [])].map((s) => this.dazed(s));
    for (const s of at.f ?? []) tie(this.crawlcam(s), px(s), INTRO.foe);
    for (const s of at.b ?? []) tie(this.sim.spawnHornet(px(s).x, px(s).y, 0, false, false, 'caterpillar', { menacing: false }), px(s), INTRO.foe);
    this.pile = (at.$ ?? []).map((s) => sim.restLoot(px(s).x, px(s).y, 'scrap'));
    const bs = at.B?.[0];
    if (bs) {
      // Bellows lies as a wreck mended for free (`downed.ts`): standing up, he is one of the crew and `found` sends him home with the haul.
      const b = (this.bellows = sim.addBot('gatherer', 'Bellows', px(bs).x, px(bs).y, 0));
      b.hp = 0;
      b.downed = { by: null, fix: LEVEL1.fix, wreck: true, found: true };
      b.state = 'idle';
      for (const s of at.g ?? []) {
        const h = this.crawlcam(s);
        tie(h, px(bs), INTRO.guard);
        this.guards.push(h);
      }
    }
    this.say('landed');
  }

  /** A wall that holds until this module brings it down. */
  private seal(p: Prop) {
    p.hp = p.maxHp = sealed;
    return p;
  }

  private crawlcam(s: Spot) {
    const p = px(s);
    return this.sim.spawnHornet(p.x, p.y, 0, false, false, 'spider', { menacing: false });
  }

  private dazed(s: Spot) {
    const h = this.crawlcam(s);
    h.dazed = true;
    h.hp = Math.max(1, h.maxHp * INTRO.dazedHp);
    return h;
  }

  private say(id: IntroLine, tone: 'calm' | 'warn' = 'calm') {
    this.lines.add(id);
    this.sim.say(`intro-${id}`, INTRO_LINES[id], tone, { within: INTRO_WITHIN[id] ?? MOMENT, icon: INTRO_ICONS[id] });
  }

  /** A cue placed once, at a tile's centre (`dy` tiles below it). */
  private cue(name: string, s: Spot | undefined, c: Omit<Cue, 'x' | 'y'>, dx = 0, dy = 0) {
    if (!s || name in this.cues) return;
    this.cues[name] = this.sim.onboard.cue({ ...c, ...px({ x: s.x + dx, y: s.y + dy }) });
  }
  private took(...names: string[]) {
    for (const n of names) if (n in this.cues) this.sim.onboard.take(this.cues[n]);
  }
  private show(...ids: HudId[]) {
    this.sim.onboard.reveal(...ids);
  }

  private near(s: Spot | undefined, tiles: number) {
    const c = this.sim.controller;
    return !!s && dist(c.x, c.y, px(s).x, px(s).y) < tiles * T;
  }

  /** Bring a wall down whatever its health (a plug's other pieces, the sealed den and lift). */
  private fell(ps: Prop[]) {
    for (const p of ps) if (!p.broken) breakProp(this.sim, p, null);
  }

  step(dt: number) {
    const { sim, at } = this;
    const c = sim.controller;
    // A plug falls whole once one piece is down.
    if (this.plug.some((p) => p.broken) && this.plug.some((p) => !p.broken)) this.fell(this.plug);
    const plugUp = this.plug.some((p) => !p.broken);
    if (plugUp && this.near(at[1]?.[0], 5)) {
      this.say('plug');
      this.cue('kick1', at[1]?.[0], { icon: '', key: 'kick' }, -1);
    }
    if (!plugUp) this.took('kick1');
    if (!plugUp && this.lines.has('plug')) this.say('plugDown');
    // The first plug's dazed Crawlcam comes back if it died with the plug still up (kicked into the rock instead).
    if (plugUp && this.key?.dead && at[1]?.[0]) {
      this.keyT += dt;
      if (this.keyT >= INTRO.key) {
        this.keyT = 0;
        this.key = this.dazed(at[1][0]);
      }
    }
    if (this.near(at[2]?.[0], 5) && !plugUp) {
      this.say('pair');
      this.cue('kick2', at[2]?.[0], { icon: '', key: 'kick' }, -1);
    }
    if (this.pair.every((h) => h.dead)) this.took('kick2');
    if (c.hp < c.maxHp * INTRO.oil - 1) this.show('oil');
    // The shovel: in hand as he walks over it; the walker sets off.
    const sv = at.v?.[0];
    if (!this.armed && sv && this.near(sv, 5)) {
      this.say('shovel');
      this.cue('shovel', sv, { icon: 'gear-shovel' });
    }
    if (this.walker?.dead) this.took('fire');
    if (!this.armed && sv && dist(c.x, c.y, px(sv).x, px(sv).y) < INTRO.shovel) this.arm();
    if (this.near(at.k?.[2], 4) && this.armed) {
      this.say('hall');
      this.show('objective');
    }
    // The three rooms.
    if (!this.rooms.scrap && this.pile.length && this.pile.every((l) => l.dead)) this.done('scrap');
    if (this.near(at.$?.[0], 6)) {
      this.say('scrap');
      this.show('scrap');
      this.cue('scrap', at.$?.[0], { icon: 'scrapgob' });
    }
    const tap = sim.seeps[0];
    if (tap && dist(c.x, c.y, tap.x, tap.y) < TAP.reach * 1.6) {
      this.say('tap');
      this.show('oil');
      this.cue('tap', at.T?.[0], { icon: 'oilcan' });
    }
    if (!this.rooms.tap && tap && dist(c.x, c.y, tap.x, tap.y) <= TAP.reach) this.done('tap');
    if (this.crates.some((p) => !p.broken) && this.near(at.x?.[1], 4)) this.say('crates');
    if (this.bellows && this.near(at.B?.[0], 7)) {
      this.say('bellows');
      this.cue('use', at.B?.[0], { icon: '', key: 'use' }, 0, 1);
    }
    if (!this.rooms.bellows && this.bellows && !this.bellows.downed) {
      this.done('bellows');
      this.show('roster');
      this.say('mended');
    }
    if (!this.open && Object.values(this.rooms).every(Boolean)) this.unseal();
    if (this.open && this.near(at.M?.[0], 10)) {
      this.say('den', 'warn');
      this.boss ??= this.spawnBoss();
    }
    if (!this.lift && this.boss?.dead) {
      this.lift = true;
      this.fell(this.gate);
      sim.events.push({ e: 'intro', what: 'lift', x: sim.lift.x, y: sim.lift.y });
      this.say('bossDown');
    }
    // Checkpoints: the last one reached is where a fall stands him up.
    for (const k of at.k ?? []) if (this.near(k, INTRO.check)) this.check = px(k);
  }

  private spawnBoss() {
    const m = this.at.M![0];
    return spawnBoss(this.sim, 'caterpillar', { ...px(m), y: px(m).y - 30 }, { leash: INTRO.boss });
  }

  /** The shovel is his: in hand, and the next Crawlcam walks over. */
  arm() {
    if (this.armed) return;
    const { sim } = this;
    this.armed = true;
    sim.unarmed = false;
    const sv = this.at.v?.[0];
    sim.events.push({ e: 'intro', what: 'shovel', ...(sv && px(sv)) });
    sim.onboard.item({ name: 'Shovel', icon: 'gear-shovel', ...(sv && px(sv)) });
    this.show('weapon');
    this.took('kick1', 'kick2', 'shovel');
    this.cue('fire', sv, { icon: '', key: 'fire' }, 0, 2);
    this.say('armed');
    const cs = this.at.c?.[0];
    if (cs) this.walker = this.crawlcam(cs);
  }

  private done(room: IntroRoom) {
    this.rooms[room] = true;
    this.took(room === 'bellows' ? 'use' : room);
    this.sim.events.push({ e: 'intro', what: room });
  }

  /** The three rooms are done: the den's blockage falls. */
  unseal() {
    if (this.open) return;
    this.open = true;
    this.fell(this.den);
    const d = this.at['=']?.[1];
    this.sim.events.push({ e: 'intro', what: 'open', ...(d && px(d)) });
    this.say('open');
  }

  /** Where he is in the old works. */
  get stepNow(): IntroStep {
    if (this.sim.phase !== 'mission') return 'done';
    if (this.lift) return 'lift';
    if (this.open) return 'den';
    if (this.armed) return this.walker && !this.walker.dead ? 'walker' : 'rooms';
    if (this.plug.some((p) => !p.broken)) return 'kick';
    return this.pair.some((h) => !h.dead) ? 'crash' : 'shovel';
  }

  /** What the Oracle wants now, one clause (`Sim.objective`). */
  get objective() {
    switch (this.stepNow) {
      case 'kick': return 'Kick ({kick}) the dazed machine through the rotten wall.';
      case 'crash': return 'Kick the first machine into the second.';
      case 'shovel': return 'Find your shovel.';
      case 'walker': return 'Beat the Crawlcam ({fire}).';
      case 'rooms': return `See to the rooms round the hall (${Object.values(this.rooms).filter(Boolean).length}/3).`;
      case 'den': return 'Beat what waits in the den.';
      case 'lift': return 'Ride the lift up ({use} twice).';
      default: return 'Rising to the Wanderer.';
    }
  }

  /** A fall down here costs nothing: he stands up at the last checkpoint. */
  respawn() {
    const { sim } = this;
    const c = sim.controller;
    Object.assign(c, sim.passableNear(this.check.x, this.check.y));
    c.path = [];
    sim.engine.revive(c, INTRO.oil);
    sim.events.push({ e: 'intro', what: 'respawn', x: c.x, y: c.y });
    this.show('oil');
    this.say('respawn', 'warn');
  }

  /** Dev: stand him at a beat (the earlier beats done for him where the place needs them). */
  go(where: IntroSpot) {
    const { sim, at } = this;
    const c = sim.controller;
    const spot: Record<IntroSpot, Spot | undefined> = {
      start: at.S?.[0], plug: at.k?.[0] && { x: at[1]![0].x - 2, y: at[1]![0].y }, pair: at.k?.[0], shovel: at.k?.[1], hall: at.k?.[2],
      scrap: at.$?.[0] && { x: at.$[0].x, y: at.$[0].y + 2 }, tap: at.T?.[0] && { x: at.T[0].x, y: at.T[0].y - 2 }, bellows: at.B?.[0] && { x: at.B[0].x, y: at.B[0].y + 2 },
      den: at.k?.[3], boss: at.M?.[0] && { x: at.M[0].x - 5, y: at.M[0].y }, lift: at.L?.[0] ?? sim.map.lift,
    };
    const late = INTRO_SPOTS.indexOf(where);
    if (late >= INTRO_SPOTS.indexOf('pair')) this.fell(this.plug);
    if (late >= INTRO_SPOTS.indexOf('hall')) this.arm();
    if (where === 'bellows') this.fell(this.crates);
    if (late >= INTRO_SPOTS.indexOf('den')) this.unseal();
    if (where === 'lift') {
      this.boss ??= this.spawnBoss();
      sim.slay(this.boss);
    }
    const s = spot[where] ?? sim.map.lift;
    Object.assign(c, sim.passableNear(px(s).x, px(s).y));
    c.path = [];
    return `intro: at ${where}`;
  }

  summary() {
    return {
      step: this.stepNow,
      armed: this.armed,
      rooms: { ...this.rooms },
      open: this.open,
      lift: this.lift,
      plug: this.plug.filter((p) => !p.broken).length,
      pair: this.pair.filter((h) => !h.dead).length,
      boss: this.boss ? (this.boss.dead ? 'down' : Math.round(this.boss.hp)) : null,
      check: [Math.round(this.check.x / T - 0.5), Math.round(this.check.y / T - 0.5)],
      cues: Object.keys(this.cues),
    };
  }
}

/** The intro of this land, if it is the old works: laid out at once. */
export function makeIntro(sim: Sim): IntroRun | null {
  if (sim.map.rules?.id !== INTRO_LAND) return null;
  const run = new IntroRun(sim);
  sim.intro = run;
  run.setup();
  return run;
}


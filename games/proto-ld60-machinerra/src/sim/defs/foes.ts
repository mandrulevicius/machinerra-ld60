/**
 * The enemies: every body (`FOES`), the night's twisting (`TWISTED`), the spider, hives (`NEST`), the shy and the whistle.
 * Add an enemy: an `Enemy` id, its `FOES` and `TWISTED` rows (and `ENEMY_PARTS` in loot.ts).
 */
import type { StatusId } from '../effects';
import type { DamageType } from './base';

export const HORNET = {
  hp: 18,
  dmg: 5,
  rate: 0.9,
  speed: 150,
  r: 9,
  reach: 22,
  /** It hunts robots within this many tiles of itself. */
  aggroTiles: 14,
  /** Elites: bigger (`scale`, a draw size only: P50 raised it from 1.35 to carry their limbs, Minos "can make elites bigger to better support additional limbs"; reach and hit radius are unchanged), tougher, angrier, and they always drop a part. None in the morning; from the day's start their chance (`chance` is the share of spawns by dusk, held after) rises from `start` of it (`eliteChance`, tiers.ts). */
  elite: { chance: 0.18, start: 0.2, hp: 2, dmg: 1.3, scale: 1.6 },
};

/**
 * Every enemy's body: health, sting, speed, size and how far it hunts. A `ranged` one keeps its distance (`keep` px,
 * orbiting) and spits plasma bolts (`bolt`) every `every` seconds at whatever it hunts; it still stings up close.
 * `ground`: it rolls on tracks instead of flying (drawn on the sand). The hornet's numbers are `HORNET` (live tunes).
 */
export interface FoeDef {
  name: string;
  hp: number;
  dmg: number;
  rate: number;
  speed: number;
  r: number;
  reach: number;
  aggroTiles: number;
  ground?: boolean;
  /** It strikes like a twisted one dashes (a tell, then a lunge), twisted or not (the rattler). */
  lunge?: TwistDef['dash'];
  ranged?: { keep: number; every: [number, number]; bolt: { speed: number; dmg: number; life: number } };
  /** A hive lets this kind out in packs of up to this many at once (monkeys in threes, bleaters in herds). */
  pack?: number;
  /**
   * Damage types it takes `WEAK` times of, and `RESIST` times of (sim/effects.ts; games/ludum-dare-60/docs/biomes.md).
   * Set on the jungle's, city's and mountains' machines and bosses; the desert's and the Wastes' are left even for now
   * (their families in effects.ts `FAMILIES` would halve the shovel against hornets).
   */
  weak?: DamageType[];
  resist?: DamageType[];
  /** The damage type of its blows (stings, bites, bolts): their rider status can land on a robot (`RIDERS` in effects.ts). Biomes' tables (biomes.md, first column) give them. */
  type?: DamageType;
  /** A ghost (the Ether's): no hit lands on it and nothing shoves it until the Communicator has ghost touch (`Sim.ghostTouch`: the Esteemed Ghost freed). */
  ethereal?: boolean;
  /** Every blow of its that lands (sting or bolt) also puts this status on the robot: a love-bot's heart Taunts (the bot runs to it), a frost mite Chills. */
  onHit?: StatusId;
  /** It heals this share of the oil its blows take (the leech drone drinks). */
  drain?: number;
  /** A kick bursts it, whatever its oil: it splashes this much Acid on the foes round it. */
  pops?: number;
  /** It moves through rock (the vein-crawlers live in the walls); shots still stop at the rock. */
  walls?: boolean;
  /** It moves and strikes only while the Communicator is not aiming at it (a mannequin). */
  shy?: boolean;
  /** When it first spots a robot it whistles: every foe within this many tiles hunts that robot for `ALARM.time` s. */
  alarm?: number;
  /** It waits under the floor (nothing reaches it; Play draws a crack) until its lunge bursts it out, then stays up this many seconds. */
  burrow?: number;
}

/** The mall-cop drone's whistle (`FoeDef.alarm`): how long the foes it calls hunt, and how much farther they look while they do. */
export const ALARM = { time: 8, aggro: 3 };

/** A mannequin (`FoeDef.shy`) freezes while the Communicator aims within `cone` radians of it, up to `tiles` away. */
export const SHY = { tiles: 12, cone: 0.6 };

export const FOES: Record<Enemy, FoeDef> = {
  hornet: { name: 'Mechahornet', type: 'pierce', hp: HORNET.hp, dmg: HORNET.dmg, rate: HORNET.rate, speed: HORNET.speed, r: HORNET.r, reach: HORNET.reach, aggroTiles: HORNET.aggroTiles },
  // The Demon Wastes (BIOMES.demon): demon-vampire robots, from Laimonas's sheets. Faster, harder-hitting, hunting farther.
  swarmer: { name: 'Scythe-wing swarmer', type: 'pierce', hp: 26, dmg: 8, rate: 0.75, speed: 215, r: 12, reach: 26, aggroTiles: 18 },
  drone: { name: 'Plasma track-drone', type: 'dark', hp: 34, dmg: 6, rate: 1.1, speed: 95, r: 13, reach: 24, aggroTiles: 17, ground: true, ranged: { keep: 200, every: [1.5, 2.6], bolt: { speed: 250, dmg: 9, life: 1.7 } } },
  // The desert's second machine: a smart-home spider (`SPIDER`, sim/spider.ts). Slower than a hornet, tougher, and it hits in bursts.
  spider: { name: 'Crawlcam', type: 'pierce', hp: 22, dmg: 4, rate: 1.1, speed: 120, r: 14, reach: 22, aggroTiles: 13, ground: true },
  // The desert dungeon's (sim/dungeon.ts): a brass rattlesnake robot. Coils, rattles (the tell) and strikes 3 tiles.
  snake: { name: 'Rattler', type: 'acid', hp: 16, dmg: 6, rate: 1, speed: 105, r: 11, reach: 22, aggroTiles: 9, ground: true, lunge: { every: [1.4, 2.6], tell: 0.5, time: 0.2, speed: 4.2, dmg: 1.4, range: 3.5 } },
  // The Rustwood Jungle (games/ludum-dare-60/docs/biomes.md): a theme park's animatronic beasts. A lunge's tell is the
  // pounce's crouch and the charge's pawing; its `range` is in tiles, its `speed` a multiple of the walk.
  cat: { name: 'Pounce-cat', type: 'impact', weak: ['impact'], resist: ['pierce'], hp: 22, dmg: 6, rate: 0.9, speed: 135, r: 12, reach: 24, aggroTiles: 15, ground: true, lunge: { every: [2.2, 3.6], tell: 0.8, time: 0.32, speed: 4.6, dmg: 1.6, range: 5 } },
  boar: { name: 'Ramjet boar', type: 'impact', weak: ['shock'], resist: ['impact'], hp: 40, dmg: 7, rate: 1.1, speed: 95, r: 15, reach: 26, aggroTiles: 13, ground: true, lunge: { every: [3, 4.6], tell: 0.9, time: 0.6, speed: 4.2, dmg: 2, range: 8 } },
  monkey: { name: 'Spanner monkey', type: 'pierce', weak: ['impact'], hp: 14, dmg: 4, rate: 0.8, speed: 175, r: 10, reach: 20, aggroTiles: 15, ground: true, pack: 3, ranged: { keep: 170, every: [1.6, 2.8], bolt: { speed: 230, dmg: 5, life: 1.4 } } },
  // The Hollow City: humanised androids and the robot horses. An officer whistles the pack over when it first sees a robot (`alarm`, P31: biomes.md "whistles to call the nearest pack"; the reach is `BEAST.whistle`'s guess).
  commuter: { name: 'Commuter', type: 'impact', weak: ['impact'], resist: ['shock'], hp: 30, dmg: 7, rate: 1, speed: 80, r: 12, reach: 22, aggroTiles: 9, ground: true, pack: 3 },
  officer: { name: 'Officer unit', type: 'shock', weak: ['scald'], resist: ['shock'], hp: 30, dmg: 6, rate: 1, speed: 100, r: 12, reach: 22, aggroTiles: 16, ground: true, alarm: 10, ranged: { keep: 150, every: [1.8, 3], bolt: { speed: 320, dmg: 8, life: 1 } } },
  charger: { name: 'Carousel charger', type: 'impact', weak: ['pierce'], resist: ['impact'], hp: 44, dmg: 8, rate: 1.1, speed: 120, r: 16, reach: 28, aggroTiles: 16, ground: true, lunge: { every: [2.6, 4], tell: 0.7, time: 0.55, speed: 4, dmg: 2, range: 9 } },
  // The Frostspine: mechanical goats and mech birds.
  goat: { name: 'Ram-goat', type: 'impact', weak: ['impact'], resist: ['pierce'], hp: 34, dmg: 8, rate: 1, speed: 130, r: 13, reach: 24, aggroTiles: 15, ground: true, lunge: { every: [2, 3.2], tell: 0.6, time: 0.4, speed: 4.4, dmg: 2, range: 6 } },
  bleater: { name: 'Bleater', type: 'cold', weak: ['pierce'], resist: ['impact'], hp: 12, dmg: 4, rate: 0.8, speed: 165, r: 9, reach: 20, aggroTiles: 14, ground: true, pack: 5 },
  kite: { name: 'Talon kite', type: 'pierce', weak: ['pierce'], resist: ['scald'], hp: 24, dmg: 6, rate: 1, speed: 190, r: 12, reach: 24, aggroTiles: 18, lunge: { every: [2.2, 3.4], tell: 0.9, time: 0.35, speed: 3.8, dmg: 2.2, range: 9 } },
  // The biomes' bosses (`BOSSES`); never in a hive's mix, so these bodies are only what a stray spawn would be.
  gorilla: { name: 'The Ironback', type: 'impact', weak: ['shock'], resist: ['impact'], hp: 60, dmg: 10, rate: 1, speed: 85, r: 20, reach: 30, aggroTiles: 16, ground: true },
  knight: { name: 'Sir Lancelot-9', type: 'pierce', weak: ['impact'], resist: ['pierce'], hp: 60, dmg: 10, rate: 1, speed: 100, r: 18, reach: 30, aggroTiles: 16, ground: true },
  bear: { name: 'Ursa Polaris', type: 'impact', weak: ['scald'], resist: ['pierce'], hp: 60, dmg: 10, rate: 1, speed: 100, r: 20, reach: 30, aggroTiles: 16, ground: true },
  // The designed dungeons (dungeons.md, sim/dungeon.ts `KITS`), two foes and a mini-boss each (the bosses' bodies here are
  // only a stray spawn's; `BOSSES` is how they fight). The jungle's Tunnel of Love: piranha-tronics leap out of the water,
  // love-bots shoot heart arrows that Taunt a robot over to them.
  piranha: { name: 'Piranha-tronic', type: 'pierce', weak: ['shock'], resist: ['impact'], hp: 12, dmg: 5, rate: 0.8, speed: 150, r: 9, reach: 20, aggroTiles: 9, ground: true, pack: 3, lunge: { every: [1.6, 2.8], tell: 0.4, time: 0.28, speed: 4.6, dmg: 1.4, range: 4.5 } },
  cupid: { name: 'Love-bot', type: 'pierce', weak: ['pierce'], resist: ['dark'], hp: 14, dmg: 3, rate: 1, speed: 140, r: 10, reach: 20, aggroTiles: 11, onHit: 'taunted', ranged: { keep: 170, every: [2.2, 3.4], bolt: { speed: 280, dmg: 4, life: 1.6 } } },
  croc: { name: 'Captain Croc', type: 'pierce', weak: ['shock'], resist: ['pierce'], hp: 60, dmg: 10, rate: 1, speed: 90, r: 22, reach: 30, aggroTiles: 16, ground: true },
  // The city's Galleria: mannequins that move only while you look away, shopping-cart crawlers that charge the aisles,
  // mall-cop drones that whistle the rest over.
  mannequin: { name: 'Mannequin', type: 'impact', weak: ['impact'], resist: ['pierce'], hp: 26, dmg: 9, rate: 0.9, speed: 175, r: 11, reach: 22, aggroTiles: 12, ground: true, shy: true },
  cart: { name: 'Cart crawler', type: 'impact', weak: ['shock'], resist: ['pierce'], hp: 22, dmg: 5, rate: 1, speed: 100, r: 12, reach: 22, aggroTiles: 11, ground: true, lunge: { every: [2.2, 3.4], tell: 0.6, time: 0.5, speed: 4.4, dmg: 1.8, range: 8 } },
  copdrone: { name: 'Mall-cop drone', type: 'shock', weak: ['impact'], resist: ['shock'], hp: 16, dmg: 4, rate: 1, speed: 150, r: 10, reach: 20, aggroTiles: 12, alarm: 10, ranged: { keep: 160, every: [2.2, 3.4], bolt: { speed: 300, dmg: 5, life: 1.2 } } },
  mallcop: { name: 'Mall Cop Mk. III', type: 'shock', weak: ['scald'], resist: ['shock'], hp: 60, dmg: 10, rate: 1, speed: 110, r: 20, reach: 30, aggroTiles: 16, ground: true },
  // The Wastes' Blood Cistern: leech drones latch on and drink (a kick bursts them), vein-crawlers swim through the walls.
  leech: { name: 'Leech drone', type: 'acid', weak: ['fire', 'steam'], resist: ['dark'], hp: 14, dmg: 4, rate: 0.6, speed: 165, r: 9, reach: 18, aggroTiles: 11, pack: 2, drain: 1, pops: 14 },
  veinworm: { name: 'Vein-crawler', type: 'acid', weak: ['fire'], resist: ['impact'], hp: 24, dmg: 6, rate: 1, speed: 95, r: 11, reach: 22, aggroTiles: 10, ground: true, walls: true, lunge: { every: [2, 3.2], tell: 0.6, time: 0.3, speed: 4.2, dmg: 1.6, range: 5 } },
  bishop: { name: 'The Bishop of Veins', type: 'acid', weak: ['fire'], resist: ['dark'], hp: 60, dmg: 10, rate: 1, speed: 80, r: 22, reach: 30, aggroTiles: 16, ground: true },
  // The mountains' Glacier Hangar: frost mites that Chill, ice-auger drillers that wait under the floor and bore up under you.
  mite: { name: 'Frost mite', type: 'cold', weak: ['scald'], resist: ['cold'], hp: 10, dmg: 3, rate: 0.7, speed: 130, r: 8, reach: 18, aggroTiles: 10, ground: true, pack: 4, onHit: 'chilled' },
  driller: { name: 'Ice-auger driller', type: 'pierce', weak: ['scald'], resist: ['pierce'], hp: 28, dmg: 7, rate: 1, speed: 90, r: 13, reach: 24, aggroTiles: 10, ground: true, burrow: 2.4, lunge: { every: [2.4, 3.6], tell: 0.9, time: 0.25, speed: 3.6, dmg: 2, range: 4 } },
  snowcat: { name: 'The Snowcat', type: 'impact', weak: ['scald'], resist: ['cold'], hp: 60, dmg: 10, rate: 1, speed: 100, r: 22, reach: 30, aggroTiles: 16, ground: true },
  // The Ether (the secret sixth biome, P44): ghosts of old machines, all ethereal. Wisps drift and dart, shades stalk and
  // lunge out of the dark, banshees keep away and wail bolts of cold steam.
  wisp: { name: 'Wisp', type: 'dark', ethereal: true, hp: 18, dmg: 5, rate: 0.9, speed: 170, r: 10, reach: 22, aggroTiles: 16, lunge: { every: [2.4, 3.8], tell: 0.5, time: 0.25, speed: 3.6, dmg: 1.4, range: 6 } },
  shade: { name: 'Shade', type: 'dark', ethereal: true, hp: 34, dmg: 8, rate: 1, speed: 110, r: 13, reach: 24, aggroTiles: 14, ground: true, lunge: { every: [2.2, 3.4], tell: 0.7, time: 0.3, speed: 4.4, dmg: 1.8, range: 5 } },
  banshee: { name: 'Banshee', type: 'cold', ethereal: true, hp: 22, dmg: 5, rate: 1, speed: 130, r: 12, reach: 22, aggroTiles: 18, ranged: { keep: 190, every: [1.6, 2.6], bolt: { speed: 260, dmg: 8, life: 1.6 } } },
  evilOracle: { name: 'The Evil Oracle', type: 'dark', ethereal: true, hp: 60, dmg: 10, rate: 1, speed: 100, r: 20, reach: 30, aggroTiles: 16 },
  // Level 1's mini-boss (P9, `BOSSES.foreman`): a hornet sized up, standing guard over Sprocket's wreck. Never spawned by a hive.
  foreman: { name: 'Hive Foreman', type: 'pierce', hp: HORNET.hp * 6, dmg: HORNET.dmg, rate: HORNET.rate, speed: HORNET.speed, r: 18, reach: 34, aggroTiles: 9 },
};

/**
 * The Crawlcam, a robot spider (a security camera on eight legs; sim/spider.ts, drawn in spider.ts). It walks, so it is
 * slower than a hornet and goes round, not over: but it climbs, mesas and the map's rim alike (slower on rock).
 * - Stalk: it creeps toward its target in bursts (`go` seconds moving, `stop` seconds frozen), curving round it (`flank`
 *   radians at long range, a flank, not a charge), and bites (`FOES.spider.dmg`) when it is on you.
 * - Pounce: inside `range` tiles (not closer than `min`) it rears up (`tell`; the landing point is locked for the last
 *   `lock` of it, so it can be sidestepped), leaps (`time`), and lands for `dmgMul` bites in a `radius` px disc, then rests
 *   (`rest`: the opening to hit it). Cooldown `every`; its twisted form uses `TWISTED.spider.dash` for the same things.
 * - Web: from `min` to `range` tiles it spits a cable (`tell`, then a shot of `speed`, `life`). A robot it hits is
 *   tethered for up to `time` seconds and moves at `slow` of its speed; the cable lets go when the spider dies or the
 *   robot gets `leash` tiles away. It will not web one that is already webbed.
 * - Edge: the desert's off-map arrival is the spider (`BIOMES.desert.edge`; the timing is `EDGE`, defs/day.ts): it leaps in from
 *   beyond the map's rim (a `leap` of `time` s and `arc` px landing `in` tiles inside, no blow), has no hive and hunts the nearest robot
 *   from anywhere. `spread`: tiles an arrival slides along the rim (and its landing across), so they do not stack. `mix` (biome): the share of a hive's spawns that are spiders.
 * - Legs: `legs` (the twisted form has `twistedLegs`); the gait is sim/gait.ts, `ELEV` the ground height under a foot.
 */
export const SPIDER = {
  legs: 8,
  twistedLegs: 10,
  stalk: { go: [0.5, 0.9] as [number, number], stop: [0.22, 0.5] as [number, number], burst: 1.35, flank: 0.95, rock: 0.55, dune: 0.85 },
  pounce: { every: [1.8, 3.2] as [number, number], tell: 0.7, lock: 0.22, time: 0.38, range: 3.4, min: 1, rest: 0.95, dmgMul: 2, radius: 28, arc: 44 },
  web: { every: [6, 9] as [number, number], first: [1, 4] as [number, number], tell: 0.6, speed: 340, life: 1.5, range: 7, min: 2.5, time: 1.8, slow: 0.2, leash: 9 },
  edge: { time: 1.1, arc: 130, in: 6, spread: 3 },
};

/** Ground height (px) under a spider's foot: dunes are barely raised, a mesa's top is a climb. */
export const ELEV = { sand: 0, dune: 1.5, hardpan: 0, rock: 11 };

/**
 * Twisted versions of an enemy (night): a violet-red glow and an aura. Each has an aura (robots inside move at `slow`
 * of their speed and lose `dps` oil a second; damage stacks up to `stack` auras, slowing does not), erratic dashes (a
 * tell, then a lunge) and a little more damage. One entry per enemy type, so new enemies get their nightmare.
 */
export interface Aura { radius: number; slow: number; dps: number; stack: number }

export interface TwistDef {
  name: string;
  hp: number;
  dmg: number;
  speed: number;
  aura: Aura;
  dash: { every: [number, number]; tell: number; time: number; speed: number; dmg: number; range: number };
  color: number;
}

export const TWISTED: Record<Enemy, TwistDef> = {
  hornet: {
    name: 'Twisted mechahornet',
    hp: 1.25,
    dmg: 1.3,
    speed: 1,
    aura: { radius: 84, slow: 0.6, dps: 1, stack: 2 },
    dash: { every: [1.8, 3.4], tell: 0.45, time: 0.28, speed: 3.4, dmg: 1.5, range: 11 },
    color: 0xb040ff,
  },
  swarmer: {
    name: 'Blood-drunk swarmer',
    hp: 1.25,
    dmg: 1.35,
    speed: 1.05,
    aura: { radius: 90, slow: 0.55, dps: 1.4, stack: 2 },
    dash: { every: [1.4, 2.8], tell: 0.4, time: 0.3, speed: 3.2, dmg: 1.6, range: 12 },
    color: 0xff2040,
  },
  drone: {
    name: 'Blood-drunk track-drone',
    hp: 1.25,
    dmg: 1.3,
    speed: 1,
    aura: { radius: 100, slow: 0.6, dps: 1.2, stack: 2 },
    dash: { every: [2.4, 4], tell: 0.5, time: 0.3, speed: 2.6, dmg: 1.4, range: 9 },
    color: 0xff2040,
  },
  // A spider's `dash` is its pounce: `every` the cooldown, `tell` the rear-up, `time` the leap, `range` the reach in tiles, `dmg` the landing's share on top of `dmg`; `speed` is unused.
  spider: {
    name: 'Twisted crawlcam',
    hp: 1.25,
    dmg: 1.3,
    speed: 1.12,
    aura: { radius: 80, slow: 0.6, dps: 1, stack: 2 },
    dash: { every: [1.1, 2.2], tell: 0.42, time: 0.3, speed: 1, dmg: 1.2, range: 4.2 },
    color: 0xff2a78,
  },
  snake: {
    name: 'Twisted rattler',
    hp: 1.25,
    dmg: 1.3,
    speed: 1.1,
    aura: { radius: 70, slow: 0.65, dps: 1, stack: 2 },
    dash: { every: [0.9, 1.8], tell: 0.4, time: 0.22, speed: 4.6, dmg: 1.5, range: 4 },
    color: 0xc040ff,
  },
  cat: twistOf('Twisted pounce-cat', 'cat', 0xb040ff),
  boar: twistOf('Twisted ramjet boar', 'boar', 0xb040ff),
  monkey: twistOf('Twisted spanner monkey', 'monkey', 0xb040ff),
  commuter: twistOf('Commuter on overtime', 'commuter', 0xc040ff),
  officer: twistOf('Twisted officer unit', 'officer', 0xc040ff),
  charger: twistOf('Fire-hoofed charger', 'charger', 0xff5030),
  goat: twistOf('Twisted ram-goat', 'goat', 0x9060ff),
  bleater: twistOf('Screaming bleater', 'bleater', 0x9060ff),
  kite: twistOf('Twisted talon kite', 'kite', 0x9060ff),
  gorilla: twistOf('The Ironback', 'gorilla', 0x9fe060),
  knight: twistOf('Sir Lancelot-9', 'knight', 0xe0c060),
  bear: twistOf('Ursa Polaris', 'bear', 0x9fd8ff),
  wisp: twistOf('Howling wisp', 'wisp', 0xb070ff),
  shade: twistOf('Deep shade', 'shade', 0x8040ff),
  banshee: twistOf('Shrieking banshee', 'banshee', 0xb070ff),
  evilOracle: twistOf('The Evil Oracle', 'evilOracle', 0x9040ff),
  foreman: twistOf('Hive Foreman', 'foreman', 0xb040ff),
  piranha: twistOf('Frenzied piranha-tronic', 'piranha', 0xb040ff),
  cupid: twistOf('Heartbroken love-bot', 'cupid', 0xff40a0),
  croc: twistOf('Captain Croc', 'croc', 0x9fe060),
  mannequin: twistOf('Display-model mannequin', 'mannequin', 0xc040ff),
  cart: twistOf('Runaway cart', 'cart', 0xc040ff),
  copdrone: twistOf('Night-shift drone', 'copdrone', 0xc040ff),
  mallcop: twistOf('Mall Cop Mk. III', 'mallcop', 0x9fd8ff),
  leech: twistOf('Gorged leech drone', 'leech', 0xff2040),
  veinworm: twistOf('Arterial crawler', 'veinworm', 0xff2040),
  bishop: twistOf('The Bishop of Veins', 'bishop', 0xd04040),
  mite: twistOf('Rime mite', 'mite', 0x9060ff),
  driller: twistOf('Deep driller', 'driller', 0x9060ff),
  snowcat: twistOf('The Snowcat', 'snowcat', 0xbfe4ff),
};

/**
 * What a twisted kind does beyond the aura and the dash (systems.md, "Built kinds"; sim/tiers.ts): the hornet's dash leaves a Dark
 * `streak` (a robot crossing it gets Dread), the rattler's strike an acid `pool`, the Crawlcam's cable Scalds (`scald`), the
 * swarmer's hits Haste it and heal it by a share of what they dealt, and a drone's bolts `split` in `count` at the end of their
 * flight (each `dmg` of the bolt's, `life` s of flight, spread `spread` radians). A patch is `Patch` (tiers.ts): it shows at once,
 * is live after `arm` s, lasts `life` s, and gives `status` for `time` s at most every `every` s. `patches` caps the streaks and
 * pools alive on a land (the oldest go first). The kinds that are Laimonas's keep their plain `TWISTED` rows. Numbers are guesses.
 */
export const TWIST_FX = {
  streak: { radius: 20, life: 2.5, arm: 0, every: 1, status: 'dread', time: 2 },
  pool: { radius: 34, life: 4, arm: 0.4, every: 1, status: 'corroded', time: 2 },
  patches: 16,
  scald: 'scalded' as StatusId,
  swarmer: { haste: 2, heal: 0.2 },
  split: { count: 3, dmg: 0.5, life: 0.5, spread: 0.5 },
};

/**
 * Damage states (systems.md, "Damage states"): an elite, or a boss without a second form, breaks at each of `at` of its health:
 * the break changes what it can do (its row in `BREAKS`; a boss, a kind without a row and Laimonas's kinds get `GENERIC_BREAKS`)
 * and drops one of its parts on the spot. A boss with a second form has that as its one break (D18; `sim/boss.ts`). A break is
 * a flag (`Hornet.breaks`) read where the move lives, or a multiplier (`CUT`) that `Sim.berserk(h)` carries: `halfDmg` is "half
 * the damage" (the swarmer's snapped scythe, systems.md; the hornet's snapped stinger, "bite only", reads the same). The rest are
 * guesses: a grounded swarmer walks at `grounded` of its speed, a stuttering gait at `slow`, a cracked cannon's bolts fly at
 * `slowBolt` of the speed, a cracked lens misses `webMiss` of its cables.
 */
export type BreakId = 'noDash' | 'noPounce' | 'webMiss' | 'noAcid' | 'noKeep' | 'slowBolt' | 'halfDmg' | 'grounded' | 'slow'
  | 'wingTorn' | 'broodBurst' | 'tailTorn' | 'jawCracked' | 'shieldOff' | 'pistolBlown';
export interface BreakDef { id: BreakId; name: string; blurb: string }
export const BREAK = { at: [0.66, 0.33] as const, slowBolt: 0.6, webMiss: 0.5 };
/** The multipliers of the damage and the speed a break leaves. */
export const CUT: Partial<Record<BreakId, { dmg?: number; speed?: number }>> = { halfDmg: { dmg: 0.5 }, grounded: { speed: 0.6 }, slow: { speed: 0.7 } };
export const BREAKS: Partial<Record<Enemy, [BreakDef, BreakDef]>> = {
  hornet: [
    { id: 'noDash', name: 'Wing torn', blurb: 'No more dashes.' },
    { id: 'halfDmg', name: 'Stinger snapped', blurb: 'It can only bite: half the damage.' },
  ],
  spider: [
    { id: 'noPounce', name: 'Two legs lost', blurb: 'It can no longer pounce.' },
    { id: 'webMiss', name: 'Lens cracked', blurb: 'Half its cables miss.' },
  ],
  snake: [
    { id: 'noDash', name: 'Tail cut', blurb: 'No more lunge.' },
    { id: 'noAcid', name: 'Fangs snapped', blurb: 'No more acid.' },
  ],
  swarmer: [
    { id: 'grounded', name: 'Wing cut', blurb: 'Grounded: it is slower.' },
    { id: 'halfDmg', name: 'Scythe snapped', blurb: 'Half the damage.' },
  ],
  drone: [
    { id: 'noKeep', name: 'Track broken', blurb: 'It cannot keep its distance.' },
    { id: 'slowBolt', name: 'Cannon cracked', blurb: 'Its bolts fly slower.' },
  ],
};
export const GENERIC_BREAKS: [BreakDef, BreakDef] = [
  { id: 'slow', name: 'Gait stuttering', blurb: 'It moves slower.' },
  { id: 'halfDmg', name: 'Plating torn', blurb: 'It hits half as hard.' },
];

/** The twisted form of a biome's machine: a lunger lunges more often and faster; the rest learn the hornet's dash. */
function twistOf(name: string, kind: Enemy, color: number): TwistDef {
  const L = FOES[kind].lunge;
  const dash = L ? { ...L, every: [L.every[0] * 0.7, L.every[1] * 0.7] as [number, number], speed: L.speed * 1.1 } : { every: [1.8, 3.4] as [number, number], tell: 0.45, time: 0.28, speed: 3.2, dmg: 1.5, range: 10 };
  return { name, hp: 1.25, dmg: 1.3, speed: 1.05, aura: { radius: 84, slow: 0.6, dps: 1.1, stack: 2 }, dash, color };
}

export const NEST = {
  hp: 320,
  r: 26,
  /** A gatherer stripping a ruin within this many tiles of a hive wakes it. */
  wakeTiles: 9,
  /** Seconds between hornets: from calm (the morning) to frantic (midnight and past), and how many may fly per hive. The clock wakes the hives (`DAY.hives`). */
  interval: [5, 1.1] as [number, number],
  alive: [3, 14] as [number, number],
};

export type Enemy = 'hornet' | 'swarmer' | 'drone' | 'spider' | 'snake' | 'cat' | 'boar' | 'monkey' | 'commuter' | 'officer' | 'charger' | 'goat' | 'bleater' | 'kite' | 'gorilla' | 'knight' | 'bear' | 'wisp' | 'shade' | 'banshee' | 'evilOracle' | 'foreman'
  | DungeonFoe;

/** The four designed dungeons' foes and mini-bosses (games/ludum-dare-60/docs/dungeons.md, sim/dungeon.ts `KITS`). */
export type DungeonFoe = 'piranha' | 'cupid' | 'croc' | 'mannequin' | 'cart' | 'copdrone' | 'mallcop' | 'leech' | 'veinworm' | 'bishop' | 'mite' | 'driller' | 'snowcat';

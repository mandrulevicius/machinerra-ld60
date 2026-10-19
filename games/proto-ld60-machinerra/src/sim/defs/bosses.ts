/**
 * The bosses: `BOSSES` (moves, second forms, drops), the arenas and the castle, the Ironback's monkeys.
 * Add a boss: a `BOSSES` entry (its `cycle` names the moves).
 */
import type { StatusId } from '../effects';
import type {
  Aura,
  BreakId,
  Enemy,
} from './foes';
import type { PartKind } from './loot';

/**
 * Bosses, one per enemy type, built from it. The queen keeps a ring around her target and cycles her attacks: a fan of
 * slow bolts (`volley`), a telegraphed charge (`charge`) and a brood of twisted hornets (`summon`); under `enrage` of
 * her health she attacks `enrageRate` times as often and fires more bolts. She is big, not a sponge.
 */
export interface BossDef {
  name: string;
  hp: number;
  r: number;
  scale: number;
  speed: number;
  /** Distance she keeps from her target, px. */
  ring: number;
  /** Sting on contact, and its rate. */
  sting: { dmg: number; rate: number };
  /** Seconds between attacks. */
  every: number;
  cycle: BossMove[];
  volley: { tell: number; bolts: number; extra: number; spread: number; speed: number; dmg: number; life: number };
  /** `stuck`: after the charge it stands stuck for `rest` (a lance in a wall, a bear in the rocks): the kick window. `strafe`: bombs it drops beside its line as it goes (`every` s, each `dmg`, thrown sideways at `speed`). */
  charge: { tell: number; time: number; speed: number; dmg: number; knock: number; rest: number; stuck?: boolean; /** Rock under its line (the land's own, not only a place's props) stops it dead: stuck and hurt (the Foreman's ram). */ rock?: boolean; strafe?: { every: number; dmg: number; speed: number }; /** What a robot it strikes gets too (the Mall Cop's baton Staggers). */ status?: StatusId };
  /**
   * A shockwave ring (a chest drum, a sword sweep, a roar): it grows from the boss at `speed` to `max` px; a robot inside its
   * `width` takes `dmg` and is thrown out (a negative `knock` pulls it in: the Bishop's chord), and gets `status` if it has one
   * (the megaphone's Stagger, the Snowcat's flood lights Blind). Dash through it.
   */
  quake?: { tell: number; speed: number; width: number; max: number; dmg: number; knock: number; status?: StatusId };
  /** A leap (or a dive): it leaves the ground for `air` s while a shadow grows where it lands (it follows the target until the last `lock` s); the landing hurts and throws everything in `radius`. */
  slam?: { tell: number; air: number; lock: number; radius: number; dmg: number; knock: number };
  /** `kind`: what it calls (its own kind when left out). */
  summon: { tell: number; count: number; max: number; kind?: Enemy };
  aura: Aura;
  enrage: number;
  enrageRate: number;
  /** What she drops: `core` AI cores (one more bot each, P17), `parts` (the first `rare` of them the rarer kinds), `scrap` gobs of `gob` scrap each, `copper` pieces, `oil` cans (always one: a boss is the one place a can is promised) and her `unique` part (one, never sinks). */
  drops: { core: number; parts: number; rare: number; scrap: number; gob: number; copper: number; oil: number; unique: PartKind };
  color: number;
  /** The Oracle when it arrives (or wakes). */
  arrive: string;
  /** A mini-boss (level 1's Foreman): not a dusk boss, so its fall is not `bossDown` and the quest does not count it; it is shoved by kicks (`bossKnock`). */
  mini?: true;
  /** Its last words, said as it falls. */
  fall?: string;
  /**
   * Its second form, under `at` of its health: first `shift` seconds changing, still and open (it takes `open` times
   * the damage), then `def` replaces those parts of it. `fly`: it takes to the air (the bear's jet). `spawn`: what it
   * leaves behind (the knight's horse, an elite twisted one). `shield`: the share of damage it takes from in front.
   * `kickIn: 'stuck'`: a kick while it is stuck starts the change early (unhorsing). `kickCancels`: a kick while it
   * changes stops it (stuck 2 s) until it tries again `retry` seconds later.
   */
  phase2?: {
    at: number; shift: number; open: number; name: string; say: string; def: Partial<BossDef>; fly?: boolean; spawn?: Enemy; shield?: number; kickIn?: 'stuck'; kickCancels?: boolean; retry?: number;
    /** It changes back and forth: `every` seconds in its first form (the first change also comes at `at`), `stay` in the second, which ends in a dive (`slam`) that lands it as the first again. Under `at` of its health both are `low` times as long. */
    every?: number; stay?: number; low?: number;
  };
  /** What it summons throws it scrap while near it: it heals (`FEED`). Kill them first, or kick them away. */
  fed?: boolean;
  /** In its second form it veils itself every `every` seconds for `time`: nothing lands on it, ghost touch or not. */
  veil?: { every: number; time: number };
  /**
   * Its own two breaks at 66% and 33% of its oil (P22, `sim/tiers.ts` `breakCheck`), for a boss without a second form; a boss
   * without them takes `GENERIC_BREAKS`. A break changes the fight (its `patch`, kept for the rest of it) and drops one of the kind's parts.
   */
  breaks?: [BossBreak, BossBreak];
}

export type BossMove = 'volley' | 'charge' | 'summon' | 'quake' | 'slam';

/**
 * A patch on a `BossDef`: a table (`charge`, `volley`, ...) merges field by field into the boss's own, a list (`cycle`) or a plain
 * field replaces it. A break adds beats by a new `cycle`, and a move the boss never had (a `quake`) by giving the whole table.
 */
export type BossPatch = { [K in keyof BossDef]?: BossDef[K] extends readonly unknown[] ? BossDef[K] : BossDef[K] extends object | undefined ? Partial<NonNullable<BossDef[K]>> : BossDef[K] };

/** One break of a boss: what it is called, what changes (`patch`), and the move it winds up at once (`then`, ahead of its cycle). */
export interface BossBreak { id: BreakId; name: string; blurb: string; patch: BossPatch; then?: BossMove }

/**
 * One boss per enemy type that has one: the queen comes to the desert at dusk, the Harbinger waits in its castle, Old
 * Rattlejaw at the bottom of the desert's dungeon; the Ironback, Sir Lancelot-9 and Ursa Polaris come to the jungle, the
 * Hollow City and the Frostspine at dusk (games/ludum-dare-60/docs/biomes.md).
 */
export const BOSSES: { hornet: BossDef; drone: BossDef } & Partial<Record<Enemy, BossDef>> = {
  // The desert dungeon's mini-boss (sim/dungeon.ts): a mine's giant brass rattlesnake. It spits a fan of venom, strikes
  // the length of its den and rattles its brood out of the walls. Smaller than a boss of the sands; it drops a weapon.
  snake: {
    name: 'Old Rattlejaw',
    hp: 240,
    r: 26,
    scale: 2.6,
    speed: 85,
    ring: 170,
    sting: { dmg: 10, rate: 1 },
    every: 2.4,
    cycle: ['charge', 'volley', 'charge', 'summon'],
    volley: { tell: 0.6, bolts: 5, extra: 2, spread: 1, speed: 240, dmg: 7, life: 1.8 },
    charge: { tell: 0.8, time: 0.45, speed: 620, dmg: 18, knock: 60, rest: 1.3 },
    summon: { tell: 0.8, count: 3, max: 10, kind: 'snake' },
    aura: { radius: 90, slow: 0.8, dps: 0.6, stack: 1 },
    enrage: 0.5,
    enrageRate: 1.5,
    drops: { core: 1, parts: 3, rare: 0, scrap: 4, gob: 20, copper: 9, oil: 1, unique: 'rattlejaw-fang' },
    color: 0xc8a040,
    arrive: 'That rattling is not the pipes. Something big is coiled down there: it strikes in a straight line and spits wide. Sidestep the strike, then hit it while it uncoils.',
    // Breaks (P22): the tail goes, so the strike is short and he spits instead; then the jaw, and the brood and the acid come out together. Guesses.
    breaks: [
      { id: 'tailTorn', name: 'Tail torn', blurb: 'His strike is half as long: he spits more, and wider.', patch: { cycle: ['volley', 'charge', 'volley', 'summon', 'volley'], charge: { time: 0.3 }, volley: { bolts: 7 } } },
      { id: 'jawCracked', name: 'Jaw cracked', blurb: 'Acid runs from it: his strike Corrodes, and the brood pours out of the walls.', patch: { every: 2, charge: { status: 'corroded' } }, then: 'summon' },
    ],
  },
  // The other dungeons' mini-bosses (dungeons.md), each in its den with its weapon as the unique. The jungle's: the
  // ride's animatronic crocodile in a captain's hat. It dives under (its shadow), bursts out, sweeps its tail in a ring,
  // spits bilge and calls piranhas ("Ahoy!").
  croc: {
    name: 'Captain Croc',
    hp: 300,
    r: 26,
    scale: 2.6,
    speed: 90,
    ring: 160,
    sting: { dmg: 12, rate: 1 },
    every: 2.3,
    cycle: ['slam', 'quake', 'charge', 'summon', 'slam', 'volley'],
    volley: { tell: 0.6, bolts: 3, extra: 2, spread: 0.8, speed: 240, dmg: 7, life: 1.6 },
    charge: { tell: 0.7, time: 0.4, speed: 560, dmg: 16, knock: 60, rest: 1.1 },
    quake: { tell: 0.6, speed: 280, width: 26, max: 200, dmg: 12, knock: 70 },
    slam: { tell: 0.5, air: 1.6, lock: 0.5, radius: 80, dmg: 22, knock: 90 },
    summon: { tell: 0.8, count: 3, max: 9, kind: 'piranha' },
    aura: { radius: 90, slow: 0.8, dps: 0.6, stack: 1 },
    enrage: 0.5,
    enrageRate: 1.5,
    drops: { core: 1, parts: 3, rare: 0, scrap: 4, gob: 20, copper: 9, oil: 1, unique: 'hookhand' },
    color: 0x6fbf5a,
    arrive: 'A crocodile in a captain\'s hat, Communicator, and it thinks this is its boat. It goes under: watch for its shadow, and step out of the ring when it comes up. "Ahoy" means piranhas.',
    fall: 'Thank you for riding the Tunnel of Love. Please keep your hands inside the boat.',
  },
  // The city's: a mall cop on a self-balancing scooter. Laps of the atrium in baton charges (they Stagger), a megaphone
  // whose ring Staggers too, taser darts, and it calls the carts.
  mallcop: {
    name: 'Mall Cop Mk. III',
    hp: 280,
    r: 24,
    scale: 2.4,
    speed: 120,
    ring: 180,
    sting: { dmg: 10, rate: 1 },
    every: 2.2,
    cycle: ['charge', 'quake', 'charge', 'summon', 'volley'],
    volley: { tell: 0.5, bolts: 3, extra: 2, spread: 0.6, speed: 320, dmg: 6, life: 1.2 },
    charge: { tell: 0.7, time: 0.5, speed: 640, dmg: 16, knock: 70, rest: 1.2, status: 'staggered' },
    quake: { tell: 0.8, speed: 300, width: 30, max: 240, dmg: 8, knock: 90, status: 'staggered' },
    summon: { tell: 0.8, count: 2, max: 8, kind: 'cart' },
    aura: { radius: 90, slow: 0.85, dps: 0.4, stack: 1 },
    enrage: 0.5,
    enrageRate: 1.5,
    drops: { core: 1, parts: 3, rare: 0, scrap: 4, gob: 20, copper: 9, oil: 1, unique: 'cop-megaphone' },
    color: 0x4a8fe0,
    arrive: 'Mall security. It has a scooter, a baton and a megaphone, and it takes all three very seriously. The baton charge and the megaphone both knock you silly: get out of the line, get out of the ring.',
    fall: 'Have a nice day. Have a nice. Have a.',
  },
  // The Wastes': a pump-organ robot in robes. Its pipes play a chord whose ring pulls everyone in, it sprays blood-oil,
  // and leeches crawl out of its pews to feed it.
  bishop: {
    name: 'The Bishop of Veins',
    hp: 300,
    r: 26,
    scale: 2.4,
    speed: 60,
    ring: 150,
    sting: { dmg: 12, rate: 1 },
    every: 2.5,
    cycle: ['quake', 'volley', 'summon', 'quake', 'volley', 'charge'],
    volley: { tell: 0.6, bolts: 7, extra: 2, spread: 1.4, speed: 220, dmg: 6, life: 1.8 },
    charge: { tell: 0.9, time: 0.5, speed: 420, dmg: 18, knock: 80, rest: 1.4 },
    quake: { tell: 1, speed: 220, width: 40, max: 300, dmg: 6, knock: -80 },
    summon: { tell: 0.8, count: 3, max: 10, kind: 'leech' },
    fed: true,
    aura: { radius: 100, slow: 0.8, dps: 0.8, stack: 1 },
    enrage: 0.5,
    enrageRate: 1.5,
    drops: { core: 1, parts: 3, rare: 0, scrap: 4, gob: 20, copper: 9, oil: 1, unique: 'hemo-pump' },
    color: 0xd04040,
    arrive: 'An organ is playing down here, and the organ is the priest. Its chord pulls you in toward the spray: walk against it. The leeches feed it; burst them with a kick.',
    fall: 'Amen. A-a-a-amen.',
  },
  // The mountains': a snow-groomer robot with a plough. It ploughs the hangar in lines, throws snow walls, and its flood
  // lights Blind whoever the ring catches. Its frost mites swarm.
  snowcat: {
    name: 'The Snowcat',
    hp: 320,
    r: 28,
    scale: 2.6,
    speed: 95,
    ring: 190,
    sting: { dmg: 12, rate: 1 },
    every: 2.4,
    cycle: ['charge', 'volley', 'quake', 'charge', 'summon'],
    volley: { tell: 0.7, bolts: 5, extra: 2, spread: 1.2, speed: 200, dmg: 8, life: 2 },
    charge: { tell: 0.9, time: 0.7, speed: 520, dmg: 20, knock: 110, rest: 1 },
    quake: { tell: 1, speed: 340, width: 34, max: 280, dmg: 4, knock: 20, status: 'blinded' },
    summon: { tell: 0.8, count: 4, max: 12, kind: 'mite' },
    aura: { radius: 100, slow: 0.75, dps: 0.6, stack: 1 },
    enrage: 0.5,
    enrageRate: 1.5,
    drops: { core: 1, parts: 3, rare: 0, scrap: 4, gob: 20, copper: 9, oil: 1, unique: 'ice-auger' },
    color: 0xbfe4ff,
    arrive: 'A snow groomer, still grooming. It ploughs in straight lines, and when the flood lights come up, look away or you will see nothing for a while.',
    fall: 'Piste closed. Piste closed. Pi.',
  },
  hornet: {
    name: 'The Hornet Queen',
    hp: 260,
    r: 30,
    scale: 3.6,
    speed: 95,
    ring: 240,
    sting: { dmg: 10, rate: 1 },
    every: 2.6,
    cycle: ['volley', 'charge', 'volley', 'summon'],
    volley: { tell: 0.6, bolts: 5, extra: 2, spread: 0.9, speed: 230, dmg: 7, life: 2.4 },
    charge: { tell: 0.9, time: 0.65, speed: 560, dmg: 22, knock: 60, rest: 1.2 },
    summon: { tell: 0.8, count: 4, max: 36 },
    aura: { radius: 130, slow: 0.7, dps: 1.5, stack: 2 },
    enrage: 0.5,
    enrageRate: 1.6,
    drops: { core: 1, parts: 4, rare: 2, scrap: 8, gob: 25, copper: 12, oil: 1, unique: 'queens-crown' },
    color: 0xff2060,
    arrive: 'That is a queen. I did not know they made those. She charges, she spits, she calls her brood: keep moving, keep your robots out of her shadow, and put a guard on whoever is siphoning.',
    // Breaks (P22): the wing goes, so she cannot hover back and rams instead, each ram leaving her stumbling; then the sac bursts and the brood is out. Guesses.
    breaks: [
      { id: 'wingTorn', name: 'Wing torn', blurb: 'She cannot hover back: she closes in and rams twice as often, and stumbles longer after each.', patch: { ring: 130, cycle: ['volley', 'charge', 'charge', 'volley', 'summon'], charge: { rest: 2 } } },
      { id: 'broodBurst', name: 'Brood sac burst', blurb: 'Her brood pours out at once, and she calls more of it, more often.', patch: { cycle: ['summon', 'volley', 'charge', 'summon', 'volley'], summon: { count: 6 } }, then: 'summon' },
    ],
  },
  // The Rustwood Jungle's: a theme park's animatronic gorilla, still putting on the show. Chest drums (rings), log
  // tosses (one big slow bolt, three when enraged), a leap from the canopy; at half oil the speakers blare and it calls
  // spanner monkeys. Weak to nothing in particular yet (the damage types are not built).
  gorilla: {
    name: 'The Ironback',
    hp: 360,
    r: 32,
    scale: 1,
    speed: 85,
    ring: 170,
    sting: { dmg: 12, rate: 1 },
    every: 2.4,
    cycle: ['quake', 'volley', 'slam', 'charge', 'quake', 'volley'],
    volley: { tell: 0.8, bolts: 1, extra: 2, spread: 0.5, speed: 210, dmg: 20, life: 2.2 },
    charge: { tell: 0.9, time: 0.5, speed: 480, dmg: 20, knock: 70, rest: 1.2 },
    quake: { tell: 0.9, speed: 260, width: 26, max: 270, dmg: 14, knock: 60 },
    slam: { tell: 0.6, air: 2, lock: 0.7, radius: 90, dmg: 26, knock: 90 },
    summon: { tell: 0.8, count: 2, max: 30, kind: 'monkey' },
    fed: true,
    aura: { radius: 110, slow: 0.75, dps: 1.2, stack: 2 },
    enrage: 0.25,
    enrageRate: 1.5,
    drops: { core: 1, parts: 4, rare: 2, scrap: 8, gob: 25, copper: 12, oil: 1, unique: 'ironback-drum' },
    color: 0x9fe060,
    arrive: 'Something big is beating its chest in the green. A gorilla, a park animatronic, and it thinks you are the audience. The drumming sends out a ring: dash through it or step back. When it climbs out of sight, watch for its shadow.',
    fall: 'Thank you for visiting. Please exit through the gift shop.',
    phase2: {
      at: 0.5,
      shift: 1,
      open: 1.5,
      name: 'The Ironback, grand finale',
      say: 'The park speakers came on. It is calling its monkeys to throw it scrap: kill them first, or it never ends.',
      def: { every: 2, cycle: ['summon', 'quake', 'slam', 'volley', 'quake', 'charge'] },
    },
  },
  // The Hollow City's: a museum knight on a mechanical destrier. Mounted, lance charges down a line that stick in what
  // they miss (stuck: the kick window; a kick then unhorses him); at half oil he falls off anyway, the horse fights on,
  // and on foot his shield takes the front.
  knight: {
    name: 'Sir Lancelot-9',
    hp: 440,
    r: 34,
    scale: 1,
    speed: 120,
    ring: 260,
    sting: { dmg: 14, rate: 1 },
    every: 2.2,
    cycle: ['charge', 'charge', 'summon', 'charge'],
    volley: { tell: 0.6, bolts: 3, extra: 2, spread: 0.6, speed: 260, dmg: 8, life: 1.6 },
    charge: { tell: 1, time: 0.8, speed: 600, dmg: 26, knock: 90, rest: 2, stuck: true },
    quake: { tell: 0.6, speed: 320, width: 22, max: 105, dmg: 16, knock: 70 },
    summon: { tell: 0.8, count: 2, max: 30, kind: 'charger' },
    aura: { radius: 110, slow: 0.75, dps: 1.2, stack: 2 },
    enrage: 0.25,
    enrageRate: 1.5,
    drops: { core: 1, parts: 5, rare: 2, scrap: 10, gob: 30, copper: 15, oil: 1, unique: 'paladin-lance' },
    color: 0xe0c060,
    arrive: 'A knight. On a horse. In this century. He charges in a straight line, and his lance sticks in whatever it misses: that is your moment. Get him off that horse.',
    fall: 'Tell the King... the dragon... was quite small.',
    phase2: {
      at: 0.5,
      shift: 1.2,
      open: 1.5,
      name: 'Sir Lancelot-9, on foot',
      say: 'Unhorsed! On foot he hides behind that shield: get behind him, send your robots round, or keep him busy. The horse still has opinions.',
      def: { speed: 80, ring: 60, every: 1.8, cycle: ['quake', 'charge', 'quake', 'summon'], charge: { tell: 0.7, time: 0.35, speed: 420, dmg: 18, knock: 70, rest: 0.9 }, summon: { tell: 0.8, count: 3, max: 30, kind: 'commuter' } },
      spawn: 'charger',
      shield: 0.15,
      kickIn: 'stuck',
    },
  },
  // The Frostspine's: a military transformer. A white bear (belly slides that end stuck, a roar ring); at half oil it
  // folds into a jet (two seconds open; a kick then stops it) that strafes in lines, fires missiles and dives.
  bear: {
    name: 'Ursa Polaris',
    hp: 520,
    r: 34,
    scale: 1,
    speed: 105,
    ring: 150,
    sting: { dmg: 16, rate: 0.9 },
    every: 2.2,
    cycle: ['charge', 'quake', 'charge', 'summon', 'quake'],
    volley: { tell: 0.8, bolts: 5, extra: 3, spread: 1.4, speed: 300, dmg: 10, life: 2 },
    charge: { tell: 0.9, time: 0.9, speed: 520, dmg: 24, knock: 90, rest: 1.6, stuck: true },
    quake: { tell: 0.8, speed: 240, width: 30, max: 220, dmg: 12, knock: 40 },
    slam: { tell: 0.5, air: 1.6, lock: 0.6, radius: 100, dmg: 30, knock: 110 },
    summon: { tell: 0.8, count: 4, max: 30, kind: 'bleater' },
    aura: { radius: 120, slow: 0.7, dps: 1.6, stack: 2 },
    enrage: 0.25,
    enrageRate: 1.5,
    drops: { core: 1, parts: 6, rare: 3, scrap: 12, gob: 35, copper: 18, oil: 1, unique: 'polaris-core' },
    color: 0x9fd8ff,
    arrive: 'A white bear the size of a hangar door, out of the glacier. It belly-slides in straight lines and it cannot turn: step aside and it stops in the rocks. And it is made of old military parts. I do not like what that means.',
    fall: 'Mission complete. Returning to base.',
    phase2: {
      at: 0.5,
      shift: 2,
      open: 2,
      name: 'Ursa Polaris, jet form',
      say: 'It folded itself into a flying machine. The steel eagle of the false gods. It strafes in lines and dives where its shadow falls: keep moving.',
      def: { speed: 200, ring: 280, every: 1.8, cycle: ['charge', 'volley', 'charge', 'slam'], charge: { tell: 1.2, time: 1, speed: 700, dmg: 20, knock: 60, rest: 0.6, strafe: { every: 0.09, dmg: 8, speed: 70 } } },
      fly: true,
      kickCancels: true,
      retry: 12,
      every: 26,
      stay: 14,
      low: 0.6,
    },
  },
  // Level 1's mini-boss (P9): a hornet sized up, standing guard over Sprocket's wreck (`sprocket` place, leashed: `leash.ts`). One
  // telegraphed move, the ram: it rears (a red lane shows its line), then charges down it. Sidestep and it overshoots; into rock it
  // is stuck, the window for a kick or a crash. Numbers are first guesses (tuned by playing).
  foreman: {
    name: 'The Hive Foreman',
    mini: true,
    hp: 100,
    r: 18,
    scale: 2.1,
    speed: 105,
    ring: 70,
    sting: { dmg: 7, rate: 1.1 },
    every: 2.2,
    cycle: ['charge'],
    volley: { tell: 1, bolts: 1, extra: 0, spread: 0, speed: 0, dmg: 0, life: 0 },
    charge: { tell: 0.9, time: 0.55, speed: 560, dmg: 14, knock: 50, rest: 0.9, rock: true },
    summon: { tell: 1, count: 0, max: 0 },
    aura: { radius: 0, slow: 1, dps: 0, stack: 1 },
    enrage: 0,
    enrageRate: 1,
    drops: { core: 0, parts: 1, rare: 0, scrap: 3, gob: 10, copper: 8, oil: 0, unique: 'hornet-head' },
    color: 0xd8a030,
    arrive: 'The Hive Foreman, sitting on her wreck. He rears before he rams: sidestep the red lane, and let him run into the rock.',
    fall: undefined,
  },
  // The Ether's lord (P44): the Evil Oracle, the Oracle's dark twin, who stole the wife. He waits in his church (place
  // `church`): dark volleys, his ghosts, rings of cold, a blink (a leap he makes as a ghost); at half oil he unveils, and
  // from then on he veils himself now and then (`veil`: no hit lands). Ethereal like his ghosts: ghost touch first.
  evilOracle: {
    name: 'The Evil Oracle',
    hp: 640,
    r: 30,
    scale: 1,
    speed: 95,
    ring: 220,
    sting: { dmg: 14, rate: 0.9 },
    every: 2.2,
    cycle: ['volley', 'summon', 'quake', 'slam', 'volley', 'quake'],
    volley: { tell: 0.6, bolts: 7, extra: 4, spread: 1.4, speed: 250, dmg: 10, life: 2.6 },
    charge: { tell: 0.8, time: 0.6, speed: 520, dmg: 22, knock: 70, rest: 0.8 },
    quake: { tell: 0.9, speed: 240, width: 28, max: 260, dmg: 14, knock: 50 },
    slam: { tell: 0.4, air: 1.2, lock: 0.5, radius: 90, dmg: 22, knock: 90 },
    summon: { tell: 0.8, count: 3, max: 30, kind: 'wisp' },
    aura: { radius: 150, slow: 0.65, dps: 2, stack: 2 },
    enrage: 0.25,
    enrageRate: 1.6,
    drops: { core: 1, parts: 6, rare: 3, scrap: 12, gob: 35, copper: 18, oil: 1, unique: 'false-halo' },
    color: 0x9040ff,
    arrive: 'There he is, in his false church. He cannot hide from the Esteemed Ghost now: hit him. He throws cold, calls his ghosts, and blinks; when he veils himself, nothing lands. Wait it out.',
    fall: 'Sister... you always did keep the lights on too long.',
    veil: { every: 7, time: 2.4 },
    phase2: {
      at: 0.5,
      shift: 1.4,
      open: 1.5,
      name: 'The Evil Oracle, unveiled',
      say: 'His veil is torn: now he hides behind it on purpose. When he fades, back off; when he is solid, hit him with everything.',
      def: { every: 1.8, speed: 120, cycle: ['volley', 'slam', 'summon', 'quake', 'slam', 'volley'], summon: { tell: 0.8, count: 2, max: 30, kind: 'shade' } },
      fly: true,
    },
  },
  // The Harbinger (Model Omega II, Laimonas's sheet): the lord of the Demon Wastes' castle, on spiked tracks, with a shield,
  // a plasma pistol and a claw. It wakes when you come to its gate and never strays far from its keep.
  drone: {
    name: 'The Harbinger',
    hp: 620,
    r: 38,
    scale: 1,
    speed: 80,
    ring: 190,
    sting: { dmg: 14, rate: 0.9 },
    every: 2.1,
    cycle: ['volley', 'summon', 'charge', 'volley', 'charge'],
    volley: { tell: 0.55, bolts: 7, extra: 4, spread: 1.25, speed: 265, dmg: 10, life: 2.6 },
    charge: { tell: 0.8, time: 0.75, speed: 540, dmg: 28, knock: 80, rest: 1 },
    summon: { tell: 0.8, count: 3, max: 32, kind: 'swarmer' },
    aura: { radius: 160, slow: 0.62, dps: 2.4, stack: 2 },
    enrage: 0.5,
    enrageRate: 1.7,
    drops: { core: 1, parts: 6, rare: 3, scrap: 12, gob: 35, copper: 18, oil: 1, unique: 'harbinger-heart' },
    color: 0xff1030,
    arrive: 'The Harbinger. It has been waiting for someone to knock. Shield in front, plasma behind, and it calls its swarm: circle it, keep moving, and keep your gatherers far from this castle.',
    // Breaks (P22): the shield comes off and the claw swings (a ring to dash through); then the pistol is blown and it fights up close, no more volleys. Guesses.
    breaks: [
      { id: 'shieldOff', name: 'Shield torn off', blurb: 'It swings the claw: a ring to dash through or step back from.', patch: { cycle: ['volley', 'quake', 'summon', 'charge', 'volley', 'quake', 'charge'], quake: { tell: 0.8, speed: 260, width: 34, max: 240, dmg: 10, knock: 80 } } },
      { id: 'pistolBlown', name: 'Pistol blown', blurb: 'No more volleys: it closes in with the claw, the rams and the swarm.', patch: { ring: 110, every: 1.7, cycle: ['quake', 'charge', 'summon', 'quake', 'charge'], charge: { rest: 0.7 } }, then: 'quake' },
    ],
  },
};

/** The boss def of a boss of this kind (the queen when the kind has none). */
export const bossOf = (kind: Enemy): BossDef => BOSSES[kind] ?? BOSSES.hornet;

/** How far a kick or a crash moves it, against a plain foe's 1: a boss barely budges, a mini-boss (level 1's Foreman) is shoved half as far. */
export const bossKnock = (h: { boss: boolean; kind: Enemy }) => (!h.boss ? 1 : bossOf(h.kind).mini ? 0.5 : 0.12);

/** The boss def as it fights now: its second form's parts over the first's once it has changed (`phase` 2). */
export function bossNow(kind: Enemy, phase?: number, broke?: readonly string[]): BossDef {
  const B = bossOf(kind);
  let now: BossDef = phase === 2 && B.phase2 ? { ...B, ...B.phase2.def, name: B.phase2.name } : B;
  // Each break it has taken, in order, patches what it fights with (P22).
  for (const b of B.breaks ?? []) if (broke?.includes(b.id)) now = patched(now, b.patch);
  return now;
}

/** A boss with a break's patch on it: a table merges field by field, a list or a plain field replaces. */
function patched(B: BossDef, patch: BossPatch): BossDef {
  const out: Record<string, unknown> = { ...B };
  for (const [k, v] of Object.entries(patch)) {
    const was = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && was && typeof was === 'object' ? { ...was, ...v } : v;
  }
  return out as unknown as BossDef;
}

/** The Ironback's monkeys: each throws it `heal` scrap every `every` seconds while within `range` px of it. */
export const FEED = { every: [2.6, 3.6] as [number, number], heal: 10, range: 260 };

/**
 * The dusk bosses' arenas (places `stage`, `plaza`, `lake`; sim/placeplay.ts): empty by day, the Oracle speaks at
 * `sight` tiles. At dusk the boss arrives there and holds it (it hunts no one farther than `CASTLE.leash` tiles from it);
 * at midnight it leaves it and comes hunting. A boss's charge that runs into one of the arena's props (a tree, a statue,
 * a car, a rock, the museum, the hangar: radius by kind, `props`) crashes: stuck `stun` seconds and `dmg` lost. On the
 * frozen lake (within `ice.r` tiles of its centre) kicks and swings fling foes `ice.knock` times as far, and a charge
 * slides `ice.slide` times as long.
 */
export const ARENA = {
  sight: 12,
  crash: { stun: 2.2, dmg: 40 },
  props: { tree: 16, statue: 16, car: 20, fountain: 30, rock: 18, museum: 64, hangar: 64 } as Record<string, number>,
  ice: { r: 4.4, knock: 2.2, slide: 1.4 },
};

/** The Harbinger's castle: the Oracle speaks at `sight` tiles, the Harbinger wakes at `wake`, and follows no one farther than `leash` tiles from its keep. Its blood pits are hives (`pits`). */
export const CASTLE = { sight: 13, wake: 7, leash: 16, pits: { hp: 160, scale: 0.8 } };

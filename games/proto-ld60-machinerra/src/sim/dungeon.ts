/**
 * Dungeons: Laimonas's idea (games/ludum-dare-60/docs/dungeons.md), generated from biome kits (P29). A place on a land
 * (`PLACES.dungeon`) leads down: a lift shaft, a ride's tunnel, a mall's escalators. Below is a chain of rooms with the
 * biome's dungeon foes, which drop its material, and a den at the end with a mini-boss that drops a weapon. The lift at
 * the way in climbs out (Use, then Use again to confirm, as on a land).
 *
 * Plain TS, no Phaser. Three layers:
 *  - **Data:** `KITS` (one per biome: its floor, foes, material, mini-boss pool, hazard, props), `TIERS` (rooms and side
 *    rooms by threat tier), `TWISTS` (Dark, Flooded, Hoard, Echoing), `HANDCRAFTED` (quest dungeons that take an
 *    entrance: the Sidewinder Shaft first).
 *  - **Generation:** `specFor` (the tier, the rolled twist and the handcrafted flag: one `DungeonSpec` per entrance),
 *    `generateDungeon` (the rooms as a `MapData` the Sim and the ground painter read like a land, plus the rooms, their
 *    kinds, the lever's shortcut and the trap's zones) and `dungeonSpawns` (who stands where). The same seed and spec
 *    give the same dungeon.
 *  - **The run:** `DungeonRun`, which the Sim holds down a dungeon (`Sim.run`): ambushes, the trap room's timer, the lever,
 *    Echoing's noise, the insight at the den. The Sim only calls `populate`, `step` and reads `wet`.
 *
 * The party comes down with the Communicator (`PARTY`): rooms and corridors are wide enough for it, and each room holds
 * more foes the bigger it is. Play draws a dungeon as its own scene (`Dungeon`, with `dungeonview.ts` for the rooms'
 * rules on screen), with the land asleep above until the Communicator climbs back out.
 *
 * **The den's way up:** the boss's fall cracks the den's east wall, blows open it, and the gap is a lift (`EXIT`, below;
 * `DungeonRun.wall`, `Sim.atExit`); in a cleared dungeon every robot rides, and the rise is safe (`lifted`). Tests: `dungeonexit.test.ts`.
 * A kit with `bosses: []` (the Ether's stub) has no designed mini-boss: `fallbackBoss` fields a biome elite with two traits
 * in the den (`DEN_ELITE`), paying the insight, both trait parts and the kit's material. `settleReward`: a boss's weapon comes
 * as the weapon once; once owned, its part stays a part.
 *
 * **What plugs in later:** the threat tier is an input (`DungeonSpec.tier`, from the landing's `Sim.tier`);
 * `handcrafted` is the entrance's field the quest system sets (`Sim.entrance.handcrafted`, an id in `HANDCRAFTED`).
 * Props are ids on the kit (`Kit.props`) placed in `Dungeon.props` as data; P39 draws them.
 *
 * Add a biome's dungeon: fill its `KITS` entry (its foe is an `Enemy` with `FOES`, `TWISTED`, `ENEMY_PARTS`, and its boss
 * a `BOSSES` entry whose `unique` part names the weapon item), drop `stub`, set `built`, and put `'dungeon'` in the
 * biome's `places`; its art is `foe-<kind>`, `foe-<boss>-boss`, `part-<kind>` and the entrance `dungeon-way-<biome>`
 * (`dungeonfoeart.ts`). Five are built (desert, jungle, city, Demon Wastes, mountains); the Ether's is a stub.
 * Add a quest dungeon: a `HANDCRAFTED` entry; its quest sets `Sim.entrance.handcrafted`.
 */
import { rng, type Rng } from '../../../../harness/kit/rng';
import { BIOMES, ENEMY_PARTS, FOES, PARTS, T, TRAITS_OF, type BiomeId, type Enemy, type LootKind, type PartKind, type TraitId } from './defs';
import type { DamageType } from './effects';
import { Ter, type MapData, type Spot } from './mapgen';
import type { Hornet, Input, Sim } from './sim';

// ---------------------------------------------------------------- data

export type Tier = 1 | 2 | 3;
export type Twist = 'dark' | 'flooded' | 'hoard' | 'echoing';
export type RoomKind = 'entry' | 'hall' | 'ambush' | 'side' | 'trap' | 'lever' | 'den';

export const TWIST_IDS: Twist[] = ['dark', 'flooded', 'hoard', 'echoing'];
export const TWISTS: Record<Twist, { name: string; /** What the Oracle says at the entrance. */ sight: string; /** And on the way down. */ down: string }> = {
  dark: { name: 'Dark', sight: 'The lamps down there are dead: no light but yours.', down: 'Dark down here. The only light is what you carry; keep your lamps close and your party closer.' },
  flooded: { name: 'Flooded', sight: 'Water stands in it: everything down there is Wet.', down: 'Flooded. Everything down here is Wet, you and your party and the machines. Shock bites twice as hard in water.' },
  hoard: { name: 'Hoard', sight: 'Someone was storing things down there: more rooms, and twice the guards.', down: 'A hoard. Twice the guards and an extra store room or two. Be greedy carefully.' },
  echoing: { name: 'Echoing', sight: 'The halls down there carry every sound: what you make in one room, the next one hears.', down: 'Echoing. Sound carries down here: a shot, a kick, a crash or a blast wakes the rooms near it, and what lives in them comes to where it was made. Fight quiet if you can; the shovel is quieter than a gun.' },
};

/** What the threat tier sets: chain rooms (the way in and the den count), side rooms, whether a trap or lever room comes, foes in a room, an ambush's wave. */
export const TIERS: Record<Tier, { rooms: number; sides: number; special: number; foes: [number, number]; ambush: [number, number] }> = {
  1: { rooms: 4, sides: 1, special: 0, foes: [2, 3], ambush: [3, 4] },
  2: { rooms: 6, sides: 1, special: 1, foes: [2, 4], ambush: [3, 5] },
  3: { rooms: 8, sides: 2, special: 1, foes: [3, 5], ambush: [4, 6] },
};
export const TIER_NAMES: Record<Tier, string> = { 1: 'shallow', 2: 'deep', 3: 'very deep' };

/** The twists' numbers. */
export const HOARD = { sides: 2, foes: 2 };
/**
 * Echoing: a noise (`Sim.noise`: a gunshot, a kick, a crash, a blast; a melee swing is quiet) fetches every foe not already
 * after someone within `reach` steps along the floor of where it was made (they walk there for `time` s, then give up), at most
 * every `every` s. `reach` is tiles of walking, not of line of sight: a wall between two rooms makes them far apart.
 */
export const ECHO = { reach: 40, time: 12, every: 1.5 };
/** Wet (`STATUSES.wet`): Shock hits it takes are doubled. Flooded makes everyone Wet. */
export const WET = { shock: 2 };
export const DARK = { ambient: 0x06060a, lamps: 0.55 };
export const AMBUSH = { /** Tiles from a room's centre at which its foes wake. */ reach: 3.2 };
export const LEVER = { /** Tiles. */ reach: 2.3 };

/** A biome's hazard, what its trap room fires on a timer: `zones` circles of `radius` tiles; each cycle is idle, `warn` seconds of telegraph, then a `burst` that hurts every robot inside once. */
/** The damage type of each hazard's blow (the tide is plain water: no type). */
const HAZARD_TYPE: Record<Hazard['status'], DamageType | undefined> = { scalded: 'steam', wet: undefined, chilled: 'cold', shocked: 'shock' };
export interface Hazard { name: string; zones: number; radius: number; period: number; warn: number; burst: number; dmg: number; /** The status it inflicts (`Sim.fx.apply`). */ status: 'scalded' | 'wet' | 'chilled' | 'shocked'; color: number; line: string }

export interface Kit {
  biome: BiomeId;
  /** Names a generated dungeon is called by (one per seed). */
  names: string[];
  entrance: string;
  verb: string;
  sight: string;
  down: string;
  /** The floor's mix: the chance of sand, then of dune, the rest hardpan (the ground painter recolours them per biome). */
  floor: [number, number];
  /** The mission scene's ambient light below. */
  ambient: number;
  /** 2-3 dungeon foes, their material (what the side caches hold) and the mini-boss pool (an `Enemy` with a `BOSSES` entry; empty = no designed one yet: the den holds an elite with two traits, `fallbackBoss`). */
  foes: Enemy[];
  material: PartKind;
  bosses: Enemy[];
  hazard: Hazard;
  /** Prop ids (P39) the kit names for its rooms; placed as data in `Dungeon.props`. */
  props: Partial<Record<RoomKind, string[]>>;
  /** Has its foes, boss and art: its biome's lands get an entrance. */
  built: boolean;
  /** Foes and material are the desert's until the biome's own are designed (only the Ether's, today); it has no mini-boss either, so its den holds an elite. */
  stub?: boolean;
}

const DESERT_FOES = { foes: ['snake'] as Enemy[], material: 'snake-skin' as PartKind, bosses: ['snake'] as Enemy[] };

export const KITS: Record<BiomeId, Kit> = {
  desert: {
    biome: 'desert',
    names: ['A played-out mine', 'The Brass Adit', 'An old cistern cut'],
    entrance: 'a mine lift head-frame over a shaft',
    verb: 'ride the lift down',
    sight: 'An old mine lift, still on its cable. Something down there rattles. Snakes, Communicator: brass ones. Their skins make fine plating, and whatever is rattling the loudest is sitting on something.',
    down: 'Down the shaft. No sky down there, so no clock either: the sands wait for you. Mind the rattle before the strike.',
    floor: [0.08, 0.04],
    ambient: 0x3a3440,
    ...DESERT_FOES,
    hazard: { name: 'Steam vents', zones: 4, radius: 1.5, period: 5, warn: 1.2, burst: 0.6, dmg: 14, status: 'scalded', color: 0xe8e4dc, line: 'Old boiler vents in this one. They hiss before they blow: watch the floor.' },
    props: { entry: ['lamp-post'], hall: ['rail-cart', 'timber-prop'], ambush: ['ore-heap', 'timber-prop'], side: ['crate-stack', 'oil-drum'], trap: ['steam-vent'], lever: ['lever-box'], den: ['snake-nest', 'bone-heap'] },
    built: true,
  },
  jungle: {
    biome: 'jungle',
    names: ['The Swan Tunnel', 'A flooded ride', 'The Dark Boat Run'],
    entrance: "a swan-boat on its rail, into the tunnel's dark mouth",
    verb: 'ride the boat in',
    sight: 'A swan-boat on its rail, nosing into a dark tunnel: the Tunnel of Love. Something splashes in there, and something sings. Piranhas in the channel, love-bots in the air: their arrows turn your robots\' heads. The feathers they drop are good copper.',
    down: 'Into the tunnel. The park still thinks it has guests. A robot struck by a heart runs off to its sweetheart: shoot the love-bot and it comes to its senses.',
    floor: [0.02, 0.2],
    ambient: 0x243430,
    foes: ['piranha', 'cupid'],
    material: 'swan-feather',
    bosses: ['croc'],
    hazard: { name: 'The tide', zones: 3, radius: 2, period: 6, warn: 1.4, burst: 0.8, dmg: 10, status: 'wet', color: 0x7fc4d8, line: 'The ride still runs its tide: a surge comes down the channel on a timer.' },
    props: { hall: ['swan-boat', 'ticket-booth'], ambush: ['animatronic-palm'], side: ['souvenir-stall'], trap: ['sluice-gate'], lever: ['ride-lever'], den: ['captain-chair'] },
    built: true,
  },
  city: {
    biome: 'city',
    names: ['The Galleria', 'An underground mall', 'The Metro Concourse'],
    entrance: 'escalators going down, still running',
    verb: 'take the escalator down',
    sight: 'Escalators going down, still running. Heresy with a handrail. A whole mall down there: carts that charge, drones that blow whistles, and mannequins. Keep your eyes on the mannequins. The price tags are chips, and the engineers love a bargain.',
    down: 'Down the escalators. The mall is open late, forever. The mannequins move only while you look away: aim at them and they stand still.',
    floor: [0.06, 0.02],
    ambient: 0x2c3038,
    foes: ['mannequin', 'cart', 'copdrone'],
    material: 'price-tag',
    bosses: ['mallcop'],
    hazard: { name: 'Live conduits', zones: 4, radius: 1.4, period: 4.5, warn: 1, burst: 0.5, dmg: 12, status: 'shocked', color: 0x9fd8ff, line: 'The mall wiring is still live and rotten: conduits arc on a timer.' },
    props: { hall: ['mannequin', 'shopping-cart'], ambush: ['display-case'], side: ['vending-machine'], trap: ['sparking-conduit'], lever: ['shutter-switch'], den: ['atrium-fountain'] },
    built: true,
  },
  demon: {
    biome: 'demon',
    names: ['The Blood Cistern', 'A flooded crypt', 'The Moat Stair'],
    entrance: 'a spiral stair under a grate',
    verb: 'go down the stair',
    sight: 'A spiral stair under a grate: the Blood Cistern. It smells of old oil and older blood. Leech drones down there, and something that swims in the walls. Leech mouths, Communicator: put one on a glove and it feeds you instead.',
    down: 'Down the stair, under the moat. Mind the walls: they are not all wall. A leech that latches on drinks your oil; a kick bursts it.',
    floor: [0.05, 0.08],
    ambient: 0x3a2028,
    foes: ['leech', 'veinworm'],
    material: 'leech-mouth',
    bosses: ['bishop'],
    hazard: { name: 'Blood-oil jets', zones: 4, radius: 1.5, period: 4.5, warn: 1, burst: 0.6, dmg: 14, status: 'scalded', color: 0xd04040, line: 'Blood-oil jets in the floor, on a pump timer. Watch them swell before they spray.' },
    props: { hall: ['pew', 'iron-candelabra'], ambush: ['sarcophagus'], side: ['reliquary'], trap: ['oil-jet'], lever: ['pump-handle'], den: ['pump-organ'] },
    built: true,
  },
  mountains: {
    biome: 'mountains',
    names: ['The Glacier Hangar', 'An ice-bound depot', 'The Frozen Cut'],
    entrance: 'a freight elevator in the ice wall',
    verb: 'ride the freight lift',
    sight: 'A freight elevator in the ice wall: a military hangar under the glacier. The cold keeps whatever is down there fresh. Frost mites, and drills under the floor. Their shells are warmer than they look, worn the right way.',
    down: 'Down the freight lift, into the ice. Do not stand still: when the floor cracks under you, a driller is coming up.',
    floor: [0.04, 0.16],
    ambient: 0x2a3444,
    foes: ['mite', 'driller'],
    material: 'frost-carapace',
    bosses: ['snowcat'],
    hazard: { name: 'Cold air', zones: 3, radius: 2, period: 5.5, warn: 1.4, burst: 0.8, dmg: 10, status: 'chilled', color: 0xbfe4ff, line: 'Cold air vents in the hangar on a timer. They frost the floor first.' },
    props: { hall: ['pallet-stack', 'frozen-truck'], ambush: ['ice-pillar'], side: ['supply-locker'], trap: ['cold-vent'], lever: ['hangar-switch'], den: ['snowcat-bay'] },
    built: true,
  },
  ether: {
    biome: 'ether',
    names: ['The Hollow Under'],
    entrance: 'a seam in the Ether',
    verb: 'step through',
    sight: 'A seam in the Ether.',
    down: 'Down through the seam.',
    floor: [0.02, 0.02],
    ambient: 0x1c1830,
    ...DESERT_FOES,
    bosses: [],
    hazard: { name: 'Cold drafts', zones: 3, radius: 2, period: 5, warn: 1.2, burst: 0.7, dmg: 10, status: 'chilled', color: 0xb0a8ff, line: 'Drafts from nowhere, on a timer.' },
    props: {},
    built: false,
    stub: true,
  },
};

/** A quest dungeon: it takes a land's entrance while its quest is active (`Sim.entrance.handcrafted`). Authored, so no twist, and its own foes. */
export interface HandcraftedDef {
  id: string;
  biome: BiomeId;
  name: string;
  sight: string;
  down: string;
  foes: Enemy[];
  material: PartKind;
  boss: Enemy;
  /** Rooms between the way in and the den; foes per room; side rooms (each holds a can). */
  rooms: [number, number];
  perRoom: [number, number];
  cans: number;
}
export const HANDCRAFTED: Record<string, HandcraftedDef> = {
  // The desert's first dungeon, as it was built before the kits; Hob's line (quests.md) goes down it for the fang.
  sidewinder: {
    id: 'sidewinder',
    biome: 'desert',
    name: 'The Sidewinder Shaft',
    sight: KITS.desert.sight,
    down: KITS.desert.down,
    foes: ['snake'],
    material: 'snake-skin',
    boss: 'snake',
    rooms: [5, 6],
    perRoom: [2, 4],
    cans: 2,
  },
};

/**
 * The way up from the den (Minos, 2026-10-18): once the boss falls the den's east wall cracks; `blows` hits (a kick, a swing, a
 * shot: one each) break it, and the niche behind it is a lift (E, then E) that carries the whole party. `blows` is a guess.
 */
export const EXIT = { blows: 4, w: 2, h: 5 };

/**
 * The party below: every robot fielded rides down with him (Laimonas, D16). Rooms and corridors are sized so a crew fits;
 * `foes` more foes per room for each robot that came.
 */
export const PARTY = { corridor: 5, room: [[10, 14], [8, 11]] as [[number, number], [number, number]], den: [18, 14] as [number, number], foes: 0.34 };

// ---------------------------------------------------------------- the spec

/** One entrance's dungeon: how deep (the landing's threat tier), its rolled twist (none for a handcrafted one) and the quest dungeon that took it. */
export interface DungeonSpec { tier: Tier; twist: Twist | null; handcrafted: string | null }

export const clampTier = (n: number): Tier => (n >= 3 ? 3 : n <= 1 ? 1 : 2);

/** The twist an entrance rolls: the seed's, whatever the tier. */
export const rollTwist = (seed: number | string, biome: BiomeId): Twist => rng(`dungeon-twist/${biome}/${seed}`).pick(TWIST_IDS);

/**
 * An entrance's spec. `over`: what the landing (`tier`), the quest system (`handcrafted`) or the dev commands (`twist`,
 * `null` for none) set; the rest is rolled from the seed. A handcrafted id for another biome is ignored.
 */
export function specFor(seed: number | string, biome: BiomeId, over: Partial<DungeonSpec> = {}): DungeonSpec {
  const handcrafted = over.handcrafted && HANDCRAFTED[over.handcrafted]?.biome === biome ? over.handcrafted : null;
  return { tier: clampTier(over.tier ?? 1), handcrafted, twist: handcrafted ? null : over.twist !== undefined ? over.twist : rollTwist(seed, biome) };
}

/** What a run below is, resolved from its kit (or its handcrafted dungeon) and its spec. */
export interface DungeonDef {
  name: string;
  /** The name with its twist, as the entrance shows it. */
  title: string;
  sight: string;
  down: string;
  verb: string;
  foes: Enemy[];
  material: PartKind;
  /** The den's designed mini-boss, or null when the kit has none (then `elite` stands in). */
  boss: Enemy | null;
  /** The fallback mini-boss: a biome elite with two traits. */
  elite: DenElite | null;
  kit: Kit;
  spec: DungeonSpec;
}

/** The den's stand-in for a mini-boss: a biome elite of `kind` with two `traits`, at an elite's oil (2x, like any elite: Minos on D24). */
export interface DenElite { kind: Enemy; traits: TraitId[] }
export const DEN_ELITE = { /** Extra copies of the kit's material it drops (its two trait parts come with it). */ material: 2 };

/**
 * A kit with no designed mini-boss (`Kit.bosses` empty) fields a biome elite with two traits in its den: a kind from the kit's
 * foes or the biome's own that has at least two (`TRAITS_OF`), the traits rolled from the seed. It drops both trait parts, the
 * kit's material and the den's insight. Hornets, which every biome's mix can field, are the last resort.
 */
export function fallbackBoss(seed: number | string, biome: BiomeId, kit: Kit): DenElite {
  const r = rng(`dungeon-boss/${biome}/${seed}`);
  const kinds = [...kit.foes, ...BIOMES[biome].foes.map(([k]) => k)].filter((k, i, all) => all.indexOf(k) === i && (TRAITS_OF[k]?.length ?? 0) >= 2);
  const kind = kinds.length ? r.pick(kinds) : 'hornet';
  return { kind, traits: r.shuffle(TRAITS_OF[kind]!).slice(0, 2) };
}

export function dungeonDef(seed: number | string, biome: BiomeId, over: Partial<DungeonSpec> = {}): DungeonDef {
  const spec = specFor(seed, biome, over);
  const kit = KITS[biome] ?? KITS.desert;
  const hand = spec.handcrafted ? HANDCRAFTED[spec.handcrafted] : null;
  const name = hand ? hand.name : rng(`dungeon-name/${biome}/${seed}`).pick(kit.names);
  const tw = spec.twist ? TWISTS[spec.twist] : null;
  const sight = hand ? hand.sight : `${kit.sight} ${tw ? `${tw.name}: ${tw.sight} ` : ''}A ${TIER_NAMES[spec.tier]} one.`;
  return {
    name,
    title: tw ? `${name}: ${tw.name}` : name,
    sight,
    down: hand ? hand.down : `${kit.down}${tw ? ` ${tw.down}` : ''}`,
    verb: kit.verb,
    foes: hand ? hand.foes : kit.foes,
    material: hand ? hand.material : kit.material,
    boss: hand ? hand.boss : kit.bosses.length ? rng(`dungeon-boss/${biome}/${seed}`).pick(kit.bosses) : null,
    elite: hand || kit.bosses.length ? null : fallbackBoss(seed, biome, kit),
    kit,
    spec,
  };
}

// ---------------------------------------------------------------- generation

export interface Room { x: number; y: number; w: number; h: number; cx: number; cy: number; kind: RoomKind }
export interface Prop { id: string; room: number; x: number; y: number }
export interface Dungeon {
  /** The dungeon as the Sim runs it: a lever's gate is rock until it is pulled. */
  map: MapData;
  /** The same map with the gate and the exit's niche open, for the ground painter (the closed gate and the wall are drawn over it). */
  paintMap: MapData;
  rooms: Room[];
  /** The chain's rooms in walking order (way in first, den last); `rooms` holds them then the side rooms. */
  chain: Room[];
  entry: Room;
  den: Room;
  spec: DungeonSpec;
  def: DungeonDef;
  /** The lever (a tile in the lever room) and the gate it opens: the shortcut back from the den. Both null without a lever room. */
  lever: Spot | null;
  gate: { x: number; y: number; w: number; h: number } | null;
  /** The den's cracked wall (tiles): a plug in its east wall, rock to the Sim until it is broken, with a niche behind it (the way up, `EXIT`). Every dungeon has one. */
  exit: { x: number; y: number; w: number; h: number };
  /** The trap room's index in `rooms` and its hazard zones (tile centres); none without a trap room. */
  trap: { room: number; zones: Spot[] } | null;
  props: Prop[];
}

/** The chain's room kinds in order, from the tier: way in, the middle rooms (an ambush at least once; a trap or lever room from tier II), the den. */
function planKinds(r: Rng, n: number, spec: DungeonSpec): { kinds: RoomKind[]; special: 'trap' | 'lever' | null } {
  const mids = n - 2;
  if (spec.handcrafted) return { kinds: ['entry', ...Array<RoomKind>(mids).fill('hall'), 'den'], special: null };
  const special = TIERS[spec.tier].special ? r.pick(['trap', 'lever'] as const) : null;
  const plain = r.shuffle(Array.from({ length: mids - (special ? 1 : 0) }, (_, i): RoomKind => (i % 2 === 1 ? 'ambush' : 'hall')));
  if (special) plain.splice(Math.floor(plain.length / 2), 0, special);
  return { kinds: ['entry', ...plain, 'den'], special };
}

/**
 * A dungeon's rooms: a winding chain from the way in (the first room, where the lift lands) to the den (the last and
 * biggest), joined by corridors `PARTY.corridor` tiles wide, with side rooms hanging off. Rock everywhere else. The floor
 * is mostly hardpan with patches of sand and dune, so the ground painter has something to draw. `over` is the entrance's
 * spec (see `specFor`); without it, tier 1 and the seed's twist.
 */
export function generateDungeon(seed: number | string, biome: BiomeId, over: Partial<DungeonSpec> = {}): Dungeon {
  const def = dungeonDef(seed, biome, over);
  for (let attempt = 0; attempt < 60; attempt++) {
    const d = attemptDungeon(seed, biome, def, attempt);
    if (d) return d;
  }
  throw new Error(`no dungeon fits for ${biome}/${seed}`);
}

function attemptDungeon(seed: number | string, biome: BiomeId, def: DungeonDef, attempt: number): Dungeon | null {
  const { spec, kit } = def;
  const hand = spec.handcrafted ? HANDCRAFTED[spec.handcrafted] : null;
  const r = rng(`dungeon/${biome}/${seed}/${spec.handcrafted ?? spec.tier}/${spec.twist === 'hoard' ? 'h' : ''}/${attempt}`);
  const n = hand ? r.int(hand.rooms[0], hand.rooms[1]) + 2 : TIERS[spec.tier].rooms;
  const sideN = hand ? hand.cans : Math.max(TIERS[spec.tier].sides, spec.twist === 'hoard' ? HOARD.sides : 0);
  const { kinds, special } = planKinds(r, n, spec);
  const w = 24 + 14 * n, h = 64;
  const ter = new Uint8Array(w * h).fill(Ter.Rock);
  const set = (x: number, y: number, t: number) => {
    if (x > 1 && y > 1 && x < w - 2 && y < h - 2) ter[y * w + x] = t;
  };
  const floor = (x: number, y: number) => set(x, y, r.chance(kit.floor[0]) ? Ter.Sand : r.chance(kit.floor[1]) ? Ter.Dune : Ter.Hardpan);
  const rooms: Room[] = [];
  const overlaps = (a: Room) => rooms.some((b) => a.x - 3 < b.x + b.w && a.x + a.w + 3 > b.x && a.y - 3 < b.y + b.h && a.y + a.h + 3 > b.y);
  const room = (x: number, y: number, rw: number, rh: number, kind: RoomKind): Room => ({ x, y, w: rw, h: rh, cx: Math.floor(x + rw / 2), cy: Math.floor(y + rh / 2), kind });
  // The chain walks left to right across the map, wandering up and down.
  let y = r.int(8, h - 18);
  for (let i = 0; i < n; i++) {
    const den = i === n - 1;
    const rw = den ? PARTY.den[0] : r.int(...PARTY.room[0]), rh = den ? PARTY.den[1] : r.int(...PARTY.room[1]);
    const x = Math.round(3 + (i / (n - 1)) * (w - rw - 7));
    let rm: Room | null = null;
    for (let tries = 0; tries < 30 && !rm; tries++) {
      const cand = room(x, Math.max(3, Math.min(h - rh - 4, y + r.int(-12, 12))), rw, rh, kinds[i]);
      if (!overlaps(cand)) rm = cand;
    }
    if (!rm) return null;
    rooms.push(rm);
    y = rm.y;
  }
  const chain = rooms.slice();
  // Side rooms: up or down from a middle room, a dead end (a can in it; a hoard's caches).
  const sideParents: Room[] = [];
  for (let k = 0; k < sideN; k++) {
    let placed: Room | null = null, parent: Room | null = null;
    for (let j = 0; j < n - 2 && !placed; j++) {
      const from = chain[1 + ((k + j) % (n - 2))];
      for (const up of from.cy > h / 2 ? [true, false] : [false, true]) {
        const rm = room(from.cx - 3, up ? from.y - 11 : from.y + from.h + 5, 6, 5, 'side');
        if (rm.y < 3 || rm.y + rm.h > h - 3 || overlaps(rm)) continue;
        placed = rm;
        parent = from;
        break;
      }
    }
    if (!placed || !parent) return null;
    rooms.push(placed);
    sideParents.push(parent);
  }
  for (const rm of rooms) for (let yy = rm.y; yy < rm.y + rm.h; yy++) for (let xx = rm.x; xx < rm.x + rm.w; xx++) floor(xx, yy);
  // Corridors: legs between centres, `PARTY.corridor` wide, along the chain, and from each side room to its parent.
  const k2 = PARTY.corridor >> 1;
  type Step = { x: number; y: number; horiz: boolean };
  const carve = (pts: Spot[]): Step[] => {
    const steps: Step[] = [];
    for (let p = 1; p < pts.length; p++) {
      const a = pts[p - 1], b = pts[p];
      const len = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      for (let s = 0; s <= len; s++) steps.push({ x: a.x + Math.sign(b.x - a.x) * s, y: a.y + Math.sign(b.y - a.y) * s, horiz: a.y === b.y });
    }
    for (const s of steps) for (let dy = -k2; dy <= k2; dy++) for (let dx = -k2; dx <= k2; dx++) floor(s.x + dx, s.y + dy);
    return steps;
  };
  const link = (a: Room, b: Room) => {
    const horizFirst = r.chance(0.5);
    carve([{ x: a.cx, y: a.cy }, horizFirst ? { x: b.cx, y: a.cy } : { x: a.cx, y: b.cy }, { x: b.cx, y: b.cy }]);
  };
  for (let i = 1; i < chain.length; i++) link(chain[i - 1], chain[i]);
  rooms.slice(n).forEach((s, i) => link(s, sideParents[i]));
  const entry = chain[0], den = chain[n - 1];
  const open = ter.slice();

  // The lever room's shortcut: a tunnel from the den back to the way in (straight, or along the map's edge), with a gate across it.
  let gate: Dungeon['gate'] = null, lever: Spot | null = null;
  if (special === 'lever') {
    const routes: Spot[][] = [
      [{ x: den.cx, y: den.cy }, { x: entry.cx, y: den.cy }, { x: entry.cx, y: entry.cy }],
      [{ x: den.cx, y: den.cy }, { x: den.cx, y: entry.cy }, { x: entry.cx, y: entry.cy }],
      [{ x: den.cx, y: den.cy }, { x: den.cx, y: 4 }, { x: entry.cx, y: 4 }, { x: entry.cx, y: entry.cy }],
      [{ x: den.cx, y: den.cy }, { x: den.cx, y: h - 5 }, { x: entry.cx, y: h - 5 }, { x: entry.cx, y: entry.cy }],
    ];
    const dist = (t: Uint8Array) => flowField({ w, h, ter: t }, entry.cx, entry.cy)[den.cy * w + den.cx];
    for (const route of r.shuffle(routes)) {
      const before = ter.slice();
      const steps = carve(route);
      const fresh = (x: number, y: number) => x > 1 && y > 1 && x < w - 2 && y < h - 2 && before[y * w + x] === Ter.Rock;
      // A gate is a 2-deep slab across the tunnel, set where the tunnel is all its own (fresh rock all the way across), nearest its middle.
      let best: Dungeon['gate'] = null, bestD = Infinity;
      for (let i = 0; i < steps.length - 1; i++) {
        const a = steps[i], b = steps[i + 1];
        if (a.horiz !== b.horiz) continue;
        const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
        const slab = a.horiz ? { x: x0, y: a.y - k2, w: 2, h: PARTY.corridor } : { x: a.x - k2, y: y0, w: PARTY.corridor, h: 2 };
        let ok = true;
        for (let yy = slab.y - (a.horiz ? 0 : 1); yy < slab.y + slab.h + (a.horiz ? 0 : 1) && ok; yy++) for (let xx = slab.x - (a.horiz ? 1 : 0); xx < slab.x + slab.w + (a.horiz ? 1 : 0) && ok; xx++) if (!fresh(xx, yy)) ok = false;
        const dd = Math.abs(i - steps.length / 2);
        if (ok && dd < bestD) {
          bestD = dd;
          best = slab;
        }
      }
      if (best) {
        const opened = ter.slice();
        for (let yy = best.y; yy < best.y + best.h; yy++) for (let xx = best.x; xx < best.x + best.w; xx++) ter[yy * w + xx] = Ter.Rock;
        // The gate must matter: opening it has to cut the way from the den to the way in.
        if (dist(opened) <= dist(ter) * 0.8) {
          gate = best;
          open.set(opened);
          break;
        }
      }
      ter.set(before); // this route does not pay: back to the chain alone
    }
    if (!gate) return null;
    const lr = rooms.find((rm) => rm.kind === 'lever')!;
    lever = { x: lr.x + 1, y: lr.y + 1 };
  }

  // The trap room's hazard zones, spread out.
  let trap: Dungeon['trap'] = null;
  const ti = rooms.findIndex((rm) => rm.kind === 'trap');
  if (ti >= 0) {
    const rm = rooms[ti], zones: Spot[] = [{ x: rm.cx, y: rm.cy }];
    for (let tries = 0; tries < 80 && zones.length < kit.hazard.zones; tries++) {
      const z = { x: r.int(rm.x + 1, rm.x + rm.w - 2), y: r.int(rm.y + 1, rm.y + rm.h - 2) };
      if (zones.every((o) => Math.hypot(o.x - z.x, o.y - z.y) >= 3)) zones.push(z);
    }
    trap = { room: ti, zones };
  }
  // Props: ids from the kit, placed as data (P39 draws them).
  const props: Prop[] = [];
  const pr = r.fork('props');
  rooms.forEach((rm, i) => {
    const ids = kit.props[rm.kind];
    if (!ids?.length) return;
    for (let j = pr.int(1, 2); j > 0; j--) props.push({ id: pr.pick(ids), room: i, x: pr.int(rm.x + 1, rm.x + rm.w - 2), y: pr.int(rm.y + 1, rm.y + rm.h - 2) });
  });
  const tag = `${spec.handcrafted ?? `t${spec.tier}`}${spec.twist === 'hoard' ? 'h' : ''}${attempt}`;
  // The den's way up: a plug in its east wall, a niche behind it. The Sim sees rock; the painter sees floor under the drawn wall.
  const exit = { x: den.x + den.w, y: den.cy - (EXIT.h >> 1), w: EXIT.w, h: EXIT.h };
  if (exit.x + exit.w > w - 2 || exit.y < 2 || exit.y + exit.h > h - 2) return null;
  for (let yy = exit.y; yy < exit.y + exit.h; yy++) for (let xx = exit.x; xx < exit.x + exit.w; xx++) open[yy * w + xx] = Ter.Hardpan;
  const map: MapData = { w, h, seed: `dungeon:${seed}:${tag}`, biome, ter, lift: { x: entry.cx, y: entry.cy }, seeps: [], nests: [], ruins: [], places: [] };
  return { map, paintMap: { ...map, ter: open }, rooms, chain, entry, den, spec, def, lever, gate, exit, trap, props };
}

/** The room a point (px) is in, or null (a corridor). */
export function roomAt(d: Dungeon, x: number, y: number): Room | null {
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  return d.rooms.find((rm) => tx >= rm.x && tx < rm.x + rm.w && ty >= rm.y && ty < rm.y + rm.h) ?? null;
}

/** A foe standing in a room, an ambush's wave waiting in one, and loot lying in the side rooms. */
export interface Spawns {
  foes: (Spot & { elite: boolean; kind: Enemy })[];
  /** Ambush waves, by index into `Dungeon.rooms`: they spawn when the Communicator reaches the room's middle. */
  ambush: { room: number; foes: (Spot & { kind: Enemy })[] }[];
  /** Cans of oil in the side rooms (`loot` holds them too). */
  cans: Spot[];
  loot: (Spot & { kind: LootKind })[];
  boss: Spot;
}

/**
 * Who stands where (tiles): the foes in the rooms between the way in and the den, the ambush waves, what lies in the side
 * rooms, the boss's den. `party`: robots that came down with him; each adds `PARTY.foes` foes to a room (from their own
 * stream, so the lone run's foes stand where they did). A Hoard doubles the foes.
 */
export function dungeonSpawns(d: Dungeon, seed: number | string, party = 0): Spawns {
  const { spec, def } = d;
  const hand = spec.handcrafted ? HANDCRAFTED[spec.handcrafted] : null;
  const per = hand ? hand.perRoom : TIERS[spec.tier].foes;
  const mul = spec.twist === 'hoard' ? HOARD.foes : 1;
  const r = rng(`dungeon-spawns/${d.map.biome}/${seed}/${spec.handcrafted ?? spec.tier}`);
  const inside = (rm: Room) => ({ x: r.int(rm.x + 1, rm.x + rm.w - 2), y: r.int(rm.y + 1, rm.y + rm.h - 2) });
  const walkers = d.chain.filter((rm) => rm.kind !== 'entry' && rm.kind !== 'den');
  const foes: Spawns['foes'] = [];
  const ambush: Spawns['ambush'] = [];
  walkers.forEach((rm, i) => {
    const late = walkers.length > 2 && i >= walkers.length - 2 ? 1 : 0;
    if (rm.kind === 'ambush') {
      const k = r.int(...TIERS[spec.tier].ambush) * mul;
      // The wave waits at the sides of the room, not in the middle.
      ambush.push({ room: d.rooms.indexOf(rm), foes: Array.from({ length: k }, () => ({ ...inside(rm), kind: r.pick(def.foes) })) });
      return;
    }
    const base = r.int(per[0], per[1]) + late;
    const k = Math.ceil((rm.kind === 'trap' ? Math.max(1, base - 1) : base) * mul);
    for (let j = 0; j < k; j++) foes.push({ ...inside(rm), kind: r.pick(def.foes), elite: i > 0 && j === 0 && r.chance(0.4) });
  });
  const pr = rng(`dungeon-party/${d.map.biome}/${seed}`);
  for (const rm of walkers) if (rm.kind !== 'ambush') for (let j = Math.floor(party * PARTY.foes + pr.next()); j > 0; j--) foes.push({ x: pr.int(rm.x + 1, rm.x + rm.w - 2), y: pr.int(rm.y + 1, rm.y + rm.h - 2), kind: pr.pick(def.foes), elite: false });
  // The side rooms: the first holds a can (a dungeon's authored oil, with its mini-boss's); the second room and a Hoard's rooms hold a cache of scrap and the kit's material instead.
  const sides = d.rooms.filter((rm) => rm.kind === 'side');
  const loot: Spawns['loot'] = [];
  sides.forEach((s, i) => {
    if (i === 0) loot.push({ x: s.cx, y: s.cy, kind: 'oil' });
    if (hand) return;
    if (i > 0 || spec.twist === 'hoard') {
      loot.push({ x: s.cx - 1, y: s.cy, kind: 'scrap' });
      loot.push({ x: s.cx + 1, y: s.cy, kind: 'part' });
    }
  });
  return { foes, ambush, cans: loot.filter((l) => l.kind === 'oil'), loot, boss: { x: d.den.cx + 2, y: d.den.cy } };
}

/** Tiles each tile is from `goal` by walking (Infinity: not reachable): the flow field ground foes follow round corners. */
export function flowField(map: { w: number; h: number; ter: Uint8Array }, gx: number, gy: number): Float32Array {
  const { w, h, ter } = map;
  const dist = new Float32Array(w * h).fill(Infinity);
  if (gx < 0 || gy < 0 || gx >= w || gy >= h) return dist;
  const q = new Int32Array(w * h);
  let head = 0, tail = 0;
  dist[gy * w + gx] = 0;
  q[tail++] = gy * w + gx;
  while (head < tail) {
    const i = q[head++];
    const x = i % w, y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (ter[j] === Ter.Rock || dist[j] !== Infinity) continue;
      dist[j] = dist[i] + 1;
      q[tail++] = j;
    }
  }
  return dist;
}

// ---------------------------------------------------------------- rewards

/**
 * A dungeon's haul on the way up. A part that makes a weapon (`PARTS[...].item`) becomes the weapon the first time; once
 * the weapon is owned (`owns`) the part stays a part, which is its copy recipe's ingredient at the workbench (gear.ts).
 */
export function settleReward(parts: Partial<Record<PartKind, number>>, owns: (item: string) => boolean): { items: string[]; parts: Partial<Record<PartKind, number>> } {
  const items: string[] = [], out: Partial<Record<PartKind, number>> = {};
  for (const [k, n] of Object.entries(parts) as [PartKind, number][]) {
    if (!n) continue;
    const item = PARTS[k].item;
    if (!item || owns(item) || items.includes(item)) out[k] = (out[k] ?? 0) + n;
    else {
      items.push(item);
      if (n > 1) out[k] = n - 1;
    }
  }
  return { items, parts: out };
}

// ---------------------------------------------------------------- the trap's timer

/** Where a hazard is in its cycle at `t` seconds: idle, the telegraph (`warn`) or the burst. */
export function trapPhase(h: Hazard, t: number): 'idle' | 'warn' | 'burst' {
  const c = ((t % h.period) + h.period) % h.period;
  return c < h.period - h.warn - h.burst ? 'idle' : c < h.period - h.burst ? 'warn' : 'burst';
}

// ---------------------------------------------------------------- the run

/** What the dungeon's rules tell the scene. */
export type DungeonEvent = { e: 'dungeon'; what: 'ambush' | 'trapWarn' | 'trapBurst' | 'lever' | 'denEnter' | 'echo' | 'insight' | 'cracked' | 'wallHit' | 'wallBreak'; x?: number; y?: number; room?: number; /** Blows on the wall so far. */ blows?: number; /** The foes an echo reached. */ heard?: Hornet[] };

/**
 * A dungeon's rules while it runs (the Sim holds one down a dungeon: `Sim.run`). It spawns the dungeon's people
 * (`populate`) and steps what the rooms do: ambush waves, the trap room's timer, the lever's gate, Echoing's noise, the
 * insight when the mini-boss falls. Pure rules; Play draws them (`dungeonview.ts`).
 */
export class DungeonRun {
  readonly spec: DungeonSpec;
  readonly twist: Twist | null;
  /** Everyone is Wet (Flooded): the Sim applies the Wet status to every robot and enemy (so Shock hits are doubled by the engine, `STATUSES.wet`). */
  readonly wet: boolean;
  lever: 'shut' | 'open' | null;
  /** The Communicator has stepped into the den. */
  denSeen = false;
  /** The mini-boss fell, and the insight is paid. */
  cleared = false;
  /** The den's wall: plain until the boss falls, then cracked, then open after `EXIT.blows` hits. */
  wall: 'plain' | 'cracked' | 'open' = 'plain';
  blows = 0;
  insight = 0;
  trapT: number;
  private trapWas: 'idle' | 'warn' | 'burst' = 'idle';
  private waves = new Map<number, { room: number; foes: (Spot & { kind: Enemy })[] }>();
  /** When Echoing last carried a noise (the dungeon's clock), and how many it has. */
  private echoAt = -Infinity;
  echoes = 0;
  private clock = 0;
  private prevUse = false;

  constructor(readonly sim: Sim, readonly d: Dungeon) {
    this.spec = d.spec;
    this.twist = d.spec.twist;
    this.wet = d.spec.twist === 'flooded';
    this.lever = d.lever ? 'shut' : null;
    // Each trap room starts at its own point in the cycle, so two dungeons do not breathe together.
    this.trapT = d.trap ? rng(`dungeon-trap/${d.map.seed}`).range(0, d.def.kit.hazard.period) : 0;
  }

  /** The map the ground is painted from (the gate open: the closed gate is a drawn door). */
  get paintMap() {
    return this.d.paintMap;
  }

  get hazard() {
    return this.d.def.kit.hazard;
  }

  /** Make the dungeon's people: foes in the rooms, the waves waiting, cans and caches, the mini-boss in its den. Returns the mini-boss. */
  populate(seed: number | string, party: number): Hornet {
    const { sim, d } = this;
    const sp = dungeonSpawns(d, seed, party);
    for (const f of sp.foes) sim.spawnHornet((f.x + 0.5) * T, (f.y + 0.5) * T, 0, f.elite, false, f.kind);
    for (const w of sp.ambush) this.waves.set(w.room, w);
    for (const l of sp.loot) {
      const it = sim.restLoot((l.x + 0.5) * T, (l.y + 0.5) * T, l.kind);
      if (l.kind === 'part') it.part = d.def.material;
    }
    const at = { x: (sp.boss.x + 0.5) * T, y: (sp.boss.y + 0.5) * T - 30 };
    if (d.def.boss) return sim.spawnBoss(d.def.boss, at);
    // No designed mini-boss: an elite with two traits holds the den, at an elite's health like any other.
    const e = d.def.elite!;
    return sim.spawnHornet(at.x, at.y, 0, true, false, e.kind, { tier: d.def.spec.tier, traits: e.traits });
  }

  /** Is the trap firing, warning or idle? */
  trapState(): 'idle' | 'warn' | 'burst' | null {
    return this.d.trap ? trapPhase(this.hazard, this.trapT) : null;
  }

  /** The room the Communicator stands in. */
  where(): Room | null {
    const c = this.sim.controller;
    return roomAt(this.d, c.x, c.y);
  }

  private emit(e: Omit<DungeonEvent, 'e'>) {
    this.sim.events.push({ e: 'dungeon', ...e } as DungeonEvent);
  }

  step(dt: number, input: Input) {
    const { sim, d } = this;
    const c = sim.controller;
    const here = this.where();
    this.clock += dt;
    if (here === d.den && !this.denSeen) {
      this.denSeen = true;
      this.emit({ what: 'denEnter' });
    }
    // Ambush waves wake when the Communicator reaches the room's middle.
    for (const [i, w] of this.waves) {
      const rm = d.rooms[i];
      if (Math.hypot(c.x - (rm.cx + 0.5) * T, c.y - (rm.cy + 0.5) * T) > AMBUSH.reach * T) continue;
      this.waves.delete(i);
      for (const f of w.foes) sim.spawnHornet((f.x + 0.5) * T, (f.y + 0.5) * T, 0, false, false, f.kind);
      this.emit({ what: 'ambush', room: i, x: (rm.cx + 0.5) * T, y: (rm.cy + 0.5) * T });
      sim.say(`ambush-${i}`, 'They were in the walls. Back to back, Communicator!', 'warn');
    }
    if (this.lever === 'shut' && here?.kind === 'lever') sim.say('lever-sight', 'A lever on the wall. Throw it ({use}, beside it) and something far off will give: a way back to the lift, for later.', 'calm');
    // The lever: a press of Use beside it opens the gate across the shortcut back.
    if (this.lever === 'shut' && d.lever && input.use && !this.prevUse && Math.hypot(c.x - (d.lever.x + 0.5) * T, c.y - (d.lever.y + 0.5) * T) < LEVER.reach * T) this.pull();
    this.prevUse = input.use;
    // The trap room's hazard: a telegraph, then a burst that hurts every robot inside a zone, once.
    if (d.trap) {
      this.trapT += dt;
      const ph = trapPhase(this.hazard, this.trapT);
      if (ph !== this.trapWas) {
        if (ph === 'warn') this.emit({ what: 'trapWarn', room: d.trap.room });
        if (ph === 'burst') this.burst();
        this.trapWas = ph;
      }
      if (ph === 'warn' && here === d.rooms[d.trap.room]) sim.say('trap-sight', this.hazard.line, 'warn');
    }
    // The mini-boss falls: an insight, and the den is cleared.
    const b = sim.denBoss;
    if (b?.dead && !this.cleared) {
      this.cleared = true;
      this.insight = 1;
      sim.addInsight(1);
      if (!b.boss) for (let i = 0; i < DEN_ELITE.material; i++) sim.drop(b.x + (i - 0.5) * 20, b.y + 8, 'part', this.d.def.material);
      this.emit({ what: 'insight', x: b.x, y: b.y });
      this.wall = 'cracked';
      const w = this.wallAt();
      this.emit({ what: 'cracked', x: w.x, y: w.y });
      sim.say('wall-cracked', "It fell, and the den's east wall split with it. Break that wall open and climb out there: no walk back, and the whole crew comes up with you.", 'calm');
    }
  }

  /** The cracked wall's centre (px), and its half size. */
  wallAt() {
    const e = this.d.exit;
    return { x: (e.x + e.w / 2) * T, y: (e.y + e.h / 2) * T, hw: (e.w * T) / 2, hh: (e.h * T) / 2 };
  }

  /** Is the way up open (the wall broken)? */
  get exitOpen() {
    return this.wall === 'open';
  }

  /** One blow on the cracked wall, if it is cracked: the tenth of a tile of leeway round it counts. Returns true if it landed. */
  blow(x: number, y: number, slack = 6): boolean {
    if (this.wall !== 'cracked') return false;
    const w = this.wallAt();
    if (Math.abs(x - w.x) > w.hw + slack || Math.abs(y - w.y) > w.hh + slack) return false;
    this.blows++;
    this.emit({ what: 'wallHit', x, y, blows: this.blows });
    if (this.blows >= EXIT.blows) this.breakWall();
    return true;
  }

  /** A swing or kick from (x, y) aimed at `a`: it lands if the wall is within reach and in the arc (or right on it). */
  swingWall(x: number, y: number, a: number, reach: number, arc: number): boolean {
    if (this.wall !== 'cracked') return false;
    const w = this.wallAt();
    const nx = Math.max(w.x - w.hw, Math.min(w.x + w.hw, x)), ny = Math.max(w.y - w.hh, Math.min(w.y + w.hh, y));
    const d = Math.hypot(nx - x, ny - y);
    if (d > reach) return false;
    let off = Math.abs(Math.atan2(ny - y, nx - x) - a) % (Math.PI * 2);
    if (off > Math.PI) off = Math.PI * 2 - off;
    return d < 6 || off <= arc / 2 ? this.blow(nx, ny, 8) : false;
  }

  /** The wall breaks (the last blow, or a dev command): its tiles are floor and the niche is the way up. */
  breakWall() {
    if (this.wall === 'open') return;
    const { sim, d } = this;
    this.wall = 'open';
    for (let yy = d.exit.y; yy < d.exit.y + d.exit.h; yy++) for (let xx = d.exit.x; xx < d.exit.x + d.exit.w; xx++) sim.map.ter[yy * sim.W + xx] = d.paintMap.ter[yy * sim.W + xx];
    const w = this.wallAt();
    this.emit({ what: 'wallBreak', x: w.x, y: w.y });
    sim.say('wall-open', 'Open. Stand in the gap and press {use}, twice: that is a lift, and everyone you brought rides it.', 'calm');
  }

  /** Open the lever's gate (the lever room's Use, or a dev command). */
  pull() {
    const { sim, d } = this;
    if (this.lever !== 'shut' || !d.gate) return;
    this.lever = 'open';
    for (let yy = d.gate.y; yy < d.gate.y + d.gate.h; yy++) for (let xx = d.gate.x; xx < d.gate.x + d.gate.w; xx++) sim.map.ter[yy * sim.W + xx] = d.paintMap.ter[yy * sim.W + xx];
    this.emit({ what: 'lever', x: (d.gate.x + d.gate.w / 2) * T, y: (d.gate.y + d.gate.h / 2) * T });
    sim.say('lever', 'Something heavy ground open, far off. That lever opened a way back to the lift. Remember it.', 'calm');
  }

  /** The trap fires: every robot inside a zone takes the hazard's damage. */
  private burst() {
    const { sim, d } = this;
    const H = this.hazard;
    this.emit({ what: 'trapBurst', room: d.trap!.room });
    const hit = [...sim.bots, ...sim.followers.map((f) => f.bot)];
    for (const b of hit) {
      if (b.dead) continue;
      if (d.trap!.zones.some((z) => Math.hypot(b.x - (z.x + 0.5) * T, b.y - (z.y + 0.5) * T) < H.radius * T)) {
        // The hazard's blow is of its status's type, and the status lands for sure (the tide only wets: plain damage).
        sim.hurt(b, H.dmg, false, { type: HAZARD_TYPE[H.status], via: 'hazard' });
        if (!b.dead) sim.engine.apply(b, H.status);
      }
    }
  }

  /**
   * Echoing: a noise at (x, y) fetches the foes that are not after anyone within `ECHO.reach` tiles of walking, who go to where it
   * was made (`Hornet.hear`, the flow field from there is shared). Other twists, and a noise within `ECHO.every` s of the last, do nothing.
   */
  hear(x: number, y: number) {
    const { sim, d } = this;
    if (this.twist !== 'echoing' || this.clock - this.echoAt < ECHO.every) return;
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= d.map.w || ty >= d.map.h) return;
    const field = flowField(sim.map, tx, ty);
    const heard: Hornet[] = [];
    for (const h of sim.hornets) {
      if (h.dead || h.boss || h.target || h.under) continue;
      if ((field[Math.floor(h.y / T) * d.map.w + Math.floor(h.x / T)] ?? Infinity) > ECHO.reach) continue;
      h.hear = { x, y, until: sim.time + ECHO.time, field };
      heard.push(h);
    }
    if (!heard.length) return;
    this.echoAt = this.clock;
    this.echoes++;
    this.emit({ what: 'echo', x, y, heard });
    sim.say('echo', 'Mind the echo, Communicator. Every shot and crash down here carries to the next room, and they come to see.', 'warn');
  }

  /** For `Sim.summary()` / `debugState()`. */
  summary() {
    const d = this.d;
    return {
      tier: this.spec.tier,
      twist: this.twist,
      handcrafted: this.spec.handcrafted,
      rooms: d.chain.map((r) => r.kind),
      sides: d.rooms.filter((r) => r.kind === 'side').length,
      at: this.where()?.kind ?? 'corridor',
      lever: this.lever,
      trap: this.trapState(),
      echoes: this.echoes,
      cleared: this.cleared,
      wall: this.wall,
      blows: this.blows,
      wet: this.wet,
    };
  }
}

/** The ambient light of a dungeon scene: the kit's, or near black when Dark. */
export const ambientOf = (def: { kit: Kit; spec: DungeonSpec }) => (def.spec.twist === 'dark' ? DARK.ambient : def.kit.ambient);

/** Does this part drop from a kit's foes? (Tests: the material is theirs.) */
export const kitDrops = (k: Kit) => k.foes.flatMap((f) => [ENEMY_PARTS[f].part, ...ENEMY_PARTS[f].elite]);

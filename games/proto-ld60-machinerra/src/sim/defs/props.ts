/**
 * Props: what the land is furnished with that breaks (P39). One system for walls, debris, crates and the effect props
 * (`props.md`); ruins are made of them (`RUIN_PIECES`). Rules and code: `sim/props.ts`; crashes: `sim/crash.ts`.
 * Every number here is a first guess to tune in play.
 * Add a prop: a `PropKind` and its `PROPS` entry (class `cls`, flags, effect), a `SCATTER` weight in the biomes it stands in, a
 * texture `prop-<kind>`, `prop-<kind>-cracked` and `prop-<kind>-rubble` in `src/propart.ts`.
 * Add a material: a `Material` and its `MATERIALS` row; the biome's walls in `WALL_MATERIAL`.
 */
import type { StatusId } from '../effects';
import type { DamageType } from '../effects';
import type { BiomeId } from './biomes';

export type Material = 'wood' | 'tin' | 'glass' | 'brass' | 'concrete';

/** Strength by material: the health of a size-1 prop of it, and the scrap it gives up broken (also by size; a wall gives none). */
export const MATERIALS: Record<Material, { name: string; hp: number; scrap: number }> = {
  glass: { name: 'Glass', hp: 6, scrap: 1 },
  wood: { name: 'Wood', hp: 14, scrap: 3 },
  tin: { name: 'Tin', hp: 22, scrap: 4 },
  brass: { name: 'Brass', hp: 40, scrap: 6 },
  concrete: { name: 'Concrete', hp: 70, scrap: 2 },
};

export type PropKind = 'wall' | 'debris' | 'crate' | 'barrel' | 'tank' | 'tower' | 'transformer' | 'car' | 'propane' | 'vending' | 'fridge' | 'ball' | 'shell' | 'sign';

/** What a zone on the ground does to every machine and robot inside it, `every` seconds (`ZONES`). */
export type ZoneKind = 'fire' | 'puddle' | 'steam' | 'shock' | 'alarm' | 'slick' | 'mud';

export const ZONES: Record<ZoneKind, { every: number; status?: StatusId; time?: number; shock?: number; label: string }> = {
  fire: { every: 0.5, status: 'burning', time: 3, label: 'a fire' },
  puddle: { every: 0.5, status: 'wet', time: 4, label: 'a puddle' },
  // A Firebrand's coal slick (systems.md: a slick Slows, fire lights it): fire near it, or a burning unit in it, turns it into a fire (`props.ts` `zoneStep`).
  slick: { every: 0.5, status: 'slowed', time: 1.5, label: 'a coal slick' },
  steam: { every: 0.5, status: 'scalded', time: 2, label: 'steam' },
  // A Mud tank boar's mud (P31, D32): it Slows whatever walks in it, theirs and ours; it does not burn.
  mud: { every: 0.5, status: 'slowed', time: 1.5, label: 'mud' },
  // A pulse of Shock every 2 s (a Wet target takes it doubled and jumps it on: the engine's rule).
  shock: { every: 2, shock: 6, label: 'a live transformer' },
  // Calls every foe in reach to it, once a second (`Hornet.hear`, the Echoing way).
  alarm: { every: 1, label: 'a car alarm' },
};

/** A burst: what a prop does when it goes off. Damage to machines and robots alike (`type`), a shove, a zone left on the ground, a blow to the props round it (`props`, default `dmg`). */
export interface Burst {
  r: number;
  dmg: number;
  type: DamageType;
  knock?: number;
  props?: number;
  zone?: { kind: ZoneKind; r: number; life: number };
}

/**
 * What a prop does, in the effect language's words. `hit`: the first time it is hurt (a zone). `tell`: seconds between
 * its breaking and its burst (a hiss, a swell), a `patch` of this radius on the ground for the bots to keep off; `vent`
 * is the zone it lets off meanwhile. `burst`: the blast. `zone`: left on the ground when it breaks, with no tell.
 * `rocket`: kicked, it takes off at `speed` for `time` seconds along the kick, then bursts. `cans`: energy drinks it drops.
 */
export interface PropFx {
  hit?: { zone: { kind: ZoneKind; r: number; life: number } };
  tell?: number;
  vent?: { kind: ZoneKind; r: number };
  burst?: Burst;
  zone?: { kind: ZoneKind; r: number; life: number };
  rocket?: { speed: number; time: number };
  cans?: number;
}

/**
 * What a thing on the land is to the player (P47 part A): `scenery` (smashing gives nothing), `loot` (smashing drops
 * something), `interact` (has an E action and is not a location's heart), `centre` (a location's heart; if it also has an
 * E action, the heart wins). `sim/classes.ts` classes everything else; a prop kind says its own here.
 */
export type ThingClass = 'scenery' | 'loot' | 'interact' | 'centre';

export interface PropDef {
  name: string;
  /** Its class (`ThingClass`): from what the code does with it today (scrap, cans), not from its name. */
  cls: ThingClass;
  /** Its material; a wall's and a debris piece's come from the land (`WALL_MATERIAL`). */
  material: Material;
  /** Health and scrap multiply by it. */
  size: number;
  /** Hit radius, px. */
  r: number;
  /** Blocks walking, shots and sight (cover). It frees its tile when it breaks. */
  solid?: boolean;
  /** Slides when kicked and crashes like a foe (P36's fridge and bowling balls are this flag). Never solid while it stands. */
  kickable?: boolean;
  /** A wall or a heap of debris: gives no scrap when it breaks. */
  bare?: boolean;
  /** Picked up and carried like a downed robot (P36's shells and sign; `placeparts.ts`). Never solid. */
  carry?: boolean;
  /** Its place's view draws it (the Cold Box's fridge), not `PropView`. */
  placeDrawn?: boolean;
  fx?: PropFx;
}

export const PROPS: Record<PropKind, PropDef> = {
  wall: { name: 'Wall', cls: 'scenery', material: 'concrete', size: 1, r: 16, solid: true, bare: true },
  debris: { name: 'Debris', cls: 'scenery', material: 'tin', size: 0.5, r: 12, bare: true },
  crate: { name: 'Crate', cls: 'loot', material: 'wood', size: 1, r: 14, solid: true },
  barrel: { name: 'Crude barrel', cls: 'loot', material: 'tin', size: 1, r: 12, kickable: true, fx: { tell: 0.5, burst: { r: 60, dmg: 5, type: 'fire', props: 24, zone: { kind: 'fire', r: 56, life: 6 } } } },
  tank: { name: 'Pressure tank', cls: 'loot', material: 'brass', size: 1.5, r: 18, solid: true, fx: { tell: 1.5, vent: { kind: 'steam', r: 66 }, burst: { r: 96, dmg: 10, type: 'impact', knock: 420, props: 30 } } },
  tower: { name: 'Water tower', cls: 'loot', material: 'wood', size: 3, r: 20, solid: true, fx: { zone: { kind: 'puddle', r: 96, life: 25 } } },
  transformer: { name: 'Transformer', cls: 'loot', material: 'tin', size: 2, r: 16, solid: true, fx: { zone: { kind: 'shock', r: 76, life: 10 } } },
  car: { name: 'Car', cls: 'loot', material: 'tin', size: 3, r: 22, solid: true, fx: { hit: { zone: { kind: 'alarm', r: 448, life: 15 } } } },
  propane: { name: 'Propane tank', cls: 'loot', material: 'tin', size: 1, r: 12, kickable: true, fx: { tell: 0.4, rocket: { speed: 520, time: 1 }, burst: { r: 90, dmg: 14, type: 'fire', knock: 300, props: 30, zone: { kind: 'fire', r: 70, life: 5 } } } },
  vending: { name: 'Vending machine', cls: 'loot', material: 'brass', size: 1.5, r: 16, solid: true, fx: { cans: 3 } },
  // The places' (P36; sizes and materials are guesses): the Cold Box's fridge, the Strike Lanes' bowling ball, the Old Battery's shells, the First Scripture's sign.
  fridge: { name: 'Smart fridge', cls: 'centre', material: 'brass', size: 2, r: 18, kickable: true, placeDrawn: true },
  ball: { name: 'Bowling ball', cls: 'interact', material: 'concrete', size: 1, r: 10, kickable: true, bare: true },
  shell: { name: 'Field gun shell', cls: 'interact', material: 'brass', size: 1, r: 9, carry: true, bare: true },
  sign: { name: 'The First Scripture', cls: 'interact', material: 'wood', size: 2, r: 14, carry: true, bare: true },
};

/** Looks by health: whole above this share, cracked at or below it, rubble at nothing. */
export const CRACKED = 0.5;

/** Props are worn from the start: a seeded share of their health (`[least, most]`). Ruins' pieces are worn more. */
export const WEAR = { prop: [0.6, 1] as [number, number], ruin: [0.35, 1] as [number, number] };

/** A chain of bursts breaking props that burst in turn goes no further than this many links (props.md). */
export const CHAIN_MAX = 8;

/** The material a land's ruin walls are made of (one of them, by the roll). */
export const WALL_MATERIAL: Record<BiomeId, Material[]> = {
  desert: ['concrete', 'tin'],
  jungle: ['wood'],
  city: ['concrete', 'glass'],
  mountains: ['wood', 'concrete'],
  demon: ['concrete', 'brass'],
  ether: ['glass'],
};

/**
 * A ruin is walls round its find (a gap always left to walk in by) and debris scattered in them. The size class is rolled:
 * how many pieces (`walls`, `debris`) and what the find pays for it (`pay`, times the ruin's health share; `floor` is the share of
 * the pay a flattened ruin still gives). A ruin of a Parable Trail has none (its verses must never be lost).
 */
export const RUIN_PIECES = {
  size: { small: { weight: 3, walls: 2, debris: 1, pay: 1 }, medium: { weight: 2, walls: 4, debris: 2, pay: 1.5 }, large: { weight: 1, walls: 6, debris: 3, pay: 2 } },
  /** Walls stand this many tiles from the find, with an opening of this many radians. */
  ring: 2.4,
  gap: 1.7,
  floor: 0.4,
};
export type RuinSize = keyof typeof RUIN_PIECES.size;

/**
 * What the generator scatters in the open, by biome: `[kind, weight]`, `count` of them, apart from each other and from
 * the lift, hives, seeps, places and ruins. Cars also stand beside the ruins of cars.
 */
export const SCATTER: Record<BiomeId, { count: number; kinds: [PropKind, number][] }> = {
  desert: { count: 10, kinds: [['crate', 3], ['barrel', 3], ['propane', 1], ['tank', 1], ['tower', 1], ['transformer', 1], ['car', 2], ['vending', 1]] },
  jungle: { count: 8, kinds: [['crate', 3], ['barrel', 2], ['tower', 2], ['car', 1], ['vending', 1]] },
  city: { count: 12, kinds: [['crate', 3], ['barrel', 2], ['tank', 1], ['transformer', 2], ['car', 3], ['vending', 2], ['propane', 1]] },
  mountains: { count: 8, kinds: [['crate', 3], ['barrel', 3], ['propane', 2], ['tank', 1], ['car', 1]] },
  demon: { count: 8, kinds: [['crate', 2], ['barrel', 3], ['tank', 2], ['transformer', 1]] },
  ether: { count: 6, kinds: [['crate', 2], ['barrel', 1]] },
};

/** The ruin kinds a car prop stands beside. */
export const CAR_RUINS = ['car', 'golfcart', 'snowmobile'] as const;

/**
 * Scrap from what is smashed (not walls): a pile of `MATERIALS[m].scrap` times the prop's size, rounded. A gob of a kill is `LOOT.scrap`.
 */
export const propScrap = (material: Material, size: number) => Math.round(MATERIALS[material].scrap * size);

/** Crashes (`sim/crash.ts`): a kicked body must fly at least `min` px/s to crash; damage is `perSpeed` per px/s; `share` of its speed passes to a foe it strikes (`prop`: times that damage to a prop); a fling ends after `flight` s. */
// perSpeed (Minos 2026-10-19: kicking through walls; numbers are the lead's guess): a body kicked from about two tiles out kills a plain hornet,
// breaks glass and half-worn wood every time and a third-worn stone wall; the crashDamage stat scales foes and walls alike, so a kick build breaks anything.
export const CRASH = { min: 160, perSpeed: 0.045, share: 0.55, prop: 1.5, flight: 1.4, friction: 5 };

/** The energy drink a vending machine drops (`Can`): Haste for the Communicator alone (the crew refuse it as heresy); it spoils after `life` s. */
export const CAN = { haste: 8, life: 30, reach: 18 };

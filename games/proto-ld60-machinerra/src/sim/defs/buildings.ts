/**
 * P47's buildings (`plans/P47-remnants.md`, Minos: ruins are remnants of buildings with a purpose, Rimworld's ruined hospital the
 * reference): each blueprint is a purpose, rooms of wall runs with doorways, a floor, and furniture that says what it was.
 * The rules (stamping, intactness, the tier of a find) are `sim/buildings.ts`; every number and layout here is a first guess
 * (Directive 47: the executing agent fills layouts, names and numbers).
 *
 * Coordinates are tiles in the blueprint's own frame (0,0 its top-left; rectangles and points, never ASCII rows). A room is its
 * outer rectangle: its edge is wall, so two rooms sharing an edge share the wall and a room inside another is a partition.
 * `doors` are edge tiles left open. `heart` is where the centrepiece stands (a ruin's find, a hive), null for a building with none
 * (a hive village's huts, the faded city). `loot` slots are filled in order, as many as the building's size and rooms ask (`BUILD.loot`).
 * Add a blueprint: a `BLUEPRINTS` row (`fits` names the ruin finds that sit in it); a new furniture kind: a `PropKind` in defs/props.ts.
 */
import type { BiomeId } from './biomes';
import type { Material, PropKind } from './props';
import type { RuinKind } from './ruins';

/** Which age a building is from (Minos): modern (concrete, steel, glass) or steampunk (brick, iron and brass, wood). */
export type Era = 'modern' | 'steam';

/** What its floor is: the look stamped under it (`propart.ts` `floorKey`). */
export type FloorKind = 'tile' | 'concrete' | 'boards' | 'flags';

export interface Room { x: number; y: number; w: number; h: number }
export type At = readonly [number, number];
export type Piece = readonly [PropKind, number, number];

export interface Blueprint {
  name: string;
  era: Era;
  w: number;
  h: number;
  rooms: readonly Room[];
  doors: readonly At[];
  heart: At | null;
  furniture: readonly Piece[];
  loot: readonly Piece[];
  floor: FloorKind;
  /** The ruin finds that sit in it as its centrepiece (empty: no ruin picks it; a village's or the faded city's). */
  fits: readonly RuinKind[];
}

export type BlueprintId =
  | 'garage' | 'shop' | 'relay' | 'clinic' | 'substation' | 'kiosk'
  | 'chapel' | 'boilerhouse' | 'lodge' | 'pavilion' | 'shed'
  | 'hivehall' | 'hut' | 'house';

export const BLUEPRINTS: Record<BlueprintId, Blueprint> = {
  // ---------------------------------------------------------------- modern
  garage: {
    name: 'Garage', era: 'modern', w: 11, h: 8, floor: 'concrete',
    rooms: [{ x: 0, y: 0, w: 11, h: 8 }, { x: 7, y: 0, w: 4, h: 4 }],
    doors: [[3, 7], [4, 7], [5, 7], [8, 3], [0, 4]],
    heart: [4, 3],
    furniture: [['rack', 1, 1], ['rack', 2, 1], ['desk', 9, 1], ['debris', 6, 5]],
    loot: [['engine', 2, 5], ['cabinet', 8, 1], ['crate', 9, 5], ['engine', 6, 2], ['box', 1, 6]],
    fits: ['car', 'golfcart', 'snowmobile', 'cart'],
  },
  shop: {
    name: 'Corner shop', era: 'modern', w: 10, h: 7, floor: 'tile',
    rooms: [{ x: 0, y: 0, w: 10, h: 7 }, { x: 0, y: 0, w: 4, h: 3 }],
    doors: [[6, 6], [7, 6], [2, 2]],
    heart: [6, 3],
    furniture: [['counter', 8, 2], ['counter', 8, 3]],
    loot: [['shelf', 2, 4], ['shelf', 3, 4], ['box', 1, 1], ['shelf', 5, 1], ['vending', 8, 5]],
    fits: ['phone', 'vending', 'cart', 'trafficlight'],
  },
  relay: {
    name: 'Relay station', era: 'modern', w: 9, h: 9, floor: 'tile',
    rooms: [{ x: 0, y: 0, w: 9, h: 9 }, { x: 0, y: 5, w: 5, h: 4 }],
    doors: [[4, 0], [8, 6], [3, 5]],
    heart: [5, 3],
    furniture: [['desk', 1, 2], ['desk', 2, 2], ['pipes', 7, 1]],
    loot: [['server', 1, 6], ['server', 2, 6], ['cabinet', 7, 7], ['server', 3, 7], ['box', 1, 1]],
    fits: ['dish', 'trafficlight', 'trailcam', 'phone', 'panel'],
  },
  clinic: {
    name: 'Clinic', era: 'modern', w: 13, h: 8, floor: 'tile',
    rooms: [{ x: 0, y: 0, w: 13, h: 8 }, { x: 0, y: 0, w: 5, h: 8 }, { x: 8, y: 0, w: 5, h: 8 }],
    doors: [[6, 7], [4, 3], [8, 4], [6, 0]],
    heart: [6, 3],
    furniture: [['bed', 1, 1], ['bed', 1, 3], ['bed', 1, 5], ['bed', 11, 1], ['bed', 11, 4]],
    loot: [['cabinet', 3, 1], ['cabinet', 9, 6], ['crate', 3, 6], ['cabinet', 11, 6], ['box', 7, 6]],
    fits: ['panel', 'phone', 'vending', 'trafficlight'],
  },
  substation: {
    name: 'Substation', era: 'modern', w: 9, h: 7, floor: 'concrete',
    rooms: [{ x: 0, y: 0, w: 9, h: 7 }],
    doors: [[4, 6], [0, 2], [8, 4]],
    heart: [4, 3],
    furniture: [['pipes', 1, 1], ['pipes', 7, 1]],
    loot: [['transformer', 2, 4], ['cabinet', 6, 1], ['transformer', 6, 4], ['box', 2, 1]],
    fits: ['panel', 'dish', 'trafficlight'],
  },
  kiosk: {
    name: 'Kiosk', era: 'modern', w: 6, h: 5, floor: 'tile',
    rooms: [{ x: 0, y: 0, w: 6, h: 5 }],
    doors: [[2, 4], [3, 4]],
    heart: [3, 2],
    furniture: [['counter', 1, 1]],
    loot: [['box', 4, 1], ['shelf', 1, 3]],
    fits: ['car', 'phone', 'dish', 'panel', 'carousel', 'trailcam', 'golfcart', 'cart', 'trafficlight', 'vending', 'snowmobile', 'gondola', 'skis'],
  },
  // ---------------------------------------------------------------- steampunk
  chapel: {
    name: 'Chapel', era: 'steam', w: 9, h: 12, floor: 'flags',
    rooms: [{ x: 0, y: 0, w: 9, h: 12 }, { x: 0, y: 0, w: 9, h: 4 }],
    doors: [[4, 11], [3, 3], [5, 3]],
    heart: [4, 2],
    furniture: [['pew', 2, 5], ['pew', 6, 5], ['pew', 2, 7], ['pew', 6, 7], ['pew', 2, 9], ['pew', 6, 9]],
    loot: [['cabinet', 1, 1], ['crate', 7, 1], ['box', 1, 10]],
    fits: ['carousel', 'gondola', 'skis', 'dish', 'trafficlight'],
  },
  boilerhouse: {
    name: 'Boiler house', era: 'steam', w: 11, h: 9, floor: 'flags',
    rooms: [{ x: 0, y: 0, w: 11, h: 9 }, { x: 0, y: 0, w: 4, h: 5 }],
    doors: [[6, 8], [3, 2], [10, 4]],
    heart: [6, 4],
    furniture: [['pipes', 5, 1], ['pipes', 8, 1], ['debris', 2, 7]],
    loot: [['boiler', 8, 6], ['boiler', 1, 2], ['crate', 2, 6], ['barrel', 9, 2], ['box', 4, 7]],
    fits: ['panel', 'golfcart', 'snowmobile', 'cart', 'vending'],
  },
  lodge: {
    name: 'Lodge', era: 'steam', w: 10, h: 8, floor: 'boards',
    rooms: [{ x: 0, y: 0, w: 10, h: 8 }, { x: 6, y: 0, w: 4, h: 8 }],
    doors: [[3, 7], [6, 5], [0, 3]],
    heart: [3, 3],
    furniture: [['bed', 8, 1], ['bed', 8, 4], ['desk', 1, 1]],
    loot: [['shelf', 1, 5], ['cabinet', 8, 6], ['crate', 4, 1], ['box', 7, 6]],
    fits: ['skis', 'snowmobile', 'gondola', 'trailcam', 'carousel'],
  },
  pavilion: {
    name: 'Fair pavilion', era: 'steam', w: 12, h: 10, floor: 'boards',
    rooms: [{ x: 0, y: 0, w: 12, h: 10 }, { x: 9, y: 0, w: 3, h: 4 }],
    doors: [[5, 9], [6, 9], [0, 4], [0, 5], [11, 5], [10, 3]],
    heart: [5, 4],
    furniture: [['pew', 2, 7], ['pew', 8, 7], ['counter', 2, 1]],
    loot: [['crate', 10, 1], ['barrel', 1, 1], ['shelf', 3, 1], ['box', 10, 8], ['crate', 1, 8]],
    fits: ['carousel', 'golfcart', 'cart', 'vending'],
  },
  shed: {
    name: 'Shed', era: 'steam', w: 6, h: 5, floor: 'boards',
    rooms: [{ x: 0, y: 0, w: 6, h: 5 }],
    doors: [[2, 4], [3, 4]],
    heart: [3, 2],
    furniture: [['rack', 1, 1]],
    loot: [['crate', 4, 1], ['box', 1, 3]],
    fits: ['car', 'phone', 'dish', 'panel', 'carousel', 'trailcam', 'golfcart', 'cart', 'trafficlight', 'vending', 'snowmobile', 'gondola', 'skis'],
  },
  // ---------------------------------------------------------------- hive villages and the faded city (no ruin picks these)
  /** A hive's hall: the hive is its heart (destroying the hive is destroying the hive, as today), its walls broken by many gaps (Minos). */
  hivehall: {
    name: 'Hive hall', era: 'modern', w: 9, h: 9, floor: 'concrete',
    rooms: [{ x: 0, y: 0, w: 9, h: 9 }],
    doors: [[4, 0], [3, 8], [4, 8], [5, 8], [0, 4], [8, 3], [8, 4]],
    heart: [4, 4],
    furniture: [['debris', 2, 2], ['debris', 6, 6]],
    loot: [['crate', 1, 7], ['barrel', 7, 1], ['box', 1, 1]],
    fits: [],
  },
  hut: {
    name: 'Hut', era: 'steam', w: 5, h: 5, floor: 'boards',
    rooms: [{ x: 0, y: 0, w: 5, h: 5 }],
    doors: [[2, 4], [0, 2]],
    heart: null,
    furniture: [['debris', 1, 1]],
    loot: [['box', 3, 1], ['crate', 3, 3]],
    fits: [],
  },
  house: {
    name: 'House', era: 'modern', w: 8, h: 7, floor: 'tile',
    rooms: [{ x: 0, y: 0, w: 8, h: 7 }, { x: 0, y: 0, w: 4, h: 4 }],
    doors: [[5, 6], [3, 2], [7, 2]],
    heart: null,
    furniture: [['bed', 1, 1], ['desk', 5, 1], ['counter', 6, 4]],
    loot: [['box', 1, 5], ['shelf', 2, 1], ['cabinet', 6, 1]],
    fits: [],
  },
};

/** The ruin blueprints big to small: a ruin tries the biggest that fits its find and its ground, then smaller ones, then today's ring. */
export const RUIN_BLUEPRINTS: readonly BlueprintId[] = ['clinic', 'pavilion', 'garage', 'boilerhouse', 'chapel', 'lodge', 'shop', 'relay', 'substation', 'kiosk', 'shed'];

/** The walls a building of each era is built of (Minos; P39's materials mapped: concrete and brick are stone, tin and brass are metal). */
export const ERA_WALLS: Record<Era, Material[]> = { modern: ['concrete', 'tin', 'glass'], steam: ['brick', 'brass', 'wood'] };

/** How likely each era is on a biome (lead's guess from each land's story: the Hollow City modern, the mountains' lodges and the jungle's park steampunk). */
export const ERA_SHARE: Record<BiomeId, number> = { desert: 0.5, jungle: 0.35, city: 0.8, mountains: 0.3, demon: 0.5, ether: 0.6 };

/**
 * The numbers (guesses). `intact`: how a building's intactness is rolled (`range`, then raised to `skew`: intact ones are rarer).
 * `runLoss`: at intactness 0 this share of whole wall runs is gone (fewer the more intact). `holes`: the share of single tiles gone
 * from the runs that stand, at 0. `keep`: the share of furniture standing at 0 (all of it at 1). `wear`: a piece's health share,
 * the building's intactness plus or minus this. `loot`: loot smashables are one per `perTiles` of floor plus `perRoom` per room
 * (at least one, at most the blueprint's slots). `tiers`: intactness at which the centrepiece's find steps up (`tierOf`).
 * `margin`: tiles kept clear round a building; `rockMax`: the share of a footprint that may be rock (walls there are left out).
 * `open`: the share of the open-land scatter left in a land with buildings (the open goes quiet, part A).
 */
export const BUILD = {
  intact: { range: [0.08, 1] as [number, number], skew: 1.3 },
  runLoss: 0.85,
  holes: 0.3,
  keep: 0.35,
  wear: 0.25,
  loot: { perTiles: 22, perRoom: 0.6 },
  tiers: [0.34, 0.67] as [number, number],
  margin: 1,
  rockMax: 0.3,
  open: 0.45,
};

/**
 * Hive villages (Minos: the central hive building with smaller buildings round it, partially walled with gaps). `huts` by the land's
 * tier (1-3); they stand `ring` tiles from the hive. `intact`: the range a village's buildings roll in. Turrets (Minos: "can even have
 * turrets"): `turrets` by tier on a village with at least `turretFrom` huts (lead's guess: larger villages, rising with the land's rank).
 */
export const VILLAGE = { huts: [2, 3, 4] as const, ring: [6, 11] as [number, number], intact: [0.35, 0.8] as [number, number], turrets: [0, 1, 2] as const, turretFrom: 2 };

/**
 * The faded city (Minos: "a quarter of the map" of very faded outlines taken over by nature; few small loot smashables; it may hold
 * one intact building). `biomes`: which lands have one (lead's guess: the city and the desert). `area`: the district's share of the
 * land's width and height. `intact`: the range its outlines roll in; `whole`: a ruin standing in the district gets a building this
 * intact (its special one). `loot`: the share of loot slots filled (only boxes stand: `small`). `step`: tiles between building origins.
 */
export const FADED = {
  biomes: ['city', 'desert'] as BiomeId[],
  area: [0.5, 0.5] as [number, number],
  intact: [0.02, 0.18] as [number, number],
  whole: [0.85, 1] as [number, number],
  loot: 0.35,
  small: 'box' as PropKind,
  step: [11, 9] as [number, number],
  blueprints: ['house', 'shop', 'garage', 'kiosk', 'shed', 'clinic'] as BlueprintId[],
};

/**
 * A village's turrets (Minos: destructible, they shoot the Communicator and robots in range, with a tell before each shot). Numbers are
 * guesses: `range` px, `tell` s of the wind-up (a red line locked on the target), `every` s between shots, `dmg` a shot's damage,
 * `speed` the shot's px/s, `sight` must be clear (rock and solid props block it).
 */
/** What a centrepiece's tier gives besides its find (part C, `use.ts` `tierFind`): tier 0 a scrap pile of `scrap`, tier 2 of a steampunk building `insight`. */
export const TIER_FIND = { scrap: 6, insight: 1 };

export const TURRET = { range: 300, tell: 0.9, every: 2.6, dmg: 6, speed: 420 };

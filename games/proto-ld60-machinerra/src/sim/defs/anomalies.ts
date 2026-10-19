/**
 * Anomalies (P40, P54; systems.md "Landings"): what makes a landing play differently, one per land, rolled each time the lift is lowered.
 * Two kinds. A **land** anomaly holds the whole mission. **Weather** passes: it comes `count` times a mission, each time warned `WEATHER.warn`
 * seconds ahead (the horizon, the wind, the Oracle, a bar over the clock), eases in and out over `WEATHER.ease` s ("No sudden doom") and
 * lasts `hold` s whole (`sim/weather.ts` schedules it, `anomalyFx` in `sim/clock.ts` reads it).
 * `day` multiplies the biome's morning, day and evening (a Long Noon desert is twice the desert's day). Every other number is a multiplier
 * at full strength, 1 for none (the weather's ease from 1 to it): `aggro` of a foe's hunting range, `drops` of the drop chance and a gob of
 * scrap, `sight` of the Communicator's (a light's own radius stays full), `reach` of a gun's range, `steam` of the steam's regrowth,
 * `twistRate` of how fast the clock's twisted share rises, `twistedParts` of the twisted foes' parts. `weight` is how often a lowering of
 * the lift rolls it on a land that fits; `biomes` limits where. Hurried Sun is level 1's (P9): never rolled. `cast` tints the sky.
 * Add an anomaly: a row here, its rule where it acts (the biome's own rules are in `sim/weather.ts`), its look in `weatherview.ts`.
 */
import type { BiomeId } from './biomes';
import { DAY } from './day';

export type AnomalyId = 'plain' | 'hurried' | 'longNoon' | 'earlyDusk' | 'sandstorm' | 'mirage' | 'bloodMoon' | 'emberRain';

export interface AnomalyDef {
  name: string;
  /** The course table's line: its rules. */
  blurb: string;
  /** The Oracle's word a little after landing, if it has one (a land anomaly's; weather has `weather.line`). */
  hello?: string;
  day: { morning: number; day: number; evening: number };
  aggro: number;
  drops: number;
  sight: number;
  reach: number;
  steam: number;
  twistRate: number;
  twistedParts: number;
  /** Passing weather: how often, how long, what the Oracle says first and after, the banner at each warning. */
  weather?: { count: number; hold: number; line: string; again: string; banner: string };
  /** A tint on the sky's ambient colour at full strength (`k` of it), the Blood Moon's only by night. */
  cast?: { tint: number; k: number; night?: boolean };
  biomes?: BiomeId[];
  weight: number;
}

/** The weather's timing (P54): the warning's length, the ease in and the ease out, and the earliest warning (mission seconds). */
export const WEATHER = { warn: 9, ease: 5, from: 20 };

/** The Mirage: the share of the map's rings that are false, how near the Communicator must come (tiles) to make one fade, and how long it takes (s). */
export const MIRAGE = { share: 1 / 3, near: 6, fade: 1.2, r: [5, 8] as [number, number] };

/** The Sandstorm's caches, shown as signals once it has passed: how many, how far from the Communicator (tiles), the signal's radius (tiles) and the scrap each holds besides the crate's own. */
export const CACHES = { count: 2, near: [10, 26] as [number, number], r: 3, scrap: 8 };

/** The Ember Rain: a circle's mark every `every` s at full strength, the mark's lead (s) and radius (px), how far from the Communicator (px) and how long the Burning lasts (s). */
export const EMBERS = { every: 0.7, warn: 1, r: 56, reach: 560, burn: 3 };

const N = { aggro: 1, drops: 1, sight: 1, reach: 1, steam: 1, twistRate: 1, twistedParts: 1 };
const EVEN = { morning: 1, day: 1, evening: 1 };

export const ANOMALIES: Record<AnomalyId, AnomalyDef> = {
  plain: {
    ...N, name: 'Plain Sky', blurb: "Nothing odd about the weather. The day is the land's own.",
    day: EVEN,
    weight: 4,
  },
  hurried: {
    ...N, name: 'Hurried Sun', blurb: 'The sun runs fast over this patch: a day of four minutes.',
    hello: 'The sun runs fast over this patch. Do not dawdle.',
    day: { morning: 60 / DAY.morning, day: 90 / DAY.day, evening: 90 / DAY.evening },
    weight: 0,
  },
  longNoon: {
    ...N, name: 'Long Noon', blurb: 'The sun hangs. The day lasts twice as long.',
    hello: 'The sun is stuck at noon over this land. Longer to work, longer to be found.',
    day: { morning: 1, day: 2, evening: 1 },
    weight: 2,
  },
  earlyDusk: {
    ...N, name: 'Early Dusk', blurb: 'A short morning and a long, dark evening.',
    hello: 'Dusk comes early on this land, and stays. Take your scrap before the dark does.',
    day: { morning: 0.4, day: 1, evening: 1.4 },
    weight: 2,
  },
  sandstorm: {
    ...N, name: 'Sandstorm', blurb: "A wall of sand, 45 s. Sight and the machines' hunting range are halved and guns reach 25% less. Where it passed, 2 buried caches show as signals.",
    day: EVEN, aggro: 0.5, sight: 0.5, reach: 0.75,
    weather: { count: 3, hold: 45, line: 'Sand. Lots of it. Do try not to get lost.', again: 'More sand coming. It will uncover something, at least.', banner: 'A sandstorm is rolling in' },
    cast: { tint: 0xd49a5c, k: 0.4 },
    biomes: ['desert'],
    weight: 2,
  },
  mirage: {
    ...N, name: 'Mirage', blurb: 'One in three rings on the map is false: it shimmers and fades when you come within 6 tiles. The antenna stays true. Steam builds back 20% faster in the heat.',
    hello: 'The heat is making things up out here. Not every ring on my map is real, and I will not say which.',
    day: EVEN, steam: 1.2,
    biomes: ['desert'],
    weight: 2,
  },
  bloodMoon: {
    ...N, name: 'Blood Moon', blurb: "The nightmares' share rises twice as fast, and they drop twice the twisted parts.",
    hello: 'A red moon. The twisted ones will come sooner and thicker, and they carry more of themselves.',
    day: EVEN, twistRate: 2, twistedParts: 2,
    cast: { tint: 0xb02a30, k: 0.35, night: true },
    biomes: ['demon'],
    weight: 2,
  },
  emberRain: {
    ...N, name: 'Ember Rain', blurb: 'Embers fall, 20 s. Each lands on a marked circle and sets anything inside alight, theirs and yours; a foe that falls burning drops one more scrap gob.',
    day: EVEN,
    weather: { count: 3, hold: 20, line: 'The sky is red and coming down in pieces. Mind the circles.', again: 'Embers again. Watch the circles on the ground.', banner: 'Embers are falling' },
    cast: { tint: 0xc0502c, k: 0.25 },
    biomes: ['demon'],
    weight: 2,
  },
};

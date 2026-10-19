/**
 * Laimonas's biome twists (`docs/biomes.md` "Twists"; P31): what a land does by itself, under whatever anomaly the landing rolled
 * (P54's anomalies are stronger or rarer forms of these, on top). Rules in `sim/twists.ts`, the look in `twistview.ts`.
 * Add a twist: its numbers here, its rule there, its look in the view.
 */
import type { BiomeId } from './biomes';

/**
 * A passing twist (the jungle's rain, the Frostspine's blizzard): `per` says where in the clock it comes (`phase`: one in each of
 * the morning, the day and the evening; `day`: one in the day), `warn` its signal ahead (s), `hold` how long it lasts (s), both from
 * `biomes.md`. The ease in and out is the weather's (`WEATHER.ease`, P54).
 */
export interface PassingDef { per: 'phase' | 'day'; warn: number; hold: number }

/**
 * The rain (`biomes.md` Rustwood Jungle, Twists): every day phase has one shower of 30 s, signalled by a darkening sky and drips 5 s ahead;
 * everything outside is Wet. `every`: how often the Wet is laid on again while it holds (s), `wet` how long each lasts (s) and `from` the
 * ease at which it begins (guesses: the Wet comes and goes with the shower's ease).
 */
export const RAIN = { per: 'phase' as const, warn: 5, hold: 30, every: 1, wet: 2, from: 0.3 };

/**
 * The blizzard (`biomes.md` The Frostspine, Twists): one per day, 30 s; sight drops to 5 tiles, signalled by wind and snow thickening
 * 8 s ahead. `tiles` is the Communicator's sight at full strength (the robots' shrinks by the same share).
 */
export const BLIZZARD = { per: 'day' as const, warn: 8, hold: 30, tiles: 5 };

/**
 * The cold (`biomes.md` The Frostspine, Twists; Minos, D22): outside the warmth of a lit thing he gains a Chilled stack every `every` s,
 * up to `cap` (slowed, never Frozen by the cold alone; foes' Cold hits can still take him there); standing by warmth clears them.
 * Warmth: a crew robot's lamp (`lamp` px round it: every robot carries one, `LAMP` in `src/lamps.ts` draws most at 110; a Lamplighter's
 * wider `lamp` stat wins), the lift (`lift` px from its centre), a fire (a fire zone, `fire` px past its edge) and the Hot Spring's pool.
 * The Communicator's own lamp does not count (the lead's reading: else the cold never bites). `check`: how often warmth is looked for
 * (s). `lift`, `fire` and `check` are guesses.
 */
export const COLD = { every: 20, cap: 2, lamp: 110, lift: 160, fire: 40, check: 0.25 };

/**
 * The commute (`biomes.md` The Hollow City, Twists): twice a day (the start of the day and of the evening) a rush hour of `hold` s (the
 * source's 40): `crowd` Commuters walk a route across the map (edge to edge, passing within `near` tiles of him, `inset` tiles inside
 * the rim), in a column `spread` tiles long and `width` tiles wide, at `pace` of a Commuter's walk or faster if the route needs it. A
 * robot of ours within `bump` px of a walker, or a hit, turns it and its crowd within `turn` tiles (the source's 6) hostile; a walker
 * within `home` tiles of its end leaves the land. All but `hold` and `turn` are guesses.
 */
export const COMMUTE = { hold: 40, crowd: 10, near: 14, inset: 1.5, spread: 6, width: 1.6, pace: 1, bump: 18, turn: 6, home: 1.5 };

/** Which land has which twists. */
export const TWISTS: Partial<Record<BiomeId, { rain?: true; blizzard?: true; cold?: true; commute?: true }>> = {
  jungle: { rain: true },
  city: { commute: true },
  mountains: { blizzard: true, cold: true },
};

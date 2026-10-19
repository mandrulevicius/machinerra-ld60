/**
 * The first expeditions' foes (Minos on spawn tiers, `games/ludum-dare-60/docs/decisions.md`): three kinds of foe on one land,
 * by strength. Wandering from the start (placed as the mission opens, each tied to its spot) is the weakest, a hive's spawn the
 * middle, arrivals over the rim the strongest. Expedition n is the mission after n flown (`Sim.lessons.flown`): 1 is level 1,
 * 2 and 3 the next two landings. Only on the desert, where those land (the lands open by bosses). Every other mission and land
 * keeps its biome's wanderers and hive spawn, and its arrivals over the rim are the strongest tier too (`RIM`). Plain TS; `foes.ts` `hives`, `spider.ts` `edgeArrivals` and level 1's mast and guard (`placeplay.ts`) read it.
 * Add an expedition: a `FIRST_SPAWNS` row.
 */
import { T, type BiomeId, type Enemy } from './defs';
import { dist } from './geom';
import { tie, type Leash } from './leash';
import type { Hornet, Sim } from './sim';

/** Elites among a tier's foes: none, the day's usual roll (`tiers.ts` `eliteChance`), or this share (a guess). */
export type Elites = 'none' | 'usual' | number;
export interface Tier {
  kind: Enemy;
  elites: Elites;
}
export interface ExpeditionSpawns {
  /** Wandering from the start: how many. */
  wander: Tier & { n: number };
  hive: Tier;
  rim: Tier;
  /** Level 1's mini-boss at Sprocket's wreck (a boss kind, `BOSSES`). */
  boss?: Enemy;
}

/**
 * Minos (2026-10-19), roughly ("doesn't have to be exact"): baby caterpillars wandering and out of expedition 1's damaged
 * hive; expedition 2's wanderers caterpillars, the tusked ones their elites (an elite caterpillar is tusked: `caterpillar.ts`).
 * Expedition 3's hive is a guess (Crawlcams with elites). Counts and shares are guesses.
 */
export const FIRST_SPAWNS: Record<1 | 2 | 3, ExpeditionSpawns> = {
  1: {
    wander: { kind: 'caterpillar', elites: 'none', n: 6 },
    hive: { kind: 'caterpillar', elites: 'none' }, // out of a damaged hive
    rim: { kind: 'spider', elites: 'none' }, // no elites: Minos's exception
    boss: 'spider', // an elite Crawlcam as mini-boss: the Crawlcam sized up (`BOSSES.spider`)
  },
  2: {
    wander: { kind: 'caterpillar', elites: 0.25, n: 8 }, // the elites are the tusked ones
    hive: { kind: 'spider', elites: 'usual' },
    rim: { kind: 'spider', elites: 'usual' },
  },
  3: {
    wander: { kind: 'spider', elites: 0.25, n: 8 },
    hive: { kind: 'spider', elites: 'usual' }, // a guess
    rim: { kind: 'hornet', elites: 'usual' }, // bees
  },
};

/** Wanderers: at least `away` tiles from the lift and `apart` from each other; each hunts within its `leash` of its spot (guesses). */
export const WANDER = { away: 14, apart: 5, leash: { wake: 7, tiles: 12 } as Leash };

/**
 * Arrivals from off the map on every land past the first expeditions: the strongest tier. The biome's own roster, weighted toward
 * its heavier kinds (a hive sends the roster as it is), with this share of them elite (the usual roll is at most `HORNET.elite.chance`,
 * 18% at dusk and none in the morning). Numbers only, all guesses; the desert's are its mechahornets (`BIOMES.desert.edge`).
 */
export const RIM: Record<BiomeId, { kinds: [Enemy, number][]; elites: number }> = {
  desert: { kinds: [['hornet', 1]], elites: 0.25 },
  jungle: { kinds: [['boar', 0.5], ['cat', 0.35], ['monkey', 0.15]], elites: 0.25 },
  city: { kinds: [['charger', 0.5], ['officer', 0.3], ['commuter', 0.2]], elites: 0.3 },
  mountains: { kinds: [['goat', 0.5], ['kite', 0.4], ['bleater', 0.1]], elites: 0.3 },
  demon: { kinds: [['drone', 0.6], ['swarmer', 0.4]], elites: 0.35 },
  ether: { kinds: [['shade', 0.5], ['banshee', 0.4], ['wisp', 0.1]], elites: 0.35 },
};

/** This mission's expedition row, if it is one of the first three on the desert. */
export function expedition(sim: Sim): ExpeditionSpawns | null {
  const n = sim.lessons.flown;
  if (sim.dungeon || sim.intro || sim.biomeId !== 'desert' || !(n === 1 || n === 2 || n === 3)) return null;
  return FIRST_SPAWNS[n];
}

const eliteOf = (sim: Sim, e: Elites): boolean | undefined => (e === 'none' ? false : e === 'usual' ? undefined : sim.tiers.roll.chance(e));

/** What a hive or the rim sends now (undefined: the land's own). A first expedition's rows, else the land's `RIM`. Called once a foe. */
export function spawnPick(sim: Sim, where: 'hive' | 'rim'): { kind: Enemy; elite: boolean | undefined } | undefined {
  const t = expedition(sim)?.[where];
  if (t) return { kind: t.kind, elite: eliteOf(sim, t.elites) };
  if (where !== 'rim' || sim.dungeon || sim.intro) return undefined;
  const r = RIM[sim.biomeId];
  return { kind: r.kinds.length === 1 ? r.kinds[0][0] : sim.spiders.r.weighted(r.kinds), elite: eliteOf(sim, r.elites) };
}

/** The wanderers, placed once as the mission opens (`lessons.ts` `lessonStep`). */
export function placeWanderers(sim: Sim): Hornet[] {
  const w = expedition(sim)?.wander;
  if (!w) return [];
  const r = sim.r.fork('wander');
  const out: Hornet[] = [];
  for (let i = 0; i < 400 && out.length < w.n; i++) {
    const x = (r.int(2, sim.W - 3) + 0.5) * T, y = (r.int(2, sim.H - 3) + 0.5) * T;
    if (sim.blocked(x, y) || dist(x, y, sim.lift.x, sim.lift.y) < WANDER.away * T) continue;
    if (out.some((h) => dist(x, y, h.x, h.y) < WANDER.apart * T)) continue;
    const h = sim.spawnHornet(x, y, 0, eliteOf(sim, w.elites), false, w.kind, { menacing: false });
    tie(h, { x, y }, WANDER.leash);
    out.push(h);
  }
  return out;
}

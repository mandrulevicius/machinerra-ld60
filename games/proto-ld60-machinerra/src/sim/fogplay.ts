/**
 * What sees the land in a mission (P6): the Communicator and every living robot reveal the map's fog around them
 * (`fog.ts` holds the grid and the rules), and a lit Signal Mast reveals its stretch of land once (`mastSees`).
 * The Sim keeps `fog` and `signals`; the map draws the fog and the signals' rough areas, the antenna reads `warmth`.
 * Sight shrinks at night (`sky`) and in the Sandstorm (`Sim.sightMul`); it ignores line of sight.
 * Add a seer (the dog, the Radar Scope): a row in `SIGHT` (`fog.ts`) and a call in `fogStep`.
 */
import { fogMul, scoutSees } from './botskills';
import { dogSees } from './companions';
import { sightRadius, type Seer } from './fog';
import { sky } from './clock';
import { RUIN_PIECES, T } from './defs';
import { PERK_FX } from './perks';
import type { Bot, Sim } from './sim';

/** How often the fog is revealed, seconds (a disc of tiles per seer: no need every step). */
export const FOG_EVERY = 0.2;

const tile = (px: number) => px / T - 0.5;

/** How far a seer sees now, tiles: night and the Sandstorm shorten it (a dungeon has no sky). */
export function sightNow(sim: Sim, seer: Seer) {
  const night = sim.dungeon ? 0 : sky(sim.day.hour).night;
  return sightRadius(seer, night, seer === 'mast' ? 1 : sim.sightMul);
}

/** The bot's sight, tiles. */
export const sightOf = (sim: Sim, b: Bot) => sightNow(sim, b.role === 'controller' ? 'communicator' : 'bot');

/** The Communicator faces the aim point; no aim (the map is open, a pad) keeps the last facing. */
export function fogStep(sim: Sim, dt: number, ax: number, ay: number) {
  const c = sim.controller;
  if ((ax || ay) && Math.hypot(ax - c.x, ay - c.y) > 8) sim.facing = Math.atan2(ay - c.y, ax - c.x);
  sim.fogT -= dt;
  if (sim.fogT > 0) return;
  sim.fogT = FOG_EVERY;
  for (const b of sim.bots) {
    if (b.dead) continue;
    const r = sightOf(sim, b) * fogMul(sim, b); // a Spotter sees farther, a Ghost scouting on an order too
    sim.fog.reveal(tile(b.x), tile(b.y), r);
    scoutSees(sim, b, tile(b.x), tile(b.y), r);
  }
  if (sim.dog) dogSees(sim, sightNow(sim, 'dog')); // P42: the dog sees farther than he does
}

/** A lit mast shows the land around it, wherever the Communicator is. */
export function mastSees(sim: Sim, x: number, y: number) {
  sim.fog.reveal(tile(x), tile(y), sightNow(sim, 'mast'));
}

/**
 * The Old Map (P52, the Expeditioner's gift): the land's centrepiece, its biggest ruin (the most pay; the first of equals), is drawn on the map
 * from the start: the ground round it is seen, so its mark shows. Called as the Sim is made. Returns the ruin it marked.
 */
export function oldMap(sim: Sim) {
  if (!sim.perks.has('oldMap')) return null;
  const pay = (r: Sim['ruins'][number]) => (r.size ? RUIN_PIECES.size[r.size].pay : 0);
  const big = sim.ruins.filter((r) => r.trail === undefined).reduce<Sim['ruins'][number] | null>((best, r) => (!best || pay(r) > pay(best) ? r : best), null);
  if (big) sim.fog.reveal(tile(big.x), tile(big.y), PERK_FX.oldMap.reveal);
  return big;
}

export function fogSummary(sim: Sim) {
  return {
    seen: `${Math.round(sim.fog.fraction * 100)}%`,
    signals: sim.fog.open(sim.signals).map((s) => `${s.kind}@${Math.round(s.x)},${Math.round(s.y)}~${s.r}`),
    found: sim.signals.filter((s) => sim.fog.found(s)).map((s) => s.id),
  };
}

/**
 * The Princess's docks at work in a mission (P58 H, `hub/princessdocks.ts`), plain TS beside the sim:
 * - **Keeper of Docks** (her title; the stat `dockRegen` on the Communicator, `titles.ts`): a robot standing on the lift's platform regains oil
 *   slowly (`DOCK.regen` a second, paid in `STEP`-second pours so the heal numbers stay readable). The lift is a dock too: a reason to fall
 *   back to it before the rise, never a heal in the field. Not for a downed robot.
 * - **Receipts** (the city dock's perk): once a mission her voice names the nearest ruin he has not searched (`nearestUnsearched`, `ruinLine`);
 *   the map pulses its ring (`Sim.ruinPing`). The voice itself is `princessvoice.ts`.
 * Numbers are guesses.
 */
import { dist } from './geom';
import { T } from './defs';
import type { Sim } from './sim';
import type { Ruin } from './types';

/** Seconds of regen poured at once (so a heal is a readable +1, not a flicker), and how long the map's ring pulses. */
export const STEP = 1;
export const PING = 6;

const owed = new WeakMap<Sim, number>();

/** Each step: with the title, every robot on the platform mends `DOCK.regen` oil a second. */
export function dockStep(sim: Sim, dt: number) {
  const c = sim.controller;
  const rate = sim.engine.stat(c, 'dockRegen', 0);
  if (rate <= 0) return;
  const t = (owed.get(sim) ?? 0) + dt;
  if (t < STEP) return void owed.set(sim, t);
  owed.set(sim, t - STEP);
  for (const b of sim.bots) if (!b.dead && !b.downed && b.hp < b.maxHp && sim.onLift(b)) sim.engine.heal(b, rate * STEP, c);
}

/** The ruin closest to the Communicator that nobody has searched (or pried): what her Receipts name. */
export function nearestUnsearched(sim: Sim): Ruin | null {
  const c = sim.controller;
  let best: Ruin | null = null, bd = Infinity;
  for (const r of sim.ruins) {
    const d = dist(c.x, c.y, r.x, r.y);
    if (!r.searched && d < bd) (best = r), (bd = d);
  }
  return best;
}

const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
/** "north-east" from a to b. */
export const bearing = (a: { x: number; y: number }, b: { x: number; y: number }) => DIRS[(Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) + 8) % 8];

/** What she says about the ruin (the writer's; a dock is a ruin she cares about). */
export function ruinLine(sim: Sim, r: Ruin): string {
  const c = sim.controller, tiles = Math.max(1, Math.round(dist(c.x, c.y, r.x, r.y) / T));
  const where = `${tiles} tiles ${bearing(c, r)}`;
  return r.kind === 'dock'
    ? `The nearest thing you have not searched is a dock, ${where}. A dock. I have drawn it on your map, in ink.`
    : `Receipts, receipts. The nearest ruin you have not searched is ${where}. I have drawn it on your map. You are welcome.`;
}

/**
 * Old Earful's flaw (P52, Hob's gift, `WEAPONS.oldEarful`): so loud it wakes the nearest hive. Every shot wakes the nearest sleeping hive
 * within `PERK_FX.oldEarful.wake` tiles of the shooter (never in the morning, as a decode: the day has not woken yet; never a place's own).
 * The flinging is in `combat.ts` (`WeaponExtra.fling`).
 */
import { T } from './defs';
import { dist } from './geom';
import { wake } from './foes';
import { PERK_FX } from './perks';
import type { Sim } from './sim';

/** The shot's noise: the nearest sleeping hive in earshot wakes. Returns it. */
export function loudShot(sim: Sim) {
  if (sim.day.phase === 'morning') return null;
  const c = sim.controller, reach = PERK_FX.oldEarful.wake * T;
  const n = sim.nests.filter((x) => !x.awake && !x.dead && !x.place && dist(c.x, c.y, x.x, x.y) <= reach).sort((p, q) => dist(c.x, c.y, p.x, p.y) - dist(c.x, c.y, q.x, q.y))[0];
  if (!n) return null;
  wake(sim, n, 'Communicator');
  return n;
}

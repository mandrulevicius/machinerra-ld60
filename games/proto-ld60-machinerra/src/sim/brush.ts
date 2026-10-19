/**
 * The Main Brush (P58 B): the Princess's spare, her gift when she comes home. A spinning brush on a pole: each swing is a full
 * circle around him (`WEAPONS.mainBrush`, arc 2π, short reach, weaker than the shovel), which knocks small foes outward in the
 * kick's language, so they fly and crash into walls and each other (`brushFling`; the crash is not a kick kill, D34), and sweeps
 * the loose scrap and copper gobs within `BRUSH.sweep` to his feet (`brushSweep`). Its point is space and tidiness, not damage.
 * Numbers are guesses. Drawn as a copper whirl and a puff of dust (`commview.ts`).
 */
import { flingFoe } from './crash';
import { dist } from './geom';
import { PERK_FX } from './perks';
import type { Bot, Hornet, Sim } from './sim';

/** How far the sweep reaches (px), and how close to his feet the gobs land. */
export const BRUSH = { sweep: 130, feet: 10 };

/** How much farther the brush reaches (Moss in the brush, the jungle dock's perk: P58 H), swing and sweep. */
export const brushReach = (sim: Sim) => (sim.perks.has('mossBrush') ? PERK_FX.mossBrush : 1);

/** A small foe the brush struck flies outward (not a boss, not an elite: they only take the knock). */
export function brushFling(sim: Sim, h: Hornet, by: Bot) {
  if (h.boss || h.elite || h.dead) return;
  flingFoe(sim, h, by, false);
}

/** The loose scrap and copper within the sweep slide to his feet (picked up as he stands there). Returns how many moved. */
export function brushSweep(sim: Sim, c: Bot) {
  let n = 0;
  const reach = BRUSH.sweep * brushReach(sim);
  for (const l of sim.loot) {
    if (l.dead || (l.kind !== 'scrap' && l.kind !== 'copper')) continue;
    const d = dist(l.x, l.y, c.x, c.y);
    if (d > reach || d <= BRUSH.feet) continue;
    l.x = c.x + ((l.x - c.x) / d) * BRUSH.feet;
    l.y = c.y + ((l.y - c.y) / d) * BRUSH.feet;
    n++;
  }
  return n;
}

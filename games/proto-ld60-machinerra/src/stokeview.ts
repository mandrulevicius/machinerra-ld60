/**
 * What a stoked robot looks like on the move (Minos: "movespeed buff is signified with the swoosh effects for bots"): three pale
 * streaks trail it, each born at its back, sliding away and fading, so a stoked crew reads as faster at a glance. Drawn as
 * lines on the scene's one effects graphics (`BotsView.update`): no objects made, three segments a moving stoked robot a frame.
 * Warm paper, not red (red is danger) and not cyan (the crew's colour). The hot fire a stoked Firebrand lays is
 * `propview.ts` (`Zone.stoked`). Rules: `sim/stoke.ts`. Pure; tests in `stokeview.test.ts`.
 */

/** How many streaks trail a robot, how long one lives (s), and their reach, length, spacing and height above the feet (px). Guesses. */
export const SWOOSH = { n: 3, life: 0.32, reach: 28, len: 22, lane: 11, rise: 14 };

export interface Streak { x1: number; y1: number; x2: number; y2: number; a: number }

/**
 * The streaks behind a robot at (`x`, `y`) moving along the unit vector (`ux`, `uy`) at time `t` (s); `seed` keeps neighbours out of step.
 * Each lives `SWOOSH.life`, starts at the robot's back and trails away from it, brightest in the middle of its life.
 */
export function streaks(x: number, y: number, ux: number, uy: number, t: number, seed = 0): Streak[] {
  const out: Streak[] = [];
  const px = -uy, py = ux;
  for (let i = 0; i < SWOOSH.n; i++) {
    const age = (t / SWOOSH.life + i / SWOOSH.n + seed * 0.37) % 1;
    const lane = (i - (SWOOSH.n - 1) / 2) * SWOOSH.lane;
    const back = 8 + age * SWOOSH.reach;
    const bx = x + px * lane - ux * back, by = y - SWOOSH.rise + py * lane * 0.6 - uy * back;
    const len = SWOOSH.len * (1 - age * 0.4);
    out.push({ x1: bx, y1: by, x2: bx - ux * len, y2: by - uy * len, a: Math.sin(Math.PI * age) * 0.9 });
  }
  return out;
}

/**
 * The first missions' clock (Minos, P59 B): by missions flown (`SimOptions.flown`, the same count as `lessons.ts` `TAUGHT`) the clock
 * runs only so far and then holds, so the day arrives gradually. Every ramp reads `Sim.dayT` or the `DayState` made from it, so a
 * held `dayT` holds them all (spawns, `morningRamp`, rim arrivals `EDGE`, elite share, twist, the dusk boss): the held phase is never left.
 * Plain TS. One table: `CLOCK_HOLD`. Unset flown, or a count past the table, is the normal clock.
 */
import { marks, type DayCfg } from './clock';

/** What the clock does by missions flown: `lock` stays at the first second (the morning, no ramp at all); a phase runs to that phase's end and holds. */
export type Hold = 'lock' | 'day' | 'evening';
export const CLOCK_HOLD: Readonly<Record<number, Hold>> = { 1: 'lock', 2: 'day', 3: 'evening' };

/** Seconds short of the next phase's start: the held clock is still in its phase (`dayState` reads `t < at`). */
export const HOLD_SHY = 0.01;

/** The mission second the clock stops at for this many missions flown, or null when it runs on. */
export function holdAt(flown: number, cfg: DayCfg): number | null {
  const hold = CLOCK_HOLD[flown];
  if (!hold) return null;
  const at = marks(cfg);
  return hold === 'lock' ? 0 : hold === 'day' ? at.evening - HOLD_SHY : at.midnight - HOLD_SHY;
}

/** `t` held back to the cap (`holdAt`), or as it is when the clock runs on. */
export const held = (t: number, cap: number | null) => (cap === null ? t : Math.min(t, cap));

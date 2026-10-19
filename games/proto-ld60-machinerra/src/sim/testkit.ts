/** Helpers for tests that press Use (it is one press now: `Sim.step` sees the edge, a held key is one press). */
import { vi } from 'vitest';
import { MISSION } from './defs';
import { NO_INPUT, type Sim } from './sim';

export const USE = { ...NO_INPUT, use: true };

/** One tap of Use: down for a step, up for the next. */
export function tap(s: Sim) {
  s.step(1 / 30, USE);
  s.step(1 / 30, NO_INPUT);
}

/** Ride the lift (he must stand on it): the ask and the confirming press, then the climb. */
export function rideLift(s: Sim, climb = MISSION.riseTime + 1) {
  tap(s);
  tap(s);
  for (let t = 0; t < climb; t += 0.1) s.step(0.1, NO_INPUT);
}

/** The real land generator. Tests run on a memoized one (`harness/testsetup.ts`); use this one where the test is about `generate` itself (same seed, same land) or changes what it reads. */
export const { generate: generateReal } = await vi.importActual<typeof import('./mapgen')>('./mapgen');

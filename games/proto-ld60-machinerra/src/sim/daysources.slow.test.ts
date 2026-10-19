import { describe, expect, it } from 'vitest';
import { census } from './census';

// `daysources.test.ts` runs this at a coarse step on seed 4; here it runs at the live frame rate on two seeds.
describe('the day curve of the spawn sources at the live frame rate (P46)', () => {
  for (const biome of ['desert', 'jungle'] as const)
    for (const seed of [4, 9])
      it(`${biome} ${seed}: morning < day < evening in spawns, arrivals in the morning and rising phase by phase`, () => {
        const r = census(biome, seed, 1 / 30);
        const tot = (x: { hive: number; rim: number }) => x.hive + x.rim;
        expect(tot(r.morning)).toBeLessThan(tot(r.day));
        expect(tot(r.day)).toBeLessThan(tot(r.evening));
        const rate = (x: { rim: number; secs: number }) => x.rim / x.secs;
        expect(r.morning.rim).toBeGreaterThan(0);
        expect(rate(r.morning)).toBeLessThan(rate(r.day));
        expect(rate(r.day)).toBeLessThan(rate(r.evening));
        expect(rate(r.evening)).toBeLessThan(rate(r.midnight));
        expect(r.day.elite).toBeGreaterThan(0);
        expect(r.evening.twisted).toBeGreaterThan(0);
      });
});

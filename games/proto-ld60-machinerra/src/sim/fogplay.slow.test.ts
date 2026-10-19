import { describe, expect, it } from 'vitest';
import { BIOMES, type BiomeId } from './defs';
import { landSignals } from './fog';
import { generate } from './mapgen';

// `fogplay.test.ts` checks these on 6 seeds a biome (3 for the second); here every biome gets 25.
describe('ruin clusters over many lands (the mapgen hook)', () => {
  const lands = (['desert', 'jungle', 'city', 'demon', 'mountains', 'ether'] as BiomeId[]).flatMap((b) => Array.from({ length: 25 }, (_, i) => ({ b, seed: i + 1 })));

  it('give most lands a rich-ruins signal, with the same ruins as before (moved, never added or lost)', () => {
    let with_ = 0;
    for (const { b, seed } of lands) {
      const m = generate(seed, undefined, undefined, b);
      if (landSignals(m).some((s) => s.kind === 'ruins')) with_++;
      expect(m.ruins.filter((r) => r.trail === undefined && !r.place).length).toBe(BIOMES[b].ruins?.length ?? 6);
    }
    expect(with_ / lands.length, 'share of lands with a cluster').toBeGreaterThan(0.9);
  });

  it('keep every ruin on the map, clear of the lift, seeps, hives and places, and walkable from the lift', () => {
    for (const { b, seed } of lands) {
      const m = generate(seed, undefined, undefined, b);
      const loose = m.ruins.filter((r) => r.trail === undefined && !r.place); // a place's own ruins keep the place's layout
      const fixed = m.ruins.filter((r) => r.place);
      for (const r of loose) {
        expect(Math.hypot(r.x - m.lift.x, r.y - m.lift.y)).toBeGreaterThanOrEqual(8);
        for (const o of [...m.seeps, ...m.nests, ...loose.filter((q) => q !== r), ...fixed]) expect(Math.hypot(r.x - o.x, r.y - o.y)).toBeGreaterThanOrEqual(7);
      }
    }
  });
});

/** P58 H: the dock roll over many lands (a land takes ~0.25 s to make, so this is `test:slow`). */
import { describe, expect, it } from 'vitest';
import { DOCK } from '../sim/defs';
import { generateReal } from '../sim/testkit';

describe('the dock roll', () => {
  it('one land in DOCK.oneIn gets a dock while the ladder asks for it, any biome, never otherwise', () => {
    const N = 60;
    const ask = (b: string) => ({ questActive: (s: string) => s === `dock.${b}`, had: () => false });
    for (const biome of ['desert', 'jungle', 'demon'] as const) {
      const n = Array.from({ length: N }, (_, i) => i + 1).filter((s) => generateReal(s, undefined, undefined, biome, ask(biome)).ruins.some((r) => r.kind === 'dock')).length;
      expect(n, biome).toBeGreaterThan(N / DOCK.oneIn / 2);
      expect(n, biome).toBeLessThan((N / DOCK.oneIn) * 1.6);
    }
    expect(Array.from({ length: 10 }, (_, i) => i + 1).filter((s) => generateReal(s, undefined, undefined, 'jungle', ask('desert')).ruins.some((r) => r.kind === 'dock'))).toEqual([]);
  }, 120000);
});

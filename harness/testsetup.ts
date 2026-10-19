import { vi } from 'vitest';

/**
 * Generating a Machinerra land costs ~30 ms, every `new Sim` does it, and hundreds of tests ask for the same few lands.
 * So the test run memoizes `generate`: each caller gets its own copy (a Sim wears its map down), and the key holds everything
 * the output depends on (the seed, size, biome, the injected presence checks, the dev-forced places and the generator's options). An explicit `present` goes straight through.
 * A test of "the same seed gives the same land", or one that changes what `generate` reads (the places' rules), uses the real generator: `generateReal` in sim/testkit.ts.
 */
vi.mock('../games/proto-ld60-machinerra/src/sim/mapgen', async (importOriginal) => {
  const real = await importOriginal<typeof import('../games/proto-ld60-machinerra/src/sim/mapgen')>();
  const places = await import('../games/proto-ld60-machinerra/src/sim/places');
  const ids = new WeakMap<object, number>();
  let last = 0;
  const idOf = (o: object) => ids.get(o) ?? (ids.set(o, ++last), last);
  const cache = new Map<string, ReturnType<typeof real.generate>>();
  const generate: typeof real.generate = (seed, w = 100, h = 75, biome = 'desert', present, gen = {}) => {
    if (present) return real.generate(seed, w, h, biome, present, gen);
    const key = JSON.stringify([seed, w, h, biome, idOf(places.presence.checks), [...places.forced], gen]);
    let m = cache.get(key);
    if (!m) cache.set(key, (m = real.generate(seed, w, h, biome, undefined, gen)));
    return structuredClone(m);
  };
  return { ...real, generate };
});

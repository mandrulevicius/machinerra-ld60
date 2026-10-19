/**
 * The quest-only places in whole lands (P42): each is in some land once its step is active. Slow: it makes lands.
 * The presence rule alone is in `companions.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { BIOMES, type BiomeId } from '../sim/defs';
import { generate } from '../sim/mapgen';
import type { PlaceId } from '../sim/places';

describe('the quest-only places in a land', () => {
  const rows: [PlaceId, string][] = [
    ['kennel', 'dog.1'],
    ['stray', 'cat.1'],
    ['mounds', 'dog.dig'],
    ['compactor', 'shoot.1'],
    ['cairn', 'expeditioner.story.3'],
  ];
  it('each is in some land while its step is active, and in none while another is', () => {
    for (const [id, step] of rows) {
      const biome = (Object.keys(BIOMES) as BiomeId[]).find((b) => BIOMES[b].places.includes(id))!;
      const has = (open: string[], seed: number) => generate(seed, 100, 75, biome, { questActive: (s) => open.includes(s), had: () => false }).places.some((p) => p.id === id);
      expect(has(['other.1'], 1), `${id} for another step`).toBe(false);
      let found = false;
      for (let seed = 1; seed <= 24 && !found; seed++) found = has([step], seed);
      expect(found, `${id} while ${step} is on`).toBe(true);
    }
  });
});

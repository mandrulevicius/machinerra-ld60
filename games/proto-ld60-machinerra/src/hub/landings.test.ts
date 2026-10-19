import { describe, expect, it } from 'vitest';
import type { BiomeId } from '../sim/defs';
import { RANKED, landings, opened, tierOf } from './landings';
import { arrive, freshHub, migrateHub, pilgrimIn, type Haul } from './state';

const at = (bosses: string[] = [], course = 0, rescued: string[] = [], stranded: Record<string, BiomeId> = {}) => ({
  missions: 0, course, rescued: ['sprocket', ...rescued], stranded, found: {}, story: { ...freshHub().story, bosses },
});

describe('lands open by bosses', () => {
  it('a new game opens only the desert; each next land, in rank order, opens when the boss before it is down; the Ether is the story\'s', () => {
    expect(RANKED).toEqual(['desert', 'jungle', 'city', 'mountains', 'demon']);
    expect(opened([])).toEqual(['desert']);
    expect(opened(['hornet'])).toEqual(['desert', 'jungle']);
    expect(opened(['hornet', 'gorilla', 'knight', 'bear', 'drone'])).toEqual(RANKED);
    expect(opened(['gorilla', 'knight'])).toEqual(['desert']); // out of order opens nothing past the first boss still up
    expect(opened([], true)).toEqual(['desert', 'ether']);
  });

  it('an old save opens the lands whose previous bosses are down: the card pick goes, the bosses stay', () => {
    const old = { ...freshHub(), card: 2, course: 4, missions: 7, story: { ...freshHub().story, bosses: ['hornet', 'gorilla'] } };
    const next = migrateHub(old, 2) as Record<string, unknown>;
    expect(next).not.toHaveProperty('card');
    expect(landings({ ...freshHub(), ...next } as ReturnType<typeof freshHub>).map((l) => l.biome)).toEqual(['desert', 'jungle', 'city']);
  });
});

describe('what a land shows', () => {
  it('the tier is fixed by the rank; a new lowering of the lift rolls new seeds, the same save the same ones', () => {
    for (const l of landings(at(['hornet', 'gorilla', 'knight', 'bear', 'drone']), { ether: true })) expect(l.tier).toBe(tierOf(l.biome));
    expect(landings(at(['hornet'], 2))).toEqual(landings(at(['hornet'], 2)));
    expect(landings(at([], 3))[0].seed).not.toBe(landings(at([], 2))[0].seed);
  });

  it('a missed NPC stays on the land where they were missed; meeting and leaving them binds them, freeing them lets them go', () => {
    const missed = at(['hornet', 'gorilla'], 0, [], { expeditioner: 'jungle' });
    expect(landings(missed).map((l) => [l.biome, l.stranded])).toEqual([['desert', 'trader'], ['jungle', 'expeditioner'], ['city', 'trader']]);
    expect(pilgrimIn(at(), 'desert')).toBe('trader');
    const haul = (extra: Partial<Haul>): Haul => ({ id: `h${Math.random()}`, parts: {}, robots: [], ...extra });
    let s = { ...freshHub(), biome: 'jungle' as BiomeId };
    s = arrive(s, haul({ met: 'expeditioner', discovered: ['pilgrim'] }));
    expect(s.stranded).toEqual({ expeditioner: 'jungle' });
    expect(s.found).toEqual({ jungle: ['pilgrim'] });
    s = arrive(s, haul({ met: 'expeditioner', rescued: ['expeditioner'] }));
    expect(s.stranded).toEqual({});
  });
});

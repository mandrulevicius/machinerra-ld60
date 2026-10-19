import { describe, expect, it } from 'vitest';
import { validate } from '../sim/effects';
import { TITLES, earn, earnedTitles, freshTitles, nextWorn, styled, titleSources, titleStat, wear } from './titles';

describe('titles', () => {
  it('the first earned is worn, later ones wait, none twice, unknown ignored', () => {
    let t = earn(freshTitles(), 'theBoot');
    expect(t).toEqual({ earned: ['theBoot'], worn: 'theBoot' });
    t = earn(earn(earn(t, 'farShore'), 'theBoot'), 'nope');
    expect(t).toEqual({ earned: ['theBoot', 'farShore'], worn: 'theBoot' });
  });

  it('wears only what was earned; the plate cycles through them and none', () => {
    const t = earn(earn(freshTitles(), 'theBoot'), 'farShore');
    expect(wear(t, 'architect').worn).toBe('theBoot');
    expect(wear(t, null).worn).toBeNull();
    expect(nextWorn(t).worn).toBe('farShore');
    expect(nextWorn(nextWorn(t)).worn).toBeNull();
    expect(nextWorn(nextWorn(nextWorn(t))).worn).toBe('theBoot');
    expect(nextWorn(freshTitles())).toEqual(freshTitles());
  });

});

describe('titles stack', () => {
  const two = () => earn(earn(freshTitles(), 'queenBreaker'), 'shepherdOfBrass');

  it('every title earned applies, worn or not; the plate names only the worn one', () => {
    const t = two();
    expect(t.worn).toBe('queenBreaker');
    expect(titleSources(t).map((x) => x.source.id)).toEqual(['title:queenBreaker', 'title:shepherdOfBrass']);
    const other = wear(t, 'shepherdOfBrass');
    expect(titleSources(other).map((x) => x.source.id)).toEqual(['title:queenBreaker', 'title:shepherdOfBrass']);
    expect(styled(other)).toBe('The Communicator, Shepherd of Brass');
    expect(styled(wear(t, null))).toBe('The Communicator'); // none worn: the passives still apply
    expect(titleSources(wear(t, null))).toHaveLength(2);
    expect(earnedTitles(t).map((d) => d.name)).toEqual(['Queen-breaker', 'Shepherd of Brass']);
  });

  it('a title not earned does not apply, and the sources are split by who they change', () => {
    const t = two();
    expect(titleSources(freshTitles())).toEqual([]);
    expect(titleSources(t, 'comm').map((x) => x.def.name)).toEqual(['Queen-breaker']);
    expect(titleSources(t, 'bots').map((x) => x.def.name)).toEqual(['Shepherd of Brass']);
    expect(titleSources(t, 'hub')).toEqual([]);
  });

  it('a title that counts something (augments) scales by it', () => {
    const t = earn(freshTitles(), 'patchworkSaint');
    expect(titleStat(t, 'comm', 'maxHp', 100)).toBe(100);
    expect(titleStat(t, 'comm', 'maxHp', 100, { augment: 4 })).toBe(112);
  });

});

describe('the passives are effect sources that match quests.md', () => {

  it('each source is valid for the engine and named for its title', () => {
    for (const [id, d] of Object.entries(TITLES)) {
      expect(d.source.id).toBe(`title:${id}`);
      expect(() => validate(d.source), id).not.toThrow();
      expect(d.source.effects.length, id).toBeGreaterThan(0);
    }
  });

});

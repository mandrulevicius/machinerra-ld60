import { describe, expect, it } from 'vitest';
import type { Haul } from './state';
import { mood, welcome } from './welcome';

const haul = (over: Partial<Haul> = {}): Haul => ({ id: 't', parts: {}, robots: [], ...over });

describe("the Oracle's welcome", () => {
  it('remarks on a poor, a fair and a rich haul', () => {
    expect(mood(haul())).toBe('poor');
    expect(mood(haul({ scrap: 40 }))).toBe('fair');
    expect(mood(haul({ scrap: 60, copper: 45 }))).toBe('rich');
    expect(mood(haul({ parts: { 'hornet-head': 13 } }))).toBe('rich');
  });

  it('carries no figure and no list: the results screen has them', () => {
    const line = welcome(haul({ scrap: 120, copper: 40, parts: { 'hornet-head': 3 }, robots: [{ name: 'A', role: 'guard' }, { name: 'B', role: 'gatherer' }] }), { lost: 2, guests: 2, news: ['the Kicker', 'the Trader'] });
    expect(line).not.toMatch(/\d/);
    expect(line).not.toMatch(/scrap|copper|coal|parts|robots/i);
  });

  it('speaks of the lost, a guest and a quest giver only when there are some', () => {
    const quiet = welcome(haul({ scrap: 40 }), { lost: 0, guests: 0, news: [] });
    expect(quiet).not.toMatch(/stayed|company|want to hear/);
    const full = welcome(haul({ scrap: 40 }), { lost: 1, guests: 1, news: ['the Kicker'] });
    expect(full).toMatch(/stayed on the sands/);
    expect(full).toMatch(/company/);
    expect(full).toMatch(/the Kicker will want to hear/);
  });
});

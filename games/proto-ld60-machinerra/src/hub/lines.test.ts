import { describe, expect, it } from 'vitest';
import { DONE, freshTalk, type Talk } from './dialog';
import { LINES, count, have } from './lines';
import { PERKS, type PerkId } from './state';
import { } from './talk';

const at = (quests: Record<string, number>): Talk => ({ ...freshTalk(), quests });

describe('NPC quest lines', () => {
  it('every reward is a known perk, and some lines run one step per biome', () => {
    for (const l of Object.values(LINES)) for (const s of l.steps) if (s.reward.perk) expect(PERKS[s.reward.perk as PerkId], s.task).toBeDefined();
    expect(LINES.kicker.steps.map((s) => ('biome' in s.goal ? s.goal.biome : null))).toEqual(['desert', 'jungle', 'city', 'mountains', 'demon']);
    expect(LINES.expeditioner.steps).toHaveLength(5);
  });

  it('count a mission only for an active step, in its biome', () => {
    const t = at({ kicker: 1 });
    let p = count({}, t, { kickKills: 3 }, 'jungle');
    expect(have('kicker', t, p, {})).toBe(0); // wrong biome
    p = count(p, t, { kickKills: 1 }, 'desert');
    p = count(p, t, { kickKills: 2 }, 'desert');
    expect(have('kicker', t, p, {})).toBe(3);
    expect(count({}, freshTalk(), { kickKills: 9 }, 'desert')).toEqual({}); // not taken up
    // The next step starts from nothing.
    expect(have('kicker', at({ kicker: 2 }), p, {})).toBe(0);
    expect(have('kicker', at({ kicker: DONE }), p, {})).toBe(0);
  });



});

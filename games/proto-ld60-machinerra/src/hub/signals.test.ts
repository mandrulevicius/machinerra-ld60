import { describe, expect, it } from 'vitest';
import { freshTalk, type Talk } from './dialog';
import { freshHub } from './state';
import { landPips, signalsFor, trackerLines, TRACKER_MAX } from './signals';
import { S } from './story';

const at = (quests: Record<string, number>): Talk => ({ ...freshTalk(), quests });
const hub = freshHub();

describe('what applies on a land (the HUD tracker and the course table pips)', () => {
  it('the main quest\'s boss shows on the land it is on, and nowhere else', () => {
    const talk = at({ main: S.queen });
    expect(signalsFor({ talk, lines: {}, hub, facts: {}, biome: 'desert' }).map((s) => s.kind)).toContain('main');
    expect(signalsFor({ talk, lines: {}, hub, facts: {}, biome: 'jungle' }).map((s) => s.kind)).not.toContain('main');
    const down = { ...hub, story: { ...hub.story, bosses: ['hornet'] } };
    expect(signalsFor({ talk, lines: {}, hub: down, facts: {}, biome: 'desert' }).map((s) => s.kind)).not.toContain('main');
  });

  it('a counting step shows with its count, in its biome only; this run\'s stats count on top', () => {
    const talk = at({ kicker: 2 });
    const there = signalsFor({ talk, lines: { kicker: { step: 2, n: 1 } }, hub, facts: {}, biome: 'jungle', stats: { kickKills: 1 } });
    expect(there.find((s) => s.kind === 'line')!.text).toMatch(/Kicker: .* 2\/3/);
    expect(signalsFor({ talk, lines: {}, hub, facts: {}, biome: 'desert' }).some((s) => s.kind === 'line')).toBe(false);
  });

  it('a step that is not open yet shows nothing; a hand-in of parts shows on every land', () => {
    expect(signalsFor({ talk: at({ 'hob.story': 2 }), lines: {}, hub, facts: {}, biome: 'desert' }).filter((s) => s.kind === 'line')).toEqual([]);
    const open = signalsFor({ talk: at({ 'hob.story': 2 }), lines: {}, hub, facts: { 'act.2.open': 1 }, biome: 'desert' });
    expect(open.filter((s) => s.kind === 'line').map((s) => s.short)).toEqual(['Hob']);
  });

  it('a pilgrim waiting on a land with a pilgrim place is listed last, and the HUD takes three lines', () => {
    const talk = at({ main: S.queen, 'hob.story': 1, 'kicker.story': 1, 'sprocket.story': 3 });
    const facts = { 'act.1.done': 1 };
    const lines = trackerLines({ talk, lines: {}, hub, facts, biome: 'desert' });
    expect(lines).toHaveLength(TRACKER_MAX);
    expect(lines[0]).toMatch(/^The Old Way/);
    expect(landPips({ talk, lines: {}, hub, facts, biome: 'desert' }).length).toBeGreaterThanOrEqual(3);
  });
});

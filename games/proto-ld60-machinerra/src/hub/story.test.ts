import { describe, expect, it } from 'vitest';
import { storyFacts } from './story';
import { aboard, arrive, freshHub, rescue, type Haul } from './state';
import { } from './talk';

const haul = (id: string, more: Partial<Haul> = {}): Haul => ({ id, parts: {}, robots: [], ...more });

describe('the main quest (P44)', () => {


  it('keeps boss kills, the ghost and the wife from the hauls, whatever step the quest is at', () => {
    let s = freshHub();
    s = arrive(s, haul('a', { bosses: ['hornet', 'gorilla'] }));
    expect(storyFacts(s)).toMatchObject({ 'boss.hornet': 1, 'boss.gorilla': 1, wife: 0, ghost: 0 });
    // The Princess comes up the lift: she is aboard and home.
    s = arrive(s, haul('b', { bosses: ['knight'], rescued: ['princess'] }));
    expect(s.story.wife).toBe('home');
    expect(aboard(s).map((n) => n.id)).toContain('princess');
    // The Esteemed Ghost freed: his touch for good.
    s = arrive(s, haul('c', { ghost: true }));
    expect(s.perks).toContain('ghostTouch');
    expect(storyFacts(s).ghost).toBe(1);
    // The Evil Oracle down: she comes home again.
    s = { ...s, rescued: s.rescued.filter((r) => r !== 'princess'), story: { ...s.story, wife: 'stolen' } };
    s = arrive(s, haul('d', { bosses: ['evilOracle'] }));
    expect(s.story).toMatchObject({ evil: true, wife: 'home' });
    expect(s.rescued).toContain('princess');
  });



  it('never strands the wife as a pilgrim, nor rescues her with everyone', () => {
    expect(rescue(freshHub(), 'all').rescued).not.toContain('princess');
  });
});

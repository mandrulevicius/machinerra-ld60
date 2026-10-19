import { beforeEach, describe, expect, it } from 'vitest';
import { Conversation, DONE, type Flags, type Talk } from './dialog';
import { count } from './lines';
import { jobFor } from './repeats';
import { payJob } from './questpay';
import { cleanReturn } from './carry';
import { princessFacts, princessSave } from './princessslice';
import { freshPrincess } from './princess';
import { SCRIPTS } from './talk';
import type { HubState } from './state';

const talkAt = (step?: number, flags: Flags = {}): Talk => ({ flags: { 'seen.princess.hello': 1, 'princess.brush': 1, ...flags }, quests: step ? { 'princess.story': step } : {} });
/** Talk to her with these facts until the lines run out; what came out and the talk after. */
const talk = (t: Talk, facts: Flags) => {
  const c = new Conversation('princess', SCRIPTS.princess, t, { wife: 1, ...facts });
  let guard = 0;
  while (c.phase === 'line' && guard++ < 40) c.next();
  return c;
};
const story = (bosses: string[], wife: HubState['story']['wife'] = 'home') => ({ story: { bosses, ghost: false, evil: false, wife } });

beforeEach(() => princessSave.set(freshPrincess()));

describe('her line, Dock Found (P58 C)', () => {
  it('her gift comes first: the Main Brush, once', () => {
    const c = talk({ flags: {}, quests: {} }, {});
    expect(c.out).toContainEqual({ kind: 'give', reward: { item: 'mainBrush' } });
    expect(c.talk.flags['princess.brush']).toBe(1);
    expect(talk(c.talk, {}).out.some((o) => o.kind === 'give')).toBe(false);
  });

  it('1: something from every land opened, brought home while she is home', () => {
    princessSave.set({ ...freshPrincess(), catalogue: ['desert', 'jungle'] });
    expect(princessFacts(story(['hornet', 'gorilla']))).toMatchObject({ catalogued: 2, catalogueDone: 0 });
    expect(princessFacts(story(['hornet']))).toMatchObject({ catalogueDone: 1 });
    const open = princessFacts(story(['hornet', 'gorilla']));
    expect(open.catalogueDone).toBe(0);
    expect(talk(talkAt(1), { ...open, 'goal.princess.story': open.catalogueDone }).talk.quests['princess.story']).toBe(1);
    expect(talk(talkAt(1), { 'goal.princess.story': 1 }).talk.quests['princess.story']).toBe(2);
  });

  it('2: a clean return is every robot home and none down on the way', () => {
    const h = (went: string[], home: string[], downed = 0) => ({ id: 'x', parts: {}, went, robots: home.map((uid) => ({ name: uid, role: 'gatherer', uid })), carry: { loadout: { weapons: [], weapon: 'shovel', secondary: null, support: [] }, stats: { downed } } }) as never;
    expect(cleanReturn(h(['a', 'b'], ['a', 'b']))).toBe(1);
    expect(cleanReturn(h(['a', 'b'], ['a']))).toBe(0);
    expect(cleanReturn(h(['a', 'b'], ['a', 'b'], 1))).toBe(0);
    expect(cleanReturn(h([], []))).toBe(0);
    const p = count({}, talkAt(2), { clean: 1 }, 'desert');
    expect(p['princess.story']).toEqual({ step: 2, n: 1 });
  });

  it('3: after the Ether, at her dock at night: the scene, her name, and the line is done', () => {
    expect(talk(talkAt(3), { atDock: 1, 'goal.princess.story': 1 }).talk.quests['princess.story']).toBe(3); // not open before the Evil Oracle falls
    const c = new Conversation('princess', SCRIPTS.princess, talkAt(3), { wife: 1, evil: 1, atDock: 1, 'goal.princess.story': 1 });
    const said: string[] = [];
    let guard = 0;
    while (c.phase === 'line' && guard++ < 40) (said.push(c.line!.t), c.next());
    expect(said.join(' ')).toMatch(/Princess Ada Dorothea/);
    expect(said).toContain('You may call me Dot. You already do.');
    expect(c.talk.quests['princess.story']).toBe(DONE);
  });
});

describe('her repeatable (P58 C)', () => {
  const land = { biome: 'jungle' as const, seed: 1, tier: 1, foes: ['boar' as never] };
  it('only on a land not landed on in the last three trips; it doubles her next sweepings', () => {
    const jobs = (recent: string[]) => Array.from({ length: 40 }, (_, seed) => jobFor({ ...land, seed }, ['princess'], recent as never)).filter(Boolean);
    expect(jobs(['desert', 'city']).length).toBe(40);
    expect(jobs(['jungle', 'city']).length).toBe(0);
    const job = jobs([])[0]!;
    expect(job.goal).toEqual({ stat: 'home', mode: 'atLeast', n: 1 });
    payJob(job, 's');
    expect(princessSave.get().double).toBe(true);
  });
});

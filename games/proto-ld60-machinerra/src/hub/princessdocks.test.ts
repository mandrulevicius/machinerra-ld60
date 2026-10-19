/**
 * P58 H, the Princess's ladder (the Docks): the five steps in biome order, each paying its perk, the title at the end; the sweepings her
 * perks shape; when a land is asked for a dock; the rings in her dock.
 */
import { describe, expect, it } from 'vitest';
import { generateReal } from '../sim/testkit';
import { DOCK } from '../sim/defs';
import { Conversation, DONE, freshTalk, type Flags, type Talk } from './dialog';
import { LINES, count, have } from './lines';
import { DOCK_BIOMES, fitted } from './princessdocks';
import { SWEEP, freshPrincess, homecoming, sweepings, type Homecoming } from './princess';
import { dockWanted } from './questplaces';
import { freshHub, PERKS, type HubState } from './state';
import { SCRIPTS } from './talk';
import { TITLES, earn, freshTitles, titleStat } from './titles';

const at = (quests: Record<string, number>, flags: Record<string, number> = {}): Talk => ({ ...freshTalk(), quests, flags });
const hubWith = (f: Partial<HubState> = {}): HubState => ({ ...freshHub(), ...f });
const home = hubWith({ story: { ...freshHub().story, wife: 'home' } as HubState['story'] });
const line = LINES.princess;

function talkTo(talk: Talk, facts: Flags, ...picks: string[]) {
  const c = new Conversation('princess', SCRIPTS.princess, talk, { wife: 1, ...facts });
  const said: string[] = [];
  let n = 0;
  while (c.phase !== 'end' && n++ < 80) {
    if (c.phase === 'line') {
      said.push(c.line!.t);
      c.next();
    } else {
      const i = c.choices.findIndex((x) => x.text === picks.shift());
      c.pick(i < 0 ? c.choices.length - 1 : i);
    }
  }
  return { talk: c.talk, out: c.out, said };
}

describe('her ladder: the Docks', () => {
  it('five steps in biome order, one dock each, four perks and the title (its own, at the end)', () => {
    expect(line.steps.map((s) => ('biome' in s.goal ? s.goal.biome : null))).toEqual([...DOCK_BIOMES]);
    expect(DOCK_BIOMES).toEqual(['desert', 'jungle', 'city', 'mountains', 'demon']);
    for (const s of line.steps) expect(s.goal).toMatchObject({ count: 'docks', n: 1 });
    expect(line.steps.map((s) => s.reward.perk)).toEqual(['sandBearings', 'mossBrush', 'receipts', 'frostContacts', undefined]);
    for (const s of line.steps) if (s.reward.perk) expect(PERKS[s.reward.perk as keyof typeof PERKS]).toBeDefined();
    expect(line.grants).toBe('keeperOfDocks');
    expect(TITLES.keeperOfDocks.name).toBe('Keeper of Docks');
    expect(line.steps[4].reward).toEqual({}); // the title alone
  });

  it('a mission counts only its step\'s dock, in its biome, once the ladder is taken up', () => {
    const t = at({ princess: 1 });
    let p = count({}, t, { docks: 1 }, 'jungle');
    expect(have('princess', t, p, {})).toBe(0);
    p = count(p, t, { docks: 1 }, 'desert');
    expect(have('princess', t, p, {})).toBe(1);
    expect(count({}, freshTalk(), { docks: 1 }, 'desert')).toEqual({});
    expect(have('princess', at({ princess: 2 }), p, {})).toBe(0); // the next step starts from nothing
  });

  it('asked about, it begins; handed in, each step pays its perk, her line for that dock, and opens the next', () => {
    const asked = talkTo(freshTalk(), {}, 'Do you want anything from the sands, Dot?');
    expect(asked.talk.quests.princess).toBe(1);
    expect(asked.said.join(' ')).toMatch(/dock/i);
    let talk = asked.talk;
    for (let i = 0; i < 4; i++) {
      const r = talkTo(talk, { 'goal.princess': 1 });
      expect(r.out).toContainEqual({ kind: 'give', reward: { perk: line.steps[i].reward.perk } });
      expect(r.talk.quests.princess).toBe(i + 2);
      expect(r.said.length).toBeGreaterThan(1);
      talk = r.talk;
    }
    const last = talkTo(talk, { 'goal.princess': 1 });
    expect(last.talk.quests.princess).toBe(DONE);
    expect(last.said.join(' ')).toMatch(/Keeper of Docks/);
  });

  it('a land is asked for a dock only while she is home and the step is that biome\'s', () => {
    const t1 = at({ princess: 1 }), t2 = at({ princess: 2 });
    expect(dockWanted('desert', home, t1)).toBe(true);
    expect(dockWanted('jungle', home, t1)).toBe(false);
    expect(dockWanted('jungle', home, t2)).toBe(true);
    expect(dockWanted('desert', home, freshTalk())).toBe(false); // not taken up
    expect(dockWanted('desert', home, at({ princess: DONE }))).toBe(false);
    expect(dockWanted('desert', hubWith({ story: { ...freshHub().story, wife: 'stolen' } as HubState['story'] }), t1)).toBe(false);
  });

  it('the generator adds one small dock, only where asked, to a land that is otherwise the same (the 1-in-3 roll: princessdocks.slow.test.ts)', () => {
    const ask = (b: string) => ({ questActive: (s: string) => s === `dock.${b}`, had: () => false });
    const make = (seed: number, present: ReturnType<typeof ask>) => generateReal(seed, undefined, undefined, 'desert', present); // a land takes ~0.25 s: few
    let seed = 0, with_ = make(++seed, ask('desert'));
    while (!with_.ruins.some((r) => r.kind === 'dock') && seed < 40) with_ = make(++seed, ask('desert'));
    expect(with_.ruins.filter((r) => r.kind === 'dock')).toHaveLength(1);
    expect(with_.ruinSizes![with_.ruins.findIndex((r) => r.kind === 'dock')]).toBe('small');
    const without = make(seed, ask('jungle')); // the jungle's step asks: no dock on the desert
    expect(without.ruins.some((r) => r.kind === 'dock')).toBe(false);
    expect(with_.ruins.filter((r) => r.kind !== 'dock')).toEqual(without.ruins);
    expect(with_.seeps).toEqual(without.seeps);
    expect(with_.nests).toEqual(without.nests);
    expect(make(seed, { questActive: () => false, had: () => false }).ruins).toEqual(without.ruins);
  });
});

describe('her perks at home', () => {
  const piles = (perks: string[], n = 600) => Array.from({ length: n }, (_, i) => sweepings('city', `s${i}`, false, perks));
  const partsOf = (p: ReturnType<typeof sweepings>) => Object.values(p.parts).reduce((a, n) => a + (n ?? 0), 0);

  it('Sand in the bearings: one more thing in every pile', () => {
    for (let i = 0; i < 20; i++) {
      const a = sweepings('desert', `x${i}`), b = sweepings('desert', `x${i}`, false, ['sandBearings']);
      expect(partsOf(b)).toBe(partsOf(a) + SWEEP.more);
      expect(b.scrap).toBe(a.scrap);
    }
  });

  it('Frost on the contacts: the relic chance doubles', () => {
    const base = piles([]).filter((p) => p.junk.length).length, frost = piles(['frostContacts']).filter((p) => p.junk.length).length;
    expect(base).toBeGreaterThan(0);
    expect(frost).toBeGreaterThan(base * 1.5);
    expect(frost).toBeLessThan(base * 2.6);
    // The same seeds: the relics found without the perk are found with it.
    for (let i = 0; i < 600; i++) if (sweepings('city', `s${i}`).junk.length) expect(sweepings('city', `s${i}`, false, ['frostContacts']).junk.length).toBeGreaterThan(0);
  });

  it('a homecoming leaves the pile her perks shape', () => {
    const h: Homecoming = { was: 'home', now: 'home', biome: 'desert', crew: [], id: 'h1', brought: true };
    const plain = homecoming(freshPrincess(), h).pile!, perked = homecoming(freshPrincess(), { ...h, perks: ['sandBearings'] }).pile!;
    expect(partsOf(perked)).toBe(partsOf(plain) + SWEEP.more);
  });

  it('a ring in her dock for each dock fitted', () => {
    expect(fitted(freshTalk())).toBe(0);
    expect(fitted(at({ princess: 1 }))).toBe(0);
    expect(fitted(at({ princess: 3 }))).toBe(2);
    expect(fitted(at({ princess: DONE }))).toBe(5);
  });

  it('Keeper of Docks is a title on the Communicator: one oil a second', () => {
    const t = earn(freshTitles(), 'keeperOfDocks');
    expect(titleStat(t, 'comm', 'dockRegen')).toBe(DOCK.regen);
    expect(titleStat(freshTitles(), 'comm', 'dockRegen')).toBe(0);
  });
});

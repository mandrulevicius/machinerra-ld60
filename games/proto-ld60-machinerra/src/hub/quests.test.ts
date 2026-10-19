import { describe, expect, it } from 'vitest';
import { ITEMS } from '../sim/gear';
import { actFacts, standing } from './acts';
import { Conversation, DONE, freshTalk, type Flags, type Talk } from './dialog';
import { bookAfter } from './carry';
import { buyBoon, offered } from './specials';
import { LINES, PART_FILTERS, activeLines, count, handKey, have, isOpen } from './lines';
import { freshBook } from './questbook';
import { questFacts } from './questfacts';
import { cardOf, offerFor } from './research';
import { freshHub, PERKS, build, rescue, type HubState } from './state';
import { STORY_LINES } from './storylines';
import { QUESTS, SCRIPTS, giveReward } from './talk';
import { TITLES } from './titles';
import { freshGear } from '../sim/gear';

const at = (quests: Record<string, number>): Talk => ({ ...freshTalk(), quests });
const hubWith = (f: Partial<HubState> = {}): HubState => ({ ...freshHub(), ...f });

describe('the story lines (P38)', () => {
  it('pay in things the game has: items, cards, perks, titles', () => {
    for (const [id, l] of Object.entries(STORY_LINES)) {
      expect(l.kind, id).toBe('story');
      expect(QUESTS[id], id).toBeDefined();
      if (l.grants) expect(TITLES[l.grants], l.grants).toBeDefined();
      for (const s of l.steps) {
        if (s.reward.item) expect(ITEMS[s.reward.item as keyof typeof ITEMS], s.reward.item).toBeDefined();
        if (s.reward.card) expect(cardOf(s.reward.card), s.reward.card).toBeDefined();
        if (s.reward.perk) expect(PERKS[s.reward.perk as keyof typeof PERKS], s.reward.perk).toBeDefined();
      }
    }
  });

  it('every NPC with a ladder or none has a story line, and a station NPC takes it up beside the ladder', () => {
    expect(Object.values(STORY_LINES).map((l) => l.npc).sort()).toEqual(['cityPlanner', 'expeditioner', 'gasket', 'highPriest', 'hob', 'kicker', 'princess', 'sprocket', 'trader']);
    expect(Object.keys(LINES)).toContain('kicker');
    expect(Object.keys(LINES)).toContain('kicker.story');
  });
});

describe('the acts as facts', () => {
  it('open one after the other: two robots home, the Queen down, two stations and a building, the Harbinger down, three fragments', () => {
    const f = (s: HubState, b = freshBook()) => actFacts(s, b);
    expect(f(hubWith())['act.1.open']).toBe(0);
    expect(f(hubWith({ missions: 1 }))['act.1.open']).toBe(1);
    expect(f(hubWith({ missions: 1 }))['act.2.open']).toBe(0);
    const two = { ...freshBook(), savedBest: 2 };
    expect(f(hubWith({ missions: 1 }), two)).toMatchObject({ 'act.1.done': 1, 'act.2.open': 1, 'act.2.done': 0 });
    const queen = hubWith({ missions: 2, story: { bosses: ['hornet'], ghost: false, evil: false, wife: 'none' } });
    expect(f(queen, two)).toMatchObject({ 'act.2.done': 1, 'act.3.open': 1, 'act.3.done': 0 });
    let s = rescue(rescue(queen, 'sprocket'), 'hob');
    s = build(s, 'hob', 'slot-2'); // Sprocket's station is the workbench, already standing
    expect(standing(s)).toEqual({ stations: 2, buildings: 0 });
    expect(f(s, two)['act.3.done']).toBe(0); // no building yet
    s = build(s, 'home', 'slot-3');
    expect(standing(s)).toEqual({ stations: 2, buildings: 1 });
    expect(f(s, two)).toMatchObject({ 'act.3.done': 1, 'act.4.open': 1, 'act.4.done': 0 });
    const down = { ...s, story: { ...s.story, bosses: ['hornet', 'drone'], wife: 'stolen' as const } };
    expect(f(down, { ...two, frags: ['mast:desert', 'mast:jungle'] })).toMatchObject({ 'act.4.done': 1, 'act.5.open': 1, 'act.5.done': 0 });
    expect(f(down, { ...two, frags: ['a', 'b', 'c'] })['act.5.done']).toBe(1);
  });
});

describe('goals', () => {
  it('a step that is not open yet counts nothing; once it is, the next mission counts', () => {
    const t = at({ 'kicker.story': 2 });
    const closed = count({}, t, { botBossKicks: 1 }, 'desert', { 'act.4.open': 0 });
    expect(have('kicker.story', t, closed, {})).toBe(0);
    const open = count({}, t, { botBossKicks: 1 }, 'desert', { 'act.4.open': 1 });
    expect(have('kicker.story', t, open, {})).toBe(1);
    expect(isOpen(LINES['kicker.story'].steps[1], t, { 'act.4.open': 1 })).toBe(true);
  });

  it('count a stat in any biome, take the best of one mission, read a hub fact, read the stores for a hand-in', () => {
    const hob = at({ 'hob.story': 1 });
    expect(have('hob.story', hob, count({}, hob, { gunKills: 9 }, 'jungle'), {})).toBe(9);
    const sp = at({ 'sprocket.story': 3 });
    expect(have('sprocket.story', sp, count({}, sp, { saved: 3 }, 'desert', { 'act.1.done': 1 }), {})).toBe(3);
    expect(have('sprocket.story', sp, count(count({}, sp, { saved: 3 }, 'desert', { 'act.1.done': 1 }), sp, { saved: 2 }, 'desert', { 'act.1.done': 1 }), {})).toBe(3); // the best, not the sum
    const gas = at({ 'gasket.story': 3 });
    expect(have('gasket.story', gas, {}, { augments: 4 })).toBe(4);
    const g = at({ 'gasket.story': 1 });
    expect(have('gasket.story', g, {}, { [handKey({ hand: 'parts', only: 'wings' })]: 2 })).toBe(2);
  });

  it('the stores\' filters: different kinds, wings, elite arms; a unique is never counted', () => {
    const s = hubWith({ parts: { 'hornet-head': 3, 'hornet-wings': 2, 'swarmer-wing': 1, 'hornet-stinger': 1, 'drone-optics': 2, 'queens-crown': 1 } });
    const f = questFacts(s, { book: freshBook(), roster: { bots: [] }, gear: freshGear(), copper: 0 });
    expect(f['parts.kinds']).toBe(5);
    expect(f['parts.wings']).toBe(3);
    expect(f['parts.eliteArms']).toBe(1);
    expect(PART_FILTERS.kinds('queens-crown')).toBe(false);
  });

  it('a hand-in takes one each of the n different kinds (the most plentiful first), or the filtered parts', () => {
    const s = hubWith({ parts: { 'hornet-head': 3, 'hornet-wings': 2, 'swarmer-wing': 1, 'hornet-stinger': 1, 'drone-optics': 2 } });
    const four = giveReward(s, { take: { parts: 4, only: 'kinds' } });
    expect(four.parts).toEqual({ 'hornet-head': 2, 'hornet-wings': 1, 'swarmer-wing': 0, 'hornet-stinger': 1, 'drone-optics': 1 });
    const wings = giveReward(s, { take: { parts: 2, only: 'wings' } });
    expect(wings.parts['hornet-wings']).toBe(0);
    expect(wings.parts['swarmer-wing']).toBe(1);
    expect(wings.parts['hornet-head']).toBe(3);
  });

  it('the fact reads: specialised robots, body slots fitted', () => {
    const g = freshGear();
    const f = questFacts(hubWith(), { book: freshBook(), roster: { bots: [{ uid: 'r1', name: 'A', role: 'guard', rank: 1, wreck: false, spec: 'bulwark' }, { uid: 'r2', name: 'B', role: 'guard', rank: 0, wreck: false }] }, gear: g, copper: 0 });
    expect(f.specialised).toBe(1);
    expect(f.augments).toBe(0);
  });
});

describe('the story lines in the dialog', () => {
  function talkTo(npc: string, talk: Talk, facts: Flags, ...picks: string[]) {
    const c = new Conversation(npc, SCRIPTS[npc], talk, facts);
    const said: string[] = [];
    let n = 0;
    while (c.phase !== 'end' && n++ < 80) {
      if (c.phase === 'line') {
        said.push(c.line!.t);
        c.next();
      } else {
        const want = picks.shift();
        const i = c.choices.findIndex((x) => x.text === want);
        c.pick(i < 0 ? c.choices.length - 1 : i);
      }
    }
    return { talk: c.talk, out: c.out, said };
  }

  it('is taken up with its own lever, beside the ladder', () => {
    const r = talkTo('hob', freshTalk(), { built: 1 }, 'ANY WORK THAT NEEDS A BARREL?');
    expect(r.talk.quests['hob.story']).toBe(1);
    expect(r.talk.quests.hob).toBeUndefined();
    expect(r.said.join(' ')).toMatch(/GUNS are for staying out of them/);
  });

  it('hands in a met step and leads on: a step still closed says what is missing, an open one is offered', () => {
    const met = { built: 1, 'goal.hob.story': 25 };
    const closed = talkTo('hob', at({ 'hob.story': 1 }), met);
    expect(closed.talk.quests['hob.story']).toBe(2);
    expect(closed.out).toContainEqual({ kind: 'give', reward: { item: 'rivetScatter' } });
    expect(closed.said.join(' ')).toMatch(/TWO BOTS OUT AND TWO HOME/);
    const open = talkTo('hob', at({ 'hob.story': 1 }), { ...met, 'act.2.open': 1 });
    expect(open.said.join(' ')).toMatch(/Elite arms/);
  });

  it('offers a step once when it opens later, then is quiet', () => {
    const facts = { built: 1, 'act.2.open': 1 };
    const first = talkTo('hob', at({ 'hob.story': 2 }), facts);
    expect(first.said.join(' ')).toMatch(/Elite arms/);
    const again = talkTo('hob', first.talk, facts);
    expect(again.said.join(' ')).not.toMatch(/Elite arms/);
  });

  it('asking about a step that is not open says so', () => {
    const r = talkTo('sprocket', at({ 'sprocket.story': 2 }), { built: 1 }, "About “Mother Sprocket's Patterns”");
    expect(r.said.join(' ')).toMatch(/Not yet, dear/);
  });

  it('a hand-in of different kinds takes the parts, and finishing the last step ends the line', () => {
    const r = talkTo('sprocket', at({ 'sprocket.story': 2 }), { built: 1, 'act.1.open': 1, 'goal.sprocket.story': 4 });
    expect(r.out).toContainEqual({ kind: 'give', reward: { boost: 'auto', take: { parts: 4, only: 'kinds' } } });
    expect(r.talk.quests['sprocket.story']).toBe(3);
    const last = talkTo('sprocket', at({ 'sprocket.story': 3 }), { built: 1, 'act.1.done': 1, 'goal.sprocket.story': 5 });
    expect(last.talk.quests['sprocket.story']).toBe(DONE);
  });

  it('the Oracle takes up hers without a station, once the first return is home', () => {
    const none = talkTo('highPriest', freshTalk(), {}, 'Is there anything the church needs, Oracle?');
    expect(none.talk.quests['highPriest.story']).toBeUndefined();
    const r = talkTo('highPriest', at({ main: 1 }), { 'act.1.open': 1 }, 'Is there anything the church needs, Oracle?');
    expect(r.talk.quests['highPriest.story']).toBe(1);
  });

  it('the log\'s active lines list the story steps, a closed one as not yet', () => {
    const t = at({ 'hob.story': 2, 'sprocket.story': 1 });
    const lines = activeLines(t, {}, { 'goal.sprocket.story': 0 });
    expect(lines.find((l) => l.id === 'hob.story')!.text).toMatch(/not yet/);
    expect(lines.find((l) => l.id === 'hob.story')!.ready).toBe(false);
  });
});

describe('act 5 and the Oracle ending', () => {
  it('the book takes what a mission hands home: the best lift, advice heeded and ignored, fragments by land', () => {
    const b = bookAfter({ ...freshBook(), savedBest: 3, ignored: 2 }, { saved: 2, obeyed: 1, ignored: 2, 'frag.mast': 1 }, 'jungle');
    expect(b).toMatchObject({ savedBest: 3, obeyed: 1, ignored: 4, frags: ['mast:jungle'] });
    const twice = bookAfter(b, { 'frag.mast': 1, 'frag.oil': 1, 'drank.starOil': 1 }, 'jungle');
    expect(twice.frags).toEqual(['mast:jungle', 'oil:jungle']);
    expect(twice.oilTrips).toBe(1);
  });

  it('act 5 waits for the wife to be taken', () => {
    const s = hubWith({ missions: 3, stations: { a: 'slot-1', b: 'slot-2' }, story: { bosses: ['hornet', 'drone'], ghost: false, evil: false, wife: 'home' } });
    const book = { ...freshBook(), savedBest: 2 };
    expect(actFacts(s, book)['act.4.done']).toBe(1);
    expect(actFacts(s, book)['act.5.open']).toBe(0);
    expect(actFacts({ ...s, story: { ...s.story, wife: 'stolen' } }, book)['act.5.open']).toBe(1);
  });

  it('three fragments and the Oracle ends the line: the title, three levers, the dock', () => {
    const c = new Conversation('highPriest', SCRIPTS.highPriest, freshTalk(), { 'act.5.done': 1 });
    expect(c.phase).toBe('line');
    let said = '';
    let guard = 0;
    while (c.phase === 'line' && guard++ < 20) {
      said += c.line!.t + ' ';
      c.next();
    }
    expect(said).toMatch(/Far Shore/);
    expect(c.out).toContainEqual({ kind: 'give', reward: { title: 'farShore' } });
    expect(c.choices.map((x) => x.text)).toHaveLength(3);
    c.pick(0);
    expect(c.talk.flags['ending.defiant']).toBe(1);
  });

  it('the Oracle says how often she has been ignored', () => {
    const c = new Conversation('highPriest', SCRIPTS.highPriest, at({ 'highPriest.story': 3 }), { 'act.4.done': 1, adviceIgnored: 7 });
    let said = '';
    let guard = 0;
    while (c.phase !== 'end' && guard++ < 30) {
      if (c.phase === 'line') {
        said += c.line!.t + ' ';
        c.next();
      } else break;
    }
    expect(said).toMatch(/suggested it 7 times/);
  });
});

describe('the Trader specials', () => {
  it('biscuits once her first step is done; star oil every other lift after the second, every lift after the third', () => {
    expect(offered(at({ 'trader.story': 1 }), 0)).toEqual([]);
    expect(offered(at({ 'trader.story': 2 }), 3)).toEqual(['biscuits']);
    expect(offered(at({ 'trader.story': 3 }), 4)).toEqual(['biscuits', 'starOil']);
    expect(offered(at({ 'trader.story': 3 }), 5)).toEqual(['biscuits']);
    expect(offered(at({ 'trader.story': DONE }), 5)).toEqual(['biscuits', 'starOil']);
  });

  it('is bought with scrap into the pack, and spent by the mission that used it', () => {
    const r = buyBoon(freshBook(), 100, 'starOil');
    expect(r.scrap).toBe(10);
    expect(r.book.pack.starOil).toBe(1);
    expect(() => buyBoon(freshBook(), 10, 'starOil')).toThrow(/costs 90/);
    expect(buyBoon(freshBook(), 100, 'starOil', true).price).toBe(81);
    const after = bookAfter({ ...r.book, pack: { starOil: 2, biscuits: 1 } }, { 'drank.starOil': 1, 'ate.biscuits': 1, 'frag.oil': 1 }, 'desert');
    expect(after.pack).toEqual({ starOil: 1, biscuits: 0 });
    expect(after.frags).toEqual(['oil:desert']);
    expect(after.oilTrips).toBe(1);
  });
});

describe('what P36 left for the hub: the First Scripture', () => {
  it('while its sign hangs in the church the Oracle offers one more card', () => {
    const ctx = { types: [], dog: false };
    const r = { owned: [], fit: {}, credit: 1, seen: null, offer: [] };
    expect(offerFor(r, ctx, 'a')).toHaveLength(3);
    expect(offerFor(r, { ...ctx, more: 1 }, 'a')).toHaveLength(4);
  });

  it('the sign home hangs it, and reading it earns the title', () => {
    expect(bookAfter(freshBook(), { signHome: 1 }, 'desert').signHung).toBe(true);
    expect(bookAfter({ ...freshBook(), signHung: true }, {}, 'desert').signHung).toBe(true);
    expect(TITLES.pilgrimOfTheSign.source.effects[0]).toMatchObject({ when: 'aura' });
  });
});

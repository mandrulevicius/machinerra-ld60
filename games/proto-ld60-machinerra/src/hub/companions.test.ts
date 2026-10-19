/**
 * P42 at home: what brings the dog and the cat aboard and what they pay, the quest-only places (when a land has one), the buildings
 * a quest unlocks, the special lines and the new steps of the Expeditioner's and the Planner's lines (a copper hand-in, a chart).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { BIOMES, CAT, type BiomeId } from '../sim/defs';
import { PLACE_IDS, isPresent, type PlaceId } from '../sim/places';
import { rng } from '../../../../harness/kit/rng';
import { BUILDINGS, BUILDING_IDS, GATE, OFFERED, cityFx, offer } from './buildings';
import { catHome, catLine, companionsAfter, hasCat, hasDog } from './companions';
import { Conversation, DONE, freshTalk, type Flags, type Talk } from './dialog';
import { settleScrap, freshEconomy } from './economy';
import { LINES, autoStart, have } from './lines';
import { freshBook } from './questbook';
import { QUEST_PLACES, stepActive } from './questplaces';
import { hub } from './save';
import { DOG_NAMES, SPECIAL_LINES, dogNameOf } from './speciallines';
import { freshHub, haulFrom, PERKS, type HubState } from './state';
import { Sim } from '../sim/sim';
import { land } from './carry';
import { economy } from './economy';
import { STORY_LINES } from './storylines';
import { QUESTS, SCRIPTS, giveReward } from './talk';
import { TITLES } from './titles';

beforeEach(() => hub.reset());

const hubWith = (f: Partial<HubState> = {}): HubState => ({ ...freshHub(), ...f });
const at = (quests: Record<string, number>, flags: Record<string, number> = {}): Talk => ({ ...freshTalk(), quests, flags });

describe('the companions come home', () => {
  it('the dog freed and on the lift is his, once; the stray tamed is the cat; neither without the stat', () => {
    const s = hubWith();
    const none = companionsAfter(s, freshBook(), {});
    expect(none.hub).toBe(s);
    expect(none.news).toEqual([]);
    const dog = companionsAfter(s, freshBook(), { dogHome: 1 });
    expect(hasDog(dog.hub)).toBe(true);
    expect(hasCat(dog.hub)).toBe(false);
    expect(dog.news[0]).toMatch(/dog is yours/);
    const both = companionsAfter(dog.hub, freshBook(), { dogHome: 1, catTamed: 1 });
    expect(hasCat(both.hub)).toBe(true);
    expect(both.hub.perks.filter((p) => p === 'companionDog')).toHaveLength(1);
    expect(companionsAfter(both.hub, freshBook(), { dogHome: 1, catTamed: 1 }).news).toEqual([]);
  });

  it('the cat leaves CAT.home scrap with a return, nothing without it', () => {
    expect(catHome(hubWith())).toBe(0);
    expect(catHome(hubWith({ perks: ['companionCat'] }))).toBe(CAT.home);
    expect(CAT.home).toBe(5); // Minos
  });

  it('the boot and the toy go in the quest book as items, once', () => {
    const r = companionsAfter(hubWith(), freshBook(), { 'got.boot': 1, 'got.toy': 1 });
    expect(r.book.items).toEqual(['boot', 'toy']);
    expect(r.news).toHaveLength(2);
    expect(companionsAfter(hubWith(), r.book, { 'got.boot': 1 }).book).toBe(r.book);
  });

  it('with the Replicator and the cat, the church\'s cats are counted each return (2, 5, 11 ... too many)', () => {
    const s = hubWith({ perks: ['companionCat'], buildings: { built: ['replicator'], raising: [], pickedAt: -1 } });
    let book = freshBook();
    const said: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = companionsAfter(s, book, {});
      book = r.book;
      said.push(r.news.at(-1)!);
    }
    expect(book.cats).toBe(8);
    expect(said[0]).toMatch(/2 cats/);
    expect(said[1]).toMatch(/5 cats/);
    expect(said[5]).toMatch(/too many/);
    expect(said[7]).toBe(`The Oracle: "${catLine(8)}"`);
    // No Replicator: no count.
    expect(companionsAfter(hubWith({ perks: ['companionCat'] }), freshBook(), {}).book.cats).toBe(0);
  });

  it('the Replicator\'s scrap a kill reads the cat, in the mission\'s city effects', () => {
    expect(cityFx(['replicator'], { cat: true }).scrapKill).toBe(CAT.kill);
    expect(cityFx(['replicator']).scrapKill).toBe(0);
    expect(cityFx([], { cat: true }).scrapKill).toBe(0);
  });

  it('the dog\'s name is the lever the Oracle was given', () => {
    expect(dogNameOf({})).toBe('The dog');
    for (const [id, name] of Object.entries(DOG_NAMES)) expect(dogNameOf({ [`dogName.${id}`]: 1 })).toBe(name);
  });
});

describe('a lift that brings them home', () => {
  const mission = (id: string, stats: Record<string, number> = {}) => {
    const s = new Sim(3, [], 'desert');
    s.bots = [s.controller];
    Object.assign(s.stats, stats);
    s.finish();
    return haulFrom(s, id);
  };
  const scrapAfter = (haul: ReturnType<typeof mission>) => {
    const before = economy.get().scrap;
    land(hub.get(), haul);
    return economy.get().scrap - before;
  };

  it('the dog and the stray come aboard, the cat pays on the return it comes home and on every one after', () => {
    const plain = scrapAfter(mission('a'));
    expect(hasCat(hub.get())).toBe(false);
    expect(scrapAfter(mission('b', { catTamed: 1, dogHome: 1 }))).toBe(plain + CAT.home);
    expect(hasCat(hub.get()) && hasDog(hub.get())).toBe(true);
    expect(scrapAfter(mission('c'))).toBe(plain + CAT.home);
  });
});

describe('both survive a save', () => {
  it('the perks, the book\'s items and cat count come back through the file as they went in', () => {
    const s = hubWith({ perks: ['companionDog', 'companionCat', 'dogNose'] });
    const back = JSON.parse(JSON.stringify(hub.set(s))) as HubState;
    expect(hub.get().perks).toEqual(s.perks);
    expect(back.perks).toEqual(['companionDog', 'companionCat', 'dogNose']);
    for (const p of s.perks) expect(PERKS[p as keyof typeof PERKS], p).toBeDefined();
  });
});

describe('the quest-only places', () => {
  const quest = (open: string[]): { questActive(id: string): boolean; had(): boolean } => ({ questActive: (id) => open.includes(id), had: () => false });
  /** How many of the first `n` seeds the presence rule lets the place into (the rule alone: no land is made). */
  const rolls = (open: string[], id: PlaceId, n: number) => {
    let c = 0;
    for (let seed = 1; seed <= n; seed++) if (isPresent(id, rng(`p/${seed}`), quest(open))) c++;
    return c;
  };
  const rows: [PlaceId, string, string][] = [
    ['kennel', 'dog.1', 'the dog\'s first step'],
    ['stray', 'cat.1', 'the cat\'s first step'],
    ['mounds', 'dog.dig', 'the dog\'s dig'],
    ['compactor', 'shoot.1', 'the Shoot\'s first step'],
    ['cairn', 'expeditioner.story.3', 'the Expeditioner\'s third step'],
  ];

  // The rule alone is tested here; that a land then holds each one is `questplaces.slow.test.ts` (it makes whole lands).
  it('each is in no land until its step is active, and the rule lets it in once it is', () => {
    for (const [id, step, what] of rows) {
      const biome = (Object.keys(BIOMES) as BiomeId[]).find((b) => BIOMES[b].places.includes(id))!;
      expect(biome, `${id} is listed by a biome`).toBeTruthy();
      expect(rolls(['other.1'], id, 8), `${id} for another step`).toBe(0);
      expect(rolls([step], id, 24), `${id} while ${what} is on`).toBeGreaterThan(0);
    }
  });

  it('the Kennel is on some lands, not all (one in three); the mounds on every one', () => {
    const k = rolls(['dog.1'], 'kennel', 60);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(60);
    expect(rolls(['dog.dig'], 'mounds', 20)).toBe(20);
  });

  it('every one of them is a place file, with a quest rule, listed by some biome', () => {
    for (const [id] of rows) expect(PLACE_IDS).toContain(id);
    expect(QUEST_PLACES.sort()).toEqual(rows.map((r) => r[1]).sort());
  });
});

describe('when a quest place is wanted (pure over the saves)', () => {
  const book = freshBook();
  it('dog.1 from the third mission until the dog is his', () => {
    const talk = (n: number) => at(n ? { dog: n } : {});
    expect(stepActive('dog.1', hubWith({ missions: 1 }), book, freshTalk())).toBe(false);
    const auto = autoStart(freshTalk(), { missions: 3 });
    expect(auto.quests.dog).toBe(1);
    expect(stepActive('dog.1', hubWith({ missions: 3 }), book, auto)).toBe(true);
    expect(stepActive('dog.1', hubWith({ missions: 3, perks: ['companionDog'] }), book, auto)).toBe(false);
    expect(stepActive('dog.1', hubWith({ missions: 3 }), book, talk(2))).toBe(false);
  });

  it('dog.dig while the dog is his or its second step is on', () => {
    expect(stepActive('dog.dig', hubWith(), book, freshTalk())).toBe(false);
    expect(stepActive('dog.dig', hubWith({ perks: ['companionDog'] }), book, freshTalk())).toBe(true);
    expect(stepActive('dog.dig', hubWith(), book, at({ dog: 2 }))).toBe(true);
  });

  it('cat.1 and shoot.1 from the second mission, until the cat or the boot is home; the Shoot waits for the Expeditioner aboard', () => {
    const early = autoStart(freshTalk(), { missions: 1, 'aboard.expeditioner': 1 });
    expect(early.quests.cat).toBe(1);
    expect(early.quests.shoot).toBe(1);
    expect(stepActive('cat.1', hubWith({ missions: 1 }), book, early)).toBe(true);
    expect(stepActive('cat.1', hubWith({ missions: 1, perks: ['companionCat'] }), book, early)).toBe(false);
    expect(stepActive('shoot.1', hubWith({ missions: 1, rescued: ['expeditioner'] }), book, early)).toBe(true);
    expect(stepActive('shoot.1', hubWith({ missions: 1 }), book, freshTalk())).toBe(false);
    expect(stepActive('shoot.1', hubWith({ missions: 1, rescued: ['expeditioner'] }), book, freshTalk())).toBe(true);
    expect(stepActive('shoot.1', hubWith({ missions: 1, rescued: ['expeditioner'] }), { ...book, items: ['boot'] }, early)).toBe(false);
    expect(autoStart(freshTalk(), { missions: 1 }).quests.shoot).toBeUndefined();
    // A save that began it before the Expeditioner came aboard, never offered: back to not begun.
    expect(autoStart(early, { missions: 1 }).quests.shoot).toBeUndefined();
  });

  it('the dog\'s line does not start before its mission, nor twice', () => {
    expect(autoStart(freshTalk(), { missions: 1 }).quests.dog).toBeUndefined();
    const t = autoStart(freshTalk(), { missions: 3 });
    expect(autoStart(t, { missions: 3 })).toBe(t);
  });
});

describe('the buildings a quest or a companion unlocks (the gates)', () => {
  const planner = (perks: string[], missions = 3): Parameters<typeof offer>[0] => ({ missions, perks: perks as never, buildings: { built: [], raising: [], pickedAt: -1 } });
  const everOffered = (perks: string[], id: string) => {
    for (let m = 0; m < 80; m++) if (offer(planner(perks, m)).includes(id as never)) return true;
    return false;
  };

  it('each gated building is offered with its perk and never without', () => {
    for (const [id, perk] of Object.entries(GATE)) {
      if (!(id in BUILDINGS)) continue; // a gate set ahead of its building (the Map Room)
      expect(everOffered([], id), `${id} without ${perk}`).toBe(false);
      expect(everOffered([perk], id), `${id} with ${perk}`).toBe(true);
    }
  });

  it('the Replicator waits on the cat; the Greenhouse on the Shoot\'s water; the Tram on the Expeditioner\'s rails; the Grand Aqueduct and the Lamp Foundry on the Planner', () => {
    expect(GATE).toMatchObject({ replicator: 'companionCat', greenhouse: 'greenhousePlans', tram: 'tramPlans', grandAqueduct: 'aqueductPlans', lampFoundry: 'rareBlueprints' });
    for (const perk of Object.values(GATE)) expect(PERKS[perk as keyof typeof PERKS], perk).toBeDefined();
  });

  it('three a visit still, from what is open', () => {
    expect(offer(planner([])).length).toBe(OFFERED);
    expect(BUILDING_IDS.filter((id) => !GATE[id]).length).toBeGreaterThanOrEqual(OFFERED);
  });
});

describe('the special lines', () => {
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

  it('each pays in things the game has: perks, a title, a card, and the title exists', () => {
    for (const [id, l] of Object.entries(SPECIAL_LINES)) {
      expect(LINES[id], id).toBe(l);
      expect(TITLES[l.grants!], l.grants).toBeDefined();
      for (const s of l.steps) if (s.reward.perk) expect(PERKS[s.reward.perk as keyof typeof PERKS], s.reward.perk).toBeDefined();
    }
    expect(SPECIAL_LINES.cat.grants).toBe('catsButler');
    expect(TITLES.catsButler.name).toBe("The Cat's Butler");
  });

  it('the dog\'s first step is offered on the first talk and handed in with the stat, paying the dog\'s perk', () => {
    const first = talkTo('highPriest', at({ dog: 1 }), { 'act.1.open': 1 });
    expect(first.said.join(' ')).toMatch(/GOOD BOY/);
    const done = talkTo('highPriest', at({ dog: 1 }, { 'seen.highPriest.dog.offer1': 1 }), { 'goal.dog': 1 });
    expect(done.out).toContainEqual({ kind: 'give', reward: { perk: 'companionDog' } });
    expect(done.talk.quests.dog).toBe(2);
  });

  it('the dog\'s third step wants the toy (an item fact) and ends the line with the Good Nose card and the title', () => {
    expect(have('dog', at({ dog: 3 }), {}, { 'item.toy': 1 })).toBe(1);
    const done = talkTo('highPriest', at({ dog: 3 }), { 'goal.dog': 1 });
    expect(done.talk.quests.dog).toBe(DONE);
    expect(done.out).toContainEqual({ kind: 'give', reward: { card: 'goodNose' } });
    expect(QUESTS.dog.grants).toBe('goodBoysFriend');
  });

  it('the cat\'s second step is the dinner lever: five scrap a dinner, three dinners; the lever shows only with the scrap', () => {
    const t = at({ cat: 2 });
    const poor = talkTo('highPriest', t, { scrap: 4 }, 'Feed Rumba (5 scrap).');
    expect(poor.talk.flags.catDinners).toBeUndefined();
    const fed = talkTo('highPriest', t, { scrap: 9 }, 'Feed Rumba (5 scrap).');
    expect(fed.talk.flags.catDinners).toBe(1);
    expect(fed.out).toContainEqual({ kind: 'give', reward: { take: { scrap: 5 } } });
    const three = at({ cat: 2 }, { catDinners: 3 });
    expect(have('cat', three, {}, {})).toBe(3);
    const done = talkTo('highPriest', three, { 'goal.cat': 3 });
    expect(done.talk.quests.cat).toBe(3);
  });

  it('the cat\'s last step is the Replicator standing, and ends the line with The Cat\'s Butler', () => {
    const done = talkTo('highPriest', at({ cat: 3 }), { 'goal.cat': 1, replicator: 1 });
    expect(done.talk.quests.cat).toBe(DONE);
    expect(QUESTS.cat.grants).toBe('catsButler');
  });

  it('the Green Shoot is the Expeditioner\'s: the boot comes home, he is given it, the shoot is watered for 30 scrap, and the Greenhouse plans are the pay', () => {
    const steps = SPECIAL_LINES.shoot.steps;
    expect(steps.map((s) => s.reward.perk)).toEqual([undefined, 'shootGrows', 'greenhousePlans']);
    expect(steps[2].goal).toEqual({ hand: 'scrap', n: 30 });
    const give = talkTo('expeditioner', at({ shoot: 2 }), { 'item.boot': 1 }, 'Give the boot to the Expeditioner.');
    expect(give.talk.flags.shootGiven).toBe(1);
  });
});

describe('the Expeditioner\'s and the Planner\'s later steps', () => {
  const ex = STORY_LINES['expeditioner.story'], pl = STORY_LINES['cityPlanner.story'];

  it('three steps each, ending with their titles', () => {
    expect(ex.steps).toHaveLength(3);
    expect(pl.steps).toHaveLength(3);
    expect(ex.grants).toBe('farWalker');
    expect(pl.grants).toBe('architect');
  });

  it('the copper hand-in: the goal reads the copper stock and the dialog takes it', () => {
    for (const line of [ex, pl]) expect(line.steps[1].goal).toMatchObject({ hand: 'copper' });
    expect(ex.steps[1].goal).toEqual({ hand: 'copper', n: 40 });
    expect(pl.steps[1].goal).toEqual({ hand: 'copper', n: 100 });
    const talk = at({ 'expeditioner.story': 2 });
    expect(have('expeditioner.story', talk, {}, { copper: 55 })).toBe(55);
    const c = new Conversation('expeditioner', SCRIPTS.expeditioner, talk, { built: 1, 'act.3.open': 1, 'goal.expeditioner.story': 40 });
    let guard = 0;
    while (c.phase === 'line' && guard++ < 30) c.next();
    expect(c.out).toContainEqual({ kind: 'give', reward: { perk: 'tramPlans', take: { copper: 40 } } });
    expect(c.talk.quests['expeditioner.story']).toBe(3);
  });

  it('the dialog\'s copper payment leaves the economy short of what it took, never below none', () => {
    const e = { ...freshEconomy(), copper: 55, scrap: 9 };
    expect(settleScrap(e, { take: { copper: 40 } })).toMatchObject({ copper: 15, scrap: 9 });
    expect(settleScrap(e, { take: { copper: 100 } }).copper).toBe(0);
  });

  it('the Expeditioner\'s second step waits for act 3 to open; the Planner\'s third for it to be done', () => {
    expect(ex.steps[1].open).toEqual({ has: 'act.3.open' });
    expect(ex.steps[2].open).toEqual({ has: 'act.3.done' });
    expect(pl.steps[2].open).toEqual({ has: 'act.3.done' });
  });

  it('the chart reward charts the first opened lands not charted yet, once each', () => {
    const s = hubWith({ story: { bosses: ['hornet'], ghost: false, evil: false, wife: 'none' } });
    const one = giveReward(s, { chart: 1 });
    expect(one.expedition!.charted).toHaveLength(1);
    const two = giveReward(one, { chart: 1 });
    expect(two.expedition!.charted).toHaveLength(2);
    expect(new Set(two.expedition!.charted).size).toBe(2);
    expect(giveReward(s, {}).expedition).toBe(s.expedition);
  });

  it('a quest-place step shows on the course table only on a land that has it (the cairn: the Expeditioner\'s third)', () => {
    expect(ex.steps[2].place).toBe('cairn');
    expect(SPECIAL_LINES.dog.steps[0].place).toBe('kennel');
    expect(SPECIAL_LINES.cat.steps[0].place).toBe('stray');
    expect(SPECIAL_LINES.shoot.steps[0].place).toBe('compactor');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { Conversation, DONE, freshTalk, type Flags, type Reward, type Talk } from './dialog';
import { BONDS, STEPS, bondFacts, bondOf, bondTalk, freshBonds, giftReward, giftWaiting, handedTo, lightBond, setBond } from './bonds';
import { bondHtml, cogSvg } from './bondview';
import { LINES } from './lines';
import { REPEATS } from './repeats';
import { PERKS, freshHub, haulFrom, type PerkId } from './state';
import { SCRIPTS, giveReward } from './talk';
import { bondSave, questBook, talkSave } from './talkslice';
import { gear, land, landed, loadout } from './carry';
import { Sim } from '../sim/sim';
import { payExtras } from './questpay';
import { freshBook } from './questbook';
import { hub } from './save';
import { researchSave } from './researchslice';
import { fit, FOURTH_SLOT, cleanResearch, freshResearch, autoFit, commKeys } from './research';
import { ITEMS, addItem, cleanGear, commSlots, equip, freshGear, gearMods } from '../sim/gear';
import { BUILDING_IDS, draw, offer } from './buildings';
import { shelf, buy, left, type Stall, freshTrade } from './trade';
import { journal } from './journal';
import { freshTitles } from './titles';

beforeEach(() => hub.reset());

describe('the relationship track: the count', () => {
  it('a hand-in lights the next step, never past five, and an NPC with no track is left alone', () => {
    let b = freshBonds();
    const names: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = lightBond(b, 'kicker');
      if (r.lit) names.push(r.step);
      b = r.bond;
    }
    expect(bondOf(b, 'kicker')).toBe(STEPS);
    expect(names).toEqual(BONDS.kicker.steps);
    expect(lightBond(b, 'nobody').lit).toBe(false);
    expect(bondFacts(b)['bond.kicker']).toBe(5);
    expect(bondFacts(b)['bond.hob']).toBe(0);
    expect(bondOf(setBond(b, 'kicker', 9), 'kicker')).toBe(5);
    expect(bondOf(setBond(b, 'kicker', -2), 'kicker')).toBe(0);
  });

  it('every giver of a line or a repeatable has a track, with five steps and a gift that is a perk', () => {
    for (const l of Object.values(LINES)) expect(BONDS[l.npc], l.title).toBeDefined();
    for (const t of REPEATS) expect(BONDS[t.giver], t.id).toBeDefined();
    for (const [id, b] of Object.entries(BONDS)) {
      expect(b.steps).toHaveLength(STEPS);
      expect(b.greet).toHaveLength(STEPS - 1);
      expect(PERKS[b.gift.perk as PerkId], id).toBeDefined();
    }
  });

  it('a step handed in to a line lights its giver; taking the line up does not', () => {
    expect(handedTo('kicker', 1)).toBeNull(); // the line begun
    expect(handedTo('kicker', 2)).toBe('kicker');
    expect(handedTo('hob.story', DONE)).toBe('hob');
    expect(handedTo('main', 4)).toBeNull(); // the main quest is not a line
    expect(handedTo('princess.story', 2)).toBe('princess');
  });

  it('a step handed in at the giver, through their own dialog, is what lights the track', () => {
    const step = LINES.kicker.steps[0];
    const talk: Talk = { ...freshTalk(), quests: { kicker: 1 } };
    const c = new Conversation('kicker', SCRIPTS.kicker, talk, { 'goal.kicker': step.goal.n, built: 1, perk: 1 });
    const lit: string[] = [];
    for (let i = 0; i < 12 && c.phase === 'line'; i++) {
      for (const o of c.out.splice(0)) if (o.kind === 'quest') lit.push(handedTo(o.id, o.step) ?? '');
      c.next();
    }
    for (const o of c.out.splice(0)) if (o.kind === 'quest') lit.push(handedTo(o.id, o.step) ?? '');
    expect(lit).toContain('kicker');
  });

  it('a repeatable paid at the dock lights its giver once; a job missed lights nothing; arriving twice with one haul changes nothing', () => {
    const job = { id: 'rep.kicker.crash', giver: 'kicker', line: 'Rock. Answer. Again.', task: 'Kill 8 machines by crash', goal: { stat: 'crashKills', mode: 'atLeast' as const, n: 8 }, reward: 'kickCard' as const };
    questBook.set({ ...freshBook(), job });
    const haul = (id: string, kills: number) => {
      const sim = new Sim(3, [], 'desert', [], loadout.get());
      sim.bots = [sim.controller];
      sim.stats.crashKills = kills;
      sim.finish();
      return haulFrom(sim, id);
    };
    const base = freshHub();
    const missed = landed(base, haul('j1', 3));
    expect(bondOf(bondSave.get(), 'kicker')).toBe(0);
    expect(missed.news.join(' ')).not.toMatch(/Student/);
    questBook.set({ ...freshBook(), job });
    const h2 = haul('j2', 9);
    const done = landed(base, h2);
    expect(bondOf(bondSave.get(), 'kicker')).toBe(1);
    expect(done.news.join(' ')).toMatch(/Kicker: Student/);
    landed(done.state, h2);
    expect(bondOf(bondSave.get(), 'kicker')).toBe(1);
  });
});

describe('the gift: paid once, in the NPC\'s next talk, also across a save and a load', () => {
  const talkTo = (npc: string, talk: Talk, facts: Flags = {}) => {
    const c = new Conversation(npc, SCRIPTS[npc], talk, { built: 1, perk: 1, ...facts });
    const gives: Reward[] = [];
    const said: string[] = [];
    for (let i = 0; i < 20 && c.phase === 'line'; i++) {
      for (const o of c.out.splice(0)) if (o.kind === 'give') gives.push(o.reward);
      said.push(c.line!.t);
      c.next();
    }
    for (const o of c.out.splice(0)) if (o.kind === 'give') gives.push(o.reward);
    return { talk: c.talk, gives, said };
  };

  it('the fifth step is the exchange and the gift, once', () => {
    const facts = bondFacts(setBond(freshBonds(), 'hob', 5));
    expect(giftWaiting(5, 'hob', talkSave.get().flags)).toBe(true);
    const first = talkTo('hob', { ...freshTalk(), flags: { 'seen.hob.hello': 1 } }, facts);
    expect(first.gives).toEqual([giftReward('hob')]);
    expect(first.said.join(' ')).toMatch(/MASTERPIECE/);
    talkSave.set(first.talk);
    // A save and a load later, he has nothing more to give.
    const again = talkTo('hob', talkSave.get(), facts);
    expect(again.gives).toEqual([]);
    expect(giftWaiting(5, 'hob', talkSave.get().flags)).toBe(false);
  });

  it('each step has one greeting, said once, in place of the idle chatter', () => {
    const facts = bondFacts(setBond(freshBonds(), 'sprocket', 2));
    const t0: Talk = { ...freshTalk(), flags: { 'seen.sprocket.hello': 1 } };
    const first = talkTo('sprocket', t0, facts);
    expect(first.said[0]).toBe(BONDS.sprocket.greet[1][0]);
    const second = talkTo('sprocket', first.talk, facts);
    expect(second.said[0]).not.toBe(BONDS.sprocket.greet[1][0]);
    expect(bondTalk('sprocket').entry.length).toBe(STEPS);
  });

  it('the gifts land: a perk for each, Old Earful in the gear, the Second Heart and the Fourth Slot where they belong', () => {
    for (const id of Object.keys(BONDS)) expect(giveReward(freshHub(), giftReward(id)).perks).toContain(BONDS[id].gift.perk);
    const s0 = gear.get();
    const bannersH = payExtras(giftReward('hob'));
    expect(bannersH.join(' ')).toMatch(/Old Earful/);
    expect(gear.get().items.filter((o) => o.id === 'oldEarful')).toHaveLength(s0.items.filter((o) => o.id === 'oldEarful').length + 1);
    payExtras(giftReward('gasket'));
    expect(gear.get().heart).toBe(true);
    payExtras(giftReward('gasket')); // a second time changes nothing
    expect(gear.get().heart).toBe(true);
    payExtras(giftReward('highPriest'));
    expect(researchSave.get().fourth).toBe(true);
  });
});

describe('the Second Heart (Gasket): one more core slot', () => {
  it('is no slot until it is given; then a second core fits, and both count', () => {
    let g = freshGear();
    ({ gear: g } = addItem(g, 'gasketHeart', 'standard'));
    const a = g.items.at(-1)!;
    ({ gear: g } = addItem(g, 'bellowsLungs', 'standard'));
    const b = g.items.at(-1)!;
    expect(commSlots(g)).not.toContain('heart');
    expect(() => equip(g, b.uid, 'comm', 'heart')).toThrow();
    g = equip(g, a.uid, 'comm', 'core');
    const one = gearMods(g).comm;
    g = { ...g, heart: true };
    expect(commSlots(g)).toContain('heart');
    g = equip(g, b.uid, 'comm', 'heart');
    expect(g.comm.heart).toBe(b.uid);
    const two = gearMods(g).comm;
    expect(two.steam).toBeGreaterThan(one.steam ?? 0);
    expect(two.oil).toBe(one.oil);
    // Only a core piece fits it, and a save without the heart drops what was in it.
    expect(() => equip(g, addItem(g, 'steamGun').item.uid, 'comm', 'heart')).toThrow();
    expect(cleanGear({ ...g, heart: false }).comm.heart).toBeUndefined();
    expect(cleanGear(g).comm.heart).toBe(b.uid);
    expect(ITEMS.gasketHeart.comm).toBe('core');
  });
});

describe('the Fourth Slot (the Oracle): a fourth punch-card slot', () => {
  it('is no slot until it is given; then a card fits it, and a save without it drops the card', () => {
    const r0 = { ...freshResearch(), owned: ['twinNozzle', 'scaldingRounds', 'ricochetRivets', 'wideSwing'] };
    expect(commKeys(r0)).toHaveLength(3);
    const full = ['twinNozzle', 'scaldingRounds', 'ricochetRivets'].reduce((r, id, i) => fit(r, id, `comm:${i}`), r0);
    expect(autoFit(full, 'wideSwing')).toBeNull();
    expect(() => fit(full, 'wideSwing', FOURTH_SLOT)).toThrow(/no fourth slot/);
    const given = { ...full, fourth: true };
    expect(commKeys(given)).toHaveLength(4);
    expect(autoFit(given, 'wideSwing')).toBe(FOURTH_SLOT);
    const withFourth = fit(given, 'wideSwing', FOURTH_SLOT);
    expect(withFourth.fit[FOURTH_SLOT]).toBe('wideSwing');
    expect(cleanResearch(withFourth).fit[FOURTH_SLOT]).toBe('wideSwing');
    expect(cleanResearch({ ...withFourth, fourth: false }).fit[FOURTH_SLOT]).toBeUndefined();
  });
});

describe('the Grand Plan (the City Planner): two blueprints a visit', () => {
  const city = (perks: PerkId[] = []) => ({
    ...freshHub(),
    rescued: ['expeditioner', 'cityPlanner'],
    stations: { expeditioner: 'north-1', cityPlanner: 'south-1' },
    missions: 3,
    perks,
  });

  it('without it one is drawn a visit; with it two, and the third is refused', () => {
    const plain = city();
    const [a, b] = offer(plain);
    expect(() => draw(draw(plain, a), b)).toThrow(/one blueprint a visit/);
    const planned = city(['grandPlan']);
    const [x] = offer(planned);
    const one = draw(planned, x);
    const rest = offer(one);
    expect(rest.length).toBeGreaterThan(0);
    expect(rest).not.toContain(x);
    const two = draw(one, rest[0]);
    expect(two.buildings.raising).toHaveLength(2);
    expect(offer(two)).toEqual([]);
    expect(() => draw(two, BUILDING_IDS.find((id) => !two.buildings.raising.includes(id))!)).toThrow(/two blueprints a visit/);
    // The next visit starts again.
    expect(offer({ ...two, missions: 4 }).length).toBeGreaterThan(0);
  });
});

describe('the Back Room (the Trader): one more item on the shelf every lift', () => {
  it('one more piece of gear of the top grade, the rest of the shelf the same, and it can be bought', () => {
    for (const [missions, tier] of [[3, 1], [4, 3], [9, 0]]) {
      const plain = shelf(missions, tier);
      const back = shelf(missions, tier, true);
      expect(back).toHaveLength(plain.length + 1);
      expect(back.slice(0, plain.length)).toEqual(plain.slice(0, plain.length));
      expect(back.at(-1)!.kind).toBe('item');
      expect(shelf(missions, tier, true)).toEqual(back);
    }
    const s: Stall = { missions: 3, tier: 1, back: true, trade: freshTrade(), scrap: 99999, parts: {}, gear: freshGear(), valued: false };
    const i = shelf(3, 1, true).length - 1;
    expect(left(s.trade, 3, i, 1, true)).toBe(1);
    const bought = buy(s, i);
    expect(bought.gear.items.length).toBe(s.gear.items.length + 1);
    expect(() => buy(bought, i)).toThrow(/sold out/);
    expect(() => buy({ ...s, back: false }, i)).toThrow(/no ware/);
  });
});

describe('the gauge', () => {
  it('five teeth round a cog, the lit ones brass, the fresh ones popping, the fifth turning', () => {
    const lit = (svg: string) => (svg.match(/hb-tooth is-lit/g) ?? []).length;
    expect((cogSvg(0).match(/hb-tooth/g) ?? []).length).toBe(5);
    expect(lit(cogSvg(3))).toBe(3);
    expect(cogSvg(3, 1).match(/is-new/g)).toHaveLength(1);
    expect(cogSvg(4, 1)).not.toContain('is-turning');
    expect(cogSvg(5, 1)).toContain('is-turning');
    expect(cogSvg(5)).not.toContain('is-turning'); // only the moment it is reached
    const html = bondHtml('hob', 2, 'Next: something');
    expect(html).toContain('Customer');
    expect(html).toContain('Next: something');
    expect(bondHtml('nobody', 2)).toBe('');
  });

  it('the quest log carries it beside each giver\'s quests', () => {
    bondSave.set(setBond(freshBonds(), 'highPriest', 2));
    const j = journal(freshTalk(), {}, freshHub(), freshTitles());
    const main = j.entries.find((e) => e.id === 'main')!;
    expect(main.bond).toEqual({ npc: 'highPriest', n: 2 });
  });
});

void land;

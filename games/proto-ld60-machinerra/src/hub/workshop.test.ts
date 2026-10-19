import { describe, expect, it } from 'vitest';
import { START_CREW } from '../sim/defs';
import { Sim } from '../sim/sim';
import { rankStats, chassisStats, RANK_MAX } from '../sim/bots';
import { freshProfile, unlock } from './deeds';
import { REPAIR, freshEconomy, gain } from './economy';
import { oldCrewEconomy, oldCrewRoster } from './fixtures';
import { freshHub, haulFrom } from './state';
import { BODY, PROMOTE, RANK_COST, REBUILD, buy, chassisUp, cleanRoster, crewOf, fitRelic, freeCores, freshRoster, landRoster, noCore, promote, rankUp, rebuild, repairDowned, riders, salvage, type Roster, type Shop } from './workshop';

const shop = (scrap = 1000, copper = 1000, parts: Record<string, number> = { 'hornet-head': 5 }): Shop => ({
  eco: oldCrewEconomy({ scrap, copper, cores: START_CREW.length + 1 }), // the old crew's six cores and one free
  hub: { ...freshHub(), parts },
  roster: oldCrewRoster(),
});

describe('workshop', () => {

  it('the party is every robot you own that is not a wreck: no bays, no staying home, any number', () => {
    const r = oldCrewRoster();
    const many = { ...r, bots: Array.from({ length: 30 }, (_, i) => ({ ...r.bots[i % 6], uid: `r${i + 1}` })) };
    expect(crewOf(many)).toHaveLength(30);
    const wrecked = landRoster(r, { robots: [], went: ['r2', 'r5'] });
    expect(crewOf(wrecked).map((b) => b.uid)).toEqual(['r1', 'r3', 'r4', 'r6']);
    expect(riders(wrecked)).toHaveLength(4);
    // Cores do not hold anyone back: a mission is fielded with all of them, however few cores are held.
    const s = new Sim(5, [], 'desert', [], undefined, undefined, { crew: crewOf(r) });
    expect(s.crew.map((b) => b.uid)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
  });

  it('building a body needs a free core (cores held > robots owned); with none, it is refused with the reason and nothing is spent', () => {
    const s = shop();
    expect(freeCores(s.roster, s.eco)).toBe(1);
    expect(noCore(s.roster, s.eco)).toBeNull();
    const built = buy(s, 'mule');
    expect(built.bot).toMatchObject({ uid: 'r7', role: 'mule', name: 'Biscuit' });
    expect(built.eco.scrap).toBe(1000 - BODY.mule.scrap);
    expect(built.eco.copper).toBe(1000); // a body is scrap, never copper
    expect(crewOf(built.roster)).toHaveLength(7); // and it rides
    // The seventh body took the last core.
    expect(freeCores(built.roster, built.eco)).toBe(0);
    expect(noCore(built.roster, built.eco)).toMatch(/no free AI core: 7 held, 7 robots owned/);
    expect(() => buy(built, 'guard')).toThrow(/no free AI core: 7 held, 7 robots owned/);
    // A new game: no robots, no cores.
    const alone = { ...s, roster: freshRoster(), eco: { ...freshEconomy(), scrap: 1000 } };
    expect(() => buy(alone, 'mule')).toThrow(/no free AI core: 0 held, 0 robots owned/);
    expect(() => buy({ ...alone, eco: gain(alone.eco, 'cores', 1) }, 'mule')).not.toThrow();
    // Salvaging a robot frees its core.
    expect(noCore(salvage(built, 'r1').roster, built.eco)).toBeNull();
    // The refusal spends nothing.
    const stuck = { ...built, eco: { ...built.eco } };
    try { buy(stuck, 'gatherer'); } catch { /* refused */ }
    expect(stuck.eco.scrap).toBe(built.eco.scrap);
  });

  it('a wreck is rebuilt with no new core (it kept its own) and rides again', () => {
    const s = shop();
    const noFree = { ...s, eco: { ...s.eco, cores: START_CREW.length } }; // 6 cores, 6 robots
    expect(noCore(noFree.roster, noFree.eco)).not.toBeNull();
    const wreck = landRoster(noFree.roster, { robots: [], went: ['r1'] });
    expect(crewOf(wreck).map((b) => b.uid)).not.toContain('r1');
    const back = rebuild({ ...noFree, roster: wreck }, 'r1');
    expect(back.roster.bots[0].wreck).toBe(false);
    expect(crewOf(back.roster).map((b) => b.uid)).toContain('r1');
  });

  it('salvage gives scrap back; chassis levels stop at their max', () => {
    const s = salvage(shop(0), 'r1');
    expect(s.eco.scrap).toBe(Math.floor(BODY.gatherer.scrap / 2));
    expect(s.roster.bots.length).toBe(START_CREW.length - 1);
    let c = shop();
    for (let i = 0; i < 3; i++) c = chassisUp(c, 'tank');
    expect(() => chassisUp(c, 'tank')).toThrow();
    expect(chassisStats(c.roster.chassis).oil).toBe(75);
  });

  it('an old or damaged roster cleans up; the bays and field flags of an old save are dropped silently', () => {
    const r = cleanRoster({ bots: [{ uid: 'r1', name: 'A', role: 'nope' as never, rank: 0, field: true, wreck: false }, { uid: 'r2', name: 'B', role: 'guard', rank: 9, field: false, wreck: true }, { uid: 'r3', name: 'C', role: 'mule', rank: 0, field: false, wreck: false }], bays: 9, next: NaN, chassis: { tank: 7 } } as never);
    expect(r.bots).toEqual([{ uid: 'r2', name: 'B', role: 'guard', rank: RANK_MAX, wreck: true }, { uid: 'r3', name: 'C', role: 'mule', rank: 0, wreck: false }]);
    expect([r.next, r.chassis.tank]).toEqual([4, 3]);
    expect('bays' in r).toBe(false);
    expect(crewOf(r).map((b) => b.uid)).toEqual(['r3']); // a robot an old save left "home" rides now
  });
});

describe('promotion (P14)', () => {
  const opened = (...specs: Parameters<typeof unlock>[1][]) => specs.reduce(unlock, freshProfile());
  // r1 is a gatherer, r4 a guard in the old crew.

  it('needs the spec unlocked by deeds, the robot\'s own type, scrap and a part; nothing is spent on a refusal', () => {
    const s = shop(100, 100, { 'hornet-head': 2 });
    expect(() => promote(s, 'r1', 'siphoner', freshProfile())).toThrow(/not unlocked/);
    expect(() => promote(s, 'r1', 'bulwark', opened('bulwark'))).toThrow(/Guard spec/);
    expect(() => promote(shop(1000, PROMOTE.copper - 1), 'r1', 'siphoner', opened('siphoner'))).toThrow(/copper/);
    expect(() => promote(shop(100, 100, {}), 'r1', 'siphoner', opened('siphoner'))).toThrow(/part/);
    expect(() => promote(s, 'r9', 'siphoner', opened('siphoner'))).toThrow(/no robot/);
    expect(s.eco).toMatchObject({ scrap: 100, copper: 100 });
    expect(s.hub.parts).toEqual({ 'hornet-head': 2 });
  });

  it('a wreck rebuilt keeps its spec, relic and rank', () => {
    let s = promote(rankUp(shop(), 'r4'), 'r4', 'bulwark', opened('bulwark'));
    s = { ...s, roster: fitRelic(s.roster, 'r4', 'toaster') };
    const whole = s.roster.bots.find((b) => b.uid === 'r4')!;
    expect(whole).toMatchObject({ spec: 'bulwark', relic: 'toaster', rank: 1 });
    const wrecked = landRoster(s.roster, { robots: [], went: ['r4'] });
    expect(wrecked.bots.find((b) => b.uid === 'r4')).toEqual({ ...whole, wreck: true });
    const back = rebuild({ ...s, roster: wrecked }, 'r4').roster.bots.find((b) => b.uid === 'r4')!;
    expect(back).toEqual(whole);
    expect(cleanRoster({ ...wrecked }).bots.find((b) => b.uid === 'r4')).toMatchObject({ spec: 'bulwark', relic: 'toaster' });
  });

  it('a relic is fitted and cleared; an old roster without the fields loads as it was; a spec of another type is dropped', () => {
    const r = fitRelic(oldCrewRoster(), 'r1', 'toaster');
    expect(r.bots[0].relic).toBe('toaster');
    expect('relic' in fitRelic(r, 'r1', null).bots[0]).toBe(false);
    expect(() => fitRelic(r, 'r99', 'x')).toThrow(/no robot/);
    const old = cleanRoster({ ...freshRoster(), bots: [{ uid: 'r1', name: 'A', role: 'guard', rank: 1, wreck: false }] });
    expect(old.bots[0]).toEqual({ uid: 'r1', name: 'A', role: 'guard', rank: 1, wreck: false });
    const odd = cleanRoster({ ...freshRoster(), bots: [{ uid: 'r1', name: 'A', role: 'guard', rank: 0, wreck: false, spec: 'medic' }] });
    expect(odd.bots[0].spec).toBeUndefined();
  });
});

describe('the mission fields the roster', () => {
  it('ranked robots are tougher; the haul says who went and who came home', () => {
    const crew = [{ uid: 'r1', role: 'guard' as const, name: 'A', rank: 2 }, { uid: 'r2', role: 'mule' as const, name: 'B' }];
    const s = new Sim(5, [], 'desert', [], undefined, undefined, { crew, chassis: { oil: 25 } });
    expect(s.crew.map((b) => b.name)).toEqual(['A', 'B']);
    const g = s.crew[0];
    expect(g.maxHp).toBe(110 + (rankStats('guard', 2).oil ?? 0));
    expect(s.controller.maxHp).toBe(120 + 25);
    s.crew[1].x += 2000; // the mule wanders off and is left behind
    const h = haulFrom(s, 'h');
    expect(h.went).toEqual(['r1', 'r2']);
    expect(h.robots.map((b) => b.uid)).toEqual(['r1']);
  });

});

describe('downed robots come home (P5)', () => {
  const crew = [{ uid: 'r1', role: 'guard' as const, name: 'A', rank: 1, spec: 'bulwark' as const, relic: 'toaster' }, { uid: 'r2', role: 'mule' as const, name: 'B' }, { uid: 'r3', role: 'gatherer' as const, name: 'C' }];
  const roster = (): Roster => ({ ...freshRoster(), bots: crew.map((c) => ({ rank: 0, ...c, wreck: false })), next: 4 });

  it('one carried up on the lift is downed (repaired for scrap), one left on the sands a wreck (rebuilt), one standing rides', () => {
    const s = new Sim(5, [], 'desert', [], undefined, undefined, { crew });
    s.setClock('day');
    const [a, b, c] = s.crew;
    a.x = s.lift.x;
    a.y = s.lift.y;
    b.x = s.lift.x + 20;
    b.y = s.lift.y;
    s.hurt(a, 9999); // downed on the lift
    c.x = s.lift.x + 2000;
    c.y = s.lift.y;
    s.hurt(c, 9999); // downed far away
    s.finish();
    const h = haulFrom(s, 'h');
    expect(h.robots.map((r) => r.uid)).toEqual(['r2']);
    expect(h.downed).toEqual(['r1']);
    expect(h.went).toEqual(['r1', 'r2', 'r3']);
    const home = landRoster(roster(), h);
    expect(home.bots.map((x) => [x.uid, !!x.wreck, !!x.downed])).toEqual([['r1', false, true], ['r2', false, false], ['r3', true, false]]);
    // the core, spec, relic and rank all come home with either
    expect(home.bots[0]).toMatchObject({ rank: 1, spec: 'bulwark', relic: 'toaster' });
    expect(home.bots[2]).toMatchObject({ uid: 'r3', wreck: true });
    // neither rides down until it is mended
    expect(riders(home).map((x) => x.uid)).toEqual(['r2']);
    expect(crewOf(home).map((x) => x.uid)).toEqual(['r2']);
  });

  it('a carried robot repairs for REPAIR.carried scrap: never crude, copper or a part, never a can; rank, spec and relic as they were', () => {
    const h = landRoster(roster(), { robots: [], downed: ['r1'], went: ['r1'] });
    const s: Shop = { eco: gain(gain(freshEconomy(), 'scrap', 100), 'cores', 3), hub: { ...freshHub(), parts: { 'hornet-head': 2 } }, roster: h };
    expect(() => rankUp(s, 'r1')).toThrow(/down: repair it first/);
    const r = repairDowned(s, 'r1');
    expect(r.eco.scrap).toBe(100 - REPAIR.carried.scrap);
    expect(REPAIR.carried).toEqual({ scrap: 15, part: false });
    expect(r.eco.copper).toBe(s.eco.copper);
    expect(r.eco.coal).toBe(s.eco.coal);
    expect(r.hub.parts).toEqual(s.hub.parts);
    const back = r.roster.bots[0];
    expect('downed' in back).toBe(false);
    expect(back).toMatchObject({ uid: 'r1', rank: 1, spec: 'bulwark', relic: 'toaster', wreck: false });
    expect(riders(r.roster).map((x) => x.uid)).toContain('r1');
    // not down, nothing to repair; not enough scrap, nothing spent
    expect(() => repairDowned(r, 'r1')).toThrow(/not down/);
    expect(() => repairDowned({ ...s, eco: { ...s.eco, scrap: 14 } }, 'r1')).toThrow(/scrap/);
  });

  it('carrying a robot home is cheaper than leaving it: the repair costs less than the rebuild', () => {
    expect(REPAIR.carried.scrap).toBeLessThan(REBUILD.scrap);
    expect(REPAIR.rebuilt.scrap).toBe(REBUILD.scrap);
  });

  it('the roster saves the downed state, and a wreck is never also downed', () => {
    const r = cleanRoster({ ...freshRoster(), bots: [{ uid: 'r1', name: 'A', role: 'guard', rank: 0, wreck: false, downed: true }, { uid: 'r2', name: 'B', role: 'guard', rank: 0, wreck: true, downed: true }] });
    expect(r.bots[0].downed).toBe(true);
    expect('downed' in r.bots[1]).toBe(false);
  });
});

describe('one-time upgrades cost copper (Minos: "bot upgrades - copper also, yes? a one time thing")', () => {

  it('a rank is refused without the copper (scrap cannot stand in) and nothing is spent', () => {
    const s = shop(1000, RANK_COST[1].copper - 1);
    expect(() => rankUp(s, 'r1')).toThrow(/copper/);
    expect(s.eco).toMatchObject({ scrap: 1000, copper: RANK_COST[1].copper - 1 });
    expect(s.roster.bots.find((b) => b.uid === 'r1')!.rank).toBe(0);
  });

  it('what recurs stays scrap (a body, a rebuild); an upgrade is copper (a rank, a promotion)', () => {
    expect(Object.keys(BODY.guard)).toEqual(expect.arrayContaining(['scrap']));
    for (const b of Object.values(BODY)) expect(b).not.toHaveProperty('copper');
    expect(REBUILD).toEqual({ scrap: 30 });
    expect(PROMOTE).toHaveProperty('copper');
    expect(PROMOTE).not.toHaveProperty('scrap');
  });
});

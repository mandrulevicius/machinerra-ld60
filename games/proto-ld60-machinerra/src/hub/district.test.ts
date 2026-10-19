import { beforeEach, describe, expect, it } from 'vitest';
import { NO_INPUT, Sim } from '../sim/sim';
import { LOOT, TAP } from '../sim/defs';
import { PERK_FX, kickOf } from '../sim/perks';
import { freshResearch, offerFor } from './research';
import { researchCtx } from './researchslice';
import { BUILDING_IDS, GATE, cityFx, slotsOf, tearDown } from './buildings';
import {
  CITY_PERKS, CITY_PERK_IDS, DISTRICT, STAGES, crowdOf, districtFx, districtOf, finishDistrict, finished, grantPerk, needed, offerPerks, picksOwed, pour, scrapMul, setStage, takePerk, whyLocked,
} from './district';
import { freshEconomy, type Economy } from './economy';
import { hub, slot } from './save';
import { freshHub, type HubState } from './state';

beforeEach(() => hub.reset());

/** A hub where the Expeditioner and the City Planner work, and every city slot holds a standing building. */
const fullCity = (o: Partial<HubState> = {}): HubState => {
  const base: HubState = { ...freshHub(), rescued: ['expeditioner', 'cityPlanner'], stations: { expeditioner: 'north-1', cityPlanner: 'south-1' }, missions: 3, ...o };
  const open = BUILDING_IDS.filter((id) => !GATE[id]);
  return { ...base, buildings: { built: open.slice(0, slotsOf(base)), raising: [], pickedAt: -1 } };
};
const eco = (copper: number): Economy => ({ ...freshEconomy(), copper });
/** Pour a stage in full and let the lift dock: it stands. */
const raise = (s: HubState) => {
  const d = districtOf(s);
  return finishDistrict(pour({ eco: eco(5000), hub: s }, needed(d)).hub).hub;
};

describe('the Rising District: opening and pouring', () => {
  it('stays locked until every city slot holds a standing building', () => {
    const s = fullCity();
    expect(whyLocked(s)).toBeNull();
    const down = tearDown(s, s.buildings.built[0]);
    expect(whyLocked(down)).toMatch(/Opens when every city slot holds a standing building \(\d of \d stand\)/);
    expect(() => pour({ eco: eco(500), hub: down }, 10)).toThrow(/Opens when/);
    // Going up is not standing.
    const scaffold = { ...s, buildings: { ...s.buildings, built: s.buildings.built.slice(1), raising: [s.buildings.built[0]] } };
    expect(whyLocked(scaffold)).toMatch(/Opens when/);
    expect(whyLocked(freshHub())).toMatch(/Planner/);
  });

  it('a district already begun stays open when a slot is torn down for Rebuild', () => {
    const s = fullCity();
    const begun = pour({ eco: eco(500), hub: s }, 40).hub;
    const down = tearDown(begun, begun.buildings.built[0]);
    expect(whyLocked(down)).toBeNull();
    expect(pour({ eco: eco(500), hub: down }, 10).hub.district!.poured).toBe(50);
  });

  it('pouring fills the stage and pays its copper; a full stage goes up and stands on the next dock', () => {
    const s = fullCity();
    const price = STAGES[0].price;
    const a = pour({ eco: eco(500), hub: s }, 100);
    expect(a.eco.copper).toBe(400);
    expect(districtOf(a.hub)).toMatchObject({ stage: 0, poured: 100, raising: false });
    expect(needed(districtOf(a.hub))).toBe(price - 100);
    const b = pour({ eco: a.eco, hub: a.hub }, price - 100);
    expect(districtOf(b.hub)).toMatchObject({ stage: 0, poured: price, raising: true });
    expect(b.eco.copper).toBe(500 - price);
    // Going up: no more may be poured, and it is not standing yet.
    expect(() => pour(b, 1)).toThrow(/going up/);
    expect(crowdOf(districtOf(b.hub))).toBe(0);
    const up = finishDistrict(b.hub);
    expect(up.stage).toBe(1);
    expect(districtOf(up.hub)).toMatchObject({ stage: 1, poured: 0, raising: false });
    expect(finishDistrict(up.hub).stage).toBe(0); // a dock with nothing going up changes nothing
  });

  it('is refused for more than the stage needs, more than the copper held, or nothing', () => {
    const s = fullCity();
    expect(() => pour({ eco: eco(1000), hub: s }, STAGES[0].price + 1)).toThrow(/needs only/);
    expect(() => pour({ eco: eco(20), hub: s }, 30)).toThrow(/you have 20/);
    expect(() => pour({ eco: eco(20), hub: s }, 0)).toThrow(/whole number/);
    expect(() => pour({ eco: eco(20), hub: s }, 2.5)).toThrow(/whole number/);
  });

  it('five stages, each dearer, then it is done', () => {
    expect(STAGES).toHaveLength(5);
    expect(STAGES.map((x) => x.price)).toEqual([...STAGES.map((x) => x.price)].sort((a, b) => a - b));
    let s = fullCity();
    for (let i = 0; i < 5; i++) {
      expect(finished(districtOf(s))).toBe(false);
      s = raise(s);
    }
    expect(districtOf(s).stage).toBe(5);
    expect(finished(districtOf(s))).toBe(true);
    expect(() => pour({ eco: eco(5000), hub: s }, 1)).toThrow(/as tall as it gets/);
  });
});

describe('the Rising District: housing', () => {
  it('each stage moves 8 civilians in and makes scrap drops 10% richer', () => {
    let s = fullCity();
    expect([crowdOf(districtOf(s)), scrapMul(districtOf(s))]).toEqual([0, 1]);
    for (let i = 1; i <= 5; i++) {
      s = raise(s);
      expect(crowdOf(districtOf(s))).toBe(i * DISTRICT.crowd);
      expect(scrapMul(districtOf(s))).toBeCloseTo(1 + i * DISTRICT.scrap);
    }
    expect(scrapMul(districtOf(s))).toBeCloseTo(1.5);
  });

  it('in a mission: a kill and a gob pay the stage\'s share more, and the stats screen has it as the Rising District', () => {
    const take = (stage: number) => {
      const s = new Sim(6, [], 'desert', [], undefined, undefined, { city: districtFx(cityFx([]), setStage(fullCity(), stage)) });
      s.bots = [s.controller];
      s.god = true;
      const h = s.spawnHornet(s.controller.x + 80, s.controller.y, 0, false, false, 'hornet');
      s.slay(h);
      const kill = s.scrap;
      s.gainScrap(10);
      return { kill, gob: s.scrap - kill, source: s.engine.explain(s.controller, 'scrapRate', 1) };
    };
    const none = take(0), three = take(3), five = take(5);
    expect(none.gob).toBe(10);
    expect(three.gob).toBeCloseTo(13);
    expect(five.gob).toBeCloseTo(15);
    expect(three.kill).toBeCloseTo(none.kill * 1.3);
    expect(JSON.stringify(five.source)).toContain('The Rising District');
  });

  it('the window and the haul: the district is part of a save and survives a reload', () => {
    const s = fullCity({ district: { stage: 3, poured: 90, raising: false, perks: ['crowsNest', 'senseiHall'] } });
    hub.set(s);
    expect(districtOf(hub.get())).toEqual({ stage: 3, poured: 90, raising: false, perks: ['crowsNest', 'senseiHall'] });
  });

  it('an old save has no district and loads whole', () => {
    slot.put(0, { slices: { hub: { v: 3, d: { rescued: ['expeditioner'], missions: 2 } } } });
    expect(districtOf(hub.get())).toEqual({ stage: 0, poured: 0, raising: false, perks: [] });
  });
});

describe('the city perks: a pick of three', () => {
  it('a standing stage owes a pick of three from the pool, the same three each time, none already taken', () => {
    let s = fullCity();
    expect(offerPerks(s)).toEqual([]);
    s = raise(s);
    expect(picksOwed(districtOf(s))).toBe(1);
    const a = offerPerks(s);
    expect(a).toHaveLength(DISTRICT.offered);
    expect(new Set(a).size).toBe(3);
    expect(a.every((id) => CITY_PERK_IDS.includes(id))).toBe(true);
    expect(offerPerks(s)).toEqual(a);
    s = takePerk(s, a[0]);
    expect(districtOf(s).perks).toEqual([a[0]]);
    expect(picksOwed(districtOf(s))).toBe(0);
    expect(offerPerks(s)).toEqual([]);
    expect(() => takePerk(s, a[1])).toThrow(/not on offer/);
  });

  it('five stages take five different perks of the nine', () => {
    let s = fullCity();
    const taken: string[] = [];
    for (let i = 0; i < 5; i++) {
      s = raise(s);
      const offer = offerPerks(s);
      expect(offer).toHaveLength(3);
      for (const id of offer) expect(taken).not.toContain(id);
      taken.push(offer[0]);
      s = takePerk(s, offer[0]);
    }
    expect(new Set(taken).size).toBe(5);
    expect(CITY_PERK_IDS).toHaveLength(9);
  });

  it('a pick not taken waits (picks stack across stages)', () => {
    const s = raise(raise(fullCity()));
    expect(picksOwed(districtOf(s))).toBe(2);
  });
});

describe('the kept perks work', () => {
  const sim = (perks: string[], seed = 6) => {
    let s = fullCity();
    for (const p of perks) s = grantPerk(s, p);
    const x = new Sim(seed, [], 'desert', [], undefined, undefined, { city: districtFx(cityFx([]), s) });
    x.bots = [x.controller];
    x.god = true;
    return x;
  };
  const run = (s: Sim, sec: number) => {
    for (let i = 0; i < sec * 30; i++) {
      s.step(1 / 30, NO_INPUT);
      s.events.length = 0;
    }
  };

  it('every perk has a name, a plain text and something it does', () => {
    for (const id of CITY_PERK_IDS) {
      const p = CITY_PERKS[id];
      expect(p.name.length).toBeGreaterThan(3);
      expect(p.text.endsWith('.')).toBe(true);
      expect(p.flag || p.comm || p.bots || id === 'districtChapel', id).toBeTruthy();
    }
  });

  it('Pure Copper Wiring and Superheated Steam ride on the Communicator and his robots as sources', () => {
    const s = new Sim(6, [], 'desert', [], undefined, undefined, { city: districtFx(cityFx([]), grantPerk(grantPerk(fullCity(), 'copperWiring'), 'superheated')), crew: [{ role: 'guard', name: 'g', uid: 'g' }] });
    const g = s.bots.find((b) => b.role === 'guard')!;
    for (const b of [s.controller, g]) {
      expect(s.engine.stat(b, 'shockJumps', 0)).toBe(PERK_FX.shockJumps);
      expect(s.engine.stat(b, 'scaldBurst', 0)).toBe(PERK_FX.scaldBurst);
    }
    const bare = sim([]);
    expect([bare.engine.stat(bare.controller, 'shockJumps', 0), bare.engine.stat(bare.controller, 'scaldBurst', 0)]).toEqual([0, 0]);
  });

  it('Pneumatic Post: a gob far outside the usual pull flies to him', () => {
    const gobAt = (perks: string[]) => {
      const s = sim(perks);
      const c = s.controller;
      s.loot.length = 0;
      const l = s.drop(c.x + LOOT.magnet + 120, c.y, 'scrap', null, 5);
      const start = Math.hypot(l.x - c.x, l.y - c.y);
      run(s, 0.5);
      return start - Math.hypot(l.x - c.x, l.y - c.y);
    };
    expect(gobAt([])).toBeLessThan(1);
    expect(gobAt(['pneumaticPost'])).toBeGreaterThan(30);
  });

  it('the Sensei\'s Hall: the kick\'s cooldown is a quarter shorter', () => {
    const plain = kickOf(sim([]).perks).rate, sensei = kickOf(sim(['senseiHall']).perks).rate;
    expect(sensei / plain).toBeCloseTo(PERK_FX.kick);
    expect(PERK_FX.kick).toBe(0.75);
  });

  it('Hot Water Mains: the tap holds half as much again and mends twice as fast', () => {
    const tap = (perks: string[]) => {
      const s = sim(perks, 3);
      s.cfg.edge = 0;
      for (const n of s.nests) n.dead = true;
      const t = s.seeps[0];
      s.controller.x = t.x + 20;
      s.controller.y = t.y;
      s.controller.hp = s.controller.maxHp - 200;
      const before = s.controller.hp;
      run(s, 2);
      return { max: t.max, healed: s.controller.hp - before };
    };
    const plain = tap([]), mains = tap(['hotWaterMains']);
    expect(plain.max).toBe(TAP.amount);
    expect(mains.max).toBe(TAP.amount * PERK_FX.tap.amount);
    expect(mains.healed / plain.healed).toBeGreaterThan(1.8);
  });

  it('Militia Muster: a Brass Guard goes down with the lift and goes home after two minutes', () => {
    const s = new Sim(6, [], 'desert', [], undefined, undefined, { city: districtFx(cityFx([]), grantPerk(fullCity(), 'militiaMuster')), crew: [] });
    const guard = s.bots.filter((b) => b.role === 'guard');
    expect(guard).toHaveLength(1);
    expect(guard[0].ttl).toBe(PERK_FX.militia);
    const plain = new Sim(6, [], 'desert', [], undefined, undefined, { city: districtFx(cityFx([]), fullCity()), crew: [] });
    expect(plain.bots.filter((b) => b.role === 'guard')).toHaveLength(0);
  });

  it('Smokeless Combustion: a gatherer stripping a ruin or mining a seam wakes no hive; decoding still does', () => {
    const woke = (perks: string[]) => {
      const s = sim(perks, 7);
      s.setClock('day');
      const seam = s.seams[0];
      const hive = s.nests.find((n) => !n.awake)!;
      seam.x = hive.x + 60;
      seam.y = hive.y;
      const g = s.addBot('gatherer', 'g', seam.x, seam.y + 20, 0);
      for (let i = 0; i < 5; i++) s.mine(g, seam, 1 / 30);
      return hive.awake;
    };
    expect(woke([])).toBe(true);
    expect(woke(['smokeless'])).toBe(false);
  });

  it('The Crow\'s Nest and Smokeless Combustion are flags the mission reads; the Chapel is the hub\'s', () => {
    expect(sim(['crowsNest']).perks.has('crowsNest')).toBe(true);
    expect(sim([]).perks.has('crowsNest')).toBe(false);
    expect(districtFx(cityFx([]), grantPerk(fullCity(), 'smokeless')).perks).toEqual(['smokeless']);
    // The Chapel: the Oracle's pick offers four cards instead of three.
    const plain = researchCtx();
    hub.set(grantPerk(fullCity(), 'districtChapel'));
    const chapel = researchCtx();
    expect(offerFor(freshResearch(), plain, 'x')).toHaveLength(3);
    expect(offerFor(freshResearch(), chapel, 'x')).toHaveLength(4);
  });
});

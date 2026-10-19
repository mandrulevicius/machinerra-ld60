import { beforeEach, describe, expect, it } from 'vitest';
import { slot, hub } from './save';
import { COPPER, START_CREW } from '../sim/defs';
import { freshHub, stationCost, STATION_COSTS, type Haul, type HubState } from './state';
import {
  SPARE_MAX, bank, buildStation, capExtraOf, commit, copperBlock, depart, economy, freshEconomy, gain,
  load, partyRoom, pay, repair, repairCost, settleScrap, spareCap, type Economy
} from './economy';

beforeEach(() => hub.reset());

// A bare stock: a new game has the starting copper (`freshEconomy`), the tests count from none.
const eco = (o: Partial<Economy> = {}): Economy => ({ ...freshEconomy(), copper: 0, cores: 0, ...o });
const home = (o: Partial<HubState> = {}): HubState => ({ ...freshHub(), ...o });
const haul = (o: Partial<Haul> = {}): Haul => ({ id: 'h1', parts: {}, robots: [], ...o });

describe('sources', () => {

  it('gain adds to any stock and ignores junk amounts', () => {
    let e = eco();
    for (const k of ['scrap', 'insight', 'cores', 'copper'] as const) e = gain(e, k, 2.9);
    expect(e).toMatchObject({ scrap: 2, insight: 2, cores: 2, copper: 2 });
    expect(gain(e, 'scrap', -5)).toEqual(e);
    expect(gain(e, 'scrap', NaN)).toEqual(e);
  });

  it('a haul banks scrap, insight, cores, copper and coal once; no oil comes home', () => {
    const h = haul({ scrap: 30, insight: 2, cores: 1, copper: 12, coal: 6 });
    const once = bank(eco({ scrap: 5, copper: 3 }), h);
    expect(once).toEqual({ scrap: 35, insight: 2, cores: 1, copper: 15, coal: 6, junk: [], charges: {}, haul: 'h1' });
    expect(bank(once, h)).toBe(once);
    expect(bank(eco(), haul({ id: 'old' }))).toMatchObject({ scrap: 0, haul: 'old' }); // a haul from before the economy
    expect(bank(eco(), haul({ scrap: -9, copper: NaN }))).toMatchObject({ scrap: 0, copper: 0 });
  });



  it('cores cap the party', () => {
    expect(partyRoom(eco({ cores: 2 }), 1)).toBe(1);
    expect(partyRoom(eco({ cores: 2 }), 3)).toBe(0);
    expect(partyRoom(eco(), 0)).toBe(0);
  });
});

describe('paying', () => {
  it('pay spends, and refuses a short stock or a bad amount without changing anything', () => {
    const e = eco({ scrap: 10 });
    expect(pay(e, 'scrap', 4).scrap).toBe(6);
    expect(() => pay(e, 'scrap', 11)).toThrow(/you have 10/);
    expect(() => pay(e, 'scrap', -1)).toThrow(/cannot/);
    expect(() => pay(e, 'insight', 1.5)).toThrow(/cannot/);
    expect(e.scrap).toBe(10);
  });

  it('a dialog reward hands over scrap first (at most what is held) and then gives its own', () => {
    expect(settleScrap(eco({ scrap: 200 }), { scrap: 10, take: { scrap: 120 } }).scrap).toBe(90);
    expect(settleScrap(eco({ scrap: 50 }), { take: { scrap: 120 } }).scrap).toBe(0);
    expect(settleScrap(eco({ scrap: 5 }), {}).scrap).toBe(5);
  });
});

describe('oil cans refill at home', () => {
  it('every lift goes down with a full pack, however the last one ended; the stock holds no cans', () => {
    const d = depart(eco());
    expect(d).toEqual({ eco: eco(), cans: SPARE_MAX, charges: {} });
    expect(freshEconomy()).not.toHaveProperty('spare');
    expect(depart(eco({ scrap: 99 })).cans).toBe(SPARE_MAX); // nothing is spent to fill it
    expect(depart(eco({ scrap: 99 })).eco.scrap).toBe(99);
  });

  it('the cap grows with the Can Rack and the capstone, and the pack goes down full to it', () => {
    expect(spareCap(2)).toBe(SPARE_MAX + 2);
    expect(depart(eco(), { capExtra: 1 }).cans).toBe(SPARE_MAX + 1);
    expect(depart(eco(), { capExtra: -3 }).cans).toBe(SPARE_MAX);
    expect(capExtraOf([])).toBe(0);
    expect(capExtraOf(['kick', 'canRack'])).toBe(1);
    expect(capExtraOf(['oracleCans', 'canRack', 'cheapLots'])).toBe(2);
    expect(depart(eco(), { capExtra: capExtraOf(['canRack', 'oracleCans']) }).cans).toBe(SPARE_MAX + 2);
  });
});


describe('repairs cost scrap only (oil is health and lives: no repair costs a can)', () => {
  const stocked = () => ({ eco: eco({ scrap: 100, copper: 9 }), hub: home({ parts: { 'hornet-head': 1 } }) });



  it('the Great Foundry takes 30% off the scrap, rounded up', () => {
    expect(repairCost('carried', true).scrap).toBe(11);
    expect(repairCost('rebuilt', true).scrap).toBe(21);
    expect(repair(stocked(), 'carried', { foundry: true }).eco.scrap).toBe(89);
  });

  it('is all or nothing: a missing scrap or part throws and nothing is spent', () => {
    const s = stocked();
    expect(() => repair({ ...s, eco: eco({ scrap: 14 }) }, 'carried')).toThrow(/scrap/);
    expect(() => repair(s, 'rebuilt')).toThrow(/part/);
    expect(() => repair(s, 'rebuilt', { part: 'drone-optics' })).toThrow(/drone-optics/);
    expect(s.eco).toMatchObject({ scrap: 100, copper: 9 });
    expect(s.hub.parts).toEqual({ 'hornet-head': 1 });
  });
});

describe('copper builds (buildStation)', () => {
  const books = (copper: number) => ({ eco: eco({ copper }), hub: rescued() });
  const rescued = () => ({ ...freshHub(), rescued: ['kicker', 'trader', 'cityPlanner'] });

  it('a station costs copper, each one dearer, and nothing else', () => {
    const b = buildStation(books(500), 'kicker', 'slot-5');
    expect(b.eco.copper).toBe(500 - STATION_COSTS[0]);
    expect(b.eco.scrap).toBe(0);
    expect(b.hub.stations).toEqual({ kicker: 'slot-5' });
    const two = buildStation(b, 'trader', 'slot-1');
    expect(two.eco.copper).toBe(500 - STATION_COSTS[0] - STATION_COSTS[1]);
    expect(stationCost(two.hub)).toBe(STATION_COSTS[2]);
  });



  it('refused without the copper, on a taken lot or twice: the books are as they were', () => {
    const short = books(STATION_COSTS[0] - 1);
    expect(() => buildStation(short, 'kicker', 'slot-5')).toThrow(/costs 30 copper; you have 29/);
    expect(copperBlock(short.eco, 30)).toMatch(/30 copper/);
    expect(copperBlock(eco({ copper: 30 }), 30)).toBeNull();
    const b = buildStation(books(500), 'kicker', 'slot-5');
    expect(() => buildStation(b, 'trader', 'slot-5')).toThrow(/taken/);
    expect(() => buildStation(b, 'kicker', 'slot-6')).toThrow(/already/);
    expect(b.eco.copper).toBe(500 - STATION_COSTS[0]);
  });


});

describe('the economy slice', () => {

  it('round-trips through the save: scrap, insight, cores, copper and the last haul', () => {
    const e = bank(eco(), haul({ id: 'm3', scrap: 40, insight: 3, cores: 2, copper: 25 }));
    commit({ eco: e, hub: home({ city: 100 }) });
    expect(slot.latest()).toBe(0);
    // "Reload": nothing is cached, the next read comes from the file.
    const back = load();
    expect(back.eco).toEqual({ scrap: 40, insight: 3, cores: 2, copper: 25, coal: 0, junk: [], charges: {}, haul: 'm3' });
    expect(back.hub).toMatchObject({ city: 100 });
    expect(bank(back.eco, haul({ id: 'm3', scrap: 40 }))).toEqual(back.eco);
  });

  it('v5: a save from before the rework loses wood, coal and its can stock, and gets a new game\'s copper, once', () => {
    slot.put(0, { slices: { economy: { v: 4, d: { scrap: 7, insight: 1, cores: 2, wood: 30, spare: 2, charges: {}, junk: [], haul: null } } } });
    const e = economy.get();
    expect(e).toMatchObject({ scrap: 7, insight: 1, cores: 2, copper: COPPER.start });
    expect(e).not.toHaveProperty('wood');
    expect(e).not.toHaveProperty('spare');
    economy.set({ ...e, copper: 5 });
    expect(economy.get().copper).toBe(5);
  });


  it('v6: coal is a stock again, the fuel for expeditions: an older save has none, a current one keeps its coal', () => {
    slot.put(0, { slices: { economy: { v: 5, d: { scrap: 7, insight: 1, cores: 2, copper: 9, charges: {}, junk: [], haul: null } } } });
    expect(economy.get()).toMatchObject({ scrap: 7, copper: 9, coal: 0 });
    economy.set({ ...economy.get(), coal: 12 });
    expect(economy.get().coal).toBe(12);
  });

  it('a save from before the cores cap the party keeps at least the old six cores (it kept the old six robots), and more when it has them', () => {
    slot.put(0, { slices: { economy: { v: 3, d: { scrap: 7, insight: 0, cores: 0, wood: 10, spare: 2, charges: {}, haul: null } } } });
    expect(economy.get()).toMatchObject({ scrap: 7, cores: START_CREW.length });
    slot.put(0, { slices: { economy: { v: 3, d: { scrap: 7, insight: 0, cores: 9, wood: 10, spare: 2, charges: {}, haul: null } } } });
    expect(economy.get().cores).toBe(9);
    slot.put(0, { slices: { economy: { v: 4, d: { scrap: 7, insight: 0, cores: 1, wood: 10, spare: 2, charges: {}, haul: null } } } });
    expect(economy.get().cores).toBe(1); // a current save is taken as it is
  });

  it('a save from before the economy, or a damaged one, loads as a new game\'s', () => {
    slot.put(0, { slices: { hub: { v: 1, d: freshHub() } } });
    expect(economy.get()).toEqual(freshEconomy());
    slot.put(0, { slices: { economy: { v: 1, d: { scrap: -3, spare: 1 } } } });
    expect(economy.get()).toEqual(freshEconomy());
    slot.put(0, { slices: { economy: { v: 1, d: { scrap: 7 } } } });
    expect(economy.get()).toEqual({ ...freshEconomy(), scrap: 7, cores: START_CREW.length }); // a pre-cores save keeps the old six
  });
});

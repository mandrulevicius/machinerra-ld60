import { beforeEach, describe, expect, it } from 'vitest';
import { cleanJunk } from '../sim/junk';
import { raise } from './buildings';
import { land } from './carry';
import { bank, economy, freshEconomy, type Economy } from './economy';
import { EXPEDITION, away, dispatch, homeNews, load, loaded, resultOf, settle, withExpedition } from './expeditions';
import { landings } from './landings';
import { hub } from './save';
import { freshHub, type Haul, type HubState } from './state';

beforeEach(() => hub.reset());

const office = (o: Partial<HubState> = {}): HubState => ({ ...freshHub(), rescued: ['expeditioner'], stations: { expeditioner: 'north-1' }, missions: 2, ...o });
const eco = (o: Partial<Economy> = {}): Economy => ({ ...freshEconomy(), coal: 50, ...o });
const haul = (id: string, o: Partial<Haul> = {}): Haul => ({ id, parts: {}, robots: [], ...o });

describe('feeding and departing', () => {
  it('coal moves from the stores onto the expedition, and back; only with the office at work', () => {
    const a = load({ eco: eco(), hub: office() }, 20);
    expect(a.eco.coal).toBe(30);
    expect(loaded(a.hub)).toBe(20);
    const b = load(a, -5);
    expect([b.eco.coal, loaded(b.hub)]).toEqual([35, 15]);
    // At most what there is, either way.
    expect(load({ eco: eco({ coal: 3 }), hub: office() }, 10).hub.expedition.load).toBe(3);
    expect(load(b, -100).hub.expedition.load).toBe(0);
    expect(() => load({ eco: eco(), hub: office({ stations: {} }) }, 10)).toThrow(/Expedition office/);
  });

  it('the lift takes the load out; an expedition already out keeps going and the new coal waits; no coal, no errand', () => {
    const fed = load({ eco: eco(), hub: office() }, 12).hub;
    const out = dispatch(fed);
    expect(away(out)).toBe(12);
    expect(loaded(out)).toBe(0);
    const again = dispatch({ ...out, expedition: { ...out.expedition, load: 7 } });
    expect([away(again), loaded(again)]).toEqual([12, 7]);
    expect(dispatch(office())).toEqual(office());
  });
});

describe('coming home', () => {
  it('an expedition fed coal returns scrap, once per departure', () => {
    const out = dispatch({ ...office(), expedition: { load: 20, out: 0, charted: [] } });
    const h = withExpedition(out, haul('m1'));
    expect(h.expedition?.coal).toBe(20);
    expect(h.expedition?.scrap).toBe(20 * EXPEDITION.scrapPerCoal);
    // The same haul taken twice is the same result; once home, nothing is out and the next haul brings nothing.
    expect(withExpedition(out, h)).toBe(h);
    const home = settle(out, h);
    expect(away(home)).toBe(0);
    expect(withExpedition(home, haul('m2')).expedition).toBeUndefined();
    // And a docking that already happened (same haul id) adds none.
    expect(withExpedition({ ...out, lastHaul: haul('m1') }, haul('m1')).expedition).toBeUndefined();
  });

  it('the Boiler Cathedral adds 50%', () => {
    const s = { ...office(), expedition: { load: 0, out: 30, charted: [] } };
    expect(resultOf(s, 30, 'x').scrap).toBe(30 * EXPEDITION.scrapPerCoal);
    expect(resultOf(raise(s, 'cathedral'), 30, 'x').scrap).toBe(Math.round(30 * EXPEDITION.scrapPerCoal * 1.5));
  });

  it('sometimes a junk relic or a charted land (seeded by the haul, an opened land not yet charted)', () => {
    const s = { ...office(), expedition: { load: 0, out: 10, charted: [] } };
    const rolls = Array.from({ length: 80 }, (_, i) => resultOf(s, 10, `h${i}`));
    expect(rolls.some((r) => r.junk)).toBe(true);
    expect(rolls.some((r) => !r.junk)).toBe(true);
    expect(rolls.some((r) => r.charted)).toBe(true);
    expect(cleanJunk(rolls.flatMap((r) => (r.junk ? [r.junk] : [])))).toHaveLength(rolls.filter((r) => r.junk).length);
    // Only the desert is open to a new save, and a charted land is not charted twice.
    expect(rolls.every((r) => !r.charted || r.charted === 'desert')).toBe(true);
    const done = { ...s, expedition: { ...s.expedition, charted: ['desert' as const] } };
    expect(Array.from({ length: 80 }, (_, i) => resultOf(done, 10, `h${i}`)).every((r) => !r.charted)).toBe(true);
    expect(resultOf(s, 10, 'same')).toEqual(resultOf(s, 10, 'same'));
  });

  it('a charted land shows its places on the course table', () => {
    const s = office();
    expect(landings(s)[0].charted).toBeNull();
    const charted = landings({ ...s, expedition: { load: 0, out: 0, charted: ['desert'] } })[0];
    expect(charted.charted?.length).toBeGreaterThan(3);
  });
});

describe('the lift docks (carry.ts)', () => {
  it('banks the expedition\'s scrap with the haul, once, and finishes the buildings that were going up', () => {
    const start = raise({ ...office(), expedition: { load: 0, out: 20, charted: [] } }, 'reliquary', false);
    hub.set(start);
    economy.set(eco({ scrap: 5, cores: 1 }));
    const h = haul('m7', { scrap: 10 });
    const next = land(hub.get(), h);
    expect(economy.get().scrap).toBe(5 + 10 + 20 * EXPEDITION.scrapPerCoal);
    expect(next.buildings.built).toEqual(['reliquary']);
    expect(economy.get().cores).toBe(2);
    expect(away(next)).toBe(0);
    expect(next.lastHaul?.expedition?.scrap).toBe(40);
    // The same lift twice changes nothing.
    land(next, h);
    expect(economy.get().scrap).toBe(55);
    expect(economy.get().cores).toBe(2);
  });

  it('the Lost Expedition\'s husks brought home are civilians in the city', () => {
    const s = land(office(), haul('m8', { carry: { loadout: { weapons: ['shovel'], weapon: 'shovel', secondary: null, support: ['barrage'] }, stats: { civilians: 3 } } }));
    expect(s.civilians).toBe(3);
    expect(land(s, haul('m9')).civilians).toBe(3);
  });

  it('banks a junk relic the expedition found', () => {
    const e = bank(eco({ junk: [] }), haul('j', { expedition: { coal: 10, scrap: 20, junk: 'toaster' } }));
    expect(e.junk).toEqual(['toaster']);
    expect(e.scrap).toBe(20);
  });

  it('homeNews names the expedition and the building that now stands', () => {
    const before = raise(office(), 'aqueducts', false);
    const after = land(before, haul('m3'));
    expect(homeNews(before, after)).toEqual(['Aqueducts stands in the D-city.']);
    const out = { ...office(), expedition: { load: 0, out: 10, charted: [] } };
    expect(homeNews(out, land(out, haul('m4')))[0]).toMatch(/^The expedition is home with 20 scrap/);
  });
});

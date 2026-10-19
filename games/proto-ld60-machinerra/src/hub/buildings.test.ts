import { beforeEach, describe, expect, it } from 'vitest';
import { MISSION, STEAM, SUPPORT, T, TRAM } from '../sim/defs';
import { USE } from '../sim/testkit';
import { NO_INPUT, Sim } from '../sim/sim';
import { slot, hub } from './save';
import { freshTitles, earn } from './titles';
import { freshHub, type HubState } from './state';
import { BUILDINGS, BUILDING_IDS, GATE, OFFERED, SLOTS_BY_STAGE, citySlots, cityFx, draw, finish, hasBuilding, noCity, offer, priceOf, raise, slotsOf, slotsUsed, tearDown, whyNot } from './buildings';
import { buildBlueprint, freshEconomy, type Economy } from './economy';
import { foundried } from './workshop';
import { CITY_STAGES, cityStage } from './state';

beforeEach(() => hub.reset());

/** A hub where the Expeditioner and the City Planner work (their stations stand). */
const city = (o: Partial<HubState> = {}): HubState => ({
  ...freshHub(),
  rescued: ['expeditioner', 'cityPlanner'],
  stations: { expeditioner: 'north-1', cityPlanner: 'south-1' },
  missions: 3,
  ...o,
});
const eco = (o: Partial<Economy> = {}): Economy => ({ ...freshEconomy(), copper: 1000, scrap: 1000, ...o });

describe('the blueprints', () => {
  it('three a visit, seeded by the visit, never one already built or going up', () => {
    const s = city();
    const a = offer(s);
    expect(a).toHaveLength(OFFERED);
    expect(new Set(a).size).toBe(OFFERED);
    expect(offer(city())).toEqual(a);
    expect(offer(city({ missions: 4 }))).not.toEqual(a);
    const some = city({ buildings: { built: [a[0]], raising: [a[1]], pickedAt: -1 } });
    for (let m = 0; m < 30; m++) for (const id of offer({ ...some, missions: m })) expect([a[0], a[1]]).not.toContain(id);
    // Few left: it offers what there is.
    const open = BUILDING_IDS.filter((id) => !GATE[id]); // the gated ones wait for their perk
    const nearly = city({ buildings: { built: open.slice(0, open.length - 2), raising: [], pickedAt: -1 } });
    expect(offer(nearly)).toHaveLength(2);
  });

  it('drawing one up puts it on a slot as scaffolding; one a visit; a pick closes the offer', () => {
    const s = city();
    const [a, b] = offer(s);
    const up = draw(s, a);
    expect(up.buildings.raising).toEqual([a]);
    expect(up.buildings.built).toEqual([]);
    expect(hasBuilding(up, a)).toBe(false);
    expect(offer(up)).toEqual([]);
    expect(() => draw(up, b)).toThrow(/one blueprint a visit/);
    // The next visit offers three more, never the one going up.
    const next = { ...up, missions: up.missions + 1 };
    expect(offer(next)).toHaveLength(OFFERED);
    expect(offer(next)).not.toContain(a);
  });

  it('is refused without the Planner at work, off the offer, or with no free slot', () => {
    const s = city();
    const off = BUILDING_IDS.find((id) => !offer(s).includes(id))!;
    expect(() => draw(s, off)).toThrow(/not on offer/);
    expect(() => draw(s, 'nonsense')).toThrow(/no blueprint/);
    expect(() => draw({ ...s, stations: { expeditioner: 'north-1' } }, offer(s)[0])).toThrow(/City Planner/);
    const full = city({ buildings: { built: BUILDING_IDS.slice(0, citySlots(0)), raising: [], pickedAt: -1 } });
    expect(slotsUsed(full)).toBe(citySlots(0));
    expect(whyNot(full, offer(full)[0])).toMatch(/no free slot/);
  });

  it('costs its price in copper, less the Planner\'s title, and changes nothing when short', () => {
    const s = city();
    const id = offer(s)[0];
    const paid = buildBlueprint({ eco: eco(), hub: s }, id);
    expect(paid.eco.copper).toBe(1000 - BUILDINGS[id].price);
    expect(paid.hub.buildings.raising).toEqual([id]);
    const t = earn(freshTitles(), 'architect');
    expect(priceOf(id, t)).toBe(Math.round(BUILDINGS[id].price * 0.9));
    expect(buildBlueprint({ eco: eco(), hub: s }, id, t).eco.copper).toBe(1000 - priceOf(id, t));
    expect(() => buildBlueprint({ eco: eco({ copper: BUILDINGS[id].price - 1 }), hub: s }, id)).toThrow(/costs/);
  });

  it('a building takes the next mission to finish, then applies its effect', () => {
    const s = raise(city(), 'scrapyard', false);
    expect(cityFx(s.buildings.built).scrapKill).toBe(0);
    const done = finish(s);
    expect(done.done).toEqual(['scrapyard']);
    expect(done.hub.buildings).toEqual({ built: ['scrapyard'], raising: [], pickedAt: -1 });
    expect(cityFx(done.hub.buildings.built).scrapKill).toBe(1);
    expect(finish(done.hub).hub).toBe(done.hub);
  });

  it('the Reliquary of Minds gives its AI core once, when it stands', () => {
    expect(finish(raise(city(), 'reliquary', false)).cores).toBe(1);
    expect(finish(raise(city(), 'foundry', false)).cores).toBe(0);
  });
});

describe('city slots', () => {
  it('4 at first, more as the window grows, always fewer than the buildings; the Planner\'s passive adds one', () => {
    expect(SLOTS_BY_STAGE).toHaveLength(CITY_STAGES.length);
    expect(citySlots(0)).toBe(4);
    expect(SLOTS_BY_STAGE.every((n, i) => n >= (SLOTS_BY_STAGE[i - 1] ?? 0))).toBe(true);
    expect(Math.max(...SLOTS_BY_STAGE) + 1).toBeLessThan(BUILDING_IDS.length);
    const grown = city({ city: CITY_STAGES.at(-1)!.at });
    expect(cityStage(grown)).toBe(CITY_STAGES.length - 1);
    expect(slotsOf(grown)).toBe(SLOTS_BY_STAGE.at(-1));
    expect(slotsOf({ ...grown, perks: [...grown.perks, 'citySlot' as never] })).toBe(SLOTS_BY_STAGE.at(-1)! + 1);
  });
});

describe('what each building does', () => {
  it('the Great Foundry takes 30% off bodies and repairs (scrap), rounded up', () => {
    const none = city(), has = raise(city(), 'foundry');
    expect(foundried(none, { scrap: 45, parts: 0 })).toEqual({ scrap: 45, parts: 0 });
    expect(foundried(has, { scrap: 45, parts: 0 })).toEqual({ scrap: 32, parts: 0 });
    expect(foundried(has, { scrap: 30 }).scrap).toBe(21);
    expect(foundried(has, { copper: 12 } as { scrap?: number })).toEqual({ copper: 12 });
  });

  it('the table: each Main building reads as its row', () => {
    const fx = cityFx(BUILDING_IDS);
    expect(fx).toMatchObject({ scrapKill: 1, duskLater: 30, charges: 1, marked: true });
    expect(fx.comm.map((x) => x.id)).toEqual(['building:aqueducts', 'building:grandAqueduct']);
    expect(cityFx([])).toEqual(noCity());
  });

  it('the Extra buildings (P55 A): offered, paid in copper at their row\'s price, finished by the next dock', () => {
    for (const [id, price] of [['lampFoundry', 90], ['grandAqueduct', 400]] as const) {
      expect(BUILDINGS[id].price, id).toBe(price);
      let s: HubState | null = null;
      const perks = [GATE[id]] as never[]; // quests.md: the Planner offers it once its blueprint is earned
      for (let m = 0; m < 80 && !s; m++) if (offer(city({ missions: m, perks })).includes(id)) s = city({ missions: m, perks });
      expect(s, `${id} is offered some visit`).toBeTruthy();
      const paid = buildBlueprint({ eco: eco(), hub: s! }, id);
      expect(paid.eco.copper).toBe(1000 - price);
      expect(paid.eco.scrap).toBe(1000);
      expect(finish(paid.hub).done).toEqual([id]);
    }
  });

  /** A Sim with the city's mission-side effects, alone and unkillable. */
  const mission = (built: string[], seed = 6) => {
    const s = new Sim(seed, [], 'desert', [], undefined, undefined, { city: cityFx(built) });
    s.bots = [s.controller];
    s.god = true;
    return s;
  };

  it('Aqueducts: steam regenerates 30% faster and holds 20% more', () => {
    const base = mission([]), wet = mission(['aqueducts']);
    expect(wet.engine.stat(wet.controller, 'steamRegen', 1)).toBeCloseTo(1.3);
    expect(wet.engine.stat(wet.controller, 'maxSteam', STEAM.max)).toBeCloseTo(STEAM.max * 1.2);
    expect(base.engine.stat(base.controller, 'steamRegen', 1)).toBe(1);
    expect(wet.controller.maxSteam).toBeCloseTo(STEAM.max * 1.2);
  });

  it('Grand Aqueduct: steam regenerates 50% faster, on top of the Aqueducts', () => {
    const grand = mission(['grandAqueduct']), both = mission(['aqueducts', 'grandAqueduct']);
    expect(grand.engine.stat(grand.controller, 'steamRegen', 1)).toBeCloseTo(1.5);
    expect(both.engine.stat(both.controller, 'steamRegen', 1)).toBeCloseTo(1.8);
    expect(grand.engine.stat(grand.controller, 'maxSteam', STEAM.max)).toBeCloseTo(STEAM.max);
  });

  it('Lamp Foundry: the robots\' lamps are 1.4 times as wide, in the sim and on screen; his own is not', () => {
    const lamps = (built: string[]) => {
      const s = new Sim(6, [], 'desert', [], undefined, undefined, { city: cityFx(built), crew: [{ role: 'lamplighter', name: 'l', uid: 'l' }, { role: 'guard', name: 'g', uid: 'g' }] });
      const l = s.bots.find((x) => x.role === 'lamplighter')!, g = s.bots.find((x) => x.role === 'guard')!;
      return { fx: s.city.lampMul, lamplighter: s.engine.stat(l, 'lamp', 0), guard: s.engine.stat(g, 'lamp', 0), comm: s.engine.stat(s.controller, 'lamp', 0) };
    };
    const plain = lamps([]), lit = lamps(['lampFoundry']);
    expect(plain.fx).toBe(1);
    expect(lit.fx).toBe(1.4);
    expect(plain.lamplighter).toBeGreaterThan(0);
    expect(lit.lamplighter).toBeCloseTo(plain.lamplighter * 1.4);
    expect(lit.guard).toBe(plain.guard);
    expect(lit.comm).toBe(plain.comm);
  });

  it('Scrapyard: one scrap more from every kill', () => {
    const kill = (built: string[]) => {
      const s = mission(built);
      const h = s.spawnHornet(s.controller.x + 80, s.controller.y, 0, false, false, 'hornet');
      const before = s.scrap;
      s.slay(h);
      return s.scrap - before;
    };
    expect(kill(['scrapyard'])).toBe(kill([]) + 1);
  });

  it('Curfew Bell: dusk comes 30 seconds later', () => {
    const plain = mission([]), bell = mission(['curfew']);
    expect(bell.dayCfg.day).toBeCloseTo(plain.dayCfg.day + 30);
    expect(bell.day.at.evening).toBeCloseTo(plain.day.at.evening + 30);
    expect(bell.day.at.midnight).toBeCloseTo(plain.day.at.midnight + 30);
    expect(bell.dayCfg.evening).toBe(plain.dayCfg.evening);
  });

  it('Signal Spire: one more charge of every call', () => {
    const plain = mission([]), spire = mission(['spire']);
    for (const id of Object.keys(plain.support) as (keyof typeof SUPPORT)[]) expect(spire.support[id]).toBe(plain.support[id]! + 1);
  });

  it('Pigeon Aviary: the pilgrim and the vault are marked exactly at landing', () => {
    // A land with a pilgrim place: find a seed where the rough signal is not on the spot.
    let found = false;
    for (let seed = 1; seed < 40 && !found; seed++) {
      const plain = mission([], seed), marked = mission(['aviary'], seed);
      const rough = plain.signals.filter((x) => x.kind === 'pilgrim' || x.kind === 'vault');
      if (!rough.length) continue;
      found = true;
      for (const r of rough) {
        const m = marked.signals.find((x) => x.id === r.id)!;
        expect([m.x, m.y, m.r]).toEqual([r.at.x, r.at.y, 1]);
      }
      // The other signals (shrine, mast, ruins) stay rough.
      for (const r of plain.signals.filter((x) => x.kind !== 'pilgrim' && x.kind !== 'vault')) expect(marked.signals.find((x) => x.id === r.id)).toEqual(r);
    }
    expect(found).toBe(true);
  });

  it('Tram Line: the lift rises in 1 second', () => {
    expect(cityFx([]).riseTime).toBe(MISSION.riseTime);
    expect(cityFx(['tram'])).toMatchObject({ riseTime: TRAM.rise, evacSpeed: TRAM.evac });
    const rise = (built: string[]) => {
      const s = mission(built);
      s.step(1 / 30, USE);
      s.step(1 / 30, NO_INPUT);
      s.step(1 / 30, USE); // the second press confirms the ride
      s.step(1 / 30, NO_INPUT);
      expect(s.phase).toBe('rising');
      for (let t = 0; t < TRAM.rise + 0.2; t += 0.05) s.step(0.05, NO_INPUT);
      return s.phase;
    };
    expect(rise(['tram'])).toBe('done');
    expect(rise([])).toBe('rising');
  });

  it('Tram Line: robots under an evac order run 1.5 times as fast', () => {
    const walked = (built: string[]) => {
      const s = new Sim(6, [], 'desert', [], undefined, undefined, { city: cityFx(built), crew: [{ role: 'guard', name: 'g', uid: 'g' }] });
      s.god = true;
      const b = s.bots.find((x) => x.role === 'guard')!;
      s.hornets = [];
      const at = s.passableNear(s.lift.x + 14 * T, s.lift.y);
      b.x = at.x;
      b.y = at.y;
      s.assign(b.id, 1);
      s.evacuate();
      for (let i = 0; i < 20; i++) s.step(1 / 30, NO_INPUT); // its reaction delay passes
      const x0 = b.x, y0 = b.y;
      for (let i = 0; i < 15; i++) s.step(1 / 30, NO_INPUT);
      return Math.hypot(b.x - x0, b.y - y0);
    };
    const plain = walked([]), tram = walked(['tram']);
    expect(plain).toBeGreaterThan(20);
    expect(tram / plain).toBeCloseTo(TRAM.evac, 1);
  });

  it('a mission still runs with every building up', () => {
    const s = mission(BUILDING_IDS);
    for (let i = 0; i < 90; i++) s.step(1 / 30, NO_INPUT);
    expect(s.time).toBeGreaterThan(2);
  });
});

describe('the save', () => {
  it('an old save without buildings or an expedition loads with none', () => {
    slot.put(0, { slices: { hub: { v: 3, d: { rescued: ['expeditioner'], missions: 2, specialty: 'foundry' } } } });
    const h = hub.get();
    expect(h.buildings).toEqual({ built: [], raising: [], pickedAt: -1 });
    expect(h.expedition).toEqual({ load: 0, out: 0, charted: [], sent: 0 });
    expect(h.civilians).toBe(0);
  });
});

describe('Rebuild (P55 B, D48 row 29)', () => {
  const open = () => BUILDING_IDS.filter((id) => !GATE[id]);
  const full = () => city({ buildings: { built: open().slice(0, SLOTS_BY_STAGE[0]), raising: [], pickedAt: -1 } });

  it('tearing a standing building down frees its slot and pays nothing back', () => {
    const s = full();
    expect(slotsUsed(s)).toBe(slotsOf(s));
    const id = s.buildings.built[1];
    const down = tearDown(s, id);
    expect(hasBuilding(down, id as never)).toBe(false);
    expect(slotsUsed(down)).toBe(slotsOf(s) - 1);
    expect(down.city).toBe(s.city); // the copper the city grew on stays as it was; tearDown takes the hub alone, so no stock moves
    expect(down.buildings.pickedAt).toBe(-1); // it does not use up the visit's blueprint
  });

  it('another is drawn up in the slot at full price, and the torn one is back among her offers', () => {
    const torn = open()[0];
    const s = tearDown(full(), torn);
    expect([...Array(60).keys()].some((m) => offer({ ...s, missions: m }).includes(torn as never))).toBe(true);
    const next = { ...s, missions: 50 };
    const pick = offer(next)[0];
    const b = buildBlueprint({ eco: eco({ copper: 1000 }), hub: next }, pick);
    expect(b.eco.copper).toBe(1000 - BUILDINGS[pick].price);
    expect(b.hub.buildings.raising).toEqual([pick]);
  });

  it('a building under scaffolding cannot be torn down, nor one that does not stand', () => {
    expect(() => tearDown(raise(city(), 'scrapyard', false), 'scrapyard')).toThrow(/scaffolding/);
    expect(() => tearDown(city(), 'foundry')).toThrow(/does not stand/);
    expect(() => tearDown(city(), 'nonsense')).toThrow(/no building/);
    expect(() => tearDown(freshHub(), 'foundry')).toThrow(/Planner/);
  });

  it("the Reliquary's core stays when it comes down, and building it again gives none", () => {
    const down = tearDown(raise(city(), 'reliquary'), 'reliquary');
    expect(finish(raise(down, 'reliquary', false)).cores).toBe(0);
    // A first Reliquary still gives its core, whatever else was torn down.
    expect(finish(raise(tearDown(raise(city(), 'foundry'), 'foundry'), 'reliquary', false)).cores).toBe(1);
  });
});

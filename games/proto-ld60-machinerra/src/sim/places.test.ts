import { describe, expect, it } from 'vitest';
import { flood, generate } from './mapgen';
import { PLACES } from './places';
import { NO_INPUT, Sim } from './sim';
import { ACTION, BIOMES, MISSION, SHRINE, T, type BiomeId } from './defs';
import { RESCUE_THANKS, arrive, freedBy, freshHub, haulFrom, isAboard } from '../hub/state';
import { bank, freshEconomy } from '../hub/economy';
import type { PlaceRT } from './placeplay';
import { generateReal, rideLift, tap } from './testkit';

// A land costs a quarter second to make: a few seeds (the lands are memoized, `harness/testsetup.ts`), and the real generator only where it is the point.
const SEEDS = Array.from({ length: 5 }, (_, i) => i + 1);
/** A land has each place its biome lists once: every one with no presence rule, and a rare one (P36's Scripture) or not. */
const placesOk = (ids: string[], b: BiomeId) =>
  new Set(ids).size === ids.length && ids.every((id) => (BIOMES[b].places as string[]).includes(id)) && BIOMES[b].places.every((id) => ids.includes(id) || Object.keys(PLACES[id].presence).length > 0);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('places in the land', () => {
  it('every land has every place, once, and the same land gives the same places', () => {
    for (const seed of SEEDS) {
      const m = generate(seed);
      expect(placesOk(m.places.map((p) => p.id), 'desert'), `seed ${seed}`).toBe(true);
    }
    expect(generateReal(1).places).toEqual(generateReal(1).places);
    expect(generateReal(1).places).not.toEqual(generateReal(2).places);
  });

  it('every part is reachable on foot from the lift', () => {
    for (const seed of SEEDS) {
      const m = generate(seed);
      const reach = flood(m.ter, m.w, m.h, m.lift);
      for (const p of m.places) for (const q of p.parts) expect(reach[Math.round(q.y) * m.w + Math.round(q.x)], `seed ${seed} ${p.id} ${q.kind}`).toBe(1);
    }
  });

  it('keeps to its band from the lift, and apart from seeps, hives, ruins and other places', () => {
    let widened = 0;
    for (const seed of SEEDS) {
      const m = generate(seed);
      for (const p of m.places) {
        const def = PLACES[p.id];
        const dl = dist(p, m.lift);
        // A land with no room widens the band (at most 1.8x) rather than lose the place.
        const loose = dl < def.band[0] || dl > def.band[1];
        if (loose) widened++;
        if (!p.anchor && p.anchor !== 0) {
          expect(dl, `seed ${seed} ${p.id} lift distance`).toBeGreaterThanOrEqual(def.band[0] / 1.8 - 0.5);
          expect(dl, `seed ${seed} ${p.id} lift distance`).toBeLessThanOrEqual(def.band[1] * 1.8 + 0.5);
        }
        for (const q of p.parts) {
          expect(dist(q, m.lift), `seed ${seed} ${p.id} part from the lift`).toBeGreaterThanOrEqual(8);
          for (const s of m.seeps) expect(dist(q, s), `seed ${seed} ${p.id} vs seep`).toBeGreaterThanOrEqual(def.apart);
          m.nests.forEach((n, i) => {
            if (p.anchor === i) return;
            expect(dist(q, n), `seed ${seed} ${p.id} vs hive`).toBeGreaterThanOrEqual(def.apart);
            if (def.noHive) expect(dist(q, n), `seed ${seed} ${p.id} hive-free`).toBeGreaterThanOrEqual(def.noHive / 1.8 - 0.01);
          });
          for (const o of m.places) if (o !== p) for (const oq of o.parts) expect(dist(q, oq), `seed ${seed} ${p.id} vs ${o.id}`).toBeGreaterThanOrEqual(Math.min(def.apart, PLACES[o.id].apart) - 0.01);
        }
      }
    }
    // The band is the rule, not the exception.
    expect(widened).toBeLessThan(SEEDS.length * 1.5);
  });

  it('the trail runs outward in three verses, ruins on the map like any other', () => {
    for (const seed of SEEDS) {
      const m = generate(seed);
      const trail = m.ruins.filter((r) => r.trail !== undefined).sort((a, b) => a.trail! - b.trail!);
      expect(trail.map((r) => r.kind)).toEqual(['phone', 'dish', 'car']);
      const [a, b, c] = trail.map((r) => dist(r, m.lift));
      expect(a <= b && b <= c, `seed ${seed} verses run outward`).toBe(true);
    }
  });
});

const run = (s: Sim, sec: number, input = NO_INPUT) => {
  for (let i = 0; i < sec * 30; i++) {
    s.step(1 / 30, input);
    s.events.length = 0;
  }
};
/** The Communicator alone, standing at a spot. */
const alone = (seed: number, aboard: string[] = []) => {
  const s = new Sim(seed, ['sprocket', ...aboard]); // Sprocket is level 1's: first in the rescue order, aboard in these
  s.bots = [s.controller];
  s.cfg.morningSwarm = 0; // the morning hive's trickle is not under test
  return s;
};
const stand = (s: Sim, at: { x: number; y: number }, dy = 40) => {
  s.controller.x = at.x;
  s.controller.y = at.y + dy;
};
const place = (s: Sim, id: string) => s.places.find((p) => p.id === id) as PlaceRT;
const USE = { ...NO_INPUT, use: true };

describe('the Steam Gun Shrine', () => {

  it('one press of Use at the case starts opening it, which goes on while he is near and pauses when he is not: the gun is in hand, the hives wake with a burst of hornets', () => {
    const s = alone(3);
    const p = place(s, 'shrine');
    stand(s, p.parts[0]);
    tap(s);
    expect(s.hold?.id).toBe('shrine');
    run(s, SHRINE.hold - 0.5);
    expect(p.state).toBe('sealed'); // the job is long, and nothing is held
    // Out of the zone: paused, its progress kept.
    const home = { x: s.controller.x, y: s.controller.y };
    s.controller.x += SHRINE.reach * ACTION.zone + 60;
    run(s, 0.1);
    const had = s.hold!.t;
    run(s, 1);
    expect(s.hold?.paused).toBe(true);
    expect(s.hold?.t).toBe(had);
    // Back: it goes on by itself, and a hit does not stop it.
    s.controller.x = home.x;
    s.controller.y = home.y;
    s.hurt(s.controller, 2);
    run(s, 0.3);
    expect(s.hold?.paused).toBe(false);
    expect(s.hold!.t).toBeGreaterThan(had);
    expect(p.state).toBe('sealed');
    run(s, 0.7);
    expect(p.state).toBe('open');
    expect([s.weapon, s.secondary]).toEqual(['shovel', 'steamGun']); // the free slot
    expect(p.nests.every((n) => n.awake)).toBe(true);
    expect(s.hornets.length).toBe(4 * SHRINE.burst);
    expect(s.hornets.every((h) => p.nests.some((n) => n.id === h.nest))).toBe(true);
    // Once only.
    tap(s);
    run(s, SHRINE.hold + 0.5);
    expect(s.stats.killed).toBe(0);
    expect(s.placeUse(s.controller.x, s.controller.y)).toBeNull();
  });

});

describe('the Stranded Pilgrim', () => {
  it('is the next NPC of the roster who is not aboard, and absent once all are', () => {
    // The rescue order (P20, systems.md Rescues): Sprocket (aboard here), the Trader, Hob, Gasket, the Expeditioner, the Planner, the Kicker.
    const order = ['trader', 'hob', 'gasket', 'expeditioner', 'cityPlanner', 'kicker'];
    order.forEach((id, i) => expect(alone(3, order.slice(0, i)).pilgrim?.npc.id).toBe(id));
    const none = alone(3, order);
    expect(none.pilgrim).toBeNull();
    expect(none.placeUse(place(none, 'pilgrim').x, place(none, 'pilgrim').y)).toBeNull();
    expect(none.rescued).toEqual([]);
  });

  it('is the NPC the hub names when it names one (a missed NPC waits on their land), and absent when it names none', () => {
    const named = (pilgrim: string | null) => new Sim(3, [], 'desert', [], undefined, undefined, { pilgrim });
    expect(named('kicker').pilgrim?.npc.id).toBe('kicker');
    expect(named(null).pilgrim).toBeNull();
  });

  it('reaches the lift when you rise: rescued into the haul, and aboard in the hub', () => {
    const s = alone(3);
    const pil = s.pilgrim!;
    stand(s, pil.bot, 30);
    s.triggerPlace('pilgrim');
    expect(s.rescued).toEqual([]);
    // Straight home: the Communicator at the lift, the pilgrim walking after.
    s.controller.x = s.lift.x;
    s.controller.y = s.lift.y;
    pil.bot.x = s.lift.x + 3 * T;
    pil.bot.y = s.lift.y;
    run(s, 4);
    rideLift(s);
    expect(s.phase).toBe('done');
    expect(s.rescued).toEqual(['trader']);
    expect(s.said.has('pilgrim-left')).toBe(false); // the Oracle and the rescue agree
    const haul = haulFrom(s, 'm1');
    expect(haul.rescued).toEqual(['trader']);
    const hub = arrive(freshHub(), haul);
    expect(isAboard(hub, 'trader')).toBe(true);
    expect(haul.gathered).toBeUndefined();
    // A real rescue pays, in scrap, through the economy's bank.
    expect(freedBy(freshHub(), haul)).toBe(1);
    expect(bank(freshEconomy(), haul, freedBy(freshHub(), haul) * RESCUE_THANKS).scrap).toBe((haul.scrap ?? 0) + RESCUE_THANKS);
  });

  it('left on the sands if it is not on the lift, or never freed', () => {
    const left = alone(3);
    stand(left, left.pilgrim!.bot, 30);
    left.triggerPlace('pilgrim');
    left.controller.x = left.lift.x;
    left.controller.y = left.lift.y;
    run(left, 0.2);
    left.pilgrim!.bot.x = left.lift.x + 30 * T; // far away
    left.pilgrim!.bot.y = left.lift.y;
    rideLift(left);
    expect(left.phase).toBe('done');
    expect(left.rescued).toEqual([]);
    expect(left.said.has('pilgrim-left')).toBe(true); // the Oracle and the rescue agree
    expect(haulFrom(left, 'x').rescued).toBeUndefined();
    // Left behind or never found, it stays on the sands: only the lift brings an NPC aboard.
    for (const missed of [left, alone(3)]) {
      if (missed !== left) missed.finish();
      const h = haulFrom(missed, 'g');
      expect(h.gathered).toEqual(['trader']);
      const home = arrive(freshHub(), h);
      expect(isAboard(home, 'trader')).toBe(false);
      expect(freedBy(freshHub(), h)).toBe(0); // a missed one pays nothing
    }
    const stuck = alone(3);
    stuck.finish();
    expect(stuck.rescued).toEqual([]);
  });
});

describe('the Parable Trail', () => {
  const verses = (s: Sim) => s.ruins.filter((r) => r.trail !== undefined).sort((a, b) => a.trail! - b.trail!);
  const search = (s: Sim, r: { x: number; y: number }) => {
    stand(s, r, 20);
    s.step(1 / 30, NO_INPUT); // a press needs a key that was up
    const texts: string[] = [];
    for (let i = 0; i < 40; i++) {
      s.step(1 / 30, USE);
      for (const e of s.events) if (e.e === 'ruin') texts.push(e.text);
      s.events.length = 0;
    }
    return texts;
  };

  it('the verses are told as they are found, whichever ruin is searched first, each ruin speaking for what it is', () => {
    const s = alone(3);
    const [a, b, c] = verses(s);
    expect([a.kind, b.kind, c.kind]).toEqual(['phone', 'dish', 'car']);
    // Found out of order: the car first, then the phone, then the dish.
    const one = search(s, c);
    expect(one[0]).toMatch(/car, nose-deep.*verse one/i);
    expect(c.verse).toBe(0);
    expect(search(s, a)[0]).toMatch(/phone.*verse two/i);
    const last = search(s, b)[0];
    expect(last).toMatch(/dish.*verse three/i);
    expect(last).not.toMatch(/car/i);
    expect([c.verse, a.verse, b.verse]).toEqual([0, 1, 2]);
    expect(place(s, 'trail').state).toBe('verse 0/3'); // (the state word is the template's; status reads the ruins)
    expect(s.summary().places.find((p) => p.id === 'trail')!.state).toBe('verse 3/3');
    // In placement order the same: the first found is verse one.
    const t = alone(3);
    const [x, y, z] = verses(t);
    expect(search(t, x)[0]).toMatch(/verse one/i);
    expect(search(t, y)[0]).toMatch(/verse two/i);
    expect(search(t, z)[0]).toMatch(/verse three/i);
  });

});


describe('every biome lays out a playable land', () => {
  it('each place once, and every part, seep, hive and ruin reachable from the lift', () => {
    for (const b of Object.keys(BIOMES) as BiomeId[])
      for (const seed of [1, 2, 7]) {
        const m = generate(seed, undefined, undefined, b);
        const reach = flood(m.ter, m.w, m.h, m.lift);
        expect(placesOk(m.places.map((p) => p.id), b), `${b} ${seed}: ${m.places.map((p) => p.id).join(' ')}`).toBe(true);
        for (const p of m.places) for (const q of p.parts) expect(reach[Math.round(q.y) * m.w + Math.round(q.x)], `${b} ${seed} ${p.id}`).toBe(1);
        for (const p of [...m.seeps, ...m.nests, ...m.ruins]) expect(reach[p.y * m.w + p.x], `${b} ${seed}`).toBe(1);
      }
  });
});

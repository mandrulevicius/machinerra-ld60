import { describe, expect, it } from 'vitest';
import { generate, flood, passable } from './mapgen';
import { NO_INPUT, Sim } from './sim';
import { DAY, LOOT, MISSION, REVIVE, SUPPORT, WINCH } from './defs';
import { dayCfg, dayState, timeOf } from './clock';
import { generateReal, rideLift, tap } from './testkit';

const run = (s: Sim, sec: number, input = NO_INPUT) => {
  for (let i = 0; i < sec * 30; i++) {
    s.step(1 / 30, input);
    s.events.length = 0;
  }
};

/** The Communicator alone (the crew would heal them and pick up cans). */
const alone = (seed: number) => {
  const s = new Sim(seed);
  s.bots = [s.controller];
  return s;
};

describe('desert', () => {
  it('is the same land for the same seed, and everything is reachable from the lift', () => {
    expect(Buffer.from(generateReal(5).ter).equals(Buffer.from(generateReal(5).ter))).toBe(true);
    expect(Buffer.from(generate(5).ter).equals(Buffer.from(generate(6).ter))).toBe(false);
    for (const seed of [1, 2, 3, 42, 'dune']) {
      const m = generate(seed);
      const reach = flood(m.ter, m.w, m.h, m.lift);
      expect(m.seeps.length).toBeGreaterThanOrEqual(5);
      expect(m.nests.length).toBe(3);
      for (const p of [...m.seeps, ...m.nests, ...m.ruins]) expect(reach[p.y * m.w + p.x]).toBe(1);
      expect(passable(m.ter[m.lift.y * m.w + m.lift.x])).toBe(true);
      const near = m.seeps[0];
      expect(Math.hypot(near.x - m.lift.x, near.y - m.lift.y)).toBeLessThan(16);
    }
  });
});

describe('mission', () => {

  it('a crew of gatherers sent to a ruin strips it and brings its copper home; a live ruin is left to the Communicator', () => {
    const s = new Sim(7);
    s.setClock('day');
    for (const b of s.crew) if (b.role === 'gatherer') s.assign(b.id, 1);
    const ruin = s.ruins.find((r) => !r.live)!;
    s.order(1, ruin.x, ruin.y);
    run(s, 25);
    expect(ruin.searched).toBe(true);
    expect(s.ruinToStrip(ruin.x, ruin.y, 9999)?.live ?? false).toBe(false);
    const live = s.ruins.find((r) => r.live && !r.searched);
    if (live) expect(s.ruinToStrip(live.x, live.y, 1)).toBeNull();
  });

  it('a badly damaged robot makes the Oracle suggest the lift, once, and forces nothing; crews ordered home board it and it rises', () => {
    const s = new Sim(7);
    s.nests[0].awake = true;
    const victim = s.crew[0];
    s.hurt(victim, victim.maxHp * 0.6);
    const said: string[] = [];
    for (let i = 0; i < 90; i++) {
      s.step(1 / 30, NO_INPUT);
      for (const e of s.events) if (e.e === 'oracle' || e.e === 'advise') said.push(e.e === 'advise' ? `advise:${e.id}` : e.id);
      s.events.length = 0;
    }
    expect(said).toContain('advise:hurt');
    expect(said.filter((x) => x === 'advise:hurt')).toHaveLength(1);
    expect(s.advised).toBe(true);
    expect(s.phase).toBe('mission');
    for (const b of s.crew) s.assign(b.id, 2);
    s.evacuate();
    run(s, 6);
    expect(s.crew.every((b) => s.onLift(b, 1.6))).toBe(true);
    const c = s.controller;
    c.x = s.lift.x;
    c.y = s.lift.y;
    tap(s);
    tap(s);
    expect(s.phase).toBe('rising');
    run(s, MISSION.riseTime + 0.5);
    expect(s.phase).toBe('done');
    expect(s.stats.saved).toBe(6);
  });

  it('the lift can be ridden at any time, with nothing gathered or deep into the night; whoever is aboard is saved', () => {
    const early = new Sim(3);
    rideLift(early);
    expect(early.phase).toBe('done');
    expect(early.scrap).toBe(0);
    const late = new Sim(3);
    late.setClock('midnight');
    late.scrap = 700;
    run(late, 20);
    rideLift(late);
    expect(late.phase).toBe('done');
    // Whoever stood on the lift is saved, the rest left (P25: a hurt robot falling back to the Repairer, or one healing, may be out of reach in the one second the rise takes).
    expect(late.stats.saved + late.stats.left).toBe(late.fielded.length);
    expect(late.stats.saved).toBeGreaterThanOrEqual(2); // (3 before P11: spiders resist the guards' Pierce now)
  });

});

describe('day', () => {
  const cfg = dayCfg();
  const at = dayState(0, cfg).at;

  it('the clock walks 06:00 to midnight through the phases, then runs on with a menace level that only grows', () => {
    expect(dayState(0, cfg).phase).toBe('morning');
    expect(dayState(0, cfg).hour).toBe(DAY.hours.start);
    expect(dayState(at.day, cfg).phase).toBe('day');
    expect(dayState(at.day, cfg).hour).toBeCloseTo(DAY.hours.day);
    expect(dayState(at.evening, cfg).phase).toBe('evening');
    expect(dayState(at.midnight - 1, cfg).phase).toBe('evening');
    expect(dayState(at.midnight, cfg).phase).toBe('midnight');
    expect(dayState(at.midnight, cfg).hour).toBe(24);
    expect(dayState(at.midnight, cfg).buff).toBe(0);
    let prev = 0;
    for (let s = 0; s <= 600; s += 30) {
      const b = dayState(at.midnight + s, cfg).buff;
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
    expect(prev).toBe(DAY.buffMax);
    expect(at.boss).toBeCloseTo(at.evening + cfg.evening / 2);
    // dev `time` arguments
    expect(timeOf('boss', cfg)).toBe(at.boss);
    expect(timeOf('17:00', cfg)).toBeCloseTo(at.evening);
    expect(timeOf('00:00', cfg)).toBeCloseTo(at.midnight);
    expect(timeOf('nonsense', cfg)).toBeNull();
  });

});

describe('leeway: the oil reserve', () => {
  const can = (s: Sim) => s.drop(s.controller.x, s.controller.y, 'oil');

  it('a can heals the bar first; what the bar cannot hold goes into the reserve, up to the cap', () => {
    const s = alone(3);
    s.reserve = 0;
    s.controller.hp = s.controller.maxHp - 10;
    can(s);
    run(s, 0.2);
    expect(s.controller.hp).toBe(s.controller.maxHp);
    expect(s.reserve).toBe(LOOT.oil - 10);
    for (let i = 0; i < 6; i++) can(s);
    run(s, 0.5);
    expect(s.reserve).toBe(REVIVE.cap);
  });

  it('falling with a can in the reserve revives in place, spends it and gives a beat of grace', () => {
    const s = alone(3);
    s.controller.x += 300;
    const at = { x: s.controller.x, y: s.controller.y };
    s.reserve = REVIVE.cost * 2;
    s.hurt(s.controller, 999);
    expect(s.downKind).toBe('revive');
    run(s, REVIVE.time + 0.2);
    expect(s.controller.x).toBe(at.x);
    expect(s.controller.hp).toBeCloseTo(s.controller.maxHp * REVIVE.oil);
    expect(s.reserve).toBe(REVIVE.cost);
    expect(s.stats.revived).toBe(1);
    expect(s.stats.winched).toBe(0);
    s.hurt(s.controller, 50); // grace
    expect(s.controller.hp).toBeCloseTo(s.controller.maxHp * REVIVE.oil);
    run(s, REVIVE.grace + 0.1);
    s.hurt(s.controller, 10);
    expect(s.controller.hp).toBeLessThan(s.controller.maxHp * REVIVE.oil);
  });

  it('with less than a can, the winch takes over, and the night comes closer', () => {
    const s = alone(3);
    s.controller.x += 300;
    s.reserve = REVIVE.cost - 1;
    const t0 = s.dayT;
    s.hurt(s.controller, 999);
    expect(s.downKind).toBe('winch');
    run(s, WINCH.time + 0.2);
    expect(s.onLift(s.controller)).toBe(true);
    expect(s.stats.winched).toBe(1);
    expect(s.dayT - t0).toBeGreaterThanOrEqual(WINCH.clock + WINCH.time);
  });
});

describe('leeway: D-city air support', () => {
  const D = SUPPORT.barrage;
  /** A band of hornets (and a hive) around a point, and the Communicator's robots standing in it. */
  const setup = () => {
    const s = alone(3);
    s.setClock('day');
    s.god = true;
    const c = s.controller;
    const at = { x: c.x + 200, y: c.y };
    const hs = Array.from({ length: 12 }, (_, i) => s.spawnHornet(at.x + Math.cos(i) * 120, at.y + Math.sin(i) * 90, 0, false, false));
    return { s, c, at, hs };
  };

  it('one call a mission: the shadow comes, holds, then the shells fall and the machines in the circle go; your robots are untouched', () => {
    const { s, c, at } = setup();
    expect(s.callSupport('barrage', at.x, at.y)).toBeNull();
    expect(s.callSupport('barrage', at.x, at.y)).toMatch(/already/);
    run(s, D.tell + D.hold - 0.3);
    expect(s.strike!.phase).toBe('hold');
    expect(s.stats.killed).toBe(0); // nothing yet: the tell and the pause
    run(s, D.fall + 0.6);
    expect(s.stats.killed).toBeGreaterThanOrEqual(8); // most of a swarm that was circling the target
    expect(s.stats.strikes).toBe(1);
    run(s, D.leave + 0.5);
    expect(s.strike).toBeNull();
    expect(s.support.barrage).toBe(0);
    expect(s.callSupport('barrage', at.x, at.y)).toMatch(/spent/);
    expect(c.hp).toBe(c.maxHp);
  });

});

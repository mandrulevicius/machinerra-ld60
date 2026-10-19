import { describe, expect, it } from 'vitest';
import { NO_INPUT, Sim } from './sim';
import { LOOT, TAP } from './defs';

/** The Communicator and his robots, hurt, standing at the tap (`at` px from it). */
const hurtAt = (s: Sim, at: number) => {
  const tap = s.seeps[0];
  for (const b of s.bots) {
    b.x = tap.x + at;
    b.y = tap.y;
    b.hp = b.maxHp - 30;
  }
  return tap;
};

/** The oil each of the Communicator's bots gained over `sec` seconds, standing `at` px from the tap with 30 missing. */
const gained = (at: number, sec: number, oil?: number) => {
  const s = new Sim(3);
  s.bots = [s.controller, ...s.crew.filter((b) => b.role === 'guard').slice(0, 1)];
  s.god = true;
  s.cfg.edge = 0; // nothing to hurt the guard mid-count: no arrival from off the map, no hive
  for (const n of s.nests) n.dead = true;
  const tap = hurtAt(s, at);
  if (oil !== undefined) tap.amount = oil;
  const dry: string[] = [];
  for (let i = 0; i < sec * 30; i++) {
    s.step(1 / 30, NO_INPUT);
    for (const e of s.events) if (e.e === 'dry') dry.push('dry');
    s.events.length = 0;
  }
  return { s, tap, dry, gains: s.bots.map((b) => b.hp - (b.maxHp - 30)) };
};

describe('the tap: a healing shrine (Sim.tapStep)', () => {



  it('runs dry: one tap a land, what it gave went into someone, and it says so once', () => {
    const r = gained(20, 8, 25);
    expect(r.tap.amount).toBe(0);
    expect(r.dry).toHaveLength(1);
    expect(r.s.said.has('tap-dry')).toBe(true);
    const control = gained(TAP.reach + 60, 8);
    expect(r.gains.reduce((a, g) => a + g, 0) - control.gains.reduce((a, g) => a + g, 0)).toBeCloseTo(25, 0);
  });

});

describe('oil is rare: plain kills drop none', () => {
  it('a hundred plain machines downed leave scrap and parts, never a drop of oil; an elite only now and then, small', () => {
    const s = new Sim(5);
    s.bots = [s.controller];
    s.god = true;
    s.setClock('midnight');
    const c = s.controller;
    s.loot.length = 0; // (a place's own tins lie there from the start)
    for (let i = 0; i < 100; i++) {
      const h = s.spawnHornet(c.x + 900, c.y + 900, 0, false, false);
      h.hp = 0;
      s.damageHornet(h, 1, c, 'impact');
    }
    expect(s.loot.filter((l) => l.kind === 'oil')).toHaveLength(0);
    expect(s.loot.length).toBeGreaterThan(0);
    s.loot.length = 0;
    for (let i = 0; i < 60; i++) {
      const h = s.spawnHornet(c.x + 900, c.y + 900, 0, true, false);
      h.hp = 0;
      s.damageHornet(h, 1, c, 'impact');
    }
    const oil = s.loot.filter((l) => l.kind === 'oil');
    expect(oil.length).toBeGreaterThan(0);
    expect(oil.length).toBeLessThan(60 * 0.6);
    expect(oil.every((l) => l.amt === LOOT.eliteOil.amt && l.amt < LOOT.oil)).toBe(true);
  });
});

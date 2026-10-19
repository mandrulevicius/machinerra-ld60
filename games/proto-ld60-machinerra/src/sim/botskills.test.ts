import { describe, expect, it } from 'vitest';
import { T } from './defs';
import { addZone } from './props';
import { NO_INPUT, Sim, type Bot } from './sim';
import type { CrewBot } from './types';

/** A quiet morning land with the Communicator and the given robots only, in a row beside him; hives asleep, the crew cannot be lost. */
const field = (...crew: CrewBot[]) => {
  const s = new Sim(3, [], 'desert', [], undefined, undefined, { crew });
  s.god = true;
  const c = s.controller;
  const bots = s.bots.filter((b) => b !== c);
  s.bots = [c, ...bots];
  bots.forEach((b, i) => {
    b.x = c.x + 50 + i * 30;
    b.y = c.y + 10;
  });
  return { s, c, bots };
};
const run = (s: Sim, sec: number) => {
  const evs: Sim['events'] = [];
  for (let i = 0; i < Math.round(sec * 30); i++) {
    s.step(1 / 30, NO_INPUT);
    evs.push(...s.events);
    s.events.length = 0;
  }
  return evs;
};
const cast = (evs: Sim['events'], b: Bot, why: string) => evs.some((e) => e.e === 'ai' && e.bot === b && e.what === 'cast' && e.why === why);
/** A foe that stays where it is (rooted) and hits no one. */
const post = (s: Sim, x: number, y: number, elite = false) => {
  const h = s.spawnHornet(x, y, 0, elite, false, 'hornet');
  s.engine.apply(h, 'rooted', { duration: 999 });
  h.cd = 999;
  return h;
};

describe('the Berserker (P25)', () => {
  it('leaves its crew for an elite beyond the crew\'s reach; a plain guard stays', () => {
    for (const spec of ['berserker', undefined] as const) {
      const { s, c, bots: [g] } = field({ role: 'guard', name: 'Rivet', uid: 'r1', ...(spec && { spec }) });
      const e = post(s, c.x + 10 * T, c.y + 10, true);
      run(s, 2);
      if (spec) {
        expect(g.mind!.rush).toBe(e.id);
        expect(g.mind!.doing).toBe('fight');
        expect(g.mind!.why).toContain('elite');
        expect(Math.hypot(g.x - e.x, g.y - e.y)).toBeLessThan(Math.hypot(c.x - e.x, c.y - e.y)); // it went, and the Communicator did not
      } else {
        expect(g.mind!.rush).toBe(0);
        expect(Math.hypot(g.x - c.x, g.y - c.y)).toBeLessThan(5 * T);
      }
    }
  });

  it('a plain foe is not worth leaving for', () => {
    const { s, c, bots: [g] } = field({ role: 'guard', name: 'Rivet', uid: 'r1', spec: 'berserker' });
    post(s, c.x + 10 * T, c.y + 10, false);
    run(s, 2);
    expect(g.mind!.rush).toBe(0);
  });
});

describe('the Bulwark\'s taunt (P25)', () => {
  it('is cast when a foe hits an ally under half oil, and turns that foe on the Bulwark', () => {
    const { s, bots: [g, w] } = field({ role: 'guard', name: 'Rivet', uid: 'r1', spec: 'bulwark' }, { role: 'gatherer', name: 'Bellows', uid: 'r2' });
    w.hp = w.maxHp * 0.3;
    const h = s.spawnHornet(w.x + 24, w.y, 0, false, false, 'hornet');
    h.target = w.id;
    h.hp = h.maxHp = 1000; // the Guard's saw would cut it down within the run
    const evs = run(s, 0.8);
    expect(cast(evs, g, 'taunt')).toBe(true);
    expect(s.engine.flag(h, 'taunted')).toBe(true);
  });

  it('is not cast for an ally at good oil, nor with no foe about, and then waits out its cooldown', () => {
    const { s, bots: [g, w] } = field({ role: 'guard', name: 'Rivet', uid: 'r1', spec: 'bulwark' }, { role: 'gatherer', name: 'Bellows', uid: 'r2' });
    expect(cast(run(s, 1), g, 'taunt')).toBe(false);
    const h = s.spawnHornet(w.x + 24, w.y, 0, false, false, 'hornet');
    h.target = w.id;
    expect(cast(run(s, 1), g, 'taunt')).toBe(false); // the gatherer is at full oil
    w.hp = w.maxHp * 0.3;
    h.target = w.id;
    expect(cast(run(s, 0.6), g, 'taunt')).toBe(true);
    w.hp = w.maxHp * 0.3;
    expect(cast(run(s, 3), g, 'taunt')).toBe(false); // 6 s apart
  });
});

describe('hazard patches (P25)', () => {
  it('a guard holds off a patch between it and its foe rather than chasing through it', () => {
    const reach = (patch: boolean) => {
      const { s, c, bots: [g] } = field({ role: 'guard', name: 'Rivet', uid: 'r1' });
      g.x = c.x - 20;
      g.y = c.y;
      const h = post(s, g.x + 7.5 * T, g.y);
      h.hp = h.maxHp = 1e6;
      if (patch) addZone(s, 'fire', g.x + 2.5 * T, g.y, 1.2 * T, 99);
      let far = 0;
      for (let i = 0; i < 120; i++) {
        run(s, 1 / 30);
        far = Math.max(far, g.x - (c.x - 20));
      }
      return far;
    };
    expect(reach(false)).toBeGreaterThan(T); // it closes in on the foe...
    expect(reach(true)).toBeLessThan(T * 0.9); // ...and with the fire in the way it stops short of it
  });
});

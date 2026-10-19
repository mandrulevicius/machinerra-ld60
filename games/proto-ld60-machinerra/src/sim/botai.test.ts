import { describe, expect, it } from 'vitest';
import { T } from './defs';
import { NO_INPUT, Sim, type Bot } from './sim';

/** A quiet morning land with the Communicator and the named robots only, next to him; hives asleep. */
const crew = (...names: string[]) => {
  const s = new Sim(3);
  s.god = true;
  const c = s.controller;
  const bots = names.map((n) => s.bots.find((b) => b.name === n)!);
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
const ai = (evs: Sim['events'], b: Bot, what: string) => evs.some((e) => e.e === 'ai' && e.bot === b && e.what === what);

describe('dodging (P25)', () => {
  it('a robot under a spider pounce steps out of the landing once it is locked, and the leap lands on sand', () => {
    const { s, bots: [g] } = crew('Bellows');
    const sp = s.spawnHornet(g.x + 3 * T, g.y, 0, false, false, 'spider');
    sp.spider!.pounceT = 0;
    sp.spider!.webT = 999;
    let landed: { hits?: number } | undefined, dodged = -1, told = -1;
    for (let i = 0; i < 150 && !landed; i++) {
      s.step(1 / 30, NO_INPUT);
      for (const e of s.events) {
        if (e.e === 'spider' && e.what === 'tellPounce' && told < 0) told = s.time;
        if (e.e === 'ai' && e.bot === g && e.what === 'dodge' && dodged < 0) dodged = s.time;
        if (e.e === 'spider' && e.what === 'land') landed = e;
      }
      s.events.length = 0;
    }
    expect(told).toBeGreaterThan(0);
    expect(dodged - told).toBeGreaterThanOrEqual(g.mind!.delay); // after its reaction delay
    expect(landed?.hits).toBe(0);
    expect(g.hp).toBe(g.maxHp);
  });

});

describe('retreat (P25)', () => {
  it('a hurt robot falls back to its Repairer and rejoins once healed above 60%', () => {
    const { s, bots: [g, rep] } = crew('Bellows', 'Spanner');
    rep.x += 120;
    g.hp = g.maxHp * 0.3;
    s.hurt(g, 1);
    let evs = run(s, 0.5);
    expect(ai(evs, g, 'retreat')).toBe(true);
    expect(g.mind!.doing).toBe('retreat');
    expect(g.mind!.backTo).toBe('repairer');
    evs = run(s, 8);
    expect(ai(evs, g, 'rejoin')).toBe(true);
    expect(g.hp / g.maxHp).toBeGreaterThan(0.6);
    expect(g.mind!.doing).not.toBe('retreat');
  });
});


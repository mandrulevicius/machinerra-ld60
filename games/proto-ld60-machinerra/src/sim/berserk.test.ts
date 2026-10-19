import { describe, expect, it } from 'vitest';
import { BERSERK, DAY, FOES } from './defs';
import { berserkMul, dayCfg, dayState, spawnMul } from './clock';
import { NO_INPUT, Sim } from './sim';

const cfg = dayCfg();
const at = dayState(0, cfg).at;
const run = (s: Sim, sec: number) => {
  for (let i = 0; i < sec * 30; i++) s.step(1 / 30, NO_INPUT);
};

describe('the day curve (P4)', () => {
  it('the twisted share is 10% at dusk, exactly 100% at midnight, linear between, nothing before dusk', () => {
    expect(dayState(at.evening - 1, cfg).twist).toBe(0);
    expect(dayState(at.evening, cfg).twist).toBeCloseTo(DAY.twistStart, 10);
    expect(dayState(at.midnight, cfg).twist).toBe(1);
    expect(dayState(at.midnight + 500, cfg).twist).toBe(1);
    const mid = (at.evening + at.midnight) / 2;
    expect(dayState(mid, cfg).twist).toBeCloseTo((DAY.twistStart + 1) / 2, 10);
    let prev = DAY.twistStart;
    for (let t = at.evening; t <= at.midnight; t += 3) {
      const k = dayState(t, cfg).twist;
      expect(k).toBeGreaterThanOrEqual(prev);
      expect(k - prev).toBeLessThan(0.02); // many small steps
      prev = k;
    }
  });

  it('a berserk step every 10 s past midnight, a menace level every sixth, no ceiling', () => {
    const past = (s: number) => dayState(at.midnight + s, cfg);
    expect(past(0).step).toBe(0);
    expect(past(9.99).step).toBe(0);
    expect(past(10).step).toBe(1);
    expect(past(59.9).level).toBe(0);
    expect(past(60).level).toBe(1);
    expect(past(60).step).toBe(6);
    expect(past(125).level).toBe(2);
    expect(past(3000).level).toBe(50);
    // the level in sixths moves a sixth per step and stops at the top `buff` level
    expect(past(10).buff).toBeCloseTo(1 / 6);
    expect(past(3000).buff).toBe(DAY.buffMax);
  });

  it('each step is small: damage +3%, speed and health +3% (Minos: more than 1%), cooldowns -2%, spawn interval x0.97 down to 40%', () => {
    const one = berserkMul(1), none = berserkMul(0);
    expect(none).toEqual({ dmg: 1, speed: 1, hp: 1, cd: 1 });
    expect(one.dmg).toBeCloseTo(1.03);
    expect(one.speed).toBeCloseTo(1 + BERSERK.speed);
    expect(one.hp).toBeCloseTo(1 + BERSERK.hp);
    expect(one.cd).toBeCloseTo(0.98);
    for (let n = 1; n <= 60; n++) {
      const a = berserkMul(n - 1), b = berserkMul(n);
      expect(b.dmg - a.dmg).toBeLessThanOrEqual(0.031);
      expect(a.cd - b.cd).toBeLessThanOrEqual(0.021);
      expect(b.cd).toBeGreaterThan(0);
    }
    expect(spawnMul(0)).toBe(1);
    expect(spawnMul(1)).toBeCloseTo(0.97);
    expect(spawnMul(10)).toBeCloseTo(0.97 ** 10);
    expect(spawnMul(40)).toBe(BERSERK.spawnFloor);
    expect(spawnMul(500)).toBe(BERSERK.spawnFloor);
  });
});

describe('berserk steps in the mission', () => {
  const alone = () => {
    const s = new Sim(3);
    s.bots = [s.controller];
    s.god = true;
    return s;
  };

  it('an enemy spawned after a step has its numbers; an older one keeps its own; the step is announced', () => {
    const s = alone();
    s.setClock('midnight');
    run(s, 1);
    const early = s.spawnHornet(s.controller.x + 900, s.controller.y, 0, false, true, 'swarmer');
    expect(early.step).toBe(0);
    let announced = 0;
    for (let i = 0; i < 25.2 * 30; i++) {
      s.step(1 / 30, NO_INPUT);
      announced += s.events.filter((e) => e.e === 'berserk').length;
      s.events.length = 0;
    }
    expect(s.day.step).toBe(2);
    expect(announced).toBe(2); // one a step, none skipped
    const late = s.spawnHornet(s.controller.x + 900, s.controller.y, 0, false, true, 'swarmer', { menacing: true }); // a menacing one (the roll is the land's stream's)
    expect(late.step).toBe(2);
    expect(late.maxHp / early.maxHp).toBeCloseTo(1 + BERSERK.hp * 2, 5);
    expect(s.berserk(late).dmg).toBeCloseTo(1.06);
    expect(s.berserk(early).dmg).toBe(1);
    run(s, 12);
    expect(s.berserk(early).dmg).toBe(1); // still at its own step
    // a boss, spawned before midnight, takes the steps so far
    const boss = s.spawnHornet(0, 0, 0, false, false, 'swarmer');
    boss.boss = true;
    boss.bz = undefined;
    expect(s.berserk(boss).dmg).toBeCloseTo(1 + BERSERK.dmg * s.day.step);
  });

  it('before midnight nothing is berserk', () => {
    const s = alone();
    s.setClock('evening');
    run(s, 5);
    const h = s.spawnHornet(s.controller.x + 900, s.controller.y, 0, false, false, 'swarmer');
    expect(h.step).toBe(0);
    expect(h.maxHp).toBeCloseTo(FOES.swarmer.hp);
  });

  it('the hives let hornets out faster a step at a time: about 2.5x as often 40 steps in', () => {
    const spawned = (past: number) => {
      const s = alone();
      s.setClock(s.day.at.midnight + past);
      s.cfg.swarm = 1;
      for (const n of s.nests) { n.awake = true; n.spawnT = 0; }
      let n = 0;
      for (let i = 0; i < 30 * 30; i++) {
        s.step(1 / 30, NO_INPUT);
        for (const e of s.events) if (e.e === 'spawn' && e.h.nest !== 0) n++; // the hives' own (a hunter pack has no hive)
        s.events.length = 0;
        for (const h of s.hornets) h.hp = 0, h.dead = true; // room for the next one
      }
      return n;
    };
    const first = spawned(0), later = spawned(400);
    expect(later / first).toBeGreaterThan(1.8);
    expect(later / first).toBeLessThan(3.2);
  });

  it('a new game kicks with no perk', () => {
    const s = new Sim(3, [], 'desert', []);
    expect(s.perks.has('kick')).toBe(false);
    const c = s.controller;
    s.bots = [c];
    const h = s.spawnHornet(c.x + 30, c.y, 0, false, false, 'swarmer');
    s.step(1 / 30, { ...NO_INPUT, ax: c.x + 100, ay: c.y, kick: true });
    expect(s.events.some((e) => e.e === 'swing' && e.kick)).toBe(true);
    void h;
  });
});

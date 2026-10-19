import { crashDmg } from './crash';
import { describe, expect, it } from 'vitest';
import { NO_INPUT, Sim, type Hornet } from './sim';
import { SHATTER, STATUS_AI } from './missionfx';
import { KICK, T } from './defs';
import { DEV_SOURCES } from './missionfx';

/** The Communicator alone on a desert, with the kick. */
const alone = () => {
  const s = new Sim(3, [], 'desert', ['kick']);
  s.bots = [s.controller];
  s.god = true;
  return s;
};
const dummy = (s: Sim, x: number, y: number, kind: 'swarmer' | 'drone' = 'swarmer') => {
  const h = s.spawnHornet(x, y, 0, false, false, kind);
  h.hp = h.maxHp = 500;
  h.brain.t = 999;
  return h;
};
const kick = (s: Sim) => s.step(1 / 30, { ...NO_INPUT, ax: s.controller.x + 100, ay: s.controller.y, kick: true });

describe('Frozen: a kick shatters it (P11)', () => {
  it('a kick on a Frozen enemy takes a full crash at the kick\'s speed, ends the ice and sends shards into the enemies round it', () => {
    const s = alone();
    const c = s.controller;
    const ice = dummy(s, c.x + 30, c.y);
    const near = dummy(s, c.x + 30 + 55, c.y); // behind the ice, out of the kick's reach, inside the shards'
    const far = dummy(s, c.x + 30 + SHATTER.radius + 60, c.y);
    s.engine.apply(ice, 'frozen');
    kick(s);
    expect(s.engine.flag(ice, 'frozen')).toBe(false);
    expect(ice.maxHp - ice.hp).toBeGreaterThanOrEqual(crashDmg(KICK.knock) - 0.01);
    expect(near.maxHp - near.hp).toBeCloseTo(SHATTER.shards);
    expect(far.hp).toBe(far.maxHp);
    expect(s.stats.shatters).toBe(1);
    expect(s.events.some((e) => e.e === 'shatter')).toBe(true);
  });

});

describe('Blinded, Taunted and Marked change who an enemy goes for (P11)', () => {
  const duo = () => {
    const s = new Sim(3);
    s.god = true;
    const c = s.controller;
    const g = s.bots.find((b) => b.role === 'guard')!;
    s.bots = [c, g];
    g.x = c.x + 40;
    g.y = c.y;
    g.hold = { x: g.x, y: g.y };
    return { s, c, g };
  };
  const target = (s: Sim, h: Hornet, steps = 3) => {
    for (let i = 0; i < steps; i++) s.step(1 / 30, NO_INPUT);
    return h.target;
  };

  it('an enemy sees the nearest robot; Blinded, it sees nothing past a short range and drops a target it had', () => {
    const { s, c } = duo();
    const h = dummy(s, c.x + 6 * T, c.y);
    expect(target(s, h)).toBeGreaterThan(0);
    s.engine.apply(h, 'blinded', { duration: 5 });
    expect(target(s, h)).toBe(0);
    const near = dummy(s, c.x + (STATUS_AI.blindTiles - 1) * T, c.y);
    s.engine.apply(near, 'blinded', { duration: 5 });
    expect(target(s, near)).toBeGreaterThan(0);
    // The blindness ends and it sees again.
    s.engine.strip(h, 'blinded');
    expect(target(s, h)).toBeGreaterThan(0);
  });

});

describe('hives are engine units (P11)', () => {
  it('a hit on a hive goes through the engine: the attacker\'s damage mods apply, a status rides, it wakes and it falls', () => {
    const s = alone();
    const c = s.controller;
    const n = s.addNest(c.x + 30, c.y + 10);
    expect(s.engine.has(n)).toBe(true);
    expect(n.awake).toBe(false);
    s.addSource(c, { id: 'dev:dmg', kind: 'other', effects: [{ when: 'always', do: { do: 'stat', stat: 'damage', pct: 1 } }] });
    const hp = n.hp;
    s.step(1 / 30, { ...NO_INPUT, ax: c.x + 100, ay: c.y, fire: true });
    expect(hp - n.hp).toBeGreaterThan(0);
    expect(n.awake).toBe(true);
    s.addSource(c, DEV_SOURCES.riders);
    s.engine.strike(c, n, { type: 'fire', amount: 1, via: 'gun' });
    expect(s.engine.stacks(n, 'burning')).toBe(1);
    n.hp = 1;
    s.engine.strike(c, n, { type: 'impact', amount: 5, via: 'melee' });
    s.step(1 / 30, NO_INPUT);
    expect(n.dead).toBe(true);
    expect(s.stats.nests).toBe(1);
    expect(s.engine.has(n)).toBe(false);
  });

});

describe('Bot.slow is the engine\'s speed stat (P11)', () => {

  it('a slowed robot walks slower than a free one, and a Rooted one not at all', () => {
    const walk = (setup: (s: Sim) => void) => {
      const s = alone();
      setup(s);
      const x = s.controller.x;
      for (let i = 0; i < 30; i++) s.step(1 / 30, { ...NO_INPUT, mx: 1 });
      return s.controller.x - x;
    };
    const free = walk(() => {});
    const slowed = walk((s) => s.engine.hold(s.controller, 'dev', { stat: 'speed', more: 0.5 }));
    expect(free).toBeGreaterThan(20);
    expect(slowed).toBeCloseTo(free * 0.5, 0);
    expect(walk((s) => s.engine.apply(s.controller, 'rooted', { duration: 5 }))).toBe(0);
  });
});

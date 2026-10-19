import { describe, expect, it } from 'vitest';
import { STOKE } from './stoke';
import { NO_INPUT, Sim, type Bot, type Hornet } from './sim';
import type { CrewBot } from './types';
import type { SpecId } from './specs';

/** Stoking (`stoke.ts`): +30% speed on a stoked robot, and a stoked Firebrand's damage and fire. */
const field = (...crew: CrewBot[]) => {
  const s = new Sim(3, [], 'desert', [], undefined, undefined, { crew });
  s.god = true;
  const c = s.controller;
  const bots = s.bots.filter((b) => b !== c);
  bots.forEach((b, i) => {
    b.x = c.x + 50 + i * 30;
    b.y = c.y + 10;
  });
  return { s, c, bots };
};
const bot = (role: CrewBot['role'], o: Partial<CrewBot> = {}): CrewBot => ({ role, name: role, uid: role, ...o });
const run = (s: Sim, sec: number, each?: () => void) => {
  for (let i = 0; i < Math.round(sec * 30); i++) {
    s.step(1 / 30, NO_INPUT);
    s.events.length = 0;
    each?.();
  }
};

describe('a stoked robot moves faster', () => {
  it('+30% on the speed stat, for any robot; a cold one is unchanged', () => {
    const { s, bots: [cold, hot] } = field(bot('guard'), bot('guard', { name: 'Hot', uid: 'hot', stoked: true }));
    expect(s.mobility(cold)).toBe(1);
    expect(s.mobility(hot)).toBeCloseTo(1 + STOKE.speed, 5);
  });
  it('goes on and off with the flag (the dev command), and not on the Communicator', () => {
    const { s, c, bots: [b] } = field(bot('mule'));
    s.setStoked(b, true);
    expect(s.mobility(b)).toBeCloseTo(1.3, 5);
    expect(s.summary().crew[0]).toMatchObject({ stoked: true });
    s.setStoked(b, false);
    expect(s.mobility(b)).toBe(1);
    expect(s.summary().crew[0].stoked).toBeUndefined();
    s.setStoked(c, true);
    expect(s.mobility(c)).toBe(1);
  });
  it('covers 30% more ground on the same order', () => {
    const go = (stoked: boolean) => {
      const { s, c, bots: [b] } = field(bot('guard', { stoked }));
      s.hornets = [];
      b.x = c.x + 20;
      const x0 = b.x;
      s.assign(b.id, 1);
      s.order(1, b.x + 260, b.y);
      run(s, 1.2);
      return b.x - x0;
    };
    const cold = go(false), hot = go(true);
    expect(cold).toBeGreaterThan(20);
    expect(hot / cold).toBeGreaterThan(1.2);
    expect(hot / cold).toBeLessThan(1.4);
  });
});

describe('a stoked Firebrand hits harder and its fire burns hotter', () => {
  const setup = (stoked: boolean, spec: SpecId | undefined = 'firebrand') => {
    const { s, c, bots: [g] } = field(bot('gatherer', { ...(spec && { spec }), ...(stoked && { stoked }) }));
    s.hornets = [];
    const foe: Hornet = s.spawnHornet(c.x + 130, c.y, 0, false, false, 'hornet');
    s.engine.apply(foe, 'rooted', { duration: 9999 });
    foe.cd = 9999;
    foe.hp = foe.maxHp = 1e6;
    s.engine.strip(foe, 'rooted');
    return { s, g, foe, keep: () => s.engine.apply(foe, 'rooted', { duration: 0.1 }) };
  };
  it('its damage stat is +30%; another gatherer stoked gets speed only', () => {
    const fb = setup(true), cold = setup(false), miner = setup(true, 'siphoner');
    expect(fb.s.engine.stat(fb.g, 'damage', 100)).toBeCloseTo(130, 5);
    expect(cold.s.engine.stat(cold.g, 'damage', 100)).toBeCloseTo(100, 5);
    expect(miner.s.engine.stat(miner.g, 'damage', 100)).toBeCloseTo(100, 5);
    expect(miner.s.mobility(miner.g)).toBeCloseTo(1.3, 5);
  });
  it('the fire it lays is marked hot and burns the foe 30% harder than a cold Firebrand\'s', () => {
    const burn = (stoked: boolean) => {
      const { s, foe, keep } = setup(stoked);
      run(s, 5, keep); // the slick (3 s), then its spark
      const fires = s.props.zones.filter((z) => z.kind === 'fire');
      expect(fires.length).toBeGreaterThan(0);
      expect(fires.every((z) => !!z.stoked)).toBe(stoked);
      s.props.zones.forEach((z) => (z.life = 99)); // keep the fire for the measurement
      const before = foe.hp;
      run(s, 4, keep);
      return before - foe.hp;
    };
    const cold = burn(false), hot = burn(true);
    expect(cold).toBeGreaterThan(5);
    expect(hot / cold).toBeGreaterThan(1.25);
    expect(hot / cold).toBeLessThan(1.35);
  });
});

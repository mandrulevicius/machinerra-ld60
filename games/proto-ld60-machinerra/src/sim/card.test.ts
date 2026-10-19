import { describe, expect, it } from 'vitest';
import { DECODE } from './defs';
import { NO_INPUT, Sim, type Ruin } from './sim';
import { ruinTip } from '../tips';

/** Minos: not more than one card a stage. The first insight earns it; later sources say so and pay nothing toward a card. */
const USE = { ...NO_INPUT, use: true };
const alone = () => {
  const s = new Sim(3, [], 'desert');
  s.bots = [s.controller];
  return s;
};
const decode = (s: Sim, r: Ruin) => {
  s.controller.x = r.x;
  s.controller.y = r.y + 20;
  const seen: Sim['events'] = [];
  s.step(1 / 30, NO_INPUT);
  for (let i = 0; i < Math.round((DECODE.time + 0.5) * 30); i++) {
    s.step(1 / 30, USE);
    seen.push(...s.events);
    s.events.length = 0;
  }
  return seen.filter((e) => e.e === 'card');
};

describe('the stage\'s one card', () => {
  it('a stage that finds nothing earns no card', () => {
    const s = alone();
    expect(s.cardEarned).toBe(false);
    expect(s.insight).toBe(0);
  });

  it('the first decode earns it and says so; the next says it is already earned and adds none', () => {
    const s = alone();
    const [a, b] = s.ruins.filter((r) => r.live);
    expect(ruinTip(s, a).more).toContain('earns this stage');
    expect(decode(s, a)).toMatchObject([{ e: 'card', first: true }]);
    expect(s.cardEarned).toBe(true);
    expect(s.insight).toBe(1);
    expect(ruinTip(s, b).more).toContain('already earned');
    expect(decode(s, b)).toMatchObject([{ e: 'card', first: false }]);
    expect(s.insight).toBe(1);
  });

  it('every other source is the same one card: the mast, the Parable, a den, a building', () => {
    const s = alone();
    s.addInsight(1, { x: 0, y: 0 });
    s.addInsight(1, { x: 0, y: 0 });
    s.addInsight(5);
    expect(s.insight).toBe(1);
    expect(s.events.filter((e) => e.e === 'card').map((e) => (e as { first: boolean }).first)).toEqual([true, false]);
  });

  it('a dungeon under a land that earned the card earns nothing more', () => {
    const d = new Sim(3, [], 'desert', [], undefined, undefined, { dungeon: true, cardHeld: true });
    expect(d.cardEarned).toBe(true);
    d.addInsight(1, { x: 0, y: 0 });
    expect(d.insight).toBe(0);
    expect(d.events.some((e) => e.e === 'card' && !e.first)).toBe(true);
    const fresh = new Sim(3, [], 'desert', [], undefined, undefined, { dungeon: true });
    fresh.addInsight(1);
    expect(fresh.insight).toBe(1);
  });
});

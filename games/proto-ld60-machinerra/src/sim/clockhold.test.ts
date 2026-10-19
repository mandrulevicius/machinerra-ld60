import { describe, expect, it } from 'vitest';
import { dayCfg, dayState } from './clock';
import { CLOCK_HOLD, HOLD_SHY, held, holdAt } from './clockhold';
import { NO_INPUT, Sim } from './sim';
import { eliteChance } from './tiers';

const cfg = dayCfg();
const run = (s: Sim, sec: number) => {
  for (let t = 0; t < sec; t += 1 / 30) s.step(1 / 30, NO_INPUT);
};

describe('the clock held by missions flown (P59 B)', () => {
  it('the table: level 1 locked, then the day, then the evening; later missions and an unset count run free', () => {
    expect(CLOCK_HOLD).toEqual({ 1: 'lock', 2: 'day', 3: 'evening' });
    expect(holdAt(0, cfg)).toBeNull();
    expect(holdAt(4, cfg)).toBeNull();
    expect(holdAt(Infinity, cfg)).toBeNull();
  });

  it('each cap stays inside its phase, whatever the time given', () => {
    const lock = held(1e6, holdAt(1, cfg)), day = held(1e6, holdAt(2, cfg)), eve = held(1e6, holdAt(3, cfg));
    expect(lock).toBe(0);
    expect(dayState(lock, cfg).phase).toBe('morning');
    expect(dayState(day, cfg).phase).toBe('day');
    expect(dayState(day + HOLD_SHY * 2, cfg).phase).toBe('evening');
    expect(dayState(eve, cfg).phase).toBe('evening');
    expect(dayState(eve, cfg).step).toBe(0);
    expect(dayState(eve, cfg).menacing).toBe(0);
    expect(held(30, holdAt(2, cfg))).toBe(30);
    expect(held(30, null)).toBe(30);
  });

  it('a Sim stepped far past its cap stays in the held phase, and a dev jump cannot leave it', () => {
    const l1 = new Sim(7, [], 'desert', [], undefined, undefined, { flown: 1 });
    run(l1, 200);
    expect(l1.dayT).toBe(0);
    expect(l1.day.phase).toBe('morning');
    const e1 = new Sim(7, [], 'desert', [], undefined, undefined, { flown: 2 });
    for (const id of ['clock', 'map']) e1.lessons.given.add(id); // mission 3's landing pauses
    e1.setClock('day');
    run(e1, 400);
    expect(e1.day.phase).toBe('day');
    expect(e1.day.twist).toBe(0);
    e1.setClock('midnight');
    run(e1, 1);
    expect(e1.day.phase).toBe('day');
    const e2 = new Sim(7, [], 'desert', [], undefined, undefined, { flown: 3 });
    e2.lessons.hush = null;
    e2.setClock('evening');
    run(e2, 500);
    expect(e2.day.phase).toBe('evening');
    expect(e2.day.level).toBe(0);
    const free = new Sim(7, [], 'desert', [], undefined, undefined, { flown: 4 });
    free.lessons.hush = null;
    free.setClock('midnight');
    run(free, 1);
    expect(free.day.phase).toBe('midnight');
  });

  it('a held clock holds the ramps read from it (swarm intensity, elite share) while it stands', () => {
    const s = new Sim(7, [], 'desert', [], undefined, undefined, { flown: 2 });
    for (const id of ['clock', 'map']) s.lessons.given.add(id); // mission 3's landing pauses
    s.setClock('day');
    run(s, 20);
    const [i, e, d] = [s.intensity, eliteChance(s), s.dayT];
    run(s, 120);
    expect(s.dayT).toBe(d);
    expect(s.intensity).toBe(i);
    expect(eliteChance(s)).toBe(e);
  });

  it('the winch\'s clock cost cannot push a held clock over either', () => {
    const s = new Sim(7, [], 'desert', [], undefined, undefined, { flown: 2 });
    s.addClock(1e6);
    expect(dayState(s.dayT, s.dayCfg).phase).toBe('day');
  });
});

import { describe, expect, it } from 'vitest';
import { ALARM, Fader, HIT, chipWeight, hitScale, oilAlarm, oracleHold, pickupSize } from './attention';

describe('oil alarm', () => {
  it('is silent above the threshold and rises to 1 at empty', () => {
    expect(oilAlarm(1)).toBe(0);
    expect(oilAlarm(ALARM.from)).toBe(0);
    expect(oilAlarm(ALARM.from / 2)).toBeCloseTo(0.5);
    expect(oilAlarm(0)).toBe(1);
    expect(oilAlarm(-0.2)).toBe(1);
  });
});

describe('Fader', () => {
  it('rests until its value changes, then comes forward for the hold', () => {
    const f = new Fader(2);
    f.see(10);
    expect(f.forward()).toBe(false);
    f.see(10);
    expect(f.forward()).toBe(false);
    f.see(9);
    expect(f.forward()).toBe(true);
    f.step(1.5);
    expect(f.forward()).toBe(true);
    f.step(1);
    expect(f.forward()).toBe(false);
  });
  it('is forward while urgent or hovered, whatever its age', () => {
    const f = new Fader(1);
    f.see('a');
    expect(f.forward(true)).toBe(true);
    expect(f.forward(false, true)).toBe(true);
    expect(f.forward()).toBe(false);
  });
  it('can be poked forward', () => {
    const f = new Fader(1);
    f.poke();
    expect(f.forward()).toBe(true);
    f.poke(5);
    f.step(3);
    expect(f.forward()).toBe(true);
  });
});

describe('weights', () => {
  it('a calm Oracle line fades before a warning', () => {
    expect(oracleHold('calm')).toBeLessThan(oracleHold('warn'));
    expect(oracleHold('urgent')).toBe(oracleHold('warn'));
  });
  it('a well idle robot rests; a hurt, fighting or lost one is forward', () => {
    const b = { hp: 20, maxHp: 20, dead: false, state: 'idle' };
    expect(chipWeight(b)).toBe('rest');
    expect(chipWeight({ ...b, hp: 10 })).toBe('up');
    expect(chipWeight({ ...b, state: 'fight' })).toBe('up');
    expect(chipWeight({ ...b, dead: true })).toBe('up');
  });
  it('a tick of damage is a small effect, a weapon blow near full', () => {
    expect(hitScale(0)).toBeCloseTo(0.45);
    expect(hitScale(HIT.small)).toBeCloseTo(0.45);
    expect(hitScale(9)).toBeGreaterThan(0.75);
    expect(hitScale(HIT.full)).toBe(1);
    expect(hitScale(100)).toBe(1);
  });
  it('routine pickups are said small, parts and cores full', () => {
    expect(pickupSize('scrap')).toBeLessThan(pickupSize('part'));
    expect(pickupSize('core')).toBe(pickupSize('part'));
  });
});

import { describe, expect, it } from 'vitest';
import { DANGLE, accelOf, newDangle, nudge, stepDangle } from './dangle';

const run = (d: ReturnType<typeof newDangle>, ax: number, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepDangle(d, ax, 1 / 60);
};

describe('the dangle', () => {
  it('hangs still when nothing moves it', () => {
    const d = newDangle();
    run(d, 0, 2);
    expect(Math.abs(d.th)).toBeLessThan(1e-6);
  });
  it('lags behind a carrier that sets off to the right, then swings on past hanging when he stops', () => {
    const d = newDangle();
    run(d, 700, 0.15); // accelerating right: it trails to the left
    expect(d.th).toBeLessThan(-0.1);
    let top = 0;
    for (let t = 0; t < 1.2; t += 1 / 60) {
      stepDangle(d, t < 0.05 ? -700 : 0, 1 / 60); // he stops
      top = Math.max(top, d.th);
    }
    expect(top).toBeGreaterThan(0.1); // it swung forward
  });
  it('settles again, and never swings past its limit', () => {
    const d = newDangle();
    run(d, 5000, 0.5);
    expect(Math.abs(d.th)).toBeLessThanOrEqual(DANGLE.max + 1e-9);
    run(d, 0, 4);
    expect(Math.abs(d.th)).toBeLessThan(0.02);
  });
  it('is nudged by steps, alternating sides', () => {
    const d = newDangle();
    nudge(d);
    const first = d.w;
    d.w = 0;
    nudge(d);
    expect(Math.sign(d.w)).toBe(-Math.sign(first));
  });
  it('reads the carrier\'s acceleration, smoothed', () => {
    const d = newDangle();
    let a = 0;
    for (let i = 0; i < 6; i++) a += accelOf(d, 110, 1 / 60); // sets off to 110 px/s
    expect(a).toBeGreaterThan(0);
    const v = d.vx;
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThanOrEqual(110);
    expect(accelOf(d, 110, 1 / 60)).toBeLessThan(1500);
  });
});

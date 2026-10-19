import { describe, expect, it } from 'vitest';
import { LIFT, liftSpeed, liftUp, reach } from './liftrise';

const T = 3;

describe('the lift climb', () => {
  it('starts and ends in step: no jump in position or speed anywhere', () => {
    const end = reach(360 + 40);
    let prev = liftUp(0, T, end), prevV = 0;
    // (it stops at T, long after it has left the view: the next test)
    for (let i = 1; i < T * 240; i++) {
      const t = i / 240;
      const y = liftUp(t, T, end), v = (y - prev) * 240;
      // position moves by a hair a frame, speed by a hair a frame (a join would show as a step)
      expect(Math.abs(y - prev)).toBeLessThan(end * 0.012);
      expect(Math.abs(v - prevV)).toBeLessThan(end * 0.2);
      expect(Math.abs(liftSpeed(t, T, end) - v)).toBeLessThan(end * 0.03);
      prev = y;
      prevV = v;
    }
    expect(liftSpeed(0.001, T, end)).toBeLessThan(1);
  });

  it('settles a few px, then only goes up', () => {
    const end = reach(360 + 40);
    let low = 0;
    for (let i = 0; i <= T * 100; i++) low = Math.min(low, liftUp(i / 100, T, end));
    expect(low).toBeLessThan(0);
    expect(low).toBeGreaterThan(-LIFT.dip - 0.01);
    for (let t = 1.5; t < T; t += 0.01) expect(liftUp(t + 0.01, T, end)).toBeGreaterThan(liftUp(t, T, end));
  });

  it('carries the platform off the top of the view before the rise ends, at any zoom', () => {
    for (const zoom of [0.6, 1, 1.5]) {
      const end = reach(720 / (2 * zoom) + 40);
      const top = 720 / (2 * zoom) + 40; // the platform's foot below the view's top edge when it starts, game px
      const camera = (t: number) => LIFT.follow * liftUp(t, T, end);
      const gone = (t: number) => liftUp(t, T, end) - camera(t) > top;
      expect(gone(T * LIFT.exit + 0.05)).toBe(true);
      expect(gone(T * 0.6)).toBe(false);
    }
  });
});

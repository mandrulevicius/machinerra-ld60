import { describe, expect, it } from 'vitest';
import { NIGHT_FLOOR, sunLean, throwAt, type Src } from './sun';

const len = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);

describe('the sun', () => {
  it('throws shadows left in the morning, short at noon, right in the evening, always down the screen', () => {
    const am = sunLean(6.5), noon = sunLean(12), pm = sunLean(17);
    expect(am.x).toBeLessThan(-0.3);
    expect(Math.abs(noon.x)).toBeLessThan(0.01);
    expect(pm.x).toBeGreaterThan(0.3);
    for (const v of [am, noon, pm]) expect(v.y).toBeGreaterThan(0);
    expect(len(noon)).toBeLessThan(len(am) / 2);
    expect(len(noon)).toBeLessThan(len(pm) / 2);
  });
  it('turns smoothly with the hour and holds past the ends', () => {
    let prev = sunLean(6);
    for (let h = 6.1; h <= 18; h += 0.1) {
      const v = sunLean(h);
      expect(Math.hypot(v.x - prev.x, v.y - prev.y)).toBeLessThan(0.12);
      prev = v;
    }
    expect(sunLean(3)).toEqual(sunLean(6));
    expect(sunLean(26)).toEqual(sunLean(18));
  });
});

describe('the lamps at night', () => {
  const sun = sunLean(17);
  const out = { x: 0, y: 0, a: 1 };
  const lamp: Src = { x: 0, y: 0, r: 200, i: 1 };
  it('ignores the lamps by day', () => {
    throwAt(100, 0, sun, 0, [lamp], out);
    expect(out.x).toBeCloseTo(sun.x);
    expect(out.a).toBe(1);
  });
  it('leans away from a lamp, longer the farther, short right under it', () => {
    throwAt(100, 0, sun, 1, [lamp], out);
    expect(out.x).toBeGreaterThan(sun.x + 0.1);
    const far = out.x;
    throwAt(-60, 0, sun, 1, [lamp], out);
    expect(out.x).toBeLessThan(0);
    expect(Math.abs(out.x)).toBeLessThan(far);
    throwAt(0.01, 0, sun, 1, [lamp], out);
    expect(len(out)).toBeLessThan(len(sun));
  });
  it('fades where no light reaches but never to nothing', () => {
    throwAt(900, 900, sun, 1, [lamp], out);
    expect(out.a).toBeCloseTo(NIGHT_FLOOR);
    expect(out.x).toBeCloseTo(sun.x);
    throwAt(900, 900, sun, 1, [], out);
    expect(out.a).toBeCloseTo(NIGHT_FLOOR);
  });
  it('is brighter near a stronger light', () => {
    throwAt(80, 0, sun, 1, [{ ...lamp, i: 0.2 }], out);
    const weak = out.a;
    throwAt(80, 0, sun, 1, [{ ...lamp, i: 1.5 }], out);
    expect(out.a).toBeGreaterThan(weak);
  });
});

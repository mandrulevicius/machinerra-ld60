import { describe, expect, it } from 'vitest';
import { SAW_ARM, STROKE, canvasPoint, swingAt } from './sawarm';

describe("the Guard's saw arm", () => {
  it('rests at 0, lifts, chops past the rest pose and comes back', () => {
    expect(swingAt(0)).toBe(0);
    expect(swingAt(STROKE)).toBe(0);
    expect(swingAt(SAW_ARM.times[0])).toBeCloseTo(SAW_ARM.lift);
    expect(swingAt(SAW_ARM.times[0] + SAW_ARM.times[1])).toBeCloseTo(SAW_ARM.chop);
    for (let t = 0; t < STROKE; t += 0.01) expect(Math.abs(swingAt(t))).toBeLessThanOrEqual(Math.max(Math.abs(SAW_ARM.lift), SAW_ARM.chop) + 1e-9);
  });

  it('a canvas point lies where the sprite draws it: the origin on the body, a mirrored one across it, a turned one about it', () => {
    const [w, h] = SAW_ARM.canvas, [ox, oy] = SAW_ARM.origin;
    const o = canvasPoint(w * ox, h * oy, 100, 200, 0.5, 0.5, 1, 0.7);
    expect(o.x).toBeCloseTo(100);
    expect(o.y).toBeCloseTo(200);
    const [ex, ey] = SAW_ARM.elbow;
    const a = canvasPoint(ex, ey, 100, 200, 0.5, 0.5, 1, 0), b = canvasPoint(ex, ey, 100, 200, 0.5, 0.5, -1, 0);
    expect(a.x - 100).toBeCloseTo(100 - b.x);
    expect(a.y).toBeCloseTo(b.y);
    const q = canvasPoint(ex, ey, 100, 200, 0.5, 0.5, 1, Math.PI / 2);
    expect(Math.hypot(q.x - 100, q.y - 200)).toBeCloseTo(Math.hypot(a.x - 100, a.y - 200));
  });
});

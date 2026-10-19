import { describe, expect, it } from 'vitest';
import { MOVE, breathOf, newMotion, stepMotion, stretchOf } from './foemotion';
import { STEP } from './footsteps';

describe('foe motion', () => {
  it('a foe that stands does not hop, rock or lean', () => {
    const m = newMotion();
    for (let i = 0; i < 60; i++) stepMotion(m, 1 / 60, 0, 'paw', false, false);
    const o = stepMotion(m, 1 / 60, 0, 'paw', false, false);
    expect(o.hop).toBe(0);
    expect(o.rock).toBe(0);
    expect(m.lean).toBeCloseTo(0, 6);
  });

  it('a walker lands one hop per stride', () => {
    const m = newMotion();
    const speed = 100, dt = 1 / 120;
    let hops = 0, was = 0, rising = true;
    const dist = STEP.stride.paw * 5;
    for (let d = 0; d < dist; d += speed * dt) {
      const o = stepMotion(m, dt, speed, 'paw', false, false);
      if (o.hop > was) rising = true;
      else if (rising && o.hop < was) {
        hops++;
        rising = false;
      }
      was = o.hop;
    }
    expect(hops).toBeGreaterThanOrEqual(4);
    expect(hops).toBeLessThanOrEqual(5);
  });

  it('a walker never lifts more than its gait allows', () => {
    const m = newMotion();
    let top = 0;
    for (let i = 0; i < 600; i++) top = Math.max(top, stepMotion(m, 1 / 60, 140, 'foot', false, false).hop);
    expect(top).toBeLessThanOrEqual(MOVE.bounce.foot + 1e-9);
    expect(top).toBeGreaterThan(MOVE.bounce.foot * 0.9);
  });

  it('a flier or a slider has no footfall', () => {
    const m = newMotion();
    for (let i = 0; i < 60; i++) {
      const o = stepMotion(m, 1 / 60, 150, 'none', true, false);
      expect(o.hop).toBe(0);
      expect(o.rock).toBe(0);
    }
    expect(m.walk).toBe(0);
  });

  it('it leans into its way, a flier and a rush further, and never past the table', () => {
    const lean = (fly: boolean, rush: boolean) => {
      const m = newMotion();
      for (let i = 0; i < 120; i++) stepMotion(m, 1 / 60, 400, fly ? 'none' : 'paw', fly, rush);
      return m.lean;
    };
    expect(lean(false, false)).toBeCloseTo(MOVE.lean.walk, 3);
    expect(lean(true, false)).toBeGreaterThan(lean(false, false));
    expect(lean(false, true)).toBeCloseTo(MOVE.lean.walk * MOVE.rush, 3);
  });

  it('a kind with its own cadence takes more footfalls per stride, and its own hop', () => {
    const run = (tune?: { cadence: number; hop: number }) => {
      const m = newMotion();
      let top = 0;
      for (let i = 0; i < 120; i++) top = Math.max(top, stepMotion(m, 1 / 60, 120, 'paw', false, false, undefined, tune).hop);
      return { walk: m.walk, top };
    };
    const base = run(), quick = run({ cadence: 2, hop: 1.5 });
    expect(quick.walk).toBeCloseTo(base.walk * 2, 6);
    expect(quick.top).toBeGreaterThan(base.top * 1.3);
  });

  it('the head trails the hop by a beat and is still when the foe is', () => {
    const m = newMotion();
    let best = 0, late = 0;
    for (let i = 0; i < 240; i++) {
      const o = stepMotion(m, 1 / 60, 120, 'paw', false, false);
      if (o.hop > best) {
        best = o.hop;
        late = o.late;
      }
    }
    expect(Math.abs(late - best)).toBeGreaterThan(0.1);
    expect(stepMotion(newMotion(), 1 / 60, 0, 'paw', false, false).late).toBe(0);
  });

  it('a body with no legs stretches along its way by half what it did, a rush more, and never past the table', () => {
    expect(stretchOf(0, false)).toBe(0);
    expect(stretchOf(100, false)).toBeCloseTo(100 / 1400, 6);
    expect(stretchOf(1000, false)).toBe(MOVE.stretch.walk);
    expect(stretchOf(1000, true)).toBe(MOVE.stretch.rush);
    expect(MOVE.stretch.walk).toBeLessThanOrEqual(0.3 / 2);
    expect(MOVE.stretch.rush).toBeLessThanOrEqual(0.5 / 2);
  });

  it('every body breathes: a slow swell of about 3% idle, fainter moving, and two foes are not in step', () => {
    const range = (speed: number, seed: number) => {
      let lo = 9, hi = 0;
      for (let t = 0; t < 8; t += 0.05) {
        const b = breathOf(t, seed, speed);
        lo = Math.min(lo, b);
        hi = Math.max(hi, b);
      }
      return [lo, hi];
    };
    const [lo, hi] = range(0, 1);
    expect(lo).toBeCloseTo(1, 2);
    expect(hi - 1).toBeGreaterThan(0.025);
    expect(hi - 1).toBeLessThanOrEqual(0.03 + 1e-9);
    expect(range(200, 1)[1] - 1).toBeLessThan((hi - 1) / 2);
    expect(breathOf(1, 1, 0)).not.toBeCloseTo(breathOf(1, 2, 0), 3);
    // Slow: a breath takes seconds (a few turns in ten).
    let turns = 0, was = breathOf(0, 0, 0) > breathOf(0.05, 0, 0);
    for (let t = 0.05; t < 10; t += 0.05) {
      const falling = breathOf(t, 0, 0) > breathOf(t + 0.05, 0, 0);
      if (falling !== was) turns++;
      was = falling;
    }
    expect(turns).toBeLessThanOrEqual(7);
  });
});

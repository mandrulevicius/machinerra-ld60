import { describe, expect, it } from 'vitest';
import { ANTENNA, antennaPoints, newAntenna, stepAntenna, whipAntenna } from './antenna';

const run = (a: ReturnType<typeof newAntenna>, bx: number, by: number, secs: number) => {
  for (let i = 0; i < secs * 60; i++) stepAntenna(a, bx, by, 1 / 60);
};
const tip = (a: ReturnType<typeof newAntenna>, bx: number, by: number) => {
  const p = antennaPoints(a, bx, by, { x: [], y: [] });
  return { x: p.x[ANTENNA.n + 1], y: p.y[ANTENNA.n + 1] };
};

describe('antenna', () => {
  it('stands upright on a still base', () => {
    const a = newAntenna();
    run(a, 100, 100, 2);
    for (let i = 0; i <= ANTENNA.n; i++) {
      expect(a.rope.x[i]).toBeCloseTo(100, 0);
      expect(a.rope.y[i]).toBeCloseTo(100 - ANTENNA.gap * (i + 1), 0);
    }
  });

  it('keeps every segment its length', () => {
    const a = newAntenna();
    run(a, 0, 0, 0.1);
    whipAntenna(a, 1, 0, ANTENNA.dash);
    for (let f = 0; f < 30; f++) {
      stepAntenna(a, 0, 0, 1 / 60);
      let px = 0, py = 0;
      for (let i = 0; i <= ANTENNA.n; i++) {
        expect(Math.hypot(a.rope.x[i] - px, a.rope.y[i] - py)).toBeCloseTo(ANTENNA.gap, 3);
        px = a.rope.x[i];
        py = a.rope.y[i];
      }
    }
  });

  it('lags a walk and leans back, then comes upright', () => {
    const a = newAntenna();
    run(a, 0, 0, 0.1);
    let x = 0;
    for (let i = 0; i < 30; i++) stepAntenna(a, (x += 2), 0, 1 / 60); // 120 px/s east
    expect(tip(a, x, 0).x).toBeLessThan(x - 0.5);
    run(a, x, 0, 2);
    expect(Math.abs(a.rope.x[ANTENNA.n] - x)).toBeLessThan(0.1);
  });

  it('whips against a kick and swings back past upright', () => {
    const a = newAntenna();
    run(a, 0, 0, 0.1);
    whipAntenna(a, 1, 0, ANTENNA.kick);
    let min = 0, max = 0;
    for (let i = 0; i < 40; i++) {
      stepAntenna(a, 0, 0, 1 / 60);
      min = Math.min(min, a.rope.x[ANTENNA.n]);
      max = Math.max(max, a.rope.x[ANTENNA.n]);
    }
    expect(min).toBeLessThan(-1);
    expect(max).toBeGreaterThan(0.2);
  });

  it('lays itself upright when the base jumps', () => {
    const a = newAntenna();
    run(a, 0, 0, 0.1);
    stepAntenna(a, 500, 500, 1 / 60);
    expect(a.rope.x[ANTENNA.n]).toBeCloseTo(500, 0);
  });
});

import { describe, expect, it } from 'vitest';
import { SWOOSH, streaks } from './stokeview';

describe('the swoosh streaks', () => {
  it('trail behind the robot, along its way', () => {
    for (let t = 0; t < 1; t += 0.05) {
      const all = streaks(100, 100, 1, 0, t);
      expect(all).toHaveLength(SWOOSH.n);
      for (const s of all) {
        expect(s.x1).toBeLessThan(100); // behind a robot moving east
        expect(s.x2).toBeLessThan(s.x1); // and drawn further back
        expect(s.a).toBeGreaterThanOrEqual(0);
        expect(s.a).toBeLessThanOrEqual(0.9);
      }
    }
  });
  it('turn with the heading and loop each life', () => {
    const north = streaks(0, 0, 0, -1, 0.1);
    for (const s of north) expect(s.y1).toBeGreaterThan(-SWOOSH.rise); // a robot moving up the screen trails below
    const a = streaks(0, 0, 1, 0, 0.1), b = streaks(0, 0, 1, 0, 0.1 + SWOOSH.life);
    a.forEach((s, i) => expect(s.x1).toBeCloseTo(b[i].x1, 5));
  });
});

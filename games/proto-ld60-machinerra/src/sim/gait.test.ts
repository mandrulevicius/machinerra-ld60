import { describe, expect, it } from 'vitest';
import { twoBone } from './gait';

const A = 18, B = 20;

describe('two-bone IK', () => {

  it('bends sideways-and-up with the foot straight below, and stays finite when the foot is out of reach', () => {
    const k = twoBone({ x: 0, y: 0, z: 13 }, { x: 0, y: 0, z: 0 }, A, B, { x: 0, y: 1 });
    expect(Number.isFinite(k.x + k.y + k.z)).toBe(true);
    expect(k.y).toBeGreaterThan(0);
    const far = twoBone({ x: 0, y: 0, z: 13 }, { x: 90, y: 0, z: 0 }, A, B);
    expect(Math.hypot(far.x, far.y, far.z - 13)).toBeCloseTo(A, 5);
  });
});


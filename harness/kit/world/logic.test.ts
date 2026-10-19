import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGES, MarkMap, Strider, lerpColor, stageAt } from './logic';

describe('stageAt', () => {
  it('starts at the first stage, ends at the last, blends between', () => {
    expect(stageAt(DEFAULT_STAGES, 0)).toEqual({ tint: 0xffffff, scale: 1, alpha: 1 });
    const end = stageAt(DEFAULT_STAGES, 1);
    expect(end).toEqual({ tint: 0x2a1a14, scale: 0.55, alpha: 0.85 });
    const mid = stageAt([{ tint: 0xffffff, scale: 1 }, { tint: 0x000000, scale: 0.5 }], 0.5);
    expect(mid.scale).toBeCloseTo(0.75);
    expect(mid.tint).toBe(0x808080);
  });
  it('clamps t and handles one stage', () => {
    expect(stageAt(DEFAULT_STAGES, 7).scale).toBe(0.55);
    expect(stageAt([{ tint: 0x123456, scale: 2 }], 0.4)).toEqual({ tint: 0x123456, scale: 2, alpha: 1 });
  });
  it('lerpColor blends per channel', () => {
    expect(lerpColor(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
  });
});

describe('MarkMap', () => {
  it('finds a mark inside its radius, not outside, newest wins, wear removes it', () => {
    const m = new MarkMap(32);
    m.add('mud', 100, 100, 40, 0.8, 0x553311);
    expect(m.at(110, 95)?.color).toBe(0x553311);
    expect(m.at(400, 400)).toBeNull();
    m.add('blood', 100, 100, 10, 1, 0xaa0000);
    expect(m.at(100, 100)?.kind).toBe('blood');
    expect(m.at(100, 100, ['mud'])).toBeNull();
    m.wear(100, 100, 2);
    expect(m.at(100, 100)).toBeNull();
  });
  it('a tiny stamp still marks its own cell', () => {
    const m = new MarkMap(32);
    m.add('x', 40, 40, 1, 1, 0);
    expect(m.at(40, 40)).not.toBeNull();
  });
});

describe('Strider', () => {
  it('prints every stride, alternating sides, offset sideways of the heading', () => {
    const s = new Strider(20, 10);
    expect(s.step(0, 0)).toBeNull();
    expect(s.step(10, 0)).toBeNull();
    const a = s.step(20, 0)!;
    const b = s.step(40, 0)!;
    expect(a.side).not.toBe(b.side);
    expect(a.heading).toBeCloseTo(0);
    expect(Math.abs(a.y)).toBeCloseTo(5); // gap / 2 to the side
    expect(a.y).toBeCloseTo(-b.y);
  });
  it('a teleport restarts the trail instead of printing', () => {
    const s = new Strider(20, 10);
    s.step(0, 0);
    expect(s.step(1000, 0)).toBeNull();
    expect(s.step(1020, 0)).not.toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { AUTO, TierMeter, forcedFrom, lowerTier, median, resolveTier, tierForFrame, type Tier } from './tier';

const CAP: Record<Tier, number> = { low: 8, medium: 16, high: 32 };
const capOf = (t: Tier) => CAP[t];
const frames = (m: TierMeter, ms: number, n: number) => {
  const drops: Tier[] = [];
  for (let i = 0; i < n; i++) { const d = m.feed(ms); if (d) drops.push(d); }
  return drops;
};
const settle = (m: TierMeter) => frames(m, 16, AUTO.settle);

describe('tierForFrame', () => {
  it('maps a median to the highest tier it holds', () => {
    expect(tierForFrame(16.7)).toBe('high');
    expect(tierForFrame(AUTO.mediumMs)).toBe('medium');
    expect(tierForFrame(AUTO.lowMs - 1)).toBe('medium');
    expect(tierForFrame(AUTO.lowMs)).toBe('low');
  });
  it('median of odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('TierMeter', () => {
  it('a fast machine stays high and finishes measuring', () => {
    const m = new TierMeter();
    expect(frames(m, 16.7, AUTO.settle + AUTO.window * AUTO.clean)).toEqual([]);
    expect(m.tier).toBe('high');
    expect(m.done).toBe(true);
  });
  it('lowers only after confirm windows in a row', () => {
    const m = new TierMeter();
    settle(m);
    expect(frames(m, 26, AUTO.window)).toEqual([]);
    expect(m.strikes).toBe(1);
    expect(frames(m, 26, AUTO.window)).toEqual(['medium']);
    expect(m.tier).toBe('medium');
  });
  it('one slow window between fair ones lowers nothing', () => {
    const m = new TierMeter();
    settle(m);
    frames(m, 40, AUTO.window);
    frames(m, 16, AUTO.window);
    expect(frames(m, 40, AUTO.window)).toEqual([]);
    expect(m.tier).toBe('high');
  });
  it('a very slow machine goes straight to low and stops', () => {
    const m = new TierMeter();
    settle(m);
    expect(frames(m, 50, AUTO.window * AUTO.confirm)).toEqual(['low']);
    expect(m.done).toBe(true);
  });
  it('settles again after a drop, then can lower once more', () => {
    const m = new TierMeter();
    settle(m);
    frames(m, 26, AUTO.window * AUTO.confirm);
    expect(frames(m, 50, AUTO.settle)).toEqual([]);
    expect(m.strikes).toBe(0);
    expect(frames(m, 50, AUTO.window * AUTO.confirm)).toEqual(['low']);
  });
  it('never raises, whatever the later frames', () => {
    const m = new TierMeter();
    settle(m);
    frames(m, 26, AUTO.window * AUTO.confirm);
    m.restart();
    frames(m, 8, AUTO.settle + AUTO.window * 6);
    expect(m.tier).toBe('medium');
  });
  it('stalls are not measured', () => {
    const m = new TierMeter();
    settle(m);
    expect(frames(m, AUTO.stallMs + 1, AUTO.window * 4)).toEqual([]);
    expect(m.tier).toBe('high');
  });
  it('a new landing settles again and keeps the tier', () => {
    const m = new TierMeter();
    settle(m);
    frames(m, 26, AUTO.window * AUTO.confirm);
    m.restart();
    expect(m.tier).toBe('medium');
    expect(frames(m, 50, AUTO.settle + AUTO.window)).toEqual([]);
  });
});

describe('resolveTier', () => {
  it('leaves the player alone when nothing is measured or held', () => {
    expect(resolveTier({ level: 'high', lights: 32 }, 'high', null, capOf)).toEqual({ level: 'high', detail: 2, lightCap: null });
  });
  it('lowers below the player, the cap never above the player\'s own lights', () => {
    expect(resolveTier({ level: 'high', lights: 32 }, 'medium', null, capOf)).toEqual({ level: 'medium', detail: 1, lightCap: 16 });
    expect(resolveTier({ level: 'high', lights: 12 }, 'low', null, capOf)).toEqual({ level: 'low', detail: 0, lightCap: 8 });
    expect(resolveTier({ level: 'high', lights: 6 }, 'low', null, capOf).lightCap).toBe(6);
  });
  it('is never above the player\'s level, measured or held', () => {
    expect(resolveTier({ level: 'low', lights: 8 }, 'high', 'high', capOf)).toEqual({ level: 'low', detail: 0, lightCap: null });
    expect(resolveTier({ level: 'medium', lights: 16 }, 'high', null, capOf).level).toBe('medium');
  });
  it('a held tier wins over the measured one', () => {
    expect(resolveTier({ level: 'high', lights: 32 }, 'low', 'high', capOf).level).toBe('high');
    expect(resolveTier({ level: 'high', lights: 32 }, 'high', 'low', capOf).level).toBe('low');
  });
});

describe('forcedFrom', () => {
  it('reads ?render= and nothing else', () => {
    expect(forcedFrom('?render=low')).toBe('low');
    expect(forcedFrom('?seed=3&render=medium')).toBe('medium');
    expect(forcedFrom('?render=ultra')).toBeNull();
    expect(forcedFrom('?tier=2')).toBeNull();
    expect(lowerTier('high', 'low')).toBe('low');
  });
});

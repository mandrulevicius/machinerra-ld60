import { describe, expect, it, vi } from 'vitest';
import { Bag, Music, VoicePool, pickSegment, clamp01, defaultThreshold, densityGain, equalPowerCurve, forcedMute, hearingGain, lowpassFor, nextBoundary, softClipCurve } from './audio';

describe('forcedMute', () => {
  it('any ?mute= value but 0 mutes', () => {
    expect(['?mute=1', '?mute=', '?a=1&mute=yes'].map(forcedMute)).toEqual([true, true, true]);
    expect(['', '?mute=0', '?q=1'].map(forcedMute)).toEqual([false, false, false]);
  });
});

describe('equalPowerCurve', () => {
  it('runs from -> to, monotonic', () => {
    for (const [a, b] of [[0, 1], [1, 0], [0.3, 1], [0.8, 0.2]]) {
      const c = equalPowerCurve(a, b);
      expect([c[0], c[c.length - 1]].map((v) => +v.toFixed(5))).toEqual([a, b]);
      for (let i = 1; i < c.length; i++) expect(b > a ? c[i] >= c[i - 1] - 1e-6 : c[i] <= c[i - 1] + 1e-6).toBe(true);
    }
  });
  it('a rising and a falling fade keep constant power', () => {
    const up = equalPowerCurve(0, 1);
    const down = equalPowerCurve(1, 0);
    for (let i = 0; i < up.length; i++) expect(up[i] ** 2 + down[i] ** 2).toBeCloseTo(1, 5);
  });
});

describe('softClipCurve', () => {
  it('is transparent below the knee, odd, monotonic and stays below 1', () => {
    const c = softClipCurve(0.8, 2049);
    const at = (x: number) => c[Math.round(((x + 1) / 2) * 2048)];
    expect(at(0.5)).toBeCloseTo(0.5, 3);
    expect(at(-0.5)).toBeCloseTo(-0.5, 3);
    expect(at(1)).toBeLessThan(1);
    expect(at(1)).toBeGreaterThan(0.9);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
  });
});

describe('nextBoundary', () => {
  it('waits for the next multiple of the period after start', () => {
    expect(nextBoundary(10.1, 10, 2)).toBeCloseTo(12);
    expect(nextBoundary(11.9, 10, 2)).toBeCloseTo(12);
    expect(nextBoundary(12.0, 10, 2)).toBeCloseTo(12); // exactly on the line: now
    expect(nextBoundary(12.01, 10, 2)).toBeCloseTo(14);
  });
  it('before the start, or with no period, is now or the start', () => {
    expect(nextBoundary(5, 10, 2)).toBe(10);
    expect(nextBoundary(12.5, 10, 0)).toBe(12.5);
  });
});

describe('stems and volumes', () => {
  it('spreads stem thresholds over 0..1', () => {
    expect([0, 1, 2].map((i) => defaultThreshold(i, 3).toFixed(2))).toEqual(['0.00', '0.33', '0.67']);
    expect(defaultThreshold(0, 1)).toBe(0);
  });
  it('clamps volumes', () => {
    expect([clamp01(-1), clamp01(0.4), clamp01(7), clamp01(NaN)]).toEqual([0, 0.4, 1, 0]);
  });
});

describe('VoicePool', () => {
  it('cuts the oldest copy of one sound past its cap', () => {
    const p = new VoicePool<number>(2, 99);
    expect(p.admit('hit', 1)).toEqual([]);
    expect(p.admit('hit', 2)).toEqual([]);
    expect(p.admit('hit', 3)).toEqual([1]);
    expect(p.count('hit')).toBe(2);
    expect(p.admit('coin', 4)).toEqual([]); // other sounds have their own cap
    expect(p.count()).toBe(3);
  });
  it('per-call max overrides the default', () => {
    const p = new VoicePool<number>(4, 99);
    p.admit('boom', 1, 1);
    expect(p.admit('boom', 2, 1)).toEqual([1]);
  });
  it('caps the total, cutting the oldest of any sound', () => {
    const p = new VoicePool<number>(10, 3);
    [1, 2, 3].forEach((v, i) => p.admit(['a', 'b', 'a'][i], v));
    expect(p.admit('c', 4)).toEqual([1]);
    expect(p.count()).toBe(3);
    expect(p.count('a')).toBe(1);
  });
  it('release frees a slot and is idempotent', () => {
    const p = new VoicePool<number>(1, 9);
    p.admit('a', 1);
    p.release('a', 1);
    p.release('a', 1);
    expect(p.admit('a', 2)).toEqual([]);
    expect(p.voices()).toEqual([2]);
  });
  it('a stress of 200 hits never exceeds the caps', () => {
    const p = new VoicePool<number>(4, 24);
    for (let i = 0; i < 200; i++) {
      p.admit(['hit', 'coin', 'laser'][i % 3], i);
      expect(p.count()).toBeLessThanOrEqual(12);
    }
  });
});

describe('many sources', () => {
  it('hearing: full up close, squared falloff, silent past far', () => {
    expect(hearingGain(100, 300, 1100)).toBe(1);
    expect(hearingGain(700, 300, 1100)).toBeCloseTo(0.25);
    expect(hearingGain(1200, 300, 1100)).toBe(0);
  });
  it('the low-pass closes with distance', () => {
    expect(lowpassFor(1)).toBeCloseTo(18000);
    expect(lowpassFor(0)).toBeCloseTo(1200);
    expect(lowpassFor(0.25)).toBeLessThan(lowpassFor(0.5));
  });
  it('density: each extra voice is quieter', () => {
    expect(densityGain(0)).toBe(1);
    expect(densityGain(3)).toBeCloseTo(0.5);
  });
  it('a bag never repeats a variant back to back and uses them all', () => {
    let seed = 7;
    const b = new Bag(4, () => ((seed = (seed * 16807) % 2147483647) / 2147483647));
    const seq = Array.from({ length: 400 }, () => b.next());
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    expect(new Set(seq).size).toBe(4);
    expect(new Bag(1).next()).toBe(0);
  });
  it('over the total cap the lowest priority goes first, the newcomer if it is the lowest', () => {
    const p = new VoicePool<string>(9, 2);
    p.admit('oracle', 'o', 9, 5);
    p.admit('hit', 'h1', 9, 1);
    expect(p.admit('hit', 'h2', 9, 1)).toEqual(['h1']);
    expect(p.admit('chop', 'c', 9, 0)).toEqual(['c']);
    expect(p.voices()).toEqual(['o', 'h2']);
  });
});

describe('music loaded late', () => {
  it('a track asked for before it loaded starts once added, even with another one playing', () => {
    const m = new Music({ ctx: {} } as unknown as ConstructorParameters<typeof Music>[0]);
    m.play('desert', { fade: 3 }); // not loaded yet: remembered
    (m as unknown as { cur: { name: string } }).cur = { name: 'rimti' }; // the hub's song plays meanwhile
    const play = vi.spyOn(m, 'play').mockImplementation(() => {});
    m.add('desert', { stems: ['music/desert/song'] });
    expect(play).toHaveBeenCalledWith('desert', { fade: 3 });
    play.mockClear();
    m.add('jungle', { stems: ['music/jungle/song'] }); // not the wanted one: nothing
    expect(play).not.toHaveBeenCalled();
  });
});

describe('song sections', () => {
  const segs = [
    { name: 'intro', from: 0, to: 8, mood: 0.4 },
    { name: 'calm', from: 8, to: 16, mood: 0.1 },
    { name: 'climax', from: 16, to: 32, mood: 1 },
    { name: 'mid', from: 32, to: 40, mood: 0.5 },
    { name: 'outro', from: 40, to: 44, mood: 0, only: true, end: true },
  ];
  it('continues the song when the next section fits the mood', () => {
    expect(pickSegment(segs, 0, 0.2)).toBe(1);
    expect(pickSegment(segs, 2, 0.6)).toBe(3);
  });
  it('jumps to the closest mood elsewhere when it does not, never to an only-on-request section', () => {
    expect(pickSegment(segs, 1, 0.5)).toBe(3);
    expect(pickSegment(segs, 3, 0.05)).toBe(1);
    expect(pickSegment(segs, 0, 1)).toBe(2);
  });
  it('prefers what was not played lately', () => {
    expect(pickSegment(segs, 2, 0.45, [0])).toBe(3);
  });
});

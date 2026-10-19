import { describe, expect, it } from 'vitest';
import { moodOf, veilKey } from './hubmood';

describe('moodOf', () => {
  it('the first visit is day', () => {
    expect(moodOf(0)).toBe('day');
    expect(moodOf()).toBe('day');
  });
  it('a later visit is the same mood every time, and all three come up', () => {
    const seen = new Set<string>();
    for (let v = 1; v <= 30; v++) {
      expect(moodOf(v)).toBe(moodOf(v));
      seen.add(moodOf(v));
    }
    expect(seen).toEqual(new Set(['day', 'evening', 'night']));
  });
});

describe('the land veil on the low quality setting', () => {
  it('draws nothing by day and the standing pools once in the evening, at any setting', () => {
    for (const low of [false, true]) {
      expect(veilKey(0, 0, 5, low, 20)).toBe('');
      expect(veilKey(1, 0, 5, low, 20)).toBe('pools');
      expect(veilKey(1, 0, 9, low, 20)).toBe('pools');
    }
  });
  it('at night the spotlights sweep: the key changes every frame, 20 a second', () => {
    expect(veilKey(1, 1, 5, false, 20)).not.toBe(veilKey(1, 1, 5.06, false, 20));
    expect(veilKey(1, 1, 5, false, 20)).toBe(veilKey(1, 1, 5.02, false, 20));
  });
  it('on low they hold still: the same key whatever the time, so the veil is drawn once', () => {
    const keys = new Set([0, 1.3, 7, 123.4].map((t) => veilKey(1, 1, t, true, 20)));
    expect(keys.size).toBe(1);
    expect(veilKey(1, 1, 3, true, 20)).not.toBe(veilKey(1, 0.5, 3, true, 20)); // it still follows the mood easing in
  });
});

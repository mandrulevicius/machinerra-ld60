import { describe, expect, it } from 'vitest';
import { baseKey, floorOf } from './footline';

describe('footline', () => {
  it('reads a texture key without its dressing', () => {
    expect(baseKey('landmark-kicker~hub')).toBe('landmark-kicker');
    expect(baseKey('mast~desert')).toBe('mast');
    expect(baseKey('prop-crate')).toBe('prop-crate');
  });
  it('finds a row by the base key, and nothing for a picture without one', () => {
    expect(floorOf('landmark-kicker~hub').wall).toBe(true);
    expect(floorOf('hub-bench~hub')).toEqual({});
  });
});

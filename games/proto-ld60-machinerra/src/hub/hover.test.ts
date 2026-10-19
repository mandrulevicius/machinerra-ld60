import { describe, expect, it } from 'vitest';
import { pickRegion, TRIM } from './hover';

const box = (x: number, y: number, w = 100, h = 100) => ({ x, y, w, h });

describe('the hover pick', () => {
  const regions = [{ id: 'npc', box: box(40, 40, 40, 60) }, { id: 'table', box: box(0, 0, 200, 160) }];
  it('takes the first region (the one in front) whose box holds the pointer', () => {
    expect(pickRegion(regions, 60, 70)?.id).toBe('npc');
    expect(pickRegion(regions, 150, 70)?.id).toBe('table');
  });
  it('trims the empty margin of a picture, and misses open deck', () => {
    expect(pickRegion([{ id: 'a', box: box(0, 0) }], (100 * TRIM) / 2, 50)).toBeNull();
    expect(pickRegion([{ id: 'a', box: box(0, 0) }], 100 * (TRIM + 0.01), 50)?.id).toBe('a');
    expect(pickRegion(regions, 500, 500)).toBeNull();
    expect(pickRegion([], 1, 1)).toBeNull();
  });
});

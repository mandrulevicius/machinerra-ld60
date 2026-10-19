import { describe, expect, it } from 'vitest';
import { GRID, holesSvg, pcClass, punches, smudge } from './punchcard';
import { CARDS } from './research';

describe('punch cards', () => {
  it("a card's holes come from its id alone: the same every time", () => {
    for (const c of CARDS) expect(punches(c.id)).toEqual(punches(c.id));
    expect(holesSvg('twinNozzle')).toBe(holesSvg('twinNozzle'));
    expect(smudge('twinNozzle')).toEqual(smudge('twinNozzle'));
  });

  it('every card has holes of its own', () => {
    const seen = new Set(CARDS.map((c) => JSON.stringify(punches(c.id))));
    expect(seen.size).toBe(CARDS.length);
  });

  it('the pattern is a real card: 12 rows, one punch or a zone punch with a digit per column, a blank tail', () => {
    for (const c of CARDS) {
      const p = punches(c.id);
      expect(p).toHaveLength(GRID.cols);
      for (const rows of p) {
        expect(rows.length).toBeLessThanOrEqual(2);
        for (const r of rows) expect(r).toBeGreaterThanOrEqual(0), expect(r).toBeLessThan(GRID.rows);
        if (rows.length === 2) expect(rows[0]).toBeLessThan(2); // the zone row first, then the digit
      }
      expect(p[GRID.cols - 1]).toEqual([]);
      expect(p.some((rows) => rows.length)).toBe(true);
    }
  });

  it('prints the digit rows under the holes, and a keystone is marked in its class', () => {
    expect(holesSvg('twinNozzle')).toContain('<text');
    expect(pcClass({ id: 'conductors', pool: 'keystone' }, 'sm')).toContain('pc--key');
    expect(pcClass({ id: 'twinNozzle', pool: 'gun' }, 'sm')).not.toContain('pc--key');
  });
});

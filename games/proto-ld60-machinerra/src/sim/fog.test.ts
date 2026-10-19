import { describe, expect, it } from 'vitest';
import { generate } from './mapgen';
import { OFFSET, landSignals, newFog, warmth, type Signal } from './fog';
import { generateReal } from './testkit';

const SEEDS = Array.from({ length: 8 }, (_, i) => i + 1);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const sig = (x: number, y: number, r = 6): Signal => ({ id: `s${x}-${y}`, kind: 'shrine', x, y, r, at: { x, y } });

describe('fog', () => {
  it('starts blank, sized to the land, and a reveal fills a disc', () => {
    const m = generate(1);
    const f = newFog(m);
    expect([f.w, f.h]).toEqual([m.w, m.h]);
    expect(f.fraction).toBe(0);
    const n = f.reveal(50, 40, 5);
    expect(n).toBeGreaterThan(70);
    expect(n).toBeLessThan(90); // pi * 25 = 78.5
    expect(f.at(50, 40)).toBe(true);
    expect(f.at(55, 40)).toBe(true);
    expect(f.at(56, 40)).toBe(false);
    expect(f.at(55, 45)).toBe(false); // the corner of the square is outside the disc
    expect(f.fraction).toBeCloseTo(n / (m.w * m.h));
  });

});

describe('signals', () => {
  it('are the same for the same land and differ between lands', () => {
    for (const seed of SEEDS) expect(landSignals(generateReal(seed))).toEqual(landSignals(generateReal(seed)));
    expect(landSignals(generate(1))).not.toEqual(landSignals(generate(2)));
  });

  it('never sit exactly on the real spot but always contain it, and stay on the map', () => {
    for (const seed of SEEDS) {
      const m = generate(seed);
      for (const s of landSignals(m)) {
        const d = dist(s, s.at);
        expect(d, `seed ${seed} ${s.id}`).toBeGreaterThanOrEqual(OFFSET.minTiles - 0.01);
        expect(d).toBeLessThanOrEqual(s.r * OFFSET.to + 0.01);
        expect(d).toBeLessThan(s.r);
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(m.w - 1);
        expect(s.y).toBeLessThanOrEqual(m.h - 1);
      }
    }
  });

  it('are found once the real spot is seen, not the rough area', () => {
    const m = generate(2);
    const sigs = landSignals(m);
    const s = sigs[0];
    const f = newFog(m);
    f.reveal(s.x, s.y, 1); // the area's centre is not the spot
    expect(f.found(s)).toBe(false);
    f.reveal(s.at.x, s.at.y, 1);
    expect(f.found(s)).toBe(true);
    expect(f.open(sigs)).toHaveLength(sigs.length - 1);
  });
});

describe('antenna warmth', () => {
  const east = 0;

  it('reads the rough area, never the real spot', () => {
    const rough: Signal = { ...sig(60, 40), x: 60, y: 40, at: { x: 40, y: 60 } };
    expect(warmth({ x: 40, y: 40, facing: east }, [rough]).value).toBe(warmth({ x: 40, y: 40, facing: east }, [{ ...rough, at: { x: 0, y: 0 } }]).value);
  });

});


import { describe, expect, it } from 'vitest';
import { coverage, field, hash, type WipeKind } from './wipes';

const kinds: WipeKind[] = ['wipe', 'iris', 'blocks', 'dissolve'];

describe('wipes', () => {
  it('a fade has no field', () => {
    expect(field('fade', 8, 4)).toBeNull();
  });

  for (const kind of kinds) {
    it(`${kind}: nothing covered at p=0, everything at p=1, coverage only grows`, () => {
      for (const flip of [false, true]) {
        const f = field(kind, 32, 18, { flip, at: [0.2, 0.8] })!;
        const soft = 0.1;
        let last = -1;
        for (let p = 0; p <= 1.0001; p += 0.1) {
          const sum = f.reduce((s, v) => s + coverage(v, Math.min(p, 1), soft), 0);
          expect(sum).toBeGreaterThanOrEqual(last);
          last = sum;
        }
        expect(f.reduce((s, v) => s + coverage(v, 0, soft), 0)).toBe(0);
        expect(f.every((v) => coverage(v, 1, soft) === 1)).toBe(true);
      }
    });
  }

  it('the iris closes on its point last', () => {
    const f = field('iris', 32, 18, { at: [0.25, 0.5] })!;
    const at = f[9 * 32 + 8];
    expect(at).toBeGreaterThan(f[0]);
    expect(at).toBeGreaterThan(f[17 * 32 + 31]);
  });

  it('the wipe sweeps left to right, and the reveal leaves on the far side', () => {
    const out = field('wipe', 32, 18)!;
    const back = field('wipe', 32, 18, { flip: true })!;
    expect(out[0]).toBeLessThan(out[31]);
    expect(back[0]).toBeGreaterThan(back[31]);
  });

  it('dissolve thresholds are spread evenly', () => {
    const f = field('dissolve', 40, 25)!;
    const covered = f.filter((v) => coverage(v, 0.5, 0.01) > 0.5).length / f.length;
    expect(covered).toBeGreaterThan(0.45);
    expect(covered).toBeLessThan(0.55);
  });

  it('hash is deterministic and in range', () => {
    expect(hash(3, 4, 5)).toBe(hash(3, 4, 5));
    for (let i = 0; i < 100; i++) expect(hash(i, i * 3, 1)).toBeLessThan(1);
  });
});

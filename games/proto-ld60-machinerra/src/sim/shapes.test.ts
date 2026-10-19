import { describe, expect, it } from 'vitest';
import { covers, parseShape, rasterise, type Frame, type Ground, type Shape } from './shapes';

const blob = (o: Partial<Extract<Shape, { kind: 'blob' }>> = {}): Shape => ({ kind: 'blob', ground: 'hardpan', x: 0, y: 0, angle: 0, rough: 0, seed: 1, rx: 5, ry: 3, ...o });
const F: Frame = { x: 20, y: 20, rot: 0, mir: 1 };
const W = 40, H = 40;
/** Paint into a grid of `.` and the ground's first letter. */
function grid(shapes: Shape[], f: Frame = F) {
  const g = Array.from({ length: H }, () => Array<string>(W).fill('.'));
  const put = (x: number, y: number, k: Ground) => (g[y][x] = k[0]);
  const n = rasterise(shapes, f, W, H, put);
  return { g, n, at: (x: number, y: number) => g[y][x], count: () => g.flat().filter((c) => c !== '.').length };
}

describe('shapes', () => {

  it('is turned and mirrored like the parts: a part at (dx, dy) and a shape there land on the same tile', () => {
    for (const rot of [0, 0.7, 2.1, 4]) for (const mir of [1, -1] as const) {
      const f: Frame = { x: 20, y: 20, rot, mir };
      const local = { x: 3.5, y: -2 };
      // The part's tile, by the formula placePlaces uses.
      const px = f.x + local.x * mir * Math.cos(rot) - local.y * Math.sin(rot), py = f.y + local.x * mir * Math.sin(rot) + local.y * Math.cos(rot);
      const { at } = grid([blob({ x: local.x, y: local.y, rx: 1.2, ry: 1.2 })], f);
      expect(at(Math.round(px), Math.round(py)), `rot ${rot} mir ${mir}`).toBe('h');
    }
  });

  it('roughness wobbles the edge but keeps the shape: same seed same ground, another seed another, area about the same', () => {
    const clean = grid([blob({ rx: 8, ry: 8 })]);
    const a = grid([blob({ rx: 8, ry: 8, rough: 0.8, seed: 3 })]);
    const a2 = grid([blob({ rx: 8, ry: 8, rough: 0.8, seed: 3 })]);
    const b = grid([blob({ rx: 8, ry: 8, rough: 0.8, seed: 4 })]);
    expect(a.g).toEqual(a2.g);
    expect(a.g).not.toEqual(b.g);
    expect(a.g).not.toEqual(clean.g);
    expect(Math.abs(a.count() - clean.count())).toBeLessThan(clean.count() * 0.25);
    // The middle is always covered.
    expect(a.at(20, 20)).toBe('h');
    expect(covers(blob({ rough: 1, seed: 9 }), 0, 0)).toBe(true);
  });

});

describe('parseShape', () => {
  const e = { id: 'g1', type: 'blob', x: 64, y: -32, rotation: 90, scale: 2, props: { ground: 'dune', rx: 64, ry: 32, rough: 0.5, seed: 7 } };
  it('says which entity is wrong', () => {
    expect(() => parseShape({ ...e, props: { ground: 'lava' } }, 32)).toThrow(/g1.*lava/);
    expect(() => parseShape({ ...e, type: 'pond' }, 32)).toThrow(/g1.*pond/);
  });
});

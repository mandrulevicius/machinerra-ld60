import { describe, expect, it } from 'vitest';
import { buildShapes, convexHull, maxDeviation, downsample, fitBudget, maskFromRGBA, polygonArea, polygonIoU, simplify, trace, type Mask, type Pt } from './collision';

/** RGBA image from ASCII rows: '#' ink (black), '.' paper (white), ' ' transparent. */
function img(rows: string[]) {
  const h = rows.length;
  const w = rows[0].length;
  const d = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const i = (y * w + x) * 4;
      const v = ch === '#' ? 0 : 255;
      d.set([v, v, v, ch === ' ' ? 0 : 255], i);
    }),
  );
  return { d, w, h };
}
const mask = (rows: string[]): Mask => ({ w: rows[0].length, h: rows.length, data: Uint8Array.from(rows.join(''), (c) => (c === '#' ? 1 : 0)) });
const rect = (w: number, h: number, x0: number, y0: number, x1: number, y1: number) =>
  Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (x >= x0 && x < x1 && y >= y0 && y < y1 ? '#' : '.')).join(''));

describe('maskFromRGBA', () => {
  it('opaque line art on white: the enclosed interior counts as solid', () => {
    const { d, w, h } = img(['.......', '.#####.', '.#...#.', '.#...#.', '.#####.', '.......']);
    const m = maskFromRGBA(d, w, h);
    expect(m.data.reduce((a, b) => a + b, 0)).toBe(5 * 4);
    expect(m.data[3 * w + 3]).toBe(1);
    expect(m.data[0]).toBe(0);
  });

  it('fillHoles false keeps the paper inside the ring empty', () => {
    const { d, w, h } = img(['.......', '.#####.', '.#...#.', '.#####.', '.......']);
    expect(maskFromRGBA(d, w, h, { fillHoles: false }).data.reduce((a, b) => a + b, 0)).toBe(12);
  });

  it('transparent background: alpha is the mask, a transparent hole inside a ring is filled', () => {
    const { d, w, h } = img(['       ', ' ##### ', ' #   # ', ' ##### ', '       ']);
    const m = maskFromRGBA(d, w, h);
    expect(m.data.reduce((a, b) => a + b, 0)).toBe(15);
    expect(maskFromRGBA(d, w, h, { fillHoles: false }).data.reduce((a, b) => a + b, 0)).toBe(12);
  });

  it('anti-aliased grey paper within tolerance still counts as background', () => {
    const { d, w, h } = img(['....', '.##.', '....']);
    d.set([250, 250, 250, 255], 0);
    expect(maskFromRGBA(d, w, h).data.reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe('trace', () => {
  it('a rectangle gives one loop with the rectangle area', () => {
    const loops = trace(mask(rect(10, 8, 2, 1, 7, 6)));
    expect(loops).toHaveLength(1);
    expect(polygonArea(loops[0])).toBeCloseTo(25 - 4 / 8, 5); // each corner is cut diagonally: 1/8 px^2 lost
  });

  it('two separate blobs give two loops', () => {
    expect(trace(mask(['##..##', '##..##']))).toHaveLength(2);
  });

  it('a diagonal saddle stays one connected loop', () => {
    expect(trace(mask(['#.', '.#']))).toHaveLength(1);
  });

  it('a mask touching the image edge still closes', () => {
    const loops = trace(mask(['###', '###']));
    expect(loops).toHaveLength(1);
    expect(polygonArea(loops[0])).toBeGreaterThan(5);
  });
});

describe('simplify and budget', () => {
  const circle = (n: number, r = 50): Pt[] => Array.from({ length: n }, (_, i) => ({ x: 60 + r * Math.cos((i / n) * 2 * Math.PI), y: 60 + r * Math.sin((i / n) * 2 * Math.PI) }));

  it('a dense rectangle outline reduces to its four corners', () => {
    const pts: Pt[] = [];
    for (let x = 0; x < 20; x++) pts.push({ x, y: 0 });
    for (let y = 0; y < 10; y++) pts.push({ x: 20, y });
    for (let x = 20; x > 0; x--) pts.push({ x, y: 10 });
    for (let y = 10; y > 0; y--) pts.push({ x: 0, y });
    expect(simplify(pts, 0.1)).toHaveLength(4);
  });

  it('fitBudget never exceeds the budget and keeps the area close', () => {
    const c = circle(200);
    for (const b of [8, 16, 32]) {
      const s = fitBudget(c, b);
      expect(s.length).toBeLessThanOrEqual(b);
      expect(s.length).toBeGreaterThan(b / 2);
      expect(polygonArea(s) / polygonArea(c)).toBeGreaterThan(b === 8 ? 0.85 : 0.95);
    }
  });

  it('returns the input when it is already under budget', () => {
    expect(fitBudget(circle(6), 16)).toHaveLength(6);
  });

  it('convex hull of an L shape is larger than the L and has no dent', () => {
    const L: Pt[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 4 }, { x: 0, y: 4 }];
    const hull = convexHull(L);
    expect(hull).toHaveLength(5); // (0,0) (4,0) (4,1) (1,4) (0,4)
    expect(polygonArea(hull)).toBeGreaterThan(polygonArea(L));
  });
});

describe('polygonIoU', () => {
  it('is 1 for the exact polygon and drops for a smaller one', () => {
    const m = mask(rect(10, 10, 0, 0, 10, 10));
    const sq = (s: number): Pt[] => [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }];
    expect(polygonIoU(sq(10), m)).toBe(1);
    expect(polygonIoU(sq(5), m)).toBeCloseTo(0.25, 5);
  });
});

describe('maxDeviation', () => {
  const sq = (s: number): Pt[] => [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }];
  it('is 0 for the same polygon and the offset for a shifted corner', () => {
    expect(maxDeviation(sq(10), sq(10))).toBe(0);
    expect(maxDeviation([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: -3, y: 5 }], sq(10))).toBeCloseTo(3, 5);
  });
});

describe('downsample', () => {
  it('halves a 2x2-block mask without changing the shape', () => {
    const m = mask(['####....', '####....', '....####', '....####']);
    const { mask: lo, cell } = downsample(m, 4);
    expect(cell).toBe(2);
    expect([...lo.data]).toEqual([1, 1, 0, 0, 0, 0, 1, 1]);
  });
  it('an empty image whose size is not a multiple of the cell stays empty (no sliver cells at the edge)', () => {
    const { mask: lo } = downsample({ w: 672, h: 2000, data: new Uint8Array(672 * 2000) }, 128);
    expect(lo.data.reduce((a, b) => a + b, 0)).toBe(0);
  });
  it('does not enlarge', () => {
    expect(downsample(mask(['##']), 100).cell).toBe(1);
  });
});

describe('buildShapes', () => {
  // Line-art figure on opaque white: a tall box with a wide shoulder bar and a thin spike (like a horned figure), 40 x 80 px.
  const art = () => {
    const rows: string[] = [];
    for (let y = 0; y < 80; y++) {
      let row = '';
      for (let x = 0; x < 60; x++) {
        const body = x >= 20 && x < 40 && y >= 20 && y < 78;
        const bar = x >= 5 && x < 55 && y >= 20 && y < 30;
        const spike = x >= 29 && x < 31 && y >= 2 && y < 20;
        const solid = body || bar || spike;
        const edge = solid && !(x > 0 && y > 0 && x < 59 && y < 79 && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => inside(x + dx, y + dy)));
        row += edge ? '#' : '.';
      }
      rows.push(row);
    }
    function inside(x: number, y: number) {
      return (x >= 20 && x < 40 && y >= 20 && y < 78) || (x >= 5 && x < 55 && y >= 20 && y < 30) || (x >= 29 && x < 31 && y >= 2 && y < 20);
    }
    return img(rows);
  };

  it('outline art becomes a filled silhouette within budget with high overlap', () => {
    const { d, w, h } = art();
    const s = buildShapes(d, w, h, { budgets: [8, 16, 32], maxDim: 60 });
    for (const b of [8, 16, 32]) expect(s.polys[b].length).toBeLessThanOrEqual(b);
    const truth = maskFromRGBA(d, w, h);
    expect(s.area).toBeGreaterThan(0.9 * truth.data.reduce((a, b) => a + b, 0));
    expect(polygonIoU(s.polys[16], truth)).toBeGreaterThan(0.93);
    expect(polygonIoU(s.polys[8], truth)).toBeGreaterThan(0.8);
    expect(polygonIoU(s.hull, truth)).toBeLessThan(polygonIoU(s.polys[16], truth));
  });

  it('core box ignores the shoulder bar and spike; bands and circle are inside the image', () => {
    const { d, w, h } = art();
    const s = buildShapes(d, w, h, { maxDim: 60, bands: 4 });
    expect(s.box.w).toBeGreaterThanOrEqual(48);
    expect(s.core.w).toBeLessThan(s.box.w);
    expect(s.core.h).toBeLessThan(s.box.h);
    expect(s.bands).toHaveLength(4);
    expect(s.circle.r).toBeGreaterThan(0);
    expect(s.circle.x).toBeGreaterThan(20);
    expect(s.circle.x).toBeLessThan(40);
  });

  it('throws on an image with nothing solid', () => {
    const { d, w, h } = img(['....', '....']);
    expect(() => buildShapes(d, w, h)).toThrow(/no solid/);
  });

  it('is plain JSON', () => {
    const { d, w, h } = art();
    const s = buildShapes(d, w, h);
    expect(JSON.parse(JSON.stringify(s)).polys[16]).toEqual(s.polys[16]);
  });
});

import { describe, expect, it } from 'vitest';
import { normalFromAlpha } from './normals';

// 21x21, opaque 11x11 block in the middle
const W = 21;
const alpha = Uint8Array.from({ length: W * W }, (_, i) => {
  const x = i % W, y = Math.floor(i / W);
  return x >= 5 && x <= 15 && y >= 5 && y <= 15 ? 255 : 0;
});
const px = (n: Uint8ClampedArray, x: number, y: number) => Array.from(n.slice((y * W + x) * 4, (y * W + x) * 4 + 3));

describe('normalFromAlpha', () => {
  const n = normalFromAlpha(alpha, W, W, 2, 2);
  it('is flat (pointing out of the screen) in the middle and far outside', () => {
    expect(px(n, 10, 10)).toEqual([128, 128, 255]);
    expect(px(n, 0, 0)).toEqual([128, 128, 255]);
  });
  it('tilts the left edge left, the right edge right, the top edge up (+Y up the screen)', () => {
    const [lr] = px(n, 5, 10), [rr] = px(n, 15, 10);
    expect(lr).toBeLessThan(110);
    expect(rr).toBeGreaterThan(146);
    expect(px(n, 10, 5)[1]).toBeGreaterThan(146);
    expect(px(n, 10, 15)[1]).toBeLessThan(110);
  });
  it('steeper strength tilts more', () => {
    const steep = normalFromAlpha(alpha, W, W, 2, 4);
    expect(px(steep, 5, 10)[0]).toBeLessThan(px(n, 5, 10)[0]);
  });
});

import { describe, expect, it } from 'vitest';
import { commDir, commFlip } from './comm';

describe('the Communicator\'s eight directions', () => {
  const at = (deg: number) => commDir(Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)); // 0 down (screen y grows), 90 right, 180 up

  it('picks a view per 45 degree sector, the same on both sides', () => {
    for (const s of [1, -1]) {
      expect([0, 20 * s, 45 * s, 90 * s, 135 * s, 160 * s, 180].map((d) => at(d))).toEqual(['front', 'front', 'frontside', 'side', 'backside', 'back', 'back']);
    }
  });

  it('flips the diagonals and the side, never the straight views', () => {
    expect(commFlip('side', -1)).toBe(true);
    expect(commFlip('frontside', -1)).toBe(true);
    expect(commFlip('backside', -1)).toBe(true);
    expect(commFlip('backside', 1)).toBe(false);
    expect(commFlip('front', -1)).toBe(false);
    expect(commFlip('back', -1)).toBe(false);
  });
});

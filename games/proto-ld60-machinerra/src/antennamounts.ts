/**
 * Where the painted antenna's tip is in each Communicator walk frame (stored px of the 92 x 148 picture, left of the art as drawn, unflipped).
 * Written by `tools/antenna-mounts.cjs`; `commview.ts` hangs the chain antenna (`antenna.ts`) on it, so the chain starts at the painted tip in every view and step.
 */
import type { CommDir } from './comm';

export const MOUNTS: Record<CommDir, [number, number][]> = {
  front: [[55.5, 7], [54.5, 5], [53.5, 3], [54.5, 5], [55.5, 7], [56.5, 5], [56.5, 3], [56.5, 5]],
  frontside: [[57.5, 7], [56.5, 5], [56, 3], [56.5, 5], [57.5, 7], [57.5, 5], [58, 3], [57.5, 5]],
  side: [[41.5, 10], [41.5, 8], [41.5, 7], [41.5, 8], [41.5, 10], [41.5, 8], [41.5, 7], [41.5, 8]],
  backside: [[45, 9], [45.5, 6], [46, 4], [45.5, 6], [45, 9], [44.5, 6], [44, 4], [44.5, 6]],
  back: [[47, 9], [47.5, 6], [48.5, 4], [47.5, 6], [47, 9], [46, 6], [45.5, 4], [46, 6]],
};

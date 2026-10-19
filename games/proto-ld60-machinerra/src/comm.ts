/** The Communicator's painted walk (art/communicator/<view>-<0..7>), shared by the mission and the hub. */
export type CommDir = 'front' | 'frontside' | 'side' | 'backside' | 'back';

/** Frames in each walk cycle. */
export const WALK = 8;

/**
 * Which view faces a heading, by 45 degree sectors: front walking down, back walking up, the side view across, and the two
 * diagonals between (`frontside`, `backside`). The art faces right; `commFlip` says when to mirror it for left.
 */
export const commDir = (dx: number, dy: number): CommDir => {
  const t = Math.atan2(Math.abs(dx), dy) / (Math.PI / 4); // 0 down, 2 across, 4 up, in 45 degree steps
  return t < 0.5 ? 'front' : t < 1.5 ? 'frontside' : t < 2.5 ? 'side' : t < 3.5 ? 'backside' : 'back';
};

/** Mirror the art: every view but straight down or up is drawn facing right, so a left-facing figure flips it. */
export const commFlip = (dir: CommDir, face: number) => dir !== 'front' && dir !== 'back' && face < 0;

/** The atlas frame: 8 frames per stride pair, from the same phase as the footfalls (a step lands every PI of `bob`); frame 0 standing. */
export const commFrame = (dir: CommDir, bob: number, moving: boolean) => `communicator/${dir}-${moving ? Math.floor((bob / (Math.PI * 2)) * WALK) % WALK : 0}`;

/**
 * The walk frame each view shows for the kick (`commkick.ts`, the 'pose' look): the widest stride (measured on the packed frames:
 * the legs' spread in the lower part of the frame is greatest at 2 and 6, which are mirror strides). Picked by index, so
 * regenerated frames slot in.
 */
export const KICK_FRAME: Record<CommDir, number> = { front: 2, frontside: 2, side: 2, backside: 2, back: 2 };
export const kickFrame = (dir: CommDir) => `communicator/${dir}-${KICK_FRAME[dir]}`;

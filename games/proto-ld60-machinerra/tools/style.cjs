// The house style for painted characters, matched to the Communicator's walk frames (the standard): his sheet painting
// was small, so his detail is coarse, flattened into blobs a few texture pixels wide, with a thin soot outline. Any
// painting, however fine, goes the same way: down to the Communicator's detail for its on-screen height, back up to the
// working size, Kuwahara-smoothed like his frames, then the 2x texture, 24 colours, a crisp 1 px outline (his fringe).
const { fromSharp, toSharp, resize, kuwahara, palette, quantize, outline } = require('./communicator-walk.cjs');

/** Source px per on-screen px the Communicator's frames were smoothed at (329 px for 74). */
const WORK = 329 / 74;
/**
 * Detail kept: the Communicator's sheet painting was about `DETAIL` source px per on-screen px, and soft (`SOFT`, a blur
 * in those px). Calibrated by running his own source through this pass and matching his frames (closest: 3 px, no extra
 * outline beyond his own one-px fringe).
 */
const DETAIL = 3;
const SOFT = 1.1;

/** A painting (float image) restyled for `h` on-screen px tall: the 2x texture, before its colours. */
async function restyle(src, h) {
  const coarse = await fromSharp((await toSharp(src)).resize({ height: Math.max(8, Math.round(h * DETAIL)), kernel: 'lanczos3' }).blur(SOFT));
  const work = await resize(coarse, Math.round(h * WORK));
  return resize(kuwahara(work, 3), h * 2);
}
/** Colours (a shared palette when given, so frames of one figure match) and the outline; in place. */
function finish(m, C = palette([m], 24)) {
  quantize(m, C, false);
  outline(m, 1);
  return m;
}
module.exports = { restyle, finish, palette, fromSharp, toSharp, WORK, DETAIL };

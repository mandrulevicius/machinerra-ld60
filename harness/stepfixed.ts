export const FRAME_MS = 1000 / 60;

interface Steppable {
  step(time: number, delta: number): void;
  scene: { render: (...a: any[]) => void };
}

/**
 * `n` game steps of exactly `ms` each, from `from` on; returns the time the last one ended at. Wall time is never read, so the
 * game clock moves by n * ms however fast the CPU runs them. `render: false` skips drawing the scenes (the update still runs).
 */
export function stepFixed(game: Steppable, n: number, from: number, render = true, ms = FRAME_MS): number {
  const scene = game.scene;
  const draw = scene.render;
  if (!render) scene.render = () => {};
  try {
    let t = from;
    for (let i = 0; i < n; i++) game.step((t += ms), ms);
    return t;
  } finally {
    scene.render = draw;
  }
}

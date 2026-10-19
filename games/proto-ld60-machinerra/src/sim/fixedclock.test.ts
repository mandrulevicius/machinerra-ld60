import { afterEach, describe, expect, it, vi } from 'vitest';
import { FRAME_MS, stepFixed } from '../../../../harness/stepfixed';
import { NO_INPUT, Sim } from './sim';

const N = 600;

const rig = (seed: number) => {
  const sim = new Sim(seed);
  sim.bots = [sim.controller];
  let renders = 0;
  const game = {
    scene: { render: () => void renders++ },
    step(_t: number, ms: number) {
      sim.step(Math.min(0.05, ms / 1000), NO_INPUT);
      sim.events.length = 0;
      this.scene.render();
    },
  };
  return { sim, game, renders: () => renders };
};

const snap = (s: Sim) => JSON.stringify({ time: s.time, dayT: s.dayT, phase: s.day.phase, hornets: s.hornets.map((h) => [h.x, h.y, h.hp]), c: [s.controller.x, s.controller.y] });

afterEach(() => vi.restoreAllMocks());

describe('stepFixed: the game clock moves by steps, not wall time', () => {
  for (const render of [true, false])
    it(`${N} steps advance the clock by exactly ${N} * dt (render ${render})`, () => {
      const { sim, game, renders } = rig(7);
      const end = stepFixed(game, N, 1000, render);
      expect(end).toBeCloseTo(1000 + N * FRAME_MS, 6);
      expect(sim.time).toBeCloseTo(N * (FRAME_MS / 1000), 9);
      expect(sim.dayT).toBeCloseTo(N * (FRAME_MS / 1000), 9);
      expect(renders()).toBe(render ? N : 0);
      game.scene.render();
      expect(renders()).toBe(render ? N + 1 : 1);
    });

  it('the same seed gives the same sim state after N steps drawn, undrawn, and with a wild wall clock', () => {
    const a = rig(11);
    stepFixed(a.game, N, 0, true);
    const b = rig(11);
    let wall = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (wall += 1e6));
    vi.spyOn(Date, 'now').mockImplementation(() => (wall += 1e6));
    stepFixed(b.game, N, 5e9, false);
    expect(snap(b.sim)).toBe(snap(a.sim));
  });
});

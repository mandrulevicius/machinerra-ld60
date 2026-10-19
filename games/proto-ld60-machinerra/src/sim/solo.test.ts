import { describe, expect, it } from 'vitest';
import { MISSION } from './defs';
import { NO_INPUT, Sim } from './sim';
import { haulFrom } from '../hub/state';
import { rideLift } from './testkit';

/** A new game starts alone (`freshRoster()`: no robots): the mission is the Communicator and nobody else. */
const solo = (seed = 3) => new Sim(seed, [], 'desert', [], undefined, undefined, { crew: [] });
const run = (s: Sim, sec: number, input = NO_INPUT) => {
  for (let i = 0; i < sec * 30; i++) {
    s.step(1 / 30, input);
    s.events.length = 0;
  }
};

describe('a mission with an empty roster (a new game: level 1 alone)', () => {
  it('boots with the Communicator only, and steps through the day, walking and shooting, without throwing', () => {
    const s = solo();
    expect(s.crew).toEqual([]);
    expect(s.bots).toEqual([s.controller]);
    run(s, 10, { ...NO_INPUT, mx: 1, my: 0.5, ax: s.controller.x + 50, ay: s.controller.y, fire: true });
    run(s, 10, { ...NO_INPUT, kick: true, dash: true, skill: true, fire2: true });
    run(s, 15);
    s.setClock('midnight');
    run(s, 15);
    expect(s.phase).toBe('mission');
    expect(s.summary()).toBeTruthy();
  });

  it('the lift can be ridden: nobody is aboard but him, and the haul says no robot went or came back', () => {
    const s = solo();
    rideLift(s);
    expect(s.phase).toBe('done');
    expect([s.stats.saved, s.stats.left]).toEqual([0, 0]);
    const h = haulFrom(s, 'h');
    expect(h.robots).toEqual([]);
    expect(h.went).toBeUndefined(); // nobody went down: `landRoster` wrecks nobody
  });

  it('finish and evacuate work with no crews', () => {
    const s = solo();
    s.evacuate();
    s.controller.x += 400;
    s.finish();
    expect(s.phase).toBe('done');
    expect([s.stats.saved, s.stats.left]).toEqual([0, 0]);
  });

});

import { describe, expect, it } from 'vitest';
import { NO_INPUT, Sim } from './sim';

// `berserk.test.ts` runs this for 30 s per side; here it runs two whole minutes.
describe('berserk steps in the mission, over two minutes', () => {
  it('the hives let hornets out faster a step at a time: about 2.5x as often 40 steps in', () => {
    const spawned = (past: number) => {
      const s = new Sim(3);
      s.bots = [s.controller];
      s.god = true;
      s.setClock(s.day.at.midnight + past);
      s.cfg.swarm = 1;
      for (const n of s.nests) { n.awake = true; n.spawnT = 0; }
      let n = 0;
      for (let i = 0; i < 120 * 30; i++) {
        s.step(1 / 30, NO_INPUT);
        for (const e of s.events) if (e.e === 'spawn' && e.h.nest !== 0) n++; // the hives' own (a hunter pack has no hive)
        s.events.length = 0;
        for (const h of s.hornets) h.hp = 0, h.dead = true; // room for the next one
      }
      return n;
    };
    const first = spawned(0), later = spawned(400);
    expect(later / first).toBeGreaterThan(1.8);
    expect(later / first).toBeLessThan(3.2);
  });
});

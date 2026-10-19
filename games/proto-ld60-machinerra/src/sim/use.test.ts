import { describe, expect, it } from 'vitest';
import { ACTION, MISSION } from './defs';
import { NO_INPUT, Sim } from './sim';
import { rideLift, tap } from './testkit';

const alone = (seed = 3) => {
  const s = new Sim(seed);
  s.bots = [s.controller];
  return s;
};
const run = (s: Sim, sec: number) => {
  for (let i = 0; i < Math.round(sec * 30); i++) {
    s.step(1 / 30, NO_INPUT);
    s.events.length = 0;
  }
};

describe('Use is one press (Minos, 2026-10-18)', () => {
  it('the lift asks first: one press arms it, a second within the seconds rides, a late second asks again', () => {
    const s = alone();
    expect(s.onLift(s.controller)).toBe(true);
    tap(s);
    expect(s.armed).toMatchObject({ key: 'lift', verb: 'Ride up?' });
    expect(s.phase).toBe('mission');
    run(s, ACTION.confirm + 0.3);
    expect(s.armed).toBeNull(); // it lapsed
    tap(s);
    expect(s.phase).toBe('mission'); // a press after the lapse only asks again
    expect(s.armed).not.toBeNull();
    tap(s);
    expect(s.phase).toBe('rising');
    run(s, MISSION.riseTime + 0.5);
    expect(s.phase).toBe('done');
  });

  it('walking off the lift withdraws the ask; holding the key is one press, not a ride', () => {
    const s = alone();
    tap(s);
    expect(s.armed).not.toBeNull();
    s.controller.x += 400;
    run(s, 0.1);
    expect(s.armed).toBeNull();
    s.controller.x = s.lift.x;
    s.controller.y = s.lift.y;
    for (let i = 0; i < 90; i++) s.step(1 / 30, { ...NO_INPUT, use: true });
    expect(s.phase).toBe('mission');
    rideLift(alone());
  });

  it('a robot is sent to the lift when the Communicator has asked it (evac)', () => {
    const s = new Sim(3);
    tap(s);
    expect(s.armed?.key).toBe('lift');
    run(s, 0.5);
    expect(s.crew.some((b) => b.mind?.doing === 'evac')).toBe(true);
  });

  it('the way down into a dungeon asks too; a ruin search is timed and is not asked', () => {
    const s = alone();
    const p = s.places.find((q) => q.id === 'dungeon')!;
    const shaft = p.parts.find((q) => q.kind === 'shaft')!;
    s.controller.x = shaft.x;
    s.controller.y = shaft.y + 30;
    const down: string[] = [];
    const watch = () => {
      for (const e of s.events) if (e.e === 'place' && e.what === 'descend') down.push(e.id);
      s.events.length = 0;
    };
    tap(s);
    watch();
    expect(s.armed?.key).toBe('dungeon');
    expect(down).toEqual([]);
    tap(s);
    watch();
    expect(down).toEqual(['dungeon']);
  });

  it('a dead ruin search is one press and a short wait, paused outside the zone', () => {
    const s = alone();
    const r = s.ruins.find((x) => !x.live)!;
    s.controller.x = r.x;
    s.controller.y = r.y + 20;
    tap(s);
    expect(s.action?.ruin).toBe(r);
    expect(r.searched).toBe(false);
    run(s, 2);
    expect(r.searched).toBe(true);
    expect(s.action).toBeNull();
  });
});

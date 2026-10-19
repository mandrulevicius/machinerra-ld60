import { describe, expect, it } from 'vitest';
import { T } from './defs';
import { loadLand } from './lands';
import { LESSON, Lessons, TAUGHT } from './lessons';
import { NO_INPUT, Sim, type Hornet } from './sim';
import { FIRST_SPAWNS, WANDER, expedition } from './spawntiers';

const level1 = (flown?: number) => new Sim('level1', [], 'desert', [], undefined, undefined, { land: loadLand('level1'), crew: [{ role: 'gatherer', name: 'Bellows' }], owned: ['Bellows'], flown });
const land = (flown?: number) => new Sim(7, [], 'desert', [], undefined, undefined, { flown });
const run = (s: Sim, sec: number) => {
  for (let t = 0; t < sec; t += 1 / 30) s.step(1 / 30, NO_INPUT);
};

describe('the gates: what is taught by missions flown', () => {
  it('the map and command mode open on mission 3, the call on mission 4; unset, all are open', () => {
    expect(new Lessons(1).open('map')).toBe(false);
    expect(new Lessons(1).open('command')).toBe(false);
    expect(new Lessons(2).open('map')).toBe(true);
    expect(new Lessons(2).open('command')).toBe(true);
    expect(new Lessons(2).open('barrage')).toBe(false);
    expect(new Lessons(3).open('barrage')).toBe(true);
    expect(new Lessons().open('barrage')).toBe(true);
    expect(TAUGHT).toEqual({ map: 2, command: 2, barrage: 3 });
  });

  it('no call before mission 4: its HUD slot is held back and the Wanderer refuses', () => {
    for (const flown of [0, 1, 2]) {
      const s = land(flown);
      expect(s.onboard.shows('support')).toBe(false);
      expect(s.callSupport(s.call, s.controller.x + 100, s.controller.y)).toBeTruthy();
      expect(s.strike).toBeNull();
    }
    expect(land(4).onboard.shows('support')).toBe(true);
  });

  it('no map before mission 3: its button is held back', () => {
    expect(land(1).onboard.shows('map')).toBe(false);
    expect(land(3).onboard.shows('map')).toBe(true);
  });
});

describe('mission 2 (level 1): no dial; mission 3: the clock pause', () => {
  it('level 1 hides the dial (its clock is locked to the morning) and lands on the lift pause, which waits for a press', () => {
    const s = level1(1);
    run(s, 1);
    expect(s.onboard.shows('clock')).toBe(false);
    expect(s.lessons.hush).toEqual({ id: 'lift', until: 'press' });
    expect(s.said.has('l1-lift')).toBe(true);
    const t0 = s.time;
    run(s, 60);
    expect(s.time).toBe(t0); // the world waits for the press
    s.lessons.press();
    run(s, 1);
    expect(s.lessons.hush).toBeNull();
    expect(s.time).toBeGreaterThan(t0);
    expect(s.onboard.shows('clock')).toBe(false);
    expect(s.dayT).toBe(0);
    expect(s.said.has('hello')).toBe(true); // level 1 skips her hello
  });

  it('mission 3: time stops on landing while the Oracle names the clock, and runs only when the player presses', () => {
    const s = land(2);
    expect(s.onboard.shows('clock')).toBe(false);
    run(s, 1);
    expect(s.lessons.hush?.id).toBe('clock');
    expect(s.onboard.shows('clock')).toBe(true);
    expect(s.dayT).toBe(0);
    expect(s.said.has('clock-day') && s.said.has('clock-hold')).toBe(true);
    expect(s.said.has('hello')).toBe(true); // marked said: the pause stands in for it
    // Minos: no line moves on by itself. However long she waits, the world waits with her.
    run(s, 600);
    expect(s.lessons.hush?.id).toBe('clock');
    expect(s.dayT).toBe(0);
    s.lessons.did('map'); // another tool's act does not end it
    expect(s.lessons.hush?.until).toBe('press');
    s.lessons.press();
    expect(s.lessons.hush).toBeNull();
    run(s, 2);
    expect(s.dayT).toBeGreaterThan(0);
    expect(s.lessons.hush?.id).toBe('map'); // the map's pause comes after, never over it
  });

  it('a replay of level 1 off mission 2 has no pause', () => {
    const s = level1(5);
    run(s, 1);
    expect(s.lessons.hush).toBeNull();
    expect(s.dayT).toBeGreaterThan(0);
  });

  it('expedition 1: wanderers, hive and rim send no elites; an elite Crawlcam guards Sprocket', () => {
    const s = level1(1);
    s.god = true;
    run(s, 0.2);
    const wanderers = s.hornets.filter((h) => !h.dead && !h.boss && h.home && !h.nest);
    expect(wanderers).toHaveLength(FIRST_SPAWNS[1].wander.n);
    for (const h of wanderers) expect(Math.hypot(h.x - s.lift.x, h.y - s.lift.y)).toBeGreaterThan(WANDER.away * T);
    s.lessons.hush = null;
    for (const n of s.nests) s.wake(n, 'test');
    const seen = new Set<Hornet>();
    for (let t = 0; t < 80; t += 1 / 30) {
      s.step(1 / 30, NO_INPUT);
      for (const h of s.hornets) if (!h.boss) seen.add(h);
    }
    expect([...seen].some((h) => h.rim)).toBe(true);
    expect([...seen].some((h) => h.nest)).toBe(true);
    for (const h of seen) {
      expect(h.elite).toBe(false);
      expect(h.kind).toBe(h.rim ? FIRST_SPAWNS[1].rim.kind : FIRST_SPAWNS[1].hive.kind); // Crawlcams over the rim, caterpillars wandering and from the hive
    }
    expect(FIRST_SPAWNS[1].hive.kind).toBe('caterpillar');
    expect(FIRST_SPAWNS[2].wander.kind).toBe('caterpillar');
  });
});

describe('spawn tiers (Minos: wandering weakest, hive middle, rim strongest)', () => {
  it('expedition 3 sends bees over the rim; the desert off the first three keeps its own', () => {
    expect(FIRST_SPAWNS[3].rim.kind).toBe('hornet');
    const s = land(3);
    expect(expedition(s)).toBe(FIRST_SPAWNS[3]);
    expect(expedition(land(4))).toBeNull();
    expect(expedition(land())).toBeNull();
  });
  it('wanderers are tied to their spots', () => {
    const s = land(2);
    run(s, 0.1);
    const w = s.hornets.filter((h) => h.home && !h.nest && !h.boss);
    expect(w.length).toBeGreaterThan(0);
    for (const h of w) expect(h.leash).toEqual(WANDER.leash);
  });
});

describe('mission 3: the map, then command mode, each with a pause', () => {
  it('the map pause waits until it is opened; command mode follows when calm and waits for C', () => {
    const s = land(2);
    s.hornets.length = 0;
    run(s, 0.1);
    s.lessons.press(); // the clock's pause comes first
    run(s, 1.5);
    expect(s.lessons.hush).toMatchObject({ id: 'map', until: 'map' });
    expect(s.onboard.shows('map')).toBe(true);
    const t0 = s.time;
    run(s, 5);
    expect(s.time).toBe(t0); // the world waits
    s.lessons.did('map');
    s.hornets.length = 0;
    run(s, LESSON.commandAfter + 1);
    expect(s.lessons.hush).toMatchObject({ id: 'command', until: 'command' });
    s.lessons.did('command');
    run(s, 0.5);
    expect(s.lessons.hush).toBeNull();
    expect(s.onboard.shows('support')).toBe(false);
  });
});

describe('mission 4: the call, asked for on a hive', () => {
  it('a hive in sight stops time until the call is made on it', () => {
    const s = land(3);
    // Away from every hive first: no pause.
    const away = (x: number, y: number) => Math.min(...s.nests.map((q) => Math.hypot(q.x - x, q.y - y)));
    const spots = [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9], [0.5, 0.5]].map(([u, v]) => s.passableNear(u * s.W * T, v * s.H * T));
    const far = spots.sort((p, q) => away(q.x, q.y) - away(p.x, p.y))[0];
    expect(away(far.x, far.y)).toBeGreaterThan(LESSON.hive * T);
    s.controller.x = far.x;
    s.controller.y = far.y;
    run(s, 0.5);
    expect(s.lessons.hush).toBeNull();
    const n = s.nests.find((q) => !q.dead)!;
    s.controller.x = n.x - 4 * T;
    s.controller.y = n.y;
    run(s, 0.2);
    expect(s.lessons.hush).toMatchObject({ id: 'barrage', until: 'barrage' });
    expect(s.onboard.shows('support')).toBe(true);
    expect(s.callSupport(s.call, n.x, n.y)).toBeNull();
    expect(s.lessons.hush).toBeNull();
  });
});

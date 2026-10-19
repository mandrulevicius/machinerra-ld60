import { describe, expect, it } from 'vitest';
import { BIOMES, MAST, T, type BiomeId } from './defs';
import { generate } from './mapgen';
import { landSignals, newFog } from './fog';
import { FOG_EVERY, sightNow } from './fogplay';
import { NO_INPUT, Sim } from './sim';
import { tap } from './testkit';

const run = (s: Sim, sec: number, input = NO_INPUT) => {
  for (let i = 0; i < sec * 30; i++) {
    s.step(1 / 30, input);
    s.events.length = 0;
  }
};
const tileOf = (px: number) => px / T - 0.5;

describe('the fog in a mission (P6)', () => {
  it('is blank before the first step and fills around the Communicator, then his robots', () => {
    const s = new Sim(3);
    expect(s.fog.fraction).toBe(0);
    s.step(1 / 30, NO_INPUT);
    const c = s.controller;
    expect(s.fog.at(tileOf(c.x), tileOf(c.y))).toBe(true);
    const first = s.fog.fraction;
    expect(first).toBeGreaterThan(0.02);
    expect(first).toBeLessThan(0.1);
    // A robot sent far off reveals where it walks, not where it is not.
    const far = { x: (s.map.w - 8) * T, y: (s.map.h - 8) * T };
    expect(s.fog.at(tileOf(far.x), tileOf(far.y))).toBe(false);
    const b = s.addBot('gatherer', 'Scout', far.x, far.y, 1);
    run(s, FOG_EVERY * 2);
    expect(s.fog.at(tileOf(b.x), tileOf(b.y))).toBe(true);
    expect(s.fog.fraction).toBeGreaterThan(first);
  });

  it('a downed robot stops seeing', () => {
    const s = new Sim(3);
    const b = s.addBot('gatherer', 'Scout', (s.map.w - 8) * T, (s.map.h - 8) * T, 1);
    b.dead = true;
    run(s, 1);
    expect(s.fog.at(tileOf(b.x), tileOf(b.y))).toBe(false);
  });

  it('night and the Sandstorm shorten sight, the lit mast less', () => {
    const day = new Sim(3), night = new Sim(3, [], 'desert', [], undefined, undefined, { dayT: 0 });
    expect(sightNow(day, 'communicator')).toBeCloseTo(10);
    night.dayT = 1e5;
    night.day = { ...night.day, hour: 24 };
    expect(sightNow(night, 'communicator')).toBeLessThan(sightNow(day, 'communicator'));
    expect(sightNow(night, 'mast') / sightNow(day, 'mast')).toBeGreaterThan(sightNow(night, 'communicator') / sightNow(day, 'communicator'));
  });

  it('lighting the Signal Mast reveals its land, wherever the Communicator is', () => {
    const seed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((n) => generate(n).places.some((p) => p.id === 'mast'))!;
    expect(seed).toBeDefined();
    const s = new Sim(seed);
    s.bots = [s.controller];
    const p = s.places.find((x) => x.id === 'mast')!;
    const m = p.parts.find((q) => q.kind === 'mast')!;
    s.controller.x = m.x;
    s.controller.y = m.y + 40;
    expect(s.fog.at(tileOf(m.x) + 15, tileOf(m.y))).toBe(false);
    tap(s);
    run(s, MAST.hold + 0.5);
    expect(p.state).toBe('lit');
    expect(s.fog.at(tileOf(m.x) + 15, tileOf(m.y))).toBe(true); // 15 tiles: past his own sight (10), inside the mast's (18)
    expect(s.fog.at(tileOf(m.x) + 22, tileOf(m.y))).toBe(false);
  });

  it('faces the aim point; no aim keeps the last facing', () => {
    const s = new Sim(3);
    const c = s.controller;
    s.step(1 / 30, { ...NO_INPUT, ax: c.x, ay: c.y - 200 });
    expect(s.facing).toBeCloseTo(-Math.PI / 2);
    s.step(1 / 30, NO_INPUT);
    expect(s.facing).toBeCloseTo(-Math.PI / 2);
  });

  it('shows in the summary, and dev clear/all work', () => {
    const s = new Sim(3);
    s.step(1 / 30, NO_INPUT);
    const f = s.summary().fog;
    expect(f.seen).toMatch(/%$/);
    expect(f.signals.length).toBeGreaterThan(0);
    s.fog.revealAll();
    expect(s.summary().fog.signals).toEqual([]);
    s.fog.clear();
    expect(s.fog.fraction).toBe(0);
  });
});

// A land takes ~30 ms to generate (the run memoizes them): a few seeds per biome.
describe('ruin clusters (the mapgen hook)', () => {
  const lands = (['desert', 'jungle', 'city', 'demon', 'mountains', 'ether'] as BiomeId[]).flatMap((b) => Array.from({ length: 6 }, (_, i) => ({ b, seed: i + 1 })));

  it('give most lands a rich-ruins signal, with the same ruins as before (moved, never added or lost)', () => {
    let with_ = 0;
    for (const { b, seed } of lands) {
      const m = generate(seed, undefined, undefined, b);
      if (landSignals(m).some((s) => s.kind === 'ruins')) with_++;
      expect(m.ruins.filter((r) => r.trail === undefined && !r.place).length).toBe(BIOMES[b].ruins?.length ?? 6);
    }
    expect(with_ / lands.length, 'share of lands with a cluster').toBeGreaterThan(0.9);
  });

  it('keep every ruin on the map, clear of the lift, seeps, hives and places, and walkable from the lift', () => {
    for (const { b, seed } of lands.filter((l) => l.seed <= 3)) {
      const m = generate(seed, undefined, undefined, b);
      const loose = m.ruins.filter((r) => r.trail === undefined && !r.place); // a place's own ruins keep the place's layout
      const fixed = m.ruins.filter((r) => r.place);
      for (const r of loose) {
        expect(Math.hypot(r.x - m.lift.x, r.y - m.lift.y)).toBeGreaterThanOrEqual(8);
        for (const o of [...m.seeps, ...m.nests, ...loose.filter((q) => q !== r), ...fixed]) expect(Math.hypot(r.x - o.x, r.y - o.y)).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it('the fog still starts blank for any land', () => {
    expect(newFog(generate(5)).fraction).toBe(0);
  });
});

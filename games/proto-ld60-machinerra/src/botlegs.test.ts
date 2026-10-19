import { describe, expect, it } from 'vitest';
import { BOT_LEGS, LEN, newBotLegs, poseBotLegs, replant, stepBotLegs, type BotLegSet } from './botlegs';
import { ELEV, T } from './sim/defs';
import { elevAt } from './sim/spider';
import { Ter } from './sim/mapgen';

/** A seeded stream, so the gait's rolls are the same every run. */
const seeded = () => {
  let s = 12345;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};
const flat = () => 0;
const DT = 1 / 60;
/** Walk the body along +x at `speed` px/s for `sec` seconds from where it is. */
const walk = (s: BotLegSet, speed: number, sec: number, each?: () => void) => {
  for (let i = 0; i < Math.round(sec / DT); i++) {
    stepBotLegs(s, s.body.x + speed * DT, s.body.y, DT);
    each?.();
  }
};
const air = (s: BotLegSet) => s.legs.filter((l) => l.t > 0).length;

describe('a robot on spider legs', () => {
  it('has four legs, planted at rest, hips at their height on flat ground', () => {
    const s = newBotLegs(100, 100, flat, seeded());
    expect(s.legs.length).toBe(BOT_LEGS.n);
    expect(air(s)).toBe(0);
    expect(s.z).toBeCloseTo(LEN.stand, 5);
    for (const l of s.legs) expect(l.foot.z).toBe(0);
  });

  it('standing still, no foot moves', () => {
    const s = newBotLegs(100, 100, flat, seeded());
    const before = s.legs.map((l) => ({ ...l.foot }));
    for (let i = 0; i < 120; i++) stepBotLegs(s, 100, 100, DT);
    s.legs.forEach((l, i) => expect(l.foot).toEqual(before[i]));
  });

  it('walking at a robot\'s pace, the feet step in turn: a foot stays planted while the body passes and then steps ahead of it, and the two diagonals trade places', () => {
    const s = newBotLegs(0, 0, flat, seeded());
    let steps = 0, frames = 0, mixed = 0;
    const was = s.legs.map(() => false);
    walk(s, 100, 4, () => {
      s.legs.forEach((l, i) => {
        if (l.t > 0 && !was[i]) steps++;
        was[i] = l.t > 0;
      });
      frames++;
      if (new Set(s.legs.filter((l) => l.t > 0).map((l) => l.group)).size > 1) mixed++;
    });
    expect(steps).toBeGreaterThan(20); // it walked 400 px: each foot stepped several times, not once a frame
    expect(steps).toBeLessThan(60);
    expect(mixed / frames).toBeLessThan(0.1); // a leg of each diagonal in the air together is rare (a stretched leg must go)
    // Each landed foot is ahead of where the body was when it left (a lead), and none is farther than its leg reaches.
    for (const l of s.legs) expect(Math.hypot(l.foot.x - s.body.x, l.foot.y - s.body.y)).toBeLessThanOrEqual(s.opts.reach + 1e-6);
    expect(Math.max(...s.legs.map((l) => l.foot.x))).toBeGreaterThan(s.body.x);
  });

  it('each leg is two bones of the lengths it was given, from the hip to the foot', () => {
    const s = newBotLegs(0, 0, flat, seeded());
    walk(s, 50, 1);
    for (const p of poseBotLegs(s)) {
      const d = (a: typeof p.hip, b: typeof p.hip) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      expect(d(p.hip, p.knee)).toBeCloseTo(LEN.thigh, 3);
      expect(d(p.knee, p.foot)).toBeCloseTo(LEN.shin, 3);
      expect(p.knee.z).toBeGreaterThan(Math.min(p.hip.z, p.foot.z)); // the knee bends up
    }
  });

  it('the feet climb a mesa edge: they lift over the ground they cross and the hips ride up with them', () => {
    // A ledge of rock at x >= 8 tiles, the land's own heights (elevAt), 40 tiles square, sand elsewhere.
    const W = 40, H = 20;
    const ter = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 8; x < W; x++) ter[y * W + x] = Ter.Rock;
    const heightAt = (x: number, y: number) => elevAt(ter, W, H, x, y);
    const s = newBotLegs(5 * T, 10 * T, heightAt, seeded());
    expect(s.z).toBeCloseTo(LEN.stand, 1);
    let lifted = 0;
    walk(s, 40, 8, () => {
      for (const l of s.legs) if (l.t > 0.2 && l.t < 0.8 && l.to.z > l.from.z + 1 && l.foot.z > l.from.z + 1) lifted++;
    });
    expect(s.body.x).toBeGreaterThan(10 * T); // it is on the rock
    expect(lifted).toBeGreaterThan(0); // some foot rose as it stepped up
    for (const l of s.legs) if (l.t === 0) expect(l.foot.z).toBeCloseTo(ELEV.rock, 0);
    expect(s.z).toBeGreaterThan(ELEV.rock + LEN.stand - 2);
    expect(s.z).toBeLessThan(ELEV.rock + LEN.stand + 1);
  });

  it('replanting sets every foot on its rest spot and the hips on the ground it stands on', () => {
    const s = newBotLegs(0, 0, flat, seeded());
    walk(s, 80, 1);
    replant(s, 500, 300);
    expect(air(s)).toBe(0);
    expect(s.body.x).toBe(500);
    for (const l of s.legs) {
      expect(l.foot.x).toBeCloseTo(500 + l.rest[0], 5);
      expect(l.foot.y).toBeCloseTo(300 + l.rest[1], 5);
    }
  });

  it('the legs on the far side are the ones behind the body (drawn behind it)', () => {
    const s = newBotLegs(0, 0, flat, seeded());
    const poses = poseBotLegs(s);
    expect(poses.filter((p) => p.far).length).toBe(2);
    for (const p of poses) expect(p.far).toBe(p.foot.y < s.body.y);
  });
});

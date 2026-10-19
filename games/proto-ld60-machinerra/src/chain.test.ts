import { describe, expect, it } from 'vitest';
import { CHAINS, CORPSE, IDLE, chainKey, coilPoint, coilRadius, corpseAt, corpseLife, makeChain, makeRope, newPose, poseChain, pull, relay, ropeLength, stepChain, turnTo, wave, type ChainIn } from './chain';

const D = CHAINS.snake;
const still = (x = 0, y = 0): ChainIn => ({ x, y, vx: 0, vy: 0, wind: false, strike: false, aim: null, flung: false, hurt: false });
const dist = (r: { x: number[]; y: number[] }, i: number, hx: number, hy: number) => (i === 0 ? Math.hypot(r.x[0] - hx, r.y[0] - hy) : Math.hypot(r.x[i] - r.x[i - 1], r.y[i] - r.y[i - 1]));

describe('the rope', () => {
  it('keeps every point at the gap from the one before it, wherever the head goes', () => {
    const r = makeRope(D.n, 0, 0, 1, 0, D.gap);
    for (let t = 0; t < 200; t++) pull(r, Math.cos(t * 0.1) * 40 + t * 0.5, Math.sin(t * 0.13) * 30, D.gap);
    const hx = Math.cos(199 * 0.1) * 40 + 199 * 0.5, hy = Math.sin(199 * 0.13) * 30;
    for (let i = 0; i <= D.n; i++) expect(dist(r, i, hx, hy)).toBeCloseTo(D.gap, 6);
  });

  it('follows the head along its path: after a corner the tail has taken the corner too', () => {
    const r = makeRope(D.n, 0, 0, 1, 0, D.gap);
    const path: [number, number][] = [];
    for (let x = 0; x <= 120; x++) path.push([x, 0]);
    for (let y = 1; y <= 120; y++) path.push([120, y]);
    for (const [x, y] of path) pull(r, x, y, D.gap);
    // Every point is within a gap of the path it came along (no cutting across), and the tail is on the second leg.
    for (let i = 0; i <= D.n; i++) {
      const near = Math.min(...path.map(([x, y]) => Math.hypot(r.x[i] - x, r.y[i] - y)));
      expect(near).toBeLessThan(D.gap * 0.6);
    }
    expect(r.x[D.n]).toBeCloseTo(120, 0);
  });

  it('is laid straight behind the head', () => {
    const r = makeRope(4, 10, 10, 0, 1, 5);
    expect(r.x[2]).toBeCloseTo(10);
    expect(r.y[2]).toBeCloseTo(10 - 15);
  });
});

describe('the wave and the turn', () => {
  it('grows toward the tail and travels with the phase', () => {
    const a = (i: number) => Math.abs(wave(i, 10, 1.3, 1, 0.8));
    expect(Math.max(...[0, 1, 2].map(a))).toBeLessThanOrEqual(0.5);
    expect(wave(3, 10, 0, 4, 0.8)).toBeCloseTo(wave(4, 10, 0.8, 4, 0.8) * ((0.4 + 0.18) / (0.4 + 0.24)), 5);
  });
  it('turns the short way round, no further than the step', () => {
    expect(turnTo(3, -3, 0.1)).toBeGreaterThan(3);
    expect(turnTo(0, 1, 0.1)).toBeCloseTo(0.1);
    expect(turnTo(0, 0.05, 0.1)).toBeCloseTo(0.05);
  });
});

describe('the coil', () => {
  it('winds the spiral under the head: it starts at the head, stays in its radius and is as long as the body', () => {
    const len = ropeLength(D.n, D.gap);
    const R = coilRadius(len, D.coil.turns);
    const p = { x: 0, y: 0, lift: 0 };
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= D.n; i++) {
      coilPoint(i, D.n, R, D.coil.turns, 1, 0.7, 0.7, p);
      pts.push({ x: p.x, y: p.y });
      expect(Math.hypot(p.x, p.y / 0.7 + 0)).toBeLessThan(R * 2.05);
    }
    // The first point is a gap or so from the head (the origin) and the whole spiral is about the body's length.
    expect(Math.hypot(pts[0].x, pts[0].y)).toBeLessThan(D.gap * 1.6);
    let path = Math.hypot(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) path += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    expect(path).toBeGreaterThan(len * 0.5);
    expect(path).toBeLessThan(len * 1.3);
  });

  it('comes on after the snake has stood still a while, and with a wind-up at once', () => {
    const s = makeChain(D, 0, 0, 0, 1);
    for (let t = 0; t < IDLE.after - 0.1; t += 0.02) stepChain(s, D, still(), 0.02);
    expect(s.coil).toBe(0);
    for (let t = 0; t < 1; t += 0.02) stepChain(s, D, still(), 0.02);
    expect(s.coil).toBe(1);
    const w = makeChain(D, 0, 0, 0, 1);
    for (let t = 0; t < 0.5; t += 0.02) stepChain(w, D, { ...still(), wind: true, aim: 1 }, 0.02);
    expect(w.coil).toBe(1);
  });

  it('lets go when it strikes, and does not coil while it moves', () => {
    const s = makeChain(D, 0, 0, 0, 1);
    s.coil = 1;
    for (let t = 0; t < 0.3; t += 0.02) stepChain(s, D, { ...still(), strike: true, aim: 0, vx: 400 }, 0.02);
    expect(s.coil).toBe(0);
    const m = makeChain(D, 0, 0, 0, 1);
    let x = 0;
    for (let t = 0; t < 3; t += 0.02) stepChain(m, D, { ...still(x), vx: 100 }, 0.02), (x += 2);
    expect(m.coil).toBe(0);
  });

  it('a foe with no coil never coils', () => {
    const d = CHAINS.veinworm;
    const s = makeChain(d, 0, 0, 0, 1);
    for (let t = 0; t < 3; t += 0.02) stepChain(s, d, { ...still(), wind: true }, 0.02);
    expect(s.coil).toBe(0);
  });
});

describe('the pose', () => {
  it('keeps plates a plate apart while moving, whatever the wave does', () => {
    const s = makeChain(D, 0, 0, 0, 1);
    const pose = newPose(D.n);
    let x = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
      x += 1.7;
      stepChain(s, D, { ...still(x), vx: 100 }, 1 / 60);
      poseChain(s, D, x, 0, 1, t, pose);
    }
    for (let i = 1; i <= D.n; i++) {
      const g = Math.hypot(pose.parts[i].x - pose.parts[i - 1].x, pose.parts[i].y - pose.parts[i - 1].y);
      expect(g).toBeGreaterThan(D.gap * 0.5);
      expect(g).toBeLessThan(D.gap * 2);
    }
    // The wave puts the body off its straight line.
    expect(Math.max(...pose.parts.map((p) => Math.abs(p.y)))).toBeGreaterThan(0.5);
  });

  it('rears the head and stands the rattle up in the coil', () => {
    const s = makeChain(D, 0, 0, 0, 1);
    const pose = newPose(D.n);
    for (let t = 0; t < 1.5; t += 1 / 60) stepChain(s, D, still(), 1 / 60);
    poseChain(s, D, 0, 0, 1, 1, pose);
    expect(s.coil).toBe(1);
    expect(pose.head.lift).toBeGreaterThan(D.coil.rise * 0.8);
    expect(pose.parts[D.n].lift).toBeGreaterThan(D.coil.rattle * 0.8);
    expect(Math.abs(pose.parts[D.n].angle + Math.PI / 2)).toBeLessThan(0.5);
    // Every plate has gathered within a coil's width of the head.
    for (const p of pose.parts) expect(Math.hypot(p.x, p.y)).toBeLessThan(coilRadius(ropeLength(D.n, D.gap), D.coil.turns) * 2.4);
  });

  it('flails when struck: the wave grows, then settles', () => {
    const s = makeChain(D, 0, 0, 0, 1);
    stepChain(s, D, { ...still(), hurt: true }, 1 / 60);
    expect(s.shock).toBe(1);
    for (let t = 0; t < 1; t += 1 / 60) stepChain(s, D, still(), 1 / 60);
    expect(s.shock).toBe(0);
  });

  it('re-lays the rope when the head jumps (a spawn or a teleport)', () => {
    const s = makeChain(D, 0, 0, 0, 1);
    stepChain(s, D, still(900, 900), 1 / 60);
    for (let i = 0; i <= D.n; i++) expect(dist(s.rope, i, 900, 900)).toBeCloseTo(D.gap, 5);
    expect(Math.hypot(s.rope.x[D.n] - 900, s.rope.y[D.n] - 900)).toBeLessThan(ropeLength(D.n, D.gap) + 1);
  });
});

describe('which foes are chains', () => {
  it('the rattler, Old Rattlejaw and the vein-crawler', () => {
    expect(chainKey({ kind: 'snake', boss: false })).toBe('snake');
    expect(chainKey({ kind: 'snake', boss: true })).toBe('snakeBoss');
    expect(chainKey({ kind: 'veinworm', boss: false })).toBe('veinworm');
    expect(chainKey({ kind: 'hornet', boss: false })).toBeUndefined();
  });
});

describe('a chain back from off screen', () => {
  it('is laid straight behind its head, facing its way, and not coiled or flailing', () => {
    const st = makeChain(D, 0, 0, 0, 1);
    st.coil = 1;
    st.shock = 1;
    st.face = Math.PI / 2;
    relay(st, D, 300, 200);
    for (let i = 0; i <= D.n; i++) {
      expect(st.rope.x[i]).toBeCloseTo(300, 6);
      expect(st.rope.y[i]).toBeCloseTo(200 - D.gap * (i + 1), 6);
    }
    expect(st.coil).toBe(0);
    expect(st.shock).toBe(0);
    expect([st.px, st.py]).toEqual([300, 200]);
  });
});

describe('a fallen chain', () => {
  it('goes limp quickly, later down the body, and is whole until the lie is over', () => {
    expect(corpseAt(0, 0).limp).toBe(0);
    expect(corpseAt(0, CORPSE.limp).limp).toBe(1);
    expect(corpseAt(10, 10 * CORPSE.stagger).limp).toBe(0);
    expect(corpseAt(3, CORPSE.lie - 1).alpha).toBe(1);
  });

  it('fades plate by plate, the tail last, and is gone when its life is over', () => {
    const mid = CORPSE.lie + CORPSE.fade / 2;
    expect(corpseAt(0, mid).alpha).toBeLessThan(corpseAt(13, mid).alpha);
    for (let i = 0; i < 14; i++) expect(corpseAt(i, corpseLife(14)).alpha).toBe(0);
  });
});

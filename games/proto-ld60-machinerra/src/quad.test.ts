import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { newMotion, stepMotion, type Motive } from './foemotion';
import { foeGait } from './footsteps';
import { ORIGIN, QUADS, RIG, UNIT, footAt, fromOrigin, newQuad, pivotOrigin, solve, stepQuad, type Hold, type QuadDef, type QuadIn } from './quad';
import type { Enemy } from './sim/defs';

// The tool that cuts the drawings (CommonJS, its numbers are the truth).
type Rig = { k?: number; head: { box: number[]; neck: number[] }; legs: { id: string; far: boolean; front: boolean; phase: number; pts: number[][]; w: number }[] };
const tool = createRequire(import.meta.url)('../tools/mob-svg.cjs') as {
  MOBS: Record<string, [number, number, unknown]>;
  RIGS: Record<string, Rig>;
  boneBox: (pts: number[][], w: number, k?: number) => { w: number; h: number; pivot: [number, number] };
  bonesOf: (l: unknown) => number[][][];
};
const art = (frame: string) => existsSync(new URL(`../art/${frame}.png`, import.meta.url));
const kinds = Object.entries(QUADS) as [Enemy, QuadDef][];

describe('the rig repeats the cut', () => {
  it('has the six four-legged kinds', () => {
    expect(kinds.map(([k]) => k).sort()).toEqual(['bleater', 'boar', 'cart', 'cat', 'charger', 'goat']);
  });
  for (const [kind, q] of kinds) {
    it(`${kind}: the body's, head's and each bone's box and pivot are the tool's`, () => {
      const rig = tool.RIGS[kind], k = rig.k ?? 1;
      expect(tool.MOBS[kind].slice(0, 2)).toEqual(q.box);
      expect(tool.MOBS[`${kind}-body`].slice(0, 2)).toEqual(q.box);
      expect(tool.MOBS[`${kind}-head`].slice(0, 2)).toEqual(q.head.box);
      expect(q.head.frame).toBe(`foe/${kind}-head`);
      expect(q.head.at[0]).toBeCloseTo(rig.head.neck[0] * k, 6);
      expect(q.head.pivot[0]).toBeCloseTo((rig.head.neck[0] - rig.head.box[0]) * k, 6);
      expect(q.head.pivot[1]).toBeCloseTo((rig.head.neck[1] - rig.head.box[1]) * k, 6);
      q.legs.forEach((l, i) => {
        const def = rig.legs[i];
        const [thigh, shin] = tool.bonesOf(def);
        for (const [bone, pts, name] of [[l.thigh, thigh, 'thigh'], [l.shin, shin, 'shin']] as const) {
          const b = tool.boneBox(pts, def.w, k);
          expect(bone.frame).toBe(`foe/${kind}-leg-${def.id}-${name}`);
          expect(bone.box).toEqual([b.w, b.h]);
          expect(tool.MOBS[`${kind}-leg-${def.id}-${name}`].slice(0, 2)).toEqual([b.w, b.h]);
          expect(bone.pivot[0]).toBeCloseTo(b.pivot[0], 6);
          expect(bone.pivot[1]).toBeCloseTo(b.pivot[1], 6);
        }
        expect(l.at[0]).toBeCloseTo(def.pts[0][0] * k, 6);
        expect(l.at[1]).toBeCloseTo(def.pts[0][1] * k, 6);
        expect(l.far).toBe(def.far);
        expect(l.front).toBe(def.front);
        expect(l.phase).toBe(def.phase);
      });
    });

    it(`${kind}: every frame is painted`, () => {
      for (const f of [q.whole, q.body, q.head.frame, ...q.legs.flatMap((l) => [l.thigh.frame, l.shin.frame])]) expect(art(f), f).toBe(true);
    });

    it(`${kind}: pivots sit inside their frames, a hip is measured from the body's origin`, () => {
      const [dx, dy] = fromOrigin(q, 20, 20);
      expect(dx).toBeCloseTo(20 - q.box[0] / 2, 6);
      expect(dy).toBeCloseTo(20 - (ORIGIN.y * (q.box[1] + 4) - 2), 6);
      for (const b of [q.head, ...q.legs.flatMap((l) => [l.thigh, l.shin])]) {
        const [ox, oy] = pivotOrigin(b);
        expect(ox).toBeGreaterThan(0);
        expect(ox).toBeLessThan(1);
        expect(oy).toBeGreaterThan(0);
        expect(oy).toBeLessThan(1);
      }
    });

    it(`${kind}: its gait is a walk of the foe's gait, and the foot path fits its legs`, () => {
      expect(foeGait(kind)).not.toBe('none');
      expect(q.reach).toBeGreaterThan(0);
      expect(q.dip).toBeGreaterThanOrEqual(0);
      expect(q.dip).toBeLessThanOrEqual(3 + 1e-9);
      for (const l of q.legs) expect(Math.abs(l.foot[0]) + q.reach).toBeLessThan(l.upper + l.lower);
    });
  }
});

describe('the knee solve', () => {
  for (const [kind, q] of kinds) {
    it(`${kind}: the drawn pose is the rest, any reachable foot is met, an unreachable one is brought near`, () => {
      for (const l of q.legs) {
        const rest = solve(l, l.foot[0], l.foot[1]);
        expect(Math.abs(rest[0])).toBeLessThan(1e-6);
        expect(Math.abs(rest[1])).toBeLessThan(1e-6);
        for (const [dx, dy] of [[2, -2], [-3, -1], [1.5, -4], [0, 1]]) {
          const tx = l.foot[0] + dx, ty = l.foot[1] + dy;
          if (Math.hypot(tx, ty) > 0.95 * (l.upper + l.lower)) continue;
          const [t, k] = solve(l, tx, ty);
          const f = footAt(l, t, k);
          expect(f[0]).toBeCloseTo(tx, 4);
          expect(f[1]).toBeCloseTo(ty, 4);
        }
        const far = solve(l, 100, 100);
        const f = footAt(l, far[0], far[1]);
        expect(Math.hypot(...f)).toBeLessThanOrEqual(l.upper + l.lower + 1e-6);
        expect(Math.atan2(f[1], f[0])).toBeCloseTo(Math.PI / 4, 1);
      }
    });

    it(`${kind}: the knee stays on the side it is drawn on`, () => {
      for (const l of q.legs) {
        const [t, k] = solve(l, l.foot[0] + 1, l.foot[1] - 2);
        // The knee's position after the thigh's turn, against the hip-to-foot line.
        const kx = l.knee[0] * Math.cos(t) - l.knee[1] * Math.sin(t), ky = l.knee[0] * Math.sin(t) + l.knee[1] * Math.cos(t);
        const f = footAt(l, t, k);
        const side = Math.sign(kx * f[1] - ky * f[0]);
        expect(side).toBe(-l.side);
      }
    });
  }
});

/** Walk a rigged foe at `speed` px/s for `secs`, calling `each` every frame with the stepped state. */
function walkIt(kind: Enemy, speed: number, secs: number, each: (st: ReturnType<typeof newQuad>, mo: Motive, i: number, x: number, walk: number) => void, hold: Hold | null = null) {
  const q = QUADS[kind]!, st = newQuad(), m = newMotion(), mo: Motive = { hop: 0, rock: 0, late: 0 };
  const dt = 1 / 240, gait = foeGait(kind);
  const inp: QuadIn = { walk: 0, speed, hop: 0, late: 0, hold, t: 0, seed: 0 };
  let x = 0;
  for (let i = 0; i < secs / dt; i++) {
    stepMotion(m, dt, speed, gait, false, false, mo, q.gait);
    x += speed * dt;
    inp.walk = m.walk;
    inp.hop = mo.hop;
    inp.late = mo.late;
    inp.t = i * dt;
    stepQuad(q, st, dt, inp);
    each(st, mo, i, x, m.walk);
  }
  return { st, m };
}

describe('the walk', () => {
  const cat = QUADS.cat!;

  it('stands still when the foe does', () => {
    const { st } = walkIt('cat', 0, 1, () => {});
    for (const a of [...st.thigh, ...st.knee]) expect(Math.abs(a)).toBeLessThan(1e-6);
    expect(st.drop).toBe(0);
  });

  it('steps diagonal pairs together and the two pairs against each other', () => {
    let worst = 0, widest = 0, against = 0;
    walkIt('cat', 120, 1.5, (st, _mo, i) => {
      if (i < 240) return;
      // How far each foot is from where it rests, sideways: rear far (0) and front near (3) are in step, front far (1) and rear near (2) against them.
      const d = cat.legs.map((l, n) => footAt(l, st.thigh[n], st.knee[n])[0] - l.foot[0]);
      worst = Math.max(worst, Math.abs(d[0] - d[3]), Math.abs(d[1] - d[2]));
      against = Math.max(against, Math.abs(d[0] - d[1]));
      widest = Math.max(widest, Math.abs(d[0]));
    });
    expect(worst).toBeLessThan(0.3);
    expect(against).toBeGreaterThan(cat.reach);
    expect(widest).toBeGreaterThan(cat.reach * 0.9);
    expect(cat.legs.map((l) => l.phase)).toEqual([0, 1, 1, 0]);
  });

  it('lifts a foot with the knee folding, and puts it down straighter', () => {
    const lift: number[] = [];
    walkIt('cat', 120, 1.5, (st, _mo, i) => {
      if (i > 240) lift.push(st.knee[0] * cat.legs[0].flex);
    });
    // Positive = folded more than drawn: it folds during the swing and is not folded when planted.
    expect(Math.max(...lift)).toBeGreaterThan(0.25);
    expect(Math.min(...lift)).toBeLessThan(0.1);
  });

  for (const [kind, q] of kinds) {
    it(`${kind}: a planted foot stays put on the ground`, () => {
      const speed = kind === 'bleater' ? 165 : 120;
      const l = q.legs[0];
      const gx = (l.at[0] + l.foot[0]) * UNIT;
      // The foot in the world while this leg is in its stance (the middle 90% of it): the body went `x` along, is up by the hop and
      // down by its dip, and the ground is where the foot rested.
      let slide = 0, worstY = 0, frames = 0;
      const win: { x: number; y: number }[][] = [];
      let was = -1;
      walkIt(kind, speed, 4, (st, mo, i, x, walk) => {
        const p = (((walk + l.phase) % 2) + 2) % 2;
        if (i < 240 || p < 1.05 || p > 1.95) return void (was = -1);
        const f = footAt(l, st.thigh[0], st.knee[0]);
        if (was < 0) win.push([]);
        was = 1;
        frames++;
        win[win.length - 1].push({ x: x + (l.at[0] + f[0]) * UNIT - gx, y: -mo.hop + st.drop + (l.at[1] + f[1]) * UNIT - (l.at[1] + l.foot[1]) * UNIT });
      });
      for (const w of win) {
        slide = Math.max(slide, Math.max(...w.map((r) => r.x)) - Math.min(...w.map((r) => r.x)));
        worstY = Math.max(worstY, ...w.map((r) => Math.abs(r.y)));
      }
      expect(win.length).toBeGreaterThan(3);
      // How far the foot moves over the ground in one stance, against the stride (the legs' reach may fall short of it).
      const share = slide / q.stride;
      console.log(`${kind}: stride ${q.stride.toFixed(1)} px, reach ${(q.reach * UNIT).toFixed(1)} px of ${(q.stride / 2).toFixed(1)}, dip ${q.dip.toFixed(1)} px, slide ${slide.toFixed(2)} px (${(share * 100).toFixed(0)}% of a stride), off the ground by up to ${worstY.toFixed(2)} px`);
      expect(worstY).toBeLessThan(0.8);
      expect(share).toBeLessThan(0.22);
    });
  }

  it('never swings a thigh past what the leg can do', () => {
    walkIt('cat', 300, 2, (st) => {
      for (const a of st.thigh) expect(Math.abs(a)).toBeLessThan(1.4);
    });
  });
});

describe('the holds', () => {
  const q = QUADS.cat!;
  const hold = (h: Hold | null, secs = 1) => walkIt('cat', 0, secs, () => {}, h).st;

  it('a crouch sinks the body and sets the legs; a leap throws the front forward and the rear back', () => {
    const c = hold('crouch');
    expect(c.drop).toBeCloseTo(q.holds.crouch!.drop, 2);
    expect(c.thigh[0]).toBeCloseTo(q.holds.crouch!.rear[0], 2);
    expect(c.thigh[1]).toBeCloseTo(q.holds.crouch!.front[0], 2);
    expect(c.knee[0]).toBeCloseTo(q.legs[0].flex * q.holds.crouch!.rear[1], 2);
    const l = hold('leap');
    expect(l.thigh[1]).toBeLessThan(0);
    expect(l.thigh[0]).toBeGreaterThan(0);
    expect(l.drop).toBe(0);
  });

  it('the head goes down in a crouch and up in a leap', () => {
    expect(hold('crouch').nod).toBeCloseTo(q.holds.crouch!.head, 2);
    expect(hold('leap').nod).toBeCloseTo(q.holds.leap!.head, 2);
    expect(hold('leap').nod).toBeLessThan(0);
  });

  it('eases into a hold, and out of it into the walk, not in one frame', () => {
    const st = newQuad();
    const inp: QuadIn = { walk: 0.2, speed: 0, hop: 0, late: 0, hold: null, t: 0, seed: 0 };
    for (let i = 0; i < 60; i++) stepQuad(q, st, 1 / 60, inp);
    stepQuad(q, st, 1 / 60, { ...inp, hold: 'leap' });
    expect(Math.abs(st.thigh[0])).toBeLessThan(q.holds.leap!.rear[0] * 0.5);
    for (let i = 0; i < 30; i++) stepQuad(q, st, 1 / 60, { ...inp, hold: 'leap' });
    const held = st.thigh[0];
    stepQuad(q, st, 1 / 60, inp);
    expect(st.thigh[0]).toBeLessThan(held);
    expect(st.thigh[0]).toBeGreaterThan(held * 0.5);
  });

  it('a kind with no such hold does not take it', () => {
    const b = QUADS.boar!;
    const st = newQuad();
    for (let i = 0; i < 60; i++) stepQuad(b, st, 1 / 60, { walk: 0.2, speed: 0, hop: 0, late: 0, hold: 'leap', t: 0, seed: 0 });
    for (const a of [...st.thigh, ...st.knee, st.nod]) expect(Math.abs(a)).toBeLessThan(1e-6);
  });

  it('a flail moves every leg and stays inside its radius', () => {
    const st = newQuad();
    let seen = 0;
    for (let i = 0; i < 120; i++) {
      stepQuad(q, st, 1 / 60, { walk: 0, speed: 0, hop: 0, late: 0, hold: 'flail', t: i / 60, seed: 0 });
      for (const a of st.thigh) {
        seen = Math.max(seen, Math.abs(a));
        expect(Math.abs(a)).toBeLessThanOrEqual(RIG.flail.rad + 1e-9);
      }
    }
    expect(seen).toBeGreaterThan(0.4);
  });

  it('a boar paws with its near front leg while it braces, and drops its head', () => {
    const b = QUADS.boar!;
    const st = newQuad();
    const seen: number[] = [];
    for (let i = 0; i < 120; i++) {
      stepQuad(b, st, 1 / 60, { walk: 0, speed: 0, hop: 0, late: 0, hold: 'brace', t: i / 60, seed: 0 });
      seen.push(st.thigh[3]);
    }
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.3);
    expect(Math.abs(st.thigh[1] - b.holds.brace!.front[0])).toBeLessThan(0.01);
    expect(st.nod).toBeCloseTo(b.holds.brace!.head, 2);
  });

  it('the goat tips its horns forward and the charger and cart set theirs', () => {
    for (const kind of ['goat', 'charger', 'cart'] as const) {
      const st = newQuad();
      for (let i = 0; i < 60; i++) stepQuad(QUADS[kind]!, st, 1 / 60, { walk: 0, speed: 0, hop: 0, late: 0, hold: 'brace', t: i / 60, seed: 0 });
      expect(st.nod).toBeGreaterThan(0.25);
    }
  });
});

describe('the head', () => {
  it('trails the body: it sags as the body rises and nods with the stride, then is still', () => {
    const lag: number[] = [], nod: number[] = [];
    walkIt('boar', 100, 2, (st) => {
      lag.push(st.late);
      nod.push(st.nod);
    });
    expect(Math.max(...lag)).toBeGreaterThan(0.2);
    expect(Math.min(...lag)).toBeLessThan(-0.2);
    expect(Math.max(...nod)).toBeGreaterThan(0.01);
    const still = walkIt('boar', 0, 1, () => {}).st;
    expect(still.nod).toBe(0);
    expect(still.late).toBe(0);
  });
});

describe('each kind has its own gait numbers', () => {
  it('bleaters are skittish, chargers heavy, goats springy', () => {
    const g = (k: Enemy) => QUADS[k]!.gait;
    expect(g('bleater').cadence).toBeGreaterThan(g('goat').cadence);
    expect(g('charger').cadence).toBeLessThan(g('cat').cadence);
    expect(g('goat').hop).toBeGreaterThan(g('charger').hop);
    expect(g('goat').hop).toBeGreaterThan(1);
    expect(g('charger').hop).toBeLessThan(1);
  });
});

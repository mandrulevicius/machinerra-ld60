/** Arms with elbows on painted foes (P50): the rig repeats the tool's cut, every frame is painted, and the arms bend at the elbow with the foe's own beats. */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { ARMS, ARM_RIG, PAINTED_ARMS, armsOfKind, fromOrigin, handAt, newArms, paintedArms, stepArms, type ArmIn, type ArmsDef } from './arms';
import { ORIGIN } from './quad';
import type { Enemy } from './sim/defs';

const tool = createRequire(import.meta.url)('../tools/mob-svg.cjs') as { MOBS: Record<string, [number, number, unknown]> };
const art = (frame: string) => existsSync(new URL(`../art/${frame}.png`, import.meta.url));
const kinds = Object.entries(ARMS) as [Enemy, ArmsDef][];

const calm: ArmIn = { walk: 0, speed: 0, wind: false, struck: -1, twisted: false, flung: false, t: 0, seed: 0 };
/** Step an arm set for `secs` (the walk advancing with `speed`), returns its state. */
const run = (def: ArmsDef, o: Partial<ArmIn>, secs = 1) => {
  const st = newArms(def.arms.length);
  const i = { ...calm, ...o };
  for (let n = 0; n < secs * 60; n++) {
    i.walk += (i.speed / 120) / 60;
    i.t += 1 / 60;
    stepArms(def, st, 1 / 60, i);
  }
  return st;
};

describe('the rig repeats the cut', () => {
  it('has the painted foes whose drawing has arms', () => {
    expect(kinds.map(([k]) => k).sort()).toEqual(['commuter', 'mannequin', 'monkey', 'officer']);
  });
  for (const [kind, d] of kinds) {
    it(`${kind}: the body's and each bone's frame is the tool's`, () => {
      expect(tool.MOBS[kind].slice(0, 2)).toEqual(d.box);
      expect(tool.MOBS[`${kind}-body`].slice(0, 2)).toEqual(d.box);
      for (const a of d.arms)
        for (const b of [a.upper, a.lower]) {
          expect(b.frame.startsWith('foe/')).toBe(true);
          const [w, h] = tool.MOBS[b.frame.slice(4)];
          expect(w, b.frame).toBeCloseTo(b.box[0], 1);
          expect(h, b.frame).toBeCloseTo(b.box[1], 1);
          // The pivot is inside its box.
          expect(b.pivot[0]).toBeGreaterThan(0);
          expect(b.pivot[1]).toBeGreaterThan(0);
          expect(b.pivot[0]).toBeLessThan(b.box[0]);
          expect(b.pivot[1]).toBeLessThan(b.box[1]);
        }
    });
    it(`${kind}: every frame is painted`, () => {
      for (const f of [d.whole, d.body, ...d.arms.flatMap((a) => [a.upper.frame, a.lower.frame])]) expect(art(f), f).toBe(true);
    });
    it(`${kind}: the drawn arm has an elbow, and a point is measured from the body's origin`, () => {
      for (const a of d.arms) {
        expect(a.upperLen).toBeGreaterThan(3);
        expect(a.lowerLen).toBeGreaterThan(3);
        const [hx, hy] = handAt(a, 0, 0);
        expect(hx).toBeCloseTo(a.hand[0], 6);
        expect(hy).toBeCloseTo(a.hand[1], 6);
      }
      const [dx, dy] = fromOrigin(d.box, 10, 10);
      expect(dx).toBeCloseTo(10 - d.box[0] / 2, 6);
      expect(dy).toBeCloseTo(10 - (ORIGIN.y * (d.box[1] + 4) - 2), 6);
    });
  }
});

describe('the arms bend at the elbow', () => {
  const d = ARMS.monkey!;
  const lead = d.arms.findIndex((a) => a.id === d.gait.lead);
  it('a standing foe holds its arms as drawn', () => {
    const st = run(d, {});
    for (let i = 0; i < d.arms.length; i++) {
      expect(st.upper[i]).toBeCloseTo(0, 2);
      expect(st.elbow[i]).toBeCloseTo(0, 2);
    }
  });
  it('walking, the two arms swing against each other, and the elbows curl', () => {
    const st = run(d, { speed: 120 }, 1.3);
    expect(st.upper[0] * st.upper[1]).toBeLessThan(0.0001);
    expect(Math.abs(st.upper[0]) + Math.abs(st.upper[1])).toBeGreaterThan(0.05);
    expect(Math.min(...st.elbow)).toBeLessThan(0);
  });
  it('a twisted foe\'s arms swing together: the wrong rhythm', () => {
    const st = run(d, { speed: 120, twisted: true }, 1.3);
    expect(Math.sign(st.upper[0])).toBe(Math.sign(st.upper[1]));
  });
  it('a wind-up draws the lead arm back and cocks the forearm; the strike throws it forward, the elbow straightening', () => {
    const w = run(d, { wind: true }, 0.6);
    expect(w.upper[lead]).toBeGreaterThan(0.5);
    expect(w.elbow[lead]).toBeLessThan(-0.5);
    const s = run(d, { struck: 0.2 }, 0.4);
    expect(s.upper[lead]).toBeLessThan(0);
    expect(Math.abs(s.elbow[lead])).toBeLessThan(Math.abs(w.elbow[lead]));
    // The arm that is not the lead follows, less.
    const other = lead === 0 ? 1 : 0;
    expect(Math.abs(w.upper[other])).toBeLessThan(Math.abs(w.upper[lead]) + 1e-9);
  });
  it('a strike fades after its moment', () => {
    const o = { ...calm, struck: ARM_RIG.strike + 0.01 };
    const st = newArms(2);
    stepArms(d, st, 1 / 60, o);
    expect(st.strike).toBe(0);
  });
  it('a flung foe flails its arms', () => {
    const st = run(d, { flung: true }, 0.7);
    expect(Math.abs(st.upper[0]) + Math.abs(st.upper[1])).toBeGreaterThan(0.1);
  });
});

describe('the cut paintings (P50, on unless ?v.paintedArms=plain)', () => {
  const painted = Object.entries(PAINTED_ARMS) as [Enemy, ArmsDef][];
  it('is on by default', () => {
    expect(paintedArms.name).toBe('cut');
    for (const [k, d] of painted) expect(armsOfKind(k)).toBe(d);
  });
  it('turns off with the plain variant, and the drawn arms are there either way', () => {
    paintedArms.set('plain');
    for (const [k] of painted) expect(armsOfKind(k)).toBeUndefined();
    expect(armsOfKind('monkey')).toBe(ARMS.monkey);
    paintedArms.set('cut');
  });
  it("cuts Laimonas's swarmer, drone and the Ironback, and the shade", () => {
    expect(painted.map(([k]) => k).sort()).toEqual(['drone', 'gorilla', 'shade', 'swarmer']);
  });
  for (const [kind, d] of painted) {
    it(`${kind}: every frame is cut, the pivots are inside the painting, the arm has an elbow`, () => {
      for (const f of [d.whole, d.body, ...d.arms.flatMap((a) => [a.upper.frame, a.lower.frame])]) expect(art(f), f).toBe(true);
      for (const a of d.arms) {
        for (const b of [a.upper, a.lower]) {
          expect(b.box[0]).toBeCloseTo(d.box[0], 1);
          expect(b.box[1]).toBeCloseTo(d.box[1], 1);
          expect(b.pivot[0]).toBeGreaterThan(0);
          expect(b.pivot[1]).toBeGreaterThan(0);
          expect(b.pivot[0]).toBeLessThan(b.box[0]);
          expect(b.pivot[1]).toBeLessThan(b.box[1]);
        }
        expect(a.upperLen).toBeGreaterThan(3);
        expect(a.lowerLen).toBeGreaterThan(3);
      }
    });
  }
  it('measures a flier from its middle and a ground foe from its feet', () => {
    expect(PAINTED_ARMS.swarmer!.oy).toBe(0.5);
    expect(PAINTED_ARMS.gorilla!.oy).toBe(ORIGIN.y);
  });
});

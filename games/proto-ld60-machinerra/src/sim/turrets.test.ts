import { describe, expect, it } from 'vitest';
import { T, TURRET } from './defs';
import { addProp, hitProp } from './props';
import { NO_INPUT, Sim } from './sim';
import { turretTeles } from './turrets';

/** A bare land with the Communicator alone and one turret `dx` tiles to his right. */
const land = (dx = 5) => {
  const s = new Sim(3, [], 'desert');
  s.bots = [s.controller];
  s.hornets.length = 0;
  s.nests.length = 0;
  s.props.list.length = 0;
  s.props.solid.fill(0);
  s.props.at.clear();
  const c = s.controller, tx = Math.floor(c.x / T), ty = Math.floor(c.y / T);
  const p = addProp(s, { kind: 'turret', x: tx + dx, y: ty, wear: 1 });
  return { s, c, p, tx, ty };
};
const run = (s: Sim, secs: number) => {
  for (let i = 0; i < Math.round(secs * 30); i++) {
    s.controller.hp = Math.max(s.controller.hp, 1);
    s.step(1 / 30, NO_INPUT);
  }
};

describe('turrets (P47 part F)', () => {
  it('locks on with a tell, then fires one shot at the locked spot that hurts him', () => {
    const { s, c } = land();
    const hp = c.hp;
    let tell = -1, fired = -1;
    for (let i = 0; i < 120 && fired < 0; i++) {
      s.events.length = 0;
      s.step(1 / 30, NO_INPUT);
      for (const e of s.events) if (e.e === 'turret') (e.what === 'tell' ? (tell = i) : (fired = i));
      if (tell >= 0 && fired < 0 && i === tell) expect(turretTeles(s).length).toBe(1);
    }
    expect(tell).toBeGreaterThanOrEqual(0);
    expect(fired - tell).toBeGreaterThanOrEqual(Math.floor(TURRET.tell * 30) - 1);
    run(s, 1);
    expect(c.hp).toBeLessThan(hp);
  });

  it('out of range, or behind a wall, it holds its fire', () => {
    const far = land(Math.ceil(TURRET.range / T) + 3);
    run(far.s, 3);
    expect(far.s.turrets.get(far.p.id)?.mode ?? 'idle').toBe('idle');
    const hid = land(6);
    for (const dy of [-2, -1, 0, 1, 2]) addProp(hid.s, { kind: 'wall', x: hid.tx + 3, y: hid.ty + dy, wear: 1, material: 'concrete' });
    run(hid.s, 3);
    expect(hid.s.events.some((e) => e.e === 'turret')).toBe(false);
  });

  it('broken, it stops', () => {
    const { s, p } = land();
    hitProp(s, p, p.hp + 1);
    run(s, 3);
    expect(s.shots.length).toBe(0);
  });
});

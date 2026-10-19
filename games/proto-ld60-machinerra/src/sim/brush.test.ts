import { describe, expect, it } from 'vitest';
import { T, WEAPONS } from './defs';
import { NO_INPUT, Sim } from './sim';
import { swing } from './combat';
import { BRUSH, brushSweep } from './brush';
import { ITEMS } from './gear';
import { isTaught, recipesOf } from '../hub/taught';

const alone = () => {
  const s = new Sim(5, [], 'desert', [], undefined, undefined, { tier: 1 });
  s.bots = [s.controller];
  s.cfg.swarm = 0;
  s.controller.hp = s.controller.maxHp = 1e6;
  return s;
};
const brush = WEAPONS.mainBrush as Extract<(typeof WEAPONS)['mainBrush'], { kind: 'melee' }>;

describe('the Main Brush (P58 B)', () => {
  it('a full circle round him, short and weaker than the shovel', () => {
    expect(brush.arc).toBeCloseTo(Math.PI * 2);
    expect(brush.dmg).toBeLessThan((WEAPONS.shovel as typeof brush).dmg);
    expect(brush.reach).toBeLessThan(70);
  });

  it('knocks small foes outward on every side and sends them flying; an elite only takes the knock', () => {
    const s = alone();
    const c = s.controller;
    const front = s.spawnHornet(c.x + 30, c.y, 0, false, false, 'hornet');
    const behind = s.spawnHornet(c.x - 30, c.y, 0, false, false, 'hornet');
    const elite = s.spawnHornet(c.x, c.y + 30, 0, true, false, 'hornet');
    for (const h of [front, behind, elite]) h.vx = h.vy = 0;
    swing(s, c, 0, brush, false, 'mainBrush');
    expect(front.vx).toBeGreaterThan(0);
    expect(behind.vx).toBeLessThan(0);
    expect(elite.vy).toBeGreaterThan(0);
    expect(front.fling).toBeTruthy();
    expect(behind.fling).toBeTruthy();
    expect(elite.fling).toBeFalsy();
    // Not the kick's: its crashes are not kick kills (D34).
    expect(front.fling!.kick).toBeFalsy();
  });

  it('sweeps the loose scrap and copper within reach to his feet, and leaves the rest', () => {
    const s = alone();
    const c = s.controller;
    const near = { id: 1, x: c.x + BRUSH.sweep - 10, y: c.y, kind: 'scrap' as const, part: null, amt: 1, t: 60, dead: false };
    const copper = { ...near, id: 2, x: c.x, y: c.y - 80, kind: 'copper' as const };
    const far = { ...near, id: 3, x: c.x + BRUSH.sweep + 40 };
    const oil = { ...near, id: 4, kind: 'oil' as const, x: c.x - 60 };
    s.loot.push(near, copper, far, oil);
    expect(brushSweep(s, c)).toBe(2);
    expect(Math.hypot(near.x - c.x, near.y - c.y)).toBeLessThanOrEqual(BRUSH.feet + 0.01);
    expect(Math.hypot(copper.x - c.x, copper.y - c.y)).toBeLessThanOrEqual(BRUSH.feet + 0.01);
    expect(far.x).toBe(c.x + BRUSH.sweep + 40);
    expect(oil.x).toBe(c.x - 60);
    // In hand, a swing sweeps: the gobs are his a step later.
    s.weapon = 'mainBrush';
    s.loot.push({ ...near, id: 5, x: c.x + 100, y: c.y });
    const scrap = s.scrap;
    s.step(1 / 30, { ...NO_INPUT, fire: true, ax: c.x + 50, ay: c.y });
    s.step(1 / 30, NO_INPUT);
    expect(s.scrap).toBeGreaterThan(scrap);
    void T;
  });

  it('is her gift: no station teaches it', () => {
    expect(ITEMS.mainBrush.gift).toBe('princess');
    expect(isTaught({ stations: { hob: 'slot-1' } }, 'mainBrush', true)).toBe(false);
    expect(recipesOf('hob')).not.toContain('mainBrush');
  });
});

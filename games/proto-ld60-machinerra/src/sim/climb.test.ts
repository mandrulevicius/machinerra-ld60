import { describe, expect, it } from 'vitest';
import { SPIDER, T, WEAPON } from './defs';
import { ITEMS, addItem, equip, freshGear, type CrewRole } from './gear';
import { reachOf } from './botai';
import { Ter } from './mapgen';
import { CLIMB, climbable } from './path';
import { NO_INPUT, Sim, type Bot } from './sim';
import { snare } from './spider';
import type { CrewBot } from './types';

/** Gear with spider legs on the mobility socket of these roles. */
const legged = (...roles: CrewRole[]) => {
  let g = freshGear();
  for (const r of roles) {
    g = addItem(g, 'spiderLegs').gear;
    g = equip(g, g.items[g.items.length - 1].uid, r, 'mobility');
  }
  return g;
};

/** A plain sand yard round the lift with a 5x5 mesa 8 tiles east of it, a marksman in legs and a guard in wheels. The map is cut about, so the land's props are cleared there. */
function yard() {
  const crew: CrewBot[] = [
    { role: 'marksman', name: 'Legs', uid: 'a' },
    { role: 'guard', name: 'Wheels', uid: 'b' },
  ];
  const s = new Sim(3, [], 'desert', [], undefined, legged('marksman'), { crew });
  s.god = true;
  const lx = Math.floor(s.lift.x / T), ly = Math.floor(s.lift.y / T);
  const mesa = { x0: lx + 8, y0: ly - 2, x1: lx + 12, y1: ly + 2 };
  for (let y = ly - 6; y <= ly + 6; y++)
    for (let x = lx - 4; x <= lx + 18; x++) {
      const i = y * s.W + x;
      s.map.ter[i] = x >= mesa.x0 && x <= mesa.x1 && y >= mesa.y0 && y <= mesa.y1 ? Ter.Rock : Ter.Sand;
      s.props.solid[i] = 0;
    }
  const by = (name: string) => s.bots.find((b) => b.name === name)!;
  const at = (b: Bot, x: number, y: number) => ((b.x = x * T + T / 2), (b.y = y * T + T / 2));
  const top = { x: (mesa.x0 + 2.5) * T, y: (mesa.y0 + 2.5) * T };
  const foot = { x: (mesa.x0 - 1.5) * T, y: top.y };
  return { s, lx, ly, mesa, by, at, top, foot };
}
const run = (s: Sim, sec: number) => {
  for (let i = 0; i < Math.round(sec * 30); i++) {
    s.step(1 / 30, NO_INPUT);
    s.events.length = 0;
  }
};
const onRock = (s: Sim, b: Bot) => s.map.ter[s.tileOf(b.x, b.y)] === Ter.Rock;

describe('spider legs: where a robot can stand', () => {
  it('the piece sets Bot.climbs on its role only, through the gear', () => {
    const { by } = yard();
    expect(by('Legs').climbs).toBe(true);
    expect(by('Wheels').climbs).toBeFalsy();
    expect(ITEMS.spiderLegs.bot).toBe('mobility');
  });

  it('a legged robot ordered onto the mesa climbs it; one in wheels stops at the foot', () => {
    const { s, by, at, lx, ly, top, foot } = yard();
    for (const n of ['Legs', 'Wheels']) at(by(n), lx - 2, ly - 1 + (n === 'Legs' ? 0 : 2));
    s.controller.x = s.lift.x;
    s.controller.y = s.lift.y;
    // Both sent on their own to the same point on the mesa (a right click on a mesa, picked robots).
    s.assign(by('Legs').id, 1);
    s.assign(by('Wheels').id, 1);
    s.order(1, top.x, top.y);
    run(s, 25);
    expect(onRock(s, by('Legs'))).toBe(true);
    expect(Math.hypot(by('Legs').x - top.x, by('Legs').y - top.y)).toBeLessThan(2.5 * T);
    expect(onRock(s, by('Wheels'))).toBe(false);
    expect(Math.abs(by('Wheels').x - foot.x)).toBeLessThan(3 * T); // at its foot, not wandering
  });

  it('the A* takes the unit: a route round a wall of rock stays off it for wheels and may cross it for legs', () => {
    const { s, by, at, ly, mesa } = yard();
    for (let y = mesa.y0 - 3; y <= mesa.y1 + 3; y++) for (let x = mesa.x0; x <= mesa.x1; x++) if (y >= ly - 6 && y <= ly + 6) s.map.ter[y * s.W + x] = Ter.Rock;
    const east = (mesa.x1 + 2) * T, y = (ly + 0.5) * T;
    for (const [name, crosses] of [['Legs', true], ['Wheels', false]] as const) {
      const b = by(name);
      at(b, mesa.x0 - 2, ly);
      let rock = 0;
      b.path = [];
      for (let i = 0; i < 30 * 40; i++) {
        s.go(b, east, y, 1 / 30, 8);
        if (onRock(s, b)) rock++;
      }
      expect(rock > 0, `${name} on rock`).toBe(crosses);
    }
  });

  it('never the rim, never a dungeon wall', () => {
    const { s, by } = yard();
    const legs = by('Legs');
    const rim = (CLIMB.rim - 1) * s.W + Math.floor(s.W / 2);
    expect(s.map.ter[rim]).toBe(Ter.Rock);
    expect(s.climbable(rim)).toBe(false);
    expect(s.blocked((Math.floor(s.W / 2) + 0.5) * T, (CLIMB.rim - 0.5) * T, legs)).toBe(true);
    expect(s.blocked(0.5 * T, 0.5 * T, legs)).toBe(true);
    // A mesa tile in the open is open to the legged robot and still shut to the rest.
    const ly = Math.floor(s.lift.y / T), lx = Math.floor(s.lift.x / T);
    const mesaTile = (ly - 2) * s.W + lx + 9;
    expect(s.map.ter[mesaTile]).toBe(Ter.Rock);
    expect(s.blocked((lx + 9.5) * T, (ly - 1.5) * T, legs)).toBe(false);
    expect(s.blocked((lx + 9.5) * T, (ly - 1.5) * T, by('Wheels'))).toBe(true);
    expect(s.blocked((lx + 9.5) * T, (ly - 1.5) * T)).toBe(true);
    // The pure rule: a dungeon's walls are never climbed.
    expect(climbable(s.map.ter, s.W, s.H, mesaTile, true)).toBe(false);
    expect(climbable(s.map.ter, s.W, s.H, mesaTile, false)).toBe(true);
  });

  it('a right click on a mesa sends a legged robot up and snaps the order for a crew without legs', () => {
    const { s, top } = yard();
    s.assign(s.bots.find((b) => b.name === 'Wheels')!.id, 2);
    s.order(2, top.x, top.y);
    const o = s.orders[2]!;
    expect(s.blocked(o.x, o.y)).toBe(false); // snapped to ground
    s.assign(s.bots.find((b) => b.name === 'Legs')!.id, 3);
    s.order(3, top.x, top.y);
    expect(s.orders[3]).toEqual({ x: top.x, y: top.y }); // kept on the mesa
  });
});

describe('spider legs: on the rock', () => {
  it('walks at the Crawlcam rock pace', () => {
    const { s, by, at, ly, mesa } = yard();
    const b = by('Legs');
    const speed = (x: number) => {
      at(b, x, ly);
      const x0 = b.x;
      for (let i = 0; i < 30; i++) {
        s.go(b, b.x + 500, b.y, 1 / 30, 8);
        b.path = [];
      }
      return b.x - x0;
    };
    const sand = speed(mesa.x0 - 6), rock = speed(mesa.x0 + 1);
    expect(rock / sand).toBeCloseTo(SPIDER.stalk.rock, 1);
  });

  it('its shots reach 20% farther on rock and as before off it', () => {
    const { s, by, at, ly, mesa } = yard();
    const b = by('Legs'), w = by('Wheels');
    at(b, mesa.x0 - 3, ly);
    at(w, mesa.x0 - 3, ly);
    const off = reachOf(s, b, WEAPON.marksman.range);
    expect(off).toBe(reachOf(s, w, WEAPON.marksman.range));
    at(b, mesa.x0 + 2, ly);
    at(w, mesa.x0 + 2, ly); // wheels never stand on rock, but even placed there they get nothing
    expect(reachOf(s, b, WEAPON.marksman.range)).toBeCloseTo(off * (1 + CLIMB.high), 5);
    expect(reachOf(s, w, WEAPON.marksman.range)).toBe(off);
  });

  it('a shot fired from the top leaves the mesa (an unlegged shooter would hit rock at once)', () => {
    const { s, by, at, ly, mesa } = yard();
    const b = by('Legs');
    at(b, mesa.x0 + 2, ly);
    s.shoot(b, b.x + 300, b.y, { dmg: 1, speed: 300, range: 400 });
    s.step(1 / 30, NO_INPUT);
    expect(s.shots.length).toBe(1);
    s.shots.length = 0;
    // The same shot from the foot runs into the mesa and dies there.
    const w = by('Wheels');
    at(w, mesa.x0 - 3, ly);
    s.shoot(w, w.x + 600, w.y, { dmg: 1, speed: 300, range: 600 });
    for (let i = 0; i < 40; i++) s.step(1 / 30, NO_INPUT);
    expect(s.shots.length).toBe(0);
  });

  it('a Crawlcam cable leaves it free: no tether, no webbed slow', () => {
    const { s, by } = yard();
    const h = s.spawnHornet(by('Legs').x + 5 * T, by('Legs').y, 0, false, false, 'spider');
    snare(s, by('Legs'), h.id);
    expect(by('Legs').web).toBeUndefined();
    expect(s.engine.flag(by('Legs'), 'noMove')).toBe(false);
    expect(s.walk(by('Legs'))).toBe(1);
    snare(s, by('Wheels'), h.id);
    expect(by('Wheels').web).toBeDefined(); // everyone else is held as before
    s.step(1 / 30, NO_INPUT);
    expect(s.walk(by('Wheels'))).toBeLessThan(1);
  });
});

describe('spider legs: taking them off on a mesa', () => {
  it('the robot steps down to the ground', () => {
    const { s, by, at, ly, mesa } = yard();
    const b = by('Legs');
    at(b, mesa.x0 + 2, ly);
    s.setGear(freshGear());
    expect(b.climbs).toBeFalsy();
    expect(s.blocked(b.x, b.y)).toBe(false);
  });
});

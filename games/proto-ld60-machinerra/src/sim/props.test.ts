import { describe, expect, it } from 'vitest';
import { BIOMES, CAN, CHAIN_MAX, CRASH, MATERIALS, PROPS, RUIN_PIECES, T, WEAR, ZONES, propScrap, type BiomeId, type PropKind } from './defs';
import { crashDmg, flingBot } from './crash';
import { generate, passable } from './mapgen';
import { addProp, hitProp, propState, propTeles, ruinHealth, ruinPay, solidAt, type Prop } from './props';
import { astar } from './path';
import { NO_INPUT, Sim } from './sim';
import { generateReal, tap } from './testkit';

const IDS = Object.keys(BIOMES) as BiomeId[];

/** A land with its props taken away: the test puts its own where it wants them. */
const bare = (seed = 3, biome: BiomeId = 'desert') => {
  const s = new Sim(seed, [], biome);
  s.bots = [s.controller];
  s.props.list.length = 0;
  s.props.solid.fill(0);
  s.props.at.clear();
  return s;
};
const tileAt = (s: Sim, dx: number, dy = 0) => ({ x: Math.floor(s.lift.x / T) + dx, y: Math.floor(s.lift.y / T) + dy });
const put = (s: Sim, kind: PropKind, dx: number, dy = 0, wear = 1): Prop => addProp(s, { kind, ...tileAt(s, dx, dy), wear });
const foe = (s: Sim, x: number, y: number, hp = 400) => {
  const h = s.spawnHornet(x, y, 0, false, false, 'swarmer'); // a hornet resists Impact; a swarmer does not
  h.hp = h.maxHp = hp;
  return h;
};
const run = (s: Sim, secs: number, input = NO_INPUT) => {
  for (let i = 0; i < Math.round(secs * 30); i++) s.step(1 / 30, input);
};
/** The Communicator a long way off, so machines idle where they stand. */
const away = (s: Sim) => {
  s.controller.x += 1500;
  s.controller.y = s.lift.y;
};
/** Run with these foes held where they stand (a Staggered one only drifts), so a zone or a blast finds them. */
const still = (s: Sim, hs: ReturnType<typeof foe>[], secs: number) => {
  for (let i = 0; i < Math.round(secs * 30); i++) {
    for (const h of hs) if (!h.dead) s.engine.apply(h, 'staggered', { duration: 0.6 });
    s.step(1 / 30, NO_INPUT);
  }
};
const kickRight = (s: Sim) => {
  const c = s.controller;
  s.step(1 / 30, { ...NO_INPUT, ax: c.x + 100, ay: c.y, kick: true });
};
const seen = (s: Sim, f: (e: Sim['events'][number]) => boolean) => s.events.some(f);

describe('props: strength, wear, looks', () => {
  it('health is the material by the size; a prop looks whole, cracked, then rubble', () => {
    const s = bare();
    const crate = put(s, 'crate', 4);
    expect(crate.maxHp).toBe(MATERIALS.wood.hp * PROPS.crate.size);
    expect(put(s, 'car', 6).maxHp).toBe(MATERIALS.tin.hp * PROPS.car.size);
    expect(propState(crate)).toBe('whole');
    hitProp(s, crate, crate.maxHp * 0.6);
    expect(propState(crate)).toBe('cracked');
    expect(seen(s, (e) => e.e === 'prop' && e.what === 'crack')).toBe(true);
    expect(hitProp(s, crate, 999)).toBe(true);
    expect(propState(crate)).toBe('rubble');
    expect(crate.broken).toBe(true);
  });

  it('props and ruin pieces spawn worn: a seeded share of their health', () => {
    for (const id of IDS) {
      const s = new Sim(7, [], id);
      expect(s.props.list.length, id).toBeGreaterThan(0);
      for (const p of s.props.list) {
        expect(p.hp, `${id} ${p.kind}`).toBeLessThanOrEqual(p.maxHp);
        const lo = (p.ruin !== undefined ? WEAR.ruin[0] : WEAR.prop[0]) * p.maxHp - 1;
        expect(p.hp).toBeGreaterThanOrEqual(Math.max(1, lo));
      }
      expect(s.props.list.some((p) => p.hp < p.maxHp), id).toBe(true);
    }
  });

  it('the same seed lays the same props, and the land under them is the same', () => {
    const a = generateReal(11, 100, 75, 'desert'), b = generateReal(11, 100, 75, 'desert');
    expect(a.props).toEqual(b.props);
    expect(a.props!.length).toBeGreaterThan(0);
  });
});

describe('props: ruins are made of them', () => {
  it('a ruin has walls round its find with a way in, debris among them; a Parable Trail ruin has none', () => {
    const s = new Sim(5, [], 'desert');
    const withPieces = s.ruins.filter((r) => r.size);
    expect(withPieces.length).toBeGreaterThan(0);
    for (const r of s.ruins) {
      const pieces = s.props.list.filter((p) => p.ruin === r.id);
      if (r.trail !== undefined) expect(pieces).toHaveLength(0);
      else if (r.size) {
        expect(pieces.filter((p) => p.kind === 'wall').length).toBeLessThanOrEqual(RUIN_PIECES.size[r.size].walls);
        expect(pieces.filter((p) => p.kind === 'wall' && p.solid).length).toBeGreaterThan(0);
        // The find is reachable on foot from the lift.
        const goal = s.tileOf(r.x, r.y);
        expect(astar((i) => !s.blocked((i % s.W) * T + T / 2, Math.floor(i / s.W) * T + T / 2), s.W, s.H, s.tileOf(s.lift.x, s.lift.y), goal, 20000).length, r.kind).toBeGreaterThan(0);
      }
    }
  });

  it('nothing is walled off: every ruin, hive, seep and place that the lift reaches without props it reaches with them', () => {
    for (const id of IDS)
      for (const seed of [1, 2, 3]) {
        const m = generate(seed, 100, 75, id);
        const solid = new Set((m.props ?? []).filter((p) => PROPS[p.kind].solid).map((p) => p.y * m.w + p.x));
        const reach = (blocked: Set<number>) => {
          const seenT = new Uint8Array(m.w * m.h);
          const q = [m.lift.y * m.w + m.lift.x];
          seenT[q[0]] = 1;
          while (q.length) {
            const i = q.pop()!;
            const x = i % m.w, y = (i - x) / m.w;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = x + dx, ny = y + dy, j = ny * m.w + nx;
              if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || seenT[j] || !passable(m.ter[j]) || blocked.has(j)) continue;
              seenT[j] = 1;
              q.push(j);
            }
          }
          return seenT;
        };
        const base = reach(new Set()), cur = reach(solid);
        for (const t of [...m.seeps, ...m.nests, ...m.ruins]) if (base[t.y * m.w + t.x]) expect(cur[t.y * m.w + t.x], `${id} ${seed} (${t.x}, ${t.y})`).toBe(1);
      }
  });

  it('a find pays by its ruin\'s size and health when searched: a battered ruin pays less, a bigger one more', () => {
    const copper = (hit: number, size: 'small' | 'large') => {
      const s = bare(3);
      const r = s.ruins.find((x) => !x.live && x.trail === undefined)!;
      r.size = size;
      const pieces = [0, 1, 2].map((i) => addProp(s, { kind: 'wall', x: Math.floor(r.x / T) + 2 + i, y: Math.floor(r.y / T) + 2, wear: 1, material: 'concrete' }, r.id));
      for (const p of pieces) hitProp(s, p, p.maxHp * hit * 0.99);
      expect(ruinHealth(s, r)).toBeCloseTo(1 - hit * 0.99, 1);
      s.controller.x = r.x;
      s.controller.y = r.y + 20;
      tap(s);
      run(s, 2);
      expect(r.searched).toBe(true);
      return s.loot.filter((l) => l.kind === 'copper').reduce((n, l) => n + l.amt, 0) + (s.copper ?? 0);
    };
    const whole = copper(0, 'small'), battered = copper(0.8, 'small'), large = copper(0, 'large');
    expect(battered).toBeLessThan(whole);
    expect(large).toBeGreaterThan(whole);
  });

  it('a dead ruin knocked flat gives what is left of its find at once, counts ruinsBroken, and cannot be searched twice', () => {
    const s = bare(3);
    const r = s.ruins.find((x) => !x.live && x.trail === undefined)!;
    r.size = 'medium';
    const tx = Math.floor(r.x / T), ty = Math.floor(r.y / T);
    addProp(s, { kind: 'wall', x: tx + 2, y: ty, wear: 1, material: 'tin' }, r.id);
    addProp(s, { kind: 'debris', x: tx - 2, y: ty, wear: 1, material: 'tin' }, r.id);
    expect(ruinPay(s, r)).toBeCloseTo(RUIN_PIECES.size.medium.pay, 5);
    s.flatten(r);
    expect(r.broken).toBe(true);
    expect(r.searched).toBe(true);
    expect(s.stats.ruinsBroken).toBe(1);
    expect(s.ruinsFound.dead).toBe(0); // knocked flat is not searched
    const copper = s.loot.filter((l) => l.kind === 'copper').reduce((n, l) => n + l.amt, 0);
    expect(copper).toBeGreaterThan(0);
    expect(ruinPay(s, r)).toBeCloseTo(RUIN_PIECES.size.medium.pay * RUIN_PIECES.floor, 5);
    s.controller.x = r.x;
    s.controller.y = r.y + 20;
    tap(s);
    expect(s.action).toBeNull();
  });
});

describe('props: solid, shots, kicks, blasts', () => {
  it('a solid prop blocks walking, shots and the path, and breaking it frees the tile', () => {
    const s = bare();
    const wall = put(s, 'wall', 5, 0, 1);
    const x = (wall.tx + 0.5) * T, y = (wall.ty + 0.5) * T;
    expect(s.blocked(x, y)).toBe(true);
    expect(solidAt(s, x, y)).toBe(wall);
    const walk = (i: number) => !s.blocked((i % s.W) * T + T / 2, Math.floor(i / s.W) * T + T / 2);
    expect(walk(wall.ty * s.W + wall.tx)).toBe(false);
    // A shot stops in it and hurts it.
    const c = s.controller;
    c.x = x - 120;
    c.y = y;
    s.shoot(c, x + 100, y, { dmg: 5, speed: 600, range: 400 });
    run(s, 0.5);
    expect(wall.hp).toBe(wall.maxHp - 5);
    expect(s.shots.filter((q) => !q.dead)).toHaveLength(0);
    hitProp(s, wall, 999);
    expect(s.blocked(x, y)).toBe(false);
    expect(solidAt(s, x, y)).toBeNull();
    expect(walk(wall.ty * s.W + wall.tx)).toBe(true);
  });

  it('a bot paths through the gap a broken wall leaves', () => {
    const s = bare();
    const goal = tileAt(s, 6);
    // A closed ring of walls round the goal.
    const ring = [];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === 2) ring.push(put(s, 'wall', 6 + dx, dy));
    const walk = (i: number) => !s.blocked((i % s.W) * T + T / 2, Math.floor(i / s.W) * T + T / 2);
    const from = s.tileOf(s.lift.x, s.lift.y), to = goal.y * s.W + goal.x;
    expect(astar(walk, s.W, s.H, from, to)).toHaveLength(0);
    hitProp(s, ring.find((p) => p.tx === goal.x - 2 && p.ty === goal.y)!, 999);
    expect(astar(walk, s.W, s.H, from, to).length).toBeGreaterThan(0);
    // And he walks it: the Communicator's go() finds the way.
    s.controller.x = s.lift.x;
    s.controller.y = s.lift.y;
    for (let i = 0; i < 900 && !s.go(s.controller, (goal.x + 0.5) * T, (goal.y + 0.5) * T, 1 / 30, 10); i++);
    expect(Math.hypot(s.controller.x - (goal.x + 0.5) * T, s.controller.y - (goal.y + 0.5) * T)).toBeLessThan(40);
  });

  it('a swing hurts the prop in its arc; a barrel in the open is hit by shots', () => {
    const s = bare();
    const c = s.controller;
    const crate = put(s, 'crate', 1);
    c.x = crate.x - 24;
    c.y = crate.y;
    s.step(1 / 30, { ...NO_INPUT, ax: crate.x + 50, ay: crate.y, fire: true });
    expect(crate.hp).toBeLessThan(crate.maxHp);
    const barrel = put(s, 'barrel', 8);
    c.x = barrel.x - 150;
    c.y = barrel.y;
    s.shoot(c, barrel.x, barrel.y, { dmg: 5, speed: 600, range: 400 });
    run(s, 0.6);
    expect(barrel.hp).toBe(barrel.maxHp - 5);
  });

  it('a D-city blast reaches the props in it', () => {
    const s = bare();
    const crate = put(s, 'crate', 3), far = put(s, 'crate', 12);
    s.callSupport('barrage', crate.x, crate.y);
    run(s, 8);
    expect(crate.hp).toBeLessThan(crate.maxHp);
    expect(far.hp).toBe(far.maxHp);
  });
});

describe('crashes', () => {
  it('a kicked foe that hits a wall while still fast takes crash damage by its speed, is Staggered, fires the crash trigger and is counted', () => {
    const s = bare();
    const c = s.controller;
    const wall = put(s, 'wall', 3);
    wall.hp = wall.maxHp = 9999;
    const h = foe(s, c.x + 30, c.y);
    s.engine.addSource(c, { id: 'probe', effects: [{ when: 'crash', cd: 0, do: { do: 'status', id: 'haste', to: 'self' } }] });
    kickRight(s);
    expect(h.fling).toBeDefined();
    const hp0 = h.hp;
    for (let i = 0; i < 40 && s.stats.crashes === 0; i++) s.step(1 / 30, NO_INPUT);
    expect(s.stats.crashes).toBe(1);
    const dmg = hp0 - h.hp;
    expect(dmg).toBeGreaterThan(crashDmg(CRASH.min) - 0.01);
    expect(dmg).toBeLessThan(crashDmg(800));
    expect(s.engine.stacks(h, 'staggered')).toBe(1);
    expect(s.engine.stacks(c, 'haste')).toBe(1); // the `crash` trigger fired
    expect(wall.hp).toBeLessThan(9999); // both take the crash
    // Slow, it does not crash: shoved at half the minimum, it bumps the wall and nothing more.
    const slow = foe(s, c.x + 100, c.y);
    slow.vx = CRASH.min * 0.5;
    slow.fling = { by: c.id, kick: true, hit: [], until: s.time + 5 };
    const n = s.stats.crashes;
    run(s, 0.3);
    expect(s.stats.crashes).toBe(n);
  });

  it('rock does not break and a crash into it counts; a solid prop breaks and the foe flies on slower', () => {
    const s = bare();
    const c = s.controller;
    const crate = put(s, 'crate', 3);
    crate.hp = 1;
    const h = foe(s, c.x + 30, c.y);
    kickRight(s);
    run(s, 0.6);
    expect(crate.broken).toBe(true);
    expect(s.blocked(crate.x, crate.y)).toBe(false);
    expect(s.stats.crashes).toBeGreaterThanOrEqual(1);
    expect(h.dead).toBe(false);
  });

  it('a foe that crashes into another: both take the crash, the second flies on and a row goes down like pins', () => {
    const s = bare();
    const c = s.controller;
    const a = foe(s, c.x + 30, c.y), b = foe(s, c.x + 62, c.y), d = foe(s, c.x + 94, c.y);
    const hp = [a.hp, b.hp, d.hp];
    kickRight(s);
    run(s, 0.8);
    expect(a.hp).toBeLessThan(hp[0]);
    expect(b.hp).toBeLessThan(hp[1]);
    expect(s.stats.crashes).toBeGreaterThanOrEqual(2);
    expect(b.fling !== undefined || b.hp < hp[1]).toBe(true);
  });

  it('a kicked robot takes no damage, deals crash damage to the foes it hits and counts for its type', () => {
    const s = bare();
    const c = s.controller;
    const guard = s.addBot('guard', 'Pin', c.x + 30, c.y, 0);
    s.bots = [c, guard];
    s.crew.length = 0;
    s.crew.push(guard);
    const h = foe(s, c.x + 150, c.y);
    const hp0 = guard.hp, hh = h.hp;
    kickRight(s);
    expect(guard.fling).toBeDefined();
    expect(guard.x).toBeGreaterThan(c.x);
    run(s, 0.8);
    expect(guard.hp).toBe(hp0);
    expect(h.hp).toBeLessThan(hh);
    expect(s.stats['deed.guard.kickCrash']).toBe(1);
    expect(s.stats.crashes).toBeGreaterThanOrEqual(1);
    // A robot kicked into rock is hurt by nothing; it just stops.
    s.hornets.length = 0;
    flingBot(s, guard, -900, 0, c);
    run(s, 1);
    expect(guard.hp).toBe(hp0);
  });

  it('kill credit is for crashes: a crash kill is a kick kill and a crash kill; the kick own kill, or a shovel finish after one, is neither', () => {
    const s = bare();
    const c = s.controller;
    const wall = put(s, 'wall', 3);
    wall.hp = wall.maxHp = 9999;
    const h = foe(s, c.x + 30, c.y, 5); // dies to the crash
    kickRight(s);
    run(s, 0.6);
    expect(h.dead).toBe(true);
    expect(s.stats.crashKills).toBe(1);
    expect(s.stats.kickKills).toBe(1);
    // A kick that leaves it standing, then the shovel: no credit.
    const t = bare(4);
    const d = t.controller;
    const x = foe(t, d.x + 30, d.y, 30);
    t.step(1 / 30, { ...NO_INPUT, ax: d.x + 100, ay: d.y, kick: true });
    x.hp = 3;
    for (let i = 0; i < 40 && !x.dead; i++) t.step(1 / 30, { ...NO_INPUT, ax: x.x, ay: x.y, fire: true });
    expect(x.dead).toBe(true);
    expect(t.stats.kickKills).toBe(0);
    expect(t.stats.crashKills).toBe(0);
    // The kick itself does no damage (Minos): a foe at 1 hp it launches into nothing lives, and counts nothing.
    const u = bare(5);
    const f = foe(u, u.controller.x + 30, u.controller.y, 30);
    f.hp = 1;
    kickRight(u);
    expect(f.dead).toBe(false);
    expect(u.stats.kickKills).toBe(0);
    expect(u.stats.crashKills).toBe(0);
  });

  it('a Heavy foe ignores a kick until it is Staggered', () => {
    const s = bare();
    const c = s.controller;
    const h = foe(s, c.x + 30, c.y);
    s.engine.apply(h, 'steady');
    kickRight(s);
    expect(h.fling).toBeUndefined();
    const t = bare();
    const g = foe(t, t.controller.x + 30, t.controller.y);
    t.engine.apply(g, 'steady');
    t.engine.apply(g, 'staggered');
    kickRight(t);
    expect(g.fling).toBeDefined();
  });
});

describe('effect props', () => {
  it('scrap from what is smashed, none from a wall', () => {
    const s = bare();
    const crate = put(s, 'crate', 3), wall = put(s, 'wall', 6), car = put(s, 'car', 9);
    const before = s.loot.length;
    for (const p of [crate, wall, car]) hitProp(s, p, 999);
    const amts = s.loot.slice(before).filter((l) => l.kind === 'scrap').map((l) => l.amt).sort((a, b) => a - b);
    expect(amts).toEqual([propScrap('wood', PROPS.crate.size), propScrap('tin', PROPS.car.size)]);
    expect(propScrap('concrete', 1)).toBeGreaterThan(0); // concrete props give scrap; a wall of it does not
  });

  it('a barrel goes down, ticks (the bots keep off), bursts into a fire patch, and sets off the next barrel in a chain; the chain is capped', () => {
    const s = bare();
    const [a, b, c2] = [put(s, 'barrel', 3), put(s, 'barrel', 4), put(s, 'barrel', 5)];
    a.hp = 1; // only the first is worn: the burst breaks the rest at full health
    hitProp(s, a, 5);
    expect(a.primed).toBeGreaterThan(0);
    expect(a.solid).toBe(false);
    expect(propTeles(s).some((t) => t.id === `prop${a.id}` && t.kind === 'patch')).toBe(true);
    expect(seen(s, (e) => e.e === 'prop' && e.what === 'tell')).toBe(true);
    run(s, 0.6);
    expect(a.broken).toBe(true);
    expect(s.props.zones.some((z) => z.kind === 'fire')).toBe(true);
    expect(b.primed !== undefined || b.broken).toBe(true); // the next is ticking
    run(s, 2);
    expect(b.broken && c2.broken).toBe(true);
    // A line longer than the cap does not all go off.
    const t = bare();
    const line = Array.from({ length: CHAIN_MAX + 4 }, (_, i) => put(t, 'barrel', 3 + i * 2));
    line[0].hp = 1;
    hitProp(t, line[0], 5);
    run(t, 12);
    expect(line.filter((p) => p.broken).length).toBeLessThan(line.length);
    expect(line.filter((p) => p.broken).length).toBeGreaterThanOrEqual(CHAIN_MAX);
  });

  it('a burst burns foes and robots alike', () => {
    const s = bare();
    const barrel = put(s, 'barrel', 4);
    const h = foe(s, barrel.x + 10, barrel.y);
    const c = s.controller;
    c.x = barrel.x - 20;
    c.y = barrel.y;
    const hpC = c.hp, hpH = h.hp;
    hitProp(s, barrel, 999);
    still(s, [h], 1.5);
    expect(h.hp).toBeLessThan(hpH);
    expect(c.hp).toBeLessThan(hpC);
    expect(s.engine.stacks(h, 'burning')).toBeGreaterThan(0);
  });

  it('a water tower floods a puddle (Wet) that puts a fire out, and a transformer shocks the Wet foes standing in it harder', () => {
    const s = bare();
    const tower = put(s, 'tower', 4), trans = put(s, 'transformer', 8);
    away(s);
    const wetA = foe(s, tower.x + 80, tower.y), wetB = foe(s, tower.x + 80, tower.y + 14), dry = foe(s, tower.x + 170, tower.y);
    hitProp(s, tower, 999);
    expect(s.props.zones.some((z) => z.kind === 'puddle')).toBe(true);
    still(s, [wetA, wetB, dry], 1);
    expect(s.engine.stacks(wetA, 'wet')).toBeGreaterThan(0);
    expect(s.engine.stacks(dry, 'wet')).toBe(0);
    // Fire does not start in water.
    const barrel = put(s, 'barrel', 4, 1);
    barrel.x = tower.x;
    barrel.y = tower.y + 30;
    hitProp(s, barrel, 999);
    still(s, [wetA, wetB, dry], 1);
    expect(s.props.zones.some((z) => z.kind === 'fire')).toBe(false);
    // The transformer beside the puddle, broken: its shock reaches the Wet foes and the dry one, and takes the Wet ones harder.
    trans.x = tower.x + 120;
    trans.y = tower.y;
    hitProp(s, trans, 999);
    expect(s.props.zones.some((q) => q.kind === 'shock')).toBe(true);
    const hp = { wet: wetA.hp + wetB.hp, dry: dry.hp };
    still(s, [wetA, wetB, dry], ZONES.shock.every + 0.3);
    const lostWet = (hp.wet - (wetA.hp + wetB.hp)) / 2, lostDry = hp.dry - dry.hp;
    expect(lostDry).toBeGreaterThan(0);
    expect(lostWet).toBeGreaterThan(lostDry);
  });

  it('a pressure tank vents steam for its tell, then bursts with a big shove', () => {
    const s = bare();
    const tank = put(s, 'tank', 4);
    away(s);
    const h = foe(s, tank.x + 30, tank.y);
    hitProp(s, tank, 999);
    expect(tank.primed).toBeCloseTo(PROPS.tank.fx!.tell!, 5);
    expect(s.props.zones.some((z) => z.kind === 'steam')).toBe(true);
    still(s, [h], 1);
    expect(s.engine.stacks(h, 'scalded')).toBeGreaterThan(0);
    const x0 = h.x;
    still(s, [h], 0.8);
    expect(tank.broken).toBe(true);
    expect(h.x).toBeGreaterThan(x0);
  });

  it('a car\'s alarm goes at the first hit and calls the foes in reach', () => {
    const s = bare();
    const car = put(s, 'car', 4);
    const h = foe(s, car.x + 200, car.y + 100);
    h.target = 0;
    s.bots = [];
    hitProp(s, car, 1);
    expect(s.props.zones.some((z) => z.kind === 'alarm')).toBe(true);
    run(s, 1.2);
    expect(h.hear).toBeDefined();
    expect(h.hear!.x).toBe(car.x);
  });

  it('a kicked propane tank takes off along the kick and bursts; a barrel rolls and bursts on a foe', () => {
    const s = bare();
    const c = s.controller;
    const tank = put(s, 'propane', 1);
    tank.x = c.x + 30;
    tank.y = c.y;
    const far = foe(s, c.x + 330, c.y);
    kickRight(s);
    expect(tank.fling).toBeDefined();
    expect(tank.rocket).toBeGreaterThan(0);
    still(s, [far], 1.5);
    expect(tank.broken).toBe(true);
    expect(tank.x).toBeGreaterThan(c.x + 100);
    expect(far.hp).toBeLessThan(far.maxHp);
    const t = bare();
    const d = t.controller;
    const barrel = put(t, 'barrel', 1);
    barrel.x = d.x + 30;
    barrel.y = d.y;
    const pin = foe(t, d.x + 120, d.y);
    kickRight(t);
    still(t, [pin], 1.5);
    expect(barrel.broken).toBe(true);
    expect(pin.hp).toBeLessThan(pin.maxHp);
  });

  it('a kicked barrel that meets another barrel sets it off', () => {
    const s = bare();
    const c = s.controller;
    const a = put(s, 'barrel', 1), b = put(s, 'barrel', 3);
    a.x = c.x + 30;
    a.y = c.y;
    b.x = c.x + 100;
    b.y = c.y;
    away(s);
    c.x = a.x - 30;
    c.y = a.y;
    kickRight(s);
    run(s, 1.5);
    expect(a.broken).toBe(true);
    expect(b.broken || b.primed !== undefined).toBe(true);
  });

  it('a vending machine drops drinks that give the Communicator Haste (and only him)', () => {
    const s = bare();
    const c = s.controller;
    const m = put(s, 'vending', 3);
    hitProp(s, m, 999);
    expect(s.props.cans.length).toBe(PROPS.vending.fx!.cans);
    c.x = s.props.cans[0].x;
    c.y = s.props.cans[0].y;
    run(s, 0.2);
    expect(s.engine.stacks(c, 'haste')).toBe(1);
    expect(s.props.cans.length).toBe(PROPS.vending.fx!.cans! - 1);
    expect(CAN.haste).toBeGreaterThan(0);
  });
});

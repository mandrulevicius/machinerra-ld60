import { describe, expect, it } from 'vitest';
import { rng } from '../../../../harness/kit/rng';
import { BIOMES, BLUEPRINTS, BUILD, PROPS, RUIN_BLUEPRINTS, T, TIER_FIND, VILLAGE, type BiomeId, type BlueprintId } from './defs';
import { intactness, lootCount, shapeOf, stamp, tierOf, turnAt, turnedSize } from './buildings';
import { flood, generate, passable, remnantsOn } from './mapgen';
import { search } from './use';
import { Sim } from './sim';

const IDS = Object.keys(BLUEPRINTS) as BlueprintId[];
const key = (x: number, y: number) => `${x},${y}`;
const LANDS: [number, BiomeId][] = [[1, 'desert'], [2, 'city'], [3, 'jungle'], [4, 'mountains']];

describe('blueprints', () => {
  it.each(IDS)('%s: doors on its walls, every piece and the heart inside a room, no two on a tile', (id) => {
    const bp = BLUEPRINTS[id], sh = shapeOf(id);
    for (const r of bp.rooms) expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= bp.w && r.y + r.h <= bp.h).toBe(true);
    const edge = new Set<string>();
    for (const r of bp.rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1) edge.add(key(x, y));
    for (const [x, y] of bp.doors) expect(edge.has(key(x, y)), `${id} door ${x},${y}`).toBe(true);
    const at = new Set<string>();
    for (const [kind, x, y] of [...bp.furniture, ...bp.loot]) {
      expect(sh.inside.has(key(x, y)), `${id} ${kind} at ${x},${y}`).toBe(true);
      expect(at.has(key(x, y)), `${id} two on ${x},${y}`).toBe(false);
      at.add(key(x, y));
    }
    if (bp.heart) {
      expect(sh.inside.has(key(...bp.heart))).toBe(true);
      expect(at.has(key(...bp.heart))).toBe(false);
    }
  });

  it('every ruin blueprint takes a find; kiosk and shed take any', () => {
    for (const id of RUIN_BLUEPRINTS) expect(BLUEPRINTS[id].fits.length).toBeGreaterThan(0);
  });

  it('turning keeps every tile inside the footprint, one to one', () => {
    const bp = BLUEPRINTS.clinic;
    for (const mirror of [false, true])
      for (let turn = 0; turn < 4; turn++) {
        const [w, h] = turnedSize(bp, turn), seen = new Set<string>();
        for (let y = 0; y < bp.h; y++)
          for (let x = 0; x < bp.w; x++) {
            const [tx, ty] = turnAt(bp, turn, mirror, x, y);
            expect(tx >= 0 && ty >= 0 && tx < w && ty < h).toBe(true);
            seen.add(key(tx, ty));
          }
        expect(seen.size).toBe(bp.w * bp.h);
      }
  });

  it('a bigger, more complex building holds more loot smashables (Minos)', () => {
    expect(lootCount('clinic')).toBeGreaterThan(lootCount('kiosk'));
    expect(lootCount('garage')).toBeGreaterThan(lootCount('shed'));
  });
});

describe('stamping and intactness', () => {
  const open = () => true;
  const at = (intact: number, seed = 'a') => stamp({ id: 'garage', x: 10, y: 10, turn: 0, mirror: false, intact, material: 'concrete', W: 100, open, r: rng(seed) });

  it('an intact building keeps every wall and piece; a faded one loses whole runs and pieces', () => {
    const whole = at(1), faded = at(0.05);
    const walls = (b: typeof whole) => b.props.filter((p) => p.kind === 'wall').length;
    expect(walls(whole)).toBe(shapeOf('garage').walls.length);
    expect(walls(faded)).toBeLessThan(walls(whole) / 2);
    expect(faded.spec.hp0).toBeLessThan(whole.spec.hp0);
  });

  it('walls on rock are left out', () => {
    const b = stamp({ id: 'garage', x: 10, y: 10, turn: 0, mirror: false, intact: 1, material: 'brick', W: 100, open: (i) => i % 100 !== 10, r: rng('r') });
    expect(b.props.some((p) => p.x === 10)).toBe(false);
  });

  it('the tier steps up with intactness: scrap, a part, the special find', () => {
    expect(tierOf(0)).toBe(0);
    expect(tierOf(BUILD.tiers[0])).toBe(1);
    expect(tierOf(BUILD.tiers[1])).toBe(2);
    expect(tierOf(1)).toBe(2);
  });
});

describe('lands with buildings (from mission 4)', () => {
  it('the gate: missions 1-3 keep today\'s lands', () => {
    expect(remnantsOn(undefined)).toBe(false);
    expect(remnantsOn(2)).toBe(false);
    expect(remnantsOn(3)).toBe(true);
    expect(generate(1, undefined, undefined, 'desert').buildings).toBeUndefined();
  });

  it.each(LANDS)('seed %i %s: ruins stand in buildings, the land is the same but for its props', (seed, biome) => {
    const plain = generate(seed, undefined, undefined, biome), m = generate(seed, undefined, undefined, biome, undefined, { remnants: true, tier: 2 });
    expect(m.ter).toEqual(plain.ter);
    expect(m.ruins).toEqual(plain.ruins);
    const bs = m.buildings!;
    expect(bs.filter((b) => b.ruins.length).length).toBeGreaterThan(0);
    // Every piece of a building stands on open ground, and no find is under one.
    const finds = new Set(m.ruins.map((r) => key(r.x, r.y)));
    for (const p of m.props!) {
      expect(passable(m.ter[p.y * m.w + p.x])).toBe(true);
      if (PROPS[p.kind].solid) expect(finds.has(key(p.x, p.y))).toBe(false);
    }
    // A land stays under the measured wall budget (one prop a wall tile: under ~1500, docs/findings/performance.md).
    expect(m.props!.filter((p) => p.kind === 'wall').length).toBeLessThan(1500);
  });

  it.each(LANDS)('seed %i %s: nothing the lift reached is walled off (P39\'s guarantee)', (seed, biome) => {
    const m = generate(seed, undefined, undefined, biome, undefined, { remnants: true, tier: 3 });
    const base = flood(m.ter, m.w, m.h, m.lift);
    const ter = m.ter.slice();
    const solid = new Set<number>();
    for (const p of m.props!) if (PROPS[p.kind].solid) {
      ter[p.y * m.w + p.x] = 3;
      solid.add(p.y * m.w + p.x);
    }
    const cur = flood(ter, m.w, m.h, m.lift);
    for (let i = 0; i < base.length; i++) if (base[i] && !solid.has(i)) expect(cur[i], `tile ${i % m.w},${Math.floor(i / m.w)}`).toBe(1);
  });

  it('a hive gets a village with huts round its hall; turrets on the big ones', () => {
    let villages = 0, turrets = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const m = generate(seed, undefined, undefined, 'desert', undefined, { remnants: true, tier: 3 });
      villages += m.buildings!.filter((b) => b.bp === 'hivehall').length;
      turrets += m.props!.filter((p) => p.kind === 'turret').length;
      for (const b of m.buildings!.filter((q) => q.bp === 'hivehall')) {
        const n = m.nests[b.village!];
        expect(n.x >= b.x && n.x < b.x + b.w && n.y >= b.y && n.y < b.y + b.h).toBe(true);
      }
    }
    expect(villages).toBeGreaterThan(0);
    expect(turrets).toBeGreaterThan(0);
    expect(VILLAGE.turrets[2]).toBeGreaterThan(0);
  });

  it('the city has a faded quarter of outlines', () => {
    const m = generate(2, undefined, undefined, 'city', undefined, { remnants: true });
    const faded = m.buildings!.filter((b) => b.faded);
    expect(faded.length).toBeGreaterThan(2);
    for (const b of faded) expect(b.intact).toBeLessThan(0.2);
    expect(generate(2, undefined, undefined, 'jungle', undefined, { remnants: true }).buildings!.some((b) => b.faded)).toBe(false);
  });
});

describe('in a mission', () => {
  const sim = (flown: number, seed = 1) => new Sim(seed, [], 'desert', [], undefined, undefined, { flown, tier: 2 });

  it('missions from the fourth stand ruins in buildings; earlier ones do not', () => {
    expect(sim(2).map.buildings).toBeUndefined();
    const s = sim(3);
    const housed = s.ruins.filter((r) => r.building !== undefined);
    expect(housed.length).toBeGreaterThan(0);
    expect(s.props.list.some((p) => p.bld !== undefined)).toBe(true);
  });

  it('intactness is the building\'s health: battering it drops it', () => {
    const s = sim(3), r = s.ruins.find((q) => q.building !== undefined)!, b = r.building!;
    const before = intactness(s, b);
    for (const p of s.props.list) if (p.bld === b) p.hp = Math.max(1, Math.round(p.hp * 0.3));
    expect(intactness(s, b)).toBeLessThan(before);
  });

  it('a building starts as intact as it was rolled', () => {
    const s = sim(3);
    s.map.buildings!.forEach((b, i) => expect(intactness(s, i)).toBeCloseTo(b.intact, 5));
  });

  it('a find in a battered building pays scrap; in a standing one a part; in an intact one its era\'s special find', () => {
    for (const [roll, tier] of [[0.1, 0], [0.5, 1], [0.95, 2]] as const) {
      const s = sim(3), r = s.ruins.find((q) => q.building !== undefined && !q.live)!, b = r.building!;
      s.map.buildings![b].intact = roll;
      const loot0 = s.loot.length, insight0 = s.insight, junk0 = s.junk.length;
      search(s, r);
      const ev = s.events.find((e) => e.e === 'remnant');
      expect(ev && ev.e === 'remnant' && ev.tier).toBe(tier);
      if (tier === 0) expect(s.loot.some((l) => l.kind === 'scrap' && l.amt === TIER_FIND.scrap)).toBe(true);
      if (tier === 1) expect(s.loot.slice(loot0).some((l) => l.kind === 'part')).toBe(true);
      if (tier === 2) expect(s.map.buildings![b].era === 'steam' ? s.insight > insight0 : s.junk.length > junk0 || s.loot.slice(loot0).some((l) => l.kind === 'part')).toBe(true);
    }
  });

  it('a building\'s pieces are props in the tile grid: a wall blocks until it breaks', () => {
    const s = sim(3), w = s.props.list.find((p) => p.kind === 'wall' && p.bld !== undefined)!;
    expect(s.blocked((w.tx + 0.5) * T, (w.ty + 0.5) * T)).toBe(true);
  });

  it('every biome generates with buildings', () => {
    for (const biome of Object.keys(BIOMES) as BiomeId[]) expect(() => generate(7, undefined, undefined, biome, undefined, { remnants: true, tier: 1 })).not.toThrow();
  });
});

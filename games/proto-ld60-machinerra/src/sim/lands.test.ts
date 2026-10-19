import { describe, expect, it } from 'vitest';
import { LANDS, LAND_IDS, buildLand, landProblems, loadLand, parseLand, type LandFile } from './lands';
import { Ter } from './mapgen';

const ter = (m: ReturnType<typeof loadLand>, x: number, y: number) => m.ter[y * m.w + x];

describe('land files', () => {
  it('every land file loads and is sound: spots on open ground, all reachable from the lift', () => {
    expect(LAND_IDS().length).toBeGreaterThan(0);
    for (const id of LAND_IDS()) expect(landProblems(loadLand(id)), id).toEqual([]);
  });

  it('the test land reads as written: spots on the tiles their px name, shapes where the file puts them', () => {
    const m = loadLand('testland');
    expect(m).toMatchObject({ w: 40, h: 26, biome: 'desert', seed: 'testland', lift: { x: 4, y: 13 } });
    expect(m.seeps.map((s) => [s.x, s.y])).toEqual([[10, 12], [22, 8]]);
    expect(m.nests).toEqual([{ x: 30, y: 5 }]);
    expect(m.ruins[0]).toMatchObject({ x: 12, y: 5, kind: 'car' });
    expect(ter(m, 18, 20)).toBe(Ter.Rock); // the rock blob's centre (600, 640 px)
    expect(ter(m, 17, 13)).toBe(Ter.Hardpan); // the road's middle
    for (let i = 0; i < m.w; i++) expect(ter(m, i, 0)).toBe(Ter.Rock); // the rim
    expect(ter(m, 3, 3)).toBe(Ter.Sand);
  });

  it('stamps a place: its parts stand turned about its centre, its own ground goes down, its ruins join the land\'s', () => {
    const m = loadLand('testland');
    expect(m.places).toHaveLength(1);
    const p = m.places[0];
    expect(p).toMatchObject({ id: 'graveyard', x: 30, y: 17 });
    expect(p.parts.length).toBeGreaterThan(8);
    expect(p.parts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) < 6)).toBe(true);
    // Its own ground: the land without it differs under its parts.
    const def = { ...LANDS.testland, places: [] };
    const without = buildLand(def);
    const differs = Array.from(m.ter).filter((t, i) => t !== without.ter[i]).length;
    expect(differs).toBeGreaterThan(20);
  });

  it('a land is the same map every time (no random stream)', () => {
    expect(Array.from(loadLand('testland').ter)).toEqual(Array.from(loadLand('testland').ter));
  });
});

describe('parseLand', () => {
  const ok: LandFile = { name: 'L', biome: 'desert', size: [20, 14], entities: [{ id: 'lift', type: 'lift', x: 96, y: 96 }] };
  it('says what is wrong, naming the land and the entity', () => {
    expect(() => parseLand('x', { ...ok, name: undefined })).toThrow(/land x.*name/);
    expect(() => parseLand('x', { ...ok, biome: 'moon' })).toThrow(/biome/);
    expect(() => parseLand('x', { ...ok, size: [4, 4] })).toThrow(/size/);
    expect(() => parseLand('x', { ...ok, ground: 'lava' })).toThrow(/ground/);
    expect(() => parseLand('x', { ...ok, entities: [] })).toThrow(/exactly one lift/);
    expect(() => parseLand('x', { ...ok, entities: [...ok.entities!, { id: 'l2', type: 'lift', x: 160, y: 96 }] })).toThrow(/exactly one lift/);
    expect(() => parseLand('x', { ...ok, entities: [...ok.entities!, { id: 'z', type: 'dragon', x: 0, y: 0 }] })).toThrow(/z.*dragon/);
    expect(() => parseLand('x', { ...ok, entities: [...ok.entities!, { id: 'r', type: 'ruin', x: 160, y: 96 }] })).toThrow(/r.*props\.ruin/);
    expect(() => parseLand('x', { ...ok, entities: [...ok.entities!, { id: 'p', type: 'place', x: 160, y: 96, props: { place: 'nowhere' } }] })).toThrow(/p.*props\.place/);
    expect(() => parseLand('x', { ...ok, entities: [...ok.entities!, { id: 'h', type: 'hive', x: 0, y: 96 }] })).toThrow(/h.*rim/);
    expect(() => parseLand('x', { ...ok, entities: [...ok.entities!, ...ok.entities!] })).toThrow(/appears twice/);
  });
});

describe('landProblems', () => {
  const base: LandFile = { name: 'L', biome: 'desert', size: [20, 14], entities: [{ id: 'lift', type: 'lift', x: 96, y: 96 }] };
  const problems = (more: LandFile['entities']) => landProblems(buildLand(parseLand('x', { ...base, entities: [...base.entities!, ...more!] })));
  it('is empty for open ground', () => expect(problems([{ id: 'h', type: 'hive', x: 400, y: 300 }])).toEqual([]));
  it('names a spot on rock', () => {
    const rock = { id: 'rk', type: 'blob', x: 400, y: 300, props: { ground: 'rock', rx: 64, ry: 64, rough: 0 } };
    expect(problems([rock, { id: 'h', type: 'hive', x: 400, y: 300 }])).toEqual(['hive 1 (12,9) is on rock']);
  });
  it('names a spot the lift cannot walk to', () => {
    const wall = { id: 'w', type: 'band', x: 320, y: 224, rotation: 90, props: { ground: 'rock', length: 448, width: 64, rough: 0 } };
    expect(problems([wall, { id: 'r', type: 'ruin', x: 500, y: 300, props: { ruin: 'car' } }])).toEqual(['ruin 1 (car) (15,9) cannot be walked to from the lift']);
  });
  it('names a lift on rock', () => {
    const rock = { id: 'rk', type: 'blob', x: 96, y: 96, props: { ground: 'rock', rx: 64, ry: 64, rough: 0 } };
    expect(problems([rock])).toEqual(['the lift (3,3) is on rock']);
  });
});

describe('the registry', () => {
  it('holds the test land', () => expect(Object.keys(LANDS)).toContain('testland'));
});

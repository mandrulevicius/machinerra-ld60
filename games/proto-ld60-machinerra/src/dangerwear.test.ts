import { describe, expect, it } from 'vitest';
import { dangerSites } from './dangerwear';
import { RUIN_FINDS, T } from './sim/defs';
import { generate, type MapData, type RuinKind } from './sim/mapgen';

const stub = (o: Partial<MapData>): MapData => ({ w: 40, h: 30, seed: 1, biome: 'desert', ter: new Uint8Array(40 * 30), lift: { x: 3, y: 26 }, seeps: [], nests: [], ruins: [], places: [], ...o });
const place = (id: string, x = 20, y = 15) => ({ id, x, y, parts: [] }) as unknown as MapData['places'][number];
const kinds = Object.keys(RUIN_FINDS) as RuinKind[];

describe('danger wear sites', () => {
  it('has a site for every hive of a generated land', () => {
    const m = generate(42, undefined, undefined, 'desert');
    const sites = dangerSites(m);
    for (const n of m.nests) expect(sites.some((s) => Math.hypot(s.x - (n.x + 0.5) * T, s.y - (n.y + 0.5) * T) < s.r * 0.85 + 1)).toBe(true);
  });
  it('marks the dungeon entrance, boss arenas and rescue sites, never the landing zone, the graveyard or the trail', () => {
    for (const id of ['dungeon', 'castle', 'pilgrim', 'sprocket', 'mast', 'core-vault', 'shrine']) expect(dangerSites(stub({ places: [place(id)] })).length, id).toBeGreaterThan(0);
    for (const id of ['wreck', 'graveyard', 'trail']) expect(dangerSites(stub({ places: [place(id)] })).length, id).toBe(0);
  });
  it('marks a live ruin and not a dead one', () => {
    const live = kinds.find((k) => RUIN_FINDS[k].live)!, dead = kinds.find((k) => !RUIN_FINDS[k].live)!;
    expect(dangerSites(stub({ ruins: [{ x: 10, y: 10, kind: live }] })).length).toBe(1);
    expect(dangerSites(stub({ ruins: [{ x: 10, y: 10, kind: dead }] })).length).toBe(0);
  });
  it('has none down a dungeon', () => {
    expect(dangerSites(stub({ seed: 'dungeon:7', nests: [{ x: 5, y: 5 }] }))).toEqual([]);
  });
  it('leaves a site inside a heavier one to it', () => {
    const sites = dangerSites(stub({ places: [place('castle', 20, 15)], nests: [{ x: 21, y: 15 }] }));
    expect(sites.length).toBe(1);
    expect(sites[0].kind).toBe('arena');
  });
});

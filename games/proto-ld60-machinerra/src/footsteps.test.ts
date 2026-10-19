import { describe, expect, it } from 'vitest';
import { BIOMES, FOES, T, type Enemy } from './sim/defs';
import { Ter } from './sim/mapgen';
import { PRINT, SURFACES, botGait, fightLevel, foeGait, footScale, stepMix, surfaceOf } from './footsteps';

const ter = (t: number) => new Uint8Array([t]);

describe('surfaces', () => {
  it('follows the land: the tile under a point, by the biome paint', () => {
    expect(surfaceOf('desert', ter(Ter.Sand), 1, 5, 5)).toBe('sand');
    expect(surfaceOf('desert', ter(Ter.Dune), 1, 5, 5)).toBe('sand');
    expect(surfaceOf('desert', ter(Ter.Rock), 1, 5, 5)).toBe('rock');
    expect(surfaceOf('snow', ter(Ter.Sand), 1, 5, 5)).toBe('snow');
    expect(surfaceOf('snow', ter(Ter.Hardpan), 1, 5, 5)).toBe('ice');
    expect(surfaceOf('demon', ter(Ter.Sand), 1, 5, 5)).toBe('ash');
    expect(surfaceOf('jungle', ter(Ter.Sand), 1, 5, 5)).toBe('mud');
    expect(surfaceOf('city', ter(Ter.Sand), 1, 5, 5)).toBe('tile');
  });
  it('indexes by tile, row by row', () => {
    const t = new Uint8Array([Ter.Sand, Ter.Rock, Ter.Sand, Ter.Sand]);
    expect(surfaceOf('desert', t, 2, T * 1.5, T * 0.5)).toBe('rock');
    expect(surfaceOf('desert', t, 2, T * 1.5, T * 1.5)).toBe('sand');
  });
  it('the lift is a deck and a dungeon is tile, whatever the land says', () => {
    expect(surfaceOf('desert', ter(Ter.Sand), 1, 5, 5, { deck: true })).toBe('deck');
    expect(surfaceOf('snow', ter(Ter.Sand), 1, 5, 5, { dungeon: true })).toBe('tile');
  });
  it('only soft ground keeps prints; every paint maps to a surface', () => {
    expect(Object.keys(PRINT).sort()).toEqual(['ash', 'mud', 'sand', 'snow']);
    expect(SURFACES).toHaveLength(8);
    for (const b of Object.values(BIOMES)) for (const t of [Ter.Sand, Ter.Dune, Ter.Hardpan, Ter.Rock]) expect(SURFACES).toContain(surfaceOf(b.paint, ter(t), 1, 1, 1));
  });
});

describe('gaits', () => {
  it('flyers leave nothing, grounded foes walk', () => {
    expect(foeGait('hornet')).toBe('none');
    expect(foeGait('kite')).toBe('none');
    expect(foeGait('spider')).toBe('paw');
    expect(foeGait('commuter')).toBe('foot');
    expect(foeGait('drone')).toBe('tread');
    expect(foeGait('snake')).toBe('none');
  });
  it('every foe has a gait, and a ghost never prints', () => {
    for (const k of Object.keys(FOES) as Enemy[]) expect(['foot', 'paw', 'tread', 'none']).toContain(foeGait(k));
    for (const [k, d] of Object.entries(FOES)) if (d.ethereal) expect(foeGait(k as Enemy)).toBe('none');
  });
  it('the Communicator and the tripod walk, the rest roll', () => {
    expect(botGait('controller')).toBe('foot');
    expect(botGait('marksman')).toBe('foot');
    expect(botGait('guard')).toBe('tread');
  });
  it('a bigger foe leaves a bigger print, within limits', () => {
    expect(footScale(8)).toBeLessThan(footScale(20));
    expect(footScale(1)).toBeGreaterThan(0);
    expect(footScale(100)).toBeLessThanOrEqual(0.75);
  });
});

describe('steps in a fight', () => {
  it('sink as the fight opens (1.5 s) and come back slowly (4 s)', () => {
    let a = 0;
    for (let i = 0; i < 90; i++) a = fightLevel(a, true, 1 / 60, 1.5, 4);
    expect(a).toBeCloseTo(1, 5);
    a = fightLevel(a, false, 2, 1.5, 4);
    expect(a).toBeCloseTo(0.5, 5);
    expect(fightLevel(a, false, 10, 1.5, 4)).toBe(0);
  });
  it('the Communicator keeps a quarter, robots none, heavy foes most (a tell)', () => {
    expect([stepMix('comm', 0), stepMix('comm', 1), stepMix('comm', 0.5)]).toEqual([1, 0.25, 0.625]);
    expect([stepMix('robot', 1), stepMix('heavy', 1), stepMix('robot', 0)]).toEqual([0, 0.7, 1]);
  });
});

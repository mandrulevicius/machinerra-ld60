import { describe, expect, it } from 'vitest';
import { BIOMES, PROPS, RUIN_FINDS, type BiomeId, type PropKind } from './defs';
import { CLASS_RUIN, HEART, THING_CLASSES, classOf, classOfPart, classedParts, classedThings } from './classes';
import { BEHAVE } from './placeplay';
import { PART_KINDS, PLACE_IDS, PLACES } from './places';
import { Sim } from './sim';

describe('classes', () => {
  it('every prop kind has a class, and it matches what smashing it does', () => {
    for (const kind of Object.keys(PROPS) as PropKind[]) {
      const d = PROPS[kind];
      expect(THING_CLASSES, kind).toContain(d.cls);
      expect(classOf({ what: 'prop', kind })).toBe(d.cls);
      // `bare` is "gives no scrap when it breaks" (`settle`): scenery pays nothing, loot pays.
      if (d.cls === 'scenery') expect(d.bare, `${kind} is scenery but pays`).toBe(true);
      if (d.cls === 'loot') expect(d.bare, `${kind} is loot but pays nothing`).toBeFalsy();
    }
  });

  it('a prop that drops cans is loot', () => {
    expect(PROPS.vending.fx?.cans).toBeGreaterThan(0);
    expect(classOf({ what: 'prop', kind: 'vending' })).toBe('loot');
  });

  it('every ruin kind has a class', () => {
    expect(Object.keys(CLASS_RUIN).sort()).toEqual(Object.keys(RUIN_FINDS).sort());
    for (const k of Object.keys(RUIN_FINDS) as (keyof typeof RUIN_FINDS)[]) expect(THING_CLASSES).toContain(classOf({ what: 'ruin', kind: k }));
  });

  it('every place has a heart among its parts, and every place with an action has one', () => {
    for (const id of PLACE_IDS) {
      expect(HEART[id].length, id).toBeGreaterThan(0);
      const kinds = PLACES[id].parts.map((q) => q.kind);
      for (const h of HEART[id]) expect(kinds, `${id} has no ${h} part`).toContain(h);
      if (BEHAVE[id].use) expect(HEART[id].length, `${id} has an action but no heart`).toBeGreaterThan(0);
    }
  });

  it('every part kind of every place has a class', () => {
    for (const id of PLACE_IDS) for (const kind of PART_KINDS) expect(THING_CLASSES).toContain(classOfPart(id, kind));
    expect(classOfPart('graveyard', 'can')).toBe('loot');
    expect(classOfPart('core-vault', 'vault')).toBe('centre');
    expect(classOfPart('plaza', 'statue')).toBe('scenery');
  });

  it('classedParts skips the kinds the sim has as its own things', () => {
    const parts = [{ kind: 'hive' as const, x: 0, y: 0 }, { kind: 'case' as const, x: 5, y: 5 }];
    expect(classedParts('shrine', parts).length).toBe(2);
    expect(classedParts('shrine', parts, new Set(['hive'])).map((c) => c.what)).toEqual(['shrine:case']);
  });

  it('a generated land lists its props, ruins, hives and tap with a class each', () => {
    for (const biome of Object.keys(BIOMES) as BiomeId[]) {
      const s = new Sim(1, [], biome);
      const list = classedThings(s);
      expect(list.filter((c) => PROPS[c.what as PropKind]).length, biome).toBe(s.props.list.filter((p) => !p.broken).length);
      expect(list.filter((c) => c.what.startsWith('ruin:')).length).toBe(s.ruins.length);
      expect(list.filter((c) => c.what === 'hive').length).toBe(s.nests.filter((n) => !n.dead).length);
      expect(list.filter((c) => c.what === 'tap').length).toBe(s.seeps.length);
      for (const c of list) {
        expect(THING_CLASSES).toContain(c.cls);
        expect(c.r).toBeGreaterThan(0);
      }
    }
  });
});

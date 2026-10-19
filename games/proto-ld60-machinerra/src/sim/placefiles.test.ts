import { afterEach, describe, expect, it } from 'vitest';
import { BIOMES } from './defs';
import { Ter, generate } from './mapgen';
import { generateReal } from './testkit';
import { rng } from '../../../../harness/kit/rng';
import { PLACES, PLACE_IDS, forced, isPresent, parsePlace, presence, type PlaceFile, type PlaceId, type Presence } from './places';

const FILES = import.meta.glob('../../levels/places/*.json', { eager: true, import: 'default' }) as Record<string, PlaceFile>;
// A land costs a quarter second to make: a few seeds.
const SEEDS = Array.from({ length: 5 }, (_, i) => i + 1);

describe('place files', () => {
  it('every place id has a file and every file a place id', () => {
    expect(Object.keys(FILES).map((p) => p.split('/').pop()!.replace('.json', '')).sort()).toEqual([...PLACE_IDS].sort());
  });

  it('every biome lists only places that exist, and every place is in some biome', () => {
    const listed = new Set<PlaceId>(Object.values(BIOMES).flatMap((b) => b.places));
    expect([...listed].every((id) => id in PLACES)).toBe(true);
    // Level 1's own places are in no biome: only its land file stamps them.
    expect([...listed].sort()).toEqual([...PLACE_IDS].filter((id) => id !== 'wreck' && id !== 'sprocket').sort());
  });

  it('are level files the editor can open: ids are unique, entities have a type and a position, parts are in px from the centre', () => {
    for (const [path, f] of Object.entries(FILES)) {
      const ids = (f.entities ?? []).map((e) => e.id);
      expect(new Set(ids).size, path).toBe(ids.length);
      for (const e of f.entities ?? []) {
        expect(typeof e.type, `${path} ${e.id}`).toBe('string');
        expect(Number.isFinite(e.x) && Number.isFinite(e.y), `${path} ${e.id}`).toBe(true);
      }
    }
    // A px position reads back as the tiles the template used to hold: the graveyard's first wreck.
    expect(PLACES.graveyard.parts[0]).toMatchObject({ kind: 'wreck', dx: 1.95, dy: 2.57 });
  });

  it('ground shapes never wall a part in: every part tile is open', () => {
    for (const seed of SEEDS) {
      const m = generate(seed);
      for (const p of m.places) for (const q of p.parts) expect(m.ter[Math.round(q.y) * m.w + Math.round(q.x)], `seed ${seed} ${p.id}`).not.toBe(Ter.Rock);
    }
  });

});

describe('parsePlace', () => {
  const ok: PlaceFile = { name: 'X', band: [5, 9], clear: 2, apart: 4, entities: [{ id: 'a', type: 'can', x: 32, y: -64 }] };
  it('reads tiles from px and keeps the rules', () => {
    const d = parsePlace('x', { ...ok, noHive: 6, tags: ['t'], presence: { oneIn: 4 }, outward: true });
    expect(d).toMatchObject({ name: 'X', band: [5, 9], noHive: 6, outward: true, tags: ['t'], presence: { oneIn: 4 } });
    expect(d.parts).toEqual([{ id: 'a', kind: 'can', dx: 1, dy: -2 }]);
  });
  it('says what is wrong, naming the place and the entity', () => {
    expect(() => parsePlace('x', { ...ok, name: undefined })).toThrow(/place x.*name/);
    expect(() => parsePlace('x', { ...ok, band: [9, 5] })).toThrow(/band/);
    expect(() => parsePlace('x', { ...ok, entities: [{ id: 'z', type: 'dragon', x: 0, y: 0 }] })).toThrow(/z.*dragon/);
    expect(() => parsePlace('x', { ...ok, entities: [{ id: 'r', type: 'ruin', x: 0, y: 0 }] })).toThrow(/r.*props\.ruin/);
    expect(() => parsePlace('x', { ...ok, entities: [...ok.entities!, ...ok.entities!] })).toThrow(/appears twice/);
    expect(() => parsePlace('x', { ...ok, entities: [] })).toThrow(/no parts/);
    expect(() => parsePlace('x', { ...ok, presence: { oneIn: 0 } })).toThrow(/oneIn/);
    expect(() => parsePlace('x', { ...ok, awayFrom: { places: ['nowhere'], deg: 120 } })).toThrow(/awayFrom/);
    expect(() => parsePlace('x', { ...ok, awayFrom: { places: ['shrine'], deg: 200 } })).toThrow(/awayFrom/);
    expect(parsePlace('x', { ...ok, bounded: true, awayFrom: { places: ['shrine'], deg: 90 } })).toMatchObject({ bounded: true, awayFrom: { places: ['shrine'], deg: 90 } });
  });
});

describe('presence', () => {
  const was = { ...PLACES.mast.presence };
  afterEach(() => {
    PLACES.mast.presence = was;
    forced.clear();
    presence.set({ questActive: () => false, had: () => false });
  });
  const generate = generateReal; // these tests change the rules `generate` reads
  const has = (seed: number, present?: Parameters<typeof generate>[4]) => generate(seed, undefined, undefined, 'desert', present).places.some((p) => p.id === 'mast');
  const withRule = (p: Presence) => void (PLACES.mast.presence = p);

  it('oneIn is a fixed roll per land: about one land in n, the same land always, and no other place moves', () => {
    const LANDS = SEEDS.slice(0, 3); // whole lands are made for these only
    const base = LANDS.map((s) => generate(s).places.filter((p) => p.id !== 'mast')); // before the rule
    withRule({ oneIn: 3 });
    // The roll alone, over many lands: fixed per land, about one in three.
    const rolls = Array.from({ length: 60 }, (_, i) => isPresent('mast', rng(`p/${i}`)));
    expect(rolls).toEqual(Array.from({ length: 60 }, (_, i) => isPresent('mast', rng(`p/${i}`))));
    const n = rolls.filter(Boolean).length;
    expect(n).toBeGreaterThan(8);
    expect(n).toBeLessThan(35);
    // In a land: it agrees with itself, and the places before it in the order are where they were (the ones after may move into the room it left).
    const ruled = LANDS.map((s) => generate(s).places);
    expect(LANDS.map((s) => has(s))).toEqual(ruled.map((ps) => ps.some((p) => p.id === 'mast')));
    LANDS.forEach((s, i) => expect(ruled[i].filter((p) => ['pilgrim', 'shrine', 'trail'].includes(p.id)), `seed ${s}`).toEqual(base[i].filter((p) => ['pilgrim', 'shrine', 'trail'].includes(p.id))));
  });

  it('a quest rule holds the place back until the injected check says the step is active', () => {
    withRule({ quest: 'gasket.2' });
    expect(has(1)).toBe(false);
    expect(has(1, { questActive: (s) => s === 'gasket.2', had: () => false })).toBe(true);
    expect(has(1, { questActive: (s) => s === 'other', had: () => false })).toBe(false);
    presence.set({ questActive: (s) => s === 'gasket.2' });
    expect(has(1)).toBe(true);
  });

  it('a once rule leaves the place out once the run has had it', () => {
    withRule({ once: true });
    expect(has(1)).toBe(true);
    expect(has(1, { questActive: () => false, had: (id) => id === 'mast' })).toBe(false);
  });

});


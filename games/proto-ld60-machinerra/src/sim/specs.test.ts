import { describe, expect, it } from 'vitest';
import {
  BOT_TYPES, FOCI, SPEC_IDS, SPECS, TYPES, botSources, sourcesOf, specsOf, typeSource
} from './specs';
import { validate } from './effects';

describe('the seven base types and their 21 specs', () => {
  it('there are seven types with three specs each, one per focus, and every spec belongs to its type', () => {
    expect(BOT_TYPES).toHaveLength(7);
    expect(SPEC_IDS).toHaveLength(21);
    for (const t of BOT_TYPES) {
      expect(FOCI.map((f) => SPECS[TYPES[t].specs[f]].focus)).toEqual(FOCI);
      for (const s of specsOf(t)) expect(s.type, s.id).toBe(t);
    }
    expect(new Set(BOT_TYPES.flatMap((t) => specsOf(t).map((s) => s.id))).size).toBe(21);
  });

  it('every type and every spec produces an effect source the engine accepts', () => {
    for (const t of BOT_TYPES) {
      const src = typeSource(t);
      expect(src).toMatchObject({ id: `type:${t}`, kind: 'type' });
      expect(src.tags).toContain(t);
      expect(() => validate(src), t).not.toThrow();
      for (const s of specsOf(t)) {
        const [type, spec] = botSources(t, s.id);
        expect(type.id).toBe(`type:${t}`);
        expect(spec).toMatchObject({ id: `spec:${s.id}`, kind: 'spec', name: s.name, tags: [s.id] });
        expect(s.text, s.id).toBeTruthy();
      }
    }
  });

  it('a spec of another type is refused', () => {
    expect(() => botSources('guard', 'medic')).toThrow(/repairer spec/);
  });
});

describe('the roster\'s roles', () => {

  it('a roster robot\'s sources are its type\'s, then its spec\'s', () => {
    expect(sourcesOf({ role: 'gatherer', spec: 'firebrand' }).map((s) => s.id)).toEqual(['type:gatherer', 'spec:firebrand']);
    expect(sourcesOf({ role: 'guard' }).map((s) => s.id)).toEqual(['type:guard']);
  });
});

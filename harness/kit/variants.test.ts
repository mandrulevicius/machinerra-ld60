import { describe, expect, it, beforeEach } from 'vitest';
import { _resetVariants, slot, setVariant, exportVariants, applyVariants, variantsFromQuery, onAnyVariant } from './variants';
import { createQuality } from './quality';

describe('variants', () => {
  beforeEach(() => _resetVariants());

  it('starts on the first variant and switches by key', () => {
    const s = slot('look', { soft: 1, crt: 2 });
    expect([s.name, s.value]).toEqual(['soft', 1]);
    const seen: string[] = [];
    onAnyVariant((k) => seen.push(k));
    setVariant('look', 'crt');
    expect([s.name, s.value, seen]).toEqual(['crt', 2, ['look']]);
    expect(() => setVariant('look', 'nope')).toThrow(/has no variant/);
  });

  it('a slot declared again takes edited variants (hot reload)', () => {
    const s = slot('feel', { floaty: { accel: 900 }, snappy: { accel: 5000 } });
    let changes = 0;
    s.on(() => changes++);
    slot('feel', { floaty: { accel: 1200 }, snappy: { accel: 5000 }, new: { accel: 1 } });
    expect([s.value, s.variants.new, changes]).toEqual([{ accel: 1200 }, { accel: 1 }, 1]);
    slot('feel', { floaty: { accel: 1200 } });
    expect(changes).toBe(1);
  });

  it('URL beats game config beats default', () => {
    _resetVariants('?v.theme=pixel&scene=Kit');
    applyVariants({ theme: 'fantasy', look: 'crt' });
    const theme = slot('theme', { clean: 0, pixel: 1, fantasy: 2 });
    const look = slot('look', { soft: 0, crt: 1 });
    expect(exportVariants()).toEqual({ theme: 'pixel', look: 'crt' });
    applyVariants({ theme: 'clean' }); // config applied after slots exist: URL still wins
    expect(theme.name).toBe('pixel');
    expect(look.name).toBe('crt');
  });

  it('ignores unknown names and parses only v.* params', () => {
    _resetVariants('?v.look=missing');
    expect(slot('look', { soft: 0 }).name).toBe('soft');
    expect(variantsFromQuery('?a=1&v.x=y&v.z=')).toEqual({ x: 'y' });
  });
});

describe('quality', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };

  it('level resets toggles, toggles override, and it persists', () => {
    const store = mem();
    const opts = { storages: [['localStorage', () => store]] as any };
    const q = createQuality('t', '', opts);
    expect(q.get().level).toBe('high');
    q.set({ shadows: false });
    expect(q.get()).toMatchObject({ level: 'high', shadows: false });
    q.set({ level: 'low' });
    expect(q.get()).toMatchObject({ level: 'low', lights: 8, glow: false });
    expect(createQuality('t', '', opts).get().level).toBe('low');
    expect(createQuality('t', '?q=high', opts).get().level).toBe('high');
  });

  it('needs a reload only to raise lights above the baked cap', () => {
    const q = createQuality('t2', '', { storages: [] });
    q.bakedLights = 16;
    q.set({ lights: 8 });
    expect(q.needsReload()).toBe(false);
    q.set({ lights: 32 });
    expect(q.needsReload()).toBe(true);
  });
});

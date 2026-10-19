import { describe, expect, it } from 'vitest';
import { MATERIALS, resolveMaterial, assignMaterial, materialsOf, materialFromRule } from './material';
import { wearFields } from './wear';
import { buildMaps, normalFromAlpha, type MapsOpts } from './normals';

const W = 48;
// opaque 32x32 mid-grey square with a black line across it, transparent border
const px = new Uint8ClampedArray(W * W * 4);
for (let y = 0; y < W; y++)
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const inside = x >= 8 && x < 40 && y >= 8 && y < 40;
    const v = y === 24 ? 0 : 160;
    px.set(inside ? [v, v, v, 255] : [0, 0, 0, 0], i);
  }
const opts: MapsOpts = { radius: 3, strength: 3, orm: true, wear: true, gain: 1, seed: 't' };
const at = (a: ArrayLike<number>, x: number, y: number, c: number) => a[(y * W + x) * 4 + c];

describe('resolveMaterial', () => {
  it('takes a preset, numbers over a base, and a wear scale', () => {
    expect(resolveMaterial('metal').gloss).toBe(MATERIALS.metal.gloss);
    expect(resolveMaterial({ base: 'wood', gloss: 0.5 }).bevel).toBe(MATERIALS.wood.bevel);
    expect(resolveMaterial('metal', { wear: 0.5 }).wear.scratch).toBeCloseTo(0.5);
    expect(resolveMaterial('metal', { wear: { scratch: 0 } }).wear.scratch).toBe(0);
    expect(() => resolveMaterial('nope' as any)).toThrow();
  });
  it('same input = same key, another seed or wear = another key', () => {
    expect(resolveMaterial('metal').key).toBe(resolveMaterial('metal').key);
    expect(resolveMaterial('metal', { seed: 2 }).key).not.toBe(resolveMaterial('metal').key);
    expect(resolveMaterial('metal', { wear: 0 }).key).not.toBe(resolveMaterial('metal').key);
  });
  it('assignMaterial reports changes only', () => {
    const t = {};
    const m = resolveMaterial('wood');
    expect(assignMaterial(t, null, m)).toBe(true);
    expect(assignMaterial(t, null, resolveMaterial('wood'))).toBe(false);
    expect(assignMaterial(t, 'frame', m)).toBe(false); // already the texture's material
    expect(assignMaterial(t, 'frame', resolveMaterial('metal'))).toBe(true);
    expect(materialsOf(t)!.frames.get('frame')!.gloss).toBe(MATERIALS.metal.gloss);
  });
});

describe('wearFields', () => {
  const mix = { scratch: 1, stain: 1, dent: 1, flake: 1 };
  it('is deterministic per seed and differs between seeds', () => {
    const a = wearFields(64, 64, mix, 'a')!, b = wearFields(64, 64, mix, 'a')!, c = wearFields(64, 64, mix, 'b')!;
    expect(Array.from(a.height)).toEqual(Array.from(b.height));
    expect(Array.from(a.height)).not.toEqual(Array.from(c.height));
  });
  it('cuts into the surface, never raises it, and keeps shine loss and dirt in 0..1', () => {
    const f = wearFields(64, 64, mix, 'x')!;
    expect(Math.max(...f.height)).toBeLessThanOrEqual(0);
    expect(Math.min(...f.height)).toBeLessThan(-0.3);
    for (const v of [...f.dull, ...f.dirt]) expect(v >= 0 && v <= 1).toBe(true);
  });
  it('is nothing for no wear, and more wear touches more of the surface', () => {
    expect(wearFields(64, 64, { scratch: 0, stain: 0, dent: 0, flake: 0 }, 'x')).toBeNull();
    const touched = (m: number) => wearFields(64, 64, { scratch: m, stain: 0, dent: m, flake: 0 }, 'x')!.height.filter((v) => v < -0.05).length;
    expect(touched(2)).toBeGreaterThan(touched(0.5));
  });
});

describe('buildMaps', () => {
  it('without a material is the plain bevel with alpha 255 (neutral)', () => {
    const m = buildMaps(px, W, W, null, opts);
    const alpha = new Uint8Array(W * W).map((_, i) => px[i * 4 + 3]);
    expect(Array.from(m.normal)).toEqual(Array.from(normalFromAlpha(alpha, W, W, 3, 3)));
    for (let i = 3; i < m.normal.length; i += 4) expect(m.normal[i]).toBe(255);
    expect([at(m.orm!, 20, 20, 0), at(m.orm!, 20, 20, 1), at(m.orm!, 20, 20, 2), at(m.orm!, 20, 20, 3)]).toEqual([255, 255, 0, 0]);
  });
  it('packs the shine into alpha: glossier material = lower alpha, transparent pixels stay neutral', () => {
    const calm = { ...opts, wear: false };
    const metal = buildMaps(px, W, W, resolveMaterial('metal'), calm);
    const cloth = buildMaps(px, W, W, resolveMaterial('cloth'), calm);
    expect(at(metal.normal, 30, 16, 3)).toBeLessThan(at(cloth.normal, 30, 16, 3));
    expect(at(metal.normal, 30, 16, 3)).toBeLessThan(80);
    expect(at(metal.normal, 1, 1, 3)).toBe(255);
    expect(at(metal.orm!, 30, 16, 2)).toBeGreaterThan(200); // metalness
    expect(at(metal.orm!, 30, 16, 1)).toBeLessThan(60); // roughness
    expect(at(metal.orm!, 1, 1, 2)).toBe(0);
  });
  it('wear dulls the shine somewhere and moves the normals; the same seed gives the same maps', () => {
    const calm = buildMaps(px, W, W, resolveMaterial('metal'), { ...opts, wear: false });
    const worn = buildMaps(px, W, W, resolveMaterial('metal'), opts);
    const again = buildMaps(px, W, W, resolveMaterial('metal'), opts);
    expect(Array.from(worn.normal)).toEqual(Array.from(again.normal));
    let duller = 0, moved = 0;
    for (let i = 0; i < W * W; i++) {
      if (worn.normal[i * 4 + 3] > calm.normal[i * 4 + 3] + 5) duller++;
      if (Math.abs(worn.normal[i * 4] - calm.normal[i * 4]) > 6) moved++;
    }
    expect(duller).toBeGreaterThan(10);
    expect(moved).toBeGreaterThan(10);
  });
  it('relief cuts the art\'s dark line into the surface', () => {
    const flat = buildMaps(px, W, W, resolveMaterial({ base: 'matte', relief: 0 }), { ...opts, wear: false });
    const cut = buildMaps(px, W, W, resolveMaterial({ base: 'matte', relief: 1 }), { ...opts, wear: false });
    expect(at(flat.normal, 24, 23, 1)).toBe(128);
    expect(Math.abs(at(cut.normal, 24, 23, 1) - 128)).toBeGreaterThan(10); // a groove has walls
  });
  it('emissive: a mask picks which pixels glow', () => {
    const e = buildMaps(px, W, W, resolveMaterial('matte', { emissive: { amount: 1, where: (r) => (r < 0.1 ? 1 : 0) } }), opts);
    expect(at(e.orm!, 20, 24, 3)).toBe(255); // on the black line
    expect(at(e.orm!, 20, 16, 3)).toBe(0);
  });
  it('a wider bevel (soft material) tilts the normals further in from the edge', () => {
    const calm = { ...opts, wear: false };
    const tight = buildMaps(px, W, W, resolveMaterial({ base: 'matte', bevel: 0.5 }), calm);
    const wide = buildMaps(px, W, W, resolveMaterial({ base: 'matte', bevel: 3 }), calm);
    const tilt = (m: Uint8ClampedArray, x: number) => Math.abs(at(m, x, 24, 0) - 128);
    expect(tilt(wide.normal, 13)).toBeGreaterThan(tilt(tight.normal, 13)); // 5 px in from the left edge
  });
});

describe('materialFromRule (sizes.json)', () => {
  it('reads a preset name and an object with options', () => {
    expect(materialFromRule('metal')).toEqual({ spec: 'metal', opts: {} });
    const { spec, opts } = materialFromRule({ preset: 'wood', wear: 0.5 });
    expect(spec).toBe('wood');
    expect(resolveMaterial(spec, opts).wear.stain).toBeCloseTo(MATERIALS.wood.wear.stain * 0.5);
    const n = materialFromRule({ preset: 'metal', gloss: 0.3 });
    expect(resolveMaterial(n.spec, n.opts)).toMatchObject({ gloss: 0.3, metal: 1 });
    const alone = materialFromRule({ gloss: 0.4 }); // numbers alone sit over matte
    expect(resolveMaterial(alone.spec, alone.opts).gloss).toBe(0.4);
  });
  it('rejects unknown presets, unknown keys and other shapes', () => {
    expect(() => materialFromRule('steel')).toThrow(/unknown material/);
    expect(() => materialFromRule({ preset: 'steel' })).toThrow(/unknown material/);
    expect(() => materialFromRule({ presset: 'metal' })).toThrow(/unknown material key/);
    expect(() => materialFromRule(3)).toThrow();
  });
});

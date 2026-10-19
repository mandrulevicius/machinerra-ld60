import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));
const seen: { rocky: Uint8Array[]; mask: Uint8Array[] } = { rocky: [], mask: [] };
vi.mock('./wear', () => ({ wearGround: (_c: unknown, _m: unknown, _k: number, rocky: Uint8Array) => void seen.rocky.push(rocky.slice()) }));
vi.mock('./mesashadow', () => ({ mesaMask: (_s: unknown, _key: string, rocky: Uint8Array) => void seen.mask.push(rocky.slice()) }));

import { generate } from './sim/mapgen';
import type { BiomeId } from './sim/defs';
import { paintGround } from './groundart';

/** A 2d context that keeps pixels (create/put/getImageData) and folds every other call and property write into a hash. */
function fakeCtx(record: boolean) {
  const h = createHash('sha256');
  let img: { data: Uint8ClampedArray; width: number; height: number } | null = null;
  const note = (s: string) => {
    if (record) h.update(s);
  };
  const stub = (path: string): unknown =>
    new Proxy(function () {}, {
      get: (_t, p) => {
        if (p === Symbol.toPrimitive) return () => path;
        if (typeof p === 'symbol') return undefined;
        return stub(`${path}.${p}`);
      },
      set: (_t, p, v) => (note(`${path}.${String(p)}=${String(v)};`), true),
      apply: (_t, _self, args) => (note(`${path}(${args.map((a) => (typeof a === 'number' ? a : String(a))).join(',')});`), stub(`${path}()`)),
    });
  const base = stub('c') as Record<string, unknown>;
  const ctx = new Proxy(base, {
    get: (t, p) => {
      if (p === 'createImageData') return (w: number, hh: number) => (img = { data: new Uint8ClampedArray(w * hh * 4), width: w, height: hh });
      if (p === 'putImageData') return (i: typeof img) => void (img = i);
      if (p === 'getImageData') return () => img;
      return t[p as string];
    },
    set: (_t, p, v) => (note(`c.${String(p)}=${String(v)};`), true),
  });
  return { ctx, pixels: () => img!.data, calls: () => h.copy().digest('hex').slice(0, 16) };
}

/** Paints one land through the real `paintGround`; returns the pixels, the mask handed on, the wear's rocky and the buried tech's draw calls, each hashed. */
function paint(seed: number, biome: BiomeId, px: number, w = 80, h = 60, record = true) {
  seen.rocky.length = seen.mask.length = 0;
  const f = fakeCtx(record);
  const scene = { textures: { exists: () => false, createCanvas: () => ({ getContext: () => f.ctx, refresh() {} }) } };
  const m = generate(seed, w, h, biome);
  paintGround(scene as never, m, px);
  const hash = (b: Uint8Array | Uint8ClampedArray | undefined) => (b ? createHash('sha256').update(b).digest('hex').slice(0, 16) : '-');
  return { pixels: hash(f.pixels()), mask: hash(seen.mask[0]), wear: hash(seen.rocky[0]), tech: record ? f.calls() : '' };
}

const CASES: [number, BiomeId, number][] = [
  [42, 'desert', 1],
  [7, 'city', 1],
  [3, 'jungle', 1],
  [1, 'mountains', 1],
  [5, 'demon', 1],
  [9, 'ether', 1],
  [42, 'desert', 2],
  [7, 'city', 2],
];

// Golden values taken from the paint before it was optimised: the ground must stay byte-identical.
const GOLDEN: Record<string, { pixels: string; mask: string; wear: string; tech: string }> = {
  'desert-42-1': { pixels: '29cd399bd52653e4', mask: '043962d7f25c3765', wear: '043962d7f25c3765', tech: 'c71d2ba018ef9e0b' },
  'city-7-1': { pixels: '8e37dbcb8be1e12b', mask: '3ff0d06580e9e26c', wear: '3ff0d06580e9e26c', tech: '3dce1e435550e1a4' },
  'jungle-3-1': { pixels: 'cfe993c2ee6649ce', mask: 'e7a85218bf80d49f', wear: 'e7a85218bf80d49f', tech: '78520e6eefd61ca9' },
  'mountains-1-1': { pixels: '784dcac03773e8d7', mask: '19fd9f27c3fdeeae', wear: '19fd9f27c3fdeeae', tech: 'e3ffef6ce1578dfb' },
  'demon-5-1': { pixels: '0c6464779844c972', mask: 'a5032901e3d12adc', wear: 'a5032901e3d12adc', tech: 'b21682ddfc77cb48' },
  'ether-9-1': { pixels: '59fd989760452b68', mask: '81c692ae948ab336', wear: '81c692ae948ab336', tech: '57e9e80d67fb1e00' },
  'desert-42-2': { pixels: '4183f7a89d4bb7b1', mask: '-', wear: '-', tech: '976591032532dac5' },
  'city-7-2': { pixels: '94b8823f43cf2691', mask: '-', wear: '-', tech: '9864d2e17228f46d' },
};

describe('paintGround', () => {
  for (const [seed, biome, px] of CASES) {
    it(`paints ${biome} seed ${seed} at ${px} byte for byte`, () => {
      const got = paint(seed, biome, px);
      const want = GOLDEN[`${biome}-${seed}-${px}`];
      if (!want) console.log(`GOLDEN ${biome}-${seed}-${px}`, JSON.stringify(got));
      expect(got).toEqual(want);
    });
  }

  // PAINT_BENCH=1: the headless ms of one full 3200 x 2400 land (median of 5 after a warm-up), written to <tmp>/paint_ms.txt.
  it.runIf(process.env.PAINT_BENCH)('times a full land', () => {
    const ms: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t0 = performance.now();
      paint(42, 'desert', 1, 100, 75, false);
      ms.push(performance.now() - t0);
    }
    const run = ms.slice(1).sort((a, b) => a - b);
    writeFileSync(join(tmpdir(), 'paint_ms.txt'), `median ${run[2].toFixed(0)} all ${ms.map((n) => n.toFixed(0)).join(' ')}`);
  }, 120000);
});

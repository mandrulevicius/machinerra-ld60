/**
 * Materials: what a surface is made of, as numbers the normal-map generator (normals.ts) and the lit shader (material.frag) use.
 * Plain TS, no Phaser; the API that applies one to art is `material()` in normals.ts.
 *
 *   gloss   0 matte .. 1 polished. Specular strength and tightness; how bright and sharp the rim is.
 *   metal   0 painted/organic .. 1 bare metal. Tints specular and rim with the art's colour (high quality).
 *   bevel   multiplier on `normalOptions.radius`: how wide the rounded edge is. A wide bevel is a wide, soft rim (wood, cloth),
 *           a narrow one a tight, hard rim (metal).
 *   relief  0..1, how much the art's own darkness is read as depth (dark lines become grooves) and dulls the shine there.
 *   wear    how much of each kind: scratch (fine grooves), stain (blotches, dull and dirty), dent (round dips), flake (chipped patches).
 *   emissive  glow at its own colour whatever the lights do (high quality): a number for the whole sprite, or { amount, where }.
 *
 * The default (nothing assigned) is `matte`: no gloss, no wear, the plain rim (a faint edge). Only metal and paint shine; wood, stone,
 * cloth and skin stay under gloss 0.15, which is no visible specular and a faint wide rim in the art's colour.
 */

export interface WearMix {
  scratch: number;
  stain: number;
  dent: number;
  flake: number;
}

export interface EmissiveDef {
  /** 0..1 */
  amount: number;
  /** Which pixels glow: 'all' (default), 'bright' (max(r,g,b) above `threshold`, default 0.7), or your own mask (r, g, b, a in 0..1; returns 0..1). */
  where?: 'all' | 'bright' | ((r: number, g: number, b: number, a: number) => number);
  threshold?: number;
}

export interface MaterialDef {
  gloss: number;
  metal: number;
  bevel: number;
  relief: number;
  wear: WearMix;
  emissive?: number | EmissiveDef;
}

const w = (scratch = 0, stain = 0, dent = 0, flake = 0): WearMix => ({ scratch, stain, dent, flake });

export const MATERIALS = {
  matte: { gloss: 0, metal: 0, bevel: 1, relief: 0, wear: w() },
  metal: { gloss: 0.9, metal: 1, bevel: 0.8, relief: 0.15, wear: w(1, 0.25, 0.5, 0) },
  wood: { gloss: 0.06, metal: 0, bevel: 2.2, relief: 0.55, wear: w(0.4, 0.6, 0.35, 0.1) },
  stone: { gloss: 0.04, metal: 0, bevel: 1.8, relief: 0.5, wear: w(0.25, 0.7, 0.8, 0.2) },
  cloth: { gloss: 0, metal: 0, bevel: 2.6, relief: 0.3, wear: w(0, 0.6, 0, 0) },
  skin: { gloss: 0.14, metal: 0, bevel: 2, relief: 0.1, wear: w(0.1, 0.35, 0, 0) },
  painted: { gloss: 0.5, metal: 0, bevel: 1, relief: 0.2, wear: w(0.3, 0.3, 0.3, 0.8) },
} satisfies Record<string, MaterialDef>;

export type MaterialName = keyof typeof MATERIALS;
/** A preset name, or numbers (any left out come from `base`, default matte). */
export type MaterialSpec = MaterialName | (Partial<Omit<MaterialDef, 'wear'>> & { base?: MaterialName; wear?: Partial<WearMix> });
export interface MaterialOpts {
  /** A number scales the material's own wear mix (0 none, 1 as defined, 2 heavy); an object sets kinds outright. */
  wear?: number | Partial<WearMix>;
  /** Wear is drawn from the texture's name, so the same art always wears the same way; change this for another pattern. */
  seed?: number | string;
  emissive?: number | EmissiveDef;
}

export interface ResolvedMaterial extends MaterialDef {
  /** Same key = same maps. */
  key: string;
  seed: number | string;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function resolveMaterial(spec: MaterialSpec, opts: MaterialOpts = {}): ResolvedMaterial {
  const named = typeof spec === 'string';
  const base = MATERIALS[(named ? spec : spec.base) ?? 'matte'];
  if (!base) throw new Error(`unknown material "${String(spec)}": ${Object.keys(MATERIALS).join(', ')}`);
  const custom = named ? {} : spec;
  let wear: WearMix = { ...base.wear, ...(custom.wear ?? {}) };
  if (typeof opts.wear === 'number') wear = { scratch: wear.scratch * opts.wear, stain: wear.stain * opts.wear, dent: wear.dent * opts.wear, flake: wear.flake * opts.wear };
  else if (opts.wear) wear = { ...wear, ...opts.wear };
  const m: MaterialDef = {
    gloss: clamp01(custom.gloss ?? base.gloss),
    metal: clamp01(custom.metal ?? base.metal),
    bevel: Math.max(0.1, custom.bevel ?? base.bevel),
    relief: clamp01(custom.relief ?? base.relief),
    wear,
    emissive: opts.emissive ?? custom.emissive,
  };
  const seed = opts.seed ?? '';
  return { ...m, seed, key: JSON.stringify([m, seed]) };
}

/**
 * A material as written in `art/sizes.json` (scripts/assets.mjs copies it into the atlas frame): a preset name, or
 * `{ preset, gloss, metal, bevel, relief, wear, seed, emissive }` (all optional; `wear` is a number that scales the preset's
 * mix, or kinds that set it). It is plain JSON, so `emissive` is a number or `{ amount, threshold }`.
 */
export type MaterialRule = MaterialName | (Partial<Pick<MaterialDef, 'gloss' | 'metal' | 'bevel' | 'relief'>> & { preset?: MaterialName; wear?: number | Partial<WearMix>; seed?: number | string; emissive?: number | Omit<EmissiveDef, 'where'> });

const RULE_KEYS = ['preset', 'gloss', 'metal', 'bevel', 'relief', 'wear', 'seed', 'emissive'];

/** A sizes.json material as the arguments of `material()`. Throws on an unknown preset or key, so a typo fails the build. */
export function materialFromRule(rule: unknown): { spec: MaterialSpec; opts: MaterialOpts } {
  if (typeof rule === 'string') {
    resolveMaterial(rule as MaterialName); // validates the name
    return { spec: rule as MaterialName, opts: {} };
  }
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error(`a material is a preset name or an object, got ${JSON.stringify(rule)}`);
  const { preset, wear, seed, emissive, ...numbers } = rule as Record<string, any>;
  const bad = Object.keys(rule).filter((k) => !RULE_KEYS.includes(k));
  if (bad.length) throw new Error(`unknown material key ${bad.join(', ')}: ${RULE_KEYS.join(', ')}`);
  const spec = Object.keys(numbers).length ? { ...numbers, base: preset } : (preset ?? 'matte');
  resolveMaterial(spec); // validates the preset
  return { spec, opts: { wear, seed, emissive } };
}

/** Global switches (see `setMaterials` in normals.ts): `on` false makes every map neutral, `wear` false leaves the wear out, `gain` is the wear depth. */
export const materialOptions = { on: true, wear: true, gain: 0.5 };

/** Where a texture's materials are kept: one for the whole texture, and/or per frame (atlas). */
interface Assigned {
  all?: ResolvedMaterial;
  frames: Map<string, ResolvedMaterial>;
}
const assigned = new WeakMap<object, Assigned>();

/** What the game has asked for so far (never reset): rim.ts runs the cheapest lit shader that shows it. `orm`: some texture has ORM data. */
export const used = { materials: false, orm: false };
let notify: (() => void) | null = null;
export function onMaterialUse(fn: () => void) {
  notify = fn;
}
export function markUsed(what: keyof typeof used) {
  if (used[what]) return;
  used[what] = true;
  notify?.();
}

/** Record `m` for the texture (frame null = all frames). Returns false when it was already so. */
export function assignMaterial(texture: object, frame: string | null, m: ResolvedMaterial): boolean {
  markUsed('materials');
  let a = assigned.get(texture);
  if (!a) assigned.set(texture, (a = { frames: new Map() }));
  if (frame === null) {
    if (a.all?.key === m.key) return false;
    a.all = m;
    a.frames.clear();
    return true;
  }
  if ((a.frames.get(frame) ?? a.all)?.key === m.key) return false;
  a.frames.set(frame, m);
  return true;
}

export function materialsOf(texture: object): Assigned | undefined {
  return assigned.get(texture);
}

/** The normal map's partner on high quality: ORM + emissive texture, found from the normal map's GL texture (rim.ts binds it). */
export const ormOf = new WeakMap<object, object>();

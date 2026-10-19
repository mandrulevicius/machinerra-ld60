/**
 * The lit shader: rim light, specular and materials, in the one lit pass. It swaps two of Phaser's shader additions in the lit batch
 * shaders. Three levels, the cheapest that shows what the game uses (measured costs: harness/kit/README.md, Materials):
 *   rim       `ApplyLighting` for rim.frag: Phaser's own diffuse plus a coloured rim on the side facing a light. Until some art
 *             is given a material (`material()`, `L.lit(obj, spec)`, `bake(..., { material })`).
 *   material  `NormalMap` also reads the material from the map's alpha, and `ApplyLighting` is material.frag (specular and a rim
 *             shaped by the material: metal is a tight bright edge and a sharp highlight, wood a wide soft one).
 *   orm       only once a texture has ORM data (high quality, a material): a second texture is bound beside the normal map,
 *             occlusion, roughness, metalness, emissive in RGBA (see normals.ts). Phaser's lit batch has two texture slots (colour,
 *             normal), so the batch handlers' `batchTextures` is wrapped to put the normal map's partner in slot 2; a map without
 *             one gets a neutral texel. Batching is unchanged: the pair is chosen by the normal map, which already splits the batch.
 * No extra draw, pass or object. The normal maps and materials are made by normals.ts / material.ts; a texture with a flat normal
 * gets no rim, and one without a material is a neutral matte whose rim is the plain rim.
 *
 * The kit's shader scaffold (shader.ts) makes filters and shader quads; the lit path is neither, so this uses Phaser's own
 * shader-addition API (`ProgramManager.replaceAddition`). Gotchas (lab Lit probe): Phaser keys compiled programs by addition
 * NAME, not source, so each version needs its own name or the cached program is reused; strengths are uniforms kept in
 * `programManager.uniforms` (applied on every draw), so changing them never recompiles. 'plain' restores Phaser's own additions.
 *
 *   setRim(game, 0.8);          // rim strength, 0 = no rim (specular and materials still work). The rig does this from the `rim` slot.
 *   setShading(game, 'orm');    // the most the game may use: 'plain' (Phaser's own shader; the rig uses it on low) | 'rim' | 'material' (medium) | 'orm' (high).
 *                               // 'material' and 'orm' still run the rim shader until art has a material (and ORM data).
 *   setMaterialRim(game, false) // every material gets the plain rim (a comparison switch)
 */
import type Phaser from 'phaser';
import frag from './material.frag?raw';
import fragPlain from './rim.frag?raw';
import { onMaterialUse, ormOf, used } from './material';

type Addition = { name: string; additions: Record<string, string>; tags?: string[]; disable?: boolean };
interface Pm {
  getAddition(name: string): Addition | null;
  replaceAddition(name: string, a: Addition): void;
  setUniform(name: string, v: number): void;
}
export type Shading = 'plain' | 'rim' | 'material' | 'orm';

const HANDLERS = ['BatchHandlerQuad', 'BatchHandlerTileSprite'];
const NORMAL = ['NormalMap', 'NormalMapMat', 'NormalMapMatOrm'];
const LIGHT = ['ApplyLighting', 'ApplyLightingRim', 'ApplyLightingMat', 'ApplyLightingMatOrm'];

const originals = new Map<Pm, { normal: Addition; light: Addition }>();
/** shading = the most the game may use; null = not chosen: a rim shader while there is a rim, Phaser's own otherwise. */
const state = { rim: 0, shading: null as Shading | null, matRim: true, game: null as Phaser.Game | null, orm: false };

/** The shader to run: the ceiling `state.shading`, lowered to what the art uses. */
function modeNow(): Shading {
  const max = state.shading ?? (state.rim > 0 ? 'material' : 'plain');
  if (max === 'plain' || max === 'rim') return max;
  if (!used.materials) return state.rim > 0 ? 'rim' : 'plain';
  return max === 'orm' && used.orm ? 'orm' : 'material';
}

const SAMPLE = 'vec4 nmap = texture2D(uNormSampler, texCoord); vec3 normal = normalize(outInverseRotationMatrix * vec3(nmap.rgb * 2.0 - 1.0)); float mGloss = 1.0 - nmap.a; float mMetal = mGloss * mGloss; float mAo = 1.0; float mEmi = 0.0;';
const SAMPLE_ORM = SAMPLE + ' vec4 orm = texture2D(uMatSampler, texCoord); mGloss = 1.0 - orm.g; mMetal = orm.b; mAo = orm.r; mEmi = orm.a;';
const APPLY = 'fragColor = applyLightingMat(fragColor, normal, mGloss, mMetal, mAo, mEmi);';

const clone = (a: Addition): Addition => ({ ...a, additions: { ...a.additions } });
const swap = (pm: Pm, names: string[], next: Addition) => {
  const cur = names.map((n) => pm.getAddition(n)).find(Boolean)!;
  next.disable = cur.disable; // the batch handler flips this with `lighting`
  if (next.name !== cur.name) pm.replaceAddition(cur.name, next);
};

/** One neutral ORM texel per renderer, for lit things whose normal map has no partner. */
const neutral = new WeakMap<object, unknown>();
function neutralOrm(r: any) {
  let t = neutral.get(r);
  if (!t) {
    const gl = r.gl;
    t = r.createTexture2D(0, gl.NEAREST, gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.RGBA, new Uint8Array([255, 255, 0, 0]), 1, 1, false, false, true);
    neutral.set(r, t);
  }
  return t;
}

const wrapped = new WeakSet<object>();
function wrapBatch(node: any, renderer: any) {
  if (wrapped.has(node)) return;
  wrapped.add(node);
  const orig = node.batchTextures;
  node.batchTextures = function (this: any, glTexture: unknown, renderOptions: any) {
    const datum = orig.call(this, glTexture, renderOptions);
    if (state.orm && this.renderOptions.lighting) {
      this.currentBatchEntry.texture[2] = ormOf.get(renderOptions.lighting.normalGLTexture) ?? neutralOrm(renderer);
    }
    return datum;
  };
}

function apply(game: Phaser.Game) {
  const renderer = game.renderer as any;
  if (!renderer?.renderNodes) return; // canvas renderer
  state.game = game;
  const mode = modeNow();
  const orm = mode === 'orm';
  state.orm = orm;
  for (const name of HANDLERS) {
    const node = renderer.renderNodes.getNode(name);
    const pm: Pm | undefined = node?.programManager;
    if (!pm || !LIGHT.some((n) => pm.getAddition(n))) continue;
    if (!originals.has(pm)) {
      if (mode === 'plain') continue; // nothing swapped yet, nothing to undo
      originals.set(pm, { normal: clone(pm.getAddition('NormalMap')!), light: clone(pm.getAddition('ApplyLighting')!) });
    }
    const orig = originals.get(pm)!;
    if (mode === 'plain') {
      swap(pm, NORMAL, clone(orig.normal));
      swap(pm, LIGHT, clone(orig.light));
      continue;
    }
    if (mode === 'rim') {
      swap(pm, NORMAL, clone(orig.normal));
      swap(pm, LIGHT, { name: 'ApplyLightingRim', tags: ['LIGHTING'], additions: { fragmentHeader: fragPlain, fragmentProcess: orig.light.additions.fragmentProcess } });
      pm.setUniform('uRimStrength', state.rim);
      continue;
    }
    swap(pm, NORMAL, { name: orm ? 'NormalMapMatOrm' : 'NormalMapMat', tags: ['LIGHTING'], additions: { fragmentHeader: orig.normal.additions.fragmentHeader, fragmentProcess: orm ? SAMPLE_ORM : SAMPLE } });
    swap(pm, LIGHT, { name: orm ? 'ApplyLightingMatOrm' : 'ApplyLightingMat', tags: ['LIGHTING'], additions: { fragmentHeader: (orm ? '#define MAT_ORM\n' : '') + frag, fragmentProcess: APPLY } });
    pm.setUniform('uRimStrength', state.rim);
    pm.setUniform('uMatRim', state.matRim ? 1 : 0);
    if (orm) {
      pm.setUniform('uMatSampler', 2);
      wrapBatch(node, renderer);
    }
  }
}

export function setRim(game: Phaser.Game, strength: number) {
  state.rim = Math.max(0, strength);
  apply(game);
}

export function setShading(game: Phaser.Game, shading: Shading) {
  state.shading = shading;
  apply(game);
}

export function setMaterialRim(game: Phaser.Game, on: boolean) {
  state.matRim = on;
  apply(game);
}

// Art asked for a material (or got ORM data): move up to the shader that shows it.
onMaterialUse(() => state.game && apply(state.game));

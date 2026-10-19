/**
 * Scaffold for custom fragment shaders in Phaser 4: a screen/object FILTER or a SHADER object (a quad), from GLSL alone.
 * Bakes in the gotchas from the lab Shaders probe:
 *  - the `#pragma phaserTemplate(...)` lines and a precision line are added when missing (glsl.ts);
 *  - nothing is automatic in Phaser 4, so every draw supplies `uTime` (seconds since creation), `uResolution` (px) and
 *    `uPointer` (0..1 of the game canvas, y UP) to any shader that declares them. Declare only what you use;
 *  - `outTexCoord` is GL oriented (y = 0 at the bottom), and so is `gl_FragCoord` inside a filter; `pointerUv` does the flip;
 *  - the controller and its RenderNode share one name and are registered once (scene restarts would throw on a duplicate);
 *  - a uniform name in `uniforms` that the GLSL does not declare is warned about (Phaser would silently read 0).
 *
 *   const Tint = defineFilter({ name: 'Tint', frag, uniforms: { uAmount: 0.5 } });       // frag: GLSL text (`x.frag?raw`)
 *   const f = Tint.add(this, this.cameras.main.filters.external);                         // or obj.filters.internal
 *   f.u.uAmount = 1; f.active = false;
 *
 *   const bg = addShader(this, { frag, uniforms: { uColor: [1, 0.5, 0] }, x: 640, y: 360, w: 1280, h: 720 });
 *   bg.u.uColor = [0, 1, 0]; bg.setBlendMode(Phaser.BlendModes.ADD).setDepth(-1);
 *
 * A filter fragment reads `uMainSampler` (the input) and may call `boundedSampler(uMainSampler, uv)`. Single pass,
 * so a full-screen one costs about 1 ms on an Intel UHD (the built-in blur/glow/bloom are ~9 ms: several passes).
 */
import Phaser from 'phaser';
import { pointerUv, prepareFragment, unknownUniforms } from './glsl';

export { prepareFragment, declaredUniforms, unknownUniforms, pointerUv, BUILTIN_UNIFORMS } from './glsl';

export type UniformValue = number | boolean | number[];
export type Uniforms = Record<string, UniformValue>;

const warned = new Set<string>();
function warnUnknown(name: string, frag: string, names: string[]) {
  const bad = unknownUniforms(frag, names);
  if (bad.length && !warned.has(name)) {
    warned.add(name);
    console.warn(`[shader ${name}] uniforms not declared in the GLSL (typo? they would read 0): ${bad.join(', ')}`);
  }
}

const val = (v: UniformValue) => (typeof v === 'boolean' ? +v : v);

/** Builtin uniform values of one filter node or shader: filled in place each draw (Phaser reads them right after `setupUniforms`). */
const newInputs = () => ({ time: 0, pointer: [0, 0] as [number, number], res: [0, 0] });

/** time (s), pointer (0..1, y up) for one draw, from the game clock and the active pointer. */
function frameInputs(out: ReturnType<typeof newInputs>, game: Phaser.Game, t0: number, w: number, h: number) {
  const p = game.input.activePointer;
  out.time = (game.loop.time - t0) / 1000;
  pointerUv(p.x, p.y, game.scale.width, game.scale.height, out.pointer);
  out.res[0] = w;
  out.res[1] = h;
  return out;
}

// ---- filter ----

export interface FilterDef<U extends Uniforms> {
  /** Unique per filter; the render node is registered as `FilterKit<name>`. */
  name: string;
  frag: string;
  /** Defaults, and the full set of user uniforms (override per instance in `add`). */
  uniforms?: U;
}

/** The controller returned by `add`: edit `u` live, toggle `active`. */
export type FilterController<U extends Uniforms> = Phaser.Filters.Controller & { u: U; t0: number };

export function defineFilter<U extends Uniforms = Uniforms>(def: FilterDef<U>) {
  const nodeName = `FilterKit${def.name}`;
  const frag = prepareFragment(def.frag, 'filter');

  class KitController extends Phaser.Filters.Controller {
    u: U;
    t0: number;
    constructor(camera: Phaser.Cameras.Scene2D.Camera, u: U, t0: number) {
      super(camera, nodeName); // must equal the RenderNode's name
      this.u = u;
      this.t0 = t0;
    }
  }

  class KitNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
    private inputs = newInputs();
    constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
      super(nodeName, manager, undefined, frag);
    }

    setupUniforms(controller: KitController, ctx: { width: number; height: number }) {
      const pm = this.programManager;
      const f = frameInputs(this.inputs, this.manager.renderer.game, controller.t0, ctx.width, ctx.height);
      pm.setUniform('uTime', f.time);
      pm.setUniform('uResolution', f.res);
      pm.setUniform('uPointer', f.pointer);
      for (const k in controller.u) pm.setUniform(k, val(controller.u[k]));
    }
  }

  return {
    nodeName,
    /** Register (once) and add the filter to a FilterList: `camera.filters.external`, `obj.filters.internal`, ... */
    add(scene: Phaser.Scene, list: Phaser.GameObjects.Components.FilterList, uniforms?: Partial<U>): FilterController<U> {
      const nodes = (scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).renderNodes;
      if (!nodes.hasNode(nodeName)) nodes.addNodeConstructor(nodeName, KitNode);
      const u = { ...def.uniforms, ...uniforms } as U;
      warnUnknown(def.name, frag, Object.keys(u));
      return list.add(new KitController(list.camera, u, scene.game.loop.time)) as unknown as FilterController<U>;
    },
  };
}

// ---- shader object ----

export interface ShaderOpts<U extends Uniforms> {
  frag: string;
  uniforms?: U;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  name?: string;
}

export type KitShader<U extends Uniforms> = Phaser.GameObjects.Shader & { u: U };

let shaderCount = 0;

/** A Shader object (stand-alone quad, one draw call, breaks batching) with the builtins supplied. Origin is the centre. */
export function addShader<U extends Uniforms = Uniforms>(scene: Phaser.Scene, o: ShaderOpts<U>): KitShader<U> {
  const name = o.name ?? `kitshader${shaderCount++}`;
  const frag = prepareFragment(o.frag, 'shader');
  const u = { ...o.uniforms } as U;
  warnUnknown(name, frag, Object.keys(u));
  const t0 = scene.game.loop.time;
  const inputs = newInputs();
  const sh: Phaser.GameObjects.Shader = scene.add.shader(
    {
      name,
      fragmentSource: frag,
      // runs on every render of the Shader
      setupUniforms: (set: (n: string, v: unknown) => void) => {
        const f = frameInputs(inputs, scene.game, t0, sh.width, sh.height);
        set('uTime', f.time);
        set('uResolution', f.res);
        set('uPointer', f.pointer);
        for (const k in u) set(k, val(u[k]));
      },
    },
    o.x ?? 0,
    o.y ?? 0,
    o.w ?? 128,
    o.h ?? 128,
  );
  return Object.assign(sh, { u });
}

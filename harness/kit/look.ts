/**
 * Screen look: one custom camera filter doing colour grade, vignette, scanlines and a cheap bloom in a single pass.
 * Lab facts (Shaders/Filters probes): a single-pass custom shader is ~1 ms full screen on an Intel UHD, while the
 * built-in blur/glow/bloom are ~9 ms (several passes); an inactive filter costs nothing. Bloom needs quality.glow.
 *
 *   kit(this).look();      // on the main camera; follows the 'look' slot and quality
 */
import Phaser from 'phaser';
import frag from './look.frag?raw';
import { slot } from './variants';
import { quality } from './state';

export interface ScreenLook {
  /** false = filter inactive (free). */
  on: boolean;
  bloom: number;
  threshold: number;
  radius: number;
  saturation: number;
  contrast: number;
  tint: [number, number, number];
  vignette: number;
  scanlines: number;
}

const plain = { on: true, bloom: 0, threshold: 0.6, radius: 6, saturation: 1, contrast: 1, tint: [1, 1, 1] as [number, number, number], vignette: 0, scanlines: 0 };
export const lookSlot = slot<ScreenLook>('look', {
  soft: { ...plain, bloom: 0.9, vignette: 0.35, saturation: 1.1 },
  none: { ...plain, on: false },
  warm: { ...plain, bloom: 0.7, vignette: 0.5, saturation: 0.9, contrast: 1.08, tint: [1.08, 1, 0.86] },
  crt: { ...plain, bloom: 1.2, threshold: 0.5, radius: 4, vignette: 0.6, contrast: 1.15, scanlines: 0.18 },
});

export class LookFilter extends Phaser.Filters.Controller {
  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, 'FilterKitLook'); // must equal the RenderNode's name
    this.refresh();
  }

  refresh() {
    this.active = lookSlot.value.on;
  }
}

const texel = [0, 0]; // reused every frame; Phaser reads it when it draws, right after setupUniforms
class FilterKitLook extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super('FilterKitLook', manager, undefined, frag);
  }

  setupUniforms(controller: LookFilter, _ctx: unknown) {
    const L = lookSlot.value;
    const cam = controller.camera;
    const pm = this.programManager;
    texel[0] = 1 / cam.width;
    texel[1] = 1 / cam.height;
    pm.setUniform('uTexel', texel);
    pm.setUniform('uBloom', quality().get().glow ? L.bloom : 0);
    pm.setUniform('uThreshold', L.threshold);
    pm.setUniform('uRadius', L.radius);
    pm.setUniform('uSaturation', L.saturation);
    pm.setUniform('uContrast', L.contrast);
    pm.setUniform('uTint', L.tint);
    pm.setUniform('uVignette', L.vignette);
    pm.setUniform('uScan', L.scanlines);
    pm.setUniform('uHeight', cam.height);
  }
}

/** Adds the look filter to a camera (external list: applied after the camera's own filters). */
export function addLook(camera: Phaser.Cameras.Scene2D.Camera) {
  const nodes = (camera.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).renderNodes;
  if (!nodes.hasNode('FilterKitLook')) nodes.addNodeConstructor('FilterKitLook', FilterKitLook);
  return camera.filters!.external.add(new LookFilter(camera));
}

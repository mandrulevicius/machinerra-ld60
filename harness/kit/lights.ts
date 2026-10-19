/**
 * Light rig: ambient level, light radius/intensity/flicker per variant; colours from the theme's fx palette.
 * Lab facts (Lighting probe): render.maxLights is baked into the light shader at the FIRST lit render and sizes its loop
 * (a bigger cap costs even with few lights), so the rig sets it from quality.lights before that, and only the lights
 * nearest the camera centre are drawn beyond the cap. Lowering quality.lights is live (fewer drawn); raising it needs a reload.
 * Lit objects multiply by the light: white fill + black lines = "lit paper". Lighting breaks batches: keep HUD unlit.
 * Lit by default: once a scene has a rig, every Image, Sprite and TileSprite in it (added before or after) is lit when it
 * first renders, except ones with a blend mode other than NORMAL (glows, effects), scrollFactor 0 (HUD) or `L.unlit(obj)`.
 * A texture without a normal map gets one made from its alpha when first lit (normals.ts), so lights shade the form.
 * Graphics, Shapes and Text are never lit: Phaser draws a lit Graphics invisible (lab probe), so bake it first (bake.ts).
 *
 *   const L = kit(this).lights;     // create it in create(), before any lit object renders
 *   L.lit(sprite);                  // force: lit whatever the rules say (setLighting + self-shadow from quality.shadows)
 *   L.lit(sprite, 'metal', { wear: 0.5 });   // and give it a material (normals.ts: metal, wood, stone, cloth, skin, painted)
 *   L.unlit(sprite);                // opt out of the default
 *   const lamp = L.add(x, y);       // colour cycles theme().fx; { color: 'danger', radius: 300, intensity: 2, height: 0.45 }
 *   L.selfShadow = true;            // off by default (blacks out dark art)
 */
import Phaser from 'phaser';
import { slot } from './variants';
import { theme } from './theme';
import { quality } from './state';
import { ensureNormalMap, material, setMaterials } from './normals';
import { setRim, setShading } from './rim';
import type { MaterialOpts, MaterialSpec } from './material';
import { resolveColor, type ColorKey } from './particles';

export interface LightRig {
  /** false = lighting off, lit objects drawn plain. */
  on: boolean;
  /** Multiplier on the theme's --kit-ambient. */
  ambient: number;
  radius: number;
  intensity: number;
  /** 0..1 intensity wobble. */
  flicker: number;
}

export const lightSlot = slot<LightRig>('lights', {
  dusk: { on: true, ambient: 1, radius: 260, intensity: 1.6, flicker: 0 },
  night: { on: true, ambient: 0.45, radius: 300, intensity: 2.2, flicker: 0.15 },
  day: { on: true, ambient: 3, radius: 220, intensity: 0.8, flicker: 0 },
  off: { on: false, ambient: 1, radius: 0, intensity: 0, flicker: 0 },
});

/** Kinds Phaser can light and that the default covers. */
const isLightable = (o: any): boolean =>
  o instanceof Phaser.GameObjects.Image || o instanceof Phaser.GameObjects.Sprite || o instanceof Phaser.GameObjects.TileSprite;

/** Coloured edge toward the lights (rim.ts), a global strength: each material shapes it (metal tight and bright, wood wide and soft). Soft by default, off on quality low; needs the automatic normal maps. */
export const rimSlot = slot<{ strength: number }>('rim', {
  soft: { strength: 0.6 },
  off: { strength: 0 },
  bright: { strength: 2 },
});

interface LightOpts {
  color?: ColorKey | number;
  radius?: number;
  intensity?: number;
  /** Height above the art as a fraction of the radius (Phaser's own default is 0.1: a small dot on flat ground). Default 0.45: a full pool. */
  height?: number;
}
interface Tracked { light: Phaser.GameObjects.Light; opts: LightOpts; index: number; seed: number }

const scaleColor = (c: number, k: number) => {
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export class LightFx {
  private objs = new Set<Phaser.GameObjects.GameObject>();
  private forced = new WeakSet<object>();
  private optOut = new WeakSet<object>();
  /** Added since the last render: judged at PRE_RENDER, so blend mode and scroll factor set right after `add` count. */
  private fresh = new Set<Phaser.GameObjects.GameObject>();
  private tracked: Tracked[] = [];
  private _auto = true;
  /** Self-shadow on lit objects (also needs quality.shadows). Off by default: its threshold reads the pixel's brightness, so dark art goes black. */
  get selfShadow() {
    return this._selfShadow;
  }
  set selfShadow(on: boolean) {
    this._selfShadow = on;
    this.objs.forEach((o) => this.applyObj(o));
  }
  private _selfShadow = false;

  constructor(private scene: Phaser.Scene) {
    const r = scene.game.renderer as any;
    if (r.type !== Phaser.WEBGL) return;
    const q = quality();
    if (q.bakedLights === null) {
      r.config.maxLights = q.get().lights;
      q.bakedLights = q.get().lights;
    }
    const ev = scene.events;
    ev.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    ev.on(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
    ev.on(Phaser.Scenes.Events.PRE_RENDER, this.judge, this);
    ev.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ev.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
      ev.off(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
      ev.off(Phaser.Scenes.Events.PRE_RENDER, this.judge, this);
    });
    scene.children.list.forEach((o) => this.onAdded(o));
    this.refresh();
  }

  /** Light this object whatever the default rules say. With a material, also `material(obj, spec, opts)` (normals.ts). */
  lit<T extends Phaser.GameObjects.GameObject>(obj: T, spec?: MaterialSpec, opts?: MaterialOpts): T {
    if (spec) material(obj, spec, opts);
    this.forced.add(obj);
    this.track(obj);
    return obj;
  }

  /** Keep this object out of the default (HUD, effect). */
  unlit<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.optOut.add(obj);
    this.objs.delete(obj);
    (obj as any).setLighting?.(false);
    return obj;
  }

  /** false = only `L.lit()` objects are lit. Live: switching on judges every object in the scene again. */
  get auto() {
    return this._auto;
  }
  set auto(on: boolean) {
    if (on === this._auto) return;
    this._auto = on;
    if (on) this.scene.children.list.forEach((o) => this.onAdded(o));
    else
      for (const o of [...this.objs]) {
        if (this.forced.has(o)) continue;
        this.objs.delete(o);
        (o as any).setLighting?.(false);
      }
  }

  private track(obj: Phaser.GameObjects.GameObject) {
    if (!this.objs.has(obj)) {
      this.objs.add(obj);
      obj.once(Phaser.GameObjects.Events.DESTROY, () => this.objs.delete(obj));
    }
    this.applyObj(obj);
    const tex = (obj as any).texture as Phaser.Textures.Texture | undefined;
    if (tex) ensureNormalMap(tex);
  }

  private onAdded(o: Phaser.GameObjects.GameObject) {
    if (this._auto && isLightable(o)) this.fresh.add(o);
  }

  private judge() {
    if (!this.fresh.size) return;
    for (const o of this.fresh) {
      const x = o as any;
      if (!o.scene || this.optOut.has(o) || this.objs.has(o)) continue;
      if (x.blendMode !== Phaser.BlendModes.NORMAL || (x.scrollFactorX === 0 && x.scrollFactorY === 0)) continue;
      this.track(o);
    }
    this.fresh.clear();
  }

  add(x: number, y: number, opts: LightOpts = {}) {
    const light = this.scene.lights.addLight(x, y, 100);
    const t: Tracked = { light, opts, index: this.tracked.length, seed: Math.random() * 1000 };
    this.tracked.push(t);
    this.applyLight(t);
    return light;
  }

  remove(light: Phaser.GameObjects.Light) {
    this.scene.lights.removeLight(light);
    this.tracked = this.tracked.filter((t) => t.light !== light);
  }

  /** Lights drawn / cap / requested. */
  stats() {
    const lm = this.scene.lights as any;
    return { drawn: lm.visibleLights ?? 0, cap: lm.maxLights, lights: this.tracked.length, baked: quality().bakedLights, litObjects: this.objs.size };
  }

  /** Re-apply variant, theme and quality (the kit calls this on change). */
  refresh() {
    const rig = lightSlot.value;
    const q = quality();
    const lm = this.scene.lights;
    (lm as any).maxLights = Math.min(q.get().lights, q.bakedLights ?? q.get().lights);
    if (rig.on) lm.enable();
    else lm.disable();
    lm.setAmbientColor(scaleColor(theme().c.ambient, rig.ambient));
    const level = q.get().level;
    const rich = rig.on && level !== 'low';
    setMaterials({ orm: level === 'high' }); // the high-quality material texture; rebuilds the maps when it changes
    setShading(this.scene.game, !rich ? 'plain' : level === 'high' ? 'orm' : 'material');
    setRim(this.scene.game, rich ? rimSlot.value.strength : 0);
    this.objs.forEach((o) => this.applyObj(o));
    this.tracked.forEach((t) => this.applyLight(t));
  }

  private applyObj(o: any) {
    if (!o.scene) return;
    o.setLighting?.(lightSlot.value.on);
    o.setSelfShadow?.(this._selfShadow && quality().get().shadows);
  }

  private applyLight(t: Tracked) {
    const rig = lightSlot.value;
    const th = theme();
    t.light.setColor(resolveColor(th, t.opts.color, th.fx[t.index % th.fx.length]));
    t.light.setRadius(t.opts.radius ?? rig.radius);
    t.light.setZNormal(t.opts.height ?? 0.45);
    t.light.setIntensity(t.opts.intensity ?? rig.intensity);
    t.light.setVisible(rig.on);
  }

  private tick(time: number) {
    const rig = lightSlot.value;
    if (!rig.on || !rig.flicker) return;
    for (const t of this.tracked) {
      const base = t.opts.intensity ?? rig.intensity;
      const w = Math.sin(time * 0.013 + t.seed) * 0.6 + Math.sin(time * 0.031 + t.seed * 2) * 0.4;
      t.light.setIntensity(base * (1 + rig.flicker * w));
    }
  }
}

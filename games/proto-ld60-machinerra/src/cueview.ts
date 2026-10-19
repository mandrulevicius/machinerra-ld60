/**
 * World cues and engravings (`docs/onboarding.md`; `sim/onboard.ts` holds them): an icon under a thing to take, or a control
 * (an input action in the player's current binding) cut into the floor or a wall.
 * - The first cue not taken glows: an amber light on the carving that breathes. The rest wait, dim and still (`WAIT`), so only
 *   one thing asks for attention at a time (Minos).
 * - A taken cue's glow dies down over `FADE` s into an engraving, which is then stamped into the ground's mark layer
 *   (`w.marks`, permanent, no cost per frame) and stays. A wall cue stays upright, as a live sprite.
 * - Carved, not floating: the picture is a dark relief with a pale lip on its lower edge, flattened on the floor like everything
 *   that lies on the ground; its colours come from the picture, dimmed by the dark tint.
 * Add a kind of cue: a field on `Cue` and a case in `parts`.
 */
import Phaser from 'phaser';
import { keyLabel } from '../../../harness/kit';
import { texOf } from './iconkey';
import { ring, ViewBase, type G, type PlayHost } from './playhost';
import type { CueRT, OnboardEvent } from './sim/onboard';
import type { SimEvent } from './sim/sim';

type Img = Phaser.GameObjects.Image;

/** Looks and timing (guesses): `box` the longest side of a carved picture in px, `flat` how much a floor engraving is squashed, `fade` seconds from glow to engraving. */
export const CARVE = { box: 52, key: 44, flat: 0.62, fade: 1.2, halo: 96, ring: 40, depth: -8.9 };
/** Tints and alphas: the carving (dark relief, pale lip), the glow's colour, and how a waiting cue shows. */
export const TONE = { dark: 0x2a1c12, lip: 0xf0e0b8, glow: 0xffd070, body: 0.9, lip_a: 0.3, wait: 0.35, baked: 0.78 };

const mix = (a: number, b: number, k: number) => {
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.IntegerToColor(a), Phaser.Display.Color.IntegerToColor(b), 100, Math.round(k * 100));
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
};

interface Part {
  tex: { key: string; frame?: string };
  /** Offset from the cue's point (px) and the display scale. */
  dx: number;
  scale: number;
  lip: Img;
  body: Img;
  /** The same picture filled with light, added over the body while the cue glows. */
  lit: Img;
}
interface Live {
  cue: CueRT;
  parts: Part[];
  halo: Img;
  /** Seconds since it was taken. */
  age: number;
  baked: boolean;
  /** The binding label its key part shows (a rebind redraws it). */
  label: string;
}

export class CueView extends ViewBase {
  private lives = new Map<number, Live>();

  constructor(host: PlayHost) {
    super(host);
    for (const c of this.sim.onboard.cues) this.add(c);
  }

  event(e: SimEvent) {
    if (e.e !== 'cue') return;
    this.cueEvent(e);
  }

  private cueEvent(e: Extract<OnboardEvent, { e: 'cue' }>) {
    if (e.what === 'new') this.add(e.cue);
    else {
      const l = this.lives.get(e.cue.id) ?? this.add(e.cue);
      if (!l.baked) {
        this.sfx('click', e.cue.x, e.cue.y, { gain: 0.5 });
        this.k.fx.burst(e.cue.x, e.cue.y, { color: 0xc8a060, size: 0.3 });
      }
    }
  }

  /** The textures a cue is carved from: its picture and, for a key, the keycap with the binding. */
  private parts(c: CueRT, label: string): { tex: { key: string; frame?: string }; w: number; h: number; scale: number }[] {
    const out: { tex: { key: string; frame?: string }; w: number; h: number; scale: number }[] = [];
    const pic = texOf(this.scene, c.icon);
    if (pic) {
      const f = this.scene.textures.getFrame(pic.key, pic.frame);
      out.push({ tex: pic, w: f.width, h: f.height, scale: CARVE.box / Math.max(f.width, f.height) });
    }
    if (c.key) {
      const k = keycap(this.scene, label);
      out.push({ tex: { key: k.key }, w: k.w, h: k.h, scale: CARVE.key / k.h });
    }
    return out;
  }

  private add(c: CueRT): Live {
    const live = this.lives.get(c.id);
    if (live) return live;
    const l: Live = { cue: c, parts: [], halo: this.halo(c), age: 0, baked: false, label: c.key ? keyLabel(c.key) : '' };
    this.lives.set(c.id, l);
    this.build(l);
    if (c.taken) this.bake(l);
    return l;
  }

  private halo(c: CueRT) {
    const h = this.scene.add.image(c.x, c.y, 'world-soft').setDepth(CARVE.depth - 0.05).setBlendMode(Phaser.BlendModes.ADD).setTint(TONE.glow).setAlpha(0);
    h.setScale(CARVE.halo / h.width, (CARVE.halo / h.width) * (c.wall ? 1 : CARVE.flat));
    this.k.lights.unlit(h);
    return h;
  }

  /** (Re)make the carved images of a cue from its pictures. */
  private build(l: Live) {
    for (const p of l.parts) {
      p.lip.destroy();
      p.body.destroy();
      p.lit.destroy();
    }
    const c = l.cue, sy = c.wall ? 1 : CARVE.flat;
    const sizes = this.parts(c, l.label);
    const gap = 8, total = sizes.reduce((s, p) => s + p.w * p.scale, 0) + gap * Math.max(0, sizes.length - 1);
    let at = -total / 2;
    l.parts = sizes.map((p) => {
      const w = p.w * p.scale, dx = at + w / 2;
      at += w + gap;
      const make = (tint: number, alpha: number, ox: number, oy: number, depth: number) =>
        this.scene.add.image(c.x + dx + ox, c.y + oy, p.tex.key, p.tex.frame).setScale(p.scale, p.scale * sy).setTint(tint).setAlpha(alpha).setDepth(depth);
      // The lip first, a hair down and right of the body: the pale edge a cut leaves.
      const lip = make(TONE.lip, TONE.lip_a, 1, 1.6, CARVE.depth - 0.02);
      const body = make(TONE.dark, TONE.wait, 0, 0, CARVE.depth);
      this.k.lights.unlit(lip);
      const lit = make(TONE.glow, 0, 0, 0, CARVE.depth + 0.02).setTintMode(Phaser.TintModes.FILL).setBlendMode(Phaser.BlendModes.ADD);
      this.k.lights.unlit(lit);
      return { tex: p.tex, dx, scale: p.scale, lip, body, lit };
    });
  }

  /** The glow is gone: stamp the carving into the ground (a wall's stays a sprite) and drop the live images. */
  private bake(l: Live) {
    l.baked = true;
    l.halo.destroy();
    const c = l.cue;
    if (c.wall) {
      for (const p of l.parts) p.lit.destroy();
      for (const p of l.parts) p.body.setTint(TONE.dark).setAlpha(TONE.baked);
      for (const p of l.parts) p.lip.setAlpha(TONE.lip_a);
      return;
    }
    for (const p of l.parts) {
      const o = { frame: p.tex.frame, scaleX: p.scale, scaleY: p.scale * CARVE.flat, kind: false as const };
      this.w.marks.stamp(p.tex.key, c.x + p.dx + 1, c.y + 1.6, { ...o, tint: TONE.lip, alpha: TONE.lip_a });
      this.w.marks.stamp(p.tex.key, c.x + p.dx, c.y, { ...o, tint: TONE.dark, alpha: TONE.baked });
      p.lip.destroy();
      p.body.destroy();
      p.lit.destroy();
    }
    l.parts = [];
  }

  update(dt: number, g: G) {
    const ob = this.sim.onboard, glowing = ob.glowing, t = this.scene.time.now / 1000;
    for (const l of this.lives.values()) {
      if (l.baked) continue;
      const c = l.cue;
      // A key cue follows a rebinding (or the pad): its keycap is redrawn when the label changes.
      if (c.key && !c.taken) {
        const label = keyLabel(c.key);
        if (label !== l.label) {
          l.label = label;
          this.build(l);
        }
      }
      let glow: number; // 0 dark carving .. 1 lit
      if (c.taken) {
        l.age += dt;
        glow = 1 - Math.min(1, l.age / CARVE.fade);
        if (l.age >= CARVE.fade) {
          this.bake(l);
          continue;
        }
      } else glow = c === glowing ? 0.6 + 0.4 * Math.sin(t * 3.4) : 0;
      const live = c.taken || c === glowing;
      const alpha = c.taken ? TONE.baked + (1 - TONE.baked) * glow : live ? TONE.body : TONE.wait;
      for (const p of l.parts) {
        p.body.setTint(mix(TONE.dark, TONE.glow, glow)).setAlpha(alpha);
        p.lit.setAlpha(live ? 0.7 * glow : 0);
      }
      l.halo.setAlpha(live ? (c.taken ? 0.6 * glow : 0.35 + 0.2 * glow) : 0);
      // A turning ring on the ground, as the lift's and the places' (`playhost.ts` `ring`): the amber that says "here" on sand and stone alike.
      if (live) ring(g, c.x, c.y, CARVE.ring + 6 * glow, TONE.glow, 0.25 + 0.65 * glow, this.scene.time.now, c.wall ? 1 : CARVE.flat);
    }
  }

  debug() {
    return { cues: [...this.lives.values()].map((l) => ({ id: l.cue.id, at: [Math.round(l.cue.x), Math.round(l.cue.y)], baked: l.baked, glowing: this.sim.onboard.glowing === l.cue })) };
  }

  destroy() {
    for (const l of this.lives.values()) {
      l.halo.destroy();
      for (const p of l.parts) {
        p.lip.destroy();
        p.body.destroy();
        p.lit.destroy();
      }
    }
    this.lives.clear();
  }
}

/** A keycap with the binding on it as a texture (`cuekey-<label>`, white on clear: the view tints it), made once per label; `w`, `h` its frame's size. */
function keycap(scene: Phaser.Scene, label: string): { key: string; w: number; h: number } {
  const key = `cuekey-${label}`, h = 56, fs = 30;
  const ctx0 = document.createElement('canvas').getContext('2d')!;
  ctx0.font = `700 ${fs}px "Barlow Semi Condensed", "Arial Narrow", sans-serif`;
  const w = Math.max(60, Math.ceil(ctx0.measureText(label).width) + 30);
  if (!scene.textures.exists(key)) {
    const c = document.createElement('canvas');
    c.width = w * 2;
    c.height = h * 2;
    const ctx = c.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.fillStyle = ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(3, 3, w - 6, h - 12, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(3, h - 12, w - 6, 9, [0, 0, 8, 8]);
    ctx.fill();
    ctx.font = ctx0.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, (h - 12) / 2 + 2);
    scene.textures.addCanvas(key, c);
  }
  return { key, w: w * 2, h: h * 2 };
}

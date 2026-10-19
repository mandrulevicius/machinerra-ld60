/**
 * `kit(scene)`: the kit bound to one scene. Parts are created on first use, follow every variant/theme/quality
 * change, and are cleaned up at scene shutdown (scene instances are reused on restart).
 */
import Phaser from 'phaser';
import { onAnyVariant } from './variants';
import { theme, loadFonts, themeFonts, type Theme } from './theme';
import { quality } from './state';
import type { QualitySettings } from './quality';
import { ParticleFx, resolveColor, type ColorKey } from './particles';
import { LightFx } from './lights';
import { Juice } from './juice';
import { addLook, type LookFilter } from './look';
import { audioFor, type Audio } from './audio';

export interface TextOpts {
  font?: 'display' | 'body';
  size?: number;
  color?: ColorKey | 'text' | 'textDim';
  /** Extra Phaser text style. */
  style?: Phaser.Types.GameObjects.Text.TextStyle;
}

export interface SceneKit {
  readonly theme: Theme;
  readonly quality: QualitySettings;
  readonly fx: ParticleFx;
  /** Create in create() before any lit object renders (it sets the light cap). */
  readonly lights: LightFx;
  readonly juice: Juice;
  /** The game's music director, sfx and volumes (one per game; music keeps playing across scenes). */
  readonly audio: Audio;
  /** Screen-look filter on the main camera. */
  look(): LookFilter;
  /** Camera background from the theme's --kit-bg, kept in sync. */
  background(): void;
  /** Phaser Text in the theme's font and colour; restyled on theme change (after the new font loads). */
  text(x: number, y: number, str: string, opts?: TextOpts): Phaser.GameObjects.Text;
  /** Called after any variant, theme or quality change, after the kit's own parts updated. */
  onChange(fn: (what: string) => void): void;
}

const bound = new WeakMap<Phaser.Scene, SceneKit>();

export function kit(scene: Phaser.Scene): SceneKit {
  const existing = bound.get(scene);
  if (existing) return existing;

  let fx: ParticleFx | null = null;
  let lights: LightFx | null = null;
  let juice: Juice | null = null;
  let lookF: LookFilter | null = null;
  let bg = false;
  const texts: [Phaser.GameObjects.Text, TextOpts][] = [];
  const listeners: ((what: string) => void)[] = [];

  const styleText = (t: Phaser.GameObjects.Text, o: TextOpts) => {
    const th = theme();
    const c = o.color === 'text' || o.color === 'textDim' ? th.c[o.color] : resolveColor(th, o.color, th.c.text);
    t.setFontFamily(th.font[o.font ?? 'display']).setColor(`#${c.toString(16).padStart(6, '0')}`);
    t.style.update(true); // re-measure with the new font (Text probe: updateText alone keeps old metrics)
  };

  const changed = (what: string) => {
    if (fx) fx.refresh();
    if (lights) lights.refresh();
    if (lookF) lookF.refresh();
    if (bg) scene.cameras.main.setBackgroundColor(theme().c.bg);
    if (what === 'theme' && texts.length) {
      loadFonts(themeFonts()).then(() => texts.forEach(([t, o]) => t.scene && styleText(t, o)));
    }
    listeners.forEach((f) => f(what));
  };
  const offVariant = onAnyVariant(changed);
  const offQuality = quality().on(() => changed('quality'));

  const k: SceneKit = {
    get theme() {
      return theme();
    },
    get quality() {
      return quality().get();
    },
    get fx() {
      return (fx ??= new ParticleFx(scene));
    },
    get lights() {
      return (lights ??= new LightFx(scene));
    },
    get juice() {
      return (juice ??= new Juice(scene));
    },
    get audio() {
      return audioFor(scene.game);
    },
    look() {
      return (lookF ??= addLook(scene.cameras.main) as LookFilter);
    },
    background() {
      bg = true;
      scene.cameras.main.setBackgroundColor(theme().c.bg);
    },
    text(x, y, str, opts = {}) {
      const t = scene.add.text(x, y, str, { fontSize: `${opts.size ?? 32}px`, ...opts.style });
      styleText(t, opts);
      texts.push([t, opts]);
      return t;
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };

  bound.set(scene, k);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    offVariant();
    offQuality();
    fx?.destroy();
    bound.delete(scene);
  });
  return k;
}

/**
 * Theme: the CSS theme files (harness/ui/tokens.css, themes/samples/*.css, a game's own theme.css + kit/theme.css) are the one source; this reads them for Phaser.
 *
 *   themeSlot.set('pixel')     sets <html data-theme> (the DOM UI restyles by CSS) and notifies listeners
 *   theme()                    current tokens as Phaser values: theme().c.accent (0xRRGGBB), .line, .font.display, .motion()
 *
 * A game's own theme: games/<name>/src/theme.css with --ui-* and --kit-* tokens under [data-theme="<name>"], imported in
 * main.ts, then `themeSlot.add('<name>', '<name>')` before bootGame (recipe in harness/ui/README.md).
 */
import '../ui';
import './theme.css';
import { slot } from './variants';

// greybox (the tokens.css defaults) first, so it is the default; clean/pixel/fantasy are samples, not styles to copy.
export const themeSlot = slot('theme', { greybox: 'greybox', clean: 'clean', pixel: 'pixel', fantasy: 'fantasy' });

export interface Motion {
  duration: number;
  ease: string;
  easeParams?: number[];
}

export interface Theme {
  name: string;
  /** Colours as 0xRRGGBB. */
  c: {
    bg: number; ink: number; paper: number; ambient: number;
    accent: number; good: number; warn: number; danger: number;
    text: number; textDim: number; surface: number; border: number;
  };
  /** Effect palette (particles, lights), 3 colours. */
  fx: number[];
  /** Line-art stroke width, game px. */
  line: number;
  /** UI border width and corner radius, game px. */
  bw: number;
  radius: number;
  /** CSS font-family lists, usable as Phaser Text fontFamily. */
  font: { body: string; display: string };
  /** Tween settings from the theme's --ui-t-* and --ui-ease: `tweens.add({ targets, x, ...theme().motion() })`. */
  motion(speed?: 'fast' | 'med'): Motion;
  /** Any token, raw: css('--ui-c-accent'). */
  css(token: string): string;
}

let ctx: CanvasRenderingContext2D | null = null;
/** Any CSS colour to 0xRRGGBB (alpha dropped). */
export function cssColor(value: string): number {
  ctx ??= document.createElement('canvas').getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillStyle = value;
  const s = String(ctx.fillStyle);
  if (s.startsWith('#')) return parseInt(s.slice(1, 7), 16);
  const [r, g, b] = s.match(/[\d.]+/g)!.map(Number);
  return (r << 16) | (g << 8) | b;
}

/** CSS timing function to a Phaser ease. */
export function cssEase(value: string): Pick<Motion, 'ease' | 'easeParams'> {
  const steps = value.match(/steps\((\d+)/);
  if (steps) return { ease: 'Stepped', easeParams: [Number(steps[1])] };
  const map: Record<string, string> = { linear: 'Linear', 'ease-in': 'Quad.easeIn', 'ease-out': 'Quad.easeOut', 'ease-in-out': 'Sine.easeInOut', ease: 'Sine.easeInOut' };
  return { ease: map[value] ?? 'Quad.easeOut' };
}

let cached: Theme | null = null;
// Every way of switching (setTheme, setVariant, the panel, applyVariants) goes through the slot.
themeSlot.on(applyThemeAttr);

export function theme(): Theme {
  if (cached && cached.name === themeSlot.name) return cached;
  const style = getComputedStyle(document.documentElement);
  const css = (t: string) => style.getPropertyValue(t).trim();
  const col = (t: string) => cssColor(css(t));
  const px = (t: string) => parseFloat(css(t)) || 0;
  const ms = (t: string) => (css(t).endsWith('ms') ? parseFloat(css(t)) : parseFloat(css(t)) * 1000) || 0;
  const ease = cssEase(css('--ui-ease'));
  cached = {
    name: themeSlot.name,
    c: {
      bg: col('--kit-bg'), ink: col('--kit-ink'), paper: col('--kit-paper'), ambient: col('--kit-ambient'),
      accent: col('--ui-c-accent'), good: col('--ui-c-good'), warn: col('--ui-c-warn'), danger: col('--ui-c-danger'),
      text: col('--ui-c-scene-text'), textDim: col('--ui-c-scene-text-dim'), surface: col('--ui-c-surface'), border: col('--ui-c-border'),
    },
    fx: [col('--kit-fx-1'), col('--kit-fx-2'), col('--kit-fx-3')],
    line: px('--kit-line'),
    bw: px('--ui-bw'),
    radius: px('--ui-radius'),
    font: { body: css('--ui-font-body'), display: css('--ui-font-display') },
    motion: (speed = 'med') => ({ duration: ms(`--ui-t-${speed}`), ...ease }),
    css,
  };
  return cached;
}

/** First family of a CSS font-family list, unquoted; null for generic families. */
const firstFamily = (list: string) => {
  const f = list.split(',')[0].trim().replace(/^["']|["']$/g, '');
  return /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+|-apple-system)$/.test(f) ? null : f;
};

/**
 * Wait until web fonts are usable by Phaser Text (which never redraws when a font arrives late).
 * Resolves false on timeout (offline): the game still starts, with fallback fonts.
 * `text`: letters beyond basic Latin the game shows (Google serves fonts in unicode-range parts).
 */
export async function loadFonts(families: string[], text?: string, timeoutMs = 3000): Promise<boolean> {
  const names = [...new Set(families.map(firstFamily).filter((f): f is string => !!f))];
  const end = performance.now() + timeoutMs;
  const ready = async (f: string) => {
    // document.fonts.load resolves [] while the @font-face rules aren't parsed yet (the CSS @import is async): retry.
    while (performance.now() < end) {
      const got = await document.fonts.load(`16px "${f}"`, text).catch(() => []);
      if (got.length) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  };
  const all = Promise.all(names.map(ready)).then((r) => r.every(Boolean));
  return Promise.race([all, new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs + 100))]);
}

/** Fonts the current theme uses. */
export const themeFonts = () => [theme().font.body, theme().font.display];

/** Make <html data-theme> match the slot. Runs on every theme change; call once at start. */
export function applyThemeAttr() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = themeSlot.value;
  cached = null;
}

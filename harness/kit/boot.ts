/**
 * Game boot: everything a jam game needs before its first scene, from the lab findings.
 *
 *   bootGame({ id: 'mygame', scenes: { Play }, start: 'Play', variants: { theme: 'pixel', ... } });
 *
 * Order: kit state (variants: URL > `variants` > defaults; quality from save, `?q=`) -> theme fonts loaded (Phaser Text
 * never redraws when a font arrives late) -> new Phaser.Game with render.maxLights = quality.lights and
 * fullscreenTarget = the parent div (a failed fullscreen request otherwise breaks the next one) -> at READY: bridge,
 * UI (#ui), key capture (Space/arrows must not scroll the itch page), input actions (input.ts), scenes added (not in the config: Phaser would
 * auto-start the first one before the UI exists and ignore ?scene=), dev sidebar in dev builds or with ?dev=1,
 * then the title screen (title.ts; New game starts `start`). The first click or key anywhere focuses the page (the itch
 * iframe needs it for keys) and unlocks audio. The game menu (Esc, menus.ts) is installed unless `gameMenu: false`.
 * Dev builds wait for the bridge's dev modules (hot reload, harness/hot) before scenes are added.
 * `?scene=Key` skips the title (agents and play-testing) and starts that scene with the other params as data.
 * Prototypes (served from games/proto-*) skip the title by default but keep the game menu.
 * Audio: `audioFor(game)` is created here (volumes from the save); `audio` option files are fetched and decoded before the
 * first scene (a decode works while the context is still locked); the first click or key unlocks the context.
 */
import Phaser from 'phaser';
import { installBridge, startScene } from '../bridge';
import { mountUI } from '../ui';
import { initKit, quality } from './state';
import { exportVariants, setVariant } from './variants';
import { loadFonts, theme, themeFonts, themeSlot } from './theme';
import { mountSidebar } from './sidebar';
import { audioFor, type AudioManifest } from './audio';
import { exportTunes, setTune, syncTunesToUrl, type TuneValue } from './tune';
import { createMenus, TITLE_SCENE } from './menus';
import { createInput } from './input';
import KitTitle from './title';
import type { SaveHooks, SysOptions, TitleArt } from './menu-parts';

export interface BootOptions {
  /** Save key prefix; one per game. */
  id: string;
  scenes: Record<string, typeof Phaser.Scene>;
  /** Scene to start (`?scene=` overrides). */
  start: string;
  /** The chosen variants, as exported by the dev sidebar. */
  variants?: Record<string, string>;
  /** The chosen tuning values, as exported by the dev sidebar (tune.ts). */
  tunes?: Record<string, TuneValue>;
  /** The game's name: heading of the title screen and the game menu. */
  name?: string;
  width?: number;
  height?: number;
  /** Merged into the Phaser config (physics, pixelArt, ...). */
  config?: Phaser.Types.Core.GameConfig;
  /** Keys whose browser default (page scroll) is blocked. */
  capture?: string;
  /** Letters beyond basic Latin the game's text uses, so their font subsets load (e.g. 'ąčęėįšųūž'). */
  glyphs?: string;
  /** Dev sidebar: default on in `vite` dev, off in builds unless ?dev=1. */
  panel?: boolean;
  /**
   * Show the title screen at boot and let the game menu return to it. Default true; false for prototypes
   * (pages under /games/proto-*) and the lab, which then start straight in `start`.
   */
  titleScreen?: boolean;
  /** Esc opens the game menu (pauses the scenes). Default true; the lab turns it off. */
  gameMenu?: boolean;
  /** Opt in to saving: the menus then show Save, Load and Continue. See SaveHooks in menu-parts.ts. */
  save?: SaveHooks;
  /** Lines for the title's Credits screen (none: no Credits entry). */
  credits?: string[];
  /** The game's own settings tabs (after Controls, in Options and the game menu) and extra buttons in the game menu's Main tab (SysOptions in menu-parts.ts). */
  tabs?: SysOptions['tabs'];
  menuItems?: SysOptions['menuItems'];
  /** The game's own title background and its leave animation (TitleArt in menu-parts.ts); default the kit's hills. */
  titleArt?: TitleArt;
  /**
   * Input actions with their default bindings: `{ jump: ['SPACE', 'W', 'PAD_A'] }` (tokens: bindings.ts). Players rebind them in
   * the menus' Controls tab (no actions: no tab). Read with `inputFor(scene)` (input.ts).
   */
  actions?: Record<string, string[]>;
  /** Axes over two actions: `{ moveX: ['left', 'right'] }` gives `input.axis('moveX')`. */
  axes?: Record<string, [string, string]>;
  /** Music and sfx files under `games/<name>/public/audio/` (layout: audio.ts), loaded before the first scene. */
  audio?: AudioManifest;
}

export async function bootGame(o: BootOptions): Promise<Phaser.Game> {
  const params = new URLSearchParams(location.search);
  initKit({ id: o.id, variants: o.variants, tunes: o.tunes });
  await loadFonts(themeFonts(), o.glyphs);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    banner: false,
    parent: 'game',
    width: o.width ?? 1280,
    height: o.height ?? 720,
    dom: { createContainer: true },
    backgroundColor: theme().c.bg, // kit(scene).background() keeps a scene's camera in sync on theme change
    ...o.config,
    render: { maxLights: quality().get().lights, ...o.config?.render },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, fullscreenTarget: 'game', ...o.config?.scale },
  });
  quality().bakedLights = game.config.maxLights;

  installBridge(game);
  const g = (window as any).__game;
  g.kit = { variants: exportVariants, set: setVariant, tunes: exportTunes, tune: (k: string, v: unknown) => { const ok = setTune(k, v); syncTunesToUrl(); return ok; }, quality: () => quality().get(), setQuality: (p: object) => quality().set(p) };
  const start = startScene(o.start);

  await new Promise<void>((ok) => game.events.once(Phaser.Core.Events.READY, ok));
  await g.whenReady(); // dev: hot reload (harness/hot) notes every loader file, so it must be in place before a scene loads
  const ui = mountUI(game, themeSlot.value);
  game.registry.set('ui', ui);
  if (o.capture !== '') game.input.keyboard?.addCapture(o.capture ?? 'SPACE,UP,DOWN,LEFT,RIGHT');
  const input = o.actions ? createInput(game, o.id, { actions: o.actions, axes: o.axes }) : null;
  if (input) g.kit.input = { state: () => input.debugState(), rebind: input.rebind.bind(input), reset: input.reset.bind(input) };
  const audio = audioFor(game, o.id);
  g.kit.audio = audio;
  if (o.audio) await audio.load(o.audio);
  for (const [key, cls] of Object.entries(o.scenes)) game.scene.add(key, cls);
  if (o.panel ?? (import.meta.env.DEV || params.get('dev') === '1')) mountSidebar(game, { open: params.get('dev') === '1' });

  // Phaser also unlocks audio on the first gesture; resuming here makes it explicit, and window.focus() makes the itch iframe take keys.
  const unlock = () => {
    window.focus();
    (game.sound as any).context?.resume?.().catch(() => {});
  };
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlock, { once: true, capture: true });

  const titleOn = o.titleScreen ?? !/\/games\/proto-/.test(location.pathname);
  const menus = createMenus(game, { title: o.name ?? document.title, save: o.save, credits: o.credits, titleArt: o.titleArt, tabs: o.tabs, menuItems: o.menuItems }, {
    id: o.id, titleScreen: titleOn, gameMenu: o.gameMenu ?? true, start,
  });
  game.registry.set('kit:menus', menus);
  g.kit.menu = { open: menus.open, close: menus.close, isOpen: menus.isOpen, toTitle: menus.toTitle, state: () => ({ playing: menus.playing, saves: menus.store?.list() ?? null }) };
  game.scene.add(TITLE_SCENE, KitTitle);
  if (titleOn && !params.has('scene')) game.scene.start(TITLE_SCENE);
  else menus.newGame(true); // no cover: a hidden tab never steps the frames it waits on
  return game;
}

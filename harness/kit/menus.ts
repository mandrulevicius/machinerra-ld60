/**
 * The menus a game gets from `bootGame`: the controller (new game, continue, load, back to the title) and the in-game
 * menu. Esc opens it and pauses the game's scenes (unless an `onEscape` handler consumes it first, escape.ts); while it is open, Esc goes to the menu (back a level, then close) before any `onEscape` handler; tabs: Main (buttons only: Resume, the game's `menuItems`, Save/Load
 * when the game registered save hooks, then Exit to title), Audio, Graphics, Controls (when the game declares actions), then the game's own `tabs`.
 * Volume and quality live in the Audio and Graphics tabs and on the title screen; they go through the kit's audio and quality, which persist per game.
 * Esc is left alone while the level editor is on or a text field has focus. The title screen is title.ts.
 * The first time play starts in a page load, a small Esc hint shows top-right for 4 s.
 */
import type Phaser from 'phaser';
import { createSaveStore, type SaveStore } from './savefiles';
import { audioFor } from './audio';
import { transition } from './transition';
import { enableEscAlt, escAltWorks, escapeOnFullscreenExit, ESC_ALT, runEscape, sendEscape } from './escape';
import {
  audioTab, controlsTab, el, focusFirst, gameInput, graphicsTab, navKeys, panelShell, savesView, sysLayer, tabs, typing, type SysOptions,
} from './menu-parts';

export const TITLE_SCENE = 'KitTitle';

export interface MenuConfig {
  /** The game id (save key prefix). */
  id: string;
  /** Show the title screen at boot, and return to it from the game menu. */
  titleScreen: boolean;
  /** Esc opens the game menu (and shows its hint at the start of play). */
  gameMenu: boolean;
  /** The scene to start for "New game". */
  start: { key: string; data: object };
}

/** `game.registry.get('kit:menus')`; `__game.kit.menu` has open/close/isOpen/playing. */
export interface Menus {
  readonly opts: SysOptions;
  readonly cfg: MenuConfig;
  readonly store: SaveStore | null;
  /** A scene other than the title is running or paused (so `goto` and `?scene=` count too). */
  readonly playing: boolean;
  /** Starts `cfg.start` with a transition; `instant` starts it at once (the boot path). */
  newGame(instant?: boolean): void;
  continueGame(): void;
  load(slot: number): void;
  toTitle(): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

const editorOn = () => !!(window as any).__game?.editor?.editing?.();
let hinted = false; // per page load: the Esc hint shows once

export function createMenus(game: Phaser.Game, opts: SysOptions, cfg: MenuConfig): Menus {
  const hooks = opts.save;
  const store = hooks ? (hooks.store ?? createSaveStore(cfg.id, hooks.count ?? 3)) : null;
  const layer = sysLayer(game);
  let panel: { root: HTMLElement; scenes: Phaser.Scene[]; back: () => void } | null = null;
  let note = '';

  const gameScenes = () => game.scene.getScenes(true).filter((s) => s.scene.key !== TITLE_SCENE);

  const m: Menus = {
    opts, cfg, store,
    get playing() {
      return game.scene.getScenes(false).some((s) => s.scene.key !== TITLE_SCENE && (s.sys.isActive() || s.sys.isPaused()));
    },
    newGame(instant = false) {
      if (instant) {
        game.scene.start(cfg.start.key, cfg.start.data);
        showHint();
      } else transition(game, cfg.start.key, cfg.start.data, { onDone: showHint });
    },
    continueGame() {
      const i = store?.latest() ?? -1;
      if (i >= 0) m.load(i);
    },
    load(i) {
      const s = store?.list()[i];
      if (!s || !hooks) return;
      game.scene.stop(TITLE_SCENE);
      showHint();
      hooks.load(s.data, game);
    },
    toTitle() {
      m.close();
      audioFor(game).stopAll();
      transition(game, TITLE_SCENE);
    },
    open() {
      if (panel || !cfg.gameMenu || !m.playing || editorOn() || typing()) return;
      const scenes = gameScenes();
      scenes.forEach((s) => s.scene.pause());
      const shell = panelShell(opts.title);
            navKeys(shell.root);
      layer.append(shell.root);
      const p = (panel = { root: shell.root, scenes, back: () => {} });

      const showTabs = () => {
        const entries = [
          { id: 'main', label: 'Main', build: mainTab },
          { id: 'audio', label: 'Audio', build: () => audioTab(game) },
          { id: 'graphics', label: 'Graphics', build: graphicsTab },
          ...(gameInput(game) ? [{ id: 'controls', label: 'Controls', build: () => controlsTab(game) }] : []),
          ...(opts.tabs ?? []),
        ];
        const t = tabs(entries);
        shell.body.replaceChildren(t.root);
        focusFirst(t.root.querySelector('.ui-tabpanel') as HTMLElement);
        p.back = close;
      };
      const showSaves = (mode: 'save' | 'load') => {
        const back = el('<div class="ui-dialog__actions"><button class="ui-btn ui-btn--secondary">Back</button></div>');
        back.querySelector('button')!.onclick = () => ((note = ''), showTabs());
        const view = savesView(store!, mode, (i) => {
          if (mode === 'save') {
            store!.put(i, hooks!.save(game));
            note = `Saved as Save ${i + 1}.`;
            showTabs();
          } else {
            close();
            m.load(i);
          }
        });
        shell.body.replaceChildren(el(`<div class="ui-stack"><p class="ui-text">${mode === 'save' ? 'Save to which slot?' : 'Load which slot?'}</p></div>`), view, back);
        focusFirst(view);
        p.back = () => ((note = ''), showTabs());
      };

      function mainTab(): HTMLElement {
        const root = el('<div class="ui-stack"></div>');
        const item = (id: string, label: string, off = false) => `<li><button class="ui-menu__item" data-id="${id}" ${off ? 'disabled' : ''}>${label}</button></li>`;
        root.innerHTML = `<ul class="ui-menu">${item('resume', 'Resume')}${(opts.menuItems ?? []).map((m) => item(`x:${m.id}`, m.label)).join('')}${hooks && !hooks.auto ? item('save', 'Save') + item('load', 'Load', (store?.latest() ?? -1) < 0) : ''}</ul>
          ${cfg.titleScreen ? `<hr class="ui-sep"><ul class="ui-menu">${item('exit', 'Exit to title')}</ul>` : ''}
          ${note ? `<p class="ui-note">${note}</p>` : ''}`;
        root.addEventListener('click', (e) => {
          const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
          const extra = opts.menuItems?.find((m) => `x:${m.id}` === b?.dataset.id);
          if (extra) return close(), extra.run();
          switch (b?.dataset.id) {
            case 'resume': return close();
            case 'save': return showSaves('save');
            case 'load': return showSaves('load');
            case 'exit':
              // two clicks: the label asks first; leaving the item cancels
              if (b.dataset.sure) return m.toTitle();
              b.dataset.sure = '1';
              b.textContent = 'Click again to exit';
              b.addEventListener('blur', () => { delete b.dataset.sure; b.textContent = 'Exit to title'; }, { once: true });
          }
        });
        return root;
      }

      function close() {
        m.close();
      }
      showTabs();
    },
    close() {
      if (!panel) return;
      gameInput(game)?.cancelListen();
      panel.root.remove();
      panel.scenes.forEach((s) => s.scene.isPaused() && s.scene.resume());
      panel = null;
      note = '';
    },
    isOpen: () => !!panel,
  };

  /** The first start of play in a page load: a key hint top-right, gone after 4 s. */
  function showHint() {
    if (hinted || !cfg.gameMenu) return;
    hinted = true;
    const h = el('<div class="ui-anchor ui-anchor--tr" style="transition: opacity var(--ui-t-med) linear"><span class="ui-hint"><kbd class="ui-key">Esc</kbd> / <kbd class="ui-key">P</kbd> Menu</span></div>');
    layer.append(h);
    setTimeout(() => {
      h.style.opacity = '0';
      setTimeout(() => h.remove(), 300);
    }, 4000);
  }

  if (cfg.gameMenu) {
    enableEscAlt();
    escapeOnFullscreenExit(); // before the Esc listener below: it drops an Esc that comes with the exit it already sent
  }
  // The one Esc listener of the kit (escape.ts): an open menu first, then game handlers, then the menu opens (when the game has one).
  addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || e.repeat || editorOn() || typing()) return;
      const used = panel ? (panel.back(), true) : runEscape() || (cfg.gameMenu && m.playing && (m.open(), true));
      if (used) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
  // P is Esc too (the browser keeps Esc while it leaves fullscreen); a leave of fullscreen counts as one Esc (escape.ts).
  // Both are sent as an Esc keydown, so the listener above and every game listener see one Esc.
  if (cfg.gameMenu) {
    addEventListener(
      'keydown',
      (e) => {
        if (e.code !== ESC_ALT || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || editorOn() || typing()) return;
        if (!escAltWorks(!!gameInput(game)?.bound(ESC_ALT))) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) sendEscape();
      },
      true, // after input.ts's rebinding listener, which comes first and takes the key while a binding waits
    );
  }
  return m;
}

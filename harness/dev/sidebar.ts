/**
 * The dev sidebar: F10 opens it on the right, with Kit, Debug, Editor and Console tabs, and the game's own (`addDevTab`, kit/sidebar.ts).
 * It lives on the page, not in Phaser's DOM container, so the game's scaling, scene UI changes and screenshots
 * (which rasterise the container) never include it. Loaded by `mountSidebar` (kit/sidebar.ts) only when the dev tools are
 * on: the dev server, or `?dev=1`. Agents reach it as `__game.dev`.
 */
import type Phaser from 'phaser';
import './dev.css';
import { kitTab } from './kit-tab';
import { debugTab } from './debug-tab';
import { editorTab } from './editor-tab';
import { consoleTab } from './console-tab';

/** A tab's content. show/hide start and stop anything that refreshes while it is on screen. */
export interface Tab {
  el: HTMLElement;
  show?(): void;
  hide?(): void;
}

const BUILTIN = ['Kit', 'Debug', 'Editor', 'Console'];
type Name = string;
const KEY = 'dev:tab';

export function mountSidebar(game: Phaser.Game, opts: { open?: boolean } = {}) {
  const NAMES: Name[] = [...BUILTIN];
  const side = document.createElement('aside');
  side.className = 'dv';
  side.hidden = true;
  side.innerHTML = `<div class="dv-tabs">${NAMES.map((n) => `<button class="dv-btn" data-tab="${n}">${n}</button>`).join('')}</div><div class="dv-body"></div>`;
  const body = side.querySelector('.dv-body')!;

  const kit = kitTab(game);
  const cons = consoleTab();
  const tabs: Record<Name, Tab> = { Kit: kit, Debug: debugTab(game), Editor: editorTab(() => setOpen(false)), Console: cons };
  const tabsBar = side.querySelector('.dv-tabs')!;
  for (const n of NAMES) {
    tabs[n].el.classList.add('dv-pane');
    tabs[n].el.hidden = true;
    body.appendChild(tabs[n].el);
  }

  let open = false;
  let current: Name = 'Kit';
  try {
    const saved = localStorage.getItem(KEY) as Name;
    if (NAMES.includes(saved)) current = saved;
  } catch {}

  /** The game's own tab (once per name): its button joins the others. */
  const addTab = (name: Name, tab: Tab) => {
    if (tabs[name]) return;
    tabs[name] = tab;
    NAMES.push(name);
    tab.el.classList.add('dv-pane');
    tab.el.hidden = true;
    body.appendChild(tab.el);
    const b = document.createElement('button');
    b.className = 'dv-btn';
    b.dataset.tab = name;
    b.textContent = name;
    tabsBar.appendChild(b);
    let saved = '';
    try {
      saved = localStorage.getItem(KEY) ?? '';
    } catch {}
    if (saved === name) select(name); // the tab left open last time
    else paint();
  };

  const paint = () => {
    side.hidden = !open;
    side.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('dv-on', b.dataset.tab === current));
  };
  const select = (name: Name) => {
    if (open) tabs[current].hide?.();
    tabs[current].el.hidden = true;
    current = name;
    try {
      localStorage.setItem(KEY, name);
    } catch {}
    tabs[current].el.hidden = false;
    if (open) tabs[current].show?.();
    paint();
  };
  const setOpen = (on: boolean) => {
    if (on === open) return;
    open = on;
    paint();
    if (open) tabs[current].show?.();
    else {
      tabs[current].hide?.();
      if (side.contains(document.activeElement)) (document.activeElement as HTMLElement).blur(); // keys go back to the game
    }
  };

  side.addEventListener('click', (e) => {
    const n = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab as Name | undefined;
    if (n) select(n);
  });
  // Clicks on the sidebar must not reach the game, nor keys typed in it (the console, a focused slider);
  // function keys still pass, so F2, F7 and F10 work from inside.
  for (const t of ['pointerdown', 'pointerup', 'wheel'] as const) side.addEventListener(t, (e) => e.stopPropagation());
  for (const t of ['keydown', 'keyup', 'keypress'] as const) side.addEventListener(t, (e) => !/^F\d+$/.test(e.key) && e.stopPropagation());

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'F10') return;
    e.preventDefault();
    setOpen(!open);
  };
  addEventListener('keydown', onKey, true);

  select(current);
  document.body.append(side);
  if (opts.open) setOpen(true);

  const api = {
    open(tab?: Name) {
      if (tab) select(tab);
      setOpen(true);
    },
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    addTab,
    /** Open the console with `> ` ready (F7). */
    note(text = '') {
      api.open('Console');
      cons.note(text);
    },
  };
  (window as any).__game && ((window as any).__game.dev = api);

  return {
    api,
    destroy() {
      removeEventListener('keydown', onKey, true);
      kit.destroy();
      cons.destroy();
      side.remove();
    },
  };
}

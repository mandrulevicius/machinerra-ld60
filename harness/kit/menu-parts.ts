/**
 * DOM parts shared by the title screen and the in-game menu (menus.ts, title.ts): the `#ui-sys` layer, keyboard
 * navigation, and the Audio / Graphics / Controls / Credits / save-file views. Kit classes and tokens only.
 * Lives in `#ui-sys`, beside `#ui`, because scenes rewrite `#ui`.
 */
import type Phaser from 'phaser';
import { quality } from './state';
import { audioFor } from './audio';
import type { QualityTier } from './quality';
import type { SaveStore } from './savefiles';
import type { GameInput } from './input';
import { actionLabel } from './bindings';

/** What a game gives `bootGame` to opt in to saving. */
export interface SaveHooks {
  /** Snapshot of the running game; JSON-serialisable. Called by the menu's Save. */
  save(game: Phaser.Game): unknown;
  /** Resume from a snapshot: start the scene(s) with it (`game.scene.start('Play', data)`). Called by Continue and Load. */
  load(data: any, game: Phaser.Game): void;
  /** Number of save files (default 3). */
  count?: number;
  /** The game's own store (made with `createSaveStore`, one instance, which the game also reads and writes); default: the kit makes one of `count` files. */
  store?: SaveStore;
  /** The game saves itself: the menus offer Continue and New game only, no Save or Load. `save` is then unused. */
  auto?: boolean;
  /** New game erases the save: the title asks to confirm when one exists, then calls this. */
  wipe?(game: Phaser.Game): void;
}

/** What the system screens show; from `bootGame`'s options. */
export interface SysOptions {
  title: string;
  save?: SaveHooks;
  /** One paragraph per line; no Credits entry when empty. */
  credits?: string[];
  /** A small build label in the title's top right corner ("v3 · c8904c9", "dev"); none: nothing shown. */
  version?: string;
  /** The game's own title background in place of the hills (title.ts). */
  titleArt?: TitleArt;
  /** Extra tabs after Controls, in the title's Options and the game menu (a game's own settings). */
  tabs?: { id: string; label: string; build: () => HTMLElement }[];
  /** Extra buttons in the game menu's Main tab, under Resume: the menu closes, then `run`. */
  menuItems?: { id: string; label: string; run: () => void }[];
}

/**
 * A game's title background (`bootGame({ titleArt })`), drawn in place of the hills, mood lights and motes. `draw` runs
 * on create and again when the theme or quality changes; the kit destroys `objects` before redrawing. `leave` plays when
 * Continue or New game is chosen (the menu fades out meanwhile) and calls `go` when done; without it they go at once.
 */
export interface TitleArt {
  draw(scene: Phaser.Scene): {
    objects: Phaser.GameObjects.GameObject[];
    /** Per frame; `px` is the pointer's parallax, -0.5..0.5 across the screen. */
    update?(time: number, delta: number, px: number): void;
    leave?(go: () => void): void;
  };
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

/** `#ui-sys`: the layer for system screens (created once per game, above `#ui`, below the dev sidebar). */
export function sysLayer(game: Phaser.Game): HTMLElement {
  let layer = document.getElementById('ui-sys');
  if (!layer) {
    layer = el('<div id="ui-sys" class="ui-overlay"></div>'); // z-index in components.css
    game.domContainer.appendChild(layer);
  }
  return layer;
}

/** A text field has focus: keys belong to it. */
export function typing(): boolean {
  const a = document.activeElement as HTMLElement | null;
  if (!a) return false;
  if (a.isContentEditable || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') return true;
  return a.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes((a as HTMLInputElement).type);
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled)';

/**
 * Keyboard and mouse for a menu: Up/Down move focus between its controls (a `.ui-choices` group is one stop), Left/Right
 * move between tabs and inside a choices group (a slider keeps them for its value), hovering a control focuses it. Keys stay inside (Phaser's key capture must not eat arrows and Space while a menu is open),
 * except Escape, which the owner handles.
 */
export function navKeys(root: HTMLElement) {
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return;
    e.stopPropagation();
    const t = e.target as HTMLElement;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const stop = (x: HTMLElement) => { // one stop per choices group: the focused button, else the chosen one
        const g = x.closest('.ui-choices');
        return !g || x === t || (!g.contains(t) && x === (g.querySelector('[aria-pressed="true"]') ?? g.firstElementChild));
      };
      const all = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null && x.getAttribute('role') !== 'tab' && stop(x));
      const i = all.indexOf(t);
      const next = all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length];
      next?.focus();
      e.preventDefault();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && t.getAttribute('role') === 'tab') {
      const tabs = [...root.querySelectorAll<HTMLElement>('[role=tab]')];
      const next = tabs[(tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next?.click();
      e.preventDefault();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && t.closest('.ui-choices')) {
      const bs = [...t.closest('.ui-choices')!.querySelectorAll<HTMLElement>('button:not(:disabled)')];
      bs[bs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1)]?.focus();
      e.preventDefault();
    }
  });
  root.addEventListener('keyup', (e) => e.key !== 'Escape' && e.stopPropagation());
  root.addEventListener('mouseover', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.ui-menu__item, .ui-btn');
    if (b && !b.hasAttribute('disabled') && document.activeElement !== b) b.focus({ preventScroll: true });
  });
}

/** Focus a control of `root` (keyboard users land on something): the one marked `data-first`, else the first. */
export const focusFirst = (root: HTMLElement) =>
  (root.querySelector<HTMLElement>('[data-first]:not(:disabled)') ?? root.querySelector<HTMLElement>(`.ui-menu__item:not(:disabled), ${FOCUSABLE}`))?.focus({ preventScroll: true });

/** Re-render a view in place and put focus back on the control that had it (`data-id`). */
export function redraw(root: HTMLElement, draw: () => void) {
  const a = document.activeElement as HTMLElement | null;
  const id = a && root.contains(a) ? a.dataset.id : undefined;
  draw();
  if (id) root.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus({ preventScroll: true });
}

/** An on/off setting: the same row as the others, label left, the kit's toggle right. */
export const toggleRow = (label: string, id: string, on: boolean) =>
  `<label class="ui-field"><span>${esc(label)}</span><span class="ui-toggle"><input type="checkbox" data-id="${id}" aria-label="${esc(label)}" ${on ? 'checked' : ''}><span class="ui-toggle__track"></span></span></label>`;

// ---- audio ----
const VOLUMES = { master: 'Master volume', music: 'Music', sfx: 'Effects' } as const;

/** A plain slider row (Music, Effects). */
export function volumeRow(game: Phaser.Game, key: keyof typeof VOLUMES = 'master'): HTMLElement {
  const a = audioFor(game);
  const v = a.volume[key];
  const row = el(`<label class="ui-field"><span>${VOLUMES[key]}</span><span class="ui-row"><input class="ui-slider" type="range" min="0" max="1" step="0.05" value="${v}" aria-label="${VOLUMES[key]}"><span class="ui-field__value">${Math.round(v * 100)}%</span></span></label>`);
  const input = row.querySelector('input')!;
  const out = row.querySelector('.ui-field__value')!;
  input.addEventListener('input', () => {
    a.set({ [key]: Number(input.value) });
    out.textContent = `${Math.round(Number(input.value) * 100)}%`;
  });
  return row;
}

/**
 * The volume as a triangle (a point at the quiet left, full height at the loud right) filled up to the value, a square handle with a
 * speaker (a muted one at 0) as tall as the triangle under it (so it grows with the volume, never below a minimum) and the percentage above it, moving with it. A range input on top does dragging, clicking and the arrow keys, and names
 * it for screen readers. Saved through the game's audio, like `volumeRow`.
 */
export function volumeRamp(game: Phaser.Game, key: keyof typeof VOLUMES = 'master'): HTMLElement {
  const a = audioFor(game);
  const root = el(`<div class="ui-vol"><span class="ui-vol__pct"></span>
    ${['bed', 'fill', 'edge'].map((c) => `<svg class="ui-vol__ramp ui-vol__${c}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,100 100,0 100,100"/></svg>`).join('')}
    <span class="ui-vol__handle"><span class="ui-icon ui-vol__icon"></span></span>
    <input class="ui-vol__input" type="range" min="0" max="1" step="0.05" aria-label="${VOLUMES[key]}"></div>`);
  const input = root.querySelector('input')!;
  const show = (v: number) => {
    const text = `${Math.round(v * 100)}%`;
    root.style.setProperty('--v', String(v));
    root.querySelector('.ui-vol__pct')!.textContent = text;
    root.dataset.level = v === 0 ? 'mute' : v < 0.5 ? 'low' : 'high';
    input.setAttribute('aria-valuetext', text);
  };
  input.value = String(a.volume[key]);
  show(a.volume[key]);
  input.addEventListener('input', () => {
    a.set({ [key]: Number(input.value) });
    show(Number(input.value));
  });
  return root;
}

export function audioTab(game: Phaser.Game): HTMLElement {
  const a = audioFor(game);
  const root = el('<div class="ui-stack"></div>');
  root.append(el(`<div class="ui-field"><span>${VOLUMES.master}</span></div>`));
  root.lastElementChild!.append(volumeRamp(game));
  (['music', 'sfx'] as const).forEach((k) => root.append(volumeRow(game, k)));
  const mute = el(toggleRow('Mute', 'mute', a.volume.muted));
  mute.querySelector('input')!.addEventListener('change', (e) => a.set({ muted: (e.target as HTMLInputElement).checked }));
  root.append(mute);
  return root;
}

// ---- graphics ----
const LEVEL_LIST: QualityTier[] = ['low', 'medium', 'high'];
const choice = (id: string, label: string, on: boolean) => `<button class="ui-btn ${on ? 'ui-btn--primary' : ''}" data-id="${id}" aria-pressed="${on}">${label}</button>`;

/** Quality level row; clicks go to `levelClick`, then the owner re-renders. `bare` drops the visible label, the buttons alone (the title screen). */
export function qualityRow(bare = false): string {
  const q = quality().get();
  return `<div class="ui-field" role="group" aria-label="Quality">${bare ? '' : '<span>Quality</span>'}<span class="ui-choices">${LEVEL_LIST.map((l) => choice(`level:${l}`, l[0].toUpperCase() + l.slice(1), l === q.level)).join('')}</span></div>`;
}

/** A note when the chosen light cap needs a reload to take effect. */
export const reloadNote = () =>
  quality().needsReload() ? `<p class="ui-note ui-note--warn">More lights need a reload. <button class="ui-btn" data-id="reload" data-act="reload">Reload</button></p>` : '';

/** Handles clicks on `data-id="level:<l>"` and the reload button; returns true when it did. */
export function levelClick(target: HTMLElement): boolean {
  const b = target.closest<HTMLElement>('[data-id]');
  const id = b?.dataset.id ?? '';
  if (id.startsWith('level:')) quality().set({ level: id.slice(6) as QualityTier });
  else if (id === 'reload') location.reload();
  else return false;
  return true;
}

const PARTICLES: [string, number][] = [['Few', 0.4], ['Normal', 1], ['Many', 1.5]];
const LIGHTS = [8, 16, 32];

export function graphicsTab(): HTMLElement {
  const root = el('<div class="ui-stack"></div>');
  const draw = () => {
    const q = quality().get();
    root.innerHTML = `${qualityRow()}
      ${toggleRow('Shadows', 'shadows', q.shadows)}
      ${toggleRow('Glow', 'glow', q.glow)}
      <div class="ui-field"><span>Particles</span><span class="ui-choices">${PARTICLES.map(([n, v]) => choice(`particles:${v}`, n, v === q.particles)).join('')}</span></div>
      <div class="ui-field"><span>Lights</span><span class="ui-choices">${LIGHTS.map((n) => choice(`lights:${n}`, String(n), n === q.lights)).join('')}</span></div>
      ${reloadNote()}`;
  };
  const again = () => redraw(root, draw);
  draw();
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (levelClick(t)) return again();
    const id = t.closest<HTMLElement>('[data-id]')?.dataset.id ?? '';
    const [k, v] = id.split(':');
    if (k === 'particles' || k === 'lights') quality().set({ [k]: Number(v) });
    else return;
    again();
  });
  root.addEventListener('change', (e) => {
    const i = e.target as HTMLInputElement;
    if (i.dataset.id === 'shadows' || i.dataset.id === 'glow') quality().set({ [i.dataset.id]: i.checked });
  });
  return root;
}

// ---- controls, credits, save files ----
/** The game's input actions (`actions` in bootGame), or undefined: then there is no Controls tab. */
export const gameInput = (game: Phaser.Game) => game.registry.get('kit:input') as GameInput | undefined;

/**
 * Controls: every declared action with its bindings; click one, then press the new key or gamepad button (Esc or a click
 * elsewhere cancels). Pad slots show while a gamepad is connected. Stays current while open (rebinds, pad connecting).
 */
export function controlsTab(game: Phaser.Game): HTMLElement {
  const input = gameInput(game)!;
  const root = el('<div class="ui-stack"></div>');
  let waiting = '';
  const draw = () => {
    const chip = (a: string, i: number, t: string) => {
      const on = waiting === `${a}:${i}`;
      return `<button class="ui-btn ${on ? 'ui-btn--primary' : 'ui-btn--secondary'}" data-id="${a}:${i}">${on ? 'Press a key…' : esc(input.tokenText(t))}</button>`;
    };
    const rows = Object.entries(input.bindings).map(([a, ts]) => {
      const chips = ts.map((t, i) => (t.startsWith('PAD_') && !input.padConnected ? '' : chip(a, i, t))).join('');
      return `<div class="ui-field"><span>${esc(actionLabel(a))}</span><span class="ui-choices">${chips}</span></div>`;
    });
    root.innerHTML = `<div class="ui-scroll">${rows.join('')}</div>
      <p class="ui-note">${waiting ? 'Press a key or a gamepad button. Esc cancels.' : `Click a binding to change it.${input.padConnected ? '' : ' Connect a gamepad and press a button to rebind its buttons.'}`}</p>
      <div class="ui-row"><button class="ui-btn ui-btn--secondary" data-id="reset">Reset to defaults</button></div>`;
  };
  const again = () => redraw(root, draw);
  draw();
  const off = input.onChange(() => (root.isConnected ? again() : off()));
  root.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id;
    if (!id) return;
    if (id === 'reset') return input.cancelListen(), input.reset();
    const [a, i] = id.split(':');
    input.listen(
      (token) => {
        if (waiting === id) waiting = '';
        if (token) input.rebind(a, Number(i), token);
        again();
      },
      () => root.isConnected,
    );
    waiting = id;
    again();
  });
  return root;
}

export const creditsView = (lines: string[]) => el(`<div class="ui-scroll">${lines.map((l) => `<p class="ui-text">${esc(l)}</p>`).join('')}</div>`);

const when = (at: number) => new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** The save files as a menu list; picking one calls `pick(index)`. Loading an empty file is disabled. */
export function savesView(store: SaveStore, mode: 'save' | 'load', pick: (i: number) => void): HTMLElement {
  const saves = store.list();
  const root = el(`<ul class="ui-menu">${saves
    .map(
      (s, i) =>
        `<li><button class="ui-menu__item ui-menu__item--split" data-i="${i}" ${mode === 'load' && !s ? 'disabled' : ''}><span>Save ${i + 1}</span><span>${s ? when(s.at) : 'Empty'}</span></button></li>`,
    )
    .join('')}</ul>`);
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-i]');
    if (b && !b.disabled) pick(Number(b.dataset.i));
  });
  return root;
}

/** A tab strip with lazily built views: `tabs([{ id, label, build }])`. */
export function tabs(entries: { id: string; label: string; build: () => HTMLElement }[], start = 0): { root: HTMLElement; select(id: string): void } {
  const root = el('<div class="ui-stack"><div class="ui-tabs" role="tablist"></div><div class="ui-tabpanel" role="tabpanel"></div></div>');
  const strip = root.firstElementChild as HTMLElement;
  const body = root.lastElementChild as HTMLElement;
  strip.innerHTML = entries.map((t) => `<button class="ui-tab" role="tab" data-tab="${t.id}">${esc(t.label)}</button>`).join('');
  const select = (id: string) => {
    strip.querySelectorAll<HTMLElement>('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    body.replaceChildren(entries.find((t) => t.id === id)!.build());
  };
  strip.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[role=tab]');
    if (b) {
      select(b.dataset.tab!);
      b.focus();
    }
  });
  select(entries[start].id);
  return { root, select };
}

/** A modal panel in a backdrop; returns the backdrop and the content slot. */
export function panelShell(title: string): { root: HTMLElement; body: HTMLElement } {
  const root = el(`<div class="ui-backdrop"><div class="ui-panel ui-dialog ui-dialog--wide" role="dialog" aria-label="${esc(title)}"><h2 class="ui-panel__title">${esc(title)}</h2><div class="ui-stack"></div></div></div>`);
  return { root, body: root.querySelector('.ui-stack')! };
}

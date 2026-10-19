/**
 * Input actions: a game binds actions, not keys. Players rebind them (Controls tab of the game menu) and use a gamepad;
 * prompts and hints show whatever is bound. Bindings and tokens: bindings.ts (pure, tested).
 *
 *   bootGame({ ..., actions: { left: ['A', 'LEFT', 'PAD_LS_LEFT'], right: [...], jump: ['SPACE', 'W', 'PAD_A'] },
 *                    axes: { moveX: ['left', 'right'] } });
 *   const input = inputFor(this);               // in a scene; one per game
 *   input.down('jump'); input.pressed('jump'); input.released('jump'); input.axis('moveX');   // -1..1
 *   input.value('left')                         // 0..1: analogue for sticks and triggers, 1 for keys
 *   keyLabel('jump')                            // 'Space', or 'A' when the gamepad was used last
 *
 * One sampler per game, on the game's PRE_STEP: every scene reads the same state in a frame, so pressed() can be called
 * from several places (it is not consumed like Phaser's JustDown). A tap shorter than a frame still reads as one pressed()
 * frame. Facts that shaped it:
 * - Keyboard is read from window keydown/keyup by `event.code` (physical key), not from a scene's keyboard plugin: the state
 *   survives scene restarts and a paused scene, and rebinding can capture the next key. Keys typed in a text field are
 *   ignored; a bound key's page default (scroll) is blocked unless Ctrl/Alt/Meta is held.
 * - Gamepad is read with `navigator.getGamepads()` (standard layout), NOT Phaser's gamepad plugin: that plugin is per scene
 *   and only updates while its scene runs, so it cannot serve game-level state or rebinding while the menu pauses the
 *   scenes. No Phaser config is needed. Browsers expose a pad only after a button press on the page.
 * - Mouse buttons count only when pressed on the canvas. They are defaults; rebinding does not capture them.
 * - A slot's key names the physical key; `navigator.keyboard.getLayoutMap()` (Chromium) gives the printed letter for labels.
 */
import type Phaser from 'phaser';
import { createSave, type Save } from '../save';
import { esc, typing } from './menu-parts';
import { ESC_ALT, escAltWorks } from './escape';
import { transitionBusy } from './transition';
import {
  actionLabel, checkDeclaration, displayToken, fillTemplate, keyName, mergeSaved, overrides, padToken, parseToken, rebind,
  stickToken, stickValue, tokenLabel, type Bindings, type Device, type PadStyle, type Token,
} from './bindings';

export interface InputConfig {
  /** Action -> its default bindings (tokens, see bindings.ts). Each slot is one rebindable binding. */
  actions: Bindings;
  /** Axis name -> [negative action, positive action]: `input.axis('moveX')` = value(right) - value(left). */
  axes?: Record<string, [string, string]>;
}

interface State {
  v: number;
  down: boolean;
  pressed: boolean;
  released: boolean;
}

const LISTEN_STICK = 0.7;

export class GameInput {
  readonly defaults: Bindings;
  bindings: Bindings;
  readonly axes: Record<string, [string, string]>;
  /** Last device used: decides which glyphs prompts show. */
  device: Device = 'keyboard';
  padStyle: PadStyle = 'xbox';
  /** Id string of the connected gamepad, '' when none. */
  padId = '';

  private parsed: Record<string, Token[]> = {};
  private state: Record<string, State> = {};
  private keys = new Set<string>();
  private keyEdge = new Set<string>();
  private mouse = new Set<number>();
  private mouseEdge = new Set<number>();
  private buttons: number[] = new Array(16).fill(0);
  private prevButtons: number[] = new Array(16).fill(0);
  private stickAxes = [0, 0, 0, 0];
  private subs = new Set<() => void>();
  private save: Save<{ bindings: Bindings }>;
  private layout: { get(code: string): string | undefined } | undefined;
  private listenCb: ((token: string | null) => void) | null = null;
  private swallowUp = '';
  private listenAlive: () => boolean = () => true;
  private off: (() => void)[] = [];

  constructor(game: Phaser.Game, id: string, cfg: InputConfig) {
    checkDeclaration(cfg.actions, cfg.axes);
    this.defaults = Object.fromEntries(Object.entries(cfg.actions).map(([a, t]) => [a, [...t]]));
    this.axes = cfg.axes ?? {};
    this.save = createSave<{ bindings: Bindings }>(`${id}:input`, { bindings: {} });
    this.bindings = mergeSaved(this.defaults, this.save.get().bindings);
    this.reparse();

    const on = (t: EventTarget, ev: string, fn: (e: any) => void, capture = false) => {
      t.addEventListener(ev, fn, capture);
      this.off.push(() => t.removeEventListener(ev, fn, capture));
    };
    // Capture phase, installed before the menus' own handlers: while listen() waits, input belongs to it.
    on(window, 'keydown', this.listenKey, true);
    on(window, 'keyup', this.swallowKeyUp, true);
    on(window, 'mousedown', (e: MouseEvent) => this.listenCb && e.button === 0 && this.endListen(null), true);
    on(window, 'keydown', this.onKeyDown);
    // Capture: a menu or the dev sidebar stops keyups from bubbling, which left a key held when Esc was pressed stuck down.
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(keyName(e.code)), true);
    on(window, 'blur', () => (this.keys.clear(), this.mouse.clear()));
    on(window, 'mousedown', (e: MouseEvent) => {
      if (e.target !== game.canvas) return;
      this.mouse.add(e.button);
      this.mouseEdge.add(e.button);
      this.use('keyboard');
    });
    on(window, 'mouseup', (e: MouseEvent) => this.mouse.delete(e.button));
    on(game.canvas, 'contextmenu', (e: Event) => this.hasMouse(2) && e.preventDefault());
    game.events.on('prestep', this.step);
    game.events.once('destroy', () => this.destroy());
    this.off.push(() => game.events.off('prestep', this.step));

    (navigator as any).keyboard?.getLayoutMap?.().then((m: Map<string, string>) => ((this.layout = m), this.notify())).catch(() => {});
  }

  // ---- reading ----

  private st(action: string): State {
    const s = this.state[action];
    if (!s) throw new Error(`input: unknown action '${action}' (declared: ${Object.keys(this.defaults).join(', ')})`);
    return s;
  }
  /** Held (analogue actions: pushed past half). */
  down = (action: string) => this.st(action).down;
  /** Went down this frame. Safe to ask from several places. */
  pressed = (action: string) => this.st(action).pressed;
  released = (action: string) => this.st(action).released;
  /** 0..1: how far a stick or trigger is pushed; 1 for a held key or button. */
  value = (action: string) => this.st(action).v;
  /** -1..1 from the axis's two actions: keys give -1, 0, 1; sticks the pushed amount. */
  axis(name: string): number {
    const p = this.axes[name];
    if (!p) throw new Error(`input: unknown axis '${name}' (declared: ${Object.keys(this.axes).join(', ') || 'none'})`);
    return this.st(p[1]).v - this.st(p[0]).v;
  }

  // ---- labels ----

  /** Text for one token, as the keyboard layout and the connected pad show it. */
  tokenText(token: string): string {
    return tokenLabel(token, { padStyle: this.padStyle, layout: (c) => this.layout?.get(c) });
  }
  /** The binding to show for an action: from the device used last. */
  label(action: string): string {
    this.st(action);
    const t = displayToken(this.bindings[action], this.device);
    return t ? this.tokenText(t) : '?';
  }
  has = (action: string) => action in this.defaults;
  get padConnected() {
    return !!this.padId;
  }

  // ---- changing ----

  /** Slot `index` of `action` becomes `token` (a token another action holds swaps). Saved. */
  rebind(action: string, index: number, token: string) {
    const next = rebind(this.bindings, action, index, token);
    if (next === this.bindings) return;
    this.bindings = next;
    this.changed();
  }
  reset() {
    this.bindings = Object.fromEntries(Object.entries(this.defaults).map(([a, t]) => [a, [...t]]));
    this.changed();
  }
  /** Called after a rebind, a reset, a device switch or a pad connecting. Returns an unsubscribe function. */
  onChange(fn: () => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  /**
   * Wait for the player's next key or pad input (the Controls tab): `cb(token)`, or `cb(null)` on Esc or a click. While
   * waiting, keys reach neither the menu nor the game (this runs before their handlers: it is installed at boot).
   * `alive` false (the Controls tab was closed) cancels instead of taking the input. Returns a function that cancels.
   */
  listen(cb: (token: string | null) => void, alive: () => boolean = () => true): () => void {
    this.cancelListen();
    this.listenCb = cb;
    this.listenAlive = alive;
    return () => this.cancelListen();
  }
  /** A key (`KeyboardEvent.code`) is bound to an action. */
  bound(code: string): boolean {
    const n = keyName(code);
    return Object.values(this.parsed).some((ts) => ts.some((t) => t.kind === 'key' && t.name === n));
  }
  get listening() {
    return !!this.listenCb;
  }
  /** Ends a wait for input without a binding; true when there was one. */
  cancelListen(): boolean {
    if (!this.listenCb) return false;
    this.endListen(null);
    return true;
  }
  private endListen(token: string | null) {
    const cb = this.listenCb;
    this.listenCb = null;
    cb?.(token);
  }

  debugState() {
    return {
      device: this.device,
      pad: this.padId || null,
      padStyle: this.padStyle,
      down: Object.keys(this.state).filter((a) => this.state[a].down),
      values: Object.fromEntries(Object.entries(this.state).filter(([, s]) => s.v).map(([a, s]) => [a, +s.v.toFixed(2)])),
      bindings: this.bindings,
    };
  }

  destroy() {
    this.cancelListen();
    this.off.forEach((f) => f());
    this.off = [];
  }

  // ---- internals ----

  private reparse() {
    this.parsed = Object.fromEntries(Object.entries(this.bindings).map(([a, ts]) => [a, ts.map(parseToken)]));
    for (const a of Object.keys(this.bindings)) this.state[a] ??= { v: 0, down: false, pressed: false, released: false };
  }
  private changed() {
    this.reparse();
    this.save.set({ bindings: overrides(this.defaults, this.bindings) });
    this.notify();
  }
  private notify() {
    this.subs.forEach((f) => f());
  }
  private use(d: Device) {
    if (this.device === d) return;
    this.device = d;
    this.notify();
  }
  private hasMouse(button: number) {
    return Object.values(this.parsed).some((ts) => ts.some((t) => t.kind === 'mouse' && t.button === button));
  }

  private listenKey = (e: KeyboardEvent) => {
    if (!this.listenCb) return;
    if (!this.listenAlive()) return void this.endListen(null);
    e.preventDefault();
    e.stopImmediatePropagation();
    this.swallowUp = e.code; // Space/Enter would otherwise click the focused button on release
    this.endListen(e.code === 'Escape' ? null : keyName(e.code));
  };
  private swallowKeyUp = (e: KeyboardEvent) => {
    if (e.code !== this.swallowUp) return;
    this.swallowUp = '';
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (typing()) return;
    const n = keyName(e.code);
    if (!e.repeat) this.keyEdge.add(n);
    this.keys.add(n);
    this.use('keyboard');
    // Block the page default (scroll, find-as-you-type) of keys the game uses; Ctrl/Alt/Meta shortcuts stay the browser's.
    if (!e.ctrlKey && !e.altKey && !e.metaKey && Object.values(this.parsed).some((ts) => ts.some((t) => t.kind === 'key' && t.name === n))) {
      e.preventDefault();
    }
  };

  private samplePad() {
    let pads: (Gamepad | null)[] = [];
    try {
      pads = (navigator.getGamepads?.() ?? []) as (Gamepad | null)[];
    } catch {} // throws SecurityError in an iframe the gamepad permission policy excludes; uncaught here it would end the frame loop
    this.prevButtons = this.buttons;
    this.buttons = new Array(16).fill(0);
    this.stickAxes = [0, 0, 0, 0];
    let id = '';
    for (const p of pads) {
      if (!p?.connected) continue;
      id ||= p.id;
      for (let i = 0; i < 16; i++) this.buttons[i] = Math.max(this.buttons[i], p.buttons[i]?.value ?? 0);
      for (let i = 0; i < 4; i++) if (Math.abs(p.axes[i] ?? 0) > Math.abs(this.stickAxes[i])) this.stickAxes[i] = p.axes[i];
    }
    if (id !== this.padId) {
      this.padId = id;
      this.padStyle = /054c|dualshock|dualsense|playstation|wireless controller/i.test(id) ? 'playstation' : 'xbox';
      if (!id && this.device === 'pad') this.device = 'keyboard';
      this.notify();
    }
  }

  private step = () => {
    this.samplePad();
    // pad activity: switches the prompts to pad glyphs, and answers listen()
    let padHit: string | null = null;
    for (let i = 0; i < 16; i++) if (this.buttons[i] >= 0.5 && this.prevButtons[i] < 0.5) padHit ??= padToken(i);
    for (let i = 0; i < 4; i++) if (Math.abs(this.stickAxes[i]) >= LISTEN_STICK) padHit ??= stickToken(i, this.stickAxes[i]);
    if (padHit) {
      this.use('pad');
      if (this.listenCb) this.endListen(this.listenAlive() ? padHit : null);
    }
    const covered = transitionBusy(); // a transition cover is up: every action reads as idle
    for (const [a, toks] of Object.entries(this.parsed)) {
      let v = 0;
      let edge = false;
      for (const t of covered ? [] : toks) {
        let x = 0;
        if (t.kind === 'key') (x = this.keys.has(t.name) ? 1 : 0), (edge ||= this.keyEdge.has(t.name));
        else if (t.kind === 'mouse') (x = this.mouse.has(t.button) ? 1 : 0), (edge ||= this.mouseEdge.has(t.button));
        else if (t.kind === 'pad') (x = this.buttons[t.button]), (edge ||= this.buttons[t.button] >= 0.5 && this.prevButtons[t.button] < 0.5);
        else x = stickValue(this.stickAxes[t.axis], t.sign);
        if (x > v) v = x;
      }
      const s = this.state[a];
      const was = s.down;
      const down = v >= 0.5 || edge; // a tap between two frames still reads as one frame down
      this.state[a] = { v: edge && v < 0.5 ? 1 : v, down, pressed: down && (!was || edge), released: !down && was };
    }
    this.keyEdge.clear();
    this.mouseEdge.clear();
  };
}

// ---- one per game ----

let current: GameInput | null = null;
const KEY = 'kit:input';

/** `bootGame` makes it from the `actions` option; call it yourself only to declare actions elsewhere (a lab probe). */
export function createInput(game: Phaser.Game, id: string, cfg: InputConfig): GameInput {
  (game.registry.get(KEY) as GameInput | undefined)?.destroy();
  const input = new GameInput(game, id, cfg);
  game.registry.set(KEY, input);
  current = input;
  return input;
}

/** The game's input actions. Throws when the game declared none (`actions` in bootGame). */
export function inputFor(of: Phaser.Scene | Phaser.Game): GameInput {
  const game = 'sys' in of ? of.sys.game : of;
  const input = game.registry.get(KEY) as GameInput | undefined;
  if (!input) throw new Error("input: no actions declared; add `actions: { jump: ['SPACE'] }` to bootGame");
  return input;
}

// ---- prompts ----

const live = () => {
  if (!current) throw new Error('input: no actions declared');
  return current;
};

/** Plain text of the binding for an action: 'Space', or the pad glyph ('A', '✕') when a pad was used last. */
export const keyLabel = (action: string) => live().label(action);

/** `<kbd class="ui-key">Space</kbd>` for an action. */
export const keyHtml = (action: string) => `<kbd class="ui-key">${esc(keyLabel(action))}</kbd>`;

/** What closes things: 'Esc / P' (the placeholder `{esc}`; just 'Esc' where P is bound or the game has no menu). */
const escKeys = () => (escAltWorks(!!current?.bound(ESC_ALT)) ? ['Esc', 'P'] : ['Esc']);

/** Text with `{jump}` placeholders filled by key labels (plain text, e.g. for Phaser Text). `{esc}` is Esc and its second key. */
export const promptText = (text: string) =>
  fillTemplate(text, (a) => a === 'esc' || live().has(a), (a) => (a === 'esc' ? escKeys().join(' / ') : keyLabel(a)));

/** HTML with `{jump}` placeholders filled by `<kbd class="ui-key">` (the rest of the text is escaped); `{esc}` is Esc and its second key. */
export const promptHtml = (text: string) =>
  text.split(/(\{\w+\})/).map((p) => {
    const a = /^\{(\w+)\}$/.exec(p)?.[1];
    if (a === 'esc') return escKeys().map((k) => `<kbd class="ui-key">${k}</kbd>`).join(' / ');
    return a && live().has(a) ? keyHtml(a) : esc(p);
  }).join('');

/**
 * Keeps `el.innerHTML = promptHtml(text)` current as bindings or the device in use change. Stops by itself once `el` leaves
 * the page; returns a function that stops it earlier.
 */
export function livePrompt(el: HTMLElement, text: string): () => void {
  const draw = () => (el.innerHTML = promptHtml(text));
  draw();
  const off = live().onChange(() => (el.isConnected ? draw() : off()));
  return off;
}

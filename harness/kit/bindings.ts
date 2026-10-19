/**
 * Input bindings, pure logic (no Phaser, no DOM): tokens, rebinding, persistence shape, labels. The runtime is input.ts.
 *
 * A binding is a string token:
 *   keys         'SPACE' 'W' 'LEFT' 'SHIFT' '1' 'F5' (physical keys by KeyboardEvent.code: WASD stays WASD on AZERTY)
 *   mouse        'MOUSE_LEFT' 'MOUSE_MIDDLE' 'MOUSE_RIGHT'
 *   pad buttons  'PAD_A' 'PAD_B' 'PAD_X' 'PAD_Y' 'PAD_LB' 'PAD_RB' 'PAD_LT' 'PAD_RT' 'PAD_BACK' 'PAD_START' 'PAD_LS' 'PAD_RS'
 *                (stick clicks) 'PAD_UP' 'PAD_DOWN' 'PAD_LEFT' 'PAD_RIGHT' (d-pad); the standard gamepad layout
 *   pad sticks   'PAD_LS_LEFT' 'PAD_LS_RIGHT' 'PAD_LS_UP' 'PAD_LS_DOWN', and PAD_RS_* for the right stick: analogue 0..1
 */

export type Bindings = Record<string, string[]>;
export type Device = 'keyboard' | 'pad';
export type PadStyle = 'xbox' | 'playstation';

/** Standard gamepad layout, button index order. */
export const PAD_BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'LS', 'RS', 'UP', 'DOWN', 'LEFT', 'RIGHT'] as const;
const MOUSE = ['LEFT', 'MIDDLE', 'RIGHT'] as const;

export type Token =
  | { kind: 'key'; name: string }
  | { kind: 'mouse'; button: number }
  | { kind: 'pad'; button: number }
  | { kind: 'stick'; axis: number; sign: 1 | -1 };

export function parseToken(t: string): Token {
  if (t.startsWith('MOUSE_')) {
    const b = MOUSE.indexOf(t.slice(6) as never);
    if (b >= 0) return { kind: 'mouse', button: b };
  } else if (t.startsWith('PAD_')) {
    const rest = t.slice(4);
    const b = PAD_BUTTONS.indexOf(rest as never);
    if (b >= 0) return { kind: 'pad', button: b };
    const m = /^(LS|RS)_(UP|DOWN|LEFT|RIGHT)$/.exec(rest);
    if (m) {
      const vertical = m[2] === 'UP' || m[2] === 'DOWN';
      return { kind: 'stick', axis: (m[1] === 'RS' ? 2 : 0) + (vertical ? 1 : 0), sign: m[2] === 'UP' || m[2] === 'LEFT' ? -1 : 1 };
    }
  }
  return { kind: 'key', name: t };
}

export const isPadToken = (t: string) => t.startsWith('PAD_');
export const stickToken = (axis: number, sign: number) =>
  `PAD_${axis >= 2 ? 'RS' : 'LS'}_${axis % 2 ? (sign < 0 ? 'UP' : 'DOWN') : sign < 0 ? 'LEFT' : 'RIGHT'}`;
export const padToken = (button: number) => `PAD_${PAD_BUTTONS[button]}`;

/** A stick axis reading as the 0..1 push in one direction, with a dead zone that is rescaled away. */
export function stickValue(raw: number, sign: 1 | -1, deadzone = 0.25): number {
  const v = raw * sign;
  return v <= deadzone ? 0 : Math.min(1, (v - deadzone) / (1 - deadzone));
}

// ---- keys ----

const SPECIAL: Record<string, string> = {
  Space: 'SPACE', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ControlLeft: 'CTRL', ControlRight: 'CTRL', AltLeft: 'ALT', AltRight: 'ALT',
  Escape: 'ESC', Backquote: 'BACKTICK',
};

/** The binding name of a physical key (`KeyboardEvent.code`). */
export function keyName(code: string): string {
  return SPECIAL[code] ?? /^Key([A-Z])$/.exec(code)?.[1] ?? /^Digit(\d)$/.exec(code)?.[1] ?? code.toUpperCase();
}

/** `KeyboardEvent.code` of a letter or digit name, to ask the keyboard layout what is printed on it. */
const codeOfName = (name: string) => (/^[A-Z]$/.test(name) ? `Key${name}` : /^\d$/.test(name) ? `Digit${name}` : null);

const KEY_LABEL: Record<string, string> = {
  UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', SPACE: 'Space', ESC: 'Esc', ENTER: 'Enter', TAB: 'Tab',
  SHIFT: 'Shift', CTRL: 'Ctrl', ALT: 'Alt', BACKSPACE: 'Backspace', BACKTICK: '`', PAGEUP: 'Page up', PAGEDOWN: 'Page down',
  DELETE: 'Delete', INSERT: 'Insert', HOME: 'Home', END: 'End', CAPSLOCK: 'Caps', COMMA: ',', PERIOD: '.', SLASH: '/', MINUS: '-', EQUAL: '=',
};
const PAD_LABEL: Record<PadStyle, Record<string, string>> = {
  xbox: { BACK: 'Back', START: 'Start', LS: 'LS click', RS: 'RS click' },
  playstation: { A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', BACK: 'Share', START: 'Options', LS: 'L3', RS: 'R3' },
};
const ARROW: Record<string, string> = { UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→' };

export interface LabelOpts {
  padStyle?: PadStyle;
  /** What the keyboard layout prints on a physical key (`navigator.keyboard.getLayoutMap().get(code)`), if known. */
  layout?: (code: string) => string | undefined;
}

/** Short text for one token: 'Space', '↑', 'Left click', 'A' or '✕', 'LS ←'. */
export function tokenLabel(t: string, o: LabelOpts = {}): string {
  const k = parseToken(t);
  switch (k.kind) {
    case 'mouse': return `${['Left', 'Middle', 'Right'][k.button]} click`;
    case 'pad': {
      const n = PAD_BUTTONS[k.button];
      return PAD_LABEL[o.padStyle ?? 'xbox'][n] ?? (k.button >= 12 ? `D-pad ${ARROW[n]}` : n);
    }
    case 'stick': {
      const dir = t.slice(t.lastIndexOf('_') + 1);
      return `${t.startsWith('PAD_RS') ? 'RS' : 'LS'} ${ARROW[dir]}`;
    }
    default: {
      const code = codeOfName(k.name);
      const printed = code && o.layout?.(code);
      if (printed) return printed.toUpperCase();
      return KEY_LABEL[k.name] ?? (k.name.length <= 2 || /^F\d+$/.test(k.name) ? k.name : k.name[0] + k.name.slice(1).toLowerCase());
    }
  }
}

/** 'moveLeft' -> 'Move left', 'jump' -> 'Jump'. */
export function actionLabel(action: string): string {
  const s = action.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return s[0].toUpperCase() + s.slice(1);
}

/** The token to show for an action: the first one from the device in use, else the first there is. */
export function displayToken(tokens: string[], device: Device): string | undefined {
  return tokens.find((t) => isPadToken(t) === (device === 'pad')) ?? tokens[0];
}

/** Template with `{action}` placeholders; `render` gets the action name (unknown names stay as written). */
export function fillTemplate(text: string, known: (a: string) => boolean, render: (a: string) => string): string {
  return text.replace(/\{(\w+)\}/g, (m, a: string) => (known(a) ? render(a) : m));
}

// ---- rebinding and persistence ----

/**
 * `token` replaces slot `index` of `action`. A token another action already uses swaps: that action gets the slot's old
 * token (so nothing is left unbound); in the same action, the duplicate is replaced by the old token.
 */
export function rebind(b: Bindings, action: string, index: number, token: string): Bindings {
  const mine = b[action];
  if (!mine || index < 0 || index >= mine.length || mine[index] === token) return b;
  const old = mine[index];
  const out: Bindings = {};
  for (const [a, tokens] of Object.entries(b)) out[a] = tokens.map((t) => (t === token ? old : t));
  out[action][index] = token;
  return out;
}

const plausible = (t: unknown): t is string => typeof t === 'string' && t.length > 0 && t.length <= 24;

/** Saved overrides over the defaults. Unknown actions and slot lists whose length changed are dropped. */
export function mergeSaved(defaults: Bindings, saved: unknown): Bindings {
  const out: Bindings = {};
  const s = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
  for (const [a, d] of Object.entries(defaults)) {
    const v = s[a];
    out[a] = Array.isArray(v) && v.length === d.length && v.every(plausible) ? [...v] : [...d];
  }
  return out;
}

/** What differs from the defaults: all that needs saving, so later changes to a default reach players who never touched it. */
export function overrides(defaults: Bindings, current: Bindings): Bindings {
  const out: Bindings = {};
  for (const [a, d] of Object.entries(defaults)) if (current[a].some((t, i) => t !== d[i])) out[a] = current[a];
  return out;
}

/** Declared actions: arrays of tokens. Throws on a mistake a game would otherwise find at play time. */
export function checkDeclaration(actions: Bindings, axes: Record<string, [string, string]> = {}) {
  for (const [a, tokens] of Object.entries(actions)) {
    if (!Array.isArray(tokens) || !tokens.length) throw new Error(`input: action '${a}' needs at least one binding`);
    for (const t of tokens) {
      const bad = (t.startsWith('PAD_') || t.startsWith('MOUSE_')) && parseToken(t).kind === 'key';
      if (bad) throw new Error(`input: '${t}' (action '${a}') is not a known pad or mouse binding`);
    }
  }
  for (const [n, pair] of Object.entries(axes)) {
    for (const a of pair) if (!actions[a]) throw new Error(`input: axis '${n}' uses unknown action '${a}'`);
  }
}

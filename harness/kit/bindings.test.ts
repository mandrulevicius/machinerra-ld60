import { describe, expect, it } from 'vitest';
import {
  actionLabel, checkDeclaration, displayToken, fillTemplate, keyName, mergeSaved, overrides, parseToken, rebind, stickToken,
  stickValue, tokenLabel,
} from './bindings';

const defaults = { jump: ['SPACE', 'W', 'PAD_A'], fire: ['MOUSE_LEFT', 'PAD_RT'], left: ['A', 'PAD_LS_LEFT'] };

describe('tokens', () => {
  it('parses keys, mouse, pad buttons and stick directions', () => {
    expect(parseToken('SPACE')).toEqual({ kind: 'key', name: 'SPACE' });
    expect(parseToken('MOUSE_RIGHT')).toEqual({ kind: 'mouse', button: 2 });
    expect(parseToken('PAD_A')).toEqual({ kind: 'pad', button: 0 });
    expect(parseToken('PAD_LS')).toEqual({ kind: 'pad', button: 10 }); // stick click, not a stick direction
    expect(parseToken('PAD_LEFT')).toEqual({ kind: 'pad', button: 14 });
    expect(parseToken('PAD_LS_LEFT')).toEqual({ kind: 'stick', axis: 0, sign: -1 });
    expect(parseToken('PAD_RS_DOWN')).toEqual({ kind: 'stick', axis: 3, sign: 1 });
  });

  it('names physical keys and round-trips stick tokens', () => {
    expect(['KeyW', 'Digit3', 'Space', 'ArrowLeft', 'ShiftRight', 'F5', 'Numpad1'].map(keyName)).toEqual(['W', '3', 'SPACE', 'LEFT', 'SHIFT', 'F5', 'NUMPAD1']);
    for (const t of ['PAD_LS_LEFT', 'PAD_LS_UP', 'PAD_RS_RIGHT', 'PAD_RS_DOWN']) {
      const k = parseToken(t);
      if (k.kind !== 'stick') throw new Error(t);
      expect(stickToken(k.axis, k.sign)).toBe(t);
    }
  });

  it('removes the dead zone and rescales a stick push', () => {
    expect(stickValue(0.2, 1)).toBe(0);
    expect(stickValue(-0.9, 1)).toBe(0); // other direction
    expect(stickValue(-1, -1)).toBe(1);
    expect(stickValue(0.625, 1)).toBeCloseTo(0.5);
  });
});

describe('labels', () => {
  it('labels keys, mouse, pad buttons by style, sticks', () => {
    expect(['SPACE', 'W', 'LEFT', 'F5', 'PAGEUP', 'SHIFT'].map((t) => tokenLabel(t))).toEqual(['Space', 'W', '←', 'F5', 'Page up', 'Shift']);
    expect(tokenLabel('MOUSE_LEFT')).toBe('Left click');
    expect(tokenLabel('PAD_A')).toBe('A');
    expect(tokenLabel('PAD_A', { padStyle: 'playstation' })).toBe('✕');
    expect(tokenLabel('PAD_RT', { padStyle: 'playstation' })).toBe('R2');
    expect(tokenLabel('PAD_UP')).toBe('D-pad ↑');
    expect(tokenLabel('PAD_LS_LEFT')).toBe('LS ←');
  });

  it('uses the keyboard layout for letters and digits only', () => {
    const azerty = (c: string) => ({ KeyW: 'z', Digit1: '&' })[c];
    expect(tokenLabel('W', { layout: azerty })).toBe('Z');
    expect(tokenLabel('1', { layout: azerty })).toBe('&');
    expect(tokenLabel('SPACE', { layout: azerty })).toBe('Space');
  });

  it('humanises action names', () => {
    expect(['jump', 'moveLeft', 'fire_2', 'use-item'].map(actionLabel)).toEqual(['Jump', 'Move left', 'Fire 2', 'Use item']);
  });

  it('shows the token of the device in use, else the first', () => {
    expect(displayToken(defaults.jump, 'keyboard')).toBe('SPACE');
    expect(displayToken(defaults.jump, 'pad')).toBe('PAD_A');
    expect(displayToken(['SPACE', 'W'], 'pad')).toBe('SPACE');
    expect(displayToken([], 'pad')).toBeUndefined();
  });

  it('fills known placeholders only', () => {
    expect(fillTemplate('Press {jump} or {nope}, {jump}!', (a) => a === 'jump', (a) => `<${a}>`)).toBe('Press <jump> or {nope}, <jump>!');
  });
});

describe('rebinding', () => {
  it('replaces one slot and leaves the input untouched', () => {
    const b = rebind(defaults, 'jump', 1, 'K');
    expect(b.jump).toEqual(['SPACE', 'K', 'PAD_A']);
    expect(defaults.jump[1]).toBe('W');
  });

  it('swaps when another action already uses the token', () => {
    const b = rebind(defaults, 'jump', 1, 'A'); // left holds A
    expect(b.jump).toEqual(['SPACE', 'A', 'PAD_A']);
    expect(b.left).toEqual(['W', 'PAD_LS_LEFT']);
  });

  it('swaps inside one action, and ignores bad slots and no-ops', () => {
    expect(rebind(defaults, 'jump', 1, 'SPACE').jump).toEqual(['W', 'SPACE', 'PAD_A']);
    expect(rebind(defaults, 'jump', 1, 'W')).toBe(defaults);
    expect(rebind(defaults, 'jump', 9, 'K')).toBe(defaults);
    expect(rebind(defaults, 'nope', 0, 'K')).toBe(defaults);
  });
});

describe('persistence shape', () => {
  it('saves only what differs and merges it back over the defaults', () => {
    const b = rebind(defaults, 'jump', 0, 'K');
    const saved = overrides(defaults, b);
    expect(saved).toEqual({ jump: ['K', 'W', 'PAD_A'] });
    expect(mergeSaved(defaults, saved)).toEqual(b);
    expect(overrides(defaults, defaults)).toEqual({});
  });

  it('drops unknown actions, changed slot counts and junk', () => {
    const merged = mergeSaved(defaults, { jump: ['K'], gone: ['X'], fire: ['A', 7], left: ['Q', 'PAD_LS_RIGHT'] });
    expect(merged).toEqual({ jump: defaults.jump, fire: defaults.fire, left: ['Q', 'PAD_LS_RIGHT'] });
    expect(mergeSaved(defaults, null)).toEqual(defaults);
    expect(mergeSaved(defaults, 'x')).toEqual(defaults);
  });
});

describe('declaration check', () => {
  it('accepts a good one and names the mistakes', () => {
    expect(() => checkDeclaration(defaults, { moveX: ['left', 'jump'] })).not.toThrow();
    expect(() => checkDeclaration({ a: [] })).toThrow(/at least one/);
    expect(() => checkDeclaration({ a: ['PAD_Z'] })).toThrow(/PAD_Z/);
    expect(() => checkDeclaration({ a: ['MOUSE_X'] })).toThrow(/MOUSE_X/);
    expect(() => checkDeclaration(defaults, { moveX: ['left', 'right'] })).toThrow(/unknown action 'right'/);
  });
});

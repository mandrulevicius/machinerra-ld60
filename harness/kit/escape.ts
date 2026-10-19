/**
 * The Esc stack. Esc means "one level up": a game registers what that is while it applies (`onEscape`), and the kit's
 * single keydown listener (menus.ts) runs the newest handler first. Only when none consumes Esc does the kit open the
 * game menu. While the menu is open Esc is the menu's first (back a level, then close): handlers do not see it.
 */
import type Phaser from 'phaser';

/** Returns true when it consumed Esc; false lets the next older handler, then the kit, have it. */
export type EscapeHandler = () => boolean | void;

const stack: EscapeHandler[] = [];

/**
 * Registers `handler` until the returned function is called or `scene` shuts down. Handlers run newest first.
 * A handler that returns nothing counts as not consumed, so return `true` explicitly.
 */
export function onEscape(scene: Pick<Phaser.Scene, 'events'>, handler: EscapeHandler): () => void {
  stack.push(handler);
  const off = () => {
    const i = stack.indexOf(handler);
    if (i >= 0) stack.splice(i, 1);
    scene.events.off('shutdown', off);
  };
  scene.events.once('shutdown', off);
  return off;
}

/** Runs the handlers newest first until one returns true. The kit's listener calls this; games don't. */
export function runEscape(): boolean {
  for (const h of [...stack].reverse()) if (h() === true) return true;
  return false;
}

/**
 * The top of the ladder: the games list, on the dev server and only as the top window (builds have no list;
 * compare.html embeds games). Returns true when it navigated.
 */
export function toGamesList(): boolean {
  if (!import.meta.env.DEV || window !== window.top) return false;
  location.assign('/games/index.html');
  return true;
}

// ---- keys the browser keeps for itself ----
// A browser takes Esc before the page when it leaves fullscreen (the itch.io fullscreen button): no keydown arrives.
// So a second key means Esc everywhere (`ESC_ALT`), and leaving fullscreen with the page focused is taken as the Esc the
// player meant. Both become a real-looking Esc keydown, so every Esc listener of a game behaves the same.

/** The second Esc: P (a `KeyboardEvent.code`). Off when the player binds it to an action, and in games without the menu. */
export const ESC_ALT = 'KeyP';

let altOn = false;
/** The menu turned the second key on (menus.ts). */
export const enableEscAlt = () => void (altOn = true);
/** Whether the second key works now: on, and not taken by an action (`taken`). */
export const escAltWorks = (taken: boolean) => altOn && !taken;

/** An Esc keydown, from the focused element up: the kit's listener and any game listener see it like a real press. */
export function sendEscape(): void {
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }),
  );
}

const SPAN = 400; // ms in which a leave of fullscreen and an Esc/F11 press are one act

/** Whether a leave of fullscreen was the Esc the player pressed: the page has focus and no Esc/F11 keydown came with it. */
export function leftByEsc(left: boolean, focused: boolean, sinceKey: number): boolean {
  return left && focused && sinceKey > SPAN;
}

/** Sends Esc when fullscreen ends by itself; returns the stop function. Needs a browser. */
export function escapeOnFullscreenExit(): () => void {
  const mq = matchMedia('(display-mode: fullscreen)');
  const now = () => !!document.fullscreenElement || mq.matches;
  let was = now();
  let key = -1e9; // last Esc or F11 keydown
  let sent = -1e9;
  const keys = (e: KeyboardEvent) => {
    if (e.code === 'F11') key = performance.now();
    if (e.code !== 'Escape') return;
    // An Esc just after the exit already sent one is the same press
    if (e.isTrusted && performance.now() - sent < SPAN) return void e.stopImmediatePropagation();
    key = performance.now();
  };
  const check = () => {
    const fs = now();
    const left = was && !fs;
    was = fs;
    if (!leftByEsc(left, document.hasFocus(), performance.now() - key)) return;
    sent = performance.now();
    sendEscape();
  };
  addEventListener('keydown', keys, true);
  document.addEventListener('fullscreenchange', check);
  mq.addEventListener('change', check);
  return () => {
    removeEventListener('keydown', keys, true);
    document.removeEventListener('fullscreenchange', check);
    mq.removeEventListener('change', check);
  };
}

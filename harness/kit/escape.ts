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

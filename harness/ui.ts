import type Phaser from 'phaser';
import './ui/tokens.css';
// Samples, not styles to copy: they show what the tokens can do. The default (no theme file) is greybox.
import './ui/themes/samples/clean.css';
import './ui/themes/samples/pixel.css';
import './ui/themes/samples/fantasy.css';
import './ui/components.css';

/**
 * Adds `<div id="ui">` to Phaser's DOM container, which Phaser scales with the canvas,
 * so UI is laid out in game pixels (same 1280x720 stage as harness/ui/mockups).
 * Needs `dom: { createContainer: true }` and `parent` in the game config; call after READY.
 */
export function mountUI(game: Phaser.Game, theme = 'greybox'): HTMLElement {
  document.documentElement.dataset.theme = theme;
  const ui = document.createElement('div');
  ui.id = 'ui';
  game.domContainer.appendChild(ui);
  return ui;
}

/**
 * HTML for a placeholder icon copied with `npm run icons -- <game> <name>` (games/<game>/public/icons/<name>.svg).
 * `role` picks the fill: accent, danger, good, warn, arcane, frost (default: the theme's icon colour).
 */
export const icon = (name: string, role = '') =>
  `<span class="ui-icon${role ? ` ui-icon--${role}` : ''}" style="--icon: url(${import.meta.env.DEV ? 'public/' : ''}icons/${name}.svg)"></span>`;

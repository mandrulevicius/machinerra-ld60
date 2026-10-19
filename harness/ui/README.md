# UI components

Plain CSS, no build step. Agent rules: the `ui` skill. Review pages: `kitchen-sink.html` (every component and state) and `mockups/*.html`; each has a theme switcher and a nav bar with a link back to the hub (`/games/index.html#harness`). Esc does the same on these pages, on `compare.html` and `embed.html` too (`harness/hub-esc.js`; not in a text field, nor when the key is the embedded game's). A mockup whose feature has a lab probe also links to it (`<body data-probe="Key">`); the probe links back through `about.see`.

- `tokens.css`: every design decision as a `--ui-*` custom property. The defaults are **greybox**: a deliberately unfinished grey placeholder for testing mechanics, not a style.
- `themes/samples/<name>.css` (`clean`, `pixel`, `fantasy`): basic samples that show what the tokens can do. **Not references for a game's look**; don't copy their style. Components in `components.css` use tokens only.

- `all.css` + `preview.css` + `preview.js`: review-page plumbing only.

## A game's theme
A game's theme is set in its `src/main.ts`, `variants: { theme: ... }`: a sample name (`clean`, `pixel`, `fantasy`; `greybox` without one) or the name of its own theme file (below).
When a game needs a look, it gets its own theme, designed from its concept and `docs/design/`:
1. `games/<name>/src/theme.css`: `[data-theme="<name>"] { ... }` with the `--ui-*` tokens from `tokens.css` and the `--kit-*` ones from `harness/kit/theme.css` (background, line art, ambient light, effect palette). Omitted tokens fall back to greybox.
2. In `src/main.ts`: `import './theme.css';`, `themeSlot.add('<name>', '<name>')` (from the kit) before `bootGame`, and `variants: { theme: '<name>' }`.
Fonts, frames, textures and icon treatment are part of the theme; the samples barely touch them.
At runtime, `data-theme="<name>"` on `<html>` (or any ancestor of `#ui`) re-skins; the kit's review pages list only the samples (add one to `preview.js` and `all.css` to review it there).

## Add a mockup
Copy `mockups/title.html`, keep the `.stage` wrapper (fixed 1280x720, scaled to fit), replace the contents of `#ui` with kit classes only, add the page to `pages` in `preview.js` (the nav bar) and a link to the Mockups card in `games/index.html` (the hub's Harness section). If a lab probe shows the same feature, set `<body data-probe="Key">` on the page (the bar then links to `/games/lab/?scene=Key`) and give the probe `about.see: { label, href }` (type in `games/lab/src/main.ts`) so it links back.

## Icons (placeholders)
`npm run icons -- find <word>` searches the 4000+ game-icons.net icons; `npm run icons -- <game> <name>...` copies them to `games/<game>/public/icons/` with a `CREDITS.md` (CC BY 3.0: the credit line goes on the game's page). Show one with `icon(name, role)` from `harness/ui.ts`, or `<span class="ui-icon ui-icon--danger" style="--icon: url(...)">`: the SVG masks a gradient of the role colour (`accent`, `danger`, `good`, `warn`, `arcane`, `frost`), with an outline and shadow from the theme's `--ui-icon-*` tokens (greybox: muted). They are for exploring; a game's final icon style is decided per game (`ui` skill).

## Kit glyphs
`glyphs/*.svg` are the kit's own icons (speaker off, low, high: the volume handle), so its screens need no per-game files. `components.css` names them `--ui-glyph-<name>`; show one with `<span class="ui-icon" style="--icon: var(--ui-glyph-speaker-high)">` (same role colours and theme treatment as the placeholders above), or override the token in a theme. Add a glyph here only when a kit screen needs it.

## System screens
The kit's title screen and game menu (`harness/kit/title.ts`, `menus.ts`, built by `bootGame`) are made of these components only, so a game's theme restyles them: `.ui-titlescreen` (`data-layout` left | center | bottom; `__head` the name, in the top corner; `__main` holding the `.ui-menu`, whose first item is `__item--primary`, bigger; `__settings` the bottom left corner in every layout, on the scene: the `.ui-vol` volume ramp centred above `__quality`, a `.ui-field` of `.ui-choices` with no label; `bottom` lifts its menu row above them), `.ui-menu` (`--row` horizontal, `__item--split` label + value), `.ui-dialog--wide` in a `.ui-backdrop`, `.ui-tabs`/`.ui-tabpanel`, `.ui-field` (every settings row: label left, control right, same height) with `.ui-slider`/`.ui-choices` (`.ui-vol` is the volume as a pointed triangle ramp with a square speaker handle as tall as the triangle under it, at least 22 px, and the percentage above; built from tokens and the theme's icon treatment, so it follows the theme) or, for on/off, a bare `.ui-toggle` on the right, `.ui-note`, `.ui-sep`. Review pages: `mockups/title.html`, `mockups/pause.html`, the kitchen sink. They live in `#ui-sys` beside `#ui` (scenes rewrite `#ui`). A menu item is highlighted by hover, focus or `.is-selected` alike (the kit moves focus on hover, so one item is lit at a time).

## Use in a game
`mountUI(game, theme)` from `harness/ui.ts` imports the CSS and puts `<div id="ui">` in Phaser's DOM container, which scales with the canvas (see `games/_template`). Lay out at the game's base size (1280x720, as the mockups). `#ui` has `pointer-events: none` and widgets opt back in, so clicks elsewhere reach the canvas. Lay out with `.ui-screen`, `.ui-anchor--tl|tr|bl|br|tc|bc`, `.ui-stack`, `.ui-row`. Dialog backdrops (`.ui-backdrop`) block clicks to the canvas on purpose.
State classes for forced or game-driven states: `.is-selected`, `.is-hover`, `.is-active`, `.is-focus`, `.is-open`.

## Results screen and transition cover
`harness/kit/results.ts` builds `.ui-results` (`data-layout` center | left | banner, `data-tone` win | lose) from `.ui-title`, `.ui-panel`, `.ui-stat`, `.ui-btn`, `.ui-key`, so the theme restyles it; mockup: `mockups/results.html`. `harness/kit/transition.ts` puts a `<canvas class="ui-cover">` over the stage in `#ui-sys`, coloured from `--kit-bg` and `--ui-c-accent`.

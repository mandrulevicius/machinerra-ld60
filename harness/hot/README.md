# Hot reload

While someone plays in the browser, agents edit the game. A code, level or asset change restarts only the scene it affects, with that scene's state, instead of reloading the page. Dev server only (`vite.config.ts` registers `hotPlugin()`; a build contains none of it). Agent rules: the `hot` skill.

## What happens on a change

| Change | Result |
|---|---|
| A scene module (`class X extends Phaser.Scene`, or `...Scene`, under `games/`) | The scene class is replaced; if the scene was running it restarts with its state. Toast `reloaded Play`. A scene that is not running is replaced silently (`updated Menu`). |
| A module only scenes import (rules, helpers, a level JSON) | Every scene module that imports it is swapped, as above. |
| Level JSON edited outside the editor (an agent, a text editor) | Same, through the scene that imports it. The editor's own Ctrl+S / `editor.save()` does not restart anything. |
| Atlas, image or `load.*` file under `games/<g>/` | The Phaser cache entries it fed (texture, animations built from it, json, audio) are dropped and the running scenes restart, so their `preload` loads it again. Toast `reloaded Assets: atlas`. |
| Sound under `games/<g>/public/audio/` | Decoded again in place, no restart. Music already playing keeps the old buffer until it starts again. |
| `tune(...)` / `slot(...)` definitions in a reloaded scene or module | New defaults, ranges and variants apply. A tuned value that differs from the old default stays. |
| A scene class other scenes extend (`Dungeon extends Play`) | Every registered scene that is or extends it is swapped. One in another module is re-parented onto the new base (`swapmap.ts`). |
| Anything else: `main.ts`, `harness/` (kit, boot, ui), a module that a non-scene module under `main.ts` also imports (save slices, dev command registrars: they would keep the old copy, or a second one of a store) | **Full page reload** (Vite's default). The server log says which module ended the path (`[hot] <file> reloads the page: ...`); the next page shows `full reload: <file> cannot be swapped`. |

Also a full reload: a module that exports no scene class, or an anonymous one (`export default class extends ...`). The console says why (`[hot] full reload: ...`, shown in the toast after the reload). A swap that throws reloads the page too. A scene class that no registered scene is or extends (new, renamed, unused) is left alone (`updated X`): registering it is `main.ts`, which reloads. A scene asleep when its code changes (the land under a dungeon) keeps its instance and state and takes the new class when it ends. A syntax error in the edit shows Vite's overlay and changes nothing.

Source art builds itself: a change under `games/<g>/art/` (an image or `sizes.json`) runs `scripts/assets.mjs <g>` on the dev server (`assets-plugin.ts`: debounced 0.5 s, one run per game at a time, logged as `[assets]` in the server output, toast `building atlas: <g>`, or `atlas failed: ...`). Its output (atlas json and pages) then reloads live as above. `npm run assets -- <game>` still works by hand. Raising `quality.lights` above the baked cap still needs a reload (kit).

Never reloaded: capture output (`games/*/capture/**` is not watched, `public/previews/` is ignored here), build output (`dist/`).

## State: `data.hot`
Before the restart the page asks the scene for `hotState()`, else `debugState()`, and starts it with `{ ...the data it was started with, hot: state }`. `create(data)` / `init(data)` read it; a scene that does not just starts fresh.
```ts
create(data: { hot?: { x: number; y: number } } = {}) {
  this.ball = this.add.circle(data.hot?.x ?? 640, data.hot?.y ?? 360, 24, 0x4aa3e0);
}
hotState() { return { x: this.ball.x, y: this.ball.y }; }   // optional: debugState() is used if absent
```
`debugState()` is often rounded or display-only, so a scene can define `hotState()` for exact values. State is plain data (passed by reference, not cloned). If the scene cannot report (it crashed in `create()`), the last state handed to it is reused, so a fix after a broken edit still lands where you were.

Scene setup that registers things (`onEscape`, `kit(this)`, DOM in `#ui`, console commands) clean up on `shutdown` as usual: the restart stops the scene first, so its handlers are released (checked for `onEscape`). The open game menu is closed before a restart (it holds the paused scene instances).

## Held while editing
If the level editor holds unsaved edits (`__game.editor.dirty()`), a reload waits (toast `reload held`) and applies after the save.

## How it works
- `vite-plugin.ts` appends `import.meta.hot.accept(...)` to scene modules; the callback hands the new module to the page (`client.ts`) or, if the page declines, `invalidate()` so Vite falls back to a full reload.
- `graph.ts` is the update propagation. Vite's own also stamps every importer above a scene module, which in a cycle (the lab: scene imports Menu, Menu imports main, main imports the scenes) makes the browser evaluate `main.ts` again from inside a scene and fail. Here only the path from the change to the scene modules is stamped. The level editor's save uses it too, so a later swap imports the saved file.
- `swapmap.ts` maps a new module onto the registered scenes by class name (pure, tested): which are replaced, which extend an old copy of a changed base.
- `client.ts` swaps the class (`scene.stop`, `remove`, `add`, `start`), notes each file a Phaser loader is given (to know which cache entry came from which URL) and restores state.

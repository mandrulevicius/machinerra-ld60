# Capture

Screenshots, clips, GIFs and trailer material from a running game, for the itch/Ludum Dare page. Dev server only (not in builds). Files land in `games/<game>/capture/`, which is git-ignored (large binaries; copy what you keep to the game's page assets or the itch upload). Agent rules: the `capture` skill.

## Playing yourself
In a game on the dev server: **F8** saves a still, **F9** starts/stops a recording (a toast says where it went). Needs a visible, focused tab. Both include the HUD.

## From an agent (`__game.capture`, in `javascript_exec`)
```js
await __game.capture.shot('title')                      // PNG with HUD -> games/<game>/capture/title.png
await __game.capture.shot('art', { ui: false })         // canvas only: clean art shot
await __game.capture.thumb('Kit')                       // 384px webp -> games/<game>/public/previews/Kit.webp (committed; lab menu cards)
await __game.capture.record(5, 'combat')                // 5 s realtime webm (HUD included; { ui: false } for none)
await __game.capture.start('run'); /* ... */ await __game.capture.stop()   // result has seconds and measured fps
await __game.capture.render(6, { name: 'intro', fps: 30, each: (i) => { if (i == 10) scene.press('left') } })
```
Variants side by side, in one call (`matrix`, below):
```js
await __game.capture.matrix('Title', { titleLayout: ['left', 'center', 'bottom'], theme: ['greybox', 'clean', 'fantasy'] })
// -> { index: 'games/g/capture/matrix/Title/index.png', files: [...9 paths] }; open index.png
```
Names are `[A-Za-z0-9_-]`; without one you get a timestamp. Overwrites on the same name. Results return the saved path (`warning` if the HUD overlay failed).

**HUD.** The game canvas is WebGL and the HUD is DOM over it, so a canvas copy has no HUD. By default the DOM container is rasterised (html-to-image, SVG foreignObject) and drawn over the canvas copy: faithful for text, CSS and fonts, but not for things the browser won't draw into an SVG (cross-origin images, video elements). In recordings the HUD is a cached bitmap redrawn when the DOM changes, so CSS animations in the HUD are sampled coarsely. Use `ui: false` when the HUD is not wanted.

**Smooth video needs real frames.** The browser pane only runs `requestAnimationFrame` (so the game loop) while it is open and visible; `tabs_select` is not enough if the pane is collapsed, and `record()` then fails with "recorded no frames". Two ways round it:
- `render(seconds, {fps, each})`: pauses the loop and steps the game itself, saving PNG frames to `<name>.frames/`. Deterministic and smooth in any tab state; about 5 frames/s of wall time. `each(i)` runs before frame `i`, use it to press keys or call scene debug methods. Then `npm run capture -- mp4 <dir>`.
- `start()`, then call `__game.step(1)` in a loop (`setTimeout` ~16 ms) and `stop()`: a webm that follows game time while the loop is stalled.
`shot()` works in any state (it steps one frame itself if none arrives).

## Variant matrix
`matrix(scene, { <slot>: [values], ... }, opts?)` shoots one scene under every combination of the given variant slots (`harness/kit/variants.ts`; the same slots as the dev UI's Kit tab, e.g. `theme`, `titleLayout`, or a game's own). Per combination it sets the variants, restarts the scene, steps `settle` frames itself, and saves a shot with the HUD. The game loop is paused meanwhile, so it works in a hidden or throttled pane.

Output, under `games/<game>/capture/matrix/<scene>/`: `<slot>=<value>__<slot>=<value>.png` per combination (slots in the order given) and `index.png`, a contact sheet of all of them labelled `slot=value`. Columns follow the last slot's values, rows the others.

| Option | Default | |
|---|---|---|
| `settle` | 60 | frames stepped after the restart, before the shot. Raise for scenes that load or animate in |
| `ui` | true | HUD in the shots |
| `data` | none | data the scene starts with |
| `each(combo)` | none | runs after settling, with `{ slot: value }`; then 10 more frames. For setup per combination, e.g. `() => __game.cmd('...')` |
| `sheetWidth` | 1500 | contact sheet width in px |

Finite CSS animations in the HUD (menu fade-ins) are jumped to their end before each shot: they run on wall time, which stepping does not advance, so a shot would catch them at opacity 0. Looping ones are shot as they stand.

It returns `{ index, files }` (repo-relative paths; plus `warning` if a HUD overlay failed). Afterwards the slots are set back and the scenes that were running restart with the data they started with (not their state). An unknown slot, variant or scene throws before anything changes.

Limit: the HUD is rasterised through an SVG, which draws DOM sliders and other native form controls imperfectly (a known `shot` limit).

## Bug reports
**F7** opens the dev console with `> ` ready: type what went wrong and press Enter (or type `> note` in the console any time, or use the Debug tab's Bug report button). That saves `games/<game>/capture/bugs/<time>.json` + `.png`: the note, scenes, `__game.state()`, errors with stacks, the last 30 console warnings and errors, fps, and the log shows the saved path (`harness/dev/README.md`). The first uncaught error saves one by itself (`crashed: true`) and leaves a toast. A throw in `update` or render stops Phaser's frame loop for good, so a crashed game freezes and its report has no picture. From an agent: `await __game.capture.report('note')` or `await __game.cmd('report note')`.

## Convert and assemble (ffmpeg, found on PATH or in `C:/Programs/ffmpeg-8.0-full_build/bin`)
```
npm run capture -- gif   games/g/capture/combat.webm [--width 480] [--fps 12]   # palette GIF; itch GIFs should stay small, lower --width/--fps to shrink
npm run capture -- mp4   games/g/capture/combat.webm                            # H.264, yuv420p, faststart
npm run capture -- mp4   games/g/capture/intro.frames --fps 30                  # from render() frames (gif: --src-fps 30)
npm run capture -- trim  games/g/capture/combat.mp4 2.5 6 --out games/g/capture/combat-cut.mp4   # start, length in seconds
npm run capture -- card  "My Game" 2 --sub "Ludum Dare 58" --out games/g/capture/title.mp4        # title card (--bg, --fg hex, --size)
npm run capture -- concat games/g/capture/trailer.mp4 games/g/capture/title.mp4 games/g/capture/combat-cut.mp4   # any number of clips; scaled/padded to --size 1280x720, --fps 30
npm run capture -- music games/g/capture/trailer.mp4 path/to/track.mp3           # adds audio, fades out at the end
```
Output goes next to the input unless `--out`. Captured video has no sound; add music last with `music`. Quote multi-word text.

## Safety
`POST /__capture/save?path=` (`vite-plugin.ts`) writes only `games/<game>/capture/<name>.png|webm`, `<name>.frames/<n>.png`, `matrix/<scene>/<slot>=<value>[__...].png` (or `index.png`) and `games/<game>/public/previews/<name>.webp`, same-origin only, and the file watcher ignores that folder so saving never reloads the game.

# Machinerra performance

Wondering Hextron's perf, UI and graphics lessons applied to Machinerra, on top of P51 (prop atlas, pooled sprites, baked ground chunks). Commits `40a7f541`, `88d9dc2c` (no visual change) and `09785243` (reviewed visual changes). Measured in the Claude app pane on an RTX 3070 Ti under shared load, so times are relative; object and draw counts are not load-dependent.

## Changes

| Change | Where | Gain | Look |
|---|---|---|---|
| `paintGround` inner loop: cached Voronoi cells, inlined colour mixing, hoisted lookups | `groundart.ts` | Paint 3145 → 1522 ms headless (median of 5); land change 2052 / 2299 → 1768 / 1826 ms in the browser | Byte-identical (golden hashes, `groundart.test.ts`) |
| Previous land's ground texture freed after the next one paints; never from a dungeon's Play | `groundart.ts` `freeGround`, `Play.ts` | Ground textures resident after 3 lands 3 → 1 (~30 MB each) | None |
| `getBase64` icon URLs cached per texture and frame | `gearart.ts` `texUrl`; Play, Hub, trader, workshop, dock | Repeat icon encodes gone | None |
| HUD writes only on change (`bind()` after Hextron's `ui/dom.ts`); `q(k)` lookups cached | `ui/bind.ts`, `hud.ts` | Fewer DOM writes and queries a frame | None |
| Command mode skips its draw when idle | `commandmode.ts` | One Graphics clear and redraw a frame less | None |
| `lampPass` reuses its set, map and probe | `lightview.ts` | No per-frame allocations there | None |
| Frame total of the above | | render-bench city 42 cpu 2.08 → 1.29 ms a frame; worst frame 7.4–19.7 → 2.3–17.7 ms | |
| `__game.step(n, {render:false})`: fixed-step without drawing | `harness/stepfixed.ts`, `harness/bridge.ts` | 600 steps from a fresh land ~570 → 80 ms; clock 10.000 s both ways (`sim/fixedclock.test.ts`) | Tests only |
| Render tier: measured median frame ms, lower-only, capped at the player's quality; trims the lamp cap (16 / 8) and ground shader detail (`uDetail`) | `tier.ts`, `lightview.ts`, `groundlive.ts`, `.frag`; `?render=`, dev `render` | For slow machines; nothing changes at high | Low: no motes or breathing glow, coarser cloud grain |
| HUD glow pulses animate opacity on a pseudo-element instead of `box-shadow` | `style.css`, `hub/talk.css` | No repaint a frame over the canvas | Same in stills |
| Map redraws on input, else at 10 Hz | `mapview.ts` | ~6x fewer map redraws while open | Crews and pings animate at 10 Hz |
| Event fades from a pool; additive glows in two layers | `fxpool.ts`, `junkview.ts`, `foeview.ts`, `botview.ts` | No tween or Graphics made per event; no draw-count change measured (~57 a frame in a swarm) | Auras under units, eyes over the world |
| Title ground has its own key and is freed on shutdown; painted at px 1 | `titleart.ts` | Title texture no longer resident during play | None (px 2 lost the mesa rims) |

## Still costly
- First `Play.create`: ~3.2 s, one-time art (`house()` palette passes).
- Land change: ~1.8 s; `wearGround`, `buryTech`, `mesaMask` canvas draws and the upload remain. Slicing the paint over frames behind the transition (Hextron's `frameBudget.ts`) would hide it, but every `paintGround` caller needs the finished buffer.
- Title boot paints a px-1 land (~1.6 s headless).
- The render tier's 22 / 34 ms thresholds are Hextron's guesses, untested on slow hardware; a 30 Hz display measures ~33 ms and lands in medium (lamps 16). The hub's ground stays at full detail.

## Measuring
- `Play.create`: from `?scene=Place`, wrap the Play scene's `create`, then `__game.goto('Play', {seed, biome})` with the loop stepped. A hidden pane throttles timers, so wall time to a scene means nothing.
- Frames: `tools/render-bench.js` on `?scene=Play&seed=42&biome=city`.
- Look: `perf-shots.json` beside this doc, through `O_CLI_Browser_Check` with `serve` set to the checkout (`?flown=3` skips the intro mission; a set boots the title first, since a fresh page's first `goto Play` exceeds the check's 15 s goto).
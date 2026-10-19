# Dev UI

One place for the dev tools. Agent rules: the `dev` skill. **F10** opens a sidebar on the right with four tabs, and the game's own. Dev server only: it is on in `vite` dev and off in builds unless the URL has `?dev=1`; `bootGame` mounts it through `mountSidebar` (`kit/sidebar.ts`), and the code is loaded on demand, so a build never fetches it without `?dev=1`. The sidebar lives on the page, not in Phaser's DOM container: game scaling and scene UI changes don't touch it and screenshots don't include it. Keys typed in it (except F-keys) never reach the game.

| Tab | What |
|---|---|
| Kit | variants, tuning values, audio, quality, export (`kit-tab.ts`) |
| Debug | live `__game.state()` (4x/s), fps and object counts, pause/resume, step 1 frame, jump to a scene, Bug report, link to the games list (`debug-tab.ts`) |
| Editor | opens or closes the level editor (same as F2, which stays) and lists its keys; opening closes the sidebar because the editor has its own panels on the right (`editor-tab.ts`) |
| Console | log viewer, command line, notes for agents (`console-tab.ts`) |
| a game's own | `addDevTab('Game', () => ({ el, show?, hide? }))` (from `harness/kit`, called from `main.ts`): the game's settings and state in one place; `build` runs once the sidebar is mounted. Buttons should run the game's dev commands (`__game.cmd`) so the tab and the console never disagree. Example: Machinerra `src/devtab.ts` |

## Console
- **Log:** everything `console.log/info/debug` (shown as log), `warn`, `error`, and uncaught errors and rejections with their stacks. Filter by level, Clear. Last 500 lines, kept whether or not the tab is open; the rows are built only while the Console tab is on screen (rebuilt from the stored lines when it opens). `__game.logs.entries`, `.on(fn)`, `.clear()`. (`__game.console` is unchanged: the last 30 warnings and errors, as bug reports use it.)
- **Commands:** type a name and arguments, Enter. Tab completes names and the first argument (scene names for `goto`), up/down recall history, Escape returns the keyboard to the game.
- **Notes for agents:** a line starting with `>` (or the Note button) saves a bug report with that text as the note, and the log shows the saved path. **F7** opens the console with `> ` ready. Reports land in `games/<game>/capture/bugs/` (`harness/capture/README.md`).

## Commands
Every command is in a group. Built in: `dev` (`help`, `goto <scene>`, `step [n]`, `marks [on|off]`, `pause`, `resume`, `report [note]`) and `kit` (`tune [key] [value]`, `quality [low|medium|high]`). A game's commands go in a group named after the game unless it passes one.

`help` prints one line per group with its command names (game groups first); `help <group>` the usage and help of each command in it; `help <command>` that command's. `__game.cmd('help')` returns the same text, so an agent reads it in one call. Names stay short (`spawn`); `group.name` (`units.spawn`) works too and is needed only where two groups use the same name: the bare name then fails with the qualified choices, and `help` shows such names qualified. Tab completes across groups (`units.` narrows to one).

A game adds its own (from a scene's `create()` or anywhere; registering a name again in the same group replaces it):
```ts
import { command } from '../../../harness/dev/commands';

command('clicks', ([n]) => { this.clicks = Number(n); return `clicks = ${this.clicks}`; }, 'clicks [n]: set the click count');
command('spawn', run, 'spawn <kind> [n]: ...', { group: 'units', args: () => KINDS }); // own group, Tab candidates
```
`command(name, run, help, opts?)` returns a function that removes it. `opts` is `{ group?, args? }`, or just the `args` function (Tab candidates for the first argument). `run(words)` gets the words after the name (quotes group them) and may be async; a string is shown as is, `undefined` as `ok`, other values as JSON, a throw as `error: ...`. Names and groups have no spaces or dots. The pattern is in `games/_template/src/Play.ts`; a grouped game is `games/wildhold/src/dev.ts`.

## Code
`__game.dev`, `__game.logs` and `__game.cmd` (the console's commands from code) are listed in the `dev` skill. The pure parts (`commands.ts`: registry, groups, help text, parsing, completion) have tests; `builtins.ts` registers the built-ins when the bridge starts.

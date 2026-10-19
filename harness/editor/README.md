# Level editor

Place and tune things (objects, lights, emitters, zones) in the running game; the result is a JSON file agents read. Agent rules: the `editor` skill. Dev server only: `loadLevel` imports the editor behind `import.meta.env.DEV`, so a production build contains none of it (`level.ts` ships; it is small).

## Use in a game
```ts
import { defineType, loadLevel } from '../../../../harness/editor/level';
import level from '../../levels/demo.json';

const TYPES = {
  block: defineType({
    props: { width: { type: 'number', default: 96, min: 8, max: 400 }, color: { type: 'color', default: '#5b6b8c' } },
    create: (scene, entity, p) => scene.add.rectangle(0, 0, p.width, 48, p.color), // p: props with defaults, colours as numbers
  }),
  light: defineType({ gizmo: { icon: 'sun', color: 0xffd34d }, create: (s) => s.add.pointlight(0, 0, 0xffffff, 140, 1) }),
};

// in a Scene's create():
const lvl = loadLevel(this, level, TYPES, { path: 'games/lab/levels/demo.json' });
lvl.get('block-1'); lvl.find('light'); // GameObjects, kept live while editing
```
- `create` builds the object at (0,0); the loader sets x, y, rotation, scale afterwards. Return a GameObject; for anything else (a `lights.addLight` light) return a Container and clean up in `once('destroy')`.
- Prop types: `number` (min/max/step; a slider when both are set), `color` (`'#rrggbb'`), `boolean`, `enum` (`options`). Changing a prop re-runs `create` for that entity.
- `gizmo` is for things with no visible body: `icon` (`sun`, `burst`, `diamond`, `ring`, `cross`), `color`, `size` (screen px), `area: true` to show its `getBounds()` as a shaded rectangle (zones). A type without `gizmo` is outlined by its bounds.
- Pass `path` to be able to save. `loadLevel(..., { path, onSave })`: `onSave(data)` is called with what was just written, for a scene that shows state derived from the file (Machinerra's place bench repaints its ground).

## Controls
F2 toggles editing (`?edit=1` starts in it); the Editor tab of the dev sidebar (F10) opens and closes it too and lists these keys (`harness/dev/README.md`). The scene is paused while editing; **Run** or `P` lets it run so emitters and motion play (game keys then work too).

| | |
|---|---|
| Click / Shift+click / drag on empty | select / toggle / marquee select (the Entities list also selects) |
| Drag | move, snapped to the grid; hold Alt for free move |
| Yellow dot above / square at corner | rotate (15° steps when snapping or Shift) / scale |
| Q, E | rotate -/+ (15° snapping, 5° free, Shift 1°) |
| `[`, `]` | scale -/+ 0.1 |
| Arrows | nudge by grid (Shift: 1 px) |
| Add (left panel), then click | place a type; Shift keeps placing |
| Delete, Ctrl+D | delete, duplicate |
| Ctrl+C, Ctrl+X, Ctrl+V | copy, cut, paste at the mouse (works across levels in the same page) |
| Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y | undo, redo |
| Ctrl+S | save (writes the file; no page reload) |
| G | grid snap on/off (size in the top bar) |

Properties of the selected entity (id, x, y, rotation, scale, type props) are in the right panel.

## File
`games/<game>/levels/<name>.json`, one entity per line:
```json
{ "entities": [ {"id":"block-1","type":"block","x":320,"y":480,"rotation":90,"scale":2,"props":{"width":200}} ] }
```
`rotation` is degrees (omitted when 0), `scale` is uniform (omitted when 1), `props` holds only what was set (the rest come from the type's defaults). Other top-level keys are kept.
The save endpoint (`vite-plugin.ts`, registered in `vite.config.ts`) is `POST /__editor/save {path, data}` and writes only `games/<game>/levels/<name>.json` or one folder down (`levels/<folder>/<name>.json`, e.g. `levels/places/`) for an existing game; a save by the editor does not reload or restart anything, while an edit of the file from outside restarts the scene that imports it (`harness/hot/README.md`).

`__game.editor` (list, add, move, save, undo) is for agents: the `editor` skill.

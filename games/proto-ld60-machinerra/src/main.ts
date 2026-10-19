import { addDevTab, audioFor, bootGame, resetHints, themeSlot, transition, warmAtlas } from '../../../harness/kit';
import { command } from '../../../harness/dev/commands';
import { TITLE_SCENE } from '../../../harness/kit/menus';
import { Dungeon, Play } from './Play';
import { Ascent } from './hub/Ascent';
import { Hub } from './hub/Hub';
import { PlaceBench } from './Place';
import { registerPlaceCommands } from './placedev';
import { registerClassCommand } from './classcmd';
import { gameTab } from './devtab';
import { registerSaveCommands } from './saveslices';
import { registerDeedCommands } from './hub/deeds';
import { hub, menuSlot, snapshot } from './hub/save';
import { installPresence } from './hub/questplaces';
import { titleArt } from './titleart';
import { guideTab, openGuide } from './guideview';
import { CREDITS, STUDIO } from './credits';
import { PLAY_SCENES, tickPlaytime } from './hub/playtime';
import { AUDIO, HUB_MUSIC, SFX_TRIM, TONE, playMusic } from './sound';
import './theme.css';
import './style.css';

themeSlot.add('machinerra', 'machinerra');
// The quest-only places (the Kennel, the stray...) are in a land while their step is active: the places' presence rules read the saves (P42).
installPresence();

// Fonts, UI, bridge, key capture, title screen, game menu, dev sidebar: see harness/kit/boot.ts.
bootGame({
  id: 'proto-ld60-machinerra',
  name: 'Machinerra',
  // `Place` is the place bench (dev only, `?scene=Place&id=graveyard`).
  scenes: { Play, Dungeon, Ascent, Hub, ...(import.meta.env.DEV ? { Place: PlaceBench } : {}) },
  start: 'Play',
  // The title (Continue, New game, Options, Credits) shows unless the URL names a scene: `?scene=Play` / `?scene=Hub` skip it.
  titleScreen: true,
  // The title's background: the zeppelin over the sands, brass cogs turning; it flies out on Continue or New game (titleart.ts).
  titleArt,
  // One slot, saved by the hub itself on arrival (no mid-mission save): Continue goes to the hub, New game erases the slot after a confirm (the deeds' profile stays: `persist` with `keep`).
  save: { store: menuSlot, count: 1, auto: true, save: () => snapshot(), load: (_data, game) => transition(game, 'Hub'), wipe: () => hub.reset() },
  variants: { theme: 'machinerra', lights: 'dusk', particles: 'clean' },
  // Input actions, not keys: players rebind them in the game menu's Controls tab and use a gamepad.
  actions: {
    up: ['W', 'UP', 'PAD_LS_UP'],
    down: ['S', 'DOWN', 'PAD_LS_DOWN'],
    left: ['A', 'LEFT', 'PAD_LS_LEFT'],
    right: ['D', 'RIGHT', 'PAD_LS_RIGHT'],
    // Left click: the primary weapon (the shovel); right click: the secondary (the steam gun, once found). In command mode the mouse commands instead.
    fire: ['MOUSE_LEFT', 'PAD_RT'],
    fire2: ['MOUSE_RIGHT', 'PAD_LT'],
    // Keys (Minos): E uses, Space dashes, F kicks, Shift assigns groups.
    use: ['E', 'PAD_A'],
    map: ['M', 'TAB', 'PAD_BACK'],
    support: ['Q', 'PAD_LB'],
    kick: ['F', 'PAD_B'],
    // Gear (sim/gear.ts): I the inventory, Space the rear piece's dash, G the pack piece's skill.
    inventory: ['I', 'PAD_RB'],
    // J the quest log (pauses a mission, like the inventory).
    journal: ['J'],
    // The Oracle's guide (P28): H, or the pad's Back held (guideview.ts reads the hold; a tap stays the map).
    guide: ['H'],
    dash: ['SPACE', 'PAD_X'],
    skill: ['G', 'PAD_Y'],
    // Command mode (a toggle): slow time, zoomed out; click and drag select, right click orders. 1-9 select a crew, Shift+number puts the selection in it (0: the crew that walks with you).
    command: ['C'],
    groupSet: ['SHIFT'],
    ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`group${n}`, [String(n)]])),
  },
  axes: { moveX: ['left', 'right'], moveY: ['up', 'down'] },
  // The sounds (sound.ts), loaded before the first scene. Every song loads when first heard.
  audio: AUDIO,
  credits: [...CREDITS, `A ${STUDIO} game`],
  // The Oracle's guide: its unprompted hints in Options and the Esc menu; the guide itself on the Esc menu (guideview.ts).
  tabs: [{ id: 'oracle', label: 'Oracle', build: guideTab }],
  menuItems: [{ id: 'guide', label: "The Oracle's guide", run: openGuide }],
}).then((game) => {
  audioFor(game).trimSfx(SFX_TRIM);
  // index.html's "Loading…" goes once the first scene (the title, or the one a ?scene= skips to) is made.
  const loaded = () => document.getElementById('boot')?.remove();
  if (game.scene.scenes.some((s) => s.sys.isActive())) loaded();
  else for (const s of game.scene.scenes) s.events.once('create', loaded);
  // The art atlas comes in while the title shows, so the hub and the missions find it loaded (a scene that starts first loads it itself).
  void warmAtlas(game);
  // The run's play time (hub/playtime.ts, the outro's time to finish): every frame a game scene runs.
  game.events.on('step', (_t: number, delta: number) => {
    if (PLAY_SCENES.some((k) => game.scene.isActive(k))) tickPlaytime(delta);
  });
  // The title has the hub's song, open (a scene left before it may have muffled it).
  const title = game.scene.getScene(TITLE_SCENE);
  const play = () => {
    const a = audioFor(game);
    playMusic(a, HUB_MUSIC, { fade: 2 });
    a.music.tone({ ...TONE.fight, detune: 0, fade: 2 });
  };
  title?.events.on('create', play);
  if (title?.sys.isActive()) play();
});

// The dev sidebar's own tab (F10): rescued NPCs, stores, city stage, spare oil, air support, the time of day.
addDevTab('Game', gameTab);
// `save audit`, `stock`, `discovered`: the save belongs to no scene.
registerSaveCommands();
// `bench`, `benchgrid`, `placeland`, `placefiles`: seeing a place alone or in a land (placedev.ts).
registerPlaceCommands();
// `classes`: the class overlay in a mission or the bench (classcmd.ts).
registerClassCommand();
registerDeedCommands();
command('hints', ([sub]) => (sub === 'reset' ? (resetHints(), 'hints forgotten: each shows again when its moment comes') : 'hints reset: a hint shows until done once, then never again (saved per game, across New game)'), 'hints reset: show the control hints again', { group: 'save', args: () => ['reset'] });

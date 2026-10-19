/**
 * The Oracle's guide (P28; `docs/systems.md`, "UI"): the rules and the data, no DOM (`guideview.ts` draws it).
 * H (pad: Back held) lists the UI on screen now, each with one line in the Oracle's voice; picking one points at it.
 * Unprompted, once each, a cue the player has not used gets one line with a "Show me" lever; Options can turn those off.
 *
 * **An entry is data**: `id`, `where` (the scene: a mission or the hub), `name` (the list), `line` (the Oracle's words; `{action}`
 * tokens become key prompts), `at` (what it points at) and optionally `due`, the unprompted condition (a function of `Cue`).
 * `at` is `{ dom: [selector, ...] }` (the first that is on screen; a HUD element, `[data-k=...]` or `[data-g=...]`) or
 * `{ world: key }` (a thing on the deck; the scene turns the key into a screen spot).
 *
 * **Add an entry:** a row in `ENTRIES` for a new piece of HUD (the test fails on a `data-k` in `hud.ts` or `panels.ts` that no entry
 * covers: list it in `PARTS` when it is a piece of another entry, or in `PLAIN` when it is not something to explain). A station
 * aboard is `STATIONS` (or a built NPC station: `hubEntries`). **Add a cue:** a field in `Cue` that the scene fills, and a `due`
 * on the entry (nothing else; `used` is `note()` from the scene when the player does the thing).
 */
import { npc, type HubState } from './hub/state';
import { persist } from './hub/save';

/** Numbers: first guesses (not in a source). */
export const GUIDE = {
  /** Seconds a pointer and its ring stay, and how long a tape line stays up (Minos: 3 s for the pointer). */
  pointS: 3,
  /** An unprompted line waits for this many seconds in a scene before the first, and this long between two. */
  settleS: 30,
  gapS: 45,
  /** An unprompted line fades if not answered after this long. */
  hintS: 14,
  /** The pad's Back held this long opens the guide (a tap is the map). */
  padHoldS: 0.8,
};

export type Where = 'mission' | 'hub';

/** What the scene knows now, for the unprompted conditions. */
export interface Cue {
  where: Where;
  /** Missions flown and landed (`HubState.missions`): the mission under way is the next, so the third is `missions >= 2`. */
  missions: number;
  /** A mission's carry strip: old tech held and room (`Sim.junk`, `Sim.stripSize`). */
  junk: number;
  stripSize: number;
  /** The hub's punch-card picks waiting at the church (`hub/researchslice.ts` `picksWaiting`); a mission has none. */
  research?: number;
}

/** What the player has done and been told, across runs (a kept slice: New game keeps it, like the kit's hints). */
export interface GuideState {
  /** The unprompted lines are on (Options). */
  hints: boolean;
  /** Entry ids already offered unprompted: never again. */
  seen: string[];
  /** Things the player has done (`note`): 'cans' a spare can used, 'command' command mode opened. */
  used: string[];
}
export const freshGuide = (): GuideState => ({ hints: true, seen: [], used: [] });
export const guideSave = persist<GuideState>('guide', freshGuide, {
  keep: true,
  sample: { hints: false, seen: ['reserve', 'command'], used: ['cans'] },
});

export type At = { dom: string[] } | { world: string };

export interface GuideEntry {
  id: string;
  where: Where;
  name: string;
  line: string;
  at: At;
  /** The unprompted condition; no `due`, never offered unprompted. The state's `used` is passed in. */
  due?: (c: Cue, used: ReadonlySet<string>) => boolean;
}

const k = (key: string) => `[data-k="${key}"]`;
const g = (key: string) => `[data-g="${key}"]`;

/** The mission's HUD (`hud.ts`) and what draws over it (command mode). */
const MISSION: GuideEntry[] = [
  { id: 'clock', where: 'mission', name: 'The day dial', at: { dom: [k('clock')] }, line: 'The dial is the day: noon at the top, midnight at the bottom. After midnight every enemy grows stronger by the second. A bar under it counts down a passing weather: to its start, then to its end.' },
  { id: 'hp', where: 'mission', name: 'Oil', at: { dom: [k('hp')] }, line: 'Oil is your health. Run out and you go down; a spare can gets you back up.' },
  { id: 'reserve', where: 'mission', name: 'Spare oil', at: { dom: [k('reserve')] }, line: 'Spare oil: cans hung on your pack. Run out of oil and a can gets you back up where you fell; with none, I winch you to the lift.', due: (c, used) => c.where === 'mission' && c.missions >= 2 && !used.has('cans') },
  { id: 'steam', where: 'mission', name: 'Steam', at: { dom: [k('steamBar')] }, line: 'Steam is what your guns shoot. The bar shows once a gun is in a slot.' },
  { id: 'weapon', where: 'mission', name: 'Weapon in hand', at: { dom: [k('weapon')] }, line: 'The weapons you hold: L is the left click, R the right click.' },
  { id: 'stock', where: 'mission', name: 'What you carry', at: { dom: [k('stock')] }, line: 'Carried this mission, and brought home with the lift: scrap from kills, copper from ruins, coal from the seams.' },
  { id: 'junk', where: 'mission', name: 'The carry strip', at: { dom: [k('junk')] }, line: 'Old tech from dead ruins: the carry strip. It rides home with you; fit it to a robot at the workshop.', due: (c) => c.where === 'mission' && c.stripSize > 0 && c.junk >= c.stripSize },
  { id: 'parts', where: 'mission', name: 'Enemy parts', at: { dom: [k('salvage')] }, line: 'Enemy parts you have picked up. They go to the workshop at home.' },
  { id: 'track', where: 'mission', name: 'What applies here', at: { dom: [k('track')] }, line: 'Above the objective: the old rule or quest steps this land can advance, with their count, and who waits here.' },
  { id: 'obj', where: 'mission', name: 'The objective', at: { dom: [k('obj')] }, line: 'The objective: what to do next.' },
  { id: 'boss', where: 'mission', name: "A boss's health", at: { dom: [k('boss')] }, line: 'A boss is about, and this is its health.' },
  { id: 'her', where: 'mission', name: 'The Princess', at: { dom: [k('her')] }, line: 'Your wife, on the antenna. A few words a mission, never in a fight. She is right about the feet.' },
  { id: 'oracle', where: 'mission', name: 'My panel', at: { dom: [k('oracle')] }, line: 'That is me, Communicator. My advice and my warnings come through this panel.' },
  { id: 'support', where: 'mission', name: 'D-city air support', at: { dom: [k('support')] }, line: 'D-city air support: the Zeppelin Wanderer, far above, answers your call. The number is how many calls are left; {support} sends it where your cursor is.' },
  { id: 'crews', where: 'mission', name: 'Your crews', at: { dom: [k('roster')] }, line: 'Your robots, one chip each: its crew number and colour, its role, its health and what it is doing. 1 to 3 pick a crew. A dot after the number (1•) marks a robot sent on its own order.' },
  { id: 'map', where: 'mission', name: 'The map', at: { dom: [k('mapbtn')] }, line: 'The map ({map}): the land you and your robots have seen, rough rings where something waits, and your crews. The antenna on your head warms toward the nearest ring. The mission slows while the map is open. Pick and order robots on it as in command mode.' },
  { id: 'command', where: 'mission', name: 'Command mode', at: { dom: ['.mc-cmd.is-on .mc-cmd__plate', k('roster')] }, line: 'Command mode ({command}): time slows and the view pulls back. Drag to select, right click to order: a whole crew goes as a crew, a few of its robots go on their own. The number keys pick a crew; {groupSet} and a number puts the picked robots in it.', due: (c, used) => c.where === 'mission' && c.missions >= 1 && !used.has('command') },
];

/** The hub's HUD (`hub/panels.ts`) and the stations on the deck. `world` keys are resolved by `Hub.guideSpot`. */
const HUB: GuideEntry[] = [
  { id: 'room', where: 'hub', name: 'The room', at: { dom: [k('room')] }, line: 'The room you stand in, aboard the Zeppelin Wanderer.' },
  { id: 'me', where: 'hub', name: 'Your name plate', at: { dom: [k('me')] }, line: 'Your name and the title you wear. Click it to wear another title you have earned.' },
  { id: 'scrap', where: 'hub', name: 'Scrap', at: { dom: [g('scrap')] }, line: 'Scrap: the main currency, from kills.' },
  { id: 'copper', where: 'hub', name: 'Copper', at: { dom: [g('copper')] }, line: 'Copper: for building and one-time upgrades: stations, ranks, the chassis, the city.' },
  { id: 'coal', where: 'hub', name: 'Coal', at: { dom: [g('coal')] }, line: 'Coal: fuel for expeditions, mined from seams by gatherers. Feed it to an expedition at the Expedition office and scrap comes back.' },
  { id: 'cans', where: 'hub', name: 'Oil cans', at: { dom: [g('cans')] }, line: 'Spare oil cans: lives. Every lift goes down with a full pack, refilled at home.' },
  { id: 'partsHome', where: 'hub', name: 'Parts', at: { dom: [g('parts')] }, line: 'Parts the machines dropped, in the workshop stores.' },
  { id: 'robots', where: 'hub', name: 'Your robots', at: { dom: [g('robots')] }, line: 'Your robots, on the lift over all you own. Every robot that is not a wreck rides.' },
  { id: 'cores', where: 'hub', name: 'AI cores', at: { dom: [g('cores')] }, line: 'AI cores: one per robot; a new body needs a free one. They come from Core Vaults and from bosses.' },
  { id: 'prompt', where: 'hub', name: 'What is in reach', at: { dom: [k('prompt')] }, line: 'Whatever is in your reach shows here, with the key to use it.' },
  { id: 'say', where: 'hub', name: 'The speaker panel', at: { dom: [k('say')] }, line: 'What I say, and whoever you speak to, shows here.' },
  { id: 'altar', where: 'hub', name: 'The Oracle', at: { world: 'npc:highPriest' }, line: 'That is me, at my altar. Come and talk.' },
  { id: 'research', where: 'hub', name: 'Old research', at: { world: 'npc:highPriest' }, line: 'A punch card is waiting for you: old research, one rule out of three. Ask me for it, and slot it in your satchel.', due: (c) => c.where === 'hub' && (c.research ?? 0) > 0 },
  { id: 'course', where: 'hub', name: 'Course table', at: { world: 'station:command' }, line: 'The course table: plot the course and pick the land the lift lowers you to.' },
  { id: 'bench', where: 'hub', name: 'Workbench', at: { world: 'station:workshop' }, line: 'The workbench: look over your parts and your robots; build, rebuild and fit them.' },
  { id: 'window', where: 'hub', name: 'D-city window', at: { world: 'station:window' }, line: 'The D-city window: look out at the city. It grows with the copper you bring back, and shows its buildings, the new ones as scaffolding until the lift is back.' },
  { id: 'lever', where: 'hub', name: 'Lift lever', at: { world: 'station:lift' }, line: 'The lift lever: ride the lift down to the land you picked.' },
];

export const ENTRIES: GuideEntry[] = [...MISSION, ...HUB];

/** The deck's fixed stations: `Station.id`s in `layout.ts` the hub entries point at (the test checks each has one). */
export const STATIONS = ['command', 'workshop', 'window', 'lift'];

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One entry for each station built on a lot: its name and what it brings, read from `NPCS` (and the house and improvements: `npc`). */
export function hubEntries(s: Pick<HubState, 'stations'>): GuideEntry[] {
  return Object.keys(s.stations).flatMap((id) => {
    const n = npc(id);
    if (!n?.station) return [];
    return [{ id: `built:${id}`, where: 'hub' as const, name: n.station.name, at: { world: `built:${id}` }, line: `${n.station.name}: ${upper(n.unlocks)}.` }];
  });
}

/** Pieces of a covered element (a bar's fill, the dial's hands): the HUD's `data-k`s that are part of another entry. */
export const PARTS: Record<string, string> = {
  bossName: 'boss', bossHp: 'boss', hpText: 'hp', hpBar: 'hp', where: 'room', steam: 'steam', steamText: 'steam', otext: 'oracle', omore: 'oracle', oicon: 'oracle', htext: 'her',
  supportName: 'support', supportKey: 'support', supportState: 'support', bells: 'clock', ctime: 'clock', cphase: 'clock', cnext: 'clock', weather: 'clock', wname: 'clock', wfill: 'clock', orb: 'clock', sun: 'clock', moon: 'clock',
  who: 'say', text: 'say', fee: 'reserve',
};
/** Not something to explain: the vignette and the colour wash, the portrait, the banner and the hub's notice, the lift's ask card, the hub's panel slot, the name plate's rows. */
export const PLAIN = ['dusk', 'wash', 'alarm', 'face', 'banner', 'notice', 'modal', 'stores', 'ask'];

/** The entries a scene may list (before the screen is asked): its own, and for the hub the built stations. */
export const entriesFor = (where: Where, s?: Pick<HubState, 'stations'>) => [...ENTRIES.filter((e) => e.where === where), ...(where === 'hub' && s ? hubEntries(s) : [])];

/** The entry to offer unprompted now, if any: one whose condition holds, not yet offered, hints on. */
export function dueNow(entries: GuideEntry[], cue: Cue, st: GuideState): GuideEntry | null {
  if (!st.hints) return null;
  const used = new Set(st.used);
  return entries.find((e) => e.due && !st.seen.includes(e.id) && e.due(cue, used)) ?? null;
}

/** Record that an entry was offered (it never is again), or that the player did a thing (`used`). */
export const offered = (st: GuideState, id: string): GuideState => (st.seen.includes(id) ? st : { ...st, seen: [...st.seen, id] });
export const did = (st: GuideState, what: string): GuideState => (st.used.includes(what) ? st : { ...st, used: [...st.used, what] });

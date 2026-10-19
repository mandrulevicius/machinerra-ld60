/**
 * Missions 2 to 4's lessons (`games/ludum-dare-60/docs/onboarding.md`), plain TS: what is taught by now, and the Oracle's pauses.
 *
 * - **Gates.** `TAUGHT` is the missions flown before each tool opens: the map (M) and command mode (C) on mission 3, the D-city
 *   call (Q) on mission 4. `Sim.lessons.flown` comes from `SimOptions.flown` (the hub's `missions`); unset, everything is open
 *   (tests, the bench). A closed tool's HUD piece is held back (`gates`), its key does nothing (`Play`, `commandmode.ts`) and
 *   `callSupport` refuses.
 * - **Pauses.** `Lessons.hush`: the world waits (`Sim.step` does nothing else) while the Oracle says a line or two. A pause ends
 *   only when the player says so: a press once the lines are read (`press`, called by `Play` after `Hud.advance` has no more to
 *   show; Minos: nobody is rushed through a line) or when the player does the thing (`did`, called by `Play` for the map and
 *   command mode, by `callSupport` for the call).
 * - **Mission 1, the intro:** the boss's warning is a pause (`intro.ts` calls `pause`); nothing else of these runs there.
 * - **Mission 2, level 1:** the lift's pause at landing (Minos: the lift line belongs in her cutscene), no dial (its clock is
 *   locked, `clockhold.ts`), the lines it skips, the world cues (the tap, the mast,
 *   Sprocket's cables). **Mission 3:** the clock's pause at landing (the first mission whose day comes; the dial shows with it),
 *   then the map's, command mode's a little later. **Mission 4:** the call's pause when a hive is first in sight.
 * A pause never starts while another holds.
 * Every line and number is a guess at Minos's plan. Dev: `onboard lessons [flown]`.
 */
import { CLOCK_HOLD } from './clockhold';
import { T, TAP } from './defs';
import { dist } from './geom';
import type { HudId } from './onboard';
import type { Sim } from './sim';
import { placeWanderers } from './spawntiers';

/** Missions flown before each tool opens (mission 1 is the intro: 0 flown). */
export const TAUGHT = { map: 2, command: 2, barrage: 3 } as const;
export type Taught = keyof typeof TAUGHT;

/**
 * Guesses. `commandAfter`: seconds after the map's pause
 * before command mode's. `calm`: tiles no foe may be within for that pause. `hive`: tiles a hive is in sight for the call's.
 * `near`, `far`: tiles at which a level 1 cue is placed, and past which an untaken one is let go (it engraves).
 */
export const LESSON = { commandAfter: 20, calm: 10, hive: 12, near: 6, far: 14 };

/** What the Oracle's pause waits for: a press once her lines are read, or the tool used. */
export interface Hush {
  id: string;
  until: 'press' | Taught;
}

export class Lessons {
  hush: Hush | null = null;
  /** Lessons given this mission, by id. */
  readonly given = new Set<string>();
  /** When the map's pause ended (sim time). */
  mapAt = -1;
  /** The first expeditions' wanderers are placed (`spawntiers.ts`). */
  wandered = false;
  /** Level 1's cues by name (`sim.onboard` ids). */
  readonly cues: Record<string, number> = {};

  constructor(public flown = Infinity) {}

  /** The tool may be used on this mission. */
  open(t: Taught) {
    return this.flown >= TAUGHT[t];
  }
  /** This mission introduces it. */
  teaches(t: Taught) {
    return this.flown === TAUGHT[t];
  }
  /** The player did it: a pause waiting for it ends. */
  did(t: Taught) {
    if (this.hush?.until === t) this.hush = null;
  }
  /** The player pressed with nothing left to read: a pause waiting for that ends. */
  press() {
    if (this.hush?.until === 'press') this.hush = null;
  }

  summary() {
    return { flown: this.flown, open: (Object.keys(TAUGHT) as Taught[]).filter((t) => this.open(t)), hush: this.hush && { id: this.hush.id, until: this.hush.until }, given: [...this.given] };
  }
}

/** The clock's lesson runs on the first mission whose day comes (`CLOCK_HOLD` 'day': mission 3); a locked clock hides the dial. */
const clockLesson = (sim: Sim) => CLOCK_HOLD[sim.lessons.flown] === 'day';
const clockLocked = (sim: Sim) => CLOCK_HOLD[sim.lessons.flown] === 'lock';

/** Hold back the HUD pieces not taught yet (called as the Sim is made, and by the dev command; it never reveals: an empty HUD stays empty). */
export function gates(sim: Sim) {
  const L = sim.lessons, ob = sim.onboard;
  const held: HudId[] = [];
  if (!L.open('map')) held.push('map');
  if (!L.open('barrage')) held.push('support');
  if (clockLocked(sim) || (clockLesson(sim) && !L.given.has('clock'))) held.push('clock');
  ob.hide(...held);
}

/** A pause: the lines are said now (each once), and the world waits until `until`. */
export function pause(sim: Sim, id: string, until: Hush['until'], lines: { id: string; text: string; icon?: string }[]) {
  const L = sim.lessons;
  if (L.given.has(id) || L.hush) return;
  L.given.add(id);
  for (const l of lines) sim.say(l.id, l.text, 'warn', { hold: until !== 'press', ...(l.icon && { icon: l.icon }) });
  L.hush = { id, until };
}

/** Every step, before the world moves: starts a pause when its moment comes. True while one holds (the world waits). */
export function lessonStep(sim: Sim): boolean {
  const L = sim.lessons;
  if (sim.phase !== 'mission' || sim.dungeon) return (L.hush = null), false;
  if (sim.intro) return !!L.hush; // the intro starts its own (`intro.ts`)
  if (!L.wandered) (L.wandered = true), placeWanderers(sim);
  if (clockLesson(sim)) clockStep(sim);
  if (sim.land?.id === 'level1') level1Step(sim);
  if (L.teaches('map')) mission3(sim);
  if (L.teaches('barrage')) mission4(sim);
  return !!L.hush;
}

/** No foe close: a calm moment for a pause. */
const calm = (sim: Sim) => {
  const c = sim.controller;
  return !sim.hornets.some((h) => !h.dead && dist(h.x, h.y, c.x, c.y) < LESSON.calm * T);
};

/** Mission 3: the map at landing, then command mode once things are calm. */
function mission3(sim: Sim) {
  const L = sim.lessons;
  sim.said.add('crews'); // the generic crews line names the map and crews at once: the two pauses stand in for it
  if (!L.given.has('map') && sim.time > 1.2) {
    sim.onboard.reveal('map');
    pause(sim, 'map', 'map', [{ id: 'lesson-map', text: 'Open my map with {map}.', icon: 'key:map' }]);
  }
  if (L.given.has('map') && L.mapAt < 0 && L.hush?.id !== 'map') L.mapAt = sim.time;
  const robots = sim.crew.some((b) => !b.dead && !b.downed);
  if (!L.given.has('command') && L.mapAt >= 0 && sim.time > L.mapAt + LESSON.commandAfter && robots && calm(sim))
    pause(sim, 'command', 'command', [{ id: 'lesson-command', text: 'Press {command}, click a robot, then right click where it goes.', icon: 'key:command' }]);
}

/** Mission 4: the D-city call, asked for on the first hive in sight. */
function mission4(sim: Sim) {
  const L = sim.lessons, c = sim.controller;
  if (L.given.has('barrage') || sim.strike || !(sim.support[sim.call]! > 0)) return;
  const hive = sim.nests.find((n) => !n.dead && dist(n.x, n.y, c.x, c.y) < LESSON.hive * T);
  if (!hive) return;
  sim.onboard.reveal('support');
  pause(sim, 'barrage', 'barrage', [{ id: 'lesson-barrage', text: `Point at that ${sim.biome.talk.hive} and press {support}.`, icon: 'key:support' }]);
}

/** Mission 3: the clock's pause at landing (it stands in for her hello); the day comes, then the clock holds (`clockhold.ts`). */
function clockStep(sim: Sim) {
  if (sim.lessons.given.has('clock')) return;
  sim.said.add('hello');
  sim.onboard.reveal('clock');
  pause(sim, 'clock', 'press', [
    { id: 'clock-day', text: 'Mind the dial: the day wakes the machines.' },
    { id: 'clock-hold', text: 'This time it stops before dusk.' },
  ]);
}

/**
 * Level 1 (mission 2): the lift's pause at landing, no dial and fewer words: lines marked said (the Oracle's hello, the anomaly's word, the spare can's,
 * the mast's sight line, which names the map); the tap's short word; the cues, each placed as he comes near its thing and engraved once
 * done or left behind.
 */
function level1Step(sim: Sim) {
  const c = sim.controller;
  for (const id of ['hello', `anomaly-${sim.anomaly}`, 'spare', 'mast-sight']) sim.said.add(id);
  // The lift's word at landing, on mission 2 only (a dev replay of the land skips it); Minos's wording, in her voice (guess).
  if (sim.lessons.flown === 1) pause(sim, 'lift', 'press', [{ id: 'l1-lift', text: 'Should it all get too lively, the lift is right where you left it.' }]);
  const tap = sim.seeps.find((q) => q.kind === 'crude' && q.amount > 0);
  // A tile before the generic line's reach (`oracle.ts` `tapSight` speaks after he moves, this before), so the short one wins.
  if (tap && dist(c.x, c.y, tap.x, tap.y) < (TAP.sight + 1) * T) sim.say('tap', 'Crude. Stand in its steam to mend.', 'calm');
  const mast = sim.places.find((p) => p.id === 'mast'), sp = sim.places.find((p) => p.id === 'sprocket');
  cue(sim, 'tap', tap, { icon: 'oilcan' }, !!tap && dist(c.x, c.y, tap.x, tap.y) <= TAP.reach);
  cue(sim, 'mast', mast, { icon: '', key: 'use' }, mast?.state !== 'dark');
  cue(sim, 'sprocket', sp?.state === 'pinned' ? sp : undefined, { icon: '', key: 'use' }, !!sp && sp.state !== 'pinned' && sp.state !== 'guarded');
}

/** A level 1 cue: placed when he comes within `LESSON.near` tiles of `at`, taken when `done` or when he walks off past `LESSON.far`. */
function cue(sim: Sim, name: string, at: { x: number; y: number } | undefined, look: { icon: string; key?: string }, done: boolean) {
  const L = sim.lessons, ob = sim.onboard, c = sim.controller;
  const id = L.cues[name];
  if (id !== undefined) {
    if (done || (at && dist(c.x, c.y, at.x, at.y) > LESSON.far * T)) ob.take(id);
    return;
  }
  if (!done && at && dist(c.x, c.y, at.x, at.y) < LESSON.near * T) L.cues[name] = ob.cue({ x: at.x, y: at.y + T, ...look });
}

/**
 * The Oracle's voice in a mission: her script by the clock and the land (`oracle`), a dungeon's lines, the lift advice, and `say`, which speaks each line once by id.
 * Add a line: `say(id, text, tone)` where the moment is detected.
 * A line about the land reads `sim.biome.talk`, never a literal "sand" or "hornets".
 */

import { hurt } from './combat';
import {
  ANOMALIES,
  DAY,
  ELITE_TRAITS,
  FOES,
  MISSION,
  T,
  TAP,
  bossOf,
} from './defs';
import { dist } from './geom';
import type { Bot, Sim } from './sim';
import {
  type Hornet,
  upper,
} from './types';

export type OracleEvent =
  /** The Oracle speaks (each `id` once). */
  | { e: 'oracle'; id: string; text: string; tone: 'calm' | 'warn' | 'urgent'; /** Not the Oracle: the Princess on the antenna (P58, `princessvoice.ts`). */ who?: 'princess' }
  /** The Oracle suggests the lift. */
  | { e: 'advise'; id: string };

/** An elite's name for the Oracle: its traits, then its kind ("Hooded + Brood-rattle Rattler"). */
const denName = (h: Hornet) => `${(h.traits ?? []).map((t) => ELITE_TRAITS[t].name).join(' + ')} ${FOES[h.kind].name}`;

/** How long the Oracle counts as speaking after a line (the Static Antenna card): a base and a time a letter (guesses). */
export const SPEAK = { base: 2, perChar: 0.035 };

export const SPARE_LINE = "I've hung a spare can on your pack, dear. Should you fall, it'll get you up.";

/** The Oracle suggests the lift (once per reason); an edge arrow points at it for a while. Nothing is forced. */
export function advise(sim: Sim, id: string, text: string, tone: 'calm' | 'warn' | 'urgent' = 'warn') {
  if (sim.said.has(id) || sim.phase !== 'mission') return;
  sim.advised = true;
  sim.adviceAt.push(sim.time);
  sim.liftCue = MISSION.cue;
  say(sim, id, text, tone);
  sim.events.push({ e: 'advise', id });
}

export function say(sim: Sim, id: string, text: string, tone: 'calm' | 'warn' | 'urgent' = 'calm') {
  if (sim.said.has(id)) return;
  sim.said.add(id);
  sim.speakUntil = sim.time + SPEAK.base + SPEAK.perChar * text.length;
  sim.events.push({ e: 'oracle', id, text, tone });
  sim.engine.emit({ kind: 'oracle', self: sim.controller });
  sim.drainFx();
}

/** The anomaly's word: a landing line a few seconds in; for a passing weather, a line at each warning (the first in full, the rest short). */
function anomalyLines(sim: Sim, t: number) {
  const a = ANOMALIES[sim.anomaly];
  if (a.hello && t > 9) say(sim, `anomaly-${sim.anomaly}`, a.hello, 'warn');
  if (a.weather && sim.fx.phase !== 'idle') say(sim, `anomaly-${sim.anomaly}-${sim.fx.n}`, sim.fx.n === 0 ? a.weather.line : a.weather.again, 'warn');
}

/**
 * Level 1's script (`docs/level-1.md`): one sentence each, said at the moment of use. It stands in for the generic landing lines
 * ('crews', 'goal') and the day's three; the land's own `talk` lines are the desert's and keep their place on every other land.
 */
function level1Lines(sim: Sim, t: number) {
  if (t > 4) say(sim, 'l1-mast', 'The old mast to the east still hums. Wake it, and I will see this desert.');
  const wreck = sim.places.find((p) => p.id === 'wreck');
  if (wreck?.state === 'up') say(sim, 'l1-command', 'He works better than he fights. Command him ({command}): pick a spot, and he goes.');
  if (sim.ruins.some((r) => r.kind === 'car' && r.searched)) say(sim, 'l1-toaster', 'Two barrels, a lever and a bell. Clearly a weapon.');
  const d = sim.day;
  if (d.phase === 'day') say(sim, 'day', 'The sun is up, and so are the hornets.', 'warn');
  if (d.phase === 'evening') say(sim, 'evening', 'The dark gets into the hornets: keep out of the halos.', 'urgent');
}

export function oracle(sim: Sim) {
  const t = sim.time;
  const one = sim.land?.id === 'level1';
  if (t > 1) say(sim, 'hello', 'Communicator, this is the Oracle. The lift is down, and so are you. May your boiler run hot and your firmware never update.');
  if (t > 4 && sim.biome.hello && !one) say(sim, `${sim.biomeId}-hello`, sim.biome.hello, 'warn');
  anomalyLines(sim, t);
  if (one) level1Lines(sim, t);
  else {
    if (t > 12) say(sim, 'crews', 'You have hands on the ground. Open the map ({map}), put your gatherers in a crew of their own and send that crew to a ruin to strip it for copper, or to a coal seam to mine it. Crew 0 walks with you.');
    if (t > 6) say(sim, 'goal', `The city is short of scrap, and ${sim.biome.swarm} are full of it. Break them and bring it home. The lift is yours to ride whenever you like.`);
  }
  if (sim.spareCans > 0 && t > 18) say(sim, 'spare', SPARE_LINE);
  tapSight(sim);
  // The clock's beats: morning is quiet, the day brings the ordinary kind, the evening the nightmares, midnight the end.
  const d = sim.day;
  if (!one) {
    if (d.phase === 'morning' && t > 25) say(sim, 'morning', sim.biome.talk.morning);
    if (d.phase === 'day') say(sim, 'day', sim.biome.talk.day, 'warn');
    if (d.phase === 'evening') say(sim, 'evening', sim.biome.talk.evening, 'urgent');
  }
  if (d.phase === 'evening' && sim.dayT > d.at.evening + 12 && sim.support.barrage) say(sim, 'support', 'The Zeppelin Wanderer hangs above the cloud with a belly full of shells, and one call to spend this sortie. Press {support} and it shells whatever is under your cursor. Keep it for when the dark closes in.', 'warn');
  if (d.phase !== 'midnight' && sim.dayT >= d.at.midnight - DAY.warn) say(sim, 'soon', `Midnight in a minute. After that, every ten seconds, the machines come stronger, and it does not stop. Think about the lift.`, 'urgent');
  if (d.phase === 'midnight' && d.buff >= 2) say(sim, 'worse', 'It is getting worse out there. Whatever you are carrying, it is not worth this.', 'urgent');
  if (sim.bossDown) advise(sim, 'queen', `${sim.bossDownName} is down. Now would be a good time to head for the lift: the night will not get kinder. Stay if you must, for one more ruin or one more kill. I will keep the light on.`);
  if (sim.scrap >= 20) say(sim, 'flowing', sim.biome.talk.flowing);
  if (sim.bossDown) { /* the boss advice above stands */ }
  else if (sim.awake) {
    const hurt = sim.bots.find((b) => !b.dead && !b.downed && b.hp < b.maxHp / 2);
    if (hurt) advise(sim, 'hurt', `${hurt.role === 'controller' ? "You're" : `${hurt.name} is`} losing oil fast. The lift is there if you want it: bring the crews home ({map}) and ride it ({use}).`);
  }
  // Sent off: a crew (1..) or a robot on its own order to a point (P3).
  const away = (b: Bot) => (b.own ? b.own !== 'follow' : b.crew !== 0);
  if (sim.advised && sim.crew.some(away) && sim.crew.every((b) => !away(b) || sim.onLift(b, 1.6)))
    say(sim, 'aboard', 'Your crews are aboard. Step onto the lift and press {use} twice to rise.');
}

/** The Oracle's word when the Communicator first comes within sight of the tap (it is a trip, not a chore). */
function tapSight(sim: Sim) {
  const c = sim.controller;
  const tap = sim.seeps.find((q) => q.kind === 'crude' && q.amount > 0);
  if (!tap || c.dead || dist(c.x, c.y, tap.x, tap.y) > TAP.sight * T) return;
  say(sim, 'tap', `${upper(sim.biome.talk.tap)}: crude, the real thing, and the only well on ${sim.biome.talk.land}. Stand in its steam and it mends you and your robots, until it runs dry. One tap a land: save it for when it counts.`, 'warn');
}

/** The Oracle's lines down a dungeon: on the way in, and at the den's mouth when the mini-boss sees you. */
export function dungeonLines(sim: Sim) {
  const D = sim.dungeon!;
  if (sim.time > 0.8) say(sim, 'dungeon-down', D.down);
  const b = sim.denBoss;
  if (b && !b.dead && b.target === sim.controller.id) {
    if (!sim.said.has('den') && b.boss) sim.events.push({ e: 'boss', what: 'arrive', h: b });
    say(sim, 'den', b.boss ? bossOf(b.kind).arrive : `Something old sits in the den: ${denName(b)}. Mind its crown, Communicator.`, 'urgent');
  }
  if (b?.dead) say(sim, 'den-down', `${b.boss ? bossOf(b.kind).name : denName(b)} is scrap. Pick up what it dropped; then back to the lift and up, unless you like the dark.`, 'warn');
}

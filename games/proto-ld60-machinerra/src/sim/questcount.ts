/**
 * What the quests count that no other system already keeps (P38), as numbers in `Sim.stats` (they ride home with the haul and
 * `hub/lines.ts` reads them): seconds past midnight (`pastMidnight`), seconds the Communicator spent under a quarter of his oil
 * (`lowOil`), the oil he lost before the evening (`dmgDusk`, set when the evening begins: absent if the lift rose first, so
 * leaving early cannot read as a clean day) and the farthest he walked from the lift in tiles (`far`). Plain counting; one call per step.
 * The other quest stats are counted where they happen: `gunKills`, `eliteCrashKills`, `botBossKicks`, `bowl`, `bossNight`
 * (`combat.ts`, `crash.ts`, `foes.ts`), `use.<place>` (`use.ts`), `part.<kind>`, `junk.<id>` (`loot.ts`, `use.ts`).
 * Add a counter: a line here, and the goal that reads it in `lines.ts`.
 */
import { T } from './defs';
import { dist } from './geom';
import type { Sim } from './sim';

/** What a mission knows of the quest book (`missionstart.ts` fills it from the saves): act 5's fragments and the stall's pack. */
export interface QuestOpts {
  /** Act 5 is open (the Harbinger is down): a signal mast climbed or star oil drunk tells a fragment of the princess's signal. */
  fragmentsOpen: boolean;
  /** The sources heard so far, `mast:<biome>` and `oil:<biome>`: each source on each land tells one, and the next told is the next in `FRAGMENT_LINES`. */
  heard: string[];
  /** What the Trader's stall put in the pack for this landing (`hub/trade.ts` boons): kind -> how many. */
  pack: Record<string, number>;
  /** The dog's third step wants the Squeaky Toy (P42): the first dig mound of a land holds it, once. */
  toyHunt?: boolean;
}
export const freshQuestOpts = (): QuestOpts => ({ fragmentsOpen: false, heard: [], pack: {}, toyHunt: false });

/** What the stall's boons do in a mission (`hub/specials.ts`): biscuits add oil at the start, star oil stops the clock this long (guesses). */
export const BISCUIT = { oil: 15 };
export const STAR_OIL = { seconds: 20 };

/**
 * Drink the star oil in the pack (Use, asked twice): the clock stops for `STAR_OIL.seconds`, the map shows the land as a constellation,
 * and on a land that has not told one it pays a fragment of the princess's signal. False when there is none or one was drunk.
 */
export function drinkStarOil(sim: Sim): boolean {
  if (!(sim.quest.pack.starOil > 0) || sim.stats['drank.starOil'] || sim.dungeon) return false;
  sim.stats['drank.starOil'] = 1;
  sim.oilT = STAR_OIL.seconds;
  sim.say('star-oil', 'Star oil. Time stands still, and so should you: look at the map ({map}). The whole land from above, every thing you have seen picked out in light.', 'warn');
  hearFragment(sim, 'oil');
  return true;
}

/** The princess's signal, in the order it is heard (quests.md act 5); after the third, the last again. */
export const FRAGMENT_LINES = ['Cleaning complete. Returning to dock.', 'Dock not found. Searching. Searching. Searching.', 'Main brush stuck. ...Is anyone receiving? Anyone at all?'];

/**
 * A fragment of her signal: a signal mast climbed or star oil drunk, on a land that has not told one from that source, once act 5 is open.
 * The Oracle relays it ("through the antenna"); `stats['frag.<source>']` rides home and the hub keeps it (`land`, `QuestBook.frags`).
 */
export function hearFragment(sim: Sim, source: 'mast' | 'oil'): boolean {
  const q = sim.quest;
  const key = `${source}:${sim.biomeId}`;
  if (!q.fragmentsOpen || q.heard.includes(key) || sim.stats[`frag.${source}`]) return false;
  const n = q.heard.length;
  sim.stats[`frag.${source}`] = 1;
  sim.say(`fragment-${key}`, `Through your antenna, small and far off: "${FRAGMENT_LINES[Math.min(n, FRAGMENT_LINES.length - 1)]}" ...Communicator. That is not static.`, 'warn');
  return true;
}

/** How long after the Oracle suggests the lift a ride still counts as heeding her (quests.md `oracle.3`: 20 s). */
export const OBEY_WITHIN = 20;

/** Her advice, heeded or not: each suggestion waits `OBEY_WITHIN` s; the lift rising in time is `stats.obeyed`, a window that runs out is one `stats.ignored`. */
function adviceStep(sim: Sim) {
  const s = sim.stats;
  if (sim.phase === 'rising') {
    if (!sim.adviceHeeded && sim.adviceAt.some((t) => sim.time - t <= OBEY_WITHIN)) s.obeyed = 1;
    sim.adviceHeeded = true;
    sim.adviceAt.length = 0;
    return;
  }
  if (sim.phase !== 'mission') return;
  const late = sim.adviceAt.filter((t) => sim.time - t > OBEY_WITHIN);
  if (!late.length) return;
  s.ignored = (s.ignored ?? 0) + late.length;
  sim.adviceAt = sim.adviceAt.filter((t) => sim.time - t <= OBEY_WITHIN);
}

/** The Communicator is "low" under this share of his oil (quests.md: below 25%). */
export const LOW = 0.25;

export function questStep(sim: Sim, dt: number) {
  adviceStep(sim);
  if (sim.oilT > 0) sim.oilT = Math.max(0, sim.oilT - dt);
  const c = sim.controller;
  if (c.dead || sim.phase !== 'mission') return;
  const s = sim.stats;
  const was = sim.questHp ?? c.hp;
  sim.questHp = c.hp;
  if (!sim.dungeon) {
    const phase = sim.day.phase;
    if (phase === 'midnight') s.pastMidnight = (s.pastMidnight ?? 0) + dt;
    if (phase === 'morning' || phase === 'day') sim.questLost = (sim.questLost ?? 0) + Math.max(0, was - c.hp);
    else if (s.dmgDusk === undefined) s.dmgDusk = Math.round(sim.questLost ?? 0);
  }
  if (c.maxHp > 0 && c.hp / c.maxHp < LOW) s.lowOil = (s.lowOil ?? 0) + dt;
  const far = dist(c.x, c.y, sim.lift.x, sim.lift.y) / T;
  if (far > (s.far ?? 0)) s.far = Math.round(far);
}

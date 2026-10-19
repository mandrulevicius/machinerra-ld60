/**
 * The repeatable specialty quests (P38; quests.md "Repeatable specialty quests"), plain TS: one job a land, drawn from the pools of the
 * NPCs aboard, shown on the land's row on the course table with its reward. Flying that land is taking the job (`Hub.launch` keeps
 * it in `QuestBook.job`); the lift docking with the goal met pays it (`carry.ts` `settleJob`). Rewards are tied to the giver and
 * never relationship; N scales with the land's tier (I, II, III).
 *
 * **Jam templates only** (the table's `jam` rows); the `extra` ones wait. **Rewards are what the game has:** quests.md's Stripe
 * (a trip toward Seasoned), Tune-up, Charted land and Rush order name systems not built, so they are paid as the deeds'
 * boost, (Tune-up is real since P38's follow-up: `Gear.tunes`, picked at Gasket's clinic; with no untuned body part worn he pays a Fine body piece), a Fine scrap magnet and a little copper (guesses; D47). Hob's Fitted mod is real (P57: a pick of two mods at his forge, `questpay.ts` `fittedPick`). Add a template: a `REPEATS` row.
 */
import { rng } from '../../../../harness/kit/rng';
import { BIOMES, ENEMY_PARTS, PARTS, type BiomeId, type Enemy, type PartKind } from '../sim/defs';
import { RELICS, RUIN_JUNK, isUnique } from '../sim/junk';
import { clampTier } from '../sim/dungeon';

/** How a stat is read: summed over the mission, or under a limit (the stat must exist: leaving before dusk is no clean day). */
export type JobGoal = { stat: string; mode: 'atLeast' | 'under'; n: number };
export type JobReward = 'stripe' | 'weapon' | 'mod' | 'body' | 'tuneUp' | 'magnet' | 'copper' | 'kickCard' | 'biscuits' | 'scrap' | 'sweepings';

export interface Job {
  id: string;
  giver: string;
  /** What the giver says on the course table. */
  line: string;
  /** The goal in words ("Kill 50 with a gun"). */
  task: string;
  goal: JobGoal;
  reward: JobReward;
  /** The land's tier when the job was drawn (the Fitted mod's wild pick at tier III). */
  tier?: number;
}

/** What each reward is called on the course table and in the banner. */
export const REWARD_NAMES: Record<JobReward, string> = {
  stripe: 'a faster deed gauge',
  weapon: 'a Fine weapon',
  mod: 'a Fitted mod: a pick of two, fitted free',
  body: 'a Fine body piece',
  tuneUp: 'a Tune-up: one worn body part +20%',
  magnet: 'a Fine scrap magnet',
  copper: 'a little copper',
  kickCard: 'a research pick, Boot Polish first',
  biscuits: 'a free batch of biscuits',
  scrap: 'a little scrap',
  sweepings: 'her sweepings doubled next time',
};
/** The copper the Planner's "rush order" pays (a guess). */
export const RUSH_COPPER = 30;
/** The scrap the Oracle's tap job pays, where a card pick used to be (Minos: one card a stage, earned; the amount is a guess). */
export const TAP_SCRAP = 40;

interface Ctx { biome: BiomeId; tier: number; foes: Enemy[]; r: ReturnType<typeof rng>; /** The lands of the last trips home (the Princess's: a land she has not mapped this week). */ recent: readonly BiomeId[] }
interface Template {
  id: string;
  giver: string;
  line: string;
  reward: JobReward;
  /** N by tier I / II / III. */
  n: [number, number, number];
  make(c: Ctx, n: number): { task: string; goal: JobGoal };
  /** Offered on this land only when this holds (absent: always). */
  when?: (c: Ctx) => boolean;
}

const plural = (k: PartKind) => PARTS[k].plural;
const landParts = (foes: Enemy[]): PartKind[] => [...new Set(foes.map((f) => ENEMY_PARTS[f].part))];

/** The jam rows of quests.md's table. */
export const REPEATS: Template[] = [
  {
    id: 'rep.sprocket.parts', giver: 'sprocket', line: "Hornet heads, dear. I'm knitting.", reward: 'stripe', n: [3, 5, 7],
    make: (c, n) => { const k = c.r.pick(landParts(c.foes)); return { task: `Bring home ${n} ${plural(k)}`, goal: { stat: `part.${k}`, mode: 'atLeast', n } }; },
  },
  {
    id: 'rep.hob.kills', giver: 'hob', line: 'KILL THINGS WITH A GUN. NO, A DIFFERENT GUN.', reward: 'mod', n: [30, 50, 80],
    make: (c, n) => (c.r.chance(0.5) ? { task: `Kill ${n} machines with a gun`, goal: { stat: 'gunKills', mode: 'atLeast', n } } : { task: `Kill ${n} machines with a blade`, goal: { stat: 'meleeKills', mode: 'atLeast', n } }),
  },
  {
    id: 'rep.gasket.clean', giver: 'gasket', line: "Come back unscratched. I'm short on stitches.", reward: 'tuneUp', n: [60, 90, 120],
    make: (_c, n) => ({ task: `Lose under ${n} oil before dusk, and stay for the dusk`, goal: { stat: 'dmgDusk', mode: 'under', n } }),
  },
  {
    id: 'rep.expeditioner.ruins', giver: 'expeditioner', line: 'Old things, many, there are. Searched, they must be.', reward: 'magnet', n: [4, 6, 8],
    make: (_c, n) => ({ task: `Search ${n} ruins`, goal: { stat: 'ruins', mode: 'atLeast', n } }),
  },
  {
    id: 'rep.planner.supply', giver: 'cityPlanner', line: 'Materials, please. In triplicate, ideally.', reward: 'copper', n: [30, 50, 80],
    make: (c, n) => { const k = c.r.chance(0.5) ? 'scrap' : 'copper'; return { task: `Bring home ${n} ${k}`, goal: { stat: k, mode: 'atLeast', n } }; },
  },
  {
    id: 'rep.kicker.crash', giver: 'kicker', line: 'Rock. Answer. Again.', reward: 'kickCard', n: [8, 12, 20],
    make: (_c, n) => ({ task: `Kill ${n} machines by crash`, goal: { stat: 'crashKills', mode: 'atLeast', n } }),
  },
  {
    // An `extra` row, built because P36's Strike Lanes feed it (`stats.bowl`: the most foes one kicked robot struck).
    id: 'rep.kicker.bowl', giver: 'kicker', line: 'Strike.', reward: 'kickCard', n: [3, 4, 5],
    make: (_c, n) => ({ task: `Kick one of your robots into ${n} machines at once`, goal: { stat: 'bowl', mode: 'atLeast', n } }),
  },
  {
    id: 'rep.trader.junk', giver: 'trader', line: "Looking for a hair dryer, friend. Don't ask.", reward: 'biscuits', n: [1, 1, 1],
    make: (c) => { const id = c.r.pick([...new Set(Object.values(RUIN_JUNK).flat())].filter((x) => !isUnique(x))); return { task: `Bring home a ${RELICS[id].item.toLowerCase()}`, goal: { stat: `junk.${id}`, mode: 'atLeast', n: 1 } }; },
  },
  {
    id: 'rep.oracle.tap', giver: 'highPriest', line: 'The well is warm and clean. Be hurt first, then be mended.', reward: 'scrap', n: [80, 120, 160],
    make: (_c, n) => ({ task: `Be mended ${n} oil at the tap`, goal: { stat: 'tapped', mode: 'atLeast', n } }),
  },
  {
    // P58 C: the Princess's, on a land not landed on in the last three trips home; `home` is the lift docking (`carry.ts`).
    id: 'rep.princess.dust', giver: 'princess', line: 'Bring home the dust of a land I have not mapped this week.', reward: 'sweepings', n: [1, 1, 1],
    when: (c) => !c.recent.includes(c.biome),
    make: (c) => ({ task: `Come home from ${BIOMES[c.biome].name} with its dust on your boots`, goal: { stat: 'home', mode: 'atLeast', n: 1 } }),
  },
];

/** The land's job: one template drawn from the pools of the NPCs aboard, its numbers by the land's tier; null when no one aboard has one. */
export function jobFor(land: { biome: BiomeId; seed: number; tier: number; foes: Enemy[] }, aboard: readonly string[], recent: readonly BiomeId[] = []): Job | null {
  const pool = REPEATS.filter((t) => aboard.includes(t.giver) && (!t.when || t.when({ biome: land.biome, tier: land.tier, foes: land.foes, r: rng(0), recent })));
  if (!pool.length) return null;
  const r = rng(`repeat:${land.seed}:${land.biome}`);
  const t = r.pick(pool);
  const n = t.n[clampTier(land.tier) - 1];
  const made = t.make({ biome: land.biome, tier: land.tier, foes: land.foes, r, recent }, n);
  return { id: t.id, giver: t.giver, line: t.line, task: made.task, goal: made.goal, reward: t.reward, tier: clampTier(land.tier) };
}

/** The mission's stats meet the goal. */
export function jobDone(j: Job, stats: Record<string, number>): boolean {
  const v = stats[j.goal.stat];
  return j.goal.mode === 'under' ? v !== undefined && v < j.goal.n : (v ?? 0) >= j.goal.n;
}

/** The course table's line, in the giver's voice. */
export const jobText = (j: Job, giver: string) => `${giver}: "${j.line}" ${j.task}, for ${REWARD_NAMES[j.reward]}.`;

/** The job as a progress count of this mission's stats ("12/50"), for the HUD tracker (`under` has none: it reads as the limit). */
export function jobProgress(j: Job, stats: Record<string, number>): string {
  const v = stats[j.goal.stat] ?? 0;
  return j.goal.mode === 'under' ? `${j.task}` : `${j.task} ${Math.min(v, j.goal.n)}/${j.goal.n}`;
}

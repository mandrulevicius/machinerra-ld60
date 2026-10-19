/**
 * The quest log's contents (J, `src/questlog.ts` draws them), plain TS: every quest begun, done or waiting to be taken
 * up, read from the saves the dialog already keeps (`talk` steps, `lines` progress, `titles`) and the hub's state. Nothing
 * here is stored: the log is a view.
 *
 * "Ready" is read off the scripts themselves: a giver's entry rule that names a quest's step plus a further condition
 * (scrap to show, kills counted) is a hand-in, so when it holds the step is met and talking to them finishes it.
 */
import { DONE, holds, stepOf, type Cond, type Flags, type Talk } from './dialog';
import { LINES, count, have, isOpen, type LineProgress } from './lines';
import { NPCS, npc, type HubState } from './state';
import { STORY } from './story';
import { QUESTS, SCRIPTS, factsFor } from './talk';
import { TITLES, type Titles } from './titles';
import { BONDS, bondOf } from './bonds';
import { bondSave } from './talkslice';

export type QuestState = 'available' | 'active' | 'done';

export interface JournalStep { text: string; state: 'done' | 'current' | 'todo' }

export interface JournalEntry {
  id: string;
  title: string;
  kind: 'main' | 'side';
  /** A side quest's sort: a mastery ladder or a story line. */
  line?: 'ladder' | 'story';
  /** The current step cannot be worked on yet (its giver says why when asked). */
  locked?: boolean;
  state: QuestState;
  /** Who gives it (and takes the hand-ins). */
  giver: string;
  /** 1-based; 0 before it is taken up, DONE after. */
  step: number;
  steps: JournalStep[];
  /** The current step's count (lines only): have of n, and what the mission on the sands adds if it gets home. */
  progress?: { have: number; n: number; pending: number };
  /** The current step is met: talk to the giver to hand it in. */
  ready: boolean;
  /** The giver's relationship track (P52): who, and the steps lit; the log draws the gauge beside the quest. */
  bond?: { npc: string; n: number };
  /** The title its finish earns. */
  grants?: { name: string; passive: string; earned: boolean };
}

export interface Journal {
  entries: JournalEntry[];
  titles: { id: string; name: string; passive: string; worn: boolean }[];
}

/** The giver of a quest: a line's NPC, else the NPC whose script moves it (the main quest: the Oracle). */
function giverOf(id: string): string {
  if (LINES[id]) return LINES[id].npc;
  const named = (c: Cond | Cond[] | undefined) => [c ?? []].flat().some((x) => x.quest === id);
  return NPCS.find((n) => SCRIPTS[n.id]?.entry.some((e) => named(e.if)))?.id ?? 'highPriest';
}

/** A giver's entry rule naming this step and something more holds: the step is met. */
function met(id: string, step: number, giver: string, talk: Talk, s: HubState, lines: LineProgress): boolean {
  const script = SCRIPTS[giver];
  if (!script) return false;
  const facts = factsFor(s, giver, talk, lines);
  return script.entry.some((e) => {
    if (LINES[id] && e.go !== `${id}.done${step}`) return false; // a line's other entry rule is its offer, not a hand-in
    const conds = [e.if ?? []].flat();
    return conds.length > 1 && conds.some((c) => c.quest === id && c.step === step) && holds(talk, facts, conds);
  });
}

/**
 * The log. `mission`, while on the sands: the stats so far and the biome, so a line's count shows what this run adds
 * (it counts only once the lift docks: `land`).
 */
export function journal(talk: Talk, lines: LineProgress, s: HubState, titles: Titles, mission?: { stats: Record<string, number>; biome: string }): Journal {
  const after = mission ? count(lines, talk, mission.stats, mission.biome, factsFor(s, '')) : lines;
  const entries: JournalEntry[] = [];
  for (const [id, q] of Object.entries(QUESTS)) {
    const step = stepOf(talk, id);
    const giver = giverOf(id);
    const state: QuestState = step === DONE ? 'done' : step > 0 ? 'active' : 'available';
    // Not taken up: a line waits for its giver's station (their "Any work for me?") or what else its `from` asks; the main quest is always there to start.
    if (state === 'available' && LINES[id]?.auto) continue; // a special line starts itself (`autoStart`): it is in the log once it has begun
    if (state === 'available' && LINES[id] && !holds(talk, factsFor(s, giver, talk, lines), LINES[id].from ?? { has: 'built' })) continue;
    const steps = q.steps
      .map((text, i): JournalStep => ({ text, state: step === DONE || i + 1 < step ? 'done' : i + 1 === step ? 'current' : 'todo' }))
      // The main quest's secret steps stay out of the log until it reaches them.
      .filter((st, i) => !(id === 'main' && STORY[i]?.secret && st.state === 'todo'));
    const e: JournalEntry = { id, title: q.title, kind: q.kind, ...(q.line && { line: q.line }), state, giver: npc(giver)?.name ?? giver, step, steps, ready: state === 'active' && met(id, step, giver, talk, s, lines) };
    const def = state === 'active' ? LINES[id]?.steps[step - 1] : undefined;
    const goal = def?.goal;
    if (goal) {
      const facts: Flags = factsFor(s, giver, talk, lines);
      if (!isOpen(def!, talk, facts)) e.locked = true;
      const now = have(id, talk, lines, facts);
      e.progress = { have: Math.min(goal.n, now), n: goal.n, pending: Math.max(0, Math.min(goal.n, have(id, talk, after, facts)) - Math.min(goal.n, now)) };
    }
    if (BONDS[giver]) e.bond = { npc: giver, n: bondOf(bondSave.get(), giver) };
    if (q.grants && TITLES[q.grants]) e.grants = { name: TITLES[q.grants].name, passive: TITLES[q.grants].passive, earned: titles.earned.includes(q.grants) };
    entries.push(e);
  }
  // Main first, then: met (go hand it in), going, to take up, done.
  const rank = (e: JournalEntry) => (e.ready ? 0 : e.state === 'active' ? 1 : e.state === 'available' ? 2 : 3);
  entries.sort((a, b) => rank(a) - rank(b) || (a.kind === 'main' ? -1 : 0) - (b.kind === 'main' ? -1 : 0));
  const worn = titles.worn;
  return {
    entries,
    titles: titles.earned.filter((t) => TITLES[t]).map((t) => ({ id: t, name: TITLES[t].name, passive: TITLES[t].passive, worn: t === worn })),
  };
}

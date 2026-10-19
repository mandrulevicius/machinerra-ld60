/**
 * What applies on a land (P38, "surface map-relevant missions to hud", Minos 2026-10-18), plain TS: the main quest's boss if it is
 * here, the NPC quest steps this land can advance (with their count), and who waits here. The course table shows them as pips on a
 * land's row (`Hub.lands`, `stations/command.ts`), the mission's HUD as up to three lines above the generic objective line (`Play`,
 * `hud.ts`): the same data. A pip is a promise: a land showing it can advance the step.
 *
 * A step can be advanced on a land when it is open and counts a mission stat there (`count` goals: in its biome, or any; `best`),
 * or is handed in from what the land drops (parts). Steps that are done at home (a station built, scrap paid) have no pip.
 * Add a kind of signal: a branch in `signalsFor`.
 */
import { BIOMES, type BiomeId } from '../sim/defs';
import { stepOf, type Flags, type Talk } from './dialog';
import { LINES, count, have, isOpen, type LineProgress } from './lines';
import { landBoss } from './landings';
import { NPCS, pilgrimIn, type HubState } from './state';
import { jobProgress, type Job } from './repeats';
import { S, STORY } from './story';

export interface Signal {
  kind: 'main' | 'line' | 'job' | 'waits';
  /** The HUD line. */
  text: string;
  /** The pip's one-liner on the course table. */
  short: string;
}

/** The boss each main-quest step asks for, and the land it is on (`landBoss`). */
const STEP_BOSS: Record<number, string> = { [S.queen]: 'hornet', [S.ironback]: 'gorilla', [S.knight]: 'knight', [S.bear]: 'bear', [S.harbinger]: 'drone', [S.evil]: 'evilOracle' };

const first = (name: string) => name.replace(/^The /, '').replace(/^Dr\. /, 'Dr. ');
const lower = (t: string) => t[0].toLowerCase() + t.slice(1);

export interface SignalIn {
  talk: Talk;
  lines: LineProgress;
  hub: HubState;
  /** `factsFor(hub, '', talk, lines)`: the acts and counts the steps open on. */
  facts: Flags;
  biome: BiomeId;
  /** On the sands: this mission's stats so far, counted on top of what the save has. */
  stats?: Record<string, number>;
  /** The land's repeatable job the lift went down for (`QuestBook.job`): on the sands only. */
  job?: Job | null;
  /** The place ids the land holds (P42): a step about a quest-only place (`StepDef.place`) shows only where it stands. Unknown: shown. */
  places?: () => readonly string[];
}

export function signalsFor(i: SignalIn): Signal[] {
  const out: Signal[] = [];
  const main = stepOf(i.talk, 'main');
  const boss = STEP_BOSS[main];
  const here = BIOMES[i.biome];
  if (boss && landBoss(i.biome) === boss && !i.hub.story.bosses.includes(boss) && !(main === S.knight && i.hub.story.wife === 'home')) {
    const t = STORY[main - 1].task;
    out.push({ kind: 'main', text: `The Old Way: ${lower(t)}`, short: `The Old Way: ${lower(t)}` });
  } else if (main === S.ghost && i.biome === 'ether') out.push({ kind: 'main', text: `The Old Way: ${lower(STORY[S.ghost - 1].task)}`, short: 'The Old Way: free the Esteemed Ghost' });
  const after = i.stats ? count(i.lines, i.talk, i.stats, i.biome, i.facts) : i.lines;
  for (const [id, l] of Object.entries(LINES)) {
    const step = stepOf(i.talk, id);
    const def = l.steps[step - 1];
    if (!def || !isOpen(def, i.talk, i.facts)) continue;
    const g = def.goal;
    const hands = 'hand' in g && g.hand === 'parts';
    const advances = hands || ('count' in g && (!g.biome || g.biome === i.biome)) || 'best' in g || !!def.place;
    if (!advances || (def.place && i.places && !i.places().includes(def.place))) continue;
    const got = Math.min(g.n, have(id, i.talk, after, i.facts));
    const who = first(NPCS.find((n) => n.id === l.npc)?.name ?? l.npc);
    const prog = def.note && i.stats ? def.note(i.stats) : hands ? '' : `${got}/${g.n}`;
    out.push({ kind: 'line', text: `${who}: ${lower(def.task)}${prog && ` ${prog}`}`, short: `${who}${prog && ` ${prog}`}` });
  }
  if (i.job) {
    const who = first(NPCS.find((n) => n.id === i.job!.giver)?.name ?? i.job.giver);
    out.push({ kind: 'job', text: `${who}'s job: ${jobProgress(i.job, i.stats ?? {})}`, short: '' });
  }
  const waits = here.places.includes('pilgrim') ? pilgrimIn(i.hub, i.biome) : null;
  if (waits) {
    const who = first(NPCS.find((n) => n.id === waits)?.name ?? waits);
    out.push({ kind: 'waits', text: `${who} waits on this land, stranded on ${here.talk.land}`, short: `${who} waits here` });
  }
  return out;
}

/** The HUD's lines: the main quest first, then the steps, then who waits; at most three (`MAX`). */
export const TRACKER_MAX = 3;
export const trackerLines = (i: SignalIn): string[] => {
  const rank = { main: 0, line: 1, job: 2, waits: 3 } as const;
  return signalsFor(i).sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, TRACKER_MAX).map((s) => s.text);
};

/** The course table's pips for a land (who waits there is already its "Stranded here" row). */
export const landPips = (i: Omit<SignalIn, 'stats'>): string[] => signalsFor(i).filter((s) => s.kind === 'main' || s.kind === 'line').map((s) => s.short);

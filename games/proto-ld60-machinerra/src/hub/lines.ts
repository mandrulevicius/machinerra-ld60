/**
 * NPC quest lines, plain TS (no Phaser, no storage): once an NPC's station stands and they have taught or sold their first
 * thing, they hand out quests in that specialty, and each finished step unlocks the next thing they teach or sell (a perk,
 * `PERKS`). Some lines run one step per biome (five), the rest three (Laimonas, 2026-10-17; quests.md, biomes.md). The main
 * quest stays in `talk.ts`.
 *
 * A line is data: `LINES` builds both its `QUESTS` entry and its dialog (`lineScript`, merged into the NPC's script in
 * `talk.ts`). Progress counted on the sands (`count` goals) lives in its own slice (`lineSave`, `talkslice.ts`), fed by
 * `land` (`carry.ts`) with each mission's stats; the dialog reads it as the fact `goal.<line>` (`lineFacts`).
 *
 * Add a line: an entry in `LINES` (quest id = the giver's NPC id), its rewards as `PERKS` in `state.ts`, their effects
 * in the Sim (or the hub). Add a step: one more `StepDef`. A step in a biome the build lacks waits until it lands.
 */
import { DONE, holds, stepOf, type Choice, type Flags, type If, type LineIn, type Node, type Quests, type Reward, type Script, type Talk } from './dialog';
import type { PartKind } from '../sim/defs';
import type { PlaceId } from '../sim/places';
import { ENEMY_PARTS, PARTS } from '../sim/defs';
import { STORY_LINES } from './storylines';
import { SPECIAL_LINES } from './speciallines';
import { PRINCESS_LINES } from './princessdocks';

/**
 * What a step asks: `count` a mission stat while the step is active (in `biome` only, if set); `best` one mission's stat
 * reaching `n`; `hand` over scrap or parts at the giver (taken when the step is done); `fact` a hub fact (`factsFor`).
 */
export type Goal =
  | { count: string; n: number; biome?: string }
  | { best: string; n: number }
  | { hand: 'scrap' | 'parts' | 'copper'; n: number; only?: PartFilter }
  | { fact: string; n: number };

/** P38: which parts a hand-in wants (`only`): `kinds` is n different kinds, one of each; `wings` the flying machines' wings; `eliteArms` the arms an elite drops. */
export type PartFilter = 'kinds' | 'wings' | 'eliteArms';
const WINGS: PartKind[] = ['hornet-wings', 'swarmer-wing', 'kite-wings', 'swan-feather'];
const COMMON = new Set<PartKind>(Object.values(ENEMY_PARTS).map((e) => e.part));
export const PART_FILTERS: Record<PartFilter, (k: PartKind) => boolean> = {
  kinds: (k) => !PARTS[k]?.unique,
  wings: (k) => WINGS.includes(k),
  eliteArms: (k) => PARTS[k]?.slot === 'arms' && !PARTS[k].unique && !COMMON.has(k),
};
/** The fact a hand-in goal reads: the stores' scrap, parts of any kind, or the filtered count (`questfacts.ts`; `kinds` counts the different kinds held). */
export const handKey = (g: { hand: 'scrap' | 'parts' | 'copper'; only?: PartFilter }) => (g.only ? `parts.${g.only}` : g.hand);

export interface StepDef {
  /** The step as the quest list and banners show it. */
  task: string;
  goal: Goal;
  /** The giver sets the step (on taking it up, or straight after the last one is done). */
  offer: LineIn[];
  /** Asked about it before it is done. */
  wait: LineIn[];
  /** Handing it in. */
  done: LineIn[];
  /** What it pays: `perk` is the next unlockable thing. */
  reward: Reward;
  /** P38: when the step can be worked on (a fact condition, e.g. `{ has: 'act.2.open' }`); before that the giver says `lock`. Absent: always. */
  open?: If;
  lock?: LineIn[];
  /** P42: levers on the giver's menu while this step is current (feeding the cat, giving the boot); they move the step's fact or flag. */
  levers?: Choice[];
  /** P42: on the sands, the tracker's progress for this step instead of `got/n` (the Expeditioner's places found, 3 of 5). */
  note?: (stats: Record<string, number>) => string;
  /** P42: the quest-only place this step is about (`sim/placequest.ts`): the course table's pip and the HUD's line show only on a land that has it. */
  place?: PlaceId | 'dock';
}

/**
 * `kind`: a mastery ladder (the default; Laimonas's, a step per biome) or a `story` line (P38: three steps from quests.md, each
 * opened by the acts, the capstone earns the title). `ask` is the lever that takes the line up, `from` when it shows (default: the
 * giver's station stands).
 */
export interface LineDef {
  npc: string; title: string; grants?: string; steps: StepDef[]; kind?: 'story'; ask?: string; from?: If;
  /** P42: a special line (the dog, the cat, the Green Shoot) starts itself once this holds (`autoStart`); its giver offers each step on the first talk and there is no "any work" lever. */
  auto?: If;
  /** P42: nodes the steps' levers lead to ("it eats"), merged into the giver's script. */
  nodes?: Record<string, Node>;
}

/** Biome names for steps, the built ones and the ones to come (biomes.md). */
export const BIOME_NAMES: Record<string, string> = {
  desert: 'the desert',
  jungle: 'the Rustwood Jungle',
  city: 'the Hollow City',
  mountains: 'the Frostspine',
  demon: 'the Demon Wastes',
};

/**
 * The per-biome lines walk the biomes in the order of difficulty (biomes.md; Laimonas, 2026-10-18): desert, jungle, city,
 * mountains, the Demon Wastes. The Ether is secret and gets no step.
 * The Kicker's counts (2, 3, 4, 5, 6 kick kills: credit follows the damage, so only kick and crash damage counts) are the lead's guess,
 * lowered from Laimonas's 3, 4, 5, 6, 8 at Minos's word ("a bit easier"); tune them in play.
 */
const LADDERS: Record<string, LineDef> = {
  kicker: {
    npc: 'kicker',
    title: 'The Way of the Boot',
    grants: 'heelOfFiveLands',
    steps: [
      {
        task: 'Kick 2 machines to scrap in the desert',
        goal: { count: 'kickKills', n: 2, biome: 'desert' },
        offer: ['A boot is learned on sand. Two machines, finished with the boot, in the desert.', { t: 'Not the shovel. The boot.', act: 'point' }],
        wait: ['Two, in the desert. The boot finishes them, nothing else.'],
        done: ['Two. Hm. You kick like you mean it now.', { t: 'Longer leg. Bigger boot. Go further.', act: 'nod' }],
        reward: { perk: 'longBoot' },
      },
      {
        task: 'Kick 3 beasts to scrap in the Rustwood Jungle',
        goal: { count: 'kickKills', n: 3, biome: 'jungle' },
        offer: ['The jungle bends. Your kick does not. Three, among the trees.'],
        wait: ['Three, in the jungle. Things there do not wait for you to walk up.'],
        done: [{ t: 'Good. Now stop walking to them.', act: 'huff' }, 'Leap, then kick. The boot arrives before you do.'],
        reward: { perk: 'dashKick' },
      },
      {
        task: 'Kick 4 machines to scrap in the Hollow City',
        goal: { count: 'kickKills', n: 4, biome: 'city' },
        offer: ['Walls. Everywhere walls. The city is a dojo. Four.'],
        wait: ['Four, in the city. Use the walls.'],
        done: ['The walls ring with it now. A boot needs weight to match.', { t: 'Iron in the toe. Mind your own feet.', act: 'laugh' }],
        reward: { perk: 'ironToe' },
      },
      {
        task: 'Kick 5 machines to scrap in the Frostspine',
        goal: { count: 'kickKills', n: 5, biome: 'mountains' },
        offer: ['On ice, a kicked thing never stops. Five, on the mountain.'],
        wait: ['Five, on the ice. Slide with it.'],
        done: ['Faster than me now. Almost.', { t: 'Again. And again. Without the breath between.', act: 'nod' }],
        reward: { perk: 'quickBoot' },
      },
      {
        task: 'Kick 6 machines to scrap in the Demon Wastes',
        goal: { count: 'kickKills', n: 6, biome: 'demon' },
        offer: ['The Wastes. Things there come in crowds. Six, with the boot.'],
        wait: ['Six, in the Wastes. Not for long, and not after dark.'],
        done: [{ t: 'Nothing left to teach. You are the boot now.', act: 'laugh' }, 'Swing it wide. Let them all hear it.'],
        reward: { perk: 'wideBoot' },
      },
    ],
  },
  expeditioner: {
    npc: 'expeditioner',
    title: 'Every Ridge Charted',
    grants: 'pageTurner',
    steps: [
      {
        task: 'Search 3 ruins in the desert',
        goal: { count: 'ruins', n: 2, biome: 'desert' },
        offer: ['Every ruin is a page of the old map. Search three in the desert and I will show you how to read them faster.'],
        wait: ['Three ruins, in the desert. Hold your hand to them and listen.'],
        done: ['Three pages. Now, quick hands: the old world opens if you know where it is stuck.'],
        reward: { perk: 'quickHands' },
      },
      {
        task: 'Search 4 ruins in the Rustwood Jungle',
        goal: { count: 'ruins', n: 3, biome: 'jungle' },
        offer: ['Under the jungle there are roads. Four ruins, and mind the vines.'],
        wait: ['Four in the jungle. The vines move. Not all of them are vines.'],
        done: ['The roots drink the seeps there before you can. I learned to drink quicker.', { t: 'So will you: siphon like you are late.', act: 'nod' }],
        reward: { perk: 'prospector' },
      },
      {
        task: 'Search 6 ruins in the Hollow City',
        goal: { count: 'ruins', n: 6, biome: 'city' },
        offer: ['A whole city of ruins. Six will do. Six will do for a start.'],
        wait: ['Six in the city. Every door is a ruin there.'],
        done: [{ t: 'Six! And every one with something in it.', act: 'hop' }, 'A pack is a promise to come back heavy. Here, a better strap: things find their way to you.'],
        reward: { perk: 'packMule' },
      },
      {
        task: 'Search 4 ruins in the Frostspine',
        goal: { count: 'ruins', n: 4, biome: 'mountains' },
        offer: ['The frost kept the old things whole. Four ruins on the mountain.'],
        wait: ['Four on the mountain. Cold keeps. So should you.'],
        done: ['Whole, every one. And behind each, another.', 'Look behind the first find. There is always a second.'],
        reward: { perk: 'ruinSense' },
      },
      {
        task: 'Search 3 ruins in the Demon Wastes',
        goal: { count: 'ruins', n: 3, biome: 'demon' },
        offer: ['The Wastes have ruins too, under the red. Three, and the map is done.'],
        wait: ['Three in the Wastes. Do not linger after dark.'],
        done: ['The map is done. Every ridge. I can die... no. I can draw a second map.', { t: "Take the crews' share. You walked it.", act: 'wave' }],
        reward: { scrap: 250 },
      },
    ],
  },
  trader: {
    npc: 'trader',
    title: 'Honest Brass',
    grants: 'haggler',
    steps: [
      {
        task: 'Bring the Trader 3 robot parts',
        goal: { hand: 'parts', n: 3 },
        offer: [{ t: 'Business is good, friend! Too good. I am out of stock.', act: 'wave' }, 'Three parts from the sands, any kind, and you get first pick of the snack tin.'],
        wait: ['Three parts! Any kind! I am not fussy. I am a little fussy.'],
        done: [{ t: 'Lovely, lovely!', act: 'hop' }, 'Walnut-shaped steam biscuits. Not walnuts. Your boiler will thank you.'],
        reward: { perk: 'snacks' },
      },
      {
        task: 'Pay the Trader 120 scrap for a standing order of wire',
        goal: { hand: 'scrap', n: 120 },
        offer: ['Wire by the coil is for amateurs. A hundred and twenty scrap and I put in a standing order, and the ruins give up more.'],
        wait: ['A hundred and twenty scrap. Honest scrap for honest wire.'],
        done: ['Wire, every ruin, on the house forever. Well. On your house.'],
        reward: { perk: 'wireOrder' },
      },
      {
        task: 'Bring the Trader 6 robot parts',
        goal: { hand: 'parts', n: 6 },
        offer: ['Valued customers get the good oil. Six parts and you are valued.'],
        wait: ['Six parts. I can see you want the good oil. Everyone wants the good oil.'],
        done: [{ t: 'Valued! You are valued!', act: 'laugh' }, 'Cold-pressed, triple-filtered. You will get up from a fall like you meant to.'],
        reward: { perk: 'goodOil' },
      },
    ],
  },
  cityPlanner: {
    npc: 'cityPlanner',
    title: 'Plans in Brass',
    grants: 'signedInTriplicate',
    steps: [
      {
        task: 'Call 2 steam barrages',
        goal: { count: 'strikes', n: 2 },
        offer: ['My shells are drafted to the millimetre. Call two barrages and I will know where they land.'],
        wait: ['Two barrages. Call them on something worth shelling.'],
        done: ['Eleven degrees off true. Intolerable. I have recalculated. And ordered more.'],
        reward: { perk: 'extraShells' },
      },
      {
        task: 'Stand 3 stations on the deck',
        goal: { fact: 'stations', n: 3 },
        offer: ['A deck with one station is a shed. Three, and it is a plan.'],
        wait: ['Three stations. On lots. Joined. Is that so much to ask?'],
        done: ['A plan! At last. The next ones I draw on the back of the old ones. Cheaper.'],
        reward: { perk: 'cheapLots' },
      },
      {
        task: 'Bring home 400 scrap in one mission',
        goal: { best: 'scrap', n: 400 },
        offer: ['Heavy shells need heavy funding. Four hundred scrap up the lift, in one go.'],
        wait: ['Four hundred, in one mission. Not two. One.'],
        done: [{ t: 'Funded! The heavy shells, then.', act: 'hop' }, 'Mind where you stand. No, stand where you like. They aim by faith.'],
        reward: { perk: 'bigShells' },
      },
    ],
  },
};

/** Every line: the ladders above, and P38's story lines (`storylines.ts`). */
export const LINES: Record<string, LineDef> = { ...LADDERS, ...STORY_LINES, ...SPECIAL_LINES, ...PRINCESS_LINES };

/** The lines' entries in `QUESTS`. */
export const LINE_QUESTS: Quests = Object.fromEntries(
  Object.entries(LINES).map(([id, l]) => [id, { title: l.title, kind: 'side' as const, line: l.kind ?? ('ladder' as const), steps: l.steps.map((s) => s.task), ...(l.grants && { grants: l.grants }) }]),
);

/** Progress counted on the sands: the step it is for and how far along it is. */
export type LineProgress = Record<string, { step: number; n: number }>;

/** Is the step open to work on (its giver has a task for it now)? Steps with no `open` always are. */
export const isOpen = (s: StepDef, talk: Talk, facts: Flags) => !s.open || holds(talk, facts, s.open);

/** A mission landed: its stats (`Sim.stats` plus `scrap`) count for every active, open step that wants them, in its biome. */
export function count(p: LineProgress, talk: Talk, stats: Record<string, number>, biome: string, facts: Flags = {}): LineProgress {
  const out = { ...p };
  for (const [id, l] of Object.entries(LINES)) {
    const step = stepOf(talk, id);
    const def = l.steps[step - 1];
    const g = def?.goal;
    if (!g || !('count' in g || 'best' in g) || !isOpen(def, talk, facts)) continue;
    const v = stats['count' in g ? g.count : g.best] ?? 0;
    if (!v || ('biome' in g && g.biome && g.biome !== biome)) continue;
    const was = out[id]?.step === step ? out[id].n : 0;
    out[id] = { step, n: 'count' in g ? was + v : Math.max(was, v) };
  }
  return out;
}

/** How far the current step is (what `goal.<line>` reads): counted, in the stores, or a hub fact. */
export function have(id: string, talk: Talk, p: LineProgress, facts: Flags): number {
  const step = stepOf(talk, id);
  const g = LINES[id]?.steps[step - 1]?.goal;
  if (!g) return 0;
  if ('hand' in g) return facts[handKey(g)] ?? 0;
  if ('fact' in g) return facts[g.fact] ?? talk.flags[g.fact] ?? 0; // a flag the giver's levers keep counts too (the cat's dinners)
  return p[id]?.step === step ? p[id].n : 0;
}

/** The facts the dialog reads for the lines: `goal.<line>` for each. */
export const lineFacts = (talk: Talk, p: LineProgress, facts: Flags): Flags =>
  Object.fromEntries(Object.keys(LINES).map((id) => [`goal.${id}`, have(id, talk, p, facts)]));

/** A step's progress as one line ("3/5 kills in the desert"), for the quest list and the welcome home. */
export function progressText(id: string, talk: Talk, p: LineProgress, facts: Flags): string | null {
  const step = stepOf(talk, id);
  const s = LINES[id]?.steps[step - 1];
  if (!s) return null;
  if (!isOpen(s, talk, facts)) return `${s.task}: not yet`;
  return `${s.task}: ${Math.min(s.goal.n, have(id, talk, p, facts))}/${s.goal.n}`;
}

/** Every active line step, for the welcome home and `debugState`. A step not open yet is not ready. */
export const activeLines = (talk: Talk, p: LineProgress, facts: Flags) =>
  Object.keys(LINES).flatMap((id) => {
    const t = progressText(id, talk, p, facts);
    const s = LINES[id].steps[stepOf(talk, id) - 1];
    return t ? [{ id, npc: LINES[id].npc, text: t, ready: isOpen(s, talk, facts) && have(id, talk, p, facts) >= s.goal.n }] : [];
  });

const list = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

/**
 * The dialog for a line, to merge into its giver's script: entry rules first (a step met is handed in on talking; a step
 * that has just opened is offered once), then nodes, then levers for the menu (take up the line, ask about the step).
 * A step with an `open` condition: handing in the one before leads to its offer only if it is open, else to what the giver
 * says is still missing (`lock`); asking about it says the same.
 */
export function lineScript(id: string): { entry: Script['entry']; nodes: Record<string, Node>; choices: Choice[] } {
  const l = LINES[id];
  const nodes: Record<string, Node> = { ...l.nodes };
  const entry: Script['entry'] = [];
  l.steps.forEach((s, i) => {
    const k = i + 1, last = k === l.steps.length, next = l.steps[i + 1];
    const take: Reward = 'hand' in s.goal ? { take: { [s.goal.hand]: s.goal.n, ...(s.goal.only && { only: s.goal.only }) } } : {};
    entry.push({ if: [{ quest: id, step: k }, ...list(s.open), { min: [`goal.${id}`, s.goal.n] }], go: `${id}.done${k}` });
    if (s.open || l.auto) entry.push({ if: [{ quest: id, step: k }, ...list(s.open), { not: `seen.${l.npc}.${id}.offer${k}` }], go: `${id}.offer${k}` });
    nodes[`${id}.offer${k}`] = { say: s.offer, go: 'menu' };
    nodes[`${id}.wait${k}`] = { say: s.wait, go: 'menu' };
    nodes[`${id}.locked${k}`] = { say: s.lock ?? ['Not yet. Come back when the work above has moved.'], go: 'menu' };
    nodes[`${id}.ask${k}`] = s.open ? { then: [{ if: s.open, go: `${id}.wait${k}` }], go: `${id}.locked${k}` } : { go: `${id}.wait${k}` };
    nodes[`${id}.done${k}`] = {
      say: s.done,
      do: [{ give: { ...s.reward, ...take } }, { quest: id, step: last ? 'done' : k + 1 }],
      ...(last ? { go: 'menu' } : next.open ? { then: [{ if: next.open, go: `${id}.offer${k + 1}` }], go: `${id}.locked${k + 1}` } : { go: `${id}.offer${k + 1}` }),
    };
  });
  const choices: Choice[] = [
    ...(l.auto ? [] : [{ text: l.ask ?? 'Any work for me?', if: [...list(l.from ?? { has: 'built' }), { quest: id, step: 'none' }], do: [{ quest: id, step: 1 }], go: `${id}.offer1` } as Choice]),
    ...l.steps.flatMap((s, i) => (s.levers ?? []).map((c): Choice => ({ ...c, if: [{ quest: id, step: i + 1 }, ...list(c.if)] }))),
    ...l.steps.map((s, i) => ({ text: `About “${l.title}”`, if: { quest: id, step: i + 1 }, go: `${id}.ask${i + 1}` })),
  ];
  return { entry, nodes, choices };
}


/**
 * Special lines (P42) start themselves: any whose `auto` holds and that is not begun gets step 1. Called as a lift docks and as the hub opens
 * (`carry.ts`), with the acts' facts, the missions flown and who is aboard (`autoFacts`): the conditions are only those.
 * One begun too early (a save from before its `auto` waited for the giver) and never offered goes back to not begun.
 */
export function autoStart(talk: Talk, facts: Flags): Talk {
  let next = talk;
  for (const [id, l] of Object.entries(LINES)) {
    if (!l.auto) continue;
    const step = stepOf(next, id), ok = holds(next, facts, l.auto);
    if (step === 0 && ok) next = { ...next, quests: { ...next.quests, [id]: 1 } };
    else if (step === 1 && !ok && !next.flags[`seen.${l.npc}.${id}.offer1`]) {
      const { [id]: _, ...quests } = next.quests;
      next = { ...next, quests };
    }
  }
  return next;
}

/** Lines done (for tests and the dev command). */
export const lineDone = (talk: Talk, id: string) => stepOf(talk, id) === DONE;

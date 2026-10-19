/**
 * NPC dialog as data, plain TS (no Phaser): a script per NPC (entry points, nodes of lines, levers with effects) and the
 * `Conversation` that walks one. The scene only draws it (`talkview.ts`) and applies what comes out (`Conversation.out`).
 * Writing a script (data in `talk.ts`; `validate(name, script, QUESTS)` runs in the tests): a `Script` is `entry` (the first entry
 * whose `if` holds says where talking starts; end with one without `if`) and `nodes`. Pattern: `hello` (first meeting) and
 * `idle` (a `cycle`) both `go: 'menu'`, a node of levers only, and each answer `go`es back to it. A line's gesture is inferred
 * from its punctuation unless `act` is given; `{use}` key tokens work in lines. Facts from the game are in `factsFor` (add
 * one there); flags are free names set by effects, plus `talked.<npc>` and `seen.<npc>.<node>` kept by the runner. `QUESTS`
 * entries are moved by the scripts of the NPCs involved; `main` is a placeholder that proves the format. `validate` catches
 * dangling `go`s, a missing fallback entry and unknown quests or steps. Try a script with the `hub` command (`talk <npc>`,
 * `next`, `pull <n>`, `flags`, `quest`, `forget`, `bye`); `debugState().talk` shows the frame, node, flags and quests.
 *
 * State is plain and saved (`Talk`, in `HubState.talk`): flags (numbers; set = 1) and quest steps. Quests are 1..n
 * while active, `DONE` when finished, absent before they start.
 */

export type Flags = Record<string, number>;
/** What a save keeps of every conversation. */
export interface Talk { flags: Flags; quests: Record<string, number> }
export const freshTalk = (): Talk => ({ flags: {}, quests: {} });
/** A finished quest's step. */
export const DONE = 99;

/** The gesture an NPC makes on a line (`Hub.gesture`). A line without one gets one from its punctuation (`actFor`). */
export type Act = 'nod' | 'hop' | 'lean' | 'wave' | 'shrug' | 'laugh' | 'point' | 'huff';
export interface Line { t: string; act?: Act }
/** A bare string is a line with its gesture inferred. */
export type LineIn = string | Line;

/** Facts a condition reads: `has` (a flag or fact at 1 or more), `not`, `min: [name, n]`, a quest's `step` (a number, 'none', 'active' or 'done'). Keys of one object all hold. */
export interface Cond { has?: string; not?: string; min?: [string, number]; quest?: string; step?: number | 'none' | 'active' | 'done' }
export type If = Cond | Cond[];

/** `house`: build your house (the main quest); `stolen`: the blessing's cut scene (hub/cutscene.ts); `outro`: the end (hub/outro.ts); `research`: the Oracle's pick of punch cards (stations/church.ts). */
export type Panel = 'station' | 'planner' | 'house' | 'stolen' | 'outro' | 'research';
/** `take`: what the Communicator hands over for it (scrap to spend; parts, any kind, the biggest piles first). */
export interface Reward {
  scrap?: number; perk?: string; parts?: Record<string, number>; take?: { scrap?: number; copper?: number; parts?: number; only?: string };
  /** Sprocket's `sprocket.2`: one bot type's deed gauges fill 25% faster (a type id, or `auto`: the nearest to opening a spec; `deeds.ts` `grantBoost`). */
  boost?: string;
  /** P38's rewards (`questpay.ts` pays them): a gear item of this id (Fine), research picks, a punch card put first in the next offer, AI cores, a title. */
  item?: string; picks?: number; card?: string; cores?: number; title?: string;
  /** P42: the colony's expedition charts this many more of the lands opened (`questpay.ts`). */
  chart?: number;
  /** P57: every weapon gets this many lugs (Hob's `hob.story` step 2 puts the second on). */
  lugs?: number;
}
/**
 * What a node or a lever does: set or add to a flag, move a quest (`step: 1` starts it, `'done'` finishes it), give a
 * reward (the hub applies it), open one of the hub's panels once the talk ends, show a banner.
 */
export type Effect =
  | { set: string; to?: number }
  | { add: string; by?: number }
  | { quest: string; step: number | 'done' }
  | { give: Reward }
  | { open: Panel }
  | { banner: string };

/** What the scene must do for an effect; flag and quest changes are already in `Conversation.talk`. */
export type Out =
  | { kind: 'give'; reward: Reward }
  | { kind: 'open'; panel: Panel }
  | { kind: 'banner'; text: string }
  | { kind: 'quest'; id: string; step: number };

/** A lever: what the Communicator says, when it shows, what pulling it does, where it leads (no `go` or 'end': the talk ends). */
export interface Choice { text: string; if?: If; do?: Effect[]; go?: string }
/**
 * A node: `say` lines, or `cycle` (one set of lines per visit, in turn: an NPC with idle chatter), then the levers; with
 * none, on to `go` (no `go` or 'end': the talk ends). `do` runs when the node is entered.
 */
export interface Node {
  say?: LineIn[]; cycle?: LineIn[][]; do?: Effect[]; choices?: Choice[]; go?: string;
  /** After the lines, on to the first of these whose `if` holds (else `go`): a step handed in leads to the next step's offer only if it is open. */
  then?: { if: If; go: string }[];
}
/** `entry`: the first whose `if` holds is where talking starts (end with one that has no `if`). */
export interface Script { entry: { if?: If; go: string }[]; nodes: Record<string, Node> }

/** `grants`: the title (`titles.ts`) finishing the line earns. */
export interface QuestDef { title: string; kind: 'main' | 'side'; /** A side quest is a mastery `ladder` (one step a biome) or a `story` line (P38). */ line?: 'ladder' | 'story'; steps: string[]; grants?: string }
export type Quests = Record<string, QuestDef>;

const END = 'end';
const list = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
export const lineOf = (l: LineIn): Line => (typeof l === 'string' ? { t: l } : l);
/** A gesture from the line itself: a shout hops, a question leans in, a trailing thought shrugs, the rest nods. */
export function actFor(l: Line): Act {
  if (l.act) return l.act;
  const t = l.t.trim();
  if (/!\W*$/.test(t)) return 'hop';
  if (/\?\W*$/.test(t)) return 'lean';
  if (/(\.\.\.|…)\W*$/.test(t)) return 'shrug';
  return 'nod';
}

/** A quest's step: 0 not started, 1..n active, `DONE`. */
export const stepOf = (t: Talk, quest: string) => t.quests[quest] ?? 0;

/** A fact or flag's value (a saved flag wins over a fact from the game). */
export const valueOf = (t: Talk, facts: Flags, name: string) => t.flags[name] ?? facts[name] ?? 0;

export function holds(t: Talk, facts: Flags, c: If | undefined): boolean {
  return list(c).every((k) => {
    if (k.has !== undefined && valueOf(t, facts, k.has) < 1) return false;
    if (k.not !== undefined && valueOf(t, facts, k.not) >= 1) return false;
    if (k.min && valueOf(t, facts, k.min[0]) < k.min[1]) return false;
    if (k.quest !== undefined) {
      const s = stepOf(t, k.quest);
      const want = k.step ?? 'active';
      if (want === 'none' ? s !== 0 : want === 'done' ? s !== DONE : want === 'active' ? s < 1 || s === DONE : s !== want) return false;
    }
    return true;
  });
}

/** Run effects on a talk (a copy comes back) and say what the scene must do. */
export function apply(t: Talk, effects: Effect[] = []): { talk: Talk; out: Out[] } {
  const talk: Talk = { flags: { ...t.flags }, quests: { ...t.quests } };
  const out: Out[] = [];
  for (const e of effects) {
    if ('set' in e) talk.flags[e.set] = e.to ?? 1;
    else if ('add' in e) talk.flags[e.add] = (talk.flags[e.add] ?? 0) + (e.by ?? 1);
    else if ('quest' in e) {
      const step = e.step === 'done' ? DONE : e.step;
      if (talk.quests[e.quest] !== step) out.push({ kind: 'quest', id: e.quest, step });
      talk.quests[e.quest] = step;
    } else if ('give' in e) out.push({ kind: 'give', reward: e.give });
    else if ('open' in e) out.push({ kind: 'open', panel: e.open });
    else out.push({ kind: 'banner', text: e.banner });
  }
  return { talk, out };
}

/**
 * How much a lever matters (P33, "Attention is a budget"): `story` moves a quest on, hands something over or opens the panel the main
 * quest asks for (house, the blessing, the outro), by the lever itself or the node it leads to; `heard` leads only to a node the player
 * has already been through; `leave` just ends the talk; the rest are `side`. The dialog frame weighs the levers by it (`talkview.ts`).
 */
export type Weight = 'story' | 'side' | 'heard' | 'leave';
const STORY_PANELS: Panel[] = ['house', 'stolen', 'outro'];
const movesStory = (fx: Effect[] | undefined) => (fx ?? []).some((e) => 'quest' in e || 'give' in e || ('open' in e && STORY_PANELS.includes(e.open)));
export function weigh(script: Script, npc: string, c: Choice, t: Talk): Weight {
  const to = c.go && c.go !== END ? c.go : null;
  if (movesStory(c.do) || (to && movesStory(script.nodes[to]?.do))) return 'story';
  const fx = c.do ?? [];
  if (!to && !fx.length) return 'leave';
  if (to && !fx.length && (t.flags[`seen.${npc}.${to}`] ?? 0) >= 1) return 'heard';
  return 'side';
}

/**
 * What a lever is, so the frame can say it at a glance (`talkview.ts`): `quest` gives, advances or turns in a quest (it moves the story, or
 * is only shown while a quest of the giver's is active), `action` does something (opens a panel or shows a banner), `talk` leads to more
 * dialog, `exit` just leaves. All derived from what the lever and the node it leads to do; no field to set.
 */
export type Kind = 'quest' | 'action' | 'talk' | 'exit';
const activeQuest = (c: If | undefined) => list(c).some((k) => k.quest !== undefined && k.step !== 'none' && k.step !== 'done');
export function kindOf(script: Script, c: Choice): Kind {
  const to = c.go && c.go !== END ? c.go : null;
  const fx = [...(c.do ?? []), ...(to ? script.nodes[to]?.do ?? [] : [])];
  if (movesStory(c.do) || (to && movesStory(script.nodes[to]?.do)) || activeQuest(c.if)) return 'quest';
  if (fx.some((e) => 'open' in e || 'banner' in e)) return 'action';
  return to ? 'talk' : 'exit';
}

/** What is wrong with a script (empty when sound): dangling targets, a missing fallback entry, unknown quests or steps. */
export function validate(name: string, s: Script, quests: Quests = {}): string[] {
  const errs: string[] = [];
  const at = (go: string | undefined) => go === undefined || go === END || s.nodes[go];
  s.entry.forEach((e, i) => {
    if (!s.nodes[e.go]) errs.push(`${name}: entry ${i} goes to unknown node "${e.go}"`);
  });
  if (!s.entry.some((e) => !e.if)) errs.push(`${name}: no entry without an "if" (nothing to fall back on)`);
  const effects = (where: string, es: Effect[] = []) =>
    es.forEach((e) => {
      if (!('quest' in e)) return;
      const q = quests[e.quest];
      if (!q) errs.push(`${where}: unknown quest "${e.quest}"`);
      else if (e.step !== 'done' && (e.step < 1 || e.step > q.steps.length)) errs.push(`${where}: quest "${e.quest}" has no step ${e.step}`);
    });
  for (const [id, n] of Object.entries(s.nodes)) {
    const w = `${name}.${id}`;
    if (!at(n.go)) errs.push(`${w}: goes to unknown node "${n.go}"`);
    n.then?.forEach((t, i) => !at(t.go) && errs.push(`${w}: then ${i} goes to unknown node "${t.go}"`));
    if (!n.say?.length && !n.cycle?.length && !n.choices?.length && !n.go) errs.push(`${w}: says nothing and leads nowhere`);
    if (n.cycle?.some((c) => !c.length)) errs.push(`${w}: an empty cycle`);
    effects(w, n.do);
    n.choices?.forEach((c, i) => {
      if (!at(c.go)) errs.push(`${w}: lever ${i} goes to unknown node "${c.go}"`);
      effects(`${w} lever ${i}`, c.do);
    });
  }
  return errs;
}

export type Phase = 'line' | 'choose' | 'end';

/**
 * One conversation: lines in turn (`next()`), then the levers (`pick(i)`), nodes chained by `go`. `talk` is the state
 * after everything said so far (save it after each change), `out` collects what the scene must do. A node's lines vary
 * with how often it was visited (`seen.<npc>.<node>`), so a repeated visit moves on through a `cycle`.
 */
export class Conversation {
  talk: Talk;
  out: Out[] = [];
  phase: Phase = 'line';
  node = '';
  line: Line | null = null;
  private queue: Line[] = [];

  constructor(readonly npc: string, private script: Script, talk: Talk, private facts: Flags = {}) {
    this.talk = apply(talk, [{ add: `talked.${npc}` }]).talk;
    const first = script.entry.find((e) => holds(this.talk, facts, e.if));
    if (first) this.enter(first.go);
    else this.phase = 'end';
  }

  /** The levers showing now (those whose `if` holds), in order. */
  get choices(): Choice[] {
    if (this.phase !== 'choose') return [];
    const shown = (this.script.nodes[this.node].choices ?? []).filter((c) => holds(this.talk, this.facts, c.if));
    // A way out always comes last (the sort is stable).
    return [...shown.filter((c) => kindOf(this.script, c) !== 'exit'), ...shown.filter((c) => kindOf(this.script, c) === 'exit')];
  }

  /** What each lever showing is (`kindOf`), in the order of `choices`. */
  get kinds(): Kind[] {
    return this.choices.map((c) => kindOf(this.script, c));
  }

  /** How much each lever showing matters (`weigh`), in the order of `choices`. */
  get weights(): Weight[] {
    return this.choices.map((c) => weigh(this.script, this.npc, c, this.talk));
  }

  /** The current line's gesture. */
  get act(): Act | null {
    return this.line ? actFor(this.line) : null;
  }

  private run(effects: Effect[] | undefined) {
    const r = apply(this.talk, effects);
    this.talk = r.talk;
    this.out.push(...r.out);
  }

  private enter(id: string, depth = 0) {
    if (id === END || depth > 40 || !this.script.nodes[id]) return this.finish();
    const n = this.script.nodes[id];
    this.node = id;
    const key = `seen.${this.npc}.${id}`;
    const seen = this.talk.flags[key] ?? 0;
    this.run([{ add: key }]);
    this.run(n.do);
    const lines = n.cycle?.length ? n.cycle[seen % n.cycle.length] : n.say ?? [];
    // `{name}` in a line is a fact's number when the game has one by that name (`{adviceIgnored}`); key prompts ({use}) are not facts and stay.
    this.queue = lines.map(lineOf).map((l) => ({ ...l, t: l.t.replace(/\{(\w+)\}/g, (m, k: string) => (k in this.facts ? String(this.facts[k]) : m)) }));
    this.advance(depth);
  }

  private advance(depth = 0) {
    const n = this.script.nodes[this.node];
    const l = this.queue.shift();
    if (l) {
      this.line = l;
      this.phase = 'line';
    } else if (n.choices && this.visible(n)) {
      this.line = null;
      this.phase = 'choose';
    } else {
      const go = n.then?.find((t) => holds(this.talk, this.facts, t.if))?.go ?? n.go;
      if (go && go !== END) this.enter(go, depth + 1);
      else this.finish();
    }
  }

  private visible(n: Node) {
    return (n.choices ?? []).some((c) => holds(this.talk, this.facts, c.if));
  }

  private finish() {
    this.phase = 'end';
    this.line = null;
  }

  /** Done with the current line: the next one, then the levers, then on. */
  next() {
    if (this.phase === 'line') this.advance();
  }

  /** Pull a lever (an index into `choices`). */
  pick(i: number) {
    const c = this.choices[i];
    if (!c) return;
    this.run(c.do);
    if (c.go && c.go !== END) this.enter(c.go);
    else this.finish();
  }

  /** Leave mid-sentence (Esc). Nothing more is run. */
  leave() {
    this.finish();
  }
}

/**
 * The robots' AI in the mission (P25, systems.md "Robot AI"): reads the Sim into `brain.ts`'s shapes, thinks every
 * `AI.every` s and after its reaction delay on an event, and carries the choice out each step. Sim calls `act` from
 * `thinkRole`, and `noteHurt`, `noteDown`, `noteOrder`, `noteCommHit` where those things happen.
 *
 * A robot's `Mind` (`Bot.mind`) holds its goal, what it is doing and why (`doing`, `why`), its target and the scores that
 * chose it, its retreat, its dodge, its idle thing. Every choice the player should read sends `{ e: 'ai' }` (Play draws a
 * ring, a puff or a bark); `ai <bot>` (`explain`) prints the mind and `aiSummary` goes in `debugState().ai`.
 *
 * Add a role's behaviour: a branch in `decide` (what it chooses) and in `carry` (how it moves and works); new numbers in
 * `AI` (brain.ts); the Mule's carry job (P5) is `haulJob` and `haul`. Add a telegraph a bot should dodge: a line in `telegraphs`.
 * Abilities a bot chooses to use are `botskills.ts`; a Berserker spec (`leavesCrew`) rushes the nearest elite (`rushTarget`).
 */
import type { Rng } from '../../../../harness/kit/rng';
import { AI, covers, delayFor, dodgeIn, healPick, inLeash, pickTarget, reasonOf, retreatTo, retreating, sidesteps, underFire, wake, type Cand, type Goal, type Scored, type Self, type Spot, type Tele } from './brain';
import { COAL, DOWNED, FOES, GATHER, MARKSMAN, NEST, MISSION, MULE, REPAIR, ROLES, SAW, SCATTERGUN, SPIDER, STALKER, T, TIER, TWISTED, WEAPON, bossNow, countersOf } from './defs';
import { carrySkill, castSkills, live, numOf, stab, stalk } from './botskills';
import { carriedBy, downedNear, pickUp, putDown } from './downed';
import { sawStroke, untouchable } from './combat';
import { CLIMB } from './path';
import { typeMul } from './missionfx';
import { propTeles } from './props';
import { weatherTeles } from './weather';
import { behaviourOf, isBotType, type SpecId } from './specs';
import { limbTeles } from './limbs';
import { chirp, chirped, remoteTarget } from './junkplay';
import { foeDash, tauntedBy } from './tiers';
import type { Bot, Hornet, Loot, Nest, Sim } from './sim';
import { dist } from './geom';

export type Doing = 'work' | 'fight' | 'heal' | 'fetch' | 'retreat' | 'dodge' | 'brace' | 'cover' | 'idle' | 'follow' | 'evac' | 'haul';
export type IdleKind = 'loot' | 'ruin' | 'polish' | 'chat' | 'sky';
/** What the view shows of a choice. */
export type AiWhat = 'dodge' | 'brace' | 'retreat' | 'rejoin' | 'cover' | 'focus' | 'cast' | IdleKind;

export interface Mind {
  delay: number;
  /** Sim time of the next think. */
  next: number;
  goal: Goal;
  doing: Doing;
  why: string;
  target: number;
  /** The elite a Berserker has left its crew for (0: none). */
  rush: number;
  /** What the support types are about (`botskills.ts`: "cloud on 4 foes"), and where a Boilermancer would throw its cloud. */
  note?: string;
  cluster?: Spot;
  /** Sim time it last struck or was struck: a Stalker hides again after a while without (`botskills.ts` `stealthStep`). */
  fought: number;
  scores: Scored[];
  heal: number[];
  back: boolean;
  backTo?: string;
  barkedBack: boolean;
  hits: number[];
  coverT: number;
  dodge?: { x: number; y: number; until: number; tele: string };
  /** A think wanted sooner than the next `AI.every` (a tell about to stop following). */
  soon?: number;
  braceT: number;
  /** Telegraphs it has already reacted to (ids, pruned to the live ones). */
  seen: Set<string>;
  /** Where the gatherer last worked (a ruin or a seam): it sweeps the gobs lying round it. */
  site?: Spot;
  idle?: { what: IdleKind; until: number; x?: number; y?: number; with?: number; ruin?: number; said?: boolean };
  idleT: number;
  looked: Set<number>;
  sky: boolean;
}


// ---------------------------------------------------------------- what the Sim keeps for the AI

interface World { t: number; tele: Tele[]; shotBy: Map<number, number>; crewTarget: Map<number, number> }
const worlds = new WeakMap<Sim, World>();
const streams = new WeakMap<Sim, Rng>();
const commHits = new WeakMap<Sim, { id: number; t: number }>();
/** When the last chat began: one pair at a time starts talking (`AI.chatGap`). */
const chats = new WeakMap<Sim, number>();
const rngOf = (sim: Sim) => streams.get(sim) ?? (streams.set(sim, sim.r.fork('brain')), streams.get(sim)!);

function mindOf(sim: Sim, b: Bot): Mind {
  if (!b.mind) {
    const delay = delayFor(sim.seed, b.id);
    b.mind = {
      delay, next: sim.time + delay, goal: { kind: 'follow', x: b.x, y: b.y, leash: 0 }, doing: 'follow', why: '', target: 0, rush: 0, fought: -Infinity, scores: [], heal: [],
      back: false, barkedBack: false, hits: [], coverT: 0, braceT: 0, seen: new Set(), idleT: sim.time + rngOf(sim).range(...AI.idleEvery), looked: new Set(), sky: false,
    };
  }
  return b.mind;
}

/** This step's shared view: the telegraphs, who shoots what, each crew's focus. Built once per Sim step. */
function world(sim: Sim): World {
  const w = worlds.get(sim);
  if (w && w.t === sim.time) return w;
  const shotBy = new Map<number, number>();
  const votes = new Map<number, Map<number, number>>();
  for (const b of sim.crew) {
    const m = b.mind;
    if (!m || !m.target || m.doing !== 'fight') continue;
    shotBy.set(m.target, (shotBy.get(m.target) ?? 0) + 1);
    const v = votes.get(b.crew) ?? new Map<number, number>();
    v.set(m.target, (v.get(m.target) ?? 0) + 1);
    votes.set(b.crew, v);
  }
  const crewTarget = new Map<number, number>();
  for (const [crew, v] of votes) crewTarget.set(crew, [...v].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]);
  const next = { t: sim.time, tele: telegraphs(sim), shotBy, crewTarget };
  worlds.set(sim, next);
  return next;
}

/**
 * Every area a blow is about to land in, and the ground to keep off: a pounce's landing, a dash's or a charge's lane, a
 * slam, a dig coming up, a mortar shell; the tier patches; props about to burst and the zones that burn (`propTeles`).
 */
export function telegraphs(sim: Sim): Tele[] {
  const out: Tele[] = [];
  for (const h of sim.hornets) {
    if (h.dead) continue;
    const S = h.spider;
    if (S && (S.mode === 'tellPounce' || S.mode === 'leap'))
      out.push({ id: `pounce${h.id}`, kind: 'disc', x: S.tx, y: S.ty, r: SPIDER.pounce.radius, from: { x: h.x, y: h.y }, fixes: S.mode === 'tellPounce' ? Math.max(0, S.t - SPIDER.pounce.lock) : 0 });
    const br = h.brain;
    if (!h.boss && !S && (br.state === 'tell' || br.state === 'go')) {
      const D = foeDash(h);
      if (D) {
        const speed = FOES[h.kind].speed * (h.twisted ? TWISTED[h.kind].speed ?? 1 : 1);
        // A dash's line follows its target to the end of the wind-up.
        out.push({ id: `dash${h.id}`, kind: 'lane', x: h.x, y: h.y, dx: br.dx, dy: br.dy, len: speed * D.speed * (br.state === 'go' ? Math.max(0, br.t) : D.time) + h.reach, w: h.r * 2 + 8, fixes: br.state === 'tell' ? Math.max(0, br.t) : 0 });
      }
    }
    if (h.boss) {
      const B = bossNow(h.kind, h.phase, h.breaks);
      if (br.state === 'tellCharge' || br.state === 'charge')
        out.push({ id: `charge${h.id}`, kind: 'lane', x: h.x, y: h.y, dx: br.dx, dy: br.dy, len: B.charge.speed * (br.state === 'charge' ? Math.max(0, br.t) : B.charge.time), w: h.r * 2 + 10, fixes: br.state === 'tellCharge' ? Math.max(0, br.t - 0.25) : 0 });
      if (br.state === 'slam' && B.slam && h.slam) out.push({ id: `slam${h.id}`, kind: 'disc', x: h.slam.x, y: h.slam.y, r: B.slam.radius, fixes: Math.max(0, br.t - B.slam.lock) });
    }
    const ts = h.ts;
    if (ts?.dig?.mode === 'tell') out.push({ id: `dig${h.id}`, kind: 'disc', x: ts.dig.tx, y: ts.dig.ty, r: TIER.burrow.radius });
    if (ts?.shell) out.push({ id: `shell${h.id}`, kind: 'disc', x: ts.shell.x, y: ts.shell.y, r: TIER.mortar.radius });
    limbTeles(sim, h, out); // an elite's claw or tentacle winding up (P50)
  }
  for (const p of sim.tiers.patches) out.push({ id: `patch${p.id}`, kind: 'patch', x: p.x, y: p.y, r: p.r });
  out.push(...propTeles(sim)); // props about to burst, fire, steam and shock zones
  out.push(...weatherTeles(sim)); // the Ember Rain's marks
  return out;
}

// ---------------------------------------------------------------- events from the Sim

/** A robot was hit: it remembers when (a gatherer under fire) and thinks again after its delay. */
export function noteHurt(sim: Sim, b: Bot) {
  if (b.role === 'controller') return;
  const m = mindOf(sim, b);
  m.hits = [...m.hits.filter((t) => sim.time - t <= AI.coverWindow), sim.time];
  m.fought = sim.time;
  m.next = wake(m.next, sim.time, m.delay);
}
/** A robot went down: everyone rethinks. */
export function noteDown(sim: Sim) {
  for (const b of sim.crew) if (b.mind) b.mind.next = wake(b.mind.next, sim.time, b.mind.delay);
}
/** A crew got an order. */
export function noteOrder(sim: Sim, crew: number) {
  for (const b of sim.crew) if (b.crew === crew && !b.own && b.mind) b.mind.next = wake(b.mind.next, sim.time, b.mind.delay);
}
/** Robots got their own order, or were given back to their crew's (P3, `command.ts`). */
export function noteBots(sim: Sim, bots: Bot[]) {
  for (const b of bots) if (b.mind) b.mind.next = wake(b.mind.next, sim.time, b.mind.delay);
}
/** The Communicator hit a foe: it is "his target" for a while. */
export function noteCommHit(sim: Sim, id: number) {
  commHits.set(sim, { id, t: sim.time });
}

// ---------------------------------------------------------------- goals

/** The point a robot is sent to: its own order (P3, `Bot.own`) over its crew's; null when it follows him or holds. */
export function orderPoint(sim: Sim, b: Bot) {
  if (b.own) return b.own === 'follow' ? null : b.own;
  return b.crew !== 0 ? sim.orders[b.crew] : null;
}

/** What the bot is set to do: orders read as goals (crew 0 follows him; a sent crew or robot goes; the lift is evac). */
export function goalOf(sim: Sim, b: Bot): Goal {
  const a = sim.anchor(b);
  const R = MISSION.workTiles * T;
  const own = b.role === 'marksman' ? 2.4 : 1.8;
  const o = orderPoint(sim, b);
  // Sent to the lift, or he has asked the lift (pressed Use once on it): evac.
  if ((o && sim.onLift(o, 0.5)) || (!o && sim.armed?.key === 'lift')) return { kind: 'evac', x: a.x, y: a.y, leash: T * 2.5 };
  if (o) return { kind: 'go', x: a.x, y: a.y, leash: AI.leashTiles * T };
  // A Bodyguard stays by him: it fights what comes within a few tiles of the Communicator, no farther.
  if (specOf(b).guardsComm && sim.follows(b) && !sim.controller.dead) return { kind: 'follow', x: a.x, y: a.y, leash: AI.guardTiles * T };
  return { kind: sim.follows(b) && !sim.controller.dead ? 'follow' : 'hold', x: a.x, y: a.y, leash: R * own };
}

// ---------------------------------------------------------------- the step

/** How far its shots reach: its range stat and the day's, and 20% farther from rock in spider legs (P53, `CLIMB.high`). */
export const reachOf = (sim: Sim, b: Bot, base: number) => sim.engine.stat(b, 'range', base) * sim.fx.reach * (b.climbs && sim.onRock(b) ? 1 + CLIMB.high : 1);
const fighter = (b: Bot) => b.role === 'guard' || b.role === 'marksman' || b.role === 'stalker';
const weaponOf = (b: Bot) => (b.role === 'marksman' ? WEAPON.marksman : b.role === 'stalker' ? { dmg: STALKER.dmg, rate: STALKER.rate, speed: 0, range: STALKER.reach } : WEAPON.guard);
const specOf = (b: Bot) => (b.spec && isBotType(b.role) ? behaviourOf(b.role, b.spec as SpecId) : {});
function emit(sim: Sim, b: Bot, what: AiWhat, o: { x?: number; y?: number; to?: number; why?: string } = {}) {
  sim.events.push({ e: 'ai', bot: b, what, ...o });
}

/** One step of a crew robot: notice events, think when due, then carry the choice out. */
export function act(sim: Sim, b: Bot, dt: number) {
  const m = mindOf(sim, b);
  const w = world(sim);
  const now = sim.time;
  const r = ROLES[b.role].r;
  if (m.target && !alive(sim, m.target)) {
    m.target = 0;
    m.next = wake(m.next, now, m.delay);
  }
  // A tell that covers it: it reacts after its delay (the think then sidesteps, if it still covers it).
  const live = new Set<string>();
  for (const t of w.tele)
    if (covers(t, b.x, b.y, r)) {
      live.add(t.id);
      if (!m.seen.has(t.id)) {
        // A smoke detector near it has chirped: no reaction to wait out (J9).
        const warned = chirped(sim, b);
        m.next = wake(m.next, now, warned ? 0 : m.delay);
        if (warned) chirp(sim, b);
      }
    }
  for (const id of m.seen) if (!live.has(id)) m.seen.delete(id);
  if (now >= m.next) {
    m.soon = undefined;
    decide(sim, b, m, w);
    m.next = Math.min(now + AI.every, m.soon ?? Infinity);
  }
  carry(sim, b, m, w, dt);
}

const alive = (sim: Sim, id: number) => sim.hornets.some((h) => h.id === id && !h.dead && !h.under) || sim.nests.some((n) => n.id === id && n.awake && !n.dead);
const foeOf = (sim: Sim, id: number): Hornet | Nest | null => sim.hornets.find((h) => h.id === id && !h.dead) ?? sim.nests.find((n) => n.id === id && !n.dead) ?? null;

/** The nearest foe to a point (within `range`), for where a threat is. */
function threat(sim: Sim, x: number, y: number, range: number): Hornet | null {
  let best: Hornet | null = null, bd = range;
  for (const h of sim.hornets) {
    if (h.dead || h.under || h.calm || h.sleep) continue;
    const d = dist(x, y, h.x, h.y);
    if (d < bd) (bd = d), (best = h);
  }
  return best;
}

function decide(sim: Sim, b: Bot, m: Mind, w: World) {
  const now = sim.time;
  const r = ROLES[b.role].r;
  const goal = (m.goal = goalOf(sim, b));
  const evac = goal.kind === 'evac';
  // Retreat: under 35% it falls back, above 60% it rejoins (evac overrides).
  const frac = b.hp / Math.max(1, b.maxHp);
  const was = m.back;
  m.back = !evac && retreating(frac, was);
  if (m.back && !was) {
    const rep = sim.crew.some((o) => o !== b && o.role === 'repairer' && o.crew === b.crew);
    emit(sim, b, 'retreat');
    if (!rep && !m.barkedBack) {
      m.barkedBack = true;
      sim.bark(b, 'retreat', true);
    }
  } else if (!m.back && was) emit(sim, b, 'rejoin');
  // Dodging: a tell's area covers it now (its delay has passed): sidestep, or brace if it is heavy (Steady).
  for (const t of w.tele) {
    if (m.seen.has(t.id) || !covers(t, b.x, b.y, r)) continue;
    // It still follows its target: step aside once it stops (a step now would only be followed).
    const wait = dodgeIn(t);
    if (wait > 0) {
      m.soon = Math.min(m.soon ?? Infinity, now + wait);
      continue;
    }
    m.seen.add(t.id);
    if (t.kind !== 'patch' && sim.engine.flag(b, 'steady')) {
      m.braceT = now + AI.dodgeTime;
      emit(sim, b, 'brace');
      continue;
    }
    const ways = sidesteps(t, b.x, b.y, r).filter((p) => !sim.blocked(p.x, p.y, b) && !w.tele.some((o) => o !== t && covers(o, p.x, p.y, r)));
    if (ways[0]) {
      m.dodge = { x: ways[0].x, y: ways[0].y, until: now + AI.dodgeTime, tele: t.id };
      if (t.kind !== 'patch') emit(sim, b, 'dodge', { x: ways[0].x, y: ways[0].y });
    }
  }
  // A Berserker leaves its crew for the nearest elite in reach: the scoring then takes that one alone.
  m.rush = specOf(b).leavesCrew && fighter(b) && !evac && !m.back ? rushTarget(sim, b)?.id ?? 0 : 0;
  // Targets: the fighters score every foe in sight and in the goal's leash.
  m.scores = [];
  const prev = m.target;
  if (fighter(b)) {
    m.scores = scoreFoes(sim, b, m, w, goal);
    m.target = m.scores[0]?.id ?? 0;
    const taunter = tauntedBy(sim, b); // a Broadcaster's taunt: it shoots at that one, whatever it scored
    if (taunter) m.target = taunter.id;
    else {
      const aimed = remoteTarget(sim, b); // the TV remote (J10): it fires where he aims
      if (aimed) m.target = aimed.id;
    }
    if (m.target && m.target !== prev) {
      const why = taunter ? 'taunted' : reasonOf(m.scores[0]);
      if (why) emit(sim, b, 'focus', { to: m.target, why });
    }
  } else m.target = 0;
  castSkills(sim, b, m, goal);
  // The Repairer's beam.
  if (b.role === 'repairer') {
    const allies = sim.bots.filter((o) => !o.dead && o !== b && !sim.engine.isDown(o) && inLeash(goal, o.x, o.y)).map((o) => ({ id: o.id, frac: o.hp / Math.max(1, o.maxHp), d: dist(b.x, b.y, o.x, o.y) }));
    m.heal = healPick(allies, { current: m.heal[0] ?? 0, chains: Number(specOf(b).beamChains ?? 0), reach: REPAIR.rangeTiles * T });
  }
  // A gatherer hit twice in 3 s steps behind a guard.
  if (b.role === 'gatherer' && underFire(m.hits, now)) {
    if (m.coverT < now) emit(sim, b, 'cover');
    m.coverT = m.hits[m.hits.length - 1] + AI.coverHold;
  }
  // What it is doing, and why.
  const busy = work(sim, b, m, goal);
  m.doing = evac ? 'evac' : m.back ? 'retreat' : m.heal.length && b.role === 'repairer' ? 'heal' : m.target ? 'fight' : m.coverT > now ? 'cover' : busy ? busy : 'follow';
  m.why = why(sim, b, m);
  // Idle life: no foe within 12 tiles and nothing to do.
  if (m.doing === 'follow' && !threat(sim, b.x, b.y, AI.idleTiles * T)) idle(sim, b, m, goal);
  else if (m.idle && m.doing !== 'follow') m.idle = undefined;
  if (m.idle && now < m.idle.until) {
    m.doing = 'idle';
    m.why = `idle: ${m.idle.what}`;
  }
}

/** The work a role has without a foe: a gatherer's job (a coal seam to mine or a ruin to strip) and the gobs round it, a mule's loot. */
function work(sim: Sim, b: Bot, m: Mind, g: Goal): Doing | null {
  if (g.kind === 'evac') return null;
  const R = MISSION.workTiles * T;
  if (b.role === 'gatherer') {
    const job = sim.jobFor(g.x, g.y, R + 2 * T);
    if (job) m.site = { x: job.x, y: job.y };
    if (sweepLoot(sim, b, m, g)) return 'fetch';
    if (job) return 'work';
  }
  if (b.role === 'mule' && haulJob(sim, b, g)) return 'haul';
  if (fetches(b) && muleLoot(sim, b, g)) return 'fetch';
  return null;
}

/**
 * The Mule's carry job (P5, decisions.md "Minos on the Mule"): a downed robot lying within `MULE.fetchTiles` of its crew's
 * goal (as it fetches loot), or the lift while it carries one. Not one already at the lift or being fixed. Not hunted: it
 * does not leave its crew for one farther off.
 */
function haulJob(sim: Sim, b: Bot, g: Goal): Spot | null {
  if (carriedBy(sim, b).length) return sim.lift;
  let got: Bot | null = null, gd = Infinity;
  for (const o of sim.bots) {
    if (o.dead || !o.downed || o.downed.by !== null || sim.onLift(o, 1) || sim.action?.bot === o || dist(g.x, g.y, o.x, o.y) > MULE.fetchTiles * T) continue;
    const d = dist(b.x, b.y, o.x, o.y);
    if (d < gd) (gd = d), (got = o);
  }
  return got;
}

/** It walks to a downed robot and picks it up, picks up what lies within reach on the way, and sets them down on the lift. */
function haul(sim: Sim, b: Bot, g: Goal, dt: number) {
  const here = downedNear(sim, b.x, b.y, DOWNED.reach);
  if (here && !sim.onLift(here, 1)) pickUp(sim, b, here);
  const to = haulJob(sim, b, g);
  if (!to) return;
  b.state = 'move';
  if (to === sim.lift && sim.go(b, to.x, to.y, dt, T) && sim.onLift(b, 0.6)) putDown(sim, b);
  else if (to !== sim.lift) sim.go(b, to.x, to.y, dt, DOWNED.reach * 0.6);
}

/**
 * The scrap and copper gobs lying round where a gatherer works (`GATHER.sweep` tiles, wider for a Sweeper) that it fetches: the
 * Mule leaves those to it while it is at work (`muleLoot`), and keeps the rest of the crew's loot.
 */
function sweepLoot(sim: Sim, b: Bot, m: Mind, g: Goal): Loot | null {
  if (b.role !== 'gatherer' || !m.site) return null;
  const r = GATHER.sweep * T * Number(specOf(b).sweepMul ?? 1);
  let got: Loot | null = null, ld = Infinity;
  for (const l of sim.loot) {
    if (l.dead || (l.kind !== 'scrap' && l.kind !== 'copper') || dist(m.site.x, m.site.y, l.x, l.y) > r || dist(g.x, g.y, l.x, l.y) > g.leash) continue;
    const d = dist(b.x, b.y, l.x, l.y);
    if (d < ld) (ld = d), (got = l);
  }
  return got;
}

function why(sim: Sim, b: Bot, m: Mind): string {
  switch (m.doing) {
    case 'retreat': {
      const to = retreatSpot(sim, b);
      m.backTo = to.why;
      return `oil ${Math.round((b.hp / b.maxHp) * 100)}%: back to ${to.why === 'repairer' ? 'the Repairer' : to.why === 'comm' ? 'the Communicator' : 'the lift'}`;
    }
    case 'fight': {
      const s = m.scores[0];
      if (m.rush) return `left the crew for elite h${m.rush}`;
      return s ?`h${s.id} ${s.score} (${Object.entries(s.parts).map(([k, v]) => `${k} ${v}`).join(', ')})` : 'taunted';
    }
    case 'heal':
      return `healing ${m.heal.map((id) => sim.bot(id)?.name ?? id).join(' + ')}`;
    case 'cover':
      return 'hit twice in 3 s: behind a guard';
    case 'evac':
      return 'to the lift';
    case 'follow':
      if (m.note) return m.note;
      return m.goal.kind === 'follow' ? 'with the Communicator' : m.goal.kind === 'go' ? 'at its order' : 'holding its spot';
    default:
      return m.doing;
  }
}

function scoreFoes(sim: Sim, b: Bot, m: Mind, w: World, g: Goal): Scored[] {
  const mk = b.role === 'marksman';
  const W = weaponOf(b);
  const stalker = b.role === 'stalker';
  const sight = sim.sight(b, (mk ? MARKSMAN.sightTiles : stalker ? STALKER.sight : 8) * T);
  const range = stalker ? W.range : reachOf(sim, b, W.range);
  const rate = W.rate / Math.max(0.3, sim.engine.stat(b, 'attackRate', 1));
  const me: Self = { role: b.role, spec: b.spec, range, rate, gun: !stalker, ranged: !stalker, current: m.target, crewTarget: w.crewTarget.get(b.crew) ?? 0 };
  const c = sim.controller;
  const hit = commHits.get(sim);
  const yours = hit && sim.time - hit.t <= AI.commMemory ? hit.id : 0;
  const cands: Cand[] = [];
  const cand = (h: Hornet, d: number): Cand => {
    const tb = h.target ? sim.bot(h.target) : null;
    const attacker = !!tb && ((tb === c && dist(h.x, h.y, c.x, c.y) < 4 * T) || sim.engine.isDown(tb));
    return {
      id: h.id, d, marked: sim.engine.flag(h, 'marked'), commTarget: h.id === yours, attacker, mul: typeMul(h.kind, 'pierce'), elite: h.elite,
      counters: countersOf(h),
      shotBy: (w.shotBy.get(h.id) ?? 0) - (m.target === h.id ? 1 : 0),
    };
  };
  // Left its crew for an elite: that one, wherever it stands in the goal's leash.
  const rush = m.rush ? sim.hornets.find((h) => h.id === m.rush && !h.dead) : undefined;
  if (rush) return pickTarget(me, [cand(rush, dist(b.x, b.y, rush.x, rush.y))]);
  for (const h of sim.hornets) {
    if (h.dead || h.under || h.calm || h.sleep) continue; // a calm one (Where Hornets Go) or a sleeping one (D38): crews leave it be
    const d = dist(b.x, b.y, h.x, h.y);
    if (d > sight || !inLeash(g, h.x, h.y)) continue;
    cands.push(cand(h, d));
  }
  // Awake hives near it, when no foe is.
  if (!cands.length)
    for (const n of sim.nests) {
      const d = dist(b.x, b.y, n.x, n.y);
      if (n.awake && !n.dead && d < 7 * T && inLeash(g, n.x, n.y)) cands.push({ id: n.id, d, nest: true });
    }
  return pickTarget(me, cands);
}

/** The nearest elite within `AI.rushTiles` of a Berserker (the one it already rushes keeps its place while it stays in reach). */
function rushTarget(sim: Sim, b: Bot): Hornet | null {
  let best: Hornet | null = null, bd = AI.rushTiles * T;
  for (const h of live(sim)) {
    if (!h.elite) continue;
    const d = dist(b.x, b.y, h.x, h.y) - (h.id === b.mind?.rush ? T : 0);
    if (d < bd) (bd = d), (best = h);
  }
  return best;
}

/** Ground to keep off (a hazard patch, a bursting prop's disc) holds this spot for a body of radius `r`. */
const patched = (sim: Sim, x: number, y: number, r: number) => world(sim).tele.some((t) => t.kind === 'patch' && covers(t, x, y, r));

function retreatSpot(sim: Sim, b: Bot) {
  const rep = sim.crew.filter((o) => o !== b && o.role === 'repairer' && o.crew === b.crew && inLeash(b.mind?.goal ?? goalOf(sim, b), o.x, o.y)).sort((p, q) => dist(b.x, b.y, p.x, p.y) - dist(b.x, b.y, q.x, q.y))[0];
  const c = sim.controller;
  return retreatTo({ repairer: rep ?? null, comm: !c.dead && sim.downT <= 0 && b.role !== 'controller' ? c : null, lift: sim.lift });
}

/** A point `by` px from `at`, on the side away from the threat (behind it). */
function behind(sim: Sim, at: Spot, by: number): Spot {
  const h = threat(sim, at.x, at.y, AI.idleTiles * T);
  if (!h) return at;
  const d = dist(at.x, at.y, h.x, h.y) || 1;
  const p = { x: at.x + ((at.x - h.x) / d) * by, y: at.y + ((at.y - h.y) / d) * by };
  return sim.blocked(p.x, p.y) ? at : p;
}

/** Who fetches the loot lying round its crew: a mule, and any robot wearing a smartphone relic (P19). */
const fetches = (b: Bot) => b.role === 'mule' || b.relic === 'smartphone';

function muleLoot(sim: Sim, b: Bot, g: Goal): Loot | null {
  let got: Loot | null = null, ld = Infinity;
  for (const l of sim.loot) {
    const d = dist(b.x, b.y, l.x, l.y);
    if (!l.dead && d < ld && dist(g.x, g.y, l.x, l.y) < MULE.fetchTiles * T && !gathererSweeps(sim, b, l)) (ld = d), (got = l);
  }
  return got;
}

/** Is a gatherer of the Mule's crew at work close enough to this gob to sweep it up? Then it is the gatherer's. */
function gathererSweeps(sim: Sim, mule: Bot, l: Loot) {
  if (l.kind !== 'scrap' && l.kind !== 'copper') return false;
  return sim.crew.some((o) => o.role === 'gatherer' && !o.dead && o.crew === mule.crew && !!o.mind?.site && (o.mind.doing === 'work' || o.mind.doing === 'fetch') && dist(o.mind.site.x, o.mind.site.y, l.x, l.y) <= GATHER.sweep * T * Number(specOf(o).sweepMul ?? 1));
}

// ---------------------------------------------------------------- idle life

function idle(sim: Sim, b: Bot, m: Mind, g: Goal) {
  const now = sim.time;
  if (sim.day.phase !== 'evening') m.sky = false;
  if (m.idle && now < m.idle.until) return;
  m.idle = undefined;
  const R = rngOf(sim);
  // Every bot turns to watch the sky at dusk (once an evening).
  if (sim.day.phase === 'evening' && !m.sky) {
    m.sky = true;
    m.idle = { what: 'sky', until: now + 3 };
    emit(sim, b, 'sky');
    if (R.chance(0.35)) sim.bark(b, 'sky');
    return;
  }
  if (now < m.idleT) return;
  m.idleT = now + R.range(...AI.idleEvery);
  // Loot in reach.
  const l = sim.loot.find((x) => !x.dead && dist(b.x, b.y, x.x, x.y) < AI.lootTiles * T && dist(g.x, g.y, x.x, x.y) < g.leash);
  if (l) {
    m.idle = { what: 'loot', until: now + 4, x: l.x, y: l.y };
    emit(sim, b, 'loot', { x: l.x, y: l.y });
    return;
  }
  // A ruin it has not looked at: walk up, look, bark the colony's reading.
  const ru = sim.ruins.find((x) => !m.looked.has(x.id) && dist(b.x, b.y, x.x, x.y) < AI.ruinTiles * T && dist(g.x, g.y, x.x, x.y) < g.leash);
  if (ru) {
    m.looked.add(ru.id);
    const a = R.range(0, Math.PI * 2);
    m.idle = { what: 'ruin', until: now + 5, x: ru.x + Math.cos(a) * T * 1.4, y: ru.y + Math.sin(a) * T, ruin: ru.id };
    return;
  }
  // A mate standing idle near: they face each other and chat.
  const mate = sim.crew.find((o) => o !== b && o.crew === b.crew && o.mind && (o.mind.doing === 'follow' || (o.mind.doing === 'idle' && o.mind.idle?.what !== 'chat')) && dist(b.x, b.y, o.x, o.y) < AI.chatTiles * T);
  if (mate && now - (chats.get(sim) ?? -Infinity) > AI.chatGap && R.chance(0.5)) {
    chats.set(sim, now);
    m.idle = { what: 'chat', until: now + 4, with: mate.id, said: true };
    mate.mind!.idle = { what: 'chat', until: now + 4, with: b.id };
    mate.mind!.doing = 'idle';
    mate.mind!.idleT = now + R.range(...AI.idleEvery);
    emit(sim, b, 'chat', { to: mate.id });
    sim.bark(b, 'chat', true);
    return;
  }
  if (b.role === 'gatherer') {
    m.idle = { what: 'polish', until: now + 2.5 };
    emit(sim, b, 'polish');
    if (R.chance(0.3)) sim.bark(b, 'polish');
  }
}

// ---------------------------------------------------------------- carrying it out

function carry(sim: Sim, b: Bot, m: Mind, w: World, dt: number) {
  const now = sim.time;
  const g = m.goal;
  const tgt = m.target ? foeOf(sim, m.target) : null;
  // A sidestep comes first (it still shoots on the way), then a brace.
  const D = m.dodge;
  const area = D && w.tele.find((x) => x.id === D.tele);
  if (D && area && !(area.kind === 'patch' && !covers(area, b.x, b.y, ROLES[b.role].r * 0.5 + 4))) {
    // Full speed through the point (a walk eases in near its goal) until the area no longer holds it; then it stands
    // clear until the blow has landed (its way back to its slot would walk it back in).
    if (now < D.until && covers(area, b.x, b.y, ROLES[b.role].r * 0.5 + 4)) {
      const dd = dist(b.x, b.y, D.x, D.y) || 1;
      b.state = 'move';
      sim.go(b, D.x + ((D.x - b.x) / dd) * 40, D.y + ((D.y - b.y) / dd) * 40, dt, 0);
    }
    if (tgt) shootIf(sim, b, tgt);
    return;
  }
  m.dodge = undefined;
  if (m.braceT > now) {
    if (tgt) {
      b.state = 'fight';
      b.target = tgt.id;
      shootIf(sim, b, tgt);
    }
    return;
  }
  if (m.doing === 'retreat') {
    const to = retreatSpot(sim, b).to;
    const p = to === sim.lift ? to : behind(sim, to, AI.retreatNear);
    sim.go(b, p.x, p.y, dt, 10);
    if (tgt) {
      b.state = 'fight';
      b.target = tgt.id;
      shootIf(sim, b, tgt);
    } else if (b.role === 'repairer') beam(sim, b, m, false, dt);
    return;
  }
  if (g.kind === 'evac') {
    // To the lift: it shoots and heals on the way, nothing more.
    if (tgt) shootIf(sim, b, tgt);
    if (b.role === 'repairer' && m.heal.length) beam(sim, b, m, false, dt);
    const s = sim.slot(b);
    sim.go(b, s.x, s.y, dt, 10, sim.city.evacSpeed); // the Tram Line: robots under an evac order run faster
    if (tgt && fighter(b)) b.state = 'fight';
    return;
  }
  if (b.role === 'repairer' && m.heal.length) return beam(sim, b, m, true, dt); // healing beats shooting
  if (m.doing === 'haul') return haul(sim, b, g, dt);
  if (tgt && fighter(b)) return fight(sim, b, tgt, g, dt);
  if (carrySkill(sim, b, m, g, dt)) return; // the Boilermancer keeps off and in reach, the Lamplighter holds its crew's centre
  if (b.role === 'gatherer' && m.coverT > now) {
    const guard = sim.crew.filter((o) => o.role === 'guard' && dist(o.x, o.y, b.x, b.y) < 10 * T).sort((p, q) => dist(b.x, b.y, p.x, p.y) - dist(b.x, b.y, q.x, q.y))[0];
    if (guard) {
      const p = behind(sim, guard, T * 1.2);
      b.state = 'move';
      sim.go(b, p.x, p.y, dt, 8);
      return;
    }
  }
  if (b.role === 'gatherer') {
    const l = sweepLoot(sim, b, m, g);
    if (l) {
      b.state = 'move';
      sim.go(b, l.x, l.y, dt, 2);
      return;
    }
    const job = sim.jobFor(g.x, g.y, MISSION.workTiles * T + 2 * T);
    if (job) {
      const ang = (b.id * 2.4) % (Math.PI * 2);
      const reach = job.seam ? COAL.reach : GATHER.reach;
      const gx = job.x + Math.cos(ang) * (reach - 8), gy = job.y + Math.sin(ang) * (reach - 8) * 0.7;
      if (sim.go(b, gx, gy, dt, 6) || dist(b.x, b.y, job.x, job.y) < reach) {
        if (job.seam) sim.mine(b, job.seam, dt);
        else sim.strip(b, job.ruin!, dt);
      }
      return;
    }
  }
  if (fetches(b)) {
    const l = muleLoot(sim, b, g);
    if (l) {
      b.state = 'move';
      sim.go(b, l.x, l.y, dt, 2);
      return;
    }
  }
  if (m.idle && now < m.idle.until) return idling(sim, b, m, dt);
  const s = sim.slot(b);
  sim.go(b, s.x, s.y, dt, 10);
}

function idling(sim: Sim, b: Bot, m: Mind, dt: number) {
  const I = m.idle!;
  if (I.x !== undefined && I.y !== undefined && !sim.go(b, I.x, I.y, dt, I.what === 'loot' ? 2 : 8)) return;
  if (I.what === 'ruin') {
    const ru = sim.ruins.find((x) => x.id === I.ruin);
    if (ru) b.face = ru.x >= b.x ? 1 : -1;
    if (!I.said && ru) {
      I.said = true;
      I.until = Math.min(I.until, sim.time + 2.5);
      emit(sim, b, 'ruin', { x: ru.x, y: ru.y });
      sim.bark(b, 'ruin', true);
    }
  }
  if (I.what === 'loot') I.until = 0; // picked up on touch (`pickups`)
  if (I.what === 'chat') {
    const o = sim.bot(I.with ?? 0);
    if (!o) return void (I.until = 0);
    b.face = o.x >= b.x ? 1 : -1;
    // The second speaks once the first has had its say.
    if (!I.said && sim.time > I.until - 2.4) {
      I.said = true;
      sim.bark(b, 'chat', true);
    }
  }
  if (I.what === 'sky') b.face = -1; // the sun goes down in the west
}

/** Guards stand between the crew and the threat; ranged bots hold at their range (the marksman backs off), never into a hive's ring. */
function fight(sim: Sim, b: Bot, tgt: Hornet | Nest, g: Goal, dt: number) {
  if (b.role === 'stalker') return stalk(sim, b, tgt, g, dt); // round to its back, then the blade
  const mk = b.role === 'marksman';
  const W = weaponOf(b);
  const range = reachOf(sim, b, W.range);
  const bd = dist(b.x, b.y, tgt.x, tgt.y) || 1;
  b.state = 'fight';
  b.target = tgt.id;
  const ux = (tgt.x - b.x) / bd, uy = (tgt.y - b.y) / bd;
  // A step toward it that would take it into the ring of an awake hive (not the one it shoots) is not taken.
  const ringed = (x: number, y: number) => sim.nests.some((n) => n.awake && !n.dead && n.id !== tgt.id && dist(x, y, n.x, n.y) < AI.hiveRing);
  // A step into a hazard patch is not taken either (it holds its range and shoots, rather than chase through it).
  const r = ROLES[b.role].r;
  const rush = b.mind?.rush === tgt.id;
  const advance = () => {
    const nx = b.x + ux * T, ny = b.y + uy * T;
    if (!ringed(nx, ny) && (rush || inLeash(g, nx, ny)) && !(patched(sim, nx, ny, r) && !patched(sim, b.x, b.y, r))) sim.go(b, tgt.x, tgt.y, dt, rush ? stop : range * 0.85);
  };
  // A Berserker closes to the saw (a guess: 0.7 of its reach past the foe's edge); other rushers to 0.4 of their range.
  const stop = b.role === 'guard' ? SAW.reach * 0.7 + ('kind' in tgt ? tgt.r : NEST.r) : range * 0.4;
  if (b.role === 'guard' && sawFoe(sim, b, tgt)) {
    // A foe at the blade: it stands and saws (`shootIf`), the line can wait.
  } else if (rush) {
    // Left its crew for this elite: closes in on it.
    if (bd > stop) advance();
  } else if (mk) {
    if (bd < (numOf(specOf(b), 'keepsOff') * T || MARKSMAN.keep)) sim.go(b, b.x - ux * T * 2, b.y - uy * T * 2, dt, 0); // a Scattergun keeps 2 tiles off, the rifle `MARKSMAN.keep` px
    else if (bd > range * 0.9) advance();
  } else {
    // The line: out from the crew's anchor toward the threat.
    const ad = dist(g.x, g.y, tgt.x, tgt.y) || 1;
    const out = Math.min(AI.lineOut * T, ad * 0.5);
    const L = { x: g.x + ((tgt.x - g.x) / ad) * out, y: g.y + ((tgt.y - g.y) / ad) * out };
    if (g.kind !== 'evac' && !sim.blocked(L.x, L.y, b) && !patched(sim, L.x, L.y, r) && dist(L.x, L.y, tgt.x, tgt.y) <= range * 0.9) sim.go(b, L.x, L.y, dt, 8);
    else if (bd > range * 0.9) advance();
  }
  shootIf(sim, b, tgt);
}

/** The foe the Guard's saw is in reach of: its target if the blade reaches it, else the nearest awake foe that it does, else none. */
function sawFoe(sim: Sim, b: Bot, tgt: Hornet | Nest): { x: number; y: number } | null {
  const reach = (o: { x: number; y: number }, r: number) => dist(b.x, b.y, o.x, o.y) <= SAW.reach + r;
  if (reach(tgt, 'kind' in tgt ? tgt.r : NEST.r) && !('kind' in tgt && untouchable(sim, tgt, b, 'pierce'))) return tgt;
  let best: Hornet | null = null, bd = Infinity;
  for (const h of live(sim)) {
    const d = dist(b.x, b.y, h.x, h.y);
    if (d <= SAW.reach + h.r && d < bd && !untouchable(sim, h, b, 'pierce')) (best = h), (bd = d);
  }
  return best;
}

function shootIf(sim: Sim, b: Bot, tgt: Hornet | Nest) {
  if (!fighter(b)) return;
  if (b.role === 'stalker') return stab(sim, b, tgt); // a blade; `stalk` closes in
  const mk = b.role === 'marksman';
  const W = weaponOf(b);
  const range = reachOf(sim, b, W.range);
  if (b.role === 'guard') {
    // Up close the saw, at range the gun: a foe in reach of the blade is sawed (the target first, else the nearest) and the gun waits.
    const near = sawFoe(sim, b, tgt);
    if (near) {
      if (b.cd > 0) return;
      b.cd = SAW.rate / Math.max(0.3, sim.engine.stat(b, 'attackRate', 1));
      b.face = near.x >= b.x ? 1 : -1;
      sawStroke(sim, b, Math.atan2(near.y - b.y, near.x - b.x));
      if (b.mind) b.mind.fought = sim.time;
      return;
    }
  }
  if (dist(b.x, b.y, tgt.x, tgt.y) > range || b.cd > 0) return;
  b.cd = W.rate / Math.max(0.3, sim.engine.stat(b, 'attackRate', 1));
  // Blinded (the Snowcat's flood lights): it shoots wild.
  const spread = (mk ? 2 : 6) * Math.max(0, 2 - sim.engine.stat(b, 'accuracy', 1)) + (sim.engine.flag(b, 'blind') ? 70 : 0);
  const pellets = mk ? numOf(specOf(b), 'pellets') : 0;
  if (pellets > 1) {
    // A Scattergun: a cone of pellets, each with a share of the shot (x1.5 in all: a guess), fired the same instant.
    const a = Math.atan2(tgt.y - b.y, tgt.x - b.x), d = dist(b.x, b.y, tgt.x, tgt.y);
    for (let i = 0; i < pellets; i++) {
      const o = a + (i / (pellets - 1) - 0.5) * SCATTERGUN.cone;
      sim.shoot(b, b.x + Math.cos(o) * d, b.y + Math.sin(o) * d, { ...W, dmg: (W.dmg * SCATTERGUN.share) / pellets, range });
    }
    return;
  }
  const knock = numOf(specOf(b), 'cannonKnock') * sim.engine.stat(b, 'knockback', 1); // a Cannoneer's heavy shell
  sim.shoot(b, tgt.x + sim.r.range(-spread, spread), tgt.y + sim.r.range(-spread, spread), { ...W, range, ...(knock > 0 && { knock }) });
}

/** The heal beam: on the ally it picked (and a Medic's chain), standing 2-4 tiles behind it, away from the threat. */
function beam(sim: Sim, b: Bot, m: Mind, move: boolean, dt: number) {
  const main = sim.bot(m.heal[0] ?? 0);
  if (!main) return;
  b.state = 'repair';
  b.target = main.id;
  if (move) {
    const p = behind(sim, main, AI.behind[0] * T * 1.25);
    const there = dist(p.x, p.y, main.x, main.y) <= REPAIR.beam ? p : main;
    sim.go(b, there.x, there.y, dt, there === main ? REPAIR.beam * 0.8 : 10);
  }
  const rate = REPAIR.rate * sim.engine.stat(b, 'repairRate', 1) * dt;
  const fx = b.fxT > 0.5;
  if (fx) b.fxT = 0;
  for (const id of m.heal) {
    const o = sim.bot(id);
    if (!o || dist(b.x, b.y, o.x, o.y) > REPAIR.beam * (o === main ? 1 : 1.6)) continue;
    sim.deed('repairer', 'heal', sim.engine.heal(o, rate, b));
    if (o === main) b.face = o.x >= b.x ? 1 : -1;
    if (fx) sim.events.push({ e: 'heal', from: b, to: o });
  }
}

// ---------------------------------------------------------------- reading it

/** `debugState().ai`: each robot's goal, what it does, its target and why. */
export function aiSummary(sim: Sim) {
  return sim.crew.filter((b) => b.mind).map((b) => {
    const m = b.mind!;
    return { name: b.name, goal: m.goal.kind, doing: m.doing, target: m.target ? `h${m.target}` : m.heal.length ? m.heal.map((id) => sim.bot(id)?.name).join('+') : null, why: m.why, ...(m.idle && sim.time < m.idle.until && { idle: m.idle.what }) };
  });
}

/** `ai <bot>`: its whole mind, and the scores that chose its target. */
export function explain(sim: Sim, b: Bot): string {
  const m = b.mind;
  if (!m) return `${b.name}: no mind yet`;
  const g = m.goal;
  const lines = [
    `${b.name} (${b.role}${b.spec ? ', ' + b.spec : ''}, crew ${b.crew}) oil ${Math.round(b.hp)}/${Math.round(b.maxHp)}`,
    `goal ${g.kind} at ${Math.round(g.x)},${Math.round(g.y)} leash ${(g.leash / T).toFixed(1)} tiles`,
    `doing ${m.doing}: ${m.why}${b.hidden ? ' (hidden)' : ''}`,
    `reaction ${m.delay.toFixed(2)} s, next think in ${Math.max(0, m.next - sim.time).toFixed(2)} s${m.back ? ', retreating' : ''}${m.idle && sim.time < m.idle.until ? `, idle ${m.idle.what}` : ''}`,
  ];
  if (m.scores.length) {
    lines.push('scores:');
    for (const s of m.scores.slice(0, 5)) {
      const h = sim.hornets.find((x) => x.id === s.id);
      lines.push(`  h${s.id} ${h ? FOES[h.kind].name + (h.elite ? ' (elite)' : '') : 'hive'}: ${s.score} = ${Object.entries(s.parts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    }
  }
  return lines.join('\n');
}

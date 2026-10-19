/**
 * The robots' minds (P25, systems.md "Robot AI"): pure scoring and choosing, no Sim, no Phaser. `botai.ts` reads the world
 * into these shapes each think and carries the choice out; every choice carries a `why` the view and `ai <bot>` show.
 *
 * - Target choice: `scoreTarget` (one foe's parts), `pickTarget` (the best, with stickiness, the crew's focus and spreading).
 * - When to think: `delayFor` (a robot's seeded reaction delay), `wake` (an event brings the next think forward).
 * - Retreat and rejoin: `retreating` (the hysteresis), `retreatTo` (its Repairer, else the Communicator, else the lift).
 * - Dodging: `covers` (does a telegraph's area hold a point), `sidesteps` (the two ways out, perpendicular to it).
 * - Healing: `healPick` (whom the beam takes, and the Medic's chain).
 * - Positioning and abilities: `centreOf` (a crew's middle), `isBehind` and `behindPoint` (a foe's back), `densest` (where an area
 *   ability hits most), `worthArea` (clouds and flares), `tauntWorth` (the Bulwark's pulse).
 * - Gatherers under fire: `underFire` (hit twice in 3 s). Orders: `Goal` and `inLeash` (P3 swaps the goal's maker, not this).
 *
 * Numbers are `AI` below: systems.md's where it gives them; the rest are guesses marked `?`.
 * Hazards: a telegraph of kind `patch` is ground to keep out of (the tier patches, props about to burst and the zones that
 * burn: botai's `telegraphs()` adds them as `{ kind: 'patch' }` discs), and every bot steps clear.
 */

export const AI = {
  /** Seconds between thinks, and the reaction delay's range (seeded per robot). */
  every: 0.25,
  delay: [0.15, 0.35] as [number, number],
  /** Target scores (systems.md). */
  marked: 3,
  commTarget: 2,
  attacker: 2,
  strong: 1,
  resisted: -1,
  inRange: 1,
  counter: -2,
  /** A Mender is killed first (systems.md: "kill the mender first"): a bonus (?). */
  mender: 2,
  /** Attack interval (s) over which a bot counts as a slow hitter for a Blinker (`TIER.blink.slow`). */
  slowHitter: 0.5,
  /** Elites by role (systems.md: Berserker, Sniper +2, Gatherer -2; the specs are read once the Sim fields them: P15). */
  elite: { gatherer: -2, berserker: 2, sniper: 2 } as Record<string, number>,
  /** Holding its current target (?), the crew's target (?), and per tile of distance (?: a nearer foe wins a tie). */
  sticky: 1.5,
  crewFocus: 1,
  perTile: -0.12,
  /** Ranged bots spread off a foe that this many others already shoot (systems.md), by this much (?). */
  spreadAt: 4,
  spread: -3,
  /** Attack interval (s) under which a bot counts as a fast hitter for Thorns (?). */
  fastHitter: 0.7,
  /** How long the Communicator's last hit counts as his target (s, ?). */
  commMemory: 6,
  /** Retreat under this share of oil, rejoin above that one (systems.md); stop this far from where it falls back to (px, ?). */
  retreatAt: 0.35,
  rejoinAt: 0.6,
  retreatNear: 44,
  /** A heal ability with a cooldown (P15) fires for an ally under this share (systems.md). The beam costs nothing and has no threshold: see `healPick`. */
  healAt: 0.6,
  /** The Repairer stands this far behind the ally it heals (tiles, systems.md). */
  behind: [2, 4] as [number, number],
  /** A gatherer hit this many times in this many seconds steps behind a guard (systems.md), and stays this long after the last hit (?). */
  coverHits: 2,
  coverWindow: 3,
  coverHold: 3,
  /** A sidestep: margin past the area's edge (px, ?), and how long it may take (s, ?). */
  dodgeMargin: 10,
  dodgeTime: 0.6,
  /** A tell that follows its target (a pounce's landing, a charge's line) is sidestepped once it stops following, this many s before (?): earlier, it would only follow. */
  dodgeLate: 0.05,
  /** Orders: how far round an order a bot still chooses targets and dodges (tiles, lead's call). */
  leashTiles: 6,
  /** Idle life: no foe within this many tiles (systems.md); seconds between idle things per bot (?); how near loot, a ruin or a mate must be (tiles, ?). */
  idleTiles: 12,
  idleEvery: [5, 10] as [number, number],
  lootTiles: 3,
  ruinTiles: 5,
  chatTiles: 3,
  /** Seconds between two pairs starting a chat anywhere on the land (?). */
  chatGap: 6,
  /** Area abilities fire on this many foes, or one elite (systems.md). */
  areaFoes: 3,
  /** A guard stands this far out from its crew toward the threat (tiles, ?). */
  lineOut: 1.6,
  /** Never closer than this to an awake hive that is not its target (px, ?). */
  hiveRing: 110,
  /** A Bodyguard fights within this many tiles of the Communicator (?). */
  guardTiles: 4,
  /** A taunt is cast when a foe within its reach is hitting an ally under this share of oil (systems.md: half). */
  tauntAt: 0.5,
  /** A Berserker leaves its crew for an elite this near it (tiles, ?). */
  rushTiles: 12,
  /** A bot that holds the crew's centre or circles a foe: how far behind its target it aims (px, ?), and the arc behind a foe, as a cosine, that counts as its back (?). */
  behindBy: 40,
  backCos: -0.5,
  /** A Stalker going round a foe turns this many radians a think at most (?). */
  circleStep: 0.7,
};

const T = 32;
export interface Spot { x: number; y: number }

// ---------------------------------------------------------------- target choice

/** A foe as a bot sees it, read by botai from the Sim. */
export interface Cand {
  id: number;
  /** Distance from the bot (px). */
  d: number;
  marked?: boolean;
  /** The Communicator hit it within `AI.commMemory`. */
  commTarget?: boolean;
  /** It is hitting the Communicator or a downed ally. */
  attacker?: boolean;
  /** Its weakness to the bot's damage type: >1 strong, <1 resisted (`typeMul`). */
  mul?: number;
  elite?: boolean;
  /** The soft counters on it (`ELITE_TRAITS[...].counter`). */
  counters?: ('thorns' | 'mirror' | 'mender' | 'blinker' | 'heavy' | 'grounded')[];
  /** Other bots already shooting it. */
  shotBy?: number;
  /** A hive, not a foe: chosen only when no foe is. */
  nest?: boolean;
}

/** The bot doing the choosing. */
export interface Self {
  role: string;
  spec?: string;
  range: number;
  /** Seconds between its shots. */
  rate: number;
  gun: boolean;
  ranged: boolean;
  /** Its current target id (0: none) and its crew's. */
  current: number;
  crewTarget: number;
}

export type Parts = Record<string, number>;
export interface Scored { id: number; score: number; parts: Parts }

/** One foe's score, part by part (the `ai` command shows the parts). */
export function scoreTarget(me: Self, c: Cand): Scored {
  const p: Parts = {};
  if (c.marked) p.marked = AI.marked;
  if (c.commTarget) p.yours = AI.commTarget;
  if (c.attacker) p.attacker = AI.attacker;
  if (c.mul !== undefined && c.mul > 1) p.strong = AI.strong;
  if (c.mul !== undefined && c.mul < 1) p.resisted = AI.resisted;
  if (c.d <= me.range) p.inRange = AI.inRange;
  if (c.elite) {
    const e = AI.elite[me.spec ?? ''] ?? AI.elite[me.role] ?? 0;
    if (e) p.elite = e;
  }
  const bad = (c.counters ?? []).some((k) => (k === 'thorns' && me.rate < AI.fastHitter) || (k === 'mirror' && me.gun) || (k === 'blinker' && me.rate > AI.slowHitter));
  if (bad) p.counter = AI.counter;
  if (c.counters?.includes('mender')) p.mender = AI.mender;
  if (me.current && c.id === me.current) p.sticky = AI.sticky;
  if (me.crewTarget && c.id === me.crewTarget && c.id !== me.current) p.crew = AI.crewFocus;
  if (me.ranged && (c.shotBy ?? 0) >= AI.spreadAt && c.id !== me.current) p.spread = AI.spread;
  p.near = +((c.d / T) * AI.perTile).toFixed(2);
  if (c.nest) p.hive = -5;
  const score = +Object.values(p).reduce((a, b) => a + b, 0).toFixed(2);
  return { id: c.id, score, parts: p };
}

/** Every candidate scored, best first; the first is the pick (none: an empty list). */
export function pickTarget(me: Self, cands: Cand[]): Scored[] {
  return cands.map((c) => scoreTarget(me, c)).sort((a, b) => b.score - a.score || a.id - b.id);
}

/** The reasons worth showing on screen for a pick (a glance ring): the ones that are not plain distance. */
export function reasonOf(s: Scored | undefined): string {
  if (!s) return '';
  const keys = ['marked', 'yours', 'attacker', 'strong', 'crew', 'elite'].filter((k) => (s.parts[k] ?? 0) > 0);
  return keys.join('+');
}

// ---------------------------------------------------------------- when to think

/** A robot's reaction delay: seeded by the land and the robot, so a replay reacts the same. */
export function delayFor(seed: number | string, id: number): number {
  let h = 2166136261;
  for (const ch of `${seed}:${id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const u = ((h >>> 0) % 10000) / 10000;
  return AI.delay[0] + (AI.delay[1] - AI.delay[0]) * u;
}

/** An event (hurt, ally down, order, a tell nearby, its target dead): the next think comes after its delay, if not sooner. */
export function wake(next: number, now: number, delay: number): number {
  return Math.min(next, now + delay);
}

// ---------------------------------------------------------------- positioning, abilities

/** The middle of some points (a crew's centre, a cluster's), or null for none. */
export function centreOf(pts: Spot[]): Spot | null {
  if (!pts.length) return null;
  return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
}

/** Is `from` on a foe's back: the foe faces `heading` (dx, dy) and `from` lies in the arc behind it (`AI.backCos`)? */
export function isBehind(foe: Spot, heading: Spot, from: Spot): boolean {
  const m = Math.hypot(heading.x, heading.y) * Math.hypot(from.x - foe.x, from.y - foe.y);
  return m > 0 && (heading.x * (from.x - foe.x) + heading.y * (from.y - foe.y)) / m < AI.backCos;
}

/** The point `by` px behind a foe that faces `heading` (the foe's own spot if it faces nowhere). */
export function behindPoint(foe: Spot, heading: Spot, by = AI.behindBy): Spot {
  const m = Math.hypot(heading.x, heading.y);
  return m > 0 ? { x: foe.x - (heading.x / m) * by, y: foe.y - (heading.y / m) * by } : { ...foe };
}

/**
 * Where an area ability would hit the most: the foe with the most foes (itself included) within `r` of it, nearest the bot
 * on a tie. `n` is how many it takes in; null on no foes.
 */
export function densest<F extends Spot>(foes: F[], r: number, from: Spot): { at: F; n: number } | null {
  let best: { at: F; n: number; d: number } | null = null;
  for (const f of foes) {
    const n = foes.filter((o) => Math.hypot(o.x - f.x, o.y - f.y) <= r).length;
    const d = Math.hypot(f.x - from.x, f.y - from.y);
    if (!best || n > best.n || (n === best.n && d < best.d)) best = { at: f, n, d };
  }
  return best && { at: best.at, n: best.n };
}

/** A foe as a taunt sees it: how far from the caster, and the share of oil of the ally it is hitting (null: none). */
export interface TauntFoe { d: number; allyFrac: number | null }
/** Taunt when a foe within `reach` is hitting an ally under `AI.tauntAt` of its oil. */
export function tauntWorth(foes: TauntFoe[], reach: number): boolean {
  return foes.some((f) => f.d <= reach && f.allyFrac !== null && f.allyFrac < AI.tauntAt);
}

// ---------------------------------------------------------------- retreat

/** Falling back below `retreatAt`, back in above `rejoinAt`; in between it keeps what it was doing. */
export function retreating(frac: number, was: boolean): boolean {
  return was ? frac <= AI.rejoinAt : frac < AI.retreatAt;
}

/** Where a hurt bot falls back to: its crew's Repairer, else the Communicator, else the lift. */
export function retreatTo(o: { repairer?: Spot | null; comm?: Spot | null; lift: Spot }): { to: Spot; why: 'repairer' | 'comm' | 'lift' } {
  if (o.repairer) return { to: o.repairer, why: 'repairer' };
  if (o.comm) return { to: o.comm, why: 'comm' };
  return { to: o.lift, why: 'lift' };
}

// ---------------------------------------------------------------- dodging

/**
 * A telegraph's area: a disc (a pounce's landing, a slam, a mortar, a dig) or a lane (a dash, a charge: from x, y along
 * dx, dy for len, w wide). A `patch` disc is ground to keep out of rather than a blow coming. `fixes` is the seconds
 * until the area stops following its target (0 or absent: fixed already): a step aside before then is followed.
 */
export type Tele =
  | { id: string; kind: 'disc' | 'patch'; x: number; y: number; r: number; from?: Spot; fixes?: number }
  | { id: string; kind: 'lane'; x: number; y: number; dx: number; dy: number; len: number; w: number; fixes?: number };

/** When to step aside from a tell: now, or in this many seconds (it still follows its target until then). */
export function dodgeIn(t: Tele): number {
  return Math.max(0, (t.fixes ?? 0) - AI.dodgeLate);
}

/** Does the area hold a body of radius `r` at x, y? */
export function covers(t: Tele, x: number, y: number, r = 0): boolean {
  if (t.kind !== 'lane') return Math.hypot(x - t.x, y - t.y) < t.r + r;
  const px = x - t.x, py = y - t.y;
  const along = px * t.dx + py * t.dy;
  const across = Math.abs(-px * t.dy + py * t.dx);
  return along > -r && along < t.len + r && across < t.w / 2 + r;
}

/**
 * The two ways out of an area, nearest first: perpendicular to a lane, or to the line from where the blow comes (a disc
 * with `from`), else straight out from its centre and the way round. Each clears the edge by `AI.dodgeMargin`.
 */
export function sidesteps(t: Tele, x: number, y: number, r = 0): Spot[] {
  const m = AI.dodgeMargin + r;
  if (t.kind === 'lane') {
    const px = x - t.x, py = y - t.y;
    const across = -px * t.dy + py * t.dx; // signed: left of the lane is positive
    const nx = -t.dy, ny = t.dx;
    const side = across >= 0 ? 1 : -1;
    const near = t.w / 2 - Math.abs(across) + m;
    const far = t.w / 2 + Math.abs(across) + m;
    return [
      { x: x + nx * side * near, y: y + ny * side * near },
      { x: x - nx * side * far, y: y - ny * side * far },
    ];
  }
  let ux = x - t.x, uy = y - t.y;
  let d = Math.hypot(ux, uy);
  if (t.from) {
    // Perpendicular to the blow's line: across it, the side the bot already leans to.
    const fx = t.x - t.from.x, fy = t.y - t.from.y, fd = Math.hypot(fx, fy) || 1;
    const nx = -fy / fd, ny = fx / fd;
    const across = ux * nx + uy * ny;
    const side = across >= 0 ? 1 : -1;
    const step = Math.sqrt(Math.max(0, (t.r + m) ** 2 - (ux * fx + uy * fy) ** 2 / fd ** 2)) - Math.abs(across);
    const out = Math.max(m, step);
    return [
      { x: x + nx * side * out, y: y + ny * side * out },
      { x: x - nx * side * (out + 2 * Math.abs(across)), y: y - ny * side * (out + 2 * Math.abs(across)) },
    ];
  }
  if (d < 1) {
    ux = 1;
    uy = 0;
    d = 1;
  }
  const out = t.r + m - d;
  return [
    { x: x + (ux / d) * out, y: y + (uy / d) * out },
    { x: t.x - (uy / d) * (t.r + m), y: t.y + (ux / d) * (t.r + m) },
  ];
}

// ---------------------------------------------------------------- healing

export interface Ally { id: number; frac: number; d: number }
/**
 * Whom the beam takes, in a fight or out of one (it costs nothing): the ally it heals now until it is full, else the most
 * hurt one in reach. A Medic's beam chains to `chains` more allies that are hurt.
 */
export function healPick(allies: Ally[], o: { current: number; chains: number; reach: number }): number[] {
  const inReach = allies.filter((a) => a.d <= o.reach && a.frac < 1);
  const main = inReach.find((a) => a.id === o.current) ?? inReach.sort((a, b) => a.frac - b.frac || a.id - b.id)[0];
  if (!main) return [];
  const chain = inReach
    .filter((a) => a.id !== main.id)
    .sort((a, b) => a.frac - b.frac || a.id - b.id)
    .slice(0, Math.max(0, o.chains))
    .map((a) => a.id);
  return [main.id, ...chain];
}

// ---------------------------------------------------------------- abilities, cover, orders

/** An area ability is worth firing: it would hit `areaFoes` or more, or an elite. Nothing on an empty screen. */
export function worthArea(foes: number, elite: boolean): boolean {
  return foes >= AI.areaFoes || (foes > 0 && elite);
}

/** A gatherer is under fire: hit `coverHits` times within `coverWindow` seconds. */
export function underFire(hits: number[], now: number): boolean {
  return hits.filter((t) => now - t <= AI.coverWindow).length >= AI.coverHits;
}

/**
 * What the bot is set to do (P3 replaces the maker in botai, `goalOf`; this shape stays): follow the Communicator, hold
 * its spot, go where it was sent (it still fights within `leash` of it), or evacuate (it fights nothing far, nothing else).
 */
export interface Goal { kind: 'follow' | 'hold' | 'go' | 'evac'; x: number; y: number; leash: number }

/** Is a point within the goal's leash? */
export function inLeash(g: Goal, x: number, y: number): boolean {
  return Math.hypot(x - g.x, y - g.y) <= g.leash;
}

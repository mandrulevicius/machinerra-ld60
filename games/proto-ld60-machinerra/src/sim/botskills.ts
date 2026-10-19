/**
 * What the robots' AI does with abilities (P25 "Ability use", P15's types): `botai.ts` calls `castSkills` on each think and
 * `carrySkill` / `stalk` to move, `skillStep` runs once a Sim step. The rules for when an ability is worth its cooldown are here
 * (the pure parts in `brain.ts`); the ability itself is an effect on the type's or spec's source (`specs.ts`) that waits for a
 * `cast` event (`{ when: 'cast', if: { is: 'via', via: <name> }, cd }`): the engine owns the cooldown, so a cast on cooldown
 * does nothing and nothing is wasted. A cast that fired shows as an `ai` beat (`what: 'cast'`).
 *
 * - Bulwark: `taunt` when a foe is hitting an ally under half oil. Marksman: `mark` the nearest foe it sees. Bodyguard: `intercept`.
 * - Boilermancer: `cloud` at the densest cluster (3 foes or an elite), `blessing` on an ally in a fight; the clouds are `Area`s here.
 * - Lamplighter: the lamp (the `lamp` stat; the twisted halos in it go out) and `flare` at the densest unlit cluster.
 * - Stalker: stealth (`Bot.hidden`), the blade (`stab`: the burst from behind, the Executioner's kill), its approach (`stalk`).
 * - Deeds (`hub/deeds.ts`) are counted where the thing happens; `foeFell` is the kills'.
 *
 * Add an ability: its effect in `specs.ts` (a `cast` effect for the type or spec), a branch in `castSkills` that says when it
 * is worth it, and (if it makes a thing on the ground) an `Area` kind and its step.
 */
import { ENEMY_PARTS } from './defs/loot';
import { BOILER, LAMPLIGHTER, STALKER, T } from './defs';
import { AI, behindPoint, centreOf, densest, inLeash, isBehind, tauntWorth, worthArea, type Goal, type Spot, type TauntFoe } from './brain';
import { damageHornet, damageNest, untouchable } from './combat';
import type { Action } from './effects';
import { newFog, type Fog } from './fog';
import { dist, wrapAngle } from './geom';
import { drop } from './loot';
import { addZone, lightSlick, slickAt } from './props';
import { behaviourOf, isBotType, type Behaviour, type BehaviourKey, type SpecId } from './specs';
import type { Mind } from './botai';
import type { Bot, Hornet, Nest, Sim } from './sim';

export const behaviourOfBot = (b: Bot): Behaviour => (isBotType(b.role) ? behaviourOf(b.role, b.spec as SpecId | undefined) : {});
export const numOf = (k: Behaviour, key: BehaviourKey) => (typeof k[key] === 'number' ? (k[key] as number) : 0);

/**
 * The Bulwark's front armour (`frontArmour` in specs.ts, systems.md "Guard"): a hit from a source on the side the robot faces (`Bot.face`,
 * the side its drawing shows) is cut by that share. Returns what is left of the hit (1: no cut, also for a hit with no source).
 */
export function frontCut(b: Bot, from: Spot | undefined): number {
  const k = numOf(behaviourOfBot(b), 'frontArmour');
  return k > 0 && from && (from.x - b.x) * b.face > 0 ? 1 - k : 1;
}
/** The foes awake and about, as the abilities see them. */
export const live = (sim: Sim) => sim.hornets.filter((h) => !h.dead && !h.under && !h.air && !h.calm && !h.sleep);

/** Punch cards' numbers (guesses): Pressure Choir's reach and shield, Wet Season's puddle (seconds, share of the cloud's reach), Moth Light's taunt, Dead Man's Lamp is `sim.ts`. */
export const CHOIR = { reach: 160, shield: 10 };
export const WET_SEASON = { ttl: 6, reach: 0.8 };
export const MOTH = { taunt: 2, gap: 0.5 };

// ---------------------------------------------------------------- state: the things abilities leave on the ground

/** A cloud of steam or a flare lying on the ground: it works on what stands in it until it burns out. */
export interface Area {
  id: number;
  kind: 'cloud' | 'flare';
  x: number;
  y: number;
  r: number;
  ttl: number;
  owner: Bot;
  /** Wet Season's puddle: a cloud that makes foes Wet and nothing else. */
  puddle?: boolean;
  /** What it does to a foe it touches (a cloud: every `BOILER.touch` s; a flare: once). */
  then?: Action | Action[];
  source?: string;
  /** Foe id to the time it may be touched again. */
  touched: Map<number, number>;
}
interface Skills { areas: Area[]; n: number; scouted?: Fog; /** Moth Light: foe id to the time it was last inside a lamp. */ moth: Map<number, number> }
const states = new WeakMap<Sim, Skills>();
const stateOf = (sim: Sim): Skills => states.get(sim) ?? (states.set(sim, { areas: [], n: 1, moth: new Map() }), states.get(sim)!);
/** The clouds and flares lying on the ground now. */
export const areasOf = (sim: Sim): readonly Area[] => stateOf(sim).areas;

/** The engine reported a `spawn` of a cloud or a flare: lay it down. */
export function addArea(sim: Sim, o: { what: string; x: number; y: number; radius?: number; ttl?: number; then?: Action | Action[]; source?: string; owner: unknown }) {
  const kind = o.what === 'flare' ? 'flare' : 'cloud';
  const owner = o.owner as Bot;
  const a: Area = { id: stateOf(sim).n++, kind, x: o.x, y: o.y, r: o.radius ?? (kind === 'flare' ? LAMPLIGHTER.flareR : 90), ttl: o.ttl ?? 5, owner, then: o.then, source: o.source, touched: new Map() };
  stateOf(sim).areas.push(a);
  sim.events.push({ e: 'ability', what: kind, x: a.x, y: a.y, r: a.r, ttl: a.ttl, by: owner });
  if (kind === 'flare') sim.fog.reveal(a.x / T - 0.5, a.y / T - 0.5, a.r / T + 2); // a flare clears the fog
}

/** The engine reported a `spawn` of a slick (the Firebrand's spit): a slick already lying there is lit (the next shot lights it), else a new one is laid. */
export function laySlick(sim: Sim, o: { x: number; y: number; radius?: number; ttl?: number; owner?: unknown }) {
  const wet = slickAt(sim, o.x, o.y);
  const by = (o.owner as Bot | undefined)?.stoked ? (o.owner as Bot) : undefined; // a stoked Firebrand's slick burns hotter (`stoke.ts`)
  const z = wet ?? addZone(sim, 'slick', o.x, o.y, o.radius ?? 40, o.ttl ?? 6);
  if (by && z) z.stoked = by;
  if (wet) lightSlick(wet);
}

/** The Oil-Slick Soles card (guesses): a slick this wide, this many seconds; one is laid wherever he walks and none lies yet. */
export const SOLES = { r: 40, ttl: 6 };

/**
 * Each step of the Communicator wearing Oil-Slick Soles (`Sim.tagStep`): while he walks, a slick under his feet where none lies, so a trail one radius apart.
 * It Slows foes alone (`foesOnly`) and burns only from fire; none is laid where fire would light it at once, so his own trail never sets his feet alight.
 */
export function soleTrail(sim: Sim, c: Bot) {
  if (!c.moving || c.dead || !sim.engine.source(c, 'card:oilSlickSoles') || slickAt(sim, c.x, c.y)) return;
  if (sim.props.zones.some((f) => f.kind === 'fire' && f.life > 0 && dist(f.x, f.y, c.x, c.y) < f.r + SOLES.r)) return;
  const z = addZone(sim, 'slick', c.x, c.y, SOLES.r, SOLES.ttl);
  if (z) z.foesOnly = true;
}

// ---------------------------------------------------------------- casting

/**
 * The AI says "cast `via`" (aimed at `target`, if it has one): did the engine let it fire? A fired cast shows as a beat at `at`
 * (default the caster) and is counted for its deed.
 */
export function cast(sim: Sim, b: Bot, via: string, target?: Bot | Hornet, at?: Spot): boolean {
  const fired = sim.engine.emit({ kind: 'cast', self: b, via, target });
  if (!fired) return false;
  sim.events.push({ e: 'ai', bot: b, what: 'cast', why: via, ...(at ?? { x: b.x, y: b.y }) });
  if (via === 'blessing') sim.deed('boilermancer', 'bless');
  if (via === 'flare') sim.deed('lamplighter', 'flare');
  if (via === 'mark') sim.deed('marksman', 'mark');
  // Pressure Choir (a punch card): a blessing also shields the crew round the boilermancer.
  if (via === 'blessing' && sim.engine.source(b, 'card:pressureChoir'))
    for (const o of sim.bots) if (!o.dead && !o.downed && dist(o.x, o.y, b.x, b.y) <= CHOIR.reach) sim.engine.addShield(o, CHOIR.shield);
  return true;
}

/** The robot a foe is hitting: its target, if it is one of ours (the Communicator too). */
const victim = (sim: Sim, h: Hornet) => {
  const t = h.target ? sim.bot(h.target) : undefined;
  return t && !t.dead ? t : undefined;
};

/** Is a point lit already: inside a flare, or near a robot's lamp (`Sim.lampStep`'s radius, or the crew's own glow, `LAMPLIGHTER.seen`)? */
function lit(sim: Sim, x: number, y: number) {
  if (stateOf(sim).areas.some((a) => a.kind === 'flare' && dist(a.x, a.y, x, y) <= a.r)) return true;
  return sim.bots.some((o) => !o.dead && dist(o.x, o.y, x, y) <= Math.max(LAMPLIGHTER.seen, sim.engine.stat(o, 'lamp', 0)));
}

/** One think's abilities for a robot, and the notes (`Mind.note`) that say what it is about. */
export function castSkills(sim: Sim, b: Bot, m: Mind, g: Goal) {
  m.note = undefined;
  const k = behaviourOfBot(b);
  const foes = live(sim);
  // The Bulwark: a taunt when an ally under half oil is being hit; the foes within its pulse turn on the Bulwark.
  const taunt = numOf(k, 'tauntR');
  if (taunt > 0) {
    const list: TauntFoe[] = foes.map((h) => {
      const t = victim(sim, h);
      return { d: dist(b.x, b.y, h.x, h.y), allyFrac: t && t !== b ? (sim.engine.isDown(t) ? 0 : t.hp / Math.max(1, t.maxHp)) : null };
    });
    if (tauntWorth(list, taunt)) cast(sim, b, 'taunt');
  }
  // The Marksman: marks the nearest foe it sees that is not marked.
  if (numOf(k, 'markEvery') > 0 && b.role === 'marksman') {
    const sight = sim.sight(b, 12 * T);
    let best: Hornet | null = null, bd = sight;
    for (const h of foes) {
      const d = dist(b.x, b.y, h.x, h.y);
      if (d < bd && !sim.engine.flag(h, 'marked')) (bd = d), (best = h);
    }
    if (best) cast(sim, b, 'mark', best, best);
  }
  // The Boilermancer: a cloud at the densest cluster (3 foes or an elite); a blessing on an ally in a fight.
  if (numOf(k, 'cloudEvery') > 0) {
    const cl = clusterFor(sim, b, g, foes, numOf(k, 'cloudR'), BOILER.reach);
    if (cl) {
      m.cluster = { x: cl.at.x, y: cl.at.y };
      m.note = `cloud on ${cl.n} foe${cl.n === 1 ? '' : 's'}${cl.elite ? ' (an elite)' : ''}`;
      if (worthArea(cl.n, cl.elite)) cast(sim, b, 'cloud', cl.at, cl.at);
    } else m.cluster = undefined;
  }
  if (numOf(k, 'blessingEvery') > 0) blessing(sim, b, k, foes);
  // The Firebrand: spits at the nearest foe within reach (a slick, or, onto a slick, the spark that lights it).
  if (numOf(k, 'spitEvery') > 0) {
    let best: Hornet | null = null, bd = numOf(k, 'spitReach') * T;
    for (const h of foes) {
      const d = dist(b.x, b.y, h.x, h.y);
      if (d < bd && inLeash(g, h.x, h.y)) (bd = d), (best = h);
    }
    if (best) {
      m.note = slickAt(sim, best.x, best.y) ? 'lighting a slick' : 'spitting a slick';
      cast(sim, b, 'spit', best, best);
    }
  }
  // The Lamplighter: a flare at the densest foes no light reaches.
  if (numOf(k, 'flareEvery') > 0) {
    const cl = clusterFor(sim, b, g, foes.filter((h) => !lit(sim, h.x, h.y)), LAMPLIGHTER.flareR, LAMPLIGHTER.reach);
    if (cl) {
      m.note = `flare at ${cl.n} unlit foe${cl.n === 1 ? '' : 's'}`;
      cast(sim, b, 'flare', cl.at, cl.at);
    }
  }
}

/** The densest cluster of `foes` (within `r` of one of them) that is within `reach` tiles of the bot and its goal's leash. */
function clusterFor(sim: Sim, b: Bot, g: Goal, foes: Hornet[], r: number, reach: number) {
  const near = foes.filter((h) => dist(b.x, b.y, h.x, h.y) <= reach * T && inLeash(g, h.x, h.y));
  const d = densest(near, r, b);
  if (!d) return null;
  const elite = near.some((h) => h.elite && dist(h.x, h.y, d.at.x, d.at.y) <= r);
  return { at: d.at, n: d.n, elite };
}

/** The blessing: with a foe about (within `AI.idleTiles`), Haste on the ally in the thick of it, or Steaming on the crew when two or more stand near. */
function blessing(sim: Sim, b: Bot, k: Behaviour, foes: Hornet[]) {
  if (!foes.some((h) => dist(b.x, b.y, h.x, h.y) <= AI.idleTiles * T)) return;
  const R = numOf(k, 'blessingR') || 200;
  const allies = sim.bots.filter((o) => !o.dead && !sim.engine.isDown(o) && dist(b.x, b.y, o.x, o.y) <= R);
  if (k.blessing === 'steaming') {
    if (allies.length >= 2) cast(sim, b, 'blessing');
    return;
  }
  // Haste: the ally nearest a foe (not the caster, not one already Hasted).
  let pick: Bot | null = null, pd = Infinity;
  for (const o of allies) {
    if (o === b || sim.engine.status(o, 'haste')) continue;
    const d = Math.min(...foes.map((h) => dist(o.x, o.y, h.x, h.y)));
    if (d < pd) (pd = d), (pick = o);
  }
  if (pick) cast(sim, b, 'blessing', pick, pick);
}

// ---------------------------------------------------------------- moving

/** The support types' movement, when a foe is about; true when it took the step (the Boilermancer keeps off and stays in reach; the Lamplighter holds its crew's centre). */
export function carrySkill(sim: Sim, b: Bot, m: Mind, g: Goal, dt: number): boolean {
  if (b.role === 'boilermancer') {
    const near = live(sim).filter((h) => dist(b.x, b.y, h.x, h.y) <= 10 * T && inLeash(g, h.x, h.y)).sort((p, q) => dist(b.x, b.y, p.x, p.y) - dist(b.x, b.y, q.x, q.y))[0];
    if (!near) return false;
    const d = dist(b.x, b.y, near.x, near.y) || 1;
    b.state = 'fight';
    b.face = near.x >= b.x ? 1 : -1;
    if (d < BOILER.keep) sim.go(b, b.x - ((near.x - b.x) / d) * T * 2, b.y - ((near.y - b.y) / d) * T * 2, dt, 0);
    else if (m.cluster && dist(b.x, b.y, m.cluster.x, m.cluster.y) > BOILER.reach * T * 0.9 && inLeash(g, b.x + ((near.x - b.x) / d) * T, b.y + ((near.y - b.y) / d) * T)) sim.go(b, m.cluster.x, m.cluster.y, dt, BOILER.reach * T * 0.8);
    return true;
  }
  if (b.role === 'lamplighter') {
    const mates = sim.crew.filter((o) => o !== b && !o.dead && (g.kind === 'follow' ? sim.follows(o) : o.crew === b.crew && !o.own === !b.own));
    const c = centreOf([...mates.map((o) => ({ x: o.x, y: o.y })), ...(g.kind === 'follow' && !sim.controller.dead ? [{ x: sim.controller.x, y: sim.controller.y }] : [])]);
    if (!c) return false;
    m.note = `holding its crew's centre (${mates.length + 1} with it)`;
    if (m.doing === 'follow') m.why = m.note;
    b.state = 'move';
    sim.go(b, c.x, c.y, dt, LAMPLIGHTER.centre);
    return true;
  }
  return false;
}

/** Where a foe faces: at its target, else the way it moves. */
export function heading(sim: Sim, h: Hornet): Spot {
  const t = h.target ? sim.bot(h.target) : undefined;
  return t ? { x: t.x - h.x, y: t.y - h.y } : { x: h.vx, y: h.vy };
}

/**
 * The Stalker's turn at a target: round to its back (the point behind it, or straight in once it stands there), inside its goal's
 * leash, and the blade when it is in reach. A hive has no back; it is struck where it stands.
 */
export function stalk(sim: Sim, b: Bot, tgt: Hornet | Nest, g: Goal, dt: number) {
  b.state = 'fight';
  b.target = tgt.id;
  const reach = STALKER.reach + ('r' in tgt ? tgt.r : 24);
  const d = dist(b.x, b.y, tgt.x, tgt.y);
  let go: Spot | null = d > reach ? tgt : null; // a hive has no back, and a foe it is already behind is closed on straight
  const hd = 'kind' in tgt ? heading(sim, tgt) : { x: 0, y: 0 };
  if ('kind' in tgt && (hd.x || hd.y) && !isBehind(tgt, hd, b)) {
    // Round it: along a circle round the foe, a turn at a time, to the point behind it (it strikes on the way when it is in reach).
    const me = Math.atan2(b.y - tgt.y, b.x - tgt.x), back = Math.atan2(-hd.y, -hd.x);
    const turn = Math.max(-AI.circleStep, Math.min(AI.circleStep, wrapAngle(back - me)));
    const R = d > reach * 2 ? d * 0.85 : Math.max(d, reach * 0.9);
    go = { x: tgt.x + Math.cos(me + turn) * R, y: tgt.y + Math.sin(me + turn) * R };
    if (isBehind(tgt, hd, go)) go = behindPoint(tgt, hd, reach * 0.8);
  }
  if (go && inLeash(g, go.x, go.y)) sim.go(b, go.x, go.y, dt, 4);
  if (dist(b.x, b.y, tgt.x, tgt.y) <= reach + 4) stab(sim, b, tgt);
}

/** A blade stroke (on cooldown): the table's burst from behind, the Executioner's finish; it shows itself. */
export function stab(sim: Sim, b: Bot, h: Hornet | Nest) {
  if (b.cd > 0) return;
  const k = behaviourOfBot(b);
  const m = b.mind;
  b.cd = STALKER.rate / Math.max(0.3, sim.engine.stat(b, 'attackRate', 1));
  b.face = h.x >= b.x ? 1 : -1;
  let dmg = STALKER.dmg, back = false;
  if (!('kind' in h)) {
    damageNest(sim, h, dmg, b, 'pierce', { via: 'melee' });
  } else {
    // From behind: +backstab (Minos: from behind is enough, no crowd rule). The Executioner finishes a foe under its share outright (a boss takes +executeBoss instead).
    back = numOf(k, 'backstab') > 0 && isBehind(h, heading(sim, h), b);
    if (back) dmg *= 1 + numOf(k, 'backstab');
    const exec = numOf(k, 'executeBelow');
    if (exec > 0 && h.hp / Math.max(1, h.maxHp) < exec) dmg = h.boss ? dmg * (1 + numOf(k, 'executeBoss')) : h.hp + 1;
    if (back) h.backBy = b.id;
    damageHornet(sim, h, dmg, b, 'pierce', { via: 'melee' });
    if (back && !h.dead && sim.engine.source(b, 'card:backstabGears')) sim.engine.apply(h, 'staggered', { by: b }); // Back-stab Gears (a punch card)
  }
  // It shows itself for the stroke (the Executioner hides again at once on a kill).
  if (m) m.fought = (k.restealthOnKill || sim.engine.source(b, 'card:secondShadow')) && h.hp <= 0 ? -Infinity : sim.time; // Second Shadow (a punch card) is the Executioner's hiding for any stalker
  sim.events.push({ e: 'ability', what: 'stab', x: h.x, y: h.y, by: b, back });
}

// ---------------------------------------------------------------- once a step

/** Clouds, flares, lamps, auras put out, stealth: the things the abilities keep going each Sim step. */
export function skillStep(sim: Sim, dt: number) {
  const S = stateOf(sim);
  const now = sim.time;
  for (const a of S.areas) {
    a.ttl -= dt;
    if (a.kind === 'cloud') {
      for (const h of sim.hornets) {
        if (h.dead || h.under || h.air || dist(h.x, h.y, a.x, a.y) > a.r + h.r || (a.touched.get(h.id) ?? 0) > now) continue;
        if (untouchable(sim, h, a.owner, 'steam')) continue;
        if (!a.touched.has(h.id)) sim.deed('boilermancer', 'scald'); // one scald per foe per cloud
        a.touched.set(h.id, now + BOILER.touch);
        if (a.then) sim.engine.touch(a.owner, h, a.then, { source: a.source, via: 'cloud' });
        sim.drainFx();
      }
    } else {
      // A flare: the robots in it are Lit (Dread ends), the foes it lands on get what the spec gives them once.
      for (const b of sim.bots) if (!b.dead && dist(b.x, b.y, a.x, a.y) <= a.r) sim.mark(b, 'lit');
      if (a.then)
        for (const h of sim.hornets) {
          if (h.dead || h.under || h.air || a.touched.has(h.id) || dist(h.x, h.y, a.x, a.y) > a.r + h.r) continue;
          a.touched.set(h.id, Infinity);
          sim.engine.touch(a.owner, h, a.then, { source: a.source, via: 'flare' });
          sim.drainFx();
        }
    }
  }
  // Wet Season (a punch card): a cloud that fades leaves a puddle that makes the foes in it Wet.
  for (const a of S.areas.filter((x) => x.ttl <= 0 && x.kind === 'cloud' && !x.puddle && !!sim.engine.source(x.owner, 'card:wetSeason')))
    S.areas.push({ id: S.n++, kind: 'cloud', puddle: true, x: a.x, y: a.y, r: a.r * WET_SEASON.reach, ttl: WET_SEASON.ttl, owner: a.owner, then: { do: 'status', id: 'wet' }, source: a.source, touched: new Map() });
  S.areas = S.areas.filter((a) => a.ttl > 0);
  // The lamp puts the twisted halos out; the Condenser drinks them.
  for (const b of sim.crew) {
    if (b.dead) continue;
    const k = behaviourOfBot(b);
    const lamp = b.role === 'lamplighter' ? sim.engine.stat(b, 'lamp', 0) : 0;
    const r = Math.max(lamp, numOf(k, 'stripsAuras'));
    if (r > 0) for (const h of sim.hornets) if (!h.dead && h.twisted && dist(h.x, h.y, b.x, b.y) <= r) h.dimT = Math.max(h.dimT ?? 0, now + 0.3);
    if (b.role === 'stalker') stealthStep(sim, b, k);
  }
  // Moth Light (a punch card): a twisted foe that steps into a lamplighter's lamp is Taunted to it.
  for (const b of sim.crew) {
    if (b.dead || b.role !== 'lamplighter' || !sim.engine.source(b, 'card:mothLight')) continue;
    const r = sim.engine.stat(b, 'lamp', 0);
    for (const h of sim.hornets) {
      if (h.dead || !h.twisted || dist(h.x, h.y, b.x, b.y) > r) continue;
      if (now - (S.moth.get(h.id) ?? -Infinity) > MOTH.gap) sim.engine.apply(h, 'taunted', { by: b, duration: MOTH.taunt });
      S.moth.set(h.id, now);
    }
  }
  // Lantern Faith (a punch card): the twisted in his own light are Marked.
  const lit = sim.engine.stat(sim.controller, 'lamp', 0);
  if (lit > 0 && sim.engine.source(sim.controller, 'card:lanternFaith')) for (const h of sim.hornets) if (!h.dead && h.twisted && dist(h.x, h.y, sim.controller.x, sim.controller.y) <= lit) sim.mark(h, 'marked', 0.6);
  // His own lamp (Lantern Eyes) puts them out too.
  const lamp = sim.engine.stat(sim.controller, 'lamp', 0);
  if (lamp > 0 && !sim.controller.dead) for (const h of sim.hornets) if (!h.dead && h.twisted && dist(h.x, h.y, sim.controller.x, sim.controller.y) <= lamp) h.dimT = Math.max(h.dimT ?? 0, now + 0.3);
}

/** The Stalker hides after `restealth` s out of a fight (faster in a Shade's shadow), and shows when it strikes or is struck. */
function stealthStep(sim: Sim, b: Bot, k: Behaviour) {
  const was = !!b.hidden;
  if (!k.stealth || k.neverHides || b.downed) b.hidden = false;
  else {
    const shade = sim.crew.some((o) => o !== b && !o.dead && o.role === 'lamplighter' && dist(o.x, o.y, b.x, b.y) <= 120 && numOf(behaviourOfBot(o), 'restealthNear') > 0);
    const need = shade ? numOf(behaviourOfBot(sim.crew.find((o) => o.role === 'lamplighter' && numOf(behaviourOfBot(o), 'restealthNear') > 0)!), 'restealthNear') : numOf(k, 'restealth');
    b.hidden = sim.time - (b.mind?.fought ?? -Infinity) >= need;
  }
  if (b.hidden !== was) sim.events.push({ e: 'ability', what: b.hidden ? 'hide' : 'show', x: b.x, y: b.y, by: b });
}

// ---------------------------------------------------------------- hooks the Sim calls

/** A foe fell (`foes.ts` `hornetDown`): the deeds of the kills, and the Ghost's extra drop. */
export function foeFell(sim: Sim, h: Hornet, by: Bot | null) {
  if (!by) return;
  if (by.role === 'marksman' && h.elite) sim.deed('marksman', 'eliteKill');
  if (by.role === 'stalker') {
    if (h.backBy === by.id) sim.deed('stalker', 'backKill');
    if (h.elite && numOf(behaviourOfBot(by), 'extraDrop') > 0) {
      const own = ENEMY_PARTS[h.kind];
      drop(sim, h.x + sim.r.range(-12, 12), h.y + sim.r.range(-8, 8), 'part', sim.r.pick([own.part, ...own.elite]));
    }
  }
  // A twisted foe that fell in a Lamplighter's light.
  if (h.twisted && sim.crew.some((o) => o.role === 'lamplighter' && !o.dead && dist(o.x, o.y, h.x, h.y) <= sim.engine.stat(o, 'lamp', 0))) sim.deed('lamplighter', 'lampKill');
}

/** A crew robot hit a Marked foe: a Spotter's crew is Keen for a while. */
export function markedHit(sim: Sim, h: Hornet, by: Bot | null) {
  if (!by || by.role === 'controller' || !sim.engine.flag(h, 'marked')) return;
  const keen = sim.crew.reduce((n, o) => Math.max(n, !o.dead ? numOf(behaviourOfBot(o), 'keenAllies') : 0), 0);
  if (keen > 0) sim.engine.apply(by, 'keen', { duration: keen });
}

/** The Bodyguard takes the first blow meant for the Communicator every `interceptEvery` s: the robot to hit instead, or null. */
export function intercept(sim: Sim, c: Bot): Bot | null {
  for (const o of sim.crew) {
    if (o.dead || o.downed || !numOf(behaviourOfBot(o), 'interceptEvery') || dist(o.x, o.y, c.x, c.y) > 4 * T) continue;
    if (cast(sim, o, 'intercept')) return o;
  }
  return null;
}

/** How much farther a robot sees than its role does (the Spotter's fog, the Ghost scouting on an order). */
export function fogMul(sim: Sim, b: Bot): number {
  const k = behaviourOfBot(b);
  const onOrder = !!(b.own && b.own !== 'follow') || (b.crew !== 0 && !!sim.orders[b.crew]);
  return (numOf(k, 'fogMul') || 1) * (k.scouts && onOrder ? 1.5 /* ? */ : 1);
}

/** A scouting Stalker reveals the fog round it (`fogplay.ts`): the Ghost's own share of the land is its deed (`scoutPct`, the best of the mission). */
export function scoutSees(sim: Sim, b: Bot, x: number, y: number, tiles: number) {
  if (b.role !== 'stalker' || !behaviourOfBot(b).scouts) return;
  const S = stateOf(sim);
  S.scouted ??= newFog(sim.map);
  S.scouted.reveal(x, y, tiles);
  const key = 'deed.stalker.scoutPct';
  sim.stats[key] = Math.max(sim.stats[key] ?? 0, Math.round(S.scouted.fraction * 100));
}

/** `debugState`: the abilities' things lying on the ground. */
export function skillSummary(sim: Sim) {
  return stateOf(sim).areas.map((a) => `${a.kind} (${Math.round(a.x)},${Math.round(a.y)}) r${Math.round(a.r)} ${a.ttl.toFixed(1)}s`);
}



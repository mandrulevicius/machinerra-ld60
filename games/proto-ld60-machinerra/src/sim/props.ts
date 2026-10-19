/**
 * Props (P39, plain TS): everything the land is furnished with that breaks, in one system. Walls and debris round a ruin,
 * crates, cars and the effect props (`PROPS`, defs/props.ts) all have a kind, a material, a health that starts worn, and
 * flags: `solid` blocks walking, shots and sight (its tile is in `PropWorld.solid`, which `Sim.blocked` and the A* read, so
 * breaking one frees the way), `kickable` slides when kicked (`crash.ts`). A prop looks whole, cracked or rubble by its health;
 * rubble stays on the ground and blocks nothing. Rock and mesas are terrain: they never break.
 *
 * What hurts a prop: `hitProp` (shots, swings and kicks, crashes, blasts, a burst's blow to its neighbours). A prop that
 * goes off has a tell first (`fx.tell`: the bots keep off, `propTeles`), then its burst; a burst may break other props, so
 * barrels go off in a row, capped at `CHAIN_MAX` links. Zones (fire, a puddle, steam, a shock pulse, an alarm) are the
 * ground effects they leave: they touch every machine and robot inside. Scrap drops from a smashed prop, never from a wall.
 *
 * A ruin is its pieces: `ruinHealth` (what is left of them), `ruinPay` (its size and health scale what a search pays) and
 * `ruinBroken` (every piece down: a dead ruin gives what is left of its find, a live one keeps its decode).
 * The generator's part (ruin pieces and a light set in the open, never walling anything off) is `propgen.ts`.
 * Add a prop: the header of defs/props.ts. Dev: `prop` (src/dev/world.ts). `debugState().props`.
 */
import type { Rng } from '../../../../harness/kit/rng';
import { flowField } from './dungeon';
import { CACHES, CAN, CHAIN_MAX, CRACKED, MATERIALS, PROPS, RUIN_FINDS, RUIN_PIECES, T, ZONES, propScrap, type Material, type PropKind, type ZoneKind } from './defs';
import { dist } from './geom';
import type { Spot } from './mapgen';
import type { PropSpec } from './propgen';
import { salvage } from './use';
import type { Bot, Ruin } from './types';
import type { Sim } from './sim';
import type { Tele } from './brain';

export type PropState = 'whole' | 'cracked' | 'rubble';

/** Who sent a body flying (`crash.ts`): the kicker's id, whether it was a kick, who it has struck, and until when it counts as flying. */
export interface Fling {
  by: number;
  kick: boolean;
  hit: number[];
  until: number;
  /** The Open Door: until this time the body bursts on through a wall it broke: no steering, `PERK_FX.openDoor.friction`, the flight not cut short by slowness. */
  door?: number;
}

export interface Prop {
  id: number;
  kind: PropKind;
  material: Material;
  /** Centre, px (tile centre where it was placed); `tx`, `ty` its tile. */
  x: number;
  y: number;
  tx: number;
  ty: number;
  hp: number;
  maxHp: number;
  solid: boolean;
  r: number;
  broken: boolean;
  /** Seconds to its burst: it has gone down and is about to go off. */
  primed?: number;
  /** How far down a chain of bursts it was broken (0: not by a burst), and who broke it (a burst credits them). */
  link: number;
  by?: number;
  /** Hurt at least once (the car's alarm goes at the first). */
  hit: boolean;
  /** The ruin it is a piece of. */
  ruin?: number;
  /** Sliding (a kicked barrel): its speed, who kicked it, and a rocket's seconds left (`PropFx.rocket`). */
  vx: number;
  vy: number;
  fling?: Fling;
  rocket?: number;
  /** Carried (P36, `placeparts.ts`): the carrier's id. */
  carriedBy?: number;
  /** Taken out of the land by its place (a shell loaded into the gun): not drawn, not rubble. */
  gone?: boolean;
  /** A buried cache the Sandstorm uncovered (P54): its signal's id; it pays `CACHES.scrap` more when it breaks and its signal goes. */
  cache?: string;
}

/** A patch of ground that works on whatever stands in it (`ZONES`). `owner`: the prop it came from. */
export interface Zone {
  id: number;
  kind: ZoneKind;
  x: number;
  y: number;
  r: number;
  life: number;
  /** Seconds to its next application or pulse. */
  next: number;
  owner?: number;
  /** A slick that Slows foes only (the Oil-Slick Soles card's: his own trail does not slow his crew). Once fire lights it, it is a fire like any. */
  foesOnly?: boolean;
  /** Laid or lit by a stoked Firebrand (`stoke.ts`): its fire burns as that robot's own, +30% on its damage stat, and is drawn hotter. */
  stoked?: Bot;
  /** An alarm's distances from it, for the foes it calls. */
  field?: Float32Array;
}

/** An energy drink lying where a vending machine dropped it. */
export interface Can {
  id: number;
  x: number;
  y: number;
  t: number;
}

export interface PropWorld {
  list: Prop[];
  zones: Zone[];
  cans: Can[];
  /** 1 where a solid prop stands (tile index); `at` finds it. */
  solid: Uint8Array;
  at: Map<number, Prop>;
  w: number;
  r: Rng;
  n: number;
}

export const propWorld = (w: number, h: number, r: Rng): PropWorld => ({ list: [], zones: [], cans: [], solid: new Uint8Array(w * h), at: new Map(), w, r, n: 1 });

export type PropEvent =
  /** A prop was hit, cracked (it just passed half its health), is about to go off (`tell`) or is down (`break`). */
  | { e: 'prop'; what: 'hit' | 'crack' | 'tell' | 'break' | 'kick' | 'carry' | 'drop'; p: Prop; dmg?: number }
  /** A prop went off. */
  | { e: 'burst'; x: number; y: number; r: number; kind: PropKind; fire: boolean }
  /** A zone began, pulsed or wore off. */
  | { e: 'zone'; what: 'new' | 'pulse' | 'end'; z: Zone }
  /** A body crashed (`crash.ts`): into a `foe`, a `prop`, or `rock`; `dmg` the crash damage. */
  | { e: 'crash'; x: number; y: number; dmg: number; what: 'foe' | 'prop' | 'rock' }
  /** Every piece of a ruin is down. */
  | { e: 'ruinbreak'; ruin: Ruin }
  /** An energy drink dropped or was taken. */
  | { e: 'can'; what: 'drop' | 'take'; x: number; y: number };

export const propState = (p: Prop): PropState => (p.broken ? 'rubble' : p.hp <= p.maxHp * CRACKED ? 'cracked' : 'whole');

// ---------------------------------------------------------------- making

/** A prop in the land at tile (`x`, `y`) (or at pixel `at` when given: a dev command). */
export function addProp(sim: Sim, s: PropSpec, ruin?: number, at?: Spot): Prop {
  const W = sim.props, def = PROPS[s.kind];
  const material = s.material ?? def.material;
  const maxHp = Math.max(1, Math.round(MATERIALS[material].hp * def.size));
  const px = at ? at.x : (s.x + 0.5) * T, py = at ? at.y : (s.y + 0.5) * T;
  const tx = Math.floor(px / T), ty = Math.floor(py / T);
  const p: Prop = { id: sim.nextId++, kind: s.kind, material, x: px, y: py, tx, ty, hp: Math.max(1, Math.round(maxHp * s.wear)), maxHp, solid: !!def.solid, r: def.r, broken: false, link: 0, hit: false, vx: 0, vy: 0, ...(ruin !== undefined && { ruin }) };
  W.list.push(p);
  if (p.solid) occupy(sim, p);
  return p;
}

function occupy(sim: Sim, p: Prop) {
  const i = p.ty * sim.W + p.tx;
  sim.props.solid[i] = 1;
  sim.props.at.set(i, p);
}

function vacate(sim: Sim, p: Prop) {
  if (!p.solid) return;
  const i = p.ty * sim.W + p.tx;
  if (sim.props.at.get(i) === p) {
    sim.props.solid[i] = 0;
    sim.props.at.delete(i);
  }
  p.solid = false;
}

/** The solid prop standing on the tile at (x, y), if any. */
export function solidAt(sim: Sim, x: number, y: number): Prop | null {
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  if (tx < 0 || ty < 0 || tx >= sim.W || ty >= sim.H) return null;
  return sim.props.at.get(ty * sim.W + tx) ?? null;
}

/** A prop a shot can hit at (x, y): the solid one on its tile, or a kickable one within its radius. */
export function shotAt(sim: Sim, x: number, y: number): Prop | null {
  const s = solidAt(sim, x, y);
  if (s) return s;
  for (const p of sim.props.list) if (!p.broken && !p.solid && PROPS[p.kind].kickable && dist(x, y, p.x, p.y) < p.r + 5) return p;
  return null;
}

// ---------------------------------------------------------------- hurting and breaking

/** A prop takes damage. True when that broke it (or set it ticking). `link`: how far down a chain of bursts this blow is. */
export function hitProp(sim: Sim, p: Prop, dmg: number, o: { by?: Bot | null; via?: string; link?: number } = {}): boolean {
  if (p.broken || p.primed !== undefined || dmg <= 0) return false;
  const was = propState(p);
  p.hp = Math.max(0, p.hp - dmg);
  sim.events.push({ e: 'prop', what: 'hit', p, dmg });
  const first = PROPS[p.kind].fx?.hit;
  if (first && !p.hit) {
    p.hit = true;
    addZone(sim, first.zone.kind, p.x, p.y, first.zone.r, first.zone.life, p.id);
  }
  p.hit = true;
  if (p.hp <= 0) {
    breakProp(sim, p, o.by ?? null, o.link ?? 0);
    return true;
  }
  if (propState(p) !== was) sim.events.push({ e: 'prop', what: 'crack', p });
  return false;
}

/** Down: it frees its tile, then either goes off after its tell or is rubble at once. */
export function breakProp(sim: Sim, p: Prop, by: Bot | null, link = 0) {
  if (p.broken || p.primed !== undefined) return;
  p.hp = 0;
  p.link = link;
  p.by = by?.id;
  vacate(sim, p);
  const fx = PROPS[p.kind].fx;
  if (fx?.tell && fx.burst) {
    p.primed = fx.tell;
    if (fx.vent) addZone(sim, fx.vent.kind, p.x, p.y, fx.vent.r, fx.tell, p.id);
    sim.events.push({ e: 'prop', what: 'tell', p });
    return;
  }
  settle(sim, p, by);
}

/** The prop is rubble: its burst or zone, its drops, the ruin it belonged to. */
function settle(sim: Sim, p: Prop, by: Bot | null) {
  p.broken = true;
  p.primed = undefined;
  p.hp = 0;
  p.vx = p.vy = 0;
  p.fling = undefined;
  const def = PROPS[p.kind], fx = def.fx;
  sim.stats.propsBroken++;
  sim.events.push({ e: 'prop', what: 'break', p });
  sim.noise(p.x, p.y);
  if (fx?.burst) burst(sim, p, fx.burst, by);
  if (fx?.zone) addZone(sim, fx.zone.kind, p.x, p.y, fx.zone.r, fx.zone.life, p.id);
  if (fx?.cans) for (let i = 0; i < fx.cans; i++) dropCan(sim, p.x + (i - (fx.cans - 1) / 2) * 20, p.y + 14);
  const scrap = def.bare ? 0 : propScrap(p.material, def.size);
  if (scrap > 0) sim.drop(p.x, p.y, 'scrap', null, scrap);
  if (p.cache) {
    for (let i = 0; i < CACHES.scrap; i++) sim.drop(p.x + sim.r.range(-24, 24), p.y + sim.r.range(-16, 16), 'scrap');
    sim.signals = sim.signals.filter((s) => s.id !== p.cache);
  }
  if (by) sim.engine.emit({ kind: 'break', self: by });
  if (p.ruin !== undefined) {
    const ruin = sim.ruins.find((r) => r.id === p.ruin);
    if (ruin && sim.props.list.every((q) => q.ruin !== p.ruin || q.broken)) ruinBroken(sim, ruin);
  }
  sim.drainFx();
}

/** A prop goes off: its blast hurts every machine and robot in reach, its neighbours break in a chain (capped), and it may leave a zone. */
function burst(sim: Sim, p: Prop, b: NonNullable<NonNullable<(typeof PROPS)[PropKind]['fx']>['burst']>, by: Bot | null) {
  const link = p.link + 1;
  sim.events.push({ e: 'burst', x: p.x, y: p.y, r: b.r, kind: p.kind, fire: b.type === 'fire' });
  for (const h of [...sim.hornets]) {
    const d = dist(h.x, h.y, p.x, p.y);
    if (h.dead || h.under || h.air || d > b.r + h.r) continue;
    sim.damageHornet(h, b.dmg, by, b.type, { via: 'blast' });
    if (b.knock && !h.dead && !sim.engine.flag(h, 'steady')) {
      const k = (h.boss ? 0.12 : 1) * b.knock / (d || 1);
      h.vx += (h.x - p.x) * k;
      h.vy += (h.y - p.y) * k;
    }
  }
  for (const bot of sim.bots) {
    if (bot.dead || dist(bot.x, bot.y, p.x, p.y) > b.r + 10) continue;
    sim.hurt(bot, b.dmg, false, { type: b.type, via: 'blast' });
  }
  if (link <= CHAIN_MAX)
    for (const q of [...sim.props.list]) {
      if (q === p || q.broken || q.primed !== undefined || dist(q.x, q.y, p.x, p.y) > b.r + q.r) continue;
      hitProp(sim, q, b.props ?? b.dmg, { by, via: 'blast', link });
    }
  if (b.zone) addZone(sim, b.zone.kind, p.x, p.y, b.zone.r, b.zone.life, p.id);
  sim.drainFx();
}

/** A blast from outside (a D-city shell, a place's) reaches every prop in `r` of it. */
export function blastProps(sim: Sim, x: number, y: number, r: number, dmg: number) {
  for (const p of [...sim.props.list]) if (!p.broken && p.primed === undefined && dist(p.x, p.y, x, y) <= r + p.r) hitProp(sim, p, dmg, { via: 'blast' });
}

// ---------------------------------------------------------------- ruins

/** What is left of a ruin's pieces, 0..1 (a ruin with none is whole). */
export function ruinHealth(sim: Sim, ruin: Ruin): number {
  let hp = 0, max = 0;
  for (const p of sim.props.list) if (p.ruin === ruin.id) {
    hp += p.hp;
    max += p.maxHp;
  }
  return max ? hp / max : 1;
}

/** What a ruin's find pays, as a multiplier: its size, and its health (a flattened ruin still pays `floor` of it). A ruin with no pieces pays as it always did. */
export function ruinPay(sim: Sim, ruin: Ruin): number {
  if (!ruin.size) return 1;
  return RUIN_PIECES.size[ruin.size].pay * (RUIN_PIECES.floor + (1 - RUIN_PIECES.floor) * ruinHealth(sim, ruin));
}

/** Dev: bring every piece of a ruin down. */
export function flatten(sim: Sim, ruin: Ruin) {
  for (const p of [...sim.props.list]) if (p.ruin === ruin.id && !p.broken) hitProp(sim, p, p.hp + 1);
}

/** Every piece is down. A dead ruin gives up what is left of its find at once; a live one keeps its decode (its walls fall, its heart stands). */
function ruinBroken(sim: Sim, ruin: Ruin) {
  if (ruin.broken) return;
  ruin.broken = true;
  sim.stats.ruinsBroken++;
  sim.events.push({ e: 'ruinbreak', ruin });
  if (ruin.live || ruin.searched || RUIN_FINDS[ruin.kind].pry) return; // a dock's walls fall, its contacts stay to be pried (P58 H)
  ruin.searched = true;
  if (sim.action?.ruin === ruin) sim.action = null;
  salvage(sim, ruin);
}

// ---------------------------------------------------------------- zones, cans

export function addZone(sim: Sim, kind: ZoneKind, x: number, y: number, r: number, life: number, owner?: number) {
  const W = sim.props;
  // Water puts a fire out, and a fire does not start in water.
  if (kind === 'puddle') {
    for (const z of W.zones) if (z.kind === 'fire' && dist(z.x, z.y, x, y) < r) z.life = 0;
  }
  if (kind === 'fire' && W.zones.some((z) => z.kind === 'puddle' && z.life > 0 && dist(z.x, z.y, x, y) < z.r)) return null;
  const z: Zone = { id: W.n++, kind, x, y, r, life, next: ZONES[kind].every, ...(owner !== undefined && { owner }) };
  if (kind === 'alarm') z.field = flowField(sim.map, Math.floor(x / T), Math.floor(y / T));
  W.zones.push(z);
  sim.events.push({ e: 'zone', what: 'new', z });
  return z;
}

function dropCan(sim: Sim, x: number, y: number) {
  const p = sim.passableNear(x, y);
  const c: Can = { id: sim.props.n++, x: p.x, y: p.y, t: CAN.life };
  sim.props.cans.push(c);
  sim.events.push({ e: 'can', what: 'drop', x: c.x, y: c.y });
}

/** A Firebrand's slick lying at a point, if any (a new spit onto it lights it rather than laying another). */
export const slickAt = (sim: Sim, x: number, y: number) => sim.props.zones.find((z) => z.kind === 'slick' && z.life > 0 && dist(z.x, z.y, x, y) < z.r);

/** Fire lights a slick: a fire zone over it, or a burning machine or robot standing in it. */
function slickLit(sim: Sim, z: Zone) {
  if (sim.props.zones.some((f) => f.kind === 'fire' && f.life > 0 && dist(f.x, f.y, z.x, z.y) < f.r + z.r)) return true;
  return [...sim.hornets, ...sim.bots].some((u) => !u.dead && dist(u.x, u.y, z.x, z.y) < z.r + ('kind' in u ? u.r : 8) && sim.engine.status(u, 'burning'));
}

/** Light a slick now: it becomes a fire for the rest of its life. */
export function lightSlick(z: Zone) {
  z.kind = 'fire';
  z.next = 0;
}

function zoneStep(sim: Sim, z: Zone, dt: number) {
  if (z.kind === 'slick' && slickLit(sim, z)) lightSlick(z);
  const Z = ZONES[z.kind];
  z.life -= dt;
  z.next -= dt;
  if (z.next > 0) return;
  z.next = Z.every;
  if (z.kind === 'alarm') {
    for (const h of sim.hornets) if (!h.dead && !h.boss && dist(h.x, h.y, z.x, z.y) < z.r) h.hear = { x: z.x, y: z.y, until: sim.time + Z.every * 2, field: z.field! };
    return;
  }
  if (z.kind === 'shock') sim.events.push({ e: 'zone', what: 'pulse', z });
  for (const h of [...sim.hornets]) {
    if (h.dead || h.under || h.air || dist(h.x, h.y, z.x, z.y) > z.r + h.r) continue;
    if (Z.status) sim.engine.apply(h, Z.status, { duration: Z.time, ...(z.kind === 'fire' && z.stoked && !z.stoked.dead && { by: z.stoked }) });
    if (Z.shock) sim.damageHornet(h, Z.shock, null, 'shock', { via: 'zone' });
  }
  for (const b of sim.bots) {
    if (b.dead || dist(b.x, b.y, z.x, z.y) > z.r + 8 || (z.foesOnly && z.kind === 'slick')) continue;
    if (Z.status) sim.engine.apply(b, Z.status, { duration: Z.time });
    if (Z.shock) sim.hurt(b, Z.shock, false, { type: 'shock', via: 'zone' });
  }
  sim.drainFx();
}

// ---------------------------------------------------------------- the step

/** Each step: primed props count down to their burst, zones work and wear off, energy drinks are picked up or spoil. */
export function propStep(sim: Sim, dt: number) {
  const W = sim.props;
  for (const p of W.list)
    if (p.primed !== undefined) {
      p.primed -= dt;
      if (p.primed <= 0) settle(sim, p, p.by !== undefined ? sim.bot(p.by) : null);
    }
  if (W.zones.length) {
    for (const z of [...W.zones]) zoneStep(sim, z, dt);
    for (const z of W.zones) if (z.life <= 0) sim.events.push({ e: 'zone', what: 'end', z });
    W.zones = W.zones.filter((z) => z.life > 0);
  }
  if (W.cans.length) {
    const c = sim.controller;
    for (const can of W.cans) {
      can.t -= dt;
      if (!c.dead && dist(can.x, can.y, c.x, c.y) < CAN.reach) {
        can.t = 0;
        sim.engine.apply(c, 'haste', { duration: CAN.haste });
        sim.events.push({ e: 'can', what: 'take', x: can.x, y: can.y });
      }
    }
    W.cans = W.cans.filter((can) => can.t > 0);
  }
}

/** The ground the bots keep off: a prop about to go off (its blast), and the zones that burn, scald or shock (`botai.telegraphs`). */
export function propTeles(sim: Sim): Tele[] {
  const out: Tele[] = [];
  for (const p of sim.props.list) {
    const b = p.primed !== undefined ? PROPS[p.kind].fx?.burst : null;
    if (b) out.push({ id: `prop${p.id}`, kind: 'patch', x: p.x, y: p.y, r: b.r });
  }
  for (const z of sim.props.zones) if (z.kind === 'fire' || z.kind === 'steam' || z.kind === 'shock') out.push({ id: `zone${z.id}`, kind: 'patch', x: z.x, y: z.y, r: z.r });
  return out;
}

/** `debugState().props`: the props by kind and state, the zones, the drinks lying about. */
export function propSummary(sim: Sim) {
  const by: Record<string, number> = {};
  for (const p of sim.props.list) by[`${p.kind} ${propState(p)}`] = (by[`${p.kind} ${propState(p)}`] ?? 0) + 1;
  return {
    props: by,
    zones: sim.props.zones.map((z) => `${z.kind} (${Math.round(z.x)}, ${Math.round(z.y)}) r${z.r} ${z.life.toFixed(1)}s`),
    cans: sim.props.cans.length,
    ruins: sim.ruins.map((r) => `${r.kind} ${r.size ?? '-'} health ${ruinHealth(sim, r).toFixed(2)}${r.broken ? ' broken' : ''}`),
  };
}

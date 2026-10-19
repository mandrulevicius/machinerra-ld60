/**
 * Use: the one press (`pressUse`: the lift, a ruin, a coal seam, a place), the timed action it starts (`actionStep`) and the lift's rise.
 * Also the ruins' work (search, decode, junk) and the places' use hooks.
 * Add something to press: a branch in `pressUse` (the first thing in reach wins).
 * If it takes time, add a `UseAction` kind that `actionStep` pays out.
 * Rules (Minos, 2026-10-18; numbers `ACTION`): a held key is one press. The lift and a place's `confirm: true` arm on the first
 * press and fire on a second within `ACTION.confirm` s (`Sim.armed`). A timed action runs while he stays within
 * `reach * ACTION.zone`, pauses outside, is never cancelled by a hit, is replaced by a press elsewhere and ends if he goes down.
 * A live ruin's decode is a timed action too (its rules: `DECODE`, defs/ruins.ts). Tests press, they do not hold (`testkit.ts`).
 * A downed robot (P5, `downed.ts`): beside one lying, Use starts its field fix (`DOWNED.fix`), and a second press while it
 * runs picks it up instead (any number); carrying with none in reach, Use puts it all down (on the lift it asks the lift
 * first, and what he carries rides).
 */

import {
  seamNear,
  takeCoal,
} from './coal';
import {
  carriedBy,
  downedNear,
  fixed,
  pickUp,
  putDown,
  startFix,
} from './downed';
import { fire } from './combat';
import {
  ACTION,
  COAL,
  COPPER,
  DECODE,
  DOCK,
  GATHER,
  INSIGHT,
  MISSION,
  RUIN,
  RUIN_FINDS,
  SCAVENGER,
  T,
  TRAIL,
  trailLine,
} from './defs';
import {
  reach,
  wake,
} from './foes';
import { dist } from './geom';
import {
  type RelicId,
  stripSize as junkStrip,
  ruinJunk,
} from './junk';
import { drop } from './loot';
import {
  oracle,
  say,
} from './oracle';
import { PERK_FX } from './perks';
import { drinkStarOil } from './questcount';
import { ruinPay } from './props';
import { carriedProps, pickUpProp, propToCarry, putDownProps } from './placeparts';
import { BEHAVE } from './placeplay';
import type { PlaceId } from './places';
import type { Sim } from './sim';
import {
  behaviourOf,
  isBotType,
} from './specs';
import type {
  Bot,
  Ruin,
} from './types';

export type UseEvent =
  /** A ruin was searched or decoded: the line it gave. */
  | { e: 'ruin'; ruin: Ruin; text: string }
  /** A live ruin's decode (P30): the hold begins, it is done, or the ruin is broken and goes dead. */
  | { e: 'decode'; what: 'start' | 'done'; ruin: Ruin }
  /** A relic found in a ruin (`id`), or a full strip that left it. */
  | { e: 'relic'; id: RelicId; x: number; y: number; kept: boolean };

/** Is `key` (the lift, or a place) still in reach of him to confirm? */
export function armable(sim: Sim, c: Bot, key: 'lift' | 'starOil' | PlaceId) {
  return key === 'lift' ? sim.atLift(c) : key === 'starOil' ? true : placeUse(sim, c.x, c.y)?.p.id === key;
}

/** One press of Use: the lift, else a ruin in reach, else a place's action. */
export function pressUse(sim: Sim, c: Bot) {
  // Beside a robot lying downed: a press starts its fix, a second one while it runs picks it up (he may carry any number).
  // Not on the lift: there the press is the lift's (a robot that fell back to it lies there and rides home carried), so a
  // ride is never a fix by mistake.
  const lying = sim.atLift(c) ? null : downedNear(sim, c.x, c.y);
  if (lying) {
    if (sim.action?.bot === lying) pickUp(sim, c, lying);
    else startFix(sim, lying);
    return;
  }
  // Carrying with nothing lying in reach: Use puts it all down, except on the lift, where it asks the lift (what he carries rides).
  if (!sim.atLift(c) && carriedBy(sim, c).length) return putDown(sim, c);
  if (sim.atLift(c)) {
    if (sim.armed?.key === 'lift') {
      sim.armed = null;
      rise(sim);
    } else sim.armed = { key: 'lift', verb: 'Ride up?', t: ACTION.confirm };
    return;
  }
  const ruin = ruinNear(sim, c.x, c.y);
  if (ruin) {
    if (sim.action?.ruin !== ruin) startRuin(sim, ruin);
    return;
  }
  const seam = seamNear(sim, c.x, c.y);
  if (seam) {
    if (sim.action?.seam !== seam) sim.action = { seam, t: 0, need: COAL.hand.time, reach: COAL.reach, paused: false };
    return;
  }
  const hit = placeUse(sim, c.x, c.y);
  if (!hit) {
    // Carrying a prop (P36: a shell, the sign) with nothing else in reach: Use puts it down; else a carryable one in reach is picked up.
    if (carriedProps(sim, c).length) return putDownProps(sim, c);
    const prop = propToCarry(sim, c.x, c.y);
    if (prop) pickUpProp(sim, c, prop);
    // Nothing else to do: star oil in the pack is asked, and drunk on the second press (P38).
    else if (sim.quest.pack.starOil > 0 && !sim.stats['drank.starOil'] && !sim.dungeon) {
      if (sim.armed?.key === 'starOil') {
        sim.armed = null;
        drinkStarOil(sim);
      } else sim.armed = { key: 'starOil', verb: 'Drink the star oil?', t: ACTION.confirm };
    }
    return;
  }
  if (hit.use.confirm) {
    if (sim.armed?.key === hit.p.id) {
      sim.armed = null;
      fired(sim, hit.use, hit.p);
    } else sim.armed = { key: hit.p.id, verb: `${hit.use.verb(sim, hit.p)}?`, t: ACTION.confirm };
  } else if (sim.action?.place !== hit.p) {
    sim.action = { place: hit.p, t: 0, need: hit.use.holdFor?.(sim, hit.p) ?? hit.use.hold, reach: hit.use.reach, paused: false };
    hit.use.start?.(sim, hit.p);
  }
}

/** The lift goes up (the second press): the robots not aboard are left to pray. */
export function rise(sim: Sim) {
  sim.riseT = 0;
  sim.action = null;
  sim.exitUsed = sim.atExit(sim.controller);
  // A cleared den's party comes up wherever it was: it joins him on the platform first.
  if (sim.run?.cleared) {
    const here = sim.exitUsed ? sim.run.wallAt() : sim.lift;
    const far = sim.crew.concat(sim.followers.map((f) => f.bot)).filter((b) => dist(b.x, b.y, here.x, here.y) > MISSION.liftTiles * T * 1.6);
    far.forEach((b, i) => {
      const a = (i / far.length) * Math.PI * 2;
      const at = sim.passableNear(here.x + Math.cos(a) * 60, here.y + Math.sin(a) * 45);
      b.x = at.x;
      b.y = at.y;
      b.path = [];
    });
  }
  sim.setPhase('rising');
  // Nobody on the platform can be hurt while it rises (Minos): no damage, no debuffs, and the ones on it are cleansed. In a cleared den the whole party comes up.
  for (const b of lifted(sim)) {
    sim.engine.cleanse(b);
    sim.engine.apply(b, 'lifted', { duration: sim.city.riseTime + 1 });
  }
  const out = sim.crew.filter((b) => !rides(sim, b)).length;
  if (out) say(sim, 'rise', `Hauling you up... with ${out} robot${out > 1 ? 's' : ''} still on ${sim.biome.talk.land}. They will pray for you. Loudly.`, 'warn');
  else say(sim, 'rise', 'Everyone aboard. Hold on to something; hauling you up.', 'calm');
}

/** Rides up with the Communicator: aboard the lift, or anyone alive when the cleared den's party climbs out (its robots come wherever they stand). */
export function rides(sim: Sim, b: Bot) {
  return sim.onLift(b, 1.6) || !!sim.run?.cleared;
}

/** Who is on the platform as it rises: him, and every robot (and follower) that rides. */
export function lifted(sim: Sim): Bot[] {
  const all = [...sim.bots, ...sim.followers.map((f) => f.bot), ...(sim.pilgrim ? [sim.pilgrim.bot] : [])];
  return all.filter((b) => !b.dead && (b.role === 'controller' || rides(sim, b)));
}

/** Seconds a dead ruin takes to search (Quick hands and Scavenger shorten it). */
function searchTime(sim: Sim) {
  return sim.perks.has('quickHands') ? PERK_FX.quickHands.search : RUIN.search / (sim.perks.has('scavenger') ? SCAVENGER.search : 1);
}

/** Start a ruin's search, or a live one's decode (loud: it wakes the nearest sleeping hive, never in the morning). */
function startRuin(sim: Sim, ruin: Ruin) {
  sim.action = { ruin, t: 0, need: ruin.live ? DECODE.time : RUIN_FINDS[ruin.kind].pry ? DOCK.pry : searchTime(sim), reach: RUIN.reach, paused: false };
  if (!ruin.live) return;
  sim.decodeT = 0;
  sim.events.push({ e: 'decode', what: 'start', ruin });
  say(sim, 'decode', 'The old machine is awake and talking. So is everything within earshot. Stay close and keep fighting; it decodes while you are near.', 'warn');
  const n = sim.nests.filter((x) => !x.awake && !x.dead && !x.place).sort((p, q) => dist(p.x, p.y, ruin.x, ruin.y) - dist(q.x, q.y, ruin.x, ruin.y))[0];
  if (n && sim.day.phase !== 'morning') wake(sim, n, 'Communicator');
}

/** The action runs while he is within its zone, paused outside it; done, it pays. */
export function actionStep(sim: Sim, dt: number) {
  const a = sim.action;
  if (!a) return;
  const c = sim.controller;
  const use = a.place && BEHAVE[a.place.id].use;
  if (a.bot) {
    // A field fix ends when the robot is carried off or stands up (or is gone).
    if (a.bot.dead || a.bot.downed?.by !== null) return void (sim.action = null);
  } else if (a.seam ? a.seam.amount <= 0 : a.ruin ? a.ruin.searched : !a.place || !use || !use.ready(sim, a.place)) return void (sim.action = null);
  const at = a.bot ?? a.seam ?? a.ruin ?? use!.at(sim, a.place!);
  a.paused = dist(c.x, c.y, at.x, at.y) > a.reach * ACTION.zone;
  if (a.place) sim.hold = { id: a.place.id, t: a.t, need: a.need, paused: a.paused };
  if (a.paused) return;
  if (c.state === 'idle') c.state = 'gather';
  // Stripping a dead ruin and mining a seam by hand run at his work rate (the Third Hand); a fix, a decode and a place's action do not.
  const step = dt * (a.seam || (a.ruin && !a.ruin.live) ? sim.engine.stat(c, 'siphonRate', 1) : 1);
  const t0 = a.t;
  a.t += step;
  if (a.bot) {
    c.work = a.bot;
    if (a.t >= a.need) fixed(sim, a.bot);
  } else if (a.seam) {
    // By hand, slowly: a press mines on while he stays near, a load each time round. A pickaxe beat each `COAL.hand.beat` s (a look only).
    if (Math.floor(a.t / COAL.hand.beat) > Math.floor(t0 / COAL.hand.beat)) sim.events.push({ e: 'mine', seam: a.seam, by: c });
    if (a.t >= a.need) {
      a.t = 0;
      takeCoal(sim, a.seam, COAL.hand.load, c);
    }
  } else if (a.ruin) {
    c.work = a.ruin;
    if (a.ruin.live) decodePull(sim, dt);
    if (a.t >= a.need) {
      if (a.ruin.live) decoded(sim, a.ruin);
      else search(sim, a.ruin);
    }
  } else if (a.t >= a.need) {
    sim.action = null;
    sim.hold = null;
    fired(sim, use!, a.place!);
  } else if (use?.pulls?.(sim, a.place!)) {
    decodePull(sim, dt);
  }
}

/** A ruin to search here: not yet searched. */
export function ruinNear(sim: Sim, x: number, y: number) {
  return sim.ruins.find((r) => !r.searched && dist(x, y, r.x, r.y) < RUIN.reach) ?? null;
}

/** The ruin being decoded now (P30), if it is the live action. */
export function decoding(sim: Sim): Ruin | null {
  const r = sim.action?.ruin;
  return r?.live ? r : null;
}

/** How far the action has got (0..1), for the view's ring (a live ruin's decode, or a dead one's search). */
export function decodeProgress(sim: Sim) {
  return sim.action?.ruin?.live ? Math.min(1, sim.action.t / sim.action.need) : 0;
}

/**
 * The pull of a decode on a live ruin (P30, D9 row 1): loud. Starting it wakes the nearest sleeping hive (`startRuin`; not in
 * the morning, which is quiet: Minos on D24); every `DECODE.ping` seconds, while he stays in the zone, every foe within
 * `DECODE.pullTiles` is called to the Communicator (the whistle's way: it hunts farther for a while). `DECODE.time` seconds
 * of staying near, fighting included, and it pays; hits do not break it (Minos, 2026-10-18).
 */
function decodePull(sim: Sim, dt: number) {
  const c = sim.controller;
  sim.decodeT -= dt;
  if (sim.decodeT > 0) return;
  sim.decodeT = DECODE.ping;
  for (const h of sim.hornets)
    if (!h.dead && !h.boss && !h.home && !h.under && dist(h.x, h.y, c.x, c.y) < DECODE.pullTiles * T) {
      h.target = c.id;
      h.alertT = sim.time + DECODE.pullFor;
    }
}

/** The decode is done: insight, the ruin's own find, and the `decode` trigger. */
export function decoded(sim: Sim, ruin: Ruin) {
  ruin.searched = true;
  ruin.decoded = true;
  if (sim.action?.ruin === ruin) sim.action = null;
  sim.ruinsFound.live++;
  sim.stats.ruins++;
  sim.stats.decoded = (sim.stats.decoded ?? 0) + 1;
  sim.events.push({ e: 'ruin', ruin, text: sim.r.pick(DECODE.lines) });
  sim.events.push({ e: 'decode', what: 'done', ruin });
  dropCopper(sim, ruin, COPPER.live);
  dropFind(sim, ruin, COPPER.live);
  sim.engine.emit({ kind: 'decode', self: sim.controller });
  sim.drainFx();
}

export function search(sim: Sim, ruin: Ruin, by?: Bot) {
  // The Parable tells its verses as they are found: the first ruin of the trail searched is verse one, whichever it is.
  if (ruin.trail !== undefined) {
    const v = sim.ruins.filter((o) => o.trail !== undefined && o.searched).length;
    const t = TRAIL[v];
    Object.assign(ruin, { verse: v, line: trailLine(v, ruin.kind), ...(t.bonus && { bonus: t.bonus }), ...(t.oracle && { oracle: t.oracle }) });
  }
  ruin.searched = true;
  if (sim.action?.ruin === ruin) sim.action = null;
  dropCopper(sim, ruin, COPPER.dead);
  if (by) dropCopper(sim, ruin, COPPER.dead * GATHER.copperMore); // a gatherer pulls more wire than a quick search
  sim.ruinsFound.dead++;
  sim.stats.ruins++;
  if (RUIN_FINDS[ruin.kind].pry) sim.stats.docks = (sim.stats.docks ?? 0) + 1; // the contacts come home with the lift (P58 H)
  if (ruin.trail !== undefined && ruin.verse === 2) sim.addInsight(INSIGHT.parable); // the whole Parable read
  sim.events.push({ e: 'ruin', ruin, text: ruin.line ?? sim.r.pick(RUIN_FINDS[ruin.kind].lines) });
  dropFind(sim, ruin, COPPER.dead);
  // Quick hands (the Expeditioner): the old world gives back your steam; a ruin is a pit stop mid-fight. Not oil: oil is a life.
  if (sim.perks.has('quickHands')) {
    const c = sim.controller;
    c.steam = Math.min(c.maxSteam, c.steam + c.maxSteam * PERK_FX.quickHands.steam);
  }
  for (const [i, kind] of (ruin.bonus ?? []).entries()) drop(sim, ruin.x + (i - 2) * 22, ruin.y + 46, kind);
  findJunk(sim, ruin);
  sim.engine.emit({ kind: 'search', self: by ?? sim.controller });
  sim.drainFx();
  if (ruin.oracle) say(sim, `ruin-${ruin.id}`, ruin.oracle);
}

/** A ruin knocked flat before anyone searched it gives up what is left of its find: its wiring (at its health, so little) and its kind's find; no junk, no insight, no verse. */
export function salvage(sim: Sim, ruin: Ruin) {
  dropCopper(sim, ruin, COPPER.dead);
  dropFind(sim, ruin, COPPER.dead);
}

/**
 * What a ruin gives up besides its wiring: its kind's find if it has one (a part; the jungle's ruins have them), and a
 * second find with Ruin sense (another pile of wiring where there is no find). Never scrap: scrap comes from kills.
 */
function dropFind(sim: Sim, ruin: Ruin, copper: number) {
  const kind = RUIN_FINDS[ruin.kind].loot;
  if (kind) drop(sim, ruin.x, ruin.y + 30, kind);
  if (sim.perks.has('ruinSense')) {
    if (kind) drop(sim, ruin.x + 24, ruin.y + 34, kind);
    else dropCopper(sim, ruin, copper);
  }
}

/** A ruin's wiring comes off as copper: a pile beside it (the Hollow City's walls hold half again as much; a Trader's wire order, too; its size and health, `ruinPay`). */
function dropCopper(sim: Sim, ruin: Ruin, base: number) {
  // A bigger, healthier ruin pays more (`ruinPay`); a Parable Trail ruin, with no pieces, as it always did.
  const k = (sim.biome.copperMul ?? 1) * (sim.perks.has('wireOrder') ? PERK_FX.wireOrder : 1) * ruinPay(sim, ruin) * sim.engine.stat(sim.controller, 'ruinCopper', 1); // the Page-turner
  drop(sim, ruin.x - 26, ruin.y + 34, 'copper', null, Math.max(1, Math.round(base * k)));
}

/** The carry strip's size: six, and more for each fielded Carrier gatherer (`behaviourOf(...).carryStrip` slots). */
export function stripSize(sim: Sim) {
  return junkStrip(0) + (sim.perks.has('packSack') ? PERK_FX.packSack : 0) + sim.crew.reduce((n, b) => n + (b.role === 'gatherer' && b.spec && isBotType(b.role) ? Number(behaviourOf(b.role, b.spec).carryStrip ?? 0) : 0), 0);
}

/** A dead ruin may give junk (`junk.ts`): onto the strip if there is room, else it is left where it lay. Under D9 a live ruin gives insight instead (`decode`). */
function findJunk(sim: Sim, ruin: Ruin) {
  const id = (ruin.junk as RelicId | undefined) ?? ruinJunk(ruin.kind, (sim.junkR ??= sim.r.fork('junk'))); // its own stream: the land's stays as it was
  if (!id) return;
  const kept = sim.junk.length < stripSize(sim);
  if (kept) sim.junk.push(id);
  sim.events.push({ e: 'relic', id, x: ruin.x, y: ruin.y, kept });
  sim.stats.junk = (sim.stats.junk ?? 0) + (kept ? 1 : 0);
  if (kept) sim.stats[`junk.${id}`] = (sim.stats[`junk.${id}`] ?? 0) + 1; // quests (P38): the relic kind the Trader asked for
}

/** The place action in reach of a point, if any: press Use there to start it. */
export function placeUse(sim: Sim, x: number, y: number) {
  for (const p of sim.places) {
    const u = BEHAVE[p.id].use;
    if (!u || !u.ready(sim, p)) continue;
    const at = u.at(sim, p);
    if (dist(x, y, at.x, at.y) < u.reach) return { p, use: u };
  }
  return null;
}

/** A place's action fires: the counter quests ask for (P38: `use.<place id>`, e.g. `use.mast` for a mast climbed). */
function fired<P extends { id: string }>(sim: Sim, u: { fire(sim: Sim, p: P): void }, p: P) {
  u.fire(sim, p);
  sim.stats[`use.${p.id}`] = (sim.stats[`use.${p.id}`] ?? 0) + 1;
}

/** Run a place's action at once, timed or not (the dev command). False when it has nothing to do now. */
export function triggerPlace(sim: Sim, id: PlaceId) {
  const p = sim.places.find((q) => q.id === id);
  const u = p && BEHAVE[id].use;
  if (!p || !u || !u.ready(sim, p)) return false;
  fired(sim, u, p);
  return true;
}

/** Each place's own step, and its sight line the first time the Communicator comes near. */
export function placesStep(sim: Sim, dt: number) {
  const c = sim.controller;
  for (const p of sim.places) {
    const b = BEHAVE[p.id];
    if (b.near && !p.v.near && dist(c.x, c.y, p.x, p.y) < b.near.tiles * T) {
      p.v.near = 1;
      b.near.run(sim, p);
    }
    b.step?.(sim, p, dt);
    if (!p.visited && b.sight && dist(c.x, c.y, p.x, p.y) < b.sight.tiles * T) {
      p.visited = true;
      const text = b.sight.text(sim, p);
      if (text) say(sim, b.sight.id, text, b.sight.tone ?? 'calm');
      sim.events.push({ e: 'place', id: p.id, what: 'visit', x: p.x, y: p.y });
      // The Expeditioner's third step (P42): every place of one land found (a place with no sight line cannot be found, so it is not counted).
      const finds = sim.places.filter((q) => BEHAVE[q.id].sight);
      sim.stats.placesFound = finds.filter((q) => q.visited).length;
      sim.stats.placesTotal = finds.length;
      if (sim.stats.placesFound >= finds.length) sim.stats.placesAll = 1;
    }
  }
}

/** Is (x, y) within `tiles` of the centre of a place? (The graveyard rests the music.) */
export function inPlace(sim: Sim, id: PlaceId, x: number, y: number, tiles: number) {
  const p = sim.places.find((q) => q.id === id);
  return !!p && dist(x, y, p.x, p.y) < tiles * T;
}

/** `summary()`: the ruins, the places, and the timed action or the confirmation in progress. */
export function useSummary(sim: Sim) {
  const a = sim.action;
  return {
    ruins: sim.ruins.map((r) => `${r.kind}${r.live ? ' (live)' : ''}${r.broken ? ' (broken)' : ''}${r.trail !== undefined ? ' (trail' + (r.verse !== undefined ? `, verse ${r.verse + 1}` : '') + ')' : ''}${r.searched ? ' (searched)' : ''}`),
    places: sim.places.map((p) => ({
      id: p.id,
      state: BEHAVE[p.id].status?.(sim, p) ?? p.state,
      tile: [Math.floor(p.x / T), Math.floor(p.y / T)],
      tiles: +(dist(p.x, p.y, sim.lift.x, sim.lift.y) / T).toFixed(1),
      seen: p.visited,
    })),
    hold: sim.hold && { place: sim.hold.id, t: +sim.hold.t.toFixed(2), need: sim.hold.need, paused: sim.hold.paused },
    action: a && {
      kind: a.bot ? 'fix' : a.seam ? 'coal' : a.ruin ? (a.ruin.live ? 'decode' : 'search') : a.place!.id,
      t: +a.t.toFixed(2),
      need: +a.need.toFixed(2),
      paused: a.paused,
    },
    armed: sim.armed && { key: sim.armed.key, verb: sim.armed.verb, t: +sim.armed.t.toFixed(2) },
  };
}

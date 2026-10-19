/**
 * What the relics do that the effect language cannot say (P19; the table of relics is `junk.ts`, whose header lists how to
 * add one). Plain rules, no Phaser. A robot wears one relic (`Bot.relic`, from the workshop's roster); its stats and
 * triggers are an engine source (`Sim.dress`), and this is the rest, chosen by the relic's id:
 *   - the Toaster lobs two slugs over rocks (they fly, land, and a dashing foe has moved off);
 *   - the Microwave stands still and hums, then burns a cone; the Hair dryer gusts (no damage); the Toothbrush runs in and buzzes;
 *   - the Smartphone marks the loot near it and fetches it, and says it is scrolling every 20 s; the Way-finder heads for the lift
 *     when you ride, and one new order in five makes it announce a scenic route (Minos on D24: both are barks only, neither takes control of the robot);
 *   - the Speaker's pulse makes the crew complain; the Queen's Crown hatches a brass hornet from a kill.
 *   - the biome relics (D50; the sprinkler, Tamagotchi, hand warmer and thermos are engine sources alone): the bug-zapper runs in and swats,
 *     the selfie stick pokes from afar and poses (0.4 s) before each flash that Blinds, the traffic light cycles red (foes near Slowed),
 *     amber, green (crew near Haste) by the mission clock, the beacon shows the downed robots and opens the buried caches within 20 tiles;
 *     the Tamagotchi, traffic light and beacon also bark (their flaws, jokes and nothing more).
 * `Sim` calls `relicThink` in a robot's turn (true: the relic has taken it), `junkStep` once a step (slugs in flight, marks), `relicProc`/`hatch` for the engine's reports. Numbers are `RELIC_FX`.
 * Views read `JunkWorld` and the `junk` events (`SimEvent`).
 */
import { FOES, T } from './defs';
import type { Bot, Hornet, Sim } from './sim';
import { dist } from './geom';

export const RELIC_FX = {
  toaster: { every: 3, slugs: 2, dmg: 14, burn: 0.4, range: 260, flight: 0.7, spread: 0.22, splash: 22 },
  microwave: { every: 6, hum: 2, reach: 170, cone: 1.4, dmg: 40, twisted: 2 },
  hairdryer: { every: 5, reach: 130, cone: 1.6, knock: 520, quiet: 3 },
  toothbrush: { rate: 8, dmg: 4, reach: 40, seek: 160 },
  smartphone: { markTiles: 15, fetchTiles: 8, scroll: 20 },
  satnav: { scenic: 0.2, liftNear: 40 },
  speaker: { complain: 220 },
  crown: { cap: 3, ttl: 10 },
  // P23: the smoke detector chirps for the crew within `reach` px of it (and says "low battery" every `low` s), the remote takes the foe nearest the aim within `aim` px, the quadcopter pulls loot within `fetch` px at `pull` px a second.
  smokedetector: { reach: 260, low: 20, chirp: 4 },
  remote: { aim: 110 },
  quadcopter: { fetch: 120, pull: 300 },
  // D50, all guesses: the zapper swats `rate` a second for `dmg` Shock (flyers `flyers` times) from `seek` px, reach `reach`; the selfie stick pokes every `poke` s for `dmg` Impact from `seek` px, reach `reach`, and every `every` s poses `pose` s, then Blinds the foes within `flash` px; the light's three colours last `phase` s each and act within `r` px, re-applied every `step` s; the beacon works within `tiles` tiles and opens a cache's `open` tiles; a bark every `bark` s.
  zapper: { rate: 1.25, dmg: 12, flyers: 3, reach: 36, seek: 130 },
  selfiestick: { poke: 1.2, dmg: 10, reach: 90, seek: 150, every: 6, pose: 0.4, flash: 160 },
  trafficlight: { phase: 4, r: 120, step: 0.25 },
  beacon: { tiles: 20, bark: 25, open: 2 },
  tamagotchi: { bark: 30 },
} as const;

/** A lobbed slug in flight: from where it left to where it lands, and the seconds it has been up. */
export interface Slug { sx: number; sy: number; tx: number; ty: number; t: number; owner: number }
/** What a wearer keeps between steps. */
interface Wearer { toastT: number; humT: number; humA: number; humCd: number; dryT: number; brush: number; scrollT: number; order: string; lowT: number; chirpT: number; shotDown: boolean; swat: number; flashT: number; poseT: number; lightT: number; light: number; barkT: number }
/** The Sim's junk: slugs in the air, the wearers' timers, the loot the smartphones have marked (ids) and the downed robots the beacons show. */
export interface JunkWorld { slugs: Slug[]; marks: number[]; found: Bot[]; wearers: WeakMap<Bot, Wearer> }
export const junkWorld = (): JunkWorld => ({ slugs: [], marks: [], found: [], wearers: new WeakMap() });


const wearer = (sim: Sim, b: Bot): Wearer => {
  let w = sim.junkw.wearers.get(b);
  if (!w) sim.junkw.wearers.set(b, (w = { toastT: 1, humT: 0, humA: 0, humCd: 0, dryT: 0.5, brush: 0, scrollT: RELIC_FX.smartphone.scroll, order: '', lowT: RELIC_FX.smokedetector.low, chirpT: 0, shotDown: false, swat: 0, flashT: RELIC_FX.selfiestick.every, poseT: 0, lightT: 0, light: -1, barkT: 12 }));
  return w;
};

/** The nearest living foe within `r` px of the robot that can be hit (not burrowed, not in the air). */
function foeNear(sim: Sim, b: Bot, r: number): Hornet | null {
  let best: Hornet | null = null;
  let bd = r;
  for (const h of sim.hornets) {
    const d = dist(b.x, b.y, h.x, h.y);
    if (!h.dead && !h.under && !h.air && d < bd) {
      bd = d;
      best = h;
    }
  }
  return best;
}

/** A foe in the cone (`a` the heading, `width` the whole angle, `reach` px), nearest first. */
function inCone(sim: Sim, b: Bot, a: number, width: number, reach: number) {
  return sim.hornets.filter((h) => {
    if (h.dead || h.under || h.air) return false;
    const d = dist(b.x, b.y, h.x, h.y);
    if (d > reach + h.r) return false;
    let da = Math.atan2(h.y - b.y, h.x - b.x) - a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    return d < h.r + 20 || Math.abs(da) <= width / 2;
  });
}

/** A foe that is mid-dash (a tell, a lunge, a charge) has moved off what lands where it was. */
const dashing = (h: Hornet) => h.brain.state === 'go' || h.brain.state === 'charge' || h.brain.state === 'slam';

/**
 * A wearer's turn, before its job. Returns true when the relic has taken it (the microwave humming, the toothbrush in a
 * fight, the way-finder heading for the lift or the scenic route), so the robot does nothing else this step.
 */
export function relicThink(sim: Sim, b: Bot, dt: number): boolean {
  const id = b.relic;
  if (!id || b.dead) return false;
  const w = wearer(sim, b);
  switch (id) {
    case 'toaster': {
      w.toastT -= dt;
      const F = RELIC_FX.toaster;
      if (w.toastT > 0) return false;
      const h = foeNear(sim, b, F.range);
      if (!h) return false;
      w.toastT = F.every;
      const a = Math.atan2(h.y - b.y, h.x - b.x);
      for (let i = 0; i < F.slugs; i++) {
        const off = (i - (F.slugs - 1) / 2) * F.spread;
        const d = Math.min(dist(b.x, b.y, h.x, h.y), F.range) * (1 + 0.04 * i);
        const slug = { sx: b.x, sy: b.y - 12, tx: b.x + Math.cos(a + off) * d, ty: b.y + Math.sin(a + off) * d, t: 0, owner: b.id };
        sim.junkw.slugs.push(slug);
        sim.events.push({ e: 'junk', what: 'toss', x: slug.sx, y: slug.sy, tx: slug.tx, ty: slug.ty, by: b });
      }
      b.face = Math.cos(a) >= 0 ? 1 : -1;
      return false;
    }
    case 'microwave': {
      const F = RELIC_FX.microwave;
      if (w.humT > 0) {
        // It stands and hums, then the cone.
        w.humT -= dt;
        b.state = 'fight';
        if (w.humT <= 0) {
          w.humCd = F.every;
          const hit = inCone(sim, b, w.humA, F.cone, F.reach);
          for (const h of hit) sim.damageHornet(h, F.dmg * (h.twisted ? F.twisted : 1), b, 'fire', { via: 'beam' });
          sim.events.push({ e: 'junk', what: 'cone', x: b.x, y: b.y, a: w.humA, r: F.reach, w: F.cone, by: b });
        }
        return true;
      }
      w.humCd -= dt;
      if (w.humCd > 0) return false;
      const h = foeNear(sim, b, F.reach * 0.9);
      if (!h) return false;
      w.humT = F.hum;
      w.humA = Math.atan2(h.y - b.y, h.x - b.x);
      b.face = Math.cos(w.humA) >= 0 ? 1 : -1;
      sim.events.push({ e: 'junk', what: 'hum', x: b.x, y: b.y, a: w.humA, by: b });
      return true;
    }
    case 'hairdryer': {
      const F = RELIC_FX.hairdryer;
      w.dryT -= dt;
      if (w.dryT > 0) return false;
      const h = foeNear(sim, b, F.reach);
      if (!h) return false;
      w.dryT = F.every;
      const a = Math.atan2(h.y - b.y, h.x - b.x);
      b.face = Math.cos(a) >= 0 ? 1 : -1;
      for (const o of inCone(sim, b, a, F.cone, F.reach)) {
        const d = dist(b.x, b.y, o.x, o.y) || 1;
        if (!o.boss && !sim.engine.flag(o, 'steady')) {
          o.vx += ((o.x - b.x) / d) * F.knock;
          o.vy += ((o.y - b.y) / d) * F.knock;
        }
        sim.engine.apply(o, 'wet', { by: b });
        o.quietT = sim.time + F.quiet;
        if (o.brain.state === 'tell' || o.brain.state === 'go') {
          o.brain.state = 'roam';
          o.brain.t = F.quiet;
        }
      }
      sim.events.push({ e: 'junk', what: 'gust', x: b.x, y: b.y, a, r: F.reach, w: F.cone, by: b });
      return false;
    }
    case 'toothbrush': {
      const F = RELIC_FX.toothbrush;
      const h = foeNear(sim, b, F.seek);
      if (!h) return false;
      b.state = 'fight';
      b.target = h.id;
      const d = dist(b.x, b.y, h.x, h.y);
      if (d > F.reach + h.r) {
        sim.go(b, h.x, h.y, dt, F.reach * 0.5);
        return true;
      }
      b.face = h.x >= b.x ? 1 : -1;
      w.brush += dt * F.rate * Math.max(0.3, sim.engine.stat(b, 'attackRate', 1));
      for (; w.brush >= 1; w.brush--) {
        if (h.dead) break;
        sim.damageHornet(h, F.dmg, b, 'impact', { via: 'vibro' });
      }
      return true;
    }
    case 'smartphone': {
      // The flaw is a joke and nothing more: it says it is scrolling, and keeps doing its job.
      w.scrollT -= dt;
      if (w.scrollT <= 0) {
        w.scrollT = RELIC_FX.smartphone.scroll;
        sim.bark(b, 'scroll', true);
      }
      return false;
    }
    case 'smokedetector': {
      // The flaw is a joke and nothing more: it chirps that it is low on battery, and keeps doing its job.
      w.lowT -= dt;
      if (w.lowT <= 0) {
        w.lowT = RELIC_FX.smokedetector.low;
        sim.bark(b, 'lowbattery', true);
      }
      return false;
    }
    case 'satnav': {
      const F = RELIC_FX.satnav;
      // Heads for the lift when you ride: he has asked it.
      if (sim.armed?.key === 'lift' && b.crew !== -1) {
        sim.go(b, sim.lift.x, sim.lift.y, dt, F.liftNear);
        b.state = 'move';
        return true;
      }
      // One new order in five, it announces the scenic route (a bark; the order is followed as given).
      const a = sim.anchor(b);
      const key = `${Math.round(a.x / 8)},${Math.round(a.y / 8)}`;
      if (key !== w.order) {
        const had = w.order !== '';
        w.order = key;
        if (had && b.crew > 0 && sim.r.chance(F.scenic)) sim.events.push({ e: 'junk', what: 'scenic', x: b.x, y: b.y, by: b });
      }
      return false;
    }
    case 'zapper': {
      const F = RELIC_FX.zapper;
      const h = foeNear(sim, b, F.seek);
      if (!h) return false;
      b.state = 'fight';
      b.target = h.id;
      if (dist(b.x, b.y, h.x, h.y) > F.reach + h.r) {
        sim.go(b, h.x, h.y, dt, F.reach * 0.5);
        return true;
      }
      b.face = h.x >= b.x ? 1 : -1;
      w.swat += dt * F.rate * Math.max(0.3, sim.engine.stat(b, 'attackRate', 1));
      for (; w.swat >= 1; w.swat--) {
        if (h.dead) break;
        sim.damageHornet(h, F.dmg * (FOES[h.kind as keyof typeof FOES]?.ground ? 1 : F.flyers), b, 'shock', { via: 'swat' });
        sim.events.push({ e: 'junk', what: 'swat', x: b.x, y: b.y, tx: h.x, ty: h.y, by: b });
      }
      return true;
    }
    case 'selfiestick': {
      const F = RELIC_FX.selfiestick;
      if (w.poseT > 0) {
        // It poses (and stands) before the flash.
        w.poseT -= dt;
        b.state = 'fight';
        if (w.poseT <= 0) {
          for (const h of sim.hornets) if (!h.dead && !h.under && !h.air && dist(b.x, b.y, h.x, h.y) <= F.flash) sim.engine.apply(h, 'blinded', { by: b });
          sim.events.push({ e: 'junk', what: 'flash', x: b.x, y: b.y, r: F.flash, by: b });
        }
        return true;
      }
      w.flashT -= dt;
      if (w.flashT <= 0 && foeNear(sim, b, F.flash)) {
        w.flashT = F.every;
        w.poseT = F.pose;
        sim.bark(b, 'pose', true);
        sim.events.push({ e: 'junk', what: 'pose', x: b.x, y: b.y, by: b });
        return true;
      }
      const h = foeNear(sim, b, F.seek);
      if (!h) return false;
      b.state = 'fight';
      b.target = h.id;
      if (dist(b.x, b.y, h.x, h.y) > F.reach + h.r) {
        sim.go(b, h.x, h.y, dt, F.reach * 0.7);
        return true;
      }
      b.face = h.x >= b.x ? 1 : -1;
      w.swat += (dt * Math.max(0.3, sim.engine.stat(b, 'attackRate', 1))) / F.poke;
      for (; w.swat >= 1; w.swat--) {
        if (h.dead) break;
        sim.damageHornet(h, F.dmg, b, 'impact', { via: 'poke' });
        sim.events.push({ e: 'junk', what: 'swat', x: b.x, y: b.y, tx: h.x, ty: h.y, by: b });
      }
      return true;
    }
    case 'tamagotchi':
    case 'beacon': {
      // The flaws are jokes and nothing more: it beeps, and the robot keeps doing its job.
      w.barkT -= dt;
      if (w.barkT <= 0) {
        w.barkT = id === 'beacon' ? RELIC_FX.beacon.bark : RELIC_FX.tamagotchi.bark;
        sim.bark(b, id === 'beacon' ? 'ping' : 'beep', true);
      }
      return false;
    }
    default:
      return false;
  }
}

/** Once a step: the slugs fly and land, and the smartphones mark the loot near them. */
export function junkStep(sim: Sim, dt: number) {
  const J = sim.junkw;
  const F = RELIC_FX.toaster;
  for (const s of J.slugs) {
    s.t += dt;
    if (s.t < F.flight) continue;
    const owner = sim.bot(s.owner);
    s.owner = -1;
    sim.events.push({ e: 'junk', what: 'splat', x: s.tx, y: s.ty });
    for (const h of sim.hornets) {
      if (h.dead || h.under || h.air || dashing(h) || dist(h.x, h.y, s.tx, s.ty) > F.splash + h.r) continue;
      sim.damageHornet(h, F.dmg, owner, 'impact', { via: 'lob' });
      if (!h.dead && sim.r.chance(F.burn)) sim.engine.apply(h, 'burning', { by: owner ?? undefined });
    }
  }
  J.slugs = J.slugs.filter((s) => s.owner !== -1);
  // The quadcopters: loot within their reach slides to them, until one is shot down.
  for (const b of sim.bots) {
    if (b.relic !== 'quadcopter' || b.dead || b.downed || wearer(sim, b).shotDown) continue;
    for (const l of sim.loot) {
      const d = dist(b.x, b.y, l.x, l.y);
      if (l.dead || d > RELIC_FX.quadcopter.fetch || d < 2) continue;
      const k = Math.min(1, (dt * RELIC_FX.quadcopter.pull) / d);
      l.x += (b.x - l.x) * k;
      l.y += (b.y - l.y) * k;
    }
  }
  // The smartphones: loot within their tiles is marked, for the view to ring.
  J.marks = [];
  for (const b of sim.bots) {
    if (b.relic !== 'smartphone' || b.dead) continue;
    for (const l of sim.loot) if (!l.dead && dist(b.x, b.y, l.x, l.y) < RELIC_FX.smartphone.markTiles * T && !J.marks.includes(l.id)) J.marks.push(l.id);
  }
  // The traffic lights (D50): by the mission clock red slows the foes round them, green hastes the crew round them.
  for (const b of sim.bots) {
    if (b.relic !== 'trafficlight' || b.dead || b.downed) continue;
    const w = wearer(sim, b);
    w.lightT -= dt;
    if (w.lightT > 0) continue;
    w.lightT = RELIC_FX.trafficlight.step;
    const now = lightAt(sim.time);
    if (now !== w.light) {
      w.light = now;
      if (now === 0 && sim.r.chance(0.5)) sim.bark(b, 'redlight', true);
    }
    const r = RELIC_FX.trafficlight.r;
    if (now === 0) for (const h of sim.hornets) if (!h.dead && !h.under && !h.air && dist(b.x, b.y, h.x, h.y) <= r + h.r) sim.engine.apply(h, 'slowed', { duration: 0.5, by: b });
    if (now === 2) for (const o of sim.bots) if (!o.dead && !o.downed && dist(b.x, b.y, o.x, o.y) <= r) sim.engine.apply(o, 'haste', { duration: 0.5, by: b });
  }
  // The beacons (D50): the downed robots within reach are shown (ringed on the ground), and a buried cache within reach is found on the map.
  J.found = [];
  for (const b of sim.bots) {
    if (b.relic !== 'beacon' || b.dead || b.downed) continue;
    const reach = RELIC_FX.beacon.tiles * T;
    for (const o of sim.bots) if (o.downed && !o.dead && !J.found.includes(o) && dist(b.x, b.y, o.x, o.y) <= reach) J.found.push(o);
    for (const s of sim.signals) if (s.kind === 'cache' && !s.fake && !sim.fog.found(s) && dist(b.x, b.y, s.at.x * T, s.at.y * T) <= reach) sim.fog.reveal(s.at.x, s.at.y, RELIC_FX.beacon.open);
  }
}

/** The traffic light by the clock: 0 red, 1 amber, 2 green. */
export const lightAt = (time: number) => Math.floor(Math.max(0, time) / RELIC_FX.trafficlight.phase) % 3;

/** Does a smoke detector chirp for this robot: one stands within its reach (a robot's own counts)? Then it does not wait out its reaction to a tell. */
export function chirped(sim: Sim, b: Bot): boolean {
  return sim.bots.some((o) => o.relic === 'smokedetector' && !o.dead && !o.downed && dist(o.x, o.y, b.x, b.y) <= RELIC_FX.smokedetector.reach);
}
/** A tell has just caught `b`: the nearest smoke detector chirps (now and then, so it is a sound and not a stutter). */
export function chirp(sim: Sim, b: Bot) {
  const d = sim.bots.filter((o) => o.relic === 'smokedetector' && !o.dead && !o.downed && dist(o.x, o.y, b.x, b.y) <= RELIC_FX.smokedetector.reach).sort((p, q) => dist(p.x, p.y, b.x, b.y) - dist(q.x, q.y, b.x, b.y))[0];
  if (!d) return;
  const w = wearer(sim, d);
  if (sim.time < w.chirpT) return;
  w.chirpT = sim.time + RELIC_FX.smokedetector.chirp;
  sim.bark(d, 'chirp', true);
}

/** The foe the remote aims at: the one nearest where the Communicator aims, for a wearer that walks with him (crew 0, no order of its own). */
export function remoteTarget(sim: Sim, b: Bot): Hornet | null {
  if (b.relic !== 'remote' || b.crew !== 0 || b.own) return null;
  let best: Hornet | null = null, bd: number = RELIC_FX.remote.aim;
  for (const h of sim.hornets) {
    const d = dist(sim.look.x, sim.look.y, h.x, h.y);
    if (!h.dead && !h.under && !h.air && !h.calm && d < bd) (bd = d), (best = h);
  }
  return best;
}

/** The engine reported a relic's trigger: the speaker's pulse makes the crew within earshot complain; the power bank's discharge draws a heresy; the first shot that hits a quadcopter's robot shoots it down. */
export function relicProc(sim: Sim, source: string, owner: Bot, when?: string) {
  if (source === 'relic:powerbank' && when === 'hit') sim.bark(owner, 'heresy', true);
  if (source === 'relic:sprinkler') sim.events.push({ e: 'junk', what: 'sprinkle', x: owner.x, y: owner.y, r: 100, by: owner });
  if (source === 'relic:quadcopter') {
    wearer(sim, owner).shotDown = true;
    sim.bark(owner, 'shotdown', true);
  }
  if (source !== 'relic:speaker') return;
  // The nearest one within earshot says so, whatever else it was saying.
  const near = sim.crew.filter((o) => o !== owner && dist(o.x, o.y, owner.x, owner.y) < RELIC_FX.speaker.complain).sort((a, b) => dist(a.x, a.y, owner.x, owner.y) - dist(b.x, b.y, owner.x, owner.y))[0];
  if (near) sim.bark(near, 'complain', true);
}

/** The Queen's Crown: a kill hatches a brass hornet for `ttl` s (at most `cap` at once). */
export function hatch(sim: Sim, owner: Bot) {
  const F = RELIC_FX.crown;
  if (sim.bots.filter((x) => !x.dead && x.name === 'Brass Hornet').length >= F.cap) return;
  const b = sim.addBot('guard', 'Brass Hornet', owner.x + sim.r.range(-30, 30), owner.y + sim.r.range(-24, 24), 0);
  b.ttl = F.ttl;
  sim.events.push({ e: 'joined', bot: b });
}

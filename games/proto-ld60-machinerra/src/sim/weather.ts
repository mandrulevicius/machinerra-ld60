/**
 * Passing weather and the anomalies' own rules (P54; `defs/anomalies.ts`). Weather is a schedule of gusts (`Gust`: the warning `warn`, the start
 * of the ease in `on`, the end of the ease out `off`, all in the clock's seconds `dayT`, so a dev `time` jump lands in the right place):
 * `weatherLevel` says where a clock second is in it (`anomalyFx` in `clock.ts` turns that into the multipliers). The rest is what each
 * anomaly does besides those multipliers, stepped here once a frame (`weatherStep`):
 *  - the Oracle and the view hear each gust come (`weather` events: `warn`, `start`, `end`);
 *  - the Sandstorm, once a gust has passed, uncovers buried caches (a brass crate and a signal on the map each; `props.ts` pays them);
 *  - the Mirage lays false rings among the real ones at landing and fades one when the Communicator comes near;
 *  - the Ember Rain marks circles on the ground, then sets what stands in them alight.
 * Add an anomaly with a rule of its own: its function here, its line in `weatherStep` or `weatherInit`, a test in `weather.test.ts`.
 */
import { rng, type Rng } from '../../../../harness/kit/rng';
import { ANOMALIES, CACHES, EMBERS, MIRAGE, T, WEATHER, type AnomalyId } from './defs';
import type { Signal, SignalKind } from './fog';
import { dist } from './geom';
import { addProp } from './props';
import type { Sim } from './sim';
import type { Tele } from './brain';
import { say } from './oracle';

/** One passing of a weather: the warning begins at `warn`, the ease in at `on`, the ease out ends at `off`; `n` its number; the flags are what has been announced. */
export interface Gust { n: number; warn: number; on: number; off: number; told?: boolean; started?: boolean; done?: boolean }
export type WeatherPhase = 'idle' | 'warn' | 'on';
/** A gust's `warn`ing, `start` (the ease in) and `end`; the Sandstorm's `caches` come up; a Mirage ring fades; an ember falls. */
export type WeatherEvent = { e: 'weather'; what: 'warn' | 'start' | 'end'; n: number } | { e: 'weather'; what: 'mirage' | 'caches' | 'ember'; x: number; y: number };

/** A marked circle on the ground, `t` seconds from falling. */
export interface Ember { id: number; x: number; y: number; t: number }

export interface WeatherWorld {
  windows: Gust[];
  embers: Ember[];
  emberT: number;
  n: number;
  r: Rng;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (k: number) => k * k * (3 - 2 * k);

/** The gusts of a weather in a mission that reaches midnight at `midnight` s: `count` of them, one in each slot of the time after the first warning, never overlapping and apart by a few seconds. */
export function schedule(r: Rng, id: AnomalyId, midnight: number): Gust[] {
  const W = ANOMALIES[id].weather;
  if (!W) return [];
  const first = WEATHER.from + WEATHER.warn;
  const slot = Math.max(W.hold + 10, (midnight - first) / W.count);
  const out: Gust[] = [];
  for (let i = 0; i < W.count; i++) {
    const lo = first + i * slot;
    const on = lo + r.range(0, Math.max(0, slot - W.hold - 8));
    out.push({ n: i, warn: on - WEATHER.warn, on, off: on + W.hold });
  }
  return out;
}

export interface WeatherLevel { phase: WeatherPhase; tell: number; ease: number; n: number; left: number; bar: number }
const IDLE: WeatherLevel = { phase: 'idle', tell: 0, ease: 0, n: 0, left: 0, bar: 0 };

/** Where the clock second `t` is in the gusts: warning (`tell` rising to 1), holding (`ease` rising to 1, then falling to 0 at the end), or idle. */
export function weatherLevel(windows: readonly Gust[], t: number): WeatherLevel {
  for (const w of windows) {
    if (t < w.warn || t >= w.off) continue;
    if (t < w.on) return { phase: 'warn', tell: (t - w.warn) / (w.on - w.warn), ease: 0, n: w.n, left: w.on - t, bar: (w.on - t) / (w.on - w.warn) };
    const ease = smooth(clamp01(Math.min((t - w.on) / WEATHER.ease, (w.off - t) / WEATHER.ease)));
    const out = smooth(clamp01((w.off - t) / WEATHER.ease));
    return { phase: 'on', tell: t < w.off - WEATHER.ease ? 1 : out, ease, n: w.n, left: w.off - t, bar: (w.off - t) / (w.off - w.on) };
  }
  return IDLE;
}

export const weatherWorld = (seed: number | string, id: AnomalyId, midnight: number): WeatherWorld => {
  const r = rng(`weather/${seed}/${id}`);
  return { windows: schedule(r.fork('gusts'), id, midnight), embers: [], emberT: 0, n: 1, r };
};

// ---------------------------------------------------------------- the rules

const kinds: SignalKind[] = ['ruins', 'shrine', 'castle', 'pilgrim', 'mast', 'vault'];

/** The Mirage: at landing, a false ring for every two real ones (one in three is false), on open ground away from the lift; never found, only faded. */
function mirageInit(sim: Sim) {
  const n = Math.ceil((sim.signals.length * MIRAGE.share) / (1 - MIRAGE.share));
  const r = sim.weather.r.fork('mirage');
  const have = new Set(sim.signals.map((s) => s.kind));
  const pool = kinds.filter((k) => have.has(k));
  if (!pool.length) return;
  for (let i = 0; i < n; i++) {
    // Clear of the lift and of every other ring, so it reads as a place of its own.
    const rr = r.int(...MIRAGE.r);
    const at = openTile(sim, r, (x, y) => dist(x, y, sim.map.lift.x, sim.map.lift.y) > 14 && sim.signals.every((s) => dist(x, y, s.x, s.y) > s.r + rr * 0.75), 120);
    if (!at) continue;
    sim.signals.push({ id: `mirage${i}`, kind: r.pick(pool), x: at.x, y: at.y, r: rr, at: { x: -9, y: -9 }, fake: true });
  }
}

/** A tile on the map (tile units) that nothing stands on, well inside the edge and satisfying `ok`, in at most `tries` draws. */
function openTile(sim: Sim, r: Rng, ok: (x: number, y: number) => boolean, tries: number) {
  for (let i = 0; i < tries; i++) {
    const x = r.int(4, sim.W - 5), y = r.int(4, sim.H - 5);
    if (sim.blocked((x + 0.5) * T, (y + 0.5) * T) || sim.props.at.has(y * sim.W + x) || !ok(x, y)) continue;
    return { x, y };
  }
  return null;
}

/** A false ring fades once the Communicator is within `MIRAGE.near` tiles of its centre, then is gone. */
function mirageStep(sim: Sim, dt: number) {
  if (!sim.signals.some((s) => s.fake)) return;
  const c = sim.controller, cx = c.x / T - 0.5, cy = c.y / T - 0.5;
  for (const s of sim.signals) {
    if (!s.fake) continue;
    if (s.fade === undefined && dist(cx, cy, s.x, s.y) <= MIRAGE.near) {
      s.fade = 0;
      sim.events.push({ e: 'weather', what: 'mirage', x: (s.x + 0.5) * T, y: (s.y + 0.5) * T });
      say(sim, 'mirage-fade', 'Nothing there. The heat made it up. I did warn you.', 'calm');
    }
    if (s.fade !== undefined) s.fade += dt / MIRAGE.fade;
  }
  sim.signals = sim.signals.filter((s) => !(s.fake && (s.fade ?? 0) >= 1));
}

/** The Sandstorm has passed: two buried caches come up out of the sand, each a signal on the map (`CACHES`). */
export function uncoverCaches(sim: Sim, g: Pick<Gust, 'n'>) {
  const r = sim.weather.r.fork(`caches${g.n}`);
  const c = sim.controller, cx = Math.floor(c.x / T), cy = Math.floor(c.y / T);
  for (let i = 0; i < CACHES.count; i++) {
    const near = (x: number, y: number) => { const d = dist(x, y, cx, cy); return d >= CACHES.near[0] && d <= CACHES.near[1]; };
    const at = openTile(sim, r, (x, y) => near(x, y) && !sim.fog.at(x, y), 80) ?? openTile(sim, r, near, 80);
    if (!at) continue;
    const id = `cache${g.n}_${i}`;
    addProp(sim, { kind: 'crate', material: 'brass', x: at.x, y: at.y, wear: 1 }).cache = id;
    const a = r.range(0, Math.PI * 2), d = Math.max(2, CACHES.r * r.range(0.25, 0.65));
    sim.signals.push({ id, kind: 'cache', x: +(at.x + Math.cos(a) * d).toFixed(2), y: +(at.y + Math.sin(a) * d).toFixed(2), r: CACHES.r, at });
  }
  sim.events.push({ e: 'weather', what: 'caches', x: c.x, y: c.y });
  say(sim, `caches-${g.n}`, 'The wind has moved the sand. Two things are showing on my map now, and neither is a ruin.', 'calm');
}

/** The Ember Rain: circles marked near the Communicator, more as it eases in; each falls after `EMBERS.warn` s and sets alight anything inside. */
function emberStep(sim: Sim, dt: number) {
  const W = sim.weather;
  if (sim.fx.ease > 0.05) {
    W.emberT -= dt;
    if (W.emberT <= 0) {
      W.emberT = EMBERS.every / sim.fx.ease;
      const c = sim.controller, a = W.r.range(0, Math.PI * 2), d = EMBERS.reach * Math.sqrt(W.r.next());
      const x = Math.max(T, Math.min((sim.W - 1) * T, c.x + Math.cos(a) * d)), y = Math.max(T, Math.min((sim.H - 1) * T, c.y + Math.sin(a) * d));
      W.embers.push({ id: W.n++, x, y, t: EMBERS.warn });
    }
  }
  if (!W.embers.length) return;
  for (const e of W.embers) {
    e.t -= dt;
    if (e.t > 0) continue;
    for (const h of sim.hornets) if (!h.dead && !h.under && dist(h.x, h.y, e.x, e.y) <= EMBERS.r + h.r) sim.engine.apply(h, 'burning', { duration: EMBERS.burn });
    for (const b of sim.bots) if (!b.dead && dist(b.x, b.y, e.x, e.y) <= EMBERS.r + 8) sim.engine.apply(b, 'burning', { duration: EMBERS.burn });
    sim.events.push({ e: 'weather', what: 'ember', x: e.x, y: e.y });
  }
  W.embers = W.embers.filter((e) => e.t > 0);
  sim.drainFx();
}

/** The ground the robots keep off: a mark about to fall (`botai.telegraphs`). */
export function weatherTeles(sim: Sim): Tele[] {
  return sim.weather.embers.map((e) => ({ id: `ember${e.id}`, kind: 'patch' as const, x: e.x, y: e.y, r: EMBERS.r }));
}

/** Once at landing (not down a dungeon): what a land anomaly lays on the map. */
export function weatherInit(sim: Sim) {
  if (sim.anomaly === 'mirage') mirageInit(sim);
}

/** Each frame while the clock runs: announce the gusts, and act the anomaly's own rules. */
export function weatherStep(sim: Sim, dt: number) {
  const id = sim.anomaly, t = sim.dayT;
  for (const g of sim.weather.windows) {
    if (!g.told && t >= g.warn) {
      g.told = true;
      sim.events.push({ e: 'weather', what: 'warn', n: g.n });
    }
    if (!g.started && t >= g.on) {
      g.started = true;
      sim.events.push({ e: 'weather', what: 'start', n: g.n });
    }
    if (!g.done && t >= g.off) {
      g.done = true;
      sim.events.push({ e: 'weather', what: 'end', n: g.n });
      if (id === 'sandstorm') uncoverCaches(sim, g);
    }
  }
  if (id === 'mirage') mirageStep(sim, dt);
  if (id === 'emberRain') emberStep(sim, dt);
}

// ---------------------------------------------------------------- dev

/** Dev `weather now`: a gust warns now (and the schedule's own stay). False when the anomaly is no weather. */
export function weatherNow(sim: Sim) {
  const W = ANOMALIES[sim.anomaly].weather;
  if (!W) return false;
  const t = sim.dayT, ws = sim.weather;
  ws.windows = ws.windows.filter((g) => t < g.warn || t >= g.off);
  const on = t + WEATHER.warn;
  ws.windows.push({ n: ws.windows.length + 100, warn: t, on, off: on + W.hold });
  ws.windows.sort((a, b) => a.warn - b.warn);
  sim.refreshFx();
  return true;
}

/** Dev `weather off`: the gust now begun or warned ends (an easing out, or dropped if it has not begun). */
export function weatherOff(sim: Sim) {
  const t = sim.dayT, ws = sim.weather;
  for (const g of ws.windows) {
    if (t < g.warn || t >= g.off) continue;
    if (t < g.on) g.off = g.on = g.warn = -1;
    else g.off = Math.min(g.off, t + WEATHER.ease * weatherLevel([g], t).ease);
  }
  ws.windows = ws.windows.filter((g) => g.off > 0);
  sim.refreshFx();
}

export function weatherSummary(sim: Sim) {
  const f = sim.fx, W = sim.weather;
  return {
    phase: f.phase,
    left: +f.left.toFixed(1),
    gusts: W.windows.map((g) => `${g.n}: warn ${Math.round(g.warn)} on ${Math.round(g.on)} off ${Math.round(g.off)}${g.done ? ' done' : ''}`),
    embers: W.embers.length,
    fake: sim.signals.filter((s) => s.fake).length,
    caches: sim.props.list.filter((p) => p.cache && !p.broken).length,
  };
}

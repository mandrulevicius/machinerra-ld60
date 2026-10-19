/**
 * The mission's clock (defs.ts `DAY`): from mission seconds to phase, hour, twist share and menace; and the sky's colour. Plain functions, no state.
 * Past midnight the berserk steps (`BERSERK`): `berserkMul(step)` is stamped on an enemy at spawn (`Hornet.bz`, so an older one
 * keeps its own; a boss takes the steps so far through `Sim.berserk(h)`), `spawnMul` shortens the hives' interval.
 * A landing's anomaly reaches the day through `dayCfg(anomaly)` / `withAnomaly`, and its live effect is `anomalyFx` (`Sim.fx`).
 */
import { ANOMALIES, BERSERK, DAY, type AnomalyId } from './defs';
import { type Gust, weatherLevel, type WeatherPhase } from './weather';

export type DayPhase = 'morning' | 'day' | 'evening' | 'midnight';
export const PHASES: DayPhase[] = ['morning', 'day', 'evening', 'midnight'];

/** The live-tunable lengths and rates (`sim.cfg` has them). */
export interface DayCfg { morning: number; day: number; evening: number; twistStart: number; stepEvery: number; /** How fast the twisted share rises after dusk (the Blood Moon's 2); 1 when left out. */ twistRate?: number }
/** The day's lengths: the base ones, times the landing's anomaly (`ANOMALIES[...].day`) when one is given. */
export const dayCfg = (anomaly: AnomalyId = 'plain'): DayCfg => {
  const m = ANOMALIES[anomaly].day;
  return { morning: DAY.morning * m.morning, day: DAY.day * m.day, evening: DAY.evening * m.evening, twistStart: DAY.twistStart, stepEvery: BERSERK.every, twistRate: ANOMALIES[anomaly].twistRate };
};
/** The same for an already tuned config (the Sim's `cfg`): its lengths times the anomaly's. */
export const withAnomaly = <T extends DayCfg>(c: T, anomaly: AnomalyId): T => {
  const m = ANOMALIES[anomaly].day;
  return { ...c, morning: c.morning * m.morning, day: c.day * m.day, evening: c.evening * m.evening, twistRate: ANOMALIES[anomaly].twistRate };
};

export interface DayState {
  phase: DayPhase;
  /** Hours on a continuous scale: 6 (start) .. 24 (midnight) .. 24 + `DAY.lastHour`. The dial shows it mod 24. */
  hour: number;
  /** 0 at the start of the day phase to 1 at midnight (0 in the morning, 1 after). */
  dayP: number;
  /** Share of hornets twisted: 0 before dusk, `twistStart` at dusk rising linearly to exactly 1 at midnight (sooner under a `twistRate`), 1 after. */
  twist: number;
  /** Share of new enemies that are menacing: 0 until midnight, rising linearly to exactly 1 at `DAY.menacingHour` on the dial (90 s past midnight), 1 after. Only a menacing enemy takes the berserk steps. */
  menacing: number;
  /** The berserk step past midnight (`BERSERK`): 0 until `stepEvery` s have passed, then one more every `stepEvery` s. No ceiling. */
  step: number;
  /** The menace level: every `BERSERK.perLevel`th step is a level (0 until the sixth step). No ceiling; P13's thresholds read this. */
  level: number;
  /** The level in sixths (steps / `perLevel`), up to `DAY.buffMax`: what `BUFF` multiplies, so a step moves it a sixth of a level, never a whole one. */
  buff: number;
  /** Mission seconds at which the day, evening, boss and midnight begin. */
  at: { day: number; evening: number; boss: number; midnight: number };
}

export const marks = (c: DayCfg): DayState['at'] => ({
  day: c.morning,
  evening: c.morning + c.day,
  boss: c.morning + c.day + c.evening * DAY.bossAt,
  midnight: c.morning + c.day + c.evening,
});

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function dayState(t: number, c: DayCfg): DayState {
  const at = marks(c);
  const H = DAY.hours;
  const past = Math.max(0, t - at.midnight);
  const phase: DayPhase = t < at.day ? 'morning' : t < at.evening ? 'day' : t < at.midnight ? 'evening' : 'midnight';
  const hour =
    phase === 'morning' ? H.start + (H.day - H.start) * (t / c.morning)
    : phase === 'day' ? H.day + (H.evening - H.day) * ((t - at.day) / c.day)
    : phase === 'evening' ? H.evening + (H.midnight - H.evening) * ((t - at.evening) / c.evening)
    : H.midnight + Math.min(DAY.lastHour, past * DAY.hoursPerSec);
  const ev = clamp01((t - at.evening) / (at.midnight - at.evening));
  const step = Math.floor(past / c.stepEvery);
  return {
    phase,
    hour,
    dayP: clamp01((t - at.day) / (at.midnight - at.day)),
    twist: t < at.evening ? 0 : c.twistStart + (1 - c.twistStart) * clamp01(ev * (c.twistRate ?? 1)),
    menacing: clamp01((past * DAY.hoursPerSec) / DAY.menacingHour),
    step,
    level: Math.floor(step / BERSERK.perLevel),
    buff: Math.min(DAY.buffMax, step / BERSERK.perLevel),
    at,
  };
}

/** What the berserk steps give an enemy spawned after step `step` (`BERSERK`; `b` is the live-tunable copy in `Sim.cfg.berserk`): multipliers of its damage, speed and health, and of its ability cooldowns (below 1). */
export interface BerserkMul { dmg: number; speed: number; hp: number; cd: number }
export type BerserkCfg = Pick<typeof BERSERK, 'dmg' | 'speed' | 'hp' | 'cd' | 'spawn' | 'spawnFloor'>;
export const berserkMul = (step: number, b: BerserkCfg = BERSERK): BerserkMul => ({ dmg: 1 + b.dmg * step, speed: 1 + b.speed * step, hp: 1 + b.hp * step, cd: (1 - b.cd) ** step });
/** The hives' spawn interval's multiplier after `step` steps: x`spawn` a step, to no less than `spawnFloor`. */
export const spawnMul = (step: number, b: BerserkCfg = BERSERK) => Math.max(b.spawnFloor, b.spawn ** step);

/** "07:30" for a continuous hour. */
export function clockText(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  const m = Math.floor((h % 1) * 60);
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Mission seconds for a dev `time` argument: a phase name, `boss`, or `hh:mm` (morning hours start the mission; 0..5 are past midnight). */
export function timeOf(spec: string, c: DayCfg): number | null {
  const at = marks(c);
  const s = spec.toLowerCase();
  if (s === 'morning') return 0;
  if (s === 'day') return at.day;
  if (s === 'evening' || s === 'dusk') return at.evening;
  if (s === 'boss') return at.boss;
  if (s === 'midnight') return at.midnight;
  const m = /^(\d{1,2}):?(\d{2})?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]) + Number(m[2] ?? 0) / 60;
  if (h >= 24) return null;
  const H = DAY.hours;
  if (h < H.start) h += 24; // after midnight
  if (h < H.day) return ((h - H.start) / (H.day - H.start)) * c.morning;
  if (h < H.evening) return at.day + ((h - H.day) / (H.evening - H.day)) * c.day;
  if (h < H.midnight) return at.evening + ((h - H.evening) / (H.midnight - H.evening)) * c.evening;
  return at.midnight + (h - H.midnight) / DAY.hoursPerSec;
}

/** The sky: the ambient colour through the day, and how dark it is (0 bright .. 1 deep night; the lamps, the vignette and the dial follow it). */
const SKY: [number, number][] = [
  [6, 0xf0d0a8], // sunrise: pale gold
  [8, 0xffe6c4],
  [11, 0xfff0d8], // high sun
  [15, 0xffe8c4],
  [17, 0xf4bc84], // golden hour
  [19, 0xc88a68], // dusk
  [21, 0x76608a], // violet
  [24, 0x3a4468], // midnight
  [29, 0x242a4c],
];
export const mixColor = (a: number, b: number, k: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
export function sky(hour: number): { ambient: number; night: number } {
  const h = Math.max(SKY[0][0], Math.min(SKY[SKY.length - 1][0], hour));
  let i = 0;
  while (i < SKY.length - 2 && h > SKY[i + 1][0]) i++;
  const [h0, c0] = SKY[i], [h1, c1] = SKY[i + 1];
  const k = (h - h0) / (h1 - h0);
  const dark = clamp01((h - 17) / 7 + Math.max(0, h - 24) / 10);
  return { ambient: mixColor(c0, c1, k), night: dark };
}

/**
 * What the landing's anomaly does at mission second `t` (`Sim.fx`): the multipliers of a foe's aggro range, of the drops, of the
 * Communicator's sight, of a gun's reach, of the steam's regrowth and of the twisted foes' parts, and where a passing weather is.
 * A land anomaly holds all mission (`ease` 1). Weather (`windows`, `sim/weather.ts`) moves through `phase`: `warn` (`tell` 0..1: the wall on
 * the horizon and the rising wind), `on` (`ease` 0..1: the multipliers moving from 1 to their full value, smoothly, never at once, and
 * back at its end), then `idle`. `n` is the window's number, `left` the seconds to its start (warn) or end (on) and `bar` the share of that
 * still to run, 1 to 0 (the HUD's bar). Neutral for a plain sky and underground.
 */
export interface AnomalyFx {
  id: AnomalyId;
  aggro: number;
  drops: number;
  sight: number;
  reach: number;
  steam: number;
  twistedParts: number;
  tell: number;
  ease: number;
  phase: WeatherPhase;
  n: number;
  left: number;
  bar: number;
}
export function anomalyFx(id: AnomalyId, t: number, windows: readonly Gust[] = []): AnomalyFx {
  const a = ANOMALIES[id];
  const w = a.weather ? weatherLevel(windows, t) : null;
  const ease = w ? w.ease : 1;
  const mix = (full: number) => 1 + (full - 1) * ease;
  return {
    id, aggro: mix(a.aggro), drops: mix(a.drops), sight: mix(a.sight), reach: mix(a.reach), steam: mix(a.steam), twistedParts: mix(a.twistedParts),
    tell: w ? w.tell : 0, ease, phase: w ? w.phase : 'idle', n: w ? w.n : 0, left: w ? w.left : 0, bar: w ? w.bar : 0,
  };
}

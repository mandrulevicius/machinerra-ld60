/**
 * The render tier: how much the mission's picture costs on this machine. The player's quality level (the title's and Esc menu's
 * Graphics setting) is the ceiling; the first seconds after a landing are measured, and a slow machine is lowered below it, never
 * raised. Fast machines stay on the player's level and render as before. Consumers: `lightview.ts` (the light cap, the ground's
 * detail). `?render=low|medium|high` and the dev command `render` hold one for testing (still never above the player's level).
 * The numbers (ms thresholds, window lengths) are guesses, untested on other machines (Hextron's `quality.ts` has the same ones).
 */
export type Tier = 'low' | 'medium' | 'high';

const ORDER: Tier[] = ['low', 'medium', 'high'];
const rank = (t: Tier) => ORDER.indexOf(t);

export const lowerTier = (a: Tier, b: Tier): Tier => ORDER[Math.min(rank(a), rank(b))];

/** The ground shader's detail (`uDetail` in groundlive.frag): 2 all passes, 1 fewer octaves and one mote layer, 0 also no motes and no breathing glow. */
export const DETAIL: Record<Tier, 0 | 1 | 2> = { high: 2, medium: 1, low: 0 };

export interface RenderTier {
  level: Tier;
  detail: 0 | 1 | 2;
  /** A light cap to apply (never above the player's own); null leaves the kit's cap alone. */
  lightCap: number | null;
}

/**
 * Frames to let settle after a landing (shaders compile, textures upload), frames per measured window, the median frame time (ms) that
 * costs a tier, the windows in a row that must agree before the tier drops (hysteresis), the clean windows that end the measuring,
 * and the frame length (a hidden tab, a load) that is a stall and is not measured.
 */
export const AUTO = { settle: 90, window: 60, mediumMs: 22, lowMs: 34, confirm: 2, clean: 3, stallMs: 200 };

/** The tier a median frame time (ms) can hold. */
export function tierForFrame(medianMs: number, cfg = AUTO): Tier {
  return medianMs >= cfg.lowMs ? 'low' : medianMs >= cfg.mediumMs ? 'medium' : 'high';
}

export const median = (xs: readonly number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Measures the frames after a landing. `tier` is the highest tier this machine holds, only ever lower; `feed` each frame's ms and it
 * returns the new tier on the frame it drops. A window whose median asks for a lower tier is a strike, `confirm` strikes in a row
 * lower it, a fair window clears the strikes; after a drop it settles again. `restart` (a new landing) settles again and keeps the tier.
 */
export class TierMeter {
  tier: Tier = 'high';
  done = false;
  strikes = 0;
  private cleanRun = 0;
  private seen = 0;
  private samples: number[] = [];

  constructor(private cfg = AUTO) {}

  restart() {
    this.seen = 0;
    this.samples = [];
    this.strikes = 0;
    this.cleanRun = 0;
    this.done = this.tier === 'low';
  }

  feed(ms: number): Tier | null {
    if (this.done || ms > this.cfg.stallMs) return null;
    if (this.seen < this.cfg.settle) { this.seen++; return null; }
    this.samples.push(ms);
    if (this.samples.length < this.cfg.window) return null;
    const want = tierForFrame(median(this.samples), this.cfg);
    this.samples = [];
    if (rank(want) >= rank(this.tier)) {
      this.strikes = 0;
      if (++this.cleanRun >= this.cfg.clean) this.done = true;
      return null;
    }
    this.cleanRun = 0;
    if (++this.strikes < this.cfg.confirm) return null;
    this.tier = want;
    this.strikes = 0;
    this.seen = 0;
    this.done = want === 'low';
    return want;
  }
}

/** `?render=low|medium|high` from a query string, else null. */
export function forcedFrom(search: string): Tier | null {
  const v = new URLSearchParams(search).get('render');
  return v === 'low' || v === 'medium' || v === 'high' ? v : null;
}

/** The tier in force: the lower of the player's level and what was measured (or held); the light cap only when it lowers the player's own. */
export function resolveTier(player: { level: Tier; lights: number }, measured: Tier, held: Tier | null, capOf: (t: Tier) => number): RenderTier {
  const level = lowerTier(player.level, held ?? measured);
  return { level, detail: DETAIL[level], lightCap: rank(level) < rank(player.level) ? Math.min(player.lights, capOf(level)) : null };
}

interface Source { player: () => { level: Tier; lights: number }; capOf: (t: Tier) => number }

let source: Source = { player: () => ({ level: 'high', lights: 32 }), capOf: () => 32 };
let held: Tier | null = null;
let auto = true;
const meter = new TierMeter();

/** Once, at boot: where the player's level and the kit's light caps come from; reads `?render=`. */
export function installTier(player: Source['player'], capOf: Source['capOf'], search = location.search) {
  source = { player, capOf };
  held = forcedFrom(search);
}

/** The render tier now. */
export const renderTier = (): RenderTier => resolveTier(source.player(), meter.tier, held, source.capOf);

/** A landing: measure again (the tier stays as low as it got). */
export const landing = () => meter.restart();

/** Each mission frame with its real time in ms. */
export function measureFrame(ms: number) {
  if (auto) meter.feed(ms);
}

/** Dev: `held` pins a tier (null frees it), `auto` switches the measuring on or off; `reset` forgets what was measured. */
export function setTier(o: { held?: Tier | null; auto?: boolean; reset?: boolean }) {
  if (o.held !== undefined) held = o.held;
  if (o.auto !== undefined) auto = o.auto;
  if (o.reset) { meter.tier = 'high'; meter.restart(); }
}

export const tierState = () => ({ ...renderTier(), player: source.player().level, measured: meter.tier, held, auto, measuring: auto && !meter.done, strikes: meter.strikes });

/**
 * Attention budget (P33; `docs/design/design.md`, "Attention is a budget"), plain TS: how much of the screen's weight a thing
 * gets. A HUD element rests (quiet) when it has nothing new to say and comes forward when its value changes, turns urgent or is
 * hovered. The numbers here are guesses, to be tuned by eye.
 *
 * Give a new HUD element a weight: a `Fader` in `hud.ts` (`see(value)` each frame) and `weigh()` it, which sets `data-w`
 * (`rest`, `up`, the Oil bar's `alarm`); the CSS is the `attention` block at the end of `style.css`. The HUD takes no pointer
 * events, so hover reads one shared pointer (`over()`), not `:hover`. Effects scale with the event (`hitScale`, `pickupSize`).
 *
 * **A click never flashes the UI** (Minos): never `see()` a value the player's own click changes (Steam while firing, the
 * hub's stores while buying: those come forward by `HubHud.storesUp()` for a haul, and by hover). A handler that redraws an
 * open hub panel calls `HubHud.open` again with the same kind, which skips the entrance and keeps the scroll; never add an
 * entrance fade or opacity dip to something a click re-renders (the dialog's tape and levers: `talk.css`).
 */

/** Seconds an element stays forward after its value changes. */
export const HOLD = { change: 4, line: 10 };

/** How much of the Oil bar is low enough to alarm: the screen edge starts to redden at `from` of full oil and is at full strength at empty; `urgent` is where the bar and the cue turn urgent. */
export const ALARM = { from: 0.4, urgent: 0.25 };

/** The Oil alarm, 0 (fine) to 1 (empty). */
export function oilAlarm(frac: number): number {
  if (!(frac < ALARM.from)) return 0;
  return Math.min(1, Math.max(0, (ALARM.from - frac) / ALARM.from));
}

/**
 * One HUD element's weight. `see` is called every frame with a signature of what it shows (its value); a change brings it
 * forward for `hold` seconds. The first sight is not a change. `forward` is true while recently changed, urgent or hovered.
 */
export class Fader {
  private sig: string | number | null = null;
  private left = 0;
  constructor(private hold: number = HOLD.change) {}

  see(sig: string | number) {
    if (this.sig !== null && sig !== this.sig) this.left = this.hold;
    this.sig = sig;
  }

  /** Bring it forward now (a flash, a new line). */
  poke(hold = this.hold) {
    this.left = Math.max(this.left, hold);
  }

  step(dt: number) {
    this.left = Math.max(0, this.left - dt);
  }

  forward(urgent = false, hover = false): boolean {
    return urgent || hover || this.left > 0;
  }
}

/** Which of a speaker's lines stay forward: calm talk goes quiet sooner than a warning. */
export const oracleHold = (tone: 'calm' | 'warn' | 'urgent'): number => (tone === 'calm' ? 8 : 16);

/** A robot's chip on the roster: quiet when well and idle, forward when hurt, fighting or lost. */
export function chipWeight(b: { hp: number; maxHp: number; dead: boolean; state: string }): 'rest' | 'up' {
  if (b.dead || b.hp / b.maxHp < 0.7) return 'up';
  return b.state === 'fight' || b.state === 'down' ? 'up' : 'rest';
}

/**
 * How big a hit's effects are: a tick of burn or an aura is small, a weapon's blow (the shovel hits for 9, a cannon for 22:
 * `defs.ts`) is full size or near it. `dmg` is the damage dealt.
 */
export const HIT = { small: 1, full: 12 };
export function hitScale(dmg: number): number {
  const t = Math.min(1, Math.max(0, (dmg - HIT.small) / (HIT.full - HIT.small)));
  return 0.45 + 0.55 * t;
}

/** A routine pickup (scrap, coal, oil, copper) is said small; a part, a core or a relic reads full. */
export const pickupSize = (kind: string): number => (kind === 'part' || kind === 'core' ? 15 : 12);

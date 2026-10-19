/**
 * The Oracle's lines in a queue (`docs/onboarding.md`: she speaks one line at a time and never cuts one off), plain TS.
 * Reading pace is the player's (Minos, `decisions.md`): a line stays on screen until the next one is due, and the next is due only
 * once the player has had the time to read it (`QUEUE.read`; the clock stops while a panel or the map holds the screen, `paused`).
 * Nothing here takes a line away: with no line behind it, it stays. A line shows when the one before has been typed out and read, and:
 * - a calm line also waits while a fight, a prompt or a banner holds the screen (`busy`, set by `Hud`);
 * - a line that waits longer than its `within` seconds (a calm one: `QUEUE.stale`; a warning: never, unless it asks) is dropped, so a line about a moment never arrives after it;
 * - a warning or urgent line does not wait for the screen, only for the line before it, and goes ahead of calm ones;
 * - a line marked `hold` stays up (and the queue behind it waits) until the Communicator has moved `QUEUE.moved` px.
 * Add a reason to wait: a term in `Hud.busy` (`Play` sets it).
 */
export interface OracleLine {
  text: string;
  tone: 'calm' | 'warn' | 'urgent';
  hold?: boolean;
  /** Seconds it may wait for its turn before it is dropped. */
  within?: number;
  /** A picture beside the text (`SayOpts.icon`). */
  icon?: string;
}

/** Seconds a line is read after it has typed (a base and a time a letter: about 200 words a minute), how long a calm line may wait unless it says, and px that count as having moved (guesses). */
export const QUEUE = { read: { base: 2.5, perChar: 0.06 }, stale: 12, moved: 10 };

const plainLength = (text: string) => text.replace(/<[^>]+>/g, '').length;

/** Words in a text: a line of this many or more is a sentence the player is meant to read, not a label. */
export const SENTENCE = 6;
export const isSentence = (text: string) => plainLength(text) > 0 && text.replace(/<[^>]+>/g, '').trim().split(/\s+/).length >= SENTENCE;

/** Milliseconds a text takes to read once it is up (the queue's read time): a sentence on the screen stays at least this long. */
export const readMs = (text: string) => 1000 * (QUEUE.read.base + QUEUE.read.perChar * plainLength(text));

export interface QueueStep {
  /** The line on screen has finished typing. */
  typed: boolean;
  /** Something holds the screen: a calm line waits. */
  busy: boolean;
  at: { x: number; y: number };
  /** The player cannot be reading (a panel, the map): the read clock and the waiting ages stand still. */
  paused?: boolean;
  /** Time is stopped for a moment of its own: no line comes in by itself, only after `advance` (a press). */
  manual?: boolean;
}

export class OracleQueue<L extends OracleLine = OracleLine> {
  private waiting: { line: L; age: number }[] = [];
  private cur: { line: L; read: number; from: { x: number; y: number }; released: boolean; forced: boolean } | null = null;

  push(line: L) {
    this.waiting.push({ line, age: 0 });
  }

  /** Lines waiting their turn. */
  get length() {
    return this.waiting.length;
  }
  /** The line on screen is a hold line the player has not moved away from yet. */
  get holding() {
    return !!this.cur && !!this.cur.line.hold && !this.cur.released;
  }

  /** The player pressed for the next line: the one on screen counts as read, so the next comes in at the next step (even in `manual`). True if one is waiting for it. */
  advance(): boolean {
    if (!this.waiting.length) return false;
    if (this.cur) this.cur.forced = true;
    return true;
  }

  /** Every frame (see `QueueStep`). Returns the line to start now, if any. */
  step(dt: number, s: QueueStep): L | null {
    const tick = s.paused || s.manual ? 0 : dt;
    for (const w of this.waiting) w.age += tick;
    this.waiting = this.waiting.filter((w) => w.age <= (w.line.within ?? (w.line.tone === 'calm' ? QUEUE.stale : Infinity)));
    const c = this.cur;
    if (c) {
      if (s.typed) c.read += tick;
      if (c.line.hold && Math.hypot(s.at.x - c.from.x, s.at.y - c.from.y) >= QUEUE.moved) c.released = true;
      const read = c.read >= QUEUE.read.base + QUEUE.read.perChar * plainLength(c.line.text) && (!c.line.hold || c.released);
      if (!c.forced && (s.manual || !read)) return null;
    }
    const i = this.waiting.findIndex((w) => w.line.tone !== 'calm');
    const at = i >= 0 ? i : s.busy && !this.cur?.forced ? -1 : 0;
    if (at < 0 || !this.waiting[at]) return null;
    const [{ line }] = this.waiting.splice(at, 1);
    this.cur = { line, read: 0, from: { x: s.at.x, y: s.at.y }, released: false, forced: false };
    return line;
  }
}

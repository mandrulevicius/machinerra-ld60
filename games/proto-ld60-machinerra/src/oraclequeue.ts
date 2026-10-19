/**
 * The Oracle's lines in a queue (`docs/onboarding.md`: she speaks one line at a time and never cuts one off), plain TS.
 * A line shows when the one before has been typed out and read (`QUEUE.read`), and:
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

/** Seconds a line is read after it has typed (a base and a time a letter), how long a calm line may wait unless it says, and px that count as having moved (guesses). */
export const QUEUE = { read: { base: 1.5, perChar: 0.04 }, stale: 12, moved: 10 };

const plainLength = (text: string) => text.replace(/<[^>]+>/g, '').length;

export class OracleQueue {
  private waiting: { line: OracleLine; age: number }[] = [];
  private cur: { line: OracleLine; read: number; from: { x: number; y: number }; released: boolean } | null = null;

  push(line: OracleLine) {
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

  /** Every frame: `typed` the line on screen has finished typing, `busy` something holds the screen, `at` where he stands. Returns the line to start now, if any. */
  step(dt: number, s: { typed: boolean; busy: boolean; at: { x: number; y: number } }): OracleLine | null {
    for (const w of this.waiting) w.age += dt;
    this.waiting = this.waiting.filter((w) => w.age <= (w.line.within ?? (w.line.tone === 'calm' ? QUEUE.stale : Infinity)));
    const c = this.cur;
    if (c) {
      if (s.typed) c.read += dt;
      if (c.line.hold && Math.hypot(s.at.x - c.from.x, s.at.y - c.from.y) >= QUEUE.moved) c.released = true;
      const done = c.read >= QUEUE.read.base + QUEUE.read.perChar * plainLength(c.line.text) && (!c.line.hold || c.released);
      if (!done) return null;
    }
    const i = this.waiting.findIndex((w) => w.line.tone !== 'calm');
    const at = i >= 0 ? i : s.busy ? -1 : 0;
    if (at < 0 || !this.waiting[at]) return null;
    const [{ line }] = this.waiting.splice(at, 1);
    this.cur = { line, read: 0, from: { x: s.at.x, y: s.at.y }, released: false };
    return line;
  }
}

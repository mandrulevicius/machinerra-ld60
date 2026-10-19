/**
 * How long a run has been played (the outro's "time to finish", `outro.ts`): the `playtime` slice. `main.ts` ticks it
 * every frame a game scene runs (`Play`, `Dungeon`, `Ascent`, `Hub`; not the title, a paused scene or a hidden tab).
 * A non-kept slice's write makes the file a save, so before the first arrival at the hub (no save yet) the time waits
 * in `pending` and goes in with the first flush after the save exists. New game resets it with the rest.
 */
import { hub, persist } from './save';

export interface Playtime {
  /** Played so far, ms. */
  ms: number;
  /** The play time when the Evil Oracle's hand-in finished the main quest (the outro shows it); null until then. */
  finished: number | null;
}

export const playtime = persist<Playtime>('playtime', () => ({ ms: 0, finished: null }), {
  sample: { ms: 15_123_000, finished: 14_400_000 },
});

/** The scenes that count as playing. */
export const PLAY_SCENES = ['Play', 'Dungeon', 'Ascent', 'Hub'];
/** A frame longer than this (a stall, a tab coming back) counts as this much. */
const MAX_FRAME = 250;
/** Write at most this often (ms of play). */
const FLUSH = 10_000;

// Not yet written: a run's time between flushes (lost only if the page closes mid-way, at most FLUSH).
let pending = 0;

/** Count a frame of play. */
export function tickPlaytime(delta: number) {
  pending += Math.max(0, Math.min(MAX_FRAME, delta));
  if (pending >= FLUSH) flushPlaytime();
}

/** Put the pending time in the save (only once a save exists). */
export function flushPlaytime() {
  if (!hub.exists() || pending <= 0) return;
  const p = playtime.get();
  playtime.set({ ...p, ms: p.ms + pending });
  pending = 0;
}

/** Played so far, pending included. */
export const playedMs = () => playtime.get().ms + pending;

/** The run is finished: keep its time (the first finish only). Returns the time to show. */
export function finishRun(): number {
  flushPlaytime();
  const p = playtime.get();
  if (p.finished != null) return p.finished;
  const at = playedMs();
  playtime.set({ ...p, finished: at });
  return at;
}

/** 4h 07m, 12m 30s, 45s. */
export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  if (h) return `${h}h ${two(m)}m`;
  if (m) return `${m}m ${two(sec)}s`;
  return `${sec}s`;
}

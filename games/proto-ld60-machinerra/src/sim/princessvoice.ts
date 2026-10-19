/**
 * The Princess's voice on the antenna (P58 E): once she lives in his house she is wireless, so she talks to him in the field a
 * few lines a mission, never in a fight (the attention budget, `docs/design/design.md`): a moment queues a line, and the line
 * waits for a quiet spell (no awake foe near him for `VOICE.quiet` s, the Oracle not speaking) or goes stale. Moments: the
 * landing, dusk, the lift called, a robot down, a boss down. Lines only: the Oracle already points the way home.
 * While she is gone (stolen, P58 D) her idle lines come through as static, at the landing and at dusk only.
 * `voiceStep` runs each step on a land (`Sim.step`); it speaks as an `oracle` event with `who: 'princess'` (the HUD's panel shows
 * her name). Not in a dungeon. Numbers are guesses.
 */
import { rng } from '../../../../harness/kit/rng';
import { PING, nearestUnsearched, ruinLine } from './docks';
import { dist } from './geom';
import type { Sim } from './sim';

/** A few lines a mission; the first some seconds after landing; quiet means no awake foe within `near` px for `quiet` s; a queued line waits `stale` s at most. */
export const VOICE = { max: 4, maxStatic: 2, land: 7, near: 520, quiet: 3, stale: 45, afterOracle: 2, ruinAt: 30 };

/** `ruin`: her Receipts (the city dock's perk, P58 H): once a mission she names the nearest ruin he has not searched (`docks.ts`). */
export type Moment = 'land' | 'dusk' | 'lift' | 'botDown' | 'boss' | 'ruin';
/** Her lines by moment (the writer's; "Come home in one piece" is already hers, Laimonas's). A `ruin` line is made when it is said. */
export const VOICE_LINES: Record<Exclude<Moment, 'ruin'>, string[]> = {
  land: ['Wipe your feet when you are back.', 'I have mapped the way to the lift. It is the one you never take.', 'Do not touch anything sticky. You will touch something sticky.'],
  dusk: ['Come home in one piece. I am not vacuuming up the other pieces.', 'It is getting dark down there. I have the lamp on up here. That is all. That is the message.'],
  lift: ['Kettle is on. That is a figure of speech. We do not have a kettle. Hob has a kettle.', 'I will put the dock light on.'],
  botDown: ['Count them in. You know the rule.', 'Pick that one up. We do not leave things on floors.'],
  boss: ['That one was messy. I approve.', 'Good. Now come home before it gets up. They do not get up. Come home anyway.'],
};
/** Her idle lines (Laimonas's), broken by static while she is gone. */
const IDLE = [
  'I found a bolt under the altar. I am keeping it.',
  'Wipe your feet. The deck is ninety percent sand, leaves and snow, and ten percent you.',
  'Come home in one piece. I am not vacuuming up the other pieces.',
];

/** A line through static: some words lost (seeded), wrapped as the antenna hears it. */
export function staticOf(line: string, seed: string | number): string {
  const r = rng(`static:${seed}`);
  const words = line.split(' ');
  const kept = words.map((w) => (r.chance(0.55) ? w.replace(/[.,]$/, '') : '...'));
  return `(static) ${kept.join(' ').replace(/(\.\.\.\s*)+/g, '... ')}...`;
}

export interface Voice {
  /** She is home (speaks) or gone (static). */
  wife: 'home' | 'stolen';
  queue: { moment: Moment; at: number }[];
  said: number;
  /** Seconds the field round him has been quiet. */
  calm: number;
  seen: { dusk: boolean; lift: boolean; down: number; bosses: number; land: boolean; ruin: boolean };
}

export const makeVoice = (wife: 'home' | 'stolen'): Voice => ({ wife, queue: [], said: 0, calm: 0, seen: { dusk: false, lift: false, down: 0, bosses: 0, land: false, ruin: false } });

/** Is it a fight round him: an awake foe within `VOICE.near`. */
const fighting = (sim: Sim) => {
  const c = sim.controller;
  return sim.hornets.some((h) => !h.dead && !h.sleep && dist(h.x, h.y, c.x, c.y) < VOICE.near);
};

/** Each step: note the moments, and say the oldest waiting line once the field is quiet. */
export function voiceStep(sim: Sim, dt: number) {
  const v = sim.voice;
  if (!v || sim.dungeon) return;
  const seen = v.seen;
  const push = (moment: Moment) => v.queue.push({ moment, at: sim.time });
  if (!seen.land && sim.time >= VOICE.land) (seen.land = true), push('land');
  if (!seen.dusk && (sim.day.phase === 'evening' || sim.day.phase === 'midnight')) (seen.dusk = true), push('dusk');
  if (v.wife === 'home') {
    if (!seen.lift && sim.phase === 'rising') (seen.lift = true), push('lift');
    const down = sim.stats.downed ?? 0;
    if (down > seen.down) (seen.down = down), push('botDown');
    if (sim.bossesDown.length > seen.bosses) (seen.bosses = sim.bossesDown.length), push('boss');
    if (!seen.ruin && sim.perks.has('receipts') && sim.time >= VOICE.ruinAt) (seen.ruin = true), push('ruin');
  }
  v.queue = v.queue.filter((q) => sim.time - q.at <= VOICE.stale);
  v.calm = fighting(sim) || sim.controller.dead ? 0 : v.calm + dt;
  const cap = v.wife === 'home' ? VOICE.max : VOICE.maxStatic;
  if (!v.queue.length || v.said >= cap || v.calm < VOICE.quiet || sim.time < sim.speakUntil + VOICE.afterOracle) return;
  const q = v.queue.shift()!;
  if (v.wife === 'stolen' && q.moment !== 'land' && q.moment !== 'dusk') return;
  const r = rng(`voice:${sim.seed}:${q.moment}`);
  let text: string;
  if (q.moment === 'ruin') {
    const ruin = nearestUnsearched(sim);
    if (!ruin) return; // nothing left to name
    text = ruinLine(sim, ruin);
    sim.ruinPing = { id: ruin.id, until: sim.time + PING };
  } else text = v.wife === 'home' ? r.pick(VOICE_LINES[q.moment]) : staticOf(r.pick(IDLE), `${sim.seed}:${q.moment}`);
  v.said++;
  sim.events.push({ e: 'oracle', id: `princess:${q.moment}`, text, tone: 'calm', who: 'princess' });
}

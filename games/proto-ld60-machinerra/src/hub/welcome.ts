/**
 * What the Oracle says when the lift docks: a comment in her voice, never the inventory. Everything that came up is listed on the
 * mission's results screen (`Play.end`); she only remarks on how rich the haul was, who stayed on the sands, a guest, and what a
 * quest giver will want to hear. No figure and no list goes in her line (Minos).
 */
import type { Haul } from './state';

/** A haul is poor below `poor` and rich from `rich`: scrap and copper together, a part counting `part`. Guesses, to be tuned by ear. */
export const HAUL = { poor: 15, rich: 100, part: 8 };

/** How much the haul is worth for her remark. */
export const worth = (h: Haul) => (h.scrap ?? 0) + (h.copper ?? 0) + HAUL.part * Object.values(h.parts).reduce((a, n) => a + (n ?? 0), 0);

export type Mood = 'poor' | 'fair' | 'rich';
export const mood = (h: Haul): Mood => (worth(h) < HAUL.poor ? 'poor' : worth(h) >= HAUL.rich ? 'rich' : 'fair');

const WORD: Record<Mood, string> = {
  rich: 'A heavy lift, dear. The engineers will sing about it for a week.',
  fair: 'An honest lift.',
  poor: 'A light lift, dear. The sands were stingy today.',
};

/**
 * The line. `lost`: robots of the party that stayed on the sands; `guests`: stranded NPCs who came up; `news`: the names of quest
 * givers who want to hear what the Communicator did.
 */
export function welcome(h: Haul, o: { lost: number; guests: number; news: string[] }): string {
  const parts = ['Welcome home, Communicator.', WORD[mood(h)]];
  if (o.lost > 0) parts.push('Part of the crew stayed on the sands: the workshop can rebuild what was lost.');
  if (o.guests > 0) parts.push('You brought company, pulled out of the sands. Go and say hello.');
  if (o.news.length) parts.push(`And ${o.news.join(' and ')} will want to hear what you did down there.`);
  parts.push('The Oracle is... content.');
  return parts.join(' ');
}

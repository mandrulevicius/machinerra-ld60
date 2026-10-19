/**
 * The time of day aboard (Minos: "first time you come its day, then later random"), plain TS: the first visit (`missions` 0, a new
 * game) is day, each later homecoming one of the three, equally likely (a guess), seeded by the visit so a reload keeps it.
 * `hublight.ts` draws each mood; the dev `hub mood` and the F10 Game tab override this.
 */
import { rng } from '../../../../harness/kit/rng';

export type Mood = 'day' | 'evening' | 'night';
const MOOD_LIST: Mood[] = ['day', 'evening', 'night'];
export const moodOf = (missions = 0): Mood => (missions <= 0 ? 'day' : MOOD_LIST[rng(`hubmood:${missions}`).int(0, MOOD_LIST.length - 1)]);

/**
 * What the land's veil canvas shows, as a key: the same key is the same picture, so the veil is redrawn only when it changes
 * (`HubLight.update`). Nothing before dark; the standing pools; else the spotlights by how far the mood has eased and the frame
 * they are at (`fps` a second). On the kit's low quality setting (`low`) the spotlights hold still: the frame never changes, so
 * the veil is drawn once (and again only while the mood eases).
 */
export const veilKey = (veil: number, spots: number, now: number, low: boolean, fps: number) =>
  veil <= 0.01 ? '' : spots < 0.01 ? 'pools' : `${Math.round(spots * 50)}:${low ? 'still' : Math.floor(now * fps)}`;

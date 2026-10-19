/**
 * The punch cards (`research.ts`) as a persistent slice: the collection, where each is fitted, the picks waiting and the offer.
 * Run state, so a new game starts without cards; kept apart from `research.ts` so its rules stay importable without storage (tests).
 * Also the one place the church, the inventory and a mission read the live state: `researchCtx` (what the church may offer, from the
 * roster) and `liveCards` (the fitted cards as the Sim's sources).
 */
import { cardSources, cleanResearch, freshResearch, waiting, type Ctx, type Research } from './research';
import { hub, persist } from './save';
import { hasCityPerk } from './district';
import { isBotType } from '../sim/specs';
import { roster } from './workshop';
import { questBook } from './talkslice';
import { hasDog } from './companions';

const sample: Research = {
  owned: ['twinNozzle', 'acidEdge', 'overpressure', 'conductors'],
  fit: { 'comm:0': 'twinNozzle', 'comm:2': 'acidEdge', 'type:repairer': 'overpressure' },
  fourth: true,
  credit: 1,
  seen: '4242:1760000000000',
  offer: ['scaldingRounds', 'bootPolish', 'deepDraw'],
};
const slice = persist<Research>('research', freshResearch, { sample, valid: (r) => Array.isArray(r.owned) && !!r.fit && Array.isArray(r.offer) });
/** The cards, cleaned: a save with a card since removed, or one in a slot it cannot use, loads without it. */
export const researchSave = { get: () => cleanResearch(slice.get()), set: (r: Research) => slice.set(cleanResearch(r)) };

/** What the church may offer: the bot types you own a robot of (a wreck is still owned), and the dog's cards once the dog is yours (P42). */
export function researchCtx(): Ctx {
  const types = [...new Set(roster.get().bots.map((b): string => b.role))].filter(isBotType);
  return { types, dog: hasDog(hub.get()), more: (questBook.get().signHung ? 1 : 0) + (hasCityPerk(hub.get(), 'districtChapel') ? 1 : 0) };
}

/** Picks waiting now: the stage's, banked at docking (`bankPick`), and any a quest paid. */
export const picksWaiting = () => waiting(researchSave.get());

/** What the Oracle's script reads (`factsFor`): `picks` waiting, and `research` once there is a pick or a card (her lever shows). */
export function researchFacts(): Record<string, number> {
  const picks = picksWaiting();
  return { picks, research: picks > 0 || researchSave.get().owned.length > 0 ? 1 : 0 };
}

/** The fitted cards as the Sim's sources (`SimOptions.cards`). */
export const liveCards = () => cardSources(researchSave.get());

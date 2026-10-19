/**
 * The Princess's state at home (P58) as its own persistent slice: the deck's prints and dust, her pile of sweepings, the doubled
 * sweepings her repeatable pays, the lands her catalogue holds. Rules in `princess.ts`; kept apart so they stay importable without storage.
 */
import { persist } from './save';
import { freshPrincess, type PrincessState } from './princess';
import { opened } from './landings';
import type { Flags } from './dialog';
import type { HubState } from './state';

export const princessSave = persist<PrincessState>('princess', freshPrincess, {
  valid: (p) => !!p && !!p.deck && Array.isArray(p.deck.trips) && Array.isArray(p.deck.his) && Array.isArray(p.catalogue),
  sample: {
    deck: { trips: [['highPriest', 'sprocket'], ['highPriest', 'hob']], his: [{ b: 'desert', p: [120, 900, 90, 140, 905, 92] }], dust: 2, owed: true },
    pile: { scrap: 4, parts: { 'hornet-head': 1 }, junk: ['toaster'], dust: ['desert'] },
    double: true,
    catalogue: ['desert', 'city'],
    flown: ['jungle', 'desert'],
  },
});

/**
 * What her talk and line read (`factsFor`): she is gone (`princess.stolen`), her catalogue holds every land opened (`catalogueDone`,
 * her line's first step; the Ether is not on the list). The deck adds `cat.riding`, `atDock` (night) and `cat` while talking to her.
 */
export function princessFacts(s: Pick<HubState, 'story'>): Flags {
  const cat = princessSave.get().catalogue;
  const lands = opened(s.story?.bosses ?? []);
  return {
    'princess.stolen': s.story?.wife === 'stolen' ? 1 : 0,
    catalogued: lands.filter((b) => cat.includes(b)).length,
    catalogueDone: lands.every((b) => cat.includes(b)) ? 1 : 0,
  };
}

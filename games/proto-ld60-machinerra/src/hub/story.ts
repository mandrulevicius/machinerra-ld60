/**
 * The main quest (P44, `games/ludum-dare-60/plans/P44-main-quest.md`), plain TS: the Oracle's quest `main`, eleven steps,
 * each unlocking what the game shows next (Laimonas: the inventory first, then the workbench, then your house, the
 * zeppelin's calls, a wife). The biome bosses are the hard steps, in the biomes' order of difficulty (desert, jungle,
 * city, mountains, the Demon Wastes); then the blessing, where the Evil Oracle steals the wife, and the Ether.
 *
 * What a step pays is a perk (`PERKS` in state.ts, read by the Sim) or a feature read off the quest's step (`features`).
 * The Oracle's script (`talk.ts`) moves the quest; its hand-ins read `storyFacts`. Boss kills are kept on the hub's save
 * (`HubState.story`, fed by `arrive` from each haul), so a boss killed before its step still counts.
 *
 * Add a step: a `STORY` row (its `goal` fact, if any, a `storyFacts` entry), its node in the Oracle's script, and what it
 * unlocks (a `Feature` read where it gates, or a perk).
 */
import { DONE, stepOf, type Flags, type Talk } from './dialog';
import type { HubState } from './state';

/** What the main quest opens (beyond perks): read where each gates. */
export type Feature = 'inventory' | 'workbench' | 'house' | 'calls' | 'ether';

export interface StoryStep {
  /** The step as the quest log shows it. */
  task: string;
  /** What finishing it opens, said in the log. */
  reward: string;
  /** A feature it opens (else its reward is a perk, given by the Oracle's script). */
  unlocks?: Feature;
  /** The hand-in: a fact (`storyFacts`) at 1 or more. */
  goal?: string;
  /** Kept out of the quest log until the quest reaches it (the twist after the blessing). */
  secret?: boolean;
}

export const STORY: StoryStep[] = [
  { task: 'Hear the Oracle out', reward: 'Your satchel: the inventory (I)', unlocks: 'inventory' },
  { task: 'Show the Oracle 100 scrap', reward: 'The workbench: crafting and salvage', unlocks: 'workbench', goal: 'scrap100' },
  { task: 'Bring down the Hornet Queen in the desert', reward: 'A house of your own, on a lot', unlocks: 'house', goal: 'boss.hornet' },
  { task: 'Build your house', reward: "The Wanderer's Brass Drop, and the choice of call at the course table", unlocks: 'calls', goal: 'house' },
  { task: 'Bring down the Ironback in the Rustwood Jungle', reward: "The Wanderer's Steam Lance", goal: 'boss.gorilla' },
  { task: 'Bring down Sir Lancelot-9 in the Hollow City, and bring home who he guards', reward: 'A wife', goal: 'wife' },
  { task: 'Bring down Ursa Polaris in the Frostspine', reward: 'Every call one more charge', goal: 'boss.bear' },
  { task: 'Bring down the Harbinger in the Demon Wastes', reward: "The Oracle's blessing", goal: 'boss.drone' },
  { task: 'Bring your wife to the Oracle for the blessing', reward: '...' },
  { task: 'Free the Esteemed Ghost in the Ether', reward: 'Ghost touch: every hit lands on the ethereal', goal: 'ghost', secret: true },
  { task: 'Bring down the Evil Oracle in his church', reward: 'Your wife, home', goal: 'evil', secret: true },
];

/** The steps by number (1-based), for the scripts. */
export const S = {
  hear: 1, scrap: 2, queen: 3, house: 4, ironback: 5, knight: 6, bear: 7, harbinger: 8, blessing: 9, ghost: 10, evil: 11,
} as const;

/** What the main quest has opened so far: a step's feature once that step is done. */
export function features(talk: Talk): Set<Feature> {
  const step = stepOf(talk, 'main');
  const out = new Set<Feature>();
  STORY.forEach((st, i) => {
    if (st.unlocks && (step === DONE || step > i + 1)) out.add(st.unlocks);
  });
  // The Ether opens with the blessing itself (the cut scene), not after it.
  if (step === DONE || step >= S.ghost) out.add('ether');
  return out;
}

/** The facts the Oracle's hand-ins read: 100 scrap held, bosses down, the house, the wife home, the ghost freed, the Evil Oracle down. */
export function storyFacts(s: HubState, scrap = 0): Flags {
  const st = s.story;
  const f: Flags = {
    scrap100: scrap >= 100 ? 1 : 0,
    house: s.stations.home ? 1 : 0,
    wife: st.wife === 'home' ? 1 : 0,
    ghost: st.ghost ? 1 : 0,
    evil: st.evil ? 1 : 0,
  };
  for (const b of st.bosses) f[`boss.${b}`] = 1;
  return f;
}

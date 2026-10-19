/**
 * The Princess's ladder: the Docks (P58 H), a mastery ladder like the Kicker's (`lines.ts`, D33): a step a biome in the order of difficulty,
 * each unlocking the next, a perk a step, and her own title at the end (Keeper of Docks, `titles.ts`). The quest id is `princess`.
 * She looked for a dock for three hundred years; now she collects them. Each land can hide an old charging dock (a small ruin, `DOCK` in
 * `sim/defs/ruins.ts`; `mapgen.ts` rolls it while this ladder asks for one on that land, `questplaces.ts` `dockWanted`): hold E to pry its
 * contacts loose, bring them home, and she fits a ring for it in her own dock. A step counts the docks pried on its land (`stats.docks`).
 *
 * The perks (guesses): Sand in the bearings (her sweepings find one more thing: `SWEEP.more`, `princess.ts`), Moss in the brush (the Main Brush
 * reaches a quarter farther: `PERK_FX.mossBrush`), Receipts (once a mission her voice names the nearest unsearched ruin: `sim/docks.ts`),
 * Frost on the contacts (the relic chance of her sweepings doubles: `SWEEP.frost`). The last dock pays the title alone.
 * The lines are the writer's: brisk, tidy, fond, deadpan.
 */
import { DONE, stepOf, type Talk } from './dialog';
import type { LineDef, StepDef } from './lines';

/** The biomes the ladder walks, in the order of difficulty (biomes.md): one dock each. */
export const DOCK_BIOMES = ['desert', 'jungle', 'city', 'mountains', 'demon'] as const;

/** Her dock's rings (`princessview.ts`): one thin ring for each old dock fitted, in the land's own colour, the first outermost. */
export const RINGS = [0xf2c46a, 0x7ad24a, 0xb08cd8, 0xcfeaff, 0xff8a5a];
/** Docks fitted: the ladder's steps done. */
export function fitted(talk: Talk): number {
  const step = stepOf(talk, 'princess');
  return step === DONE ? DOCK_BIOMES.length : Math.max(0, step - 1);
}

const step = (biome: (typeof DOCK_BIOMES)[number], land: string, s: Pick<StepDef, 'offer' | 'wait' | 'done' | 'reward'>): StepDef => ({
  task: `Pry the contacts off an old charging dock in ${land}`,
  goal: { count: 'docks', n: 1, biome },
  place: 'dock',
  ...s,
});

export const PRINCESS_LINES: Record<string, LineDef> = {
  princess: {
    npc: 'princess',
    title: 'The Docks',
    grants: 'keeperOfDocks',
    ask: 'Do you want anything from the sands, Dot?',
    from: { has: 'wife' },
    steps: [
      step('desert', 'the desert', {
        offer: [
          'I looked for a dock for three hundred years. I would like to see what the old world thought a dock was.',
          { t: 'Every land hides one: a charging dock, ruined, one lamp still lit. Hold your hand to the contacts and pry. The desert first.', act: 'point' },
        ],
        wait: ['A dock in the desert, one lamp lit. Pry the contacts loose and bring them home. It is not stealing. It is retrieval.'],
        done: [
          { t: 'Desert model. Cheap. Charming. It stays.', act: 'nod' },
          'First ring fitted. Sand got into the bearings, so I am obliged to be gracious about it: my sweepings will find one thing more.',
        ],
        reward: { perk: 'sandBearings' },
      }),
      step('jungle', 'the Rustwood Jungle', {
        offer: ['The jungle next. They liked roofs, in the jungle. Find the dock under one.'],
        wait: ['The jungle dock. Under a roof, probably, or what the vines have left of one.'],
        done: [
          'Jungle model. Overgrown. Damp. Someone loved it very much and then stopped coming.',
          { t: 'Moss in the brush. It reaches a quarter farther. I am not cleaning it.', act: 'huff' },
        ],
        reward: { perk: 'mossBrush' },
      }),
      step('city', 'the Hollow City', {
        offer: ['The city. They will have a dock for everything. I want the one for something like me.'],
        wait: ['The Hollow City, a dock, a lamp. Mind the walls; they are the city.'],
        done: [
          'City model. It arrived with a receipt. It arrived with eleven receipts.',
          { t: 'I have read them all. Now I know where things are kept. Once a mission I will tell you where the nearest ruin is that you have not searched. I am not a tour guide.', act: 'shrug' },
        ],
        reward: { perk: 'receipts' },
      }),
      step('mountains', 'the Frostspine', {
        offer: ['The mountain. The cold keeps things. I want one that was kept.'],
        wait: ['The Frostspine dock. Frost on the contacts, I should think. Do not lick it.'],
        done: [
          'Mountain model. Frost on the contacts, which is how a thing ought to be kept.',
          { t: 'I will look harder in what you track in. Relics, I mean. Twice as hard.', act: 'nod' },
        ],
        reward: { perk: 'frostContacts' },
      }),
      step('demon', 'the Demon Wastes', {
        offer: ['The Wastes. The last one. It will be filthy. Bring it anyway.'],
        wait: ['The Wastes dock. Ash in everything, I expect. Wipe your feet twice.'],
        done: [
          'Demon Wastes model. Ash in everything. It was still waiting, with its lamp on.',
          { t: 'Five rings. A ring for every land, and a lamp for every ring. That is a dock.', act: 'nod' },
          { t: 'Keeper of Docks. It is not a rank, it is a job. The lift is a dock too, and now I say so: whoever stands on it charges.', act: 'huff' },
        ],
        reward: {},
      }),
    ],
  },
};

/**
 * The special lines (P42, finishing P38; `games/ludum-dare-60/docs/quests.md` "Special lines"): the sniffer dog, the cat and the Green
 * Shoot. Unlike the NPCs' story lines they are not asked for: each starts itself (`auto`, `autoStart` in `lines.ts`) once the land
 * can hold its place, and its giver hands the steps in on the next talk. The dog and the cat are the Oracle's (the antenna
 * translates, the church keeps the cats); the Shoot is the Expeditioner's.
 *
 * What a step pays is real: the dog and the cat come home with the lift (`companions.ts`), the toy and the boot are quest items in the
 * quest book (`QuestBook.items`), the rewards are perks (`PERKS`), the Good Nose card, titles, and the Greenhouse and Replicator
 * blueprints (`buildings.ts` `GATE`). Lines are quests.md's, with each `beat` spoken by the giver; the waiting lines are the builder's.
 * Add a special line: one entry here, the place it needs in `sim/placequest.ts`, its `questActive` case in `questplaces.ts`.
 */
import type { Choice, Node } from './dialog';
import type { LineDef } from './lines';

export const SPECIAL_LINES: Record<string, LineDef> = {
  dog: {
    npc: 'highPriest',
    title: 'Good Boy',
    grants: 'goodBoysFriend',
    kind: 'story',
    auto: { min: ['missions', 2] }, // quests.md: "mission 3+"
    steps: [
      {
        task: 'Find the Kennel and bring the dog home',
        goal: { count: 'dogHome', n: 1 },
        place: 'kennel',
        offer: [
          'The antenna has been catching a sound, Communicator, and I do not like it. It is a bark. A real one, on the wind, from a place with a plaque. The plaque says GOOD BOY.',
          'It is a Kennel, out there somewhere, one land in three. There is a mound in the yard the antenna warms to. Dig it, and bring what comes out to the lift. The spiders will want it too.',
        ],
        wait: ['The Kennel, Communicator. A doghouse, a mound, a lot of crawlcams. Dig, and walk the dog to the lift.'],
        done: [
          '(A plaque on the ruin: GOOD BOY. It says "Woof." The antenna, translating: "You. Yes. You.")',
          'I do not understand dogs. I understand that it has chosen you. It will go down the lift with you now, and tell you where it smells things.',
        ],
        reward: { perk: 'companionDog' },
      },
      {
        task: 'Dig three mounds where the dog points',
        goal: { count: 'dug', n: 3 },
        offer: ['It stands with its nose out and its tail stiff, and the antenna says: "Hole."', 'It wants you to dig. I would not, but I am not a dog. Three mounds, where it points, and hold the use key over each.'],
        wait: ['Three holes, Communicator. Where the dog points. Hold {use} at the mound.'],
        done: ['Three holes. It is extremely pleased with you. It can smell half as far again, now, which it is also pleased about.'],
        reward: { perk: 'dogNose' },
      },
      {
        task: 'Bring home the Squeaky Toy',
        goal: { fact: 'item.toy', n: 1 },
        offer: ['There is a toy buried out there. The dog keeps pointing at one particular mound and then looking at you as if you were slow.', 'Find it. It will point harder the closer you come.'],
        wait: ['A toy, Communicator, in a mound. The dog knows which. It is the first mound of a heap, if that helps. It is the only help I have.'],
        done: [
          '(squeak) (squeak) (squeak)',
          'That relic screams when it is bitten. It is the most honest machine I have ever met. The dog will not be parted from it.',
          'The antenna wants a name for the dog. Say it when you like; I will put the lever in my menu.',
        ],
        reward: { card: 'goodNose' },
      },
    ],
  },
  cat: {
    npc: 'highPriest',
    title: 'It Follows the Loot',
    grants: 'catsButler',
    kind: 'story',
    auto: { min: ['missions', 1] }, // "a stray on some lands"
    steps: [
      {
        task: 'Win the stray over with scrap',
        goal: { count: 'catTamed', n: 1 },
        place: 'stray',
        offer: [
          'There is a stray out on the sands, one land in three: a robot cat with a bad ear and a grudge. The antenna has nothing to translate. The cat is not talking to you.',
          'It looks at your scrap. Then at you. Then at your scrap. Let it eat three gobs, if it will, and it may decide you are acceptable.',
        ],
        wait: ['The stray, Communicator. Three gobs of scrap, left lying near it. Do not pick them up first.'],
        done: ['Her name is Rumba, the antenna says, or something near it. She followed the loot home, and she does not follow people, so I take it as a compliment to the loot. She will be here when you are.', 'She leaves five scrap with every return. Cats do that. Do not ask me how.'],
        reward: { perk: 'companionCat' },
      },
      {
        task: 'Feed the cat at home, three dinners',
        goal: { fact: 'catDinners', n: 3 },
        offer: ['Rumba wants feeding at home. Five scrap a dinner, three dinners. Never a can: a can is a life.', 'Ask me about the cat when you have the scrap, and I will set the bowl down.'],
        wait: ['Three dinners, Communicator, five scrap each. The bowl is by the course table. Rumba is not.'],
        done: ['(Eats. Knocks a cog off the course table. Watches it roll.) Sprocket calls across the deck: "That was a load-bearing cog, dear."'],
        reward: {},
        levers: [{ text: 'Feed Rumba (5 scrap).', if: { min: ['scrap', 5] }, do: [{ add: 'catDinners' }, { give: { take: { scrap: 5 } } }], go: 'cat.fed' }],
      },
      {
        task: 'Build the Replicator',
        goal: { fact: 'replicator', n: 1 },
        offer: ['The Planner has a blueprint for a Replicator: it copies whatever sits in it. Someone will leave Rumba in it. I am almost certain.'],
        wait: ['A Replicator, Communicator. The Planner will offer the blueprint now that there is a cat to put in it.'],
        done: [
          'The Replicator copies whatever is sat in it. Who left the cat in the Replicator?',
          'There are cats in my church. I count them. I will tell you how many each time you come home, and you will wish I would stop.',
          'The Planner says there are cats on every roof, and that she did not zone for this. The cats do not care.',
        ],
        reward: {},
      },
    ],
    nodes: {
      'cat.fed': { say: ['Rumba eats. She looks at you. She looks at the course table, and the nearest cog.'], go: 'menu' },
    },
  },
  shoot: {
    npc: 'expeditioner',
    title: 'The Green Shoot',
    grants: 'keeperOfTheShoot',
    kind: 'story',
    auto: [{ min: ['missions', 1] }, { has: 'aboard.expeditioner' }], // "mission 2+"; the giver must be aboard to hand it in
    steps: [
      {
        task: 'Find the Little Compactor and bring home what it holds out',
        goal: { fact: 'item.boot', n: 1 },
        place: 'compactor',
        offer: ['A small machine, at the end of the sands, stacks cubes of crushed things into towers. Held out something, it has, to nobody, for a long time.', 'Find it, you should. One land in three, it stands.'],
        wait: ['The cube towers, find. Careful, bring back what it holds. Do not drop it, the Oracle said.'],
        done: ['(You hold out the boot. In it, a green shoot, a little crushed, entirely alive. The Expeditioner has stopped talking, which has not happened before.)'],
        reward: {},
      },
      {
        task: 'Give the Expeditioner the boot',
        goal: { fact: 'shootGiven', n: 1 },
        offer: ['Hand it here. Gently. Gently!'],
        wait: ['The boot, give me. Put the shoot in the window, I will.'],
        done: ['A tree. A whole future tree, this is. Forests, from this, there will be. Wood, forever. Do not tell the Oracle I wept.', 'More scrap my expeditions will bring, with something growing at the end of the day.'],
        reward: { perk: 'shootGrows' },
        levers: [{ text: 'Give the boot to the Expeditioner.', if: { has: 'item.boot' }, do: [{ set: 'shootGiven' }], go: 'shoot.given' }],
      },
      {
        task: 'Pay 30 scrap for the shoot’s water',
        goal: { hand: 'scrap', n: 30 },
        offer: ['Thirsty, it is. Scrap, thirty, for tubing and a condenser to rinse it through.'],
        wait: ['Thirty scrap, for the condenser. Water, a growing thing wants.'],
        done: ['Water! Into a living thing! On purpose! The first water this ship has carried in a century. Mind it.', 'The Planner has drawn it up already: a Greenhouse. A can of oil each mission, from a thing that grows.'],
        reward: { perk: 'greenhousePlans' },
      },
    ],
    nodes: {
      'shoot.given': { say: ['(The shoot is lifted out of the boot like a held breath.)'], go: 'menu' },
    },
  },
};

/** The dog's names (quests.md `dog.3`): the flag `dogName.<id>` is set by the lever. */
export const DOG_NAMES: Record<string, string> = { bolt: 'Bolt', sirSniffs: 'Sir Sniffs', firmware: 'Firmware' };
/** The name the Communicator gave the dog, from the talk flags. */
export const dogNameOf = (flags: Record<string, number>): string => Object.entries(DOG_NAMES).find(([id]) => flags[`dogName.${id}`])?.[1] ?? 'The dog';

/** The Oracle's naming of the dog, once its line is done: merged into her menu (`talk.ts`). */
export const DOG_NAMING: { choices: Choice[]; nodes: Record<string, Node> } = {
  choices: [{ text: 'About the dog’s name.', if: [{ quest: 'dog', step: 'done' }, { not: 'dogNamed' }], go: 'dog.name' }],
  nodes: {
    'dog.name': {
      say: ['(The antenna, translating: "Name.")', 'It wants one. I would not presume.'],
      choices: [
        { text: 'Bolt.', do: [{ set: 'dogName.bolt' }, { set: 'dogNamed' }], go: 'dog.named' },
        { text: 'Sir Sniffs.', do: [{ set: 'dogName.sirSniffs' }, { set: 'dogNamed' }], go: 'dog.named' },
        { text: 'Firmware.', do: [{ set: 'dogName.firmware' }, { set: 'dogNamed' }], go: 'dog.firmware' },
      ],
    },
    'dog.named': { say: ['(The antenna: "Yes.") It has a name. I will pretend I approved.'], go: 'menu' },
    'dog.firmware': { say: ['No.', '(The antenna: "Yes.") It has a name, and it is Firmware, and I have lost.'], go: 'menu' },
  },
};

/**
 * The NPCs' story lines (P38), data from `games/ludum-dare-60/docs/quests.md` ("NPC lines"): three steps a giver, each opened by
 * the acts (`acts.ts`; the relationship table), the last one earning the title. They sit beside Laimonas's mastery ladders
 * (`lines.ts`, kept as built): the quest id is `<npc>.story`, `LINES` holds both and `lineScript` builds both the same way.
 *
 * **Rewards are what the game has.** quests.md's rewards that name a system not built (the Kettle Mortar, a rare blueprint,
 * Mother's Whistle, kick cone, ...) are paid in an item, a card, a pick or a perk that exists, marked "guess" below; the title stays.
 * The lines are the writer's; the offers, hand-ins and the Oracle's words are quests.md's, the waiting and locked lines are guesses.
 * Add a step: one `StepDef` (goal kinds: `lines.ts`); a counter it needs: `sim/questcount.ts` or the fact in `questfacts.ts`.
 */
import type { LineDef } from './lines';

const after = (act: number, what: 'open' | 'done') => ({ has: `act.${act}.${what}` });

export const STORY_LINES: Record<string, LineDef> = {
  'sprocket.story': {
    npc: 'sprocket',
    title: "Mother Sprocket's Patterns",
    grants: 'shepherdOfBrass',
    kind: 'story',
    ask: 'Is there something you want done, dear?',
    steps: [
      {
        task: 'Give a robot a calling at the workshop',
        goal: { fact: 'specialised', n: 1 },
        offer: ['One bot is a pet, dear. Two is a crew.', "And a bot out twice and home twice has character. Give one a calling: I've a pattern for each kind."],
        wait: ['A calling, dear. Promote one of the bots at the bench.'],
        done: ['There. Insufferable now. They always are, after.', "And I've traced the patterns: the next bodies come off cheaper."],
        reward: { perk: 'cheapBodies' }, // guess for "hub.botBodyCost -20%": bodies cost a fifth less scrap
      },
      {
        task: 'Bring Sprocket four different kinds of part',
        goal: { hand: 'parts', n: 4, only: 'kinds' },
        open: after(1, 'open'),
        lock: ['Not yet, dear. Get me started on the crew first: two bots out, two bots home on one lift.'],
        offer: ['Every part is a word, dear. Hornet head, stinger, wing. I need four different words to write the backwards patterns.', "A gatherer who starts fires. A repairer who un-repairs. Don't tell the Oracle."],
        wait: ['Four different kinds, dear, one of each. I am not fussy. I am a little fussy.'],
        done: ["Backwards patterns. Lovely. If anyone asks, these are 'traditional'."],
        reward: { boost: 'auto' },
      },
      {
        task: 'Bring 5 robots home on one lift',
        goal: { best: 'saved', n: 5 },
        open: after(1, 'done'),
        lock: ['Not yet, dear. First show me a crew can come home: two bots, both on the lift.'],
        offer: ["Communicators lose bots like socks. Bring me five home on one lift and I'll believe you're different."],
        wait: ['Five, on one lift. Carried counts. I count.'],
        done: ['Five. On one lift. All of them. I counted twice.', { t: "You're a menace who got lucky five times. Same thing, in this family.", act: 'laugh' }],
        reward: {},
      },
    ],
  },
  'hob.story': {
    npc: 'hob',
    title: "Hob's Barrels",
    grants: 'midnightGunner',
    kind: 'story',
    ask: 'ANY WORK THAT NEEDS A BARREL?',
    steps: [
      {
        task: 'Kill 25 machines with a gun',
        goal: { count: 'gunKills', n: 25 },
        offer: ['Shovels are for graves, Communicator. GUNS are for staying out of them.', "Twenty-five with a barrel. Then I'll trust you with five."],
        wait: ['TWENTY-FIVE! WITH A BARREL! The shovel does not count.'],
        done: ['RIVET SCATTER. Five rivets, one pull. Point it at a problem.'],
        reward: { item: 'rivetScatter' },
      },
      {
        task: 'Bring Hob 2 arm parts off elite machines',
        goal: { hand: 'parts', n: 2, only: 'eliteArms' },
        open: after(2, 'open'),
        lock: ['COME BACK WHEN YOU HAVE TWO BOTS OUT AND TWO HOME. THE BIG ONES CAN WAIT.'],
        offer: ['Elite arms! Stingers, scythes, cannons: the good ones, off the big ones. Two of them.', "I'll put a second lug on every gun. And I'll build you the kettle."],
        wait: ['TWO ARMS! OFF THE BIG ONES! A STINGER, A SCYTHE, A CANNON!'],
        done: ['The kettle: lobs over rocks, lands in a boil. Mind the spout.'],
        reward: { item: 'kettleScalder', lugs: 2 }, // the second lug on every weapon (P57); guess: quests.md's Kettle Mortar is not built, the Kettle scalder is the nearest gun
      },
      {
        task: 'Bring down a boss after midnight',
        goal: { count: 'bossNight', n: 1 },
        open: after(2, 'done'),
        lock: ['THE QUEEN FIRST. THEN WE TALK ABOUT MIDNIGHT.'],
        offer: ['Anyone can shoot a queen at teatime. I want one dropped PAST MIDNIGHT, when the eyes come out.', "Do that and I'll make the gun that likes the dark."],
        wait: ['ANY BOSS. PAST MIDNIGHT. I DO NOT CARE WHICH.'],
        done: ['The worse it gets out there, the harder it hits. Like me.'],
        reward: {},
      },
    ],
  },
  'gasket.story': {
    npc: 'gasket',
    title: "Dr. Gasket's Splendid Specimen",
    grants: 'patchworkSaint',
    kind: 'story',
    ask: 'Any patients on your mind, doctor?',
    steps: [
      {
        task: 'Bring Dr. Gasket 2 pairs of wings',
        goal: { hand: 'parts', n: 2, only: 'wings' },
        offer: ['Wings! Lovely membranes. Bring me two and I will make you legs that remember flying.', 'Yes, a bot could wear them instead. Choices, choices. That is medicine.'],
        wait: ['Two pairs of wings. Hornets, swarmers, kites: they all have them.'],
        done: ['Legs on the shelf! Some assembly required. Then some more assembly.'],
        reward: { item: 'springHeels' }, // guess for "augments.legs": a pair of leg pieces
      },
      {
        task: 'Stay a minute past midnight, then ride the lift home',
        goal: { best: 'pastMidnight', n: 60 },
        open: after(4, 'open'),
        lock: ['Not yet. I want to see your heart under strain, but let us wait until the castle has been dealt with, hm?'],
        offer: ['I need to see a heart under strain. Yours. A full minute past midnight, then come home.'],
        wait: ['A full minute of midnight, and then the lift. Come home, mind. I want the data and the patient.'],
        done: ["Sixty seconds of midnight and your pump never skipped. Splendid. I've built a better one."],
        reward: { item: 'gasketHeart' },
      },
      {
        task: 'Fit all six body slots',
        goal: { fact: 'augments', n: 6 },
        open: after(4, 'done'),
        lock: ['Not yet. Splendid things come to those who wait for the Harbinger to fall.'],
        offer: ["Six of mine in one chassis. Do that and you're more me than you."],
        wait: ["Head, arm, core, legs, rear, pack. Six, all fitted. It's splendid."],
        done: ["Six! I've put hinges on everything. Swap them when you like."],
        reward: {},
      },
    ],
  },
  'expeditioner.story': {
    npc: 'expeditioner',
    title: 'The Far Maps',
    grants: 'farWalker',
    kind: 'story',
    ask: 'Anything out there you want charted?',
    steps: [
      {
        task: 'Leave a robot aboard and send it out on an expedition',
        goal: { fact: 'expeditions', n: 1 },
        offer: ['Idle bots, idle minds. Out, they should go.', 'Leave one aboard when you land. Send it, I will.'],
        wait: ['Leave a bot aboard when you land, and tell me. Send it out, I will.'],
        done: ['Back, they are! In the window, look: their camp. Small, it is. Proud, they are.'],
        reward: { scrap: 60 }, // guess: the camp in the window is not built; expedition scrap is the Cathedral's and the Shoot's
      },
      {
        task: 'Bring the Expeditioner 40 copper for a tram',
        goal: { hand: 'copper', n: 40 },
        open: after(3, 'open'),
        lock: ['Rails, I dream of. Ready, the deck must be first: two stations and a building, there must be, and the Queen down.'],
        offer: ['Rails, I dream of. Forty timbers, and a tram on the girders, we will have.'],
        wait: ['Forty copper, bring. A tram, it will become.'],
        done: ['Drawn up, it is. Ding ding, the tram will go.'],
        reward: { perk: 'tramPlans' }, // quests.md: the Tram Line's blueprint joins the Planner's offers
      },
      {
        task: "Find every place on one land",
        goal: { count: 'placesAll', n: 1 },
        note: (s) => `${s.placesFound ?? 0} of ${s.placesTotal ?? '?'} places found`,
        place: 'cairn',
        open: after(3, 'done'),
        lock: ['Not yet. A dock in pencil first: two stations, a building, and the Queen down.'],
        offer: ["Five secrets, every land hides. All of one land's, find, and walk with you my maps will.", 'At the rim of each land a cairn there is, where the last crew turned back. Plant the flag there, and every secret of that land shows, it will.'],
        wait: ["Every place of one land, find. At the rim, a cairn, there is: plant a flag, and the map shows all."],
        done: ['Far Walker, you are. One more land, I will chart for you.'],
        reward: { chart: 1 },
      },
    ],
  },
  'cityPlanner.story': {
    npc: 'cityPlanner',
    title: 'Ground Broken',
    grants: 'architect',
    kind: 'story',
    ask: 'Any plans that need a hand?',
    steps: [
      {
        task: 'Put up a building on the deck',
        goal: { fact: 'buildings', n: 1 },
        offer: ['A city is famous for one thing, then two, then it is insufferable. Let us begin.', 'Your house will do. Or any of the Wanderer\'s improvements. A building of note, minimum. I have a form.'],
        wait: ['One building on a lot. Your house, or one of the Wanderer\'s improvements. Is that so much to ask?'],
        done: ['Ground broken. Figuratively; we are in the sky.'],
        reward: { scrap: 60 }, // guess: "two more lots opened" has no meaning while every lot is open
      },
      {
        task: 'Bring the City Planner 100 copper for the big table',
        goal: { hand: 'copper', n: 100 },
        open: after(3, 'open'),
        lock: ['Not yet. The drawings need a bigger table, but the table needs a deck worth drawing: two stations, a building, the Queen down.'],
        offer: ['Some drawings need a bigger table. The table needs a hundred timbers. Do not ask why; it is a very good table.'],
        wait: ['A hundred copper, for the table. It is a very good table.'],
        done: ['Three plans I have never dared to draw. Pick wisely. Or boldly. Ideally both.'],
        reward: { perk: 'rareBlueprints' }, // quests.md: three rare blueprints join the offers (the Extra buildings, `buildings.ts` `GATE`)
      },
      {
        task: 'Have 4 buildings standing in the D-city',
        goal: { fact: 'cityBuildings', n: 4 },
        open: after(3, 'done'),
        lock: ['Not yet. A skyline wants the deck finished first.'],
        offer: ['Four buildings standing. Then it is no longer a deck with ambitions. It is a skyline.'],
        wait: ['Four buildings, in the window. Standing, not scaffolding.'],
        done: ['A skyline! And for you, the drawing I have kept under my desk for forty years.'],
        reward: { perk: 'aqueductPlans' }, // quests.md: the Grand Aqueduct's blueprint
      },
    ],
  },
  'kicker.story': {
    npc: 'kicker',
    title: 'Friends Are Heavy',
    grants: 'theBoot',
    kind: 'story',
    ask: 'Is there a question to be answered with a boot?',
    steps: [
      {
        task: 'Kill 10 machines by crash',
        goal: { count: 'crashKills', n: 10 },
        offer: ['A kick is a question. The rock is the answer. Ten times, let the rock answer.', 'A wall is a rock that thinks it is safe. Kick a friend into it. Kick an enemy into it. The wall learns.'],
        wait: ['Ten. By crash. The rock answers.'],
        done: ['Better. Shine the question.'],
        reward: { card: 'bootPolish' },
      },
      {
        task: 'Kick one of your robots into a boss',
        goal: { count: 'botBossKicks', n: 1 },
        open: after(4, 'open'),
        lock: ['Not yet. The rock first. The castle after.'],
        offer: ['Your friends are heavy. Use them.'],
        wait: ['A friend. Into a boss. Kick it.'],
        done: ['They roll. It falls. That is bowling.'],
        reward: { picks: 1 }, // guess: quests.md's Bowling Season card is not made; a free research pick
      },
      {
        task: 'Kill an elite machine by crash',
        goal: { count: 'eliteCrashKills', n: 1 },
        open: after(4, 'done'),
        lock: ['Not yet. When the castle is quiet.'],
        offer: ['One more. A big one. Let it die on stone, not steel.'],
        wait: ['A big one. A crash. Stone, not steel.'],
        done: [{ t: 'Now your kick is a wall.', act: 'nod' }, 'Good kick.'],
        reward: {},
      },
    ],
  },
  'trader.story': {
    npc: 'trader',
    title: 'No Refunds',
    grants: 'valuedCustomer',
    kind: 'story',
    ask: 'Anything I can sell you, friend?',
    steps: [
      {
        task: 'Sell the Trader 5 spares',
        goal: { fact: 'sold', n: 5 },
        offer: ['Two toasters? Nobody needs two toasters. Well. I need two toasters. Bring me five spares and I will start baking.'],
        wait: ['Five spares, friend, sold over the stall. Parts, relics: I am not fussy.'],
        done: ['Biscuits! Honest brass biscuits. Do not eat the foil. The foil is the biscuit.'],
        reward: {},
      },
      {
        task: 'Buy 3 things off the Trader\'s shelf',
        goal: { fact: 'bought', n: 3 },
        lock: ['Soon, friend.'],
        offer: ["Three sales and you're a regular, friend. Regulars see the special shelf."],
        wait: ['Three purchases, friend. Parts, gear, anything on the shelf.'],
        done: ['Star oil. One drop and you see the whole land from above. Side effects include seeing the whole land from above.'],
        reward: {},
      },
      {
        task: 'Hear the princess on star oil',
        goal: { fact: 'oilFragments', n: 1 },
        open: after(5, 'open'),
        lock: ['Not yet, friend. When the castle is quiet, you will want the special shelf.'],
        offer: ["That beeping you're chasing? Star oil gets you above the noise. I'm not saying buy it. I'm saying it's on the shelf."],
        wait: ["Star oil, friend, drunk on the sands, and you listen. I'm not saying buy it."],
        done: ["She talked? On MY star oil? Put that on a sign. 'Reunites lovers. No refunds.'"],
        reward: {},
      },
    ],
  },
  'highPriest.story': {
    npc: 'highPriest',
    title: 'The Old Doctrine',
    grants: 'theFaithful',
    kind: 'story',
    ask: 'Is there anything the church needs, Oracle?',
    from: after(1, 'open'),
    steps: [
      {
        task: 'Tithe 300 scrap to the church',
        goal: { hand: 'scrap', n: 300 },
        offer: ['The church runs on faith, and faith runs on scrap. Three hundred, Communicator.', 'In return, when the dreams I read you are dull, I will dream again.'],
        wait: ['Three hundred scrap, Communicator. Faith is patient. I am less so.'],
        done: ['Received. You may now refuse my dreams once a visit, like a proper teenager.'],
        reward: { perk: 'dreamAgain' },
      },
      {
        task: 'Climb 3 signal masts',
        goal: { count: 'use.mast', n: 3 },
        open: after(2, 'done'),
        lock: ['Not yet. Deal with the queen first.'],
        offer: ['The masts were the old world\'s steeples. Climb three and tell me what the sky says.'],
        wait: ['Three masts, Communicator. They stand on every land. Climb them.'],
        done: ['It says the same as ever: that you climb things you should not. Carry one more can. For my nerves.'],
        reward: { perk: 'oracleCans' },
      },
      {
        task: 'Go home when the Oracle says, three times',
        goal: { fact: 'obeyed', n: 3 },
        open: after(4, 'done'),
        lock: ['Not yet.'],
        offer: ['I suggest leaving. You never leave. I have suggested it {adviceIgnored} times.', 'Three times, when I say go, go. Indulge your mother.'],
        wait: ['Three times, when I say go, go: ride the lift within twenty seconds of my advice.'],
        done: ['Three times. I wept a little. Oil, mostly.'],
        reward: {},
      },
    ],
  },
  // P58 C: the Princess's own line, three steps (her relationship track and the Homing Signal wait for P52). The writer's lines.
  'princess.story': {
    npc: 'princess',
    title: 'Dock Found',
    kind: 'story',
    ask: 'Anything I can do for you, Dot?',
    from: { has: 'wife' },
    steps: [
      {
        task: 'Bring home something from every land you have opened',
        goal: { fact: 'catalogueDone', n: 1 },
        offer: ['The Inventory of Everything. Something from every land you have opened: a part, a relic, whatever the place is made of.', { t: 'For the map. And because you would only lose them.', act: 'huff' }],
        wait: ['Something from every land you have opened, brought home while I am here. I keep a list. It is not finished.'],
        done: ['Catalogued. Every land a drawer, every drawer labelled, every label mapped.', { t: 'It is the tidiest the world has been in three hundred years.', act: 'nod' }],
        reward: {},
      },
      {
        task: 'Come home with every robot you took, none downed',
        goal: { best: 'clean', n: 1 },
        offer: ['A Clean Return. Everyone you take down comes back up, and nobody lies down on the way.', { t: 'Count them out, count them in. I learned it from Sprocket.', act: 'nod' }],
        wait: ['All of them back up, and none of them lying down on the way. I will count.'],
        done: ['All of them. Standing. I counted, then Sprocket counted, then I counted again because she counts with her fingers.'],
        reward: {},
      },
      {
        task: 'Talk to her at her dock, at night',
        goal: { fact: 'atDock', n: 1 },
        open: { has: 'evil' },
        lock: ['Not yet. Ask me again when I am home for good.'],
        offer: ['Come and see me at my dock. At night. I will be charging; you will be sentimental.'],
        wait: ['At night, at my dock. Bring nothing. Wipe your feet.'],
        done: [
          'Cleaning complete.',
          'For three hundred years I said "returning to dock", and there was no dock. I circled. I mapped the inside of a saddlebag eleven thousand times.',
          { t: 'A dock is not a charger. A dock is where someone knows the shape of you and leaves the space.', act: 'shrug' },
          'Dock found.',
          { t: 'My name is Princess Ada Dorothea. I have never said it to anyone who would remember it.', act: 'nod' },
          { t: 'You may call me Dot. You already do.', act: 'huff' },
        ],
        reward: {},
      },
    ],
  },
};

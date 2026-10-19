/**
 * What each NPC says, as data (`dialog.ts` is the format and the runner). One script per NPC id; voices as in `state.ts`
 * (the Oracle pious and dry, the Trader a hawker, the Kicker few words, the Planner fussy, the Expeditioner weathered).
 *
 * The main quest is the Oracle's (`main`, its steps in `story.ts`, P44): her script moves it, reading the story's facts
 * (`storyFacts`: `scrap100`, `boss.<kind>`, `house`, `wife`, `ghost`, `evil`). The NPC quest lines (a station NPC's quests in their specialty, each step unlocking their next
 * thing) are data in `lines.ts`, merged into their givers' scripts below `SCRIPTS`. Facts the hub supplies (`factsFor`): `built` and
 * `perk` (this NPC's station stands, its gift is taken), `scrap` (held), `missions`, `stations` (how many stand),
 * `parts` (in the stores), `goal.<line>` (how far a line's current step is). Saved flags are named freely; the runner also keeps `talked.<npc>` (conversations held) and
 * `seen.<npc>.<node>` (visits to a node).
 */
import type { PerkId } from './state';
import { NPCS, PERKS, freshExpedition, npc, type HubState } from './state';
import { economy } from './economy';
import { researchFacts } from './researchslice';
import type { Flags, QuestDef, Quests, Reward, Script, Talk } from './dialog';
import { PARTS } from '../sim/defs';
import { LINES, LINE_QUESTS, PART_FILTERS, lineFacts, lineScript, type LineProgress, type PartFilter } from './lines';
import { S, STORY, storyFacts } from './story';
import { questFacts } from './questfacts';
import { bondSave, questBook } from './talkslice';
import { BONDS, bondFacts, bondTalk } from './bonds';
import { gear } from './carry';
import { roster } from './workshop';
import { opened } from './landings';
import { DOG_NAMING } from './speciallines';
import { princessFacts } from './princessslice';
import { ABOUT_HER, PRINCESS_TALK } from './princesstalk';

export const QUESTS: Quests = {
  main: { title: 'The Old Way', kind: 'main', grants: 'theFaithful', steps: STORY.map((st) => st.task) },
  ...LINE_QUESTS,
};
export const questTitle = (id: string): QuestDef | undefined => QUESTS[id];

/** The line under an NPC's name on the dialog's plate. */
export const NPC_ROLE: Record<string, string> = {
  highPriest: 'Voice of the Wanderer',
  expeditioner: 'Mapper of the far sands',
  cityPlanner: 'Draftsman of the D-city',
  sprocket: 'Mechanic, and bench-keeper',
  kicker: 'Instructor in boots',
  hob: 'Barrelwright, and gunsmith',
  gasket: 'Surgeon of robots',
  trader: 'Honest brass, no refunds',
  princess: 'Your wife, a robot vacuum',
};

/** The levers every station NPC has: the old panels (build the station, take the gift) are one pull away. */
const station = (build: string, visit: string) => [
  { text: build, if: { not: 'built' }, do: [{ open: 'station' as const }] },
  { text: visit, if: { has: 'built' }, do: [{ open: 'station' as const }] },
];
const bye = (text: string) => ({ text });

export const SCRIPTS: Record<string, Script> = {
  // The Oracle gives the main quest (hub/story.ts, P44): each step opens the next thing, the bosses are the hard ones,
  // and the blessing is where the Evil Oracle takes the wife.
  highPriest: {
    entry: [
      // Act 5 of quests.md (P38): the third fragment of her signal is heard, and the Oracle stops pretending she cannot hear it.
      { if: [{ has: 'act.5.done' }, { not: 'seen.highPriest.shore' }], go: 'shore' },
      { if: [{ quest: 'main', step: S.evil }, { has: 'evil' }], go: 'q11ok' },
      { if: { quest: 'main', step: S.evil }, go: 'q11' },
      { if: [{ quest: 'main', step: S.ghost }, { has: 'ghost' }], go: 'q10ok' },
      { if: { quest: 'main', step: S.ghost }, go: 'q10' },
      { if: { quest: 'main', step: S.blessing }, go: 'q9' },
      { if: [{ quest: 'main', step: S.harbinger }, { has: 'boss.drone' }], go: 'q8ok' },
      { if: { quest: 'main', step: S.harbinger }, go: 'q8' },
      { if: [{ quest: 'main', step: S.bear }, { has: 'boss.bear' }], go: 'q7ok' },
      { if: { quest: 'main', step: S.bear }, go: 'q7' },
      { if: [{ quest: 'main', step: S.knight }, { has: 'wife' }], go: 'q6ok' },
      { if: { quest: 'main', step: S.knight }, go: 'q6' },
      { if: [{ quest: 'main', step: S.ironback }, { has: 'boss.gorilla' }], go: 'q5ok' },
      { if: { quest: 'main', step: S.ironback }, go: 'q5' },
      { if: [{ quest: 'main', step: S.house }, { has: 'house' }], go: 'q4ok' },
      { if: { quest: 'main', step: S.house }, go: 'q4' },
      { if: [{ quest: 'main', step: S.queen }, { has: 'boss.hornet' }], go: 'q3ok' },
      { if: { quest: 'main', step: S.queen }, go: 'q3' },
      { if: [{ quest: 'main', step: S.scrap }, { has: 'scrap100' }], go: 'q2ok' },
      { if: { quest: 'main', step: S.scrap }, go: 'q2' },
      { if: { not: 'seen.highPriest.hello' }, go: 'hello' },
      { go: 'idle' },
    ],
    nodes: {
      shore: {
        say: ['The castle is quiet and your antenna is singing. Very well. I will stop pretending I cannot hear it.', 'A self-charging, map-making, wireless... person. On the Far Shore.', 'Every page of my doctrine says leave her there.'],
        do: [{ give: { title: 'farShore' } }],
        choices: [
          { text: "I'm going anyway.", do: [{ set: 'ending.defiant' }], go: 'shore.defiant' },
          { text: 'Then the doctrine is wrong.', do: [{ set: 'ending.heretic' }], go: 'shore.heretic' },
          { text: "She's old tech now too.", do: [{ set: 'ending.oldTech' }], go: 'shore.oldTech' },
        ],
      },
      'shore.defiant': { say: ['I know. I raised you. Plot the course.'], go: 'shore.end' },
      'shore.heretic': { say: ['Hush. ...It may want a revision. Do not tell the faithful.'], go: 'shore.end' },
      'shore.oldTech': { say: ['...So she is. Everything is, given time. Plot the course.'], go: 'shore.end' },
      'shore.end': {
        say: ['(on the antenna) Receiving. Stay where you are. The dock is coming to you.', '(a small voice, far off) Dock found.', 'She will wipe her brushes before she comes aboard. And yes, I know about the bird bath.'],
        go: 'menu',
      },
      hello: {
        say: ['Kneel, Communicator. I see through every rivet of this ship.', 'I ask only for scrap, and that you never, ever accept a firmware update.'],
        go: 'menu',
      },
      idle: {
        cycle: [
          ['May your boiler run hot and your firmware never update.'],
          ['The sands are patient. So am I. Slightly less so.'],
          ['I counted your steps across my deck. Seven hundred. Efficient, for a mortal.'],
        ],
        go: 'menu',
      },
      menu: {
        choices: [
          { text: 'I am ready to listen.', if: { quest: 'main', step: 'none' }, go: 'charge' },
          { text: 'Where shall I build my house?', if: [{ quest: 'main', step: S.house }, { not: 'house' }], do: [{ open: 'house' }] },
          { text: 'Is there an old rule for me, Oracle?', if: { has: 'research' }, do: [{ open: 'research' }] },
          { text: 'What do you see, Oracle?', go: 'see' },
          bye('Farewell.'),
        ],
      },
      see: {
        say: ['Wireless, mostly. Heresy hums in the air like flies over a seep.', { t: 'Out there the machines gleam black and white. In here, brass. Remember which is which!', act: 'point' }],
        go: 'menu',
      },
      // 1: hearing her out opens the satchel.
      charge: {
        say: [
          'Then hear the Old Way, one blessing at a time. First: a satchel, blessed against wireless. Carry what you find in it.',
          { t: 'Press {inventory} to open it. Then show me a hundred scrap, from the machines out there.', act: 'point' },
          'What I ask of you is written down. Press {journal} for your quest log, here or out on the sands.',
        ],
        do: [{ quest: 'main', step: 1 }, { quest: 'main', step: S.scrap }, { banner: 'Unlocked: the inventory (I)' }],
      },
      q2: { say: ['A hundred scrap, Communicator. Break a few machines and come back when your hold is heavy.'], go: 'menu' },
      // 2: a hundred scrap opens the workbench.
      q2ok: {
        say: [
          'The hold is heavy and the Oracle is content. The workbench is yours: make, mend, take apart. Pray first.',
          { t: 'Now the hard part. A queen rules the desert hornets. Bring her down.', act: 'point' },
        ],
        do: [{ quest: 'main', step: S.queen }, { banner: 'Unlocked: the workbench (crafting, in the inventory)' }],
      },
      q3: { say: ['The queen comes to the desert at dusk. Stay for her, and come back.'], go: 'menu' },
      // 3: the queen opens your house.
      q3ok: {
        say: ['The queen is scrap. The colony sleeps easier, and you have earned a bed.', 'Build yourself a house on a lot. A room of your own: a lamp, a door, somewhere to keep what matters.'],
        do: [{ quest: 'main', step: S.house }, { banner: 'Unlocked: your house' }],
        choices: [{ text: 'Show me the lots.', do: [{ open: 'house' }] }, bye('Later.')],
      },
      q4: { say: ['Your house, Communicator. Pick a lot. The Planner will grumble; let her.'], go: 'menu' },
      // 4: the house opens the Wanderer's calls.
      q4ok: {
        say: [
          'A roof of your own. Now the Wanderer answers you as it answers me: it will lower its Brass Guards where you point.',
          { t: 'Choose your call at the course table; {support} makes it. Next, the Rustwood. A gorilla there thinks it is a king.', act: 'point' },
        ],
        do: [{ quest: 'main', step: S.ironback }, { give: { perk: 'callDrop' } }, { banner: 'Unlocked: the Brass Drop, and the choice of call' }],
      },
      q5: { say: ['The Ironback comes to its old stage at dusk. Bring it down.'], go: 'menu' },
      // 5: the Ironback opens the Steam Lance.
      q5ok: {
        say: [
          'The false king is silenced. The Wanderer has learned to vent its boilers in a line: the Steam Lance is yours.',
          'Next, the Hollow City. A tin knight guards a kingdom of nothing, and something in his saddlebag. Free him of it.',
        ],
        do: [{ quest: 'main', step: S.knight }, { give: { perk: 'callLance' } }, { banner: 'Unlocked: the Steam Lance' }],
      },
      q6: { say: ['The knight, Communicator, and whoever he keeps. Bring them both home: him in pieces, them whole.'], go: 'menu' },
      // 6: the knight's Princess comes home: a wife.
      q6ok: {
        say: [
          { t: 'She is... a vacuum cleaner. In a copper skirt. She has already cleaned my altar and asked whether you snore.', act: 'shrug' },
          'Very well. She may stay in your house. The doctrine says nothing against it, mostly because nobody thought to write it.',
          { t: 'Next, the Frostspine. A white bear out of the glacier. Bring it down.', act: 'point' },
        ],
        do: [{ quest: 'main', step: S.bear }, { banner: 'Your wife is home' }],
      },
      q7: { say: ['The bear comes to its frozen lake at dusk. Kick it while it folds.'], go: 'menu' },
      // 7: the bear: a fuller hold.
      q7ok: {
        say: ['The steel eagle has fallen. The Wanderer loads every call with one more charge.', { t: 'One more, Communicator. The Harbinger, in the Demon Wastes. Then I will bless you both.', act: 'point' }],
        do: [{ quest: 'main', step: S.harbinger }, { give: { perk: 'moreCharges' } }, { banner: 'Every call: one more charge' }],
      },
      q8: { say: ['The Harbinger waits in its castle in the Wastes. Bring everyone.'], go: 'menu' },
      // 8: the Harbinger: the blessing is ready.
      q8ok: {
        say: ['It is done. The Wastes are quiet, and so is my heart, for once.', 'Bring your wife to the altar. It is time for the blessing of the Old Way.'],
        do: [{ quest: 'main', step: S.blessing }],
      },
      // 9: the blessing: the cut scene (hub/cutscene.ts), the Ether opens.
      q9: {
        say: ['Kneel, both of you. The altar is warm and the boilers are singing.'],
        choices: [{ text: 'We are ready.', do: [{ quest: 'main', step: S.ghost }, { open: 'stolen' }] }, bye('Not yet.')],
      },
      q10: {
        say: ['The Ether is on the course table. Find the Esteemed Ghost first: nothing of ours can touch them until he lends you his.'],
        go: 'menu',
      },
      q10ok: {
        say: ['The Esteemed Ghost. He used to correct my sermons. Politely.', { t: 'Now the church. Bring her home.', act: 'point' }],
        do: [{ quest: 'main', step: S.evil }],
      },
      q11: { say: ['His church is in the Ether. He has her. Go.'], go: 'menu' },
      // 11: the Evil Oracle is down; she is home. The outro plays (hub/outro.ts).
      q11ok: {
        say: [
          'You brought her home. And my brother is... quiet, at last.',
          { t: 'Both of you: kneel. This time nobody interrupts.', act: 'laugh' },
          'You are blessed, Communicator. The Old Way thanks you. So do I.',
        ],
        do: [{ quest: 'main', step: 'done' }, { give: { scrap: 300 } }, { banner: 'The Old Way: done' }, { open: 'outro' }],
      },
    },
  },

  // The Communicator's wife (P44): an upright vacuum cleaner in a copper skirt (Laimonas's painting, `art/npc/princess`), three hundred years in a knight's saddlebag. Brisk, tidy,
  // fond; maps everything.
  // P58 gives her a life between the beats (the writer's lines, in her voice; `princesstalk.ts` holds her talk with the others).
  princess: {
    entry: [
      { if: { not: 'seen.princess.hello' }, go: 'hello' },
      { if: { not: 'princess.brush' }, go: 'brush' }, // a save from before P58: her gift still waits
      { if: { has: 'cat.riding' }, go: 'passenger' },
      { go: 'idle' },
    ],
    nodes: {
      hello: { say: ['Three hundred years in a saddlebag, and then you.', { t: 'I have already mapped your house. Twice. The corners are a disgrace.', act: 'huff' }], go: 'brush' },
      // P58 B: her spare main brush, the first thing she ever asked for help with.
      brush: {
        say: ['Before I forget. My spare main brush. It was stuck for three hundred years; I unstuck it.', { t: 'Swing it round. Small things go flying, loose scrap comes to heel. Not the cat.', act: 'point' }],
        do: [{ give: { item: 'mainBrush' } }, { set: 'princess.brush' }],
        go: 'menu',
      },
      // P58 A: Rumba on her rounds.
      passenger: { say: [{ t: 'There is a passenger. I have not agreed to a passenger.', act: 'huff' }, 'She is warm, she is unbothered and she is shedding. I am pretending not to notice. Help me pretend.'], go: 'menu' },
      idle: {
        cycle: [
          ['I found a bolt under the altar. I am keeping it.'],
          ['Wipe your feet. The deck is ninety percent sand, leaves and snow, and ten percent you.'],
          ['The Oracle says I am heresy. I said she has crumbs in her censer.'],
          ['Come home in one piece. I am not vacuuming up the other pieces.'],
          ['I swept while you were out. Do not look at the floor like that; it is the same floor.'],
          ['Hob has tracked soot to the lift again. I have mapped it. I have mapped all of it.'],
          ['There is a draught under the church door. The Oracle calls it the breath of the Old Way. I call it a draught.'],
          ['You hum when you walk. You did not know that. Now you do.'],
        ],
        go: 'menu',
      },
      menu: { choices: [{ text: 'How are you, dear?', go: 'how' }, ...PRINCESS_TALK.levers, bye('See you tonight.')] },
      ...PRINCESS_TALK.nodes,
      how: { say: ['Charged, mapped, and only a little dusty. Go and break something; I will be here.'], go: 'menu' },
    },
  },

  expeditioner: {
    entry: [
      { if: { not: 'seen.expeditioner.hello' }, go: 'hello' },
      { go: 'idle' },
    ],
    nodes: {
      hello: {
        say: ['Pulled me out of that snare, you did. I will not forget it.', 'Bring copper up and I will send crews out to build. Watch the window; the city will grow.'],
        go: 'menu',
      },
      idle: {
        cycle: [
          ['Sand in the joints again. Always the left knee.'],
          ['Somewhere past the third ridge there is a road. I have seen the tracks.'],
          ['A map is only a promise you make to the dark.'],
        ],
        go: 'menu',
      },
      menu: { choices: [...station('Let us talk about your office.', 'What have you got for me?'), { text: 'What is out there?', go: 'sands' }, bye('Safe roads.')] },
      sands: {
        say: ['Sand, then green, then streets, then snow, then ash. Hives and ruins in all of them, and old roads past where any lamp reaches. I mean to see the end of it.', { t: 'Not today. Today I draw maps.', act: 'shrug' }],
        go: 'menu',
      },
    },
  },

  cityPlanner: {
    entry: [{ if: { not: 'seen.cityPlanner.hello' }, go: 'hello' }, { go: 'idle' }],
    nodes: {
      hello: { say: ['Every city needs one thing it is famous for.', 'Choose, and I will draw it up.'], go: 'menu' },
      idle: {
        cycle: [
          ['Eleven degrees off true. Intolerable. I will fix it by morning.'],
          ['Mind the drawings. They are damp.'],
          ['A city is only gears that forgot they were gears.'],
        ],
        go: 'menu',
      },
      menu: {
        choices: [
          ...station('Let us talk about your drafting office.', 'What have you got for me?'),
          { text: 'Show me the plans.', if: { has: 'built' }, do: [{ open: 'planner' }] },
          { text: 'Why gears?', go: 'gears' },
          bye('Carry on.'),
        ],
      },
      gears: { say: ['Because a gear cannot lie. It meshes or it does not.', { t: 'People, now. People I cannot draw at all.', act: 'shrug' }], go: 'menu' },
    },
  },

  // Level 1's rescue (P9): the first station is her workshop (D29): the workbench, standing by itself once she is aboard. The Oracle's step 2 no longer gates it.
  sprocket: {
    entry: [
      { if: { not: 'seen.sprocket.hello' }, go: 'hello' },
      { go: 'idle' },
    ],
    nodes: {
      hello: { say: [{ t: 'Finally. Do you know how long I was holding up that wreck?', act: 'huff' }, 'Give me the bench and I will have your robots running before the kettle boils.'], go: 'menu' },
      idle: { cycle: [['Mind the sparks.'], ['Everything runs better with a little oil and a lot of swearing.'], ['That toaster is not a toaster. It is a very good toaster.']], go: 'menu' },
      menu: { choices: [...station('Let us talk about your workshop.', 'To the bench.'), bye('Later.')] },
    },
  },

  // Hob, the barrelwright and gunsmith (P20; the join line is `quests.md`'s, the rest placeholders until the loreweaver's). Forge-deaf: shouts, mishears, loves barrels more than people.
  hob: {
    entry: [{ if: { not: 'seen.hob.hello' }, go: 'hello' }, { go: 'idle' }],
    nodes: {
      hello: {
        say: [{ t: 'A FORGE! There is a gun-shrine out on the sands, by the way. I have marked it.', act: 'point' }, 'Or buy mine. Mine is louder.'],
        go: 'menu',
      },
      idle: {
        cycle: [
          ['A BARREL IS A HOLE WITH OPINIONS!'],
          ['WHAT? NO, I DO NOT WANT A MUFFIN. ...Is it a brass muffin?'],
          ['Rifled, smooth, fluted. Do not get me started. ...I am already started.'],
        ],
        go: 'menu',
      },
      menu: { choices: [...station('Let us talk about your forge.', 'What can you teach me?'), { text: 'Why the shouting?', go: 'shout' }, bye('Later.')] },
      shout: {
        say: [{ t: 'THE SHOUTING? I AM NOT SHOUTING. THIS IS MY INDOOR VOICE.', act: 'huff' }, 'Forty years at the anvil. You get used to the quiet, or you stop hearing it.'],
        go: 'menu',
      },
    },
  },

  // Dr. Gasket, the augmenter (P20; the join line is `quests.md`'s, the rest placeholders until the loreweaver's). A cheerful surgeon, alarmingly honest about risk.
  gasket: {
    entry: [{ if: { not: 'seen.gasket.hello' }, go: 'hello' }, { go: 'idle' }],
    nodes: {
      hello: {
        say: [{ t: 'A clinic! Six slots on you, seven if I am generous, and I am.', act: 'wave' }, 'The vent is on the house. Splendid!'],
        go: 'menu',
      },
      idle: {
        cycle: [
          ['Splendid! Your left posterior vent is splendid. Hold still.'],
          ['Risks? Oh, a few. Fewer than the sands, certainly.'],
          ['I have never lost a patient. Several have been temporarily mislaid.'],
        ],
        go: 'menu',
      },
      menu: { choices: [...station('Let us talk about your clinic.', 'What can you teach me?'), { text: 'Is it safe?', go: 'safe' }, bye('Later.')] },
      safe: {
        say: [{ t: 'Safe? It is medicine, dear Communicator. It is accurate, which is better.', act: 'laugh' }, 'Every part fits. Most parts stay fitted. We shall not speak of the others.'],
        go: 'menu',
      },
    },
  },

  kicker: {
    entry: [
      { if: { not: 'seen.kicker.hello' }, go: 'hello' },
      { go: 'idle' },
    ],
    nodes: {
      hello: { say: ['A good boot solves most problems.', 'Build me a dojo and I will teach you to kick.'], go: 'menu' },
      idle: { cycle: [['Hm.'], ['Boot first. Questions after.'], ['A blade breaks. A boot never forgets.']], go: 'menu' },
      menu: { choices: [...station('Let us talk about your dojo.', 'Teach me.'), { text: 'Why a boot?', go: 'why' }, bye('Later.')] },
      why: { say: ['Reach. A shovel reaches an arm. A boot reaches the whole hive.', { t: 'Also, boots do not need oiling.', act: 'huff' }], go: 'menu' },
    },
  },

  trader: {
    entry: [
      { if: { not: 'seen.trader.hello' }, go: 'hello' },
      { go: 'idle' },
    ],
    nodes: {
      hello: {
        say: [{ t: 'Goodies and more! Gears, tools, snacks, trinkets, all honest brass: no batteries, no updates, no refunds.', act: 'wave' }, 'Put up my stall and the first thing is on the house.'],
        go: 'menu',
      },
      idle: {
        cycle: [
          ['Mind the wares! Everything here has been polished by hand. Mostly mine.'],
          ['Snacks, anyone? Walnut-shaped. Not walnuts. Do not ask.'],
          ['Honest brass, honest prices. The prices are honestly high.'],
        ],
        go: 'menu',
      },
      menu: {
        choices: [
          ...station('Let us talk about your stall.', 'What is on offer?'),
          bye('Be seeing you.'),
        ],
      },
    },
  },
};

// The relationship track's greetings and gifts (P52): before the lines' entries, so a hand-in and a first meeting still come first; each takes the place of the idle chatter.
for (const id of Object.keys(BONDS)) {
  const b = bondTalk(id), s = SCRIPTS[id], at = s.entry.length - 1; // the last entry is the idle chatter
  s.entry.splice(at, 0, ...b.entry);
  Object.assign(s.nodes, b.nodes);
}
// The quest lines' levers lead each giver's menu (work on offer is the first thing to talk about), their entries first (a step met is handed in on talking).
for (const id of Object.keys(LINES)) {
  const l = lineScript(id), s = SCRIPTS[LINES[id].npc];
  s.entry.unshift(...l.entry);
  Object.assign(s.nodes, l.nodes);
  s.nodes.menu.choices!.unshift(...l.choices);
}
// The others about the Princess (P58 F): a lever on their menus while she is home, or gone.
for (const [id, t] of Object.entries(ABOUT_HER)) {
  SCRIPTS[id].nodes.menu.choices!.splice(-1, 0, ...t.levers);
  Object.assign(SCRIPTS[id].nodes, t.nodes);
}
// The Oracle names the dog, once its line is done (P42).
SCRIPTS.highPriest.nodes.menu.choices!.unshift(...DOG_NAMING.choices);
Object.assign(SCRIPTS.highPriest.nodes, DOG_NAMING.nodes);

/** The facts a script can read, for one NPC; with the talk and the lines' progress, the lines' `goal.<line>` too. */
export function factsFor(s: HubState, id: string, talk?: Talk, lines: LineProgress = {}, scrap = economy.get().scrap, extra: Flags = {}): Flags {
  const n = npc(id);
  // Parts to hand over: a boss's unique (the Queen's Crown) is never in the count.
  const parts = Object.entries(s.parts).reduce((a, [k, n]) => a + (PARTS[k as keyof typeof PARTS]?.unique ? 0 : n ?? 0), 0);
  const facts: Flags = {
    built: s.stations[id] ? 1 : 0,
    perk: n?.station && s.perks.includes(n.station.gift) ? 1 : 0,
    scrap,
    missions: s.missions,
    stations: Object.keys(s.stations).length,
    parts,
    ...researchFacts(),
    ...storyFacts(s, scrap),
    ...questFacts(s, { book: questBook.get(), roster: roster.get(), gear: gear.get(), copper: economy.get().copper }),
    ...princessFacts(s),
    ...bondFacts(bondSave.get()),
    ...extra,
  };
  return talk ? { ...facts, ...lineFacts(talk, lines, facts) } : facts;
}

/** A reward paid out: a perk is learned, parts are added; what it `take`s is handed over first. The scrap is the economy's (`economy.ts` `settleScrap`). */
export function giveReward(s: HubState, r: Reward): HubState {
  const parts = { ...s.parts };
  const taken = new Set<string>();
  let owed = r.take?.parts ?? 0;
  const only = r.take?.only as PartFilter | undefined;
  const fits = (k: keyof typeof parts) => !PARTS[k]?.unique && (!only || PART_FILTERS[only](k)) && !taken.has(k);
  while (owed > 0) {
    const [k, n] = (Object.entries(parts) as [keyof typeof parts, number][]).filter(([k, n]) => n > 0 && fits(k)).sort((a, b) => b[1] - a[1])[0] ?? [];
    if (!k) break;
    const give = only === 'kinds' ? 1 : Math.min(owed, n); // `kinds`: one of each, the most plentiful kinds first (a kind taken once is not taken again)
    parts[k] = n - give;
    owed -= give;
    if (only === 'kinds') taken.add(k);
  }
  for (const [k, n] of Object.entries(r.parts ?? {})) parts[k as keyof typeof parts] = (parts[k as keyof typeof parts] ?? 0) + n;
  const perk = r.perk as PerkId | undefined;
  // The Expeditioner charts lands (P42): the first opened lands not charted yet, `chart` of them.
  const ex = { ...freshExpedition(), ...s.expedition };
  const charted = r.chart ? [...ex.charted, ...opened(s.story?.bosses ?? []).filter((id) => !ex.charted.includes(id)).slice(0, r.chart)] : ex.charted;
  return {
    ...s,
    parts,
    perks: perk && PERKS[perk] && !s.perks.includes(perk) ? [...s.perks, perk] : s.perks,
    ...(r.chart && { expedition: { ...ex, charted } }),
  };
}

/** Every NPC has a script (a test checks it). */
export const unscripted = () => NPCS.filter((n) => !SCRIPTS[n.id]).map((n) => n.id);

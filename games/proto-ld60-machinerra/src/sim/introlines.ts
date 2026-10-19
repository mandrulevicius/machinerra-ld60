/**
 * Mission 1's words (`games/ludum-dare-60/docs/onboarding.md`): the Oracle on the Wanderer before the fall (`OPENING`, the
 * `Opening` scene shows them one at a time while he cannot act) and down in the old works (`INTRO_LINES`, said by `intro.ts`
 * through `Sim.say`, one at a calm moment). Every line is a guess at Minos's plan; `{kick}`-style tokens are key prompts.
 */

/** The Oracle aboard, before the fall. The third gives the quest; `cue` marks the line the world cue (her signal) shows with. */
export const OPENING: { text: string; cue?: true; icon?: string }[] = [
  { text: 'Sprocket, our engineer, went down for parts. Her signal stopped at dawn.', icon: 'npc-sprocket' },
  { text: 'Bring her home: no robot of ours walks without her.', icon: 'npc-sprocket' },
  { text: 'There: her last signal. I will lower you close.', cue: true, icon: 'npc-sprocket' },
  { text: 'Hold on to something. Hold on to—' },
];

/** Down in the old works: one line each, by id (the `Sim.said` key). */
export const INTRO_LINES = {
  landed: 'Half your oil is on the floor. Find the lift below.',
  plug: 'Kick ({kick}) that machine through the rotten wall.',
  plugDown: '',
  pair: 'Kick one into the other.',
  shovel: 'A shovel. Take it.',
  armed: 'Swing it ({fire}).',
  hall: 'The way down is sealed. Try the three rooms.',
  scrap: 'Scrap: the Wanderer runs on it.',
  tap: 'Clean oil. Stand in its steam.',
  crates: 'Your shovel opens crates.',
  bellows: '',
  mended: 'He follows you now. Up the lift ({use}, twice).',
  open: 'The way down is open.',
  den: 'When it rears, step aside, then hit it.',
  bossDown: 'Down. Bellows lies past it: mend him ({use}).',
  respawn: 'Up again. Falls are free down here.',
} as const;
export type IntroLine = keyof typeof INTRO_LINES;

/** The picture beside a line on her panel (`SayOpts.icon`): the thing itself, or `key:<action>` for the control it teaches. A line with none shows her face alone. */
export const INTRO_ICONS: Partial<Record<IntroLine, string>> = {
  landed: 'oilcan',
  plug: 'key:kick',
  pair: 'key:kick',
  shovel: 'gear-shovel',
  armed: 'key:fire',
  scrap: 'scrapgob',
  tap: 'oilcan',
  crates: 'gear-shovel',
  bellows: 'key:use',
  bossDown: 'key:use',
};

/**
 * How long (s) a line may wait behind another before it is dropped: each is about a moment (a wall, a shovel), and said after it, it misleads.
 * `MOMENT` unless named here. The first line and the objective's stay a while (`Sim.say` `within`, `oraclequeue.ts`).
 */
export const MOMENT = 5;
export const INTRO_WITHIN: Partial<Record<IntroLine, number>> = { landed: 30, hall: 10, den: 8, bossDown: 15 };

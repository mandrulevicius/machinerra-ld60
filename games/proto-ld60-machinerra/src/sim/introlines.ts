/**
 * Mission 1's words (`games/ludum-dare-60/docs/onboarding.md`): the Oracle on the Wanderer before the fall (`OPENING`, the
 * `Opening` scene shows them one at a time while he cannot act) and down in the old works (`INTRO_LINES`, said by `intro.ts`
 * through `Sim.say`, one at a calm moment). Every line is a guess at Minos's plan; `{kick}`-style tokens are key prompts.
 */

/** The Oracle aboard, before the fall. The third gives the quest; `cue` marks the line the world cue (her signal) shows with. */
export const OPENING: { text: string; cue?: true; icon?: string }[] = [
  { text: 'Communicator. Stand on the lift and listen; the Wanderer is in a foul mood today.' },
  { text: 'Sprocket, our engineer, went down to the sands for parts. Her signal stopped at dawn.', icon: 'npc-sprocket' },
  { text: 'Bring her home. Without her hands, no robot of ours will ever walk again.', icon: 'npc-sprocket' },
  { text: 'There: her last signal, far to the east. I will lower you as close as the wind lets me.', cue: true, icon: 'npc-sprocket' },
  { text: 'Hold on to something. Hold on to—' },
];

/** Down in the old works: one line each, by id (the `Sim.said` key). */
export const INTRO_LINES = {
  landed: 'Still in one piece? Half your oil is on the floor. Find the lift at the bottom.',
  plug: 'A dazed machine before a rotten wall. Kick it ({kick}) through.',
  plugDown: 'Machines make fine battering rams.',
  pair: 'Two in a row. Kick the first into the second.',
  shovel: 'A shovel. Take it.',
  armed: 'Swing it ({fire}). One is coming.',
  hall: 'The way down is sealed. See to the three rooms round this hall.',
  scrap: 'Scrap: the Wanderer runs on it. Take it all.',
  tap: 'Clean oil. Rare: one an area. Stand in its steam.',
  crates: 'Crates on that door. Your shovel opens crates.',
  bellows: 'A robot under those three. Clear them, then mend him ({use}).',
  mended: 'He follows you now, and rides up with you.',
  open: 'Something heavy fell in the hall. The way down is open.',
  den: 'A big one. It coils, then rears with its jaws open before it lunges: step out of its line, then hit it. It shrugs off kicks for longer.',
  bossDown: 'Down. Behind it, the lift: ride it up ({use}, twice).',
  respawn: 'Up again. Down here a fall costs nothing.',
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

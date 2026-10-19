/**
 * The relationship track (P52), plain TS: five steps per NPC, one lit by any quest handed in to them (a story step, a ladder step,
 * a repeatable job paid at the dock), never past five. A quest after the fifth still pays its own reward. The fifth pays a gift no
 * quest gives: a perk (`PERKS`, read in the Sim as `perks.has(...)`), once, handed over in the NPC's next talk (`bondTalk`: the
 * node's `give` is guarded by `seen.<npc>.bond.5`, so it is paid once, also across a save and load).
 *
 * Saved in the `bonds` slice (`talkslice.ts`). Hooks: `Hub.flush` (a line's step handed in, `isHandIn`), `carry.ts` (a job paid),
 * `talk.ts` (the greetings, the `bond.<npc>` facts), `stations/npc.ts` and `questlog.ts` (the gauge, `bondview.ts`).
 * Every step name, gift and greeting is a guess (the lead's; the plan's table). Add an NPC: a `BONDS` row.
 */
import type { Flags, Node, Reward, Script } from './dialog';
import { LINES } from './lines';
import type { PerkId } from './state';

export const STEPS = 5;
type Say = NonNullable<Node['say']>;

/** `n`: the steps lit per NPC (0-5). `shown`: what the gauge last drew, so the tooth lit since pops once. */
export interface BondSave { n: Record<string, number>; shown: Record<string, number> }
export const freshBonds = (): BondSave => ({ n: {}, shown: {} });

export interface BondDef {
  /** The five steps' names (the plan's table). */
  steps: [string, string, string, string, string];
  /** What the NPC says the first time they are talked to at each of steps 1 to 4. */
  greet: [Say, Say, Say, Say];
  /** The fifth: the exchange, and the gift (a perk; `item` is handed over too). */
  scene: Say;
  /** What they say from then on in place of their idle chatter (a cycle of lines), when the track's end changes how they talk. */
  after?: Say[];
  gift: { name: string; perk: PerkId; item?: string };
}

export const BONDS: Record<string, BondDef> = {
  sprocket: {
    steps: ['New dear', 'Counted', 'Fussed over', 'Knitted for', 'One of my lambs'],
    greet: [
      ['There you are, dear. I have put your name on a peg.'],
      ['I counted you in this morning. I only count the ones I keep.'],
      ['Have you eaten? You have not. Sit. Oil first, talk after.'],
      ['I knitted you a sleeve. Do not ask what it is for. Wear it.'],
    ],
    scene: ['You come home and I count you. Every time. I would count you twice if I could.', { t: 'Here. It counts for me when I cannot: count them out, count them in. Do not tell the Oracle.', act: 'wave' }],
    gift: { name: 'The Roll-call', perk: 'rollCall' },
  },
  hob: {
    steps: ['WHO?', 'Customer', 'Apprentice', 'Shouting partner', 'BARREL-BROTHER'],
    greet: [
      [{ t: 'WHO? ...OH. THE ONE WITH THE BOOTS.', act: 'hop' }],
      ['CUSTOMER! YOU WANT BARRELS? EVERYBODY WANTS BARRELS.'],
      ['HOLD THIS. NO, THE OTHER END. ...GOOD APPRENTICE.'],
      ['SHOUT WITH ME. ...NO, NOT LIKE THAT. ...YES. LIKE THAT.'],
    ],
    scene: [{ t: 'MY MASTERPIECE! FORTY YEARS IN THE MAKING!', act: 'hop' }, "IT IS LOUD. ...I SAID IT IS LOUD. EVERYTHING WITHIN A HIVE'S REACH WILL HEAR IT. TAKE IT BEFORE I CHANGE MY MIND."],
    gift: { name: 'Old Earful', perk: 'oldEarful', item: 'oldEarful' },
  },
  gasket: {
    steps: ['Patient', 'Regular', 'Case study', 'Favourite patient', 'Splendid'],
    greet: [
      ['Splendid, a patient! Sit, sit. Do not touch the jars.'],
      ['A regular! I keep a chair warm for regulars. It is a cold chair.'],
      ['Your joints fascinate me. Professionally. Mostly professionally.'],
      ['My favourite patient. Do not tell the others. They are mostly in jars.'],
    ],
    scene: [{ t: 'Splendid! Quite splendid. I put in a spare while you were asleep.', act: 'laugh' }, 'Another heart, slotted in beside the first. Do not tell the Oracle.'],
    gift: { name: 'The Second Heart', perk: 'secondHeart' },
  },
  expeditioner: {
    steps: ['Met, you were', 'Traveller', 'Companion', 'Fellow of the map', 'A tale, you are'],
    greet: [
      ['Met, you were. Remember it, I will.'],
      ['A traveller, you are. The road has seen you, it has.'],
      ['Beside me on the maps, you walk now. A companion.'],
      ['A corner of my map, yours it is. Fellow of the map.'],
    ],
    scene: ['A tale, you are. Told in the camps, you will be.', { t: 'My old map, take it. The best part of every land, marked on it, already. Spoil the surprise, it does. Good.', act: 'point' }],
    gift: { name: 'The Old Map', perk: 'oldMap' },
  },
  cityPlanner: {
    steps: ['Applicant', 'Filed', 'Approved', 'Co-signed', 'In the Grand Plan'],
    greet: [
      ['Application received. Stamp pending.'],
      ['Filed, in triplicate. You were punctual. I noticed.'],
      ['Approved. I do not approve lightly. I have approved you lightly. Do not tell anyone.'],
      ['Co-signed. My signature beside yours. Do not smudge it.'],
    ],
    scene: ['You are in the Grand Plan, Communicator. Page one. The margin, but page one.', { t: 'Here. A second set of drawings every visit. The city should not wait on one pencil.', act: 'nod' }],
    gift: { name: 'The Grand Plan', perk: 'grandPlan' },
  },
  kicker: {
    steps: ['Student', 'Foot', 'Boot', 'Heel', '(a nod)'],
    greet: [
      ['Hm. Student.'],
      ['Foot. Good.'],
      ['Boot.'],
      ['Heel.'],
    ],
    scene: [{ t: '(He nods.)', act: 'nod' }, 'A wall is a door. You have not kicked it yet.'],
    gift: { name: 'The Open Door', perk: 'openDoor' },
  },
  trader: {
    steps: ['Customer', 'Regular', 'Valued customer', 'Friend', 'Partner'],
    greet: [
      ['Customer! Always welcome. Wipe your feet, not your wallet.'],
      ['A regular! Regulars get the second-best chair.'],
      ['Valued customer! I wrote it on a card. A very small card.'],
      ['Friend! Do not tell my accountant. I have not got one.'],
    ],
    scene: [{ t: 'Partner! Come, come round the back.', act: 'wave' }, 'The back room. The good stuff. Partners only, no refunds, and a little more on the shelf every lift. Honest brass.'],
    after: [['Partner! The back room is yours. Mind the crates.'], ['For you, partner, the best of the lot is already out the back.'], ['Partner, partner. I like saying it.']],
    gift: { name: 'The Back Room', perk: 'backRoom' },
  },
  highPriest: {
    steps: ['Child of the deck', 'Pilgrim', 'Faithful', 'Beloved', 'Her child'],
    greet: [
      ['Child of the deck. You are noticed.'],
      ['A pilgrim, are you? Kneel less. Or more. I forget which.'],
      ['Faithful. I did not think I would say it of one who owns a toaster.'],
      ['Beloved. The Wanderer hums when you come aboard. I did not tell you that.'],
    ],
    scene: ['I have kept a fourth place on your card for you, in the margin of the Old Way.', { t: 'Stay. Just this once.', act: 'point' }, 'Do not tell my brother.'],
    gift: { name: 'The Fourth Slot', perk: 'fourthSlot' },
  },
  princess: {
    steps: ['Tolerable', 'Housetrained', 'Mine', 'My dock', 'Home'],
    greet: [
      ['You are tolerable. I have mapped worse.'],
      ['You wipe your feet now. I noticed. I have not said anything. I am saying it now.'],
      ['Mine. ...I said that aloud. Hm. Mine.'],
      ['I have kept the second berth warm. Do not make a thing of it.'],
    ],
    scene: ['Home was never the dock, you know. It was whoever came back to it.', { t: 'Get up when you fall. I will be on the line. I just cleaned this floor.', act: 'nod' }],
    gift: { name: 'The Homing Signal', perk: 'homingSignal' },
  },
};

export const bondOf = (b: BondSave, npc: string) => Math.max(0, Math.min(STEPS, b.n[npc] ?? 0));

/** A quest handed in to `npc` lights the next step (never past five). `lit` is whether one lit, `step` its name. An NPC with no track is left alone. */
export function lightBond(b: BondSave, npc: string): { bond: BondSave; lit: boolean; step: string } {
  const def = BONDS[npc], n = bondOf(b, npc);
  if (!def || n >= STEPS) return { bond: b, lit: false, step: '' };
  return { bond: { ...b, n: { ...b.n, [npc]: n + 1 } }, lit: true, step: def.steps[n] };
}

/** A line's `quest` effect that is a hand-in: a step done (the next step, or the line finished), not the line being taken up. */
export const isHandIn = (step: number) => step >= 2;
/** The NPC a `quest` effect hands a quest in to (its line's giver), or null: not one of the lines, or only the line being taken up. */
export const handedTo = (quest: string, step: number): string | null => (LINES[quest] && isHandIn(step) ? LINES[quest].npc : null);

/** Set a track by hand (the dev command): 0 to 5. */
export const setBond = (b: BondSave, npc: string, n: number): BondSave => ({ ...b, n: { ...b.n, [npc]: Math.max(0, Math.min(STEPS, Math.floor(n))) } });

/** The facts the scripts read: `bond.<npc>`, the steps lit. */
export const bondFacts = (b: BondSave): Flags => Object.fromEntries(Object.keys(BONDS).map((id) => [`bond.${id}`, bondOf(b, id)]));

/** The gift's reward (a perk, and an item handed over with it). */
export const giftReward = (npc: string): Reward => ({ perk: BONDS[npc].gift.perk, ...(BONDS[npc].gift.item && { item: BONDS[npc].gift.item }) });

/** The gift is waiting: the fifth step is lit and the NPC has not yet said their piece. */
export const giftWaiting = (n: number, npc: string, talked: Flags) => n >= STEPS && !talked[`seen.${npc}.bond.5`];

/**
 * An NPC's greetings and the gift exchange as dialog data, merged into their script (`talk.ts`): each step's greeting is said once,
 * the first time they are talked to after it is lit (in place of their idle chatter; a first meeting and a hand-in come first), and
 * the fifth is the exchange that hands over the gift.
 */
export function bondTalk(npc: string): { entry: Script['entry']; nodes: Record<string, Node> } {
  const def = BONDS[npc];
  const entry: Script['entry'] = [];
  const nodes: Record<string, Node> = {};
  for (let k = STEPS; k >= 1; k--) {
    entry.push({ if: [{ min: [`bond.${npc}`, k] }, { not: `seen.${npc}.bond.${k}` }], go: `bond.${k}` });
    nodes[`bond.${k}`] = k === STEPS
      ? { say: def.scene, do: [{ give: giftReward(npc) }, { banner: `Gift: ${def.gift.name}` }], go: 'menu' }
      : { say: def.greet[k - 1], go: 'menu' };
  }
  if (def.after) {
    entry.push({ if: { min: [`bond.${npc}`, STEPS] }, go: 'bond.after' });
    nodes['bond.after'] = { cycle: def.after, go: 'menu' };
  }
  return { entry, nodes };
}

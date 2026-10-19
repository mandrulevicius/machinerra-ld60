/**
 * D-city air support: the calls the Zeppelin Wanderer answers.
 * Add one: a `SupportId` and its `SUPPORT` entry.
 */
import type { DamageType } from './base';

/**
 * D-city air support: the calls the Zeppelin Wanderer answers from far above (only its shadow shows during a mission).
 * The Communicator's own abilities are used often; these are rare and very impactful, for a tough spot when you lingered
 * too long into the night. Each has `charges` a mission (a new mission, back from the hub, refills them) and works on
 * the ground where the Communicator points (`range` px from them at most). `SUPPORT_START` are the calls unlocked at
 * the start; rescued NPCs unlock more later. Add one: a `SupportId`, a `SUPPORT` entry (its `kind` says how `Sim` plays
 * it), a draw in `Play.drawStrike`.
 *
 * `barrage` (a steam barrage): the shadow slides over the target (`tell`), hangs there a moment (`hold`: the ground is
 * marked, a whistle builds), then `shells` fall over `fall` seconds, evenly over a disc of `radius` px. Each blast
 * (`blast` px) deals `dmg` to every enemy it reaches (a boss takes `boss` of it) and shoves them out (`knock`). It only
 * ever harms machines, never your robots: the gunners aim by faith, and faith only hits modern tech.
 */
export type SupportId = 'barrage' | 'drop' | 'lance';

export interface BarrageDef {
  /** `barrage` shells a disc; `lance` a line of steam through the mark, along the Communicator's aim (`radius` is half its length); `drop` lowers `guards` Brass Guards on ropes, one where each shell would fall. */
  kind: 'barrage' | 'lance' | 'drop';
  /** The drop's robots: how many, and for how long (s). */
  guards?: { n: number; ttl: number };
  /** Its blasts' damage type (impact when left out). */
  type?: DamageType;
  name: string;
  blurb: string;
  charges: number;
  range: number;
  tell: number;
  hold: number;
  fall: number;
  /** Seconds the shadow takes to leave after the last shell. */
  leave: number;
  radius: number;
  shells: number;
  blast: number;
  dmg: number;
  boss: number;
  knock: number;
  /** The shadow: its length (px), the heading it flies (radians), how far from the target it comes in (px), its slow drift over the target (px/s). */
  shadow: { len: number; heading: number; travel: number; creep: number };
}

export type SupportDef = BarrageDef;

export const SUPPORT: Record<SupportId, SupportDef> = {
  barrage: {
    kind: 'barrage',
    name: 'Steam barrage',
    blurb: 'The Zeppelin Wanderer shells the ground under your cursor: sixteen blasts over a wide circle.',
    charges: 1,
    range: 560,
    tell: 2.4,
    hold: 0.9,
    fall: 1.3,
    leave: 1.6,
    radius: 200,
    shells: 16,
    blast: 78,
    dmg: 60,
    boss: 0.35,
    knock: 260,
    shadow: { len: 640, heading: -0.32, travel: 1100, creep: 14 },
  },
  // The main quest's rewards (P44, hub/story.ts): the Brass Drop for building your house, the Steam Lance for the Harbinger.
  drop: {
    kind: 'drop',
    name: 'Brass Drop',
    blurb: 'Three of the Wanderer\'s Brass Guards come down on ropes where you point, and fight beside you for a minute.',
    charges: 1,
    range: 480,
    tell: 2,
    hold: 0.6,
    fall: 0.9,
    leave: 1.4,
    radius: 60,
    shells: 3,
    blast: 40,
    dmg: 0,
    boss: 0,
    knock: 160,
    guards: { n: 3, ttl: 60 },
    shadow: { len: 640, heading: -0.32, travel: 1100, creep: 10 },
  },
  lance: {
    kind: 'lance',
    name: 'Steam Lance',
    blurb: 'The Wanderer vents its boilers down in a straight line through your mark, along your aim: a scalding wall, end to end.',
    charges: 1,
    range: 520,
    tell: 1.8,
    hold: 0.7,
    fall: 0.55,
    leave: 1.4,
    radius: 260,
    shells: 14,
    blast: 46,
    dmg: 70,
    boss: 0.4,
    knock: 120,
    type: 'scald',
    shadow: { len: 640, heading: -0.32, travel: 1100, creep: 6 },
  },
};

export const SUPPORT_START: SupportId[] = ['barrage'];

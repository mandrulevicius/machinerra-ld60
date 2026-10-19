/**
 * What a mission starts from: the Sim's constructor inputs, assembled from the save slices (`hub`, `loadout`, `gear`,
 * `roster`, `titleSave`, `researchSave`). Play makes one `new Sim(...missionArgs(...))`.
 *
 * Add a slice the Sim starts from: one line in `landOpts` (a land) and, if a dungeon needs it too, in `downOpts`.
 * The Sim's constructor and `SimOptions` (`sim/types.ts`) are the types; nothing here is a rule.
 */
import { gear, loadout, onboardSave } from './hub/carry';
import { cityFx } from './hub/buildings';
import { districtFx } from './hub/district';
import { aboard, pilgrimIn } from './hub/state';
import { hub } from './hub/save';
import { liveCards } from './hub/researchslice';
import { lineSave, questBook, talkSave, titleSave } from './hub/talkslice';
import { dogNameOf } from './hub/speciallines';
import { stepOf } from './hub/dialog';
import { actFacts } from './hub/acts';
import type { QuestOpts } from './sim/questcount';
import { crewOf, knownTypes, roster } from './hub/workshop';
import { chassisStats } from './sim/bots';
import type { AnomalyId, BiomeId, PartKind, SupportId, WeaponId } from './sim/defs';
import type { DungeonSpec } from './sim/dungeon';
import { syncWeapons } from './sim/gear';
import type { Grafted } from './sim/graft';
import { loadLand } from './sim/lands';
import type { PartyBot, Sim } from './sim/sim';
import type { SimOptions } from './sim/types';

/** What he holds in a mission, and what travels down and up a dungeon with him (the D-city's charges are the mission's, a weapon found is saved only when the lift docks). */
export interface Hands {
  weapons: WeaponId[];
  weapon: WeaponId;
  secondary: WeaponId | null;
  support: Partial<Record<SupportId, number>>;
  call: SupportId;
  /** The limb grafted on him (`sim/graft.ts`), if any. */
  graft?: Grafted | null;
}

/** What he holds in this Sim. */
export const handsOf = (s: Sim): Hands => ({ weapons: [...s.weapons], weapon: s.weapon, secondary: s.secondary, support: { ...s.support }, call: s.call, graft: s.graft && { kind: s.graft.kind, from: s.graft.from, dmg: s.graft.dmg } });

/** What the Communicator takes down a dungeon (`DungeonLink.descend`). */
export interface DungeonCarry {
  /** The entrance's dungeon (`Sim.dungeonSpec()`): its tier, twist and handcrafted flag. */
  spec?: DungeonSpec;
  dayT: number;
  hp: number;
  steam: number;
  reserve: number;
  scrap: number;
  hands?: Hands;
  /** The land's robots that ride down with him (D16), by their land id. */
  party?: (PartyBot & { id: number })[];
  /** Who follows him (a freed pilgrim, the Princess, the Ghost): down and back up beside him. */
  followers?: { id: string; name: string; ghost?: boolean }[];
}

/** What comes back up (`DungeonLink.climbOut`, `surface`). */
export interface DungeonBack {
  ok: boolean;
  hands: Hands;
  /** Each robot that went down: its oil, or destroyed below. */
  party: { id: number; hp: number; dead: boolean; down?: boolean }[];
  lost: number;
  copper: number;
  parts: Partial<Record<PartKind, number>>;
  items: string[];
  scrap: number;
  insight: number;
  hp: number;
  steam: number;
  reserve: number;
  killed: number;
  cleared: boolean;
}

/** Where the mission is: the seed, the land's biome, tier and anomaly, whether every NPC is already aboard (dev), and the dungeon being run, if any. */
export interface Landing {
  seed: number | string;
  /** A handcrafted land's id (`sim/lands.ts`): its map, its rules and no starting crew. */
  land?: string | null;
  biome: BiomeId;
  tier: number;
  anomaly: AnomalyId;
  allRescued: boolean;
  down: DungeonCarry | null;
  /** Missions flown, if not the save's (dev: `?flown=`): what is taught by now (`sim/lessons.ts`). */
  flown?: number;
}

type Args = ConstructorParameters<typeof Sim>;

/** What the mission knows of the quest book: whether act 5 is open, the fragments heard, the stall's pack. */
const questOpts = (): QuestOpts => {
  const b = questBook.get();
  // The dog's third step wants its toy dug up (P42): the first mound of a land holds it while the step is on and the toy is not home.
  return { fragmentsOpen: actFacts(hub.get(), b)['act.5.open'] === 1, heard: [...b.frags], pack: { ...b.pack }, toyHunt: stepOf(talkSave.get(), 'dog') === 3 && !b.items.includes('toy') };
};

/** A land: the lift's call, tier, anomaly, the pilgrim waiting here and the workshop's crew. */
const landOpts = (l: Landing): SimOptions => ({
  ...(l.land && { land: loadLand(l.land) }),
  call: hub.get().call,
  tier: l.tier,
  anomaly: l.anomaly,
  pilgrim: l.allRescued ? undefined : pilgrimIn(hub.get(), l.biome),
  crew: l.land === 'intro' ? [] : crewOf(roster.get()), // a new game owns none; the intro's old works are always played alone (sim/intro.ts)
  owned: roster.get().bots.map((b) => b.name), // level 1 lays no Bellows at his wreck once the intro has mended him
  types: knownTypes(roster.get()), // a type wreck of a known type holds nothing
  chassis: chassisStats(roster.get().chassis),
  titles: titleSave.get().earned,
  cards: liveCards(),
  city: districtFx(cityFx(hub.get().buildings?.built, { cat: hub.get().perks.includes('companionCat') }), hub.get()),
  quest: questOpts(),
  onboard: { shown: onboardSave.get().shown },
  flown: l.flown ?? hub.get().missions,
  dogName: dogNameOf(talkSave.get().flags),
  wife: hub.get().story?.wife, // P58: her voice on the antenna
});

/** A dungeon: no crew (the party is the land's), the entrance's spec and the clock the land had. */
const downOpts = (d: DungeonCarry): SimOptions => ({
  dungeon: d.spec ?? true,
  dayT: d.dayT,
  party: d.party,
  followers: d.followers,
  onboard: { shown: onboardSave.get().shown },
  flown: hub.get().missions,
  chassis: chassisStats(roster.get().chassis),
  titles: titleSave.get().earned,
  cards: liveCards(),
  city: districtFx(cityFx(hub.get().buildings?.built, { cat: hub.get().perks.includes('companionCat') }), hub.get()),
  dogName: dogNameOf(talkSave.get().flags),
});

/** The Sim's constructor arguments for this landing, one line per save slice. */
export function missionArgs(l: Landing): Args {
  const hands = l.down?.hands;
  return [
    l.seed,
    aboard(hub.get(), l.allRescued).map((n) => n.id),
    l.biome,
    hub.get().perks,
    hands ? { ...loadout.get(), weapons: hands.weapons, weapon: hands.weapon, secondary: hands.secondary } : loadout.get(),
    hands ? syncWeapons(gear.get(), hands) : gear.get(),
    l.down ? downOpts(l.down) : landOpts(l),
  ];
}

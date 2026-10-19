/**
 * Titles, plain TS: finishing an NPC's quest line (or another notable deed) earns one. Every title earned applies at once
 * (Minos: titles stack; balance comes later); one is worn at a time and shows under the Communicator's name, nothing more.
 * Data from `games/ludum-dare-60/docs/quests.md` ("Titles"). Each passive is an effect source (`sim/effects.ts`, `Source`):
 * `titleSources` hands over every earned title's, which the mission adds to its units (`sim/missionfx.ts`), and `titleStat` computes a
 * stat from the unconditional ones for the hub, which has no units.
 *
 * Add a title: a row in `TITLES` (quests.md has the passive; write it in the engine's shape, `gap` for any name the engine
 * lacks); a quest grants it with `title` on its `QuestDef` (`talk.ts`), anything else calls `earn`.
 */
import { CAT, DOCK } from '../sim/defs';
import type { Cond, Source, Stat } from '../sim/effects';

/** Who a passive changes: the Communicator, each of his robots, or the hub (a price). */
export type TitleOn = 'comm' | 'bots' | 'hub';

export interface TitleDef {
  name: string;
  deed: string;
  /** The passive in words (the quest log's tooltip). */
  passive: string;
  on: TitleOn;
  /** The passive as an effect source, id `title:<id>`. */
  source: Source;
  /** The source counts once for each of these (the sim adds it that many times): `augment` is each augment fitted. */
  per?: 'augment';
  /** What quests.md asks for that `effects.ts` has no name for yet, kept in the data cast to its type: the hub's stats are read by `titleStat`, the rest wait for the system that reads them. */
  gap?: string;
}

/** A stat, trigger or condition the engine lacks, written as quests.md names it. Grep `pending<` for the list; `titles.test.ts` pins it. */
const pending = <T>(v: unknown) => v as T;
/** A passive that holds always (while its condition does): a change of one stat. */
const always = (stat: Stat, mod: { add?: number; pct?: number; more?: number }, cond?: Cond): Source['effects'][number] => ({
  when: 'always',
  ...(cond && { if: cond }),
  do: { do: 'stat', stat, ...mod },
});
const src = (id: string, ...effects: Source['effects']): Source => ({ id: `title:${id}`, effects });

export const TITLES: Record<string, TitleDef> = {
  queenBreaker: {
    name: 'Queen-breaker', deed: 'First Hornet Queen kill', passive: '+5% damage to bosses', on: 'comm',
    source: src('queenBreaker', always('damage', { pct: 0.05 }, { is: 'tag', tag: 'boss', of: 'target' })),
  },
  harbingersBane: {
    name: "Harbinger's Bane", deed: 'Act 4', passive: 'Twisted auras burn your robots 20% less', on: 'bots',
    // The halo's burn is the sim's own (a Dark hit, `Sim.auras`); it reads this stat for the share a robot takes.
    source: src('harbingersBane', always('auraBurnTaken', { pct: -0.2 })),
  },
  farShore: {
    name: 'of the Far Shore', deed: 'Act 5', passive: 'The antenna warms from twice as far', on: 'comm',
    source: src('farShore', always(pending<Stat>('signalRange'), { pct: 1 })),
    gap: "stat signalRange: the consumer is the antenna's warmth range in fog.ts, which the mission does not run yet (P6); the stat name goes into the engine's `Stat` with it",
  },
  shepherdOfBrass: {
    name: 'Shepherd of Brass', deed: "Sprocket's quest line", passive: 'Robots move 5% faster', on: 'bots',
    source: src('shepherdOfBrass', always('speed', { pct: 0.05 })),
  },
  midnightGunner: {
    name: 'Midnight Gunner', deed: "Hob's quest line", passive: 'Shots at night hit 5% harder', on: 'comm',
    // quests.md writes it as an effect on a shot; an event effect's change lasts `for` seconds (one here: a burst of shots keeps it).
    source: src('midnightGunner', { when: 'shot', if: { is: 'time', phase: 'night' }, do: { do: 'stat', stat: 'damage', pct: 0.05, for: 1 } }),
  },
  patchworkSaint: {
    name: 'Patchwork Saint', deed: "Gasket's quest line", passive: '+3 oil per augment fitted', on: 'comm', per: 'augment',
    // Added once per augment fitted: `missionTitles` (sim/missionfx.ts) copies it that many times (`Sim` opts `augments`; none exist yet).
    source: src('patchworkSaint', always('maxHp', { add: 3 })),
  },
  theBoot: {
    name: 'The Boot', deed: "The Kicker's quest line", passive: 'Kicked crashes hit 10% harder', on: 'comm',
    // The sim reads it where a body crashes (`Sim.crash`: a boss into an arena prop today; kicked foes into walls come with P39).
    source: src('theBoot', always('crashDamage', { pct: 0.1 })),
  },
  theFaithful: {
    name: 'The Faithful', deed: "The Oracle's quest line", passive: 'When the Oracle speaks, a burst of haste (every 30 s at most)', on: 'comm',
    source: src('theFaithful', { when: 'oracle', cd: 30, do: { do: 'status', id: 'haste', duration: 3 } }),
  },
  pilgrimOfTheSign: {
    name: 'Pilgrim of the Sign', deed: 'Read the First Scripture', passive: 'Robots within five tiles of you hit 10% harder while you are not firing', on: 'comm',
    // D37 (Minos: "2 and 3"): the crew near him take a small buff while he holds fire. The numbers are guesses.
    source: src('pilgrimOfTheSign', { when: 'aura', r: 160, if: { is: 'not', cond: { is: 'tag', tag: 'firing', of: 'self' } }, do: { do: 'stat', stat: 'damage', pct: 0.1 } }),
  },
  farWalker: {
    name: 'Far Walker', deed: "The Expeditioner's quest line", passive: '+10% speed with no enemy near', on: 'comm',
    source: src('farWalker', always('speed', { pct: 0.1 }, { is: 'noFoe', tiles: 8 })),
  },
  architect: {
    name: 'Architect', deed: "The Planner's quest line", passive: 'Buildings cost 10% less scrap', on: 'hub',
    source: src('architect', always(pending<Stat>('buildingScrapCost'), { pct: -0.1 })),
    gap: 'hub stat buildingScrapCost (buildings cost copper until the scrap price lands)',
  },
  // The companions' lines (P42): read by the dog (`companions.ts`), the revive (`downed.ts`) and the graveyard (`placeplay.ts`).
  goodBoysFriend: {
    name: "Good Boy's Friend", deed: "The dog's quest line", passive: 'The dog barks 2 s earlier', on: 'comm',
    source: src('goodBoysFriend', always('barkWarning', { add: 2 })),
  },
  catsButler: {
    name: "The Cat's Butler", deed: "The cat's quest line", passive: 'Scrap gobs within a short way roll toward you', on: 'comm',
    source: src('catsButler', always('scrapMagnet', { add: CAT.butler })),
  },
  keeperOfTheShoot: {
    name: 'Keeper of the Shoot', deed: "The Green Shoot's quest line", passive: 'The graveyard heals 50% faster', on: 'comm',
    source: src('keeperOfTheShoot', always('graveyardHeal', { pct: 0.5 })),
  },
  // The mastery ladders' own titles (Minos: "different titles for completing those"; the lead's guesses): a ladder's last step earns its own, the story lines keep theirs above.
  heelOfFiveLands: {
    name: 'Heel of Five Lands', deed: "The Kicker's ladder, The Way of the Boot", passive: 'A kicked body slides 15% farther', on: 'comm',
    source: src('heelOfFiveLands', always('kickSlide', { pct: 0.15 })),
  },
  pageTurner: {
    name: 'The Page-turner', deed: "The Expeditioner's ladder, Every Ridge Charted", passive: 'Ruins give 10% more copper', on: 'comm',
    source: src('pageTurner', always('ruinCopper', { pct: 0.1 })),
  },
  haggler: {
    name: 'The Haggler', deed: "The Trader's ladder, Honest Brass", passive: 'Old tech sells to her for 10% more scrap', on: 'hub',
    source: src('haggler', always(pending<Stat>('junkSell'), { pct: 0.1 })),
    gap: "hub stat junkSell (the Trader's old-tech row reads it through titleStat, `relics.ts` `junkPrice`)",
  },
  signedInTriplicate: {
    name: 'Signed in Triplicate', deed: "The Planner's ladder, Plans in Brass", passive: 'Stations cost 10% less copper', on: 'hub',
    source: src('signedInTriplicate', always(pending<Stat>('stationCost'), { pct: -0.1 })),
    gap: 'hub stat stationCost (`state.ts` `stationCost` reads it through titleStat)',
  },
  // The Princess's ladder (P58 H, `princessdocks.ts`): read by `sim/docks.ts`; the lift is a dock too.
  keeperOfDocks: {
    name: 'Keeper of Docks', deed: "The Princess's ladder, the Docks", passive: 'Robots standing on the lift regain oil slowly', on: 'comm',
    source: src('keeperOfDocks', always('dockRegen', { add: DOCK.regen })),
  },
  valuedCustomer: {
    name: 'Valued Customer', deed: "The Trader's quest line", passive: "The Trader's wares cost 10% less", on: 'hub',
    source: src('valuedCustomer', always(pending<Stat>('boonCost'), { pct: -0.1 })),
    gap: "hub stat boonCost (the Trader's shelf reads it through titleStat)",
  },
};

// A title's source says what it is and who it is, for the stats screen (`Effects.explain` lists it by `kind` and `name`).
for (const d of Object.values(TITLES)) d.source = { ...d.source, kind: 'title', name: d.name };

/** What a save keeps: titles earned (in order) and the one worn. */
export interface Titles { earned: string[]; worn: string | null }
export const freshTitles = (): Titles => ({ earned: [], worn: null });

/** Earn a title (once); the first one earned is worn at once, later ones wait to be put on. */
export function earn(t: Titles, id: string): Titles {
  if (!TITLES[id] || t.earned.includes(id)) return t;
  return { earned: [...t.earned, id], worn: t.worn ?? id };
}

/** Wear an earned title (null: none). */
export function wear(t: Titles, id: string | null): Titles {
  return id === null || t.earned.includes(id) ? { ...t, worn: id } : t;
}

/** The next earned title after the worn one, then none, then round again (a click on the name plate). */
export function nextWorn(t: Titles): Titles {
  if (!t.earned.length) return t;
  const i = t.worn === null ? -1 : t.earned.indexOf(t.worn);
  return { ...t, worn: i + 1 < t.earned.length ? t.earned[i + 1] : null };
}

/** How the Communicator is named with the title worn: "The Communicator, Valued Customer", "The Communicator of the Far Shore". */
export function styled(t: Titles, name = 'The Communicator'): string {
  const d = t.worn ? TITLES[t.worn] : undefined;
  if (!d) return name;
  return /^of /.test(d.name) ? `${name} ${d.name}` : `${name}, ${d.name}`;
}

/** Every earned title, in the order earned (what applies; the worn one only names the Communicator). */
export const earnedTitles = (t: Titles): TitleDef[] => t.earned.flatMap((id) => (TITLES[id] ? [TITLES[id]] : []));

/**
 * The effect sources of every title earned, worn or not, for the units they change (`on`): the mission adds them with
 * `fx.addSource`. A source marked `per` is added once per count (`titleCount`): the sim gives each copy its own id
 * suffix (`title:patchworkSaint#2`), since a unit holds a source id once.
 */
export function titleSources(t: Titles, on?: TitleOn): { def: TitleDef; source: Source }[] {
  return earnedTitles(t).filter((d) => !on || d.on === on).map((def) => ({ def, source: def.source }));
}

/**
 * A stat after the unconditional passives of every title earned for `on`: (base + add) * (1 + pct) * more, as the
 * engine does it. `counts` are the numbers a `per` title scales by (`{ augment: 2 }`). For what has no units (the hub's
 * prices); in a mission the engine does this, with the conditions.
 */
export function titleStat(t: Titles, on: TitleOn, stat: string, base = 0, counts: { augment?: number } = {}): number {
  let add = 0, pct = 0, more = 1;
  for (const { def, source } of titleSources(t, on)) {
    const times = def.per ? counts[def.per] ?? 0 : 1;
    for (const e of source.effects) {
      if (e.when !== 'always' || e.if) continue;
      for (const a of Array.isArray(e.do) ? e.do : [e.do]) {
        if (a.do !== 'stat' || (a.stat as string) !== stat) continue;
        add += (a.add ?? 0) * times;
        pct += (a.pct ?? 0) * times;
        more *= (a.more ?? 1) ** times;
      }
    }
  }
  return (base + add) * (1 + pct) * more;
}

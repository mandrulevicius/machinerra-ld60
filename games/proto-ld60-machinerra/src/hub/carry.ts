/**
 * What a mission hands to the missions after it, as persistent slices (`persist`, `save.ts`): the `loadout` (weapons found,
 * the one in hand, unlocked air support calls), the running `totals` of the missions' stats and the kinds of place
 * `discovered`. The hub's own state (parts including the Queen's Crown, rescued NPCs, city, specialty, perks) is the
 * `hub` slice; scrap, insight, cores, the spare oil in stock and the air support charges left are the `economy` slice
 * (`economy.ts`); your robots are the `roster` slice (`workshop.ts`: a lift that docks wrecks those left on the sands) and the
 * deed gauges the `deeds` profile that New game keeps (`deeds.ts`). `land` is the one place a finished mission feeds them all; `Play.create` takes the cans and charges
 * back out (`depart`). State that outlives a mission lives in a registered slice and nowhere else: `src/saveaudit.ts`.
 */
import { freshLoadout, cleanLoadout, type Loadout } from '../sim/loadout';
import { persist, hub } from './save';
import type { HudId } from '../sim/onboard';
import { RESCUE_THANKS, aboard, aboardFacts, arrive, freedBy, npc, type Haul, type HubState } from './state';
import { homecoming } from './princess';
import { princessSave } from './princessslice';
import { cleanGear, freshGear, gearWeapons, slotWeapons, syncWeapons, type Gear } from '../sim/gear';
import { bank, economy, gain } from './economy';
import { finish } from './buildings';
import { DISTRICT, STAGES, finishDistrict } from './district';
import { settle, withExpedition } from './expeditions';
import { autoStart, count } from './lines';
import { catHome, companionsAfter } from './companions';
import { bondSave, lineSave, questBook, talkSave, titleSave } from './talkslice';
import { lightBond } from './bonds';
import { bankPick } from './research';
import { researchSave } from './researchslice';
import { earn } from './titles';
import { actFacts } from './acts';
import type { QuestBook } from './questbook';
import { jobDone } from './repeats';
import { payJob } from './questpay';
import { fill, profile } from './deeds';
import { fetchRobots, landRoster, roster } from './workshop';
import type { SpecId } from '../sim/specs';

// Version 2: any weapon may be the primary with the secondary free. A save from before the two slots (no `secondary` at
// all) had the gun in hand: the shovel becomes the primary and the gun the secondary.
const loadoutSample: Loadout = {
  weapons: ['shovel', 'steamGun'],
  weapon: 'steamGun',
  secondary: 'shovel',
  support: ['barrage', 'drop'],
};
const loadoutSlice = persist<Loadout>('loadout', freshLoadout, {
  version: 2,
  sample: loadoutSample,
  migrate: (old) => {
    const o = old as Partial<Loadout> | null;
    return o && o.secondary === undefined && o.weapon && o.weapon !== 'shovel' ? { ...o, weapon: 'shovel', secondary: o.weapon } : old;
  },
});
/** `get` drops what this build no longer knows (a removed weapon or call) instead of losing the rest. */
export const loadout = { get: () => cleanLoadout(loadoutSlice.get()), set: loadoutSlice.set };

/**
 * The gear (`sim/gear.ts`): items owned and what is worn where. `get` lines it up with the loadout's weapons (a weapon
 * found on the sands becomes a Standard item in its slot); `wear` writes both, so the loadout's weapon slots follow the
 * inventory.
 */
const gearSample: Gear = {
  items: [
    { uid: 1, id: 'shovel', q: 'standard', mods: [13] },
    { uid: 2, id: 'steamGun', q: 'fine', mods: [12] },
    { uid: 3, id: 'hornetHead', q: 'rare' },
    { uid: 4, id: 'deepHose', q: 'epic' },
    { uid: 5, id: 'rivetRepeater', q: 'standard' },
    { uid: 6, id: 'wideNozzle', q: 'legendary' },
    { uid: 7, id: 'scrapPlating', q: 'fine' },
    { uid: 8, id: 'lampOfFaith', q: 'rare' },
    { uid: 9, id: 'gaugeEyes', q: 'standard' },
    { uid: 10, id: 'waspLantern', q: 'fine' },
    { uid: 11, id: 'stingerBlades', q: 'rare' },
    { uid: 12, id: 'ricochetCog', q: 'standard' },
    { uid: 13, id: 'tuningFork', q: 'standard' },
  ],
  comm: { primary: 2, secondary: 1, head: 3 },
  bots: {
    gatherer: { arms: 4 },
    guard: { arms: 5 },
    repairer: { arms: 6 },
    mule: { back: 7 },
    marksman: { back: 8 },
    boilermancer: { head: 9 },
    lamplighter: { back: 10 },
    stalker: { arms: 11 },
  },
  next: 14,
  crafted: 3,
  lugs: 2,
  modPicks: [['bootSpur', 'magnetHead']],
  heart: true,
};
const gearSlice = persist<Gear>('gear', freshGear, { sample: gearSample });
export const gear = {
  get: () => syncWeapons(cleanGear(gearSlice.get()), loadout.get()),
  set: (g: Gear) => {
    const l = loadout.get();
    const w = slotWeapons(g);
    loadout.set(cleanLoadout({ ...l, ...w, weapons: [...new Set([...l.weapons, ...gearWeapons(g)])] }));
    return gearSlice.set(g);
  },
};

/** Lifetime counts: every mission's `Sim.stats` added up. */
export type Totals = Record<string, number>;
export const totals = persist<Totals>('totals', () => ({}), {
  valid: (t) => Object.values(t).every((n) => Number.isFinite(n)),
  sample: { killed: 41, kickKills: 6, crashKills: 2, ruins: 9, ruinsBroken: 1, nests: 4 },
});

/** The kinds of place the Communicator has come upon on any land (`PlaceId`s, in the order found). */
export interface Discovered { places: string[] }
export const discovered = persist<Discovered>('discovered', () => ({ places: [] }), {
  sample: { places: ['shrine', 'mast', 'graveyard'] },
});

/** The HUD elements the player has been shown (`sim/onboard.ts`): a run that starts with an empty HUD starts from these, and its reveals come home in the haul (`Haul.onboard`). */
export interface OnboardSave { shown: HudId[] }
export const onboardSave = persist<OnboardSave>('onboard', () => ({ shown: [] }), {
  sample: { shown: ['face', 'oil', 'clock'] },
});

/** The mission stats that are worth a lifetime count (not the lift's saved/left). */
export const TOTALS = ['killed', 'kickKills', 'crashKills', 'ruinsBroken', 'nests', 'lost', 'gathered', 'parts', 'winched', 'revived', 'strikes', 'ruins'];

/** What a mission adds to the quest book: the best haul of robots, the Oracle's advice heeded and ignored, the fragments of the princess's signal heard (`sim/questcount.ts`). */
export function bookAfter(b: QuestBook, stats: Record<string, number>, biome: string): QuestBook {
  const frags = (['mast', 'oil'] as const).filter((k) => stats[`frag.${k}`]).map((k) => `${k}:${biome}`).filter((f) => !b.frags.includes(f));
  return {
    ...b,
    savedBest: Math.max(b.savedBest, stats.saved ?? 0),
    obeyed: b.obeyed + (stats.obeyed ?? 0),
    ignored: b.ignored + (stats.ignored ?? 0),
    frags: [...b.frags, ...frags],
    oilTrips: b.oilTrips + (stats['drank.starOil'] ?? 0),
    signHung: b.signHung || !!stats.signHome,
    pack: { ...b.pack, biscuits: Math.max(0, (b.pack.biscuits ?? 0) - (stats['ate.biscuits'] ?? 0)), starOil: Math.max(0, (b.pack.starOil ?? 0) - (stats['drank.starOil'] ?? 0)) },
  };
}

/** Her line's A Clean Return (P58): every robot that went down came home, and none went down on the way (`Sim.stats.downed`). */
export const cleanReturn = (h: Haul) => ((h.went?.length ?? 0) > 0 && h.robots.filter((r) => r.uid).length >= (h.went?.length ?? 0) && !h.carry?.stats.downed ? 1 : 0);

/** The land's repeatable job, settled with what the mission carried: done pays its reward, the job clears either way (`lastJob` is what the hub says on returning). */
export function settleJob(b: QuestBook, stats: Record<string, number>, seed: string): QuestBook {
  const job = b.job;
  if (!job) return b;
  const done = jobDone(job, stats);
  const text = done ? payJob(job, seed) : `Not done: ${job.task}.`;
  return { ...b, job: null, lastJob: { text, done }, repeatsDone: done ? { ...b.repeatsDone, [job.giver]: (b.repeatsDone[job.giver] ?? 0) + 1 } : b.repeatsDone };
}

/**
 * The lift docks: the hub takes the haul, and the loadout, totals and the NPC quest lines take what the mission carried
 * (the lines count it in the biome flown, `s.biome`). Arriving twice with one haul changes nothing.
 */
export function land(s: HubState, h: Haul): HubState {
  return landed(s, h).state;
}

/** `land`, and the specs the mission's deeds opened (for the hub to announce: `deeds.ts` `announce`). */
export function landed(s: HubState, h0: Haul): { state: HubState; unlocked: SpecId[]; news: string[] } {
  // The colony's expedition that went out with the last lift comes home in this haul, once (`expeditions.ts`).
  const h = withExpedition(s, h0);
  let next = arrive(s, h);
  let unlocked: SpecId[] = [];
  let news: string[] = [];
  let cores = 0;
  const rose: string[] = [];
  if (next !== s) {
    // The expedition is home; what was going up in the D-city stands now (`buildings.ts`).
    const done = finish(settle(next, h));
    const up = finishDistrict(done.hub);
    next = up.hub;
    cores = done.cores;
    if (up.stage) rose.push(`${STAGES[up.stage - 1].name} stands in the Rising District: ${up.stage * DISTRICT.crowd} civilians live there now. The City Planner has a pick of three city perks for you.`);
  }
  if (next !== s && h.carry) {
    loadout.set(cleanLoadout(h.carry.loadout));
    const t = { ...totals.get() };
    for (const k of TOTALS) if (h.carry.stats[k]) t[k] = (t[k] ?? 0) + h.carry.stats[k];
    totals.set(t);
    // The quests (P38): the best haul of robots on one lift, then every open step counts the mission (the acts' facts decide which are open).
    if (h.carry.stats.scripture) titleSave.set(earn(titleSave.get(), 'pilgrimOfTheSign')); // the First Scripture read (P36)
    // The companions (P42): the dog home on the lift, the stray tamed, the boot and the toy; the special lines that start themselves (`lines.ts` `autoStart`).
    const jobBefore = questBook.get().job;
    const comp = companionsAfter(next, questBook.get(), h.carry.stats);
    next = comp.hub;
    news = comp.news;
    questBook.set(comp.book);
    talkSave.set(autoStart(talkSave.get(), { ...actFacts(next, questBook.get()), ...aboardFacts(next), missions: next.missions }));
    questBook.set(settleJob(bookAfter(questBook.get(), h.carry.stats, s.biome), { ...h.carry.stats, scrap: h.scrap ?? 0, copper: h.copper ?? 0, home: 1 }, h.id));
    // A repeatable paid at the dock hands in a quest to its giver: their track lights a step (P52, `bonds.ts`).
    const jobGiver = questBook.get().lastJob?.done && jobBefore ? jobBefore.giver : '';
    const lit = jobGiver ? lightBond(bondSave.get(), jobGiver) : null;
    if (lit?.lit) {
      bondSave.set(lit.bond);
      news = [...news, `${npc(jobGiver)?.name ?? jobGiver}: ${lit.step}`];
    }
    lineSave.set(count(lineSave.get(), talkSave.get(), { ...h.carry.stats, scrap: h.scrap ?? 0, copper: h.copper ?? 0, clean: cleanReturn(h) }, s.biome, actFacts(next, questBook.get())));
    // What each kind of bot did fills the deed gauges, as `lines` fill: only a lift that docked counts.
    const filled = fill(profile.get(), h.carry.stats);
    profile.set(filled.profile);
    unlocked = filled.unlocked;
  }
  if (next !== s) {
    // What was picked up on the sands joins the stock (scrap, insight, cores, copper, charges left; the colony's thanks for the NPCs freed), and the places found are kept.
    economy.set(bank(economy.get(), h, freedBy(s, h) * RESCUE_THANKS));
    if (catHome(next)) economy.set(gain(economy.get(), 'scrap', catHome(next))); // the cat at home leaves scrap with every return, this one too if it just came home (P42)
    if (cores) economy.set(gain(economy.get(), 'cores', cores));
    researchSave.set(bankPick(researchSave.get(), h.id, (h.insight ?? 0) > 0)); // the stage's card, if it found insight; kept until spent (research.ts)
    // Robots that went down and did not ride back up are wrecks in the workshop.
    roster.set(fetchRobots(landRoster(roster.get(), h), h.fetched));
    if (h.fetched?.length) economy.set({ ...economy.get(), cores: Math.max(economy.get().cores, roster.get().bots.length) });
    // The Princess (P58): she sweeps the deck while he is out and leaves a pile, or, gone, the deck gathers dust (`princess.ts`).
    princessSave.set(homecoming(princessSave.get(), {
      was: s.story?.wife ?? 'none',
      now: next.story?.wife ?? 'none',
      biome: s.biome,
      crew: aboard(next).filter((n) => n.id !== 'princess').map((n) => n.id),
      id: h.id,
      brought: Object.values(h.parts).some((n) => (n ?? 0) > 0) || !!h.junk?.length,
      perks: next.perks,
    }));
    if (h.discovered?.length) discovered.set({ places: [...new Set([...discovered.get().places, ...h.discovered])] });
    if (h.onboard?.length) onboardSave.set({ shown: [...new Set([...onboardSave.get().shown, ...h.onboard])] });
  }
  return { state: hub.set(next), unlocked, news: [...news, ...rose] };
}

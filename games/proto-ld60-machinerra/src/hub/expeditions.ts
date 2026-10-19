/**
 * The colony's expeditions, plain TS (no Phaser): unmanned errands that go out while the lift is down and are not your robots
 * (Minos on D24: every robot you own goes down with you). **Feed an expedition coal and it brings scrap back** (Minos: "coal is
 * for fuel for expeditions"): coal in, scrap out; sometimes a junk relic or a charted land besides.
 *
 * - **Feed it:** `load` moves coal from the stock onto the expedition at the Expedition office (the Expeditioner's station).
 * - **It departs with the lift:** `dispatch` (the lift is lowered) sends what is loaded; an expedition already out stays out and
 *   the new coal waits. No coal, no errand.
 * - **It returns once per departure:** when the next lift docks, `withExpedition` puts its result in the haul (`Haul.expedition`),
 *   `economy.ts` `bank` banks the scrap and junk, `settle` clears it and keeps the charted land. The Boiler Cathedral
 *   (`buildings.ts`) adds half again to the scrap.
 * - **A charted land** shows its places on the course table (`landings.ts` `Land.charted`, a report card in `command.ts`).
 *
 * Numbers are first guesses (`EXPEDITION`).
 */
import { rng } from '../../../../harness/kit/rng';
import { isUnique, RELIC_IDS } from '../sim/junk';
import { BIOMES, type BiomeId } from '../sim/defs';
import { BUILDINGS, CATHEDRAL_BONUS, hasBuilding, isBuildingId, type BuildingId } from './buildings';
import type { Books } from './economy';
import { opened } from './landings';
import { freshExpedition, isWorking, type ExpeditionResult, type ExpeditionState, type Haul, type HubState } from './state';

/** The Green Shoot growing: the colony's expeditions bring back this share more (quests.md `shoot.2`). */
export const SHOOT_BONUS = 0.1;

export const EXPEDITION = {
  /** Scrap brought back for each coal burned (a seam holds 24 coal). */
  scrapPerCoal: 2,
  /** The chance a departure also brings back a junk relic, and the chance it charts a land. */
  junk: 0.25,
  chart: 0.25,
  /** The office's buttons load this much coal at a time. */
  step: 10,
};

const ex = (s: Pick<HubState, 'expedition'>): ExpeditionState => ({ ...freshExpedition(), ...s.expedition });
const whole = (n: unknown) => (Number.isFinite(n) ? Math.max(0, Math.floor(n as number)) : 0);

/** Coal on the expedition for the next departure. */
export const loaded = (s: Pick<HubState, 'expedition'>) => ex(s).load;
/** Coal out with an expedition that has not come home yet. */
export const away = (s: Pick<HubState, 'expedition'>) => ex(s).out;

/**
 * Feed (`n` > 0) or take back (`n` < 0) coal: it moves between the stock and the expedition's load, at most what there is.
 * Throws with the reason when the Expedition office does not stand.
 */
export function load(b: Books, n: number, all = false): Books {
  if (!isWorking(b.hub, 'expeditioner', all)) throw new Error('the Expedition office is not at work: rescue the Expeditioner and build it first');
  const e = ex(b.hub);
  const move = n >= 0 ? Math.min(whole(n), b.eco.coal) : -Math.min(whole(-n), e.load);
  return { eco: { ...b.eco, coal: b.eco.coal - move }, hub: { ...b.hub, expedition: { ...e, load: e.load + move } } };
}

/** The lift is lowered: the loaded coal departs, unless an expedition is still out (then it waits). */
export function dispatch(s: HubState): HubState {
  const e = ex(s);
  if (e.out > 0 || e.load <= 0) return s;
  return { ...s, expedition: { ...e, out: e.load, load: 0, sent: (e.sent ?? 0) + 1 } };
}

/** What an expedition that burned `coal` brings back, seeded by the haul it comes home in: scrap, and sometimes junk or a charted land. */
export function resultOf(s: HubState, coal: number, haulId: string): ExpeditionResult {
  const r = rng(`expedition:${haulId}`);
  const mul = (hasBuilding(s, 'cathedral') ? 1 + CATHEDRAL_BONUS : 1) * (s.perks.includes('shootGrows') ? 1 + SHOOT_BONUS : 1); // the Green Shoot's forest: +10% (shoot.2)
  const out: ExpeditionResult = { coal, scrap: Math.round(coal * EXPEDITION.scrapPerCoal * mul) };
  if (r.fork('junk').chance(EXPEDITION.junk)) out.junk = r.fork('relic').pick(RELIC_IDS.filter((id) => !isUnique(id)));
  const lands = opened(s.story?.bosses ?? []).filter((id) => !ex(s).charted.includes(id));
  if (lands.length && r.fork('chart').chance(EXPEDITION.chart)) out.charted = r.fork('land').pick(lands);
  return out;
}

/** The haul a lift brings, with the expedition that went out with the last one added (once: a haul that already carries it, or that was already taken in, changes nothing). */
export function withExpedition(s: HubState, h: Haul): Haul {
  if (h.expedition || s.lastHaul?.id === h.id) return h;
  const coal = away(s);
  return coal > 0 ? { ...h, expedition: resultOf(s, coal, h.id) } : h;
}

/** The haul has been taken in: the expedition is home (nothing is out), and a land it charted stays charted. */
export function settle(s: HubState, h: Haul): HubState {
  const e = ex(s), r = h.expedition;
  if (!r) return s;
  return { ...s, expedition: { ...e, out: 0, charted: r.charted && !e.charted.includes(r.charted) ? [...e.charted, r.charted] : e.charted } };
}

/** A line for the banner when the expedition is home. */
export function homeLine(r: ExpeditionResult, landName: (id: string) => string = (id) => id): string {
  const bits = [`${r.scrap} scrap`, r.junk && 'some junk', r.charted && `a chart of ${landName(r.charted)}`].filter(Boolean);
  return `The expedition is home with ${bits.join(', ')}.`;
}

/** What a lift's docking changed in the D-city, as banner lines: the expedition home, the buildings that now stand. */
export function homeNews(before: HubState, after: HubState): string[] {
  const r = after.lastHaul?.expedition;
  const stood = (before.buildings?.raising ?? []).filter((id) => after.buildings?.built.includes(id) && isBuildingId(id));
  return [
    ...(r && before.lastHaul?.id !== after.lastHaul?.id ? [homeLine(r, (id) => BIOMES[id as BiomeId]?.name ?? id)] : []),
    ...stood.map((id) => `${BUILDINGS[id as BuildingId].name} stands in the D-city.`),
  ];
}

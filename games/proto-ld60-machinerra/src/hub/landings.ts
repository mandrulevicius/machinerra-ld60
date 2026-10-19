/**
 * The course table's lands (P40; systems.md "Landings"), plain TS, no Phaser. Where the lift goes down is the run's main
 * choice between missions, and it is free: the player picks any opened land, knowing its dangers and values.
 *  - **Lands open by bosses** (Minos, 2026-10-18: "lands open after beating previous boss"): the desert always; each next land,
 *    in `BIOMES[...].rank` order, once the boss of the land before it is down (`HubState.story.bosses`). The secret land (the
 *    Ether) keeps its story gating (`ether`).
 *  - **The threat tier is fixed by the land's rank** (`tierOf`: I, I, II, II, III), so a land's dangers are known before landing.
 *    It feeds `Sim.tier` (a dungeon's length, enemy tiers, elite traits).
 *  - **The anomaly is rolled each time the lift is lowered** (`launch` bumps `HubState.course`), for every opened land, and
 *    shown before the pick; each lowering gets a new seed. It feeds `Sim.anomaly` (`ANOMALIES`, `sim/clock.ts`).
 *  - **Dangers shown:** tier, foes (each with the damage types it is weak to and resists) and the boss with whether it is down,
 *    the anomaly. **Values shown:** what the land is rich in (parts, a copper lean), the places already found there, the NPC
 *    stranded there (`pilgrimIn`: a missed NPC stays on the land where they were missed), and quest pips (P38's slot: empty
 *    until quests land).
 * The dev tools (`Hub` `hub lands|land|open|lock|boss|tier|anomaly`) change what is open or override the picked land without
 * touching anything else.
 */
import { rng } from '../../../../harness/kit/rng';
import { clampTier, type Tier } from '../sim/dungeon';
import { ANOMALIES, BIOMES, ENEMY_PARTS, PARTS, type AnomalyId, type BiomeId, type Enemy } from '../sim/defs';
import { pilgrimIn, type HubState } from './state';

export interface Land {
  biome: BiomeId;
  /** Fixed by the land's rank. */
  tier: Tier;
  /** Rolled for this lowering of the lift. */
  anomaly: AnomalyId;
  /** The land's seed for this lowering. */
  seed: number;
  /** Its machines (the boss is `boss`, not here). */
  foes: Enemy[];
  /** The boss that arrives at dusk or holds the castle, and whether it is already down. */
  boss: Enemy | null;
  bossDown: boolean;
  /** What the land is rich in: the parts its machines drop. */
  rich: string[];
  /** Its ruins pay this many times the usual copper (the Hollow City leans copper); 1 when they pay the usual. */
  copper: number;
  /** Kinds of place already found here. */
  found: string[];
  /** The NPC waiting here (an NPC id), if the land has a pilgrim place and one is left to rescue. */
  stranded: string | null;
  /** The places a land holds, once an expedition has charted it (`expeditions.ts`); null: not charted. */
  charted: string[] | null;
  /** P38's repeatable quest for this land, and the pips for active steps it can advance. Empty until quests land. */
  repeatable: string | null;
  pips: string[];
}

export const NUMERALS = ['I', 'II', 'III'] as const;
export const tierName = (t: number) => NUMERALS[clampTier(t) - 1];

/** A land's threat tier: fixed by its rank, one more every two lands up to III. */
export const tierOf = (id: BiomeId): Tier => clampTier(Math.ceil(BIOMES[id].rank / 2));

/** The lands that open in order (secret ones are story destinations). */
export const RANKED = (Object.keys(BIOMES) as BiomeId[]).filter((id) => !BIOMES[id].secret).sort((a, b) => BIOMES[a].rank - BIOMES[b].rank);

/** The boss of a land: the evening boss that arrives (`dusk`), else the one that waits in its place (the castle, the church). */
export const landBoss = (id: BiomeId): Enemy | null => BIOMES[id].dusk ?? (BIOMES[id].places.includes('castle') ? 'drone' : BIOMES[id].places.includes('church') ? 'evilOracle' : null);

/** The lands open to the course table, lowest rank first: each one once the boss of the land before it is down; the secret land when the story opens it. */
export function opened(bosses: readonly string[], ether = false): BiomeId[] {
  const out: BiomeId[] = [];
  for (const id of RANKED) {
    out.push(id);
    const b = landBoss(id);
    if (!b || !bosses.includes(b)) break;
  }
  if (ether) out.push('ether');
  return out;
}

/** A land's anomaly, drawn by the anomalies' weights among those that fit the land. */
export function rollAnomaly(r: ReturnType<typeof rng>, biome: BiomeId): AnomalyId {
  const fit = (Object.keys(ANOMALIES) as AnomalyId[])
    .filter((id) => ANOMALIES[id].weight > 0 && (!ANOMALIES[id].biomes || ANOMALIES[id].biomes!.includes(biome)))
    .map((id) => [id, ANOMALIES[id].weight] as const);
  return fit.length ? r.weighted(fit) : 'plain';
}

/** A land with everything it shows that follows from the land, the anomaly and the save. */
export function landFor(biome: BiomeId, anomaly: AnomalyId, tier: number, seed: number, s: Pick<HubState, 'rescued' | 'stranded' | 'found' | 'story'> & Partial<Pick<HubState, 'expedition'>>): Land {
  const B = BIOMES[biome], boss = landBoss(biome);
  return {
    biome, anomaly, tier: clampTier(tier), seed,
    foes: [...new Set([...B.foes.map(([k]) => k), ...(Object.keys(B.mix ?? {}) as Enemy[]), ...(B.edge ? [B.edge] : [])])],
    boss, bossDown: !!boss && (s.story?.bosses ?? []).includes(boss),
    rich: [...new Set(B.foes.map(([k]) => PARTS[ENEMY_PARTS[k].part].name))],
    copper: B.copperMul ?? 1,
    found: s.found?.[biome] ?? [],
    stranded: B.places.includes('pilgrim') ? pilgrimIn(s, biome) : null,
    charted: s.expedition?.charted?.includes(biome) ? [...B.places] : null,
    repeatable: null, pips: [],
  };
}

/** This visit's lands: every opened one, with its tier, this lowering's anomaly and seed. `ether`: the main quest has opened the secret land. */
export function landings(s: Pick<HubState, 'missions' | 'course' | 'rescued' | 'stranded' | 'found' | 'story'> & Partial<Pick<HubState, 'expedition'>>, o: { ether?: boolean } = {}): Land[] {
  return opened(s.story?.bosses ?? [], o.ether).map((id) => {
    const r = rng(`landings:${s.missions}:${s.course}:${id}`);
    // The second mission (the first hub visit) goes to the desert under a Plain Sky (level-1.md); the weather rolls from the third on.
    const plain = id === 'ether' || (id === 'desert' && s.missions === 1);
    return landFor(id, plain ? 'plain' : rollAnomaly(r.fork('anomaly'), id), tierOf(id), r.int(1, 999999), s);
  });
}

/** The picked land: the save's pick if it is open, else the first (a saved pick can be locked again). */
export const picked = (lands: Land[], biome: BiomeId | undefined) => lands.find((l) => l.biome === biome) ?? lands[0];

/** The land's one-line summary, for the dev command and logs. */
export const describeLand = (l: Land) => `${BIOMES[l.biome].name}, tier ${tierName(l.tier)}, ${ANOMALIES[l.anomaly].name}, land ${l.seed}${l.boss ? `, boss ${l.bossDown ? 'down' : 'up'}` : ''}${l.stranded ? `, ${l.stranded} stranded` : ''}`;

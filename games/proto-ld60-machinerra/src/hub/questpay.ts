/**
 * What a quest pays beyond the dialog's own rewards (P38): a Fine gear item, research picks, a punch card put first in the next
 * offer, AI cores, a title. `Hub.flush` calls `payExtras` after `giveReward`; each returns the banner it earned. Plain slices, no scene.
 * Add a kind: a field on `Reward` (`dialog.ts`), a branch here.
 */
import { ITEMS, addItem, addLug, itemIds, owned, ownedMods, tunable, weaponKind, type ItemId } from '../sim/gear';
import { MODS, MOD_IDS, modFits, type ModId } from '../sim/defs/mods';
import { rng } from '../../../../harness/kit/rng';
import { grantBoost, profile } from './deeds';
import { teacherOf } from './taught';
import { REWARD_NAMES, RUSH_COPPER, type Job } from './repeats';
import { questBook } from './talkslice';
import { princessSave } from './princessslice';
import type { Reward } from './dialog';
import { gear } from './carry';
import { economy } from './economy';
import { RESEARCH, cardOf } from './research';
import type { Research } from './research';
import { researchSave } from './researchslice';
import { titleSave } from './talkslice';
import { TITLES, earn } from './titles';

/** A card on its way: a pick joins the count and the card is put first in the offer (a card already yours is just the pick). */
export function grantCard(r: Research, id: string): Research {
  if (!cardOf(id)) return r;
  const credit = r.credit + 1;
  return r.owned.includes(id) ? { ...r, credit } : { ...r, credit, offer: [id, ...r.offer.filter((c) => c !== id)].slice(0, RESEARCH.offered) };
}

/** Pay the extras of a reward; returns the banners (what arrived). */
export function payExtras(r: Reward): string[] {
  const out: string[] = [];
  if (r.item && ITEMS[r.item as ItemId]) {
    gear.set(addItem(gear.get(), r.item as ItemId, 'fine').gear);
    out.push(`Received: ${ITEMS[r.item as ItemId].name}`);
  }
  if (r.lugs && r.lugs >= 2) {
    gear.set(addLug(gear.get()));
    out.push('Hob puts a second lug on every weapon: it can carry two mods');
  }
  if (r.card) {
    researchSave.set(grantCard(researchSave.get(), r.card));
    out.push(`A research pick, with ${cardOf(r.card)?.name ?? 'a card'} first on offer`);
  }
  if (r.picks) {
    const s = researchSave.get();
    researchSave.set({ ...s, credit: s.credit + r.picks });
    out.push(`${r.picks} more research pick${r.picks === 1 ? '' : 's'} at the church`);
  }
  if (r.cores) {
    economy.set({ ...economy.get(), cores: economy.get().cores + r.cores });
    out.push(`${r.cores} AI core${r.cores === 1 ? '' : 's'}`);
  }
  if (r.title && TITLES[r.title]) {
    titleSave.set(earn(titleSave.get(), r.title));
    out.push(`Title: ${TITLES[r.title].name}`);
  }
  return out;
}

/** A Fine piece of gear of `kind` the Communicator does not own yet (seeded, so a replay pays the same); the first of the kind when he has them all. */
function pieceOf(kind: 'weapon' | 'body', seed: string): ItemId {
  const g = gear.get();
  const all = itemIds.filter((id) => (kind === 'weapon' ? ITEMS[id].weapon && teacherOf(id) === 'hob' : ITEMS[id].comm && !ITEMS[id].weapon && teacherOf(id) === 'gasket'));
  const fresh = all.filter((id) => !g.items.some((o) => o.id === id));
  return rng(seed).pick(fresh.length ? fresh : all);
}

/**
 * The Fitted mod's pick of two (Hob's repeatable): mods you do not own and are not already owed, regular ones; at tier III one of
 * the two is a wild one. Seeded, so a replay pays the same. Fewer than two when few are left; none when you have them all.
 */
export function fittedPick(g: ReturnType<typeof gear.get>, seed: string, tier: number): ModId[] {
  const held = new Set<ModId>([...ownedMods(g), ...(g.modPicks ?? []).flat()]);
  const r = rng(seed);
  // It is fitted free on the weapon in hand, so the pair prefers mods that fit the weapons in the slots (a shovel: the melee and "any" ones).
  const kinds = new Set((['primary', 'secondary'] as const).map((s) => weaponKind(owned(g, g.comm[s]))).filter((k): k is 'gun' | 'melee' => !!k));
  const fits = (m: ModId) => [...kinds].some((k) => modFits(m, k));
  const pool = (wild: boolean) => {
    const all = MOD_IDS.filter((m) => !!MODS[m].wild === wild && !held.has(m));
    const mine = all.filter(fits);
    return wild || mine.length >= 2 ? mine : all;
  };
  const reg = pool(false);
  const wild = MOD_IDS.filter((m) => MODS[m].wild && !held.has(m));
  const wildMine = wild.filter(fits);
  const out: ModId[] = [];
  if (tier >= 3 && wild.length) out.push(r.pick(wildMine.length ? wildMine : wild));
  while (out.length < 2 && reg.length) out.push(...reg.splice(reg.indexOf(r.pick(reg)), 1));
  while (out.length < 2 && wild.length > out.filter((m) => MODS[m].wild).length) out.push(r.pick(wild.filter((m) => !out.includes(m))));
  return out;
}

/** Pay a repeatable job done (`repeats.ts`): what its reward is, in what the game has. Returns the banner. */
export function payJob(job: Job, seed: string): string {
  const r = job.reward;
  const extra: string[] = [];
  if (r === 'stripe') profile.set(grantBoost(profile.get(), 'auto').profile);
  else if (r === 'weapon' || r === 'body') extra.push(...payExtras({ item: pieceOf(r, `${seed}:${job.id}`) }));
  else if (r === 'tuneUp') {
    // Gasket's Tune-up: one worn body part's bonuses +20%, picked at his clinic. With nothing worn to tune, a Fine body piece instead.
    if (tunable(gear.get()).length) {
      gear.set({ ...gear.get(), tunes: (gear.get().tunes ?? 0) + 1 });
      extra.push('Dr. Gasket has a Tune-up for you: pick a body part you wear at his clinic');
    } else extra.push(...payExtras({ item: pieceOf('body', `${seed}:${job.id}`) }));
  } else if (r === 'mod') {
    // Hob's Fitted mod: a pick of two waits at his forge, fitted free on the weapon in hand when taken. With every mod owned, he pays a Fine weapon instead.
    const pick = fittedPick(gear.get(), `${seed}:${job.id}`, job.tier ?? 1);
    if (pick.length) {
      const g = gear.get();
      gear.set({ ...g, modPicks: [...(g.modPicks ?? []), pick] });
      extra.push('Hob has a Fitted mod for you: pick one of two at his forge');
    } else extra.push(...payExtras({ item: pieceOf('weapon', `${seed}:${job.id}`) }));
  } else if (r === 'magnet') extra.push(...payExtras({ item: 'scrapMagnet' }));
  else if (r === 'copper') economy.set({ ...economy.get(), copper: economy.get().copper + RUSH_COPPER });
  else if (r === 'kickCard') extra.push(...payExtras({ card: 'bootPolish' }));
  else if (r === 'biscuits') questBook.set({ ...questBook.get(), pack: { ...questBook.get().pack, biscuits: (questBook.get().pack.biscuits ?? 0) + 1 } });
  else if (r === 'pick') extra.push(...payExtras({ picks: 1 }));
  else if (r === 'sweepings') princessSave.set({ ...princessSave.get(), double: true }); // her next pile is doubled (P58)
  return `Job done: ${job.task}. ${extra[0] ?? `You get ${REWARD_NAMES[r]}`}.`;
}

/**
 * A teacher's recipes on their station panel (P20): the tab "Recipes" lists what their station teaches the workbench
 * (`hub/taught.ts`: Hob weapons, Gasket body parts, Sprocket crew pieces), with each one's cost; `forge.ts`, `clinic.ts` and
 * Sprocket's entry in `index.ts` are this with a teacher's name. Display only: the cost and the catalogue are `sim/gear.ts`'s.
 */
import { esc } from '../panels';
import { iconUrl } from '../../gearart';
import { PARTS, type PartKind } from '../../sim/defs';
import { MODS, FITS_NAMES } from '../../sim/defs/mods';
import { ITEMS, SLOT_NAMES, scrapCost, type CrewRole, type ItemId } from '../../sim/gear';
import { TEACHERS, recipesOf, type Teacher } from '../taught';
import type { OfferPanel } from './host';

/** What the recipe is for, in a few words: a weapon, the body slot, or the robots it fits. */
const kindOf = (id: ItemId) => {
  const d = ITEMS[id];
  if (d.weapon) return 'Weapon';
  if (d.mod) return `Weapon mod (${FITS_NAMES[MODS[d.mod].fits].toLowerCase()})`;
  if (d.comm) return `${SLOT_NAMES[d.comm]} piece`;
  const who = d.roles?.length ? d.roles.map((r: CrewRole) => `${r}s`).join(', ') : 'any robot';
  return `${SLOT_NAMES[d.bot!]} for ${who}`;
};

/** The cost as the workbench shows it: scrap, then parts. */
const costOf = (id: ItemId) => {
  const parts = Object.entries(ITEMS[id].recipe.parts ?? {}) as [PartKind, number][];
  return [`${scrapCost(id)} scrap`, ...parts.map(([k, n]) => `${n} ${n === 1 ? PARTS[k].name : PARTS[k].plural}`)].join(', ');
};

/** The rows of one teacher's recipes. */
export function recipeRows(teacher: Exclude<Teacher, 'basics'>) {
  return recipesOf(teacher)
    .map(
      (id) => `<div class="hb-offer is-owned hb-recipe"><img src="${iconUrl(id)}" alt=""><div class="hb-offer__what"><b>${esc(ITEMS[id].name)}</b><span>${esc(kindOf(id))}. ${esc(costOf(id))}.</span></div><em>✓ Taught</em></div>`,
    )
    .join('');
}

/** The offer panel of a teacher's station: a Recipes tab in front of the lessons. */
export const teacherOffer = (teacher: Exclude<Teacher, 'basics'>): OfferPanel => ({
  tabs: () => {
    const t = TEACHERS[teacher];
    return [
      {
        id: 'recipes',
        label: 'Recipes',
        html: `<p class="hb-note hb-note--dim">${esc(t.who)} teaches the workbench every ${esc(t.teaches.replace(/s$/, ''))} recipe below. Craft them in the inventory (I), Workbench tab.</p><div class="hb-offers hb-recipes">${recipeRows(teacher)}</div>`,
      },
    ];
  },
});

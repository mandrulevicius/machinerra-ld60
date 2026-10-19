/**
 * Hob's forge (P20): an NPC's station on a lot (`npc.ts` builds it and shows the offer). Its panel adds the Recipes tab, the weapon
 * recipes (and the weapon mods') his station teaches the workbench (`hub/taught.ts`), and, when his Fitted mod job is paid (P57,
 * `questpay.ts` `payJob`), the Fitted mod tab: a pick of two mods, the one taken fitted free on the weapon in hand. The quest line's
 * offers (`lines.ts`) come with P38.
 */
import { iconUrl } from '../../gearart';
import { MODS, FITS_NAMES, type ModId } from '../../sim/defs/mods';
import { ITEMS, takeMod } from '../../sim/gear';
import { gear } from '../carry';
import { esc } from '../panels';
import type { HubHost, OfferPanel } from './host';
import { teacherOffer } from './recipes';
import { DOCK_BUTTON, wireDock } from './dockbtn';

const recipes = teacherOffer('hob');

/** The Fitted mod tab: each mod of the pair with its rule, and a button to take it. */
export function fittedHtml(pick: ModId[]) {
  const cards = pick
    .map((id) => {
      const m = MODS[id];
      return `<div class="hb-offer hb-recipe"><img src="${iconUrl(id)}" alt=""><div class="hb-offer__what"><b>${esc(m.name)}</b><span>${m.wild ? 'A wild mod. ' : ''}Fits: ${FITS_NAMES[m.fits]}. ${esc(m.text)}</span></div><button class="ui-btn ui-btn--primary" data-modpick="${id}">Take</button></div>`;
    })
    .join('');
  return `<p class="hb-note">"A FITTED MOD. ONE OF THESE TWO. IT GOES ON THE GUN IN YOUR HAND, FREE. DO NOT ASK WHAT THE OTHER ONE DOES."</p><div class="hb-offers hb-recipes">${cards}</div>`;
}

export const forgeOffer: OfferPanel = {
  tabs(host: HubHost) {
    const pick = gear.get().modPicks?.[0];
    const base = recipes.tabs!(host);
    return pick ? [{ id: 'fitted', label: 'Fitted mod', html: fittedHtml(pick) }, ...base] : base;
  },
  actions: DOCK_BUTTON,
  wire(host, el, again) {
    wireDock(host, el, 'forge');
    el.querySelectorAll<HTMLElement>('[data-modpick]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.modpick as ModId;
        try {
          const r = takeMod(gear.get(), id);
          gear.set(r.gear);
          host.inv.refresh();
          host.k.audio.sfx.play('click', { gain: 0.5 });
          host.hud.banner(r.onto ? `${ITEMS[id].name}: fitted on your ${ITEMS[r.onto.id].name}` : `${ITEMS[id].name}: in your inventory (it fits neither weapon in hand)`, 3200);
        } catch (e) {
          host.hud.say('Hob', (e as Error).message);
          return;
        }
        again();
      }),
    );
  },
};

/**
 * Dr. Gasket's clinic (P20): an NPC's station on a lot (`npc.ts` builds it and shows the offer). Its panel adds the Recipes tab,
 * the body-part recipes his station teaches the workbench (`hub/taught.ts`), and, while a Tune-up is owed (his repeatable job,
 * `questpay.ts` `payJob`; `Gear.tunes`), the Tune-up tab: a pick of the body parts the Communicator wears that are not tuned
 * yet, the one taken gets its bonuses +20% for good (`gear.ts` `tuneUp`). The quest line's offers (`lines.ts`) come with P38.
 */
import { iconUrl } from '../../gearart';
import { ITEMS, STATS, TUNE_UP, scaled, tunable, tuneUp, type Owned, type Stats } from '../../sim/gear';
import { gear } from '../carry';
import { esc } from '../panels';
import type { OfferPanel } from './host';
import { teacherOffer } from './recipes';
import { DOCK_BUTTON, wireDock } from './dockbtn';

const recipes = teacherOffer('gasket');

/** "+25 Melee damage" and so on for a piece's bonuses (stats, crew, aura), as the inventory words them. */
const bonuses = (o: Owned, tuned: boolean) => {
  const d = ITEMS[o.id];
  const line = (s: Stats | undefined) =>
    Object.entries(scaled(s, o.q, tuned))
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `+${v}${STATS[k as keyof typeof STATS].pts ? '' : '%'} ${STATS[k as keyof typeof STATS].name}`)
      .join(', ');
  return [line(d.stats), d.crew && `every bot ${line(d.crew)}`, d.aura && `allies near ${line(d.aura.stats)}`].filter(Boolean).join('; ');
};

/** The Tune-up tab: each worn, untuned body part with its bonuses now and tuned, and a button. */
export function tuneHtml() {
  const g = gear.get();
  const rows = tunable(g)
    .map((o) => `<div class="hb-offer hb-recipe"><img src="${iconUrl(o.id)}" alt=""><div class="hb-offer__what"><b>${esc(ITEMS[o.id].name)}</b><span>${esc(bonuses(o, false))} &rarr; ${esc(bonuses(o, true))}</span></div><button class="ui-btn ui-btn--primary" data-tune="${o.uid}">Tune</button></div>`)
    .join('');
  const none = '<p class="hb-note hb-note--dim">Nothing you wear has a bonus left to tune. Wear a body part (the Dry dock, I) and come back: the Tune-up keeps.</p>';
  return `<p class="hb-note">"Splendid, a tune-up. One piece, ${Math.round((TUNE_UP.mult - 1) * 100)}% more of what it gives, once only. The drawbacks I leave in: they are character."</p><div class="hb-offers hb-recipes">${rows || none}</div>`;
}

export const clinicOffer: OfferPanel = {
  tabs(host) {
    const base = recipes.tabs!(host);
    return gear.get().tunes ? [{ id: 'tune', label: 'Tune-up', html: tuneHtml() }, ...base] : base;
  },
  actions: DOCK_BUTTON,
  wire(host, el, again) {
    wireDock(host, el, 'clinic');
    el.querySelectorAll<HTMLElement>('[data-tune]').forEach((b) =>
      b.addEventListener('click', () => {
        const uid = Number(b.dataset.tune);
        try {
          const g = tuneUp(gear.get(), uid);
          gear.set(g);
          host.inv.refresh();
          host.k.audio.sfx.play('click', { gain: 0.5 });
          host.hud.banner(`${ITEMS[g.items.find((x) => x.uid === uid)!.id].name}: tuned +${Math.round((TUNE_UP.mult - 1) * 100)}%`, 3200);
        } catch (e) {
          host.hud.say('Dr. Gasket', (e as Error).message);
          return;
        }
        again();
      }),
    );
  },
};

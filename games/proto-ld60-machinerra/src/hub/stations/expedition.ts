/**
 * The Expeditioner's office: the Expedition tab in front of his offers. Feed the colony's expedition coal (`expeditions.ts`:
 * coal in, scrap out) and it goes out with the next lift, coming home with the one after it.
 * Registered as his `OFFER_PANELS` entry (`stations/index.ts`); the `hub expedition` dev command uses the same rules.
 */
import { BUILDINGS, hasBuilding } from '../buildings';
import { economy } from '../economy';
import { EXPEDITION, away, load, loaded } from '../expeditions';
import { esc } from '../panels';
import type { HubState } from '../state';
import type { HubHost, OfferPanel } from './host';

/** The tab's contents: the coal in the stores, the coal on the expedition, the one out now, and what it should bring. */
export function expeditionHtml(s: HubState, coal: number) {
  const on = loaded(s), out = away(s);
  const mul = hasBuilding(s, 'cathedral') ? 1.5 : 1;
  const yields = Math.round(on * EXPEDITION.scrapPerCoal * mul);
  const btn = (a: string, label: string, off: boolean) => `<button class="ui-btn ui-btn--secondary" data-a="${a}"${off ? ' disabled' : ''}>${label}</button>`;
  return [
    '<p class="hb-note">"Coal in, scrap out. Feed the crews and they will go out while you fly, and come back with what they find."</p>',
    `<div class="hb-row"><span>Coal in the stores: <b>${coal}</b></span><span>Fed for the next lift: <b>${on}</b>${on ? ` (about ${yields} scrap)` : ''}</span></div>`,
    `<div class="hb-row">${[
      btn('coal+', `Feed ${EXPEDITION.step}`, coal <= 0),
      btn('coal-all', 'Feed all', coal <= 0),
      btn('coal-', `Take back ${EXPEDITION.step}`, on <= 0),
    ].join('')}</div>`,
    out ? `<p class="hb-note">An expedition is out with <b>${out}</b> coal. It comes home with the next lift.</p>` : '<p class="hb-note hb-note--dim">No expedition is out.</p>',
    hasBuilding(s, 'cathedral') ? `<p class="hb-note hb-note--dim">${esc(BUILDINGS.cathedral.name)}: ${esc(BUILDINGS.cathedral.effect)}</p>` : '',
    '<p class="hb-note hb-note--dim">The Gatherer mines coal at the seams on the sands. Sometimes a crew also brings back old junk, or charts a land: its places show on the course table.</p>',
  ].join('');
}

export const expeditionOffer: OfferPanel = {
  tabs: (host) => [{ id: 'expedition', label: 'Expedition', html: expeditionHtml(host.s, economy.get().coal) }],
  wire(host, el, again) {
    const feed = (n: number) => () => {
      try {
        host.pay(load({ eco: economy.get(), hub: host.s }, n, host.allRescued));
      } catch (e) {
        host.hud.say('The Expeditioner', (e as Error).message);
        return;
      }
      host.k.audio.sfx.play('click', { gain: 0.5 });
      again();
    };
    el.querySelector('[data-a="coal+"]')?.addEventListener('click', feed(EXPEDITION.step));
    el.querySelector('[data-a="coal-all"]')?.addEventListener('click', feed(economy.get().coal));
    el.querySelector('[data-a="coal-"]')?.addEventListener('click', feed(-EXPEDITION.step));
  },
};

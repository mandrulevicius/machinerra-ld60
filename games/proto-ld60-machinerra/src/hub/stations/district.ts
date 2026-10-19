/**
 * The Rising District's panel, the City Planner's second lever (P55 part B; rules in `district.ts`): the five stages, the brass gauge of the one being
 * poured, the copper lever, and the pick of three city perks a standing stage owes. Opened from the Planner's offer (`planner.ts`).
 */
import { esc } from '../panels';
import { CITY_PERKS, DISTRICT, STAGES, crowdOf, districtOf, finished, needed, offerPerks, picksOwed, pour, scrapMul, takePerk, whyLocked, whyNotPour } from '../district';
import { economy } from '../economy';
import type { HubState } from '../state';
import type { HubHost } from './host';

/** The panel: `have` is the copper in the hold, `pick` the perk chosen among the three (null: none yet), `all` the dev switch that puts every NPC aboard. */
export function districtBody(s: HubState, o: { have: number; pick: string | null; all?: boolean }) {
  const d = districtOf(s);
  const locked = whyLocked(s, o.all);
  const rows = STAGES.map((st, i) => {
    const state = i < d.stage ? 'stands' : i === d.stage ? (d.raising ? 'going up: stands when the lift is back' : d.poured ? `${d.poured} of ${st.price} poured` : 'next') : 'later';
    return `<li title="${esc(st.text)}" class="${i < d.stage ? 'is-done' : i === d.stage ? 'is-now' : ''}"><b>${i + 1}. ${esc(st.name)}</b> <span>${st.price} copper</span> <em>${esc(state)}</em></li>`;
  }).join('');
  const st = STAGES[d.stage];
  const need = needed(d);
  const max = Math.min(need, o.have);
  const gauge = st ? `<span class="hb-gauge hb-gauge--big${d.raising ? ' is-full' : ''}" style="--fill:${Math.round(((d.raising ? st.price : d.poured) / st.price) * 100)}%"><i></i></span>` : '';
  const pourable = !!st && !locked && !d.raising && need > 0;
  const lever = pourable ? `<p class="hb-note">Pour copper into <b>${esc(st.name)}</b>: it needs <b>${need}</b> more, you have <b>${o.have}</b>.</p>
      <p class="hb-pour"><input type="range" data-a="amount" min="1" max="${Math.max(1, max)}" value="${Math.max(1, max)}"${max < 1 ? ' disabled' : ''}> <output data-a="out">${max}</output> copper</p>` : '';
  const offer = offerPerks(s);
  const perks = offer.length
    ? `<h3 class="hb-note hb-note--dim">A stage stands: choose a city perk (${picksOwed(d)} pick${picksOwed(d) === 1 ? '' : 's'} owed)</h3><div class="hb-cards">${offer
        .map((id) => `<button class="ui-btn hb-card${id === o.pick ? ' is-selected' : ''}" data-a="perk" data-id="${id}"><b>${esc(CITY_PERKS[id].name)}</b><span>${esc(CITY_PERKS[id].text)}</span></button>`)
        .join('')}</div>`
    : '';
  const kept = d.perks.length ? `<p class="hb-note">City perks: ${d.perks.map((id) => `<b>${esc(CITY_PERKS[id].name)}</b> (${esc(CITY_PERKS[id].text)})`).join(' ')}</p>` : '';
  const people = d.stage ? `<p class="hb-note">${crowdOf(d)} people live in the district. Every kill and smashed prop drops <b>${Math.round((scrapMul(d) - 1) * 100)}%</b> more scrap (+${Math.round(DISTRICT.scrap * 100)}% a stage).</p>` : '';
  const note = locked ?? (finished(d) ? "The district is as tall as it gets, for now: the hatch does not open yet. Rebuild is the copper's use now." : '"Housing, Communicator. People move in as it goes up, and a busy city drops more scrap. Pour what you can spare."');
  return {
    title: 'The City Planner: the Rising District',
    body: `<p class="hb-note${locked ? ' hb-note--warn' : ''}">${esc(note)}</p>${perks}${gauge}${lever}${people}${kept}<ol class="hb-district">${rows}</ol>`,
    actions: [
      '<button class="ui-btn ui-btn--secondary" data-a="back">Blueprints</button>',
      offer.length ? `<button class="ui-btn ui-btn--primary" data-a="take"${o.pick ? '' : ' disabled'}>${o.pick ? `Take ${esc(CITY_PERKS[o.pick].name)}` : 'Take a perk'}</button>` : '',
      pourable ? `<button class="ui-btn ui-btn--primary" data-a="pour"${max < 1 ? ' disabled' : ''}>Pour ${max} copper</button>` : '',
    ].join(''),
  };
}

/** Open the Rising District's panel. `onBack` returns to the blueprints. */
export function openDistrict(host: HubHost, onBack: () => void, pick: string | null = null) {
  const wasOpen = !!host.hud.panel;
  const b = districtBody(host.s, { have: economy.get().copper, pick, all: host.allRescued });
  const el = host.hud.open('district', b.title, b.body, b.actions, '{esc} to close');
  const slider = el.querySelector<HTMLInputElement>('[data-a="amount"]');
  const label = () => {
    if (!slider) return;
    el.querySelector('[data-a="out"]')!.textContent = slider.value;
    const btn = el.querySelector('[data-a="pour"]');
    if (btn) btn.textContent = `Pour ${slider.value} copper`;
  };
  slider?.addEventListener('input', label);
  el.querySelectorAll<HTMLElement>('[data-a="perk"]').forEach((c) =>
    c.addEventListener('click', () => {
      host.k.audio.sfx.play('click', { gain: 0.4 });
      openDistrict(host, onBack, c.dataset.id!);
    }),
  );
  el.querySelector('[data-a="back"]')?.addEventListener('click', onBack);
  el.querySelector('[data-a="take"]')?.addEventListener('click', () => {
    if (!pick) return;
    try {
      host.save(takePerk(host.s, pick));
    } catch (e) {
      host.hud.say('The City Planner', (e as Error).message);
      return;
    }
    host.k.audio.sfx.play('latch', { gain: 0.6 });
    host.hud.banner(`${CITY_PERKS[pick].name}: ${CITY_PERKS[pick].text}`);
    openDistrict(host, onBack);
  });
  el.querySelector('[data-a="pour"]')?.addEventListener('click', () => {
    const n = Math.floor(Number(slider?.value ?? 0));
    const why = whyNotPour(host.s, n, economy.get().copper, host.allRescued);
    if (why) {
      host.hud.say('The City Planner', why);
      host.k.audio.sfx.play('click');
      return;
    }
    host.pay(pour({ eco: economy.get(), hub: host.s }, n, host.allRescued));
    host.k.audio.sfx.play('ratchet');
    host.k.audio.sfx.play('latch', { gain: 0.6 });
    const d = districtOf(host.s);
    host.hud.banner(d.raising ? `${STAGES[d.stage].name} is paid for: it goes up while you are away.` : `${n} copper poured.`);
    openDistrict(host, onBack);
  });
  if (!wasOpen) host.panelOpened();
}

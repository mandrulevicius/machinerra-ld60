/**
 * The D-city window: the city as the copper brought home has grown it (`cityStage`, `CITY_STAGES`), the buildings on its slots (the
 * ones going up as scaffolding until the next lift docks: `buildings.ts`) and the civilians the Lost Expedition's husks became.
 * Read only.
 */
import { drawCity } from '../art';
import { BUILDINGS, hasBuilding, slotsOf, slotsOrder } from '../buildings';
import { crowdOf, districtOf } from '../district';
import { esc } from '../panels';
import { CITY_STAGES, cityStage, isWorking, type HubState } from '../state';
import type { HubHost, StationPanel } from './host';

/** What the window shows of a save: the slots, the buildings in them and the civilians. */
export const cityView = (s: HubState, all = false) => {
  const d = districtOf(s);
  return { slots: slotsOf(s, all), buildings: slotsOrder(s), civilians: s.civilians ?? 0, cats: hasBuilding(s, 'replicator') && s.perks.includes('companionCat'), district: { stage: d.stage, raising: d.raising, crowd: crowdOf(d) } };
};

export function windowBody(stage: number, expeditioner: boolean, view?: ReturnType<typeof cityView>) {
  const st = CITY_STAGES[stage];
  const next = CITY_STAGES[stage + 1] ? `${CITY_STAGES[stage + 1].at} copper in all` : 'the city is as big as it gets, for now';
  const list = view?.buildings.length
    ? `<p class="hb-note">${view.buildings.map((b) => `<b>${esc(BUILDINGS[b.id].name)}</b> ${b.done ? 'stands' : 'is going up: done when the lift is back'}`).join('; ')}.</p>`
    : '';
  const people = view?.civilians ? ` ${view.civilians} civilian${view.civilians === 1 ? '' : 's'} walk the gantry.` : '';
  const dist = view?.district;
  const housing = dist?.stage ? ` The Rising District: ${dist.stage} of 5 stages stand, ${dist.crowd} people live in it.` : '';
  return {
    title: 'The D-city',
    body: `<canvas class="hb-city" width="720" height="380"></canvas>
      <p class="hb-note"><b>${esc(st.name)}.</b> ${esc(st.text)}${people}${housing}</p>${list}
      <p class="hb-note hb-note--dim">${
        expeditioner
          ? `The city grows with the copper you bring home (next: ${next}).${view ? ` ${view.buildings.length} of ${view.slots} building slots used.` : ''}`
          : 'Nobody aboard knows how to build out there. Rescue the Expeditioner.'
      }</p>`,
    draw(panel: HTMLElement) {
      drawCity(panel.querySelector('canvas')!, stage, view);
    },
  };
}

export const windowPanel: StationPanel = (host: HubHost) => {
  const stage = cityStage(host.s, host.allRescued);
  const b = windowBody(stage, isWorking(host.s, 'expeditioner', host.allRescued), cityView(host.s, host.allRescued));
  const el = host.hud.open('window', b.title, b.body);
  b.draw(el);
  return true;
};

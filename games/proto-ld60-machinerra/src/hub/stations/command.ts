/**
 * The course table: pick a land and the Wanderer's call, lower the lift. Lands come from `landings.ts`; a land's tile is
 * `landHtml` (its dangers, then its values: add a line to a tile there).
 */
import { promptHtml } from '../../../../../harness/kit';
import { ANOMALIES, BIOMES, BOSSES, COUNTERS, FOES, SUPPORT, landCounters, type BiomeId, type Enemy, type SupportId } from '../../sim/defs';
import { iconSvg } from '../../counters';
import { KITS } from '../../sim/dungeon';
import { foeTraits } from '../../sim/missionfx';
import { PLACES, type PlaceId } from '../../sim/places';
import { drawWorldMap } from '../art';
import { RANKED, picked, tierName, type Land } from '../landings';
import { esc } from '../panels';
import { npc, type HubState, type PerkId } from '../state';
import type { HubHost, StationPanel } from './host';

/** A land's machines and its boss with what each is weak to and resists (`foeTraits`): one chip each. */
function foeNote(land: Land) {
  const one = (k: Enemy, boss: boolean) => {
    const { weak, resist } = foeTraits(k);
    const name = boss ? (BOSSES[k]?.name ?? FOES[k].name) : FOES[k].name;
    return [
      `<span class="hb-foe${boss ? ' hb-foe--boss' : ''}">`,
      `<b>${esc(name)}</b>`,
      boss ? `<span class="hb-foe__dim">${land.bossDown ? 'down' : 'holds the land'}</span>` : '',
      weak.length ? `<span class="hb-foe__weak" title="Weak to">▲ ${weak.join(', ')}</span>` : '',
      resist.length ? `<span class="hb-foe__resist" title="Resists">▼ ${resist.join(', ')}</span>` : '',
      '</span>',
    ].join('');
  };
  return [
    '<div class="hb-foes" title="▲ weak to, ▼ resists">',
    land.foes.map((k) => one(k, false)).join(''),
    land.boss ? one(land.boss, true) : '',
    '</div>',
  ].join('');
}

/**
 * A land's soft counters (P22): the rules in its machines (its dungeon's too) that punish a build leaning one way, each with its icon, the
 * kinds that carry it, and (on hover) what it punishes and what answers it. Nothing for a land with none.
 */
function counterNote(land: Land) {
  const kit = KITS[land.biome];
  const rows = landCounters([...land.foes, ...(kit.built ? kit.foes : [])], land.tier);
  if (!rows.length) return '';
  return [
    '<div class="hb-counters">',
    ...rows.map(({ id, on }) => {
      const C = COUNTERS[id];
      return `<span class="hb-counter" title="${esc(`${C.name} punishes ${C.punishes}. Answers: ${C.answers}.`)}">${iconSvg(id)}<b>${C.name}</b><span class="hb-counter__on">${esc(on.join(', '))}</span></span>`;
    }),
    '</div>',
  ].join('');
}

const placeName = (id: string) => (id in PLACES ? PLACES[id as PlaceId].name : id);

/** A land's name as a heading: "the Rustwood Jungle" reads "Rustwood Jungle". */
const landName = (id: BiomeId) => BIOMES[id].name.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase());

/** An anomaly's kind on the table (P54): all day, or passing and how often; a plain sky says nothing. */
const anomalyWhen = (id: Land['anomaly']) => {
  const A = ANOMALIES[id];
  return id === 'plain' ? '' : `<i class="hb-lt__when">${A.weather ? `passing, ${A.weather.count} times` : 'all day'}</i>`;
};

/**
 * One land on the course table (`landings.ts`): its dangers, then its values. It costs nothing to land on. The repeatable and the quest
 * pips (P38) have their slots in the markup, hidden until their plans fill the land's fields.
 */
export function landHtml(c: Land, on: boolean, npcName: (id: string) => string) {
  const A = ANOMALIES[c.anomaly];
  const rich = c.rich.length ? c.rich.join(', ') : 'scrap';
  return `<div class="hb-lt${on ? ' is-on' : ''}"
      data-a="land"
      data-id="${c.biome}"
      role="button"
      tabindex="0"
      aria-pressed="${on}"
      title="${esc(BIOMES[c.biome].blurb)}">
      <div class="hb-lt__head">${[
        `<span class="hb-lt__land">${landName(c.biome)}</span>`,
        `<span class="hb-lt__tier" title="Threat tier">Tier ${tierName(c.tier)}</span>`,
      ].join('')}</div>
      <div class="hb-lt__sec">Dangers</div>
      <div class="hb-lt__anomaly${c.anomaly === 'plain' ? ' is-plain' : ''}"><b>${A.name}</b>${anomalyWhen(c.anomaly)}<span>${esc(A.blurb)}</span></div>
      ${foeNote(c)}
      ${counterNote(c)}
      <div class="hb-lt__sec">Values</div>
      <div class="hb-lt__rich"><i>Rich in</i> ${rich}${c.copper > 1 ? '; <b>copper</b> in the walls' : ''}</div>
      <div class="hb-lt__found"><i>Found here</i> ${c.found.length ? c.found.map(placeName).join(', ') : 'nothing yet'}</div>
      ${c.charted ? `<div class="hb-lt__found hb-lt__chart" title="The colony's expedition has been here and drawn it up"><i>Charted</i> ${c.charted.map(placeName).join(', ')}</div>` : ''}
      ${c.stranded ? `<div class="hb-lt__stranded">Stranded here: <b>${esc(npcName(c.stranded))}</b></div>` : ''}
      <div class="hb-lt__slots">
        <span data-slot="repeatable"${c.repeatable === null ? ' hidden' : ''}>${esc(c.repeatable ?? '')}</span>
        <span data-slot="pips" class="hb-pips"${c.pips.length ? '' : ' hidden'}>${c.pips.map((p) => `<span class="hb-pipline"><i class="hb-pip"></i>${esc(p)}</span>`).join('')}</span>
      </div>
    </div>`;
}

/**
 * The course table: every opened land (`landings.ts`) with its dangers and values; click one to pick it, the lift goes down to the
 * picked one. And the Wanderer's call picker. `lands` are the visit's opened lands, `s.biome` the picked one; `open.calls` the Wanderer's
 * unlocked calls (the picker shows once there is more than one);
 */
export function commandBody(s: HubState, lands: Land[], open: { calls: SupportId[] } = { calls: ['barrage'] }) {
  const c = picked(lands, s.biome), B = BIOMES[c.biome];
  const callBtn = (id: SupportId) =>
    `<button class="ui-btn hb-land ${id === s.call ? 'ui-btn--primary' : 'ui-btn--secondary'}"
        data-a="call"
        data-id="${id}"
        title="${esc(SUPPORT[id].blurb)}">${SUPPORT[id].name}</button>`;
  const picker = open.calls.length > 1
    ? `<div class="hb-course__calls"><h3 class="hb-h">The Wanderer's call (Q)</h3>${open.calls.map(callBtn).join('')}</div>`
    : '';
  const name = (id: string) => npc(id)?.name ?? id;
  const edge = lands.filter((l) => !BIOMES[l.biome].secret).at(-1);
  const next = edge && edge.biome !== RANKED.at(-1) && !edge.bossDown ? edge : null;
  const more = next ? `Another land opens when ${BOSSES[next.boss!]?.name ?? 'the boss'} falls.` : '';
  // The next land is shown, locked, with what opens it (level-1.md: the jungle waits for the Hornet Queen).
  const locked = next ? RANKED[RANKED.indexOf(next.biome) + 1] : undefined;
  const lockedRow = locked
    ? `<div class="hb-lt hb-lt--locked" aria-disabled="true"><div class="hb-lt__head"><span class="hb-lt__land">${landName(locked)}</span></div><div class="hb-lt__sec">Locked</div><div class="hb-lt__found">Opens when ${esc((BOSSES[next!.boss!]?.name ?? 'the boss').replace(/^The /, 'the '))} falls.</div></div>`
    : '';
  return {
    title: 'Course table',
    body: `<div class="hb-course">
        <div class="hb-lands">${lands.map((l) => landHtml(l, l === c, name)).join('')}${lockedRow}</div>
        <div class="hb-course__chart">
          <canvas class="hb-map" width="640" height="300" data-k="map"></canvas>
          <div class="hb-course__info">
            <p class="hb-note">${B.blurb}${B.warn ? ` <span class="hb-note--warn">${B.warn}</span>` : ''}</p>
            <div class="hb-row hb-note--dim">${[
              `<span>Next landing: <b>${landName(c.biome)}</b>, land ${c.seed}</span>`,
              `<span>Missions flown: ${s.missions}</span>`,
            ].join('')}</div>
            ${picker}
          </div>
        </div>
      </div>`,
    actions: [
      `<span class="hb-note hb-note--dim hb-course__more">${esc(more)}</span>`,
      `<button class="ui-btn ui-btn--primary" data-a="launch">${promptHtml('Lower the lift {use}')}</button>`,
    ].join(''),
    draw(panel: HTMLElement, missions: number) {
      drawWorldMap(panel.querySelector('canvas')!, c.seed, missions);
    },
  };
}

export const commandPanel: StationPanel = (host: HubHost) => {
  const perk = (p: PerkId) => host.s.perks.includes(p);
  const calls = (['barrage', 'drop', 'lance'] as SupportId[]).filter((c) => c === 'barrage' || (c === 'drop' ? perk('callDrop') : perk('callLance')));
  const b = commandBody(host.s, host.lands(), { calls: host.has('calls') ? calls : ['barrage'] });
  const el = host.hud.open('command', b.title, b.body, b.actions, '{esc} to close');
  el.querySelectorAll('[data-a="call"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const call = (btn as HTMLElement).dataset.id as SupportId;
      host.save({ ...host.s, call });
      host.k.audio.sfx.play('ratchet');
      host.hud.banner(`The Wanderer's call: ${SUPPORT[call].name}`);
      host.openStation('command');
    }),
  );
  b.draw(el, host.s.missions);
  el.querySelector('[data-a="launch"]')!.addEventListener('click', () => host.launch());
  el.querySelectorAll('[data-a="land"]').forEach((tile) => {
    const choose = () => {
      const biome = (tile as HTMLElement).dataset.id as BiomeId;
      if (biome === host.landing().biome) return;
      host.k.audio.sfx.play('lift', { gain: 0.4 });
      host.pickLand(biome);
      host.openStation('command');
      (host.hud.panel?.querySelector(`[data-a="land"][data-id="${biome}"]`) as HTMLElement | null)?.focus();
    };
    tile.addEventListener('click', choose);
    tile.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        choose();
      }
    });
  });
  return true;
};

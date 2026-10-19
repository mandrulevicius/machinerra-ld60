/**
 * The DOM HUD: the Communicator's portrait, Oil (health, black) and Steam (shots, white; only with a gun) bars, the weapon in hand (top left), the scrap and copper carried and
 * objective (top centre), the Oracle's comm panel
 * (bottom left) and the crew roster (bottom right). Text with {action} tokens becomes key prompts that follow rebinding.
 */
import { promptHtml } from '../../../harness/kit';
import { ALARM, Fader, HOLD, chipWeight, oilAlarm, oracleHold } from './attention';
import { clockText, sky } from './sim/clock';
import { ANOMALIES, BERSERK, BOSSES, bossOf, DAY, LOOT, REVIVE, ROLES, SUPPORT, WEAPONS, type Role } from './sim/defs';
import type { Sim } from './sim/sim';
import { css, DANGER } from './house';

/** The day dial: a brass disc, noon at the top and midnight at the bottom; a sun or moon rides its rim. */
const PHASE_ARCS: { from: number; to: number; color: string; name: string }[] = [
  { from: DAY.hours.start, to: DAY.hours.day, color: '#ffe3a0', name: 'Morning' },
  { from: DAY.hours.day, to: DAY.hours.evening, color: '#ffb640', name: 'Day' },
  { from: DAY.hours.evening, to: DAY.hours.midnight, color: '#b040ff', name: 'Evening' },
  { from: DAY.hours.midnight, to: DAY.hours.midnight + DAY.lastHour, color: css(DANGER), name: 'Midnight' },
];
const dialPoint = (hour: number, r: number) => {
  const a = ((hour - 12) / 24) * Math.PI * 2;
  return { x: +(r * Math.sin(a)).toFixed(2), y: +(-r * Math.cos(a)).toFixed(2) };
};
const dialArc = (h0: number, h1: number, r: number) => {
  const a = dialPoint(h0, r), b = dialPoint(h1, r);
  return `M${a.x} ${a.y}A${r} ${r} 0 ${h1 - h0 > 12 ? 1 : 0} 1 ${b.x} ${b.y}`;
};
const dialSvg = () => `
  <svg viewBox="-64 -64 128 128" width="124" height="124" aria-hidden="true">
    <defs>
      <linearGradient id="mc-sky" x1="0" y1="-1" x2="0" y2="1"><stop offset="0" stop-color="#ffe9b0"/><stop offset="0.45" stop-color="#e8a860"/><stop offset="0.6" stop-color="#6a4a78"/><stop offset="0.8" stop-color="#2a2a58"/><stop offset="1" stop-color="#12163a"/></linearGradient>
      <linearGradient id="mc-brass" x1="0" y1="-1" x2="0" y2="1"><stop offset="0" stop-color="#f0cf7a"/><stop offset="0.5" stop-color="#c8963c"/><stop offset="1" stop-color="#7a5a22"/></linearGradient>
    </defs>
    <circle r="62" fill="none" stroke="#5a4218" stroke-width="7" stroke-dasharray="7 4.4"/>
    <circle r="59" fill="url(#mc-brass)" stroke="#1d1a17" stroke-width="1.5"/>
    <circle r="54" fill="#1d1a17"/>
    <circle r="52" fill="url(#mc-sky)"/>
    ${PHASE_ARCS.map((p) => `<path d="${dialArc(p.from, p.to, 47)}" fill="none" stroke="${p.color}" stroke-width="5" stroke-linecap="butt" opacity="0.92"/>`).join('')}
    ${Array.from({ length: 24 }, (_, h) => {
      const a = dialPoint(h, h % 6 ? 39 : 36), b = dialPoint(h, 43);
      return `<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="#1d1a17" stroke-width="${h % 6 ? 1 : 2}" opacity="0.7"/>`;
    }).join('')}
    <path d="M-6 56 L6 56 L0 44 Z" fill="${css(DANGER)}" stroke="#1d1a17" stroke-width="1.5"/>
    <g transform="translate(${dialPoint(DAY.hours.evening + (DAY.hours.midnight - DAY.hours.evening) * DAY.bossAt, 47).x} ${dialPoint(DAY.hours.evening + (DAY.hours.midnight - DAY.hours.evening) * DAY.bossAt, 47).y})"><title>The queen comes</title><path d="M0 -4.5 L4 0 L0 4.5 L-4 0 Z" fill="${css(DANGER)}" stroke="#1d1a17" stroke-width="1.2"/></g>
    <circle r="25" fill="rgb(20 14 9 / 0.72)"/>
    <g data-k="bells"><title>The Dinner Bell's tolls: more foes, more elites, more loot</title></g>
    <g data-k="orb">
      <circle data-k="sun" r="8" fill="#fff1b0" stroke="#1d1a17" stroke-width="1.6"/>
      <g data-k="moon"><circle r="8" fill="#e8eef8" stroke="#1d1a17" stroke-width="1.6"/><circle cx="3.2" cy="-2" r="6.2" fill="#1d1a17"/></g>
    </g>
    <text data-k="ctime" y="5" text-anchor="middle" font-family="Share Tech Mono, monospace" font-size="16" font-weight="700" fill="#f4e2bc">06:00</text>
  </svg>`;

/** Crew colours from the Okabe-Ito palette (colour-blind safe); the crew number always shows beside the colour. */
export const CREW_COLORS = ['#E69F00', '#56B4E9', '#CC79A7', '#009E73'];
/** A robot's crew number, with a dot when it is on its own order (P3, `Bot.own`): "1•" is crew 1's robot sent apart from it. */
export const crewMark = (b: { crew: number; own?: unknown }) => (b.crew < 0 ? '' : `${b.crew}${b.own ? '•' : ''}`); // a place's own robot (P36's husks) has no crew
export const ROLE_GLYPH: Record<Role, string> = { controller: 'C', gatherer: 'G', guard: 'Gd', repairer: 'R', mule: 'Mu', marksman: 'Mk', boilermancer: 'Bm', lamplighter: 'Lp', stalker: 'St' };

/** The Oracle's face (her portrait, `npc/oracle-face`) in every Oracle panel, mission and hub: a data URL, set once. */
/** How long the Princess's antenna line stays (s; a guess). */
const HER_HOLD = 6;

/** The Princess's face (her painting) for her antenna panel (P58). */
export function usePrincessFace(url: string) {
  document.documentElement.style.setProperty('--princess-face', `url(${url})`);
}

export function useOracleFace(url: string) {
  document.documentElement.style.setProperty('--oracle-face', `url(${url})`);
  document.documentElement.classList.add('has-oracle-face');
}

/**
 * Where the pointer is, for the numbers that show on hover. The HUD never takes pointer events (a click on it would not reach
 * the canvas), so one passive listener keeps the position and the HUD tests it against its elements' boxes.
 */
const pointer = { x: -1, y: -1, set: false };
function trackPointer() {
  if (pointer.set || typeof window === 'undefined') return;
  pointer.set = true;
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  }, { passive: true });
}
const over = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;
};

export class Hud {
  private q: (k: string) => HTMLElement;
  /**
   * Attention (P33): each element rests (quiet) with nothing new to say and comes forward when its value changes, turns urgent
   * or is hovered; it shows its numbers then. `data-w` on the element is `rest`, `up` or (the Oil bar low) `alarm`.
   */
  private fade = { oil: new Fader(), steam: new Fader(), cans: new Fader(), clock: new Fader(HOLD.line), stock: new Fader(), salvage: new Fader(), junk: new Fader(), obj: new Fader(HOLD.line) };
  private hover = new Set<string>();
  private hoverT = 0;
  private oracleTone: 'calm' | 'warn' | 'urgent' = 'calm';
  private oracleT = 0;
  private typing: { text: string; shown: number } | null = null;
  private rosterSig = '';
  private objSig = '';
  private trackSig = '';
  private clockSig = '';
  private weatherSig = '';

  constructor(private root: HTMLElement, private sim: Sim, private calls: { map(): void }) {
    root.innerHTML = `
      <div class="mc-hud">
        <div class="mc-dusk" data-k="dusk"></div>
        <div class="mc-wash" data-k="wash"></div>
        <div class="mc-alarm" data-k="alarm"></div>
        <div class="mc-clock" data-k="clock" title="The day: noon at the top, midnight at the bottom. After midnight a step every ten seconds makes new enemies stronger; every sixth step is a menace level.">
          ${dialSvg()}
          <div class="mc-clock__phase" data-k="cphase"></div>
          <div class="mc-clock__next" data-k="cnext"></div>
          <div class="mc-weather" data-k="weather" title="A passing weather: the bar counts down to its start, then to its end."><span data-k="wname"></span><div class="mc-weather__bar"><i data-k="wfill"></i></div></div>
        </div>
        <div class="mc-boss" data-k="boss"><div class="mc-boss__name" data-k="bossName">${BOSSES.hornet.name}</div><div class="mc-bar mc-bar--boss"><div class="mc-bar__fill" data-k="bossHp"></div></div></div>
        <div class="mc-me" data-k="me">
          <div class="mc-me__face" data-k="face"><span></span></div>
          <div class="mc-me__col">
            <div class="mc-me__name">Communicator <span class="mc-me__weapon" data-k="weapon"></span></div>
            <div class="mc-hprow">
              <div class="mc-bar mc-bar--hp" data-k="hpBar"><div class="mc-bar__fill" data-k="hp"></div><span data-k="hpText"></span></div>
              <div class="mc-spare" data-k="reserve" title="Spare oil: cans hung on your pack. Run out of oil and a can gets you back up where you fell; with none, the Oracle winches you to the lift.">
                <span class="mc-spare__label">Spare oil</span>
                <span class="mc-spare__row">
                  <svg class="mc-spare__glyph" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 15V6M6 9.5l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  ${Array.from({ length: REVIVE.cans }, () => '<i class="mc-can"><b></b></i>').join('')}
                </span>
              </div>
            </div>
            <div class="mc-bar mc-bar--steam" data-k="steamBar"><div class="mc-bar__fill" data-k="steam"></div><span data-k="steamText"></span></div>
          </div>
        </div>
        <div class="mc-oil">
          <div class="mc-stock" data-k="stock" title="Carried this mission and brought home with the lift: scrap (from kills), copper (from ruins), coal (from the seams)."></div>
          <div class="mc-track" data-k="track"></div>
          <div class="mc-obj" data-k="obj"></div>
          <div class="mc-salvage" data-k="salvage"></div>
          <div class="mc-salvage" data-k="junk" title="Old tech found in dead ruins: the carry strip. It rides home with you; fit it to a robot at the workshop."></div>
        </div>
        <div class="mc-oracle mc-oracle--her" data-k="her">
          <div class="mc-oracle__eye"></div>
          <div class="mc-oracle__col"><div class="mc-oracle__name">The Princess</div><div class="mc-oracle__text" data-k="htext"></div></div>
        </div>
        <div class="mc-oracle" data-k="oracle">
          <div class="mc-oracle__eye"><i></i></div>
          <div class="mc-oracle__col"><div class="mc-oracle__name">The Oracle</div><div class="mc-oracle__text" data-k="otext"></div></div>
        </div>
        <div class="mc-support" data-k="support" data-state="ready" title="D-city air support: the Zeppelin Wanderer, far above, answers one call a mission.">
          <svg viewBox="0 0 64 28" width="64" height="28" aria-hidden="true"><ellipse cx="34" cy="13" rx="26" ry="9" fill="currentColor"/><path d="M12 11 L3 3 L9 3 L20 9 M12 15 L3 23 L9 23 L20 17" fill="currentColor"/><rect x="28" y="19" width="14" height="5" rx="2" fill="currentColor"/></svg>
          <div class="mc-support__col"><div class="mc-support__name" data-k="supportName">${SUPPORT.barrage.name}</div><div class="mc-support__key" data-k="supportKey"></div></div>
          <div class="mc-support__state" data-k="supportState"></div>
        </div>
        <div class="mc-roster">
          <button class="mc-mapbtn" data-k="mapbtn"></button>
          <div class="mc-roster__list" data-k="roster"></div>
        </div>
        <div class="mc-banner" data-k="banner"></div>
      </div>`;
    this.q = (k) => root.querySelector(`[data-k="${k}"]`) as HTMLElement;
    trackPointer();
    this.q('mapbtn').innerHTML = promptHtml('Map {map}');
    this.q('mapbtn').addEventListener('click', () => calls.map());
    this.q('supportKey').innerHTML = promptHtml('D-city air support {support}');
  }

  /** What applies on this land above the objective (P38): up to three lines, the main quest, quest steps this land can advance, who waits. */
  setTrack(lines: string[]) {
    const sig = lines.join('|');
    if (sig === this.trackSig) return;
    this.trackSig = sig;
    const el = this.q('track');
    el.innerHTML = lines.map((l) => `<div class="mc-track__line">${promptHtml(l.replace(/[<>&]/g, ''))}</div>`).join('');
    el.classList.toggle('is-on', lines.length > 0);
  }

  /** Quiet or forward: sets `data-w` on the element only when it changes. */
  private weigh(k: string, w: 'rest' | 'up' | 'alarm') {
    const el = this.q(k);
    if (el.dataset.w !== w) el.dataset.w = w;
  }

  /** The reserve cans flash: `gain` a can was filled, else one was spent. */
  reserveFlash(gain: boolean) {
    this.fade.cans.poke(6);
    const el = this.q('reserve');
    el.classList.remove('is-gain', 'is-spent');
    void el.offsetWidth;
    el.classList.add(gain ? 'is-gain' : 'is-spent');
  }

  /** The Communicator's portrait (a data URL of the atlas frame) in the face disc. */
  face(url: string) {
    const el = this.q('face');
    el.style.backgroundImage = `url(${url})`;
    el.classList.add('has-art');
  }

  /** The Princess on the antenna (P58): her own small panel above the Oracle's, so neither talks over the other; it fades on its own. */
  princess(text: string) {
    const el = this.q('her');
    this.q('htext').textContent = text;
    el.classList.add('is-on');
    this.herT = 0;
  }
  private herT = -1;

  oracle(text: string, tone: 'calm' | 'warn' | 'urgent') {
    const el = this.q('oracle');
    this.oracleTone = tone;
    el.dataset.tone = tone;
    el.classList.add('is-on');
    el.classList.remove('is-quiet');
    this.typing = { text: promptHtml(text), shown: 0 };
    this.oracleT = 0;
  }

  /** Out of steam: the Steam bar shudders. */
  noSteam() {
    this.fade.steam.poke(3);
    const el = this.q('steamBar');
    el.classList.remove('is-empty');
    void el.offsetWidth;
    el.classList.add('is-empty');
  }

  banner(text: string, ms = 2600) {
    const el = this.q('banner');
    el.textContent = text;
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    setTimeout(() => el.classList.remove('is-on'), ms);
  }

  /** A colour wash over the screen for a beat: dusk, midnight, the queen. */
  wash(color: string) {
    const el = this.q('wash');
    el.style.setProperty('--wash', color);
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
  }

  /** The dial, the dusk vignette and the queen's bar. */
  private day() {
    const s = this.sim;
    const d = s.day;
    const hour = d.hour;
    const night = sky(hour).night;
    const p = dialPoint(hour, 47);
    this.q('orb').setAttribute('transform', `translate(${p.x} ${p.y})`);
    this.q('sun').setAttribute('opacity', String(+(1 - night).toFixed(2)));
    this.q('moon').setAttribute('opacity', String(+night.toFixed(2)));
    this.q('dusk').style.opacity = String(+(night * 0.9).toFixed(2));
    const text = clockText(hour);
    const left = Math.max(0, Math.ceil(d.at.midnight - s.dayT));
    const into = d.step % BERSERK.perLevel;
    // Past midnight the dial shows the menace level and, as pips, the steps into the next one (a step every `BERSERK.every` s).
    const next = d.phase === 'midnight' ? `Menace ${d.level} ${'●'.repeat(into)}${'○'.repeat(BERSERK.perLevel - into)}` : `Midnight in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const tolls = s.places.find((pl) => pl.id === 'bell')?.v.tolls ?? 0;
    const sig = `${text}|${d.phase}|${next}|${tolls}`;
    if (sig !== this.clockSig) {
      this.clockSig = sig;
      this.q('ctime').textContent = text;
      this.q('cphase').textContent = PHASE_ARCS.find((a) => a.name.toLowerCase() === d.phase)!.name;
      this.q('cnext').textContent = next;
      // A bell mark per toll of the Dinner Bell (P36), in a row above the time.
      this.q('bells').innerHTML = `<title>The Dinner Bell's tolls: more foes, more elites, more loot</title>${Array.from({ length: tolls }, (_, i) => `<path transform="translate(${(i - (tolls - 1) / 2) * 11} -32)" d="M-4 3 Q-4 -4 0 -4.5 Q4 -4 4 3 L5 4 L-5 4 Z M-1.2 4.6 a1.2 1.2 0 0 0 2.4 0" fill="#f0cf7a" stroke="#1d1a17" stroke-width="1"/>`).join('')}`;
      const el = this.q('clock');
      el.dataset.phase = d.phase;
      el.classList.toggle('is-soon', d.phase !== 'midnight' && left <= DAY.warn);
    }
    // The dial rests through the quiet hours; evening and midnight are the danger, so it comes forward, and it pops on every change of phase.
    this.fade.clock.see(d.phase);
    this.weigh('clock', this.fade.clock.forward(d.phase === 'evening' || d.phase === 'midnight' || d.at.midnight - s.dayT <= DAY.warn || s.fx.phase !== 'idle', this.hover.has('clock')) ? 'up' : 'rest');
    this.weather();
    const boss = s.boss;
    const bar = this.q('boss');
    bar.classList.toggle('is-on', !!boss);
    if (boss) {
      this.q('bossHp').style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
      this.q('bossName').textContent = bossOf(boss.kind).name;
    }
    bar.classList.toggle('is-rage', !!boss?.brain.rage);
  }

  /** A passing weather's bar (P54) under the dial: its name and the seconds to its start (amber) or end, the bar running down. */
  private weather() {
    const f = this.sim.fx, el = this.q('weather');
    const on = f.phase !== 'idle';
    el.classList.toggle('is-on', on);
    if (!on) return;
    el.dataset.phase = f.phase;
    const text = `${ANOMALIES[f.id].name} ${f.phase === 'warn' ? 'in' : 'for'} ${Math.ceil(f.left)} s`;
    if (text !== this.weatherSig) {
      this.weatherSig = text;
      this.q('wname').textContent = text;
    }
    this.q('wfill').style.width = `${Math.max(0, Math.min(1, f.bar)) * 100}%`;
  }

  /** Which of the hover-revealing elements the pointer is over (tested a few times a second, not every frame). */
  private hovering(dt: number) {
    this.hoverT += dt;
    if (this.hoverT < 0.12) return;
    this.hoverT = 0;
    this.hover.clear();
    for (const k of ['me', 'clock', 'stock', 'support', 'roster', 'oracle']) {
      const on = over(this.q(k));
      if (on) this.hover.add(k);
      this.q(k).classList.toggle('is-hover', on);
    }
  }

  update(dt: number) {
    const s = this.sim;
    const c = s.controller;
    for (const f of Object.values(this.fade)) f.step(dt);
    this.hovering(dt);
    this.day();
    const hp = Math.max(0, c.hp / c.maxHp);
    this.q('hp').style.width = `${hp * 100}%`;
    this.q('hp').parentElement!.classList.toggle('is-low', hp < 0.5);
    this.q('hpText').textContent = `Oil ${Math.ceil(c.hp)} / ${c.maxHp}`;
    // The Oil bar: a thin quiet line while full, forward with its number when it changes, is hovered or runs down; below
    // `ALARM.urgent` it grows and the screen edge reddens (the more, the lower it is).
    this.fade.oil.see(Math.ceil(c.hp));
    const alarm = oilAlarm(hp);
    this.weigh('hpBar', hp < ALARM.urgent ? 'alarm' : this.fade.oil.forward(hp < 0.5, this.hover.has('me')) ? 'up' : 'rest');
    this.q('alarm').style.setProperty('--a', alarm.toFixed(2));
    this.q('alarm').classList.toggle('is-urgent', hp < ALARM.urgent && !s.god);
    // Steam is a gun's ammunition: no bar until a gun is in a slot. The two slots show by name (L left click, R right click).
    this.q('steamBar').hidden = !s.hasGun;
    this.q('weapon').textContent = s.secondary ? `L ${WEAPONS[s.weapon].name} · R ${WEAPONS[s.secondary].name}` : WEAPONS[s.weapon].name;
    this.q('steam').style.width = `${(c.steam / c.maxSteam) * 100}%`;
    this.q('steamText').textContent = `Steam ${Math.floor(c.steam)}`;
    // Steam is spent by the player's own clicks, so a change never brings the bar forward (every shot would make it jump): only empty, a try with none left (`noSteam`) or the pointer does.
    this.weigh('steamBar', this.fade.steam.forward(c.steam < 1, this.hover.has('me')) ? 'up' : 'rest');
    // The spare oil: one can per `LOOT.oil` of oil, filling from the bottom.
    this.q('reserve').querySelectorAll<HTMLElement>('.mc-can b').forEach((fill, i) => {
      fill.style.height = `${Math.max(0, Math.min(1, (this.sim.spare - i * LOOT.oil) / LOOT.oil)) * 100}%`;
    });
    // The spare cans rest while all are full; one spent or filling brings them forward.
    this.fade.cans.see(Math.round(this.sim.spare));
    this.weigh('reserve', this.fade.cans.forward(this.sim.spare < REVIVE.cans * LOOT.oil - 0.5, this.hover.has('me')) ? 'up' : 'rest');
    // The air support: ready, on its way (the shadow is over), or spent.
    const sup = this.q('support');
    // The call Q makes (the course table's pick): its name and charges.
    const left = s.support[s.call] ?? 0;
    const state = s.strike ? 'inbound' : left > 0 ? 'ready' : 'spent';
    if (sup.dataset.call !== s.call) {
      sup.dataset.call = s.call;
      this.q('supportName').textContent = SUPPORT[s.call].name;
      sup.dataset.state = '';
    }
    if (sup.dataset.state !== state) {
      sup.dataset.state = state;
      this.q('supportState').textContent = state === 'inbound' ? 'Inbound' : state === 'ready' ? `Ready ×${left}` : 'Spent';
    }
    const stock = [s.scrap >= 1 ? `Scrap ${Math.floor(s.scrap)}` : '', s.copper > 0 ? `Copper ${Math.floor(s.copper)}` : '', s.coal > 0 ? `Coal ${Math.floor(s.coal)}` : ''].filter(Boolean).join(' · ');
    if (this.q('stock').textContent !== stock) this.q('stock').textContent = stock;
    this.q('stock').classList.toggle('is-on', !!stock);
    this.fade.stock.see(stock);
    this.weigh('stock', this.fade.stock.forward(false, this.hover.has('stock')) ? 'up' : 'rest');
    const sal = this.q('salvage');
    sal.textContent = s.stats.parts ? `Enemy parts ×${s.stats.parts}` : '';
    sal.classList.toggle('is-on', s.stats.parts > 0);
    this.fade.salvage.see(s.stats.parts);
    this.weigh('salvage', this.fade.salvage.forward() ? 'up' : 'rest');
    const jk = this.q('junk');
    jk.textContent = s.junk.length ? `Old tech ${s.junk.length} / ${s.stripSize}` : '';
    jk.classList.toggle('is-on', s.junk.length > 0);
    this.fade.junk.see(s.junk.length);
    this.weigh('junk', this.fade.junk.forward() ? 'up' : 'rest');
    const obj = s.objective;
    if (obj !== this.objSig) {
      this.objSig = obj;
      this.q('obj').innerHTML = promptHtml(obj);
      this.q('obj').classList.toggle('is-urgent', s.day.phase === 'midnight');
    }
    // A line of objective is read once; it rests until it changes (the midnight one never rests).
    this.fade.obj.see(obj);
    this.weigh('obj', this.fade.obj.forward(s.day.phase === 'midnight') ? 'up' : 'rest');
    // The Princess's line holds a while, then fades (P58).
    if (this.herT >= 0 && (this.herT += dt) > HER_HOLD) {
      this.herT = -1;
      this.q('her').classList.remove('is-on');
    }
    // The Oracle types her lines out, then goes quiet.
    if (this.typing) {
      const t = this.typing;
      t.shown += dt * 55;
      const plain = t.text.replace(/<[^>]+>/g, '');
      if (t.shown >= plain.length) {
        this.q('otext').innerHTML = t.text;
        this.typing = null;
      } else this.q('otext').textContent = plain.slice(0, Math.floor(t.shown));
    } else {
      this.oracleT += dt;
      // A calm line goes quiet sooner than a warning; hovering her panel reads it again.
      this.q('oracle').classList.toggle('is-quiet', this.oracleT > oracleHold(this.oracleTone) && !this.hover.has('oracle'));
    }
    // The roster: rebuilt when anyone's crew, health or life changes.
    const sig = s.bots.filter((b) => b.role !== 'controller' && !b.place).map((b) => `${b.id}:${crewMark(b)}:${Math.ceil((b.hp / b.maxHp) * 20)}:${b.dead}:${b.state}:${chipWeight(b)}`).join('|');
    if (sig !== this.rosterSig) {
      this.rosterSig = sig;
      this.q('roster').innerHTML = s.bots
        .filter((b) => b.role !== 'controller' && !b.place) // not a place's own (P36's husks)
        .map(
          (b) => `<div class="mc-chip${b.dead ? ' is-dead' : ''}" data-w="${chipWeight(b)}" style="--crew:${CREW_COLORS[b.crew]}">
            <span class="mc-chip__crew">${b.dead ? '✕' : crewMark(b)}</span><span class="mc-chip__role" title="${ROLES[b.role].name}">${ROLE_GLYPH[b.role]}</span>
            <span class="mc-chip__name">${b.name}</span><span class="mc-chip__state">${b.dead ? 'lost' : b.state === 'idle' ? '' : b.state}</span>
            <span class="mc-chip__hp"><i style="width:${(b.hp / b.maxHp) * 100}%"></i></span></div>`,
        )
        .join('');
    }
  }
}

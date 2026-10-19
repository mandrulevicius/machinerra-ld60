/**
 * The Game tab of the dev sidebar (F10): Machinerra's own settings and state in one place. Every control runs an existing
 * dev command (`__game.cmd`), or, where the command lives in a scene that is not running (the hub's save while on the
 * sands), the same state function the command uses. Mission rows show only while a mission runs.
 */
import { tunes } from '../../../harness/kit';
import { CITY_STAGES, NPCS, cityStage, rescue, unrescue } from './hub/state';
import { hub } from './hub/save';
import { economy } from './hub/economy';
import { REVIVE } from './sim/defs';
import { hubLook } from './hub/hublight';

const btn = (label: string, attrs: string, on = false) => `<button class="dv-btn${on ? ' dv-on' : ''}" ${attrs}>${label}</button>`;
const group = (title: string, body: string) => `<div class="dv-group"><span class="dv-label">${title}</span><div class="dv-wrap">${body}</div></div>`;
const check = (label: string, on: boolean, attrs: string) => `<label class="dv-check"><input type="checkbox" ${attrs} ${on ? 'checked' : ''}>${label}</label>`;
const field = (label: string, value: unknown, act: string) => `<label class="dv-slide"><span>${label}</span><input type="number" min="0" step="10" data-field="${act}" value="${value}" style="width:80px">${btn('set', `data-act="${act}"`)}</label>`;

const g = () => (window as any).__game;
const scenes = (): string[] => g()?.scenes() ?? [];
const run = (line: string) => g()?.cmd(line);
const allRescued = () => !!tunes().find((t) => t.key === 'allRescued')?.value;
const allRecipes = () => !!tunes().find((t) => t.key === 'allRecipes')?.value;

export function gameTab() {
  const el = document.createElement('div');
  el.className = 'dv-stack';
  let timer = 0;
  let sig = '';

  /** Hub changes go through the hub's own commands while it runs (it redraws), else straight to the save. */
  const inHub = () => scenes().includes('Hub');

  const render = () => {
    const play = g()?.state().Play;
    const mission = scenes().includes('Play') && play;
    const s = hub.get();
    const all = allRescued();
    const eco = economy.get();
    const stage = cityStage(s, all);
    const recipes = allRecipes();
    const st = g()?.state() ?? {};
    const classes = (scenes().includes('Play') ? st.Play : scenes().includes('Place') ? st.Place : null)?.classes as { on: boolean } | undefined;
    const now = JSON.stringify([classes?.on, s, eco, all, recipes, hubLook.get(), inHub(),mission && [play.found.copper, play.reserve.cans, play.support.charges, play.day.phase, play.day.clock, play.controller.oil, play.timeScale]]);
    if (now === sig || el.contains(document.activeElement) && (document.activeElement as HTMLElement).tagName === 'INPUT' && (document.activeElement as HTMLInputElement).type === 'number') return;
    sig = now;
    el.innerHTML = `
      <b>Home (saved)</b>
      ${group('Rescued NPCs', NPCS.filter((n) => !n.always).map((n) => check(n.name.replace(/^The /, ''), s.rescued.includes(n.id), `data-rescue="${n.id}"`)).join(''))}
      ${check('Every NPC aboard (not saved, the Kit tab toggle)', all, 'data-all')}
      ${check('Every workbench recipe open (not saved; else the stations teach them)', recipes, 'data-recipes')}
      ${group('Hub light (saved in this browser; `hub mood`, `hub cone`)', (['auto', 'day', 'evening', 'night'] as const).map((m) => btn(m === 'auto' ? 'auto (day first, then random)' : m, `data-mood="${m}"`, hubLook.get().mood === m)).join('') + check('lantern is a cone (evening, night)', hubLook.get().cone, 'data-cone'))}
      ${(['scrap', 'copper', 'coal'] as const).map((k) => field(`${k} at home (the stores)`, eco[k], `stock-${k}`)).join('')}
      ${field('copper the D-city has grown on', s.city, 'city')}
      ${group(`City stage: ${CITY_STAGES[stage].name}${all || s.rescued.includes('expeditioner') ? '' : ' (empty until the Expeditioner is aboard)'}`, CITY_STAGES.map((c, i) => btn(c.name, `data-stage="${i}"`, i === stage)).join(''))}
      ${inHub() ? group('Cut scenes (preview, the save is not changed)', btn('the blessing (the wife is taken)', 'data-run="hub cutscene"')) : '<div class="dv-note">Cut scenes play in the hub.</div>'}
      <div class="dv-wrap">${btn('wipe the save', 'data-act="wipe"')}</div>
      <b>Mission</b>
      ${classes ? check('class overlay: scenery grey, loot gold, interact cyan, centre red (`classes`)', classes.on, 'data-classes') : ''}
      ${
        mission
          ? `${field('scrap carried', Math.floor(play.found.scrap), 'scrap')}
      ${field('copper carried', Math.floor(play.found.copper), 'copper')}
      ${field('coal carried', Math.floor(play.found.coal), 'coal')}
      ${group(`Spare oil cans (${play.reserve.cans} of ${REVIVE.cans})`, Array.from({ length: REVIVE.cans + 1 }, (_, n) => btn(String(n), `data-reserve="${n}"`, Math.floor(play.reserve.cans + 1e-6) === n)).join(''))}
      ${group(`Air support: ${Object.entries(play.support.charges).map(([k, n]) => `${k} ${n}`).join(', ')}`, btn('recharge', 'data-act="recharge"'))}
      ${group(`Time of day: ${play.day.phase} ${play.day.clock}`, ['morning', 'day', 'evening', 'boss', 'midnight'].map((p) => btn(p, `data-time="${p}"`, p === play.day.phase)).join(''))}
      ${group('Clock speed', [0, 0.25, 1, 4].map((x) => btn(`x${x}`, `data-speed="${x}"`, x === play.timeScale)).join(''))}`
          : '<div class="dv-note">No mission is running (the rows for copper, spare oil, air support and the time of day appear on the sands).</div>'
      }`;
  };

  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const d = (k: string) => t.closest<HTMLElement>(`[data-${k}]`)?.dataset[k];
    const rescueId = d('rescue');
    if (rescueId !== undefined) {
      const on = (t as HTMLInputElement).checked;
      if (inHub()) run(`hub ${on ? 'rescue' : 'unrescue'} ${rescueId}`);
      else hub.set((on ? rescue : unrescue)(hub.get(), rescueId));
    } else if (d('mood') !== undefined) {
      hubLook.set({ mood: d('mood') as 'auto' });
    } else if (t.closest('[data-classes]')) {
      if (t instanceof HTMLInputElement) run(`classes ${t.checked ? 'on' : 'off'}`);
    } else if (t.closest('[data-cone]')) {
      if (t instanceof HTMLInputElement) hubLook.set({ cone: t.checked });
    } else if (t.closest('[data-all]')) {
      g()?.kit.tune('allRescued', (t as HTMLInputElement).checked);
    } else if (t.closest('[data-recipes]')) {
      g()?.kit.tune('allRecipes', (t as HTMLInputElement).checked);
    } else if (d('stage') !== undefined) {
      const at = CITY_STAGES[Number(d('stage'))].at;
      if (inHub()) run(`hub city ${at}`);
      else hub.set({ ...hub.get(), city: at });
    } else if (d('run') !== undefined) run(d('run')!);
    else if (d('reserve') !== undefined) run(`reserve ${d('reserve')}`);
    else if (d('time') !== undefined) run(`time ${d('time')}`);
    else if (d('speed') !== undefined) run(`timescale ${d('speed')}`);
    else {
      const act = d('act');
      const val = () => (el.querySelector(`[data-field="${act}"]`) as HTMLInputElement | null)?.value;
      if (act === 'city') (inHub() ? run(`hub city ${val()}`) : hub.set({ ...hub.get(), city: Math.max(0, Math.floor(Number(val()))) }));
      else if (act === 'copper' || act === 'scrap' || act === 'coal') run(`${act} ${val()}`);
      else if (act?.startsWith('stock-')) {
        const k = act.slice(6) as 'scrap' | 'copper' | 'coal';
        if (inHub()) run(`hub ${k} ${val()}`);
        else economy.set({ ...economy.get(), [k]: Math.max(0, Math.floor(Number(val()))) });
      }
      else if (act === 'recharge') run('support recharge');
      else if (act === 'wipe') (inHub() ? run('hub wipe') : hub.reset());
      else return;
    }
    sig = '';
    setTimeout(render, 50);
  });

  return {
    el,
    show() {
      sig = '';
      render();
      timer = window.setInterval(render, 250);
    },
    hide() {
      clearInterval(timer);
    },
  };
}

/** Debug tab: live scene state, fps, pause/step, jump to a scene, bug report. */
import type Phaser from 'phaser';
import { paused, saveReport, setPaused } from './builtins';
import type { Tab } from './sidebar';

const MAX_STATE = 20000;

export function debugTab(game: Phaser.Game): Tab {
  const g = () => (window as any).__game;
  const el = document.createElement('div');
  el.className = 'dv-stack';
  const gamesLink = import.meta.env.DEV && window === top ? `<a class="dv-link" href="/games/index.html">All games</a>` : '';
  el.innerHTML = `
    <div class="dv-stat"><span data-fps></span><span data-objs></span></div>
    <div class="dv-wrap">
      <button class="dv-btn" data-act="pause"></button>
      <button class="dv-btn" data-act="step">Step 1 frame</button>
      <button class="dv-btn" data-act="report">Bug report</button>
    </div>
    <div class="dv-group"><span class="dv-label">Scenes (click to go)</span><div class="dv-wrap" data-scenes></div></div>
    <div class="dv-group"><span class="dv-label">State</span><pre class="dv-pre dv-state" data-state></pre></div>
    <div class="dv-note" data-msg></div>
    ${gamesLink}`;
  const $ = (s: string) => el.querySelector<HTMLElement>(s)!;
  const [fps, objs, pauseBtn, scenesEl, stateEl, msg] = ['[data-fps]', '[data-objs]', '[data-act=pause]', '[data-scenes]', '[data-state]', '[data-msg]'].map($);
  let timer = 0;

  const text = (node: HTMLElement, s: string) => node.textContent !== s && (node.textContent = s);

  const refresh = () => {
    let state: string;
    try {
      state = JSON.stringify(g().state(), null, 1);
      if (state.length > MAX_STATE) state = state.slice(0, MAX_STATE) + '\n... (cut)';
    } catch (e) {
      state = `state() threw: ${(e as Error).message}`;
    }
    text(stateEl, state);
    const p = g().perf();
    text(fps, paused(game) ? 'paused' : `${p.fps} fps`);
    text(objs, Object.entries(p.objects).map(([k, n]) => `${k}: ${n} objects`).join(' · '));
    text(pauseBtn, paused(game) ? 'Resume' : 'Pause');
    const active = new Set<string>(g().scenes());
    const keys = Object.keys(game.scene.keys);
    const html = keys.map((k) => `<button class="dv-btn${active.has(k) ? ' dv-on' : ''}" data-scene="${k}">${k}</button>`).join('');
    if (scenesEl.dataset.h !== html) {
      scenesEl.dataset.h = html;
      scenesEl.innerHTML = html;
    }
  };

  el.addEventListener('click', async (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-scene]');
    if (!t) return;
    if (t.dataset.scene) g().goto(t.dataset.scene);
    else if (t.dataset.act === 'pause') setPaused(game, !paused(game));
    else if (t.dataset.act === 'step') g().step(1);
    else if (t.dataset.act === 'report') {
      try {
        const out = await saveReport('');
        g().logs.add('log', out, true);
        msg.textContent = out;
      } catch (err) {
        msg.textContent = `error: ${(err as Error).message}`;
      }
    }
    refresh();
  });

  return {
    el,
    show() {
      refresh();
      timer = window.setInterval(refresh, 250);
    },
    hide() {
      clearInterval(timer);
    },
  };
}

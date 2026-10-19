/**
 * Kit tab: every slot's variants, live tuning values, audio, quality, export.
 * Choices go into the address bar (?v.<slot>=...), so a reload or a shared link keeps them; quality is saved per game.
 */
import type Phaser from 'phaser';
import { slots, onAnyVariant, exportVariants, syncVariantsToUrl } from '../kit/variants';
import { quality } from '../kit/state';
import { tunes, onAnyTune, setTune, exportTunes, syncTunesToUrl } from '../kit/tune';
import { audioFor } from '../kit/audio';
import type { QualityTier } from '../kit/quality';
import type { Tab } from './sidebar';

const LIGHTS = [8, 16, 32, 64];
const PARTICLES = [0.25, 0.5, 1, 1.5, 2];

const btn = (label: string, on: boolean, attrs: string) => `<button class="dv-btn${on ? ' dv-on' : ''}" ${attrs}>${label}</button>`;
const row = (title: string, body: string) => `<div class="dv-group"><span class="dv-label">${title}</span><div class="dv-wrap">${body}</div></div>`;
const check = (label: string, on: boolean, attrs: string) => `<label class="dv-check"><input type="checkbox" ${attrs} ${on ? 'checked' : ''}>${label}</label>`;
const slider = (label: string, attrs: string, value: unknown, out = '') =>
  `<label class="dv-slide"><span>${label}</span><input type="range" ${attrs} value="${value}">${out}</label>`;

export function kitTab(game: Phaser.Game): Tab & { destroy(): void } {
  const el = document.createElement('div');
  el.className = 'dv-stack';
  let exported = '';
  let visible = false;
  const audio = audioFor(game);

  const tuneBlock = () => {
    const list = tunes();
    if (!list.length) return '';
    const rows = list.map((t) => {
      const id = `data-tune="${t.key}"`;
      if (t.kind === 'boolean') return check(t.key, !!t.value, id);
      if (t.kind === 'choice') return row(t.key, t.options.map((o) => btn(o, o === t.value, `${id} data-v="${o}"`)).join(''));
      return slider(t.key, `min="${t.min}" max="${t.max}" step="${t.step}" ${id}`, t.value, `<span class="dv-val" data-tune-val="${t.key}">${t.value}</span>`);
    });
    return `<b>Tuning</b>${rows.join('')}`;
  };

  const render = () => {
    if (!visible) return;
    const q = quality().get();
    const reload = quality().needsReload();
    el.innerHTML = `
      <b>Variants</b>
      ${slots()
        .map((s) => row(s.key, Object.keys(s.variants).map((n) => btn(n, n === s.name, `data-slot="${s.key}" data-v="${n}"`)).join('')))
        .join('')}
      ${tuneBlock()}
      <b>Audio</b>
      ${(['master', 'music', 'sfx'] as const).map((k) => slider(k, `min="0" max="1" step="0.05" data-vol="${k}"`, audio.volume[k])).join('')}
      <div>${btn('mute', audio.volume.muted, 'data-act="mute"')}</div>
      <b>Quality</b>
      ${row('level', (['low', 'medium', 'high'] as QualityTier[]).map((l) => btn(l, l === q.level, `data-q="level" data-v="${l}"`)).join(''))}
      ${row('lights' + (reload ? ' (reload to raise)' : ''), LIGHTS.map((n) => btn(String(n), n === q.lights, `data-q="lights" data-v="${n}"`)).join('') + (reload ? btn('reload', false, 'data-act="reload"') : ''))}
      ${row('particles', PARTICLES.map((n) => btn(`x${n}`, n === q.particles, `data-q="particles" data-v="${n}"`)).join(''))}
      ${(['shadows', 'glow'] as const).map((k) => check(k, q[k], `data-q="${k}"`)).join('')}
      <div>${btn('export', false, 'data-act="export"')}</div>
      ${exported ? `<pre class="dv-pre">${exported}</pre>` : ''}`;
  };

  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-slot],[data-q],[data-act],[data-tune]');
    if (!t) return;
    const { slot: key, q: qk, v, act, tune: tk } = t.dataset;
    if (tk) {
      if (t instanceof HTMLInputElement && t.type === 'range') return;
      setTune(tk, t instanceof HTMLInputElement ? t.checked : v);
      syncTunesToUrl();
    } else if (key && v) {
      slots().find((s) => s.key === key)?.set(v);
      syncVariantsToUrl();
    } else if (qk && t instanceof HTMLInputElement) quality().set({ [qk]: t.checked });
    else if (qk && v) quality().set({ [qk]: qk === 'level' ? v : Number(v) });
    else if (act === 'reload') location.reload();
    else if (act === 'mute') audio.set({ muted: !audio.volume.muted });
    else if (act === 'export') {
      exported = `variants: ${JSON.stringify(exportVariants())}` + (tunes().length ? `,\ntunes: ${JSON.stringify(exportTunes())}` : '');
      navigator.clipboard?.writeText(exported).catch(() => {});
      console.log(`[kit] ${exported}`);
    }
    render();
  });

  // Sliders act while dragging and do not re-render, which would drop the drag.
  let dragging = false;
  el.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.vol) audio.set({ [t.dataset.vol]: Number(t.value) });
    else if (t.dataset.tune && t.type === 'range') {
      dragging = true;
      setTune(t.dataset.tune, t.value);
      dragging = false;
      syncTunesToUrl();
      const out = el.querySelector(`[data-tune-val="${t.dataset.tune}"]`);
      if (out) out.textContent = String(tunes().find((x) => x.key === t.dataset.tune)?.value);
    }
  });

  const offs = [onAnyVariant(render), quality().on(render), onAnyTune(() => !dragging && render())];
  return {
    el,
    show() {
      visible = true;
      render();
    },
    hide() {
      visible = false;
    },
    destroy: () => offs.forEach((f) => f()),
  };
}

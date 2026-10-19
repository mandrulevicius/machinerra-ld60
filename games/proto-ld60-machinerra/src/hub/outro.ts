/**
 * The outro (Laimonas, `LaimonasIdeas.md`, 2026-10-18): after the Evil Oracle's hand-in finishes the main quest, the
 * screen goes black and says it was the last boss, thanks the player, shows the time the run took (`playtime.ts`), rolls
 * the credits (`../credits.ts`) and ends on the studio's name. Then the deck again: the game goes on.
 *
 * Plain DOM over the canvas (styles `.hb-outro` in hub.css). A beat holds its time, or Use, Space, Enter or a click moves
 * on; Esc skips to the end card; on the end card any of them closes it. Add a card: a line in `beats`.
 */
import { CREDITS, STUDIO } from '../credits';
import { fmtTime } from './playtime';

export interface OutroStats {
  /** Time to finish, ms. */
  time: number;
  missions: number;
}

type Beat = { kind: 'card' | 'roll' | 'end'; html: string; hold: number };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function outroBeats(st: OutroStats): Beat[] {
  const roll = CREDITS.map((l) => {
    const [who, what] = l.split(': ');
    return `<p><b>${esc(who)}</b>${what ? `<span>${esc(what)}</span>` : ''}</p>`;
  }).join('');
  return [
    { kind: 'card', html: '<p class="hb-outro__big">That was the last boss.</p>', hold: 3400 },
    { kind: 'card', html: '<p class="hb-outro__big">Thanks for playing.</p>', hold: 3200 },
    {
      kind: 'card',
      html: `<p class="hb-outro__label">Time to finish</p><p class="hb-outro__big">${fmtTime(st.time)}</p><p class="hb-outro__label">${st.missions} ${st.missions === 1 ? 'landing' : 'landings'}</p>`,
      hold: 4200,
    },
    { kind: 'roll', html: `<p class="hb-outro__label">Machinerra</p><p class="hb-outro__label">Credits</p>${roll}`, hold: 12000 },
    { kind: 'end', html: `<p class="hb-outro__label">A game by</p><p class="hb-outro__studio">${esc(STUDIO)}</p>`, hold: 0 },
  ];
}

/** Play the outro over `ui`; `done` runs when it closes. Returns a function that closes it at once. */
export function playOutro(ui: HTMLElement, st: OutroStats, done: () => void, sfx?: (key: string) => void): () => void {
  const beats = outroBeats(st);
  const root = document.createElement('div');
  root.className = 'hb-outro';
  root.innerHTML = '<div class="hb-outro__stage"></div><small class="hb-outro__more">Use to go on</small>';
  ui.appendChild(root);
  const stage = root.querySelector<HTMLElement>('.hb-outro__stage')!;
  const more = root.querySelector<HTMLElement>('.hb-outro__more')!;
  requestAnimationFrame(() => root.classList.add('is-on'));

  let i = -1;
  let timer = 0;
  let over = false;
  const show = (n: number) => {
    clearTimeout(timer);
    i = n;
    const b = beats[i];
    const old = stage.firstElementChild as HTMLElement | null;
    if (old) {
      old.classList.remove('is-on');
      setTimeout(() => old.remove(), 700);
    }
    const el = document.createElement('div');
    el.className = `hb-outro__beat hb-outro__beat--${b.kind}`;
    el.innerHTML = b.kind === 'roll' ? `<div class="hb-outro__scroll" style="animation-duration:${b.hold}ms">${b.html}</div>` : b.html;
    stage.prepend(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-on')));
    sfx?.(b.kind === 'end' ? 'bell' : 'tgTick');
    if (b.kind === 'end') more.textContent = 'Use to go back to the deck';
    else timer = window.setTimeout(next, b.hold);
  };
  const next = () => {
    if (over) return;
    if (i >= beats.length - 1) return finish();
    show(i + 1);
  };
  const key = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      next();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (i < beats.length - 1) show(beats.length - 1);
      else finish();
    }
  };
  window.addEventListener('keydown', key, true);
  root.addEventListener('click', next);
  const finish = () => {
    if (over) return;
    over = true;
    clearTimeout(timer);
    window.removeEventListener('keydown', key, true);
    root.classList.remove('is-on');
    setTimeout(() => root.remove(), 1200);
    done();
  };
  // The black fades in before the first card.
  timer = window.setTimeout(next, 1400);
  return finish;
}

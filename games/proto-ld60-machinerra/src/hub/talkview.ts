/**
 * The dialog frame (DOM over the zoomed hub): a brass frame that slides up with the NPC's portrait under glass, their
 * words typed out on a strip of telegraph tape, and the Communicator's replies as brass levers. It only draws and
 * reports (`TalkEvents`); `Hub.ts` owns the conversation, the camera, the NPC's acting and the sounds. Look: `talk.css`.
 */
import { promptHtml, promptText } from '../../../../harness/kit';
import type { Kind, Weight } from './dialog';
import './talk.css';

/** What each kind of lever wears on its plate: a drawn glyph (stroked in the kind's colour, `talk.css`) and a short word. Talk is the plain default: no word. */
const KIND: Record<Kind, { glyph: string; tag: string }> = {
  quest: { glyph: '<path d="M12 3.5v10M12 17.8v1.4" />', tag: 'Quest' },
  action: { glyph: '<circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9L18 18M18 6l-2.1 2.1M8.1 15.9L6 18" />', tag: 'Opens' },
  talk: { glyph: '<path d="M4.5 6.5h15v9h-7l-4 3.5v-3.5h-4z" />', tag: '' },
  exit: { glyph: '<path d="M14 5.5H6.5v13H14M11 12h9M16.8 8.6 20 12l-3.2 3.4" />', tag: 'Leave' },
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface Speaker { name: string; role: string; portrait: string | null }
export interface TalkEvents {
  /** The player asks for the next line (click on the frame or the world). */
  advance(): void;
  /** A lever reached the bottom of its slot: the thunk. */
  thunk(): void;
  /** The pull is done: act on choice `i`. */
  pick(i: number): void;
  /** The lever under the pointer or the selection moved. */
  select(i: number): void;
}

/** Characters per second, slower on punctuation like a telegraph operator catching their breath. */
const CPS = 44;
const PAUSE: Record<string, number> = { ',': 0.12, ';': 0.16, ':': 0.16, '.': 0.26, '!': 0.28, '?': 0.28, '—': 0.14 };
/** Pull animation, ms: the lever hits the bottom, then the choice is made. */
const PULL = { thunk: 150, done: 460 };

export class TalkView {
  private el: HTMLElement;
  private q: (k: string) => HTMLElement;
  private text = '';
  private shown = 0;
  private wait = 0;
  private acc = 0;
  private levers: HTMLElement[] = [];
  private busy = false;
  private sel = 0;
  private closing = 0;

  constructor(private host: HTMLElement, private ev: TalkEvents) {
    this.el = document.createElement('div');
    this.el.className = 'tk';
    this.el.innerHTML = `
      <div class="tk-vignette"></div>
      <div class="tk-catch" data-k="catch"></div>
      <div class="tk-frame" data-k="frame">
        <div class="tk-glasswrap">
          <div class="tk-glass"><img class="tk-portrait" data-k="portrait" alt=""><i class="tk-fog" data-k="fog"></i><i class="tk-gleam"></i></div>
          <div class="tk-plate"><b class="tk-name" data-k="name"></b><span class="tk-role" data-k="role"></span></div>
        </div>
        <div class="tk-body">
          <div class="tk-tape" data-k="tape"><div class="tk-tape__text" data-k="text" aria-live="polite"></div><i class="tk-caret" data-k="caret"></i></div>
          <div class="tk-hint" data-k="hint"></div>
          <div class="tk-levers" data-k="levers"></div>
        </div>
      </div>`;
    host.appendChild(this.el);
    host.classList.add('is-talking');
    this.q = (k) => this.el.querySelector(`[data-k="${k}"]`) as HTMLElement;
    this.q('catch').addEventListener('pointerdown', () => this.click());
    this.q('tape').addEventListener('pointerdown', () => this.click());
    this.q('hint').addEventListener('pointerdown', () => this.click());
  }

  get attached() {
    return this.el.isConnected;
  }

  /** Slide in for this speaker. */
  open(who: Speaker) {
    this.q('name').textContent = who.name;
    this.q('role').textContent = who.role;
    const img = this.q('portrait') as HTMLImageElement;
    if (who.portrait) img.src = who.portrait;
    img.hidden = !who.portrait;
    void this.el.offsetWidth;
    this.el.classList.add('is-open');
  }

  /** Slide out and remove. */
  close() {
    this.el.classList.remove('is-open');
    this.el.classList.add('is-closing');
    this.host.classList.remove('is-talking');
    window.clearTimeout(this.closing);
    this.closing = window.setTimeout(() => this.el.remove(), 600);
  }

  /** Start typing a line (the levers go away). */
  say(text: string) {
    this.text = promptText(text);
    this.html = promptHtml(text);
    this.shown = 0;
    this.wait = 0;
    this.acc = 0;
    this.clearLevers();
    const t = this.q('text');
    t.textContent = '';
    this.q('tape').classList.remove('is-idle');
    this.q('caret').hidden = false;
    this.hint(promptHtml('{use} or click to go on'));
  }
  private html = '';

  get typing() {
    return this.shown < this.text.length;
  }

  /** Nothing on the tape yet (the frame is still sliding in) and no levers. */
  get blank() {
    return !this.text && !this.levers.length;
  }

  /** Reveal the rest of the line at once. */
  complete() {
    if (!this.typing) return;
    this.shown = this.text.length;
    this.paint();
  }

  /** Typing: returns the characters just printed (for the tick and the NPC's mumble). */
  update(dt: number): string {
    if (!this.typing) return '';
    this.acc += Math.min(dt, 0.1);
    let out = '';
    while (this.typing) {
      if (this.wait > 0) {
        const w = Math.min(this.wait, this.acc);
        this.wait -= w;
        this.acc -= w;
        if (this.wait > 0) break;
      }
      if (this.acc < 1 / CPS) break;
      this.acc -= 1 / CPS;
      const c = this.text[this.shown++];
      out += c;
      this.wait = PAUSE[c] ?? 0;
    }
    this.paint();
    return out;
  }

  private paint() {
    const t = this.q('text');
    if (!this.typing) {
      t.innerHTML = this.html;
      this.q('caret').hidden = true;
      this.q('tape').classList.add('is-idle');
    } else t.textContent = this.text.slice(0, this.shown);
  }

  private click() {
    if (this.busy) return;
    if (this.levers.length) return;
    this.ev.advance();
  }

  private hint(html: string) {
    this.q('hint').innerHTML = html;
  }

  /**
   * The levers: one per reply, in the Communicator's words. Each is weighed (`dialog.ts` `weigh`): the one that moves the story
   * on stands out and is the one the pull starts on, answers already heard go quiet, a way out is the quietest. Its kind (`dialog.ts`
   * `kindOf`) is the glyph and word on the plate.
   */
  choose(items: { text: string; weight?: Weight; kind?: Kind }[]) {
    this.hint(promptHtml('{up} {down} choose, {use} pull'));
    this.q('caret').hidden = true;
    const box = this.q('levers');
    box.innerHTML = '';
    this.levers = items.map(({ text: t, weight, kind = 'talk' }, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tk-lever';
      b.dataset.w = weight ?? 'side';
      b.dataset.k = kind;
      b.style.setProperty('--i', String(i));
      b.innerHTML = `<span class="tk-lever__slot"><i class="tk-lever__arm"><u></u></i></span><span class="tk-lever__plate"><svg class="tk-lever__glyph" viewBox="0 0 24 24" aria-hidden="true">${KIND[kind].glyph}</svg><span class="tk-lever__text">${esc(t)}</span>${KIND[kind].tag ? `<i class="tk-lever__tag">${KIND[kind].tag}</i>` : ''}</span>`;
      b.addEventListener('pointerenter', () => this.select(i, true));
      b.addEventListener('focus', () => this.select(i, true));
      b.addEventListener('click', () => this.pull(i));
      box.appendChild(b);
      return b;
    });
    box.dataset.n = String(items.length);
    box.style.setProperty('--rows', String(Math.max(1, Math.ceil(items.length / 2)))); // two columns, the list running down the left one first
    this.busy = false;
    this.sel = Math.max(0, items.findIndex((x) => x.weight === 'story'));
    this.mark();
  }

  private clearLevers() {
    this.q('levers').innerHTML = '';
    this.levers = [];
  }

  get choosing() {
    return this.levers.length > 0 && !this.busy;
  }

  get selected() {
    return this.sel;
  }

  select(i: number, quiet = false) {
    if (this.busy || !this.levers.length) return;
    const n = this.levers.length;
    const to = ((i % n) + n) % n;
    if (to === this.sel && quiet) return;
    this.sel = to;
    this.mark();
    this.ev.select(to);
  }

  private mark() {
    this.levers.forEach((l, i) => l.classList.toggle('is-sel', i === this.sel));
  }

  /** Pull lever `i` down; its thunk lands on cue and the choice follows. */
  pull(i = this.sel) {
    if (this.busy || !this.levers[i]) return;
    this.busy = true;
    this.sel = i;
    this.mark();
    this.levers[i].classList.add('is-pulled');
    window.setTimeout(() => this.ev.thunk(), PULL.thunk);
    window.setTimeout(() => {
      this.busy = false;
      this.ev.pick(i);
    }, PULL.done);
  }

  /** The glass fogs for a moment (the NPC vents steam). */
  fog() {
    const f = this.q('fog');
    f.classList.remove('is-on');
    void f.offsetWidth;
    f.classList.add('is-on');
  }

  /** The portrait's squash, as the NPC's (a number around 0, up to 0.2). */
  pose(sq: number, rot = 0) {
    const p = this.q('portrait');
    p.style.setProperty('--sq', sq.toFixed(3));
    p.style.setProperty('--rot', `${rot.toFixed(3)}rad`);
  }

  /** What is on show, for `debugState`. */
  state() {
    return {
      typed: this.shown,
      length: this.text.length,
      typing: this.typing,
      text: this.text.slice(0, this.shown),
      levers: this.levers.map((l) => l.querySelector('.tk-lever__text')!.textContent),
      selected: this.levers.length ? this.sel : null,
    };
  }
}

/**
 * The map (M): a dark survey of the land with its points of interest, and the crews beside it. It starts blank: the land
 * shows only where you, your robots or a mast have seen (`sim.fog`), and what is out there but unseen shows as a rough
 * area with an icon (`sim.signals`, P6). Marks (ruins, taps, seams) appear once their spot has been seen. Drag robots between
 * crews (or click robots, then a crew; a crew's "All", or Ctrl-click on one of its robots, picks every robot in it).
 * Command mode's controls work on the survey too (P3, `sim/command.ts`, the same `Selection`): click a robot or drag a box
 * to pick, Ctrl-click a robot to pick its crew, right click to send the picked robots (a right click snaps to a seep, seam,
 * hive, ruin or the lift; on the Communicator it is the follow order); 1-3 and Shift+number come from `commandmode.ts`.
 * A part of a crew sent goes on its own and keeps its crew. Crew 0 always walks with the Communicator. The scene slows the
 * mission (not pauses) while the map is open, and the Communicator stands still.
 *
 * Attention (P33, `attention.ts`; the look is `mapview.css`): the way home (the lift), the threat (an awake hive, the enemies seen)
 * and the choice (the crews, the picked robots) read first. A hive asleep, a coal seam, a tap and a ruin are said by a short name
 * and dim, their numbers only when the pointer is near; the rough areas are quiet rings; the legend rests until the pointer is on
 * the frame; the way-home button comes forward at evening and midnight, like the dial. All of it is looks: no rule here.
 */
import { upper } from './sim/sim';
import { CREWS, T } from './sim/defs';
import { Ter } from './sim/mapgen';
import type { Sim, SimEvent } from './sim/sim';
import { CREW_COLORS, ROLE_GLYPH, crewMark } from './hud';
import { ROLES } from './sim/defs';
import { boxBots, crewIds, orderSelection, ownPoints, pickBot, type Selection } from './sim/command';
import type { Signal, SignalKind } from './sim/fog';
import { sightOf } from './sim/fogplay';
import { MAP_NEAR, dangerHour } from './attention';
import { css, DANGER, DANGER_TWISTED, DANGER_TEXT, FRIEND, FRIEND_TEXT } from './house';
import './mapview.css';

const MW = 820, MH = 615;
/** The title's standing line. */
const HELP = 'Click or drag to pick robots, right click to send them.';
/** How near a click picks a robot, and a right click lands on him (map px); a drag shorter than CLICK is a click. */
const PICK = 9, COMM = 11, CLICK = 5;
/** How often the survey is redrawn while nothing is touched (ms): the crews move and the rings shimmer at this pace. */
const REDRAW_MS = 100;

/** What a signal's area is called on the map, and the brass of its ring and icon. */
const SIGNAL_NAME: Record<SignalKind, string> = { pilgrim: 'pilgrim', shrine: 'shrine', castle: 'castle', mast: 'mast', ruins: 'rich ruins', vault: 'vault', cache: 'cache', kennel: 'kennel', place: 'something old' };
const BRASS = '#d9a24a', BRASS_TEXT = '#ffd98a';

/** A signal's icon, about 18 px, centred on (x, y): one little drawing per kind. */
function icon(c: CanvasRenderingContext2D, kind: SignalKind, x: number, y: number) {
  c.save();
  c.translate(x, y);
  c.fillStyle = '#1c130b';
  c.strokeStyle = BRASS;
  c.lineWidth = 2;
  c.lineJoin = 'round';
  c.beginPath();
  switch (kind) {
    case 'pilgrim': // a figure
      c.arc(0, -6, 3.5, 0, Math.PI * 2);
      c.moveTo(0, -2); c.lineTo(6, 8); c.lineTo(-6, 8); c.closePath();
      break;
    case 'shrine': // a small arch
      c.moveTo(-7, 8); c.lineTo(-7, -2); c.arc(0, -2, 7, Math.PI, 0); c.lineTo(7, 8); c.closePath();
      break;
    case 'castle': // battlements
      c.moveTo(-8, 8); c.lineTo(-8, -6); c.lineTo(-4, -6); c.lineTo(-4, -3); c.lineTo(-1.5, -3); c.lineTo(-1.5, -6); c.lineTo(1.5, -6); c.lineTo(1.5, -3);
      c.lineTo(4, -3); c.lineTo(4, -6); c.lineTo(8, -6); c.lineTo(8, 8); c.closePath();
      break;
    case 'mast': // a tower with its crossbars
      c.moveTo(0, -9); c.lineTo(6, 9); c.lineTo(-6, 9); c.closePath();
      c.moveTo(-3, 1); c.lineTo(3, 1);
      c.moveTo(-1.5, -4); c.lineTo(1.5, -4);
      break;
    case 'ruins': // broken blocks
      c.rect(-8, 1, 7, 7); c.rect(1, 3, 7, 5); c.rect(-4, -7, 6, 7);
      break;
    case 'kennel': // a paw: a pad and four toes
      c.ellipse(0, 4, 6, 5, 0, 0, Math.PI * 2);
      for (const [dx, dy] of [[-7, -3], [-2.5, -8], [2.5, -8], [7, -3]]) { c.moveTo(dx + 2.4, dy); c.arc(dx, dy, 2.4, 0, Math.PI * 2); }
      break;
    case 'place': // a question mark's dot and hook
      c.arc(0, -3, 5, Math.PI, Math.PI * 2.4); c.moveTo(0, 2); c.lineTo(0, 4); c.moveTo(1.8, 8); c.arc(0, 8, 1.8, 0, Math.PI * 2);
      break;
    case 'vault': // a door with a keyhole
      c.rect(-7, -7, 14, 15);
      c.moveTo(3, 0); c.arc(0, -1, 3, 0, Math.PI * 2);
      c.moveTo(0, 2); c.lineTo(0, 5);
      break;
    case 'cache': // a crate with a lid band
      c.rect(-8, -6, 16, 14);
      c.moveTo(-8, -1); c.lineTo(8, -1);
      break;
  }
  c.fill();
  c.stroke();
  c.restore();
}

export class MapView {
  readonly el: HTMLElement;
  private cv: HTMLCanvasElement;
  private base: HTMLCanvasElement;
  /** The survey grid, drawn over the fog too (blank survey paper). */
  private grid: HTMLCanvasElement;
  /** One pixel a tile (and one more all round): opaque where unseen. Redrawn when the fog changes (`fogRev`), then scaled up blurred into `fog`, so its edge is soft. */
  private mask: HTMLCanvasElement;
  private fog: HTMLCanvasElement;
  private fogRev = -1;
  /** The robots picked and the crew a map click sends: shared with command mode, so a pick made in either shows in both. */
  private get sel() {
    return this.pick.ids;
  }
  get crew() {
    return this.pick.crew;
  }
  set crew(c: number) {
    this.pick.crew = c;
  }
  open = false;
  private sig = '';
  /** The survey is redrawn every `REDRAW_MS`, at once when the pointer, a drag or the pick changes (`dirty`). */
  private dirty = true;
  private drawnAt = 0;
  private drawnPick = '';
  /** The pointer over the survey (map px), or null: a mark's numbers show only near it. */
  private hov: { x: number; y: number } | null = null;
  /** Is the pointer near this spot (map px)? */
  private near(x: number, y: number) {
    return !!this.hov && Math.hypot(this.hov.x - x, this.hov.y - y) <= MAP_NEAR;
  }
  /** A left drag on the survey (map px), until the button comes up. */
  private drag: { x0: number; y0: number; x: number; y: number } | null = null;
  /** Hives anyone has seen (sleeping ones stay hidden until a robot comes near). */
  seen = new Set<number>();

  /** The mast shows every hive on the map too. */
  event(e: SimEvent) {
    if (e.e === 'place' && e.what === 'climb') for (const n of this.sim.nests) this.seen.add(n.id);
  }

  constructor(private root: HTMLElement, private sim: Sim, private calls: { close(): void; sound(k: string): void }, private pick: Selection) {
    this.el = document.createElement('div');
    this.el.className = 'mc-map';
    this.el.innerHTML = `
      <div class="mc-map__frame">
        <div class="mc-map__title">Survey of ${sim.biome.talk.land}<span>${HELP}</span></div>
        <canvas width="${MW}" height="${MH}"></canvas>
        <div class="mc-map__legend"><span class="lg lg--lift">Lift</span><span class="lg lg--seep">Tap</span><span class="lg lg--nest">${upper(sim.biome.talk.hive)}</span><span class="lg lg--ruin">Old-tech ruin</span><span class="lg lg--signal">Live signal</span><span class="lg lg--area">Rough area</span><span class="lg lg--hornet">${sim.biome.talk.foes}</span></div>
      </div>
      <div class="mc-crews">
        <div class="mc-crews__title">Crews</div>
        <div class="mc-crews__help">Drag robots between crews, or click robots then a crew. Ctrl-click (or All) picks a whole crew.</div>
        <div class="mc-crews__list"></div>
        <button class="ui-btn mc-evac">Send every crew to the lift</button>
        <button class="ui-btn mc-close">Close map</button>
      </div>`;
    root.appendChild(this.el);
    this.cv = this.el.querySelector('canvas')!;
    this.base = document.createElement('canvas');
    this.base.width = MW;
    this.base.height = MH;
    this.grid = document.createElement('canvas');
    this.grid.width = MW;
    this.grid.height = MH;
    this.mask = document.createElement('canvas');
    this.mask.width = sim.map.w + 2;
    this.mask.height = sim.map.h + 2;
    this.fog = document.createElement('canvas');
    this.fog.width = MW;
    this.fog.height = MH;
    this.paintBase();
    this.cv.addEventListener('mousedown', (e) => this.down(e));
    this.cv.addEventListener('mousemove', (e) => {
      this.hov = this.at(e);
      this.dirty = true;
    });
    this.cv.addEventListener('mouseleave', () => {
      this.hov = null;
      this.dirty = true;
    });
    window.addEventListener('mousemove', this.moveDrag);
    window.addEventListener('mouseup', this.up);
    this.cv.addEventListener('contextmenu', (e) => this.rightClick(e));
    this.el.querySelector('.mc-evac')!.addEventListener('click', () => {
      sim.evacuate();
      calls.sound('click');
      this.sig = '';
    });
    this.el.querySelector('.mc-close')!.addEventListener('click', () => calls.close());
  }

  private get k() {
    return MW / (this.sim.W * T);
  }

  private paintBase() {
    const m = this.sim.map;
    const c = this.base.getContext('2d')!;
    const tw = MW / m.w, th = MH / m.h;
    c.fillStyle = '#120e0a';
    c.fillRect(0, 0, MW, MH);
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const t = m.ter[y * m.w + x];
        c.fillStyle = t === Ter.Rock ? '#5a3c28' : t === Ter.Dune ? '#3a2e20' : t === Ter.Hardpan ? '#2a2219' : '#30261b';
        c.fillRect(x * tw, y * th, tw + 0.5, th + 0.5);
      }
    // A survey grid, in the colony's old way.
    const g = this.grid.getContext('2d')!;
    g.strokeStyle = 'rgba(224,160,64,0.08)';
    g.lineWidth = 1;
    for (let x = 0; x < MW; x += tw * 10) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, MH);
      g.stroke();
    }
    for (let y = 0; y < MH; y += th * 10) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(MW, y);
      g.stroke();
    }
  }

  /** The fog: solid where unseen, redrawn only when something new was seen. */
  private paintMask() {
    const f = this.sim.fog;
    if (f.rev === this.fogRev) return;
    this.fogRev = f.rev;
    const mw = f.w + 2, mh = f.h + 2;
    const c = this.mask.getContext('2d')!;
    const img = c.createImageData(mw, mh);
    for (let j = 0; j < mh; j++)
      for (let i = 0; i < mw; i++) {
        // The border repeats the nearest tile, so the land's edge stays as seen or unseen as it is.
        const seen = f.seen[Math.min(f.h - 1, Math.max(0, j - 1)) * f.w + Math.min(f.w - 1, Math.max(0, i - 1))];
        const o = (j * mw + i) * 4;
        img.data[o] = 0x12;
        img.data[o + 1] = 0x0e;
        img.data[o + 2] = 0x0a;
        img.data[o + 3] = seen ? 0 : 255;
      }
    c.putImageData(img, 0, 0);
    const g = this.fog.getContext('2d')!;
    g.clearRect(0, 0, MW, MH);
    g.filter = 'blur(5px)';
    g.imageSmoothingEnabled = true;
    const tw = MW / f.w, th = MH / f.h;
    g.drawImage(this.mask, -tw, -th, MW + 2 * tw, MH + 2 * th);
    g.filter = 'none';
  }

  /** Has the land under a spot (px) been seen? */
  private seenAt(x: number, y: number) {
    return this.sim.fog.at(x / T - 0.5, y / T - 0.5);
  }

  /** The window listeners go with the scene. */
  destroy() {
    window.removeEventListener('mousemove', this.moveDrag);
    window.removeEventListener('mouseup', this.up);
  }

  show() {
    this.open = true;
    this.sig = '';
    this.dirty = true;
    this.el.classList.add('is-open');
    this.refresh();
  }
  hide() {
    this.open = false;
    this.el.classList.remove('is-open');
  }

  /** Points a click snaps to. */
  private pois() {
    const s = this.sim;
    return [
      { x: s.lift.x, y: s.lift.y },
      ...s.seeps.filter((p) => p.amount > 0 && this.seenAt(p.x, p.y)),
      ...s.seams.filter((p) => p.amount > 0 && this.seenAt(p.x, p.y)),
      ...s.nests.filter((n) => !n.dead && (n.awake || this.seen.has(n.id))),
      ...s.map.ruins.map((r) => ({ x: (r.x + 0.5) * T, y: (r.y + 0.5) * T })).filter((p) => this.seenAt(p.x, p.y)),
    ];
  }

  /** Map px under the mouse. */
  private at(e: MouseEvent) {
    const r = this.cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * MW, y: ((e.clientY - r.top) / r.height) * MH };
  }

  private down(e: MouseEvent) {
    if (e.button !== 0) return;
    const p = this.at(e);
    this.drag = { x0: p.x, y0: p.y, x: p.x, y: p.y };
    this.dirty = true;
  }

  private moveDrag = (e: MouseEvent) => {
    if (!this.drag) return;
    const p = this.at(e);
    this.drag.x = p.x;
    this.drag.y = p.y;
    this.dirty = true;
  };

  /** A left click picks the robot under it (Ctrl: its whole crew) or nobody; a drag picks the robots in its box. */
  private up = (e: MouseEvent) => {
    const d = this.drag;
    if (!d || e.button !== 0) return;
    this.drag = null;
    this.dirty = true;
    const k = this.k;
    if (Math.hypot(d.x - d.x0, d.y - d.y0) > CLICK) {
      this.pick.ids = new Set(boxBots(this.sim, d.x0 / k, d.y0 / k, d.x / k, d.y / k, 0));
      const crews = new Set([...this.sel].map((id) => this.sim.bot(id)!.crew));
      if (crews.size === 1 && !crews.has(0)) this.crew = [...crews][0];
    } else {
      const hit = pickBot(this.sim, d.x / k, d.y / k, PICK / k, 0);
      if (hit && (e.ctrlKey || e.metaKey)) this.pick.ids = new Set(crewIds(this.sim, hit.crew));
      else this.pick.ids = new Set(hit ? [hit.id] : []);
      if (hit && hit.crew > 0) this.crew = hit.crew;
    }
    if (this.sel.size) this.calls.sound('click');
    this.sig = '';
    this.refresh();
  };

  /** A right click sends the picked robots, as in command mode (`orderSelection`): snapped to a point of interest, or the follow order on him. */
  private rightClick(e: MouseEvent) {
    e.preventDefault();
    const p = this.at(e);
    const k = this.k;
    const x = p.x / k, y = p.y / k;
    if (!this.sel.size) {
      this.flash('Pick robots first: click or drag on the map, a crew\'s All, or 1-3.');
      return;
    }
    const c = this.sim.controller;
    const follow = !c.dead && Math.hypot(c.x * k - p.x, c.y * k - p.y) <= COMM;
    let tx = x, ty = y;
    let bd = 2.5 * T;
    if (!follow)
      for (const q of this.pois()) {
        const d = Math.hypot(q.x - x, q.y - y);
        if (d < bd) {
          bd = d;
          tx = q.x;
          ty = q.y;
        }
      }
    const r = orderSelection(this.sim, this.pick, tx, ty, follow);
    if (r.why) this.flash(r.why);
    else if (r.alone.length && !r.sent.length) this.flash(`${r.alone.length === 1 ? this.sim.bot(r.alone[0])!.name : `${r.alone.length} robots`} sent on ${r.alone.length === 1 ? 'its' : 'their'} own; Shift+${this.sim.bot(r.alone[0])!.crew} gives back.`, false);
    if (r.sent.length || r.alone.length) this.calls.sound('click');
    this.sig = '';
  }

  private flashT = 0;
  private flash(text: string, warn = true) {
    const t = this.el.querySelector('.mc-map__title span') as HTMLElement;
    t.textContent = text;
    t.classList.toggle('is-warn', warn);
    clearTimeout(this.flashT);
    this.flashT = window.setTimeout(() => {
      t.textContent = HELP;
      t.classList.remove('is-warn');
    }, 2600);
  }

  private move(ids: number[], crew: number) {
    for (const id of ids) this.sim.assign(id, crew);
    this.sel.clear();
    this.calls.sound('click');
    this.sig = '';
  }

  /** Track which sleeping hives a robot has come close enough to see. */
  spot() {
    if (this.sim.perks.has('crowsNest')) for (const n of this.sim.nests) this.seen.add(n.id); // a city perk: every hive is marked from landing
    for (const n of this.sim.nests) if (!this.seen.has(n.id) && this.sim.bots.some((b) => !b.dead && Math.hypot(b.x - n.x, b.y - n.y) < 11 * T)) this.seen.add(n.id);
  }

  refresh() {
    if (!this.open) return;
    const now = performance.now(), picked = [...this.sel].join(',');
    if (this.dirty || this.sig === '' || picked !== this.drawnPick || now - this.drawnAt >= REDRAW_MS) {
      this.dirty = false;
      this.drawnAt = now;
      this.drawnPick = picked;
      this.drawMap();
    }
    const s = this.sim;
    // Weights: the way home comes forward when the day turns dangerous; robots picked make the crews the place to click.
    const evac = this.el.querySelector<HTMLElement>('.mc-evac')!;
    const w = dangerHour(s.day.phase) ? 'up' : 'rest';
    if (evac.dataset.w !== w) evac.dataset.w = w;
    this.el.querySelector('.mc-crews')!.classList.toggle('is-picking', this.sel.size > 0);
    const sig = JSON.stringify([s.crew.map((b) => [b.id, crewMark(b), Math.ceil(b.hp / 10)]), [...this.sel], this.crew, s.orders, s.following]);
    if (sig === this.sig) return;
    this.sig = sig;
    const list = this.el.querySelector('.mc-crews__list')!;
    list.innerHTML = '';
    for (let c = 0; c < CREWS; c++) {
      const box = document.createElement('div');
      box.className = `mc-crew${this.crew === c ? ' is-active' : ''}`;
      box.style.setProperty('--crew', CREW_COLORS[c]);
      const order = s.orders[c];
      const where = c === 0 || s.following[c] ? 'walks with you' : order ? (s.onLift(order, 0.5) ? 'to the lift' : 'on its way / holding') : 'awaiting orders';
      const ids = s.crew.filter((x) => x.crew === c).map((b) => b.id);
      if (!ids.length) box.classList.add('mc-crew--empty');
      const all = ids.length > 0 && ids.every((id) => this.sel.has(id));
      box.innerHTML = `<div class="mc-crew__head"><b>Crew ${c}</b><span>${where}</span>${ids.length ? `<button class="mc-crew__all${all ? ' is-on' : ''}" title="${all ? 'Unpick' : 'Pick'} every robot in crew ${c}">${all ? 'None' : 'All'}</button>` : ''}</div><div class="mc-crew__bots"></div>`;
      // Pick (or unpick) the whole crew at once, to move it into another crew in one click.
      box.querySelector('.mc-crew__all')?.addEventListener('click', (e) => {
        e.stopPropagation();
        for (const id of ids) all ? this.sel.delete(id) : this.sel.add(id);
        this.calls.sound('click');
        this.sig = '';
        this.refresh();
      });
      const bots = box.querySelector('.mc-crew__bots')!;
      for (const b of s.crew.filter((x) => x.crew === c)) {
        const chip = document.createElement('div');
        chip.className = `mc-bot${this.sel.has(b.id) ? ' is-selected' : ''}`;
        chip.draggable = true;
        chip.title = ROLES[b.role].blurb;
        // A dot after its name while it is on its own order (P3).
        chip.innerHTML = `<span class="mc-bot__role">${ROLE_GLYPH[b.role]}</span><span>${b.name}${b.own ? ' •' : ''}</span><i style="width:${(b.hp / b.maxHp) * 100}%"></i>`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          // Ctrl/Cmd-click picks (or unpicks) its whole crew, like the crew's All.
          if (e.ctrlKey || e.metaKey) for (const id of ids) all ? this.sel.delete(id) : this.sel.add(id);
          else if (this.sel.has(b.id)) this.sel.delete(b.id);
          else this.sel.add(b.id);
          this.calls.sound('click');
          this.sig = '';
          this.refresh();
        });
        chip.addEventListener('dragstart', (e) => {
          const ids = this.sel.has(b.id) ? [...this.sel] : [b.id];
          e.dataTransfer!.setData('text/plain', ids.join(','));
        });
        bots.appendChild(chip);
      }
      if (!bots.children.length) bots.innerHTML = `<span class="mc-crew__empty">${c === 0 ? 'Nobody with you.' : 'Empty'}</span>`;
      box.addEventListener('click', () => {
        if (this.sel.size) this.move([...this.sel], c);
        this.crew = c;
        this.sig = '';
        this.refresh();
      });
      box.addEventListener('dragover', (e) => e.preventDefault());
      box.addEventListener('drop', (e) => {
        e.preventDefault();
        const ids = (e.dataTransfer!.getData('text/plain') || '').split(',').map(Number).filter(Boolean);
        this.move(ids, c);
        this.crew = c;
        this.refresh();
      });
      list.appendChild(box);
    }
  }

  /**
   * What is out there but not seen: a rough, hand-drawn ring (never centred on the real spot) with the kind's icon and name.
   * Once the real spot is seen the ring goes and the place stays as its icon where it is (a ruin cluster shows as its ruins).
   */
  private drawSignals(c: CanvasRenderingContext2D, label: (x: number, y: number, text: string, col: string, a?: number) => void) {
    const s = this.sim;
    const tw = MW / s.map.w, th = MH / s.map.h;
    for (const g of s.signals) {
      if (s.fog.found(g)) {
        if (g.kind !== 'ruins') {
          const x = (g.at.x + 0.5) * tw, y = (g.at.y + 0.5) * th;
          icon(c, g.kind, x, y);
          label(x, y + 22, SIGNAL_NAME[g.kind], BRASS_TEXT);
        }
        continue;
      }
      const x = (g.x + 0.5) * tw, y = (g.y + 0.5) * th;
      // A ring that wobbles a little, the same each time (its shape comes from the signal's id).
      const ph = [...g.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 997, 7) / 997 * Math.PI * 2;
      // The Mirage's false ring (P54) looks like the rest, but shimmers, and fades once the Communicator is near.
      const now = performance.now(), shimmer = g.fake ? 0.1 * Math.sin(now / 170 + ph) : 0;
      c.save();
      if (g.fake) c.globalAlpha = Math.max(0, 1 - (g.fade ?? 0)) * (0.65 + 0.35 * Math.sin(now / 260 + ph * 2));
      c.beginPath();
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const r = g.r * tw * (1 + 0.05 * Math.sin(a * 3 + ph) + 0.03 * Math.sin(a * 5 + ph * 2) + shimmer * Math.sin(a * 7 + now / 140));
        c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      c.fillStyle = 'rgba(217,162,74,0.05)';
      c.fill();
      c.setLineDash([8, 6]);
      c.strokeStyle = 'rgba(217,162,74,0.5)';
      c.lineWidth = 1.5;
      c.stroke();
      c.setLineDash([]);
      icon(c, g.kind, x, y);
      label(x, y + 22, SIGNAL_NAME[g.kind], BRASS_TEXT);
      c.restore();
    }
  }

  private drawMap() {
    const s = this.sim;
    const c = this.cv.getContext('2d')!;
    const k = this.k;
    c.drawImage(this.base, 0, 0);
    // The fog over the survey (smooth, so its edge is soft), then the grid over both.
    this.paintMask();
    c.drawImage(this.fog, 0, 0);
    c.drawImage(this.grid, 0, 0);
    // Star oil (P38): the land from above as a constellation: dimmed, so what was seen stands out as light.
    if (s.oilT > 0) {
      c.fillStyle = 'rgba(6, 10, 38, 0.62)';
      c.fillRect(0, 0, MW, MH);
    }
    // `a` is the weight: a label that is not the point of the map is said quieter (and a mark's numbers wait for the pointer).
    const label = (x: number, y: number, text: string, col: string, a = 1, big = false) => {
      c.save();
      c.globalAlpha = a;
      c.font = `${big ? 700 : 600} ${big ? 14 : 12}px "Barlow Semi Condensed", sans-serif`;
      c.textAlign = 'center';
      c.fillStyle = 'rgba(0,0,0,0.7)';
      c.fillText(text, x + 1, y + 1);
      c.fillStyle = col;
      c.fillText(text, x, y);
      c.restore();
    };
    // Ruins, seeps, hives, the lift.
    // A live ruin shows its signal (a ring and "signal": insight, decoded loudly); a dead one is a plain ruin (junk, searched quietly).
    this.drawSignals(c, label);
    s.map.ruins.forEach((r, i) => {
      const x = (r.x + 0.5) * T * k, y = (r.y + 0.5) * T * k;
      const sr = s.ruins[i];
      // Her Receipts named this ruin (P58 H): a ring pulses round it while the ping lasts, seen or not (that is what she tells him).
      if (sr && s.ruinPing?.id === sr.id && s.time < s.ruinPing.until) {
        const p = (performance.now() % 1000) / 1000;
        c.strokeStyle = `rgba(255,217,138,${(1 - p).toFixed(2)})`;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(x, y, 8 + p * 22, 0, Math.PI * 2);
        c.stroke();
      }
      if (!this.seenAt((r.x + 0.5) * T, (r.y + 0.5) * T)) return;
      if (sr?.live && !sr.searched) {
        c.strokeStyle = css(FRIEND);
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x, y, 9, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = css(FRIEND);
        c.fillRect(x - 4, y - 4, 8, 8);
        label(x, y - 13, 'signal', FRIEND_TEXT);
        return;
      }
      const dock = r.kind === 'dock'; // an old charging dock (P58 H): green, its own word
      c.fillStyle = sr?.searched ? '#4a3a2c' : dock ? '#3f8a52' : '#8a4a26';
      c.fillRect(x - 4, y - 4, 8, 8);
      label(x, y - 8, dock ? 'dock' : 'ruin', sr?.searched ? '#7a6a5a' : dock ? '#8fe0a0' : '#c08a60', this.near(x, y) ? 1 : 0.6);
    });
    for (const p of s.seams) {
      if (!this.seenAt(p.x, p.y)) continue;
      const x = p.x * k, y = p.y * k;
      const f = p.amount / p.max;
      c.fillStyle = f > 0 ? '#1d1a17' : '#3a3530';
      c.strokeStyle = f > 0 ? '#9a928a' : '#6a625a';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x - 9, y + 5); c.lineTo(x - 4, y - 5); c.lineTo(x + 3, y - 7); c.lineTo(x + 9, y + 5); c.closePath();
      c.fill();
      c.stroke();
      const nr = this.near(x, y);
      label(x, y - 10, f > 0 ? (nr ? `coal ${Math.ceil(p.amount)}` : 'coal') : 'bare', f > 0 ? '#cfc7bc' : '#8a8078', nr ? 1 : 0.6);
    }
    for (const p of s.seeps) {
      if (!this.seenAt(p.x, p.y)) continue;
      const x = p.x * k, y = p.y * k;
      const f = p.amount / p.max;
      c.fillStyle = f > 0 ? '#000' : '#3a3530';
      c.strokeStyle = f > 0 ? '#9fe0ff' : '#6a625a';
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(x, y, 8, 5, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      if (f > 0) {
        c.fillStyle = '#9fe0ff';
        c.fillRect(x - 10, y + 8, 20 * f, 3);
      }
      const nr = this.near(x, y);
      label(x, y - 9, f > 0 ? (nr ? `tap ${Math.ceil(p.amount)}` : 'tap') : 'dry', f > 0 ? '#bfe8ff' : '#8a8078', nr ? 1 : 0.6);
    }
    for (const n of s.nests) {
      if (n.dead || (!n.awake && !this.seen.has(n.id))) continue;
      const x = n.x * k, y = n.y * k;
      // The threat leads: an awake hive is larger, ringed and named at full weight; a sleeping one is small and quiet until the pointer is near.
      const r = n.awake ? 11 : 6.5;
      if (n.awake) {
        c.strokeStyle = css(DANGER);
        c.globalAlpha = 0.45;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x, y, r + 6, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
      }
      c.fillStyle = n.awake ? css(DANGER) : '#6a2a30';
      c.beginPath();
      for (let i = 0; i < 6; i++) c.lineTo(x + Math.cos((i * Math.PI) / 3) * r, y + Math.sin((i * Math.PI) / 3) * r);
      c.fill();
      if (n.awake) label(x, y - r - 9, `${s.biome.talk.hive.toUpperCase()} (awake)`, DANGER_TEXT, 1, true);
      else label(x, y - r - 5, this.near(x, y) ? `${s.biome.talk.hive} (asleep)` : s.biome.talk.hive, '#c08088', this.near(x, y) ? 1 : 0.55);
    }
    const lx = s.lift.x * k, ly = s.lift.y * k;
    // The way home: a soft brass halo.
    c.fillStyle = 'rgba(255,204,51,0.14)';
    c.beginPath();
    c.arc(lx, ly, 20, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#c8963c';
    c.strokeStyle = '#ffcc33';
    c.lineWidth = 2;
    c.fillRect(lx - 9, ly - 9, 18, 18);
    c.strokeRect(lx - 9, ly - 9, 18, 18);
    label(lx, ly - 17, 'LIFT', '#ffd98a', 1, true);
    // Orders: a flag per crew, a faint line from each member.
    for (let cr = 1; cr < CREWS; cr++) {
      const o = s.orders[cr];
      if (!o) continue;
      c.strokeStyle = CREW_COLORS[cr];
      c.globalAlpha = 0.35;
      c.lineWidth = 1;
      for (const b of s.crew.filter((x) => x.crew === cr && !x.own)) {
        c.beginPath();
        c.moveTo(b.x * k, b.y * k);
        c.lineTo(o.x * k, o.y * k);
        c.stroke();
      }
      c.globalAlpha = 1;
      c.fillStyle = CREW_COLORS[cr];
      c.fillRect(o.x * k, o.y * k - 16, 2, 16);
      c.beginPath();
      c.moveTo(o.x * k + 2, o.y * k - 16);
      c.lineTo(o.x * k + 13, o.y * k - 12);
      c.lineTo(o.x * k + 2, o.y * k - 8);
      c.fill();
      c.font = '700 10px sans-serif';
      c.fillStyle = '#111';
      c.fillText(String(cr), o.x * k + 6, o.y * k - 9);
    }
    // Robots on their own orders (P3): a small flag in their crew's colour with its mark, a faint line from each.
    for (const p of ownPoints(s)) {
      const col = CREW_COLORS[p.bots[0].crew];
      const ox = p.at.x * k, oy = p.at.y * k;
      c.strokeStyle = col;
      c.globalAlpha = 0.35;
      c.lineWidth = 1;
      for (const b of p.bots) {
        c.beginPath();
        c.moveTo(b.x * k, b.y * k);
        c.lineTo(ox, oy);
        c.stroke();
      }
      c.globalAlpha = 1;
      c.fillStyle = col;
      c.fillRect(ox, oy - 12, 2, 12);
      c.beginPath();
      c.moveTo(ox + 2, oy - 12);
      c.lineTo(ox + 10, oy - 9);
      c.lineTo(ox + 2, oy - 6);
      c.fill();
      label(ox + 12, oy - 14, crewMark(p.bots[0]), col);
    }
    // Enemies show only where one of ours sees them now, not across the whole fog.
    const eyes = s.bots.filter((b) => !b.dead).map((b) => ({ x: b.x, y: b.y, r: sightOf(s, b) * T }));
    for (const h of s.hornets) {
      if (!eyes.some((e) => Math.hypot(h.x - e.x, h.y - e.y) <= e.r)) continue;
      // Every enemy is a red dot (the twisted a magenta-red one, the boss a big disc); cyan (FRIEND) is ours.
      c.fillStyle = css(h.twisted && !h.boss ? DANGER_TWISTED : DANGER);
      const z = h.boss ? 6 : 2.2;
      c.fillRect(h.x * k - z, h.y * k - z, z * 2, z * 2);
    }
    for (const b of s.bots) {
      if (b.dead) continue;
      const x = b.x * k, y = b.y * k;
      if (b.role === 'controller') {
        c.fillStyle = '#fff3c4';
        c.strokeStyle = '#000';
        c.beginPath();
        c.moveTo(x, y - 8);
        c.lineTo(x + 6, y + 5);
        c.lineTo(x - 6, y + 5);
        c.closePath();
        c.fill();
        c.stroke();
        label(x, y + 18, 'you', '#fff3c4');
      } else {
        c.fillStyle = CREW_COLORS[b.crew];
        c.strokeStyle = this.sel.has(b.id) ? '#fff' : '#000';
        c.lineWidth = this.sel.has(b.id) ? 2 : 1;
        c.beginPath();
        c.arc(x, y, 4.5, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        // On its own order: a dark centre.
        if (b.own) {
          c.fillStyle = '#1d1a17';
          c.beginPath();
          c.arc(x, y, 1.6, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    // The drag box.
    const d = this.drag;
    if (d && Math.hypot(d.x - d.x0, d.y - d.y0) > CLICK) {
      c.fillStyle = 'rgba(86,180,233,0.12)';
      c.strokeStyle = css(FRIEND);
      c.lineWidth = 1.5;
      c.fillRect(d.x0, d.y0, d.x - d.x0, d.y - d.y0);
      c.strokeRect(d.x0, d.y0, d.x - d.x0, d.y - d.y0);
    }
  }
}

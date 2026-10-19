/**
 * Command mode: commanding the crews from the main view. A toggle (C): time runs at `mapPace`, the camera pulls out to the
 * widest zoom, the mouse selects (click, drag a box) and orders (right click), and the screen makes sure nobody forgets:
 * a cold vignette and frame, a "COMMAND" plate with a blinking dial, the command cursor, a winding-down sound on entry, a
 * winding-up one on exit and a soft clock tick while it lasts. Groups work in both modes (and with the map open): 1-9
 * select a crew, Shift + number puts the selection in it. A right click orders the robots picked (a part of a crew goes on
 * its own, P3). The map (`mapview.ts`) has the same mouse controls on its survey. The wheel zooms (bounded) outside
 * command mode. The rules are in sim/command.ts; this file reads input and draws.
 */
import Phaser from 'phaser';
import { keyLabel, promptHtml, type GameInput } from '../../../harness/kit';
import type { Audio } from '../../../harness/kit';
import { CREWS } from './sim/defs';
import { Selection, ZOOM, assignGroup, boxBots, orderOf, orderSelection, pickBot, prune, selectGroup, targetAt, wheelZoom } from './sim/command';
import type { Sim } from './sim/sim';
import { CREW_COLORS, crewMark } from './hud';
import { cursorCss, type CursorKind } from './cursors';
import type { MapView } from './mapview';
import { LINE } from './house';

export interface CommandApi {
  scene: Phaser.Scene;
  sim: Sim;
  map: MapView;
  pick: Selection;
  ui: HTMLElement;
  audio: Audio;
  input: GameInput;
  /** A line that rises where something happened (world position). */
  wash(color: string): void;
}

/** A click is a drag shorter than this (screen px). */
const CLICK = 6;
/** How near a click picks a robot, and the slack on what a right click lands on (screen px, so they stay easy at wide zoom). */
const PICK_PX = 26;
const TARGET_PX = 18;
/** Seconds between ticks of the soft clock while in command mode. */
const TICK = 0.6;
const PING = 0.8;

/** The sounds (synthesised, like the rest in sound.ts): the clock winding down on entry and up on exit, a tick, an order. */
let installed: Audio | null = null;
function installSounds(a: Audio) {
  if (installed === a || !a.ctx) return;
  installed = a;
  const SR = 44100;
  const make = (sec: number, fn: (t: number) => number) => {
    const out = new Float32Array(Math.floor(sec * SR));
    for (let i = 0; i < out.length; i++) out[i] = fn(i / SR);
    return out;
  };
  const env = (t: number, att: number, dec: number) => (t < att ? t / att : Math.exp(-(t - att) / dec));
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  // Entry: a pitch sliding down through a slow tremolo, a soft clunk under it: the world's gears slowing.
  let ph = 0;
  a.addBuffer('cmdOn', make(0.75, (t) => {
    ph += (2 * Math.PI * (560 * Math.exp(-t * 3.2) + 90)) / SR;
    return (Math.sin(ph) * 0.5 + Math.sin(ph * 2.01) * 0.12) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 9 * t)) * Math.min(1, t / 0.02) * Math.min(1, (0.75 - t) / 0.3) * 0.7 + Math.sin(2 * Math.PI * 62 * t) * env(t, 0.003, 0.09) * 0.6;
  }));
  // Exit: the same, winding back up, then a light catch.
  ph = 0;
  a.addBuffer('cmdOff', make(0.5, (t) => {
    ph += (2 * Math.PI * (90 + 520 * (1 - Math.exp(-t * 6)))) / SR;
    return (Math.sin(ph) * 0.5 + Math.sin(ph * 2.01) * 0.1) * Math.min(1, t / 0.02) * Math.min(1, (0.5 - t) / 0.18) * 0.6 + noise() * env(Math.max(0, t - 0.4), 0.001, 0.015) * 0.3 * (t > 0.4 ? 1 : 0);
  }));
  // The clock: a dull wooden tick and a lower tock, alternating.
  a.addBuffer('cmdTick', make(0.08, (t) => (Math.sin(2 * Math.PI * 1500 * t) * 0.5 + noise() * 0.4) * env(t, 0.0008, 0.01)));
  a.addBuffer('cmdTock', make(0.08, (t) => (Math.sin(2 * Math.PI * 950 * t) * 0.5 + noise() * 0.3) * env(t, 0.0008, 0.012)));
  // An order: two short brass notes, up.
  a.addBuffer('cmdOrder', make(0.28, (t) => {
    const f = t < 0.1 ? 392 : 523;
    const u = t < 0.1 ? t : t - 0.1;
    return (Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * f * 2 * t) * 0.2) * env(u, 0.006, 0.07) * 0.5;
  }));
  const s = a.sfx;
  s.group('cmdOn', ['cmdOn'], { max: 1, priority: 6, reverb: 0.3, gain: 0.8 });
  s.group('cmdOff', ['cmdOff'], { max: 1, priority: 6, reverb: 0.2, gain: 0.7 });
  s.group('cmdTick', ['cmdTick', 'cmdTock'], { max: 2, priority: 1, gain: 0.3 });
  s.group('cmdOrder', ['cmdOrder'], { max: 2, priority: 3, vary: 0.04, gain: 0.7 });
}

/** The line when robots go on their own (P3): who, and how to give them back. */
export function ownLine(sim: Sim, ids: number[]) {
  const one = ids.length === 1;
  const who = one ? sim.bot(ids[0])!.name : `${ids.length} robots`;
  const crew = sim.bot(ids[0])!.crew;
  return `${who} on ${one ? 'its' : 'their'} own order (${keyLabel('groupSet')}+${crew} gives ${one ? 'it' : 'them'} back)`;
}

interface Ping {
  x: number;
  y: number;
  born: number;
  color: number;
}

export class CommandMode {
  /** In command mode now. */
  on = false;
  /** The player has used it at least once (the hint stops). */
  used = false;
  /** The camera's zoom now, and the one the player chose with the wheel (command mode overrides it, then gives it back). */
  zoom: number = ZOOM.start;
  want: number = ZOOM.start;

  private el: HTMLElement;
  private boxEl: HTMLElement;
  private selEl: HTMLElement;
  private toastEl: HTMLElement;
  private toastT = 0;
  /** Number keys pressed with Shift held, read off the key event itself (the `groupSet` action covers the rest). */
  private modDigits = new Set<number>();
  private dial: HTMLElement;
  private g: Phaser.GameObjects.Graphics;
  private drag: { sx: number; sy: number } | null = null;
  private pings: Ping[] = [];
  private tickT = 0;
  private tickN = 0;
  private cursor: CursorKind | '' = '';
  private selSig = '';

  constructor(private api: CommandApi) {
    const { scene, ui } = api;
    installSounds(api.audio);
    this.el = document.createElement('div');
    this.el.className = 'mc-cmd';
    this.el.innerHTML = `<div class="mc-cmd__vig"></div>
      <div class="mc-cmd__plate"><i class="mc-cmd__dial"></i><b>COMMAND</b><span>time slowed</span><em data-k="exit"></em></div>
      <div class="mc-cmd__help" data-k="help"></div>`;
    this.boxEl = document.createElement('div');
    this.boxEl.className = 'mc-cmd__box';
    this.selEl = document.createElement('div');
    this.selEl.className = 'mc-cmd__sel';
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'mc-cmd__toast';
    ui.append(this.el, this.boxEl, this.selEl, this.toastEl);
    this.dial = this.el.querySelector('.mc-cmd__dial') as HTMLElement;
    this.g = scene.add.graphics().setDepth(-3);
    scene.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (this.on || api.map.open || api.sim.phase !== 'mission') return;
      this.want = wheelZoom(this.want, dy);
    });
    // Shift + number: the browser would type a symbol; the game keeps the key.
    const swallow = (e: KeyboardEvent) => {
      if (!e.shiftKey || !/^Digit\d$/.test(e.code) || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      this.modDigits.add(Number(e.code.slice(5)));
    };
    window.addEventListener('keydown', swallow);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', swallow);
      scene.input.setDefaultCursor('');
      scene.input.off('wheel');
    });
  }

  /** Turn command mode on or off (a toggle; off when the mission ends). */
  toggle(on = !this.on) {
    const { sim, audio } = this.api;
    if (on === this.on) return;
    // Down a dungeon the party just walks with him: no crew commands (D16).
    if (on && (sim.phase !== 'mission' || sim.dungeon)) return;
    this.on = on;
    this.used ||= on;
    this.drag = null;
    this.boxEl.classList.remove('is-on');
    this.tickT = TICK * 0.5;
    this.el.classList.toggle('is-on', on);
    (this.el.querySelector('[data-k=exit]') as HTMLElement).innerHTML = on ? promptHtml('{command} or Esc to resume') : '';
    this.help();
    audio.sfx.play(on ? 'cmdOn' : 'cmdOff');
    this.api.wash(on ? '#56B4E9' : '#ffb640');
  }

  /** The crews a number key can name, for the help line and messages. */
  private crewRange() {
    return CREWS > 2 ? `1-${CREWS - 1}` : '1';
  }

  private help() {
    const c = keyLabel('groupSet');
    (this.el.querySelector('[data-k=help]') as HTMLElement).innerHTML =
      `<span>Drag to select</span><span>Right click to order</span><span>${this.crewRange()} select a crew</span><span>${c}+${this.crewRange()} assign</span>`;
  }

  /** Per frame, before the sim steps: keys, the mouse in command mode, the camera's zoom, the cursor. */
  update(dt: number) {
    const { scene, sim, map, pick, input } = this.api;
    prune(sim, pick);
    if (this.on && sim.phase !== 'mission') this.toggle(false);
    if (!map.open && sim.phase === 'mission' && input.pressed('command')) this.toggle();
    // Groups, in both modes (and with the map open): n selects crew n, Shift+n puts the selection in it.
    for (let n = 0; n <= 9; n++) if (input.pressed(`group${n}`) && sim.phase === 'mission' && !sim.dungeon) this.group(n, input.down('groupSet') || this.modDigits.has(n));
    this.modDigits.clear();
    if (this.on && !map.open) this.mouse();
    // The camera: command mode pulls out to the widest zoom; leaving returns to the player's own.
    const goal = this.on ? ZOOM.min : this.want;
    this.zoom += (goal - this.zoom) * (1 - Math.exp(-dt * (this.on ? 7 : 9)));
    if (Math.abs(goal - this.zoom) < 0.002) this.zoom = goal;
    scene.cameras.main.setZoom(this.zoom);
    // The soft clock.
    if (this.on) {
      this.tickT -= dt;
      if (this.tickT <= 0) {
        this.tickT += TICK;
        this.api.audio.sfx.play('cmdTick');
        this.dial.classList.toggle('is-tock', ++this.tickN % 2 === 0);
      }
    }
    this.setCursor();
  }

  /** A short line over the picked chip: at any zoom, readable. */
  private toast(text: string, color = '#f4e2bc') {
    this.toastEl.textContent = text;
    this.toastEl.style.color = color;
    this.toastEl.classList.add('is-on');
    clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => this.toastEl.classList.remove('is-on'), 1800);
  }

  /** Number key n: select crew n, or with the modifier put the selection into it. */
  private group(n: number, assign: boolean) {
    const { sim, pick } = this.api;
    const say = (text: string, color = '#f4e2bc') => this.toast(text, color);
    const name = n === 0 ? 'Crew 0 (with you)' : `Crew ${n}`;
    if (n >= CREWS) return say(`No ${name.toLowerCase()}: crews are 0-${CREWS - 1}`, '#ffd98a');
    if (assign) {
      if (!pick.ids.size) return say('Select robots first', '#ffd98a');
      const moved = assignGroup(sim, pick, n);
      this.api.audio.sfx.play('cmdOrder', { gain: 0.6 });
      return say(`${moved} robot${moved === 1 ? '' : 's'} to ${name.toLowerCase()}`, CREW_COLORS[n]);
    }
    if (!selectGroup(sim, pick, n)) return say(`${name} is empty`, '#ffd98a');
    this.api.audio.sfx.play('click', { gain: 0.8 });
    say(`${name} selected (${pick.ids.size})`, CREW_COLORS[n]);
  }

  private world(x: number, y: number) {
    return this.api.scene.cameras.main.getWorldPoint(x, y);
  }

  private mouse() {
    const { scene, sim, map, pick, input } = this.api;
    const p = scene.input.activePointer;
    const k = this.zoom;
    if (input.pressed('fire')) this.drag = { sx: p.x, sy: p.y };
    if (this.drag) {
      const d = this.drag;
      const moved = Math.hypot(p.x - d.sx, p.y - d.sy) > CLICK;
      this.box(moved ? d : null, p.x, p.y);
      if (input.released('fire') || !input.down('fire')) {
        this.drag = null;
        this.box(null, 0, 0);
        const a = this.world(d.sx, d.sy);
        if (moved) {
          const b = this.world(p.x, p.y);
          const ids = boxBots(sim, a.x, a.y, b.x, b.y);
          if (ids.length) {
            pick.ids = new Set(ids);
            const c = sim.bot(ids[0])!.crew;
            if (c > 0 && ids.every((id) => sim.bot(id)!.crew === c)) pick.crew = c;
            this.api.audio.sfx.play('click', { gain: 0.8 });
          } else pick.ids = new Set();
        } else {
          const hit = pickBot(sim, a.x, a.y, PICK_PX / k);
          pick.ids = new Set(hit ? [hit.id] : []);
          if (hit) {
            if (hit.crew > 0) pick.crew = hit.crew;
            this.api.audio.sfx.play('click', { gain: 0.8 });
          }
        }
      }
    }
    if (input.pressed('fire2')) {
      const w = this.world(p.x, p.y);
      if (!pick.ids.size) {
        this.api.audio.sfx.play('click', { gain: 0.6 });
        return this.toast('Select robots first (click or drag)', '#ffd98a');
      }
      const t = targetAt(sim, w.x, w.y, map.seen, TARGET_PX / k);
      const r = orderSelection(sim, pick, t.x, t.y, t.kind === 'comm');
      const crew = r.sent.length ? r.sent[r.sent.length - 1] : r.alone.length ? sim.bot(r.alone[0])!.crew : -1;
      if (crew >= 0) {
        this.api.audio.sfx.play('cmdOrder');
        const col = Number.parseInt(CREW_COLORS[crew].slice(1), 16);
        this.pings.push({ x: t.x, y: t.y, born: performance.now(), color: col });
      }
      if (r.why) this.toast(r.why, '#ffd98a');
      else if (r.alone.length && !r.sent.length) this.toast(ownLine(sim, r.alone), CREW_COLORS[crew]);
    }
  }

  /** The drag rectangle, in screen pixels over the canvas (null hides it). */
  private box(from: { sx: number; sy: number } | null, x: number, y: number) {
    this.boxEl.classList.toggle('is-on', !!from);
    if (!from) return;
    const ds = this.api.scene.scale.displayScale;
    const [l, t] = [Math.min(from.sx, x) / ds.x, Math.min(from.sy, y) / ds.y];
    Object.assign(this.boxEl.style, { left: `${l}px`, top: `${t}px`, width: `${Math.abs(x - from.sx) / ds.x}px`, height: `${Math.abs(y - from.sy) / ds.y}px` });
  }

  /** The cursor for what the mouse is over: the sight, the command frame, or the gear when something can be used or ordered. */
  private setCursor() {
    const { scene, sim, map, pick } = this.api;
    // Only a running mission has its own cursors: once the lift rises (and in the hub after it) the pointer is the system's.
    if (sim.phase !== 'mission') {
      if (this.cursor !== '') scene.input.setDefaultCursor((this.cursor = ''));
      return;
    }
    if (map.open) return;
    const p = scene.input.activePointer;
    const w = this.world(p.x, p.y);
    let kind: CursorKind;
    if (this.on) {
      const over = !!pickBot(sim, w.x, w.y, PICK_PX / this.zoom) || (pick.ids.size > 0 && targetAt(sim, w.x, w.y, map.seen, TARGET_PX / this.zoom).kind !== 'ground');
      kind = over ? 'use' : 'command';
    } else {
      const t = targetAt(sim, w.x, w.y, map.seen, 6);
      const usable = t.kind === 'ruin' || t.kind === 'lift' || sim.loot.some((l) => Math.hypot(l.x - w.x, l.y - w.y) < 22);
      kind = usable ? 'use' : 'aim';
    }
    if (kind === this.cursor) return;
    this.cursor = kind;
    scene.input.setDefaultCursor(cursorCss(kind));
  }

  /** Rings under the picked robots, their orders (in command mode) and the pings of fresh orders; the picked robots' names. */
  draw() {
    const { sim, pick } = this.api;
    const g = this.g;
    g.clear();
    const t = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin(t / 220);
    for (const id of pick.ids) {
      const b = sim.bot(id);
      if (!b) continue;
      const col = Number.parseInt(CREW_COLORS[Math.max(0, b.crew)].slice(1), 16);
      g.fillStyle(col, 0.16 + 0.08 * pulse).fillEllipse(b.x, b.y + 2, 46, 22);
      g.lineStyle(LINE.accent, col, 0.95).strokeEllipse(b.x, b.y + 2, 46, 22);
      g.lineStyle(LINE.effect, 0xffffff, 0.5 + 0.3 * pulse).strokeEllipse(b.x, b.y + 2, 52 + 3 * pulse, 26 + 1.5 * pulse);
      const o = this.on ? orderOf(sim, b) : null;
      if (o) {
        g.lineStyle(LINE.effect, col, 0.4).lineBetween(b.x, b.y, o.x, o.y);
        g.fillStyle(col, 0.5).fillCircle(o.x, o.y, 4);
      }
    }
    this.pings = this.pings.filter((p) => t - p.born < PING * 1000);
    for (const p of this.pings) {
      const u = (t - p.born) / (PING * 1000);
      g.lineStyle(LINE.accent, p.color, 1 - u).strokeEllipse(p.x, p.y, 20 + 80 * u, (20 + 80 * u) * 0.6);
      g.lineStyle(LINE.effect, 0xfff0c0, 0.9 * (1 - u)).strokeEllipse(p.x, p.y, 10 + 40 * u, (10 + 40 * u) * 0.6);
      g.fillStyle(p.color, 0.85 * (1 - u)).fillCircle(p.x, p.y, 4);
    }
    // Who is picked, bottom of the screen.
    const names = [...pick.ids].map((id) => sim.bot(id)).filter(Boolean).map((b) => `<i style="--crew:${CREW_COLORS[Math.max(0, b!.crew)]}">${crewMark(b!)}</i>${b!.name}`);
    const sig = names.join('|');
    if (sig !== this.selSig) {
      this.selSig = sig;
      this.selEl.innerHTML = names.length ? `<b>Picked</b>${names.join('')}` : '';
      this.selEl.classList.toggle('is-on', names.length > 0);
    }
  }
}

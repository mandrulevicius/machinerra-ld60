import Phaser from 'phaser';
import './editor.css';
import { place, type Entity, type Level, type PropDef } from './level';

/** Dev-only level editor (loaded by loadLevel when import.meta.env.DEV). See README.md. */

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type Drag =
  | { k: 'move'; p0: Pt; o: Map<string, Pt>; primary: string; moved: boolean }
  | { k: 'rot'; id: string }
  | { k: 'scale'; id: string; s0: number; d0: number }
  | { k: 'box'; a: Pt; b: Pt };

// Survive scene restarts.
const flags = { editing: false, snap: true, grid: 16, running: false };
const edit = new URLSearchParams(location.search).get('edit');
if (edit !== null && edit !== '0') flags.editing = true;

let S: Editor | null = null;
/** Copied entities; module-level so a copy survives switching levels. */
let clipboard: Entity[] = [];
let keysInstalled = false;

export function attach(level: Level) {
  if (level.scene.sys.settings.status >= Phaser.Scenes.SHUTDOWN || !level.scene.game.domContainer) return;
  S?.destroy();
  S = new Editor(level);
  if (!keysInstalled) {
    keysInstalled = true;
    addEventListener('keydown', (e) => S?.key(e), true);
    console.info('Level editor: F2 toggles editing.');
  }
}

const round = (v: number, n = 100) => Math.round(v * n) / n;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const GIZMO_SIZE = 28;
const ICON_COLOR = 0xe6e6e6;
const SEL = 0xffd34d;

class Editor {
  private root = document.createElement('div');
  private cap!: HTMLElement;
  private gfx?: Phaser.GameObjects.Graphics;
  private selected = new Set<string>();
  private hist: string[];
  private hi = 0;
  private saved: string;
  private armed: string | null = null;
  private drag: Drag | null = null;
  private mouse: Pt = { x: 0, y: 0 };
  private statusText = '';
  private statusErr = false;
  private pausedByUs = false;

  constructor(private level: Level) {
    this.hist = [this.json()];
    this.saved = this.hist[0];
    this.mount();
    level.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    this.install();
    if (flags.editing) this.open();
  }

  private get scene() {
    return this.level.scene;
  }
  private get cam() {
    return this.scene.cameras.main;
  }
  private ent(id: string) {
    return this.level.entities.find((e) => e.id === id);
  }
  private single() {
    return this.selected.size === 1 ? this.ent([...this.selected][0]) : undefined;
  }

  // ---- data ----

  private serialize() {
    const entities = this.level.entities.map((e) => {
      const o: Entity = { id: e.id, type: e.type, x: round(e.x), y: round(e.y) };
      if (e.rotation) o.rotation = round(e.rotation);
      if (e.scale !== undefined && e.scale !== 1) o.scale = round(e.scale);
      if (e.props && Object.keys(e.props).length) o.props = { ...e.props };
      return o;
    });
    return { ...this.level.data, entities };
  }
  private json() {
    return JSON.stringify(this.serialize());
  }
  private tidy(e: Entity) {
    if (!e.rotation) delete e.rotation;
    if (e.scale === 1) delete e.scale;
  }

  commit() {
    const j = this.json();
    if (j !== this.hist[this.hi]) {
      this.hist.length = this.hi + 1;
      this.hist.push(j);
      if (this.hist.length > 200) this.hist.shift();
      this.hi = this.hist.length - 1;
    }
    this.render();
  }
  undo() {
    if (this.hi > 0) this.restore(this.hi - 1);
  }
  redo() {
    if (this.hi < this.hist.length - 1) this.restore(this.hi + 1);
  }
  private restore(i: number) {
    this.hi = i;
    const next: Entity[] = JSON.parse(this.hist[i]).entities;
    const cur = new Map(this.level.entities.map((e) => [e.id, e]));
    const ids = new Set(next.map((e) => e.id));
    for (const id of cur.keys()) if (!ids.has(id)) this.level.remove(id);
    this.level.entities = next;
    for (const e of next) {
      const old = cur.get(e.id);
      const obj = this.level.get(e.id);
      if (!old || !obj) this.level.spawn(e);
      else if (old.type !== e.type || JSON.stringify(old.props) !== JSON.stringify(e.props)) this.level.rebuild(e);
      else place(obj, e);
    }
    this.selected = new Set([...this.selected].filter((id) => ids.has(id)));
    this.render();
  }

  // ---- operations (used by the UI, keys and __game.editor) ----

  uid(type: string) {
    let n = 1;
    while (this.ent(`${type}-${n}`)) n++;
    return `${type}-${n}`;
  }
  snapPt(p: Pt): Pt {
    return flags.snap ? { x: Math.round(p.x / flags.grid) * flags.grid, y: Math.round(p.y / flags.grid) * flags.grid } : { x: round(p.x), y: round(p.y) };
  }
  add(type: string, x: number, y: number, props?: Entity['props']) {
    if (!this.level.types[type]) throw new Error(`unknown entity type "${type}"`);
    const e: Entity = { id: this.uid(type), type, x, y };
    if (props) e.props = { ...props };
    this.level.entities.push(e);
    this.level.spawn(e);
    this.selected = new Set([e.id]);
    this.commit();
    return e.id;
  }
  remove(ids: string[]) {
    if (!ids.length) return;
    this.level.entities = this.level.entities.filter((e) => !ids.includes(e.id));
    ids.forEach((id) => this.level.remove(id));
    this.selected = new Set([...this.selected].filter((id) => !ids.includes(id)));
    this.commit();
  }
  duplicate() {
    const off = flags.snap ? flags.grid : 16;
    const copies = [...this.selected].map((id) => {
      const src = this.ent(id)!;
      const e: Entity = { ...structuredClone(src), id: this.uid(src.type), x: src.x + off, y: src.y + off };
      this.level.entities.push(e);
      this.level.spawn(e);
      return e.id;
    });
    if (copies.length) this.selected = new Set(copies);
    this.commit();
  }
  /** Copy the selection to the editor clipboard (kept across levels in this page). */
  copy() {
    clipboard = [...this.selected].map((id) => structuredClone(this.ent(id)!)).filter(Boolean);
    if (clipboard.length) this.status(`Copied ${clipboard.length}`);
  }
  /** Paste the clipboard centred on the mouse, keeping its layout; skips types this level lacks. */
  paste() {
    const items = clipboard.filter((e) => this.level.types[e.type]);
    if (!items.length) return;
    const cx = items.reduce((a, e) => a + e.x, 0) / items.length;
    const cy = items.reduce((a, e) => a + e.y, 0) / items.length;
    const at = this.snapPt(this.mouse);
    const d = this.snapPt({ x: at.x - cx, y: at.y - cy });
    const copies = items.map((src) => {
      const e: Entity = { ...structuredClone(src), id: this.uid(src.type), x: round(src.x + d.x), y: round(src.y + d.y) };
      this.level.entities.push(e);
      this.level.spawn(e);
      return e.id;
    });
    this.selected = new Set(copies);
    this.commit();
  }
  /** Set one field: x, y, rotation, scale or a prop. Not committed; call commit() when done. */
  setField(e: Entity, k: string, v: number | string | boolean) {
    if (k === 'x' || k === 'y' || k === 'rotation' || k === 'scale') {
      (e as any)[k] = v;
      this.tidy(e);
      const obj = this.level.get(e.id);
      if (obj) place(obj, e);
    } else {
      (e.props ??= {})[k] = v;
      this.level.rebuild(e);
    }
  }
  rename(e: Entity, to: string) {
    to = to.trim();
    if (!to || to === e.id || this.ent(to)) return false;
    const obj = this.level.get(e.id);
    this.level.objects.delete(e.id);
    if (obj) this.level.objects.set(to, obj);
    this.selected = new Set([...this.selected].map((id) => (id === e.id ? to : id)));
    e.id = to;
    return true;
  }
  select(ids: string[]) {
    this.selected = new Set(ids.filter((id) => this.ent(id)));
    this.render();
  }
  async save() {
    if (!this.level.path) return this.status('No path: pass { path } to loadLevel', true);
    this.status('Saving...');
    try {
      const data = this.serialize();
      const r = await fetch('/__editor/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: this.level.path, data }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? r.status);
      this.saved = JSON.stringify(data);
      this.status(`Saved ${new Date().toLocaleTimeString()}`);
      this.level.onSave?.(structuredClone(data));
      return true;
    } catch (err) {
      this.status(`Save failed: ${(err as Error).message}`, true);
      return false;
    }
  }
  dirty() {
    return this.json() !== this.saved;
  }

  // ---- open / close ----

  get editing() {
    return flags.editing;
  }
  open() {
    flags.editing = true;
    this.root.hidden = false;
    this.gfx = this.scene.add.graphics().setDepth(1e9);
    this.scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.draw);
    this.applyPause();
    this.render();
  }
  close() {
    flags.editing = false;
    this.root.hidden = true;
    this.scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.draw);
    this.gfx?.destroy();
    this.gfx = undefined;
    this.drag = null;
    this.armed = null;
    if (this.pausedByUs) this.scene.scene.resume();
    this.pausedByUs = false;
  }
  toggle() {
    flags.editing ? this.close() : this.open();
  }
  private applyPause() {
    const sys = this.scene.sys;
    if (flags.running && this.pausedByUs) {
      this.scene.scene.resume();
      this.pausedByUs = false;
    } else if (!flags.running && !this.pausedByUs && sys.isActive()) {
      this.scene.scene.pause();
      this.pausedByUs = true;
    }
  }
  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.draw);
    this.root.remove();
    if (S === this) S = null;
  }

  // ---- geometry ----

  private geom(e: Entity): { area?: Rect; icon?: { r: number; g: NonNullable<ReturnType<Editor['gizmoOf']>> } } {
    const g = this.gizmoOf(e);
    const raw = this.level.types[e.type]?.gizmo;
    const o = this.level.get(e.id) as any;
    let area: Rect | undefined;
    if ((!raw || raw.area) && o?.getBounds) {
      const b = o.getBounds();
      if (Number.isFinite(b.width) && b.width > 0 && b.height > 0) area = { x: b.x, y: b.y, w: b.width, h: b.height };
    }
    const wantIcon = raw || !area;
    return { area, icon: wantIcon ? { r: (g.size ?? GIZMO_SIZE) / 2 / this.cam.zoom, g } : undefined };
  }
  private gizmoOf(e: Entity) {
    return { icon: 'cross', color: ICON_COLOR, size: GIZMO_SIZE, area: false, ...this.level.types[e.type]?.gizmo } as {
      icon: string;
      color: number;
      size: number;
      area: boolean;
    };
  }
  private box(e: Entity): Rect {
    const g = this.geom(e);
    if (g.area) return g.area;
    const r = g.icon?.r ?? 10;
    return { x: e.x - r, y: e.y - r, w: 2 * r, h: 2 * r };
  }
  private pick(p: Pt) {
    let best: string | undefined;
    let bestScore = Infinity;
    for (const e of this.level.entities) {
      const g = this.geom(e);
      const inArea = g.area && p.x >= g.area.x && p.x <= g.area.x + g.area.w && p.y >= g.area.y && p.y <= g.area.y + g.area.h;
      const inIcon = g.icon && Math.hypot(p.x - e.x, p.y - e.y) <= g.icon.r;
      if (!inArea && !inIcon) continue;
      const score = inIcon && !g.area ? 4 * g.icon!.r ** 2 : g.area!.w * g.area!.h;
      if (score <= bestScore) [best, bestScore] = [e.id, score];
    }
    return best;
  }
  private handles(e: Entity) {
    const b = this.box(e);
    return { rot: { x: b.x + b.w / 2, y: b.y - 26 / this.cam.zoom }, scale: { x: b.x + b.w, y: b.y + b.h } };
  }
  private world(ev: PointerEvent): Pt {
    const r = this.cap.getBoundingClientRect();
    const sc = this.scene.scale;
    const w = this.cam.getWorldPoint(((ev.clientX - r.left) / r.width) * sc.width, ((ev.clientY - r.top) / r.height) * sc.height);
    return { x: w.x, y: w.y };
  }

  // ---- drawing (gizmos live in the scene, so they follow the camera) ----

  private draw = () => {
    const g = this.gfx;
    if (!g) return;
    g.clear();
    const z = this.cam.zoom;
    const px = 1 / z;
    if (flags.snap && flags.grid * z >= 6) {
      const v = this.cam.worldView;
      g.lineStyle(px, 0xffffff, 0.07);
      for (let x = Math.ceil(v.x / flags.grid) * flags.grid; x < v.right; x += flags.grid) g.lineBetween(x, v.y, x, v.bottom);
      for (let y = Math.ceil(v.y / flags.grid) * flags.grid; y < v.bottom; y += flags.grid) g.lineBetween(v.x, y, v.right, y);
    }
    for (const e of this.level.entities) {
      const geo = this.geom(e);
      const gz = this.gizmoOf(e);
      if (geo.area) {
        const a = geo.area;
        if (gz.area) {
          g.fillStyle(gz.color, 0.14).fillRect(a.x, a.y, a.w, a.h);
          g.lineStyle(px, gz.color, 0.8).strokeRect(a.x, a.y, a.w, a.h);
        } else g.lineStyle(px, 0x8ab4ff, 0.4).strokeRect(a.x, a.y, a.w, a.h);
      }
      if (geo.icon) this.icon(g, e, geo.icon.r, gz.icon, gz.color);
    }
    for (const id of this.selected) {
      const e = this.ent(id);
      if (!e) continue;
      const b = this.box(e);
      g.lineStyle(2 * px, SEL, 1).strokeRect(b.x, b.y, b.w, b.h);
      g.lineBetween(e.x - 5 * px, e.y, e.x + 5 * px, e.y).lineBetween(e.x, e.y - 5 * px, e.x, e.y + 5 * px);
    }
    const one = this.single();
    if (one) {
      const h = this.handles(one);
      const b = this.box(one);
      g.lineStyle(px, SEL, 1).lineBetween(b.x + b.w / 2, b.y, h.rot.x, h.rot.y);
      g.fillStyle(SEL, 1).fillCircle(h.rot.x, h.rot.y, 6 * px).fillRect(h.scale.x - 5 * px, h.scale.y - 5 * px, 10 * px, 10 * px);
    }
    const d = this.drag;
    if (d?.k === 'box') {
      const x = Math.min(d.a.x, d.b.x), y = Math.min(d.a.y, d.b.y), w = Math.abs(d.a.x - d.b.x), h = Math.abs(d.a.y - d.b.y);
      g.fillStyle(SEL, 0.1).fillRect(x, y, w, h);
      g.lineStyle(px, SEL, 0.9).strokeRect(x, y, w, h);
    }
    if (this.armed) {
      const m = this.snapPt(this.mouse);
      g.lineStyle(px, SEL, 1).lineBetween(m.x - 10 * px, m.y, m.x + 10 * px, m.y).lineBetween(m.x, m.y - 10 * px, m.x, m.y + 10 * px);
    }
  };
  private icon(g: Phaser.GameObjects.Graphics, e: Entity, r: number, shape: string, color: number) {
    const { x, y } = e;
    const px = 1 / this.cam.zoom;
    g.fillStyle(0x000000, 0.5).fillCircle(x, y, r);
    g.lineStyle(1.5 * px, color, 1).fillStyle(color, 1);
    const k = r * 0.78;
    if (shape === 'ring') g.strokeCircle(x, y, k);
    else if (shape === 'diamond') g.beginPath().moveTo(x, y - k).lineTo(x + k, y).lineTo(x, y + k).lineTo(x - k, y).closePath().strokePath();
    else if (shape === 'sun' || shape === 'burst') {
      const n = shape === 'sun' ? 8 : 10;
      g.fillCircle(x, y, k * (shape === 'sun' ? 0.38 : 0.2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const len = shape === 'burst' && i % 2 ? k * 0.55 : k;
        g.lineBetween(x + Math.cos(a) * k * 0.5, y + Math.sin(a) * k * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
      }
    } else g.lineBetween(x - k, y, x + k, y).lineBetween(x, y - k, x, y + k);
  }

  // ---- pointer ----

  private down(ev: PointerEvent) {
    if (ev.button !== 0) return;
    this.cap.setPointerCapture(ev.pointerId);
    const p = this.world(ev);
    this.mouse = p;
    if (this.armed) {
      const s = this.snapPt(p);
      this.add(this.armed, s.x, s.y);
      if (!ev.shiftKey) this.armed = null;
      return this.render();
    }
    const one = this.single();
    if (one) {
      const h = this.handles(one);
      const r = 10 / this.cam.zoom;
      if (Math.hypot(p.x - h.rot.x, p.y - h.rot.y) <= r) return void (this.drag = { k: 'rot', id: one.id });
      if (Math.hypot(p.x - h.scale.x, p.y - h.scale.y) <= r)
        return void (this.drag = { k: 'scale', id: one.id, s0: one.scale ?? 1, d0: Math.max(1, Math.hypot(p.x - one.x, p.y - one.y)) });
    }
    const hit = this.pick(p);
    if (hit) {
      if (ev.shiftKey && this.selected.has(hit)) {
        this.selected.delete(hit);
        return this.render();
      }
      if (ev.shiftKey) this.selected.add(hit);
      else if (!this.selected.has(hit)) this.selected = new Set([hit]);
      const o = new Map([...this.selected].map((id) => [id, { x: this.ent(id)!.x, y: this.ent(id)!.y }]));
      this.drag = { k: 'move', p0: p, o, primary: hit, moved: false };
    } else {
      if (!ev.shiftKey) this.selected.clear();
      this.drag = { k: 'box', a: p, b: p };
    }
    this.render();
  }
  private move(ev: PointerEvent) {
    const p = this.world(ev);
    this.mouse = p;
    const d = this.drag;
    if (!d) return;
    const snap = flags.snap && !ev.altKey;
    if (d.k === 'box') d.b = p;
    else if (d.k === 'move') {
      const dx = p.x - d.p0.x, dy = p.y - d.p0.y;
      if (!d.moved && Math.hypot(dx, dy) * this.cam.zoom < 3) return;
      d.moved = true;
      const prim = d.o.get(d.primary)!;
      const t = snap ? this.snapPt({ x: prim.x + dx, y: prim.y + dy }) : { x: prim.x + dx, y: prim.y + dy };
      const ox = t.x - prim.x, oy = t.y - prim.y;
      for (const [id, o0] of d.o) {
        const e = this.ent(id)!;
        e.x = o0.x + ox;
        e.y = o0.y + oy;
        place(this.level.get(id)!, e);
      }
    } else {
      const e = this.ent(d.id)!;
      if (d.k === 'rot') {
        let a = (Math.atan2(p.y - e.y, p.x - e.x) * 180) / Math.PI + 90;
        if ((snap || ev.shiftKey) && !ev.altKey) a = Math.round(a / 15) * 15;
        e.rotation = a > 180 ? a - 360 : a;
      } else e.scale = Math.max(0.05, round((d.s0 * Math.hypot(p.x - e.x, p.y - e.y)) / d.d0, 20));
      this.tidy(e);
      place(this.level.get(e.id)!, e);
    }
    this.refresh();
    this.syncFields();
  }
  private up() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.k === 'box') {
      const x = Math.min(d.a.x, d.b.x), y = Math.min(d.a.y, d.b.y), w = Math.abs(d.a.x - d.b.x), h = Math.abs(d.a.y - d.b.y);
      for (const e of this.level.entities) {
        const b = this.box(e);
        if (b.x <= x + w && b.x + b.w >= x && b.y <= y + h && b.y + b.h >= y) this.selected.add(e.id);
      }
      this.render();
    } else if (d.k !== 'move' || d.moved) this.commit();
  }

  // ---- keyboard ----

  key(ev: KeyboardEvent) {
    if (ev.key === 'F2') {
      ev.preventDefault();
      return this.toggle();
    }
    if (!flags.editing) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();
    if (mod && k === 's') {
      ev.preventDefault();
      return void this.save();
    }
    const t = ev.target as HTMLElement;
    if (t.matches?.('input:not([type=checkbox]):not([type=range]):not([type=color]), select')) {
      if (k === 'enter' || k === 'escape') t.blur();
      return;
    }
    const sel = [...this.selected].map((id) => this.ent(id)!).filter(Boolean);
    const step = ev.shiftKey ? 1 : flags.snap ? flags.grid : 1;
    const each = (fn: (e: Entity) => void) => {
      sel.forEach((e) => {
        fn(e);
        this.tidy(e);
        place(this.level.get(e.id)!, e);
      });
      this.commit();
    };
    const arrow: Record<string, Pt> = { arrowleft: { x: -step, y: 0 }, arrowright: { x: step, y: 0 }, arrowup: { x: 0, y: -step }, arrowdown: { x: 0, y: step } };
    let handled = true;
    if (mod && k === 'z') ev.shiftKey ? this.redo() : this.undo();
    else if (mod && k === 'y') this.redo();
    else if (mod && k === 'd') this.duplicate();
    else if (mod && k === 'c') this.copy();
    else if (mod && k === 'x') (this.copy(), this.remove([...this.selected]));
    else if (mod && k === 'v') this.paste();
    else if (mod && k === 'a') this.select(this.level.entities.map((e) => e.id));
    else if (mod) handled = false;
    else if (k === 'delete' || k === 'backspace') this.remove([...this.selected]);
    else if (k === 'escape') {
      if (this.armed) this.armed = null;
      else this.selected.clear();
      this.render();
    } else if (k === 'g') {
      flags.snap = !flags.snap;
      this.refresh();
    } else if (k === 'p') {
      flags.running = !flags.running;
      this.applyPause();
      this.refresh();
    } else if (k === 'q' || k === 'e') each((e) => (e.rotation = round((e.rotation ?? 0) + (k === 'e' ? 1 : -1) * (ev.shiftKey ? 1 : flags.snap ? 15 : 5))));
    else if (k === '[' || k === ']') each((e) => (e.scale = Math.max(0.05, round((e.scale ?? 1) + (k === ']' ? 0.1 : -0.1)))));
    else if (arrow[k]) each((e) => ((e.x += arrow[k].x), (e.y += arrow[k].y)));
    else handled = false;
    if (handled) ev.preventDefault();
  }

  // ---- DOM ----

  private mount() {
    const types = Object.keys(this.level.types);
    this.root.className = 'ed';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="ed-capture"></div>
      <div class="ed-bar ui-panel">
        <b class="ed-title">EDIT</b><span class="ui-dim" data-r="path"></span><span data-r="dirty"></span>
        <button class="ui-btn ui-btn--secondary" data-a="undo">Undo</button>
        <button class="ui-btn ui-btn--secondary" data-a="redo">Redo</button>
        <label class="ui-toggle"><input type="checkbox" data-a="snap"><span class="ui-toggle__track"></span>Snap</label>
        <select class="ed-input ed-grid" data-a="grid">${[8, 16, 32, 64].map((n) => `<option>${n}</option>`).join('')}</select>
        <button class="ui-btn ui-btn--secondary" data-a="run"></button>
        <button class="ui-btn ui-btn--primary" data-a="save">Save</button>
        <span data-r="status"></span>
      </div>
      <div class="ed-side ed-left ui-panel">
        <h3 class="ui-panel__title">Add</h3>
        <div class="ed-types">${types.map((t) => `<button class="ui-btn ui-btn--secondary" data-type="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <h3 class="ui-panel__title">Entities</h3>
        <div class="ed-list" data-r="list"></div>
      </div>
      <div class="ed-side ed-right ui-panel" data-r="panel"></div>
      <div class="ed-hint ui-label">Click select, Shift multi, drag move (Alt = no snap) · Q/E rotate · [ ] scale · arrows nudge · Del · Ctrl+C/X/V copy, cut, paste · Ctrl+D duplicate · Ctrl+Z/Y · Ctrl+S save · G snap · P run · F2 exit</div>`;
    this.scene.game.domContainer.appendChild(this.root);
    this.cap = this.root.querySelector('.ed-capture')!;
    this.cap.addEventListener('pointerdown', (e) => this.down(e));
    this.cap.addEventListener('pointermove', (e) => this.move(e));
    this.cap.addEventListener('pointerup', () => this.up());
    this.cap.addEventListener('pointercancel', () => this.up());
    this.root.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest<HTMLElement>('button,[data-id]');
      if (!t) return;
      const a = t.dataset.a;
      if (a === 'undo') this.undo();
      else if (a === 'redo') this.redo();
      else if (a === 'save') void this.save();
      else if (a === 'run') {
        flags.running = !flags.running;
        this.applyPause();
        this.refresh();
      } else if (t.dataset.type) {
        this.armed = this.armed === t.dataset.type ? null : t.dataset.type;
        this.refresh();
      } else if (t.dataset.id) {
        if (ev.shiftKey) this.selected.has(t.dataset.id) ? this.selected.delete(t.dataset.id) : this.selected.add(t.dataset.id);
        else this.selected = new Set([t.dataset.id]);
        this.render();
      }
      if (t.tagName === 'BUTTON') t.blur();
    });
    this.root.addEventListener('change', (ev) => {
      const t = ev.target as HTMLInputElement;
      if (t.dataset.a === 'snap') flags.snap = t.checked;
      else if (t.dataset.a === 'grid') flags.grid = Number(t.value);
      else if (t.dataset.k) return this.field(t, true);
      this.refresh();
      t.blur();
    });
    this.root.addEventListener('input', (ev) => {
      const t = ev.target as HTMLInputElement;
      if (t.dataset.k) this.field(t, false);
    });
  }

  private field(t: HTMLInputElement, commit: boolean) {
    const e = this.single();
    const k = t.dataset.k!;
    if (!e) return;
    if (k === 'id') {
      if (commit && !this.rename(e, t.value)) t.value = e.id;
    } else {
      const v = t.type === 'checkbox' ? t.checked : t.type === 'number' || t.type === 'range' ? t.valueAsNumber : t.value;
      if (typeof v === 'number' && Number.isNaN(v)) return;
      this.setField(e, k.replace(/^p:/, ''), v);
    }
    if (commit) {
      this.commit();
      if (t.type !== 'number' && t.type !== 'text') t.blur();
    } else {
      this.refresh();
      this.syncFields();
    }
  }

  private status(text: string, err = false) {
    this.statusText = text;
    this.statusErr = err;
    this.refresh();
  }

  /** Chrome that depends on cheap state: cheap enough to run on every drag move. */
  private refresh() {
    const $ = (r: string) => this.root.querySelector<HTMLElement>(`[data-r=${r}]`)!;
    $('path').textContent = this.level.path ?? '(no path)';
    const dirty = this.dirty();
    $('dirty').textContent = dirty ? '● unsaved' : '';
    $('status').textContent = this.statusText;
    $('status').className = this.statusErr ? 'ed-err' : 'ui-dim';
    const q = (a: string) => this.root.querySelector<HTMLInputElement>(`[data-a=${a}]`)!;
    q('undo').disabled = this.hi === 0;
    q('redo').disabled = this.hi >= this.hist.length - 1;
    q('snap').checked = flags.snap;
    q('grid').value = String(flags.grid);
    q('run').textContent = flags.running ? 'Pause' : 'Run';
    this.root.querySelectorAll<HTMLElement>('[data-type]').forEach((b) => b.classList.toggle('is-selected', b.dataset.type === this.armed));
    this.cap.classList.toggle('is-armed', !!this.armed);
  }

  /** Rebuild list and panel (selection or entity set changed). */
  render() {
    this.refresh();
    this.root.querySelector('[data-r=list]')!.innerHTML = this.level.entities
      .map((e) => `<button class="ed-row${this.selected.has(e.id) ? ' is-selected' : ''}" data-id="${esc(e.id)}">${esc(e.id)}</button>`)
      .join('');
    const panel = this.root.querySelector('[data-r=panel]')!;
    const e = this.single();
    if (!e) {
      panel.innerHTML = this.selected.size
        ? `<h3 class="ui-panel__title">${this.selected.size} selected</h3><p class="ui-dim">Drag, Q/E, [ ], arrows, Ctrl+C/X/D and Del apply to all.</p>`
        : `<h3 class="ui-panel__title">Properties</h3><p class="ui-dim">Nothing selected. Click an object, or pick a type under Add and click to place it.</p>`;
      return;
    }
    const type = this.level.types[e.type];
    const row = (label: string, inner: string) => `<div class="ed-field"><span class="ui-label">${esc(label)}</span><div class="ed-ctl">${inner}</div></div>`;
    const num = (k: string, step: number, min?: number, max?: number) =>
      `<input class="ed-input" type="number" data-k="${k}" step="${step}"${min !== undefined ? ` min="${min}"` : ''}${max !== undefined ? ` max="${max}"` : ''}>`;
    const prop = (name: string, d: PropDef) => {
      const k = `p:${name}`;
      if (d.type === 'number')
        return row(name, (d.min !== undefined && d.max !== undefined ? `<input class="ui-slider ed-range" type="range" data-k="${k}" min="${d.min}" max="${d.max}" step="${d.step ?? 1}">` : '') + num(k, d.step ?? 1, d.min, d.max));
      if (d.type === 'boolean') return row(name, `<label class="ui-toggle"><input type="checkbox" data-k="${k}"><span class="ui-toggle__track"></span></label>`);
      if (d.type === 'color') return row(name, `<input class="ed-color" type="color" data-k="${k}">`);
      return row(name, `<select class="ed-input" data-k="${k}">${d.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`);
    };
    panel.innerHTML = `<h3 class="ui-panel__title">${esc(e.type)}</h3>
      ${row('id', `<input class="ed-input" type="text" data-k="id">`)}
      ${row('x', num('x', 1))}${row('y', num('y', 1))}${row('rotation', num('rotation', 1))}${row('scale', num('scale', 0.05, 0.05))}
      ${Object.entries((type?.props ?? {}) as Record<string, PropDef>).map(([n, d]) => prop(n, d)).join('')}`;
    this.syncFields();
  }

  /** Copy entity values into the panel inputs (not the one being typed in). */
  private syncFields() {
    const e = this.single();
    if (!e) return;
    const type = this.level.types[e.type];
    this.root.querySelectorAll<HTMLInputElement>('[data-r=panel] [data-k]').forEach((i) => {
      if (i === document.activeElement) return;
      const k = i.dataset.k!;
      const name = k.replace(/^p:/, '');
      const v = k === 'id' ? e.id : k === 'x' ? e.x : k === 'y' ? e.y : k === 'rotation' ? (e.rotation ?? 0) : k === 'scale' ? (e.scale ?? 1) : (e.props?.[name] ?? type?.props?.[name]?.default);
      if (i.type === 'checkbox') i.checked = !!v;
      else i.value = typeof v === 'number' ? String(round(v)) : String(v ?? '');
    });
  }

  // ---- agents: window.__game.editor ----

  private install() {
    const g = (window as any).__game;
    if (!g) return;
    const get = (id: string) => {
      const e = this.ent(id);
      if (!e) throw new Error(`no entity "${id}"`);
      return e;
    };
    g.editor = {
      path: this.level.path,
      open: () => !flags.editing && this.open(),
      close: () => flags.editing && this.close(),
      editing: () => flags.editing,
      list: () => structuredClone(this.serialize().entities),
      get: (id: string) => structuredClone(get(id)),
      selected: () => [...this.selected],
      select: (...ids: string[]) => this.select(ids),
      add: (type: string, x: number, y: number, props?: Entity['props']) => this.add(type, x, y, props),
      move: (id: string, x: number, y: number) => this.patch(id, { x, y }),
      set: (id: string, patch: { x?: number; y?: number; rotation?: number; scale?: number; props?: Entity['props'] }) => this.patch(id, patch),
      remove: (...ids: string[]) => this.remove(ids),
      undo: () => this.undo(),
      redo: () => this.redo(),
      save: () => this.save(),
      dirty: () => this.dirty(),
    };
    this.patch = (id, patch) => {
      const e = get(id);
      const { props, ...t } = patch;
      for (const [k, v] of Object.entries(t)) if (v !== undefined) this.setField(e, k, v);
      for (const [k, v] of Object.entries(props ?? {})) this.setField(e, k, v);
      this.commit();
    };
  }
  patch: (id: string, patch: { x?: number; y?: number; rotation?: number; scale?: number; props?: Entity['props'] }) => void = () => {};
}

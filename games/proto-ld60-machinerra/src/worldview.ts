/**
 * What lies in the land and is not a unit: the ruins, the tap (a healing shrine, shrinking as it is drained, steaming now
 * and then, its reach a faint ring), coal seams (they shrink and crack in stages as mined, jolt at each pickaxe beat and cave in on
 * the last coal; lumps roll to the miner's feet; the timed hand-mining ring), each land's hives
 * (a light while awake, an oil bar while hurt), shots in the air, loot on the ground (a unique's halo), the flags where crews
 * were sent, the brass arrows at the screen edge toward what matters now, and the hornets' buzz. Also the moments that happen
 * to them: a find, a pickup, coal, the tap's mending, a ruin searched.
 * Add a thing to the land: create it in the constructor, draw it in `update`, and give its moment a `case` in `event`.
 */
import Phaser from 'phaser';
import { pickupSize } from './attention';
import { S } from './art';
import { DANGER, DANGER_HOT, LINE } from './house';
import { CREW_COLORS, crewMark } from './hud';
import { ownPoints } from './sim/command';
import { NEST_LOOK } from './nestart';
import { CRUDE_STAIN, ViewBase, kick, type G, type Img, type Light, type PlayHost } from './playhost';
import { BIOMES, CREWS, LOOT, MULE, PARTS, T, TAP } from './sim/defs';
import { huntCue } from './sim/dayplay';
import type { SimEvent } from './sim/sim';
import type { Seam } from './sim/types';

export class WorldView extends ViewBase {
  private shots = new Map<number, Img>();
  private seeps = new Map<number, Img>();
  readonly seams = new Map<number, Img>();
  private loot = new Map<number, Img>();
  readonly ruins = new Map<number, Img>();
  private nests = new Map<number, { spr: Img; light: Light | null }>();
  private flags: { img: Img; label: Phaser.GameObjects.Text }[] = [];
  /** Smaller flags where robots were sent on their own (P3), made as needed: their crew's colour and mark ("1•"). */
  private ownFlags: { img: Img; label: Phaser.GameObjects.Text; mark: string }[] = [];
  private pointers: Img[] = [];
  private buzzT = 0;
  private glintT = 0;
  /** A seam's cracks (drawn again only when its stage changes), when it was last struck, and when it caved in (ms). */
  private cracks = new Map<number, { g: G; stage: number }>();
  private struck = new Map<number, number>();
  private caved = new Map<number, number>();

  constructor(host: PlayHost) {
    super(host);
    const sim = this.sim, w = this.w, scene = this.scene;
    for (const r of sim.ruins) this.ruins.set(r.id, w.cull.add(host.place(r.kind, r.x, r.y + 0.3 * T)));
    for (const s of sim.seeps) {
      this.seeps.set(s.id, w.cull.add(scene.add.image(s.x, s.y, 'tap').setScale(1 / S).setDepth(s.y - 6)));
      // The tap's crude stain: anyone walking through it leaves oily prints for a few steps.
      if (s.kind === 'crude') for (let i = 0; i < 5; i++) w.marks.stamp('world-splat', s.x + Phaser.Math.Between(-30, 30), s.y + Phaser.Math.Between(-16, 16), { tint: CRUDE_STAIN, alpha: 0.35, scale: 0.35, kind: 'crude' });
    }
    for (const s of sim.seams) this.addSeam(s);
    // Each land's own hive (nestart.ts): the desert's server rack, the jungle's den, the city's metro stop...
    const nestKey = NEST_LOOK[BIOMES[host.land.biome].paint].key;
    for (const n of sim.nests) this.nests.set(n.id, { spr: w.cull.add(host.place(nestKey, n.x, n.y + 20 * n.scale, n.scale)), light: null });
    for (let c = 1; c < CREWS; c++) {
      const img = scene.add.image(0, 0, 'flag').setOrigin(0.15, 1).setScale(1 / S).setTint(Number.parseInt(CREW_COLORS[c].slice(1), 16)).setVisible(false);
      const label = this.k.text(0, 0, String(c), { size: 13, font: 'body' }).setOrigin(0.5).setDepth(95000).setStroke('#1d1a17', 4).setVisible(false);
      this.flags.push({ img, label });
    }
    for (let i = 0; i < 4; i++) this.pointers.push(scene.add.image(0, 0, 'pointer').setScrollFactor(0).setDepth(98000).setVisible(false));
  }

  /** A coal seam's drawing (the land's own at the start; dev `seam spawn` adds one). */
  addSeam(s: Seam) {
    this.seams.set(s.id, this.w.cull.add(this.scene.add.image(s.x, s.y + 8, 'seam').setScale(1 / S).setDepth(s.y - 6)));
  }

  /** Cracks across a seam's heap, more of them at each stage as it empties (dark, a thin ember in them); a bare one is a dark crater with chunks. Drawn once a stage. */
  private crack(s: Seam, stage: number) {
    let c = this.cracks.get(s.id);
    if (!c && stage === 0) return;
    if (!c) this.cracks.set(s.id, (c = { g: this.scene.add.graphics().setDepth(s.y - 5), stage: 0 }));
    if (c.stage === stage) return;
    c.stage = stage;
    const g = c.g.clear();
    // The heap's middle and size as drawn (the picture's lumps sit low in it, and it shrinks with the coal left).
    const cx = s.x, cy = s.y + 14, r = stage === 4 ? 0.45 : 0.45 + 0.55 * (1 - stage * 0.25 - 0.125);
    if (stage === 4) {
      g.fillStyle(0x17120f, 0.5).fillEllipse(cx, cy + 2, 34, 15);
      for (let i = 0; i < 6; i++) g.fillStyle(i % 2 ? 0x59514a : 0x2a2420, 0.9).fillCircle(cx + Math.cos(i * 1.7) * 11, cy + 2 + Math.sin(i * 1.7) * 4, 1.6 + (i % 3) * 0.5);
      return;
    }
    for (let i = 0; i < stage * 2; i++) {
      // A seeded start inside the heap, a short wander: the same cracks every time, the next stage adding to them.
      const t = ((s.id * 7 + i * 5) % 11) * 0.57 + i * 2.1, rho = 0.25 + (((s.id + i * 3) % 5) / 5) * 0.6;
      let x = cx + Math.cos(t) * 14 * r * rho, y = cy - 3 + Math.sin(t) * 8 * r * rho;
      const a = t + 1.4 + (((s.id + i) % 3) - 1) * 0.5;
      const pts = [{ x, y }];
      for (let k = 0; k < 3; k++) {
        const b = a + (((s.id + i * 3 + k * 5) % 5) - 2) * 0.4;
        x += Math.cos(b) * (3.5 - k * 0.5);
        y += Math.sin(b) * (2.6 - k * 0.4);
        pts.push({ x, y });
      }
      for (const [w, col, al] of [[2, 0x0e0b09, 0.95], [0.8, 0xff9a3c, 0.6]] as const) {
        g.lineStyle(w, col, al);
        for (let k = 1; k < pts.length; k++) g.lineBetween(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y);
      }
    }
  }

  update(dt: number, g: G) {
    const sim = this.sim, now = this.scene.time.now;
    for (const sh of sim.shots) {
      let s = this.shots.get(sh.id);
      if (!s) {
        s = this.scene.add.image(sh.x, sh.y, 'bolt').setScale(sh.foe ? 1.5 : sh.big ? 0.9 : 0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(70000);
        if (sh.foe) s.setTint(sh.web ? 0xd8f8ff : sh.status === 'corroded' || sh.lay === 'puddle' ? DANGER_HOT : DANGER); // an enemy's shot is red, whatever it leaves behind (the spider's cable stays its white wire)
        if (sh.blade || sh.pigeon) s.setVisible(false); // a thrown scythe is drawn by the tier view, a brass pigeon by the mod view
        if (sh.valve) s.setScale(1.7).setTint(0xfff0b0); // a Pressure Valve's bolt: big and white-hot
        if (sh.type === 'dark' && !sh.foe) s.setTint(0xb090ff); // ghost bullets (the Ecto-repeater)
        if (sh.pebble) s.setTint(0x9a8a78).setScale(0.55).setBlendMode(Phaser.BlendModes.NORMAL); // the slingshot's scrap // the queen's bolts are hers: red-violet, big and slow enough to read; a spider's cable is white
        s.rotation = Math.atan2(sh.vy, sh.vx);
        this.shots.set(sh.id, s);
      }
      s.setPosition(sh.x, sh.y);
      if (sh.ric !== undefined) s.rotation = Math.atan2(sh.vy, sh.vx); // a bouncing bolt turns with its flight (Ricochet Cog)
    }
    for (const [id, s] of this.shots) if (!sim.shots.some((x) => x.id === id)) {
      s.destroy();
      this.shots.delete(id);
    }
    for (const l of sim.loot) {
      let img = this.loot.get(l.id);
      const unique = (l.kind === 'part' && PARTS[l.part!].unique) || l.kind === 'core';
      if (!img) {
        img = this.w.cull.add(this.scene.add.image(l.x, l.y, l.kind === 'oil' ? 'oilcan' : l.kind === 'part' ? `part-${l.part}` : l.kind === 'core' ? 'ai-core' : l.kind === 'scrap' ? 'scrapgob' : 'coppergob').setScale((unique ? 2.6 : l.kind === 'oil' && l.amt < LOOT.oil ? 1.2 : 1.8) / S), { mobile: true });
        // A boss's unique, or an AI core: a pulsing halo under it (gold, or cold blue for a core), so nobody leaves it behind.
        if (unique) img.setData('halo', this.scene.add.image(l.x, l.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(l.kind === 'core' ? 0x70e8ff : 0xffc040).setDepth(l.y - 1));
        this.loot.set(l.id, img);
      }
      img.setPosition(l.x, l.y - 6 + Math.sin(now / 220 + l.id) * 3).setDepth(l.y);
      this.w.cull.moved(img); // a mule may carry it off screen
      (img.getData('halo') as Img | undefined)?.setPosition(l.x, l.y - 6).setScale(0.5 + 0.12 * Math.sin(now / 260)).setDepth(l.y - 1);
      img.setAlpha(l.t < 6 ? 0.4 + 0.6 * Math.abs(Math.sin(now / 120)) : 1);
    }
    for (const [id, img] of this.loot) if (!sim.loot.some((l) => l.id === id)) {
      this.w.cull.remove(img);
      (img.getData('halo') as Img | undefined)?.destroy();
      img.destroy();
      this.loot.delete(id);
    }
    // The tap shrinks as it is drained and steams now and then, so the eye finds it; its reach shows as a faint ring.
    this.glintT -= dt;
    const glint = this.glintT <= 0;
    if (glint) this.glintT = 1.4;
    for (const s of sim.seeps) {
      const img = this.seeps.get(s.id);
      if (!img) continue;
      const f = s.amount / s.max;
      img.setScale((0.5 + 0.5 * f) / S).setAlpha(f > 0 ? 1 : 0.4);
      if (f > 0) g.lineStyle(LINE.detail, 0x9fe0ff, 0.18).strokeEllipse(s.x, s.y, TAP.reach * 2, TAP.reach * 1.3);
      if (glint && f > 0 && img.visible && Math.random() < 0.6) this.k.fx.burst(s.x - 8, s.y - 4, { color: 0xdff4ff, size: 0.3 });
    }
    // A seam shrinks and cracks as it is mined, jolts at each pickaxe beat, and a bare one lies caved in.
    for (const s of sim.seams) {
      const img = this.seams.get(s.id);
      if (!img) continue;
      const f = s.amount / s.max;
      const hit = this.struck.get(s.id);
      const jolt = hit === undefined ? 0 : Math.max(0, 1 - (now - hit) / 140);
      const q = this.caved.get(s.id);
      const cave = f > 0 ? 0 : q === undefined ? 1 : Math.min(1, (now - q) / 450);
      const slump = 1 - (1 - cave) ** 2; // quick, then settling: 0 standing, 1 flat
      const base = (0.45 + 0.55 * f) / S;
      img.setScale(base * (1 + 0.12 * slump + 0.05 * jolt), base * (1 - 0.35 * slump - 0.06 * jolt)).setAlpha(f > 0 ? 1 : 0.55).setTint(f > 0 ? 0xffffff : 0x9a9088);
      if (img.visible || this.cracks.has(s.id)) this.crack(s, f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : f > 0 ? 3 : 4);
    }
    const act = sim.action;
    if (act?.seam) {
      const p = Math.min(1, act.t / act.need), dim = act.paused ? 0.4 : 1;
      g.lineStyle(5, 0x1d1a17, 0.4 * dim).strokeCircle(act.seam.x, act.seam.y - 20, 40);
      g.lineStyle(5, 0xffd98a, 0.95 * dim).beginPath().arc(act.seam.x, act.seam.y - 20, 40, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2).strokePath();
    }
    // Searched ruins go dull, flattened ones darker; a live one whose walls fell still shows it hums.
    for (const r of sim.ruins) if (r.searched || r.broken) this.ruins.get(r.id)!.setTint(r.searched ? (r.broken ? 0x8a8078 : 0xb0a090) : 0xd0c8bc);
    for (const n of sim.nests) {
      // A hive a place makes later (P36: the Lost Expedition's, once he comes near) gets its picture when it appears.
      if (!this.nests.has(n.id)) this.nests.set(n.id, { spr: this.w.cull.add(this.host.place(NEST_LOOK[BIOMES[this.host.land.biome].paint].key, n.x, n.y + 20 * n.scale, n.scale)), light: null });
      const v = this.nests.get(n.id)!;
      if (n.awake && !n.dead && !v.light) v.light = this.k.lights.add(n.x, n.y - 20, { color: NEST_LOOK[BIOMES[this.host.land.biome].paint].light, radius: 200 * n.scale, intensity: 0.8 });
      if (v.light) v.light.intensity = n.dead ? 0 : 0.7 + Math.sin(now / 180) * 0.25;
      if (n.dead && v.spr.alpha === 1) v.spr.setTint(0x403530).setAlpha(0.85);
      if (n.awake && !n.dead && n.hp < n.maxHp) {
        const x = n.x - 30, y = n.y - 70;
        g.fillStyle(0x1d1a17, 0.85).fillRect(x - 1, y - 1, 62, 7);
        g.fillStyle(DANGER, 1).fillRect(x, y, 60 * (n.hp / n.maxHp), 5);
      }
    }
    // Flags where crews were sent: the map's orders, standing in the world.
    for (let cr = 1; cr < CREWS; cr++) {
      const f = this.flags[cr - 1];
      // A crew told to follow flies its flag over the Communicator, side by side with the other following crews.
      const o = sim.following[cr] ? { x: sim.controller.x + (cr - 2) * 20 - 10, y: sim.controller.y - 52 } : sim.orders[cr];
      const on = !!o && sim.crew.some((b) => b.crew === cr && !b.own) && (sim.following[cr] || !sim.onLift(o, 0.5));
      f.img.setVisible(on);
      f.label.setVisible(on);
      if (on) {
        f.img.setPosition(o!.x + 14, o!.y + 10).setDepth(o!.y + 10);
        f.label.setPosition(o!.x + 22, o!.y - 22);
      }
    }
    this.drawOwnFlags();
    this.edgePointers();
    // Many sources, one sound: every hornet buzzes now and then; the kit plays the nearest few one by one and folds the
    // rest into a swarm bed that swells with their number (the `buzz` group in sound.ts).
    this.buzzT -= dt;
    if (this.buzzT <= 0) {
      this.buzzT = 0.15;
      for (const h of sim.hornets) if (!h.spider && ((h.id * 7 + Math.floor(now / 150)) % 8) === 0) this.sfx('buzz', h.x, h.y, { gain: h.elite ? 0.6 : 0.4 });
      if (!sim.hornets.length) this.k.audio.sfx.quietBeds(2);
    }
  }

  /** A small flag at each point robots were sent to on their own (not the lift: the lift needs none). */
  private drawOwnFlags() {
    const pts = ownPoints(this.sim).filter((p) => !this.sim.onLift(p.at, 0.5));
    while (this.ownFlags.length < pts.length) {
      const img = this.scene.add.image(0, 0, 'flag').setOrigin(0.15, 1).setScale(0.7 / S);
      const label = this.k.text(0, 0, '', { size: 12, font: 'body' }).setOrigin(0.5).setDepth(95000).setStroke('#1d1a17', 4);
      this.ownFlags.push({ img, label, mark: '' });
    }
    this.ownFlags.forEach((f, i) => {
      const p = pts[i];
      f.img.setVisible(!!p);
      f.label.setVisible(!!p);
      if (!p) return;
      const b = p.bots[0];
      const mark = crewMark(b);
      // Text is rasterised again on every change: only when the mark does.
      if (f.mark !== mark) {
        f.mark = mark;
        f.label.setText(mark).setColor(CREW_COLORS[b.crew]);
        f.img.setTint(Number.parseInt(CREW_COLORS[b.crew].slice(1), 16));
      }
      f.img.setPosition(p.at.x + 10, p.at.y + 8).setDepth(p.at.y + 8);
      f.label.setPosition(p.at.x + 17, p.at.y - 14);
    });
  }

  /** Brass arrows at the screen edge toward what matters now: the lift just after the Oracle suggests it, the tap once it is in view of the Oracle. */
  private edgePointers() {
    const sim = this.sim;
    const cam = this.scene.cameras.main;
    const targets: { x: number; y: number; danger?: boolean }[] = [];
    if (sim.liftCue > 0 && sim.phase === 'mission') targets.push(sim.lift);
    const hunt = huntCue(sim); // the hunter pack, the seconds before it comes (P13)
    if (hunt) targets.push({ ...hunt, danger: true });
    // The Listening horn: the twisted that came in over the rim and are not in view yet, the nearest two.
    if (sim.engine.tagged(sim.controller, 'horn')) {
      const c = sim.controller;
      const away = sim.hornets.filter((h) => !h.dead && h.twisted && h.rim).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
      for (const h of away.slice(0, 2)) targets.push({ x: h.x, y: h.y, danger: true });
    }
    this.pointers.forEach((p, i) => {
      const tg = targets[i];
      const view = cam.worldView;
      if (!tg || view.contains(tg.x, tg.y)) {
        p.setVisible(false);
        return;
      }
      // A scroll-factor-0 object is zoomed about the screen centre with the world, so place it for the zoom and scale it back.
      const cx = cam.width / 2, cy = cam.height / 2, z = cam.zoom;
      const a = Math.atan2(tg.y - view.centerY, tg.x - view.centerX);
      const m = 40;
      const k = Math.min((cx - m) / Math.abs(Math.cos(a) || 1e-6), (cy - m) / Math.abs(Math.sin(a) || 1e-6));
      const pulse = 1 + Math.sin(this.scene.time.now / 160) * 0.12;
      p.setVisible(true).setPosition(cx + (Math.cos(a) * k) / z, cy + (Math.sin(a) * k) / z).setRotation(a).setScale(pulse / z);
      if (tg.danger) p.setTint(DANGER);
      else p.clearTint();
    });
  }

  event(e: SimEvent) {
    const fx = this.k.fx;
    switch (e.e) {
      case 'gather':
        this.sfx('click', e.x, e.y, { gain: 0.5, vary: 0.2 });
        break;
      case 'dry':
        fx.burst(e.s.x, e.s.y, { color: 0x806040, size: 0.8 });
        break;
      case 'ruin':
        this.floater(e.ruin.x, e.ruin.y - 60, e.text, '#fff3d6', e.ruin.trail !== undefined ? 7600 : 5200, 18);
        this.sfx('heal', e.ruin.x, e.ruin.y, { gain: 0.5, vary: 0 });
        fx.burst(e.ruin.x, e.ruin.y - 20, { color: 0xffd98a, size: 0.8 });
        break;
      case 'drop':
        fx.burst(e.l.x, e.l.y, { color: e.l.kind === 'part' || e.l.kind === 'core' ? 0x3df2ff : 0xffd98a, size: 0.4 });
        break;
      case 'pickup': {
        const healed = e.l.amt - e.banked;
        const oil = [healed > 0 ? `+${Math.round(healed)} oil (${e.by.name})` : '', e.banked > 0 ? `+${Math.round(e.banked)} spare oil` : ''].filter(Boolean).join(', ') || 'spare cans full';
        const what = e.l.kind === 'scrap' || e.l.kind === 'copper' ? `+${Math.round(e.l.amt * (e.by.role === 'mule' && e.l.kind !== 'copper' ? MULE.scrap : 1))} ${e.l.kind}` : e.l.kind === 'oil' ? oil : e.l.kind === 'core' ? '+1 AI core' : `${PARTS[e.l.part!].name}!`;
        if (e.l.kind === 'core') {
          this.hud.banner('An AI core: one more robot rides the lift', 2800);
          this.sfx('unlock', e.l.x, e.l.y, { gain: 0.8 });
          this.flash(e.l.x, e.l.y - 14, 0x70e8ff, 2);
        }
        if (e.banked > 0) this.hud.reserveFlash(true);
        if (e.l.kind === 'part' && PARTS[e.l.part!].unique) {
          this.hud.banner(PARTS[e.l.part!].name, 2800);
          this.sfx('unlock', e.l.x, e.l.y, { gain: 0.8 });
          this.k.juice.shake('small');
          this.flash(e.l.x, e.l.y - 14, 0xffd060, 2);
        }
        // Scrap, copper, coal and oil are routine: small words, a soft chime. A part or a core is the find.
        const find = e.l.kind === 'part' || e.l.kind === 'core';
        this.floater(e.l.x, e.l.y - 20, what, e.l.kind === 'part' ? '#9ff6ff' : e.l.kind === 'oil' ? '#f4e2bc' : e.l.kind === 'copper' ? '#e09a62' : '#ffd98a', find ? 1400 : 900, pickupSize(e.l.kind));
        this.sfx(e.l.kind === 'oil' ? 'heal' : 'pickup', e.l.x, e.l.y, { gain: find ? 0.8 : 0.5 });
        fx.burst(e.l.x, e.l.y - 10, { color: e.l.kind === 'part' ? 0x3df2ff : 0xffb640, size: find ? 0.5 : 0.3 });
        const v = this.bots.get(e.by.id);
        if (v) kick(v.sq, 0.12);
        break;
      }
      case 'mine': {
        // A pickaxe beat: chips and a spark, the seam jolts; his own shakes the camera a hair, a robot's is quieter.
        const hand = e.by.role === 'controller', q = hand ? 1 : 0.55;
        this.sfx('rock', e.seam.x, e.seam.y, { gain: 0.6 * q, vary: 0.2 });
        fx.burst(e.seam.x + Phaser.Math.Between(-10, 10), e.seam.y - 4, { color: 0x8a8278, size: 0.45 * q });
        fx.burst(e.seam.x + Phaser.Math.Between(-6, 6), e.seam.y - 10, { color: 0xffc060, size: 0.2 * q });
        this.struck.set(e.seam.id, this.scene.time.now);
        if (hand) this.scene.cameras.main.shake(60, 0.0012, true);
        break;
      }
      case 'coal': {
        // Lumps pop out of the seam and roll to the miner's feet; the last one in is the "+N coal" (the coal is banked already).
        const q = e.by.role === 'controller' ? 1 : 0.6;
        for (let i = 0; i < e.n; i++) {
          const lump = this.scene.add.image(e.seam.x + Phaser.Math.Between(-8, 8), e.seam.y, 'scrapgob').setTint(0x2a2622).setScale(1.1 / S).setDepth(e.seam.y + 6);
          const x0 = lump.x, y0 = lump.y, x1 = e.by.x + Phaser.Math.Between(-9, 9), y1 = e.by.y + 8, spin = Phaser.Math.FloatBetween(-7, 7);
          const prog = { p: 0 };
          this.scene.tweens.add({
            targets: prog, p: 1, duration: 420 + i * 90, ease: 'Sine.easeOut',
            onUpdate: () => lump.setPosition(x0 + (x1 - x0) * prog.p, y0 + (y1 - y0) * prog.p - 26 * 4 * prog.p * (1 - prog.p)).setRotation(spin * prog.p).setDepth(y0 + (y1 - y0) * prog.p + 6),
            onComplete: () => {
              lump.destroy();
              if (i < e.n - 1) return;
              this.floater(x1, y1 - 30, `+${e.n} coal`, '#cfc7bc', 900, 15);
              this.sfx('pickup', x1, y1, { gain: 0.5 * q });
              fx.burst(x1, y1 - 6, { color: 0x6a625a, size: 0.3 * q });
            },
          });
        }
        break;
      }
      case 'seamBare': {
        // The last hit: it caves in, a burst of dust and a deep crunch.
        const hand = e.by.role === 'controller', q = hand ? 1 : 0.7;
        fx.burst(e.seam.x, e.seam.y - 6, { color: 0x9a9084, size: 0.8 * q });
        fx.burst(e.seam.x, e.seam.y + 4, { color: 0x6e665c, size: 0.55 * q });
        this.sfx('crunch', e.seam.x, e.seam.y, { gain: 0.9 * q });
        if (hand) this.scene.cameras.main.shake(180, 0.004, true);
        this.caved.set(e.seam.id, this.scene.time.now);
        break;
      }
      case 'tap':
        // The well mends whoever stands in it: a puff of clean steam and a soft chime.
        this.sfx('heal', e.s.x, e.s.y, { gain: 0.4, vary: 0.15 });
        fx.burst(e.s.x, e.s.y - 24, { color: 0xdff4ff, size: 0.8 });
        break;
    }
  }
}

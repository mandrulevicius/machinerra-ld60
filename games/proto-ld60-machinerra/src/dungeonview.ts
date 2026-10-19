/**
 * The rooms' rules on screen (`sim/dungeon.ts` decides; this draws): Flooded's water over the floor, the trap room's
 * zones (a telegraph, then the burst), the lever and the gate across its shortcut, Echoing's ripple where a noise was made
 * and the "!" over the foes that heard it, dust and shakes for ambushes. `Play` makes one when it runs as the `Dungeon` scene and hands
 * it the sim's `dungeon` events; the lamps and the ambient light (Dark) stay in `Play.draw`.
 */
import Phaser from 'phaser';
import { LIFT_SCALE, S, liftFoot } from './art';
import { T } from './sim/defs';
import { ECHO, trapPhase, type DungeonEvent } from './sim/dungeon';
import { Ter } from './sim/mapgen';
import type { Hornet, Sim } from './sim/sim';
import { DANGER, DANGER_HOT, LINE } from './house';

export interface DungeonViewApi {
  scene: Phaser.Scene;
  sim: Sim;
  /** The dungeon scene's DOM layer. */
  ui: HTMLElement;
  sfx(key: string, x?: number, y?: number, o?: { gain?: number }): void;
  burst(x: number, y: number, o: { color: number; size: number }): void;
  shake(size: 'small' | 'big'): void;
  floater(x: number, y: number, text: string, color: string, ms?: number, size?: number): void;
  banner(text: string, ms?: number): void;
  /** A prop standing on the ground (`Play.place`), and how far the lift has risen (px). */
  place(key: string, x: number, footY: number, scale?: number): Phaser.GameObjects.Image;
  rise(): number;
  /** A shadow on the ground under a piece centred on its image (`shadowview.ts`). */
  shade(img: Phaser.GameObjects.Image): void;
}

export class DungeonView {
  private readonly run;
  private readonly gate: Phaser.GameObjects.Image | null = null;
  private readonly lever: Phaser.GameObjects.Image | null = null;
  /** The den's wall plug, and the platform in its niche once it is broken. */
  private wall: Phaser.GameObjects.Image | null = null;
  private exitLift: Phaser.GameObjects.Image | null = null;
  /** Echoing: the ripples going out from where a noise was made, and the foes that heard it (a "!" over them) until `until` (scene ms). */
  private ripples: { x: number; y: number; at: number }[] = [];
  private heard = new Map<number, { h: Hornet; until: number }>();

  constructor(private readonly api: DungeonViewApi) {
    const { scene, sim } = api;
    const run = (this.run = sim.run!);
    const d = run.d;
    // Flooded: water over every floor tile, shimmering.
    if (run.wet) {
      const key = `dungeon-water-${d.map.seed}`;
      if (!scene.textures.exists(key)) {
        const k = 4, tex = scene.textures.createCanvas(key, (d.map.w * T) / k, (d.map.h * T) / k)!;
        const c = tex.getContext();
        c.fillStyle = 'rgba(64, 128, 168, 0.5)';
        for (let y = 0; y < d.map.h; y++) for (let x = 0; x < d.map.w; x++) if (d.paintMap.ter[y * d.map.w + x] !== Ter.Rock) c.fillRect(x * (T / k), y * (T / k), T / k, T / k);
        c.strokeStyle = 'rgba(190, 230, 255, 0.28)';
        c.lineWidth = 1;
        for (let y = 0; y < d.map.h * 4; y += 3)
          for (let x = 0; x < d.map.w * 4; x += 7) {
            if (d.paintMap.ter[Math.floor(y / 4) * d.map.w + Math.floor(x / 4)] === Ter.Rock || (x * 31 + y * 17) % 5) continue;
            c.beginPath();
            c.moveTo(x * 2, y * 2);
            c.lineTo(x * 2 + 5, y * 2);
            c.stroke();
          }
        tex.refresh();
      }
      const water = scene.add.image(0, 0, key).setOrigin(0).setScale(4).setDepth(-9.6);
      scene.tweens.add({ targets: water, alpha: 0.7, duration: 1800, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
    // The den's wall: a plug of stone drawn over the niche in its east wall (the Sim has rock there until it is broken).
    const e = d.exit;
    this.wall = scene.add.image((e.x + e.w / 2) * T, (e.y + e.h / 2) * T, 'dungeon-wall').setScale(1 / S).setDepth((e.y + e.h) * T);
    // The lever's gate, drawn over the tunnel it plugs; the lever on its room's wall.
    if (d.gate && d.lever) {
      const g = d.gate, tall = g.h > g.w;
      this.gate = scene.add.image((g.x + g.w / 2) * T, (g.y + g.h / 2) * T, tall ? 'dungeon-gate-v' : 'dungeon-gate-h').setScale(1 / S).setDepth((g.y + g.h) * T);
      this.lever = scene.add.image((d.lever.x + 0.5) * T, (d.lever.y + 1) * T, 'dungeon-lever-0').setScale(1 / S).setDepth((d.lever.y + 1) * T);
      api.shade(this.gate);
      api.shade(this.lever);
    }
  }

  /** Draw one frame: the trap's zones, the lever's prompt, Echoing's ripples. `g` is the scene's cleared graphics layer. */
  update(g: Phaser.GameObjects.Graphics, now: number) {
    const { run } = this;
    const d = run.d;
    // The cracked wall breathes a warm outline so the eye goes to it; once open, the gap's lift is marked and rises with the haul.
    if (run.wall === 'cracked') {
      const w = run.wallAt();
      g.lineStyle(LINE.effect, 0xffd98a, 0.35 + 0.3 * Math.sin(now / 170)).strokeRect(w.x - w.hw - 3, w.y - w.hh - 3, w.hw * 2 + 6, w.hh * 2 + 6);
    }
    if (this.exitLift) this.exitLift.y = run.wallAt().y + liftFoot('dungeon-shaft') - this.api.rise();
    if (d.trap) {
      const H = run.hazard, ph = trapPhase(H, run.trapT);
      const c = ((run.trapT % H.period) + H.period) % H.period, warnAt = H.period - H.warn - H.burst;
      for (const z of d.trap.zones) {
        const x = (z.x + 0.5) * T, y = (z.y + 0.5) * T, r = H.radius * T;
        // A vent in the floor, always; the warning swells a ring and a wash to the zone's size; the burst fills it. A hazard is red: the kit's colour (steam white, tide blue) is only the burst's core.
        g.fillStyle(0x0c0a08, 0.5).fillEllipse(x, y, 26, 15);
        g.lineStyle(LINE.effect, DANGER_HOT, 0.3).strokeEllipse(x, y, 30, 18);
        if (ph === 'warn') {
          const p = Math.min(1, (c - warnAt) / H.warn), blink = 0.5 + 0.5 * Math.sin(now / 70);
          g.fillStyle(DANGER, 0.1 + 0.18 * p * blink).fillEllipse(x, y, r * 2 * (0.4 + 0.6 * p), r * 1.5 * (0.4 + 0.6 * p));
          g.lineStyle(LINE.effect, DANGER, 0.5 + 0.4 * blink).strokeEllipse(x, y, r * 2, r * 1.5);
        } else if (ph === 'burst') {
          g.fillStyle(DANGER_HOT, 0.45).fillEllipse(x, y, r * 2, r * 1.5);
          g.fillStyle(H.color, 0.45).fillEllipse(x, y, r * 1.5, r * 1.1);
          g.fillStyle(0xffffff, 0.4).fillEllipse(x, y, r * 1.2 + Math.sin(now / 40) * 8, r * 0.9);
        }
      }
    }
    // The lever: a prompt beside it while the gate is shut.
    if (this.lever && run.lever === 'shut') {
      const c = this.api.sim.controller, l = d.lever!;
      if (Math.hypot(c.x - (l.x + 0.5) * T, c.y - (l.y + 0.5) * T) < 3.2 * T) g.lineStyle(LINE.effect, 0xffd98a, 0.4 + 0.3 * Math.sin(now / 160)).strokeCircle((l.x + 0.5) * T, (l.y + 0.5) * T, 22);
    }
    // Echoing: rings widening from where a noise was made, and a "!" over each foe that heard it, bobbing until it gets there.
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i], k = (now - r.at) / 900;
      if (k >= 1) {
        this.ripples.splice(i, 1);
        continue;
      }
      g.lineStyle(LINE.effect, 0xbfe4ff, 0.7 * (1 - k)).strokeCircle(r.x, r.y, 20 + 200 * k);
      g.lineStyle(LINE.detail, 0xffffff, 0.5 * (1 - k)).strokeCircle(r.x, r.y, 10 + 140 * k);
    }
    for (const [id, o] of this.heard) {
      if (now >= o.until || o.h.dead || o.h.target) {
        this.heard.delete(id);
        continue;
      }
      const x = o.h.x, y = o.h.y - 48 - 3 * Math.sin(now / 120 + id);
      g.fillStyle(0x1d1a17, 0.85).fillCircle(x, y - 5, 9);
      g.fillStyle(0xffd98a, 1).fillRect(x - 1.5, y - 12, 3, 8).fillCircle(x, y - 0.5, 1.8);
    }
  }

  event(e: DungeonEvent) {
    const { api, run } = this;
    const d = run.d;
    switch (e.what) {
      case 'ambush':
        api.burst(e.x!, e.y!, { color: 0xb0a090, size: 1.4 });
        api.sfx('thump', e.x, e.y, { gain: 0.8 });
        api.shake('small');
        break;
      case 'trapWarn':
        api.sfx('hiss', undefined, undefined, { gain: 0.4 });
        break;
      case 'trapBurst':
        for (const z of d.trap!.zones) api.burst((z.x + 0.5) * T, (z.y + 0.5) * T, { color: run.hazard.color, size: 1.2 });
        api.sfx('hiss', (d.trap!.zones[0].x + 0.5) * T, (d.trap!.zones[0].y + 0.5) * T, { gain: 0.8 });
        break;
      case 'lever':
        this.lever?.setTexture('dungeon-lever-1');
        api.sfx('creak', e.x, e.y, { gain: 0.9 });
        api.sfx('thump', e.x, e.y, { gain: 0.8 });
        api.shake('small');
        if (this.gate) {
          const gate = this.gate;
          api.burst(gate.x, gate.y, { color: 0xb0a090, size: 1.6 });
          api.scene.tweens.add({ targets: gate, scaleY: gate.scaleY * 0.05, scaleX: gate.scaleX * 0.05, alpha: 0, duration: 900, ease: 'quad.in', onComplete: () => gate.destroy() });
        }
        break;
      case 'echo':
        this.ripples.push({ x: e.x!, y: e.y!, at: api.scene.time.now });
        for (const h of e.heard ?? []) this.heard.set(h.id, { h, until: api.scene.time.now + 2400 });
        api.sfx('creak', e.x, e.y, { gain: 0.5 });
        break;
      case 'cracked': {
        // The boss's fall splits the wall: dust, a shake, a groan, and the crack lit.
        this.wall?.setTexture('dungeon-wall-cracked');
        api.burst(e.x!, e.y!, { color: 0xb0a090, size: 1.8 });
        api.sfx('thump', e.x, e.y, { gain: 0.9 });
        api.shake('big');
        break;
      }
      case 'wallHit':
        api.burst(e.x!, e.y!, { color: 0xb0a090, size: 0.9 });
        api.sfx('thump', e.x, e.y, { gain: 0.6 });
        api.shake('small');
        if (this.wall) api.scene.tweens.add({ targets: this.wall, x: this.wall.x + 2, duration: 40, yoyo: true, repeat: 2 });
        break;
      case 'wallBreak': {
        api.burst(e.x!, e.y!, { color: 0xb0a090, size: 2.4 });
        api.sfx('creak', e.x, e.y, { gain: 0.9 });
        api.sfx('thump', e.x, e.y, { gain: 1 });
        api.shake('big');
        const wall = this.wall;
        this.wall = null;
        if (wall) api.scene.tweens.add({ targets: wall, scaleY: wall.scaleY * 0.05, scaleX: wall.scaleX * 0.05, alpha: 0, duration: 600, ease: 'quad.in', onComplete: () => wall.destroy() });
        this.exitLift = api.place('dungeon-shaft', e.x!, e.y! + liftFoot('dungeon-shaft'), LIFT_SCALE).setDepth(-4);
        break;
      }
      case 'insight':
        api.floater(e.x!, e.y! - 40, '+1 insight', '#9ff6ff', 3200, 20);
        api.sfx('unlock', e.x, e.y, { gain: 0.6 });
        break;
    }
  }

  /** The scene is shutting down. */
  destroy() {
    this.ripples.length = 0;
    this.heard.clear();
  }
}

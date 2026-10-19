/**
 * How P36's places look and feel in a mission (rules in `sim/placebehave.ts`, art in `placeart36.ts`); `places.ts` takes
 * them into `VIEWS`. Same contract as there: a factory returning `{ update, event? }`. Feedback scales with the moment: the
 * strike, the shell and the Scripture read big; the hornets' graveyard stays quiet.
 */
import Phaser from 'phaser';
import { S } from './art';
import { DANGER_TEXT, LINE } from './house';
import type { PlayHost } from './playhost';
import { BATTERY, EXPEDITION, LIGHTHOUSE, T } from './sim/defs';
import type { PlaceRT } from './sim/placeplay';
import { PLACES, type PartKind, type PlaceId } from './sim/places';
import type { SimEvent } from './sim/sim';

type G = Phaser.GameObjects.Graphics;
type PlaceEvent = Extract<SimEvent, { e: 'place' }>;
export interface PlaceView36 {
  update(dt: number, g: G): void;
  event?(e: PlaceEvent): void;
}
/** The hold ring (`places.ts` hands its own in, so both draw the same one). */
export type HoldRing = (g: G, x: number, y: number, f: number, now: number, paused?: boolean) => void;

const partsOf = (p: PlaceRT, kind: PartKind) => p.parts.filter((q) => q.kind === kind);
const part = (p: PlaceRT, kind: PartKind) => p.parts.find((q) => q.kind === kind)!;

/** Stand a sprite on its feet (`foot` px below the part's point) and hand it to the culler. */
const stand = (api: PlayHost, key: string, x: number, y: number, foot = 8, scale = 1) => api.w.cull.add(api.place(key, x, y + foot, scale));

/** The name floats up the first time he comes near, with a sound. */
function visit(api: PlayHost, p: PlaceRT, e: PlaceEvent, color: string, sfx = 'blip') {
  if (e.what !== 'visit') return false;
  api.floater(p.x, p.y - 110, PLACES[p.id].name, color, 3600, 22);
  api.sfx(sfx, undefined, undefined, { gain: 0.35, vary: 0 });
  return true;
}

/** The place's hold ring, where its action is, while one runs. */
function ring(api: PlayHost, p: PlaceRT, g: G, hold: HoldRing, at: { x: number; y: number }) {
  const h = api.sim.hold;
  if (h?.id === p.id) hold(g, at.x, at.y + 4, h.t / Math.max(0.001, h.need), api.scene.time.now, h.paused);
}

// ---------------------------------------------------------------- 2: Where Hornets Go

function hornetRest(api: PlayHost, p: PlaceRT): PlaceView36 {
  const { scene, k, sim } = api;
  const s = part(p, 'stump');
  stand(api, 'hornet-stump', s.x, s.y, 6);
  partsOf(p, 'carcass').forEach((q, i) => stand(api, 'hornet-carcass', q.x, q.y, 4).setFlipX(i % 2 === 1));
  const lamp = k.lights.add(s.x, s.y - 70, { color: 0xcfe8f0, radius: 120, intensity: 0.15 });
  return {
    update() {
      lamp.setIntensity((0.12 + 0.25 * api.night()) * (0.9 + 0.1 * Math.sin(scene.time.now / 900)));
    },
    event(e) {
      if (visit(api, p, e, '#cfe8f0', 'bell')) return;
      if (e.what === 'settle') k.fx.burst(e.x, e.y + 4, { color: 0xdec48c, size: 0.4 });
      if (e.what === 'wing') {
        k.fx.burst(e.x, e.y - 4, { color: 0xd6ecf0, size: 0.5 });
        if (Math.hypot(sim.controller.x - e.x, sim.controller.y - e.y) < 10 * T) api.sfx('pickup', e.x, e.y, { gain: 0.25, vary: 0.2 });
      }
      if (e.what === 'mourn') {
        api.floater(e.x, e.y - 60, 'The mourners', DANGER_TEXT, 2600, 20);
        api.sfx('twist', e.x, e.y, { gain: 0.8 });
      }
    },
  };
}

// ---------------------------------------------------------------- 3: the Strike Lanes

function lanes(api: PlayHost, p: PlaceRT): PlaceView36 {
  const { scene, k } = api;
  for (const q of partsOf(p, 'foul')) api.w.cull.add(scene.add.image(q.x, q.y, 'lane-foul').setScale(1 / S).setDepth(-7));
  const b = part(p, 'board');
  stand(api, 'lane-board', b.x, b.y, 10);
  const n = partsOf(p, 'foul').length;
  const digits = Array.from({ length: n }, (_, i) =>
    api.w.cull.add(k.text(b.x - 26 + i * 14 + 6, b.y - 46, '-', { size: 13, font: 'display' }).setOrigin(0.5).setColor('#ffd98a').setDepth(b.y + 11)),
  );
  const neon = k.lights.add(b.x, b.y - 60, { color: 0xff9ad0, radius: 120, intensity: 0.3 });
  return {
    update() {
      const now = scene.time.now;
      const flick = Math.sin(now / 80) * Math.sin(now / 31) > -0.3 ? 1 : 0.25;
      neon.setIntensity((0.2 + 0.4 * api.night()) * flick);
      digits.forEach((d, i) => {
        const v = p.v[`score${i}`];
        const t = v === undefined ? '-' : v >= 10 ? 'X' : String(v);
        if (d.text !== t) d.setText(t);
        d.setAlpha(flick > 0.5 ? 1 : 0.6);
      });
    },
    event(e) {
      if (visit(api, p, e, '#ff9ad0', 'horn')) return;
      if (e.what === 'roll') {
        api.floater(b.x, b.y - 90, e.n === 0 ? 'Gutter' : `${e.n} pin${e.n === 1 ? '' : 's'}`, '#ffd98a', 2200, 20);
        api.sfx('click', b.x, b.y, { gain: 0.7 });
      }
      if (e.what === 'strike') {
        api.banner('STRIKE', 2600);
        api.flash(b.x, b.y - 40, 0xff9ad0, 2.2);
        api.sfx('unlock', b.x, b.y, { gain: 0.8 });
        k.juice.shake('medium');
        for (let i = 0; i < 6; i++) scene.time.delayedCall(i * 80, () => k.fx.burst(b.x + Phaser.Math.Between(-30, 30), b.y - 50, { color: i % 2 ? 0xff9ad0 : 0xffd98a, size: 0.8 }));
      }
    },
  };
}

// ---------------------------------------------------------------- 4: the Lost Expedition

function expedition(api: PlayHost, p: PlaceRT, hold: HoldRing): PlaceView36 {
  const { scene, k } = api;
  const f = part(p, 'fire');
  const pit = stand(api, 'fire-pit', f.x, f.y, 6);
  const glow = k.lights.add(f.x, f.y - 16, { color: 0xffa040, radius: EXPEDITION.light * T, intensity: 0 });
  let sparkT = 0;
  return {
    update(dt, g) {
      ring(api, p, g, hold, f);
      if (!p.v.lit) return;
      const now = scene.time.now;
      glow.setIntensity((0.8 + 0.6 * api.night()) * (0.85 + 0.1 * Math.sin(now / 70) + 0.05 * Math.sin(now / 23)));
      sparkT -= dt;
      if (sparkT <= 0) {
        sparkT = Phaser.Math.FloatBetween(0.15, 0.4);
        k.fx.burst(f.x + Phaser.Math.Between(-6, 6), f.y - 22, { color: 0xffc070, size: 0.25 });
      }
    },
    event(e) {
      if (visit(api, p, e, '#ffd9a0')) return;
      if (e.what === 'lit') {
        pit.setTexture(api.dress('fire-pit-lit'));
        api.flash(f.x, f.y - 16, 0xffa040, 2);
        api.sfx('hiss', f.x, f.y, { gain: 0.8 });
        k.fx.burst(f.x, f.y - 18, { color: 0xffa040, size: 1.2 });
      }
      if (e.what === 'home') api.banner(`${e.n} of the expedition: home`, 3200);
    },
  };
}

// ---------------------------------------------------------------- 13: the Lighthouse

function lighthouse(api: PlayHost, p: PlaceRT, hold: HoldRing): PlaceView36 {
  const { scene, k } = api;
  const t = part(p, 'lighthouse');
  stand(api, 'lighthouse', t.x, t.y, 12);
  partsOf(p, 'buoy').forEach((q) => stand(api, 'buoy', q.x, q.y, 6));
  const top = { x: t.x, y: t.y + 12 - 210 };
  const lamp = k.lights.add(top.x, top.y, { color: 0xffe0a0, radius: 140, intensity: 0 });
  const spot = k.lights.add(t.x, t.y, { color: 0xfff0c0, radius: 150, intensity: 0 });
  return {
    update(_dt, g) {
      ring(api, p, g, hold, t);
      const lit = p.state === 'lit';
      lamp.setIntensity(lit ? 1.2 + 0.2 * Math.sin(scene.time.now / 120) : 0);
      if (!lit) return spot.setIntensity(0);
      // The beam on the ground: a long pale wedge from the tower's foot, and its light where it falls.
      const a = p.v.a ?? 0, len = LIGHTHOUSE.len, h = LIGHTHOUSE.half;
      const c = Math.cos(a), s = Math.sin(a);
      const night = api.night();
      g.fillStyle(0xfff0c0, 0.08 + 0.14 * night);
      g.fillTriangle(t.x - s * 6, t.y + c * 6, t.x + c * len - s * h * 2.4, t.y + s * len + c * h * 2.4, t.x + c * len + s * h * 2.4, t.y + s * len - c * h * 2.4);
      g.lineStyle(LINE.detail, 0xfff0c0, 0.12 + 0.2 * night).lineBetween(t.x, t.y, t.x + c * len, t.y + s * len);
      spot.setPosition(t.x + c * 260, t.y + s * 260).setIntensity(0.6 + 0.8 * night);
    },
    event(e) {
      if (visit(api, p, e, '#ffe0a0', 'horn')) return;
      if (e.what === 'lit') {
        api.flash(top.x, top.y, 0xffe0a0, 2.4);
        api.sfx('horn', t.x, t.y, { gain: 0.6 });
        api.banner('The lighthouse burns', 2600);
        k.juice.shake('small');
      }
      if (e.what === 'out') api.sfx('hiss', t.x, t.y, { gain: 0.6 });
    },
  };
}

// ---------------------------------------------------------------- 14: the Dinner Bell

function bell(api: PlayHost, p: PlaceRT, hold: HoldRing): PlaceView36 {
  const { scene, k } = api;
  const b = part(p, 'bell');
  const frame = stand(api, 'bell-frame', b.x, b.y, 10);
  partsOf(p, 'pew').forEach((q) => stand(api, 'pew', q.x, q.y, 6));
  partsOf(p, 'donation').forEach((q) => stand(api, 'donation-box', q.x, q.y, 6));
  return {
    update(_dt, g) {
      ring(api, p, g, hold, b);
    },
    event(e) {
      if (visit(api, p, e, '#f0cf7a', 'bell')) return;
      if (e.what !== 'toll') return;
      scene.tweens.add({ targets: frame, angle: { from: -4, to: 0 }, duration: 600, ease: 'Elastic.easeOut' });
      api.sfx('bell', b.x, b.y, { gain: 1, vary: 0 });
      scene.time.delayedCall(900, () => api.sfx('bell', b.x, b.y, { gain: 0.5, vary: 0 }));
      api.floater(b.x, b.y - 110, `Toll ${e.n}`, DANGER_TEXT, 2600, 24);
      api.wash('#b040ff');
      k.juice.shake('medium');
    },
  };
}

// ---------------------------------------------------------------- 16: the Old Battery

function battery(api: PlayHost, p: PlaceRT, hold: HoldRing): PlaceView36 {
  const { scene, k, sim } = api;
  const gn = part(p, 'gun');
  stand(api, 'gun-base', gn.x, gn.y, 10);
  const barrel = api.w.cull.add(scene.add.image(gn.x, gn.y - 4, 'gun-barrel').setOrigin(0.18, 0.5).setScale(1 / S).setDepth(gn.y + 11));
  partsOf(p, 'depot').forEach((q) => stand(api, 'shell-depot', q.x, q.y, 10));
  let flight: { t: number; x0: number; y0: number; x1: number; y1: number } | null = null;
  return {
    update(dt, g) {
      ring(api, p, g, hold, gn);
      const a = p.v.a ?? 0;
      // Seen from above at a slant: the barrel's length shortens as it points up or down the screen.
      barrel.setRotation(Math.atan2(Math.sin(a) * 0.7, Math.cos(a))).setScale((1 / S) * (0.75 + 0.25 * Math.abs(Math.cos(a))), 1 / S);
      const c = sim.controller;
      if (p.v.loaded && Math.hypot(c.x - gn.x, c.y - gn.y) < BATTERY.reach) {
        // Where it will land: a dashed line and a ring at the aim's distance, along the barrel.
        const r = Math.min(BATTERY.max, Math.max(BATTERY.min, Math.hypot(sim.look.x - gn.x, sim.look.y - gn.y)));
        const tx = gn.x + Math.cos(a) * r, ty = gn.y + Math.sin(a) * r;
        g.lineStyle(LINE.effect, 0xffd98a, 0.6);
        for (let d = 30; d < r; d += 24) g.lineBetween(gn.x + Math.cos(a) * d, gn.y + Math.sin(a) * d, gn.x + Math.cos(a) * Math.min(r, d + 12), gn.y + Math.sin(a) * Math.min(r, d + 12));
        g.strokeEllipse(tx, ty, BATTERY.shell.blast * 2, BATTERY.shell.blast * 1.3);
      }
      if (flight) {
        flight.t += dt / BATTERY.flight;
        const f = Math.min(1, flight.t);
        const x = flight.x0 + (flight.x1 - flight.x0) * f, y = flight.y0 + (flight.y1 - flight.y0) * f - Math.sin(f * Math.PI) * 160;
        g.fillStyle(0x3a3a30, 1).fillCircle(x, y, 5);
        g.fillStyle(0xffc070, 0.5).fillCircle(x, y, 9);
        if (f >= 1) flight = null;
      }
    },
    event(e) {
      if (visit(api, p, e, '#c8d8a0', 'horn')) return;
      if (e.what === 'load') {
        api.sfx('creak', gn.x, gn.y, { gain: 0.8 });
        api.sfx('click', gn.x, gn.y, { gain: 0.8 });
      }
      if (e.what === 'fire') {
        const a = p.v.a ?? 0;
        const mx = gn.x + Math.cos(a) * 50, my = gn.y - 4 + Math.sin(a) * 35;
        api.flash(mx, my, 0xffc070, 2.6);
        k.fx.burst(mx, my, { color: 0xf4efe6, size: 1.4 });
        api.sfx('thump', gn.x, gn.y, { gain: 1 });
        api.sfx('boom', gn.x, gn.y, { gain: 0.6 });
        k.juice.shake('big');
        scene.tweens.add({ targets: barrel, x: { from: gn.x - Math.cos(a) * 8, to: gn.x }, duration: 400, ease: 'Quad.easeOut' });
        flight = { t: 0, x0: mx, y0: my, x1: p.v.tx, y1: p.v.ty };
      }
      if (e.what === 'land') api.w.marks.stamp('world-soft', e.x, e.y + 6, { tint: 0x120c08, alpha: 0.75, scale: 2.2, kind: false });
    },
  };
}

// ---------------------------------------------------------------- 25: the First Scripture

function scripture(api: PlayHost, p: PlaceRT, hold: HoldRing): PlaceView36 {
  const { scene, k } = api;
  const s = part(p, 'sign');
  const board = stand(api, 'prop-sign', s.x, s.y, 10);
  partsOf(p, 'table').forEach((q) => stand(api, 'cafe-table', q.x, q.y, 8));
  partsOf(p, 'chair').forEach((q, i) => stand(api, 'cafe-chair', q.x, q.y, 8).setFlipX(i % 2 === 1));
  const halo = k.lights.add(s.x, s.y - 20, { color: 0xfff0c0, radius: 90, intensity: 0.25 });
  return {
    update(_dt, g) {
      ring(api, p, g, hold, s);
      halo.setIntensity(p.state === 'unread' ? 0.2 + 0.1 * Math.sin(scene.time.now / 600) : 0);
    },
    event(e) {
      if (visit(api, p, e, '#fff0c0')) return;
      if (e.what !== 'read') return;
      board.setVisible(false); // the sign is a prop now: it can be carried
      api.banner(e.text ?? '', 4200);
      api.sfx('unlock', s.x, s.y, { gain: 0.9 });
      api.sfx('bell', s.x, s.y, { gain: 0.4, vary: 0 });
      api.wash('#fff0c0');
      api.flash(s.x, s.y - 20, 0xfff0c0, 2);
      for (let i = 0; i < 5; i++) scene.time.delayedCall(i * 120, () => k.fx.burst(s.x + Phaser.Math.Between(-20, 20), s.y - 30 - i * 6, { color: 0xfff0c0, size: 0.6 }));
    },
  };
}

/** P36's views by place id (`places.ts` hands each its hold ring). */
export const VIEWS36 = (hold: HoldRing): Partial<Record<PlaceId, (api: PlayHost, p: PlaceRT) => PlaceView36>> => ({
  'hornet-rest': hornetRest,
  lanes,
  expedition: (api, p) => expedition(api, p, hold),
  lighthouse: (api, p) => lighthouse(api, p, hold),
  bell: (api, p) => bell(api, p, hold),
  battery: (api, p) => battery(api, p, hold),
  scripture: (api, p) => scripture(api, p, hold),
});

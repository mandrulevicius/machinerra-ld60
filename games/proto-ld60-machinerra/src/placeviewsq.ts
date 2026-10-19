/**
 * How the quest-only places look and feel in a mission (P42; rules in `sim/placequest.ts`, art in `placeartq.ts`); `places.ts` takes
 * them into `VIEWS`. Same contract as `placeviews36.ts`: a factory returning `{ update, event? }`. The dog itself is `companionview.ts`;
 * the stray cat lives in its place, so its sprite is drawn here.
 */
import Phaser from 'phaser';
import { S } from './art';
import type { PlayHost } from './playhost';
import { groundShadow } from './shadowview';
import type { Shadow } from '../../../harness/kit';
import type { PlaceRT } from './sim/placeplay';
import { PLACES, type PartKind, type PlaceId } from './sim/places';
import type { SimEvent } from './sim/sim';

type G = Phaser.GameObjects.Graphics;
type PlaceEvent = Extract<SimEvent, { e: 'place' }>;
export interface PlaceViewQ {
  update(dt: number, g: G): void;
  event?(e: PlaceEvent): void;
}
/** The hold ring (`places.ts` hands its own in). */
export type HoldRing = (g: G, x: number, y: number, f: number, now: number, paused?: boolean) => void;

const partsOf = (p: PlaceRT, kind: PartKind) => p.parts.filter((q) => q.kind === kind);
const part = (p: PlaceRT, kind: PartKind) => p.parts.find((q) => q.kind === kind)!;
const stand = (api: PlayHost, key: string, x: number, y: number, foot = 8, scale = 1) => api.w.cull.add(api.place(key, x, y + foot, scale));

/** The name floats up the first time he comes near, with a sound. */
function visit(api: PlayHost, p: PlaceRT, e: PlaceEvent, color: string) {
  if (e.what !== 'visit') return false;
  api.floater(p.x, p.y - 100, PLACES[p.id].name, color, 3600, 22);
  api.sfx('blip', undefined, undefined, { gain: 0.35, vary: 0 });
  return true;
}

/** The place's hold ring, where its action is, while one runs. */
function ring(api: PlayHost, p: PlaceRT, g: G, hold: HoldRing) {
  const h = api.sim.hold, a = api.sim.action;
  if (h?.id !== p.id || !a?.place) return;
  const at = a.place === p ? atOf(p, api) : p;
  hold(g, at.x, at.y + 4, h.t / Math.max(0.001, h.need), api.scene.time.now, h.paused);
}
/** Where the place's action is (the mound being dug, else the place). */
function atOf(p: PlaceRT, api: PlayHost) {
  const m = partsOf(p, 'mound');
  if (!m.length) return p;
  const c = api.sim.controller;
  return m.map((q, i) => ({ q, i })).filter(({ i }) => !p.v[`dug${i}`]).sort((a, b) => Math.hypot(a.q.x - c.x, a.q.y - c.y) - Math.hypot(b.q.x - c.x, b.q.y - c.y))[0]?.q ?? p;
}

// ---------------------------------------------------------------- the mounds (the Kennel's and the dog's)

/** A dig mound per `mound` part: a heap, a hole once dug. */
function moundSprites(api: PlayHost, p: PlaceRT) {
  const imgs = partsOf(p, 'mound').map((q) => stand(api, 'dig-mound', q.x, q.y, 6));
  return () => imgs.forEach((im, i) => {
    const key = api.dress(p.v[`dug${i}`] ? 'dig-mound-dug' : 'dig-mound');
    if (im.texture.key !== key) im.setTexture(key);
  });
}

function mounds(api: PlayHost, p: PlaceRT, hold: HoldRing): PlaceViewQ {
  const sync = moundSprites(api, p);
  return {
    update(_dt, g) {
      sync();
      ring(api, p, g, hold);
    },
    event(e) {
      visit(api, p, e, '#e0c898');
    },
  };
}

// ---------------------------------------------------------------- 5: the Kennel

function kennel(api: PlayHost, p: PlaceRT, hold: HoldRing): PlaceViewQ {
  const { scene, k } = api;
  const h = part(p, 'doghouse');
  stand(api, 'doghouse', h.x, h.y, 10);
  partsOf(p, 'bowl').forEach((q) => stand(api, 'dog-bowl', q.x, q.y, 4));
  const sync = moundSprites(api, p);
  const glow = k.lights.add(h.x, h.y + 8, { color: 0xffd98a, radius: 70, intensity: 0.2 });
  return {
    update(_dt, g) {
      sync();
      ring(api, p, g, hold);
      glow.setIntensity(p.state === 'closed' ? 0.15 + 0.1 * Math.sin(scene.time.now / 500) : 0);
    },
    event(e) {
      if (visit(api, p, e, '#ffd98a')) return;
      if (e.what !== 'free') return;
      api.sfx('woof', e.x, e.y, { gain: 1 });
      api.sfx('unlock', e.x, e.y, { gain: 0.6 });
      api.banner('The dog is out', 3200);
      api.flash(e.x, e.y + 20, 0xffd98a, 2);
      for (let i = 0; i < 4; i++) scene.time.delayedCall(i * 110, () => k.fx.burst(e.x + Phaser.Math.Between(-18, 18), e.y + 24, { color: 0xa07a4c, size: 0.8 }));
    },
  };
}

// ---------------------------------------------------------------- the stray

function stray(api: PlayHost, p: PlaceRT, hold: HoldRing): PlaceViewQ {
  const { scene } = api;
  const home = part(p, 'stray');
  let img: Phaser.GameObjects.Image | null = null;
  let shadow: Shadow | null = null;
  let last = { x: home.x, y: home.y };
  return {
    update(_dt, g) {
      const cat = p.bots[0];
      if (!cat) return; // made when he comes near
      const h = api.sim.hold;
      if (h?.id === p.id) hold(g, cat.x, cat.y + 4, h.t / Math.max(0.001, h.need), scene.time.now, h.paused); // the gob he is giving
      if (!img) {
        img = api.w.cull.add(scene.add.image(cat.x, cat.y, 'cat-sit').setScale(1 / S).setOrigin(0.5, 0.9), { mobile: true });
        shadow = groundShadow(api.w, img, { fine: true });
        last = { x: cat.x, y: cat.y };
      }
      const moved = Math.hypot(cat.x - last.x, cat.y - last.y) > 0.25;
      const dx = cat.x - last.x;
      last = { x: cat.x, y: cat.y };
      const key = moved ? `cat-walk-${Math.floor(scene.time.now / 160) % 2}` : p.state === 'tamed' && api.night() > 0.5 ? 'cat-sleep' : 'cat-sit';
      if (img.texture.key !== key) img.setTexture(key);
      if (Math.abs(dx) > 0.05) img.setFlipX(dx < 0);
      img.setPosition(cat.x, cat.y).setDepth(cat.y);
      api.w.cull.moved(img);
      if (shadow) shadow.raise = 0;
    },
    event(e) {
      visit(api, p, e, '#ffd98a');
    },
  };
}

// ---------------------------------------------------------------- the Little Compactor

function compactor(api: PlayHost, p: PlaceRT, hold: HoldRing): PlaceViewQ {
  const { scene } = api;
  const c = part(p, 'compactor');
  const bot = stand(api, 'compactor-bot', c.x, c.y, 10);
  partsOf(p, 'cube').forEach((q) => stand(api, 'cube-tower', q.x, q.y, 8));
  return {
    update(_dt, g) {
      // It rocks a little as it stacks, and stops when it has given the boot.
      bot.setAngle(p.state === 'idle' ? Math.sin(scene.time.now / 380) * 1.5 : 0);
      ring(api, p, g, hold);
    },
    event(e) {
      if (visit(api, p, e, '#e8d8a8')) return;
      if (e.what !== 'give') return;
      api.banner(e.text ?? '', 4200);
      api.sfx('unlock', e.x, e.y, { gain: 0.9 });
      api.wash('#b8e8a0');
      api.flash(e.x, e.y - 10, 0xb8e8a0, 1.6);
    },
  };
}

// ---------------------------------------------------------------- 10: the Farthest Cairn

function cairn(api: PlayHost, p: PlaceRT, hold: HoldRing): PlaceViewQ {
  const { scene } = api;
  const c = part(p, 'cairn'), f = part(p, 'flag');
  stand(api, 'cairn', c.x, c.y, 10);
  const flag = stand(api, 'cairn-flag', f.x, f.y, 6);
  flag.setAlpha(0.65).setAngle(-8);
  return {
    update(_dt, g) {
      if (p.state === 'planted') flag.setAlpha(1).setAngle(Math.sin(scene.time.now / 500) * 2);
      ring(api, p, g, hold);
    },
    event(e) {
      if (visit(api, p, e, '#e8d8a8')) return;
      if (e.what !== 'plant') return;
      api.banner('Flag planted. Every place on this land is on your map', 4200);
      api.sfx('bell', e.x, e.y, { gain: 0.5, vary: 0 });
      api.wash('#ffe8b0');
      api.flash(e.x, e.y - 20, 0xffe8b0, 1.6);
    },
  };
}

/** The views by place id (`places.ts` hands each its hold ring). */
export const VIEWSQ = (hold: HoldRing): Partial<Record<PlaceId, (api: PlayHost, p: PlaceRT) => PlaceViewQ>> => ({
  kennel: (api, p) => kennel(api, p, hold),
  mounds: (api, p) => mounds(api, p, hold),
  stray: (api, p) => stray(api, p, hold),
  compactor: (api, p) => compactor(api, p, hold),
  cairn: (api, p) => cairn(api, p, hold),
});


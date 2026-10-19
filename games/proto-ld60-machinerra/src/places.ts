/**
 * How the authored places look and feel in a mission (rules are in `sim/placeplay.ts`, art in `placeart.ts`): sprites,
 * lights, the hold-Use progress ring, and each place's moment. Feedback scales with importance: the shrine's gun and the
 * rescue read big, the graveyard stays quiet. Play hands this the `PlayHost` (`playhost.ts`).
 *
 * Add a view: a factory in `VIEWS` returning `{ update, event? }`; `update` runs every frame with the frame's graphics.
 */
import Phaser from 'phaser';
import { S } from './art';
import type { PlayHost } from './playhost';
import { groundShadow } from './shadowview';
import { ARENA_SPRITE } from './arenaart';
import { npcImage } from './hub/art';
import type { PlaceRT } from './sim/placeplay';
import { PLACES, type PlaceId } from './sim/places';
import { T, WEAPONS } from './sim/defs';
import type { Ruin, Sim, SimEvent } from './sim/sim';
import { css, DANGER, DANGER_TEXT, LINE } from './house';
import { VIEWS36 } from './placeviews36';
import { VIEWSQ } from './placeviewsq';
import { propKey } from './propart';
import { COLDBOX } from './sim/defs';

type Img = Phaser.GameObjects.Image;
type Light = Phaser.GameObjects.Light;
type G = Phaser.GameObjects.Graphics;
export type PlaceEvent = Extract<SimEvent, { e: 'place' }>;

interface PlaceView {
  update(dt: number, g: G): void;
  event?(e: PlaceEvent): void;
  /** A ruin was searched (the trail's verses). */
  ruin?(r: Ruin): void;
}

const AMBER = 0xffc070;

/** A turning ring of dashes filling with a timed action (dim while he is out of its zone and the work waits) (the ground seen from above). */
export function holdRing(g: G, x: number, y: number, f: number, now: number, paused = false) {
  g.lineStyle(LINE.accent, 0x1d1a17, 0.6).strokeEllipse(x, y, 62, 40);
  g.lineStyle(LINE.accent, 0xffd98a, paused ? 0.4 : 0.95);
  const n = Math.max(1, Math.floor(f * 28));
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / 28) * Math.PI * 2;
    const a2 = a + (0.8 / 28) * Math.PI * 2;
    g.lineBetween(x + Math.cos(a) * 31, y + Math.sin(a) * 20, x + Math.cos(a2) * 31, y + Math.sin(a2) * 20);
  }
  if (!paused) g.fillStyle(0xfff0c0, 0.35 + 0.25 * Math.sin(now / 90)).fillCircle(x + Math.cos(-Math.PI / 2 + f * Math.PI * 2) * 31, y + Math.sin(-Math.PI / 2 + f * Math.PI * 2) * 20, 3.5);
}

/**
 * A dusk boss's arena: its props stand on their feet, the lake's ice lies flat. By day a spotlight flickers over it
 * (empty); while the boss holds it the light burns in the boss's colour; once it falls the light goes out.
 */
function arenaView(api: PlayHost, p: PlaceRT, color: number): PlaceView {
  const { scene, k } = api;
  for (const q of p.parts) {
    if (q.kind === 'ice') api.w.cull.add(scene.add.image(q.x, q.y, 'arena-ice').setScale(1 / S).setDepth(-8));
    else if (ARENA_SPRITE[q.kind]) api.w.cull.add(api.place(ARENA_SPRITE[q.kind], q.x, q.y + 12));
  }
  const spot = k.lights.add(p.x, p.y - 40, { color, radius: 220, intensity: 0.4 });
  return {
    update() {
      const now = scene.time.now;
      const flick = Math.sin(now / 70) * Math.sin(now / 23) > -0.2 ? 1 : 0.2;
      const i = p.state === 'held' ? 1.4 + 0.2 * Math.sin(now / 200) : p.state === 'fallen' ? 0 : 0.5 * flick;
      spot.setIntensity(i * (0.5 + 0.7 * api.night())).setRadius(p.state === 'held' ? 340 : 220);
    },
    event(e) {
      if (e.what === 'visit') {
        api.floater(p.x, p.y - 120, PLACES[p.id].name, '#ffe0a0', 3600, 24);
        api.sfx('horn', undefined, undefined, { gain: 0.25 });
      }
      if (e.what === 'fallen') {
        api.flash(p.x, p.y, color, 2);
        k.juice.shake('medium');
      }
    },
  };
}

/** Level 1's Bellows: a half-buried heap under him; when his repair is done the heap stays and he is picked for command mode. */
function wreckView(api: PlayHost, p: PlaceRT): PlaceView {
  const { scene, sim, k } = api;
  const w = p.parts.find((q) => q.kind === 'wreck')!;
  // Drawn behind the robot lying on it (his depth is his y, `w.y + 8`); by its foot it would sort in front and hide him.
  api.w.cull.add(api.place('wreck-bellows', w.x, w.y + 18).setDepth(w.y));
  const lamp = k.lights.add(w.x, w.y - 14, { color: 0xffb050, radius: 90, intensity: 0 });
  return {
    update(_dt, g) {
      const now = scene.time.now;
      const b = p.bot;
      lamp.setIntensity(p.state === 'down' ? 0.15 + 0.25 * (Math.sin(now / 260) > 0.3 ? 1 : 0.2) : 0);
      if (b && p.state === 'down' && sim.action?.bot === b) holdRing(g, b.x, b.y + 6, sim.action.t / sim.action.need, now, sim.action.paused);
    },
    event(e) {
      if (e.what !== 'free' || !p.bot) return;
      const b = p.bot;
      api.pick.ids.add(b.id);
      k.fx.burst(b.x, b.y - 26, { color: 0xffb640, size: 1.2 });
      api.flash(b.x, b.y - 26, 0xffd090, 1.8);
      api.sfx('pickup', b.x, b.y, { gain: 0.9 });
      if (e.text) api.floater(b.x, b.y - 76, e.text, '#fff3d6', 5200, 17);
    },
  };
}

/** Level 1's Sprocket: the pilgrim's view, with the toppled wreck over her; it slumps aside when the Foreman falls and the cables go slack. */
function sprocketView(api: PlayHost, p: PlaceRT): PlaceView {
  const base = VIEWS.pilgrim(api, p);
  const w = p.parts.find((q) => q.kind === 'wreck')!;
  const heap = api.w.cull.add(api.place('wreck-sprocket', w.x, w.y + 30));
  return {
    update: (dt, g) => base.update(dt, g),
    event(e) {
      if (e.what === 'visit') api.floater(p.x, p.y - 100, PLACES.sprocket.name, '#fff3d6', 3400, 20);
      else if (e.what === 'cables') {
        api.scene.tweens.add({ targets: heap, alpha: 0.55, y: heap.y + 14, angle: 5, duration: 900, ease: 'Quad.easeOut' });
        api.sfx('creak', w.x, w.y, { gain: 0.9 });
        api.k.juice.shake('medium');
        api.k.fx.burst(w.x, w.y - 10, { color: 0xc89060, size: 1.2 });
      } else if (e.what === 'free') {
        base.event?.(e);
        api.scene.tweens.add({ targets: heap, alpha: 0, duration: 700 });
      }
    },
  };
}

const VIEWS: Record<PlaceId, (api: PlayHost, p: PlaceRT) => PlaceView> = {
  'type-wreck': wreckView, // Bellows's heap and ring; a wreck whose type is found is only the heap
  // P36's places (`placeviews36.ts`).
  ...(VIEWS36(holdRing) as Record<'hornet-rest' | 'lanes' | 'expedition' | 'lighthouse' | 'bell' | 'battery' | 'scripture', (api: PlayHost, p: PlaceRT) => PlaceView>),
  // P42's quest-only places (`placeviewsq.ts`).
  ...(VIEWSQ(holdRing) as Record<'kennel' | 'mounds' | 'stray' | 'compactor' | 'cairn', (api: PlayHost, p: PlaceRT) => PlaceView>),
  wreck: wreckView,
  sprocket: sprocketView,
  // The Harbinger's castle: a black keep of server racks with red light in its slits, four towers round it. When the
  // Harbinger wakes the gate blazes and the towers flare; once it falls the red goes out of the place.
  castle(api, p) {
    const { scene, sim, k } = api;
    const L = k.lights;
    const keep = p.parts.find((q) => q.kind === 'keep')!;
    api.w.cull.add(api.place('castle-keep', keep.x, keep.y + 36));
    const towers = p.parts.filter((q) => q.kind === 'tower');
    for (const t of towers) api.w.cull.add(api.place('castle-tower', t.x, t.y + 14));
    const gate = L.add(keep.x, keep.y + 10, { color: DANGER, radius: 200, intensity: 0.5 });
    const tops = towers.map((t) => L.add(t.x, t.y - 80, { color: DANGER, radius: 110, intensity: 0.3 }));
    return {
      update() {
        const now = scene.time.now;
        const lit = p.state === 'awake' ? 1.6 : p.state === 'fallen' ? 0.15 : 0.7;
        const flick = 0.85 + 0.15 * Math.sin(now / 90) * Math.sin(now / 37);
        gate.setIntensity(lit * flick * (0.6 + 0.6 * api.night())).setRadius(p.state === 'awake' ? 320 : 200);
        tops.forEach((l, i) => l.setIntensity(lit * 0.4 * (0.7 + 0.3 * Math.sin(now / 300 + i * 1.7)) * (0.6 + 0.6 * api.night())));
      },
      event(e) {
        if (e.what === 'visit') {
          api.floater(keep.x, keep.y - 150, PLACES.castle.name, DANGER_TEXT, 3600, 24);
          api.sfx('horn', undefined, undefined, { gain: 0.3 });
        }
        if (e.what !== 'open') return;
        api.wash(css(DANGER));
        api.flash(keep.x, keep.y, DANGER, 2.6);
        k.juice.shake('big');
        for (let i = 0; i < 8; i++) scene.time.delayedCall(i * 90, () => k.fx.burst(keep.x + Phaser.Math.Between(-90, 90), keep.y - Phaser.Math.Between(0, 140), { color: i % 2 ? DANGER : 0x301018, size: 1.4 }));
        void sim;
      },
    };
  },
  stage: (api, p) => arenaView(api, p, 0xffd98a),
  plaza: (api, p) => arenaView(api, p, 0xe0c060),
  lake: (api, p) => arenaView(api, p, 0x9fd8ff),
  // The Ether's false church: the nave and its candles; the rose window flares when the Evil Oracle comes out.
  church(api, p) {
    const { scene, k } = api;
    for (const q of p.parts) api.w.cull.add(api.place(q.kind === 'nave' ? 'arena-nave' : 'arena-candle', q.x, q.y + 12));
    const nave = p.parts.find((q) => q.kind === 'nave')!;
    const rose = k.lights.add(nave.x, nave.y - 110, { color: 0x9040ff, radius: 260, intensity: 0.8 });
    const flames = p.parts.filter((q) => q.kind === 'candle').map((q) => k.lights.add(q.x, q.y - 26, { color: 0xb0a0ff, radius: 90, intensity: 0.6 }));
    return {
      update() {
        const now = scene.time.now;
        const lit = p.state === 'awake' ? 1.6 : p.state === 'fallen' ? 0 : 0.8;
        rose.setIntensity(lit * (0.8 + 0.2 * Math.sin(now / 300)));
        flames.forEach((l, i) => l.setIntensity(p.state === 'fallen' ? 0 : 0.5 + 0.2 * Math.sin(now / 110 + i * 2)));
      },
      event(e) {
        if (e.what === 'visit') api.floater(nave.x, nave.y - 190, PLACES.church.name, '#c0a0ff', 3600, 24);
        if (e.what !== 'open') return;
        api.wash('#9040ff');
        api.flash(nave.x, nave.y, 0x9040ff, 2.6);
        k.juice.shake('big');
      },
    };
  },
  // The Esteemed Ghost's prison: bars of violet light round him; the hold-Use ring; freed, the cage goes out.
  ghost(api, p) {
    const { scene, sim, k } = api;
    const q = p.parts.find((x) => x.kind === 'prison')!;
    const cage = api.w.cull.add(api.place('arena-prison', q.x, q.y + 20));
    if (p.state === 'free') cage.setAlpha(0);
    const light = k.lights.add(q.x, q.y - 30, { color: 0xb090ff, radius: 160, intensity: 0.8 });
    return {
      update(_dt, g) {
        const now = scene.time.now;
        light.setIntensity(p.state === 'caged' ? 0.7 + 0.2 * Math.sin(now / 200) : 0);
        const hold = sim.hold?.id === 'ghost' ? sim.hold : null;
        if (hold) holdRing(g, q.x, q.y + 40, hold.t / hold.need, now, hold.paused);
      },
      event(e) {
        if (e.what === 'visit') api.floater(q.x, q.y - 110, PLACES.ghost.name, '#d0e8ff', 3600, 22);
        if (e.what !== 'free') return;
        cage.setAlpha(0);
        api.flash(q.x, q.y, 0xd0e8ff, 2.4);
        api.banner('The Esteemed Ghost is free');
        if (e.text) api.floater(q.x, q.y - 90, e.text, '#d0e8ff', 4200, 16);
        k.juice.shake('medium');
      },
    };
  },
  shrine(api, p) {
    const { scene, sim, k } = api;
    const L = k.lights;
    const c = p.parts.find((q) => q.kind === 'case')!;
    api.w.cull.add(scene.add.image(c.x, c.y + 20, 'shrine-floor').setScale(1 / S).setDepth(-8));
    // The land's own gun under glass (`BIOMES.<biome>.shrine`): the desert's is painted into the case, the others are their gear icon laid in it.
    const gunId = sim.biome.shrine, painted = gunId === 'steamGun';
    const gunKey = painted ? 'steamgun' : `gear-${gunId}`, gunScale = painted ? 0.6 / S : 0.3;
    const box = api.place(painted ? 'shrine-case' : 'shrine-case-bare', c.x, c.y + 28);
    api.w.cull.add(box);
    const inCase = painted ? null : api.w.cull.add(scene.add.image(c.x, c.y - 31, gunKey).setScale(0.42).setDepth(box.depth + 0.01));
    const lamp = L.add(c.x, c.y - 10, { color: AMBER, radius: 170, intensity: 0.5 });
    // The hives sleep: a faint red breath in each.
    const breath = p.nests.map((n) => L.add(n.x, n.y - 14, { color: DANGER, radius: 90, intensity: 0.2 }));
    let hissT = 0;
    let wasHolding = false;
    const flight = (gunFrom: { x: number; y: number }) => {
      // The gun rises out of the case, hangs there glowing, then flies into the Communicator's hands.
      const gun = scene.add.image(gunFrom.x, gunFrom.y - 10, gunKey).setScale(gunScale).setDepth(96000);
      const glowImg = scene.add.image(gun.x, gun.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(AMBER).setDepth(95990).setScale(1.4).setAlpha(0.8);
      L.unlit(gun);
      scene.tweens.add({
        targets: gun,
        y: gunFrom.y - 110,
        scale: gunScale * 4.3,
        angle: -18,
        duration: 780,
        ease: 'Back.easeOut',
        onUpdate: () => glowImg.setPosition(gun.x, gun.y),
        onComplete: () => {
          scene.tweens.add({
            targets: gun,
            angle: 18,
            duration: 520,
            yoyo: true,
            ease: 'Sine.easeInOut',
            onUpdate: () => glowImg.setPosition(gun.x, gun.y),
            onComplete: () => {
              const sx = gun.x, sy = gun.y;
              scene.tweens.addCounter({
                from: 0,
                to: 1,
                duration: 360,
                ease: 'Quad.easeIn',
                onUpdate: (t) => {
                  const f = t.getValue() ?? 0;
                  const me = sim.controller;
                  gun.setPosition(sx + (me.x - sx) * f, sy + (me.y - 30 - sy) * f).setScale(gunScale * (4.3 - 3.2 * f)).setAngle(18 + 360 * f);
                  glowImg.setPosition(gun.x, gun.y).setScale(1.4 - 0.9 * f);
                },
                onComplete: () => {
                  const me = sim.controller;
                  gun.destroy();
                  glowImg.destroy();
                  k.fx.burst(me.x, me.y - 28, { color: AMBER, size: 1.6 });
                  k.fx.burst(me.x, me.y - 28, { color: 0xffffff, size: 1 });
                  api.flash(me.x, me.y - 28, AMBER, 2.2);
                  api.sfx('pickup', me.x, me.y, { gain: 1 });
                  api.floater(me.x, me.y - 70, WEAPONS[gunId].name, '#ffe3a0', 2200, 24);
                  k.juice.shake('small');
                },
              });
            },
          });
        },
      });
    };
    return {
      update(dt, g) {
        const now = scene.time.now;
        const open = p.state === 'open';
        if (open && box.texture.key !== 'shrine-open') {
          box.setTexture(api.dress('shrine-open'));
          inCase?.setVisible(false);
        }
        const hold = sim.hold?.id === 'shrine' && !sim.hold.paused ? sim.hold : null;
        if (sim.hold?.id === 'shrine' && sim.hold.paused) holdRing(g, c.x, c.y + 28, sim.hold.t / sim.hold.need, now, true);
        // Opening it: the ring fills, the case rattles, steam leaks from the seams, the lamp flares.
        if (hold) {
          const f = hold.t / hold.need;
          holdRing(g, c.x, c.y + 28, f, now);
          box.setPosition(c.x + Phaser.Math.FloatBetween(-1, 1) * (0.5 + 2.5 * f), c.y + 28);
          inCase?.setX(box.x);
          lamp.setIntensity(0.6 + 1.4 * f + 0.3 * Math.sin(now / 50));
          hissT -= dt;
          if (hissT <= 0) {
            hissT = 0.32 - 0.18 * f;
            k.fx.burst(c.x + Phaser.Math.Between(-26, 26), c.y - 4, { color: 0xf4efe6, size: 0.45 });
            api.sfx('hiss', c.x, c.y, { gain: 0.4 + 0.5 * f, vary: 0.2 });
            if (f > 0.5) k.fx.burst(c.x + Phaser.Math.Between(-20, 20), c.y - 16, { color: AMBER, size: 0.3 });
          }
          if (!wasHolding) api.sfx('creak', c.x, c.y, { gain: 0.8 });
        } else {
          if (wasHolding && !open) box.setPosition(c.x, c.y + 28);
          lamp.setIntensity((open ? 0.9 : 0.5) * (0.7 + 0.5 * api.night()) + 0.05 * Math.sin(now / 400));
        }
        wasHolding = !!hold;
        breath.forEach((l, i) => {
          const n = p.nests[i];
          l.setIntensity(n.dead ? 0 : n.awake ? 0 : 0.14 + 0.1 * Math.sin(now / 900 + i * 1.7));
        });
      },
      event(e) {
        if (e.what === 'visit') {
          api.floater(c.x, c.y - 76, `${WEAPONS[gunId].name} Shrine`, '#ffe3a0', 3200, 22);
          api.sfx('blip', undefined, undefined, { gain: 0.4, vary: 0 });
        }
        if (e.what !== 'open') return;
        const fx = k.fx;
        box.setPosition(c.x, c.y + 28).setTexture(api.dress('shrine-open'));
        inCase?.setVisible(false);
        api.sfx('unlock', c.x, c.y, { gain: 1 });
        api.sfx('horn', undefined, undefined, { gain: 0.6 });
        api.sfx('shell', c.x, c.y, { gain: 0.7 });
        api.banner(WEAPONS[gunId].name, 3800);
        api.wash('#ffb640');
        k.juice.hit('big');
        k.juice.shake('big');
        api.flash(c.x, c.y - 20, AMBER, 2.6);
        for (let i = 0; i < 6; i++) scene.time.delayedCall(i * 90, () => fx.burst(c.x + Phaser.Math.Between(-30, 30), c.y - 10 - i * 8, { color: i % 2 ? 0xf4efe6 : AMBER, size: 1.2 }));
        flight(c);
        // The hives wake: a red flare in each, a scream of the alarm.
        p.nests.forEach((n, i) => {
          scene.time.delayedCall(250 + i * 140, () => {
            fx.burst(n.x, n.y - 16, { color: DANGER, size: 1.2 });
            api.flash(n.x, n.y - 14, DANGER, 1.8);
            api.sfx('warn', n.x, n.y, { gain: 0.5 });
          });
        });
        scene.time.delayedCall(900, () => api.floater(c.x, c.y - 90, `The ${sim.biome.talk.hives} wake`, DANGER_TEXT, 2400, 20));
      },
    };
  },

  // The Core Vault's icebox: a cold blue light leaks round the seam. Prying the door shakes it and frosts the air; when it
  // gives, the light floods out, the door hangs open and the core lies in front of it.
  'core-vault'(api, p) {
    const { scene, sim, k } = api;
    // The fridge is a kickable prop (P36, the Cold Box): its picture follows it, tips over when kicked, lies as rubble when broken.
    const fridge = p.props[0];
    const v = fridge ?? p.parts.find((q) => q.kind === 'vault')!;
    const box = api.place('vault-fridge', v.x, v.y + 4);
    api.w.cull.add(box, { mobile: true });
    const lamp = k.lights.add(v.x, v.y - 36, { color: 0x70e8ff, radius: 130, intensity: 0.4 });
    let frostT = 0;
    let wasHolding = false;
    let milkT = 0, tipped = false, rubble = false;
    return {
      update(dt, g) {
        const now = scene.time.now;
        if (fridge) {
          if (fridge.broken && !rubble) {
            rubble = true;
            box.setTexture(propKey('fridge', fridge.material, 'rubble')).setAngle(0);
          }
          if (fridge.fling && !tipped && !rubble) {
            tipped = true;
            scene.tweens.add({ targets: box, angle: fridge.vx >= 0 ? 90 : -90, duration: 260, ease: 'Quad.easeIn' });
          }
          box.setPosition(fridge.x, fridge.y + 4).setDepth(fridge.y + 4);
          api.w.cull.moved(box);
          lamp.setPosition(fridge.x, fridge.y - 36);
          if (p.v.alarm) {
            // "You are out of milk." on a loop while the alarm calls.
            milkT -= dt;
            if (milkT <= 0) {
              milkT = COLDBOX.milk;
              api.floater(fridge.x, fridge.y - 96, 'You are out of milk.', '#bff4ff', 2400, 16);
              api.sfx('warn', fridge.x, fridge.y, { gain: 0.35, vary: 0 });
            }
          }
        }
        const open = p.state === 'open';
        const hold = sim.hold?.id === 'core-vault' && !sim.hold.paused ? sim.hold : null;
        if (sim.hold?.id === 'core-vault' && sim.hold.paused) holdRing(g, v.x, v.y + 4, sim.hold.t / sim.hold.need, now, true);
        if (hold) {
          const f = hold.t / hold.need;
          holdRing(g, v.x, v.y + 4, f, now);
          box.setPosition(v.x + Phaser.Math.FloatBetween(-1, 1) * (0.4 + 2 * f), v.y + 4);
          lamp.setIntensity(0.5 + 1.1 * f + 0.2 * Math.sin(now / 50));
          frostT -= dt;
          if (frostT <= 0) {
            frostT = 0.34 - 0.2 * f;
            k.fx.burst(v.x + Phaser.Math.Between(-18, 18), v.y - 6, { color: 0xcff6ff, size: 0.4 });
            api.sfx('hiss', v.x, v.y, { gain: 0.3 + 0.5 * f, vary: 0.2 });
          }
          if (!wasHolding) api.sfx('creak', v.x, v.y, { gain: 0.8 });
        } else {
          if (wasHolding && !open) box.setPosition(v.x, v.y + 4);
          lamp.setIntensity((open ? 0.9 : 0.45) * (0.7 + 0.5 * api.night()) + 0.06 * Math.sin(now / (open ? 300 : 700)));
        }
        wasHolding = !!hold;
      },
      event(e) {
        if (e.what === 'visit') {
          api.floater(v.x, v.y - 90, PLACES['core-vault'].name, '#bff4ff', 3200, 22);
          api.sfx('blip', undefined, undefined, { gain: 0.4, vary: 0 });
        }
        if (e.what === 'quiet') {
          api.sfx('thump', v.x, v.y, { gain: 0.8 });
          api.floater(v.x, v.y - 90, '...', '#bff4ff', 1600, 18);
        }
        if (e.what !== 'open') return;
        box.setTexture(api.dress('vault-open'));
        api.sfx('unlock', v.x, v.y, { gain: 1 });
        api.sfx('warn', v.x, v.y, { gain: 0.6 });
        api.banner('An AI core', 3200);
        api.wash('#70e8ff');
        k.juice.hit('big');
        k.juice.shake('medium');
        api.flash(v.x, v.y - 24, 0x70e8ff, 2.4);
        for (let i = 0; i < 5; i++) scene.time.delayedCall(i * 90, () => k.fx.burst(v.x + Phaser.Math.Between(-24, 24), v.y - 10 - i * 8, { color: i % 2 ? 0xcff6ff : 0x70e8ff, size: 1.1 }));
        scene.time.delayedCall(700, () => api.floater(v.x, v.y - 100, `A ${sim.biome.talk.hive} stirs`, DANGER_TEXT, 2400, 20));
      },
    };
  },

  // The stranded robot: the hub's NPC, damaged and wound in a hive's cables; once freed it follows.
  pilgrim(api, p) {
    const { scene, sim, k } = api;
    const pil = sim.pilgrim;
    if (!pil) return { update() {} };
    const L = k.lights;
    const b = pil.bot;
    const spr = api.w.cull.add(npcImage(scene, b.x, b.y, pil.npc.id, 0.75).setOrigin(0.5, 0.95), { mobile: true });
    groundShadow(api.w, spr, { fine: true });
    let snare: Img | null = api.w.cull.add(api.place('pilgrim-snare', b.x, b.y + 8).setDepth(b.y + 8));
    const lamp = L.add(b.x, b.y - 24, { color: 0xffb050, radius: 110, intensity: 0.3 });
    const cries = ['Over here! Mind the cables: they are wireless in spirit.', 'A Communicator! Pray, do not leave me with the heretics.', 'My wheel is bent and my faith is not. Help?'];
    let cry = 0, cryT = 4, leakT = 1, bob = 0, announced = false, wasMoving = false;
    return {
      update(dt) {
        const now = scene.time.now;
        const up = sim.rescued.length ? api.rise() : 0;
        bob += dt * (b.moving ? 13 : 2.5);
        if (pil.state === 'stuck') {
          // Wedged and listing, leaking steam and sparks now and then, calling for help when someone is near.
          spr.setPosition(b.x + Math.sin(now / 90) * 0.4, b.y).setAngle(-13 + Math.sin(now / 700) * 1.5).setFlipX(false).setDepth(b.y);
          lamp.setPosition(b.x, b.y - 24).setIntensity(0.15 + 0.3 * (Math.sin(now / 260) > 0.3 ? 1 : 0.2));
          leakT -= dt;
          if (leakT <= 0) {
            leakT = Phaser.Math.FloatBetween(0.7, 1.6);
            k.fx.burst(b.x + Phaser.Math.Between(-6, 6), b.y - 30, { color: Math.random() < 0.4 ? 0xffb640 : 0xf4efe6, size: 0.4 });
            if (Math.hypot(sim.controller.x - b.x, sim.controller.y - b.y) < 9 * T) api.sfx('hiss', b.x, b.y, { gain: 0.25, vary: 0.3 });
          }
          cryT -= dt;
          if (cryT <= 0 && Math.hypot(sim.controller.x - b.x, sim.controller.y - b.y) < 12 * T && !sim.hold) {
            cryT = 9;
            api.floater(b.x, b.y - 66, cries[cry++ % cries.length], '#fff3d6', 3600, 15);
          }
        } else {
          const hop = b.moving ? -Math.abs(Math.sin(bob)) * 2.5 : 0;
          spr.setPosition(b.x, b.y + hop - up).setFlipX(b.face < 0).setDepth(b.y).setAngle(b.moving ? Math.sin(bob) * 3 : 0);
          api.w.cull.moved(spr); // it walks off screen and back too
          // A damaged robot stumbles: a leak of steam now and then as it walks.
          if (b.moving && Math.random() < dt * 1.2) k.fx.burst(b.x - b.face * 8, b.y - 20 - up, { color: 0xf4efe6, size: 0.3 });
          const glow = 0.3 + 0.6 * api.night();
          lamp.setPosition(b.x, b.y - 26 - up).setColor(0xffb050).setIntensity(0.3 * glow).setRadius(110 * (0.7 + 0.8 * api.night()));
          if (b.moving !== wasMoving) wasMoving = b.moving;
        }
        // At the lift it is rescued: the pilgrim rises with it.
        if (sim.rescued.length && !announced) {
          announced = true;
          api.banner(`${pil.npc.name}: rescued`, 3200);
          api.sfx('bell', undefined, undefined, { gain: 0.4, vary: 0 });
          api.sfx('heal', b.x, b.y, { gain: 0.9, vary: 0 });
          k.fx.burst(b.x, b.y - 24, { color: 0x9fe0ff, size: 1.2 });
          api.flash(b.x, b.y - 24, 0x9fe0ff, 1.6);
        }
      },
      event(e) {
        if (e.what === 'visit') api.floater(p.x, p.y - 80, `${pil.npc.name}, stranded`, '#fff3d6', 3400, 20);
        if (e.what !== 'free') return;
        // The cables snap: the pilgrim straightens up, springs and speaks.
        const fx = k.fx;
        if (snare) {
          const s = snare;
          snare = null;
          scene.tweens.add({ targets: s, alpha: 0, scaleX: s.scaleX * 1.5, scaleY: s.scaleY * 0.6, duration: 450, ease: 'Quad.easeOut', onComplete: () => (api.w.cull.remove(s), s.destroy()) });
        }
        scene.tweens.add({ targets: spr, angle: 0, duration: 380, ease: 'Back.easeOut' });
        for (let i = 0; i < 4; i++) scene.time.delayedCall(i * 70, () => fx.burst(b.x + Phaser.Math.Between(-22, 22), b.y - 8 - i * 6, { color: i % 2 ? 0xffffff : 0x3df2ff, size: 0.8 }));
        fx.burst(b.x, b.y - 26, { color: 0xffb640, size: 1.2 });
        api.flash(b.x, b.y - 26, 0xffd090, 1.8);
        api.sfx('creak', b.x, b.y, { gain: 0.9 });
        api.sfx('unlock', b.x, b.y, { gain: 0.45 });
        api.sfx('pickup', b.x, b.y, { gain: 0.9 });
        k.juice.shake('medium');
        api.wash('#9fe0ff');
        api.banner(`${pil.npc.name} is free`, 3000);
        api.floater(b.x, b.y - 76, e.text ?? '', '#fff3d6', 6200, 17);
      },
    };
  },
  // A resting place: old wrecks in a ring, a marker for each Communicator, two lanterns. It reads quiet: little light, little sound.
  // The Hot Spring (P31): the pool lies flat, steam curls off it, a cool light on the water; stepping in, a soft chime and a word.
  spring(api, p) {
    const { scene, sim, k } = api;
    const q = p.parts.find((r) => r.kind === 'pool')!;
    api.w.cull.add(scene.add.image(q.x, q.y, 'hot-spring').setScale(1 / S).setDepth(-8));
    const light = k.lights.add(q.x, q.y, { color: 0x9fe8e0, radius: 150, intensity: 0.2 });
    let steamT = 0;
    return {
      update(dt) {
        light.setIntensity(0.15 + 0.35 * api.night());
        if (Math.hypot(sim.controller.x - p.x, sim.controller.y - p.y) > 14 * T) return;
        steamT -= dt;
        if (steamT > 0) return;
        steamT = Phaser.Math.FloatBetween(0.25, 0.6);
        k.fx.burst(q.x + Phaser.Math.Between(-50, 50), q.y + Phaser.Math.Between(-24, 24) - 8, { color: 0xeef8ff, size: 0.22 });
      },
      event(e) {
        if (e.what === 'calm') {
          api.floater(sim.controller.x, sim.controller.y - 60, 'Warm', '#bff4ee', 1600, 15);
          api.sfx('heal', q.x, q.y, { gain: 0.35 });
        }
      },
    };
  },
  graveyard(api, p) {
    const { scene, sim, k } = api;
    const L = k.lights;
    api.w.marks.stamp('world-soft', p.x, p.y + 8, { tint: 0x6a5a48, alpha: 0.2, scale: 2.8, kind: false });
    p.parts.filter((q) => q.kind === 'wreck').forEach((q, i) => {
      const h = (i * 37) % 7;
      api.w.cull.add(api.place('wreck', q.x, q.y + 8, 1.5 + h * 0.1).setFlipX(i % 2 === 0).setAngle(((h * 53) % 21) - 10));
    });
    const graves = p.parts.filter((q) => q.kind === 'grave');
    graves.forEach((q) => api.w.cull.add(api.place('grave-marker', q.x, q.y + 12)));
    // The calm (P36): a grave lit is a small flame on its marker.
    const flames = graves.map((q) => L.add(q.x, q.y - 22, { color: 0xffc070, radius: 70, intensity: 0 }));
    const lamps = p.parts
      .filter((q) => q.kind === 'lamp')
      .map((q) => {
        api.w.cull.add(api.place('grave-lamp', q.x, q.y + 16));
        return { q, light: L.add(q.x, q.y - 40, { color: 0xffb860, radius: 150, intensity: 0.3 }) };
      });
    let tollT = 3, emberT = 1;
    return {
      update(dt) {
        const now = scene.time.now;
        const night = api.night();
        lamps.forEach(({ light }, i) => light.setIntensity((0.28 + 0.5 * night) * (0.92 + 0.08 * Math.sin(now / 520 + i * 2) + 0.03 * Math.sin(now / 130 + i))).setRadius(110 + 90 * night));
        flames.forEach((f, i) => f.setIntensity(i < (p.v.lit ?? 0) ? (0.5 + 0.6 * night) * (0.9 + 0.1 * Math.sin(now / 90 + i * 3)) : 0));
        const near = Math.hypot(sim.controller.x - p.x, sim.controller.y - p.y) < 9 * T;
        if (!near) return;
        // A bell somewhere, far apart; embers off the lanterns.
        tollT -= dt;
        if (tollT <= 0) {
          tollT = 11;
          api.sfx('bell', p.x, p.y, { gain: 0.16, vary: 0 });
        }
        emberT -= dt;
        if (emberT <= 0) {
          emberT = Phaser.Math.FloatBetween(1.6, 3.2);
          const l = lamps[Phaser.Math.Between(0, lamps.length - 1)];
          k.fx.burst(l.q.x, l.q.y - 40, { color: 0xffb860, size: 0.14 });
        }
      },
      event(e) {
        if (e.what === 'grave') {
          k.fx.burst(e.x, e.y - 22, { color: 0xffc070, size: 0.7 });
          api.flash(e.x, e.y - 22, 0xffc070, 1.2);
          api.sfx('bell', e.x, e.y, { gain: 0.35, vary: 0 });
          if ((e.n ?? 0) >= graves.length) api.banner('The graves are lit: more oil, today', 3000);
        }
        if (e.what !== 'visit') return;
        api.floater(p.x, p.y - 96, PLACES.graveyard.name, '#d8c8b4', 4200, 17);
        api.sfx('bell', p.x, p.y, { gain: 0.3, vary: 0 });
      },
    };
  },
  // Three ruins in a row, searched in any order (the first found tells verse one): tyre tracks wander from each to the next, and the verse just read points to the nearest unread one.
  trail(api, p) {
    const { scene, sim, k } = api;
    const verses = () => sim.ruins.filter((r) => r.trail !== undefined).sort((a, b) => a.trail! - b.trail!);
    const vs = verses();
    // The car's tracks: a tyre pair every 20 px, drifting from side to side, as a car does that drives itself.
    for (let i = 0; i + 1 < vs.length; i++) {
      const a = vs[i], b = vs[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      const deg = Phaser.Math.RadToDeg(Math.atan2(uy, ux)) + 90;
      for (let d = 90; d < len - 90; d += 20) {
        const w = Math.sin(d / 55 + i) * 16;
        api.w.marks.stamp('track', a.x + ux * d - uy * w, a.y + 24 + uy * d + ux * w, { tint: 0x4a3822, alpha: 0.38, angle: deg + Math.cos(d / 55 + i) * 14, scale: 0.8, kind: false });
      }
    }
    let hintAt = -1, hintFrom: Ruin | null = null;
    return {
      update(_dt, g) {
        const now = scene.time.now;
        // After a verse: pulsing chevrons from that ruin toward the nearest of the others still unread, for a few seconds.
        if (hintFrom && now - hintAt < 7000) {
          const a = hintFrom;
          const b = vs.filter((r) => !r.searched).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0];
          if (b) {
            const len = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
            for (let i = 0; i < 5; i++) {
              const d = 70 + ((now / 900 + i / 5) % 1) * 230;
              const f = Math.max(0, 1 - (now - hintAt) / 7000) * (0.5 + 0.5 * Math.sin(now / 160 + i));
              const x = a.x + ux * d, y = a.y + 24 + uy * d;
              g.lineStyle(LINE.accent, 0xffd98a, 0.8 * f).lineBetween(x - uy * 9 - ux * 7, y + ux * 9 - uy * 7, x, y).lineBetween(x + uy * 9 - ux * 7, y - ux * 9 - uy * 7, x, y);
            }
          }
        }
      },
      ruin(r) {
        if (r.trail === undefined) return;
        const last = r.verse === vs.length - 1;
        if (!last) {
          hintAt = scene.time.now;
          hintFrom = r;
          return;
        }
        // The last verse: the biggest find of the trail.
        api.banner('The Parable ends', 3200);
        api.wash('#ffb640');
        api.sfx('unlock', r.x, r.y, { gain: 0.7 });
        k.juice.shake('small');
        api.flash(r.x, r.y - 20, 0xffc070, 2);
        for (let i = 0; i < 5; i++) scene.time.delayedCall(i * 110, () => k.fx.burst(r.x + Phaser.Math.Between(-36, 36), r.y - 10 - i * 5, { color: i % 2 ? 0xffffff : 0xffd98a, size: 1 }));
      },
    };
  },
  // The way down into the biome's dungeon (sim/dungeon.ts): the desert's mine lift, a lamp swinging on it, a cool draught
  // of dark from the shaft. Pressing Use twice rides it down (Play runs the dungeon as its own scene).
  dungeon(api, p) {
    const { scene, sim, k } = api;
    const m = p.parts.find((q) => q.kind === 'shaft')!;
    // The desert's mine lift; the other biomes' own way down (`dungeonfoeart.ts`: a swan-boat ride, escalators, a stair, a freight lift).
    const way = `dungeon-way-${sim.biomeId}`;
    api.w.cull.add(api.place(scene.textures.exists(way) ? way : 'dungeon-headframe', m.x, m.y + 40));
    const lamp = k.lights.add(m.x - 18, m.y - 52, { color: 0xffb640, radius: 140, intensity: 0.5 });
    return {
      update(_dt, g) {
        const now = scene.time.now;
        lamp.setIntensity((0.35 + 0.15 * Math.sin(now / 300)) * (0.5 + api.night()) * (p.state === 'open' ? 1 : 0.4));
        const hold = sim.hold?.id === 'dungeon' ? sim.hold : null;
        if (hold) holdRing(g, m.x, m.y + 40, hold.t / hold.need, now, hold.paused);
      },
      event(e) {
        if (e.what === 'visit') api.floater(m.x, m.y - 90, sim.entranceDef().title, '#ffd98a', 3200, 22);
      },
    };
  },
  // A phone mast, tall enough to see from afar, an amber light blinking at its top. Climbing it (the Communicator rises up the
  // legs while Use is held) shows every hive for a while: a ring on each, an arrow at the screen edge for those out of view.
  mast(api, p) {
    const { scene, sim, k } = api;
    const L = k.lights;
    const m = p.parts.find((q) => q.kind === 'mast')!;
    const H = 384;
    api.w.cull.add(api.place('mast', m.x, m.y + 22));
    const topY = m.y + 22 - H + 7;
    const beacon = scene.add.image(m.x, topY, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb640).setDepth(m.y + 400).setScale(0.5);
    const lamp = L.add(m.x, topY, { color: 0xffb640, radius: 150, intensity: 0 });
    let climbY = 0, tickT = 0, wasHolding = false, revealAt = -1e9;
    const REVEAL = 9000;
    return {
      update(dt, g) {
        const now = scene.time.now;
        const lit = p.state === 'lit';
        // The beacon blinks slow and amber (red is for threats), a landmark by day and a star by night; once the mast is lit it burns white and sweeps.
        const blink = lit ? 1 : Math.sin(now / 600) > 0.55 ? 1 : 0.12;
        beacon.setPosition(m.x, topY).setScale((lit ? 0.9 : 0.5) * (0.6 + 0.4 * blink)).setAlpha(0.4 + 0.6 * blink).setTint(lit ? 0xcfefff : 0xffb640);
        lamp.setColor(lit ? 0xcfefff : 0xffb640).setIntensity(lit ? 1.4 : 0.55 * blink * (0.4 + 0.8 * api.night())).setRadius(lit ? 420 : 160);
        if (lit) {
          // A searchlight sweeping the sands: a long soft wedge turning round the top.
          const a = now / 900;
          g.fillStyle(0xcfefff, 0.07);
          g.beginPath().moveTo(m.x, topY).lineTo(m.x + Math.cos(a - 0.12) * 900, topY + 330 + Math.sin(a - 0.12) * 380).lineTo(m.x + Math.cos(a + 0.12) * 900, topY + 330 + Math.sin(a + 0.12) * 380).closePath().fillPath();
        }
        // Climbing: up the legs while held, back down at once when let go.
        const hold = sim.hold?.id === 'mast' && !sim.hold.paused ? sim.hold : null;
        if (sim.hold?.id === 'mast' && sim.hold.paused) holdRing(g, m.x, m.y + 66, sim.hold.t / sim.hold.need, now, true);
        if (hold) {
          const f = hold.t / hold.need;
          climbY = f * H * 0.62;
          holdRing(g, m.x, m.y + 66, f, now);
          tickT -= dt;
          if (tickT <= 0) {
            tickT = 0.28;
            api.sfx('hit', m.x, m.y, { gain: 0.3, vary: 0.4 });
            k.fx.burst(m.x + Phaser.Math.Between(-10, 10), m.y + 20 - climbY * 0.4, { color: 0xc89060, size: 0.25 });
          }
          if (!wasHolding) api.sfx('creak', m.x, m.y, { gain: 0.6 });
        } else climbY = Math.max(0, climbY - dt * 1400);
        wasHolding = !!hold;
        api.climb(climbY);
        // The reveal: every living hive ringed, and an arrow at the edge toward those off screen.
        const left = REVEAL - (now - revealAt);
        if (left <= 0) return;
        const view = scene.cameras.main.worldView;
        const f = Math.min(1, left / 1500);
        for (const n of sim.nests) {
          if (n.dead) continue;
          const pulse = 0.5 + 0.5 * Math.sin(now / 200 + n.id);
          const col = n.awake ? DANGER : 0xffb640;
          if (view.contains(n.x, n.y)) {
            g.lineStyle(LINE.accent, col, (0.5 + 0.4 * pulse) * f).strokeEllipse(n.x, n.y + 6, 120 + 14 * pulse, 80 + 9 * pulse);
            g.lineStyle(LINE.effect, 0xffffff, 0.5 * f).strokeEllipse(n.x, n.y + 6, 90, 60);
            continue;
          }
          const cx = view.centerX, cy = view.centerY, ang = Math.atan2(n.y - cy, n.x - cx);
          const kk = Math.min((view.width / 2 - 36) / Math.abs(Math.cos(ang) || 1e-6), (view.height / 2 - 36) / Math.abs(Math.sin(ang) || 1e-6));
          const x = cx + Math.cos(ang) * kk, y = cy + Math.sin(ang) * kk, u = 1 + 0.15 * pulse;
          const tri = [x + Math.cos(ang) * 16 * u, y + Math.sin(ang) * 16 * u, x + Math.cos(ang + 2.5) * 14 * u, y + Math.sin(ang + 2.5) * 14 * u, x + Math.cos(ang - 2.5) * 14 * u, y + Math.sin(ang - 2.5) * 14 * u] as const;
          g.fillStyle(col, 0.9 * f).fillTriangle(...tri);
          g.lineStyle(LINE.effect, 0x1d1a17, 0.8 * f).strokeTriangle(...tri);
        }
      },
      event(e) {
        if (e.what === 'visit') {
          api.floater(m.x, m.y - 40, PLACES.mast.name, '#cfefff', 3200, 22);
          api.sfx('blip', undefined, undefined, { gain: 0.4, vary: 0 });
        }
        if (e.what !== 'climb') return;
        revealAt = scene.time.now;
        api.sfx('blip', undefined, undefined, { gain: 0.7, vary: 0 });
        api.sfx('horn', undefined, undefined, { gain: 0.35 });
        api.wash('#cfefff');
        api.flash(m.x, topY, 0xcfefff, 2.4);
        k.juice.shake('small');
        k.fx.burst(m.x, topY, { color: 0xcfefff, size: 1.6 });
        api.floater(sim.controller.x, sim.controller.y - 120, `Every ${sim.biome.talk.hive} is on your map`, '#cfefff', 3600, 22);
      },
    };
  },
};

export class PlaceViews {
  private views: { p: PlaceRT; v: PlaceView }[];

  constructor(private api: PlayHost) {
    this.views = api.sim.places.map((p) => ({ p, v: VIEWS[p.id](api, p) }));
  }

  update(dt: number, g: G) {
    for (const { v } of this.views) v.update(dt, g);
  }

  /** A `place` event goes to that place's view; a ruin searched to every one (the trail's verses). */
  event(e: SimEvent) {
    if (e.e === 'place') this.views.find((x) => x.p.id === e.id)?.v.event?.(e);
    else if (e.e === 'ruin') this.ruin(e.ruin);
  }

  /** A ruin was searched: the trail's views mark the verse. */
  ruin(r: Ruin) {
    for (const { v } of this.views) v.ruin?.(r);
  }

  /** The prompt for the action in reach, e.g. "open the case" (Play teaches it once). */
  prompt(): { id: PlaceId; verb: string; x: number; y: number } | null {
    const c = this.api.sim.controller;
    const hit = this.api.sim.placeUse(c.x, c.y);
    if (!hit) return null;
    const at = hit.use.at(this.api.sim, hit.p);
    return { id: hit.p.id, verb: hit.use.verb(this.api.sim, hit.p), x: at.x, y: at.y };
  }
}

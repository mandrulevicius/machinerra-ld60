/**
 * The title's background (`bootGame({ titleArt })`, the kit's TitleArt): the Zeppelin Wanderer seen from above, high over
 * a desert land at dusk, its shadow on the sands far below, clouds drifting between, steam from its chimneys. Continue
 * or New game: it opens the throttle and flies out to the right (the menu fades), then the game goes on. A train of brass
 * cogs turns along the top right, meshed, and spins up for the leave.
 * Timing and placement are `ZEP` and `LEAVE`; the land is `TITLE_LAND`; the cogs are `COGS`.
 */
import Phaser from 'phaser';
import type { TitleArt } from '../../../harness/kit';
import { audioFor } from '../../../harness/kit';
import { GROUND_PX, paintGround } from './art';
import { MesaShadows, fixedLean } from './mesashadow';
import { shadeOf } from './shadowview';
import { sunLean } from './sun';
import { BIOMES } from './sim/defs';
import { generate } from './sim/mapgen';
import { makeZeppelinArt } from './hub/art';
import { makeZeppelinNear, ZEP_PX } from './hub/Ascent';
import { installSounds } from './sound';

const W = 1280, H = 720;
/** The land under the title: a fixed desert seed, so it is the same every time. */
/** The hour whose sun leans the title land's mesa shadows (a guess: a low morning sun, long shadows). */
const TITLE_HOUR = 8;
const TITLE_LAND = { seed: 7, biome: 'desert' as const, scale: 0.55, tint: 0xb4a08a };
/** Where the zeppelin hangs (screen px, its centre), its size (screen px a unit) and how far below its shadow falls. */
const ZEP = { x: 830, y: 350, unit: 0.74, shadow: { x: 150, y: 125, alpha: 0.42 }, puffEvery: 650 };
/** The leave: ms, how far right it goes, how much it grows as it climbs toward the camera. */
const LEAVE = { ms: 1900, dist: 1500, grow: 0.22 };
/** The chimneys (the two soot rings aft, zeppelinShape) in units from the texture's centre. */
const CHIMNEYS = [{ x: -200, y: -60 }, { x: -200, y: 60 }];

/**
 * The cog train, first to last: teeth (a cog's pitch radius is teeth x `COG_PITCH`, so all mesh), the direction from the
 * cog before (degrees, screen: 180 is left), the first one's centre. `spin` is the first one's rad/s; the others follow.
 */
const COG_PITCH = 7;
const COGS = { start: { x: 1236, y: 22 }, spin: 0.14, train: [{ teeth: 23, dir: 0 }, { teeth: 13, dir: 175 }, { teeth: 7, dir: 158 }, { teeth: 11, dir: 205 }] };

interface Puff { img: Phaser.GameObjects.Image; age: number; life: number; vx: number; vy: number; size: number }
interface Cloud { img: Phaser.GameObjects.Image; speed: number }

function puffTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('title-puff')) return;
  const t = scene.textures.createCanvas('title-puff', 128, 128)!;
  const c = t.getContext();
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  t.refresh();
}

/** A brass cog drawn in code: teeth round a rim, spokes with dark gaps, a hub with rivets; `title-cog-<teeth>`. */
function cogTexture(scene: Phaser.Scene, teeth: number) {
  const key = `title-cog-${teeth}`;
  if (scene.textures.exists(key)) return key;
  const R = teeth * COG_PITCH, d = 7, size = Math.ceil(2 * (R + d) + 8), o = size / 2;
  const t = scene.textures.createCanvas(key, size, size)!;
  const c = t.getContext();
  c.translate(o, o);
  const p = (Math.PI * 2) / teeth;
  c.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = i * p;
    const pts: [number, number][] = [[a - p * 0.5, R - d], [a - p * 0.28, R - d], [a - p * 0.18, R + d], [a + p * 0.18, R + d], [a + p * 0.28, R - d]];
    for (const [ang, r] of pts) c.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
  }
  c.closePath();
  const g = c.createLinearGradient(-R, -R, R, R);
  g.addColorStop(0, '#f0c470');
  g.addColorStop(0.5, '#c8963c');
  g.addColorStop(1, '#7a5422');
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = '#1d1a17';
  c.stroke();
  // Spoke gaps: dark windows between the rim and the hub.
  const spokes = teeth > 15 ? 6 : teeth > 9 ? 5 : 0;
  const rim = R - d - 12, hub = Math.max(14, R * 0.28);
  c.fillStyle = '#1d1712';
  for (let i = 0; i < spokes; i++) {
    const a0 = (i / spokes) * Math.PI * 2 + 0.22, a1 = ((i + 1) / spokes) * Math.PI * 2 - 0.22;
    c.beginPath();
    c.arc(0, 0, rim, a0, a1);
    c.arc(0, 0, hub + 8, a1 - 0.1, a0 + 0.1, true);
    c.closePath();
    c.fill();
    c.stroke();
  }
  // A worn ring inside the rim, then the hub and its rivets.
  c.strokeStyle = 'rgba(29,26,23,0.45)';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(0, 0, R - d - 5, 0, Math.PI * 2);
  c.stroke();
  const hg = c.createRadialGradient(-hub * 0.3, -hub * 0.3, 1, 0, 0, hub);
  hg.addColorStop(0, '#ffe0a0');
  hg.addColorStop(1, '#9a6a2c');
  c.fillStyle = hg;
  c.beginPath();
  c.arc(0, 0, hub, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = '#1d1a17';
  c.stroke();
  c.fillStyle = '#1d1712';
  c.beginPath();
  c.arc(0, 0, hub * 0.35, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    c.fillStyle = '#5a3c18';
    c.beginPath();
    c.arc(Math.cos(a) * hub * 0.68, Math.sin(a) * hub * 0.68, 2.4, 0, Math.PI * 2);
    c.fill();
  }
  t.refresh();
  return key;
}

/** The cog train laid out meshed: each cog's centre, start angle and spin ratio (opposite turns, speed by size). */
function cogTrain() {
  const out: { teeth: number; x: number; y: number; a: number; ratio: number }[] = [];
  for (const [i, cog] of COGS.train.entries()) {
    if (!i) {
      out.push({ teeth: cog.teeth, ...COGS.start, a: 0, ratio: 1 });
      continue;
    }
    const prev = out[i - 1], RA = prev.teeth * COG_PITCH, RB = cog.teeth * COG_PITCH;
    const phi = Phaser.Math.DegToRad(cog.dir), pA = (Math.PI * 2) / prev.teeth, pB = (Math.PI * 2) / cog.teeth;
    // A tooth of the one before at the contact point faces a gap of this one, and stays so as they turn.
    const u = Phaser.Math.Wrap(phi - prev.a, 0, pA);
    const v = -u * (RA / RB) + pB / 2;
    out.push({ teeth: cog.teeth, x: prev.x + Math.cos(phi) * (RA + RB), y: prev.y + Math.sin(phi) * (RA + RB), a: phi + Math.PI - v, ratio: -prev.ratio * (RA / RB) });
  }
  return out;
}

export const titleArt: TitleArt = {
  draw(scene) {
    makeZeppelinArt(scene);
    makeZeppelinNear(scene);
    puffTexture(scene);
    const objects: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (objects.push(o), o);

    // The land far below, dimmed to dusk; it wanders slowly under the zeppelin.
    const map = generate(TITLE_LAND.seed, undefined, undefined, TITLE_LAND.biome);
    const groundKey = paintGround(scene, map, GROUND_PX);
    const ground = add(scene.add.image(W / 2, H / 2, groundKey).setScale(GROUND_PX * TITLE_LAND.scale).setTint(TITLE_LAND.tint).setDepth(1));
    // The mesas' shadows ride over the ground (a container that follows it), dimmed with it.
    const lay = add(scene.add.container(0, 0).setDepth(1.1).setAlpha(0.75));
    const mesas = new MesaShadows(scene, groundKey, { depth: 0, tint: shadeOf(BIOMES[TITLE_LAND.biome].paint), parent: lay });
    const slack = { x: (ground.displayWidth - W) / 2, y: (ground.displayHeight - H) / 2 };
    add(scene.add.rectangle(W / 2, H / 2, W, H, 0x2a1a30, 0.2).setDepth(1.5));

    const shadow = add(scene.add.image(ZEP.x + ZEP.shadow.x, ZEP.y + ZEP.shadow.y, 'zeppelin-shadow').setScale(ZEP.unit * 0.92).setAlpha(ZEP.shadow.alpha).setDepth(2));
    // Clouds: a few low under the zeppelin, a few high over it.
    const clouds: Cloud[] = [];
    const r = new Phaser.Math.RandomDataGenerator(['machinerra-title']);
    for (let i = 0; i < 9; i++) {
      const high = i % 3 === 0;
      const img = add(scene.add.image(r.between(-200, W + 200), r.between(40, H - 40), 'title-puff')
        .setScale(r.realInRange(3.5, 6.5), r.realInRange(1.4, 2.4)).setAlpha(high ? 0.1 : 0.16).setTint(high ? 0xfbe8c0 : 0xd8c0a0).setDepth(high ? 6 : 3));
      clouds.push({ img, speed: (high ? 26 : 12) * r.realInRange(0.8, 1.3) });
    }
    const cogs = cogTrain().map((cg) => {
      const key = cogTexture(scene, cg.teeth);
      const shade = add(scene.add.image(cg.x + 10, cg.y + 12, key).setTint(0x000000).setAlpha(0.4).setDepth(7));
      const img = add(scene.add.image(cg.x, cg.y, key).setDepth(7.1));
      return { ...cg, img, shade };
    });
    let turn = 0;
    const zep = add(scene.add.image(ZEP.x, ZEP.y, 'zeppelin-near').setScale(ZEP.unit / ZEP_PX).setDepth(5));
    const puffs: Puff[] = [];
    const puff = (x: number, y: number, size: number) => {
      const img = add(scene.add.image(x, y, 'title-puff').setDepth(4).setTint(0xf4efe6).setAlpha(0));
      puffs.push({ img, age: 0, life: r.between(1600, 2400), vx: -r.between(30, 55), vy: r.between(-10, 10), size });
    };

    let t0 = 0, leaving = -1, nextPuff = 0, sound = false; // leaving: ms into the leave, summed from frame deltas (capped) so a slow frame never skips the flight
    let go: (() => void) | null = null;
    return {
      objects,
      update(time, delta, px) {
        if (!t0) t0 = time;
        const t = time - t0;
        // The land drifts in a slow loop, as if the zeppelin wandered over it.
        ground.setPosition(W / 2 + Math.sin(t * 0.00004) * slack.x * 0.8 - px * 14, H / 2 + Math.sin(t * 0.000027 + 1) * slack.y * 0.6);
        const gs = ground.scaleX;
        lay.setPosition(ground.x - ground.displayWidth / 2, ground.y - ground.displayHeight / 2).setScale(gs);
        mesas.update(new Phaser.Geom.Rectangle(-lay.x / gs, -lay.y / gs, W / gs, H / gs), fixedLean(sunLean(TITLE_HOUR)));
        // The leave: k 0..1, eased in so it gathers speed.
        if (leaving >= 0) leaving += Math.min(delta, 50);
        const k = leaving < 0 ? 0 : Math.min(1, leaving / LEAVE.ms);
        const out = k * k * k;
        const s = (ZEP.unit * (1 + LEAVE.grow * out)) / ZEP_PX;
        const zx = ZEP.x - px * 34 + out * LEAVE.dist;
        const zy = ZEP.y + Math.sin(t * 0.0011) * 6 - out * 60;
        zep.setPosition(zx, zy).setScale(s).setAngle(Math.sin(t * 0.0007) * 0.8 - out * 3);
        // The shadow stays on the ground: it moves with the zeppelin but less with the bob, and spreads and fades as it climbs.
        shadow.setPosition(zx + ZEP.shadow.x * (1 + out) + px * 20, ZEP.y + ZEP.shadow.y * (1 + out)).setAlpha(ZEP.shadow.alpha * (1 - out * 0.8));
        // The cogs turn together, faster as the zeppelin throttles up.
        turn += (COGS.spin * (1 + 10 * k) * delta) / 1000;
        for (const cg of cogs) {
          cg.img.rotation = cg.a + turn * cg.ratio;
          cg.shade.rotation = cg.img.rotation;
        }
        for (const c of clouds) {
          c.img.x -= (c.speed * (1 + 6 * out) * delta) / 1000;
          if (c.img.x < -300) c.img.x = W + 300;
        }
        // Steam from the chimneys, faster at full throttle.
        if (time >= nextPuff) {
          nextPuff = time + (leaving < 0 ? ZEP.puffEvery : 110);
          const u = s * ZEP_PX, a = Phaser.Math.DegToRad(zep.angle);
          for (const ch of CHIMNEYS) puff(zx + (ch.x * Math.cos(a) - ch.y * Math.sin(a)) * u, zy + (ch.x * Math.sin(a) + ch.y * Math.cos(a)) * u, leaving < 0 ? 0.5 : 0.8);
        }
        for (let i = puffs.length - 1; i >= 0; i--) {
          const p = puffs[i];
          p.age += delta;
          const f = p.age / p.life;
          if (f >= 1) {
            p.img.destroy();
            objects.splice(objects.indexOf(p.img), 1);
            puffs.splice(i, 1);
            continue;
          }
          p.img.x += ((p.vx * (1 + 4 * out)) * delta) / 1000;
          p.img.y += (p.vy * delta) / 1000;
          p.img.setScale(p.size * (0.4 + f * 1.4)).setAlpha(0.55 * Math.sin(Math.PI * Math.min(1, f * 1.6)) * (1 - f));
        }
        if (leaving >= 0 && !sound) {
          sound = true;
          const a = audioFor(scene.game);
          installSounds(a);
          a.sfx.play('lift', { gain: 0.55 });
        }
        if (k >= 1 && go) {
          const g = go;
          go = null;
          g();
        }
      },
      leave(next) {
        leaving = 0;
        go = next;
      },
    };
  },
};

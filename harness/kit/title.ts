/**
 * Title screen: a live "quiet place" behind a DOM menu. `bootGame` adds the `KitTitle` scene and starts it (unless the
 * game opts out); menus.ts holds what its buttons do. Slots (dev sidebar, export into `variants`):
 *   titleLayout  left | center | bottom      where the title and the menu sit
 *   titleMood    dust | fireflies | fog      the background: lights, particles, colours from the theme
 *   titleSettings left | middle               where the volume and quality sit along the bottom (every layout)
 * The background is three lit hill silhouettes drifting slowly (plus a little pointer parallax), a sky gradient, 1 to 5 real
 * lights and one cheap particle emitter. Costs rest on the lab findings (lighting.md, particles.md, performance-gpu.md):
 * lit shader path +0.5 ms, lights capped by quality.lights, ~1.4 ms per 1000 alive particles (this keeps under 60),
 * a few additive glow sprites. Everything follows quality (particles, glow, lights, shadows) and the theme.
 * A game can draw its own background instead (`bootGame({ titleArt })`, TitleArt in menu-parts.ts), with a leave
 * animation that plays before Continue and New game go.
 */
import Phaser from 'phaser';
import { kit } from './scene';
import type { LightFx } from './lights';
import { slot } from './variants';
import { theme } from './theme';
import { quality } from './state';
import {
  esc, el, focusFirst, navKeys, panelShell, audioTab, graphicsTab, controlsTab, gameInput, creditsView, savesView, tabs, sysLayer,
  volumeRamp, qualityRow, levelClick, reloadNote, redraw, type TitleArt,
} from './menu-parts';
import { TITLE_SCENE, type Menus } from './menus';
import { onEscape, toGamesList } from './escape';

export const titleLayoutSlot = slot('titleLayout', { left: 'left', center: 'center', bottom: 'bottom' });
export const titleSettingsSlot = slot('titleSettings', { left: 'left', middle: 'middle' });

interface MoodLight { x: number; y: number; radius: number; intensity: number; hue: number; roam: number }
export interface Mood {
  /** Theme effect colour (0..2) of the sky glow and the motes. */
  hue: number;
  /** How much of that colour reaches the horizon (0..1). */
  sky: number;
  lights: MoodLight[];
  motes: 'dust' | 'fireflies' | 'fog';
}
export const titleMoodSlot = slot<Mood>('titleMood', {
  // a low lamp behind the hills and a few drifting specks
  dust: { hue: 0, sky: 0.28, motes: 'dust', lights: [
    { x: 880, y: 380, radius: 640, intensity: 1.5, hue: 0, roam: 50 },
    { x: 200, y: 300, radius: 340, intensity: 0.7, hue: 1, roam: 40 },
  ] },
  // dark, with small lights wandering over the hills
  fireflies: { hue: 2, sky: 0.1, motes: 'fireflies', lights: [
    { x: 220, y: 430, radius: 210, intensity: 1.3, hue: 2, roam: 90 },
    { x: 470, y: 520, radius: 190, intensity: 1.2, hue: 0, roam: 110 },
    { x: 760, y: 450, radius: 220, intensity: 1.3, hue: 2, roam: 100 },
    { x: 980, y: 540, radius: 190, intensity: 1.2, hue: 0, roam: 90 },
    { x: 1130, y: 420, radius: 200, intensity: 1.2, hue: 2, roam: 80 },
  ] },
  // one high pale light, mist drifting through the hills
  fog: { hue: 2, sky: 0.22, motes: 'fog', lights: [
    { x: 900, y: 150, radius: 780, intensity: 1.2, hue: 2, roam: 25 },
  ] },
});

const W = 1280;
const H = 720;
const lerp = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

/** White hill silhouette: a few sines for the ridge, light at the top and darker below. Lit sprites multiply by the light. */
function hillTexture(scene: Phaser.Scene, key: string, w: number, h: number, seed: number) {
  if (scene.textures.exists(key)) return;
  const r = rng(seed);
  const waves = [[1.4, 0.5], [3.1, 0.3], [6.5, 0.14]].map(([cycles, a]) => ({ f: (cycles * Math.PI * 2) / w, a: a * h * 0.3, p: r() * 6.28 }));
  const t = scene.textures.createCanvas(key, w, h)!;
  const c = t.getContext();
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#fff');
  g.addColorStop(1, '#8a8a8a');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w; x += 6) c.lineTo(x, h * 0.34 + waves.reduce((y, v) => y + Math.sin(v.f * x + v.p) * v.a, 0));
  c.lineTo(w, h);
  c.closePath();
  c.fill();
  t.refresh();
}

function glowTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('ui-titlescreen-glow')) return;
  const t = scene.textures.createCanvas('ui-titlescreen-glow', 128, 128)!;
  const c = t.getContext();
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  t.refresh();
}

const LAYERS = [
  { key: 'ui-titlescreen-hill-far', h: 380, seed: 11, mix: 0.5, sway: 26, par: 12, speed: 0.00011, depth: 2 },
  { key: 'ui-titlescreen-hill-mid', h: 300, seed: 29, mix: 0.32, sway: 40, par: 26, speed: 0.00016, depth: 3 },
  { key: 'ui-titlescreen-hill-near', h: 220, seed: 47, mix: 0.16, sway: 56, par: 48, speed: 0.00021, depth: 4 },
];

interface Mover { obj: Phaser.GameObjects.Image; layer: (typeof LAYERS)[number]; phase: number }
interface Roamer { light: Phaser.GameObjects.Light; glow: Phaser.GameObjects.Image; def: MoodLight; phase: number }

export default class KitTitle extends Phaser.Scene {
  private root!: HTMLElement;
  private sub: HTMLElement | null = null;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private movers: Mover[] = [];
  private roamers: Roamer[] = [];
  private px = 0;
  private targetPx = 0;
  private cleanup: (() => void)[] = [];
  private L!: LightFx;
  private art: ReturnType<TitleArt['draw']> | null = null;
  private leaving = false;

  constructor() {
    super(TITLE_SCENE);
  }

  create(data: { preview?: boolean }) {
    (this.registry.get('ui') as HTMLElement).innerHTML = ''; // the game's HUD from before "Exit to title"
    const k = kit(this);
    this.L = k.lights;
    this.art = null;
    this.leaving = false;
    k.background();
    k.look();
    this.build();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => (this.targetPx = p.x / W - 0.5));
    k.onChange((what) => {
      if (what === 'titleLayout') this.root.dataset.layout = titleLayoutSlot.value;
      else if (what === 'titleSettings') this.root.dataset.settings = titleSettingsSlot.value;
      else if (what === 'titleMood' || what === 'theme' || what === 'quality') this.build();
    });
    this.menu(data?.preview === true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanup.forEach((f) => f());
      this.cleanup = [];
      this.sub?.remove();
      this.sub = null;
      this.root.remove();
      this.destroyBackground();
    });
  }

  // ---- background ----

  private build() {
    this.destroyBackground();
    const custom = (this.registry.get('kit:menus') as Menus).opts.titleArt;
    if (custom) {
      this.art = custom.draw(this);
      this.objs.push(...this.art.objects);
      return;
    }
    const th = theme();
    const mood = titleMoodSlot.value;
    const q = quality().get();
    const hue = th.fx[mood.hue];
    const L = this.L;
    glowTexture(this);

    // sky: theme background to a touch of the mood colour at the horizon
    if (this.textures.exists('ui-titlescreen-sky')) this.textures.remove('ui-titlescreen-sky');
    const sky = this.textures.createCanvas('ui-titlescreen-sky', 4, 256)!;
    const g = sky.getContext().createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, css(lerp(th.c.bg, 0x000000, 0.35)));
    g.addColorStop(0.75, css(lerp(th.c.bg, hue, mood.sky * 0.6)));
    g.addColorStop(1, css(lerp(th.c.bg, hue, mood.sky)));
    sky.getContext().fillStyle = g;
    sky.getContext().fillRect(0, 0, 4, 256);
    sky.refresh();
    this.objs.push(L.unlit(this.add.image(W / 2, H / 2, 'ui-titlescreen-sky').setDisplaySize(W, H).setDepth(0)));

    // hills, far to near
    for (const layer of LAYERS) {
      hillTexture(this, layer.key, 1800, layer.h, layer.seed);
      const img = L.lit(this.add.image(W / 2, H + 20, layer.key).setOrigin(0.5, 1).setDepth(layer.depth).setTint(lerp(th.c.bg, th.c.paper, layer.mix)));
      this.movers.push({ obj: img, layer, phase: layer.seed });
      this.objs.push(img);
    }

    // lights and their haze
    mood.lights.forEach((def, i) => {
      const color = th.fx[def.hue];
      const light = L.add(def.x, def.y, { color, radius: def.radius, intensity: def.intensity });
      const glow = this.add.image(def.x, def.y, 'ui-titlescreen-glow').setBlendMode(Phaser.BlendModes.ADD).setTint(color)
        .setScale((def.radius * 1.3) / 128).setAlpha(Math.min(0.2, 0.09 * def.intensity)).setDepth(5).setVisible(q.glow);
      this.objs.push(glow);
      this.roamers.push({ light, glow, def, phase: i * 2.1 });
      if (i === 0 && q.glow) {
        // the main light also glows behind the hills
        this.objs.push(this.add.image(def.x, def.y, 'ui-titlescreen-glow').setBlendMode(Phaser.BlendModes.ADD).setTint(color)
          .setScale((def.radius * 2.2) / 128).setAlpha(0.5).setDepth(1));
      }
    });

    // motes
    const mult = q.particles;
    const emitter = (cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth: number, warm: number) => {
      const e = this.add.particles(0, 0, 'ui-titlescreen-glow', { blendMode: 'ADD', ...cfg }).setDepth(depth);
      e.fastForward(warm);
      this.objs.push(e);
    };
    const zone = (x: number, y: number, w: number, h: number) => ({ type: 'random', source: new Phaser.Geom.Rectangle(x, y, w, h) }) as any;
    const fade = (v: number) => ({ start: 0, end: v, ease: (t: number) => Math.sin(Math.PI * t) }) as any;
    if (mood.motes === 'dust') {
      emitter({
        emitZone: zone(0, 0, W, H), lifespan: { min: 9000, max: 14000 }, frequency: 1000 / Math.max(0.5, 3 * mult),
        speedX: { min: -6, max: 12 }, speedY: { min: -9, max: -1 }, scale: { min: 0.1, max: 0.3 }, alpha: fade(0.55), tint: lerp(hue, 0xffffff, 0.35),
        maxAliveParticles: Math.ceil(60 * mult),
      }, 6, 9000);
    } else if (mood.motes === 'fireflies') {
      emitter({
        emitZone: zone(0, 200, W, 500), lifespan: { min: 6000, max: 10000 }, frequency: 1000 / Math.max(0.5, 2 * mult),
        speed: { min: 4, max: 18 }, angle: { min: 0, max: 360 }, accelerationX: { min: -7, max: 7 }, accelerationY: { min: -7, max: 7 },
        scale: { min: 0.1, max: 0.2 },
        alpha: { start: 0, end: 1, ease: (t: number) => Math.sin(Math.PI * t) * (0.55 + 0.45 * Math.sin(t * 30)) } as any,
        tint: th.fx[2], maxAliveParticles: Math.ceil(40 * mult),
      }, 6, 8000);
    } else {
      emitter({
        emitZone: zone(-100, 360, W + 200, 360), lifespan: { min: 22000, max: 32000 }, frequency: 3000 / Math.max(0.3, mult),
        speedX: { min: -14, max: 14 }, speedY: { min: -2, max: 2 }, scale: { min: 5, max: 8 }, alpha: fade(0.12), tint: lerp(th.c.paper, hue, 0.3),
        maxAliveParticles: Math.ceil(16 * mult),
      }, 3.5, 20000);
    }
  }

  private destroyBackground() {
    this.roamers.forEach((r) => this.L.remove(r.light));
    this.roamers = [];
    this.movers = [];
    this.objs.forEach((o) => o.scene && o.destroy());
    this.objs = [];
  }

  update(time: number, delta: number) {
    this.px += (this.targetPx - this.px) * Math.min(1, (delta / 1000) * 2.5);
    this.art?.update?.(time, delta, this.px);
    for (const m of this.movers) m.obj.x = W / 2 + Math.sin(time * m.layer.speed + m.phase) * m.layer.sway - this.px * m.layer.par;
    for (const r of this.roamers) {
      const t = time * 0.0004 + r.phase;
      const x = r.def.x + (Math.sin(t) + 0.5 * Math.sin(t * 2.3 + 1)) * r.def.roam - this.px * 20;
      const y = r.def.y + (Math.cos(t * 0.8) + 0.4 * Math.sin(t * 1.9)) * r.def.roam * 0.45;
      r.light.x = x;
      r.light.y = y;
      r.glow.setPosition(x, y);
    }
  }

  // ---- menu (DOM) ----

  private menu(preview: boolean) {
    const menus: Menus = this.registry.get('kit:menus');
    const o = menus.opts;
    const layer = sysLayer(this.game);
    const hasSave = preview || (!!menus.store && !o.save?.auto);
    const credits = preview && !o.credits?.length ? ['Credits listed by the game go here.', 'One line each.'] : (o.credits ?? []);
    const canContinue = preview || (menus.store?.latest() ?? -1) >= 0;
    const items: [string, string][] = [['new', 'New game'], ['options', 'Options']];
    if (canContinue) items.unshift(['continue', 'Continue']);
    if (hasSave) items.splice(items.findIndex(([id]) => id === 'options'), 0, ['load', 'Load']);
    if (credits.length) items.push(['credits', 'Credits']);

    this.root = el(`<div class="ui-titlescreen" data-layout="${titleLayoutSlot.value}" data-settings="${titleSettingsSlot.value}">
      <div class="ui-titlescreen__head"><h1 class="ui-title">${esc(o.title)}</h1></div>
      <div class="ui-titlescreen__main">
        <ul class="ui-menu">${items.map(([id, label], i) => `<li><button class="ui-menu__item${i ? '' : ' ui-menu__item--primary'}" data-id="${id}" ${i ? '' : 'data-first'}>${label}</button></li>`).join('')}</ul>
      </div>
      <div class="ui-titlescreen__settings"></div>
      <div class="ui-titlescreen__hints"><span class="ui-hint"><kbd class="ui-key">&uarr;</kbd><kbd class="ui-key">&darr;</kbd> Select</span><span class="ui-hint"><kbd class="ui-key">Enter</kbd> Confirm</span></div>
      <p class="ui-hint ui-titlescreen__status" hidden></p>${o.version ? `<p class="ui-note ui-titlescreen__version">${esc(o.version)}</p>` : ''}</div>`);
    layer.append(this.root);
    navKeys(this.root);
    const status = this.root.querySelector<HTMLElement>('.ui-titlescreen__status')!;

    // master volume centred above quality in the bottom left corner (bottom middle with the titleSettings slot), set before the first press (the same settings as the Audio and Graphics tabs).
    // After the menu in the DOM, so Up/Down from the last button reaches them, as they sit below it.
    const settings = this.root.querySelector<HTMLElement>('.ui-titlescreen__settings')!;
    const drawSettings = () => {
      settings.replaceChildren(volumeRamp(this.game));
      settings.insertAdjacentHTML('beforeend', `<div class="ui-titlescreen__quality">${qualityRow(true)}${reloadNote()}</div>`); // the reload note beside the buttons, so the column keeps its height
    };
    drawSettings();
    settings.addEventListener('click', (e) => levelClick(e.target as HTMLElement) && redraw(settings, drawSettings));
    let last: HTMLElement | null = null;

    const closeSub = () => {
      this.sub?.remove();
      this.sub = null;
      last?.focus({ preventScroll: true });
    };
    const openSub = (title: string, content: HTMLElement) => {
      const shell = panelShell(title);
      const back = el('<div class="ui-dialog__actions"><button class="ui-btn ui-btn--secondary">Back</button></div>');
      back.querySelector('button')!.onclick = closeSub;
      shell.body.append(content, back);
      navKeys(shell.root);
      layer.append(shell.root);
      this.sub = shell.root;
      focusFirst(content);
    };

    // Continue and New game: the game's title art plays its leave first (the menu fades out), then they go.
    const leave = (go: () => void) => {
      const out = this.art?.leave;
      if (!out) return go();
      this.leaving = true;
      this.root.classList.add('is-leaving');
      out(go);
    };
    const choose = (id: string) => {
      if (this.leaving) return;
      last = this.root.querySelector<HTMLElement>(`[data-id="${id}"]`);
      const fake = (what: string) => {
        status.textContent = `Preview: ${what} would happen here.`;
        status.hidden = false;
      };
      switch (id) {
        case 'continue': return preview ? fake('Continue') : leave(() => menus.continueGame());
        case 'new': {
          if (preview) return fake('New game');
          const wipe = o.save?.wipe;
          if (wipe && (menus.store?.latest() ?? -1) >= 0) {
            // two clicks: the label asks first; leaving the item cancels
            const b = last!;
            if (b.dataset.sure) return leave(() => (wipe(this.game), menus.newGame()));
            b.dataset.sure = '1';
            b.textContent = 'Erase the save? Click again';
            b.addEventListener('blur', () => { delete b.dataset.sure; b.textContent = 'New game'; }, { once: true });
            return;
          }
          return leave(() => (wipe?.(this.game), menus.newGame()));
        }
        case 'load': {
          const store = menus.store;
          if (!store) return fake('the slot list');
          return openSub('Load', savesView(store, 'load', (i) => menus.load(i)));
        }
        case 'options': {
          const entries = [
            { id: 'audio', label: 'Audio', build: () => audioTab(this.game) },
            { id: 'graphics', label: 'Graphics', build: graphicsTab },
            ...(gameInput(this.game) ? [{ id: 'controls', label: 'Controls', build: () => controlsTab(this.game) }] : []),
            ...(menus.opts.tabs ?? []),
          ];
          return openSub('Options', tabs(entries).root);
        }
        case 'credits': return openSub('Credits', creditsView(credits));
      }
    };
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.ui-menu__item');
      if (b) choose(b.dataset.id!);
    });

    // Esc closes the open sub-panel, else goes up to the games list (not in the lab's preview: back() has it there)
    onEscape(this, () => {
      if (this.leaving) return true;
      if (this.sub) return closeSub(), true;
      return !preview && toGamesList();
    });
    focusFirst(this.root);
  }

  debugState() {
    return { art: !!this.art, leaving: this.leaving, mood: titleMoodSlot.name, layout: titleLayoutSlot.name, motes: this.objs.filter((o) => o instanceof Phaser.GameObjects.Particles.ParticleEmitter).map((e) => (e as Phaser.GameObjects.Particles.ParticleEmitter).getAliveParticleCount()), lights: this.roamers.length };
  }
}

/**
 * Mission 1's opening (`games/ludum-dare-60/docs/onboarding.md`): on the Zeppelin Wanderer's lift, under its belly, the Oracle
 * speaks while he cannot act (`OPENING`, `sim/introlines.ts`), one line at a time (Use or a click for the next); one gives the quest
 * to rescue Sprocket and her last signal pulses on the sands to the east. They show on the game's own Oracle panel (`.mc-oracle`,
 * `hud.ts`: her face, the name, the text typed out, a picture beside it, a blip and the antenna's light with each line). Then turbulence: the airship lurches, the lift swings,
 * and he falls, into the old works (`Play` on the land `intro`). The cheapest view that reads: the Ascent's zeppelin and lift over a
 * painted land, the hub's cut-scene caption. A new game starts here (`main.ts` `start`); with a mission flown it goes straight on to
 * `Play`. Every timing is a guess. The timeline runs on the frame delta, so `__game.step(n)` plays it too.
 */
import Phaser from 'phaser';
import { atlas, inputFor, kit, loadAtlas, promptHtml, transition, type SceneKit } from '../../../harness/kit';
import { useOracleFace } from './hud';
import { iconCopy } from './iconkey';
import { GROUND_PX, LIFT_SCALE, S, makeArt, paintGround } from './art';
import { generate } from './sim/mapgen';
import { OPENING } from './sim/introlines';
import { INTRO_LAND } from './sim/intro';
import { makeNpcArt, makeZeppelinArt } from './hub/art';
import { makeZeppelinNear, ZEP_PX } from './hub/Ascent';
import { hub } from './hub/save';
import { installSounds } from './sound';
import './hub/hub.css';

/** Seconds: a line stays at least `line`, plus `perChar` a character; the turbulence; the fall; the fade into the old works. */
const TIME = { line: 3.2, perChar: 0.045, shake: 1.6, fall: 1.3, fade: 500, ping: 1.6, type: 55 };
/** Where things stand on the 1280 x 720 view: the airship, the lift under its belly, her signal on the sands. */
const AT = { zep: { x: 560, y: 210, k: 0.5 }, lift: { x: 600, y: 470 }, signal: { x: 1080, y: 520 } };

type Phase = 'talk' | 'shake' | 'fall' | 'out';

export class Opening extends Phaser.Scene {
  private k!: SceneKit;
  private phase: Phase = 'talk';
  private i = 0;
  private t = 0;
  private cap: HTMLElement | null = null;
  private typing: { text: string; shown: number } | null = null;
  private pingT = 0;
  private tip!: Phaser.GameObjects.Arc;
  private zep!: Phaser.GameObjects.Image;
  private lift!: Phaser.GameObjects.Image;
  private comm!: Phaser.GameObjects.Image;
  private ring!: Phaser.GameObjects.Graphics;
  private done = false;

  constructor() {
    super('Opening');
  }

  preload() {
    loadAtlas(this);
  }

  create(data?: { force?: boolean }) {
    this.phase = 'talk';
    this.i = 0;
    this.t = 0;
    this.done = false;
    // A save with a mission flown has no opening: on to the sands (dev `intro opening` forces it).
    if (hub.get().missions > 0 && !data?.force) {
      this.done = true;
      this.scene.start('Play');
      return;
    }
    const k = (this.k = kit(this));
    k.background();
    makeArt(this);
    makeZeppelinArt(this);
    makeZeppelinNear(this);
    makeNpcArt(this);
    useOracleFace(this.textures.getBase64('atlas', 'npc/oracle-face'));
    installSounds(k.audio);
    // The sands far below: a painted land, small and dim (distance), drifting.
    const ground = paintGround(this, generate('opening', undefined, undefined, 'desert'), GROUND_PX);
    this.add.image(640, 400, ground).setScale(GROUND_PX * 0.42).setTint(0x8a8078).setDepth(-10);
    this.ring = this.add.graphics().setDepth(-5);
    this.zep = this.add.image(AT.zep.x, AT.zep.y, 'zeppelin-near').setScale(AT.zep.k / ZEP_PX).setDepth(2);
    this.lift = this.add.image(AT.lift.x, AT.lift.y, 'lift').setOrigin(0.5, 1).setScale(LIFT_SCALE / S).setDepth(3);
    this.comm = atlas(this).image(AT.lift.x, AT.lift.y - 30, 'communicator/front-0').setOrigin(0.5, 1).setDepth(4);
    // The antenna's light when she speaks (the mission's: `HudFx`).
    this.tip = this.add.circle(AT.lift.x, AT.lift.y - 30 - this.comm.displayHeight, 7, 0xffc070).setBlendMode(Phaser.BlendModes.ADD).setDepth(5).setAlpha(0);
    const ui: HTMLElement = this.registry.get('ui');
    const el = document.createElement('div');
    el.className = 'hb-cut';
    el.innerHTML = `<div class="hb-cut__bar hb-cut__bar--top"></div><div class="hb-cut__bar hb-cut__bar--bottom"></div><div class="mc-oracle is-on" data-tone="calm"><div class="mc-oracle__eye"><i></i></div><div class="mc-oracle__col"><div class="mc-oracle__name">The Oracle</div><div class="mc-oracle__text"></div><div class="mc-oracle__more">${promptHtml('{use} next')}</div></div><div class="mc-oracle__icon"></div></div>`;
    ui.appendChild(el);
    this.cap = el;
    requestAnimationFrame(() => el.classList.add('is-on'));
    el.addEventListener('pointerdown', () => this.next());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => el.remove());
    this.show();
  }

  /** A line on her panel: typed out, with its picture, a blip and the antenna's light. */
  private show(i = this.i) {
    const line = OPENING[i];
    if (!line || !this.cap) return;
    this.typing = { text: line.text, shown: 0 };
    const pic = line.icon ? iconCopy(this, line.icon, 48) : null;
    this.cap.querySelector('.mc-oracle__icon')?.replaceChildren(...(pic ? [pic] : []));
    this.cap.querySelector('.mc-oracle')?.classList.toggle('has-icon', !!pic);
    this.pingT = TIME.ping;
    this.k.audio.sfx.play('blip', { gain: 0.6 });
  }

  /** Use or a click: the next line now (the last one runs into the turbulence by itself). */
  private next() {
    if (this.phase !== 'talk') return;
    this.t = 0;
    if (this.i < OPENING.length - 1) {
      this.i++;
      this.show();
    } else this.phase = 'shake';
  }

  update(_time: number, ms: number) {
    if (this.done) return;
    const dt = Math.min(0.05, ms / 1000);
    this.t += dt;
    const line = OPENING[this.i];
    this.type(dt);
    if (this.phase === 'talk') {
      if (inputFor(this).pressed('use')) this.next();
      // The last line is cut off by the lurch, sooner than the others.
      else if (this.t >= (this.i === OPENING.length - 1 ? 1.4 : TIME.line + TIME.perChar * line.text.length)) this.next();
    }
    // Her signal: a pulsing ring on the sands once the Oracle names it, and from then on.
    const cueOn = OPENING.findIndex((l) => l.cue) <= this.i;
    this.ring.clear();
    if (cueOn) {
      const p = (this.time.now / 1100) % 1;
      this.ring.lineStyle(3, 0xffc860, 1 - p).strokeEllipse(AT.signal.x, AT.signal.y, 20 + 70 * p, (20 + 70 * p) * 0.55);
      this.ring.fillStyle(0xffd890, 0.9).fillCircle(AT.signal.x, AT.signal.y, 4);
    }
    // The ship's slow drift; the turbulence throws it about, the lift swings and he goes over the rail.
    const sway = this.phase === 'talk' ? Math.sin(this.time.now / 1400) * 0.01 : 0;
    if (this.phase === 'shake') {
      const k = Math.min(1, this.t / TIME.shake);
      const jolt = Math.sin(this.t * 31) * 0.05 * k + Math.sin(this.t * 7) * 0.04;
      this.zep.setRotation(jolt).setY(AT.zep.y + Math.sin(this.t * 23) * 8 * k);
      this.lift.setRotation(Math.sin(this.t * 6) * 0.35 * k);
      this.comm.setRotation(Math.sin(this.t * 6) * 0.35 * k).setX(AT.lift.x + Math.sin(this.t * 6) * 26 * k);
      if (this.t < 0.06) {
        this.k.juice.shake('medium');
        this.k.audio.sfx.play('crunch', { gain: 0.8 });
      }
      if (Math.floor(this.t * 3) !== Math.floor((this.t - dt) * 3)) this.k.juice.shake('small');
      if (this.t >= TIME.shake) {
        this.phase = 'fall';
        this.t = 0;
        this.cap?.classList.remove('is-on');
      }
    } else if (this.phase === 'fall') {
      // He drops away below the frame, tumbling and growing smaller toward the sands.
      const k = this.t / TIME.fall;
      this.comm.setPosition(AT.lift.x + 40 * k, AT.lift.y - 30 + 900 * k * k).setRotation(k * 5).setScale(this.comm.scaleX * (1 - dt * 0.5));
      this.lift.setRotation(Math.sin(this.t * 6) * 0.35 * (1 - k));
      if (this.t >= TIME.fall) {
        this.phase = 'out';
        this.done = transition(this, 'Play', { land: INTRO_LAND }, { ms: TIME.fade });
      }
    } else this.zep.setRotation(sway);
  }

  /** Types the line out on her panel and lights the antenna while she speaks. */
  private type(dt: number) {
    const t = this.typing;
    const text = this.cap?.querySelector('.mc-oracle__text');
    if (t && text) {
      t.shown += dt * TIME.type;
      if (t.shown >= t.text.length) {
        text.textContent = t.text;
        this.typing = null;
      } else text.textContent = t.text.slice(0, Math.floor(t.shown));
    }
    this.pingT = Math.max(0, this.pingT - dt);
    this.tip.setPosition(this.comm.x, this.comm.y - this.comm.displayHeight).setAlpha(this.pingT > 0 ? 0.3 + 0.7 * Math.abs(Math.sin(this.pingT * 9)) : 0);
  }

  debugState() {
    return { phase: this.phase, line: this.i, of: OPENING.length, t: +this.t.toFixed(2) };
  }
}

/**
 * The D-hub: the command deck at the bottom of the D-city, the Zeppelin Wanderer, between missions. The Communicator
 * walks between stations and uses them (Helldivers' ship, Deep Rock's rig: walk, don't menu). Rules are in state.ts and
 * layout.ts; this scene draws, reads input and plays the feedback (footsteps, a station lit and chimed when in reach,
 * a latch when a panel opens; night aboard, lit by the lantern and the lots built: home is calm after the sands). A station's panel is its own file
 * (`stations/`, registered in `stations/index.ts`; it reaches this scene through `HubHost`), the dev commands are
 * `hubdev.ts`, the drawing is `art.ts` (over `art/`), the DOM frame and HUD `panels.ts`.
 */
import Phaser from 'phaser';
import { atlas, loadAtlas } from '../../../../harness/kit/assets';
import { inputFor, kit, onEscape, type SceneKit, transition, tune } from '../../../../harness/kit';
import { makeArt, paintGround } from '../art';
import { HUB_SHADOW, hubDressed } from '../biomedress';
import { DeckShadows } from '../shadowview';
import { GroundLive, HUB_AIR } from '../groundlive';
import { commDir, type CommDir, commFlip, commFrame } from '../comm';
import { type AnomalyId, type BiomeId, BIOMES, PARTS, type PartKind, T } from '../sim/defs';
import { generate } from '../sim/mapgen';
import { HUB_MUSIC, playMusic, TONE } from '../sound';
import { installStepSounds, stepSound } from '../stepsounds';
import { HubLight, ROOM_LAMPS, facingOf } from './hublight';
import {
  bridgeTex,
  housed,
  HS,
  LANDMARK,
  lotDeckTex,
  makeHubArt,
  makeNpcArt,
  makePortraits,
  makeSkyArt,
  makeZeppelinArt,
  npcImage,
  paintDeck,
  propTex,
  shownAt,
  stationTex,
  windowTex,
} from './art';
import { StrideFx } from './stride';
import { HoverGlow, type HoverRegion } from './hover';
import {
  ARRIVE,
  BENCH,
  BOOTH_SCALE,
  bridgesTo,
  DECK,
  hubSpeed,
  inReach,
  LEVER,
  lotOf,
  boothBlocks,
  lotProps,
  move,
  NPC_REACH,
  PROP_SCALE,
  roomAt,
  setBuilt,
  SLOTS,
  SPOTS,
  WORKBENCH,
  stationAt,
  type StationId,
  STATIONS,
  TABLE,
  WAIT,
  walkable,
  WINDOW,
} from './layout';
import { type Feature, features, S as STEP } from './story';
import { playCutscene, STOLEN } from './cutscene';
import { playOutro } from './outro';
import { finishRun, flushPlaytime } from './playtime';
import { stepOf } from './dialog';
import { registerHubCommands, type HubDevHost } from './hubdev';
import { HubHud } from './panels';
import type { Thing } from './stations/host';
import { STATION_PANELS } from './stations';
import { picksWaiting } from './researchslice';
import { guideTarget } from './firstvisit';
import { openChurch } from './stations/church';
import { openBuild, openFor } from './stations/npc';
import { botLine } from './stations/workshop';
import { hub } from './save';
import { gear, landed } from './carry';
import { announce, grantBoost, profile } from './deeds';
import { welcome } from './welcome';
import { offer, slotsOf } from './buildings';
import { homeNews, dispatch } from './expeditions';
import { type Books, buildStation, economy, settleScrap } from './economy';
import { isTaught, waitingNote } from './taught';
import { riders, roster, salvage } from './workshop';
import { type SpecId, TYPES } from '../sim/specs';
import { gearCommands, Inventory } from '../inventory';
import { hubSubjects } from '../stats';
import { QuestLog, questLogCommand } from '../questlog';
import { Guide } from '../guideview';
import { entriesFor } from '../guide';
import { journal } from './journal';
import { makeGearArt } from '../gearart';
import { installHubSounds } from './sound';
import { installTalkSounds } from './talksound';
import { type Act, actFor, Conversation, type Line } from './dialog';
import { factsFor, giveReward, NPC_ROLE, QUESTS, SCRIPTS } from './talk';
import { payExtras } from './questpay';
import { landPips } from './signals';
import { autoFacts, placesOf } from './questplaces';
import { HubCompanions } from './companionview';
import { deckFloor, PrincessView } from './princessview';
import { fastFloor } from './deckprints';
import { broughtOf, homecomingLine } from './princess';
import { princessSave } from './princessslice';
import { registerPrincessCommands } from './princessdev';
import { actFacts } from './acts';
import { dogNameOf } from './speciallines';
import { jobFor, jobText } from './repeats';
import { STATIC_BEAT } from './acts';
import { lineSave, questBook, talkSave, titleSave } from './talkslice';
import { activeLines, autoStart } from './lines';
import { earn, nextWorn, styled, TITLES } from './titles';
import { TalkView } from './talkview';
import {
  aboard,
  build,
  CITY_STAGES,
  cityStage,
  type Haul,
  type HubState,
  isAboard,
  nextSeed,
  npc,
  NPCS,
  stationCost,
  unrescue,
  waiting,
} from './state';
import { type Land, landFor, landings, picked } from './landings';
import { useOracleFace } from '../hud';
import './hub.css';

type Img = Phaser.GameObjects.Image;
type Light = Phaser.GameObjects.Light;

/** The land below lies far down: it scrolls at this share of the deck's speed and shows at this scale. */
const BELOW = { scroll: 0.4, scale: 0.6 };
const ZOOM = 1.35;
/** In conversation the camera moves in on the NPC (a little toward the Communicator, so both show above the frame). */
const TALK = { size: 270, min: 2, max: 3.2, toward: 0.28, lift: -6 };
/** Steam puffs of each gesture, seconds after the line starts, and how long it lasts. */
const GESTURE: Record<Act, { dur: number; puffs: number[] }> = {
  nod: { dur: 0.45, puffs: [0.05] },
  hop: { dur: 0.6, puffs: [0.3, 0.4] },
  lean: { dur: 0.9, puffs: [0.1] },
  wave: { dur: 1, puffs: [0.1] },
  shrug: { dur: 0.7, puffs: [0.25] },
  laugh: { dur: 1.1, puffs: [0.1, 0.35, 0.6] },
  point: { dur: 0.9, puffs: [0.2] },
  huff: { dur: 0.8, puffs: [0.4, 0.5, 0.62] },
};
/** Open sky shown past the hull. */
const PAD = 160;
/** Where the land's centre sits on one axis so it fills the view wherever the camera goes (a scroll factor shifts it). */
const belowAt = (size: number, view: number) => (size / 2 - view / 2) * BELOW.scroll + view / 2;

export class Hub extends Phaser.Scene implements HubDevHost {
  k!: SceneKit;
  private t!: ReturnType<typeof Hub.tunes>;
  hud!: HubHud;
  /** The inventory (I), with the workbench: crafting happens aboard. */
  inv!: Inventory;
  /** The tab open in each tabbed panel (the Trader's Buy, Sell, Specials), kept while the hub runs (`HubHost`). */
  readonly tabs: Record<string, string> = {};
  /** What each station keeps of its UI while the scene runs (`memo`). */
  private memos = new Map<string, unknown>();
  /** Specs the lift's deeds opened as it docked: the Oracle names them with her welcome. */
  private opened: SpecId[] = [];
  /** What the docking changed in the D-city (an expedition home, a building done): banners on arrival. */
  private cityNews: string[] = [];
  /** The quest log (J). */
  private log!: QuestLog;
  private guide!: Guide;
  s!: HubState;
  me!: Img;
  private tip!: Light;
  /** The night's lights, spent under the cap (hublight.ts). */
  private hl!: HubLight;
  private pingT = 0;
  private dir: CommDir = 'back';
  private face = 1;
  private bob = 0;
  private step = 0;
  private sq = { s: 0, v: 0 };
  /** Dust, streaks and lean at full stride (stride.ts). */
  private stride!: StrideFx;
  private moving = false;
  /** Seconds walked in one go (`hubSpeed`). */
  private walked = 0;
  near: Thing | null = null;
  private ring!: Phaser.GameObjects.Graphics;
  private glow!: Light;
  /** The first visit's light on what to do next (`firstvisit.ts`), and whether the deck is dimmed for it. */
  private guideLight!: Light;
  private dimmed = false;
  private npcs = new Map<string, Img>();
  /** The dog by the lift and the cat by the course table (P42). */
  private pets!: HubCompanions;
  /** The Princess on the deck: her dock, rounds, sweepings and the deck's prints and dust (P58). */
  her!: PrincessView;
  /** What the Communicator and the NPCs cast on the deck, as the props' shadows fall (`DeckShadows`). */
  private shade!: DeckShadows;
  /** Each NPC image's own scale (drawn ones are 2x textures, painted ones come from the atlas). */
  private npcBase = new Map<string, number>();
  /** Built stations: the lot's deck and the booth, by NPC id. */
  private booths = new Map<string, Img[]>();
  private props = new Map<StationId, Img>();
  /** The outline under the mouse (`hover.ts`). */
  private hover!: HoverGlow;
  private windowImg!: Img;
  private marker!: Img;
  private shownStage = -1;
  /** Dev overrides of a land's anomaly or tier (`hub anomaly|tier`): not saved, gone with the scene. */
  private over: Partial<Record<BiomeId, { anomaly?: AnomalyId; tier?: number }>> = {};
  private shownAll = false;
  private below!: Img;
  /** The live ground over the land below (clouds, drift, glints: groundlive.ts) and the dust in the deck's lamplight. */
  private liveBelow: GroundLive | null = null;
  private air: GroundLive | null = null;
  private clouds: Img[] = [];
  /** The conversation in progress, its frame, the NPC's gesture and squash spring, and where to go once it ends. */
  convo: { id: string; c: Conversation } | null = null;
  tv: TalkView | null = null;
  private act: { kind: Act; t: number; puffed: number } | null = null;
  private nsq = { s: 0, v: 0 };
  private after: (() => void) | null = null;

  constructor() {
    super('Hub');
  }

  /** The dev switch that puts every NPC aboard (`HubHost`). */
  get allRescued() {
    return this.t.allRescued;
  }

  /** UI state a station keeps while the scene runs (`HubHost`): made on first use, cleared by `create`. */
  memo<T>(key: string, init: () => T): T {
    if (!this.memos.has(key)) this.memos.set(key, init());
    return this.memos.get(key) as T;
  }

  /** The save changed under the scene (the `hub wipe` dev command). */
  reload() {
    this.s = hub.get();
    if (this.scene.isActive()) this.refresh();
  }

  /** The dev-menu toggle (F10, Kit tab, or `?t.allRescued=1`): every NPC aboard, without touching the save. */
  static tunes(scene: Phaser.Scene) {
    return tune(scene, { allRescued: false, allRecipes: false });
  }

  preload() {
    loadAtlas(this);
  }

  create(data: { haul?: Haul; at?: string }) {
    this.npcs = new Map();
    this.her = undefined as unknown as PrincessView; // made after the first refresh (a restart reuses the scene)
    this.shade = new DeckShadows(this, { tint: (HUB_SHADOW[0] << 16) | (HUB_SHADOW[1] << 8) | HUB_SHADOW[2], lean: { x: 0.32, y: 0.4 }, depth: -7.45, alpha: 0.85, night: 1, reach: 0.45 });
    this.npcBase = new Map();
    this.booths = new Map();
    this.props = new Map();
    this.near = null;
    this.convo = null;
    this.tv = null;
    this.act = null;
    this.after = null;
    this.nsq = { s: 0, v: 0 };
    this.shownStage = -1;
    this.over = {};
    this.pingT = 0;
    // The hub shows the system pointer (Minos): the mission's cursors (cursors.ts) never come home with the player.
    this.input.setDefaultCursor('');
    this.k = kit(this);
    const L = this.k.lights;
    this.k.background();
    this.k.fx.depth = 60000;
    this.t = Hub.tunes(this);
    this.shownAll = this.t.allRescued;
    makeArt(this);
    makeHubArt(this);
    makeNpcArt(this);
    makePortraits(this);
    makeGearArt(this);
    installHubSounds(this.k.audio);
    installStepSounds(this.k.audio);
    installTalkSounds(this.k.audio);
    let s = hub.get();
    this.opened = [];
    this.cityNews = [];
    this.memos.clear();
    if (data?.haul) {
      const l = landed(s, data.haul);
      this.cityNews = [...homeNews(s, l.state), ...l.news];
      s = l.state;
      this.opened = l.unlocked;
    }
    this.s = s;
    // The special lines (the dog, the cat, the Green Shoot) start themselves once the land can hold their place (P42; also a save from before them).
    const began = autoStart(talkSave.get(), autoFacts(s, questBook.get()));
    if (began !== talkSave.get() && JSON.stringify(began) !== JSON.stringify(talkSave.get())) talkSave.set(began);
    this.keepStory();
    s = this.s;
    flushPlaytime();

    // The land far below (the next course's; the deck's lamps don't reach it, the Wanderer's soft pools do: `HubLight.land`), the D-city's shadow on it, clouds between.
    makeSkyArt(this);
    makeZeppelinArt(this);
    this.below = this.add.image(belowAt(DECK.w, 1280), belowAt(DECK.h, 720), '__WHITE').setScrollFactor(BELOW.scroll).setDepth(-30).setTint(0xc8b49c);
    this.paintBelow();
    const shadow = this.add.image(belowAt(DECK.w, 1280), belowAt(DECK.h, 720), 'zeppelin-shadow').setScale(1.5).setAlpha(0.32).setScrollFactor(BELOW.scroll).setDepth(-29);
    this.clouds = Array.from({ length: 7 }, (_, i) =>
      this.add.image(((i * 0.37) % 1) * DECK.w * 1.3 - 200, ((i * 0.61) % 1) * DECK.h, 'hub-cloud').setScale(1.6 + (i % 3) * 0.5).setAlpha(0.5).setScrollFactor(0.9).setDepth(-28),
    );
    for (const o of [this.below, shadow, ...this.clouds]) L.unlit(o);
    this.add.image(0, 0, paintDeck(this)).setOrigin(0).setDepth(-10);
    this.air = new GroundLive(this, { w: DECK.w, h: DECK.h, seed: 'deck', paint: 'desert', below: false, depth: -7.4, look: HUB_AIR });
    const prop = (id: StationId, key: string, x: number, y: number, oy: number) => {
      const img = this.stand(this.add.image(x, y, hubDressed(this, key, !housed())).setOrigin(0.5, oy).setScale(1 / HS).setDepth(y));
      this.props.set(id, img);
      return img;
    };
    prop('command', 'hub-table', TABLE.x, TABLE.y + 40, 0.8);
    this.marker = this.add.image(TABLE.x - 40, TABLE.y, 'hub-marker').setScale(1 / HS).setDepth(TABLE.y + 45);
    prop('workshop', 'hub-bench', BENCH.x, BENCH.y + 10, 0.85);
    this.stand(this.add.image(BENCH.x + 110, BENCH.y + 20, hubDressed(this, 'hub-crate', !housed())).setOrigin(0.5, 0.9).setScale(1 / HS).setDepth(BENCH.y + 20));
    prop('lift', 'hub-lever', LEVER.x, LEVER.y + 12, 0.92);
    this.windowImg = this.add.image(WINDOW.x, WINDOW.y, windowTex(this, 0)).setScale(1 / HS).setDepth(-6);
    this.props.set('window', this.windowImg);
    for (const [x, y] of ROOM_LAMPS) this.add.image(x, y, 'hub-lamp').setScale(1 / HS).setDepth(-6); // their lights are the night's (hublight.ts)
    L.add(TABLE.x, TABLE.y - 10, { color: 0xffa040, radius: 150, intensity: 0.9 }); // the map glass
    L.add(SPOTS.altar.x, SPOTS.altar.y - 90, { color: 0x3df2ff, radius: 160, intensity: 0.7 }); // the Oracle's eye on the altar
    L.add(BENCH.x - 15, BENCH.y - 20, { color: 0xfff0c0, radius: 120, intensity: 0.8 }); // the bench lamp
    L.add(LEVER.x + 20, LEVER.y - 50, { color: 0xffb050, radius: 60, intensity: 0.6 }); // the lever's knob
    this.glow = L.add(-999, -999, { color: 0xffe0a0, radius: 120, intensity: 0 });
    this.guideLight = L.add(-999, -999, { color: 0xfff0c0, radius: 240, intensity: 0 });
    for (const n of NPCS) {
      const img = npcImage(this, 0, 0, n.id).setOrigin(0.5, 1);
      this.shade.add(img, { fine: true });
      this.npcs.set(n.id, img);
      this.npcBase.set(n.id, img.scaleX);
    }
    this.pets = new HubCompanions(this, this.shade);
    this.hover = new HoverGlow(this, (o) => L.unlit(o));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.hover.clear());
    this.ring = this.add.graphics().setDepth(-5);

    // A dev `goto` spot, else the hatch after a lift home, else where he last stood (saved).
    const at = data?.at ? this.spotOf(data.at) : data?.haul ? null : s.at;
    this.me = atlas(this).image(at?.x ?? ARRIVE.x, at?.y ?? ARRIVE.y, 'communicator/back-0').setOrigin(0.5, 0.97);
    this.stride = new StrideFx(this, (o) => this.k.lights.unlit(o));
    this.shade.add(this.me, { fine: true });
    this.tip = L.add(this.me.x, this.me.y - 70, { color: 0xffc070, radius: 70, intensity: 0 });
    // The time of day aboard (hublight.ts `moodOf`: day the first visit, then random): day, evening, or night with dark deck and catwalks, the Communicator's lantern, a lit lot per station built, the land below lit in soft pools or sweeping spotlights.
    this.hl = new HubLight(this, this.k, this.shade, this.me);
    this.hl.land({ x: belowAt(DECK.w, 1280), y: belowAt(DECK.h, 720) }, BELOW.scroll, -27.8);

    const cam = this.cameras.main;
    cam.setBounds(-PAD, -PAD, DECK.w + PAD * 2, DECK.h + PAD * 2);
    cam.setZoom(ZOOM);
    cam.centerOn(this.me.x, this.me.y - 20);

    const ui: HTMLElement = this.registry.get('ui');
    this.hud = new HubHud(ui);
    useOracleFace(this.textures.getBase64('atlas', 'npc/oracle-face'));
    this.hud.stores(s);
    // The inventory (I): crafting and salvage happen here, aboard (the workbench). Parts are the hub's stores, scrap and copper the economy's.
    this.inv = new Inventory(ui, {
      where: 'hub',
      stores: () => {
        const e = economy.get();
        return { scrap: e.scrap, copper: e.copper, parts: this.s.parts, insight: e.insight, cores: e.cores };
      },
      spend: (w) => {
        economy.set({ ...economy.get(), scrap: w.scrap });
        this.save({ ...this.s, parts: w.parts });
      },
      sound: (k) => this.k.audio.sfx.play(k === 'open' || k === 'close' || k === 'craft' ? 'latch' : 'near', { gain: k === 'deny' ? 0.3 : 0.6 }),
      partIcon: (k) => this.textures.getBase64(`part-${k}`),
      bench: () => this.has('workbench'),
      taught: (id) => isTaught(this.s, id, this.t.allRecipes),
      waiting: () => waitingNote(this.s, this.t.allRecipes),
      stats: hubSubjects,
    });
    const offGear = gearCommands(this.inv, (scrap, p) => {
      economy.set({ ...economy.get(), scrap: economy.get().scrap + scrap });
      const h = this.s;
      this.save({ ...h, parts: Object.fromEntries((Object.keys(PARTS) as PartKind[]).map((k) => [k, (h.parts[k] ?? 0) + p])) });
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offGear);
    this.log = new QuestLog(ui, {
      where: 'hub',
      data: () => journal(talkSave.get(), lineSave.get(), this.s, titleSave.get()),
      sound: (k) => this.k.audio.sfx.play(k === 'click' ? 'near' : 'latch', { gain: 0.6 }),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, questLogCommand(this.log));
    // The Oracle's guide (H, the Esc menu): lists the HUD and the stations on screen and points at one (guideview.ts, P28).
    this.guide = new Guide({
      where: 'hub',
      root: ui,
      entries: () => entriesFor('hub', this.s),
      cue: () => ({ where: 'hub', missions: this.s.missions, junk: 0, stripSize: 0, research: picksWaiting() }),
      spot: (key) => this.guideSpot(key),
      idle: () => !this.cut && !this.convo && !this.hud.panel && !this.inv.open && !this.log.open && !this.guide.open,
      canOpen: () => !this.cut && !this.convo && !this.hud.panel && !this.inv.open && !this.log.open,
      sound: (k) => this.k.audio.sfx.play(k === 'click' ? 'near' : 'latch', { gain: 0.6 }),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.guide.destroy());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.guide.commands());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.k.audio.listener = null;
      ui.innerHTML = '';
    });
    onEscape(this, () => {
      if (this.guide.open) {
        this.guide.hide();
        return true;
      }
      if (this.inv.open) {
        this.inv.hide();
        return true;
      }
      if (this.log.open) {
        this.log.hide();
        return true;
      }
      if (this.convo) {
        this.leaveTalk();
        return true;
      }
      if (!this.hud.panel) return false;
      this.closePanel();
      return true;
    });
    const audio = this.k.audio;
    audio.listener = () => this.me;
    // The song carries on from the sands (never restarted); home is calm: muffled, a little quieter.
    playMusic(audio, HUB_MUSIC, { fade: 3 });
    audio.music.tone({ ...TONE.calm, detune: 0, fade: 3 });

    this.refresh();
    // After the first refresh: the built lots are deck by then, so her rounds and the crew's errands can use them.
    this.her = this.princessView();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.her.keepTrail());
    if (data?.haul) {
      const h = data.haul;
      this.hud.banner('Home');
      this.hud.storesUp();
      // What came up is on the results screen (Play.end); the Oracle only comments (`welcome.ts`).
      // A quest line step met on the sands: its giver wants to hear about it.
      const ready = activeLines(talkSave.get(), lineSave.get(), factsFor(this.s, '')).filter((l) => l.ready).map((l) => npc(l.npc)!.name.replace(/^The /, 'the '));
      const lost = (h.went?.length ?? 0) - h.robots.filter((r) => r.uid).length;
      const guests = (h.rescued ?? []).filter((id) => npc(id)).length;
      // A deed gauge that filled on the sands: the banner names the calling it opened (`land` returns it).
      const gauges = announce(this.opened);
      this.time.delayedCall(1400, () => this.speak('highPriest', welcome(h, { lost, guests, news: ready })));
      if (gauges) this.time.delayedCall(2600, () => this.hud.banner(gauges, 4200));
      this.cityNews.forEach((line, i) => this.time.delayedCall(4000 + i * 3600, () => this.hud.banner(line, 3400)));
      // Act 0 of quests.md (P38): the first return brings a faint voice over the antenna, once.
      if (h.carry?.stats.signHome) this.time.delayedCall(5000, () => this.hud.banner('The First Scripture hangs in the church: the Oracle dreams one more card', 4200));
      const last = questBook.get().lastJob;
      if (last) {
        questBook.set({ ...questBook.get(), lastJob: null });
        this.time.delayedCall(3400, () => this.hud.banner(last.text, 4200));
      }
      // A quest step met on the sands or a job paid: the log has news.
      if (ready.length || last) this.time.delayedCall(3400, () => this.hud.notice('Quest log updated: press {journal}'));
      // The Princess (P58): back from the Ether she sweeps the deck first; else his boots print it in the land's colour, and she has a line for what came up.
      const flown = this.s.biome;
      if (this.her.owed) this.time.delayedCall(900, () => this.her.playSweep(() => this.her.dirtyBoots(flown)));
      else {
        this.her.dirtyBoots(flown);
        if (this.s.story?.wife === 'home' && !h.rescued?.includes('princess')) this.time.delayedCall(5200, () => this.speak('princess', homecomingLine(broughtOf(h, flown), h.id)));
      }
      if (this.s.missions === 1 && !talkSave.get().flags['beat.static']) {
        talkSave.set({ ...talkSave.get(), flags: { ...talkSave.get().flags, 'beat.static': 1 } });
        this.time.delayedCall(6200, () => this.hud.banner(STATIC_BEAT.princess, 4200));
        this.time.delayedCall(7600, () => this.speak('highPriest', STATIC_BEAT.oracle));
      }
    } else this.time.delayedCall(600, () => this.speak('highPriest', 'The Wanderer drifts, the boilers burn. Walk the deck, Communicator; the command table will send you down again.'));
    registerHubCommands(this);
    registerPrincessCommands(this);
  }

  /** The Princess's view (P58), told what it needs of the scene. */
  private princessView() {
    const deckCtx = () => {
      const s = this.s;
      const hob = s.stations.hob;
      return {
        floor: fastFloor(deckFloor(s)),
        spot: (id: string) => (npc(id) && isAboard(s, id, this.t.allRescued) && id !== 'princess' ? this.npcAt(id) : null),
        lots: Object.values(s.stations).map((l) => stationAt(l).npc),
        kettle: hob ? lotProps('hob', hob)[2] : null,
        robots: roster.get().bots.length,
      };
    };
    return new PrincessView({
      scene: this,
      k: this.k,
      me: this.me,
      img: () => this.npcs.get('princess'),
      hub: () => this.s,
      active: () => this.s.story?.wife === 'home' && isAboard(this.s, 'princess') && stepOf(talkSave.get(), 'main') !== STEP.blessing && !this.cut,
      night: () => this.hl.mood() === 'night',
      talking: () => this.convo?.id === 'princess',
      cat: () => this.s.perks.includes('companionCat'),
      catAway: (at) => this.pets.catAway(at, this.s.perks.includes('companionCat')),
      pencil: () => actFacts(this.s, questBook.get())['act.3.done'] === 1,
      ctx: deckCtx,
      setCut: (c) => (this.cut = c),
      speak: (text) => this.speak('princess', text),
      banner: (text) => this.hud.banner(text, 4200),
      take: (p) => {
        const e = economy.get();
        economy.set({ ...e, scrap: e.scrap + p.scrap, junk: [...e.junk, ...p.junk] });
        const parts = { ...this.s.parts };
        for (const [k, n] of Object.entries(p.parts) as [PartKind, number][]) parts[k] = (parts[k] ?? 0) + n;
        this.save({ ...this.s, parts });
        this.hud.storesUp();
      },
    });
  }

  spotOf(id: string) {
    const st = STATIONS.find((x) => x.id === id);
    if (st) return { x: st.x, y: st.y + 60 };
    const n = npc(id);
    if (n) {
      const p = this.npcAt(id);
      return { x: p.x, y: p.y + 80 };
    }
    if (id === 'hatch') return ARRIVE;
    return null;
  }

  /**
   * Where an NPC stands: an `always` one at its spot; a rescued one at its station once built, else waiting in the centre
   * of the hub round the course table until the Communicator builds it a place.
   */
  private npcAt(id: string) {
    const n = npc(id)!;
    // The Princess: by the altar for the blessing, else at home (your house), else by the lift.
    if (id === 'princess') {
      if (stepOf(talkSave.get(), 'main') === STEP.blessing) return { x: SPOTS.altar.x + 90, y: SPOTS.altar.y + 40 };
      if (this.her) return this.her.pos(); // her dock, her rounds (P58)
      const home = this.s.stations.home;
      return home ? { x: stationAt(home).npc.x + 46, y: stationAt(home).npc.y } : { x: ARRIVE.x + 90, y: ARRIVE.y - 30 };
    }
    const lot = this.s.stations[id];
    if (lot) return stationAt(lot).npc;
    if (!n.station) return SPOTS[n.spot];
    const i = waiting(this.s, this.t.allRescued).findIndex((w) => w.id === id);
    return WAIT[Math.max(0, i) % WAIT.length];
  }

  /** A thing on the deck as a spot on screen in game pixels, for the guide's pointer (`guide.ts`: `station:<id>`, `npc:<id>`, `built:<id>`). */
  private guideSpot(key: string) {
    const [kind, id] = key.split(':');
    let p: { x: number; y: number } | null = null;
    if (kind === 'station') {
      const st = STATIONS.find((x) => x.id === id);
      p = st ? { x: st.x, y: st.y - 30 } : null;
    } else if (kind === 'npc') p = npc(id) && isAboard(this.s, id, this.t.allRescued) ? (({ x, y }) => ({ x, y: y - 40 }))(this.npcAt(id)) : null;
    else if (kind === 'built' && this.s.stations[id]) {
      const at = stationAt(this.s.stations[id]);
      p = { x: at.x, y: at.foot - 50 };
    }
    if (!p) return null;
    const cam = this.cameras.main;
    return { x: (p.x - cam.worldView.x) * cam.zoom, y: (p.y - cam.worldView.y) * cam.zoom, r: 64 * cam.zoom };
  }

  /** Stations and NPCs aboard, as things in reach. */
  private things(): Thing[] {
    const all = this.t.allRescued;
    return [
      ...STATIONS.map((st) => ({ kind: 'station' as const, id: st.id, name: st.name, verb: st.verb, x: st.x, y: st.y, reach: st.reach })),
      ...aboard(this.s, all).map((n) => {
        const p = this.npcAt(n.id);
        const who = n.name.replace(/^The /, 'the ');
        const verb = n.station && !this.s.stations[n.id] ? `talk to ${who}: build the ${n.station.name}` : n.station ? `visit ${who}'s ${n.station.name}` : `talk to ${who}`;
        return { kind: 'npc' as const, id: n.id, name: n.name, verb, x: p.x, y: p.y, reach: NPC_REACH };
      }),
      ...(this.her?.thing() ? [this.her.thing()!] : []),
    ];
  }

  /** What the mouse can light up, front to back: the NPCs, their booths, the fixed stations, her sweepings. */
  private hoverRegions(): HoverRegion[] {
    const all = this.t.allRescued, ids = aboard(this.s, all).map((n) => n.id);
    return [
      ...ids.flatMap((id) => (this.npcs.get(id) ? [{ id, img: this.npcs.get(id)! }] : [])),
      ...ids.flatMap((id) => (this.booths.get(id)?.[1] ? [{ id, img: this.booths.get(id)![1] }] : [])),
      ...[...this.props].map(([id, img]) => ({ id, img })),
      ...this.her.hoverables(),
    ];
  }

  /** The hover outline follows the mouse while the deck is free to look at (no panel, talk, cut scene or overlay). */
  private hoverStep() {
    const free = !this.cut && !this.convo && !this.hud.panel && !this.inv.open && !this.log.open && !this.guide.open && this.input.manager.isOver;
    const p = this.input.activePointer;
    this.hover.update(free ? this.cameras.main.getWorldPoint(p.x, p.y) : null, free ? this.hoverRegions() : [], this.time.now / 1000);
  }

  /** A prop standing on the deck casts its silhouette short from its contact line, away from the lights (`DeckShadows.stand`, `footline.ts`), and takes it along when it goes. */
  private stand(img: Phaser.GameObjects.Image) {
    this.shade.stand(img, -7.5);
    return img;
  }

  /** Show what the save says: who is aboard, the city through the window, the stores. */
  refresh() {
    const all = this.t.allRescued;
    // Built stations become deck (walkable) with their centrepiece on them; NPCs stand at theirs, or wait in the centre.
    setBuilt(Object.values(this.s.stations));
    for (const [id, lotId] of Object.entries(this.s.stations)) {
      if (this.booths.has(id) || !npc(id) || lotId === WORKBENCH) continue;
      const lot = lotOf(lotId), at = stationAt(lotId);
      const deck = this.add.image(lot.x + lot.w / 2, lot.y + lot.h / 2, lotDeckTex(this, lot, id)).setScale(1 / HS).setDepth(-9);
      const booth = this.stand(this.add.image(at.x, at.foot, hubDressed(this, stationTex(this, id), !housed())).setOrigin(0.5, LANDMARK.foot / LANDMARK.h).setScale(shownAt(BOOTH_SCALE)).setDepth(at.foot));
      // Its own things about it: the dojo's kicking gear, the Trader's wares, your stove (LOT_PROPS).
      const props = lotProps(id, lotId).map((p) =>
        this.stand(this.add.image(p.x, p.y, hubDressed(this, propTex(this, p.kind), !housed())).setOrigin(0.5, 0.96).setScale(shownAt(PROP_SCALE)).setDepth(p.y)),
      );
      // The catwalk's grate bridged out to it, over the open air between.
      const grates = bridgesTo([lotId]).map((b, i) =>
        this.add.image(b.x + b.w / 2, b.y + b.h / 2, bridgeTex(this, `lot-grate-${lotId}-${i}`, b, b.along)).setScale(1 / HS).setDepth(-8), // over the lot's deck edge
      );
      this.booths.set(id, [deck, booth, ...props, ...grates]);
    }
    for (const n of NPCS) {
      const p = this.npcAt(n.id);
      this.npcs.get(n.id)!.setVisible(isAboard(this.s, n.id, all)).setPosition(p.x, p.y + 6).setDepth(p.y + 6);
    }
    this.pets.show(this.s, dogNameOf(talkSave.get().flags));
    const stage = cityStage(this.s, all);
    if (stage !== this.shownStage) {
      this.shownStage = stage;
      this.windowImg.setTexture(windowTex(this, stage));
      this.k.lights.lit(this.windowImg);
    }
    this.hl?.lots(this.s.stations, this.s.missions);
    this.hud.stores(this.s);
    this.showTitle();
    if (this.hud.panelKind === 'window') this.openStation('window');
    if (this.near?.kind === 'npc' && !isAboard(this.s, this.near.id, all)) this.near = null;
  }

  /** The land below is the next course's as the hub opens (painting it costs about 0.8 s, so it happens once, under the transition). */
  /** The opened lands (`landings.ts`: by the bosses down), with the dev overrides on them. */
  lands(): Land[] {
    const talk = talkSave.get(), lines = lineSave.get(), facts = factsFor(this.s, '', talk, lines);
    return landings(this.s, { ether: this.has('ether') }).map((l) => {
      const o = this.over[l.biome];
      const land = o ? landFor(l.biome, o.anomaly ?? l.anomaly, o.tier ?? l.tier, l.seed, this.s) : l;
      // The quests' pips on the land's row (P38): the steps it can advance, who waits there.
      const job = jobFor(land, aboard(this.s, this.allRescued).map((n) => n.id), princessSave.get().flown ?? []);
      return { ...land, repeatable: job ? jobText(job, npc(job.giver)?.name ?? job.giver) : null, pips: landPips({ talk, lines, hub: this.s, facts, biome: land.biome, places: () => placesOf(land.seed, land.biome) }) };
    });
  }

  /** The picked land: where the lift goes down. */
  landing(): Land {
    return picked(this.lands(), this.s.biome);
  }

  /** Pick a land: the land below turns to it (a short hitch). */
  pickLand(biome: BiomeId) {
    const was = this.landing();
    this.save({ ...this.s, biome });
    const now = this.landing();
    if (now.biome !== was.biome || now.seed !== was.seed) this.paintBelow();
  }

  private paintBelow() {
    const l = this.landing(), m = generate(l.seed, undefined, undefined, l.biome);
    this.below.setTexture(paintGround(this, m)).setScale(2 * BELOW.scale);
    // The land below is alive too; we are the D-city, so no D-city shadow passes over it (ours is drawn).
    this.liveBelow?.destroy();
    this.liveBelow = new GroundLive(this, { w: m.w * T, h: m.h * T, seed: l.seed, paint: BIOMES[l.biome].paint, below: false, depth: -29.5, look: { zep: false } });
    this.liveBelow.follow(this.below);
  }

  save(next: HubState) {
    this.s = hub.set(next);
    if (this.scene.isActive()) this.refresh();
  }

  /** Remember where the Communicator stopped (written when he stops walking; no redraw). */
  savePos(x: number, y: number) {
    const at = { x: Math.round(x), y: Math.round(y) };
    if (this.s.at?.x === at.x && this.s.at?.y === at.y) return;
    this.s = hub.set({ ...this.s, at });
  }

  update(_t: number, ms: number) {
    const dt = Math.min(0.05, ms / 1000);
    const input = inputFor(this);
    if (!this.hud.attached) {
      this.hud = new HubHud(this.registry.get('ui'));
      this.hud.stores(this.s);
      this.near = null;
    }
    if (this.t.allRescued !== this.shownAll) {
      this.shownAll = this.t.allRescued;
      this.refresh();
    }
    this.hud.update(dt);
    this.shade.update();
    this.guide.update(dt);
    this.animate(dt);
    this.pets.update(this.me);
    this.her.update(dt);
    this.hoverStep();
    if (this.cut) return;
    if (input.pressed('guide')) this.guide.toggle();
    if (input.pressed('inventory') && !this.convo && !this.log.open && !this.guide.open) {
      // A station panel open: I closes it and opens the satchel in one press (once the Oracle has blessed it).
      if (this.hud.panel) {
        if (this.has('inventory')) {
          this.closePanel();
          this.inv.toggle();
        }
      } else if (this.has('inventory') || this.inv.open) this.inv.toggle();
      else this.hud.say('The Oracle', 'Your satchel is not blessed yet, Communicator. Come and hear me out.');
    }
    if (input.pressed('journal') && !this.convo && !this.hud.panel && !this.inv.open && !this.guide.open) this.log.toggle();
    if (this.inv.open || this.log.open || this.guide.open) {
      this.walk(0, 0, dt);
      return;
    }
    if (this.convo) {
      this.talking(input, dt);
      this.walk(0, 0, dt);
      return;
    }
    if (this.hud.panel) {
      if (input.pressed('use')) {
        if (this.hud.panelKind === 'command') this.launch();
        else this.closePanel();
      }
      this.walk(0, 0, dt);
      return;
    }
    let mx = input.axis('moveX'), my = input.axis('moveY');
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.walk(mx, my, dt);
    const near = inReach(this.me.x, this.me.y, this.things());
    if (near?.id !== this.near?.id) {
      this.near = near;
      if (near) this.k.audio.sfx.play('near', { at: { x: near.x, y: near.y } });
      this.hud.prompt(near ? `{use} ${near.verb}` : null);
    }
    if (near && input.pressed('use')) this.use(near);
  }

  private walk(mx: number, my: number, dt: number) {
    const me = this.me;
    const booths = boothBlocks(this.s.stations);
    const blocks = [
      { x: TABLE.x, y: TABLE.y, r: 100 },
      { x: BENCH.x, y: BENCH.y - 15, r: 70 },
      { x: LEVER.x, y: LEVER.y, r: 26 },
      ...booths,
      ...aboard(this.s, this.t.allRescued).map((n) => ({ ...this.npcAt(n.id), r: 34 })),
    ];
    this.walked = mx || my ? this.walked + dt : 0;
    const speed = hubSpeed(this.walked);
    const p = move(me, mx * speed * dt, my * speed * dt, blocks);
    const dx = p.x - me.x, dy = p.y - me.y;
    const was = this.moving;
    this.moving = Math.hypot(dx, dy) > 0.05;
    if (was && !this.moving) this.savePos(p.x, p.y);
    me.setPosition(p.x, p.y);
    if (this.moving) {
      this.dir = commDir(dx, dy);
      if (Math.abs(dx) > 0.05) this.face = Math.sign(dx);
    }
    this.bob += dt * (this.moving ? 13 * (speed / 190) ** 0.5 : 2.5);
    // Footfalls: a step lands every PI of the stride with a small squash and a boot on the deck.
    const step = Math.floor(this.bob / Math.PI);
    const dl = Math.hypot(dx, dy) || 1;
    const lean = this.stride.update(dt, speed, this.moving, dx / dl, dy / dl, p.x, p.y);
    if (this.moving && step !== this.step) {
      this.stride.dust(p.x, p.y, dx / dl, dy / dl);
      this.sq.v -= 0.05 * 30;
      this.k.audio.sfx.play(stepSound('deck'), { at: { x: p.x, y: p.y } });
    }
    this.step = step;
    this.sq.v += (-this.sq.s * 420 - this.sq.v * 16) * dt;
    this.sq.s += this.sq.v * dt;
    const base = atlas(this).scaleOf('communicator/back-0');
    me.setFrame(commFrame(this.dir, this.bob, this.moving)).setFlipX(commFlip(this.dir, this.face)).setAngle(lean);
    me.setScale(base * (1 - this.sq.s * 0.7), base * (1 + this.sq.s)).setDepth(p.y);
    const room = roomAt(p.x, p.y);
    this.hud.room(room?.name ?? 'Catwalk');
    // The camera follows him; in a conversation it eases in on the NPC, and back out after.
    const cam = this.cameras.main;
    const f = this.focus(p);
    const settling = !!this.convo || Math.abs(cam.zoom - ZOOM) > 0.02;
    const k = Math.min(1, dt * (settling ? 3.4 : 5));
    cam.setZoom(cam.zoom + (f.zoom - cam.zoom) * Math.min(1, dt * 3.4));
    cam.scrollX += (f.x - cam.width / 2 - cam.scrollX) * k;
    cam.scrollY += (f.y - cam.height / 2 - cam.scrollY) * k;
  }

  /** What the camera looks at, and how close. */
  private focus(me: { x: number; y: number }) {
    if (!this.convo) return { x: me.x, y: me.y - 30, zoom: ZOOM };
    const id = this.convo.id;
    const n = this.npcAt(id);
    // Close enough that the figure is about TALK.size px tall on screen: a tall Oracle on her throne gets less zoom than the Trader.
    const h = (this.npcs.get(id)?.height ?? 100) * (this.npcBase.get(id) ?? 1);
    return { x: n.x + (me.x - n.x) * TALK.toward, y: n.y - TALK.lift, zoom: Phaser.Math.Clamp(TALK.size / h, TALK.min, TALK.max) };
  }

  /** Idle life: NPCs breathe, the night's lights ease (hublight.ts), the station in reach glows and its ring pulses. */
  private animate(dt: number) {
    const now = this.time.now / 1000;
    let i = 0;
    for (const [id, img] of this.npcs) {
      const b = Math.sin(now * 2.2 + i++) * 0.02;
      const k = this.npcBase.get(id) ?? 1 / HS;
      if (this.convo?.id === id) continue; // acted out below
      img.setScale(k * (1 - b * 0.5), k * (1 + b)).setAngle(0);
    }
    this.perform(dt, now);
    this.marker.x = TABLE.x - 40 + Math.sin(now * 0.4) * 20;
    this.marker.y = TABLE.y + Math.cos(now * 0.3) * 8;
    // The Wanderer drifts: the land slides by below (back and forth over a few minutes), the clouds a little faster.
    this.below.x = belowAt(DECK.w, 1280) + Math.sin(now / 60) * 200;
    if (this.liveBelow) {
      this.liveBelow.follow(this.below);
      const land = this.hl.landLook();
      this.liveBelow.update(dt, land.night, land.ambient, this.below.x, this.below.y);
    }
    this.air?.update(dt, 0, 0xffffff, this.me.x, this.me.y);
    this.clouds.forEach((cl, i) => {
      cl.x -= dt * (14 + i * 3);
      if (cl.x < -500) cl.x = DECK.w + 500;
    });
    this.pingT = Math.max(0, this.pingT - dt);
    this.hl.update(dt, this.me, facingOf(this.dir, this.face));
    this.tip.setPosition(this.me.x, this.me.y - this.me.displayHeight * 0.97).setIntensity(this.pingT > 0 ? 0.25 + 0.5 * Math.abs(Math.sin(this.pingT * 9)) : 0);
    const g = this.ring;
    g.clear();
    const n = this.near;
    if (n && !this.hud.panel) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 5);
      const r = n.kind === 'npc' ? 30 : n.id === 'command' ? 130 : n.id === 'lift' ? 40 : 70;
      g.lineStyle(3, 0xf0cf7a, 0.45 + 0.4 * pulse).strokeEllipse(n.x, n.y + 6, r * 2, r * 0.9);
      g.lineStyle(8, 0xffb640, 0.12 * pulse).strokeEllipse(n.x, n.y + 6, r * 2 + 10, r * 0.9 + 6);
      this.glow.setPosition(n.x, n.y - 30).setIntensity(0.5 + 0.3 * pulse);
    } else this.glow.setIntensity(0);
    this.guideStep(g, now);
  }

  /** The first visit's guide: the deck dims and the next place glows, its ring turning (`firstvisit.ts`). Nothing forces the order. */
  private guideStep(g: Phaser.GameObjects.Graphics, now: number) {
    const to = guideTarget({
      missions: this.s.missions,
      mainStep: stepOf(talkSave.get(), 'main'),
      picks: picksWaiting(),
      sprocketAboard: isAboard(this.s, 'sprocket', this.t.allRescued),
      sprocketTaught: this.s.perks.includes('workshop'),
      tableSeen: this.memo('guide', () => ({ table: false })).table,
    });
    const dim = !!to && !this.t.allRescued;
    if (dim !== this.dimmed) {
      this.dimmed = dim;
      this.hl.dim(dim);
    }
    const at = dim && to ? this.spotOf(to) : null;
    if (!at) return void this.guideLight.setIntensity(0);
    const pulse = 0.5 + 0.5 * Math.sin(now * 3);
    this.guideLight.setPosition(at.x, at.y - 70).setIntensity(1.2 + 0.6 * pulse);
    g.lineStyle(4, 0xfff0c0, 0.5 + 0.4 * pulse).strokeEllipse(at.x, at.y - 40, 110 + 12 * pulse, 44 + 5 * pulse);
    g.lineStyle(10, 0xffb640, 0.14 * pulse).strokeEllipse(at.x, at.y - 40, 124 + 12 * pulse, 56 + 5 * pulse);
  }

  use(t: Thing) {
    if (t.id === 'lift') return this.launch();
    if (t.id === 'sweepings') return this.her.pickUp();
    if (t.kind === 'station') return this.openStation(t.id as StationId);
    this.talkTo(t.id);
  }

  /** A booth goes up on a lot: hammering, a shake, sparks (the NPC moves in and greets you there). */
  raised(lot: string) {
    this.k.audio.sfx.play('latch');
    this.k.audio.sfx.play('lift', { gain: 0.5 });
    this.k.juice.shake('medium');
    const at = stationAt(lot);
    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(i * 90, () => {
        const x = at.x + Phaser.Math.Between(-90, 90), y = at.y + Phaser.Math.Between(-40, 60);
        this.k.fx.burst(x, y, { color: i % 2 ? 0xffd98a : 0xc8a070, size: 1.2 });
      });
    }
  }

  /** Save a new arrangement of the stations: tear down the booths that moved, put them up again, and keep the Communicator on the deck. */
  moveStations(next: HubState) {
    for (const [id, lot] of Object.entries(this.s.stations)) {
      if (next.stations[id] === lot) continue;
      this.booths.get(id)?.forEach((o) => o.destroy());
      this.booths.delete(id);
    }
    this.save(next);
    if (!walkable(this.me.x, this.me.y)) {
      const lot = next.stations.cityPlanner;
      const p = lot ? stationAt(lot).npc : ARRIVE;
      this.me.setPosition(p.x + (lot ? 70 : 0), p.y);
      this.savePos(this.me.x, this.me.y);
    }
  }

  /** An NPC line in the speaker panel; the Oracle (the `highPriest` NPC, on her throne at the altar) speaks with her face and chirp, and the antenna answers. */
  speak(id: string, text: string) {
    const n = npc(id)!;
    const oracle = id === 'highPriest';
    this.hud.say(n.name, text, oracle);
    this.pingT = 1.6;
    this.k.audio.sfx.play(oracle ? 'blip' : 'heal', { gain: 0.6 });
    const img = this.npcs.get(id);
    if (img) this.tweens.add({ targets: img, y: img.y - 6, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
  }

  // ------------------------------------------------------------ talking

  /** The NPC's portrait for the glass: the painted bust, else their sprite (the painted figure or the drawn one), enlarged. */
  private portraitOf(id: string): string | null {
    const tex = this.textures.get('atlas');
    for (const f of [`npc/portrait-${id}`, `npc/${id}`]) if (tex.has(f)) return this.textures.getBase64('atlas', f) ?? null;
    if (this.textures.exists(`npc-portrait-${id}`)) return this.textures.getBase64(`npc-portrait-${id}`) ?? null; // drawn (`art/portraits.ts`)
    return this.textures.exists(`npc-${id}`) ? this.textures.getBase64(`npc-${id}`) ?? null : null;
  }

  /**
   * Talk to an NPC: the camera eases in on them, a brass frame slides up with their portrait, they act their lines
   * out and the replies are levers (`dialog.ts`, scripts in `talk.ts`). One without a script just opens their panel.
   */
  talkTo(id: string) {
    const n = npc(id)!;
    const script = SCRIPTS[id];
    if (!script) return openFor(this, id);
    const c = new Conversation(id, script, talkSave.get(), factsFor(this.s, id, talkSave.get(), lineSave.get(), undefined, id === 'princess' ? this.her.facts() : {}));
    talkSave.set(c.talk);
    this.convo = { id, c };
    this.rush = false;
    this.near = null;
    this.hud.prompt(null);
    // He turns to them.
    const p = this.npcAt(id);
    this.dir = commDir(p.x - this.me.x, p.y - this.me.y);
    if (Math.abs(p.x - this.me.x) > 1) this.face = Math.sign(p.x - this.me.x);
    const host = (this.registry.get('ui') as HTMLElement).querySelector('.hb-hud') as HTMLElement;
    this.tv = new TalkView(host, {
      advance: () => this.advance(),
      thunk: () => {
        this.k.audio.sfx.play('thunk');
        this.k.juice.shake('small');
      },
      pick: (i) => this.pick(i),
      select: () => this.k.audio.sfx.play('ratchet'),
    });
    this.tv.open({ name: n.name, role: NPC_ROLE[id] ?? '', portrait: this.portraitOf(id) });
    this.k.audio.sfx.play('latch');
    this.k.audio.sfx.play('lift', { gain: 0.25 });
    this.time.delayedCall(520, () => this.convo?.id === id && this.beat());
  }

  /** Show what the conversation is at: a line (typed, acted) or the levers, or the end. */
  private beat() {
    const cv = this.convo;
    if (!cv || !this.tv) return;
    const { c } = cv;
    if (c.phase !== 'line') this.flush();
    if (c.phase === 'line') {
      this.tv.say(c.line!.t);
      if (this.rush) this.tv.complete();
      this.rush = false;
      this.k.audio.sfx.play('tgFeed');
      this.gesture(c.line!);
    } else if (c.phase === 'choose') {
      const ws = c.weights;
      this.tv.choose(c.choices.map((x, i) => ({ text: x.text, weight: ws[i] })));
      this.k.audio.sfx.play('latch', { gain: 0.5 });
    } else this.endTalk();
  }

  /** The name plate under the room: the Communicator with the title worn; a click puts on the next one. */
  showTitle() {
    const t = titleSave.get();
    this.hud.me(styled(t), t.worn, t.earned.length, () => {
      titleSave.set(nextWorn(titleSave.get()));
      this.k.audio.sfx.play('latch', { gain: 0.4 });
      this.showTitle();
    });
  }

  /** Keep what a paid rule returned: the copper leaves the stock and the hub state changes (`buildStation`). */
  pay(b: Books) {
    economy.set(b.eco);
    this.save(b.hub);
  }

  /** Save the talk and do what its effects asked: rewards, banners, a panel to open when it ends. */
  private flush() {
    const cv = this.convo;
    if (!cv) return;
    talkSave.set(cv.c.talk);
    for (const o of cv.c.out.splice(0)) {
      if (o.kind === 'give') {
        this.save(giveReward(this.s, o.reward));
        economy.set(settleScrap(economy.get(), o.reward));
        for (const b of payExtras(o.reward)) this.hud.banner(b, 3600);
        if (o.reward.boost) {
          // Sprocket's `sprocket.2`: one type's deed gauges fill 25% faster, for good.
          const g = grantBoost(profile.get(), o.reward.boost);
          profile.set(g.profile);
          this.hud.banner(`${TYPES[g.type].name} gauges fill 25% faster`, 3600);
        }
        this.k.audio.sfx.play('pickup');
      } else if (o.kind === 'banner') this.hud.banner(o.text);
      else if (o.kind === 'quest') {
        const q = QUESTS[o.id];
        const title = o.step === 99 && q?.grants ? TITLES[q.grants] : undefined;
        if (title) {
          // Finishing a line earns its title: worn at once if it is the first, a click on the name plate otherwise.
          titleSave.set(earn(titleSave.get(), q!.grants!));
          this.showTitle();
          this.hud.banner(`${q!.title}: done. Title: ${title.name}`, 4200);
        } else this.hud.banner(!q ? o.id : o.step === 99 ? `${q.title}: done` : o.step === 1 ? `${q.title}: begun` : `${q.title}: ${q.steps[o.step - 1]}`);
        this.k.audio.sfx.play('bell', { gain: 0.35 });
        this.hud.notice('Quest log updated: press {journal}');
      } else if (o.panel === 'house') this.after = () => openBuild(this, 'home');
      else if (o.panel === 'stolen') this.after = () => this.stolen();
      else if (o.panel === 'outro') this.after = () => this.outro();
      else if (o.panel === 'research') this.after = () => openChurch(this);
      else this.after = () => openFor(this, cv.id);
    }
  }

  /** Click or Use on a line: finish typing it, then the next. */
  advance() {
    const cv = this.convo;
    if (!cv || !this.tv) return;
    // Use while the frame still slides in: the first line comes up whole instead of being skipped unseen.
    if (this.tv.blank) {
      this.rush = true;
      return;
    }
    if (this.tv.typing) return this.tv.complete();
    if (cv.c.phase !== 'line') return;
    cv.c.next();
    this.beat();
  }

  /** Use was pressed before the first line was on the tape: show it whole when it comes. */
  private rush = false;

  /** A lever was pulled (the frame says which, after its thunk). */
  private pick(i: number) {
    const cv = this.convo;
    if (!cv) return;
    cv.c.pick(i);
    this.flush();
    this.beat();
  }

  private endTalk() {
    const cv = this.convo;
    if (!cv) return;
    this.flush();
    talkSave.set(cv.c.talk);
    this.tv?.close();
    this.tv = null;
    this.convo = null;
    this.act = null;
    this.nsq = { s: 0, v: 0 };
    this.k.audio.sfx.play('click', { gain: 0.6 });
    const img = this.npcs.get(cv.id);
    if (img) {
      const p = this.npcAt(cv.id);
      img.setPosition(p.x, p.y + 6).setAngle(0);
    }
    this.near = null; // re-announced next frame
    const go = this.after;
    this.after = null;
    if (go) this.time.delayedCall(450, go); // the camera is already on its way back
  }

  /** Walk away mid-sentence (Esc): what was said stays said. */
  leaveTalk() {
    this.convo?.c.leave();
    this.endTalk();
  }

  /** While a conversation runs: type, tick, and read Use and the up/down choice. */
  private talking(input: ReturnType<typeof inputFor>, dt: number) {
    const tv = this.tv;
    const cv = this.convo;
    if (!tv || !cv) return;
    if (!tv.attached) return this.leaveTalk(); // the UI root was rewritten under us
    const typed = tv.update(dt);
    for (const ch of typed) {
      if (ch === ' ') continue;
      if (this.talkChars++ % 2 === 0) this.k.audio.sfx.play('tgTick');
      if (this.talkChars % 3 === 0) this.nsq.v -= 1.1; // the NPC mumbles along: a small bob every few letters
    }
    if (input.pressed('use')) {
      if (tv.choosing) tv.pull();
      else this.advance();
    }
    if (tv.choosing) {
      if (input.pressed('up')) tv.select(tv.selected - 1);
      else if (input.pressed('down')) tv.select(tv.selected + 1);
    }
  }
  private talkChars = 0;

  /** A line starts: the NPC makes its gesture and vents steam; the Oracle's antenna answers. */
  private gesture(line: Line) {
    const id = this.convo!.id;
    this.act = { kind: actFor(line), t: 0, puffed: 0 };
    if (id === 'highPriest') {
      this.pingT = 1.2;
      this.k.audio.sfx.play('blip', { gain: 0.45 });
    }
  }

  /** The NPC in conversation, acted out each frame: the gesture, the mumble spring, the steam. */
  private perform(dt: number, now: number) {
    const cv = this.convo;
    const img = cv && this.npcs.get(cv.id);
    if (!cv || !img) return;
    const base = this.npcAt(cv.id);
    const k = this.npcBase.get(cv.id) ?? 1 / HS;
    const toward = Math.sign(this.me.x - base.x) || 1;
    // Squash spring (the mumble, the landing of a hop).
    const q = this.nsq;
    q.v += (-q.s * 420 - q.v * 16) * dt;
    q.s += q.v * dt;
    let s = q.s, dy = 0, rot = 0;
    const a = this.act;
    if (a) {
      const g = GESTURE[a.kind];
      const was = a.t;
      a.t += dt;
      const u = Math.min(1, a.t / g.dur);
      const sw = Math.sin(Math.PI * u);
      const fade = 1 - u;
      switch (a.kind) {
        case 'nod': s += -0.07 * sw; dy = 2 * sw; rot = toward * 0.02 * sw; break;
        case 'hop': s += u < 0.14 ? -0.13 * (u / 0.14) : 0.1 * sw; dy = u < 0.14 ? 0 : -16 * sw; break;
        case 'lean': s += 0.03 * sw; rot = toward * 0.11 * Math.min(1, sw * 1.5); break;
        case 'wave': rot = 0.12 * Math.sin(a.t * 22) * fade; dy = -3 * Math.abs(Math.sin(a.t * 11)) * fade; break;
        case 'shrug': s += 0.06 * Math.sin(2 * Math.PI * u); dy = -3 * sw; rot = 0.05 * Math.sin(2 * Math.PI * u); break;
        case 'laugh': dy = -6 * Math.abs(Math.sin(a.t * 15)) * fade; s += 0.05 * Math.sin(a.t * 63) * fade; rot = 0.04 * Math.sin(a.t * 15) * fade; break;
        case 'point': s += 0.08 * sw; rot = toward * 0.16 * Math.min(1, sw * 1.6); dy = -2 * sw; break;
        case 'huff': s += u < 0.5 ? 0.09 * (u / 0.5) : u < 0.7 ? -0.1 * Math.sin(Math.PI * ((u - 0.5) / 0.2)) + 0.09 * (1 - (u - 0.5) / 0.2) : 0; break;
      }
      for (; a.puffed < g.puffs.length && g.puffs[a.puffed] <= a.t; a.puffed++) this.puff(img, a.kind);
      if (was < g.dur && a.t >= g.dur && a.kind === 'hop') q.v -= 4; // lands
      if (a.t > g.dur + 0.1) this.act = null;
    }
    // They breathe while they talk, too.
    const b = Math.sin(now * 2.2) * 0.02;
    img.setScale(k * (1 - (b + s) * 0.5), k * (1 + b + s)).setAngle(Phaser.Math.RadToDeg(rot)).setPosition(base.x, base.y + 6 + dy);
    this.tv?.pose(b + s, rot);
  }

  /** A puff of steam from the NPC's head (and the glass fogs a little). */
  private puff(img: Img, kind: Act) {
    const big = kind === 'huff' || kind === 'laugh' || kind === 'hop';
    const x = img.x + Phaser.Math.Between(-10, 10), y = img.y - img.displayHeight * 0.9;
    const p = this.add.image(x, y, 'hub-cloud').setScale(big ? 0.1 : 0.07).setAlpha(0.8).setDepth(img.depth + 5).setTint(0xfff1da).setAngle(Phaser.Math.Between(-20, 20));
    this.k.lights.unlit(p);
    this.tweens.add({
      targets: p,
      x: x + Phaser.Math.Between(-18, 18) + (kind === 'huff' ? 22 : 0),
      y: y - (big ? 62 : 40),
      scale: big ? 0.36 : 0.26,
      alpha: 0,
      duration: big ? 1000 : 800,
      ease: 'Sine.easeOut',
      onComplete: () => p.destroy(),
    });
    this.k.audio.sfx.play('hiss', { gain: big ? 0.3 : 0.18, at: { x, y } });
    if (big) this.tv?.fog();
  }

  openStation(id: StationId) {
    const wasOpen = !!this.hud.panel;
    if (!STATION_PANELS[id](this)) return;
    if (id === 'command') this.memo('guide', () => ({ table: false })).table = true; // the first visit's guide moves on to the lift
    if (!wasOpen) this.panelOpened();
  }

  panelOpened() {
    this.k.audio.sfx.play('latch');
    this.hud.prompt(null);
    this.k.juice.shake('small');
  }

  closePanel() {
    this.hud.close();
    this.k.audio.sfx.play('click', { gain: 0.6 });
    this.near = null; // re-announced next frame
  }

  /** A dev override on the picked land's anomaly or tier (kept until the scene restarts). */
  override(o: { anomaly?: AnomalyId; tier?: number }) {
    const b = this.landing().biome;
    this.over[b] = { ...this.over[b], ...o };
    if (this.hud.panelKind === 'command') this.openStation('command');
  }

  /** A dev change to what is open: the bosses down (saved). */
  setBosses(bosses: string[]) {
    this.save({ ...this.s, story: { ...this.s.story, bosses } });
    if (!this.lands().some((l) => l.biome === this.s.biome)) this.pickLand(this.lands()[0].biome);
    if (this.hud.panelKind === 'command') this.openStation('command');
  }

  /**
   * The way back to the sands: the lift goes down to the course on the command table. It costs nothing, and the pack
   * refills with cans (`depart`, economy.ts).
   */
  launch(): number {
    const c = this.landing();
    // The mission's quest lines count it in this land (carry.ts); the next lowering rolls its anomalies and seeds anew.
    // The colony's expedition goes out with it (coal fed at the Expedition office) and comes home with the next lift.
    this.save({ ...dispatch(this.s), biome: c.biome, course: this.s.course + 1 });
    questBook.set({ ...questBook.get(), job: jobFor(c, aboard(this.s, this.allRescued).map((n) => n.id), princessSave.get().flown ?? []) }); // flying a land takes its repeatable job (P38)
    this.hud.close();
    this.k.audio.sfx.play('lift', { gain: 0.6 });
    this.k.juice.shake('medium');
    transition(this, 'Play', { seed: c.seed, biome: c.biome, tier: c.tier, anomaly: c.anomaly });
    return c.seed;
  }

  /** What the main quest has opened (hub/story.ts). */
  has(f: Feature) {
    return features(talkSave.get()).has(f);
  }

  /** A cut scene is playing: the Communicator stands still and the camera is the scene's. */
  cut: (() => void) | null = null;

  /** The blessing: the Evil Oracle takes the wife (cutscene.ts). After it she is gone from the deck and the Ether is on the course table. */
  stolen() {
    const oracle = this.npcs.get('highPriest');
    const princess = this.npcs.get('princess');
    if (!oracle || !princess) return;
    this.hud.close();
    // "We are ready" has already moved the quest past the blessing, so `npcAt` puts her back home: she walks to the altar
    // from wherever she stands while the camera pans there.
    const at = { x: SPOTS.altar.x + 90, y: SPOTS.altar.y + 46 };
    this.tweens.killTweensOf(princess);
    princess.setVisible(true).setAlpha(1);
    this.tweens.add({
      targets: princess,
      x: at.x,
      y: at.y,
      duration: Phaser.Math.Clamp(Phaser.Math.Distance.Between(princess.x, princess.y, at.x, at.y) * 1.4, 300, 1800),
      ease: 'Sine.easeInOut',
      onUpdate: () => princess.setDepth(princess.y),
    });
    const evil = npcImage(this, 0, 0, 'evilOracle').setOrigin(0.5, 1).setVisible(false);
    this.cut = playCutscene(
      {
        scene: this,
        ui: this.registry.get('ui'),
        oracle,
        princess,
        evil,
        evilAt: { x: SPOTS.altar.x - 110, y: SPOTS.altar.y + 46 },
        sfx: (key, gain) => this.k.audio.sfx.play(key, { gain }),
        shake: (size) => this.k.juice.shake(size),
        burst: (x, y, color, size) => this.k.fx.burst(x, y, { color, size }),
        flash: (x, y, color) => {
          const l = this.k.lights.add(x, y, { color, radius: 260, intensity: 2.4 });
          this.tweens.add({ targets: l, intensity: 0, duration: 700, onComplete: () => this.k.lights.remove?.(l) });
        },
      },
      STOLEN,
      () => {
        this.cut = null;
        evil.destroy();
        this.tweens.killTweensOf(princess);
        princess.setAlpha(1).clearTint().setAngle(0).setScale(this.npcBase.get('princess') ?? princess.scaleX);
        this.keepStory();
        this.refresh();
        this.hud.banner('The Ether is on the course table', 4200);
      },
    );
  }

  /** The end (outro.ts): the last boss's hand-in is done; the time to finish is kept on the first finish. The deck goes on after. */
  outro() {
    this.hud.close();
    this.cut = playOutro(
      this.registry.get('ui'),
      { time: finishRun(), missions: this.s.missions },
      () => {
        this.cut = null;
        this.refresh();
      },
      (key) => this.k.audio.sfx.play(key, { gain: 0.4 }),
    );
  }

  /** The save agrees with the quest: past the blessing and before the Evil Oracle falls, the wife is gone (a reload mid-scene). */
  keepStory() {
    const step = stepOf(talkSave.get(), 'main');
    const st = this.s.story;
    if (step >= STEP.ghost && step !== 99 && !st.evil && st.wife !== 'stolen') this.save({ ...unrescue(this.s, 'princess'), story: { ...st, wife: 'stolen' } });
  }

  debugState() {
    const s = this.s;
    const inventory = this.inv?.state();
    const questLog = this.log?.state();
    const all = this.t?.allRescued ?? false;
    const st = s ? cityStage(s, all) : 0;
    return {
      inventory,
      questLog,
      guide: this.guide?.state(),
      rescued: s?.rescued,
      aboard: s && aboard(s, all).map((n) => n.id),
      allRescued: all,
      cityCopper: s?.city,
      stationCost: s && stationCost(s),
      stations: s?.stations,
      waiting: s && waiting(s, all).map((n) => n.id),
      perks: s?.perks,
      cityStage: st,
      city: CITY_STAGES[st].name,
      near: this.near?.id ?? null,
      hover: this.hover?.id ?? null,
      panel: this.hud?.panelKind ?? null,
      room: this.me && (roomAt(this.me.x, this.me.y)?.id ?? 'corridor'),
      light: this.hl?.debug(),
      me: this.me && { x: Math.round(this.me.x), y: Math.round(this.me.y), dir: this.dir, moving: this.moving },
      parts: s?.parts,
      robots: s?.robots.map((r) => r.name),
      roster: (() => {
        const r = roster.get();
        return { cores: economy.get().cores, riding: riders(r).map((b) => b.uid), bots: r.bots.map(botLine), chassis: r.chassis };
      })(),
      missions: s?.missions,
      nextSeed: s && this.landing().seed,
      lands: s && this.lands().map((l) => ({ biome: l.biome, anomaly: l.anomaly, tier: l.tier, seed: l.seed, boss: l.boss, bossDown: l.bossDown, stranded: l.stranded })),
      picked: s && this.landing().biome,
      stranded: s?.stranded,
      buildings: s?.buildings,
      citySlots: s && slotsOf(s, all),
      blueprints: s && offer(s),
      expedition: s?.expedition,
      civilians: s?.civilians,
      slots: SLOTS.map((x) => x.id),
      lastHaul: s?.lastHaul?.id ?? null,
      talk: {
        with: this.convo?.id ?? null,
        phase: this.convo?.c.phase ?? null,
        node: this.convo?.c.node ?? null,
        gesture: this.act?.kind ?? null,
        zoom: Math.round(this.cameras.main.zoom * 100) / 100,
        frame: this.tv?.state() ?? null,
        ...talkSave.get(),
      },
      titles: titleSave.get(),
      princess: this.her?.debug(),
      lines: activeLines(talkSave.get(), lineSave.get(), factsFor(s, '')),
    };
  }
}

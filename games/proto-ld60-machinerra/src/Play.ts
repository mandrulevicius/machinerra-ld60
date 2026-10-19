/**
 * The ground mission scene: sets the land up (the Sim from `missionstart.ts`, the ground, the HUD and panels), reads input,
 * steps the sim and runs the frame. Everything the player sees and hears is made by a view (`playhost.ts`): Play keeps them
 * in `views`, in the order they update (what the shared lines draw over follows it), and gives each sim event to each. No
 * rules here (they are in src/sim/). The map overlay pauses the mission; command mode slows it (`mapPace`). `Dungeon` is this
 * scene run down a dungeon.
 *
 * Text added to the scene is made at resolution 2 (`create` sets it on every Text), so it stays sharp up to zoom 1.5.
 * Add a HUD piece, enemy look or beat: a view (see `playhost.ts`) and one line in `makeViews`. A dev command: a file in `dev/`.
 * Gameplay values are live tunes (F10, Kit tab). Design notes: docs/design/.
 */
import Phaser from 'phaser';
import { loadAtlas } from '../../../harness/kit/assets';
import { createWorld, hint, inputFor, kit, onEscape, tune, type SceneKit, type World } from '../../../harness/kit';
import { GROUND_PX, S, SIZE, freeGround, makeArt, paintGround } from './art';
import { Hud, useOracleFace, usePrincessFace } from './hud';
import { MapView } from './mapview';
import { CommandMode } from './commandmode';
import { Selection } from './sim/command';
import { LANDS, LAND_IDS } from './sim/lands';
import { ANOMALIES, BERSERK, BIOMES, DAY, HORNET, LOOT, MISSION, PARTS, STEAM, T, dockDev, type AnomalyId, type BiomeId, type PartKind } from './sim/defs';
import type { Lamp } from './lamps';
import { BURIED, FOOT, OURS, UNDRESSED, dressed, makeDressArt, paintFoes } from './biomedress';
import { clampTier } from './sim/dungeon';
import { wear } from './sim/graft';
import { NO_INPUT, Sim } from './sim/sim';
import { installSounds } from './sound';
import { hub } from './hub/save';
import { QuestLog } from './questlog';
import { Guide } from './guideview';
import { registerDev } from './dev';
import { classedThings } from './sim/classes';
import { BossView } from './bossview';
import { BotsView } from './botview';
import { ChainView } from './chainview';
import { LegView } from './legview';
import { LimbView } from './limbview';
import { ArmView } from './armview';
import { CombatFx } from './combatfx';
import { CommView } from './commview';
import { DungeonLink } from './dungeonlink';
import { FoeView } from './foeview';
import { FootView } from './footview';
import { installStepSounds } from './stepsounds';
import { GearView } from './gearview';
import { FanfareView } from './fanfare';
import { CueView } from './cueview';
import { HudFx } from './hudfx';
import { JunkView } from './junkview';
import { ModView } from './modview';
import { SkillView } from './skillview';
import { LiftView } from './liftview';
import { ClassOverlay } from './classview';
import { CompanionView } from './companionview';
import { PropView } from './propview';
import { LightView } from './lightview';
import { MissionEnd } from './missionend';
import { MusicView } from './musicview';
import { PROP_CASTS, ShadowView, contactRow, prepareShadows, sunCast } from './shadowview';
import { SupportView } from './supportview';
import { TeachView } from './teachview';
import { IntroView } from './introview';
import { CutView } from './cutview';
import { WorldView } from './worldview';
import type { BotView, CommState, G, HornetView, PlayHost, Used, View } from './playhost';
import { ring } from './playhost';
import { missionArgs, type DungeonCarry } from './missionstart';
import { entriesFor } from './guide';
import { journal } from './hub/journal';
import { lineSave, questBook, talkSave, titleSave } from './hub/talkslice';
import { trackerLines } from './hub/signals';
import { factsFor } from './hub/talk';
import { features } from './hub/story';
import { isTaught, waitingNote } from './hub/taught';
import { capExtraOf, depart, economy } from './hub/economy';
import { Inventory, gearCommands } from './inventory';
import { DryDock } from './dock/dockview';
import { dockCommands } from './dock/dockdev';
import { sceneArt } from './dock/sceneart';
import { missionSubjects } from './stats';
import { makeGearArt, texUrl } from './gearart';
import { makeNpcArt } from './hub/art';
import { makePlaceArt } from './placeart';
import { PlaceViews } from './places';
import { LiveRuins } from './ruinart';
import { BuildingView } from './buildingview';
import { SpiderViews, installSpiderSounds } from './spider';
import { CaterpillarView } from './caterpillar';
import { SignView } from './signview';
import { StatusView } from './statusview';
import { TierView } from './tierview';
import { TipView } from './tipview';

/** The overland run's ground key, freed when the next land paints its own (a dungeon's sleeping-Play keeps its own). */
let landGround = '';

export class Play extends Phaser.Scene {
  sim!: Sim;
  private k!: SceneKit;
  w!: World;
  /** The painted ground's texture key. */
  groundKey = '';
  private t!: ReturnType<typeof Play.tunes>;
  private hud!: Hud;
  private map!: MapView;
  /** Command mode (commandmode.ts) and what is picked, shared with the map. */
  cmd!: CommandMode;
  pick = new Selection();
  /** Seconds until the HUD tracker (P38) reads the quests again. */
  private trackT = 0;
  private oilSeen = false;
  seed: number | string = 1;
  /** Where the lift went down (`BIOMES`): the hub's course table picks it; `?biome=demon` too. */
  biome: BiomeId = 'desert';
  /** The landing's threat tier and anomaly (P40: the course table's card; `?tier=`, `?anomaly=`, dev `tier`, `anomaly`). */
  tier = 1;
  anomaly: AnomalyId = 'plain';
  /** A handcrafted land's id (`sim/lands.ts`: the intro on a new game, then level 1, `?land=`, dev `mission land`); null for a generated one. */
  landId: string | null = null;
  /** What every view shares (`PlayHost`): the robots and enemies on screen, the Communicator's state, what the player has done, the crew's lamps, the frame's lines. */
  private bots = new Map<number, BotView>();
  private hornets = new Map<number, HornetView>();
  comm!: CommState;
  private used: Used = { swung: false, kicked: false, shotSecondary: false };
  private lamps: Lamp[] = [];
  private gfx!: G;
  /** The engine's statuses on screen (`statusview.ts`). */
  private statuses!: StatusView;
  private ended = false;
  private mapUsed = false;
  /** Dev `timescale`: how fast the mission clock (and everything with it) runs. */
  timeScale = 1;
  /** What shows each frame, in the order it updates and hears events (`makeViews`), and the ones other code reaches for. */
  private views: View[] = [];
  light!: LightView;
  private liftView!: LiftView;
  private music!: MusicView;
  private commView!: CommView;
  private foes!: FoeView;
  feet!: FootView;
  private places!: PlaceViews;
  private gearView!: GearView;
  world!: WorldView;
  /** The dev class overlay (`classview.ts`; dev `classes`). */
  classes!: ClassOverlay;
  botsView!: BotsView;
  support!: SupportView;
  link!: DungeonLink;
  finale!: MissionEnd;
  /** The inventory (I): pauses the mission while open. */
  inv!: Inventory;
  /** The quest log (J): pauses the mission while open, like the inventory. */
  log!: QuestLog;
  private guide!: Guide;
  /** The mission's tooltips (`tipview.ts`; dev `tip`). */
  tipView!: TipView;
  /** What flies to the HUD or hovers over him when something is gained (`fanfare.ts`; dev `fanfare`). */
  fanfare!: FanfareView;

  /** `Dungeon` (below) is this scene run down a dungeon: the land's Play sleeps above until it comes back up. */
  constructor(key = 'Play') {
    super(key);
  }

  /** Down a dungeon (`sim/dungeon.ts`): what the Communicator brought down from the land, to carry on with. */
  down: DungeonCarry | null = null;
  /** The root the mission's DOM goes in: the page's, or a dungeon's own layer over the land's. */
  private ui!: HTMLElement;
  /** The land's own UI while a dungeon runs over it: hidden, then shown again. */
  private uiHost: HTMLElement | null = null;

  /** Live gameplay values: the Kit tab (F10) or the URL (`?t.swarm=2`). Read every frame, never cached. */
  static tunes(scene: Phaser.Scene) {
    return tune(scene, {
      // How fast the mission runs under the map (1 = as normal, 0 = frozen).
      mapPace: [MISSION.mapPace, 0, 1, 0.05],
      swarm: [1, 0.2, 3, 0.1],
      // The day's arrivals from off the map (`EDGE`): their count and pace.
      edge: [1, 0.2, 3, 0.1],
      hornetSpeed: [HORNET.speed, 60, 320, 5],
      steamShot: [STEAM.shot, 0, 40, 1],
      steamRegen: [STEAM.regen, 0, 100, 1],
      lootChance: [LOOT.chance, 0, 1, 0.05],
      eliteChance: [HORNET.elite.chance, 0, 1, 0.05],
      // The day (seconds of mission time, the share twisted at dusk), and past midnight the seconds a berserk step takes and what each step gives a new enemy (damage, speed, health a step, cooldowns shorter by, as shares; the hives' spawn interval x0.97 a step is `BERSERK.spawn`).
      morning: [DAY.morning, 0, 600, 5],
      day: [DAY.day, 30, 900, 5],
      evening: [DAY.evening, 30, 900, 5],
      twistStart: [DAY.twistStart, 0, 1, 0.05],
      stepEvery: [BERSERK.every, 1, 60, 1],
      berserkDmg: [BERSERK.dmg, 0, 0.2, 0.005],
      berserkSpeed: [BERSERK.speed, 0, 0.2, 0.005],
      berserkHp: [BERSERK.hp, 0, 0.2, 0.005],
      berserkCd: [BERSERK.cd, 0, 0.1, 0.005],
      music: true,
      // Dev: every NPC is already aboard (no stranded pilgrim), without touching the save. Same switch as the hub's.
      allRescued: false,
      // Dev: every workbench recipe is open (the hub's switch too, `hub/taught.ts`).
      allRecipes: false,
      // Dev: every land has an old charging dock (P58 H, `DOCK`), whatever the Princess's ladder wants.
      docks: false,
      // The crew's lamps share the light cap (`LightView.late`); off, every robot burns its own light and Phaser's cap drops the ones far from the centre.
      lampBudget: true,
      // The three-stage look (P50, D43): twisted foes charcoal, menacing ones charcoal with the menace glow; off, as before (twisted violet-red, elite red).
      stageTint: true,
    });
  }

  preload() {
    loadAtlas(this);
  }

  create(data: { seed?: number | string; land?: string; biome?: BiomeId; tier?: number; anomaly?: AnomalyId; hot?: { seed: number | string; biome?: BiomeId }; dungeon?: DungeonCarry }) {
    // The scene object outlives a restart (and the Dungeon is restarted on every descent): its Text from the last run is destroyed.
    this.down = this.scene.key === 'Dungeon' ? (data?.dungeon ?? { dayT: 0, hp: 0, steam: 0, reserve: 0, scrap: 0 }) : null;
    const url = new URLSearchParams(location.search);
    const q = url.get('seed');
    // A run replays from its seed: ?seed=, a retry, or a fresh one.
    this.seed = data?.hot?.seed ?? data?.seed ?? (q ? (isNaN(Number(q)) ? q : Number(q)) : Math.floor(Date.now() % 1e6));
    const b = data?.hot?.biome ?? data?.biome ?? url.get('biome');
    this.biome = b && b in BIOMES ? (b as BiomeId) : 'desert';
    const an = data?.anomaly ?? url.get('anomaly'), tr = Number(data?.tier ?? url.get('tier') ?? 1);
    this.anomaly = an && an in ANOMALIES ? (an as AnomalyId) : 'plain';
    this.tier = clampTier(tr || 1);
    // A new game (no mission flown) falls into the intro's old works unless the URL or the caller picked a seed or a biome.
    const lq = this.down ? null : data?.land ?? url.get('land') ?? (hub.get().missions === 0 && data?.seed === undefined && !q && !b ? 'intro' : null);
    this.landId = lq && LAND_IDS().includes(lq) ? lq : null;
    if (this.landId) {
      const L = LANDS[this.landId];
      this.seed = this.landId;
      this.biome = L.biome;
      this.anomaly = L.rules.anomaly ?? this.anomaly;
    }
    this.bots = new Map();
    this.hornets = new Map();
    this.ended = false;
    this.mapUsed = false;
    this.used = { swung: false, kicked: false, shotSecondary: false };
    this.timeScale = 1;
    this.lamps = [];

    this.k = kit(this);
    this.k.background();
    // Text in the world is drawn at 2x, so it stays sharp up to the widest zoom (1.5) instead of going soft above 1.
    const sharpen = (o: Phaser.GameObjects.GameObject) => o instanceof Phaser.GameObjects.Text && o.setResolution(2);
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, sharpen);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, sharpen));
    this.k.fx.depth = 60000;
    this.t = Play.tunes(this);
    makeArt(this);
    makeDressArt(this);
    paintFoes(this);
    makePlaceArt(this);
    makeNpcArt(this);
    makeGearArt(this);
    installSounds(this.k.audio);
    installSpiderSounds(this.k.audio);
    installStepSounds(this.k.audio);
    const hands = this.down?.hands;
    dockDev.force = !!this.t.docks;
    const sim = (this.sim = new Sim(...missionArgs({ seed: this.seed, land: this.landId, biome: this.biome, tier: this.tier, anomaly: this.anomaly, allRescued: this.t.allRescued, down: this.down, flown: url.has('flown') ? Number(url.get('flown')) : undefined, remnants: url.has('remnants') ? url.get('remnants') !== '0' : undefined })));
    sim.capExtra = capExtraOf(hub.get().perks, hub.get().buildings?.built);
    if (!this.down && !data?.hot && !sim.intro) {
      // The lift goes down with the cans `depart` takes from the stock and the air support the last mission left (paid now: a mission quit half-way keeps neither).
      const d = depart(economy.get(), { capExtra: sim.capExtra });
      economy.set(d.eco);
      sim.carryIn(sim.land?.guided ? 1 : d.cans, d.charges); // level 1 goes down with one can on the pack
    }
    if (this.down) {
      // Carry on from the land: the oil, steam, spare cans and scrap he had when he went down.
      const c = sim.controller, d = this.down;
      if (d.hp > 0) c.hp = Math.min(c.maxHp, d.hp);
      if (d.steam > 0) c.steam = Math.min(c.maxSteam, d.steam);
      sim.reserve = d.reserve;
      sim.scrap = d.scrap;
      if (hands) {
        sim.support = { ...hands.support };
        sim.call = hands.call;
        wear(sim, hands.graft); // a limb grafted on the land comes down with him
      }
    }
    const W = sim.W * T, H = sim.H * T;
    // The world kit: culling, the mark layer (stains, prints, scorch), remains and blob shadows. Ground at -10.
    const w = (this.w = createWorld(this, { width: W, height: H, depth: { marks: -9, shadows: -3.5 } }));
    prepareShadows(this, w, BIOMES[this.biome].paint);
    this.groundKey = paintGround(this, sim.run ? sim.run.paintMap : sim.map, GROUND_PX);
    if (!this.down) {
      if (landGround && landGround !== this.groundKey) freeGround(this, landGround);
      landGround = this.groundKey;
    }
    this.add.image(0, 0, this.groundKey).setOrigin(0).setScale(GROUND_PX).setDepth(-10);

    let ui: HTMLElement = this.registry.get('ui');
    if (this.down) {
      // The land's UI stays in the root, hidden; the dungeon draws its own over it and gives it back on the way up.
      const host = ui;
      for (const el of Array.from(host.children) as HTMLElement[]) el.style.visibility = 'hidden';
      ui = document.createElement('div');
      ui.className = 'mc-dungeon-ui';
      host.appendChild(ui);
      this.uiHost = host;
    }
    this.ui = ui;
    this.hud = new Hud(ui, sim, { map: () => this.toggleMap() });
    // No sky down a dungeon: no day dial.
    if (this.down || sim.intro) ui.classList.add('is-dungeon');
    useOracleFace(texUrl(this, 'atlas', 'npc/oracle-face'));
    usePrincessFace(texUrl(this, 'atlas', 'npc/princess'));
    this.hud.face(texUrl(this, 'atlas', 'communicator/portrait'));
    this.pick = new Selection();
    this.map = new MapView(ui, sim, { close: () => this.toggleMap(false), sound: (k) => this.sfx(k) }, this.pick);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.map.destroy());
    this.inv = new Inventory(ui, {
      where: 'mission',
      stores: () => {
        const e = economy.get(), h = hub.get();
        return { scrap: e.scrap, copper: e.copper, parts: h.parts, cores: e.cores };
      },
      carried: () => ({ scrap: this.sim.scrap, copper: this.sim.copper, parts: this.sim.parts }),
      changed: (g) => this.gearView.wear(g),
      sound: (k) => this.sfx(k === 'deny' ? 'click' : k === 'equip' ? 'pickup' : 'click', undefined, undefined, { gain: k === 'deny' ? 0.9 : 0.6 }),
      partIcon: (k) => texUrl(this, `part-${k}`),
      taught: (id) => isTaught(hub.get(), id, this.t.allRecipes),
      waiting: () => waitingNote(hub.get(), this.t.allRecipes),
      stats: () => missionSubjects(this.sim),
    });
    // The Dry dock on the sands (I): wearing works, the rest waits for the Wanderer.
    const dock = new DryDock(ui, {
      where: 'mission',
      inv: this.inv,
      art: sceneArt(this),
      stores: () => ({ scrap: economy.get().scrap, copper: economy.get().copper, coal: economy.get().coal, parts: hub.get().parts }),
      carried: () => ({ scrap: this.sim.scrap }),
      sound: (k) => this.sfx(k === 'equip' ? 'pickup' : 'click', undefined, undefined, { gain: k === 'deny' ? 0.9 : 0.6 }),
      taught: (id) => isTaught(hub.get(), id, this.t.allRecipes),
    });
    this.inv.attachDock(dock);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, dockCommands(dock, this.inv));
    // This run's stats count toward the quest lines once the lift docks (`land`): the log shows them as pending.
    this.log = new QuestLog(ui, {
      where: 'mission',
      data: () => journal(talkSave.get(), lineSave.get(), hub.get(), titleSave.get(), { stats: { ...this.sim.stats }, biome: this.sim.biomeId }),
      sound: () => this.sfx('click', undefined, undefined, { gain: 0.6 }),
    });
    this.makeViews();
    this.comm = this.commView.make(sim.controller);
    for (const b of sim.bots) this.botsView.add(b);
    this.dressComm();
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.centerOn(sim.controller.x, sim.controller.y);
    w.update();
    this.cmd = new CommandMode({ scene: this, sim, map: this.map, pick: this.pick, ui, audio: this.k.audio, input: inputFor(this), wash: (color) => this.hud.wash(color) });
    // The Oracle's guide (H, the Esc menu): lists the HUD on screen and points at a piece of it (guideview.ts, P28).
    this.guide = new Guide({
      where: 'mission',
      root: ui,
      entries: () => entriesFor('mission'),
      cue: () => ({ where: 'mission', missions: hub.get().missions, junk: sim.junk.length, stripSize: sim.stripSize }),
      spot: () => null,
      idle: () => !this.ended && !this.map.open && !this.cmd.on && !this.inv.open && !this.log.open && !this.guide.open,
      canOpen: () => !this.ended && !this.inv.open && !this.log.open,
      opening: () => this.toggleMap(false),
      sound: () => this.sfx('click', undefined, undefined, { gain: 0.6 }),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.guide.destroy());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.guide.commands());
    onEscape(this, () => {
      if (this.guide.open) this.guide.hide();
      else if (this.inv.open) this.inv.hide();
      else if (this.log.open) this.log.hide();
      else if (this.map.open) this.toggleMap(false);
      else if (this.cmd.on) this.cmd.toggle(false);
      else return false;
      return true;
    });
    const ctl = this.bots.get(sim.controller.id)!.spr;
    // A tool's hint shows once it is taught and its own mission has passed (the Oracle's pause teaches it there: sim/lessons.ts).
    const hinted = (t: 'map' | 'command') => !sim.intro && sim.lessons.open(t) && !sim.lessons.teaches(t);
    if (hinted('map')) hint(this, ctl, 'Press {map} for the map and your crews', { until: () => this.mapUsed, delay: 14000, gap: 44, id: 'map', size: 18 });
    if (hinted('command')) hint(this, ctl, 'Press {command} to command your crews from here', { until: () => this.cmd.used, delay: 60000, gap: 44, id: 'command', size: 18 });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ui.innerHTML = '';
      if (this.uiHost) {
        ui.remove();
        for (const el of Array.from(this.uiHost.children) as HTMLElement[]) el.style.visibility = '';
        this.uiHost = null;
      }
    });
    this.commands();
  }

  /** What views may ask of this scene (`playhost.ts`), and the views in the order they update (one line each). */
  private makeViews() {
    const p = this;
    const host: PlayHost = {
      scene: this, k: this.k, w: this.w, sim: this.sim,
      get hud() { return p.hud; },
      get guide() { return p.guide; },
      get statuses() { return p.statuses; },
      get gfx() { return p.gfx; },
      get bots() { return p.bots; },
      get hornets() { return p.hornets; },
      get comm() { return p.comm; },
      get used() { return p.used; },
      get groundKey() { return p.groundKey; },
      get land() { return { seed: p.seed, biome: p.biome, tier: p.tier, anomaly: p.anomaly, id: p.landId }; },
      get down() { return p.down; },
      get ui() { return p.ui; },
      get ended() { return p.ended; },
      set ended(v: boolean) { p.ended = v; },
      get t() { return p.t; },
      get fight() { return p.music.fight; },
      get map() { return p.map; },
      get cmd() { return p.cmd; },
      get pick() { return p.pick; },
      get inv() { return p.inv; },
      get log() { return p.log; },
      toggleMap: (open) => this.toggleMap(open),
      get places() { return p.places; },
      get lamps() { return p.lamps; },
      get liftSpr() { return p.liftView.spr; },
      get riseFaded() { return p.liftView.faded; },
      get ruins() { return p.world.ruins; },
      foeLights: () => this.foes.lights(),
      dressComm: () => this.dressComm(),
      commands: () => this.commands(),
      drawComm: (b, v, dt) => this.commView.draw(b, v, dt),
      place: (key, x, y, scale) => this.place(key, x, y, scale),
      dress: (key) => dressed(this, key, BIOMES[this.biome].paint),
      sfx: (key, x, y, o) => this.sfx(key, x, y, o),
      floater: (x, y, text, color, ms, size) => this.floater(x, y, text, color, ms, size),
      banner: (text, ms) => this.hud.banner(text, ms),
      wash: (color) => this.hud.wash(color),
      flash: (x, y, color, i) => this.light.flash(x, y, color, i),
      night: () => this.light.night,
      rise: () => this.liftView.now,
      climb: (y) => this.botsView.climb(y),
      footfall: (b) => this.feet.land(b),
    };
    this.gfx = this.add.graphics().setDepth(90000);
    this.statuses = new StatusView((size) => this.k.text(0, 0, '', { size, font: 'body' }).setOrigin(0.5).setDepth(97000).setStroke('#1d1a17', 4).setVisible(false));
    this.world = new WorldView(host);
    this.classes = new ClassOverlay(this, () => classedThings(this.sim));
    this.liftView = new LiftView(host);
    this.light = new LightView(host);
    this.music = new MusicView(host);
    this.botsView = new BotsView(host);
    this.commView = new CommView(host);
    this.foes = new FoeView(host);
    this.feet = new FootView(host);
    this.support = new SupportView(host);
    this.places = new PlaceViews(host);
    this.gearView = new GearView(host);
    this.fanfare = new FanfareView(host);
    this.tipView = new TipView(host);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.tipView.destroy());
    this.link = new DungeonLink(host);
    this.finale = new MissionEnd(host);
    const spiders = new SpiderViews({
      scene: this, sim: this.sim, world: this.w,
      sfx: (key, x, y, o) => this.sfx(key, x, y, o),
      flash: (x, y, color, i) => this.light.flash(x, y, color, i),
      burst: (x, y, o) => this.k.fx.burst(x, y, o),
      shake: (size) => this.k.juice.shake(size),
      stop: (ms) => this.k.juice.stop(ms),
      flashSprite: (obj, ms) => this.k.juice.flashSprite(obj, ms),
      ring,
    });
    // The update order is the layering of the frame's lines (`gfx`) and the order events reach them.
    this.views = [
      this.liftView, this.light, new HudFx(host), this.link, this.botsView,
      this.foes, new ChainView(host), new LegView(host), new ArmView(host), new LimbView(host), this.feet, new BossView(host), this.commView,
      new TierView(host), new JunkView(host), new ModView(host), new SkillView(host), new LiveRuins(host), new PropView(host), new BuildingView(host), new CompanionView(host), new CombatFx(host),
      spiders, new CaterpillarView(host), this.support, this.places, this.world, new ShadowView(host),
      this.finale, this.gearView, this.map, new TeachView(host), this.music, this.classes,
      this.fanfare, new CueView(host), new SignView(host), this.tipView,
      new IntroView(host),
      new CutView(host),
    ];
  }

  /** A prop standing in the land, dressed for it (biomedress.ts): its own copy graded and capped, a mound of the land under it, a lip in front if it is half buried. */
  private place(key: string, x: number, footY: number, scale = 1) {
    const [w, h] = SIZE[key];
    const paint = BIOMES[this.biome].paint;
    const img = this.add.image(x, footY, dressed(this, key, paint)).setOrigin(0.5, 1).setScale(scale / S).setDepth(footY - h * 0.1);
    if (!UNDRESSED.has(key) && !OURS.has(key)) {
      const fw = (w * scale * 0.9) / FOOT.w, fh = Math.min(fw, 1.4 * scale);
      this.w.cull.add(this.add.image(x, footY - 3 * fh, `foot-${paint}`).setScale(fw / S, fh / S).setDepth(-8));
      // Its shadow on the ground, from where it meets the ground (`footline.ts`), away from the sun or the lamps.
      if (PROP_CASTS) this.w.cull.add(sunCast(this, img, paint, -7.9, 0, { foot: contactRow(img) }));
      if (BURIED.has(key)) this.w.cull.add(this.add.image(x, footY + 2 * fh, `lip-${paint}`).setOrigin(0.5, 1).setScale(fw / S, fh / S).setDepth(img.depth + 0.01));
    }
    return img;
  }

  private toggleMap(open = !this.map.open) {
    if (open === this.map.open || this.ended) return;
    if (open) {
      this.map.show();
      this.mapUsed = true;
    } else this.map.hide();
    this.sfx('click');
  }

  /** Dress every body in what the gear says it wears (the Communicator's pieces, each role's head and back). */
  private dressComm() {
    this.commView.dress();
    this.botsView.dress();
  }

  /** A sound group (sound.ts); with a position the kit fades, pans and muffles it by distance from the Communicator. */
  private sfx(key: string, x?: number, y?: number, o: { gain?: number; vary?: number } = {}) {
    this.k.audio.sfx.play(key, { gain: o.gain ?? 1, ...(o.vary !== undefined && { vary: o.vary }), ...(x !== undefined && y !== undefined && { at: { x, y } }) });
  }

  /** A line that rises and fades where something happened. */
  private floater(x: number, y: number, text: string, color: string, ms = 1400, size = 15) {
    const t = this.k.text(x, y, text, { size, font: 'body', style: { wordWrap: { width: 360 }, align: 'center' } }).setOrigin(0.5).setDepth(97000).setStroke('#1d1a17', 4).setColor(color);
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: ms, ease: (k: number) => (k < 0.75 ? k * 0.3 : 0.225 + ((k - 0.75) / 0.25) * 0.775), onComplete: () => t.destroy() });
  }

  update(_t: number, ms: number) {
    const dt = Math.min(0.05, ms / 1000);
    const sim = this.sim;
    const t = this.t;
    Object.assign(sim.cfg, { steamShot: t.steamShot, steamRegen: t.steamRegen, swarm: t.swarm, edge: t.edge, hornetSpeed: t.hornetSpeed, lootChance: t.lootChance, eliteChance: t.eliteChance, morning: t.morning, day: t.day, evening: t.evening, twistStart: t.twistStart, stepEvery: t.stepEvery, berserk: { ...sim.cfg.berserk, dmg: t.berserkDmg, speed: t.berserkSpeed, hp: t.berserkHp, cd: t.berserkCd } });
    const input = inputFor(this);
    if (input.pressed('guide')) this.guide.toggle();
    if (this.cmd.used) this.guide.note('command');
    if (input.pressed('inventory') && !this.ended && !this.log.open && !this.guide.open) {
      // The satchel is the main quest's first gift (hub/story.ts).
      if (this.inv.open) this.inv.hide();
      else if (features(talkSave.get()).has('inventory')) this.inv.showDock('key');
      else this.floater(sim.controller.x, sim.controller.y - 70, 'No satchel yet: hear the Oracle out, aboard', '#ffd0a0', 2200, 15);
    }
    if (input.pressed('journal') && !this.ended && !this.inv.open && !this.guide.open) this.log.toggle();
    if (input.pressed('map') && sim.lessons.open('map') && !this.inv.open && !this.log.open && !this.guide.open) this.toggleMap();
    // An Oracle pause (a cutscene, `cutview.ts`) waiting for a read moves on with Use alone, its key shown under her line (Minos: "progress on E (with button to show)"):
    // the first press finishes the typing, the next brings her next line, the last ends it (Minos: nobody is rushed through a line).
    const spent = sim.lessons.hush?.until === 'press' && input.pressed('use');
    if (spent && !this.hud.advance()) sim.lessons.press();
    this.cmd.update(dt);
    if (this.map.open) sim.lessons.did('map'); // an Oracle pause waiting for it ends (sim/lessons.ts)
    if (this.cmd.on) sim.lessons.did('command');
    // Pressing fire ends its hint, a gun as much as a shovel (only a swing raises the 'swing' event).
    if (input.down('fire') && !this.cmd.on && !this.map.open) this.used.swung = true;
    if (input.down('fire2') && sim.secondary && !this.cmd.on && !this.map.open) this.used.shotSecondary = true;
    // The inventory pauses the mission (only drawing goes on).
    if (!this.ended && !this.k.juice.frozen && !this.inv.open && !this.log.open && !this.guide.open) {
      const p = this.input.activePointer;
      const aim = this.cameras.main.getWorldPoint(p.x, p.y);
      // The map pauses the mission (Minos: a calm place to read the land and plan); command mode runs it slow (`mapPace`), the fighting tool.
      const go = this.map.open ? NO_INPUT : { mx: input.axis('moveX'), my: input.axis('moveY'), ax: aim.x, ay: aim.y, fire: input.down('fire') && !this.cmd.on && !spent, fire2: input.down('fire2') && !this.cmd.on, use: !spent && (input.down('use') || input.pressed('use')), kick: input.down('kick'), dash: !spent && input.pressed('dash'), skill: input.pressed('skill') };
      // A dev timescale runs the mission in steps of at most 50 ms, so fast time stays the same game.
      if (!this.map.open && input.pressed('support') && sim.lessons.open('barrage')) this.support.call(sim.call, aim.x, aim.y);
      for (let left = dt * this.timeScale * (this.map.open ? 0 : this.cmd.on ? t.mapPace : 1); left > 1e-6; left -= 0.05) sim.step(Math.min(0.05, left), go);
    }
    for (const e of sim.events) for (const v of this.views) v.event?.(e);
    sim.events.length = 0;
    this.map.spot();
    this.map.refresh();
    // Star oil (P38): the clock stops and the map opens on the land as a constellation.
    if (sim.oilT > 0 && !this.oilSeen) {
      this.oilSeen = true;
      this.toggleMap(true);
    }
    this.trackT -= dt;
    if (this.trackT <= 0) {
      this.trackT = 0.7;
      const talk = talkSave.get(), lines = lineSave.get(), h = hub.get();
      // The old works and level 1: one thing at a time, the objective alone (sim/intro.ts, sim/lessons.ts).
      if (sim.intro || sim.land?.guided) this.hud.setTrack([]);
      else this.hud.setTrack([...trackerLines({ talk, lines, hub: h, facts: factsFor(h, '', talk, lines), biome: sim.biomeId, stats: sim.stats, job: questBook.get().job, places: () => [...sim.places.map((p) => p.id), ...(sim.ruins.some((r) => r.kind === 'dock') ? ['dock'] : [])] })].slice(0, 3));
    }
    this.hud.update(dt);
    this.guide.update(dt);
    this.gfx.clear();
    for (const v of this.views) v.update?.(dt, this.gfx);
    this.cmd.draw();
    for (const v of this.views) v.late?.(dt);
  }

  /** Dev commands: the gear and quest-log ones are tied to this scene, the rest are one file per group (`dev/`). */
  private commands() {
    const sim = this.sim;
    const offGear = gearCommands(this.inv, (scrap, p) => {
      sim.scrap += scrap;
      economy.set({ ...economy.get(), scrap: economy.get().scrap + scrap });
      const h = hub.get();
      hub.set({ ...h, parts: Object.fromEntries((Object.keys(PARTS) as PartKind[]).map((k) => [k, (h.parts[k] ?? 0) + p])) });
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offGear);
    registerDev(this);
  }

  debugState() {
    return {
      ...this.sim.summary(),
      map: this.map?.open ?? false,
      mapCrew: this.map?.crew,
      ended: this.ended,
      armed: this.sim.armed?.key ?? null,
      world: { cull: this.w?.cull.stats, marks: this.w ? 'on' : 'off', shadows: this.w?.shadows.count, remains: this.w?.remains.count },
      timeScale: this.timeScale,
      inventory: this.inv?.state(),
      questLog: this.log?.state(),
      guide: this.guide?.state(),
      gear: { scrap: this.sim.scrap, dash: this.sim.skillIds.dash, skill: this.sim.skillIds.skill, dashCd: +this.sim.dashCd.toFixed(2), skillCd: +this.sim.skillCd.toFixed(2) },
      command: { on: this.cmd?.on, zoom: +(this.cmd?.zoom ?? 1).toFixed(2), wanted: +(this.cmd?.want ?? 1).toFixed(2), picked: [...this.pick.ids], pickCrew: this.pick.crew },
      ...Object.assign({}, ...this.views.map((v) => v.debug?.())),
    };
  }
}

/** The land's Play, run down a dungeon (`sim/dungeon.ts`): its own Sim and UI; climbing out wakes the land's Play. */
export class Dungeon extends Play {
  constructor() {
    super('Dungeon');
  }
}

/**
 * Audio: a music director and an sfx helper on Web Audio, with three volumes saved per game.
 *
 *   const a = audioFor(game);                 // or kit(this).audio; one per game, music keeps playing across scenes
 *   a.music.add('calm', { stems: ['calm_base', 'calm_bass', 'calm_drums'], bpm: 96 });   // buffer keys
 *   a.music.play('calm', { fade: 2 });        // equal-power crossfade from whatever plays
 *   a.music.intensity(0.7);                   // stems fade in at their `at` threshold (default: spread over 0..1)
 *   a.music.stinger('drop', { at: 'bar' });   // one-shot on the next bar line
 *   a.sfx.play('hit', { vary: 0.1 });         // sfx bus; max 4 copies of one sound, 24 in all (oldest is cut)
 *   a.sfx.group('chop', ['chop', 'chop2', 'chop3'], { max: 2, pitch: 0.8, reverb: 0.3 });   // variants, one voice cap
 *   a.sfx.play('chop', { at: { x, y } });     // positional: gain, pan and a distance low-pass from the listener
 *   a.listener = () => hero; a.hearing = { near: 250, far: 1100 };   // default listener: the camera centre
 *   a.cut('dawn', 'music/title/full', 0, 6);  // a stinger (or sfx) cut from a loaded buffer, with fades
 *   a.set({ music: 0.5 }); a.volume;          // master / music / sfx / muted, saved per game
 *   ?mute=1                                   // any value but 0: the page stays muted for its life, not saved (`state().urlMute`)
 *   a.song.add('rimti', { key, bpm: 102, segments }); a.song.play('rimti'); a.song.mood(0.8);   // a whole song, re-sequenced
 *
 * Files: `audio.load({ music: { calm: ['base', 'bass', 'drums'] }, sfx: ['hit'] })` fetches
 * `games/<name>/public/audio/music/<track>/<stem>.ogg` and `.../sfx/<name>.ogg` (.mp3 if no .ogg; a stem's buffer key
 * is `music/<track>/<stem>`, a sound's is its name), bootGame's `audio`
 * option does it before the first scene. Generated audio: `a.addBuffer(key, Float32Array)`. Buffers Phaser loaded
 * (`load.audio`) are found in its cache by key.
 *
 * Design facts (measured in the browser pane, Chromium):
 * - Raw AudioBufferSourceNodes, not Phaser Sound objects: stems started with one `when` stay sample-aligned across
 *   loops, and fades and "next bar" are scheduled on the audio clock, so no scene tweens/timers and nothing to stop
 *   on scene shutdown. They connect to `sound.destination`, so Phaser's master volume and mute still apply.
 * - Phaser has one volume (master = `sound.volume`); music and sfx are GainNode buses in front of it, then a
 *   DynamicsCompressor (not a brick wall: 20x3 overlapping sounds peaked at 1.3) and a soft-clip WaveShaper (output < 1).
 * - Fades are `setValueCurveAtTime` with a sin/cos curve (equal power). Interrupting a fade holds its current value
 *   (cancel + set from the current value; `cancelAndHoldAtTime` at a future time drops to 0 until then).
 * - mp3 adds encoder padding, so loops click: ship ogg (or wav) stems of equal length, cut on a bar line.
 * - A suspended context (before the first click) just starts when it resumes.
 * - `?v.music=` / the `music` slot: a variant can remap track names (A/B a track) and trim the music bus.
 * - No WebAudio (Phaser's NoAudio/HTML5 manager): every call is a silent no-op.
 *
 * Many sources, one sound (docs/design/design.md; lifted from Wildhold, lab probes Sounds and Crowds): a group is one sound
 * with variants (never the same one twice in a row), one voice cap for all of them, its own pitch, gain and jitter, a
 * priority (over the total cap the lowest priority goes first), a reverb send, an optional duck (it briefly lowers the
 * rest of the sfx), density compensation (each extra voice of the group is quieter, 1/sqrt(n)), a random start offset
 * into long sounds, and a level of detail: the `lod` nearest sources of a group are heard one by one, the rest feed a
 * looping `bed` whose loudness grows slowly with their count. Positional sounds fade with distance (k^2 between
 * `hearing.near` and `far`), pan by side and lose their top (a low-pass that closes with distance).
 */
import type Phaser from 'phaser';
import { createSave, type Save } from '../save';
import { slot } from './variants';
import { gameId } from './state';

// ---- pure logic (audio.test.ts) ----
export const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** `?mute=` with any value but 0 mutes the page for its life (agents play-testing pass it). */
export function forcedMute(search: string): boolean {
  const v = new URLSearchParams(search).get('mute');
  return v !== null && v !== '0';
}

/** Gain curve for a fade `from` -> `to` (power-complementary: a rising and a falling fade sum to constant power). */
export function equalPowerCurve(from: number, to: number, n = 64): Float32Array<ArrayBuffer> {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * (Math.PI / 2);
    out[i] = to >= from ? from + (to - from) * Math.sin(x) : to + (from - to) * Math.cos(x);
  }
  return out;
}

/** First multiple of `period` after `start` that is >= `now`; `start` itself if `now` is before it. */
export function nextBoundary(now: number, start: number, period: number): number {
  if (now <= start || period <= 0) return Math.max(now, start);
  return start + Math.ceil((now - start) / period - 1e-9) * period;
}

/** Waveshaper curve over -1..1: untouched below `knee`, then a tanh shoulder, so the output stays below 1. */
export function softClipCurve(knee = 0.8, n = 2049): Float32Array<ArrayBuffer> {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    out[i] = Math.sign(x) * (a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
  }
  return out;
}

/** Hearing at distance d: 1 within `near`, falling (squared, so it drops quickly) to 0 at `far`. */
export function hearingGain(d: number, near: number, far: number) {
  const k = Math.min(1, Math.max(0, 1 - (d - near) / Math.max(1, far - near)));
  return k * k;
}

/** Low-pass cutoff for a hearing gain: open (18 kHz) up close, about 1.2 kHz at the edge of hearing. */
export const lowpassFor = (k: number) => 1200 * Math.pow(18000 / 1200, Math.sqrt(clamp01(k)));

/** Group loudness with n voices already sounding: 1, 0.71, 0.58, ... (density compensation). */
export const densityGain = (n: number) => 1 / Math.sqrt(1 + Math.max(0, n));

/** Picks variants in a shuffled order, never the same one twice in a row (also across reshuffles). */
export class Bag {
  private order: number[] = [];
  private last = -1;
  constructor(readonly n: number, private rand: () => number = Math.random) {}
  next(): number {
    if (this.n <= 1) return 0;
    if (!this.order.length) {
      this.order = Array.from({ length: this.n }, (_, i) => i);
      for (let i = this.n - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
      if (this.order[0] === this.last) this.order.push(this.order.shift()!);
    }
    this.last = this.order.shift()!;
    return this.last;
  }
}

/** One section of a song, in bars from the first downbeat, with the mood it carries (0 calm .. 1 intense). */
export interface Segment {
  name: string;
  from: number;
  to: number;
  mood: number;
  /** Only played when asked for by name (an ending, an intro). */
  only?: boolean;
  /** The song ends here: nothing is queued after it. */
  end?: boolean;
}

/**
 * The segment to play after `cur` for a wanted mood: the song's own next section when it is close enough (the music
 * then simply continues), else the closest mood elsewhere, avoiding the last few played. Ties keep song order.
 */
export function pickSegment(segs: readonly Segment[], cur: number, mood: number, recent: readonly number[] = [], keep = 0.2): number {
  const next = cur + 1 < segs.length && !segs[cur + 1].only ? cur + 1 : -1;
  if (next >= 0 && Math.abs(segs[next].mood - mood) <= keep) return next;
  let best = -1;
  let score = Infinity;
  segs.forEach((g, i) => {
    if (g.only || i === cur) return;
    const sc = Math.abs(g.mood - mood) + (i === next ? -0.1 : 0) + (recent.includes(i) ? 0.25 : 0);
    if (sc < score - 1e-9) {
      score = sc;
      best = i;
    }
  });
  return best >= 0 ? best : Math.max(0, next);
}

/** Intensity at which stem i of n appears: 0, 1/n, 2/n, ... (a single stem is always on). */
export const defaultThreshold = (i: number, n: number) => (n <= 1 ? 0 : i / n);

/**
 * Caps simultaneous voices: per key, then overall. `admit` returns the voices to cut (oldest first). Over the total cap
 * the oldest voice of the lowest priority goes; if every voice outranks the newcomer, the newcomer itself is cut.
 */
export class VoicePool<V> {
  private byKey = new Map<string, V[]>();
  private all: [string, V, number][] = [];
  constructor(readonly maxPerKey = 4, readonly maxTotal = 24) {}

  admit(key: string, voice: V, max = this.maxPerKey, priority = 0): V[] {
    const victims: V[] = [];
    const list = this.byKey.get(key) ?? [];
    this.byKey.set(key, list);
    list.push(voice);
    this.all.push([key, voice, priority]);
    while (list.length > Math.max(1, max)) victims.push(this.drop(key, list[0]));
    while (this.all.length > Math.max(1, this.maxTotal)) {
      let low = 0;
      for (let i = 1; i < this.all.length; i++) if (this.all[i][2] < this.all[low][2]) low = i;
      victims.push(this.drop(this.all[low][0], this.all[low][1]));
    }
    return victims;
  }

  release(key: string, voice: V) {
    this.drop(key, voice);
  }

  voices(): V[] {
    return this.all.map(([, v]) => v);
  }

  count(key?: string) {
    return key === undefined ? this.all.length : (this.byKey.get(key)?.length ?? 0);
  }

  private drop(key: string, voice: V): V {
    const list = this.byKey.get(key);
    const i = list?.indexOf(voice) ?? -1;
    if (i >= 0) list!.splice(i, 1);
    const j = this.all.findIndex(([, v]) => v === voice);
    if (j >= 0) this.all.splice(j, 1);
    return voice;
  }
}

// ---- model ----
export interface StemDef {
  /** Buffer key. */
  key: string;
  /** Music intensity (0..1) from which this stem is audible. Default: spread evenly over the track's stems. */
  at?: number;
}
export interface TrackDef {
  /** Looping layers, all the same length and cut on a bar line, lowest intensity first. */
  stems: (string | StemDef)[];
  /** With `bpm`, stingers and changes can wait for the next beat or bar (`beats` per bar, default 4). Without it a bar is one loop. */
  bpm?: number;
  beats?: number;
}
export type At = 'now' | 'beat' | 'bar';
export interface Volumes {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}
/** A `music` slot variant: another way to play the same game. */
export interface MusicMix {
  /** Track names the game asks for -> the track actually played (A/B an area's music). */
  tracks?: Record<string, string>;
  /** Trim on the music bus (0..1 gain). */
  gain?: number;
}
export const musicSlot = slot<MusicMix>('music', { default: {} });

export interface Point {
  x: number;
  y: number;
}
export interface SfxOpts {
  gain?: number;
  rate?: number;
  /** Random pitch spread: 0.1 = rate x0.9..1.1. */
  vary?: number;
  /** Random gain spread: 0.2 = gain x0.8..1. */
  gainVary?: number;
  detune?: number;
  /** -1..1 (a positional sound pans by itself). */
  pan?: number;
  /** Copies of this sound (or group) allowed at once (default 4); a new one cuts the oldest. */
  max?: number;
  /** Over the total voice cap, lower priorities are cut first (default 0). */
  priority?: number;
  /** World position: gain, pan and low-pass follow the distance from the listener; out of hearing it does not play. */
  at?: Point;
  /** Least gain a positional sound keeps however far (big events stay faintly audible). */
  floor?: number;
  /** Send to the reverb bus, 0..1 (default 0: dry). */
  reverb?: number;
  /** Start up to this many seconds into the buffer, at random (long sounds sound different each time). */
  offset?: number;
  /** Lower the rest of the sfx to this gain for `duckTime` seconds while it starts (an important sound cuts through). */
  duck?: number;
  duckTime?: number;
}
export interface GroupOpts extends SfxOpts {
  /** Base pitch (playback rate) of the group, times `rate`. */
  pitch?: number;
  /** Each voice already sounding makes the next one quieter (1/sqrt(n)). */
  density?: boolean;
  /** Level of detail: only this many sources play one by one within `lodWindow` seconds; the rest feed `bed`. */
  lod?: number;
  lodWindow?: number;
  /** A looping buffer whose gain grows slowly with the sources beyond `lod` (a crowd: many workers become one sound). */
  bed?: string;
  bedGain?: number;
}
export interface AudioManifest {
  /** Whole songs to re-sequence (`audio.song`): the file `music/<name>`, sections in bars. */
  songs?: Record<string, Omit<SongDef, 'key'>>;
  /** Track name -> stems in file-name form (`music/<track>/<stem>`), lowest intensity first; or with a bpm. */
  music?: Record<string, string[] | { stems: string[]; bpm?: number; beats?: number }>;
  /** Sound names: the file `sfx/<name>`, played as `sfx.play('<name>')`. */
  sfx?: string[];
}

const LEAD = 0.03; // seconds between "now" and the first moment we can schedule
// A safety limiter, not a loudness tool: a mastered song through -10 dB / 3 ms pumped and distorted its bass, so it only
// catches peaks above -6 dB, with a soft knee and a release slow enough not to ride the low end.
const LIMITER = { threshold: -6, knee: 4, ratio: 12, attack: 0.005, release: 0.25 };

/** Ramp an AudioParam from where it is to `to`, from time `t` over `dur`, equal power. */
export function fadeParam(p: AudioParam, to: number, t: number, dur: number) {
  const from = p.value;
  p.cancelScheduledValues(t); // cancelAndHoldAtTime(t) at a future t dips the output to 0 until t (measured)
  p.setValueAtTime(from, t);
  if (dur < 0.005 || from === to) p.setValueAtTime(to, t + Math.max(0, dur));
  else p.setValueCurveAtTime(equalPowerCurve(from, to), t, dur);
}

const NO_OPTS = {}; // default argument of per-frame calls: no new object each time

interface PlayingStem {
  def: Required<StemDef>;
  gain: GainNode;
  src: AudioBufferSourceNode;
  target: number;
}
interface Playing {
  name: string;
  def: TrackDef;
  out: GainNode;
  stems: PlayingStem[];
  /** Context time of loop position 0 (may be in the past). */
  start: number;
  period: number;
  beat: number;
  bar: number;
}

// ---- music ----
export class Music {
  private tracks = new Map<string, { stems: Required<StemDef>[]; bpm?: number; beats: number; def: TrackDef }>();
  private cur: Playing | null = null;
  private fading = new Set<Playing>();
  private wanted: string | null = null;
  private level = 0;
  /** The tone of the whole music: low-pass, trim and detune, eased (`tone`). Built on first use. */
  private chain: { filter: BiquadFilterNode; gain: GainNode } | null = null;
  private detune = 0;

  constructor(private a: Audio) {
    musicSlot.on(() => this.refresh());
  }

  add(name: string, def: TrackDef) {
    const n = def.stems.length;
    const stems = def.stems.map((s, i) => {
      const d = typeof s === 'string' ? { key: s } : s;
      return { key: d.key, at: d.at ?? defaultThreshold(i, n) };
    });
    this.tracks.set(name, { stems, bpm: def.bpm, beats: def.beats ?? 4, def });
    // A track asked for before it loaded starts now, crossfading from whatever plays meanwhile (the last request wins).
    if (this.wanted && this.resolve(this.wanted) === name) this.play(this.wanted, this.pending);
  }

  /** Is this track known (added or loaded)? */
  has(name: string) {
    return this.tracks.has(name);
  }

  private pending: { fade?: number; at?: At; continue?: boolean; restart?: boolean } = {};

  /** Name of the track playing (after the music slot's remapping), or null. */
  get current() {
    return this.cur?.name ?? null;
  }

  /**
   * Crossfade to a track (equal power). Same track already playing: nothing (`restart` starts it over).
   * `fade` seconds (default 2; 0 cuts); `at` waits for the next beat or bar of the track that is playing;
   * `continue` starts the new track at the old one's loop position (same tempo and bar count: a seamless swap).
   */
  play(track: string, o: { fade?: number; at?: At; continue?: boolean; restart?: boolean } = {}) {
    this.wanted = track;
    const ctx = this.a.ctx;
    if (!ctx) return;
    const name = this.resolve(track);
    if (this.cur?.name === name && !o.restart) return;
    const def = this.tracks.get(name);
    if (!def) {
      // Not loaded yet: it starts when `add` (or `load`) registers it. The last request wins.
      this.pending = o;
      return;
    }

    const fade = o.fade ?? 2;
    const t = this.when(o.at);
    const old = this.cur;
    const offset = o.continue && old ? (((t - old.start) % old.period) + old.period) % old.period : 0;
    const next = this.spawn(name, def, t, offset, fade);
    if (old) this.fadeOut(old, t, fade);
    this.cur = next;
  }

  /** Fade the music out (default 1 s) and forget the wanted track. */
  stop(o: { fade?: number; at?: At } = {}) {
    this.wanted = null;
    if (!this.cur || !this.a.ctx) return;
    this.fadeOut(this.cur, this.when(o.at), o.fade ?? 1);
    this.cur = null;
  }

  /**
   * Fade stems in and out by intensity 0..1 (also remembered for the next track). Cheap to call every frame:
   * only stems whose on/off state changes are touched. `fade` seconds, default 1.5.
   */
  intensity(v: number, o: { fade?: number; at?: At } = NO_OPTS) {
    this.level = clamp01(v);
    if (!this.cur || !this.a.ctx) return;
    let t = -1;
    for (const s of this.cur.stems) {
      const target = this.level >= s.def.at ? 1 : 0;
      if (target === s.target) continue;
      s.target = target;
      if (t < 0) t = this.when(o.at);
      fadeParam(s.gain.gain, target, t, o.fade ?? 1.5);
    }
  }

  /**
   * Colour the music without touching where it is: a low-pass (Hz; 20000 = open), a trim (0..1) and a detune (cents),
   * each eased over `fade` seconds (default 2). The track keeps playing, so changing mood this way never interrupts it:
   * muffled and quieter when calm, open when it matters, a sagging detune when something is running down.
   */
  tone(o: { lowpass?: number; gain?: number; detune?: number; fade?: number }) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    const c = this.input() && this.chain!;
    const t = ctx.currentTime;
    const tc = Math.max(0.01, (o.fade ?? 2) / 3); // setTargetAtTime: ~95% of the way after 3 time constants
    if (o.lowpass !== undefined) c.filter.frequency.setTargetAtTime(Math.min(20000, Math.max(80, o.lowpass)), t, tc);
    if (o.gain !== undefined) c.gain.gain.setTargetAtTime(clamp01(o.gain), t, tc);
    if (o.detune !== undefined && o.detune !== this.detune) {
      this.detune = o.detune;
      for (const s of this.cur?.stems ?? []) s.src.detune.setTargetAtTime(o.detune, t, tc);
    }
  }

  /** Where tracks connect: the tone chain (low-pass, trim) in front of the music bus. */
  private input(): AudioNode {
    if (!this.chain) {
      const ctx = this.a.ctx!;
      const filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 20000, Q: 0.6 });
      const gain = ctx.createGain();
      filter.connect(gain).connect(this.a.musicBus);
      this.chain = { filter, gain };
    }
    return this.chain.filter;
  }

  /** The intensity last set. */
  get currentIntensity() {
    return this.level;
  }

  /**
   * One-shot on the music bus (so the music volume applies), on the next beat/bar of the playing track
   * (default 'bar'; right away when no music plays). Returns the context time it starts at.
   * Beat drop: `stinger('drop', { at: 'bar' }); intensity(1, { at: 'bar', fade: 0.05 })`.
   */
  stinger(key: string, o: { at?: At; gain?: number } = {}): number {
    const ctx = this.a.ctx;
    const buf = this.a.buffer(key);
    if (!ctx || !buf) return this.a.missing(key), 0;
    const t = this.when(o.at ?? 'bar');
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    src.connect(g).connect(this.a.musicBus);
    src.onended = () => (src.disconnect(), g.disconnect());
    src.start(t);
    return t;
  }

  /** Where the current track is in its loop, in seconds, and the grid it quantizes to. */
  state() {
    const c = this.cur;
    const now = this.a.ctx?.currentTime ?? 0;
    return {
      track: c?.name ?? null,
      wanted: this.wanted,
      intensity: this.level,
      position: c ? +((((now - c.start) % c.period) + c.period) % c.period).toFixed(3) : 0,
      bar: c?.bar ?? 0,
      trackGain: c ? +c.out.gain.value.toFixed(3) : 0,
      stems: Object.fromEntries((c?.stems ?? []).map((s) => [s.def.key, { at: s.def.at, target: s.target, gain: +s.gain.gain.value.toFixed(3) }])),
      fadingOut: [...this.fading].map((f) => ({ track: f.name, gain: +f.out.gain.value.toFixed(3) })),
      tone: this.chain ? { lowpass: Math.round(this.chain.filter.frequency.value), gain: +this.chain.gain.gain.value.toFixed(2), detune: this.detune } : null,
    };
  }

  private resolve(track: string) {
    return musicSlot.value.tracks?.[track] ?? track;
  }

  /** The music slot changed: re-resolve the wanted track (the bus trim is applied by Audio). */
  private refresh() {
    if (this.wanted && this.cur && this.resolve(this.wanted) !== this.cur.name) this.play(this.wanted);
  }

  private when(at: At = 'now') {
    const now = this.a.ctx!.currentTime + LEAD;
    const c = this.cur;
    return !c || at === 'now' ? now : nextBoundary(now, c.start, at === 'bar' ? c.bar : c.beat);
  }

  private spawn(name: string, def: NonNullable<ReturnType<Music['tracks']['get']>>, when: number, offset: number, fade: number): Playing {
    const ctx = this.a.ctx!;
    const out = ctx.createGain();
    out.connect(this.input());
    const stems: PlayingStem[] = [];
    let period = 0;
    for (const d of def.stems) {
      const buf = this.a.buffer(d.key);
      if (!buf) {
        this.a.missing(d.key);
        continue;
      }
      period ||= buf.duration;
      const gain = ctx.createGain();
      const target = this.level >= d.at ? 1 : 0;
      gain.gain.value = target;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain).connect(out);
      src.detune.value = this.detune;
      src.start(when, offset % buf.duration); // one `when` for every stem: they stay sample-aligned
      stems.push({ def: d, gain, src, target });
    }
    const beat = def.bpm ? 60 / def.bpm : period;
    const p: Playing = { name, def: def.def, out, stems, start: when - offset, period, beat, bar: def.bpm ? beat * def.beats : period };
    if (fade < 0.005) out.gain.setValueAtTime(1, when);
    else {
      out.gain.value = 0;
      fadeParam(out.gain, 1, when, fade);
    }
    return p;
  }

  private fadeOut(p: Playing, t: number, fade: number) {
    fadeParam(p.out.gain, 0, t, fade);
    this.fading.add(p);
    let ended = 0;
    for (const s of p.stems) {
      s.src.stop(t + fade + 0.05);
      s.src.onended = () => {
        s.src.disconnect();
        s.gain.disconnect();
        if (++ended === p.stems.length) {
          p.out.disconnect();
          this.fading.delete(p);
        }
      };
    }
    if (!p.stems.length) (p.out.disconnect(), this.fading.delete(p));
  }
}

// ---- song: horizontal re-sequencing ----
export interface SongDef {
  /** Buffer key of the whole song (loaded or added). */
  key: string;
  bpm: number;
  beats?: number;
  /** Seconds to the first downbeat. */
  offset?: number;
  segments: Segment[];
  /** Bars per phrase: an urgent change waits for the next phrase line (default 4). */
  phrase?: number;
  /** Trim on the song (a mastered recording runs hot: 0.5 leaves room for the sfx, so the limiter stays idle). */
  gain?: number;
}
interface SongPlay {
  seg: number;
  /** Context time this segment started and ends. */
  start: number;
  end: number;
  src: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * A whole song played section by section and re-sequenced by mood: it always plays the real recording, continuously,
 * and only decides at a section's last bar line where to go next (the natural next section if it fits the mood, else the
 * closest one elsewhere). Contiguous sections join sample-exact (same buffer, same clock); a jump cross-fades over a few
 * ms on the downbeat. `mood(v, { urgent: true })` may cut in at the next phrase line instead of waiting for the section
 * to end (an alarm, an evacuation). Decisions run on a 200 ms timer up to 4 s ahead of the line, scheduled on the audio
 * clock, so a busy frame never leaves a gap; the mood is read when the decision is made.
 */
export class Song {
  private songs = new Map<string, SongDef>();
  private name: string | null = null;
  private cur: SongPlay | null = null;
  private queued: SongPlay | null = null;
  private out: GainNode | null = null;
  private wanted = 0.3;
  private urgent = false;
  private recent: number[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private pendingName: string | null = null;
  private pendingFrom: string | undefined;

  constructor(private a: Audio) {}

  add(name: string, def: SongDef) {
    this.songs.set(name, def);
    if (this.pendingName === name) this.play(name, { from: this.pendingFrom });
  }

  /** Start a song (from a named section, else the one closest to the current mood). Waits for it to be added. */
  play(name: string, o: { from?: string; fade?: number } = {}) {
    const ctx = this.a.ctx;
    const def = this.songs.get(name);
    const buf = def && this.a.buffer(def.key);
    if (!ctx || !def || !buf) {
      this.pendingName = name;
      this.pendingFrom = o.from;
      return;
    }
    this.pendingName = null;
    if (this.name === name && this.cur) return;
    this.stop({ fade: o.fade ?? 1.5 });
    this.name = name;
    this.out = ctx.createGain();
    this.out.connect(this.a.musicBus);
    const segs = def.segments;
    const i = o.from ? Math.max(0, segs.findIndex((g) => g.name === o.from)) : pickSegment(segs, -1, this.wanted, []);
    const t = ctx.currentTime + 0.05;
    fadeParam(this.out.gain, def.gain ?? 1, t, o.fade ?? 1.5);
    this.cur = this.schedule(i, t, 0.005);
    this.timer ??= setInterval(() => this.tick(), 200);
  }

  /** The mood the music should follow (0 calm .. 1 intense); urgent: change at the next phrase line, not the section end. */
  mood(v: number, o: { urgent?: boolean } = NO_OPTS) {
    this.wanted = clamp01(v);
    if (o.urgent) this.urgent = true;
  }

  /** Jump to a named section at the next bar (default) or phrase line: an ending, a sting from the song itself. */
  goto(section: string, o: { at?: 'bar' | 'phrase' } = {}) {
    const def = this.name ? this.songs.get(this.name) : null;
    const i = def?.segments.findIndex((g) => g.name === section) ?? -1;
    if (!def || i < 0 || !this.cur) return;
    this.cutTo(i, o.at ?? 'bar');
  }

  stop(o: { fade?: number } = {}) {
    const ctx = this.a.ctx;
    if (!ctx || !this.out) return;
    const out = this.out;
    const t = ctx.currentTime;
    fadeParam(out.gain, 0, t, o.fade ?? 1.5);
    for (const p of [this.cur, this.queued]) p?.src.stop(t + (o.fade ?? 1.5) + 0.05);
    setTimeout(() => out.disconnect(), ((o.fade ?? 1.5) + 0.2) * 1000);
    this.cur = this.queued = null;
    this.out = null;
    this.name = null;
  }

  state() {
    const def = this.name ? this.songs.get(this.name) : null;
    const now = this.a.ctx?.currentTime ?? 0;
    return {
      song: this.name,
      section: def && this.cur ? def.segments[this.cur.seg].name : null,
      next: def && this.queued ? def.segments[this.queued.seg].name : null,
      left: this.cur ? +(this.cur.end - now).toFixed(2) : 0,
      mood: this.wanted,
      urgent: this.urgent,
    };
  }

  private bar(def: SongDef) {
    return ((60 / def.bpm) * (def.beats ?? 4));
  }

  /** Play section i from context time `when`, fading in over `fadeIn`. */
  private schedule(i: number, when: number, fadeIn: number, skipBars = 0): SongPlay {
    const ctx = this.a.ctx!;
    const def = this.songs.get(this.name!)!;
    const buf = this.a.buffer(def.key)!;
    const g = def.segments[i];
    const bar = this.bar(def);
    const from = (def.offset ?? 0) + (g.from + skipBars) * bar;
    const dur = (g.to - g.from - skipBars) * bar;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(fadeIn > 0.004 ? 0 : 1, when);
    if (fadeIn > 0.004) gain.gain.linearRampToValueAtTime(1, when + fadeIn);
    src.connect(gain).connect(this.out!);
    src.start(when, from, dur + 0.08); // a little past the line, faded out by whoever follows
    this.recent = [i, ...this.recent.filter((r) => r !== i)].slice(0, 3);
    return { seg: i, start: when, end: when + dur, src, gain };
  }

  /** Hand over at `t`: the old section fades out over a few ms unless the new one continues it exactly. */
  private handOver(old: SongPlay, t: number, contiguous: boolean) {
    const g = old.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(1, t);
    if (contiguous) g.setValueAtTime(0, t);
    else g.linearRampToValueAtTime(0, t + 0.03);
    old.src.stop(t + 0.1);
    old.src.onended = () => (old.src.disconnect(), old.gain.disconnect());
  }

  private tick() {
    const ctx = this.a.ctx;
    if (!ctx || !this.cur || !this.name) return;
    const def = this.songs.get(this.name)!;
    const now = ctx.currentTime;
    if (this.queued && now >= this.queued.start) {
      this.cur = this.queued;
      this.queued = null;
    }
    if (this.urgent) {
      this.urgent = false;
      const want = pickSegment(def.segments, this.cur.seg, this.wanted, this.recent, 0.15);
      if (Math.abs(def.segments[want].mood - def.segments[this.cur.seg].mood) > 0.3) return this.cutTo(want, 'phrase');
    }
    // Decide well ahead of the line (a busy or throttled main thread must not leave a gap); scheduled on the audio clock.
    if (this.queued || this.cur.end - now > 4 || def.segments[this.cur.seg].end) return;
    const next = pickSegment(def.segments, this.cur.seg, this.wanted, this.recent);
    const contiguous = def.segments[next].from === def.segments[this.cur.seg].to;
    this.queued = this.schedule(next, this.cur.end, contiguous ? 0 : 0.01);
    this.handOver(this.cur, this.cur.end, contiguous);
  }

  /** Cut to section i at the next bar or phrase line inside the current section. */
  private cutTo(i: number, at: 'bar' | 'phrase') {
    const ctx = this.a.ctx!;
    const def = this.songs.get(this.name!)!;
    const step = this.bar(def) * (at === 'phrase' ? (def.phrase ?? 4) : 1);
    const t = Math.min(this.cur!.end, nextBoundary(ctx.currentTime + 0.1, this.cur!.start, step));
    if (this.queued) {
      this.queued.src.stop();
      this.queued = null;
    }
    this.queued = this.schedule(i, t, 0.01);
    this.handOver(this.cur!, t, false);
  }
}

// ---- sfx ----
interface Voice {
  key: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
}
interface Group {
  name: string;
  variants: string[];
  bag: Bag;
  o: GroupOpts;
  /** Recent positional plays (context time, distance), for the level of detail. */
  recent: { t: number; d: number }[];
  bed?: { src: AudioBufferSourceNode; gain: GainNode; level: number };
}

export class Sfx {
  private pool: VoicePool<Voice>;
  private defs = new Map<string, SfxOpts>();
  private groups = new Map<string, Group>();
  played = 0;
  cut = 0;
  /** Plays skipped: out of hearing, or folded into a bed by the level of detail. */
  skipped = 0;

  constructor(private a: Audio, maxPerKey = 4, maxTotal = 24) {
    this.pool = new VoicePool<Voice>(maxPerKey, maxTotal);
  }

  /** Defaults for one sound (gain, max copies, pitch spread...); `play` options override them. */
  define(key: string, o: SfxOpts) {
    this.defs.set(key, o);
  }

  /**
   * One sound with variants: `play(name)` picks one (never the same twice in a row) and every variant counts toward
   * one voice cap (`max`). Options apply to every play; `play` options override them.
   */
  group(name: string, variants: string[], o: GroupOpts = {}) {
    const old = this.groups.get(name);
    if (old?.bed) old.bed.src.stop();
    this.groups.set(name, { name, variants, bag: new Bag(variants.length), o, recent: [] });
  }

  /** Is this a group's name? */
  isGroup(name: string) {
    return this.groups.has(name);
  }

  /**
   * Play a sound or a group on the sfx bus. Returns false if it is missing, out of hearing, folded into a bed, or there
   * is no WebAudio.
   */
  play(name: string, o: SfxOpts = {}): boolean {
    const ctx = this.a.ctx;
    if (!ctx) return false;
    const g = this.groups.get(name);
    const key = g ? g.variants[g.bag.next()] : name;
    const buf = this.a.buffer(key);
    if (!buf) return this.a.missing(key), false;
    const d: GroupOpts = { ...g?.o, ...this.defs.get(key), ...o };
    let gain = (d.gain ?? 1) * (1 - Math.random() * (d.gainVary ?? 0));
    let pan = d.pan ?? 0;
    let cutoff = 0;
    if (d.at) {
      const l = this.a.listenerPoint();
      if (l) {
        const dist = Math.hypot(d.at.x - l.x, d.at.y - l.y);
        const k = Math.max(d.floor ?? 0, hearingGain(dist, this.a.hearing.near, this.a.hearing.far));
        if (k < 0.02) return this.skipped++, false;
        if (g && d.lod !== undefined && !this.admitLod(g, dist, ctx.currentTime, d)) return this.skipped++, false;
        gain *= k;
        pan = Math.max(-0.7, Math.min(0.7, (d.at.x - l.x) / 700));
        cutoff = lowpassFor(k);
      }
    }
    const poolKey = g ? g.name : key;
    if (d.density) gain *= densityGain(this.pool.count(poolKey));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (d.rate ?? 1) * (d.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * (d.vary ?? 0));
    if (d.detune) src.detune.value = d.detune;
    const gn = ctx.createGain();
    gn.gain.value = gain;
    const nodes: AudioNode[] = [src, gn];
    let tail: AudioNode = gn;
    src.connect(gn);
    if (cutoff && cutoff < 17000) {
      const f = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: cutoff, Q: 0.5 });
      tail.connect(f);
      tail = f;
      nodes.push(f);
    }
    if (pan) {
      const p = new StereoPannerNode(ctx, { pan });
      tail.connect(p);
      tail = p;
      nodes.push(p);
    }
    tail.connect(d.duck !== undefined ? this.a.sfxBus : this.a.duckBus);
    if (this.a.roomLive()) {
      tail.connect(this.a.roomSend); // the scene's room: every sfx, on top of its own send
    }
    if (d.reverb) {
      const send = new GainNode(ctx, { gain: clamp01(d.reverb) });
      tail.connect(send).connect(this.a.reverbBus);
      nodes.push(send);
    }
    if (d.duck !== undefined) this.a.duck(d.duck, d.duckTime ?? 0.4);
    const voice: Voice = { key: poolKey, src, gain: gn };
    const victims = this.pool.admit(poolKey, voice, d.max, d.priority ?? 0);
    if (victims.includes(voice)) {
      // Everything sounding outranks it: it does not play.
      for (const n of nodes) n.disconnect();
      this.skipped++;
      return false;
    }
    for (const v of victims) this.cutVoice(v);
    src.onended = () => {
      this.pool.release(poolKey, voice);
      for (const n of nodes) n.disconnect();
    };
    src.start(0, d.offset ? Math.random() * Math.min(d.offset, buf.duration * 0.9) : 0);
    this.played++;
    return true;
  }

  /** Level of detail: true if this source is among the `lod` nearest heard lately; otherwise it feeds the group's bed. */
  private admitLod(g: Group, dist: number, now: number, d: GroupOpts) {
    const win = d.lodWindow ?? 0.5;
    g.recent = g.recent.filter((r) => now - r.t < win);
    const nearer = g.recent.filter((r) => r.d < dist).length;
    g.recent.push({ t: now, d: dist });
    const beyond = Math.max(0, g.recent.length - (d.lod ?? 0));
    if (d.bed) this.feedBed(g, beyond, d);
    return nearer < (d.lod ?? 0);
  }

  /** A crowd's bed: a loop whose gain follows sqrt(sources beyond the level of detail), easing up and down slowly. */
  private feedBed(g: Group, beyond: number, d: GroupOpts) {
    const ctx = this.a.ctx!;
    const buf = this.a.buffer(d.bed!);
    if (!buf) return this.a.missing(d.bed!);
    if (!g.bed) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.a.duckBus);
      src.start();
      g.bed = { src, gain, level: 0 };
    }
    const level = Math.min(1, Math.sqrt(beyond) / 4) * (d.bedGain ?? 0.6);
    g.bed.level = level;
    g.bed.gain.gain.setTargetAtTime(level, ctx.currentTime, level > g.bed.gain.gain.value ? 0.6 : 2);
  }

  /** Let every bed fade out (a scene ends, the crowd is gone). */
  quietBeds(fade = 1) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    for (const g of this.groups.values()) if (g.bed) g.bed.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
  }

  /** Voices sounding now (of one sound or group, or all). */
  playing(key?: string) {
    return this.pool.count(key);
  }

  stopAll() {
    for (const v of this.pool.voices()) this.cutVoice(v);
    this.quietBeds(0.05);
  }

  state() {
    return {
      playing: this.playing(),
      played: this.played,
      cut: this.cut,
      skipped: this.skipped,
      groups: Object.fromEntries([...this.groups.values()].map((g) => [g.name, { voices: this.playing(g.name), bed: g.bed ? +g.bed.level.toFixed(2) : null }])),
    };
  }

  private cutVoice(v: Voice) {
    const ctx = this.a.ctx!;
    const t = ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + 0.015);
    v.src.stop(t + 0.02);
    this.cut++;
  }
}

/** A room impulse response: decaying stereo noise, darker as it fades (a cheap, natural-sounding small hall). */
export function impulse(ctx: BaseAudioContext, seconds = 1.6, decay = 3, damp = 0.35) {
  const n = Math.max(1, Math.floor(seconds * ctx.sampleRate));
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const k = damp + (1 - damp) * (1 - t); // the tail loses its top
      lp += ((Math.random() * 2 - 1) - lp) * k;
      d[i] = lp * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

// ---- the audio object ----
export class Audio {
  readonly ctx: AudioContext | null;
  readonly music: Music;
  readonly sfx: Sfx;
  /** A whole song re-sequenced by mood, section by section (the alternative to stem layering). */
  readonly song: Song;
  readonly musicBus!: GainNode;
  readonly sfxBus!: GainNode;
  /** Sfx that a ducking sound can lower (every sfx but the ducking ones). */
  readonly duckBus!: GainNode;
  /** Reverb send: a convolver into the limiter (sounds ship dry; `reverb` on a sound or group is its send). */
  readonly reverbBus!: GainNode;
  private convolver!: ConvolverNode;
  /** The scene's room: every sfx feeds this (while a room is on or easing out) into the reverb bus; its gain is the room's `send`. */
  readonly roomSend!: GainNode;
  private base: { seconds?: number; decay?: number; damp?: number } = {};
  private roomTo = 0;
  private roomOffAt = 0;
  /** The send's current ease, so its level is known while nothing sounds (an idle gain node's `.value` goes stale). */
  private roomRamp = { from: 0, to: 0, t0: 0, dur: 0 };
  private roomTimer: ReturnType<typeof setTimeout> | undefined;
  /** Where the ears are, for positional sfx. Default: the centre of the newest running scene's main camera. */
  listener: (() => Point | null) | null = null;
  /** Full volume within `near` px of the listener, silent past `far`. */
  hearing = { near: 300, far: 1100 };
  private limiter!: DynamicsCompressorNode;
  private clip!: WaveShaperNode;
  private analyser!: AnalyserNode;
  private wave = new Float32Array(512);
  private peak = 0;
  private buffers = new Map<string, AudioBuffer>();
  private warned = new Set<string>();
  private listeners = new Set<(v: Volumes) => void>();
  readonly save: Save<Volumes>;
  private vol: Volumes;
  /** The game's own level for its sfx under the player's slider (`trimSfx`): 1 unless the game's mix runs hot. */
  private sfxTrim = 1;
  /** Master scale while nobody is looking: 0.25 while `document.hidden`. `?bgvol=0.25` (any value, 1 = off) also counts an unfocused page as background: the Claude app's browser pane always reports visible, never focused, even when hidden or behind another tab, so an agent play-testing there passes it. */
  private bgvol = 0.25;
  private watchFocus = false;
  /** `?mute=`: an unsaved override on top of the player's muted setting. */
  private readonly urlMute = forcedMute(location.search);

  constructor(private game: Phaser.Game, id: string) {
    const sm = game.sound as Phaser.Sound.WebAudioSoundManager;
    this.ctx = sm.context ?? null;
    this.save = createSave<Volumes>(`${id}:audio`, { master: 1, music: 0.8, sfx: 0.8, muted: false });
    this.vol = { ...this.save.get() };
    const bg = new URLSearchParams(location.search).get('bgvol');
    if (bg) this.bgvol = clamp01(Number(bg));
    this.watchFocus = !!bg;
    for (const [t, ev] of [[document, 'visibilitychange'], [window, 'focus'], [window, 'blur']] as const) t.addEventListener(ev, () => this.apply());
    if (this.ctx) {
      const ctx = this.ctx;
      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.duckBus = ctx.createGain();
      this.duckBus.connect(this.sfxBus);
      this.reverbBus = ctx.createGain();
      this.convolver = ctx.createConvolver();
      this.convolver.buffer = impulse(ctx);
      this.reverbBus.connect(this.convolver).connect(this.sfxBus);
      this.roomSend = ctx.createGain();
      this.roomSend.gain.value = 0;
      this.roomSend.connect(this.reverbBus);
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = LIMITER.threshold;
      this.limiter.knee.value = LIMITER.knee;
      this.limiter.ratio.value = LIMITER.ratio;
      this.limiter.attack.value = LIMITER.attack;
      this.limiter.release.value = LIMITER.release;
      this.clip = ctx.createWaveShaper();
      this.clip.curve = softClipCurve();
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.musicBus.connect(this.limiter);
      this.sfxBus.connect(this.limiter);
      this.limiter.connect(this.clip); // the compressor is not a brick wall (peaks of 1.3 measured); the shaper keeps the output below 1
      this.clip.connect(this.analyser);
      this.clip.connect(sm.destination); // Phaser's mute and master volume come after
    }
    this.music = new Music(this);
    this.sfx = new Sfx(this);
    this.song = new Song(this);
    this.apply(true);
    musicSlot.on(() => this.apply());
  }

  /** Master, music, sfx and muted; a copy. */
  get volume(): Volumes {
    return { ...this.vol };
  }

  /** Change volumes (0..1 each) and save them. Master is Phaser's `sound.volume`, muted is `sound.mute`. */
  set(patch: Partial<Volumes>) {
    for (const k of ['master', 'music', 'sfx'] as const) if (patch[k] !== undefined) this.vol[k] = clamp01(patch[k]!);
    if (patch.muted !== undefined) this.vol.muted = patch.muted;
    this.save.set(this.vol);
    this.apply();
    this.listeners.forEach((f) => f(this.volume));
  }

  onVolume(fn: (v: Volumes) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Scale every sfx of this game (0..1) under the player's sfx volume, which stays as saved. */
  trimSfx(k: number) {
    this.sfxTrim = clamp01(k);
    this.apply();
  }

  private apply(first = false) {
    const sm = this.game.sound;
    sm.volume = this.vol.master * (document.hidden || (this.watchFocus && !document.hasFocus()) ? this.bgvol : 1);
    sm.mute = this.vol.muted || this.urlMute;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const music = this.vol.music * clamp01(musicSlot.value.gain ?? 1);
    if (first) {
      this.musicBus.gain.value = music;
      this.sfxBus.gain.value = this.vol.sfx * this.sfxTrim;
    } else {
      this.musicBus.gain.setTargetAtTime(music, t, 0.015); // no zipper noise while dragging a slider
      this.sfxBus.gain.setTargetAtTime(this.vol.sfx * this.sfxTrim, t, 0.015);
    }
  }

  /** The listener's point now (the game's `listener`, else the camera centre of the newest running scene). */
  listenerPoint(): Point | null {
    if (this.listener) return this.listener();
    const scenes = this.game.scene.getScenes(true);
    for (let i = scenes.length - 1; i >= 0; i--) {
      const cam = scenes[i].cameras?.main;
      if (cam) return { x: cam.midPoint.x, y: cam.midPoint.y };
    }
    return null;
  }

  /** Lower every sfx but the ducking sound to `to` and bring it back over `time` seconds. */
  duck(to: number, time = 0.4) {
    if (!this.ctx) return;
    const g = this.duckBus.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(clamp01(to), t + 0.03);
    g.setTargetAtTime(1, t + 0.03 + time * 0.3, time / 3);
  }

  /** The reverb's room: length in seconds, decay curve, and how fast the tail darkens (0..1). */
  setReverb(o: { seconds?: number; decay?: number; damp?: number; gain?: number } = {}) {
    if (!this.ctx) return;
    this.base = { seconds: o.seconds, decay: o.decay, damp: o.damp };
    if (this.roomTo === 0) this.convolver.buffer = impulse(this.ctx, o.seconds, o.decay, o.damp);
    if (o.gain !== undefined) this.reverbBus.gain.value = o.gain;
  }

  /**
   * A scene-wide room (a cave, a tunnel): while it is on, every sfx also sends `send` (0..1) to the reverb, on top of its own
   * `reverb`, and the reverb's room becomes `seconds` / `decay` / `damp` (a lower `damp` is a darker tail). It eases in over
   * `ease` seconds (the send; the room's tail swaps in at the start). `room(null)` eases it out and gives the game's own room
   * (`setReverb`, else the default) back once the send is gone. Sounds that started before keep the send they started with.
   * Music is untouched. A game sets it per scene; nothing changes for a game that never calls it.
   */
  room(o: { send: number; seconds?: number; decay?: number; damp?: number } | null, ease = 1.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const send = o ? clamp01(o.send) : 0;
    if (!o && !this.roomLive()) return;
    clearTimeout(this.roomTimer);
    if (o) {
      this.roomTo = send;
      this.convolver.buffer = impulse(ctx, o.seconds, o.decay, o.damp);
    } else {
      this.roomTo = 0;
      this.roomOffAt = ctx.currentTime + ease + 0.1;
      this.roomTimer = setTimeout(() => this.roomTo === 0 && (this.convolver.buffer = impulse(ctx, this.base.seconds, this.base.decay, this.base.damp)), (ease + 0.1) * 1000);
    }
    const now = ctx.currentTime;
    const cur = this.roomSendNow();
    this.roomRamp = { from: cur, to: send, t0: now, dur: ease };
    const g = this.roomSend.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(cur, now);
    if (ease < 0.005 || cur === send) g.setValueAtTime(send, now + Math.max(0, ease));
    else g.setValueCurveAtTime(equalPowerCurve(cur, send), now, ease);
  }

  /** The room's send level now (worked out from the ease: an idle gain node's `.value` goes stale). */
  roomSendNow() {
    const { from, to, t0, dur } = this.roomRamp;
    const k = !this.ctx ? 1 : dur > 0 ? Math.min(1, Math.max(0, (this.ctx.currentTime - t0) / dur)) : 1;
    const x = k * (Math.PI / 2);
    return to >= from ? from + (to - from) * Math.sin(x) : to + (from - to) * Math.cos(x);
  }

  /** Does a new sfx feed the room (a room is on, or its send is still easing out)? */
  roomLive() {
    return !!this.ctx && (this.roomTo > 0 || this.ctx.currentTime < this.roomOffAt);
  }

  /**
   * Cut a piece out of a loaded buffer into a new one (a stinger from the song, a single hit from a recording), with
   * linear fades in and out. Returns false if the source is not loaded.
   */
  cut(key: string, from: string, start: number, seconds: number, fadeIn = 0.05, fadeOut = 0.5) {
    const b = this.buffer(from);
    if (!this.ctx || !b) return false;
    const sr = b.sampleRate;
    const a0 = Math.floor(start * sr);
    const n = Math.max(1, Math.min(Math.floor(seconds * sr), b.length - a0));
    const ch = Array.from({ length: b.numberOfChannels }, (_, c) => {
      const d = b.getChannelData(c).slice(a0, a0 + n);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        d[i] *= Math.min(1, t / Math.max(1e-4, fadeIn)) * Math.min(1, (seconds - t) / Math.max(1e-4, fadeOut));
      }
      return d;
    });
    this.addBuffer(key, ch, sr);
    return true;
  }

  /** A decoded buffer by key: ours first, then Phaser's audio cache (`load.audio`). */
  buffer(key: string): AudioBuffer | undefined {
    return this.buffers.get(key) ?? (this.game.cache.audio.get(key) as AudioBuffer | undefined);
  }

  /** Register generated audio (mono Float32Array, or one array per channel). */
  addBuffer(key: string, data: Float32Array | Float32Array[], sampleRate = this.ctx?.sampleRate ?? 44100) {
    if (!this.ctx) return;
    const ch = Array.isArray(data) ? data : [data];
    const buf = this.ctx.createBuffer(ch.length, ch[0].length, sampleRate);
    ch.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    this.buffers.set(key, buf);
  }

  /** Replace a buffer from encoded file bytes (dev hot reload of an edited sound). False without WebAudio. */
  async decode(key: string, bytes: ArrayBuffer) {
    if (!this.ctx) return false;
    this.buffers.set(key, await this.ctx.decodeAudioData(bytes));
    return true;
  }

  /** Warn once about a missing buffer (an artist file not delivered yet must not crash the game). */
  missing(key: string) {
    if (this.ctx && !this.warned.has(key)) {
      this.warned.add(key);
      console.warn(`[audio] no buffer "${key}"`);
    }
  }

  /**
   * Fetch and decode a game's files (layout in the top comment) and define their tracks and sounds.
   * A missing file is reported in `missing`, not thrown. `base` defaults to `public/audio/` in dev and `audio/` in a build.
   */
  async load(m: AudioManifest, o: { base?: string; exts?: string[] } = {}) {
    const ctx = this.ctx;
    const out = { loaded: [] as string[], missing: [] as string[] };
    if (!ctx) return out;
    const base = o.base ?? ((import.meta as { env?: { DEV?: boolean } }).env?.DEV ? 'public/audio/' : 'audio/');
    const exts = o.exts ?? ['ogg', 'mp3'];
    const one = async (name: string, key = name) => {
      for (const ext of exts) {
        try {
          const r = await fetch(new URL(`${base}${name}.${ext}`, document.baseURI));
          if (!r.ok) continue;
          this.buffers.set(key, await ctx.decodeAudioData(await r.arrayBuffer())); // the dev server's html fallback fails here
          out.loaded.push(key);
          return;
        } catch {
          // next extension
        }
      }
      out.missing.push(key);
    };
    const jobs: Promise<void>[] = [];
    for (const [track, v] of Object.entries(m.music ?? {})) {
      const def = Array.isArray(v) ? { stems: v } : v;
      // A track is added once its stems are in, so a `play` that came first starts it then, whole.
      jobs.push(Promise.all(def.stems.map((s) => one(`music/${track}/${s}`))).then(() => this.music.add(track, { ...def, stems: def.stems.map((s) => `music/${track}/${s}`) })));
    }
    for (const s of m.sfx ?? []) jobs.push(one(`sfx/${s}`, s)); // sfx are played by bare name: sfx.play('hit')
    for (const [name, def] of Object.entries(m.songs ?? {})) jobs.push(one(`music/${name}`).then(() => this.song.add(name, { ...def, key: `music/${name}` })));
    await Promise.all(jobs);
    if (out.missing.length) console.warn(`[audio] missing files in ${base}: ${out.missing.join(', ')}`);
    return out;
  }

  /** Stop all music and sfx now. */
  stopAll() {
    this.music.stop({ fade: 0 });
    this.song.stop({ fade: 0 });
    if (this.ctx) this.sfx.stopAll();
  }

  /** Output level over the last 512 samples (for checking that sound flows when nobody can listen). */
  level() {
    if (!this.ctx) return { rms: 0, peak: 0 };
    this.analyser.getFloatTimeDomainData(this.wave);
    let sum = 0;
    let peak = 0;
    for (const v of this.wave) {
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    return { rms: +Math.sqrt(sum / this.wave.length).toFixed(4), peak: +peak.toFixed(3) };
  }

  state() {
    return {
      context: this.ctx?.state ?? 'none',
      volume: this.volume,
      muted: this.vol.muted || this.urlMute,
      urlMute: this.urlMute,
      saveBackend: this.save.backend,
      musicSlot: musicSlot.name,
      music: this.music.state(),
      song: this.song.state(),
      sfx: this.sfx.state(),
      hearing: this.hearing,
      /** The scene's room (`room()`): the send now and where it is heading. */
      room: this.ctx ? { send: +this.roomSendNow().toFixed(3), to: this.roomTo, live: this.roomLive() } : null,
      buffers: this.buffers.size,
      level: this.level(),
      /** Gain reduction of the safety limiter now, dB (0 = idle; steady values below -3 mean the mix runs too hot). */
      limiter: this.ctx ? +this.limiter.reduction.toFixed(1) : 0,
    };
  }
}

const instances = new WeakMap<Phaser.Game, Audio>();

/** The game's audio (created on first use; the id is the save key prefix, default the kit's game id). */
export function audioFor(game: Phaser.Game, id = gameId()): Audio {
  let a = instances.get(game);
  if (!a) instances.set(game, (a = new Audio(game, id)));
  return a;
}

/**
 * The music is Laimonas's, one whole recording per place, looping untouched: no pitch, no layers, no cuts. "Rimti darbai"
 * (`rimti`, the lab's HubBiome.mp3) plays on the title, in the hub, at a mission's results and on the ascent; each biome has
 * its own song on its land and down its dungeons (`BIOME_MUSIC`), and a boss in sight crossfades to the boss battle
 * (`boss`) until it is down or gone. Within a song only its colour changes, eased by the kit's `music.tone` (`TONE`).
 * Sound effects are never cut from the music: they are CC0 recordings (the same Freesound cuts as Wildhold, sources in
 * ../SOUNDS.md) for impacts, the hornets breaking, pickups and clicks, and synthesised machine noises (steam bolts, the
 * hornets' hum, oil glugs, the lift, the Oracle's tones). Only sound effects get pitch variation.
 *
 * Sources in games/proto-ld60-machinerra/audio/, encoded by `npm run audio -- proto-ld60-machinerra`. The music wavs
 * (audio/music/<track>/song.wav) are not committed; each is made from games/lab/art/music/ with ffmpeg (ffmpeg-static
 * is in node_modules): `ffmpeg -i "games/lab/art/music/<file>" -af volume=<gain>dB -ar 44100 games/proto-ld60-machinerra/audio/music/<track>/song.wav`,
 * file and gain in `MUSIC_FILES`. The gains level every song to -21 LUFS integrated (EBU R128, measured with ffmpeg's
 * `ebur128` filter), plain gain with no limiter: every peak stays under -0.5 dBFS. Only `rimti` loads at boot; the others load when first asked for (`playMusic`, `preloadMusic`),
 * so a mission decodes its biome's song and the boss's, not all eight.
 */
import type { Audio, AudioManifest } from '../../../harness/kit';
import type { BiomeId } from './sim/defs';

export const AUDIO: AudioManifest = {
  music: { rimti: ['song'] },
  sfx: ['clang', 'clang2', 'clang3', 'snap', 'snap2', 'crumble', 'crumble2', 'collapse', 'denDown', 'coin', 'coin2', 'click', 'heroHit', 'heroHit2', 'pick4', 'thud', 'creak'],
};

/** The hub's song: also the title's, a mission's results' and the ascent's. */
/** Every sfx's level under the player's slider (`audio.trimSfx`): the mix sat too loud over the music (Minos). A guess. */
export const SFX_TRIM = 0.6;

export const HUB_MUSIC = 'rimti';
/** A boss in sight. */
export const BOSS_MUSIC = 'boss';
/** Each biome's song, on its land and down its dungeons. */
export const BIOME_MUSIC: Record<BiomeId, string> = { desert: 'desert', jungle: 'jungle', city: 'city', demon: 'demon', mountains: 'mountains', ether: 'ether' };
/** Where each track's song.wav comes from (games/lab/art/music/) and the gain in dB that levels it to -21 LUFS. */
export const MUSIC_FILES: Record<string, { file: string; gain: number }> = {
  rimti: { file: 'HubBiome.mp3', gain: 0.4 },
  boss: { file: 'BossBattleMusic.mp3', gain: -2.2 },
  desert: { file: 'DessetBiome.mp3', gain: 1.1 },
  jungle: { file: 'JungleBiome.mp3', gain: 9.7 },
  city: { file: 'CityBiome.mp3', gain: -0.9 },
  demon: { file: 'DemonBiome.mp3', gain: -3.8 },
  mountains: { file: 'MountainBiome.wav', gain: 12.7 },
  ether: { file: 'Ghost biome.wav', gain: 0.5 },
};
/** The boss battle: crossfade in when a boss comes within `near` px of the screen, back to the land's song once none has been for `clear` s. */
export const BOSS_TRACK = { near: 240, clear: 6, in: 1.5, out: 4 };

const asked = new WeakMap<Audio, Set<string>>();
/** Fetch and decode a track once (no-op when it is loaded or on its way). */
export function preloadMusic(a: Audio, track: string) {
  let s = asked.get(a);
  if (!s) asked.set(a, (s = new Set()));
  if (s.has(track) || a.music.has(track)) return;
  s.add(track);
  void a.load({ music: { [track]: ['song'] } });
}
/** Crossfade to a track, loading it first if it is not in yet (it starts once decoded; the last request wins). */
export function playMusic(a: Audio, track: string, o: { fade?: number } = {}) {
  preloadMusic(a, track);
  a.music.play(track, o);
}

/**
 * The music's two colours (kit `music.tone`, eased, the song never stops): calm is muffled and a little quieter, a fight
 * (a hornet anywhere on screen) opens it up. Low oil sags the pitch: the only time the music is detuned.
 */
export const TONE = {
  calm: { lowpass: 1600, gain: 0.42 },
  /** A resting place: quieter and softer than calm. */
  rest: { lowpass: 900, gain: 0.3 },
  fight: { lowpass: 20000, gain: 0.55 },
  /** Seconds to open up when a fight starts, to close again after the screen has been clear for `clear` seconds. */
  open: 1.5,
  close: 4,
  clear: 3,
  /** Below this fraction of the Communicator's oil the music detunes, down to `sag` cents when empty. */
  lowOil: 0.35,
  sag: -70,
};

/**
 * A dungeon's room (kit `audio.room`): every sound sends `send` to the reverb, whose tail is `seconds` long, slow to decay
 * and dark (`damp`: lower is darker); the default room is 1.6 s, decay 3, damp 0.35. Eased in over `in` s on the way down,
 * out over `out` s on the way up. The music is not touched. All of it a first guess, for Laimonas's ear.
 */
export const DUNGEON_ROOM = { send: 0.4, seconds: 3.2, decay: 2.2, damp: 0.15, in: 1.5, out: 2 };

const SR = 44100;
function make(sec: number, fn: (t: number, i: number) => number) {
  const n = Math.floor(sec * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i);
  return out;
}
// Deterministic noise so every build sounds the same.
let seed = 1;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));
const lowpass = (k: number) => {
  let y = 0;
  return (x: number) => (y += (x - y) * k);
};

let installed: Audio | null = null;

/** Synthesised machine noises, and every sound grouped (variants, caps, pitch, priority, reverb, crowds). */
export function installSounds(a: Audio) {
  if (installed === a || !a.ctx) return;
  installed = a;
  const lp1 = lowpass(0.25), lp3 = lowpass(0.05), lp4 = lowpass(0.3);
  // Steam bolt: a hiss with a thump under it; the guards' smaller cannon.
  a.addBuffer('shot', make(0.22, (t) => lp1(noise()) * env(t, 0.004, 0.05) * 0.8 + Math.sin(2 * Math.PI * (140 - t * 300) * t) * env(t, 0.002, 0.04) * 0.6));
  // Shovel swing: air torn by a blade, a filtered noise that swells and falls.
  a.addBuffer('swish', make(0.2, (t) => lp4(noise()) * Math.sin(Math.PI * Math.min(1, t / 0.2)) ** 2 * 0.9));
  // The Guard's saw: a blade biting steel, a raspy sawtooth with a ripple of noise, falling off as it bites.
  a.addBuffer('saw', make(0.3, (t) => (((t * (170 + 90 * t)) % 1) * 2 - 1) * 0.3 * env(t, 0.01, 0.14) + lp4(noise()) * (0.35 + 0.25 * Math.sin(t * 190)) * env(t, 0.006, 0.1)));
  a.addBuffer('zap', make(0.16, (t) => lp4(noise()) * env(t, 0.003, 0.035) * 0.55 + Math.sin(2 * Math.PI * 220 * t) * env(t, 0.002, 0.03) * 0.3));
  // A hornet: a wing hum, not a saw (saws read as distortion): a sine and its octave, throbbing at the wingbeat.
  const hum = (t: number, f: number, beat: number) => (Math.sin(2 * Math.PI * f * t) * 0.7 + Math.sin(2 * Math.PI * 2 * f * t) * 0.25) * (0.65 + 0.35 * Math.sin(2 * Math.PI * beat * t));
  a.addBuffer('buzz', make(0.45, (t) => hum(t, 175 + Math.sin(t * 40) * 12, 32) * 0.4 * Math.min(1, t / 0.04) * Math.min(1, (0.45 - t) / 0.15)));
  // The swarm bed, a seamless 2 s loop: whole cycles of every frequency (174, 205 Hz; 30, 34 Hz beats; 0.5 Hz drift).
  a.addBuffer('swarm', make(2, (t) => (hum(t, 174 + Math.sin(Math.PI * t) * 3, 30) + hum(t, 205, 34) * 0.7) * 0.18));
  a.addBuffer('glug', make(0.35, (t) => Math.sin(2 * Math.PI * (110 + Math.sin(t * 60) * 40) * t) * env(t, 0.01, 0.1) * 0.6 + Math.sin(2 * Math.PI * (160 + Math.sin(t * 45) * 50) * Math.max(0, t - 0.12)) * env(Math.max(0, t - 0.12), 0.01, 0.07) * 0.5));
  a.addBuffer('blip', make(0.32, (t) => Math.sin(2 * Math.PI * (t < 0.12 ? 880 : 1320) * t) * env(t < 0.12 ? t : t - 0.12, 0.005, 0.06) * 0.35));
  // P42: the dog's low woof (a short falling hum with a rasp) and its ears-up chirp; the cat's mew. Placeholders for Laimonas's ear.
  a.addBuffer('woof', make(0.28, (t) => (Math.sin(2 * Math.PI * (150 - 90 * t) * t) * 0.7 + lp4(noise()) * 0.35) * env(t, 0.006, 0.07) * 0.9));
  a.addBuffer('ears', make(0.18, (t) => Math.sin(2 * Math.PI * (700 + 1500 * t) * t) * env(t, 0.004, 0.04) * 0.3));
  a.addBuffer('mew', make(0.4, (t) => Math.sin(2 * Math.PI * (520 + 380 * Math.sin(Math.PI * Math.min(1, t / 0.4))) * t) * Math.sin(Math.PI * Math.min(1, t / 0.4)) * 0.28));
  a.addBuffer('heal', make(0.4, (t) => Math.sin(2 * Math.PI * (600 + t * 900) * t) * env(t, 0.01, 0.12) * 0.25));
  a.addBuffer('warn', make(0.8, (t) => Math.sin(2 * Math.PI * (t % 0.27 < 0.13 ? 660 : 495) * t) * (t % 0.27 < 0.22 ? 0.3 : 0) * Math.min(1, (0.8 - t) * 10)));
  // A live ruin's hum (P30): a low mains drone with a slow beat, swelling in and out.
  a.addBuffer('ruinhum', make(1.6, (t) => (Math.sin(2 * Math.PI * 100 * t) * 0.6 + Math.sin(2 * Math.PI * 200.8 * t) * 0.25 + Math.sin(2 * Math.PI * 300 * t) * 0.08) * Math.sin(Math.PI * t / 1.6) ** 2 * 0.5));
  // The lift, as long as its rise (`MISSION.riseTime`, 3 s) and in step with it: the hiss and the hum swell and climb in pitch as it speeds up (the draw's climb: `liftrise.ts`), the chain's ticks quicken, and it fades as the platform leaves the screen.
  // `liftFast` is the same climb over the Tram Line's 1 s (`TRAM.rise`): the same pitches, the swell and the climb squeezed into the time; `liftSound` has the shape for any length (`sim.city.riseTime` picks which plays: `liftview.ts`).
  const liftSound = (len: number, fade: number) => make(len, (t) => {
    const p = t / len;
    const swell = 0.5 + 0.5 * p * p;
    const tick = (7 * t + 7.5 * t * t / len) % 1 < 0.14;
    return lp3(noise()) * 0.9 * swell * Math.min(1, t / (len * 0.13)) * Math.min(1, (len - t) / fade) + (tick ? noise() * 0.25 * swell : 0) + Math.sin(2 * Math.PI * (48 * t + 12 * t * t / len)) * 0.3 * swell * Math.min(1, t / (len * 0.17)) * Math.min(1, (len - t) / fade);
  });
  a.addBuffer('lift', liftSound(3, 0.5));
  a.addBuffer('liftFast', liftSound(1, 0.25));

  // The day's beats. Dusk: a low swell of sines in a minor shade, beating slowly. Midnight: a bell (inharmonic partials).
  // A twisting hornet: a falling, wobbling whine. The queen: a sub-bass roar through a growl of noise.
  a.addBuffer('dusk', make(3, (t) => (Math.sin(2 * Math.PI * 55 * t) * 0.5 + Math.sin(2 * Math.PI * 55.7 * t) * 0.4 + Math.sin(2 * Math.PI * 65.4 * t) * 0.3 + Math.sin(2 * Math.PI * 82.4 * t) * 0.3 + Math.sin(2 * Math.PI * 110 * t) * 0.12) * Math.min(1, t / 1.2) * Math.min(1, (3 - t) / 1.4) * 0.55));
  a.addBuffer('bell', make(2.6, (t) => (Math.sin(2 * Math.PI * 196 * t) * 0.6 + Math.sin(2 * Math.PI * 196 * 2.76 * t) * 0.3 + Math.sin(2 * Math.PI * 196 * 5.4 * t) * 0.15) * env(t, 0.003, 0.7) * 0.5));
  a.addBuffer('twist', make(0.5, (t) => Math.sin(2 * Math.PI * (420 - 330 * t + Math.sin(t * 90) * 25) * t) * env(t, 0.01, 0.16) * 0.45 + lp4(noise()) * env(t, 0.002, 0.04) * 0.25));
  const lp5 = lowpass(0.08);
  a.addBuffer('queen', make(2, (t) => (Math.sin(2 * Math.PI * (92 - 38 * Math.min(1, t / 1.2)) * t) * 0.6 + lp5(noise()) * 0.9) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 17 * t)) * env(t, 0.05, 0.7) * 0.9));

  // D-city air support. The Wanderer's horn: a low brass chord that swells and falls, felt more than heard. The shell's
  // whistle: a falling pitch with a hiss on it. The blast's thump: a sine dropping through the floor, with a crack of noise.
  a.addBuffer('horn', make(2.6, (t) => (Math.sin(2 * Math.PI * 73.4 * t) * 0.6 + Math.sin(2 * Math.PI * 73.9 * t) * 0.4 + Math.sin(2 * Math.PI * 110 * t) * 0.35 + Math.sin(2 * Math.PI * 146.8 * t) * 0.18) * (0.85 + 0.15 * Math.sin(2 * Math.PI * 5 * t)) * Math.min(1, t / 0.35) * Math.min(1, (2.6 - t) / 0.9) * 0.55));
  const lp6 = lowpass(0.5);
  a.addBuffer('whistle', make(1.3, (t) => (Math.sin(2 * Math.PI * (2600 * t - 900 * t * t)) * 0.22 + lp6(noise()) * 0.12) * Math.min(1, t / 0.5) * Math.min(1, (1.3 - t) / 0.1)));
  a.addBuffer('thump', make(0.7, (t) => Math.sin(2 * Math.PI * (68 - 36 * Math.min(1, t * 3)) * t) * env(t, 0.002, 0.2) * 0.9 + lp4(noise()) * env(t, 0.001, 0.05) * 0.5));

  // Places. Steam venting from a seam: filtered noise that blooms and thins. The shrine unlocking: a clank, then a short brass fanfare.
  const lp7 = lowpass(0.35);
  // The Sandstorm's wind (P40): a 3.4 s gust, hissing sand under a low moan, swelling and fading so the gusts overlap into a bed.
  const lpw = lowpass(0.06), lpw2 = lowpass(0.5);
  a.addBuffer('wind', make(3.4, (t) => {
    const swell = Math.sin(Math.PI * (t / 3.4)) ** 2;
    const n = noise();
    return ((lpw(n) * 2.6 + (n - lpw2(n)) * 0.12) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 1.3 * t)) + Math.sin(2 * Math.PI * (310 + 40 * Math.sin(2 * Math.PI * 0.4 * t)) * t) * 0.025) * swell * 0.8;
  }));
  // The Ember Rain's rumble (P54): a low swell of filtered noise under a sub tone, the sky coming down in pieces.
  const lpr = lowpass(0.03);
  a.addBuffer('rumble', make(3.4, (t) => (lpr(noise()) * 3.2 + Math.sin(2 * Math.PI * (46 + 6 * Math.sin(2 * Math.PI * 0.7 * t)) * t) * 0.3) * Math.sin(Math.PI * (t / 3.4)) ** 2 * 0.8));
  // The jungle's rain (P31): a bright hiss of falling water under soft patters, swelling and fading so the showers overlap into a bed.
  const lpn = lowpass(0.25);
  a.addBuffer('rain', make(3, (t) => {
    const n = noise();
    return ((n - lpn(n)) * 0.55 + (Math.random() < 0.004 ? (Math.random() - 0.5) * 0.9 : 0)) * Math.sin(Math.PI * (t / 3)) ** 2 * 0.7;
  }));
  a.addBuffer('hiss', make(0.55, (t) => (noise() - lp7(noise())) * Math.sin(Math.PI * Math.min(1, t / 0.55)) ** 1.5 * 0.5));
  a.addBuffer('unlock', make(2.2, (t) => {
    let y = lp4(noise()) * env(t, 0.001, 0.04) * 0.6 + Math.sin(2 * Math.PI * (180 - 90 * Math.min(1, t * 8)) * t) * env(t, 0.001, 0.08) * 0.7;
    [262, 330, 392, 523].forEach((f, i) => {
      const u = t - 0.18 - i * 0.12;
      if (u > 0) y += (Math.sin(2 * Math.PI * f * u) * 0.5 + Math.sin(2 * Math.PI * f * 2 * u) * 0.2 + Math.sin(2 * Math.PI * f * 1.005 * u) * 0.3) * env(u, 0.02, i === 3 ? 0.7 : 0.25) * 0.28;
    });
    return y;
  }));

  const s = a.sfx;
  s.group('horn', ['horn'], { max: 1, priority: 8, reverb: 0.6, gain: 0.9, duck: 0.5, duckTime: 2 });
  s.group('whistle', ['whistle'], { max: 1, priority: 6, reverb: 0.3, gain: 0.7 });
  s.group('thump', ['thump'], { max: 4, priority: 5, vary: 0.1, reverb: 0.3, gain: 0.9 });
  s.group('shell', ['collapse', 'denDown'], { pitch: 0.8, vary: 0.1, max: 4, priority: 5, reverb: 0.5, gain: 0.8 });
  s.group('dusk', ['dusk'], { max: 1, priority: 7, reverb: 0.5, gain: 0.8, duck: 0.5, duckTime: 2 });
  s.group('bell', ['bell'], { max: 3, priority: 7, reverb: 0.6, gain: 0.7 });
  s.group('twist', ['twist'], { max: 3, priority: 3, vary: 0.12, gain: 0.5 });
  s.group('queen', ['queen'], { max: 1, priority: 8, reverb: 0.4, gain: 0.9, duck: 0.6, duckTime: 1.5 });
  // Recordings: metal on metal for bolt hits, cracking and crumbling for a hornet breaking, a collapse for a hive.
  s.group('hit', ['clang', 'clang2', 'clang3'], { pitch: 1.15, vary: 0.1, gainVary: 0.25, max: 3, priority: 1, reverb: 0.15, density: true, gain: 0.45 });
  s.group('pop', ['snap', 'snap2', 'crumble', 'crumble2'], { pitch: 1.2, vary: 0.15, max: 3, priority: 2, reverb: 0.2, gain: 0.6 });
  s.group('boom', ['collapse', 'denDown'], { vary: 0.06, max: 2, priority: 3, reverb: 0.4, gain: 0.8 });
  s.group('crunch', ['crumble', 'crumble2', 'collapse'], { pitch: 0.62, vary: 0.08, max: 2, priority: 4, reverb: 0.35, gain: 0.8 });
  s.group('rock', ['pick4', 'thud'], { pitch: 1.3, vary: 0.2, max: 2, gain: 0.5 });
  s.group('click', ['click'], { vary: 0.05, max: 2, priority: 2, gain: 0.7 });
  s.group('pickup', ['coin', 'coin2'], { vary: 0.06, max: 3, priority: 2, reverb: 0.2, gain: 0.6 });
  // Attention (P33): what costs the Communicator oil cuts through (it lowers the routine sounds for a beat); routine sounds (a pickup, the Oracle's calm chirp, a robot's swing) sit back.
  s.group('hurt', ['heroHit', 'heroHit2'], { vary: 0.08, max: 1, priority: 6, gain: 0.8, duck: 0.7, duckTime: 0.35 });
  s.group('creak', ['creak'], { max: 1, priority: 5, reverb: 0.3, gain: 0.7 });
  // Tones, not music: the Oracle's chirp and a repair chime.
  s.group('woof', ['woof'], { max: 2, priority: 4, reverb: 0.3, gain: 0.55, vary: 0.1 });
  s.group('ears', ['ears'], { max: 1, priority: 3, reverb: 0.3, gain: 0.5 });
  s.group('mew', ['mew'], { max: 1, priority: 2, reverb: 0.2, gain: 0.4, vary: 0.12 });
  s.group('blip', ['blip'], { max: 2, priority: 3, reverb: 0.4, gain: 0.45 });
  s.group('heal', ['heal'], { vary: 0.03, max: 2, priority: 2, reverb: 0.3, gain: 0.5 });
  // Machines.
  s.group('shot', ['shot'], { max: 3, priority: 3, vary: 0.12, gain: 0.6 });
  s.group('swish', ['swish'], { max: 2, priority: 2, vary: 0.15, gain: 0.5 });
  s.group('saw', ['saw'], { max: 2, priority: 2, vary: 0.15, gain: 0.45 });
  s.group('zap', ['zap'], { max: 3, priority: 1, vary: 0.12, density: true, gain: 0.5 });
  s.group('warn', ['warn'], { max: 1, priority: 6, duck: 0.6, duckTime: 0.8, gain: 0.6 });
  s.group('ruinhum', ['ruinhum'], { max: 2, priority: 1, vary: 0.03, reverb: 0.25, gain: 0.35 });
  s.group('lift', ['lift'], { max: 1, priority: 6, reverb: 0.3, gain: 0.6 });
  s.group('liftFast', ['liftFast'], { max: 1, priority: 6, reverb: 0.3, gain: 0.6 });
  s.group('wind', ['wind'], { max: 2, priority: 1, vary: 0.08, reverb: 0.25, gain: 0.6 });
  s.group('rain', ['rain'], { max: 2, priority: 1, vary: 0.06, reverb: 0.2, gain: 0.5 });
  s.group('rumble', ['rumble'], { max: 2, priority: 1, vary: 0.06, reverb: 0.3, gain: 0.6 });
  s.group('hiss', ['hiss'], { max: 3, priority: 2, vary: 0.2, reverb: 0.2, gain: 0.5 });
  s.group('unlock', ['unlock'], { max: 1, priority: 8, reverb: 0.5, gain: 0.8, duck: 0.4, duckTime: 1.5 });
  // Many sources, one sound: the nearest few hornets buzz one by one, the rest swell into a swarm bed; gatherers too.
  s.group('buzz', ['buzz'], { max: 3, vary: 0.2, lod: 3, lodWindow: 0.9, bed: 'swarm', bedGain: 0.5 });
  s.group('glug', ['glug'], { max: 2, vary: 0.2, lod: 2, density: true, gain: 0.6 });
  a.hearing = { near: 320, far: 1100 };
}

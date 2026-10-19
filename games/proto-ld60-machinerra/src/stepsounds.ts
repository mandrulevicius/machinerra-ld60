/**
 * Step sounds: one group per surface (`step-<surface>`, `footsteps.ts`), each of them Laimonas's recordings when delivered, else
 * a synthesised placeholder (two variants per surface, deterministic).
 *
 * A recording is `audio/sfx/step-<surface>.wav`, with `step-<surface>2`, `step-<surface>3` for more variants (like `clang`, `clang2`),
 * encoded by `npm run audio -- proto-ld60-machinerra`; add its name to `STEP_FILES` and it replaces the placeholder (the group
 * takes the files of a surface that loaded and ignores the rest; nothing else changes). Delivered sounds are mixed by the group's
 * `gain`, so a file should be a normal-level step, not a quiet one.
 */
import type { Audio } from '../../../harness/kit';
import { SURFACES, type Surface } from './footsteps';

/** Delivered step recordings, by name. Empty until Laimonas's arrive. */
export const STEP_FILES: string[] = [];

const SR = 44100;
const make = (sec: number, fn: (t: number) => number) => {
  const out = new Float32Array(Math.floor(sec * SR));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / SR);
  return out;
};
const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));
const lowpass = (k: number) => {
  let y = 0;
  return (x: number) => (y += (x - y) * k);
};
/** A noise stream of its own, so the variants differ and every build sounds the same. */
const noiser = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const sin = (f: number, t: number) => Math.sin(2 * Math.PI * f * t);

/** The placeholders: one recipe per surface, called once per variant with its own noise. Lengths in seconds. */
const SYNTH: Record<Surface, (n: () => number) => Float32Array> = {
  // A soft scuff: band-limited noise that swells and falls.
  sand: (n) => {
    const a = lowpass(0.35), b = lowpass(0.03);
    return make(0.17, (t) => (a(n()) - b(n())) * env(t, 0.014, 0.05) * 1.6);
  },
  // Duller and lower than sand, with a muffled thump under it.
  ash: (n) => {
    const a = lowpass(0.12), b = lowpass(0.015);
    return make(0.2, (t) => ((a(n()) - b(n())) * env(t, 0.022, 0.07) * 1.3 + sin(72, t) * env(t, 0.004, 0.035) * 0.3));
  },
  // A squelch: a low sweep with a slower, wetter suck after it.
  mud: (n) => {
    const a = lowpass(0.05);
    return make(0.26, (t) => {
      const u = Math.max(0, t - 0.08);
      return a(n()) * env(t, 0.006, 0.05) * 1.4 + sin(160 - t * 650, t) * env(t, 0.004, 0.05) * 0.5 + sin(300 + u * 1500, u) * env(u, 0.02, 0.05) * (t > 0.08 ? 0.08 : 0);
    });
  },
  // A crunch: a handful of tiny bright cracks over a soft body.
  snow: (n) => {
    const body = lowpass(0.18), hi = lowpass(0.25);
    const cracks = Array.from({ length: 8 }, (_, i) => ({ at: 0.004 + i * 0.011 + (n() + 1) * 0.004, g: 0.5 + (n() + 1) * 0.3 }));
    return make(0.17, (t) => {
      let c = 0;
      for (const k of cracks) if (t >= k.at) c += k.g * env(t - k.at, 0.0008, 0.005);
      const x = n();
      return body(x) * env(t, 0.01, 0.05) * 0.8 + (x - hi(x)) * c * 0.9;
    });
  },
  // A dry knock: a short tick of noise with a low tone.
  rock: (n) => {
    const a = lowpass(0.3);
    return make(0.11, (t) => a(n()) * env(t, 0.001, 0.012) * 1.1 + sin(210, t) * env(t, 0.002, 0.022) * 0.55 + sin(1600, t) * env(t, 0.001, 0.006) * 0.15);
  },
  // A sharper tap with a little ring.
  tile: (n) => {
    const a = lowpass(0.5);
    return make(0.12, (t) => sin(520, t) * env(t, 0.001, 0.014) * 0.45 + a(n()) * env(t, 0.001, 0.006) * 0.7 + sin(1900, t) * env(t, 0.001, 0.035) * 0.1);
  },
  // Hard and glassy: a tap, a thin high ring and a low thud.
  ice: (n) => {
    const a = lowpass(0.6);
    return make(0.14, (t) => a(n()) * env(t, 0.001, 0.005) * 0.6 + sin(2600, t) * env(t, 0.001, 0.05) * 0.14 + sin(140, t) * env(t, 0.002, 0.02) * 0.35);
  },
  // A boot on an iron plate: a low knock and a short ring.
  deck: (n) => {
    const a = lowpass(0.2);
    return make(0.17, (t) => a(n()) * env(t, 0.002, 0.018) * 0.7 + sin(95, t) * env(t, 0.002, 0.03) * 0.5 + sin(1830, t) * env(t, 0.001, 0.035) * 0.05);
  },
};

/** Even the placeholders out: each to the same loudness (rms) and under a peak, so the group's gain is the only level. */
function level(d: Float32Array, rms = 0.1, peak = 0.8) {
  let pk = 0, sq = 0;
  for (const v of d) (pk = Math.max(pk, Math.abs(v))), (sq += v * v);
  const k = Math.min(peak / (pk || 1), rms / (Math.sqrt(sq / d.length) || 1));
  return d.map((v) => v * k);
}

/** A surface's group: this loudness and spread, a cap of two at once (steps are routine: they sit back in the mix). */
const GROUP = { max: 2, vary: 0.1, gainVary: 0.2, priority: 1, reverb: 0.15, gain: 0.06 };

/** The sound's name to play for a surface (`sfx.play(stepSound(s))`). */
export const stepSound = (s: Surface) => `step-${s}`;

const installed = new WeakSet<Audio>();
/** Register every surface's group: the recordings that loaded, else the placeholders. Safe to call again. */
export function installStepSounds(a: Audio) {
  if (installed.has(a) || !a.ctx) return;
  installed.add(a);
  for (const s of SURFACES) {
    const files = STEP_FILES.filter((f) => f === stepSound(s) || (f.startsWith(stepSound(s)) && /^\d+$/.test(f.slice(stepSound(s).length)))).filter((f) => a.buffer(f));
    const keys = files.length ? files : [1, 2].map((v) => {
      const key = `${stepSound(s)}~${v}`;
      a.addBuffer(key, level(SYNTH[s](noiser(1000 * (SURFACES.indexOf(s) + 1) + 37 * v))));
      return key;
    });
    a.sfx.group(stepSound(s), keys, GROUP);
  }
}

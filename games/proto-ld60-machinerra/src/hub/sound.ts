/**
 * The hub's own sounds, synthesised: a brass latch when a panel opens, a soft chime when a station comes into reach (its
 * footsteps are the deck's, `stepsounds.ts`). The Oracle's chirp (`blip`) and the recordings
 * come from ../sound.ts.
 */
import type { Audio } from '../../../../harness/kit';
import { installSounds } from '../sound';

const SR = 44100;
function make(sec: number, fn: (t: number) => number) {
  const out = new Float32Array(Math.floor(sec * SR));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / SR);
  return out;
}
const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));

let installed: Audio | null = null;

export function installHubSounds(a: Audio) {
  installSounds(a);
  if (installed === a || !a.ctx) return;
  installed = a;
  // A brass latch: two clicks and a creak of hinge.
  a.addBuffer('latch', make(0.35, (t) => {
    const k1 = Math.sin(2 * Math.PI * 2400 * t) * env(t, 0.001, 0.008);
    const t2 = Math.max(0, t - 0.07);
    const k2 = Math.sin(2 * Math.PI * 1700 * t2) * env(t2, 0.001, 0.012) * (t > 0.07 ? 1 : 0);
    const cr = Math.sin(2 * Math.PI * (300 + t * 400) * t) * Math.sin(2 * Math.PI * 30 * t) * env(t, 0.05, 0.12) * 0.15;
    return (k1 * 0.4 + k2 * 0.5 + cr) * 0.8;
  }));
  // A soft bell: a station comes into reach.
  a.addBuffer('near', make(0.6, (t) => (Math.sin(2 * Math.PI * 1046 * t) + Math.sin(2 * Math.PI * 1568 * t) * 0.4) * env(t, 0.004, 0.18) * 0.18));
  const s = a.sfx;
  s.group('latch', ['latch'], { max: 1, priority: 4, reverb: 0.2, gain: 0.7 });
  s.group('near', ['near'], { max: 1, priority: 2, reverb: 0.4, gain: 0.5 });
}

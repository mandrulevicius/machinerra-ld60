/**
 * The dialog's sounds, synthesised: a soft telegraph key for every character typed (never sharp: a low wooden-brass tap,
 * pitch varied by the kit), the tape feeding, a ratchet when the lever selection moves, and the lever's thunk.
 */
import type { Audio } from '../../../../harness/kit';

const SR = 44100;
function make(sec: number, fn: (t: number) => number) {
  const out = new Float32Array(Math.floor(sec * SR));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / SR);
  return out;
}
let seed = 11;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));
const lowpass = (k: number) => {
  let y = 0;
  return (x: number) => (y += (x - y) * k);
};

let installed: Audio | null = null;

export function installTalkSounds(a: Audio) {
  if (installed === a || !a.ctx) return;
  installed = a;
  // A telegraph key: a round tap (a short low sine) with a whisper of filtered noise and a faint ring.
  const lpT = lowpass(0.12);
  a.addBuffer('tgTick', make(0.06, (t) => Math.sin(2 * Math.PI * 760 * t) * env(t, 0.0008, 0.007) * 0.55 + lpT(noise()) * env(t, 0.0004, 0.004) * 0.5 + Math.sin(2 * Math.PI * 2050 * t) * env(t, 0.0005, 0.01) * 0.04));
  // The tape feeding out of the slot: a short soft whirr.
  const lpF = lowpass(0.07);
  a.addBuffer('tgFeed', make(0.2, (t) => lpF(noise()) * Math.sin(Math.PI * Math.min(1, t / 0.2)) * 0.8 + (t % 0.022 < 0.003 ? noise() * 0.18 : 0)));
  // A ratchet: two small clicks of a pawl on a cog.
  a.addBuffer('ratchet', make(0.09, (t) => {
    const u = Math.max(0, t - 0.035);
    return Math.sin(2 * Math.PI * 1500 * t) * env(t, 0.0005, 0.006) * 0.4 + Math.sin(2 * Math.PI * 1100 * u) * env(u, 0.0005, 0.007) * (t > 0.035 ? 0.35 : 0);
  }));
  // The lever's thunk: the arm hits its stop. A low body falling through the floor, a clack of brass, a settling click.
  const lpK = lowpass(0.18);
  a.addBuffer('thunk', make(0.55, (t) => {
    const body = Math.sin(2 * Math.PI * (88 - 44 * Math.min(1, t * 6)) * t) * env(t, 0.002, 0.11) * 0.95;
    const clack = (Math.sin(2 * Math.PI * 1480 * t) * 0.5 + Math.sin(2 * Math.PI * 2210 * t) * 0.25) * env(t, 0.0008, 0.035) * 0.3 + lpK(noise()) * env(t, 0.0006, 0.012) * 0.6;
    const u = Math.max(0, t - 0.13);
    const settle = t > 0.13 ? Math.sin(2 * Math.PI * 1240 * u) * env(u, 0.0006, 0.012) * 0.22 : 0;
    return (body + clack + settle) * 0.9;
  }));
  const s = a.sfx;
  s.group('tgTick', ['tgTick'], { max: 3, vary: 0.22, gainVary: 0.25, priority: 1, reverb: 0.12, gain: 0.3 });
  s.group('tgFeed', ['tgFeed'], { max: 1, vary: 0.1, priority: 1, gain: 0.25 });
  s.group('ratchet', ['ratchet'], { max: 2, vary: 0.1, priority: 2, gain: 0.5 });
  s.group('thunk', ['thunk'], { max: 1, vary: 0.04, priority: 5, reverb: 0.25, gain: 0.85 });
}

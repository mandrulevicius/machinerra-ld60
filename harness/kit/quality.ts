/**
 * Graphics quality: a level plus toggles, persisted per game with harness/save.ts.
 *
 *   quality.get()                      { level, shadows, lights, particles, glow }
 *   quality.set({ level: 'low' })      a level (even the current one) resets every toggle to its defaults
 *   quality.set({ shadows: false })    a toggle overrides one setting and keeps the level
 *   quality.on(fn)                     called after every change
 *   quality.needsReload()              true when `lights` differs from the cap baked into the shader
 *
 * Live: shadows, particles, glow, and lowering lights. Reload: raising lights above the baked cap
 * (Phaser bakes render.maxLights into the light shader at the first lit render). `?q=low|medium|high` overrides the level.
 * There is no render-resolution setting: Phaser 4 renders at the game size (1280x720) whatever the window or DPI,
 * and a smaller game size would change scale.width and pointer.x for every scene.
 */
import { createSave, type Save, type SaveOptions } from '../save';

export type QualityTier = 'low' | 'medium' | 'high';
export interface QualitySettings {
  level: QualityTier;
  /** Drop shadows and self-shadow on lit objects. */
  shadows: boolean;
  /** Light cap: most lights drawn at once (render.maxLights). */
  lights: number;
  /** Multiplier on particle counts and caps. */
  particles: number;
  /** Bloom in the screen look and additive halos around particles. */
  glow: boolean;
}

/** Judgement from the lab numbers (Intel UHD, 1280x720): see Lighting/Particles/Filters probes. Not tuned on other machines. */
export const LEVELS: Record<QualityTier, Omit<QualitySettings, 'level'>> = {
  low: { shadows: false, lights: 8, particles: 0.4, glow: false },
  medium: { shadows: true, lights: 16, particles: 1, glow: true },
  high: { shadows: true, lights: 32, particles: 1.5, glow: true },
};

export interface Quality {
  get(): QualitySettings;
  set(patch: Partial<QualitySettings>): void;
  on(fn: () => void): () => void;
  /** The light cap the shader was (or will be) compiled with. */
  bakedLights: number | null;
  needsReload(): boolean;
  readonly save: Save<QualitySettings>;
}

const settingsFor = (level: QualityTier): QualitySettings => ({ level, ...LEVELS[level] });

export function createQuality(gameId: string, query = '', opts?: SaveOptions): Quality {
  const save = createSave<QualitySettings>(`${gameId}:quality`, settingsFor('high'), opts);
  const q = new URLSearchParams(query).get('q') as QualityTier | null;
  let current: QualitySettings = q && q in LEVELS ? settingsFor(q) : { ...save.get() };
  const listeners = new Set<() => void>();
  const quality: Quality = {
    get: () => current,
    set(patch) {
      current = patch.level ? { ...settingsFor(patch.level), ...patch } : { ...current, ...patch };
      save.set(current);
      listeners.forEach((f) => f());
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    bakedLights: null,
    needsReload: () => quality.bakedLights !== null && current.lights > quality.bakedLights,
    save,
  };
  return quality;
}

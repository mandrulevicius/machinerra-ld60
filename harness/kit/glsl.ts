/**
 * Pure GLSL/uniform helpers behind shader.ts (no Phaser import, so they unit-test in Node).
 * Phaser 4 gotchas they cover (Shaders probe): the `#pragma phaserTemplate(...)` lines are mandatory, uniforms are
 * looked up by name (a typo silently reads 0), and texture coordinates are GL-oriented (y = 0 at the bottom).
 */

const NAME_PRAGMA = '#pragma phaserTemplate(shaderName)';
const HEADER_PRAGMA = '#pragma phaserTemplate(fragmentHeader)';

/** Uniform names the scaffold supplies itself; declaring them in GLSL is enough, no need to pass them. */
export const BUILTIN_UNIFORMS = ['uTime', 'uResolution', 'uPointer'] as const;

/**
 * Make fragment source Phaser-ready. Adds, only when missing:
 *  - `#pragma phaserTemplate(shaderName)` as the first line,
 *  - `precision mediump float;` after it,
 *  - filters only: `#pragma phaserTemplate(fragmentHeader)` after the last uniform/varying/precision line. Without it the
 *    injected `boundedSampler` is undefined and the compile error only shows at the first draw.
 */
export function prepareFragment(src: string, kind: 'filter' | 'shader'): string {
  const lines = src.replace(/^﻿/, '').split(/\r?\n/);
  if (!lines.some((l) => l.includes('phaserTemplate(shaderName)'))) lines.unshift(NAME_PRAGMA);
  if (!lines.some((l) => /^\s*precision\s/.test(l))) {
    const at = lines.findIndex((l) => l.includes('phaserTemplate(shaderName)'));
    lines.splice(at + 1, 0, 'precision mediump float;');
  }
  if (kind === 'filter' && !lines.some((l) => l.includes('phaserTemplate(fragmentHeader)'))) {
    let at = lines.findIndex((l) => l.includes('phaserTemplate(shaderName)'));
    lines.forEach((l, i) => {
      if (/^\s*(uniform|varying|precision)\b/.test(l)) at = i;
    });
    lines.splice(at + 1, 0, HEADER_PRAGMA);
  }
  return lines.join('\n');
}

/** Names of the uniforms the GLSL declares (`uniform vec2 a, b;` gives both). Comments are ignored. */
export function declaredUniforms(src: string): Set<string> {
  const out = new Set<string>();
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const m of code.matchAll(/\buniform\s+(?:(?:lowp|mediump|highp)\s+)?\w+\s+([^;]+);/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().match(/^(\w+)/);
      if (name) out.add(name[1]);
    }
  }
  return out;
}

/** Supplied uniform names the GLSL does not declare (typos), builtins excepted. */
export function unknownUniforms(src: string, names: string[]): string[] {
  const declared = declaredUniforms(src);
  const builtin = new Set<string>(BUILTIN_UNIFORMS);
  return names.filter((n) => !declared.has(n) && !builtin.has(n));
}

/** Pointer in game pixels to the 0..1, y-up space that `outTexCoord` uses. */
export function pointerUv(x: number, y: number, width: number, height: number, out: [number, number] = [0, 0]): [number, number] {
  out[0] = x / width;
  out[1] = 1 - y / height;
  return out;
}

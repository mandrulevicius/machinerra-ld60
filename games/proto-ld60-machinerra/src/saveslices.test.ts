import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanGear, syncWeapons } from './sim/gear';
import { cleanLoadout } from './sim/loadout';
import { gear, loadout } from './hub/carry';
import { hub, registeredKeys, slot } from './hub/save';
import { diff } from './saveaudit';
import { auditSave, sampleOf } from './saveslices';

beforeEach(() => hub.reset());

/** Every `persist('key', ...)` written in the sources (not in comments): the slices the game declares. */
function declaredKeys(dir = join(__dirname)): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...declaredKeys(p));
    else if (/\.ts$/.test(f) && !/\.test\.ts$/.test(f)) {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        if (/^\s*(\*|\/\/|\/\*)/.test(line)) continue;
        for (const m of line.matchAll(/\bpersist(?:<[^>]*>)?\(\s*'([^']+)'/g)) out.push(m[1]);
      }
    }
  }
  return out;
}

describe('the save audit on the game\'s own slices', () => {
  it('every slice declared in the sources is registered by the modules the audit imports', () => {
    expect(declaredKeys().sort()).toEqual([...registeredKeys()].sort());
  });

  it('every registered slice carries a sample', () => {
    expect(registeredKeys().filter((k) => sampleOf(k) === undefined)).toEqual([]);
  });

  it('every slice comes back from a save and a reload exactly as it went in', () => {
    expect(auditSave()).toEqual([]);
  });

  it('puts the save back as it was', () => {
    const before = hub.get();
    hub.set({ ...before, city: 321, missions: 7 });
    const file = JSON.stringify(slot.list()[0]!.data);
    expect(auditSave()).toEqual([]);
    expect(JSON.stringify(slot.list()[0]!.data)).toBe(file);
    expect(hub.get()).toMatchObject({ city: 321, missions: 7 });
  });

  it('the samples are valid for the wrappers that clean what they read (loadout, gear)', () => {
    const loadoutSample = sampleOf('loadout') as never, gearSample = sampleOf('gear') as never;
    loadout.set(loadoutSample);
    expect(loadout.get()).toEqual(loadoutSample);
    expect(cleanLoadout(loadoutSample)).toEqual(loadoutSample);
    expect(cleanGear(gearSample)).toEqual(gearSample);
    gear.set(gearSample);
    expect(diff(syncWeapons(cleanGear(gearSample), loadoutSample), gearSample)).toEqual([]);
    expect(diff(gear.get(), gearSample)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { BIOMES, BOSSES, ENEMY_PARTS, MISSION, PARTS, T, WEAPONS, type BiomeId, type Enemy } from './defs';
import { KITS, kitDrops, specFor } from './dungeon';
import { ITEMS, type ItemId } from './gear';
import { NO_INPUT, Sim } from './sim';
import { rideLift } from './testkit';

/** The four designed dungeons (games/ludum-dare-60/docs/dungeons.md) and their mini-bosses. */
const DESIGNED: [BiomeId, Enemy][] = [['jungle', 'croc'], ['city', 'mallcop'], ['demon', 'bishop'], ['mountains', 'snowcat']];
const down = (biome: BiomeId, over: Parameters<typeof specFor>[2] = {}) =>
  new Sim(`t-${biome}`, [], biome, [], undefined, undefined, { dungeon: specFor(`t-${biome}`, biome, { twist: null, ...over }), dayT: 300 });

describe('the designed dungeons', () => {
  it('each has its own foes, material, mini-boss and weapon, and an entrance on its lands', () => {
    for (const [biome, boss] of DESIGNED) {
      const k = KITS[biome];
      expect(k.built && !k.stub, biome).toBe(true);
      expect(k.foes.some((f) => f === 'snake'), biome).toBe(false);
      expect(kitDrops(k)).toContain(k.material);
      expect(k.bosses).toEqual([boss]);
      const B = BOSSES[boss]!;
      const u = PARTS[B.drops.unique];
      expect(u.unique && u.from).toBe(boss);
      const item = ITEMS[u.item as ItemId];
      expect(item?.weapon && WEAPONS[item.weapon], biome).toBeTruthy();
      // The workbench copies the weapon from the material and another unique.
      expect(item.recipe.parts).toMatchObject({ [k.material]: 4, [B.drops.unique]: 1 });
      // And the material makes a piece of its own.
      expect(Object.values(ITEMS).some((d) => !d.weapon && d.recipe.parts?.[k.material]), biome).toBe(true);
      expect(BIOMES[biome].places).toContain('dungeon');
      for (const f of k.foes) expect(ENEMY_PARTS[f].part).toBeTruthy();
    }
  });

  it('every one plays: its foes in the rooms, its mini-boss in the den; all of them fight a while without trouble', () => {
    for (const [biome, boss] of DESIGNED) {
      const s = down(biome, { tier: 2 });
      s.god = true;
      expect(s.denBoss?.kind).toBe(boss);
      for (const f of KITS[biome].foes) expect(s.hornets.some((h) => h.kind === f) || f === 'copdrone' || f === 'cart', `${biome} ${f}`).toBe(true);
      // Stand among them in the first hall, then fight the boss in its den.
      const d = s.run!.d;
      s.controller.x = (d.chain[1].cx + 0.5) * T;
      s.controller.y = (d.chain[1].cy + 0.5) * T;
      for (let i = 0; i < 300; i++) s.step(1 / 30, { ...NO_INPUT, ax: s.controller.x + 100, ay: s.controller.y });
      const b = s.denBoss!;
      s.controller.x = b.x - 160;
      s.controller.y = b.y;
      for (let i = 0; i < 600; i++) s.step(1 / 30, { ...NO_INPUT, ax: b.x, ay: b.y });
      for (const h of s.hornets) expect(Number.isFinite(h.x) && Number.isFinite(h.y), `${biome} ${h.kind}`).toBe(true);
      // It falls and leaves its weapon's part.
      b.hp = 1;
      for (let i = 0; i < 60 && !b.dead; i++) {
        s.controller.x = b.x - 30;
        s.controller.y = b.y;
        s.step(1 / 30, { ...NO_INPUT, ax: b.x, ay: b.y, fire: true });
      }
      expect(b.dead, biome).toBe(true);
      expect(s.loot.some((l) => l.part === BOSSES[boss]!.drops.unique) || (s.parts[BOSSES[boss]!.drops.unique] ?? 0) > 0, biome).toBe(true);
      s.controller.x = s.lift.x;
      s.controller.y = s.lift.y;
      rideLift(s);
      expect(s.phase, biome).toBe('done');
    }
  });
});



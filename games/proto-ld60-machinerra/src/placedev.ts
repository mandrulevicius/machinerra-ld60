/**
 * Dev commands for seeing a place (group `places`; registered at boot, so they work in every scene):
 *   bench <id> [biome] [rot] [mir]   the bench (`Place.ts`): the place alone on plain ground
 *   benchland <id>                   a land file (`levels/lands/<id>.json`) whole in the bench
 *   landfiles                        every land file: name, biome, size, spots, problems
 *   benchgrid [on|off]               the bench's tile grid and part ids
 *   placeland <id> [biome] [seed]    a real land with that place in it, the Communicator beside it
 *   placefiles                       every place file: name, tags, presence rule, parts and ground shapes
 * `placeland` forces the place into the land (`forced` in `sim/places.ts`), whatever the biome lists or the presence
 * rule says, only until the land exists.
 */
import { command } from '../../../harness/dev/commands';
import { BIOMES, type BiomeId } from './sim/defs';
import { LANDS, LAND_IDS, landProblems, loadLand } from './sim/lands';
import { PLACES, PLACE_IDS, forced, type PlaceId } from './sim/places';

interface Bridge {
  goto(key: string, data?: object): void;
  scene(key: string): any;
  cmd(line: string): Promise<string>;
}
const bridge = () => (window as unknown as { __game: Bridge }).__game;
const g = { group: 'places' };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function registerPlaceCommands() {
  const ids = () => [...PLACE_IDS] as string[];
  const biomes = Object.keys(BIOMES);
  const idArg = (id: string | undefined) => (id && (PLACE_IDS as readonly string[]).includes(id) ? (id as PlaceId) : null);

  command('bench', ([id, biome, rot, mir]) => {
    const pid = idArg(id);
    if (!pid) return `error: bench <${ids().join('|')}> [biome] [rot degrees] [mir 1|-1]`;
    bridge().goto('Place', { id: pid, ...(biome && { biome }), ...(rot && { rot: Number(rot) }), ...(mir && { mir: Number(mir) }) });
    return `the bench: ${PLACES[pid].name}. ?scene=Place&id=${pid} loads it directly; benchgrid for the tile grid`;
  }, 'bench <id> [biome] [rot] [mir]: one place alone on plain ground of a biome, drawn with the game\'s own art (keys G R M B N [ ])', { ...g, args: ids });

  command('benchland', ([id]) => {
    if (!id || !LAND_IDS().includes(id)) return `error: benchland <${LAND_IDS().join('|') || 'no land files'}>`;
    bridge().goto('Place', { land: id });
    return `the bench: ${LANDS[id].name}. ?scene=Place&land=${id} loads it directly; F2 edits the file`;
  }, 'benchland <id>: a handcrafted land file (levels/lands) whole in the bench; F2 edits it', { ...g, args: LAND_IDS });

  command('landfiles', () =>
    LAND_IDS().map((id) => {
      const d = LANDS[id], p = landProblems(loadLand(id));
      return `${id.padEnd(10)} ${d.name} | ${d.biome} | ${d.w}x${d.h} | ${d.seeps.length} seeps, ${d.nests.length} hives, ${d.ruins.length} ruins, ${d.places.length} places, ${d.shapes.length} ground shapes | ${p.length ? p.join('; ') : 'sound'}`;
    }).join('\n') || 'no land files',
  'landfiles: every land file (levels/lands/*.json): name, biome, size, spots, and what is wrong with it', g);

  command('benchgrid', ([on]) => {
    const s = bridge().scene('Place');
    if (!s?.scene.isActive()) return 'error: the bench is not running (bench <id>)';
    s.setGrid(on ? on !== 'off' : !s.v.grid);
    return `grid ${s.v.grid ? 'on' : 'off'}`;
  }, 'benchgrid [on|off]: the bench\'s tile grid, part ids and the place\'s centre', { ...g, args: () => ['on', 'off'] });

  command('placefiles', () =>
    PLACE_IDS.map((id) => {
      const d = PLACES[id];
      const rule = Object.entries(d.presence).map(([k, v]) => `${k}:${v}`).join(' ') || 'always';
      return `${id.padEnd(10)} ${d.name} | tags ${d.tags.join(',') || '-'} | ${rule} | band ${d.band.join('-')} | ${d.parts.length} parts, ${d.shapes.length} ground shapes`;
    }).join('\n'),
  'placefiles: every place file (levels/places/*.json): name, tags, presence rule, band, parts and ground shapes', g);

  command('placeland', async ([id, biome, seed]) => {
    const pid = idArg(id);
    if (!pid) return `error: placeland <${ids().join('|')}> [biome] [seed]`;
    // A biome that lists the place, unless one is given.
    const b = (biome ?? biomes.find((x) => BIOMES[x as BiomeId].places.includes(pid)) ?? 'desert') as BiomeId;
    if (!(b in BIOMES)) return `error: biome ${biome} (${biomes.join(', ')})`;
    const s = seed === undefined ? 1 : isNaN(Number(seed)) ? seed : Number(seed);
    const before = bridge().scene('Play')?.sim;
    forced.add(pid);
    try {
      bridge().goto('Play', { seed: s, biome: b });
      for (let i = 0; i < 80; i++) {
        await wait(100);
        const sim = bridge().scene('Play')?.sim;
        if (sim && sim !== before && sim.places?.length) break;
      }
    } finally {
      forced.delete(pid);
    }
    const sim = bridge().scene('Play')?.sim;
    if (!sim || sim === before) return 'error: the land did not start (is the title up? use ?scene=Play)';
    if (!sim.places.some((p: { id: string }) => p.id === pid)) return `error: this land has no ${pid} (no room for it)`;
    return `${BIOMES[b].name}, seed ${s}: ${await bridge().cmd(`place tp ${pid}`)}`;
  }, 'placeland <id> [biome] [seed]: start a land (a biome that lists the place, seed 1) with that place forced into it and stand beside it', { ...g, args: ids });
}

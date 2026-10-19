/**
 * The mission's dev commands, one file per group (`__game.cmd('help')` lists them). Add a group: a file here exporting a
 * `<group>Commands(play: Play)` that calls `command(name, run, help, { group })`, and one line in `registerDev`.
 * Registering a name in the same group again replaces it, so this runs again whenever the scene's world is rebuilt.
 */
import type { Play } from '../Play';
import { commandCommands } from './command';
import { companionsCommands } from './companions';
import { dungeonCommands } from './dungeon';
import { introCommands } from './intro';
import { junkCommands } from './junk';
import { leewayCommands } from './leeway';
import { missionCommands } from './mission';
import { onboardCommands } from './onboard';
import { placesCommands } from './places';
import { timeCommands } from './time';
import { tipsCommands } from './tips';
import { unitsCommands } from './units';
import { worldCommands } from './world';

export function registerDev(play: Play) {
  commandCommands(play);
  companionsCommands(play);
  dungeonCommands(play);
  introCommands(play);
  junkCommands(play);
  leewayCommands(play);
  missionCommands(play);
  onboardCommands(play);
  placesCommands(play);
  timeCommands(play);
  tipsCommands(play);
  unitsCommands(play);
  worldCommands(play);
}

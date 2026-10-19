/**
 * The D-hub's art, drawn in code (Canvas 2D) until Kamile's arrives: the deck (rooms, walls, pipes, floors), stations,
 * NPCs, wall lamps, the zeppelin seen from above and its shadow, and the panel pictures (the world map, the city view).
 * Same palette as the mission (`COL` in ../art.ts): brass, copper, soot iron, amber glass.
 * This file only re-exports; the painters are in `art/` (the header of each says what it owns and how to add to it).
 */
export { housed, HS, shownAt } from './art/draw';
export { makeSkyArt, paintDeck } from './art/deck';
export { makeHubArt, windowTex } from './art/hubprops';
export { makeNpcArt, npcImage } from './art/npcs';
export { makePortraits } from './art/portraits';
export { makeZeppelinArt, zeppelinShape } from './art/zeppelin';
export { drawCity, drawWorldMap } from './art/panelart';
export { bridgeTex, lotDeckTex, propTex } from './art/lots';
export { LANDMARK, stationTex } from './art/landmarks';

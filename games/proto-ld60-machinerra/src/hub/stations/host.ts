/**
 * What a station (`stations/<id>.ts`) may use of the hub scene. `Hub` implements it; a station never imports `Hub`.
 * A new need of a station is a member here and a public member on `Hub`.
 */
import type Phaser from 'phaser';
import type { SceneKit } from '../../../../../harness/kit';
import type { Inventory } from '../../inventory';
import type { BiomeId } from '../../sim/defs';
import type { Books } from '../economy';
import type { Land } from '../landings';
import type { HubHud } from '../panels';
import type { StationId } from '../layout';
import type { Feature } from '../story';
import type { HubState } from '../state';

/** Something the Communicator can use: a station or an NPC who is aboard. */
export interface Thing {
  kind: 'station' | 'npc';
  id: string;
  name: string;
  verb: string;
  x: number;
  y: number;
  reach: number;
}

export interface HubHost extends Phaser.Scene {
  readonly s: HubState;
  readonly hud: HubHud;
  readonly k: SceneKit;
  readonly inv: Inventory;
  readonly me: { x: number; y: number };
  /** The dev switch that puts every NPC aboard (`?t.allRescued=1`). */
  readonly allRescued: boolean;
  /** The tab open in each tabbed panel, by station or NPC id, kept while the hub runs. */
  readonly tabs: Record<string, string>;
  /** UI state a station keeps while the hub runs (a picked robot, a counter): made on first use, gone with the scene. */
  memo<T>(key: string, init: () => T): T;
  save(next: HubState): void;
  /** Show what the save says: who is aboard, the booths, the city, the stores. */
  refresh(): void;
  /** Keep what a paid rule returned (`economy.ts` `Books`). */
  pay(b: Books): void;
  /** What the main quest has opened (`story.ts`). */
  has(f: Feature): boolean;
  /** An NPC line in the speaker panel. */
  speak(id: string, text: string): void;
  /** Call after opening a panel that was not open before: the latch, the shake. */
  panelOpened(): void;
  closePanel(): void;
  openStation(id: StationId): void;
  /** A booth goes up on a lot: hammering, a shake, sparks. */
  raised(lot: string): void;
  /** Save a new arrangement of the stations and put the booths where it says. */
  moveStations(next: HubState): void;
  lands(): Land[];
  landing(): Land;
  pickLand(biome: BiomeId): void;
  launch(): number;
}

/** A fixed station's panel: opens it and returns true, or returns false when it refuses (no panel is open then). */
export type StationPanel = (host: HubHost) => boolean;

/**
 * What an NPC's station adds to their offer panel (`npc.ts` `openOffer`; registered by NPC id in `stations/index.ts`).
 * `tabs` come before the quests tab, `actions` are buttons in the panel's footer, `wire` hooks up the buttons; `again` redraws the panel.
 */
export interface OfferPanel {
  tabs?(host: HubHost): { id: string; label: string; html: string }[];
  actions?: string;
  wire?(host: HubHost, el: HTMLElement, again: () => void): void;
}

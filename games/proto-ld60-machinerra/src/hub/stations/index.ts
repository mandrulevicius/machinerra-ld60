/**
 * The station registry. **Add a fixed station** (the course table, the bench, the window): a `StationId` and its `STATIONS` row
 * (`layout.ts`), a file here that exports its `StationPanel`, and one line in `STATION_PANELS`. **Add to an NPC's station** (a
 * tab or button on their offer panel): a file here that exports an `OfferPanel` and one line in `OFFER_PANELS`, keyed by NPC id.
 * A station gets the hub through `HubHost` (`host.ts`), never `Hub`.
 */
import type { StationId } from '../layout';
import { clinicOffer } from './clinic';
import { commandPanel } from './command';
import { expeditionOffer } from './expedition';
import { forgeOffer } from './forge';
import type { OfferPanel, StationPanel } from './host';
import { plannerOffer } from './planner';
import { teacherOffer } from './recipes';
import { traderOffer } from './trader';
import { windowPanel } from './window';
import { workshopStation } from './workshop';

export const STATION_PANELS: Record<StationId, StationPanel> = {
  command: commandPanel,
  lift: (host) => (host.launch(), false),
  window: windowPanel,
  workshop: workshopStation,
};

export const OFFER_PANELS: Record<string, OfferPanel | undefined> = {
  cityPlanner: plannerOffer,
  expeditioner: expeditionOffer,
  gasket: clinicOffer,
  hob: forgeOffer,
  sprocket: teacherOffer('sprocket'),
  trader: traderOffer,
};

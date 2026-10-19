/**
 * The Dry dock aboard: its `DockHost` from the hub's (`HubHost`). The stores are the economy's scrap, copper and coal and the hub's
 * parts; the workshop's rules run on `{ eco, hub, roster }` and are kept as the workshop keeps them; the Trader's shelf is her stall's
 * (`stations/trader.ts`), there once her stall stands.
 */
import { owned } from '../sim/gear';
import { gear } from '../hub/carry';
import { economy } from '../hub/economy';
import { isTaught } from '../hub/taught';
import { roster } from '../hub/workshop';
import { buyWare, shelfLeft, stall } from '../hub/stations/trader';
import { discounted, shelf } from '../hub/trade';
import type { HubHost } from '../hub/stations/host';
import { DryDock } from './dockview';
import { sceneArt } from './sceneart';

export function hubDock(host: HubHost, root: HTMLElement, allRecipes: () => boolean) {
  const dock = new DryDock(root, {
    where: 'hub',
    inv: host.inv,
    art: sceneArt(host),
    stores: () => ({ scrap: economy.get().scrap, copper: economy.get().copper, coal: economy.get().coal, parts: host.s.parts }),
    sound: (k) => host.k.audio.sfx.play(k === 'craft' || k === 'ratchet' ? 'ratchet' : k === 'equip' ? 'latch' : 'near', { gain: k === 'deny' ? 0.3 : 0.6 }),
    taught: (id) => isTaught(host.s, id, allRecipes()),
    shop: () => ({ eco: economy.get(), hub: host.s, roster: roster.get() }),
    keep: (s) => {
      economy.set(s.eco);
      roster.set(s.roster);
      host.save(s.hub);
      host.hud.stores(host.s);
    },
    shelf: () => {
      if (!host.s.stations.trader && !host.allRescued) return [];
      const t = stall(host), l = shelfLeft(host);
      return shelf(t.missions, t.tier, t.back).flatMap((w, i) => (w.kind === 'item' ? [{ i, item: w.item, q: w.q, price: discounted(w.price, t.valued), left: l[i] }] : []));
    },
    buy: (i) => {
      const next = gear.get().next;
      buyWare(host, i);
      host.hud.stores(host.s);
      return owned(gear.get(), next)!;
    },
    workshop: () => {
      host.inv.hide();
      host.openStation('workshop');
    },
  });
  host.inv.attachDock(dock);
  return dock;
}

/**
 * The Dry dock from a station's panel, one press (the dock is `dock/`): a footer button that closes the panel and opens the dock where
 * that station works (`dock.ts` `openAt`: Hob's forge on the primary weapon, Gasket's clinic on the robots to mend).
 */
import type { HubHost } from './host';

export const DOCK_BUTTON = '<button class="ui-btn ui-btn--primary" data-a="dock">Dry dock</button>';

export function wireDock(host: HubHost, el: HTMLElement, from: 'forge' | 'clinic') {
  el.querySelector('[data-a="dock"]')?.addEventListener('click', () => {
    host.closePanel();
    host.inv.showDock(from);
  });
}

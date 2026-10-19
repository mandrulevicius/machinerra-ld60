/**
 * Tooltips in the mission (Minos, decisions.md "Minos on onboarding": hold Alt and hover a HUD element, a place, a foe or a status to
 * see its tooltip; in command mode hover alone shows it and Alt adds more). The management kit's `Tooltip` (`manage/tooltip.ts`), driven
 * by hand: each frame the pointer's place is tested against the HUD (`Hud.probe`: its elements take no pointer events) and then the
 * world (`tips.ts` `worldTip`), and the tip follows the pointer. Off while a panel, the map or the results hold the screen.
 * Dev `tip` (group `tips`, `dev/tips.ts`) pins a tip and holds Alt, for tests and screenshots.
 */
import { pointerAt } from './hud';
import { Tips, Tooltip, type Tip } from './manage/tooltip';
import { ViewBase, type PlayHost } from './playhost';
import { worldTip } from './tips';

export class TipView extends ViewBase {
  private el: HTMLDivElement;
  readonly tip: Tooltip;
  /** Dev: a tip held at a screen place (the pointer is ignored) until `tip pin off`. */
  pin: { tip: () => Tip | null; x: number; y: number } | null = null;

  constructor(host: PlayHost) {
    super(host);
    // `mg` gives the kit's font and box-sizing; `.mc-tips` (style.css) is the stage-sized, pointer-less host the tip is placed in.
    this.el = document.createElement('div');
    this.el.className = 'mg mc-tips';
    host.ui.append(this.el);
    // Outside command mode a tip needs Alt (and then shows everything); in command mode hover alone shows it and Alt adds the details.
    this.tip = new Tooltip(this.el, new Tips(), { dom: false, needAlt: () => !host.cmd.on });
  }

  late() {
    const h = this.host;
    const busy = h.ended || this.sim.phase !== 'mission' || h.map.open || h.inv.open || h.log.open || h.guide.open;
    if (this.pin) return this.tip.point(busy ? null : this.pin.tip(), this.pin.x, this.pin.y);
    const at = pointerAt();
    if (busy || at.x < 0) return this.tip.point(null, 0, 0);
    // Not worth the search while neither Alt nor command mode could show it.
    if (!h.cmd.on && !this.tip.alt) return this.tip.point(null, at.x, at.y);
    let t = this.hud.probe();
    if (!t) {
      const p = this.scene.input.activePointer, w = this.scene.cameras.main.getWorldPoint(p.x, p.y);
      t = worldTip(this.sim, w.x, w.y);
    }
    this.tip.point(t, at.x, at.y);
  }

  debug() {
    return { tip: this.tip.state() };
  }

  destroy() {
    this.tip.destroy();
    this.el.remove();
  }
}

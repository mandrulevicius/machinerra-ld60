/**
 * The pictures a management screen shows, as URLs: in a scene from its textures (`dock/sceneart.ts`), on a page with no scene from the
 * code-drawn makers and the painted files (`pageart.ts`).
 */
import type { PartKind } from '../sim/defs';
import type { CrewRole, ItemId } from '../sim/gear';

export interface Art {
  item(id: ItemId): string;
  crew(role: CrewRole): string;
  hero(): string;
  portrait(): string;
  relic(id: string): string;
  part(k: PartKind): string;
  scrap(): string;
  copper(): string;
}

/**
 * The companions aboard (P42): the dog by the lift's hatch and the stray cat, Rumba, by the course table with her bowl; with the
 * Replicator the cats multiply (one asleep on the course table: `quests.md` cat.3). Drawing only: they are not stations and cannot be
 * talked to (nothing was asked for), they show their name when he stands near. The pictures are the mission's (`placeartq.ts`).
 * `show` follows the save (`Hub.refresh`), `update` the Communicator (`Hub.update`).
 * Add a companion: its spot in `PETS` and its picture in `makeCompanionArt`.
 */
import Phaser from 'phaser';
import { S } from '../art';
import { makeCompanionArt } from '../placeartq';
import type { DeckShadows } from '../shadowview';
import { CAT } from '../sim/defs';
import { hasBuilding } from './buildings';
import { hasCat, hasDog } from './companions';
import { ARRIVE, TABLE } from './layout';
import type { HubState } from './state';

type Img = Phaser.GameObjects.Image;

/** Where they live (guesses; the lift's right-hand side, the table's front-left), and how near he must be for the name. */
export const PETS = {
  dog: { x: ARRIVE.x + 112, y: ARRIVE.y - 36 },
  cat: { x: TABLE.x - 92, y: TABLE.y + 66 },
  bowl: { x: TABLE.x - 60, y: TABLE.y + 70 },
  /** The Replicator's cats: three more on the deck and one asleep on the course table. */
  more: [{ x: TABLE.x + 96, y: TABLE.y + 70 }, { x: TABLE.x - 38, y: TABLE.y + 108 }, { x: TABLE.x + 64, y: TABLE.y + 112 }],
  asleep: { x: TABLE.x + 28, y: TABLE.y + 6 },
  near: 120,
};

export class HubCompanions {
  private dog!: Img;
  private cat!: Img;
  private bowl!: Img;
  private more: Img[] = [];
  private asleep!: Img;
  private label: Phaser.GameObjects.Text;
  private dogName = 'The dog';

  constructor(private scene: Phaser.Scene, shade: DeckShadows) {
    makeCompanionArt(scene);
    const put = (key: string, p: { x: number; y: number }, oy = 0.9, shaded = true) => {
      const img = scene.add.image(p.x, p.y, key).setScale(1 / S).setOrigin(0.5, oy).setDepth(p.y).setVisible(false);
      if (shaded) shade.add(img); // the bowl is a prop: none
      return img;
    };
    this.dog = put('dog-stand', PETS.dog, 0.88).setFlipX(true);
    this.cat = put('cat-sit', PETS.cat);
    this.bowl = put('dog-bowl', PETS.bowl, 0.7, false);
    this.more = PETS.more.map((p, i) => put('cat-sit', p).setFlipX(i % 2 === 1));
    this.asleep = put('cat-sleep', PETS.asleep).setDepth(TABLE.y + 60); // on the glass: over the table's picture
    this.label = scene.add.text(0, 0, '', { fontSize: '11px', color: '#fff4d8', backgroundColor: 'rgba(20,16,12,0.75)', padding: { x: 4, y: 2 } }).setDepth(1e6).setOrigin(0.5, 1).setVisible(false);
  }

  /** Who is aboard now, from the save: the dog (by its name), the cat and her bowl, and the Replicator's cats. */
  show(s: HubState, dogName = 'The dog') {
    this.dogName = dogName;
    const dog = hasDog(s), cat = hasCat(s), many = cat && hasBuilding(s, 'replicator');
    this.dog.setVisible(dog);
    this.cat.setVisible(cat);
    this.bowl.setVisible(cat);
    for (const m of this.more) m.setVisible(many);
    this.asleep.setVisible(many);
  }

  /** Rumba elsewhere for now (P58: on the Princess's rounds, `null` hides her spot; in the empty dock while the Princess is gone), or home again with `undefined`. */
  catAway(at: { x: number; y: number } | null | undefined, cat: boolean) {
    const p = at ?? PETS.cat;
    this.cat.setVisible(cat && at !== null).setPosition(p.x, p.y).setDepth(p.y);
  }

  /** Their names, when he stands close to one. */
  update(me: { x: number; y: number }) {
    const close = (img: Img) => img.visible && Math.hypot(img.x - me.x, img.y - me.y) < PETS.near;
    const at = close(this.dog) ? { img: this.dog, name: this.dogName.replace(/^The /, 'the ') } : close(this.cat) ? { img: this.cat, name: CAT.name } : null;
    this.label.setVisible(!!at);
    if (!at) return;
    this.label.setText(at.name[0].toUpperCase() + at.name.slice(1)).setPosition(at.img.x, at.img.y - at.img.displayHeight - 4);
  }
}

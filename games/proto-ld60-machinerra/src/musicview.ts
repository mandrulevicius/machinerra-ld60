/**
 * The mission's music. The land's song plays on, untouched; only its colour follows the screen (sound.ts, `TONE`): muffled
 * while it is calm, opened up (eased) the moment a hornet is anywhere on screen, closed again slowly once the screen has
 * stayed clear for a few seconds, softer still at a resting place (the graveyard). Low oil sags its pitch: the one time the
 * music is detuned. A boss near the screen crossfades to the boss battle, and back to the land's song once none has been
 * near for `BOSS_TRACK.clear` seconds (down or gone). It also hands the kit's sound the Communicator as the listener.
 * Down a dungeon it also turns on the kit's room (`DUNGEON_ROOM`, an echo on every sound), and off again when the scene ends.
 * Add a colour: a `TONE` row and the condition in `late`.
 */
import Phaser from 'phaser';
import { ViewBase, type PlayHost } from './playhost';
import { GRAVEYARD } from './sim/defs';
import { BIOME_MUSIC, BOSS_MUSIC, BOSS_TRACK, DUNGEON_ROOM, TONE, playMusic, preloadMusic } from './sound';

export class MusicView extends ViewBase {
  /** The music is in its fight colour; seconds the screen has been clear of hornets. */
  fight = false;
  private resting = false;
  private clearT = 0;
  /** The boss battle is playing; seconds since a boss was last within `BOSS_TRACK.near` of the screen. */
  private bossMusic = false;
  private bossT = 0;

  constructor(host: PlayHost) {
    super(host);
    // The kit plays positional sounds from where the Communicator stands; the land's song starts as soon as it has
    // loaded, and the boss battle loads now so a boss is met with it at once.
    const audio = host.k.audio;
    audio.listener = () => this.sim.controller;
    playMusic(audio, BIOME_MUSIC[host.sim.biomeId], { fade: 3 });
    preloadMusic(audio, BOSS_MUSIC);
    audio.music.tone({ ...TONE.calm, detune: 0, fade: 0.5 });
    // Down a dungeon every sound echoes (`DUNGEON_ROOM`); the room eases out when the scene ends (climbing out).
    if (host.sim.run) audio.room(DUNGEON_ROOM, DUNGEON_ROOM.in);
    host.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (host.sim.run) audio.room(null, DUNGEON_ROOM.out);
      audio.listener = null;
      audio.sfx.quietBeds();
    });
  }

  late(dt: number) {
    const sim = this.sim;
    const m = this.k.audio.music;
    if (!this.host.t.music) return;
    const view = this.scene.cameras.main.worldView;
    const n = BOSS_TRACK.near;
    const boss = sim.hornets.some((h) => h.boss && !h.dead && h.x > view.x - n && h.x < view.right + n && h.y > view.y - n && h.y < view.bottom + n);
    this.bossT = boss ? 0 : this.bossT + dt;
    const bossMusic = boss || (this.bossMusic && this.bossT < BOSS_TRACK.clear);
    if (bossMusic !== this.bossMusic) {
      this.bossMusic = bossMusic;
      playMusic(this.k.audio, bossMusic ? BOSS_MUSIC : BIOME_MUSIC[sim.biomeId], { fade: bossMusic ? BOSS_TRACK.in : BOSS_TRACK.out });
    }
    const onScreen = sim.hornets.some((h) => view.contains(h.x, h.y - 18));
    this.clearT = onScreen ? 0 : this.clearT + dt;
    const fight = onScreen || (this.fight && this.clearT < TONE.clear);
    // A resting place (the graveyard) softens the calm further; a fight still opens the music up.
    const c = sim.controller;
    const rest = !fight && sim.inPlace('graveyard', c.x, c.y, GRAVEYARD.rest);
    if (fight !== this.fight || rest !== this.resting) {
      this.fight = fight;
      this.resting = rest;
      m.tone({ ...(fight ? TONE.fight : rest ? TONE.rest : TONE.calm), fade: fight ? TONE.open : TONE.close });
    }
    const oil = c.hp / c.maxHp;
    const sag = oil < TONE.lowOil ? Math.round(TONE.sag * (1 - oil / TONE.lowOil)) : 0;
    m.tone({ detune: Math.round(sag / 5) * 5, fade: 1.5 });
  }

  debug() {
    return { music: this.k.audio.music.state(), fight: this.fight };
  }
}

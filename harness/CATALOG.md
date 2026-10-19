# Optional modules

Built and working, but only for games that call for them.
The lead picks from here when a game's design needs one and names it in a worker's brief; workers use what their brief names.
Don't add a feature to a game because it exists, and don't limit a design to what is listed here.

| Module | What it does | Use when |
|---|---|---|
| `harness/kit/world` marks, footprints, remains | Baked smudges, scorch and stains, dirty-feet footprints, corpses that decay into smudges | The world should keep lasting marks of events (`docs/design/mechanics.md`) |
| `harness/kit/world` shadows | Soft blob shadows following the `shadows` quality toggle | Objects stand on a ground plane and need grounding |
| `harness/kit/collision.ts` | Collision outlines traced from sprite images, simplified to a vertex budget | Matter physics or precise hitboxes from art |
| `harness/kit/shader.ts` | Scaffold for custom filters and shader objects | Effects the presets don't cover |
| Variant slots and dev sidebar | A/B themes, particles, lights, juice, look, music while playing | Exploration and choosing a look; ship with the chosen config |
| `harness/capture/` | Screenshots, video, GIF, trailer assembly | Page material near release |
| `docs/techniques.md` | Proven techniques (procedural animation, steering, verlet, ...) | Designing a mechanic or system |
| `games/lab/`, `docs/findings/` | Measured limits and Phaser 4 gotchas by topic | Briefing a specialist; before using an engine feature |

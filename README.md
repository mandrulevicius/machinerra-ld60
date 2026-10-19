# Machinerra

Source of Machinerra, our Ludum Dare 60 jam entry (theme: Old Tech).
You are the Communicator, a bipedal robot lowered from the Zeppelin Wanderer onto procedural lands.
You command crews of steam robots, break modern machines for scrap, strip ruins for copper, and ride the free lift home whenever you like; staying pays and the clock runs past midnight.
Health is oil, shots spend steam; then the D-hub: stations, NPCs, the growing D-city.

## Team

- Minos: tooling, design, code
- Laimonas: music, sound, design, code
- Kamile: art
- Vakaris: consulting
- Claude (Anthropic): code

## Run

Needs Node.js 20.19 or newer (or 22.12+).

```
npm install
npm run dev
```

Then open http://localhost:5173/games/proto-ld60-machinerra/ (Vite prints the port if 5173 is taken).

Build the web version (`games/proto-ld60-machinerra/dist/` and an itch.io-ready zip):

```
npm run build -- proto-ld60-machinerra
```

`npm test` runs the unit tests and `npm run typecheck` checks the types.

## Layout

- `games/proto-ld60-machinerra/`: the game (`src/sim/` is the rules, `src/hub/` the D-hub, `art/` and `public/` its art and audio).
- `harness/`: the shared engine layer (Phaser 4 kit, dev tools, UI) the game is built on.

This is a snapshot exported from a private monorepo; the painting sources (`art-src/`) are not included.

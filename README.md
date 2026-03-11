# witness

a browser-based game where you explore a minimal procedural world under an astronomically accurate night sky.

the core loop: enter a time and place — "july 1054, kaifeng, china" — get teleported there, and witness what the sky looked like. supernovae, eclipses, comets, conjunctions, the slow precession of the equinoxes. the sky is real. the math is real. you're a time-traveling astronomer.

## what it feels like

you stand on a dark hillside scattered with pine trees. the milky way arcs overhead. you can pick out orion, trace the handle of the big dipper, watch jupiter creep along the ecliptic. fast-forward time and the sky wheels around polaris. rewind a thousand years and the pole star drifts. teleport to the southern hemisphere and you see constellations you've never seen before.

the world is minimal — low-poly terrain, geometric trees, still water reflecting smeared starlight. the sky is the protagonist. everything else is a stage for it.

## core philosophy

**accuracy as wonder** the night sky is computed from real astronomical data and models — 100,000+ stars, five naked-eye planets, sun and moon driving a real day/night cycle. 

**exploration as play** achievements reward witnessing astronomical events — some easy (watch a full moon rise), some requiring historical research (find tycho's supernova from hven island, november 1572), some demanding rare combinations. 

## stack

three.js, vite. all browser-based, no backend. star catalog and event data ship as static JSON. target: ~20 small source files across `sky/`, `world/`, `player/`, `time/`, and `ui/` directories.

## quick start

```bash
npm install
npm run dev
```

then open the local vite URL in your browser.

basic controls:

- `WASD` move
- `Space` jump
- right-click + drag look around
- use the bottom-right strip to pause, scrub by week / month / year, and change simulation speed
- click the bottom-left pin to enter a latitude, longitude, and date
- press `` ` `` to open debug tuning
- press `C` to toggle constellation lines
- press `H` or `9` to toggle the HUD
- press `O` to cycle spawn-mode override for testing (`auto`, `ocean`, `land`)

## status

early development. building the MVP: accurate sky rendering + time/location input + procedural terrain.

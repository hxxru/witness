# witness

a browser-based game where you explore a minimal procedural world under an astronomically accurate night sky.

the core loop: enter a time and place — "july 1054, kaifeng, china" — get teleported there, and witness what the sky looked like. supernovae, eclipses, comets, conjunctions, the slow precession of the equinoxes. the sky is real. the math is real. you're a time-traveling astronomer.

## what it feels like

you stand on a dark hillside scattered with pine trees. the milky way arcs overhead. you can pick out orion, trace the handle of the big dipper, watch jupiter creep along the ecliptic. fast-forward time and the sky wheels around polaris. rewind a thousand years and the pole star drifts. teleport to the southern hemisphere and you see constellations you've never seen before.

the world is minimal — low-poly terrain, geometric trees, still water reflecting smeared starlight. the sky is the protagonist. everything else is a stage for it.

## the value prop

**accuracy as wonder.** the night sky is computed from real astronomical data and models — ~500 brightest stars from the yale bright star catalogue, five naked-eye planets via VSOP87 analytical theory, sun and moon driving a real day/night cycle. this isn't a skybox. it's a planetarium you can walk around in, set to any date within ±4000 years, at any point on earth.

**exploration as play.** achievements reward witnessing astronomical events — some easy (watch a full moon rise), some requiring historical research (find tycho's supernova from hven island, november 1572), some demanding rare combinations. the game teaches astronomy by making you *use* it.

## stack

three.js, vite, simplex-noise. all browser-based, no backend. star catalog and event data ship as static JSON. target: ~20 small source files across `sky/`, `world/`, `player/`, `time/`, and `ui/` directories.

## status

early development. building the MVP: accurate sky rendering + time/location input + procedural terrain.

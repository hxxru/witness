# aesthetics guide

## core principle

**the sky is the protagonist.** every visual choice exists to maximize the sky's presence and beauty. the world is a stage — it should ground the player and provide atmosphere, but never compete with what's overhead.

## visual references

- **proteus** (ed key & david kanaga): minimal impressionistic terrain, color and sound doing all the work. the closest existing game to witness's world feel.
- **firewatch**: palette discipline across time-of-day shifts. warm, cohesive color transitions.
- **outer wilds**: warm, hand-drawn UI sensibility. instruments and interfaces that feel integrated into the world.

## color philosophy

the world lives in a narrow, muted palette. the sky gets the full color budget.

**daytime terrain:** dusty greens, warm tans, soft greys. low saturation. think "overcast meadow," not "minecraft plains."

**nighttime terrain:** near-monochrome blue-black. terrain detail fades — trees become pure silhouettes, hills become dark shapes against the sky. the eye should have nowhere to go but up.

**sky colors:**
- day: soft blue gradient, brighter at zenith, paler near horizon
- civil twilight (sun 0° to −6°): warm orange/coral band at horizon, fading to blue overhead
- nautical twilight (−6° to −12°): deep indigo, last orange glow at horizon
- astronomical twilight (−12° to −18°): transition to full night
- night: near-black with subtle deep blue. stars provide all the light.

**UI:** warm gold (#D4A857) or soft cream (#F5E6C8) text on translucent dark backgrounds (rgba(0,0,0,0.5)). thin, unobtrusive. the UI should feel like an instrument panel — functional, legible, recessive.

**star colors:** derived from B-V color index. the range runs from blue-white (hot O/B stars like sirius) through white (A stars like vega) through yellow (G stars like the sun) to orange-red (K/M stars like betelgeuse). preserve this range — it's one of the few real color accents in the night scene.

## terrain style

low-poly with flat shading (per-face normals, no smooth interpolation). no textures — color comes from face tinting based on height, slope, and ambient light.

**hills:** gentle, rolling. low-frequency simplex noise. think scottish highlands or montana grasslands, not alps. amplitude ~30m, wavelength ~500m.

**trees:** pines only (for MVP). cone canopy + thin cylinder trunk. simple, geometric, immediately readable as "tree" in silhouette. sparse placement — clusters of 3-8 trees with generous clearings between. the player should always be ≤30 seconds walk from unobstructed sky.

**water:** flat plane with gentle vertex-displaced ripple. dark at night with faint reflected sky color (no mirror-sharp reflections — smeared, impressionistic). during day, slightly desaturated blue-grey.

**boat (ocean spawn):** a simple flat platform with low raised edges. warm wood tone during day, dark silhouette at night. bobs gently with the wave displacement. minimal — it's a viewing platform, not a ship.

## atmosphere

**horizon haze:** a thin fog/gradient layer at the terrain-sky boundary. this sells depth and hides the terrain render distance. slightly warm-tinted during golden hour, cool blue at night.

**fog:** extends to ~2km, hiding terrain edges. density tuned so that distant hills are visible but faded, creating depth layers.

## typography

**UI / data elements (coordinates, dates, time):** monospace font. candidates: Space Mono, IBM Plex Mono, JetBrains Mono. monospace keeps numbers aligned and gives a "scientific instrument" feel.

**narrative text (achievement descriptions, hints, when added later):** serif font. candidates: Spectral, Lora, Source Serif Pro. the serif gives a "historical document" feel, contrasting with the technical mono.

use lowercase for UI labels where possible — matches the understated aesthetic.

## time-of-day progression

the game should feel noticeably different at each phase:

**midday:** bright, washed out, least interesting. terrain visible in full color. sky is plain blue. this is the "boring" state that motivates the player to fast-forward to night.

**golden hour / sunset:** the most conventionally beautiful terrain state. warm light, long shadows (if we add them later). sky does the orange-to-blue gradient.

**twilight:** the transition. stars begin to appear. terrain goes dusky. the "something is about to happen" feeling.

**deep night:** the payoff. terrain is dark silhouettes. sky is alive with stars. this is what the game is *for*.

**dawn:** reverse of dusk. stars fade. sky lightens in the east. a signal that time is passing.

## in-game clock speed defaults

- 1× (real-time): default. immersive. stars move perceptibly over minutes.
- 60× (1 real second = 1 game minute): for watching a night pass. sunrise/sunset in ~15 seconds.
- 360× (1 real second = 6 game minutes): for scanning across days.
- 3600× (1 real second = 1 game hour): for scanning across weeks/months. constellations shift seasonally.

## sound direction (post-MVP)

not in MVP, but the aesthetic target: generative ambient soundscape. layered loops with volume driven by sun altitude, season, latitude. crickets at twilight, silence at deep night, birdsong at dawn. eno-esque generative layers, not looped tracks. the silence during a total eclipse should be *deafening*.

## the feeling

alone. reverent. curious. the same feeling as standing in a dark field far from city lights, looking up, and suddenly understanding that the sky is deep. witness should make people feel small in the good way.

# devlog — implementation plan

## MVP definition

the minimum viable product is a browser app where you can:
1. see the brightest ~2000 stars at correct positions for any date/location within ±4000 years
2. see the five naked-eye planets at correct positions
3. see the sun and moon at correct positions, driving a real day/night cycle
4. type in a latitude, longitude, and date, and the sky updates
5. control time: play, pause, fast-forward at multiple speeds
6. walk around a procedural low-poly terrain with hills, sparse pine trees, and water
7. toggle constellation lines

no achievements, no progression, no historical events, no multiplayer, no audio. just the sky, the world, and the time machine.

## current state

implemented now:
- brightest ~2000 HYG stars with color, magnitude scaling, bloom, sidereal rotation, and precession
- processed Stellarium constellation lines with missing-HIP handling
- live JD-based clock with pause, reverse, speed presets, and HUD
- planets, sun, and moon via `astronomy-engine`
- atmosphere/day-night gradient, star fading, terrain lighting hook
- procedural terrain and sparse instanced pine trees with a reduced guaranteed clearing
- temporary drag-look inspection camera (not final first-person controls)

still missing for MVP:
- performance check on mid-range hardware

## delivered MVP

what shipped by the end of the MVP:

### astronomy and sky simulation

- a live celestial sphere driven by julian date, GMST, and local sidereal time
- support for dates spanning deep past and future, including astronomical year numbering for BCE dates in the location/date input
- star positions derived from catalog RA/Dec with precession applied before equatorial→horizontal conversion
- star rendering with:
  - B-V based color mapping
  - magnitude-based apparent size scaling
  - bloom for the brightest stars
  - limiting-magnitude control
  - atmospheric attenuation by both sun altitude and object altitude
- the five naked-eye planets via `astronomy-engine`, rendered as distinct sprites with labels
- sun and moon via `astronomy-engine`, including:
  - topocentric moon placement
  - moon phase texture shading
  - stronger nighttime moon bloom / halo
  - separate moonlight contribution to ambient world lighting
- a Milky Way band using a J2000 equatorial panorama texture, aligned to the same celestial transform as the stars and faded near the horizon
- processed Stellarium western constellation line data, cross-matched against the runtime star catalog and tolerant of missing HIP endpoints
- hover labels for a screen-space labelable subset of bright named stars, plus planets, sun, and moon

### atmospheric rendering and visibility model

- a sky dome shader with day, twilight, and night gradients
- sunrise and sunset color progression driven by sun altitude
- a unified sky attenuation model that now handles:
  - twilight/daytime fade for stars, Milky Way, planets, moon, and constellation lines
  - horizon fade and below-horizon suppression
  - airmass-based atmospheric extinction
  - warm horizon reddening
- nighttime ambient sky glow from stars
- additional moon-driven ambient lift based on lunar altitude and phase
- horizon haze and world fog that adapt to land vs ocean spawn contexts

### world generation and spawn modes

- procedural low-poly terrain built from simplex-noise displacement
- terrain coloring by height and slope, modulated by ambient lighting
- sparse instanced pine trees with clearings preserved for sky visibility
- water as a shader-driven reflective plane with gentle ripple displacement
- a rasterized natural-earth land/ocean mask used at runtime to determine spawn mode from latitude/longitude
- two spawn environments:
  - land: terrain, trees, inland water, ground-based walking
  - ocean: open-water plane with a small wooden boat platform, bobbing motion, and no terrain generation

### player movement and camera

- first-person movement with WASD, jump, gravity, damping, and look sensitivity tuning
- right-click drag camera look instead of pointer lock, so the cursor remains free for UI interaction
- land movement that sticks the player to terrain height
- ocean movement constrained to the bounds of the boat platform
- boat bob/roll motion inherited by the camera while on ocean spawns
- pitch-limited camera movement tuned for sky viewing without flipping

### input, controls, and UI

- HUD showing date, time, location, sidereal data, FPS, spawn mode, and body debug info
- bottom-right time controls for:
  - play / pause
  - fixed jumps by week, month, and year
  - continuous speed adjustment by slider
- bottom-left location/date panel with:
  - latitude input
  - longitude input
  - gregorian / astronomical-year date input
  - skyculture selector
  - instant teleport + world rebuild on submit
- top-center compass strip with cardinal directions and live heading readout
- debug tuning panel with live sliders for stars, bloom, planets, sun/moon, atmosphere, Milky Way, fog, trees, water, player movement, labels, and sky attenuation
- keyboard toggles for HUD, debug panel, constellation lines, polaris marker, and spawn-mode override

### rendering and interaction details

- post-processing bloom integrated with the night-sky rendering
- permanent labels for planets, sun, and moon
- hover labels filtered so hidden/daytime stars do not produce false name popups
- constellation hover labels when constellation lines are enabled, including highlighted hovered figures
- live skyculture switching for constellation overlays, including native-name-over-English hover labels for non-western cultures
- star-count feedback tied to the limiting-magnitude slider
- ocean water with moon reflection and darker nighttime ocean treatment
- world rebuild flow that updates terrain seed, spawn mode, observer location, and celestial state together when place/date changes

future TODO:
- if a dedicated settings panel is added later, consider moving the skyculture selector out of the location/date panel and into settings

### development and data pipeline delivered as part of MVP

- preprocessing for the runtime star catalog
- preprocessing for constellation data extraction
- preprocessing for the natural-earth land mask
- runtime loading for catalog / mask assets from `public/data`
- milestone-driven architecture split across `src/sky`, `src/world`, `src/player`, `src/ui`, and `src/time`

---

## build order — milestones

each milestone is independently testable. verify before moving to the next.

### milestone 1: project scaffold
- [x] init vite + three.js project
- [x] basic scene: camera, renderer, temporary free-look inspection controls
- [x] render a black background with a single white test sphere
- [x] confirm hot reload works, no console errors
- **done when:** blank 3D scene renders in browser

### milestone 2: star field (static, J2000)
- [x] obtain star catalog data and filter to a bright runtime subset
- [x] place `public/data/bsc5.json` with fields: `ra`, `dec`, `vmag`, `bv`, `hip` (hipparcos ID)
- [x] implement `src/sky/coordinates.js`: `equatorialToHorizontal(ra, dec, lst, lat)` → `{alt, az}`
- [x] implement `horizontalToCartesian(alt, az, radius)` → `{x, y, z}`
- [x] hardcode observer: lat 45°N, lon 0°, date J2000 (2000-01-01T12:00:00 TT)
- [x] compute GMST for J2000, derive LST for lon 0°
- [x] render stars as `THREE.InstancedMesh` (small quads/circles) on a celestial sphere (radius 1000)
- [x] all stars white, uniform size for now
- **done when:** you can visually identify orion, big dipper, southern cross (rotate camera to check). compare ≥5 bright star positions against stellarium — should match within ~1°.

### milestone 3: star colors and sizes
- [x] implement B-V → RGB color mapping (ballesteros 2012 formula or lookup table)
- [x] implement magnitude → apparent size: `size = base * pow(2.512, (6.5 - vmag) * scale)`
- [x] tune size scaling by eye — bright stars should pop, faint stars should be subtle
- [x] add bloom post-processing (`UnrealBloomPass`) with low threshold for brightest stars
- [x] star sprite: gaussian-falloff circle texture, tinted by B-V color
- **done when:** sirius is bright blue-white, betelgeuse is dimmer orange-red, faint stars are small dim points. the sky looks beautiful at a glance.

### milestone 4: constellation lines
- [x] obtain stellarium western sky-culture data (`western/index.json`)
- [x] parse stellarium's constellation JSON and extract constellation polylines
- [x] preprocess the polylines into `public/data/constellations.json` as `{name, abbr, lines: [[hip1, hip2], ...]}`
- [x] extract `common_names` into `public/data/star-names.json` for label lookups
- [x] cross-match HIP IDs to the filtered BSC catalog at runtime
- [x] skip segments whose endpoints are missing from the filtered catalog, and log incomplete constellations instead of failing
- [x] render as thin `THREE.LineSegments` connecting star positions
- [x] toggle visibility with a key (e.g., `C`)
- **done when:** pressing C shows constellation lines overlaid on correct stars. orion's belt, big dipper handle, etc. are visually correct.

### milestone 5: game clock + sidereal time
- [x] implement `src/time/clock.js`: maintains a julian date (JD), ticks forward each frame
- [x] implement gregorian ↔ julian date conversion (meeus ch. 7), handle julian/gregorian calendar transition (oct 1582)
- [x] compute GMST from JD (standard polynomial formula)
- [x] time controls: play/pause, speed multipliers (1×, 60×, 360×, 3600×)
- [x] star positions now update from live clock + observer location
- **done when:** pressing fast-forward makes stars rotate around the celestial pole at correct rate. pausing freezes the sky. reversing time works.

### milestone 6: precession
- [x] implement IAU precession (lieske 1979): three euler angles as polynomials in julian centuries from J2000
- [x] apply precession rotation to star RA/Dec before the equatorial→horizontal transform
- [x] cache precessed star positions; recompute only on time jumps or every ~game-minute
- **done when:** set date to 3000 BCE. polaris is no longer near the north celestial pole — thuban (alpha draconis) should be close instead. compare against stellarium.

### milestone 7: planets (astronomy-engine)
- [x] implement planet positions using `astronomy-engine` (`Equator` / `GeoVector`) for mercury, venus, mars, jupiter, saturn
- [x] pipeline: astronomy-engine equatorial coordinates → `coordinates.js` equatorial→horizontal → horizontal→cartesian
- [x] render planets as slightly larger, non-twinkling sprites with approximate colors
- [x] label planets distinctly from stars
- **done when:** planet positions match stellarium within ~1° for several test dates spanning ±2000 years. venus and jupiter are brightest, mercury is near the sun.

### milestone 8: sun and moon (astronomy-engine)
- [x] sun and moon positions from `astronomy-engine` (`Equator('Sun', ...)`, `Equator('Moon', ...)`)
- [x] render sun as a bright disc, moon as a disc with phase shading (illuminated fraction from sun-moon elongation)
- [x] sun/moon positions feed into atmosphere shader (next milestone)
- **done when:** sun rises in the east, sets in the west. moon phase matches the date. full moon is opposite the sun.

### milestone 9: atmosphere and day/night cycle
- [x] implement sky gradient shader on a large sphere or skybox
- [x] sky color driven by sun altitude: day (blue), twilight (orange→deep blue), night (near-black)
- [x] star visibility fades: invisible when sun alt > −6°, fully visible when sun alt < −18°, linear blend between
- [x] terrain ambient lighting modulated by sun/moon altitude
- [x] horizon haze: thin fog layer at the horizon for atmosphere
- **done when:** watching a sunrise in fast-forward shows correct twilight color progression. stars fade in at dusk, fade out at dawn. night sky is dark, day sky is blue.

### milestone 10: procedural terrain
- [x] implement `src/world/terrain.js`: simplex noise heightmap (2-3 octaves, low frequency for rolling hills)
- [x] `THREE.PlaneGeometry` ~256×256, vertex displacement, flat-shaded face normals
- [x] terrain extends ~2km radius; fog hides edges
- [x] color by height/slope: muted greens (flats), browns (slopes), greys (high). modulate by ambient light.
- **done when:** you see undulating hills under the night sky, extending to a foggy horizon.

### milestone 11: trees
- [x] pine = cone + thin cylinder, instanced (`THREE.InstancedMesh`)
- [x] placement via noise-based density function — sparse clusters with guaranteed clearings
- [x] constraint: always ≤30 seconds walk to a full-sky clearing
- [x] at night: trees render as dark silhouettes (no detail lighting)
- **done when:** sparse pine trees dot the hills. you can walk to a clearing and see horizon-to-horizon sky. tree silhouettes frame the stars.

### milestone 12: water
- [x] flat plane at fixed y-level (y = 0, terrain above)
- [x] vertex shader: gentle sine-wave ripple displacement
- [x] fragment shader: sample sky color in reflected direction (cheap fake reflection), darken
- [x] boat spawn: when land-mask says ocean, spawn on a small flat platform at water level with gentle bob
- **done when:** lakes/seas appear in terrain low points. at night, smeared star reflections visible in water. ocean spawning places you on a simple boat.

### milestone 13: land/ocean mask
- [x] obtain natural earth 1:110m land polygon, rasterize to 1024×512 equirectangular PNG
- [x] place in `public/data/land-mask.png`
- [x] `src/world/land-mask.js`: load texture, sample at (lat, lon) → land or ocean
- [x] spawn logic: land → spawn on terrain. ocean → spawn on boat.
- **done when:** entering coordinates in the pacific spawns you on a boat. entering paris spawns you on land.

### milestone 14: first-person controls
- [x] replace orbit controls with first-person camera + WASD movement
- [x] basic ground collision: camera stays at fixed height above terrain
- [x] smooth movement, mouse look with capped pitch
- **done when:** you can walk around the terrain in first person, look up at the sky, walk over hills.

### milestone 15: location/date input UI
- [x] implement `src/ui/input-panel.js`: text fields for latitude, longitude, date (gregorian)
- [x] "go" button teleports: regenerates terrain seed from coordinates, updates sky
- [x] display current date/time/location on HUD
- [x] time control buttons: play, pause, 1×/60×/360×/3600× speed
- **done when:** you can type coordinates and a date, press go, and the sky + terrain update. time controls work.

### milestone 16: star/planet labels
- [x] hover or click on a star/planet to see its name
- [x] use screen-space projection against a labelable subset instead of raycasting the instanced star mesh
- [x] label appears as HTML overlay or Three.js sprite near the object
- **done when:** hovering over sirius shows "Sirius", hovering over jupiter shows "Jupiter".

### milestone 17: polish pass
- [x] tune star sizes, bloom intensity, sky colors
- [x] tune terrain amplitude, tree density, water reflectivity
- [x] tune fog distance, horizon haze
- [x] add milky way as a static textured band (equirectangular image mapped to the celestial sphere)
- [ ] performance check: confirm 60fps on mid-range hardware with all systems active
- **done when:** the game looks and feels good. screenshot-worthy night sky over pine-dotted hills.

---

## out of scope for MVP

- achievements / progression / story mode
- eclipse computation
- historical events (supernovae, comets)
- ambient life / procedural audio
- terrain biome variation by latitude/season
- multiplayer
- mobile support
- narrative text beyond labels

---

## dependencies

- three.js (rendering)
- simplex-noise (terrain generation)
- astronomy-engine (accepted runtime dependency for planets, sun, and moon)
- vite (build tool)
- no other runtime dependencies without explicit discussion

coordinate transforms are implemented from scratch per `docs/astronomy.md`. astronomy-engine is the accepted MVP ephemeris source for planets, sun, and moon.

---

## verification strategy

at each milestone, compare against stellarium:
- pick 5-10 bright stars, note their alt/az in stellarium for a given date/location
- check our computed positions match within ~1°
- do this for at least 3 different dates (J2000, ~1000 CE, ~3000 BCE) and 2 locations (mid-northern latitude, equatorial)

---

## post-MVP improvements

- implement ΔT lookup for proper time scale handling (UT1/TT/TDB distinction)
- implement stellar proper motion (HYG catalog includes proper motion data; constellation shapes change noticeably over millennia)
- consider replacing astronomy-engine with from-scratch VSOP87 + ELP2000 if more control over truncation/performance is needed

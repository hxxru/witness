# devlog — implementation plan

## MVP definition

the minimum viable product is a browser app where you can:
1. see ~500 brightest stars at correct positions for any date/location within ±4000 years
2. see the five naked-eye planets at correct positions
3. see the sun and moon at correct positions, driving a real day/night cycle
4. type in a latitude, longitude, and date, and the sky updates
5. control time: play, pause, fast-forward at multiple speeds
6. walk around a procedural low-poly terrain with hills, sparse pine trees, and water
7. toggle constellation lines

no achievements, no progression, no historical events, no multiplayer, no audio. just the sky, the world, and the time machine.

---

## build order — milestones

each milestone is independently testable. verify before moving to the next.

### milestone 1: project scaffold
- [ ] init vite + three.js project
- [ ] basic scene: camera, renderer, orbit controls (temporary, replaced by FPS later)
- [ ] render a black background with a single white test sphere
- [ ] confirm hot reload works, no console errors
- **done when:** blank 3D scene renders in browser

### milestone 2: star field (static, J2000)
- [ ] obtain BSC5 data (frostoven BSC5P-JSON repo), filter to top ~500 by visual magnitude
- [ ] place `public/data/bsc5.json` with fields: `ra`, `dec`, `vmag`, `bv`, `hip` (hipparcos ID)
- [ ] implement `src/sky/coordinates.js`: `equatorialToHorizontal(ra, dec, lst, lat)` → `{alt, az}`
- [ ] implement `horizontalToCartesian(alt, az, radius)` → `{x, y, z}`
- [ ] hardcode observer: lat 45°N, lon 0°, date J2000 (2000-01-01T12:00:00 TT)
- [ ] compute GMST for J2000, derive LST for lon 0°
- [ ] render stars as `THREE.InstancedMesh` (small quads/circles) on a celestial sphere (radius 1000)
- [ ] all stars white, uniform size for now
- **done when:** you can visually identify orion, big dipper, southern cross (rotate camera to check). compare ≥5 bright star positions against stellarium — should match within ~1°.

### milestone 3: star colors and sizes
- [ ] implement B-V → RGB color mapping (ballesteros 2012 formula or lookup table)
- [ ] implement magnitude → apparent size: `size = base * pow(2.512, (6.5 - vmag) * scale)`
- [ ] tune size scaling by eye — bright stars should pop, faint stars should be subtle
- [ ] add bloom post-processing (`UnrealBloomPass`) with low threshold for brightest stars
- [ ] star sprite: gaussian-falloff circle texture, tinted by B-V color
- **done when:** sirius is bright blue-white, betelgeuse is dimmer orange-red, faint stars are small dim points. the sky looks beautiful at a glance.

### milestone 4: constellation lines
- [ ] obtain stellarium western sky-culture data (`western/index.json`)
- [ ] parse stellarium's constellation JSON and extract constellation polylines
- [ ] preprocess the polylines into `public/data/constellations.json` as `{name, abbr, lines: [[hip1, hip2], ...]}`
- [ ] extract `common_names` into `public/data/star-names.json` for label lookups
- [ ] cross-match HIP IDs to the filtered BSC catalog at runtime
- [ ] skip segments whose endpoints are missing from the filtered catalog, and log incomplete constellations instead of failing
- [ ] render as thin `THREE.LineSegments` connecting star positions
- [ ] toggle visibility with a key (e.g., `C`)
- **done when:** pressing C shows constellation lines overlaid on correct stars. orion's belt, big dipper handle, etc. are visually correct.

### milestone 5: game clock + sidereal time
- [ ] implement `src/time/clock.js`: maintains a julian date (JD), ticks forward each frame
- [ ] implement gregorian ↔ julian date conversion (meeus ch. 7), handle julian/gregorian calendar transition (oct 1582)
- [ ] compute GMST from JD (standard polynomial formula)
- [ ] time controls: play/pause, speed multipliers (1×, 60×, 360×, 3600×)
- [ ] star positions now update from live clock + observer location
- **done when:** pressing fast-forward makes stars rotate around the celestial pole at correct rate. pausing freezes the sky. reversing time works.

### milestone 6: precession
- [ ] implement IAU precession (lieske 1979): three euler angles as polynomials in julian centuries from J2000
- [ ] apply precession rotation to star RA/Dec before the equatorial→horizontal transform
- [ ] cache precessed star positions; recompute only on time jumps or every ~game-minute
- **done when:** set date to 3000 BCE. polaris is no longer near the north celestial pole — thuban (alpha draconis) should be close instead. compare against stellarium.

### milestone 7: planets (VSOP87)
- [ ] implement or import truncated VSOP87 series for mercury, venus, mars, jupiter, saturn
- [ ] pipeline: VSOP87 → heliocentric ecliptic → heliocentric equatorial (rotate by obliquity) → geocentric equatorial (subtract earth position) → RA/Dec → alt/az
- [ ] render planets as slightly larger, non-twinkling sprites with approximate colors
- [ ] label planets distinctly from stars
- **done when:** planet positions match stellarium within ~1° for several test dates spanning ±2000 years. venus and jupiter are brightest, mercury is near the sun.

### milestone 8: sun and moon
- [ ] sun position from VSOP87 earth (geocentric sun = −heliocentric earth)
- [ ] moon position from truncated ELP2000 or meeus ch. 47 (~0.1° accuracy)
- [ ] render sun as a bright disc, moon as a disc with phase shading (illuminated fraction from sun-moon elongation)
- [ ] sun/moon positions feed into atmosphere shader (next milestone)
- **done when:** sun rises in the east, sets in the west. moon phase matches the date. full moon is opposite the sun.

### milestone 9: atmosphere and day/night cycle
- [ ] implement sky gradient shader on a large sphere or skybox
- [ ] sky color driven by sun altitude: day (blue), twilight (orange→deep blue), night (near-black)
- [ ] star visibility fades: invisible when sun alt > −6°, fully visible when sun alt < −18°, linear blend between
- [ ] terrain ambient lighting modulated by sun/moon altitude
- [ ] horizon haze: thin fog layer at the horizon for atmosphere
- **done when:** watching a sunrise in fast-forward shows correct twilight color progression. stars fade in at dusk, fade out at dawn. night sky is dark, day sky is blue.

### milestone 10: procedural terrain
- [ ] implement `src/world/terrain.js`: simplex noise heightmap (2-3 octaves, low frequency for rolling hills)
- [ ] `THREE.PlaneGeometry` ~256×256, vertex displacement, flat-shaded face normals
- [ ] terrain extends ~2km radius; fog hides edges
- [ ] color by height/slope: muted greens (flats), browns (slopes), greys (high). modulate by ambient light.
- **done when:** you see undulating hills under the night sky, extending to a foggy horizon.

### milestone 11: trees
- [ ] pine = cone + thin cylinder, instanced (`THREE.InstancedMesh`)
- [ ] placement via noise-based density function — sparse clusters with guaranteed clearings
- [ ] constraint: always ≤30 seconds walk to a full-sky clearing
- [ ] at night: trees render as dark silhouettes (no detail lighting)
- **done when:** sparse pine trees dot the hills. you can walk to a clearing and see horizon-to-horizon sky. tree silhouettes frame the stars.

### milestone 12: water
- [ ] flat plane at fixed y-level (y = 0, terrain above)
- [ ] vertex shader: gentle sine-wave ripple displacement
- [ ] fragment shader: sample sky color in reflected direction (cheap fake reflection), darken
- [ ] boat spawn: when land-mask says ocean, spawn on a small flat platform at water level with gentle bob
- **done when:** lakes/seas appear in terrain low points. at night, smeared star reflections visible in water. ocean spawning places you on a simple boat.

### milestone 13: land/ocean mask
- [ ] obtain natural earth 1:110m land polygon, rasterize to 1024×512 equirectangular PNG
- [ ] place in `public/data/land-mask.png`
- [ ] `src/world/land-mask.js`: load texture, sample at (lat, lon) → land or ocean
- [ ] spawn logic: land → spawn on terrain. ocean → spawn on boat.
- **done when:** entering coordinates in the pacific spawns you on a boat. entering paris spawns you on land.

### milestone 14: first-person controls
- [ ] replace orbit controls with pointer lock + WASD first-person camera
- [ ] basic ground collision: camera stays at fixed height above terrain
- [ ] smooth movement, mouse look with capped pitch
- **done when:** you can walk around the terrain in first person, look up at the sky, walk over hills.

### milestone 15: location/date input UI
- [ ] implement `src/ui/input-panel.js`: text fields for latitude, longitude, date (gregorian)
- [ ] "go" button teleports: regenerates terrain seed from coordinates, updates sky
- [ ] display current date/time/location on HUD
- [ ] time control buttons: play, pause, 1×/60×/360×/3600× speed
- **done when:** you can type coordinates and a date, press go, and the sky + terrain update. time controls work.

### milestone 16: star/planet labels
- [ ] hover or click on a star/planet to see its name
- [ ] use raycasting against the celestial sphere instances
- [ ] label appears as HTML overlay or Three.js sprite near the object
- **done when:** hovering over sirius shows "Sirius", hovering over jupiter shows "Jupiter".

### milestone 17: polish pass
- [ ] tune star sizes, bloom intensity, sky colors
- [ ] tune terrain amplitude, tree density, water reflectivity
- [ ] tune fog distance, horizon haze
- [ ] add milky way as a static textured band (equirectangular image mapped to the celestial sphere)
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
- vite (build tool)
- no other runtime dependencies without explicit discussion

astronomy-engine is under consideration for planets/sun/moon but not yet adopted. coordinate transforms are implemented from scratch per `docs/astronomy.md`.

---

## verification strategy

at each milestone, compare against stellarium:
- pick 5-10 bright stars, note their alt/az in stellarium for a given date/location
- check our computed positions match within ~1°
- do this for at least 3 different dates (J2000, ~1000 CE, ~3000 BCE) and 2 locations (mid-northern latitude, equatorial)

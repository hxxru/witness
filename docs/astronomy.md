# astronomy — mathematical reference

this document specifies the astronomical computations used in witness. it serves as the authoritative reference for implementing the sky engine. all formulae are from standard sources (meeus, lieske, VSOP87 theory).

## 1. time systems

### julian date (JD)

the canonical internal time representation. a continuous count of days from 4713 BCE january 1, 12:00 UT.

conversion from gregorian calendar (meeus ch. 7):

```
given: Y (year), M (month), D (day, fractional for time of day)

if M ≤ 2:
    Y = Y - 1
    M = M + 12

A = floor(Y / 100)
B = 2 - A + floor(A / 4)    # gregorian correction

JD = floor(365.25 * (Y + 4716)) + floor(30.6001 * (M + 1)) + D + B - 1524.5
```

**calendar transition:** for dates before october 15, 1582 (gregorian adoption), set B = 0 (julian calendar). for dates on or after, use the formula above.

inverse conversion (JD → gregorian) is given in meeus ch. 7 — implement for UI display.

### julian centuries from J2000

```
T = (JD - 2451545.0) / 36525.0
```

where JD 2451545.0 = 2000-01-01T12:00:00 TT (the J2000.0 epoch). T is in julian centuries (36525 days each).

### greenwich mean sidereal time (GMST)

GMST in degrees (meeus ch. 12):

```
GMST = 280.46061837 + 360.98564736629 * (JD - 2451545.0) 
       + 0.000387933 * T² - T³ / 38710000
```

reduce to [0°, 360°).

### local sidereal time (LST)

```
LST = GMST + observer_longitude    (east positive)
```

reduce to [0°, 360°).

### time scale distinctions (TODO)

years use astronomical numbering: 1 BCE = year 0, 2 BCE = year -1, etc.

strictly, the time scales used by the different parts of the pipeline are not identical:

- GMST/LST should use JD based on UT1
- precession and obliquity should use TT
- VSOP87 and other planetary theories are usually expressed in TDB

the MVP currently uses a single undifferentiated JD everywhere, effectively treating it like UTC. for modern-era naked-eye use this is acceptable: the resulting error is on the order of ~69 seconds, which is visually negligible. but ΔT grows large in deep time; by 3000 BCE it is roughly ~17 hours, which will visibly affect sidereal rotation and the apparent timing of risings and settings.

a future implementation should add a ΔT lookup table or fitted model (for example from meeus appendices or USNO tabulated values) so the engine can convert explicitly between civil time, UT1, TT, and TDB. this is deferred for now.

## 2. coordinate transforms

### equatorial → horizontal

given: right ascension (α) in degrees, declination (δ) in degrees, LST in degrees, observer latitude (φ) in degrees.

hour angle:
```
H = LST - α
```

altitude (h) and azimuth (A):
```
sin(h) = sin(φ) * sin(δ) + cos(φ) * cos(δ) * cos(H)
h = arcsin(...)

sin(A) = -cos(δ) * sin(H) / cos(h)
cos(A) = (sin(δ) - sin(φ) * sin(h)) / (cos(φ) * cos(h))
A = atan2(sin(A), cos(A))
```

convention: azimuth measured from north (0°) through east (90°), south (180°), west (270°).

### horizontal → cartesian (three.js world space)

map alt/az to a point on a celestial sphere of given radius:

```
x = radius * cos(h) * cos(A)      // north
z = radius * cos(h) * sin(A)      // east  
y = radius * sin(h)               // up
```

note: three.js uses Y-up. adjust axis mapping if needed to match scene orientation. the celestial sphere is centered on the player.

## 3. precession

over centuries, earth's rotational axis precesses, shifting the celestial coordinate system. stars' catalog positions (epoch J2000) must be precessed to the observation date.

### lieske 1979 precession angles

three angles (ζ, z, θ) as polynomials in T (julian centuries from J2000):

```
ζ = 0.6406161° * T + 0.0000839° * T² + 0.0000050° * T³
z = 0.6406161° * T + 0.0003041° * T² + 0.0000051° * T³
θ = 0.5567530° * T - 0.0001185° * T² - 0.0000116° * T³
```

(these are in degrees. convert to radians for trig.)

### applying precession

to precess RA/Dec from J2000 to date T:

```
A = cos(δ₀) * sin(α₀ + ζ)
B = cos(θ) * cos(δ₀) * cos(α₀ + ζ) - sin(θ) * sin(δ₀)
C = sin(θ) * cos(δ₀) * cos(α₀ + ζ) + cos(θ) * sin(δ₀)

α = atan2(A, B) + z
δ = arcsin(C)
```

rotation-convention note: `src/sky/coordinates.js` uses meeus's closed-form precession equations directly. if you restate the transform as an explicit rotation matrix, be careful about active-vs-passive convention; the sign on θ changes between those conventions. the previous `Rz(-z) · Ry(θ) · Rz(-ζ)` shorthand was ambiguous and should not be used as the implementation reference.

**caching:** precession changes slowly (~50"/year). recompute star positions only when the observation date changes by more than ~1 game-minute, or on time jumps. store precessed positions and reuse across frames.

## 4. star data

### source

yale bright star catalogue, 5th edition (BSC5). available as JSON from the frostoven BSC5P-JSON repository. fields used:

- `ra`: right ascension (degrees, epoch J2000)
- `dec`: declination (degrees, epoch J2000)
- `vmag`: visual magnitude (brightness; lower = brighter)
- `bv`: B-V color index
- `hip`: hipparcos catalog number (for constellation line cross-matching)
- `name`: common name (if any)

### filtering

for MVP: select stars with vmag ≤ ~4.5, yielding ~500 stars. this captures all naked-eye-prominent stars and all constellation-forming stars.

### B-V to RGB color

ballesteros 2012 approximation:

```
# B-V → effective temperature (kelvin)
T_eff = 4600 * (1 / (0.92 * BV + 1.7) + 1 / (0.92 * BV + 0.62))

# T_eff → RGB via planck spectrum approximation
# use a standard blackbody-to-RGB lookup or analytic fit
```

a simpler approach: precompute a lookup table mapping B-V ranges to RGB:

| B-V range   | color       | example stars        |
|-------------|-------------|----------------------|
| < -0.1      | blue-white  | spica, rigel         |
| -0.1 to 0.0 | white-blue  | sirius, vega         |
| 0.0 to 0.3  | white       | altair, fomalhaut    |
| 0.3 to 0.6  | yellow-white| procyon, polaris     |
| 0.6 to 0.9  | yellow      | sun, capella         |
| 0.9 to 1.2  | orange      | arcturus, aldebaran  |
| > 1.2       | red-orange  | betelgeuse, antares  |

interpolate within ranges for smooth color transitions.

### magnitude to apparent size

```
size = baseSize * pow(2.512, (limitingMag - vmag) * scaleFactor)
```

where:
- `baseSize`: minimum sprite size in pixels (tune by eye, start with ~1.0)
- `limitingMag`: faintest visible magnitude (~4.5 for our catalog)
- `vmag`: star's visual magnitude
- `scaleFactor`: controls contrast between bright and faint (start with ~0.4, tune by eye)
- 2.512 is the pogson ratio (5th root of 100) — one magnitude step = 2.512× brightness

bright stars (vmag < 1) should additionally get bloom from the post-processing pass.

## 5. constellation lines

### source

stellarium's western sky culture: `constellationship.fab`. format: each line is `constellation_name N hip1 hip2 hip3 hip4 ...` where N is the number of line segments, and pairs (hip1,hip2), (hip3,hip4), ... are the endpoints.

### cross-matching

the BSC5P dataset includes hipparcos IDs (`hip` field). match constellation line endpoint hipparcos IDs to the corresponding BSC entries. some hipparcos IDs in stellarium may not have BSC counterparts (stars fainter than the catalog) — skip those lines.

### rendering

`THREE.LineSegments` with positions updated from the same celestial sphere coordinates as stars. thin lines (linewidth 1), semi-transparent white or light blue. toggled by keypress.

## 6. planets (VSOP87)

implementation note: MVP uses astronomy-engine for these computations. the formulae below are retained as reference for a potential future from-scratch implementation.

### overview

VSOP87 (variations séculaires des orbites planétaires) gives heliocentric positions of planets as truncated trigonometric series in time. each coordinate is a sum of terms:

```
L = Σ Aᵢ * cos(Bᵢ + Cᵢ * T)
```

grouped by powers of T (L0, L1, L2, ...). use version VSOP87A (heliocentric ecliptic rectangular, equinox J2000) or VSOP87D (heliocentric ecliptic spherical, equinox of date).

### pipeline

```
VSOP87 → heliocentric ecliptic (lon, lat, r) for planet and earth
→ geocentric ecliptic (subtract earth's position)
→ geocentric equatorial (rotate by obliquity of ecliptic)
→ RA/Dec
→ alt/az (same transform as stars)
```

obliquity of the ecliptic (meeus ch. 22):
```
ε = 23.4392911° - 0.0130042° * T - 1.64e-7° * T² + 5.04e-7° * T³
```

### truncation

for naked-eye accuracy (~0.1° or better), aggressively truncate: keep terms with amplitude > 0.0001 radians (~0.006°). this reduces data size from ~100KB per planet to a few KB.

### planets to compute

mercury, venus, mars, jupiter, saturn. these are the five naked-eye planets. uranus is technically visible in perfect conditions (vmag ~5.7) but not worth computing for MVP.

### planet visual magnitudes

approximate apparent magnitudes vary with distance and phase angle. for MVP, use a fixed approximate magnitude for each:
- venus: -4 to -3 (always the brightest)
- jupiter: -2 to -1
- mars: -2 to +2 (varies a lot)
- saturn: +1 to 0
- mercury: -1 to +1

render as larger, non-twinkling sprites with distinctive colors (venus: white, mars: red-orange, jupiter: cream, saturn: pale yellow, mercury: grey).

## 7. sun position

implementation note: MVP uses astronomy-engine for these computations. the formulae below are retained as reference for a potential future from-scratch implementation.

derive from VSOP87 earth coordinates:

```
geocentric_sun = -heliocentric_earth
```

convert to RA/Dec, then alt/az. the sun's altitude drives the atmosphere shader and star visibility.

### sun altitude thresholds

| sun altitude | condition               | sky state              |
|-------------|-------------------------|------------------------|
| > 0°        | daytime                 | blue sky, no stars     |
| 0° to -6°   | civil twilight          | sunset colors, no stars|
| -6° to -12° | nautical twilight       | deep blue, brightest stars appear |
| -12° to -18°| astronomical twilight   | transition to full night|
| < -18°      | night                   | full dark, all stars visible |

star visibility blend: `visibility = 1.0 - smoothstep(-18.0, -6.0, sunAltitude)`.

## 8. moon position

implementation note: MVP uses astronomy-engine for these computations. the formulae below are retained as reference for a potential future from-scratch implementation.

### simplified theory

use meeus ch. 47 (truncated ELP2000/82 lunar theory, chapront). the moon's ecliptic longitude (λ), latitude (β), and distance (Δ) are computed from ~60 periodic terms involving:

- mean elongation (D)
- sun's mean anomaly (M)
- moon's mean anomaly (M')
- moon's argument of latitude (F)

these four fundamental arguments are polynomials in T. the periodic terms are tabulated in meeus.

accuracy: about ~10" in longitude and ~4" in latitude for the truncated theory described by meeus.

### moon phase

MVP note: runtime phase shading uses astronomy-engine's `Illumination('Moon', ...)` output, not the shortcut derivation below.

for reference, if `E` is the geocentric sun-moon elongation as seen from earth:

```
cos(E) = sin(δ_sun) * sin(δ_moon) + cos(δ_sun) * cos(δ_moon) * cos(α_sun - α_moon)
```

illuminated fraction:
```
k = (1 - cos(E)) / 2
```

this gives `k = 0` at new moon (`E ≈ 0`) and `k = 1` at full moon (`E ≈ 180°`). if you instead use the true selenocentric phase angle `i`, then `k = (1 + cos(i)) / 2`, but that requires a different computation than the elongation formula above.

## 9. numerical notes

- all angles: internally use radians. convert to/from degrees only at I/O boundaries.
- trig functions: javascript's `Math.sin`, `Math.cos`, etc. operate in radians.
- angle reduction: always reduce angles to [0, 2π) or [-π, π) as appropriate before use.
- floating point: standard 64-bit doubles are sufficient for all computations here. no need for arbitrary precision.
- T range: VSOP87 is designed for |T| ≤ 40 (±4000 years from J2000). results degrade outside this range.

## 10. verification

at every milestone, compare computed positions against stellarium:

1. pick a date and observer location
2. note alt/az of ≥5 bright stars in stellarium
3. compute the same in witness
4. differences should be < 1° for stars, < 0.5° for planets

test dates should span the full range:
- J2000 (2000-01-01): baseline, easiest to verify
- 1000 CE: moderate precession, historical period
- 3000 BCE: large precession, polaris far from pole
- 1582-10-15: calendar transition boundary

when comparing against stellarium, ensure stellarium is set to J2000 equatorial coordinates with atmospheric refraction disabled. otherwise apparent alt/az can differ from geometric alt/az by up to ~0.5° near the horizon.

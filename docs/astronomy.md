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
# convert J2000 RA/Dec to unit vector
x₀ = cos(δ₀) * cos(α₀)
y₀ = cos(δ₀) * sin(α₀)
z₀ = sin(δ₀)

# build precession rotation matrix P = Rz(-z) · Ry(θ) · Rz(-ζ)
# or equivalently apply three successive rotations

# result: new unit vector (x, y, z)
α = atan2(y, x)
δ = arcsin(z)
```

the full rotation matrix P is the product of three axis rotations. see meeus ch. 21 for the explicit matrix elements.

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

star visibility blend: `visibility = smoothstep(-6°, -18°, sunAltitude)` (0 at -6°, 1 at -18°).

## 8. moon position

### simplified theory

use meeus ch. 47 (truncated brown's lunar theory). the moon's ecliptic longitude (λ), latitude (β), and distance (Δ) are computed from ~60 periodic terms involving:

- mean elongation (D)
- sun's mean anomaly (M)
- moon's mean anomaly (M')
- moon's argument of latitude (F)

these four fundamental arguments are polynomials in T. the periodic terms are tabulated in meeus.

accuracy: ~0.1° in longitude, sufficient for naked-eye positioning.

### moon phase

the phase angle (i) is the angular separation between the sun and moon as seen from earth:

```
cos(i) = sin(δ_sun) * sin(δ_moon) + cos(δ_sun) * cos(δ_moon) * cos(α_sun - α_moon)
```

illuminated fraction:
```
k = (1 + cos(i)) / 2
```

k ranges from 0 (new moon) to 1 (full moon). use k to shade the moon disc: a shader that draws the terminator line based on the phase angle and position angle.

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
- 1 CE: calendar transition boundary

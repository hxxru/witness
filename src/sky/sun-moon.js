import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';

import { equatorialToHorizontal, horizontalToCartesian } from './coordinates.js';
import { tuning } from '../ui/debug-panel.js';

const J2000_JD = 2451545.0;
const SKY_RADIUS = 1000;
const LABEL_COLOR = '#F5E6C8';
const DAY_MOON_COLOR = new THREE.Color(0.52, 0.54, 0.58);
const NIGHT_MOON_COLOR = new THREE.Color(1.65, 1.62, 1.55);

function smoothstep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function createDiscTexture(colorStops) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);

  for (const [offset, color] of colorStops) {
    gradient.addColorStop(offset, color);
  }

  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function createMoonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, texture };
}

function createLabelRoot() {
  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.inset = '0';
  root.style.pointerEvents = 'none';
  root.style.zIndex = '9';
  document.body.appendChild(root);
  return root;
}

function createLabel(root, text) {
  const label = document.createElement('div');
  label.textContent = text;
  label.style.position = 'fixed';
  label.style.transform = 'translate(-50%, -50%)';
  label.style.fontFamily = '"Space Mono", "IBM Plex Mono", monospace';
  label.style.fontSize = `${tuning.planets.labelSize}px`;
  label.style.lineHeight = '1';
  label.style.color = LABEL_COLOR;
  label.style.textShadow = '0 0 6px rgba(0, 0, 0, 0.85)';
  label.style.whiteSpace = 'nowrap';
  root.appendChild(label);
  return label;
}

function updateLabelPosition(label, position, camera) {
  const projected = position.clone().project(camera);
  const onScreen =
    projected.z > -1 &&
    projected.z < 1 &&
    projected.x >= -1.15 &&
    projected.x <= 1.15 &&
    projected.y >= -1.15 &&
    projected.y <= 1.15;

  label.style.display = onScreen ? 'block' : 'none';

  if (!onScreen) {
    return;
  }

  const x = ((projected.x + 1) / 2) * window.innerWidth;
  const y = ((-projected.y + 1) / 2) * window.innerHeight;
  label.style.left = `${x + 12}px`;
  label.style.top = `${y - 10}px`;
}

function drawMoonPhase(moonTexture, phaseFraction, waxing) {
  const context = moonTexture.canvas.getContext('2d');
  const width = moonTexture.canvas.width;
  const height = moonTexture.canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = width * 0.34;
  const normalizedPhase = THREE.MathUtils.clamp(phaseFraction * 2 - 1, -1, 1);

  context.clearRect(0, 0, width, height);

  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = 'rgba(28, 31, 37, 0.88)';
  context.fill();

  const imageData = context.getImageData(0, 0, width, height);

  for (let pixelY = 0; pixelY < height; pixelY += 1) {
    for (let pixelX = 0; pixelX < width; pixelX += 1) {
      const x = (pixelX + 0.5 - centerX) / radius;
      const y = (pixelY + 0.5 - centerY) / radius;
      const distanceSquared = x * x + y * y;

      if (distanceSquared > 1) {
        continue;
      }

      const halfChord = Math.sqrt(Math.max(0, 1 - y * y));
      const lit = waxing ? x >= -normalizedPhase * halfChord : x <= normalizedPhase * halfChord;

      if (!lit) {
        continue;
      }

      const brightness = Math.sqrt(Math.max(0, 1 - distanceSquared));
      const pixelIndex = (pixelY * width + pixelX) * 4;
      imageData.data[pixelIndex] = 245;
      imageData.data[pixelIndex + 1] = 241;
      imageData.data[pixelIndex + 2] = 230;
      imageData.data[pixelIndex + 3] = Math.round(210 + 45 * brightness);
    }
  }

  context.putImageData(imageData, 0, 0);
  moonTexture.texture.needsUpdate = true;
}

function jdToAstroTimeDays(jd) {
  return jd - J2000_JD;
}

export function celestialVisibilityForSunAltitude(sunAltitude) {
  const nightFactor = 1 - smoothstep(-4, 12, sunAltitude);
  return THREE.MathUtils.lerp(tuning.sunMoon.daytimeDimming, 1, nightFactor);
}

export function createSunMoon(scene) {
  const labelRoot = createLabelRoot();
  const sunMaterial = new THREE.SpriteMaterial({
    map: createDiscTexture([
      [0, 'rgba(255,255,250,1)'],
      [0.24, 'rgba(255,252,244,1)'],
      [0.46, 'rgba(255,242,188,0.96)'],
      [0.68, 'rgba(255,224,138,0.48)'],
      [0.84, 'rgba(255,214,120,0.12)'],
      [1, 'rgba(255,220,120,0)'],
    ]),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const sun = new THREE.Sprite(sunMaterial);
  sun.scale.setScalar(220 * tuning.sunMoon.sunDiscSize);
  scene.add(sun);

  const moonTexture = createMoonTexture();
  drawMoonPhase(moonTexture, 0.5, true);
  const moonMaterial = new THREE.SpriteMaterial({
    map: moonTexture.texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const moon = new THREE.Sprite(moonMaterial);
  moon.scale.setScalar(180 * tuning.sunMoon.moonDiscSize);
  scene.add(moon);

  const moonHaloMaterial = new THREE.SpriteMaterial({
    map: createDiscTexture([
      [0, 'rgba(255,255,255,0.22)'],
      [0.32, 'rgba(220,235,255,0.14)'],
      [0.68, 'rgba(170,195,235,0.05)'],
      [1, 'rgba(170,195,235,0)'],
    ]),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const moonHalo = new THREE.Sprite(moonHaloMaterial);
  moonHalo.scale.setScalar(280 * tuning.sunMoon.moonDiscSize);
  scene.add(moonHalo);

  return {
    sun,
    moon,
    moonHalo,
    moonMaterial,
    moonHaloMaterial,
    moonTexture,
    sunLabel: createLabel(labelRoot, 'Sun'),
    moonLabel: createLabel(labelRoot, 'Moon'),
    observer: new Astronomy.Observer(0, 0, 0),
    observerPosition: new THREE.Vector3(),
    sunData: null,
    moonData: null,
    moonPhase: null,
    lastMoonPhaseKey: null,
  };
}

function updateMoonAppearance(sunMoon, sunAltitude, illuminatedFraction) {
  const visibility = celestialVisibilityForSunAltitude(sunAltitude);
  const nightFactor = 1 - smoothstep(-4, 12, sunAltitude);
  const phaseFactor = THREE.MathUtils.lerp(0.45, 1, THREE.MathUtils.clamp(illuminatedFraction, 0, 1));

  sunMoon.moonMaterial.opacity = visibility * phaseFactor;
  sunMoon.moonMaterial.color.copy(
    new THREE.Color().lerpColors(DAY_MOON_COLOR, NIGHT_MOON_COLOR, nightFactor)
  );
  sunMoon.sun.scale.setScalar(220 * tuning.sunMoon.sunDiscSize);
  sunMoon.moon.scale.setScalar(
    THREE.MathUtils.lerp(152, 188, nightFactor) * tuning.sunMoon.moonDiscSize
  );
  sunMoon.moonHaloMaterial.opacity =
    tuning.sunMoon.nightHalo * nightFactor * THREE.MathUtils.clamp(illuminatedFraction, 0, 1);
  sunMoon.moonHaloMaterial.color.copy(
    new THREE.Color().lerpColors(DAY_MOON_COLOR, NIGHT_MOON_COLOR, nightFactor)
  );
  sunMoon.moonHalo.scale.setScalar(
    THREE.MathUtils.lerp(250, 310, nightFactor) * tuning.sunMoon.moonDiscSize
  );
}

export function updateSunMoon(
  sunMoon,
  jd,
  lst,
  latitude,
  longitude,
  camera = null,
  observerPosition = null
) {
  if (observerPosition) {
    sunMoon.observerPosition.copy(observerPosition);
  }

  sunMoon.observer.latitude = latitude;
  sunMoon.observer.longitude = longitude;
  sunMoon.observer.height = 0;

  const time = jdToAstroTimeDays(jd);
  // Keep the Moon topocentric; lunar parallax is large enough to matter visually.
  const sunEquatorial = Astronomy.Equator(Astronomy.Body.Sun, time, sunMoon.observer, true, true);
  const moonEquatorial = Astronomy.Equator(Astronomy.Body.Moon, time, sunMoon.observer, true, true);
  const sunRA = sunEquatorial.ra * 15;
  const moonRA = moonEquatorial.ra * 15;
  const sunHorizontal = equatorialToHorizontal(sunRA, sunEquatorial.dec, lst, latitude);
  const moonHorizontal = equatorialToHorizontal(moonRA, moonEquatorial.dec, lst, latitude);
  const sunCartesian = horizontalToCartesian(sunHorizontal.alt, sunHorizontal.az, SKY_RADIUS);
  const moonCartesian = horizontalToCartesian(moonHorizontal.alt, moonHorizontal.az, SKY_RADIUS);
  // Use astronomy-engine's illuminated fraction instead of a hand-rolled elongation shortcut.
  const illumination = Astronomy.Illumination(Astronomy.Body.Moon, time);
  const phaseDegrees = Astronomy.MoonPhase(time);
  const waxing = phaseDegrees < 180;
  const phaseKey = `${illumination.phase_fraction.toFixed(4)}:${waxing ? 'w' : 'n'}`;

  sunMoon.sun.position
    .set(sunCartesian.x, sunCartesian.y, sunCartesian.z)
    .add(sunMoon.observerPosition);
  sunMoon.moon.position
    .set(moonCartesian.x, moonCartesian.y, moonCartesian.z)
    .add(sunMoon.observerPosition);
  sunMoon.moonHalo.position.copy(sunMoon.moon.position);

  if (phaseKey !== sunMoon.lastMoonPhaseKey) {
    drawMoonPhase(sunMoon.moonTexture, illumination.phase_fraction, waxing);
    sunMoon.lastMoonPhaseKey = phaseKey;
  }

  sunMoon.sunData = {
    ra: sunRA,
    dec: sunEquatorial.dec,
    alt: sunHorizontal.alt,
    az: sunHorizontal.az,
  };
  sunMoon.moonData = {
    ra: moonRA,
    dec: moonEquatorial.dec,
    alt: moonHorizontal.alt,
    az: moonHorizontal.az,
  };
  sunMoon.moonPhase = {
    illuminatedFraction: illumination.phase_fraction,
    phaseAngle: illumination.phase_angle,
    phaseDegrees,
  };

  updateMoonAppearance(sunMoon, sunHorizontal.alt, illumination.phase_fraction);

  if (camera) {
    const moonVisibility = celestialVisibilityForSunAltitude(sunHorizontal.alt) *
      THREE.MathUtils.lerp(0.45, 1, THREE.MathUtils.clamp(illumination.phase_fraction, 0, 1));
    sunMoon.sunLabel.style.fontSize = `${tuning.planets.labelSize}px`;
    sunMoon.moonLabel.style.fontSize = `${tuning.planets.labelSize}px`;
    sunMoon.sunLabel.style.opacity = '1';
    sunMoon.moonLabel.style.opacity = String(moonVisibility);
    updateLabelPosition(sunMoon.sunLabel, sunMoon.sun.position, camera);
    updateLabelPosition(sunMoon.moonLabel, sunMoon.moon.position, camera);
  }
}

export function getSunAltitude(sunMoon) {
  return sunMoon.sunData?.alt ?? -90;
}

export function getMoonPhase(sunMoon) {
  return sunMoon.moonPhase;
}

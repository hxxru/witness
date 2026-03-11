import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';

import { computeAttenuation } from './attenuation.js';
import { equatorialToHorizontal, horizontalToCartesian } from './coordinates.js';
import { tuning } from '../ui/debug-panel.js';

const PLANET_RADIUS = 1000;
const J2000_JD = 2451545.0;
const LABEL_COLOR = '#F5E6C8';
const PLANET_CONFIGS = [
  { body: Astronomy.Body.Mercury, name: 'Mercury', color: '#a7adb5', size: 14 },
  { body: Astronomy.Body.Venus, name: 'Venus', color: '#fff8f0', size: 18 },
  { body: Astronomy.Body.Mars, name: 'Mars', color: '#ff7a4f', size: 16 },
  { body: Astronomy.Body.Jupiter, name: 'Jupiter', color: '#f0dcc0', size: 20 },
  { body: Astronomy.Body.Saturn, name: 'Saturn', color: '#eadb9e', size: 18 },
];

function createDiscTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 48);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.98)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
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

function jdToAstroTimeDays(jd) {
  return jd - J2000_JD;
}

export function createPlanets(scene) {
  const texture = createDiscTexture();
  const labelRoot = createLabelRoot();
  const observer = new Astronomy.Observer(0, 0, 0);
  const bodies = PLANET_CONFIGS.map((config) => {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: config.color,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(config.size * tuning.planets.spriteSize);
    scene.add(sprite);

    return {
      ...config,
      sprite,
      baseColor: new THREE.Color(config.color),
      tintColor: new THREE.Color(1, 1, 1),
      label: createLabel(labelRoot, config.name),
      data: null,
    };
  });

  return {
    bodies,
    observer,
    observerPosition: new THREE.Vector3(),
  };
}

export function updatePlanetPositions(
  planets,
  jd,
  lst,
  latitude,
  longitude,
  camera,
  observerPosition = null,
  sunAltitude = -90
) {
  if (observerPosition) {
    planets.observerPosition.copy(observerPosition);
  }

  planets.observer.latitude = latitude;
  planets.observer.longitude = longitude;
  planets.observer.height = 0;

  const time = jdToAstroTimeDays(jd);

  for (const planet of planets.bodies) {
    const equatorial = Astronomy.Equator(planet.body, time, planets.observer, true, true);
    const ra = equatorial.ra * 15;
    const dec = equatorial.dec;
    const horizontal = equatorialToHorizontal(ra, dec, lst, latitude);
    const cartesian = horizontalToCartesian(horizontal.alt, horizontal.az, PLANET_RADIUS);

    planet.sprite.position
      .set(cartesian.x, cartesian.y, cartesian.z)
      .add(planets.observerPosition);
    const attenuation = computeAttenuation(horizontal.alt, sunAltitude, 'planets');
    planet.sprite.scale.setScalar(planet.size * tuning.planets.spriteSize);
    planet.tintColor.setRGB(attenuation.tint.r, attenuation.tint.g, attenuation.tint.b);
    planet.sprite.material.color.copy(planet.baseColor).multiply(planet.tintColor);
    planet.sprite.material.opacity = attenuation.brightness;
    planet.label.style.fontSize = `${tuning.planets.labelSize}px`;
    planet.label.style.opacity = String(attenuation.brightness);

    updateLabelPosition(planet.label, planet.sprite.position, camera);

    planet.data = {
      name: planet.name,
      ra,
      dec,
      alt: horizontal.alt,
      az: horizontal.az,
    };
  }
}

export function getPlanetDebugData(planets) {
  return planets.bodies.map((planet) => planet.data).filter(Boolean);
}

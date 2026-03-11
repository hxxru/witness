import * as THREE from 'three';

import { computeAttenuation } from './attenuation.js';
import { equatorialToHorizontal, horizontalToCartesian, precessRADec } from './coordinates.js';
import { tuning } from '../ui/debug-panel.js';

const STAR_RADIUS = 1000;
const MIN_STAR_SIZE = 1.2;
const MAX_STAR_SIZE = 12;
const POLARIS_HIP = 11767;
const PRECESSION_RECOMPUTE_THRESHOLD_T = 1 / (1440 * 36525);
const COLOR_STOPS = [
  { bv: -0.2, color: new THREE.Color('#9bbcff') },
  { bv: 0.0, color: new THREE.Color('#cad7ff') },
  { bv: 0.3, color: new THREE.Color('#f4f7ff') },
  { bv: 0.6, color: new THREE.Color('#fff4df') },
  { bv: 0.9, color: new THREE.Color('#ffe0a8') },
  { bv: 1.2, color: new THREE.Color('#ffbe7a') },
  { bv: 1.6, color: new THREE.Color('#ff9b5e') },
];

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function resolveActiveStarCount(stars, limitingMagnitude) {
  let low = 0;
  let high = stars.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);

    if (stars[middle].vmag <= limitingMagnitude) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

export function colorForBV(bv) {
  if (!Number.isFinite(bv)) {
    return new THREE.Color('#f4f7ff');
  }

  const clampedBV = clamp(bv, COLOR_STOPS[0].bv, COLOR_STOPS[COLOR_STOPS.length - 1].bv);

  for (let index = 0; index < COLOR_STOPS.length - 1; index += 1) {
    const current = COLOR_STOPS[index];
    const next = COLOR_STOPS[index + 1];

    if (clampedBV <= next.bv) {
      const alpha = (clampedBV - current.bv) / (next.bv - current.bv);
      return new THREE.Color().lerpColors(current.color, next.color, alpha);
    }
  }

  return COLOR_STOPS[COLOR_STOPS.length - 1].color.clone();
}

export function sizeForMagnitude(vmag) {
  if (!Number.isFinite(vmag)) {
    return tuning.stars.baseSize;
  }

  const size =
    tuning.stars.baseSize *
    Math.pow(2.512, (tuning.stars.limitingMagnitude - vmag) * tuning.stars.scaleFactor);

  return clamp(size, MIN_STAR_SIZE, MAX_STAR_SIZE);
}

function brightnessForMagnitude(vmag) {
  if (!Number.isFinite(vmag)) {
    return 1;
  }

  return clamp(0.95 + Math.pow(2.512, (1.2 - vmag) * 0.12), 1, 1.65);
}

function buildInstanceMatrix(position, scale, target, dummy) {
  dummy.position.copy(position);
  dummy.scale.setScalar(scale);
  dummy.updateMatrix();

  return dummy.matrix;
}

export async function loadStarCatalog(url = '/data/bsc5.json') {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load star catalog from ${url}`);
  }

  return response.json();
}

export function createStarField(scene, starData) {
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
  });
  const stars = starData.map((star) => {
    const color = colorForBV(star.bv);
    const brightness = brightnessForMagnitude(star.vmag);

    return {
      ...star,
      baseColor: color.multiplyScalar(brightness),
    };
  });

  const mesh = new THREE.InstancedMesh(geometry, material, stars.length);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  for (let index = 0; index < stars.length; index += 1) {
    mesh.setColorAt(index, stars[index].baseColor);
  }

  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }

  return {
    mesh,
    stars,
    polarisIndex: stars.findIndex((star) => star.hip === POLARIS_HIP || star.name === 'Polaris'),
    precessedEquatorial: stars.map((star) => ({ ra: star.ra, dec: star.dec })),
    lastPrecessionT: null,
    radius: STAR_RADIUS,
    positions: Array.from({ length: stars.length }, () => new THREE.Vector3()),
    observerPosition: new THREE.Vector3(),
    dummy: new THREE.Object3D(),
    renderedCount: 0,
    visibleCount: 0,
    activeCount: resolveActiveStarCount(stars, tuning.stars.limitingMagnitude),
    lastActiveCount: -1,
    tintColor: new THREE.Color(1, 1, 1),
    scratchColor: new THREE.Color(),
  };
}

export function updateStarPositions(starField, lst, latitude, T, observerPosition = null) {
  if (observerPosition) {
    starField.observerPosition.copy(observerPosition);
  }

  const activeCount = resolveActiveStarCount(starField.stars, tuning.stars.limitingMagnitude);

  if (
    starField.lastPrecessionT === null ||
    Math.abs(T - starField.lastPrecessionT) >= PRECESSION_RECOMPUTE_THRESHOLD_T ||
    activeCount !== starField.lastActiveCount
  ) {
    for (let index = 0; index < activeCount; index += 1) {
      const star = starField.stars[index];
      starField.precessedEquatorial[index] = precessRADec(star.ra, star.dec, T);
    }

    starField.lastPrecessionT = T;
  }

  for (let index = 0; index < activeCount; index += 1) {
    const star = starField.stars[index];
    const precessed = starField.precessedEquatorial[index];
    const horizontal = equatorialToHorizontal(precessed.ra, precessed.dec, lst, latitude);
    const cartesian = horizontalToCartesian(horizontal.alt, horizontal.az, starField.radius);
    const worldPosition = starField.positions[index];

    worldPosition.set(cartesian.x, cartesian.y, cartesian.z).add(starField.observerPosition);

    const matrix = buildInstanceMatrix(worldPosition, sizeForMagnitude(star.vmag), starField.observerPosition, starField.dummy);

    starField.mesh.setMatrixAt(index, matrix);
  }

  starField.mesh.count = activeCount;
  starField.mesh.instanceMatrix.needsUpdate = true;
  starField.activeCount = activeCount;
  starField.lastActiveCount = activeCount;
  starField.renderedCount = activeCount;
  tuning.stars.renderedCount = activeCount;
}

export function updateStarVisibility(starField, sunAltitude) {
  let visibleCount = 0;

  for (let index = 0; index < starField.activeCount; index += 1) {
    const star = starField.stars[index];

    const relativeY = (starField.positions[index].y - starField.observerPosition.y) / starField.radius;
    const altitude = Math.asin(clamp(relativeY, -1, 1)) * THREE.MathUtils.RAD2DEG;
    const attenuation = computeAttenuation(altitude, sunAltitude, 'stars');

    starField.tintColor.setRGB(attenuation.tint.r, attenuation.tint.g, attenuation.tint.b);
    starField.mesh.setColorAt(
      index,
      starField.scratchColor.copy(star.baseColor).multiply(starField.tintColor).multiplyScalar(attenuation.brightness)
    );

    if (attenuation.brightness > 0.002) {
      visibleCount += 1;
    }
  }

  starField.mesh.instanceColor.needsUpdate = true;
  starField.mesh.visible = visibleCount > 0;
  starField.mesh.material.opacity = 1;
  starField.visibleCount = visibleCount;
}

export function setStarFieldVisible(starField, visible) {
  starField.mesh.visible = visible;
}

export function createPolarisMarker(scene, starField) {
  if (starField.polarisIndex < 0) {
    console.warn('Polaris marker unavailable: Polaris is not present in the filtered star catalog.');
    return null;
  }

  const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(18, 18, 18));
  const material = new THREE.LineBasicMaterial({
    color: 0xff4d4d,
    transparent: true,
    opacity: 0.95,
    toneMapped: false,
  });
  const marker = new THREE.LineSegments(geometry, material);
  marker.visible = false;
  scene.add(marker);

  return {
    marker,
    starIndex: starField.polarisIndex,
  };
}

export function updatePolarisMarker(polarisMarker, starField) {
  if (!polarisMarker) {
    return;
  }

  polarisMarker.marker.position.copy(starField.positions[polarisMarker.starIndex]);
}

export function togglePolarisMarker(polarisMarker) {
  if (!polarisMarker) {
    return false;
  }

  polarisMarker.marker.visible = !polarisMarker.marker.visible;
  return polarisMarker.marker.visible;
}

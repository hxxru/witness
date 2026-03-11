import * as THREE from 'three';

import { equatorialToHorizontal, horizontalToCartesian, precessRADec } from './coordinates.js';

const STAR_RADIUS = 1000;
const BASE_STAR_SIZE = 1.6;
const LIMITING_MAGNITUDE = 4.5;
const SIZE_SCALE_FACTOR = 0.35;
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
    return BASE_STAR_SIZE;
  }

  const size =
    BASE_STAR_SIZE * Math.pow(2.512, (LIMITING_MAGNITUDE - vmag) * SIZE_SCALE_FACTOR);

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
    depthWrite: false,
    toneMapped: false,
  });
  const stars = starData.map((star) => {
    const color = colorForBV(star.bv);
    const brightness = brightnessForMagnitude(star.vmag);

    return {
      ...star,
      size: sizeForMagnitude(star.vmag),
      color: color.multiplyScalar(brightness),
    };
  });

  const mesh = new THREE.InstancedMesh(geometry, material, stars.length);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  for (let index = 0; index < stars.length; index += 1) {
    mesh.setColorAt(index, stars[index].color);
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
  };
}

export function updateStarPositions(starField, lst, latitude, T, observerPosition = null) {
  if (observerPosition) {
    starField.observerPosition.copy(observerPosition);
  }

  if (
    starField.lastPrecessionT === null ||
    Math.abs(T - starField.lastPrecessionT) >= PRECESSION_RECOMPUTE_THRESHOLD_T
  ) {
    for (let index = 0; index < starField.stars.length; index += 1) {
      const star = starField.stars[index];
      starField.precessedEquatorial[index] = precessRADec(star.ra, star.dec, T);
    }

    starField.lastPrecessionT = T;
  }

  for (let index = 0; index < starField.stars.length; index += 1) {
    const star = starField.stars[index];
    const precessed = starField.precessedEquatorial[index];
    const horizontal = equatorialToHorizontal(precessed.ra, precessed.dec, lst, latitude);
    const cartesian = horizontalToCartesian(horizontal.alt, horizontal.az, starField.radius);
    const worldPosition = starField.positions[index];

    worldPosition.set(cartesian.x, cartesian.y, cartesian.z).add(starField.observerPosition);

    const matrix = buildInstanceMatrix(
      worldPosition,
      star.size,
      starField.observerPosition,
      starField.dummy
    );

    starField.mesh.setMatrixAt(index, matrix);
  }

  starField.mesh.instanceMatrix.needsUpdate = true;
}

export function updateStarVisibility(starField, sunAltitude) {
  starField.mesh.visible = sunAltitude <= -6;
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

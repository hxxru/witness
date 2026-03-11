import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import {
  createAtmosphere,
  updateAtmosphere,
} from './sky/atmosphere.js';
import {
  julianDate,
  localSiderealTime,
} from './sky/coordinates.js';
import {
  createConstellationLines,
  loadConstellationData,
  toggleConstellationLines,
  updateConstellationVisibility,
  updateConstellationPositions,
} from './sky/constellations.js';
import { createPlanets, getPlanetDebugData, updatePlanetPositions } from './sky/planets.js';
import {
  createPolarisMarker,
  createStarField,
  loadStarCatalog,
  starVisibilityForSunAltitude,
  togglePolarisMarker,
  updatePolarisMarker,
  updateStarVisibility,
  updateStarPositions,
} from './sky/stars.js';
import {
  createSunMoon,
  getMoonPhase,
  getSunAltitude,
  updateSunMoon,
} from './sky/sun-moon.js';
import {
  createClock,
  getClockGMST,
  getClockGregorian,
  getClockJD,
  getClockSpeed,
  getClockT,
  isClockPaused,
  setClockPaused,
  setClockSpeed,
  setClockJD,
  tickClock,
} from './time/clock.js';
import { createDebugPanel, toggleDebugPanel, tuning } from './ui/debug-panel.js';
import { createHud, toggleHud, updateHud } from './ui/hud.js';
import { createTimeControls } from './ui/time-controls.js';
import { spawnPlayer } from './player/spawn.js';
import { createBoat, updateBoatLighting, updateBoatMotion } from './world/boat.js';
import { createWorldFog, updateWorldFog } from './world/fog.js';
import { createTerrain, updateTerrainLighting } from './world/terrain.js';
import { loadLandMask } from './world/land-mask.js';
import { createTrees, updateTreesLighting } from './world/trees.js';
import { createWater, updateWater } from './world/water.js';

// Entry point and temporary scene bootstrap. Systems are scaffolded under src/*
// and will be wired into this orchestrator as milestones are implemented.

const OBSERVER_LATITUDE = 45;
const OBSERVER_LONGITUDE = 0;
const J2000_JD = 2451545.0;
const ENABLE_BLOOM = true;
const LAND_WATER_OPTIONS = {
  size: 5200,
  segments: 224,
  waterDay: '#597995',
  waterNight: '#060c14',
};
const OCEAN_WATER_OPTIONS = {
  size: 14000,
  segments: 288,
  waterDay: '#445a69',
  waterNight: '#02070f',
};
const SPAWN_OVERRIDE_SEQUENCE = [null, 'ocean', 'land'];
const SPEED_PRESETS = {
  Digit1: 1,
  Digit2: 60,
  Digit3: 360,
  Digit4: 3600,
};

// --- scene setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  75,                                       // FOV
  window.innerWidth / window.innerHeight,   // aspect
  0.1,                                      // near
  5000                                      // far — must contain terrain and celestial sphere
);
camera.position.set(180, 72, 180);
camera.up.set(0, 1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  tuning.bloom.strength,
  tuning.bloom.radius,
  tuning.bloom.threshold
);
composer.addPass(bloomPass);

let starField = null;
let constellationLines = null;
let planets = null;
let sunMoon = null;
let atmosphere = null;
let terrain = null;
let trees = null;
let water = null;
let boat = null;
let landMask = null;
let worldFog = null;
let polarisMarker = null;
let clock = null;
let hud = null;
let debugPanel = null;
let timeControls = null;
let currentLST = 0;
let lastFrameTime = null;
let fps = 0;
let spawnState = null;
let spawnModeOverride = null;
const lookState = {
  dragging: false,
  yaw: 0,
  pitch: 0,
  sensitivity: 0.0032,
};
const observerWorldPosition = new THREE.Vector3();
const initialLookTarget = new THREE.Vector3(0, 16, -120);

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function isGregorianDate(year, month, day) {
  return (
    year > 1582 ||
    (year === 1582 && month > 10) ||
    (year === 1582 && month === 10 && day >= 15)
  );
}

function isLeapYear(year, month = 1, day = 1) {
  if (isGregorianDate(year, month, day)) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  return year % 4 === 0;
}

function daysInMonth(year, month) {
  if (month === 2) {
    return isLeapYear(year, month, 1) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function jdFromGregorianParts({ year, month, day, hour }) {
  return julianDate(year, month, day, hour);
}

function shiftGregorianByMonth(gregorian, monthDelta) {
  const totalMonths = gregorian.year * 12 + (gregorian.month - 1) + monthDelta;
  const year = Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12 + 1;
  const day = Math.min(gregorian.day, daysInMonth(year, month));

  return {
    year,
    month,
    day,
    hour: gregorian.hour,
  };
}

function shiftGregorianByYear(gregorian, yearDelta) {
  const year = gregorian.year + yearDelta;
  const month = gregorian.month;
  const day = Math.min(gregorian.day, daysInMonth(year, month));

  return {
    year,
    month,
    day,
    hour: gregorian.hour,
  };
}

function jumpClock(unit, direction) {
  if (!clock) {
    return;
  }

  if (unit === 'week') {
    setClockJD(clock, getClockJD(clock) + direction * 7);
  } else {
    const gregorian = getClockGregorian(clock);
    const shifted =
      unit === 'month'
        ? shiftGregorianByMonth(gregorian, direction)
        : shiftGregorianByYear(gregorian, direction);
    setClockJD(clock, jdFromGregorianParts(shifted));
  }

  currentLST = localSiderealTime(getClockGMST(clock), OBSERVER_LONGITUDE);
}

function setCameraParent(parent) {
  const nextParent = parent ?? scene;

  if (camera.parent === nextParent) {
    return;
  }

  nextParent.add(camera);
}

function updateCameraLookDirection() {
  camera.rotation.order = 'YXZ';
  camera.rotation.x = lookState.pitch;
  camera.rotation.y = lookState.yaw;
  camera.rotation.z = 0;
}

function updateObserverWorldPosition() {
  scene.updateMatrixWorld(true);
  camera.getWorldPosition(observerWorldPosition);
}

function getSpawnModeLabel() {
  if (!spawnState) {
    return 'unknown';
  }

  return `${spawnState.mode} (${spawnModeOverride ?? 'auto'})`;
}

function disposeMaterial(material) {
  if (!material) {
    return;
  }

  if (Array.isArray(material)) {
    for (const entry of material) {
      entry?.dispose?.();
    }
    return;
  }

  material.dispose?.();
}

function destroyTerrain() {
  if (!terrain) {
    return;
  }

  terrain.mesh.parent?.remove(terrain.mesh);
  terrain.mesh.geometry.dispose();
  terrain.material.dispose();
  terrain = null;
}

function destroyTrees() {
  if (!trees) {
    return;
  }

  trees.trunkMesh.parent?.remove(trees.trunkMesh);
  trees.canopyMesh.parent?.remove(trees.canopyMesh);
  trees.trunkMesh.geometry.dispose();
  trees.canopyMesh.geometry.dispose();
  trees.trunkMaterial.dispose();
  trees.canopyMaterial.dispose();
  trees = null;
}

function destroyWater() {
  if (!water) {
    return;
  }

  water.mesh.parent?.remove(water.mesh);
  water.mesh.geometry.dispose();
  water.material.dispose();
  water = null;
}

function destroyBoat() {
  if (!boat) {
    return;
  }

  const geometries = new Set();
  const materials = new Set();
  boat.root.traverse((child) => {
    if (child.geometry) {
      geometries.add(child.geometry);
    }
    if (child.material) {
      if (Array.isArray(child.material)) {
        for (const material of child.material) {
          materials.add(material);
        }
      } else {
        materials.add(child.material);
      }
    }
  });

  boat.root.parent?.remove(boat.root);

  for (const geometry of geometries) {
    geometry.dispose?.();
  }

  for (const material of materials) {
    disposeMaterial(material);
  }

  boat = null;
}

function destroyWorld() {
  setCameraParent(scene);
  destroyBoat();
  destroyTrees();
  destroyTerrain();
  destroyWater();
  spawnState = null;
}

function buildWorldForCurrentSpawn() {
  destroyWorld();

  const resolvedMode = spawnPlayer(
    landMask,
    OBSERVER_LATITUDE,
    OBSERVER_LONGITUDE,
    null,
    spawnModeOverride
  ).mode;

  if (resolvedMode === 'land') {
    terrain = createTerrain(scene, 1);
    trees = createTrees(scene, terrain, 1);
    water = createWater(scene, LAND_WATER_OPTIONS);
    spawnState = spawnPlayer(
      landMask,
      OBSERVER_LATITUDE,
      OBSERVER_LONGITUDE,
      terrain,
      spawnModeOverride
    );
    setCameraParent(scene);
    camera.position.set(
      spawnState.worldOrigin.x + spawnState.cameraLocalOffset.x,
      spawnState.worldOrigin.y + spawnState.cameraLocalOffset.y,
      spawnState.worldOrigin.z + spawnState.cameraLocalOffset.z
    );
  } else {
    water = createWater(scene, OCEAN_WATER_OPTIONS);
    boat = createBoat(scene, water.level);
    spawnState = spawnPlayer(
      landMask,
      OBSERVER_LATITUDE,
      OBSERVER_LONGITUDE,
      null,
      spawnModeOverride
    );
    setCameraParent(boat.cameraMount);
    camera.position.set(
      spawnState.cameraLocalOffset.x,
      spawnState.cameraLocalOffset.y,
      spawnState.cameraLocalOffset.z
    );
  }

  updateCameraLookDirection();
  updateObserverWorldPosition();
  console.info(`Spawn mode: ${getSpawnModeLabel()}.`);
}

function cycleSpawnModeOverride() {
  const currentIndex = SPAWN_OVERRIDE_SEQUENCE.indexOf(spawnModeOverride);
  const nextIndex = (currentIndex + 1) % SPAWN_OVERRIDE_SEQUENCE.length;
  spawnModeOverride = SPAWN_OVERRIDE_SEQUENCE[nextIndex];
  buildWorldForCurrentSpawn();
}

function initializeLookControls() {
  updateObserverWorldPosition();
  const initialTarget = initialLookTarget.clone().sub(observerWorldPosition).normalize();
  lookState.pitch = Math.asin(clamp(initialTarget.y, -1, 1));
  lookState.yaw = Math.atan2(initialTarget.x, initialTarget.z);
  updateCameraLookDirection();

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }

    lookState.dragging = true;
    renderer.domElement.setPointerCapture(event.pointerId);
  });

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!lookState.dragging) {
      return;
    }

    lookState.yaw -= event.movementX * lookState.sensitivity;
    lookState.pitch = clamp(
      lookState.pitch - event.movementY * lookState.sensitivity,
      -Math.PI / 2 + 0.02,
      Math.PI / 2 - 0.02
    );
    updateCameraLookDirection();
  });

  const endDrag = (event) => {
    if (lookState.dragging) {
      lookState.dragging = false;
    }

    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
  };

  renderer.domElement.addEventListener('pointerup', endDrag);
  renderer.domElement.addEventListener('pointercancel', endDrag);
}

function updateBloomForSky(sunAltitude) {
  const nightBlend = starVisibilityForSunAltitude(sunAltitude);

  if (nightBlend <= 0.001) {
    bloomPass.strength = 0;
    bloomPass.radius = 0;
    bloomPass.threshold = 2;
    return;
  }

  bloomPass.radius = THREE.MathUtils.lerp(0, tuning.bloom.radius, nightBlend);
  bloomPass.threshold = THREE.MathUtils.lerp(2, tuning.bloom.threshold, nightBlend);
  bloomPass.strength = THREE.MathUtils.lerp(0, tuning.bloom.strength, nightBlend);
}

async function init() {
  const [starCatalog, constellationData, loadedLandMask] = await Promise.all([
    loadStarCatalog(),
    loadConstellationData(),
    loadLandMask(),
  ]);
  landMask = loadedLandMask;
  starField = createStarField(scene, starCatalog);
  planets = createPlanets(scene);
  sunMoon = createSunMoon(scene);
  atmosphere = createAtmosphere(scene);
  worldFog = createWorldFog(scene);
  buildWorldForCurrentSpawn();

  polarisMarker = createPolarisMarker(scene, starField);
  constellationLines = createConstellationLines(scene, constellationData, starCatalog);
  hud = createHud();
  debugPanel = createDebugPanel();
  clock = createClock(J2000_JD);
  timeControls = createTimeControls({ onJump: jumpClock });

  const jd = julianDate(2000, 1, 1, 12);

  if (Math.abs(jd - J2000_JD) > 1e-9) {
    throw new Error(`Unexpected J2000 JD: received ${jd}`);
  }

  currentLST = localSiderealTime(getClockGMST(clock), OBSERVER_LONGITUDE);
  initializeLookControls();
  updateObserverWorldPosition();

  updateStarPositions(starField, currentLST, OBSERVER_LATITUDE, 0, observerWorldPosition);
  updateSunMoon(
    sunMoon,
    getClockJD(clock),
    currentLST,
    OBSERVER_LATITUDE,
    OBSERVER_LONGITUDE,
    camera,
    observerWorldPosition
  );
  updatePlanetPositions(
    planets,
    getClockJD(clock),
    currentLST,
    OBSERVER_LATITUDE,
    OBSERVER_LONGITUDE,
    camera,
    observerWorldPosition,
    getSunAltitude(sunMoon)
  );
  const initialMoonPhase = getMoonPhase(sunMoon);
  const initialAtmosphereState = updateAtmosphere(
    atmosphere,
    getSunAltitude(sunMoon),
    sunMoon.sunData?.az ?? 180,
    sunMoon.moonData?.alt ?? -90,
    initialMoonPhase?.illuminatedFraction ?? 0,
    observerWorldPosition
  );
  const initialFogState = updateWorldFog(worldFog, initialAtmosphereState.ambientLevel, spawnState.mode);
  updateStarVisibility(starField, getSunAltitude(sunMoon));
  updateBloomForSky(getSunAltitude(sunMoon));
  if (terrain) {
    updateTerrainLighting(terrain, initialAtmosphereState.ambientLevel);
  }
  updateWater(water, 0, {
    sunAltitude: getSunAltitude(sunMoon),
    sunAzimuth: sunMoon.sunData?.az ?? 180,
    moonAltitude: sunMoon.moonData?.alt ?? -90,
    moonAzimuth: sunMoon.moonData?.az ?? 180,
    moonIlluminatedFraction: initialMoonPhase?.illuminatedFraction ?? 0,
    ambientLevel: initialAtmosphereState.ambientLevel,
    fog: initialFogState,
  });
  if (trees) {
    updateTreesLighting(trees, initialAtmosphereState.ambientLevel);
  }
  if (boat) {
    updateBoatLighting(boat, initialAtmosphereState.ambientLevel);
  }
  updatePolarisMarker(polarisMarker, starField);
  updateConstellationPositions(constellationLines, starField, currentLST, OBSERVER_LATITUDE, 0);
  updateConstellationVisibility(constellationLines, initialAtmosphereState.starVisibility);
  updateHud(hud, {
    jd: getClockJD(clock),
    gregorian: getClockGregorian(clock),
    gmst: getClockGMST(clock),
    lst: currentLST,
    latitude: OBSERVER_LATITUDE,
    longitude: OBSERVER_LONGITUDE,
    speedMultiplier: getClockSpeed(clock),
    paused: isClockPaused(clock),
    fps: 0,
    spawnModeLabel: getSpawnModeLabel(),
    planetLines: formatPlanetHudLines(),
    sunMoonLines: formatSunMoonHudLines(),
  });
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && clock) {
    event.preventDefault();
    setClockPaused(clock, !isClockPaused(clock));
    return;
  }

  if (event.code === 'Minus' || event.code === 'KeyA') {
    if (!clock) {
      return;
    }

    setClockSpeed(clock, -getClockSpeed(clock));
    return;
  }

  if (event.code === 'KeyH' && hud) {
    const visible = toggleHud(hud);
    console.info(`HUD ${visible ? 'shown' : 'hidden'}.`);
    return;
  }

  if (event.code === 'Backquote' && debugPanel) {
    event.preventDefault();
    toggleDebugPanel(debugPanel);
    return;
  }

  if (event.code === 'KeyP') {
    const visible = togglePolarisMarker(polarisMarker);
    console.info(`Polaris marker ${visible ? 'shown' : 'hidden'}.`);
    return;
  }

  if (event.code === 'KeyO' && landMask) {
    cycleSpawnModeOverride();
    return;
  }

  if (SPEED_PRESETS[event.code] && clock) {
    const sign = Math.sign(getClockSpeed(clock)) || 1;
    setClockSpeed(clock, sign * SPEED_PRESETS[event.code]);
    return;
  }

  if (event.code !== 'KeyC' || !constellationLines) {
    return;
  }

  const visible = toggleConstellationLines(constellationLines);
  console.info(`Constellation lines ${visible ? 'shown' : 'hidden'}.`);
});

// --- handle resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
});

// --- game loop ---
function animate(frameTime) {
  requestAnimationFrame(animate);

  const safeFrameTime = Number.isFinite(frameTime) ? frameTime : 0;

  const realDeltaSeconds = lastFrameTime === null ? 0 : (safeFrameTime - lastFrameTime) / 1000;
  lastFrameTime = safeFrameTime;

  if (realDeltaSeconds > 0) {
    const instantaneousFPS = 1 / realDeltaSeconds;
    fps = fps === 0 ? instantaneousFPS : THREE.MathUtils.lerp(fps, instantaneousFPS, 0.12);
  }

  if (clock) {
    tickClock(clock, realDeltaSeconds);
    currentLST = localSiderealTime(getClockGMST(clock), OBSERVER_LONGITUDE);
  }

  if (boat && spawnState?.mode === 'ocean') {
    updateBoatMotion(boat, safeFrameTime * 0.001);
  }

  updateObserverWorldPosition();

  if (starField && clock) {
    updateStarPositions(starField, currentLST, OBSERVER_LATITUDE, getClockT(clock), observerWorldPosition);
    updatePolarisMarker(polarisMarker, starField);
  }

  if (sunMoon && clock) {
    updateSunMoon(
      sunMoon,
      getClockJD(clock),
      currentLST,
      OBSERVER_LATITUDE,
      OBSERVER_LONGITUDE,
      camera,
      observerWorldPosition
    );
  }

  if (planets && clock) {
    updatePlanetPositions(
      planets,
      getClockJD(clock),
      currentLST,
      OBSERVER_LATITUDE,
      OBSERVER_LONGITUDE,
      camera,
      observerWorldPosition,
      getSunAltitude(sunMoon)
    );
  }

  let atmosphereState = null;
  const moonPhase = sunMoon ? getMoonPhase(sunMoon) : null;

  if (atmosphere && sunMoon) {
    atmosphereState = updateAtmosphere(
      atmosphere,
      getSunAltitude(sunMoon),
      sunMoon.sunData?.az ?? 180,
      sunMoon.moonData?.alt ?? -90,
      moonPhase?.illuminatedFraction ?? 0,
      observerWorldPosition
    );
  }

  const fogState = atmosphereState
    ? updateWorldFog(worldFog, atmosphereState.ambientLevel, spawnState?.mode ?? 'land')
    : worldFog?.state ?? null;

  if (starField && sunMoon) {
    updateStarVisibility(starField, getSunAltitude(sunMoon));
  }

  if (sunMoon) {
    updateBloomForSky(getSunAltitude(sunMoon));
  }

  if (terrain && atmosphereState) {
    updateTerrainLighting(terrain, atmosphereState.ambientLevel);
  }

  if (water && sunMoon) {
    updateWater(water, safeFrameTime * 0.001, {
      sunAltitude: getSunAltitude(sunMoon),
      sunAzimuth: sunMoon.sunData?.az ?? 180,
      moonAltitude: sunMoon.moonData?.alt ?? -90,
      moonAzimuth: sunMoon.moonData?.az ?? 180,
      moonIlluminatedFraction: moonPhase?.illuminatedFraction ?? 0,
      ambientLevel: atmosphereState?.ambientLevel ?? 0.08,
      fog: fogState,
    });
  }

  if (trees && atmosphereState) {
    updateTreesLighting(trees, atmosphereState.ambientLevel);
  }

  if (boat && atmosphereState) {
    updateBoatLighting(boat, atmosphereState.ambientLevel);
  }

  if (starField && constellationLines && clock) {
    updateConstellationPositions(
      constellationLines,
      starField,
      currentLST,
      OBSERVER_LATITUDE,
      getClockT(clock)
    );
    updateConstellationVisibility(
      constellationLines,
      atmosphereState?.starVisibility ?? starVisibilityForSunAltitude(getSunAltitude(sunMoon))
    );
  }

  if (hud && clock) {
    updateHud(hud, {
      jd: getClockJD(clock),
      gregorian: getClockGregorian(clock),
      gmst: getClockGMST(clock),
      lst: currentLST,
      latitude: OBSERVER_LATITUDE,
      longitude: OBSERVER_LONGITUDE,
      speedMultiplier: getClockSpeed(clock),
      paused: isClockPaused(clock),
      fps,
      spawnModeLabel: getSpawnModeLabel(),
      planetLines: formatPlanetHudLines(),
      sunMoonLines: formatSunMoonHudLines(),
    });
  }

  if (ENABLE_BLOOM) {
    composer.render();
    return;
  }

  renderer.render(scene, camera);
}

init()
  .then(() => {
    requestAnimationFrame(animate);
  })
  .catch((error) => {
    console.error(error);
  });

function formatPlanetHudLines() {
  if (!planets) {
    return [];
  }

  return getPlanetDebugData(planets).map(
    (planet) =>
      `${planet.name.padEnd(7, ' ')} ra ${planet.ra.toFixed(2)}\u00b0  dec ${planet.dec.toFixed(
        2
      )}\u00b0  alt ${planet.alt.toFixed(2)}\u00b0  az ${planet.az.toFixed(2)}\u00b0`
  );
}

function formatSunMoonHudLines() {
  if (!sunMoon) {
    return [];
  }

  const moonPhase = getMoonPhase(sunMoon);
  const sunAlt = getSunAltitude(sunMoon);
  const lines = [];

  if (sunMoon.sunData) {
    lines.push(
      `sun     ra ${sunMoon.sunData.ra.toFixed(2)}\u00b0  dec ${sunMoon.sunData.dec.toFixed(
        2
      )}\u00b0  alt ${sunAlt.toFixed(2)}\u00b0  az ${sunMoon.sunData.az.toFixed(2)}\u00b0`
    );
  }

  if (sunMoon.moonData && moonPhase) {
    lines.push(
      `moon    ra ${sunMoon.moonData.ra.toFixed(2)}\u00b0  dec ${sunMoon.moonData.dec.toFixed(
        2
      )}\u00b0  alt ${sunMoon.moonData.alt.toFixed(2)}\u00b0  az ${sunMoon.moonData.az.toFixed(
        2
      )}\u00b0  lit ${(moonPhase.illuminatedFraction * 100).toFixed(1)}%`
    );
  }

  return lines;
}

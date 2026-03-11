import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import {
  createAtmosphere,
  updateAtmosphere,
} from './sky/atmosphere.js';
import { computeAttenuation } from './sky/attenuation.js';
import {
  julianDate,
  localSiderealTime,
} from './sky/coordinates.js';
import {
  createConstellationLines,
  destroyConstellationLines,
  loadSkyCultureData,
  SKY_CULTURES,
  toggleConstellationLines,
  updateConstellationVisibility,
  updateConstellationPositions,
} from './sky/constellations.js';
import { createPlanets, getPlanetDebugData, updatePlanetPositions } from './sky/planets.js';
import { createMilkyWay, updateMilkyWay } from './sky/milkyway.js';
import {
  createPolarisMarker,
  createStarField,
  loadStarCatalog,
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
import { createCompass, updateCompass } from './ui/compass.js';
import { createHud, toggleHud, updateHud } from './ui/hud.js';
import { createInputPanel, updateInputPanel } from './ui/input-panel.js';
import { createLabels, updateLabels } from './ui/labels.js';
import { createTimeControls, updateTimeControls } from './ui/time-controls.js';
import { createPlayerCamera, lookPlayerAt, setPlayerSpawn, updatePlayer } from './player/camera.js';
import { spawnPlayer } from './player/spawn.js';
import { createBoat, updateBoatLighting, updateBoatMotion } from './world/boat.js';
import { createWorldFog, updateWorldFog } from './world/fog.js';
import { createTerrain, updateTerrainLighting } from './world/terrain.js';
import { loadLandMask } from './world/land-mask.js';
import { createTrees, updateTreesLighting } from './world/trees.js';
import { createWater, updateWater } from './world/water.js';

// Entry point and temporary scene bootstrap. Systems are scaffolded under src/*
// and will be wired into this orchestrator as milestones are implemented.

const INITIAL_OBSERVER_LATITUDE = 45;
const INITIAL_OBSERVER_LONGITUDE = 0;
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
let milkyWay = null;
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
let compass = null;
let inputPanel = null;
let labels = null;
let timeControls = null;
let player = null;
let currentLST = 0;
let lastFrameTime = null;
let fps = 0;
let spawnState = null;
let spawnModeOverride = null;
let currentSkyCulture = SKY_CULTURES[0];
let observerLatitude = INITIAL_OBSERVER_LATITUDE;
let observerLongitude = INITIAL_OBSERVER_LONGITUDE;
const observerWorldPosition = new THREE.Vector3();
const initialLookTarget = new THREE.Vector3(0, 16, -120);

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

function parseDateInput(value) {
  const match = value.match(/^([+-]?\d+)-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error(`Invalid date format: "${value}". Use YYYY-MM-DD.`);
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Invalid date: "${value}".`);
  }

  if (month < 1 || month > 12) {
    throw new Error(`Month out of range in "${value}".`);
  }

  if (day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Day out of range in "${value}".`);
  }

  return { year, month, day };
}

function deriveWorldSeed(latitude, longitude) {
  let hash = 2166136261;
  const parts = [
    Math.round((latitude + 90) * 10000),
    Math.round((longitude + 180) * 10000),
  ];

  for (const part of parts) {
    hash ^= part >>> 0;
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) || 1;
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
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

  currentLST = localSiderealTime(getClockGMST(clock), observerLongitude);
}

function setCameraParent(parent) {
  const nextParent = parent ?? scene;

  if (camera.parent === nextParent) {
    return;
  }

  nextParent.add(camera);
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

function rebuildConstellationOverlay(constellationData, { preserveEnabled = true } = {}) {
  const wasEnabled = preserveEnabled ? (constellationLines?.enabled ?? false) : false;
  destroyConstellationLines(constellationLines);
  constellationLines = createConstellationLines(scene, constellationData, starField.stars);
  constellationLines.enabled = wasEnabled;
  constellationLines.lines.visible = wasEnabled;
}

function buildWorldForCurrentSpawn() {
  destroyWorld();
  const worldSeed = deriveWorldSeed(observerLatitude, observerLongitude);

  const resolvedMode = spawnPlayer(
    landMask,
    observerLatitude,
    observerLongitude,
    null,
    spawnModeOverride
  ).mode;

  if (resolvedMode === 'land') {
    terrain = createTerrain(scene, worldSeed);
    trees = createTrees(scene, terrain, worldSeed);
    water = createWater(scene, LAND_WATER_OPTIONS);
    spawnState = spawnPlayer(
      landMask,
      observerLatitude,
      observerLongitude,
      terrain,
      spawnModeOverride
    );
    setCameraParent(scene);
  } else {
    water = createWater(scene, OCEAN_WATER_OPTIONS);
    boat = createBoat(scene, water.level);
    spawnState = spawnPlayer(
      landMask,
      observerLatitude,
      observerLongitude,
      null,
      spawnModeOverride
    );
    setCameraParent(boat.cameraMount);
  }

  if (player) {
    setPlayerSpawn(player, spawnState);
  }

  updateObserverWorldPosition();
  console.info(`Spawn mode: ${getSpawnModeLabel()}.`);
}

function syncSceneState(timeSeconds = 0) {
  updateObserverWorldPosition();

  if (starField && clock) {
    updateStarPositions(starField, currentLST, observerLatitude, getClockT(clock), observerWorldPosition);
    updatePolarisMarker(polarisMarker, starField);
  }

  if (sunMoon && clock) {
    updateSunMoon(
      sunMoon,
      getClockJD(clock),
      currentLST,
      observerLatitude,
      observerLongitude,
      camera,
      observerWorldPosition
    );
  }

  if (planets && clock) {
    updatePlanetPositions(
      planets,
      getClockJD(clock),
      currentLST,
      observerLatitude,
      observerLongitude,
      camera,
      observerWorldPosition,
      getSunAltitude(sunMoon)
    );
  }

  if (milkyWay && clock) {
    updateMilkyWay(milkyWay, {
      lst: currentLST,
      latitude: observerLatitude,
      T: getClockT(clock),
      observerPosition: observerWorldPosition,
      sunAltitude: getSunAltitude(sunMoon),
    });
  }

  const moonPhase = sunMoon ? getMoonPhase(sunMoon) : null;
  const atmosphereState =
    atmosphere && sunMoon
      ? updateAtmosphere(
          atmosphere,
          getSunAltitude(sunMoon),
          sunMoon.sunData?.az ?? 180,
          sunMoon.moonData?.alt ?? -90,
          moonPhase?.illuminatedFraction ?? 0,
          observerWorldPosition
        )
      : null;

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
    updateWater(water, timeSeconds, {
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

  if (hud && clock) {
    updateHud(hud, {
      jd: getClockJD(clock),
      gregorian: getClockGregorian(clock),
      gmst: getClockGMST(clock),
      lst: currentLST,
      latitude: observerLatitude,
      longitude: observerLongitude,
      speedMultiplier: getClockSpeed(clock),
      paused: isClockPaused(clock),
      fps,
      spawnModeLabel: getSpawnModeLabel(),
      planetLines: formatPlanetHudLines(),
      sunMoonLines: formatSunMoonHudLines(),
    });
  }

  if (timeControls && clock) {
    updateTimeControls(timeControls, {
      paused: isClockPaused(clock),
      speedMultiplier: getClockSpeed(clock),
    });
  }

  if (inputPanel && clock) {
    updateInputPanel(inputPanel, {
      latitude: observerLatitude,
      longitude: observerLongitude,
      gregorian: getClockGregorian(clock),
      skyCultureId: currentSkyCulture.id,
      skyCultureLabel: currentSkyCulture.label,
    });
  }

  updateCompass(player?.yaw ?? camera.rotation.y);

  if (labels && starField) {
    updateLabels(labels, {
      starField,
      camera,
      sunAltitude: getSunAltitude(sunMoon),
      constellationLines,
    });
  }

  if (starField && constellationLines && clock) {
    updateConstellationPositions(constellationLines, starField, getSunAltitude(sunMoon));
    updateConstellationVisibility(constellationLines);
  }
}

function applyObserverSettings({ latitude, longitude, jd }) {
  observerLatitude = latitude;
  observerLongitude = longitude;
  setClockJD(clock, jd);
  currentLST = localSiderealTime(getClockGMST(clock), observerLongitude);
  buildWorldForCurrentSpawn();
  syncSceneState((lastFrameTime ?? 0) * 0.001);
}

function cycleSpawnModeOverride() {
  const currentIndex = SPAWN_OVERRIDE_SEQUENCE.indexOf(spawnModeOverride);
  const nextIndex = (currentIndex + 1) % SPAWN_OVERRIDE_SEQUENCE.length;
  spawnModeOverride = SPAWN_OVERRIDE_SEQUENCE[nextIndex];
  buildWorldForCurrentSpawn();
}

function updateBloomForSky(sunAltitude) {
  const nightBlend = computeAttenuation(90, sunAltitude, 'stars').brightness;

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
  const [starCatalog, skyCultureData, loadedLandMask] = await Promise.all([
    loadStarCatalog(),
    loadSkyCultureData(currentSkyCulture.id),
    loadLandMask(),
  ]);
  landMask = loadedLandMask;
  currentSkyCulture = skyCultureData;
  starField = createStarField(scene, starCatalog);
  planets = createPlanets(scene);
  milkyWay = await createMilkyWay(scene);
  sunMoon = createSunMoon(scene);
  atmosphere = createAtmosphere(scene);
  worldFog = createWorldFog(scene);
  player = createPlayerCamera(camera, renderer.domElement);
  buildWorldForCurrentSpawn();

  polarisMarker = createPolarisMarker(scene, starField);
  constellationLines = createConstellationLines(scene, skyCultureData.constellations, starCatalog);
  hud = createHud();
  debugPanel = createDebugPanel();
  compass = createCompass();
  labels = createLabels({ starField, planets, sunMoon });
  clock = createClock(J2000_JD);
  inputPanel = createInputPanel({
    skyCultures: SKY_CULTURES,
    onSubmit: ({ latitude, longitude, date, close }) => {
      try {
        const parsedLatitude = Number.parseFloat(latitude);
        const parsedLongitude = Number.parseFloat(longitude);

        if (!Number.isFinite(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90) {
          throw new Error(`Latitude must be between -90 and 90. Received "${latitude}".`);
        }

        if (!Number.isFinite(parsedLongitude) || parsedLongitude < -180 || parsedLongitude > 180) {
          throw new Error(`Longitude must be between -180 and 180. Received "${longitude}".`);
        }

        const parsedDate = parseDateInput(date);
        applyObserverSettings({
          latitude: parsedLatitude,
          longitude: parsedLongitude,
          jd: julianDate(parsedDate.year, parsedDate.month, parsedDate.day, 0),
        });
        close?.();
      } catch (error) {
        console.error(error);
      }
    },
    onSkyCultureChange: async (skyCultureId) => {
      try {
        const skyCulture = await loadSkyCultureData(skyCultureId);
        currentSkyCulture = skyCulture;
        rebuildConstellationOverlay(skyCulture.constellations);
        syncSceneState((lastFrameTime ?? 0) * 0.001);
      } catch (error) {
        console.error(error);
      }
    },
  });
  timeControls = createTimeControls({
    onJump: jumpClock,
    onTogglePause: () => {
      if (!clock) {
        return;
      }

      setClockPaused(clock, !isClockPaused(clock));
    },
    onSpeedChange: (speed) => {
      if (!clock) {
        return;
      }

      const sign = Math.sign(getClockSpeed(clock)) || 1;
      setClockSpeed(clock, sign * speed);
    },
  });

  const jd = julianDate(2000, 1, 1, 12);

  if (Math.abs(jd - J2000_JD) > 1e-9) {
    throw new Error(`Unexpected J2000 JD: received ${jd}`);
  }

  currentLST = localSiderealTime(getClockGMST(clock), observerLongitude);
  updateObserverWorldPosition();
  lookPlayerAt(player, observerWorldPosition, initialLookTarget);
  syncSceneState(0);
}

window.addEventListener('keydown', (event) => {
  if (isEditableTarget(event.target) && event.code !== 'Escape') {
    return;
  }

  if (event.code === 'Minus') {
    if (!clock) {
      return;
    }

    setClockSpeed(clock, -getClockSpeed(clock));
    return;
  }

  if ((event.code === 'KeyH' || event.code === 'Digit9') && hud) {
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
    currentLST = localSiderealTime(getClockGMST(clock), observerLongitude);
  }

  if (boat && spawnState?.mode === 'ocean') {
    updateBoatMotion(boat, safeFrameTime * 0.001);
  }

  if (player && spawnState) {
    updatePlayer(player, {
      terrain,
      spawnState,
      deltaTime: realDeltaSeconds,
    });
  }

  syncSceneState(safeFrameTime * 0.001);

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

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import {
  julianDate,
  localSiderealTime,
} from './sky/coordinates.js';
import {
  createConstellationLines,
  loadConstellationData,
  toggleConstellationLines,
  updateConstellationPositions,
} from './sky/constellations.js';
import {
  createPolarisMarker,
  createStarField,
  loadStarCatalog,
  togglePolarisMarker,
  updatePolarisMarker,
  updateStarPositions,
} from './sky/stars.js';
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
  tickClock,
} from './time/clock.js';
import { createHud, toggleHud, updateHud } from './ui/hud.js';

// Entry point and temporary scene bootstrap. Systems are scaffolded under src/*
// and will be wired into this orchestrator as milestones are implemented.

const OBSERVER_LATITUDE = 45;
const OBSERVER_LONGITUDE = 0;
const J2000_JD = 2451545.0;
const ENABLE_BLOOM = true;
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
  5000                                      // far — must contain celestial sphere
);
camera.position.set(0, 0, 5);

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
  0.85,
  0.35,
  0.92
);
composer.addPass(bloomPass);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.enableZoom = false;
controls.rotateSpeed = -0.35;
controls.target.set(0, 0, 0);

let starField = null;
let constellationLines = null;
let polarisMarker = null;
let clock = null;
let hud = null;
let currentLST = 0;
let lastFrameTime = null;
let fps = 0;

async function init() {
  const [starCatalog, constellationData] = await Promise.all([
    loadStarCatalog(),
    loadConstellationData(),
  ]);
  starField = createStarField(scene, starCatalog);
  polarisMarker = createPolarisMarker(scene, starField);
  constellationLines = createConstellationLines(scene, constellationData, starCatalog);
  hud = createHud();
  clock = createClock(J2000_JD);

  const jd = julianDate(2000, 1, 1, 12);

  if (Math.abs(jd - J2000_JD) > 1e-9) {
    throw new Error(`Unexpected J2000 JD: received ${jd}`);
  }

  currentLST = localSiderealTime(getClockGMST(clock), OBSERVER_LONGITUDE);

  updateStarPositions(starField, currentLST, OBSERVER_LATITUDE, 0, camera.position);
  updatePolarisMarker(polarisMarker, starField);
  updateConstellationPositions(constellationLines, starField, currentLST, OBSERVER_LATITUDE, 0);
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

  if (event.code === 'KeyP') {
    const visible = togglePolarisMarker(polarisMarker);
    console.info(`Polaris marker ${visible ? 'shown' : 'hidden'}.`);
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

  const realDeltaSeconds = lastFrameTime === null ? 0 : (frameTime - lastFrameTime) / 1000;
  lastFrameTime = frameTime;

  if (realDeltaSeconds > 0) {
    const instantaneousFPS = 1 / realDeltaSeconds;
    fps = fps === 0 ? instantaneousFPS : THREE.MathUtils.lerp(fps, instantaneousFPS, 0.12);
  }

  controls.update();

  if (clock) {
    tickClock(clock, realDeltaSeconds);
    currentLST = localSiderealTime(getClockGMST(clock), OBSERVER_LONGITUDE);
  }

  if (starField && clock) {
    updateStarPositions(starField, currentLST, OBSERVER_LATITUDE, getClockT(clock), camera.position);
    updatePolarisMarker(polarisMarker, starField);
  }

  if (starField && constellationLines && clock) {
    updateConstellationPositions(
      constellationLines,
      starField,
      currentLST,
      OBSERVER_LATITUDE,
      getClockT(clock)
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
    animate();
  })
  .catch((error) => {
    console.error(error);
  });

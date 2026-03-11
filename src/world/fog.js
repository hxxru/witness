import * as THREE from 'three';
import { tuning } from '../ui/debug-panel.js';

const LAND_DAY_FOG = new THREE.Color('#d7d5c9');
const LAND_NIGHT_FOG = new THREE.Color('#0a1120');
const OCEAN_DAY_FOG = new THREE.Color('#b8c6d2');
const OCEAN_NIGHT_FOG = new THREE.Color('#07111d');

const FOG_PROFILES = {
  land: {
    dayColor: LAND_DAY_FOG,
    nightColor: LAND_NIGHT_FOG,
    nearNight: 700,
    nearDay: 900,
    farNight: 2200,
    farDay: 3100,
  },
  ocean: {
    dayColor: OCEAN_DAY_FOG,
    nightColor: OCEAN_NIGHT_FOG,
    nearNight: 900,
    nearDay: 1250,
    farNight: 3400,
    farDay: 4400,
  },
};

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function createWorldFog(scene) {
  const fog = new THREE.Fog(LAND_NIGHT_FOG.clone(), FOG_PROFILES.land.nearNight, FOG_PROFILES.land.farNight);
  scene.fog = fog;

  return {
    fog,
    state: {
      mode: 'land',
      color: LAND_NIGHT_FOG.clone(),
      near: FOG_PROFILES.land.nearNight,
      far: FOG_PROFILES.land.farNight,
    },
  };
}

export function updateWorldFog(worldFog, ambientLevel, mode = 'land') {
  const profile = FOG_PROFILES[mode] ?? FOG_PROFILES.land;
  const lightMix = clamp((ambientLevel - 0.04) / 0.91, 0, 1);

  worldFog.fog.color.copy(new THREE.Color().lerpColors(profile.nightColor, profile.dayColor, lightMix));
  worldFog.fog.near = tuning.fog.near;
  worldFog.fog.far = tuning.fog.far;

  worldFog.state.mode = mode;
  worldFog.state.color.copy(worldFog.fog.color);
  worldFog.state.near = worldFog.fog.near;
  worldFog.state.far = worldFog.fog.far;

  return worldFog.state;
}

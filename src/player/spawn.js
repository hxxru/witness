import { isLand } from '../world/land-mask.js';
import { BOAT_WALK_BOUNDS } from '../world/boat.js';

const DEFAULT_LAND_SPAWN = { x: 180, z: 180 };
const LAND_EYE_HEIGHT = 10;
const OCEAN_EYE_HEIGHT = 1.65;

export function spawnPlayer(landMask, latitude, longitude, terrain = null, forcedMode = null) {
  const mode = forcedMode ?? (landMask && isLand(landMask, latitude, longitude) ? 'land' : 'ocean');

  if (mode === 'land') {
    const groundY = terrain ? terrain.heightAt(DEFAULT_LAND_SPAWN.x, DEFAULT_LAND_SPAWN.z) : 0;

    return {
      mode,
      worldOrigin: {
        x: DEFAULT_LAND_SPAWN.x,
        y: groundY,
        z: DEFAULT_LAND_SPAWN.z,
      },
      cameraLocalOffset: { x: 0, y: LAND_EYE_HEIGHT, z: 0 },
      bounds: null,
    };
  }

  return {
    mode,
    worldOrigin: { x: 0, y: 0, z: 0 },
    cameraLocalOffset: { x: 0, y: OCEAN_EYE_HEIGHT, z: 0 },
    bounds: { ...BOAT_WALK_BOUNDS },
  };
}

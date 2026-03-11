import * as THREE from 'three';

export const BOAT_DIMENSIONS = {
  length: 4,
  width: 2,
  baseThickness: 0.18,
  railHeight: 0.3,
  railThickness: 0.12,
  eyeHeight: 1.65,
};

export const BOAT_WALK_BOUNDS = {
  minX: -1.82,
  maxX: 1.82,
  minZ: -0.82,
  maxZ: 0.82,
};

const BOAT_DAY = new THREE.Color('#8b7355');
const BOAT_NIGHT = new THREE.Color('#050505');
const RAIL_DAY = new THREE.Color('#7d674f');
const RAIL_NIGHT = new THREE.Color('#040404');
const BOB_AMPLITUDE = 0.15;
const BOB_PERIOD = 3;
const ROLL_AMPLITUDE = THREE.MathUtils.degToRad(1);
const ROLL_PERIOD = 4;
const ROLL_PHASE = Math.PI / 3;

function createBox(width, height, depth) {
  return new THREE.BoxGeometry(width, height, depth);
}

export function createBoat(scene, waterLevel = 0) {
  const root = new THREE.Group();
  const materials = {
    base: new THREE.MeshLambertMaterial({
      color: BOAT_DAY.clone(),
      flatShading: true,
      fog: true,
    }),
    rail: new THREE.MeshLambertMaterial({
      color: RAIL_DAY.clone(),
      flatShading: true,
      fog: true,
    }),
  };
  const base = new THREE.Mesh(
    createBox(BOAT_DIMENSIONS.length, BOAT_DIMENSIONS.baseThickness, BOAT_DIMENSIONS.width),
    materials.base
  );
  const longRailGeometry = createBox(
    BOAT_DIMENSIONS.length,
    BOAT_DIMENSIONS.railHeight,
    BOAT_DIMENSIONS.railThickness
  );
  const shortRailGeometry = createBox(
    BOAT_DIMENSIONS.railThickness,
    BOAT_DIMENSIONS.railHeight,
    BOAT_DIMENSIONS.width - BOAT_DIMENSIONS.railThickness * 2
  );

  const rails = [
    new THREE.Mesh(longRailGeometry, materials.rail),
    new THREE.Mesh(longRailGeometry, materials.rail),
    new THREE.Mesh(shortRailGeometry, materials.rail),
    new THREE.Mesh(shortRailGeometry, materials.rail),
  ];

  base.position.y = 0;
  base.castShadow = false;
  base.receiveShadow = false;
  root.add(base);

  rails[0].position.set(
    0,
    BOAT_DIMENSIONS.railHeight * 0.5,
    BOAT_DIMENSIONS.width * 0.5 - BOAT_DIMENSIONS.railThickness * 0.5
  );
  rails[1].position.set(
    0,
    BOAT_DIMENSIONS.railHeight * 0.5,
    -BOAT_DIMENSIONS.width * 0.5 + BOAT_DIMENSIONS.railThickness * 0.5
  );
  rails[2].position.set(
    BOAT_DIMENSIONS.length * 0.5 - BOAT_DIMENSIONS.railThickness * 0.5,
    BOAT_DIMENSIONS.railHeight * 0.5,
    0
  );
  rails[3].position.set(
    -BOAT_DIMENSIONS.length * 0.5 + BOAT_DIMENSIONS.railThickness * 0.5,
    BOAT_DIMENSIONS.railHeight * 0.5,
    0
  );

  for (const rail of rails) {
    rail.castShadow = false;
    rail.receiveShadow = false;
    root.add(rail);
  }

  const cameraMount = new THREE.Object3D();
  cameraMount.position.y = BOAT_DIMENSIONS.baseThickness * 0.5;
  root.add(cameraMount);

  root.position.set(0, waterLevel + BOAT_DIMENSIONS.baseThickness * 0.55, 0);
  scene.add(root);

  return {
    root,
    base,
    rails,
    cameraMount,
    materials,
    baseY: root.position.y,
    waterLevel,
    bounds: { ...BOAT_WALK_BOUNDS },
  };
}

export function updateBoatMotion(boat, elapsedSeconds) {
  const bob = Math.sin((elapsedSeconds / BOB_PERIOD) * Math.PI * 2) * BOB_AMPLITUDE;
  const roll =
    Math.sin((elapsedSeconds / ROLL_PERIOD) * Math.PI * 2 + ROLL_PHASE) * ROLL_AMPLITUDE;

  boat.root.position.y = boat.baseY + bob;
  boat.root.rotation.z = roll;
}

export function updateBoatLighting(boat, ambientLevel) {
  const lightMix = Math.min(Math.max((ambientLevel - 0.04) / 0.91, 0), 1);

  boat.materials.base.color.copy(new THREE.Color().lerpColors(BOAT_NIGHT, BOAT_DAY, lightMix));
  boat.materials.rail.color.copy(new THREE.Color().lerpColors(RAIL_NIGHT, RAIL_DAY, lightMix));
}

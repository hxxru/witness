import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { tuning } from '../ui/debug-panel.js';

const TERRAIN_HALF_SIZE = 2000;
const CLUSTER_GRID = 180;
const MAX_CLUSTERS = 180;
const MAX_TREES = 2100;
const DAY_CANOPY = new THREE.Color('#33452d');
const NIGHT_CANOPY = new THREE.Color('#0a1011');
const DAY_TRUNK = new THREE.Color('#5e4936');
const NIGHT_TRUNK = new THREE.Color('#111010');

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createSeededRandom(seed) {
  let state = seed >>> 0;

  return function seededRandom() {
    state += 0x6d2b79f5;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseOffset(seed, offset) {
  return (seed * 0.0001 + offset) * 23.917;
}

function localSlope(terrain, x, z) {
  const sampleDistance = 6;
  const dx = terrain.heightAt(x + sampleDistance, z) - terrain.heightAt(x - sampleDistance, z);
  const dz = terrain.heightAt(x, z + sampleDistance) - terrain.heightAt(x, z - sampleDistance);

  return Math.sqrt(dx * dx + dz * dz) / (sampleDistance * 2);
}

function createTreePlacements(terrain, seed, densityScale, heightScale, clearingRadius) {
  const random = createSeededRandom(seed * 13 + 17);
  const densityNoise = createNoise2D(createSeededRandom(seed * 17 + 23));
  const offsetA = noiseOffset(seed, 5);
  const offsetB = noiseOffset(seed, 13);
  const placements = [];
  const clusterCenters = [];
  const maxClusters = Math.max(1, Math.round(MAX_CLUSTERS * densityScale));
  const maxTrees = Math.max(1, Math.round(MAX_TREES * densityScale));

  for (let x = -TERRAIN_HALF_SIZE + CLUSTER_GRID * 0.5; x < TERRAIN_HALF_SIZE; x += CLUSTER_GRID) {
    for (let z = -TERRAIN_HALF_SIZE + CLUSTER_GRID * 0.5; z < TERRAIN_HALF_SIZE; z += CLUSTER_GRID) {
      if (clusterCenters.length >= maxClusters) {
        break;
      }

      const centerDistance = Math.hypot(x, z);
      if (centerDistance < clearingRadius + 90) {
        continue;
      }

      const density = densityNoise(x * 0.0018 + offsetA, z * 0.0018 - offsetB);
      if (density < -0.08 || random() < 0.08 / Math.max(densityScale, 0.1)) {
        continue;
      }

      const centerX = x + (random() - 0.5) * 90;
      const centerZ = z + (random() - 0.5) * 90;
      const centerSlope = localSlope(terrain, centerX, centerZ);

      if (centerSlope > 0.42) {
        continue;
      }

      clusterCenters.push({ x: centerX, z: centerZ, density });
    }
  }

  for (const center of clusterCenters) {
    const count = Math.max(1, Math.round((4 + Math.floor(random() * 8)) * densityScale));
    const clusterRadius = 18 + random() * 42;

    for (let index = 0; index < count; index += 1) {
      if (placements.length >= maxTrees) {
        break;
      }

      const angle = random() * Math.PI * 2;
      const radius = clusterRadius * Math.sqrt(random());
      const x = center.x + Math.cos(angle) * radius;
      const z = center.z + Math.sin(angle) * radius;

      if (Math.hypot(x, z) < clearingRadius) {
        continue;
      }

      const slope = localSlope(terrain, x, z);
      if (slope > 0.5) {
        continue;
      }

      const height = terrain.heightAt(x, z);
      const trunkHeight = (4.8 + random() * 4.2) * heightScale;
      const canopyHeight = (8 + random() * 6) * heightScale;
      const canopyRadius = 2.4 + random() * 2.2;
      const yaw = random() * Math.PI * 2;

      placements.push({
        x,
        y: height,
        z,
        yaw,
        trunkHeight,
        canopyHeight,
        canopyRadius,
      });
    }
  }

  return placements;
}

function applyPlacement(mesh, index, position, scale, rotationY, dummy) {
  dummy.position.copy(position);
  dummy.rotation.set(0, rotationY, 0);
  dummy.scale.copy(scale);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

export function createTrees(scene, terrain, seed = 1) {
  const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.28, 1, 6, 1, false);
  const canopyGeometry = new THREE.ConeGeometry(1, 1, 7, 1, false);
  const trunkMaterial = new THREE.MeshLambertMaterial({
    color: DAY_TRUNK.clone(),
    flatShading: true,
    fog: true,
  });
  const canopyMaterial = new THREE.MeshLambertMaterial({
    color: DAY_CANOPY.clone(),
    flatShading: true,
    fog: true,
  });
  const tuningSnapshot = {
    density: tuning.trees.density,
    heightScale: tuning.trees.heightScale,
    clearingRadius: tuning.trees.clearingRadius,
  };
  const placements = createTreePlacements(
    terrain,
    seed,
    tuningSnapshot.density,
    tuningSnapshot.heightScale,
    tuningSnapshot.clearingRadius
  );
  const trunkMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, placements.length);
  const canopyMesh = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, placements.length);
  const dummy = new THREE.Object3D();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  trunkMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  canopyMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  for (let index = 0; index < placements.length; index += 1) {
    const tree = placements[index];

    position.set(tree.x, tree.y + tree.trunkHeight * 0.5, tree.z);
    scale.set(1, tree.trunkHeight, 1);
    applyPlacement(trunkMesh, index, position, scale, tree.yaw, dummy);

    position.set(tree.x, tree.y + tree.trunkHeight + tree.canopyHeight * 0.42, tree.z);
    scale.set(tree.canopyRadius, tree.canopyHeight, tree.canopyRadius);
    applyPlacement(canopyMesh, index, position, scale, tree.yaw, dummy);
  }

  trunkMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.instanceMatrix.needsUpdate = true;
  trunkMesh.frustumCulled = false;
  canopyMesh.frustumCulled = false;
  scene.add(trunkMesh);
  scene.add(canopyMesh);

  return {
    seed,
    terrain,
    trunkMesh,
    canopyMesh,
    trunkMaterial,
    canopyMaterial,
    placements,
    tuningSnapshot,
  };
}

export function regenerateTrees(trees, terrain = trees.terrain, seed = trees.seed) {
  const scene = trees.trunkMesh.parent;

  trees.trunkMesh.geometry.dispose();
  trees.canopyMesh.geometry.dispose();
  trees.trunkMaterial.dispose();
  trees.canopyMaterial.dispose();
  scene.remove(trees.trunkMesh);
  scene.remove(trees.canopyMesh);

  const nextTrees = createTrees(scene, terrain, seed);
  Object.assign(trees, nextTrees);
}

export function updateTreesLighting(trees, ambientLevel) {
  if (
    trees.tuningSnapshot.density !== tuning.trees.density ||
    trees.tuningSnapshot.heightScale !== tuning.trees.heightScale ||
    trees.tuningSnapshot.clearingRadius !== tuning.trees.clearingRadius
  ) {
    regenerateTrees(trees);
  }

  const lightMix = clamp((ambientLevel - 0.04) / 0.91, 0, 1);

  trees.canopyMaterial.color.copy(new THREE.Color().lerpColors(NIGHT_CANOPY, DAY_CANOPY, lightMix));
  trees.trunkMaterial.color.copy(new THREE.Color().lerpColors(NIGHT_TRUNK, DAY_TRUNK, lightMix));
}

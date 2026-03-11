import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

const TERRAIN_SIZE = 4000;
const TERRAIN_SEGMENTS = 180;
const BASE_ELEVATION = 10;
const DAY_TINT = new THREE.Color('#f3e6ca');
const NIGHT_TINT = new THREE.Color('#31425f');
const GRASS_LOW = new THREE.Color('#738167');
const GRASS_MID = new THREE.Color('#7f8167');
const SLOPE_BROWN = new THREE.Color('#8b745c');
const HIGH_GREY = new THREE.Color('#8f8e8b');

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
  return (seed * 0.0001 + offset) * 17.173;
}

function createHeightSampler(seed) {
  const random = createSeededRandom(seed);
  const noise2D = createNoise2D(random);
  const offsetA = noiseOffset(seed, 11);
  const offsetB = noiseOffset(seed, 37);
  const offsetC = noiseOffset(seed, 71);

  return function sampleHeight(x, z) {
    const broad = noise2D(x * 0.00042 + offsetA, z * 0.00042 - offsetA) * 24;
    const rolling = noise2D(x * 0.0011 - offsetB, z * 0.0011 + offsetB) * 9.5;
    const detail = noise2D(x * 0.0031 + offsetC, z * 0.0031 - offsetC) * 2.8;
    const basin = noise2D(x * 0.00018 - offsetB, z * 0.00018 + offsetA);
    const uplift = Math.max(0, basin) * 7.5;

    return BASE_ELEVATION + broad + rolling + detail + uplift;
  };
}

function faceColorFor(height, slope) {
  const normalizedHeight = clamp((height + 10) / 65, 0, 1);
  const slopeMix = clamp(slope * 1.8, 0, 1);
  const heightMix = clamp((normalizedHeight - 0.25) / 0.75, 0, 1);
  const meadow = new THREE.Color().lerpColors(GRASS_LOW, GRASS_MID, normalizedHeight * 0.8);
  const rocky = new THREE.Color().lerpColors(SLOPE_BROWN, HIGH_GREY, heightMix);

  return meadow.lerp(rocky, slopeMix).lerp(HIGH_GREY, clamp((normalizedHeight - 0.68) * 1.5, 0, 1));
}

function buildTerrainGeometry(heightAt) {
  const baseGeometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS
  );
  baseGeometry.rotateX(-Math.PI / 2);

  const position = baseGeometry.attributes.position;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    position.setY(index, heightAt(x, z));
  }

  baseGeometry.computeVertexNormals();

  const geometry = baseGeometry.toNonIndexed();
  geometry.computeVertexNormals();

  const colorAttribute = new Float32Array(geometry.attributes.position.count * 3);
  const colors = new THREE.BufferAttribute(colorAttribute, 3);
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const faceColor = new THREE.Color();

  for (let index = 0; index < positions.count; index += 3) {
    const averageHeight =
      (positions.getY(index) + positions.getY(index + 1) + positions.getY(index + 2)) / 3;
    const slope = 1 - Math.abs(normals.getY(index));
    faceColor.copy(faceColorFor(averageHeight, slope));

    for (let corner = 0; corner < 3; corner += 1) {
      colors.setXYZ(index + corner, faceColor.r, faceColor.g, faceColor.b);
    }
  }

  geometry.setAttribute('color', colors);

  return geometry;
}

export function createTerrain(scene, seed = 1) {
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide,
    fog: true,
  });
  const terrain = {
    seed,
    scene,
    material,
    mesh: null,
    heightAt: createHeightSampler(seed),
  };

  const geometry = buildTerrainGeometry(terrain.heightAt);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  scene.add(mesh);
  terrain.mesh = mesh;

  updateTerrainLighting(terrain, 0.08);

  return terrain;
}

export function getHeightAt(terrain, x, z) {
  return terrain.heightAt(x, z);
}

export function regenerateTerrain(terrain, seed) {
  terrain.seed = seed;
  terrain.heightAt = createHeightSampler(seed);

  const nextGeometry = buildTerrainGeometry(terrain.heightAt);
  terrain.mesh.geometry.dispose();
  terrain.mesh.geometry = nextGeometry;
}

export function updateTerrainLighting(terrain, ambientLevel) {
  const lightMix = clamp((ambientLevel - 0.04) / 0.91, 0, 1);

  terrain.material.color.copy(new THREE.Color().lerpColors(NIGHT_TINT, DAY_TINT, lightMix));
}

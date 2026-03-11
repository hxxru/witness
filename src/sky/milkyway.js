import * as THREE from 'three';

import { computeAttenuation } from './attenuation.js';
import { equatorialToHorizontal, horizontalToCartesian, precessRADec } from './coordinates.js';
import { tuning } from '../ui/debug-panel.js';

const MILKY_WAY_RADIUS = 998;
const WIDTH_SEGMENTS = 256;
const HEIGHT_SEGMENTS = 128;

function buildMilkyWayGeometry(radius, widthSegments, heightSegments) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const equatorial = [];
  const attenuationBrightness = [];
  const attenuationTint = [];

  for (let y = 0; y <= heightSegments; y += 1) {
    const v = y / heightSegments;
    const decDegrees = 90 - v * 180;
    const dec = THREE.MathUtils.degToRad(decDegrees);
    const cosDec = Math.cos(dec);
    const sinDec = Math.sin(dec);

    for (let x = 0; x <= widthSegments; x += 1) {
      const u = x / widthSegments;
      const raDegrees = u * 360;
      const ra = THREE.MathUtils.degToRad(raDegrees);
      const cosRa = Math.cos(ra);
      const sinRa = Math.sin(ra);

      positions.push(radius * cosDec * cosRa, radius * sinDec, radius * cosDec * sinRa);
      uvs.push(u, v);
      equatorial.push(raDegrees, decDegrees);
      attenuationBrightness.push(0);
      attenuationTint.push(1, 1, 1);
    }
  }

  for (let y = 0; y < heightSegments; y += 1) {
    for (let x = 0; x < widthSegments; x += 1) {
      const a = y * (widthSegments + 1) + x;
      const b = a + widthSegments + 1;
      const c = b + 1;
      const d = a + 1;

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.setAttribute('equatorial', new THREE.Float32BufferAttribute(equatorial, 2));
  geometry.setAttribute('attenuationBrightness', new THREE.Float32BufferAttribute(attenuationBrightness, 1));
  geometry.setAttribute('attenuationTint', new THREE.Float32BufferAttribute(attenuationTint, 3));
  geometry.computeBoundingSphere();

  return geometry;
}

async function loadTexture(url) {
  const loader = new THREE.TextureLoader();
  const texture = await loader.loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.flipY = true;
  return texture;
}

export async function createMilkyWay(scene, url = '/data/ESA_Gaia.png') {
  const geometry = buildMilkyWayGeometry(MILKY_WAY_RADIUS, WIDTH_SEGMENTS, HEIGHT_SEGMENTS);
  const texture = await loadTexture(url);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      milkyWayMap: { value: texture },
      brightness: { value: tuning.milkyWay.brightness },
      desaturation: { value: tuning.milkyWay.desaturation },
      texelSize: { value: new THREE.Vector2(1 / texture.image.width, 1 / texture.image.height) },
      coolTint: { value: new THREE.Vector3(0.8, 0.85, 1.0) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vAttenuationBrightness;
      varying vec3 vAttenuationTint;

      attribute float attenuationBrightness;
      attribute vec3 attenuationTint;

      void main() {
        vUv = uv;
        vAttenuationBrightness = attenuationBrightness;
        vAttenuationTint = attenuationTint;
        vec4 worldPosition = vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D milkyWayMap;
      uniform float brightness;
      uniform float desaturation;
      uniform vec2 texelSize;
      uniform vec3 coolTint;

      varying vec2 vUv;
      varying float vAttenuationBrightness;
      varying vec3 vAttenuationTint;

      vec3 sampleSoft(vec2 uv) {
        vec2 dx = vec2(texelSize.x * 1.5, 0.0);
        vec2 dy = vec2(0.0, texelSize.y * 1.5);
        vec3 center = texture2D(milkyWayMap, uv).rgb * 0.4;
        vec3 neighbors =
          texture2D(milkyWayMap, uv + dx).rgb * 0.15 +
          texture2D(milkyWayMap, uv - dx).rgb * 0.15 +
          texture2D(milkyWayMap, uv + dy).rgb * 0.15 +
          texture2D(milkyWayMap, uv - dy).rgb * 0.15;
        return center + neighbors;
      }

      void main() {
        vec3 sampled = sampleSoft(vUv);
        float luminance = dot(sampled, vec3(0.299, 0.587, 0.114));
        vec3 monochrome = vec3(luminance);
        float clampedDesaturation = clamp(desaturation, 0.0, 1.0);
        vec3 haze = mix(sampled, monochrome, clampedDesaturation);
        haze = mix(haze, monochrome * coolTint, clamp(desaturation - 1.0, 0.0, 1.0));
        float emission = luminance * brightness * vAttenuationBrightness * 18.0;

        gl_FragColor = vec4(haze * vAttenuationTint * emission, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);

  return {
    mesh,
    material,
    texture,
    positions: geometry.getAttribute('position'),
    equatorial: geometry.getAttribute('equatorial'),
    attenuationBrightness: geometry.getAttribute('attenuationBrightness'),
    attenuationTint: geometry.getAttribute('attenuationTint'),
  };
}

export function updateMilkyWay(
  milkyWay,
  { lst, latitude, T, observerPosition = null, sunAltitude = -90 }
) {
  if (!milkyWay) {
    return;
  }
  const originX = observerPosition?.x ?? 0;
  const originY = observerPosition?.y ?? 0;
  const originZ = observerPosition?.z ?? 0;
  const vertexCount = milkyWay.positions.count;

  for (let index = 0; index < vertexCount; index += 1) {
    const ra = milkyWay.equatorial.getX(index);
    const dec = milkyWay.equatorial.getY(index);
    const precessed = precessRADec(ra, dec, T);
    const horizontal = equatorialToHorizontal(precessed.ra, precessed.dec, lst, latitude);
    const cartesian = horizontalToCartesian(horizontal.alt, horizontal.az, MILKY_WAY_RADIUS);
    const attenuation = computeAttenuation(horizontal.alt, sunAltitude, 'stars');

    milkyWay.positions.setXYZ(
      index,
      cartesian.x + originX,
      cartesian.y + originY,
      cartesian.z + originZ
    );
    milkyWay.attenuationBrightness.setX(index, attenuation.brightness);
    milkyWay.attenuationTint.setXYZ(index, attenuation.tint.r, attenuation.tint.g, attenuation.tint.b);
  }

  milkyWay.positions.needsUpdate = true;
  milkyWay.attenuationBrightness.needsUpdate = true;
  milkyWay.attenuationTint.needsUpdate = true;
  milkyWay.mesh.geometry.computeBoundingSphere();

  milkyWay.material.uniforms.brightness.value = tuning.milkyWay.brightness;
  milkyWay.material.uniforms.desaturation.value = tuning.milkyWay.desaturation;
}

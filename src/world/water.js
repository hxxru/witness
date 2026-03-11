import * as THREE from 'three';
import { tuning } from '../ui/debug-panel.js';

const WATER_LEVEL = 0;
const DEGREES_TO_RADIANS = Math.PI / 180;

const DEFAULT_OPTIONS = {
  size: 5200,
  segments: 224,
  waterDay: '#597995',
  waterNight: '#060c14',
  fogColor: '#0a1120',
  fogNear: 700,
  fogFar: 3100,
};

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function directionFromHorizontal(altitude, azimuth) {
  const altitudeRadians = altitude * DEGREES_TO_RADIANS;
  const azimuthRadians = azimuth * DEGREES_TO_RADIANS;
  const cosAltitude = Math.cos(altitudeRadians);

  return new THREE.Vector3(
    cosAltitude * Math.cos(azimuthRadians),
    Math.sin(altitudeRadians),
    cosAltitude * Math.sin(azimuthRadians)
  ).normalize();
}

export function createWater(scene, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const geometry = new THREE.PlaneGeometry(config.size, config.size, config.segments, config.segments);
  geometry.rotateX(-Math.PI / 2);

  const uniforms = {
    time: { value: 0 },
    sunAltitude: { value: -90 },
    sunDirection: { value: new THREE.Vector3(0, -1, 0) },
    moonAltitude: { value: -90 },
    moonDirection: { value: new THREE.Vector3(0, -1, 0) },
    moonIlluminatedFraction: { value: 0 },
    ambientLevel: { value: 0.08 },
    rippleAmplitude: { value: tuning.water.rippleAmplitude },
    rippleSpeed: { value: tuning.water.rippleSpeed },
    reflectivity: { value: tuning.water.reflectivity },
    fogColor: { value: new THREE.Color(config.fogColor) },
    fogNear: { value: config.fogNear },
    fogFar: { value: config.fogFar },
    zenithDay: { value: new THREE.Color('#5e98ff') },
    horizonDay: { value: new THREE.Color('#d8efff') },
    zenithTwilight: { value: new THREE.Color('#11315e') },
    horizonTwilight: { value: new THREE.Color('#ff9f54') },
    zenithNight: { value: new THREE.Color('#02050d') },
    horizonNight: { value: new THREE.Color('#0d1d36') },
    waterDay: { value: new THREE.Color(config.waterDay) },
    waterNight: { value: new THREE.Color(config.waterNight) },
    twilightTint: { value: new THREE.Color('#ff9f54') },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    lights: false,
    transparent: false,
    depthWrite: true,
    vertexShader: `
      uniform float time;
      uniform float rippleAmplitude;
      uniform float rippleSpeed;

      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying float vRipple;

      #include <fog_pars_vertex>

      float waveHeight(vec2 surfaceCoords, float t) {
        float swell = sin(surfaceCoords.x * 0.010 + t * 0.33) * 0.70;
        float cross = cos(surfaceCoords.y * 0.013 - t * 0.27) * 0.45;
        float diagonal = sin((surfaceCoords.x + surfaceCoords.y) * 0.008 + t * 0.19) * 0.35;
        float shimmer =
          sin(surfaceCoords.x * 0.036 - t * 0.92) *
          cos(surfaceCoords.y * 0.031 + t * 0.64) *
          0.16;
        return swell + cross + diagonal + shimmer;
      }

      vec2 waveDerivatives(vec2 surfaceCoords, float t) {
        float dHdX =
          cos(surfaceCoords.x * 0.010 + t * 0.33) * 0.010 * 0.70 +
          cos((surfaceCoords.x + surfaceCoords.y) * 0.008 + t * 0.19) * 0.008 * 0.35 +
          cos(surfaceCoords.x * 0.036 - t * 0.92) *
            0.036 *
            cos(surfaceCoords.y * 0.031 + t * 0.64) *
            0.16;
        float dHdZ =
          -sin(surfaceCoords.y * 0.013 - t * 0.27) * 0.013 * 0.45 +
          cos((surfaceCoords.x + surfaceCoords.y) * 0.008 + t * 0.19) * 0.008 * 0.35 +
          sin(surfaceCoords.x * 0.036 - t * 0.92) *
            -sin(surfaceCoords.y * 0.031 + t * 0.64) *
            0.031 *
            0.16;

        return vec2(dHdX, dHdZ);
      }

      void main() {
        vec3 displacedPosition = position;
        float animatedTime = time * rippleSpeed;
        float ripple = waveHeight(position.xz, animatedTime) * rippleAmplitude;
        displacedPosition.y += ripple;

        vec2 derivatives = waveDerivatives(position.xz, animatedTime) * rippleAmplitude;
        vec3 objectNormal = normalize(vec3(-derivatives.x, 1.0, -derivatives.y));
        vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);

        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        vRipple = ripple;

        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;

        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float sunAltitude;
      uniform vec3 sunDirection;
      uniform float moonAltitude;
      uniform vec3 moonDirection;
      uniform float moonIlluminatedFraction;
      uniform float ambientLevel;
      uniform float reflectivity;
      uniform vec3 zenithDay;
      uniform vec3 horizonDay;
      uniform vec3 zenithTwilight;
      uniform vec3 horizonTwilight;
      uniform vec3 zenithNight;
      uniform vec3 horizonNight;
      uniform vec3 waterDay;
      uniform vec3 waterNight;
      uniform vec3 twilightTint;

      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying float vRipple;

      #include <fog_pars_fragment>

      float remap(float value, float minimum, float maximum) {
        return clamp((value - minimum) / (maximum - minimum), 0.0, 1.0);
      }

      float smoothBand(float minimum, float maximum, float value) {
        float t = remap(value, minimum, maximum);
        return t * t * (3.0 - 2.0 * t);
      }

      vec3 skyColorForDirection(vec3 direction, float dayAmount, float twilightAmount) {
        float up = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
        float zenithMix = pow(up, 0.55);
        float horizonBand = pow(1.0 - clamp(abs(direction.y), 0.0, 1.0), 1.65);

        vec3 nightColor = mix(horizonNight, zenithNight, zenithMix);
        vec3 twilightColor = mix(horizonTwilight, zenithTwilight, zenithMix);
        vec3 dayColor = mix(horizonDay, zenithDay, zenithMix);
        vec3 color = nightColor;
        color = mix(color, twilightColor, twilightAmount);
        color = mix(color, dayColor, dayAmount);

        vec2 dirXZ = normalize(direction.xz + vec2(1e-6, 0.0));
        vec2 sunXZ = normalize(sunDirection.xz + vec2(1e-6, 0.0));
        float horizonFacing = max(dot(dirXZ, sunXZ), 0.0);
        float twilightBand = horizonBand * pow(horizonFacing, 2.0) * twilightAmount;
        float dayHaze = horizonBand * remap(sunAltitude, -6.0, 25.0) * 0.38;
        float nightHaze = horizonBand * (1.0 - dayAmount) * 0.08;
        float sunHaloExponent = mix(500.0, 100.0, remap(abs(sunAltitude), 0.0, 45.0));
        float sunDisc = pow(max(dot(direction, normalize(sunDirection)), 0.0), 700.0);
        float sunHalo = pow(max(dot(direction, normalize(sunDirection)), 0.0), sunHaloExponent);

        color += twilightTint * twilightBand * (0.55 + 0.45 * (1.0 - up));
        color += vec3(1.0, 0.96, 0.82) * sunDisc * 1.6;
        color += vec3(1.0, 0.84, 0.62) * sunHalo * (0.35 + dayAmount * 0.65);
        color += horizonDay * dayHaze;
        color += horizonNight * nightHaze;

        return color;
      }

      void main() {
        float dayAmount = smoothBand(-6.0, 8.0, sunAltitude);
        float twilightAmount = clamp(
          smoothBand(-18.0, -3.0, sunAltitude) - smoothBand(-3.0, 8.0, sunAltitude),
          0.0,
          1.0
        );

        vec3 normal = normalize(vWorldNormal);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        vec3 reflectionDirection = reflect(-viewDirection, normal);
        vec3 reflectedSky = skyColorForDirection(reflectionDirection, dayAmount, twilightAmount);

        float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.2);
        float glint = pow(max(dot(reflectionDirection, normalize(sunDirection)), 0.0), 180.0);
        float moonNightFactor = (1.0 - dayAmount) * smoothBand(-8.0, 16.0, moonAltitude);
        float moonGlint = pow(max(dot(reflectionDirection, normalize(moonDirection)), 0.0), 220.0);
        float horizonSheen = pow(1.0 - abs(reflectionDirection.y), 2.8);
        float rippleShade = 0.95 + vRipple * 0.035;

        vec3 waterBase = mix(waterNight, waterDay, dayAmount);
        waterBase = mix(waterBase, waterBase + twilightTint * 0.08, twilightAmount);
        waterBase *= 0.65 + ambientLevel * 0.55;

        vec3 color = mix(waterBase, reflectedSky * 0.52, (0.30 + fresnel * 0.58) * reflectivity);
        color += reflectedSky * horizonSheen * (0.05 + dayAmount * 0.07) * reflectivity;
        color += vec3(1.0, 0.9, 0.72) * glint * (0.14 + dayAmount * 0.18) * reflectivity;
        color +=
          vec3(0.88, 0.92, 1.0) *
          moonGlint *
          moonNightFactor *
          moonIlluminatedFraction *
          0.42 *
          reflectivity;
        color *= rippleShade;

        gl_FragColor = vec4(color, 1.0);

        #include <fog_fragment>
      }
    `,
  });
  material.toneMapped = true;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = WATER_LEVEL;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  scene.add(mesh);

  return {
    mesh,
    material,
    uniforms,
    config,
    level: WATER_LEVEL,
    state: {
      time: 0,
      sunAltitude: -90,
      ambientLevel: 0.08,
    },
  };
}

export function updateWater(
  water,
  time,
  {
    sunAltitude = water.state.sunAltitude,
    sunAzimuth = 180,
    moonAltitude = -90,
    moonAzimuth = 180,
    moonIlluminatedFraction = 0,
    ambientLevel = water.state.ambientLevel,
    fog = null,
  } = {}
) {
  water.uniforms.time.value = time;
  water.uniforms.sunAltitude.value = sunAltitude;
  water.uniforms.sunDirection.value.copy(directionFromHorizontal(sunAltitude, sunAzimuth));
  water.uniforms.moonAltitude.value = moonAltitude;
  water.uniforms.moonDirection.value.copy(directionFromHorizontal(moonAltitude, moonAzimuth));
  water.uniforms.moonIlluminatedFraction.value = moonIlluminatedFraction;
  water.uniforms.ambientLevel.value = ambientLevel;
  water.uniforms.rippleAmplitude.value = tuning.water.rippleAmplitude;
  water.uniforms.rippleSpeed.value = tuning.water.rippleSpeed;
  water.uniforms.reflectivity.value = tuning.water.reflectivity;

  if (fog) {
    water.uniforms.fogColor.value.copy(fog.color);
    water.uniforms.fogNear.value = fog.near;
    water.uniforms.fogFar.value = fog.far;
  }

  water.state.time = time;
  water.state.sunAltitude = sunAltitude;
  water.state.ambientLevel = ambientLevel;
}

import * as THREE from 'three';
import { computeAttenuation } from './attenuation.js';
import { tuning } from '../ui/debug-panel.js';

const ATMOSPHERE_RADIUS = 4200;
const ZENITH_DAY = new THREE.Color('#5e98ff');
const HORIZON_DAY = new THREE.Color('#d8efff');
const ZENITH_TWILIGHT = new THREE.Color('#11315e');
const HORIZON_TWILIGHT = new THREE.Color('#ff9f54');
const ZENITH_NIGHT = new THREE.Color('#02050d');
const HORIZON_NIGHT = new THREE.Color('#0d1d36');
const SUN_GLOW = new THREE.Color('#ffd59a');
const TWILIGHT_GLOW = new THREE.Color('#ff7a3d');
const DEGREES_TO_RADIANS = Math.PI / 180;

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

function lightingStateForSky(sunAltitude, moonAltitude, moonIlluminatedFraction) {
  const daylight = smoothstep(-10, 6, sunAltitude);
  const twilightAmount = clamp(
    smoothstep(-18, -3, sunAltitude) - smoothstep(-3, 8, sunAltitude),
    0,
    1
  );
  const starVisibility = computeAttenuation(90, sunAltitude, 'stars').brightness;
  const starAmbient = starVisibility * tuning.atmosphere.nighttimeAmbientGlow;
  const moonAmbient =
    starVisibility *
    smoothstep(-8, 20, moonAltitude) *
    clamp(moonIlluminatedFraction, 0, 1) *
    tuning.atmosphere.moonglow;
  const ambientLevel = clamp(0.02 + daylight * 0.78 + twilightAmount * 0.055 + starAmbient + moonAmbient, 0.02, 0.95);

  return {
    daylight,
    twilightAmount,
    starVisibility,
    starAmbient,
    moonAmbient,
    ambientLevel,
  };
}

export function createAtmosphere(scene) {
  const uniforms = {
    sunDirection: { value: new THREE.Vector3(0, 1, 0) },
    sunAltitude: { value: -90 },
    dayAmount: { value: 0 },
    twilightAmount: { value: 0 },
    zenithDay: { value: ZENITH_DAY.clone() },
    horizonDay: { value: HORIZON_DAY.clone() },
    zenithTwilight: { value: ZENITH_TWILIGHT.clone() },
    horizonTwilight: { value: HORIZON_TWILIGHT.clone() },
    zenithNight: { value: ZENITH_NIGHT.clone() },
    horizonNight: { value: HORIZON_NIGHT.clone() },
    sunGlowColor: { value: SUN_GLOW.clone() },
    twilightGlowColor: { value: TWILIGHT_GLOW.clone() },
    twilightIntensity: { value: tuning.atmosphere.twilightIntensity },
  };
  const geometry = new THREE.SphereGeometry(ATMOSPHERE_RADIUS, 48, 32);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms,
    vertexShader: `
      varying vec3 vDirection;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vDirection = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vDirection;

      uniform vec3 sunDirection;
      uniform float sunAltitude;
      uniform float dayAmount;
      uniform float twilightAmount;
      uniform vec3 zenithDay;
      uniform vec3 horizonDay;
      uniform vec3 zenithTwilight;
      uniform vec3 horizonTwilight;
      uniform vec3 zenithNight;
      uniform vec3 horizonNight;
      uniform vec3 sunGlowColor;
      uniform vec3 twilightGlowColor;
      uniform float twilightIntensity;

      float remap(float value, float minimum, float maximum) {
        return clamp((value - minimum) / (maximum - minimum), 0.0, 1.0);
      }

      void main() {
        vec3 direction = normalize(vDirection);
        float up = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
        float zenithMix = pow(up, 0.55);
        float horizonBand = pow(1.0 - clamp(abs(direction.y), 0.0, 1.0), 1.65);

        vec3 nightColor = mix(horizonNight, zenithNight, zenithMix);
        vec3 twilightColor = mix(horizonTwilight, zenithTwilight, zenithMix);
        vec3 dayColor = mix(horizonDay, zenithDay, zenithMix);
        vec3 baseColor = nightColor;
        baseColor = mix(baseColor, twilightColor, twilightAmount);
        baseColor = mix(baseColor, dayColor, dayAmount);

        vec2 dirXZ = normalize(direction.xz + vec2(1e-6, 0.0));
        vec2 sunXZ = normalize(sunDirection.xz + vec2(1e-6, 0.0));
        float horizonFacing = max(dot(dirXZ, sunXZ), 0.0);
        float sunHaloExponent = mix(500.0, 100.0, remap(abs(sunAltitude), 0.0, 45.0));
        float sunDisc = pow(max(dot(direction, normalize(sunDirection)), 0.0), 700.0);
        float sunHalo = pow(max(dot(direction, normalize(sunDirection)), 0.0), sunHaloExponent);
        float twilightBand = horizonBand * pow(horizonFacing, 2.0) * twilightAmount;
        float dayHaze = horizonBand * remap(sunAltitude, -6.0, 25.0) * 0.38;
        float nightHaze = horizonBand * (1.0 - dayAmount) * 0.08;

        vec3 color = baseColor;
        color += twilightGlowColor * twilightBand * twilightIntensity * (0.55 + 0.45 * (1.0 - up));
        color += sunGlowColor * sunHalo * (0.35 + dayAmount * 0.65);
        color += vec3(1.0, 0.96, 0.82) * sunDisc * 1.6;
        color += horizonDay * dayHaze;
        color += horizonNight * nightHaze;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.frustumCulled = false;
  scene.add(dome);

  const hemisphereLight = new THREE.HemisphereLight('#b9d8ff', '#1c1710', 0.1);
  scene.add(hemisphereLight);

  const ambientLight = new THREE.AmbientLight('#d7e3ff', 0.08);
  scene.add(ambientLight);

  return {
    dome,
    material,
    uniforms,
    hemisphereLight,
    ambientLight,
    state: {
      starVisibility: 1,
      ambientLevel: 0.08,
      starAmbient: tuning.atmosphere.nighttimeAmbientGlow,
      moonAmbient: 0,
    },
  };
}

export function updateAtmosphere(
  atmosphere,
  sunAltitude,
  sunAzimuth,
  moonAltitude = -90,
  moonIlluminatedFraction = 0,
  observerPosition = null
) {
  const dayAmount = smoothstep(-6, 8, sunAltitude);
  const lightingState = lightingStateForSky(sunAltitude, moonAltitude, moonIlluminatedFraction);

  if (observerPosition) {
    atmosphere.dome.position.copy(observerPosition);
  }

  atmosphere.uniforms.sunDirection.value.copy(directionFromHorizontal(sunAltitude, sunAzimuth));
  atmosphere.uniforms.sunAltitude.value = sunAltitude;
  atmosphere.uniforms.dayAmount.value = dayAmount;
  atmosphere.uniforms.twilightAmount.value = lightingState.twilightAmount;
  atmosphere.uniforms.twilightIntensity.value = tuning.atmosphere.twilightIntensity;
  atmosphere.hemisphereLight.intensity =
    lightingState.daylight * 1.05 + lightingState.moonAmbient * 1.5 + lightingState.starAmbient * 0.35;
  atmosphere.ambientLight.intensity =
    lightingState.starAmbient * 0.95 + lightingState.moonAmbient * 0.85 + lightingState.daylight * 0.18;

  atmosphere.state.starVisibility = lightingState.starVisibility;
  atmosphere.state.ambientLevel = lightingState.ambientLevel;
  atmosphere.state.starAmbient = lightingState.starAmbient;
  atmosphere.state.moonAmbient = lightingState.moonAmbient;

  return atmosphere.state;
}

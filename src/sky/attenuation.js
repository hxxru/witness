import { tuning } from '../ui/debug-panel.js';

const DEGREES_TO_RADIANS = Math.PI / 180;
const HORIZON_FADE_MIN = -3;
const HORIZON_FADE_MAX = 2;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function profileThresholds(profile) {
  if (profile === 'planet' || profile === 'planets' || profile === 'moon') {
    return {
      bright: tuning.skyAttenuation.planetsTwilightBright,
      dark: tuning.skyAttenuation.planetsTwilightDark,
    };
  }

  return {
    bright: tuning.skyAttenuation.starsTwilightBright,
    dark: tuning.skyAttenuation.starsTwilightDark,
  };
}

function skyBrightnessForSunAltitude(sunAltitudeDeg, profile) {
  const thresholds = profileThresholds(profile);
  return 1 - smoothstep(thresholds.dark, thresholds.bright, sunAltitudeDeg);
}

function horizonVisibilityForAltitude(objectAltitudeDeg) {
  return smoothstep(HORIZON_FADE_MIN, HORIZON_FADE_MAX, objectAltitudeDeg);
}

function airmassForAltitude(objectAltitudeDeg) {
  if (objectAltitudeDeg <= 3) {
    return tuning.skyAttenuation.maxAirmassClamp;
  }

  const sinAltitude = Math.sin(objectAltitudeDeg * DEGREES_TO_RADIANS);
  return clamp(1 / Math.max(sinAltitude, 1e-4), 1, tuning.skyAttenuation.maxAirmassClamp);
}

export function computeAttenuation(objectAltitudeDeg, sunAltitudeDeg, profile = 'stars') {
  const skyBrightness = skyBrightnessForSunAltitude(sunAltitudeDeg, profile);
  const horizonVisibility = horizonVisibilityForAltitude(objectAltitudeDeg);
  const airmass = airmassForAltitude(objectAltitudeDeg);
  const extinction = Math.pow(tuning.skyAttenuation.transmittance, airmass);
  const brightness = clamp(skyBrightness * horizonVisibility * extinction, 0, 1);
  const tintStrength = clamp(skyBrightness * horizonVisibility * (1 - extinction), 0, 1);

  return {
    brightness,
    tint: {
      r: 1 + (tuning.skyAttenuation.warmTint.r - 1) * tintStrength,
      g: 1 + (tuning.skyAttenuation.warmTint.g - 1) * tintStrength,
      b: 1 + (tuning.skyAttenuation.warmTint.b - 1) * tintStrength,
    },
  };
}

const CONTROL_WIDTH = '100%';

export const tuning = {
  stars: {
    baseSize: 0.6,
    scaleFactor: 0.3,
    limitingMagnitude: 7,
    renderedCount: 0,
  },
  bloom: {
    strength: 0.65,
    radius: 0.3,
    threshold: 0.95,
  },
  planets: {
    spriteSize: 1,
    labelSize: 10,
  },
  sunMoon: {
    sunDiscSize: 1,
    moonDiscSize: 1,
    nightHalo: 0.15,
  },
  skyAttenuation: {
    transmittance: 0.9,
    maxAirmassClamp: 12,
    warmTint: {
      r: 1,
      g: 0.831,
      b: 0.627,
    },
    starsTwilightBright: -6,
    starsTwilightDark: -18,
    planetsTwilightBright: -3,
    planetsTwilightDark: -12,
  },
  atmosphere: {
    twilightIntensity: 1,
    nighttimeAmbientGlow: 0.08,
    moonglow: 0.4,
  },
  milkyWay: {
    brightness: 0.002,
    desaturation: 0.7,
  },
  constellationLines: {
    opacity: 0.48,
    linewidth: 1,
  },
  water: {
    rippleAmplitude: 1,
    rippleSpeed: 0.5,
    reflectivity: 0.8,
  },
  fog: {
    near: 800,
    far: 3100,
  },
  trees: {
    density: 3.5,
    heightScale: 1.7,
    clearingRadius: 22,
  },
  player: {
    moveSpeed: 30,
    acceleration: 18,
    damping: 12,
    lookSensitivity: 0.0032,
    jumpHeight: 4.0,
    gravity: 40,
  },
  labels: {
    hoverThreshold: 30,
  },
};

const touchedPaths = new Set();
const controls = new Map();

function getValue(path) {
  return path.split('.').reduce((current, key) => current[key], tuning);
}

function setValue(path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  const target = parts.reduce((current, key) => current[key], tuning);
  target[last] = value;
}

function formatValue(value, step) {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  return value.toFixed(decimals);
}

function updateControlDisplay(path) {
  const control = controls.get(path);

  if (!control) {
    return;
  }

  const value = getValue(path);
  control.input.value = String(value);
  control.value.textContent = control.formatter
    ? control.formatter(value, control.step)
    : formatValue(value, control.step);
}

export function setTuningValue(path, value, { markTouched = false } = {}) {
  setValue(path, value);

  if (markTouched) {
    touchedPaths.add(path);
  }

  updateControlDisplay(path);
}

export function isTuningTouched(path) {
  return touchedPaths.has(path);
}

function createSliderRow(sectionBody, config) {
  const row = document.createElement('label');
  row.style.display = 'block';
  row.style.marginBottom = '10px';

  const labelRow = document.createElement('div');
  labelRow.style.display = 'flex';
  labelRow.style.justifyContent = 'space-between';
  labelRow.style.alignItems = 'center';
  labelRow.style.marginBottom = '4px';

  const label = document.createElement('span');
  label.textContent = config.label;
  label.style.fontSize = '11px';
  label.style.color = '#f5e6c8';

  const value = document.createElement('span');
  value.style.fontSize = '11px';
  value.style.color = '#d4a857';

  labelRow.appendChild(label);
  labelRow.appendChild(value);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(config.min);
  input.max = String(config.max);
  input.step = String(config.step);
  input.style.width = CONTROL_WIDTH;
  input.style.accentColor = '#d4a857';

  input.addEventListener('input', () => {
    setTuningValue(config.path, Number(input.value), { markTouched: true });
  });

  row.appendChild(labelRow);
  row.appendChild(input);
  sectionBody.appendChild(row);

  controls.set(config.path, {
    input,
    value,
    step: config.step,
    formatter: config.formatter ?? null,
  });
  updateControlDisplay(config.path);
}

function refreshDynamicDisplays() {
  for (const path of controls.keys()) {
    updateControlDisplay(path);
  }

  requestAnimationFrame(refreshDynamicDisplays);
}

function createSection(root, title, sliders) {
  const section = document.createElement('section');
  section.style.marginBottom = '14px';

  const header = document.createElement('div');
  header.textContent = title;
  header.style.fontSize = '10px';
  header.style.fontWeight = '700';
  header.style.letterSpacing = '0.08em';
  header.style.textTransform = 'uppercase';
  header.style.color = '#d4a857';
  header.style.marginBottom = '8px';

  const body = document.createElement('div');

  section.appendChild(header);
  section.appendChild(body);
  root.appendChild(section);

  for (const slider of sliders) {
    createSliderRow(body, slider);
  }
}

export function createDebugPanel() {
  const root = document.createElement('aside');
  root.style.position = 'fixed';
  root.style.top = '16px';
  root.style.left = '16px';
  root.style.zIndex = '11';
  root.style.width = '300px';
  root.style.maxHeight = 'calc(100vh - 32px)';
  root.style.overflowY = 'auto';
  root.style.padding = '14px 14px 12px';
  root.style.border = '1px solid rgba(212, 168, 87, 0.22)';
  root.style.borderRadius = '12px';
  root.style.background = 'rgba(4, 8, 14, 0.72)';
  root.style.backdropFilter = 'blur(8px)';
  root.style.boxShadow = '0 18px 40px rgba(0, 0, 0, 0.35)';
  root.style.fontFamily = '"Space Mono", "IBM Plex Mono", monospace';
  root.style.display = 'none';

  const title = document.createElement('div');
  title.textContent = 'debug tuning';
  title.style.fontSize = '12px';
  title.style.fontWeight = '700';
  title.style.color = '#f5e6c8';
  title.style.marginBottom = '12px';
  root.appendChild(title);

  createSection(root, 'Stars', [
    { path: 'stars.baseSize', label: 'baseSize', min: 0.1, max: 1.9, step: 0.1 },
    { path: 'stars.scaleFactor', label: 'scaleFactor', min: 0.1, max: 0.6, step: 0.05 },
    {
      path: 'stars.limitingMagnitude',
      label: 'limitingMagnitude',
      min: 4,
      max: 10,
      step: 0.5,
      formatter: (value, step) =>
        `${formatValue(value, step)} | ${tuning.stars.renderedCount.toLocaleString()}`,
    },
  ]);
  createSection(root, 'Bloom', [
    { path: 'bloom.strength', label: 'strength', min: 0, max: 1.3, step: 0.05 },
    { path: 'bloom.radius', label: 'radius', min: 0, max: 0.6, step: 0.05 },
    { path: 'bloom.threshold', label: 'threshold', min: 0, max: 1.9, step: 0.05 },
  ]);
  createSection(root, 'Planets', [
    { path: 'planets.spriteSize', label: 'spriteSize', min: 0.5, max: 1.5, step: 0.5 },
    { path: 'planets.labelSize', label: 'labelSize', min: 6, max: 14, step: 1 },
  ]);
  createSection(root, 'Sun/Moon', [
    { path: 'sunMoon.sunDiscSize', label: 'sunDiscSize', min: 0.5, max: 1.5, step: 0.5 },
    { path: 'sunMoon.moonDiscSize', label: 'moonDiscSize', min: 0.5, max: 1.5, step: 0.5 },
    { path: 'sunMoon.nightHalo', label: 'nightHalo', min: 0, max: 0.3, step: 0.05 },
  ]);
  createSection(root, 'Sky Attenuation', [
    { path: 'skyAttenuation.transmittance', label: 'transmittance', min: 0.7, max: 1, step: 0.01 },
    { path: 'skyAttenuation.maxAirmassClamp', label: 'maxAirmassClamp', min: 5, max: 20, step: 1 },
    { path: 'skyAttenuation.warmTint.r', label: 'warmTintR', min: 0, max: 1, step: 0.01 },
    { path: 'skyAttenuation.warmTint.g', label: 'warmTintG', min: 0, max: 1, step: 0.01 },
    { path: 'skyAttenuation.warmTint.b', label: 'warmTintB', min: 0, max: 1, step: 0.01 },
    { path: 'skyAttenuation.starsTwilightBright', label: 'starsTwilightBright', min: -18, max: -3, step: 1 },
    { path: 'skyAttenuation.starsTwilightDark', label: 'starsTwilightDark', min: -24, max: -6, step: 1 },
    { path: 'skyAttenuation.planetsTwilightBright', label: 'planetsTwilightBright', min: -12, max: 0, step: 1 },
    { path: 'skyAttenuation.planetsTwilightDark', label: 'planetsTwilightDark', min: -18, max: -3, step: 1 },
  ]);
  createSection(root, 'Atmosphere', [
    { path: 'atmosphere.twilightIntensity', label: 'twilightIntensity', min: 0, max: 2, step: 0.05 },
    { path: 'atmosphere.nighttimeAmbientGlow', label: 'nightAmbientGlow', min: 0, max: 0.16, step: 0.01 },
    { path: 'atmosphere.moonglow', label: 'moonglow', min: 0, max: 0.8, step: 0.01 },
  ]);
  createSection(root, 'Milky Way', [
    { path: 'milkyWay.brightness', label: 'milkyWayBrightness', min: 0, max: 0.015, step: 0.0005 },
    { path: 'milkyWay.desaturation', label: 'milkyWayDesaturation', min: 0, max: 2, step: 0.05 },
  ]);
  createSection(root, 'Constellations', [
    { path: 'constellationLines.opacity', label: 'opacity', min: 0, max: 0.96, step: 0.05 },
    { path: 'constellationLines.linewidth', label: 'linewidth', min: 0, max: 2, step: 1 },
  ]);
  createSection(root, 'Water', [
    { path: 'water.rippleAmplitude', label: 'rippleAmplitude', min: 0, max: 2, step: 0.01 },
    { path: 'water.rippleSpeed', label: 'rippleSpeed', min: 0, max: 1, step: 0.1 },
    { path: 'water.reflectivity', label: 'reflectivity', min: 0, max: 1.6, step: 0.05 },
  ]);
  createSection(root, 'Fog', [
    { path: 'fog.near', label: 'near', min: 0, max: 1600, step: 100 },
    { path: 'fog.far', label: 'far', min: 1000, max: 5200, step: 100 },
  ]);
  createSection(root, 'Trees', [
    { path: 'trees.density', label: 'density', min: 0.5, max: 6.5, step: 0.1 },
    { path: 'trees.heightScale', label: 'heightScale', min: 0.5, max: 2.9, step: 0.05 },
    { path: 'trees.clearingRadius', label: 'clearingRadius', min: 0, max: 44, step: 2 },
  ]);
  createSection(root, 'Player', [
    { path: 'player.moveSpeed', label: 'moveSpeed', min: 1, max: 8, step: 0.1 },
    { path: 'player.acceleration', label: 'acceleration', min: 4, max: 32, step: 1 },
    { path: 'player.damping', label: 'damping', min: 2, max: 22, step: 1 },
    { path: 'player.lookSensitivity', label: 'lookSensitivity', min: 0.001, max: 0.0064, step: 0.0001 },
    { path: 'player.jumpHeight', label: 'jumpHeight', min: 0.5, max: 5, step: 0.1 },
    { path: 'player.gravity', label: 'gravity', min: 4, max: 28, step: 1 },
  ]);
  createSection(root, 'Labels', [
    { path: 'labels.hoverThreshold', label: 'hoverThreshold', min: 8, max: 80, step: 1 },
  ]);

  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.textContent = 'export';
  exportButton.style.width = CONTROL_WIDTH;
  exportButton.style.marginTop = '6px';
  exportButton.style.padding = '8px 10px';
  exportButton.style.border = '1px solid rgba(212, 168, 87, 0.3)';
  exportButton.style.borderRadius = '8px';
  exportButton.style.background = 'rgba(212, 168, 87, 0.1)';
  exportButton.style.color = '#f5e6c8';
  exportButton.style.fontFamily = 'inherit';
  exportButton.style.cursor = 'pointer';
  exportButton.addEventListener('click', () => {
    console.log(JSON.stringify(tuning, null, 2));
  });
  root.appendChild(exportButton);

  document.body.appendChild(root);
  requestAnimationFrame(refreshDynamicDisplays);

  return {
    root,
    visible: false,
  };
}

export function toggleDebugPanel(panel) {
  panel.visible = !panel.visible;
  panel.root.style.display = panel.visible ? 'block' : 'none';
  return panel.visible;
}

import * as THREE from 'three';
import { computeAttenuation } from './attenuation.js';
import { tuning } from '../ui/debug-panel.js';

export const SKY_CULTURES = [
  { id: 'western', label: 'Western' },
  { id: 'arabic-ancient', label: 'Arabic Ancient' },
  { id: 'chinese', label: 'Chinese' },
  { id: 'korean', label: 'Korean' },
];

function segmentsFromPolylines(polylines) {
  const segments = [];

  for (const polyline of polylines ?? []) {
    for (let index = 0; index < polyline.length - 1; index += 1) {
      segments.push([polyline[index], polyline[index + 1]]);
    }
  }

  return segments;
}

function normalizeSkyCultureData(rawData, skyCultureId) {
  if (Array.isArray(rawData)) {
    return rawData.map((constellation) => ({
      ...constellation,
      englishName: constellation.name,
      nativeName: null,
    }));
  }

  return (rawData.constellations ?? []).map((constellation) => ({
    name:
      constellation.common_name?.english ??
      constellation.common_name?.native ??
      constellation.id,
    englishName:
      constellation.common_name?.english ??
      constellation.common_name?.native ??
      constellation.id,
    nativeName: constellation.common_name?.native ?? null,
    abbr: constellation.id,
    lines: segmentsFromPolylines(constellation.lines),
  }));
}

export async function loadConstellationData(url = '/data/constellations.json') {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load constellation data from ${url}`);
  }

  return response.json();
}

export async function loadSkyCultureData(skyCultureId = 'western') {
  const selectedCulture = SKY_CULTURES.find((culture) => culture.id === skyCultureId);

  if (!selectedCulture) {
    throw new Error(`Unknown sky culture "${skyCultureId}".`);
  }

  const url =
    skyCultureId === 'western'
      ? '/data/constellations.json'
      : `/data/skycultures/${skyCultureId}.json`;
  const rawData = await loadConstellationData(url);

  return {
    ...selectedCulture,
    constellations: normalizeSkyCultureData(rawData, skyCultureId),
  };
}

export function createConstellationLines(scene, constellationData, starData) {
  const hipToStarIndex = new Map();

  for (let index = 0; index < starData.length; index += 1) {
    const hip = starData[index].hip;

    if (Number.isInteger(hip)) {
      hipToStarIndex.set(hip, index);
    }
  }

  const segmentPairs = [];
  const incompleteConstellations = [];

  for (const constellation of constellationData) {
    let missingSegments = 0;
    let keptSegments = 0;

    for (const [startHip, endHip] of constellation.lines) {
      const startIndex = hipToStarIndex.get(startHip);
      const endIndex = hipToStarIndex.get(endHip);

      if (startIndex === undefined || endIndex === undefined) {
        missingSegments += 1;
        continue;
      }

      segmentPairs.push({
        constellation: constellation.name,
        constellationId: constellation.abbr ?? constellation.name,
        englishName: constellation.englishName ?? constellation.name,
        nativeName: constellation.nativeName ?? null,
        startIndex,
        endIndex,
      });
      keptSegments += 1;
    }

    if (missingSegments > 0) {
      incompleteConstellations.push({
        name: constellation.name,
        keptSegments,
        missingSegments,
        totalSegments: constellation.lines.length,
      });
    }
  }

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(segmentPairs.length * 2 * 3);
  const colors = new Float32Array(segmentPairs.length * 2 * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.LineBasicMaterial({
    color: 0xbfd7ff,
    vertexColors: true,
    transparent: true,
    opacity: tuning.constellationLines.opacity,
    toneMapped: false,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.visible = false;
  scene.add(lines);

  if (incompleteConstellations.length > 0) {
    const sample = incompleteConstellations
      .slice(0, 12)
      .map(
        ({ name, missingSegments, totalSegments }) => `${name} (${missingSegments}/${totalSegments} missing)`
      )
      .join(', ');

    console.info(
      `Constellation overlay skipped missing HIP endpoints for ${incompleteConstellations.length} constellations. ${sample}`
    );
  }

  return {
    lines,
    positions,
    colors,
    segmentPairs,
    incompleteConstellations,
    baseColor: new THREE.Color(0xbfd7ff),
    tintColor: new THREE.Color(1, 1, 1),
    scratchColor: new THREE.Color(),
    enabled: false,
    highlightedConstellation: null,
  };
}

export function destroyConstellationLines(constellationLines) {
  if (!constellationLines) {
    return;
  }

  constellationLines.lines.parent?.remove(constellationLines.lines);
  constellationLines.lines.geometry.dispose();
  constellationLines.lines.material.dispose();
}

function altitudeFromWorldPosition(position, observerPosition, radius) {
  const relativeY = (position.y - observerPosition.y) / radius;
  return Math.asin(THREE.MathUtils.clamp(relativeY, -1, 1)) * THREE.MathUtils.RAD2DEG;
}

export function updateConstellationPositions(constellationLines, starField, sunAltitude) {
  let visibleSegments = 0;

  for (let segmentIndex = 0; segmentIndex < constellationLines.segmentPairs.length; segmentIndex += 1) {
    const segment = constellationLines.segmentPairs[segmentIndex];
    const start = starField.positions[segment.startIndex];
    const end = starField.positions[segment.endIndex];
    const offset = segmentIndex * 6;
    const startAttenuation = computeAttenuation(
      altitudeFromWorldPosition(start, starField.observerPosition, starField.radius),
      sunAltitude,
      'stars'
    );
    const endAttenuation = computeAttenuation(
      altitudeFromWorldPosition(end, starField.observerPosition, starField.radius),
      sunAltitude,
      'stars'
    );

    constellationLines.positions[offset] = start.x;
    constellationLines.positions[offset + 1] = start.y;
    constellationLines.positions[offset + 2] = start.z;
    constellationLines.positions[offset + 3] = end.x;
    constellationLines.positions[offset + 4] = end.y;
    constellationLines.positions[offset + 5] = end.z;

    constellationLines.tintColor.setRGB(
      startAttenuation.tint.r,
      startAttenuation.tint.g,
      startAttenuation.tint.b
    );
    const startColor = constellationLines.scratchColor
      .copy(constellationLines.baseColor)
      .multiply(constellationLines.tintColor)
      .multiplyScalar(
        startAttenuation.brightness *
          (segment.constellationId === constellationLines.highlightedConstellation ? 3 : 1)
      );
    constellationLines.colors[offset] = startColor.r;
    constellationLines.colors[offset + 1] = startColor.g;
    constellationLines.colors[offset + 2] = startColor.b;

    constellationLines.tintColor.setRGB(
      endAttenuation.tint.r,
      endAttenuation.tint.g,
      endAttenuation.tint.b
    );
    const endColor = constellationLines.scratchColor
      .copy(constellationLines.baseColor)
      .multiply(constellationLines.tintColor)
      .multiplyScalar(
        endAttenuation.brightness *
          (segment.constellationId === constellationLines.highlightedConstellation ? 3 : 1)
      );
    constellationLines.colors[offset + 3] = endColor.r;
    constellationLines.colors[offset + 4] = endColor.g;
    constellationLines.colors[offset + 5] = endColor.b;

    if (startAttenuation.brightness > 0.002 || endAttenuation.brightness > 0.002) {
      visibleSegments += 1;
    }
  }

  constellationLines.lines.geometry.attributes.position.needsUpdate = true;
  constellationLines.lines.geometry.attributes.color.needsUpdate = true;
  constellationLines.lines.geometry.computeBoundingSphere();
  constellationLines.lines.visible = constellationLines.enabled && visibleSegments > 0;
}

export function toggleConstellationLines(constellationLines) {
  constellationLines.enabled = !constellationLines.enabled;
  constellationLines.lines.visible = constellationLines.enabled;
  return constellationLines.enabled;
}

export function updateConstellationVisibility(constellationLines) {
  if (!constellationLines.lines.visible) {
    return;
  }

  constellationLines.lines.material.opacity = tuning.constellationLines.opacity;
  constellationLines.lines.material.linewidth = tuning.constellationLines.linewidth;
}

export function setHighlightedConstellation(constellationLines, constellationName) {
  if (!constellationLines) {
    return false;
  }

  const changed = constellationLines.highlightedConstellation !== constellationName;
  constellationLines.highlightedConstellation = constellationName;
  return changed;
}

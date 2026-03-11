import * as THREE from 'three';

export async function loadConstellationData(url = '/data/constellations.json') {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load constellation data from ${url}`);
  }

  return response.json();
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
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({
    color: 0xbfd7ff,
    transparent: true,
    opacity: 0.48,
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
    segmentPairs,
    incompleteConstellations,
  };
}

export function updateConstellationPositions(constellationLines, starField, lst, latitude, T) {
  for (let segmentIndex = 0; segmentIndex < constellationLines.segmentPairs.length; segmentIndex += 1) {
    const segment = constellationLines.segmentPairs[segmentIndex];
    const start = starField.positions[segment.startIndex];
    const end = starField.positions[segment.endIndex];
    const offset = segmentIndex * 6;

    constellationLines.positions[offset] = start.x;
    constellationLines.positions[offset + 1] = start.y;
    constellationLines.positions[offset + 2] = start.z;
    constellationLines.positions[offset + 3] = end.x;
    constellationLines.positions[offset + 4] = end.y;
    constellationLines.positions[offset + 5] = end.z;
  }

  constellationLines.lines.geometry.attributes.position.needsUpdate = true;
  constellationLines.lines.geometry.computeBoundingSphere();
}

export function toggleConstellationLines(constellationLines) {
  constellationLines.lines.visible = !constellationLines.lines.visible;
  return constellationLines.lines.visible;
}

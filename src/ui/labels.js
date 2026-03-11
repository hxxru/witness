import * as THREE from 'three';
import { computeAttenuation } from '../sky/attenuation.js';
import { setHighlightedConstellation } from '../sky/constellations.js';
import { tuning } from './debug-panel.js';

const NAMED_STAR_MAGNITUDE_LIMIT = 3;
const SCREEN_MARGIN = 24;

function isOnScreen(projected) {
  return projected.z > -1 && projected.z < 1 && projected.x >= -1.15 && projected.x <= 1.15 && projected.y >= -1.15 && projected.y <= 1.15;
}

function toScreenCoordinates(projected) {
  return {
    x: ((projected.x + 1) / 2) * window.innerWidth,
    y: ((-projected.y + 1) / 2) * window.innerHeight,
  };
}

function altitudeFromWorldPosition(position, observerPosition, radius) {
  const relativeY = (position.y - observerPosition.y) / radius;
  return Math.asin(THREE.MathUtils.clamp(relativeY, -1, 1)) * THREE.MathUtils.RAD2DEG;
}

function distanceToSegment(pointX, pointY, startX, startY, endX, endY) {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= 1e-6) {
    return Math.hypot(pointX - startX, pointY - startY);
  }

  const projection = ((pointX - startX) * dx + (pointY - startY) * dy) / lengthSquared;
  const clampedProjection = THREE.MathUtils.clamp(projection, 0, 1);
  const nearestX = startX + dx * clampedProjection;
  const nearestY = startY + dy * clampedProjection;

  return Math.hypot(pointX - nearestX, pointY - nearestY);
}

export function createLabels({ starField, planets, sunMoon }) {
  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.inset = '0';
  root.style.pointerEvents = 'none';
  root.style.zIndex = '12';

  const hover = document.createElement('div');
  hover.style.position = 'fixed';
  hover.style.display = 'none';
  hover.style.transform = 'translate(-50%, -100%)';
  hover.style.fontFamily = '"Space Mono", "IBM Plex Mono", monospace';
  hover.style.fontSize = '11px';
  hover.style.lineHeight = '1.2';
  hover.style.color = '#f5e6c8';
  hover.style.textShadow = '0 0 6px rgba(0, 0, 0, 0.85)';
  hover.style.whiteSpace = 'nowrap';
  root.appendChild(hover);

  document.body.appendChild(root);

  const mouse = {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.5,
    active: false,
  };

  const onPointerMove = (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.active = true;
  };

  const onPointerLeave = () => {
    mouse.active = false;
    hover.style.display = 'none';
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerleave', onPointerLeave);

  // `star.name` currently includes fallback catalog designations for many dim stars.
  // Limit hover targets to bright familiar names so the screen-space search stays compact.
  const starTargets = starField.stars
    .map((star, index) => ({ star, index }))
    .filter(
      ({ star }) =>
        star.name &&
        Number.isFinite(star.vmag) &&
        star.vmag <= NAMED_STAR_MAGNITUDE_LIMIT
    );

  const bodyTargets = [];
  const permanentLabels = [];

  for (const body of planets?.bodies ?? []) {
    bodyTargets.push({
      name: body.name,
      magnitude: null,
      getPosition: () => body.sprite.position,
      getAltitude: () => body.data?.alt ?? -90,
      profile: 'planets',
      permanentLabel: body.label,
    });
    permanentLabels.push(body.label);
  }

  if (sunMoon) {
    bodyTargets.push({
      name: 'Sun',
      magnitude: null,
      getPosition: () => sunMoon.sun.position,
      getAltitude: () => sunMoon.sunData?.alt ?? -90,
      profile: 'sun',
      permanentLabel: sunMoon.sunLabel,
    });
    bodyTargets.push({
      name: 'Moon',
      magnitude: null,
      getPosition: () => sunMoon.moon.position,
      getAltitude: () => sunMoon.moonData?.alt ?? -90,
      profile: 'moon',
      permanentLabel: sunMoon.moonLabel,
    });
    permanentLabels.push(sunMoon.sunLabel, sunMoon.moonLabel);
  }

  return {
    root,
    hover,
    mouse,
    starTargets,
    bodyTargets,
    permanentLabels,
    projected: new THREE.Vector3(),
    projectedStart: new THREE.Vector3(),
    projectedEnd: new THREE.Vector3(),
    dispose() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      root.remove();
    },
  };
}

export function updateLabels(labels, { starField, camera, sunAltitude = -90, constellationLines = null }) {
  if (!labels.mouse.active) {
    for (const label of labels.permanentLabels) {
      label.style.visibility = '';
    }
    setHighlightedConstellation(constellationLines, null);
    labels.hover.style.display = 'none';
    return;
  }

  let nearest = null;
  let nearestDistance = Infinity;

  for (const target of labels.starTargets) {
    const star = target.star;
    if (Number.isFinite(star.vmag) && star.vmag > tuning.stars.limitingMagnitude) {
      continue;
    }

    const altitude = altitudeFromWorldPosition(
      starField.positions[target.index],
      starField.observerPosition,
      starField.radius
    );
    const attenuation = computeAttenuation(altitude, sunAltitude, 'stars');

    if (attenuation.brightness <= 0.01) {
      continue;
    }

    labels.projected.copy(starField.positions[target.index]).project(camera);
    if (!isOnScreen(labels.projected)) {
      continue;
    }

    const screen = toScreenCoordinates(labels.projected);
    const dx = screen.x - labels.mouse.x;
    const dy = screen.y - labels.mouse.y;
    const distance = Math.hypot(dx, dy);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = { kind: 'star', name: star.name, magnitude: star.vmag, screen, permanentLabel: null };
    }
  }

  for (const target of labels.bodyTargets) {
    if (target.profile !== 'sun') {
      const attenuation = computeAttenuation(target.getAltitude(), sunAltitude, target.profile);

      if (attenuation.brightness <= 0.01) {
        continue;
      }
    }

    labels.projected.copy(target.getPosition()).project(camera);
    if (!isOnScreen(labels.projected)) {
      continue;
    }

    const screen = toScreenCoordinates(labels.projected);
    const dx = screen.x - labels.mouse.x;
    const dy = screen.y - labels.mouse.y;
    const distance = Math.hypot(dx, dy);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = {
        kind: 'body',
        name: target.name,
        magnitude: target.magnitude,
        screen,
        permanentLabel: target.permanentLabel,
      };
    }
  }

  if (constellationLines?.enabled) {
    for (const segment of constellationLines.segmentPairs) {
      const start = starField.positions[segment.startIndex];
      const end = starField.positions[segment.endIndex];
      const startAltitude = altitudeFromWorldPosition(start, starField.observerPosition, starField.radius);
      const endAltitude = altitudeFromWorldPosition(end, starField.observerPosition, starField.radius);
      const startAttenuation = computeAttenuation(startAltitude, sunAltitude, 'stars');
      const endAttenuation = computeAttenuation(endAltitude, sunAltitude, 'stars');

      if (startAttenuation.brightness <= 0.01 && endAttenuation.brightness <= 0.01) {
        continue;
      }

      labels.projectedStart.copy(start).project(camera);
      labels.projectedEnd.copy(end).project(camera);

      if (!isOnScreen(labels.projectedStart) && !isOnScreen(labels.projectedEnd)) {
        continue;
      }

      const screenStart = toScreenCoordinates(labels.projectedStart);
      const screenEnd = toScreenCoordinates(labels.projectedEnd);
      const distance = distanceToSegment(
        labels.mouse.x,
        labels.mouse.y,
        screenStart.x,
        screenStart.y,
        screenEnd.x,
        screenEnd.y
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = {
          kind: 'constellation',
          name: segment.nativeName
            ? `${segment.nativeName}\n${segment.englishName.toUpperCase()}`
            : segment.englishName.toUpperCase(),
          magnitude: null,
          screen: {
            x: (screenStart.x + screenEnd.x) * 0.5,
            y: (screenStart.y + screenEnd.y) * 0.5,
          },
          permanentLabel: null,
          constellationName: segment.constellationId,
        };
      }
    }
  }

  for (const label of labels.permanentLabels) {
    label.style.visibility = '';
  }

  if (!nearest || nearestDistance > tuning.labels.hoverThreshold) {
    setHighlightedConstellation(constellationLines, null);
    labels.hover.style.display = 'none';
    return;
  }

  const x = Math.min(Math.max(nearest.screen.x, SCREEN_MARGIN), window.innerWidth - SCREEN_MARGIN);
  const y = Math.min(Math.max(nearest.screen.y - 10, SCREEN_MARGIN), window.innerHeight - SCREEN_MARGIN);

  if (nearest.permanentLabel) {
    nearest.permanentLabel.style.visibility = 'hidden';
  }

  if (nearest.kind === 'constellation') {
    labels.hover.style.fontSize = '13px';
    labels.hover.style.whiteSpace = 'pre-line';
    labels.hover.style.color = '#d8e7ff';
    setHighlightedConstellation(constellationLines, nearest.constellationName ?? null);
  } else {
    labels.hover.style.fontSize = '11px';
    labels.hover.style.whiteSpace = 'nowrap';
    labels.hover.style.color = '#f5e6c8';
    setHighlightedConstellation(constellationLines, null);
  }

  labels.hover.textContent = Number.isFinite(nearest.magnitude)
    ? `${nearest.name}  ${nearest.magnitude.toFixed(1)}`
    : nearest.name;
  labels.hover.style.left = `${x}px`;
  labels.hover.style.top = `${y}px`;
  labels.hover.style.display = 'block';
}

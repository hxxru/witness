import * as THREE from 'three';
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
      permanentLabel: body.label,
    });
    permanentLabels.push(body.label);
  }

  if (sunMoon) {
    bodyTargets.push({
      name: 'Sun',
      magnitude: null,
      getPosition: () => sunMoon.sun.position,
      permanentLabel: sunMoon.sunLabel,
    });
    bodyTargets.push({
      name: 'Moon',
      magnitude: null,
      getPosition: () => sunMoon.moon.position,
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
    dispose() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      root.remove();
    },
  };
}

export function updateLabels(labels, { starField, camera }) {
  if (!labels.mouse.active) {
    for (const label of labels.permanentLabels) {
      label.style.visibility = '';
    }
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
      nearest = { name: star.name, magnitude: star.vmag, screen, permanentLabel: null };
    }
  }

  for (const target of labels.bodyTargets) {
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
        name: target.name,
        magnitude: target.magnitude,
        screen,
        permanentLabel: target.permanentLabel,
      };
    }
  }

  for (const label of labels.permanentLabels) {
    label.style.visibility = '';
  }

  if (!nearest || nearestDistance > tuning.labels.hoverThreshold) {
    labels.hover.style.display = 'none';
    return;
  }

  const x = Math.min(Math.max(nearest.screen.x, SCREEN_MARGIN), window.innerWidth - SCREEN_MARGIN);
  const y = Math.min(Math.max(nearest.screen.y - 10, SCREEN_MARGIN), window.innerHeight - SCREEN_MARGIN);

  if (nearest.permanentLabel) {
    nearest.permanentLabel.style.visibility = 'hidden';
  }

  labels.hover.textContent = Number.isFinite(nearest.magnitude)
    ? `${nearest.name}  ${nearest.magnitude.toFixed(1)}`
    : nearest.name;
  labels.hover.style.left = `${x}px`;
  labels.hover.style.top = `${y}px`;
  labels.hover.style.display = 'block';
}

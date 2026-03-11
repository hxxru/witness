const STRIP_WIDTH = 400;
const TICK_STEP_DEGREES = 15;
const TICK_SPACING = 16;
const FULL_CIRCLE_DEGREES = 360;
const SEQUENCE_TICKS = FULL_CIRCLE_DEGREES / TICK_STEP_DEGREES;
const SEQUENCE_WIDTH = SEQUENCE_TICKS * TICK_SPACING;

const DIRECTION_LABELS = new Map([
  [0, 'N'],
  [45, 'NE'],
  [90, 'E'],
  [135, 'SE'],
  [180, 'S'],
  [225, 'SW'],
  [270, 'W'],
  [315, 'NW'],
]);

let activeCompass = null;

function normalizeDegrees(degrees) {
  return ((degrees % FULL_CIRCLE_DEGREES) + FULL_CIRCLE_DEGREES) % FULL_CIRCLE_DEGREES;
}

function createTick(degrees) {
  const tick = document.createElement('div');
  tick.style.position = 'relative';
  tick.style.flex = `0 0 ${TICK_SPACING}px`;
  tick.style.height = '28px';

  const label = DIRECTION_LABELS.get(degrees);
  if (label) {
    const text = document.createElement('div');
    text.textContent = label;
    text.style.position = 'absolute';
    text.style.left = '50%';
    text.style.top = '1px';
    text.style.transform = 'translateX(-50%)';
    text.style.fontFamily = '"Space Mono", "IBM Plex Mono", monospace';
    text.style.whiteSpace = 'nowrap';

    if (degrees === 0) {
      text.style.fontSize = '12px';
      text.style.fontWeight = '700';
      text.style.color = '#f5e6c8';
      text.style.textShadow = '0 0 10px rgba(245, 230, 200, 0.18)';
    } else if (degrees % 90 === 0) {
      text.style.fontSize = '11px';
      text.style.fontWeight = '700';
      text.style.color = '#d4a857';
    } else {
      text.style.fontSize = '10px';
      text.style.fontWeight = '600';
      text.style.color = 'rgba(212, 168, 87, 0.72)';
    }

    tick.appendChild(text);
  }

  const line = document.createElement('div');
  line.style.position = 'absolute';
  line.style.left = '50%';
  line.style.bottom = '2px';
  line.style.transform = 'translateX(-50%)';
  line.style.width = '1px';
  line.style.background = 'rgba(245, 230, 200, 0.42)';

  if (degrees % 90 === 0) {
    line.style.height = '11px';
  } else if (degrees % 45 === 0) {
    line.style.height = '8px';
  } else {
    line.style.height = '5px';
    line.style.background = 'rgba(245, 230, 200, 0.24)';
  }

  tick.appendChild(line);
  return tick;
}

function buildSequence() {
  const sequence = document.createElement('div');
  sequence.style.display = 'flex';
  sequence.style.flex = '0 0 auto';
  sequence.style.width = `${SEQUENCE_WIDTH}px`;

  for (let degrees = 0; degrees < FULL_CIRCLE_DEGREES; degrees += TICK_STEP_DEGREES) {
    sequence.appendChild(createTick(degrees));
  }

  return sequence;
}

export function createCompass() {
  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.top = '16px';
  root.style.left = '50%';
  root.style.transform = 'translateX(-50%)';
  root.style.zIndex = '10';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.alignItems = 'center';
  root.style.pointerEvents = 'none';

  const frame = document.createElement('div');
  frame.style.width = `${STRIP_WIDTH}px`;
  frame.style.height = '30px';
  frame.style.overflow = 'hidden';
  frame.style.padding = '4px 0';
  frame.style.border = '1px solid rgba(212, 168, 87, 0.18)';
  frame.style.borderRadius = '999px';
  frame.style.background = 'rgba(4, 8, 14, 0.46)';
  frame.style.backdropFilter = 'blur(6px)';
  frame.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.16)';
  root.appendChild(frame);

  const content = document.createElement('div');
  content.style.display = 'flex';
  content.style.width = `${SEQUENCE_WIDTH * 3}px`;
  content.appendChild(buildSequence());
  content.appendChild(buildSequence());
  content.appendChild(buildSequence());
  frame.appendChild(content);

  const heading = document.createElement('div');
  heading.style.marginTop = '4px';
  heading.style.fontFamily = '"Space Mono", "IBM Plex Mono", monospace';
  heading.style.fontSize = '10px';
  heading.style.color = 'rgba(245, 230, 200, 0.86)';
  heading.style.textShadow = '0 0 6px rgba(0, 0, 0, 0.45)';
  root.appendChild(heading);

  document.body.appendChild(root);

  activeCompass = { root, content, heading };
  return activeCompass;
}

export function updateCompass(yawRadians) {
  if (!activeCompass || !Number.isFinite(yawRadians)) {
    return;
  }

  const headingDegrees = normalizeDegrees((yawRadians * 180) / Math.PI);
  const progress = headingDegrees / TICK_STEP_DEGREES;
  const offset = STRIP_WIDTH * 0.5 - SEQUENCE_WIDTH - progress * TICK_SPACING;

  activeCompass.content.style.transform = `translateX(${offset}px)`;
  activeCompass.heading.textContent = `${Math.round(headingDegrees)}°`;
}

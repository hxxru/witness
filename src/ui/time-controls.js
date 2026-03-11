const BUTTONS = [
  { label: '<<<', unit: 'year', direction: -1, title: 'Back 1 year' },
  { label: '<<', unit: 'month', direction: -1, title: 'Back 1 month' },
  { label: '<', unit: 'week', direction: -1, title: 'Back 1 week' },
  { label: '>', unit: 'week', direction: 1, title: 'Forward 1 week' },
  { label: '>>', unit: 'month', direction: 1, title: 'Forward 1 month' },
  { label: '>>>', unit: 'year', direction: 1, title: 'Forward 1 year' },
];
const SPEED_VALUES = [1, 60, 360, 3600];

function styleButton(button) {
  button.style.minWidth = '28px';
  button.style.height = '24px';
  button.style.padding = '0 6px';
  button.style.border = '1px solid rgba(212, 168, 87, 0.18)';
  button.style.borderRadius = '999px';
  button.style.background = 'rgba(255, 255, 255, 0.02)';
  button.style.color = '#f5e6c8';
  button.style.fontFamily = '"Space Mono", "IBM Plex Mono", monospace';
  button.style.fontSize = '10px';
  button.style.lineHeight = '1';
  button.style.cursor = 'pointer';
  button.style.transition = 'background 120ms ease, border-color 120ms ease';
  button.addEventListener('mouseenter', () => {
    button.style.background = 'rgba(212, 168, 87, 0.12)';
    button.style.borderColor = 'rgba(212, 168, 87, 0.34)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = 'rgba(255, 255, 255, 0.02)';
    button.style.borderColor = 'rgba(212, 168, 87, 0.18)';
  });
}

export function createTimeControls({ onJump, onTogglePause, onSpeedChange } = {}) {
  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.right = '16px';
  root.style.bottom = '14px';
  root.style.zIndex = '10';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.alignItems = 'stretch';
  root.style.gap = '6px';

  const strip = document.createElement('div');
  strip.style.display = 'flex';
  strip.style.gap = '4px';
  strip.style.padding = '6px';
  strip.style.border = '1px solid rgba(212, 168, 87, 0.16)';
  strip.style.borderRadius = '999px';
  strip.style.background = 'rgba(4, 8, 14, 0.54)';
  strip.style.backdropFilter = 'blur(8px)';
  strip.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.2)';
  root.appendChild(strip);

  for (const config of BUTTONS.slice(0, 3)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = config.label;
    button.title = config.title;
    styleButton(button);
    button.addEventListener('click', () => {
      onJump?.(config.unit, config.direction);
    });
    strip.appendChild(button);
  }

  const pauseButton = document.createElement('button');
  pauseButton.type = 'button';
  styleButton(pauseButton);
  pauseButton.addEventListener('click', () => {
    onTogglePause?.();
  });
  strip.appendChild(pauseButton);

  for (const config of BUTTONS.slice(3)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = config.label;
    button.title = config.title;
    styleButton(button);
    button.addEventListener('click', () => {
      onJump?.(config.unit, config.direction);
    });
    strip.appendChild(button);
  }

  const speedSlider = document.createElement('input');
  speedSlider.type = 'range';
  speedSlider.min = '0';
  speedSlider.max = String(SPEED_VALUES.length - 1);
  speedSlider.step = '1';
  speedSlider.value = '0';
  speedSlider.style.width = '100%';
  speedSlider.style.margin = '0';
  speedSlider.style.accentColor = '#d4a857';
  speedSlider.title = 'Time speed';
  speedSlider.addEventListener('input', () => {
    onSpeedChange?.(SPEED_VALUES[Number(speedSlider.value)]);
  });
  root.appendChild(speedSlider);

  document.body.appendChild(root);

  return { root, pauseButton, speedSlider };
}

export function updateTimeControls(controls, state = {}) {
  if (!controls?.pauseButton) {
    return;
  }

  const paused = Boolean(state.paused);
  controls.pauseButton.textContent = paused ? '▶' : '⏸';
  controls.pauseButton.title = paused ? 'Play' : 'Pause';
  controls.pauseButton.setAttribute('aria-label', paused ? 'Play' : 'Pause');

  if (controls.speedSlider) {
    const magnitude = Math.abs(state.speedMultiplier ?? SPEED_VALUES[0]);
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let index = 0; index < SPEED_VALUES.length; index += 1) {
      const distance = Math.abs(SPEED_VALUES[index] - magnitude);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }

    controls.speedSlider.value = String(nearestIndex);
    controls.speedSlider.title = `Time speed ${magnitude}x`;
  }
}

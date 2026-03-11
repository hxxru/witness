const BUTTONS = [
  { label: '<<<', unit: 'year', direction: -1, title: 'Back 1 year' },
  { label: '<<', unit: 'month', direction: -1, title: 'Back 1 month' },
  { label: '<', unit: 'week', direction: -1, title: 'Back 1 week' },
  { label: '>', unit: 'week', direction: 1, title: 'Forward 1 week' },
  { label: '>>', unit: 'month', direction: 1, title: 'Forward 1 month' },
  { label: '>>>', unit: 'year', direction: 1, title: 'Forward 1 year' },
];

export function createTimeControls({ onJump } = {}) {
  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.right = '16px';
  root.style.bottom = '14px';
  root.style.zIndex = '10';
  root.style.display = 'flex';
  root.style.gap = '4px';
  root.style.padding = '6px';
  root.style.border = '1px solid rgba(212, 168, 87, 0.16)';
  root.style.borderRadius = '999px';
  root.style.background = 'rgba(4, 8, 14, 0.54)';
  root.style.backdropFilter = 'blur(8px)';
  root.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.2)';

  for (const config of BUTTONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = config.label;
    button.title = config.title;
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
    button.addEventListener('click', () => {
      onJump?.(config.unit, config.direction);
    });
    root.appendChild(button);
  }

  document.body.appendChild(root);

  return { root };
}

export function updateTimeControls() {}

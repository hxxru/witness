function pad(value, width = 2) {
  return String(Math.abs(value)).padStart(width, '0');
}

function formatYear(year) {
  if (year >= 0) {
    return String(year).padStart(4, '0');
  }

  return `-${pad(year, 4)}`;
}

function formatDateForInput(gregorian) {
  return `${formatYear(gregorian.year)}-${pad(gregorian.month)}-${pad(gregorian.day)}`;
}

function formatDegrees(value, digits = 3) {
  return value >= 0 ? `+${value.toFixed(digits)}` : value.toFixed(digits);
}

function styleField(input) {
  input.style.width = '100%';
  input.style.padding = '7px 8px';
  input.style.border = '1px solid rgba(212, 168, 87, 0.2)';
  input.style.borderRadius = '8px';
  input.style.background = 'rgba(255, 255, 255, 0.03)';
  input.style.color = '#f5e6c8';
  input.style.fontFamily = '"Space Mono", "IBM Plex Mono", monospace';
  input.style.fontSize = '11px';
  input.style.outline = 'none';
  input.style.boxSizing = 'border-box';
}

function createLabeledField(root, labelText, input) {
  const wrapper = document.createElement('label');
  wrapper.style.display = 'block';
  wrapper.style.marginBottom = '8px';

  const label = document.createElement('div');
  label.textContent = labelText;
  label.style.marginBottom = '4px';
  label.style.fontSize = '10px';
  label.style.letterSpacing = '0.06em';
  label.style.textTransform = 'uppercase';
  label.style.color = '#d4a857';

  wrapper.appendChild(label);
  wrapper.appendChild(input);
  root.appendChild(wrapper);
}

export function createInputPanel({ onSubmit, onSkyCultureChange, skyCultures = [] } = {}) {
  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.left = '16px';
  root.style.bottom = '14px';
  root.style.zIndex = '10';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.alignItems = 'flex-start';
  root.style.gap = '8px';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = '📍';
  toggle.title = 'Toggle location/date panel';
  toggle.style.width = '34px';
  toggle.style.height = '34px';
  toggle.style.border = '1px solid rgba(212, 168, 87, 0.22)';
  toggle.style.borderRadius = '999px';
  toggle.style.background = 'rgba(4, 8, 14, 0.6)';
  toggle.style.backdropFilter = 'blur(8px)';
  toggle.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.2)';
  toggle.style.color = '#f5e6c8';
  toggle.style.fontSize = '17px';
  toggle.style.cursor = 'pointer';
  root.appendChild(toggle);

  const panelRoot = document.createElement('div');
  panelRoot.style.display = 'none';
  panelRoot.style.width = '236px';
  panelRoot.style.padding = '12px';
  panelRoot.style.border = '1px solid rgba(212, 168, 87, 0.22)';
  panelRoot.style.borderRadius = '12px';
  panelRoot.style.background = 'rgba(4, 8, 14, 0.76)';
  panelRoot.style.backdropFilter = 'blur(8px)';
  panelRoot.style.boxShadow = '0 18px 40px rgba(0, 0, 0, 0.3)';
  panelRoot.style.fontFamily = '"Space Mono", "IBM Plex Mono", monospace';
  panelRoot.style.color = '#f5e6c8';
  root.appendChild(panelRoot);

  const current = document.createElement('div');
  current.style.marginBottom = '10px';
  current.style.fontSize = '10px';
  current.style.lineHeight = '1.45';
  current.style.color = '#d7c6a0';
  panelRoot.appendChild(current);
  // TODO(post-MVP): add place-name lookup / reverse geocoding for the current coordinates.

  const form = document.createElement('form');
  panelRoot.appendChild(form);

  const latitude = document.createElement('input');
  latitude.type = 'number';
  latitude.min = '-90';
  latitude.max = '90';
  latitude.step = '0.0001';
  styleField(latitude);
  createLabeledField(form, 'Latitude', latitude);

  const longitude = document.createElement('input');
  longitude.type = 'number';
  longitude.min = '-180';
  longitude.max = '180';
  longitude.step = '0.0001';
  styleField(longitude);
  createLabeledField(form, 'Longitude', longitude);

  const date = document.createElement('input');
  date.type = 'text';
  styleField(date);
  createLabeledField(form, 'Date', date);

  const skyCulture = document.createElement('select');
  styleField(skyCulture);
  skyCulture.style.cursor = 'pointer';

  for (const culture of skyCultures) {
    const option = document.createElement('option');
    option.value = culture.id;
    option.textContent = culture.label;
    option.style.background = '#0b111a';
    option.style.color = '#f5e6c8';
    skyCulture.appendChild(option);
  }

  createLabeledField(form, 'Sky Culture', skyCulture);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'go';
  submit.style.width = '100%';
  submit.style.padding = '8px 10px';
  submit.style.border = '1px solid rgba(212, 168, 87, 0.3)';
  submit.style.borderRadius = '8px';
  submit.style.background = 'rgba(212, 168, 87, 0.12)';
  submit.style.color = '#f5e6c8';
  submit.style.fontFamily = 'inherit';
  submit.style.fontSize = '11px';
  submit.style.cursor = 'pointer';
  form.appendChild(submit);

  const panel = {
    root,
    toggle,
    panelRoot,
    current,
    form,
    latitude,
    longitude,
    date,
    skyCulture,
    visible: false,
  };

  panel.setOpen = (visible) => {
    panel.visible = visible;
    panel.panelRoot.style.display = visible ? 'block' : 'none';
    panel.toggle.style.background = visible ? 'rgba(212, 168, 87, 0.18)' : 'rgba(4, 8, 14, 0.6)';
    panel.toggle.style.borderColor = visible ? 'rgba(212, 168, 87, 0.42)' : 'rgba(212, 168, 87, 0.22)';

    if (visible) {
      panel.latitude.focus();
    }
  };

  toggle.addEventListener('click', () => {
    panel.setOpen(!panel.visible);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit?.({
      latitude: panel.latitude.value.trim(),
      longitude: panel.longitude.value.trim(),
      date: panel.date.value.trim(),
      close: () => panel.setOpen(false),
    });
  });

  skyCulture.addEventListener('change', () => {
    onSkyCultureChange?.(panel.skyCulture.value);
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && panel.visible) {
      panel.setOpen(false);
    }
  });

  document.body.appendChild(root);
  return panel;
}

export function updateInputPanel(panel, state) {
  const dateValue = formatDateForInput(state.gregorian);
  panel.current.textContent =
    `current:\nlat ${formatDegrees(state.latitude)}\nlon ${formatDegrees(state.longitude)}\ndate ${dateValue}\nculture ${state.skyCultureLabel}`;
  panel.latitude.placeholder = formatDegrees(state.latitude, 4);
  panel.longitude.placeholder = formatDegrees(state.longitude, 4);
  panel.date.placeholder = dateValue;
  panel.skyCulture.value = state.skyCultureId;
}

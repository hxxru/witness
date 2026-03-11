function pad(value, width = 2) {
  return String(Math.abs(value)).padStart(width, '0');
}

function formatYear(year) {
  if (year >= 0) {
    return String(year).padStart(4, '0');
  }

  return `-${pad(year, 4)}`;
}

function formatGregorianDateTime(gregorian) {
  const totalSeconds = Math.round(gregorian.hour * 3600);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return (
    `${formatYear(gregorian.year)}-${pad(gregorian.month)}-${pad(gregorian.day)} ` +
    `${pad(hours)}:${pad(minutes)}:${pad(seconds)} UTC`
  );
}

function formatDegrees(value) {
  const rounded = value >= 0 ? `+${value.toFixed(3)}` : value.toFixed(3);
  return `${rounded}\u00b0`;
}

export function createHud() {
  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.top = '16px';
  root.style.right = '16px';
  root.style.zIndex = '10';
  root.style.pointerEvents = 'none';
  root.style.padding = '10px 12px';
  root.style.border = '1px solid rgba(212, 168, 87, 0.22)';
  root.style.borderRadius = '10px';
  root.style.background = 'rgba(0, 0, 0, 0.52)';
  root.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.24)';
  root.style.backdropFilter = 'blur(6px)';
  root.style.color = '#F5E6C8';
  root.style.fontFamily = '"Space Mono", "IBM Plex Mono", monospace';
  root.style.fontSize = '11px';
  root.style.lineHeight = '1.45';
  root.style.whiteSpace = 'pre';
  root.style.userSelect = 'none';

  const content = document.createElement('div');
  root.appendChild(content);
  document.body.appendChild(root);

  return {
    root,
    content,
    visible: true,
  };
}

export function updateHud(hud, state) {
  const planetSection = Array.isArray(state.planetLines) && state.planetLines.length > 0
    ? `\n${state.planetLines.join('\n')}`
    : '';
  const sunMoonSection = Array.isArray(state.sunMoonLines) && state.sunMoonLines.length > 0
    ? `\n${state.sunMoonLines.join('\n')}`
    : '';
  const spawnSection = state.spawnModeLabel ? `\nspawn ${state.spawnModeLabel}` : '';

  hud.content.textContent =
    `jd   ${state.jd.toFixed(5)}\n` +
    `utc  ${formatGregorianDateTime(state.gregorian)}\n` +
    `gmst ${state.gmst.toFixed(3)}\u00b0\n` +
    `lst  ${state.lst.toFixed(3)}\u00b0\n` +
    `obs  lat ${formatDegrees(state.latitude)}  lon ${formatDegrees(state.longitude)}\n` +
    `spd  ${state.paused ? 'paused' : `${state.speedMultiplier.toFixed(0)}x`}\n` +
    `fps  ${state.fps.toFixed(1)}` +
    spawnSection +
    planetSection +
    sunMoonSection;
}

export function toggleHud(hud) {
  hud.visible = !hud.visible;
  hud.root.style.display = hud.visible ? 'block' : 'none';
  return hud.visible;
}

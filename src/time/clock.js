import { greenwichMeanSiderealTime, gregorianFromJD } from '../sky/coordinates.js';

function syncDerivedState(clock) {
  clock.t = (clock.jd - 2451545.0) / 36525.0;
  clock.gmst = greenwichMeanSiderealTime(clock.jd);
  clock.gregorian = gregorianFromJD(clock.jd);
}

export function createClock(initialJD) {
  const clock = {
    jd: initialJD,
    speedMultiplier: 1,
    paused: false,
    t: 0,
    gmst: 0,
    gregorian: null,
  };

  syncDerivedState(clock);

  return clock;
}

export function tickClock(clock, realDeltaSeconds) {
  if (!clock.paused && realDeltaSeconds > 0) {
    clock.jd += (realDeltaSeconds * clock.speedMultiplier) / 86400;
    syncDerivedState(clock);
  }

  return clock.jd;
}

export function setClockSpeed(clock, multiplier) {
  if (!Number.isFinite(multiplier) || multiplier === 0) {
    throw new Error(`Clock speed must be a non-zero finite number. Received ${multiplier}.`);
  }

  clock.speedMultiplier = multiplier;
}

export function setClockPaused(clock, paused) {
  clock.paused = Boolean(paused);
}

export function setClockJD(clock, jd) {
  clock.jd = jd;
  syncDerivedState(clock);
}

export function getClockJD(clock) {
  return clock.jd;
}

export function getClockT(clock) {
  return clock.t;
}

export function getClockGMST(clock) {
  return clock.gmst;
}

export function getClockGregorian(clock) {
  return clock.gregorian;
}

export function getClockSpeed(clock) {
  return clock.speedMultiplier;
}

export function isClockPaused(clock) {
  return clock.paused;
}

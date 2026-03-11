const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function julianDate(year, month, day, hour = 0) {
  let adjustedYear = year;
  let adjustedMonth = month;

  if (adjustedMonth <= 2) {
    adjustedYear -= 1;
    adjustedMonth += 12;
  }

  const isGregorianDate =
    year > 1582 ||
    (year === 1582 && month > 10) ||
    (year === 1582 && month === 10 && day >= 15);

  const century = Math.floor(adjustedYear / 100);
  const correction = isGregorianDate ? 2 - century + Math.floor(century / 4) : 0;
  const fractionalDay = day + hour / 24;

  return (
    Math.floor(365.25 * (adjustedYear + 4716)) +
    Math.floor(30.6001 * (adjustedMonth + 1)) +
    fractionalDay +
    correction -
    1524.5
  );
}

export function gregorianFromJD(jd) {
  const shifted = jd + 0.5;
  const integerPart = Math.floor(shifted);
  const fractionalPart = shifted - integerPart;

  let A = integerPart;

  if (integerPart >= 2299161) {
    const alpha = Math.floor((integerPart - 1867216.25) / 36524.25);
    A = integerPart + 1 + alpha - Math.floor(alpha / 4);
  }

  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const exactDay = B - D - Math.floor(30.6001 * E) + fractionalPart;
  const day = Math.floor(exactDay);
  const hour = (exactDay - day) * 24;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;

  return { year, month, day, hour };
}

export function greenwichMeanSiderealTime(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  const gmst =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000;

  return normalizeDegrees(gmst);
}

export function localSiderealTime(gmst, longitude) {
  return normalizeDegrees(gmst + longitude);
}

export function precessRADec(ra, dec, T) {
  const rightAscension = ra * DEGREES_TO_RADIANS;
  const declination = dec * DEGREES_TO_RADIANS;
  const zeta = (
    0.6406161 * T +
    0.0000839 * T * T +
    0.000005 * T * T * T
  ) * DEGREES_TO_RADIANS;
  const z = (
    0.6406161 * T +
    0.0003041 * T * T +
    0.0000051 * T * T * T
  ) * DEGREES_TO_RADIANS;
  const theta = (
    0.556753 * T -
    0.0001185 * T * T -
    0.0000116 * T * T * T
  ) * DEGREES_TO_RADIANS;

  const A = Math.cos(declination) * Math.sin(rightAscension + zeta);
  const B =
    Math.cos(theta) * Math.cos(declination) * Math.cos(rightAscension + zeta) -
    Math.sin(theta) * Math.sin(declination);
  const C =
    Math.sin(theta) * Math.cos(declination) * Math.cos(rightAscension + zeta) +
    Math.cos(theta) * Math.sin(declination);
  const precessedRA = normalizeDegrees((Math.atan2(A, B) + z) * RADIANS_TO_DEGREES);
  const precessedDec = Math.asin(clamp(C, -1, 1)) * RADIANS_TO_DEGREES;

  return {
    ra: precessedRA,
    dec: precessedDec,
  };
}

export function equatorialToHorizontal(ra, dec, lst, latitude) {
  const hourAngle = normalizeDegrees(lst - ra) * DEGREES_TO_RADIANS;
  const declination = dec * DEGREES_TO_RADIANS;
  const observerLatitude = latitude * DEGREES_TO_RADIANS;

  const sinAltitude =
    Math.sin(observerLatitude) * Math.sin(declination) +
    Math.cos(observerLatitude) * Math.cos(declination) * Math.cos(hourAngle);
  const altitude = Math.asin(clamp(sinAltitude, -1, 1));
  const cosAltitude = Math.max(Math.cos(altitude), Number.EPSILON);

  const sinAzimuth = (-Math.cos(declination) * Math.sin(hourAngle)) / cosAltitude;
  const cosAzimuth =
    (Math.sin(declination) - Math.sin(observerLatitude) * Math.sin(altitude)) /
    (Math.cos(observerLatitude) * cosAltitude);
  const azimuth = Math.atan2(sinAzimuth, cosAzimuth);

  return {
    alt: altitude * RADIANS_TO_DEGREES,
    az: normalizeDegrees(azimuth * RADIANS_TO_DEGREES),
  };
}

export function horizontalToCartesian(alt, az, radius) {
  const altitude = alt * DEGREES_TO_RADIANS;
  const azimuth = az * DEGREES_TO_RADIANS;
  const cosAltitude = Math.cos(altitude);

  return {
    x: radius * cosAltitude * Math.cos(azimuth),
    z: radius * cosAltitude * Math.sin(azimuth),
    y: radius * Math.sin(altitude),
  };
}

export function obliquityOfEcliptic(T) {
  throw new Error('obliquityOfEcliptic is not implemented yet.');
}

export function eclipticToEquatorial(lon, lat, obliquity) {
  throw new Error('eclipticToEquatorial is not implemented yet.');
}

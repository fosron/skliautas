export const MOON_PHASE_NAMES = Object.freeze([
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent',
]);

export function moonPhaseName(phase) {
  if (!Number.isFinite(phase)) {
    return '—';
  }

  const normalized = ((phase % 1) + 1) % 1;

  if (normalized < 0.03 || normalized >= 0.97) return MOON_PHASE_NAMES[0];
  if (normalized < 0.22) return MOON_PHASE_NAMES[1];
  if (normalized < 0.28) return MOON_PHASE_NAMES[2];
  if (normalized < 0.47) return MOON_PHASE_NAMES[3];
  if (normalized < 0.53) return MOON_PHASE_NAMES[4];
  if (normalized < 0.72) return MOON_PHASE_NAMES[5];
  if (normalized < 0.78) return MOON_PHASE_NAMES[6];
  return MOON_PHASE_NAMES[7];
}

export function directionFromHorizontalCoordinates(azimuthDegrees, altitudeDegrees) {
  if (!Number.isFinite(azimuthDegrees) || !Number.isFinite(altitudeDegrees)) {
    return null;
  }

  const azimuth = (azimuthDegrees * Math.PI) / 180;
  const altitude = (altitudeDegrees * Math.PI) / 180;
  const horizontal = Math.cos(altitude);

  return {
    x: horizontal * Math.sin(azimuth),
    y: Math.sin(altitude),
    z: -horizontal * Math.cos(azimuth),
  };
}

export function headingFromYaw(yawRadians) {
  if (!Number.isFinite(yawRadians)) {
    return 0;
  }

  const degrees = (-yawRadians * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

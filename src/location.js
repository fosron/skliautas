const DEFAULT_GEOLOCATION_OPTIONS = Object.freeze({
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 300_000,
});

const GEOLOCATION_ERROR_MESSAGES = new Map([
  [1, 'Location permission was denied. Try again or enter coordinates manually.'],
  [2, 'Your location is unavailable right now. Enter coordinates manually instead.'],
  [3, 'The location request timed out. Try again or enter coordinates manually.'],
]);

export class LocationError extends Error {
  constructor(message, code = 'UNKNOWN') {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

function parseCoordinate(value) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return { status: 'missing' };
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return { status: 'invalid' };
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return { status: 'invalid' };
  }

  return { status: 'ok', value: number };
}

export function validateCoordinates(latitudeInput, longitudeInput) {
  const latitude = parseCoordinate(latitudeInput);
  const longitude = parseCoordinate(longitudeInput);

  if (latitude.status === 'missing' || longitude.status === 'missing') {
    const fields = [];
    if (latitude.status === 'missing') fields.push('latitude');
    if (longitude.status === 'missing') fields.push('longitude');

    return {
      ok: false,
      fields,
      error:
        fields.length === 2
          ? 'Enter both a latitude and a longitude.'
          : `Enter a ${fields[0]}.`,
    };
  }

  if (latitude.status === 'invalid' || longitude.status === 'invalid') {
    const fields = [];
    if (latitude.status === 'invalid') fields.push('latitude');
    if (longitude.status === 'invalid') fields.push('longitude');

    return {
      ok: false,
      fields,
      error: 'Latitude and longitude must be finite numbers.',
    };
  }

  if (latitude.value < -90 || latitude.value > 90) {
    return {
      ok: false,
      fields: ['latitude'],
      error: 'Latitude must be between −90° and 90°.',
    };
  }

  if (longitude.value < -180 || longitude.value > 180) {
    return {
      ok: false,
      fields: ['longitude'],
      error: 'Longitude must be between −180° and 180°.',
    };
  }

  return {
    ok: true,
    latitude: latitude.value,
    longitude: longitude.value,
  };
}

function formatCoordinatePart(value, positiveDirection, negativeDirection) {
  const magnitude = Math.abs(value).toFixed(4);

  if (value === 0) {
    return `${magnitude}°`;
  }

  return `${magnitude}° ${value > 0 ? positiveDirection : negativeDirection}`;
}

export function formatCoordinates(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return 'No location selected';
  }

  return `${formatCoordinatePart(latitude, 'N', 'S')}, ${formatCoordinatePart(
    longitude,
    'E',
    'W',
  )}`;
}

export function describeGeolocationError(error) {
  if (Number.isInteger(error?.code) && GEOLOCATION_ERROR_MESSAGES.has(error.code)) {
    return GEOLOCATION_ERROR_MESSAGES.get(error.code);
  }

  return 'Your location could not be determined. Try again or enter coordinates manually.';
}

export function getBrowserPosition({
  geolocation = globalThis.navigator?.geolocation,
  options = DEFAULT_GEOLOCATION_OPTIONS,
} = {}) {
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(
        new LocationError(
          'Geolocation is not supported by this browser. Enter coordinates manually.',
          'UNSUPPORTED',
        ),
      );
      return;
    }

    if (globalThis.isSecureContext === false) {
      reject(
        new LocationError(
          'Location needs a secure page. Open this app through localhost or enter coordinates manually.',
          'INSECURE_CONTEXT',
        ),
      );
      return;
    }

    try {
      geolocation.getCurrentPosition(
        (position) => {
          const validated = validateCoordinates(
            position?.coords?.latitude,
            position?.coords?.longitude,
          );

          if (!validated.ok) {
            reject(new LocationError(validated.error, 'INVALID_COORDINATES'));
            return;
          }

          resolve({
            latitude: validated.latitude,
            longitude: validated.longitude,
          });
        },
        (error) => {
          reject(new LocationError(describeGeolocationError(error), 'GEOLOCATION_ERROR'));
        },
        options,
      );
    } catch (error) {
      reject(new LocationError(error?.message || 'Location request failed.', 'REQUEST_FAILED'));
    }
  });
}

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeGeolocationError,
  formatCoordinates,
  getBrowserPosition,
  LocationError,
  validateCoordinates,
} from '../src/location.js';

test('valid coordinates are returned as numbers', () => {
  assert.deepEqual(validateCoordinates('54.6872', '25.2797'), {
    ok: true,
    latitude: 54.6872,
    longitude: 25.2797,
  });

  assert.deepEqual(validateCoordinates(0, 0), {
    ok: true,
    latitude: 0,
    longitude: 0,
  });

  assert.deepEqual(validateCoordinates(' -33.8688 ', '151.2093'), {
    ok: true,
    latitude: -33.8688,
    longitude: 151.2093,
  });
});

test('missing coordinate pairs are reported together', () => {
  const result = validateCoordinates('', '  ');
  assert.equal(result.ok, false);
  assert.deepEqual(result.fields, ['latitude', 'longitude']);
});

test('a single missing coordinate identifies the field', () => {
  const missingLatitude = validateCoordinates('', '25');
  assert.equal(missingLatitude.ok, false);
  assert.deepEqual(missingLatitude.fields, ['latitude']);

  const missingLongitude = validateCoordinates('54', null);
  assert.equal(missingLongitude.ok, false);
  assert.deepEqual(missingLongitude.fields, ['longitude']);
});

test('non-finite and non-numeric coordinates are rejected', () => {
  for (const [latitude, longitude] of [
    ['not-a-number', '25'],
    [Number.NaN, 25],
    [Infinity, 25],
    ['54', 'Infinity'],
    [null, null],
  ]) {
    const result = validateCoordinates(latitude, longitude);
    assert.equal(result.ok, false, `expected rejection for ${String(latitude)}, ${String(longitude)}`);
  }
});

test('out-of-range coordinates are rejected with the affected field', () => {
  const latitude = validateCoordinates(90.0001, 25);
  assert.equal(latitude.ok, false);
  assert.deepEqual(latitude.fields, ['latitude']);

  const longitude = validateCoordinates(54, -180.0001);
  assert.equal(longitude.ok, false);
  assert.deepEqual(longitude.fields, ['longitude']);
});

test('coordinates are formatted with cardinal directions', () => {
  assert.equal(formatCoordinates(54.6872, 25.2797), '54.6872° N, 25.2797° E');
  assert.equal(formatCoordinates(-33.8688, -70.6693), '33.8688° S, 70.6693° W');
  assert.equal(formatCoordinates(0, 0), '0.0000°, 0.0000°');
  assert.equal(formatCoordinates(Number.NaN, 0), 'No location selected');
});

test('geolocation errors have friendly messages', () => {
  assert.match(describeGeolocationError({ code: 1 }), /permission/i);
  assert.match(describeGeolocationError({ code: 2 }), /unavailable/i);
  assert.match(describeGeolocationError({ code: 3 }), /timed out/i);
  assert.match(describeGeolocationError({ code: 99 }), /could not be determined/i);
});

test('getBrowserPosition resolves validated coordinates', async () => {
  const geolocation = {
    getCurrentPosition(success) {
      success({ coords: { latitude: 54.6872, longitude: 25.2797 } });
    },
  };

  await assert.doesNotReject(async () => {
    const result = await getBrowserPosition({ geolocation });
    assert.deepEqual(result, { latitude: 54.6872, longitude: 25.2797 });
  });
});

test('getBrowserPosition rejects permission failures with LocationError', async () => {
  const geolocation = {
    getCurrentPosition(_success, failure) {
      failure({ code: 1 });
    },
  };

  await assert.rejects(
    () => getBrowserPosition({ geolocation }),
    (error) => error instanceof LocationError && /permission/i.test(error.message),
  );
});

test('getBrowserPosition rejects unsupported and invalid positions', async () => {
  await assert.rejects(
    () => getBrowserPosition({ geolocation: null }),
    (error) => error instanceof LocationError && error.code === 'UNSUPPORTED',
  );

  const geolocation = {
    getCurrentPosition(success) {
      success({ coords: { latitude: 100, longitude: 25 } });
    },
  };

  await assert.rejects(
    () => getBrowserPosition({ geolocation }),
    (error) => error instanceof LocationError && error.code === 'INVALID_COORDINATES',
  );
});

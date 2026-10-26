import assert from 'node:assert/strict';
import test from 'node:test';

import {
  directionFromHorizontalCoordinates,
  headingFromYaw,
  moonPhaseName,
} from '../src/celestial.js';

function assertClose(actual, expected, message, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

test('horizontal coordinates map to a Three.js world direction', () => {
  const north = directionFromHorizontalCoordinates(0, 0);
  assertClose(north.x, 0, 'north x');
  assertClose(north.y, 0, 'north y');
  assertClose(north.z, -1, 'north z');

  const east = directionFromHorizontalCoordinates(90, 0);
  assertClose(east.x, 1, 'east x');
  assertClose(east.y, 0, 'east y');
  assertClose(east.z, 0, 'east z');

  const south = directionFromHorizontalCoordinates(180, 0);
  assertClose(south.x, 0, 'south x');
  assertClose(south.y, 0, 'south y');
  assertClose(south.z, 1, 'south z');

  const zenith = directionFromHorizontalCoordinates(123, 90);
  assertClose(zenith.x, 0, 'zenith x');
  assertClose(zenith.y, 1, 'zenith y');
  assertClose(zenith.z, 0, 'zenith z');
});

test('horizontal directions are unit length', () => {
  for (const [azimuth, altitude] of [
    [0, 0],
    [45, 30],
    [180, -20],
    [315, 75],
  ]) {
    const direction = directionFromHorizontalCoordinates(azimuth, altitude);
    const length = Math.hypot(direction.x, direction.y, direction.z);
    assertClose(length, 1, `length at ${azimuth}, ${altitude}`);
  }
});

test('invalid horizontal coordinates return null', () => {
  assert.equal(directionFromHorizontalCoordinates(Number.NaN, 0), null);
  assert.equal(directionFromHorizontalCoordinates(0, Infinity), null);
});

test('camera yaw converts back to a north-based heading', () => {
  assertClose(headingFromYaw(0), 0, 'north');
  assertClose(headingFromYaw(-Math.PI / 2), 90, 'east');
  assertClose(headingFromYaw(-Math.PI), 180, 'south');
  assertClose(headingFromYaw(-Math.PI * 1.5), 270, 'west');
  assert.equal(headingFromYaw(Number.NaN), 0);
});

test('moon phases map to the eight standard names', () => {
  assert.equal(moonPhaseName(0), 'New Moon');
  assert.equal(moonPhaseName(0.12), 'Waxing Crescent');
  assert.equal(moonPhaseName(0.25), 'First Quarter');
  assert.equal(moonPhaseName(0.38), 'Waxing Gibbous');
  assert.equal(moonPhaseName(0.5), 'Full Moon');
  assert.equal(moonPhaseName(0.62), 'Waning Gibbous');
  assert.equal(moonPhaseName(0.75), 'Last Quarter');
  assert.equal(moonPhaseName(0.793), 'Waning Crescent');
  assert.equal(moonPhaseName(0.88), 'Waning Crescent');
  assert.equal(moonPhaseName(1), 'New Moon');
  assert.equal(moonPhaseName(Number.NaN), '—');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { compassDirection, projectSun, skyPhase } from '../src/sky.js';

const geometry = {
  centerX: 200,
  centerY: 200,
  radius: 100,
};

function assertClose(actual, expected, message, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

test('zenith projects to the centre regardless of azimuth', () => {
  for (const azimuth of [0, 45, 180, 315]) {
    const point = projectSun({ ...geometry, azimuth, altitude: 90 });
    assertClose(point.x, geometry.centerX, `zenith x at azimuth ${azimuth}`);
    assertClose(point.y, geometry.centerY, `zenith y at azimuth ${azimuth}`);
  }
});

test('horizon projects to the outer circle at the four cardinal points', () => {
  const cases = [
    { azimuth: 0, x: 200, y: 100 },
    { azimuth: 90, x: 300, y: 200 },
    { azimuth: 180, x: 200, y: 300 },
    { azimuth: 270, x: 100, y: 200 },
  ];

  for (const expected of cases) {
    const point = projectSun({ ...geometry, altitude: 0, azimuth: expected.azimuth });
    assertClose(point.x, expected.x, `horizon x at azimuth ${expected.azimuth}`);
    assertClose(point.y, expected.y, `horizon y at azimuth ${expected.azimuth}`);
  }
});

test('intermediate altitude projects between centre and horizon', () => {
  const point = projectSun({ ...geometry, azimuth: 90, altitude: 45 });
  assertClose(point.x, 250, '45 degree east x');
  assertClose(point.y, 200, '45 degree east y');
});

test('below-horizon and invalid positions are rejected', () => {
  assert.equal(projectSun({ ...geometry, azimuth: 180, altitude: -0.1 }), null);
  assert.equal(projectSun({ ...geometry, azimuth: 180, altitude: 91 }), null);
  assert.equal(projectSun({ ...geometry, azimuth: Number.NaN, altitude: 10 }), null);
  assert.equal(projectSun({ ...geometry, radius: 0, azimuth: 0, altitude: 10 }), null);
});

test('azimuth is normalised before projection', () => {
  const wrapped = projectSun({ ...geometry, azimuth: 450, altitude: 0 });
  const cardinal = projectSun({ ...geometry, azimuth: 90, altitude: 0 });
  assertClose(wrapped.x, cardinal.x, 'wrapped azimuth x');
  assertClose(wrapped.y, cardinal.y, 'wrapped azimuth y');
});

test('compass directions map to a 16-point rose', () => {
  assert.equal(compassDirection(0), 'N');
  assert.equal(compassDirection(22.5), 'NNE');
  assert.equal(compassDirection(90), 'E');
  assert.equal(compassDirection(180), 'S');
  assert.equal(compassDirection(270), 'W');
  assert.equal(compassDirection(359.9), 'N');
  assert.equal(compassDirection(-45), 'NW');
  assert.equal(compassDirection(Number.NaN), '—');
});

test('sky phases reflect whether the Sun is above the horizon', () => {
  assert.equal(skyPhase(Number.NaN).key, 'waiting');
  assert.equal(skyPhase(24).key, 'day');
  assert.equal(skyPhase(0).key, 'day');
  assert.equal(skyPhase(-0.1).key, 'twilight');
  assert.equal(skyPhase(-6).key, 'twilight');
  assert.equal(skyPhase(-6.1).key, 'night');
});

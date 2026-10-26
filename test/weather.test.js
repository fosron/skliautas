import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWeatherUrl,
  describeWeatherCode,
  fetchWeather,
  normalizeWeatherResponse,
  roundWeatherCoordinates,
  weatherKind,
} from '../src/weather.js';

const samplePayload = {
  latitude: 40.710335,
  longitude: -73.99308,
  timezone: 'America/New_York',
  current_units: {
    temperature_2m: '°C',
    relative_humidity_2m: '%',
    apparent_temperature: '°C',
    precipitation: 'mm',
    weather_code: 'wmo code',
    cloud_cover: '%',
    visibility: 'm',
    wind_speed_10m: 'km/h',
    wind_direction_10m: '°',
  },
  current: {
    time: '2026-10-26T15:00',
    interval: 900,
    temperature_2m: 21.9,
    relative_humidity_2m: 32,
    apparent_temperature: 18.5,
    precipitation: 0,
    weather_code: 0,
    cloud_cover: 0,
    visibility: 60800,
    wind_speed_10m: 14.4,
    wind_direction_10m: 289,
  },
};

test('weather coordinates are rounded before leaving the browser', () => {
  assert.equal(roundWeatherCoordinates(54.6872123), 54.69);
  assert.equal(roundWeatherCoordinates(-74.00601), -74.01);
  assert.equal(roundWeatherCoordinates(-0.004), -0);
});

test('weather URL targets Open-Meteo with rounded coordinates and current fields', () => {
  const url = new URL(buildWeatherUrl(54.6872, 25.2797));

  assert.equal(url.origin, 'https://api.open-meteo.com');
  assert.equal(url.pathname, '/v1/forecast');
  assert.equal(url.searchParams.get('latitude'), '54.69');
  assert.equal(url.searchParams.get('longitude'), '25.28');
  assert.equal(url.searchParams.get('timezone'), 'auto');
  assert.equal(url.searchParams.get('forecast_days'), '1');
  assert.match(url.searchParams.get('current'), /cloud_cover/);
  assert.match(url.searchParams.get('current'), /weather_code/);
  assert.equal(url.searchParams.get('temperature_unit'), 'celsius');
  assert.equal(url.searchParams.has('apikey'), false);
});

test('invalid coordinates are rejected before building a weather URL', () => {
  assert.throws(() => buildWeatherUrl(Number.NaN, 25), /Latitude/);
  assert.throws(() => buildWeatherUrl(54, Infinity), /Longitude/);
});

test('weather codes map to friendly condition labels and kinds', () => {
  assert.equal(describeWeatherCode(0), 'Clear sky');
  assert.equal(describeWeatherCode(2), 'Partly cloudy');
  assert.equal(describeWeatherCode(61), 'Slight rain');
  assert.equal(describeWeatherCode(95), 'Thunderstorm');
  assert.equal(describeWeatherCode(1234), 'Unknown conditions');
  assert.equal(weatherKind(0), 'clear');
  assert.equal(weatherKind(3), 'cloudy');
  assert.equal(weatherKind(45), 'fog');
  assert.equal(weatherKind(63), 'rain');
  assert.equal(weatherKind(73), 'snow');
  assert.equal(weatherKind(96), 'storm');
});

test('weather response is normalized and visibility is converted to kilometres', () => {
  const weather = normalizeWeatherResponse(samplePayload);

  assert.equal(weather.condition, 'Clear sky');
  assert.equal(weather.kind, 'clear');
  assert.equal(weather.temperature, 21.9);
  assert.equal(weather.feelsLike, 18.5);
  assert.equal(weather.humidity, 32);
  assert.equal(weather.cloudCover, 0);
  assert.equal(weather.visibilityKm, 60.8);
  assert.equal(weather.windSpeed, 14.4);
  assert.equal(weather.windDirection, 289);
  assert.equal(weather.observedAt, '2026-10-26T15:00');
  assert.equal(weather.timezone, 'America/New_York');
});

test('missing current conditions and cloud cover are rejected', () => {
  assert.throws(() => normalizeWeatherResponse({}), /no current conditions/);
  assert.throws(
    () =>
      normalizeWeatherResponse({
        current: { ...samplePayload.current, cloud_cover: null },
      }),
    /no cloud cover/,
  );
});

test('fetchWeather rejects HTTP failures and sends a no-referrer request', async () => {
  let requestUrl;
  let requestOptions;

  const weather = await fetchWeather({
    latitude: 40.7128,
    longitude: -74.006,
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return {
        ok: true,
        json: async () => samplePayload,
      };
    },
  });

  assert.match(requestUrl, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
  assert.equal(requestOptions.credentials, 'omit');
  assert.equal(requestOptions.referrerPolicy, 'no-referrer');
  assert.equal(weather.temperature, 21.9);

  await assert.rejects(
    () =>
      fetchWeather({
        latitude: 40.7128,
        longitude: -74.006,
        fetchImpl: async () => ({ ok: false, status: 429 }),
      }),
    /HTTP 429/,
  );

  await assert.rejects(
    () =>
      fetchWeather({
        latitude: 40.7128,
        longitude: -74.006,
        fetchImpl: async () => ({
          ok: true,
          json: async () => {
            throw new SyntaxError('bad JSON');
          },
        }),
      }),
    /invalid JSON/,
  );
});

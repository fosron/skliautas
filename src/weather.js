const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast';
const WEATHER_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'precipitation',
  'weather_code',
  'cloud_cover',
  'visibility',
  'wind_speed_10m',
  'wind_direction_10m',
].join(',');

const WEATHER_CODE_LABELS = new Map([
  [0, 'Clear sky'],
  [1, 'Mainly clear'],
  [2, 'Partly cloudy'],
  [3, 'Overcast'],
  [45, 'Fog'],
  [48, 'Rime fog'],
  [51, 'Light drizzle'],
  [53, 'Moderate drizzle'],
  [55, 'Dense drizzle'],
  [56, 'Light freezing drizzle'],
  [57, 'Dense freezing drizzle'],
  [61, 'Slight rain'],
  [63, 'Moderate rain'],
  [65, 'Heavy rain'],
  [66, 'Light freezing rain'],
  [67, 'Heavy freezing rain'],
  [71, 'Slight snow'],
  [73, 'Moderate snow'],
  [75, 'Heavy snow'],
  [77, 'Snow grains'],
  [80, 'Slight rain showers'],
  [81, 'Moderate rain showers'],
  [82, 'Violent rain showers'],
  [85, 'Slight snow showers'],
  [86, 'Heavy snow showers'],
  [95, 'Thunderstorm'],
  [96, 'Thunderstorm with hail'],
  [99, 'Severe thunderstorm with hail'],
]);

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requireFinite(value, name) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }

  return value;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function describeWeatherCode(code) {
  return WEATHER_CODE_LABELS.get(Number(code)) ?? 'Unknown conditions';
}

export function weatherKind(code) {
  const value = Number(code);

  if (value === 0 || value === 1) return 'clear';
  if (value === 2 || value === 3) return 'cloudy';
  if (value === 45 || value === 48) return 'fog';
  if ((value >= 51 && value <= 67) || (value >= 80 && value <= 82)) return 'rain';
  if ((value >= 71 && value <= 77) || value === 85 || value === 86) return 'snow';
  if (value >= 95) return 'storm';
  return 'cloudy';
}

export function roundWeatherCoordinates(value) {
  return Math.round(value * 100) / 100;
}

export function buildWeatherUrl(latitude, longitude) {
  requireFinite(latitude, 'Latitude');
  requireFinite(longitude, 'Longitude');

  const parameters = new URLSearchParams({
    latitude: roundWeatherCoordinates(latitude).toFixed(2),
    longitude: roundWeatherCoordinates(longitude).toFixed(2),
    current: WEATHER_FIELDS,
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    timezone: 'auto',
    forecast_days: '1',
  });

  return `${WEATHER_API_URL}?${parameters.toString()}`;
}

export function normalizeWeatherResponse(payload) {
  const current = payload?.current;

  if (!current) {
    throw new Error('The weather service returned no current conditions.');
  }

  const weatherCode = Number(current.weather_code);
  if (!Number.isInteger(weatherCode)) {
    throw new Error('The weather service returned an invalid condition code.');
  }

  const cloudCover = finiteOrNull(current.cloud_cover);
  if (cloudCover === null) {
    throw new Error('The weather service returned no cloud cover.');
  }

  const visibility = finiteOrNull(current.visibility);
  const visibilityUnit = payload?.current_units?.visibility;
  const visibilityKm =
    visibility === null
      ? null
      : visibilityUnit === 'km'
        ? visibility
        : visibility / 1000;

  return {
    weatherCode,
    condition: describeWeatherCode(weatherCode),
    kind: weatherKind(weatherCode),
    temperature: finiteOrNull(current.temperature_2m),
    feelsLike: finiteOrNull(current.apparent_temperature),
    humidity: finiteOrNull(current.relative_humidity_2m),
    precipitation: finiteOrNull(current.precipitation),
    cloudCover: clamp(cloudCover, 0, 100),
    visibilityKm,
    windSpeed: finiteOrNull(current.wind_speed_10m),
    windDirection: finiteOrNull(current.wind_direction_10m),
    observedAt: typeof current.time === 'string' ? current.time : null,
    timezone: typeof payload.timezone === 'string' ? payload.timezone : null,
    fetchedAt: Date.now(),
  };
}

export async function fetchWeather({
  latitude,
  longitude,
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Weather requests are not supported by this browser.');
  }

  const response = await fetchImpl(buildWeatherUrl(latitude, longitude), {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`The weather service returned HTTP ${response.status}.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The weather service returned invalid JSON.');
  }

  if (payload?.error) {
    throw new Error(payload.reason || 'The weather service returned an error.');
  }

  return normalizeWeatherResponse(payload);
}

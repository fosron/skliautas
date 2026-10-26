import * as SunCalc from 'suncalc';

import { moonPhaseName } from './celestial.js';
import {
  describeGeolocationError,
  formatCoordinates,
  getBrowserPosition,
  LocationError,
  validateCoordinates,
} from './location.js';
import { compassDirection, drawSky, skyPhase } from './sky.js';
import { fetchWeather, roundWeatherCoordinates } from './weather.js';

const REFRESH_INTERVAL_MS = 60_000;
const WEATHER_MAX_AGE_MS = 10 * 60_000;

const angleFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const weatherNumberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

const updatedTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
});

const eventTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const elements = {
  canvas: document.querySelector('#sky-canvas'),
  canvas3D: document.querySelector('#sky-3d-canvas'),
  skyStage: document.querySelector('#sky-stage'),
  liveBadge: document.querySelector('#live-badge'),
  refreshButton: document.querySelector('#refresh-button'),
  altitude: document.querySelector('#altitude-value'),
  azimuth: document.querySelector('#azimuth-value'),
  direction: document.querySelector('#direction-value'),
  skyPhase: document.querySelector('#sky-phase'),
  lastUpdated: document.querySelector('#last-updated'),
  locateButton: document.querySelector('#locate-button'),
  locationForm: document.querySelector('#location-form'),
  latitudeInput: document.querySelector('#latitude'),
  longitudeInput: document.querySelector('#longitude'),
  locationStatus: document.querySelector('#location-status'),
  coordinates: document.querySelector('#coordinates-value'),
  sunrise: document.querySelector('#sunrise-value'),
  sunset: document.querySelector('#sunset-value'),
  moonPhase: document.querySelector('#moon-phase-value'),
  moonPosition: document.querySelector('#moon-position-value'),
  viewMapButton: document.querySelector('#view-map'),
  view3DButton: document.querySelector('#view-3d'),
  viewEyebrow: document.querySelector('#view-eyebrow'),
  viewHint: document.querySelector('#view-hint'),
  footerOrientation: document.querySelector('#footer-orientation'),
  facingBadge: document.querySelector('#facing-badge'),
  facingValue: document.querySelector('#facing-value'),
  sceneEmpty: document.querySelector('#scene-empty'),
  sceneControls: document.querySelector('#scene-controls'),
  groundToggle: document.querySelector('#ground-toggle'),
  fullscreenButton: document.querySelector('#fullscreen-button'),
  sceneWeather: document.querySelector('#scene-weather'),
  sceneWeatherTemp: document.querySelector('#scene-weather-temp'),
  sceneWeatherCondition: document.querySelector('#scene-weather-condition'),
  sceneWeatherMeta: document.querySelector('#scene-weather-meta'),
  weatherPanel: document.querySelector('#weather-panel'),
  weatherTemperature: document.querySelector('#weather-temperature'),
  weatherCondition: document.querySelector('#weather-condition'),
  weatherFeelsLike: document.querySelector('#weather-feels-like'),
  weatherCloudCover: document.querySelector('#weather-cloud-cover'),
  weatherHumidity: document.querySelector('#weather-humidity'),
  weatherWind: document.querySelector('#weather-wind'),
  weatherPrecipitation: document.querySelector('#weather-precipitation'),
  weatherVisibility: document.querySelector('#weather-visibility'),
  weatherStatus: document.querySelector('#weather-status'),
};

const locateButtonLabel = elements.locateButton.querySelector('span');
const fullscreenSupported = Boolean(
  document.fullscreenEnabled && elements.skyStage.requestFullscreen,
);

if (!fullscreenSupported) {
  elements.fullscreenButton.hidden = true;
}

let activeLocation = null;
let latestReading = null;
let refreshTimer = null;
let geolocationRequestId = 0;
let locating = false;
let viewMode = 'map';
let viewLoading = false;
let view3DUnavailable = false;
let sky3D = null;
let sky3DModulePromise = null;
let sky3DNeedsFocus = true;
let latestWeather = null;
let weatherLoading = false;
let weatherError = '';
let weatherAbortController = null;
let weatherRequestId = 0;
let weatherRequestKey = null;
let weatherLastAttemptAt = 0;
let groundVisible = true;

function setStatus(message, tone = 'neutral') {
  elements.locationStatus.textContent = message;
  elements.locationStatus.dataset.tone = tone;
}

function setLocating(nextLocating) {
  locating = nextLocating;
  elements.locateButton.disabled = nextLocating;
  elements.locateButton.setAttribute('aria-busy', String(nextLocating));
  locateButtonLabel.textContent = nextLocating ? 'Finding location…' : 'Use my location';
}

function formatAngle(degrees) {
  return Number.isFinite(degrees) ? `${angleFormatter.format(degrees)}°` : '—';
}

function formatEventTime(date) {
  return date instanceof Date && Number.isFinite(date.getTime())
    ? eventTimeFormatter.format(date)
    : 'No event';
}

function isSceneFullscreen() {
  return document.fullscreenElement === elements.skyStage;
}

function currentWeatherKey() {
  if (!activeLocation) {
    return null;
  }

  const latitude = roundWeatherCoordinates(activeLocation.latitude).toFixed(2);
  const longitude = roundWeatherCoordinates(activeLocation.longitude).toFixed(2);
  return `${latitude},${longitude}`;
}

function weatherForCurrentLocation() {
  return latestWeather?.locationKey === currentWeatherKey() ? latestWeather : null;
}

function formatWeatherTemperature(value) {
  return Number.isFinite(value) ? `${Math.round(value)}°C` : '—';
}

function formatWeatherPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : '—';
}

function formatWeatherWind(weather) {
  if (!weather) {
    return '—';
  }

  const speed = Number.isFinite(weather.windSpeed)
    ? `${weatherNumberFormatter.format(weather.windSpeed)} km/h`
    : '';
  const direction = Number.isFinite(weather.windDirection)
    ? compassDirection(weather.windDirection)
    : '';

  return [speed, direction].filter(Boolean).join(' · ') || '—';
}

function formatWeatherPrecipitation(value) {
  return Number.isFinite(value) ? `${weatherNumberFormatter.format(value)} mm` : '—';
}

function formatWeatherVisibility(value) {
  return Number.isFinite(value) ? `${weatherNumberFormatter.format(value)} km` : '—';
}

function weatherObservedTime(weather) {
  const match = /T(\d{2}:\d{2})/.exec(weather?.observedAt ?? '');
  return match ? match[1] : null;
}

function updateWeatherUI() {
  const shouldShow = viewMode === '3d' && Boolean(activeLocation);
  const weather = weatherForCurrentLocation();
  const temperature = formatWeatherTemperature(weather?.temperature);

  elements.weatherPanel.hidden = !shouldShow;

  elements.weatherTemperature.textContent = temperature;
  elements.weatherCondition.textContent = weather
    ? weather.condition
    : weatherError
      ? 'Weather unavailable'
      : weatherLoading
        ? 'Fetching conditions…'
        : 'Weather not loaded';
  elements.weatherFeelsLike.textContent = formatWeatherTemperature(weather?.feelsLike);
  elements.weatherCloudCover.textContent = formatWeatherPercent(weather?.cloudCover);
  elements.weatherHumidity.textContent = formatWeatherPercent(weather?.humidity);
  elements.weatherWind.textContent = formatWeatherWind(weather);
  elements.weatherPrecipitation.textContent = formatWeatherPrecipitation(
    weather?.precipitation,
  );
  elements.weatherVisibility.textContent = formatWeatherVisibility(weather?.visibilityKm);

  let weatherStatus = 'Weather has not been requested.';
  let weatherTone = 'neutral';

  if (weatherLoading) {
    weatherStatus = weather
      ? 'Refreshing local conditions…'
      : 'Fetching local conditions…';
    weatherTone = 'loading';
  } else if (weatherError) {
    weatherStatus = weather
      ? 'Live refresh failed; showing the last reading.'
      : 'Weather unavailable. The 3D sky is using clear conditions.';
    weatherTone = 'error';
  } else if (weather) {
    const observedAt = weatherObservedTime(weather);
    weatherStatus = observedAt
      ? `Observed ${observedAt} at the location · cached for 10 minutes.`
      : 'Local conditions loaded · cached for 10 minutes.';
    weatherTone = 'success';
  }

  elements.weatherStatus.textContent = weatherStatus;
  elements.weatherStatus.dataset.tone = weatherTone;
  elements.weatherStatus.title = weatherError || '';

  elements.sceneWeather.hidden = !shouldShow;

  if (shouldShow) {
    elements.sceneWeatherTemp.textContent = temperature;
    elements.sceneWeatherCondition.textContent = weather
      ? weather.condition
      : weatherError
        ? 'Weather unavailable'
        : weatherLoading
          ? 'Fetching weather…'
          : 'Weather not loaded';
    elements.sceneWeatherMeta.textContent = weather
      ? `${formatWeatherPercent(weather.cloudCover)} cloud · ${formatWeatherWind(weather)}`
      : weatherError
        ? 'Clear-sky fallback'
        : 'Open-Meteo';
  }
}

function updateGroundControl(visible) {
  const label = visible ? 'Hide ground and horizon' : 'Show ground and horizon';
  elements.groundToggle.setAttribute('aria-pressed', String(visible));
  elements.groundToggle.setAttribute('aria-label', label);
  elements.groundToggle.title = label;
}

function updateFullscreenChrome() {
  const active = isSceneFullscreen();
  elements.skyStage.classList.toggle('is-fullscreen', active);
  elements.fullscreenButton.setAttribute('aria-pressed', String(active));

  const label = active ? 'Exit fullscreen' : 'Enter fullscreen';
  elements.fullscreenButton.setAttribute('aria-label', label);
  elements.fullscreenButton.title = label;

  updateWeatherUI();
  requestAnimationFrame(() => sky3D?.resize());
}

async function toggleFullscreen() {
  if (!fullscreenSupported || !sky3D) {
    return;
  }

  try {
    if (isSceneFullscreen()) {
      await document.exitFullscreen();
    } else {
      await elements.skyStage.requestFullscreen();
    }
  } catch {
    setStatus(
      'Fullscreen could not start. Your browser may block fullscreen for this page.',
      'error',
    );
  }
}

function handleGroundToggle() {
  if (!sky3D) {
    return;
  }

  groundVisible = !groundVisible;
  sky3D.setGroundVisible(groundVisible);
  updateGroundControl(groundVisible);
}

function invalidateWeatherRequest() {
  weatherRequestId += 1;
  weatherAbortController?.abort();
  weatherAbortController = null;
  weatherLoading = false;
  weatherRequestKey = null;
}

function cancelWeatherRequest() {
  const wasLoading = weatherLoading;
  invalidateWeatherRequest();

  if (wasLoading && !latestWeather) {
    weatherLastAttemptAt = 0;
  }

  updateWeatherUI();
}

function resetWeatherForLocationChange() {
  invalidateWeatherRequest();
  latestWeather = null;
  weatherError = '';
  weatherLastAttemptAt = 0;
  updateWeatherUI();
  syncSky3DScene();
}

function requestWeather({ force = false } = {}) {
  if (!activeLocation || viewMode !== '3d') {
    return;
  }

  const key = currentWeatherKey();
  if (!key) {
    return;
  }

  const now = Date.now();

  if (!force) {
    if (weatherLoading && weatherRequestKey === key) {
      return;
    }

    if (
      latestWeather?.locationKey === key &&
      now - latestWeather.fetchedAt < WEATHER_MAX_AGE_MS
    ) {
      return;
    }

    if (weatherLastAttemptAt && now - weatherLastAttemptAt < WEATHER_MAX_AGE_MS) {
      return;
    }
  }

  invalidateWeatherRequest();
  const requestId = weatherRequestId;
  const controller = new AbortController();
  const latitude = activeLocation.latitude;
  const longitude = activeLocation.longitude;

  weatherAbortController = controller;
  weatherRequestKey = key;
  weatherLoading = true;
  weatherError = '';
  weatherLastAttemptAt = now;

  if (latestWeather?.locationKey !== key) {
    latestWeather = null;
  }

  updateWeatherUI();
  syncSky3DScene();

  fetchWeather({
    latitude,
    longitude,
    signal: controller.signal,
  })
    .then((weather) => {
      if (requestId !== weatherRequestId || viewMode !== '3d') {
        return;
      }

      latestWeather = {
        ...weather,
        locationKey: key,
      };
      weatherLoading = false;
      weatherAbortController = null;
      weatherRequestKey = null;
      weatherError = '';
      updateWeatherUI();
      syncSky3DScene();
    })
    .catch((error) => {
      if (controller.signal.aborted || requestId !== weatherRequestId) {
        return;
      }

      weatherLoading = false;
      weatherAbortController = null;
      weatherRequestKey = null;
      weatherError = error?.message || 'Weather request failed.';
      updateWeatherUI();
      syncSky3DScene();
    });
}

function updateViewChrome() {
  const is3D = viewMode === '3d';

  elements.canvas.hidden = is3D;
  elements.canvas3D.hidden = !is3D;
  elements.facingBadge.hidden = !is3D;
  elements.sceneControls.hidden = !is3D;
  elements.sceneEmpty.hidden = !is3D || Boolean(latestReading);
  elements.skyStage.classList.toggle('is-3d', is3D);

  elements.viewMapButton.setAttribute('aria-pressed', String(!is3D));
  elements.view3DButton.setAttribute('aria-pressed', String(is3D));
  elements.viewMapButton.disabled = viewLoading;
  elements.view3DButton.disabled = viewLoading || view3DUnavailable;
  elements.view3DButton.title = view3DUnavailable
    ? '3D view is unavailable in this browser'
    : 'Show the 3D horizon view';
  elements.refreshButton.setAttribute(
    'aria-label',
    is3D ? 'Update sky and weather now' : 'Update sky now',
  );
  elements.refreshButton.title = is3D ? 'Update sky and weather now' : 'Update sky now';
  elements.skyStage.setAttribute('aria-busy', String(viewLoading));

  elements.viewEyebrow.textContent = is3D ? 'Horizon view' : 'Zenith view';

  if (viewLoading) {
    elements.viewHint.textContent = 'Preparing 3D view…';
  } else if (is3D) {
    elements.viewHint.textContent = 'Drag or use arrow keys to look around';
  } else if (view3DUnavailable) {
    elements.viewHint.textContent = 'Top-down view · 3D unavailable';
  } else {
    elements.viewHint.textContent = 'Top-down view · north up';
  }

  elements.footerOrientation.textContent = is3D
    ? 'Drag to look around · horizon stays level'
    : 'North is up · centre is overhead · edge is the horizon';

  updateWeatherUI();
}

function handle3DHeading(headingDegrees) {
  const roundedHeading = Math.round(headingDegrees) % 360;
  elements.facingValue.textContent = `${compassDirection(headingDegrees)} · ${roundedHeading}°`;
}

function markInvalidFields(fields = []) {
  for (const [name, input] of [
    ['latitude', elements.latitudeInput],
    ['longitude', elements.longitudeInput],
  ]) {
    if (fields.includes(name)) {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
  }
}

function focusInvalidField(fields = []) {
  if (fields.includes('latitude')) {
    elements.latitudeInput.focus();
  } else if (fields.includes('longitude')) {
    elements.longitudeInput.focus();
  }
}

function currentCanvasState() {
  if (!latestReading) {
    return { active: false, phase: 'waiting' };
  }

  return {
    active: true,
    altitude: latestReading.position.altitude,
    azimuth: latestReading.position.azimuth,
    phase: latestReading.phase.key,
  };
}

function redrawSky() {
  if (!elements.canvas || viewMode !== 'map') {
    return;
  }

  drawSky(elements.canvas, currentCanvasState());
}

function updateCanvasLabel() {
  if (!latestReading) {
    elements.canvas.setAttribute(
      'aria-label',
      'An empty top-down sky map waiting for a location. North is at the top, the centre is directly overhead, and the outer circle is the horizon.',
    );
    return;
  }

  const { altitude, azimuth } = latestReading.position;
  const direction = compassDirection(azimuth);

  if (altitude < 0) {
    elements.canvas.setAttribute(
      'aria-label',
      `Top-down sky map. The Sun is ${formatAngle(
        Math.abs(altitude),
      )} below the horizon. North is at the top and the outer circle is the horizon.`,
    );
    return;
  }

  elements.canvas.setAttribute(
    'aria-label',
    `Top-down sky map. The Sun is ${formatAngle(
      altitude,
    )} above the horizon toward ${direction}, at an azimuth of ${formatAngle(
      azimuth,
    )}. North is at the top and the outer circle is the horizon.`,
  );
}

function update3DCanvasLabel() {
  let description = 'Interactive 3D sky.';

  if (!latestReading) {
    description += ' No location is selected.';
  } else {
    const sun = latestReading.position;
    if (sun.altitude >= 0) {
      description += ` The Sun is ${formatAngle(sun.altitude)} above the horizon toward ${compassDirection(
        sun.azimuth,
      )}.`;
    } else {
      description += ` The Sun is ${formatAngle(Math.abs(sun.altitude))} below the horizon.`;
    }

    const moon = latestReading.moonPosition;
    if (moon) {
      if (moon.altitude >= 0) {
        const moonPhase = latestReading.moonIllumination
          ? ` It is ${moonPhaseName(latestReading.moonIllumination.phase)}, ${Math.round(
              latestReading.moonIllumination.fraction * 100,
            )}% illuminated.`
          : '';
        description += ` The Moon is ${formatAngle(moon.altitude)} above the horizon toward ${compassDirection(
          moon.azimuth,
        )}.${moonPhase}`;
      } else {
        description += ` The Moon is ${formatAngle(Math.abs(moon.altitude))} below the horizon.`;
      }
    }
  }

  description += ' Drag or use the arrow keys to look around.';
  elements.canvas3D.setAttribute('aria-label', description);
}

function syncSky3DScene() {
  if (!sky3D || viewMode !== '3d') {
    return;
  }

  const sun = latestReading
    ? {
        azimuth: latestReading.position.azimuth,
        altitude: latestReading.position.altitude,
      }
    : null;

  const moon = latestReading?.moonPosition
    ? {
        azimuth: latestReading.moonPosition.azimuth,
        altitude: latestReading.moonPosition.altitude,
        illumination: latestReading.moonIllumination,
      }
    : null;

  sky3D.update({
    sun,
    moon,
    weather: weatherForCurrentLocation(),
  });
}

function focusSky3D() {
  if (!sky3D || !latestReading) {
    return;
  }

  let target = null;

  if (latestReading.position.altitude >= 0) {
    target = latestReading.position;
  } else if (latestReading.moonPosition?.altitude >= 0) {
    target = latestReading.moonPosition;
  }

  if (target) {
    // Keep the horizon in frame when the Sun or Moon is high in the sky.
    sky3D.lookAt(target.azimuth, Math.max(0, target.altitude - 8));
  }
}

async function enable3DView() {
  if (viewMode === '3d' || viewLoading || view3DUnavailable) {
    return;
  }

  viewLoading = true;
  updateViewChrome();

  try {
    if (!sky3DModulePromise) {
      sky3DModulePromise = import('./sky3d.js');
    }

    const { Sky3DView } = await sky3DModulePromise;

    if (!sky3D) {
      sky3D = new Sky3DView(elements.canvas3D, {
        onHeadingChange: handle3DHeading,
      });
    }

    viewLoading = false;
    viewMode = '3d';
    updateViewChrome();
    sky3D.setGroundVisible(groundVisible);
    updateGroundControl(groundVisible);
    sky3D.resize();
    update3DCanvasLabel();
    syncSky3DScene();

    if (sky3DNeedsFocus) {
      focusSky3D();
      sky3DNeedsFocus = false;
    }

    requestWeather();
  } catch {
    sky3DModulePromise = null;
    viewLoading = false;
    viewMode = 'map';
    view3DUnavailable = true;
    updateViewChrome();
    requestAnimationFrame(redrawSky);
    setStatus(
      'The 3D view could not start. Your browser may not support WebGL; the map view still works.',
      'error',
    );
  }
}

async function enableMapView() {
  if (viewMode === 'map' || viewLoading) {
    return;
  }

  if (isSceneFullscreen()) {
    try {
      await document.exitFullscreen();
    } catch {
      // The browser may have already exited fullscreen.
    }
  }

  viewMode = 'map';
  updateViewChrome();
  cancelWeatherRequest();
  requestAnimationFrame(redrawSky);
}

function updateDisplay(now) {
  const { position, times, phase, moonPosition, moonIllumination } = latestReading;

  elements.altitude.textContent = formatAngle(position.altitude);
  elements.azimuth.textContent = formatAngle(position.azimuth);
  elements.direction.textContent = compassDirection(position.azimuth);
  elements.coordinates.textContent = formatCoordinates(
    activeLocation.latitude,
    activeLocation.longitude,
  );
  elements.sunrise.textContent = formatEventTime(times.sunrise);
  elements.sunset.textContent = formatEventTime(times.sunset);

  if (moonPosition) {
    elements.moonPosition.textContent =
      moonPosition.altitude >= 0
        ? `${formatAngle(moonPosition.altitude)} · ${compassDirection(moonPosition.azimuth)}`
        : `${formatAngle(Math.abs(moonPosition.altitude))} below`;
  } else {
    elements.moonPosition.textContent = '—';
  }

  if (moonIllumination) {
    elements.moonPhase.textContent = `${moonPhaseName(
      moonIllumination.phase,
    )} · ${Math.round(moonIllumination.fraction * 100)}% lit`;
  } else {
    elements.moonPhase.textContent = '—';
  }

  elements.skyPhase.textContent = phase.label;
  elements.lastUpdated.textContent = `Updated ${updatedTimeFormatter.format(now)}`;

  document.body.dataset.skyState = phase.key;
  elements.liveBadge.hidden = false;
  elements.refreshButton.disabled = false;
  elements.sceneEmpty.hidden = true;

  updateCanvasLabel();
  update3DCanvasLabel();
  redrawSky();
  syncSky3DScene();
}

function positionIsUsable(position) {
  return (
    Number.isFinite(position?.azimuth) &&
    Number.isFinite(position?.altitude) &&
    position.altitude >= -90 &&
    position.altitude <= 90
  );
}

function recalculate(now = new Date()) {
  if (!activeLocation) {
    return false;
  }

  try {
    const position = SunCalc.getPosition(now, activeLocation.latitude, activeLocation.longitude);

    if (!positionIsUsable(position)) {
      throw new Error('SunCalc returned an invalid position.');
    }

    const times = SunCalc.getTimes(now, activeLocation.latitude, activeLocation.longitude);
    const phase = skyPhase(position.altitude);

    const rawMoonPosition = SunCalc.getMoonPosition(
      now,
      activeLocation.latitude,
      activeLocation.longitude,
    );
    const moonPosition = positionIsUsable(rawMoonPosition) ? rawMoonPosition : null;

    const rawMoonIllumination = SunCalc.getMoonIllumination(now);
    const moonIllumination =
      Number.isFinite(rawMoonIllumination?.fraction) &&
      Number.isFinite(rawMoonIllumination?.phase)
        ? rawMoonIllumination
        : null;

    latestReading = {
      date: now,
      position,
      times,
      phase,
      moonPosition,
      moonIllumination,
    };

    updateDisplay(now);
    return true;
  } catch (error) {
    setStatus(
      'The sky could not be calculated. The last valid reading remains visible.',
      'error',
    );
    console.error('[virtual-sky] Sky calculation failed:', error.message);
    return false;
  }
}

function startRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  refreshTimer = setInterval(() => {
    recalculate(new Date());
    if (viewMode === '3d') {
      requestWeather();
    }
  }, REFRESH_INTERVAL_MS);
}

function applyLocation({ latitude, longitude, source }) {
  const validated = validateCoordinates(latitude, longitude);
  if (!validated.ok) {
    setStatus(validated.error, 'error');
    return false;
  }

  const previousWeatherKey = currentWeatherKey();

  activeLocation = {
    latitude: validated.latitude,
    longitude: validated.longitude,
    source,
  };

  if (previousWeatherKey !== currentWeatherKey()) {
    resetWeatherForLocationChange();
  }

  markInvalidFields();
  elements.refreshButton.disabled = false;
  startRefreshTimer();

  if (!recalculate()) {
    return false;
  }

  sky3DNeedsFocus = true;
  if (viewMode === '3d') {
    focusSky3D();
    sky3DNeedsFocus = false;
    requestWeather();
  }

  setStatus(
    source === 'geolocation'
      ? 'Location found. The sky will refresh every minute.'
      : 'Location set. The sky will refresh every minute.',
    'success',
  );

  return true;
}

async function handleLocate() {
  if (locating) {
    return;
  }

  if (!navigator.geolocation) {
    setStatus(
      'Geolocation is not supported by this browser. Enter coordinates manually.',
      'error',
    );
    return;
  }

  if (globalThis.isSecureContext === false) {
    setStatus(
      'Location needs a secure page. Open this app through localhost or enter coordinates manually.',
      'error',
    );
    return;
  }

  const requestId = ++geolocationRequestId;
  setLocating(true);
  setStatus('Asking your browser for a location…', 'loading');

  try {
    const coordinates = await getBrowserPosition();

    if (requestId !== geolocationRequestId) {
      return;
    }

    elements.latitudeInput.value = coordinates.latitude.toFixed(6);
    elements.longitudeInput.value = coordinates.longitude.toFixed(6);
    applyLocation({ ...coordinates, source: 'geolocation' });
  } catch (error) {
    if (requestId !== geolocationRequestId) {
      return;
    }

    const message =
      error instanceof LocationError
        ? error.message
        : describeGeolocationError(error);
    setStatus(message, 'error');
  } finally {
    if (requestId === geolocationRequestId) {
      setLocating(false);
    }
  }
}

function handleManualSubmit(event) {
  event.preventDefault();

  // Any in-flight browser location result should no longer replace manual input.
  geolocationRequestId += 1;
  if (locating) {
    setLocating(false);
  }

  const validation = validateCoordinates(
    elements.latitudeInput.value,
    elements.longitudeInput.value,
  );

  if (!validation.ok) {
    markInvalidFields(validation.fields);
    setStatus(validation.error, 'error');
    focusInvalidField(validation.fields);
    return;
  }

  elements.latitudeInput.value = String(validation.latitude);
  elements.longitudeInput.value = String(validation.longitude);
  applyLocation({ ...validation, source: 'manual' });
}

function handleRefresh() {
  if (!activeLocation) {
    return;
  }

  const now = new Date();
  if (recalculate(now)) {
    setStatus(`Sky recalculated at ${updatedTimeFormatter.format(now)}.`, 'success');

    if (viewMode === '3d') {
      requestWeather({ force: true });
    }
  }
}

elements.locateButton.addEventListener('click', handleLocate);
elements.locationForm.addEventListener('submit', handleManualSubmit);
elements.refreshButton.addEventListener('click', handleRefresh);
elements.viewMapButton.addEventListener('click', enableMapView);
elements.view3DButton.addEventListener('click', enable3DView);
elements.groundToggle.addEventListener('click', handleGroundToggle);
elements.fullscreenButton.addEventListener('click', toggleFullscreen);

document.addEventListener('fullscreenchange', updateFullscreenChrome);
document.addEventListener('fullscreenerror', () => {
  setStatus('Fullscreen could not start for this page.', 'error');
});

for (const input of [elements.latitudeInput, elements.longitudeInput]) {
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !activeLocation || !latestReading) {
    return;
  }

  const age = Date.now() - latestReading.date.getTime();
  if (age >= REFRESH_INTERVAL_MS) {
    recalculate(new Date());

    if (viewMode === '3d') {
      requestWeather();
    }
  }
});

if ('ResizeObserver' in globalThis) {
  const resizeObserver = new ResizeObserver(redrawSky);
  resizeObserver.observe(elements.canvas);
} else {
  globalThis.addEventListener('resize', redrawSky);
}

updateGroundControl(groundVisible);
updateViewChrome();
requestAnimationFrame(redrawSky);

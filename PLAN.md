# Virtual Sky — Implementation Plan

## Goal

Build a small, client-only web app that displays the Sun's and Moon's current positions in a virtual sky using the user's location and current time. It includes a top-down Canvas map and an optional immersive 3D horizon view with look-around controls, toggleable terrain, fullscreen mode, and live weather clouds/details. Run it locally at `http://localhost` with a minimal Node.js server. The app should be easy to understand, responsive, and usable when geolocation, WebGL, or weather is unavailable.

## Research summary

- **Sun position:** Use [`suncalc`](https://github.com/mourner/suncalc) `2.1.x`, a small dependency-free astronomy library. Its v2 API, `getPosition(date, latitude, longitude)`, returns `azimuth` and `altitude` in **degrees**. Azimuth is clockwise from north (`0=N`, `90=E`, `180=S`, `270=W`); altitude is apparent/refraction-corrected degrees above the horizon. `getTimes()` supplies sunrise and sunset.
- **Location:** Use the browser's [Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition), specifically `navigator.geolocation.getCurrentPosition()`. It requires user permission and a secure context. `http://localhost` counts as secure, so no HTTPS setup is needed for local development.
- **2D rendering:** Canvas 2D is enough for a top-down sky dome. No map service, API key, account, or database is needed.
- **3D rendering:** Use [`three`](https://threejs.org/) 0.186.x with its physically inspired `Sky` addon for the atmosphere. Add a local star field, a procedural Moon sphere, and pointer/keyboard look controls. Load the 3D module on demand so the map view stays lightweight.
- **Moon:** `getMoonPosition()` supplies altitude/azimuth in degrees; `getMoonIllumination()` supplies illuminated fraction and phase. Render the Moon as a 3D sphere lit by the actual Sun direction, which produces the correct phase and bright-limb orientation. Show the phase name in the reading panel.
- **Weather:** Use the free [Open-Meteo](https://open-meteo.com/) current-weather API. No API key; CORS-enabled; attribution required under CC BY 4.0. Request only while 3D mode is active, round coordinates to two decimals, cache in memory for 10 minutes, and use the cloud-cover value to drive the Three.js Sky procedural clouds. Show condition, temperature, feels-like, humidity, cloud cover, wind, precipitation, and visibility.
- **Fullscreen:** Use the browser Fullscreen API on the 3D stage only. Keep in-scene look controls, ground toggle, facing badge, and compact weather summary available while fullscreen.
- **Local serving:** Use Node's built-in `http` module as a small static file server. No Vite, bundler, or build step.
- **Dependency loading:** SunCalc 2.1.1 and Three.js 0.186.x ship as browser-compatible ES modules. Load them directly through a browser import map pointing at local package files. No bundling is required.
- **Time:** A JavaScript `Date` represents an absolute instant, so SunCalc needs no timezone input for the current position. Display formatted times as device local time and label them accordingly.

## Basic stack

- Node.js built-in `http` server (`server.js`)
- Native browser JavaScript, ES modules, and an import map
- Semantic HTML and plain CSS
- Canvas 2D for the map, Three.js/WebGL for 3D mode
- `suncalc` and `three` as the only runtime dependencies
- Node's built-in test runner for projection/helper tests
- No framework, Vite, bundler, database, CSS library, or build step

## Local development

```sh
npm install
npm run dev
```

Open the URL printed by the server. It starts at <http://localhost:8000> and automatically tries the next free port if 8000 is occupied. The `dev` script runs `node server.js` and stays in the foreground. Run tests with:

```sh
npm test
```

There is no build command. The files served in development are the app.

## MVP behavior

1. Show a clear initial screen with a **Use my location** button and optional latitude/longitude inputs.
2. On a successful location request, calculate the Sun's position for the current date and coordinates.
3. Draw a top-down sky dome in **Map** mode:
   - outer circle = horizon;
   - center = zenith;
   - north at the top, east right, south bottom, west left;
   - rings mark altitude above the horizon;
   - a glowing Sun marker shows the calculated position.
4. Provide a **Map / 3D** switch. 3D mode loads Three.js on demand and provides:
   - an atmospheric sky driven by the actual Sun direction;
   - the Sun at its actual altitude/azimuth, hidden below the horizon;
   - a star field that fades in after sunset;
   - the Moon at its actual altitude/azimuth with its real phase and bright-limb orientation;
   - textured ground plus layered horizon ridges, with a ground on/off control;
   - mouse/touch drag and arrow-key look controls with a level horizon;
   - a facing badge and an initial view aimed toward the Sun, or the Moon when the Sun is down;
   - a fullscreen toggle that fills the viewport while keeping the scene controls available.
5. Show numeric altitude, azimuth plus compass direction, coordinates, last-updated time, sunrise/sunset, Moon phase, and Moon position.
6. In 3D mode only, fetch Open-Meteo weather for rounded coordinates, show current condition details, and drive procedural cloud coverage/density from real cloud cover. Dim the Sun, Moon, and stars under clouds. Cache weather for 10 minutes and degrade to clear-sky visuals on error.
7. Refresh the Sun/Moon position every 60 seconds and provide a **Refresh** button for immediate updates; manual refresh also forces a weather update in 3D.
8. If the Sun or Moon is below the horizon, hide its 3D object, keep it out of the map plot, and show a clear below-horizon state.
9. Handle permission denial, geolocation unavailable, timeout, invalid coordinates, unsupported browsers, WebGL failure, fullscreen failure, and weather failure with readable errors and safe fallbacks.
10. Resize both canvases for mobile/desktop and account for `devicePixelRatio` so they remain sharp.
11. Keep local libraries, location, astronomy, textures, and fonts offline. The only external request is Open-Meteo weather while 3D mode is open.

## Local server requirements

`server.js` should stay deliberately small and local-only:

- Use `node:http`, `node:fs/promises`, and `node:path`; no Express or other server framework.
- Listen on `127.0.0.1`; start at `process.env.PORT || 8000`. If the port is occupied, try the next free port and print the actual URL.
- Serve `GET` and `HEAD` requests only.
- Map `/` to `index.html`; return `index.html` for that route only. No SPA fallback is needed.
- Serve `src/` assets, the single `/node_modules/suncalc/index.js` path, the Three.js build directory, and the exact `/node_modules/three/examples/jsm/objects/Sky.js` addon path.
- Set correct MIME types for HTML, JavaScript, CSS, SVG, and icons.
- Prevent path traversal by resolving paths and confirming they remain inside the configured file roots.
- Do not expose directory listings or the rest of `node_modules`.
- Send `Cache-Control: no-store` in development.
- Return a plain 404 response for unknown paths and a readable 500 response for file errors.
- Never log or persist submitted coordinates.
- This is a development server, not a production server.

Example import map in `index.html`:

```html
<script type="importmap">
  {
    "imports": {
      "suncalc": "/node_modules/suncalc/index.js",
      "three": "/node_modules/three/build/three.module.js",
      "three/addons/objects/Sky.js": "/node_modules/three/examples/jsm/objects/Sky.js"
    }
  }
</script>
```

The app code can then use normal-looking imports:

```js
import * as SunCalc from 'suncalc';
const { Sky3DView } = await import('./sky3d.js');
```

A public deployment would require vendoring those dependencies or adding a build/deploy step. That is outside this local-first MVP.

## Projection rule

For a square plot with center `(cx, cy)` and radius `R`:

```text
azimuthRadians = azimuthDegrees × π / 180
radius = R × (90 - altitudeDegrees) / 90
x = cx + radius × sin(azimuthRadians)
y = cy - radius × cos(azimuthRadians)
```

Only project points with `0 <= altitude <= 90`. This puts the zenith at the center, the horizon on the rim, north up, and east right. Keep this conversion in a pure helper so it can be tested independently.

## Proposed structure

```text
index.html
package.json
server.js
src/
  main.js          # state, events, timer, view switching, SunCalc calls
  sky.js           # 2D canvas drawing and pure projection helpers
  sky3d.js         # Three.js scene, Sun, Moon, stars, clouds, terrain, look controls
  celestial.js     # altitude/azimuth direction and Moon phase helpers
  weather.js       # Open-Meteo client, normalization, and WMO labels
  location.js      # geolocation promise wrapper and coordinate validation
  styles.css       # responsive layout, fullscreen, controls, day/night styling
test/
  sky.test.js      # 2D projection tests
  location.test.js # coordinate validation and browser-independent helpers
  celestial.test.js # 3D direction, heading, and phase tests
  weather.test.js  # weather URL/privacy, normalization, and error handling
```

Keep modules small. `main.js` coordinates the app; drawing code must not request location, and location code must not touch the DOM. `sky3d.js` loads dynamically and must not be imported by the 2D renderer.

## Implementation steps

1. **Scaffold and local server**
   - Create `package.json` with `"type": "module"`, `dev` and `test` scripts, and `suncalc` plus `three` as dependencies.
   - Implement `server.js` with the restrictions above.
   - Add the import map and initial page shell in `index.html`.
   - Confirm the app loads from the localhost URL printed by the server before adding features.

2. **Location state**
   - Wrap `getCurrentPosition` in a promise with a 10-second timeout, `enableHighAccuracy: false`, and a reasonable `maximumAge` such as 5 minutes.
   - Request location only after the user clicks the button.
   - Validate manual input: latitude `[-90, 90]`, longitude `[-180, 180]`; require both fields together.
   - Store only coordinates and the active location mode in memory. Do not persist or transmit precise location.

3. **Sun and Moon calculation**
   - Call `SunCalc.getPosition(new Date(), lat, lng)` and `SunCalc.getMoonPosition()`.
   - Call `SunCalc.getTimes()` for sunrise/sunset and guard against invalid dates in polar day/night cases.
   - Call `SunCalc.getMoonIllumination()` for phase and lit fraction.
   - Format angles to one decimal place and convert azimuths to a 16-point compass label.
   - Centralize updates so initial load, refresh, and the 60-second timer follow the same path.

4. **Sky renderer**
   - Implement and test the projection helper first.
   - Draw the background, horizon, altitude rings, cardinal labels, and Sun marker in separate small functions.
   - Scale the backing canvas by `devicePixelRatio`, while retaining CSS-pixel coordinates for drawing.
   - Change the panel subtly for day/night, without relying on color alone to communicate state.

5. **3D mode**
   - Add Moon position/illumination calculation and reading-panel rows.
   - Build a lazy-loaded `Sky3DView` with a sun-driven Three.js Sky, Sun mesh/glow, star field, night dome, terrain, and phase-correct Moon sphere.
   - Implement pointer drag, touch drag, and arrow-key look controls. Clamp pitch; derive world directions from altitude/azimuth.
   - Build a textured ground group with distant ridge silhouettes and a ground on/off toggle.
   - Add the Map/3D switch, facing badge, loading state, and WebGL fallback.
   - Add fullscreen support for the 3D stage, keeping controls and weather readable.
   - Keep the 3D renderer idle until selected and render on updates/resizes/drag only.

6. **Weather**
   - Add `weather.js` for rounded-coordinate URL construction, Open-Meteo normalization, WMO labels, cache/error handling, and abort support.
   - Fetch only in 3D mode, cache for 10 minutes, and reuse the cached reading when switching back and forth.
   - Add condition details and attribution to the sidebar and a compact in-scene summary.
   - Drive cloud coverage/density and celestial dimming from cloud cover; fall back safely on weather failure.

7. **Accessibility and failure states**
   - Use real buttons, labels, and a status region (`aria-live="polite"`).
   - Ensure keyboard focus, readable contrast, and touch-friendly controls.
   - Disable the location button while a request is pending.
   - Expose Map/3D pressed state and make the 3D canvas keyboard-focusable.
   - Preserve the last valid sky if a later refresh or 3D initialization fails.

8. **Verify and document**
   - Run unit tests.
   - Test geolocation allow/deny, manual fallback, below-horizon Sun/Moon, Map/3D switching, drag/keyboard look, WebGL fallback, narrow mobile layout, and resize behavior.
   - Test at least one crescent Moon date and verify the rendered bright limb and phase name.
   - Test ground toggling, fullscreen entry/exit, mobile fullscreen layout, no-weather mode, and mocked cloudy weather.
   - Add a short README with `npm install`, `npm run dev`, `npm test`, the localhost URL, 3D/fullscreen/ground controls, weather privacy, and device-timezone labeling.

## Acceptance criteria

- `npm install` then `npm run dev` serves the app on a free localhost port, reported in the terminal, with no build step.
- Map mode makes no external network requests. 3D mode makes only the documented Open-Meteo request after a location is available.
- Allowing geolocation produces a Sun marker and values that update without reloading.
- A known manual location produces the same result as geolocation at those coordinates.
- North/east/south/west and horizon/zenith projections pass unit tests.
- Denied or unavailable location never leaves the app stuck in a loading state.
- Below-horizon Sun and Moon are explained and not incorrectly clamped onto the horizon.
- 3D mode loads on demand; the Sun, Moon, stars, clouds, terrain, and atmosphere reflect the calculated time/location/weather.
- The Moon displays the correct illuminated fraction/bright limb for at least one crescent date.
- Drag, touch, and arrow keys look around; switching back to Map and returning preserves orientation and ground state.
- Ground toggle shows/hides the full terrain group. Fullscreen fills the viewport and retains controls and weather.
- Weather loads only in 3D, uses rounded coordinates, shows current details and attribution, caches for 10 minutes, and drives clouds. Weather failure leaves a usable clear-sky 3D view.
- WebGL failure leaves the Map usable and disables 3D with a readable error.
- Only local asset requests plus the documented Open-Meteo request occur; no API keys.
- No console errors or uncaught errors in normal operation.
- Layout works at approximately 320 px width and on desktop, including fullscreen.
- `npm test` passes.

## Explicit non-goals for the current version

- No production deployment, HTTPS setup, hosting configuration, or build pipeline. Localhost only.
- No augmented reality, device-orientation tracking, map tiles, location search, history, accounts, or service worker.
- No animated precipitation particles, weather radar, forecast timeline, or weather map. Weather is current conditions only.
- No continuous `watchPosition` tracking; the displayed sky is for a fixed location and updates with time.
- No daily Sun path in the map view; it can be added later by sampling `getPosition` throughout the selected day.
- No mobile-device testing over a LAN IP with plain HTTP. That would require HTTPS; localhost is the supported local path.

## Quick manual sanity checks

- At sunrise/sunset, altitude should be near 0° and the marker near the rim.
- Around local solar noon, the Sun should generally be toward the southern half of the sky for northern mid-latitudes (or northern half for southern mid-latitudes).
- Changing from a location in daylight to one in nighttime should switch to the below-horizon state and reveal the star field.
- In 3D mode, the Moon’s phase should follow Sun–Moon geometry; compare a crescent date against a reliable almanac.
- Compare a sample against [SunCalc.org](https://www.suncalc.org), allowing small display/refraction differences.

## References

- SunCalc documentation/source: https://github.com/mourner/suncalc
- Three.js: https://threejs.org/
- Three.js Sky addon: https://threejs.org/docs/#examples/en/objects/Sky
- Open-Meteo API docs: https://open-meteo.com/en/docs
- MDN Geolocation API: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
- MDN `getCurrentPosition`: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition
- MDN Fullscreen API: https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API

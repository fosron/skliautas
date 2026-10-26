# AGENTS.md — Virtual Sky

## Project purpose

Local-first, client-only virtual sky showing the Sun's and Moon's actual positions for a user-supplied or browser-geolocated latitude/longitude and the current time. Includes a top-down Canvas map, an immersive look-around 3D horizon view with toggleable terrain, fullscreen mode, and live weather clouds. Favor a small, readable MVP over visual or architectural complexity.

## Stack and constraints

- Node.js built-in `http` static server (`server.js`) for localhost development.
- Native browser JavaScript ES modules, semantic HTML, plain CSS, Canvas 2D.
- Three.js 0.186.x provides the optional 3D horizon renderer, loaded dynamically only when 3D mode is selected.
- `suncalc` 2.1.x supplies Sun and Moon positions and lunar illumination.
- Both dependencies load locally through a browser import map. There is no bundler or build step.
- Use Node's built-in `node:test` and `node:assert/strict` for unit tests.
- No Vite, bundler, framework, TypeScript, backend framework, database, CSS library, or extra astronomy/render package unless the user explicitly approves.
- No API keys. The only permitted external runtime request is the free Open-Meteo current-weather endpoint while 3D mode is active. Send only coordinates rounded to two decimal places, use `credentials: omit` and `referrerPolicy: no-referrer`, cache in memory for 10 minutes, and never persist weather or coordinates.
- All local libraries, textures, fonts, and astronomy calculations stay offline.

## Commands

```sh
npm install
npm run dev
npm test
```

Open the URL printed by `npm run dev`. It starts at <http://localhost:8000> and automatically tries the next free port if that one is occupied. There is no build or preview step. Run tests after code changes.

Browser geolocation requires a secure context. `http://localhost` is supported; a plain-HTTP LAN address is not.

## Architecture

- `server.js`: minimal local static server; no app logic.
- `src/main.js`: app state, DOM events, update timer, view switching, SunCalc calls, text/status output.
- `src/location.js`: geolocation wrapper and coordinate validation; no DOM or rendering.
- `src/sky.js`: pure 2D projection helpers and Canvas drawing; no geolocation or app state.
- `src/celestial.js`: pure altitude/azimuth-to-vector, heading, and Moon phase-name helpers.
- `src/sky3d.js`: Three.js scene, atmosphere, clouds, Sun, Moon, stars, terrain/horizon, and pointer/keyboard look controls. Loaded dynamically.
- `src/weather.js`: Open-Meteo URL building, response normalization, WMO condition mapping, and fetch wrapper.
- `src/styles.css`: layout, visual states, fullscreen layout, responsiveness, focus styles.
- `test/sky.test.js`: deterministic 2D projection tests.
- `test/location.test.js`: validation and browser-independent location helpers.
- `test/celestial.test.js`: 3D direction, heading, and Moon phase-name tests.
- `test/weather.test.js`: rounded weather coordinates, URL construction, WMO mapping, response normalization, and error handling.

Keep dependencies flowing toward `main.js`; avoid circular imports. `sky3d.js` may import `celestial.js`; `sky.js` must not depend on Three.js. Prefer small pure functions and minimal state. Do not introduce a global store or class hierarchy beyond `Sky3DView`.

## Local server rules

- Use `node:http`, `node:fs/promises`, and `node:path`; no Express or similar.
- Listen on `127.0.0.1`, starting at `process.env.PORT || 8000`. If the port is occupied, try the next free port and print the actual URL; never silently collide.
- Support only `GET` and `HEAD`.
- Map `/` to `index.html`; serve local `src/` assets and the single `/node_modules/suncalc/index.js` path.
- Serve only the Three.js build directory and the exact `/node_modules/three/examples/jsm/objects/Sky.js` addon path.
- Use correct MIME types and `Cache-Control: no-store`.
- Resolve and verify paths before reading; block traversal and directory listings.
- Return plain 404 and readable 500 responses.
- Never serve arbitrary `node_modules` content, log coordinates, or persist location data.
- Do not turn this development server into a production server without explicit user approval.

## SunCalc conventions

Load SunCalc through the import map in `index.html`:

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

Then import normally:

```js
import * as SunCalc from 'suncalc';
const { azimuth, altitude } = SunCalc.getPosition(date, latitude, longitude);
const moon = SunCalc.getMoonPosition(date, latitude, longitude);
const illumination = SunCalc.getMoonIllumination(date);
```

- Input latitude/longitude are degrees.
- Returned Sun and Moon `azimuth` and `altitude` are **degrees**, not radians.
- Azimuth is clockwise from north: `0=N`, `90=E`, `180=S`, `270=W`.
- Altitude is apparent/refraction-corrected degrees above the horizon.
- Moon illumination provides `fraction` (0–1), `phase` (0–1, new → first quarter → full → last quarter → new), and `waxing`.
- Do not copy examples from SunCalc v1: its angle units/azimuth convention differ.
- A `Date` is an absolute instant. Do not manually add timezone offsets to the current-time calculation.
- Do not add a bundler to solve loading. A public deployment would need vendored dependencies or an explicit deploy step, but localhost is the current scope.

## Rendering rules

North is up and east is right. For above-horizon positions:

```text
r = R × (90 - altitude) / 90
x = cx + r × sin(azimuth × π / 180)
y = cy - r × cos(azimuth × π / 180)
```

- Center is zenith (`altitude=90`); rim is horizon (`altitude=0`).
- Never clamp a below-horizon body onto the rim. Hide it and show an explicit below-horizon message.
- Scale canvas backing dimensions for `devicePixelRatio`; draw using CSS-pixel coordinates.
- Redraw on data updates and resize. Avoid a permanent animation loop for this static-per-minute display.

3D mode conventions:

- World axes: east `+X`, up `+Y`, north `−Z`.
- Direction from horizontal coordinates: `x = cos(alt)·sin(az)`, `y = sin(alt)`, `z = −cos(alt)·cos(az)`.
- Camera yaw is `−azimuth`; positive camera pitch looks up. Clamp pitch to avoid flipping over the zenith/nadir.
- Use Three.js `Sky` for the atmosphere, with the actual Sun direction driving `sunPosition`.
- Render the Sun and Moon at their actual altitude/azimuth. Hide them below the horizon.
- The Moon is a textured 3D sphere lit from the Sun direction so its phase and bright-limb orientation come from real geometry, not a static phase texture.
- Stars fade in below the horizon Sun; keep them local/procedural.
- Ground is a grouped scene object containing the textured plane and layered horizon ridges. The toggle must hide/show the whole group without affecting the sky or celestial objects.
- Clouds use the Sky addon's local procedural cloud uniforms in daylight. The night dome may render a procedural cloud veil from the same coverage/density so clouds remain visible after dark; do not duplicate the cloud texture or fetch weather images.
- Drive cloud coverage/density from normalized current weather; dim the Sun, Moon, and stars under cloud cover. Partial cloud cover must remain visually noticeable.
- Never render a second cloud texture or fetch weather assets. Weather text must credit Open-Meteo.
- 3D look controls must support mouse drag, touch drag, and arrow keys. No continuous render loop is needed when idle.
- Fullscreen must target the 3D stage only, preserve the in-stage controls/badges/weather overlay, and exit cleanly when leaving 3D mode or on `fullscreenchange`.
- Cap renderer pixel ratio at 2. The 3D module must load dynamically and fall back to the 2D map if WebGL initialization fails.

## Location and privacy

- Request geolocation only from a user-initiated click, not automatically on page load.
- Use `getCurrentPosition`, not continuous `watchPosition`.
- Suggested options: `{ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }`.
- Always provide manual latitude/longitude fallback.
- Validate latitude `[-90, 90]`, longitude `[-180, 180]`, reject incomplete/non-finite input, and handle all geolocation errors.
- Do not log, persist, or transmit precise coordinates. Coordinates stay in memory only.
- Weather network exception: only while 3D mode is open and a location is set, send approximate coordinates rounded to two decimal places to `https://api.open-meteo.com/v1/forecast`.
- Abort stale weather fetches when location/mode changes. Cache successful weather for 10 minutes. Do not allow automatic retries more often than that; manual Refresh may force a retry.
- Do not fetch weather on initial page load or in Map mode.
- Explain permission/secure-context and weather-network failures in plain language.

## UI and accessibility

- Use semantic controls and associated input labels.
- Announce loading, errors, and location updates through a polite live region.
- Never communicate day/night or errors by color alone.
- Preserve visible keyboard focus and usable mobile touch targets.
- Show units for all angles. Label sunrise/sunset and update times as device local time, especially because a manual location may be in another timezone.
- Guard sunrise/sunset formatting for invalid dates during polar day/night.
- The Map/3D switch must expose pressed state. The 3D canvas must be keyboard-focusable and describe how to look around.
- Ground and fullscreen buttons must expose pressed state, accessible labels, and hover titles. Icon-only controls require an accessible name.
- Keep the facing badge, Moon phase, and weather readable but do not rely on them as the only data source; mirror values in text.
- Show weather attribution and the rounded-coordinate disclosure. The fullscreen weather overlay must remain readable on narrow screens.
- In fullscreen, keep the 3D controls and weather summary inside the fullscreen element.

## Testing expectations

At minimum, test:

- zenith projects to canvas center;
- horizon projects to radius `R`;
- north is above center, east right, south below, west left;
- intermediate altitudes project between center and rim;
- below-horizon positions are rejected/not drawn;
- coordinate validation rejects NaN, infinity, missing pairs, and out-of-range values;
- altitude/azimuth maps to the correct Three.js direction with unit length;
- yaw maps back to the correct north-based heading;
- Moon phase boundaries produce the expected eight names;
- weather coordinates are rounded to two decimal places in the request URL;
- WMO weather codes map to expected labels/kinds;
- weather normalization handles units, missing cloud cover, HTTP failures, and invalid JSON.

Do not assert exact solar-noon clock times; equation of time, timezone, and DST make those brittle. Prefer deterministic projection tests and tolerant astronomy sanity checks. Mock weather responses in browser tests rather than depending on live conditions.

## Definition of done

- `npm test` passes.
- `npm run dev` serves the app on localhost with no build step and reports the port it actually bound.
- Manual and geolocated coordinates both work in Map and 3D modes.
- Denial, timeout, invalid input, nighttime, and resize states are usable.
- The 3D switch loads on demand, shows the correct Sun position and Moon phase, supports drag/keyboard look controls, and falls back cleanly to Map when WebGL fails.
- Ground and fullscreen toggles work; fullscreen fills the viewport and keeps its controls/weather overlay; ground state survives Map/3D switching.
- Weather loads only in 3D mode, uses rounded coordinates, displays condition details and Open-Meteo attribution, drives clouds, and fails gracefully to clear-sky visuals.
- Only local asset requests plus the documented Open-Meteo request occur.
- No console errors, uncaught promise rejections, or broken local assets.
- No scope expansion beyond the MVP without user approval.

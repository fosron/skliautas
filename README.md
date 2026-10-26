# Virtual Sky

A small, local-first virtual sky. It shows the Sun's current altitude and azimuth for your location, with two views:

- **Map** — a top-down sky dome with north up, the zenith in the centre, and the horizon at the outer edge.
- **3D** — a look-around horizon view with an atmospheric sky, the Sun, a star field at night, the Moon with its real phase, procedural terrain, live weather clouds, and fullscreen mode.

## Requirements

- Node.js 20 or newer
- A modern browser with WebGL for 3D mode

## Run it

```sh
npm install
npm run dev
```

Open the URL printed by the server. It starts at <http://localhost:8000> and automatically tries the next free port if 8000 is already in use.

The app uses browser geolocation only after you click **Use my location**. You can also enter latitude and longitude manually. Coordinates stay in the current browser tab and are not stored.

`http://localhost` is treated as a secure context, so geolocation works without local HTTPS configuration.

## 3D controls

- Drag with a mouse or finger to look around.
- Focus the 3D view and use the arrow keys for keyboard control.
- Use the **ground** button to show or hide the terrain and horizon.
- Use the **fullscreen** button to fill the viewport; exit with the same button or Escape.
- Switch back to **Map** at any time. The 3D scene resumes when you return.

The 3D view loads Three.js only when selected. If WebGL cannot start, the app stays on the map and shows an error message.

## Weather

Weather cards and cloud cover appear only in 3D mode. The app requests current conditions from [Open-Meteo](https://open-meteo.com/) — no API key needed.

- Only coordinates rounded to two decimal places are sent.
- Requests use `credentials: omit` and `no-referrer`.
- Results are cached in memory for 10 minutes and are not persisted.
- Map mode makes no weather requests.
- If weather is unavailable, the 3D sky falls back to clear conditions and shows an error.

Weather data by Open-Meteo, licensed under CC BY 4.0.

## Test

```sh
npm test
```

## Notes

- Built with plain HTML, CSS, native browser JavaScript modules, and Canvas 2D.
- Sun and Moon calculations use [SunCalc](https://github.com/mourner/suncalc) 2.1.x.
- The 3D sky uses [Three.js](https://threejs.org/) 0.186.x with its atmospheric `Sky` addon.
- Dependencies load from the local install through an import map, so there is no build step.
- The Sun's position refreshes once per minute. Sunrise and sunset are displayed in the device's local timezone.
- This is a local development app, not a production server.

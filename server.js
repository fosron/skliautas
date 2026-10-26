import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const SRC_ROOT = resolve(ROOT, 'src');
const SUNCALC_PATH = resolve(ROOT, 'node_modules/suncalc/index.js');
const THREE_BUILD_ROOT = resolve(ROOT, 'node_modules/three/build');
const THREE_SKY_PATH = resolve(
  ROOT,
  'node_modules/three/examples/jsm/objects/Sky.js',
);
const HOST = '127.0.0.1';
const DEFAULT_PORT = 8000;
const PORT_ATTEMPTS = 20;

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.json', 'application/json; charset=utf-8'],
  ['.ico', 'image/x-icon'],
]);

const requestedPort = Number.parseInt(process.env.PORT ?? '', 10);
const startPort =
  Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65_535
    ? requestedPort
    : DEFAULT_PORT;

function plainResponse(response, statusCode, message, headOnly = false) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  response.end(headOnly ? undefined : message);
}

function isInside(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

function resolveRequestPath(pathname) {
  if (pathname === '/' || pathname === '/index.html') {
    return resolve(ROOT, 'index.html');
  }

  if (pathname === '/node_modules/suncalc/index.js') {
    return SUNCALC_PATH;
  }

  if (pathname.startsWith('/node_modules/three/build/')) {
    const candidate = resolve(
      THREE_BUILD_ROOT,
      pathname.slice('/node_modules/three/build/'.length),
    );
    return isInside(THREE_BUILD_ROOT, candidate) ? candidate : null;
  }

  if (pathname === '/node_modules/three/examples/jsm/objects/Sky.js') {
    return THREE_SKY_PATH;
  }

  if (pathname.startsWith('/src/')) {
    const candidate = resolve(SRC_ROOT, pathname.slice('/src/'.length));
    return isInside(SRC_ROOT, candidate) ? candidate : null;
  }

  return null;
}

const server = createServer(async (request, response) => {
  const headOnly = request.method === 'HEAD';

  if (request.method !== 'GET' && !headOnly) {
    response.setHeader('Allow', 'GET, HEAD');
    plainResponse(response, 405, 'Method Not Allowed', false);
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', `http://${HOST}`).pathname);
  } catch {
    plainResponse(response, 400, 'Bad Request', headOnly);
    return;
  }

  const filePath = resolveRequestPath(pathname);
  if (!filePath) {
    plainResponse(response, 404, 'Not Found', headOnly);
    return;
  }

  try {
    const body = await readFile(filePath);
    const contentType = MIME_TYPES.get(extname(filePath)) ?? 'application/octet-stream';

    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': body.byteLength,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    response.end(headOnly ? undefined : body);
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'EISDIR')) {
      plainResponse(response, 404, 'Not Found', headOnly);
      return;
    }

    console.error('[virtual-sky] Failed to read a local asset:', error);
    plainResponse(response, 500, 'Internal Server Error', headOnly);
  }
});

function listen(port, attemptsLeft = PORT_ATTEMPTS) {
  return new Promise((resolvePort, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);

      if (error.code === 'EADDRINUSE' && attemptsLeft > 1 && port < 65_535) {
        const nextPort = port + 1;
        console.warn(`[virtual-sky] Port ${port} is in use; trying ${nextPort}.`);
        listen(nextPort, attemptsLeft - 1).then(resolvePort, reject);
        return;
      }

      reject(error);
    };

    const onListening = () => {
      server.off('error', onError);
      resolvePort(port);
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, HOST);
  });
}

try {
  const activePort = await listen(startPort);
  console.log(`[virtual-sky] Listening at http://localhost:${activePort}`);
  console.log('[virtual-sky] Press Ctrl+C to stop.');
} catch (error) {
  console.error(`[virtual-sky] Could not start on ports ${startPort}-${startPort + PORT_ATTEMPTS - 1}.`);
  console.error(error);
  process.exitCode = 1;
}

function shutdown() {
  server.close(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

export const COMPASS_DIRECTIONS = Object.freeze([
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
]);

const PALETTES = {
  waiting: {
    center: '#14323a',
    middle: '#0a1d23',
    rim: '#061217',
    halo: 'rgba(124, 195, 183, 0.09)',
    line: 'rgba(194, 229, 220, 0.15)',
    faintLine: 'rgba(194, 229, 220, 0.075)',
    text: 'rgba(218, 238, 232, 0.62)',
    brightText: 'rgba(234, 245, 240, 0.88)',
    accent: '#a7e3d4',
  },
  day: {
    center: '#8ccfd0',
    middle: '#3c8598',
    rim: '#123848',
    halo: 'rgba(243, 201, 105, 0.13)',
    line: 'rgba(238, 248, 237, 0.22)',
    faintLine: 'rgba(238, 248, 237, 0.11)',
    text: 'rgba(239, 248, 242, 0.7)',
    brightText: 'rgba(255, 255, 248, 0.95)',
    accent: '#f7d986',
  },
  twilight: {
    center: '#655379',
    middle: '#2e3153',
    rim: '#0d1930',
    halo: 'rgba(236, 139, 102, 0.12)',
    line: 'rgba(231, 225, 235, 0.18)',
    faintLine: 'rgba(231, 225, 235, 0.09)',
    text: 'rgba(230, 227, 235, 0.65)',
    brightText: 'rgba(250, 247, 244, 0.92)',
    accent: '#f3a683',
  },
  night: {
    center: '#162b4c',
    middle: '#0b1a31',
    rim: '#050e1d',
    halo: 'rgba(112, 145, 202, 0.1)',
    line: 'rgba(196, 214, 239, 0.15)',
    faintLine: 'rgba(196, 214, 239, 0.075)',
    text: 'rgba(218, 229, 242, 0.58)',
    brightText: 'rgba(241, 246, 249, 0.9)',
    accent: '#9db9e5',
  },
};

function normalizeAzimuth(azimuthDegrees) {
  return ((azimuthDegrees % 360) + 360) % 360;
}

export function compassDirection(azimuthDegrees) {
  if (!Number.isFinite(azimuthDegrees)) {
    return '—';
  }

  const index = Math.round(normalizeAzimuth(azimuthDegrees) / 22.5) % 16;
  return COMPASS_DIRECTIONS[index];
}

export function skyPhase(altitude) {
  if (!Number.isFinite(altitude)) {
    return { key: 'waiting', label: 'Awaiting observer' };
  }

  if (altitude >= 0) {
    return { key: 'day', label: 'Sun above the horizon' };
  }

  if (altitude >= -6) {
    return { key: 'twilight', label: 'Twilight — Sun below the horizon' };
  }

  return { key: 'night', label: 'Night — Sun below the horizon' };
}

export function projectSun({ azimuth, altitude, centerX, centerY, radius }) {
  if (
    !Number.isFinite(azimuth) ||
    !Number.isFinite(altitude) ||
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    altitude < 0 ||
    altitude > 90
  ) {
    return null;
  }

  const azimuthRadians = (normalizeAzimuth(azimuth) * Math.PI) / 180;
  const projectedRadius = (radius * (90 - altitude)) / 90;

  return {
    x: centerX + projectedRadius * Math.sin(azimuthRadians),
    y: centerY - projectedRadius * Math.cos(azimuthRadians),
  };
}

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
  const backingWidth = Math.round(width * pixelRatio);
  const backingHeight = Math.round(height * pixelRatio);

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  return { context, width, height };
}

function drawDome(context, centerX, centerY, radius, palette) {
  const halo = context.createRadialGradient(
    centerX,
    centerY,
    radius * 0.4,
    centerX,
    centerY,
    radius * 1.22,
  );
  halo.addColorStop(0, palette.halo);
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = halo;
  context.fillRect(0, 0, centerX * 2, centerY * 2);

  const dome = context.createRadialGradient(
    centerX - radius * 0.16,
    centerY - radius * 0.2,
    radius * 0.03,
    centerX,
    centerY,
    radius,
  );
  dome.addColorStop(0, palette.center);
  dome.addColorStop(0.62, palette.middle);
  dome.addColorStop(1, palette.rim);

  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = dome;
  context.fill();
}

function drawGrid(context, centerX, centerY, radius, palette) {
  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.clip();

  for (const altitude of [30, 60]) {
    const ringRadius = (radius * (90 - altitude)) / 90;
    context.beginPath();
    context.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
    context.strokeStyle = palette.faintLine;
    context.lineWidth = 1;
    context.setLineDash([3, 7]);
    context.stroke();
    context.setLineDash([]);
  }

  for (let index = 0; index < 4; index += 1) {
    const angle = (index * Math.PI) / 2;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(
      centerX + radius * Math.sin(angle),
      centerY - radius * Math.cos(angle),
    );
    context.strokeStyle = palette.faintLine;
    context.lineWidth = 1;
    context.stroke();
  }

  context.restore();

  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.strokeStyle = palette.line;
  context.lineWidth = 1.2;
  context.stroke();

  context.save();
  context.fillStyle = palette.text;
  context.font = `${Math.max(8, radius * 0.044)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (const altitude of [30, 60]) {
    const ringRadius = (radius * (90 - altitude)) / 90;
    context.fillText(
      `${altitude}°`,
      centerX + Math.max(15, radius * 0.09),
      centerY - ringRadius,
    );
  }

  context.restore();
}

function drawCompass(context, centerX, centerY, radius, palette) {
  const tickOuter = radius + Math.max(5, radius * 0.035);
  const tickInner = radius + Math.max(2, radius * 0.014);

  for (let degrees = 0; degrees < 360; degrees += 15) {
    const radians = (degrees * Math.PI) / 180;
    const cardinal = degrees % 90 === 0;
    const inner = cardinal ? radius + 1 : tickInner;

    context.beginPath();
    context.moveTo(
      centerX + inner * Math.sin(radians),
      centerY - inner * Math.cos(radians),
    );
    context.lineTo(
      centerX + tickOuter * Math.sin(radians),
      centerY - tickOuter * Math.cos(radians),
    );
    context.strokeStyle = cardinal ? palette.line : palette.faintLine;
    context.lineWidth = cardinal ? 1.3 : 1;
    context.stroke();
  }

  const labelDistance = radius + Math.max(17, radius * 0.12);
  const fontSize = Math.max(10, Math.min(13, radius * 0.072));
  const labels = [
    { text: 'N', x: centerX, y: centerY - labelDistance, primary: true },
    { text: 'E', x: centerX + labelDistance, y: centerY, primary: false },
    { text: 'S', x: centerX, y: centerY + labelDistance, primary: false },
    { text: 'W', x: centerX - labelDistance, y: centerY, primary: false },
  ];

  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Consolas, monospace`;

  for (const label of labels) {
    context.fillStyle = label.primary ? palette.accent : palette.text;
    context.fillText(label.text, label.x, label.y);
  }

  context.restore();
}

function drawCenterMessage(context, centerX, centerY, radius, palette, state) {
  if (state.active && Number.isFinite(state.altitude) && state.altitude < 0) {
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = palette.brightText;
    context.font = `400 ${Math.max(13, radius * 0.088)}px "Iowan Old Style", Palatino, Georgia, serif`;
    context.fillText('Sun below horizon', centerX, centerY - radius * 0.035);

    context.fillStyle = palette.text;
    context.font = `${Math.max(9, radius * 0.052)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    context.fillText(
      `${Math.abs(state.altitude).toFixed(1)}° below`,
      centerX,
      centerY + radius * 0.085,
    );
    context.restore();
    return;
  }

  if (!state.active) {
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = palette.brightText;
    context.font = `400 ${Math.max(14, radius * 0.095)}px "Iowan Old Style", Palatino, Georgia, serif`;
    context.fillText('Choose a location', centerX, centerY - radius * 0.035);

    context.fillStyle = palette.text;
    context.font = `${Math.max(9, radius * 0.048)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    context.fillText('to place the Sun in your sky', centerX, centerY + radius * 0.085);
    context.restore();
  }
}

function drawSun(context, centerX, centerY, markerX, markerY, radius) {
  context.save();
  context.beginPath();
  context.moveTo(centerX, centerY);
  context.lineTo(markerX, markerY);
  context.strokeStyle = 'rgba(255, 241, 198, 0.35)';
  context.lineWidth = 1;
  context.setLineDash([2, 7]);
  context.stroke();
  context.setLineDash([]);

  const glowRadius = Math.max(28, radius * 0.19);
  const glow = context.createRadialGradient(
    markerX,
    markerY,
    0,
    markerX,
    markerY,
    glowRadius,
  );
  glow.addColorStop(0, 'rgba(255, 251, 225, 0.94)');
  glow.addColorStop(0.14, 'rgba(255, 224, 139, 0.74)');
  glow.addColorStop(0.44, 'rgba(255, 202, 97, 0.19)');
  glow.addColorStop(1, 'rgba(255, 202, 97, 0)');

  context.beginPath();
  context.arc(markerX, markerY, glowRadius, 0, Math.PI * 2);
  context.fillStyle = glow;
  context.fill();

  const coreRadius = Math.max(4, radius * 0.032);
  context.beginPath();
  context.arc(markerX, markerY, coreRadius, 0, Math.PI * 2);
  context.fillStyle = '#fff9dd';
  context.fill();

  context.beginPath();
  context.arc(markerX, markerY, coreRadius + Math.max(3, radius * 0.017), 0, Math.PI * 2);
  context.strokeStyle = 'rgba(255, 249, 221, 0.34)';
  context.lineWidth = 1;
  context.stroke();

  const labelOffset = Math.max(23, radius * 0.1);
  const labelAbove = markerY >= centerY;

  context.fillStyle = 'rgba(255, 249, 221, 0.82)';
  context.font = `600 ${Math.max(8, radius * 0.042)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  context.textAlign = 'center';
  context.textBaseline = labelAbove ? 'bottom' : 'top';
  context.fillText(
    'SUN',
    markerX,
    labelAbove ? markerY - labelOffset : markerY + labelOffset,
  );
  context.restore();
}

export function drawSky(canvas, state = {}) {
  const prepared = prepareCanvas(canvas);
  if (!prepared) {
    return;
  }

  const { context, width, height } = prepared;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.385;
  const phaseKey = Object.hasOwn(PALETTES, state.phase) ? state.phase : 'waiting';
  const palette = PALETTES[phaseKey];

  if (radius < 20) {
    return;
  }

  drawDome(context, centerX, centerY, radius, palette);
  drawGrid(context, centerX, centerY, radius, palette);

  const projected = state.active
    ? projectSun({
        azimuth: state.azimuth,
        altitude: state.altitude,
        centerX,
        centerY,
        radius,
      })
    : null;

  drawCenterMessage(context, centerX, centerY, radius, palette, state);

  if (projected) {
    drawSun(context, centerX, centerY, projected.x, projected.y, radius);
  }

  drawCompass(context, centerX, centerY, radius, palette);
}

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

import {
  directionFromHorizontalCoordinates,
  headingFromYaw,
} from './celestial.js';

const CELESTIAL_DISTANCE = 500;
const SUN_RADIUS = 12;
const MOON_RADIUS = 14;
const STAR_DISTANCE = 900;
const GROUND_RADIUS = 1000;
const MIN_PITCH = THREE.MathUtils.degToRad(-82);
const MAX_PITCH = THREE.MathUtils.degToRad(85);
const KEYBOARD_STEP = THREE.MathUtils.degToRad(5);
const DRAG_SENSITIVITY = 0.0042;

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);

  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.12, 'rgba(255, 252, 231, 0.92)');
  gradient.addColorStop(0.3, 'rgba(255, 222, 146, 0.42)');
  gradient.addColorStop(0.58, 'rgba(255, 204, 112, 0.1)');
  gradient.addColorStop(1, 'rgba(255, 196, 92, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);

  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.18, 'rgba(255, 255, 255, 0.95)');
  gradient.addColorStop(0.42, 'rgba(255, 255, 255, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createMoonTexture(renderer) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const random = mulberry32(20261026);

  const base = context.createRadialGradient(238, 218, 18, 256, 256, 340);
  base.addColorStop(0, '#d3d3ca');
  base.addColorStop(0.52, '#a9aaa3');
  base.addColorStop(0.86, '#8e928d');
  base.addColorStop(1, '#777d7b');
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);

  const maria = [
    [180, 170, 82, 60, 0.22],
    [300, 190, 68, 48, 0.2],
    [235, 280, 100, 54, 0.17],
    [345, 312, 54, 44, 0.2],
    [140, 300, 46, 38, 0.16],
    [300, 100, 52, 34, 0.12],
  ];

  for (const [centerX, centerY, radiusX, radiusY, opacity] of maria) {
    context.save();
    context.translate(centerX, centerY);
    context.scale(1, radiusY / radiusX);
    const patch = context.createRadialGradient(0, 0, 0, 0, 0, radiusX);
    patch.addColorStop(0, `rgba(61, 66, 70, ${opacity})`);
    patch.addColorStop(0.72, `rgba(61, 66, 70, ${opacity * 0.55})`);
    patch.addColorStop(1, 'rgba(61, 66, 70, 0)');
    context.fillStyle = patch;
    context.beginPath();
    context.arc(0, 0, radiusX, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  for (let index = 0; index < 150; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 1.5 + random() * 12;
    const crater = context.createRadialGradient(
      x - radius * 0.25,
      y - radius * 0.25,
      radius * 0.1,
      x,
      y,
      radius,
    );
    crater.addColorStop(0, 'rgba(74, 79, 81, 0.28)');
    crater.addColorStop(0.65, 'rgba(113, 117, 116, 0.16)');
    crater.addColorStop(0.88, 'rgba(229, 230, 221, 0.15)');
    crater.addColorStop(1, 'rgba(229, 230, 221, 0)');
    context.fillStyle = crater;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  for (let index = 0; index < 1800; index += 1) {
    const value = Math.round(120 + random() * 90);
    context.fillStyle = `rgba(${value}, ${value}, ${value - 3}, ${0.025 + random() * 0.05})`;
    context.fillRect(random() * size, random() * size, 1 + random(), 1 + random());
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function createStarCloud({ count, seed, size, opacity, map }) {
  const random = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const azimuth = random() * Math.PI * 2;
    const cosineAltitude = random() * 2 - 1;
    const sineAltitude = Math.sqrt(1 - cosineAltitude * cosineAltitude);
    const offset = index * 3;

    positions[offset] = STAR_DISTANCE * sineAltitude * Math.cos(azimuth);
    positions[offset + 1] = STAR_DISTANCE * cosineAltitude;
    positions[offset + 2] = STAR_DISTANCE * sineAltitude * Math.sin(azimuth);

    const warmth = random();
    const brightness = 0.68 + random() * 0.32;
    colors[offset] = (0.82 + warmth * 0.13) * brightness;
    colors[offset + 1] = (0.88 + warmth * 0.08) * brightness;
    colors[offset + 2] = (0.95 + warmth * 0.05) * brightness;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size,
    sizeAttenuation: false,
    map,
    transparent: true,
    opacity,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  material.userData.baseSize = size;

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 1;
  return { points, material };
}

function createGroundTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const random = mulberry32(60321);

  const gradient = context.createRadialGradient(256, 256, 8, 256, 256, 256);
  gradient.addColorStop(0, '#0d262d');
  gradient.addColorStop(0.35, '#123139');
  gradient.addColorStop(0.72, '#1a424a');
  gradient.addColorStop(0.91, '#25545d');
  gradient.addColorStop(1, '#2c626c');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const horizonHaze = context.createRadialGradient(256, 256, 196, 256, 256, 256);
  horizonHaze.addColorStop(0, 'rgba(180, 218, 218, 0)');
  horizonHaze.addColorStop(0.76, 'rgba(137, 192, 193, 0.035)');
  horizonHaze.addColorStop(1, 'rgba(170, 218, 217, 0.14)');
  context.fillStyle = horizonHaze;
  context.fillRect(0, 0, size, size);

  for (let index = 0; index < 95; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * 244;
    const x = 256 + Math.cos(angle) * distance;
    const y = 256 + Math.sin(angle) * distance;
    const radiusX = 18 + random() * 78;
    const radiusY = 10 + random() * 48;
    const lighter = random() > 0.58;

    context.save();
    context.translate(x, y);
    context.rotate(random() * Math.PI);
    context.scale(1, radiusY / radiusX);
    const patch = context.createRadialGradient(0, 0, 0, 0, 0, radiusX);
    patch.addColorStop(
      0,
      lighter
        ? `rgba(109, 168, 174, ${0.05 + random() * 0.065})`
        : `rgba(1, 8, 11, ${0.07 + random() * 0.1})`,
    );
    patch.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = patch;
    context.beginPath();
    context.arc(0, 0, radiusX, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  for (let radius = 28; radius < 252; radius += 18 + random() * 18) {
    context.beginPath();
    context.arc(256, 256, radius, 0, Math.PI * 2);
    context.strokeStyle = `rgba(106, 171, 179, ${0.06 + random() * 0.075})`;
    context.lineWidth = 1 + random() * 1.5;
    context.stroke();
  }

  for (let index = 0; index < 4200; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * 250;
    const x = 256 + Math.cos(angle) * distance;
    const y = 256 + Math.sin(angle) * distance;
    const brightness = 32 + random() * 56;
    context.fillStyle = `rgba(${brightness}, ${brightness + 14}, ${brightness + 18}, ${0.04 + random() * 0.09})`;
    context.fillRect(x, y, 1 + random(), 1 + random());
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createHorizonRidge({
  radius,
  minHeight,
  maxHeight,
  color,
  seed,
  segments = 256,
}) {
  const random = mulberry32(seed);
  const phases = [random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2];
  const positions = [];
  const indices = [];

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const angle = t * Math.PI * 2;
    const wave =
      0.54 +
      0.22 * Math.sin(t * Math.PI * 2 * 2 + phases[0]) +
      0.14 * Math.sin(t * Math.PI * 2 * 5 + phases[1]) +
      0.1 * Math.sin(t * Math.PI * 2 * 11 + phases[2]);
    const height = minHeight + THREE.MathUtils.clamp(wave, 0, 1) * (maxHeight - minHeight);
    const x = Math.sin(angle) * radius;
    const z = -Math.cos(angle) * radius;

    positions.push(x, -6, z, x, height, z);

    if (index < segments) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);

  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

function createNightDomeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      nightAmount: { value: 1 },
      cloudCoverage: { value: 0 },
      cloudDensity: { value: 0.5 },
      cloudScale: { value: 0.0002 },
      moonDirection: { value: new THREE.Vector3(0, -1, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;

      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float nightAmount;
      uniform float cloudCoverage;
      uniform float cloudDensity;
      uniform float cloudScale;
      uniform vec3 moonDirection;
      varying vec3 vDirection;

      float hash(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        float a = hash(cell);
        float b = hash(cell + vec2(1.0, 0.0));
        float c = hash(cell + vec2(0.0, 1.0));
        float d = hash(cell + vec2(1.0, 1.0));
        return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
      }

      float fbm(vec2 point) {
        float result = 0.0;
        float amplitude = 0.5;
        for (int index = 0; index < 4; index += 1) {
          result += amplitude * noise(point);
          point *= 2.03;
          amplitude *= 0.5;
        }
        return result;
      }

      void main() {
        float height = clamp(vDirection.y, 0.0, 1.0);
        vec3 horizon = vec3(0.0035, 0.011, 0.016);
        vec3 zenith = vec3(0.0006, 0.002, 0.004);
        vec3 color = mix(horizon, zenith, pow(height, 0.55));
        color += vec3(0.0045, 0.008, 0.011) * exp(-height * 10.0);

        if (height > 0.012 && cloudCoverage > 0.001) {
          vec2 cloudUV = vDirection.xz / (height * 0.55) * cloudScale;
          float cloudNoise = fbm(cloudUV * 1600.0);
          float region = noise(cloudUV * 260.0) * 0.38 + 0.5;
          float coverage = clamp(cloudCoverage + (region - 0.5) * 0.7, 0.0, 1.0);
          float threshold = 1.0 - coverage;
          float cloudMask = smoothstep(threshold - 0.12, threshold + 0.18, cloudNoise);
          cloudMask *= smoothstep(0.0, 0.045, height);

          float moonLight = pow(
            max(dot(normalize(vDirection), normalize(moonDirection)), 0.0),
            6.0
          );
          vec3 cloudColor = vec3(0.016, 0.030, 0.040)
            + vec3(0.040, 0.055, 0.070) * moonLight;
          color = mix(color, cloudColor, cloudMask * mix(0.62, 1.0, cloudDensity));
        }

        gl_FragColor = vec4(color, nightAmount);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
}

function createMoonMaterial(sunDirection) {
  return new THREE.ShaderMaterial({
    uniforms: {
      moonMap: { value: null },
      sunDirection: { value: sunDirection.clone() },
      cloudCover: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldNormal;

      void main() {
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D moonMap;
      uniform vec3 sunDirection;
      uniform float cloudCover;
      varying vec2 vUv;
      varying vec3 vWorldNormal;

      void main() {
        vec3 surface = texture2D(moonMap, vUv).rgb;
        float illumination = smoothstep(-0.04, 0.04, dot(normalize(vWorldNormal), normalize(sunDirection)));
        float shade = 0.012 + illumination * 1.5;
        float weatherDim = 1.0 - 0.8 * clamp(cloudCover, 0.0, 1.0);
        gl_FragColor = vec4(surface * shade * weatherDim, 1.0);

        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
  });
}

export class Sky3DView {
  constructor(canvas, { onHeadingChange } = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new TypeError('Sky3DView requires a canvas element.');
    }

    this.canvas = canvas;
    this.onHeadingChange = onHeadingChange;
    this.yaw = 0;
    this.pitch = THREE.MathUtils.degToRad(14);
    this.dragging = false;
    this.lastPointer = { x: 0, y: 0 };
    this.frameRequest = 0;
    this.sunDirection = new THREE.Vector3(0, -1, 0);

    const context = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });

    if (!context) {
      throw new Error('WebGL 2 is unavailable.');
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x050c10, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.09;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050c10);
    this.scene.fog = new THREE.Fog(0x050c10, 180, 850);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
    this.camera.rotation.order = 'YXZ';

    this._buildScene();
    this._bindControls();
    this._observeSize();
    this.resize();
  }

  _buildScene() {
    this.sky = new Sky();
    this.sky.scale.setScalar(1000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -100;
    this.sky.material.uniforms.turbidity.value = 2;
    this.sky.material.uniforms.rayleigh.value = 3.2;
    this.sky.material.uniforms.mieCoefficient.value = 0.0012;
    this.sky.material.uniforms.mieDirectionalG.value = 0.62;
    this.sky.material.uniforms.cloudCoverage.value = 0;
    this.sky.material.uniforms.cloudDensity.value = 0.42;
    this.sky.material.uniforms.cloudElevation.value = 0.55;
    this.sky.material.uniforms.showSunDisc.value = 1;
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDirection);
    this.scene.add(this.sky);

    this.nightDomeMaterial = createNightDomeMaterial();
    this.nightDome = new THREE.Mesh(
      new THREE.SphereGeometry(950, 36, 18),
      this.nightDomeMaterial,
    );
    this.nightDome.renderOrder = -1;
    this.scene.add(this.nightDome);

    const starTexture = createStarTexture();
    const faintStars = createStarCloud({
      count: 1400,
      seed: 20261027,
      size: 2.8,
      opacity: 0,
      map: starTexture,
    });
    const brightStars = createStarCloud({
      count: 110,
      seed: 20261028,
      size: 4.6,
      opacity: 0,
      map: starTexture,
    });
    this.starMaterials = [faintStars.material, brightStars.material];
    this.scene.add(faintStars.points, brightStars.points);

    this.groundGroup = new THREE.Group();
    this.groundVisible = true;

    this.groundMaterial = new THREE.MeshBasicMaterial({
      map: createGroundTexture(),
      fog: false,
      toneMapped: false,
    });

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(GROUND_RADIUS, 128),
      this.groundMaterial,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.8;
    this.groundGroup.add(ground);

    const ridges = [
      createHorizonRidge({
        radius: 900,
        minHeight: 12,
        maxHeight: 128,
        color: 0x315d65,
        seed: 4412,
      }),
      createHorizonRidge({
        radius: 760,
        minHeight: 6,
        maxHeight: 88,
        color: 0x1b464e,
        seed: 711,
      }),
      createHorizonRidge({
        radius: 560,
        minHeight: 3,
        maxHeight: 50,
        color: 0x0b1f25,
        seed: 991,
      }),
    ];

    this.ridgeMaterials = ridges.map((ridge) => ({
      material: ridge.material,
      baseColor: ridge.material.color.clone(),
    }));

    for (const ridge of ridges) {
      this.groundGroup.add(ridge);
    }

    this.scene.add(this.groundGroup);

    this.sunGroup = new THREE.Group();
    this.sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_RADIUS, 32, 20),
      new THREE.MeshBasicMaterial({
        color: 0xfff4cf,
        fog: false,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.sunGroup.add(this.sunCore);

    const glowTexture = createGlowTexture();
    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffd875,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
      }),
    );
    this.sunGlow.scale.set(85, 85, 1);
    this.sunGlow.renderOrder = 2;
    this.sunGroup.add(this.sunGlow);
    this.sunGroup.visible = false;
    this.scene.add(this.sunGroup);

    this.moonGroup = new THREE.Group();
    const moonMaterial = createMoonMaterial(this.sunDirection);
    moonMaterial.uniforms.moonMap.value = createMoonTexture(this.renderer);
    this.moonSphere = new THREE.Mesh(
      new THREE.SphereGeometry(MOON_RADIUS, 64, 40),
      moonMaterial,
    );
    this.moonGroup.add(this.moonSphere);

    this.moonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xc9dcff,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
      }),
    );
    this.moonGlow.scale.set(52, 52, 1);
    this.moonGlow.renderOrder = 2;
    this.moonGroup.add(this.moonGlow);
    this.moonGroup.visible = false;
    this.scene.add(this.moonGroup);

    this.moonMaterial = moonMaterial;
  }

  _bindControls() {
    this.handlePointerDown = (event) => {
      if (event.button !== 0 && event.pointerType === 'mouse') {
        return;
      }

      this.dragging = true;
      this.lastPointer.x = event.clientX;
      this.lastPointer.y = event.clientY;
      this.canvas.classList.add('is-dragging');
      this.canvas.setPointerCapture?.(event.pointerId);
      this.canvas.focus({ preventScroll: true });
      event.preventDefault();
    };

    this.handlePointerMove = (event) => {
      if (!this.dragging) {
        return;
      }

      const deltaX = event.clientX - this.lastPointer.x;
      const deltaY = event.clientY - this.lastPointer.y;
      this.lastPointer.x = event.clientX;
      this.lastPointer.y = event.clientY;
      this.yaw -= deltaX * DRAG_SENSITIVITY;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - deltaY * DRAG_SENSITIVITY,
        MIN_PITCH,
        MAX_PITCH,
      );
      this._scheduleRender();
    };

    this.handlePointerUp = (event) => {
      if (!this.dragging) {
        return;
      }

      this.dragging = false;
      this.canvas.classList.remove('is-dragging');

      try {
        this.canvas.releasePointerCapture?.(event.pointerId);
      } catch {
        // The pointer may already have been released by the browser.
      }
    };

    this.handleKeyDown = (event) => {
      let handled = true;

      switch (event.key) {
        case 'ArrowLeft':
          this.yaw += KEYBOARD_STEP;
          break;
        case 'ArrowRight':
          this.yaw -= KEYBOARD_STEP;
          break;
        case 'ArrowUp':
          this.pitch = Math.min(MAX_PITCH, this.pitch + KEYBOARD_STEP);
          break;
        case 'ArrowDown':
          this.pitch = Math.max(MIN_PITCH, this.pitch - KEYBOARD_STEP);
          break;
        default:
          handled = false;
      }

      if (handled) {
        event.preventDefault();
        this._scheduleRender();
      }
    };

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    this.canvas.addEventListener('keydown', this.handleKeyDown);
  }

  _observeSize() {
    if ('ResizeObserver' in globalThis) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas);
    } else {
      globalThis.addEventListener('resize', () => this.resize());
    }
  }

  _scheduleRender() {
    if (this.frameRequest) {
      return;
    }

    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = 0;
      this._emitHeading();
      this.render();
    });
  }

  _emitHeading() {
    this.onHeadingChange?.(headingFromYaw(this.yaw));
  }

  _placeAtHorizontalCoordinates(object, azimuth, altitude) {
    const direction = directionFromHorizontalCoordinates(azimuth, altitude);
    if (!direction) {
      return false;
    }

    object.position.set(
      direction.x * CELESTIAL_DISTANCE,
      direction.y * CELESTIAL_DISTANCE,
      direction.z * CELESTIAL_DISTANCE,
    );
    return true;
  }

  update({ sun = null, moon = null, weather = null } = {}) {
    const sunIsAboveHorizon =
      sun && Number.isFinite(sun.altitude) && sun.altitude > -0.5;
    const sunHasPosition =
      sun &&
      Number.isFinite(sun.azimuth) &&
      Number.isFinite(sun.altitude) &&
      this._placeAtHorizontalCoordinates(
        this.sunGroup,
        sun.azimuth,
        sun.altitude,
      );

    this.sunGroup.visible = Boolean(sunHasPosition && sunIsAboveHorizon);

    if (sunHasPosition) {
      const direction = directionFromHorizontalCoordinates(
        sun.azimuth,
        sun.altitude,
      );
      this.sunDirection.set(direction.x, direction.y, direction.z).normalize();
    } else {
      this.sunDirection.set(0, -1, 0);
    }

    this.sky.material.uniforms.sunPosition.value.copy(this.sunDirection);
    this.moonMaterial.uniforms.sunDirection.value.copy(this.sunDirection);

    const cloudFraction = THREE.MathUtils.clamp(
      Number.isFinite(weather?.cloudCover) ? weather.cloudCover / 100 : 0,
      0,
      1,
    );
    const precipitation = Number.isFinite(weather?.precipitation)
      ? Math.max(0, weather.precipitation)
      : 0;
    const stormBoost = weather?.kind === 'storm' || weather?.kind === 'rain' ? 0.08 : 0;
    const cloudCoverage =
      cloudFraction > 0.01
        ? Math.min(0.96, 0.08 + Math.pow(cloudFraction, 0.62) * 0.9)
        : 0;
    const cloudDensity = THREE.MathUtils.clamp(
      0.68 + cloudFraction * 0.25 + Math.min(0.15, precipitation * 0.025) + stormBoost,
      0.45,
      0.98,
    );

    this.sky.material.uniforms.cloudCoverage.value = cloudCoverage;
    this.sky.material.uniforms.cloudDensity.value = cloudDensity;
    this.nightDomeMaterial.uniforms.cloudCoverage.value = cloudCoverage;
    this.nightDomeMaterial.uniforms.cloudDensity.value = cloudDensity;
    this.nightDomeMaterial.uniforms.cloudScale.value =
      this.sky.material.uniforms.cloudScale.value;

    const starVisibility = sunHasPosition
      ? THREE.MathUtils.smoothstep(-sun.altitude, 0.5, 8)
      : 1;
    const nightAmount = sunHasPosition
      ? THREE.MathUtils.smoothstep(-sun.altitude, 5, 12)
      : 1;
    const weatherVisibility = 1 - 0.92 * cloudFraction;
    const sunWeatherVisibility = Math.max(0.06, 1 - 0.92 * cloudFraction);

    for (const material of this.starMaterials) {
      material.opacity = 0.96 * starVisibility * weatherVisibility;
    }

    this.sunCore.material.opacity = sunWeatherVisibility;
    this.sunGlow.material.opacity = 0.9 * sunWeatherVisibility;

    this.nightDomeMaterial.uniforms.nightAmount.value = 0.94 * nightAmount;
    this.nightDome.visible = nightAmount > 0.005;

    const groundBrightness = 0.42 + 0.58 * (1 - nightAmount);
    this.groundMaterial.color.setScalar(groundBrightness);

    for (const ridge of this.ridgeMaterials) {
      ridge.material.color.copy(ridge.baseColor).multiplyScalar(groundBrightness);
    }

    const moonIsAboveHorizon =
      moon && Number.isFinite(moon.altitude) && moon.altitude > -0.5;
    const moonHasPosition =
      moon &&
      Number.isFinite(moon.azimuth) &&
      Number.isFinite(moon.altitude) &&
      this._placeAtHorizontalCoordinates(
        this.moonGroup,
        moon.azimuth,
        moon.altitude,
      );

    this.moonGroup.visible = Boolean(moonHasPosition && moonIsAboveHorizon);
    this.moonMaterial.uniforms.cloudCover.value = cloudFraction;

    if (moonHasPosition) {
      const moonDirection = directionFromHorizontalCoordinates(
        moon.azimuth,
        moon.altitude,
      );
      this.nightDomeMaterial.uniforms.moonDirection.value
        .set(moonDirection.x, moonDirection.y, moonDirection.z)
        .normalize();
    } else {
      this.nightDomeMaterial.uniforms.moonDirection.value.set(0, -1, 0);
    }

    const illuminatedFraction = THREE.MathUtils.clamp(
      Number.isFinite(moon?.illumination?.fraction)
        ? moon.illumination.fraction
        : 0,
      0,
      1,
    );
    this.moonGlow.material.opacity =
      this.moonGroup.visible
        ? (0.04 + illuminatedFraction * 0.16) *
          (0.35 + nightAmount * 0.65) *
          (1 - 0.85 * cloudFraction)
        : 0;

    this.render();
  }

  setGroundVisible(visible) {
    this.groundVisible = Boolean(visible);
    this.groundGroup.visible = this.groundVisible;
    this.render();
  }

  lookAt(azimuth, altitude) {
    if (!Number.isFinite(azimuth) || !Number.isFinite(altitude)) {
      return;
    }

    this.yaw = THREE.MathUtils.degToRad(-azimuth);
    this.pitch = THREE.MathUtils.clamp(
      THREE.MathUtils.degToRad(altitude),
      MIN_PITCH,
      MAX_PITCH,
    );
    this._emitHeading();
    this.render();
  }

  resize() {
    const width = Math.round(this.canvas.clientWidth);
    const height = Math.round(this.canvas.clientHeight);

    if (width < 2 || height < 2) {
      return;
    }

    const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    for (const material of this.starMaterials) {
      material.size = material.userData.baseSize * pixelRatio;
    }

    this.render();
  }

  render() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.renderer.render(this.scene, this.camera);
  }
}

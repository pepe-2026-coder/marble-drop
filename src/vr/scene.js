/* ============================================================
   VR scene: a tilted arcade cabinet standing on a dark floor,
   with the live 2D board canvas mapped onto its screen.
   Dependency-free WebGL (GLSL ES 1.00, works on WebGL 1 and 2).
   ============================================================ */

const FOG = [0.045, 0.05, 0.07];

/* Everything below is in cabinet-local metres: +Y up, +Z toward the
   player, origin on the floor at the centre of the cabinet footprint. */
const CABINET = {
  /* Sit-down machine: the playfield leans back ~43° from the floor, the
     cabinet tops out at 1.58 m, so a seated player looks slightly down at
     the board instead of craning up at it. */
  halfWidth: 0.36,
  backZ: -0.62,
  frontZ: 0.6,
  baseY: 0.7,
  topY: 1.58,
  frontTopZ: -0.34,
  screenBottom: 0.07,
  screenLength: 1.12,
  screenHalfWidth: 0.284,
  bezelOffset: 0.006,
};

/* Stool the player sits on. Local z is where the player's head ends up. */
const STOOL = {
  x: 0,
  z: 1.35,
  seatY: 0.46,
  seatRadius: 0.19,
  hit: 0.19,
};

/* Board canvas crop (in canvas pixels) — mirrors BOARD_CROPS in engine.js
   so the visible cabinet fills the screen without the transparent gutter. */
const BOARD_CROP = { left: 50, right: 670, top: 18 };
const BOARD_W = 720;
const BOARD_H = 1240;

const COLORS = {
  back: [0.085, 0.09, 0.115],
  side: [0.16, 0.168, 0.205],
  plinth: [0.105, 0.108, 0.13],
  bezel: [0.03, 0.033, 0.045],
  top: [0.21, 0.23, 0.3],
  marqueeBack: [0.06, 0.07, 0.09],
  floor: [0.105, 0.115, 0.145],
};

const TAU = Math.PI * 2;

/* ── Control deck layout (cabinet-local metres) ─────────── */
/* The deck is the physical control panel mounted at the bottom of the tilted
   face. It sits low enough to stay clear of the slot bank but still inside
   arm's reach of a player standing at the machine. */
const DECK = {
  left: -0.46,
  right: 0.5,
  bottom: 0.62,
  top: 0.7,
  back: 0.58,
  front: 1.05,
};

/* Outline of the deck, taken from the sketch: rounded on the left where the
   marble frame sits, tapering to the right where the launch lever stands. */
const DECK_PLAN = [
  [-0.4, 0.56],
  [0.4, 0.56],
  [0.4, 1.02],
  [-0.4, 1.02],
];

/* Exchange kiosk: a room-level prop with its own local space (origin at the
   floor under its centre). It never shares coordinates with the machines. */
const SHOP = {
  left: -0.28,
  right: 0.28,
  back: -0.24,
  front: 0.24,
  top: 1.38,
  button: { x: 0, y: 0.72, z: 0.3, radius: 0.055 },
  refresh: { x: 0.56, y: 0.82, z: 0.18, radius: 0.05 },
};

/* Marble feeder: a shallow tray with a hole in the near-left corner. */
const FEEDER = {
  x: -0.22,
  z: 0.83,
  width: 0.26,
  depth: 0.22,
  y: 0.716,
  hole: { x: -0.29, z: 0.9 },
  hit: 0.14,
};

const DECK_COLORS = {
  body: [0.075, 0.08, 0.1],
  inlay: [0.11, 0.115, 0.14],
  ring: [0.045, 0.05, 0.062],
  start: [0.66, 0.13, 0.1],
  key: [0.26, 0.29, 0.36],
  end: [0.4, 0.24, 0.1],
  rod: [0.55, 0.57, 0.62],
  knob: [0.42, 0.075, 0.06],
};

/* The deck only has the three controls from the reference sketch:
   marble frame, start button, launch lever. */
const DECK_BUTTONS = [
  { id: "start", x: 0.08, z: 0.84, radius: 0.075, height: 0.032, color: DECK_COLORS.start, hit: 0.1 },
];

/* Vertical plunger standing on the right side of the square control deck.
   Grab the ball and press it down; release to launch. */
const LEVER = {
  x: 0.32,
  z: 0.95,
  baseY: 0.7,
  restY: 1.02,
  travel: 0.16,
  knobRadius: 0.036,
  rodRadius: 0.011,
  hit: 0.09,
};

/* ── Geometry helpers ───────────────────────────────────── */

function boxPolygons(x0, x1, y0, y1, z0, z1, color) {
  return [
    { points: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], outward: [0, 1, 0], color },
    { points: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], outward: [0, 0, 1], color },
    { points: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], outward: [-1, 0, 0], color },
    { points: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], outward: [1, 0, 0], color },
    { points: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], outward: [0, -1, 0], color },
    { points: [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], outward: [0, 0, -1], color },
  ];
}

function prismPolygons(plan, y0, y1, color) {
  const polygons = [
    { points: plan.map(([x, z]) => [x, y1, z]), outward: [0, 1, 0], color },
    { points: plan.map(([x, z]) => [x, y0, z]), outward: [0, -1, 0], color },
  ];
  for (let index = 0; index < plan.length; index += 1) {
    const a = plan[index];
    const b = plan[(index + 1) % plan.length];
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    polygons.push({
      points: [
        [a[0], y0, a[1]],
        [a[0], y1, a[1]],
        [b[0], y1, b[1]],
        [b[0], y0, b[1]],
      ],
      outward: [mx, 0, mz],
      color,
    });
  }
  return polygons;
}

function insetPlan(plan, amount) {
  const cx = plan.reduce((sum, [x]) => sum + x, 0) / plan.length;
  const cz = plan.reduce((sum, [, z]) => sum + z, 0) / plan.length;
  return plan.map(([x, z]) => {
    const dx = x - cx;
    const dz = z - cz;
    const length = Math.hypot(dx, dz) || 1;
    return [x - (dx / length) * amount, z - (dz / length) * amount];
  });
}

function cylinderPolygons(cx, y0, cz, radius, height, segments, color) {
  const polygons = [];
  const top = y0 + height;
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * TAU;
    const a1 = ((i + 1) / segments) * TAU;
    const x0 = cx + Math.cos(a0) * radius;
    const z0 = cz + Math.sin(a0) * radius;
    const x1 = cx + Math.cos(a1) * radius;
    const z1 = cz + Math.sin(a1) * radius;
    const mid = (a0 + a1) / 2;
    polygons.push({
      points: [[x0, y0, z0], [x0, top, z0], [x1, top, z1], [x1, y0, z1]],
      outward: [Math.cos(mid), 0, Math.sin(mid)],
      color,
    });
  }
  const cap = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * TAU;
    cap.push([cx + Math.cos(angle) * radius, top, cz + Math.sin(angle) * radius]);
  }
  polygons.push({ points: cap, outward: [0, 1, 0], color });
  polygons.push({ points: [...cap].reverse().map((p) => [p[0], y0, p[2]]), outward: [0, -1, 0], color });
  return polygons;
}

function cylinderZPolygons(cx, cy, z0, radius, length, segments, color) {
  const polygons = [];
  const z1 = z0 + length;
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * TAU;
    const a1 = ((i + 1) / segments) * TAU;
    const x0 = cx + Math.cos(a0) * radius;
    const y0 = cy + Math.sin(a0) * radius;
    const x1 = cx + Math.cos(a1) * radius;
    const y1 = cy + Math.sin(a1) * radius;
    const mid = (a0 + a1) / 2;
    polygons.push({
      points: [[x0, y0, z0], [x0, y0, z1], [x1, y1, z1], [x1, y1, z0]],
      outward: [Math.cos(mid), Math.sin(mid), 0],
      color,
    });
  }
  const cap = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * TAU;
    cap.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, z1]);
  }
  polygons.push({ points: cap, outward: [0, 0, 1], color });
  polygons.push({ points: [...cap].reverse().map(([x, y]) => [x, y, z0]), outward: [0, 0, -1], color });
  return polygons;
}

function spherePolygons(cx, cy, cz, radius, rings, segments, color) {
  const polygons = [];
  const point = (phi, theta) => [
    cx + radius * Math.sin(phi) * Math.cos(theta),
    cy + radius * Math.cos(phi),
    cz + radius * Math.sin(phi) * Math.sin(theta),
  ];
  for (let r = 0; r < rings; r += 1) {
    const phi0 = (r / rings) * Math.PI;
    const phi1 = ((r + 1) / rings) * Math.PI;
    for (let s = 0; s < segments; s += 1) {
      const theta0 = (s / segments) * TAU;
      const theta1 = ((s + 1) / segments) * TAU;
      const points = [point(phi0, theta0), point(phi0, theta1), point(phi1, theta1), point(phi1, theta0)];
      const center = [
        (points[0][0] + points[2][0]) / 2,
        (points[0][1] + points[2][1]) / 2,
        (points[0][2] + points[2][2]) / 2,
      ];
      polygons.push({ points, outward: [center[0] - cx, center[1] - cy, center[2] - cz], color });
    }
  }
  return polygons;
}

const LIT_VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform vec3 uOffset;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos + uOffset, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aNormal;
  vColor = aColor;
  gl_Position = uProj * uView * world;
}
`;

const LIT_FS = `
precision mediump float;
uniform vec3 uEye;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uFillDir;
uniform vec3 uFillColor;
uniform vec3 uAmbient;
uniform vec3 uFog;
uniform vec3 uTint;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  float key = max(dot(n, uKeyDir), 0.0);
  float fill = max(dot(n, uFillDir), 0.0);
  vec3 toEye = uEye - vWorld;
  float dist = length(toEye);
  vec3 viewDir = toEye / max(dist, 0.0001);
  float rim = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);
  vec3 color = vColor * uTint * (uAmbient + uKeyColor * key + uFillColor * fill);
  color += vec3(0.5, 0.66, 1.0) * rim * 0.12;
  float fog = smoothstep(6.0, 18.0, dist);
  gl_FragColor = vec4(mix(color, uFog, fog), 1.0);
}
`;

const LINE_VS = `
attribute vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
void main() {
  gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
}
`;

const LINE_FS = `
precision mediump float;
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  gl_FragColor = vec4(uColor, uAlpha);
}
`;

const TEX_VS = `
attribute vec3 aPos;
attribute vec2 aUv;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
}
`;

const TEX_FS = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uTint;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uTex, vUv);
  gl_FragColor = vec4(c.rgb * uTint, c.a * uOpacity);
}
`;

/* ── Small vector helpers ───────────────────────────────── */

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function polygonNormal(points) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

/* ── Programs and buffers ───────────────────────────────── */

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`VR shader error: ${log}`);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`VR program error: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

function createTexture(gl, source) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

/**
 * Build one triangle soup from a list of polygons. Each polygon is
 * auto-wound so its normal faces `outward`; colours are flat per face.
 */
function createLitMesh(gl, polygons) {
  const data = [];
  for (const polygon of polygons) {
    let points = polygon.points;
    let normal = polygonNormal(points);
    if (dot(normal, polygon.outward) < 0) {
      points = [...points].reverse();
      normal = [-normal[0], -normal[1], -normal[2]];
    }
    for (let i = 1; i < points.length - 1; i += 1) {
      for (const point of [points[0], points[i], points[i + 1]]) {
        data.push(point[0], point[1], point[2], normal[0], normal[1], normal[2], ...polygon.color);
      }
    }
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  return { buffer, count: data.length / 9 };
}

/** A single textured quad: four corners and four [u, v] pairs. */
function createQuad(gl, corners, uvs) {
  const data = [];
  const order = [0, 1, 2, 0, 2, 3];
  for (const index of order) {
    data.push(...corners[index], ...uvs[index]);
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  return { buffer, count: 6 };
}

/* ── Generated textures ─────────────────────────────────── */

function makeGlowTexture(size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.35, "rgba(255, 255, 255, 0.55)");
  gradient.addColorStop(0.7, "rgba(255, 255, 255, 0.14)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function makeStripTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 4;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 64, 0);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  gradient.addColorStop(0.32, "rgba(255, 255, 255, 0.85)");
  gradient.addColorStop(0.5, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.68, "rgba(255, 255, 255, 0.85)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 4);
  return canvas;
}

function makeAttractTexture(label = "TABLE", accent = "#e7b566") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 900;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, 0, 900);
  bg.addColorStop(0, "#0b0d14");
  bg.addColorStop(0.55, "#06070c");
  bg.addColorStop(1, "#03040a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 900);

  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 6;
  ctx.strokeRect(20, 20, 472, 860);
  ctx.globalAlpha = 1;

  // Faux peg field so the screen still reads as a pachinko board.
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.16;
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const x = 96 + col * 40 + (row % 2 ? 20 : 0);
      const y = 250 + row * 46;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = accent;
  ctx.font = '800 46px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(label, 256, 120);
  ctx.fillStyle = "rgba(244, 236, 220, 0.5)";
  ctx.font = '600 26px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillText("对着机台按扳机坐下", 256, 790);

  return canvas;
}

function makeStartLabelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 256, 256);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '800 84px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = "rgba(255, 240, 225, 0.95)";
  ctx.fillText("开始", 128, 132);
  return canvas;
}

function makeCarpetTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#3a0f16";
  ctx.fillRect(0, 0, 512, 512);

  // Diamond lattice.
  ctx.strokeStyle = "rgba(255, 180, 150, 0.10)";
  ctx.lineWidth = 3;
  for (let i = -512; i < 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 512, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 512, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
  }

  // Dots at the lattice crossings.
  ctx.fillStyle = "rgba(255, 200, 160, 0.12)";
  for (let y = 0; y < 512; y += 64) {
    for (let x = 0; x < 512; x += 64) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Gold border.
  ctx.strokeStyle = "rgba(231, 181, 102, 0.35)";
  ctx.lineWidth = 10;
  ctx.strokeRect(16, 16, 480, 480);
  return canvas;
}

function makeWallSignTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#05060b";
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = "rgba(34, 230, 255, 0.55)";
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 1004, 236);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '800 96px "Arial Black", "Helvetica Neue", Arial, sans-serif';
  ctx.shadowColor = "rgba(34, 230, 255, 0.9)";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#bff4ff";
  ctx.fillText("MARBLE DROP", 512, 108);
  ctx.shadowBlur = 16;
  ctx.shadowColor = "rgba(255, 47, 179, 0.9)";
  ctx.font = '700 56px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = "#ffb3e6";
  ctx.fillText("弹 珠 厅", 512, 200);
  return canvas;
}

function makeShopTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  return canvas;
}

function drawShopScreen(ctx, info) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = "#05070c";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(231, 181, 102, 0.45)";
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, w - 24, h - 24);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e7b566";
  ctx.font = '800 52px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillText("兑 换 机", w / 2, 70);

  ctx.fillStyle = "#f4ecdc";
  ctx.font = '700 64px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(`${info.marbles}`, w / 2, 170);
  ctx.fillStyle = "rgba(244, 236, 220, 0.5)";
  ctx.font = '600 30px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillText("弹珠", w / 2, 222);

  ctx.fillStyle = "rgba(244, 236, 220, 0.8)";
  ctx.font = '600 32px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(`游戏币 ${info.coins}   ·   彩票 ${info.tickets}`, w / 2, 292);

  ctx.fillStyle = "rgba(231, 181, 102, 0.75)";
  ctx.font = '600 26px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillText("1 彩票 → 5 游戏币", w / 2, 344);
  ctx.fillText("1 游戏币 → 5 弹珠", w / 2, 382);

  ctx.fillStyle = info.message ? "#ffd98a" : "rgba(244, 236, 220, 0.45)";
  ctx.font = '700 30px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(info.message || "按红色按钮一键兑换", w / 2, 448);
}

function makeRefreshTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 112;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#120a08";
  ctx.fillRect(0, 0, 256, 112);
  ctx.strokeStyle = "rgba(255, 120, 90, 0.75)";
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 244, 100);
  ctx.fillStyle = "#ffb59c";
  ctx.font = '700 40px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("刷新", 128, 58);
  return canvas;
}

function makeMarqueeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 288;
  const ctx = canvas.getContext("2d");

  const background = ctx.createLinearGradient(0, 0, 0, 288);
  background.addColorStop(0, "#141020");
  background.addColorStop(0.55, "#0a0a12");
  background.addColorStop(1, "#05060b");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1024, 288);

  ctx.strokeStyle = "rgba(231, 181, 102, 0.42)";
  ctx.lineWidth = 5;
  ctx.strokeRect(14, 14, 996, 260);

  ctx.strokeStyle = "rgba(231, 181, 102, 0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, 964, 228);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '800 104px "Arial Black", "Helvetica Neue", Arial, sans-serif';
  if ("letterSpacing" in ctx) ctx.letterSpacing = "10px";

  const text = ctx.createLinearGradient(0, 90, 0, 200);
  text.addColorStop(0, "#fff3d4");
  text.addColorStop(0.5, "#e7b566");
  text.addColorStop(1, "#b57f34");
  ctx.shadowColor = "rgba(231, 181, 102, 0.75)";
  ctx.shadowBlur = 34;
  ctx.fillStyle = text;
  ctx.fillText("MARBLE DROP", 512, 132);

  ctx.shadowBlur = 12;
  ctx.font = '600 44px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  if ("letterSpacing" in ctx) ctx.letterSpacing = "18px";
  ctx.fillStyle = "rgba(244, 236, 220, 0.72)";
  ctx.fillText("弹 珠 台", 512, 226);

  return canvas;
}

/* ── Geometry ───────────────────────────────────────────── */

function buildGeometry(gl) {
  const { halfWidth: hw, backZ, frontZ, baseY, topY, frontTopZ } = CABINET;

  /* Slope of the tilted front face, measured from its bottom edge. */
  const slopeY = topY - baseY;
  const slopeZ = frontTopZ - frontZ;
  const slopeLength = Math.hypot(slopeY, slopeZ);
  const up = [0, slopeY / slopeLength, slopeZ / slopeLength];
  const normal = [0, -slopeZ / slopeLength, slopeY / slopeLength];

  const frontPoint = (x, s, out = 0) => [
    x,
    baseY + up[1] * s + normal[1] * out,
    frontZ + up[2] * s + normal[2] * out,
  ];

  const cabinet = createLitMesh(gl, [
    {
      points: [
        [-hw, -0.02, backZ],
        [hw, -0.02, backZ],
        [hw, topY, backZ],
        [-hw, topY, backZ],
      ],
      outward: [0, 0, -1],
      color: COLORS.back,
    },
    {
      points: [
        [-hw, -0.02, backZ],
        [-hw, -0.02, frontZ],
        [-hw, baseY, frontZ],
        [-hw, topY, frontTopZ],
        [-hw, topY, backZ],
      ],
      outward: [-1, 0, 0],
      color: COLORS.side,
    },
    {
      points: [
        [hw, -0.02, backZ],
        [hw, -0.02, frontZ],
        [hw, baseY, frontZ],
        [hw, topY, frontTopZ],
        [hw, topY, backZ],
      ],
      outward: [1, 0, 0],
      color: COLORS.side,
    },
    {
      points: [
        [-hw, -0.02, frontZ],
        [hw, -0.02, frontZ],
        [hw, baseY, frontZ],
        [-hw, baseY, frontZ],
      ],
      outward: [0, 0, 1],
      color: COLORS.plinth,
    },
    {
      /* The cabinet sits 2 cm into the floor, so this underside is hidden
         from outside but still closes the shell: without it the back panel
         shows through under the plinth when the camera looks down. */
      points: [
        [-hw, -0.02, backZ],
        [hw, -0.02, backZ],
        [hw, -0.02, frontZ],
        [-hw, -0.02, frontZ],
      ],
      outward: [0, -1, 0],
      color: [0.016, 0.018, 0.026],
    },
    {
      points: [
        [-hw, baseY, frontZ],
        [hw, baseY, frontZ],
        [hw, topY, frontTopZ],
        [-hw, topY, frontTopZ],
      ],
      outward: normal,
      color: COLORS.bezel,
    },
    {
      points: [
        [-hw, topY, frontTopZ],
        [hw, topY, frontTopZ],
        [hw, topY, backZ],
        [-hw, topY, backZ],
      ],
      outward: [0, 1, 0],
      color: COLORS.top,
    },
  ]);

  /* Marquee: a shallow box sitting on the cabinet roof. */
  const marquee = {
    fbl: [-0.3, 1.58, -0.34],
    fbr: [0.3, 1.58, -0.34],
    ftl: [-0.3, 1.74, -0.385],
    ftr: [0.3, 1.74, -0.385],
    bbl: [-0.3, 1.58, -0.44],
    bbr: [0.3, 1.58, -0.44],
    btl: [-0.3, 1.74, -0.485],
    btr: [0.3, 1.74, -0.485],
  };
  const marqueeBox = createLitMesh(gl, [
    {
      points: [marquee.fbl, marquee.fbr, marquee.bbr, marquee.bbl],
      outward: [0, -1, 0],
      color: COLORS.marqueeBack,
    },
    {
      points: [marquee.ftl, marquee.ftr, marquee.btr, marquee.btl],
      outward: [0, 1, 0],
      color: COLORS.marqueeBack,
    },
    {
      points: [marquee.fbl, marquee.ftl, marquee.btl, marquee.bbl],
      outward: [-1, 0, 0],
      color: COLORS.marqueeBack,
    },
    {
      points: [marquee.fbr, marquee.bbr, marquee.btr, marquee.ftr],
      outward: [1, 0, 0],
      color: COLORS.marqueeBack,
    },
  ]);

  /* Room shell: back/side walls, ceiling, neon bars and light panels. */
  const room = createLitMesh(gl, [
    {
      points: [[-7, 0, -3.2], [7, 0, -3.2], [7, 3.4, -3.2], [-7, 3.4, -3.2]],
      outward: [0, 0, 1],
      color: [0.16, 0.175, 0.22],
    },
    {
      points: [[-5.6, 0, -3.2], [-5.6, 0, 5.4], [-5.6, 3.4, 5.4], [-5.6, 3.4, -3.2]],
      outward: [1, 0, 0],
      color: [0.13, 0.14, 0.18],
    },
    {
      points: [[5.6, 0, -3.2], [5.6, 0, 5.4], [5.6, 3.4, 5.4], [5.6, 3.4, -3.2]],
      outward: [-1, 0, 0],
      color: [0.13, 0.14, 0.18],
    },
    {
      points: [[-5.6, 3.4, -3.2], [5.6, 3.4, -3.2], [5.6, 3.4, 5.4], [-5.6, 3.4, 5.4]],
      outward: [0, -1, 0],
      color: [0.1, 0.11, 0.14],
    },
    {
      points: [[-5.6, 0, 5.4], [5.6, 0, 5.4], [5.6, 3.4, 5.4], [-5.6, 3.4, 5.4]],
      outward: [0, 0, -1],
      color: [0.13, 0.14, 0.18],
    },
  ]);

  const ceilingLamp = createQuad(
    gl,
    [
      [-1.9, 3.36, -1.6],
      [-0.3, 3.36, -1.6],
      [-0.3, 3.36, -0.6],
      [-1.9, 3.36, -0.6],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );
  const ceilingLamp2 = createQuad(
    gl,
    [
      [0.4, 3.36, -1.6],
      [2.0, 3.36, -1.6],
      [2.0, 3.36, -0.6],
      [0.4, 3.36, -0.6],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );
  const ceilingLamp3 = createQuad(
    gl,
    [
      [-4.8, 3.36, -1.6],
      [-3.2, 3.36, -1.6],
      [-3.2, 3.36, -0.6],
      [-4.8, 3.36, -0.6],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );

  const carpet = createQuad(
    gl,
    [
      [-5.4, 0.012, 3.0],
      [5.4, 0.012, 3.0],
      [5.4, 0.012, -0.9],
      [-5.4, 0.012, -0.9],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );

  const wallSign = createQuad(
    gl,
    [
      [-3.1, 2.02, -3.14],
      [-0.9, 2.02, -3.14],
      [-0.9, 2.56, -3.14],
      [-3.1, 2.56, -3.14],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );
  const wallSign2 = createQuad(
    gl,
    [
      [0.9, 2.02, -3.14],
      [3.1, 2.02, -3.14],
      [3.1, 2.56, -3.14],
      [0.9, 2.56, -3.14],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );

  const wallGlow = createQuad(
    gl,
    [
      [-4.4, 1.5, -3.15],
      [-1.2, 1.5, -3.15],
      [-1.2, 2.5, -3.15],
      [-4.4, 2.5, -3.15],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );
  const wallGlow2 = createQuad(
    gl,
    [
      [1.2, 1.5, -3.15],
      [4.4, 1.5, -3.15],
      [4.4, 2.5, -3.15],
      [1.2, 2.5, -3.15],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );

  const neonBar = createQuad(
    gl,
    [
      [-5.2, 2.62, -3.18],
      [5.2, 2.62, -3.18],
      [5.2, 2.68, -3.18],
      [-5.2, 2.68, -3.18],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );
  const neonBar2 = createQuad(
    gl,
    [
      [-5.2, 0.12, -3.18],
      [5.2, 0.12, -3.18],
      [5.2, 0.2, -3.18],
      [-5.2, 0.2, -3.18],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );

  const floor = createLitMesh(gl, [
    {
      points: [
        [-40, 0, 40],
        [40, 0, 40],
        [40, 0, -40],
        [-40, 0, -40],
      ],
      outward: [0, 1, 0],
      color: COLORS.floor,
    },
  ]);

  /* Screen: exactly the cropped board area, inset into the tilted face. */
  const s0 = CABINET.screenBottom;
  const s1 = s0 + CABINET.screenLength;
  const hwScreen = CABINET.screenHalfWidth;
  const offset = CABINET.bezelOffset;
  const screenCorners = [
    frontPoint(-hwScreen, s0, offset),
    frontPoint(hwScreen, s0, offset),
    frontPoint(hwScreen, s1, offset),
    frontPoint(-hwScreen, s1, offset),
  ];
  const u0 = BOARD_CROP.left / BOARD_W;
  const u1 = BOARD_CROP.right / BOARD_W;
  const v1 = 1 - BOARD_CROP.top / BOARD_H;
  const screen = createQuad(gl, screenCorners, [
    [u0, 0],
    [u1, 0],
    [u1, v1],
    [u0, v1],
  ]);

  const marqueeFace = createQuad(
    gl,
    [marquee.fbl, marquee.fbr, marquee.ftr, marquee.ftl],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );

  /* Backlit frame around the screen: four soft neon bars. */
  const frame = [];
  const fw = 0.012;
  const gap = 0.008;
  const left = -hwScreen - gap - fw;
  const right = hwScreen + gap + fw;
  const bottom = s0 - gap - fw;
  const top = s1 + gap + fw;

  const bar = (a, b, c, d) =>
    frame.push(createQuad(gl, [a, b, c, d], [[0, 0], [1, 0], [1, 1], [0, 1]]));

  bar(frontPoint(left, bottom, 0.004), frontPoint(left + fw, bottom, 0.004), frontPoint(left + fw, top, 0.004), frontPoint(left, top, 0.004));
  bar(frontPoint(right - fw, bottom, 0.004), frontPoint(right, bottom, 0.004), frontPoint(right, top, 0.004), frontPoint(right - fw, top, 0.004));
  bar(frontPoint(left, bottom, 0.004), frontPoint(right, bottom, 0.004), frontPoint(right, bottom + fw, 0.004), frontPoint(left, bottom + fw, 0.004));
  bar(frontPoint(left, top - fw, 0.004), frontPoint(right, top - fw, 0.004), frontPoint(right, top, 0.004), frontPoint(left, top, 0.004));

  /* Warm strip washing the seam between the bezel and the plinth. */
  const baseStrip = createQuad(
    gl,
    [
      [-0.3, 0.66, 0.603],
      [0.3, 0.66, 0.603],
      [0.3, 0.68, 0.603],
      [-0.3, 0.68, 0.603],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ],
  );

  const shadow = createQuad(
    gl,
    [
      [-1.25, 0.004, 0.85],
      [1.25, 0.004, 0.85],
      [1.25, 0.004, -1.15],
      [-1.25, 0.004, -1.15],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );

  const floorGlow = createQuad(
    gl,
    [
      [-1.75, 0.006, 1.05],
      [1.75, 0.006, 1.05],
      [1.75, 0.006, -1.45],
      [-1.75, 0.006, -1.45],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );

  const marqueeGlow = createQuad(
    gl,
    [
      [-0.42, 1.52, -0.3],
      [0.42, 1.52, -0.3],
      [0.42, 1.8, -0.36],
      [-0.42, 1.8, -0.36],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );

  /* ── Control deck ─────────────────────────────────────── */
  const deckPolys = [
    ...prismPolygons(DECK_PLAN, DECK.bottom, DECK.top, DECK_COLORS.body),
    ...prismPolygons(insetPlan(DECK_PLAN, 0.03), DECK.top, DECK.top + 0.004, DECK_COLORS.inlay),
  ];
  for (const button of DECK_BUTTONS) {
    deckPolys.push(
      ...cylinderPolygons(button.x, DECK.top + 0.004, button.z, button.radius + 0.009, 0.006, 18, DECK_COLORS.ring),
    );
  }
  deckPolys.push(...cylinderPolygons(LEVER.x, DECK.top + 0.004, LEVER.z, 0.05, 0.03, 18, DECK_COLORS.ring));
  /* Slide housing: keeps the plunger looking connected while it is pulled out. */
  deckPolys.push(
    ...boxPolygons(
      LEVER.x - 0.035,
      LEVER.x + 0.035,
      DECK.top + 0.004,
      DECK.top + 0.05,
      LEVER.z - 0.03,
      LEVER.z + LEVER.travel + 0.03,
      [0.05, 0.055, 0.07],
    ),
  );

  /* Marble feeder tray: shallow box, lip, and a hole where the marbles fall. */
  const trayLeft = FEEDER.x - FEEDER.width / 2;
  const trayRight = FEEDER.x + FEEDER.width / 2;
  const trayBack = FEEDER.z - FEEDER.depth / 2;
  const trayFront = FEEDER.z + FEEDER.depth / 2;
  deckPolys.push(
    ...boxPolygons(trayLeft, trayRight, FEEDER.y - 0.016, FEEDER.y, trayBack, trayFront, DECK_COLORS.ring),
  );
  const lip = 0.012;
  const lipColor = [0.16, 0.17, 0.2];
  deckPolys.push(
    ...boxPolygons(trayLeft, trayRight, FEEDER.y, FEEDER.y + lip, trayBack - lip, trayBack, lipColor),
    ...boxPolygons(trayLeft, trayRight, FEEDER.y, FEEDER.y + lip, trayFront, trayFront + lip, lipColor),
    ...boxPolygons(trayLeft - lip, trayLeft, FEEDER.y, FEEDER.y + lip, trayBack - lip, trayFront + lip, lipColor),
    ...boxPolygons(trayRight, trayRight + lip, FEEDER.y, FEEDER.y + lip, trayBack - lip, trayFront + lip, lipColor),
  );
  deckPolys.push(
    ...cylinderPolygons(FEEDER.hole.x, FEEDER.y - 0.014, FEEDER.hole.z, 0.028, 0.016, 16, [0.01, 0.012, 0.018]),
  );

  const deck = createLitMesh(gl, deckPolys);

  /* Stool: the seat you sit on to play. */
  const stool = createLitMesh(gl, [
    ...cylinderPolygons(STOOL.x, STOOL.seatY - 0.04, STOOL.z, STOOL.seatRadius, 0.04, 22, [0.26, 0.08, 0.07]),
    ...cylinderPolygons(STOOL.x, 0.02, STOOL.z, 0.035, STOOL.seatY - 0.06, 12, [0.2, 0.21, 0.24]),
    ...cylinderPolygons(STOOL.x, 0, STOOL.z, 0.14, 0.025, 18, [0.14, 0.15, 0.17]),
  ]);

  const marbleMesh = createLitMesh(gl, spherePolygons(0, 0, 0, 0.013, 6, 10, [0.93, 0.93, 0.88]));

  /* Debug refresh button, floating at the left of the active machine. */
  const startLabel = createQuad(
    gl,
    [
      [-0.005, 0.7455, 0.905],
      [0.125, 0.7455, 0.905],
      [0.125, 0.7455, 0.775],
      [-0.005, 0.7455, 0.775],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );

  const shopBody = createLitMesh(gl, [
    ...boxPolygons(SHOP.left, SHOP.right, 0, 0.62, SHOP.back, SHOP.front, [0.11, 0.12, 0.15]),
    ...boxPolygons(SHOP.left, SHOP.right, 0.62, SHOP.top, SHOP.back, SHOP.back + 0.07, [0.1, 0.11, 0.14]),
    ...boxPolygons(SHOP.left, SHOP.right, 0.62, SHOP.top, SHOP.front - 0.07, SHOP.front, [0.1, 0.11, 0.14]),
    ...boxPolygons(SHOP.left, SHOP.left + 0.06, 0.62, SHOP.top, SHOP.back, SHOP.front, [0.1, 0.11, 0.14]),
    ...boxPolygons(SHOP.right - 0.06, SHOP.right, 0.62, SHOP.top, SHOP.back, SHOP.front, [0.1, 0.11, 0.14]),
    ...boxPolygons(SHOP.left - 0.02, SHOP.right + 0.02, 0, 0.06, SHOP.front - 0.02, SHOP.front + 0.1, [0.07, 0.08, 0.1]),
  ]);
  const shopScreen = createQuad(
    gl,
    [
      [SHOP.left + 0.075, 0.76, SHOP.front + 0.002],
      [SHOP.right - 0.075, 0.76, SHOP.front + 0.002],
      [SHOP.right - 0.075, 1.3, SHOP.front + 0.002],
      [SHOP.left + 0.075, 1.3, SHOP.front + 0.002],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );
  const shopButton = createLitMesh(
    gl,
    cylinderPolygons(SHOP.button.x, SHOP.button.y, SHOP.button.z, SHOP.button.radius, 0.026, 18, [0.66, 0.13, 0.1]),
  );
  const shopShelf = createLitMesh(
    gl,
    boxPolygons(-0.16, 0.16, 0.6, 0.66, 0.24, 0.36, [0.07, 0.08, 0.1]),
  );

  /* Refresh pedestal next to the kiosk. */
  const refreshPedestal = createLitMesh(gl, [
    ...cylinderPolygons(0.56, 0, 0.18, 0.16, 0.03, 16, [0.08, 0.09, 0.11]),
    ...cylinderPolygons(0.56, 0.03, 0.18, 0.045, 0.66, 12, [0.16, 0.17, 0.2]),
    ...boxPolygons(0.44, 0.68, 0.69, 0.73, 0.06, 0.3, [0.09, 0.1, 0.13]),
  ]);
  const refreshButton = createLitMesh(
    gl,
    cylinderPolygons(0.56, 0.73, 0.18, 0.05, 0.022, 16, [0.5, 0.16, 0.12]),
  );
  const refreshSign = createQuad(
    gl,
    [
      [0.42, 0.78, 0.36],
      [0.7, 0.78, 0.36],
      [0.7, 0.94, 0.36],
      [0.42, 0.94, 0.36],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );

  const buttonCaps = {};
  for (const button of DECK_BUTTONS) {
    buttonCaps[button.id] = createLitMesh(
      gl,
      cylinderPolygons(
        button.x,
        DECK.top + 0.012,
        button.z,
        button.radius,
        button.height,
        18,
        button.color,
      ),
    );
  }

  /* Vertical plunger: base ring, shaft, coil spring and the red ball. */
  const leverRod = createLitMesh(
    gl,
    cylinderPolygons(LEVER.x, LEVER.baseY + 0.03, LEVER.z, LEVER.rodRadius, LEVER.restY - LEVER.baseY - 0.03, 12, DECK_COLORS.rod),
  );
  /* Clean plunger sleeve instead of the bead coil. */
  const leverSleeve = createLitMesh(
    gl,
    cylinderPolygons(LEVER.x, LEVER.baseY + 0.03, LEVER.z, 0.024, 0.1, 16, [0.13, 0.14, 0.17]),
  );
  const leverKnob = createLitMesh(
    gl,
    spherePolygons(LEVER.x, LEVER.restY, LEVER.z, LEVER.knobRadius, 8, 14, DECK_COLORS.knob),
  );
  /* Status panel leaning against the lower bezel, angled at the player. */
  const hud = createQuad(
    gl,
    [
      [-0.31, 0.732, 0.702],
      [0.31, 0.732, 0.702],
      [0.31, 0.802, 0.628],
      [-0.31, 0.802, 0.628],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );

  return {
    cabinet,
    marqueeBox,
    floor,
    room,
    ceilingLamp,
    ceilingLamp2,
    ceilingLamp3,
    carpet,
    wallGlow,
    wallGlow2,
    wallSign,
    wallSign2,
    neonBar,
    neonBar2,
    screen,
    marqueeFace,
    frame,
    baseStrip,
    shadow,
    floorGlow,
    marqueeGlow,
    deck,
    buttonCaps,
    leverRod,
    leverKnob,
    leverSleeve,
    hud,
    stool,
    marbleMesh,
    startLabel,
    shopBody,
    shopScreen,
    shopButton,
    shopShelf,
    refreshPedestal,
    refreshButton,
    refreshSign,
  };
}

/* ── Status panel ───────────────────────────────────────── */

function makeHudCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 146;
  return canvas;
}

function hudFont(size, weight = 700) {
  return `${weight} ${size}px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif`;
}

function drawHud(ctx, state) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  ctx.fillStyle = "#04060b";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(231, 181, 102, 0.38)";
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, width - 16, height - 16);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  let x = 34;
  const label = (text) => {
    ctx.font = hudFont(29);
    ctx.fillStyle = "rgba(244, 236, 220, 0.42)";
    ctx.fillText(text, x, 38);
    x += ctx.measureText(text).width + 10;
  };
  const value = (text, color) => {
    ctx.font = hudFont(40);
    ctx.fillStyle = color;
    ctx.fillText(text, x, 38);
    x += ctx.measureText(text).width + 32;
  };

  label("投注");
  value(String(state.bet), "#e7b566");
  label("余额");
  value(String(state.marbles), "#f4ecdc");
  label("彩票");
  value(String(state.tickets), "#f4ecdc");

  ctx.textAlign = "center";
  if (state.notice) {
    ctx.font = hudFont(40);
    ctx.fillStyle = "#ff9a7a";
    ctx.fillText(state.notice, width / 2, 98);
  } else if (state.result) {
    const payout = state.result.payout > 0 ? `  +${state.result.payout}` : "";
    ctx.font = hudFont(46);
    ctx.fillStyle = state.result.win ? "#ffd98a" : "rgba(244, 236, 220, 0.42)";
    ctx.fillText(`${state.result.text}${payout}`, width / 2, 98);
  } else {
    ctx.font = hudFont(40);
    ctx.fillStyle = state.canStart ? "rgba(244, 236, 220, 0.82)" : "rgba(244, 236, 220, 0.4)";
    ctx.fillText(state.status, width / 2, 98);
  }
}

function raySphere(origin, direction, center, radius) {
  const ox = origin[0] - center[0];
  const oy = origin[1] - center[1];
  const oz = origin[2] - center[2];
  const b = ox * direction[0] + oy * direction[1] + oz * direction[2];
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const t = -b - Math.sqrt(discriminant);
  return t >= 0 ? t : null;
}

/* ── Scene ──────────────────────────────────────────────── */

export function createScene(canvas, boardCanvas) {
  const attributes = {
    alpha: false,
    antialias: true,
    depth: true,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
    xrCompatible: true,
  };
  const gl = canvas.getContext("webgl2", attributes) || canvas.getContext("webgl", attributes);
  if (!gl) return null;

  const litProgram = createProgram(gl, LIT_VS, LIT_FS);
  const texProgram = createProgram(gl, TEX_VS, TEX_FS);
  const lineProgram = createProgram(gl, LINE_VS, LINE_FS);

  const line = {
    program: lineProgram,
    aPos: gl.getAttribLocation(lineProgram, "aPos"),
    uProj: gl.getUniformLocation(lineProgram, "uProj"),
    uView: gl.getUniformLocation(lineProgram, "uView"),
    uModel: gl.getUniformLocation(lineProgram, "uModel"),
    uColor: gl.getUniformLocation(lineProgram, "uColor"),
    uAlpha: gl.getUniformLocation(lineProgram, "uAlpha"),
  };
  const lineBuffer = gl.createBuffer();
  let rayLines = [];

  function setRays(rays) {
    rayLines = rays;
  }

  function drawRays(projection, view, model) {
    if (!rayLines.length) return;
    const data = [];
    for (const ray of rayLines) {
      const length = Math.min(ray.length || 1.4, 2);
      data.push(ray.origin[0], ray.origin[1], ray.origin[2]);
      data.push(
        ray.origin[0] + ray.direction[0] * length,
        ray.origin[1] + ray.direction[1] * length,
        ray.origin[2] + ray.direction[2] * length,
      );
    }
    gl.useProgram(line.program);
    gl.uniformMatrix4fv(line.uProj, false, projection);
    gl.uniformMatrix4fv(line.uView, false, view);
    gl.uniformMatrix4fv(line.uModel, false, model);
    gl.uniform3f(line.uColor, 0.42, 0.85, 1.0);
    gl.uniform1f(line.uAlpha, 0.55);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(line.aPos);
    gl.vertexAttribPointer(line.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.drawArrays(gl.LINES, 0, data.length / 3);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  const lit = {
    program: litProgram,
    aPos: gl.getAttribLocation(litProgram, "aPos"),
    aNormal: gl.getAttribLocation(litProgram, "aNormal"),
    aColor: gl.getAttribLocation(litProgram, "aColor"),
    uProj: gl.getUniformLocation(litProgram, "uProj"),
    uView: gl.getUniformLocation(litProgram, "uView"),
    uModel: gl.getUniformLocation(litProgram, "uModel"),
    uEye: gl.getUniformLocation(litProgram, "uEye"),
    uKeyDir: gl.getUniformLocation(litProgram, "uKeyDir"),
    uKeyColor: gl.getUniformLocation(litProgram, "uKeyColor"),
    uFillDir: gl.getUniformLocation(litProgram, "uFillDir"),
    uFillColor: gl.getUniformLocation(litProgram, "uFillColor"),
    uAmbient: gl.getUniformLocation(litProgram, "uAmbient"),
    uFog: gl.getUniformLocation(litProgram, "uFog"),
    uTint: gl.getUniformLocation(litProgram, "uTint"),
    uOffset: gl.getUniformLocation(litProgram, "uOffset"),
  };

  const tex = {
    program: texProgram,
    aPos: gl.getAttribLocation(texProgram, "aPos"),
    aUv: gl.getAttribLocation(texProgram, "aUv"),
    uProj: gl.getUniformLocation(texProgram, "uProj"),
    uView: gl.getUniformLocation(texProgram, "uView"),
    uModel: gl.getUniformLocation(texProgram, "uModel"),
    uTex: gl.getUniformLocation(texProgram, "uTex"),
    uTint: gl.getUniformLocation(texProgram, "uTint"),
    uOpacity: gl.getUniformLocation(texProgram, "uOpacity"),
  };

  const geometry = buildGeometry(gl);

  /* Control deck runtime: hit volumes, hover/press tint and the status panel. */
  let cabinetLabels = [];
  let attractTextures = [];

  function setCabinetLabels(labels) {
    cabinetLabels = Array.isArray(labels) ? labels : [];
    for (const texture of attractTextures) gl.deleteTexture(texture);
    attractTextures = cabinetLabels.map((label) =>
      createTexture(gl, makeAttractTexture(label.name, label.accent)),
    );
  }

  const hudCanvas = makeHudCanvas();
  const hudCtx = hudCanvas.getContext("2d");
  const hudTexture = createTexture(gl, hudCanvas);
  let hudKey = "";

  let hoverId = null;
  let hoverIndex = -1;
  let pressedId = null;
  let leverPull = 0;
  const enabled = { start: true, lever: true, feeder: true, stool: true };
  const controls = [
    ...DECK_BUTTONS.map((button) => ({
      id: button.id,
      center: [button.x, DECK.top + 0.02, button.z],
      radius: button.hit,
    })),
    { id: "lever", center: [LEVER.x, LEVER.restY, LEVER.z], radius: LEVER.hit },
    { id: "feeder", center: [FEEDER.x, FEEDER.y + 0.02, FEEDER.z], radius: FEEDER.hit },
    { id: "stool", center: [STOOL.x, STOOL.seatY, STOOL.z], radius: STOOL.hit },
  ];
  const leverControl = controls.find((control) => control.id === "lever");

  /* Marbles poured into the feeder tray; each one lands in the hole and
     bumps the stake by one. */
  const marbles = [];
  let marbleListener = null;
  const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));

  function pourAt(point) {
    if (!point || marbles.length >= 14) return;
    marbles.push({ fromX: point.x, fromZ: point.z, t: 0 });
  }

  function tick(dt) {
    if (!leverHeld && leverPull > 0.0005) {
      leverPull += (0 - leverPull) * Math.min(1, dt * 16);
      if (leverPull < 0.001) leverPull = 0;
      leverControl.center[1] = LEVER.restY - leverPull;
    }
    for (let i = marbles.length - 1; i >= 0; i -= 1) {
      const marble = marbles[i];
      marble.t += dt / 0.42;
      if (marble.t >= 1) {
        marbles.splice(i, 1);
        marbleListener?.();
      }
    }
  }

  /** Where a ray hits the tray surface, clamped to its inner area. */
  function trayPoint(origin, direction) {
    if (Math.abs(direction[1]) < 0.0001) return null;
    const t = (FEEDER.y - origin[1]) / direction[1];
    if (t <= 0) return null;
    const x = origin[0] + direction[0] * t;
    const z = origin[2] + direction[2] * t;
    return {
      x: clampValue(x, FEEDER.x - FEEDER.width / 2 + 0.025, FEEDER.x + FEEDER.width / 2 - 0.025),
      z: clampValue(z, FEEDER.z - FEEDER.depth / 2 + 0.025, FEEDER.z + FEEDER.depth / 2 - 0.025),
    };
  }

  function onMarbleIn(listener) {
    marbleListener = listener;
  }

  let leverHeld = false;

  function setLeverPull(pull) {
    leverHeld = true;
    leverPull = Math.max(0, Math.min(LEVER.travel, pull));
    leverControl.center[1] = LEVER.restY - leverPull;
  }

  function releaseLever() {
    leverHeld = false;
  }

  function setControlState(next) {
    if ("hover" in next) hoverId = next.hover;
    if ("hoverIndex" in next) hoverIndex = next.hoverIndex;
    if ("pressed" in next) pressedId = next.pressed;
    if (next.enabled) Object.assign(enabled, next.enabled);
  }

  function isEnabled(id) {
    return enabled[id] !== false;
  }

  /** Kiosk-local pick: exchange button and refresh button. */
  function hitTestKiosk(origin, direction) {
    const targets = [
      { id: "shop", center: [SHOP.button.x, SHOP.button.y + 0.02, SHOP.button.z], radius: 0.09 },
      { id: "refresh", center: [SHOP.refresh.x, SHOP.refresh.y, SHOP.refresh.z], radius: 0.085 },
    ];
    let best = null;
    let bestT = Infinity;
    for (const target of targets) {
      const t = raySphere(origin, direction, target.center, target.radius);
      if (t !== null && t < bestT) {
        bestT = t;
        best = target.id;
      }
    }
    return best ? { id: best, t: bestT } : null;
  }

  function kioskCenter(id) {
    if (id === "shop") return [SHOP.button.x, SHOP.button.y + 0.02, SHOP.button.z];
    if (id === "refresh") return [SHOP.refresh.x, SHOP.refresh.y, SHOP.refresh.z];
    return null;
  }

  function controlCenter(id) {
    const control = controls.find((entry) => entry.id === id);
    return control ? [...control.center] : null;
  }

  /**
   * Ray pick in cabinet-local space. Returns { id, t }; `cabinet` means the
   * shell itself was hit (used to walk up and sit at an attract machine).
   */
  function hitTestRay(origin, direction, withControls = true) {
    let best = null;
    let bestT = Infinity;
    if (withControls) {
      for (const control of controls) {
        const t = raySphere(origin, direction, control.center, control.radius);
        if (t !== null && t < bestT) {
          bestT = t;
          best = control.id;
        }
      }
    }
    if (!withControls) {
      const stoolT = raySphere(origin, direction, [STOOL.x, STOOL.seatY, STOOL.z], STOOL.hit);
      if (stoolT !== null) return { id: "stool", t: stoolT };
    }
    // The shell is only the fallback target: it wraps the whole machine, so
    // testing it first would swallow every button press.
    if (!best) {
      const shell = raySphere(origin, direction, [0, 0.85, 0.4], 0.92);
      if (shell !== null) {
        best = "cabinet";
        bestT = shell;
      }
    }
    return best ? { id: best, t: bestT } : null;
  }

  function hitTest(origin, direction) {
    const hit = hitTestRay(origin, direction);
    return hit ? hit.id : null;
  }

  function tintFor(id) {
    if (enabled[id] === false) return [0.38, 0.4, 0.46];
    if (id === pressedId) return [2.2, 2.2, 2.2];
    if (id === hoverId) return [1.55, 1.5, 1.45];
    return null;
  }

  function updateHud(state) {
    const key = [
      state.bet,
      state.marbles,
      state.tickets,
      state.status,
      state.canStart ? 1 : 0,
      state.result ? state.result.text : "",
      state.result ? state.result.payout : "",
      state.result && state.result.win ? 1 : 0,
    ].join("|");
    if (key === hudKey) return;
    hudKey = key;
    drawHud(hudCtx, state);
    gl.bindTexture(gl.TEXTURE_2D, hudTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hudCanvas);
  }

  const glowTexture = createTexture(gl, makeGlowTexture());
  const stripTexture = createTexture(gl, makeStripTexture());
  const marqueeTexture = createTexture(gl, makeMarqueeTexture());
  const refreshTexture = createTexture(gl, makeRefreshTexture());
  const startLabelTexture = createTexture(gl, makeStartLabelTexture());
  const carpetTexture = createTexture(gl, makeCarpetTexture());
  const wallSignTexture = createTexture(gl, makeWallSignTexture());
  const shopCanvas = makeShopTexture();
  const shopCtx = shopCanvas.getContext("2d");
  const shopTexture = createTexture(gl, shopCanvas);
  let shopKey = "";

  function updateShop(info) {
    const key = `${info.marbles}|${info.coins}|${info.tickets}|${info.message || ""}`;
    if (key === shopKey) return;
    shopKey = key;
    drawShopScreen(shopCtx, info);
    gl.bindTexture(gl.TEXTURE_2D, shopTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shopCanvas);
  }
  const boardTexture = createTexture(gl, makeBoardPlaceholder());

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(FOG[0], FOG[1], FOG[2], 1);

  const keyDir = normalize3([0.55, 1.0, 0.75]);
  const fillDir = normalize3([-0.75, 0.25, -0.55]);

  let viewportWidth = canvas.width;
  let viewportHeight = canvas.height;

  function beginLit(projection, view, model, eye) {
    gl.useProgram(lit.program);
    gl.uniformMatrix4fv(lit.uProj, false, projection);
    gl.uniformMatrix4fv(lit.uView, false, view);
    gl.uniformMatrix4fv(lit.uModel, false, model);
    gl.uniform3fv(lit.uEye, eye);
    gl.uniform3fv(lit.uKeyDir, keyDir);
    gl.uniform3f(lit.uKeyColor, 1.25, 1.12, 0.94);
    gl.uniform3fv(lit.uFillDir, fillDir);
    gl.uniform3f(lit.uFillColor, 0.5, 0.62, 0.95);
    gl.uniform3f(lit.uAmbient, 0.92, 0.96, 1.04);
    gl.uniform3fv(lit.uFog, FOG);
    gl.uniform3f(lit.uTint, 1, 1, 1);
    gl.uniform3f(lit.uOffset, 0, 0, 0);
  }

  function drawLit(mesh, tint = null, offset = null) {
    if (tint) gl.uniform3fv(lit.uTint, tint);
    if (offset) gl.uniform3f(lit.uOffset, offset[0], offset[1], offset[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
    gl.enableVertexAttribArray(lit.aPos);
    gl.enableVertexAttribArray(lit.aNormal);
    gl.enableVertexAttribArray(lit.aColor);
    gl.vertexAttribPointer(lit.aPos, 3, gl.FLOAT, false, 36, 0);
    gl.vertexAttribPointer(lit.aNormal, 3, gl.FLOAT, false, 36, 12);
    gl.vertexAttribPointer(lit.aColor, 3, gl.FLOAT, false, 36, 24);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    if (tint || offset) {
      gl.uniform3f(lit.uTint, 1, 1, 1);
      gl.uniform3f(lit.uOffset, 0, 0, 0);
    }
  }

  /**
   * mode: "opaque" | "alpha" | "additive". Blended passes skip depth writes
   * so the neon bars and floor decals cannot punch holes into each other.
   */
  function drawTextured(projection, view, quad, texture, model, tint, opacity, mode = "opaque") {
    gl.useProgram(tex.program);
    gl.uniformMatrix4fv(tex.uProj, false, projection);
    gl.uniformMatrix4fv(tex.uView, false, view);
    gl.uniformMatrix4fv(tex.uModel, false, model);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(tex.uTex, 0);
    gl.uniform3fv(tex.uTint, tint);
    gl.uniform1f(tex.uOpacity, opacity);

    if (mode === "additive") {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
    } else if (mode === "alpha") {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    } else {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, quad.buffer);
    gl.enableVertexAttribArray(tex.aPos);
    gl.enableVertexAttribArray(tex.aUv);
    gl.vertexAttribPointer(tex.aPos, 3, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(tex.aUv, 2, gl.FLOAT, false, 20, 12);
    gl.drawArrays(gl.TRIANGLES, 0, quad.count);

    if (mode !== "opaque") {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
  }

  /**
   * `viewport` is { x, y, width, height } for a WebXR eye, or null to paint
   * the whole canvas (desktop preview).
   */
  /**
   * Draw the room. `cabinets` is an array of { model, live }; the first one is
   * the machine the player is sitting at (controls, HUD, live board), the rest
   * are attract-mode machines standing in the room.
   */
  function draw(projection, view, cabinets, eye, viewport = null) {
    if (viewport) {
      gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(viewport.x, viewport.y, viewport.width, viewport.height);
    } else {
      // Coming back from WebXR the layer framebuffer may still be bound.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, viewportWidth, viewportHeight);
      gl.disable(gl.SCISSOR_TEST);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);

    const list = cabinets && cabinets.length ? cabinets : [{ model: null, live: true }];
    const activeModel = list[0].model;

    /* Floor, room shell and its decals sit under the active machine. */
    beginLit(projection, view, activeModel, eye);
    drawLit(geometry.floor);
    drawLit(geometry.room);
    drawTextured(projection, view, geometry.carpet, carpetTexture, activeModel, [1, 1, 1], 1);
    drawTextured(projection, view, geometry.wallSign, wallSignTexture, activeModel, [1, 1, 1], 1);
    drawTextured(projection, view, geometry.wallSign2, wallSignTexture, activeModel, [1, 1, 1], 1);
    drawTextured(projection, view, geometry.wallGlow, glowTexture, activeModel, [0.35, 0.75, 1.0], 0.16, "additive");
    drawTextured(projection, view, geometry.wallGlow2, glowTexture, activeModel, [1.0, 0.45, 0.8], 0.14, "additive");
    drawTextured(projection, view, geometry.ceilingLamp, stripTexture, activeModel, [1.0, 0.96, 0.88], 0.85, "additive");
    drawTextured(projection, view, geometry.ceilingLamp2, stripTexture, activeModel, [1.0, 0.96, 0.88], 0.85, "additive");
    drawTextured(projection, view, geometry.ceilingLamp3, stripTexture, activeModel, [1.0, 0.96, 0.88], 0.85, "additive");
    drawTextured(projection, view, geometry.neonBar, stripTexture, activeModel, [0.4, 0.85, 1.0], 0.7, "additive");
    drawTextured(projection, view, geometry.neonBar2, stripTexture, activeModel, [1.0, 0.45, 0.85], 0.55, "additive");
    drawTextured(projection, view, geometry.shadow, glowTexture, activeModel, [0, 0, 0], 0.72, "alpha");
    drawTextured(projection, view, geometry.floorGlow, glowTexture, activeModel, [1.0, 0.72, 0.36], 0.3, "additive");

    const dim = [0.5, 0.5, 0.56];

    for (let index = 0; index < list.length; index += 1) {
      const cabinet = list[index];
      if (cabinet.kind === "shop") {
        const model = cabinet.model || activeModel;
        beginLit(projection, view, model, eye);
        drawLit(geometry.shopBody);
        drawLit(geometry.shopShelf);
        drawLit(geometry.shopButton);
        drawLit(geometry.refreshPedestal);
        drawLit(geometry.refreshButton);
        drawTextured(projection, view, geometry.shopScreen, shopTexture, model, [1, 1, 1], 1);
        drawTextured(projection, view, geometry.refreshSign, refreshTexture, model, [1, 1, 1], 1);
        continue;
      }
      const model = cabinet.model || activeModel;
      const live = Boolean(cabinet.live);

      beginLit(projection, view, model, eye);
      drawLit(geometry.cabinet);
      drawLit(geometry.marqueeBox);
      drawLit(geometry.deck);

      for (const button of DECK_BUTTONS) {
        drawLit(geometry.buttonCaps[button.id], live ? tintFor(button.id) : dim);
      }
      const pull = live ? leverPull : 0;
      drawLit(geometry.leverSleeve);
      drawLit(geometry.leverRod, live ? tintFor("lever") : dim, [0, -pull, 0]);
      drawLit(geometry.leverKnob, live ? tintFor("lever") : dim, [0, -pull, 0]);
      const stoolHover = hoverId === "stool" && hoverIndex === (cabinet.index ?? index);
      drawLit(geometry.stool, stoolHover ? [1.9, 1.75, 1.5] : null);

      if (live) {
        for (const marble of marbles) {
          const eased = marble.t * marble.t;
          const x = marble.fromX + (FEEDER.hole.x - marble.fromX) * eased;
          const z = marble.fromZ + (FEEDER.hole.z - marble.fromZ) * eased;
          const y = FEEDER.y + 0.014 - Math.min(0.02, marble.t * 0.02);
          drawLit(geometry.marbleMesh, null, [x, y, z]);
        }
      }

      /* Screen: the live board on the active machine, attract art elsewhere. */
      const attractIndex = cabinet.index ?? index;
      const screenTexture = live
        ? boardTexture
        : attractTextures[attractIndex] || attractTextures[0] || boardTexture;
      drawTextured(projection, view, geometry.screen, screenTexture, model, [1, 1, 1], 1);
      drawTextured(projection, view, geometry.marqueeFace, marqueeTexture, model, [1, 1, 1], 1);
      if (live) {
        drawTextured(projection, view, geometry.startLabel, startLabelTexture, model, [1, 1, 1], 1, "alpha");
        drawTextured(projection, view, geometry.hud, hudTexture, model, [1, 1, 1], 1);
      }

      for (const bar of geometry.frame) {
        drawTextured(projection, view, bar, stripTexture, model, [1.0, 0.78, 0.46], 0.95, "additive");
      }
      drawTextured(projection, view, geometry.marqueeGlow, glowTexture, model, [1.0, 0.72, 0.4], 0.24, "additive");
      drawTextured(projection, view, geometry.baseStrip, stripTexture, model, [1.0, 0.74, 0.42], 0.85, "additive");
    }

    drawRays(projection, view, activeModel);
  }

  function uploadBoard() {
    if (!boardCanvas || !boardCanvas.width || !boardCanvas.height) return;
    gl.bindTexture(gl.TEXTURE_2D, boardTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, boardCanvas);
  }

  function resize(width, height) {
    if (width === viewportWidth && height === viewportHeight) return;
    viewportWidth = width;
    viewportHeight = height;
  }

  return {
    gl,
    draw,
    uploadBoard,
    resize,
    hitTest,
    hitTestRay,
    hitTestKiosk,
    kioskCenter,
    isEnabled,
    controlCenter,
    setControlState,
    setLeverPull,
    releaseLever,
    updateHud,
    setRays,
    setCabinetLabels,
    updateShop,
    pourAt,
    trayPoint,
    onMarbleIn,
    tick,
    lever: LEVER,
    feeder: FEEDER,
    stool: STOOL,
  };
}

function normalize3(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return new Float32Array([v[0] / length, v[1] / length, v[2] / length]);
}

function makeBoardPlaceholder() {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0a0c12";
  ctx.fillRect(0, 0, 8, 8);
  return canvas;
}

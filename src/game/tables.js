/* ============================================================
   Pinball table catalog
   A table owns its cabinet art direction, playfield boundary,
   peg layout and obstacle recipes. Physics constants (gravity,
   ball size, launch lane, slot bank and payouts) stay shared so
   every table remains part of the same arcade economy.
   ============================================================ */

import { PEGS } from "./config.js";

export const DEFAULT_TABLE_ID = "classic";

/* ── Shared arch profiles ────────────────────────────────── */

/** Angular cyberpunk ceiling, left shoulder → dome → right shoulder. */
const CYBER_ARCH = [
  { x: 82, y: 278 },
  { x: 94, y: 220 },
  { x: 126, y: 164 },
  { x: 188, y: 116 },
  { x: 270, y: 86 },
  { x: 360, y: 76 },
  { x: 450, y: 86 },
  { x: 532, y: 116 },
  { x: 594, y: 164 },
  { x: 626, y: 220 },
  { x: 638, y: 278 },
];

/** A lower, wider trapezoid ceiling for the laboratory table. */
const LAB_ARCH = [
  { x: 82, y: 278 },
  { x: 98, y: 210 },
  { x: 150, y: 150 },
  { x: 238, y: 108 },
  { x: 360, y: 94 },
  { x: 482, y: 108 },
  { x: 570, y: 150 },
  { x: 622, y: 210 },
  { x: 638, y: 278 },
];

/* ── Peg layouts ─────────────────────────────────────────── */

function buildClassicPegs() {
  const list = [];
  for (let row = 0; row < PEGS.rows; row += 1) {
    const isOdd = row % 2 === 1;
    const count = isOdd ? PEGS.oddCount : PEGS.evenCount;
    const startX = PEGS.firstX + (isOdd ? PEGS.halfOffsetX : 0);
    const y = PEGS.startY + row * PEGS.gapY;
    for (let col = 0; col < count; col += 1) {
      list.push({
        x: startX + col * PEGS.gapX,
        y,
        r: PEGS.r,
        kind: "metal",
        id: `c-${row}-${col}`,
      });
    }
  }
  return list;
}

/** Three staggered rows of large, flickering neon splitter pins. */
const NEON_SPLITTERS = [
  { x: 228, y: 376, r: 14, hue: "cyan", phase: 0.2 },
  { x: 360, y: 372, r: 15, hue: "magenta", phase: 1.7 },
  { x: 492, y: 376, r: 14, hue: "cyan", phase: 3.1 },
  { x: 148, y: 438, r: 10, hue: "yellow", phase: 2.4 },
  { x: 292, y: 434, r: 11, hue: "cyan", phase: 0.9 },
  { x: 428, y: 434, r: 11, hue: "magenta", phase: 4.2 },
  { x: 572, y: 438, r: 10, hue: "yellow", phase: 5.5 },
  { x: 220, y: 500, r: 12, hue: "magenta", phase: 1.2 },
  { x: 360, y: 504, r: 13, hue: "cyan", phase: 2.8 },
  { x: 500, y: 500, r: 12, hue: "magenta", phase: 4.7 },
  // Edge splitters catch a marble that tries to hug the left rail.
  { x: 116, y: 424, r: 11, hue: "yellow", phase: 1.1 },
  { x: 116, y: 506, r: 10, hue: "cyan", phase: 3.6 },
].map((peg, index) => ({ ...peg, kind: "splitter", id: `n-${index}` }));

/** A second rank of neon splitters just above the skyline. The layer-2 cars
    tend to sweep marbles toward the left rail, so these pins break that sweep
    before the marble reaches the rooftop layer. */
const NEON_MID_PINS = [118, 232, 350, 468, 566].map((x, index) => ({
  x,
  y: 706,
  r: 9,
  kind: "splitter",
  hue: ["cyan", "yellow", "magenta", "cyan", "yellow"][index],
  phase: 0.8 + index * 1.7,
  id: `nm-${index}`,
}));

/** Small street-level neon dots just above the slot bank. */
const NEON_STREET_PEGS = [170, 270, 370, 470, 556].map((x, index) => ({
  x,
  y: 890,
  r: 5.2,
  kind: "metal",
  hue: index % 2 ? "magenta" : "yellow",
  phase: index * 1.4,
  id: `ns-${index}`,
}));

const LAB_PEGS = [
  [372, 9, 10, 7.2, "metal"],
  [428, 8, 9, 7.2, "metal"],
  [484, 9, 10, 7.2, "metal"],
  [540, 8, 9, 7.2, "metal"],
].flatMap(([y, count, first, gap, kind], row) =>
  Array.from({ length: count }, (_, col) => ({
    x: first * 10 + col * 55 + (row % 2 ? 27 : 0),
    y,
    r: 6.4,
    kind,
    hue: row % 2 ? "violet" : "mint",
    phase: row * 1.3 + col * 0.45,
    id: `l-${row}-${col}`,
  })),
);

/* ── Obstacle recipes ────────────────────────────────────── */

const NEON_CARS = [
  {
    type: "mover",
    style: "car",
    w: 78,
    h: 22,
    radius: 8,
    path: [
      { x: 44, y: 566 },
      { x: 622, y: 566 },
    ],
    speed: 122,
    offset: 0.06,
    mainFieldOnly: true,
    accent: "#22e6ff",
    accent2: "#ffe04a",
  },
  {
    type: "mover",
    style: "car",
    w: 70,
    h: 20,
    radius: 7,
    path: [
      { x: 44, y: 566 },
      { x: 622, y: 566 },
    ],
    speed: 122,
    offset: 0.56,
    mainFieldOnly: true,
    accent: "#ffe04a",
    accent2: "#ff2fb3",
  },
  {
    type: "mover",
    style: "car",
    w: 80,
    h: 22,
    radius: 8,
    path: [
      { x: 622, y: 646 },
      { x: 44, y: 646 },
    ],
    speed: 132,
    offset: 0.2,
    mainFieldOnly: true,
    accent: "#ff2fb3",
    accent2: "#22e6ff",
  },
  {
    type: "mover",
    style: "car",
    w: 68,
    h: 20,
    radius: 7,
    path: [
      { x: 622, y: 646 },
      { x: 44, y: 646 },
    ],
    speed: 132,
    offset: 0.7,
    mainFieldOnly: true,
    accent: "#7a3cff",
    accent2: "#22e6ff",
  },
];

const NEON_BUILDINGS = [
  { x: 118, y: 836, w: 72, h: 72, seed: 1, accent: "#22e6ff", sign: "SYN", roofBounce: 320 },
  { x: 228, y: 816, w: 66, h: 112, seed: 2, accent: "#ff2fb3", sign: "NEON", roofBounce: 340 },
  { x: 329, y: 829, w: 70, h: 86, seed: 3, accent: "#ffe04a", sign: "24H", roofBounce: 320 },
  { x: 431, y: 810, w: 68, h: 124, seed: 4, accent: "#22e6ff", sign: "DATA", roofBounce: 360 },
  { x: 541, y: 842, w: 86, h: 60, seed: 5, accent: "#ff2fb3", sign: "BAR", roofBounce: 330 },
].map((block) => ({
  ...block,
  type: "block",
  style: "tower",
  radius: 7,
  restitution: 0.36,
}));

const LAB_OBSTACLES = [
  {
    type: "rotor",
    x: 238,
    y: 612,
    length: 132,
    thickness: 7,
    arms: 2,
    mode: "active",
    speed: 1.85,
    initialAngle: 0.2,
    accent: "#5cffb0",
    restitution: 0.72,
  },
  {
    type: "rotor",
    x: 482,
    y: 612,
    length: 132,
    thickness: 7,
    arms: 2,
    mode: "active",
    speed: -2.15,
    initialAngle: 1.1,
    accent: "#b96bff",
    restitution: 0.72,
  },
  {
    type: "rotor",
    x: 360,
    y: 724,
    length: 96,
    thickness: 6,
    arms: 3,
    mode: "passive",
    speed: 0,
    damping: 0.85,
    inertia: 1900,
    initialAngle: 0.45,
    accent: "#ffb347",
    restitution: 0.6,
  },
  {
    type: "bumper",
    x: 178,
    y: 790,
    r: 27,
    boost: 470,
    restitution: 0.94,
    accent: "#5cffb0",
    label: "α",
  },
  {
    type: "bumper",
    x: 542,
    y: 790,
    r: 27,
    boost: 470,
    restitution: 0.94,
    accent: "#b96bff",
    label: "β",
  },
  {
    type: "portal",
    a: { x: 132, y: 704 },
    b: { x: 552, y: 704 },
    r: 29,
    accentA: "#5cffb0",
    accentB: "#b96bff",
    labelA: "A",
    labelB: "B",
  },
];

/* ── Catalog ─────────────────────────────────────────────── */

const DEFINITIONS = [
  {
    id: "classic",
    name: "橡木经典",
    en: "OAK CLASSIC",
    tagline: "温润纸面与黄铜钉阵，街机厅最熟悉的一台机器。",
    description: "对称 10/9 交错钉阵，落点完全由重力与碰撞决定。",
    price: 0,
    currency: "coins",
    art: "classic",
    features: ["对称钉阵", "黄铜回球坡道", "纯物理落点"],
    palette: {
      primary: "#e7b566",
      secondary: "#dd3b2c",
      tertiary: "#8db99a",
      background: "#f4ecdc",
      deep: "#17130f",
    },
    layout: {
      arch: { kind: "ellipse" },
      pegs: buildClassicPegs(),
      obstacles: [],
    },
  },
  {
    id: "neon",
    name: "霓虹都市",
    en: "NEON CITY",
    tagline: "雨夜高架、飞行汽车与跳动的霓虹分流钉。",
    description:
      "顶层是闪烁的霓虹分流钉，中层两列飞行汽车循环穿梭，底层是参差的摩天楼群。",
    price: 80,
    currency: "coins",
    art: "cyberpunk",
    features: ["霓虹分流钉", "飞行汽车 ×4", "摩天楼群"],
    palette: {
      primary: "#22e6ff",
      secondary: "#ff2fb3",
      tertiary: "#ffe04a",
      background: "#070d1c",
      deep: "#04060f",
    },
    layout: {
      arch: { kind: "polyline", points: CYBER_ARCH },
      pegs: [...NEON_SPLITTERS, ...NEON_MID_PINS, ...NEON_STREET_PEGS],
      obstacles: [...NEON_CARS, ...NEON_BUILDINGS],
      launchJitter: 48,
    },
  },
  {
    id: "warp",
    name: "虫洞实验室",
    en: "WARP LAB",
    tagline: "主动与被动转子、弹射桩和一对相连的传送门。",
    description:
      "两台常转的霓虹转子切开落点，中央是被动转子。弹射桩提供额外回弹，传送门把左右两侧连成闭环。",
    price: 120,
    currency: "coins",
    art: "cyberpunk",
    variant: "lab",
    features: ["主动 / 被动转子", "弹射桩", "传送门"],
    palette: {
      primary: "#5cffb0",
      secondary: "#b96bff",
      tertiary: "#ffb347",
      background: "#0a0718",
      deep: "#05030e",
    },
    layout: {
      arch: { kind: "polyline", points: LAB_ARCH },
      pegs: LAB_PEGS,
      obstacles: LAB_OBSTACLES,
      launchJitter: 30,
    },
  },
];

export const TABLES = Object.fromEntries(DEFINITIONS.map((table) => [table.id, table]));
export const TABLE_LIST = DEFINITIONS;

export function isTableId(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(TABLES, id);
}

export function getTable(id) {
  return isTableId(id) ? TABLES[id] : TABLES[DEFAULT_TABLE_ID];
}

/** Colours exposed as CSS custom properties for shop cards and game chrome. */
export function tableCssVars(table) {
  return [
    `--table-accent:${table.palette.primary}`,
    `--table-accent-rgb:${hexToRgb(table.palette.primary)}`,
    `--table-second:${table.palette.secondary}`,
    `--table-second-rgb:${hexToRgb(table.palette.secondary)}`,
    `--table-third:${table.palette.tertiary}`,
    `--table-third-rgb:${hexToRgb(table.palette.tertiary)}`,
  ].join(";");
}

export function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (clean.length !== 6) return "231,181,102";
  const value = Number.parseInt(clean, 16);
  if (!Number.isFinite(value)) return "231,181,102";
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
}

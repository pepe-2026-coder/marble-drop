/* Static board geometry, physics constants and deterministic decoration. */

export const W = 720;
export const H = 1240;
export const TAU = Math.PI * 2;

export const INNER = {
  left: 82,
  right: 638,
  bottom: 1180,
  cx: 360,
  cy: 330,
  rx: 278,
  ry: 285,
};

export const MAIN_RIGHT = 584;
export const PEGS = {
  r: 6.2,
  startY: 362,
  gapY: 50,
  gapX: 51,
  rows: 10,
  evenCount: 10,
  oddCount: 9,
  firstX: 103.5,
  halfOffsetX: 25.5,
};

export const SLOT = {
  x0: 84,
  x1: MAIN_RIGHT,
  count: 12,
  top: 900,
  floor: 1000,
  sensorY: 948,
};
SLOT.width = (SLOT.x1 - SLOT.x0) / SLOT.count;

export const LANE = {
  left: MAIN_RIGHT,
  right: INNER.right,
  dividerTop: 278,
  dividerBottom: 1038,
};
export const STAGE = { x: 610, y: 1080 };
export const GATE = { x0: 582, x1: 640, y: 1092 };
export const CUP = { x: 610, y: 1122 };
export const SPRING = { x: 610, baseHandleY: 1188, radius: 22 };
export const RAMP = { x0: 96, y0: 1048, x1: 594, y1: 1074 };

export const BALL_R = 10;
export const GRAVITY = 1450;
export const PHYS_STEP = 1 / 240;

export const MULTIPLIERS = [
  { value: 2, weight: 35, slots: 4 },
  { value: 4, weight: 26, slots: 3 },
  { value: 6, weight: 20, slots: 2 },
  { value: 8, weight: 12, slots: 1 },
  { value: 10, weight: 7, slots: 1 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const decoRandom = mulberry32(0x4d415242);
export const speckles = Array.from({ length: 260 }, () => ({
  x: 88 + decoRandom() * 544,
  y: 44 + decoRandom() * 1120,
  r: 0.35 + decoRandom() * 0.8,
  a: 0.018 + decoRandom() * 0.045,
}));

/* ============================================================
   弹珠台 · MARBLE DROP
   纯 Canvas + 自研 2D 物理的小型竖屏弹珠台
   ============================================================ */

import { account } from "../account.js";
import { audio, vibrate } from "../audio.js";
import { toast } from "../ui/toast.js";
import {
  W,
  H,
  TAU,
  INNER,
  MAIN_RIGHT,
  SLOT,
  LANE,
  STAGE,
  GATE,
  CUP,
  SPRING,
  RAMP,
  BALL_R,
  GRAVITY,
  PHYS_STEP,
  MULTIPLIERS,
  speckles,
} from "./config.js";
import {
  clamp,
  lerp,
  randomRange,
  easeOutCubic,
  easeInCubic,
  easeInOutCubic,
} from "./utils.js";
import { PayoutAnimation } from "./payout.js";
import { getSkin } from "./skins.js";
import { DEFAULT_TABLE_ID, TABLE_LIST, getTable, hexToRgb } from "./tables.js";
import {
  buildObstacles,
  resetObstacles,
  randomizeObstacles,
  updateObstacles,
  collideObstacles,
  drawObstacles,
} from "./obstacles.js";
import {
  drawCyberCabinet,
  drawCyberMarquee,
  drawCyberPegs,
  drawCyberSlots,
  drawCyberLaunchLane,
  drawCyberReturnRamp,
  drawCyberSpring,
  drawCyberFocusGlow,
} from "./cyberpunk.js";

/* ── DOM ─────────────────────────────────────────────────── */

const gameScreen = document.getElementById("gameScreen");
const canvas = document.getElementById("board");
let ctx = canvas.getContext("2d", { alpha: true });
const mainCtx = ctx;
let canvasScale = 1;
let staticLayer = null;
const machine = document.getElementById("machine");
const stageEl = document.getElementById("stage");

const marbleCountEl = document.getElementById("marbleCount");
const ticketCountEl = document.getElementById("ticketCount");
const dockBalanceEl = document.getElementById("dockBalance");
const homeBtn = document.getElementById("homeBtn");
const helpBtn = document.getElementById("helpBtn");
const helpDialog = document.getElementById("helpDialog");
const helpClose = document.getElementById("helpClose");
const helpDone = document.getElementById("helpDone");
const resetBtn = document.getElementById("resetBtn");

const roundBadge = document.getElementById("roundBadge");
const roundText = document.getElementById("roundText");
const levelBadge = document.getElementById("levelBadge");
const levelNumber = document.getElementById("levelNumber");
const levelXpFill = document.getElementById("levelXpFill");
const levelSpBadge = document.getElementById("levelSpBadge");
const multiplierBanner = document.getElementById("multiplierBanner");
const bannerMult = document.getElementById("bannerMult");
const bannerSlots = document.getElementById("bannerSlots");
const hintBubble = document.getElementById("hintBubble");
const hintText = document.getElementById("hintText");
const wheelCallout = document.getElementById("wheelCallout");
const wheelCalloutKicker = document.getElementById("wheelCalloutKicker");
const wheelCalloutTitle = document.getElementById("wheelCalloutTitle");
const wheelCalloutTicket = document.getElementById("wheelCalloutTicket");
const resultCard = document.getElementById("resultCard");
const resultEyebrow = document.getElementById("resultEyebrow");
const resultTitle = document.getElementById("resultTitle");
const resultPayout = document.getElementById("resultPayout");
const resultTicket = document.getElementById("resultTicket");
const resultProgress = document.getElementById("resultProgress");
const resultFoot = document.getElementById("resultFoot");
const toastEl = document.getElementById("toast");

const dockIdle = document.getElementById("dockIdle");
const dockPlay = document.getElementById("dockPlay");
const betInput = document.getElementById("betInput");
const betMinus = document.getElementById("betMinus");
const betPlus = document.getElementById("betPlus");
const startBtn = document.getElementById("startBtn");
const startLabel = document.getElementById("startLabel");
const startBetText = document.getElementById("startBetText");
const quickRow = document.getElementById("quickRow");
const refillBtn = document.getElementById("refillBtn");
const playStatus = document.getElementById("playStatus");
const liveDot = document.getElementById("liveDot");
const playBet = document.getElementById("playBet");
const playMult = document.getElementById("playMult");
const playSlots = document.getElementById("playSlots");
const playLane = document.getElementById("playLane");
const pullMeter = document.getElementById("pullMeter");
const pullZone = document.getElementById("pullZone");
const pullPercent = document.getElementById("pullPercent");
const pullFill = document.getElementById("pullFill");
const toolTray = document.getElementById("toolTray");
const magnetToolBtn = document.getElementById("magnetToolBtn");
const magnetToolCount = document.getElementById("magnetToolCount");
const padToolBtn = document.getElementById("padToolBtn");
const padToolCount = document.getElementById("padToolCount");
const toolSkipBtn = document.getElementById("toolSkipBtn");

const workshopDialog = document.getElementById("workshopDialog");
const workshopClose = document.getElementById("workshopClose");
const wsLevel = document.getElementById("wsLevel");
const wsXpText = document.getElementById("wsXpText");
const wsXpFill = document.getElementById("wsXpFill");
const wsSkillPoints = document.getElementById("wsSkillPoints");
const wsTickets = document.getElementById("wsTickets");
const wsTabs = document.getElementById("wsTabs");
const wsSkillsPanel = document.getElementById("wsSkillsPanel");
const wsShopPanel = document.getElementById("wsShopPanel");

/* ── Audio ───────────────────────────────────────────────── */



/* ── Progression data ────────────────────────────────────── */

const XP_STEP = 40;
function xpNeededForLevel(level) {
  return 80 + (Math.max(1, level) - 1) * XP_STEP;
}

const SKILL_BRANCHES = [
  {
    id: "magnet",
    name: "磁力工程",
    icon: "◎",
    description: "让钉子形成引力场，把母球拉向你想要的方向。",
  },
  {
    id: "pad",
    name: "弹力工程",
    icon: "◉",
    description: "在机台上布置弹簧板，改变母球的落点。",
  },
];

const SKILLS = {
  magnetRadius: {
    branch: "magnet",
    name: "磁场半径",
    max: 3,
    cost: 1,
    reqLevels: [1, 2, 4],
    effect: (level) => `磁力范围 ${76 + level * 24}px`,
    describe: "扩大磁力钉的引力半径。",
  },
  magnetStrength: {
    branch: "magnet",
    name: "磁场强度",
    max: 2,
    cost: 1,
    reqLevels: [1, 3],
    effect: (level) => `引力强度 ${(0.8 + level * 0.25).toFixed(2)}×`,
    describe: "让磁力钉的牵引更有力。",
  },
  magnetCount: {
    branch: "magnet",
    name: "磁场扩容",
    max: 1,
    cost: 2,
    reqLevels: [4],
    effect: (level) => `每局磁力钉 +${level}`,
    describe: "每局多布置一枚磁力钉。",
  },
  magnetDuration: {
    branch: "magnet",
    name: "磁场续航",
    max: 2,
    cost: 1,
    reqLevels: [1, 3],
    effect: (level) => `磁场持续 ${(2.4 + level * 0.9).toFixed(1)}s`,
    describe: "延长磁力钉每次布阵的引力持续时间。",
  },
  padRadius: {
    branch: "pad",
    name: "弹板半径",
    max: 3,
    cost: 1,
    reqLevels: [1, 2, 4],
    effect: (level) => `弹力板半径 ${28 + level * 4}px`,
    describe: "扩大弹力板的接触面积。",
  },
  padBounce: {
    branch: "pad",
    name: "反弹强度",
    max: 2,
    cost: 1,
    reqLevels: [1, 3],
    effect: (level) => `弹性 ${(0.95 + level * 0.05).toFixed(2)}×`,
    describe: "提升弹力板的反弹系数。",
  },
  padCount: {
    branch: "pad",
    name: "弹板数量",
    max: 1,
    cost: 2,
    reqLevels: [4],
    effect: (level) => `每局弹力板 +${level}`,
    describe: "每局多布置一块弹力板。",
  },
};

const SHOP_ITEMS = [
  {
    id: "magnetCharge",
    kind: "consumable",
    key: "magnet",
    name: "磁力钉 ×1",
    desc: "本局额外增加一次磁力钉布阵，用掉才消耗。",
    price: 3,
    swatch: "is-magnet",
    symbol: "◎",
  },
  {
    id: "padCharge",
    kind: "consumable",
    key: "pad",
    name: "弹力板 ×1",
    desc: "本局额外增加一次弹力板布阵，用掉才消耗。",
    price: 3,
    swatch: "is-pad",
    symbol: "◉",
  },
];

function defaultProgress() {
  return {
    level: 1,
    xp: 0,
    skillPoints: 1,
    skills: Object.fromEntries(Object.keys(SKILLS).map((id) => [id, 0])),
    inventory: { magnet: 0, pad: 0 },
  };
}

function skillLevel(id) {
  return game.progress.skills[id] || 0;
}

function getMagnetConfig() {
  return {
    radius: 76 + skillLevel("magnetRadius") * 24,
    strength: 0.8 + skillLevel("magnetStrength") * 0.25,
    duration: 2.4 + skillLevel("magnetDuration") * 0.9,
    charges: 1 + skillLevel("magnetCount"),
  };
}

function getPadConfig() {
  return {
    radius: 28 + skillLevel("padRadius") * 4,
    restitution: 0.95 + skillLevel("padBounce") * 0.05,
    charges: 1 + skillLevel("padCount"),
  };
}

/* ── Game state ──────────────────────────────────────────── */

const game = {
  phase: "idle", // idle | starting | ready | charging | flying | returning
  marbles: account.marbles,
  tickets: account.tickets,
  bet: account.bet,
  progress: defaultProgress(),
  round: 0,
  multiplier: 2,
  slotCount: 4,
  litSlots: new Set(),
  litReveal: new Map(),
  result: null,
  gate: 0,
  gateTarget: 0,
  drop: null,
  charge: 0,
  charging: false,
  chargeMode: null,
  pointerId: null,
  pointerStartY: 0,
  pointerMaxPx: 120,
  pointerMoved: false,
  keyboardChargeStart: 0,
  hapticStep: -1,
  springRelease: null,
  flashSlot: null,
  flashAt: 0,
  returnAnim: null,
  returnPos: null,
  shake: 0,
  lastSlot: null,
  leftLane: false,
  flightStartedAt: 0,
  landingResolved: false,
  placingTool: null,
  toolAvailable: { magnet: 0, pad: 0 },
  toolBaseCharges: { magnet: 0, pad: 0 },
  toolPlaced: { magnet: 0, pad: 0 },
  toolScore: 0,
  lastProgress: null,
  bannerTimer: null,
  hintTimer: null,
  toastTimer: null,
  wheel: {
    active: false,
    spinning: false,
    sectorIndex: -1,
    outcome: null,
    calloutTimer: null,
  },
  wheelTickets: 0,
  wheelSpins: 0,
  mainPayout: 0,
  mainTickets: 0,
  mainSlot: null,
  mainWon: false,
  mainDestroyed: false,
  mainResolved: false,
  bonusPayout: 0,
  bonusTickets: 0,
  bonusBallsScored: 0,
  landingFlowStarted: false,
  forceBonusLandingAt: 0,
};

const ball = {
  x: STAGE.x,
  y: STAGE.y,
  prevX: STAGE.x,
  prevY: STAGE.y,
  vx: 0,
  vy: 0,
  r: BALL_R,
  trail: [],
  trailClock: 0,
  spin: 0,
  stallTime: 0,
  hidden: false,
};

/* Temporary extra marbles produced by the abyss wheel. They score on their
   own slot landing and then disappear without ending the main round. */
const bonusBalls = [];

/* Payout tray animation. It owns its own tiny physics world and draws
   straight onto the board canvas above the regular scene. */
const payoutFx = new PayoutAnimation({
  getCtx: () => mainCtx,
  getScale: () => canvasScale,
});

/* ── Active table ────────────────────────────────────────── */

let activeTable = getTable(account.equippedTable || DEFAULT_TABLE_ID);
let pendingTableId = null;

/* ── World geometry ──────────────────────────────────────── */

const segments = [];
const pegs = [];
const slotCaps = [];
const particles = [];
const activeMagnets = [];
const activePads = [];
let obstacles = [];

function addSegment(x1, y1, x2, y2, restitution = 0.46, kind = "wall") {
  const dx = x2 - x1;
  const dy = y2 - y1;
  segments.push({
    x1,
    y1,
    x2,
    y2,
    restitution,
    kind,
    nx: -dy,
    ny: dx,
    len: Math.hypot(dx, dy),
  });
}

function buildWorld() {
  segments.length = 0;
  pegs.length = 0;
  slotCaps.length = 0;

  const arch = activeTable.layout.arch || { kind: "ellipse" };
  let leftShoulderY = INNER.cy;
  let rightShoulderY = INNER.cy;

  if (arch.kind === "polyline" && Array.isArray(arch.points) && arch.points.length > 1) {
    // Angular tech ceilings collide as a chain of straight plates. Extra points
    // keep the corners from feeling like a single hard ramp.
    const points = arch.points;
    for (let i = 1; i < points.length; i += 1) {
      addSegment(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, 0.62, "dome");
    }
    leftShoulderY = points[0].y;
    rightShoulderY = points[points.length - 1].y;
  } else {
    // Classic dome: sampled ellipse from the right shoulder over the top to
    // the left shoulder.
    const domeSegments = 110;
    let prev = null;
    for (let i = 0; i <= domeSegments; i += 1) {
      const t = Math.PI - (i / domeSegments) * Math.PI;
      const x = INNER.cx + INNER.rx * Math.cos(t);
      const y = INNER.cy - INNER.ry * Math.sin(t);
      if (prev) addSegment(prev.x, prev.y, x, y, 0.62, "dome");
      prev = { x, y };
    }
  }

  // Outer sides and launch lane.
  addSegment(INNER.left, leftShoulderY, INNER.left, SLOT.floor, 0.4, "wall");
  addSegment(INNER.right, rightShoulderY, INNER.right, 1168, 0.42, "wall");
  addSegment(LANE.left, LANE.dividerTop, LANE.left, LANE.dividerBottom, 0.46, "divider");
  addSegment(SLOT.x0, SLOT.floor, SLOT.x1, SLOT.floor, 0.32, "floor");

  // Slot dividers with rounded caps.
  for (let i = 1; i < SLOT.count; i += 1) {
    const x = SLOT.x0 + i * SLOT.width;
    addSegment(x, SLOT.top, x, SLOT.floor, 0.38, "slot-divider");
    slotCaps.push({ x, y: SLOT.top, r: 2.4 });
  }

  // Each table supplies its own peg recipes. The classic table keeps the
  // symmetric 10/9 lattice; themed tables can use splitter pins or sparse rows.
  (activeTable.layout.pegs || []).forEach((peg, index) => {
    pegs.push({
      ...peg,
      glow: 0,
      lastHit: 0,
      id: peg.id || `peg-${index}`,
    });
  });

  obstacles = buildObstacles(activeTable.layout.obstacles || []);

  document.body.dataset.table = activeTable.id;
  document.body.style.setProperty("--table-accent", activeTable.palette.primary);
  document.body.style.setProperty("--table-accent-rgb", hexToRgb(activeTable.palette.primary));
  document.body.style.setProperty("--table-second", activeTable.palette.secondary);
  document.body.style.setProperty("--table-second-rgb", hexToRgb(activeTable.palette.secondary));
  document.body.style.setProperty("--table-third", activeTable.palette.tertiary);
  document.body.style.setProperty("--table-third-rgb", hexToRgb(activeTable.palette.tertiary));
}

buildWorld();

/* ── Table switching ─────────────────────────────────────── */

/**
 * Rebuild the live world when the equipped table changes. A table switch is
 * only safe between rounds; if it arrives mid-round we defer it until the
 * return ramp has finished.
 */
function applyTable(id, announce = false) {
  const next = getTable(id);
  if (next.id === activeTable.id) return false;
  if (game.phase !== "idle") {
    pendingTableId = next.id;
    return false;
  }
  activeTable = next;
  pendingTableId = null;
  buildWorld();
  resetObstacles(obstacles);

  particles.length = 0;
  activeMagnets.length = 0;
  activePads.length = 0;
  payoutFx.stop();
  clearScheduled();
  ball.x = STAGE.x;
  ball.y = STAGE.y;
  ball.prevX = STAGE.x;
  ball.prevY = STAGE.y;
  ball.vx = 0;
  ball.vy = 0;
  ball.trail.length = 0;
  ball.spin = 0;
  ball.stallTime = 0;

  game.result = null;
  game.litSlots.clear();
  game.litReveal.clear();
  game.flashSlot = null;
  game.lastSlot = null;
  game.landingResolved = false;
  game.gate = 0;
  game.gateTarget = 0;
  game.drop = null;
  game.returnAnim = null;
  game.returnPos = null;
  game.placingTool = null;
  game.toolAvailable = { magnet: 0, pad: 0 };
  game.toolPlaced = { magnet: 0, pad: 0 };
  resetAbyssRound();

  rebuildStaticLayer();
  setPhase("idle");
  setPowerUI(0, "ready");
  setRoundBadge("ready", "等待投珠");
  setPlayStatus("等待投珠", "选择投入后开始", false);
  hideBanner();
  hideHint();
  hideResultCard();
  updateBetUI();
  requestAnimationFrame(fitMachine);
  if (announce) toast(`已换装 ${activeTable.name} 机台`);
  return true;
}

/* ── Physics ─────────────────────────────────────────────── */

function collideSegment(b, seg) {
  const abx = seg.x2 - seg.x1;
  const aby = seg.y2 - seg.y1;
  const len2 = abx * abx + aby * aby || 1;
  let t = ((b.x - seg.x1) * abx + (b.y - seg.y1) * aby) / len2;
  t = clamp(t, 0, 1);
  const cx = seg.x1 + abx * t;
  const cy = seg.y1 + aby * t;
  let dx = b.x - cx;
  let dy = b.y - cy;
  let dist = Math.hypot(dx, dy);

  if (dist >= b.r) return false;

  if (dist < 0.0001) {
    // Rare exact-centre case. Use the side the ball came from.
    const side = (b.prevX - seg.x1) * -aby - (b.prevY - seg.y1) * abx;
    const sign = side >= 0 ? 1 : -1;
    dx = -aby * sign;
    dy = abx * sign;
    dist = Math.hypot(dx, dy) || 1;
  }

  const nx = dx / dist;
  const ny = dy / dist;
  const penetration = b.r - dist;
  b.x += nx * penetration;
  b.y += ny * penetration;

  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const restitution = seg.restitution;
    b.vx -= (1 + restitution) * vn * nx;
    b.vy -= (1 + restitution) * vn * ny;

    // A touch of tangential friction keeps the ball from skimming forever.
    const tx = -ny;
    const ty = nx;
    const vt = b.vx * tx + b.vy * ty;
    b.vx -= vt * 0.015 * tx;
    b.vy -= vt * 0.015 * ty;

    if (!b.silent && Math.abs(vn) > 180) {
      audio.wall(Math.min(2, Math.abs(vn) / 800));
      if (Math.abs(vn) > 330) game.shake = Math.min(1.4, game.shake + 0.12);
      if (Math.abs(vn) > 420) {
        spawnWallSparks(cx, cy, Math.min(1.4, Math.abs(vn) / 900));
      }
    }
  }
  return true;
}

function collidePeg(b, peg) {
  const dx = b.x - peg.x;
  const dy = b.y - peg.y;
  const minDist = b.r + peg.r;
  const dist2 = dx * dx + dy * dy;
  if (dist2 >= minDist * minDist) return false;

  const dist = Math.sqrt(dist2) || 0.0001;
  const nx = dx / dist;
  const ny = dy / dist;
  const penetration = minDist - dist;
  b.x += nx * penetration;
  b.y += ny * penetration;

  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const restitution = 0.58;
    b.vx -= (1 + restitution) * vn * nx;
    b.vy -= (1 + restitution) * vn * ny;

    // Imperfect pins: a tiny tangential scatter makes each run feel alive.
    const tx = -ny;
    const ty = nx;
    const scatterScale = peg.kind === "splitter" ? 1.75 : 1;
    const scatter = randomRange(-45, 45) * scatterScale;
    b.vx += tx * scatter;
    b.vy += ty * scatter;

    const tangent = b.vx * tx + b.vy * ty;
    b.vx -= tangent * 0.028 * tx;
    b.vy -= tangent * 0.028 * ty;

    if (!b.silent) {
      const energy = Math.min(2, Math.abs(vn) / 500);
      peg.glow = Math.max(peg.glow, 0.55 + energy * 0.28);
      const now = performance.now();
      if (now - peg.lastHit > 28) {
        peg.lastHit = now;
        audio.peg(energy);
        spawnPegSparks(peg.x, peg.y, energy);
        game.shake = Math.min(1.2, game.shake + 0.035 * energy);
      }
    }
  }
  return true;
}

function collidePad(b, pad) {
  const dx = b.x - pad.x;
  const dy = b.y - pad.y;
  const minDist = b.r + pad.radius;
  const dist2 = dx * dx + dy * dy;
  if (dist2 >= minDist * minDist) return false;

  const dist = Math.sqrt(dist2) || 0.0001;
  const nx = dx / dist;
  const ny = dy / dist;
  b.x += nx * (minDist - dist);
  b.y += ny * (minDist - dist);

  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + pad.restitution) * vn * nx;
    b.vy -= (1 + pad.restitution) * vn * ny;
    const tx = -ny;
    const ty = nx;
    const vt = b.vx * tx + b.vy * ty;
    b.vx -= vt * 0.025 * tx;
    b.vy -= vt * 0.025 * ty;

    if (!b.silent && game.phase === "flying") {
      pad.hits += 1;
      pad.glow = 1;
      if (pad.hits <= 5) game.toolScore += 3;
      const energy = Math.min(1.5, Math.abs(vn) / 700);
      spawnToolBurst(pad.x, pad.y, "#e7b566");
      if (Math.random() < 0.7) audio.peg(energy);
      game.shake = Math.min(1.2, game.shake + 0.08);
    }
  }
  return true;
}

function applyMagnetForces(b, dt) {
  if (!activeMagnets.length || game.landingResolved) return;
  for (const magnet of activeMagnets) {
    if (magnet.energy <= 0) continue;
    const dx = magnet.x - b.x;
    const dy = magnet.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= magnet.radius || dist < b.r + 5) continue;
    const falloff = 1 - dist / magnet.radius;
    const acceleration = 920 * magnet.strength * falloff;
    b.vx += (dx / dist) * acceleration * dt;
    b.vy += (dy / dist) * acceleration * dt;
    magnet.energy = Math.max(0, magnet.energy - dt);
    magnet.pulse = 1;
    if (!magnet.activated && !b.silent) {
      magnet.activated = true;
      game.toolScore += 4;
      spawnToolBurst(magnet.x, magnet.y, "#8ed0be");
      audio.tone(700, 0.09, "sine", 0.032, 940);
    }
  }
}

function stepBallPhysics(b, dt) {
  b.prevX = b.x;
  b.prevY = b.y;

  b.vy += GRAVITY * dt;
  b.vx *= 0.99965;
  b.vy *= 0.99965;
  applyMagnetForces(b, dt);
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  // Keep runaways bounded.
  const speed = Math.hypot(b.vx, b.vy);
  if (speed > 2600) {
    const k = 2600 / speed;
    b.vx *= k;
    b.vy *= k;
  }

  const obstacleEvents = [];
  for (let iter = 0; iter < 2; iter += 1) {
    let touched = false;
    for (let i = 0; i < slotCaps.length; i += 1) {
      const cap = slotCaps[i];
      if (collidePeg(b, cap)) touched = true;
    }
    for (let i = 0; i < segments.length; i += 1) {
      if (collideSegment(b, segments[i])) touched = true;
    }
    for (let i = 0; i < pegs.length; i += 1) {
      if (collidePeg(b, pegs[i])) touched = true;
    }
    for (let i = 0; i < activePads.length; i += 1) {
      if (collidePad(b, activePads[i])) touched = true;
    }
    if (obstacles.length) {
      const events = collideObstacles(b, obstacles, { ignoreWheel: Boolean(b.ignoreWheel) });
      if (events.length) {
        touched = true;
        obstacleEvents.push(...events);
      }
    }
    if (!touched) break;
  }

  if (!b.silent && obstacleEvents.length) handleObstacleEvents(obstacleEvents);
  b.spin += (b.vx / b.r) * dt;
}

function launchSpeed(power) {
  // Linear force curve: every 1% of pull adds the same launch speed. The top
  // of the range (2280) is tuned to carry the marble to the dome's high point.
  return 1800 + clamp(power, 0, 1) * 480;
}

function getSlotIndex(x) {
  return clamp(Math.floor((x - SLOT.x0) / SLOT.width), 0, SLOT.count - 1);
}

/* ── Particles ───────────────────────────────────────────── */

const equippedSkin = () => getSkin(account.equippedSkin);
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

let lastWallSparkAt = 0;

function spawnPegSparks(x, y, energy = 1) {
  const spec = equippedSkin().particles.peg;
  const count = 1 + Math.floor(energy * 2);
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x,
      y,
      vx: randomRange(-75, 75),
      vy: randomRange(-95, -15),
      life: 0.24 + Math.random() * 0.2,
      maxLife: 0.44,
      size: randomRange(1.1, 2.4),
      color: pickOne(spec.colors),
      gravity: 380,
      shape: pickOne(spec.shapes),
      rot: randomRange(0, TAU),
      vr: randomRange(-7, 7),
    });
  }
}

/** Strong wall / divider hits throw a short spray in the skin palette. */
function spawnWallSparks(x, y, energy = 1) {
  const now = performance.now();
  if (now - lastWallSparkAt < 70) return;
  lastWallSparkAt = now;
  const spec = equippedSkin().particles.wall;
  const count = 2 + Math.floor(energy * 3);
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x,
      y,
      vx: randomRange(-95, 95),
      vy: randomRange(-120, -20),
      life: 0.16 + Math.random() * 0.22,
      maxLife: 0.38,
      size: randomRange(0.9, 2.1),
      color: pickOne(spec.colors),
      gravity: 430,
      shape: pickOne(spec.shapes),
      rot: randomRange(0, TAU),
      vr: randomRange(-6, 6),
    });
  }
}

function spawnLaunchParticles() {
  const spec = equippedSkin().particles.launch;
  for (let i = 0; i < 12; i += 1) {
    particles.push({
      x: CUP.x + randomRange(-10, 10),
      y: CUP.y + randomRange(2, 12),
      vx: randomRange(-65, 65),
      vy: randomRange(-180, -20),
      life: 0.35 + Math.random() * 0.32,
      maxLife: 0.67,
      size: randomRange(1, 2.8),
      color: pickOne(spec.colors),
      gravity: 260,
      shape: pickOne(spec.shapes),
      rot: randomRange(0, TAU),
      vr: randomRange(-5, 5),
    });
  }
}

function spawnSlotBurst(x, y, win) {
  const spec = win ? equippedSkin().particles.win : equippedSkin().particles.lose;
  const count = win ? 30 : 12;
  for (let i = 0; i < count; i += 1) {
    const angle = randomRange(Math.PI * 1.1, Math.PI * 1.9);
    const speed = randomRange(80, win ? 360 : 160);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - randomRange(50, 180),
      life: randomRange(0.45, 1.05),
      maxLife: 1.05,
      size: randomRange(1.4, 3.6),
      color: pickOne(spec.colors),
      gravity: 560,
      shape: pickOne(spec.shapes),
      rot: randomRange(0, TAU),
      vr: randomRange(-8, 8),
    });
  }
}

function spawnTicketBurst() {
  for (let i = 0; i < 22; i += 1) {
    particles.push({
      x: randomRange(170, 550),
      y: randomRange(380, 520),
      vx: randomRange(-50, 50),
      vy: randomRange(-60, 50),
      life: randomRange(0.9, 1.6),
      maxLife: 1.6,
      size: randomRange(2, 4),
      color: ["#e7b566", "#f8dd9e", "#fff4d8"][Math.floor(Math.random() * 3)],
      gravity: 45,
      shape: "confetti",
      rot: randomRange(0, TAU),
      vr: randomRange(-5, 5),
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.995;
    if (p.vr) p.rot += p.vr * dt;
  }
  if (particles.length > 220) particles.splice(0, particles.length - 220);
}

/* ── Multiplier & slot selection ─────────────────────────── */

function pickMultiplier() {
  const total = MULTIPLIERS.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of MULTIPLIERS) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return MULTIPLIERS[0];
}

function pickLitSlots(count) {
  const indices = Array.from({ length: SLOT.count }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count).sort((a, b) => a - b);
}

/* ── UI helpers ──────────────────────────────────────────── */

function saveGame() {
  account.save();
}

function setMarbles(value, bump = false) {
  const next = Math.max(0, Math.round(Number(value) || 0));
  account.setMarbles(next);
  game.marbles = account.marbles;
  marbleCountEl.textContent = String(game.marbles);
  dockBalanceEl.textContent = String(game.marbles);
  if (bump) bumpNumber(marbleCountEl);
  updateBetUI();
}

function setTickets(value, bump = false) {
  const next = Math.max(0, Math.round(Number(value) || 0));
  account.setTickets(next);
  game.tickets = account.tickets;
  ticketCountEl.textContent = String(game.tickets);
  if (bump) bumpNumber(ticketCountEl);
}

function bumpNumber(el) {
  el.classList.remove("is-bumping");
  void el.offsetWidth;
  el.classList.add("is-bumping");
  window.setTimeout(() => el.classList.remove("is-bumping"), 420);
}

function updateBetUI() {
  const maxBet = Math.max(5, Math.min(99, game.marbles));
  if (game.phase === "idle" && game.marbles >= 5) {
    game.bet = clamp(game.bet, 5, maxBet);
  }
  betInput.value = String(game.bet);
  betInput.max = String(Math.min(99, Math.max(5, game.marbles)));
  startBetText.textContent = String(game.bet);
  playBet.textContent = String(game.bet);

  const canStart = game.phase === "idle" && game.marbles >= game.bet && game.marbles >= 5;
  startBtn.disabled = !canStart;
  if (game.phase !== "idle") startLabel.textContent = "游戏进行中";
  else if (game.marbles < 5) startLabel.textContent = "弹珠不足";
  else startLabel.textContent = "开始游戏";
  betMinus.disabled = game.phase !== "idle" || game.marbles < 5 || game.bet <= 5;
  betPlus.disabled =
    game.phase !== "idle" || game.marbles < 5 || game.bet >= Math.min(99, game.marbles);

  quickRow.querySelectorAll("[data-bet]").forEach((button) => {
    const value = Number(button.dataset.bet);
    button.classList.toggle("is-active", value === game.bet);
    button.disabled = value > game.marbles;
  });

  const lowFunds = game.marbles < 5 && game.phase === "idle";
  const useRelief = lowFunds && account.canClaimRelief;
  const goShop = lowFunds && !useRelief && (account.coins > 0 || account.tickets > 0);
  refillBtn.hidden = !(useRelief || goShop);
  refillBtn.textContent = useRelief ? "补助 30 珠" : "去商店";
  quickRow.classList.toggle("needs-refill", lowFunds);
  dockBalanceEl.textContent = String(game.marbles);
}

function syncAccountUI(state) {
  game.marbles = state.marbles;
  game.tickets = state.tickets;
  if (game.phase === "idle") {
    const maxBet = Math.max(5, Math.min(99, game.marbles));
    game.bet = clamp(game.bet, 5, maxBet);
  }
  marbleCountEl.textContent = String(game.marbles);
  ticketCountEl.textContent = String(game.tickets);
  dockBalanceEl.textContent = String(game.marbles);

  if (state.tables && state.tables.equipped !== activeTable.id) {
    if (game.phase === "idle") applyTable(state.tables.equipped);
    else pendingTableId = state.tables.equipped;
  }
  updateBetUI();
}

account.subscribe(syncAccountUI);

function setPhase(phase) {
  game.phase = phase;
  const playing = phase !== "idle";
  dockIdle.hidden = playing;
  dockPlay.hidden = !playing;
  canvas.classList.toggle("is-ready", phase === "ready");
  canvas.classList.toggle("is-charging", phase === "charging");
  updateBetUI();
  updateToolTrayUI();
}

function setRoundBadge(kind, text) {
  roundBadge.classList.toggle("is-live", kind === "live");
  roundBadge.classList.toggle("is-ready", kind === "ready");
  roundText.textContent = text;
}

function setPlayStatus(main, lane, live = true) {
  playStatus.textContent = main;
  playLane.textContent = lane;
  liveDot.classList.toggle("is-live", live);
}

function updateLevelBadge() {
  const progress = game.progress;
  const need = xpNeededForLevel(progress.level);
  levelNumber.textContent = String(progress.level);
  levelXpFill.style.width = `${clamp((progress.xp / need) * 100, 0, 100)}%`;
  if (progress.skillPoints > 0) {
    levelSpBadge.hidden = false;
    levelSpBadge.textContent = `技能点 ${progress.skillPoints}`;
  } else {
    levelSpBadge.hidden = true;
  }
  levelBadge.setAttribute(
    "aria-label",
    `等级 ${progress.level}，积分 ${progress.xp}/${need}。打开改装工坊`,
  );
  if (workshopDialog.open) updateWorkshopSummary();
}

function updateWorkshopSummary() {
  const progress = game.progress;
  const need = xpNeededForLevel(progress.level);
  wsLevel.textContent = String(progress.level);
  wsXpText.textContent = `${progress.xp} / ${need}`;
  wsXpFill.style.width = `${clamp((progress.xp / need) * 100, 0, 100)}%`;
  wsSkillPoints.textContent = String(progress.skillPoints);
  wsTickets.textContent = String(game.tickets);
}

function skillNodeHTML(id, definition) {
  const level = skillLevel(id);
  const max = definition.max;
  const next = level + 1;
  const requiredLevel = level < max ? definition.reqLevels[level] ?? 1 : null;
  const canLevel = requiredLevel !== null && game.progress.level >= requiredLevel;
  const canBuy = level < max && canLevel && game.progress.skillPoints >= definition.cost;
  const pips = Array.from(
    { length: max },
    (_, index) => `<i class="${index < level ? "is-on" : ""}"></i>`,
  ).join("");
  let label = `升级 · ${definition.cost} 技能点`;
  let disabled = !canBuy;
  if (level >= max) {
    label = "已满级";
    disabled = true;
  } else if (!canLevel) {
    label = `需 Lv.${requiredLevel}`;
    disabled = true;
  } else if (game.progress.skillPoints < definition.cost) {
    label = `需要 ${definition.cost} 技能点`;
    disabled = true;
  }
  const nextText =
    level < max ? `<br>下一级：<b>${definition.effect(next)}</b>` : "";
  return `
    <div class="skill-node ${level >= max ? "is-maxed" : ""}">
      <div class="skill-node-head">
        <span class="skill-name">${definition.name}</span>
        <span class="skill-pips" aria-label="${level}/${max} 级">${pips}</span>
      </div>
      <p class="skill-effect">${definition.describe}<br>当前：<b>${definition.effect(level)}</b>${nextText}</p>
      <div class="skill-action">
        <span class="skill-req">${level < max ? (canLevel ? `升级消耗 ${definition.cost} 技能点` : `需要人物 Lv.${requiredLevel}`) : "已满级"}</span>
        <button class="skill-buy" type="button" data-skill="${id}" ${disabled ? "disabled" : ""}>${label}</button>
      </div>
    </div>
  `;
}

function renderSkillsPanel() {
  wsSkillsPanel.innerHTML = SKILL_BRANCHES.map((branch) => {
    const nodes = Object.entries(SKILLS)
      .filter(([, definition]) => definition.branch === branch.id)
      .map(([id, definition]) => skillNodeHTML(id, definition))
      .join("");
    return `
      <section class="skill-branch" data-branch="${branch.id}">
        <div class="skill-branch-head">
          <span class="skill-branch-name">${branch.name}</span>
          <span class="skill-branch-icon" aria-hidden="true">${branch.icon}</span>
        </div>
        <p class="skill-effect" style="margin:0 0 8px">${branch.description}</p>
        ${nodes}
      </section>
    `;
  }).join("");
}

function renderShopPanel() {
  wsShopPanel.innerHTML = SHOP_ITEMS.map((item) => {
    const ownedCount = game.progress.inventory[item.key] || 0;
    const canAfford = game.tickets >= item.price;
    return `
      <article class="shop-item">
        <div class="shop-item-main">
          <span class="shop-swatch ${item.swatch}" aria-hidden="true">${item.symbol}</span>
          <span class="shop-item-copy">
            <span class="shop-name">${item.name}</span>
            <span class="shop-desc">${item.desc}</span>
          </span>
        </div>
        <div class="shop-item-foot">
          <span class="shop-owned">持有 ${ownedCount}</span>
          <button class="shop-buy" type="button" data-shop="${item.id}" ${canAfford ? "" : "disabled"}>${item.price} 彩票</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderWorkshop(preserveScroll = false) {
  const scrollTop = preserveScroll ? workshopDialog.scrollTop : 0;
  updateWorkshopSummary();
  renderSkillsPanel();
  renderShopPanel();
  if (preserveScroll) workshopDialog.scrollTop = scrollTop;
}

function upgradeSkill(id) {
  const definition = SKILLS[id];
  if (!definition || game.phase !== "idle") return;
  const level = skillLevel(id);
  if (level >= definition.max) return;
  const requiredLevel = definition.reqLevels[level] ?? 1;
  if (game.progress.level < requiredLevel) {
    toast(`需要人物等级 Lv.${requiredLevel}`);
    return;
  }
  if (game.progress.skillPoints < definition.cost) {
    toast("技能点不足，升级后可以获得技能点");
    return;
  }
  game.progress.skillPoints -= definition.cost;
  game.progress.skills[id] = level + 1;
  saveGame();
  updateLevelBadge();
  renderWorkshop(true);
  updateToolTrayUI();
  audio.ticket();
  toast(`${definition.name} 已升级到 Lv.${level + 1}`);
}

function buyShopItem(id) {
  const item = SHOP_ITEMS.find((entry) => entry.id === id);
  if (!item || game.phase !== "idle") return;
  if (game.tickets < item.price) {
    toast("彩票不足");
    return;
  }
  setTickets(game.tickets - item.price);
  game.progress.inventory[item.key] += 1;
  saveGame();
  renderWorkshop(true);
  updateToolTrayUI();
  audio.ticket();
  toast(`已购买 ${item.name}，下一局布阵时可用`);
}

function openWorkshop(tab = "skills") {
  audio.init();
  if (game.phase !== "idle") {
    toast("本局结束后才能改装");
    return;
  }
  renderWorkshop();
  if (typeof workshopDialog.showModal === "function") {
    workshopDialog.showModal();
  } else {
    workshopDialog.setAttribute("open", "");
  }
  setWorkshopTab(tab);
  workshopDialog.scrollTop = 0;
  audio.click();
}

function closeWorkshop() {
  if (typeof workshopDialog.close === "function") workshopDialog.close();
  else workshopDialog.removeAttribute("open");
}

function setWorkshopTab(tab) {
  wsTabs.querySelectorAll("[data-ws-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.wsTab === tab);
  });
  wsSkillsPanel.hidden = tab !== "skills";
  wsShopPanel.hidden = tab !== "shop";
}

function awardRoundProgress(payout) {
  const base = 10 + Math.round(game.bet / 10);
  const win = payout > 0 ? 5 + Math.round(payout / 20) : 0;
  const tool = Math.max(0, Math.round(game.toolScore));
  const total = base + win + tool;
  const progress = game.progress;
  const levelBefore = progress.level;
  progress.xp += total;
  let levelsGained = 0;
  while (progress.level < 999 && progress.xp >= xpNeededForLevel(progress.level)) {
    progress.xp -= xpNeededForLevel(progress.level);
    progress.level += 1;
    progress.skillPoints += 1;
    levelsGained += 1;
  }
  const need = xpNeededForLevel(progress.level);
  const result = {
    base,
    win,
    tool,
    total,
    levelsGained,
    levelBefore,
    levelAfter: progress.level,
    xp: progress.xp,
    need,
  };
  updateLevelBadge();
  saveGame();
  if (levelsGained > 0) {
    bumpNumber(levelNumber);
    levelBadge.classList.remove("is-leveling");
    void levelBadge.offsetWidth;
    levelBadge.classList.add("is-leveling");
    window.setTimeout(() => levelBadge.classList.remove("is-leveling"), 900);
    audio.win(false);
    window.setTimeout(() => audio.ticket(), 180);
    toast(`升级到 Lv.${progress.level}，获得 ${levelsGained} 技能点`);
  }
  return result;
}

function prepareToolRound() {
  const magnet = getMagnetConfig();
  const pad = getPadConfig();
  game.toolBaseCharges = { magnet: magnet.charges, pad: pad.charges };
  game.toolAvailable = {
    magnet: magnet.charges + (game.progress.inventory.magnet || 0),
    pad: pad.charges + (game.progress.inventory.pad || 0),
  };
  game.toolPlaced = { magnet: 0, pad: 0 };
  game.toolScore = 0;
  game.placingTool = null;
  activeMagnets.length = 0;
  activePads.length = 0;
}

function updateToolTrayUI() {
  const ready = game.phase === "ready";
  const total = game.toolAvailable.magnet + game.toolAvailable.pad;
  const showTray = ready && total > 0;
  toolTray.hidden = !showTray;
  pullMeter.hidden = ready && showTray;
  magnetToolCount.textContent = String(game.toolAvailable.magnet);
  padToolCount.textContent = String(game.toolAvailable.pad);
  magnetToolBtn.disabled = !ready || game.toolAvailable.magnet <= 0;
  padToolBtn.disabled = !ready || game.toolAvailable.pad <= 0;
  magnetToolBtn.classList.toggle("is-armed", game.placingTool === "magnet");
  padToolBtn.classList.toggle("is-armed", game.placingTool === "pad");
  magnetToolBtn.setAttribute("aria-pressed", String(game.placingTool === "magnet"));
  padToolBtn.setAttribute("aria-pressed", String(game.placingTool === "pad"));
  toolTray.classList.toggle("is-placing", Boolean(game.placingTool));
  canvas.classList.toggle("is-placing", Boolean(game.placingTool));
  if (!ready) game.placingTool = null;
}

function armTool(type) {
  if (game.phase !== "ready" || game.toolAvailable[type] <= 0) return;
  if (game.placingTool === type) {
    game.placingTool = null;
    updateToolTrayUI();
    setPlayStatus("拉下弹簧，松手发射", "满力可冲上圆顶", true);
    showHint("拉到底，满力冲上圆顶最高点", 3200);
    return;
  }
  game.placingTool = type;
  hideBanner();
  hideHint();
  updateToolTrayUI();
  if (type === "magnet") {
    setPlayStatus("点击机台上的钉子，放置磁力钉", `剩余 ${game.toolAvailable.magnet} 枚`, true);
  } else {
    setPlayStatus("点击机台上的空位，放置弹力板", `剩余 ${game.toolAvailable.pad} 块`, true);
  }
  audio.click();
}

function clearToolPlacement(withHint = true) {
  game.placingTool = null;
  updateToolTrayUI();
  setPlayStatus("拉下弹簧，松手发射", "满力可冲上圆顶", true);
  if (withHint) showHint("拉到底，满力冲上圆顶最高点", 3200);
}

function consumeToolPlacement(type) {
  const usesInventory = game.toolPlaced[type] >= game.toolBaseCharges[type];
  game.toolPlaced[type] += 1;
  game.toolAvailable[type] = Math.max(0, game.toolAvailable[type] - 1);
  if (usesInventory && game.progress.inventory[type] > 0) {
    game.progress.inventory[type] -= 1;
    saveGame();
  }
}

function spawnToolBurst(x, y, color) {
  for (let i = 0; i < 9; i += 1) {
    particles.push({
      x,
      y,
      vx: randomRange(-90, 90),
      vy: randomRange(-110, 25),
      life: randomRange(0.2, 0.5),
      maxLife: 0.5,
      size: randomRange(1.2, 2.6),
      color,
      gravity: 260,
      shape: "spark",
    });
  }
}

/** Neon spark burst shared by bumpers, rotors and portal gates. */
function spawnNeonBurst(x, y, color, count = 10, energy = 1) {
  const palette = [color, "#ffffff", activeTable.palette.secondary, activeTable.palette.tertiary];
  for (let i = 0; i < count; i += 1) {
    const angle = randomRange(0, TAU);
    const speed = randomRange(60, 250) * energy;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - randomRange(20, 90),
      life: randomRange(0.22, 0.6),
      maxLife: 0.6,
      size: randomRange(1.2, 3),
      color: pickOne(palette),
      gravity: 340,
      shape: Math.random() < 0.45 ? "star" : "spark",
      rot: randomRange(0, TAU),
      vr: randomRange(-8, 8),
    });
  }
}

/** Portal entry/exit: a ring of sparks at both gates. */
function spawnPortalBurst(x, y, color) {
  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * TAU;
    const speed = randomRange(80, 190);
    particles.push({
      x: x + Math.cos(angle) * 12,
      y: y + Math.sin(angle) * 12,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: randomRange(0.3, 0.7),
      maxLife: 0.7,
      size: randomRange(1.2, 2.8),
      color: i % 3 === 0 ? "#ffffff" : color,
      gravity: 60,
      shape: "star",
      rot: randomRange(0, TAU),
      vr: randomRange(-10, 10),
    });
  }
}

/** Translate obstacle collision events into sound, sparks and shake. */
function handleObstacleEvents(events) {
  for (const event of events) {
    if (event.kind === "car") {
      const energy = Math.min(2, event.impact / 520);
      audio.wall(energy);
      if (Math.random() < 0.8) audio.peg(energy);
      spawnNeonBurst(event.x, event.y, event.accent || activeTable.palette.primary, 7, energy);
      game.shake = Math.min(1.4, game.shake + 0.08 + energy * 0.1);
      continue;
    }
    if (event.kind === "rotor") {
      const energy = Math.min(2, event.impact / 560);
      audio.peg(energy);
      if (event.passive && energy > 0.35) audio.tone(220, 0.09, "triangle", 0.025, 360);
      spawnNeonBurst(event.x, event.y, event.accent || activeTable.palette.secondary, 6, energy);
      game.shake = Math.min(1.3, game.shake + 0.05 + energy * 0.07);
      continue;
    }
    if (event.kind === "bumper") {
      const energy = Math.min(2, event.impact / 600);
      audio.peg(1.3);
      audio.tone(420 + energy * 180, 0.11, "square", 0.03, 780 + energy * 220);
      spawnNeonBurst(event.x, event.y, event.accent || activeTable.palette.tertiary, 12, 1.3);
      game.shake = Math.min(1.5, game.shake + 0.14);
      vibrate(10);
      continue;
    }
    if (event.kind === "wheel") {
      startAbyssWheel(event);
      continue;
    }
    if (event.kind === "portal") {
      audio.tone(540, 0.16, "sine", 0.045, 980);
      audio.noise(0.12, 0.025, 2400);
      spawnPortalBurst(event.x, event.y, event.accent || activeTable.palette.primary);
      spawnPortalBurst(event.ex, event.ey, event.accentExit || activeTable.palette.secondary);
      game.shake = Math.min(1.2, game.shake + 0.18);
      vibrate([8, 30, 8]);
      continue;
    }
    if (event.kind === "block") {
      const energy = Math.min(2, event.impact / 700);
      if (energy > 0.14) {
        audio.wall(energy);
        spawnNeonBurst(event.x, event.y, event.accent || activeTable.palette.primary, 5, energy);
        if (energy > 0.5) game.shake = Math.min(1.2, game.shake + 0.06);
      }
    }
  }
}

function attemptToolPlacement(point) {
  if (game.phase !== "ready" || !game.placingTool) return false;
  const type = game.placingTool;
  if (game.toolAvailable[type] <= 0) return false;

  if (type === "magnet") {
    let nearest = null;
    let bestDistance = 46;
    for (const peg of pegs) {
      if (activeMagnets.some((magnet) => magnet.pegId === peg.id)) continue;
      const distance = Math.hypot(point.x - peg.x, point.y - peg.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = peg;
      }
    }
    if (!nearest) {
      toast("请点击一颗钉子放置磁力钉");
      return false;
    }
    const config = getMagnetConfig();
    activeMagnets.push({
      pegId: nearest.id,
      x: nearest.x,
      y: nearest.y,
      radius: config.radius,
      strength: config.strength,
      duration: config.duration,
      energy: config.duration,
      maxEnergy: config.duration,
      activated: false,
      pulse: 0,
    });
    game.toolScore += 2;
    consumeToolPlacement("magnet");
    spawnToolBurst(nearest.x, nearest.y, "#8ed0be");
    audio.tone(620, 0.1, "sine", 0.04, 820);
  } else {
    const config = getPadConfig();
    const radius = config.radius;
    if (
      point.x < 102 + radius ||
      point.x > 558 - radius ||
      point.y < 320 + radius ||
      point.y > 890 - radius
    ) {
      toast("弹力板需要放在钉子阵范围内");
      return false;
    }
    if (activePads.some((pad) => Math.hypot(pad.x - point.x, pad.y - point.y) < pad.radius + radius + 10)) {
      toast("两块弹力板不能靠得太近");
      return false;
    }
    activePads.push({
      x: point.x,
      y: point.y,
      radius,
      restitution: config.restitution,
      hits: 0,
      glow: 0,
    });
    game.toolScore += 2;
    consumeToolPlacement("pad");
    spawnToolBurst(point.x, point.y, "#e7b566");
    audio.tone(300, 0.12, "triangle", 0.045, 520);
  }

  updateToolTrayUI();
  if (game.placingTool && game.toolAvailable[game.placingTool] <= 0) {
    game.placingTool = null;
    updateToolTrayUI();
  }
  if (game.placingTool) {
    setPlayStatus(
      game.placingTool === "magnet" ? "继续点击钉子放置磁力钉" : "继续点击空位放置弹力板",
      "也可以直接拉杆发射",
      true,
    );
  } else {
    setPlayStatus("布阵完成 · 拉下弹簧发射", "满力可冲上圆顶", true);
    showHint("布阵完成，拉下弹簧发射", 2600);
  }
  return true;
}

function getPowerInfo(power) {
  if (power < 0.01) return { key: "idle", label: "待拉杆" };
  if (power < 0.34) return { key: "weak", label: "弱力" };
  if (power < 0.67) return { key: "mid", label: "中力" };
  if (power < 0.995) return { key: "strong", label: "强力" };
  return { key: "full", label: "满力" };
}

function setPowerUI(power, mode = "charging") {
  const p = clamp(power, 0, 1);
  const percent = Math.round(p * 100);
  const info = getPowerInfo(p);
  pullFill.style.width = `${percent}%`;
  pullPercent.textContent = `${percent}%`;
  pullMeter.dataset.zone = info.key;
  pullMeter.setAttribute("aria-valuenow", String(percent));
  if (mode === "fired") {
    pullZone.textContent = "已发射";
  } else if (mode === "starting") {
    pullZone.textContent = "准备";
  } else if (mode === "ready") {
    pullZone.textContent = p < 0.01 ? "待拉杆" : info.label;
  } else {
    pullZone.textContent = info.label;
    if (hintBubble.classList.contains("is-visible")) {
      hintText.textContent = `${info.label} · ${percent}% · 松手发射`;
    }
  }
}

function pulsePowerTick(power) {
  const step = Math.min(4, Math.floor(clamp(power, 0, 1) * 4 + 0.0001));
  if (step === game.hapticStep) return;
  if (step > game.hapticStep && step > 0) {
    vibrate(8);
    audio.tone(460 + step * 65, 0.035, "sine", 0.018);
  }
  game.hapticStep = step;
}

function showBanner(multiplier, slotCount) {
  bannerMult.textContent = `×${multiplier}`;
  bannerSlots.textContent = String(slotCount);
  multiplierBanner.classList.add("is-visible");
  multiplierBanner.setAttribute("aria-hidden", "false");
  window.clearTimeout(game.bannerTimer);
  game.bannerTimer = window.setTimeout(() => {
    multiplierBanner.classList.remove("is-visible");
    multiplierBanner.setAttribute("aria-hidden", "true");
  }, 3100);
}

function hideBanner() {
  multiplierBanner.classList.remove("is-visible");
  multiplierBanner.setAttribute("aria-hidden", "true");
}

function showHint(text, duration = 0) {
  hintText.textContent = text;
  hintBubble.classList.add("is-visible");
  window.clearTimeout(game.hintTimer);
  if (duration > 0) {
    game.hintTimer = window.setTimeout(hideHint, duration);
  }
}

function hideHint() {
  hintBubble.classList.remove("is-visible");
  window.clearTimeout(game.hintTimer);
}


function showResultCard(result) {
  if (!result) return;
  resultCard.setAttribute("aria-hidden", "false");
  const { won, payout, tickets, slotIndex, destroyed } = result;
  const wheelTickets = Number(result.wheelTickets) || 0;
  const wheelSpins = Number(result.wheelSpins) || 0;
  const bonusPayout = Number(result.bonusPayout) || 0;
  const spinNote = wheelSpins > 0 ? ` · 轮盘 ${wheelSpins} 次` : "";
  resultCard.classList.toggle("is-loss", !won);
  resultCard.classList.toggle("is-destroyed", Boolean(destroyed));

  if (destroyed) {
    resultEyebrow.textContent = "ABYSS CLAIMED";
    resultTitle.textContent = "深渊吞噬";
    resultPayout.textContent =
      payout > 0 ? `追加球返还 +${payout} 颗 · 彩票 +${tickets}` : "母球与投入一起沉入深渊";
    resultFoot.textContent = `赌桌重新铺开，下一局即将开始…${spinNote}`;
  } else if (won) {
    resultEyebrow.textContent = tickets > 0 ? "LUCKY WIN + TICKET" : "LUCKY WIN";
    resultTitle.textContent = `中奖 ×${game.multiplier}`;
    resultPayout.textContent =
      bonusPayout > 0
        ? `+${payout} 颗弹珠 · 含追加球 +${bonusPayout}`
        : `+${payout} 颗弹珠`;
    resultFoot.textContent = `母球即将沿回球坡道返回限位器…${spinNote}`;
  } else {
    resultEyebrow.textContent = "RESULT";
    resultTitle.textContent = "未中奖";
    resultPayout.textContent =
      slotIndex === null || slotIndex === undefined
        ? "这一球被深渊收走"
        : `${slotIndex + 1} 号槽 · 差一点`;
    resultFoot.textContent = `母球即将沿回球坡道返回限位器…${spinNote}`;
  }

  const ticketParts = [];
  if (tickets > 0) ticketParts.push(`返还彩票 +${tickets}`);
  if (wheelTickets !== 0) {
    ticketParts.push(`轮盘彩票 ${wheelTickets > 0 ? "+" : ""}${wheelTickets}`);
  }
  if (!ticketParts.length) {
    if (!won && !destroyed) {
      ticketParts.push("每满 30 颗返还可得 1 张彩票");
    } else if (destroyed) {
      ticketParts.push("轮盘彩票 ±0");
    }
  }
  resultTicket.textContent = ticketParts.join(" · ");

  resultProgress.hidden = true;
  resultProgress.textContent = "";
  resultCard.classList.add("is-visible");
}

function hideResultCard() {
  resultCard.classList.remove("is-visible");
  resultCard.setAttribute("aria-hidden", "true");
}

/* ── Game flow ───────────────────────────────────────────── */

function schedule(fn, delay) {
  const timer = window.setTimeout(fn, delay);
  game.timers = game.timers || [];
  game.timers.push(timer);
  return timer;
}

function clearScheduled() {
  (game.timers || []).forEach((timer) => window.clearTimeout(timer));
  game.timers = [];
}

/* ── Abyss wheel presentation ────────────────────────────── */

function setWheelCalloutTone(tone) {
  wheelCallout.classList.remove("is-spin", "is-positive", "is-negative", "is-danger");
  if (tone) wheelCallout.classList.add(`is-${tone}`);
}

function showWheelCallout(kicker, title, ticket, tone = "spin", hold = 0) {
  window.clearTimeout(game.wheel.calloutTimer);
  wheelCalloutKicker.textContent = kicker;
  wheelCalloutTitle.textContent = title;
  wheelCalloutTicket.textContent = ticket || "";
  setWheelCalloutTone(tone);
  wheelCallout.setAttribute("aria-hidden", "false");
  wheelCallout.classList.add("is-visible");
  if (hold > 0) {
    game.wheel.calloutTimer = window.setTimeout(() => hideWheelCallout(), hold);
  }
}

function hideWheelCallout() {
  window.clearTimeout(game.wheel.calloutTimer);
  game.wheel.calloutTimer = null;
  wheelCallout.classList.remove("is-visible");
  wheelCallout.setAttribute("aria-hidden", "true");
}

function resetAbyssRound() {
  hideWheelCallout();
  bonusBalls.length = 0;
  game.wheel.active = false;
  game.wheel.spinning = false;
  game.wheel.sectorIndex = -1;
  game.wheel.outcome = null;
  game.wheelTickets = 0;
  game.wheelSpins = 0;
  game.mainPayout = 0;
  game.mainTickets = 0;
  game.mainSlot = null;
  game.mainWon = false;
  game.mainDestroyed = false;
  game.mainResolved = false;
  game.bonusPayout = 0;
  game.bonusTickets = 0;
  game.bonusBallsScored = 0;
  game.landingFlowStarted = false;
  game.forceBonusLandingAt = 0;
  ball.hidden = false;
}

function startRound() {
  audio.init();
  if (game.phase !== "idle") return;
  if (game.marbles < 5) {
    toast(account.canClaimRelief ? "弹珠不足，先领取补助吧" : "弹珠不足，去商店兑换吧");
    return;
  }
  if (game.bet > game.marbles) {
    game.bet = game.marbles;
    updateBetUI();
  }

  clearScheduled();
  payoutFx.stop();
  if (game.chargeMode === "keyboard") game.chargeMode = null;
  game.charging = false;
  game.charge = 0;
  game.pointerId = null;
  game.round += 1;
  game.result = null;
  game.landingResolved = false;
  game.lastSlot = null;
  game.flashSlot = null;
  game.leftLane = false;
  game.flightStartedAt = 0;
  game.gate = 0;
  game.gateTarget = 0;
  game.drop = null;
  game.returnAnim = null;
  game.returnPos = null;
  resetAbyssRound();
  resetObstacles(obstacles);
  randomizeObstacles(obstacles);
  particles.length = 0;
  ball.x = STAGE.x;
  ball.y = STAGE.y;
  ball.prevX = STAGE.x;
  ball.prevY = STAGE.y;
  ball.vx = 0;
  ball.vy = 0;
  ball.trail.length = 0;
  ball.stallTime = 0;
  ball.spin = 0;
  const config = pickMultiplier();
  const lit = pickLitSlots(config.slots);
  game.multiplier = config.value;
  game.slotCount = config.slots;
  game.litSlots = new Set(lit);
  game.litReveal = new Map();
  const revealStart = performance.now() + 380;
  lit.forEach((slot, index) => {
    game.litReveal.set(slot, revealStart + index * 125);
  });

  setPhase("starting");
  setPowerUI(0, "starting");
  setMarbles(game.marbles - game.bet, false);
  setRoundBadge("live", `第 ${game.round} 局 · 亮灯中`);
  setPlayStatus("奖槽亮灯中…", "限位器准备开启", true);
  hideHint();
  hideResultCard();
  playMult.textContent = `×${game.multiplier}`;
  playSlots.textContent = String(config.slots);
  playBet.textContent = String(game.bet);
  audio.click();

  showBanner(game.multiplier, config.slots);

  lit.forEach((slot, index) => {
    schedule(() => {
      if (game.phase !== "starting" && game.phase !== "ready") return;
      audio.light(index);
    }, 380 + index * 125);
  });

  schedule(openGate, 750);
}

function openGate() {
  if (game.phase !== "starting") return;
  audio.gate();
  game.gateTarget = 1;
  game.drop = {
    start: performance.now() + 130,
    duration: 720,
    fromY: STAGE.y,
    toY: CUP.y,
  };
  setRoundBadge("live", "限位器开启");
  setPlayStatus("限位器开启 · 母球落入发射舱", "准备发射");

  schedule(() => {
    if (game.phase !== "starting") return;
    ball.x = CUP.x;
    ball.y = CUP.y;
    game.drop = null;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    hideBanner();
    setPhase("ready");
    setPowerUI(0, "ready");
    setRoundBadge("ready", "待发射");
    setPlayStatus("拉下弹簧，松手发射", "满力可冲上圆顶", true);
    showHint("拉到底，满力冲上圆顶最高点", 5200);
    audio.tone(392, 0.12, "sine", 0.04, 523.25);
  }, 980);
}

function setHintTextSafe() {
  hintText.textContent = "拉到底，满力冲上圆顶最高点";
}

function beginCharge(mode, pointerY = 0, clientY = 0) {
  if (game.phase !== "ready") return false;
  audio.init();
  game.placingTool = null;
  updateToolTrayUI();
  game.phase = "charging";
  game.charging = true;
  game.chargeMode = mode;
  game.charge = 0;
  game.pointerMoved = false;
  game.pointerStartY = pointerY;
  game.keyboardChargeStart = performance.now();
  game.hapticStep = -1;
  if (mode === "pointer") {
    const rect = canvas.getBoundingClientRect();
    game.pointerMaxPx = Math.max(80, Math.min(140, rect.height * 0.2));
    game.pointerClientStartY = clientY;
  }
  setPhase("charging");
  setPowerUI(0, "charging");
  setRoundBadge("live", "蓄力中");
  setPlayStatus("弹簧蓄力中 · 松手发射", "拖动调节力度", true);
  showHint("弱力 · 松手发射", 0);
  audio.click();
  return true;
}

function updateChargeFromPointer(clientY) {
  if (game.phase !== "charging" || game.chargeMode !== "pointer") return;
  const delta = clientY - game.pointerClientStartY;
  if (Math.abs(delta) > 6) game.pointerMoved = true;
  game.charge = clamp(delta / game.pointerMaxPx, 0, 1);
  if (game.charge >= 0.97) game.charge = 1;
  setPowerUI(game.charge, "charging");
  pulsePowerTick(game.charge);
}

function releaseCharge(cancelled = false) {
  if (game.phase !== "charging" || game.chargeMode !== "pointer") return;
  game.pointerId = null;
  if (cancelled) {
    game.charge = 0;
    setPhase("ready");
    setPowerUI(0, "ready");
    game.charging = false;
    game.chargeMode = null;
    setRoundBadge("ready", "待拉杆");
    setPlayStatus("拉下弹簧，松手发射", "满力可冲上圆顶", true);
    showHint("拉到底，满力冲上圆顶最高点", 4800);
    return;
  }
  if (!game.pointerMoved || game.charge < 0.035) {
    game.charge = 0;
    game.charging = false;
    game.chargeMode = null;
    setPhase("ready");
    setPowerUI(0, "ready");
    setRoundBadge("ready", "待拉杆");
    setPlayStatus("还没有拉动弹簧", "按住把手向下拉", true);
    showHint("拉到底，满力冲上圆顶最高点", 4800);
    toast("按住右下角把手向下拉，松手发射");
    return;
  }
  const power = clamp(game.charge, 0, 1);
  game.charging = false;
  game.chargeMode = null;
  launchBall(power);
}

function releaseKeyboardCharge() {
  if (game.phase !== "charging" || game.chargeMode !== "keyboard") return;
  const power = clamp(game.charge, 0, 1);
  game.charging = false;
  game.chargeMode = null;
  launchBall(power);
}

function launchBall(power) {
  if (game.phase !== "ready" && game.phase !== "charging") return;
  audio.init();
  game.phase = "flying";
  game.charging = false;
  game.gateTarget = 0;
  game.springRelease = { at: performance.now(), power };
  game.flightStartedAt = performance.now();
  game.leftLane = false;
  game.landingResolved = false;
  ball.x = CUP.x + 2;
  ball.y = CUP.y - 2;
  ball.prevX = ball.x;
  ball.prevY = ball.y;
  const launchJitter = activeTable.layout.launchJitter || 0;
  ball.vx = launchJitter ? randomRange(-launchJitter, launchJitter) : 0;
  ball.vy = -launchSpeed(power);
  ball.trail.length = 0;
  ball.stallTime = 0;
  ball.spin = 0;

  game.placingTool = null;
  updateToolTrayUI();
  setPhase("flying");
  setPowerUI(power, "fired");
  canvas.classList.remove("is-ready");
  hideHint();
  hideBanner();
  setRoundBadge("live", "发射！");
  setPlayStatus("母球发射 · 冲击圆顶", `弹簧动力 ${Math.round(power * 100)}%`, true);
  spawnLaunchParticles();
  game.shake = Math.min(2, game.shake + 0.7);
  audio.spring(power);
  audio.launch(power);
  vibrate(14);
}


/* ── Abyss wheel: spin, wager, bonus marble ──────────────── */

function findWheelObstacle(wheelId = null) {
  return (
    obstacles.find((obstacle) => obstacle.type === "wheel" && obstacle.id === wheelId) ||
    obstacles.find((obstacle) => obstacle.type === "wheel") ||
    null
  );
}

function applyWheelTicket(delta) {
  const amount = Number(delta) || 0;
  if (!amount) return 0;
  const before = game.tickets;
  const next = Math.max(0, before + amount);
  if (next !== before) setTickets(next, true);
  game.wheelTickets += next - before;
  return next - before;
}

function formatTicketDelta(value) {
  if (value > 0) return `彩票 +${value}`;
  if (value < 0) return `彩票 ${value}`;
  return "彩票 ±0";
}

function syncMultiplierUI() {
  playMult.textContent = `×${game.multiplier}`;
  playMult.classList.remove("is-bumping");
  // Force a clean reflow so the brief numeric pulse replays on every spin.
  void playMult.offsetWidth;
  playMult.classList.add("is-bumping");
  window.setTimeout(() => playMult.classList.remove("is-bumping"), 460);
}

function startAbyssWheel(event, forcedSectorIndex = null) {
  if (activeTable.id !== "abyss" || game.wheel.active || game.landingResolved) return;
  const wheel = findWheelObstacle(event.wheelId);
  if (!wheel || !wheel.sectors || wheel.spinning) return;

  const count = wheel.sectors.length;
  const sectorIndex = Number.isInteger(forcedSectorIndex)
    ? clamp(forcedSectorIndex, 0, count - 1)
    : Math.floor(Math.random() * count);
  const step = TAU / count;
  const sectorCenter = -Math.PI / 2 + sectorIndex * step;
  const current = wheel.pointerAngle;
  let target = sectorCenter + TAU * (4 + Math.floor(Math.random() * 2));
  while (target < current + TAU * 3.2) target += TAU;

  game.wheel.active = true;
  game.wheel.spinning = true;
  game.wheel.sectorIndex = sectorIndex;
  game.wheel.outcome = null;
  game.wheelSpins += 1;

  wheel.resultIndex = sectorIndex;
  wheel.resultGlow = 0;
  wheel.spinFrom = current;
  wheel.spinTo = target;
  wheel.spinStartedAt = performance.now();
  wheel.spinDuration = 1900 + Math.floor(Math.random() * 320);
  wheel.spinning = true;
  wheel.flash = 0.7;

  ball.hidden = true;
  ball.vx = 0;
  ball.vy = 0;
  ball.trail.length = 0;
  ball.stallTime = 0;
  game.flightStartedAt = performance.now();
  hideHint();

  showWheelCallout("ABYSS WHEEL", "命运转动中…", "彩票 +1 / -1", "spin");
  setRoundBadge("live", "深渊轮盘 · 转动中");
  setPlayStatus("母球被转盘吞没", "十二格命运指针旋转中", true);
  audio.tone(196, 0.35, "sawtooth", 0.04, 98);
  audio.noise(0.22, 0.026, 900);
  vibrate([12, 40, 12]);
  spawnPortalBurst(wheel.x, wheel.y, activeTable.palette.secondary);
  game.shake = Math.min(1.4, game.shake + 0.2);

  schedule(() => resolveAbyssWheel(wheel), wheel.spinDuration + 620);
}

function resolveAbyssWheel(wheel) {
  if (!game.wheel.active || !wheel || game.result) return;
  wheel.spinning = false;
  game.wheel.spinning = false;
  wheel.pointerAngle = wheel.spinTo;
  wheel.resultGlow = 1;
  wheel.flash = 1;

  const sector = wheel.sectors[game.wheel.sectorIndex] || {};
  const kind = sector.kind || "boost";
  const ticketChange = applyWheelTicket(sector.ticket);
  const ticketText = formatTicketDelta(ticketChange);
  game.wheel.outcome = kind;

  if (kind === "boost") {
    const previous = game.multiplier;
    game.multiplier = clamp(game.multiplier + 1, 1, 20);
    syncMultiplierUI();
    const title = game.multiplier > previous ? "倍率 +1" : "倍率已封顶";
    showWheelCallout("深渊轮盘 · 加注", title, ticketText, "positive", 1700);
    setRoundBadge("live", "深渊加注");
    setPlayStatus(`轮盘 ${title}`, `当前倍率 ×${game.multiplier} · ${ticketText}`, true);
    audio.tone(392, 0.22, "triangle", 0.06, 784);
    audio.tone(587, 0.3, "sine", 0.045, 1174, 110);
    vibrate([10, 30, 16]);
  } else if (kind === "lose") {
    const previous = game.multiplier;
    game.multiplier = clamp(game.multiplier - 1, 1, 20);
    syncMultiplierUI();
    const title = game.multiplier < previous ? "倍率 -1" : "倍率已见底";
    showWheelCallout("深渊轮盘 · 抽水", title, ticketText, "negative", 1700);
    setRoundBadge("live", "庄家抽水");
    setPlayStatus(`轮盘 ${title}`, `当前倍率 ×${game.multiplier} · ${ticketText}`, true);
    audio.tone(220, 0.3, "sawtooth", 0.045, 110);
    vibrate(24);
  } else if (kind === "add") {
    showWheelCallout("深渊轮盘 · 再赌一球", "追加一球", ticketText, "positive", 1900);
    setRoundBadge("live", "追加赌球");
    setPlayStatus("额外赌球入局", "它会独立落入奖槽、结算后消失", true);
    spawnBonusMarble(wheel);
    audio.tone(523, 0.18, "square", 0.045, 784);
    audio.tone(659, 0.24, "sine", 0.04, 988, 100);
    vibrate([12, 26, 12, 26]);
  } else {
    game.mainDestroyed = true;
    showWheelCallout("深渊轮盘 · 终局", "深渊吞噬", ticketText, "danger", 2400);
    setRoundBadge("live", "深渊吞噬");
    setPlayStatus("指针停在吞噬格", "母球被深渊收走", true);
    audio.tone(110, 0.7, "sawtooth", 0.06, 44);
    audio.noise(0.5, 0.045, 420);
    game.shake = Math.min(2, game.shake + 0.8);
    vibrate([25, 50, 45]);
    spawnPortalBurst(wheel.x, wheel.y, activeTable.palette.primary);
    spawnNeonBurst(wheel.x, wheel.y, "#070204", 28, 1.6);
    schedule(() => finalizeDestroyedMain(wheel), 1050);
    return;
  }

  schedule(() => relaunchFromWheel(wheel, sector), 1350);
}

function relaunchFromWheel(wheel, sector) {
  if (!game.wheel.active || game.landingResolved) {
    game.wheel.active = false;
    return;
  }
  game.wheel.active = false;
  game.wheel.spinning = false;
  ball.hidden = false;
  ball.x = wheel.x;
  ball.y = wheel.y;
  ball.prevX = wheel.x;
  ball.prevY = wheel.y;
  const angle = randomRange(0, TAU);
  const speed = randomRange(760, 1040);
  ball.vx = Math.cos(angle) * speed;
  ball.vy = Math.sin(angle) * speed;
  ball.trail.length = 0;
  ball.stallTime = 0;
  ball.spin = 0;
  game.flightStartedAt = performance.now();
  wheel.armed = false;
  wheel.cooldown = 1.65;

  setRoundBadge("live", "轮盘 · 随机发射");
  setPlayStatus(
    `轮盘出射 · ${sector.label || "命运"}`,
    `从轮心以 ${Math.round((angle * 180) / Math.PI)}° 射出`,
    true,
  );
  spawnNeonBurst(wheel.x, wheel.y, activeTable.palette.secondary, 16, 1.4);
  audio.tone(330, 0.16, "sine", 0.05, 660);
  audio.launch(0.55);
  game.shake = Math.min(1.6, game.shake + 0.3);
  vibrate(16);
  schedule(hideWheelCallout, 1050);
}

function spawnBonusMarble(wheel) {
  if (bonusBalls.length >= 4) return false;
  const angle = randomRange(Math.PI * 0.16, Math.PI * 0.84);
  const speed = randomRange(520, 760);
  bonusBalls.push({
    bonus: true,
    ignoreWheel: true,
    x: wheel.x,
    y: wheel.y,
    prevX: wheel.x,
    prevY: wheel.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: 8,
    spin: 0,
    stallTime: 0,
    born: performance.now(),
    trail: [],
    silent: false,
  });
  spawnNeonBurst(wheel.x, wheel.y, activeTable.palette.tertiary, 20, 1.5);
  spawnNeonBurst(wheel.x, wheel.y, activeTable.palette.secondary, 12, 1.1);
  game.shake = Math.min(1.6, game.shake + 0.25);
  audio.tone(880, 0.1, "square", 0.04, 1320);
  return true;
}

function resolveBonusLanding(bonusBall, forced = false) {
  if (!bonusBall || bonusBall.scored) return;
  bonusBall.scored = true;
  const index = getSlotIndex(clamp(bonusBall.x, SLOT.x0 + 4, SLOT.x1 - 4));
  const won = game.litSlots.has(index);
  const payout = won ? game.bet * game.multiplier : 0;
  const tickets = Math.floor(payout / 30);
  game.bonusPayout += payout;
  game.bonusTickets += tickets;
  game.bonusBallsScored += 1;

  if (payout > 0) {
    setMarbles(game.marbles + payout, true);
    if (tickets > 0) setTickets(game.tickets + tickets, true);
    spawnSlotBurst(bonusBall.x, 982, true);
    spawnTicketBurstIfNeeded(tickets);
    audio.win(false);
    setPlayStatus("追加球命中奖槽", `额外返还 ${payout} 颗弹珠`, true);
  } else {
    spawnSlotBurst(bonusBall.x, 982, false);
    audio.peg(0.5);
    setPlayStatus("追加球落入普通槽", forced ? "追加球燃尽消失" : "追加球结算后销毁", true);
  }
  const removeAt = bonusBalls.indexOf(bonusBall);
  if (removeAt >= 0) bonusBalls.splice(removeAt, 1);
  if (game.mainResolved) finishLandingWhenReady();
}

function spawnTicketBurstIfNeeded(tickets) {
  if (tickets > 0) spawnTicketBurst();
}

function updateBonusBalls(now, dt) {
  if (!bonusBalls.length) return;
  for (let index = bonusBalls.length - 1; index >= 0; index -= 1) {
    const b = bonusBalls[index];
    if (!b) continue;
    let remaining = Math.min(dt, 0.033);
    let guard = 0;
    let landed = false;
    while (remaining > 0 && guard < 12) {
      const step = Math.min(PHYS_STEP, remaining);
      stepBallPhysics(b, step);
      remaining -= step;
      guard += 1;
      if (b.x < MAIN_RIGHT && b.y > SLOT.sensorY) {
        resolveBonusLanding(b);
        landed = true;
        break;
      }
      if (b.x > MAIN_RIGHT && b.y > 1040) {
        landed = true;
        break;
      }
      if (!game.landingResolved) {
        const speed = Math.hypot(b.vx, b.vy);
        if (speed < 18) b.stallTime += step;
        else b.stallTime = 0;
        if (b.stallTime > 1.1) {
          b.vx += randomRange(-120, 120);
          b.vy -= 150;
          if (b.x < INNER.left + 26) b.vx += 190;
          else if (b.x > MAIN_RIGHT - 26) b.vx -= 190;
          b.stallTime = 0;
        }
      }
    }
    if (landed) {
      const removeAt = bonusBalls.indexOf(b);
      if (removeAt >= 0) bonusBalls.splice(removeAt, 1);
      if (game.mainResolved) finishLandingWhenReady();
      continue;
    }
    b.spin += (b.vx / b.r) * dt * 0.12;
    b.trail.push({ x: b.x, y: b.y, time: now });
    if (b.trail.length > 16) b.trail.shift();
    if (now - b.born > 5600) {
      b.x = clamp(b.x, SLOT.x0 + 8, SLOT.x1 - 8);
      resolveBonusLanding(b, true);
    }
  }

  if (
    game.mainResolved &&
    !game.landingFlowStarted &&
    bonusBalls.length &&
    game.forceBonusLandingAt &&
    now >= game.forceBonusLandingAt
  ) {
    forceBonusLandings();
  }
}

function forceBonusLandings() {
  if (!bonusBalls.length) return;
  const pending = bonusBalls.slice();
  for (const b of pending) {
    b.x = clamp(b.x, SLOT.x0 + 8, SLOT.x1 - 8);
    b.y = SLOT.sensorY + 4;
    resolveBonusLanding(b, true);
  }
}

function finalizeDestroyedMain(wheel) {
  if (game.mainResolved) return;
  game.wheel.active = false;
  game.wheel.spinning = false;
  ball.hidden = true;
  ball.vx = 0;
  ball.vy = 0;
  ball.trail.length = 0;
  game.mainResolved = true;
  game.landingResolved = true;
  game.mainDestroyed = true;
  game.mainWon = false;
  game.mainPayout = 0;
  game.mainTickets = 0;
  game.mainSlot = null;
  game.lastSlot = null;
  game.flashSlot = null;
  account.recordRound(false);
  setRoundBadge("live", "深渊 · 终局");
  setPlayStatus("母球被深渊吞噬", "本球终结", true);
  audio.lose();
  game.shake = Math.min(2, game.shake + 0.7);
  spawnPortalBurst(wheel.x, wheel.y, activeTable.palette.primary);
  if (bonusBalls.length) {
    game.forceBonusLandingAt = performance.now() + 1500;
    setRoundBadge("live", "追加球结算中");
    setPlayStatus("深渊吞噬母球", "追加赌球仍在结算", true);
  }
  finishLandingWhenReady();
}

function finishLandingWhenReady() {
  if (!game.mainResolved || game.landingFlowStarted) return;
  if (bonusBalls.length) {
    if (!game.forceBonusLandingAt) {
      game.forceBonusLandingAt = performance.now() + 1800;
    }
    return;
  }
  game.landingFlowStarted = true;
  presentLandingResult();
}

function buildRoundResult() {
  const payout = game.mainPayout + game.bonusPayout;
  const tickets = game.mainTickets + game.bonusTickets;
  return {
    won: payout > 0,
    payout,
    tickets,
    slotIndex: game.mainSlot ?? getSlotIndex(clamp(ball.x, SLOT.x0 + 1, SLOT.x1 - 1)),
    destroyed: game.mainDestroyed,
    wheelTickets: game.wheelTickets,
    wheelSpins: game.wheelSpins,
    mainPayout: game.mainPayout,
    bonusPayout: game.bonusPayout,
    bonusBalls: game.bonusBallsScored,
  };
}

function presentLandingResult() {
  if (game.result) return;
  const result = buildRoundResult();
  game.result = result;
  const won = result.won;

  if (result.destroyed) {
    setRoundBadge("live", "开奖 · 深渊吞噬");
    setPlayStatus(
      "深渊吞噬了母球",
      result.bonusPayout > 0 ? `追加球仍返还 ${result.bonusPayout} 颗` : "本局投入被收走",
      true,
    );
  } else if (won) {
    setRoundBadge("live", "开奖 · 中奖");
    setPlayStatus("中奖！母球正在回收", `返还 ${result.payout} 颗`, true);
  } else {
    setRoundBadge("live", "开奖");
    setPlayStatus("未中奖 · 母球正在回收", "落入普通槽位", true);
  }

  if (won && result.tickets > 0) spawnTicketBurst();

  const animatePayout = won && result.payout > 0 && account.settings.payoutAnimation;
  if (animatePayout) {
    setRoundBadge("live", "开奖 · 吐珠中");
    setPlayStatus("中奖！弹珠吐进托盘", `返还 ${result.payout} 颗`, true);
    payoutFx.start({
      total: result.payout,
      onComplete: () => {
        if (!game.result || game.phase === "returning" || game.phase === "idle") return;
        if (game.result.tickets > 0) spawnTicketBurst();
        showResultCard(game.result);
        if (game.result.tickets > 0) {
          window.setTimeout(() => audio.ticket(), 220);
        }
        setRoundBadge("live", game.result.destroyed ? "深渊 · 终局" : "开奖 · 中奖");
        setPlayStatus(
          game.result.destroyed ? "深渊收起赌桌" : "母球即将回收",
          game.result.destroyed ? `轮盘吞噬 · 彩票 ${game.result.wheelTickets >= 0 ? "+" : ""}${game.result.wheelTickets}` : `返还 ${game.result.payout} 颗`,
          true,
        );
        schedule(() => endResolvedRound(game.result), 2350);
      },
    });
    return;
  }

  schedule(() => {
    showResultCard(game.result);
    if (won && game.result.tickets > 0) {
      window.setTimeout(() => audio.ticket(), 220);
    }
  }, 420);
  schedule(() => endResolvedRound(game.result), result.destroyed ? 2950 : 2650);
}

function endResolvedRound(result) {
  if (!result) return;
  if (result.destroyed) {
    if (game.phase === "returning" || game.phase === "idle") return;
    game.phase = "returning";
    game.returnAnim = null;
    game.returnPos = null;
    ball.hidden = true;
    setPhase("returning");
    setRoundBadge("live", "深渊 · 收场");
    setPlayStatus("深渊收起赌桌", "下一局即将开始", false);
    schedule(finishReturn, 1300);
    return;
  }
  beginReturn();
}

function resolveLanding() {
  if (game.landingResolved || game.mainResolved) return;
  if (game.wheel.active) return;
  const index = getSlotIndex(ball.x);
  const won = game.litSlots.has(index);
  const payout = won ? game.bet * game.multiplier : 0;
  const tickets = Math.floor(payout / 30);
  game.landingResolved = true;
  game.mainResolved = true;
  game.mainDestroyed = false;
  game.mainWon = won;
  game.mainPayout = payout;
  game.mainTickets = tickets;
  game.mainSlot = index;
  game.lastSlot = index;
  game.flashSlot = index;
  game.flashAt = performance.now();

  if (payout > 0) {
    setMarbles(game.marbles + payout, true);
    if (tickets > 0) setTickets(game.tickets + tickets, true);
  }
  account.recordRound(won);

  spawnSlotBurst(ball.x, 982, won);
  if (won) {
    audio.win(game.multiplier >= 8);
    vibrate([18, 40, 25]);
  } else {
    vibrate(18);
    window.setTimeout(() => audio.lose(), 160);
  }

  hideHint();
  if (bonusBalls.length) {
    setRoundBadge("live", "追加球结算中");
    setPlayStatus("母球已入槽", "追加赌球正在各自结算", true);
    game.forceBonusLandingAt = performance.now() + 1700;
  }
  finishLandingWhenReady();
}

function resolveMissedMain() {
  if (game.landingResolved || game.mainResolved) return;
  if (game.wheel.active) return;
  const index = getSlotIndex(clamp(ball.x, SLOT.x0 + 1, SLOT.x1 - 1));
  game.landingResolved = true;
  game.mainResolved = true;
  game.mainDestroyed = false;
  game.mainWon = false;
  game.mainPayout = 0;
  game.mainTickets = 0;
  game.mainSlot = index;
  game.lastSlot = index;
  game.flashSlot = index;
  game.flashAt = performance.now();
  account.recordRound(false);
  setRoundBadge("live", "开奖");
  setPlayStatus("母球回到了发射舱", "本局未中奖", true);
  audio.lose();
  finishLandingWhenReady();
}

function beginReturn() {
  if (!game.result || game.phase === "returning" || game.phase === "idle") return;
  const slotCenter = SLOT.x0 + (game.lastSlot + 0.5) * SLOT.width;
  game.returnAnim = {
    start: performance.now(),
    duration: 1850,
    fromX: slotCenter,
    fromY: Math.min(ball.y, SLOT.floor - 8),
    slotCenter,
  };
  game.phase = "returning";
  game.charge = 0;
  game.gateTarget = 0;
  game.returnPos = { x: slotCenter, y: SLOT.floor - 8, angle: 0 };
  setPhase("returning");
  setRoundBadge("live", "回球中");
  setPlayStatus("母球沿回球坡道返回限位器", "完成本局循环", false);

  window.clearTimeout(game.hideResultTimer);
  game.hideResultTimer = window.setTimeout(hideResultCard, 900);

  schedule(() => {
    if (game.phase !== "returning") return;
    finishReturn();
  }, 1850);
}

function finishReturn() {
  if (game.phase !== "returning") return;
  game.phase = "idle";
  game.returnAnim = null;
  game.returnPos = null;
  ball.x = STAGE.x;
  ball.y = STAGE.y;
  ball.prevX = STAGE.x;
  ball.prevY = STAGE.y;
  ball.vx = 0;
  ball.vy = 0;
  ball.trail.length = 0;
  game.gate = 0;
  game.gateTarget = 0;
  game.charge = 0;
  game.result = null;
  game.lastSlot = null;
  game.litSlots.clear();
  game.litReveal.clear();
  game.flashSlot = null;
  activeMagnets.length = 0;
  activePads.length = 0;
  game.placingTool = null;
  game.toolAvailable = { magnet: 0, pad: 0 };
  game.toolPlaced = { magnet: 0, pad: 0 };
  game.toolScore = 0;
  resetAbyssRound();
  updateToolTrayUI();
  hideBanner();
  hideResultCard();
  payoutFx.stop();
  resetObstacles(obstacles);
  setPhase("idle");
  setPowerUI(0, "ready");
  setRoundBadge("ready", "等待投珠");
  hideHint();

  if (pendingTableId) {
    const next = pendingTableId;
    pendingTableId = null;
    if (next !== activeTable.id) applyTable(next, true);
  }

  if (game.marbles < 5) {
    toast(account.canClaimRelief ? "弹珠不足，可领取 30 颗补助" : "弹珠不足，可前往商店兑换");
  }
  updateBetUI();
}

function handleLowFunds() {
  if (game.phase !== "idle") return;
  if (account.canClaimRelief) {
    const amount = account.claimRelief();
    if (amount > 0) {
      setMarbles(account.marbles, true);
      toast(`领取补助 ${amount} 颗弹珠`);
      audio.ticket();
    }
    return;
  }
  audio.click();
  window.dispatchEvent(new CustomEvent("marble:shop"));
}

/* ── Render: geometry helpers ────────────────────────────── */

function machinePath(rx, ry, left, right, bottom) {
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(left, INNER.cy);
  ctx.ellipse(INNER.cx, INNER.cy, rx, ry, 0, Math.PI, TAU, false);
  ctx.lineTo(right, bottom);
  ctx.closePath();
}

function roundRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawSpacedText(text, centerX, y, spacing, font, color, alpha = 1) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.textBaseline = "middle";
  const chars = [...text];
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * (chars.length - 1);
  let x = centerX - total / 2;
  ctx.textAlign = "left";
  chars.forEach((char, index) => {
    ctx.fillText(char, x, y);
    x += widths[index] + spacing;
  });
  ctx.restore();
}

function drawScrew(x, y, r = 3.2) {
  ctx.save();
  ctx.fillStyle = "#1f1a14";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(237, 205, 150, 0.22)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.52, y);
  ctx.lineTo(x + r * 0.52, y);
  ctx.stroke();
  ctx.restore();
}

/* ── Render: cabinet & paper ─────────────────────────────── */

function drawCabinet(now) {
  // Outer silhouette
  const outer = ctx.createLinearGradient(0, 0, 0, H);
  outer.addColorStop(0, "#42382c");
  outer.addColorStop(0.55, "#2c251d");
  outer.addColorStop(1, "#17130f");
  machinePath(304, 313, 56, 664, 1194);
  ctx.fillStyle = outer;
  ctx.fill();
  ctx.strokeStyle = "rgba(226, 189, 127, 0.2)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // A thin inner bevel line
  machinePath(286, 296, 74, 646, 1181);
  ctx.strokeStyle = "rgba(10, 8, 6, 0.55)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Paper surface
  const paper = ctx.createLinearGradient(0, 42, 0, 1180);
  paper.addColorStop(0, "#f8f2e6");
  paper.addColorStop(0.52, "#f2ead9");
  paper.addColorStop(1, "#e7dbc5");
  machinePath(INNER.rx, INNER.ry, INNER.left, INNER.right, INNER.bottom);
  ctx.fillStyle = paper;
  ctx.fill();

  // Speckled paper texture, clipped to the playing surface
  ctx.save();
  machinePath(INNER.rx, INNER.ry, INNER.left, INNER.right, INNER.bottom);
  ctx.clip();

  ctx.fillStyle = "rgba(88, 65, 39, 0.03)";
  for (const dot of speckles) {
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, TAU);
    ctx.globalAlpha = dot.a;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Warm spotlight under the dome
  const domeGlow = ctx.createRadialGradient(360, 230, 30, 360, 230, 360);
  domeGlow.addColorStop(0, "rgba(255, 249, 235, 0.8)");
  domeGlow.addColorStop(0.62, "rgba(255, 247, 229, 0.1)");
  domeGlow.addColorStop(1, "rgba(255, 245, 225, 0)");
  ctx.fillStyle = domeGlow;
  ctx.fillRect(70, 35, 580, 450);

  // Very soft vertical strips, like an old mechanical cabinet
  for (let i = 0; i < 6; i += 1) {
    const x = 112 + i * 91;
    ctx.fillStyle = i % 2 === 0 ? "rgba(102, 81, 50, 0.016)" : "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(x, 340, 38, 690);
  }

  ctx.restore();

  // Inner rail
  machinePath(INNER.rx, INNER.ry, INNER.left, INNER.right, INNER.bottom);
  ctx.strokeStyle = "rgba(73, 63, 48, 0.35)";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // A fine highlight tracing the arch
  ctx.save();
  const archHighlight = ctx.createLinearGradient(120, 60, 600, 300);
  archHighlight.addColorStop(0, "rgba(255, 255, 255, 0)");
  archHighlight.addColorStop(0.4, "rgba(255, 250, 236, 0.78)");
  archHighlight.addColorStop(0.7, "rgba(255, 255, 255, 0)");
  ctx.strokeStyle = archHighlight;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(INNER.cx, INNER.cy, INNER.rx - 8, INNER.ry - 8, 0, Math.PI, TAU, false);
  ctx.stroke();
  ctx.restore();

  // Cabinet screws near the bottom
  drawScrew(92, 1160, 3.5);
  drawScrew(628, 1160, 3.5);
  drawScrew(360, 1170, 2.6);

  // Base lip
  ctx.save();
  const base = ctx.createLinearGradient(0, 1170, 0, 1194);
  base.addColorStop(0, "#3b3126");
  base.addColorStop(1, "#17130f");
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.moveTo(54, 1170);
  ctx.lineTo(666, 1170);
  ctx.lineTo(664, 1194);
  ctx.lineTo(56, 1194);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(231, 181, 102, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(58, 1171);
  ctx.lineTo(662, 1171);
  ctx.stroke();
  ctx.restore();
}

function drawMarquee(now) {
  ctx.save();
  ctx.textAlign = "center";

  // Tiny calibration ticks around the arch
  for (let i = 0; i < 17; i += 1) {
    const angle = Math.PI + (i / 16) * Math.PI;
    const x = INNER.cx + Math.cos(angle) * (INNER.rx - 17);
    const y = INNER.cy + Math.sin(angle) * (INNER.ry - 17);
    ctx.fillStyle = i % 4 === 0 ? "rgba(103, 85, 59, 0.34)" : "rgba(103, 85, 59, 0.16)";
    ctx.beginPath();
    ctx.arc(x, y, i % 4 === 0 ? 2.1 : 1.2, 0, TAU);
    ctx.fill();
  }

  drawSpacedText(
    "MARBLE DROP",
    360,
    143,
    9.5,
    '800 17px "Avenir Next", "SF Pro Display", sans-serif',
    "#3f3425",
    0.63,
  );

  ctx.strokeStyle = "rgba(87, 69, 45, 0.22)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(252, 166);
  ctx.lineTo(310, 166);
  ctx.moveTo(410, 166);
  ctx.lineTo(468, 166);
  ctx.stroke();

  ctx.fillStyle = "rgba(117, 92, 55, 0.5)";
  ctx.beginPath();
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * TAU - Math.PI / 2;
    const x = 360 + Math.cos(a) * 4;
    const y = 166 + Math.sin(a) * 4;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  drawSpacedText(
    "物理弹珠台 · PACHINKO No.08",
    360,
    185,
    2.3,
    '600 9px "PingFang SC", "Hiragino Sans GB", sans-serif',
    "#67533a",
    0.55,
  );

  // A subtle winner's rosette, sitting in the empty dome space
  ctx.save();
  ctx.translate(360, 281);
  const rosette = ctx.createRadialGradient(0, 0, 2, 0, 0, 49);
  rosette.addColorStop(0, "rgba(221, 59, 44, 0.055)");
  rosette.addColorStop(1, "rgba(221, 59, 44, 0)");
  ctx.fillStyle = rosette;
  ctx.beginPath();
  ctx.arc(0, 0, 49, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(125, 90, 45, 0.17)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 27, 0, TAU);
  ctx.stroke();
  ctx.rotate(now * 0.00004);
  ctx.fillStyle = "rgba(137, 48, 37, 0.46)";
  for (let i = 0; i < 8; i += 1) {
    ctx.rotate(TAU / 8);
    ctx.beginPath();
    ctx.arc(0, -34, 1.55, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  drawSpacedText(
    "投珠 · 拉杆 · 好运",
    360,
    281,
    3.4,
    '650 9px "PingFang SC", "Hiragino Sans GB", sans-serif',
    "#705c40",
    0.58,
  );

  ctx.restore();
}

/* ── Render: pegs & slots ────────────────────────────────── */

function drawPegField(now) {
  // A faint baseline atmosphere behind the bottom pegs
  const fieldGlow = ctx.createLinearGradient(0, 360, 0, 890);
  fieldGlow.addColorStop(0, "rgba(255, 251, 240, 0)");
  fieldGlow.addColorStop(1, "rgba(111, 82, 48, 0.045)");
  ctx.fillStyle = fieldGlow;
  ctx.fillRect(90, 360, 490, 530);

  for (const peg of pegs) {
    const pulse = peg.glow;
    if (pulse > 0.01) {
      const glow = ctx.createRadialGradient(peg.x, peg.y, 1, peg.x, peg.y, 23 + pulse * 10);
      glow.addColorStop(0, `rgba(231, 181, 102, ${0.32 * pulse})`);
      glow.addColorStop(1, "rgba(231, 181, 102, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, 23 + pulse * 10, 0, TAU);
      ctx.fill();
    }

    ctx.save();
    ctx.shadowColor = "rgba(53, 37, 18, 0.32)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    const metal = ctx.createRadialGradient(
      peg.x - peg.r * 0.4,
      peg.y - peg.r * 0.5,
      0.4,
      peg.x,
      peg.y,
      peg.r * 1.15,
    );
    metal.addColorStop(0, "#756a5a");
    metal.addColorStop(0.3, "#37312a");
    metal.addColorStop(1, "#17130f");
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, peg.r, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(255, 244, 220, 0.42)";
    ctx.beginPath();
    ctx.arc(peg.x - peg.r * 0.34, peg.y - peg.r * 0.38, peg.r * 0.2, 0, TAU);
    ctx.fill();

    if (pulse > 0.02) {
      ctx.strokeStyle = `rgba(221, 59, 44, ${pulse * 0.3})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.r + 2 + (1 - pulse) * 4, 0, TAU);
      ctx.stroke();
    }
  }
}

function drawTools(now) {
  // Bounce pads sit above the peg grid but below the marble.
  for (const pad of activePads) {
    const pulse = 0.72 + Math.sin(now * 0.0045 + pad.x) * 0.18;
    ctx.save();
    ctx.shadowColor = "rgba(57, 39, 17, 0.3)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    const glow = ctx.createRadialGradient(pad.x, pad.y, 1, pad.x, pad.y, pad.radius * 2.2);
    glow.addColorStop(0, `rgba(244, 206, 121, ${0.16 + pad.glow * 0.22})`);
    glow.addColorStop(1, "rgba(231, 181, 102, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, pad.radius * 2.2, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    const base = ctx.createRadialGradient(
      pad.x - pad.radius * 0.35,
      pad.y - pad.radius * 0.4,
      1,
      pad.x,
      pad.y,
      pad.radius,
    );
    base.addColorStop(0, "#f8e7bd");
    base.addColorStop(0.42, "#d9b46d");
    base.addColorStop(1, "#7a5c2c");
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, pad.radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(55, 42, 22, 0.66)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 250, 231, ${0.35 + pad.glow * 0.5})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, pad.radius * 0.64, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(86, 63, 26, 0.42)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * TAU + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(
        pad.x + Math.cos(angle) * pad.radius * 0.22,
        pad.y + Math.sin(angle) * pad.radius * 0.22,
      );
      ctx.lineTo(
        pad.x + Math.cos(angle) * pad.radius * 0.84,
        pad.y + Math.sin(angle) * pad.radius * 0.84,
      );
      ctx.stroke();
    }
    ctx.fillStyle = "#49351a";
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, Math.max(2.2, pad.radius * 0.16), 0, TAU);
    ctx.fill();
    if (pad.glow > 0.08) {
      ctx.strokeStyle = `rgba(255, 245, 207, ${pad.glow * 0.7})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pad.x, pad.y, pad.radius + 4 + (1 - pad.glow) * 10, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Magnetized pegs have a visible field radius and rotating rings.
  for (const magnet of activeMagnets) {
    const active = magnet.energy > 0;
    const pulse = 0.5 + Math.sin(now * 0.005 + magnet.x * 0.11) * 0.5;
    const alpha = active ? 0.62 + pulse * 0.26 : 0.16;
    ctx.save();
    const aura = ctx.createRadialGradient(
      magnet.x,
      magnet.y,
      2,
      magnet.x,
      magnet.y,
      magnet.radius,
    );
    aura.addColorStop(0, `rgba(111, 218, 190, ${alpha * 0.38})`);
    aura.addColorStop(0.55, `rgba(102, 193, 171, ${alpha * 0.16})`);
    aura.addColorStop(0.92, `rgba(102, 193, 171, ${alpha * 0.05})`);
    aura.addColorStop(1, "rgba(102, 193, 171, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(magnet.x, magnet.y, magnet.radius, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = `rgba(83, 174, 152, ${active ? 0.42 + pulse * 0.25 : 0.12})`;
    ctx.lineWidth = 1.7;
    ctx.setLineDash([6, 7]);
    ctx.lineDashOffset = -now * 0.012;
    ctx.beginPath();
    ctx.arc(magnet.x, magnet.y, magnet.radius * (0.9 + pulse * 0.03), 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = `rgba(116, 206, 183, ${active ? 0.2 + pulse * 0.25 : 0.07})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.lineDashOffset = now * 0.016;
    ctx.beginPath();
    ctx.arc(magnet.x, magnet.y, magnet.radius * 0.55, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    const orb = ctx.createRadialGradient(
      magnet.x - 2,
      magnet.y - 3,
      0,
      magnet.x,
      magnet.y,
      12,
    );
    orb.addColorStop(0, active ? "#e5fff5" : "#a3bdb4");
    orb.addColorStop(0.5, active ? "#89d9c3" : "#628579");
    orb.addColorStop(1, "#2d6257");
    ctx.fillStyle = orb;
    ctx.beginPath();
    ctx.arc(magnet.x, magnet.y, 8.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(37, 86, 75, 0.75)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (active) {
      ctx.strokeStyle = `rgba(211, 255, 241, ${0.35 + pulse * 0.5})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(magnet.x, magnet.y, 12 + pulse * 3.5, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = `rgba(220, 255, 245, ${0.2 + pulse * 0.35})`;
      ctx.beginPath();
      ctx.arc(magnet.x - 2.5, magnet.y - 3, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  if (game.placingTool === "magnet") {
    const pulse = 0.55 + Math.sin(now * 0.007) * 0.35;
    ctx.save();
    for (const peg of pegs) {
      if (activeMagnets.some((magnet) => magnet.pegId === peg.id)) continue;
      ctx.strokeStyle = `rgba(123, 211, 188, ${0.25 + pulse * 0.5})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, 9 + pulse * 3, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = `rgba(123, 211, 188, ${0.1 + pulse * 0.12})`;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, 7, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  } else if (game.placingTool === "pad") {
    const pulse = 0.5 + Math.sin(now * 0.005) * 0.3;
    const config = getPadConfig();
    const left = 102 + config.radius;
    const right = 558 - config.radius;
    const top = 320 + config.radius;
    const bottom = 890 - config.radius;
    ctx.save();
    ctx.setLineDash([7, 8]);
    ctx.lineDashOffset = -now * 0.01;
    ctx.strokeStyle = `rgba(231, 181, 102, ${0.18 + pulse * 0.18})`;
    ctx.lineWidth = 1.4;
    roundRect(left, top, right - left, bottom - top, 18);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(231, 181, 102, ${0.14 + pulse * 0.1})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left + 6, top);
    ctx.lineTo(right - 6, top);
    ctx.moveTo(left + 6, bottom);
    ctx.lineTo(right - 6, bottom);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSlots(now) {
  ctx.save();

  // Recessed slot channel
  const recess = ctx.createLinearGradient(0, SLOT.top - 4, 0, SLOT.floor + 4);
  recess.addColorStop(0, "rgba(82, 64, 42, 0.06)");
  recess.addColorStop(0.2, "rgba(82, 64, 42, 0.075)");
  recess.addColorStop(1, "rgba(82, 64, 42, 0.02)");
  ctx.fillStyle = recess;
  ctx.fillRect(SLOT.x0, SLOT.top - 4, SLOT.x1 - SLOT.x0, SLOT.floor - SLOT.top + 8);

  const isActiveRound = game.phase !== "idle" && game.litSlots.size > 0;
  const nowMs = now;

  for (let i = 0; i < SLOT.count; i += 1) {
    const x = SLOT.x0 + i * SLOT.width;
    const revealed = game.litReveal.has(i) && nowMs >= game.litReveal.get(i);
    const lit = isActiveRound && game.litSlots.has(i) && revealed;
    const flash = game.flashSlot === i && now - game.flashAt < 850;
    const centerX = x + SLOT.width / 2;
    const pulse = 0.68 + Math.sin(now * 0.0042 + i * 0.8) * 0.32;

    if (i % 2 === 1) {
      ctx.fillStyle = "rgba(75, 58, 38, 0.018)";
      ctx.fillRect(x + 1.2, SLOT.top + 2, SLOT.width - 2.4, SLOT.floor - SLOT.top - 3);
    }

    if (lit) {
      // Warm column of light
      const beam = ctx.createLinearGradient(0, SLOT.top - 34, 0, SLOT.floor);
      beam.addColorStop(0, `rgba(255, 228, 159, ${0.05 + pulse * 0.04})`);
      beam.addColorStop(0.3, `rgba(238, 184, 88, ${0.25 + pulse * 0.12})`);
      beam.addColorStop(1, `rgba(221, 59, 44, ${0.1 + pulse * 0.05})`);
      ctx.fillStyle = beam;
      ctx.fillRect(x + 2, SLOT.top - 34, SLOT.width - 4, SLOT.floor - SLOT.top + 34);

      const pocket = ctx.createLinearGradient(0, SLOT.top, 0, SLOT.floor);
      pocket.addColorStop(0, `rgba(238, 184, 88, ${0.32 + pulse * 0.08})`);
      pocket.addColorStop(0.68, "rgba(221, 59, 44, 0.1)");
      pocket.addColorStop(1, "rgba(221, 59, 44, 0.015)");
      ctx.fillStyle = pocket;
      ctx.fillRect(x + 2, SLOT.top, SLOT.width - 4, SLOT.floor - SLOT.top);

      // Inner border of the lit pocket
      ctx.strokeStyle = `rgba(217, 133, 41, ${0.42 + pulse * 0.28})`;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x + 3, SLOT.top + 2, SLOT.width - 6, SLOT.floor - SLOT.top - 6);

      // Pointer hanging above the winning pocket
      ctx.fillStyle = `rgba(173, 53, 32, ${0.72 + pulse * 0.2})`;
      ctx.beginPath();
      ctx.moveTo(centerX, SLOT.top - 5);
      ctx.lineTo(centerX - 4.6, SLOT.top - 13);
      ctx.lineTo(centerX + 4.6, SLOT.top - 13);
      ctx.closePath();
      ctx.fill();

      // Lamp halo
      const haloR = 30 + pulse * 7;
      const halo = ctx.createRadialGradient(centerX, SLOT.top + 23, 0, centerX, SLOT.top + 23, haloR);
      halo.addColorStop(0, `rgba(255, 221, 132, ${0.86 * pulse})`);
      halo.addColorStop(0.35, `rgba(231, 181, 102, ${0.32 * pulse})`);
      halo.addColorStop(1, "rgba(231, 181, 102, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(centerX, SLOT.top + 23, haloR, 0, TAU);
      ctx.fill();
    }

    if (flash) {
      const u = clamp((now - game.flashAt) / 850, 0, 1);
      ctx.fillStyle = `rgba(255, 241, 198, ${(1 - u) * 0.26})`;
      ctx.fillRect(x + 2, SLOT.top - 10, SLOT.width - 4, SLOT.floor - SLOT.top + 10);
      ctx.strokeStyle = `rgba(231, 181, 102, ${(1 - u) * 0.65})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, SLOT.top - 10, SLOT.width - 4, SLOT.floor - SLOT.top + 10);
    }

    // Divider light / slot number
    ctx.fillStyle = lit ? "rgba(118, 73, 29, 0.7)" : "rgba(100, 83, 61, 0.34)";
    ctx.font = '600 9px "SFMono-Regular", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1).padStart(2, "0"), centerX, SLOT.floor - 10);

    if (lit) {
      // The bulb
      ctx.save();
      ctx.shadowColor = "rgba(255, 196, 91, 0.95)";
      ctx.shadowBlur = 15;
      ctx.fillStyle = "#ffe1a0";
      ctx.beginPath();
      ctx.arc(centerX, SLOT.top + 23, 5.2, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = "rgba(133, 73, 25, 0.65)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(centerX, SLOT.top + 23, 7.1, 0, TAU);
      ctx.stroke();

      ctx.fillStyle = "#99251b";
      ctx.font = '900 18px "Avenir Next", "PingFang SC", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`×${game.multiplier}`, centerX, SLOT.top + 57);
    } else {
      ctx.fillStyle = "rgba(83, 68, 49, 0.3)";
      ctx.beginPath();
      ctx.arc(centerX, SLOT.top + 23, 2.3, 0, TAU);
      ctx.fill();
    }
  }

  // Slot dividers
  ctx.lineCap = "round";
  for (let i = 1; i < SLOT.count; i += 1) {
    const x = SLOT.x0 + i * SLOT.width;
    ctx.strokeStyle = "rgba(82, 67, 47, 0.69)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x, SLOT.top);
    ctx.lineTo(x, SLOT.floor);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 248, 233, 0.46)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - 0.65, SLOT.top + 1);
    ctx.lineTo(x - 0.65, SLOT.floor - 1);
    ctx.stroke();
    ctx.fillStyle = "rgba(76, 63, 46, 0.48)";
    ctx.beginPath();
    ctx.arc(x, SLOT.top, 2.4, 0, TAU);
    ctx.fill();
  }

  // Top and bottom rails
  ctx.strokeStyle = "rgba(75, 61, 43, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(SLOT.x0, SLOT.top);
  ctx.lineTo(SLOT.x1, SLOT.top);
  ctx.stroke();

  ctx.strokeStyle = "rgba(69, 55, 38, 0.38)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(SLOT.x0, SLOT.floor);
  ctx.lineTo(SLOT.x1, SLOT.floor);
  ctx.stroke();

  // A tiny "WIN" plate centered above the slot bank
  ctx.fillStyle = "rgba(117, 90, 53, 0.27)";
  ctx.font = '700 7px "SFMono-Regular", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("W I N   S L O T S", 333, SLOT.top - 13);

  ctx.restore();
}

/* ── Render: lane, return ramp, gate, spring ─────────────── */

function drawLaunchLane(now) {
  // Lane paper
  const lane = ctx.createLinearGradient(584, 0, 638, 0);
  lane.addColorStop(0, "rgba(102, 76, 44, 0.055)");
  lane.addColorStop(0.55, "rgba(255, 249, 235, 0.1)");
  lane.addColorStop(1, "rgba(80, 57, 34, 0.08)");
  ctx.fillStyle = lane;
  ctx.fillRect(584, 270, 54, 900);

  // Faint launch chevrons
  ctx.save();
  ctx.strokeStyle = "rgba(118, 90, 52, 0.2)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    const y = 640 + i * 24;
    ctx.beginPath();
    ctx.moveTo(601, y + 5);
    ctx.lineTo(611, y - 2);
    ctx.lineTo(621, y + 5);
    ctx.stroke();
  }
  ctx.restore();

  // Divider rail
  const rail = ctx.createLinearGradient(578, 0, 592, 0);
  rail.addColorStop(0, "rgba(58, 48, 36, 0.7)");
  rail.addColorStop(0.45, "#ece2d0");
  rail.addColorStop(0.62, "#9b8e79");
  rail.addColorStop(1, "rgba(48, 39, 29, 0.68)");
  ctx.strokeStyle = rail;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(584, LANE.dividerTop);
  ctx.lineTo(584, LANE.dividerBottom);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 249, 236, 0.42)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(581.3, LANE.dividerTop + 5);
  ctx.lineTo(581.3, LANE.dividerBottom - 5);
  ctx.stroke();

  // Rivets on the divider
  for (let y = 330; y < 1020; y += 86) {
    ctx.fillStyle = "rgba(61, 50, 37, 0.44)";
    ctx.beginPath();
    ctx.arc(584, y, 1.5, 0, TAU);
    ctx.fill();
  }

  // Lane top mouth marker
  ctx.strokeStyle = "rgba(111, 86, 55, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(611, 279, 23, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();

  ctx.fillStyle = "rgba(118, 92, 58, 0.35)";
  ctx.font = '700 6.5px "SFMono-Regular", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("LAUNCH", 611, 306);

  // Little down-guide arrow above the cup, only while idle
  if (game.phase === "idle" && game.gate < 0.05) {
    ctx.fillStyle = "rgba(116, 89, 52, 0.32)";
    ctx.font = '600 7px "PingFang SC", sans-serif';
    ctx.fillText("限位器", 611, 1037);
  }
}

function drawReturnRamp(now) {
  // Lower recess
  const lower = ctx.createLinearGradient(0, SLOT.floor, 0, 1180);
  lower.addColorStop(0, "rgba(91, 70, 45, 0.075)");
  lower.addColorStop(0.7, "rgba(91, 70, 45, 0.03)");
  lower.addColorStop(1, "rgba(91, 70, 45, 0.07)");
  ctx.fillStyle = lower;
  ctx.beginPath();
  ctx.moveTo(82, SLOT.floor);
  ctx.lineTo(INNER.right, SLOT.floor);
  ctx.lineTo(INNER.right, INNER.bottom);
  ctx.lineTo(82, INNER.bottom);
  ctx.closePath();
  ctx.fill();

  // Ramp substrate
  const rampGradient = ctx.createLinearGradient(0, RAMP.y0, 0, RAMP.y1 + 22);
  rampGradient.addColorStop(0, "rgba(255, 250, 238, 0.25)");
  rampGradient.addColorStop(1, "rgba(113, 87, 54, 0.08)");
  ctx.fillStyle = rampGradient;
  ctx.beginPath();
  ctx.moveTo(88, 1005);
  ctx.lineTo(RAMP.x0, RAMP.y0);
  ctx.lineTo(RAMP.x1, RAMP.y1);
  ctx.lineTo(INNER.right, RAMP.y1 + 18);
  ctx.lineTo(INNER.right, 1140);
  ctx.lineTo(88, 1140);
  ctx.closePath();
  ctx.fill();

  // Directional hatch marks under the ramp
  ctx.save();
  ctx.strokeStyle = "rgba(104, 79, 48, 0.11)";
  ctx.lineWidth = 1;
  for (let x = 122; x < 540; x += 33) {
    const y = lerp(RAMP.y0, RAMP.y1, (x - RAMP.x0) / (RAMP.x1 - RAMP.x0));
    ctx.beginPath();
    ctx.moveTo(x, y + 15);
    ctx.lineTo(x + 15, y + 4);
    ctx.stroke();
  }
  ctx.restore();

  // Return rail
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(70, 57, 41, 0.61)";
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(RAMP.x0, RAMP.y0);
  ctx.quadraticCurveTo(360, 1066, RAMP.x1, RAMP.y1);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 249, 237, 0.48)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(RAMP.x0, RAMP.y0 - 2);
  ctx.quadraticCurveTo(360, 1064, RAMP.x1, RAMP.y1 - 2);
  ctx.stroke();
  ctx.restore();

  // Ramp chevrons
  ctx.fillStyle = "rgba(117, 89, 52, 0.26)";
  ctx.font = '700 7px "SFMono-Regular", monospace';
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("RETURN", 114, 1096);
  ctx.fillStyle = "rgba(117, 89, 52, 0.2)";
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(183 + i * 16, 1088);
    ctx.lineTo(191 + i * 16, 1096);
    ctx.lineTo(183 + i * 16, 1104);
    ctx.strokeStyle = "rgba(117, 89, 52, 0.2)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Gate / limiter assembly
  const gateOpen = easeInOutCubic(game.gate);
  const gateY = GATE.y;
  const leftX = 586;
  const rightX = 637;

  ctx.save();
  ctx.translate(0, 0);
  ctx.lineCap = "round";

  // Mounting blocks
  ctx.fillStyle = "rgba(78, 65, 49, 0.55)";
  roundRect(leftX - 4, gateY - 8, 11, 17, 3);
  ctx.fill();
  roundRect(rightX - 7, gateY - 8, 11, 17, 3);
  ctx.fill();

  // Gate arms swing open
  ctx.strokeStyle = "rgba(79, 65, 47, 0.75)";
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(leftX, gateY);
  ctx.lineTo(lerp(leftX + 4, leftX + 2, gateOpen), gateY + 2 + gateOpen * 24);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rightX, gateY);
  ctx.lineTo(lerp(rightX - 4, rightX - 2, gateOpen), gateY + 2 + gateOpen * 24);
  ctx.stroke();

  // Cross bar: closed is horizontal, open retracts to the sides
  const barHalf = 24 * (1 - gateOpen);
  ctx.strokeStyle = "rgba(60, 49, 36, 0.82)";
  ctx.lineWidth = 4;
  if (barHalf > 0.5) {
    ctx.beginPath();
    ctx.moveTo(610 - barHalf, gateY);
    ctx.lineTo(610 + barHalf, gateY);
    ctx.stroke();
  }

  // Two small indicator lights on the gate
  ctx.fillStyle = game.phase === "ready" || game.phase === "charging" ? "#a72b20" : "#5d4e3b";
  ctx.beginPath();
  ctx.arc(588, gateY + 10, 2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(92, 75, 53, 0.5)";
  ctx.beginPath();
  ctx.arc(634, gateY + 10, 2, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function drawSpring(now) {
  const isReady = game.phase === "ready" || game.phase === "charging";
  const charge = game.phase === "charging" ? game.charge : 0;
  const release = game.springRelease;
  let visualCharge = charge;

  if (release) {
    const age = (now - release.at) / 1000;
    if (age < 0.24) visualCharge = release.power * (1 - easeOutCubic(clamp(age / 0.24, 0, 1)));
    else game.springRelease = null;
  }

  const headY = 1136 + visualCharge * 42;
  const handleY = SPRING.baseHandleY + visualCharge * 24;
  const rodTop = headY + 4;
  const rodBottom = handleY - 10;

  ctx.save();

  // Cup / launch cradle
  ctx.strokeStyle = "rgba(74, 60, 43, 0.68)";
  ctx.lineWidth = 3.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(610, 1123, 14, Math.PI * 0.15, Math.PI * 0.85, true);
  ctx.stroke();
  ctx.fillStyle = "rgba(74, 60, 43, 0.24)";
  ctx.beginPath();
  ctx.ellipse(610, 1136, 18, 3, 0, 0, TAU);
  ctx.fill();

  // Plunger rod
  ctx.strokeStyle = "rgba(66, 56, 43, 0.74)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(610, rodTop);
  ctx.lineTo(610, rodBottom);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 247, 230, 0.36)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(608, rodTop + 3);
  ctx.lineTo(608, rodBottom - 4);
  ctx.stroke();

  // Plunger head
  ctx.fillStyle = "#8d806b";
  roundRect(595, headY - 4, 30, 7, 3.5);
  ctx.fill();
  ctx.strokeStyle = "rgba(53, 42, 29, 0.52)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Coil spring
  const coils = Math.max(5, Math.round((handleY - headY - 15) / 7));
  const springBottom = handleY - 11;
  ctx.strokeStyle = "rgba(78, 66, 50, 0.65)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let i = 0; i <= coils * 2; i += 1) {
    const t = i / (coils * 2);
    const y = lerp(headY + 3, springBottom, t);
    const x = 610 + (i % 2 === 0 ? -11 : 11) * (1 - Math.abs(t - 0.5) * 0.14);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 249, 236, 0.28)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 0; i <= coils * 2; i += 1) {
    const t = i / (coils * 2);
    const y = lerp(headY + 3, springBottom, t) - 1.1;
    const x = 610 + (i % 2 === 0 ? -11 : 11) * (1 - Math.abs(t - 0.5) * 0.14);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Handle knob
  const knobY = handleY;
  const knobGrad = ctx.createRadialGradient(604, knobY - 8, 2, 610, knobY, 25);
  knobGrad.addColorStop(0, "#d7cab2");
  knobGrad.addColorStop(0.58, "#8c7e69");
  knobGrad.addColorStop(1, "#4d4234");
  ctx.fillStyle = knobGrad;
  ctx.beginPath();
  ctx.arc(610, knobY, 22, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(51, 42, 30, 0.65)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.strokeStyle = "rgba(50, 41, 30, 0.35)";
  ctx.lineWidth = 1.2;
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.moveTo(595, knobY - 6 + i * 6);
    ctx.lineTo(625, knobY - 6 + i * 6);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255, 248, 231, 0.4)";
  ctx.beginPath();
  ctx.arc(602, knobY - 9, 4.4, 0, TAU);
  ctx.fill();

  if (game.phase === "charging") {
    const zone = getPowerInfo(game.charge).key;
    const zoneColor =
      zone === "weak" ? "#8dbb9b" : zone === "mid" ? "#e7b566" : zone === "strong" ? "#e9874e" : "#ff7658";
    ctx.strokeStyle = "rgba(244, 236, 220, 0.14)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(610, knobY, 31, -Math.PI / 2, -Math.PI / 2 + TAU);
    ctx.stroke();
    ctx.save();
    ctx.strokeStyle = zoneColor;
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.shadowColor = zoneColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(610, knobY, 31, -Math.PI / 2, -Math.PI / 2 + TAU * game.charge);
    ctx.stroke();
    ctx.restore();

    // Local readout stays above the finger while the gauge in the dock may be
    // covered by the thumb during a downward drag.
    const pct = Math.round(game.charge * 100);
    roundRect(610 - 43, knobY - 78, 86, 30, 15);
    ctx.fillStyle = "rgba(19, 14, 9, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(231, 181, 102, 0.24)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = zoneColor;
    ctx.font = '800 16px "SFMono-Regular", "DIN Alternate", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${pct}%`, 610, knobY - 63);
  }

  // Ready-state tactile invitation
  if (isReady) {
    const pulse = 0.5 + Math.sin(now * 0.006) * 0.5;
    ctx.strokeStyle = `rgba(221, 59, 44, ${0.22 + pulse * 0.45})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(610, knobY, 30 + pulse * 5, 0, TAU);
    ctx.stroke();

    if (game.phase === "ready") {
      ctx.fillStyle = "rgba(118, 49, 36, 0.82)";
      ctx.font = '750 13px "PingFang SC", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("拉", 566, knobY - 17);
      ctx.font = '700 17px "PingFang SC", sans-serif';
      ctx.fillText("↓", 566, knobY + 2);

      ctx.strokeStyle = "rgba(221, 59, 44, 0.35)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(610, knobY + 29);
      ctx.lineTo(610, knobY + 39);
      ctx.moveTo(606, knobY + 35);
      ctx.lineTo(610, knobY + 39);
      ctx.lineTo(614, knobY + 35);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/* ── Render: ball & particles ────────────────────────────── */

function getBallDrawPosition(now) {
  if (game.phase === "returning" && game.returnPos) {
    return { x: game.returnPos.x, y: game.returnPos.y, returning: true };
  }
  return { x: ball.x, y: ball.y, returning: false };
}

function traceStar(context, x, y, outer, inner, points = 4, rotation = 0) {
  context.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = rotation + (Math.PI * i) / points - Math.PI / 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

/** Speed trail. Every skin picks its own style, colour and lifetime. */
function drawBallTrail(now, skin, speed) {
  const spec = skin.trail;
  if (speed <= 380 || ball.trail.length < 2) return;

  ctx.save();
  if (spec.style === "ribbon") {
    const points = ball.trail.filter((point) => now - point.time <= spec.life);
    if (points.length > 1) {
      ctx.strokeStyle = `rgba(${spec.color}, ${spec.alpha})`;
      ctx.lineWidth = spec.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        const previous = points[i - 1];
        const current = points[i];
        ctx.quadraticCurveTo(
          previous.x,
          previous.y,
          (previous.x + current.x) / 2,
          (previous.y + current.y) / 2,
        );
      }
      ctx.stroke();
    }
  } else if (spec.style === "streak") {
    ctx.lineCap = "round";
    for (let i = 1; i < ball.trail.length; i += 1) {
      const previous = ball.trail[i - 1];
      const current = ball.trail[i];
      const age = now - current.time;
      if (age > spec.life) continue;
      const t = 1 - age / spec.life;
      ctx.strokeStyle = `rgba(${spec.color}, ${t * spec.alpha})`;
      ctx.lineWidth = spec.width * (0.35 + t * 0.65);
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
    }
  } else {
    ball.trail.forEach((point, index) => {
      const age = now - point.time;
      if (age > spec.life) return;
      const t = 1 - age / spec.life;
      if (spec.style === "sparkle") {
        const size = 1.1 + t * 2.4;
        ctx.globalAlpha = t * 0.9;
        ctx.fillStyle = index % 3 === 0 ? spec.accent : `rgb(${spec.color})`;
        traceStar(ctx, point.x, point.y, size, size * 0.32, 4, index * 0.9);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (spec.style === "bubble") {
        ctx.strokeStyle = `rgba(${spec.color}, ${t * spec.alpha * 1.6})`;
        ctx.lineWidth = spec.width;
        ctx.beginPath();
        ctx.arc(point.x, point.y, BALL_R * (spec.size + t * 0.3), 0, TAU);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(${spec.color}, ${t * spec.alpha})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, BALL_R * (spec.size + t * 0.3), 0, TAU);
        ctx.fill();
      }
    });
  }
  ctx.restore();
}

/** Per-skin surface pattern, clipped inside the marble. */
function drawBallPattern(skin, x, y) {
  const { pattern, patternColor } = skin.ball;
  if (pattern === "none") return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, BALL_R, 0, TAU);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(ball.spin * 0.8);
  ctx.fillStyle = patternColor;
  ctx.strokeStyle = patternColor;

  if (pattern === "stripe") {
    ctx.fillRect(-BALL_R, -2.6, BALL_R * 2, 1.5);
    ctx.fillRect(-BALL_R, 1.2, BALL_R * 2, 1);
  } else if (pattern === "star") {
    traceStar(ctx, 0, 0, 5.2, 2, 4, 0);
    ctx.fill();
  } else if (pattern === "ring") {
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 5.4, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, 3.3, 0, TAU);
    ctx.stroke();
  } else if (pattern === "bolt") {
    ctx.lineWidth = 1.4;
    ctx.lineJoin = "miter";
    ctx.beginPath();
    ctx.moveTo(-5.4, -5.2);
    ctx.lineTo(0.8, -1.4);
    ctx.lineTo(-1.2, 0.8);
    ctx.lineTo(5.2, 5.2);
    ctx.stroke();
  } else if (pattern === "speck") {
    [
      [-2.8, -2.4, 1.15],
      [2.6, -1.8, 0.9],
      [1.9, 2.8, 1.05],
      [-2.2, 2.6, 0.75],
    ].forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    });
  } else if (pattern === "orbit") {
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, 4.6, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(4.6, 0, 1.5, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

/** Extra wager marbles are smaller and glow red/gold so they read as a
    separate, temporary stake rather than the main payout ball. */
function drawBonusBalls(now) {
  if (!bonusBalls.length) return;
  for (const b of bonusBalls) {
    for (let i = 1; i < b.trail.length; i += 1) {
      const previous = b.trail[i - 1];
      const current = b.trail[i];
      const age = now - current.time;
      if (age > 220) continue;
      const alpha = 1 - age / 220;
      ctx.strokeStyle = `rgba(246, 196, 83, ${alpha * 0.5})`;
      ctx.lineWidth = 2.4 * alpha;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const aura = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, 24);
    aura.addColorStop(0, "rgba(246, 196, 83, 0.55)");
    aura.addColorStop(0.45, "rgba(255, 59, 92, 0.2)");
    aura.addColorStop(1, "rgba(255, 59, 92, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 24, 0, TAU);
    ctx.fill();
    ctx.restore();

    const body = ctx.createRadialGradient(b.x - 2.4, b.y - 3, 0.5, b.x, b.y, b.r * 1.2);
    body.addColorStop(0, "#fff8df");
    body.addColorStop(0.3, "#f6c453");
    body.addColorStop(0.72, "#a51b38");
    body.addColorStop(1, "#2a030c");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 240, 190, 0.9)";
    ctx.lineWidth = 0.9;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 247, 218, 0.72)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 3.5, Math.PI * 0.1, Math.PI * 0.85);
    ctx.stroke();

    ctx.fillStyle = "#fff7db";
    ctx.font = '800 7px "SFMono-Regular", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("赌", b.x, b.y + 0.5);
  }
}

function drawBall(now) {
  if (ball.hidden) return;
  const pos = getBallDrawPosition(now);
  const speed = Math.hypot(ball.vx, ball.vy);
  const isFlying = game.phase === "flying" && game.landingResolved === false;
  const skin = equippedSkin();

  if (isFlying) drawBallTrail(now, skin, speed);

  ctx.save();

  // Contact shadow
  ctx.fillStyle = "rgba(54, 35, 18, 0.2)";
  ctx.beginPath();
  ctx.ellipse(pos.x + 2.5, pos.y + 10, 8, 3.2, 0, 0, TAU);
  ctx.fill();

  // Skin aura
  if (skin.ball.glow) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const aura = ctx.createRadialGradient(pos.x, pos.y, BALL_R * 0.5, pos.x, pos.y, BALL_R * 2.7);
    aura.addColorStop(0, skin.ball.glow);
    aura.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, BALL_R * 2.7, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // Ball body
  const grad = ctx.createRadialGradient(
    pos.x - 3.8,
    pos.y - 4.5,
    1,
    pos.x + 1,
    pos.y + 2,
    BALL_R * 1.25,
  );
  grad.addColorStop(0, skin.ball.inner);
  grad.addColorStop(0.28, skin.ball.mid);
  grad.addColorStop(0.72, skin.ball.deep);
  grad.addColorStop(1, skin.ball.dark);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, BALL_R, 0, TAU);
  ctx.fill();

  // Pattern follows the draw position without touching ball physics state.
  drawBallPattern(skin, pos.x, pos.y);

  ctx.strokeStyle = skin.ball.stroke;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, BALL_R, 0, TAU);
  ctx.stroke();

  // Rotating glint
  const glintX = pos.x - 3.3;
  const glintY = pos.y - 4;
  const glint = ctx.createRadialGradient(glintX, glintY, 0, glintX, glintY, 4.4);
  glint.addColorStop(0, "rgba(255, 250, 239, 0.9)");
  glint.addColorStop(1, "rgba(255, 240, 214, 0)");
  ctx.fillStyle = glint;
  ctx.beginPath();
  ctx.arc(glintX, glintY, 4.4, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 231, 194, 0.25)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, BALL_R - 1.8, ball.spin + Math.PI * 0.1, ball.spin + Math.PI * 0.8);
  ctx.stroke();

  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (const p of particles) {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    if (p.shape === "confetti") {
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.68);
      ctx.restore();
    } else if (p.shape === "star") {
      ctx.fillStyle = p.color;
      traceStar(
        ctx,
        p.x,
        p.y,
        p.size * (0.7 + alpha * 1.25),
        p.size * (0.26 + alpha * 0.48),
        4,
        p.rot || 0,
      );
      ctx.fill();
    } else if (p.shape === "bubble") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.7 + alpha * 0.95), 0, TAU);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.45 + alpha * 0.55), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawFocusGlow(now) {
  if (!game.flashSlot && game.flashSlot !== 0) return;
  const age = now - game.flashAt;
  if (age > 850) return;
  const centerX = SLOT.x0 + (game.flashSlot + 0.5) * SLOT.width;
  const alpha = Math.max(0, 1 - age / 850);
  const glow = ctx.createRadialGradient(centerX, 960, 4, centerX, 960, 125);
  glow.addColorStop(0, `rgba(255, 229, 161, ${0.28 * alpha})`);
  glow.addColorStop(0.45, `rgba(231, 181, 102, ${0.12 * alpha})`);
  glow.addColorStop(1, "rgba(231, 181, 102, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(centerX, 960, 125, 0, TAU);
  ctx.fill();
}

/* ── Render: master ──────────────────────────────────────── */

function draw(now) {
  ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
  ctx.clearRect(0, 0, W, H);

  ctx.save();
  if (game.shake > 0.01) {
    const amplitude = game.shake * 1.5;
    ctx.translate(randomRange(-amplitude, amplitude), randomRange(-amplitude, amplitude));
  }

  drawStaticLayer(now);
  if (activeTable.art === "cyberpunk") {
    drawCyberReturnRamp(ctx, now, game, activeTable);
    drawCyberSlots(ctx, now, game, activeTable);
    drawCyberMarquee(ctx, now, activeTable);
    drawCyberPegs(ctx, now, pegs, activeTable);
    drawObstacles(ctx, obstacles, now, activeTable.palette, { clipMainField: true });
    drawCyberLaunchLane(ctx, now, game, activeTable);
    drawCyberFocusGlow(ctx, now, game, activeTable);
  } else {
    drawReturnRamp(now);
    drawSlots(now);
    drawMarquee(now);
    drawPegField(now);
    drawTools(now);
    drawObstacles(ctx, obstacles, now, activeTable.palette, { clipMainField: true });
    drawLaunchLane(now);
    drawFocusGlow(now);
  }
  drawParticles();
  drawBonusBalls(now);
  drawBall(now);
  if (activeTable.art === "cyberpunk") drawCyberSpring(ctx, now, game, activeTable);
  else drawSpring(now);

  ctx.restore();

  // The payout tray is an overlay: draw it after releasing the board shake
  // so the tray itself stays rock steady while it fills.
  payoutFx.draw(now);
}

/* ── Update loop ─────────────────────────────────────────── */

let lastFrame = performance.now();

function update(now, dt) {
  // Moving cars, spinning rotors and portal cooldowns animate all the time,
  // not just while the marble is in flight.
  updateObstacles(obstacles, dt);

  // Gate easing
  if (Math.abs(game.gate - game.gateTarget) > 0.0001) {
    const speed = 4.8 * dt;
    game.gate += (game.gateTarget - game.gate) * Math.min(1, speed * 2.2);
    if (Math.abs(game.gate - game.gateTarget) < 0.004) game.gate = game.gateTarget;
  }

  // Drop from limiter to launch cup
  if (game.drop) {
    const u = clamp((now - game.drop.start) / game.drop.duration, 0, 1);
    if (now >= game.drop.start) {
      const eased = u * u * (1.2 - 0.2 * u);
      ball.x = CUP.x;
      ball.y = lerp(game.drop.fromY, game.drop.toY, eased);
      ball.vx = 0;
      ball.vy = 560;
    }
    if (u >= 1) {
      ball.y = CUP.y;
      ball.vx = 0;
      ball.vy = 0;
      game.drop = null;
    }
  }

  // Keyboard-driven charge
  if (game.phase === "charging" && game.chargeMode === "keyboard") {
    game.charge = clamp((now - game.keyboardChargeStart) / 1100, 0, 1);
    setPowerUI(game.charge, "charging");
    pulsePowerTick(game.charge);
  }

  // Main ball physics. While the abyss wheel is spinning the marble is held
  // inside the disc, so it neither falls nor re-triggers the sensor.
  if (game.phase === "flying" && !game.wheel.active && !ball.hidden) {
    let remaining = Math.min(dt, 0.033);
    let guard = 0;
    while (remaining > 0 && guard < 12) {
      const step = Math.min(PHYS_STEP, remaining);
      stepBallPhysics(ball, step);
      remaining -= step;
      guard += 1;

      // Track the moment the marble actually enters the peg chamber. The
      // vertical launch lane has no overhead hood: the dome does the turning.
      if (!game.leftLane && ball.x < MAIN_RIGHT - 1) {
        game.leftLane = true;
      }

      // A tiny automatic anti-stall brush keeps rare wedged balls moving.
      // Once the ball has reached a slot, leave it alone so the result view
      // shows a calm, settled marble.
      if (!game.landingResolved) {
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed < 18) {
          ball.stallTime += step;
        } else {
          ball.stallTime = 0;
        }
        if (ball.stallTime > 1.15) {
          ball.vx += randomRange(-120, 120);
          ball.vy -= 150;
          // Rail-pocket rescue: a ball that has settled against either rail
          // gets an extra inward nudge instead of grinding in the corner.
          if (ball.x < INNER.left + 26) ball.vx += 190;
          else if (ball.x > MAIN_RIGHT - 26) ball.vx -= 190;
          ball.stallTime = 0;
          game.shake = Math.min(1.1, game.shake + 0.2);
        }
      }
    }

    ball.spin += (ball.vx / ball.r) * (dt * 0.12);
    ball.trailClock += dt;
    if (Math.hypot(ball.vx, ball.vy) > 300 && ball.trailClock > 0.016) {
      ball.trailClock = 0;
      ball.trail.push({ x: ball.x, y: ball.y, time: now });
      if (ball.trail.length > 22) ball.trail.shift();
    }

    if (!game.landingResolved) {
      if (ball.x < MAIN_RIGHT && ball.y > SLOT.sensorY) {
        resolveLanding();
      } else if (ball.vy > 40 && ball.x > MAIN_RIGHT && ball.y > 1040) {
        // Safety net: a ball that cannot clear the lane falls back into the
        // launch cup. Treat that as a miss and leave the round aggregation to
        // the same finalizer used by normal landings.
        resolveMissedMain();
      } else if (now - game.flightStartedAt > 30000) {
        ball.x = randomRange(SLOT.x0 + 20, SLOT.x1 - 20);
        ball.y = SLOT.sensorY + 4;
        resolveLanding();
      }
    }
  }

  if (bonusBalls.length && game.phase !== "idle") {
    updateBonusBalls(now, dt);
  }

  // Return animation
  if (game.phase === "returning" && game.returnAnim) {
    const anim = game.returnAnim;
    const t = clamp((now - anim.start) / anim.duration, 0, 1);
    const startX = anim.fromX;
    const rampY = (x) => lerp(RAMP.y0, RAMP.y1, clamp((x - RAMP.x0) / (RAMP.x1 - RAMP.x0), 0, 1));

    if (t < 0.2) {
      const u = t / 0.2;
      const x = startX;
      const y = lerp(anim.fromY, rampY(startX), easeInCubic(u));
      game.returnPos = { x, y, angle: Math.PI * 2 * u };
    } else if (t < 0.84) {
      const u = (t - 0.2) / 0.64;
      const eased = easeInOutCubic(u);
      const x = lerp(startX, RAMP.x1 - 2, eased);
      const y = rampY(x) - 1.5;
      game.returnPos = { x, y, angle: Math.PI * 4 * eased };
    } else {
      const u = (t - 0.84) / 0.16;
      const eased = easeOutCubic(u);
      const x = lerp(RAMP.x1 - 2, STAGE.x, eased);
      const y = lerp(RAMP.y1 - 1.5, STAGE.y, eased);
      game.returnPos = { x, y, angle: Math.PI * 4 + Math.PI * 2 * eased };
    }
    if (t >= 1) finishReturn();
  }

  // Decay all decorative state
  for (const peg of pegs) peg.glow *= Math.pow(0.02, dt);
  for (const pad of activePads) pad.glow *= Math.pow(0.015, dt);
  for (const magnet of activeMagnets) magnet.pulse *= Math.pow(0.01, dt);
  payoutFx.update(now, dt);
  updateParticles(dt);
  game.shake *= Math.pow(0.001, dt);
  if (game.shake < 0.003) game.shake = 0;
}

function frame(now) {
  if (gameScreen?.hidden) {
    lastFrame = now;
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(0.033, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  update(now, dt);
  draw(now);
  requestAnimationFrame(frame);
}

/* ── Canvas resolution & layout ──────────────────────────── */

function rebuildStaticLayer() {
  if (!canvas.width || !canvas.height) return;
  const buffer = document.createElement("canvas");
  buffer.width = canvas.width;
  buffer.height = canvas.height;
  const bufferCtx = buffer.getContext("2d");
  bufferCtx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
  const previousCtx = ctx;
  ctx = bufferCtx;
  try {
    if (activeTable.art === "cyberpunk") drawCyberCabinet(ctx, performance.now(), activeTable);
    else drawCabinet(performance.now());
  } finally {
    ctx = previousCtx;
  }
  staticLayer = buffer;
}

function drawStaticLayer(now) {
  if (!staticLayer) {
    if (activeTable.art === "cyberpunk") drawCyberCabinet(ctx, now, activeTable);
    else drawCabinet(now);
    return;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(staticLayer, 0, 0);
  ctx.restore();
}

function fitMachine() {
  const rect = stageEl.getBoundingClientRect();
  const ratio = W / H;
  let height = rect.height;
  let width = height * ratio;
  if (width > rect.width) {
    width = rect.width;
    height = width / ratio;
  }
  width = Math.max(1, width);
  height = Math.max(1, height);
  machine.style.width = `${width}px`;
  machine.style.height = `${height}px`;

  // Match the backing store to the actual device pixels instead of always
  // rendering at a fixed 2×. On a phone this is close to a 1:1 pixel mapping,
  // which keeps the many gradients/shadows at a smooth frame rate while still
  // looking crisp on Retina displays.
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const desiredScale = clamp((width * dpr) / W, 1, 2);
  const pixelWidth = Math.round(W * desiredScale);
  const pixelHeight = Math.round(H * desiredScale);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvasScale = pixelWidth / W;
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
    rebuildStaticLayer();
  }
}

const resizeObserver = new ResizeObserver(fitMachine);
resizeObserver.observe(stageEl);
window.addEventListener("resize", fitMachine);
window.addEventListener("marble:game-shown", () => {
  requestAnimationFrame(() => {
    fitMachine();
    requestAnimationFrame(fitMachine);
  });
});

/* ── Input ───────────────────────────────────────────────── */

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * W,
    y: ((event.clientY - rect.top) / rect.height) * H,
  };
}

function isSpringHit(point) {
  const knobY = SPRING.baseHandleY + (game.phase === "charging" ? game.charge * 24 : 0);
  const inKnob = Math.hypot(point.x - SPRING.x, point.y - knobY) < 60;
  const inShaft = point.x > 508 && point.x < 706 && point.y > 960 && point.y < 1240;
  return inKnob || inShaft;
}

canvas.addEventListener(
  "pointerdown",
  (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target !== canvas) return;
    audio.init();

    if (payoutFx.canSkip()) {
      event.preventDefault();
      payoutFx.skip();
      return;
    }

    if (game.phase === "ready") {
      const point = canvasPoint(event);
      const springHit = isSpringHit(point);
      if (game.placingTool && !springHit) {
        event.preventDefault();
        attemptToolPlacement(point);
        return;
      }
      if (springHit) {
        event.preventDefault();
        if (game.placingTool) clearToolPlacement(false);
        game.pointerId = event.pointerId;
        canvas.setPointerCapture?.(event.pointerId);
        beginCharge("pointer", point.y, event.clientY);
      } else {
        toast(game.placingTool ? "请点击机台放置机关" : "先点下方机关布阵，或直接拉下弹簧");
        if (!game.placingTool) showHint("先点下方机关布阵，或直接拉下弹簧", 2200);
      }
    }
  },
  { passive: false },
);

canvas.addEventListener(
  "pointermove",
  (event) => {
    if (game.phase !== "charging" || game.pointerId !== event.pointerId) return;
    event.preventDefault();
    updateChargeFromPointer(event.clientY);
  },
  { passive: false },
);

canvas.addEventListener(
  "pointerup",
  (event) => {
    if (game.pointerId !== event.pointerId) return;
    event.preventDefault();
    releaseCharge(false);
  },
  { passive: false },
);

canvas.addEventListener("pointercancel", (event) => {
  if (game.pointerId !== event.pointerId) return;
  releaseCharge(true);
});

window.addEventListener("pointerup", (event) => {
  if (game.pointerId !== null && game.pointerId === event.pointerId) {
    releaseCharge(false);
  }
});

window.addEventListener("keydown", (event) => {
  if (gameScreen?.hidden) return;
  const target = event.target;
  const isTextInput =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  const isButton = target instanceof HTMLButtonElement;

  if (event.code === "Space" && !isTextInput && !workshopDialog.open) {
    if (game.phase === "ready") {
      event.preventDefault();
      audio.init();
      beginCharge("keyboard");
    } else if (game.phase === "charging" && game.chargeMode === "keyboard") {
      event.preventDefault();
    }
  }

  if (
    event.code === "Enter" &&
    !isTextInput &&
    !isButton &&
    !helpDialog.open &&
    !workshopDialog.open &&
    game.phase === "idle"
  ) {
    startRound();
  }
});

window.addEventListener("keyup", (event) => {
  if (gameScreen?.hidden) return;
  if (event.code === "Space" && game.phase === "charging" && game.chargeMode === "keyboard") {
    event.preventDefault();
    releaseKeyboardCharge();
  }
});

/* ── UI event wiring ─────────────────────────────────────── */

function setBet(value, announce = false) {
  if (game.phase !== "idle") return;
  const maxBet = Math.max(5, Math.min(99, game.marbles));
  const next = clamp(Math.round(Number(value) || 5), 5, maxBet);
  game.bet = next;
  account.setBet(next);
  updateBetUI();
  // setBet is persisted through the account store.
}

betMinus.addEventListener("click", () => {
  audio.init();
  audio.click();
  setBet(game.bet - 1, true);
});

betPlus.addEventListener("click", () => {
  audio.init();
  audio.click();
  setBet(game.bet + 1, true);
});

betInput.addEventListener("change", () => {
  setBet(betInput.value, true);
});

betInput.addEventListener("blur", () => {
  setBet(betInput.value, true);
});

betInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    setBet(betInput.value, true);
    betInput.blur();
  }
});

quickRow.querySelectorAll("[data-bet]").forEach((button) => {
  button.addEventListener("click", () => {
    audio.init();
    audio.click();
    setBet(Number(button.dataset.bet), true);
  });
});

startBtn.addEventListener("click", () => {
  startRound();
});

magnetToolBtn.addEventListener("click", () => {
  audio.init();
  armTool("magnet");
});

padToolBtn.addEventListener("click", () => {
  audio.init();
  armTool("pad");
});

toolSkipBtn.addEventListener("click", () => {
  audio.init();
  clearToolPlacement(true);
});

workshopClose.addEventListener("click", closeWorkshop);
workshopDialog.addEventListener("click", (event) => {
  if (event.target === workshopDialog) closeWorkshop();
});
wsTabs.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-ws-tab]");
  if (tab) setWorkshopTab(tab.dataset.wsTab);
});
wsSkillsPanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-skill]");
  if (button) upgradeSkill(button.dataset.skill);
});
wsShopPanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-shop]");
  if (button) buyShopItem(button.dataset.shop);
});

refillBtn.addEventListener("click", () => {
  audio.init();
  handleLowFunds();
});

homeBtn.addEventListener("click", () => {
  audio.init();
  audio.click();
  if (game.phase !== "idle") {
    toast("本局结束后再返回主界面");
    return;
  }
  window.dispatchEvent(new CustomEvent("marble:home"));
});

helpBtn.addEventListener("click", () => {
  audio.init();
  audio.click();
  if (typeof helpDialog.showModal === "function") helpDialog.showModal();
  else helpDialog.setAttribute("open", "");
});

function closeHelp() {
  if (typeof helpDialog.close === "function") helpDialog.close();
  else helpDialog.removeAttribute("open");
}

helpClose.addEventListener("click", closeHelp);
helpDone.addEventListener("click", closeHelp);
helpDialog.addEventListener("click", (event) => {
  if (event.target === helpDialog) closeHelp();
});

resetBtn.addEventListener("click", () => {
  const confirmed = window.confirm("重置本地存档？弹珠将回到 300 颗，游戏币、彩票、母球皮肤、机台和设置都会清空。");
  if (!confirmed) return;
  account.reset();
  closeHelp();
  window.location.reload();
});

// Tap the canvas anywhere after settling is ignored, but pointerup outside is
// still handled so a dragged spring cannot stay stuck.
window.addEventListener("blur", () => {
  if (game.phase === "charging" && game.chargeMode === "pointer") {
    releaseCharge(true);
  }
});

// Do not leave the pouring rumble running in a background tab.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) audio.payoutPourStop();
});

/* ── Debug API (handy for QA, harmless in production) ─────── */

function snapshot() {
  return {
    phase: game.phase,
    table: activeTable.id,
    tableName: activeTable.name,
    obstacles: obstacles.map((obstacle) => ({
      type: obstacle.type,
      x: Math.round(obstacle.x ?? obstacle.a?.x ?? 0),
      y: Math.round(obstacle.y ?? obstacle.a?.y ?? 0),
      angle: obstacle.angle !== undefined ? Number(obstacle.angle.toFixed(2)) : undefined,
      omega: obstacle.omega !== undefined ? Number(obstacle.omega.toFixed(2)) : undefined,
      progress: obstacle.progress !== undefined ? Number(obstacle.progress.toFixed(1)) : undefined,
    })),
    marbles: game.marbles,
    tickets: game.tickets,
    bet: game.bet,
    round: game.round,
    multiplier: game.multiplier,
    slotCount: game.slotCount,
    litSlots: [...game.litSlots],
    result: game.result ? { ...game.result } : null,
    ball: { x: Math.round(ball.x), y: Math.round(ball.y), vx: Math.round(ball.vx), vy: Math.round(ball.vy) },
    gate: game.gate,
    leftLane: game.leftLane,
    landingResolved: game.landingResolved,
    progress: {
      level: game.progress.level,
      xp: game.progress.xp,
      skillPoints: game.progress.skillPoints,
      skills: { ...game.progress.skills },
      inventory: { ...game.progress.inventory },
    },
    toolAvailable: { ...game.toolAvailable },
    toolPlaced: { ...game.toolPlaced },
    placingTool: game.placingTool,
    toolScore: game.toolScore,
    activeMagnets: activeMagnets.map((magnet) => ({
      x: Math.round(magnet.x),
      y: Math.round(magnet.y),
      energy: Number(magnet.energy.toFixed(2)),
    })),
    activePads: activePads.map((pad) => ({
      x: Math.round(pad.x),
      y: Math.round(pad.y),
      hits: pad.hits,
    })),
    litRevealDone: game.litReveal.size
      ? performance.now() >= Math.max(...game.litReveal.values())
      : true,
    wheel: {
      active: game.wheel.active,
      spinning: game.wheel.spinning,
      sectorIndex: game.wheel.sectorIndex,
      outcome: game.wheel.outcome,
      spins: game.wheelSpins,
      tickets: game.wheelTickets,
      mainDestroyed: game.mainDestroyed,
      bonusPayout: game.bonusPayout,
      bonusTickets: game.bonusTickets,
      bonusBalls: bonusBalls.length,
      mainResolved: game.mainResolved,
    },
    bonusBalls: bonusBalls.map((b) => ({
      x: Math.round(b.x),
      y: Math.round(b.y),
      vx: Math.round(b.vx),
      vy: Math.round(b.vy),
    })),
    payout: payoutFx.snapshot(),
  };
}

function simulateLaunch(power = 0.8) {
  const b = {
    x: CUP.x + 2,
    y: CUP.y - 2,
    prevX: CUP.x + 2,
    prevY: CUP.y - 2,
    vx: randomRange(-(activeTable.layout.launchJitter || 0), activeTable.layout.launchJitter || 0),
    vy: -launchSpeed(power),
    r: BALL_R,
    spin: 0,
    silent: true,
    trail: [],
  };
  let leftLane = false;
  let bestY = b.y;
  const totalSteps = 240 * 28;
  resetObstacles(obstacles);
  randomizeObstacles(obstacles);
  for (let i = 0; i < totalSteps; i += 1) {
    updateObstacles(obstacles, 1 / 240);
    stepBallPhysics(b, 1 / 240);
    bestY = Math.min(bestY, b.y);
    if (!leftLane && b.x < MAIN_RIGHT - 1) leftLane = true;
    if (b.x < MAIN_RIGHT && b.y > SLOT.sensorY) {
      return {
        slot: getSlotIndex(b.x),
        time: i / 240,
        bestY,
        leftLane,
        fellBack: false,
      };
    }
    if (b.vy > 40 && b.x > MAIN_RIGHT && b.y > 1040) {
      return { slot: null, time: i / 240, bestY, leftLane, fellBack: true };
    }
    const speed = Math.hypot(b.vx, b.vy);
    if (speed < 15) {
      b.stallTime = (b.stallTime || 0) + 1 / 240;
      if (b.stallTime > 1.2) {
        b.vx += randomRange(-110, 110);
        b.vy -= 150;
        b.stallTime = 0;
      }
    } else {
      b.stallTime = 0;
    }
  }
  return { slot: null, time: 28, bestY, leftLane, fellBack: false, timedOut: true };
}

function debugTrace(power = 0.8, sampleEvery = 15) {
  const b = {
    x: CUP.x + 2,
    y: CUP.y - 2,
    prevX: CUP.x + 2,
    prevY: CUP.y - 2,
    vx: randomRange(-(activeTable.layout.launchJitter || 0), activeTable.layout.launchJitter || 0),
    vy: -launchSpeed(power),
    r: BALL_R,
    spin: 0,
    silent: true,
    trail: [],
  };
  const points = [];
  let leftLane = false;
  resetObstacles(obstacles);
  randomizeObstacles(obstacles);
  for (let i = 0; i < 240 * 20; i += 1) {
    updateObstacles(obstacles, 1 / 240);
    stepBallPhysics(b, 1 / 240);
    if (!leftLane && b.x < MAIN_RIGHT - 1) leftLane = true;
    if (i % sampleEvery === 0) {
      points.push({
        t: +(i / 240).toFixed(2),
        x: Math.round(b.x),
        y: Math.round(b.y),
        vx: Math.round(b.vx),
        vy: Math.round(b.vy),
      });
    }
    if (b.x < MAIN_RIGHT && b.y > SLOT.sensorY) {
      return { slot: getSlotIndex(b.x), leftLane, points };
    }
    if (b.vy > 40 && b.x > MAIN_RIGHT && b.y > 1040) {
      return { slot: null, leftLane, fellBack: true, points };
    }
  }
  return { slot: null, leftLane, points };
}

function debugSimulate(count = 100, power = 0.8) {
  const bins = Array(SLOT.count).fill(0);
  let misses = 0;
  let fellBack = 0;
  let timeouts = 0;
  let minY = Infinity;
  let maxTime = 0;
  let apexHits = 0;
  let worstBestY = 0;
  for (let i = 0; i < count; i += 1) {
    const result = simulateLaunch(power);
    if (result.bestY < 70) apexHits += 1;
    worstBestY = Math.max(worstBestY, Math.round(result.bestY));
    if (result.slot === null) {
      if (result.fellBack) fellBack += 1;
      else timeouts += 1;
      misses += 1;
    } else {
      bins[result.slot] += 1;
    }
    minY = Math.min(minY, result.bestY);
    maxTime = Math.max(maxTime, result.time);
  }
  return {
    count,
    power,
    bins,
    misses,
    fellBack,
    timeouts,
    minY: Math.round(minY),
    maxTime: Number(maxTime.toFixed(2)),
    apexHits,
    apexRate: Number((apexHits / count).toFixed(2)),
    worstBestY,
  };
}

/** QA helper: play the payout tray animation with an arbitrary count. */
function debugPayout(total = 120) {
  audio.init();
  const count = clamp(Math.round(Number(total) || 0), 1, 990);
  payoutFx.stop();
  return payoutFx.start({ total: count, delay: 160 });
}

/** QA helper: settle the next round into a chosen slot so the win flow
    (including the payout animation and result card) can be inspected. */
function debugLanding(slotIndex = 0) {
  audio.init();
  const slot = clamp(Math.round(Number(slotIndex) || 0), 0, SLOT.count - 1);
  const drop = () => {
    if (game.phase !== "ready" && game.phase !== "flying") return false;
    if (game.phase === "flying" && game.wheel.active) return false;
    game.litSlots = new Set([slot]);
    game.litReveal = new Map([[slot, 0]]);
    game.phase = "flying";
    game.landingResolved = false;
    game.leftLane = true;
    game.flightStartedAt = performance.now();
    ball.x = SLOT.x0 + (slot + 0.5) * SLOT.width;
    ball.y = SLOT.sensorY + 2;
    ball.prevX = ball.x;
    ball.prevY = ball.y;
    ball.vx = 0;
    ball.vy = 240;
    ball.trail.length = 0;
    setPhase("flying");
    setRoundBadge("live", "开奖");
    setPlayStatus("调试落点", `槽位 ${slot + 1}`, true);
    return true;
  };
  if (game.phase === "ready" || game.phase === "flying") return drop();
  if (game.phase !== "idle") return false;
  startRound();
  window.setTimeout(drop, 1900);
  return true;
}

/** QA helper: force the abyss wheel. `kind` may be boost / lose / add /
    destroy; passing nothing picks a random sector. */
function debugWheel(kind = null) {
  if (activeTable.id !== "abyss") return false;
  if (game.phase === "idle") {
    startRound();
    window.setTimeout(() => debugWheel(kind), 1900);
    return true;
  }
  if (game.phase !== "ready" && game.phase !== "flying") return false;
  if (game.wheel.active || game.landingResolved) return false;
  if (game.phase === "ready") {
    game.phase = "flying";
    game.landingResolved = false;
    game.flightStartedAt = performance.now();
    setPhase("flying");
    ball.hidden = false;
  }
  const wheel = findWheelObstacle();
  if (!wheel) return false;
  let forcedIndex = null;
  if (kind) {
    const found = wheel.sectors.findIndex((sector) => sector.kind === kind);
    if (found >= 0) forcedIndex = found;
  }
  startAbyssWheel({ wheelId: wheel.id, x: wheel.x, y: wheel.y }, forcedIndex);
  return true;
}

/** QA helper: switch tables without going through the shop. */
function debugTable(id) {
  if (!getTable(id) || getTable(id).id !== id) return false;
  if (activeTable.id === id) return true;
  if (game.phase !== "idle") return false;
  applyTable(id);
  return activeTable.id === id;
}

window.__MARBLE_DROP__ = {
  snapshot,
  simulate: debugSimulate,
  simulateOne: simulateLaunch,
  trace: debugTrace,
  payout: debugPayout,
  landing: debugLanding,
  wheel: debugWheel,
  table: debugTable,
  get tables() {
    return TABLE_LIST.map((table) => table.id);
  },
  get activeTable() {
    return activeTable.id;
  },
};

/* ── Init ────────────────────────────────────────────────── */

function initUI() {
  marbleCountEl.textContent = String(game.marbles);
  ticketCountEl.textContent = String(game.tickets);
  dockBalanceEl.textContent = String(game.marbles);
  updateBetUI();
  setPhase("idle");
  setPowerUI(0, "ready");
  updateLevelBadge();
  setRoundBadge("ready", "等待投珠");
  setPlayStatus("等待投珠", "选择投入后开始", false);
  // Keep idle play dock hidden, but its markup shows the intended state for QA.
  dockPlay.hidden = true;
  fitMachine();
  requestAnimationFrame(fitMachine);
}

initUI();
lastFrame = performance.now();
requestAnimationFrame(frame);

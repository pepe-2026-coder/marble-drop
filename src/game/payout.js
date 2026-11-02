/* ============================================================
   中奖吐珠 · payout tray
   A self-contained miniature physics scene layered over the board.
   The exact payout number of marbles pours out of a brass chute and
   falls into a wooden tray: they bounce off the tray walls, knock
   into each other, settle into a pile and then the tray fades away
   so the normal result card can take over.

   The tray grows with the payout so a 40-marble win still reads as a
   little heap instead of a thin row lost inside a huge box.
   ============================================================ */

import { W, H, INNER, TAU } from "./config.js";
import { clamp, randomRange, easeOutCubic } from "./utils.js";
import { audio, vibrate } from "../audio.js";

const WALL = 18;
const INNER_BOTTOM = 992;
const OUTER_BOTTOM = INNER_BOTTOM + 16;
const MIN_INNER_HEIGHT = 150;
const MAX_INNER_HEIGHT = 288;
const GRAVITY = 1750;
const STEP = 1 / 120;
const MAX_STEP = 1 / 12;
const MAX_SPEED = 900;
const SLEEP_SPEED = 26;
const SLEEP_TIME = 0.18;
const PLATE_HEIGHT = 78;

const MARBLE_STYLES = [
  { inner: "#fffaf0", mid: "#f3dfb6", deep: "#c9a267", dark: "#8a6230", rim: "rgba(96, 66, 30, 0.5)" },
  { inner: "#ffe9c2", mid: "#f0b163", deep: "#c2752c", dark: "#7c4216", rim: "rgba(103, 55, 16, 0.52)" },
  { inner: "#ffe1d4", mid: "#ef8070", deep: "#c5332a", dark: "#74130d", rim: "rgba(96, 20, 13, 0.55)" },
  { inner: "#f6ffea", mid: "#bcd98e", deep: "#6f9f50", dark: "#3c6029", rim: "rgba(43, 70, 27, 0.5)" },
  { inner: "#fff3c8", mid: "#f4cf68", deep: "#c99a2d", dark: "#7c590f", rim: "rgba(92, 63, 11, 0.55)" },
  { inner: "#efe9ff", mid: "#b4a6da", deep: "#7a66a8", dark: "#453269", rim: "rgba(55, 40, 90, 0.5)" },
];

const SPRITE_SIZE = 56;

function createMarbleSprite(style) {
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const c = canvas.getContext("2d");
  const cx = SPRITE_SIZE / 2;
  const cy = SPRITE_SIZE / 2;
  const r = SPRITE_SIZE / 2 - 3;

  const body = c.createRadialGradient(
    cx - r * 0.36,
    cy - r * 0.42,
    r * 0.08,
    cx + r * 0.1,
    cy + r * 0.16,
    r * 1.06,
  );
  body.addColorStop(0, style.inner);
  body.addColorStop(0.28, style.mid);
  body.addColorStop(0.7, style.deep);
  body.addColorStop(1, style.dark);
  c.fillStyle = body;
  c.beginPath();
  c.arc(cx, cy, r, 0, TAU);
  c.fill();

  c.strokeStyle = style.rim;
  c.lineWidth = 1.6;
  c.stroke();

  // Secondary glass reflection along the lower rim.
  c.strokeStyle = "rgba(255, 246, 224, 0.22)";
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(cx, cy, r * 0.74, Math.PI * 0.18, Math.PI * 0.52);
  c.stroke();

  // Specular highlight.
  const glint = c.createRadialGradient(
    cx - r * 0.4,
    cy - r * 0.44,
    0,
    cx - r * 0.4,
    cy - r * 0.44,
    r * 0.52,
  );
  glint.addColorStop(0, "rgba(255, 253, 247, 0.96)");
  glint.addColorStop(0.55, "rgba(255, 246, 226, 0.38)");
  glint.addColorStop(1, "rgba(255, 244, 218, 0)");
  c.fillStyle = glint;
  c.beginPath();
  c.arc(cx - r * 0.4, cy - r * 0.44, r * 0.52, 0, TAU);
  c.fill();

  return canvas;
}

function createMarbleSprites() {
  return MARBLE_STYLES.map(createMarbleSprite);
}

/* Bigger marbles for small payouts, smaller ones for the 990-marble
   jackpot, so the pile always stays inside the tray. */
function radiusForTotal(total) {
  if (total <= 60) return 10;
  if (total <= 120) return 8.6;
  if (total <= 200) return 7.6;
  if (total <= 300) return 6.8;
  if (total <= 450) return 6;
  if (total <= 650) return 5.4;
  return 4.85;
}

function widthForTotal(total) {
  if (total <= 20) return 170;
  if (total <= 60) return 250;
  if (total <= 120) return 300;
  if (total <= 200) return 340;
  if (total <= 300) return 380;
  if (total <= 450) return 420;
  if (total <= 650) return 460;
  return 500;
}

function computeGeometry(total) {
  const radius = radiusForTotal(total);
  const innerWidth = widthForTotal(total);
  const marbleArea = total * Math.pow(radius * 2, 2) * 0.9069;
  const innerHeight = clamp(marbleArea / (innerWidth * 0.5), MIN_INNER_HEIGHT, MAX_INNER_HEIGHT);
  const innerTop = INNER_BOTTOM - innerHeight;
  const rimY = innerTop - WALL;
  const spoutY = rimY - 44;
  const outerWidth = innerWidth + WALL * 2;
  const left = 360 - outerWidth / 2;
  const right = 360 + outerWidth / 2;
  return {
    radius,
    innerWidth,
    innerHeight,
    outerWidth,
    nozzles: clamp(Math.round(innerWidth / 42), 6, 12),
    tray: {
      left,
      right,
      rimY,
      bottom: OUTER_BOTTOM,
      spoutY,
      plateTop: spoutY - PLATE_HEIGHT - 18,
      plateWidth: clamp(innerWidth - 20, 190, 258),
    },
    box: {
      left: left + WALL,
      right: right - WALL,
      top: innerTop,
      bottom: INNER_BOTTOM,
    },
  };
}

function roundRectPath(c, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + radius, y);
  c.arcTo(x + w, y, x + w, y + h, radius);
  c.arcTo(x + w, y + h, x, y + h, radius);
  c.arcTo(x, y + h, x, y, radius);
  c.arcTo(x, y, x + w, y, radius);
  c.closePath();
}

function playfieldPath(c) {
  c.beginPath();
  c.moveTo(INNER.left, INNER.bottom);
  c.lineTo(INNER.left, INNER.cy);
  c.ellipse(INNER.cx, INNER.cy, INNER.rx, INNER.ry, 0, Math.PI, TAU, false);
  c.lineTo(INNER.right, INNER.bottom);
  c.closePath();
}

export class PayoutAnimation {
  constructor({ getCtx, getScale }) {
    this.getCtx = getCtx;
    this.getScale = getScale;
    this.sprites = createMarbleSprites();
    this.geometry = computeGeometry(60);

    this.active = false;
    this.phase = "idle"; // idle | wait | enter | pour | settle | exit
    this.total = 0;
    this.spawned = 0;
    this.landed = 0;
    this.radius = 6;
    this.alpha = 0;
    this.startedAt = 0;
    this.pourDuration = 1;
    this.spawnBudget = 0;
    this.exitAt = 0;
    this.exitStartedAt = 0;
    this.settleDeadline = 0;
    this.skipped = false;
    this.onComplete = null;
    this.marbles = [];
    this.awake = [];
    this.awakeGrid = new Map();
    this.staticGrid = new Map();
    this.cellSize = 14;
    this.gridOriginX = 0;
    this.gridOriginY = 0;
    this.nextId = 1;
    this.nozzleCursor = 0;
    this.frameImpact = null;
    this.sparks = [];
    this.pile = null;
    this.pileCtx = null;
    this.pileScale = 0;
    this.pileOriginX = 0;
    this.pileOriginY = 0;
    this.pileBoardW = 0;
    this.pileBoardH = 0;
    this.lastClinkAt = 0;
  }

  /* ── Lifecycle ─────────────────────────────────────────── */

  start({ total = 0, onComplete = null, delay = 380 } = {}) {
    const count = Math.max(0, Math.round(Number(total) || 0));
    if (!count) return false;
    this.stop();
    const now = performance.now();
    this.active = true;
    this.phase = "wait";
    this.total = count;
    this.spawned = 0;
    this.landed = 0;
    this.geometry = computeGeometry(count);
    this.radius = this.geometry.radius;
    this.cellSize = this.radius * 2 + 1.6;
    this.gridOriginX = this.geometry.box.left - 40;
    this.gridOriginY = this.geometry.box.top - 60;
    this.startedAt = now + Math.max(0, delay);
    this.pourDuration = clamp(0.5 + count * 0.009, 0.8, 4.4);
    this.spawnBudget = 0;
    this.exitAt = 0;
    this.exitStartedAt = 0;
    this.settleDeadline = 0;
    this.skipped = false;
    this.onComplete = onComplete;
    this.marbles = [];
    this.awake = [];
    this.awakeGrid = new Map();
    this.staticGrid = new Map();
    this.nextId = 1;
    this.sparks = [];
    this.frameImpact = null;
    this.lastClinkAt = 0;
    this.nozzleCursor = Math.floor(Math.random() * this.geometry.nozzles);
    this.alpha = 0;
    this.pile = null;
    this.pileCtx = null;
    this.pileScale = 0;
    return true;
  }

  /** Tear the scene down without firing the completion callback. */
  stop() {
    audio.payoutPourStop();
    this.active = false;
    this.phase = "idle";
    this.alpha = 0;
    this.onComplete = null;
    this.marbles = [];
    this.awake = [];
    this.sparks = [];
    this.awakeGrid.clear();
    this.staticGrid.clear();
    this.pile = null;
    this.pileCtx = null;
    this.pileScale = 0;
    this.frameImpact = null;
  }

  canSkip(now = performance.now()) {
    if (!this.active) return false;
    if (this.phase !== "pour" && this.phase !== "settle") return false;
    return now - this.startedAt > 700;
  }

  skip() {
    if (!this.canSkip()) return false;
    this.skipped = true;
    this.phase = "exit";
    this.exitStartedAt = performance.now();
    this.exitAt = 0;
    audio.payoutPourStop();
    return true;
  }

  /* ── Simulation ────────────────────────────────────────── */

  update(now, dt) {
    if (!this.active) return;
    if (now < this.startedAt) return;

    const elapsed = now - this.startedAt;
    this.#ensurePileLayer();

    if (this.phase === "wait") this.phase = "enter";

    if (this.phase === "enter") {
      this.alpha = clamp(elapsed / 240, 0, 1);
      if (this.alpha >= 1) {
        this.phase = "pour";
        this.alpha = 1;
        audio.payoutOpen();
        audio.payoutPourStart();
        vibrate([12, 36, 16]);
      }
    }

    if (this.phase === "pour" || this.phase === "settle") {
      if (this.spawned < this.total) {
        this.spawnBudget += dt * (this.total / this.pourDuration);
        let guard = 0;
        while (this.spawnBudget >= 1 && this.spawned < this.total && guard < 12) {
          this.spawnBudget -= 1;
          this.#spawnMarble();
          guard += 1;
        }
      }

      this.#stepPhysics(now, dt);

      if (this.phase === "pour" && this.spawned >= this.total) {
        this.phase = "settle";
        this.settleDeadline = now + 2400;
        audio.payoutPourStop();
      }

      if (this.phase === "settle" && !this.exitAt) {
        if (this.awake.length === 0) {
          this.exitAt = now + 340;
        } else if (now > this.settleDeadline) {
          this.#forceSettle();
          this.exitAt = now + 300;
        }
      }

      if (this.exitAt && now >= this.exitAt) this.#beginExit(now);
    }

    if (this.phase === "exit") {
      this.alpha = clamp(1 - (now - this.exitStartedAt) / 230, 0, 1);
      this.#stepPhysics(now, dt);
      if (this.alpha <= 0) {
        this.#complete();
        return;
      }
    }

    this.#updateSparks(dt);
  }

  #ensurePileLayer() {
    const scale = Math.max(1, this.getScale() || 1);
    if (this.pile && this.pileScale === scale) return;
    const tray = this.geometry.tray;
    const width = tray.right - tray.left + 28;
    const height = tray.bottom - tray.spoutY + 44;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const c = canvas.getContext("2d");
    this.pileOriginX = tray.left - 14;
    this.pileOriginY = tray.spoutY - 20;
    c.setTransform(
      scale,
      0,
      0,
      scale,
      -this.pileOriginX * scale,
      -this.pileOriginY * scale,
    );
    this.pile = canvas;
    this.pileCtx = c;
    this.pileScale = scale;
    this.pileBoardW = canvas.width / scale;
    this.pileBoardH = canvas.height / scale;
    for (const marble of this.marbles) {
      if (marble.asleep) this.#drawMarbleTo(c, marble);
    }
  }

  #spawnMarble() {
    const { box, tray, nozzles } = this.geometry;
    const innerLeft = box.left + 22;
    const innerRight = box.right - 22;
    this.nozzleCursor = (this.nozzleCursor + 1 + (Math.random() < 0.24 ? 1 : 0)) % nozzles;
    const nozzleX = innerLeft + (this.nozzleCursor / (nozzles - 1)) * (innerRight - innerLeft);
    const x = nozzleX + randomRange(-4, 4);
    const variant = Math.floor(Math.random() * this.sprites.length);
    const marble = {
      id: this.nextId,
      x,
      y: tray.spoutY + 24 + randomRange(0, 4),
      vx: (x - 360) * 0.36 + randomRange(-26, 26),
      vy: randomRange(70, 175),
      r: this.radius,
      variant,
      asleep: false,
      rest: 0,
    };
    this.nextId += 1;
    this.spawned += 1;
    this.marbles.push(marble);
    this.awake.push(marble);
  }

  #stepPhysics(now, dt) {
    let remaining = Math.min(Math.max(dt, 0), MAX_STEP);
    let guard = 0;
    this.frameImpact = null;
    while (remaining > 0 && guard < 8) {
      const step = Math.min(STEP, remaining);
      this.#substep(step, now);
      remaining -= step;
      guard += 1;
    }
    if (this.frameImpact) {
      const hit = this.frameImpact;
      this.frameImpact = null;
      this.#addSpark(hit.x, hit.y, clamp(hit.value / 900, 0.1, 1));
      audio.marbleHit(clamp(hit.value / 780, 0.08, 1));
    }
  }

  #substep(dt, now) {
    const box = this.geometry.box;
    const left = box.left;
    const right = box.right;
    const bottom = box.bottom;

    for (const m of this.awake) {
      m.vy += GRAVITY * dt;
      const speed = Math.hypot(m.vx, m.vy);
      if (speed > MAX_SPEED) {
        const scale = MAX_SPEED / speed;
        m.vx *= scale;
        m.vy *= scale;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      if (m.x - m.r < left) {
        m.x = left + m.r;
        if (m.vx < 0) {
          this.#noteImpact(m.x, m.y, -m.vx);
          m.vx = -m.vx * 0.34;
          m.vy *= 0.97;
        }
      } else if (m.x + m.r > right) {
        m.x = right - m.r;
        if (m.vx > 0) {
          this.#noteImpact(m.x, m.y, m.vx);
          m.vx = -m.vx * 0.34;
          m.vy *= 0.97;
        }
      }

      if (m.y + m.r > bottom) {
        m.y = bottom - m.r;
        if (m.vy > 0) {
          this.#noteImpact(m.x, m.y + m.r, m.vy);
          m.vy = -m.vy * 0.22;
          m.vx *= 0.9;
        }
      }
    }

    // Awake-awake broadphase: one grid rebuilt per substep.
    this.awakeGrid.clear();
    for (const m of this.awake) {
      const key = this.#gridKey(m.x, m.y);
      let bucket = this.awakeGrid.get(key);
      if (!bucket) {
        bucket = [];
        this.awakeGrid.set(key, bucket);
      }
      bucket.push(m);
    }

    for (const m of this.awake) {
      const cx = this.#cellX(m.x);
      const cy = this.#cellY(m.y);
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oy = -1; oy <= 1; oy += 1) {
          const bucket = this.awakeGrid.get((cx + ox) * 128 + (cy + oy));
          if (!bucket) continue;
          for (const other of bucket) {
            if (other.id <= m.id) continue;
            const impact = this.#collide(m, other, false);
            if (impact > 0) this.#noteImpact((m.x + other.x) / 2, (m.y + other.y) / 2, impact);
          }
        }
      }

      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oy = -1; oy <= 1; oy += 1) {
          const bucket = this.staticGrid.get((cx + ox) * 128 + (cy + oy));
          if (!bucket) continue;
          for (const settled of bucket) {
            const impact = this.#collide(m, settled, true);
            if (impact > 0) this.#noteImpact(m.x + m.r * 0.6, m.y + m.r * 0.6, impact);
          }
        }
      }
    }

    for (let i = this.awake.length - 1; i >= 0; i -= 1) {
      const m = this.awake[i];
      const speed2 = m.vx * m.vx + m.vy * m.vy;
      if (speed2 < SLEEP_SPEED * SLEEP_SPEED && m.y > box.top) {
        m.rest += dt;
      } else {
        m.rest = 0;
      }
      if (m.rest >= SLEEP_TIME) this.#sleep(m, i, now);
    }
  }

  #collide(a, b, staticB) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const minDist = a.r + b.r;
    const dist2 = dx * dx + dy * dy;
    if (dist2 >= minDist * minDist || dist2 < 1e-8) return 0;
    const dist = Math.sqrt(dist2);
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;

    if (staticB) {
      a.x -= nx * overlap;
      a.y -= ny * overlap;
    } else {
      const half = overlap * 0.5;
      a.x -= nx * half;
      a.y -= ny * half;
      b.x += nx * half;
      b.y += ny * half;
    }

    const bvx = staticB ? 0 : b.vx;
    const bvy = staticB ? 0 : b.vy;
    const rvx = a.vx - bvx;
    const rvy = a.vy - bvy;
    const vn = rvx * nx + rvy * ny;
    if (vn <= 0) return 0;

    const restitution = staticB ? 0.2 : 0.3;
    if (staticB) {
      const j = -(1 + restitution) * vn;
      a.vx += j * nx;
      a.vy += j * ny;
      const tx = -ny;
      const ty = nx;
      const vt = a.vx * tx + a.vy * ty;
      a.vx -= vt * 0.24 * tx;
      a.vy -= vt * 0.24 * ty;
    } else {
      const j = (-(1 + restitution) * vn) / 2;
      a.vx += j * nx;
      a.vy += j * ny;
      b.vx -= j * nx;
      b.vy -= j * ny;
      const tx = -ny;
      const ty = nx;
      const vt = (a.vx - b.vx) * tx + (a.vy - b.vy) * ty;
      const friction = vt * 0.16;
      a.vx -= friction * tx;
      a.vy -= friction * ty;
      b.vx += friction * tx;
      b.vy += friction * ty;
    }
    return vn;
  }

  #sleep(m, index, now) {
    m.asleep = true;
    m.rest = 0;
    m.vx = 0;
    m.vy = 0;
    const last = this.awake.length - 1;
    this.awake[index] = this.awake[last];
    this.awake.pop();

    const key = this.#gridKey(m.x, m.y);
    let bucket = this.staticGrid.get(key);
    if (!bucket) {
      bucket = [];
      this.staticGrid.set(key, bucket);
    }
    bucket.push(m);
    this.landed += 1;

    if (this.pileCtx) this.#drawMarbleTo(this.pileCtx, m);
    if (this.sparks.length < 70) {
      this.#addSpark(m.x, m.y + m.r * 0.7, 0.25);
    }
    if (now - this.lastClinkAt > 0.03) {
      this.lastClinkAt = now;
      audio.marbleHit(0.32);
    }
  }

  #forceSettle() {
    for (let i = this.awake.length - 1; i >= 0; i -= 1) {
      this.#sleep(this.awake[i], i, performance.now());
    }
    this.landed = this.total;
  }

  #noteImpact(x, y, value) {
    if (value < 150) return;
    const current = this.frameImpact;
    if (!current || value > current.value) {
      this.frameImpact = { x, y, value };
    }
  }

  #gridKey(x, y) {
    return this.#cellX(x) * 128 + this.#cellY(y);
  }

  #cellX(x) {
    return Math.max(0, Math.floor((x - this.gridOriginX) / this.cellSize));
  }

  #cellY(y) {
    return Math.max(0, Math.floor((y - this.gridOriginY) / this.cellSize));
  }

  #beginExit(now) {
    if (this.phase === "exit") return;
    this.phase = "exit";
    this.exitStartedAt = now;
    this.exitAt = 0;
    audio.payoutPourStop();
    if (!this.skipped) {
      audio.payoutFinish();
      vibrate(10);
    }
  }

  #complete() {
    this.active = false;
    this.phase = "idle";
    this.alpha = 0;
    this.pile = null;
    this.pileCtx = null;
    const callback = this.onComplete;
    this.onComplete = null;
    if (typeof callback === "function") {
      try {
        callback({ total: this.total, landed: this.landed, skipped: this.skipped });
      } catch (error) {
        console.error("[payout] completion callback failed", error);
      }
    }
  }

  /* ── Sparks ────────────────────────────────────────────── */

  #addSpark(x, y, power) {
    const count = power > 0.65 ? 3 : 1;
    for (let i = 0; i < count && this.sparks.length < 70; i += 1) {
      const life = randomRange(0.16, 0.4);
      this.sparks.push({
        x,
        y,
        vx: randomRange(-70, 70),
        vy: randomRange(-110, -15),
        life,
        maxLife: life,
        size: randomRange(0.8, 2.1),
        color: Math.random() > 0.45 ? "#ffe3a4" : "#fff7e6",
      });
    }
  }

  #updateSparks(dt) {
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const spark = this.sparks[i];
      spark.life -= dt;
      if (spark.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      spark.vy += 520 * dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vx *= 0.99;
    }
  }

  /* ── Rendering ─────────────────────────────────────────── */

  draw(now) {
    if (!this.active || this.alpha <= 0.002 || now < this.startedAt) return;
    const c = this.getCtx();
    if (!c) return;
    const alpha = this.alpha;
    const tray = this.geometry.tray;
    const enter = easeOutCubic(clamp((now - this.startedAt) / 240, 0, 1));

    c.save();
    playfieldPath(c);
    c.clip();
    c.fillStyle = `rgba(9, 7, 5, ${0.6 * alpha})`;
    c.fillRect(0, 0, W, H);
    const glowY = tray.rimY - 40;
    const glow = c.createRadialGradient(360, glowY, 30, 360, glowY, 430);
    glow.addColorStop(0, `rgba(255, 199, 105, ${0.18 * alpha})`);
    glow.addColorStop(0.6, `rgba(227, 164, 80, ${0.06 * alpha})`);
    glow.addColorStop(1, "rgba(227, 164, 80, 0)");
    c.fillStyle = glow;
    c.fillRect(0, 0, W, H);
    c.restore();

    c.save();
    c.globalAlpha = alpha;
    c.translate(0, (1 - enter) * 18);
    this.#drawChute(c, now);
    this.#drawTrayBack(c);
    this.#drawPile(c);
    this.#drawAwakeMarbles(c);
    this.#drawTrayFront(c);
    this.#drawSparks(c);
    this.#drawPlate(c);
    this.#drawSkipHint(c, now);
    c.restore();
  }

  #drawChute(c, now) {
    const { tray, box, nozzles } = this.geometry;
    const pipeY = tray.spoutY;
    const left = box.left + 6;
    const right = box.right - 6;
    const width = right - left;

    c.save();
    c.shadowColor = "rgba(0, 0, 0, 0.42)";
    c.shadowBlur = 14;
    c.shadowOffsetY = 7;
    const pipe = c.createLinearGradient(0, pipeY - 13, 0, pipeY + 11);
    pipe.addColorStop(0, "#f9e8b8");
    pipe.addColorStop(0.32, "#d9b46c");
    pipe.addColorStop(0.64, "#a5763a");
    pipe.addColorStop(1, "#61411c");
    c.fillStyle = pipe;
    roundRectPath(c, left, pipeY - 13, width, 24, 12);
    c.fill();
    c.restore();

    c.save();
    c.strokeStyle = "rgba(72, 46, 18, 0.55)";
    c.lineWidth = 1;
    roundRectPath(c, left, pipeY - 13, width, 24, 12);
    c.stroke();

    c.strokeStyle = "rgba(255, 249, 230, 0.55)";
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(left + 14, pipeY - 8.5);
    c.lineTo(right - 14, pipeY - 8.5);
    c.stroke();
    c.restore();

    // End bolts
    for (const x of [left + 3, right - 3]) {
      c.fillStyle = "#3b2814";
      c.beginPath();
      c.arc(x, pipeY, 8, 0, TAU);
      c.fill();
      c.strokeStyle = "rgba(247, 222, 166, 0.5)";
      c.lineWidth = 1;
      c.beginPath();
      c.arc(x, pipeY, 5.4, 0, TAU);
      c.stroke();
      c.fillStyle = "rgba(20, 13, 7, 0.9)";
      c.beginPath();
      c.arc(x, pipeY, 2.1, 0, TAU);
      c.fill();
    }

    // Nozzles
    const innerLeft = box.left + 22;
    const innerRight = box.right - 22;
    for (let i = 0; i < nozzles; i += 1) {
      const x = innerLeft + (i / (nozzles - 1)) * (innerRight - innerLeft);
      c.fillStyle = "rgba(43, 29, 15, 0.95)";
      c.beginPath();
      c.moveTo(x - 4.6, pipeY + 8);
      c.lineTo(x + 4.6, pipeY + 8);
      c.lineTo(x + 2.6, pipeY + 16.5);
      c.lineTo(x - 2.6, pipeY + 16.5);
      c.closePath();
      c.fill();
      c.fillStyle = "rgba(246, 217, 156, 0.28)";
      c.fillRect(x - 4.6, pipeY + 8, 9.2, 1.1);
    }

    // Gentle idle shimmer travelling along the pipe.
    const shimmer = ((now * 0.00035) % 1) * width;
    const shimmerX = left + shimmer;
    const sheen = c.createLinearGradient(shimmerX - 70, 0, shimmerX + 70, 0);
    sheen.addColorStop(0, "rgba(255, 248, 224, 0)");
    sheen.addColorStop(0.5, "rgba(255, 248, 224, 0.24)");
    sheen.addColorStop(1, "rgba(255, 248, 224, 0)");
    c.fillStyle = sheen;
    roundRectPath(c, left, pipeY - 13, width, 24, 12);
    c.fill();
  }

  #drawTrayBack(c) {
    const tray = this.geometry.tray;
    const left = tray.left;
    const right = tray.right;
    const top = tray.rimY;
    const bottom = tray.bottom;
    const width = right - left;

    c.save();
    c.shadowColor = "rgba(0, 0, 0, 0.5)";
    c.shadowBlur = 26;
    c.shadowOffsetY = 10;
    const body = c.createLinearGradient(0, top - 12, 0, bottom + 14);
    body.addColorStop(0, "#4b3722");
    body.addColorStop(0.36, "#332516");
    body.addColorStop(1, "#1a120b");
    c.fillStyle = body;
    roundRectPath(c, left - 6, top - 12, width + 12, bottom - top + 26, 20);
    c.fill();
    c.restore();

    c.strokeStyle = "rgba(238, 198, 128, 0.26)";
    c.lineWidth = 1.3;
    roundRectPath(c, left - 6, top - 12, width + 12, bottom - top + 26, 20);
    c.stroke();

    // Interior recess
    const inset = 12;
    c.save();
    const recess = c.createLinearGradient(0, top + inset, 0, bottom);
    recess.addColorStop(0, "#0b0805");
    recess.addColorStop(0.24, "#17100a");
    recess.addColorStop(0.72, "#25180e");
    recess.addColorStop(1, "#332214");
    c.fillStyle = recess;
    c.beginPath();
    c.moveTo(left + inset, top + inset);
    c.lineTo(right - inset, top + inset);
    c.lineTo(right - inset, bottom - inset - 10);
    c.quadraticCurveTo(right - inset, bottom - inset, right - inset - 10, bottom - inset);
    c.lineTo(left + inset + 10, bottom - inset);
    c.quadraticCurveTo(left + inset, bottom - inset, left + inset, bottom - inset - 10);
    c.closePath();
    c.fill();

    const topShade = c.createLinearGradient(0, top + inset, 0, top + inset + 54);
    topShade.addColorStop(0, "rgba(0, 0, 0, 0.62)");
    topShade.addColorStop(1, "rgba(0, 0, 0, 0)");
    c.fillStyle = topShade;
    c.fill();
    c.restore();

    // Faint vertical grain on the wooden body.
    c.save();
    c.globalAlpha = 0.16;
    const grainCount = Math.max(8, Math.round(width / 33));
    for (let i = 0; i < grainCount; i += 1) {
      const x = left + 16 + i * ((width - 32) / Math.max(1, grainCount - 1));
      c.strokeStyle = i % 2 ? "rgba(255, 226, 174, 0.18)" : "rgba(0, 0, 0, 0.4)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, top + 18);
      c.lineTo(x + 2, bottom - 10);
      c.stroke();
    }
    c.restore();
  }

  #drawPile(c) {
    if (!this.pile) return;
    const tray = this.geometry.tray;
    c.save();
    const inset = 12;
    const left = tray.left + inset;
    const right = tray.right - inset;
    const top = tray.rimY + inset;
    const bottom = tray.bottom - inset;
    c.beginPath();
    c.moveTo(left, top);
    c.lineTo(right, top);
    c.lineTo(right, bottom - 10);
    c.quadraticCurveTo(right, bottom, right - 10, bottom);
    c.lineTo(left + 10, bottom);
    c.quadraticCurveTo(left, bottom, left, bottom - 10);
    c.closePath();
    c.clip();
    c.drawImage(
      this.pile,
      this.pileOriginX,
      this.pileOriginY,
      this.pileBoardW,
      this.pileBoardH,
    );
    c.restore();
  }

  #drawAwakeMarbles(c) {
    for (const m of this.awake) {
      const sprite = this.sprites[m.variant];
      if (!sprite) continue;
      c.drawImage(sprite, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
    }
  }

  #drawMarbleTo(c, m) {
    const sprite = this.sprites[m.variant];
    if (!sprite) return;
    c.drawImage(sprite, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
  }

  #drawTrayFront(c) {
    const { tray, box } = this.geometry;
    const left = tray.left;
    const right = tray.right;
    const top = tray.rimY;
    const bottom = tray.bottom;

    // Brass rim across the mouth of the tray.
    c.save();
    const rim = c.createLinearGradient(0, top - 13, 0, top + 12);
    rim.addColorStop(0, "#fbecc2");
    rim.addColorStop(0.3, "#e0bd77");
    rim.addColorStop(0.62, "#a87a3c");
    rim.addColorStop(1, "#5d3f19");
    c.fillStyle = rim;
    roundRectPath(c, left - 8, top - 12, right - left + 16, 24, 11);
    c.fill();
    c.strokeStyle = "rgba(60, 38, 14, 0.6)";
    c.lineWidth = 1;
    c.stroke();
    c.strokeStyle = "rgba(255, 250, 232, 0.5)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(left + 8, top - 7.5);
    c.lineTo(right - 8, top - 7.5);
    c.stroke();
    c.restore();

    // Rim screws
    for (let i = 0; i <= 6; i += 1) {
      const x = left + 10 + (i / 6) * (right - left - 20);
      c.fillStyle = "rgba(58, 38, 16, 0.85)";
      c.beginPath();
      c.arc(x, top, 2.3, 0, TAU);
      c.fill();
      c.strokeStyle = "rgba(255, 246, 222, 0.35)";
      c.lineWidth = 0.7;
      c.beginPath();
      c.moveTo(x - 1.4, top);
      c.lineTo(x + 1.4, top);
      c.stroke();
    }

    // Side rails hugging the pile.
    for (const side of [-1, 1]) {
      const x = side < 0 ? box.left - 3 : box.right - 3;
      const rail = c.createLinearGradient(0, top, 0, bottom);
      rail.addColorStop(0, "rgba(240, 210, 148, 0.42)");
      rail.addColorStop(0.5, "rgba(176, 129, 62, 0.3)");
      rail.addColorStop(1, "rgba(94, 62, 24, 0.35)");
      c.fillStyle = rail;
      c.fillRect(x, top + 6, 6, bottom - top - 6);
      c.fillStyle = "rgba(255, 244, 217, 0.2)";
      c.fillRect(side < 0 ? x + 1 : x + 4.6, top + 8, 0.8, bottom - top - 10);
    }

    // Front lip: the tray is seen from the front, so the lowest slice of
    // the pile disappears behind a dark wooden panel.
    const lipTop = bottom - 30;
    const lip = c.createLinearGradient(0, lipTop, 0, bottom + 4);
    lip.addColorStop(0, "#3d2a19");
    lip.addColorStop(0.25, "#2a1c11");
    lip.addColorStop(1, "#150e08");
    c.fillStyle = lip;
    roundRectPath(c, left + 2, lipTop, right - left - 4, 34, 5);
    c.fill();
    c.strokeStyle = "rgba(235, 194, 122, 0.36)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(left + 10, lipTop + 0.8);
    c.lineTo(right - 10, lipTop + 0.8);
    c.stroke();

    c.fillStyle = "rgba(231, 181, 102, 0.34)";
    c.font = '700 7px "SFMono-Regular", monospace';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("P A Y O U T   T R A Y", 360, lipTop + 17);
  }

  #drawSparks(c) {
    if (!this.sparks.length) return;
    c.save();
    for (const spark of this.sparks) {
      const a = clamp(spark.life / spark.maxLife, 0, 1);
      c.globalAlpha = this.alpha * a;
      c.fillStyle = spark.color;
      c.beginPath();
      c.arc(spark.x, spark.y, spark.size * (0.5 + a * 0.5), 0, TAU);
      c.fill();
    }
    c.restore();
  }

  #drawPlate(c) {
    const { tray } = this.geometry;
    const cx = 360;
    const top = tray.plateTop;
    const width = tray.plateWidth;
    const height = PLATE_HEIGHT;
    // Count marbles as they leave the chute, like an arcade payout meter.
    const poured = Math.min(this.spawned, this.total);
    const progress = this.total > 0 ? poured / this.total : 0;

    c.save();
    c.shadowColor = "rgba(0, 0, 0, 0.5)";
    c.shadowBlur = 20;
    c.shadowOffsetY = 6;
    const plate = c.createLinearGradient(0, top, 0, top + height);
    plate.addColorStop(0, "rgba(50, 35, 21, 0.98)");
    plate.addColorStop(0.6, "rgba(29, 20, 12, 0.98)");
    plate.addColorStop(1, "rgba(20, 14, 9, 0.98)");
    c.fillStyle = plate;
    roundRectPath(c, cx - width / 2, top, width, height, 15);
    c.fill();
    c.restore();

    c.strokeStyle = "rgba(231, 181, 102, 0.52)";
    c.lineWidth = 1.2;
    roundRectPath(c, cx - width / 2, top, width, height, 15);
    c.stroke();
    c.strokeStyle = "rgba(255, 244, 216, 0.08)";
    c.lineWidth = 1;
    roundRectPath(c, cx - width / 2 + 5, top + 5, width - 10, height - 10, 11);
    c.stroke();

    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "rgba(231, 181, 102, 0.82)";
    c.font = '800 8px "SFMono-Regular", monospace';
    c.fillText("P A Y O U T", cx, top + 15);

    const bigFont = '900 30px "Avenir Next", "PingFang SC", sans-serif';
    const smallFont = '700 12px "PingFang SC", system-ui, sans-serif';
    const bigText = `+${poured}`;
    c.font = bigFont;
    const bigWidth = c.measureText(bigText).width;
    c.font = smallFont;
    const smallText = ` / ${this.total} 颗`;
    const smallWidth = c.measureText(smallText).width;
    const startX = cx - (bigWidth + smallWidth) / 2;

    c.textAlign = "left";
    c.font = bigFont;
    c.fillStyle = "#ffe8b3";
    c.fillText(bigText, startX, top + 41);
    c.font = smallFont;
    c.fillStyle = "rgba(255, 240, 213, 0.6)";
    c.fillText(smallText, startX + bigWidth, top + 44);

    // Landing progress bar.
    const barWidth = width - 48;
    const barX = cx - barWidth / 2;
    const barY = top + height - 17;
    c.fillStyle = "rgba(255, 240, 207, 0.12)";
    roundRectPath(c, barX, barY, barWidth, 4, 2);
    c.fill();
    if (progress > 0) {
      const fill = c.createLinearGradient(barX, 0, barX + barWidth, 0);
      fill.addColorStop(0, "#f2cd83");
      fill.addColorStop(1, "#e7a63f");
      c.fillStyle = fill;
      roundRectPath(c, barX, barY, Math.max(4, barWidth * progress), 4, 2);
      c.fill();
    }

    // Two small brass hangers down to the chute.
    c.strokeStyle = "rgba(206, 166, 97, 0.36)";
    c.lineWidth = 2;
    for (const x of [cx - 42, cx + 42]) {
      c.beginPath();
      c.moveTo(x, top + height);
      c.lineTo(x, tray.spoutY - 8);
      c.stroke();
    }
  }

  #drawSkipHint(c, now) {
    if (now - this.startedAt < 900) return;
    const fade = clamp((now - this.startedAt - 900) / 380, 0, 1);
    c.save();
    c.globalAlpha = this.alpha * fade * (0.55 + Math.sin(now * 0.004) * 0.12);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "rgba(255, 242, 216, 0.72)";
    c.font = '600 9px "PingFang SC", system-ui, sans-serif';
    c.fillText("轻触托盘跳过", 360, this.geometry.tray.bottom + 26);
    c.restore();
  }

  /* ── Debug ─────────────────────────────────────────────── */

  snapshot() {
    return {
      active: this.active,
      phase: this.phase,
      total: this.total,
      spawned: this.spawned,
      landed: this.landed,
      awake: this.awake.length,
      alpha: Number(this.alpha.toFixed(2)),
      radius: this.radius,
      skipped: this.skipped,
    };
  }
}

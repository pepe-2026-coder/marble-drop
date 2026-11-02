/* ============================================================
   Table obstacle engine
   Supported obstacle families:
     mover  – a body that loops along a polyline (flying cars, lifts)
     rotor  – active (constant spin) or passive (ball-driven) arms
     bumper – a pin that adds a relative elastic kick on impact
     portal – two linked gates, enter one and leave the other
     block  – static rounded boxes (buildings, crates, bumpers walls)

   Collision is resolved against the obstacle's *relative* surface
   velocity, so a moving car can shove the marble and a passive
   rotor can be spun by an off-centre hit.
   ============================================================ */

import { MAIN_RIGHT } from "./config.js";
import { clamp, randomRange } from "./utils.js";

const TAU = Math.PI * 2;
const randomRangeKick = (scale) => (Math.random() * 2 - 1) * scale;
const MAIN_FIELD_CLIP = { x: 82, y: 272, w: MAIN_RIGHT - 82, h: 902 };

/* ── Construction ────────────────────────────────────────── */

function samplePath(obstacle, progress) {
  let remaining = progress;
  for (let i = 1; i < obstacle.path.length; i += 1) {
    const segmentLength = obstacle.lengths[i - 1];
    if (remaining <= segmentLength || i === obstacle.path.length - 1) {
      const from = obstacle.path[i - 1];
      const to = obstacle.path[i];
      const t = segmentLength > 0 ? clamp(remaining / segmentLength, 0, 1) : 0;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = segmentLength || 1;
      return {
        x: from.x + dx * t,
        y: from.y + dy * t,
        dx: dx / length,
        dy: dy / length,
      };
    }
    remaining -= segmentLength;
  }
  const last = obstacle.path[obstacle.path.length - 1];
  return { x: last.x, y: last.y, dx: 0, dy: 0 };
}

function createMover(spec, index) {
  const path = spec.path && spec.path.length > 1 ? spec.path : [{ x: spec.x, y: spec.y }, { x: spec.x, y: spec.y }];
  const lengths = [];
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const length = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    lengths.push(length);
    total += length;
  }
  const obstacle = {
    ...spec,
    type: "mover",
    id: spec.id || `mover-${index}`,
    path,
    lengths,
    total: total || 1,
    progress: clamp(Number(spec.offset) || 0, 0, 1) * (total || 1),
    x: path[0].x,
    y: path[0].y,
    prevX: path[0].x,
    prevY: path[0].y,
    vx: 0,
    vy: 0,
    dir: 1,
    flash: 0,
    lastEventAt: 0,
  };
  const sample = samplePath(obstacle, obstacle.progress);
  obstacle.x = sample.x;
  obstacle.y = sample.y;
  obstacle.vx = sample.dx * (Number(spec.speed) || 0);
  obstacle.vy = sample.dy * (Number(spec.speed) || 0);
  obstacle.dir = sample.dx >= 0 ? 1 : -1;
  return obstacle;
}

function createRotor(spec, index) {
  const angle = Number(spec.initialAngle) || 0;
  const active = spec.mode === "active";
  return {
    ...spec,
    type: "rotor",
    id: spec.id || `rotor-${index}`,
    angle,
    omega: active ? Number(spec.speed) || 0 : 0,
    length: Math.max(28, Number(spec.length) || 90),
    thickness: Math.max(4, Number(spec.thickness) || 7),
    arms: clamp(Math.round(Number(spec.arms) || 2), 1, 4),
    inertia: Math.max(200, Number(spec.inertia) || 1700),
    flash: 0,
    lastEventAt: 0,
  };
}

function createPortal(spec, index) {
  return {
    ...spec,
    type: "portal",
    id: spec.id || `portal-${index}`,
    r: Math.max(16, Number(spec.r) || 28),
    cooldown: 0,
    enterArmed: true,
    flash: 0,
    lastEventAt: 0,
  };
}

/** Turn the table's serialisable recipes into mutable runtime objects. */
export function buildObstacles(specs = []) {
  const obstacles = specs.map((spec, index) => {
    switch (spec.type) {
      case "mover":
        return createMover(spec, index);
      case "rotor":
        return createRotor(spec, index);
      case "portal":
        return createPortal(spec, index);
      case "bumper":
        return {
          ...spec,
          id: spec.id || `bumper-${index}`,
          r: Math.max(12, Number(spec.r) || 26),
          boost: Math.max(0, Number(spec.boost) || 0),
          restitution: Number(spec.restitution) || 0.92,
          flash: 0,
          lastEventAt: 0,
        };
      case "block":
      default:
        return {
          ...spec,
          type: spec.type || "block",
          id: spec.id || `block-${index}`,
          radius: Math.max(0, Number(spec.radius) || 0),
          restitution: Number(spec.restitution) || 0.34,
          flash: 0,
          spawn: 0,
          lastEventAt: 0,
        };
    }
  });
  resetObstacles(obstacles);
  return obstacles;
}

/* ── Per-frame animation ─────────────────────────────────── */

export function resetObstacles(obstacles = []) {
  for (const obstacle of obstacles) {
    obstacle.flash = 0;
    obstacle.spawn = 0;
    obstacle.lastEventAt = 0;
    if (obstacle.type === "mover") {
      obstacle.progress = clamp(Number(obstacle.offset) || 0, 0, 1) * obstacle.total;
      const sample = samplePath(obstacle, obstacle.progress);
      obstacle.x = sample.x;
      obstacle.y = sample.y;
      obstacle.prevX = sample.x;
      obstacle.prevY = sample.y;
      obstacle.vx = sample.dx * (Number(obstacle.speed) || 0);
      obstacle.vy = sample.dy * (Number(obstacle.speed) || 0);
      obstacle.dir = sample.dx >= 0 ? 1 : -1;
    } else if (obstacle.type === "rotor") {
      obstacle.angle = Number(obstacle.initialAngle) || 0;
      obstacle.omega = obstacle.mode === "active" ? Number(obstacle.speed) || 0 : 0;
    } else if (obstacle.type === "portal") {
      obstacle.cooldown = 0;
      obstacle.enterArmed = true;
    }
  }
}

/**
 * Reposition blocks that opt into `randomX` at the start of a round. This is
 * used by the budget table's holographic ad boards: they are temporary props,
 * not buildings, so moving between rounds is part of their fiction.
 */
export function randomizeObstacles(obstacles = []) {
  const movable = obstacles.filter(
    (obstacle) => obstacle.type === "block" && obstacle.randomX,
  );
  if (!movable.length) return;

  const placed = [];
  for (const obstacle of movable) {
    const halfWidth = obstacle.w / 2;
    const min = Math.max(Number(obstacle.randomX.min) || 0, 82 + halfWidth);
    const max = Math.min(Number(obstacle.randomX.max) || MAIN_RIGHT, MAIN_RIGHT - halfWidth);
    const gap = Number(obstacle.randomGap) || 20;
    let x = (min + max) / 2;
    let found = false;
    let best = x;
    let bestDistance = -Infinity;

    for (let attempt = 0; attempt < 48; attempt += 1) {
      const candidate = min + Math.random() * Math.max(0, max - min);
      const nearest = placed.reduce(
        (distance, other) => Math.min(distance, Math.abs(candidate - other.x)),
        Infinity,
      );
      const clear = placed.every(
        (other) => Math.abs(candidate - other.x) >= (obstacle.w + other.w) / 2 + gap,
      );
      if (clear) {
        x = candidate;
        found = true;
        break;
      }
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = candidate;
      }
    }
    if (!found) x = best;

    obstacle.x = x;
    obstacle.spawn = 1;
    obstacle.flash = 0.7;
    placed.push(obstacle);
  }
}

export function updateObstacles(obstacles = [], dt) {
  if (!(dt > 0)) return;
  for (const obstacle of obstacles) {
    if (obstacle.flash > 0) obstacle.flash = Math.max(0, obstacle.flash - dt * 3.4);
    if (obstacle.spawn > 0) obstacle.spawn = Math.max(0, obstacle.spawn - dt * 1.6);

    if (obstacle.type === "mover") {
      const previousX = obstacle.x;
      const previousY = obstacle.y;
      obstacle.progress += (Number(obstacle.speed) || 0) * dt;
      let wrapped = false;
      if (obstacle.progress >= obstacle.total) {
        obstacle.progress %= obstacle.total;
        wrapped = true;
      }
      const sample = samplePath(obstacle, obstacle.progress);
      obstacle.prevX = wrapped ? sample.x : previousX;
      obstacle.prevY = wrapped ? sample.y : previousY;
      obstacle.x = sample.x;
      obstacle.y = sample.y;
      obstacle.vx = sample.dx * (Number(obstacle.speed) || 0);
      obstacle.vy = sample.dy * (Number(obstacle.speed) || 0);
      obstacle.dir = sample.dx >= 0 ? 1 : -1;
    } else if (obstacle.type === "rotor") {
      if (obstacle.mode === "active") {
        obstacle.omega = Number(obstacle.speed) || 0;
        obstacle.angle += obstacle.omega * dt;
      } else {
        obstacle.angle += obstacle.omega * dt;
        obstacle.omega *= Math.exp(-(Number(obstacle.damping) || 0.8) * dt);
        if (Math.abs(obstacle.omega) < 0.012) obstacle.omega = 0;
      }
      obstacle.angle %= TAU;
    } else if (obstacle.type === "portal") {
      if (obstacle.cooldown > 0) obstacle.cooldown = Math.max(0, obstacle.cooldown - dt);
    }
  }
}

/* ── Collision helpers ───────────────────────────────────── */

function circleVsCapsule(ball, x1, y1, x2, y2, radius) {
  const abx = x2 - x1;
  const aby = y2 - y1;
  const length2 = abx * abx + aby * aby || 1;
  const t = clamp(((ball.x - x1) * abx + (ball.y - y1) * aby) / length2, 0, 1);
  const cx = x1 + abx * t;
  const cy = y1 + aby * t;
  let dx = ball.x - cx;
  let dy = ball.y - cy;
  let distance = Math.hypot(dx, dy);
  const minDistance = ball.r + radius;
  if (distance >= minDistance) return null;
  if (distance < 0.0001) {
    const length = Math.hypot(abx, aby) || 1;
    dx = -aby / length;
    dy = abx / length;
    distance = 1;
  }
  const nx = dx / distance;
  const ny = dy / distance;
  return {
    nx,
    ny,
    penetration: minDistance - distance,
    cx: cx + nx * radius,
    cy: cy + ny * radius,
  };
}

function circleVsObb(ball, obstacle) {
  const angle = Number(obstacle.angle) || 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = ball.x - obstacle.x;
  const dy = ball.y - obstacle.y;
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const corner = Number(obstacle.radius) || 0;
  const hw = Math.max(0.01, obstacle.w / 2 - corner);
  const hh = Math.max(0.01, obstacle.h / 2 - corner);
  const qx = clamp(lx, -hw, hw);
  const qy = clamp(ly, -hh, hh);
  let ddx = lx - qx;
  let ddy = ly - qy;
  let distance = Math.hypot(ddx, ddy);
  const minDistance = ball.r + corner;
  if (distance >= minDistance) return null;

  let nxLocal;
  let nyLocal;
  if (distance < 0.0001) {
    const left = lx + hw;
    const right = hw - lx;
    const top = ly + hh;
    const bottom = hh - ly;
    const nearest = Math.min(left, right, top, bottom);
    if (nearest === left) {
      nxLocal = -1;
      nyLocal = 0;
      distance = -left;
    } else if (nearest === right) {
      nxLocal = 1;
      nyLocal = 0;
      distance = -right;
    } else if (nearest === top) {
      nxLocal = 0;
      nyLocal = -1;
      distance = -top;
    } else {
      nxLocal = 0;
      nyLocal = 1;
      distance = -bottom;
    }
  } else {
    nxLocal = ddx / distance;
    nyLocal = ddy / distance;
  }

  const nx = nxLocal * cos - nyLocal * sin;
  const ny = nxLocal * sin + nyLocal * cos;
  return {
    nx,
    ny,
    penetration: minDistance - distance,
    cx: ball.x - nx * ball.r,
    cy: ball.y - ny * ball.r,
  };
}

/** Bounce the marble against an immovable (or moving) surface. */
function resolveImpact(ball, nx, ny, penetration, surfaceVx, surfaceVy, restitution) {
  ball.x += nx * penetration;
  ball.y += ny * penetration;

  const relativeX = ball.vx - surfaceVx;
  const relativeY = ball.vy - surfaceVy;
  const vn = relativeX * nx + relativeY * ny;
  if (vn >= 0) return 0;

  ball.vx -= (1 + restitution) * vn * nx;
  ball.vy -= (1 + restitution) * vn * ny;

  const tangentX = -ny;
  const tangentY = nx;
  const tangentSpeed = (ball.vx - surfaceVx) * tangentX + (ball.vy - surfaceVy) * tangentY;
  const friction = 0.028;
  ball.vx -= tangentSpeed * friction * tangentX;
  ball.vy -= tangentSpeed * friction * tangentY;
  return -vn;
}

function pushEvent(obstacle, events, event, force = false) {
  const now = performance.now();
  if (!force && now - (obstacle.lastEventAt || 0) < 48) return;
  obstacle.lastEventAt = now;
  events.push(event);
}

function collideMover(ball, obstacle, events) {
  const hit = circleVsObb(ball, obstacle);
  if (!hit) return false;
  const impact = resolveImpact(
    ball,
    hit.nx,
    hit.ny,
    hit.penetration,
    obstacle.vx,
    obstacle.vy,
    Number(obstacle.restitution) || 0.5,
  );
  if (impact > 0) {
    obstacle.flash = 1;
    pushEvent(obstacle, events, {
      kind: "car",
      x: hit.cx,
      y: hit.cy,
      nx: hit.nx,
      ny: hit.ny,
      impact,
      accent: obstacle.accent,
    });
  }
  return true;
}

function collideRotor(ball, obstacle, events) {
  const half = obstacle.length / 2;
  const armCount = obstacle.arms === 2 ? 1 : obstacle.arms;
  for (let arm = 0; arm < armCount; arm += 1) {
    let x1;
    let y1;
    let x2;
    let y2;
    if (obstacle.arms === 2) {
      const angle = obstacle.angle;
      x1 = obstacle.x - Math.cos(angle) * half;
      y1 = obstacle.y - Math.sin(angle) * half;
      x2 = obstacle.x + Math.cos(angle) * half;
      y2 = obstacle.y + Math.sin(angle) * half;
    } else {
      const angle = obstacle.angle + (arm / obstacle.arms) * TAU;
      x1 = obstacle.x;
      y1 = obstacle.y;
      x2 = obstacle.x + Math.cos(angle) * half;
      y2 = obstacle.y + Math.sin(angle) * half;
    }

    const hit = circleVsCapsule(ball, x1, y1, x2, y2, obstacle.thickness / 2);
    if (!hit) continue;

    const rx = hit.cx - obstacle.x;
    const ry = hit.cy - obstacle.y;
    const surfaceVx = -obstacle.omega * ry;
    const surfaceVy = obstacle.omega * rx;
    const impact = resolveImpact(
      ball,
      hit.nx,
      hit.ny,
      hit.penetration,
      surfaceVx,
      surfaceVy,
      Number(obstacle.restitution) || 0.7,
    );
    if (impact > 0) {
      if (obstacle.mode !== "active") {
        const torque = impact * (ry * hit.nx - rx * hit.ny);
        obstacle.omega = clamp(obstacle.omega + torque / obstacle.inertia, -13, 13);
      }
      obstacle.flash = 1;
      pushEvent(obstacle, events, {
        kind: "rotor",
        x: hit.cx,
        y: hit.cy,
        nx: hit.nx,
        ny: hit.ny,
        impact,
        passive: obstacle.mode !== "active",
        accent: obstacle.accent,
      });
      return true;
    }
  }
  return false;
}

function collideBumper(ball, obstacle, events) {
  const dx = ball.x - obstacle.x;
  const dy = ball.y - obstacle.y;
  const minDistance = ball.r + obstacle.r;
  const distance = Math.hypot(dx, dy);
  if (distance >= minDistance) return false;
  const nx = distance > 0.0001 ? dx / distance : 0;
  const ny = distance > 0.0001 ? dy / distance : -1;
  const impact = resolveImpact(
    ball,
    nx,
    ny,
    minDistance - distance,
    0,
    0,
    obstacle.restitution,
  );
  if (impact <= 0) return false;
  const boostScale = clamp(impact / 520, 0.55, 1.6);
  ball.vx += nx * obstacle.boost * boostScale;
  ball.vy += ny * obstacle.boost * boostScale;
  obstacle.flash = 1;
  pushEvent(obstacle, events, {
    kind: "bumper",
    x: obstacle.x - nx * obstacle.r,
    y: obstacle.y - ny * obstacle.r,
    nx,
    ny,
    impact,
    accent: obstacle.accent,
  });
  return true;
}

function collideBlock(ball, obstacle, events) {
  const hit = circleVsObb(ball, obstacle);
  if (!hit) return false;
  const impact = resolveImpact(
    ball,
    hit.nx,
    hit.ny,
    hit.penetration,
    0,
    0,
    obstacle.restitution,
  );
  if (impact > 0) {
    // Rooftops are active deflectors: a marble that lands on a flat roof gets
    // a random sideways kick so it can never settle there for good.
    if (obstacle.roofBounce && hit.ny < -0.55) {
      const kick = Number(obstacle.roofBounce) || 0;
      ball.vx += randomRangeKick(kick);
      ball.vy -= kick * 0.22;
    }
    obstacle.flash = 1;
    pushEvent(obstacle, events, {
      kind: "block",
      x: hit.cx,
      y: hit.cy,
      nx: hit.nx,
      ny: hit.ny,
      impact,
      accent: obstacle.accent,
    });
  }
  return true;
}

function collidePortal(ball, obstacle, events) {
  if (obstacle.cooldown > 0) return false;
  const a = obstacle.a;
  const b = obstacle.b;
  const reach = obstacle.r + ball.r * 0.4;
  const inA = Math.hypot(ball.x - a.x, ball.y - a.y) <= reach;
  const inB = Math.hypot(ball.x - b.x, ball.y - b.y) <= reach;

  if (!inA && !inB) {
    obstacle.enterArmed = true;
    return false;
  }
  if (!obstacle.enterArmed) return false;

  const to = inA ? b : a;
  const from = inA ? a : b;
  ball.x = to.x;
  ball.y = to.y;
  ball.prevX = to.x;
  ball.prevY = to.y;
  obstacle.enterArmed = false;
  obstacle.cooldown = 0.65;
  obstacle.flash = 1;
  pushEvent(
    obstacle,
    events,
    {
      kind: "portal",
      x: from.x,
      y: from.y,
      ex: to.x,
      ey: to.y,
      accent: inA ? obstacle.accentA : obstacle.accentB,
      accentExit: inA ? obstacle.accentB : obstacle.accentA,
    },
    true,
  );
  return true;
}

/**
 * Run one collision pass against every obstacle. Returns lightweight
 * events for the engine to translate into sound, sparks and screen shake.
 */
export function collideObstacles(ball, obstacles = []) {
  const events = [];
  for (const obstacle of obstacles) {
    if (obstacle.mainFieldOnly && ball.x > MAIN_RIGHT - 2) continue;
    switch (obstacle.type) {
      case "mover":
        collideMover(ball, obstacle, events);
        break;
      case "rotor":
        collideRotor(ball, obstacle, events);
        break;
      case "bumper":
        collideBumper(ball, obstacle, events);
        break;
      case "portal":
        collidePortal(ball, obstacle, events);
        break;
      case "block":
        collideBlock(ball, obstacle, events);
        break;
      default:
        break;
    }
  }
  return events;
}

/* ── Rendering ───────────────────────────────────────────── */

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawTower(ctx, obstacle, now, palette) {
  const w = obstacle.w;
  const h = obstacle.h;
  const accent = obstacle.accent || palette.primary;
  const flicker = 0.86 + Math.sin(now * 0.002 + (obstacle.seed || 1) * 2.3) * 0.14;

  ctx.save();
  ctx.translate(obstacle.x, obstacle.y);
  ctx.rotate(Number(obstacle.angle) || 0);
  const x = -w / 2;
  const y = -h / 2;

  ctx.save();
  ctx.shadowColor = `rgba(${palette.primaryRgb}, 0.32)`;
  ctx.shadowBlur = 14 + obstacle.flash * 18;
  const body = ctx.createLinearGradient(x, y, x + w, y + h);
  body.addColorStop(0, "rgba(13, 24, 44, 0.98)");
  body.addColorStop(0.55, "rgba(8, 14, 28, 0.99)");
  body.addColorStop(1, "rgba(17, 11, 34, 0.98)");
  ctx.fillStyle = body;
  roundRectPath(ctx, x, y, w, h, obstacle.radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, ${0.34 + obstacle.flash * 0.4})`;
  ctx.lineWidth = 1.4;
  roundRectPath(ctx, x, y, w, h, obstacle.radius);
  ctx.stroke();

  // Rooftop ledge and antenna.
  ctx.fillStyle = "rgba(9, 15, 30, 0.9)";
  ctx.fillRect(x + 5, y - 4, w - 10, 5);
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.4)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 8, y - 4);
  ctx.lineTo(x + w - 8, y - 4);
  ctx.stroke();
  const antennaX = x + w - 14;
  ctx.strokeStyle = "rgba(180, 220, 255, 0.4)";
  ctx.beginPath();
  ctx.moveTo(antennaX, y - 4);
  ctx.lineTo(antennaX, y - 16);
  ctx.stroke();
  ctx.fillStyle = `rgba(${palette.secondRgb}, ${0.5 + Math.sin(now * 0.006 + obstacle.seed) * 0.4})`;
  ctx.beginPath();
  ctx.arc(antennaX, y - 17, 1.8, 0, TAU);
  ctx.fill();

  // Window grid.
  const cols = Math.max(2, Math.floor((w - 14) / 13));
  const rows = Math.max(2, Math.floor((h - 20) / 15));
  const cellW = (w - 16) / cols;
  const cellH = (h - 22) / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const seedValue = (obstacle.seed || 1) * 13 + row * 7 + col * 5;
      const lit = seedValue % 7 !== 0;
      const pulse = 0.55 + Math.sin(now * 0.0022 + seedValue) * 0.35;
      ctx.fillStyle = lit
        ? `rgba(${hexToRgb(accent)}, ${0.18 + pulse * 0.5})`
        : "rgba(90, 120, 160, 0.08)";
      ctx.fillRect(x + 7 + col * cellW, y + 11 + row * cellH, Math.max(2, cellW - 4), 3.4);
    }
  }

  // Rooftop neon sign.
  if (obstacle.sign) {
    ctx.font = '800 8px "SFMono-Regular", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `rgba(${palette.primaryRgb}, ${0.5 * flicker})`;
    ctx.fillText(obstacle.sign, x + 7, y + h - 8);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(x + w - 8, y + 12, 2, h - 24);
  }
  ctx.restore();
  ctx.restore();
}

/** Holographic ad board used by the budget table. It is a temporary prop,
    not a building, so it is re-projected at a new street position each round. */
function drawBillboard(ctx, obstacle, now, palette) {
  const w = obstacle.w;
  const h = obstacle.h;
  const accent = obstacle.accent || palette.primary;
  const rgb = hexToRgb(accent);
  const spawn = clamp(obstacle.spawn || 0, 0, 1);
  const flicker = 0.76 + Math.sin(now * 0.008 + obstacle.x) * 0.14;

  ctx.save();
  ctx.translate(obstacle.x, obstacle.y);

  // Projection beam above the screen while it is materialising.
  if (spawn > 0.01) {
    const beam = ctx.createLinearGradient(0, -h / 2 - 96, 0, -h / 2);
    beam.addColorStop(0, `rgba(${rgb}, 0)`);
    beam.addColorStop(0.72, `rgba(${rgb}, ${0.2 * spawn})`);
    beam.addColorStop(1, `rgba(${rgb}, ${0.44 * spawn})`);
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(-w * 0.32, -h / 2 - 96);
    ctx.lineTo(w * 0.32, -h / 2 - 96);
    ctx.lineTo(w * 0.48, -h / 2);
    ctx.lineTo(-w * 0.48, -h / 2);
    ctx.closePath();
    ctx.fill();
  }

  // Floor glow / projector base.
  const floor = ctx.createRadialGradient(0, h / 2 + 3, 1, 0, h / 2 + 3, w * 0.8);
  floor.addColorStop(0, `rgba(${rgb}, ${0.3 + flashLike(obstacle) * 0.2})`);
  floor.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = floor;
  ctx.beginPath();
  ctx.ellipse(0, h / 2 + 3, w * 0.8, 11, 0, 0, TAU);
  ctx.fill();

  // Base bar.
  ctx.fillStyle = "rgba(7, 10, 20, 0.96)";
  roundRectPath(ctx, -w * 0.4, h / 2 - 10, w * 0.8, 10, 4);
  ctx.fill();
  ctx.strokeStyle = `rgba(${rgb}, 0.5)`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = `rgba(${rgb}, ${0.6 + spawn * 0.3})`;
  ctx.fillRect(-w * 0.22, h / 2 - 7, w * 0.44, 1.2);

  // Screen frame.
  ctx.save();
  ctx.shadowColor = `rgba(${rgb}, 0.5)`;
  ctx.shadowBlur = 14 + spawn * 16;
  const frame = ctx.createLinearGradient(0, -h / 2, 0, h / 2 - 10);
  frame.addColorStop(0, "rgba(13, 26, 42, 0.98)");
  frame.addColorStop(0.55, "rgba(7, 13, 27, 0.98)");
  frame.addColorStop(1, "rgba(17, 9, 22, 0.98)");
  ctx.fillStyle = frame;
  roundRectPath(ctx, -w / 2, -h / 2, w, h - 10, 6);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = `rgba(${rgb}, ${0.62 + flashLike(obstacle) * 0.3})`;
  ctx.lineWidth = 1.6;
  roundRectPath(ctx, -w / 2, -h / 2, w, h - 10, 6);
  ctx.stroke();

  // Screen content.
  ctx.save();
  roundRectPath(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 18, 4);
  ctx.clip();
  const screen = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  screen.addColorStop(0, `rgba(${rgb}, ${0.2 * flicker})`);
  screen.addColorStop(0.55, `rgba(${rgb}, 0.06)`);
  screen.addColorStop(1, `rgba(${rgb}, ${0.16 * flicker})`);
  ctx.fillStyle = screen;
  ctx.fillRect(-w / 2, -h / 2, w, h - 10);

  // Animated scan bars.
  const scanY = -h / 2 + ((now * 0.045 + obstacle.x * 3) % (h - 10));
  const scan = ctx.createLinearGradient(0, scanY - 8, 0, scanY + 8);
  scan.addColorStop(0, `rgba(${rgb}, 0)`);
  scan.addColorStop(0.5, `rgba(${rgb}, 0.28)`);
  scan.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = scan;
  ctx.fillRect(-w / 2, scanY - 8, w, 16);

  ctx.fillStyle = `rgba(${rgb}, 0.18)`;
  for (let y = -h / 2 + 8; y < h / 2 - 12; y += 5) {
    ctx.fillRect(-w / 2 + 4, y, w - 8, 1);
  }

  ctx.fillStyle = "#f8ffff";
  ctx.font = '900 12px "SFMono-Regular", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = accent;
  ctx.shadowBlur = 12;
  ctx.fillText(obstacle.sign || "AD", 0, -1);
  ctx.restore();

  ctx.fillStyle = `rgba(${rgb}, 0.8)`;
  ctx.font = '700 6px "SFMono-Regular", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("HOLO · TEMP", 0, h / 2 - 15);

  // Small corner screws / clamps.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      ctx.fillStyle = "rgba(210, 245, 255, 0.55)";
      ctx.beginPath();
      ctx.arc(sx * (w / 2 - 4), sy * (h / 2 - 7), 1.2, 0, TAU);
      ctx.fill();
    }
  }

  // Impact flash ring.
  const flash = Math.max(obstacle.flash || 0, 0);
  if (flash > 0.02) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${flash * 0.7})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(w, h) * 0.58 + (1 - flash) * 20, 0, TAU);
    ctx.stroke();
  }

  ctx.restore();
}

function flashLike(obstacle) {
  return Math.max(obstacle.flash || 0, obstacle.spawn || 0);
}

function drawCar(ctx, obstacle, now, palette) {
  const w = obstacle.w;
  const h = obstacle.h;
  const accent = obstacle.accent || palette.primary;
  const accent2 = obstacle.accent2 || palette.tertiary;
  const direction = obstacle.dir || 1;

  ctx.save();
  ctx.translate(obstacle.x, obstacle.y);

  // Hover glow and trail.
  const hover = ctx.createRadialGradient(0, h * 0.68, 1, 0, h * 0.68, w * 0.7);
  hover.addColorStop(0, `rgba(${palette.primaryRgb}, ${0.28 + obstacle.flash * 0.2})`);
  hover.addColorStop(1, `rgba(${palette.primaryRgb}, 0)`);
  ctx.fillStyle = hover;
  ctx.beginPath();
  ctx.ellipse(0, h * 0.7, w * 0.7, 10, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.26)`;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([8, 8]);
  ctx.lineDashOffset = direction * now * 0.02;
  ctx.beginPath();
  ctx.moveTo(-w * 0.5 - direction * 22, h * 0.2);
  ctx.lineTo(-w * 0.5 - direction * 4, h * 0.2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.scale(direction, 1);

  // Body.
  const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  body.addColorStop(0, "rgba(30, 48, 78, 0.98)");
  body.addColorStop(0.42, "rgba(12, 22, 42, 0.99)");
  body.addColorStop(1, "rgba(6, 10, 22, 0.99)");
  ctx.fillStyle = body;
  roundRectPath(ctx, -w / 2, -h / 2, w, h, obstacle.radius);
  ctx.fill();
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, ${0.55 + obstacle.flash * 0.3})`;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // Cockpit.
  const cockpit = ctx.createLinearGradient(-w * 0.18, -h * 0.38, -w * 0.04, h * 0.1);
  cockpit.addColorStop(0, "rgba(150, 240, 255, 0.8)");
  cockpit.addColorStop(1, "rgba(40, 80, 140, 0.24)");
  ctx.fillStyle = cockpit;
  roundRectPath(ctx, -w * 0.24, -h * 0.34, w * 0.34, h * 0.46, 5);
  ctx.fill();

  // Neon side stripe.
  ctx.fillStyle = `rgba(${palette.primaryRgb}, 0.7)`;
  ctx.fillRect(-w * 0.44, h * 0.2, w * 0.88, 1.6);
  ctx.fillStyle = `rgba(${palette.secondRgb}, 0.5)`;
  ctx.fillRect(-w * 0.42, -h * 0.2, w * 0.84, 1.1);

  // Head and tail lights, with a short light cone in front.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const cone = ctx.createLinearGradient(w * 0.38, 0, w * 0.78, 0);
  cone.addColorStop(0, "rgba(255, 250, 210, 0.28)");
  cone.addColorStop(1, "rgba(255, 250, 210, 0)");
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(w * 0.35, -h * 0.18);
  ctx.lineTo(w * 0.82, -h * 0.4);
  ctx.lineTo(w * 0.82, h * 0.14);
  ctx.lineTo(w * 0.35, h * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#fffbe0";
  ctx.beginPath();
  ctx.arc(w * 0.4, -h * 0.16, 2.2, 0, TAU);
  ctx.arc(w * 0.4, h * 0.16, 2.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(${palette.secondRgb}, 0.9)`;
  ctx.beginPath();
  ctx.arc(-w * 0.44, -h * 0.18, 2, 0, TAU);
  ctx.arc(-w * 0.44, h * 0.18, 2, 0, TAU);
  ctx.fill();

  // Warning chevrons on the roof.
  ctx.strokeStyle = accent2;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-w * 0.06 + i * 7, -h * 0.05);
    ctx.lineTo(-w * 0.02 + i * 7, 0);
    ctx.lineTo(-w * 0.06 + i * 7, h * 0.05);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawRotor(ctx, obstacle, now) {
  const accent = obstacle.accent || "#22e6ff";
  const active = obstacle.mode === "active";
  const half = obstacle.length / 2;

  ctx.save();
  ctx.translate(obstacle.x, obstacle.y);

  // Motion halo.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, half + 18);
  halo.addColorStop(0, `${accent}55`);
  halo.addColorStop(0.7, `${accent}18`);
  halo.addColorStop(1, `${accent}00`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, half + 18, 0, TAU);
  ctx.fill();
  ctx.restore();

  const drawArm = (angle, alpha, width) => {
    ctx.save();
    ctx.rotate(angle);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.shadowColor = accent;
    ctx.shadowBlur = active ? 16 : 8;
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = Math.max(1, width * 0.24);
    ctx.beginPath();
    ctx.moveTo(-half * 0.88, -1);
    ctx.lineTo(half * 0.88, -1);
    ctx.stroke();
    ctx.restore();
  };

  if (obstacle.arms === 2) {
    drawArm(obstacle.angle - (obstacle.omega || 0) * 0.028, 0.22, obstacle.thickness * 1.7);
    drawArm(obstacle.angle, 0.95, obstacle.thickness);
  } else {
    for (let arm = 0; arm < obstacle.arms; arm += 1) {
      ctx.save();
      ctx.rotate(obstacle.angle + (arm / obstacle.arms) * TAU);
      ctx.strokeStyle = accent;
      ctx.lineWidth = obstacle.thickness;
      ctx.lineCap = "round";
      ctx.shadowColor = accent;
      ctx.shadowBlur = active ? 14 : 7;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(half, 0);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = Math.max(1, obstacle.thickness * 0.22);
      ctx.beginPath();
      ctx.moveTo(6, -1);
      ctx.lineTo(half - 2, -1);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Hub.
  const hub = ctx.createRadialGradient(-2, -3, 1, 0, 0, 13);
  hub.addColorStop(0, "#f6ffff");
  hub.addColorStop(0.35, accent);
  hub.addColorStop(1, "#0b1626");
  ctx.fillStyle = hub;
  ctx.beginPath();
  ctx.arc(0, 0, active ? 9 : 7, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();

  if (!active) {
    ctx.strokeStyle = `${accent}aa`;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 4]);
    ctx.lineDashOffset = -now * 0.01;
    ctx.beginPath();
    ctx.arc(0, 0, obstacle.length * 0.62, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawBumper(ctx, obstacle, now, palette) {
  const accent = obstacle.accent || palette.primary;

  ctx.save();
  ctx.translate(obstacle.x, obstacle.y);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(0, 0, 3, 0, 0, obstacle.r * 2.1);
  halo.addColorStop(0, `${accent}66`);
  halo.addColorStop(0.55, `${accent}22`);
  halo.addColorStop(1, `${accent}00`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, obstacle.r * 2.1, 0, TAU);
  ctx.fill();
  ctx.restore();

  const disc = ctx.createRadialGradient(-4, -5, 1, 0, 0, obstacle.r);
  disc.addColorStop(0, "#ffffff");
  disc.addColorStop(0.28, accent);
  disc.addColorStop(0.82, "#112033");
  disc.addColorStop(1, "#060b16");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(0, 0, obstacle.r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `${accent}`;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, obstacle.r - 5, 0, TAU);
  ctx.stroke();

  ctx.save();
  ctx.rotate(now * 0.0015);
  ctx.strokeStyle = `${accent}`;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * TAU;
    ctx.beginPath();
    ctx.arc(0, 0, obstacle.r * 0.58, angle, angle + 0.38);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = "#eafff6";
  ctx.font = '900 15px "SFMono-Regular", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(obstacle.label || "◆", 0, 1);

  if (obstacle.flash > 0.02) {
    ctx.strokeStyle = `rgba(255,255,255,${obstacle.flash * 0.75})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, obstacle.r + 5 + (1 - obstacle.flash) * 18, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPortalGate(ctx, x, y, radius, accent, label, now, phase = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, radius * 2);
  halo.addColorStop(0, `${accent}77`);
  halo.addColorStop(0.5, `${accent}22`);
  halo.addColorStop(1, `${accent}00`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 2, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Portal hole.
  const hole = ctx.createRadialGradient(0, 0, 2, 0, 0, radius);
  hole.addColorStop(0, "rgba(2, 5, 12, 0.98)");
  hole.addColorStop(0.72, "rgba(4, 8, 18, 0.94)");
  hole.addColorStop(1, `${accent}cc`);
  ctx.fillStyle = hole;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.lineDashOffset = now * 0.02 * (phase ? -1 : 1);
  ctx.beginPath();
  ctx.arc(0, 0, radius - 5, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  // Swirl.
  ctx.save();
  ctx.rotate(now * 0.003 + phase * 2);
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * TAU;
    ctx.strokeStyle = `${accent}${i === 0 ? "dd" : "77"}`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, radius * (0.32 + i * 0.2), angle, angle + 1.5);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = "#f2fff9";
  ctx.font = '900 13px "SFMono-Regular", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

function drawPortal(ctx, obstacle, now) {
  const a = obstacle.a;
  const b = obstacle.b;

  // A faint link makes the paired gates legible without giving away too much.
  ctx.save();
  ctx.strokeStyle = `rgba(${hexToRgb(obstacle.accentA)}, 0.14)`;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 9]);
  ctx.lineDashOffset = -now * 0.01;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.bezierCurveTo(a.x + 90, a.y - 70, b.x - 90, b.y - 70, b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  if (obstacle.flash > 0.02) {
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${obstacle.flash * 0.4})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(a.x, a.y, obstacle.r + 8 + (1 - obstacle.flash) * 26, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x, b.y, obstacle.r + 8 + (1 - obstacle.flash) * 26, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawPortalGate(ctx, a.x, a.y, obstacle.r, obstacle.accentA || "#5cffb0", obstacle.labelA || "A", now, 0);
  drawPortalGate(ctx, b.x, b.y, obstacle.r, obstacle.accentB || "#b96bff", obstacle.labelB || "B", now, 1);
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (clean.length !== 6) return "92,255,176";
  const value = Number.parseInt(clean, 16);
  if (!Number.isFinite(value)) return "92,255,176";
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
}

function withPalette(palette = {}) {
  return {
    primary: palette.primary || "#22e6ff",
    secondary: palette.secondary || "#ff2fb3",
    tertiary: palette.tertiary || "#ffe04a",
    primaryRgb: hexToRgb(palette.primary || "#22e6ff"),
    secondRgb: hexToRgb(palette.secondary || "#ff2fb3"),
  };
}

/** Draw every obstacle above the playfield but below the marble. */
export function drawObstacles(ctx, obstacles = [], now, palette = {}, options = {}) {
  if (!obstacles.length) return;
  const colors = withPalette(palette);
  ctx.save();
  if (options.clipMainField) {
    ctx.beginPath();
    ctx.rect(MAIN_FIELD_CLIP.x, MAIN_FIELD_CLIP.y, MAIN_FIELD_CLIP.w, MAIN_FIELD_CLIP.h);
    ctx.clip();
  }

  for (const obstacle of obstacles) {
    if (obstacle.type === "block") {
      if (obstacle.style === "billboard") drawBillboard(ctx, obstacle, now, colors);
      else drawTower(ctx, obstacle, now, colors);
    }
  }
  for (const obstacle of obstacles) {
    if (obstacle.type === "rotor") drawRotor(ctx, obstacle, now);
    else if (obstacle.type === "bumper") drawBumper(ctx, obstacle, now, colors);
    else if (obstacle.type === "portal") drawPortal(ctx, obstacle, now);
  }
  for (const obstacle of obstacles) {
    if (obstacle.type === "mover") drawCar(ctx, obstacle, now, colors);
  }
  ctx.restore();
}

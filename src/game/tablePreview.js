/* ============================================================
   Shop thumbnails
   Draws a scaled-down, static snapshot of a table from the same
   layout recipes the physics engine consumes.
   ============================================================ */

import { INNER, MAIN_RIGHT, SLOT, LANE } from "./config.js";

const BASE_W = 720;
const BASE_H = 1240;

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (clean.length !== 6) return "34,230,255";
  const value = Number.parseInt(clean, 16);
  if (!Number.isFinite(value)) return "34,230,255";
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
}

function archPoints(table) {
  const arch = table?.layout?.arch;
  if (arch?.kind === "polyline" && arch.points?.length) return arch.points;
  const points = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = Math.PI - (i / 16) * Math.PI;
    points.push({
      x: INNER.cx + INNER.rx * Math.cos(t),
      y: INNER.cy - INNER.ry * Math.sin(t),
    });
  }
  return points;
}

function fieldPath(ctx, table) {
  const points = archPoints(table);
  ctx.beginPath();
  ctx.moveTo(INNER.left, INNER.bottom);
  ctx.lineTo(INNER.left, points[0].y);
  for (const point of points) ctx.lineTo(point.x, point.y);
  ctx.lineTo(INNER.right, INNER.bottom);
  ctx.closePath();
}

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

/** Render directly into a shop card's canvas. */
export function drawTablePreview(canvas, table) {
  if (!canvas || !table) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = Math.max(1, canvas.clientWidth || 92);
  const cssHeight = Math.max(1, canvas.clientHeight || 158);
  const width = Math.round(cssWidth * dpr);
  const height = Math.round(cssHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const scale = Math.min(width / BASE_W, height / BASE_H);
  const offsetX = (width - BASE_W * scale) / 2;
  const offsetY = (height - BASE_H * scale) / 2;
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

  const palette = table.palette || {};
  const primary = palette.primary || "#22e6ff";
  const secondary = palette.secondary || "#ff2fb3";
  const tertiary = palette.tertiary || "#ffe04a";
  const primaryRgb = hexToRgb(primary);
  const secondaryRgb = hexToRgb(secondary);
  const deep = palette.deep || "#04060f";
  const background = palette.background || "#070d1c";
  const classic = table.art === "classic";

  // Frame.
  ctx.fillStyle = classic ? "#211a13" : "#060b16";
  roundRectPath(ctx, 26, 22, 668, 1196, 46);
  ctx.fill();
  ctx.strokeStyle = classic ? "rgba(231, 181, 102, 0.35)" : `rgba(${primaryRgb}, 0.55)`;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Playfield.
  fieldPath(ctx, table);
  const field = ctx.createLinearGradient(0, 40, 0, 1180);
  if (classic) {
    field.addColorStop(0, "#f8f2e6");
    field.addColorStop(1, "#dfd1b6");
  } else {
    field.addColorStop(0, background);
    field.addColorStop(1, deep);
  }
  ctx.fillStyle = field;
  ctx.fill();

  ctx.save();
  fieldPath(ctx, table);
  ctx.clip();

  if (!classic) {
    ctx.strokeStyle = `rgba(${primaryRgb}, 0.08)`;
    ctx.lineWidth = 1.2;
    for (let x = 100; x < 640; x += 56) {
      ctx.beginPath();
      ctx.moveTo(x, 60);
      ctx.lineTo(x, 1180);
      ctx.stroke();
    }
    for (let y = 120; y < 1180; y += 56) {
      ctx.beginPath();
      ctx.moveTo(82, y);
      ctx.lineTo(638, y);
      ctx.stroke();
    }
  }

  // Slot bank.
  ctx.fillStyle = classic ? "rgba(86, 66, 42, 0.08)" : `rgba(${primaryRgb}, 0.08)`;
  ctx.fillRect(SLOT.x0, SLOT.top, SLOT.x1 - SLOT.x0, SLOT.floor - SLOT.top);
  for (let i = 0; i <= SLOT.count; i += 1) {
    const x = SLOT.x0 + i * SLOT.width;
    ctx.strokeStyle = classic ? "rgba(82, 67, 47, 0.32)" : `rgba(${primaryRgb}, 0.22)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, SLOT.top);
    ctx.lineTo(x, SLOT.floor);
    ctx.stroke();
  }
  ctx.fillStyle = classic ? "rgba(221, 59, 44, 0.32)" : `rgba(${secondaryRgb}, 0.34)`;
  ctx.fillRect(SLOT.x0, SLOT.top, SLOT.x1 - SLOT.x0, 16);

  // Launch lane.
  ctx.fillStyle = classic ? "rgba(86, 66, 42, 0.06)" : `rgba(${primaryRgb}, 0.05)`;
  ctx.fillRect(LANE.left, LANE.dividerTop, INNER.right - LANE.left, 770);
  ctx.strokeStyle = classic ? "rgba(74, 60, 43, 0.4)" : `rgba(${primaryRgb}, 0.32)`;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(LANE.left, LANE.dividerTop);
  ctx.lineTo(LANE.left, LANE.dividerBottom);
  ctx.stroke();

  // Pegs.
  for (const peg of table.layout?.pegs || []) {
    const r = Math.max(3, peg.r);
    if (peg.kind === "splitter" || !classic) {
      const color = peg.hue === "magenta" || peg.hue === "violet" ? secondary : peg.hue === "yellow" ? tertiary : primary;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(peg.x, peg.y - r * 1.2);
      ctx.lineTo(peg.x + r, peg.y);
      ctx.lineTo(peg.x, peg.y + r * 1.2);
      ctx.lineTo(peg.x - r, peg.y);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = "#5e5040";
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Obstacles.
  for (const obstacle of table.layout?.obstacles || []) {
    if (obstacle.type === "mover") {
      ctx.fillStyle = `rgba(${primaryRgb}, 0.9)`;
      roundRectPath(ctx, obstacle.path[0].x, obstacle.path[0].y - obstacle.h / 2, obstacle.w, obstacle.h, obstacle.radius);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (obstacle.type === "block") {
      const color = obstacle.accent || primary;
      const left = obstacle.x - obstacle.w / 2;
      const top = obstacle.y - obstacle.h / 2;
      if (obstacle.style === "billboard") {
        // Holographic ad board: dark screen, neon frame and a small base.
        ctx.fillStyle = "rgba(6, 12, 24, 0.96)";
        roundRectPath(ctx, left, top, obstacle.w, obstacle.h - 7, 5);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.32;
        ctx.fillRect(left + 6, top + 8, obstacle.w - 12, obstacle.h - 25);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(7, 10, 20, 0.98)";
        ctx.fillRect(left + 7, top + obstacle.h - 9, obstacle.w - 14, 6);
        ctx.font = '700 11px "SFMono-Regular", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(obstacle.sign || "AD", obstacle.x, top + obstacle.h / 2 - 3);
      } else {
        ctx.fillStyle = "rgba(8, 16, 32, 0.96)";
        roundRectPath(ctx, left, top, obstacle.w, obstacle.h, obstacle.radius);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.28;
        for (let wy = top + 8; wy < top + obstacle.h - 8; wy += 13) {
          ctx.fillRect(left + 7, wy, obstacle.w - 14, 3);
        }
        ctx.globalAlpha = 1;
      }
    } else if (obstacle.type === "rotor") {
      ctx.save();
      ctx.translate(obstacle.x, obstacle.y);
      ctx.rotate(obstacle.initialAngle || 0);
      ctx.strokeStyle = obstacle.accent || primary;
      ctx.shadowColor = obstacle.accent || primary;
      ctx.shadowBlur = 10;
      ctx.lineWidth = obstacle.thickness;
      ctx.lineCap = "round";
      const half = obstacle.length / 2;
      if (obstacle.arms === 2) {
        ctx.beginPath();
        ctx.moveTo(-half, 0);
        ctx.lineTo(half, 0);
        ctx.stroke();
      } else {
        for (let arm = 0; arm < obstacle.arms; arm += 1) {
          ctx.save();
          ctx.rotate((arm / obstacle.arms) * Math.PI * 2);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(half, 0);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (obstacle.type === "bumper") {
      ctx.fillStyle = obstacle.accent || primary;
      ctx.shadowColor = obstacle.accent || primary;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (obstacle.type === "wheel") {
      const angles = obstacle.sectors?.length || 12;
      const step = (Math.PI * 2) / angles;
      ctx.save();
      ctx.translate(obstacle.x, obstacle.y);
      ctx.fillStyle = "rgba(20, 3, 9, 0.96)";
      ctx.beginPath();
      ctx.arc(0, 0, obstacle.r, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < angles; i += 1) {
        const start = -Math.PI / 2 + i * step - step / 2;
        const end = start + step;
        const kind = obstacle.sectors?.[i]?.kind || "boost";
        ctx.fillStyle =
          kind === "boost"
            ? "rgba(246, 196, 83, 0.45)"
            : kind === "lose"
              ? "rgba(255, 59, 92, 0.4)"
              : kind === "add"
                ? "rgba(69, 240, 200, 0.35)"
                : "rgba(120, 30, 110, 0.58)";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, obstacle.r - 5, start, end);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(246, 196, 83, 0.45)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.strokeStyle = "#f6c453";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, obstacle.r + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#f6c453";
      ctx.beginPath();
      ctx.arc(0, 0, obstacle.r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff3c7";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -obstacle.r + 12);
      ctx.stroke();
      ctx.restore();
    } else if (obstacle.type === "portal") {
      for (const [point, color] of [
        [obstacle.a, obstacle.accentA || primary],
        [obstacle.b, obstacle.accentB || secondary],
      ]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(point.x, point.y, obstacle.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(2, 5, 12, 0.9)";
        ctx.beginPath();
        ctx.arc(point.x, point.y, obstacle.r - 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();

  // Frame highlights.
  fieldPath(ctx, table);
  ctx.strokeStyle = classic ? "rgba(73, 63, 48, 0.45)" : `rgba(${primaryRgb}, 0.65)`;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Title plate.
  ctx.fillStyle = classic ? "rgba(63, 52, 37, 0.55)" : "rgba(4, 10, 22, 0.8)";
  roundRectPath(ctx, 236, 116, 248, 30, 15);
  ctx.fill();
  ctx.fillStyle = classic ? "#3f3425" : primary;
  ctx.font = '800 15px "Avenir Next", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(table.en || table.name, 360, 132);
}

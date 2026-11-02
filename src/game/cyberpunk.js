/* ============================================================
   Cyberpunk table renderer
   A self-contained Canvas art pass used by any table whose
   `art` is "cyberpunk". It shares board geometry with the
   physics engine but owns its own palette, chrome, slots,
   plunger and obstacle backdrops.
   ============================================================ */

import { H, TAU, INNER, SLOT, LANE, GATE, SPRING, RAMP } from "./config.js";
import { clamp, lerp, easeInOutCubic } from "./utils.js";

/* ── Local helpers ───────────────────────────────────────── */

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

function drawSpacedText(ctx, text, centerX, y, spacing, font, color, alpha = 1) {
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

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (clean.length !== 6) return "34,230,255";
  const value = Number.parseInt(clean, 16);
  if (!Number.isFinite(value)) return "34,230,255";
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
}

function paletteOf(table) {
  const palette = table?.palette || {};
  const primary = palette.primary || "#22e6ff";
  const secondary = palette.secondary || "#ff2fb3";
  const tertiary = palette.tertiary || "#ffe04a";
  return {
    primary,
    secondary,
    tertiary,
    background: palette.background || "#070d1c",
    deep: palette.deep || "#04060f",
    primaryRgb: hexToRgb(primary),
    secondaryRgb: hexToRgb(secondary),
    tertiaryRgb: hexToRgb(tertiary),
  };
}

function hueColor(hue, palette) {
  if (hue === "magenta") return palette.secondary;
  if (hue === "yellow") return palette.tertiary;
  if (hue === "mint") return palette.primary;
  if (hue === "violet") return palette.secondary;
  return palette.primary;
}

function archPoints(table) {
  const arch = table?.layout?.arch;
  if (arch?.kind === "polyline" && arch.points?.length) return arch.points;
  // A safe fallback that mirrors the classic ellipse if a table forgets its arch.
  const points = [];
  for (let i = 0; i <= 18; i += 1) {
    const t = Math.PI - (i / 18) * Math.PI;
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

function chassisPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(50, 1194);
  ctx.lineTo(50, 306);
  ctx.lineTo(58, 246);
  ctx.lineTo(112, 100);
  ctx.lineTo(226, 48);
  ctx.lineTo(494, 48);
  ctx.lineTo(608, 100);
  ctx.lineTo(662, 246);
  ctx.lineTo(670, 306);
  ctx.lineTo(670, 1194);
  ctx.closePath();
}

function drawBolt(ctx, x, y, radius = 3.2, accent = "rgba(130, 230, 255, 0.32)") {
  ctx.save();
  ctx.fillStyle = "rgba(4, 9, 18, 0.92)";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - radius * 0.5, y);
  ctx.lineTo(x + radius * 0.5, y);
  ctx.moveTo(x, y - radius * 0.5);
  ctx.lineTo(x, y + radius * 0.5);
  ctx.stroke();
  ctx.restore();
}

/* ── Static cabinet ──────────────────────────────────────── */

export function drawCyberCabinet(ctx, now, table) {
  const palette = paletteOf(table);
  const points = archPoints(table);
  const simple = table?.variant === "retro";

  // Outer chassis.
  const chassis = ctx.createLinearGradient(0, 0, 0, H);
  chassis.addColorStop(0, "#101a33");
  chassis.addColorStop(0.42, "#0a1124");
  chassis.addColorStop(1, "#03050b");
  chassisPath(ctx);
  ctx.fillStyle = chassis;
  ctx.fill();
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.32)`;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Chassis bevel and neon side rails.
  ctx.save();
  chassisPath(ctx);
  ctx.clip();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();

  // Playfield base.
  const field = ctx.createLinearGradient(0, 40, 0, 1180);
  field.addColorStop(0, "#0b1830");
  field.addColorStop(0.42, "#070f20");
  field.addColorStop(0.78, "#050a17");
  field.addColorStop(1, "#03060e");
  fieldPath(ctx, table);
  ctx.fillStyle = field;
  ctx.fill();

  // Everything below is clipped to the playfield.
  ctx.save();
  fieldPath(ctx, table);
  ctx.clip();

  // Ambient city glow behind the dome.
  const domeGlow = ctx.createRadialGradient(360, 210, 20, 360, 210, 410);
  domeGlow.addColorStop(0, `rgba(${palette.primaryRgb}, 0.2)`);
  domeGlow.addColorStop(0.48, `rgba(${palette.secondaryRgb}, 0.08)`);
  domeGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = domeGlow;
  ctx.fillRect(60, 40, 600, 520);
  const lowGlow = ctx.createRadialGradient(360, 1060, 20, 360, 1060, 430);
  lowGlow.addColorStop(0, `rgba(${palette.secondaryRgb}, 0.12)`);
  lowGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = lowGlow;
  ctx.fillRect(60, 720, 600, 480);

  // Neon grid.
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.055)`;
  ctx.lineWidth = 1;
  for (let x = 90; x <= 630; x += 38) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 60);
    ctx.lineTo(x + 0.5, 1180);
    ctx.stroke();
  }
  for (let y = 70; y <= 1180; y += 38) {
    ctx.beginPath();
    ctx.moveTo(80, y + 0.5);
    ctx.lineTo(640, y + 0.5);
    ctx.stroke();
  }

  if (!simple) {
    // Circuit traces.
    const traces = [
      [
        [96, 340],
        [140, 340],
        [140, 390],
        [188, 390],
      ],
      [
        [624, 360],
        [580, 360],
        [580, 430],
        [540, 430],
      ],
      [
        [104, 930],
        [148, 930],
        [148, 880],
        [190, 880],
      ],
      [
        [616, 920],
        [564, 920],
        [564, 870],
        [522, 870],
      ],
    ];
    ctx.strokeStyle = `rgba(${palette.secondaryRgb}, 0.12)`;
    ctx.lineWidth = 1;
    for (const trace of traces) {
      ctx.beginPath();
      trace.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
      for (const [x, y] of trace) {
        ctx.fillStyle = `rgba(${palette.primaryRgb}, 0.22)`;
        ctx.beginPath();
        ctx.arc(x, y, 1.7, 0, TAU);
        ctx.fill();
      }
    }

    // Distant skyline silhouette behind the lower half.
    const skyline = [
      [96, 1080, 34, 100],
      [136, 1108, 26, 72],
      [168, 1068, 40, 112],
      [214, 1116, 22, 64],
      [244, 1092, 30, 88],
      [280, 1120, 20, 60],
      [306, 1076, 38, 104],
      [352, 1104, 26, 76],
      [386, 1084, 32, 96],
      [424, 1114, 22, 66],
      [452, 1072, 36, 108],
      [494, 1100, 28, 80],
      [528, 1080, 34, 100],
      [568, 1120, 22, 60],
      [596, 1090, 26, 90],
    ];
    for (const [x, y, w, h] of skyline) {
      ctx.fillStyle = "rgba(6, 12, 24, 0.78)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(80, 160, 220, 0.1)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      for (let wy = y + 10; wy < 1176; wy += 13) {
        for (let wx = x + 5; wx < x + w - 4; wx += 9) {
          ctx.fillStyle = `rgba(${palette.tertiaryRgb}, ${((wx + wy) % 17 === 0 ? 0.14 : 0.035)})`;
          ctx.fillRect(wx, wy, 2.4, 3.2);
        }
      }
    }
  }

  // Horizontal scanlines.
  ctx.fillStyle = "rgba(180, 235, 255, 0.014)";
  for (let y = 52; y < 1180; y += 4) ctx.fillRect(78, y, 562, 1);

  // Vignette.
  const vignette = ctx.createRadialGradient(360, 660, 320, 360, 660, 620);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(60, 40, 600, 1160);

  ctx.restore();

  // Neon arch outline.
  ctx.save();
  ctx.beginPath();
  points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.shadowColor = palette.primary;
  ctx.shadowBlur = 18;
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.86)`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(${palette.secondaryRgb}, 0.36)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  points.forEach((point, index) =>
    index === 0 ? ctx.moveTo(point.x + 2, point.y + 3) : ctx.lineTo(point.x + 2, point.y + 3),
  );
  ctx.stroke();
  ctx.restore();

  // Playfield edge rails.
  ctx.save();
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.24)`;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(INNER.left + 3, points[0].y + 4);
  ctx.lineTo(INNER.left + 3, INNER.bottom - 2);
  ctx.moveTo(INNER.right - 3, points[points.length - 1].y + 4);
  ctx.lineTo(INNER.right - 3, INNER.bottom - 2);
  ctx.stroke();
  ctx.restore();

  // Bottom lip.
  const base = ctx.createLinearGradient(0, 1162, 0, 1200);
  base.addColorStop(0, "#0b1428");
  base.addColorStop(1, "#02040a");
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.moveTo(46, 1162);
  ctx.lineTo(674, 1162);
  ctx.lineTo(670, 1200);
  ctx.lineTo(50, 1200);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.3)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(52, 1163);
  ctx.lineTo(668, 1163);
  ctx.stroke();

  // Side warning strips and bolts.
  for (let i = 0; i < 4; i += 1) {
    drawBolt(ctx, 62, 360 + i * 170, 2.7);
    drawBolt(ctx, 658, 360 + i * 170, 2.7);
  }
  drawBolt(ctx, 86, 1146, 3.2);
  drawBolt(ctx, 634, 1146, 3.2);

  // Tiny cabinet model plate.
  ctx.save();
  ctx.fillStyle = "rgba(7, 14, 28, 0.86)";
  roundRectPath(ctx, 286, 1152, 148, 18, 6);
  ctx.fill();
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.25)`;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = `rgba(${palette.primaryRgb}, 0.66)`;
  ctx.font = '700 7px "SFMono-Regular", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${table.en || "CYBER"} · ${simple ? "T-14" : "T-77"}`, 360, 1162);
  ctx.restore();
}

/* ── Dynamic marquee ─────────────────────────────────────── */

export function drawCyberMarquee(ctx, now, table) {
  const palette = paletteOf(table);
  const simple = table?.variant === "retro";
  const flicker =
    (Math.sin(now * 0.0053) + Math.sin(now * 0.011 + 1.7)) > -1.45
      ? 0.84 + Math.sin(now * 0.004) * 0.16
      : 0.34;

  ctx.save();
  ctx.textAlign = "center";

  // Neon tick ring around the dome.
  if (!simple) {
    for (let i = 0; i < 21; i += 1) {
      const angle = Math.PI + (i / 20) * Math.PI;
      const radiusX = 246;
      const radiusY = 246;
      const x = 360 + Math.cos(angle) * radiusX;
      const y = 330 + Math.sin(angle) * radiusY;
      ctx.fillStyle = `rgba(${palette.primaryRgb}, ${i % 5 === 0 ? 0.34 : 0.12})`;
      ctx.beginPath();
      ctx.arc(x, y, i % 5 === 0 ? 2 : 1.1, 0, TAU);
      ctx.fill();
    }
  }

  ctx.save();
  ctx.shadowColor = palette.secondary;
  ctx.shadowBlur = 18;
  drawSpacedText(
    ctx,
    table.en || "NEON CITY",
    360,
    142,
    8.5,
    '900 19px "Avenir Next", "SF Pro Display", sans-serif',
    `rgba(255, 255, 255, ${flicker})`,
    1,
  );
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const titleGlow = ctx.createRadialGradient(360, 142, 4, 360, 142, 175);
  titleGlow.addColorStop(0, `rgba(${palette.secondaryRgb}, ${0.12 * flicker})`);
  titleGlow.addColorStop(0.5, `rgba(${palette.primaryRgb}, ${0.07 * flicker})`);
  titleGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = titleGlow;
  ctx.fillRect(160, 86, 400, 112);
  ctx.restore();

  drawSpacedText(
    ctx,
    table.id === "warp"
      ? "QUANTUM PACHINKO · No.91"
      : table.id === "dusk"
        ? "RETRO PACHINKO · No.14"
        : "CYBER PACHINKO · No.77",
    360,
    170,
    2.4,
    '700 8px "SFMono-Regular", monospace',
    `rgba(${palette.primaryRgb}, 0.62)`,
    0.9,
  );

  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.24)`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(244, 184);
  ctx.lineTo(316, 184);
  ctx.moveTo(404, 184);
  ctx.lineTo(476, 184);
  ctx.stroke();
  ctx.fillStyle = `rgba(${palette.tertiaryRgb}, 0.55)`;
  ctx.beginPath();
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * TAU - Math.PI / 2;
    const x = 360 + Math.cos(angle) * 4;
    const y = 184 + Math.sin(angle) * 4;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  if (!simple) {
    // The dome centre becomes a holographic reticle, clear of the splitter pins.
    ctx.save();
    ctx.translate(360, 278);
    ctx.rotate(now * 0.00018);
    ctx.strokeStyle = `rgba(${palette.secondaryRgb}, 0.18)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([4, 10]);
    ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.22)`;
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * TAU;
      ctx.fillStyle = `rgba(${palette.tertiaryRgb}, 0.35)`;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * 39, Math.sin(angle) * 39, 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();
}

/* ── Peg field ───────────────────────────────────────────── */

export function drawCyberPegs(ctx, now, pegs, table) {
  const palette = paletteOf(table);

  // Faint field haze.
  const haze = ctx.createLinearGradient(0, 340, 0, 890);
  haze.addColorStop(0, `rgba(${palette.primaryRgb}, 0.035)`);
  haze.addColorStop(0.6, "rgba(0, 0, 0, 0)");
  haze.addColorStop(1, `rgba(${palette.secondaryRgb}, 0.035)`);
  ctx.fillStyle = haze;
  ctx.fillRect(88, 330, 496, 560);

  for (const peg of pegs) {
    if (peg.kind === "splitter") {
      drawSplitterPin(ctx, peg, now, palette);
    } else {
      drawNeonDomePin(ctx, peg, now, palette);
    }
  }
}

function drawSplitterPin(ctx, peg, now, palette) {
  const color = hueColor(peg.hue, palette);
  const rgb = hexToRgb(color);
  const phase = peg.phase || 0;
  const pulse = 0.62 + Math.sin(now * 0.0042 + phase) * 0.38;
  const flicker =
    Math.sin(now * 0.017 + phase * 3.1) > 0.96 ? 0.32 : 0.82 + Math.sin(now * 0.006 + phase) * 0.18;
  const glow = Math.max(peg.glow || 0, 0);
  const alpha = clamp(flicker + glow * 0.7, 0, 1.4);
  const radius = peg.r;

  ctx.save();

  // Halo.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(peg.x, peg.y, 1, peg.x, peg.y, radius * 4.6);
  halo.addColorStop(0, `rgba(${rgb}, ${0.3 * alpha})`);
  halo.addColorStop(0.45, `rgba(${rgb}, ${0.12 * alpha})`);
  halo.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(peg.x, peg.y, radius * 4.6, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Diamond body.
  ctx.save();
  ctx.translate(peg.x, peg.y);
  ctx.rotate(now * 0.00035 + phase * 0.4);
  const diamond = ctx.createRadialGradient(-radius * 0.3, -radius * 0.4, 1, 0, 0, radius * 1.3);
  diamond.addColorStop(0, "#ffffff");
  diamond.addColorStop(0.24, color);
  diamond.addColorStop(0.72, "rgba(10, 20, 38, 0.98)");
  diamond.addColorStop(1, "rgba(4, 8, 17, 0.98)");
  ctx.fillStyle = diamond;
  ctx.beginPath();
  ctx.moveTo(0, -radius * 1.22);
  ctx.lineTo(radius * 0.92, 0);
  ctx.lineTo(0, radius * 1.22);
  ctx.lineTo(-radius * 0.92, 0);
  ctx.closePath();
  ctx.fill();

  ctx.shadowColor = color;
  ctx.shadowBlur = 14 + pulse * 12;
  ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Splitter cross and core.
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.42 * alpha})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.5, 0);
  ctx.lineTo(radius * 0.5, 0);
  ctx.moveTo(0, -radius * 0.5);
  ctx.lineTo(0, radius * 0.5);
  ctx.stroke();
  ctx.fillStyle = `rgba(255, 255, 255, ${0.72 * alpha})`;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.2, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Pulse ring.
  ctx.strokeStyle = `rgba(${rgb}, ${0.18 + pulse * 0.3})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(peg.x, peg.y, radius + 4 + pulse * 4, 0, TAU);
  ctx.stroke();

  if (glow > 0.04) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${glow * 0.55})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, radius + 2 + (1 - glow) * 12, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawNeonDomePin(ctx, peg, now, palette) {
  const color = hueColor(peg.hue, palette);
  const rgb = hexToRgb(color);
  const pulse = 0.65 + Math.sin(now * 0.004 + (peg.phase || 0)) * 0.35;
  const glow = peg.glow || 0;

  ctx.save();
  if (glow > 0.01) {
    const halo = ctx.createRadialGradient(peg.x, peg.y, 1, peg.x, peg.y, 24 + glow * 12);
    halo.addColorStop(0, `rgba(${rgb}, ${0.3 * glow})`);
    halo.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, 24 + glow * 12, 0, TAU);
    ctx.fill();
  }
  const body = ctx.createRadialGradient(
    peg.x - peg.r * 0.35,
    peg.y - peg.r * 0.4,
    0.5,
    peg.x,
    peg.y,
    peg.r * 1.2,
  );
  body.addColorStop(0, "#ffffff");
  body.addColorStop(0.3, color);
  body.addColorStop(0.82, "#0a1424");
  body.addColorStop(1, "#04070e");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(peg.x, peg.y, peg.r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `rgba(${rgb}, ${0.52 + pulse * 0.25})`;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + pulse * 0.4})`;
  ctx.beginPath();
  ctx.arc(peg.x - peg.r * 0.28, peg.y - peg.r * 0.3, peg.r * 0.18, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ── Slots ───────────────────────────────────────────────── */

export function drawCyberSlots(ctx, now, game, table) {
  const palette = paletteOf(table);
  const isActiveRound = game.phase !== "idle" && game.litSlots.size > 0;

  ctx.save();

  // Recessed channel.
  const recess = ctx.createLinearGradient(0, SLOT.top - 8, 0, SLOT.floor + 8);
  recess.addColorStop(0, "rgba(8, 16, 32, 0.2)");
  recess.addColorStop(0.5, "rgba(5, 10, 22, 0.7)");
  recess.addColorStop(1, "rgba(3, 6, 14, 0.24)");
  ctx.fillStyle = recess;
  ctx.fillRect(SLOT.x0 - 2, SLOT.top - 6, SLOT.x1 - SLOT.x0 + 4, SLOT.floor - SLOT.top + 12);

  for (let i = 0; i < SLOT.count; i += 1) {
    const x = SLOT.x0 + i * SLOT.width;
    const centerX = x + SLOT.width / 2;
    const revealed = game.litReveal.has(i) && now >= game.litReveal.get(i);
    const lit = isActiveRound && game.litSlots.has(i) && revealed;
    const flash = game.flashSlot === i && now - game.flashAt < 850;
    const pulse = 0.65 + Math.sin(now * 0.0046 + i * 0.9) * 0.35;

    if (i % 2 === 1) {
      ctx.fillStyle = "rgba(120, 200, 255, 0.018)";
      ctx.fillRect(x + 1, SLOT.top + 2, SLOT.width - 2, SLOT.floor - SLOT.top - 3);
    }

    if (lit) {
      const beam = ctx.createLinearGradient(0, SLOT.top - 34, 0, SLOT.floor);
      beam.addColorStop(0, `rgba(${palette.primaryRgb}, ${0.04 + pulse * 0.04})`);
      beam.addColorStop(0.35, `rgba(${palette.primaryRgb}, ${0.22 + pulse * 0.12})`);
      beam.addColorStop(1, `rgba(${palette.secondaryRgb}, ${0.1 + pulse * 0.05})`);
      ctx.fillStyle = beam;
      ctx.fillRect(x + 2, SLOT.top - 34, SLOT.width - 4, SLOT.floor - SLOT.top + 34);

      const pocket = ctx.createLinearGradient(0, SLOT.top, 0, SLOT.floor);
      pocket.addColorStop(0, `rgba(${palette.primaryRgb}, ${0.34 + pulse * 0.08})`);
      pocket.addColorStop(0.66, `rgba(${palette.secondaryRgb}, 0.12)`);
      pocket.addColorStop(1, `rgba(${palette.secondaryRgb}, 0.02)`);
      ctx.fillStyle = pocket;
      ctx.fillRect(x + 2, SLOT.top, SLOT.width - 4, SLOT.floor - SLOT.top);

      ctx.strokeStyle = `rgba(${palette.primaryRgb}, ${0.46 + pulse * 0.3})`;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x + 3, SLOT.top + 2, SLOT.width - 6, SLOT.floor - SLOT.top - 6);

      ctx.fillStyle = `rgba(${palette.tertiaryRgb}, ${0.72 + pulse * 0.2})`;
      ctx.beginPath();
      ctx.moveTo(centerX, SLOT.top - 5);
      ctx.lineTo(centerX - 4.6, SLOT.top - 13);
      ctx.lineTo(centerX + 4.6, SLOT.top - 13);
      ctx.closePath();
      ctx.fill();

      const haloR = 30 + pulse * 8;
      const halo = ctx.createRadialGradient(centerX, SLOT.top + 23, 0, centerX, SLOT.top + 23, haloR);
      halo.addColorStop(0, `rgba(255, 255, 255, ${0.8 * pulse})`);
      halo.addColorStop(0.35, `rgba(${palette.primaryRgb}, ${0.34 * pulse})`);
      halo.addColorStop(1, `rgba(${palette.primaryRgb}, 0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(centerX, SLOT.top + 23, haloR, 0, TAU);
      ctx.fill();

      ctx.save();
      ctx.shadowColor = palette.primary;
      ctx.shadowBlur = 18;
      ctx.fillStyle = "#f4ffff";
      ctx.beginPath();
      ctx.arc(centerX, SLOT.top + 23, 5.2, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.7)`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(centerX, SLOT.top + 23, 7.2, 0, TAU);
      ctx.stroke();

      ctx.save();
      ctx.shadowColor = palette.secondary;
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#ffffff";
      ctx.font = '900 18px "Avenir Next", "PingFang SC", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`×${game.multiplier}`, centerX, SLOT.top + 57);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(150, 210, 255, 0.22)";
      ctx.beginPath();
      ctx.arc(centerX, SLOT.top + 23, 2.3, 0, TAU);
      ctx.fill();
    }

    if (flash) {
      const u = clamp((now - game.flashAt) / 850, 0, 1);
      ctx.fillStyle = `rgba(${palette.primaryRgb}, ${(1 - u) * 0.24})`;
      ctx.fillRect(x + 2, SLOT.top - 10, SLOT.width - 4, SLOT.floor - SLOT.top + 10);
      ctx.strokeStyle = `rgba(${palette.primaryRgb}, ${(1 - u) * 0.72})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, SLOT.top - 10, SLOT.width - 4, SLOT.floor - SLOT.top + 10);
    }

    ctx.fillStyle = lit ? `rgba(${palette.tertiaryRgb}, 0.9)` : "rgba(140, 180, 220, 0.32)";
    ctx.font = '600 9px "SFMono-Regular", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1).padStart(2, "0"), centerX, SLOT.floor - 10);
  }

  // Dividers.
  ctx.lineCap = "round";
  for (let i = 1; i < SLOT.count; i += 1) {
    const x = SLOT.x0 + i * SLOT.width;
    ctx.strokeStyle = "rgba(12, 26, 46, 0.94)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x, SLOT.top);
    ctx.lineTo(x, SLOT.floor);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.32)`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - 0.6, SLOT.top + 1);
    ctx.lineTo(x - 0.6, SLOT.floor - 1);
    ctx.stroke();
    ctx.fillStyle = `rgba(${palette.primaryRgb}, 0.4)`;
    ctx.beginPath();
    ctx.arc(x, SLOT.top, 2.3, 0, TAU);
    ctx.fill();
  }

  // Rails.
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.46)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(SLOT.x0, SLOT.top);
  ctx.lineTo(SLOT.x1, SLOT.top);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${palette.secondaryRgb}, 0.3)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(SLOT.x0, SLOT.floor);
  ctx.lineTo(SLOT.x1, SLOT.floor);
  ctx.stroke();

  ctx.fillStyle = `rgba(${palette.primaryRgb}, 0.36)`;
  ctx.font = '700 7px "SFMono-Regular", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("L U C K Y   S L O T S", 333, SLOT.top - 23);

  ctx.restore();
}

/* ── Launch lane / ramp / gate ───────────────────────────── */

export function drawCyberLaunchLane(ctx, now, game, table) {
  const palette = paletteOf(table);

  const lane = ctx.createLinearGradient(584, 0, 638, 0);
  lane.addColorStop(0, "rgba(5, 12, 25, 0.9)");
  lane.addColorStop(0.55, "rgba(11, 24, 46, 0.68)");
  lane.addColorStop(1, "rgba(4, 9, 20, 0.92)");
  ctx.fillStyle = lane;
  ctx.fillRect(584, 270, 54, 900);

  ctx.save();
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.38)`;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let i = 0; i < 4; i += 1) {
    const y = 620 + i * 26;
    ctx.beginPath();
    ctx.moveTo(601, y + 6);
    ctx.lineTo(611, y - 2);
    ctx.lineTo(621, y + 6);
    ctx.stroke();
  }
  ctx.restore();

  // Divider rail.
  ctx.save();
  const rail = ctx.createLinearGradient(578, 0, 592, 0);
  rail.addColorStop(0, "rgba(2, 6, 14, 0.9)");
  rail.addColorStop(0.42, "#163052");
  rail.addColorStop(0.58, "#0a1628");
  rail.addColorStop(1, "rgba(2, 6, 14, 0.9)");
  ctx.strokeStyle = rail;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(584, LANE.dividerTop);
  ctx.lineTo(584, LANE.dividerBottom);
  ctx.stroke();

  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.7)`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(581.3, LANE.dividerTop + 5);
  ctx.lineTo(581.3, LANE.dividerBottom - 5);
  ctx.stroke();

  ctx.strokeStyle = `rgba(${palette.secondaryRgb}, 0.28)`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(587, LANE.dividerTop + 16);
  ctx.lineTo(587, LANE.dividerBottom - 16);
  ctx.stroke();

  for (let y = 330; y < 1020; y += 86) {
    ctx.fillStyle = `rgba(${palette.primaryRgb}, 0.5)`;
    ctx.beginPath();
    ctx.arc(584, y, 1.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.5)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(611, 279, 23, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();

  ctx.fillStyle = `rgba(${palette.primaryRgb}, 0.62)`;
  ctx.font = '700 6.5px "SFMono-Regular", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("LAUNCH", 611, 306);

  if (game.phase === "idle" && game.gate < 0.05) {
    ctx.fillStyle = `rgba(${palette.secondaryRgb}, 0.45)`;
    ctx.font = '600 7px "PingFang SC", sans-serif';
    ctx.fillText("限位器", 611, 1037);
  }
}

export function drawCyberReturnRamp(ctx, now, game, table) {
  const palette = paletteOf(table);

  // Lower recess.
  const lower = ctx.createLinearGradient(0, SLOT.floor, 0, 1180);
  lower.addColorStop(0, "rgba(8, 18, 34, 0.72)");
  lower.addColorStop(0.7, "rgba(4, 9, 20, 0.5)");
  lower.addColorStop(1, "rgba(2, 5, 12, 0.8)");
  ctx.fillStyle = lower;
  ctx.beginPath();
  ctx.moveTo(82, SLOT.floor);
  ctx.lineTo(INNER.right, SLOT.floor);
  ctx.lineTo(INNER.right, INNER.bottom);
  ctx.lineTo(82, INNER.bottom);
  ctx.closePath();
  ctx.fill();

  const rampGradient = ctx.createLinearGradient(0, RAMP.y0, 0, RAMP.y1 + 22);
  rampGradient.addColorStop(0, "rgba(16, 36, 66, 0.42)");
  rampGradient.addColorStop(1, "rgba(4, 9, 20, 0.2)");
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

  ctx.save();
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.09)`;
  ctx.lineWidth = 1;
  for (let x = 122; x < 540; x += 33) {
    const y = lerp(RAMP.y0, RAMP.y1, (x - RAMP.x0) / (RAMP.x1 - RAMP.x0));
    ctx.beginPath();
    ctx.moveTo(x, y + 15);
    ctx.lineTo(x + 15, y + 4);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowColor = palette.primary;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.72)`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(RAMP.x0, RAMP.y0);
  ctx.quadraticCurveTo(360, 1066, RAMP.x1, RAMP.y1);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.58)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(RAMP.x0, RAMP.y0 - 2);
  ctx.quadraticCurveTo(360, 1064, RAMP.x1, RAMP.y1 - 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = `rgba(${palette.primaryRgb}, 0.5)`;
  ctx.font = '700 7px "SFMono-Regular", monospace';
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("RETURN", 114, 1096);
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(183 + i * 16, 1088);
    ctx.lineTo(191 + i * 16, 1096);
    ctx.lineTo(183 + i * 16, 1104);
    ctx.strokeStyle = `rgba(${palette.secondaryRgb}, 0.3)`;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }

  // Gate assembly.
  const gateOpen = easeInOutCubic(game.gate);
  const gateY = GATE.y;
  const leftX = 586;
  const rightX = 637;

  ctx.save();
  ctx.lineCap = "round";

  ctx.fillStyle = "rgba(14, 30, 54, 0.95)";
  roundRectPath(ctx, leftX - 4, gateY - 8, 11, 17, 3);
  ctx.fill();
  roundRectPath(ctx, rightX - 7, gateY - 8, 11, 17, 3);
  ctx.fill();

  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.75)`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(leftX, gateY);
  ctx.lineTo(lerp(leftX + 4, leftX + 2, gateOpen), gateY + 2 + gateOpen * 24);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rightX, gateY);
  ctx.lineTo(lerp(rightX - 4, rightX - 2, gateOpen), gateY + 2 + gateOpen * 24);
  ctx.stroke();

  const barHalf = 24 * (1 - gateOpen);
  if (barHalf > 0.5) {
    ctx.strokeStyle = `rgba(${palette.secondaryRgb}, 0.85)`;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(610 - barHalf, gateY);
    ctx.lineTo(610 + barHalf, gateY);
    ctx.stroke();
  }

  ctx.fillStyle = game.phase === "ready" || game.phase === "charging" ? palette.tertiary : "rgba(90, 120, 150, 0.5)";
  ctx.beginPath();
  ctx.arc(588, gateY + 10, 2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(${palette.primaryRgb}, 0.5)`;
  ctx.beginPath();
  ctx.arc(634, gateY + 10, 2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ── Spring / plunger ────────────────────────────────────── */

export function drawCyberSpring(ctx, now, game, table) {
  const palette = paletteOf(table);
  const isReady = game.phase === "ready" || game.phase === "charging";
  const charge = game.phase === "charging" ? game.charge : 0;
  const release = game.springRelease;
  let visualCharge = charge;

  if (release) {
    const age = (now - release.at) / 1000;
    if (age < 0.24) visualCharge = release.power * (1 - clamp(age / 0.24, 0, 1) ** 3);
    else game.springRelease = null;
  }

  const headY = 1136 + visualCharge * 42;
  const handleY = SPRING.baseHandleY + visualCharge * 24;
  const rodTop = headY + 4;
  const rodBottom = handleY - 10;

  ctx.save();

  // Launch cradle.
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.68)`;
  ctx.lineWidth = 3.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(610, 1123, 14, Math.PI * 0.15, Math.PI * 0.85, true);
  ctx.stroke();
  ctx.fillStyle = "rgba(5, 12, 24, 0.55)";
  ctx.beginPath();
  ctx.ellipse(610, 1136, 18, 3, 0, 0, TAU);
  ctx.fill();

  // Rod.
  ctx.strokeStyle = "rgba(120, 190, 240, 0.7)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(610, rodTop);
  ctx.lineTo(610, rodBottom);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.58)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(608, rodTop + 3);
  ctx.lineTo(608, rodBottom - 4);
  ctx.stroke();

  // Plunger head.
  ctx.fillStyle = "#173454";
  roundRectPath(ctx, 595, headY - 4, 30, 7, 3.5);
  ctx.fill();
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.6)`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Coil.
  const coils = Math.max(5, Math.round((handleY - headY - 15) / 7));
  const springBottom = handleY - 11;
  ctx.strokeStyle = `rgba(${palette.secondaryRgb}, 0.62)`;
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

  // Handle.
  const knobY = handleY;
  const knobGrad = ctx.createRadialGradient(604, knobY - 8, 2, 610, knobY, 25);
  knobGrad.addColorStop(0, "#d8f8ff");
  knobGrad.addColorStop(0.35, palette.primary);
  knobGrad.addColorStop(0.82, "#12304f");
  knobGrad.addColorStop(1, "#050b16");
  ctx.fillStyle = knobGrad;
  ctx.beginPath();
  ctx.arc(610, knobY, 22, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.8)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 255, 255, 0.3)`;
  ctx.lineWidth = 1.2;
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.moveTo(595, knobY - 6 + i * 6);
    ctx.lineTo(625, knobY - 6 + i * 6);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
  ctx.beginPath();
  ctx.arc(602, knobY - 9, 4.4, 0, TAU);
  ctx.fill();

  if (game.phase === "charging") {
    const percent = Math.round(game.charge * 100);
    const zone = game.charge < 0.34 ? "weak" : game.charge < 0.67 ? "mid" : game.charge < 0.995 ? "strong" : "full";
    const zoneColor =
      zone === "weak" ? palette.primary : zone === "mid" ? palette.tertiary : zone === "strong" ? "#ff9c5c" : "#ff5c7a";

    ctx.strokeStyle = "rgba(120, 180, 230, 0.16)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(610, knobY, 31, -Math.PI / 2, -Math.PI / 2 + TAU);
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = zoneColor;
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.shadowColor = zoneColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(610, knobY, 31, -Math.PI / 2, -Math.PI / 2 + TAU * game.charge);
    ctx.stroke();
    ctx.restore();

    roundRectPath(ctx, 610 - 43, knobY - 78, 86, 30, 15);
    ctx.fillStyle = "rgba(4, 10, 22, 0.94)";
    ctx.fill();
    ctx.strokeStyle = `rgba(${palette.primaryRgb}, 0.38)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = zoneColor;
    ctx.font = '800 16px "SFMono-Regular", "DIN Alternate", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${percent}%`, 610, knobY - 63);
  }

  if (isReady) {
    const pulse = 0.5 + Math.sin(now * 0.006) * 0.5;
    ctx.strokeStyle = `rgba(${palette.primaryRgb}, ${0.22 + pulse * 0.42})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(610, knobY, 30 + pulse * 5, 0, TAU);
    ctx.stroke();

    if (game.phase === "ready") {
      ctx.fillStyle = `rgba(${palette.tertiaryRgb}, 0.86)`;
      ctx.font = '750 13px "PingFang SC", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("拉", 566, knobY - 17);
      ctx.font = '700 17px "PingFang SC", sans-serif';
      ctx.fillText("↓", 566, knobY + 2);

      ctx.strokeStyle = `rgba(${palette.secondaryRgb}, 0.5)`;
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

export function drawCyberFocusGlow(ctx, now, game, table) {
  if ((!game.flashSlot && game.flashSlot !== 0) || now - game.flashAt > 850) return;
  const palette = paletteOf(table);
  const centerX = SLOT.x0 + (game.flashSlot + 0.5) * SLOT.width;
  const alpha = Math.max(0, 1 - (now - game.flashAt) / 850);
  const glow = ctx.createRadialGradient(centerX, 960, 4, centerX, 960, 125);
  glow.addColorStop(0, `rgba(${palette.primaryRgb}, ${0.3 * alpha})`);
  glow.addColorStop(0.45, `rgba(${palette.secondaryRgb}, ${0.13 * alpha})`);
  glow.addColorStop(1, `rgba(${palette.secondaryRgb}, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(centerX, 960, 125, 0, TAU);
  ctx.fill();
}

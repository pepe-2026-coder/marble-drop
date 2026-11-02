/* ============================================================
   Mother-ball skin catalog
   One definition drives the shop, the ball renderer, the trail,
   collision particles and the per-skin launch / impact sounds.
   Skins are cosmetic only: never read these values in physics.
   ============================================================ */

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

/**
 * A skin has five cosmetic channels:
 *  - ball:     gradient / pattern drawn on the mother ball
 *  - trail:    speed trail style, colour and lifetime
 *  - particles: palettes and shapes for peg, wall, launch and slot bursts
 *  - sound:    launch / peg / wall recipes played through the audio engine
 *  - shop:     name, English tag, tagline, trait chips and ticket price
 */
const DEFINITIONS = [
  {
    id: "ruby",
    name: "红宝石",
    en: "RUBY",
    tagline: "经典红玻璃，温暖而清脆。",
    particleLabel: "玻璃碎光",
    soundLabel: "清脆",
    price: 0,
    ball: {
      inner: "#ff9372",
      mid: "#f04a36",
      deep: "#c6251b",
      dark: "#80100d",
      stroke: "rgba(103, 15, 11, 0.55)",
      glow: "rgba(255, 91, 64, 0.32)",
      pattern: "none",
      patternColor: "rgba(255, 236, 224, 0.5)",
    },
    trail: {
      style: "comet",
      color: "228, 66, 46",
      accent: "#ffb09a",
      life: 260,
      alpha: 0.15,
      size: 0.46,
      width: 2.2,
    },
    particles: {
      peg: { colors: ["#e7b566", "#fff1cb", "#ff8f74"], shapes: ["spark"] },
      wall: { colors: ["#ffd9c6", "#e7b566", "#fff1cb"], shapes: ["spark"] },
      launch: { colors: ["#e7b566", "#f8ebd0", "#ff8f74"], shapes: ["spark"] },
      win: { colors: ["#e7b566", "#f8dd9e", "#dd3b2c", "#fff4d8"], shapes: ["spark", "confetti"] },
      lose: { colors: ["#9b8d78", "#b9a78d"], shapes: ["spark"] },
    },
    sound: {
      launch(power, sfx) {
        const p = clamp01(power);
        sfx.noise(0.18, 0.05, 1000);
        sfx.tone(110 + p * 30, 0.28, "sine", 0.065, 360 + p * 190);
      },
      peg(energy, sfx) {
        const e = Math.min(2, Math.max(0, energy));
        const base = 620 + Math.random() * 540;
        sfx.tone(base, 0.055, "triangle", Math.min(0.042, 0.012 + e * 0.022), 850 + Math.random() * 600);
      },
      wall(energy, sfx) {
        const e = Math.min(2, Math.max(0, energy));
        sfx.noise(0.05, Math.min(0.022, 0.008 + e * 0.009), 480);
      },
    },
  },
  {
    id: "gold",
    name: "鎏金",
    en: "GILDED",
    tagline: "黄铜光泽，带着金属碰撞的清亮余韵。",
    particleLabel: "金粉火花",
    soundLabel: "金属",
    price: 12,
    ball: {
      inner: "#fff6c9",
      mid: "#f6c95c",
      deep: "#d3962c",
      dark: "#76500f",
      stroke: "rgba(97, 63, 12, 0.55)",
      glow: "rgba(246, 201, 92, 0.34)",
      pattern: "stripe",
      patternColor: "rgba(255, 246, 201, 0.55)",
    },
    trail: {
      style: "streak",
      color: "246, 201, 92",
      accent: "#fff2c4",
      life: 240,
      alpha: 0.28,
      size: 0.44,
      width: 2.6,
    },
    particles: {
      peg: { colors: ["#fff4c9", "#e7b84c", "#ffd98a"], shapes: ["spark", "star"] },
      wall: { colors: ["#ffe9ad", "#c99a3d", "#fff7dd"], shapes: ["spark"] },
      launch: { colors: ["#fff4c9", "#f6c95c", "#ffd98a"], shapes: ["spark"] },
      win: { colors: ["#fff4c9", "#f6c95c", "#ffd98a", "#fffbe8"], shapes: ["star", "confetti"] },
      lose: { colors: ["#a08a62", "#c2a97a"], shapes: ["spark"] },
    },
    sound: {
      launch(power, sfx) {
        const p = clamp01(power);
        sfx.noise(0.16, 0.035, 1700);
        sfx.tone(180 + p * 40, 0.32, "triangle", 0.055, 520 + p * 220);
        sfx.tone(360 + p * 80, 0.24, "square", 0.018, 980 + p * 320, 0.02);
        sfx.tone(1250 + p * 300, 0.18, "sine", 0.02, 1800 + p * 400, 0.05);
      },
      peg(energy, sfx) {
        const e = Math.min(2, Math.max(0, energy));
        const base = 1180 + Math.random() * 420;
        sfx.tone(base, 0.07, "triangle", 0.008 + e * 0.018, base * 0.92);
        sfx.tone(base * 2.02, 0.05, "sine", 0.005 + e * 0.01, base * 1.9, 0.004);
        sfx.noise(0.03, 0.003 + e * 0.004, 3600);
      },
      wall(energy, sfx) {
        const e = Math.min(2, Math.max(0, energy));
        sfx.tone(200, 0.07, "triangle", 0.008 + e * 0.014, 150);
        sfx.noise(0.045, 0.006 + e * 0.008, 900);
      },
    },
  },
  {
    id: "jade",
    name: "青玉",
    en: "JADE",
    tagline: "温润青玉，落钉像木珠轻叩。",
    particleLabel: "青玉屑",
    soundLabel: "木质",
    price: 12,
    ball: {
      inner: "#d8ffec",
      mid: "#7fd6a7",
      deep: "#3fa87a",
      dark: "#185641",
      stroke: "rgba(18, 79, 57, 0.55)",
      glow: "rgba(92, 190, 145, 0.32)",
      pattern: "speck",
      patternColor: "rgba(216, 255, 236, 0.55)",
    },
    trail: {
      style: "bubble",
      color: "127, 214, 167",
      accent: "#d8ffec",
      life: 300,
      alpha: 0.18,
      size: 0.5,
      width: 1.6,
    },
    particles: {
      peg: { colors: ["#d8ffec", "#8ce0b5", "#3fa87a"], shapes: ["spark", "bubble"] },
      wall: { colors: ["#c9f0d8", "#6fbc93"], shapes: ["bubble"] },
      launch: { colors: ["#d8ffec", "#8ce0b5", "#5ccf9c"], shapes: ["spark"] },
      win: { colors: ["#d8ffec", "#8ce0b5", "#3fa87a", "#f2fff8"], shapes: ["star", "confetti"] },
      lose: { colors: ["#7c9a86", "#a9c4b4"], shapes: ["spark"] },
    },
    sound: {
      launch(power, sfx) {
        const p = clamp01(power);
        sfx.noise(0.12, 0.03, 700);
        sfx.tone(150 + p * 20, 0.24, "triangle", 0.05, 300 + p * 60);
        sfx.tone(80, 0.2, "sine", 0.03, 62, 0.01);
      },
      peg(energy, sfx) {
        const e = Math.min(2, Math.max(0, energy));
        const base = 540 + Math.random() * 220;
        sfx.tone(base, 0.06, "sine", 0.01 + e * 0.02, base * 0.82);
        sfx.noise(0.03, 0.002 + e * 0.004, 1500);
      },
      wall(energy, sfx) {
        const e = Math.min(2, Math.max(0, energy));
        sfx.noise(0.055, 0.006 + e * 0.008, 320);
        sfx.tone(160, 0.07, "triangle", 0.008 + e * 0.01, 110);
      },
    },
  },
  {
    id: "azure",
    name: "潮蓝",
    en: "TIDE",
    tagline: "深海流光，碰撞像水滴落在玻璃上。",
    particleLabel: "深海气泡",
    soundLabel: "水滴",
    price: 20,
    ball: {
      inner: "#e6fbff",
      mid: "#56b9ea",
      deep: "#2a7ee0",
      dark: "#0c2e66",
      stroke: "rgba(10, 47, 102, 0.55)",
      glow: "rgba(86, 185, 234, 0.4)",
      pattern: "ring",
      patternColor: "rgba(214, 246, 255, 0.62)",
    },
    trail: {
      style: "ribbon",
      color: "86, 185, 234",
      accent: "#e6fbff",
      life: 300,
      alpha: 0.22,
      size: 0.5,
      width: 3.4,
    },
    particles: {
      peg: { colors: ["#e6fbff", "#5cc8ff", "#2a7ee0"], shapes: ["bubble", "spark"] },
      wall: { colors: ["#bdefff", "#4aa8e8"], shapes: ["bubble"] },
      launch: { colors: ["#e6fbff", "#5cc8ff", "#8fe2ff"], shapes: ["bubble"] },
      win: { colors: ["#e6fbff", "#5cc8ff", "#2a7ee0", "#f4feff"], shapes: ["bubble", "confetti"] },
      lose: { colors: ["#6e8ba3", "#9ab6c9"], shapes: ["spark"] },
    },
    sound: {
      launch(power, sfx) {
        const p = clamp01(power);
        sfx.noise(0.22, 0.045, 900);
        sfx.tone(420 + p * 120, 0.3, "sine", 0.05, 140 + p * 40);
        sfx.tone(880, 0.18, "sine", 0.018, 300, 0.06);
      },
      peg(energy, sfx) {
        const e = Math.min(2, Math.max(0, energy));
        const base = 900 + Math.random() * 500;
        sfx.tone(base, 0.07, "sine", 0.008 + e * 0.018, base * 0.45);
        sfx.tone(base * 0.7, 0.06, "sine", 0.004 + e * 0.008, base * 0.3, 0.03);
        sfx.noise(0.025, 0.002 + e * 0.003, 2200);
      },
      wall(energy, sfx) {
        const e = Math.min(2, Math.max(0, energy));
        sfx.noise(0.1, 0.01 + e * 0.015, 1400);
        sfx.tone(180, 0.1, "sine", 0.008 + e * 0.012, 90);
      },
    },
  },
  {
    id: "neon",
    name: "霓虹",
    en: "NEON",
    tagline: "霓虹电弧，每一次碰撞都带电流。",
    particleLabel: "电弧星火",
    soundLabel: "电流",
    price: 28,
    ball: {
      inner: "#ffe6fb",
      mid: "#ff5edb",
      deep: "#a22bd8",
      dark: "#360a63",
      stroke: "rgba(74, 9, 105, 0.55)",
      glow: "rgba(255, 94, 219, 0.48)",
      pattern: "bolt",
      patternColor: "rgba(255, 231, 250, 0.8)",
    },
    trail: {
      style: "sparkle",
      color: "255, 94, 219",
      accent: "#8ff8ff",
      life: 220,
      alpha: 0.3,
      size: 0.46,
      width: 2,
    },
    particles: {
      peg: { colors: ["#ff7ae2", "#8ff8ff", "#ffffff"], shapes: ["star", "spark"] },
      wall: { colors: ["#ff9bea", "#8ff8ff"], shapes: ["spark"] },
      launch: { colors: ["#ff7ae2", "#8ff8ff", "#fff4ff"], shapes: ["star", "spark"] },
      win: { colors: ["#ff7ae2", "#8ff8ff", "#ffffff", "#ffd1f8"], shapes: ["star", "confetti"] },
      lose: { colors: ["#8a6f93", "#b39bc0"], shapes: ["spark"] },
    },
    sound: {
      launch(power, sfx) {
        const p = clamp01(power);
        sfx.noise(0.14, 0.04, 2600);
        sfx.tone(90 + p * 40, 0.18, "sawtooth", 0.03, 820 + p * 300);
        sfx.tone(300, 0.12, "square", 0.012, 1400 + p * 400, 0.03);
      },
      peg(energy, sfx) {
        const e = Math.min(2, Math.max(0, energy));
        const base = 1800 + Math.random() * 900;
        sfx.tone(base, 0.035, "square", 0.004 + e * 0.009, base * 0.7);
        sfx.noise(0.02, 0.002 + e * 0.003, 5000);
      },
      wall(energy, sfx) {
        const e = Math.min(2, Math.max(0, energy));
        sfx.noise(0.05, 0.006 + e * 0.008, 3200);
        sfx.tone(130, 0.06, "sawtooth", 0.006 + e * 0.008, 80);
      },
    },
  },
  {
    id: "obsidian",
    name: "曜夜",
    en: "OBSIDIAN",
    tagline: "黑曜星尘，碰撞声沉入深空。",
    particleLabel: "星尘",
    soundLabel: "低频",
    price: 36,
    ball: {
      inner: "#d9ccff",
      mid: "#6d4bc9",
      deep: "#2f1c66",
      dark: "#09051c",
      stroke: "rgba(18, 8, 48, 0.65)",
      glow: "rgba(109, 75, 201, 0.4)",
      pattern: "star",
      patternColor: "rgba(217, 204, 255, 0.62)",
    },
    trail: {
      style: "comet",
      color: "109, 75, 201",
      accent: "#d9ccff",
      life: 340,
      alpha: 0.2,
      size: 0.6,
      width: 2.4,
    },
    particles: {
      peg: { colors: ["#d9ccff", "#6d4bc9", "#efeaff"], shapes: ["spark", "star"] },
      wall: { colors: ["#b9a5ff", "#4b2f9a"], shapes: ["spark"] },
      launch: { colors: ["#d9ccff", "#6d4bc9", "#9b7cff"], shapes: ["star", "spark"] },
      win: { colors: ["#d9ccff", "#6d4bc9", "#efeaff", "#8b6cff"], shapes: ["star", "confetti"] },
      lose: { colors: ["#6b6480", "#948ca8"], shapes: ["spark"] },
    },
    sound: {
      launch(power, sfx) {
        const p = clamp01(power);
        sfx.tone(58 + p * 10, 0.38, "sine", 0.065, 150 + p * 30);
        sfx.tone(116, 0.28, "triangle", 0.03, 240, 0.02);
        sfx.noise(0.2, 0.035, 280);
      },
      peg(energy, sfx) {
        const e = Math.min(2, Math.max(0, energy));
        const base = 210 + Math.random() * 80;
        sfx.tone(base, 0.08, "sine", 0.012 + e * 0.02, base * 0.5);
        sfx.noise(0.04, 0.003 + e * 0.005, 380);
      },
      wall(energy, sfx) {
        const e = Math.min(2, Math.max(0, energy));
        sfx.tone(90, 0.12, "sine", 0.012 + e * 0.016, 52);
        sfx.noise(0.08, 0.008 + e * 0.01, 220);
      },
    },
  },
];

export const SKINS = Object.fromEntries(DEFINITIONS.map((skin) => [skin.id, skin]));
export const SKIN_LIST = DEFINITIONS;
export const DEFAULT_SKIN_ID = "ruby";

export function isSkinId(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(SKINS, id);
}

export function getSkin(id) {
  return isSkinId(id) ? SKINS[id] : SKINS[DEFAULT_SKIN_ID];
}

/** Colours exposed as CSS custom properties for the shop preview ball. */
export function skinCssVars(skin) {
  return [
    `--ball-inner:${skin.ball.inner}`,
    `--ball-mid:${skin.ball.mid}`,
    `--ball-deep:${skin.ball.deep}`,
    `--ball-dark:${skin.ball.dark}`,
    `--ball-line:${skin.ball.patternColor}`,
    `--ball-glow:${skin.ball.glow}`,
  ].join(";");
}

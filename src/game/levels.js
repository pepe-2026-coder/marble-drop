/* ============================================================
   闯关模式 · 关卡数据与纯规则
   ------------------------------------------------------------
   这一层不碰 DOM、不碰物理，只负责：
   1. 每一关的「规则」（目标洞、球数、配额）——认输时不变；
   2. 每一关的「牌面」（干扰钉、可破坏目标的位置）——由种子决定；
   3. 目标判定与星级计算。

   随机面必须足够大：认输只换牌面不换规则，如果牌面是空的，
   「换一副牌」就等于什么都没换。
   ============================================================ */

export const SLOT_COUNT = 12;

export const slotLabel = (index) => `${index + 1} 号洞`;

/* ── 种子随机 ────────────────────────────────────────────── */

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

/** Build a fresh seed for 认输 / first entry. */
export function makeSeed() {
  return (Math.floor(Math.random() * 0xffffffff) ^ (Date.now() & 0xffffffff)) >>> 0;
}

/* ── 道具 ────────────────────────────────────────────────── */

export const TOOL_DEFS = {
  magnet: {
    id: "magnet",
    name: "磁场",
    symbol: "◎",
    brief: "钉在钉子上，把路过的母球吸过去",
  },
  pad: {
    id: "pad",
    name: "挡板",
    symbol: "◉",
    brief: "放进钉阵，把母球弹向另一侧",
  },
  hammer: {
    id: "hammer",
    name: "锤子",
    symbol: "⌁",
    brief: "敲碎一颗钉子或一个可破坏目标",
  },
};

export const TOOL_ORDER = ["magnet", "pad", "hammer"];

export const LOADOUT_SLOTS = 2;

/* ── 关卡表 ──────────────────────────────────────────────── */

/**
 * 六关走完整条弧线：引导（1–2）→ 施压（3–4）→ 疯狂（5–6）。
 * `required` / `optional` / `avoid` 是规则，认输不换。
 * `interference` / `destroyCount` 是牌面规模，具体位置由种子决定。
 */
export const LEVELS = [
  {
    id: "oak-01",
    act: 1,
    name: "第一课",
    kicker: "THE FIRST LESSON",
    template: "precision",
    scene: "classic",
    balls: 3,
    interference: 2,
    destroyCount: 0,
    tools: ["magnet", "pad"],
    required: [{ id: "r1", type: "hole", slots: [3] }],
    optional: [{ id: "o1", type: "hole", slots: [9] }],
    avoid: [],
    quota: { magnet: 2, pad: 1, hammer: 0 },
    dealer: "guide",
  },
  {
    id: "oak-02",
    act: 1,
    name: "两处落脚",
    kicker: "TWO LANDINGS",
    template: "precision",
    scene: "classic",
    balls: 3,
    interference: 3,
    destroyCount: 0,
    tools: ["magnet", "pad"],
    required: [
      { id: "r1", type: "hole", slots: [2] },
      { id: "r2", type: "hole", slots: [8] },
    ],
    optional: [{ id: "o1", type: "hole", slots: [5] }],
    avoid: [],
    quota: { magnet: 2, pad: 1, hammer: 0 },
    dealer: "guide",
  },
  {
    id: "oak-03",
    act: 2,
    name: "先拆后落",
    kicker: "BREAK & DROP",
    template: "destroy",
    scene: "classic",
    balls: 3,
    interference: 3,
    destroyCount: 2,
    tools: ["magnet", "pad", "hammer"],
    required: [
      { id: "r1", type: "destroy", targets: ["t0", "t1"] },
      { id: "r2", type: "hole", slots: [6] },
    ],
    optional: [{ id: "o1", type: "hole", slots: [0] }],
    avoid: [],
    quota: { magnet: 2, pad: 1, hammer: 1 },
    dealer: "press",
  },
  {
    id: "oak-04",
    act: 2,
    name: "边角生意",
    kicker: "CORNER BUSINESS",
    template: "precision",
    scene: "classic",
    balls: 3,
    interference: 4,
    destroyCount: 0,
    tools: ["magnet", "pad", "hammer"],
    required: [
      { id: "r1", type: "hole", slots: [1] },
      { id: "r2", type: "hole", slots: [10] },
    ],
    optional: [{ id: "o1", type: "hole", slots: [6] }],
    avoid: [{ id: "a1", type: "avoid", slots: [5, 6] }],
    quota: { magnet: 2, pad: 1, hammer: 1 },
    dealer: "press",
  },
  {
    id: "oak-05",
    act: 3,
    name: "三枚筹码",
    kicker: "THREE CHIPS",
    template: "destroy",
    scene: "classic",
    balls: 4,
    interference: 4,
    destroyCount: 3,
    tools: ["magnet", "pad", "hammer"],
    required: [
      { id: "r1", type: "destroy", targets: ["t0", "t1", "t2"] },
      { id: "r2", type: "hole", slots: [8] },
    ],
    optional: [{ id: "o1", type: "hole", slots: [2] }],
    avoid: [{ id: "a1", type: "avoid", slots: [3] }],
    quota: { magnet: 2, pad: 1, hammer: 1 },
    dealer: "mad",
  },
  {
    id: "oak-06",
    act: 3,
    name: "本庄亲自下场",
    kicker: "THE HOUSE PLAYS",
    template: "boss",
    scene: "classic",
    balls: 4,
    interference: 3,
    destroyCount: 2,
    tools: ["magnet", "pad", "hammer"],
    required: [
      { id: "r1", type: "destroy", targets: ["t0", "t1"] },
      { id: "r2", type: "hole", slots: [7] },
    ],
    optional: [{ id: "o1", type: "hole", slots: [4] }],
    avoid: [{ id: "a1", type: "avoid", slots: [0, 11] }],
    quota: { magnet: 2, pad: 1, hammer: 1 },
    dealer: "mad",
    boss: true,
  },
];

export function getLevel(idOrIndex) {
  if (typeof idOrIndex === "number") return LEVELS[idOrIndex] || null;
  return LEVELS.find((level) => level.id === idOrIndex) || null;
}

export function levelIndex(id) {
  return LEVELS.findIndex((level) => level.id === id);
}

export function nextLevel(id) {
  const index = levelIndex(id);
  if (index < 0 || index >= LEVELS.length - 1) return null;
  return LEVELS[index + 1];
}

/* ── 牌面生成 ────────────────────────────────────────────── */

const MIN_GAP = 46;

function farEnough(list, x, y, gap) {
  return list.every((item) => Math.hypot(item.x - x, item.y - y) >= gap);
}

/**
 * 把一关的「牌面」展开成可以塞进物理世界的实体。
 * 同一关 + 同一种子 = 完全相同的牌面；认输换种子只换这里。
 */
export function buildBoard(spec, seed, tablePegs = []) {
  const rng = mulberry32((seed >>> 0) ^ (levelIndex(spec.id) + 1) * 7919);
  const blockers = tablePegs.map((peg) => ({ x: peg.x, y: peg.y }));

  const interference = [];
  const total = spec.interference || 0;
  let guard = 0;
  while (interference.length < total && guard < 240) {
    guard += 1;
    const x = 118 + rng() * 442;
    const y = 560 + rng() * 300;
    if (!farEnough(blockers, x, y, 17)) continue;
    if (!farEnough(interference, x, y, MIN_GAP + 10)) continue;
    interference.push({
      id: `ix-${interference.length}`,
      x: Math.round(x),
      y: Math.round(y),
      r: 6.6,
      kind: "splitter",
      hue: "purple",
      phase: rng() * 6.28,
    });
  }

  // 目标放在钉阵最下沿与奖槽口之间的窄带上。
  // 这里必须避开钉阵本身：钉阵横竖都是 50px 间隔，网格里根本塞不下一个
  // 直径 34px 的圆，所以目标只能落在最后一排钉子（y≈812）之下、
  // 奖槽口（y=900）之上这段"跑道"里。这也正好是母球必经的位置。
  const targets = [];
  const count = spec.destroyCount || 0;
  guard = 0;
  while (targets.length < count && guard < 600) {
    guard += 1;
    const x = 140 + rng() * 400;
    const y = 840 + rng() * 38;
    if (!farEnough(blockers, x, y, 26)) continue;
    if (!farEnough(interference, x, y, 30)) continue;
    if (!farEnough(targets, x, y, 72)) continue;
    targets.push({
      id: `t${targets.length}`,
      x: Math.round(x),
      y: Math.round(y),
      r: 17,
      hp: 2,
      maxHp: 2,
      hit: 0,
      flash: 0,
      dead: false,
    });
  }

  return { interference, targets };
}

/* ── 目标判定 ────────────────────────────────────────────── */

export function createObjectiveState() {
  return { holes: new Set(), destroyed: new Set(), violated: null };
}

/** 母球落入某个洞。返回是否踩中禁区。 */
export function applyLanding(state, slot, spec) {
  const avoid = spec.avoid || [];
  for (const rule of avoid) {
    if (rule.slots.includes(slot)) {
      state.violated = rule;
      return { failed: true, rule };
    }
  }
  state.holes.add(slot);
  return { failed: false };
}

export function applyDestroy(state, targetId) {
  state.destroyed.add(targetId);
}

function isDone(objective, state) {
  if (objective.type === "hole") {
    return objective.slots.every((slot) => state.holes.has(slot));
  }
  if (objective.type === "destroy") {
    return objective.targets.every((id) => state.destroyed.has(id));
  }
  return false;
}

function describe(objective) {
  if (objective.type === "hole") {
    const names = objective.slots.map(slotLabel).join("、");
    return objective.slots.length > 1 ? `落入 ${names}` : `落入 ${names}`;
  }
  if (objective.type === "destroy") {
    return `摧毁 ${objective.targets.length} 个目标`;
  }
  return "未知目标";
}

/** 目标清单（用于 HUD），带回显用的 done 状态与展示文案。 */
export function objectiveList(spec, state) {
  const required = (spec.required || []).map((objective) => ({
    id: objective.id,
    label: describe(objective),
    done: isDone(objective, state),
    optional: false,
  }));
  const optional = (spec.optional || []).map((objective) => ({
    id: objective.id,
    label: describe(objective),
    done: isDone(objective, state),
    optional: true,
  }));
  const avoid = (spec.avoid || []).map((rule) => ({
    id: rule.id,
    label: `避开 ${rule.slots.map(slotLabel).join("、")}`,
    done: false,
    guard: true,
  }));
  return { required, optional, avoid };
}

export function requiredDone(spec, state) {
  return (spec.required || []).every((objective) => isDone(objective, state));
}

export function optionalDone(spec, state) {
  const optional = spec.optional || [];
  return optional.length > 0 && optional.every((objective) => isDone(objective, state));
}

/**
 * 星级：通关 1 星，完成可选 +1，通关时还有省下的球 +1。
 * 「省下球」是唯一真正需要本事的指标，也是重打这一关的理由。
 */
export function starCount(spec, state, { cleared, ballsUsed }) {
  if (!cleared) return 0;
  let stars = 1;
  if (optionalDone(spec, state)) stars += 1;
  if (ballsUsed < spec.balls) stars += 1;
  return Math.min(3, stars);
}

/* ── 配额 ────────────────────────────────────────────────── */

/** 本关每个道具可用的次数（Boss 作弊会从这里扣）。 */
export function initialQuota(spec) {
  return { ...spec.quota };
}

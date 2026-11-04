/* ============================================================
   庄家 · 七
   ------------------------------------------------------------
   他不靠立绘存在，只靠「指」和「说」：
   一枚筹码指到哪，台词就说到哪，玩家就看向哪。

   三幕弧线：引导 → 施压 → 疯狂。
   同一串事件在不同幕里说不同的话，这是难度的人格化。
   ============================================================ */

export const DEALER_NAME = "庄家 · 七";
export const DEALER_BYNAME = "七爷";

export const DEALER_STAGES = ["guide", "press", "mad"];

export function stageForLevel(index) {
  if (index <= 1) return "guide";
  if (index <= 3) return "press";
  return "mad";
}

export const STAGE_LABEL = {
  guide: "本庄今天心情不错",
  press: "本庄开始不耐烦了",
  mad: "本庄已经不看牌了",
};

/* 台词一律短句：一条播报最长 1.2 秒，不阻塞操作。 */
const LINES = {
  guide: {
    intro: [
      "客人，看好了——{target}。本庄亲自给您指路。",
      "别紧张。{target}，就这么简单。",
      "{target}。做不到的话，后面会更难看。",
    ],
    hit: ["漂亮。就是这个意思。", "好球。本庄没看错人。", "对咯。再来。"],
    void: ["踩线了。这一球不算，别慌。", "禁区。刚说过的地方。没关系。"],
    nearMiss: ["差一点。别急，球自己会回来的。", "差一格。哎，可惜。"],
    destroy: ["拆得干净。", "手挺稳。"],
    clear: ["不错，客人。下一关给您加点料。", "过关了。本庄开始有点期待了。"],
    fail: ["哎呀。要不……本庄给您换一副牌？", "没关系。换一副，再来。"],
    surrender: ["换一副？行，客人说了算。", "这副牌您不喜欢？本庄再摆一副。"],
    cheat: ["本庄也来玩一手。"],
  },
  press: {
    intro: [
      "{target}。还是那句话，别让本庄等太久。",
      "这次也是{target}。您应该记住了。",
      "{target}。您上次可没做到。",
    ],
    hit: ["嗯。运气不错。", "勉强。", "看到了。继续。"],
    void: ["禁区。本庄画得很清楚了吧？", "又踩线。您是故意的吗？"],
    nearMiss: ["啧。手抖了？", "就差一点。真遗憾。"],
    destroy: ["拆吧拆吧，反正也救不了您。"],
    clear: ["勉强算您过关。", "运气。全是运气。"],
    fail: ["这就是您的水平？", "本庄早就想说了。"],
    surrender: ["又换？您倒是挺会挑。", "换牌不丢人。真的。"],
    cheat: ["这桌子的规矩，本庄说了算。"],
  },
  mad: {
    intro: [
      "规则没改。只是本庄更认真了。",
      "{target}。您要是还能过去，本庄把桌子吃了。",
      "又是{target}。本庄开始觉得无聊了。",
    ],
    hit: ["不可能。", "这不算。", "您——"],
    void: ["哈！踩线了！", "禁区！本庄看见了！"],
    nearMiss: ["哈哈哈哈。", "看，本庄说什么来着。"],
    destroy: ["您怎么敢！", "那可是本庄的筹码！"],
    clear: ["您作弊！……好吧，下一关。", "不可能。这不可能。"],
    fail: ["滚出去。……开玩笑的。再来。", "本庄早说了，您不行。"],
    surrender: ["换吧换吧，换多少副都一样。", "认输了？本庄记下了。"],
    cheat: ["本庄亲自下注！", "这张桌子，本庄说了算！"],
  },
};

function fill(template, vars) {
  if (!template) return "";
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = vars?.[key];
    return value === undefined ? match : String(value);
  });
}

export function pickLine(stage, event, vars = {}, random = Math.random) {
  const pool = LINES[stage]?.[event] || LINES.guide[event] || [];
  if (!pool.length) return "";
  return fill(pool[Math.floor(random() * pool.length) % pool.length], vars);
}

/** 观众永远比庄家热情。两边不同步，笑点才成立。 */
export const AUDIENCE = {
  cheer: "cheer",
  gasp: "gasp",
  hush: "hush",
};

/* ============================================================
   App shell: screen routing, arcade economy, shop and options.
   The canvas game is initialized by engine.js on import.
   ============================================================ */

import "./game/engine.js";
import { account, economy } from "./account.js";
import { audio, vibrate } from "./audio.js";
import { SKIN_LIST, getSkin, skinCssVars } from "./game/skins.js";
import { TABLE_LIST, getTable, tableCssVars } from "./game/tables.js";
import { LEVELS } from "./game/levels.js";
import { drawTablePreview } from "./game/tablePreview.js";
import { toast } from "./ui/toast.js";

const $ = (id) => document.getElementById(id);

const screens = {
  menu: $("menuScreen"),
  game: $("gameScreen"),
  shop: $("shopScreen"),
  options: $("optionsScreen"),
  exit: $("exitScreen"),
  settle: $("settleScreen"),
  challenge: $("challengeScreen"),
};

const menuMarbles = $("menuMarbles");
const menuCoins = $("menuCoins");
const menuTickets = $("menuTickets");
const menuRelief = $("menuRelief");
const menuReliefText = $("menuReliefText");
const menuReliefBtn = $("menuReliefBtn");
const arcadeSub = $("arcadeSub");
const challengeSub = $("challengeSub");
const levelList = $("levelList");
const dealerStripText = $("dealerStripText");

const shopMarbles = $("shopMarbles");
const shopCoins = $("shopCoins");
const shopTickets = $("shopTickets");
const shopRelief = $("shopRelief");
const shopReliefText = $("shopReliefText");
const shopReliefBtn = $("shopReliefBtn");
const ticketExchangeOne = $("ticketExchangeOne");
const ticketExchangeAll = $("ticketExchangeAll");
const coinBuySmall = $("coinBuySmall");
const coinBuyLarge = $("coinBuyLarge");
const skinGrid = $("skinGrid");
const skinEquippedName = $("skinEquippedName");
const tableGrid = $("tableGrid");
const tableEquippedName = $("tableEquippedName");
const tableTicketCapNote = $("tableTicketCapNote");
const helpTicketCap = $("helpTicketCap");

const arcadeDialog = $("arcadeDialog");
const arcadeDialogKicker = $("arcadeDialogKicker");
const arcadeDialogTitle = $("arcadeDialogTitle");
const arcadeDialogClose = $("arcadeDialogClose");
const arcadeChoiceView = $("arcadeChoiceView");
const arcadeSetupView = $("arcadeSetupView");
const continueRunBtn = $("continueRunBtn");
const continueRunMeta = $("continueRunMeta");
const newRunBtn = $("newRunBtn");
const arcadeSetupBack = $("arcadeSetupBack");
const arcadeWalletMarbles = $("arcadeWalletMarbles");
const stakeGrid = $("stakeGrid");
const arcadeStartBtn = $("arcadeStartBtn");
const arcadeReliefBtn = $("arcadeReliefBtn");
const arcadeSetupNote = $("arcadeSetupNote");

const settleReason = $("settleReason");
const settlePeak = $("settlePeak");
const settleTicketsEarned = $("settleTicketsEarned");
const settleStart = $("settleStart");
const settleReturned = $("settleReturned");
const settleRounds = $("settleRounds");
const settleMarbles = $("settleMarbles");
const settleCoins = $("settleCoins");
const settleTickets = $("settleTickets");
const settleNote = $("settleNote");

const volumeRange = $("volumeRange");
const volumeValue = $("volumeValue");
const muteToggle = $("muteToggle");
const hapticsToggle = $("hapticsToggle");
const payoutToggle = $("payoutToggle");
const helpDialog = $("helpDialog");

let currentScreen = "menu";
let shopReturnScreen = "menu";
let selectedStake = economy.MIN_RUN_STAKE;

const isBroke = (state) => {
  if (state.run?.active) return false;
  const potential =
    state.marbles +
    state.coins * economy.MARBLES_PER_COIN +
    state.tickets * economy.COINS_PER_TICKET * economy.MARBLES_PER_COIN;
  return state.marbles < economy.MIN_RUN_STAKE && potential < economy.MIN_RUN_STAKE;
};

function format(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function showScreen(name) {
  if (!screens[name]) return;
  if (name === "game" && !account.hasRun && document.body.dataset.mode !== "challenge") {
    openArcadeDialog();
    return;
  }
  currentScreen = name;
  Object.entries(screens).forEach(([key, screen]) => {
    screen.hidden = key !== name;
    if (key === name) screen.scrollTop = 0;
  });
  document.body.dataset.screen = name;

  if (name === "shop") {
    const state = account.snapshot();
    renderTableShop(state);
    renderSkinShop(state);
  }

  if (name === "challenge") {
    renderChallengeScreen();
  }

  if (name === "game") {
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("marble:game-shown"));
    });
  }
}

function openShop(returnTo = "menu") {
  shopReturnScreen = returnTo;
  showScreen("shop");
}

function openHelp() {
  audio.init();
  audio.click();
  if (typeof helpDialog.showModal === "function") helpDialog.showModal();
  else helpDialog.setAttribute("open", "");
}

function syncAccount(state) {
  menuMarbles.textContent = format(state.marbles);
  menuCoins.textContent = format(state.coins);
  menuTickets.textContent = format(state.tickets);
  shopMarbles.textContent = format(state.marbles);
  shopCoins.textContent = format(state.coins);
  shopTickets.textContent = format(state.tickets);
  settleMarbles.textContent = format(state.marbles);
  settleCoins.textContent = format(state.coins);
  settleTickets.textContent = format(state.tickets);

  const broke = isBroke(state);
  menuRelief.hidden = !broke;
  shopRelief.hidden = !broke;
  if (broke) {
    const relief = account.reliefAmount;
    menuReliefText.textContent = "弹珠不足以开始新游戏，可领取开局补助。";
    menuReliefBtn.textContent = `领取 ${format(relief)} 颗补助`;
    shopReliefText.textContent = "个人弹珠不足以开始新游戏，可领取开局补助。";
    shopReliefBtn.textContent = `领取 ${format(relief)} 颗补助`;
  }

  arcadeSub.textContent = state.run?.active
    ? `进行中 · 本局 ${format(state.run.marbles)} 颗 · 最高 ${format(state.run.peak)} 颗`
    : "选择 300 / 500 / 1000 颗弹珠开局";

  const cap = account.ticketCap;
  tableTicketCapNote.textContent = `当前单局彩票上限 ${cap} 张。每多解锁一台机台，所有机台的单局彩票上限 +1；狂赌深渊轮盘额外加减的彩票不受该上限限制。`;
  helpTicketCap.textContent = `当前上限 ${cap} 张`;

  ticketExchangeOne.disabled = state.tickets < 1;
  ticketExchangeAll.disabled = state.tickets < 1;
  coinBuySmall.disabled = state.coins < 1;
  coinBuyLarge.disabled = state.coins < economy.MARBLES_PER_COIN;

  const volume = Math.round(state.settings.volume * 100);
  volumeRange.value = String(volume);
  volumeRange.style.setProperty("--volume", `${volume}%`);
  volumeValue.textContent = `${volume}%`;
  muteToggle.setAttribute("aria-pressed", String(state.settings.muted));
  hapticsToggle.setAttribute("aria-pressed", String(state.settings.haptics));
  payoutToggle.setAttribute("aria-pressed", String(state.settings.payoutAnimation));

  if (currentScreen === "shop") {
    renderTableShop(state);
    renderSkinShop(state);
  }
}

account.subscribe(syncAccount);

/* ── Arcade entry / new run ──────────────────────────────── */

function showArcadeChoice() {
  arcadeDialogKicker.textContent = "ARCADE MODE";
  arcadeDialogTitle.textContent = "街机模式";
  arcadeChoiceView.hidden = false;
  arcadeSetupView.hidden = true;
}

function renderArcadeChoice() {
  const run = account.activeRun;
  continueRunBtn.disabled = !run;
  continueRunBtn.classList.toggle("is-disabled", !run);
  continueRunMeta.textContent = run
    ? `本局 ${format(run.marbles)} 颗 · 最高 ${format(run.peak)} 颗 · 已获得 ${format(run.tickets)} 张彩票`
    : "暂无进行中的游戏";
  showArcadeChoice();
}

function renderStakeOptions() {
  const wallet = account.marbles;
  const stakes = economy.RUN_STAKES;
  const affordable = stakes.filter((stake) => stake <= wallet);
  if (!affordable.includes(selectedStake)) {
    selectedStake = affordable[0] ?? stakes[0];
  }

  arcadeWalletMarbles.textContent = format(wallet);
  arcadeDialogKicker.textContent = "NEW GAME";
  arcadeDialogTitle.textContent = "选择开局弹珠";
  stakeGrid.innerHTML = stakes
    .map((stake) => {
      const canAfford = wallet >= stake;
      const selected = stake === selectedStake;
      const label =
        stake === 300 ? "标准开局" : stake === 500 ? "进阶开局" : "豪赌开局";
      const note = canAfford ? label : `还差 ${format(stake - wallet)} 颗`;
      return `
        <button class="stake-card ${selected ? "is-selected" : ""}" type="button" data-stake="${stake}" ${canAfford ? "" : "disabled"} aria-pressed="${selected}">
          <b>${format(stake)}</b>
          <small>颗</small>
          <em>${note}</em>
        </button>
      `;
    })
    .join("");

  const canStart = affordable.length > 0;
  arcadeStartBtn.disabled = !canStart;
  const relief = account.reliefAmount;
  if (relief > 0) {
    arcadeReliefBtn.hidden = false;
    arcadeReliefBtn.dataset.action = "relief";
    arcadeReliefBtn.textContent = `领取 ${format(relief)} 颗补助`;
  } else if (!canStart) {
    arcadeReliefBtn.hidden = false;
    arcadeReliefBtn.dataset.action = "shop";
    arcadeReliefBtn.textContent = "去商店兑换";
  } else {
    arcadeReliefBtn.hidden = true;
    delete arcadeReliefBtn.dataset.action;
  }

  if (canStart) {
    arcadeSetupNote.textContent = `开局后这 ${format(selectedStake)} 颗弹珠会从个人余额转入本局；结束或提前结算时，剩余弹珠返还个人。游戏开始后不能追加。`;
  } else if (relief > 0) {
    arcadeSetupNote.textContent = "个人弹珠不足 300 颗。领取补助补足后即可开始标准开局。";
  } else {
    arcadeSetupNote.textContent = "个人弹珠不足 300 颗。可前往商店用游戏币或彩票兑换弹珠。";
  }
}

function showArcadeSetup() {
  arcadeChoiceView.hidden = true;
  arcadeSetupView.hidden = false;
  renderStakeOptions();
}

function openArcadeDialog(options = {}) {
  audio.init();
  audio.click();
  renderArcadeChoice();
  if (options.setup) showArcadeSetup();
  if (typeof arcadeDialog.showModal === "function") arcadeDialog.showModal();
  else arcadeDialog.setAttribute("open", "");
}

function closeArcadeDialog() {
  if (typeof arcadeDialog.close === "function") arcadeDialog.close();
  else arcadeDialog.removeAttribute("open");
}

function startNewArcadeRun() {
  const result = account.startRun(selectedStake);
  if (!result.ok) {
    if (result.reason === "marbles") {
      toast(`个人弹珠还差 ${format(result.missing)} 颗`);
    } else {
      toast("暂时无法开始新的街机游戏");
    }
    renderStakeOptions();
    return;
  }
  closeArcadeDialog();
  window.dispatchEvent(new CustomEvent("marble:run-started"));
  if (account.hasRun) showScreen("game");
  toast(`新游戏开始 · ${format(result.run.start)} 颗弹珠`);
}

function continueArcadeRun() {
  if (!account.hasRun) return;
  closeArcadeDialog();
  window.dispatchEvent(new CustomEvent("marble:run-continued"));
  // A resumed run with fewer than 5 marbles settles immediately from the
  // run-continued handler; in that case the settlement screen is already up.
  if (account.hasRun) showScreen("game");
}

function requestNewArcadeRun() {
  if (account.hasRun) {
    const confirmed = window.confirm(
      "当前还有一场街机游戏没有结算。开始新游戏会先结束当前游戏，剩余弹珠返还个人账户。继续吗？",
    );
    if (!confirmed) return;
    const summary = account.endRun("replaced");
    if (summary) toast(`已结算当前游戏 · 返还 ${format(summary.returned)} 颗弹珠`);
  }
  showArcadeSetup();
}

function renderSettlement(summary) {
  if (!summary) return;
  const cashout = summary.reason === "cashout";
  settleReason.textContent = cashout ? "提前结束 · 弹珠已返还" : "弹珠用尽 · 本局结束";
  settlePeak.textContent = format(summary.peak);
  settleTicketsEarned.textContent = format(summary.tickets);
  settleStart.textContent = format(summary.start);
  settleReturned.textContent = format(summary.returned);
  settleRounds.textContent = format(summary.rounds);
  settleNote.textContent = cashout
    ? `提前结束本局，${format(summary.returned)} 颗剩余弹珠已返还个人余额；本次获得的彩票已经计入账户。`
    : `本局弹珠已经用完，${format(summary.returned)} 颗余额已返还个人账户；本次获得的彩票已经计入账户。`;
  const state = account.snapshot();
  settleMarbles.textContent = format(state.marbles);
  settleCoins.textContent = format(state.coins);
  settleTickets.textContent = format(state.tickets);
  showScreen("settle");
}

window.addEventListener("marble:run-ended", (event) => {
  renderSettlement(event.detail);
});

/* ── Challenge entry ─────────────────────────────────────── */

const TEMPLATE_LABEL = {
  precision: "精准落点",
  destroy: "破坏目标",
  boss: "庄家作弊",
};

function renderChallengeScreen() {
  const current = account.nextChallengeLevel;
  const cleared = LEVELS.filter((level) => account.challengeCleared(level.id)).length;
  if (levelList) {
    levelList.innerHTML = LEVELS.map((level, index) => {
      const stars = account.challengeStars(level.id);
      const unlocked = account.isChallengeUnlocked(level.id);
      const classes = ["level-item-btn"];
      if (stars > 0) classes.push("is-cleared");
      if (level.id === current) classes.push("is-current");
      const starHtml = [0, 1, 2]
        .map((i) => `<i class="${i < stars ? "is-lit" : ""}">★</i>`)
        .join("");
      const detail = unlocked
        ? `${TEMPLATE_LABEL[level.template] || "关卡"} · ${level.balls} 球 · ${level.tools.length} 件可选道具`
        : "未解锁 · 先过上一关";
      return `<li><button class="${classes.join(" ")}" type="button" data-level="${level.id}" ${
        unlocked ? "" : "disabled"
      }>
        <span class="level-item-no">${String(index + 1).padStart(2, "0")}</span>
        <span class="level-item-copy"><b>${level.name}</b><small>${detail}</small></span>
        <span class="level-item-stars">${starHtml}</span>
      </button></li>`;
    }).join("");
  }
  if (dealerStripText) {
    if (cleared === 0) {
      dealerStripText.textContent = "本庄今晚兴致不错。挑一关，别让本庄久等。";
    } else if (cleared < LEVELS.length) {
      dealerStripText.textContent = `客人已经过了 ${cleared} 关。本庄开始觉得……有点意思了。`;
    } else {
      dealerStripText.textContent = "六关全过。本庄说话算话——桌子归您。";
    }
  }
  if (challengeSub) {
    challengeSub.textContent =
      cleared > 0
        ? `庄家 · 七 坐庄 · 已过 ${cleared}/${LEVELS.length} 关`
        : "庄家 · 七 坐庄 · 6 关";
  }
}

function enterChallenge(levelId) {
  audio.init();
  audio.click();
  document.body.dataset.mode = "challenge";
  showScreen("game");
  window.__MARBLE_DROP__.challenge.start(levelId);
}

$("challengeBtn").addEventListener("click", () => {
  audio.click();
  showScreen("challenge");
});

$("challengeBack").addEventListener("click", () => {
  audio.click();
  document.body.dataset.mode = "";
  showScreen("menu");
});

if (levelList) {
  levelList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-level]");
    if (!button || button.disabled) return;
    enterChallenge(button.dataset.level);
  });
}

window.addEventListener("marble:challenge", () => {
  document.body.dataset.mode = "";
  showScreen("challenge");
});

/* ── Menu actions ────────────────────────────────────────── */

$("arcadeBtn").addEventListener("click", () => {
  openArcadeDialog();
});

$("arcadeDialogClose").addEventListener("click", () => {
  audio.click();
  closeArcadeDialog();
});

arcadeDialog.addEventListener("click", (event) => {
  if (event.target === arcadeDialog) closeArcadeDialog();
});

arcadeDialog.addEventListener("cancel", () => {
  showArcadeChoice();
});

continueRunBtn.addEventListener("click", () => {
  audio.click();
  continueArcadeRun();
});

newRunBtn.addEventListener("click", () => {
  audio.click();
  requestNewArcadeRun();
});

arcadeSetupBack.addEventListener("click", () => {
  audio.click();
  showArcadeChoice();
});

stakeGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-stake]");
  if (!button || button.disabled) return;
  selectedStake = Number(button.dataset.stake);
  audio.click();
  renderStakeOptions();
});

arcadeStartBtn.addEventListener("click", () => {
  audio.click();
  startNewArcadeRun();
});

arcadeReliefBtn.addEventListener("click", () => {
  audio.init();
  if (arcadeReliefBtn.dataset.action === "shop") {
    closeArcadeDialog();
    showScreen("menu");
    openShop("menu");
    return;
  }
  const amount = account.claimRelief();
  if (amount > 0) {
    audio.ticket();
    toast(`已领取 ${format(amount)} 颗开局补助`);
    renderStakeOptions();
  }
});

$("settleAgainBtn").addEventListener("click", () => {
  audio.click();
  showScreen("menu");
  openArcadeDialog({ setup: true });
});

$("settleHomeBtn").addEventListener("click", () => {
  audio.click();
  showScreen("menu");
});

$("shopBtn").addEventListener("click", () => {
  audio.init();
  audio.click();
  openShop("menu");
});

$("optionsBtn").addEventListener("click", () => {
  audio.init();
  audio.click();
  showScreen("options");
});

$("exitBtn").addEventListener("click", () => {
  audio.init();
  audio.click();
  showScreen("exit");
  // Browsers only allow this when the page was opened by script.
  window.setTimeout(() => {
    try {
      window.close();
    } catch {
      /* The exit screen remains available. */
    }
  }, 220);
});

$("reenterBtn").addEventListener("click", () => {
  audio.init();
  audio.click();
  showScreen("menu");
});

$("menuReliefBtn").addEventListener("click", () => {
  audio.init();
  const amount = account.claimRelief();
  if (amount > 0) {
    audio.ticket();
    toast(`已领取 ${amount} 颗补助弹珠`);
  }
});

$("challengeBtn").title = "庄家坐庄，六关连闯";

/* ── Shop ────────────────────────────────────────────────── */

$("shopBack").addEventListener("click", () => {
  audio.click();
  showScreen(shopReturnScreen);
});

function exchangeTickets(count) {
  const coins = account.exchangeTicketsToCoins(count);
  if (coins <= 0) {
    toast("没有可兑换的彩票");
    return;
  }
  audio.ticket();
  toast(`兑换成功 · +${coins} 游戏币`);
}

ticketExchangeOne.addEventListener("click", () => {
  audio.init();
  exchangeTickets(1);
});

ticketExchangeAll.addEventListener("click", () => {
  audio.init();
  exchangeTickets(account.tickets);
});

function buyMarbles(coinCost) {
  if (account.coins < coinCost) {
    toast("游戏币不足");
    return;
  }
  const marbles = account.buyMarblesWithCoins(coinCost);
  if (marbles <= 0) return;
  audio.ticket();
  toast(`购买成功 · +${marbles} 颗弹珠`);
}

coinBuySmall.addEventListener("click", () => {
  audio.init();
  buyMarbles(1);
});

coinBuyLarge.addEventListener("click", () => {
  audio.init();
  buyMarbles(economy.MARBLES_PER_COIN);
});

$("shopReliefBtn").addEventListener("click", () => {
  audio.init();
  const amount = account.claimRelief();
  if (amount > 0) {
    audio.ticket();
    toast(`已领取 ${amount} 颗补助弹珠`);
  }
});

/* ── Pinball tables ──────────────────────────────────────── */

function renderTableShop(state) {
  const equipped = getTable(state.tables.equipped);
  tableEquippedName.textContent = `${equipped.name} · ${equipped.en}`;

  tableGrid.innerHTML = TABLE_LIST.map((table) => {
    const owned = state.tables.owned.includes(table.id);
    const isEquipped = state.tables.equipped === table.id;
    const canAfford = state.tickets >= table.price;
    const priceLabel = table.price > 0 ? `${table.price} 彩票` : "免费机台";

    let action;
    if (isEquipped) {
      action = `<button class="skin-btn is-equipped" type="button" disabled>使用中</button>`;
    } else if (owned) {
      action = `<button class="skin-btn" type="button" data-table-equip="${table.id}">装备</button>`;
    } else {
      action = `<button class="skin-btn is-buy" type="button" data-table-buy="${table.id}" ${canAfford ? "" : "disabled"} title="${canAfford ? "用彩票购买并装备" : "彩票不足"}">${priceLabel}</button>`;
    }

    const cardClass = [
      "table-card",
      isEquipped ? "is-equipped" : "",
      owned ? "is-owned" : "is-locked",
      table.art === "cyberpunk" ? "is-cyber" : "is-classic",
      table.id === "abyss" ? "is-abyss" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <article class="${cardClass}" data-table-card="${table.id}" style="${tableCssVars(table)}">
        <canvas class="table-thumb" data-table-preview="${table.id}" aria-hidden="true"></canvas>
        <div class="table-card-body">
          <div class="skin-card-head">
            <span class="skin-name">${table.name}</span>
            <span class="skin-en">${table.en}</span>
          </div>
          <p class="skin-tagline">${table.tagline}</p>
          <p class="table-desc">${table.description}</p>
          <div class="skin-chips">
            ${table.features.map((feature) => `<span class="skin-chip">${feature}</span>`).join("")}
            ${isEquipped ? '<span class="skin-chip is-current">使用中</span>' : ""}
          </div>
        </div>
        <div class="table-card-foot">
          <span class="table-price">${owned ? "已拥有" : priceLabel}</span>
          ${action}
        </div>
      </article>
    `;
  }).join("");

  requestAnimationFrame(() => {
    tableGrid.querySelectorAll("canvas[data-table-preview]").forEach((preview) => {
      drawTablePreview(preview, getTable(preview.dataset.tablePreview));
    });
  });
}

function equipTable(id) {
  const table = getTable(id);
  if (!account.ownsTable(id)) {
    toast("这台机台还没有购买");
    return;
  }
  const changed = account.equipTable(id);
  audio.init();
  audio.click();
  toast(changed ? `已装备 ${table.name} 机台` : `${table.name} 机台正在使用`);
}

function buyTable(id) {
  const table = getTable(id);
  if (!account.ownsTable(id)) {
    const result = account.purchaseTable(id, table.price);
    if (!result.ok) {
      const missing = Math.max(0, table.price - account.tickets);
      toast(result.reason === "tickets" ? `还差 ${missing} 张彩票` : "暂时无法购买这台机台");
      return;
    }
    audio.init();
    audio.ticket();
    toast(`已购买并装备 ${table.name} 机台`);
    return;
  }
  equipTable(id);
}

tableGrid.addEventListener("click", (event) => {
  const equip = event.target.closest("[data-table-equip]");
  if (equip) {
    equipTable(equip.dataset.tableEquip);
    return;
  }
  const buy = event.target.closest("[data-table-buy]");
  if (buy) buyTable(buy.dataset.tableBuy);
});

/* ── Mother-ball skins ───────────────────────────────────── */

function renderSkinShop(state) {
  const equipped = getSkin(state.skins.equipped);
  skinEquippedName.textContent = `${equipped.name} · ${equipped.en}`;

  skinGrid.innerHTML = SKIN_LIST.map((skin) => {
    const owned = state.skins.owned.includes(skin.id);
    const isEquipped = state.skins.equipped === skin.id;
    const canAfford = state.tickets >= skin.price;
    const priceLabel = skin.price > 0 ? `${skin.price} 彩票` : "免费领取";

    let action;
    if (isEquipped) {
      action = `<button class="skin-btn is-equipped" type="button" disabled>使用中</button>`;
    } else if (owned) {
      action = `<button class="skin-btn" type="button" data-skin-equip="${skin.id}">装备</button>`;
    } else {
      action = `<button class="skin-btn is-buy" type="button" data-skin-buy="${skin.id}" ${canAfford ? "" : "disabled"} title="${canAfford ? "用彩票解锁" : "彩票不足"}">${priceLabel}</button>`;
    }

    const cardClass = [
      "skin-card",
      isEquipped ? "is-equipped" : "",
      owned ? "is-owned" : "is-locked",
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <article class="${cardClass}" data-skin-card="${skin.id}">
        <span class="skin-ball" style="${skinCssVars(skin)}" aria-hidden="true">
          <i class="skin-ball-pattern" data-pattern="${skin.ball.pattern}"></i>
        </span>
        <div class="skin-card-body">
          <div class="skin-card-head">
            <span class="skin-name">${skin.name}</span>
            <span class="skin-en">${skin.en}</span>
          </div>
          <p class="skin-tagline">${skin.tagline}</p>
          <div class="skin-chips">
            <span class="skin-chip">${skin.particleLabel}</span>
            <span class="skin-chip">${skin.soundLabel}</span>
            ${isEquipped ? '<span class="skin-chip is-current">使用中</span>' : ""}
          </div>
        </div>
        <div class="skin-card-foot">
          <button class="skin-try" type="button" data-skin-preview="${skin.id}" aria-label="试听${skin.name}母球音效">试听</button>
          ${action}
        </div>
      </article>
    `;
  }).join("");
}

function previewSkin(id) {
  audio.init();
  audio.previewSkin(id);
  const card = skinGrid.querySelector(`[data-skin-card="${id}"]`);
  if (!card) return;
  card.classList.remove("is-auditioning");
  void card.offsetWidth;
  card.classList.add("is-auditioning");
  window.setTimeout(() => card.classList.remove("is-auditioning"), 760);
}

function equipSkin(id) {
  const skin = getSkin(id);
  if (!account.ownsSkin(id)) {
    toast("这只母球还没有解锁");
    return;
  }
  const changed = account.equipSkin(id);
  audio.init();
  audio.click();
  toast(changed ? `已装备 ${skin.name}母球` : `${skin.name}母球正在使用`);
}

function buySkin(id) {
  const skin = getSkin(id);
  if (!account.ownsSkin(id)) {
    const result = account.purchaseSkin(id, skin.price);
    if (!result.ok) {
      const missing = Math.max(0, skin.price - account.tickets);
      toast(result.reason === "tickets" ? `还差 ${missing} 张彩票` : "暂时无法解锁这只母球");
      return;
    }
    audio.init();
    audio.ticket();
    toast(`已解锁并装备 ${skin.name}母球`);
    window.setTimeout(() => previewSkin(id), 260);
    return;
  }
  equipSkin(id);
}

skinGrid.addEventListener("click", (event) => {
  const preview = event.target.closest("[data-skin-preview]");
  if (preview) {
    previewSkin(preview.dataset.skinPreview);
    return;
  }
  const equip = event.target.closest("[data-skin-equip]");
  if (equip) {
    equipSkin(equip.dataset.skinEquip);
    return;
  }
  const buy = event.target.closest("[data-skin-buy]");
  if (buy) buySkin(buy.dataset.skinBuy);
});

/* ── Options ─────────────────────────────────────────────── */

$("optionsBack").addEventListener("click", () => {
  audio.click();
  showScreen("menu");
});

volumeRange.addEventListener("input", () => {
  const percent = Math.round(Number(volumeRange.value) || 0);
  account.setVolume(percent / 100);
});

volumeRange.addEventListener("change", () => {
  audio.init();
  audio.click();
});

muteToggle.addEventListener("click", () => {
  account.toggleMuted();
  if (!account.settings.muted) {
    audio.init();
    audio.click();
    toast("音效已开启");
  } else {
    toast("已静音");
  }
});

hapticsToggle.addEventListener("click", () => {
  account.setHaptics(!account.settings.haptics);
  if (account.settings.haptics) {
    vibrate(12);
    toast("触感反馈已开启");
  } else {
    toast("触感反馈已关闭");
  }
});

payoutToggle.addEventListener("click", () => {
  account.setPayoutAnimation(!account.settings.payoutAnimation);
  audio.init();
  audio.click();
  if (account.settings.payoutAnimation) {
    vibrate(12);
    toast("中奖吐珠动画已开启");
  } else {
    toast("中奖吐珠动画已关闭");
  }
});

$("optionsHelpBtn").addEventListener("click", openHelp);

$("optionsResetBtn").addEventListener("click", () => {
  const confirmed = window.confirm(
    "重置本地存档？弹珠将回到 300 颗，进行中的街机游戏、游戏币、彩票、母球皮肤、机台、设置和记录都会清空。",
  );
  if (!confirmed) return;
  account.reset();
  window.location.reload();
});

/* ── Game-to-shell events ────────────────────────────────── */

window.addEventListener("marble:home", () => {
  showScreen("menu");
});

window.addEventListener("marble:shop", () => {
  openShop("game");
});

/* ── Init ────────────────────────────────────────────────── */

showScreen("menu");

// A small read-only debug surface for QA and future tooling.
window.__MARBLE_APP__ = {
  account,
  skins: SKIN_LIST,
  tables: TABLE_LIST,
  showScreen,
  get currentScreen() {
    return currentScreen;
  },
};

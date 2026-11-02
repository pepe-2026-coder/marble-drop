/* ============================================================
   App shell: screen routing, arcade economy, shop and options.
   The canvas game is initialized by engine.js on import.
   ============================================================ */

import "./game/engine.js";
import { account, economy } from "./account.js";
import { audio, vibrate } from "./audio.js";
import { SKIN_LIST, getSkin, skinCssVars } from "./game/skins.js";
import { TABLE_LIST, getTable, tableCssVars } from "./game/tables.js";
import { drawTablePreview } from "./game/tablePreview.js";
import { toast } from "./ui/toast.js";

const $ = (id) => document.getElementById(id);

const screens = {
  menu: $("menuScreen"),
  game: $("gameScreen"),
  shop: $("shopScreen"),
  options: $("optionsScreen"),
  exit: $("exitScreen"),
};

const menuMarbles = $("menuMarbles");
const menuCoins = $("menuCoins");
const menuTickets = $("menuTickets");
const menuRelief = $("menuRelief");

const shopMarbles = $("shopMarbles");
const shopCoins = $("shopCoins");
const shopTickets = $("shopTickets");
const shopRelief = $("shopRelief");
const ticketExchangeOne = $("ticketExchangeOne");
const ticketExchangeAll = $("ticketExchangeAll");
const coinBuySmall = $("coinBuySmall");
const coinBuyLarge = $("coinBuyLarge");
const skinGrid = $("skinGrid");
const skinEquippedName = $("skinEquippedName");
const tableGrid = $("tableGrid");
const tableEquippedName = $("tableEquippedName");

const volumeRange = $("volumeRange");
const volumeValue = $("volumeValue");
const muteToggle = $("muteToggle");
const hapticsToggle = $("hapticsToggle");
const payoutToggle = $("payoutToggle");
const helpDialog = $("helpDialog");

let currentScreen = "menu";
let shopReturnScreen = "menu";

const isBroke = (state) =>
  state.marbles < 5 && state.coins === 0 && state.tickets === 0;

function format(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function showScreen(name) {
  if (!screens[name]) return;
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

  const broke = isBroke(state);
  menuRelief.hidden = !broke;
  shopRelief.hidden = !broke;

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

/* ── Menu actions ────────────────────────────────────────── */

$("arcadeBtn").addEventListener("click", () => {
  audio.init();
  audio.click();
  showScreen("game");
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

$("challengeBtn").title = "积分与机关系统正在打磨，暂未开放";

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
    "重置本地存档？弹珠将回到 300 颗，游戏币、彩票、母球皮肤、机台、设置和记录都会清空。",
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

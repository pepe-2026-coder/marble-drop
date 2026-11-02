/* ============================================================
   App shell: screen routing, arcade economy, shop and options.
   The canvas game is initialized by engine.js on import.
   ============================================================ */

import "./game/engine.js";
import { account, economy } from "./account.js";
import { audio, vibrate } from "./audio.js";
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

const volumeRange = $("volumeRange");
const volumeValue = $("volumeValue");
const muteToggle = $("muteToggle");
const hapticsToggle = $("hapticsToggle");
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

$("optionsHelpBtn").addEventListener("click", openHelp);

$("optionsResetBtn").addEventListener("click", () => {
  const confirmed = window.confirm(
    "重置本地存档？弹珠将回到 300 颗，游戏币、彩票、设置和记录都会清空。",
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
  showScreen,
  get currentScreen() {
    return currentScreen;
  },
};

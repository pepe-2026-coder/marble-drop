/* ============================================================
   Account + arcade economy
   Single source of truth for persistent player resources.
   ============================================================ */

import { DEFAULT_SKIN_ID, isSkinId } from "./game/skins.js";
import { DEFAULT_TABLE_ID, isTableId } from "./game/tables.js";

const STORAGE_KEY = "marble-drop-account-v2";
const STATE_VERSION = 4;
const STARTING_MARBLES = 300;
const RELIEF_MARBLES = 30;
const COINS_PER_TICKET = 5;
const MARBLES_PER_COIN = 5;

const clampInt = (value, min = 0, max = 9_999_999) =>
  Math.min(max, Math.max(min, Math.round(Number(value) || 0)));

const clampFloat = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

function createDefaultAccount() {
  return {
    version: STATE_VERSION,
    marbles: STARTING_MARBLES,
    coins: 0,
    tickets: 0,
    bet: 20,
    settings: {
      volume: 0.65,
      muted: false,
      haptics: true,
      payoutAnimation: true,
    },
    skins: {
      owned: [DEFAULT_SKIN_ID],
      equipped: DEFAULT_SKIN_ID,
    },
    tables: {
      owned: [DEFAULT_TABLE_ID],
      equipped: DEFAULT_TABLE_ID,
    },
    stats: {
      rounds: 0,
      wins: 0,
    },
  };
}

function normalizeSkins(raw) {
  const owned = Array.isArray(raw?.owned) ? raw.owned.filter(isSkinId) : [];
  if (!owned.includes(DEFAULT_SKIN_ID)) owned.unshift(DEFAULT_SKIN_ID);
  const unique = [...new Set(owned)];
  return {
    owned: unique,
    equipped: unique.includes(raw?.equipped) ? raw.equipped : DEFAULT_SKIN_ID,
  };
}

function normalizeTables(raw) {
  const owned = Array.isArray(raw?.owned) ? raw.owned.filter(isTableId) : [];
  if (!owned.includes(DEFAULT_TABLE_ID)) owned.unshift(DEFAULT_TABLE_ID);
  const unique = [...new Set(owned)];
  return {
    owned: unique,
    equipped: unique.includes(raw?.equipped) ? raw.equipped : DEFAULT_TABLE_ID,
  };
}

function normalize(raw) {
  const base = createDefaultAccount();
  if (!raw || typeof raw !== "object") return base;
  return {
    version: STATE_VERSION,
    marbles: clampInt(raw.marbles, 0, 9_999_999),
    coins: clampInt(raw.coins, 0, 9_999_999),
    tickets: clampInt(raw.tickets, 0, 9_999_999),
    bet: clampInt(raw.bet ?? base.bet, 5, 99),
    settings: {
      volume: clampFloat(raw.settings?.volume, 0, 1, base.settings.volume),
      muted: raw.settings?.muted === true,
      haptics: raw.settings?.haptics !== false,
      payoutAnimation: raw.settings?.payoutAnimation !== false,
    },
    skins: normalizeSkins(raw.skins),
    tables: normalizeTables(raw.tables),
    stats: {
      rounds: clampInt(raw.stats?.rounds, 0, 99_999_999),
      wins: clampInt(raw.stats?.wins, 0, 99_999_999),
    },
  };
}

class Account {
  constructor() {
    this.state = this.#read();
    this.listeners = new Set();
    this.#write();
  }

  #read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultAccount();
      return normalize(JSON.parse(raw));
    } catch {
      return createDefaultAccount();
    }
  }

  #write() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* private mode / storage unavailable */
    }
  }

  #changed() {
    this.#write();
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("[account] listener failed", error);
      }
    });
  }

  get marbles() {
    return this.state.marbles;
  }

  get coins() {
    return this.state.coins;
  }

  get tickets() {
    return this.state.tickets;
  }

  get bet() {
    return this.state.bet;
  }

  get settings() {
    return this.state.settings;
  }

  get skins() {
    return this.state.skins;
  }

  get equippedSkin() {
    return this.state.skins.equipped;
  }

  get tables() {
    return this.state.tables;
  }

  get equippedTable() {
    return this.state.tables.equipped;
  }

  get stats() {
    return this.state.stats;
  }

  get canClaimRelief() {
    return this.state.marbles < 5 && this.state.coins === 0 && this.state.tickets === 0;
  }

  get canAffordMinimumBet() {
    return this.state.marbles >= 5;
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  save() {
    this.#write();
  }

  setMarbles(value) {
    const next = clampInt(value, 0, 9_999_999);
    if (next === this.state.marbles) return;
    this.state.marbles = next;
    this.#changed();
  }

  addMarbles(amount) {
    this.setMarbles(this.state.marbles + Number(amount || 0));
  }

  setTickets(value) {
    const next = clampInt(value, 0, 9_999_999);
    if (next === this.state.tickets) return;
    this.state.tickets = next;
    this.#changed();
  }

  addCoins(amount) {
    this.state.coins = clampInt(this.state.coins + Number(amount || 0), 0, 9_999_999);
    this.#changed();
  }

  addTickets(amount) {
    this.state.tickets = clampInt(this.state.tickets + Number(amount || 0), 0, 9_999_999);
    this.#changed();
  }

  setBet(value) {
    const next = clampInt(value, 5, 99);
    if (next === this.state.bet) return;
    this.state.bet = next;
    this.#changed();
  }

  ownsSkin(id) {
    return isSkinId(id) && this.state.skins.owned.includes(id);
  }

  equipSkin(id) {
    if (!this.ownsSkin(id) || this.state.skins.equipped === id) return false;
    this.state.skins.equipped = id;
    this.#changed();
    return true;
  }

  /**
   * Buy a skin with tickets and equip it immediately. Returns a result object
   * so the UI can distinguish an invalid skin, an unaffordable one and an
   * already-owned skin without racing the account state.
   */
  purchaseSkin(id, price = 0) {
    if (!isSkinId(id)) return { ok: false, reason: "invalid" };
    if (this.ownsSkin(id)) {
      return { ok: true, alreadyOwned: true, equipped: this.equipSkin(id) };
    }
    const cost = clampInt(price, 0, 9_999_999);
    if (this.state.tickets < cost) return { ok: false, reason: "tickets" };
    this.state.tickets -= cost;
    this.state.skins.owned.push(id);
    this.state.skins.equipped = id;
    this.#changed();
    return { ok: true, alreadyOwned: false, equipped: true, spent: cost };
  }

  ownsTable(id) {
    return isTableId(id) && this.state.tables.owned.includes(id);
  }

  equipTable(id) {
    if (!this.ownsTable(id) || this.state.tables.equipped === id) return false;
    this.state.tables.equipped = id;
    this.#changed();
    return true;
  }

  /**
   * Buy a table with arcade coins. New tables are equipped immediately so the
   * shop can hand the player straight back to the new machine.
   */
  purchaseTable(id, price = 0) {
    if (!isTableId(id)) return { ok: false, reason: "invalid" };
    if (this.ownsTable(id)) {
      return { ok: true, alreadyOwned: true, equipped: this.equipTable(id) };
    }
    const cost = clampInt(price, 0, 9_999_999);
    if (this.state.coins < cost) return { ok: false, reason: "coins" };
    this.state.coins -= cost;
    this.state.tables.owned.push(id);
    this.state.tables.equipped = id;
    this.#changed();
    return { ok: true, alreadyOwned: false, equipped: true, spent: cost };
  }

  exchangeTicketsToCoins(ticketCount = 1) {
    const count = clampInt(ticketCount, 0, this.state.tickets);
    if (count <= 0) return 0;
    this.state.tickets -= count;
    this.state.coins += count * COINS_PER_TICKET;
    this.#changed();
    return count * COINS_PER_TICKET;
  }

  buyMarblesWithCoins(coinCount = 1) {
    const cost = clampInt(coinCount, 0, this.state.coins);
    if (cost <= 0) return 0;
    this.state.coins -= cost;
    this.state.marbles += cost * MARBLES_PER_COIN;
    this.#changed();
    return cost * MARBLES_PER_COIN;
  }

  claimRelief() {
    if (!this.canClaimRelief) return 0;
    this.state.marbles += RELIEF_MARBLES;
    this.#changed();
    return RELIEF_MARBLES;
  }

  recordRound(won) {
    this.state.stats.rounds += 1;
    if (won) this.state.stats.wins += 1;
    this.#changed();
  }

  setVolume(value) {
    const volume = clampFloat(value, 0, 1, this.state.settings.volume);
    if (volume === this.state.settings.volume) return;
    this.state.settings.volume = volume;
    if (volume > 0 && this.state.settings.muted) this.state.settings.muted = false;
    this.#changed();
  }

  setMuted(muted) {
    const next = Boolean(muted);
    if (next === this.state.settings.muted) return;
    this.state.settings.muted = next;
    this.#changed();
  }

  toggleMuted() {
    this.setMuted(!this.state.settings.muted);
  }

  setHaptics(enabled) {
    const next = Boolean(enabled);
    if (next === this.state.settings.haptics) return;
    this.state.settings.haptics = next;
    this.#changed();
  }

  setPayoutAnimation(enabled) {
    const next = Boolean(enabled);
    if (next === this.state.settings.payoutAnimation) return;
    this.state.settings.payoutAnimation = next;
    this.#changed();
  }

  reset() {
    this.state = createDefaultAccount();
    this.#changed();
  }
}

export const account = new Account();
export const economy = {
  STARTING_MARBLES,
  RELIEF_MARBLES,
  COINS_PER_TICKET,
  MARBLES_PER_COIN,
};

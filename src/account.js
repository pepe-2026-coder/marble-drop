/* ============================================================
   Account + arcade economy
   Single source of truth for persistent player resources.
   ============================================================ */

import { DEFAULT_SKIN_ID, isSkinId } from "./game/skins.js";
import { DEFAULT_TABLE_ID, isTableId } from "./game/tables.js";
import { LEVELS } from "./game/levels.js";

const STORAGE_KEY = "marble-drop-account-v2";
const STATE_VERSION = 6;
const STARTING_MARBLES = 300;
const MIN_RUN_STAKE = 300;
const RUN_STAKES = [300, 500, 1000];
const COINS_PER_TICKET = 5;
const MARBLES_PER_COIN = 5;
const BASE_TICKET_CAP = 3;

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
    // An arcade run is a self-contained marble bank carved out of the personal
    // wallet. It survives page reloads so the menu can offer "continue".
    run: null,
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
    challenge: {
      stars: {},
      lastLevel: LEVELS[0]?.id || "oak-01",
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

function normalizeRun(raw) {
  if (!raw || raw.active !== true) return null;
  const start = clampInt(raw.start, 0, 9_999_999);
  if (start <= 0) return null;
  const marbles = clampInt(raw.marbles, 0, 9_999_999);
  const peak = Math.max(start, marbles, clampInt(raw.peak, 0, 9_999_999));
  const startedAt = Number(raw.startedAt);
  return {
    active: true,
    start,
    marbles,
    peak,
    tickets: clampInt(raw.tickets, 0, 9_999_999),
    rounds: clampInt(raw.rounds, 0, 9_999_999),
    startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
  };
}

/** 闯关进度：只存星星和上次打开的关卡，解锁状态由星星推导。 */
function normalizeChallenge(raw) {
  const stars = {};
  for (const level of LEVELS) {
    const value = Math.round(Number(raw?.stars?.[level.id]) || 0);
    if (value > 0) stars[level.id] = Math.min(3, value);
  }
  const lastLevel = LEVELS.some((level) => level.id === raw?.lastLevel)
    ? raw.lastLevel
    : LEVELS[0].id;
  return { stars, lastLevel };
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
    run: normalizeRun(raw.run),
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
    challenge: normalizeChallenge(raw.challenge),
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

  // ── Challenge progression ───────────────────────────────

  get challenge() {
    return this.state.challenge;
  }

  challengeStars(levelId) {
    return this.state.challenge.stars[levelId] || 0;
  }

  challengeCleared(levelId) {
    return this.challengeStars(levelId) > 0;
  }

  /** 第一关永远解锁；之后的关卡要求上一关至少拿到一颗星。 */
  isChallengeUnlocked(levelId) {
    const index = LEVELS.findIndex((level) => level.id === levelId);
    if (index < 0) return false;
    if (index === 0) return true;
    return this.challengeCleared(LEVELS[index - 1].id);
  }

  /** 当前可以挑战的最远一关，用于「继续」按钮。 */
  get nextChallengeLevel() {
    const open = LEVELS.find((level) => this.isChallengeUnlocked(level.id) && !this.challengeCleared(level.id));
    if (open) return open.id;
    const remembered = this.state.challenge.lastLevel;
    return LEVELS.some((level) => level.id === remembered) ? remembered : LEVELS[0].id;
  }

  /** 只记录更好的一遍：重打不会把三星刷成一星。 */
  recordChallengeStars(levelId, stars) {
    if (!LEVELS.some((level) => level.id === levelId)) return 0;
    const next = Math.min(3, Math.max(0, Math.round(Number(stars) || 0)));
    const before = this.state.challenge.stars[levelId] || 0;
    if (next <= before) return before;
    this.state.challenge.stars[levelId] = next;
    this.#changed();
    return next;
  }

  setChallengeLastLevel(levelId) {
    if (!LEVELS.some((level) => level.id === levelId)) return false;
    if (this.state.challenge.lastLevel === levelId) return false;
    this.state.challenge.lastLevel = levelId;
    this.#changed();
    return true;
  }

  /** The active arcade run, or null when the player is between runs. */
  get run() {
    return this.state.run;
  }

  get activeRun() {
    return this.state.run?.active ? this.state.run : null;
  }

  get hasRun() {
    return Boolean(this.state.run?.active);
  }

  /** Marbles available to the current context: the run bank or the wallet. */
  get playMarbles() {
    return this.hasRun ? this.state.run.marbles : this.state.marbles;
  }

  /** Total ticket cap for one round, driven by how many tables are unlocked. */
  get ticketCap() {
    return BASE_TICKET_CAP + Math.max(0, this.state.tables.owned.length - 1);
  }

  /** Marbles reachable by converting every coin and ticket in the wallet. */
  get potentialMarbles() {
    return (
      this.state.marbles +
      this.state.coins * MARBLES_PER_COIN +
      this.state.tickets * COINS_PER_TICKET * MARBLES_PER_COIN
    );
  }

  get canClaimRelief() {
    return (
      !this.hasRun &&
      this.state.marbles < MIN_RUN_STAKE &&
      this.potentialMarbles < MIN_RUN_STAKE
    );
  }

  get reliefAmount() {
    if (!this.canClaimRelief) return 0;
    return Math.max(0, MIN_RUN_STAKE - this.state.marbles);
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

  /**
   * Award (or deduct) tickets during an arcade run, tracking the run's net
   * ticket result for the settlement screen. Wheel rewards are allowed to
   * bypass the round's normal ticket cap by calling this directly.
   */
  awardRunTickets(delta) {
    const amount = clampInt(delta, -9_999_999, 9_999_999);
    if (!amount) return 0;
    const before = this.state.tickets;
    this.state.tickets = clampInt(before + amount, 0, 9_999_999);
    const actual = this.state.tickets - before;
    if (this.hasRun) {
      this.state.run.tickets = clampInt(this.state.run.tickets + actual, 0, 9_999_999);
    }
    if (actual !== 0) this.#changed();
    return actual;
  }

  setBet(value) {
    const next = clampInt(value, 5, 99);
    if (next === this.state.bet) return;
    this.state.bet = next;
    this.#changed();
  }

  // ── Arcade runs ─────────────────────────────────────────

  /**
   * Move `startMarbles` from the personal wallet into a fresh run bank.
   * Stakes are fixed so the opening screen can present a small, readable set.
   */
  startRun(startMarbles) {
    const start = clampInt(startMarbles, 0, 9_999_999);
    if (!RUN_STAKES.includes(start)) return { ok: false, reason: "invalid" };
    if (this.hasRun) return { ok: false, reason: "active" };
    if (this.state.marbles < start) {
      return { ok: false, reason: "marbles", missing: start - this.state.marbles };
    }
    this.state.marbles -= start;
    this.state.run = {
      active: true,
      start,
      marbles: start,
      peak: start,
      tickets: 0,
      rounds: 0,
      startedAt: Date.now(),
    };
    this.#changed();
    return { ok: true, run: { ...this.state.run } };
  }

  setRunMarbles(value) {
    if (!this.hasRun) return false;
    const next = clampInt(value, 0, 9_999_999);
    const run = this.state.run;
    if (next === run.marbles) return false;
    run.marbles = next;
    if (next > run.peak) run.peak = next;
    this.#changed();
    return true;
  }

  addRunMarbles(amount) {
    if (!this.hasRun) return false;
    return this.setRunMarbles(this.state.run.marbles + Number(amount || 0));
  }

  recordRunTicketDelta(delta) {
    return this.awardRunTickets(delta);
  }

  /**
   * Close the active run: return its remaining marbles to the personal wallet
   * and hand the UI a compact summary for the settlement screen.
   */
  endRun(reason = "cashout") {
    if (!this.hasRun) return null;
    const run = this.state.run;
    const summary = {
      active: false,
      start: run.start,
      marbles: run.marbles,
      peak: run.peak,
      tickets: run.tickets,
      rounds: run.rounds,
      startedAt: run.startedAt,
      endedAt: Date.now(),
      returned: run.marbles,
      reason,
    };
    this.state.marbles = clampInt(this.state.marbles + run.marbles, 0, 9_999_999);
    this.state.run = null;
    this.#changed();
    return summary;
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
   * Buy a table with tickets and equip it immediately. Each additional table
   * also raises the ticket cap of every table by one.
   */
  purchaseTable(id, price = 0) {
    if (!isTableId(id)) return { ok: false, reason: "invalid" };
    if (this.ownsTable(id)) {
      return { ok: true, alreadyOwned: true, equipped: this.equipTable(id) };
    }
    const cost = clampInt(price, 0, 9_999_999);
    if (this.state.tickets < cost) return { ok: false, reason: "tickets" };
    this.state.tickets -= cost;
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
    const amount = this.reliefAmount;
    if (amount <= 0) return 0;
    this.state.marbles += amount;
    this.#changed();
    return amount;
  }

  recordRound(won) {
    this.state.stats.rounds += 1;
    if (won) this.state.stats.wins += 1;
    if (this.hasRun) this.state.run.rounds += 1;
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
  MIN_RUN_STAKE,
  RUN_STAKES,
  COINS_PER_TICKET,
  MARBLES_PER_COIN,
  BASE_TICKET_CAP,
};

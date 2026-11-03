/* ============================================================
   Shared audio + haptics
   The account store owns the settings; the engine only consumes them.
   ============================================================ */

import { account } from "./account.js";
import { getSkin } from "./game/skins.js";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const randomRange = (min, max) => min + Math.random() * (max - min);

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.limiter = null;
    this.output = null;
    this.noiseBuffer = null;
    this.lastPegAt = 0;
    this.lastWallAt = 0;
    this.lastMarbleAt = 0;
    this.pour = null;
    this.previewToken = 0;
    this.volume = account.settings.volume;
    this.muted = account.settings.muted;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.#gain();

    // The old 0.42× master left a typical win peaking around -26 dBFS, which
    // is barely audible on a phone speaker unless the user maxes the slider.
    // Run the master at unity, tame the few loud stacked moments (win
    // fanfares, payout clinks) with a limiter, then apply a fixed makeup gain
    // so single sounds are loud too. The limiter sees peaks before makeup, so
    // even a fully stacked fanfare stays below full scale.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -18;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 4;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.2;

    this.output = this.ctx.createGain();
    this.output.gain.value = 2.6;

    this.master.connect(this.limiter);
    this.limiter.connect(this.output);
    this.output.connect(this.ctx.destination);
    this.noiseBuffer = this.#createNoiseBuffer();
  }

  #createNoiseBuffer() {
    const length = Math.floor(this.ctx.sampleRate * 0.6);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  #gain() {
    // Unity at 100 %, linear slider. The limiter keeps the sum of stacked
    // tones from clipping.
    return this.muted ? 0 : this.volume;
  }

  #enabled() {
    return Boolean(this.ctx) && !this.muted && this.volume > 0.001;
  }

  applySettings(settings) {
    this.volume = clamp(Number(settings?.volume ?? this.volume), 0, 1);
    this.muted = Boolean(settings?.muted);
    if (this.master && this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.#gain(), now, 0.02);
    }
    if (this.muted) this.payoutPourStop();
  }

  setVolume(value) {
    this.volume = clamp(Number(value) || 0, 0, 1);
    this.applySettings({ volume: this.volume, muted: this.muted });
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.applySettings({ volume: this.volume, muted: this.muted });
  }

  tone(freq, duration, type = "sine", volume = 0.08, slideTo = null, delay = 0) {
    if (!this.#enabled()) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, freq), t);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + duration);
    }
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  noise(duration = 0.15, volume = 0.05, cutoff = 1300, delay = 0) {
    if (!this.#enabled()) return;
    const t = this.ctx.currentTime + delay;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(t);
    source.stop(t + duration + 0.03);
  }

  gate() {
    this.noise(0.09, 0.028, 1900);
    this.tone(240, 0.08, "triangle", 0.035, 160);
  }

  light(index) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880];
    this.tone(scale[index % scale.length], 0.13, "sine", 0.055, scale[index % scale.length] * 1.01);
  }

  peg(energy = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastPegAt < 0.024) return;
    this.lastPegAt = now;
    if (!this.#playSkin("peg", energy)) this.#defaultPeg(energy);
  }

  wall(energy = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastWallAt < 0.045) return;
    this.lastWallAt = now;
    if (!this.#playSkin("wall", energy)) this.#defaultWall(energy);
  }

  spring(strength = 0.7) {
    this.noise(0.11, 0.025 + strength * 0.02, 750);
    this.tone(105, 0.15, "sawtooth", 0.025, 60);
  }

  launch(power = 0.8) {
    if (!this.#playSkin("launch", power)) this.#defaultLaunch(power);
  }

  /**
   * Play a short launch → peg → wall audition for a skin, used by the shop.
   * A newer preview cancels the pending layers of the previous one.
   */
  previewSkin(skinId) {
    this.init();
    const skin = getSkin(skinId);
    this.previewToken += 1;
    const token = this.previewToken;
    const play = (event, ...args) => {
      if (token !== this.previewToken) return;
      if (this.#playSkinFor(skin, event, ...args)) return;
      if (event === "launch") this.#defaultLaunch(...args);
      else if (event === "peg") this.#defaultPeg(...args);
      else if (event === "wall") this.#defaultWall(...args);
    };
    play("launch", 0.92);
    window.setTimeout(() => play("peg", 1.1), 180);
    window.setTimeout(() => play("wall", 0.9), 330);
  }

  #playSkin(event, ...args) {
    return this.#playSkinFor(getSkin(account.equippedSkin), event, ...args);
  }

  #playSkinFor(skin, event, ...args) {
    const recipe = skin?.sound?.[event];
    if (typeof recipe !== "function") return false;
    recipe(...args, this);
    return true;
  }

  #defaultPeg(energy = 1) {
    this.tone(
      randomRange(620, 1160),
      0.055,
      "triangle",
      clamp(0.012 + energy * 0.022, 0.012, 0.042),
      randomRange(850, 1450),
    );
  }

  #defaultWall(energy = 1) {
    this.noise(0.05, clamp(0.008 + energy * 0.009, 0.008, 0.022), 480);
  }

  #defaultLaunch(power = 0.8) {
    this.noise(0.18, 0.05, 1000);
    this.tone(110 + power * 30, 0.28, "sine", 0.065, 360 + power * 190);
  }

  win(isJackpot = false) {
    const notes = isJackpot
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
      : [392, 523.25, 659.25, 783.99];
    notes.forEach((freq, index) => {
      this.tone(freq, 0.34, "sine", 0.075, freq * 1.005, index * 0.09);
      this.tone(freq / 2, 0.3, "triangle", 0.025, null, index * 0.09);
    });
    if (isJackpot) this.tone(1567.98, 0.6, "sine", 0.05, 1567.98, 0.5);
  }

  lose() {
    this.tone(180, 0.28, "sine", 0.035, 110);
    this.noise(0.12, 0.018, 280);
  }

  ticket() {
    [659.25, 783.99, 1046.5].forEach((freq, i) =>
      this.tone(freq, 0.22, "triangle", 0.05, null, i * 0.075),
    );
  }

  /* ── Payout tray: mechanical chute, pouring rumble, marble clinks ── */

  payoutOpen() {
    this.noise(0.16, 0.03, 560);
    this.tone(150, 0.2, "square", 0.024, 88);
    this.tone(784, 0.16, "sine", 0.032, 1046.5, 0.06);
  }

  payoutPourStart() {
    if (!this.#enabled() || this.pour) return;
    const t = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.playbackRate.value = 1.25;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1050;
    filter.Q.value = 0.55;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.026, t + 0.16);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(t);
    this.pour = { source, gain };
  }

  payoutPourStop() {
    if (!this.pour || !this.ctx) return;
    const { source, gain } = this.pour;
    this.pour = null;
    const t = this.ctx.currentTime;
    const level = Math.max(0.0001, Number(gain.gain.value) || 0.0001);
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    try {
      source.stop(t + 0.3);
    } catch {
      /* already stopped */
    }
  }

  /** A single glass-marble knock while the tray is filling. */
  marbleHit(intensity = 0.5) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastMarbleAt < 0.021) return;
    this.lastMarbleAt = now;
    const level = clamp(intensity, 0, 1);
    const freq = randomRange(1150, 2380);
    this.tone(freq, 0.05, "triangle", 0.006 + level * 0.022, freq * 0.6);
    this.noise(0.026, 0.0035 + level * 0.008, 3400);
  }

  payoutFinish() {
    [783.99, 1046.5, 1318.51].forEach((freq, i) =>
      this.tone(freq, 0.24, "sine", 0.045, freq * 1.004, i * 0.065),
    );
    this.noise(0.12, 0.018, 2600);
  }

  click() {
    this.tone(420, 0.06, "triangle", 0.028, 300);
  }
}

export const audio = new SoundEngine();

account.subscribe((state) => audio.applySettings(state.settings));

export function vibrate(pattern) {
  if (!account.settings.haptics) return;
  if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
}

/* ============================================================
   Shared audio + haptics
   The account store owns the settings; the engine only consumes them.
   ============================================================ */

import { account } from "./account.js";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const randomRange = (min, max) => min + Math.random() * (max - min);

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.lastPegAt = 0;
    this.lastWallAt = 0;
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
    this.master.connect(this.ctx.destination);
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
    return this.muted ? 0 : 0.42 * this.volume;
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
    this.tone(randomRange(620, 1160), 0.055, "triangle", clamp(0.012 + energy * 0.022, 0.012, 0.042), randomRange(850, 1450));
  }

  wall(energy = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastWallAt < 0.045) return;
    this.lastWallAt = now;
    this.noise(0.05, clamp(0.008 + energy * 0.009, 0.008, 0.022), 480);
  }

  spring(strength = 0.7) {
    this.noise(0.11, 0.025 + strength * 0.02, 750);
    this.tone(105, 0.15, "sawtooth", 0.025, 60);
  }

  launch(power = 0.8) {
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

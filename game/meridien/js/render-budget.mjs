import { clamp } from "./core.mjs";

export const PROFILES = {
  low: {
    label: "Éco",
    pixels: 650000,
    softwarePixels: 315000,
    ratio: 0.96,
    min: 0.57,
    target: 28,
  },
  standard: {
    label: "Soigné",
    pixels: 1450000,
    softwarePixels: 810000,
    ratio: 1.14,
    min: 0.6,
    target: 45,
  },
  high: {
    label: "Cinéma",
    pixels: 2200000,
    softwarePixels: 1250000,
    ratio: 1.5,
    min: 0.62,
    target: 45,
  },
  plan: {
    label: "Plan",
    pixels: 900000,
    softwarePixels: 540000,
    ratio: 1,
    min: 0.73,
    target: 28,
  },
};

// Adapt to sustained changes, not a single shader compilation or window resize.
export class RenderBudget {
  constructor(mode = "low") {
    this.reset(mode);
  }
  reset(mode) {
    this.profile = PROFILES[mode];
    this.multiplier = 1;
    this.fps = 0;
    this.stableFast = 0;
    this.reallySlow = 0;
    this.warmup = 950;
    this.restartWindow();
  }
  restartWindow() {
    this.intervals = [];
    this.ms = 0;
  }
  gap() {
    this.restartWindow();
    this.warmup = Math.max(this.warmup, 260);
  }
  observe(interval) {
    const frame = clamp(interval, 4, 600);
    if (this.warmup > 0) {
      this.warmup -= frame;
      return false;
    }
    this.intervals.push(frame);
    this.ms += frame;
    if (this.ms < 1240 || this.intervals.length < 4) return false;
    const s = this.intervals.sort((a, b) => a - b);
    this.fps = Math.round((1000 * s.length) / this.ms);
    const p75 = s[Math.floor((s.length - 1) * 0.75)],
      ideal = 1000 / this.profile.target;
    const old = this.multiplier;
    if (p75 > ideal * 1.27) {
      this.multiplier = Math.max(
        this.profile.min,
        this.multiplier * (p75 > ideal * 2.25 ? 0.83 : 0.92),
      );
      this.stableFast = 0;
    } else if (p75 < ideal * 0.87) {
      if (++this.stableFast >= 3) {
        this.multiplier = Math.min(1, this.multiplier + 0.055);
        this.stableFast = 0;
      }
    } else this.stableFast = 0;
    this.reallySlow =
      this.multiplier <= this.profile.min + 0.015 && p75 > 46
        ? this.reallySlow + 1
        : 0;
    this.restartWindow();
    return Math.abs(old - this.multiplier) > 0.007;
  }
  scale(w, h, dpr, software = false) {
    const maxPixels = software
      ? this.profile.softwarePixels
      : this.profile.pixels;
    const base = Math.min(
      this.profile.ratio,
      dpr,
      Math.sqrt(maxPixels / (w * h)),
    );
    return base * this.multiplier;
  }
}

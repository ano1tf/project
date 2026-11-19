import { clamp, lerp } from "./core.mjs";
import { VOICES } from "./voices.mjs";

export function mouthAt(id, seconds) {
  const encoded = VOICES[id]?.[1];
  if (!encoded || seconds < 0) return 0;
  const t = seconds * 20,
    i = Math.floor(t);
  const value = (frame) => parseInt(encoded[frame] || "0", 16) / 15;
  return lerp(value(i), value(i + 1), t - i);
}

// The same media element keeps its playback permission between cuts. It is
// never populated outside a scene. The reading clock survives a blocked player,
// a missing file or a stalled connection, without advancing while hidden.
export class SceneAudio {
  constructor(prefs, create = () => new Audio()) {
    this.prefs = prefs;
    this.create = create;
    this.token = 0;
    this.active = false;
  }
  get audible() {
    return this.prefs.sound && this.prefs.voices && this.prefs.volume > 0;
  }
  begin(line) {
    this.stop();
    this.active = true;
    this.line = line.id;
    this.length = VOICES[line.id]?.[0] ?? Math.max(2.5, line.text.length / 16);
    this.elapsed = 0;
    this.hold = 0;
    this.age = this.lastAdvance = this.lastTime = 0;
    this.state = "silent";
    if (!this.audible || !VOICES[line.id]) return;
    try {
      if (!this.media) {
        this.media = this.create();
        this.media.preload = "none";
      }
      this.media.volume = clamp(this.prefs.volume, 0, 1);
      this.media.src = new URL(`../voice/${line.id}.mp3`, import.meta.url).href;
      this.state = "loading";
      this.resume();
    } catch {
      this.fallback();
    }
  }
  resume() {
    if (
      this.suspended ||
      !this.media ||
      !this.active ||
      !["loading", "playing"].includes(this.state)
    )
      return;
    const token = this.token;
    try {
      this.media.play()?.catch(() => {
        if (token === this.token && !this.suspended) this.fallback();
      });
    } catch {
      this.fallback();
    }
  }
  visibility(hidden) {
    this.suspended = hidden;
    this.lastTime = 0;
    if (hidden) this.media?.pause();
    else this.resume();
  }
  release() {
    this.token++;
    if (this.media?.hasAttribute("src")) {
      this.media.pause();
      this.media.removeAttribute("src");
      this.media.load();
    }
  }
  fallback(state = "unavailable") {
    this.release();
    this.state = state;
  }
  stop() {
    this.release();
    this.active = false;
    this.state = "idle";
  }
  tick(now) {
    if (!this.active || this.suspended) return false;
    const dt = this.lastTime ? clamp((now - this.lastTime) / 1000, 0, 0.5) : 0;
    this.lastTime = now;
    this.age += dt;
    if (this.state === "playing" || this.state === "loading") {
      const a = this.media;
      if (a.error || !this.audible)
        this.fallback(this.audible ? "unavailable" : "silent");
      else if (a.ended) {
        this.state = "hold";
        this.elapsed = this.length;
      } else if (a.currentTime > this.elapsed + 0.005) {
        this.state = "playing";
        this.elapsed = a.currentTime;
        this.lastAdvance = this.age;
      } else if (this.age - this.lastAdvance > 2.9) this.fallback();
    } else if (this.state === "hold") this.hold += dt;
    else if (this.elapsed < this.length)
      this.elapsed = Math.min(this.length, this.elapsed + dt);
    else this.hold += dt;
    return this.hold > (this.state === "hold" ? 0.62 : 0.85);
  }
  mouth() {
    return this.active &&
      this.state === "playing" &&
      !this.suspended &&
      !this.media.paused
      ? mouthAt(this.line, this.media.currentTime)
      : 0;
  }
}

export const STAGES = {
  sillage: {
    hero: { x: -129.76, y: 0.107, z: 87.73 },
    npc: { x: -130.55, y: 0.107, z: 86.18 },
    light: { x: -128.7, y: 2.49, z: 86.5, color: 0xffd3ab, power: 22 },
    lightTwo: { x: -131.67, y: 2.03, z: 87.75, color: 0x92c9f3, power: 12 },
  },
  marees: {
    hero: { x: -174.92, y: 0.089, z: 11.61 },
    npc: { x: -175.35, y: 0.089, z: 10.01 },
    light: { x: -173.36, y: 2.44, z: 10.16, color: 0xffd5a8, power: 20 },
    lightTwo: { x: -177.15, y: 2.26, z: 11.54, color: 0x85d4eb, power: 15 },
  },
};

// All cameras stay on the same side of the conversation axis. Distances are in
// actor space, not in the direction the player happened to approach from.
export function shotFrame(stage, key, aspect, glide) {
  const portrait = aspect < 0.85;
  const h = stage.hero,
    n = stage.npc,
    dx = n.x - h.x,
    dz = n.z - h.z,
    len = Math.hypot(dx, dz),
    x = dx / len,
    z = dz / len,
    sideX = -z,
    sideZ = x;
  const wide = key === "wide",
    reverse = key === "reverse",
    profile = key === "profile" || key === "choice";
  const focus = wide ? 0.52 : reverse ? 0.06 : profile ? 0.72 : 0.98;
  const X = lerp(h.x, n.x, focus),
    Z = lerp(h.z, n.z, focus);
  const coast = h.x < -160;
  const flank =
    (wide
      ? portrait
        ? clamp(2.1 / aspect, 3.7, 5.6)
        : 3.02
      : profile
        ? 2.85
        : coast && !reverse
          ? 1.83
          : 1.38) -
    glide * 0.22;
  const along = wide
    ? coast
      ? 0.46
      : 0.85
    : profile
      ? -1.43
      : reverse
        ? 2.62
        : coast
          ? -2.15
          : -2.4;
  return {
    x: X + sideX * flank + x * along,
    y: (wide ? 1.74 : profile ? 1.57 : 1.62) - glide * 0.055,
    z: Z + sideZ * flank + z * along,
    targetX: X - sideX * (wide ? 0.055 : 0.0),
    targetY: wide ? (portrait ? 1.12 : 1.25) : profile ? 1.42 : 1.46,
    targetZ: Z - sideZ * (wide ? 0.055 : 0.0),
    fov: wide
      ? portrait
        ? 57
        : 45
      : profile
        ? portrait
          ? 48
          : 41
        : portrait
          ? 46
          : 36,
  };
}

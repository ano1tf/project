import { clamp } from "./core.mjs";

// Sole impact and scuff are separate layers. Wetness adds a short splash only outdoors.
const steps = {
  asphalt: { heel: 153, grit: 1130, tail: 0.105, hard: 0.84 },
  stone: { heel: 207, grit: 2280, tail: 0.086, hard: 1 },
  interior: { heel: 118, grit: 825, tail: 0.15, hard: 0.93 },
  garden: { heel: 96, grit: 1470, tail: 0.142, hard: 0.51 },
};

export class HarborAudio {
  constructor(options) {
    this.options = options;
    this.context = null;
    this.paused = true;
  }
  start() {
    try {
      if (!this.context) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return;
        const c = (this.context = new C());
        this.master = c.createGain();
        this.master.gain.value = 0;
        this.master.connect(c.destination);
        this.ambBus = c.createGain();
        this.ambBus.gain.value = 0;
        this.ambBus.connect(this.master);
        this.foley = c.createGain();
        this.foley.gain.value = 0;
        this.foley.connect(this.master);
        this.footPan = c.createStereoPanner?.();
        this.footPan?.connect(this.foley);
        this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const a = this.noise.getChannelData(0);
        let q = 0;
        for (let i = 0; i < a.length; i++) {
          q = q * 0.93 + (Math.random() * 2 - 1) * 0.15;
          a[i] = q * 0.62 + (Math.random() * 2 - 1) * 0.19;
        }
        this.grit = c.createBuffer(1, c.sampleRate, c.sampleRate);
        const grains = this.grit.getChannelData(0);
        for (let i = 0; i < grains.length; i++)
          grains[i] = Math.random() * 2 - 1;
        this.wind = this.noiseVoice(155, 0.22);
        this.rain = this.noiseVoice(1050, 0, "bandpass");
        this.tires = this.noiseVoice(325, 0, "bandpass");
        this.spray = this.noiseVoice(1690, 0, "bandpass", this.grit);
        this.water = this.noiseVoice(335, 0.095, "bandpass");
        this.streetRoom = this.noiseVoice(312, 0, "bandpass", this.grit);
        this.vehicle = this.engineVoice(false);
        this.traffic = this.engineVoice(true);
        const voice = c.createOscillator(),
          loud = c.createGain(),
          filter = c.createBiquadFilter();
        const pan = c.createStereoPanner?.();
        voice.type = "triangle";
        filter.type = "lowpass";
        filter.frequency.value = 1390;
        loud.gain.value = 0;
        voice.connect(filter);
        filter.connect(loud);
        if (pan) {
          loud.connect(pan);
          pan.connect(this.ambBus);
        } else loud.connect(this.ambBus);
        voice.start();
        this.siren = { voice, loud, pan, filter };
        this.notes = [49, 73.42, 116.54].map((freq, i) => {
          const osc = c.createOscillator(),
            g = c.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          osc.detune.value = i % 2 ? 5 : -3;
          g.gain.value = 0;
          osc.connect(g);
          g.connect(this.ambBus);
          osc.start();
          return g;
        });
      }
      if (this.context.state === "suspended")
        this.context.resume().catch(() => {});
      this.volume();
    } catch {
      // Do not leave a partially initialized audio graph feeding the game loop.
      const c = this.context;
      this.context = null;
      c?.close?.().catch(() => {});
    }
  }
  noiseVoice(freq, level, type = "lowpass", buffer = this.noise) {
    const c = this.context,
      s = c.createBufferSource(),
      flt = c.createBiquadFilter(),
      gain = c.createGain();
    s.buffer = buffer;
    s.loop = true;
    flt.type = type;
    flt.frequency.value = freq;
    flt.Q.value = 0.71;
    gain.gain.value = level;
    s.connect(flt);
    flt.connect(gain);
    gain.connect(this.ambBus);
    s.start();
    return { s, flt, gain };
  }
  engineVoice(spatial) {
    const c = this.context,
      osc = c.createOscillator(),
      osc2 = c.createOscillator(),
      low = c.createBiquadFilter(),
      gain = c.createGain(),
      pan = spatial && c.createStereoPanner ? c.createStereoPanner() : null;
    gain.gain.value = 0;
    osc.type = "sawtooth";
    osc2.type = "triangle";
    low.type = "lowpass";
    low.frequency.value = 125;
    low.Q.value = 0.7;
    osc.connect(low);
    osc2.connect(low);
    low.connect(gain);
    if (pan) {
      gain.connect(pan);
      pan.connect(this.ambBus);
    } else gain.connect(this.ambBus);
    osc.start();
    osc2.start();
    return { osc, osc2, low, gain, pan };
  }
  target(param, value, time = 0.16) {
    if (param && this.context)
      param.setTargetAtTime(value, this.context.currentTime, time);
  }
  volume() {
    this.target(
      this.master?.gain,
      this.options.sound && !this.background ? this.options.volume : 0,
      0.12,
    );
    this.target(
      this.foley?.gain,
      this.paused || this.background ? 0 : 1,
      0.035,
    );
    this.target(
      this.ambBus?.gain,
      this.paused
        ? this.scene
          ? this.scene === "sillage"
            ? 0.18
            : 0.31
          : 0
        : 1,
      0.16,
    );
  }
  pause(value) {
    this.paused = value;
    this.volume();
  }
  visibility(hidden) {
    this.background = hidden;
    this.volume();
  }
  cinema(scene) {
    this.scene = scene;
    this.volume();
  }
  tick({
    car,
    traffic,
    distance,
    pan,
    wet,
    roadWet,
    ocean,
    alert,
    time,
    throttle,
    sirenDistance,
    sirenPan,
    cover,
    workshop = false,
    square = 0,
    minutes = 0,
  }) {
    if (!this.canPlay() || this.paused) return;
    this.target(
      this.wind.gain.gain,
      0.15 + 0.038 * Math.sin(time * 0.52) + wet * 0.055,
    );
    this.target(this.rain.gain.gain, wet * (cover ? 0.19 : 0.34));
    this.target(this.rain.flt.frequency, cover ? 560 : 1050);
    this.target(
      this.water.gain.gain,
      0.27 * ocean * (0.83 + 0.17 * Math.sin(time * 1.2)),
    );
    const active = minutes > 6 * 60 && minutes < 21.25 * 60;
    this.target(
      this.streetRoom.gain.gain,
      workshop ? 0.076 : square * (active ? 0.062 : 0.02),
      0.36,
    );
    this.target(
      this.streetRoom.flt.frequency,
      workshop ? 178 : 382 + 48 * Math.sin(time * 0.62),
      0.42,
    );
    if (ocean > 0.58 && !cover && !car && time > (this.nextBell ?? 16)) {
      this.nextBell = time + 36 + 12 * wet;
      const now = this.context.currentTime;
      this.tap(now, 413, 409, ocean * 0.036, 1.03, this.ambBus);
      this.tap(now + 0.019, 627, 626, ocean * 0.021, 0.75, this.ambBus);
    }
    const slip = clamp(Math.abs(car?.slip || 0) * 3.4 - 0.21, 0, 1),
      speed = Math.abs(car?.speed || 0);
    this.target(
      this.tires.gain.gain,
      clamp(speed / 19, 0, 1) * (0.068 + roadWet * 0.06 + slip * 0.085),
    );
    this.target(
      this.tires.flt.frequency,
      340 + roadWet * 170 + speed * 7 + slip * 332,
    );
    this.target(
      this.spray.gain.gain,
      clamp(speed / 23, 0, 1) ** 1.25 * roadWet ** 2 * (0.05 + slip * 0.075),
    );
    this.target(this.spray.flt.frequency, 1390 + speed * 18 + slip * 258);
    const siren = this.siren;
    this.target(
      siren.loud.gain,
      alert
        ? 0.102 *
            clamp(1 - sirenDistance / 62, 0, 1) ** 1.55 *
            (cover ? 0.51 : 1)
        : 0,
      0.14,
    );
    this.target(
      siren.voice.frequency,
      654 + 274 * (0.5 + Math.sin(time * 3.98) * 0.5),
      0.07,
    );
    this.target(siren.pan?.pan, sirenPan, 0.12);
    this.target(siren.filter.frequency, cover ? 840 : 1490, 0.19);
    const engine = (v, s, distant = false) => {
      const k = s ? clamp(Math.abs(s.speed) / s.spec.max, 0, 1) : 0;
      const lift = Math.max(0, Math.sin(k * 15)) * 0.28,
        base = (s?.spec.tone || 48) * (distant ? 0.97 : 1);
      const gear = Number(s?.gear) || 1,
        bottom = [0, 0, 0.29, 0.53, 0.76][gear],
        top = [0, 0.29, 0.53, 0.76, 1][gear];
      const load = !distant && throttle && !s?.braking,
        rpm = distant
          ? k
          : clamp((k - bottom) / (top - bottom), 0, 1) * 0.63 + k * 0.34;
      const hz =
        base *
        (0.67 + rpm * 1.64 + lift + (load ? 0.18 : 0)) *
        (s?.gear === "R" ? 1.13 : 1);
      this.target(v.osc.frequency, hz, 0.09);
      this.target(v.osc2.frequency, hz * 0.493, 0.1);
      this.target(
        v.low.frequency,
        hz * (distant ? 2.2 : 3.0) + (load ? 50 : 0),
        0.14,
      );
      this.target(
        v.gain.gain,
        s
          ? distant
            ? 0.083 * clamp(1 - distance / 32, 0, 1) ** 2
            : 0.098 + k * 0.047 + (throttle ? 0.031 : 0)
          : 0,
        0.12,
      );
      this.target(v.pan?.pan, pan || 0, 0.15);
    };
    engine(this.vehicle, car);
    engine(this.traffic, traffic, true);
    this.notes.forEach((g, i) =>
      this.target(
        g.gain,
        (alert ? 0.014 : 0.0075) *
          (1 + 0.31 * Math.sin(time * (0.59 + i * 0.31) + i * 1.62)),
        0.32,
      ),
    );
  }
  canPlay() {
    return Boolean(
      this.context?.state === "running" &&
      this.options.sound &&
      !this.background,
    );
  }
  envelope(node, output, now, level, duration, tail) {
    const g = this.context.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(level, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    (tail || node).connect(g);
    g.connect(output);
    node.onended = () => {
      node.disconnect();
      tail?.disconnect();
      g.disconnect();
    };
  }
  burst(now, type, hz, q, level, duration, output = this.foley) {
    const c = this.context,
      noise = c.createBufferSource(),
      filter = c.createBiquadFilter();
    noise.buffer = this.grit;
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = q;
    noise.connect(filter);
    this.envelope(noise, output, now, level, duration, filter);
    noise.start(now, Math.random() * 0.61);
    noise.stop(now + duration + 0.009);
  }
  tap(now, hz, end, level, duration, output = this.foley, shape = "sine") {
    const source = this.context.createOscillator();
    source.type = shape;
    source.frequency.setValueAtTime(hz, now);
    source.frequency.exponentialRampToValueAtTime(end, now + duration);
    this.envelope(source, output, now, level, duration);
    source.start(now);
    source.stop(now + duration + 0.008);
  }
  radio(locked) {
    if (!this.canPlay() || this.context.currentTime < (this.nextRadio || 0))
      return;
    const now = this.context.currentTime;
    this.nextRadio = now + (locked ? 0.89 : 0.35);
    this.burst(
      now,
      "bandpass",
      1780,
      1.6,
      locked ? 0.11 : 0.17,
      locked ? 0.32 : 0.19,
      this.master,
    );
    if (!locked) return;
    this.tap(now + 0.075, 460, 395, 0.18, 0.23, this.master, "triangle");
    this.tap(now + 0.312, 740, 724, 0.15, 0.29, this.master);
    this.tap(now + 0.64, 521, 512, 0.11, 0.18, this.master);
  }
  footstep(surface, wetness, force, land = false, side = 0) {
    if (!this.canPlay() || this.paused) return;
    const now = this.context.currentTime,
      v = steps[surface],
      vary = 0.9 + Math.random() * 0.2,
      out = this.footPan || this.foley;
    this.target(this.footPan?.pan, land ? 0 : side * 0.16, 0.012);
    this.tap(
      now,
      v.heel * vary,
      v.heel * 0.51,
      force * v.hard * (land ? 0.14 : 0.063),
      land ? 0.115 : v.tail * 0.77,
      out,
    );
    this.burst(
      now + 0.009,
      "bandpass",
      v.grit * vary,
      0.81,
      force * (surface === "garden" ? 0.16 : 0.113),
      v.tail,
      out,
    );
    if (surface === "stone")
      this.burst(now, "highpass", 2780 * vary, 0.61, force * 0.063, 0.031, out);
    if (surface !== "interior" && wetness > 0.24)
      this.burst(
        now + 0.012,
        "bandpass",
        1610 + 510 * vary,
        0.69,
        force * (wetness - 0.24) * 0.195,
        land ? 0.154 : 0.112,
        out,
      );
  }
  door(heavy) {
    if (!this.canPlay() || this.paused) return;
    const now = this.context.currentTime;
    this.tap(now, 225, 146, 0.039, 0.045, this.foley, "triangle");
    this.burst(now + 0.05, "bandpass", 983, 0.73, 0.096, 0.15);
    this.burst(now + 0.64, "bandpass", 1316, 1.3, 0.26, 0.077);
    this.tap(now + 0.652, heavy ? 101 : 133, 51, heavy ? 0.244 : 0.177, 0.131);
  }
  impact(speed, metal) {
    if (!this.canPlay() || this.paused) return;
    const now = this.context.currentTime,
      power = clamp(speed / 16, 0.22, 1);
    this.tap(now, 107 - power * 21, 39, power * 0.31, 0.19);
    this.burst(now, "lowpass", 430 + power * 370, 0.67, power * 0.49, 0.18);
    this.burst(
      now + 0.017,
      "bandpass",
      metal ? 2330 : 1340,
      metal ? 2.4 : 0.87,
      power * 0.245,
      0.12 + power * 0.081,
    );
  }
  blip(kind) {
    if (!this.canPlay()) return;
    const now = this.context.currentTime;
    const freqs =
      kind === "reward"
        ? [392, 523, 659]
        : kind === "warning"
          ? [192, 144]
          : [436, 558];
    freqs.forEach((f, i) =>
      this.tap(
        now + i * 0.054,
        f,
        f,
        0.051,
        0.15,
        this.master,
        kind === "warning" ? "triangle" : "sine",
      ),
    );
  }
}

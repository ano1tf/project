/* ============================================================
   KREO RACING — SLOT SONS (sounds.js)
   Tout est synthétisé en WebAudio : moteur à régime variable,
   crissements de pneus, chocs, compte à rebours, fanfares.
   ============================================================ */

export class SoundSlot {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engine = null;
    this.screech = null;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  /* ---------- Moteur (4 oscillateurs + souffle) ---------- */
  startEngine() {
    if (!this.ctx || this.engine) return;
    const a = this.ctx;
    const g = a.createGain();
    g.gain.value = 0.0;
    const filter = a.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 1.2;

    // 2 sawtooth désaccordés + 1 square grave + 1 triangle haut = corps moteur
    const o1 = a.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 70;
    const o2 = a.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 71.5;
    const o3 = a.createOscillator(); o3.type = 'square'; o3.frequency.value = 35;
    const o4 = a.createOscillator(); o4.type = 'triangle'; o4.frequency.value = 210;
    const g4 = a.createGain(); g4.gain.value = 0.22;
    const g3 = a.createGain(); g3.gain.value = 0.5;

    o1.connect(filter); o2.connect(filter);
    o3.connect(g3); g3.connect(filter);
    o4.connect(g4); g4.connect(filter);
    filter.connect(g); g.connect(this.master);
    o1.start(); o2.start(); o3.start(); o4.start();

    this.engine = { o1, o2, o3, o4, filter, gain: g };
  }

  stopEngine() {
    if (!this.engine) return;
    try {
      this.engine.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      const e = this.engine;
      setTimeout(function () {
        try { e.o1.stop(); e.o2.stop(); e.o3.stop(); e.o4.stop(); } catch (err) { /* */ }
      }, 400);
    } catch (err) { /* */ }
    this.engine = null;
  }

  /**
   * rpmNorm 0..1, throttle 0..1, load 0..1 (accélération)
   */
  setEngine(rpmNorm, throttle, load) {
    if (!this.engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 55 + rpmNorm * 165;
    this.engine.o1.frequency.setTargetAtTime(base, t, 0.03);
    this.engine.o2.frequency.setTargetAtTime(base * 1.012, t, 0.03);
    this.engine.o3.frequency.setTargetAtTime(base * 0.5, t, 0.03);
    this.engine.o4.frequency.setTargetAtTime(base * 3.02, t, 0.03);
    this.engine.filter.frequency.setTargetAtTime(380 + throttle * 2100 + rpmNorm * 700, t, 0.05);
    const vol = 0.10 + throttle * 0.16 + (load || 0) * 0.05;
    this.engine.gain.gain.setTargetAtTime(vol, t, 0.06);
  }

  /* ---------- Crissement de pneus (bruit filtré) ---------- */
  tireScreech(intensity) {
    if (!this.ctx) return;
    if (!this.screech) {
      const a = this.ctx;
      const len = a.sampleRate * 2;
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = a.createBufferSource();
      src.buffer = buf; src.loop = true;
      const bp = a.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 4.5;
      const g = a.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start();
      this.screech = { src, filter: bp, gain: g };
    }
    const t = this.ctx.currentTime;
    this.screech.gain.gain.setTargetAtTime(Math.min(0.24, intensity * 0.24), t, 0.04);
    this.screech.filter.frequency.setTargetAtTime(1200 + intensity * 1400, t, 0.05);
  }

  /* ---------- Choc ---------- */
  impact(strength) {
    if (!this.ctx) return;
    const a = this.ctx;
    const t = a.currentTime;
    // grave
    const o = a.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    const g = a.createGain();
    g.gain.setValueAtTime(Math.min(0.5, 0.16 + strength * 0.4), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.32);
    // bruit métallique
    this._noiseBurst(0.12, Math.min(0.4, 0.1 + strength * 0.3), 2800);
  }

  _noiseBurst(dur, vol, freq) {
    const a = this.ctx;
    const t = a.currentTime;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    const g = a.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  /* ---------- Bips / compte à rebours / victoire ---------- */
  beep(freq, dur, vol) {
    if (!this.ctx) return;
    const a = this.ctx;
    const t = a.currentTime;
    const o = a.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = a.createGain();
    g.gain.setValueAtTime(vol || 0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  countdownBeep(isGo) {
    if (isGo) {
      this.beep(880, 0.5, 0.2);
      this.beep(1320, 0.45, 0.14);
    } else {
      this.beep(440, 0.28, 0.18);
    }
  }

  lapChime() {
    [660, 880, 1100].forEach((f, i) => setTimeout(() => this.beep(f, 0.16, 0.13), i * 90));
  }

  finishFanfare() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.beep(f, 0.22, 0.16), i * 130));
  }

  uiClick() {
    this.beep(720, 0.06, 0.08);
  }
}

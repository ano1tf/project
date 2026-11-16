/* ============================================================
   KREO RACING — SLOT SONS (sounds.js)
   Tout est synthétisé en WebAudio : moteur multi-couches
   (corps + grave + harmoniques + admission + distorsion),
   souffle de vitesse, bruit de route, crissements de pneus,
   chocs métalliques, pops de passage de rapport, fanfares.
   ============================================================ */

export class SoundSlot {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engine = null;
    this.screech = null;
    this.drive = null;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      // Compresseur de colle : évite les saturations
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -16;
      this.comp.knee.value = 22;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.004;
      this.comp.release.value = 0.24;
      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  /* ---------- Boucle de bruit partagée ---------- */
  _noiseLoop() {
    const a = this.ctx;
    const len = a.sampleRate * 2;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    return src;
  }

  /* ---------- Moteur (4 oscillateurs + admission + distorsion) ---------- */
  startEngine() {
    if (!this.ctx || this.engine) return;
    const a = this.ctx;

    // Distorsion légère (grain mécanique)
    const shaper = a.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 1.7);
    }
    shaper.curve = curve;

    const g = a.createGain();
    g.gain.value = 0.0;
    const filter = a.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 1.2;

    // Corps : 2 sawtooth désaccordés + square grave + triangle harmonique
    const o1 = a.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 70;
    const o2 = a.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 71.5;
    const o3 = a.createOscillator(); o3.type = 'square'; o3.frequency.value = 35;
    const o4 = a.createOscillator(); o4.type = 'triangle'; o4.frequency.value = 210;
    // Sous-grave (rumble)
    const o5 = a.createOscillator(); o5.type = 'sine'; o5.frequency.value = 35;
    const g5 = a.createGain(); g5.gain.value = 0.32;
    const g4 = a.createGain(); g4.gain.value = 0.22;
    const g3 = a.createGain(); g3.gain.value = 0.5;

    o1.connect(filter); o2.connect(filter);
    o3.connect(g3); g3.connect(filter);
    o4.connect(g4); g4.connect(filter);
    o5.connect(g5); g5.connect(filter);
    filter.connect(shaper); shaper.connect(g); g.connect(this.master);
    o1.start(); o2.start(); o3.start(); o4.start(); o5.start();

    // Admission : souffle d'air filtré, piloté par régime + gaz
    const intake = this._noiseLoop();
    const iF = a.createBiquadFilter();
    iF.type = 'bandpass'; iF.frequency.value = 900; iF.Q.value = 1.1;
    const iG = a.createGain(); iG.gain.value = 0;
    intake.connect(iF); iF.connect(iG); iG.connect(this.master);

    // Vibrato léger : battements vivants
    const lfo = a.createOscillator(); lfo.frequency.value = 0.7;
    const lfoG = a.createGain(); lfoG.gain.value = 1.6;
    lfo.connect(lfoG); lfoG.connect(o2.detune);
    lfo.start();

    this.engine = { o1, o2, o3, o4, o5, filter, gain: g, intake, iF, iG, lfo };
  }

  stopEngine() {
    if (!this.engine) return;
    try {
      this.engine.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      this.engine.iG.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      const e = this.engine;
      setTimeout(function () {
        try {
          e.o1.stop(); e.o2.stop(); e.o3.stop(); e.o4.stop(); e.o5.stop();
          e.intake.stop(); e.lfo.stop();
        } catch (err) { /* */ }
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
    const base = 48 + rpmNorm * 178;
    this.engine.o1.frequency.setTargetAtTime(base, t, 0.03);
    this.engine.o2.frequency.setTargetAtTime(base * 1.013, t, 0.03);
    this.engine.o3.frequency.setTargetAtTime(base * 0.5, t, 0.03);
    this.engine.o4.frequency.setTargetAtTime(base * 3.02, t, 0.03);
    this.engine.o5.frequency.setTargetAtTime(base * 0.25, t, 0.05);
    this.engine.filter.frequency.setTargetAtTime(320 + throttle * 2300 + rpmNorm * 950, t, 0.05);
    const vol = 0.11 + throttle * 0.17 + (load || 0) * 0.06;
    this.engine.gain.gain.setTargetAtTime(vol, t, 0.06);
    // Admission
    this.engine.iG.gain.setTargetAtTime(throttle * 0.10 + rpmNorm * 0.05, t, 0.08);
    this.engine.iF.frequency.setTargetAtTime(550 + rpmNorm * 2600 + throttle * 700, t, 0.08);
  }

  /** Pop d'échappement au passage de rapport */
  gearShift() {
    if (!this.ctx) return;
    const a = this.ctx;
    const t = a.currentTime;
    const o = a.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(92, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
    const g = a.createGain();
    g.gain.setValueAtTime(0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.13);
    this._noiseBurst(0.07, 0.09, 420);
  }

  /* ---------- Souffle de vitesse + bruit de route / hors-piste ---------- */
  speedNoise(speedNorm, offTrack) {
    if (!this.ctx) return;
    if (!this.drive) {
      const a = this.ctx;
      // Vent (hauts)
      const wind = this._noiseLoop();
      const wF = a.createBiquadFilter();
      wF.type = 'highpass'; wF.frequency.value = 420;
      const wG = a.createGain(); wG.gain.value = 0;
      wind.connect(wF); wF.connect(wG); wG.connect(this.master);
      // Route (graves roulants)
      const rum = this._noiseLoop();
      const rF = a.createBiquadFilter();
      rF.type = 'lowpass'; rF.frequency.value = 130; rF.Q.value = 0.8;
      const rG = a.createGain(); rG.gain.value = 0;
      rum.connect(rF); rF.connect(rG); rG.connect(this.master);
      this.drive = { wind, wF, wG, rum, rF, rG };
    }
    const t = this.ctx.currentTime;
    const s = Math.max(0, Math.min(1, speedNorm));
    this.drive.wG.gain.setTargetAtTime(s * s * 0.11, t, 0.12);
    this.drive.wF.frequency.setTargetAtTime(320 + s * 1000, t, 0.15);
    this.drive.rG.gain.setTargetAtTime(s * 0.055 + (offTrack ? 0.13 : 0), t, 0.1);
    this.drive.rF.frequency.setTargetAtTime(offTrack ? 240 : 115, t, 0.1);
  }

  /* ---------- Crissement de pneus (bruit filtré) ---------- */
  tireScreech(intensity) {
    if (!this.ctx) return;
    if (!this.screech) {
      const a = this.ctx;
      const src = this._noiseLoop();
      const bp = a.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 4.5;
      const pk = a.createBiquadFilter();
      pk.type = 'peaking'; pk.frequency.value = 2900; pk.Q.value = 2; pk.gain.value = 6;
      const g = a.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(pk); pk.connect(g); g.connect(this.master);
      this.screech = { src, filter: bp, gain: g };
    }
    const t = this.ctx.currentTime;
    this.screech.gain.gain.setTargetAtTime(Math.min(0.26, intensity * 0.26), t, 0.04);
    this.screech.filter.frequency.setTargetAtTime(1150 + intensity * 1550, t, 0.05);
  }

  /* ---------- Choc (grave + métal + raclage) ---------- */
  impact(strength) {
    if (!this.ctx) return;
    const a = this.ctx;
    const t = a.currentTime;
    // grave
    const o = a.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.22);
    const g = a.createGain();
    g.gain.setValueAtTime(Math.min(0.5, 0.16 + strength * 0.4), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.32);
    // bruit métallique
    this._noiseBurst(0.12, Math.min(0.4, 0.1 + strength * 0.3), 2800);
    // raclage
    this._noiseBurst(0.3, Math.min(0.22, 0.05 + strength * 0.18), 850);
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
    const g = a.createGain();
    g.gain.value = vol;
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
    // couche brillante
    const o2 = a.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq * 2;
    const g2 = a.createGain();
    g2.gain.setValueAtTime((vol || 0.16) * 0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);
    o.connect(g); o2.connect(g2);
    g.connect(this.master); g2.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
    o2.start(t); o2.stop(t + dur + 0.02);
  }

  countdownBeep(isGo) {
    if (isGo) {
      this.beep(880, 0.5, 0.2);
      this.beep(1320, 0.45, 0.14);
      this._noiseBurst(0.35, 0.12, 1600);
    } else {
      this.beep(440, 0.28, 0.18);
    }
  }

  lapChime() {
    [660, 880, 1100].forEach((f, i) => setTimeout(() => this.beep(f, 0.16, 0.13), i * 90));
  }

  finishFanfare() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => {
      this.beep(f, 0.22, 0.16);
      this.beep(f * 1.5, 0.18, 0.08);
    }, i * 130));
  }

  uiClick() {
    this.beep(720, 0.06, 0.08);
  }
}

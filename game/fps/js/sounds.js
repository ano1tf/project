/* ============================================================
   KREO ARENA — SLOT SONS (sounds.js)
   Tout est synthétisé en WebAudio : tirs (pistolet, fusil,
   fusil à pompe), rechargements, explosions, ennemis,
   pas, dégâts, cor de vague, ambiance drone.
   ============================================================ */

export class SoundSlot {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._ambient = null;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.knee.value = 20;
      this.comp.ratio.value = 5;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.2;
      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.85;
  }

  /* ---------- Briques de base ---------- */
  _noiseBuffer(dur) {
    const a = this.ctx;
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return buf;
  }

  _burst(dur, vol, freq, type, Q) {
    if (!this.ctx) return;
    const a = this.ctx;
    const t = a.currentTime;
    const src = a.createBufferSource();
    src.buffer = this._noiseBuffer(dur);
    const f = a.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = freq;
    f.Q.value = Q == null ? 1.1 : Q;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
    return f;
  }

  _tone(type, f0, f1, dur, vol, delay) {
    if (!this.ctx) return;
    const a = this.ctx;
    const t = a.currentTime + (delay || 0);
    const o = a.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* ---------- Tirs ---------- */
  shot(type) {
    if (!this.ctx) return;
    if (type === 'pistol') {
      this._burst(0.13, 0.42, 1900, 'bandpass', 0.9);
      this._tone('sine', 190, 58, 0.13, 0.34);
      this._tone('square', 340, 120, 0.04, 0.1);
      this._burst(0.3, 0.06, 900, 'lowpass', 0.7); // queue
    } else if (type === 'rifle') {
      this._burst(0.1, 0.46, 2500, 'bandpass', 1.0);
      this._tone('sine', 215, 70, 0.1, 0.32);
      this._tone('square', 520, 180, 0.03, 0.09);
      this._burst(0.26, 0.05, 1100, 'lowpass', 0.7);
    } else if (type === 'shotgun') {
      this._burst(0.3, 0.52, 1150, 'lowpass', 0.8);
      this._tone('sine', 130, 38, 0.26, 0.42);
      this._tone('square', 220, 80, 0.06, 0.12);
      this._burst(0.55, 0.08, 700, 'lowpass', 0.6);
    }
    // petit clic mécanique
    this._burst(0.03, 0.08, 3200, 'highpass', 1);
  }

  dryFire() {
    this._burst(0.04, 0.16, 2400, 'bandpass', 2);
  }

  reload(type) {
    // clic-clac en 2 temps
    this._burst(0.05, 0.2, 1800, 'bandpass', 2.2);
    setTimeout(() => this._burst(0.06, 0.22, 1200, 'bandpass', 2), 240);
    setTimeout(() => this._burst(0.05, 0.24, 2600, 'bandpass', 2.4), 520);
    if (type === 'shotgun') setTimeout(() => this._burst(0.07, 0.2, 900, 'bandpass', 1.8), 760);
  }

  weaponSwitch() {
    this._burst(0.05, 0.14, 1500, 'bandpass', 1.8);
  }

  /* ---------- Impacts / feedback ---------- */
  hitmarker() {
    this._tone('square', 2100, 2100, 0.035, 0.12);
    this._tone('square', 2750, 2750, 0.03, 0.07, 0.012);
  }

  headshot() {
    this._tone('square', 1900, 2400, 0.06, 0.13);
    this._tone('square', 2900, 3400, 0.07, 0.1, 0.03);
  }

  impact() {
    this._burst(0.07, 0.18, 2600, 'bandpass', 1.4);
    this._tone('sine', 320, 120, 0.05, 0.1);
  }

  explosion() {
    this._burst(0.65, 0.55, 900, 'lowpass', 0.7);
    this._tone('sine', 105, 26, 0.55, 0.5);
    this._burst(0.9, 0.12, 500, 'lowpass', 0.6);
    this._tone('square', 60, 30, 0.3, 0.16);
  }

  playerHurt() {
    this._tone('sine', 170, 90, 0.16, 0.3);
    this._burst(0.12, 0.16, 700, 'lowpass', 1);
  }

  /* ---------- Ennemis ---------- */
  enemyShot() {
    this._burst(0.11, 0.22, 1400, 'bandpass', 1.2);
    this._tone('square', 420, 160, 0.1, 0.12);
  }

  enemyHurt() {
    this._tone('square', 320, 210, 0.09, 0.14);
    this._burst(0.06, 0.12, 1900, 'bandpass', 1.6);
  }

  enemyDeath() {
    this._tone('square', 380, 90, 0.3, 0.2);
    this._tone('sawtooth', 220, 55, 0.34, 0.14, 0.02);
    this._burst(0.4, 0.2, 800, 'lowpass', 0.8);
  }

  projectile() {
    this._tone('sawtooth', 620, 320, 0.14, 0.08);
    this._burst(0.12, 0.06, 1700, 'bandpass', 1.4);
  }

  /* ---------- Déplacements ---------- */
  footstep(vol) {
    this._burst(0.06, 0.05 + (vol || 0) * 0.06, 360, 'lowpass', 1.1);
    this._burst(0.03, 0.03, 1600, 'highpass', 1);
  }

  jump() {
    this._burst(0.08, 0.08, 500, 'lowpass', 1);
  }

  land() {
    this._burst(0.1, 0.14, 300, 'lowpass', 1);
    this._tone('sine', 140, 70, 0.08, 0.12);
  }

  /* ---------- Vague / jeu ---------- */
  waveHorn(n) {
    // cor de vague : saw grave + quinte
    const base = 92 + (n || 1) * 4;
    this._tone('sawtooth', base, base, 0.85, 0.16);
    this._tone('sawtooth', base * 1.5, base * 1.5, 0.85, 0.1);
    this._tone('triangle', base * 2, base * 2, 0.6, 0.08);
    this._burst(0.9, 0.06, 300, 'lowpass', 0.7);
  }

  pickup() {
    this._tone('square', 660, 990, 0.09, 0.12);
    this._tone('square', 990, 1320, 0.1, 0.09, 0.05);
  }

  victory() {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
      this._tone('square', f, f, 0.18, 0.12, i * 0.12);
      this._tone('triangle', f * 1.5, f * 1.5, 0.16, 0.07, i * 0.12);
    });
  }

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => {
      this._tone('sawtooth', f, f * 0.98, 0.42, 0.14, i * 0.3);
      this._tone('square', f / 2, f / 2, 0.42, 0.08, i * 0.3);
    });
  }

  uiClick() {
    this._tone('square', 720, 720, 0.05, 0.08);
  }

  /* ---------- Ambiance (drone + vent) ---------- */
  ambientStart() {
    if (!this.ctx || this._ambient) return;
    const a = this.ctx;
    const g = a.createGain();
    g.gain.value = 0;
    g.connect(this.master);
    // Drone : 2 sawtooth désaccordés + filtrage
    const o1 = a.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = a.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 55.6;
    const o3 = a.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 110.3;
    const f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 240; f.Q.value = 0.8;
    const g3 = a.createGain(); g3.gain.value = 0.25;
    o1.connect(f); o2.connect(f); o3.connect(g3); g3.connect(f);
    f.connect(g);
    // Vent
    const len = a.sampleRate * 2;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf; src.loop = true;
    const wf = a.createBiquadFilter();
    wf.type = 'bandpass'; wf.frequency.value = 480; wf.Q.value = 0.6;
    const wg = a.createGain(); wg.gain.value = 0.05;
    src.connect(wf); wf.connect(wg); wg.connect(this.master);
    // Lente modulation du vent
    const lfo = a.createOscillator(); lfo.frequency.value = 0.07;
    const lg = a.createGain(); lg.gain.value = 180;
    lfo.connect(lg); lg.connect(wf.frequency);
    o1.start(); o2.start(); o3.start(); src.start(); lfo.start();
    g.gain.setTargetAtTime(0.06, a.currentTime, 1.2);
    this._ambient = { o1, o2, o3, src, lfo, g };
  }

  ambientStop() {
    if (!this._ambient) return;
    try {
      const e = this._ambient;
      e.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      setTimeout(() => {
        try { e.o1.stop(); e.o2.stop(); e.o3.stop(); e.src.stop(); e.lfo.stop(); } catch (err) { /* */ }
      }, 800);
    } catch (err) { /* */ }
    this._ambient = null;
  }
}

/* ============================================================
   KREO ARENA — SLOT SONS (sounds.js)
   Synthèse d'armes crédible : détonation en 3 couches
   (corps filtré + claquement + queue de réverbération par
   convolution), voix mécaniques (percussions de métal),
   pas avec matière, ambiance industrielle multicouche.

   Aucun fichier audio : tout est généré, donc zéro octet à
   télécharger et zéro licence.
   ============================================================ */

export class SoundSlot {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._ambient = null;
    this._ir = null;            // réponse impulsionnelle de réverbération
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();

      // Bus : master → compresseur → destination
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -16;
      this.comp.knee.value = 18;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.002;
      this.comp.release.value = 0.22;
      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);

      // Bus « monde » : réverbération de cour industrielle (convolue une IR générée)
      this.conv = this.ctx.createConvolver();
      this.conv.buffer = this._impulse(2.6, 2.2);
      this.wet = this.ctx.createGain();
      this.wet.gain.value = 0.16;
      this.conv.connect(this.wet);
      this.wet.connect(this.master);

      // Bus « interface » : sans réverbération, plus proche
      this.ui = this.ctx.createGain();
      this.ui.gain.value = 0.6;
      this.ui.connect(this.master);

      // Bruit blanc précalculé (1 s) réutilisé par toutes les couches
      this._noise = this._noiseBuffer(1);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.85;
  }

  /* ---------- Briques ---------- */
  _noiseBuffer(dur) {
    const a = this.ctx;
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Réverbération : bruit décroissant dont la brillance s'atténue (IR de salle). */
  _impulse(dur, decay) {
    const a = this.ctx;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(2, len, a.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // pré-délai + décroissance exponentielle + filtre passe-bas progressif
        const env = Math.pow(1 - t, decay) * (i < a.sampleRate * 0.015 ? 0 : 1);
        lp = lp * 0.72 + (Math.random() * 2 - 1) * 0.28;
        d[i] = lp * env;
      }
    }
    return buf;
  }

  /** Souffle filtré : la base de la détonation. */
  _burst({ dur, vol, freq, q, type, when, verb, dest }) {
    if (!this.ctx) return;
    const a = this.ctx;
    const t = a.currentTime + (when || 0);
    const src = a.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;

    const f = a.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.35), t + dur);
    f.Q.value = q == null ? 1.1 : q;

    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    src.connect(f);
    f.connect(g);
    g.connect(dest || this.master);
    if (verb) g.connect(this.conv);

    src.start(t, Math.random() * 0.6);
    src.stop(t + dur + 0.05);
  }

  _tone(type, f0, f1, dur, vol, when, dest, verb) {
    if (!this.ctx) return;
    const a = this.ctx;
    const t = a.currentTime + (when || 0);
    const o = a.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(18, f1), t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(dest || this.master);
    if (verb) g.connect(this.conv);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /* ---------- Tirs ----------
     Chaque arme a sa personnalité :
     pistolet = sec et claquant ; fusil = tranchant et nerveux ;
     fusil à pompe = énorme, grave, avec une longue queue de salle. */
  shot(type) {
    if (!this.ctx) return;
    if (type === 'pistol') {
      this._burst({ dur: 0.05, vol: 0.5, freq: 3600, q: 1.6, type: 'highpass', verb: false });
      this._burst({ dur: 0.16, vol: 0.42, freq: 1400, q: 0.9, verb: true });
      this._tone('sine', 210, 62, 0.14, 0.34, 0, this.master, true);
      this._tone('square', 620, 180, 0.03, 0.08);
      this._burst({ dur: 0.26, vol: 0.05, freq: 700, q: 0.7, type: 'lowpass', verb: true });
    } else if (type === 'rifle') {
      this._burst({ dur: 0.04, vol: 0.52, freq: 4200, q: 1.8, type: 'highpass' });
      this._burst({ dur: 0.13, vol: 0.46, freq: 2000, q: 1.2, verb: true });
      this._tone('sine', 240, 74, 0.11, 0.3, 0, this.master, true);
      this._tone('sawtooth', 380, 90, 0.05, 0.1);
      this._burst({ dur: 0.32, vol: 0.055, freq: 900, q: 0.7, type: 'lowpass', verb: true });
    } else {
      // fusil à pompe : détonation massive + claquement mécanique
      this._burst({ dur: 0.07, vol: 0.6, freq: 2800, q: 1.1, type: 'lowpass' });
      this._burst({ dur: 0.34, vol: 0.5, freq: 900, q: 0.8, verb: true });
      this._tone('sine', 120, 34, 0.3, 0.46, 0, this.master, true);
      this._tone('triangle', 78, 26, 0.34, 0.3, 0, this.master, true);
      this._tone('square', 260, 70, 0.07, 0.12);
      this._burst({ dur: 0.6, vol: 0.07, freq: 480, q: 0.6, type: 'lowpass', verb: true });
      // culasse
      this._burst({ dur: 0.08, vol: 0.16, freq: 1500, q: 3.5, when: 0.16 });
    }
    // clic de percuteur
    this._burst({ dur: 0.022, vol: 0.1, freq: 5200, q: 2, type: 'highpass', dest: this.ui });
  }

  dryFire() {
    this._burst({ dur: 0.035, vol: 0.2, freq: 3200, q: 3, dest: this.ui });
    this._tone('square', 180, 120, 0.03, 0.05, 0, this.ui);
  }

  reload(type) {
    // trois temps : sortir, insérer, verrouiller (bois + métal)
    this._click(0.02, 2200, 0.22);
    this._wood(0.24, 0.16);
    this._click(0.52, 1400, 0.26);
    this._wood(0.56, 0.14);
    this._click(0.78, 2800, 0.3);
    if (type === 'shotgun') {
      this._wood(0.98, 0.2);
      this._click(1.12, 1800, 0.28);
    }
  }

  _click(when, freq, vol) {
    this._burst({ dur: 0.045, vol: vol * 0.55, freq: freq, q: 4, when: when, dest: this.ui });
    this._tone('square', freq * 0.35, freq * 0.2, 0.03, vol * 0.25, when, this.ui);
  }
  _wood(when, vol) {
    this._burst({ dur: 0.09, vol: vol * 0.5, freq: 380, q: 1.4, type: 'lowpass', when: when, dest: this.ui });
    this._tone('triangle', 210, 130, 0.07, vol * 0.3, when, this.ui);
  }

  weaponSwitch() {
    this._click(0, 1600, 0.2);
    this._click(0.09, 2600, 0.14);
  }

  /* ---------- Feedback de combat ---------- */
  hitmarker() {
    this._tone('square', 2400, 2400, 0.028, 0.1, 0, this.ui);
    this._tone('square', 3300, 3300, 0.024, 0.055, 0.012, this.ui);
  }

  headshot() {
    // cloche métallique réussie : deux partiels plus une queue
    this._tone('square', 1980, 2600, 0.05, 0.11, 0, this.ui);
    this._tone('sine', 3960, 4200, 0.14, 0.05, 0.02, this.ui);
    this._burst({ dur: 0.1, vol: 0.05, freq: 6000, q: 2, type: 'highpass', dest: this.ui });
  }

  impact() {
    this._burst({ dur: 0.05, vol: 0.2, freq: 3200, q: 2.2 });
    this._tone('sine', 420, 140, 0.045, 0.09);
    this._burst({ dur: 0.12, vol: 0.05, freq: 1200, q: 1.2, verb: true });
  }

  explosion() {
    this._burst({ dur: 0.75, vol: 0.62, freq: 700, q: 0.6, type: 'lowpass', verb: true });
    this._tone('sine', 95, 22, 0.62, 0.5, 0, this.master, true);
    this._tone('sawtooth', 130, 40, 0.4, 0.14);
    this._burst({ dur: 1.1, vol: 0.1, freq: 420, q: 0.5, type: 'lowpass', verb: true });
  }

  playerHurt() {
    this._tone('sine', 160, 82, 0.17, 0.28);
    this._burst({ dur: 0.13, vol: 0.14, freq: 640, q: 1, type: 'lowpass' });
  }

  /* ---------- Ennemis ---------- */
  enemyShot() {
    this._burst({ dur: 0.09, vol: 0.22, freq: 1600, q: 1.6 });
    this._tone('sawtooth', 430, 150, 0.09, 0.1);
  }

  enemyHurt() {
    // métal frappé : partiels inharmoniques courts
    this._tone('square', 330, 215, 0.08, 0.12);
    this._tone('square', 545, 400, 0.06, 0.06, 0.01);
    this._burst({ dur: 0.05, vol: 0.1, freq: 2100, q: 2.4 });
  }

  enemyDeath() {
    this._tone('square', 400, 70, 0.34, 0.18);
    this._tone('sawtooth', 210, 42, 0.4, 0.12, 0.02);
    this._burst({ dur: 0.45, vol: 0.18, freq: 800, q: 0.8, type: 'lowpass', verb: true });
    this._burst({ dur: 0.25, vol: 0.1, freq: 2400, q: 2, when: 0.06 });
  }

  projectile() {
    this._tone('sawtooth', 700, 260, 0.13, 0.07);
    this._burst({ dur: 0.1, vol: 0.05, freq: 2200, q: 1.8 });
  }

  /* ---------- Déplacements ---------- */
  footstep(vol) {
    // matière : gravier + poids du corps
    const v = 0.05 + (vol || 0) * 0.07;
    this._burst({ dur: 0.07, vol: v, freq: 320 + Math.random() * 140, q: 1.2, type: 'lowpass' });
    this._burst({ dur: 0.028, vol: v * 0.5, freq: 2400 + Math.random() * 900, q: 2, type: 'highpass' });
  }

  jump() {
    this._burst({ dur: 0.08, vol: 0.07, freq: 520, q: 1, type: 'lowpass' });
  }

  land() {
    this._burst({ dur: 0.12, vol: 0.14, freq: 260, q: 0.9, type: 'lowpass' });
    this._tone('sine', 130, 58, 0.1, 0.12);
  }

  /* ---------- Jeu ---------- */
  waveHorn(n) {
    // cor de vague : quinte + tierce, nappes qui montent avec le numéro
    const base = 88 + (n || 1) * 3.5;
    const dur = 1.1;
    this._tone('sawtooth', base, base, dur, 0.14, 0, this.master, true);
    this._tone('sawtooth', base * 1.5, base * 1.5, dur, 0.09, 0, this.master, true);
    this._tone('sawtooth', base * 2.02, base * 2.02, dur * 0.8, 0.05, 0, this.master, true);
    this._tone('triangle', base * 3, base * 3, dur * 0.5, 0.04);
    this._burst({ dur: 1.2, vol: 0.06, freq: 260, q: 0.6, type: 'lowpass', verb: true });
  }

  pickup() {
    this._tone('sine', 720, 1080, 0.08, 0.1, 0, this.ui);
    this._tone('sine', 1080, 1440, 0.1, 0.07, 0.06, this.ui);
    this._tone('triangle', 2160, 2160, 0.12, 0.04, 0.06, this.ui);
  }

  victory() {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
      this._tone('triangle', f, f, 0.26, 0.11, i * 0.13, this.master, true);
      this._tone('sine', f * 2, f * 2, 0.2, 0.05, i * 0.13);
      this._tone('sawtooth', f / 2, f / 2, 0.3, 0.04, i * 0.13, this.master, true);
    });
  }

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => {
      this._tone('sawtooth', f, f * 0.97, 0.5, 0.12, i * 0.32, this.master, true);
      this._tone('sine', f / 2, f / 2, 0.5, 0.07, i * 0.32, this.master, true);
    });
  }

  uiClick() {
    this._tone('square', 820, 620, 0.035, 0.06, 0, this.ui);
    this._burst({ dur: 0.02, vol: 0.05, freq: 4200, q: 2, type: 'highpass', dest: this.ui });
  }

  /* ---------- Ambiance : drone + vent + grondement ---------- */
  ambientStart() {
    if (!this.ctx || this._ambient) return;
    const a = this.ctx;
    const bus = a.createGain();
    bus.gain.value = 0;
    bus.connect(this.master);
    bus.connect(this.conv);

    // Drone : deux sawtooth désaccordés + sous-octave
    const o1 = a.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = a.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 55.7;
    const o3 = a.createOscillator(); o3.type = 'sine'; o3.frequency.value = 27.5;
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 230; lp.Q.value = 0.9;
    const g3 = a.createGain(); g3.gain.value = 0.35;
    o1.connect(lp); o2.connect(lp); o3.connect(g3); g3.connect(lp);

    // Vent : bruit bouclé, filtre balayé par un LFO lent
    const src = a.createBufferSource();
    src.buffer = this._noise; src.loop = true;
    const wf = a.createBiquadFilter();
    wf.type = 'bandpass'; wf.frequency.value = 520; wf.Q.value = 0.55;
    const wg = a.createGain(); wg.gain.value = 0.055;
    src.connect(wf); wf.connect(wg); wg.connect(bus);

    // Grondement : bruit très filtré qui donne du poids à la scène
    const rumble = a.createBufferSource();
    rumble.buffer = this._noise; rumble.loop = true; rumble.playbackRate.value = 0.5;
    const rf = a.createBiquadFilter();
    rf.type = 'lowpass'; rf.frequency.value = 90; rf.Q.value = 1.2;
    const rg = a.createGain(); rg.gain.value = 0.09;
    rumble.connect(rf); rf.connect(rg); rg.connect(bus);

    const lfo = a.createOscillator(); lfo.frequency.value = 0.07;
    const lg = a.createGain(); lg.gain.value = 190;
    lfo.connect(lg); lg.connect(wf.frequency);

    lp.connect(bus);

    o1.start(); o2.start(); o3.start(); src.start(); rumble.start(); lfo.start();
    bus.gain.setTargetAtTime(0.085, a.currentTime, 1.2);
    this._ambient = { o1, o2, o3, src, rumble, lfo, bus };
  }

  ambientStop() {
    if (!this._ambient) return;
    try {
      const e = this._ambient;
      e.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      setTimeout(() => {
        try {
          e.o1.stop(); e.o2.stop(); e.o3.stop();
          e.src.stop(); e.rumble.stop(); e.lfo.stop();
        } catch (err) { /* déjà arrêté */ }
      }, 800);
    } catch (err) { /* */ }
    this._ambient = null;
  }
}

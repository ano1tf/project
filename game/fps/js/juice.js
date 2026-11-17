/* ============================================================
   KREO ARENA — SLOT JUICE (juice.js)
   Le « game feel » : hitstop (gel du temps à l'impact),
   screenshake, kick de caméra, FOV de sprint/ADS, inertie du
   viewmodel, et surbrillance des ennemis touchés.
   ============================================================ */

export class Juice {
  constructor({ camera, weapons }) {
    this.camera = camera;
    this.weapons = weapons;
    this.timeScale = 1;
    this.hitstopT = 0;
    this.shakeAmt = 0;
    this.shakeDecay = 9;
    this._kickPitch = 0;
    this._kickRoll = 0;
    this._fovKick = 0;
    this.onShake = null;   // (amount) => post.shake
  }

  /** Gel du temps : 35–90 ms selon la violence de l'impact. */
  hitstop(dur) {
    this.hitstopT = Math.max(this.hitstopT, dur || 0.055);
  }

  shake(amount) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
    if (this.onShake) this.onShake(amount);
  }

  kick(pitch, roll, fov) {
    this._kickPitch += pitch || 0;
    this._kickRoll += roll || 0;
    this._fovKick += fov || 0;
  }

  /** À appeler en tête de boucle : renvoie le dt « gameplay ». */
  tick(rawDt) {
    if (this.hitstopT > 0) {
      this.hitstopT -= rawDt;
      this.timeScale = 0.06;          // ~gel mais la vie continue de pulser
    } else {
      this.timeScale += (1 - this.timeScale) * Math.min(1, rawDt * 22);
      if (this.timeScale > 0.995) this.timeScale = 1;
    }
    this.shakeAmt *= Math.pow(0.0016, rawDt);   // décroissance rapide
    this._kickPitch *= Math.pow(0.002, rawDt);
    this._kickRoll *= Math.pow(0.002, rawDt);
    this._fovKick *= Math.pow(0.01, rawDt);
    return rawDt * this.timeScale;
  }

  /** Décalage de caméra à appliquer après le contrôleur joueur. */
  applyCameraShake(cam) {
    if (this.shakeAmt < 0.0004) return;
    const a = this.shakeAmt;
    cam.position.x += (Math.random() - 0.5) * a;
    cam.position.y += (Math.random() - 0.5) * a;
    cam.rotation.z += (Math.random() - 0.5) * a * 0.35;
  }

  applyViewmodel(vm) {
    vm.rotation.x += this._kickPitch;
    vm.rotation.z += this._kickRoll;
  }
}

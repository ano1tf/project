/* ============================================================
   KREO RACING — SLOT CAMÉRAS (cameras.js)
   Caméra de poursuite ressort, caméra capot, caméras
   cinématiques fixes (style retransmission TV), intro orbitale.
   ============================================================ */
import * as THREE from 'three';

const CAM_LABELS = {
  chase: { fr: 'CAMÉRA : POURSUITE', en: 'CAMERA: CHASE' },
  hood: { fr: 'CAMÉRA : CAPOT', en: 'CAMERA: HOOD' },
  cinematic: { fr: 'CAMÉRA : CINÉMATIQUE', en: 'CAMERA: CINEMATIC' }
};

export class CameraSlot {
  constructor(camera, track) {
    this.camera = camera;
    this.track = track;
    this.mode = 'chase';
    this._pos = new THREE.Vector3(15, 8, 15);
    this._look = new THREE.Vector3();
    this._fov = 60;
    this._introAngle = 0;
    this._cineIdx = 0;
    this._cineTimer = 0;

    // Caméras fixes le long du circuit
    this.cineCams = [];
    for (let k = 0; k < 9; k++) {
      const i = Math.floor((k / 9) * track.samples.length);
      const s = track.samples[i];
      const side = k % 2 ? 1 : -1;
      const p = s.pos.clone().addScaledVector(s.left, side * 24);
      p.y += 7.5 + (k % 3) * 2.5;
      this.cineCams.push(p);
    }
  }

  cycle() {
    const order = ['chase', 'hood', 'cinematic'];
    this.mode = order[(order.indexOf(this.mode) + 1) % order.length];
    return this.mode;
  }

  label(lang) {
    return CAM_LABELS[this.mode][lang === 'en' ? 'en' : 'fr'];
  }

  /**
   * @param carGroup objet 3D de la voiture suivie
   * @param speed m/s
   * @param phase 'intro' | 'racing'
   */
  update(dt, carGroup, speed, phase) {
    const carPos = carGroup.position;
    const q = carGroup.quaternion;
    const speedNorm = Math.min(1, Math.abs(speed) / 65);

    if (phase === 'intro') {
      // Orbite autour de la grille de départ
      this._introAngle += dt * 0.22;
      const target = new THREE.Vector3(
        carPos.x + Math.cos(this._introAngle) * 20,
        carPos.y + 7.5,
        carPos.z + Math.sin(this._introAngle) * 20
      );
      this.camera.position.lerp(target, Math.min(1, dt * 2.4));
      this.camera.lookAt(carPos.x, carPos.y + 1.2, carPos.z);
      this._setFov(58);
      return;
    }

    if (this.mode === 'hood') {
      const pos = new THREE.Vector3(0, 1.62, 0.55).applyQuaternion(q).add(carPos);
      const look = new THREE.Vector3(0, 1.3, 14).applyQuaternion(q).add(carPos);
      this.camera.position.lerp(pos, Math.min(1, dt * 18));
      this._look.lerp(look, Math.min(1, dt * 12));
      this.camera.lookAt(this._look);
      this._applyShake(dt, speedNorm * 0.55);
      this._setFov(66 + speedNorm * 14);
      return;
    }

    if (this.mode === 'cinematic') {
      this._cineTimer += dt;
      const camPos = this.cineCams[this._cineIdx % this.cineCams.length];
      const dist = camPos.distanceTo(carPos);
      if (dist > 150 || this._cineTimer > 7) {
        this._cineIdx++;
        this._cineTimer = 0;
      }
      this.camera.position.lerp(camPos, Math.min(1, dt * 2.2));
      this._look.lerp(new THREE.Vector3(carPos.x, carPos.y + 1.2, carPos.z), Math.min(1, dt * 6));
      this.camera.lookAt(this._look);
      this._applyShake(dt, speedNorm * 0.4);
      this._setFov(52 + speedNorm * 6);
      return;
    }

    // Poursuite (ressort amorti)
    const desired = new THREE.Vector3(0, 3.55, -9.6).applyQuaternion(q).add(carPos);
    desired.y = Math.max(desired.y, carPos.y + 1.6);
    const k = 1 - Math.exp(-6.2 * dt);
    this.camera.position.lerp(desired, k);
    const lookTarget = new THREE.Vector3(0, 1.5, 8).applyQuaternion(q).add(carPos);
    this._look.lerp(lookTarget, Math.min(1, dt * 10));
    this.camera.lookAt(this._look);
    this._applyShake(dt, speedNorm);
    this._setFov(58 + speedNorm * 16);
  }

  /* Micro-secousses : vibration de vitesse */
  _applyShake(dt, speedNorm) {
    const amp = speedNorm * speedNorm * 0.11;
    if (amp < 0.004) return;
    const t = performance.now() * 0.001;
    const n1 = Math.sin(t * 23.7) * Math.sin(t * 11.3 + 1.7);
    const n2 = Math.sin(t * 19.1 + 2.3) * Math.sin(t * 7.9);
    const n3 = Math.sin(t * 27.3 + 0.6) * Math.sin(t * 13.1 + 4.2);
    this.camera.position.x += n1 * amp;
    this.camera.position.y += n2 * amp * 0.75;
    this.camera.position.z += n3 * amp * 0.6;
  }

  _setFov(v) {
    if (Math.abs(this.camera.fov - v) > 0.05) {
      this.camera.fov += (v - this.camera.fov) * 0.12;
      this.camera.updateProjectionMatrix();
    }
  }
}

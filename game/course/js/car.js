/* ============================================================
   KREO RACING — SLOTS 3D + ANIMATIONS (car.js)
   Voiture de course construite procéduralement :
   carrosserie PBR (clearcoat), vitres, aileron, roues avec
   jantes, feux. Animations : rotation des roues, direction,
   roulis / tangage / suspension.
   ============================================================ */
import * as THREE from 'three';

export class CarSlot {
  constructor(scene, { color = 0x2563EB, isPlayer = false, name = 'Voiture' } = {}) {
    this.name = name;
    this.isPlayer = isPlayer;
    this.group = new THREE.Group();       // position/yaw = physique
    this.body = new THREE.Group();        // sous-transform = animations (roulis, tangage)
    this.group.add(this.body);

    const paint = new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.72,
      roughness: 0.26,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.15
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14161C, metalness: 0.55, roughness: 0.5 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x1A2230, metalness: 0.35, roughness: 0.12,
      transparent: true, opacity: 0.62, envMapIntensity: 2
    });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xC9CFDD, metalness: 0.95, roughness: 0.22 });

    const mk = (geo, mat, x, y, z, rx, ry, rz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      if (ry) m.rotation.y = ry;
      if (rz) m.rotation.z = rz;
      m.castShadow = true;
      m.receiveShadow = true;
      this.body.add(m);
      return m;
    };

    /* ---- Carrosserie (avant = +z) ---- */
    mk(new THREE.BoxGeometry(2.02, 0.52, 4.62), paint, 0, 0.56, 0);            // caisse basse
    mk(new THREE.BoxGeometry(1.94, 0.4, 3.9), paint, 0, 0.96, -0.08);          // caisse haute
    mk(new THREE.BoxGeometry(1.8, 0.3, 1.62), paint, 0, 1.16, 1.42, -0.09);    // capot avant
    mk(new THREE.BoxGeometry(1.86, 0.3, 1.35), paint, 0, 1.2, -1.72, 0.07);    // custode arrière
    mk(new THREE.BoxGeometry(1.58, 0.52, 1.85), glass, 0, 1.5, -0.18);         // vitres (habitacle)
    mk(new THREE.BoxGeometry(1.5, 0.2, 1.4), paint, 0, 1.72, -0.3);            // toit
    mk(new THREE.BoxGeometry(2.08, 0.1, 0.62), dark, 0, 0.34, 2.28);           // splitteur
    mk(new THREE.BoxGeometry(2.0, 0.22, 0.5), dark, 0, 0.44, -2.28);           // diffuseur
    // Aileron
    mk(new THREE.BoxGeometry(0.09, 0.52, 0.1), dark, -0.72, 1.52, -2.16);
    mk(new THREE.BoxGeometry(0.09, 0.52, 0.1), dark, 0.72, 1.52, -2.16);
    mk(new THREE.BoxGeometry(1.98, 0.09, 0.52), paint, 0, 1.82, -2.18, 0.12);
    // Échappements
    mk(new THREE.CylinderGeometry(0.09, 0.11, 0.3, 10), chrome, -0.55, 0.5, -2.42, Math.PI / 2);
    mk(new THREE.CylinderGeometry(0.09, 0.11, 0.3, 10), chrome, 0.55, 0.5, -2.42, Math.PI / 2);
    // Prises d'air
    mk(new THREE.BoxGeometry(0.8, 0.16, 0.3), dark, 0, 1.28, 1.02);

    /* ---- Feux ---- */
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xFFF6DC, emissive: 0xFFF2C8, emissiveIntensity: 1.6, roughness: 0.2
    });
    this.tailMat = new THREE.MeshStandardMaterial({
      color: 0xFF2E3C, emissive: 0xFF2030, emissiveIntensity: 1.4, roughness: 0.3
    });
    mk(new THREE.BoxGeometry(0.5, 0.14, 0.08), headMat, -0.62, 1.02, 2.33);
    mk(new THREE.BoxGeometry(0.5, 0.14, 0.08), headMat, 0.62, 1.02, 2.33);
    mk(new THREE.BoxGeometry(0.56, 0.15, 0.08), this.tailMat, -0.66, 1.12, -2.34);
    mk(new THREE.BoxGeometry(0.56, 0.15, 0.08), this.tailMat, 0.66, 1.12, -2.34);

    /* ---- Roues (groupe par roue : direction + rotation) ---- */
    this.wheels = [];
    const tireGeo = new THREE.CylinderGeometry(0.53, 0.53, 0.44, 22);
    tireGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.46, 16);
    rimGeo.rotateZ(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(0.5, 0.075, 0.1);

    const tireMat = new THREE.MeshStandardMaterial({ color: 0x17191F, roughness: 0.92 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xB9C2D4, metalness: 0.92, roughness: 0.24 });

    const positions = [
      [-1.0, 0.53, 1.5, true], [1.0, 0.53, 1.5, true],
      [-1.0, 0.53, -1.52, false], [1.0, 0.53, -1.52, false]
    ];
    for (const [x, y, z, front] of positions) {
      const wheel = new THREE.Group();
      wheel.position.set(x, y, z);
      wheel.rotation.order = 'YXZ';
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      wheel.add(tire);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      wheel.add(rim);
      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        spoke.rotation.x = (s / 5) * Math.PI * 2;
        spoke.position.x = x > 0 ? 0.02 : -0.02;
        wheel.add(spoke);
      }
      this.body.add(wheel);
      this.wheels.push({ group: wheel, front, spin: 0 });
    }

    scene.add(this.group);

    // États d'animation
    this._lean = 0;
    this._pitch = 0;
    this._bob = 0;
    this._time = Math.random() * 10;
  }

  /* Réinitialise l'apparence (nouvelle course) */
  reset(pos, yaw) {
    this.group.position.copy(pos);
    this.group.rotation.set(0, yaw, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this._lean = this._pitch = this._bob = 0;
    for (const w of this.wheels) {
      w.group.rotation.set(0, 0, 0);
      w.spin = 0;
    }
    this.setBrake(false);
  }

  setBrake(on) {
    this.tailMat.emissiveIntensity = on ? 4.2 : 1.4;
  }

  /**
   * Animation continue.
   * state: { speed (m/s), steer (-1..1), drift (0..1), accel (-1..1), offTrack (bool), dt }
   */
  animate(state) {
    const { speed, steer, drift, accel, dt } = state;
    this._time += dt;
    const speedNorm = Math.min(1, Math.abs(speed) / 60);

    // Rotation des roues
    const spinDelta = (speed * dt) / 0.53;
    for (const w of this.wheels) {
      w.spin += spinDelta;
      w.group.rotation.x = w.spin;
      if (w.front) w.group.rotation.y = steer * 0.5;
    }

    // Roulis en virage + glisse
    const targetLean = -steer * speedNorm * 0.052 - drift * 0.04 * Math.sign(steer || 1);
    this._lean += (targetLean - this._lean) * Math.min(1, dt * 6);
    this.body.rotation.z = this._lean;

    // Tangage (accélération / freinage)
    const targetPitch = accel * 0.022;
    this._pitch += (targetPitch - this._pitch) * Math.min(1, dt * 5);
    this.body.rotation.x = this._pitch;

    // Micro-suspension
    this._bob += dt * (7 + speedNorm * 9);
    this.body.position.y = Math.sin(this._bob) * 0.012 * (0.35 + speedNorm);
  }
}

/** Couleurs de la grille de départ */
export const GRID_COLORS = [0x2563EB, 0xE23B48, 0xF59E0B, 0x16A34A];
export const GRID_NAMES = ['TOI', 'Vega', 'Blaze', 'Nyx'];

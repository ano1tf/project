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

    // Ombre de contact : ancre la voiture au sol
    {
      const sc = document.createElement('canvas');
      sc.width = sc.height = 128;
      const sg = sc.getContext('2d');
      const grad = sg.createRadialGradient(64, 64, 6, 64, 64, 62);
      grad.addColorStop(0, 'rgba(8,10,14,0.45)');
      grad.addColorStop(0.55, 'rgba(8,10,14,0.22)');
      grad.addColorStop(1, 'rgba(8,10,14,0)');
      sg.fillStyle = grad;
      sg.fillRect(0, 0, 128, 128);
      const sh = new THREE.Mesh(
        new THREE.PlaneGeometry(5.6, 3.1),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(sc),
          transparent: true,
          depthWrite: false
        })
      );
      sh.rotation.x = -Math.PI / 2;
      sh.position.y = 0.018;
      sh.renderOrder = 2;
      this.group.add(sh);
    }

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
    // Ailes élargies (passages de roues)
    for (const [fx, fz] of [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.52], [1.0, -1.52]]) {
      mk(new THREE.BoxGeometry(0.16, 0.3, 1.34), paint, fx, 0.76, fz);
    }
    // Bas de caisse
    mk(new THREE.BoxGeometry(0.1, 0.16, 2.7), dark, -1.02, 0.36, -0.15);
    mk(new THREE.BoxGeometry(0.1, 0.16, 2.7), dark, 1.02, 0.36, -0.15);
    // Rétroviseurs
    mk(new THREE.BoxGeometry(0.22, 0.11, 0.07), dark, -1.06, 1.34, 0.86);
    mk(new THREE.BoxGeometry(0.22, 0.11, 0.07), dark, 1.06, 1.34, 0.86);
    // Antenne
    mk(new THREE.CylinderGeometry(0.014, 0.02, 0.26, 6), dark, 0, 1.92, -0.86);
    // Flancs d'aileron
    mk(new THREE.BoxGeometry(0.03, 0.3, 0.56), dark, -0.99, 1.78, -2.18, 0.12);
    mk(new THREE.BoxGeometry(0.03, 0.3, 0.56), dark, 0.99, 1.78, -2.18, 0.12);

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

    // Halos additifs (faux bloom)
    const glowCanvas = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const glowSprite = (color, scale, x, y, z, opacity) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowCanvas,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      sp.scale.set(scale, scale, 1);
      sp.position.set(x, y, z);
      sp.renderOrder = 3;
      this.body.add(sp);
      return sp;
    };
    glowSprite(0xFFE9BE, 1.15, -0.62, 1.02, 2.4, 0.5);
    glowSprite(0xFFE9BE, 1.15, 0.62, 1.02, 2.4, 0.5);
    glowSprite(0xFF3040, 0.85, -0.66, 1.12, -2.42, 0.42);
    glowSprite(0xFF3040, 0.85, 0.66, 1.12, -2.42, 0.42);

    /* ---- Roues (groupe par roue : direction + rotation) ---- */
    this.wheels = [];
    const tireGeo = new THREE.CylinderGeometry(0.53, 0.53, 0.44, 22);
    tireGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.46, 16);
    rimGeo.rotateZ(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(0.5, 0.075, 0.1);

    const tireMat = new THREE.MeshStandardMaterial({ color: 0x17191F, roughness: 0.92 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xB9C2D4, metalness: 0.92, roughness: 0.24 });
    const discGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.05, 18);
    discGeo.rotateZ(Math.PI / 2);
    const discMat = new THREE.MeshStandardMaterial({ color: 0x2A2E36, metalness: 0.85, roughness: 0.45 });
    const caliperGeo = new THREE.BoxGeometry(0.09, 0.17, 0.1);
    const caliperMat = new THREE.MeshStandardMaterial({ color: 0xC93A2E, metalness: 0.6, roughness: 0.4 });

    const positions = [
      [-0.88, 0.53, 1.5, true], [0.88, 0.53, 1.5, true],
      [-0.88, 0.53, -1.52, false], [0.88, 0.53, -1.52, false]
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
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.x = x > 0 ? -0.04 : 0.04;
      wheel.add(disc);
      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        spoke.rotation.x = (s / 5) * Math.PI * 2;
        spoke.position.x = x > 0 ? 0.02 : -0.02;
        wheel.add(spoke);
      }
      const caliper = new THREE.Mesh(caliperGeo, caliperMat);
      caliper.position.set(x * 1.02, y + 0.13, z - 0.21);
      this.body.add(caliper);
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
      if (w.front) w.group.rotation.y = -steer * 0.5;
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

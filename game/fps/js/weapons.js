/* ============================================================
   KREO ARENA — SLOT ARMES (weapons.js)
   3 armes (pistolet, fusil d'assaut, fusil à pompe) avec
   viewmodel procédural, recul, dispersion dynamique, tir
   à plusieurs plombs, rechargement animé, traçantes, douilles.
   ============================================================ */
import * as THREE from 'three';

export const WEAPONS = [
  {
    id: 'pistol', nameKey: 'wPistol',
    damage: 26, rate: 0.26, mag: 12, reserve: 96,
    spread: 0.011, moveSpread: 0.032, auto: false,
    reloadTime: 1.15, recoil: 0.019, pellets: 1
  },
  {
    id: 'rifle', nameKey: 'wRifle',
    damage: 21, rate: 0.098, mag: 30, reserve: 180,
    spread: 0.014, moveSpread: 0.048, auto: true,
    reloadTime: 1.7, recoil: 0.012, pellets: 1
  },
  {
    id: 'shotgun', nameKey: 'wShotgun',
    damage: 13, rate: 0.82, mag: 6, reserve: 42,
    spread: 0.075, moveSpread: 0.06, auto: false,
    reloadTime: 2.25, recoil: 0.042, pellets: 9
  }
];

export class WeaponSystem {
  /**
   * @param cb { onHitEnemy(hit, isHead), onHitWorld(hit) }
   * raycast(origin, dir, maxDist) → { point, normal, enemy, part } | { point, normal } | null
   */
  constructor({ camera, scene, player, sound, fx, raycast, cb }) {
    this.camera = camera;
    this.scene = scene;
    this.player = player;
    this.sound = sound;
    this.fx = fx;
    this.raycast = raycast;
    this.cb = cb || {};

    this.index = 0;
    this.state = WEAPONS.map((w) => ({ mag: w.mag, reserve: w.reserve, reloading: 0, cooldown: 0 }));
    this._recoilKick = 0;
    this._recoilRot = 0;
    this._reloadAnim = 0;
    this._bobT = 0;
    this._sprintT = 0;

    // Groupe viewmodel attaché à la caméra
    this.vm = new THREE.Group();
    this.vm.position.set(0.3, -0.28, -0.62);
    camera.add(this.vm);
    this.models = WEAPONS.map((w, i) => this._buildModel(w.id));
    this.models.forEach((m, i) => { m.visible = i === 0; this.vm.add(m); });
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.02, -0.42);
    this.models[0].add(this.muzzle);
    this.models.forEach((m, i) => {
      const mz = new THREE.Object3D();
      mz.position.copy(i === 2 ? new THREE.Vector3(0, 0.045, -0.5) : (i === 1 ? new THREE.Vector3(0, 0.03, -0.52) : new THREE.Vector3(0, 0.02, -0.32)));
      m.add(mz);
      m.userData.muzzle = mz;
    });
    this.muzzle = this.models[0].userData.muzzle;
  }

  _buildModel(id) {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262E, roughness: 0.55, metalness: 0.72 });
    const darker = new THREE.MeshStandardMaterial({ color: 0x14161B, roughness: 0.6, metalness: 0.6 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x2FD8FF, emissive: 0x1E9FC0, emissiveIntensity: 0.7, roughness: 0.4 });
    const add = (geo, mat, x, y, z, rx) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      g.add(m);
      return m;
    };
    if (id === 'pistol') {
      add(new THREE.BoxGeometry(0.055, 0.085, 0.24), dark, 0, 0, -0.08);
      add(new THREE.CylinderGeometry(0.017, 0.017, 0.12, 10), darker, 0, 0.012, -0.24, Math.PI / 2);
      add(new THREE.BoxGeometry(0.05, 0.12, 0.06), darker, 0, -0.09, 0.02, 0.25);
      add(new THREE.BoxGeometry(0.02, 0.015, 0.05), accent, 0, 0.055, -0.16);
    } else if (id === 'rifle') {
      add(new THREE.BoxGeometry(0.062, 0.095, 0.5), dark, 0, 0, -0.16);
      add(new THREE.CylinderGeometry(0.016, 0.016, 0.26, 10), darker, 0, 0.02, -0.5, Math.PI / 2);
      add(new THREE.BoxGeometry(0.045, 0.14, 0.075), darker, 0, -0.11, -0.12, 0.12);
      add(new THREE.BoxGeometry(0.05, 0.09, 0.12), darker, 0, -0.055, 0.14);
      add(new THREE.CylinderGeometry(0.021, 0.021, 0.12, 10), darker, 0, 0.085, -0.18, Math.PI / 2);
      add(new THREE.BoxGeometry(0.02, 0.012, 0.07), accent, 0, 0.062, -0.28);
    } else {
      add(new THREE.BoxGeometry(0.075, 0.105, 0.52), dark, 0, 0, -0.18);
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 10), darker, 0, 0.032, -0.52, Math.PI / 2);
      add(new THREE.BoxGeometry(0.06, 0.055, 0.16), darker, 0, -0.062, -0.32);
      add(new THREE.BoxGeometry(0.055, 0.11, 0.08), darker, 0, -0.085, 0.1, 0.2);
      add(new THREE.BoxGeometry(0.02, 0.012, 0.06), accent, 0, 0.07, -0.3);
    }
    return g;
  }

  /* ---------- État ---------- */
  current() {
    return { def: WEAPONS[this.index], st: this.state[this.index] };
  }

  ammoState() {
    const { def, st } = this.current();
    return {
      nameKey: def.nameKey,
      mag: st.mag,
      magSize: def.mag,
      reserve: st.reserve,
      reloading: st.reloading > 0
    };
  }

  switchTo(i) {
    if (i === this.index || i < 0 || i >= WEAPONS.length) return;
    this.index = i;
    this.models.forEach((m, k) => {
      m.visible = k === i;
      if (k === i) this.muzzle = m.userData.muzzle;
    });
    const st = this.state[i];
    st.reloading = 0;
    st.cooldown = Math.max(st.cooldown, 0.25);
    this._reloadAnim = 0;
    this.sound.weaponSwitch();
  }

  switchWheel(dir) {
    const n = WEAPONS.length;
    this.switchTo((this.index + (dir > 0 ? 1 : -1) + n) % n);
  }

  /* ---------- Boucle ---------- */
  update(dt, input) {
    const { def, st } = this.current();

    st.cooldown = Math.max(0, st.cooldown - dt);

    if (st.reloading > 0) {
      st.reloading -= dt;
      this._reloadAnim = Math.min(1, this._reloadAnim + dt * 4);
      if (st.reloading <= 0) {
        const need = def.mag - st.mag;
        const take = Math.min(need, st.reserve);
        st.mag += take;
        st.reserve -= take;
        this._reloadAnim = 0;
      }
    } else {
      this._reloadAnim += (0 - this._reloadAnim) * Math.min(1, dt * 8);
    }

    if (input.reload && st.reloading <= 0 && st.mag < def.mag && st.reserve > 0) {
      st.reloading = def.reloadTime;
      this.sound.reload(def.id);
    }

    if (input.fire) {
      if (def.auto || !input._firePressed) {
        this._tryFire(input);
      }
    }
    input._firePressed = !!input.fire;

    // animation viewmodel : recul + bob + rechargement
    this._recoilKick += (0 - this._recoilKick) * Math.min(1, dt * 11);
    this._recoilRot += (0 - this._recoilRot) * Math.min(1, dt * 9);
    const hSpeed = Math.hypot(this.player.vel.x, this.player.vel.z);
    this._sprintT += ((input.sprint && hSpeed > 5 && this.player.grounded ? 1 : 0) - this._sprintT) * Math.min(1, dt * 6);
    this._bobT += dt * (3 + hSpeed * 1.1);
    const bobAmt = Math.min(1, hSpeed / 8) * 0.012 * (1 + this._sprintT * 1.6);
    this.vm.position.set(
      0.3 + Math.cos(this._bobT) * bobAmt + this._sprintT * 0.045,
      -0.28 + Math.sin(this._bobT * 2) * bobAmt - this._reloadAnim * 0.16 - this._sprintT * 0.075,
      -0.62 + this._recoilKick
    );
    this.vm.rotation.set(
      -this._recoilRot - this._reloadAnim * 0.9 - this._sprintT * 0.32,
      this._reloadAnim * 0.35 + this._sprintT * 0.28,
      -this._sprintT * 0.22
    );
  }

  _tryFire(input) {
    const { def, st } = this.current();
    if (st.reloading > 0 || st.cooldown > 0) return;
    if (st.mag <= 0) {
      st.cooldown = 0.32;
      this.sound.dryFire();
      if (st.reserve > 0) {
        st.reloading = def.reloadTime;
        this.sound.reload(def.id);
      }
      return;
    }
    st.mag--;
    st.cooldown = def.rate;

    const origin = this.player.eyePos();
    const baseDir = this.player.forwardDir();
    const moveFactor = Math.min(1, Math.hypot(this.player.vel.x, this.player.vel.z) / 8);
    const airborne = this.player.grounded ? 0 : 0.05;
    const spread = def.spread + def.moveSpread * moveFactor * moveFactor + airborne;

    for (let p = 0; p < def.pellets; p++) {
      const dir = baseDir.clone();
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();
      const hit = this.raycast(origin, dir, 220);
      const end = hit ? hit.point : origin.clone().addScaledVector(dir, 220);
      if (p === 0 || def.pellets === 1) {
        // une traçante par tir (pas par plomb)
        const mzPos = this.muzzle.getWorldPosition(new THREE.Vector3());
        this.fx.tracer(mzPos, end);
      } else if (p < 4) {
        this.fx.tracer(origin.clone().addScaledVector(dir, 0.6), end);
      }
      if (hit) {
        if (hit.enemy) {
          const isHead = hit.part === 'head';
          const dmg = def.damage * (isHead ? 2 : 1);
          hit.enemy.takeDamage(dmg, hit.point, isHead);
          this.fx.bloodHit(hit.point);
          if (this.cb.onHitEnemy) this.cb.onHitEnemy(hit, isHead);
        } else {
          this.fx.impact(hit.point, hit.normal);
          if (this.cb.onHitWorld) this.cb.onHitWorld(hit);
        }
      }
    }

    // flash, douille, recul
    const mz = this.muzzle.getWorldPosition(new THREE.Vector3());
    this.fx.muzzleFlash(mz, baseDir);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.fx.casing(mz.clone().addScaledVector(right, 0.12), right);
    this.sound.shot(def.id);

    const kickP = def.recoil * (1 + Math.random() * 0.35);
    const kickY = def.recoil * (Math.random() - 0.5) * 0.9;
    this.player.addRecoil(kickP, kickY);
    this._recoilKick = Math.min(0.09, 0.03 + def.recoil * 1.6);
    this._recoilRot = Math.min(0.35, 0.1 + def.recoil * 5);
    if (this.cb.onShot) this.cb.onShot();
  }
}

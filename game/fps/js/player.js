/* ============================================================
   KREO ARENA — SLOT JOUEUR (player.js)
   Contrôleur FPS : regard souris, déplacements (marche,
   sprint, accroupi, saut), collisions AABB avec marche sur
   marchepieds, santé / blindage, head-bob, pas.
   ============================================================ */
import * as THREE from 'three';

const GRAVITY = 22.5;
const JUMP_V = 7.6;
const WALK_SPEED = 6.2;
const SPRINT_SPEED = 9.2;
const CROUCH_SPEED = 3.3;
const ACCEL = 62;
const AIR_ACCEL = 14;
const FRICTION = 9.5;
const STAND_H = 1.8;
const CROUCH_H = 1.25;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.06;
const HALF_W = 0.36;

export class Player {
  constructor({ camera, arena, sound }) {
    this.camera = camera;
    this.arena = arena;
    this.sound = sound;

    this.pos = arena.playerSpawn.pos.clone();   // pieds
    this.vel = new THREE.Vector3();
    this.yaw = arena.playerSpawn.yaw;
    this.pitch = 0;

    this.grounded = true;
    this.crouching = false;
    this.height = STAND_H;
    this.eye = EYE_STAND;

    this.health = 100;
    this.armor = 25;
    this.alive = true;

    this._bobPhase = 0;
    this._bobAmp = 0;
    this._stepAcc = 0;
    this._wasGrounded = true;
    this._recoilPitch = 0;
    this._recoilYaw = 0;

    this.onHurt = null;   // (amount, fromPos)
    this.onFootstep = null;
    this.camera.rotation.order = 'YXZ';
  }

  /* ---------- Regard ---------- */
  addLook(dx, dy) {
    const sens = 0.0022;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    const lim = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  addRecoil(pitch, yaw) {
    this._recoilPitch += pitch;
    this._recoilYaw += yaw;
    this.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, this.pitch + pitch));
    this.yaw += yaw;
  }

  eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z);
  }

  forwardDir() {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
  }

  /* ---------- Dégâts ---------- */
  damage(n, fromPos) {
    if (!this.alive) return;
    let dmg = n;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.66);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health -= dmg;
    this.sound.playerHurt();
    if (this.onHurt) this.onHurt(n, fromPos);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
  }

  heal(n) { this.health = Math.min(100, this.health + n); }
  addArmor(n) { this.armor = Math.min(100, this.armor + n); }

  /* ---------- Collisions ---------- */
  _boxAt(pos, h) {
    return new THREE.Box3(
      new THREE.Vector3(pos.x - HALF_W, pos.y, pos.z - HALF_W),
      new THREE.Vector3(pos.x + HALF_W, pos.y + h, pos.z + HALF_W)
    );
  }

  _collides(pos, h, footLift) {
    const lift = footLift || 0;
    const box = new THREE.Box3(
      new THREE.Vector3(pos.x - HALF_W, pos.y + lift, pos.z - HALF_W),
      new THREE.Vector3(pos.x + HALF_W, pos.y + h, pos.z + HALF_W)
    );
    for (const c of this.arena.colliders) {
      if (box.intersectsBox(c)) return c;
    }
    return null;
  }

  /* ---------- Mise à jour ---------- */
  update(dt, input) {
    if (!this.alive) {
      // caméra qui s'effondre
      this.eye += (0.35 - this.eye) * Math.min(1, dt * 6);
      this._applyCamera(dt, true);
      return;
    }

    const wantCrouch = !!input.crouch;
    const h = wantCrouch ? CROUCH_H : STAND_H;
    // debout : vérifier qu'on peut se relever
    if (this.crouching && !wantCrouch) {
      const testPos = this.pos.clone();
      if (!this._collides(testPos, STAND_H)) this.crouching = false;
    } else {
      this.crouching = wantCrouch;
    }
    const targetH = this.crouching ? CROUCH_H : STAND_H;
    this.height += (targetH - this.height) * Math.min(1, dt * 12);
    const targetEye = this.crouching ? EYE_CROUCH : EYE_STAND;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 12);

    // Mouvement souhaité (repère monde, lacet)
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wishX = 0, wishZ = 0;
    if (input.forward) { wishX -= sin; wishZ -= cos; }
    if (input.back) { wishX += sin; wishZ += cos; }
    if (input.left) { wishX -= cos; wishZ += sin; }
    if (input.right) { wishX += cos; wishZ -= sin; }
    const wl = Math.hypot(wishX, wishZ);
    if (wl > 0) { wishX /= wl; wishZ /= wl; }

    const maxSpeed = this.crouching ? CROUCH_SPEED : (input.sprint && input.forward ? SPRINT_SPEED : WALK_SPEED);
    const accel = this.grounded ? ACCEL : AIR_ACCEL;

    // friction
    if (this.grounded) {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > 0.01) {
        const drop = Math.max(sp, 2.5) * FRICTION * dt;
        const k = Math.max(0, sp - drop) / sp;
        this.vel.x *= k;
        this.vel.z *= k;
      }
    }
    // accélération vers la vitesse souhaitée
    const curWish = this.vel.x * wishX + this.vel.z * wishZ;
    const add = maxSpeed - curWish;
    if (add > 0) {
      const a = Math.min(accel * dt * maxSpeed, add);
      this.vel.x += wishX * a;
      this.vel.z += wishZ * a;
    }

    // saut
    if (input.jump && this.grounded) {
      this.vel.y = JUMP_V;
      this.grounded = false;
      this.sound.jump();
    }

    // gravité
    this.vel.y -= GRAVITY * dt;

    // --- intégration avec collisions, axe par axe ---
    const stepH = 0.55;

    // X
    const dx = this.vel.x * dt;
    if (dx !== 0) {
      const next = this.pos.clone();
      next.x += dx;
      if (this._collides(next, this.height, 0.14)) {
        // marchepied ?
        const up = next.clone();
        up.y += stepH;
        if (this.grounded && !this._collides(up, this.height, 0.14) && this._groundOk(up)) {
          this.pos.copy(up);
          this.pos.x += dx;
        } else {
          this.vel.x = 0;
        }
      } else {
        this.pos.x += dx;
      }
    }

    // Z
    const dz = this.vel.z * dt;
    if (dz !== 0) {
      const next = this.pos.clone();
      next.z += dz;
      if (this._collides(next, this.height, 0.14)) {
        const up = next.clone();
        up.y += stepH;
        if (this.grounded && !this._collides(up, this.height, 0.14) && this._groundOk(up)) {
          this.pos.copy(up);
          this.pos.z += dz;
        } else {
          this.vel.z = 0;
        }
      } else {
        this.pos.z += dz;
      }
    }

    // Y
    const dy = this.vel.y * dt;
    this.pos.y += dy;
    const groundY = this.arena.groundHeightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= groundY) {
      if (!this._wasGrounded && this.vel.y < -6) this.sound.land();
      this.pos.y = groundY;
      this.vel.y = 0;
      this.grounded = true;
      this._wasGrounded = true;
    } else {
      this.grounded = false;
      this._wasGrounded = false;
    }
    // plafond : si collision bloc en hauteur, annuler la montée
    if (this.vel.y > 0 && this._collides(this.pos, this.height)) {
      this.vel.y = 0;
    }

    // limites de l'arène
    this.pos.x = Math.max(-43.5, Math.min(43.5, this.pos.x));
    this.pos.z = Math.max(-43.5, Math.min(43.5, this.pos.z));

    // --- head-bob + pas ---
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && hSpeed > 1.2) {
      this._bobPhase += dt * hSpeed * 1.35;
      this._bobAmp += (Math.min(1, hSpeed / SPRINT_SPEED) * 0.05 - this._bobAmp) * Math.min(1, dt * 8);
      this._stepAcc += hSpeed * dt;
      const stepLen = input.sprint ? 2.7 : 2.15;
      if (this._stepAcc > stepLen) {
        this._stepAcc = 0;
        this.sound.footstep(Math.min(1, hSpeed / SPRINT_SPEED));
      }
    } else {
      this._bobAmp += (0 - this._bobAmp) * Math.min(1, dt * 6);
    }

    this._applyCamera(dt, false);
  }

  _groundOk(pos) {
    // le marchepied ne doit pas nous faire monter au-dessus du sol local
    return pos.y <= this.arena.groundHeightAt(pos.x, pos.z) + 0.6;
  }

  _applyCamera(dt, dead) {
    const bobY = Math.sin(this._bobPhase * 2) * this._bobAmp;
    const bobX = Math.cos(this._bobPhase) * this._bobAmp * 0.7;
    this.camera.position.set(this.pos.x + bobX * Math.cos(this.yaw), this.pos.y + this.eye + bobY, this.pos.z - bobX * Math.sin(this.yaw));
    if (dead) {
      this.camera.rotation.set(-Math.PI / 2 + 0.35, this.yaw, 0.25);
    } else {
      this.camera.rotation.set(this.pitch, this.yaw, bobX * 0.35);
    }
    const targetFov = 76 + Math.min(1, Math.hypot(this.vel.x, this.vel.z) / SPRINT_SPEED) * 7;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
    this.camera.updateProjectionMatrix();
  }
}

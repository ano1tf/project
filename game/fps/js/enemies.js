/* ============================================================
   KREO ARENA — SLOT ENNEMIS (enemies.js)
   Robots assaillants : 3 types (grondeur mêlée, tireur à
   projectiles, brute blindée). Déplacements avec évitement
   d'obstacles (segments vs AABB), lignes de vue, télégraphe
   d'attaque, morts animées, projectiles ennemis.
   ============================================================ */
import * as THREE from 'three';

const TYPES = {
  grunt: {
    hp: 65, speed: 5.4, scale: 1,
    melee: { range: 2.4, dmg: 12, cd: 1.1 },
    ranged: null,
    accent: 0xFF4D4D, score: 100
  },
  shooter: {
    hp: 85, speed: 4.3, scale: 1,
    melee: { range: 2.0, dmg: 8, cd: 1.3 },
    ranged: { range: 36, dmg: 11, cd: 2.1, telegraph: 0.42, speed: 27 },
    accent: 0xFFA23C, score: 150
  },
  brute: {
    hp: 240, speed: 3.4, scale: 1.32,
    melee: { range: 2.9, dmg: 26, cd: 1.5 },
    ranged: null,
    accent: 0xB45CFF, score: 250
  }
};

/* Intersection segment / AABB (méthode des plans) */
function segBox(p0, p1, box) {
  const d = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z };
  let tmin = 0, tmax = 1;
  for (const ax of ['x', 'y', 'z']) {
    const inv = 1 / (d[ax] || 1e-9);
    let t1 = (box.min[ax] - p0[ax]) * inv;
    let t2 = (box.max[ax] - p0[ax]) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

class Enemy {
  constructor(type, pos, scene) {
    this.type = type;
    this.def = TYPES[type];
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.pos = pos.clone();
    this.dead = false;
    this.deadT = 0;
    this.attackCd = 0;
    this.telegraphT = -1;
    this.hurtFlash = 0;
    this.phase = Math.random() * 10;
    this.onDeath = null;
    this._deathHandled = false;

    const s = this.def.scale;
    const body = new THREE.MeshStandardMaterial({ color: 0x2C313B, roughness: 0.55, metalness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x171A20, roughness: 0.6, metalness: 0.6 });
    this.visorMat = new THREE.MeshStandardMaterial({
      color: this.def.accent,
      emissive: this.def.accent,
      emissiveIntensity: 1.6,
      roughness: 0.35
    });

    this.group = new THREE.Group();
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x * s, y * s, z * s);
      m.scale.setScalar(s);
      m.castShadow = true;
      this.group.add(m);
      return m;
    };

    this.legL = add(new THREE.BoxGeometry(0.22, 0.85, 0.26), dark, -0.22, 0.425, 0);
    this.legR = add(new THREE.BoxGeometry(0.22, 0.85, 0.26), dark, 0.22, 0.425, 0);
    this.torso = add(new THREE.BoxGeometry(0.72, 0.78, 0.42), body, 0, 1.28, 0);
    const stripe = add(new THREE.BoxGeometry(0.74, 0.1, 0.44), this.visorMat, 0, 1.42, 0);
    this.head = add(new THREE.BoxGeometry(0.42, 0.34, 0.38), dark, 0, 1.88, 0);
    this.visor = add(new THREE.BoxGeometry(0.34, 0.1, 0.05), this.visorMat, 0, 1.9, -0.2);
    this.armL = add(new THREE.BoxGeometry(0.16, 0.68, 0.2), dark, -0.5, 1.32, 0);
    this.armR = add(new THREE.BoxGeometry(0.16, 0.68, 0.2), dark, 0.5, 1.32, 0);

    if (type === 'brute') {
      add(new THREE.BoxGeometry(0.95, 0.3, 0.55), body, 0, 1.72, 0);
      const shL = add(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8), dark, -0.58, 1.3, 0);
      const shR = add(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8), dark, 0.58, 1.3, 0);
      shL.rotation.x = Math.PI / 2;
      shR.rotation.x = Math.PI / 2;
    }
    if (type === 'shooter') {
      add(new THREE.BoxGeometry(0.12, 0.12, 0.7), dark, 0.5, 1.32, -0.35);
      add(new THREE.BoxGeometry(0.2, 0.16, 0.16), this.visorMat, 0.5, 1.32, -0.72);
    }

    // cibles de tir (mesh → partie)
    this.hitMeshes = [
      { mesh: this.head, part: 'head' },
      { mesh: this.visor, part: 'head' },
      { mesh: this.torso, part: 'body' },
      { mesh: this.legL, part: 'body' },
      { mesh: this.legR, part: 'body' },
      { mesh: this.armL, part: 'body' },
      { mesh: this.armR, part: 'body' }
    ];
    scene.add(this.group);
  }

  takeDamage(dmg, point, isHead) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hurtFlash = 1;
    if (this.hp <= 0) {
      this.dead = true;
      if (this.onDeath) this.onDeath();
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}

export class EnemyManager {
  constructor({ scene, arena, player, sound, fx, callbacks }) {
    this.scene = scene;
    this.arena = arena;
    this.player = player;
    this.sound = sound;
    this.fx = fx;
    this.cb = callbacks || {};
    this.enemies = [];
    this.projectiles = [];
    this._projGeo = new THREE.SphereGeometry(0.17, 10, 10);
    this._projMat = new THREE.MeshBasicMaterial({ color: 0xFF7A3C });
    this._projMatHead = new THREE.MeshBasicMaterial({ color: 0xFFD27A });
  }

  /* ---------- Vague ---------- */
  spawnWave(n) {
    const budget = 4 + n * 2;
    const types = [];
    for (let i = 0; i < budget; i++) {
      if (n >= 4 && i % 5 === 4) types.push('brute');
      else if (n >= 2 && i % 3 === 2) types.push('shooter');
      else types.push('grunt');
    }
    const spots = this.arena.spawnPoints.slice();
    const taken = [];
    for (const type of types) {
      // spot loin du joueur mais pas déjà pris
      let best = spots[0], bestScore = -Infinity;
      for (const s of spots) {
        const d = s.distanceToSquared(this.player.pos);
        let sep = 0;
        for (const t of taken) sep = Math.max(sep, t.distanceToSquared(s));
        const score = d + Math.min(sep, 2500) * 1.4;
        if (score > bestScore) { bestScore = score; best = s; }
      }
      taken.push(best.clone());
      const pos = best.clone();
      pos.x += (Math.random() - 0.5) * 4;
      pos.z += (Math.random() - 0.5) * 4;
      const en = new Enemy(type, pos, this.scene);
      en.onDeath = () => this.killEnemy(en);
      this.enemies.push(en);
      this.fx.explosion(pos.clone().setY(1), true);
    }
  }

  clear() {
    for (const e of this.enemies) e.dispose(this.scene);
    this.enemies = [];
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
  }

  aliveCount() {
    return this.enemies.filter((e) => !e.dead).length;
  }

  hitTargets() {
    const list = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      for (const h of e.hitMeshes) {
        list.push({ mesh: h.mesh, enemy: e, part: h.part });
      }
    }
    return list;
  }

  /* ---------- Lignes de vue ---------- */
  _losClear(from, to) {
    for (const c of this.arena.colliders) {
      if (segBox(from, to, c)) return false;
    }
    return true;
  }

  _blocked(from, to) {
    for (const c of this.arena.colliders) {
      if (segBox(from, to, c)) return true;
    }
    return false;
  }

  /* ---------- Boucle ---------- */
  update(dt) {
    const player = this.player;
    const pPos = player.pos;
    const eye = player.eyePos();

    for (const e of this.enemies) {
      if (e.dead) {
        e.deadT += dt;
        // chute
        e.group.rotation.x = Math.min(Math.PI / 2, e.group.rotation.x + dt * 3.4);
        if (e.deadT > 1.6) {
          e.group.position.y -= dt * 0.9;
        }
        continue;
      }

      e.attackCd = Math.max(0, e.attackCd - dt);
      e.hurtFlash = Math.max(0, e.hurtFlash - dt * 4);
      e.visorMat.emissiveIntensity = 1.6 + e.hurtFlash * 4 + (e.telegraphT > 0 ? 2.2 : 0);

      const toPlayer = new THREE.Vector3().subVectors(pPos, e.pos);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      const dir = dist > 0.01 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, 1);

      // orientation
      const targetYaw = Math.atan2(dir.x, dir.z);
      let dy = targetYaw - e.group.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      e.group.rotation.y += dy * Math.min(1, dt * 6);

      const def = e.def;
      const canSee = this._losClear(e.pos.clone().setY(1.5), eye);

      // --- télégraphe + tir à distance ---
      if (def.ranged && canSee && dist < def.ranged.range && dist > 5) {
        if (e.telegraphT > 0) {
          e.telegraphT -= dt;
          if (e.telegraphT <= 0) {
            this._fireProjectile(e, eye);
            e.attackCd = def.ranged.cd * (0.85 + Math.random() * 0.4);
          }
        } else if (e.attackCd <= 0) {
          e.telegraphT = def.ranged.telegraph;
        }
      }

      // --- mêlée ---
      if (def.melee && dist < def.melee.range && e.attackCd <= 0 && e.telegraphT <= 0) {
        e.attackCd = def.melee.cd;
        if (this.cb.damagePlayer) this.cb.damagePlayer(def.melee.dmg, e.pos);
        this.sound.enemyShot();
      }

      // --- déplacement : avancer si trop loin / si mêlée ---
      const wantClose = def.melee ? dist > def.melee.range * 0.85 : dist > 14;
      if (wantClose && !(def.ranged && canSee && dist < 22 && dist > 9)) {
        const speed = def.speed * (1 + Math.sin(e.phase + performance.now() * 0.001) * 0.08);
        // si le joueur est en hauteur, viser la rampe la plus proche
        const moveDir = dir.clone();
        const pGround = this.arena.groundHeightAt(pPos.x, pPos.z);
        const eGround = this.arena.groundHeightAt(e.pos.x, e.pos.z);
        if (pGround - eGround > 1.2 && this.arena.climbAccess) {
          let bestA = null, bestAD = Infinity;
          for (const a of this.arena.climbAccess) {
            const dd = (e.pos.x - a.x) * (e.pos.x - a.x) + (e.pos.z - a.z) * (e.pos.z - a.z);
            if (dd < bestAD) { bestAD = dd; bestA = a; }
          }
          if (bestA) {
            moveDir.set(bestA.x - e.pos.x, 0, bestA.z - e.pos.z);
            if (moveDir.lengthSq() > 0.001) moveDir.normalize();
          }
        }
        // évitement : 3 sondes
        const probeLen = 3.2;
        const base = e.pos.clone().setY(0.5);
        const opts = [0, 0.7, -0.7].map((a) => {
          const d = moveDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
          return { d, clear: !this._blocked(base, base.clone().addScaledVector(d, probeLen)) };
        });
        const chosen = opts.find((o) => o.clear) || opts[0];

        // séparation entre ennemis
        const sep = new THREE.Vector3();
        for (const other of this.enemies) {
          if (other === e || other.dead) continue;
          const dx = e.pos.x - other.pos.x, dz = e.pos.z - other.pos.z;
          const dd = Math.hypot(dx, dz);
          if (dd < 1.9 && dd > 0.01) {
            sep.x += (dx / dd) * (1.9 - dd);
            sep.z += (dz / dd) * (1.9 - dd);
          }
        }

        const step = chosen.d.clone().multiplyScalar(speed * dt);
        step.addScaledVector(sep, dt * 6);
        const nx = e.pos.x + step.x;
        const nz = e.pos.z + step.z;
        // ne pas traverser les murs : tester le point final
        const feet = new THREE.Vector3(nx, e.pos.y + 0.2, nz);
        if (!this._blocked(e.pos.clone().setY(0.5), feet)) {
          e.pos.x = nx;
          e.pos.z = nz;
        } else if (!this._blocked(e.pos.clone().setY(0.5), new THREE.Vector3(e.pos.x + step.x, e.pos.y + 0.2, e.pos.z))) {
          e.pos.x += step.x;
        } else {
          e.pos.z += step.z;
        }
      }

      // hauteur du sol
      const gy = this.arena.groundHeightAt(e.pos.x, e.pos.z);
      e.pos.y += (gy - e.pos.y) * Math.min(1, dt * 9);
      e.group.position.copy(e.pos);

      // pas (animation jambes)
      const moving = wantClose ? 1 : 0;
      const walk = Math.sin(performance.now() * 0.008 * def.speed + e.phase) * 0.5 * moving;
      e.legL.rotation.x = walk;
      e.legR.rotation.x = -walk;
      e.armL.rotation.x = -walk * 0.7;
      e.armR.rotation.x = walk * 0.7;
    }

    // nettoyage des morts depuis longtemps
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead && e.deadT > 3) {
        e.dispose(this.scene);
        this.enemies.splice(i, 1);
      }
    }

    this._updateProjectiles(dt);
  }

  /* ---------- Projectiles ennemis ---------- */
  _fireProjectile(e, target) {
    const from = e.pos.clone().setY(1.5 * e.def.scale);
    const dir = new THREE.Vector3().subVectors(target, from).normalize();
    // imprécision
    dir.x += (Math.random() - 0.5) * 0.06;
    dir.y += (Math.random() - 0.5) * 0.03;
    dir.z += (Math.random() - 0.5) * 0.06;
    dir.normalize();
    const mesh = new THREE.Mesh(this._projGeo, this._projMat);
    mesh.position.copy(from).addScaledVector(dir, 0.9);
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      vel: dir.multiplyScalar(e.def.ranged.speed),
      dmg: e.def.ranged.dmg,
      life: 5
    });
    this.sound.projectile();
  }

  _updateProjectiles(dt) {
    const pCenter = this.player.pos.clone().setY(this.player.pos.y + 1.1);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      const prev = p.mesh.position.clone();
      p.mesh.position.addScaledVector(p.vel, dt);
      const cur = p.mesh.position;

      let exploded = false;
      // joueur ?
      if (this.player.alive && cur.distanceTo(pCenter) < 1.05) {
        if (this.cb.damagePlayer) this.cb.damagePlayer(p.dmg, prev);
        exploded = true;
      }
      // décor ?
      if (!exploded) {
        for (const c of this.arena.colliders) {
          if (segBox(prev, cur, c)) { exploded = true; break; }
        }
      }
      if (cur.y < 0.05) exploded = true;

      if (exploded || p.life <= 0) {
        if (exploded) {
          this.fx.explosion(cur.clone(), true);
          this.sound.explosion();
        }
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  /* ---------- Dégâts sur ennemi + mort ---------- */
  killEnemy(e) {
    if (e._deathHandled) return;
    e._deathHandled = true;
    e.dead = true;
    e.deadT = 0;
    this.fx.explosion(e.pos.clone().setY(1.2 * e.def.scale), true);
    this.sound.enemyDeath();
    if (this.cb.onKill) this.cb.onKill(e.type, e.def.score);
  }
}

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
  constructor({ camera, scene, player, sound, fx, raycast, cb, juice, post }) {
    this.camera = camera;
    this.scene = scene;
    this.player = player;
    this.sound = sound;
    this.fx = fx;
    this.raycast = raycast;
    this.cb = cb || {};
    this.juice = juice || null;
    this.post = post || null;

    this.index = 0;
    this.state = WEAPONS.map((w) => ({ mag: w.mag, reserve: w.reserve, reloading: 0, cooldown: 0 }));
    this._recoilKick = 0;
    this._recoilRot = 0;
    this._reloadAnim = 0;
    this._bobT = 0;
    this._sprintT = 0;
    this._adsT = 0;

    // Groupe viewmodel. Ses coordonnées sont locales à la caméra (c'est une
    // pose de viewmodel), mais il vit dans la scène du calque : la caméra du
    // calque reprend la pose de la caméra du jeu à chaque image. Sans cette
    // séparation, l'arme serait aussi rendue par le monde et apparaîtrait
    // noire, éclairée par la seule nuit de l'arène.
    // Position calée pour un FOV de 58°
    // (rendu en calque dédié) : plus près et plus à droite sinon l'arme sort
    // de l'écran sur les bords.
    this.vm = new THREE.Group();
    this.vm.position.set(0.175, -0.175, -0.62);
    this.vm.scale.setScalar(1.0);
    this.models = WEAPONS.map((w, i) => this._buildModel(w.id));
    this.arms = this._buildArms();
    // léger dévers vers l'extérieur : sans lui l'arme converge vers le point
    // de fuite et paraît tordue à l'écran
    this.models.forEach((m, i) => { m.visible = i === 0; // Dévers + léger pivot : c'est ce qui donne la vision « trois-quarts » d'un
    // viewmodel AAA (on voit le flanc gauche de l'arme, le canon file vers le
    // point de visée) au lieu d'un canon vu en bout.
    m.rotation.set(-0.02, -0.15, -0.06); this.vm.add(m); });
    this.vm.add(this.arms);
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
    // Le viewmodel est enfant de la caméra du jeu : sans ça, il serait AUSSI
    // rendu par la passe principale (noir, éclairé par la nuit) en plus du
    // calque dédié. Le calque 1 le retire du rendu du monde ; la caméra dédiée
    // de post.js n'allume que ce calque.
}

  _buildModel(id) {
    const g = new THREE.Group();
    // Le viewmodel est rendu dans une scène dédiée : sans environnement, un
    // métal à 0,7 se contente des lumières et vire au noir. On garde donc des
    // valeurs basses (roche/plastique) et on ajoute une doublure de couleur
    // claire sur les arêtes pour lire la silhouette même à contre-jour.
    // Micro-grain de surface : sans lui, une boîte éclairée donne une face
    // uniforme et « en plastique ». Deux cartes de rugosité suffisent à faire
    // lire du métal brossé et du polymère.
    if (!WeaponSystem._grain) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g2 = c.getContext('2d');
      const img = g2.createImageData(64, 64);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 90 + Math.random() * 110;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g2.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 3);
      WeaponSystem._grain = t;
    }
    const grain = WeaponSystem._grain;
    // Matériaux de viewmodel : une part d'auto-éclairage (emissive = albédo)
    // garantit qu'aucune face ne tombe dans le noir quel que soit l'angle de
    // l'arme dans le cadre — c'est ce qui se fait sur les armes de FPS, où
    // l'éclairage du décor ne doit jamais décider de la lisibilité.
    WeaponSystem._mat = WeaponSystem._mat || ((color, rough, metal, glow) => {
      const c = new THREE.Color(color);
      return new THREE.MeshStandardMaterial({
        color: c, roughness: rough, metalness: metal,
        roughnessMap: grain, emissive: c, emissiveIntensity: glow
      });
    });
    const mat = WeaponSystem._mat;
    const dark = mat(0x6E747D, 0.5, 0.45, 0.42);      // acier clair (culasse)
    const darker = mat(0x282C33, 0.66, 0.35, 0.5);    // polymère sombre
    const grip = mat(0x1C1F25, 0.95, 0.0, 0.55);
    const accent = new THREE.MeshStandardMaterial({ color: 0x2FD8FF, emissive: 0x1E9FC0, emissiveIntensity: 0.85, roughness: 0.4 });
    const add = (geo, mat, x, y, z, rx) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      g.add(m);
      return m;
    };
    if (id === 'pistol') {
      // carcasse (couleur claire : c'est elle qu'on voit de côté)
      add(new THREE.BoxGeometry(0.040, 0.050, 0.215), darker, 0, -0.004, -0.085);
      // culasse : plus large, chanfreinée par deux boîtes décalées
      add(new THREE.BoxGeometry(0.046, 0.032, 0.230), dark, 0, 0.030, -0.090);
      add(new THREE.BoxGeometry(0.042, 0.014, 0.226), darker, 0, 0.048, -0.090);
      // guidon + hausse
      add(new THREE.BoxGeometry(0.010, 0.012, 0.010), accent, 0, 0.058, -0.196);
      add(new THREE.BoxGeometry(0.030, 0.009, 0.012), darker, 0, 0.058, 0.012);
      // pontet
      const guard = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0055, 8, 14, Math.PI * 1.5), darker);
      guard.position.set(0, -0.030, -0.048);
      guard.rotation.set(Math.PI / 2, 0, -Math.PI * 0.75);
      g.add(guard);
      // détente
      add(new THREE.BoxGeometry(0.007, 0.022, 0.009), grip, 0, -0.034, -0.040);
      // poignée inclinée, avec un panneau de préhension
      add(new THREE.BoxGeometry(0.044, 0.115, 0.058), grip, 0, -0.078, 0.014, 0.28);
      add(new THREE.BoxGeometry(0.030, 0.085, 0.020), darker, 0, -0.074, 0.046, 0.28);
      // chargeur qui dépasse sous la carcasse
      add(new THREE.BoxGeometry(0.030, 0.030, 0.036), darker, 0, -0.030, -0.016);
      // canon
      add(new THREE.CylinderGeometry(0.0145, 0.0145, 0.055, 12), darker, 0, 0.010, -0.212, Math.PI / 2);
      // rail supérieur + marquage lumineux
      add(new THREE.BoxGeometry(0.022, 0.006, 0.150), darker, 0, 0.047, -0.100);
    } else if (id === 'rifle') {
      add(new THREE.BoxGeometry(0.055, 0.085, 0.44), dark, 0, 0, -0.16);
      add(new THREE.CylinderGeometry(0.016, 0.016, 0.26, 10), darker, 0, 0.02, -0.5, Math.PI / 2);
      add(new THREE.BoxGeometry(0.045, 0.14, 0.075), grip, 0, -0.11, -0.12, 0.12);
      add(new THREE.BoxGeometry(0.05, 0.09, 0.11), darker, 0, -0.055, 0.075);
      add(new THREE.CylinderGeometry(0.021, 0.021, 0.12, 10), darker, 0, 0.085, -0.18, Math.PI / 2);
      add(new THREE.BoxGeometry(0.02, 0.012, 0.07), accent, 0, 0.062, -0.28);
      // chargeur courbe + poignée pistolet + crosse
      add(new THREE.BoxGeometry(0.040, 0.100, 0.062), grip, 0, -0.145, -0.055, 0.18);
      add(new THREE.BoxGeometry(0.042, 0.115, 0.055), grip, 0, -0.105, 0.030, 0.34);
      add(new THREE.BoxGeometry(0.050, 0.075, 0.120), darker, 0, -0.010, 0.130);
    } else {
      add(new THREE.BoxGeometry(0.075, 0.105, 0.52), dark, 0, 0, -0.18);
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 10), darker, 0, 0.032, -0.52, Math.PI / 2);
      add(new THREE.BoxGeometry(0.06, 0.055, 0.16), darker, 0, -0.062, -0.32);
      add(new THREE.BoxGeometry(0.055, 0.11, 0.08), grip, 0, -0.085, 0.065, 0.2);
      add(new THREE.BoxGeometry(0.02, 0.012, 0.06), accent, 0, 0.07, -0.3);
    }
    return g;
  }

  /** Segment de membre orienté de a vers b (vecteurs locaux au viewmodel). */
  _limb(a, b, r1, r2, mat) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 12), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return m;
  }

  /**
   * Bras + mains. La manche sort du cadre par le bas-droite (c'est le
   * cadrage classique : on ne voit que l'avant-bras et le dos de la main).
   */
  _buildArms() {
    const mat = WeaponSystem._mat;
    const sleeve = mat(0x2A3648, 0.95, 0.0, 0.45);
    const cuff = mat(0x18202B, 0.95, 0.0, 0.5);
    const glove = mat(0x22262D, 0.9, 0.02, 0.5);
    const skin = mat(0x8A6449, 0.78, 0.0, 0.4);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const g = new THREE.Group();

    // --- main droite sur la poignée, poignet vers le bas-droite du cadre ---
    const wrist = V(0.052, -0.130, 0.01);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.09, 0.078), glove);
    hand.position.set(0.008, -0.088, -0.005);
    hand.rotation.set(0.22, 0.05, -0.06);
    g.add(hand);
    // pouce par-dessus la poignée
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.055, 0.028), glove);
    thumb.position.set(-0.018, -0.055, -0.045);
    thumb.rotation.set(0.4, 0, 0.35);
    g.add(thumb);
    // index le long du pontet
    const index = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.05, 0.022), skin);
    index.position.set(-0.006, -0.048, -0.062);
    index.rotation.set(0.8, 0, 0.1);
    g.add(index);
    g.add(this._limb(wrist, V(0.115, -0.62, 0.03), 0.045, 0.058, sleeve));
    // revers de manche
    const cuffMesh = this._limb(V(0.048, -0.150, 0.018), V(0.070, -0.215, 0.020), 0.048, 0.052, cuff);
    g.add(cuffMesh);
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
    const adsGoal = (input.ads && st.reloading <= 0 && this._sprintT < 0.4) ? 1 : 0;
    this._adsT += (adsGoal - this._adsT) * Math.min(1, dt * 8);

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
    const bobAmt = Math.min(1, hSpeed / 8) * 0.012 * (1 + this._sprintT * 1.6) * (1 - this._adsT * 0.8);
    const adsX = 0.20 * (1 - this._adsT);
    const adsY = -0.062 + (-0.19 + 0.062) * (1 - this._adsT);
    const adsZ = -0.44 + (-0.55 + 0.44) * (1 - this._adsT);
    this.vm.position.set(
      adsX + Math.cos(this._bobT) * bobAmt + this._sprintT * 0.045,
      adsY + Math.sin(this._bobT * 2) * bobAmt - this._reloadAnim * 0.16 - this._sprintT * 0.075,
      adsZ + this._recoilKick
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
    const spread = (def.spread + def.moveSpread * moveFactor * moveFactor + airborne) * (this._adsT > 0.6 ? 0.55 : 1);

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
        const mzPos = origin.clone()
          .addScaledVector(baseDir, 0.5)
          .addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion), 0.12);
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
          this.sound.impact();
          if (this.juice) this.juice.shake(0.006);
          if (this.cb.onHitWorld) this.cb.onHitWorld(hit);
        }
      }
    }

    // flash, douille, recul
    // Le viewmodel vit désormais dans une scène séparée : la position de
    // bouche se calcule depuis la caméra (toujours juste, quel que soit le FOV).
    const mz = this.player.eyePos()
      .addScaledVector(this.player.forwardDir(), 0.42)
      .addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion), 0.1)
      .add(new THREE.Vector3(0, -0.06, 0));
    this.fx.muzzleFlash(mz, baseDir);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.fx.casing(mz.clone().addScaledVector(right, 0.12), right);
    this.sound.shot(def.id);

    const kickP = def.recoil * (1 + Math.random() * 0.35);
    const kickY = def.recoil * (Math.random() - 0.5) * 0.9;
    this.player.addRecoil(kickP, kickY);
    this._recoilKick = Math.min(0.09, 0.03 + def.recoil * 1.6);
    this._recoilRot = Math.min(0.35, 0.1 + def.recoil * 5);
    if (this.post) this.post.shake(0.006);
    if (this.cb.onShot) this.cb.onShot(def);
  }
}

/* ============================================================
   KREO ARENA — SLOT MAPPING (arena.js)
   Arène FPS : sol, mur d'enceinte, plateforme centrale + rampes,
   caisses, piliers, tours, feux. Collisions AABB, spawns,
   emplacements de ravitaillement, ciel procédural, éclairage.
   ============================================================ */
import * as THREE from 'three';

function noiseCanvas(size, base, speck, speckAmt) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * speckAmt; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    g.fillStyle = Math.random() > 0.5 ? speck : 'rgba(0,0,0,0.09)';
    const s = Math.random() * 2.6 + 0.6;
    g.fillRect(x, y, s, s);
  }
  return c;
}

function floorCanvas() {
  const c = noiseCanvas(256, '#2A2D34', '#22252B', 0.5);
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(120,130,148,0.16)';
  g.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  return c;
}

function wallCanvas() {
  const c = noiseCanvas(256, '#333842', '#2B2F38', 0.42);
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(140,150,170,0.14)';
  g.lineWidth = 4;
  for (let y = 0; y <= 256; y += 128) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
  }
  return c;
}

function crateCanvas() {
  const c = noiseCanvas(128, '#4A4436', '#3B362B', 0.45);
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(30,28,22,0.55)';
  g.lineWidth = 7;
  g.strokeRect(4, 4, 120, 120);
  g.strokeRect(18, 18, 92, 92);
  return c;
}

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];   // THREE.Box3
    this.solids = [];      // meshes pour raycast
    this.fires = [];       // { light, mesh } animés
    this.spawnPoints = [];
    this.pickupSpots = [];
    this.playerSpawn = { pos: new THREE.Vector3(0, 0, 30), yaw: Math.PI };
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  build() {
    this._buildSky();
    this._buildLights();
    this._buildGround();
    this._buildWalls();
    this._buildPlatform();
    this._buildCover();
    this._buildTowers();
    this._buildFires();
    this._buildSpawns();
    return this;
  }

  /* ---------- Ciel procédural + environnement ---------- */
  _buildSky() {
    this._fallbackSky = true;
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#141A2E');
    grad.addColorStop(0.42, '#2A3A5C');
    grad.addColorStop(0.52, '#4A5B7E');
    grad.addColorStop(0.56, '#3A4258');
    grad.addColorStop(1, '#20242E');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 512);
    // lune
    const moon = g.createRadialGradient(720, 120, 4, 720, 120, 110);
    moon.addColorStop(0, 'rgba(220,230,255,0.95)');
    moon.addColorStop(0.12, 'rgba(190,205,245,0.5)');
    moon.addColorStop(1, 'rgba(190,205,245,0)');
    g.fillStyle = moon;
    g.fillRect(610, 10, 220, 220);
    // étoiles
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * 1024, y = Math.random() * 200;
      g.fillStyle = 'rgba(255,255,255,' + (0.15 + Math.random() * 0.5) + ')';
      g.fillRect(x, y, 1.6, 1.6);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = tex;
    const renderer = this.scene.userData.renderer;
    if (renderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      this.scene.environment = pmrem.fromEquirectangular(tex).texture;
    }
  }

  /* ---------- Environnement HDR (IBL) ---------- */
  applyEnvironment(env) {
    this.env = env;
    // le ciel HDR remplace le ciel dessiné à la main
    this.scene.background = env.texture;
    this.scene.backgroundIntensity = 1.0;
    this.scene.environment = env.envMap;
    this.scene.environmentIntensity = 0.9;
    // brouillard accordé au ciel
    if (this.scene.fog) this.scene.fog.color.setHex(0x2A3348);
  }

  /* ---------- Lumières ---------- */
  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x8FA8D8, 0x2A2E38, 0.75));
    const moon = new THREE.DirectionalLight(0xBFD2FF, 1.6);
    moon.position.set(60, 90, -40);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -55;
    moon.shadow.camera.right = 55;
    moon.shadow.camera.top = 55;
    moon.shadow.camera.bottom = -55;
    moon.shadow.camera.far = 220;
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.03;
    this.scene.add(moon);
    this.scene.add(new THREE.AmbientLight(0x6070A0, 0.22));
    this.scene.fog = new THREE.Fog(0x232A3C, 45, 160);
  }

  _addBox(w, h, d, x, y, z, mat, collide, ry) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    if (collide !== false) {
      const half = new THREE.Vector3(w / 2, h / 2, d / 2);
      // AABB conservative si rotation (pièces tournantes peu nombreuses)
      const box = new THREE.Box3(
        m.position.clone().sub(half),
        m.position.clone().add(half)
      );
      this.colliders.push(box);
    }
    this.solids.push(m);
    return m;
  }

  /* ---------- Sol ---------- */
  _buildGround() {
    const tex = new THREE.CanvasTexture(floorCanvas());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.94, metalness: 0.04 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(92, 92), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
    this.solids.push(ground);
  }

  /* ---------- Murs d'enceinte ---------- */
  _buildWalls() {
    const tex = new THREE.CanvasTexture(wallCanvas());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 1);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.18 });
    this._addBox(92, 9, 1, 0, 4.5, -45.5, mat);
    this._addBox(92, 9, 1, 0, 4.5, 45.5, mat);
    this._addBox(1, 9, 92, -45.5, 4.5, 0, mat);
    this._addBox(1, 9, 92, 45.5, 4.5, 0, mat);
  }

  /* ---------- Plateforme centrale + rampes ---------- */
  _buildPlatform() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x3C4352, roughness: 0.7, metalness: 0.4 });
    // plateforme (collider plein) — le dessus est accessible via rampes
    this._addBox(24, 2, 24, 0, 1, 0, metal);
    // rampes (walkable, pas de collider : hauteur gérée par groundHeightAt)
    const rampMat = new THREE.MeshStandardMaterial({ color: 0x333A48, roughness: 0.8, metalness: 0.3 });
    const mkRamp = (x, z, ry) => {
      const geo = new THREE.BoxGeometry(8, 0.5, 10);
      const m = new THREE.Mesh(geo, rampMat);
      m.position.set(x, 1, z);
      m.rotation.x = Math.atan2(2, 10) * (Math.abs(z) > Math.abs(x) ? (z > 0 ? 1 : -1) : 0);
      if (Math.abs(x) > Math.abs(z)) {
        m.rotation.x = 0;
        m.rotation.z = Math.atan2(2, 10) * (x > 0 ? -1 : 1);
      }
      m.rotation.y = ry || 0;
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      this.solids.push(m);
    };
    mkRamp(0, 17, 0);
    mkRamp(0, -17, 0);
    mkRamp(17, 0, 0);
    mkRamp(-17, 0, 0);
    // garde-corps
    const rail = new THREE.MeshStandardMaterial({ color: 0x66707F, roughness: 0.5, metalness: 0.7 });
    for (const [x, z, w, d] of [[0, 11.6, 24, 0.3], [0, -11.6, 24, 0.3], [11.6, 0, 0.3, 24], [-11.6, 0, 0.3, 24]]) {
      // ouvertures aux rampes : on ne garde que 4 segments par côté
      for (const off of [-8.2, 8.2]) {
        const gy = (w > d)
          ? this._addBox(7.2, 0.5, 0.3, x + off, 2.45, z, rail)
          : this._addBox(0.3, 0.5, 7.2, x, 2.45, z + off, rail);
      }
    }
    // bande lumineuse centrale
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 0.08, 40),
      new THREE.MeshStandardMaterial({
        color: 0x0E2A38,
        emissive: 0x2FD8FF,
        emissiveIntensity: 1.4,
        roughness: 0.4
      })
    );
    glow.position.set(0, 2.05, 0);
    this.group.add(glow);
  }

  /* ---------- Couvert : caisses + murs bas + piliers ---------- */
  _buildCover() {
    const crateTex = new THREE.CanvasTexture(crateCanvas());
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85, metalness: 0.1 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x4A5262, roughness: 0.65, metalness: 0.45 });

    const crates = [
      [18, 18, 3.2], [-18, 18, 3.2], [18, -18, 3.2], [-18, -18, 3.2],
      [30, 8, 2.6], [-30, 8, 2.6], [30, -8, 2.6], [-30, -8, 2.6],
      [8, 30, 2.6], [-8, 30, 2.6], [8, -30, 2.6], [-8, -30, 2.6],
      [26, 26, 2.2], [-26, 26, 2.2], [26, -26, 2.2], [-26, -26, 2.2]
    ];
    for (const [x, z, s] of crates) {
      this._addBox(s, s, s, x, s / 2, z, crateMat);
    }
    // empilements
    this._addBox(2.2, 2.2, 2.2, 18, 3.2 + 1.1, 18.6, crateMat);
    this._addBox(2.2, 2.2, 2.2, -18, 3.2 + 1.1, -18.6, crateMat);

    // murs bas
    for (const [x, z, w, d] of [
      [0, 24, 10, 0.9], [0, -24, 10, 0.9],
      [24, 0, 0.9, 10], [-24, 0, 0.9, 10],
      [36, 30, 8, 0.9], [-36, -30, 8, 0.9]
    ]) {
      this._addBox(w, 1.35, d, x, 0.675, z, metalMat);
    }

    // piliers
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x39404E, roughness: 0.6, metalness: 0.5 });
    for (const [x, z] of [[-34, 34], [34, -34], [-34, -34], [34, 34]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 9, 14), pillarMat);
      m.position.set(x, 4.5, z);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      this.solids.push(m);
      this.colliders.push(new THREE.Box3(
        new THREE.Vector3(x - 1.7, 0, z - 1.7),
        new THREE.Vector3(x + 1.7, 9, z + 1.7)
      ));
    }
  }

  /* ---------- Tours d'angle (hauteur 4) ---------- */
  _buildTowers() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x39414F, roughness: 0.72, metalness: 0.35 });
    for (const [x, z] of [[-32, 14], [32, -14]]) {
      // plateforme surélevée (collider sous la plateforme)
      this._addBox(7, 4, 7, x, 2, z, mat);
      // rampe d'accès : sommet à 4 m au bord de la tour, 0 m à 9 m
      const dir = new THREE.Vector3(-x, 0, -z).normalize();
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 9), mat);
      ramp.position.set(x + dir.x * 8, 2, z + dir.z * 8);
      const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dir.x, dir.z));
      const qTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.atan2(4, 9));
      ramp.quaternion.copy(qYaw).multiply(qTilt);
      ramp.castShadow = ramp.receiveShadow = true;
      this.group.add(ramp);
      this.solids.push(ramp);
    }
  }

  /* ---------- Feux (barrils animés) ---------- */
  _buildFires() {
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x553322, roughness: 0.8, metalness: 0.4 });
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xFF7A2C, emissive: 0xFF6A1C, emissiveIntensity: 2.2, roughness: 0.5
    });
    for (const [x, z] of [[14, -26], [-14, 26], [40, 20], [-40, -20]]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 1.15, 12), barrelMat);
      barrel.position.set(x, 0.575, z);
      barrel.castShadow = barrel.receiveShadow = true;
      this.group.add(barrel);
      this.solids.push(barrel);
      this.colliders.push(new THREE.Box3(
        new THREE.Vector3(x - 0.8, 0, z - 0.8),
        new THREE.Vector3(x + 0.8, 1.15, z + 0.8)
      ));
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), flameMat);
      flame.position.set(x, 1.35, z);
      this.group.add(flame);
      const light = new THREE.PointLight(0xFF8A3C, 14, 16, 2);
      light.position.set(x, 1.9, z);
      this.scene.add(light);
      this.fires.push({ light, flame, seed: Math.random() * 10 });
    }
  }

  /* ---------- Spawns ---------- */
  _buildSpawns() {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const r = 34 + (i % 2) * 6;
      this.spawnPoints.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r * 0.92));
    }
    this.pickupSpots = [
      new THREE.Vector3(18, 0, -18),
      new THREE.Vector3(-18, 0, 18),
      new THREE.Vector3(34, 0, 34),
      new THREE.Vector3(-34, 0, -34),
      new THREE.Vector3(0, 2.2, 0),
      new THREE.Vector3(26, 0, -26),
      new THREE.Vector3(-26, 0, 26)
    ];
    this.playerSpawn = { pos: new THREE.Vector3(0, 0, 32), yaw: Math.PI };
    // accès (rampes) pour monter sur les zones surélevées
    this.climbAccess = [
      new THREE.Vector3(0, 0, 17), new THREE.Vector3(0, 0, -17),
      new THREE.Vector3(17, 0, 0), new THREE.Vector3(-17, 0, 0),
      new THREE.Vector3(-24.7, 0, 10.8), new THREE.Vector3(24.7, 0, -10.8)
    ];
  }

  /* ---------- Hauteur du sol (plateformes + rampes) ---------- */
  groundHeightAt(x, z) {
    // plateforme centrale
    if (Math.abs(x) <= 12 && Math.abs(z) <= 12) return 2;
    // rampes centrales
    if (Math.abs(x) <= 4 && z > 12 && z <= 22) return 2 * (22 - z) / 10;
    if (Math.abs(x) <= 4 && z < -12 && z >= -22) return 2 * (22 + z) / 10;
    if (Math.abs(z) <= 4 && x > 12 && x <= 22) return 2 * (22 - x) / 10;
    if (Math.abs(z) <= 4 && x < -12 && x >= -22) return 2 * (22 + x) / 10;
    // tours + leurs rampes
    for (const [tx, tz] of [[-32, 14], [32, -14]]) {
      if (Math.abs(x - tx) <= 3.5 && Math.abs(z - tz) <= 3.5) return 4;
      const dx = -tx, dz = -tz;
      const len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len;
      const relX = x - tx, relZ = z - tz;
      const along = relX * ux + relZ * uz;
      const side = relX * -uz + relZ * ux;
      if (along > 3.5 && along <= 12.5 && Math.abs(side) <= 2.5) {
        return 4 * (12.5 - along) / 9;
      }
    }
    return 0;
  }

  /* ---------- Animation des feux ---------- */
  update(time) {
    for (const f of this.fires) {
      const k = 1 + Math.sin(time * 7 + f.seed) * 0.18 + Math.sin(time * 13.7 + f.seed * 2) * 0.1;
      f.light.intensity = 14 * k;
      f.flame.scale.setScalar(k);
    }
  }
}

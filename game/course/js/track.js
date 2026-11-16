/* ============================================================
   KREO RACING — SLOTS MAPPING + 3D (track.js)
   Le circuit : spline fermée, chaussée, vibreurs, terrain
   conformé, barrières, ligne d'arrivée + arche, stands,
   arbres, montagnes, drapeaux. API de sampling pour le jeu.
   ============================================================ */
import * as THREE from 'three';

/* ---------- Bruit procédural léger (textures) ---------- */
function noiseCanvas(size, base, speck, speckAmt) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * speckAmt; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    g.fillStyle = Math.random() > 0.5 ? speck : 'rgba(0,0,0,0.08)';
    const s = Math.random() * 2.4 + 0.6;
    g.fillRect(x, y, s, s);
  }
  return c;
}

function stripeCanvas(c1, c2, vertical) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = c1; g.fillRect(0, 0, 64, 64);
  g.fillStyle = c2;
  if (vertical) g.fillRect(0, 0, 32, 64);
  else g.fillRect(0, 0, 64, 32);
  return c;
}

function checkerCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const n = 8, s = 128 / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? '#101216' : '#F2F4F8';
      g.fillRect(x * s, y * s, s, s);
    }
  }
  return c;
}

function glowTexture() {
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
}

function bannerCanvas() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#1B2440');
  grad.addColorStop(0.5, '#2B3A66');
  grad.addColorStop(1, '#1B2440');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#EAF1FF';
  g.font = '700 58px Inter, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('KREO RACING · CIRCUIT DES COTEAUX', 512, 68);
  return c;
}

export class TrackSlot {
  constructor(scene) {
    this.scene = scene;
    this.samples = [];
    this.totalLength = 0;
    this._buckets = new Map();
    this._bucketSize = 26;
    this.startLights = [];
    this.flags = [];
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  /* ================= Construction ================= */
  build() {
    this._buildCurveSamples();
    this._buildTerrain();
    this._buildRoad();
    this._buildCurbs();
    this._buildRunoff();
    this._buildBarriers();
    this._buildStartLine();
    this._buildTrees();
    this._buildMountains();
    this._buildGrandstand();
    this._buildDecor();
    this._buildFlags();
    this._buildBuckets();
    return this;
  }

  _buildCurveSamples() {
    // Circuit « en étoile » (jamais auto-croisé) : 18 points,
    // rayon modulé → virages serrés + lignes droites, dénivelé doux.
    const pts = [];
    const M = 18;
    for (let i = 0; i < M; i++) {
      const a = (i / M) * Math.PI * 2;
      const r = 158 + 40 * Math.sin(a * 2 + 0.55) + 17 * Math.sin(a * 3 + 1.2);
      pts.push(new THREE.Vector3(
        Math.cos(a) * r * 1.22,
        2.1 * Math.sin(a * 2 - 0.8) + 1.3 * Math.sin(a * 3 + 2.1),
        Math.sin(a) * r * 0.8
      ));
    }
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);

    const N = 720;
    const positions = this.curve.getSpacedPoints(N);
    let cum = 0;
    for (let i = 0; i <= N; i++) {
      const pos = positions[i];
      const next = positions[(i + 1) % (N + 1)] || positions[0];
      const prev = positions[(i - 1 + N + 1) % (N + 1)];
      const tangent = next.clone().sub(prev).normalize();
      const left = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
      if (i > 0) cum += pos.distanceTo(positions[i - 1]);
      // Curvature : variation de tangente
      const ahead = positions[(i + 14) % (N + 1)];
      const behind = positions[(i - 14 + N + 1) % (N + 1)];
      const t2 = ahead.clone().sub(behind).normalize();
      const turnSign = Math.sign(tangent.x * t2.z - tangent.z * t2.x) || 1;
      const curvature = tangent.angleTo(t2) * turnSign;
      this.samples.push({ pos, tangent, left, cum, curvature, halfWidth: 6.2 });
    }
    this.totalLength = cum;
  }

  _buildBuckets() {
    for (let i = 0; i < this.samples.length; i++) {
      const p = this.samples[i].pos;
      const k = this._key(p.x, p.z);
      if (!this._buckets.has(k)) this._buckets.set(k, []);
      this._buckets.get(k).push(i);
    }
  }

  _key(x, z) {
    return Math.floor(x / this._bucketSize) + ',' + Math.floor(z / this._bucketSize);
  }

  /* Échantillon le plus proche — avec cache (hint d'index) */
  nearest(x, z, hint) {
    if (hint !== undefined && hint !== null && this.samples[hint]) {
      // recherche locale autour du hint (une voiture avance continûment)
      let best = hint, bestD = Infinity;
      for (let d = -26; d <= 26; d++) {
        const i = ((hint + d) % this.samples.length + this.samples.length) % this.samples.length;
        const p = this.samples[i].pos;
        const dd = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (dd < bestD) { bestD = dd; best = i; }
      }
      if (bestD < 3600) return this._finishNearest(best, x, z);
    }
    // recherche par seaux
    const bx = Math.floor(x / this._bucketSize), bz = Math.floor(z / this._bucketSize);
    let best = -1, bestD = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const arr = this._buckets.get((bx + dx) + ',' + (bz + dz));
        if (!arr) continue;
        for (const i of arr) {
          const p = this.samples[i].pos;
          const dd = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
          if (dd < bestD) { bestD = dd; best = i; }
        }
      }
    }
    if (best === -1) {
      // dernier recours : balayage complet
      for (let i = 0; i < this.samples.length; i += 4) {
        const p = this.samples[i].pos;
        const dd = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (dd < bestD) { bestD = dd; best = i; }
      }
    }
    return this._finishNearest(best, x, z);
  }

  _finishNearest(i, x, z) {
    const s = this.samples[i];
    const d = new THREE.Vector3(x - s.pos.x, 0, z - s.pos.z);
    const lateral = d.dot(s.left);
    return {
      index: i,
      t: i / this.samples.length,
      sample: s,
      center: s.pos,
      tangent: s.tangent,
      left: s.left,
      lateral,
      distToCenter: Math.sqrt(d.x * d.x + d.z * d.z)
    };
  }

  /* Hauteur du terrain extérieur */
  terrainHeight(x, z) {
    const n = this.nearest(x, z);
    const base = 2.6 * Math.sin(x * 0.011) * Math.cos(z * 0.013)
      + 1.7 * Math.sin(x * 0.023 + 1.7) * Math.sin(z * 0.02 + 0.6) - 0.4;
    const d = n.distToCenter;
    const k = THREE.MathUtils.smoothstep(d, 26, 68);
    return THREE.MathUtils.lerp(n.sample.pos.y - 0.18, base, k);
  }

  /* ================= Géométries ================= */
  _ribbon(innerFn, outerFn, count, uvRepeat, material, yOff) {
    const verts = [], uvs = [], idx = [];
    for (let i = 0; i <= count; i++) {
      const s = this.samples[i % this.samples.length];
      const a = innerFn(s, i);
      const b = outerFn(s, i);
      verts.push(a.x, a.y + (yOff || 0), a.z);
      verts.push(b.x, b.y + (yOff || 0), b.z);
      const v = (s.cum / uvRepeat);
      uvs.push(0, v, 1, v);
    }
    for (let i = 0; i < count; i++) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  _buildRoad() {
    const tex = new THREE.CanvasTexture(noiseCanvas(256, '#3A3D44', '#2B2E34', 0.5));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.02 });
    const N = this.samples.length - 1;
    this._ribbon(
      (s) => s.pos.clone().addScaledVector(s.left, s.halfWidth),
      (s) => s.pos.clone().addScaledVector(s.left, -s.halfWidth),
      N, 10, mat, 0.06
    );
  }

  _buildCurbs() {
    const tex = new THREE.CanvasTexture(stripeCanvas('#D8323C', '#F2F4F8', false));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    const N = this.samples.length - 1;
    const hw = (s) => s.halfWidth, hw2 = (s) => s.halfWidth + 1.15;
    this._ribbon((s) => s.pos.clone().addScaledVector(s.left, hw(s)), (s) => s.pos.clone().addScaledVector(s.left, hw2(s)), N, 2.2, mat, 0.1);
    this._ribbon((s) => s.pos.clone().addScaledVector(s.left, -hw(s)), (s) => s.pos.clone().addScaledVector(s.left, -hw2(s)), N, 2.2, mat, 0.1);
  }

  _buildRunoff() {
    const tex = new THREE.CanvasTexture(noiseCanvas(256, '#4C6B3C', '#3E5A31', 0.55));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
    const N = this.samples.length - 1;
    const a = (s) => s.pos.clone().addScaledVector(s.left, s.halfWidth + 1.15);
    const b = (s) => s.pos.clone().addScaledVector(s.left, s.halfWidth + 5.2);
    const c = (s) => s.pos.clone().addScaledVector(s.left, -(s.halfWidth + 1.15));
    const d = (s) => s.pos.clone().addScaledVector(s.left, -(s.halfWidth + 5.2));
    this._ribbon(a, b, N, 8, mat, 0.05);
    this._ribbon(d, c, N, 8, mat, 0.05);
  }

  _buildBarriers() {
    const tex = new THREE.CanvasTexture(stripeCanvas('#E8ECF2', '#C4323C', false));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide });
    const N = this.samples.length - 1;
    const wall = (sign) => {
      const verts = [], uvs = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const s = this.samples[i % this.samples.length];
        const p = s.pos.clone().addScaledVector(s.left, sign * (s.halfWidth + 5.4));
        const v = s.cum / 6;
        verts.push(p.x, p.y + 0.05, p.z);
        verts.push(p.x, p.y + 1.15, p.z);
        uvs.push(0, v, 1, v);
      }
      for (let i = 0; i < N; i++) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      this.group.add(new THREE.Mesh(geo, mat));
    };
    wall(1); wall(-1);
  }

  _buildTerrain() {
    // Grille conformée au tracé + collines au loin
    const xs = [], zs = [];
    for (const s of this.samples) { xs.push(s.pos.x); zs.push(s.pos.z); }
    const minX = Math.min(...xs) - 140, maxX = Math.max(...xs) + 140;
    const minZ = Math.min(...zs) - 140, maxZ = Math.max(...zs) + 140;
    const step = 7;
    const cols = Math.ceil((maxX - minX) / step) + 1;
    const rows = Math.ceil((maxZ - minZ) / step) + 1;
    const verts = [], colors = [], idx = [];
    const grassA = new THREE.Color(0x577a44), grassB = new THREE.Color(0x6f8f52);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = minX + c * step, z = minZ + r * step;
        const y = this.terrainHeight(x, z);
        verts.push(x, y, z);
        const n = Math.sin(x * 0.05) * Math.cos(z * 0.06) * 0.5 + 0.5;
        const col = grassA.clone().lerp(grassB, n);
        colors.push(col.r, col.g, col.b);
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const k = r * cols + c;
        idx.push(k, k + cols, k + 1, k + 1, k + cols, k + cols + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  _buildStartLine() {
    const s0 = this.samples[0];
    // Damier au sol
    const tex = new THREE.CanvasTexture(checkerCanvas());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 1);
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(12.4, 1.6),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })
    );
    line.rotation.x = -Math.PI / 2;
    line.rotateZ(Math.atan2(-s0.left.z, s0.left.x));
    line.position.copy(s0.pos);
    line.position.y += 0.12;
    line.receiveShadow = true;
    this.group.add(line);

    // Arche
    const gantry = new THREE.Group();
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2A2F3C, roughness: 0.5, metalness: 0.55 });
    const left = s0.pos.clone().addScaledVector(s0.left, 8.2);
    const right = s0.pos.clone().addScaledVector(s0.left, -8.2);
    const mk = (p) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.4, 0.7), pillarMat);
      m.position.copy(p); m.position.y += 3.7;
      m.castShadow = true;
      gantry.add(m);
    };
    mk(left); mk(right);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(17.1, 1.5, 0.8), pillarMat);
    beam.position.copy(s0.pos); beam.position.y += 7.0;
    beam.rotation.y = Math.atan2(-s0.left.z, s0.left.x);
    beam.castShadow = true;
    gantry.add(beam);

    // Bannière
    const banTex = new THREE.CanvasTexture(bannerCanvas());
    const ban = new THREE.Mesh(
      new THREE.PlaneGeometry(16.2, 1.35),
      new THREE.MeshBasicMaterial({ map: banTex, side: THREE.DoubleSide })
    );
    ban.position.copy(s0.pos).addScaledVector(s0.tangent, 0.45);
    ban.position.y += 7.0;
    ban.rotation.y = Math.atan2(-s0.left.z, s0.left.x);
    gantry.add(ban);

    // Feux de départ
    for (let i = 0; i < 5; i++) {
      const lamp = new THREE.Mesh(
        new THREE.CircleGeometry(0.34, 20),
        new THREE.MeshBasicMaterial({ color: 0x2A1215, side: THREE.DoubleSide })
      );
      const off = (i - 2) * 1.25;
      lamp.position.copy(s0.pos)
        .addScaledVector(s0.tangent, -0.42)
        .addScaledVector(s0.left, off);
      lamp.position.y += 7.02;
      lamp.rotation.y = Math.atan2(s0.tangent.x, s0.tangent.z);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(),
        color: 0x000000,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      glow.scale.set(1.7, 1.7, 1);
      glow.renderOrder = 3;
      lamp.add(glow);
      lamp.userData.glow = glow;
      gantry.add(lamp);
      this.startLights.push(lamp);
    }
    this.group.add(gantry);
  }

  _buildTrees() {
    const trunkGeo = new THREE.CylinderGeometry(0.32, 0.42, 3.2, 7);
    const leafGeo = new THREE.ConeGeometry(2.5, 5.6, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6B4A2F, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2E5D34, roughness: 0.9 });
    const count = 150;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
    trunks.castShadow = leaves.castShadow = true;
    leaves.receiveShadow = true;
    const m = new THREE.Matrix4();
    let placed = 0, guard = 0;
    while (placed < count && guard++ < 4000) {
      const i = Math.floor(Math.random() * this.samples.length);
      const s = this.samples[i];
      const side = Math.random() > 0.5 ? 1 : -1;
      const dist = 16 + Math.random() * 58;
      const p = s.pos.clone().addScaledVector(s.left, side * dist);
      p.y = this.terrainHeight(p.x, p.z);
      const scale = 0.8 + Math.random() * 0.9;
      m.compose(new THREE.Vector3(p.x, p.y + 1.6 * scale, p.z), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
      trunks.setMatrixAt(placed, m);
      m.compose(new THREE.Vector3(p.x, p.y + (3.2 + 2.6) * scale * 0.72, p.z), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
      leaves.setMatrixAt(placed, m);
      placed++;
    }
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    this.group.add(trunks, leaves);
  }

  _buildMountains() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x7E93B2, roughness: 1, flatShading: true });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const r = 620 + Math.random() * 190;
      const h = 130 + Math.random() * 150;
      const m = new THREE.Mesh(new THREE.ConeGeometry(h * (0.9 + Math.random() * 0.7), h, 6), mat);
      m.position.set(Math.cos(a) * r, h / 2 - 24, Math.sin(a) * r * 0.85);
      m.rotation.y = Math.random() * Math.PI;
      this.group.add(m);
    }
  }

  _buildGrandstand() {
    const s = this.samples[30];
    const base = s.pos.clone().addScaledVector(s.left, 22);
    base.y = this.terrainHeight(base.x, base.z);
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x9BA6B8, roughness: 0.8 });
    for (let r = 0; r < 5; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(30, 1.5, 3.2), mat);
      step.position.set(0, 0.75 + r * 1.5, r * 3.2);
      step.castShadow = step.receiveShadow = true;
      g.add(step);
    }
    // Foule : petites boîtes colorées
    const crowdGeo = new THREE.BoxGeometry(0.55, 1.1, 0.55);
    const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true });
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, 320);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < 320; i++) {
      const r = Math.floor(Math.random() * 5);
      const x = (Math.random() - 0.5) * 27;
      const z = r * 3.2 + (Math.random() - 0.5) * 2;
      m.compose(new THREE.Vector3(x, 1.5 + r * 1.5 + 1.05, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      crowd.setMatrixAt(i, m);
      col.setHSL(Math.random(), 0.55, 0.55);
      crowd.setColorAt(i, col);
    }
    crowd.instanceMatrix.needsUpdate = true;
    g.add(crowd);
    g.position.copy(base);
    g.rotation.y = Math.atan2(-s.left.z, s.left.x);
    this.group.add(g);
  }

  _buildDecor() {
    // Pneus empilés aux coins + bâtiments + plot en mousse
    const tireGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.5, 14);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1A1D24, roughness: 0.95 });
    for (let k = 0; k < 10; k++) {
      const i = 60 + Math.floor(k * (this.samples.length / 11));
      const s = this.samples[i % this.samples.length];
      const side = k % 2 ? 1 : -1;
      const p = s.pos.clone().addScaledVector(s.left, side * (s.halfWidth + 6.6));
      p.y = this.terrainHeight(p.x, p.z);
      for (let j = 0; j < 3; j++) {
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.position.set(p.x + (Math.random() - 0.5), p.y + 0.26 + j * 0.52, p.z + (Math.random() - 0.5));
        tire.rotation.x = Math.PI / 2;
        tire.castShadow = true;
        this.group.add(tire);
      }
    }
    // Bâtiments près du stand
    const winTex = (() => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#8C97AB'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#38415A';
      for (let y = 6; y < 60; y += 12) for (let x = 6; x < 60; x += 12) g.fillRect(x, y, 7, 7);
      return new THREE.CanvasTexture(c);
    })();
    const bMat = new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.8 });
    const s30 = this.samples[30];
    for (let i = 0; i < 6; i++) {
      const w = 8 + Math.random() * 12, h = 7 + Math.random() * 12;
      const p = s30.pos.clone().addScaledVector(s30.left, 36 + Math.random() * 30)
        .addScaledVector(s30.tangent, (i - 3) * 16);
      p.y = this.terrainHeight(p.x, p.z);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), bMat);
      b.position.set(p.x, p.y + h / 2, p.z);
      b.castShadow = b.receiveShadow = true;
      this.group.add(b);
    }
  }

  _buildFlags() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xC9CFDD, metalness: 0.7, roughness: 0.35 });
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xE23B48, side: THREE.DoubleSide, roughness: 0.7 });
    for (let k = 0; k < 8; k++) {
      const i = (k * 90) % this.samples.length;
      const s = this.samples[i];
      const side = k % 2 ? 1 : -1;
      const p = s.pos.clone().addScaledVector(s.left, side * (s.halfWidth + 4.4));
      p.y = this.terrainHeight(p.x, p.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6.4, 8), poleMat);
      pole.position.set(p.x, p.y + 3.2, p.z);
      pole.castShadow = true;
      this.group.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.1, 8, 2), flagMat.clone());
      flag.position.set(p.x + 1.0, p.y + 5.6, p.z);
      flag.castShadow = true;
      this.group.add(flag);
      this.flags.push(flag);
    }
  }

  /* ================= API jeu ================= */

  /** Position de départ pour la voiture i (0..3) */
  gridSpawn(i) {
    const idx = 14 - i * 7;
    const s = this.samples[(idx + this.samples.length) % this.samples.length];
    const lateral = (i % 2 === 0 ? 1 : -1) * 2.6;
    const pos = s.pos.clone().addScaledVector(s.left, lateral);
    pos.y += 0.02;
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    return { pos, yaw };
  }

  /** Progression normalisée 0..1 */
  progressOf(nearest) {
    return nearest.t;
  }

  setStartLights(state) {
    // state: 'off' | 'red' | 'green'
    this.startLights.forEach((lamp) => {
      const c = state === 'red' ? 0xFF2333 : state === 'green' ? 0x22E077 : 0x2A1215;
      lamp.material.color.setHex(c);
      const glow = lamp.userData.glow;
      if (glow) {
        if (state === 'off') {
          glow.material.opacity = 0;
        } else {
          glow.material.color.setHex(c);
          glow.material.opacity = 0.9;
        }
      }
    });
  }

  animateFlags(time) {
    this.flags.forEach((f, i) => {
      const pos = f.geometry.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v);
        pos.setZ(v, Math.sin(time * 3 + x * 2.2 + i) * 0.16 * (x + 0.95));
      }
      pos.needsUpdate = true;
    });
  }
}

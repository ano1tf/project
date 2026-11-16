/* ============================================================
   KREO ARENA — SLOT FX (fx.js)
   Particules GPU (étincelles, fumée, débris), traçantes,
   décalques d'impacts, douilles éjectées, flash de bouche.
   ============================================================ */
import * as THREE from 'three';

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.42)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function holeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 28);
  grad.addColorStop(0, 'rgba(10,10,12,0.95)');
  grad.addColorStop(0.35, 'rgba(20,20,24,0.55)');
  grad.addColorStop(0.7, 'rgba(40,40,48,0.18)');
  grad.addColorStop(1, 'rgba(40,40,48,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  // éclats clairs autour
  g.strokeStyle = 'rgba(120,120,132,0.5)';
  g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    g.beginPath();
    g.moveTo(32 + Math.cos(a) * 8, 32 + Math.sin(a) * 8);
    g.lineTo(32 + Math.cos(a) * (14 + Math.random() * 10), 32 + Math.sin(a) * (14 + Math.random() * 10));
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}

/* ---------- Pool de particules GPU ---------- */
class ParticlePool {
  constructor(scene, { max = 360, texture, blending, gravity = 0 }) {
    this.max = max;
    this.gravity = gravity;
    this.cursor = 0;
    this.particles = [];

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(max), 1);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    geo.setAttribute('pSize', this.sizeAttr);
    geo.setAttribute('pAlpha', this.alphaAttr);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: texture }, uScale: { value: 480 } },
      vertexShader: `
        attribute float pSize;
        attribute float pAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vColor = color;
          vAlpha = pAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = pSize * (uScale / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor, 1.0) * tex * vAlpha;
          if (gl_FragColor.a < 0.01) discard;
        }`,
      transparent: true,
      depthWrite: false,
      blending,
      vertexColors: true
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    for (let i = 0; i < max; i++) {
      this.particles.push({ life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, size: 1, drag: 0.98 });
      this.alphaAttr.array[i] = 0;
    }
    this.alphaAttr.needsUpdate = true;
  }

  spawn(pos, vel, color, size, life, drag) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const p = this.particles[i];
    p.life = life;
    p.maxLife = life;
    p.vx = vel.x; p.vy = vel.y; p.vz = vel.z;
    p.size = size;
    p.drag = drag == null ? 0.96 : drag;
    this.posAttr.array[i * 3] = pos.x;
    this.posAttr.array[i * 3 + 1] = pos.y;
    this.posAttr.array[i * 3 + 2] = pos.z;
    this.colAttr.array[i * 3] = color.r;
    this.colAttr.array[i * 3 + 1] = color.g;
    this.colAttr.array[i * 3 + 2] = color.b;
    this.sizeAttr.array[i] = size;
    this.alphaAttr.array[i] = 1;
  }

  update(dt) {
    const P = this.particles;
    for (let i = 0; i < this.max; i++) {
      const p = P[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.alphaAttr.array[i] = 0;
        continue;
      }
      p.vy -= this.gravity * dt;
      p.vx *= p.drag; p.vy *= p.drag; p.vz *= p.drag;
      this.posAttr.array[i * 3] += p.vx * dt;
      this.posAttr.array[i * 3 + 1] += p.vy * dt;
      this.posAttr.array[i * 3 + 2] += p.vz * dt;
      const k = p.life / p.maxLife;
      this.alphaAttr.array[i] = k;
      this.sizeAttr.array[i] = p.size * (0.45 + k * 0.55);
    }
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }
}

/* ---------- FXSlot ---------- */
export class FXSlot {
  constructor(scene) {
    this.scene = scene;
    const tex = softTexture();
    this.sparks = new ParticlePool(scene, {
      max: 360, texture: tex, blending: THREE.AdditiveBlending, gravity: 14
    });
    this.smoke = new ParticlePool(scene, {
      max: 300, texture: tex, blending: THREE.NormalBlending, gravity: -0.6
    });
    this.debris = new ParticlePool(scene, {
      max: 200, texture: tex, blending: THREE.NormalBlending, gravity: 16
    });

    /* Décalques (impacts de balles) */
    this.decalTex = holeTexture();
    this.decals = [];
    this.decalGeo = new THREE.PlaneGeometry(0.22, 0.22);
    this.decalMat = new THREE.MeshBasicMaterial({
      map: this.decalTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4
    });
    this.decalCursor = 0;
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(this.decalGeo, this.decalMat);
      m.visible = false;
      m.renderOrder = 1;
      scene.add(m);
      this.decals.push(m);
    }

    /* Traçantes */
    this.tracers = [];
    this.tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({
        color: 0xFFE9A8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0, maxLife: 0.09 });
    }
    this.tracerCursor = 0;

    /* Douilles */
    this.casings = [];
    this.casingGeo = new THREE.BoxGeometry(0.035, 0.035, 0.11);
    this.casingMat = new THREE.MeshStandardMaterial({
      color: 0xC9A24B, metalness: 0.9, roughness: 0.35
    });
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(this.casingGeo, this.casingMat);
      m.visible = false;
      scene.add(m);
      this.casings.push({ mesh: m, vx: 0, vy: 0, vz: 0, rot: 0, life: 0 });
    }
    this.casingCursor = 0;

    /* Flash de bouche (sprite + lumière) */
    this.flashTex = softTexture();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.flashTex,
      color: 0xFFD27A,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    this.flash.scale.set(0.9, 0.9, 1);
    scene.add(this.flash);
    this.flashLight = new THREE.PointLight(0xFFC878, 0, 14, 2);
    scene.add(this.flashLight);
    this._flashT = 0;
  }

  /* ---------- Impacts ---------- */
  impact(pos, normal) {
    const n = normal || new THREE.Vector3(0, 1, 0);
    // étincelles
    const c1 = new THREE.Color(0xFFD27A), c2 = new THREE.Color(0xFF8A3C);
    for (let i = 0; i < 9; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 3.4,
        (Math.random() - 0.5) * 5
      ).addScaledVector(n, 2.2);
      this.sparks.spawn(pos, v, Math.random() > 0.5 ? c1 : c2, 0.5 + Math.random() * 0.5, 0.28 + Math.random() * 0.3, 0.9);
    }
    // fumée légère
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.7, (Math.random() - 0.5) * 0.8);
      this.smoke.spawn(pos, v, new THREE.Color(0x8A8F9C), 1.6 + Math.random() * 1.2, 0.5 + Math.random() * 0.4, 0.94);
    }
    this.decal(pos, n);
  }

  bloodHit(pos) {
    const c = new THREE.Color(0xC22B2B);
    for (let i = 0; i < 10; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3,
        (Math.random() - 0.5) * 4
      );
      this.debris.spawn(pos, v, c, 0.55 + Math.random() * 0.5, 0.32 + Math.random() * 0.25, 0.9);
    }
    const g = new THREE.Color(0x7A1E1E);
    this.smoke.spawn(pos, new THREE.Vector3(0, 0.4, 0), g, 1.4, 0.5, 0.95);
  }

  decal(pos, normal) {
    const m = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decals.length;
    m.visible = true;
    m.position.copy(pos).addScaledVector(normal, 0.02);
    const look = pos.clone().add(normal);
    m.lookAt(look);
    m.rotation.z = Math.random() * Math.PI * 2;
    const s = 0.8 + Math.random() * 0.5;
    m.scale.set(s, s, 1);
    m.material.opacity = 0.95;
  }

  /* ---------- Traçantes ---------- */
  tracer(from, to) {
    const t = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length;
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.1) return;
    t.mesh.visible = true;
    t.mesh.position.copy(from).addScaledVector(dir, 0.5);
    t.mesh.scale.set(1, 1, len);
    t.mesh.lookAt(to);
    t.mesh.material.opacity = 0.85;
    t.life = t.maxLife;
  }

  /* ---------- Douilles ---------- */
  casing(pos, rightDir) {
    const c = this.casings[this.casingCursor];
    this.casingCursor = (this.casingCursor + 1) % this.casings.length;
    c.mesh.visible = true;
    c.mesh.position.copy(pos);
    c.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    const r = rightDir || new THREE.Vector3(1, 0, 0);
    c.vx = r.x * (1.6 + Math.random() * 1.4);
    c.vy = 2 + Math.random() * 1.6;
    c.vz = r.z * (1.6 + Math.random() * 1.4);
    c.rot = 8 + Math.random() * 8;
    c.life = 2.2;
  }

  /* ---------- Flash de bouche ---------- */
  muzzleFlash(pos, dir) {
    this.flash.position.copy(pos);
    this.flash.material.opacity = 0.95;
    this.flash.scale.setScalar(0.7 + Math.random() * 0.5);
    this.flashLight.position.copy(pos).addScaledVector(dir, 0.4);
    this.flashLight.intensity = 26;
    this._flashT = 0.055;
    // étincelles rapides dans l'axe
    const c = new THREE.Color(0xFFE9B0);
    for (let i = 0; i < 5; i++) {
      const v = dir.clone().multiplyScalar(6 + Math.random() * 7)
        .add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3));
      this.sparks.spawn(pos, v, c, 0.5 + Math.random() * 0.4, 0.1 + Math.random() * 0.12, 0.88);
    }
  }

  /* ---------- Explosions ---------- */
  explosion(pos, small) {
    const n = small ? 14 : 26;
    const c1 = new THREE.Color(0xFFB24D), c2 = new THREE.Color(0xFF6A2C);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 11,
        Math.random() * 6,
        (Math.random() - 0.5) * 11
      );
      this.sparks.spawn(pos, v, Math.random() > 0.4 ? c1 : c2, 0.8 + Math.random() * 0.9, 0.35 + Math.random() * 0.4, 0.92);
    }
    for (let i = 0; i < (small ? 5 : 10); i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2.4, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 2.4);
      this.smoke.spawn(pos, v, new THREE.Color(0x555A66), 2.6 + Math.random() * 2.2, 0.9 + Math.random() * 0.8, 0.965);
    }
    this.muzzleFlash(pos, new THREE.Vector3(0, 1, 0));
  }

  /* ---------- Boucle ---------- */
  update(dt) {
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.debris.update(dt);

    // traçantes
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.visible = false;
        continue;
      }
      t.mesh.material.opacity = 0.85 * (t.life / t.maxLife);
    }

    // douilles
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) {
        c.mesh.visible = false;
        continue;
      }
      c.vy -= 13 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.rotation.x += c.rot * dt;
      c.mesh.rotation.z += c.rot * 0.7 * dt;
      if (c.mesh.position.y < 0.03) {
        c.mesh.position.y = 0.03;
        c.vy *= -0.35;
        c.vx *= 0.7; c.vz *= 0.7;
        c.rot *= 0.6;
      }
    }

    // flash
    if (this._flashT > 0) {
      this._flashT -= dt;
      const k = Math.max(0, this._flashT / 0.055);
      this.flash.material.opacity = 0.95 * k;
      this.flashLight.intensity = 26 * k;
      if (this._flashT <= 0) {
        this.flash.material.opacity = 0;
        this.flashLight.intensity = 0;
      }
    }
  }

  reset() {
    for (const d of this.decals) d.visible = false;
    for (const t of this.tracers) { t.life = 0; t.mesh.visible = false; }
    for (const c of this.casings) { c.life = 0; c.mesh.visible = false; }
  }
}

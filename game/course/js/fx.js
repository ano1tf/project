/* ============================================================
   KREO RACING — SLOT FX (fx.js)
   Particules GPU (fumée de pneus, poussière, étincelles,
   confettis) + marques de pneus persistantes.
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

class ParticlePool {
  constructor(scene, { max = 420, texture, blending, gravity = 0 }) {
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
        void main() {
          vColor = color;
          vAlpha = pAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = pSize * (300.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: blending || THREE.NormalBlending
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    for (let i = 0; i < max; i++) {
      this.particles.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0, maxLife: 1,
        size: 1,
        col: new THREE.Color(1, 1, 1)
      });
    }
  }

  spawn(pos, vel, life, size, col) {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    p.alive = true;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.life = 0;
    p.maxLife = life;
    p.size = size;
    p.col.copy(col);
    return p;
  }

  update(dt) {
    const arr = this.posAttr.array;
    const col = this.colAttr.array;
    const siz = this.sizeAttr.array;
    const alp = this.alphaAttr.array;
    for (let i = 0; i < this.max; i++) {
      const p = this.particles[i];
      if (!p.alive) {
        alp[i] = 0;
        continue;
      }
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        alp[i] = 0;
        continue;
      }
      p.vel.y -= this.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = p.life / p.maxLife;
      arr[i * 3] = p.pos.x;
      arr[i * 3 + 1] = p.pos.y;
      arr[i * 3 + 2] = p.pos.z;
      col[i * 3] = p.col.r;
      col[i * 3 + 1] = p.col.g;
      col[i * 3 + 2] = p.col.b;
      siz[i] = p.size * (1 + k * 1.6);
      alp[i] = (1 - k) * 0.85;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }
}

const SMOKE_COL = new THREE.Color(0.92, 0.92, 0.95);
const DUST_COL = new THREE.Color(0.78, 0.72, 0.58);
const SPARK_COL = new THREE.Color(1.0, 0.82, 0.35);

export class FXSlot {
  constructor(scene) {
    this.scene = scene;
    const tex = softTexture();
    this.smoke = new ParticlePool(scene, { max: 380, texture: tex, gravity: -1.2 });
    this.sparks = new ParticlePool(scene, {
      max: 160, texture: tex, blending: THREE.AdditiveBlending, gravity: 14
    });
    this.confetti = new ParticlePool(scene, { max: 320, texture: tex, gravity: 4.5 });

    // Marques de pneus : pool de quads
    this.skidPool = [];
    this.skidCursor = 0;
    const skidGeo = new THREE.PlaneGeometry(0.42, 1.5);
    skidGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 140; i++) {
      const m = new THREE.Mesh(
        skidGeo,
        new THREE.MeshBasicMaterial({
          color: 0x14161c,
          transparent: true,
          opacity: 0,
          depthWrite: false
        })
      );
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      this.skidPool.push({ mesh: m, life: 0 });
    }
    this._skidCooldown = 0;
    this._smokeAcc = 0;
    this._sparkAcc = 0;
  }

  /* Fumée de pneus (drift / freinage) */
  smokeAt(pos, intensity, dt) {
    this._smokeAcc += dt * (14 + intensity * 42);
    while (this._smokeAcc >= 1) {
      this._smokeAcc -= 1;
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 1.6,
        0.8 + Math.random() * 1.4,
        (Math.random() - 0.5) * 1.6
      );
      this.smoke.spawn(pos, v, 0.9 + Math.random() * 0.8, 1.6 + Math.random() * 1.4, SMOKE_COL);
    }
  }

  /* Poussière hors-piste */
  dustAt(pos, intensity, dt) {
    this._smokeAcc += dt * (8 + intensity * 26);
    while (this._smokeAcc >= 1) {
      this._smokeAcc -= 1;
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 2.2,
        1.2 + Math.random() * 1.8,
        (Math.random() - 0.5) * 2.2
      );
      this.smoke.spawn(pos, v, 0.7 + Math.random() * 0.7, 1.3 + Math.random(), DUST_COL);
    }
  }

  /* Éincelles (choc barrière) */
  sparksAt(pos, count) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 7,
        1.5 + Math.random() * 5,
        (Math.random() - 0.5) * 7
      );
      this.sparks.spawn(pos, v, 0.35 + Math.random() * 0.35, 0.55 + Math.random() * 0.4, SPARK_COL);
    }
  }

  /* Confettis (arrivée) */
  confettiAt(pos, count) {
    const cols = [0xff4d6d, 0xffd86b, 0x2fe07c, 0x4f7dff, 0xc26bff, 0x22d3ee];
    for (let i = 0; i < count; i++) {
      const c = new THREE.Color(cols[i % cols.length]);
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        4 + Math.random() * 8,
        (Math.random() - 0.5) * 10
      );
      this.confetti.spawn(pos, v, 2.2 + Math.random() * 1.6, 0.8 + Math.random() * 0.8, c);
    }
  }

  /* Marque de pneu */
  skidAt(pos, yaw, opacity) {
    if (this._skidCooldown > 0) return;
    this._skidCooldown = 0.035;
    const s = this.skidPool[this.skidCursor];
    this.skidCursor = (this.skidCursor + 1) % this.skidPool.length;
    s.mesh.position.copy(pos);
    s.mesh.position.y += 0.035;
    s.mesh.rotation.y = yaw;
    s.mesh.visible = true;
    s.mesh.material.opacity = Math.min(0.5, opacity);
    s.life = 14;
    s.mesh.material.transparent = true;
  }

  update(dt) {
    this._skidCooldown = Math.max(0, this._skidCooldown - dt);
    this.smoke.update(dt);
    this.sparks.update(dt);
    this.confetti.update(dt);
    for (const s of this.skidPool) {
      if (!s.mesh.visible) continue;
      s.life -= dt;
      if (s.life < 4) {
        s.mesh.material.opacity *= Math.max(0, 1 - dt * 0.35);
      }
      if (s.life <= 0 || s.mesh.material.opacity < 0.01) {
        s.mesh.visible = false;
        s.mesh.material.opacity = 0;
      }
    }
  }

  /* Réinitialise les marques (nouvelle course) */
  resetSkids() {
    for (const s of this.skidPool) {
      s.mesh.visible = false;
      s.mesh.material.opacity = 0;
      s.life = 0;
    }
  }
}

/* ============================================================
   KREO — RUNTIME (runtime.js)
   Le moteur de jeu, séparé de l'éditeur.

   Ce fichier est la SOURCE UNIQUE du gameplay :
   - l'éditeur l'importe pour son bouton « Jouer » ;
   - l'export HTML autonome l'embarque tel quel.

   Conséquence : ce qu'on teste dans l'éditeur est exactement ce qui
   tourne dans le jeu publié. Aucune divergence possible.

   API publique :
     const rt = new KreoRuntime({ THREE, scene, canvas, data })
     rt.renderer          WebGLRenderer (partagé en mode éditeur)
     rt.start() / rt.stop() / rt.dispose()
     rt.camera, rt.player, rt.entities
   ============================================================ */

export const RUNTIME_VERSION = '1.0.0';

/* ---------------------------------------------------------- utilitaires */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function hashNoise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/* Textures procédurales partagées (aucun asset externe requis). */
export function makeNoiseTexture(THREE, size = 64, repeat = 4, contrast = 0.5) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.round(255 * (contrast + (Math.random() - 0.5)));
    img.data[i] = img.data[i + 1] = img.data[i + 2] = clamp(v, 0, 255);
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  return tex;
}

/* ---------------------------------------------------------- textures */
/**
 * Textures procédurales : grille, béton, métal, damier, bruit.
 * Elles évitent l'écueil « tout est une couleur unie » sans imposer de
 * fichiers externes — indispensable pour un export autonome.
 */
let CanvasTextureCtor = null;
let RepeatWrappingCtor = null;

export function bindTextureGlobals(THREE) {
  CanvasTextureCtor = THREE.CanvasTexture;
  RepeatWrappingCtor = THREE.RepeatWrapping;
}

export function makeTexture(kind, size = 256, repeat = 4) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const S = size;

  const noise = (amount, mono) => {
    const img = g.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * amount;
      img.data[i] = clamp(img.data[i] + n, 0, 255);
      img.data[i + 1] = clamp(img.data[i + 1] + (mono ? n : (Math.random() - 0.5) * amount), 0, 255);
      img.data[i + 2] = clamp(img.data[i + 2] + n, 0, 255);
    }
    g.putImageData(img, 0, 0);
  };

  if (kind === 'grid') {
    g.fillStyle = '#6C7B94'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(220,232,255,.35)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      const p = (i / 4) * S;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
    }
    noise(16, true);
  } else if (kind === 'concrete') {
    g.fillStyle = '#8A8F98'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 90 | 0},${90 + Math.random() * 90 | 0},${95 + Math.random() * 90 | 0},.35)`;
      const r = Math.random() * 6 + 1;
      g.beginPath(); g.arc(Math.random() * S, Math.random() * S, r, 0, 7); g.fill();
    }
    noise(26, true);
  } else if (kind === 'metal') {
    const grad = g.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, '#9AA3B0'); grad.addColorStop(.5, '#6E7783'); grad.addColorStop(1, '#9AA3B0');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 220; i++) {
      g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
      g.beginPath();
      const y = Math.random() * S;
      g.moveTo(0, y); g.lineTo(S, y + (Math.random() - .5) * 4); g.stroke();
    }
    noise(12, true);
  } else if (kind === 'checker') {
    const n = 8, cell = S / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? '#E8EDF5' : '#4A5568';
      g.fillRect(x * cell, y * cell, cell, cell);
    }
  } else if (kind === 'wood') {
    g.fillStyle = '#7A553A'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(${60 + Math.random() * 60 | 0},${40 + Math.random() * 40 | 0},20,.35)`;
      g.lineWidth = 1 + Math.random() * 3;
      g.beginPath();
      const y = Math.random() * S;
      g.moveTo(0, y);
      g.bezierCurveTo(S * .3, y + (Math.random() - .5) * 20, S * .7, y + (Math.random() - .5) * 20, S, y);
      g.stroke();
    }
    noise(14, false);
  } else {
    // bruit neutre
    g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    noise(60, true);
  }

  const tex = new CanvasTextureCtor(c);
  tex.wrapS = tex.wrapT = RepeatWrappingCtor;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return { canvas: c, kind: kind, repeat: repeat };
}

/** Construit une THREE.CanvasTexture depuis l'entrée de la bibliothèque. */
export function textureToThree(THREE, entry) {
  const tex = new THREE.CanvasTexture(entry.canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(entry.repeat, entry.repeat);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/* ---------------------------------------------------------- physique simple */
/* Boîtes alignées sur les axes (AABB) + hauteurs de sol.
   Volontairement simple : c'est ce qui reste rapide avec 500 colliders
   et ce qui suffit pour des niveaux « couloirs ». Les pentes viendront
   avec le TriMesh plus tard. */
export class AABBWorld {
  constructor() {
    this.boxes = [];          // { min, max, tag }
    this.solidTags = new Set();
  }
  clear() { this.boxes.length = 0; }

  add(box, tag) {
    this.boxes.push({ min: box.min.clone(), max: box.max.clone(), tag: tag || null });
  }

  /** Rayon vertical/horizontal : renvoie la distance du premier impact. */
  raycast(origin, dir, maxDist) {
    let best = maxDist;
    for (const b of this.boxes) {
      const t = rayBox(origin, dir, b.min, b.max);
      if (t !== null && t >= 0 && t < best) best = t;
    }
    return best < maxDist ? best : null;
  }

  /** Point d'impact + normale approximative (pour décals/impacts). */
  raycastHit(origin, dir, maxDist) {
    let best = maxDist, hitBox = null;
    for (const b of this.boxes) {
      const t = rayBox(origin, dir, b.min, b.max);
      if (t !== null && t >= 0 && t < best) { best = t; hitBox = b; }
    }
    if (!hitBox) return null;
    const p = origin.clone().addScaledVector(dir, best);
    // normale = axe dont on est le plus proche
    const c = hitBox.min.clone().add(hitBox.max).multiplyScalar(0.5);
    const half = hitBox.max.clone().sub(hitBox.min).multiplyScalar(0.5);
    const d = p.clone().sub(c);
    const ax = Math.abs(d.x / Math.max(half.x, 1e-4));
    const ay = Math.abs(d.y / Math.max(half.y, 1e-4));
    const az = Math.abs(d.z / Math.max(half.z, 1e-4));
    const n = new (p.constructor)(0, 0, 0);
    if (ax >= ay && ax >= az) n.x = Math.sign(d.x) || 1;
    else if (ay >= az) n.y = Math.sign(d.y) || 1;
    else n.z = Math.sign(d.z) || 1;
    return { point: p, normal: n, dist: best, tag: hitBox.tag };
  }

  /** Hauteur du sol sous (x,z) — -Infinity si rien. */
  groundAt(x, z, fromY) {
    let best = -Infinity;
    for (const b of this.boxes) {
      if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) continue;
      if (b.max.y <= fromY + 0.35 && b.max.y > best) best = b.max.y;
    }
    return best;
  }

  /** true si la boîte du joueur (capsule approximée) touche un solide. */
  intersects(cx, cy, cz, r, h, skipTag) {
    for (const b of this.boxes) {
      if (skipTag && b.tag === skipTag) continue;
      if (cx + r > b.min.x && cx - r < b.max.x &&
          cz + r > b.min.z && cz - r < b.max.z &&
          cy + h > b.min.y && cy < b.max.y) return b;
    }
    return null;
  }
}

/* Intersection rayon / AABB (slab method). null si pas d'impact. */
function rayBox(o, d, mn, mx) {
  let tmin = 0, tmax = Infinity;
  for (const ax of ['x', 'y', 'z']) {
    const inv = 1 / (d[ax] || 1e-9);
    let t1 = (mn[ax] - o[ax]) * inv;
    let t2 = (mx[ax] - o[ax]) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmax < tmin) return null;
  }
  return tmin;
}

/* ---------------------------------------------------------- runtime */
/**
 * @param {Object} o
 * @param {Object}  o.THREE   module three (injecté : éditeur = import map, export = inline)
 * @param {Object}  o.scene   scène three dans laquelle le runtime ajoute ses objets
 * @param {Element} o.canvas  canvas de rendu
 * @param {Object}  o.data    projet sérialisé { scene, objects[] }
 * @param {Object} [o.host]   adaptateur UI (HUD, overlays, toast) — optionnel
 * @param {Object} [o.renderer] réutilise un renderer existant (mode éditeur)
 */
export class KreoRuntime {
  constructor(o) {
    this.THREE = o.THREE;
    this.project = o.data || { scene: {}, objects: [] };
    this.data = this._activeLevel(this.project);
    this.levelIndex = 0;
    this.scene = o.scene || new this.THREE.Scene();
    this.canvas = o.canvas;
    this.host = o.host || null;

    this.renderer = o.renderer || new this.THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.camera = new this.THREE.PerspectiveCamera(75, 1, 0.05, 500);
    this.world = new AABBWorld();
    this.entities = new Map();       // id → record vivant
    this.running = false;
    this.time = 0;
    this.input = {};

    bindTextureGlobals(this.THREE);
    this._hooks = new Map();
    this.scriptErrors = 0;
    this.scriptLog = [];
    this._tmpV = new this.THREE.Vector3();
    this._ray = new this.THREE.Raycaster();

    this.state = {
      score: 0, health: 100, maxHealth: 100,
      ammo: 0, ammoMax: 0, weapon: null,
      won: false, lost: false, kills: 0, wave: 1
    };

    /* ---- combat ---- */
    this.enemies = [];        // IA vivante
    this.projectiles = [];    // projectiles en vol (ennemis)
    this.particles = [];      // impacts / traçantes
    this.hudFlash = 0;
    this.onFire = () => this._fire();   // branché par le HTML exporté

    /* Viewmodel : l'arme en main. Enfant de la caméra, rendue dans une passe
       séparée avec la profondeur nettoyée — sinon elle traverse les murs. */
    this.vm = new this.THREE.Group();
    this.vmScene = new this.THREE.Scene();
    this.recoilKick = 0;
    this.recoilRot = 0;
    this.bobT = 0;
    this._vmBuilt = false;

    /* Armes : données pures, donc modifiables par script. */
    this.weapons = {
      pistol: { id: 'pistol', name: 'Pistolet', damage: 26, rate: 0.24, mag: 12, reserve: 96, spread: 0.012, pellets: 1, recoil: 0.018, range: 140, auto: false },
      rifle: { id: 'rifle', name: 'Fusil', damage: 20, rate: 0.095, mag: 30, reserve: 180, spread: 0.016, pellets: 1, recoil: 0.011, range: 180, auto: true },
      shotgun: { id: 'shotgun', name: 'Fusil à pompe', damage: 12, rate: 0.8, mag: 6, reserve: 42, spread: 0.07, pellets: 9, recoil: 0.04, range: 60, auto: false }
    };
  }

  /** Un projet peut contenir plusieurs niveaux ; on ne joue que le premier. */
  _activeLevel(project) {
    if (Array.isArray(project.scenes) && project.scenes.length) {
      const i = Math.min(project.active || 0, project.scenes.length - 1);
      const lvl = project.scenes[i];
      if (lvl && lvl.data) return lvl.data;
    }
    return { scene: project.scene || {}, objects: project.objects || [] };
  }

  /** Charge un autre niveau du projet et relance le gameplay dessus. */
  loadLevel(i) {
    const project = this.project;
    if (!Array.isArray(project.scenes) || !project.scenes[i]) return false;
    const lvl = project.scenes[i];
    if (!lvl.data) return false;
    this.levelIndex = i;
    this.data = lvl.data;
    this.build();
    this.start();
    return true;
  }

  get levelCount() {
    return (this.project.scenes && this.project.scenes.length) || 1;
  }

  /* ---------- construction ---------- */
  /** Crée les objets de jeu depuis les données. Idempotent. */
  build() {
    const T = this.THREE;
    this.clear();
    const objects = this.data.objects || [];
    for (const p of objects) {
      const rec = this._makeRecord(p);
      if (rec) this.entities.set(p.id, rec);
    }
    this._rebuildWorld();
    this._spawnPlayer();
    this._spawnEnemies();
    this.projectiles.forEach((pr) => { if (pr.mesh.parent) pr.mesh.parent.remove(pr.mesh); });
    this.projectiles.length = 0;
    if (!this._vmBuilt) { this._buildViewmodel(); this._vmBuilt = true; }
    // arme de départ : la première posée dans la scène, sinon le pistolet
    const wRec = Array.from(this.entities.values()).find((r) => r.type === 'weapon');
    this.giveWeapon((wRec && wRec.def.weapon) || (wRec ? 'rifle' : 'pistol'));
    return this;
  }

  clear() {
    for (const rec of this.entities.values()) this._disposeRec(rec);
    this.entities.clear();
    this.world.clear();
  }

  _disposeRec(rec) {
    if (rec.root && rec.root.parent) rec.root.parent.remove(rec.root);
    if (rec.mixer) rec.mixer.stopAllAction();
    if (rec.ownedGeom) rec.ownedGeom.forEach((g) => g.dispose && g.dispose());
    if (rec.ownedMat) rec.ownedMat.forEach((m) => m.dispose && m.dispose());
  }

  _makeRecord(p) {
    const T = this.THREE;
    const g = new T.Group();
    const pos = p.position || [0, 0, 0];
    g.position.set(pos[0], pos[1], pos[2]);
    g.rotation.set(
      T.MathUtils.degToRad((p.rotation || [0, 0, 0])[0]),
      T.MathUtils.degToRad((p.rotation || [0, 0, 0])[1]),
      T.MathUtils.degToRad((p.rotation || [0, 0, 0])[2])
    );
    const sc = p.scale || [1, 1, 1];
    g.scale.set(sc[0], sc[1], sc[2]);
    g.visible = p.visible !== false;

    const rec = {
      id: p.id, type: p.type, name: p.name, def: p,
      root: g, ownedGeom: null, ownedMat: null,
      collidable: p.collidable !== false,
      tags: p.tags || [],
      alive: true, hp: p.hp != null ? p.hp : 100,
      script: p.script || null,
      mixer: null, actions: [], currentClip: null,
      states: null, stateName: null, stateTime: 0,
      sound: p.sound || null, soundTimer: 0
    };

    switch (p.type) {
      case 'cube':
      case 'sphere':
      case 'cylinder':
      case 'cone':
      case 'torus':
      case 'plane': g.add(this._primitive(p, rec)); break;
      case 'sun':
      case 'point': g.add(this._light(p, rec)); break;
      case 'model':
        g.add(this._modelPlaceholder(p, rec));
        if (p.modelData && T.GLTFLoader && p.modelData.slice(0, 4) === 'data') {
          // le modèle réel remplace le cube filaire dès qu'il est décodé
          try {
            new T.GLTFLoader().load(p.modelData, (gltf) => {
              while (g.children.length) g.remove(g.children[0]);
              const root = gltf.scene;
              root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
              g.add(root);
              if (gltf.animations && gltf.animations.length) {
                rec.clips = gltf.animations;
                rec.mixer = new T.AnimationMixer(root);
                this._initStates(rec);
              }
              this._rebuildWorld();
            }, undefined, () => {});
          } catch (e) { /* placeholder conservé */ }
        }
        break;
      case 'player':
      case 'coin':
      case 'goal':
      case 'pickup':
      case 'spawn':
      case 'weapon':
      case 'enemy':
      case 'cover':
        g.add(this._marker(p, rec));
        break;
      default: break;
    }

    if (rec.clips && rec.clips.length) this._initStates(rec);

    g.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    this.scene.add(g);
    return rec;
  }

  _mat(p) {
    const T = this.THREE;
    const m = p.material || {};
    const params = {
      color: new T.Color(m.color || '#8FA3C8'),
      metalness: m.metalness != null ? m.metalness : 0.08,
      roughness: m.roughness != null ? m.roughness : 0.62
    };
    if (m.emissive && m.emissive !== '#000000') params.emissive = new T.Color(m.emissive);
    if (m.opacity != null && m.opacity < 1) { params.transparent = true; params.opacity = m.opacity; }
    if (m.wireframe) params.wireframe = true;
    const mat = new T.MeshStandardMaterial(params);
    // textures : la propriété existe déjà dans les données, elle n'était
    // simplement jamais lue au chargement.
    if (m.texture && this.textureLib && this.textureLib[m.texture]) {
      mat.map = textureToThree(T, this.textureLib[m.texture]);
      const rep = m.uvScale || [1, 1];
      mat.map.repeat.set(rep[0], rep[1]);
    }
    return mat;
  }

  _primitive(p, rec) {
    const T = this.THREE;
    let geo;
    switch (p.type) {
      case 'sphere': geo = new T.SphereGeometry(1.2, 32, 24); break;
      case 'cylinder': geo = new T.CylinderGeometry(1, 1, 2, 32); break;
      case 'cone': geo = new T.ConeGeometry(1.2, 2.2, 32); break;
      case 'plane': geo = new T.BoxGeometry(16, 0.5, 16); break;
      case 'torus': geo = new T.TorusGeometry(1, 0.38, 20, 48); break;
      default: geo = new T.BoxGeometry(2, 2, 2);
    }
    const mesh = new T.Mesh(geo, this._mat(p));
    rec.ownedGeom = [geo];
    rec.ownedMat = [mesh.material];
    return mesh;
  }

  _light(p, rec) {
    const T = this.THREE;
    const l = p.light || {};
    let light;
    if (p.type === 'sun') {
      light = new T.DirectionalLight(new T.Color(l.color || '#FFF2DE'), l.intensity != null ? l.intensity : 2.2);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.camera.left = -40; light.shadow.camera.right = 40;
      light.shadow.camera.top = 40; light.shadow.camera.bottom = -40;
      light.shadow.bias = -0.0004;
      // la direction vient de la position de l'objet
      light.position.set(0.35, 1, 0.25).normalize().multiplyScalar(40);
    } else {
      light = new T.PointLight(new T.Color(l.color || '#FFD9A0'), l.intensity != null ? l.intensity : 60, l.distance || 45, 2);
    }
    rec.light = light;
    light.castShadow = p.type === 'point' ? false : light.castShadow;
    return light;
  }

  _marker(p, rec) {
    const T = this.THREE;
    const color = {
      player: 0x6D4AFF, coin: 0xF5C542, goal: 0x3ECF8E, pickup: 0x4FD1C5,
      spawn: 0xFF8A5C, weapon: 0x9AA7FF, enemy: 0xFF5C5C, cover: 0x6C7B94
    }[p.type] || 0xAAAAAA;
    const mat = new T.MeshStandardMaterial({
      color, metalness: 0.3, roughness: 0.5,
      emissive: new T.Color(color).multiplyScalar(0.25),
      transparent: true, opacity: p.type === 'player' || p.type === 'spawn' ? 0.0 : 0.85
    });
    let geo;
    if (p.type === 'player' || p.type === 'enemy') geo = new T.CapsuleGeometry(0.55, 1.05, 8, 18);
    else if (p.type === 'spawn') geo = new T.CylinderGeometry(0.9, 0.9, 0.08, 24);
    else geo = new T.OctahedronGeometry(0.6, 0);
    rec.ownedGeom = [geo];
    rec.ownedMat = [mat];
    return new T.Mesh(geo, mat);
  }

  /**
   * Machine à états d'animation : un clip = un état, nommé en minuscules.
   * Les scripts basculent avec setState('run'), setState('idle')…
   */
  _initStates(rec) {
    if (!rec.mixer || !rec.clips) return;
    rec.states = {};
    for (const clip of rec.clips) {
      const key = clip.name.toLowerCase();
      const action = rec.mixer.clipAction(clip);
      action.loop = this.THREE.LoopRepeat;
      // les clips de tir/saut ne bouclent pas
      if (/shot|fire|shoot|jump|hit|death|die|attack|throw/i.test(key)) {
        action.loop = this.THREE.LoopOnce;
        action.clampWhenFinished = true;
      }
      rec.states[key] = { clip: clip, action: action, loop: action.loop === this.THREE.LoopRepeat };
    }
    const first = rec.states.idle || rec.states[Object.keys(rec.states)[0]];
    if (first) {
      rec.stateName = first.clip.name.toLowerCase();
      first.action.reset().play();
    }
  }

  _modelPlaceholder(p, rec) {
    const T = this.THREE;
    const geo = new T.BoxGeometry(1.6, 1.6, 1.6);
    const mat = new T.MeshStandardMaterial({ color: 0x7DD3A0, wireframe: true });
    rec.ownedGeom = [geo];
    rec.ownedMat = [mat];
    return new T.Mesh(geo, mat);
  }

  /** Reconstruit la physique depuis les objets visibles et collisionnables. */
  _rebuildWorld() {
    const T = this.THREE;
    this.world.clear();
    const box = new T.Box3();
    for (const rec of this.entities.values()) {
      if (!rec.collidable || !rec.root.visible) continue;
      if (rec.type === 'player' || rec.type === 'coin' || rec.type === 'goal') continue;
      if (!rec.root.children.length) continue;
      box.setFromObject(rec.root);
      if (!isFinite(box.min.x) || !isFinite(box.max.x)) continue;
      this.world.add(box, rec.id);
    }
  }

  /* ---------- joueur ---------- */
  _spawnPlayer() {
    const T = this.THREE;
    let spawn = null;
    for (const rec of this.entities.values()) if (rec.type === 'spawn') { spawn = rec; break; }
    let player = null;
    for (const rec of this.entities.values()) if (rec.type === 'player') { player = rec; break; }

    const pos = spawn ? spawn.root.position.clone()
      : player ? player.root.position.clone()
        : new T.Vector3(0, 0, 12);

    this.player = {
      pos: pos.clone(),
      vel: new T.Vector3(),
      yaw: 0,
      pitch: 0,
      grounded: false,
      height: 1.75,
      radius: 0.4,
      eye: 1.62,
      walkSpeed: 6.2,
      runSpeed: 9.4,
      speedXZ: 0,
      coyote: 0,
      sliding: false,
      slideT: 0,
      crouched: false,
      jumpSpeed: 8.4,
      gravity: 24,
      record: player
    };
    if (player) player.root.visible = false;   // en 1re personne, le corps n'est pas visible
  }

  /* ---------- boucle ---------- */
  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._compile();
    this._runHooks('onStart');
    if (this.host && this.host.onHud) this.host.onHud(this.state);
    const loop = (now) => {
      if (!this.running) return;
      // L'horodatage de la première image peut précéder `_last` (origine de
      // temps différente) : un dt négatif inverse la gravité et fait décoller
      // le joueur. On borne des deux côtés.
      const raw = (now - this._last) / 1000;
      const dt = Math.max(0, Math.min(0.05, isFinite(raw) ? raw : 0));
      this._last = now;
      this.update(dt);
      this.requestFrame = requestAnimationFrame(loop);
    };
    this.requestFrame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.requestFrame) cancelAnimationFrame(this.requestFrame);
  }

  dispose() {
    this.stop();
    this.clear();
  }

  resize(w, h, pr) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pr || 1);
    this.renderer.setSize(w, h, false);
  }

  update(dt) {
    this.time += dt;
    if (this.state.won || this.state.lost) { this._render(); return; }
    this._updatePlayer(dt);
    this._updateViewmodel(dt);
    this._updateEntities(dt);
    this._updateObjectSounds(dt);
    this._updateCombat(dt);
    this._runHooks('onUpdate', dt);
    this._render();
  }

  _updatePlayer(dt) {
    const p = this.player;
    const inp = this.input;

    /* ---------- regard ---------- */
    if (inp.lookX) p.yaw -= inp.lookX;
    if (inp.lookY) p.pitch = clamp(p.pitch - inp.lookY, -1.45, 1.45);
    inp.lookX = 0; inp.lookY = 0;

    /* ---------- posture : debout / accroupi / glissade ---------- */
    const wasCrouched = p.crouched;
    const wantCrouch = !!inp.crouch;
    if (wantCrouch && !p.crouched && p.grounded && p.speedXZ > p.runSpeed * 0.8 && !p.sliding) {
      // glissade : on conserve l'élan, on s'accroupit
      p.sliding = true;
      p.slideT = 0.62;
      p.slideDir = new this.THREE.Vector3(p.vel.x, 0, p.vel.z).normalize();
      this.sfx('slide');
      if (this.host && this.host.onSlide) this.host.onSlide();
    }
    p.crouched = wantCrouch;
    if (p.sliding) {
      p.slideT -= dt;
      if (p.slideT <= 0 || !p.crouched) { p.sliding = false; }
    }
    const targetEye = p.crouched ? 1.12 : 1.62;
    p.eye += (targetEye - p.eye) * Math.min(1, dt * 12);
    p.height = p.crouched ? 1.25 : 1.75;
    if (wasCrouched !== p.crouched && this.host && this.host.onHud) this.host.onHud(this.state);

    /* ---------- déplacement relatif à la caméra ---------- */
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    let mf = 0, ms = 0;
    if (inp.forward) mf += 1;
    if (inp.back) mf -= 1;
    if (inp.right) ms += 1;
    if (inp.left) ms -= 1;
    const len = Math.hypot(mf, ms) || 1;
    mf /= len; ms /= len;

    let speed = (inp.run && !p.crouched ? p.runSpeed : p.walkSpeed);
    if (p.crouched) speed *= 0.52;
    if (inp.ads) speed *= 0.62;
    if (p.sliding) speed = p.runSpeed * 1.22;

    const wishX = (fx * mf + rx * ms) * speed;
    const wishZ = (fz * mf + rz * ms) * speed;

    // accélération : plus faible en l'air, très faible en glissade (l'élan prime)
    const accel = p.sliding ? 1.4 : (p.grounded ? 16 : 4);
    if (!p.sliding) {
      p.vel.x += (wishX - p.vel.x) * Math.min(1, dt * accel);
      p.vel.z += (wishZ - p.vel.z) * Math.min(1, dt * accel);
    } else {
      // friction de glissade
      const f = Math.pow(0.12, dt);
      p.vel.x *= f; p.vel.z *= f;
    }

    /* ---------- saut (avec coyote time) ---------- */
    if (p.grounded) p.coyote = 0.12; else p.coyote = Math.max(0, p.coyote - dt);
    if (inp.jump && p.coyote > 0) {
      p.vel.y = p.jumpSpeed;
      p.grounded = false;
      p.coyote = 0;
      this.sfx('jump');
      if (this.host && this.host.onJump) this.host.onJump();
    }
    p.vel.y = Math.max(-60, p.vel.y - p.gravity * dt);

    /* ---------- collisions : balayage par axe + pentes ---------- */
    const r = p.radius, h = p.height;
    const old = p.pos.clone();
    let collidedX = false, collidedZ = false;

    p.pos.x += p.vel.x * dt;
    if (this.world.intersects(p.pos.x, p.pos.y, p.pos.z, r, h)) {
      // tentative de montée de marche (10 cm) : c'est ce qui permet de passer
      // un rebord sans rester bloqué, indispensable sur une carte à couloirs
      if (!this._tryStep(p, 0.32)) { p.pos.x = old.x; p.vel.x = 0; collidedX = true; }
    }
    p.pos.z += p.vel.z * dt;
    if (this.world.intersects(p.pos.x, p.pos.y, p.pos.z, r, h)) {
      if (!this._tryStep(p, 0.32)) { p.pos.z = old.z; p.vel.z = 0; collidedZ = true; }
    }

    p.pos.y += p.vel.y * dt;
    p.grounded = false;
    if (this.world.intersects(p.pos.x, p.pos.y, p.pos.z, r, h)) {
      p.pos.y = old.y;
      if (p.vel.y <= 0) p.grounded = true;
      p.vel.y = 0;
    }

    // sol : on cherche la surface la plus haute sous les pieds
    const ground = this.world.groundAt(p.pos.x, p.pos.z, p.pos.y);
    if (ground > -Infinity && p.pos.y <= ground + 0.06) {
      p.pos.y = ground;
      if (p.vel.y <= 0) { p.vel.y = 0; p.grounded = true; }
    } else if (p.pos.y <= 0) {
      p.pos.y = 0;
      if (p.vel.y <= 0) { p.vel.y = 0; p.grounded = true; }
    }

    // marche : franchissement de petits obstacles (rebords, bordures)
    if (p.grounded && (collidedX || collidedZ)) {
      // rien de plus : le _tryStep a déjà tenté la montée sur l'axe concerné
    }

    /* ---------- vitesse horizontale courante (pour la glissade / le bob) ---------- */
    p.speedXZ = Math.hypot(p.vel.x, p.vel.z);

    /* ---------- chute hors carte ---------- */
    if (p.pos.y < -40) this._damage(999);

    /* ---------- caméra première personne ---------- */
    const shake = (this.damageFlash || 0) * 0.035;
    // inclinaison en glissade
    const roll = p.sliding ? -0.06 : 0;
    this.camera.position.set(
      p.pos.x + (Math.random() - 0.5) * shake,
      p.pos.y + p.eye + (Math.random() - 0.5) * shake,
      p.pos.z
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(p.pitch, p.yaw, roll + (Math.random() - 0.5) * shake * 0.6);
  }

  /**
   * Franchissement de marche : si monter de `step` dégage le joueur, on le
   * pose sur la surface. Évite de rester coincé sur un rebord de 10 cm, le
   * défaut classique des collisions purement AABB.
   */
  _tryStep(p, step) {
    const y0 = p.pos.y;
    for (let dy = 0.06; dy <= step; dy += 0.06) {
      if (!this.world.intersects(p.pos.x, y0 + dy, p.pos.z, p.radius, p.height)) {
        p.pos.y = y0 + dy;
        return true;
      }
    }
    return false;
  }

  _updateEntities(dt) {
    for (const rec of this.entities.values()) {
      if (rec.mixer) rec.mixer.update(dt);
      if (rec.type === 'coin') rec.root.rotation.y += dt * 2.4;
      if (rec.type === 'goal') rec.root.rotation.y += dt * 0.9;
    }
  }

  /* ---------- viewmodel (arme en main) ---------- */
  _buildViewmodel() {
    const T = this.THREE;
    const cam = this.camera;
    const vm = this.vm;
    // Position écran : en bas à droite, à 58° de FOV dédié.
    vm.position.set(0.19, -0.20, -0.55);
    vm.scale.setScalar(0.95);
    cam.add(vm);
    this.scene.add(cam);        // la caméra doit être dans le graphe pour le viewmodel

    // lumières du calque : studio indépendant de la scène
    this.vmScene.add(new T.HemisphereLight(0xB8CCE8, 0x2A2E36, 1.7));
    const key = new T.DirectionalLight(0xFFF0DC, 2.6);
    key.position.set(-1.1, 1.1, 1.0);
    this.vmScene.add(key);
    const rim = new T.DirectionalLight(0xBBD0F0, 1.8);
    rim.position.set(1.5, 0.5, 0.7);
    this.vmScene.add(rim);
    this.vmFlash = new T.PointLight(0xFFC878, 0, 3, 2);
    this.vmFlash.position.set(0.1, 0.02, -0.5);
    this.vmScene.add(this.vmFlash);

    // caméra du calque : même pose, FOV plus étroit
    this.vmCamera = new T.PerspectiveCamera(58, 16 / 9, 0.01, 6);

    // matériaux
    const grain = typeof makeNoiseTexture === 'function' ? makeNoiseTexture(T, 64, 3, 0.55) : null;
    const makeMat = (color, rough, metal, glow) => {
      const c = new T.Color(color);
      const m = new T.MeshStandardMaterial({
        color: c, roughness: rough, metalness: metal,
        emissive: c, emissiveIntensity: glow
      });
      if (grain) m.roughnessMap = grain;
      return m;
    };
    const steel = makeMat(0x6E747D, 0.5, 0.45, 0.30);
    const poly = makeMat(0x282C33, 0.66, 0.35, 0.34);
    const grip = makeMat(0x1C1F25, 0.95, 0.0, 0.36);
    const accent = new T.MeshStandardMaterial({ color: 0x2FD8FF, emissive: 0x1E9FC0, emissiveIntensity: 0.7, roughness: 0.4 });

    const add = (geo, material, x, y, z, rx) => {
      const m = new T.Mesh(geo, material);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      vm.add(m);
      return m;
    };

    // --- pistolet
    this.vmModels = {};
    const pistol = new T.Group();
    {
      const b = (w, h, d, mat, x, y, z, rx) => {
        const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        if (rx) m.rotation.x = rx;
        pistol.add(m);
        return m;
      };
      b(0.040, 0.050, 0.215, poly, 0, -0.004, -0.085);
      b(0.046, 0.032, 0.230, steel, 0, 0.030, -0.090);
      b(0.042, 0.014, 0.226, poly, 0, 0.048, -0.090);
      b(0.010, 0.012, 0.010, accent, 0, 0.058, -0.196);
      const guard = new T.Mesh(new T.TorusGeometry(0.019, 0.0055, 8, 14, Math.PI * 1.5), poly);
      guard.position.set(0, -0.030, -0.048);
      guard.rotation.set(Math.PI / 2, 0, -Math.PI * 0.75);
      pistol.add(guard);
      b(0.007, 0.022, 0.009, grip, 0, -0.034, -0.040);
      b(0.044, 0.115, 0.058, grip, 0, -0.078, 0.014, 0.28);
      b(0.0145, 0.0145, 0.055, poly, 0, 0.010, -0.212, Math.PI / 2);
    }
    this.vmModels.pistol = pistol;

    // --- fusil
    const rifle = new T.Group();
    {
      const b = (w, h, d, mat, x, y, z, rx) => {
        const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        if (rx) m.rotation.x = rx;
        rifle.add(m);
        return m;
      };
      b(0.055, 0.085, 0.44, steel, 0, 0, -0.16);
      const barrel = new T.Mesh(new T.CylinderGeometry(0.016, 0.016, 0.26, 10), poly);
      barrel.position.set(0, 0.02, -0.50);
      barrel.rotation.x = Math.PI / 2;
      rifle.add(barrel);
      b(0.040, 0.100, 0.062, grip, 0, -0.145, -0.055, 0.18);
      b(0.042, 0.115, 0.055, grip, 0, -0.105, 0.030, 0.34);
      b(0.050, 0.075, 0.120, poly, 0, -0.010, 0.130);
      const scope = new T.Mesh(new T.CylinderGeometry(0.021, 0.021, 0.12, 10), poly);
      scope.position.set(0, 0.085, -0.18);
      scope.rotation.x = Math.PI / 2;
      rifle.add(scope);
      b(0.020, 0.012, 0.070, accent, 0, 0.062, -0.28);
    }
    this.vmModels.rifle = rifle;

    // --- fusil à pompe
    const shotgun = new T.Group();
    {
      const b = (w, h, d, mat, x, y, z, rx) => {
        const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        if (rx) m.rotation.x = rx;
        shotgun.add(m);
        return m;
      };
      b(0.075, 0.105, 0.52, steel, 0, 0, -0.18);
      const tube = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 0.30, 10), poly);
      tube.position.set(0, 0.032, -0.52);
      tube.rotation.x = Math.PI / 2;
      shotgun.add(tube);
      b(0.060, 0.055, 0.160, grip, 0, -0.062, -0.32);
      b(0.055, 0.110, 0.080, grip, 0, -0.085, 0.060, 0.2);
      b(0.020, 0.012, 0.060, accent, 0, 0.070, -0.30);
    }
    this.vmModels.shotgun = shotgun;

    // --- bras droit
    const armMat = makeMat(0x2A3648, 0.95, 0.0, 0.30);
    const gloveMat = makeMat(0x22262D, 0.9, 0.02, 0.32);
    const arm = new T.Group();
    {
      const wrist = new T.Vector3(0.052, -0.130, 0.01);
      const end = new T.Vector3(0.115, -0.62, 0.03);
      const dir = end.clone().sub(wrist);
      const len = dir.length();
      const limb = new T.Mesh(new T.CylinderGeometry(0.045, 0.058, len, 12), armMat);
      limb.position.copy(wrist).addScaledVector(dir, 0.5);
      limb.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
      arm.add(limb);
      const hand = new T.Mesh(new T.BoxGeometry(0.056, 0.09, 0.078), gloveMat);
      hand.position.set(0.008, -0.088, -0.005);
      hand.rotation.set(0.22, 0.05, -0.06);
      arm.add(hand);
    }
    this.vmArm = arm;

    // tout est ajouté dans la scène du calque via la caméra (voir plus bas)
    vm.add(arm);
    for (const k of Object.keys(this.vmModels)) {
      const g = this.vmModels[k];
      g.visible = false;
      vm.add(g);
    }

    this._selectViewmodel();
  }

  _selectViewmodel() {
    const w = this.state.weapon;
    const key = w ? w.id : 'pistol';
    for (const k of Object.keys(this.vmModels)) this.vmModels[k].visible = (k === key);
  }

  _updateViewmodel(dt) {
    const vm = this.vm;
    const p = this.player;
    // balancement : fonction de la vitesse au sol
    const speed = Math.hypot(p.vel.x, p.vel.z);
    this.bobT += dt * (2.2 + speed * 1.1);
    const bobAmp = Math.min(1, speed / p.runSpeed) * 0.012 * (this.input.ads ? 0.35 : 1);
    // recul : décroît vite, revient à zéro
    this.recoilKick *= Math.pow(0.0015, dt);
    this.recoilRot *= Math.pow(0.0015, dt);
    const ads = this.input.ads ? 1 : 0;
    const baseX = 0.19 * (1 - ads);
    const baseY = -0.062 + (-0.20 + 0.062) * (1 - ads);
    const baseZ = -0.48 + (-0.55 + 0.48) * (1 - ads);
    vm.position.set(
      baseX + Math.sin(this.bobT) * bobAmp,
      baseY + Math.cos(this.bobT * 2) * bobAmp * 0.8,
      baseZ + this.recoilKick
    );
    vm.rotation.set(-this.recoilRot, 0.02, -0.03);
    // le point lumineux suit le recul
    this.vmFlash.intensity *= Math.pow(0.002, dt);
    // FOV accordé à la visée
    const targetFov = 76 - ads * 16;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
    this.camera.updateProjectionMatrix();
  }

  /** Rend la scène, puis l'arme en main par-dessus (profondeur nettoyée). */
  /* ---------- post-traitement ----------
     Le jeu se rend dans une cible hors écran (scène puis viewmodel), et une
     dernière passe plein écran applique étalonnage, vignette, grain et
     aberration chromatique. Coût : un quad, négligeable. */
  _initPost() {
    const T = this.THREE;
    const size = this.renderer.getDrawingBufferSize(new T.Vector2());
    this._postRT = new T.WebGLRenderTarget(size.x, size.y, {
      minFilter: T.LinearFilter, magFilter: T.LinearFilter,
      type: T.HalfFloatType, format: T.RGBAFormat
    });
    this._postRT.texture.colorSpace = T.LinearSRGBColorSpace;
    this._postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._postScene = new T.Scene();
    this._postMat = new T.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this._postRT.texture },
        uTime: { value: 0 },
        uDamage: { value: 0 },
        uVignette: { value: 0.32 },
        uGrain: { value: 0.035 },
        uAberr: { value: 0.0016 },
        uSat: { value: 1.06 },
        uContrast: { value: 1.04 },
        uExposure: { value: 1.08 },
        uRes: { value: new T.Vector2(size.x, size.y) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform float uTime, uDamage, uVignette, uGrain, uAberr, uSat, uContrast, uExposure;
        uniform vec2 uRes;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        // ACES filmique (approximation de Narkowicz) : indispensable ici,
        // three ne l'applique pas quand la scène est rendue dans une cible.
        vec3 aces(vec3 x) {
          return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
        }
        vec3 toSRGB(vec3 c) {
          return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        }

        void main() {
          vec2 uv = vUv;
          vec2 d = uv - 0.5;
          float r2 = dot(d, d);
          float ab = uAberr * (1.0 + uDamage * 3.0) * (0.35 + r2 * 2.0);
          vec3 col;
          col.r = texture2D(tDiffuse, uv + d * ab).r;
          col.g = texture2D(tDiffuse, uv).g;
          col.b = texture2D(tDiffuse, uv - d * ab).b;

          col *= uExposure;
          col = aces(col);
          col = toSRGB(col);

          // étalonnage
          float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(lum), col, uSat);
          col = (col - 0.5) * uContrast + 0.5;

          // vignette
          float vig = smoothstep(0.95, 0.22, r2 * (1.0 + uDamage * 1.6));
          col *= mix(1.0, vig, uVignette + uDamage * 0.45);

          // flash rouge à l'impact
          col = mix(col, vec3(0.55, 0.04, 0.03), uDamage * 0.28);

          // grain animé
          float g = hash(uv * uRes + fract(uTime) * 91.7) - 0.5;
          col += g * uGrain;

          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `,
      depthTest: false, depthWrite: false
    });
    const quad = new T.Mesh(new T.PlaneGeometry(2, 2), this._postMat);
    quad.frustumCulled = false;
    this._postQuad = quad;
    this._postScene.add(quad);
    this.post = true;
  }

  setPostQuality(level) {
    if (!this._postMat) return;
    const q = Math.max(0, Math.min(2, level | 0));
    this._postMat.uniforms.uGrain.value = q === 0 ? 0 : 0.035;
    this._postMat.uniforms.uAberr.value = q === 0 ? 0 : 0.0016;
    this._postMat.uniforms.uVignette.value = q === 0 ? 0 : 0.32;
  }

  _renderPost() {
    const r = this.renderer;
    const T = this.THREE;
    const size = r.getDrawingBufferSize(new T.Vector2());
    if (this._postRT.width !== size.x || this._postRT.height !== size.y) {
      this._postRT.setSize(size.x, size.y);
      this._postMat.uniforms.uRes.value.set(size.x, size.y);
    }
    const u = this._postMat.uniforms;
    u.uTime.value = this._now || 0;
    u.uExposure.value = this.renderer.toneMappingExposure || 1.0;
    u.uDamage.value = Math.min(1, this.damageFlash || 0);
    // passe 1 : scène dans la cible
    r.setRenderTarget(this._postRT);
    r.clear();
    const vmVisible = this.vm.visible;
    this.vm.visible = false;
    r.render(this.scene, this.camera);
    this.vm.visible = vmVisible;
    // passe 2 : viewmodel par-dessus, même cible
    if (this.vm.visible && this.vmScene) this._renderViewmodel();
    // passe 3 : quad plein écran
    r.setRenderTarget(null);
    r.clear();
    r.render(this._postScene, this._postCam);
  }

  _render() {
    const r = this.renderer;
    if (this.post === undefined) {
      this.post = this.host && this.host.postFx === false ? false : true;
    }
    if (this.post) {
      if (!this._postRT) this._initPost();
      if (this._postRT) { this._renderPost(); return; }
    }
    r.setRenderTarget(null);
    // la caméra est dans la scène à cause du viewmodel : on la retire
    // temporairement du rendu principal en masquant ses enfants
    const vmVisible = this.vm.visible;
    this.vm.visible = false;
    r.render(this.scene, this.camera);
    this.vm.visible = vmVisible;

    if (this.vm.visible && this.vmScene) this._renderViewmodel();
  }

  /** Deuxième passe : l'arme, sans effacer la couleur déjà rendue. */
  _renderViewmodel() {
    const r = this.renderer;
    {
      // caméra du calque : même pose, FOV plus étroit
      const c = this.camera;
      const vc = this.vmCamera;
      vc.position.copy(c.position);
      vc.quaternion.copy(c.quaternion);
      vc.aspect = c.aspect;
      vc.fov = 58;
      vc.updateProjectionMatrix();
      vc.updateMatrixWorld(true);
      vc.matrixWorldInverse.copy(vc.matrixWorld).invert();
      // le viewmodel est enfant de la caméra du jeu : on le détache
      // logiquement en annulant la transformation de la caméra
      this.vmRoot = this.vmRoot || new this.THREE.Group();
      if (this.vm.parent !== this.vmRoot) {
        this.vmRoot.add(this.vm);
        this.vmScene.add(this.vmRoot);
      }
      this.vmRoot.position.copy(c.position);
      this.vmRoot.quaternion.copy(c.quaternion);
      this.vmRoot.updateMatrixWorld(true);
      const prevAuto = r.autoClear;
      r.autoClear = false;
      r.clearDepth();
      r.render(this.vmScene, vc);
      r.autoClear = prevAuto;
    }
  }

  /* ---------- audio procédural ----------
     Aucun asset à charger : tout est synthétisé. Un jeu exporté doit sonner
     correctement sans dépendre de fichiers externes. */
  initAudio() {
    if (this._audio) return this._audio;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ac = new AC();
      this._audio = ac;
      // bus de sortie + réverbération courte (IR générée)
      const master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 6; comp.knee.value = 12;
      comp.connect(master);
      this._bus = comp;
      const len = Math.floor(ac.sampleRate * 1.1);
      const ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
        }
      }
      const verb = ac.createConvolver();
      verb.buffer = ir;
      const wet = ac.createGain();
      wet.gain.value = 0.22;
      verb.connect(wet); wet.connect(comp);
      this._verb = verb;
      return ac;
    } catch (e) { return null; }
  }

  _tone(freq, dur, type, vol, slideTo, when, dest) {
    const ac = this._audio;
    if (!ac) return;
    const t0 = (when || ac.currentTime);
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest || this._bus);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  _noise(dur, vol, filterHz, when) {
    const ac = this._audio;
    if (!ac) return;
    const t0 = when || ac.currentTime;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterHz || 2400;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this._bus);
    if (this._verb) { const v = ac.createGain(); v.gain.value = 0.5; g.connect(v); v.connect(this._verb); }
    src.start(t0);
  }

  sfx(kind) {
    const ac = this.initAudio();
    if (!ac || this.muted) return;
    const scale = this._gainScale == null ? 1 : this._gainScale;
    const bus = this._bus;
    if (scale !== 1) {
      // gain temporaire pour l'atténuation de distance
      const g = ac.createGain();
      g.gain.value = scale;
      g.connect(bus);
      this._bus = g;
    }
    try { this._sfxKind(kind, ac); }
    finally { this._bus = bus; }
  }

  _sfxKind(kind, ac) {
    if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime;
    switch (kind) {
      case 'shot': this._noise(0.09, 0.32, 5200); this._tone(180, 0.07, 'square', 0.16, 60); break;
      case 'shotHeavy': this._noise(0.16, 0.4, 3600); this._tone(120, 0.14, 'sawtooth', 0.18, 42); break;
      case 'hit': this._tone(880, 0.05, 'square', 0.12, 1500); break;
      case 'kill': this._tone(660, 0.07, 'triangle', 0.14); this._tone(990, 0.09, 'triangle', 0.12, 1200, t + 0.07); break;
      case 'hurt': this._noise(0.12, 0.22, 900); this._tone(140, 0.16, 'sawtooth', 0.16, 60); break;
      case 'pickup': this._tone(880, 0.06, 'triangle', 0.14); this._tone(1320, 0.09, 'triangle', 0.12, 1600, t + 0.06); break;
      case 'reload': this._noise(0.05, 0.14, 1800); this._noise(0.06, 0.12, 1400, t + 0.18); break;
      case 'jump': this._tone(300, 0.09, 'sine', 0.09, 480); break;
      case 'slide': this._noise(0.28, 0.16, 700); break;
      case 'enemyShot': this._tone(420, 0.1, 'sawtooth', 0.07, 180); break;
      case 'alarm': this._tone(880, 0.22, 'square', 0.09, 660); break;
      case 'fire': this._noise(0.22, 0.1, 1200); break;
      case 'water': this._noise(0.3, 0.07, 700); break;
      case 'machine': this._tone(150, 0.2, 'sawtooth', 0.06, 120); break;
      case 'wind': this._noise(0.6, 0.05, 480); break;
      case 'beep': this._tone(1400, 0.05, 'square', 0.06); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.16, 'triangle', 0.14, null, t + i * 0.1)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.2, 'sawtooth', 0.12, null, t + i * 0.12)); break;
      default: break;
    }
  }

  /**
   * Sons attachés aux objets : un objet peut porter un son d'ambiance ou de
   * boucle, joué au plus près du joueur pour l'atténuation.
   */
  _updateObjectSounds(dt) {
    if (!this.player) return;
    for (const rec of this.entities.values()) {
      if (!rec.sound) continue;
      const snd = rec.sound;
      if (!snd.kind || snd.kind === 'none') continue;
      rec.soundTimer -= dt;
      if (rec.soundTimer > 0) continue;
      const every = Math.max(0.2, Number(snd.every) || 2);
      rec.soundTimer = every;
      const d = rec.root.position.distanceTo(this.player.pos);
      const range = Number(snd.range) || 18;
      if (d > range) continue;
      const gain = Math.pow(1 - d / range, 2);
      if (gain < 0.02) continue;
      this.sfxAt(snd.kind, gain);
    }
  }

  /** Joue un effet avec un volume relatif (atténuation de distance). */
  sfxAt(kind, gain) {
    const ac = this.initAudio();
    if (!ac || this.muted) return;
    const saved = this._gainScale;
    this._gainScale = (saved == null ? 1 : saved) * Math.max(0, Math.min(1, gain));
    this.sfx(kind);
    this._gainScale = saved;
  }

  /* ---------- combat ---------- */
  /** Équipe une arme (par id du catalogue ou objet complet). */
  giveWeapon(id) {
    const w = typeof id === 'string' ? this.weapons[id] : id;
    if (!w) return null;
    this.state.weapon = w;
    this.state.ammo = w.mag;
    this.state.ammoMax = w.mag;
    this._selectViewmodel();
    if (this.host && this.host.onHud) this.host.onHud(this.state);
    return w;
  }

  /** Tir : hitscan + dispersion + recul. Appelé par le clic ou par un script. */
  _fire() {
    if (!this.running || this.state.won || this.state.lost) return null;
    const w = this.state.weapon;
    if (!w) return null;
    const now = this.time;
    if (this._nextShot && now < this._nextShot) return null;
    if (this.state.ammo <= 0) { this.reload(); return null; }
    this._nextShot = now + w.rate;
    this.state.ammo--;

    const p = this.player;
    const T = this.THREE;
    const origin = new T.Vector3(p.pos.x, p.pos.y + p.eye, p.pos.z);
    const base = new T.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
    let bestHit = null;

    for (let i = 0; i < w.pellets; i++) {
      const dir = base.clone();
      // dispersion : petit cône aléatoire
      const sp = w.spread * (this.input.ads ? 0.55 : 1);
      dir.x += (Math.random() - 0.5) * sp * 2;
      dir.y += (Math.random() - 0.5) * sp * 2;
      dir.z += (Math.random() - 0.5) * sp * 2;
      dir.normalize();

      const worldHit = this.world.raycastHit(origin, dir, w.range);
      const enemyHit = this._rayEnemies(origin, dir, worldHit ? worldHit.dist : w.range);
      if (enemyHit && (!worldHit || enemyHit.dist < worldHit.dist)) {
        enemyHit.enemy.hp -= w.damage;
        enemyHit.enemy.hurtT = 0.18;
        if (!bestHit) bestHit = { point: enemyHit.point, enemy: enemyHit.enemy };
        if (enemyHit.enemy.hp <= 0) this.kill(enemyHit.enemy.id); else this.sfx('hit');
        this._spawnImpact(enemyHit.point, null, 0xFFCF6A);
      } else if (worldHit) {
        if (!bestHit) bestHit = { point: worldHit.point };
        this._spawnImpact(worldHit.point, worldHit.normal, 0xCFE0FF);
      }
      if (!this._lastRay || this._lastRay.frame !== this.time) {
        this._lastRayInfo(!!(worldHit || enemyHit),
          enemyHit && (!worldHit || enemyHit.dist < worldHit.dist) ? enemyHit.dist
            : (worldHit ? worldHit.dist : 0),
          worldHit ? worldHit.tag : (enemyHit ? 'ennemi' : null));
        this._lastRay.frame = this.time;
      }
    }

    // recul caméra
    p.pitch = clamp(p.pitch + w.recoil * (0.7 + Math.random() * 0.6), -1.45, 1.45);
    p.yaw += (Math.random() - 0.5) * w.recoil * 0.7;
    this.recoilKick = Math.min(0.075, 0.02 + w.recoil * 1.6);
    this.recoilRot = Math.min(0.30, 0.08 + w.recoil * 4);
    this.vmFlash.intensity = 26;
    this.sfx(this.state.weapon && this.state.weapon.id === 'shotgun' ? 'shotHeavy' : 'shot');
    if (this.host && this.host.onHud) this.host.onHud(this.state);
    if (this.host && this.host.onShot) this.host.onShot(w);
    return bestHit;
  }

  reload() {
    const w = this.state.weapon;
    if (!w || this._reloading) return;
    this._reloading = true;
    this.sfx('reload');
    setTimeout(() => {
      this.state.ammo = w.mag;
      this._reloading = false;
      if (this.host && this.host.onHud) this.host.onHud(this.state);
    }, 900);
  }

  _lastRayInfo(hit, dist, tag) {
    this._lastRay = { hit: !!hit, dist: dist || 0, tag: tag || null };
  }

  _rayEnemies(origin, dir, maxDist) {
    const T = this.THREE;
    let best = null;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const c = e.root.position.clone();
      c.y += e.height * 0.55;
      // sphère englobante pour la précision du tir
      const toC = c.clone().sub(origin);
      const along = toC.dot(dir);
      if (along < 0 || along > maxDist) continue;
      const perp = toC.clone().addScaledVector(dir, -along).length();
      if (perp > e.radius) continue;
      if (!best || along < best.dist) {
        best = { enemy: e, dist: along, point: origin.clone().addScaledVector(dir, along) };
      }
    }
    return best;
  }

  _spawnImpact(point, normal, color) {
    if (!this.host || !this.host.onImpact) return;
    this.host.onImpact(point, normal, color);
  }

  _spawnEnemies() {
    const T = this.THREE;
    this.enemies = [];
    for (const rec of this.entities.values()) {
      if (rec.type !== 'enemy') continue;
      this.enemies.push({
        id: rec.id, root: rec.root, hp: rec.hp,
        maxHp: rec.def.hp || 100,
        speed: rec.def.speed || 2.6,
        radius: 0.75,
        height: rec.def.attackRange ? 2.2 : 2.0,
        attackRange: rec.def.attackRange || 26,
        damage: rec.def.damage || 8,
        cooldown: 1.1 + Math.random() * 0.8,
        alive: true, hurtT: 0,
        patrolA: rec.root.position.clone(),
        patrolT: Math.random() * 6,
        state: 'seek'
      });
    }
  }

  _updateCombat(dt) {
    const T = this.THREE;
    const p = this.player;
    const eye = new T.Vector3(p.pos.x, p.pos.y + p.eye, p.pos.z);

    // --- ennemis : poursuite + tir à distance
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.patrolT += dt;
      const toP = eye.clone().sub(e.root.position).setY(0);
      const dist = toP.length();
      toP.normalize();

      // regard vers le joueur
      const targetYaw = Math.atan2(toP.x, toP.z);
      let diff = targetYaw - e.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      e.root.rotation.y += diff * Math.min(1, dt * 4);

      // avance jusqu'à la distance de tir, puis tient la position
      if (dist > e.attackRange * 0.7) {
        const step = e.speed * dt;
        const nx = e.root.position.x + toP.x * step;
        const nz = e.root.position.z + toP.z * step;
        if (!this.world.intersects(nx, e.root.position.y, nz, 0.5, 1.8)) {
          e.root.position.x = nx;
          e.root.position.z = nz;
        }
      }

      // tir
      e.cooldown -= dt;
      const hasLOS = !this.world.raycast(e.root.position.clone().setY(e.root.position.y + 1.4), toP, dist - 1);
      if (e.cooldown <= 0 && dist < e.attackRange && hasLOS) {
        e.cooldown = 1.4 + Math.random() * 1.1;
        this._enemyShot(e, eye);
      }
      if (e.hurtT > 0) {
        e.hurtT -= dt;
        if (e.root.children[0] && e.root.children[0].material) {
          e.root.children[0].material.emissiveIntensity = 0.3 + e.hurtT * 6;
        }
      }
    }

    // --- projectiles ennemis (boules lentes, esquivables)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.mesh.position.addScaledVector(pr.dir, pr.speed * dt);
      const d = pr.mesh.position.distanceTo(eye);
      const hitWorld = this.world.raycast(pr.mesh.position, pr.dir, 0.6);
      if (d < 0.85) {
        this._damage(pr.damage);
        this._spawnImpact(pr.mesh.position, null, 0xFF6B6B);
        this._removeProjectile(i);
      } else if (hitWorld || pr.life <= 0) {
        this._spawnImpact(pr.mesh.position, null, 0xFF6B6B);
        this._removeProjectile(i);
      }
    }

    // --- particules d'impact
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pa = this.particles[i];
      pa.life -= dt;
      if (pa.life <= 0) {
        if (pa.mesh.parent) pa.mesh.parent.remove(pa.mesh);
        pa.mesh.geometry.dispose();
        pa.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      pa.mesh.scale.setScalar(Math.max(0.05, pa.life / pa.maxLife));
      if (pa.mesh.material) pa.mesh.material.opacity = Math.min(1, pa.life / pa.maxLife);
    }

    // --- pièces / bonus au contact
    for (const rec of this.entities.values()) {
      if (!rec.alive || !rec.root.visible) continue;
      if (rec.type !== 'coin' && rec.type !== 'pickup' && rec.type !== 'weapon') continue;
      const d = rec.root.position.distanceTo(new T.Vector3(p.pos.x, p.pos.y + 0.9, p.pos.z));
      if (d > 1.7) continue;
      this.sfx('pickup');
      if (rec.type === 'coin') { this.addScore(rec.def.value || 10); }
      if (rec.type === 'weapon') { this.giveWeapon(rec.def.weapon || 'rifle'); }
      if (rec.type === 'pickup') {
        if (rec.def.kind === 'health') this.heal(rec.def.value || 25);
        else this.addScore(rec.def.value || 25);
      }
      rec.root.visible = false;
      rec.alive = false;
      this._rebuildWorld();
      if (this.host && this.host.onPickup) this.host.onPickup(rec.type);
    }

    // --- régénération de vie (après 4 s sans dégâts)
    if (this.time - (this.lastHurt || 0) > 4 && this.state.health < this.state.maxHealth) {
      this.state.health = Math.min(this.state.maxHealth, this.state.health + 9 * dt);
      if (this.host && this.host.onHud) this.host.onHud(this.state);
    }
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 1.8);

    // --- objectif
    for (const rec of this.entities.values()) {
      if (rec.type !== 'goal' || !rec.root.visible) continue;
      const d = rec.root.position.distanceTo(new T.Vector3(p.pos.x, p.pos.y, p.pos.z));
      if (d < 2.2) this.win('Objectif atteint');
    }
  }

  _enemyShot(e, eye) {
    const T = this.THREE;
    const from = e.root.position.clone().setY(e.root.position.y + 1.45);
    const dir = eye.clone().sub(from).normalize();
    // imprécision volontaire : le joueur doit pouvoir bouger pour esquiver
    dir.x += (Math.random() - 0.5) * 0.06;
    dir.y += (Math.random() - 0.5) * 0.04;
    dir.z += (Math.random() - 0.5) * 0.06;
    dir.normalize();
    const geo = new T.SphereGeometry(0.13, 8, 6);
    const mat = new T.MeshBasicMaterial({ color: 0xFF7A5C });
    const mesh = new T.Mesh(geo, mat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, dir, speed: 22, damage: e.damage, life: 3.2 });
    this.sfx('enemyShot');
    if (this.host && this.host.onEnemyShot) this.host.onEnemyShot(from);
  }

  _removeProjectile(i) {
    const pr = this.projectiles[i];
    if (pr.mesh.parent) pr.mesh.parent.remove(pr.mesh);
    pr.mesh.geometry.dispose();
    pr.mesh.material.dispose();
    this.projectiles.splice(i, 1);
  }

  /* ---------- dégâts / état ---------- */
  _damage(n) {
    this.state.health = Math.max(0, this.state.health - n);
    this.sfx('hurt');
    this.damageFlash = 1;
    this.lastHurt = this.time;
    if (this.host && this.host.onHud) this.host.onHud(this.state);
    if (this.state.health <= 0 && !this.state.lost) {
      this.state.lost = true;
      this.sfx('lose');
      if (this.host && this.host.onLose) this.host.onLose();
      this._runHooks('onDeath');
    }
  }

  heal(n) {
    this.state.health = Math.min(this.state.maxHealth, this.state.health + n);
    if (this.host && this.host.onHud) this.host.onHud(this.state);
  }

  addScore(n) {
    this.state.score += n;
    if (this.host && this.host.onHud) this.host.onHud(this.state);
  }

  win(msg) {
    if (this.state.won) return;
    this.state.won = true;
    this.sfx('win');
    if (this.host && this.host.onWin) this.host.onWin(msg || '');
  }

  /* ---------- API de script ---------- */
  _compile() {
    this._hooks.clear();
    for (const rec of this.entities.values()) {
      const s = rec.script;
      if (!s) continue;
      const h = {};
      for (const name of ['onStart', 'onUpdate', 'onCollide', 'onDeath']) {
        const src = (s[name] || '').trim();
        if (!src) continue;
        try {
          // l'API est passée en paramètre : les scripts peuvent nommer le
          // contexte librement (`api`, `world`, `self`, `player`).
          h[name] = new Function('api', 'dt', 'player', 'self', 'other', 'scene', 'print', src);
        } catch (e) {
          if (this.host && this.host.onError) this.host.onError(rec.name + ' · ' + e.message);
        }
      }
      if (Object.keys(h).length) this._hooks.set(rec.id, h);
    }
  }

  /**
   * API de script pour un objet donné.
   * `api` donne accès aux fonctions globales (score, dégâts, sons, niveaux)
   * ET, par délégation, aux propriétés de l'objet courant (pos, rot,
   * playAnim, setState…). Sans cette fusion, `api.pos` — ce que montrent les
   * extraits de code de l'éditeur — vaudrait `undefined`.
   */
  _apiFor(rec) {
    const base = this.api();
    if (!rec) return base;
    this._apiCache = this._apiCache || new Map();
    const cached = this._apiCache.get(rec.id);
    if (cached && cached.base === base) return cached.proxy;
    const proxy = this.makeProxy(rec);
    const merged = new Proxy(base, {
      get(target, key) {
        if (key in target) return target[key];
        const v = proxy[key];
        return typeof v === 'function' ? v.bind(proxy) : v;
      },
      set(target, key, value) {
        if (key in proxy) { proxy[key] = value; return true; }
        target[key] = value;
        return true;
      },
      has(target, key) { return key in target || key in proxy; }
    });
    this._apiCache.set(rec.id, { base: base, proxy: merged });
    return merged;
  }

  _runHooks(name, dt) {
    const playerProxy = this.makeProxy(null);
    const api = this.api();
    for (const [id, h] of this._hooks) {
      const fn = h[name];
      if (!fn) continue;
      const rec = this.entities.get(id);
      const objApi = this._apiFor(rec);
      try {
        fn(objApi, dt || 0, playerProxy, this.makeProxy(rec), null, this.scene, api.print);
      } catch (e) {
        // une erreur de script est désactivée pour éviter 60 erreurs/seconde,
        // mais elle est remontée avec l'objet et le hook fautifs.
        h[name] = null;
        this.scriptErrors++;
        if (this.host && this.host.onError) {
          this.host.onError((rec ? rec.name : id) + ' · ' + name + ' · ' + e.message, rec ? rec.id : id, name);
        }
      }
    }
  }

  /**
   * Proxy exposé au code utilisateur. Il ne se limite plus à position/rotation :
   * c'est l'API qui rend un jeu possible (dégâts, spawn, sons, timers).
   */
  makeProxy(rec) {
    const rt = this;
    const T = this.THREE;
    if (!rec) {
      const p = rt.player;
      return {
        isPlayer: true,
        get position() { return p.pos; },
        set position(v) { if (v && v.isVector3) p.pos.copy(v); },
        get health() { return rt.state.health; },
        set health(v) { rt.state.health = clamp(Number(v) || 0, 0, rt.state.maxHealth); },
        damage(n) { rt._damage(Number(n) || 0); },
        heal(n) { rt.heal(Number(n) || 0); },
        teleport(x, y, z) { p.pos.set(x, y, z); p.vel.set(0, 0, 0); },
        lookAt(x, y, z) {
          const d = new T.Vector3(x - p.pos.x, y - (p.pos.y + p.eye), z - p.pos.z).normalize();
          p.yaw = Math.atan2(-d.x, -d.z);
          p.pitch = Math.asin(clamp(d.y, -1, 1));
        },
        get grounded() { return p.grounded; }
      };
    }
    const o = rec.root;
    return {
      id: rec.id,
      type: rec.type,
      name: rec.name,
      get visible() { return o.visible; },
      set visible(v) { o.visible = !!v; },
      get alive() { return rec.alive; },
      get health() { return rec.hp; },
      set health(v) { rec.hp = Number(v) || 0; if (rec.hp <= 0) rt.kill(rec.id); },
      damage(n) { rec.hp -= Number(n) || 0; if (rec.hp <= 0) rt.kill(rec.id); },
      kill() { rt.kill(rec.id); },
      position: {
        get x() { return o.position.x; }, set x(v) { o.position.x = Number(v) || 0; },
        get y() { return o.position.y; }, set y(v) { o.position.y = Number(v) || 0; },
        get z() { return o.position.z; }, set z(v) { o.position.z = Number(v) || 0; }
      },
      // alias courts, utilisés par les extraits de code de l'éditeur
      get pos() { return this.position; },
      get rot() { return this.rotation; },
      rotation: {
        get x() { return T.MathUtils.radToDeg(o.rotation.x); }, set x(v) { o.rotation.x = T.MathUtils.degToRad(Number(v) || 0); },
        get y() { return T.MathUtils.radToDeg(o.rotation.y); }, set y(v) { o.rotation.y = T.MathUtils.degToRad(Number(v) || 0); },
        get z() { return T.MathUtils.radToDeg(o.rotation.z); }, set z(v) { o.rotation.z = T.MathUtils.degToRad(Number(v) || 0); }
      },
      /** Alias lisibles : api.position.x === api.pos.x. */
      get position3() { return o.position; },
      playAnim(name, fade) {
        if (!rec.mixer) return false;
        const clip = rec.clips && rec.clips.find((c) => c.name === name);
        if (!clip) return false;
        const action = rec.mixer.clipAction(clip);
        const f = fade == null ? 0.18 : fade;
        if (rec.currentClip && rec.currentClip !== action) rec.currentClip.fadeOut(f);
        action.reset().fadeIn(f).play();
        rec.currentClip = action;
        return true;
      },
      /** Bascule la machine à états d'animation de l'objet. */
      setState(name, fade) {
        if (!rec.states || !rec.states[name]) return false;
        if (rec.stateName === name) return true;
        const prev = rec.states[rec.stateName];
        const next = rec.states[name];
        if (prev && prev.action) prev.action.fadeOut(fade == null ? 0.16 : fade);
        if (next.action) next.action.reset().fadeIn(fade == null ? 0.16 : fade).play();
        rec.stateName = name;
        rec.stateTime = 0;
        return true;
      },
      get state() { return rec.stateName; },
      /** Liste des états disponibles sur cet objet. */
      get states() { return rec.states ? Object.keys(rec.states) : []; },
      stopAnim() {
        if (rec.currentClip) { rec.currentClip.fadeOut(0.15); rec.currentClip = null; }
        if (rec.states) Object.keys(rec.states).forEach((k) => {
          const st = rec.states[k];
          if (st.action) st.action.fadeOut(0.15);
        });
      }
    };
  }

  kill(id) {
    const rec = this.entities.get(id);
    if (!rec || !rec.alive) return;
    rec.alive = false;
    rec.root.visible = false;
    this.sfx('kill');
    for (const e of this.enemies) if (e.id === id) e.alive = false;
    this.state.kills++;
    this._runHooksFor(id, 'onDeath', 0);
    this._rebuildWorld();
    if (this.host && this.host.onHud) this.host.onHud(this.state);
  }

  _runHooksFor(id, name, dt) {
    const h = this._hooks.get(id);
    if (!h || !h[name]) return;
    const rec = this.entities.get(id);
    try {
      const a = this._apiFor(rec);
      h[name](a, dt, this.makeProxy(null), this.makeProxy(rec), a.print, this.scene, a.print);
    }
    catch (e) { if (this.host && this.host.onError) this.host.onError(e.message); }
  }

  api() {
    const rt = this;
    return {
      get: (id) => { const rec = rt.entities.get(id); return rec ? rt.makeProxy(rec) : null; },
      get player() { return rt.makeProxy(null); },
      get score() { return rt.state.score; },
      get health() { return rt.state.health; },
      get entities() { return Array.from(rt.entities.values()).filter((r) => r.alive).map((r) => rt.makeProxy(r)); },
      /** Trouve le premier objet portant ce tag ou ce type. */
      find(kind) {
        for (const rec of rt.entities.values()) {
          if (!rec.alive) continue;
          if (rec.type === kind || (rec.tags && rec.tags.includes(kind))) return rt.makeProxy(rec);
        }
        return null;
      },
      /** Tous les objets d'un type. */
      all(type) {
        return Array.from(rt.entities.values())
          .filter((r) => r.alive && r.type === type)
          .map((r) => rt.makeProxy(r));
      },
      addScore: (n) => rt.addScore(Number(n) || 0),
      damage: (n) => rt._damage(Number(n) || 0),
      heal: (n) => rt.heal(Number(n) || 0),
      win: (msg) => rt.win(msg),
      loadLevel: (i) => rt.loadLevel(i),
      get level() { return rt.levelIndex; },
      get levelCount() { return rt.levelCount; },
      nextLevel() { return rt.levelIndex + 1 < rt.levelCount ? rt.loadLevel(rt.levelIndex + 1) : false; },
      lose: () => { rt.state.lost = true; if (rt.host && rt.host.onLose) rt.host.onLose(); },
      message: (msg) => { if (rt.host && rt.host.onMessage) rt.host.onMessage(String(msg)); },
      /** Écrit dans la console de l'éditeur (et dans celle du jeu exporté). */
      print: (...args) => {
        const text = args.map((a) => {
          if (a == null) return String(a);
          if (typeof a === 'object') { try { return JSON.stringify(a); } catch (e) { return '[objet]'; } }
          return String(a);
        }).join(' ');
        rt.scriptLog.push(text);
        if (rt.scriptLog.length > 200) rt.scriptLog.shift();
        if (rt.host && rt.host.onScriptLog) rt.host.onScriptLog(text);
      },
      sound: (kind) => rt.sfx(kind),
      tone: (freq, dur, type, vol, slideTo) => { rt.initAudio(); rt._tone(freq, dur, type, vol, slideTo); },
      setMuted: (v) => { rt.muted = !!v; },
      /** Raycast dans le monde : { point, normal, dist } ou null. */
      raycast: (ox, oy, oz, dx, dy, dz, maxDist) => {
        const d = new rt.THREE.Vector3(dx, dy, dz).normalize();
        const hit = rt.world.raycastHit(new rt.THREE.Vector3(ox, oy, oz), d, maxDist || 100);
        if (!hit) return null;
        return { point: hit.point, normal: hit.normal, dist: hit.dist, entity: hit.tag ? rt.entities.get(hit.tag) : null };
      },
      /** Raycast depuis la caméra (le joueur). */
      shoot(maxDist) {
        const p = rt.player;
        const dir = new rt.THREE.Vector3(0, 0, -1).applyEuler(rt.camera.rotation);
        const origin = new rt.THREE.Vector3(p.pos.x, p.pos.y + p.eye, p.pos.z);
        const hit = rt.world.raycastHit(origin, dir, maxDist || 120);
        if (!hit) return null;
        return { point: hit.point, normal: hit.normal, dist: hit.dist, entity: hit.tag ? rt.makeProxy(rt.entities.get(hit.tag)) : null };
      }
    };
  }
}

export default KreoRuntime;

/* ============================================================
   KREO — Éditeur 3D (editor3d.js)
   three.js : viewport orbit, gizmos (déplacer/pivoter/échelle),
   arbre de scène, inspecteur, console, mode jeu (3e personne),
   code JS par objet (onStart/onUpdate/onCollide), sauvegarde.
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { KreoRuntime, makeNoiseTexture, makeTexture, textureToThree, bindTextureGlobals } from './runtime.js';

const $ = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
const t = (k) => (window.kreoT ? window.kreoT(k) : k);

/* ================= État ================= */
const reg = new Map();            // id → record
let nextId = 1;
const state = {
  selectedId: null,
  selection: [],
  play: false,
  won: false,
  lost: false,
  score: 0,
  dirty: false,
  wire: false,
  scene: { name: 'Ma scène', fog: true, fogColor: '#B9C9E2',
    skyTop: '#6E9BD8', skyBottom: '#DCE7F2',
    sunColor: '#FFF2DE', sunIntensity: 2.3, ambient: 0.32, exposure: 1.08 },
  // Niveaux : chaque entrée garde son propre JSON d'objets. Le niveau actif
  // est celui qu'on édite ; l'export les embarque tous.
  scenes: [{ name: 'Ma scène', data: null }],
  sceneIndex: 0
};
const view = { snap: true, grid: true, mode: 'translate' };

const TYPE_COLORS = {
  cube: '#8B7CFF', sphere: '#22B8CF', cylinder: '#F5A623', cone: '#F26D6D',
  plane: '#7BD88F', torus: '#E879F9', sun: '#FFE066', point: '#FFB86B',
  player: '#6D4AFF', coin: '#F5C542', goal: '#3ECF8E', model: '#7DD3A0',
  spawn: '#FF8A5C', weapon: '#9AA7FF', enemy: '#FF5C5C', pickup: '#4FD1C5', cover: '#6C7B94',
  group: '#9BA6B8'
};

/* ============ Modèles 3D importés (GLB / GLTF) ============ */
// Loaders partagés ; les modèles sont mémorisés dans une bibliothèque
// afin que la sauvegarde JSON ne stocke que leur nom et leur échelle.
const _draco = new DRACOLoader();
_draco.setDecoderPath('../assets/vendor/three/addons/libs/draco/gltf/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(_draco);
const MODELS = new Map();          // nom → { gltf, animations, url }
const modelInstances = new Map();  // recId → AnimationMixer
const CAP = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function genId() { return 'obj-' + (nextId++); }
function findRec(id) { return reg.get(id) || null; }
function snapVal(v, step) { return view.snap ? Math.round(v / (step || 0.5)) * (step || 0.5) : v; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ================= Toasts ================= */
function toast(key, icon) {
  const box = $('#toastContainer');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<div class="t-ico">' + (icon || '✨') + '</div><span></span>';
  el.querySelector('span').textContent = key.indexOf('ed.') === 0 || key.indexOf('app.') === 0 ? t(key) : key;
  box.appendChild(el);
  setTimeout(function () {
    el.classList.add('out');
    setTimeout(function () { el.remove(); }, 220);
  }, 2600);
}

/* ================= Console ================= */
function log(msg, kind) {
  const body = $('#consoleBody');
  const line = document.createElement('div');
  line.className = 'c-line ' + (kind || '');
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  line.innerHTML = '<span class="c-time">' + hh + ':' + mm + ':' + ss + '</span>';
  line.appendChild(document.createTextNode(String(msg)));
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
  while (body.children.length > 200) body.removeChild(body.firstChild);
}
$('#btnClearConsole').addEventListener('click', function () { $('#consoleBody').innerHTML = ''; });

/* ================= Sons (WebAudio) ================= */
let AC = null;
function ac() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); return AC; }
function tone(freq, dur, type, vol, slideTo) {
  if (state.muted) return;
  try {
    const a = ac();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.15, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g).connect(a.destination);
    o.start(); o.stop(a.currentTime + dur + 0.02);
  } catch (e) { /* audio indisponible */ }
}
const SFX = {
  jump: function () { tone(420, 0.13, 'square', 0.09, 780); },
  coin: function () { tone(988, 0.08, 'triangle', 0.13); setTimeout(function () { tone(1319, 0.11, 'triangle', 0.13); }, 70); },
  hit: function () { tone(190, 0.2, 'sawtooth', 0.12, 95); },
  win: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { tone(f, 0.15, 'triangle', 0.15); }, i * 105); }); },
  lose: function () { [392, 330, 262, 196].forEach(function (f, i) { setTimeout(function () { tone(f, 0.17, 'sawtooth', 0.11); }, i * 125); }); }
};

/* ================= Rendu 3D ================= */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene3d = new THREE.Scene();
// (le brouillard est défini par applySceneSettings)

// (le ciel est construit par applySceneSettings, depuis les réglages de scène)


/* ---------- Éclairage d'environnement (IBL) ----------
   Sans ça, tout ce qui est métallique rend noir : un métal n'a pas de
   couleur diffuse, il ne réfléchit que l'environnement. */
function buildEnvironment(sceneObj, rendererObj) {
  const pmrem = new THREE.PMREMGenerator(rendererObj);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(60, 24, 16),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })
  );
  const geo = sky.geometry;
  const pos = geo.attributes.position;
  const colors = [];
  const top = new THREE.Color('#4E7FC4');
  const mid = new THREE.Color('#A8C4E4');
  const bot = new THREE.Color('#5A6472');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 58;
    if (y >= 0) c.copy(mid).lerp(top, Math.pow(y, 0.6));
    else c.copy(mid).lerp(bot, Math.min(1, -y * 1.6));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  envScene.add(sky);
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(4, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.4, 4.4) })
  );
  sunDisc.position.set(24, 34, 18);
  envScene.add(sunDisc);
  const rt = pmrem.fromScene(envScene, 0.04);
  sceneObj.environment = rt.texture;
  sceneObj.environmentIntensity = 0.85;
  geo.dispose(); sky.material.dispose(); envScene.clear();
  return rt.texture;
}

let sunLight = null, ambientLight = null;
let __envRT = null;

/**
 * Applique les réglages de scène (ciel, soleil, ambiance, exposition) aussi
 * bien dans l'éditeur que, par sérialisation, dans le jeu exporté.
 */
function applySceneSettings() {
  const sc = state.scene;
  // ciel
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, sc.skyTop || '#6E9BD8');
  grad.addColorStop(0.55, mixHex(sc.skyTop || '#6E9BD8', sc.skyBottom || '#DCE7F2', 0.6));
  grad.addColorStop(1, sc.skyBottom || '#DCE7F2');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene3d.background = tex;
  if (__skyTex) __skyTex.dispose();
  __skyTex = tex;

  scene3d.fog = sc.fog !== false
    ? new THREE.Fog(new THREE.Color(sc.fogColor || '#B9C9E2'), 60, 260)
    : null;

  if (sunLight) {
    sunLight.color.set(sc.sunColor || '#FFF2DE');
    sunLight.intensity = sc.sunIntensity == null ? 2.3 : sc.sunIntensity;
  }
  if (ambientLight) ambientLight.intensity = sc.ambient == null ? 0.32 : sc.ambient;
  if (renderer) renderer.toneMappingExposure = sc.exposure == null ? 1.08 : sc.exposure;
}
let __skyTex = null;

function mixHex(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return '#' + ca.lerp(cb, t).getHexString();
}


const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 600);
camera.position.set(15, 11, 18);

const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.maxPolarAngle = Math.PI * 0.495;
orbit.minDistance = 3;
orbit.maxDistance = 140;
orbit.target.set(0, 2, 0);

// Lumières d'environnement (hors arbre)
scene3d.add(new THREE.HemisphereLight(0xDDEBFF, 0x3A4455, 0.9));
ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.32);
scene3d.add(ambientLight);
const keyLight = new THREE.DirectionalLight(0xFFF2DE, 2.3);
sunLight = keyLight;
keyLight.position.set(20, 32, 14);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -50;
keyLight.shadow.camera.right = 50;
keyLight.shadow.camera.top = 50;
keyLight.shadow.camera.bottom = -50;
keyLight.shadow.camera.far = 120;
keyLight.shadow.bias = -0.0004;
scene3d.add(keyLight);
__envRT = buildEnvironment(scene3d, renderer);
applySceneSettings();

// Grille
const grid = new THREE.GridHelper(120, 60, 0x8B7CFF, 0x3A4256);
grid.position.y = 0.02;
grid.material.transparent = true;
grid.material.opacity = 0.5;
scene3d.add(grid);

// Gizmos
const transform = new TransformControls(camera, canvas);
const tHelper = transform.getHelper ? transform.getHelper() : transform;
scene3d.add(tHelper);
transform.setSpace('world');
transform.setTranslationSnap(0.5);
transform.setRotationSnap(THREE.MathUtils.degToRad(15));
transform.setScaleSnap(0.1);
transform.addEventListener('dragging-changed', function (e) {
  orbit.enabled = !e.value;
  if (!e.value && state.selectedId) {
    markDirty();
    pushHistory();
  }
});
transform.addEventListener('objectChange', function () {
  syncTransformInputs();
  markDirty();
});

// Boîte de sélection
let selBox = null;

/* ================= Historique (undo/redo) ================= */
const undoStack = [], redoStack = [];
function currentSceneData() {
  return {
    scene: state.scene,
    objects: Array.from(reg.values()).map(recToProps)
  };
}

/** Sérialise TOUS les niveaux (le niveau actif est rafraîchi d'abord). */
function serialize() {
  const scenes = state.scenes.map(function (s, i) {
    return {
      name: s.name,
      data: i === state.sceneIndex ? currentSceneData() : s.data
    };
  });
  return JSON.stringify({
    // rétrocompatibilité : un projet mono-niveau reste lisible
    scene: state.scene,
    objects: Array.from(reg.values()).map(recToProps),
    scenes: scenes,
    active: state.sceneIndex
  });
}

function renderScenes() {
  const list = $('#scenesList');
  if (!list) return;
  list.innerHTML = state.scenes.map(function (s, i) {
    return '<button class="scene-chip' + (i === state.sceneIndex ? ' active' : '') + '" data-scene="' + i + '">' +
      escapeHtml(s.name || ('Niveau ' + (i + 1))) + '</button>';
  }).join('');
  $$('.scene-chip', list).forEach(function (chip) {
    chip.addEventListener('click', function () { switchScene(parseInt(chip.getAttribute('data-scene'), 10)); });
    chip.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      removeScene(parseInt(chip.getAttribute('data-scene'), 10));
    });
  });
}

function switchScene(i) {
  if (i === state.sceneIndex || !state.scenes[i]) return;
  // sauvegarde du niveau courant
  state.scenes[state.sceneIndex].data = currentSceneData();
  state.scenes[state.sceneIndex].name = state.scene.name;
  state.sceneIndex = i;
  const target = state.scenes[i];
  const data = target.data || { scene: { name: target.name, fog: true, fogColor: '#B9C9E2' }, objects: [] };
  rebuildFromData(data, false, true);
  state.scene.name = target.name;
  $('#projectName').value = target.name;
  renderScenes();
}

function addScene() {
  state.scenes[state.sceneIndex].data = currentSceneData();
  state.scenes[state.sceneIndex].name = state.scene.name;
  const name = 'Niveau ' + (state.scenes.length + 1);
  state.scenes.push({ name: name, data: null });
  state.sceneIndex = state.scenes.length - 1;
  rebuildFromData({ scene: { name: name, fog: true, fogColor: '#B9C9E2' }, objects: [] }, false, true);
  state.scene.name = name;
  $('#projectName').value = name;
  renderScenes();
  toast('ed.newScene', '＋');
}

function removeScene(i) {
  if (state.scenes.length <= 1) { toast('ed.lastScene', '⚠️'); return; }
  state.scenes.splice(i, 1);
  if (state.sceneIndex >= state.scenes.length) state.sceneIndex = state.scenes.length - 1;
  const target = state.scenes[state.sceneIndex];
  state.sceneIndex = state.sceneIndex;
  rebuildFromData(target.data || { scene: { name: target.name, fog: true, fogColor: '#B9C9E2' }, objects: [] }, false, true);
  renderScenes();
  markDirty();
}
function pushHistory() {
  undoStack.push(serialize());
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(serialize());
  rebuildFromData(JSON.parse(undoStack.pop()), true);
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(serialize());
  rebuildFromData(JSON.parse(redoStack.pop()), true);
}
// Un snapshot AVANT modification
let pendingSnap = false;
function armSnap() { pendingSnap = true; }
function takeSnap() { if (pendingSnap) { pendingSnap = false; pushHistory(); markDirty(); } }

function markDirty() {
  state.dirty = true;
  updateStatusSave();
}
function updateStatusSave() {
  const el = $('#statusSave');
  el.textContent = state.dirty ? t('ed.modified') : t('ed.saved');
  el.className = 'sb-save ' + (state.dirty ? 'dirty' : 'ok');
}

/* ================= Objets ================= */
function mat(opts) {
  return new THREE.MeshStandardMaterial(Object.assign({
    color: 0x8FA3C8,
    metalness: 0.08,
    roughness: 0.62,
    emissive: 0x000000
  }, opts || {}));
}

function createObject(type, opts) {
  opts = opts || {};
  const id = opts.id || genId();
  const rec = {
    id: id,
    type: type,
    name: opts.name || t('ed.add' + CAP(type)),
    script: opts.script || { onStart: '', onUpdate: '', onCollide: '' },
    sound: opts.sound || null,
    collidable: opts.collidable !== undefined ? opts.collidable : ['cube', 'sphere', 'cylinder', 'cone', 'plane', 'torus'].indexOf(type) !== -1,
    value: opts.value != null ? opts.value : 10,
    speed: opts.speed != null ? opts.speed : 6,
    jump: opts.jump != null ? opts.jump : 9
  };

  let obj3d = null;
  switch (type) {
    case 'model': {
      // Instance d'un modèle importé (GLB) : clone riggé + animations
      const asset = MODELS.get(opts.model);
      const g = new THREE.Group();
      if (asset) {
        const root = cloneSkinned(asset.gltf.scene);
        g.add(root);
        if (asset.gltf.animations && asset.gltf.animations.length) {
          const mixer = new THREE.AnimationMixer(root);
          const clip = asset.gltf.animations[opts.anim || 0] || asset.gltf.animations[0];
          mixer.clipAction(clip).play();
          g.userData.mixer = mixer;
          g.userData.clipIndex = opts.anim || 0;
          g.userData.clipCount = asset.gltf.animations.length;
        }
      } else {
        const ph = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mat({ color: 0x7DD3A0, wireframe: true }));
        ph.position.y = 0.8;
        g.add(ph);
      }
      rec.model = opts.model || '';
      rec.anim = opts.anim || 0;
      rec.collidable = opts.collidable || false;
      obj3d = g;
      break;
    }
    case 'group': {
      // pivot invisible : sert à déplacer un ensemble d'objets d'un bloc
      obj3d = new THREE.Group();
      break;
    }
    case 'cube': {
      obj3d = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat({ color: opts.color || 0x8FA3C8 }));
      break;
    }
    case 'sphere': {
      obj3d = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 24), mat({ color: opts.color || 0x22B8CF }));
      break;
    }
    case 'cylinder': {
      obj3d = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 32), mat({ color: opts.color || 0xF5A623 }));
      break;
    }
    case 'cone': {
      obj3d = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 32), mat({ color: opts.color || 0xF26D6D }));
      break;
    }
    case 'plane': {
      obj3d = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 16), mat({ color: opts.color || 0x6C7B94, roughness: 0.85 }));
      break;
    }
    case 'torus': {
      obj3d = new THREE.Mesh(new THREE.TorusGeometry(1, 0.38, 20, 48), mat({ color: opts.color || 0xE879F9 }));
      break;
    }
    case 'sun': {
      const g = new THREE.Group();
      const light = new THREE.DirectionalLight(0xFFF2DE, opts.intensity != null ? opts.intensity : 2.2);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.camera.left = -40;
      light.shadow.camera.right = 40;
      light.shadow.camera.top = 40;
      light.shadow.camera.bottom = -40;
      light.shadow.bias = -0.0004;
      g.add(light);
      const icon = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), new THREE.MeshBasicMaterial({ color: 0xFFE066, wireframe: true }));
      g.add(icon);
      rec.light = light;
      rec.collidable = false;
      obj3d = g;
      break;
    }
    case 'point': {
      const g = new THREE.Group();
      const light = new THREE.PointLight(0xFFD9A0, opts.intensity != null ? opts.intensity : 60, 45, 2);
      g.add(light);
      const icon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshBasicMaterial({ color: 0xFFB86B }));
      g.add(icon);
      rec.light = light;
      rec.collidable = false;
      obj3d = g;
      break;
    }
    case 'player': {
      obj3d = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.05, 8, 18), mat({ color: opts.color || 0x6D4AFF, metalness: 0.15, roughness: 0.4 }));
      rec.collidable = false;
      break;
    }
    case 'coin': {
      obj3d = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.22, 16, 36), mat({
        color: opts.color || 0xF5C542, metalness: 0.85, roughness: 0.25, emissive: 0x443300
      }));
      rec.collidable = false;
      break;
    }
    case 'spawn': {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.06, 28),
        new THREE.MeshStandardMaterial({ color: 0xFF8A5C, emissive: 0x7A3010, emissiveIntensity: 0.8, transparent: true, opacity: 0.9 }));
      g.add(ring);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 12),
        new THREE.MeshStandardMaterial({ color: 0xFF8A5C, emissive: 0x7A3010 }));
      arrow.position.y = 1.1;
      arrow.rotation.x = Math.PI;
      g.add(arrow);
      rec.collidable = false;
      obj3d = g;
      break;
    }
    case 'weapon': {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.85),
        new THREE.MeshStandardMaterial({ color: 0x9AA7FF, metalness: 0.6, roughness: 0.35, emissive: 0x1A2050 }));
      body.position.y = 0.9;
      g.add(body);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x555C77, metalness: 0.4, roughness: 0.6 }));
      mag.position.set(0, 0.72, 0.1);
      g.add(mag);
      rec.collidable = false;
      obj3d = g;
      break;
    }
    case 'enemy': {
      const g = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xFF5C5C, metalness: 0.35, roughness: 0.5, emissive: 0x3A0808 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.0, 8, 16), bodyMat);
      body.position.y = 1.0;
      g.add(body);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xFFE066, emissive: 0xFFAA22, emissiveIntensity: 1.6 }));
      visor.position.set(0, 1.55, -0.4);
      g.add(visor);
      rec.collidable = false;
      obj3d = g;
      break;
    }
    case 'goal': {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 12), mat({ color: 0x444C63, metalness: 0.4, roughness: 0.5 }));
      pole.position.y = 1.7;
      g.add(pole);
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.5, 20), mat({ color: 0x3ECF8E, emissive: 0x0E5233 }));
      flag.position.y = 3.9;
      g.add(flag);
      rec.collidable = false;
      obj3d = g;
      break;
    }
    default:
      return null;
  }

  obj3d.traverse(function (o) {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  if (type === 'plane') obj3d.castShadow = false;

  const p = opts.position || [0, 1.2, 0];
  const r = opts.rotation || [0, 0, 0];
  const s = opts.scale || [1, 1, 1];
  obj3d.position.set(p[0], p[1], p[2]);
  obj3d.rotation.set(
    THREE.MathUtils.degToRad(r[0] || 0),
    THREE.MathUtils.degToRad(r[1] || 0),
    THREE.MathUtils.degToRad(r[2] || 0)
  );
  obj3d.scale.set(s[0], s[1], s[2]);
  obj3d.visible = opts.visible !== false;
  obj3d.userData.recId = id;

  // Matériau custom
  if (opts.material && obj3d.material) {
    obj3d.material.color.set(opts.material.color || '#8FA3C8');
    if (opts.material.texture && opts.material.texture !== 'none') {
      const lib = getTexture(opts.material.texture);
      if (lib) {
        obj3d.material.map = textureToThree(THREE, lib);
        obj3d.material.userData = obj3d.material.userData || {};
        obj3d.material.userData.kind = opts.material.texture;
        obj3d.material.needsUpdate = true;
      }
    }
    obj3d.material.metalness = opts.material.metalness != null ? opts.material.metalness : 0.08;
    obj3d.material.roughness = opts.material.roughness != null ? opts.material.roughness : 0.62;
    if (opts.material.emissive) obj3d.material.emissive.set(opts.material.emissive);
    if (opts.material.opacity != null && opts.material.opacity < 1) {
      obj3d.material.transparent = true;
      obj3d.material.opacity = opts.material.opacity;
    }
    obj3d.material.wireframe = !!opts.material.wireframe;
  }
  if (opts.material && obj3d.children.length) {
    obj3d.traverse(function (o) {
      if (o.isMesh && o.material && o.material.isMeshStandardMaterial && opts.material.color) {
        o.material.color.set(opts.material.color);
        if (opts.material.emissive) o.material.emissive.set(opts.material.emissive);
      }
    });
  }
  if (opts.light && rec.light) {
    if (opts.light.color) rec.light.color.set(opts.light.color);
    if (opts.light.intensity != null) rec.light.intensity = opts.light.intensity;
  }

  scene3d.add(obj3d);
  rec.obj3d = obj3d;
  reg.set(id, rec);
  return rec;
}

function recToProps(rec) {
  const o = rec.obj3d;
  return {
    id: rec.id,
    type: rec.type,
    name: rec.name,
    position: [o.position.x, o.position.y, o.position.z],
    rotation: [
      THREE.MathUtils.radToDeg(o.rotation.x),
      THREE.MathUtils.radToDeg(o.rotation.y),
      THREE.MathUtils.radToDeg(o.rotation.z)
    ],
    scale: [o.scale.x, o.scale.y, o.scale.z],
    visible: o.visible,
    collidable: rec.collidable,
    value: rec.value,
    speed: rec.speed,
    jump: rec.jump,
    material: getMaterialProps(rec),
    light: rec.light ? {
      color: '#' + rec.light.color.getHexString(),
      intensity: rec.light.intensity
    } : null,
    script: rec.script,
    parent: rec.parent || null,
    parentOffset: rec.parentOffset || null,
    // Les modèles importés sont désormais EMBARQUÉS (data URL) : sans ça, un
    // projet rouvert ou exporté remplaçait chaque modèle par un cube filaire.
    model: rec.model || null,
    modelData: (rec.model && MODELS.get(rec.model)) ? MODELS.get(rec.model).dataUrl : null,
    anim: rec.anim || 0,
    sound: rec.sound || null,
    tags: rec.tags || []
  };
}

/* ---------- Bibliothèque de textures procédurales ---------- */
const TEXTURES = new Map();
function getTexture(kind) {
  if (!kind || kind === 'none') return null;
  bindTextureGlobals(THREE);
  if (!TEXTURES.has(kind)) TEXTURES.set(kind, makeTexture(kind, 256, 4));
  return TEXTURES.get(kind);
}
const TEXTURE_KINDS = ['none', 'concrete', 'metal', 'grid', 'checker', 'wood', 'noise'];

function getMaterialProps(rec) {
  let m = null;
  rec.obj3d.traverse(function (o) {
    if (!m && o.isMesh && o.material && o.material.color && !(o.material instanceof THREE.MeshBasicMaterial)) m = o.material;
  });
  if (!m) return null;
  return {
    color: '#' + m.color.getHexString(),
    metalness: m.metalness,
    roughness: m.roughness,
    emissive: '#' + m.emissive.getHexString(),
    opacity: m.opacity,
    wireframe: m.wireframe,
    texture: m.map ? (m.userData ? m.userData.kind : null) : null
  };
}

function disposeObj(obj3d) {
  obj3d.traverse(function (o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
      else o.material.dispose();
    }
  });
}

function deleteObject(id, skipHistory) {
  const rec = findRec(id);
  if (!rec) return;
  if (!skipHistory) pushHistory();
  // les enfants d'un groupe suivent leur parent
  Array.from(reg.values()).forEach(function (child) {
    if (child.parent === id) deleteObject(child.id, true);
  });
  if (rec.obj3d.parent) rec.obj3d.parent.remove(rec.obj3d);
  else scene3d.remove(rec.obj3d);
  disposeObj(rec.obj3d);
  reg.delete(id);
  if (state.selectedId === id) select(null);
  if (!skipHistory) {
    renderHierarchy();
    markDirty();
    toast('ed.deletedToast', '🗑️');
    log('− ' + rec.name);
  }
}

/* ---------- Prefabs ----------
   Un prefab est un sous-ensemble d'objets mémorisé (nom + JSON), réinsérable
   à volonté. Sans ça, un niveau se construit objet par objet, ce qui ne passe
   pas l'échelle dès qu'il y a une cinquantaine d'éléments. */
const PREFABS_KEY = 'kreo-prefabs3d';

function loadPrefabs() {
  try { return JSON.parse(localStorage.getItem(PREFABS_KEY) || '[]'); } catch (e) { return []; }
}
function storePrefabs(list) {
  try { localStorage.setItem(PREFABS_KEY, JSON.stringify(list)); } catch (e) {}
}

/** Enregistre la sélection (ou tout le niveau) comme prefab. */
function savePrefab(asScene) {
  const all = Array.from(reg.values()).map(recToProps);
  const objs = asScene ? all : (state.selectedId ? all.filter(function (o) { return o.id === state.selectedId; }) : all);
  if (!objs.length) { toast('ed.prefabEmpty', '⚠️'); return; }
  const name = window.prompt(t('ed.prefabName'), t('ed.prefabDefault'));
  if (!name) return;
  const list = loadPrefabs();
  // les ids sont réattribués à l'insertion
  const clean = objs.map(function (o) { const c = Object.assign({}, o); delete c.id; return c; });
  list.unshift({ name: name, objects: clean, at: Date.now() });
  storePrefabs(list.slice(0, 40));
  renderPrefabs();
  toast('ed.prefabSaved', '📦');
  log('📦 prefab · ' + name + ' · ' + clean.length + ' obj', 'ok');
}

/** Insère un prefab au centre de la vue. */
function insertPrefab(index) {
  const list = loadPrefabs();
  const pf = list[index];
  if (!pf) return;
  pushHistory();
  const created = [];
  const camTarget = (orbit.target || new THREE.Vector3()).clone();
  pf.objects.forEach(function (o, i) {
    const copy = Object.assign({}, o);
    copy.id = undefined;
    copy.name = o.name + ' ' + (i + 1);
    if (copy.position) {
      copy.position = [
        copy.position[0] + camTarget.x,
        copy.position[1] + camTarget.y,
        copy.position[2] + camTarget.z
      ];
    }
    const rec = createObject(copy.type, copy);
    if (rec) created.push(rec.id);
  });
  renderHierarchy();
  markDirty();
  if (created.length) select(created[0]);
  toast('ed.prefabInserted', '📦');
  log('📦 ' + t('ed.prefabInserted') + ' · ' + pf.name, 'play');
}

function renderPrefabs() {
  const host = $('#prefabList');
  if (!host) return;
  const list = loadPrefabs();
  if (!list.length) {
    host.innerHTML = '<div class="h-empty">' + t('ed.prefabNone') + '</div>';
    return;
  }
  host.innerHTML = list.map(function (pf, i) {
    return '<div class="pf-row" data-pf="' + i + '">' +
      '<span class="pf-name">' + escapeHtml(pf.name) + '</span>' +
      '<span class="pf-count">' + pf.objects.length + '</span>' +
      '<button class="pf-del" data-del="' + i + '" title="Supprimer">×</button>' +
      '</div>';
  }).join('');
  $$('.pf-row', host).forEach(function (row) {
    row.addEventListener('click', function (e) {
      if (e.target.closest('.pf-del')) return;
      insertPrefab(parseInt(row.getAttribute('data-pf'), 10));
    });
  });
  $$('.pf-del', host).forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const i = parseInt(btn.getAttribute('data-del'), 10);
      const l = loadPrefabs();
      l.splice(i, 1);
      storePrefabs(l);
      renderPrefabs();
    });
  });
}

function duplicateObject(id) {
  const rec = findRec(id);
  if (!rec) return;
  pushHistory();
  const p = recToProps(rec);
  p.id = null;
  p.name = rec.name + ' (2)';
  p.position = [p.position[0] + 1.5, p.position[1] + 0.5, p.position[2] + 1.5];
  const copy = createObject(rec.type, p);
  select(copy.id);
  markDirty();
  toast('ed.copiedToast', '📄');
}

function addObject(type, opts) {
  pushHistory();
  const n = reg.size % 5;
  const rec = createObject(type, Object.assign({
    position: [n * 2.2 - 3, type === 'plane' ? 0.25 : 1.4, type === 'goal' ? -4 : (n * 1.4 - 2)]
  }, opts || {}));
  select(rec.id);
  markDirty();
  toast('ed.newObj', '＋');
  log('+ ' + rec.name);
}

/* ================= Sélection ================= */
function select(id, additive) {
  // Sélection multiple : Maj/Ctrl+clic ajoute ou retire de la sélection.
  if (additive) {
    const i = state.selection.indexOf(id);
    if (i >= 0) state.selection.splice(i, 1);
    else if (id) state.selection.push(id);
    id = state.selection.length ? state.selection[state.selection.length - 1] : null;
  } else {
    state.selection = id ? [id] : [];
  }
  state.selectedId = id;

  if (selBoxGroup) { scene3d.remove(selBoxGroup); selBoxGroup = null; }
  if (selBox) { scene3d.remove(selBox); selBox = null; }
  selBoxGroup = new THREE.Group();
  const rec = id ? findRec(id) : null;
  if (rec) {
    selBox = new THREE.BoxHelper(rec.obj3d, 0x8B7CFF);
    selBox.material.depthTest = false;
    scene3d.add(selBox);
    if (!state.play) transform.attach(rec.obj3d);
  } else {
    transform.detach();
  }
  // contours des objets secondaires de la sélection
  state.selection.forEach(function (sid) {
    if (sid === id) return;
    const r = findRec(sid);
    if (!r) return;
    const b = new THREE.BoxHelper(r.obj3d, 0x5FD0FF);
    b.material.depthTest = false;
    selBoxGroup.add(b);
  });
  if (selBoxGroup.children.length) scene3d.add(selBoxGroup);

  renderHierarchy();
  renderInspector();
  updateSelectionBadge();
}

let selBoxGroup = null;

function selectionRecs() {
  return state.selection.map(findRec).filter(Boolean);
}

function updateSelectionBadge() {
  const badge = $('#selCount');
  if (!badge) return;
  const n = state.selection.length;
  badge.hidden = n < 2;
  if (n > 1) badge.textContent = n + ' ' + t('ed.selected');
}

function deleteSelection() {
  const ids = state.selection.slice();
  if (!ids.length) { if (state.selectedId) deleteObject(state.selectedId); return; }
  pushHistory();
  ids.forEach(function (id) { deleteObject(id, true); });
  state.selection = [];
  state.selectedId = null;
  renderHierarchy();
  renderInspector();
  markDirty();
  log('🗑 ' + ids.length + ' obj');
}

/**
 * Regroupe la sélection sous un objet parent : indispensable pour déplacer
 * un bâtiment entier sans toucher à chaque mur.
 */
function groupSelection() {
  const recs = selectionRecs();
  if (recs.length < 2) { toast('ed.groupNeed', '⚠️'); return; }
  pushHistory();
  const parent = createObject('group', {
    name: t('ed.group') + ' ' + (reg.size + 1),
    position: [0, 0, 0]
  });
  if (!parent) return;
  recs.forEach(function (rec) {
    if (rec.id === parent.id) return;
    const world = new THREE.Vector3();
    rec.obj3d.getWorldPosition(world);
    // conserve la position monde en la convertissant dans le repère du parent
    if (rec.obj3d.parent) rec.obj3d.parent.remove(rec.obj3d);
    parent.obj3d.add(rec.obj3d);
    rec.obj3d.position.copy(parent.obj3d.worldToLocal(world.clone()));
    // on mémorise le décalage : la sérialisation n'écrit que des positions
    // monde, il faut pouvoir retrouver la pose locale à la reconstruction.
    rec.parent = parent.id;
    rec.parentOffset = [rec.obj3d.position.x, rec.obj3d.position.y, rec.obj3d.position.z];
  });
  select(parent.id);
  markDirty();
  log('📁 ' + t('ed.group') + ' · ' + recs.length);
}

function focusSelection() {
  const rec = findRec(state.selectedId);
  const box = new THREE.Box3();
  if (rec) box.setFromObject(rec.obj3d);
  else box.setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(8, 4, 8));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  orbit.target.copy(center);
  const dist = Math.max(6, size * 1.4);
  const dir = camera.position.clone().sub(center).normalize();
  camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
  orbit.update();
}

/* ================= Arbre de scène ================= */
function renderHierarchy() {
  const el = $('#hierarchy');
  $('#objCount').textContent = reg.size;
  $('#statusCount').textContent = reg.size + ' ' + t('ed.objectsLabel');
  if (!reg.size) {
    el.innerHTML = '<div class="h-empty">' + t('ed.empty') + '</div>';
    return;
  }
  el.innerHTML = Array.from(reg.values()).slice().reverse().map(function (rec) {
    return (
      '<div class="h-row' + (rec.id === state.selectedId ? ' selected' : '') + (rec.obj3d.visible ? '' : ' hidden-obj') + '" data-id="' + rec.id + '">' +
        '<div class="h-dot" style="background:' + (TYPE_COLORS[rec.type] || '#999') + '"></div>' +
        '<div class="h-name" title="' + t('ed.renameHint') + '">' + escapeHtml(rec.name) + '</div>' +
        '<button class="h-eye">' + (rec.obj3d.visible
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l16 16"/><path d="M9.5 6.4A9.6 9.6 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.4 2.9M6.3 8.3A16.6 16.6 0 0 0 3 12s4 6 9 6"/></svg>') +
        '</button>' +
      '</div>'
    );
  }).join('');

  $$('.h-row', el).forEach(function (row) {
    const id = row.getAttribute('data-id');
    row.addEventListener('click', function (e) {
      if (e.target.closest('.h-eye')) return;
      select(id, e.shiftKey || e.metaKey || e.ctrlKey);
    });
    row.addEventListener('dblclick', function (e) {
      if (e.target.closest('.h-eye')) return;
      beginRename(row, id);
    });
    row.querySelector('.h-eye').addEventListener('click', function () {
      const rec = findRec(id);
      if (!rec) return;
      pushHistory();
      rec.obj3d.visible = !rec.obj3d.visible;
      renderHierarchy();
      markDirty();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function beginRename(row, id) {
  const rec = findRec(id);
  if (!rec) return;
  const nameEl = row.querySelector('.h-name');
  const input = document.createElement('input');
  input.value = rec.name;
  nameEl.textContent = '';
  nameEl.appendChild(input);
  input.focus();
  input.select();
  let done = false;
  function commit(save) {
    if (done) return;
    done = true;
    if (save && input.value.trim()) {
      pushHistory();
      rec.name = input.value.trim();
    }
    renderHierarchy();
    renderInspector();
    markDirty();
  }
  input.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') commit(true);
    if (e.key === 'Escape') commit(false);
  });
  input.addEventListener('blur', function () { commit(true); });
}

/* ================= Inspecteur ================= */
function renderInspector() {
  const rec = findRec(state.selectedId);
  const empty = $('#inspectorEmpty');
  const obj = $('#inspectorObj');
  if (!rec) {
    empty.hidden = false;
    obj.hidden = true;
    $('#inSceneName').value = state.scene.name;
    $('#inBg').value = state.scene.fogColor;
    $('#inFog').checked = state.scene.fog !== false;
    if ($('#inSkyTop')) $('#inSkyTop').value = state.scene.skyTop || '#6E9BD8';
    if ($('#inSkyBottom')) $('#inSkyBottom').value = state.scene.skyBottom || '#DCE7F2';
    if ($('#inSunColor')) $('#inSunColor').value = state.scene.sunColor || '#FFF2DE';
    if ($('#inSunIntensity')) {
      const si = state.scene.sunIntensity == null ? 2.3 : state.scene.sunIntensity;
      $('#inSunIntensity').value = si;
      if ($('#sunVal')) $('#sunVal').textContent = si;
    }
    if ($('#inAmbient')) {
      const am = state.scene.ambient == null ? 0.32 : state.scene.ambient;
      $('#inAmbient').value = am;
      if ($('#ambVal')) $('#ambVal').textContent = am;
    }
    if ($('#inExposure')) {
      const ex = state.scene.exposure == null ? 1.08 : state.scene.exposure;
      $('#inExposure').value = ex;
      if ($('#expVal')) $('#expVal').textContent = ex;
    }
    return;
  }
  empty.hidden = true;
  obj.hidden = false;

  $('#inspTitle').textContent = rec.name;
  $('#inName').value = rec.name;
  $('#inVisible').checked = rec.obj3d.visible;
  syncTransformInputs();

  const isLight = !!rec.light;
  const isMesh = !isLight;
  $('#matBlock').hidden = !isMesh;
  $('#lightBlock').hidden = !isLight;

  if (isMesh) {
    const m = getMaterialProps(rec);
    if (m) {
      $('#inColor').value = m.color;
      if ($('#inTexture')) $('#inTexture').value = m.texture || 'none';
      if ($('#inSound')) $('#inSound').value = (rec.sound && rec.sound.kind) || 'none';
      if ($('#inSoundEvery')) {
        const ev = (rec.sound && rec.sound.every) || 2;
        $('#inSoundEvery').value = ev;
        if ($('#soundEveryVal')) $('#soundEveryVal').textContent = ev + ' s';
      }
      $('#inMetal').value = m.metalness;
      $('#metalVal').textContent = Number(m.metalness).toFixed(2);
      $('#inRough').value = m.roughness;
      $('#roughVal').textContent = Number(m.roughness).toFixed(2);
      $('#inEmissive').value = m.emissive === '#000000' ? '#000000' : m.emissive;
      $('#inOpacity').value = Math.round((m.opacity != null ? m.opacity : 1) * 100);
      $('#opacityVal').textContent = $('#inOpacity').value + ' %';
    }
  }
  if (isLight) {
    $('#inLightColor').value = '#' + rec.light.color.getHexString();
    $('#inLightInt').value = rec.light.intensity;
    $('#lightIntVal').textContent = Number(rec.light.intensity).toFixed(0);
  }

  // Comportement
  const meshTypes = ['cube', 'sphere', 'cylinder', 'cone', 'plane', 'torus'];
  $('#collideField').hidden = meshTypes.indexOf(rec.type) === -1;
  $('#inCollidable').checked = rec.collidable !== false;
  $('#speedField').hidden = rec.type !== 'player';
  $('#jumpField').hidden = rec.type !== 'player';
  $('#valueField').hidden = rec.type !== 'coin';
  if (rec.type === 'player') {
    $('#inSpeed').value = rec.speed;
    $('#speedVal').textContent = rec.speed;
    $('#inJump').value = rec.jump;
    $('#jumpVal').textContent = rec.jump;
  }
  if (rec.type === 'coin') $('#inValue').value = rec.value;

  // Code
  renderApiRef();
  rec.script = rec.script || { onStart: '', onUpdate: '', onCollide: '' };
  $('#codeEditor').value = rec.script[view.codeTarget || 'onStart'] || '';
  $$('.code-tab').forEach(function (tab) {
    tab.classList.toggle('active', tab.getAttribute('data-code') === (view.codeTarget || 'onStart'));
  });
}

/* ---------- Référence d'API cliquable ----------
   Sans ça, l'API de script n'existe que dans la tête de son auteur. Chaque
   puce insère un exemple fonctionnel dans l'onglet courant. */
const API_SNIPPETS = [
  { label: 'api.pos', code: 'api.pos.x += 2;' },
  { label: 'api.pos.y', code: 'api.pos.y = 3;' },
  { label: 'api.rot.y', code: 'api.rot.y += 45;' },
  { label: 'api.visible', code: 'api.visible = false;' },
  { label: 'api.playAnim', code: "api.playAnim('idle');" },
  { label: 'api.setState', code: "api.setState('run');" },
  { label: 'api.sound', code: "api.sound('alarm');" },
  { label: 'api.kill', code: 'api.kill();' },
  { label: 'world.give', code: "world.give('shotgun');" },
  { label: 'world.score', code: 'world.addScore(10);' },
  { label: 'world.msg', code: "world.message('Bonjour');" },
  { label: 'world.win', code: 'world.win();' },
  { label: 'world.level', code: 'world.nextLevel();' },
  { label: 'input.key', code: "if (input.key('KeyE')) { world.message('E'); }" }
];

function renderApiRef() {
  const host = $('#apiRef');
  if (!host || host.dataset.ready === '1') return;
  host.dataset.ready = '1';
  host.innerHTML = API_SNIPPETS.map(function (snip, i) {
    return '<button class="api-chip" data-snip="' + i + '">' + escapeHtml(snip.label) + '</button>';
  }).join('');
  $$('.api-chip', host).forEach(function (btn) {
    btn.addEventListener('click', function () {
      const snip = API_SNIPPETS[parseInt(btn.getAttribute('data-snip'), 10)];
      const ta = $('#codeEditor');
      if (!ta || !snip) return;
      const pos = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
      ta.value = ta.value.slice(0, pos) + snip.code + ta.value.slice(pos);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = pos + snip.code.length;
    });
  });
}

function syncTransformInputs() {
  const rec = findRec(state.selectedId);
  if (!rec) return;
  const o = rec.obj3d;
  $('#inPX').value = o.position.x.toFixed(2);
  $('#inPY').value = o.position.y.toFixed(2);
  $('#inPZ').value = o.position.z.toFixed(2);
  $('#inRX').value = THREE.MathUtils.radToDeg(o.rotation.x).toFixed(1);
  $('#inRY').value = THREE.MathUtils.radToDeg(o.rotation.y).toFixed(1);
  $('#inRZ').value = THREE.MathUtils.radToDeg(o.rotation.z).toFixed(1);
  $('#inSX').value = o.scale.x.toFixed(2);
  $('#inSY').value = o.scale.y.toFixed(2);
  $('#inSZ').value = o.scale.z.toFixed(2);
}

function bindField(sel, fn) {
  const el = $(sel);
  if (!el) return;
  el.addEventListener('pointerdown', armSnap);
  el.addEventListener('focus', armSnap);
  el.addEventListener('input', function () {
    takeSnap();
    fn(el);
    markDirty();
    if (selBox) selBox.update();
  });
}

bindField('#inName', function (el) {
  const rec = findRec(state.selectedId);
  if (rec) {
    rec.name = el.value;
    $('#inspTitle').textContent = el.value;
    renderHierarchy();
  }
});
[['#inPX', 'position', 'x'], ['#inPY', 'position', 'y'], ['#inPZ', 'position', 'z']].forEach(function (d) {
  bindField(d[0], function (el) {
    const rec = findRec(state.selectedId);
    if (rec) rec.obj3d.position[d[2]] = parseFloat(el.value) || 0;
  });
});
[['#inRX', 'x'], ['#inRY', 'y'], ['#inRZ', 'z']].forEach(function (d) {
  bindField(d[0], function (el) {
    const rec = findRec(state.selectedId);
    if (rec) rec.obj3d.rotation[d[1]] = THREE.MathUtils.degToRad(parseFloat(el.value) || 0);
  });
});
[['#inSX', 'x'], ['#inSY', 'y'], ['#inSZ', 'z']].forEach(function (d) {
  bindField(d[0], function (el) {
    const rec = findRec(state.selectedId);
    if (rec) rec.obj3d.scale[d[1]] = Math.max(0.05, parseFloat(el.value) || 1);
  });
});

function forEachMat(rec, fn) {
  rec.obj3d.traverse(function (o) {
    if (o.isMesh && o.material && o.material.color && !(o.material instanceof THREE.MeshBasicMaterial)) fn(o.material);
  });
}

bindField('#inSound', function (el) {
  const rec = findRec(state.selectedId);
  if (!rec) return;
  armSnap();
  rec.sound = Object.assign({ every: 2, range: 18 }, rec.sound || {});
  rec.sound.kind = el.value === 'none' ? null : el.value;
  takeSnap();
});
bindField('#inSoundEvery', function (el) {
  const rec = findRec(state.selectedId);
  if (!rec) return;
  rec.sound = Object.assign({ kind: null, every: 2, range: 18 }, rec.sound || {});
  rec.sound.every = parseFloat(el.value);
  if ($('#soundEveryVal')) $('#soundEveryVal').textContent = el.value + ' s';
});
bindField('#inTexture', function (el) {
  const rec = findRec(state.selectedId);
  if (!rec) return;
  armSnap();
  const kind = el.value;
  rec.obj3d.traverse(function (o) {
    if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return;
    const lib = getTexture(kind);
    if (lib) {
      if (o.material.map) o.material.map.dispose();
      o.material.map = textureToThree(THREE, lib);
      o.material.userData = o.material.userData || {};
      o.material.userData.kind = kind;
    } else if (o.material.map) {
      o.material.map.dispose();
      o.material.map = null;
      if (o.material.userData) o.material.userData.kind = null;
    }
    o.material.needsUpdate = true;
  });
  takeSnap();
});
bindField('#inColor', function (el) {
  const rec = findRec(state.selectedId);
  if (rec) forEachMat(rec, function (m) { m.color.set(el.value); });
});
bindField('#inMetal', function (el) {
  const rec = findRec(state.selectedId);
  $('#metalVal').textContent = Number(el.value).toFixed(2);
  if (rec) forEachMat(rec, function (m) { m.metalness = parseFloat(el.value); });
});
bindField('#inRough', function (el) {
  const rec = findRec(state.selectedId);
  $('#roughVal').textContent = Number(el.value).toFixed(2);
  if (rec) forEachMat(rec, function (m) { m.roughness = parseFloat(el.value); });
});
bindField('#inEmissive', function (el) {
  const rec = findRec(state.selectedId);
  if (rec) forEachMat(rec, function (m) { m.emissive.set(el.value); });
});
bindField('#inOpacity', function (el) {
  const rec = findRec(state.selectedId);
  $('#opacityVal').textContent = el.value + ' %';
  if (rec) forEachMat(rec, function (m) {
    const v = (parseFloat(el.value) || 100) / 100;
    m.opacity = v;
    m.transparent = v < 1;
  });
});
bindField('#inLightColor', function (el) {
  const rec = findRec(state.selectedId);
  if (rec && rec.light) rec.light.color.set(el.value);
});
bindField('#inLightInt', function (el) {
  const rec = findRec(state.selectedId);
  $('#lightIntVal').textContent = Number(el.value).toFixed(0);
  if (rec && rec.light) rec.light.intensity = parseFloat(el.value);
});
bindField('#inValue', function (el) {
  const rec = findRec(state.selectedId);
  if (rec) rec.value = Math.max(1, parseInt(el.value, 10) || 1);
});

$('#inVisible').addEventListener('change', function () {
  const rec = findRec(state.selectedId);
  if (rec) {
    pushHistory();
    rec.obj3d.visible = $('#inVisible').checked;
    renderHierarchy();
    markDirty();
  }
});
$('#inCollidable').addEventListener('change', function () {
  const rec = findRec(state.selectedId);
  if (rec) {
    pushHistory();
    rec.collidable = $('#inCollidable').checked;
    markDirty();
  }
});
bindField('#inSpeed', function (el) {
  const rec = findRec(state.selectedId);
  $('#speedVal').textContent = el.value;
  if (rec) rec.speed = parseFloat(el.value);
});
bindField('#inJump', function (el) {
  const rec = findRec(state.selectedId);
  $('#jumpVal').textContent = el.value;
  if (rec) rec.jump = parseFloat(el.value);
});

// Réglages de scène
bindField('#inSceneName', function (el) {
  state.scene.name = el.value;
  $('#projectName').value = el.value;
});
bindField('#inBg', function (el) {
  state.scene.fogColor = el.value;
  if (scene3d.fog) scene3d.fog.color.set(el.value);
});
bindField('#inSkyTop', function (el) { state.scene.skyTop = el.value; applySceneSettings(); });
bindField('#inSkyBottom', function (el) { state.scene.skyBottom = el.value; applySceneSettings(); });
bindField('#inSunColor', function (el) { state.scene.sunColor = el.value; applySceneSettings(); });
bindField('#inSunIntensity', function (el) {
  state.scene.sunIntensity = parseFloat(el.value);
  if ($('#sunVal')) $('#sunVal').textContent = el.value;
  applySceneSettings();
});
bindField('#inAmbient', function (el) {
  state.scene.ambient = parseFloat(el.value);
  if ($('#ambVal')) $('#ambVal').textContent = el.value;
  applySceneSettings();
});
bindField('#inExposure', function (el) {
  state.scene.exposure = parseFloat(el.value);
  if ($('#expVal')) $('#expVal').textContent = el.value;
  applySceneSettings();
});
$('#inFog').addEventListener('change', function () {
  pushHistory();
  state.scene.fog = $('#inFog').checked;
  scene3d.fog = state.scene.fog ? new THREE.Fog(new THREE.Color(state.scene.fogColor), 60, 260) : null;
  markDirty();
});
$('#projectName').addEventListener('input', function (e) {
  state.scene.name = e.target.value;
  markDirty();
});

/* ================= Code ================= */
view.codeTarget = 'onStart';
function templateFor(hook) {
  const fr = !(window.kreoCurrentLang && window.kreoCurrentLang() === 'en');
  if (hook === 'onStart') {
    return fr ? '// Se lance quand la partie démarre\nscene.message("C\'est parti !");' : '// Runs when the game starts\nscene.message("Let\'s go!");';
  }
  if (hook === 'onUpdate') {
    return fr ? '// Se lance à chaque image (dt = durée d\'une image)\n// Exemple : self.position.y += dt;' : '// Runs every frame (dt = frame duration)\n// Example: self.position.y += dt;';
  }
  return fr ? '// Se lance quand le joueur touche cet objet\nif (other) {\n  scene.addScore(5);\n}' : '// Runs when the player touches this object\nif (other) {\n  scene.addScore(5);\n}';
}

$$('.code-tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    const rec = findRec(state.selectedId);
    if (rec) {
      rec.script = rec.script || { onStart: '', onUpdate: '', onCollide: '' };
      rec.script[view.codeTarget || 'onStart'] = $('#codeEditor').value;
    }
    view.codeTarget = tab.getAttribute('data-code');
    renderInspector();
  });
});
$('#btnApplyCode').addEventListener('click', function () {
  const rec = findRec(state.selectedId);
  if (!rec) return;
  pushHistory();
  rec.script = rec.script || { onStart: '', onUpdate: '', onCollide: '' };
  rec.script[view.codeTarget] = $('#codeEditor').value;
  toast('ed.applied', '✓');
  log('code · ' + rec.name + ' · ' + view.codeTarget);
});
$('#btnResetCode').addEventListener('click', function () {
  $('#codeEditor').value = templateFor(view.codeTarget);
});

/* ================= Souris : sélection ================= */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPos = null;

canvas.addEventListener('pointerdown', function (e) {
  downPos = { x: e.clientX, y: e.clientY, button: e.button };
});
canvas.addEventListener('pointerup', function (e) {
  if (!downPos) return;
  const moved = Math.abs(e.clientX - downPos.x) + Math.abs(e.clientY - downPos.y);
  downPos = null;
  if (state.play) return;
  if (moved > 6) return;
  if (transform.dragging) return;
  if (e.button !== 0) return;

  const r = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(Array.from(reg.values()).map(function (rec) { return rec.obj3d; }), true);
  if (hits.length) {
    let o = hits[0].object;
    while (o && !o.userData.recId) o = o.parent;
    if (o && o.userData.recId) { select(o.userData.recId, e.shiftKey || e.metaKey || e.ctrlKey); return; }
  }
  select(null);
});

canvas.addEventListener('dblclick', function () {
  if (!state.play) focusSelection();
});

canvas.addEventListener('pointermove', function (e) {
  // en jeu, la souris est gérée par le runtime (pointer lock)
  if (state.play) return;
  const r = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pt = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, pt)) {
    $('#statusPos').textContent = 'x ' + pt.x.toFixed(1) + ' · y 0 · z ' + pt.z.toFixed(1);
  }
});

/* ================= Mode jeu ================= */
// État minimal de l'éditeur pour le jeu (le gameplay vit dans runtime.js)
const play = {
  playerRec: null,   // capsule violette = point de spawn
  saved: null,       // positions d'édition à restaurer en sortie
  hintTimer: 0
};

/* ================= Mode jeu — délégué au RUNTIME =================
   Le gameplay n'est plus écrit ici : il vit dans runtime.js, le même
   fichier que l'export HTML embarque. Ce qui est testé est ce qui sort.
   ================================================================ */
let runtime = null;

function makeHost() {
  return {
    onHud: function (st) {
      const el = $('#hudScore');
      if (el) el.textContent = Math.round(st.score);
      const hp = $('#hudHealth');
      if (hp) {
        hp.textContent = Math.round(st.health);
        hp.parentElement.classList.toggle('low', st.health <= 30);
      }
      const am = $('#hudAmmo');
      if (am) am.textContent = (st.ammo != null ? st.ammo : 0) + ' / ' + (st.ammoMax || 0);
      const kl = $('#hudKills');
      if (kl) kl.textContent = st.kills || 0;
      const vig = $('#hudVignette');
      if (vig && runtime) vig.style.opacity = String(Math.min(1, runtime.damageFlash || 0));
      const cr = $('#hudCross');
      if (cr && runtime) cr.style.opacity = runtime.input.ads ? '0.35' : '1';
    },
    onWin: function (msg) {
      state.won = true;
      SFX.win();
      const total = runtime ? runtime.entities.size : 0;
      $('#winScore').textContent = t('ed.scoreLabel') + ' : ' + state.score;
      $('#winCoins').textContent = msg || '';
      $('#winOverlay').hidden = false;
      log('🏆 ' + t('ed.winTitle'), 'ok');
    },
    onLose: function () {
      state.lost = true;
      SFX.lose();
      $('#loseOverlay').hidden = false;
      log('💥 ' + t('ed.loseTitle'), 'err');
    },
    onMessage: function (msg) { toast(msg, '💬'); log('💬 ' + msg); },
    onError: function (msg) { toast('⚠️ ' + msg, '⚠️'); log('code error · ' + msg, 'err'); },
    onPickup: function (kind) { SFX.coin(); },
    onHudExtra: null,
    onShot: function () { SFX.shoot ? SFX.shoot() : SFX.hit(); },
    onEnemyShot: function () { SFX.hit(); },
    onImpact: function (point, normal, color) {
      // petite gerbe additive : lisible sans coûter un système de particules
      if (!runtime) return;
      const T = THREE;
      const geo = new T.SphereGeometry(0.09, 6, 5);
      const mat = new T.MeshBasicMaterial({ color: color || 0xFFFFFF, transparent: true, opacity: 1 });
      const mesh = new T.Mesh(geo, mat);
      mesh.position.copy(point);
      if (normal) mesh.position.addScaledVector(normal, 0.02);
      scene3d.add(mesh);
      runtime.particles.push({ mesh, life: 0.28, maxLife: 0.28 });
    }
  };
}

/** Le joueur "éditeur" (capsule violette) devient le point de spawn. */
function startPlay() {
  if (state.play) return;

  let playerRec = null;
  reg.forEach(function (rec) { if (rec.type === 'player' && rec.obj3d.visible && !playerRec) playerRec = rec; });
  if (!playerRec) {
    playerRec = addObject('player', { position: [0, 2, 10], name: t('ed.addPlayer') });
    toast('ed.noPlayer', 'ℹ️');
    log(t('ed.noPlayer'), 'warn');
  }

  state.play = true;
  state.won = false;
  state.lost = false;
  state.score = 0;

  // 1) sauvegarde de l'état d'édition
  if (!play.saved) {
    play.saved = {};
    reg.forEach(function (rec) {
      play.saved[rec.id] = { pos: rec.obj3d.position.clone(), rot: rec.obj3d.rotation.clone() };
    });
  }

  // 2) la scène est sérialisée AVANT d'être masquée : sinon le runtime
  //    hérite de visible=false et ne dessine rien du tout.
  const snapshot = serialize();

  // 3) les objets d'édition sont masqués : le runtime crée les siens
  reg.forEach(function (rec) { rec.obj3d.visible = false; });
  grid.visible = false;
  tHelper.visible = false;

  // 4) runtime
  runtime = new KreoRuntime({
    THREE: THREE,
    scene: scene3d,
    canvas: canvas,
    renderer: renderer,
    data: JSON.parse(snapshot),
    host: makeHost()
  });
  // textures procédurales disponibles pour les matériaux
  runtime.textures = { noise: makeNoiseTexture(THREE, 64, 6, 0.55) };
  runtime.textureLib = buildTextureLib();
  runtime.build();
  runtime.resize(canvas.clientWidth, canvas.clientHeight, Math.min(window.devicePixelRatio, 2));

  // le joueur éditeur disparaît : le runtime le remplace
  if (play.playerRec) play.playerRec.obj3d.visible = false;

  // 4) entrées
  bindRuntimeInput();
  runtime.start();

  const hintEl = $('#playHint');
  hintEl.hidden = false;
  hintEl.classList.remove('fade-out');
  clearTimeout(play.hintTimer);
  play.hintTimer = setTimeout(function () { hintEl.classList.add('fade-out'); }, 5200);

  transform.detach();
  orbit.enabled = false;
  $('#hud').hidden = false;
  $('#winOverlay').hidden = true;
  $('#loseOverlay').hidden = true;
  $('#btnPlay').classList.add('playing');
  $('#playLabel').textContent = t('ed.stop');
  $('#playIcon').innerHTML = '<rect x="7" y="7" width="10" height="10" rx="2"/>';
  updateHUD();
  log(t('ed.playStarted'), 'play');
}

function stopPlay() {
  if (!state.play) return;
  state.play = false;

  if (runtime) { runtime.dispose(); runtime = null; }
  unbindRuntimeInput();

  // restauration de la scène d'édition
  reg.forEach(function (rec) {
    rec.obj3d.visible = true;
    const s = play.saved && play.saved[rec.id];
    if (s) { rec.obj3d.position.copy(s.pos); rec.obj3d.rotation.copy(s.rot); }
  });
  if (play.playerRec) play.playerRec.obj3d.visible = true;
  play.saved = null;
  grid.visible = view.grid;
  tHelper.visible = !!state.selectedId;

  orbit.enabled = true;
  if (state.selectedId) {
    const rec = findRec(state.selectedId);
    if (rec) transform.attach(rec.obj3d);
  }
  $('#hud').hidden = true;
  $('#winOverlay').hidden = true;
  $('#loseOverlay').hidden = true;
  $('#playHint').hidden = true;
  $('#btnPlay').classList.remove('playing');
  $('#playLabel').textContent = t('ed.play');
  $('#playIcon').innerHTML = '<path d="M8 5.5v13l10-6.5z"/>';
  log(t('ed.playStopped'), 'play');
}

function togglePlay() {
  if (state.play) stopPlay();
  else startPlay();
}

/* ---------- Débogueur ----------
   Affiche ce qui est invisible en jeu : colliders, rayons de tir, états des
   entités, valeurs de script. Sans ça, un niveau qui « ne marche pas » reste
   impossible à diagnostiquer. */
function buildTextureLib() {
  const lib = {};
  TEXTURE_KINDS.forEach(function (k) {
    if (k === 'none') return;
    lib[k] = getTexture(k);
  });
  return lib;
}

function initDebug() {
  const el = $('#dbgOverlay');
  if (!el || el.dataset.ready === '1') return;
  el.dataset.ready = '1';
  el.hidden = true;
}

function renderDebug() {
  const el = $('#dbgOverlay');
  if (!el || el.hidden || !runtime) return;
  const st = runtime.state;
  const p = runtime.player || {};
  const lines = [];
  lines.push('<b>FPS</b> ' + (stats.fps || 0).toFixed(0) + ' · <b>t</b> ' + (runtime.time || 0).toFixed(1) + 's');
  lines.push('<b>ENTITÉS</b> ' + runtime.entities.size + ' · colliders ' + (runtime.world.boxes ? runtime.world.boxes.length : '—'));
  lines.push('<b>JOUEUR</b> x ' + (p.pos ? p.pos.x.toFixed(2) : '—') + ' y ' + (p.pos ? p.pos.y.toFixed(2) : '—') + ' z ' + (p.pos ? p.pos.z.toFixed(2) : '—'));
  lines.push('sol ' + (p.grounded ? 'oui' : 'non') + ' · vitesse ' + (p.speedXZ ? p.speedXZ.toFixed(2) : '0') + ' m/s' + (p.crouched ? ' · accroupi' : '') + (p.sliding ? ' · glissade' : ''));
  lines.push('<b>VIE</b> ' + st.health + '/' + st.maxHealth + ' · <b>ARME</b> ' + (st.weapon ? st.weapon.name || st.weapon.id : '—') + ' · ' + st.ammo + '/' + st.ammoMax);
  lines.push('<b>SCORE</b> ' + st.score + ' · tués ' + st.kills + ' · niveau ' + (runtime.levelIndex + 1) + '/' + runtime.levelCount);
  const live = Array.from(runtime.entities.values()).filter(function (r) { return r.type === 'enemy'; });
  if (live.length) {
    lines.push('<b>ENNEMIS</b>');
    live.slice(0, 6).forEach(function (e) {
      lines.push('  ' + e.name + ' · ' + (e.alive ? 'vivant' : 'mort') + ' · ' + Math.round(e.hp) + ' pv'
        + (e.stateName ? ' · état ' + e.stateName : '')
        + ' · ' + e.root.position.distanceTo(p.pos || e.root.position).toFixed(1) + ' m');
    });
  }
  if (runtime._lastRay) {
    const r = runtime._lastRay;
    lines.push('<b>DERNIER RAYON</b> ' + (r.hit ? 'touché à ' + r.dist.toFixed(2) + ' m' : 'libre') +
      (r.hit && r.tag ? ' (' + r.tag + ')' : ''));
  }
  if (debugWatch) {
    lines.push('<b>SCRIPT</b> ' + escapeHtml(debugWatch));
  }
  const ent = lines.join('<br>');
  if (el.__cache !== ent) { el.innerHTML = ent; el.__cache = ent; }
}

let debugWatch = '';

function toggleDebug() {
  const el = $('#dbgOverlay');
  if (!el) return;
  el.hidden = !el.hidden;
  const btn = $('#btnDebug');
  if (btn) btn.classList.toggle('active', !el.hidden);
  if (state.play && runtime) {
    runtime.debugDraw = !el.hidden;
    // en mode debug on matérialise les colliders et les rayons
    renderDebugColliders(!el.hidden);
  }
  log((el.hidden ? '⏹ debug off' : '🐞 debug on'), 'warn');
}

function renderDebugColliders(on) {
  if (!runtime) return;
  if (debugHelper) { scene3d.remove(debugHelper); debugHelper = null; }
  if (!on) return;
  debugHelper = new THREE.Group();
  runtime.world.boxes.forEach(function (b) {
    const size = new THREE.Vector3().subVectors(b.max, b.min);
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0x36E5A0, wireframe: true, transparent: true, opacity: 0.55, depthTest: false
    }));
    m.position.copy(b.min).add(b.max).multiplyScalar(0.5);
    debugHelper.add(m);
  });
  scene3d.add(debugHelper);
}
let debugHelper = null;

function updateHUD() {
  if (runtime) runtime.host.onHud(runtime.state);
}

/* ---- Entrées du mode jeu (envoyées au runtime) ---- */
const rtKeys = { _down: {} };
function onRtKeyDown(e) {
  if (!runtime || !state.play) return;
  const el = e.target;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
  rtKeys._down[e.code] = true;
  feedKeys();
  if (e.code === 'space') { e.preventDefault(); }
  if (e.code === 'escape') { stopPlay(); }
}
function onRtKeyUp(e) {
  rtKeys._down[e.code] = false;
  if (runtime) feedKeys();
}
function feedKeys() {
  if (!runtime) return;
  const d = rtKeys._down;
  runtime.input.forward = !!d.KeyW || !!d.KeyZ;
  runtime.input.back = !!d.KeyS;
  runtime.input.left = !!d.KeyA || !!d.KeyQ;
  runtime.input.right = !!d.KeyD;
  runtime.input.jump = !!d.Space;
  runtime.input.run = !!d.ShiftLeft || !!d.ShiftRight;
  runtime.input.crouch = !!(d.ControlLeft || d.ControlRight || d.KeyC);
  runtime.input.ads = !!(rtKeys.mouse && rtKeys.mouse.right);
}
function onRtMouseMove(e) {
  if (!runtime || !state.play) return;
  if (document.pointerLockElement !== canvas) return;
  if (Math.abs(e.movementX) > 220 || Math.abs(e.movementY) > 220) return;
  runtime.input.lookX = e.movementX * 0.0022;
  runtime.input.lookY = e.movementY * 0.0022;
}
function onRtMouseDown(e) {
  if (!runtime || !state.play) return;
  rtKeys.mouse = rtKeys.mouse || {};
  rtKeys.mouse[e.button] = true;
  if (e.button === 0) {
    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch (err) {}
    }
    if (runtime.onFire) runtime.onFire();
  }
  feedKeys();
}
function onRtMouseUp(e) {
  if (!rtKeys.mouse) rtKeys.mouse = {};
  rtKeys.mouse[e.button] = false;
  if (runtime) feedKeys();
}
function bindRuntimeInput() {
  document.addEventListener('keydown', onRtKeyDown, true);
  document.addEventListener('keyup', onRtKeyUp, true);
  document.addEventListener('mousemove', onRtMouseMove);
  document.addEventListener('mousedown', onRtMouseDown);
  document.addEventListener('mouseup', onRtMouseUp);
  if (canvas.requestPointerLock) {
    try { canvas.requestPointerLock(); } catch (e) {}
  }
}
function unbindRuntimeInput() {
  document.removeEventListener('keydown', onRtKeyDown, true);
  document.removeEventListener('keyup', onRtKeyUp, true);
  document.removeEventListener('mousemove', onRtMouseMove);
  document.removeEventListener('mousedown', onRtMouseDown);
  document.removeEventListener('mouseup', onRtMouseUp);
  if (document.exitPointerLock) { try { document.exitPointerLock(); } catch (e) {} }
}

/* Compat : d'anciens chemins appellent encore winGame / loseGame */
function winGame(msg) { if (runtime) runtime.win(msg); else makeHost().onWin(msg); }
function loseGame() { if (runtime) runtime.state.lost = true; makeHost().onLose(); }

/* ================= Sauvegarde ================= */
const KEY = 'kreo-project3d';
const AUTOKEY = 'kreo-autosave3d';

function save() {
  try {
    localStorage.setItem(KEY, serialize());
    state.dirty = false;
    updateStatusSave();
    toast('ed.saveOk', '💾');
    log('💾 ' + t('ed.saveOk'), 'ok');
  } catch (e) {
    toast('⚠️', '⚠️');
  }
}

/* ================= Export : jeu HTML autonome =================
   Un seul fichier .html, double-cliquable, 100 % hors ligne :
   three.js + le runtime + la scène + les modèles, tout inline.
   ============================================================= */
let THREE_SOURCE = null;
async function grabThreeSource() {
  if (THREE_SOURCE) return THREE_SOURCE;
  const core = await (await fetch('../assets/vendor/three/three.core.js')).text();
  const mod = await (await fetch('../assets/vendor/three/three.module.js')).text();
  THREE_SOURCE = { core: core, mod: mod };
  return THREE_SOURCE;
}

let GLTF_SOURCE = null;
async function grabGltfSource() {
  if (GLTF_SOURCE) return GLTF_SOURCE;
  const raw = await (await fetch('../assets/vendor/three/addons/loaders/GLTFLoader.js')).text();
  // on retire imports et exports : la fusion s'occupe du reste
  GLTF_SOURCE = raw
    .replace(/^import \{[\s\S]*?\} from '[^']*';$/gm, '')
    .replace(/^import '[^']*';$/gm, '')
    .replace(/^export \{[^}]*\};?$/gm, '')
    .replace(/^export class /gm, 'class ')
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ');
  return GLTF_SOURCE;
}

/** Le module runtime est lu depuis le fichier : une seule source de vérité. */
let RUNTIME_SOURCE = null;
async function grabRuntimeSource() {
  if (RUNTIME_SOURCE) return RUNTIME_SOURCE;
  RUNTIME_SOURCE = await (await fetch('runtime.js?raw=1')).text();
  return RUNTIME_SOURCE;
}

/**
 * Fusionne trois sources ES modules en un seul script : renomme dans les
 * suivantes toute déclaration qui existe déjà, pour éviter les collisions
 * (`_m1$1`, `clamp`...). Retourne le bundle `three.core` + `three.module` séparé
 * du runtime, car le runtime doit pouvoir être patché autrement.
 */
/**
 * Applique `re` uniquement au code, jamais aux littéraux.
 * three contient de longues chaînes GLSL (`clamp(...)`) : un renommage
 * global y casse les shaders. On protège chaînes, gabarits et commentaires.
 */
function replaceCodeOnly(src, re, replacement) {
  let out = '';
  let buf = '';
  let i = 0;
  const flush = () => { out += buf.replace(re, replacement); buf = ''; };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') {
      flush();
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += src.slice(i, stop); i = stop; continue;
    }
    if (c === '/' && n === '*') {
      flush();
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop); i = stop; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      flush();
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) { j++; break; }
        // gabarit multi-lignes : on avale tout jusqu'au backtick fermant
        j++;
      }
      out += src.slice(i, j); i = j; continue;
    }
    buf += c; i++;
  }
  flush();
  return out;
}

function mergeModules(sources) {
  const DECL = /^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  const names = (src) => {
    const out = new Set();
    let m;
    const re = new RegExp(DECL.source, 'gm');
    while ((m = re.exec(src))) out.add(m[1]);
    return out;
  };
  const taken = new Set();
  const out = [];
  for (let i = 0; i < sources.length; i++) {
    let src = sources[i];
    if (i > 0) {
      const own = names(src);
      let renamed = false;
      for (const name of own) {
        if (!taken.has(name)) continue;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        src = replaceCodeOnly(src, new RegExp('\\b' + escaped + '\\b', 'g'), 'kt' + i + '_' + name.replace(/\$/g, '_'));
        renamed = true;
      }
      if (renamed) { /* rien d'autre à faire : remplacement global */ }
    }
    for (const n of names(src)) taken.add(n);
    out.push(src);
  }
  return out.join('\n');
}

const ENV_SRC = `
/* IBL : indispensable pour que les surfaces métalliques ne rendent pas noir */
(function env() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
  const pos = sky.geometry.attributes.position, cols = [];
  const top = new THREE.Color('#4E7FC4'), mid = new THREE.Color('#A8C4E4'), bot = new THREE.Color('#5A6472');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 58;
    if (y >= 0) c.copy(mid).lerp(top, Math.pow(y, 0.6)); else c.copy(mid).lerp(bot, Math.min(1, -y * 1.6));
    cols.push(c.r, c.g, c.b);
  }
  sky.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  es.add(sky);
  const disc = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.4, 4.4) }));
  disc.position.set(24, 34, 18); es.add(disc);
  scene.environment = pmrem.fromScene(es, 0.04).texture;
  scene.environmentIntensity = 0.85;
  sky.geometry.dispose(); sky.material.dispose();
})();
`;

function buildGameHtml(three, runtimeSrc, projectJson, title) {
  // three.module.js importe './three.core.js' : on inline les deux dans un
  // même module, l'import devient inutile.
  // three.module.js ne ré-exporte pas tout three.core.js : on garde ses
  // déclarations ET on neutralise son bloc `export` final.
  let __n = 0;
  const core = three.core.replace(/^export \{/gm, () => 'const __core_exports_unused' + (__n++) + ' = {');
  const mod = three.mod
    .replace(/^import \{[^}]*\} from '\.\/three\.core\.js';$/m, '')
    .replace(/^export \{[^}]*\} from '\.\/three\.core\.js';$/m, '')
    .replace(/^export \{[^}]*\};?$/gm, '');
  // le runtime importe three : on le rend autonome
  const rt = runtimeSrc
    .replace(/^export const RUNTIME_VERSION[^\n]*$/m, 'const RUNTIME_VERSION = "1.0.0";')
    .replace(/^export function /gm, 'function ')
    .replace(/^export class /gm, 'class ')
    .replace(/^export default [^\n]*$/m, '');

  // trois sources → un seul module sans collision de noms
  // GLTFLoader est nécessaire au runtime pour recharger les modèles
  // embarqués (data URL) : on l'inline aussi dans le bundle du jeu.
  const gltfSrc = three.gltf || '';
  const bundledBody = mergeModules([core, mod, rt, gltfSrc].filter(Boolean));
  // le runtime et le jeu utilisent `THREE.*` / `new THREE.Scene()` : on
  // reconstruit un objet namespace à la fin du bundle.
  const bundled = bundledBody + `
const THREE = {
  Scene, PerspectiveCamera, WebGLRenderer, Color, Vector2, Vector3, Vector4,
  Group, Mesh, Object3D, Box3, Box2, Sphere, Plane, Ray, Raycaster, Matrix4,
  Euler, Quaternion, MathUtils, Clock, Layers, Frustum,
  BufferGeometry, BufferAttribute, InstancedMesh, LineSegments, Line, Points,
  BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, TorusGeometry,
  CapsuleGeometry, OctahedronGeometry, PlaneGeometry, RingGeometry,
  CircleGeometry, IcosahedronGeometry, DodecahedronGeometry, TorusKnotGeometry,
  MeshStandardMaterial, MeshPhysicalMaterial, MeshBasicMaterial,
  MeshLambertMaterial, MeshPhongMaterial, LineBasicMaterial, PointsMaterial,
  SpriteMaterial, ShadowMaterial, Sprite,
  AmbientLight, HemisphereLight, DirectionalLight, PointLight, SpotLight, RectAreaLight,
  Fog, FogExp2, CanvasTexture, Texture, DataTexture,
  CubeTexture, TextureLoader, CubeTextureLoader, RGBAFormat, RGFormat,
  UnsignedByteType, HalfFloatType, FloatType, UnsignedShortType,
  LinearFilter, NearestFilter, LinearMipmapLinearFilter,
  RepeatWrapping, ClampToEdgeWrapping, MirroredRepeatWrapping,
  SRGBColorSpace, LinearSRGBColorSpace, NoColorSpace,
  ACESFilmicToneMapping, NeutralToneMapping, AgXToneMapping, ReinhardToneMapping,
  LinearToneMapping, NoToneMapping, CineonToneMapping, CustomToneMapping,
  PCFShadowMap, PCFSoftShadowMap, BasicShadowMap, VSMShadowMap,
  FrontSide, BackSide, DoubleSide, NormalBlending, AdditiveBlending,
  MultiplyBlending, SubtractiveBlending, NoBlending, CustomBlending,
  EquirectangularReflectionMapping, EquirectangularRefractionMapping,
  CubeReflectionMapping, CubeRefractionMapping, UVMapping,
  AnimationMixer, AnimationClip, AnimationAction, LoopOnce, LoopRepeat, LoopPingPong,
  PropertyBinding, KeyframeTrack, VectorKeyframeTrack, QuaternionKeyframeTrack,
  ColorKeyframeTrack, NumberKeyframeTrack, StringKeyframeTrack,
  Box3Helper, GridHelper, AxesHelper, ArrowHelper, CameraHelper,
  SpotLightHelper, DirectionalLightHelper, PointLightHelper, HemisphereLightHelper,
  SkeletonHelper, PolarGridHelper, PlaneHelper,
  SkinnedMesh, Skeleton, Bone, Audio, AudioListener, PositionalAudio, AudioContext,
  EventDispatcher, Loader, FileLoader, ImageLoader, ImageBitmapLoader,
  ObjectLoader, MaterialLoader, BufferGeometryLoader, LoaderUtils,
  Path, Shape, ShapeGeometry, ShapeUtils, Curve, CurvePath, CatmullRomCurve3,
  SplineCurve, LineCurve3, QuadraticBezierCurve3, CubicBezierCurve3,
  Interpolant, LinearInterpolant, CubicInterpolant, DiscreteInterpolant,
  Triangle, Line3,
  LOD, BatchedMesh, InstancedBufferAttribute, InstancedBufferGeometry,
  WebGLRenderTarget, WebGLCubeRenderTarget, CubeCamera,
  PMREMGenerator, DepthTexture, DataArrayTexture, CompressedTexture,
  Float32BufferAttribute, Int32BufferAttribute, Uint32BufferAttribute,
  Uint16BufferAttribute, Uint8BufferAttribute, HalfFloatType, LinearSRGBColorSpace,
  NoColorSpace, CanvasTexture, OrthographicCamera, WebGLRenderTarget,
  ShaderMaterial, PlaneGeometry, MeshBasicMaterial, FloatType, RGBAFormat,
  LinearFilter, NearestFilter, DoubleSide, BackSide, FrontSide, RepeatWrapping,
  SRGBColorSpace, GLTFLoader, LoopOnce, LoopRepeat, LoopPingPong,
  AnimationMixer, AnimationClip, REVISION
};
`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — KREO</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; overflow: hidden; background: #0b0e14; }
  canvas { display: block; width: 100vw; height: 100vh; }
  #hud { position: fixed; inset: 0; pointer-events: none; font: 600 13px/1.2 system-ui, sans-serif; color: #fff; }
  .bar { position: absolute; bottom: 22px; left: 22px; display: flex; gap: 10px; align-items: center; }
  .pill { background: rgba(12,16,24,.66); border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 8px 12px; backdrop-filter: blur(8px); }
  .hp { width: 190px; height: 8px; border-radius: 5px; background: rgba(255,255,255,.16); overflow: hidden; }
  .hp > i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg,#34d399,#10b981); transition: width .18s; }
  .score { position: absolute; top: 20px; left: 22px; font-size: 15px; letter-spacing: .06em; }
  .cross { position: absolute; left: 50%; top: 50%; width: 18px; height: 18px; translate: -50% -50%; }
  .cross::before, .cross::after { content: ''; position: absolute; background: rgba(255,255,255,.85); }
  .cross::before { left: 50%; top: 0; width: 1.5px; height: 100%; translate: -50% 0; }
  .cross::after { top: 50%; left: 0; height: 1.5px; width: 100%; translate: 0 -50%; }
  #start { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(8,11,18,.82); color: #fff; font-family: system-ui, sans-serif; z-index: 5; }
  #start .card { text-align: center; }
  #start h1 { font-size: 30px; margin: 0 0 6px; letter-spacing: -.02em; }
  #start p { opacity: .65; margin: 0 0 22px; font-size: 14px; }
  #start button { border: 0; border-radius: 12px; padding: 14px 34px; font: 700 15px system-ui; cursor: pointer;
    background: linear-gradient(180deg,#5eead4,#22d3ee); color: #06202a; }
  #msg { position: fixed; left: 50%; top: 22%; translate: -50% 0; font: 600 15px system-ui; color: #fff;
    background: rgba(12,16,24,.8); padding: 10px 16px; border-radius: 10px; opacity: 0; transition: opacity .25s; }
  #msg.show { opacity: 1; }
  #over { position: fixed; inset: 0; display: none; place-items: center; background: rgba(8,11,18,.85); color: #fff; font-family: system-ui; z-index: 6; }
  #over.show { display: grid; }
  #over h2 { font-size: 28px; margin: 0 0 10px; }
  #over button { margin-top: 18px; border: 0; border-radius: 10px; padding: 12px 26px; font: 700 14px system-ui; cursor: pointer; background: #22d3ee; color: #06202a; }
</style>
</head>
<body>
<canvas id="gl"></canvas>
<div id="hud" hidden>
  <div id="vig" style="position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(190,20,30,.6) 100%);transition:opacity .12s"></div>
  <div class="score"><span id="score">0</span> · <span id="kills">0</span> KO</div>
  <div class="cross"></div>
  <div class="bar">
    <div class="pill"><div class="hp"><i id="hpbar"></i></div></div>
    <div class="pill"><span id="ammo">—</span></div>
  </div>
</div>
<div id="msg"></div>
<div id="start"><div class="card">
  <h1>${escapeHtml(title)}</h1>
  <p>ZQSD / WASD · Souris · Échap pour la souris</p>
  <button id="btnStart">JOUER</button>
</div></div>
<div id="over"><div class="card" style="text-align:center">
  <h2 id="overTitle">Partie terminée</h2>
  <p id="overScore"></p>
  <button onclick="location.reload()">REJOUER</button>
</div></div>
<script type="module">
${bundled}

/* ---------- projet ---------- */
const PROJECT = ${projectJson};

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
/* Réglages de scène définis dans l'éditeur (ciel, soleil, ambiance,
   exposition) : le jeu exporté doit être identique à ce qu'on a réglé. */
const ENV = (function () {
  let sc = PROJECT.scene || {};
  if (Array.isArray(PROJECT.scenes) && PROJECT.scenes.length) {
    const i = Math.min(PROJECT.active || 0, PROJECT.scenes.length - 1);
    sc = (PROJECT.scenes[i] && PROJECT.scenes[i].data && PROJECT.scenes[i].data.scene) || sc;
  }
  return Object.assign({
    fog: true, fogColor: '#B9C9E2', skyTop: '#6E9BD8', skyBottom: '#DCE7F2',
    sunColor: '#FFF2DE', sunIntensity: 2.3, ambient: 0.32, exposure: 1.08
  }, sc);
})();
renderer.toneMappingExposure = ENV.exposure;

const scene = new THREE.Scene();
if (ENV.fog !== false) scene.fog = new THREE.Fog(new THREE.Color(ENV.fogColor), 60, 260);
(function sky() {
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  const col = new THREE.Color(ENV.skyTop), col2 = new THREE.Color(ENV.skyBottom);
  const mid = col.clone().lerp(col2, 0.6).getStyle();
  grad.addColorStop(0, col.getStyle()); grad.addColorStop(.55, mid); grad.addColorStop(1, col2.getStyle());
  g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
})();
scene.add(new THREE.HemisphereLight(0xddebff, 0x3a4455, 0.9));
scene.add(new THREE.AmbientLight(0xffffff, ENV.ambient));
const sun = new THREE.DirectionalLight(new THREE.Color(ENV.sunColor), ENV.sunIntensity);
sun.position.set(20, 32, 14); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
sun.shadow.camera.far = 200; sun.shadow.bias = -0.0004;
scene.add(sun);
${ENV_SRC}
const ui = {
  score: document.getElementById('score'),
  kills: document.getElementById('kills'),
  hpbar: document.getElementById('hpbar'),
  ammo: document.getElementById('ammo'),
  msg: document.getElementById('msg'),
  vig: document.getElementById('vig'),
  over: document.getElementById('over'),
  overTitle: document.getElementById('overTitle'),
  overScore: document.getElementById('overScore')
};
let msgTimer = 0;

const rt = new KreoRuntime({
  THREE, scene, canvas, renderer,
  data: PROJECT,
  host: {
    onHud(st) {
      if (ui.vig) ui.vig.style.opacity = String(Math.min(1, rt.damageFlash || 0));
      ui.score.textContent = Math.round(st.score);
      ui.kills.textContent = st.kills || 0;
      ui.hpbar.style.width = Math.max(0, Math.min(100, st.health / st.maxHealth * 100)) + '%';
      ui.ammo.textContent = st.ammo != null ? st.ammo + ' / ' + st.ammoMax : '—';
    },
    onMessage(m) {
      ui.msg.textContent = m; ui.msg.classList.add('show');
      clearTimeout(msgTimer); msgTimer = setTimeout(() => ui.msg.classList.remove('show'), 2200);
    },
    onWin(m) { ui.overTitle.textContent = 'Victoire'; ui.overScore.textContent = m || ''; ui.over.classList.add('show'); rt.stop(); },
    onLose() { ui.overTitle.textContent = 'Échec'; ui.overScore.textContent = 'Score : ' + rt.state.score; ui.over.classList.add('show'); rt.stop(); },
    onError(e) { console.error('[KREO]', e); }
  }
});
rt.textures = { noise: makeNoiseTexture(THREE, 64, 6, 0.55) };
rt.build();

function resize() {
  rt.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
}
addEventListener('resize', resize);
resize();

/* ---------- entrées ---------- */
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true; feed();
  if (e.code === 'space') e.preventDefault();
  if (e.code === 'escape' && document.pointerLockElement) document.exitPointerLock();
});
addEventListener('keyup', (e) => { keys[e.code] = false; feed(); });
function feed() {
  rt.input.forward = !!(keys.KeyW || keys.KeyZ);
  rt.input.back = !!keys.KeyS;
  rt.input.left = !!(keys.KeyA || keys.KeyQ);
  rt.input.right = !!keys.KeyD;
  rt.input.jump = !!keys.Space;
  rt.input.run = !!(keys.ShiftLeft || keys.ShiftRight);
  rt.input.crouch = !!(keys.ControlLeft || keys.ControlRight || keys.KeyC);
}
let dragging = false;
canvas.addEventListener('mousedown', (e) => {
  if (!document.pointerLockElement) { canvas.requestPointerLock && canvas.requestPointerLock(); return; }
  if (e.button === 0 && rt.onFire) rt.onFire();
  if (e.button === 2) { rt.input.ads = true; }
});
canvas.addEventListener('mouseup', (e) => { if (e.button === 2) rt.input.ads = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement) return;
  if (Math.abs(e.movementX) > 220 || Math.abs(e.movementY) > 220) return;
  rt.input.lookX = e.movementX * 0.0022;
  rt.input.lookY = e.movementY * 0.0022;
});

document.getElementById('btnStart').addEventListener('click', () => {
  document.getElementById('start').style.display = 'none';
  document.getElementById('hud').hidden = false;
  canvas.requestPointerLock && canvas.requestPointerLock();
  rt.start();
});
</script>
</body>
</html>`;
}

async function exportGame() {
  try {
    toast('ed.exporting', '⏳');
    const [three, runtimeSrc, gltf] = await Promise.all([grabThreeSource(), grabRuntimeSource(), grabGltfSource()]);
    three.gltf = gltf;
    const html = buildGameHtml(three, runtimeSrc, serialize(), state.scene.name || 'Mon jeu');
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const slug = (state.scene.name || 'mon-jeu').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.download = (slug || 'mon-jeu') + '.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('ed.exportOk', '🎮');
    log('🎮 ' + t('ed.exportOk'), 'ok');
  } catch (e) {
    console.error(e);
    toast('ed.exportKo', '⚠️');
    log('export error · ' + e.message, 'err');
  }
}

function exportFile() {
  const blob = new Blob([serialize()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.scene.name || 'mon-jeu') + '.kreo3d.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  log('📤 export');
}

function importFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = function () {
    const f = input.files && input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(String(reader.result));
        if (data && Array.isArray(data.objects) && data.objects.length && data.objects[0].position) {
          pushHistory();
          rebuildFromData(data);
          toast('ed.importOk', '✅');
          log('📥 ' + t('ed.importOk'), 'ok');
        } else if (data && Array.isArray(data.objects) && data.objects.length && data.objects[0].x !== undefined) {
          toast('ed.old2d', '⚠️');
          log('⚠️ ' + t('ed.old2d'), 'warn');
        } else {
          toast('ed.importKo', '⚠️');
        }
      } catch (e) {
        toast('ed.importKo', '⚠️');
      }
    };
    reader.readAsText(f);
  };
  input.click();
}

function rebuildFromData(data, keepHistory, keepSceneList) {
  // Purge
  Array.from(reg.values()).forEach(function (rec) {
    scene3d.remove(rec.obj3d);
    disposeObj(rec.obj3d);
  });
  reg.clear();
  select(null);

  // Un chargement de PROJET (fichier, autosave) peut contenir plusieurs
  // niveaux. Un simple changement de niveau, lui, ne doit surtout pas
  // réinitialiser la liste — d'où l'option `keepScenes`.
  if (!keepSceneList) {
    if (Array.isArray(data.scenes) && data.scenes.length) {
      state.scenes = data.scenes.map(function (sc) {
        return { name: sc.name || 'Niveau', data: sc.data || null };
      });
      state.sceneIndex = Math.min(data.active || 0, state.scenes.length - 1);
      const active = state.scenes[state.sceneIndex];
      if (active && active.data) data = active.data;
    } else {
      state.scenes = [{ name: (data.scene && data.scene.name) || 'Ma scène', data: null }];
      state.sceneIndex = 0;
    }
  }
  if (data.scene) state.scene = Object.assign({
    name: 'Ma scène', fog: true, fogColor: '#B9C9E2',
    skyTop: '#6E9BD8', skyBottom: '#DCE7F2',
    sunColor: '#FFF2DE', sunIntensity: 2.3, ambient: 0.32, exposure: 1.08
  }, data.scene);
  $('#projectName').value = state.scene.name || 'Ma scène';
  $('#inSceneName').value = state.scene.name || 'Ma scène';
  $('#inBg').value = state.scene.fogColor || '#B9C9E2';
  applySceneSettings();

  (data.objects || []).forEach(function (p) {
    // modèle embarqué : on le réenregistre avant de créer l'objet
    if (p.type === 'model' && p.model && p.modelData && !MODELS.has(p.model)) {
      const entry = { gltf: null, url: p.modelData, dataUrl: p.modelData };
      MODELS.set(p.model, entry);
      gltfLoader.loadAsync(p.modelData).then(function (gltf) {
        entry.gltf = gltf;
        entry.animations = (gltf.animations || []).length;
        entry.gltf.scene.traverse(function (o) {
          if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
        });
        // remplace le placeholder par le vrai modèle
        const rec = Array.from(reg.values()).find(function (r) { return r.model === p.model && r.obj3d; });
        if (rec) {
          while (rec.obj3d.children.length) rec.obj3d.remove(rec.obj3d.children[0]);
          rec.obj3d.add(cloneSkinned(gltf.scene));
        }
      }).catch(function () { /* placeholder conservé */ });
    }
    const created = createObject(p.type, p);
    if (created && p.parent && p.parentOffset) {
      const par = findRec(p.parent);
      if (par) {
        created.parent = p.parent;
        created.parentOffset = p.parentOffset;
        if (created.obj3d.parent) created.obj3d.parent.remove(created.obj3d);
        par.obj3d.add(created.obj3d);
        created.obj3d.position.set(p.parentOffset[0], p.parentOffset[1], p.parentOffset[2]);
      }
    }
  });

  let max = 0;
  reg.forEach(function (rec) {
    const m = /(\d+)$/.exec(rec.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  nextId = max + 1;

  renderHierarchy();
  renderInspector();
  if (typeof renderScenes === 'function') renderScenes();
  markDirty();
}

function newProject() {
  pushHistory();
  rebuildFromData({
    scene: { name: 'Ma scène', fog: true, fogColor: '#B9C9E2' },
    objects: []
  });
  log('＋ ' + t('ed.new'));
}

/* ================= Scène de démonstration ================= */
function demoScene() {
  pushHistory();
  const objs = [
    // Sol
    { type: 'plane', name: 'Sol', position: [0, -0.25, 0], scale: [3.2, 1, 3.2], material: { color: '#5D6B85', roughness: 0.9 } },
    // Plateformes
    { type: 'cube', name: 'Plateforme A', position: [-6, 1.2, 2], scale: [2.2, 1.2, 2.2], material: { color: '#7C5CFF' } },
    { type: 'cube', name: 'Plateforme B', position: [-1.5, 2.4, -1.5], scale: [1.8, 1.2, 1.8], material: { color: '#22B8CF' } },
    { type: 'cube', name: 'Plateforme C', position: [3, 3.6, -4.5], scale: [1.6, 1.2, 1.6], material: { color: '#F5A623' } },
    // Escalier
    { type: 'cube', name: 'Marche 1', position: [7, 0.5, 3], scale: [1.2, 0.5, 1.2], material: { color: '#8FA3C8' } },
    { type: 'cube', name: 'Marche 2', position: [7, 1.3, 0.8], scale: [1.2, 0.5, 1.2], material: { color: '#8FA3C8' } },
    { type: 'cube', name: 'Marche 3', position: [7, 2.1, -1.4], scale: [1.2, 0.5, 1.2], material: { color: '#8FA3C8' } },
    // Décor
    { type: 'sphere', name: 'Décor boule', position: [-9, 1.4, -5], material: { color: '#E879F9', metalness: 0.3, roughness: 0.4 } },
    { type: 'torus', name: 'Décor anneau', position: [10, 1.6, -6], rotation: [90, 0, 0], material: { color: '#22D3EE', metalness: 0.6, roughness: 0.3 } },
    { type: 'cylinder', name: 'Décor colonne', position: [-4, 1.6, -7], material: { color: '#C7B9FF' } },
    // Joueur
    { type: 'player', name: 'Joueur', position: [0, 1.2, 12], speed: 7, jump: 10 },
    // Pièces
    { type: 'coin', name: 'Pièce 1', position: [-6, 3.6, 2], value: 10 },
    { type: 'coin', name: 'Pièce 2', position: [-1.5, 4.8, -1.5], value: 10 },
    { type: 'coin', name: 'Pièce 3', position: [3, 6, -4.5], value: 10 },
    { type: 'coin', name: 'Pièce 4', position: [7, 3.6, -1.4], value: 10 },
    { type: 'coin', name: 'Pièce 5', position: [0, 1.6, 6], value: 5 },
    // Objectif
    { type: 'goal', name: 'Objectif', position: [0, 0, -14] },
    // Lumières
    { type: 'sun', name: 'Soleil', position: [14, 22, 10], rotation: [-35, 35, 0] },
    { type: 'point', name: 'Lumière chaude', position: [-6, 5, 4], light: { color: '#FFC98A', intensity: 80 } }
  ];
  rebuildFromData({
    scene: { name: 'Démo KREO', fog: true, fogColor: '#B9C9E2' },
    objects: objs
  });
  toast('ed.demoLoaded', '⭐');
  log('⭐ ' + t('ed.demoLoaded'), 'ok');
}

/* ================= Import de modèles GLB ================= */
async function importModel(file) {
  if (!file) return null;
  const name = file.name.replace(/\.(glb|gltf)$/i, '');
  const url = URL.createObjectURL(file);
  log('⏳ ' + t('ed.modelLoading') + ' ' + name, 'warn');
  try {
    const gltf = await gltfLoader.loadAsync(url);
    gltf.scene.traverse(function (o) {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    // data URL : la scène devient autonome (sauvegarde ET export)
    const dataUrl = await new Promise(function (resolve) {
      const fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { resolve(null); };
      fr.readAsDataURL(file);
    });
    MODELS.set(name, { gltf: gltf, url: url, dataUrl: dataUrl, animations: (gltf.animations || []).length });

    pushHistory();
    const rec = addObject('model', { model: name, name: name });
    // pose le modèle au sol
    const box = new THREE.Box3().setFromObject(rec.obj3d);
    if (isFinite(box.min.y)) rec.obj3d.position.y = -box.min.y + 0.01;
    log('✅ ' + t('ed.modelLoaded') + ' ' + name + ' (' + (gltf.animations || []).length + ' anim)', 'ok');
    return rec;
  } catch (e) {
    console.error(e);
    log('❌ ' + t('ed.modelError') + ' : ' + name, 'err');
    return null;
  }
}

/* Ouverture d'un sélecteur de fichiers GLB / GLTF */
function pickModel() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.glb,.gltf,model/gltf-binary,model/gltf+json';
  input.onchange = function () {
    if (input.files && input.files[0]) importModel(input.files[0]);
  };
  input.click();
}

/* Glisser-déposer d'un .glb dans le viewport */
(function initDrop() {
  const vp = $('#viewport');
  if (!vp) return;
  ['dragenter', 'dragover'].forEach(function (ev) {
    vp.addEventListener(ev, function (e) { e.preventDefault(); vp.classList.add('dropping'); });
  });
  ['dragleave', 'dragend'].forEach(function (ev) {
    vp.addEventListener(ev, function () { vp.classList.remove('dropping'); });
  });
  vp.addEventListener('drop', function (e) {
    e.preventDefault();
    vp.classList.remove('dropping');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /\.(glb|gltf)$/i.test(f.name)) importModel(f);
    else toast('ed.modelError', '⚠️');
  });
})();

/* ================= Boucle de rendu ================= */
let lastTime = performance.now();
let fpsAcc = 0, fpsCount = 0, fpsTimer = 0;
const stats = { fps: 0 };

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.04, (now - lastTime) / 1000);
  lastTime = now;

  if (!state.play) {
    orbit.update();
    // animations des modèles importés en mode édition
    reg.forEach(function (rec) {
      const m = rec.obj3d && rec.obj3d.userData && rec.obj3d.userData.mixer;
      if (m) m.update(dt);
    });
    if (selBox) selBox.update();
    renderer.render(scene3d, camera);
  }
  // en jeu, c'est le runtime qui possède la boucle et le rendu

  // FPS
  fpsAcc += 1 / Math.max(dt, 0.0001);
  fpsCount++;
  fpsTimer += dt;
  if (fpsTimer > 0.5) {
    stats.fps = Math.round(fpsAcc / fpsCount);
    $('#vpFps').textContent = stats.fps + ' FPS';
    fpsAcc = 0; fpsCount = 0; fpsTimer = 0;
  }
  if (state.play && !$('#dbgOverlay').hidden) renderDebug();
}

function resize() {
  const vp = $('#viewport');
  const w = vp.clientWidth, h = vp.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($('#viewport'));

/* ================= Clavier ================= */
state.keys = {};
function isTyping(e) {
  const el = e.target;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}
document.addEventListener('keydown', function (e) {
  const key = e.key.toLowerCase();
  state.keys[key] = true;
  state.keys[e.code.toLowerCase()] = true;
  if (isTyping(e)) return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (!state.play) togglePlay();
    return;
  }
  if (key === 'escape') {
    if (state.play) stopPlay();
    else select(null);
    return;
  }
  if (key === 'delete' || key === 'backspace') {
    if (!state.play && state.selectedId) { e.preventDefault(); deleteObject(state.selectedId); }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && key === 'd') {
    e.preventDefault();
    if (!state.play && state.selectedId) duplicateObject(state.selectedId);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && key === 's') { e.preventDefault(); save(); return; }

  if (key === 'g' && !state.play) { toggleGrid(); return; }
  if (key === 'f' && !state.play) { focusSelection(); return; }
  if (key === 'w' && !state.play && e.altKey !== true && !state.play) {
    // W = mode déplacer, sauf en jeu (W = avancer)
    setMode('translate'); return;
  }
  if (key === 'e' && !state.play) { setMode('rotate'); return; }
  if (key === 'r' && !state.play) { setMode('scale'); return; }

  // Flèches : déplacer la sélection
  if (!state.play && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(key) !== -1) {
    const rec = findRec(state.selectedId);
    if (!rec) return;
    e.preventDefault();
    pushHistory();
    const step = e.shiftKey ? 1 : 0.25;
    if (key === 'arrowleft') rec.obj3d.position.x -= step;
    if (key === 'arrowright') rec.obj3d.position.x += step;
    if (key === 'arrowup') rec.obj3d.position.z -= step;
    if (key === 'arrowdown') rec.obj3d.position.z += step;
    syncTransformInputs();
    markDirty();
    if (selBox) selBox.update();
  }
});
document.addEventListener('keyup', function (e) {
  state.keys[e.key.toLowerCase()] = false;
  state.keys[e.code.toLowerCase()] = false;
});

/* ================= Boutons ================= */
function setMode(mode) {
  view.mode = mode;
  transform.setMode(mode);
  $$('#gizmoGroup .tb-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-mode') === mode);
  });
}
$$('#gizmoGroup .tb-btn').forEach(function (b) {
  b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
});

function toggleGrid() {
  view.grid = !view.grid;
  grid.visible = view.grid;
  $('#btnGrid').classList.toggle('active', view.grid);
}
$('#btnGrid').addEventListener('click', toggleGrid);
$('#btnSnap').addEventListener('click', function () {
  view.snap = !view.snap;
  $('#btnSnap').classList.toggle('active', view.snap);
  transform.setTranslationSnap(view.snap ? 0.5 : null);
  transform.setRotationSnap(view.snap ? THREE.MathUtils.degToRad(15) : null);
  transform.setScaleSnap(view.snap ? 0.1 : null);
  toast(view.snap ? 'ed.snapOn' : 'ed.snapOff', '🧲');
});
$('#btnFocus').addEventListener('click', focusSelection);
if ($('#btnDebug')) $('#btnDebug').addEventListener('click', toggleDebug);
initDebug();
$('#btnWire').addEventListener('click', function () {
  state.wire = !state.wire;
  $('#btnWire').classList.toggle('active', state.wire);
  reg.forEach(function (rec) {
    forEachMat(rec, function (m) { m.wireframe = state.wire; });
  });
});
$('#btnNew').addEventListener('click', newProject);
$('#btnSave').addEventListener('click', save);
$('#btnExport').addEventListener('click', exportFile);
if ($('#btnAddScene')) $('#btnAddScene').addEventListener('click', addScene);
if ($('#btnPrefab')) $('#btnPrefab').addEventListener('click', function () { savePrefab(false); });
if ($('#btnPrefabScene')) $('#btnPrefabScene').addEventListener('click', function () { savePrefab(true); });
if (typeof renderPrefabs === 'function') renderPrefabs();
$('#btnExportGame').addEventListener('click', exportGame);
$('#btnImport').addEventListener('click', importFile);
$('#btnDemo').addEventListener('click', demoScene);
$('#btnHelp').addEventListener('click', function () { $('#modalHelp').classList.add('open'); });
$('#modalHelp').addEventListener('click', function (e) {
  if (e.target === e.currentTarget || e.target.hasAttribute('data-close')) {
    $('#modalHelp').classList.remove('open');
  }
});
$('#btnPlay').addEventListener('click', togglePlay);
$('#btnReplay').addEventListener('click', function () { stopPlay(); startPlay(); });
$('#btnReplay2').addEventListener('click', function () { stopPlay(); startPlay(); });
$('#btnBackEdit').addEventListener('click', stopPlay);
$('#btnBackEdit2').addEventListener('click', stopPlay);
$('#btnDelete').addEventListener('click', function () { deleteSelection(); });
if ($('#btnGroup')) $('#btnGroup').addEventListener('click', groupSelection);
$('#btnDelete2').addEventListener('click', function () { deleteSelection(); });
if ($('#btnGroup2')) $('#btnGroup2').addEventListener('click', groupSelection);
$('#btnDuplicate').addEventListener('click', function () { if (state.selectedId) duplicateObject(state.selectedId); });
$('#btnDuplicate2').addEventListener('click', function () { if (state.selectedId) duplicateObject(state.selectedId); });
$$('#addBar .obj-btn').forEach(function (b) {
  b.addEventListener('click', function () {
    const type = b.getAttribute('data-add');
    if (type === 'model') pickModel();
    else addObject(type);
  });
});

/* Son */
state.muted = false;
function applyMute() {
  $('#btnMute').classList.toggle('active', !state.muted);
  $('#muteIcon').innerHTML = state.muted
    ? '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>'
    : '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M17.8 6.8a7.5 7.5 0 0 1 0 10.4"/>';
}
$('#btnMute').addEventListener('click', function () {
  state.muted = !state.muted;
  applyMute();
  toast(state.muted ? 'ed.muted' : 'ed.mute', state.muted ? '🔇' : '🔊');
});

/* Langue */
$('#langToggle').addEventListener('click', function () {
  const next = window.kreoCurrentLang() === 'fr' ? 'en' : 'fr';
  window.kreoApplyLang(next);
  $('#langLabel').textContent = next.toUpperCase();
});
/* API publique de l'éditeur : sert aux tests de rendu, aux extensions et à
   l'intégration (landing page, futurs plugins). Volontairement stable. */
window.KREO_EDITOR = {
  version: '3.0',
  get runtime() { return runtime; },
  get playing() { return state.play; },
  get objects() { return Array.from(reg.values()).map(function (r) { return { id: r.id, type: r.type, name: r.name }; }); },
  get selected() { return state.selectedId; },
  select: select,
  add: function (type, opts) { pushHistory(); const r = createObject(type, opts || {}); if (r) { renderHierarchy(); markDirty(); } return r ? r.id : null; },
  remove: deleteObject,
  play: startPlay,
  stop: stopPlay,
  serialize: serialize,
  load: function (json) { rebuildFromData(typeof json === 'string' ? JSON.parse(json) : json); },
  save: save,
  exportGame: exportGame,
  exportProject: exportFile,
  demo: demoScene,
  newProject: newProject
};

window.addEventListener('kreo:editor-render', function () {
  $('#langLabel').textContent = window.kreoCurrentLang().toUpperCase();
  if (window.kreoT) document.title = window.kreoT('ed.title');
  updateStatusSave();
  renderHierarchy();
  renderInspector();
  $('#playLabel').textContent = state.play ? t('ed.stop') : t('ed.play');
  $('#statusHint').textContent = t('ed.renameHint');
  if (state.play) updateHUD();
});

/* ================= Autosave ================= */
setInterval(function () {
  if (!state.dirty) return;
  try { localStorage.setItem(AUTOKEY, serialize()); } catch (e) { /* quota */ }
}, 15000);

/* ================= Init ================= */
(function init() {
  // Chargement
  let loaded = false;
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(AUTOKEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.objects) && (!data.objects.length || data.objects[0].position)) {
        rebuildFromData(data);
        loaded = true;
        log('📂 ' + (state.scene.name || ''));
      }
    }
  } catch (e) { /* ignore */ }
  if (!loaded) demoScene();

  resize();
  applyMute();
  updateStatusSave();
  renderHierarchy();
  renderInspector();
  if (window.kreoT) document.title = window.kreoT('ed.title');
  log('KREO 3D · three.js r' + THREE.REVISION);
  log('✦ ' + t('ed.sceneSettings'));
  requestAnimationFrame(animate);
})();

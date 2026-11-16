/* ============================================================
   KREO — Éditeur 3D (editor3d.js)
   three.js : viewport orbit, gizmos (déplacer/pivoter/échelle),
   arbre de scène, inspecteur, console, mode jeu (3e personne),
   code JS par objet (onStart/onUpdate/onCollide), sauvegarde.
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const $ = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
const t = (k) => (window.kreoT ? window.kreoT(k) : k);

/* ================= État ================= */
const reg = new Map();            // id → record
let nextId = 1;
const state = {
  selectedId: null,
  play: false,
  won: false,
  lost: false,
  score: 0,
  dirty: false,
  wire: false,
  scene: { name: 'Ma scène', fog: true, fogColor: '#B9C9E2' }
};
const view = { snap: true, grid: true, mode: 'translate' };

const TYPE_COLORS = {
  cube: '#8B7CFF', sphere: '#22B8CF', cylinder: '#F5A623', cone: '#F26D6D',
  plane: '#7BD88F', torus: '#E879F9', sun: '#FFE066', point: '#FFB86B',
  player: '#6D4AFF', coin: '#F5C542', goal: '#3ECF8E'
};
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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene3d = new THREE.Scene();
scene3d.fog = new THREE.Fog(0xB9C9E2, 60, 260);

// Ciel dégradé
(function makeSky() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#6E9BD8');
  grad.addColorStop(0.55, '#A8C4E4');
  grad.addColorStop(1, '#DCE7F2');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene3d.background = tex;
})();

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
scene3d.add(new THREE.AmbientLight(0xFFFFFF, 0.32));
const keyLight = new THREE.DirectionalLight(0xFFF2DE, 2.3);
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
function serialize() {
  return JSON.stringify({
    scene: state.scene,
    objects: Array.from(reg.values()).map(recToProps)
  });
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
    collidable: opts.collidable !== undefined ? opts.collidable : ['cube', 'sphere', 'cylinder', 'cone', 'plane', 'torus'].indexOf(type) !== -1,
    value: opts.value != null ? opts.value : 10,
    speed: opts.speed != null ? opts.speed : 6,
    jump: opts.jump != null ? opts.jump : 9
  };

  let obj3d = null;
  switch (type) {
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
    script: rec.script
  };
}

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
    wireframe: m.wireframe
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

function deleteObject(id) {
  const rec = findRec(id);
  if (!rec) return;
  pushHistory();
  scene3d.remove(rec.obj3d);
  disposeObj(rec.obj3d);
  reg.delete(id);
  if (state.selectedId === id) select(null);
  renderHierarchy();
  markDirty();
  toast('ed.deletedToast', '🗑️');
  log('− ' + rec.name);
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

function addObject(type) {
  pushHistory();
  const n = reg.size % 5;
  const rec = createObject(type, {
    position: [n * 2.2 - 3, type === 'plane' ? 0.25 : 1.4, type === 'goal' ? -4 : (n * 1.4 - 2)]
  });
  select(rec.id);
  markDirty();
  toast('ed.newObj', '＋');
  log('+ ' + rec.name);
}

/* ================= Sélection ================= */
function select(id) {
  state.selectedId = id;
  if (selBox) { scene3d.remove(selBox); selBox = null; }
  const rec = id ? findRec(id) : null;
  if (rec) {
    selBox = new THREE.BoxHelper(rec.obj3d, 0x8B7CFF);
    selBox.material.depthTest = false;
    scene3d.add(selBox);
    if (!state.play) {
      transform.attach(rec.obj3d);
    }
  } else {
    transform.detach();
  }
  renderHierarchy();
  renderInspector();
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
      select(id);
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
  rec.script = rec.script || { onStart: '', onUpdate: '', onCollide: '' };
  $('#codeEditor').value = rec.script[view.codeTarget || 'onStart'] || '';
  $$('.code-tab').forEach(function (tab) {
    tab.classList.toggle('active', tab.getAttribute('data-code') === (view.codeTarget || 'onStart'));
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
    if (o && o.userData.recId) { select(o.userData.recId); return; }
  }
  select(null);
});

canvas.addEventListener('dblclick', function () {
  if (!state.play) focusSelection();
});

canvas.addEventListener('pointermove', function (e) {
  // En jeu : glisser = regard autour du joueur
  if (state.play && downPos) {
    play.camYaw -= (e.movementX || 0) * 0.0045;
    play.camPitch = clamp(play.camPitch + (e.movementY || 0) * 0.0032, -0.15, 1.15);
  }
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
const play = {
  playerRec: null,
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  yaw: 0,
  grounded: false,
  camYaw: 0,
  camPitch: 0.42,
  coins: [],
  boxes: [],
  saved: null
};

function collectBoxes() {
  play.boxes = [];
  reg.forEach(function (rec) {
    if (!rec.collidable || !rec.obj3d.visible) return;
    const box = new THREE.Box3().setFromObject(rec.obj3d);
    play.boxes.push({ rec: rec, box: box });
  });
}

function startPlay() {
  if (state.play) return;
  // Joueur requis
  let playerRec = null;
  reg.forEach(function (rec) { if (rec.type === 'player' && rec.obj3d.visible && !playerRec) playerRec = rec; });
  if (!playerRec) {
    playerRec = createObject('player', { position: [0, 2, 10], name: t('ed.addPlayer') });
    toast('ed.noPlayer', 'ℹ️');
    log(t('ed.noPlayer'), 'warn');
  }

  state.play = true;
  state.won = false;
  state.lost = false;
  state.score = 0;
  state.keys = {};

  // Astuce de jeu (auto-masquée)
  const hintEl = $('#playHint');
  hintEl.hidden = false;
  hintEl.classList.remove('fade-out');
  clearTimeout(play.hintTimer);
  play.hintTimer = setTimeout(function () { hintEl.classList.add('fade-out'); }, 5200);

  play.playerRec = playerRec;
  play.pos.copy(playerRec.obj3d.position);
  play.vel.set(0, 0, 0);
  play.yaw = playerRec.obj3d.rotation.y;
  play.grounded = false;
  play.camYaw = 0;
  play.camPitch = 0.42;

  // Pièces
  play.coins = [];
  reg.forEach(function (rec) {
    if (rec.type === 'coin' && rec.obj3d.visible) {
      play.coins.push({ rec: rec, got: false });
    }
  });

  // Sauvegarde des états
  play.saved = { playerPos: playerRec.obj3d.position.clone(), playerRot: playerRec.obj3d.rotation.clone() };

  collectBoxes();
  compileCode();
  runHooks('onStart');

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
  // Restaurer
  if (play.playerRec) {
    play.playerRec.obj3d.position.copy(play.saved.playerPos);
    play.playerRec.obj3d.rotation.copy(play.saved.playerRot);
    play.playerRec.obj3d.visible = true;
  }
  play.coins.forEach(function (c) { c.rec.obj3d.visible = true; });
  play.coins = [];

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

function updateHUD() {
  $('#hudScore').textContent = state.score;
  const total = play.coins.length;
  const got = play.coins.filter(function (c) { return c.got; }).length;
  $('#hudCoins').textContent = got + ' / ' + total;
}

function winGame(msg) {
  if (state.won || state.lost) return;
  state.won = true;
  SFX.win();
  const total = play.coins.length;
  const got = play.coins.filter(function (c) { return c.got; }).length;
  $('#winScore').textContent = t('ed.scoreLabel') + ' : ' + state.score;
  $('#winCoins').textContent = t('ed.coinsLabel') + ' : ' + got + ' / ' + total;
  $('#winOverlay').hidden = false;
  log('🏆 ' + t('ed.winTitle'), 'ok');
}
function loseGame() {
  if (state.won || state.lost) return;
  state.lost = true;
  SFX.lose();
  $('#loseOverlay').hidden = false;
  log('💥 ' + t('ed.loseTitle'), 'err');
}

function updatePlay(dt) {
  const p = play;
  const rec = p.playerRec;
  if (!rec) return;
  const keys = state.keys;

  // Flèches = tourner la caméra · glisser la souris = regard
  let turn = 0;
  if (keys['arrowleft']) turn += 1;
  if (keys['arrowright']) turn -= 1;
  p.camYaw += turn * dt * 2.1;

  // ZQSD / WASD = se déplacer par rapport à la caméra
  let fwd = 0, strafe = 0;
  if (keys['w'] || keys['z'] || keys['arrowup']) fwd += 1;
  if (keys['s'] || keys['arrowdown']) fwd -= 1;
  if (keys['a'] || keys['q']) strafe -= 1;
  if (keys['d']) strafe += 1;

  const speed = rec.speed || 6;
  const sin = Math.sin(p.camYaw), cos = Math.cos(p.camYaw);
  const dirX = -sin * fwd + cos * strafe;
  const dirZ = -cos * fwd - sin * strafe;
  const targetVx = dirX * speed;
  const targetVz = dirZ * speed;
  p.vel.x += (targetVx - p.vel.x) * Math.min(1, dt * 12);
  p.vel.z += (targetVz - p.vel.z) * Math.min(1, dt * 12);
  if (Math.abs(p.vel.x) < 0.01) p.vel.x = 0;
  if (Math.abs(p.vel.z) < 0.01) p.vel.z = 0;

  // Saut
  if ((keys[' '] || keys['space']) && p.grounded) {
    p.vel.y = rec.jump || 9;
    p.grounded = false;
    SFX.jump();
  }

  // Gravité
  p.vel.y -= 26 * dt;
  if (p.vel.y < -55) p.vel.y = -55;

  // Rotation du modèle vers la direction
  if (Math.abs(p.vel.x) + Math.abs(p.vel.z) > 0.6) {
    const targetYaw = Math.atan2(p.vel.x, p.vel.z);
    let diff = targetYaw - rec.obj3d.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    rec.obj3d.rotation.y += diff * Math.min(1, dt * 10);
  }

  // Collisions par AABB (résolution par axe)
  const r = 0.55, h = 2.15;
  const old = p.pos.clone();

  // X
  p.pos.x += p.vel.x * dt;
  if (hitsBox(p.pos, r, h)) { p.pos.x = old.x; p.vel.x = 0; }
  // Z
  p.pos.z += p.vel.z * dt;
  if (hitsBox(p.pos, r, h)) { p.pos.z = old.z; p.vel.z = 0; }
  // Y
  p.pos.y += p.vel.y * dt;
  p.grounded = false;
  if (hitsBox(p.pos, r, h)) {
    if (p.vel.y <= 0) {
      // poser au-dessus de la boîte
      p.pos.y = old.y;
      p.grounded = true;
    } else {
      p.pos.y = old.y;
    }
    p.vel.y = 0;
  }
  // Sol du monde
  if (p.pos.y <= 0) {
    p.pos.y = 0;
    if (p.vel.y <= 0) { p.vel.y = 0; p.grounded = true; }
  }

  rec.obj3d.position.copy(p.pos);

  // Chute
  if (p.pos.y < -30) {
    SFX.hit();
    loseGame();
    return;
  }

  // Pièces
  for (const c of p.coins) {
    if (c.got) continue;
    const cp = c.rec.obj3d.position;
    if (p.pos.distanceTo(cp) < 1.6) {
      c.got = true;
      c.rec.obj3d.visible = false;
      state.score += c.rec.value || 10;
      SFX.coin();
      updateHUD();
    }
    // Animation de rotation
    c.rec.obj3d.rotation.y += dt * 2.4;
  }

  // Objectif
  reg.forEach(function (r2) {
    if (r2.type === 'goal' && r2.obj3d.visible) {
      r2.obj3d.rotation.y += dt * 0.9;
      const gp = r2.obj3d.position;
      if (Math.abs(p.pos.x - gp.x) < 1.8 && Math.abs(p.pos.z - gp.z) < 1.8 && Math.abs(p.pos.y - gp.y) < 3.2) {
        winGame(r2.name);
      }
    }
  });

  // Hooks
  runHooks('onUpdate', rec, null, dt);
  // Collisions hooks
  for (const b of p.boxes) {
    if (hitsBox(p.pos, r, h, b.box)) runHooks('onCollide', b.rec, rec, dt);
  }

  // Caméra de suivi (souris = regard)
  const camDist = 9.5;
  const camH = 2.1 + p.camPitch * 7;
  const tx = p.pos.x + Math.sin(p.camYaw) * camDist;
  const tz = p.pos.z + Math.cos(p.camYaw) * camDist;
  const ty = p.pos.y + camH;
  camera.position.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 5));
  camera.lookAt(p.pos.x, p.pos.y + 1.7, p.pos.z);
}

function hitsBox(pos, r, h, only) {
  const min = new THREE.Vector3(pos.x - r, pos.y, pos.z - r);
  const max = new THREE.Vector3(pos.x + r, pos.y + h, pos.z + r);
  const playerBox = new THREE.Box3(min, max);
  if (only) return playerBox.intersectsBox(only);
  for (const b of play.boxes) {
    if (playerBox.intersectsBox(b.box)) return true;
  }
  return false;
}

/* ================= Hooks de code ================= */
const hooks = {};
function compileCode() {
  for (const k of Object.keys(hooks)) delete hooks[k];
  reg.forEach(function (rec) {
    if (!rec.script) return;
    hooks[rec.id] = {};
    ['onStart', 'onUpdate', 'onCollide'].forEach(function (name) {
      const src = (rec.script[name] || '').trim();
      if (!src) return;
      try {
        hooks[rec.id][name] = new Function('scene', 'dt', 'player', 'self', 'other', src);
      } catch (e) {
        toast('⚠️ ' + (e.message || 'code'), '⚠️');
        log('code error · ' + rec.name + ' · ' + e.message, 'err');
      }
    });
  });
}

function makeProxy(rec) {
  const o = rec.obj3d;
  return {
    get id() { return rec.id; },
    get type() { return rec.type; },
    get name() { return rec.name; },
    get visible() { return o.visible; }, set visible(v) { o.visible = !!v; },
    position: {
      get x() { return o.position.x; }, set x(v) { o.position.x = Number(v) || 0; },
      get y() { return o.position.y; }, set y(v) { o.position.y = Number(v) || 0; },
      get z() { return o.position.z; }, set z(v) { o.position.z = Number(v) || 0; }
    },
    rotation: {
      get x() { return THREE.MathUtils.radToDeg(o.rotation.x); }, set x(v) { o.rotation.x = THREE.MathUtils.degToRad(Number(v) || 0); },
      get y() { return THREE.MathUtils.radToDeg(o.rotation.y); }, set y(v) { o.rotation.y = THREE.MathUtils.degToRad(Number(v) || 0); },
      get z() { return THREE.MathUtils.radToDeg(o.rotation.z); }, set z(v) { o.rotation.z = THREE.MathUtils.degToRad(Number(v) || 0); }
    }
  };
}

function makeApi() {
  return {
    get: function (id) {
      const rec = findRec(id);
      return rec ? makeProxy(rec) : null;
    },
    get player() {
      return play.playerRec ? makeProxy(play.playerRec) : null;
    },
    get score() { return state.score; },
    message: function (msg) { toast(String(msg), '💬'); log('💬 ' + msg); },
    addScore: function (n) {
      state.score += (Number(n) || 0);
      updateHUD();
    },
    win: function (msg) { winGame(msg); },
    lose: function (msg) { loseGame(); }
  };
}

function runHooks(name, selfRec, otherRec, dt) {
  reg.forEach(function (rec) {
    const h = hooks[rec.id] && hooks[rec.id][name];
    if (!h) return;
    const playerProxy = play.playerRec ? makeProxy(play.playerRec) : null;
    try {
      h(makeApi(), dt || 0, playerProxy, selfRec ? makeProxy(selfRec) : makeProxy(rec), otherRec ? makeProxy(otherRec) : null);
    } catch (e) {
      hooks[rec.id][name] = null;
      toast('⚠️ ' + (e.message || 'code'), '⚠️');
      log('code error · ' + rec.name + ' · ' + e.message, 'err');
    }
  });
}

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

function rebuildFromData(data, keepHistory) {
  // Purge
  Array.from(reg.values()).forEach(function (rec) {
    scene3d.remove(rec.obj3d);
    disposeObj(rec.obj3d);
  });
  reg.clear();
  select(null);

  if (data.scene) state.scene = Object.assign({ name: 'Ma scène', fog: true, fogColor: '#B9C9E2' }, data.scene);
  $('#projectName').value = state.scene.name || 'Ma scène';
  $('#inSceneName').value = state.scene.name || 'Ma scène';
  $('#inBg').value = state.scene.fogColor || '#B9C9E2';
  scene3d.fog = state.scene.fog !== false ? new THREE.Fog(new THREE.Color(state.scene.fogColor || '#B9C9E2'), 60, 260) : null;

  (data.objects || []).forEach(function (p) {
    createObject(p.type, p);
  });

  let max = 0;
  reg.forEach(function (rec) {
    const m = /(\d+)$/.exec(rec.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  nextId = max + 1;

  renderHierarchy();
  renderInspector();
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

/* ================= Boucle de rendu ================= */
let lastTime = performance.now();
let fpsAcc = 0, fpsCount = 0, fpsTimer = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.04, (now - lastTime) / 1000);
  lastTime = now;

  if (state.play && !state.won && !state.lost) {
    updatePlay(dt);
  } else if (!state.play) {
    orbit.update();
  }

  if (selBox) selBox.update();
  renderer.render(scene3d, camera);

  // FPS
  fpsAcc += 1 / Math.max(dt, 0.0001);
  fpsCount++;
  fpsTimer += dt;
  if (fpsTimer > 0.5) {
    $('#vpFps').textContent = Math.round(fpsAcc / fpsCount) + ' FPS';
    fpsAcc = 0; fpsCount = 0; fpsTimer = 0;
  }
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
$('#btnDelete').addEventListener('click', function () { if (state.selectedId) deleteObject(state.selectedId); });
$('#btnDelete2').addEventListener('click', function () { if (state.selectedId) deleteObject(state.selectedId); });
$('#btnDuplicate').addEventListener('click', function () { if (state.selectedId) duplicateObject(state.selectedId); });
$('#btnDuplicate2').addEventListener('click', function () { if (state.selectedId) duplicateObject(state.selectedId); });
$$('#addBar .obj-btn').forEach(function (b) {
  b.addEventListener('click', function () { addObject(b.getAttribute('data-add')); });
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

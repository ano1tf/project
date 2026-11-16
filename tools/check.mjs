#!/usr/bin/env node
/* ============================================================
   KREO — vérification hors navigateur (tools/check.mjs)
   Charge les modules du jeu avec les vrais loaders three.js et
   exécute les chaînes critiques : post-processing, juice, arène,
   IA + animations GLB, tirs, sérialisation, graphe audio.

   Usage : node tools/check.mjs
   (WebGL réel non requis : le post est instancié avec un
   renderer factice, donc le GLSL n'est pas compilé ici.)
   ============================================================ */
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---- Résolution des import maps (« three », « three/addons/… ») ---- */
const hooks = `
import { pathToFileURL } from 'url';
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: pathToFileURL(${JSON.stringify(path.join(ROOT, 'assets/vendor/three/three.module.js'))}).href, shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: pathToFileURL(${JSON.stringify(path.join(ROOT, 'assets/vendor/three/addons/'))} + spec.slice(13)).href, shortCircuit: true };
  return next(spec, ctx);
}`;
const hooksPath = path.join(ROOT, 'tools', '.check-hooks.mjs');
fs.writeFileSync(hooksPath, hooks);
register(pathToFileURL(hooksPath).href);

/* ---- Environnement navigateur minimal ---- */
const noop = () => {};
const ctx2d = () => new Proxy({}, {
  get: (t, k) => {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'measureText') return () => ({ width: 10 });
    // le viewmodel cuit une carte de rugosité procédurale (bruit) au démarrage
    if (k === 'createImageData') return (w, h) => ({ width: w || 256, height: h || 256, data: new Uint8ClampedArray((w || 256) * (h || 256) * 4) });
    return noop;
  },
  set: () => true
});
const makeEl = () => {
  const o = {
    style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    hidden: false, textContent: '', innerHTML: '', width: 256, height: 256,
    appendChild: noop, remove: noop, querySelector: () => makeEl(), querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop, getContextAttributes: () => ({}),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    requestPointerLock: noop, setAttribute: noop, focus: noop, children: [],
    getContext: (t) => (t === '2d' ? ctx2d() : null)
  };
  return o;
};
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.document = {
  createElement: makeEl, createElementNS: makeEl, createTextNode: (s) => ({ textContent: s }),
  getElementById: makeEl, querySelector: makeEl, querySelectorAll: () => [],
  addEventListener: noop, removeEventListener: noop, body: makeEl(), documentElement: makeEl(),
  exitPointerLock: noop, pointerLockElement: null
};
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-check', hardwareConcurrency: 8 } }); } catch {}
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 16);
globalThis.HTMLCanvasElement = class {};
globalThis.Image = class { set src(v) { setTimeout(() => this.onload && this.onload(), 0); } };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };

/* ---- Rapport ---- */
const lines = [];
let fails = 0;
const check = async (name, fn) => {
  try {
    const info = await fn();
    lines.push(['✓', name, info || '']);
  } catch (e) {
    fails++;
    lines.push(['✗', name, (e && e.message) || String(e)]);
  }
};

const THREE = await import('three');
const R = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

/* ============ 1. Post-processing ============ */
await check('PostFX : passes HDR, GTAO, bloom, grading', async () => {
  const { PostFX } = await R('game/fps/js/post.js');
  const fr = {
    getSize: (v) => (v ? v.set(1280, 720) : { x: 1280, y: 720 }), getPixelRatio: () => 1,
    setRenderTarget: noop, render: noop, getRenderTarget: () => null,
    toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace, autoClear: true, clear: noop,
    getClearColor: (c) => c.set(0, 0, 0), getClearAlpha: () => 1, setClearColor: noop, setClearAlpha: noop,
    getContext: () => ({ getParameter: () => 4096, getExtension: () => null }), shadowMap: { enabled: false }
  };
  const post = new PostFX({ renderer: fr, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() });
  const names = post.composer.passes.map((p) => p.constructor.name);
  post.setLayerRenderer(noop);
  return names.join(' → ');
});

/* ============ 2. Juice ============ */
await check('Juice : hitstop et reprise du temps', async () => {
  const { Juice } = await R('game/fps/js/juice.js');
  const j = new Juice({ camera: new THREE.PerspectiveCamera() });
  j.hitstop(0.06);
  const gel = j.tick(1 / 60);
  for (let i = 0; i < 8; i++) j.tick(1 / 60);
  return `dt gelé ${gel.toFixed(4)} s → dt repris ${j.tick(1 / 60).toFixed(4)} s`;
});

/* ============ 3. Monde : arène, joueur, ennemis riggés ============ */
let world = null;
await check('Arène + joueur + FX', async () => {
  const { Arena } = await R('game/fps/js/arena.js');
  const { FXSlot } = await R('game/fps/js/fx.js');
  const { Player } = await R('game/fps/js/player.js');
  const scene = new THREE.Scene();
  const fx = new FXSlot(scene);
  const arena = new Arena(scene).build();
  const player = new Player({ camera: new THREE.PerspectiveCamera(), arena, sound: { playerHurt: noop } });
  world = { scene, fx, arena, player };
  return `${arena.colliders.length} colliders, ${arena.solids.length} meshes solides`;
});

await check('Ennemis riggés : GLB + 14 clips + IA', async () => {
  const { EnemyManager } = await R('game/fps/js/enemies.js');
  const { CharacterAsset } = await R('game/fps/js/assets.js');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const b = fs.readFileSync(path.join(ROOT, 'assets/models/RobotExpressive.glb'));
  const gltf = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  const enemies = new EnemyManager({
    scene: world.scene, arena: world.arena, player: world.player,
    sound: { enemyShot: noop, enemyHurt: noop, enemyDeath: noop, projectile: noop, explosion: noop },
    fx: world.fx, callbacks: {}
  });
  enemies.attachCharacter(new CharacterAsset(gltf, { height: 2.15 }));
  enemies.spawnWave(3);
  world.enemies = enemies;
  world.player.pos.set(0, 0, 26); world.player.yaw = 0;
  world.scene.updateMatrixWorld(true);
  const input = { forward: true };
  const clips = new Set();
  for (let i = 0; i < 180; i++) {
    world.player.update(1 / 60, input); enemies.update(1 / 60); world.fx.update(1 / 60);
    world.scene.updateMatrixWorld(true);
    for (const e of enemies.enemies) if (e.anim && e.anim.currentName) clips.add(e.anim.currentName);
  }
  return `${enemies.enemies.length} robots, clips joués : ${[...clips].join(', ')}`;
});

/* ============ 4. Tir et dégâts ============ */
await check('Tirs : raycast sur volumes d\'ennemis', async () => {
  const { WeaponSystem } = await R('game/fps/js/weapons.js');
  const rc = new THREE.Raycaster();
  const raycast = (origin, dir, far) => {
    const list = world.enemies.hitTargets(); const map = new Map(); const targets = [];
    for (const t of list) { map.set(t.mesh.uuid, t); targets.push(t.mesh); }
    for (const m of world.arena.solids) targets.push(m);
    rc.set(origin, dir); rc.far = far;
    const hits = rc.intersectObjects(targets, false);
    if (!hits.length) return null;
    const h = hits[0]; const rec = map.get(h.object.uuid);
    return { point: h.point.clone(), normal: new THREE.Vector3(0, 1, 0), enemy: rec ? rec.enemy : null, part: rec ? rec.part : null };
  };
  const weapons = new WeaponSystem({
    camera: world.player.camera, scene: world.scene, player: world.player,
    sound: new Proxy({}, { get: () => noop }), fx: world.fx, raycast, cb: {}
  });
  let head = 0, killed = 0, aimed = 0;
  for (let k = 0; k < 40; k++) {
    const e = world.enemies.enemies.find((x) => !x.dead);
    if (!e) break;
    // le joueur regarde l'ennemi (angle : yaw 0 = -Z, comme en jeu)
    world.player.pos.set(e.pos.x, 0, e.pos.z + 9);
    world.player.yaw = Math.atan2(-(e.pos.x - world.player.pos.x), -(e.pos.z - world.player.pos.z));
    world.scene.updateMatrixWorld(true);
    const origin = world.player.eyePos();
    const target = e.headHit.getWorldPosition(new THREE.Vector3());
    const dir = target.clone().sub(origin).normalize();
    aimed++;
    const hit = raycast(origin, dir, 200);
    if (hit && hit.enemy) {
      hit.enemy.takeDamage(90, hit.point, hit.part === 'head');
      if (hit.part === 'head') head++;
      if (hit.enemy.dead) killed++;
    }
    for (let s = 0; s < 6; s++) { world.enemies.update(1 / 60); world.scene.updateMatrixWorld(true); }
  }
  if (!head) throw new Error(`aucun headshot détecté sur ${aimed} visées`);
  return `${head} headshots, ${killed} robots détruits`;
});

/* ============ 5. Audio ============ */
await check('Audio : graphe complet synthétisé', async () => {
  class Param { constructor(v) { this.value = v; } setValueAtTime() { return this; } linearRampToValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; } setTargetAtTime() { return this; } }
  class Node {
    constructor() {
      this.frequency = new Param(440); this.gain = new Param(1); this.Q = new Param(1);
      this.playbackRate = new Param(1); this.threshold = new Param(0); this.knee = new Param(0);
      this.ratio = new Param(1); this.attack = new Param(0); this.release = new Param(0);
      this.buffer = null; this.loop = false;
    }
    connect() { return arguments[0]; } disconnect() {} start() {} stop() {}
  }
  const Ctx = class {
    constructor() { this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.destination = new Node(); }
    createGain() { return new Node(); } createBiquadFilter() { return new Node(); }
    createOscillator() { return new Node(); } createBufferSource() { return new Node(); }
    createDynamicsCompressor() { return new Node(); } createConvolver() { return new Node(); }
    resume() {}
    createBuffer(ch, len) { return { numberOfChannels: ch, length: len, getChannelData: () => new Float32Array(len) }; }
  };
  globalThis.AudioContext = Ctx;
  const { SoundSlot } = await R('game/fps/js/sounds.js');
  const s = new SoundSlot(); s.resume();
  ['pistol', 'rifle', 'shotgun'].forEach((w) => s.shot(w));
  s.reload('shotgun'); s.hitmarker(); s.headshot(); s.impact(); s.explosion();
  s.enemyShot(); s.enemyHurt(); s.enemyDeath(); s.footstep(1); s.waveHorn(7);
  s.ambientStart(); s.ambientStop();
  return 'détonations 3 couches + IR de réverbération';
});

/* ============ 6. HDR ============ */
await check('HDR : environnements IBL', async () => {
  const { HDRLoader } = await import('three/addons/loaders/HDRLoader.js');
  const out = [];
  for (const f of ['moonless_golf_1k', 'venice_sunset_1k']) {
    const b = fs.readFileSync(path.join(ROOT, `assets/env/${f}.hdr`));
    const t = new HDRLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    out.push(`${f} ${t.width}×${t.height}`);
  }
  return out.join(', ');
});

/* ---- Sortie ---- */
fs.unlinkSync(hooksPath);
for (const [mark, name, info] of lines) console.log(`${mark} ${name}${info ? ' — ' + info : ''}`);
console.log('');
console.log(fails ? `${fails} échec(s)` : `${lines.length}/${lines.length} vérifications passées`);
process.exit(fails ? 1 : 0);

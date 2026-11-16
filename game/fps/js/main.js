/* ============================================================
   KREO ARENA — MAIN (main.js)
   Moteur (rendu nuit + brouillard), câblage des slots
   (sons, FX, arme, ennemis, joueur), HUD complet, vagues,
   ravitaillement, menus FR/EN, boucle de jeu.
   ============================================================ */
import * as THREE from 'three';
import { Arena } from './arena.js';
import { SoundSlot } from './sounds.js';
import { FXSlot } from './fx.js';
import { Player } from './player.js';
import { WeaponSystem, WEAPONS } from './weapons.js';
import { EnemyManager } from './enemies.js';
import { PostFX } from './post.js';
import { loadEnvironment, loadCharacter } from './assets.js';
import { Juice } from './juice.js';

const el = (id) => document.getElementById(id);

/* ================= i18n ================= */
let LANG = localStorage.getItem('kreo-lang') === 'en' ? 'en' : 'fr';
const STR = {
  fr: {
    title: 'KREO ARENA', sub: 'FPS · Survivez aux 10 vagues',
    play: 'JOUER', resume: 'REPRENDRE', restart: 'RECOMMENCER', menu: 'MENU PRINCIPAL',
    again: 'REJOUER', pause: 'PAUSE',
    controls: 'Commandes', move: 'Se déplacer', look: 'Regarder', shoot: 'Tirer',
    reload: 'Recharger', switch: 'Changer d\'arme', sprint: 'Courir', jump: 'Sauter',
    crouch: 'S\'accroupir', sound: 'Son', muted: 'Muet',
    wave: 'Vague', score: 'Score', kills: 'Éliminations', accuracy: 'Précision',
    health: 'Vie', armor: 'Blindage',
    waveN: (n) => 'VAGUE ' + n, waveCleared: 'VAGUE TERMINÉE',
    waveIncoming: (n) => 'VAGUE ' + n, finalWave: 'DERNIÈRE VAGUE',
    victory: 'VICTOIRE !', defeat: 'TU ES TOMBÉ...',
    victorySub: 'Les 10 vagues sont balayées.', defeatSub: 'L\'arène t\'a eu. Retente ta chance.',
    stats: 'Statistiques', wavesSurvived: 'Vagues survécues',
    perfectStart: '', headshot: 'HEADSHOT !',
    wPistol: 'Pistolet', wRifle: 'Fusil d\'assaut', wShotgun: 'Fusil à pompe',
    lowHp: 'Vie faible', pickupHealth: '+30 VIE', pickupArmor: '+30 BLINDAGE', pickupAmmo: 'MUNITIONS',
    loading: 'Chargement de l\'arène…'
  },
  en: {
    title: 'KREO ARENA', sub: 'FPS · Survive the 10 waves',
    play: 'PLAY', resume: 'RESUME', restart: 'RESTART', menu: 'MAIN MENU',
    again: 'PLAY AGAIN', pause: 'PAUSE',
    controls: 'Controls', move: 'Move', look: 'Look', shoot: 'Shoot',
    reload: 'Reload', switch: 'Switch weapon', sprint: 'Sprint', jump: 'Jump',
    crouch: 'Crouch', sound: 'Sound', muted: 'Muted',
    wave: 'Wave', score: 'Score', kills: 'Kills', accuracy: 'Accuracy',
    health: 'Health', armor: 'Armor',
    waveN: (n) => 'WAVE ' + n, waveCleared: 'WAVE CLEARED',
    waveIncoming: (n) => 'WAVE ' + n, finalWave: 'FINAL WAVE',
    victory: 'VICTORY!', defeat: 'YOU WENT DOWN...',
    victorySub: 'All 10 waves are down.', defeatSub: 'The arena got you. Try again.',
    stats: 'Statistics', wavesSurvived: 'Waves survived',
    perfectStart: '', headshot: 'HEADSHOT!',
    wPistol: 'Pistol', wRifle: 'Assault Rifle', wShotgun: 'Shotgun',
    lowHp: 'Low health', pickupHealth: '+30 HEALTH', pickupArmor: '+30 ARMOR', pickupAmmo: 'AMMO',
    loading: 'Loading the arena…'
  }
};
const T = () => STR[LANG];

function applyLang() {
  el('mTitle').textContent = T().title;
  el('mSub').textContent = T().sub;
  el('btnPlay').textContent = T().play;
  el('btnResume').textContent = T().resume;
  el('btnRestart').textContent = T().restart;
  el('btnQuit').textContent = T().menu;
  el('btnAgain').textContent = T().again;
  el('btnMenu').textContent = T().menu;
  el('pauseTitle').textContent = T().pause;
  el('ctlTitle').textContent = T().controls;
  el('ctlMove').textContent = T().move;
  el('ctlLook').textContent = T().look;
  el('ctlShoot').textContent = T().shoot;
  el('ctlReload').textContent = T().reload;
  el('ctlSwitch').textContent = T().switch;
  el('ctlSprint').textContent = T().sprint;
  el('ctlJump').textContent = T().jump;
  el('ctlCrouch').textContent = T().crouch;
  el('soundLabel').textContent = muted ? T().muted : T().sound;
  el('hudWaveLabel').textContent = T().wave;
  el('hudScoreLabel').textContent = T().score;
  el('hudKillsLabel').textContent = T().kills;
  el('hudAccLabel').textContent = T().accuracy;
  el('statKills').textContent = T().kills;
  el('statAcc').textContent = T().accuracy;
  el('statWaves').textContent = T().wavesSurvived;
  el('overTitle').dataset.defeat = T().defeat;
  el('overTitle').dataset.victory = T().victory;
  el('overSub').dataset.defeat = T().defeatSub;
  el('overSub').dataset.victory = T().victorySub;
  updateAmmoHUD();
}

/* ================= Rendu ================= */
const LOW = /low|weak|pixel 3|mali|adreno 6\d\d/i.test(
  (navigator.userAgent || '') + ' ' + (navigator.hardwareConcurrency < 4 ? 'low' : '')
);

const canvas = el('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.userData.renderer = renderer;

const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.08, 320);
scene.add(camera);

/* ================= Post-processing + Juice ================= */
const post = new PostFX({ renderer, scene, camera, low: LOW });

/* ================= Juice ================= */
const juice = new Juice({ camera });
juice.onShake = (a) => post.shake(a);

/* ================= Slots ================= */
const sound = new SoundSlot();
const fx = new FXSlot(scene);
const arena = new Arena(scene).build();
const player = new Player({ camera, arena, sound });
const enemies = new EnemyManager({
  scene, arena, player, sound, fx,
  callbacks: {
    damagePlayer: (dmg, fromPos) => {
      player.damage(dmg, fromPos);
      damageFlash = 1;
      dmgDirT = 1.25;
      juice.shake(0.035 + dmg * 0.0016);
      if (fromPos) {
        const dx = fromPos.x - player.pos.x;
        const dz = fromPos.z - player.pos.z;
        // angle relatif à l'orientation du joueur (0 = devant, + = droite)
        const fwdX = -Math.sin(player.yaw), fwdZ = -Math.cos(player.yaw);
        const rgtX = -fwdZ, rgtZ = fwdX;
        dmgDirAngle = Math.atan2(dx * rgtX + dz * rgtZ, dx * fwdX + dz * fwdZ);
      }
      if (!player.alive && (game.state === 'playing' || game.state === 'intermission')) gameOver(false);
    },
    onKill: (type, score) => {
      game.kills++;
      game.score += score;
      pushKillfeed(type, score);
      juice.hitstop(0.075);
      juice.shake(0.05);
      hudRefresh();
    }
  }
});

/* Raycast : ennemis + décor, le plus proche gagne */
const raycaster = new THREE.Raycaster();
function raycast(origin, dir, maxDist) {
  const list = enemies.hitTargets();
  const map = new Map();
  const targets = [];
  for (const t of list) { map.set(t.mesh.uuid, t); targets.push(t.mesh); }
  for (const m of arena.solids) targets.push(m);
  raycaster.set(origin, dir);
  raycaster.far = maxDist;
  const hits = raycaster.intersectObjects(targets, false);
  if (!hits.length) return null;
  const h = hits[0];
  const normal = h.face
    ? h.face.normal.clone().transformDirection(h.object.matrixWorld)
    : new THREE.Vector3(0, 1, 0);
  const rec = map.get(h.object.uuid);
  return {
    point: h.point.clone(),
    normal,
    enemy: rec ? rec.enemy : null,
    part: rec ? rec.part : null
  };
}

const weapons = new WeaponSystem({
  camera, scene, player, sound, fx, raycast, juice, post,
  cb: {
    onShot: (def) => {
      game.shots++;
      vmFlashT = 0.055;
      vmFlash.intensity = 7;
      // recul de caméra : sec pour une arme lourde, léger pour le pistolet
      juice.kick(def ? def.recoil * 0.55 : 0.01, (Math.random() - 0.5) * 0.012, def && def.id === 'shotgun' ? 1.6 : 0.6);
      juice.shake(def && def.id === 'shotgun' ? 0.032 : 0.012);
    },
    onHitEnemy: (hit, isHead) => {
      game.hits++;
      game.score += isHead ? 25 : 10;
      showHitmarker(isHead);
      if (isHead) showBanner('headshot');
      // À l'impact : micro-gel + retour visuel. Headshot = plus sec.
      juice.hitstop(isHead ? 0.065 : 0.035);
      post.setHitFlash(1);
      hudRefresh();
    },
    onHitWorld: () => { /* impacts gérés par FXSlot */ }
  }
});

/* ================= État de jeu ================= */
const game = {
  state: 'menu',   // menu | playing | intermission | paused | gameover | victory
  wave: 0,
  score: 0,
  kills: 0,
  shots: 0,
  hits: 0,
  interT: 0
};
let muted = false;
let damageFlash = 0;
let dmgDirT = 0;
let dmgDirAngle = 0;
let hitmarkerT = 0;
let bannerT = 0;
let feed = [];

/* ================= Ravitaillement ================= */
const pickups = [];
function buildPickups() {
  const defs = [
    ['health', 0x2FE07C], ['health', 0x2FE07C], ['health', 0x2FE07C],
    ['armor', 0x2FB8FF], ['armor', 0x2FB8FF],
    ['ammo', 0xFFC94D], ['ammo', 0xFFC94D], ['ammo', 0xFFC94D]
  ];
  arena.pickupSpots.slice(0, defs.length).forEach((spot, i) => {
    const [type, color] = defs[i];
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.3
    });
    if (type === 'health') {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.28, 0.28), mat);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.28), mat);
      g.add(a, b);
    } else if (type === 'armor') {
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), mat));
    } else {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.42), mat));
    }
    const glow = new THREE.PointLight(color, 5, 7, 2);
    glow.position.y = 0.6;
    g.add(glow);
    g.position.copy(spot).setY(spot.y + 0.9);
    scene.add(g);
    pickups.push({ group: g, type, active: true, baseY: spot.y + 0.9, seed: Math.random() * 9 });
  });
}
buildPickups();

function respawnPickups() {
  for (const p of pickups) {
    p.active = true;
    p.group.visible = true;
  }
}

function updatePickups(dt, time) {
  for (const p of pickups) {
    if (!p.active) continue;
    p.group.rotation.y += dt * 1.6;
    p.group.position.y = p.baseY + Math.sin(time * 2 + p.seed) * 0.14;
    if (player.alive && p.group.position.distanceTo(player.pos.clone().setY(p.group.position.y)) < 1.5) {
      p.active = false;
      p.group.visible = false;
      sound.pickup();
      if (p.type === 'health') { player.heal(30); showBanner('pickupHealth'); }
      else if (p.type === 'armor') { player.addArmor(30); showBanner('pickupArmor'); }
      else {
        for (const st of weapons.state) st.reserve += 60;
        showBanner('pickupAmmo');
      }
      hudRefresh();
    }
  }
}

/* ================= HUD ================= */
function hudRefresh() {
  el('hudHealthFill').style.width = Math.max(0, player.health) + '%';
  el('hudArmorFill').style.width = Math.max(0, player.armor) + '%';
  el('hudHealthVal').textContent = Math.ceil(player.health);
  el('hudArmorVal').textContent = Math.ceil(player.armor);
  el('hudWave').textContent = game.wave;
  el('hudScore').textContent = game.score;
  el('hudKills').textContent = game.kills;
  const acc = game.shots > 0 ? Math.round((game.hits / game.shots) * 100) : 0;
  el('hudAcc').textContent = acc + '%';
  el('hudLow').hidden = player.health > 30;
  updateAmmoHUD();
}

function updateAmmoHUD() {
  const a = weapons.ammoState();
  el('hudAmmo').innerHTML = (a.reloading ? '…' : a.mag) + ' <span class="dim">/ ' + a.reserve + '</span>';
  el('hudWeapon').textContent = T()[a.nameKey] || a.nameKey;
}

let _lastHitSound = 0;
function showHitmarker(isHead) {
  const h = el('hitmarker');
  h.hidden = false;
  h.classList.toggle('crit', !!isHead);
  hitmarkerT = 0.14;
  const now = performance.now();
  if (now - _lastHitSound > 90) {
    _lastHitSound = now;
    sound.hitmarker();
    if (isHead) sound.headshot();
  }
}

function showBanner(key) {
  const b = el('banner');
  b.textContent = (typeof T()[key] === 'function' ? T()[key](game.wave) : T()[key]) || key;
  b.hidden = false;
  bannerT = 1.7;
}

function pushKillfeed(type, score) {
  const names = { grunt: 'GRUNT', shooter: 'SHOOTER', brute: 'BRUTE' };
  feed.unshift({ text: (names[type] || type) + '  +' + score, t: 4.5 });
  if (feed.length > 5) feed.pop();
  renderFeed();
}

function renderFeed() {
  el('killfeed').innerHTML = feed
    .map((f) => '<div class="kf-row">' + f.text + '</div>')
    .join('');
}

/* ================= Vagues ================= */
function startWave(n) {
  game.wave = n;
  enemies.spawnWave(n);
  sound.waveHorn(n);
  showBanner(n === 10 ? 'finalWave' : 'waveN');
  hudRefresh();
}

function startGame() {
  sound.resume();
  sound.uiClick();
  sound.ambientStart();
  enemies.clear();
  respawnPickups();
  player.pos.copy(arena.playerSpawn.pos);
  player.vel.set(0, 0, 0);
  player.yaw = arena.playerSpawn.yaw;
  player.pitch = 0;
  player.health = 100;
  player.armor = 25;
  player.alive = true;
  weapons.state.forEach((st, i) => {
    st.mag = WEAPONS[i].mag;
    st.reserve = WEAPONS[i].reserve;
    st.reloading = 0;
    st.cooldown = 0;
  });
  game.score = 0;
  game.kills = 0;
  game.shots = 0;
  game.hits = 0;
  feed = [];
  renderFeed();
  game.state = 'playing';
  hideOverlays();
  el('hud').hidden = false;
  requestLock();
  startWave(1);
  hudRefresh();
}

function gameOver(victory) {
  const wavesSurvived = victory ? 10 : Math.max(0, game.wave - (game.state === 'intermission' ? 0 : 1));
  game.state = victory ? 'victory' : 'gameover';
  sound[victory ? 'victory' : 'gameOver']();
  sound.ambientStop();
  document.exitPointerLock && document.exitPointerLock();
  const title = el('overTitle');
  title.textContent = victory ? title.dataset.victory : title.dataset.defeat;
  el('overSub').textContent = victory ? el('overSub').dataset.victory : el('overSub').dataset.defeat;
  el('overKills').textContent = game.kills;
  const acc = game.shots > 0 ? Math.round((game.hits / game.shots) * 100) : 0;
  el('overAcc').textContent = acc + '%';
  el('overWaves').textContent = wavesSurvived;
  el('overScore').textContent = game.score;
  el('overlayGameOver').hidden = false;
}

function hideOverlays() {
  el('menuOverlay').hidden = true;
  el('pauseOverlay').hidden = true;
  el('overlayGameOver').hidden = true;
}

/* ================= Entrées ================= */
const input = {
  forward: false, back: false, left: false, right: false,
  jump: false, crouch: false, sprint: false,
  fire: false, reload: false, ads: false, _firePressed: false
};
const KEYMAP = {
  z: 'forward', w: 'forward', arrowup: 'forward',
  s: 'back', arrowdown: 'back',
  q: 'left', a: 'left', arrowleft: 'left',
  d: 'right', arrowright: 'right',
  ' ': 'jump',
  shift: 'sprint',
  control: 'crouch', c: 'crouch'
};

function requestLock() {
  canvas.requestPointerLock && canvas.requestPointerLock();
}

document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (KEYMAP[k]) {
    if (game.state === 'playing' || game.state === 'intermission') e.preventDefault();
    input[KEYMAP[k]] = true;
  }
  if (k === 'r') input.reload = true;
  if (k === '1') weapons.switchTo(0);
  if (k === '2') weapons.switchTo(1);
  if (k === '3') weapons.switchTo(2);
  if (k === 'escape') {
    if (game.state === 'playing' || game.state === 'intermission') pauseGame();
    else if (game.state === 'paused') resumeGame();
  }
});
document.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (KEYMAP[k]) input[KEYMAP[k]] = false;
  if (k === 'r') input.reload = false;
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    input.fire = true;
    if ((game.state === 'playing' || game.state === 'intermission') && document.pointerLockElement !== canvas) {
      requestLock();
    }
  }
  if (e.button === 2) input.ads = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.fire = false;
  if (e.button === 2) input.ads = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && (game.state === 'playing' || game.state === 'intermission')) {
    player.addLook(e.movementX, e.movementY);
  }
});
document.addEventListener('wheel', (e) => {
  if (game.state === 'playing' || game.state === 'intermission') weapons.switchWheel(e.deltaY);
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && game.state === 'playing') pauseGame();
});

function pauseGame() {
  if (game.state !== 'playing' && game.state !== 'intermission') return;
  game._prevState = game.state;
  game.state = 'paused';
  el('pauseOverlay').hidden = false;
  document.exitPointerLock && document.exitPointerLock();
}

function resumeGame() {
  sound.resume();
  el('pauseOverlay').hidden = true;
  game.state = game._prevState || 'playing';
  requestLock();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  vmCam.aspect = window.innerWidth / window.innerHeight;
  vmCam.updateProjectionMatrix();
  post.resize();
});

/* ================= Boutons ================= */
el('btnPlay').addEventListener('click', startGame);
el('btnResume').addEventListener('click', () => { sound.uiClick(); resumeGame(); });
el('btnRestart').addEventListener('click', () => { sound.uiClick(); startGame(); });
el('btnQuit').addEventListener('click', () => {
  sound.uiClick();
  game.state = 'menu';
  hideOverlays();
  el('menuOverlay').hidden = false;
  el('hud').hidden = true;
  enemies.clear();
  sound.ambientStop();
  document.exitPointerLock && document.exitPointerLock();
});
el('btnAgain').addEventListener('click', () => { sound.uiClick(); startGame(); });
el('btnMenu').addEventListener('click', () => {
  sound.uiClick();
  game.state = 'menu';
  hideOverlays();
  el('menuOverlay').hidden = false;
  el('hud').hidden = true;
  enemies.clear();
  document.exitPointerLock && document.exitPointerLock();
});
el('btnSound').addEventListener('click', () => {
  sound.resume();
  muted = !muted;
  sound.setMuted(muted);
  el('soundLabel').textContent = muted ? T().muted : T().sound;
});
el('btnLang').addEventListener('click', () => {
  LANG = LANG === 'fr' ? 'en' : 'fr';
  localStorage.setItem('kreo-lang', LANG);
  applyLang();
});

/* ================= Viewmodel (maintenant rendu à part) ================= */
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.01, 6);
vmScene.add(new THREE.HemisphereLight(0xB8CCE8, 0x1A1E28, 1.15));
const vmKey = new THREE.DirectionalLight(0xFFE8CE, 2.1);
vmKey.position.set(0.6, 1.2, 0.9);
vmScene.add(vmKey);
const vmRim = new THREE.DirectionalLight(0x8FB6FF, 1.35);
vmRim.position.set(-1.1, 0.4, -0.8);
vmScene.add(vmRim);
// le modèle d'arme actuel est le seul enfant de weapons.vm
vmScene.add(weapons.vm);
weapons.vm.position.set(0, 0, 0);
weapons.vm.rotation.set(0, 0, 0);

// flash de bouche du viewmodel (indépendant de la lumière du monde)
const vmFlash = new THREE.PointLight(0xFFC878, 0, 3, 2);
vmFlash.position.set(0.12, 0.02, -0.5);
vmScene.add(vmFlash);
let vmFlashT = 0;

function renderViewModel(damage) {
  // on masque les particules/décalques du monde et l'arme elle-même
  // via un rendu de scène séparé : rien à cacher, le vmScene ne contient que l'arme.
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.clearDepth();
  vmCam.projectionMatrix.copy(camera.projectionMatrix);
  vmCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  vmCam.matrixWorld.copy(camera.matrixWorld);
  vmCam.matrixWorldInverse.copy(vmCam.matrixWorld).invert();
  // tremblement d'arme lié aux dégâts
  weapons.vm.position.x = (Math.random() - 0.5) * damage * 0.05;
  weapons.vm.position.y = (Math.random() - 0.5) * damage * 0.05;
  renderer.render(vmScene, vmCam);
  renderer.autoClear = prevAutoClear;
}

/* ================= Qualité adaptative ================= */
// Si la machine peine (< 40 fps pendant 2 s), on coupe AO puis on baisse la résolution.
const perf = { acc: 0, frames: 0, level: 0 };
function adaptQuality(rawDt) {
  if (LOW) return;
  perf.acc += rawDt; perf.frames++;
  if (perf.acc < 2) return;
  const fps = perf.frames / perf.acc;
  perf.acc = 0; perf.frames = 0;
  if (fps < 40 && perf.level === 0) {
    perf.level = 1;
    post.ao.enabled = false;            // l'AO est le poste le plus cher
    post.bloom.strength *= 0.8;
  } else if (fps < 34 && perf.level === 1) {
    perf.level = 2;
    renderer.setPixelRatio(1);
    post.resize();
  } else if (fps < 28 && perf.level === 2) {
    perf.level = 3;
    post.enabled = false;               // dernier recours : rendu direct
  } else if (fps > 58 && perf.level === 1) {
    perf.level = 0;
    post.ao.enabled = true;
  }
}

/* ================= Boucle ================= */
let last = performance.now();
let time = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += rawDt;
  // dt « gameplay » : ralenti par le hitstop, le reste (UI, FX d'écran) suit le temps réel
  const dt = juice.tick(rawDt);
  adaptQuality(rawDt);

  arena.update(time);

  if (game.state === 'playing' || game.state === 'intermission') {
    player.update(dt, input);
    weapons.update(dt, input);
    enemies.update(dt);
    updatePickups(dt, time);

    if (game.state === 'intermission') {
      game.interT -= dt;
      if (game.interT <= 0) {
        if (game.wave >= 10) {
          gameOver(true);
        } else {
          game.state = 'playing';
          startWave(game.wave + 1);
        }
      }
    } else if (enemies.aliveCount() === 0) {
      game.state = 'intermission';
      game.interT = 7;
      player.heal(20);
      respawnPickups();
      showBanner('waveCleared');
      hudRefresh();
    }
  } else if (game.state === 'paused' || game.state === 'gameover' || game.state === 'victory') {
    // figé
  } else {
    // menu : caméra lente autour du joueur
    const a = time * 0.12;
    camera.position.set(
      player.pos.x + Math.cos(a) * 8,
      player.pos.y + 3.2,
      player.pos.z + Math.sin(a) * 8
    );
    camera.lookAt(player.pos.x, player.pos.y + 1.2, player.pos.z);
  }

  // FX d'écran
  if (hitmarkerT > 0) {
    hitmarkerT -= dt;
    if (hitmarkerT <= 0) el('hitmarker').hidden = true;
  }
  if (bannerT > 0) {
    bannerT -= dt;
    if (bannerT <= 0) el('banner').hidden = true;
  }
  const hSpeedNow = Math.hypot(player.vel.x, player.vel.z);
  el('crosshair').classList.toggle('wide', hSpeedNow > 4.6 || !player.grounded);
  el('crosshair').style.opacity = input.ads ? 0.25 : 1;
  damageFlash = Math.max(0, damageFlash - dt * 1.6);
  if (dmgDirT > 0) {
    dmgDirT -= dt * 1.15;
    el('dmgDir').style.opacity = Math.min(1, dmgDirT);
    el('dmgDir').style.transform = 'rotate(' + (dmgDirAngle * 180 / Math.PI) + 'deg)';
  }
  const lowPulse = player.alive && player.health <= 30 ? (0.14 + Math.sin(time * 5) * 0.07) : 0;
  el('damageVignette').style.opacity = Math.min(0.75, damageFlash * 0.7 + lowPulse);
  if (feed.length && feed[0].t > 0) {
    let changed = false;
    for (const f of feed) { if (f.t > 0) { f.t -= dt; changed = true; } }
    if (changed && feed.some((f) => f.t <= 0)) {
      feed = feed.filter((f) => f.t > 0);
      renderFeed();
    }
  }

  // décroissance des feedbacks post (temps réel, pas ralenti par le hitstop)
  const gd = post.grade.uniforms;
  gd.damage.value = Math.max(0, gd.damage.value - rawDt * 2.6);
  gd.hitFlash.value = Math.max(0, gd.hitFlash.value - rawDt * 7.5);
  if (damageFlash > 0.05) gd.damage.value = Math.max(gd.damage.value, Math.min(0.85, damageFlash * 0.75));

  fx.update(rawDt);
  if (vmFlashT > 0) {
    vmFlashT -= rawDt;
    vmFlash.intensity = Math.max(0, vmFlash.intensity - rawDt * 160);
    if (vmFlashT <= 0) vmFlash.intensity = 0;
  }

  // Viewmodel toujours visible par-dessus le décor (rendu séparé)
  renderViewModel(gd.damage.value);

  post.render(rawDt, time);
}

/* ================= Démarrage ================= */
el('loading').hidden = false;
el('loadingTxt').textContent = T().loading;

async function boot() {
  // Environnement HDR : ciel réel + réflexions IBL (avant le premier rendu)
  try {
    const env = await loadEnvironment(renderer, scene, '../../assets/env/moonless_golf_1k.hdr');
    arena.applyEnvironment(env);
  } catch (e) {
    console.warn('HDR indisponible', e);
  }

  // Personnages riggés (14 animations) : les ennemis deviennent des robots animés
  try {
    const char = await loadCharacter('../../assets/models/RobotExpressive.glb', { height: 2.15 });
    enemies.attachCharacter(char);
  } catch (e) {
    console.warn('GLB indisponible, ennemis procéduraux', e);
  }

  requestAnimationFrame(() => {
    el('loading').hidden = true;
    el('menuOverlay').hidden = false;
    applyLang();
    hudRefresh();
    last = performance.now();
    requestAnimationFrame(loop);
  });
}
boot();

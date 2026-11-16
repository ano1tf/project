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
const canvas = el('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.userData.renderer = renderer;

const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.08, 320);
scene.add(camera);

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
  camera, scene, player, sound, fx, raycast,
  cb: {
    onShot: () => { game.shots++; },
    onHitEnemy: (hit, isHead) => {
      game.hits++;
      game.score += isHead ? 25 : 10;
      showHitmarker(isHead);
      if (isHead) showBanner('headshot');
      hudRefresh();
    }
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
  fire: false, reload: false, _firePressed: false
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
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.fire = false;
});
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

/* ================= Boucle ================= */
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const time = now / 1000;

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

  fx.update(dt);
  renderer.render(scene, camera);
}

/* ================= Démarrage ================= */
el('loading').hidden = false;
el('loadingTxt').textContent = T().loading;
requestAnimationFrame(() => setTimeout(() => {
  el('loading').hidden = true;
  el('menuOverlay').hidden = false;
  applyLang();
  hudRefresh();
  requestAnimationFrame(loop);
}, 60));

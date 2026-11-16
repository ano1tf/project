/* ============================================================
   KREO RACING — MAIN (main.js)
   Rendu réaliste (ciel procédural + environnement PBR, ombres),
   HUD, minimap, commandes, menus, boucle de jeu.
   ============================================================ */
import * as THREE from 'three';
import { TrackSlot } from './track.js';
import { CarSlot, GRID_COLORS, GRID_NAMES } from './car.js';
import { SoundSlot } from './sounds.js';
import { FXSlot } from './fx.js';
import { CameraSlot } from './cameras.js';
import { RaceGame } from './race.js';

const $ = (s) => document.querySelector(s);
const el = (id) => document.getElementById(id);

/* ================= i18n ================= */
let LANG = localStorage.getItem('kreo-lang') === 'en' ? 'en' : 'fr';
const STR = {
  fr: {
    start: '\u25B6\u00A0\u00A0LANCER LA COURSE', resume: 'REPRENDRE', restart: 'RECOMMENCER',
    quit: 'MENU PRINCIPAL', again: 'REJOUER', menu: 'MENU PRINCIPAL',
    finish: 'ARRIVÉE !', finishWin: 'VICTOIRE !', sub: 'Circuit des Coteaux · 3 tours · 4 pilotes',
    sound: '\uD83D\uDD0A Son', muted: '\uD83D\uDD07 Muet', cam: 'Caméra : ',
    load: 'Chargement du circuit…', best: 'MEILLEUR TOUR', total: 'TOTAL', drift: 'SCORE DRIFT',
    pause: 'PAUSE', p1: '1er', pN: (n) => n + 'e'
  },
  en: {
    start: '\u25B6\u00A0\u00A0START THE RACE', resume: 'RESUME', restart: 'RESTART',
    quit: 'MAIN MENU', again: 'RACE AGAIN', menu: 'MAIN MENU',
    finish: 'FINISH!', finishWin: 'VICTORY!', sub: 'Hillside Circuit · 3 laps · 4 drivers',
    sound: '\uD83D\uDD0A Sound', muted: '\uD83D\uDD07 Muted', cam: 'Camera: ',
    load: 'Loading the circuit…', best: 'BEST LAP', total: 'TOTAL', drift: 'DRIFT SCORE',
    pause: 'PAUSE', p1: '1st', pN: (n) => n + 'th'
  }
};
const T = () => STR[LANG];

function applyLang() {
  el('btnStart').textContent = T().start;
  el('btnResume').textContent = T().resume;
  el('btnRestart').textContent = T().restart;
  el('btnQuit').textContent = T().quit;
  el('btnAgain').textContent = T().again;
  el('btnMenu').textContent = T().menu;
  el('btnResume').textContent = T().resume;
  document.querySelector('#pause h2').textContent = T().pause;
  el('soundLabel').textContent = muted ? T().muted : T().sound;
  if (cameraSlot) el('camSelectLabel').textContent = T().cam + cameraSlot.label(LANG).replace('CAMÉRA : ', '').replace('CAMERA: ', '');
  if (race) {
    const st = race.standings();
    renderResults(st);
  }
}

/* ================= Rendu ================= */
const canvas = el('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xAFBED4, 320, 1250);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.35, 2200);

/* Ciel procédural (equirect) + environnement PBR */
function buildSky() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#2E5EA8');
  grad.addColorStop(0.42, '#7FA6D4');
  grad.addColorStop(0.52, '#B9CBE2');
  grad.addColorStop(0.56, '#93A181');
  grad.addColorStop(1, '#5F6E52');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);

  // Soleil
  const sunX = 300, sunY = 168;
  const sun = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, 130);
  sun.addColorStop(0, 'rgba(255, 244, 214, 1)');
  sun.addColorStop(0.18, 'rgba(255, 232, 190, 0.75)');
  sun.addColorStop(1, 'rgba(255, 226, 180, 0)');
  g.fillStyle = sun;
  g.fillRect(sunX - 130, sunY - 130, 260, 260);

  // Nuages
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * 1024, y = 90 + Math.random() * 130;
    const w = 90 + Math.random() * 190, h = 16 + Math.random() * 26;
    g.fillStyle = 'rgba(255,255,255,' + (0.12 + Math.random() * 0.2) + ')';
    g.beginPath();
    g.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const skyTex = buildSky();
scene.background = skyTex;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromEquirectangular(skyTex).texture;

/* Lumières */
const sun = new THREE.DirectionalLight(0xFFF1DC, 2.7);
sun.position.set(140, 190, 110);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -260;
sun.shadow.camera.right = 260;
sun.shadow.camera.top = 260;
sun.shadow.camera.bottom = -260;
sun.shadow.camera.far = 620;
sun.shadow.bias = -0.00035;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xBFD4F2, 0x4E5E3E, 0.8));
scene.add(new THREE.AmbientLight(0xFFFFFF, 0.14));

/* ================= Monde ================= */
const track = new TrackSlot(scene);
const sound = new SoundSlot();
const fx = new FXSlot(scene);
let cameraSlot = null;
let race = null;
let muted = false;

/* Voitures */
function buildCars() {
  const playerCar = new CarSlot(scene, { color: GRID_COLORS[0], isPlayer: true, name: GRID_NAMES[0] });
  const aiCars = [];
  for (let i = 1; i < 4; i++) {
    aiCars.push({
      car: new CarSlot(scene, { color: GRID_COLORS[i], name: GRID_NAMES[i] }),
      t: 0, speed: 0, lateral: 0, lap: 1,
      skill: [0, 0.92, 0.97, 1.0][i]
    });
  }
  return { playerCar, aiCars };
}

/* ================= HUD ================= */
const hud = {
  setSpeed(v) { el('hudSpeed').textContent = v; el('hudSpeedFill').style.width = Math.min(100, v / 2.72) + '%'; },
  setGear(g) { el('hudGear').textContent = g; },
  setLap(n, total) { el('hudLap').textContent = n; },
  setPos(p, total) { el('hudPos').innerHTML = 'P' + p + '<span class="dim">/' + total + '</span>'; },
  setLapTime(v) { el('hudLapTime').textContent = v; },
  setBest(v) { el('hudBest').textContent = v; },
  setTotal(v) { el('hudTotal').textContent = v; },
  setDrift(pts) {
    const b = el('hudDrift');
    if (pts == null) { b.hidden = true; return; }
    b.hidden = false;
    el('hudDriftPts').textContent = pts;
  },
  setWrongWay(b) { el('wrongWay').hidden = !b; },
  setCam(s) { el('hudCam').textContent = s; }
};

/* ================= Minimap ================= */
const mmCanvas = el('minimap');
const mmCtx = mmCanvas.getContext('2d');
let mmBase = null, mmMap = null;

function prerenderMinimap() {
  const xs = track.samples.map((s) => s.pos.x);
  const zs = track.samples.map((s) => s.pos.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const pad = 22;
  const sc = Math.min((220 - pad * 2) / (maxX - minX), (220 - pad * 2) / (maxZ - minZ));
  mmMap = (x, z) => [
    pad + (x - minX) * sc,
    220 - (pad + (z - minZ) * sc)
  ];
  mmBase = document.createElement('canvas');
  mmBase.width = mmBase.height = 220;
  const g = mmBase.getContext('2d');
  g.clearRect(0, 0, 220, 220);
  g.beginPath();
  track.samples.forEach((s, i) => {
    const [px, py] = mmMap(s.pos.x, s.pos.z);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  });
  g.closePath();
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = 9;
  g.lineJoin = 'round';
  g.stroke();
  g.strokeStyle = 'rgba(124, 160, 255, 0.85)';
  g.lineWidth = 3;
  g.stroke();
  // Ligne de départ
  const s0 = track.samples[0];
  const [ax, ay] = mmMap(s0.pos.x + s0.left.x * 6, s0.pos.z + s0.left.z * 6);
  const [bx, by] = mmMap(s0.pos.x - s0.left.x * 6, s0.pos.z - s0.left.z * 6);
  g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by);
  g.strokeStyle = '#fff'; g.lineWidth = 3.4; g.stroke();
}

function drawMinimap() {
  if (!mmBase) return;
  mmCtx.clearRect(0, 0, 220, 220);
  mmCtx.drawImage(mmBase, 0, 0);
  const dot = (x, z, color, r) => {
    const [px, py] = mmMap(x, z);
    mmCtx.beginPath();
    mmCtx.arc(px, py, r, 0, Math.PI * 2);
    mmCtx.fillStyle = color;
    mmCtx.fill();
    mmCtx.strokeStyle = 'rgba(0,0,0,0.5)';
    mmCtx.lineWidth = 1.5;
    mmCtx.stroke();
  };
  race.aiCars.forEach((ai) => dot(ai.car.group.position.x, ai.car.group.position.z, '#FF6B7A', 5));
  const p = race.playerCar.group.position;
  dot(p.x, p.z, '#7BE8FF', 6.5);
}

/* ================= Commandes ================= */
const keys = {};
const KEYMAP = {
  arrowup: 'up', w: 'up', z: 'up',
  arrowdown: 'down', s: 'down',
  arrowleft: 'left', a: 'left', q: 'left',
  arrowright: 'right', d: 'right',
  ' ': 'hand'
};
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (KEYMAP[k]) {
    e.preventDefault();
    keys[KEYMAP[k]] = true;
    if (KEYMAP[k] === 'hand') race && (race.input.handbrake = true);
    if (KEYMAP[k] === 'up') race && (race.input.throttle = 1);
    if (KEYMAP[k] === 'down') race && (race.input.brake = 1);
  }
  if (k === 'c') cycleCam();
  if (k === 'r' && race && race.state !== 'menu') doRestart();
  if (k === 'escape') togglePause();
});
document.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (KEYMAP[k]) {
    keys[KEYMAP[k]] = false;
    if (KEYMAP[k] === 'hand') race && (race.input.handbrake = false);
    if (KEYMAP[k] === 'up') race && (race.input.throttle = 0);
    if (KEYMAP[k] === 'down') race && (race.input.brake = 0);
  }
});

function pollSteer() {
  if (!race) return;
  race.input.steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
}

/* ================= Menus ================= */
let paused = false;

function hideOverlays() {
  el('menu').hidden = true;
  el('pause').hidden = true;
  el('finish').hidden = true;
}

function togglePause() {
  if (!race || (race.state !== 'racing' && race.state !== 'countdown')) return;
  paused = !paused;
  el('pause').hidden = !paused;
  if (paused) sound.setEngine(0.05, 0, 0);
}

function doRestart() {
  paused = false;
  hideOverlays();
  el('hud').hidden = false;
  fx.resetSkids();
  race.restart();
}

function cycleCam() {
  if (!cameraSlot) return;
  cameraSlot.cycle();
  hud.setCam(cameraSlot.label(LANG));
  el('camSelectLabel').textContent = T().cam + cameraSlot.label(LANG).replace('CAMÉRA : ', '').replace('CAMERA: ', '');
  sound.uiClick();
}

function renderResults(standings) {
  const box = el('resultsTable');
  if (!box) return;
  box.innerHTML = standings.map((s, i) => {
    const pos = i === 0 ? T().p1 : T().pN(i + 1);
    return (
      '<div class="res-row' + (s.me ? ' me' : '') + '">' +
      '<div class="res-pos">' + pos + '</div>' +
      '<div class="res-name">' + s.name + '</div>' +
      '<div class="res-time">' + (s.me ? (race && race.bestLap != null ? '★ ' + fmt(race.bestLap) : '—') : '—') + '</div>' +
      '</div>'
    );
  }).join('');
}

function showFinish() {
  const st = race.standings();
  const mePos = st.findIndex((x) => x.me) + 1;
  el('finishEmoji').textContent = mePos === 1 ? '🏆' : mePos === 2 ? '🥈' : mePos === 3 ? '🥉' : '🏁';
  el('finishTitle').textContent = mePos === 1 ? T().finishWin : T().finish;
  renderResults(st);
  el('fsBest').textContent = race.bestLap != null ? fmt(race.bestLap) : '--';
  el('fsTotal').textContent = fmt(race.totalTime);
  el('fsDrift').textContent = Math.round(race.driftScore);
  el('finish').hidden = false;
  el('hud').hidden = true;
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return m + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
}

/* Boutons */
el('btnStart').addEventListener('click', () => {
  sound.resume();
  sound.uiClick();
  hideOverlays();
  el('hud').hidden = false;
  cameraSlot.mode = 'chase';
  hud.setCam(cameraSlot.label(LANG));
  race.input.throttle = 0;
  race.beginCountdown();
});
el('btnResume').addEventListener('click', () => { sound.uiClick(); togglePause(); });
el('btnRestart').addEventListener('click', () => { sound.uiClick(); doRestart(); });
el('btnQuit').addEventListener('click', () => {
  sound.uiClick();
  paused = false;
  hideOverlays();
  el('menu').hidden = false;
  el('hud').hidden = true;
  race.state = 'menu';
  sound.stopEngine();
});
el('btnAgain').addEventListener('click', () => { sound.resume(); sound.uiClick(); doRestart(); });
el('btnMenu').addEventListener('click', () => {
  sound.uiClick();
  hideOverlays();
  el('menu').hidden = false;
  race.state = 'menu';
  sound.stopEngine();
});
el('btnCamSelect').addEventListener('click', cycleCam);
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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ================= Boucle ================= */
let last = performance.now();
let finishedShown = false;

function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.042, (now - last) / 1000);
  last = now;
  if (paused) dt = 0;

  if (race) {
    pollSteer();
    race.update(dt, race.state);

    // Compte à rebours : overlay + feux
    const cd = el('countdown');
    if (race.state === 'countdown') {
      cd.hidden = false;
      el('countNum').textContent = Math.max(1, Math.ceil(race._countdown));
      const lights = document.querySelectorAll('.light');
      lights.forEach((l) => {
        l.classList.remove('on-red', 'on-green');
        if (race._countdown <= 2.05 && race._countdown > 0.02) l.classList.add('on-red');
        if (race._countdown <= 0.02) l.classList.add('on-green');
      });
    } else {
      cd.hidden = true;
    }
    if (race.state === 'finished' && !finishedShown) {
      finishedShown = true;
      showFinish();
    }
    if (race.state !== 'finished') finishedShown = false;

    // Caméra
    const phase = race.state === 'menu' || race.state === 'countdown' ? 'intro' : 'racing';
    if (race.state === 'menu') {
      cameraSlot.update(dt, race.playerCar.group, 0, 'intro');
    } else if (race.state === 'countdown') {
      cameraSlot.update(dt, race.playerCar.group, 0, 'intro');
    } else {
      cameraSlot.update(dt, race.playerCar.group, race.speed, 'racing');
    }
    drawMinimap();
  }

  if (paused) sound.setEngine(0.03, 0, 0);
  track.animateFlags(now / 1000);
  fx.update(dt);
  renderer.render(scene, camera);
}

/* ================= Démarrage ================= */
el('loading').hidden = false;
requestAnimationFrame(() => setTimeout(() => {
  track.build();
  prerenderMinimap();
  const { playerCar, aiCars } = buildCars();
  cameraSlot = new CameraSlot(camera, track);
  race = new RaceGame({ track, playerCar, aiCars, sound, fx, cameraSlot, hud });

  // Placement initial (menu)
  const spawn = track.gridSpawn(0);
  playerCar.reset(spawn.pos, spawn.yaw);
  aiCars.forEach((ai, i) => {
    const sp = track.gridSpawn(i + 1);
    ai.car.reset(sp.pos, sp.yaw);
  });

  el('loading').hidden = true;
  el('menu').hidden = false;
  applyLang();
  hud.setCam(cameraSlot.label(LANG));
  requestAnimationFrame(loop);
}, 60));

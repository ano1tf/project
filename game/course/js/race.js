/* ============================================================
   KREO RACING — CODE DU JEU (race.js)
   Physique arcade-réaliste (dérive, adhérence, hors-piste),
   IA adversaires, tours/chronos, classement, états de course.
   ============================================================ */
import * as THREE from 'three';

export function fmtTime(sec) {
  if (sec == null || !isFinite(sec)) return '--:--.---';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return m + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
}

const GEAR_KMH = [0, 52, 96, 142, 190, 232, 272]; // limites 1..6

export class RaceGame {
  constructor({ track, playerCar, aiCars, sound, fx, cameraSlot, hud }) {
    this.track = track;
    this.playerCar = playerCar;
    this.aiCars = aiCars;
    this.sound = sound;
    this.fx = fx;
    this.cameraSlot = cameraSlot;
    this.hud = hud;

    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.state = 'menu';
    this.totalLaps = 3;

    // Physique joueur
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.lateralVel = 0;
    this.steerAngle = 0;
    this.hint = null;
    this.prevT = 0;
    this.lap = 1;
    this.lapTime = 0;
    this.totalTime = 0;
    this.bestLap = null;
    this.lapTimes = [];
    this.driftScore = 0;
    this._driftNow = 0;
    this._wrongWayTimer = 0;
    this._impactCooldown = 0;
    this._countdown = 0;
    this.driftChain = 0;
    this.driftChainTimer = 0;
    this._boostTimer = 0;
    this._launchHold = 0;
    this._gear = null;
  }

  /* ---------- États ---------- */
  menuPhase() {
    this.state = 'menu';
  }

  beginCountdown() {
    const spawn = this.track.gridSpawn(0);
    this.pos.copy(spawn.pos);
    this.yaw = spawn.yaw;
    this.speed = 0;
    this.lateralVel = 0;
    this.lap = 1;
    this.lapTime = 0;
    this.totalTime = 0;
    this.bestLap = null;
    this.lapTimes = [];
    this.driftScore = 0;
    this._wrongWayTimer = 0;
    this.prevT = 0;
    this.hint = null;
    this.driftChain = 0;
    this.driftChainTimer = 0;
    this._boostTimer = 0;
    this._launchHold = 0;
    this._gear = null;

    this.playerCar.reset(this.pos, this.yaw);
    this.aiCars.forEach((ai, i) => {
      const sp = this.track.gridSpawn(i + 1);
      ai.car.reset(sp.pos, sp.yaw);
      ai.t = ((sp.pos && this.track.nearest(sp.pos.x, sp.pos.z).t) || 0);
      ai.speed = 0;
      ai.lap = 1;
      ai.prevT = ai.t;
      ai.phase = i * 2.31;
    });

    this.state = 'countdown';
    this._countdown = 3.0;
    this.sound.startEngine();
    this.track.setStartLights('off');
    this.sound.countdownBeep(false);
    this._beats = 3;
  }

  restart() {
    this.fx.resetSkids();
    this.beginCountdown();
  }

  /* ---------- Boucle ---------- */
  update(dt, phase) {
    if (this.state === 'countdown') {
      this._countdown -= dt;
      const c = this._countdown;
      if (c <= 2 && this._beats === 3) { this._beats = 2; this.track.setStartLights('red'); this.sound.countdownBeep(false); }
      if (c <= 1 && this._beats === 2) { this._beats = 1; this.sound.countdownBeep(false); }
      if (c <= 0) {
        this.state = 'racing';
        this.track.setStartLights('green');
        this.sound.countdownBeep(true);
        this._beats = 0;
        if (this._launchHold > 0.55) {
          this._boostTimer = 1.5;
          this.hud.banner('perfectStart');
          this.sound.gearShift();
        }
      }
      // Voitures figées, mais moteur qui ronronne (et qui monte si gaz enfoncé)
      if (this.input.throttle > 0.85) this._launchHold += dt; else this._launchHold = 0;
      this._syncPlayerCar(0, dt);
      this.sound.setEngine(0.12 + Math.min(0.55, this._launchHold * 0.9), 0.12 + this.input.throttle * 0.5, 0);
      this._updateHUD();
      return;
    }

    if (this.state === 'racing') {
      this.lapTime += dt;
      this.totalTime += dt;
      this._updatePlayerPhysics(dt);
      this._updateProgress(dt);
      this._updateHUD();
    }

    // IA : avance aussi pendant le compte à rebours ? non — seulement en course
    if (this.state === 'racing') this._updateAI(dt);
    else this._updateAI(0);

    this._impactCooldown = Math.max(0, this._impactCooldown - dt);
  }

  /* ---------- Physique joueur ---------- */
  _updatePlayerPhysics(dt) {
    const inp = this.input;
    this._driftNow = 0;

    // Direction : angle effectif réduit à haute vitesse
    const speedKmh = this.speed * 3.6;
    const steerMax = THREE.MathUtils.lerp(0.64, 0.22, Math.min(1, speedKmh / 240));
    const targetAngle = inp.steer * steerMax;
    this.steerAngle += (targetAngle - this.steerAngle) * Math.min(1, dt * 9);

    // Lacet (modèle bicyclette)
    const wheelbase = 2.9;
    const yawRate = (this.speed / wheelbase) * Math.tan(this.steerAngle);
    this.yaw -= yawRate * dt;

    // Longitudinal
    const maxSpeed = 74;
    const accelBase = 15.5;
    let accel = 0;
    if (inp.throttle > 0) {
      accel = accelBase * inp.throttle * Math.max(0.12, 1 - this.speed / maxSpeed);
    }
    if (inp.brake > 0) {
      if (this.speed > 0.5) accel -= 24 * inp.brake;
      else accel -= 9 * inp.brake; // marche arrière
    }
    // Traînée + roulement
    accel -= this.speed * 0.019 + 0.55;
    if (inp.handbrake) accel -= 7.5;

    if (this._boostTimer > 0) {
      accel *= 1.22;
      this._boostTimer -= dt;
    }
    this.speed += accel * dt;
    this.speed = clamp(this.speed, -14, maxSpeed);
    if (Math.abs(this.speed) < 0.65 && inp.throttle === 0 && inp.brake === 0) this.speed = 0;

    // Position sur le circuit
    const n = this.track.nearest(this.pos.x, this.pos.z, this.hint);
    this.hint = n.index;
    const halfW = n.sample.halfWidth;
    const distC = n.lateral;
    const offTrack = Math.abs(distC) > halfW + 1.15;

    // Adhérence latérale → dérive
    const centrifugal = -yawRate * this.speed;
    this.lateralVel += centrifugal * dt;
    let grip = offTrack ? 3.4 : 6.9;
    if (inp.handbrake && Math.abs(this.speed) > 7) grip = 1.35;
    this.lateralVel *= Math.exp(-grip * dt);

    // Hors-piste : résistance
    if (offTrack) {
      this.speed *= Math.max(0, 1 - 0.5 * dt);
      this.fx.dustAt(this.pos, Math.min(1, Math.abs(this.speed) / 30), dt);
    }

    // Déplacement monde
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const leftV = new THREE.Vector3(-forward.z, 0, forward.x);
    const move = forward.clone().multiplyScalar(this.speed).addScaledVector(leftV, this.lateralVel);
    this.pos.x += move.x * dt;
    this.pos.z += move.z * dt;

    // Barrières
    const n2 = this.track.nearest(this.pos.x, this.pos.z, this.hint);
    this.hint = n2.index;
    const barrierLimit = n2.sample.halfWidth + 4.35;
    if (Math.abs(n2.lateral) > barrierLimit) {
      const sign = Math.sign(n2.lateral);
      const corr = (Math.abs(n2.lateral) - barrierLimit) * sign;
      this.pos.x -= n2.left.x * corr;
      this.pos.z -= n2.left.z * corr;
      this.lateralVel *= -0.32;
      this.speed *= 0.972;
      if (this._impactCooldown <= 0 && Math.abs(this.speed) > 6) {
        this.sound.impact(Math.min(1, Math.abs(this.speed) / 40));
        this.fx.sparksAt(this.pos, 12);
        this._impactCooldown = 0.22;
      }
    }

    // Hauteur (pente)
    const surfY = offTrack
      ? this.track.terrainHeight(this.pos.x, this.pos.z)
      : n2.sample.pos.y;
    this.pos.y += (surfY + 0.02 - this.pos.y) * Math.min(1, dt * 9);

    // Pente : freinage/gravité
    const ahead = this.track.samples[(n2.index + 6) % this.track.samples.length];
    const slope = (ahead.pos.y - n2.sample.pos.y) / 3;
    this.speed -= slope * 7.2 * dt;

    // Effets visuels de dérive
    const slip = Math.abs(this.lateralVel);
    const drifting = slip > 2.6 && Math.abs(this.speed) > 9;
    if (drifting) {
      this.driftChainTimer = 1.15;
      this.driftChain = Math.min(2.2, this.driftChain + dt * 0.5);
      const mult = 1 + this.driftChain;
      this._driftNow = slip * Math.abs(this.speed) * dt * 0.55 * mult;
      this.driftScore += this._driftNow;
      this.fx.smokeAt(this.pos, Math.min(1, slip / 12), dt);
      this.fx.skidAt(this.pos, this.yaw, Math.min(0.5, slip / 16));
      this.sound.tireScreech(Math.min(1, slip / 11));
    } else if (inp.brake > 0.4 && this.speed > 16) {
      this.fx.smokeAt(this.pos, 0.35, dt);
      this.sound.tireScreech(0.32);
    } else {
      this.sound.tireScreech(0);
    }
    if (!drifting) {
      this.driftChainTimer -= dt;
      if (this.driftChainTimer <= 0) this.driftChain = 0;
    }

    // Sens inverse
    const dot = forward.dot(n2.tangent);
    if (dot < -0.25 && this.speed > 3) this._wrongWayTimer += dt;
    else this._wrongWayTimer = 0;

    this._syncPlayerCar(this.speed, dt, accel / 13.5, this.steerAngle / 0.62, Math.min(1, slip / 10), offTrack, inp.brake > 0.3);

    // Moteur sonore
    const kmh = Math.abs(this.speed) * 3.6;
    let gear = 1;
    for (let g = 1; g < GEAR_KMH.length; g++) if (kmh > GEAR_KMH[g - 1]) gear = g;
    const lo = GEAR_KMH[gear - 1], hi = GEAR_KMH[gear] || 272;
    const rpm = 0.16 + 0.84 * clamp((kmh - lo) / Math.max(24, hi - lo), 0, 1);
    if (this._gear != null && gear > this._gear) this.sound.gearShift();
    this._gear = gear;
    this.sound.setEngine(rpm, inp.throttle * 0.85 + 0.15, Math.max(0, accel) / 15.5);
    this.sound.speedNoise(Math.min(1, Math.abs(this.speed) / 72), offTrack);
  }

  _syncPlayerCar(speed, dt, accel, steer, drift, offTrack, braking) {
    this.playerCar.group.position.copy(this.pos);
    this.playerCar.group.rotation.y = this.yaw;
    this.playerCar.animate({
      speed: speed,
      steer: accel !== undefined ? this.input.steer : 0,
      drift: drift || 0,
      accel: accel || 0,
      offTrack: !!offTrack,
      dt: dt
    });
    this.playerCar.setBrake(!!braking);
  }

  /* ---------- Progression / tours ---------- */
  _updateProgress(dt) {
    const n = this.track.nearest(this.pos.x, this.pos.z, this.hint);
    this.hint = n.index;
    const t = n.t;
    if (this.prevT > 0.82 && t < 0.18) {
      // Ligne franchie
      this.lap++;
      this.lapTimes.push(this.lapTime);
      if (this.bestLap == null || this.lapTime < this.bestLap) this.bestLap = this.lapTime;
      this.lapTime = 0;
      if (this.lap === this.totalLaps) this.hud.banner('lastLap');
      if (this.lap > this.totalLaps) {
        this.state = 'finished';
        this.sound.stopEngine();
        this.sound.finishFanfare();
        this.fx.confettiAt(this.pos, 220);
      } else {
        this.sound.lapChime();
      }
    }
    this.prevT = t;
  }

  /* ---------- IA ---------- */
  _updateAI(dt) {
    this.aiCars.forEach((ai) => {
      if (dt <= 0) {
        ai.car.animate({ speed: 0, steer: 0, drift: 0, accel: 0, dt: 0.016 });
        return;
      }
      const N = this.track.samples.length;
      const idx = Math.floor(ai.t * N) % N;
      const s = this.track.samples[idx];

      // Vitesse cible selon la courbure à venir
      const aheadIdx = (idx + 26) % N;
      const curv = this.track.samples[aheadIdx].curvature;
      const target = clamp(Math.sqrt(34 / Math.max(0.012, Math.abs(curv) * 14)), 19, 68) * ai.skill;
      ai.speed += (target - ai.speed) * Math.min(1, dt * 1.35);

      // Ligne de course légèrement décalée
      const lineTarget = Math.sin(ai.t * Math.PI * 6 + (ai.phase || 0)) * 2.1;
      ai.lateral += (lineTarget - ai.lateral) * Math.min(1, dt * 1.1);

      const dist = ai.speed * dt;
      ai.prevT = ai.t;
      ai.t = (ai.t + dist / this.track.totalLength) % 1;
      if (ai.prevT > 0.82 && ai.t < 0.18) ai.lap++;

      const idx2 = Math.floor(ai.t * N) % N;
      const s2 = this.track.samples[idx2];
      ai.car.group.position.copy(s2.pos).addScaledVector(s2.left, ai.lateral);
      ai.car.group.position.y += 0.02;
      const yaw = Math.atan2(s2.tangent.x, s2.tangent.z);
      ai.car.group.rotation.y = yaw;
      ai.car.animate({
        speed: ai.speed,
        steer: clamp(curv * 22, -1, 1),
        drift: 0,
        accel: 0.4,
        dt: dt
      });
    });
  }

  /* ---------- Classement ---------- */
  standings() {
    const list = [];
    const n = this.track.nearest(this.pos.x, this.pos.z, this.hint);
    list.push({
      me: true,
      name: this.playerCar.name,
      progress: (this.lap - 1) + n.t,
      time: this.totalTime
    });
    this.aiCars.forEach((ai) => {
      list.push({
        me: false,
        name: ai.car.name,
        progress: (ai.lap - 1) + ai.t,
        time: ai.totalTime || 0
      });
    });
    list.sort((a, b) => b.progress - a.progress);
    return list;
  }

  /* ---------- HUD ---------- */
  _updateHUD() {
    const kmh = Math.round(Math.abs(this.speed) * 3.6);
    this.hud.setSpeed(kmh);
    this.hud.setGear(this._gear || 1);
    this.hud.setLap(Math.min(this.lap, this.totalLaps), this.totalLaps);
    this.hud.setLapTime(fmtTime(this.lapTime));
    this.hud.setBest(fmtTime(this.bestLap));
    this.hud.setTotal(fmtTime(this.totalTime));
    const st = this.standings();
    const mePos = st.findIndex((x) => x.me) + 1;
    this.hud.setPos(mePos, st.length);
    this.hud.setDrift(this._driftNow > 0.2 ? Math.round(this.driftScore) : null, 1 + this.driftChain);
    this.hud.setWrongWay(this._wrongWayTimer > 1.1);
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

import * as T from "three";
import {
  START,
  STATION,
  ONDES,
  PLACES,
  VEHICLES,
  STORY,
  COURIER,
  DELIVERY_BAYS,
  LOCKED_YARD,
} from "./data.mjs";
import {
  clamp,
  distance,
  lerp,
  expEase,
  angleTo,
  angleDelta,
  wrap,
  TAU,
  onRoad,
  carBlocked,
  driveStep,
} from "./core.mjs";
import {
  writeSave,
  storyEvent,
  courierEvent,
  courierTick,
  transactions,
  useCoffee,
  beginCustody,
  endCustody,
} from "./progress.mjs";
import { echoBrief, echoEvent, echoPhase } from "./echo.mjs";
import {
  inspectJoint,
  nextBench,
  residentAdvice,
  shorePeople,
  shiftPhase,
} from "./littoral.mjs";
import { GREVES_WORKSHOP } from "./rive-layout.mjs";
import {
  PASSAGE_TITLE,
  PASSAGE_REWARD,
  passageBrief,
  passageEvent,
  passagePhase,
} from "./passage.mjs";
import {
  LINE_NAME,
  DOCKS,
  RIDE_MINUTES,
  beginRide,
  finishRide,
  departures,
  otherDock,
  ridePose,
} from "./sondes.mjs";
import {
  advancePort,
  cancelFreight,
  CLIENTS,
  handleFreight,
  manageVenture,
  signFreight,
} from "./port.mjs";
import { CASH_LIMIT, gameMinute, postCash } from "./accounts.mjs";
import { DistrictWorld } from "./world.js";
import { Climate } from "./environment.js";
import { CityLife } from "./dynamics.js";
import { ModelForge, poseHuman } from "./models.js";
import { RenderBudget } from "./render-budget.mjs";
import { PlanView } from "./plan-view.js";
import { RouteRibbon } from "./route-ribbon.js";
import { WorldRoutes, parkingDetour, pathTurn } from "./navigation.mjs";
import { STAGES, shotFrame } from "./cinema.mjs";
import { advanceGait, intention } from "./acting.mjs";

const v3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const STEP = 1 / 60;
const MAX_STEPS = 10;
const MAX_FRAME = STEP * MAX_STEPS;
const EMPTY_INPUT = {};
const FOOT_PITCH = 0.114;
const DRIVE_PITCH = 0.124;
const SEIZE_SPEED = 1.55; // Fictional interaction is offered only at a stop or a crawl.
const DOORS = {
  ondes: ONDES.door,
  cafe: { x: -130, z: 93.45, height: 2.92, sign: "ENTRÉE · LE SILLAGE" },
  archive: { x: -118, z: -97.63, height: 2.84, sign: "ENTRÉE · HANGAR 07" },
};
const navNames = {
  story: "HISTOIRE · CHAPITRE 01",
  courier: "ACTIVITÉ · LIVRAISON",
  echo: "ENQUÊTE · DOSSIER 02",
  passage: "ENQUÊTE · DOSSIER 03",
  freight: "FRET · LA RELÈVE DU PORT",
  custom: "NAVIGATION · POINT LIBRE",
};
export class Meridien {
  constructor(view, progress, prefs, storage, audio, hooks, slot = 0) {
    this.view = view;
    this.progress = progress;
    this.prefs = prefs;
    this.viewPref = prefs.view;
    this.cabinYaw = 0;
    this.storage = storage;
    this.slot = slot;
    this.audio = audio;
    this.hooks = hooks;
    this.cachedMats = new WeakMap();
    this.motion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.smallDevice =
      (navigator.hardwareConcurrency || 8) <= 4 ||
      (navigator.deviceMemory || 8) <= 4 ||
      matchMedia("(pointer: coarse)").matches;
    this.budget = new RenderBudget();
    this.stats = { fps: 0, scale: 1 };
    if (prefs.quality !== "plan") this.openGraphics();
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(57, 1, 0.1, 1280);
    this.camDes = v3();
    this.camTarget = v3();
    this.camSmooth = v3();
    this.project = v3();
    this.anchor = v3();
    this.world = new DistrictWorld(this.scene);
    this.world.station.hold(!!progress.custody);
    this.world.setEcho(progress.echo);
    this.world.rive.setRecord(progress.passage.outcome);
    this.world.portSite.sync(progress.port.venture);
    this.world.portSite.recover(progress);
    this.walkRoutes = new WorldRoutes(this.world.solids);
    this.ribbon = new RouteRibbon(this.scene);
    this.forge = new ModelForge();
    this.shoreModels = new Map();
    this.life = new CityLife(
      this.scene,
      this.world,
      this.forge,
      progress,
      (text, type) => this.notice(text, type),
    );
    this.climate = new Climate(this.scene, this.world, progress, prefs);
    const model = this.forge.person(progress.wardrobe, { hero: true, hue: 0 });
    this.scene.add(model.root);
    const hero = (this.hero = {
      ...progress.position,
      model,
      y: 0.078,
      vy: 0,
      walkSpeed: 0,
      crouch: false,
      air: false,
      stamina: 1,
      car: null,
      gaitPhase: 0,
      inCustody: !!progress.custody,
    });
    for (const [id, p] of Object.entries(progress.vehicles))
      this.life.own(id, p);
    const active = this.life.vehicle(progress.activeVehicle);
    if (active) {
      hero.car = active;
      if (active.trafficId) this.life.prepareDrive(active);
      this.seatHero(active);
      hero.x = hero.car.x;
      hero.z = hero.car.z;
      hero.heading = hero.car.heading;
      hero.y = active.y ?? 0;
      hero.car.travelYaw = hero.car.heading;
      hero.crouch = false;
      hero.model.root.visible = false;
    } else if (this.blockHero(hero.x, hero.z, 0.34, 0.06, 1.57)) {
      const recover = hero.inCustody
        ? STATION.arrival
        : this.safePoint(hero.x, hero.z);
      Object.assign(hero, recover);
    }
    if (progress.transit.ride) this.positionOnLaunch();
    this.yaw = hero.heading;
    if (
      !hero.car &&
      progress.stage === "contact" &&
      distance(hero, START) < 1.5
    )
      this.yaw = hero.heading = angleTo(hero, DOORS.cafe) - 0.1;
    this.pitch = this.restPitch();
    this.manualUntil = 0;
    this.mouseAiming = false;
    this.frameClock = 0;
    this.elapsed = 0;
    this.accumulator = 0;
    this.input = EMPTY_INPUT;
    this.paused = false;
    this.sceneShot = null;
    this.autoSavedAt = 0;
    this.uiAt = -1;
    this.nextPaint = 0;
    this.lastPaint = 0;
    this.previousYaw = this.yaw;
    this.quality(prefs.quality);
    this.windowResize = () => this.rescale();
    window.addEventListener("resize", this.windowResize);
    this.syncHero(0);
    this.updateCamera(1, true);
    this.rescale();
  }
  openGraphics() {
    if (this.renderer) return true;
    const canvas = document.createElement("canvas");
    const attributes = {
      antialias: this.prefs.quality === "high",
      powerPreference: "high-performance",
      alpha: false,
      depth: true,
      stencil: false,
    };
    let gl;
    try {
      gl = canvas.getContext("webgl2", attributes);
    } catch {
      /* lightweight view remains available */
    }
    if (!gl) return false;
    this.renderer = new T.WebGLRenderer({ canvas, context: gl, ...attributes });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setClearColor(0x263d4e);
    this.renderer.shadowMap.type = T.PCFShadowMap;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    this.software = Boolean(
      info &&
      /swiftshader|llvmpipe|software rasterizer|softpipe/i.test(
        gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || "",
      ),
    );
    canvas.setAttribute("aria-hidden", "true");
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.gpuLost = true;
      if (this.mode === "plan") return;
      this.save();
      this.hooks.fault?.();
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.gpuLost = false;
      // A restored GPU context has no valid contents in the cached sun map.
      this.climate.shadowStamp = -1;
      if (this.climate.shadows) this.climate.sun.shadow.needsUpdate = true;
      this.redraw = true;
      this.hooks.recovered?.();
    });
    return true;
  }
  prepare() {
    this.presentFrame(0, 0);
    this.loadReflections();
  }
  loadReflections() {
    if (
      (this.mode !== "standard" && this.mode !== "high") ||
      this.environment ||
      this.hdrRequested
    )
      return;
    // Download and prefilter only when reflections are requested. Never block Éco or Plan.
    this.hdrRequested = true;
    const load = async () => {
      if (this.mode === "low" || this.mode === "plan") {
        this.hdrRequested = false;
        return;
      }
      try {
        const { HDRLoader } = await import("three/addons/loaders/HDRLoader.js");
        const map = await new HDRLoader().loadAsync(
          new URL("../../../assets/env/venice_sunset_1k.hdr", import.meta.url)
            .href,
        );
        map.mapping = T.EquirectangularReflectionMapping;
        this.environment = map;
        this.applyReflections();
      } catch {
        /* Ambient lighting stays available without the reflection image. */
      }
    };
    if ("requestIdleCallback" in window)
      window.requestIdleCallback(load, { timeout: 4000 });
    else setTimeout(load, 1400);
  }
  applyReflections() {
    this.scene.environment =
      this.mode === "high" || this.mode === "standard"
        ? (this.environment ?? null)
        : null;
    this.scene.environmentIntensity = 0.44;
    this.redraw = true;
  }
  begin() {
    const tick = (now) => {
      this.raf = requestAnimationFrame(tick);
      if (document.hidden || (this.gpuLost && this.mode !== "plan")) {
        this.frameClock = 0;
        this.lastPaint = 0;
        this.accumulator = 0;
        this.budget.gap();
        return;
      }
      const interval = this.frameClock ? now - this.frameClock : 0;
      this.frameClock = now;
      if (!this.paused) {
        this.accumulator = Math.min(
          this.accumulator + interval / 1000,
          MAX_FRAME,
        );
        for (
          let n = 0;
          this.accumulator + 1e-7 >= STEP && n < MAX_STEPS;
          n++, this.accumulator -= STEP
        )
          this.step(STEP);
      } else if (!this.sceneShot && !this.redraw) return;
      const active = !this.paused;
      const framePeriod =
        1000 /
        (this.sceneShot || this.mode === "low" || this.mode === "plan"
          ? 30
          : 60);
      if (!this.redraw && now + 1.5 < this.nextPaint) return;
      this.nextPaint = Math.max(
        this.nextPaint + framePeriod,
        now + framePeriod * 0.58,
      );
      const dt = this.lastPaint
        ? Math.min((now - this.lastPaint) * 0.001, 0.145)
        : STEP;
      if (active && this.lastPaint && this.budget.observe(now - this.lastPaint))
        this.rescale();
      this.lastPaint = now;
      this.presentFrame(dt, now);
      this.redraw = false;
      this.stats.fps = this.budget.fps;
      if (
        active &&
        this.mode === "standard" &&
        this.prefs.quality === "auto" &&
        this.budget.reallySlow >= 2
      ) {
        this.autoEco = true;
        this.quality("auto");
        this.notice(
          "Affichage ralenti · le réglage automatique est passé en Éco.",
        );
      } else if (
        active &&
        this.mode === "low" &&
        this.stats.fps > 0 &&
        this.stats.fps < 13 &&
        this.elapsed > 1.85 &&
        !this.suggestedPlan
      ) {
        this.suggestedPlan = true;
        this.notice(
          "La 3D peine. Échap → Paramètres → Plan pour jouer en vue de dessus.",
        );
      }
      if (this.elapsed >= this.uiAt) {
        this.uiAt = this.elapsed + 0.11;
        this.hooks.update?.(this);
      }
    };
    this.raf = requestAnimationFrame(tick);
  }
  presentFrame(dt, now) {
    const shot = this.sceneShot;
    if (shot) shot.age += dt;
    if (this.mode === "plan") {
      this.plan.draw(this, dt || 1);
    } else {
      if (shot) {
        const mouth = shot.playback.mouth(),
          t = Math.max(shot.age, shot.playback.elapsed || 0),
          noa = shot.speaker === "noa";
        this.stagedPerson(
          this.hero.model,
          shot.hero,
          dt,
          intention(shot.cue, t, mouth, noa, this.motion),
        );
        this.stagedPerson(
          shot.npc.model,
          shot.partner,
          dt,
          intention(
            shot.cue,
            t,
            mouth,
            !noa && shot.key !== "choice",
            this.motion,
          ),
        );
      } else {
        this.life.present(dt, this.hero, this.mode, this.motion);
        this.presentShore(dt);
        if (!this.hero.car) this.syncHero(dt);
      }
      this.updateCamera(dt);
      const visualTime = shot ? now * 0.001 : this.elapsed;
      this.climate.update(
        dt,
        this.elapsed,
        this.progress.time,
        shot?.hero || this.hero,
        this.camera,
        this.mode,
        shot?.stage,
        visualTime,
      );
      this.forge.conditions(
        this.climate,
        this.motion ? 0 : visualTime,
        this.mode === "low",
      );
      this.world.animateHarbor?.(
        visualTime,
        this.camera.position,
        this.mode,
        this.motion,
        this.progress.time,
      );
      this.ribbon.show(
        this.prefs.guide && !shot ? this.route() : null,
        !!this.hero.car,
      );
      this.renderer.render(this.scene, this.camera);
    }
    this.hooks.frame?.(this);
  }
  localPeople() {
    return distance(this.hero, GREVES_WORKSHOP) < 79
      ? shorePeople(this.progress.time)
      : [];
  }
  presentShore(dt) {
    const people = this.localPeople();
    for (const model of this.shoreModels.values()) model.root.visible = false;
    for (const p of people) {
      let model = this.shoreModels.get(p.id);
      if (!model) {
        model = this.forge.person(p.style, { hue: p.hue, scale: 0.97 });
        this.shoreModels.set(p.id, model);
        this.scene.add(model.root);
        this.adoptMaterials(model.root);
      }
      model.root.visible = true;
      model.root.position.set(p.x, this.world.floor(p) ?? 0.08, p.z);
      model.root.rotation.y = -p.heading;
      poseHuman(model, dt, this.motion ? 0 : p.speed);
    }
  }
  canWait() {
    const p = this.progress;
    return (
      !p.custody &&
      !this.hero.car &&
      !this.life.alert.level &&
      !p.port.job &&
      !p.transit.ride &&
      p.courier.stage === "idle" &&
      this.paused
    );
  }
  // A deliberate wait uses the same boundary events as ordinary play.
  waitUntil(at) {
    if (
      !this.canWait() ||
      !Number.isSafeInteger(at) ||
      at <= gameMinute(this.progress) ||
      at - gameMinute(this.progress) >= 1440
    )
      return false;
    const p = this.progress,
      before = p.time;
    p.time = at % 1440;
    advancePort(p, before, p.time);
    this.climate.updateConditions(0, this.elapsed, p.time);
    this.uiAt = -1;
    this.redraw = true;
    this.save();
    return true;
  }
  restAtBench(at) {
    return (
      this.action()?.type === "greves-bench" &&
      shiftPhase(this.progress.time) !== "bench" &&
      at === nextBench(gameMinute(this.progress)) &&
      this.waitUntil(at)
    );
  }
  inspectAtBench(index) {
    if (this.action()?.type !== "greves-bench")
      return { status: "unavailable" };
    const result = inspectJoint(this.progress, index);
    if (result.status === "paid") this.portChanged();
    return result;
  }
  greetShore(who) {
    this.notice(`${who.name} · ${residentAdvice(who.id, this.progress.time)}`);
  }
  quality(setting) {
    const hasGraphics =
      setting !== "plan" && !this.gpuLost && this.openGraphics();
    let q = hasGraphics
      ? setting === "auto"
        ? this.software || this.smallDevice
          ? "low"
          : "standard"
        : setting
      : "plan";
    if (hasGraphics && setting === "auto" && this.autoEco) q = "low";
    this.fallback = !hasGraphics && setting !== "plan";
    if (this.mode !== q) {
      const wasPlan = this.mode === "plan";
      this.mode = q;
      this.budget.reset(q);
      this.lastPaint = 0;
      this.nextPaint = 0;
      this.footIntent = null;
      if (q === "plan") {
        this.world.rive.release();
        this.showCockpit(null);
        this.plan ??= new PlanView(this.world);
        this.plan.cut();
        this.view.replaceChildren(this.plan.canvas);
        this.previousYaw = this.yaw;
        this.yaw = 0;
      } else {
        this.world.prepareGraphics((root) => {
          this.adoptMaterials(root);
          this.redraw = true;
        });
        this.view.replaceChildren(this.renderer.domElement);
        const shadows =
          q === "high" ||
          (q === "standard" && !this.software && !this.smallDevice);
        this.renderer.shadowMap.enabled = shadows;
        this.renderer.shadowMap.needsUpdate = shadows;
        this.camera.far = q === "low" ? 690 : 1280;
        this.climate.setQuality(q, shadows);
        this.adoptMaterials(this.scene);
        if (wasPlan) {
          this.yaw = this.previousYaw;
          if (this.firstPerson && this.hero.car) this.recenter();
          if (this.firstPerson) this.pitch = this.restPitch();
        }
        this.updateCamera(1, true);
      }
      this.applyReflections();
    }
    this.rescale();
    this.loadReflections();
    this.redraw = true;
    this.uiAt = -1;
  }
  adoptMaterials(root) {
    root.traverse((o) => {
      const base = o.userData.baseMaterial || o.material;
      if (!o.isMesh || !base?.isMeshStandardMaterial) return;
      if (this.mode !== "low") {
        if (o.userData.baseMaterial) o.material = base;
        return;
      }
      let lite = this.cachedMats.get(base);
      if (!lite) {
        lite = new T.MeshLambertMaterial({
          map: base.map,
          emissive: base.emissive,
          emissiveMap: base.emissiveMap,
          emissiveIntensity: base.emissiveIntensity,
          transparent: base.transparent,
          forceSinglePass: base.forceSinglePass,
          opacity: base.opacity,
          depthWrite: base.depthWrite,
          alphaTest: base.alphaTest,
          side: base.side,
          vertexColors: base.vertexColors,
        });
        lite.color = base.color;
        lite.emissive = base.emissive;
        this.cachedMats.set(base, lite);
      }
      o.userData.baseMaterial = base;
      o.material = lite;
      // Lighting and brake flashes are driven by the current lamp materials in each mode.
    });
  }
  rescale() {
    const w = this.view.clientWidth || innerWidth,
      h = this.view.clientHeight || innerHeight;
    const lowPower =
      this.software ||
      (this.mode === "plan" && (this.smallDevice || this.fallback));
    const scale = this.budget.scale(w, h, devicePixelRatio || 1, lowPower);
    this.stats.scale = scale;
    if (this.mode === "plan") this.plan.size(w, h, scale);
    else {
      const px = Math.floor(w * scale),
        py = Math.floor(h * scale),
        canvas = this.renderer.domElement;
      if (canvas.width !== px || canvas.height !== py)
        this.renderer.setDrawingBufferSize(w, h, scale);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.climate.setResolution(canvas.height);
    }
    this.redraw = true;
  }
  pause(value) {
    this.paused = value;
    this.accumulator = 0;
    this.frameClock = this.lastPaint = this.nextPaint = 0;
    this.budget.gap();
    this.jumpQueued = false;
    this.footIntent = null;
    this.input = EMPTY_INPUT;
    this.audio.pause(value);
    this.redraw = true;
  }
  setInput(value) {
    this.input = value;
  }
  settings() {
    this.audio.volume();
    this.climate.setWeather(this.prefs.weather);
    this.climate.updateConditions(0, this.elapsed, this.progress.time);
    this.quality(this.prefs.quality);
    this.syncPerspective();
  }
  get firstPerson() {
    return this.mode !== "plan" && this.prefs.view === "first";
  }
  syncPerspective() {
    if (this.viewPref === this.prefs.view) return;
    this.viewPref = this.prefs.view;
    this.footIntent = null;
    if (this.mode !== "plan") {
      if (this.hero.car) this.recenter();
      else {
        this.pitch = this.restPitch();
        this.manualUntil = this.elapsed + 0.45;
      }
      this.cameraCut = true;
    }
    this.uiAt = -1;
    this.redraw = true;
  }
  restPitch() {
    const car = this.hero.car;
    if (this.firstPerson)
      return car ? (car.spec.type === "van" ? 0.188 : 0.114) : 0.034;
    return car ? DRIVE_PITCH : FOOT_PITCH;
  }
  notice(text, type = "info") {
    this.hooks.notice?.(text, type);
    if (type === "warning" || type === "reward") this.audio.blip(type);
  }
  announce() {
    if (this.fallback)
      this.notice(
        "WebGL 2 indisponible · Vue Plan activée. La partie reste jouable.",
        "warning",
      );
    if (this.hero.inCustody) {
      this.notice("Contrôle en cours · présentez-vous au guichet de sortie.");
      return;
    }
    if (echoPhase(this.progress) === "lead")
      this.notice("Salomé Renaud · nouveau message dans La Traverse.");
    else if (passagePhase(this.progress) === "lead")
      this.notice("Le Cahier de la passe · Salomé vous attend aux Ondes.");
    if (!this.fallback && this.progress.stage === "contact")
      this.notice(
        this.prefs.guide
          ? this.mode === "plan"
            ? "Suivez le tracé jusqu’à la porte du Sillage."
            : "Suivez les chevrons jusqu’à la porte du Sillage."
          : "Inès Kader · nouveau message sur le téléphone",
      );
  }
  save(manual = false, replaceDamaged = false) {
    const h = this.hero,
      p = this.progress;
    const heading = this.firstPerson && !h.car ? this.yaw : h.heading;
    // Current deck position is derived from timetable on restore, never from a water coordinate.
    const dry = p.transit.ride ? DOCKS[p.transit.ride.from] : h;
    p.position = { x: dry.x, z: dry.z, heading: wrap(heading, TAU) };
    p.activeVehicle = h.car?.id ?? null;
    const snapshot = (c) => ({
      x: c.x,
      z: c.z,
      heading: wrap(c.heading, TAU),
      damage: c.damage,
    });
    for (const [id, c] of this.life.owned) p.vehicles[id] = snapshot(c);
    for (const [id, c] of this.life.seized) p.street.seized[id] = snapshot(c);
    p.alert = { ...this.life.alert };
    const saved = writeSave(this.storage, p, this.slot, replaceDamaged);
    this.autoSavedAt = this.elapsed;
    if (manual)
      this.notice(
        saved
          ? "Partie sauvegardée sur cet appareil."
          : "Sauvegarde indisponible sur cet appareil.",
        saved ? "reward" : "warning",
      );
    return saved;
  }
  setTracking(mode, point) {
    if (point)
      this.progress.waypoint = {
        x: point.x,
        z: point.z,
        label: point.label || "Repère personnel",
      };
    this.progress.tracking = mode;
    this.navState = null;
    this.uiAt = -1;
    this.save();
  }
  target(tracking = this.progress.tracking) {
    const p = this.progress;
    if (p.custody)
      return {
        type: "COMMISSARIAT · RETENUE",
        title: "Passer au guichet",
        text: "Parlez à l’agent pour régler le contrôle et quitter le commissariat.",
        point: STATION.release,
      };
    if (p.transit.ride) {
      const r = p.transit.ride,
        now = gameMinute(p);
      const waiting = now < r.departure;
      return {
        type: "NAVETTE · LIGNE S2",
        title: waiting
          ? "À bord · départ imminent"
          : `En route · ${DOCKS[otherDock(r.from)].label}`,
        text: "Noa descend automatiquement à l’arrivée. Le véhicule reste stationné à quai.",
        timer: Math.max(
          0,
          ((waiting ? r.departure : r.departure + RIDE_MINUTES) - now) / 1.03,
        ),
        point: null,
      };
    }
    if (tracking === "passage") {
      const brief = passageBrief(p);
      if (brief?.target)
        return {
          ...brief,
          type: navNames.passage,
          point: PLACES[brief.target],
        };
    }
    if (tracking === "custom" && p.waypoint)
      return {
        type: navNames.custom,
        title: p.waypoint.label,
        text: "Suivez le tracé sur la mini-carte.",
        point: p.waypoint,
        custom: true,
      };
    const freight = tracking === "freight" && p.port.job;
    if (freight) {
      const collecting = freight.stage === "collect",
        c = CLIENTS[freight.id];
      const car = this.life.vehicle(freight.vehicle);
      const hasCar = this.hero.car === car;
      return {
        type: navNames.freight,
        title: !hasCar
          ? `Reprendre la ${VEHICLES[freight.vehicle].name}`
          : collecting
            ? "Charger à la Balise Nord"
            : `Livrer · ${c.name}`,
        text: !hasCar
          ? "Seul le véhicule inscrit sur le bordereau peut transporter ces caisses."
          : collecting
            ? "Immobilisez-vous dans la baie de fret et chargez à la portière."
            : `Déposez ${freight.qty} caisses (${c.goods}) dans la baie réservée.`,
        point: hasCar
          ? DELIVERY_BAYS[collecting ? "depot" : c.bay]
          : car
            ? {
                x: car.x,
                z: car.z,
                height: 2.35,
                sign: car.spec.name.toUpperCase(),
              }
            : null,
        timer: Math.max(0, (freight.due - gameMinute(p)) / 1.03),
        bay: hasCar,
      };
    }
    const echo = tracking === "echo" ? echoBrief(p) : null;
    if (echo?.target)
      return {
        type: navNames.echo,
        title: echo.title,
        text: echo.text,
        point: PLACES[echo.target],
      };
    const courier = tracking === "courier",
      m = courier ? COURIER[p.courier.stage] : STORY[p.stage];
    const bay =
      courier && this.hero.car ? DELIVERY_BAYS[p.courier.stage] : null;
    return {
      type: navNames[tracking] || navNames.story,
      title: m.title,
      text: bay
        ? "Arrêtez-vous dans la zone de livraison pour remettre le colis ou le reçu sans descendre."
        : m.text,
      point: bay || PLACES[m.target] || null,
      timer: courier && p.courier.stage !== "idle" ? p.courier.time : null,
    };
  }
  route(target = this.target()) {
    if (!target.point) return [];
    const p = target.point,
      h = this.hero,
      a = { x: h.x, z: h.z };
    const key = `${p.x}:${p.z}:${h.car ? "drive" : "walk"}`;
    const prev = this.navState;
    if (
      prev?.k === key &&
      (distance(prev.start, a) < (h.car ? 2.5 : 1.02) ||
        this.elapsed - prev.t < 0.22)
    )
      return prev.path;
    let path,
      park = false;
    if (h.car) {
      park = !onRoad(p.x, p.z);
      path = this.walkRoutes.drive(a, p, !park);
    } else {
      path = parkingDetour(
        this.walkRoutes.route(a, p),
        [...this.life.owned.values(), ...this.life.seized.values()],
        (u, v) => this.walkRoutes.visible(u, v),
      );
    }
    this.navState = { k: key, start: a, path, t: this.elapsed, park };
    return path;
  }
  marker(target) {
    const p = target.point,
      h = this.hero;
    if (!p) return null;
    const path = this.route(target);
    if (h.car && this.navState.park && path.length) {
      return {
        ...path.at(-1),
        height: 1.75,
        sign: "STATIONNER · À PIED ENSUITE",
      };
    }
    const inCafe = h.x > -141.2 && h.x < -118.7 && h.z > 76.2 && h.z < 93.0;
    const inHangar =
      h.x > -136.7 && h.x < -99.3 && h.z > -124.9 && h.z < -97.55;
    if (p === PLACES.cafe && !inCafe) return DOORS.cafe;
    if (p === PLACES.archive && !inHangar) return DOORS.archive;
    if (
      [PLACES.grevesDesk, PLACES.grevesLog].includes(p) &&
      this.world.rive.floor(h) == null
    )
      return PLACES.greves;
    if (
      [PLACES.ondes, PLACES.badge, PLACES.receiver].includes(p) &&
      !this.world.isRoofed(h)
    )
      return DOORS.ondes;
    return p;
  }
  guidance(target) {
    const path = this.route(target),
      h = this.hero,
      p = target.point;
    if (!p) return null;
    const steer = pathTurn(path, h.car ? h.heading : this.yaw, h);
    if (!steer)
      return {
        text:
          distance(h, p) < 2.2 ? "À portée" : "Direction libre · voir la carte",
        angle: 0,
        close: true,
      };
    const abs = Math.abs(steer.delta),
      close = steer.remaining < 3.3;
    let text;
    if (
      h.car &&
      (p === DELIVERY_BAYS[this.progress.courier.stage] || target.bay) &&
      steer.remaining < 10
    )
      text = "Arrêt livraison";
    else if (h.car && this.navState?.park && steer.remaining < 12)
      text = "Ralentir · puis continuer à pied";
    else if (close) text = "Objectif à proximité";
    else if (abs > 2.45) text = h.car ? "Faire demi-tour" : "Derrière vous";
    else if (abs > 0.62) text = steer.delta > 0 ? "À droite" : "À gauche";
    else text = "Tout droit";
    return { text, angle: steer.delta, close };
  }
  remaining(target) {
    if (!target.point) return null;
    const path = this.route(target);
    if (path.length < 2) return distance(this.hero, target.point);
    let len = distance(this.hero, path[1]);
    for (let i = 2; i < path.length; i++) len += distance(path[i - 1], path[i]);
    return len;
  }
  blockHero(x, z, radius, y, height, ignore = null) {
    if (this.world.solids.blocked(x, z, radius, y, height)) return true;
    if (y > 1.07) return false;
    return this.life.allCars().some((c) => {
      if (
        c.parked ||
        c === ignore ||
        Math.abs(c.x - x) > 3.8 ||
        Math.abs(c.z - z) > 3.8
      )
        return false;
      const dx = x - c.x,
        dz = z - c.z,
        s = Math.sin(c.heading),
        co = Math.cos(c.heading);
      return (
        Math.abs(dx * s - dz * co) < c.spec.length * 0.48 + radius &&
        Math.abs(dx * co + dz * s) < c.spec.width * 0.47 + radius
      );
    });
  }
  safePoint(x, z) {
    for (let radius = 0.5; radius < 14; radius += 0.75)
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU,
          xx = x + Math.cos(a) * radius,
          zz = z + Math.sin(a) * radius;
        if (!this.blockHero(xx, zz, 0.37, 0.08, 1.56)) return { x: xx, z: zz };
      }
    return { x: START.x, z: START.z };
  }
  step(dt) {
    const input = this.input,
      h = this.hero,
      p = this.progress;
    const actionJump = this.jumpQueued;
    this.jumpQueued = false;
    if (input.lookLeft || input.lookRight)
      this.orbit(
        (Number(!!input.lookRight) - Number(!!input.lookLeft)) * dt * 1.62,
        0,
      );
    if (h.car) this.stepCar(dt, input);
    else if (!p.transit.ride) this.stepHero(dt, input, actionJump);
    this.elapsed += dt;
    this.followHeading(dt);
    const before = p.time,
      job = p.port.job;
    p.time = wrap(before + dt * 1.03, 1440);
    if (
      Math.floor(before) !== Math.floor(p.time) &&
      advancePort(p, before, p.time)
    ) {
      if (job && !p.port.job) {
        this.notice(
          "Bordereau expiré · consultez Fret dans La Traverse.",
          "warning",
        );
        this.navState = null;
      } else if (p.port.news[0]?.kind === "settled")
        this.notice("Comptoir 12 · Jo a soldé une tournée.", "reward");
      this.uiAt = -1;
      this.save();
    }
    if (p.transit.ride) this.stepLaunch();
    p.sprintBonus = Math.max(0, p.sprintBonus - dt);
    this.climate.updateConditions(dt, this.elapsed, p.time);
    const result = this.life.tick(dt, h, p.time);
    if (result?.type === "arrest") this.arrest(result.level);
    else if (result?.type === "fine") {
      const fine = Math.min(p.cash, result.fine);
      postCash(p, -fine, "fine");
      this.notice(`Contrôle terminé · ${fine} € d’amende`, "warning");
      this.save();
    } else if (result?.type === "evaded") {
      this.notice("Alerte levée · la sûreté a perdu votre trace");
      this.save();
    }
    if (p.stage === "hangar" && distance(h, PLACES.hangar) < 9.1) {
      this.story("arrive");
      this.notice(
        "Accès surveillé · C pour vous accroupir. Passez entre les caisses.",
        "warning",
      );
    }
    if (courierTick(p, dt)) {
      this.notice(
        "Course expirée. Jo vous attend au comptoir pour un nouvel essai.",
        "warning",
      );
      this.save();
    }
    if (this.elapsed - this.autoSavedAt > 9.5) this.save();
    if (this.prefs.sound && this.elapsed >= (this.audioAt || 0)) {
      this.audioAt = this.elapsed + 0.1;
      let near = null,
        d = 34,
        patrol = null,
        sirenDistance = 63;
      for (const c of this.life.allCars()) {
        if (c.id || c.parked) continue;
        const n = distance(c, h);
        if (n < d) {
          near = c;
          d = n;
        }
        if (c.unit < this.life.alert.level && n < sirenDistance) {
          patrol = c;
          sirenDistance = n;
        }
      }
      const pan = (c) =>
        c
          ? clamp(
              ((c.x - h.x) * Math.cos(this.yaw) +
                (c.z - h.z) * Math.sin(this.yaw)) /
                17,
              -1,
              1,
            )
          : 0;
      const cover = this.world.isRoofed(h);
      this.audio.tick({
        car: h.car,
        traffic: near,
        distance: d,
        pan: pan(near),
        sirenDistance,
        sirenPan: pan(patrol),
        cover,
        workshop: cover && distance(h, ONDES) < 11,
        square:
          clamp(1 - distance(h, ONDES.door) / 39, 0, 1) * (cover ? 0.26 : 1),
        minutes: p.time,
        wet: this.climate.wet,
        roadWet: this.climate.roadWet,
        ocean: clamp(1 - (h.x + 190) / 78, 0, 1),
        alert: this.life.alert.level,
        time: this.elapsed,
        throttle: input.forward || input.back,
      });
    }
  }
  stepHero(dt, input, wantJump) {
    const h = this.hero,
      turn = Number(!!input.right) - Number(!!input.left),
      move = Number(!!input.forward) - Number(!!input.back),
      priorHeading = h.heading,
      strength = Math.hypot(turn, move);
    const buff = this.progress.sprintBonus > 0,
      sprint = !!(
        input.sprint &&
        !h.crouch &&
        strength &&
        (h.stamina > 0.045 || buff)
      ),
      speed =
        (h.crouch ? 1.48 : input.walk ? 1.56 : sprint ? 6.55 : 3.64) *
        (this.progress.wardrobe === "rain" ? 1 : 1 - this.climate.wet * 0.1);
    if (sprint && !buff) h.stamina = Math.max(0, h.stamina - dt * 0.098);
    else h.stamina = Math.min(1, h.stamina + dt * (buff ? 0.24 : 0.115));
    const desire = strength ? speed : 0;
    h.linear = lerp(h.linear || 0, desire, expEase(strength ? 15 : 19, dt));
    h.landing = Math.max(0, (h.landing || 0) - dt * 4.5);
    const ground = this.world.floor(h) ?? (onRoad(h.x, h.z) ? 0.016 : 0.083);
    let landed = false;
    if (wantJump && !h.air && !h.crouch) {
      h.air = true;
      h.vy = 4.08;
    }
    if (h.air) {
      h.vy -= 13.9 * dt;
      h.y += h.vy * dt;
      if (h.y <= ground && h.vy <= 0) {
        h.y = ground;
        h.vy = 0;
        h.air = false;
        h.landing = 1;
        landed = true;
      }
    } else h.y = lerp(h.y, ground, expEase(32, dt));
    let x = h.x,
      z = h.z;
    // Keep one world direction per held directional chord. Otherwise an auto-
    // following camera would repeatedly turn the input that it is following.
    const locked =
      !this.mouseAiming &&
      !this.firstPerson &&
      this.mode !== "plan" &&
      this.prefs.camera !== "orbit";
    if (!strength || !locked) this.footIntent = null;
    else if (this.footIntent?.turn !== turn || this.footIntent?.move !== move)
      this.footIntent = { turn, move, yaw: this.yaw };
    if (strength) {
      const yaw = this.footIntent?.yaw ?? this.yaw;
      const xx = (Math.sin(yaw) * move + Math.cos(yaw) * turn) / strength,
        zz = (-Math.cos(yaw) * move + Math.sin(yaw) * turn) / strength;
      const heading = this.firstPerson ? this.yaw : Math.atan2(xx, -zz);
      h.heading += angleDelta(h.heading, heading) * expEase(h.air ? 7 : 13, dt);
      const r = 0.34,
        y = h.y,
        height = h.crouch ? 1.13 : 1.59;
      const nx = x + xx * h.linear * dt,
        nz = z + zz * h.linear * dt;
      if (!this.blockHero(nx, z, r, y, height)) x = nx;
      if (!this.blockHero(x, nz, r, y, height)) z = nz;
    } else if ((this.firstPerson || this.mouseAiming) && !h.air) {
      h.heading += angleDelta(h.heading, this.yaw) * expEase(12, dt);
    }
    const actual = Math.hypot(x - h.x, z - h.z) / dt;
    const bank =
      clamp(angleDelta(priorHeading, h.heading) * 0.76, -0.085, 0.085) *
      clamp(actual / 3.64, 0, 1);
    h.bank = lerp(h.bank || 0, bank, expEase(10, dt));
    h.walkSpeed = lerp(h.walkSpeed, actual, expEase(15, dt));
    h.x = x;
    h.z = z;
    if (!h.air) {
      const next = advanceGait(h.gaitPhase, actual, dt, h.crouch),
        foot = Math.floor(next / Math.PI),
        touchdown = foot !== Math.floor(h.gaitPhase / Math.PI);
      h.gaitPhase = wrap(next, TAU);
      if (this.prefs.sound && (landed || (touchdown && actual > 0.61))) {
        const surface = this.world.groundSound(h.x, h.z);
        this.audio.footstep(
          surface,
          this.climate.roadWet,
          landed ? 1.16 : h.crouch ? 0.37 : 0.46 + actual * 0.11,
          landed,
          foot % 2 ? -1 : 1,
        );
      }
    }
  }
  syncHero(dt) {
    const h = this.hero;
    h.model.root.position.set(h.x, h.y, h.z);
    h.model.root.rotation.y = -h.heading;
    const shadow = h.model.contact;
    const floor = this.world.floor(h);
    shadow.position.y = this.progress.transit.ride
      ? 0.033
      : (floor != null ? floor + 0.008 : onRoad(h.x, h.z) ? 0.022 : 0.097) -
        h.y;
    shadow.material.opacity = h.air ? 0.4 - clamp(h.y, 0, 0.63) * 0.28 : 0.55;
    const reach = Math.max(0, (h.reachUntil || 0) - this.elapsed) / 0.54;
    const gesture = this.motion ? 0 : Math.sin(Math.PI * reach) * 0.68;
    poseHuman(h.model, dt, h.walkSpeed, {
      gesture,
      gaitPhase: h.gaitPhase,
      lean: gesture * 0.27,
      bank: this.motion ? 0 : h.bank || 0,
      crouch: h.crouch,
      air: h.air,
      vertical: h.vy,
      landing: h.landing,
    });
  }
  stepCar(dt, input) {
    const h = this.hero,
      c = h.car,
      heading = c.heading,
      travel = c.travelYaw;
    const delta = driveStep(
      c,
      input,
      dt,
      this.climate.roadWet ?? this.climate.wet,
    );
    const speed = Math.abs(c.speed),
      x = c.x + delta.x,
      z = c.z + delta.z;
    let other = null;
    const f = Math.sin(c.heading),
      n = -Math.cos(c.heading);
    for (const v of this.life.allCars()) {
      if (v === c || Math.abs(v.x - x) > 5.2 || Math.abs(v.z - z) > 5.2)
        continue;
      const vx = v.x - x,
        vz = v.z - z,
        dir = vx * f + vz * n,
        slip = Math.abs(vx * n - vz * f),
        angle = Math.abs(Math.cos(c.heading - v.heading));
      const touch = c.spec.length * 0.42 + v.spec.length * (0.2 + 0.23 * angle),
        w = (c.spec.width + v.spec.width) * 0.44 + (1 - angle) * 0.89;
      if (
        slip < w &&
        Math.abs(dir) < touch &&
        distance(c, v) >= Math.hypot(vx, vz) - 0.002
      ) {
        other = v;
        break;
      }
    }
    const ped = this.life.people.some((p) => {
      if (Math.abs(p.x - x) > 4 || Math.abs(p.z - z) > 4) return false;
      const dx = p.x - x,
        dz = p.z - z;
      return (
        Math.abs(dx * f + dz * n) < c.spec.length * 0.47 + 0.34 &&
        Math.abs(dx * n - dz * f) < c.spec.width * 0.5 + 0.18 &&
        distance(c, p) >= Math.hypot(dx, dz) - 0.004
      );
    });
    const solid = carBlocked(this.world.solids, x, z, c.heading, c.spec);
    if (solid || other || ped) {
      if (!ped && speed > 3.0 && this.elapsed > (this.hitSoundAfter || 0)) {
        this.hitSoundAfter = this.elapsed + 0.52;
        this.audio.impact(speed, Boolean(other));
        c.damage = clamp(
          c.damage + (speed - 2) * 0.025 + (other ? 0.05 : 0),
          0,
          0.94,
        );
        this.shake = this.motion ? 0 : clamp(speed * 0.013, 0, 0.3);
        this.life.collision(h, other, speed);
      }
      c.speed *= solid ? -0.14 : ped ? 0 : 0.27;
      c.heading = heading;
      c.travelYaw = travel;
      c.yawRate *= 0.32;
    } else {
      c.x = x;
      c.z = z;
    }
    c.y = lerp(c.y || 0, onRoad(c.x, c.z) ? 0 : 0.044, expEase(9, dt));
    h.x = c.x;
    h.z = c.z;
    h.heading = c.heading;
    h.walkSpeed = 0;
    h.y = c.y;
  }
  crouch() {
    if (this.progress.transit.ride) return;
    if (!this.hero.car && !this.hero.air) {
      this.hero.crouch = !this.hero.crouch;
      this.uiAt = -1;
    }
  }
  jump() {
    if (this.progress.transit.ride) return;
    this.jumpQueued = true;
  }
  recenter() {
    if (this.mode === "plan") return;
    if (!this.firstPerson || this.hero.car) this.yaw = this.hero.heading;
    this.cabinYaw = 0;
    this.pitch = this.restPitch();
    this.manualUntil = 0;
    this.footIntent = null;
    this.redraw = true;
  }
  setMouseAiming(active) {
    if (this.mouseAiming === active) return;
    this.mouseAiming = active;
    this.footIntent = null;
  }
  orbit(dx, dy) {
    if (this.mode === "plan") return;
    const car = this.hero.car;
    if (this.firstPerson && car) {
      this.cabinYaw = clamp(this.cabinYaw + dx, -1.61, 1.61);
      this.yaw = wrap(car.heading + this.cabinYaw, TAU);
    } else this.yaw = wrap(this.yaw + dx, TAU);
    this.footIntent = null;
    this.pitch = this.firstPerson
      ? clamp(this.pitch + dy, car ? -0.47 : -1.38, car ? 0.83 : 1.38)
      : clamp(this.pitch + dy, this.mouseAiming && !car ? -0.18 : -0.035, 0.54);
    this.manualUntil = this.elapsed + 2.6;
    this.redraw = true;
  }
  followHeading(dt) {
    if (this.firstPerson) {
      if (this.hero.car)
        this.yaw = wrap(this.hero.car.heading + this.cabinYaw, TAU);
      return;
    }
    if (
      this.mouseAiming ||
      this.mode === "plan" ||
      this.elapsed < this.manualUntil
    )
      return;
    const { car, heading } = this.hero;
    if (!car && this.prefs.camera === "orbit") return;
    const behind = car
        ? heading + clamp((car.slip || 0) * 0.62, -0.23, 0.23)
        : heading,
      rate = car ? (Math.abs(car.speed) > 3 ? 4.6 : 1.9) : 4.05;
    this.yaw = wrap(
      this.yaw + angleDelta(this.yaw, behind) * expEase(rate, dt),
      TAU,
    );
    this.pitch = lerp(
      this.pitch,
      car ? DRIVE_PITCH : FOOT_PITCH,
      expEase(1.75, dt),
    );
  }
  clipCamera(point, pad) {
    const a = this.anchor;
    const hit = this.world.solids.trace(
      a.x,
      a.y,
      a.z,
      point.x,
      point.y,
      point.z,
      pad,
    );
    if (hit < 1) point.lerpVectors(a, point, Math.max(0, hit - 0.033));
  }
  showCockpit(model) {
    const old = this.cockpitModel;
    if (old && old !== model) {
      if (old.driver) old.driver.visible = true;
      old.cockpit.grip.visible = false;
      old.glazing.uniforms.cabinView.value = 0;
    }
    this.cockpitModel = model;
    if (model) {
      if (model.driver) model.driver.visible = false;
      model.cockpit.grip.visible = true;
      model.glazing.uniforms.cabinView.value = 1;
    }
  }
  eyeCamera() {
    const h = this.hero,
      car = h.car,
      cam = this.camera;
    if (car) {
      const { body, seat } = car.model;
      body.localToWorld(cam.position.set(seat.x, seat.eyeY, seat.eyeZ));
    } else {
      const bob =
        this.motion || h.air
          ? 0
          : Math.cos(h.gaitPhase * 2) * 0.01 * clamp(h.walkSpeed / 3.64, 0, 1);
      cam.position.set(h.x, h.y + lerp(1.61, 1.09, h.model.bend) + bob, h.z);
    }
    const cp = Math.cos(this.pitch);
    this.camTarget
      .set(
        Math.sin(this.yaw) * cp,
        -Math.sin(this.pitch),
        -Math.cos(this.yaw) * cp,
      )
      .add(cam.position);
    this.camSmooth.copy(this.camTarget);
    const fov = (car ? 66 : 63) + 10 * clamp((1 - cam.aspect) / 0.56, 0, 1);
    if (cam.fov !== fov || cam.near !== 0.042) {
      cam.fov = fov;
      cam.near = 0.042;
      cam.updateProjectionMatrix();
    }
    h.model.root.visible = false;
    cam.lookAt(this.camTarget);
    cam.updateMatrixWorld();
  }
  updateCamera(dt, first = false) {
    const h = this.hero,
      car = h.car,
      shot = this.sceneShot;
    const eye = this.firstPerson && !shot;
    this.showCockpit(eye && car?.model.cockpit ? car.model : null);
    first ||= this.cameraCut || eye !== this.wasEye;
    this.cameraCut = false;
    this.wasEye = eye;
    if (eye) {
      this.eyeCamera();
      return;
    }
    if (this.camera.near !== 0.1) {
      this.camera.near = 0.1;
      this.camera.updateProjectionMatrix();
    }
    const eyeX = h.x,
      eyeZ = h.z,
      eyeY = h.y;
    if (shot) {
      const frame = shotFrame(
        shot.stage,
        shot.key,
        this.camera.aspect,
        this.motion ? 0 : clamp(shot.age / 5, 0, 1),
      );
      this.camTarget.set(frame.targetX, frame.targetY, frame.targetZ);
      this.camDes.set(frame.x, frame.y, frame.z);
      const trace = this.world.solids.trace(
        frame.targetX,
        frame.targetY,
        frame.targetZ,
        frame.x,
        frame.y,
        frame.z,
        0.14,
      );
      if (trace < 1)
        this.camDes.lerpVectors(
          this.camTarget,
          this.camDes,
          Math.max(0.15, trace - 0.055),
        );
      if (this.camera.fov !== frame.fov) {
        this.camera.fov = frame.fov;
        this.camera.updateProjectionMatrix();
      }
      first ||= shot.cut;
      shot.cut = false;
    } else {
      const f = Math.sin(this.yaw),
        z = -Math.cos(this.yaw),
        s = Math.cos(this.yaw),
        r = Math.sin(this.yaw);
      const portrait = clamp((1 - this.camera.aspect) / 0.56, 0, 1),
        speed = car ? Math.abs(car.speed) : 0,
        back = car ? 6.9 + speed * 0.112 : 3.19 + portrait * 0.39,
        shoulder = car ? 0.36 : 0.92 - portrait * 0.34,
        aimAside = car ? 0 : 0.47 - portrait * 0.21,
        y = car ? 1.38 : 1.48 - h.model.bend * 0.39,
        lookAhead = car ? 2.3 + speed * 0.105 : 1.55;
      this.camTarget.set(
        eyeX + f * lookAhead + s * aimAside,
        eyeY + y * (car ? 0.91 : 0.84),
        eyeZ + z * lookAhead + r * aimAside,
      );
      this.camDes.set(
        eyeX - f * back + s * shoulder,
        eyeY + y + back * Math.tan(this.pitch) + (car ? 0.55 : 0.2),
        eyeZ - z * back + r * shoulder,
      );
      this.anchor.set(eyeX, eyeY + y, eyeZ);
      if (this.shake > 0.001) {
        this.shake *= Math.exp(-dt * 7);
        this.camDes.y += Math.sin(this.elapsed * 81) * this.shake;
      }
      this.clipCamera(this.camDes, 0.21);
      const desiredFov =
        (car ? 57 + (this.motion ? 0 : speed * 0.21) : 54) + 9 * portrait;
      if (Math.abs(this.camera.fov - desiredFov) > 0.07) {
        this.camera.fov = lerp(this.camera.fov, desiredFov, expEase(5.3, dt));
        this.camera.updateProjectionMatrix();
      }
    }
    const fade = first
      ? 1
      : expEase(shot ? 8.4 : this.mouseAiming ? 21 : 12.6, dt);
    this.camera.position.lerp(this.camDes, fade);
    this.camSmooth.lerp(
      this.camTarget,
      first ? 1 : expEase(shot ? 8.9 : this.mouseAiming ? 20 : 11.1, dt),
    );
    if (!shot) {
      // Test the smoothed position too: it may cut through a corner in motion.
      this.clipCamera(this.camera.position, 0.17);
      h.model.root.visible =
        !car && this.camera.position.distanceToSquared(this.anchor) > 0.62 ** 2;
    }
    this.camera.lookAt(this.camSmooth);
    this.camera.updateMatrixWorld();
  }
  projected(point) {
    if (this.mode === "plan") return null;
    const cam = this.camera.position,
      height = point.height || 2.45;
    if (
      this.world.solids.trace(cam.x, cam.y, cam.z, point.x, height, point.z) <
      0.96
    )
      return null;
    this.project
      .set(point.x, point.height || 2.45, point.z)
      .project(this.camera);
    if (
      this.project.z < -1 ||
      this.project.z >= 1 ||
      Math.abs(this.project.x) > (this.camera.aspect < 1 ? 0.76 : 0.88) ||
      Math.abs(this.project.y) > 0.78
    )
      return null;
    return [
      (this.project.x * 0.5 + 0.5) * 100,
      (-this.project.y * 0.5 + 0.5) * 100,
    ];
  }
  stagedPerson(model, at, dt, pose) {
    model.root.position.set(at.x, at.y, at.z);
    model.root.rotation.y = -at.heading;
    model.root.visible = true;
    model.contact.position.y = 0.023;
    poseHuman(model, dt, 0, pose);
  }
  setShot(id, npc, line, playback) {
    if (!id) {
      const shot = this.sceneShot;
      if (!shot) return;
      this.sceneShot = null;
      this.hero.model.root.visible = !this.hero.car;
      this.life.placePerson(shot.npc, 0.15, 0);
      this.syncHero(0.15);
      this.climate.lightStamp = this.climate.shadowStamp = -1;
      this.updateCamera(1, true);
    } else {
      const stage = STAGES[id],
        heading = angleTo(stage.hero, stage.npc);
      this.sceneShot = {
        stage,
        npc,
        key: line.shot,
        speaker: line.speaker,
        cue: line.cue,
        playback,
        hero: { ...stage.hero, heading },
        partner: { ...stage.npc, heading: heading + Math.PI },
        age: 0,
        cut: true,
      };
      this.life.setDetail(npc, true);
      this.climate.lightStamp = this.climate.shadowStamp = -1;
    }
    this.redraw = true;
  }
  story(event, ending) {
    if (!storyEvent(this.progress, event, ending)) return false;
    this.progress.tracking = "story";
    if (event === "finish")
      this.notice("La Traverse · Salomé vous a laissé un message.");
    this.uiAt = -1;
    this.navState = null;
    this.save();
    return true;
  }
  investigate(event, choice) {
    const expected = {
      accept: "ondes",
      finish: "ondes",
      watch: "watch",
      badge: "badge",
      tune: "receiver",
    }[event];
    if (
      this.action()?.type !== expected ||
      !echoEvent(this.progress, event, choice)
    )
      return false;
    this.world.setEcho(this.progress.echo);
    this.uiAt = -1;
    this.navState = null;
    this.redraw = true;
    this.save();
    return true;
  }
  caseAction(event, choice) {
    const expected = event === "accept" ? "ondes" : "greves-log";
    if (
      this.action()?.type !== expected ||
      this.life.alert.level ||
      !passageEvent(this.progress, event, choice)
    )
      return false;
    this.world.rive.setRecord(this.progress.passage.outcome);
    this.portChanged();
    if (event === "accept")
      this.notice(`${PASSAGE_TITLE} · rendez-vous à l’embarcadère des Marées.`);
    if (event === "file")
      this.notice(`Dossier clos · +${PASSAGE_REWARD} €`, "reward");
    return true;
  }
  restAtDock(from, at) {
    const offer = this.action();
    return (
      offer?.type === "sondes-dock" &&
      offer.from === from &&
      at === departures(from, gameMinute(this.progress)).opens &&
      this.waitUntil(at)
    );
  }
  boardLaunch(from, departure) {
    const offer = this.action();
    if (
      offer?.type !== "sondes-dock" ||
      offer.from !== from ||
      this.life.alert.level ||
      !beginRide(this.progress, from, departure)
    )
      return false;
    this.positionOnLaunch();
    if (this.mode !== "plan") this.yaw = this.hero.heading - Math.PI * 0.38;
    this.cameraCut = true;
    this.portChanged();
    this.notice(`${LINE_NAME} · place enregistrée, départ à l’horaire.`);
    return true;
  }
  positionOnLaunch() {
    const pose = ridePose(this.progress);
    Object.assign(this.hero, pose, {
      vy: 0,
      walkSpeed: 0,
      air: false,
      crouch: false,
    });
  }
  stepLaunch() {
    const p = this.progress,
      ride = finishRide(p);
    if (!ride) {
      this.positionOnLaunch();
      return;
    }
    const d = DOCKS[otherDock(ride.from)],
      h = this.hero;
    const point = this.blockHero(d.x, d.z, 0.37, 0.08, 1.57)
      ? this.safePoint(d.x, d.z)
      : d;
    Object.assign(h, point, {
      y: 0.08,
      heading: ride.from === "port" ? -Math.PI / 2 : Math.PI / 2,
    });
    if (this.mode !== "plan") this.yaw = h.heading;
    const sample = passageEvent(p, "sample", ride);
    this.cameraCut = true;
    this.plan?.cut();
    this.portChanged();
    this.notice(
      sample
        ? "Plan tamponné des amers · relevé ajouté au Journal."
        : `${d.label} · arrivée de la navette.`,
      sample ? "reward" : "info",
    );
  }
  takeCourier(event) {
    const prior = this.progress.courier.best;
    const outcome = courierEvent(this.progress, event);
    if (!outcome) return;
    this.navState = null;
    this.uiAt = -1;
    this.notice(
      outcome === "started"
        ? "Course acceptée · 2 min 35 s."
        : outcome === "received"
          ? "Colis remis · rapportez le reçu à la Balise Nord."
          : this.progress.courier.best !== prior
            ? "Nouveau record · livraison terminée · +145 €"
            : "Course terminée · +145 €",
      outcome === "paid" ? "reward" : "info",
    );
    this.save();
  }
  signedFreight(id, vehicle, qty) {
    if (this.life.alert.level || !signFreight(this.progress, id, vehicle, qty))
      return false;
    this.portChanged();
    this.notice("Bordereau signé · rendez-vous à la Balise Nord.");
    return true;
  }
  cancelFreight() {
    if (!cancelFreight(this.progress)) return false;
    this.portChanged();
    return true;
  }
  freightAt(car) {
    const j = this.progress.port.job;
    if (!j || car.id !== j.vehicle || this.life.alert.level) return null;
    const source = distance(car, DELIVERY_BAYS.depot) < 2.8;
    const drop =
      j.stage === "loaded" &&
      distance(car, DELIVERY_BAYS[CLIENTS[j.id].bay]) < 2.8;
    if (!source && !drop) return null;
    if (Math.abs(car.speed) > 1.05)
      return { type: "freight-stop", label: "Immobiliser le véhicule · fret" };
    return drop
      ? { type: "freight-drop", label: "Remettre les caisses de fret" }
      : j.stage === "collect"
        ? { type: "freight-load", label: "Charger les caisses de fret" }
        : { type: "freight-return", label: "Bordereau · retourner le fret" };
  }
  freightAction(kind) {
    const j = this.progress.port.job;
    if (
      !this.hero.car ||
      this.action()?.type !== `freight-${kind}` ||
      !handleFreight(this.progress, kind, this.hero.car.id)
    )
      return false;
    this.portChanged();
    this.audio.blip(kind === "drop" ? "reward" : "info");
    if (kind === "drop")
      this.notice(
        `Fret remis · +${j.pay} € · confiance de ${CLIENTS[j.id].person} +1`,
        "reward",
      );
    else
      this.notice(
        kind === "load"
          ? "Caisses arrimées · restez avec le véhicule déclaré."
          : "Caisses restituées à la Balise Nord.",
      );
    return true;
  }
  portChanged() {
    if (this.world.portSite.sync(this.progress.port.venture))
      this.walkRoutes.occupancy.fill(0);
    this.navState = null;
    this.uiAt = -1;
    this.redraw = true;
    this.save();
  }
  managePort(command) {
    const access = command === "buy" ? "port-property" : "port-desk";
    if (
      this.action()?.type !== access ||
      this.life.alert.level ||
      !manageVenture(this.progress, command)
    )
      return false;
    this.portChanged();
    return true;
  }

  buy(kind, id) {
    if (!transactions(this.progress, kind, id)) return false;
    if (kind === "car") {
      const c = this.life.own(id, this.progress.vehicles[id]);
      this.adoptMaterials(c.model.root);
    }
    if (kind === "repair") this.life.owned.get(id).damage = 0;
    if (kind === "outfit") {
      this.forge.outfit(this.hero.model, this.progress.wardrobe);
      if (this.hero.car) this.seatHero(this.hero.car);
    }
    this.redraw = true;
    this.uiAt = -1;
    this.save();
    this.audio.blip("reward");
    return true;
  }
  changeOutfit(outfit) {
    if (
      !["ruste", "night", "rain"].includes(outfit) ||
      (outfit === "rain" && !this.progress.hasRaincoat)
    )
      return false;
    this.progress.wardrobe = outfit;
    this.forge.outfit(this.hero.model, outfit);
    if (this.hero.car) this.seatHero(this.hero.car);
    this.redraw = true;
    this.save();
    return true;
  }
  useFood() {
    if (!useCoffee(this.progress)) return false;
    this.save();
    this.notice("Café consommé · endurance renforcée pour 90 s", "reward");
    return true;
  }
  usable(p, r = 2.9) {
    const h = this.hero;
    return (
      distance(h, p) < r &&
      !h.air &&
      this.world.solids.trace(h.x, h.y + 1.1, h.z, p.x, 1.16, p.z) > 0.965
    );
  }
  action() {
    const h = this.hero,
      p = this.progress;
    if (p.custody)
      return this.usable(STATION.release, 1.65)
        ? { type: "release", label: "Terminer le contrôle" }
        : null;
    if (p.transit.ride)
      return { type: "sondes-ride", label: "Consulter le passage en cours" };
    if (h.car) {
      const stage = p.courier.stage,
        bay = DELIVERY_BAYS[stage];
      if (bay && distance(h, bay) < 3.7) {
        if (Math.abs(h.car.speed) > 1.45)
          return {
            type: "delivery-stop",
            label: "Immobiliser la voiture pour livrer",
          };
        return {
          type: stage,
          label:
            stage === "relay"
              ? "Remettre le colis à la portière"
              : "Déposer le reçu à la portière",
        };
      }
      const freight = this.freightAt(h.car);
      if (freight) return freight;
      return {
        type: "exit",
        label:
          Math.abs(h.car.speed) > 3.05
            ? "Ralentir pour descendre"
            : `Descendre · ${h.car.spec.name}`,
      };
    }
    if (p.stage === "contact" && this.usable(this.life.ines, 3.25))
      return { type: "contact", label: "Parler à Inès" };
    if (p.stage === "archive" && this.usable(PLACES.archive, 2.95))
      return { type: "archive", label: "Copier le registre des manifestes" };
    if (p.stage === "belvedere" && this.usable(this.life.aya, 3.3))
      return {
        type: "finale",
        label: this.life.alert.level
          ? "Sûreté en alerte · Aya attend"
          : "Parler à Aya",
      };
    const dossier = echoPhase(p);
    if (this.usable(PLACES.watch, 2.2))
      return { type: "watch", label: "Consulter le registre de veille" };
    if (p.echo.accepted && this.usable(PLACES.badge, 1.44))
      return { type: "badge", label: "Lire la plaque de commutation" };
    if (this.usable(PLACES.receiver, 1.7))
      return {
        type: "receiver",
        label: ["closed", "debrief"].includes(dossier)
          ? "Consulter le relevé du récepteur"
          : "Examiner le récepteur",
      };
    if (this.usable(this.life.salome, 2.45))
      return { type: "ondes", label: "Parler à Salomé" };
    if (!p.port.venture.owned && this.usable(PLACES.comptoir, 1.9))
      return {
        type: "port-property",
        label: "Consulter la concession · Comptoir 12",
      };
    if (p.port.venture.owned && this.usable(PLACES.comptoirDesk, 1.85))
      return { type: "port-desk", label: "Ouvrir la caisse du Comptoir 12" };
    const cafeCounter = { x: -136.32, z: 84.0 };
    if (this.usable(cafeCounter, 2.85))
      return { type: "cafe", label: "Commander au café Le Sillage" };
    if (p.courier.stage === "idle" && this.usable(PLACES.courier, 3.5))
      return { type: "courier", label: "Parler à Jo · courses de la Darse" };
    if (p.courier.stage === "relay" && this.usable(PLACES.relay, 4.6))
      return { type: "relay", label: "Remettre le colis aux Verrières" };
    if (p.courier.stage === "depot" && this.usable(PLACES.depot, 4.0))
      return { type: "depot", label: "Déposer le reçu · Balise Nord" };
    if (this.usable(PLACES.semaphore, 1.72))
      return { type: "semaphore", label: "Lire le marégraphe" };
    if (this.usable(PLACES.garage, 4.65))
      return { type: "garage", label: "Voir le stock du Garage Estuaire" };
    if (this.usable(PLACES.repair, 4.8))
      return { type: "repair", label: "Consulter l’atelier du Ressac" };
    for (const [from, d] of Object.entries(DOCKS))
      if (this.usable(d, 2.25))
        return { type: "sondes-dock", from, label: `Horaires · ${LINE_NAME}` };
    if (this.usable(PLACES.grevesLog, 1.74))
      return { type: "greves-log", label: "Lire le registre des Calfats" };
    if (this.usable(PLACES.grevesDesk, 1.64))
      return { type: "greves-bench", label: "Consulter le banc de contrôle" };
    for (const resident of this.localPeople())
      if (this.usable(resident, 1.65))
        return {
          type: "greves-greet",
          label: `Parler · ${resident.name}`,
          resident,
        };
    let nearest = null,
      d = 3.35;
    for (const car of this.life.allCars()) {
      if (!car.id) continue;
      const len = distance(h, car);
      if (len < d && this.usable(car, 3.35)) {
        d = len;
        nearest = car;
      }
    }
    if (nearest)
      return {
        type: "enter",
        label: `Monter · ${nearest.spec.name}${nearest.trafficId ? " (volée)" : ""}`,
        car: nearest,
      };
    const walker = this.life.civilians.find(
      (a) => !(a.alarmUntil > this.life.time) && this.usable(a, 1.55),
    );
    if (walker)
      return {
        type: "greet",
        label: walker.role
          ? `Saluer · ${walker.role.name}`
          : "Saluer le passant",
        walker,
      };
    return null;
  }
  streetAction() {
    const h = this.hero;
    if (
      h.car ||
      h.air ||
      h.inCustody ||
      this.progress.transit.ride ||
      this.sceneShot ||
      this.paused
    )
      return null;
    let target = null,
      nearest = 3.35;
    for (const c of this.life.traffic) {
      if (Math.abs(c.speed) > SEIZE_SPEED) continue;
      const d = distance(h, c);
      if (d >= nearest || !this.usable(c, 3.35)) continue;
      nearest = d;
      target = { type: "seize", label: `Braquer · ${c.spec.name}`, car: c };
    }
    const claimed = this.progress.street.robbed;
    for (const p of this.life.civilians) {
      if (claimed.includes(p.civilian)) continue;
      const d = distance(h, p);
      if (d >= nearest || !this.usable(p, 1.8)) continue;
      nearest = d;
      target = { type: "rob", label: "Voler ce passant", walker: p };
    }
    return target;
  }
  streetAct(offered = null) {
    const a = this.streetAction();
    if (
      !a ||
      (offered && (a.car !== offered.car || a.walker !== offered.walker))
    )
      return false;
    const h = this.hero;
    if (a.type === "rob") {
      const p = a.walker;
      const take = Math.min(
        CASH_LIMIT - this.progress.cash,
        12 + ((p.civilian * 11 + 7) % 15),
      );
      this.progress.street.robbed.push(p.civilian);
      postCash(this.progress, take, "street");
      h.reachUntil = this.elapsed + 0.54;
      this.life.alarmPerson(p, h);
      this.life.crime(h, `Vol signalé · +${take} € · sûreté alertée`);
      this.save();
    } else {
      const c = a.car,
        look = c.driver;
      if (!look || !this.life.seize(c)) return false;
      this.life.crime(h, "Véhicule volé · la sûreté vous recherche", 2);
      this.enter(c);
      for (const dir of [-1, 1]) {
        const offset = (c.spec.width * 0.5 + 0.78) * dir,
          x = c.x + Math.cos(c.heading) * offset,
          z = c.z + Math.sin(c.heading) * offset;
        if (this.blockHero(x, z, 0.32, 0.06, 1.5)) continue;
        c.otherDoor = dir > 0 ? 1 : 0;
        const driver = this.life.releaseDriver({ x, z }, c, look);
        this.adoptMaterials(driver.model.root);
        break;
      }
    }
    this.uiAt = -1;
    this.redraw = true;
    return true;
  }
  arrest(level) {
    if (!beginCustody(this.progress, level)) return;
    const h = this.hero,
      car = h.car;
    if (car) {
      this.parkEmpty(car);
      car.doorT = 0;
    }
    Object.assign(h, STATION.arrival, {
      inCustody: true,
      car: null,
      y: 0.083,
      vy: 0,
      air: false,
      crouch: false,
      linear: 0,
      walkSpeed: 0,
      landing: 0,
      bank: 0,
      reachUntil: 0,
      gaitPhase: 0,
    });
    this.input = EMPTY_INPUT;
    this.jumpQueued = false;
    this.life.exposure = this.shake = 0;
    h.model.bend = 0;
    this.changeHolding(true);
    if (this.mode !== "plan") this.yaw = h.heading;
    this.recenter();
    if (this.mode === "plan") {
      this.previousYaw = h.heading;
      this.plan.cut();
    } else {
      this.syncHero(0);
      this.updateCamera(1, true);
    }
    this.save();
    this.hooks.transfer?.();
    this.notice(
      car
        ? "Interpellation · véhicule laissé sur place, repérable sur la carte."
        : "Interpellation · transfert au commissariat des Docks.",
      "warning",
    );
  }
  changeHolding(active) {
    this.world.station.hold(active);
    this.walkRoutes.occupancy.fill(0);
    this.navState = null;
    this.uiAt = -1;
    this.redraw = true;
  }
  releaseCustody() {
    if (this.action()?.type !== "release") return false;
    const fine = endCustody(this.progress);
    if (fine === null) return false;
    this.hero.inCustody = false;
    this.changeHolding(false);
    this.save();
    this.notice(
      fine
        ? `Contrôle terminé · ${fine} € d’amende. La grille est ouverte.`
        : "Contrôle terminé · la grille est ouverte.",
    );
    return true;
  }
  parkEmpty(car) {
    car.speed =
      car.steer =
      car.steerAngle =
      car.slip =
      car.yawRate =
      car.accelG =
        0;
    this.life.setDriver(car, null);
    car.braking = false;
    car.gear = "N";
    car.otherDoor = null;
  }
  seatHero(car) {
    this.life.setDriver(car, {
      style: this.progress.wardrobe,
      hue: 0,
      hero: true,
    });
  }
  enter(car) {
    if (car.trafficId) {
      this.life.prepareDrive(car);
      this.adoptMaterials(car.model.root);
    }
    const h = this.hero,
      fromX = h.x,
      fromZ = h.z;
    h.car = car;
    this.seatHero(car);
    h.crouch = false;
    h.air = false;
    h.vy = 0;
    h.walkSpeed = 0;
    h.x = car.x;
    h.z = car.z;
    h.heading = car.heading;
    car.travelYaw = car.heading;
    car.yawRate = car.accelG = 0;
    car.otherDoor = null;
    car.doorSide =
      (fromX - car.x) * Math.cos(car.heading) +
        (fromZ - car.z) * Math.sin(car.heading) >
      0
        ? 1
        : 0;
    car.doorT = 0.025;
    h.y = car.y ?? 0;
    h.model.root.visible = false;
    if (this.firstPerson) this.recenter();
    this.manualUntil = 0;
    this.footIntent = null;
    this.navState = null;
    this.save();
    this.audio.door(car.spec.type === "van");
  }
  exit() {
    const h = this.hero,
      c = h.car;
    if (!c) return false;
    if (Math.abs(c.speed) > 3.05) {
      this.notice("Ralentissez avant de descendre.");
      return false;
    }
    let found = false;
    for (const [a, b] of [
      [-1.62, 0],
      [1.62, 0],
      [-1.64, -0.82],
      [1.64, -0.82],
      [0, -3.05],
      [0, 3.05],
    ]) {
      const x = c.x + Math.cos(c.heading) * a + Math.sin(c.heading) * b,
        z = c.z + Math.sin(c.heading) * a - Math.cos(c.heading) * b;
      if (this.blockHero(x, z, 0.36, 0.06, 1.59)) continue;
      h.x = x;
      h.z = z;
      c.doorSide = a > 0 ? 1 : 0;
      found = true;
      break;
    }
    if (!found) {
      this.notice("Aucune sortie libre. Déplacez le véhicule.");
      return false;
    }
    this.parkEmpty(c);
    c.doorT = 0.025;
    h.car = null;
    h.y = onRoad(h.x, h.z) ? 0.016 : 0.083;
    h.heading = c.heading;
    h.linear = 0;
    this.footIntent = null;
    if (this.firstPerson) {
      this.yaw = h.heading;
      this.recenter();
    }
    h.model.root.visible = !this.firstPerson;
    this.syncHero(0);
    this.save();
    this.audio.door(c.spec.type === "van");
    return true;
  }
  greet(walker) {
    if (this.elapsed < (walker.greetTimer || 0)) return;
    walker.greetTimer = this.elapsed + 9;
    const lines = [
      "Salut ! Ça sent la pluie sur la baie.",
      "Le café ferme tard, ce soir. Inès y est souvent.",
      "Au belvédère, on voit même le phare par temps clair.",
      "Bonsoir. Faites attention aux feux sur le boulevard.",
    ];
    this.notice(walker.role?.advice || lines[walker.hue % lines.length]);
  }
}

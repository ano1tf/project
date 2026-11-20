import test from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import {
  BOUNDS,
  ENDINGS,
  VEHICLES,
  X,
  Z,
  START,
  STATION,
  PLACES,
  SILLAGE_ZEBRA,
  SCENES,
  CAST,
  TRAFFIC_IDS,
  CIVILIAN_COUNT,
} from "../game/meridien/js/data.mjs";
import {
  Solids,
  TAU,
  carBlocked,
  circuit,
  laneMotion,
  onCrosswalk,
  stopClearance,
  trafficOverhang,
  trafficStopGap,
  distance,
  driveStep,
  navRoute,
  onRoad,
  sampleRoute,
  signalState,
  trafficRoute,
} from "../game/meridien/js/core.mjs";
import {
  createAlert,
  beginCustody,
  endCustody,
  courierEvent,
  courierTick,
  freshProgress,
  raiseAlert,
  readSave,
  readSettings,
  SAVE_KEY,
  PREF_KEY,
  storyEvent,
  tickAlert,
  transactions,
  useCoffee,
  validateProgress,
  writeSave,
} from "../game/meridien/js/progress.mjs";

import {
  ECHO_OUTCOMES,
  echoBrief,
  echoEvent,
  echoPhase,
  echoScene,
  freshEcho,
} from "../game/meridien/js/echo.mjs";
import { PROFILES, RenderBudget } from "../game/meridien/js/render-budget.mjs";
import { WalkRoutes, pathTurn } from "../game/meridien/js/navigation.mjs";
import {
  SceneAudio,
  mouthAt,
  shotFrame,
  STAGES,
} from "../game/meridien/js/cinema.mjs";
import { VOICES } from "../game/meridien/js/voices.mjs";
import { advanceGait, gait, intention } from "../game/meridien/js/acting.mjs";

const goToEnd = (p) =>
  ["contact", "arrive", "take"].forEach((a) =>
    assert.equal(storyEvent(p, a), true),
  );

test("chapitre : ordre des objectifs, récompenses et choix irréversible", () => {
  for (const ending of Object.keys(ENDINGS)) {
    const p = freshProgress(),
      cash = p.cash;
    assert.equal(storyEvent(p, "take"), false);
    assert.equal(storyEvent(p, "finish", ending), false);
    goToEnd(p);
    assert.equal(storyEvent(p, "finish", "absent"), false);
    assert.equal(storyEvent(p, "finish", ending), true);
    assert.equal(storyEvent(p, "finish", ending), false);
    assert.equal(p.stage, "done");
    assert.equal(p.ending, ending);
    assert.equal(p.cash, cash + ENDINGS[ending].reward);
    const before = p.cash;
    assert.equal(transactions(p, "coffee"), true);
    assert.equal(before - p.cash, ending === "protect" ? 0 : 8);
  }
});

test("course en deux étapes : expiration, reprise, prix et absence de gain en double", () => {
  const p = freshProgress();
  assert.equal(courierEvent(p, "relay"), null);
  assert.equal(courierEvent(p, "start"), "started");
  assert.equal(courierEvent(p, "start"), null);
  assert.equal(courierEvent(p, "depot"), null);
  assert.equal(courierTick(p, 50), false);
  assert.equal(p.courier.time, 105);
  assert.equal(courierTick(p, 106), true);
  assert.equal(p.courier.runs, 0);
  assert.equal(p.tracking, "story");
  assert.equal(courierEvent(p, "start"), "started");
  assert.equal(courierEvent(p, "relay"), "received");
  assert.equal(courierEvent(p, "depot"), "paid");
  assert.equal(courierEvent(p, "depot"), null);
  assert.equal(p.cash, 385);
  assert.equal(p.courier.runs, 1);
});

test("transaction : pas de découvert ni de duplication, inventaire utilisable", () => {
  const p = freshProgress(),
    cost = p.cash;
  assert.equal(transactions(p, "car", "estuaire"), false);
  assert.deepEqual(Object.keys(p.vehicles), ["mistral"]);
  assert.equal(p.cash, cost);
  assert.equal(useCoffee(p), false);
  assert.equal(transactions(p, "coffee"), true);
  assert.equal(useCoffee(p), true);
  assert.equal(p.coffees, 0);
  assert.equal(p.sprintBonus, 90);
  assert.equal(transactions(p, "outfit"), true);
  assert.equal(transactions(p, "outfit"), false);
  assert.equal(p.wardrobe, "rain");
  p.cash = 1100;
  assert.equal(transactions(p, "car", "boreal"), true);
  assert.equal(transactions(p, "car", "boreal"), false);
  assert.equal(p.cash, 420);
  p.vehicles.boreal.damage = 0.41;
  assert.equal(transactions(p, "repair", "boreal"), true);
  assert.equal(p.vehicles.boreal.damage, 0);
  assert.equal(p.cash, 372);
});

test("sauvegarde v2 : position, progression, propriétés et conduite reprises exactement", () => {
  const m = new Map(),
    storage = {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => m.set(k, v),
    };
  const p = freshProgress();
  p.position = { x: -36.25, z: 52.6, heading: 1.72 };
  goToEnd(p);
  storyEvent(p, "finish", "protect");
  p.cash = 1000;
  transactions(p, "car", "estuaire");
  transactions(p, "outfit");
  transactions(p, "coffee");
  p.activeVehicle = "estuaire";
  p.vehicles.estuaire.damage = 0.44;
  courierEvent(p, "start");
  courierTick(p, 6);
  assert.equal(writeSave(storage, p), true);
  assert.deepEqual(readSave(storage), p);
  m.set(SAVE_KEY, "{illisible");
  assert.equal(readSave(storage), null);
  const denied = {
    getItem() {
      throw Error("localStorage bloqué");
    },
    setItem() {
      throw Error("quota");
    },
  };
  assert.equal(readSave(denied), null);
  assert.equal(writeSave(denied, p), false);
  assert.equal(readSettings(denied).quality, "auto");
});

test("validation : valeurs hors limites et états impossibles corrigés", () => {
  const p = validateProgress({
    version: 1,
    position: { x: 1e50, z: -1e50 },
    cash: "infini",
    stage: "done",
    ending: "inconnu",
    wardrobe: "rain",
    activeVehicle: "ghost",
    vehicles: { ghost: { x: 0 } },
    courier: { stage: "relay", time: -1 },
    tracking: "custom",
  });
  assert.ok(p.position.x < BOUNDS.maxX && p.position.z > BOUNDS.minZ);
  assert.equal(p.position.heading, START.heading);
  assert.equal(p.stage, "belvedere");
  assert.equal(p.wardrobe, "ruste");
  assert.equal(p.activeVehicle, null);
  assert.equal(p.courier.stage, "idle");
  assert.equal(p.tracking, "story");
  assert.equal(validateProgress({ version: 999 }), null);
});

test("sauvegarde du vol : voitures distinctes du garage, butin unique et avis de recherche", () => {
  const legacy = validateProgress({ version: 1 });
  assert.deepEqual(legacy.street, { robbed: [], seized: {} });
  assert.deepEqual(legacy.alert, createAlert());
  const id = TRAFFIC_IDS[4],
    car = { x: -151.6, z: 36.2, heading: 0, damage: 0.18 };
  const occupied = validateProgress({
    ...legacy,
    street: {
      robbed: [7, 2, 7, "2", -1, CIVILIAN_COUNT, null],
      seized: {
        [id]: car,
        mistral: car,
        unknown: car,
        [TRAFFIC_IDS[0]]: { x: 2 },
      },
    },
    activeVehicle: id,
    alert: { level: 2, stop: 0.36, unseen: 1.2, last: { x: car.x, z: car.z } },
  });
  assert.deepEqual(occupied.street, { robbed: [2, 7], seized: { [id]: car } });
  assert.equal(occupied.activeVehicle, id);
  assert.deepEqual(Object.keys(occupied.vehicles), ["mistral"]);
  assert.equal(transactions(occupied, "repair", id), false);
  assert.equal(occupied.alert.level, 2);
  assert.equal(occupied.alert.stop, 0.36);
  assert.deepEqual(validateProgress(occupied), occupied);
  for (const value of ["ghost", "constructor", "__proto__", 4, TRAFFIC_IDS[0]])
    assert.equal(
      validateProgress({ ...occupied, activeVehicle: value }).activeVehicle,
      null,
    );
  assert.deepEqual(
    validateProgress({ ...occupied, alert: { level: -2 } }).alert,
    createAlert(),
  );
});

test("préférence de caméra : suivi par défaut et option manuelle persistante", () => {
  const storage = (camera) => ({
    getItem: (k) => (k === PREF_KEY ? JSON.stringify({ camera }) : null),
  });
  assert.equal(readSettings(storage(undefined)).camera, "follow");
  assert.equal(readSettings(storage("orbit")).camera, "orbit");
  assert.equal(readSettings(storage("zoom")).camera, "follow");
});

test("souris : mode direct par défaut et glissé enregistré", () => {
  const config = (mouseLook) => ({
    getItem: () => JSON.stringify({ mouseLook }),
  });
  assert.equal(readSettings(config(undefined)).mouseLook, "direct");
  assert.equal(readSettings(config("drag")).mouseLook, "drag");
  assert.equal(readSettings(config("unknown")).mouseLook, "direct");
});

test("franchissement : murs, porte, saut au-dessus d’un petit obstacle et caméra", () => {
  const w = new Solids(12);
  w.add(10, 18, 8, 1, 3.2);
  w.add(0, 18, 8, 1, 3.2);
  w.add(5, 18, 2, 1, 3.2, 2.44);
  w.add(6, 25, 1, 1, 0.48);
  const p = { x: 5, z: 20 };
  w.move(p, 0, -2, 0.33, 0.05, 1.58);
  assert.equal(p.z, 18);
  const blocked = { x: 2, z: 20 };
  w.move(blocked, 0, -2, 0.33, 0.05, 1.58);
  assert.equal(blocked.z, 20);
  assert.equal(w.blocked(6, 25, 0.4, 0.52, 1.58), false);
  assert.equal(w.blocked(6, 25, 0.4, 0.2, 1.58), true);
  assert.ok(w.trace(2, 1.5, 16, 2, 1.5, 24, 0.12) < 0.5);
  assert.equal(w.trace(5, 1.5, 16, 5, 1.5, 24, 0.12), 1);
  assert.equal(w.blocked(BOUNDS.maxX + 0.2, 5, 0.33), true);
  assert.equal(carBlocked(w, 3, 20, 0, VEHICLES.mistral), true);
});

test("circulation : circuit fermé, voie droite et phases non conflictuelles", () => {
  const r = trafficRoute(circuit(0, 0, 2, 2));
  assert.ok(r.length > 480);
  assert.equal(
    distance(sampleRoute(r, 5), sampleRoute(r, 5 + r.length)) < 1e-8,
    true,
  );
  for (let i = 0; i < r.length; i += 1.85) {
    const p = sampleRoute(r, i);
    assert.equal(onRoad(p.x, p.z), true);
  }
  const n = r.stops.find(({ zebra }) => zebra.i === 0 && zebra.j === 0);
  assert.ok(sampleRoute(r, n.s - 15).x > X[0]); // heading north, east side of the street
  for (let i = 0; i < 25; i++)
    for (let j = 0; j < 6; j++)
      for (let t = 0; t < 48; t += 0.25) {
        assert.ok(
          signalState(t, i, j, "z") === "red" ||
            signalState(t, i, j, "x") === "red",
        );
      }
  const nav = navRoute(VEHICLES.mistral, PLACES.hangar);
  assert.equal(nav.at(-1), PLACES.hangar);
  assert.ok(nav.slice(1, -1).every((p) => onRoad(p.x, p.z)));
});

test("zébras : le pare-chocs s’arrête avant la ligne, y compris au Sillage et en bouclant", () => {
  const clear = () => false;
  for (const reverse of [false, true]) {
    const route = trafficRoute(circuit(0, 2, 2, 4, reverse));
    assert.equal(
      route.stops.filter(({ zebra }) => zebra === SILLAGE_ZEBRA).length,
      1,
    );
    for (const { s: line, zebra } of route.stops) {
      const { axis } = zebra,
        side = Math.sign(sampleRoute(route, line)[axis] - zebra[axis]),
        phase = ((zebra.i ?? 0) * 5 + (zebra.j ?? 0) * 8) % 24,
        isSillage = zebra === SILLAGE_ZEBRA,
        red = (axis === "z" ? 15 : 5) - phase,
        green = (axis === "z" ? 4 : 16) - phase;
      for (const spec of Object.values(VEHICLES)) {
        const lead = stopClearance(spec.length),
          goal = line - lead;
        let speed = 12.85,
          s = goal + route.length - 21;
        // At signs: pedestrians on the far half of the crosswalk also have priority.
        const p = {
          ...zebra,
          [axis === "z" ? "x" : "z"]:
            zebra[axis === "z" ? "x" : "z"] + zebra.span * 0.42,
        };
        const walking = (z) => z === zebra && onCrosswalk(p, z);
        for (let i = 0; i < 260; i++) {
          const gap = trafficStopGap(
            route,
            s,
            speed,
            isSillage ? green : red,
            spec.length,
            isSillage ? walking : clear,
          );
          const step = laneMotion(speed, 12.85, gap, 1 / 60);
          s += step.advance;
          speed = step.speed;
          const center = sampleRoute(route, s)[axis];
          assert.ok(
            (center - zebra[axis]) * side - trafficOverhang(spec.length) >=
              zebra.depth / 2 + 0.17,
          );
        }
        assert.equal(speed, 0);
        assert.ok(Math.abs(s - goal - route.length) < 1e-5);
        assert.ok(
          trafficStopGap(route, s, speed, green, spec.length, clear) > 4,
        );
        assert.equal(
          trafficStopGap(route, s, speed, green, spec.length, walking),
          0,
        );
        assert.ok(
          trafficStopGap(route, goal + 0.4, speed, red, spec.length, walking) >
            4,
        );
      }
    }
  }
});

test("zébras : arrêt d’urgence borné et feu orange sans blocage après engagement", () => {
  const route = trafficRoute(circuit(0, 0, 1, 2)),
    s = route.stops[0].s,
    length = VEHICLES.estuaire.length,
    line = s - stopClearance(length),
    noPed = () => false;
  const late = trafficStopGap(route, line - 0.032, 12, 12, length, noPed);
  const braked = laneMotion(12, 12, late, 0.145);
  assert.ok(Math.abs(braked.advance - 0.032) < 1e-8);
  assert.equal(braked.speed, 0);
  assert.ok(braked.braking);
  assert.equal(
    trafficStopGap(route, line - 1.5, 12, 10, length, noPed),
    Infinity,
  );
  assert.ok(trafficStopGap(route, line - 8, 5, 10, length, noPed) < 8.01);
});

test("conduite : profils distincts, marche arrière, frein et grip sous la pluie", () => {
  const car = (id) => ({ spec: VEHICLES[id], speed: 0, heading: 0, damage: 0 });
  const f = (c, n, input, wet = 0) => {
    for (let i = 0; i < n; i++) driveStep(c, input, 1 / 60, wet);
    return c;
  };
  const sport = f(car("boreal"), 120, { forward: true }),
    van = f(car("estuaire"), 120, { forward: true });
  assert.ok(sport.speed > van.speed + 5);
  assert.ok(sport.speed < sport.spec.max);
  const intact = f(car("mistral"), 1200, { forward: true }),
    damaged = f({ ...car("mistral"), damage: 0.72 }, 1200, { forward: true });
  assert.ok(damaged.speed < intact.speed - 6);
  const a = f({ ...sport }, 30, { forward: true, right: true }, 0),
    b = f({ ...sport }, 30, { forward: true, right: true }, 1);
  const gap = (c) => (c.heading - c.travelYaw + TAU) % TAU;
  assert.ok(gap(b) > gap(a));
  assert.ok(Math.abs(f({ ...a }, 240, { handbrake: true }).speed) < 0.05);
  assert.ok(f(car("mistral"), 100, { back: true }).speed < -5);
});

test("conduite : tous les véhicules reculent depuis l’arrêt, même sous la pluie", () => {
  for (const spec of Object.values(VEHICLES)) {
    const car = { spec, heading: 0, speed: 0, damage: 0.71 };
    let moved = 0;
    for (let i = 0; i < 75; i++)
      moved += driveStep(car, { back: true }, 1 / 60, 1).z;
    assert.ok(
      car.speed < -2.25 && moved > 1.4,
      `${spec.name} : ${car.speed} m/s`,
    );
    assert.equal(car.gear, "R");
    for (let i = 0; i < 180; i++)
      driveStep(car, { handbrake: true }, 1 / 60, 1);
    assert.equal(car.speed, 0);
    assert.equal(car.gear, "N");
  }
});

test("sûreté : escalade, contrôle ou fin de recherche hors champ", () => {
  const p = { x: 10, z: 20 },
    a = createAlert(),
    updates = (count, visible, canStop) => {
      let r;
      for (let i = 0; i < count; i++)
        r = tickAlert(a, 1, visible, canStop, p) ?? r;
      return r;
    };
  raiseAlert(a, p);
  assert.equal(a.level, 1);
  updates(20, true, false);
  assert.equal(a.level, 2);
  updates(20, true, false);
  assert.equal(a.level, 3);
  assert.deepEqual(updates(31, false, false), { type: "evaded" });
  assert.equal(a.level, 0);
  raiseAlert(a, p);
  assert.deepEqual(updates(3, true, true), { type: "fine", fine: 35 });
  assert.equal(a.level, 0);
});

test("commissariat : contrôles persistants, amende unique et reprise de la course", () => {
  const p = freshProgress(),
    a = p.alert,
    start = p.position;
  courierEvent(p, "start");
  courierTick(p, 12);
  goToEnd(p);
  p.activeVehicle = "mistral";
  p.vehicles.mistral.damage = 0.41;
  raiseAlert(a, start, 2);
  assert.equal(tickAlert(a, 1.45, true, true, start), null);
  assert.equal(tickAlert(a, 0.83, true, false, start), null);
  assert.equal(a.stop, 0);
  const result = tickAlert(a, 2.2, true, true, start);
  assert.deepEqual(result, { type: "arrest", level: 2 });
  assert.equal(beginCustody(p, result.level), true);
  assert.equal(beginCustody(p, 3), false);
  assert.equal(p.activeVehicle, null);
  assert.deepEqual(p.position, STATION.arrival);
  assert.deepEqual(p.alert, createAlert());
  assert.equal(courierTick(p, 145), false);
  assert.equal(p.courier.time, 143);
  const resumed = validateProgress({
    ...p,
    activeVehicle: "mistral",
    position: START,
    alert: { level: 3 },
  });
  assert.deepEqual(resumed, p);
  assert.equal(resumed.stage, "belvedere");
  assert.equal(resumed.vehicles.mistral.damage, 0.41);
  assert.equal(endCustody(resumed), 70);
  assert.equal(endCustody(resumed), null);
  assert.equal(resumed.cash, 170);
  assert.equal(validateProgress(resumed).custody, null);
  assert.equal(courierTick(resumed, 2), false);
  assert.equal(resumed.courier.time, 141);
  p.cash = 0;
  assert.equal(endCustody(p), 0);
  assert.equal(p.custody, null);
  assert.equal(validateProgress({ version: 1 }).custody, null);
  const config = (view) => ({
    getItem: () => JSON.stringify({ view, camera: "orbit" }),
  });
  assert.equal(readSettings(config("first")).view, "first");
  assert.equal(readSettings(config("first")).camera, "orbit");
  assert.equal(readSettings(config("outside")).view, "third");
});

test("budget graphique : adaptation progressive, marge mémoire et reprise après pause", () => {
  const b = new RenderBudget("low");
  const w = 1920,
    h = 1080;
  const initial = b.scale(w, h, 2, true);
  assert.ok(initial ** 2 * w * h <= PROFILES.low.softwarePixels + 1);
  assert.ok(b.scale(w, h, 2, false) > initial);
  for (let i = 0; i < 46; i++) b.observe(132);
  assert.ok(b.scale(w, h, 2, true) < initial);
  for (let i = 0; i < 150; i++) b.observe(160);
  assert.equal(b.multiplier, PROFILES.low.min);
  assert.ok(b.reallySlow >= 2);
  b.gap();
  const stop = b.multiplier;
  assert.equal(b.observe(480), false);
  assert.equal(b.multiplier, stop);
  for (let i = 0; i < 1800; i++) b.observe(18);
  assert.equal(b.multiplier, 1);
  b.reset("plan");
  assert.equal(b.profile, PROFILES.plan);
});

test("guidage à pied : évite les murs, rejoint une porte et sait renoncer à une zone close", () => {
  const s = new Solids();
  const span = { minX: -29, maxX: 27, minZ: -42, maxZ: 3 };
  const r = new WalkRoutes(s, 2, span);
  s.add(-6, -20, 3.0, 18, 4.1);
  s.add(11.0, -13.0, 18, 0.36, 4.2);
  s.add(4.2, -29.0, 4.2, 0.36, 4.2);
  s.add(14.6, -29.0, 10.6, 0.36, 4.2); // Aperture around x=8, z=-29
  s.add(2, -21, 0.36, 16, 4.2);
  s.add(20, -21, 0.36, 16, 4.2);
  const a = { x: -13, z: -21 },
    b = { x: 9, z: -18 };
  assert.equal(r.visible(a, b), false);
  const path = r.route(a, b);
  assert.ok(path.length > 2 && path.length < 10);
  assert.deepEqual(path[0], a);
  assert.deepEqual(path.at(-1), b);
  for (let i = 1; i < path.length; i++)
    assert.ok(r.visible(path[i - 1], path[i], 0.42));
  const turn = pathTurn(path, 0, a);
  assert.ok(turn.remaining > distance(a, b));
  assert.ok(Math.abs(turn.delta) > 0.04);
  const solidRoom = new Solids();
  for (const z of [-29, -13]) solidRoom.add(11, z, 18, 0.42, 4.2);
  for (const x of [2, 20]) solidRoom.add(x, -21, 0.42, 16.3, 4.2);
  assert.deepEqual(new WalkRoutes(solidRoom, 2, span).route(a, b), []);
});

test("livraison : le meilleur chrono survit à la reprise et ne recule pas", () => {
  const p = freshProgress();
  const finish = (duration) => {
    courierEvent(p, "start");
    courierTick(p, duration * 0.58);
    courierEvent(p, "relay");
    courierTick(p, duration * 0.42);
    courierEvent(p, "depot");
  };
  finish(105.78);
  assert.equal(p.courier.best, 105.78);
  finish(140);
  assert.equal(p.courier.best, 105.78);
  finish(94.71);
  assert.equal(p.courier.best, 94.71);
  const save = validateProgress(p);
  assert.equal(save.courier.best, 94.71);
  assert.equal(save.courier.runs, 3);
  const legacy = { ...p, courier: { runs: 2, stage: "relay", time: 13.5 } };
  assert.deepEqual(validateProgress(legacy).courier, {
    runs: 2,
    stage: "relay",
    time: 13.5,
    best: null,
  });
});

test("doublage : une prise par réplique, ouverture de bouche bornée, chargement à la demande", () => {
  const lines = SCENES.flatMap((scene) => scene.lines);
  assert.deepEqual(
    new Set(lines.map((l) => l.speaker)),
    new Set(Object.keys(CAST)),
  );
  assert.deepEqual(
    new Set(lines.map((l) => l.id)),
    new Set(Object.keys(VOICES)),
  );
  let size = 0;
  for (const line of lines) {
    const [length, env] = VOICES[line.id];
    assert.ok(Math.abs(env.length / 20 - length) < 0.051);
    assert.match(env, /^[0-9a-f]+$/);
    assert.equal(mouthAt(line.id, -1), 0);
    assert.equal(mouthAt(line.id, length + 0.1), 0);
    assert.ok(
      Array.from(env, (_, i) => mouthAt(line.id, i / 20)).some(
        (k) => k > 0.45 && k <= 1,
      ),
    );
    size += statSync(
      new URL(`../game/meridien/voice/${line.id}.mp3`, import.meta.url),
    ).size;
  }
  assert.ok(
    size < 400 * 1024,
    `Les huit pistes doivent rester légères : ${size} octets`,
  );
  const a = new SceneAudio({ sound: false, voices: true, volume: 1 }, () =>
    assert.fail("Un lecteur a été créé en mode muet."),
  );
  a.begin(lines[0]);
  assert.equal(a.state, "silent");
});

test("cinématiques : abandon d’une piste illisible, lecture de secours et arrêt complet", async () => {
  const line = SCENES[0].lines[0];
  let reject;
  const media = {
    currentTime: 0,
    paused: true,
    src: "",
    ended: false,
    error: null,
    hasAttribute: () => !!media.src,
    removeAttribute() {
      media.src = "";
    },
    play() {
      media.paused = false;
      return new Promise((_, no) => {
        reject = no;
      });
    },
    pause() {
      media.paused = true;
    },
    load() {
      media.currentTime = 0;
    },
  };
  const a = new SceneAudio(
    { sound: true, voices: true, volume: 0.7 },
    () => media,
  );
  a.begin(line);
  assert.equal(a.state, "loading");
  reject(new Error("unsupported audio"));
  await Promise.resolve();
  assert.equal(a.state, "unavailable");
  assert.ok(media.paused && !media.src);
  assert.equal(a.tick(100), false);
  assert.equal(a.tick(200), false);
  a.visibility(true);
  a.tick(5000);
  assert.equal(a.elapsed, 0.1);
  a.visibility(false);
  let done = false;
  for (let t = 5000; t <= 11500; t += 100) done = a.tick(t);
  assert.equal(done, true);
  a.begin(line);
  media.currentTime = 1.3;
  a.tick(12000);
  assert.equal(a.state, "playing");
  const stale = reject;
  a.begin(SCENES[0].lines[1]);
  stale(new Error("previous playback aborted"));
  await Promise.resolve();
  assert.equal(a.state, "loading");
  a.stop();
  assert.equal(a.tick(13000), false);
  assert.ok(media.paused && !media.src && a.mouth() === 0);
});

test("mise en scène : raccords d’axe et cadre adapté au portrait", () => {
  for (const s of Object.values(STAGES)) {
    const wide = shotFrame(s, "wide", 1.66, 0);
    const mobile = shotFrame(s, "wide", 0.46, 0);
    assert.ok(mobile.fov > wide.fov);
    assert.ok(
      Math.hypot(mobile.x - mobile.targetX, mobile.z - mobile.targetZ) >
        Math.hypot(wide.x - wide.targetX, wide.z - wide.targetZ),
    );
    for (const cut of ["wide", "reverse", "close", "profile", "choice"]) {
      const f = shotFrame(s, cut, 1.6, 1);
      const dx = s.npc.x - s.hero.x,
        dz = s.npc.z - s.hero.z;
      assert.ok(
        dx * (f.z - s.hero.z) - dz * (f.x - s.hero.x) > 0,
        "La caméra doit rester du même côté de l’axe",
      );
    }
  }
});

test("squelette : appui stable, pied levé et réplique sans mouvement de bouche chez l’auditrice", () => {
  const hipHeight = 0.845,
    ankle = (phase) => {
      const [a, b] = gait(phase, 0.27, 0, 0, hipHeight);
      return hipHeight - 0.428 * Math.cos(a) - 0.393 * Math.cos(a + b);
    };
  assert.ok(Math.abs(ankle(TAU * 0.3) - 0.109) < 0.001);
  assert.ok(ankle(TAU * 0.81) > 0.16);
  const reply = intention("question", 1, 0.88, true, false);
  const hearing = intention("question", 1, 0.88, false, false);
  assert.ok(
    reply.mouth === 0.88 &&
      reply.gesture > hearing.gesture &&
      hearing.mouth === 0,
  );
});

test("animation : phase déterministe à 60 Hz, deux appuis par cycle, pieds au sol à l’arrêt", () => {
  assert.equal(advanceGait(0.637, 0, 1), 0.637);
  for (const speed of [1.48, 1.56, 3.64, 6.55]) {
    const crouched = speed === 1.48,
      span = 1.37;
    let phase = 0;
    for (let i = 0; i < 60; i++)
      phase = advanceGait(phase, speed, span / 60, crouched);
    assert.ok(Math.abs(phase - advanceGait(0, speed, span, crouched)) < 1e-9);
    const impacts = Math.floor(phase / Math.PI);
    assert.ok(impacts >= 2 && impacts <= 8, `${speed} m/s : ${impacts} appuis`);
  }
  for (const phase of [0, Math.PI * 0.6, Math.PI, Math.PI * 1.65, TAU]) {
    const hip = 0.845;
    const [a, b] = gait(phase, 0, 0, 0, hip);
    assert.ok(
      Math.abs(hip - 0.428 * Math.cos(a) - 0.393 * Math.cos(a + b) - 0.109) <
        0.001,
    );
  }
});

test("Fréquences de veille : indices dans les deux ordres, calage et récompense unique sans modifier la fin", () => {
  for (const [ending, evidence, result] of [
    ["publish", ["badge", "watch"], "archive"],
    ["protect", ["watch", "badge"], "seal"],
  ]) {
    const p = freshProgress();
    assert.equal(echoPhase(p), "locked");
    assert.equal(echoEvent(p, "accept"), false);
    goToEnd(p);
    assert.ok(storyEvent(p, "finish", ending));
    const cash = p.cash;
    assert.equal(echoBrief(p).target, "ondes");
    assert.equal(echoEvent(p, "watch"), false);
    assert.ok(courierEvent(p, "start"));
    assert.ok(echoEvent(p, "accept"));
    assert.equal(p.tracking, "courier");
    assert.deepEqual(p.courier, {
      stage: "relay",
      time: 155,
      runs: 0,
      best: null,
    });
    assert.equal(echoEvent(p, "tune", { track: "C", stamp: "0217" }), false);
    assert.equal(echoEvent(p, "finish", result), false);
    for (const id of evidence) {
      assert.ok(echoEvent(p, id));
      assert.equal(echoEvent(p, id), false);
    }
    assert.equal(echoBrief(p).target, "receiver");
    assert.equal(echoEvent(p, "tune", { track: "A", stamp: "0217" }), false);
    assert.equal(echoEvent(p, "tune", { track: "C", stamp: "0209" }), false);
    assert.ok(echoEvent(p, "tune", { track: "C", stamp: "0217" }));
    assert.equal(echoEvent(p, "finish", [result]), false);
    assert.ok(beginCustody(p, 2));
    assert.equal(echoEvent(p, "finish", result), false);
    endCustody(p);
    const beforeReward = p.cash;
    assert.ok(echoEvent(p, "finish", result));
    assert.equal(echoEvent(p, "finish", result), false);
    assert.equal(p.cash, beforeReward + ECHO_OUTCOMES[result].reward);
    assert.equal(p.stage, "done");
    assert.equal(p.ending, ending);
    assert.equal(echoBrief(p).target, null);
    assert.equal(validateProgress(p).echo.outcome, result);
    assert.ok(cash < p.cash);
  }
  assert.notEqual(
    echoScene("publish").lines[0].text,
    echoScene("protect").lines[0].text,
  );
});

test("dossier facultatif en v1 : une ancienne sauvegarde reste intacte et le calage incomplet est rejeté", () => {
  const draft = {
    accepted: true,
    watch: true,
    badge: false,
    tuned: true,
    outcome: "archive",
  };
  const p = freshProgress();
  assert.deepEqual(
    validateProgress({ ...p, echo: draft, tracking: "echo" }).echo,
    freshEcho(),
  );
  goToEnd(p);
  storyEvent(p, "finish", "protect");
  delete p.echo;
  assert.deepEqual(validateProgress({ ...p, version: 1 }), {
    ...p,
    echo: freshEcho(),
  });
  const invalid = validateProgress({ ...p, echo: draft, tracking: "echo" });
  assert.deepEqual(invalid.echo, { ...draft, tuned: false, outcome: null });
  assert.equal(echoBrief(invalid).target, "badge");
  assert.equal(
    validateProgress({
      ...p,
      echo: { ...draft, badge: true, outcome: ["archive"] },
    }).echo.outcome,
    null,
  );
});

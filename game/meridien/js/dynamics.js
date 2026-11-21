import * as T from "../../../assets/vendor/three/three.module.js";
import {
  X,
  Z,
  WX,
  WZ,
  VEHICLES,
  LOCKED_YARD,
  OFFICERS,
  TRAFFIC_IDS,
  CIVILIAN_COUNT,
  SILLAGE_ZEBRA,
  junctionZebra,
  STATION,
  ONDES,
  LOCAL_ROLES,
  LOCAL_PARKING,
} from "./data.mjs";
import {
  rng,
  clamp,
  expEase,
  lerp,
  distance,
  angleDelta,
  angleTo,
  circuit,
  trafficRoute,
  sampleRoute,
  trafficStopGap,
  laneMotion,
  onCrosswalk,
  trafficOverhang,
  carBlocked,
  onRoad,
  navRoute,
  inside,
  closestIndex,
  signalState,
} from "./core.mjs";
import { raiseAlert, tickAlert } from "./progress.mjs";
import { poseVehicle, poseHuman } from "./models.js";

const walkPal = ["blue", "sand", "khaki", "red", "night"];
const trafficLooks = walkPal.map((style, hue) => ({ style, hue }));
const carColors = [
  "#574942",
  "#b0b3a7",
  "#7c3e2f",
  "#596d77",
  "#404748",
  "#3c5d58",
  "#98856c",
];
function carState(spec, model, rest = {}) {
  return {
    x: spec.x ?? 0,
    z: spec.z ?? 0,
    heading: spec.yaw ?? 0,
    speed: 0,
    damage: 0,
    steer: 0,
    driver: null,
    spec,
    model,
    ...rest,
  };
}
function pedestrianLoop(i, j) {
  const x1 = X[i] + WX[i] / 2 + 1.69,
    x2 = X[i + 1] - WX[i + 1] / 2 - 1.82,
    z1 = Z[j] + WZ[j] / 2 + 1.74,
    z2 = Z[j + 1] - WZ[j + 1] / 2 - 1.72;
  return [
    { x: x1, z: z1 },
    { x: x2, z: z1 },
    { x: x2, z: z2 },
    { x: x1, z: z2 },
  ];
}
function crossingLoop(i, j) {
  const a = junctionZebra(i, j, "z", 1),
    b = junctionZebra(i, j + 1, "z", -1);
  const l = X[i] - WX[i] / 2 - 1.82,
    r = X[i] + WX[i] / 2 + 1.82;
  return [
    { x: l, z: a.z, zebra: a },
    { x: r, z: a.z },
    { x: r, z: b.z, zebra: b },
    { x: l, z: b.z },
  ];
}
function sillageWalk() {
  const zebra = SILLAGE_ZEBRA,
    { x, z, span } = zebra,
    l = x - span / 2 - 1.32,
    r = x + span / 2 + 1.32;
  return [
    { x: l, z, zebra },
    { x: r, z },
    { x: r + 2.4, z: z + 2.7 },
    { x: r + 4.3, z: z - 2.2 },
    { x: r, z, zebra },
    { x: l, z },
    { x: l - 3.1, z: z - 3.1 },
    { x: l - 3.4, z: z + 3 },
  ];
}
function sampleWalker(nodes, f) {
  const n = Math.floor(f * nodes.length),
    t = f * nodes.length - n,
    a = nodes[n],
    b = nodes[(n + 1) % nodes.length];
  return {
    x: lerp(a.x, b.x, t),
    z: lerp(a.z, b.z, t),
    node: (n + 1) % nodes.length,
    heading: angleTo(a, b),
  };
}
export class CityLife {
  constructor(scene, world, forge, progress, notify) {
    this.scene = scene;
    this.world = world;
    this.forge = forge;
    this.notify = notify;
    this.rng = rng(23176);
    this.time = 0;
    this.alert = { ...progress.alert };
    this.exposure = 0;
    this.lastCollision = -20;
    this.lastSignal = -20;
    this.routes = [
      circuit(0, 0, 4, 4),
      circuit(0, 0, 4, 4, true),
      circuit(0, 1, 2, 4),
      circuit(0, 1, 2, 4, true),
      circuit(1, 0, 4, 2),
      circuit(1, 0, 4, 2, true),
      circuit(2, 2, 4, 4),
      circuit(2, 2, 4, 4, true),
      circuit(0, 0, 1, 2),
      circuit(2, 0, 3, 4, true),
    ].map((n) => trafficRoute(n));
    this.traffic = [];
    this.parked = [];
    this.minutes = progress.time;
    this.owned = new Map();
    this.seized = new Map();
    this.people = [];
    this.drivers = [];
    this.officers = [];
    this.units = [];
    TRAFFIC_IDS.forEach((id, i) =>
      this.spawnTraffic(i, progress.street.seized[id]),
    );
    for (const { id, accent, name, ...at } of LOCAL_PARKING) {
      const spec = { ...VEHICLES[id], accent, name };
      if (carBlocked(world.solids, at.x, at.z, at.heading, spec)) continue;
      const car = carState(spec, forge.vehicle(spec, { detail: false }), {
        ...at,
        parked: true,
        y: 0.078,
      });
      scene.add(car.model.root);
      world.solids.add(at.x, at.z, spec.width, spec.length, spec.height);
      poseVehicle(car, 0, 0);
      this.parked.push(car);
    }
    this.eventClock = 60 + this.rng() * 42;
    this.hazards = new T.Group();
    this.hazards.visible = false;
    this.scene.add(this.hazards);
    const blink = new T.MeshBasicMaterial({ color: 0xffb043 });
    for (const s of [-1, 1]) {
      const l = new T.Mesh(new T.BoxGeometry(0.153, 0.1, 0.04), blink);
      l.position.x = s;
      this.hazards.add(l);
    }
    for (let i = 0; i < 2; i++) {
      const model = forge.vehicle(VEHICLES.escort, {
        detail: true,
        patrol: true,
      });
      const route = this.routes[i ? 5 : 8];
      const state = carState(VEHICLES.escort, model, {
        route,
        s: route.length * (i ? 0.14 : 0.63),
        cruise: 8.3,
        pursue: false,
        unit: i,
        repath: 0,
        navigation: [],
        node: 0,
        speed: 6,
      });
      sampleRoute(route, state.s, state);
      scene.add(model.root);
      this.setDriver(state, { style: "guard", hue: i + 1 });
      poseVehicle(state, 0, 0);
      this.units.push(state);
    }
    this.ines = this.fixedPerson(
      "ines",
      -130.42,
      86.09,
      Math.PI - 0.28,
      0,
      "Inès Kader",
    );
    this.aya = this.fixedPerson(
      "aya",
      -174.83,
      9.97,
      Math.PI * 0.72,
      3,
      "Aya Le Guen",
    );
    this.vendor = this.fixedPerson(
      "sand",
      -139.56,
      84.25,
      Math.PI / 2,
      2,
      "Malo, au comptoir",
    );
    this.courier = this.fixedPerson(
      "blue",
      -115.12,
      97.14,
      Math.PI - 0.16,
      1,
      "Jo, coursière",
    );
    this.garage = this.fixedPerson(
      "khaki",
      35.8,
      117.35,
      -0.26,
      4,
      "Élias, garagiste",
    );
    this.market = this.fixedPerson(
      "red",
      92,
      36.87,
      Math.PI * 0.67,
      1,
      "Lina, aux halles",
    );
    this.talkers = [
      this.fixedPerson("night", -139.03, 96.3, 1.77, 3, "Une habitante"),
      this.fixedPerson("red", -137.7, 96.51, -1.42, 4, "Un habitant"),
    ];
    this.talkers.forEach((p, i) => {
      p.hue = i + 1;
      p.talker = i;
    });
    const { witness } = ONDES;
    this.salome = this.fixedPerson(
      "salome",
      witness.x,
      witness.z,
      witness.heading,
      4,
      "Salomé Renaud",
    );
    const desk = STATION.officer;
    this.deskOfficer = this.fixedPerson(
      "guard",
      desk.x,
      desk.z,
      desk.heading,
      1,
      "Agent d’accueil",
    );
    this.fixed = [
      this.deskOfficer,
      this.ines,
      this.aya,
      this.vendor,
      this.courier,
      this.garage,
      this.market,
      this.salome,
      ...this.talkers,
    ];
    for (let i = 0; i < CIVILIAN_COUNT - this.talkers.length; i++) {
      const index = (i + 5) % 16,
        isCross = i < 4,
        road = [0, 1, 2, 4][i % 4];
      const role = LOCAL_ROLES[i];
      const nodes = role
        ? role.path.map(([x, z, linger]) => ({ x, z, linger }))
        : isCross
          ? crossingLoop(road, (i + 1) % 4)
          : i === CIVILIAN_COUNT - this.talkers.length - 1
            ? sillageWalk()
            : pedestrianLoop(index % 4, Math.floor(index / 4));
      const model = forge.person(role?.style || walkPal[i % 5], {
        hue: i % 5,
        scale: 0.89 + this.rng() * 0.17,
      });
      const sample = sampleWalker(nodes, (this.rng() * 0.85 + 0.1) % 1);
      const p = {
        ...sample,
        role,
        model,
        nodes,
        speed: 1.28 + this.rng() * 0.66,
        stopped: 0,
        hue: i,
        civilian: i,
        greetTimer: 0,
      };
      this.placePerson(p, 0, 0);
      this.people.push(p);
      scene.add(model.root);
    }
    this.talkers.forEach((p, i) => (p.civilian = this.people.length + i));
    this.civilians = [...this.people, ...this.talkers];
    OFFICERS.forEach((o, i) => {
      const model = forge.person("guard", { hue: i + 1, scale: 1.04 }),
        nodes = o.route.map(([x, z]) => ({ x, z }));
      const p = {
        ...sampleWalker(nodes, o.phase),
        ...{ model, nodes, speed: 1.12, stopped: 0, officer: true },
        heading: i ? Math.PI : 0.5,
      };
      this.placePerson(p, 0, 0);
      this.officers.push(p);
      scene.add(model.root);
    });
    this.walkers = [...this.people, ...this.officers];
  }
  spawnTraffic(i, saved) {
    const template =
      i % 6 === 3
        ? VEHICLES.estuaire
        : i % 7 === 5
          ? VEHICLES.boreal
          : VEHICLES.mistral;
    const sedan = template === VEHICLES.mistral && i % 2;
    const spec = {
      ...template,
      name: sedan ? "Berline des quais" : template.name,
      type: sedan ? "sedan" : template.type,
      height: sedan ? 1.49 : template.height,
      accent: carColors[i % carColors.length],
    };
    const route = this.routes[i % this.routes.length],
      model = this.forge.vehicle(spec, { detail: false }),
      car = carState(spec, model, {
        route,
        s: route.length * ((0.114 + i * 0.1779) % 1),
        cruise: 7.8 + this.rng() * 5.1,
        speed: 7,
        trafficId: TRAFFIC_IDS[i],
      });
    sampleRoute(route, car.s, car);
    if (saved) {
      // A seized slot resumes parked (or under player control), never as a second AI car.
      if (!carBlocked(this.world.solids, saved.x, saved.z, saved.heading, spec))
        Object.assign(car, saved);
      car.speed = 0;
      car.id = car.trafficId;
      this.seized.set(car.id, car);
    } else {
      this.traffic.push(car);
      this.setDriver(car, trafficLooks[i % trafficLooks.length]);
    }
    this.scene.add(model.root);
    poseVehicle(car, 0, 0);
  }
  fixedPerson(style, x, z, heading, hue, name) {
    const model = this.forge.person(style, {
      hue,
      scale: 0.93 + (hue % 3) * 0.03,
    });
    const p = { x, z, heading, model, name };
    this.placePerson(p, 0, 0);
    this.scene.add(model.root);
    return p;
  }
  placePerson(p, dt, speed, options) {
    const root = p.model.root;
    root.position.set(p.x, onRoad(p.x, p.z) ? 0.011 : 0.083, p.z);
    root.rotation.y = -p.heading;
    poseHuman(p.model, dt, speed, options);
  }
  setDetail(p, detail) {
    const m = p.model;
    if (!m.proxy || m.proxy.visible === !detail) return;
    m.proxy.visible = !detail;
    m.skins.forEach((skin) => {
      skin.visible = detail;
    });
    m.contact.visible = detail;
  }
  own(id, p) {
    const spec = VEHICLES[id];
    let car = this.owned.get(id);
    if (!car) {
      const model = this.forge.vehicle(spec);
      car = carState(spec, model, {
        id,
        x: p.x,
        z: p.z,
        heading: p.heading,
        damage: p.damage,
      });
      this.owned.set(id, car);
      this.carCache = null;
      this.scene.add(model.root);
    }
    if (carBlocked(this.world.solids, car.x, car.z, car.heading, car.spec)) {
      car.x = spec.x;
      car.z = spec.z;
      car.heading = spec.yaw;
    }
    poseVehicle(car, 0, this.time);
    return car;
  }
  vehicle(id) {
    return this.owned.get(id) || this.seized.get(id);
  }
  setDriver(car, look) {
    car.driver = look;
    this.forge.occupy(car.model, look);
  }
  seize(car) {
    const i = this.traffic.indexOf(car);
    if (i < 0) return false;
    this.traffic.splice(i, 1);
    if (this.incident?.car === car) this.incident = null;
    car.id = car.trafficId;
    this.setDriver(car, null);
    car.braking = false;
    this.seized.set(car.id, car);
    this.carCache = null;
    return true;
  }
  prepareDrive(car) {
    if (car.model.doors.length) return;
    const lite = car.model.root;
    car.model = this.forge.vehicle(car.spec);
    this.scene.remove(lite);
    this.scene.add(car.model.root);
    this.forge.occupy(car.model, car.driver);
    poseVehicle(car, 0, this.time);
  }
  allCars() {
    return (this.carCache ??= [
      ...this.traffic,
      ...this.units,
      ...this.parked,
      ...this.owned.values(),
      ...this.seized.values(),
    ]);
  }
  alarmPerson(p, source) {
    p.alarmUntil = this.time + 4.8;
    p.fleeHeading =
      distance(p, source) > 0.04 ? angleTo(source, p) : p.heading + Math.PI;
  }
  releaseDriver(at, car, look) {
    let p = this.drivers.find(
      (q) => q.look === look && q.alarmUntil <= this.time,
    );
    if (!p) {
      p = this.fixedPerson(
        look.style,
        at.x,
        at.z,
        car.heading,
        look.hue,
        "Conducteur",
      );
      p.look = look;
      this.drivers.push(p);
    }
    p.model.root.visible = true;
    Object.assign(p, at, { poseSpeed: 0, crossing: onRoad(at.x, at.z) });
    this.alarmPerson(p, car);
    p.releasedAt = this.time;
    p.heading = p.fleeHeading;
    p.model.bend = 0.69;
    p.model.motionSpeed = p.model.phase = 0;
    this.placePerson(p, 0, 0, { crouch: true, gesture: 0.33, lean: 0.28 });
    return p;
  }
  flee(p, dt) {
    const x = p.x,
      z = p.z,
      heading = p.fleeHeading;
    p.heading += angleDelta(p.heading, heading) * expEase(7.8, dt);
    const age = p.releasedAt == null ? 1 : this.time - p.releasedAt;
    const stride = dt * 4.05 * (0.48 + 0.52 * clamp(age / 0.42, 0, 1));
    this.world.solids.move(
      p,
      Math.sin(heading) * stride,
      -Math.cos(heading) * stride,
      0.24,
      0.1,
      1.42,
    );
    p.poseSpeed = Math.hypot(p.x - x, p.z - z) / dt;
    p.poseHead = 0;
    p.crossing = onRoad(p.x, p.z);
  }
  stopSpeed(car, max, cars, player) {
    const sx = Math.sin(car.heading),
      sz = -Math.cos(car.heading);
    for (const c of cars) {
      if (c === car) continue;
      const dx = c.x - car.x,
        dz = c.z - car.z,
        front = dx * sx + dz * sz,
        gap = Math.abs(dx * sz - dz * sx);
      if (front < 0.6 || front > 13 || gap > 1.52) continue;
      const safe = car.spec.length * 0.5 + c.spec.length * 0.5 + 0.82;
      max = Math.min(
        max,
        Math.max(0, Math.max(0, c.speed) * 0.9 + (front - safe) * 1.34),
      );
      if (front < safe + 0.25) max = Math.min(max, 0.2);
    }
    if (!player.car) {
      const dx = player.x - car.x,
        dz = player.z - car.z,
        d = dx * sx + dz * sz;
      if (d > 0.5 && d < 8.1 && Math.abs(dx * sz - dz * sx) < 1.34)
        max = Math.min(max, Math.max(0, (d - 2.45) * 1.4));
    }
    for (const p of this.people) {
      if (!p.crossing) continue;
      const dx = p.x - car.x,
        dz = p.z - car.z,
        d = dx * sx + dz * sz;
      if (d > 0.4 && d < 9.2 && Math.abs(dx * sz - dz * sx) < 1.36)
        max = Math.min(max, Math.max(0, (d - 2.6) * 1.41));
    }
    return max;
  }
  crossingOccupied(zebra, player) {
    return (
      (!player.car && onCrosswalk(player, zebra)) ||
      this.people.some(
        (p) =>
          onCrosswalk(p, zebra) ||
          (p.crosswalkRequest?.x === zebra.x &&
            p.crosswalkRequest.z === zebra.z),
      )
    );
  }
  crossingBlocked(zebra) {
    return this.allCars().some((c) => {
      const dx = Math.abs(c.x - zebra.x),
        dz = Math.abs(c.z - zebra.z),
        byZ = zebra.axis === "z",
        along = byZ ? dz : dx,
        across = byZ ? dx : dz;
      if (along > 8 || across > zebra.span / 2 + 3) return false;
      const angle = c.heading - (byZ ? 0 : Math.PI / 2),
        long = Math.abs(Math.cos(angle)),
        wide = Math.abs(Math.sin(angle)),
        overhang = trafficOverhang(c.spec.length),
        halfWidth = c.spec.width * 0.5;
      return (
        along <
          zebra.depth / 2 +
            overhang * long +
            halfWidth * wide +
            0.18 +
            Math.abs(c.speed) * 0.25 &&
        across < zebra.span / 2 + halfWidth * long + overhang * wide
      );
    });
  }
  travelCar(car, dt, cars, player) {
    const t = sampleRoute(car.route, car.s + 4, this.look || (this.look = {}));
    const upcoming = t.heading,
      turning = Math.abs(angleDelta(car.heading, upcoming));
    const gap = trafficStopGap(
      car.route,
      car.s,
      car.speed,
      this.time,
      car.spec.length,
      (zebra) => this.crossingOccupied(zebra, player),
    );
    const cruise = car.cruise * (1 - Math.min(0.47, turning * 0.55));
    const v =
      this.incident?.car === car
        ? 0
        : this.stopSpeed(car, cruise, cars, player);
    const prior = car.speed,
      advance = laneMotion(prior, v, gap, dt);
    car.speed = advance.speed;
    car.braking = advance.braking;
    car.accelG = lerp(
      car.accelG || 0,
      clamp((car.speed - prior) / (dt * 9.81), -1.15, 1.15),
      expEase(6, dt),
    );
    car.s += advance.advance;
    const f = sampleRoute(car.route, car.s, this.look);
    car.x = f.x;
    car.z = f.z;
    const turn =
      angleDelta(car.heading, f.heading) +
      0.34 * angleDelta(f.heading, upcoming);
    car.steer = lerp(car.steer, clamp(turn * 3.2, -1, 1), expEase(8, dt));
    car.heading += angleDelta(car.heading, f.heading) * expEase(9, dt);
  }
  updateWalker(p, dt, player, distant) {
    if (p.alarmUntil > this.time) {
      p.crosswalkRequest = null;
      this.flee(p, dt);
      return;
    }
    const node = p.nodes[p.node];
    p.lingering = false;
    p.crosswalkRequest =
      p.nodes[(p.node + p.nodes.length - 1) % p.nodes.length].zebra;
    let vx = node.x - p.x,
      vz = node.z - p.z,
      len = Math.hypot(vx, vz),
      v = p.speed;
    if (len < 0.42) {
      if (node.linger && p.pauseNode !== p.node) {
        p.pauseNode = p.node;
        const hour = this.minutes / 60,
          [first, last] = p.role.hours;
        const shift =
          first < last
            ? hour >= first && hour < last
            : hour >= first || hour < last;
        p.pauseUntil = this.time + (shift ? node.linger : 0.65);
      }
      const zebra = node.zebra,
        permitted =
          !zebra ||
          zebra.i == null ||
          signalState(this.time, zebra.i, zebra.j, zebra.axis) === "red";
      p.crosswalkRequest = permitted ? zebra : null;
      p.lingering = Boolean(
        node.linger &&
        this.time < p.pauseUntil &&
        distance(p, player) > (player.car ? 2.7 : 0.72),
      );
      if (p.lingering || !permitted || (zebra && this.crossingBlocked(zebra)))
        v = 0;
      else {
        p.pauseNode = null;
        p.node = (p.node + 1) % p.nodes.length;
        const q = p.nodes[p.node];
        vx = q.x - p.x;
        vz = q.z - p.z;
        len = Math.hypot(vx, vz);
      }
    }
    const d = distant ? 100 : distance(p, player);
    let head = 0;
    if (p.officer && this.alert.level && d < 22) {
      head = clamp(
        angleDelta(p.heading, angleTo(p, player)) * 0.6,
        -0.68,
        0.68,
      );
      v *= 0.5;
    } else if (!p.officer && d < 4.6) {
      head = clamp(
        angleDelta(p.heading, angleTo(p, player)) * 0.6,
        -0.72,
        0.72,
      );
      if (player.car && Math.abs(player.car.speed) > 2) {
        v *= 1.54;
        vx += (p.x - player.x) * 1.9;
        vz += (p.z - player.z) * 1.9;
        len = Math.hypot(vx, vz);
      }
    }
    const xx = p.x,
      zz = p.z;
    if (p.lingering) {
      const look = p.role.style === "dock" ? ONDES.door : { x: 42.7, z: 29.9 };
      p.heading += angleDelta(p.heading, angleTo(p, look)) * expEase(2.4, dt);
    }
    if (len > 0.05 && v) {
      const yaw = Math.atan2(vx, -vz);
      p.heading += angleDelta(p.heading, yaw) * expEase(4.2, dt);
      this.world.solids.move(
        p,
        (vx / len) * v * dt,
        (vz / len) * v * dt,
        0.24,
        0.1,
        1.42,
      );
      const actual = Math.hypot(p.x - xx, p.z - zz) / dt;
      if (actual < 0.14) {
        p.stopped += dt;
        if (p.stopped > 1.55) {
          p.node = (p.node + 1) % p.nodes.length;
          p.stopped = 0;
        }
      } else p.stopped = 0;
      v = actual;
    }
    p.crossing = onRoad(p.x, p.z) && !p.officer;
    p.poseSpeed = v;
    p.poseHead = head;
  }
  see(p, target, range, cone = 1, eye = 1.4) {
    const len = distance(p, target);
    if (len > range) return false;
    if (
      cone < 1 &&
      len > 1.24 &&
      Math.cos(angleDelta(p.heading, angleTo(p, target))) < cone
    )
      return false;
    return (
      this.world.solids.trace(
        p.x,
        eye,
        p.z,
        target.x,
        (target.y || 0.11) + (target.crouch ? 0.83 : 1.16),
        target.z,
      ) > 0.98
    );
  }
  crime(p, reason, severity = 1) {
    raiseAlert(this.alert, p, severity);
    this.notify(reason, "warning");
  }
  collision(p, other, velocity) {
    if (
      !other ||
      other.id ||
      velocity < 8 ||
      this.time - this.lastCollision < 7
    )
      return;
    this.lastCollision = this.time;
    this.crime(p, "Accrochage signalé · sûreté portuaire");
  }
  enforce(dt, player) {
    if (player.inCustody) return null;
    const a = this.alert,
      inYard = inside(player, LOCKED_YARD);
    const watched =
      inYard &&
      this.officers.some((p) =>
        this.see(
          p,
          player,
          player.crouch ? 3.9 : 10.8,
          player.crouch ? 0.5 : 0.16,
        ),
      );
    this.exposure = clamp(
      this.exposure + dt * (watched ? (player.crouch ? 0.47 : 0.94) : -0.67),
      0,
      1,
    );
    if (!a.level && this.exposure >= 1) {
      this.crime(player, "Intrusion détectée · quittez le hangar");
      this.exposure = 0.55;
    }
    if (
      player.car &&
      Math.abs(player.car.speed) > 14.2 &&
      this.time - this.lastSignal > 15
    ) {
      const x = closestIndex(X, player.x),
        z = closestIndex(Z, player.z),
        axis = Math.abs(Math.sin(player.car.heading)) > 0.7 ? "x" : "z";
      if (
        Math.abs(player.x - X[x]) < 3 &&
        Math.abs(player.z - Z[z]) < 3 &&
        signalState(this.time, x, z, axis) === "red" &&
        this.units.some((u) => this.see(u, player, 30, 1, 1.24))
      ) {
        this.lastSignal = this.time;
        this.crime(player, "Feu rouge grillé · patrouille alertée");
      }
    }
    if (!a.level) return;
    const nearby = this.units.filter((u) => u.unit === 0 || a.level >= 2);
    const officerPresent =
      !inYard && this.officers.some((p) => this.see(p, player, 5.4));
    const visible =
      watched ||
      officerPresent ||
      nearby.some((u) => this.see(u, player, player.crouch ? 16 : 37, 1, 1.23));
    const stopped =
      !inYard &&
      Math.abs(player.car?.speed ?? player.walkSpeed) < 0.9 &&
      (officerPresent || nearby.some((u) => this.see(u, player, 6.7, 1, 1.22)));
    const before = a.level;
    const result = tickAlert(a, dt, visible, stopped, player);
    if (a.level > before)
      this.notify("Renforts en route · alerte " + a.level + "/3", "warning");
    return result;
  }
  chase(unit, dt, cars, player) {
    const lost = this.alert.unseen > 2.8,
      last = this.alert.last || player;
    if (unit.repath <= 0) {
      unit.repath = lost ? 1.6 : 0.85;
      const ix = closestIndex(X, last.x),
        iz = closestIndex(Z, last.z);
      const byX = Math.abs(last.x - X[ix]) < Math.abs(last.z - Z[iz]);
      const target = onRoad(last.x, last.z)
        ? last
        : byX
          ? { x: X[ix], z: last.z }
          : { x: last.x, z: Z[iz] };
      const nav = navRoute(unit, target);
      unit.navigation = nav.slice(1);
      unit.node = 0;
      if (
        unit.navigation.length > 1 &&
        distance(unit, unit.navigation[0]) < 4.6
      )
        unit.node++;
    }
    unit.repath -= dt;
    let p = unit.navigation[unit.node];
    while (
      p &&
      distance(unit, p) < 4.4 &&
      unit.node < unit.navigation.length - 1
    )
      p = unit.navigation[++unit.node];
    if (!p) {
      unit.speed *= 1 - dt * 2.2;
      return;
    }
    const delta = angleDelta(unit.heading, angleTo(unit, p)),
      d = distance(unit, p),
      isLast = unit.node === unit.navigation.length - 1;
    unit.heading += clamp(delta, -dt * 2.5, dt * 2.5);
    let v =
      (10.6 + this.alert.level * 1.92) *
      (1 - clamp(Math.abs(delta) * 0.69, 0, 0.9));
    if (isLast) v = Math.min(v, Math.max(0, (d - 3.6) * 2));
    v = this.stopSpeed(unit, v, cars, player);
    unit.braking = unit.speed - v > 0.65;
    unit.speed += clamp(v - unit.speed, -dt * 14, dt * 8.6);
    const dx = Math.sin(unit.heading) * unit.speed * dt,
      dz = -Math.cos(unit.heading) * unit.speed * dt;
    unit.steer = clamp(delta * 1.2, -1, 1);
    if (
      !carBlocked(
        this.world.solids,
        unit.x + dx,
        unit.z + dz,
        unit.heading,
        unit.spec,
      )
    ) {
      unit.x += dx;
      unit.z += dz;
    } else {
      unit.speed = 0;
      unit.repath = 0;
    }
  }
  rejoin(unit, dt, cars, p) {
    if (unit.rejoinS === null) {
      let nearest = Infinity;
      unit.rejoinS = unit.s;
      for (let s = 0; s < unit.route.length; s += 4.3) {
        const q = sampleRoute(unit.route, s, this.look),
          d = distance(unit, q);
        if (d < nearest) {
          nearest = d;
          unit.rejoinS = s;
        }
      }
    }
    const dest = sampleRoute(unit.route, unit.rejoinS, this.look);
    const d = distance(unit, dest);
    if (d < 2) {
      unit.s = unit.rejoinS;
      unit.rejoinS = null;
      unit.pursue = false;
      return;
    }
    const delta = angleDelta(unit.heading, angleTo(unit, dest));
    unit.heading += clamp(delta, -dt * 2.85, dt * 2.85);
    const v = this.stopSpeed(
      unit,
      Math.min(7.5, d * 1.8) * (1 - clamp(Math.abs(delta) * 0.55, 0, 0.78)),
      cars,
      p,
    );
    unit.braking = unit.speed - v > 0.65;
    unit.speed += clamp(v - unit.speed, -dt * 14, dt * 6.3);
    unit.steer = clamp(delta * 1.2, -1, 1);
    const dx = Math.sin(unit.heading) * unit.speed * dt,
      dz = -Math.cos(unit.heading) * unit.speed * dt;
    if (
      !carBlocked(
        this.world.solids,
        unit.x + dx,
        unit.z + dz,
        unit.heading,
        unit.spec,
      )
    ) {
      unit.x += dx;
      unit.z += dz;
    }
  }
  updateIncident(player) {
    if (this.incident && this.time > this.incident.end) {
      this.incident = null;
    }
    if (!this.incident && this.time > this.eventClock) {
      const choices = this.traffic.filter((c) => {
        const d = distance(c, player);
        return d > 19 && d < 77 && c.speed > 4.1;
      });
      if (choices.length) {
        this.incident = {
          car: choices[Math.floor(this.rng() * choices.length)],
          end: this.time + 15 + this.rng() * 12,
          seen: false,
        };
        this.eventClock = this.time + 61 + this.rng() * 58;
      } else this.eventClock = this.time + 7 + this.rng() * 6;
    }
    if (!this.incident) return;
    const e = this.incident,
      c = e.car,
      d = distance(c, player);
    if (!e.seen && d < 34) {
      e.seen = true;
      this.notify(
        "Un véhicule est à l’arrêt · circulation ralentie dans le secteur",
      );
    }
  }
  presentIncident(player) {
    if (!this.incident) {
      this.hazards.visible = false;
      return;
    }
    const c = this.incident.car,
      d = distance(c, player);
    this.hazards.visible = d < 112 && Math.floor(this.time * 3.15) % 2 === 0;
    this.hazards.position.set(c.x, c.spec.height * 0.57, c.z);
    this.hazards.rotation.y = -c.heading;
    for (const [i, l] of this.hazards.children.entries())
      l.position.set(
        (i ? 1 : -1) * c.spec.width * 0.38,
        0,
        c.spec.length * 0.511,
      );
  }
  tick(dt, player, minutes = this.minutes) {
    this.minutes = minutes;
    this.time += dt;
    const cars = this.allCars();
    for (const car of this.traffic) this.travelCar(car, dt, cars, player);
    for (const u of this.units) {
      if (this.alert.level > u.unit) {
        if (!u.pursue) u.repath = 0;
        u.pursue = true;
        u.rejoinS = null;
        this.chase(u, dt, cars, player);
      } else if (u.pursue) this.rejoin(u, dt, cars, player);
      else this.travelCar(u, dt, cars, player);
    }
    this.updateIncident(player);
    const quarter =
      Math.floor(this.time * 8) !== Math.floor((this.time - dt) * 8);
    for (const p of this.walkers) {
      const distant =
        Math.abs(p.x - player.x) > 69 || Math.abs(p.z - player.z) > 69;
      p.simLag = (p.simLag || 0) + dt;
      if (distant && !quarter) continue;
      this.updateWalker(p, p.simLag, player, distant);
      p.simLag = 0;
    }
    for (const p of this.drivers)
      if (p.alarmUntil > this.time) this.flee(p, dt);
    for (const c of cars)
      if (c.doorT > 0) c.doorT = c.doorT + dt < 0.9 ? c.doorT + dt : 0;
    return this.enforce(dt, player);
  }
  present(dt, player, quality, reduced = false) {
    this.world.tickSignals(this.time);
    const eco = quality === "low",
      limit = eco ? 82 : 152;
    for (const c of this.allCars()) {
      const nearby = distance(c, player),
        m = c.model;
      m.root.visible =
        c === player.car || nearby < limit + (c.unit !== undefined ? 12 : 0);
      if (m.contact) m.contact.visible = nearby < 42;
      if (m.root.visible)
        poseVehicle(
          c,
          dt,
          this.time,
          c.unit < this.alert.level ? this.alert.level : 0,
          reduced,
        );
    }
    this.presentIncident(player);
    for (const p of this.drivers) {
      p.model.root.visible =
        p.alarmUntil > this.time && distance(p, player) < limit;
      if (p.model.root.visible) {
        const age = this.time - p.releasedAt;
        this.placePerson(p, dt, p.poseSpeed, {
          crouch: age < 0.13,
          lean: 0.28 * clamp(1 - age / 0.42, 0, 1),
          gesture: 0.33 * clamp(1 - age / 0.46, 0, 1),
        });
      }
    }
    for (const p of this.walkers) {
      const d = distance(p, player);
      p.model.root.visible = d < limit * 0.81;
      if (!p.model.root.visible) continue;
      this.setDetail(p, d < (eco ? 18 : 32));
      this.placePerson(p, dt, p.poseSpeed || 0, {
        headTurn: p.poseHead,
        cue: p.lingering && p.role.style === "messenger" ? "paper" : "look",
        tilt: p.lingering && p.role.style === "messenger" ? 0.21 : 0,
        gesture: p.lingering
          ? 0.59 + 0.11 * Math.sin(this.time * 1.9)
          : !p.officer && (p.poseSpeed || 0) < 0.1
            ? Math.max(0, Math.sin(this.time * 1.2 + p.hue)) * 0.33
            : 0,
      });
    }
    for (const person of this.fixed) {
      const d = distance(person, player);
      person.model.root.visible = d < limit * 0.74;
      if (!person.model.root.visible) continue;
      this.setDetail(person, d < (eco ? 20 : 36));
      this.placePerson(person, dt, 0, {
        headTurn:
          d < 5
            ? clamp(
                angleDelta(person.heading, angleTo(person, player)),
                -0.75,
                0.75,
              )
            : 0,
        gesture:
          person.alarmUntil > this.time
            ? Math.min(1.35, (person.alarmUntil - this.time) * 0.33)
            : person.talker !== undefined
              ? Math.max(
                  0,
                  Math.sin(this.time * 1.35 + person.talker * Math.PI),
                ) * 0.56
              : Math.max(0, Math.sin(this.time * 0.57 + person.x)) * 0.22,
      });
    }
  }
}

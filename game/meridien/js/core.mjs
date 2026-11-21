import {
  bandAt,
  roadDistance,
  regionBlocked,
  regionalRoute,
  gate,
} from "./region.mjs";
import {
  X,
  Z,
  WX,
  WZ,
  JUNCTION_ZEBRA,
  SILLAGE_ZEBRA,
  junctionZebra,
} from "./data.mjs";
import { inRect, PORT_BOUNDS, PORT_ID, WORLD } from "./sectors.mjs";
import { RIVE, GREVES_BRIDGE } from "./rive-layout.mjs";
export const TAU = Math.PI * 2;
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const lerp = (a, b, f) => a + (b - a) * f;
export const expEase = (rate, dt) => 1 - Math.exp(-rate * dt);
export const wrap = (v, n) => ((v % n) + n) % n;
export const angleDelta = (from, to) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const angleTo = (a, b) => Math.atan2(b.x - a.x, a.z - b.z);
export const inside = (p, area) =>
  p.x > area.x1 && p.x < area.x2 && p.z > area.z1 && p.z < area.z2;
export function rng(seed) {
  let n = seed >>> 0;
  return () => {
    n = (n + 0x6d2b79f5) | 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function closestIndex(values, v) {
  return values.reduce(
    (best, n, i) => (Math.abs(n - v) < Math.abs(values[best] - v) ? i : best),
    0,
  );
}
export const nearestJunction = (p) => [
  closestIndex(X, p.x),
  closestIndex(Z, p.z),
];
export const junction = (i, j) => ({ x: X[i], z: Z[j] });
import { EAST, eastRoad, eastRoute, dry } from "./faubourgs.mjs";
export function onRoad(x, z) {
  if (inRect(PORT_BOUNDS, x, z))
    return (
      X.some((n, i) => Math.abs(n - x) < WX[i] * 0.5) ||
      Z.some((n, i) => Math.abs(n - z) < WZ[i] * 0.5)
    );
  return (
    (bandAt(x, z) && roadDistance(x, z) < 5.5) ||
    eastRoad(x, z) ||
    RIVE_ROADS.some((r) => inRect(r, x, z))
  );
}
const RIVE_ROADS = [RIVE.road, RIVE.apron, RIVE.turn, GREVES_BRIDGE.road];
export function nearestRiveRoad(p) {
  let best = null,
    d = Infinity;
  for (const r of RIVE_ROADS) {
    const a = {
      x: clamp(p.x, r.minX + 2.6, r.maxX - 2.6),
      z: clamp(p.z, r.minZ + 1.6, r.maxZ - 1.6),
    };
    const n = distance(p, a);
    if (n < d) {
      best = a;
      d = n;
    }
  }
  return best;
}

// A single spatial index serves movement, visibility and the follow camera.
export class Solids {
  constructor(cellSize = 24, domain = WORLD) {
    this.domain = domain;
    this.size = cellSize;
    this.cells = new Map();
  }
  _key(i, j) {
    return i * 2048 + j;
  }
  add(cx, cz, w, d, h, bottom = 0) {
    const b = {
      x1: cx - w / 2,
      x2: cx + w / 2,
      z1: cz - d / 2,
      z2: cz + d / 2,
      h,
      bottom,
    };
    const s = this.size;
    for (let i = Math.floor(b.x1 / s); i <= Math.floor(b.x2 / s); i++)
      for (let j = Math.floor(b.z1 / s); j <= Math.floor(b.z2 / s); j++) {
        const key = this._key(i, j);
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(b);
      }
    return b;
  }
  blocked(x, z, radius = 0.35, y = 0, height = 1.5) {
    if (x > 182 && x < 1150 && !dry(x, z, radius)) return true;
    if (bandAt(x, z) && regionBlocked(x, z, radius)) return true;
    if (!this.domain.allows(x, z, radius)) return true;
    const s = this.size,
      r = radius;
    for (let i = Math.floor((x - r) / s); i <= Math.floor((x + r) / s); i++)
      for (let j = Math.floor((z - r) / s); j <= Math.floor((z + r) / s); j++) {
        const cell = this.cells.get(this._key(i, j));
        if (!cell) continue;
        for (const b of cell) {
          if (b.enabled === false || y + height <= b.bottom || y >= b.h)
            continue;
          const dx = x - clamp(x, b.x1, b.x2),
            dz = z - clamp(z, b.z1, b.z2);
          if (dx * dx + dz * dz < r * r) return true;
        }
      }
    return false;
  }
  move(p, dx, dz, radius, y, height) {
    if (!this.blocked(p.x + dx, p.z, radius, y, height)) p.x += dx;
    if (!this.blocked(p.x, p.z + dz, radius, y, height)) p.z += dz;
  }
  // Returns the first fraction along the segment that hits a solid, or 1.
  trace(ax, ay, az, bx, by, bz, pad = 0) {
    const s = this.size;
    let first = 1;
    const dx = bx - ax,
      dy = by - ay,
      dz = bz - az;
    for (
      let i = Math.floor((Math.min(ax, bx) - pad) / s);
      i <= Math.floor((Math.max(ax, bx) + pad) / s);
      i++
    )
      for (
        let j = Math.floor((Math.min(az, bz) - pad) / s);
        j <= Math.floor((Math.max(az, bz) + pad) / s);
        j++
      ) {
        const cell = this.cells.get(this._key(i, j));
        if (!cell) continue;
        for (const b of cell) {
          if (b.enabled === false) continue;
          const enter = segmentAabb(ax, ay, az, dx, dy, dz, b, pad);
          if (enter !== null && enter < first) first = enter;
        }
      }
    return first;
  }
}
function segmentAabb(ax, ay, az, dx, dy, dz, b, pad) {
  let enter = 0,
    exit = 1;
  for (let j = 0; j < 3; j++) {
    const a = j === 0 ? ax : j === 1 ? ay : az,
      d = j === 0 ? dx : j === 1 ? dy : dz;
    const lo = (j === 0 ? b.x1 : j === 1 ? b.bottom : b.z1) - pad,
      hi = (j === 0 ? b.x2 : j === 1 ? b.h : b.z2) + pad;
    if (Math.abs(d) < 1e-7) {
      if (a < lo || a > hi) return null;
      continue;
    }
    const t0 = (lo - a) / d,
      t1 = (hi - a) / d;
    enter = Math.max(enter, Math.min(t0, t1));
    exit = Math.min(exit, Math.max(t0, t1));
    if (exit < enter) return null;
  }
  return enter;
}
export function carBlocked(solids, x, z, yaw, spec) {
  const f = spec.length * 0.308,
    r = spec.width * 0.48;
  return (
    solids.blocked(x, z, r, 0.1, spec.height) ||
    solids.blocked(
      x + Math.sin(yaw) * f,
      z - Math.cos(yaw) * f,
      r,
      0.1,
      spec.height,
    ) ||
    solids.blocked(
      x - Math.sin(yaw) * f,
      z + Math.cos(yaw) * f,
      r,
      0.1,
      spec.height,
    )
  );
}
export function driveStep(car, input, dt, wet = 0) {
  const spec = car.spec,
    previous = car.speed,
    damage = car.damage || 0;
  const forward = !!input.forward,
    back = !!input.back,
    hand = !!input.handbrake;
  const throttle = Number(forward) - Number(back);
  const steer = Number(!!input.right) - Number(!!input.left);
  const v = Math.abs(previous);
  const friction = (1 - 0.3 * wet) * (1 - damage * 0.15);
  const braking =
    (forward && back) || (throttle !== 0 && throttle * previous < -0.18);
  const cap = spec.max * (1 - damage * 0.42);
  let force;
  if (braking) force = -Math.sign(previous) * spec.brake * friction;
  else if (throttle) {
    // Strong launch in first gear, with falling torque close to the maximum speed.
    force =
      throttle *
      spec.accel *
      (1 - damage * 0.33) *
      (1 - 0.68 * clamp(v / cap, 0, 1) ** 1.24);
    if (throttle < 0) force *= 0.63;
  } else force = -Math.sign(previous) * (0.52 + v * 0.069 + v * v * 0.0011);
  if (hand)
    force =
      -Math.sign(previous) * spec.brake * friction * (braking ? 1.23 : 0.93);
  car.speed = clamp(previous + force * dt, -Math.min(6.2, cap), cap);
  // A 60 Hz reverse impulse on the van is smaller than the resting dead zone.
  // Snap only when coasting or braking, never while the driver applies torque.
  if (
    (!throttle || braking || hand) &&
    (previous * car.speed <= 0 || Math.abs(car.speed) < 0.055)
  )
    car.speed = 0;

  car.accelG = lerp(
    car.accelG || 0,
    (car.speed - previous) / (9.81 * dt),
    expEase(11, dt),
  );
  car.braking = braking || hand;
  car.gear =
    car.speed < -0.12
      ? "R"
      : car.speed < 0.12 && (!throttle || hand)
        ? "N"
        : car.speed > cap * 0.76
          ? "4"
          : car.speed > cap * 0.53
            ? "3"
            : car.speed > cap * 0.29
              ? "2"
              : "1";
  const cmd = steer || 0;
  car.steer = lerp(
    car.steer || 0,
    cmd,
    expEase(cmd ? (spec.type === "van" ? 6.8 : 10.7) : 13.5, dt),
  );
  // Bicycle yaw with progressive steering lock. A friction envelope gradually limits high-speed turns.
  const forwardSpeed = car.speed,
    speed = Math.abs(forwardSpeed),
    wetGrip = (spec.grip / 5.5) * friction;
  const maxSteer = (0.39 + spec.steer * 0.16) / (1 + (speed / 11.8) ** 1.62);
  const yawRate =
    (car.steer * Math.tan(maxSteer) * forwardSpeed) / (spec.length * 0.6);
  const lateralLimit = (9.65 * wetGrip) / Math.max(speed, 1.25);
  const loose = hand && speed > 3.3;
  const desired =
    clamp(yawRate, -lateralLimit, lateralLimit) * (loose ? 1.39 : 1);
  car.yawRate = lerp(car.yawRate || 0, desired, expEase(loose ? 12 : 14, dt));
  car.steerAngle = car.steer * maxSteer;
  const prior = car.heading;
  car.heading = wrap(prior + car.yawRate * dt * (speed < 0.22 ? 0 : 1), TAU);
  const travel = speed < 1.0 ? car.heading : (car.travelYaw ?? prior);
  const adhesion =
    spec.grip * (1 - 0.47 * wet) * (loose ? 0.32 : 1) +
    (speed < 5 ? (5 - speed) * 2.6 : 0);
  car.travelYaw = wrap(
    travel + angleDelta(travel, car.heading) * expEase(adhesion, dt),
    TAU,
  );
  car.slip = angleDelta(car.heading, car.travelYaw);
  return {
    x: Math.sin(car.travelYaw) * forwardSpeed * dt,
    z: -Math.cos(car.travelYaw) * forwardSpeed * dt,
  };
}

// Signal state is shared by the traffic simulation and rendered intersections.
export function signalState(time, i, j, axis) {
  const phase = wrap(time + ((i * 5 + j * 8) % 24), 24);
  if (axis === "z")
    return phase < 9.4 ? "green" : phase < 11.2 ? "amber" : "red";
  return phase >= 12 && phase < 21.5
    ? "green"
    : phase >= 21.5 && phase < 23.2
      ? "amber"
      : "red";
}
export function circuit(i0, j0, i1, j1, reverse = false) {
  const n = [];
  for (let i = i0; i < i1; i++) n.push([i, j0]);
  for (let j = j0; j < j1; j++) n.push([i1, j]);
  for (let i = i1; i > i0; i--) n.push([i, j1]);
  for (let j = j1; j > j0; j--) n.push([i0, j]);
  return reverse ? n.reverse() : n;
}
// Right-hand lanes joined by cubic curves; stop-line distances share this arc length.
export function trafficRoute(nodes, lane = 2.34) {
  const points = [],
    stops = [];
  let length = 0;
  const add = (x, z) => {
    if (points.length)
      length += Math.hypot(points.at(-1).x - x, points.at(-1).z - z);
    points.push({ x, z, s: length });
  };
  const approach = (x, z) => {
    const last = points.at(-1),
      zebra = SILLAGE_ZEBRA;
    if (last && x === last.x && Math.abs(Math.abs(x - zebra.x) - lane) < 1e-5) {
      const direction = Math.sign(z - last.z);
      const line = zebra.z - direction * (zebra.depth / 2 + 0.28);
      if ((line - last.z) * direction > 0 && (z - line) * direction > 0) {
        add(x, line);
        stops.push({ s: length, zebra });
      }
    }
    add(x, z);
  };
  for (let k = 0; k < nodes.length; k++) {
    const [i, j] = nodes[k],
      [ip, jp] = nodes[(k + nodes.length - 1) % nodes.length],
      [inext, jnext] = nodes[(k + 1) % nodes.length];
    const x = X[i],
      z = Z[j],
      ax = Math.sign(i - ip),
      az = Math.sign(j - jp),
      bx = Math.sign(inext - i),
      bz = Math.sign(jnext - j);
    const ra = (ax ? WX[i] : WZ[j]) * 0.5 + JUNCTION_ZEBRA.line,
      rb = (bx ? WX[i] : WZ[j]) * 0.5 + JUNCTION_ZEBRA.line;
    const x0 = x - ax * ra - az * lane,
      z0 = z - az * ra + ax * lane,
      x3 = x + bx * rb - bz * lane,
      z3 = z + bz * rb + bx * lane;
    approach(x0, z0);
    stops.push({
      s: length,
      zebra: junctionZebra(i, j, ax ? "x" : "z", -ax - az),
    });
    const x1 = x0 + ax * ra * 0.91,
      z1 = z0 + az * ra * 0.91,
      x2 = x3 - bx * rb * 0.91,
      z2 = z3 - bz * rb * 0.91;
    for (let s = 1; s <= 10; s++) {
      const t = s / 10,
        u = 1 - t;
      add(
        u * u * u * x0 +
          3 * u * u * t * x1 +
          3 * u * t * t * x2 +
          t * t * t * x3,
        u * u * u * z0 +
          3 * u * u * t * z1 +
          3 * u * t * t * z2 +
          t * t * t * z3,
      );
    }
  }
  approach(points[0].x, points[0].z);
  return { points, stops, length };
}
export function sampleRoute(route, s, out = {}) {
  const t = wrap(s, route.length),
    p = route.points;
  let l = 0,
    r = p.length - 1;
  while (r - l > 1) {
    const m = (l + r) >> 1;
    if (p[m].s <= t) l = m;
    else r = m;
  }
  const a = p[l],
    b = p[r],
    u = (t - a.s) / Math.max(0.001, b.s - a.s);
  out.x = lerp(a.x, b.x, u);
  out.z = lerp(a.z, b.z, u);
  out.heading = angleTo(a, b);
  return out;
}
export const trafficOverhang = (length) => length * 0.54; // includes the bumper/plate beyond the shell
export const stopClearance = (length) => trafficOverhang(length) + 0.25;
export function onCrosswalk(point, zebra, pad = 0.2) {
  const dx = Math.abs(point.x - zebra.x),
    dz = Math.abs(point.z - zebra.z);
  return zebra.axis === "z"
    ? dx <= zebra.span * 0.5 + pad && dz <= zebra.depth * 0.5 + pad
    : dz <= zebra.span * 0.5 + pad && dx <= zebra.depth * 0.5 + pad;
}
const TRAFFIC_BRAKE = 7.9;
const STOP_EPS = 1e-6;
// Distances refer to the front bumper, not to the car origin. Once committed,
// clear the crossing rather than braking halfway onto the stripes.
export function trafficStopGap(route, s, speed, time, length, occupied) {
  const lead = stopClearance(length);
  let limit = Infinity;
  for (const stop of route.stops) {
    const d = wrap(stop.s - s, route.length),
      gap = d - lead;
    if (gap < -STOP_EPS || gap > 24 || gap >= limit) continue;
    const { zebra } = stop;
    const signal =
      zebra.i == null ? null : signalState(time, zebra.i, zebra.j, zebra.axis);
    if (
      signal === "red" ||
      (signal === "amber" &&
        speed * speed <= 2 * TRAFFIC_BRAKE * Math.max(0, gap) + STOP_EPS) ||
      occupied(zebra)
    )
      limit = gap <= STOP_EPS ? 0 : gap;
  }
  return limit;
}
export function laneMotion(speed, cruise, gap, dt, brake = 5.6) {
  const target = Math.min(cruise, Math.sqrt(2 * brake * gap));
  const next = speed + clamp(target - speed, -dt * TRAFFIC_BRAKE, dt * 3.15);
  // A signal change or a pedestrian stepping out may leave too little room for
  // the usual acceleration envelope. Clamp the actual movement, including at wrap.
  const advance = Math.min(gap, next * dt);
  return {
    advance,
    speed: advance >= gap - STOP_EPS ? 0 : next,
    braking: speed > target + 0.65 || next * dt >= gap - STOP_EPS,
  };
}
function roadRoute(a, b) {
  const vx = closestIndex(X, a.x),
    vz = closestIndex(Z, a.z);
  const wx = closestIndex(X, b.x),
    wz = closestIndex(Z, b.z);
  const candidates = (p, ix, iz) => [
    { x: X[ix], z: p.z, ix, iz, axis: "z" },
    { x: p.x, z: Z[iz], ix, iz, axis: "x" },
  ];
  const aa = candidates(a, vx, vz),
    bb = candidates(b, wx, wz);
  let best = [],
    len = Infinity;
  for (const p of aa)
    for (const q of bb) {
      let route;
      if (
        (p.axis === "z" && q.axis === "z" && p.ix === q.ix) ||
        (p.axis === "x" && q.axis === "x" && p.iz === q.iz)
      )
        route = [a, p, q, b];
      else if (p.axis !== q.axis)
        route = [
          a,
          p,
          {
            x: p.axis === "z" ? X[p.ix] : X[q.ix],
            z: p.axis === "x" ? Z[p.iz] : Z[q.iz],
          },
          q,
          b,
        ];
      else if (p.axis === "z") {
        const k = closestIndex(Z, (a.z + b.z) / 2);
        route = [a, p, { x: p.x, z: Z[k] }, { x: q.x, z: Z[k] }, q, b];
      } else {
        const k = closestIndex(X, (a.x + b.x) / 2);
        route = [a, p, { x: X[k], z: p.z }, { x: X[k], z: q.z }, q, b];
      }
      const d = route
        .slice(1)
        .reduce((sum, v, i) => sum + distance(v, route[i]), 0);
      if (d < len) {
        len = d;
        best = route;
      }
    }
  return best.filter((p, i) => !i || distance(p, best[i - 1]) > 0.85);
}
// Keep the original orthogonal router inside Port-Lumière. The new road is a
// short two-way spine; the bridge has a marked lane in each direction.
export function navRoute(a, b) {
  const from = WORLD.at(a.x, a.z),
    to = WORLD.at(b.x, b.z);
  if (!from || !to) return [];
  if (from.regional && to.regional) return regionalRoute(a, b);
  if (from.regional) return [...regionalRoute(a, gate), ...navRoute(gate, b)];
  if (to.regional) return navRoute(b, a).reverse();
  if (from === EAST || to === EAST) {
    if (from === EAST && to === EAST) return eastRoute(a, b);
    if (to === EAST) return navRoute(b, a).reverse();
    const entry = { x: 179, z: -10 };
    const tail = navRoute(entry, b);
    if (tail.length) tail[tail.length - 1] = b;
    return [...eastRoute(a, entry), ...tail];
  }
  if (from.id === PORT_ID && to.id === PORT_ID) return roadRoute(a, b);
  const [port, bank] = GREVES_BRIDGE.drive;
  // Don't point back to the anchor once the car has committed to the ramp.
  const onPortRamp =
    from.id === PORT_ID &&
    a.x <= port.x &&
    Math.abs(a.z - GREVES_BRIDGE.z) < 4.4;
  const start =
    from.id === PORT_ID ? (onPortRamp ? a : port) : nearestRiveRoad(a);
  const end =
    to.id === PORT_ID ? port : onRoad(b.x, b.z) ? b : nearestRiveRoad(b);
  const west = end.x < start.x;
  const z = GREVES_BRIDGE.z + (west ? -1 : 1) * GREVES_BRIDGE.lane;
  const path = from.id === PORT_ID && !onPortRamp ? roadRoute(a, port) : [a];
  if (Math.abs(start.x - end.x) >= 8) {
    // Merge gently with the spine, not at a right angle at the freight bay.
    const lead = Math.min(7, Math.abs(end.x - start.x) / 3) * (west ? -1 : 1);
    path.push({ x: start.x + lead, z });
    if (from.id === PORT_ID || to.id === PORT_ID || from !== to) {
      const anchors = west ? [port.x - 10, bank.x] : [bank.x, port.x - 10];
      for (const x of anchors)
        if (
          west
            ? x < start.x + lead && x > end.x - lead
            : x > start.x + lead && x < end.x - lead
        )
          path.push({ x, z });
    }
    path.push({ x: end.x - lead, z });
  }
  if (to.id === PORT_ID) path.push(...roadRoute(port, b));
  else path.push(end);
  return path.filter((p, i) => !i || distance(p, path[i - 1]) > 0.85);
}
export const pathLength = (p) =>
  p.slice(1).reduce((sum, v, i) => sum + distance(v, p[i]), 0);

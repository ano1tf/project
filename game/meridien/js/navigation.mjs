import { BOUNDS, X, Z } from "./data.mjs";
import {
  clamp,
  closestIndex,
  distance,
  navRoute,
  onRoad,
  pathLength,
} from "./core.mjs";

const D = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
class Frontier {
  constructor() {
    this.entries = [];
  }
  add(id, f) {
    const a = this.entries,
      item = { id, f };
    let i = a.length;
    a.push(item);
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (a[j].f <= f) break;
      a[i] = a[j];
      i = j;
    }
    a[i] = item;
  }
  pop() {
    const a = this.entries,
      first = a[0],
      last = a.pop();
    if (!a.length) return first.id;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1,
        r = l + 1;
      if (l >= a.length) break;
      const j = r < a.length && a[r].f < a[l].f ? r : l;
      if (a[j].f >= last.f) break;
      a[i] = a[j];
      i = j;
    }
    a[i] = last;
    return first.id;
  }
}

// Low-resolution collision grid filled only as a route needs it. Query stamps avoid a
// full clear/rebuild for each waypoint, including while zooming around the map.
export class WalkRoutes {
  constructor(solids, cell = 2, extent = BOUNDS) {
    this.solids = solids;
    this.cell = cell;
    this.extent = extent;
    this.w = Math.ceil((extent.maxX - extent.minX) / cell);
    this.h = Math.ceil((extent.maxZ - extent.minZ) / cell);
    const n = this.w * this.h;
    this.occupancy = new Uint8Array(n);
    this.open = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.cost = new Float32Array(n);
    this.back = new Int32Array(n);
    this.gen = 0;
  }
  point(i) {
    return {
      x: this.extent.minX + ((i % this.w) + 0.5) * this.cell,
      z: this.extent.minZ + (((i / this.w) | 0) + 0.5) * this.cell,
    };
  }
  at(i) {
    let state = this.occupancy[i];
    if (!state) {
      const p = this.point(i);
      state = this.occupancy[i] = this.solids.blocked(p.x, p.z, 0.52, 0.08, 1.5)
        ? 2
        : onRoad(p.x, p.z)
          ? 3
          : 1;
    }
    return state;
  }
  visible(a, b, pad = 0.42) {
    return this.solids.trace(a.x, 0.56, a.z, b.x, 0.56, b.z, pad) > 0.99;
  }
  nearest(p, external = false) {
    const nx = clamp(
        Math.floor((p.x - this.extent.minX) / this.cell),
        0,
        this.w - 1,
      ),
      nz = clamp(
        Math.floor((p.z - this.extent.minZ) / this.cell),
        0,
        this.h - 1,
      );
    let closest = -1,
      best = Infinity;
    // Test the actual segment: opposite sides of a wall may share a nearest grid node.
    for (let r = 0; r <= 6; r++) {
      if (closest >= 0 && r > (external ? 3 : 2)) break;
      for (let j = Math.max(0, nz - r); j <= Math.min(this.h - 1, nz + r); j++)
        for (
          let i = Math.max(0, nx - r);
          i <= Math.min(this.w - 1, nx + r);
          i++
        ) {
          if (Math.max(Math.abs(i - nx), Math.abs(j - nz)) !== r) continue;
          const k = j * this.w + i;
          if (this.at(k) === 2) continue;
          const spot = this.point(k),
            d = distance(spot, p);
          if (d < best && (external || this.visible(p, spot, 0.31))) {
            closest = k;
            best = d;
          }
        }
    }
    return closest;
  }
  route(a, b) {
    if (
      distance(a, b) < 66 &&
      !this.solids.blocked(b.x, b.z, 0.44, 0.08, 1.4) &&
      this.visible(a, b)
    )
      return [a, b];
    const start = this.nearest(a),
      endFree = this.nearest(b),
      end = endFree < 0 ? this.nearest(b, true) : endFree;
    if (start < 0 || end < 0) return [];
    const { w, h } = this,
      goalX = end % w,
      goalZ = (end / w) | 0;
    const remain = (i, j) => {
      const x = Math.abs(i - goalX),
        z = Math.abs(j - goalZ);
      return Math.max(x, z) + 0.4142 * Math.min(x, z);
    };
    const gen = ++this.gen,
      heap = new Frontier();
    heap.add(start, 0);
    this.open[start] = gen;
    this.cost[start] = 0;
    this.back[start] = -1;
    while (heap.entries.length) {
      const id = heap.pop();
      if (this.closed[id] === gen) continue;
      if (id === end) break;
      this.closed[id] = gen;
      const x = id % w,
        z = (id / w) | 0;
      for (const [dx, dz] of D) {
        const i = x + dx,
          j = z + dz;
        if (i < 0 || j < 0 || i >= w || j >= h) continue;
        const k = j * w + i,
          diagonal = dx !== 0 && dz !== 0;
        if (this.closed[k] === gen) continue;
        const occ = this.at(k);
        if (
          occ === 2 ||
          (diagonal && (this.at(id + dx) === 2 || this.at(id + dz * w) === 2))
        )
          continue;
        if (!this.visible(this.point(id), this.point(k), 0.44)) continue;
        const cost =
          this.cost[id] + (diagonal ? 1.4142 : 1) * (occ === 3 ? 1.16 : 1);
        if (this.open[k] === gen && cost >= this.cost[k]) continue;
        this.open[k] = gen;
        this.cost[k] = cost;
        this.back[k] = id;
        heap.add(k, cost + remain(i, j) * 1.04);
      }
    }
    if (this.open[end] !== gen) return [];
    const path = [];
    for (let i = end; i !== -1; i = this.back[i]) path.push(this.point(i));
    path.push(a);
    path.reverse();
    if (
      endFree >= 0 &&
      !this.solids.blocked(b.x, b.z, 0.44, 0.08, 1.4) &&
      this.visible(path.at(-1), b)
    )
      path.push(b);
    const simplified = [a];
    for (let i = 0; i < path.length - 1; ) {
      let k = i + 1;
      // Stop at an actual obstruction: no diagonal guides through pillars or a closed wall.
      while (
        k < path.length - 1 &&
        distance(path[i], path[k + 1]) < 55 &&
        this.visible(path[i], path[k + 1])
      )
        k++;
      simplified.push(path[k]);
      i = k;
    }
    return simplified;
  }
  drive(a, b, exact = false) {
    if (exact) return navRoute(a, b);
    const vx = closestIndex(X, b.x),
      vz = closestIndex(Z, b.z);
    const anchors = [
      { x: X[vx], z: b.z },
      { x: b.x, z: Z[vz] },
    ];
    // Park on the road that actually has access toward the point instead of cutting across courtyards.
    const [point] = anchors.sort((c, d) => {
      const score = (p) =>
        distance(p, b) +
        (this.visible(p, b, 0.45) ? 0 : 19) +
        pathLength(navRoute(a, p)) * 0.015;
      return score(c) - score(d);
    });
    return navRoute(a, point);
  }
}
export function pathTurn(path, facing, origin = path[0]) {
  if (path.length < 2) return null;
  const a = origin,
    b = path[1],
    bearing = Math.atan2(b.x - a.x, a.z - b.z),
    dist = distance(a, b);
  const delta = Math.atan2(
    Math.sin(bearing - facing),
    Math.cos(bearing - facing),
  );
  return {
    bearing,
    delta,
    distance: dist,
    remaining: pathLength(path) - distance(path[0], b) + dist,
  };
}

// Metric regional atlas. All three views share the same coastline, road polylines
// and seeded scenery. Tiles generate independently of the order of exploration.
export const TILE = 512,
  WEST = 1150,
  NORTH = -6000,
  NX = 32,
  NZ = 24;
export const zones = [
  ["Dunes de l’Écume", "Route de la Corniche", "#c9b989", 2150, 4300],
  ["Forêt des Aiguilles", "Route des Pins", "#526e54", 4900, 2700],
  ["Salines du Levant", "Chaussée des Paludiers", "#99aa88", 2900, -2200],
  ["Val des Pommiers", "Chemin des Vergers", "#97a66b", 9300, 2600],
  ["Monts de Schiste", "Route du Col", "#85847b", 14700, -3300],
  ["Lac des Sources", "Route du Barrage", "#738e77", 9700, -3600],
  ["Plaine de Saint-Orme", "Route des Fermes", "#a3a16f", 14500, 3500],
  ["Les Prés du Port", "Allée des Saules", "#889975", 2400, 100],
];
export const regionBands = Array.from({ length: NZ }, (_, j) => {
  const inset =
    j === 11 || j === 12 ? 0 : Math.round(1.7 + 1.5 * Math.sin(j * 0.59));
  return {
    id: "pays-" + j,
    regional: true,
    name: "Pays de Méridien",
    bounds: {
      minX: WEST + inset * TILE,
      maxX: WEST + NX * TILE,
      minZ: NORTH + j * TILE - (j ? 5 : 0),
      maxZ: NORTH + (j + 1) * TILE,
    },
  };
});
export function bandAt(x, z) {
  const j = Math.min(NZ - 1, Math.floor((z - NORTH) / TILE)),
    b = regionBands[j]?.bounds;
  return !!b && x >= b.minX && x <= b.maxX && z <= b.maxZ;
}
export function biome(x, z) {
  let best = Infinity,
    id = 0;
  const xx = x + 430 * Math.sin(z / 1010),
    zz = z + 380 * Math.cos(x / 1080);
  zones.forEach((v, i) => {
    const d = (xx - v[3]) ** 2 + (zz - v[4]) ** 2;
    if (d < best) {
      best = d;
      id = i;
    }
  });
  return id;
}
export const gate = { x: 1151, z: -10 };
// Junctions shared by both branches of the coastal–inland circuit.
const anchors = [
  [1151, -10],
  [2390, -10],
  [3800, -1900],
  [6800, -4050],
  [9900, -3700],
  [13900, -4150],
  [16400, -2200],
  [14900, 500],
  [15200, 3750],
  [12200, 4950],
  [9100, 2900],
  [5700, 4200],
  [3350, 5030],
  [3400, 2450],
  [4950, 500],
  [8900, -260],
  [11650, 900],
];
const links = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [12, 13],
  [13, 14],
  [14, 1],
  [14, 15],
  [15, 4],
  [15, 16],
  [16, 7],
  [16, 10],
];
export const roads = [],
  nodes = [],
  graph = [];
function node(x, z) {
  nodes.push({ x, z });
  graph.push([]);
  return nodes.length - 1;
}
anchors.forEach(([x, z]) => node(x, z));
for (const [a, b] of links) {
  let prev = a;
  const [x, z] = anchors[a],
    [xx, zz] = anchors[b],
    dx = xx - x,
    dz = zz - z,
    len = Math.hypot(dx, dz),
    n = Math.ceil(len / 130);
  for (let i = 1; i <= n; i++) {
    const t = i / n,
      bend =
        a === 0
          ? 0
          : Math.sin(Math.PI * t) ** 2 *
            Math.sin(((a % 3) + 1) * Math.PI * t) *
            Math.min(310, len * 0.13);
    const next =
      i === n
        ? b
        : node(x + t * dx - (bend * dz) / len, z + t * dz + (bend * dx) / len);
    const p = nodes[prev],
      q = nodes[next],
      d = Math.hypot(q.x - p.x, q.z - p.z);
    graph[prev].push([next, d]);
    graph[next].push([prev, d]);
    roads.push({ p, q, d });
    prev = next;
  }
}
const key = (i, j) => i + ":" + j,
  nearby = new Map();
for (const r of roads) {
  for (
    let i = Math.floor((Math.min(r.p.x, r.q.x) - 80 - WEST) / TILE);
    i <= Math.floor((Math.max(r.p.x, r.q.x) + 80 - WEST) / TILE);
    i++
  )
    for (
      let j = Math.floor((Math.min(r.p.z, r.q.z) - 80 - NORTH) / TILE);
      j <= Math.floor((Math.max(r.p.z, r.q.z) + 80 - NORTH) / TILE);
      j++
    ) {
      const k = key(i, j);
      if (!nearby.has(k)) nearby.set(k, []);
      nearby.get(k).push(r);
    }
}
export const tileAt = (x, z) => [
  Math.floor((x - WEST) / TILE),
  Math.floor((z - NORTH) / TILE),
];
export const tileRoads = (i, j) => nearby.get(key(i, j)) || [];
export function roadDistance(x, z) {
  let best = Infinity;
  for (const { p, q, d } of tileRoads(...tileAt(x, z))) {
    const dx = q.x - p.x,
      dz = q.z - p.z,
      t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (d * d)));
    best = Math.min(best, Math.hypot(x - p.x - t * dx, z - p.z - t * dz));
  }
  return best;
}
export function regionalRoute(a, b) {
  const nearest = (p) =>
    nodes.reduce(
      (k, n, i) =>
        Math.hypot(p.x - n.x, p.z - n.z) <
        Math.hypot(p.x - nodes[k].x, p.z - nodes[k].z)
          ? i
          : k,
      0,
    );
  const start = nearest(a),
    end = nearest(b),
    dist = nodes.map(() => Infinity),
    prev = [],
    queue = new Set([start]);
  dist[start] = 0;
  while (queue.size) {
    let u;
    for (const n of queue) if (u == null || dist[n] < dist[u]) u = n;
    queue.delete(u);
    if (u === end) break;
    for (const [v, d] of graph[u])
      if (dist[u] + d < dist[v]) {
        dist[v] = dist[u] + d;
        prev[v] = u;
        queue.add(v);
      }
  }
  const path = [b];
  for (let n = end; n != null; n = prev[n]) path.push(nodes[n]);
  return [a, ...path.reverse()];
}
export function altitude(x, z) {
  if (!bandAt(x, z)) return 0;
  const ramp =
    Math.min(1, Math.max(0, (x - 3500) / 6500)) *
    Math.min(1, Math.max(0, (-z + 800) / 3300));
  return (
    ramp *
    (100 +
      58 * Math.sin(x / 780) +
      38 * Math.cos(z / 520) +
      26 * Math.sin(x / 410 + z / 380))
  );
}
// A gently curving foreshore inside the coarse streaming envelope. At the city
// gateway the shore tapers away, leaving the existing port connection on dry land.
export function shoreline(z) {
  const f = Math.max(0, Math.min(NZ - 1, (z - NORTH) / TILE)),
    j = Math.floor(f),
    t = f - j;
  const edge = (n) => regionBands[Math.max(0, Math.min(NZ - 1, n))].bounds.minX;
  const a = Math.max(edge(j - 1), edge(j)),
    b = Math.max(edge(j), edge(j + 1));
  return (
    WEST +
    Math.min(1, Math.max(0, Math.abs(z + 10) - 150) / 440) *
      (a -
        WEST +
        (b - a) * t +
        90 +
        55 * Math.sin(z / 250) +
        24 * Math.sin(z / 78))
  );
}
export function waters(x, z) {
  return (
    x < shoreline(z) ||
    ((x - 9600) / 1100) ** 2 + ((z + 4900) / 420) ** 2 < 1 ||
    (biome(x, z) === 2 &&
      Math.sin(x / 195) * Math.cos(z / 125) > 0.79 &&
      roadDistance(x, z) > 24)
  );
}
export function tileProps(i, j) {
  let s = (Math.imul(i + 91, 73856093) ^ Math.imul(j + 71, 19349663)) >>> 0;
  const rand = () =>
    (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const out = [];
  for (let n = 0; n < 135; n++) {
    const x = WEST + (i + rand()) * TILE,
      z = NORTH + (j + rand()) * TILE;
    if (!bandAt(x, z)) continue;
    const b = biome(x, z),
      d = roadDistance(x, z);
    const kind =
      d > 19 && d < 50 && n % 3 === 0
        ? "house"
        : b === 4
          ? "rock"
          : b === 0 || b === 2
            ? "scrub"
            : b === 1
              ? "pine"
              : "tree";
    if (kind !== "house" && b !== 1 && n % 4 !== 0) continue;
    const w =
        kind === "house"
          ? 9 + rand() * 6
          : kind === "rock"
            ? 7 + rand() * 13
            : 3 + rand() * 4,
      h =
        kind === "house"
          ? 5 + rand() * 4
          : kind === "pine"
            ? 12 + rand() * 12
            : kind === "tree"
              ? 7 + rand() * 6
              : kind === "rock"
                ? 4 + rand() * 9
                : 1 + rand() * 2;
    if (
      d < 9 + w ||
      waters(x, z) ||
      Math.min(
        (x - WEST) % TILE,
        TILE - ((x - WEST) % TILE),
        (z - NORTH) % TILE,
        TILE - ((z - NORTH) % TILE),
      ) < w ||
      out.some((p) => Math.hypot(p.x - x, p.z - z) < p.w + w)
    )
      continue;
    out.push({ x, z, w, h, kind });
  }
  return out;
}
const propCache = new Map();
export function scenery(i, j) {
  const k = key(i, j);
  if (!propCache.has(k)) {
    if (propCache.size >= 64) propCache.delete(propCache.keys().next().value);
    propCache.set(k, tileProps(i, j));
  }
  return propCache.get(k);
}
export function regionBlocked(x, z, r) {
  if (waters(x, z)) return true;
  return scenery(...tileAt(x, z)).some(
    (p) =>
      Math.abs(p.x - x) <
        r +
          p.w * (p.kind === "house" ? 0.5 : p.kind === "rock" ? 0.45 : 0.13) &&
      Math.abs(p.z - z) <
        r + p.w * (p.kind === "house" ? 0.43 : p.kind === "rock" ? 0.45 : 0.13),
  );
}

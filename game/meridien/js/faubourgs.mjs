// Measured in metres. Roads, shore, parcels, collision and maps use this survey.
export const EAST = {
  id: "faubourgs",
  name: "Les Faubourgs",
  bounds: { minX: 176, maxX: 1153, minZ: -350, maxZ: 308 },
};
export const avenues = [-142, -78, -10, 58, 126];
export const wards = [
  ["Les Forges", "Quais de la Corderie", "factory", "#907f65"],
  ["Cité des Braises", "Cours des Marronniers", "brick", "#947965"],
  ["Les Terrasses", "Corniche des Villas", "limestone", "#789260"],
  ["Parvis des Verrières", "Place des Arcades", "glass", "#768989"],
];
export const wardAt = (x) => (x < 394 ? 0 : x < 641 ? 1 : x < 900 ? 2 : 3);
// Tidal inlets leave finger wharves at the docks; beyond the inlet the land opens into a headland.
export const soundings = [
  [176, -154, 138],
  [211, -158, 147],
  [224, -191, 147],
  [244, -191, 166],
  [246, -148, 152],
  [277, -145, 147],
  [282, -218, 145],
  [312, -218, 166],
  [315, -139, 159],
  [344, -134, 141],
  [350, -197, 128],
  [374, -199, 107],
  [393, -126, 117],
  [433, -116, 142],
  [480, -135, 183],
  [530, -171, 205],
  [581, -193, 203],
  [624, -196, 177],
  [677, -234, 150],
  [718, -289, 134],
  [760, -321, 160],
  [815, -333, 192],
  [875, -293, 220],
  [918, -239, 259],
  [968, -188, 286],
  [1020, -167, 296],
  [1070, -121, 249],
  [1110, -87, 181],
  [1153, -53, 107],
];
export function shores(x) {
  let i = 1;
  while (i < soundings.length - 1 && soundings[i][0] < x) i++;
  const a = soundings[i - 1],
    b = soundings[i],
    t = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0])));
  return [a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
}
export function dry(x, z, pad = 0) {
  const [a, b] = shores(x);
  return z >= a + pad && z <= b - pad;
}
const nodes = [],
  edges = [],
  adj = [],
  ids = new Map();
function node(x, z) {
  const k = x + ":" + z;
  if (!ids.has(k)) {
    ids.set(k, nodes.length);
    nodes.push({ x, z });
    adj.push([]);
  }
  return ids.get(k);
}
function street(width, points) {
  let u = node(...points[0]);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)],
      b = points[i],
      c = points[i + 1],
      d = points[Math.min(points.length - 1, i + 2)],
      n = Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 16);
    for (let j = 1; j <= n; j++) {
      const t = j / n,
        xy = b.map((v, k) =>
          j === n
            ? c[k]
            : 0.5 *
              (2 * v +
                (-a[k] + c[k]) * t +
                (2 * a[k] - 5 * v + 4 * c[k] - d[k]) * t * t +
                (-a[k] + 3 * v - 3 * c[k] + d[k]) * t * t * t),
        );
      const v = node(...xy),
        p = nodes[u],
        q = nodes[v],
        len = Math.hypot(q.x - p.x, q.z - p.z);
      edges.push({ p, q, width, len });
      adj[u].push([v, len]);
      adj[v].push([u, len]);
      u = v;
    }
  }
}
const A = [323, -24],
  B = [468, 12],
  C = [634, -51],
  D = [807, -61],
  E = [973, 26],
  F = [551, 127],
  G = [772, -202],
  H = [1012, 178];
street(15, [
  [176, -10],
  [236, -12],
  A,
  [391, -12],
  B,
  [528, 4],
  C,
  [706, -79],
  D,
  [888, -28],
  E,
  [1050, 44],
  [1124, 3],
  [1151, -10],
]);
street(10, [
  [176, -142],
  [221, -125],
  [293, -112],
  [349, -94],
  A,
  [296, 43],
  [253, 73],
  [190, 58],
  [176, 58],
]);
street(9, [
  [176, -78],
  [221, -78],
  [293, -112],
  [296, -194],
]);
street(8, [
  [176, 126],
  [227, 126],
  [253, 73],
]);
street(10, [B, [443, 66], [473, 111], F, [608, 96], [647, 42], C]);
street(8, [F, [577, 167], [606, 169]]);
street(10, [
  C,
  [628, -116],
  [661, -162],
  [712, -185],
  G,
  [829, -216],
  [861, -170],
  [856, -116],
  D,
]);
street(7, [G, [746, -240], [766, -275], [804, -287]]);
street(9, [D, [784, 5], [798, 64], [846, 101], [905, 107], E]);
street(12, [E, [943, 79], [945, 136], H, [1063, 146], [1082, 97], [1050, 44]]);
street(8, [H, [1002, 223], [967, 240]]);
export { edges as streets };
function project(e, x, z) {
  const { p, q, len } = e,
    dx = q.x - p.x,
    dz = q.z - p.z,
    t = Math.max(
      0,
      Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (len * len)),
    );
  return { x: p.x + t * dx, z: p.z + t * dz };
}
export function clearance(x, z) {
  let best = Infinity;
  for (const e of edges) {
    if (Math.abs(x - e.p.x) > best + 30 || Math.abs(z - e.p.z) > best + 30)
      continue;
    const p = project(e, x, z);
    best = Math.min(best, Math.hypot(x - p.x, z - p.z) - e.width / 2);
  }
  return best;
}
export const eastRoad = (x, z) =>
  x >= 176 && x <= 1153 && z >= -350 && z <= 308 && clearance(x, z) <= 0;
export function eastRoute(a, b) {
  const near = (p) => {
    let best = Infinity,
      key = 0;
    nodes.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < best) {
        best = d;
        key = i;
      }
    });
    return key;
  };
  const start = near(a),
    end = near(b),
    dist = nodes.map(() => Infinity),
    prev = [],
    todo = new Set([start]);
  dist[start] = 0;
  while (todo.size) {
    let u;
    for (const n of todo) if (u == null || dist[n] < dist[u]) u = n;
    todo.delete(u);
    if (u === end) break;
    for (const [v, d] of adj[u])
      if (dist[u] + d < dist[v]) {
        dist[v] = dist[u] + d;
        prev[v] = u;
        todo.add(v);
      }
  }
  const path = [b];
  for (let n = end; n != null; n = prev[n]) path.push(nodes[n]);
  return [a, ...path.reverse()];
}
export const lots = [],
  trees = [];
let seed = 49171;
const random = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
function reserve(x, z, w, d) {
  return (
    x - w / 2 > 186 &&
    x + w / 2 < 1148 &&
    [-w / 2, 0, w / 2].every((dx) => dry(x + dx, z, d / 2 + 3)) &&
    clearance(x, z) > Math.hypot(w, d) / 2 + 2 &&
    !lots.some(
      (p) =>
        Math.abs(x - p.x) < (w + p.w) / 2 + 5 &&
        Math.abs(z - p.z) < (d + p.d) / 2 + 5,
    )
  );
}
function lot(x, z, w, d, h) {
  if (!reserve(x, z, w + 4, d + 4)) return;
  lots.push({ x, z, w, d, h, ward: wardAt(x) });
}
// Slab groups enclose shared courts; villas have small footprints and deeper gardens.
for (const [x, z] of [
  [474, 58],
  [509, 69],
  [552, 57],
  [586, 38],
  [539, -61],
  [571, -75],
  [487, -55],
  [488, 155],
  [515, 166],
  [582, -128],
  [612, -138],
])
  lot(x, z, 14, 34, 19 + random() * 9);
for (let i = 0; i < 5500; i++) {
  const x = 189 + random() * 950,
    z = -323 + random() * 614,
    k = wardAt(x),
    gap = clearance(x, z);
  if (gap > (k === 0 ? 57 : k === 2 ? 42 : 50) || gap < 15) continue;
  const w = [
      26 + random() * 22,
      16 + random() * 9,
      10 + random() * 8,
      17 + random() * 17,
    ][k],
    d = [
      14 + random() * 12,
      12 + random() * 7,
      11 + random() * 7,
      16 + random() * 15,
    ][k];
  lot(x, z, w, d, [8, 10, 6, 22][k] + random() * [5, 8, 4, 22][k]);
}
for (let i = 0; i < 650; i++) {
  const x = 195 + random() * 940,
    z = -322 + random() * 608;
  if (x < 390 && random() > 0.12) continue;
  if (
    reserve(x, z, 7, 7) &&
    !trees.some((p) => Math.hypot(p.x - x, p.z - z) < 9)
  )
    trees.push({ x, z });
}
export function paintEast(c) {
  c.save();
  c.beginPath();
  soundings.forEach(([x, z], i) => c[i ? "lineTo" : "moveTo"](x, z));
  for (const [x, , z] of [...soundings].reverse()) c.lineTo(x, z);
  c.closePath();
  c.clip();
  c.fillStyle = "#657858";
  c.fillRect(176, -350, 977, 658);
  for (const p of lots) {
    c.fillStyle = wards[p.ward][3];
    c.fillRect(p.x - p.w / 2 - 2, p.z - p.d / 2 - 2, p.w + 4, p.d + 4);
  }
  for (const p of trees) {
    c.fillStyle = "#456349";
    c.beginPath();
    c.arc(p.x, p.z, 3.4, 0, Math.PI * 2);
    c.fill();
  }
  c.lineCap = "round";
  for (const shoulder of [true, false])
    for (const { p, q, width } of edges) {
      c.lineWidth = width + (shoulder ? 3 : 0);
      c.strokeStyle = shoulder ? "#a49d82" : "#344044";
      c.beginPath();
      c.moveTo(p.x, p.z);
      c.lineTo(q.x, q.z);
      c.stroke();
    }
  paintSquares(c);
  c.restore();
}

// Surveyed public parcels; their navigation pins sit in the walkable centre,
// not on a stand, goal post or planter.
export const squares = [
  { kind: "court", label: "Terrain des Braises", x: 473, z: 50, w: 27, d: 16 },
  {
    kind: "garden",
    label: "Jardin des Agapanthes",
    x: 662,
    z: 50,
    w: 16,
    d: 10,
  },
  {
    kind: "market",
    label: "Marché des Verrières",
    x: 931,
    z: 52,
    w: 20,
    d: 11,
  },
];
function paintSquares(c) {
  for (const p of squares) {
    c.save();
    c.translate(p.x, p.z);
    const { w, d, kind } = p;
    c.fillStyle =
      kind === "court" ? "#aa6b51" : kind === "market" ? "#b6a385" : "#8b9c71";
    c.fillRect(-w / 2, -d / 2, w, d);
    if (kind === "court") {
      c.lineWidth = 0.28;
      c.strokeStyle = "#f0d9b6";
      c.strokeRect(-w / 2 + 1, -d / 2 + 1, w - 2, d - 2);
      c.beginPath();
      c.moveTo(0, -d / 2 + 1);
      c.lineTo(0, d / 2 - 1);
      c.stroke();
      c.beginPath();
      c.arc(0, 0, 1.8, 0, Math.PI * 2);
      c.stroke();
    } else
      for (const side of [-1, 1]) {
        c.fillStyle = kind === "market" ? "#bd7356" : "#546d55";
        c.fillRect(side * (w / 2 - 3) - 1.8, -d / 2 + 1, 3.6, d - 2);
      }
    c.restore();
  }
}

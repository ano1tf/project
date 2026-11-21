/**
 * Atelier de modélisation — KREO
 * ------------------------------------------------------------------
 * Permet de créer de la géométrie à la main, sans Blender : extruder une
 * face, subdiviser, insérer une boucle, déplacer un sommet, souder.
 *
 * Un objet `mesh` est stocké comme une simple liste de sommets + de faces :
 * lisible dans le JSON du projet, éditable, et reconstructible à l'identique.
 *
 *   { type: 'mesh', mesh: { verts: [[x,y,z],...], faces: [[i,j,k,...],...] } }
 *
 * Les faces sont des polygones (triangles ou quads) ; le rendu les
 * triangule en éventail. Pas de demi-arêtes : à cette échelle, un tableau de
 * faces suffit et reste compréhensible quand on ouvre le fichier.
 */
import * as THREE from '../assets/vendor/three/three.module.js';

/* ------------------------------------------------------------------ modèle */

export function emptyMesh() {
  return { verts: [], faces: [] };
}

/** Boîte 1×1×1 centrée, 8 sommets, 6 quads. Point de départ habituel. */
export function boxMesh(sx = 1, sy = 1, sz = 1) {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const verts = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]
  ];
  const faces = [
    [0, 1, 2, 3], // arrière (-z)
    [5, 4, 7, 6], // avant (+z)
    [4, 0, 3, 7], // gauche (-x)
    [1, 5, 6, 2], // droite (+x)
    [3, 2, 6, 7], // haut (+y)
    [4, 5, 1, 0]  // bas (-y)
  ];
  return { verts, faces };
}

export function planeMesh(size = 2, seg = 1) {
  const verts = [], faces = [];
  const n = Math.max(1, seg | 0);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      verts.push([(i / n - 0.5) * size, 0, (j / n - 0.5) * size]);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      faces.push([a, a + 1, a + n + 2, a + n + 1]);
    }
  }
  return { verts, faces };
}

/** Cylindre / cône : `topR` = 0 donne un cône. */
export function cylinderMesh(rBottom = 0.6, rTop = 0.6, height = 2, sides = 16) {
  const verts = [], faces = [];
  const h = height / 2;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    verts.push([Math.cos(a) * rBottom, -h, Math.sin(a) * rBottom]);
  }
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    verts.push([Math.cos(a) * rTop, h, Math.sin(a) * rTop]);
  }
  for (let i = 0; i < sides; i++) {
    const n = (i + 1) % sides;
    faces.push([i, n, sides + n, sides + i]);
  }
  if (rTop > 0.0001) faces.push(Array.from({ length: sides }, (_, i) => sides + i).reverse());
  if (rBottom > 0.0001) faces.push(Array.from({ length: sides }, (_, i) => i));
  return { verts, faces };
}

/** Icosphere : sphère triangulée, propre à subdiviser. */
export function sphereMesh(radius = 1, subdiv = 1) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ].map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l * radius, v[1] / l * radius, v[2] / l * radius];
  });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];
  let m = { verts, faces };
  for (let s = 0; s < subdiv; s++) m = subdivideAll(m);
  return m;
}

/**
 * Subdivision globale (Catmull-Clark simplifié) : chaque face est découpée en
 * quads autour de son centre, puis les sommets sont adoucis. Utilisée par la
 * sphère et par le bouton « Subdiviser ».
 */
export function subdivideAll(mesh) {
  const out = [];
  mesh.verts = mesh.verts.map((v) => [v[0], v[1], v[2]]);
  mesh.faces.forEach((face) => {
    if (face.length < 3) return;
    const c = faceCenter(mesh, face);
    mesh.verts.push(c);
    const ci = mesh.verts.length - 1;
    for (let k = 0; k < face.length; k++) {
      out.push([face[k], face[(k + 1) % face.length], ci]);
    }
  });
  mesh.faces = out;
  return mesh;
}

/* ------------------------------------------------------------ opérations */

const keyOf = (v) => v[0].toFixed(4) + ',' + v[1].toFixed(4) + ',' + v[2].toFixed(4);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function faceNormal(mesh, face) {
  if (!face || face.length < 3) return [0, 1, 0];
  let n = [0, 0, 0];
  for (let i = 0; i < face.length; i++) {
    const a = mesh.verts[face[i]];
    const b = mesh.verts[face[(i + 1) % face.length]];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = len(n);
  return l < 1e-9 ? [0, 1, 0] : [n[0] / l, n[1] / l, n[2] / l];
}

export function faceCenter(mesh, face) {
  const c = [0, 0, 0];
  face.forEach((i) => { const v = mesh.verts[i]; c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; });
  return mul(c, 1 / face.length);
}

/** Copie profonde — l'historique ne doit jamais partager de tableaux. */
export function cloneMesh(mesh) {
  return {
    verts: mesh.verts.map((v) => [v[0], v[1], v[2]]),
    faces: mesh.faces.map((f) => f.slice())
  };
}

/**
 * Extrude une face le long de sa normale.
 * C'est l'opération qui fait 80 % du travail en modélisation manuelle :
 * on part d'un cube, on extrude une face, on obtient un bras de bâtiment.
 */
export function extrudeFace(mesh, faceIndex, distance) {
  const face = mesh.faces[faceIndex];
  if (!face) return mesh;
  const n = faceNormal(mesh, face);
  const offset = mul(n, distance);
  const map = new Map();
  face.forEach((vi) => {
    mesh.verts.push(add(mesh.verts[vi], offset));
    map.set(vi, mesh.verts.length - 1);
  });
  const top = face.map((vi) => map.get(vi));
  mesh.faces[faceIndex] = top;
  // jupes : un quad par arête du contour extrudé
  for (let i = 0; i < face.length; i++) {
    const a = face[i];
    const b = face[(i + 1) % face.length];
    mesh.faces.push([a, b, map.get(b), map.get(a)]);
  }
  return mesh;
}

/** Extrude une arête libre en nouveau quad (le long de la normale moyenne). */
export function extrudeEdge(mesh, faceIndex, edgeIndex) {
  const face = mesh.faces[faceIndex];
  if (!face) return mesh;
  const a = face[edgeIndex];
  const b = face[(edgeIndex + 1) % face.length];
  const n = faceNormal(mesh, face);
  const dir = norm(sub(mesh.verts[b], mesh.verts[a]));
  const out = norm(cross(n, dir));
  mesh.verts.push(add(mesh.verts[a], mul(out, 1)));
  mesh.verts.push(add(mesh.verts[b], mul(out, 1)));
  const na = mesh.verts.length - 2, nb = mesh.verts.length - 1;
  mesh.faces.push([a, b, nb, na]);
  return mesh;
}

/** Subdivision par insertion du barycentre : chaque face devient N quads. */
export function subdivideFaces(mesh, faceIndices) {
  const sel = new Set(faceIndices);
  const out = [];
  mesh.faces.forEach((face, i) => {
    if (!sel.has(i) || face.length < 3) { out.push(face); return; }
    const c = faceCenter(mesh, face);
    mesh.verts.push(c);
    const ci = mesh.verts.length - 1;
    for (let k = 0; k < face.length; k++) {
      out.push([face[k], face[(k + 1) % face.length], ci]);
    }
  });
  mesh.faces = out;
  return mesh;
}

/** Coupe une face en deux par le milieu de deux arêtes opposées. */
export function insertLoop(mesh, faceIndex, edgeIndex) {
  const face = mesh.faces[faceIndex];
  if (!face || face.length !== 4) return mesh;
  const e0a = face[edgeIndex], e0b = face[(edgeIndex + 1) % 4];
  const e1a = face[(edgeIndex + 2) % 4], e1b = face[(edgeIndex + 3) % 4];
  mesh.verts.push(mul(add(mesh.verts[e0a], mesh.verts[e0b]), 0.5));
  const m0 = mesh.verts.length - 1;
  mesh.verts.push(mul(add(mesh.verts[e1a], mesh.verts[e1b]), 0.5));
  const m1 = mesh.verts.length - 1;
  mesh.faces.splice(faceIndex, 1,
    [e0a, m0, m1, e1b],
    [m0, e0b, e1a, m1]
  );
  return mesh;
}

/** Soude les sommets confondus (après déplacements, imports, soudures). */
export function weldMesh(mesh, eps = 1e-4) {
  const map = new Map();
  const verts = [];
  const remap = [];
  mesh.verts.forEach((v, i) => {
    const k = keyOf(v.map((x) => Math.round(x / eps) * eps));
    if (map.has(k)) { remap[i] = map.get(k); return; }
    map.set(k, verts.length);
    remap[i] = verts.length;
    verts.push(v);
  });
  const faces = [];
  mesh.faces.forEach((f) => {
    const nf = [];
    f.forEach((vi) => {
      const r = remap[vi];
      if (nf[nf.length - 1] !== r && nf[0] !== r) nf.push(r);
    });
    if (nf.length >= 3) faces.push(nf);
  });
  return { verts, faces };
}

/** Supprime les faces sélectionnées, puis les sommets devenus orphelins. */
export function deleteFaces(mesh, faceIndices) {
  const sel = new Set(faceIndices);
  const faces = mesh.faces.filter((_, i) => !sel.has(i));
  return compactMesh({ verts: mesh.verts, faces });
}

function compactMesh(mesh) {
  const used = new Set();
  mesh.faces.forEach((f) => f.forEach((i) => used.add(i)));
  const remap = new Map();
  const verts = [];
  mesh.verts.forEach((v, i) => {
    if (!used.has(i)) return;
    remap.set(i, verts.length);
    verts.push(v);
  });
  return {
    verts,
    faces: mesh.faces.map((f) => f.map((i) => remap.get(i)))
  };
}

/** Déplace un sommet dans le repère local du maillage. */
export function moveVertex(mesh, index, delta) {
  const v = mesh.verts[index];
  if (!v) return;
  v[0] += delta[0]; v[1] += delta[1]; v[2] += delta[2];
}

/** Lisse : rapproche chaque sommet de la moyenne de ses voisins. */
export function smoothMesh(mesh, iterations = 1, strength = 0.5) {
  for (let it = 0; it < iterations; it++) {
    const acc = mesh.verts.map(() => [0, 0, 0]);
    const count = mesh.verts.map(() => 0);
    mesh.faces.forEach((f) => {
      for (let i = 0; i < f.length; i++) {
        const a = f[i], b = f[(i + 1) % f.length];
        acc[a] = add(acc[a], mesh.verts[b]); count[a]++;
        acc[b] = add(acc[b], mesh.verts[a]); count[b]++;
      }
    });
    mesh.verts = mesh.verts.map((v, i) => {
      if (!count[i]) return v;
      const avg = mul(acc[i], 1 / count[i]);
      return add(v, mul(sub(avg, v), strength));
    });
  }
  return mesh;
}

/** Miroir : duplique la géométrie en miroir sur un axe (0,1,2). */
export function mirrorMesh(mesh, axis = 0) {
  const base = mesh.verts.length;
  const verts = mesh.verts.map((v) => {
    const c = [v[0], v[1], v[2]];
    c[axis] = -c[axis];
    return c;
  });
  const faces = mesh.faces.map((f) => f.map((i) => i + base).reverse());
  return { verts: mesh.verts.concat(verts), faces: mesh.faces.concat(faces) };
}

/** Applique une échelle / un décalage global. */
export function transformMesh(mesh, scale, offset) {
  const s = scale || [1, 1, 1];
  const o = offset || [0, 0, 0];
  return {
    verts: mesh.verts.map((v) => [v[0] * s[0] + o[0], v[1] * s[1] + o[1], v[2] * s[2] + o[2]]),
    faces: mesh.faces.map((f) => f.slice())
  };
}

export function boundsOf(mesh) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  mesh.verts.forEach((v) => {
    for (let i = 0; i < 3; i++) {
      if (v[i] < min[i]) min[i] = v[i];
      if (v[i] > max[i]) max[i] = v[i];
    }
  });
  if (!mesh.verts.length) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

/* --------------------------------------------------------------- rendu */

/**
 * Construit une BufferGeometry. Pas d'index partagé : chaque face a ses
 * propres sommets, ce qui donne des normales franches (look « low poly »
 * maîtrisé) et évite les artefacts de lissage sur les arêtes vives.
 */
export function meshToGeometry(mesh, opts) {
  const o = opts || {};
  const pos = [];
  const col = [];
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
  mesh.faces.forEach((face) => {
    if (face.length < 3) return;
    for (let k = 1; k < face.length - 1; k++) {
      const ia = face[0], ib = face[k], ic = face[k + 1];
      const a = mesh.verts[ia], b = mesh.verts[ib], c = mesh.verts[ic];
      if (!a || !b || !c) continue;
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      if (o.vcolors) {
        const n = faceNormal(mesh, face);
        // léger éclairage directionnel cuit : les volumes se lisent en aperçu
        // éclairage cuit : sans lui, un maillage à vertexColors paraît plat
        const shade = 0.55 + 0.45 * Math.max(0, dot(n, norm([0.4, 0.9, 0.35])));
        col.push(shade, shade, shade);
      }
    }
  });
  void tmpA; void tmpB; void tmpC;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (o.vcolors && col.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Distance écran d'un point — sert au magnétisme de sommet. */
export function nearestVertexOnScreen(mesh, matrixWorld, camera, ndc, maxPx, width, height) {
  let best = null;
  const v = new THREE.Vector3();
  mesh.verts.forEach((vert, i) => {
    v.set(vert[0], vert[1], vert[2]).applyMatrix4(matrixWorld).project(camera);
    if (v.z < -1 || v.z > 1) return;
    const dx = (v.x - ndc.x) * width * 0.5;
    const dy = (v.y - ndc.y) * height * 0.5;
    const d = Math.hypot(dx, dy);
    if (d < maxPx && (!best || d < best.dist)) best = { index: i, dist: d };
  });
  return best;
}

/** Sphère UV classique : anneaux quadrangulaires, pratique pour extruder/subdiviser. */
export function uvSphereMesh(radius = 1, segments = 32, rings = 16) {
  const verts = [], faces = [];
  const n = Math.max(8, segments | 0), m = Math.max(4, rings | 0);
  verts.push([0, radius, 0]); // pôle nord
  for (let j = 1; j < m; j++) {
    const phi = Math.PI * j / m;
    for (let i = 0; i < n; i++) {
      const theta = 2 * Math.PI * i / n;
      verts.push([radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta)]);
    }
  }
  const south = verts.length;
  verts.push([0, -radius, 0]);
  for (let i = 0; i < n; i++) faces.push([0, 1 + i, 1 + (i + 1) % n]);
  for (let j = 0; j < m - 2; j++) {
    const row = 1 + j * n, next = row + n;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      faces.push([row + i, next + i, next + k, row + k]);
    }
  }
  const last = 1 + (m - 2) * n;
  for (let i = 0; i < n; i++) faces.push([last + i, south, last + (i + 1) % n]);
  return { verts, faces };
}

/** Tore polygonal, orienté comme le tore de Blender (axe principal Y). */
export function torusMesh(major = 0.8, minor = 0.25, segments = 32, rings = 12) {
  const verts = [], faces = [];
  const n = Math.max(8, segments | 0), m = Math.max(6, rings | 0);
  for (let i = 0; i < n; i++) {
    const u = 2 * Math.PI * i / n;
    for (let j = 0; j < m; j++) {
      const v = 2 * Math.PI * j / m;
      const r = major + minor * Math.cos(v);
      verts.push([r * Math.cos(u), minor * Math.sin(v), r * Math.sin(u)]);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = i * m + j, b = ((i + 1) % n) * m + j;
    faces.push([a, b, ((i + 1) % n) * m + (j + 1) % m, i * m + (j + 1) % m]);
  }
  return { verts, faces };
}

export const MESH_PRIMS = {
  box: boxMesh, plane: planeMesh, cylinder: cylinderMesh,
  sphere: sphereMesh, icoSphere: sphereMesh, uvSphere: uvSphereMesh,
  cone: () => cylinderMesh(0.65, 0, 2, 24),
  torus: torusMesh
};

/* --------------------------------------------------------------- terrain */

/**
 * Terrain en grille déformable : un maillage régulier dont on peut monter ou
 * abaisser les sommets au pinceau. C'est ce qui distingue un niveau « fait
 * de cubes » d'un décor continu.
 */
export function terrainMesh(size = 60, segments = 24) {
  const m = planeMesh(size, segments);
  // on réorientera l'objet ; le maillage reste dans le plan XZ (y = hauteur)
  return m;
}

/** Hauteur interpolée du terrain en (x, z), par rapport à son maillage. */
export function sampleTerrainHeight(mesh, x, z, extent) {
  const n = Math.round(Math.sqrt(mesh.verts.length)) - 1;
  if (n < 1) return 0;
  const fx = (x / extent + 0.5) * n;
  const fz = (z / extent + 0.5) * n;
  const i = Math.max(0, Math.min(n - 1, Math.floor(fx)));
  const j = Math.max(0, Math.min(n - 1, Math.floor(fz)));
  const tx = fx - i, tz = fz - j;
  const h = (a, b) => (mesh.verts[a] ? mesh.verts[a][1] : 0);
  const v = (ii, jj) => jj * (n + 1) + ii;
  const h00 = h(v(i, j)), h10 = h(v(i + 1, j)), h01 = h(v(i, j + 1)), h11 = h(v(i + 1, j + 1));
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}

/**
 * Sculpte le terrain : relève ou creuse les sommets dans un rayon donné.
 * `falloff` adoucit le bord pour éviter les marches d'escalier.
 */
export function sculptTerrain(mesh, point, radius, strength, falloff) {
  const r2 = radius * radius;
  const f = falloff == null ? 2 : falloff;
  for (let i = 0; i < mesh.verts.length; i++) {
    const v = mesh.verts[i];
    const dx = v[0] - point[0];
    const dz = v[2] - point[2];
    const d2 = dx * dx + dz * dz;
    if (d2 > r2) continue;
    const d = Math.sqrt(d2) / radius;
    const w = Math.pow(1 - d * d, f);
    v[1] += strength * w;
  }
  return mesh;
}

/** Aplatit une zone : nivelle autour de la hauteur cible. */
export function flattenTerrain(mesh, point, radius, targetY, strength) {
  const r2 = radius * radius;
  for (let i = 0; i < mesh.verts.length; i++) {
    const v = mesh.verts[i];
    const dx = v[0] - point[0];
    const dz = v[2] - point[2];
    const d2 = dx * dx + dz * dz;
    if (d2 > r2) continue;
    const d = Math.sqrt(d2) / radius;
    const w = (1 - d * d) * (strength == null ? 0.4 : strength);
    v[1] += (targetY - v[1]) * w;
  }
  return mesh;
}

/** Bruit de relief : donne un terrain naturel en un clic. */
export function noiseTerrain(mesh, amplitude = 3, scale = 0.08) {
  mesh.verts.forEach((v) => {
    v[1] = (Math.sin(v[0] * scale) * Math.cos(v[2] * scale * 1.3)
      + Math.sin(v[0] * scale * 2.1 + v[2] * scale * 0.7) * 0.5) * amplitude;
  });
  return mesh;
}

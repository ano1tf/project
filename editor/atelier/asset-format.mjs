// Ateliers exchange inert data only. Never feed a response to the project importer or to eval.
export const KREO_ASSET_FORMAT = 'kreo.asset';
export const KREO_ASSET_LIMITS = Object.freeze({
  bytes: 384 * 1024,
  objects: 96,
  vertices: 2400,
  faces: 3000,
  triangles: 24000,
  keys: 900,
  depth: 8,
});
export const KREO_PRIMITIVES = Object.freeze([
  'box',
  'plane',
  'cylinder',
  'cone',
  'icoSphere',
  'uvSphere',
  'torus',
]);
const primitiveBudget = new Map([
  ['box', 12],
  ['plane', 2],
  ['cylinder', 60],
  ['cone', 70],
  ['icoSphere', 80],
  ['uvSphere', 960],
  ['torus', 768],
]);
const fields = [
  'id',
  'parent',
  'name',
  'type',
  'position',
  'rotation',
  'scale',
  'collidable',
  'material',
  'primitive',
  'mesh',
  'motion',
];
const channels = ['position', 'rotation', 'scale'];
const idPattern = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const colorPattern = /^#[0-9a-f]{6}$/i;

function invalid(path, reason) {
  throw new TypeError(`${path} — ${reason}`);
}
function record(value, names, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'objet attendu');
  for (const key of Object.keys(value)) {
    if (!names.includes(key)) invalid(path, `champ interdit : ${key.slice(0, 60)}`);
  }
}
function number(value, lo, hi, path) {
  if (!Number.isFinite(value) || value < lo || value > hi)
    invalid(path, `nombre entre ${lo} et ${hi} attendu`);
  return value === 0 ? 0 : value;
}
function text(value, max, path) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    invalid(path, `texte de 1 à ${max} caractères attendu`);
  return value.trim();
}
function list(value, min, max, path) {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    invalid(path, `tableau de ${min} à ${max} éléments attendu`);
  return value;
}
function xyz(value, lo, hi, path) {
  return list(value, 3, 3, path).map((v, i) => number(v, lo, hi, `${path}[${i}]`));
}
function choice(value, choices, path) {
  if (!choices.includes(value)) invalid(path, choices.join(' | '));
  return value;
}
function identifier(value, path) {
  if (typeof value !== 'string' || !idPattern.test(value))
    invalid(path, 'identifiant court : a-z, 0-9, _ et -');
  return value;
}
function color(value, path) {
  if (typeof value !== 'string' || !colorPattern.test(value))
    invalid(path, 'couleur #RRGGBB attendue');
  return value.toLowerCase();
}
function material(value, path) {
  if (value === undefined) value = {};
  record(value, ['color', 'roughness', 'metalness', 'emissive', 'opacity'], path);
  return {
    color: color(value.color ?? '#9aa9c3', `${path}.color`),
    roughness: number(value.roughness ?? 0.68, 0, 1, `${path}.roughness`),
    metalness: number(value.metalness ?? 0.08, 0, 1, `${path}.metalness`),
    emissive: color(value.emissive ?? '#000000', `${path}.emissive`),
    opacity: number(value.opacity ?? 1, 0.08, 1, `${path}.opacity`),
  };
}
function validateMesh(value, path, totals) {
  record(value, ['verts', 'faces'], path);
  const verts = list(value.verts, 3, KREO_ASSET_LIMITS.vertices, `${path}.verts`).map((v, i) =>
    xyz(v, -64, 64, `${path}.verts[${i}]`),
  );
  const faces = list(value.faces, 1, KREO_ASSET_LIMITS.faces, `${path}.faces`).map((f, i) => {
    const p = `${path}.faces[${i}]`;
    list(f, 3, 16, p);
    if (
      f.some((n) => !Number.isInteger(n) || n < 0 || n >= verts.length) ||
      new Set(f).size !== f.length
    )
      invalid(p, 'indices distincts de sommets existants attendus');
    totals.triangles += f.length - 2;
    if (totals.triangles > KREO_ASSET_LIMITS.triangles)
      invalid(path, 'budget de triangles dépassé');
    return f.slice();
  });
  return { verts, faces };
}
function validateMotion(value, path, totals) {
  record(value, ['duration', 'loop', 'ease', ...channels], path);
  const duration = number(value.duration, 0.1, 90, `${path}.duration`);
  const result = {
    duration,
    loop: choice(value.loop ?? 'repeat', ['repeat', 'once', 'pingpong'], `${path}.loop`),
    ease: choice(value.ease ?? 'linear', ['linear', 'smooth', 'step'], `${path}.ease`),
  };
  let used = 0;
  for (const channel of channels) {
    if (value[channel] === undefined) continue;
    const p = `${path}.${channel}`;
    const keys = list(value[channel], 2, 80, p);
    if (keys[0]?.[0] !== 0 || keys.at(-1)?.[0] !== duration)
      invalid(p, 'clés requises à t=0 et à t=duration');
    let prev = -1;
    const lo = channel === 'scale' ? 0.05 : channel === 'rotation' ? -3600 : -128;
    const hi = channel === 'scale' ? 8 : channel === 'rotation' ? 3600 : 128;
    result[channel] = keys.map((k, i) => {
      const at = `${p}[${i}]`;
      list(k, 4, 4, at);
      const time = number(k[0], 0, duration, `${at}[0]`);
      if (time <= prev) invalid(at, 'horodatages strictement croissants');
      prev = time;
      return [time, ...xyz(k.slice(1), lo, hi, at)];
    });
    used += keys.length;
  }
  if (!used) invalid(path, 'ajouter une piste position, rotation ou scale');
  if ((totals.keys += used) > KREO_ASSET_LIMITS.keys) invalid(path, 'budget de clés dépassé');
  totals.clips++;
  totals.duration = Math.max(totals.duration, duration * (result.loop === 'pingpong' ? 2 : 1));
  return result;
}

// Parse all records before accepting anything. References are internal, unique and acyclic.
export function validateKreoAsset(value) {
  record(value, ['format', 'version', 'name', 'description', 'objects'], 'lot');
  if (value.format !== KREO_ASSET_FORMAT || value.version !== 1)
    invalid('lot', 'format kreo.asset, version 1 attendu');
  const name = text(value.name, 80, 'lot.name');
  const description =
    value.description === undefined ? '' : text(value.description, 280, 'lot.description');
  const totals = { meshes: 0, triangles: 0, clips: 0, keys: 0, duration: 0 };
  const ids = new Map();
  const objects = list(value.objects, 1, KREO_ASSET_LIMITS.objects, 'lot.objects').map((v, i) => {
    const p = `objects[${i}]`;
    record(v, fields, p);
    const id = identifier(v.id, `${p}.id`);
    if (ids.has(id)) invalid(`${p}.id`, `doublon : ${id}`);
    const o = {
      id,
      name: text(v.name ?? id, 80, `${p}.name`),
      type: choice(v.type, ['group', 'mesh'], `${p}.type`),
      position: xyz(v.position ?? [0, 0, 0], -512, 512, `${p}.position`),
      rotation: xyz(v.rotation ?? [0, 0, 0], -3600, 3600, `${p}.rotation`),
      scale: xyz(v.scale ?? [1, 1, 1], 0.01, 32, `${p}.scale`),
    };
    if (v.parent !== undefined && v.parent !== null) o.parent = identifier(v.parent, `${p}.parent`);
    if (v.motion !== undefined) o.motion = validateMotion(v.motion, `${p}.motion`, totals);
    if (o.type === 'group') {
      if (
        v.mesh !== undefined ||
        v.primitive !== undefined ||
        v.material !== undefined ||
        v.collidable !== undefined
      )
        invalid(p, 'un groupe porte uniquement les transformations et les animations');
    } else {
      if ((v.primitive === undefined) === (v.mesh === undefined))
        invalid(p, 'fournir primitive ou mesh, pas les deux');
      if (v.primitive !== undefined) {
        o.primitive = choice(v.primitive, KREO_PRIMITIVES, `${p}.primitive`);
        totals.triangles += primitiveBudget.get(o.primitive);
      } else o.mesh = validateMesh(v.mesh, `${p}.mesh`, totals);
      if (totals.triangles > KREO_ASSET_LIMITS.triangles) invalid(p, 'budget de triangles dépassé');
      o.material = material(v.material, `${p}.material`);
      if (v.collidable !== undefined && typeof v.collidable !== 'boolean')
        invalid(`${p}.collidable`, 'booléen attendu');
      o.collidable = v.collidable === true;
      totals.meshes++;
    }
    ids.set(id, o);
    return o;
  });
  if (!totals.meshes) invalid('lot.objects', 'au moins un maillage est nécessaire');
  for (const item of objects) {
    const path = `objects.${item.id}`;
    let o = item,
      depth = 0,
      animated = !!item.motion;
    const visited = new Set([o.id]);
    while (o.parent !== undefined) {
      const parent = ids.get(o.parent);
      if (!parent || parent.type !== 'group')
        invalid(`${path}.parent`, 'le parent doit être un groupe du lot');
      if (visited.has(parent.id)) invalid(`${path}.parent`, 'cycle dans la hiérarchie');
      if (++depth > KREO_ASSET_LIMITS.depth) invalid(`${path}.parent`, 'hiérarchie trop profonde');
      visited.add(parent.id);
      o = parent;
      animated ||= !!o.motion;
    }
    if (animated && item.collidable)
      invalid(`${path}.collidable`, 'les éléments animés et leurs enfants sont décoratifs');
  }
  // A normalized copy can safely be used as JSON again (no extra metadata fields).
  const asset = { format: KREO_ASSET_FORMAT, version: 1, name, objects };
  if (description) asset.description = description;
  return { asset, stats: { ...totals, count: objects.length } };
}

export function parseKreoAsset(source) {
  if (
    typeof source !== 'string' ||
    source.length > KREO_ASSET_LIMITS.bytes ||
    new TextEncoder().encode(source).byteLength > KREO_ASSET_LIMITS.bytes
  )
    invalid('lot', `JSON de ${KREO_ASSET_LIMITS.bytes / 1024} Kio maximum`);
  const trimmed = source.trim();
  // Chat replies sometimes contain exactly one fenced JSON block.
  const json = /^```(?:json)?\s*\r?\n([\s\S]+)\r?\n```$/i.exec(trimmed)?.[1] ?? trimmed;
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    invalid('lot', 'JSON illisible (un seul objet, sans commentaires)');
  }
  return validateKreoAsset(parsed);
}

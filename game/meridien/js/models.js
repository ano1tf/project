import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clamp, expEase, lerp, onRoad, TAU } from "./core.mjs";
import { radialTexture, standard } from "./materials.js";
import { advanceGait, gait } from "./acting.mjs";
import { instrumentFace, DIAL_START, DIAL_SWEEP } from "./instruments.js";

const cube = new T.BoxGeometry(1, 1, 1),
  sphere = new T.SphereGeometry(1, 14, 9),
  smallSphere = new T.SphereGeometry(1, 9, 6),
  ring = new T.TorusGeometry(1, 0.078, 8, 20);
const flat = new T.PlaneGeometry(1, 1);
const V = (a) => new T.Vector3(...a),
  up = new T.Vector3(0, 1, 0);
function group(root, x = 0, y = 0, z = 0) {
  const q = new T.Group();
  q.position.set(x, y, z);
  root?.add(q);
  return q;
}
function bone(parent, x = 0, y = 0, z = 0) {
  const b = new T.Bone();
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}
function mesh(root, geo, mat, x = 0, y = 0, z = 0) {
  const o = new T.Mesh(geo, mat);
  o.position.set(x, y, z);
  root.add(o);
  return o;
}
function ell(root, mat, x, y, z, w, h, d) {
  const o = mesh(
    root,
    Math.max(w, h, d) <= 0.037 ? smallSphere : sphere,
    mat,
    x,
    y,
    z,
  );
  o.scale.set(w, h, d);
  return o;
}
function box(root, mat, x, y, z, w, h, d) {
  const o = mesh(root, cube, mat, x, y, z);
  o.scale.set(w, h, d);
  return o;
}
function cyl(root, mat, x, y, z, r1, r2, h, n = 18) {
  return mesh(root, new T.CylinderGeometry(r1, r2, h, n), mat, x, y, z);
}
function line(root, mat, a, b, width, depth = width) {
  const d = V(b).sub(V(a));
  const c = box(
    root,
    mat,
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
    width,
    d.length(),
    depth,
  );
  c.quaternion.setFromUnitVectors(up, d.normalize());
  return c;
}
function flatten(source, target, cast = true) {
  const lists = new Map();
  source.updateMatrixWorld(true);
  source.traverse((o) => {
    if (!o.isMesh) return;
    const id = o.material.id + ":" + Number(o.geometry.index !== null);
    if (!lists.has(id)) lists.set(id, [o.material, []]);
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    g.clearGroups();
    lists.get(id)[1].push(g);
  });
  for (const [m, list] of lists.values()) {
    const geo = list.length === 1 ? list[0] : mergeGeometries(list);
    if (!geo)
      throw new Error("Géométrie de personnage ou véhicule incompatible");
    const q = mesh(target, geo, m);
    q.castShadow = cast;
    q.receiveShadow = true;
    if (list.length > 1) for (const g of list) g.dispose();
  }
}
function colorBatch(source, mat, exclude = () => false) {
  source.updateMatrixWorld(true);
  const parts = [];
  source.traverse((o) => {
    if (!o.isMesh || exclude(o)) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    geo.clearGroups();
    const count = geo.getAttribute("position").count,
      cols = new Float32Array(count * 3),
      c = o.material.color;
    for (let i = 0; i < count; i++) {
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new T.BufferAttribute(cols, 3));
    parts.push(geo);
  });
  const geom = mergeGeometries(parts);
  parts.forEach((o) => o.dispose());
  const object = new T.Mesh(geom, mat);
  object.receiveShadow = true;
  return object;
}
function bindHuman(root, coat, fold, baseMaterial, garment, shadows) {
  root.updateMatrixWorld(true);
  const bones = [],
    index = new Map(),
    livery = [],
    body = [],
    parts = [];
  root.traverse((o) => {
    if (o.isBone) {
      index.set(o, bones.length);
      bones.push(o);
    }
  });
  root.traverse((o) => {
    if (!o.isMesh || o.material.transparent || !o.parent.isBone) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld),
      n = g.attributes.position.count;
    const ids = new Uint16Array(n * 4),
      weights = new Float32Array(n * 4),
      colors = new Float32Array(n * 3);
    const fabric = o.material === coat || o.material === fold;
    const blend = o.parent.userData.blend,
      local = o.geometry.attributes.position;
    const tint =
      o.material === coat
        ? new T.Color(0xffffff)
        : o.material === fold
          ? new T.Color(0xbbb5ac)
          : o.material.color;
    for (let i = 0; i < n; i++) {
      ids[i * 4] = index.get(o.parent);
      const w = blend
        ? clamp((local.getY(i) - blend.join) * blend.slope, 0, 1) * 0.48
        : 0;
      ids[i * 4 + 1] = blend ? index.get(blend.other) : 0;
      weights[i * 4] = 1 - w;
      weights[i * 4 + 1] = w;
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    g.setAttribute("skinIndex", new T.BufferAttribute(ids, 4));
    g.setAttribute("skinWeight", new T.BufferAttribute(weights, 4));
    g.setAttribute("color", new T.BufferAttribute(colors, 3));
    g.clearGroups();
    (fabric ? livery : body).push(g);
    parts.push(o);
  });
  parts.forEach((o) => {
    o.removeFromParent();
    o.geometry.dispose();
  });
  const skeleton = new T.Skeleton(bones),
    result = [];
  // Pad the rest-pose sphere for the stride and crouch, without skinning vertices just to cull.
  for (const [gs, mat] of [
    [body, baseMaterial],
    [livery, garment],
  ]) {
    const geom = mergeGeometries(gs);
    gs.forEach((g) => g.dispose());
    const mesh = new T.SkinnedMesh(geom, mat);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    geom.computeBoundingSphere();
    mesh.boundingSphere = geom.boundingSphere.clone();
    mesh.boundingSphere.radius += 0.33;
    root.add(mesh);
    mesh.bind(skeleton);
    result.push(mesh);
  }
  return result;
}
function labelDoor(source, target, paint, glass, trimMaterial) {
  const main = group(null);
  const trim = group(null);
  const glazing = group(null);
  for (const o of [...source.children])
    (o.material === glass ? glazing : o.material === paint ? main : trim).add(
      o,
    );
  flatten(glazing, target, false);
  flatten(main, target, true);
  const v = colorBatch(trim, trimMaterial);
  v.castShadow = true;
  target.add(v);
}
function walkerProxy(model, material, colors) {
  const [cloth, pants, skin, hair, shoe] = colors,
    q = group(null);
  const low = new T.SphereGeometry(1, 7, 5),
    tube = new T.CapsuleGeometry(1, 1.4, 2, 6);
  const shape = (m, g, x, y, z, sx, sy, sz) => {
    const o = mesh(q, g, m, x, y, z);
    o.scale.set(sx, sy, sz);
    return o;
  };
  shape(cloth, tube, 0, 1.21, 0.006, 0.184, 0.158, 0.102);
  shape(pants, low, 0, 0.911, 0.015, 0.173, 0.149, 0.11);
  shape(skin, low, 0, 1.56, -0.025, 0.085, 0.124, 0.089);
  shape(hair, low, 0, 1.624, 0.002, 0.089, 0.077, 0.092);
  for (const s of [-1, 1]) {
    shape(
      pants,
      tube,
      s * 0.091,
      0.487,
      s * 0.074,
      0.067,
      0.244,
      0.074,
    ).rotation.x = s * 0.13;
    shape(shoe, low, s * 0.09, 0.09, s * 0.107 - 0.031, 0.068, 0.078, 0.112);
    shape(
      cloth,
      tube,
      s * 0.202,
      1.116,
      -s * 0.151,
      0.052,
      0.168,
      0.053,
    ).rotation.x = s * 0.2;
    shape(skin, low, s * 0.206, 0.858, -s * 0.17, 0.038, 0.054, 0.05);
  }
  const proxy = colorBatch(q, material);
  low.dispose();
  tube.dispose();
  proxy.visible = false;
  model.root.add(proxy);
  return proxy;
}
function shell(rings, closed = true, omit) {
  const points = [],
    ind = [],
    uv = [],
    n = rings[0].length;
  for (let i = 0; i < rings.length; i++)
    for (let j = 0; j < n; j++) {
      points.push(...rings[i][j]);
      uv.push(j / n, i / (rings.length - 1));
    }
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < n; j++) {
      if (omit?.(i, j)) continue;
      const a = i * n + j,
        b = i * n + ((j + 1) % n),
        c = a + n,
        d = b + n;
      ind.push(a, c, b, b, c, d);
    }
  if (closed)
    for (let j = 1; j < n - 1; j++) {
      ind.push(0, j, j + 1);
      const a = (rings.length - 1) * n;
      ind.push(a, a + j + 1, a + j);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(points, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}
function faceted(root, mat, p) {
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(p.flat(), 3));
  g.setAttribute(
    "uv",
    new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return mesh(root, g, mat);
}
function ringsY(items, slices = 14) {
  return items.map(([y, x, z, ox = 0, oz = 0]) =>
    Array.from({ length: slices }, (_, i) => {
      const a = (i / slices) * TAU;
      return [ox + Math.cos(a) * x, y, oz + Math.sin(a) * z];
    }),
  );
}
// A fitted scalp with a swept hairline and an irregular edge. Shape variation
// comes from the mesh itself, not a pile of identical locks.
function scalp(style, width) {
  const layers = 10,
    slices = 28,
    pos = [],
    uv = [],
    index = [];
  for (let j = 0; j <= layers; j++)
    for (let i = 0; i < slices; i++) {
      const d = (i / slices) * TAU,
        front = Math.cos(d),
        side = Math.sin(d);
      const edge =
        style === "aya"
          ? 2.24 - 0.92 * Math.max(0, front) + 0.17 * side
          : style === "ines"
            ? 1.69 - 0.43 * front + 0.055 * Math.sin(d * 5)
            : 1.83 - 0.39 * front + 0.14 * Math.sin(d * 2 + 0.62);
      const a = Math.max(0.024, (edge * j) / layers),
        ripple =
          style === "ines"
            ? (0.005 * Math.sin(d * 12 + a * 6) +
                0.0033 * Math.cos(d * 7 - a * 18)) *
              Math.sin(a)
            : 0.0042 * Math.sin(d * 6 + a * 4.3) * Math.sin(a);
      pos.push(
        (0.106 * width + ripple) * Math.sin(a) * side,
        0.151 + (0.118 + ripple) * Math.cos(a),
        0.009 - (0.111 + ripple) * Math.sin(a) * front,
      );
      uv.push(i / slices, j / layers);
      if (j === layers) continue;
      const q = j * slices + i,
        b = j * slices + ((i + 1) % slices),
        c = q + slices,
        e = b + slices;
      index.push(q, b, c, b, e, c);
    }
  for (let i = 1; i < slices - 1; i++) index.push(0, i + 1, i);
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
const clothColors = {
  salome: [0x507164, 0x283937],
  dock: [0x875d37, 0x493e35],
  messenger: [0x566e90, 0x33445c],
  ruste: [0x9e512d, 0x7d3b25],
  night: [0x314250, 0x243744],
  rain: [0xb5a34b, 0x82733e],
  ines: [0x32635d, 0x23463f],
  aya: [0x673f57, 0x51374b],
  guard: [0x263c4c, 0x23323f],
  blue: [0x456576, 0x2a4452],
  sand: [0x786c53, 0x655c4b],
  khaki: [0x5c694d, 0x46523d],
  red: [0x793c36, 0x59352e],
};

const skinTones = [0xaa7152, 0xb78566, 0x92614a, 0x713f30, 0xbd8e76];
const hairTones = [0x29211c, 0x28272a, 0x33241e, 0x2a211e, 0x695143];
const driverOval = new T.SphereGeometry(1, 10, 7);
const steeringRim = new T.TorusGeometry(1, 0.12, 5, 16);
const fade = (x) => {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};
// A single, depth-tested tint. Head-on panes read through to the cabin, while
// shallower views pick up the cool reflection; no transmission render pass.
function windshield(weather) {
  return new T.ShaderMaterial({
    name: "Vitrage · teinte et réflexion rasante",
    side: T.DoubleSide,
    transparent: true,
    forceSinglePass: true,
    depthWrite: false,
    fog: true,
    uniforms: {
      ...T.UniformsUtils.clone(T.UniformsLib.fog),
      cabinView: { value: 0 },
      ...weather,
    },
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec3 paneNormal, paneRay;
      varying vec2 paneUV;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
        paneNormal = normalMatrix * normal;
        paneRay = -mvPosition.xyz;
        paneUV = uv;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      varying vec3 paneNormal, paneRay;
      varying vec2 paneUV;
      uniform float cabinView, paneRain, paneClock;
      uniform vec3 paneSky, paneHorizon;
      void main() {
        vec3 n = normalize(paneNormal), ray = normalize(paneRay);
        float edge = 1. - clamp(abs(dot(n,ray)), 0., 1.);
        float gloss = edge*edge;
        float sky = max(0., dot(reflect(-ray,n), mat3(viewMatrix)*vec3(0.,1.,0.)));
        vec3 reflectance = mix(paneHorizon, paneSky, sky);
        vec3 tint = mix(vec3(.048,.086,.091), reflectance, .15 + .74*gloss);
        float opacity = mix(.13 + gloss*.53, .035 + gloss*.21, cabinView);
        // Small streaks on the existing glazing. Not a second screen-space pass.
        if (cabinView > .5 && paneRain > .045) {
          vec2 at = paneUV*vec2(108.,28.);
          at.x += paneUV.y*.32;
          float lane = floor(at.x);
          at.y += fract(lane*.721)*7.2 + paneClock * mix(.24,1.83,fract(lane*.279));
          float trail = (1.-smoothstep(.03,.16,abs(fract(at.x)-.5)))*smoothstep(.51,.96,fract(at.y));
          tint = mix(tint,paneHorizon,trail*.43);
          opacity += paneRain*(.011+trail*.28);
        }
        gl_FragColor = vec4(tint, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

export class ModelForge {
  constructor() {
    this.glassWeather = {
      paneSky: { value: new T.Color(0x557d96) },
      paneHorizon: { value: new T.Color(0xb8c4c6) },
      paneRain: { value: 0 },
      paneClock: { value: 0 },
    };
    this.common = {
      tire: standard(0x232526, { roughness: 0.96 }),
      tireEdge: standard(0x2e302e, { roughness: 0.88 }),
      under: standard(0x182527, { roughness: 0.49, metalness: 0.29 }),
      grille: standard(0x202c33, { roughness: 0.56, metalness: 0.44 }),
      glass: windshield(this.glassWeather),
      seat: standard(0x424644),
      piping: standard(0x817565),
      metal: standard(0x9aabad, { roughness: 0.35, metalness: 0.73 }),
      darkMetal: standard(0x65747a, { roughness: 0.43, metalness: 0.64 }),
      head: standard(0xe2d8a9, {
        metalness: 0.2,
        roughness: 0.3,
        emissive: 0xf6d399,
        emissiveIntensity: 0.92,
      }),
      frontTrim: standard(0x7b8280, { metalness: 0.64, roughness: 0.41 }),
      tail: standard(0xa02b22, {
        roughness: 0.34,
        emissive: 0xec3d20,
        emissiveIntensity: 0.56,
      }),
      plate: standard(0xc6c0a3),
      white: standard(0xf2ece0),
      signal: standard(0xab6a31, {
        emissive: 0xfa8c38,
        emissiveIntensity: 0.36,
      }),
      leather: standard(0x262b2b, { roughness: 0.92 }),
      wash: standard(0x3b596a, { metalness: 0.42, roughness: 0.7 }),
    };
    this.shadowTex = radialTexture("#09171ce0", "#13212a8a");
    this.shadowMat = new T.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.56,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    this.boot = standard(0x292827, { roughness: 0.78 });
    this.sole = standard(0x1c2427);
    this.detail = standard(0xa09775, { roughness: 0.71 });
    this.proxyMat = new T.MeshLambertMaterial({
      color: 0xffffff,
      vertexColors: true,
    });
    this.tireBatch = standard(0xffffff, {
      vertexColors: true,
      roughness: 0.68,
      metalness: 0.27,
    });
    this.carBodyBatch = standard(0xffffff, {
      vertexColors: true,
      roughness: 0.59,
      metalness: 0.26,
      side: T.DoubleSide,
    });
    this.opticsBatch = new T.MeshBasicMaterial({
      vertexColors: true,
      color: 0xffffff,
    });
    this.bodySkin = standard(0xffffff, { vertexColors: true, roughness: 0.81 });
    this.lowCars = new Map();
    this.drivers = new Map();
    this.instruments = new Map();
    this.driverBatch = new T.MeshLambertMaterial({
      name: "Occupant · pose assise",
      vertexColors: true,
      emissive: 0x675346,
      emissiveIntensity: 0.17,
    });
  }
  shadow(root, x, z, w, d, opacity = false) {
    const o = mesh(
      root,
      flat,
      opacity ? this.shadowMat.clone() : this.shadowMat,
      x,
      0.021,
      z,
    );
    o.rotation.x = -Math.PI / 2;
    o.scale.set(w, d, 1);
    o.renderOrder = 2;
    return o;
  }
  conditions(climate, time, eco) {
    const w = this.glassWeather;
    w.paneSky.value.copy(climate.skyUniform.top.value);
    w.paneHorizon.value.copy(climate.skyUniform.horizon.value);
    w.paneRain.value = eco ? 0 : climate.wet;
    w.paneClock.value = time;
  }
  paint(color) {
    return new T.MeshPhysicalMaterial({
      color,
      roughness: 0.29,
      metalness: 0.38,
      clearcoat: 0.62,
      clearcoatRoughness: 0.18,
      side: T.DoubleSide,
    });
  }
  wheel(target, side, r, width, detailed) {
    const m = this.common,
      a = group(null),
      axis = (o) => {
        o.rotation.z = Math.PI * 0.5;
        return o;
      };
    axis(cyl(a, m.tire, 0, 0, 0, r, r, width, 20));
    axis(
      cyl(
        a,
        m.tireEdge,
        side * width * 0.485,
        0,
        0,
        r * 0.94,
        r * 0.94,
        width * 0.075,
        20,
      ),
    );
    axis(
      cyl(
        a,
        m.darkMetal,
        side * width * 0.54,
        0,
        0,
        r * 0.68,
        r * 0.68,
        width * 0.1,
        14,
      ),
    );
    const lip = mesh(a, ring, m.metal, side * width * 0.62, 0, 0);
    lip.rotation.y = Math.PI * 0.5;
    lip.scale.setScalar(r * 0.646);
    if (detailed) {
      axis(
        cyl(
          a,
          m.grille,
          side * width * 0.64,
          0,
          0,
          r * 0.49,
          r * 0.49,
          0.026,
          16,
        ),
      );
      axis(
        cyl(
          a,
          m.metal,
          side * width * 0.73,
          0,
          0,
          r * 0.181,
          r * 0.181,
          0.035,
          12,
        ),
      );
      for (let j = 0; j < 10; j++) {
        const t = (j / 10) * TAU,
          d = 0.405 * r;
        const spoke = box(
          a,
          m.metal,
          side * width * 0.714,
          Math.cos(t) * d,
          Math.sin(t) * d,
          0.03,
          r * 0.486,
          r * 0.077,
        );
        spoke.rotation.x = t + 0.06;
      }
      for (let j = 0; j < 17; j++) {
        const t = (j / 17) * TAU,
          o = box(
            a,
            m.tireEdge,
            0,
            Math.cos(t) * (r - 0.007),
            Math.sin(t) * (r - 0.007),
            width * 0.75,
            0.013,
            r * 0.109,
          );
        o.rotation.x = t;
      }
    }
    const baked = colorBatch(a, this.tireBatch);
    baked.castShadow = detailed;
    target.add(baked);
  }
  cabin(g, spec, glazing, full) {
    const { width, length, height } = spec,
      { front, topF, base, roofY, back } = glazing,
      van = spec.type === "van",
      sport = spec.type === "sport",
      m = this.common,
      d = length * 0.5,
      x = -width * 0.225,
      y = height * (van ? 0.792 : 0.854),
      z = topF * d + (van ? 0.16 : 0.12),
      crown = Math.min(0.121, height * 0.085),
      wheelY = full && van ? height * 0.614 : y - 0.171,
      wheelZ = z - (van ? 0.43 : 0.39),
      belt = base * height,
      alcantara = sport ? 0x303640 : van ? 0x4b5051 : 0x655950,
      fabric = full ? standard(alcantara, { roughness: 0.95 }) : m.seat,
      piping = full
        ? standard(sport ? 0xae543e : van ? 0x89918b : 0x8d7760)
        : m.piping,
      dashZ = (wheelZ + front * d) * 0.5;
    box(
      g,
      m.under,
      0,
      full ? belt - 0.043 : wheelY - 0.053,
      dashZ,
      width * 0.84,
      full ? 0.171 : 0.113,
      full ? Math.abs(front * d - wheelZ) + 0.09 : van ? 0.285 : 0.25,
    );
    box(
      g,
      piping,
      0,
      belt + (full && van ? 0.136 : -0.033),
      wheelZ + 0.014,
      width * 0.81,
      0.016,
      0.035,
    );
    const radius = van ? 0.174 : 0.158;
    if (!full) {
      const wheel = mesh(g, steeringRim, m.leather, x, wheelY, wheelZ);
      wheel.scale.setScalar(radius);
      wheel.rotation.x = -0.23;
      box(g, m.darkMetal, x, wheelY - 0.014, wheelZ, 0.27, 0.024, 0.034);
      box(g, m.seat, x, wheelY, wheelZ + 0.013, 0.107, 0.095, 0.045);
    }
    for (const side of [1, -1]) {
      const sx = x * side,
        baseY = full ? belt - (van ? 0.185 : 0.22) : y - crown - 0.15,
        top = y - crown + 0.065,
        backY = full ? (top + baseY) / 2 : baseY;
      box(
        g,
        fabric,
        sx,
        backY,
        z + 0.262,
        0.39,
        full ? top - baseY : 0.395,
        0.146,
      ).rotation.x = 0.13;
      box(
        g,
        m.leather,
        sx,
        backY - 0.017,
        z + 0.18,
        0.246,
        full ? top - baseY - 0.06 : 0.334,
        0.044,
      ).rotation.x = 0.13;
      box(g, fabric, sx, y - 0.051, z + 0.282, 0.219, 0.14, 0.111);
      box(g, piping, sx, y + 0.008, z + 0.231, 0.193, 0.011, 0.014);
      if (full) {
        box(g, fabric, sx, baseY + 0.032, z - 0.019, 0.417, 0.116, 0.48);
        for (const side of [-1, 1]) {
          box(
            g,
            fabric,
            sx + side * 0.184,
            backY,
            z + 0.173,
            0.084,
            top - baseY - 0.052,
            0.105,
          ).rotation.x = 0.13;
          box(
            g,
            piping,
            sx + side * 0.139,
            baseY + 0.095,
            z - 0.021,
            0.013,
            0.012,
            0.36,
          );
        }
      }
    }
    if (van)
      box(
        g,
        m.grille,
        0,
        height * 0.7,
        z + 0.556,
        width * 0.85,
        height * 0.46,
        0.075,
      );
    else if (!sport) {
      box(
        g,
        fabric,
        0,
        belt + (full ? -0.03 : 0.033),
        d * 0.51,
        width * 0.68,
        full ? 0.3 : 0.21,
        0.18,
      ).rotation.x = 0.27;
      if (full)
        box(g, fabric, 0, belt - 0.162, d * 0.397, width * 0.67, 0.114, 0.47);
      for (const sign of [-1, 1])
        box(
          g,
          m.leather,
          sign * width * 0.215,
          belt + 0.112,
          d * 0.476,
          0.173,
          0.11,
          0.085,
        );
    }
    if (full) {
      const floor = height * (van ? 0.307 : 0.339),
        consoleZ = z - 0.24,
        consoleY = belt - (van ? 0.122 : 0.092),
        trimZ = wheelZ + 0.028;
      box(
        g,
        m.leather,
        0,
        floor,
        (back + front) * d * 0.5,
        width * 0.9,
        0.07,
        (back - front) * d + 0.06,
      );
      box(
        g,
        m.seat,
        0,
        (consoleY + floor) * 0.5,
        consoleZ + 0.15,
        0.245,
        consoleY - floor,
        0.92,
      );
      box(g, m.under, 0, consoleY, consoleZ + 0.05, 0.27, 0.075, 0.81);
      box(g, piping, 0, consoleY + 0.041, consoleZ - 0.23, 0.117, 0.012, 0.14);
      box(
        g,
        m.grille,
        0,
        consoleY + 0.059,
        consoleZ - 0.23,
        0.09,
        0.046,
        0.111,
      );
      line(
        g,
        m.darkMetal,
        [0, consoleY + 0.05, consoleZ - 0.23],
        [0, consoleY + 0.143, consoleZ - (van ? 0.295 : 0.205)],
        0.025,
      );
      ell(
        g,
        m.leather,
        0,
        consoleY + 0.149,
        consoleZ - (van ? 0.295 : 0.205),
        0.042,
        0.028,
        0.034,
      );
      for (const zz of [-0.04, 0.145]) {
        box(
          g,
          m.grille,
          0,
          consoleY + 0.013,
          consoleZ + zz,
          0.119,
          0.06,
          0.123,
        );
        box(
          g,
          m.leather,
          0,
          consoleY + 0.044,
          consoleZ + zz,
          0.081,
          0.011,
          0.085,
        );
      }
      // Climate controls and vents face the front seats, not the windshield.
      const dashSkin = standard(sport ? 0x404652 : van ? 0x414c4e : 0x554b43, {
        roughness: 0.85,
      });
      const capY = belt + (van ? 0.083 : 0.013);
      box(
        g,
        dashSkin,
        0,
        capY,
        dashZ,
        width * 0.817,
        van ? 0.2 : 0.071,
        Math.abs(front * d - wheelZ) + 0.084,
      );
      box(
        g,
        m.under,
        x + 0.085,
        belt + (van ? 0.17 : 0.064),
        wheelZ - 0.208,
        van ? 0.57 : 0.5,
        van ? 0.31 : 0.16,
        van ? 0.235 : 0.12,
      );
      box(
        g,
        piping,
        width * 0.247,
        capY - 0.047,
        trimZ - 0.019,
        width * 0.29,
        0.012,
        0.021,
      );
      const ventY = belt + (van ? 0.135 : 0.012);
      for (const [vx, ww] of [
        [-width * 0.352, 0.121],
        [0.065, 0.22],
        [width * 0.325, 0.147],
      ]) {
        box(g, m.grille, vx, ventY, trimZ - 0.087, ww + 0.028, 0.075, 0.132);
        for (let i = -1; i <= 1; i++)
          box(
            g,
            m.darkMetal,
            vx,
            ventY + i * 0.019,
            trimZ - 0.015,
            ww,
            0.007,
            0.031,
          );
      }
      box(g, m.grille, 0.064, ventY - 0.089, trimZ - 0.029, 0.258, 0.073, 0.06);
      box(
        g,
        standard(sport ? 0xa85443 : van ? 0x5e8558 : 0xab7847, {
          emissive: 0xbd9169,
          emissiveIntensity: 0.3,
        }),
        0.064,
        ventY - 0.079,
        trimZ + 0.003,
        0.117,
        0.022,
        0.009,
      );
      for (const s of [-1, 1])
        box(
          g,
          m.darkMetal,
          0.064 + s * 0.1,
          ventY - 0.093,
          trimZ + 0.006,
          0.031,
          0.029,
          0.023,
        );
      const mirrorY = (roofY - 0.078) * height,
        mirrorZ = topF * d + 0.075;
      box(g, m.leather, 0, mirrorY + 0.046, mirrorZ - 0.019, 0.029, 0.09, 0.05);
      box(g, m.grille, 0, mirrorY, mirrorZ + 0.006, 0.247, 0.066, 0.035);
      box(
        g,
        standard(0x8a9b9b, {
          metalness: 0.54,
          roughness: 0.35,
          emissive: 0x324047,
          emissiveIntensity: 0.24,
        }),
        0,
        mirrorY,
        mirrorZ + 0.026,
        0.219,
        0.044,
        0.008,
      );
      box(
        g,
        m.leather,
        0,
        (roofY - 0.01) * height,
        (topF + back - 0.17) * d * 0.5,
        width * (van ? 0.82 : 0.66),
        0.023,
        (back - 0.17 - topF) * d,
      );
    }
    return {
      x,
      y,
      z,
      crown,
      wheelY,
      wheelZ,
      radius,
      belt,
      eyeY: van ? y + 0.037 : Math.min(y + 0.052, (roofY - 0.073) * height),
      eyeZ: z + (van ? 0.105 : 0.057),
    };
  }
  cockpit(body, spec, seat) {
    const { x, wheelY, wheelZ, radius, belt } = seat,
      m = this.common,
      van = spec.type === "van",
      sport = spec.type === "sport";
    const tilt = group(body, x, wheelY, wheelZ);
    tilt.rotation.x = -0.34;
    const wheel = group(tilt),
      a = group(null);
    wheel.name = "Volant";
    mesh(a, steeringRim, m.leather).scale.setScalar(radius);
    for (const angle of [0.2, Math.PI - 0.2, Math.PI * 1.5]) {
      const sx = Math.cos(angle) * radius * 0.93,
        sy = Math.sin(angle) * radius * 0.93;
      line(
        a,
        sport ? m.darkMetal : m.seat,
        [0, 0, 0],
        [sx, sy, 0],
        0.023,
        0.028,
      );
    }
    box(a, m.seat, 0, 0, 0.014, 0.09, 0.087, 0.049);
    box(a, m.piping, 0, 0.006, 0.042, 0.032, 0.013, 0.005);
    wheel.add(colorBatch(a, this.carBodyBatch));

    // Separate lightweight grip meshes: keep the fully posed driver for the
    // exterior, but never put a head/neck or torso in front of the cockpit eye.
    const grip = group(wheel),
      hands = group(null),
      sleeves = group(null),
      skin = standard(0xba8063, {
        emissive: 0x775144,
        emissiveIntensity: 0.18,
      }),
      sleeve = standard(clothColors.ruste[0], {
        emissive: 0x513d33,
        emissiveIntensity: 0.15,
      });
    grip.name = "Mains de Noa";
    for (const side of [-1, 1]) {
      const hx = side * radius * 0.96,
        hy = radius * 0.24;
      line(
        sleeves,
        m.seat,
        [hx + side * 0.008, hy - 0.028, 0.047],
        [hx + side * 0.099, hy - 0.235, 0.255],
        0.069,
        0.065,
      );
      ell(
        hands,
        skin,
        hx + side * 0.014,
        hy,
        0.024,
        0.034,
        0.039,
        0.031,
      ).rotation.z = side * -0.18;
      for (let finger = 0; finger < 3; finger++) {
        const knuckle = ell(
          hands,
          skin,
          hx + side * (0.028 - finger * 0.0135),
          hy + 0.025 - finger * 0.0037,
          0.047,
          0.0105,
          0.019,
          0.015,
        );
        knuckle.rotation.x = -0.39;
        knuckle.rotation.z = -side * 0.18;
      }
      ell(
        hands,
        skin,
        hx - side * 0.016,
        hy + 0.021,
        -0.011,
        0.024,
        0.036,
        0.026,
      );
    }
    for (const piece of sleeves.children) piece.material = sleeve;
    flatten(sleeves, grip, false);
    grip.add(colorBatch(hands, this.driverBatch));
    grip.visible = false;

    let art = this.instruments.get(spec.type);
    if (!art) {
      art = instrumentFace(spec);
      this.instruments.set(spec.type, art);
    }
    const panel = group(
        body,
        x + 0.102,
        belt + (van ? 0.3 : 0.078),
        wheelZ - (van ? 0.097 : 0.138),
      ),
      w = van ? 0.514 : 0.444,
      h = van ? 0.168 : 0.126;
    panel.name = "Instruments · compteur de vitesse";
    panel.rotation.x = -0.19;
    box(panel, m.seat, 0, 0, -0.027, w + 0.058, h + 0.038, 0.07);
    const face = group(panel),
      naturalHeight = w * art.ratio;
    face.scale.y = h / naturalHeight;
    mesh(face, flat, art.face, 0, 0, 0.012).scale.set(w, naturalHeight, 1);
    const needle = group(face, w * art.u, naturalHeight * art.v, 0.023),
      l = w * art.needle;
    const pointer = new T.MeshBasicMaterial({
      color: sport ? 0xf69065 : 0xffc781,
    });
    box(needle, pointer, l * 0.43, 0, 0, l * 1.13, 0.0035, 0.004);
    ell(needle, m.darkMetal, 0, 0, 0.002, 0.008, 0.008, 0.004);
    needle.rotation.z = -DIAL_START;
    return { wheel, panel, needle, max: art.max, grip, sleeve };
  }
  occupy(model, look) {
    if (model.look === look) return;
    model.look = look;
    model.driver?.removeFromParent();
    model.driver = null;
    if (!look) return;
    const { seat } = model,
      { hue, style, hero } = look,
      key = `${model.shape}:${style}:${hue}:${!!hero}`;
    if (hero && model.cockpit)
      model.cockpit.sleeve.color.setHex(clothColors[style][0]);
    if (!this.drivers.has(key)) {
      const a = group(null),
        skin = standard(hero ? 0xba8063 : skinTones[hue]),
        hair = standard(hairTones[hue]),
        coat = standard(clothColors[style][0]),
        trim = standard(clothColors[style][1]),
        k = seat.crown,
        shoulder = -k - 0.09,
        oval = (m, x, y, z, w, h, d) => {
          const o = mesh(a, driverOval, m, x, y, z);
          o.scale.set(w, h, d);
          return o;
        };
      oval(coat, 0, shoulder - 0.061, 0.03, 0.176, 0.211, 0.102).rotation.x =
        -0.15;
      oval(trim, 0, -k - 0.058, 0.019, 0.088, 0.051, 0.079);
      oval(skin, 0, -k - 0.015, 0.006, 0.056, 0.082, 0.055);
      oval(skin, 0, 0, 0, 0.086, k, 0.091);
      oval(hair, 0, k * 0.55, 0.026, 0.089, k * 0.55, 0.084);
      oval(skin, 0, -k * 0.085, -0.083, 0.023, 0.025, 0.032);
      for (const s of [-1, 1]) {
        oval(skin, s * 0.079, -k * 0.11, 0.012, 0.025, 0.037, 0.024);
        box(
          a,
          this.common.leather,
          s * 0.036,
          k * 0.16,
          -0.081,
          0.028,
          0.011,
          0.011,
        );
        const handY = seat.wheelY - seat.y + 0.044,
          handZ = seat.wheelZ - seat.z + 0.014;
        const elbow = [
          s * 0.148,
          Math.min(shoulder - 0.125, handY - 0.07),
          -0.153,
        ];
        line(a, coat, [s * 0.134, shoulder, -0.004], elbow, 0.102, 0.097);
        line(a, coat, elbow, [s * 0.147, handY, handZ + 0.043], 0.077, 0.077);
        oval(skin, s * 0.147, handY, handZ, 0.036, 0.039, 0.045);
      }
      this.drivers.set(key, colorBatch(a, this.driverBatch).geometry);
    }
    const driver = mesh(
      model.body,
      this.drivers.get(key),
      this.driverBatch,
      seat.x,
      seat.y,
      seat.z,
    );
    driver.name = hero ? "Noa · au volant" : "Conducteur · au volant";
    model.driver = driver;
  }
  vehicle(spec, { detail = true, patrol = false } = {}) {
    const shape = `${spec.type}:${spec.width}:${spec.length}:${spec.height}`,
      key = `${shape}:${spec.accent}`;
    if (!detail && this.lowCars.has(key)) {
      const template = this.lowCars.get(key),
        parent = group(null),
        body = template.body.clone();
      parent.add(body);
      const contact = this.shadow(
        parent,
        0,
        0,
        spec.width * 1.99,
        spec.length * 1.32,
      );
      return {
        root: parent,
        body,
        wheels: [],
        doors: [],
        lamps: [],
        contact,
        seat: template.seat,
        shape,
      };
    }
    const m = this.common,
      root = group(null),
      body = group(root),
      staticG = group(null),
      glazing = detail ? windshield(this.glassWeather) : m.glass,
      paint = this.paint(spec.accent),
      h = spec.height,
      d = spec.length * 0.5,
      w = spec.width * 0.5,
      van = spec.type === "van",
      sport = spec.type === "sport",
      sedan = spec.type === "sedan" || patrol;
    const bb = (p, x, y, z, W, H, D) =>
      box(staticG, p, x * w, y * h, z * d, W * w, H * h, D * d);
    const t = (arr) => arr.map(([x, y, z]) => [x * w, y * h, z * d]);
    const front = van ? -0.54 : sport ? -0.48 : -0.42,
      topF = van ? -0.34 : sport ? -0.13 : -0.12,
      topB = van ? 0.79 : sedan ? 0.36 : sport ? 0.34 : 0.325,
      back = van ? 0.94 : sedan ? 0.62 : sport ? 0.74 : 0.819;
    const base = van ? 0.475 : 0.682,
      roofY = van ? 0.971 : 0.965,
      wx = van ? 0.914 : 0.867,
      tx = van ? 0.87 : sport ? 0.711 : 0.696;
    const heights = [
      [-0.995, 0.82, 0.285, 0.59],
      [-0.93, 0.934, 0.205, 0.64],
      [-0.66, 1, 0.215, 0.677],
      [-0.37, 0.957, 0.19, 0.69],
      [0.27, 0.981, 0.17, 0.68],
      [0.61, 1, 0.19, 0.684],
      [0.92, 0.97, 0.24, 0.65],
      [0.997, 0.87, 0.31, 0.61],
    ];
    // Remove only the top skin under the cabin; the side bodywork and the
    // metal bonnet remain intact. Interpolate rings at the two glazing seams.
    if (detail)
      for (const at of [front, back]) {
        const hi = heights.findIndex(([z]) => z > at);
        const a = heights[hi - 1],
          b = heights[hi],
          f = (at - a[0]) / (b[0] - a[0]);
        heights.splice(
          hi,
          0,
          a.map((value, i) => (i ? lerp(value, b[i], f) : at)),
        );
      }
    const lowRings = heights.map(([z, x, b, yy]) => {
      const y = van ? Math.min(0.66, yy - 0.175) : sport ? yy - 0.017 : yy;
      return t([
        [-x * 0.9, b, z],
        [-x, 0.36 - (van ? 0.05 : 0), z],
        [-x * 0.97, y - 0.06, z],
        [-x * 0.81, y, z],
        [x * 0.81, y, z],
        [x * 0.97, y - 0.06, z],
        [x, 0.36 - (van ? 0.05 : 0), z],
        [x * 0.9, b, z],
      ]);
    });
    mesh(
      staticG,
      shell(
        lowRings,
        true,
        detail
          ? (i, j) =>
              j === 3 && heights[i][0] >= front && heights[i + 1][0] <= back
          : null,
      ),
      paint,
    );
    bb(m.under, 0, 0.234, 0, 1.72, 0.095, 1.65);
    const seat = this.cabin(
      staticG,
      spec,
      { front, topF, base, roofY, back },
      detail,
    );
    const doorWindows = [],
      pillarB = van ? 0.145 : 0.28,
      pillarT = van ? 0.092 : 0.201;
    const roof = (p) => t(p);
    faceted(
      staticG,
      glazing,
      roof([
        [-wx, base, front],
        [wx, base, front],
        [tx, roofY - 0.016, topF],
        [-tx, roofY - 0.016, topF],
      ]),
    );
    faceted(
      staticG,
      glazing,
      roof([
        [wx, base, back],
        [-wx, base, back],
        [-tx, roofY - 0.015, topB],
        [tx, roofY - 0.015, topB],
      ]),
    );
    const surf = [
      [
        [-tx, roofY, topF],
        [tx, roofY, topF],
        [tx * 0.99, roofY, topB],
        [-tx * 0.99, roofY, topB],
      ],
      [
        [-tx, roofY, topF],
        [-tx * 0.99, roofY, topB],
        [-tx * 0.99, roofY - 0.042, topB],
        [-tx, roofY - 0.042, topF],
      ],
      [
        [tx * 0.99, roofY, topB],
        [tx, roofY, topF],
        [tx, roofY - 0.042, topF],
        [tx * 0.99, roofY - 0.042, topB],
      ],
    ];
    surf.forEach((p) => faceted(staticG, paint, roof(p)));
    const rail = (p, a, b, f = 0.041) =>
      line(staticG, p, t([a])[0], t([b])[0], f, f);
    for (const s of [-1, 1]) {
      const frontSill = [s * wx, base, front],
        frontRoof = [s * tx, roofY - 0.031, topF],
        rearRoof = [s * tx * 0.99, roofY - 0.031, topB],
        midRoof = [s * tx, roofY - 0.031, pillarT],
        midSill = [s * wx, base, pillarB],
        frontPane = roof([frontSill, midSill, midRoof, frontRoof]);
      if (detail) doorWindows.push(frontPane);
      else faceted(staticG, glazing, frontPane);
      faceted(
        staticG,
        van ? paint : glazing,
        roof([midSill, [s * wx, base, back], rearRoof, midRoof]),
      );
      rail(paint, [s * wx, base, front], [s * tx, roofY - 0.013, topF], 0.089);
      rail(
        paint,
        [s * wx, base, back],
        [s * tx * 0.99, roofY - 0.018, topB],
        van ? 0.105 : 0.094,
      );
      rail(
        m.under,
        [s * (wx + 0.012), base - 0.01, front],
        [s * (wx + 0.012), base - 0.01, back],
        0.039,
      );
      rail(m.under, midSill, midRoof, 0.064);
      bb(m.grille, s * 0.986, 0.397, 0, 0.029, 0.038, 1.56);
      bb(
        m.under,
        s * (wx + 0.091),
        base + 0.031,
        front + 0.13,
        0.202,
        0.059,
        0.127,
      );
      bb(
        paint,
        s * (wx + 0.162),
        base + 0.06,
        front + 0.126,
        0.174,
        0.099,
        0.155,
      );
      bb(
        m.darkMetal,
        s * (wx + 0.166),
        base + 0.06,
        front + 0.207,
        0.139,
        0.069,
        0.008,
      );
      bb(m.signal, s * 0.934, van ? 0.335 : 0.49, -0.85, 0.045, 0.045, 0.091);
    }
    // Stacked fascia, inset reflectors, split grille and trim make each end readable.
    const y = van ? 0.39 : 0.525;
    bb(m.grille, 0, y, -0.998, 1.56, 0.111, 0.043);
    bb(m.darkMetal, 0, y + 0.061, -1.016, 1.57, 0.019, 0.031);
    bb(m.under, 0, y - 0.185, -0.981, 1.86, 0.102, 0.122);
    bb(m.frontTrim, 0, y - 0.197, -1.043, 1.81, 0.019, 0.028);
    for (let j = 0; j < 3; j++)
      bb(m.metal, 0, y - 0.024 + j * 0.025, -1.023, 0.713, 0.008, 0.014);
    for (const s of [-1, 1]) {
      bb(
        m.head,
        s * 0.642,
        y + 0.004,
        -1.023,
        van ? 0.38 : 0.35,
        van ? 0.095 : 0.076,
        0.033,
      );
      bb(m.signal, s * 0.831, y - 0.014, -1.015, 0.079, 0.055, 0.025);
      bb(m.tail, s * 0.648, y + 0.026, 1.012, 0.46, 0.079, 0.033);
      bb(m.signal, s * 0.648, y + 0.078, 1.01, 0.44, 0.03, 0.034);
      bb(m.frontTrim, s * 0.59, y - 0.05, 1.011, 0.527, 0.012, 0.027);
      bb(m.white, s * 0.338, y + 0.029, 1.015, 0.093, 0.046, 0.026);
    }
    bb(m.under, 0, y - 0.074, 1.003, 1.79, 0.106, 0.087);
    bb(m.frontTrim, 0, y - 0.109, 1.051, 1.72, 0.02, 0.023);
    bb(m.darkMetal, 0, y - 0.129, 1.043, 0.42, 0.111, 0.027);
    bb(m.plate, 0, y - 0.131, 1.058, 0.365, 0.072, 0.01);
    bb(m.under, 0, y - 0.109, -1.058, 0.405, 0.066, 0.025);
    bb(m.plate, 0, y - 0.108, -1.074, 0.353, 0.056, 0.009);
    if (sport) bb(paint, 0, 0.713, 0.855, 1.68, 0.038, 0.197);
    if (detail) {
      if (!van)
        for (const s of [-1, 1])
          for (let j = 0; j < 6; j++)
            bb(m.under, s * 0.215, 0.68, -0.73 + j * 0.031, 0.17, 0.01, 0.011);
      for (const s of [-1, 1])
        rail(
          m.under,
          [s * 0.01, base + 0.038, front + 0.058],
          [s * 0.65, base + 0.034, front + 0.053],
          0.019,
        );
      const tailpipe = cyl(
        staticG,
        m.darkMetal,
        0.57 * w,
        0.212 * h,
        d * 1.017,
        0.069,
        0.073,
        0.164,
        12,
      );
      tailpipe.rotation.x = Math.PI * 0.5;
    }
    const doors = [],
      wheels = [],
      lamps = [];
    if (detail) {
      for (const s of [-1, 1]) {
        const p = group(
            body,
            s * w * 0.976,
            h * (van ? 0.36 : 0.457),
            -d * 0.38,
          ),
          a = group(null),
          wide = d * (van ? 0.77 : 0.68);
        const door = box(
          a,
          paint,
          s * 0.001,
          0.047,
          wide * 0.49,
          0.047,
          h * (van ? 0.22 : 0.237),
          wide,
        );
        door.rotation.x = s * 0.013;
        box(
          a,
          m.under,
          s * 0.02,
          -h * 0.086,
          wide * 0.47,
          0.021,
          0.027,
          wide * 0.93,
        );
        box(
          a,
          m.frontTrim,
          s * 0.04,
          h * 0.125,
          wide * 0.76,
          0.027,
          0.022,
          wide * 0.14,
        );
        box(
          a,
          m.grille,
          s * 0.028,
          0.045,
          wide * 0.991,
          0.011,
          h * 0.183,
          0.02,
        );
        // Lined inner door panels, including pull handle and map pocket.
        const y = h * (van ? 0.097 : 0.139),
          z = wide * 0.45;
        box(
          a,
          m.leather,
          -s * w * 0.151,
          y - 0.114,
          z,
          0.141,
          0.323,
          wide * 0.92,
        );
        box(
          a,
          m.seat,
          -s * w * 0.228,
          y - 0.066,
          z + 0.06,
          0.065,
          0.085,
          wide * 0.71,
        );
        box(
          a,
          m.darkMetal,
          -s * w * 0.245,
          y + 0.018,
          z - 0.184,
          0.022,
          0.032,
          0.149,
        );
        box(
          a,
          m.piping,
          -s * w * 0.229,
          y + 0.038,
          z + wide * 0.055,
          0.015,
          0.013,
          wide * 0.61,
        );
        box(
          a,
          m.grille,
          -s * w * 0.234,
          y - 0.207,
          z - 0.03,
          0.035,
          0.138,
          wide * 0.56,
        );
        faceted(
          a,
          glazing,
          doorWindows[doors.length].map(([x, y, z]) => [
            x - p.position.x,
            y - p.position.y,
            z - p.position.z,
          ]),
        );
        labelDoor(a, p, paint, glazing, this.carBodyBatch);
        doors.push(p);
      }
    } else {
      for (const s of [-1, 1])
        bb(
          m.frontTrim,
          s * 0.99,
          0.545,
          sedan ? 0.298 : 0.246,
          0.021,
          0.03,
          0.12,
        );
    }
    const radius = van ? 0.347 : sport ? 0.337 : 0.349,
      wid = van ? 0.199 : sport ? 0.23 : 0.184;
    for (const s of [-1, 1])
      for (const z of [-0.595, 0.615]) {
        const x = s * (w - wid * 0.335),
          zz = z * d;
        if (detail) {
          const pivot = group(root, x, radius, zz),
            spin = group(pivot);
          this.wheel(spin, s, radius, wid, true);
          wheels.push({ pivot, spin, front: z < 0 });
        } else {
          const dummy = group(staticG, x, radius, zz),
            g = group(null);
          const o = cyl(g, m.tire, 0, 0, 0, radius, radius, wid, 13);
          o.rotation.z = Math.PI * 0.5;
          const q = cyl(
            g,
            m.metal,
            s * wid * 0.53,
            0,
            0,
            radius * 0.665,
            radius * 0.665,
            0.027,
            12,
          );
          q.rotation.z = Math.PI * 0.5;
          const cap = cyl(
            g,
            m.darkMetal,
            s * wid * 0.61,
            0,
            0,
            radius * 0.345,
            radius * 0.345,
            0.02,
            10,
          );
          cap.rotation.z = Math.PI * 0.5;
          dummy.add(g);
        }
      }
    if (patrol) {
      bb(m.under, 0, 1.003, topF + 0.17, 1.37, 0.068, 0.185);
      bb(m.wash, 0, 0.515, -0.12, 1.994, 0.129, 0.71);
      for (const s of [-1, 1]) {
        const color = s < 0 ? 0x397be9 : 0xe1664f,
          mat = standard(color, {
            emissive: color,
            emissiveIntensity: 0.56,
            roughness: 0.3,
          });
        const lit = box(
          body,
          mat,
          s * 0.357 * w,
          1.069 * h,
          (topF + 0.17) * d,
          0.68 * w,
          0.071 * h,
          0.164 * d,
        );
        lamps.push(lit);
      }
    }
    const built = group(body);
    let rearLights = null;
    if (detail) {
      const trim = group(null),
        distinct = new Set([paint, glazing, m.tail, m.head, m.signal]);
      const accent = group(null);
      for (const o of [...staticG.children])
        (distinct.has(o.material) ? accent : trim).add(o);
      const baking = colorBatch(trim, this.carBodyBatch);
      baking.castShadow = true;
      built.add(baking);
      flatten(accent, built, true);
      for (const o of built.children)
        if (o.material === glazing) o.castShadow = false;
      rearLights = built.children.find((o) => o.material === m.tail);
      if (rearLights) rearLights.material = m.tail.clone();
    } else {
      // Keep the opaque cabin in the body batch and submit all the panes together.
      const optics = [m.head, m.tail, m.signal],
        glass = group(null);
      for (const o of [...staticG.children])
        if (o.material === glazing) glass.add(o);
      flatten(glass, built, false);
      built.add(
        colorBatch(staticG, this.proxyMat, (o) => optics.includes(o.material)),
      );
      const a = group(null);
      for (const o of staticG.children)
        if (o.isMesh && optics.includes(o.material)) {
          const x = o.clone();
          x.material = {
            color: o.material.color
              .clone()
              .lerp(o.material.emissive, 0.66)
              .multiplyScalar(1.28),
          };
          a.add(x);
        }
      built.add(colorBatch(a, this.opticsBatch));
      this.lowCars.set(key, { body: body.clone(), seat });
    }
    const cockpit = detail ? this.cockpit(body, spec, seat) : null;
    const dents = [];
    if (detail && !patrol)
      for (const mo of built.children)
        if (
          mo.material === paint ||
          mo.material === m.under ||
          mo.material === m.frontTrim
        ) {
          const data = mo.geometry.attributes.position;
          dents.push([mo.geometry, data, new Float32Array(data.array)]);
        }
    const scuff = detail && !patrol ? this.scratch(body, w, d, h) : null;
    const contact = this.shadow(
      root,
      0,
      0,
      spec.width * 1.99,
      spec.length * 1.31,
    );
    return {
      root,
      body,
      wheels,
      doors,
      lamps,
      dents,
      scuff,
      w,
      d,
      contact,
      rearLights,
      cockpit,
      glazing,
      seat,
      shape,
    };
  }
  scratch(body, w, d, h) {
    const g = group(null),
      mat = standard(0x969b8e, { roughness: 0.94 });
    for (let i = 0; i < 6; i++) {
      const ox = (i % 3) * 0.125,
        x = (0.53 + ox) * w,
        y = (0.5 + (i % 2) * 0.029 - i * 0.015) * h,
        z = -d * (i < 3 ? 1.05 : 1.028);
      line(
        g,
        mat,
        [x, y, z],
        [x + 0.09 + 0.027 * (i % 2), y + 0.011, z + 0.001],
        0.007 + (i % 2) * 0.007,
        0.008,
      );
    }
    const scuff = group(body);
    flatten(g, scuff, false);
    scuff.visible = false;
    return scuff;
  }
  person(style = "ruste", { hero = false, hue = 0, scale = 1 } = {}) {
    const skin = standard(
        style === "ines"
          ? 0x8d614d
          : hero
            ? 0xba8063
            : skinTones[hue % skinTones.length],
        { roughness: 0.84 },
      ),
      hair = standard(
        style === "ines"
          ? 0x191d1e
          : style === "aya"
            ? 0x322421
            : hairTones[hue % hairTones.length],
      ),
      hairL = standard(
        [0x322b23, 0x39312f, 0x442f26, 0x342a26, 0x7e5b40][hue % 5],
      ),
      eyes = standard(0x2c2928),
      lips = standard(hue === 3 ? 0x814d43 : 0x915c51),
      pants = standard([0x2c3336, 0x444645, 0x292f36][hue % 3], {
        roughness: 0.97,
      }),
      seam = standard(0x383b39);
    const root = group(null),
      pelvis = bone(root, 0, 0.938, 0),
      torso = bone(pelvis),
      chest = bone(torso, 0, 0.09, 0),
      head = bone(chest, 0, 0.421, -0.018);
    const contact = this.shadow(root, 0, 0, 0.94, 0.66, hero);
    const coat = standard((clothColors[style] || clothColors.ruste)[0], {
        roughness: 0.91,
      }),
      fold = standard((clothColors[style] || clothColors.ruste)[1]);
    const a = group(null),
      band = hero
        ? standard(0xc8b594)
        : style === "guard"
          ? standard(0x84999d)
          : fold;
    ell(a, pants, 0, 0.009, 0.003, 0.174, 0.133, 0.12);
    flatten(a, pelvis, hero);
    const g = group(null);
    mesh(
      g,
      shell(
        ringsY([
          [-0.079, 0.15, 0.095],
          [-0.037, 0.178, 0.11],
          [0.071, 0.168, 0.111],
          [0.189, 0.18, 0.117],
          [0.274, 0.205, 0.108],
          [0.327, 0.188, 0.104],
          [0.36, 0.131, 0.088],
          [0.386, 0.077, 0.07],
        ]),
      ),
      coat,
    );
    mesh(
      g,
      shell(
        ringsY([
          [-0.081, 0.151, 0.097],
          [-0.043, 0.179, 0.112],
          [-0.03, 0.18, 0.113],
        ]),
      ),
      fold,
    );
    cyl(g, fold, 0, 0.385, -0.007, 0.083, 0.112, 0.062, 18);
    if (style === "aya") {
      const scarf = standard(0x726c7b);
      const loop = ell(g, scarf, 0, 0.379, -0.02, 0.09, 0.056, 0.084);
      loop.rotation.z = 0.21;
      line(
        g,
        scarf,
        [-0.025, 0.388, -0.091],
        [0.044, 0.16, -0.124],
        0.06,
        0.026,
      );
      line(
        g,
        standard(0xb6a2a2),
        [0.006, 0.294, -0.111],
        [0.045, 0.172, -0.138],
        0.011,
        0.006,
      );
    } else if (style === "dock") {
      const highVis = standard(0xbba766, { roughness: 0.76 });
      for (const y of [0.04, 0.084])
        for (const side of [-1, 1])
          line(
            g,
            highVis,
            [0, y, side * 0.117],
            [side * 0.161, y, side * 0.071],
            0.026,
            0.018,
          );
      box(g, this.common.darkMetal, -0.098, 0.196, -0.126, 0.096, 0.086, 0.028);
      box(g, this.detail, -0.098, 0.218, -0.146, 0.084, 0.019, 0.012);
    } else if (style === "messenger") {
      const leather = this.common.leather;
      line(
        g,
        leather,
        [0.105, 0.336, -0.098],
        [-0.14, 0.071, -0.118],
        0.039,
        0.021,
      );
      const satchel = box(
        g,
        leather,
        -0.114,
        -0.005,
        0.139,
        0.274,
        0.283,
        0.146,
      );
      satchel.rotation.z = 0.19;
      box(g, fold, -0.119, 0.048, 0.22, 0.25, 0.139, 0.026).rotation.z = 0.19;
      box(g, this.detail, -0.124, 0.007, 0.236, 0.046, 0.043, 0.01);
    } else if (style === "salome") {
      // Workshop apron, pockets and ruled pencil; baked into the existing skin batches.
      box(g, fold, 0, 0.11, -0.104, 0.286, 0.34, 0.046);
      box(g, this.common.leather, -0.058, 0.12, -0.136, 0.14, 0.113, 0.017);
      line(
        g,
        standard(0xc29563),
        [-0.074, 0.126, -0.151],
        [-0.081, 0.244, -0.151],
        0.014,
        0.012,
      );
      for (const s of [-1, 1])
        line(
          g,
          fold,
          [s * 0.06, 0.237, -0.13],
          [s * 0.074, 0.378, -0.066],
          0.031,
          0.018,
        );
    } else if (style === "ines") {
      box(g, fold, -0.102, 0.183, -0.119, 0.093, 0.091, 0.02);
      box(g, this.detail, -0.115, 0.214, -0.132, 0.074, 0.022, 0.004);
      box(g, this.common.darkMetal, -0.067, 0.215, -0.134, 0.016, 0.015, 0.006);
    }
    cyl(g, skin, 0, 0.403, -0.016, 0.059, 0.065, 0.104, 12);
    line(g, fold, [0, -0.044, -0.111], [0, 0.346, -0.101], 0.018, 0.016);
    line(g, this.detail, [0, 0.087, -0.124], [0, 0.136, -0.125], 0.013, 0.008);
    for (const s of [-1, 1]) {
      const shoulder = ell(
        g,
        coat,
        s * 0.166,
        0.256,
        0.019,
        0.039,
        0.062,
        0.091,
      );
      shoulder.rotation.z = s * 0.26;
      line(g, band, [0, 0.255, 0.121], [s * 0.14, 0.246, 0.105], 0.011, 0.011);
      line(
        g,
        band,
        [s * 0.14, 0.246, 0.105],
        [s * 0.19, 0.249, 0.073],
        0.011,
        0.011,
      );
      line(
        g,
        fold,
        [s * 0.057, 0.113, -0.122],
        [s * 0.143, 0.096, -0.101],
        0.015,
        0.01,
      );
      line(
        g,
        fold,
        [s * 0.069, 0.222, -0.124],
        [s * 0.148, 0.218, -0.101],
        0.011,
        0.012,
      );
    }
    const tag = box(
      g,
      hero ? this.detail : fold,
      -0.11,
      0.2,
      -0.12,
      0.054,
      0.026,
      0.012,
    );
    tag.rotation.y = 0.12;
    flatten(g, chest, hero);
    const h = group(null),
      main = hero || style === "ines" || style === "aya" || style === "salome";
    const shape = style === "ines" ? 1.07 : style === "aya" ? 0.93 : 1;
    const jaw = bone(head, 0, 0.072, -0.084);
    const lids = [],
      brows = [];
    if (main) {
      const face = [
        [0.015, 0.033, 0.026, 0, -0.022],
        [0.031, 0.057, 0.047, 0, -0.026],
        [0.075, 0.077, 0.076, 0, -0.009],
        [0.114, 0.087, 0.09, 0, 0.001],
        [0.155, 0.088, 0.088, 0, 0.001],
        [0.19, 0.087, 0.083, 0, 0.004],
        [0.222, 0.073, 0.077, 0, 0.009],
        [0.243, 0.048, 0.057, 0, 0.007],
        [0.254, 0.009, 0.013, 0, 0.004],
      ];
      mesh(
        h,
        shell(
          ringsY(
            face.map(([y, x, z, o, p]) => [y, x * shape, z, o, p]),
            18,
          ),
        ),
        skin,
      );
      ell(h, skin, 0, 0.121, -0.085, 0.014, 0.028, 0.021).rotation.x = 0.14;
      ell(
        h,
        skin,
        0,
        0.106,
        -0.098,
        0.017,
        0.011,
        style === "aya" ? 0.014 : 0.016,
      );
      const mouth = group(null);
      ell(mouth, lips, 0, 0.002, -0.003, 0.025 * shape, 0.0059, 0.008);
      ell(
        mouth,
        standard(0x35202a),
        0,
        -0.0003,
        -0.0081,
        0.0195 * shape,
        0.002,
        0.004,
      );
      flatten(mouth, jaw, hero);
      const eyeWhite = standard(0xa19d93),
        iris = standard(
          style === "aya" ? 0x4e6b68 : style === "ines" ? 0x493e2e : 0x4e392e,
        ),
        glint = standard(0xc6bfb3),
        metal = standard(style === "aya" ? 0xbfc8c2 : 0xb88451);
      for (const side of [-1, 1]) {
        ell(h, skin, side * 0.085 * shape, 0.112, 0.005, 0.016, 0.025, 0.018);
        if (!hero)
          ell(
            h,
            metal,
            side * 0.094 * shape,
            0.091,
            -0.002,
            0.008,
            0.009,
            0.007,
          );
        const x = side * 0.034 * shape;
        const lid = bone(head, x, 0.142, -0.079);
        const eye = group(null);
        ell(eye, lips, 0, 0, -0.002, 0.0165, 0.0065, 0.006).rotation.z =
          side * 0.06;
        ell(eye, eyeWhite, 0, 0, -0.005, 0.013, 0.0039, 0.006).rotation.z =
          side * 0.06;
        ell(eye, iris, -side * 0.001, 0, -0.012, 0.0079, 0.0047, 0.0029);
        ell(eye, eyes, 0, 0, -0.0153, 0.0037, 0.0039, 0.002);
        ell(eye, glint, -0.0016, 0.0021, -0.0164, 0.0012, 0.0012, 0.0009);
        flatten(eye, lid, hero);
        lids.push(lid);
        const brow = bone(head, x, 0.16, -0.082);
        const arch = group(null);
        ell(
          arch,
          hair,
          0,
          0,
          -0.005,
          style === "ines" ? 0.022 : 0.019,
          0.0039,
          0.0045,
        );
        flatten(arch, brow, hero);
        brows.push(brow);
      }
    } else {
      ell(h, skin, 0, 0.134, -0.008, 0.092, 0.119, 0.091);
      ell(h, skin, 0, 0.077, -0.021, 0.076, 0.069, 0.076);
      ell(h, skin, 0, 0.115, -0.099, 0.019, 0.025, 0.021);
      for (const side of [-1, 1]) {
        ell(h, skin, side * 0.086, 0.11, -0.004, 0.017, 0.026, 0.017);
        ell(h, eyes, side * 0.032, 0.144, -0.089, 0.015, 0.004, 0.005);
      }
    }
    if (main) {
      mesh(h, scalp(style, shape), hair);
      if (style === "aya") {
        for (const side of [-1, 1]) {
          const edge = ell(
            h,
            side < 0 ? hairL : hair,
            side * 0.069,
            0.106,
            0.034,
            0.029,
            0.105,
            0.061,
          );
          edge.rotation.x = 0.3;
          edge.rotation.z = side * 0.22;
        }
        ell(h, hair, 0.019, 0.202, -0.055, 0.064, 0.035, 0.036).rotation.z =
          -0.31;
      } else if (style === "salome") {
        ell(h, hairL, -0.012, 0.178, 0.097, 0.059, 0.058, 0.048);
        for (const s of [-1, 1]) {
          const rim = standard(0x5e584a, { metalness: 0.34 });
          const ring = new T.Mesh(
            new T.TorusGeometry(0.024, 0.0026, 5, 16),
            rim,
          );
          ring.position.set(s * 0.033, 0.143, -0.103);
          ring.scale.y = 0.72;
          ring.rotation.y = -s * 0.08;
          h.add(ring);
          line(
            h,
            rim,
            [s * 0.057, 0.145, -0.106],
            [s * 0.09, 0.149, 0.006],
            0.006,
            0.008,
          );
        }
        box(h, this.common.leather, 0, 0.147, -0.106, 0.024, 0.005, 0.006);
      } else if (hero) {
        ell(h, hair, 0.016, 0.133, 0.109, 0.052, 0.047, 0.051).rotation.z =
          -0.22;
        ell(h, hairL, 0.023, 0.138, 0.132, 0.039, 0.037, 0.035).rotation.z =
          -0.22;
        ell(h, hair, -0.028, 0.199, -0.06, 0.056, 0.033, 0.033).rotation.z =
          0.27;
      }
    } else {
      const cap = ell(h, hair, 0, 0.183, 0.016, 0.096, 0.077, 0.095);
      cap.rotation.x = -0.19;
      ell(h, hair, 0, 0.13, 0.063, 0.086, 0.076, 0.048).rotation.x = -0.28;
      ell(h, hairL, -0.012, 0.221, -0.028, 0.053, 0.037, 0.054).rotation.x =
        -0.42;
    }
    if (style === "dock") {
      ell(h, fold, 0, 0.228, 0.005, 0.106, 0.063, 0.105);
      ell(h, coat, 0, 0.204, -0.008, 0.105, 0.021, 0.114);
    }
    if (style === "guard") {
      ell(h, fold, 0, 0.231, 0, 0.107, 0.045, 0.106);
      ell(h, fold, 0, 0.214, -0.082, 0.096, 0.018, 0.071);
      ell(h, band, 0, 0.223, -0.084, 0.021, 0.015, 0.014);
    }
    flatten(h, head, hero);
    const legs = [],
      arms = [];
    for (const s of [-1, 1]) {
      const footMain = bone(pelvis, s * 0.095, -0.033, 0),
        shin = bone(footMain, s * 0.011, -0.428, -0.012),
        ankle = bone(shin, 0, -0.393, 0.014);
      const thigh = group(null),
        calf = group(null),
        boot = group(null);
      mesh(
        thigh,
        shell(
          ringsY([
            [-0.469, 0.053, 0.064],
            [-0.399, 0.057, 0.068],
            [-0.279, 0.07, 0.077],
            [-0.15, 0.082, 0.088],
            [-0.041, 0.094, 0.106],
            [0.028, 0.079, 0.086],
          ]),
        ),
        pants,
      );
      line(
        thigh,
        seam,
        [s * 0.077, -0.14, 0.006],
        [s * 0.053, -0.409, -0.004],
        0.012,
        0.012,
      );
      mesh(
        calf,
        shell(
          ringsY([
            [-0.405, 0.047, 0.054],
            [-0.358, 0.05, 0.053],
            [-0.178, 0.063, 0.064],
            [-0.052, 0.059, 0.061],
            [0.023, 0.054, 0.061],
          ]),
        ),
        pants,
      );
      ell(boot, this.boot, 0, -0.043, -0.037, 0.062, 0.059, 0.112);
      ell(boot, this.sole, 0, -0.079, -0.044, 0.065, 0.023, 0.113);
      ell(boot, this.boot, 0, 0.018, 0.022, 0.055, 0.054, 0.067);
      flatten(thigh, footMain, hero);
      flatten(calf, shin, hero);
      flatten(boot, ankle, hero);
      footMain.userData.blend = { other: shin, join: -0.376, slope: -16 };
      shin.userData.blend = { other: footMain, join: -0.047, slope: 17 };
      legs.push({ upper: footMain, lower: shin, foot: ankle });
      const shoulder = bone(chest, s * 0.193, 0.263, 0.004),
        elbow = bone(shoulder, s * 0.017, -0.254, 0.006),
        upper = group(null),
        lower = group(null);
      mesh(
        upper,
        shell(
          ringsY([
            [-0.269, 0.049, 0.055],
            [-0.24, 0.052, 0.058],
            [-0.112, 0.068, 0.069],
            [-0.01, 0.074, 0.075],
            [0.049, 0.05, 0.052],
          ]),
        ),
        coat,
      );
      line(
        upper,
        fold,
        [s * 0.055, -0.24, 0.009],
        [s * 0.069, -0.048, 0.015],
        0.013,
        0.012,
      );
      mesh(
        lower,
        shell(
          ringsY([
            [-0.225, 0.036, 0.04],
            [-0.171, 0.041, 0.047],
            [-0.061, 0.051, 0.051],
            [0.02, 0.048, 0.051],
          ]),
        ),
        coat,
      );
      cyl(lower, fold, 0, -0.211, 0, 0.042, 0.038, 0.047, 12);
      ell(lower, skin, 0, -0.258, -0.009, 0.035, 0.071, 0.031);
      ell(lower, skin, -s * 0.023, -0.246, -0.023, 0.015, 0.038, 0.017);
      shoulder.userData.blend = { other: elbow, join: -0.207, slope: -18 };
      elbow.userData.blend = { other: shoulder, join: -0.048, slope: 19 };
      if (style === "aya" && s === -1) {
        const notebook = group(lower, -0.022, -0.278, -0.035);
        notebook.rotation.z = 0.31;
        notebook.rotation.x = -0.33;
        box(notebook, this.common.leather, 0, 0, 0, 0.135, 0.178, 0.021);
        box(
          notebook,
          this.common.plate,
          0.007,
          -0.003,
          -0.004,
          0.12,
          0.161,
          0.014,
        );
        box(notebook, this.common.leather, 0, 0, 0.014, 0.135, 0.178, 0.005);
        box(notebook, this.detail, 0.022, 0.047, 0.019, 0.061, 0.042, 0.004);
      }
      flatten(upper, shoulder, hero);
      flatten(lower, elbow, hero);
      arms.push({ upper: shoulder, lower: elbow, side: s });
    }
    const garment = standard(coat.color.clone(), {
      vertexColors: true,
      roughness: 0.92,
    });
    const model = {
      root,
      pelvis,
      torso,
      chest,
      head,
      legs,
      arms,
      coat,
      fold,
      garment,
      contact,
      jaw,
      lids,
      brows,
      blinkSeed: hero ? 1.3 : style === "aya" ? 2.7 : 0.6,
      mouthOpen: 0,
      motionSpeed: 0,
      bend: 0,
      phase: 0,
      t: 0,
    };
    model.skins = bindHuman(root, coat, fold, this.bodySkin, garment, hero);
    if (!hero)
      model.proxy = walkerProxy(model, this.proxyMat, [
        coat,
        pants,
        skin,
        hair,
        this.boot,
      ]);
    root.scale.setScalar(scale);
    return model;
  }
  outfit(model, key) {
    const preset = clothColors[key] || clothColors.ruste;
    model.coat.color.setHex(preset[0]);
    model.fold.color.setHex(preset[1]);
    model.garment.color.setHex(preset[0]);
  }
}
export function poseHuman(
  o,
  dt,
  speed,
  {
    crouch = false,
    air = false,
    vertical = 0,
    landing = 0,
    gesture = 0,
    headTurn = 0,
    tilt = 0,
    lean = 0,
    bank = 0,
    brow = 0,
    mouth = 0,
    acting = false,
    gaitPhase,
    cue,
  } = {},
) {
  o.t += dt;
  o.motionSpeed = acting ? 0 : lerp(o.motionSpeed, speed, expEase(10, dt));
  speed = o.motionSpeed;
  const v = clamp(speed / 3.2, 0, 1.2),
    run = clamp((speed - 3.25) / 3.25, 0, 1);
  o.bend = lerp(o.bend, crouch ? 1 : 0, acting ? 1 : expEase(10, dt));
  if (gaitPhase !== undefined) o.phase = gaitPhase;
  else if (!air) o.phase = advanceGait(o.phase, speed, dt, crouch) % TAU;
  if (o.proxy?.visible) {
    o.proxy.position.y = Math.cos(o.phase * 2) * v * 0.02;
    o.proxy.rotation.z = Math.sin(o.phase) * v * 0.055;
    return;
  }
  const phase = o.phase,
    b = o.bend,
    s = Math.sin(phase),
    stride = clamp(speed * 0.107, 0, 0.478) * (1 - b * 0.19),
    still = Math.max(0, 1 - v),
    breath = Math.sin(o.t * 2.04),
    bob =
      Math.cos(phase * 2 - 0.5) * 0.015 * v * (1 + run * 0.7) * (1 - b * 0.5),
    tuck = air ? clamp(0.21 - vertical * 0.064, 0.07, 0.52) : 0;
  o.pelvis.position.y =
    0.951 -
    b * 0.235 -
    stride * (0.095 + 0.147 * run) +
    bob +
    breath * 0.005 * still -
    landing * 0.063;
  o.pelvis.rotation.z =
    s * v * 0.041 + still * Math.sin(o.t * 0.96) * 0.018 + bank;
  o.pelvis.rotation.y = s * v * (0.037 + run * 0.041);
  o.torso.rotation.x =
    -b * 0.43 - run * 0.24 - lean - landing * 0.13 - tuck * 0.17;
  o.chest.rotation.y = -s * v * 0.134 + gesture * 0.32;
  o.chest.rotation.z =
    -o.pelvis.rotation.z * 0.7 + gesture * 0.05 + bank * 0.46;
  o.head.rotation.x = 0.027 + b * 0.26 + run * 0.13 + tilt - breath * 0.025;
  o.head.rotation.z = gesture * -0.068 - o.pelvis.rotation.z * 0.34;
  o.mouthOpen = lerp(o.mouthOpen, mouth, expEase(23, dt));
  o.jaw.scale.y = 1 + o.mouthOpen * 1.82;
  o.jaw.position.y = 0.072 - 0.009 * o.mouthOpen;
  o.jaw.position.z = -0.084 + 0.002 * o.mouthOpen;
  if (o.lids.length) {
    const blink = (o.t + o.blinkSeed + Math.sin(o.t * 0.46) * 0.44) % 3.87;
    const lid =
      blink < 0.16 ? 1 - Math.sin((blink * Math.PI) / 0.16) * 0.96 : 1;
    o.lids.forEach((eye) => (eye.scale.y = lid));
    o.brows.forEach((arch, i) => {
      arch.position.y = 0.16 + 0.008 * brow;
      arch.rotation.z = (i ? 1 : -1) * (0.14 - brow * 0.24);
    });
  }
  o.head.rotation.y = lerp(
    o.head.rotation.y,
    headTurn + Math.sin(o.t * 0.81) * 0.072 * still,
    expEase(7.5, dt),
  );
  o.legs.forEach(({ upper, lower, foot }, i) => {
    const angles = gait(
      phase + i * Math.PI,
      stride,
      run,
      b,
      o.pelvis.position.y - 0.033,
    );
    upper.rotation.x = air ? 0.195 + tuck + i * 0.29 : angles[0];
    lower.rotation.x = air ? -0.28 - tuck * 1.32 - i * 0.31 : angles[1];
    foot.rotation.x = air ? 0.18 - tuck * 0.25 : angles[2];
  });
  o.arms.forEach(({ upper, lower, side }, i) => {
    const offer = cue === "paper" || cue === "offer";
    const emphasis = i === 0 ? gesture : gesture * (offer ? 0.61 : 0.17);
    upper.rotation.x = air
      ? 0.31 + tuck
      : -s * stride * 1.21 * side +
        0.04 +
        b * 0.22 +
        emphasis * (offer ? 1.08 : 0.76);
    upper.rotation.y = side * emphasis * (offer ? 0.28 : 0.18);
    upper.rotation.z =
      side * (0.117 + b * 0.073 + emphasis * (offer ? -0.12 : 0.24));
    lower.rotation.x = air
      ? 0.53 + tuck
      : 0.24 + run * 0.79 + b * 0.15 + emphasis * (offer ? 0.81 : 0.46);
    lower.rotation.z = side * emphasis * 0.13;
  });
}
const rideTuning = {
  coupe: [0.051, 0.105, 0.018, 7.2],
  sedan: [0.045, 0.092, 0.014, 7.8],
  sport: [0.038, 0.078, 0.011, 8.9],
  van: [0.071, 0.133, 0.028, 5.8],
};
export function poseVehicle(car, dt, t, level = 0, reduced = false) {
  const m = car.model;
  m.root.position.set(car.x, car.y ?? 0, car.z);
  m.root.rotation.y = -car.heading;
  const speed = car.speed || 0,
    steer = car.steer || 0;
  const [dive, roll, travel, response] =
    rideTuning[car.spec.type] || rideTuning.coupe;
  const lean = clamp(
    (car.yawRate ?? steer * 0.67) * speed * roll * 0.093,
    -roll,
    roll,
  );
  m.body.rotation.z = lerp(m.body.rotation.z, -lean, expEase(response, dt));
  m.body.rotation.x = lerp(
    m.body.rotation.x,
    clamp((car.accelG ?? 0) * -dive, -0.082, 0.082) + car.damage * 0.023,
    expEase(response + 1.3, dt),
  );
  const meters = Math.abs(speed),
    terrain = onRoad(car.x, car.z) ? 0.67 : 1.52;
  m.suspension =
    ((m.suspension || 0) + dt * meters * (terrain > 1 ? 4.25 : 1.9)) % TAU;
  const bounce = reduced
    ? 0
    : (Math.sin(m.suspension) * 0.73 + Math.sin(m.suspension * 2) * 0.27) *
      travel *
      terrain *
      clamp(meters / 13, 0, 1);
  m.body.position.y = lerp(m.body.position.y, bounce, expEase(12, dt));
  if (m.cockpit) {
    const { wheel, needle, max } = m.cockpit;
    wheel.rotation.z = -steer * 0.82;
    needle.rotation.z =
      -DIAL_START - DIAL_SWEEP * clamp((Math.abs(speed) * 3.6) / max, 0, 1);
  }
  if (m.driver) {
    const calm = Math.sin(t * 1.9 + car.x * 0.09);
    m.driver.rotation.y = lerp(
      m.driver.rotation.y,
      -steer * 0.16,
      expEase(5, dt),
    );
    m.driver.rotation.x = clamp((car.accelG ?? 0) * 0.13, -0.087, 0.106);
    m.driver.rotation.z = lean * 0.52 + calm * 0.009;
    m.driver.position.y = m.seat.y + calm * 0.005;
  }
  for (const w of m.wheels) {
    w.pivot.rotation.y = w.front ? -(car.steerAngle ?? steer * 0.53) : 0;
    w.spin.rotation.x = (w.spin.rotation.x - (speed * dt) / 0.347) % TAU;
  }
  m.doors.forEach((d, i) => {
    const open =
      (car.doorSide ?? 0) === i || car.otherDoor === i
        ? fade((car.doorT ?? 0) / 0.24) *
          (1 - fade(((car.doorT ?? 0) - 0.46) / 0.44)) *
          0.96
        : 0;
    d.rotation.y = (i ? 1 : -1) * open;
  });
  if (m.rearLights)
    m.rearLights.material.emissiveIntensity = car.braking ? 2.25 : 0.56;
  m.lamps.forEach((l, i) => {
    l.material.emissiveIntensity =
      level && (Math.floor(t * 7) + i) % 3 > 0 ? 2.9 : 0.17;
  });
  if (m.dents?.length && car.damage !== m.lastDamage) {
    const k = clamp(car.damage - 0.075, 0, 1);
    m.lastDamage = car.damage;
    for (const [geo, v, rest] of m.dents) {
      for (let i = 0; i < v.array.length; i += 3) {
        const x = rest[i],
          y = rest[i + 1],
          z = rest[i + 2],
          f =
            clamp((-z / m.d - 0.61) * 2.58, 0, 1) *
            clamp((x / m.w + 0.09) * 1.22, 0, 1);
        const deform = k * f * (0.67 + Math.sin(x * 19 + y * 31) * 0.29);
        v.array[i] = x - deform * 0.112;
        v.array[i + 1] = y - deform * 0.097;
        v.array[i + 2] = z + deform * 0.245;
      }
      v.needsUpdate = true;
      geo.computeVertexNormals();
    }
    m.scuff.visible = k > 0.2;
  }
}

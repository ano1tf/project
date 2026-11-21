import * as T from "../../../assets/vendor/three/three.module.js";
import { mergeGeometries } from "../../../assets/vendor/three/addons/utils/BufferGeometryUtils.js";
import { labelMaterial, standard } from "./materials.js";
import { TAU, rng } from "./core.mjs";

// Local set dressing is baked with the district, not kept as hundreds of mesh
// objects at runtime. No new props are placed in the street or quest paths.
export function dressHarbor(
  world,
  { box, cylinder, beam, sign, corner, put, surface },
) {
  const m = world.m,
    add = (g) => world.batch.add(g);
  const brass = standard(0x9c8259, { roughness: 0.47, metalness: 0.54 });
  const verdigris = standard(0x3c6159, { roughness: 0.64, metalness: 0.3 });
  const oxblood = standard(0x643d34, { roughness: 0.78 });
  const wax = standard(0xc1af8c, { roughness: 0.55 });
  const navy = standard(0x244b54);
  const seam = standard(0x464039);
  const peg = new T.CylinderGeometry(1, 1, 1, 6),
    loop = new T.TorusGeometry(1, 0.13, 5, 13);
  const rand = rng(70109);
  const plate = (g, a, x, y, z, w, h, yaw = 0) =>
    sign(g, a, x, y, z, w, h, yaw);
  const card = (title, sub, opts) =>
    labelMaterial(title, {
      sub,
      bg: "#294344",
      ink: "#efdbb2",
      accent: "#d3b182",
      ...opts,
    });
  const bulkhead = card("PORT-LUMIÈRE", "POSTE D’AMARRAGE   /   QUAI OUEST", {
    night: 0.14,
  });

  // Cast iron facing, scupper fittings, seams in the quay and alternating rusted fenders.
  for (let i = 0; i < 24; i++) {
    const g = corner(-186.91, -160 + i * 13.65);
    g.userData.detailRange = 42;
    box(g, i % 2 ? brass : m.iron, 0.09, -0.02, 0, 0.81, 0.26, 1.08);
    box(g, m.iron, 0.25, -0.62, 0, 0.38, 0.95, 0.68);
    box(g, m.black, -0.16, -0.78, 0, 0.29, 1.16, 0.57);
    box(g, m.black, -0.16, -0.42, 0.68, 0.2, 0.73, 0.31);
    for (const side of [-1, 1]) {
      const iron = put(g, m.iron, peg, 0.28, 0.114, side * 0.35);
      iron.scale.set(0.078, 0.023, 0.078);
    }
    for (let j = 0; j < 4; j++)
      box(g, m.iron, 2.23, 0.076, -0.35 + j * 0.23, 0.63, 0.011, 0.07);
    if (!(i % 6)) {
      const life = put(
        g,
        i === 12 ? m.white : m.orange,
        loop,
        0.94,
        0.74,
        1.53,
      );
      life.rotation.y = Math.PI * 0.5;
      life.scale.set(0.32, 0.32, 0.32);
      box(g, m.rail, 1.01, 0.68, 1.54, 0.056, 1.15, 0.079);
      plate(g, bulkhead, 1.066, 0.34, 2.38, 1.52, 0.28, Math.PI * 0.5);
    }
    if (i % 4 === 0) {
      for (let j = 0; j < 3; j++) {
        const coil = put(
          g,
          m.rope,
          loop,
          0.84,
          0.123 + j * 0.033,
          -0.48 + j * 0.009,
        );
        coil.rotation.x = -Math.PI * 0.5;
        coil.scale.setScalar(0.43 - j * 0.045);
      }
    }
    add(g);
  }

  const exterior = corner(-130, 84.6);
  // The front is the first visible landmark from the crosswalk. Keep the
  // doorway clear while giving the old warehouse a plinth, rivets and trim.
  box(exterior, verdigris, -11.754, 0.91, 1.95, 0.08, 1.66, 12.67);
  box(exterior, brass, -11.817, 1.72, 1.95, 0.05, 0.081, 12.75);
  box(exterior, m.iron, -11.844, 0.203, 1.95, 0.084, 0.227, 12.88);
  for (let i = 0; i < 10; i++) {
    const z = -3.88 + i * 1.277;
    box(exterior, navy, -11.806, 0.925, z, 0.05, 1.516, 0.055);
    for (const y of [0.256, 1.593])
      box(exterior, brass, -11.844, y, z + 0.102, 0.05, 0.055, 0.065);
  }
  for (const [x, width] of [
    [-7.2, 6.35],
    [7.2, 6.35],
  ]) {
    box(exterior, verdigris, x, 0.51, 8.66, width, 0.89, 0.14);
    box(exterior, brass, x, 0.898, 8.768, width + 0.12, 0.065, 0.06);
    box(exterior, navy, x, 0.197, 8.76, width + 0.16, 0.16, 0.12);
    for (let k = -3; k <= 3; k++)
      box(exterior, m.iron, x + k * 0.9, 0.534, 8.751, 0.028, 0.61, 0.031);
  }
  for (const [x, z] of [
    [-7.95, 10.31],
    [7.9, 10.31],
  ]) {
    box(exterior, brass, x, 0.521, z - 0.17, 2.14, 0.018, 0.018);
    box(exterior, brass, x, 0.834, z - 0.303, 2.14, 0.035, 0.02);
  }
  const streetCard = card("CAFÉ DU QUAI", "OUVERT DEPUIS 1974  ·  VHF 16", {
    height: 266,
    bg: "#363633",
    night: 0.29,
  });
  box(exterior, m.iron, -11.808, 2.32, 5.12, 0.078, 0.841, 1.63);
  plate(exterior, streetCard, -11.861, 2.32, 5.12, 1.55, 0.761, -Math.PI / 2);
  const cafe = corner(-130, 84.6);
  cafe.userData.detailRange = 12;
  // Terrazzo with an inlaid compass, two-tone tiled walls and exposed timber.
  surface(cafe, m.garage, 0, 0.109, 0, 22.35, 16.1, 5.4, 18, 12);
  const floorPattern = new T.Group();
  floorPattern.position.set(-0.19, 0, 2.04);
  cafe.add(floorPattern);
  compass(floorPattern, 3.43, [navy, wax, brass], { box, put });
  for (let z = -7.8; z < 7.95; z += 1.18) {
    for (const side of [-1, 1])
      surface(
        cafe,
        z % 2 > 0 ? verdigris : navy,
        side * 10.68,
        0.115,
        z,
        0.63,
        1.16,
        1,
      );
  }
  // Warm interior plinth, glazed tile band and hand-lettered marine notices behind the actors.
  for (const side of [-1, 1]) {
    box(cafe, oxblood, side * 11.22, 1.22, 0, 0.08, 2.31, 16.37);
    box(cafe, m.wood, side * 11.16, 0.65, 0, 0.105, 1.21, 16.41);
    box(cafe, brass, side * 11.091, 1.27, 0, 0.048, 0.042, 16.45);
    box(cafe, seam, side * 11.17, 0.24, 0, 0.12, 0.24, 16.42);
    for (const z of [-6.8, -2.2, 2.4, 6.65]) {
      box(cafe, m.wood, side * 11.1, 2.67, z, 0.14, 4.97, 0.225);
      box(cafe, verdigris, side * 10.99, 1.16, z, 0.14, 2.18, 0.29);
    }
  }
  box(cafe, oxblood, 0, 1.48, -8.11, 22.2, 2.77, 0.05);
  box(cafe, verdigris, 0, 0.67, -8.039, 22.22, 1.14, 0.075);
  box(cafe, brass, 0, 1.236, -7.99, 22.31, 0.052, 0.046);
  for (let i = 0; i < 25; i++)
    box(cafe, navy, -10.77 + i * 0.891, 0.674, -7.987, 0.031, 1.07, 0.013);
  for (const z of [-6.25, -3.8, -1.25, 1.37, 3.98, 6.58]) {
    box(cafe, m.wood, 0, 4.99, z, 22.42, 0.3, 0.24);
    box(cafe, oxblood, 0, 4.83, z, 22.45, 0.036, 0.274);
  }
  // Placards in the reverse and wide shots are international harbour ephemera,
  // not part of the HUD. Scale the typography as objects in the room.
  const signWall = [
    ["LES HORAIRES", "MARÉE HAUTE   21:44", -5.7, 1.84, 2.01],
    ["CANAL 16", "VEILLE   /   PORT-LUMIÈRE", -1.18, 2.44, 2.83],
    ["ESTUAIRE", "CARTE  47°16′ N", 1.14, 1.71, 1.71],
  ];
  for (const [title, sub, x, y, w] of signWall) {
    box(cafe, m.wood, x, y, -8.002, w + 0.12, 0.76, 0.11);
    plate(cafe, card(title, sub), x, y, -7.943, w, 0.64);
  }
  const pressed = card("RADIO DU QUAI", "DEPUIS 1974   —   CAFÉ DU SILLAGE", {
    height: 220,
    night: 0.38,
  });
  box(cafe, brass, -11.065, 2.68, 0.15, 0.06, 1.73, 4.58);
  plate(cafe, pressed, -11.021, 2.68, 0.15, 4.46, 1.59, Math.PI / 2);
  const clock = put(
    cafe,
    brass,
    new T.CylinderGeometry(0.36, 0.36, 0.091, 24),
    -3.15,
    2.76,
    -8.02,
  );
  clock.rotation.x = Math.PI * 0.5;
  const dial = put(
    cafe,
    wax,
    new T.CylinderGeometry(0.323, 0.323, 0.091, 24),
    -3.15,
    2.76,
    -7.983,
  );
  dial.rotation.x = Math.PI * 0.5;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    box(
      cafe,
      m.iron,
      -3.15 + Math.sin(a) * 0.277,
      2.76 + Math.cos(a) * 0.277,
      -7.927,
      0.023,
      0.047,
      0.008,
    ).rotation.z = -a;
  }
  beam(cafe, m.iron, [-3.15, 2.76, -7.923], [-3.29, 2.88, -7.923], 0.027);
  beam(cafe, oxblood, [-3.15, 2.76, -7.92], [-2.97, 2.844, -7.92], 0.018);
  for (const [x, z] of [
    [1.08, 1.91],
    [-3.43, 3.14],
    [-2.42, -4.87],
  ]) {
    const shade = put(
      cafe,
      verdigris,
      new T.CylinderGeometry(0.15, 0.45, 0.34, 16),
      x,
      2.97,
      z,
    );
    shade.castShadow = true;
    cylinder(cafe, brass, x, 2.816, z, 0.467, 0.039);
    cylinder(cafe, m.lamp, x, 2.797, z, 0.394, 0.036);
    cylinder(cafe, m.iron, x, 4.02, z, 0.025, 1.84);
  }
  // Objects are attached to the existing bar, off the collision routes.
  for (let i = 0; i < 12; i++) {
    const z = -4.7 + i * 0.53;
    cylinder(
      cafe,
      i % 3 ? m.white : navy,
      -7.2 + rand() * 0.21,
      1.323,
      z,
      0.075,
      0.11,
    );
    cylinder(cafe, brass, -7.2 + rand() * 0.14, 1.284, z, 0.112, 0.018);
  }
  const shell = put(
    exterior,
    verdigris,
    new T.CylinderGeometry(0.53, 0.54, 0.12, 24),
    -3.13,
    2.67,
    9.07,
  );
  shell.rotation.z = Math.PI * 0.5;
  beam(exterior, m.iron, [-3.13, 3.18, 8.55], [-3.13, 3.18, 9.28], 0.064);
  const stamp = card("16", "LE SILLAGE", {
    height: 410,
    bg: "#274241",
    night: 0.44,
  });
  plate(exterior, stamp, -3.194, 2.68, 9.07, 0.68, 0.67, -Math.PI / 2);
  plate(exterior, stamp, -3.064, 2.68, 9.07, 0.68, 0.67, Math.PI / 2);
  cylinder(exterior, m.iron, 0, 5.95, 7.77, 0.047, 1.27);
  cylinder(exterior, brass, 0, 6.59, 7.77, 0.102, 0.074);
  add(exterior);
  add(cafe);

  const bel = corner(-175.83, 11.19);
  surface(bel, m.concrete, 0, 0.097, -0.6, 10.65, 9.81, 3.1, 12, 12);
  compass(bel, 3.4, [verdigris, wax, brass], { box, put });
  for (let i = 0; i < 39; i++) {
    const z = -5.31 + i * 0.276;
    box(bel, i % 3 === 0 ? m.rope : m.wood, -6.27, 0.102, z, 5.82, 0.04, 0.256);
  }
  for (const z of [-3.87, 3.95]) {
    const x = -7.98;
    cylinder(bel, brass, x, 0.21, z, 0.31, 0.21);
    cylinder(bel, verdigris, x, 0.65, z, 0.112, 0.95);
    cylinder(bel, m.iron, x, 1.174, z, 0.22, 0.15);
    for (const side of [-1, 1]) {
      const scope = put(
        bel,
        verdigris,
        new T.CylinderGeometry(0.15, 0.125, 0.48, 12),
        x,
        1.36,
        z + side * 0.133,
      );
      scope.rotation.z = Math.PI / 2 + 0.12;
      const glass = put(
        bel,
        m.glass,
        new T.CylinderGeometry(0.092, 0.092, 0.018, 12),
        x + 0.247,
        1.39,
        z + side * 0.133,
      );
      glass.rotation.z = Math.PI / 2 + 0.12;
    }
  }
  const signMat = card(
    "POINT DE VEILLE",
    "ESTUAIRE  /  47°16′ N  –  02°12′ O",
    { night: 0.29 },
  );
  box(bel, m.iron, -3.03, 0.73, -3.31, 0.114, 1.37, 0.136);
  box(bel, brass, -3.03, 1.35, -3.31, 1.4, 0.43, 0.073);
  plate(bel, signMat, -3.03, 1.35, -3.267, 1.34, 0.37);
  cylinder(bel, m.iron, -6.37, 2.03, -5.09, 0.056, 3.9);
  cylinder(bel, brass, -6.37, 4.001, -5.09, 0.09, 0.075);
  add(bel);

  return new HarborMotion(world.scene, box, put, [
    m.iron,
    m.orange,
    m.white,
    m.redLamp,
  ]);
}

function compass(g, size, [dark, pale, metal], { box, put }) {
  const polar = (r, a) => [Math.sin(a) * r, Math.cos(a) * r];
  const rings = new T.RingGeometry(size * 0.95, size, 44);
  put(g, dark, rings, 0, 0.129, 0).rotation.x = -Math.PI * 0.5;
  put(
    g,
    metal,
    new T.RingGeometry(size * 0.8, size * 0.811, 40),
    0,
    0.13,
    0,
  ).rotation.x = -Math.PI * 0.5;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4,
      r = size * (i % 2 ? 0.65 : 0.89);
    const tip = polar(r, a),
      left = polar(size * 0.2, a - 0.34),
      right = polar(size * 0.2, a + 0.34);
    for (const [edge, m, side] of [
      [left, dark, 0],
      [right, i === 4 ? metal : pale, 1],
    ]) {
      const g2 = new T.BufferGeometry();
      const [b, c] = side ? [tip, edge] : [edge, tip];
      g2.setAttribute(
        "position",
        new T.Float32BufferAttribute(
          [0, 0.129, 0, b[0], 0.129, b[1], c[0], 0.129, c[1]],
          3,
        ),
      );
      g2.setAttribute(
        "uv",
        new T.Float32BufferAttribute([0.5, 0.5, 0, 1, 1, 0], 2),
      );
      g2.computeVertexNormals();
      put(g, m, g2, 0, 0, 0);
    }
  }
  for (let i = 0; i < 24; i++) {
    const a = (i * TAU) / 24,
      [x, z] = polar(size * 0.879, a);
    box(
      g,
      metal,
      x,
      0.13,
      z,
      0.023,
      0.008,
      i % 6 === 0 ? 0.25 : 0.107,
    ).rotation.y = a;
  }
}

function batchFloat(src) {
  const parts = [[], []];
  // Flatten in local space before applying world position and wave motion.
  const at = src.position.clone(),
    rotation = src.rotation.clone(),
    scale = src.scale.clone();
  src.position.set(0, 0, 0);
  src.rotation.set(0, 0, 0);
  src.scale.setScalar(1);
  src.updateMatrixWorld(true);
  src.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.clone();
    if (g.index) {
      const old = g;
      g = g.toNonIndexed();
      old.dispose();
    }
    g.applyMatrix4(o.matrixWorld);
    g.clearGroups();
    const m = o.material,
      light = m.emissiveIntensity > 0.45 && m.emissive.getHex() !== 0;
    const col = light
      ? m.color.clone().lerp(m.emissive, 0.6).multiplyScalar(1.4)
      : m.color;
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) col.toArray(colors, i);
    g.setAttribute("color", new T.BufferAttribute(colors, 3));
    parts[Number(light)].push(g);
  });
  const root = new T.Group();
  parts.forEach((g, i) => {
    if (!g.length) return;
    const geo = mergeGeometries(g);
    g.forEach((p) => p.dispose());
    const material = i
      ? new T.MeshBasicMaterial({ vertexColors: true })
      : new T.MeshLambertMaterial({ vertexColors: true });
    root.add(new T.Mesh(geo, material));
  });
  root.position.copy(at);
  root.rotation.copy(rotation);
  root.scale.copy(scale);
  return root;
}

class HarborMotion {
  constructor(scene, box, put, [iron, red, pale, lamp]) {
    this.scene = scene;
    this.floats = [];
    this.pennants = [];
    // Green-starboard/rust quay lights and mooring buoy on the inner estuary.
    for (const [index, x, z, color] of [
      [0, -194.2, 31.76, red],
      [1, -201.6, 62.7, pale],
      [2, -196.14, -16.1, red],
    ]) {
      const src = new T.Group();
      const foot = put(
        src,
        color,
        new T.CylinderGeometry(0.47, 0.72, 0.53, 14),
        0,
        0.08,
        0,
      );
      foot.castShadow = false;
      const body = put(
        src,
        color,
        new T.CylinderGeometry(0.13, 0.378, 0.68, 12),
        0,
        0.662,
        0,
      );
      body.rotation.y = 0.34;
      put(
        src,
        iron,
        new T.CylinderGeometry(0.75, 0.75, 0.128, 14),
        0,
        -0.09,
        0,
      );
      put(
        src,
        pale,
        new T.CylinderGeometry(0.22, 0.24, 0.133, 12),
        0,
        0.882,
        0,
      );
      box(src, iron, 0, 1.12, 0, 0.21, 0.22, 0.21);
      box(src, lamp, 0, 1.258, 0, 0.114, 0.11, 0.114);
      this.float(src, x, -1.68, z, 0.3 + index * 0.23, 0.17, 62);
    }
    this.flag(-130.0, 5.96, 92.37, 3.0, 0.92);
    this.flag(-182.2, 3.41, 6.1, 2.12, 0.79);
  }
  float(src, x, y, z, seed, amplitude = 0.135, range = 142) {
    const root = batchFloat(src);
    this.scene.add(root);
    root.position.set(x, y, z);
    const f = {
      root,
      x,
      y,
      z,
      yaw: root.rotation.y,
      seed,
      amplitude,
      range,
    };
    this.floats.push(f);
    return f;
  }
  flag(x, y, z, w, h) {
    const g = new T.PlaneGeometry(w, h, 14, 4).translate(w * 0.5, 0, 0),
      p = g.attributes.position,
      colors = new Float32Array(p.count * 3),
      base = new Float32Array(p.array);
    const tint = new T.Color();
    for (let i = 0; i < p.count; i++) {
      const u = g.attributes.uv.getX(i),
        v = g.attributes.uv.getY(i);
      tint
        .setHex(
          u < 0.24 ? 0xd98052 : v > 0.73 || v < 0.25 ? 0x436d6f : 0xdfcfa3,
        )
        .toArray(colors, i * 3);
    }
    g.setAttribute("color", new T.BufferAttribute(colors, 3));
    p.setUsage(T.DynamicDrawUsage);
    g.computeBoundingSphere();
    g.boundingSphere.radius += 0.3;
    const mesh = new T.Mesh(
      g,
      new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = -0.31;
    this.scene.add(mesh);
    this.pennants.push({ mesh, base, pos: p, x, z, w });
  }
  update(t, eye, mode, reduced) {
    if (reduced) t = 0.3;
    const eco = mode === "low";
    for (const f of this.floats) {
      const range = eco ? f.range * 0.76 : f.range;
      f.root.visible =
        f.enabled !== false &&
        (f.x - eye.x) ** 2 + (f.z - eye.z) ** 2 < range * range;
      if (!f.root.visible) continue;
      const u = t * 0.96 + f.seed;
      f.root.position.y = f.y + Math.sin(u) * f.amplitude;
      f.root.rotation.z = Math.cos(u * 0.91 + f.seed) * (f.amplitude * 0.27);
      f.root.rotation.x = Math.sin(u * 0.71) * f.amplitude * 0.15;
      f.root.rotation.y = f.yaw + Math.sin(u * 0.36) * 0.018;
    }
    for (const f of this.pennants) {
      const range = eco ? 41 : 98;
      f.mesh.visible = (f.x - eye.x) ** 2 + (f.z - eye.z) ** 2 < range * range;
      if (!f.mesh.visible) continue;
      for (let i = 0; i < f.pos.count; i++) {
        const j = i * 3,
          x = f.base[j],
          u = x / f.w;
        f.pos.setXYZ(
          i,
          x - 0.12 * u * u,
          f.base[j + 1] - 0.16 * u,
          Math.sin(u * 7.9 - t * 4.8) * u * 0.27,
        );
      }
      f.pos.needsUpdate = true;
      if (!eco) f.mesh.geometry.computeVertexNormals();
    }
  }
}

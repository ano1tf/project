import * as T from "three";
import { DistrictBatches } from "./district-render.js";
import {
  X,
  Z,
  WX,
  WZ,
  PLACES,
  DELIVERY_BAYS,
  GARDENS,
  QUAY_WALK,
  SILLAGE_SQUARE,
  SEMAPHORE,
  SILLAGE_ZEBRA,
  JUNCTION_ZEBRA,
  STATION,
} from "./data.mjs";
import { Solids, rng, signalState, onRoad, TAU } from "./core.mjs";
import { makeMaterials, labelMaterial } from "./materials.js";
import { dressHarbor } from "./harbor-set.js";
import { buildStation } from "./station-set.js";

const BOX = new T.BoxGeometry(1, 1, 1),
  CYL = new T.CylinderGeometry(1, 1, 1, 9),
  PANEL = new T.PlaneGeometry(1, 1),
  UP = new T.Vector3(0, 1, 0);
const colors = {
  red: new T.Color(0xff432b),
  amber: new T.Color(0xffb744),
  green: new T.Color(0x48d99e),
  off: new T.Color(0x252329),
};
const put = (g, m, geo, x, y, z, shadow = false) => {
  const o = new T.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  g.add(o);
  return o;
};
export function box(g, m, x, y, z, w, h, d, shadow = false) {
  const o = put(g, m, BOX, x, y, z, shadow);
  o.scale.set(w, h, d);
  return o;
}
export function cylinder(g, m, x, y, z, r, h, shadow = false) {
  const o = put(g, m, CYL, x, y, z, shadow);
  o.scale.set(r, h, r);
  return o;
}
export function beam(g, m, a, b, w, d = w) {
  const dir = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const o = box(
    g,
    m,
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
    w,
    dir.length(),
    d,
    true,
  );
  o.quaternion.setFromUnitVectors(UP, dir.normalize());
  return o;
}
function mapped(g, m, x, y, z, w, h, d, scale = 3, shadow = true) {
  const geo = new T.BoxGeometry(w, h, d),
    uv = geo.getAttribute("uv");
  for (let i = 0; i < 24; i++) {
    const face = i >> 2;
    const sx = face < 2 ? d : face < 4 ? w : w,
      sy = face === 2 || face === 3 ? d : h;
    uv.setXY(i, (uv.getX(i) * sx) / scale, (uv.getY(i) * sy) / scale);
  }
  return put(g, m, geo, x, y, z, shadow);
}
const roadInk = (g, mat, x, y, z, w, h, d) =>
  mapped(g, mat, x, y, z, w, h, d, 1.16, false);
function facade(
  g,
  m,
  x,
  y,
  z,
  w,
  h,
  d,
  span = 2.7,
  floor = 3.07,
  shadow = true,
) {
  const geo = new T.BoxGeometry(w, h, d),
    uv = geo.getAttribute("uv");
  for (let i = 0; i < 24; i++) {
    const face = i >> 2;
    const sx = face < 2 ? d : w;
    const sy = face === 2 || face === 3 ? d : h;
    uv.setXY(
      i,
      (uv.getX(i) * Math.max(1, Math.round(sx / span))) / 5,
      (uv.getY(i) * Math.max(1, Math.round(sy / floor))) / 5,
    );
  }
  return put(g, m, geo, x, y, z, shadow);
}
function sign(g, m, x, y, z, w, h, ry = 0) {
  const a = put(g, m, PANEL, x, y, z);
  a.scale.set(w, h, 1);
  a.rotation.y = ry;
  return a;
}
function surface(g, m, x, y, z, w, d, repeat = 8, nx = 1, nz = 1) {
  const geo = new T.PlaneGeometry(w, d, nx, nz);
  const u = geo.getAttribute("uv");
  for (let i = 0; i < u.count; i++)
    u.setXY(
      i,
      (u.getX(i) * w) / repeat + x / repeat,
      (u.getY(i) * d) / repeat - z / repeat,
    );
  const o = put(g, m, geo, x, y, z);
  o.rotation.x = -Math.PI / 2;
  return o;
}
const corner = (x, z, ry = 0) => {
  const g = new T.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return g;
};

export class DistrictWorld {
  constructor(scene) {
    this.scene = scene;
    this.m = makeMaterials();
    this.solids = new Solids();
    this.batch = new DistrictBatches(scene);
    this.footprints = [];
    this.interiors = [];
    this.lamps = [];
    this.bulbs = [];
    this.rnd = rng(470184);
    this.streetFurniture();
    this.roadGeometry();
    this.deliveryBays();
    this.buildDistrict();
    this.harbor();
    this.skyline();
  }
  prepareGraphics(onDetail) {
    if (this.staticGroup) return;
    this.harborMotion = dressHarbor(this, {
      box,
      cylinder,
      beam,
      sign,
      corner,
      put,
      surface,
    });
    this.streetFinish();
    this.workboat(-203.7, 18.3, -0.19, 0.76, true);
    this.staticGroup = this.batch.build(this.lamps);
    this.installSignals();
    this.tickSignals(0);
    // Plan (including the no-WebGL fallback) never requests the 3D lot.
    this.semaphoreReady = import("./semaphore.js")
      .then(({ loadSemaphore }) => loadSemaphore(SEMAPHORE))
      .then((asset) => {
        asset.root.visible = false;
        onDetail?.(asset.root);
        this.scene.add(asset.root);
        this.semaphoreAsset = asset;
        return asset;
      })
      .catch((error) => {
        console.warn("Le sémaphore 3D n’a pas pu être chargé.", error);
        return null;
      });
  }
  collision(g, x, z, w, d, h, bottom = 0) {
    return this.solids.add(g.position.x + x, g.position.z + z, w, d, h, bottom);
  }
  animateHarbor(t, eye, mode, reduced) {
    this.harborMotion?.update(t, eye, mode, reduced);
    const asset = this.semaphoreAsset;
    if (!asset) return;
    const { x, z } = SEMAPHORE,
      range = mode === "low" ? 47 : 82;
    asset.root.visible = (eye.x - x) ** 2 + (eye.z - z) ** 2 < range ** 2;
    if (asset.root.visible) asset.sample(reduced ? 0 : t);
  }
  isRoofed({ x, y, z }) {
    return (
      y < 5 &&
      this.interiors.some(
        (lot) =>
          Math.abs(x - lot.x) < lot.w * 0.5 - 0.24 &&
          Math.abs(z - lot.z) < lot.d * 0.5 - 0.24,
      )
    );
  }
  groundSound(x, z) {
    if (this.isRoofed({ x, y: 0, z })) return "interior";
    if (onRoad(x, z)) return "asphalt";
    if (
      GARDENS.some(
        (a) => Math.abs(x - a.x) < a.w / 2 && Math.abs(z - a.z) < a.d / 2,
      )
    )
      return "garden";
    return "stone";
  }
  get buildings() {
    return this.footprints;
  }
  lot(x, z, w, d, kind = "building") {
    const data = { x, z, w, d, kind };
    this.footprints.push(data);
    if (kind === "interior") this.interiors.push(data);
  }
  roadGeometry() {
    const m = this.m,
      minX = -190,
      maxX = 185,
      minZ = -175,
      maxZ = 163,
      mx = (minX + maxX) / 2,
      mz = (minZ + maxZ) / 2;
    const root = corner(0, 0);
    // Sample the station lamps along the ground, not just at the four district corners.
    surface(root, m.road, mx, 0, mz, maxX - minX, maxZ - minZ, 9, 51, 49);
    mapped(
      root,
      m.seaWall,
      -187.4,
      -1.14,
      mz,
      1.3,
      2.34,
      maxZ - minZ,
      5,
      false,
    );
    this.batch.add(root);
    const xs = [
      [minX, X[0] - WX[0] / 2],
      ...X.slice(1).map((x, i) => [X[i] + WX[i] / 2, x - WX[i + 1] / 2]),
      [X.at(-1) + WX.at(-1) / 2, maxX],
    ];
    const zs = [
      [minZ, Z[0] - WZ[0] / 2],
      ...Z.slice(1).map((z, i) => [Z[i] + WZ[i] / 2, z - WZ[i + 1] / 2]),
      [Z.at(-1) + WZ.at(-1) / 2, maxZ],
    ];
    for (const [x1, x2] of xs)
      for (const [z1, z2] of zs) {
        const x = (x1 + x2) / 2,
          z = (z1 + z2) / 2,
          w = x2 - x1,
          d = z2 - z1,
          g = corner(x, z);
        mapped(g, m.pavers, 0, 0.032, 0, w, 0.065, d, 5, false);
        box(g, m.curb, 0, 0.043, -d / 2 + 0.18, w, 0.105, 0.35);
        box(g, m.curb, 0, 0.043, d / 2 - 0.18, w, 0.105, 0.35);
        box(g, m.curb, -w / 2 + 0.18, 0.043, 0, 0.35, 0.105, d - 0.65);
        box(g, m.curb, w / 2 - 0.18, 0.043, 0, 0.35, 0.105, d - 0.65);
        this.batch.add(g);
      }
    for (let i = 0; i < X.length; i++)
      for (let j = 0; j < Z.length - 1; j++) {
        const g = corner(X[i], (Z[j] + Z[j + 1]) / 2),
          a = Z[j] + WZ[j] / 2 + 5.4 - g.position.z,
          b = Z[j + 1] - WZ[j + 1] / 2 - 5.2 - g.position.z;
        for (let z = a; z < b; z += 7.3)
          roadInk(g, m.roadWhite, 0, 0.016, z, 0.115, 0.011, 3.2);
        if (i === 0 || i === 2) {
          roadInk(
            g,
            m.roadWhite,
            -WX[i] / 2 + 0.97,
            0.015,
            (a + b) / 2,
            0.13,
            0.01,
            b - a + 4,
          );
          roadInk(
            g,
            m.roadWhite,
            WX[i] / 2 - 0.97,
            0.015,
            (a + b) / 2,
            0.13,
            0.01,
            b - a + 4,
          );
        }
        if (i === 2) {
          roadInk(
            g,
            m.roadGold,
            -0.29,
            0.015,
            (a + b) / 2,
            0.1,
            0.01,
            b - a + 4,
          );
          roadInk(
            g,
            m.roadGold,
            0.29,
            0.015,
            (a + b) / 2,
            0.1,
            0.01,
            b - a + 4,
          );
        }
        if (i === 0)
          for (let z = a + 5; z < b - 3.2; z += 8.1) {
            for (const s of [-1, 1]) {
              const x = s * (WX[i] / 2 - 2.45);
              roadInk(g, m.roadWhite, x, 0.017, z, 0.059, 0.009, 2.45);
              roadInk(
                g,
                m.roadWhite,
                x + s * 0.71,
                0.017,
                z - 1.22,
                1.48,
                0.009,
                0.059,
              );
            }
          }
        for (let z = a + 2; z < b; z += 18) {
          box(g, m.iron, WX[i] / 2 - 0.42, 0.017, z, 0.34, 0.01, 0.6);
          for (let l = 0; l < 4; l++)
            box(
              g,
              m.rail,
              WX[i] / 2 - 0.42,
              0.025,
              z - 0.22 + l * 0.13,
              0.285,
              0.008,
              0.032,
            );
        }
        this.batch.add(g);
      }
    for (let j = 0; j < Z.length; j++)
      for (let i = 0; i < X.length - 1; i++) {
        const g = corner((X[i] + X[i + 1]) / 2, Z[j]),
          a = X[i] + WX[i] / 2 + 5.1 - g.position.x,
          b = X[i + 1] - WX[i + 1] / 2 - 5.1 - g.position.x;
        for (let x = a; x < b; x += 7.5)
          roadInk(g, m.roadWhite, x, 0.017, 0, 3.3, 0.01, 0.115);
        if (j === 2) {
          roadInk(
            g,
            m.roadWhite,
            (a + b) / 2,
            0.017,
            WZ[j] / 2 - 1,
            b - a + 4,
            0.01,
            0.13,
          );
          roadInk(
            g,
            m.roadWhite,
            (a + b) / 2,
            0.017,
            -WZ[j] / 2 + 1,
            b - a + 4,
            0.01,
            0.13,
          );
        }
        this.batch.add(g);
      }
    for (let i = 0; i < X.length; i++)
      for (let j = 0; j < Z.length; j++) {
        const g = corner(X[i], Z[j]);
        for (const side of [-1, 1]) {
          for (let a = -WX[i] / 2 + 0.85; a < WX[i] / 2 - 0.55; a += 0.89)
            roadInk(
              g,
              m.roadWhite,
              a,
              0.019,
              side * (WZ[j] / 2 + JUNCTION_ZEBRA.center),
              0.47,
              0.01,
              JUNCTION_ZEBRA.depth,
            );
          for (let a = -WZ[j] / 2 + 0.85; a < WZ[j] / 2 - 0.55; a += 0.89)
            roadInk(
              g,
              m.roadWhite,
              side * (WX[i] / 2 + JUNCTION_ZEBRA.center),
              0.019,
              a,
              JUNCTION_ZEBRA.depth,
              0.01,
              0.47,
            );
          roadInk(
            g,
            m.roadWhite,
            (side * WX[i]) / 4,
            0.024,
            side * (WZ[j] / 2 + JUNCTION_ZEBRA.line),
            WX[i] / 2 - 0.55,
            0.01,
            0.14,
          );
          roadInk(
            g,
            m.roadWhite,
            -side * (WX[i] / 2 + JUNCTION_ZEBRA.line),
            0.024,
            (side * WZ[j]) / 4,
            0.14,
            0.01,
            WZ[j] / 2 - 0.55,
          );
        }
        this.batch.add(g);
      }
  }
  deliveryBays() {
    const m = this.m;
    const mark = labelMaterial("LIVRAISON", {
      bg: "#33403e",
      ink: "#edcd8c",
      border: false,
      night: 0.04,
    });
    for (const bay of Object.values(DELIVERY_BAYS)) {
      const g = corner(bay.x, bay.z, -bay.heading);
      for (const side of [-1, 1]) {
        roadInk(g, m.roadGold, side * 1.34, 0.019, 0, 0.084, 0.012, 6.4);
        roadInk(g, m.roadGold, 0, 0.019, side * 3.18, 2.68, 0.012, 0.089);
        for (let j = 0; j < 4; j++) {
          const tick = roadInk(
            g,
            m.roadGold,
            side * (0.44 + j * 0.24),
            0.021,
            side * (3.18 + j * 0.133),
            0.066,
            0.007,
            1.03,
          );
          tick.rotation.y = Math.PI * 0.29;
        }
      }
      const sign = surface(g, mark, 0, 0.025, 0, 1.67, 0.46, 1);
      const uv = sign.geometry.attributes.uv;
      for (let i = 0; i < 4; i++) uv.setXY(i, i % 2, 1 - (i >> 1));
      this.batch.add(g);
    }
  }
  light(g, x, y, z, rgb = 0xffb66b, power = 75, span = 16) {
    this.lamps.push({
      x: g.position.x + x,
      y,
      z: g.position.z + z,
      rgb,
      power,
      span,
    });
  }
  lampPost(x, z, dir = 1, street = true) {
    const m = this.m,
      g = corner(x, z),
      h = street ? 5.95 : 3.7,
      reach = street ? 1.66 : 0.62;
    cylinder(g, m.concrete, 0, 0.112, 0, 0.19, 0.224);
    cylinder(g, m.iron, 0, h * 0.47, 0, 0.073, h * 0.94, true);
    cylinder(g, m.rail, 0, 0.74, 0, 0.095, 1.44);
    beam(g, m.iron, [0, h * 0.92, 0], [dir * 0.41, h, 0], 0.09);
    beam(g, m.iron, [dir * 0.41, h, 0], [dir * reach, h, 0], 0.073);
    box(g, m.iron, dir * reach, h - 0.03, 0, 0.49, 0.118, 0.29);
    box(g, m.lamp, dir * reach, h - 0.099, 0, 0.387, 0.035, 0.24);
    this.light(
      g,
      dir * reach,
      h - 0.23,
      0,
      street ? 0xffbc75 : 0xffbc78,
      street ? 110 : 55,
      street ? 18 : 13,
    );
    this.batch.add(g);
  }
  signalPole(i, j, x, z, yaw, axis) {
    const m = this.m,
      g = corner(x, z, yaw);
    cylinder(g, m.iron, 0, 1.7, 0, 0.072, 3.4);
    cylinder(g, m.rail, 0, 0.27, 0, 0.112, 0.54);
    box(g, m.black, 0, 3, 0, 0.3, 0.87, 0.238);
    box(g, m.iron, 0, 2.98, 0.118, 0.25, 0.82, 0.067);
    for (let n = 0; n < 3; n++) {
      const y = 3.24 - n * 0.245;
      box(g, m.black, 0, y + 0.085, 0.21, 0.214, 0.041, 0.183);
      this.bulbs.push({
        i,
        j,
        axis,
        n,
        x: x + Math.sin(yaw) * 0.177,
        y,
        z: z + Math.cos(yaw) * 0.177,
        ry: yaw,
      });
    }
    this.batch.add(g);
  }
  streetFurniture() {
    for (let i = 0; i < X.length; i++)
      for (let j = 0; j < Z.length; j++) {
        const x = X[i],
          z = Z[j],
          xx = WX[i] / 2 + 1.05,
          zz = WZ[j] / 2 + 1;
        this.signalPole(i, j, x + xx, z + zz, 0, "z");
        this.signalPole(i, j, x - xx, z - zz, Math.PI, "z");
        this.signalPole(i, j, x + xx, z - zz, Math.PI / 2, "x");
        this.signalPole(i, j, x - xx, z + zz, -Math.PI / 2, "x");
      }
    for (let i = 0; i < X.length; i++)
      for (let j = 0; j < Z.length - 1; j++) {
        const l = Z[j] + WZ[j] / 2;
        this.lampPost(X[i] + WX[i] / 2 + 0.94, l + 15, -1);
        this.lampPost(X[i] - WX[i] / 2 - 0.95, l + 39, 1);
      }
    for (let j = 1; j < Z.length; j++)
      for (let i = 0; i < X.length - 1; i++)
        this.lampPost(
          X[i] + WX[i] / 2 + 22,
          Z[j] + WZ[j] / 2 + 1,
          (i % 2) * 2 - 1,
          false,
        );
  }
  installSignals() {
    const geom = new T.CircleGeometry(0.087, 9),
      mat = new T.MeshBasicMaterial({ color: 0xffffff });
    this.signals = new T.InstancedMesh(geom, mat, this.bulbs.length);
    const dummy = new T.Object3D();
    this.bulbs.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.y = b.ry;
      dummy.updateMatrix();
      this.signals.setMatrixAt(i, dummy.matrix);
      this.signals.setColorAt(i, colors.off);
    });
    this.signals.computeBoundingSphere();
    this.scene.add(this.signals);
    this.signalStamp = -1;
  }
  tickSignals(t) {
    const stamp = Math.floor(t * 8);
    if (stamp === this.signalStamp) return;
    this.signalStamp = stamp;
    this.bulbs.forEach((b, i) => {
      const lit = ["red", "amber", "green"][b.n];
      this.signals.setColorAt(
        i,
        signalState(t, b.i, b.j, b.axis) === lit ? colors[lit] : colors.off,
      );
    });
    this.signals.instanceColor.needsUpdate = true;
  }
  buildDistrict() {
    this.cafe();
    this.semaphorePlinth();
    this.hangar();
    this.garage();
    this.service();
    this.market();
    this.quayPavilion();
    this.station = buildStation(this, STATION, {
      box,
      corner,
      mapped,
      sign,
      surface,
    });
    const rows = [
      [-110, -151, 31, 12, 6, "factory"],
      [-53, -113, 43, 34, 10, "factory"],
      [22, -113, 43, 36, 14, "slate"],
      [106, -116, 37, 35, 28, "glass"],
      [161, -110, 22, 38, 39, "glass"],
      [-118, -55, 35, 24, 9, "brick"],
      [-119, -32, 34, 16, 8, "factory"],
      [-49, -47, 41, 38, 16, "limestone"],
      [24, -57, 39, 19, 27, "slate"],
      [35, -27, 25, 19, 33, "glass"],
      [107, -44, 44, 33, 32, "glass"],
      [161, -42, 21, 34, 35, "slate"],
      [-59, 25, 20, 38, 14, "brick"],
      [-34, 25, 18, 30, 12, "cream"],
      [20, 22, 35, 35, 21, "slate"],
      [107, 12, 43, 23, 14, "cream"],
      [160, 25, 24, 40, 24, "glass"],
      [-121, 73, 27, 13, 11, "brick"],
      [-57, 89, 25, 35, 12, "cream"],
      [-32, 100, 15, 25, 8, "brick"],
      [27, 76, 32, 15, 8, "factory"],
      [160, 97, 21, 33, 9, "factory"],
      [-119, 146, 32, 16, 6, "factory"],
      [-53, 146, 43, 20, 12, "cream"],
      [25, 148, 43, 18, 9, "brick"],
      [98, 146, 40, 17, 12, "factory"],
      [164, 148, 24, 17, 10, "cream"],
      [-53, -159, 43, 15, 9, "brick"],
      [23, -160, 37, 13, 14, "cream"],
      [97, -161, 42, 12, 12, "factory"],
      [162, -157, 22, 19, 15, "slate"],
    ];
    rows.forEach((args) => this.building(...args));
    this.containerYard(-57, -63, 3, 2);
    this.containerYard(-113, -136, 3, 1);
    this.containerYard(-178, -39, 1, 2, true);
    for (const { x, z, w, d } of GARDENS) this.garden(x, z, w, d);
    for (let i = 0; i < X.length - 1; i++)
      for (let j = 0; j < Z.length - 1; j++) {
        if (i === 0 && j === 0) continue;
        const x = X[i] + WX[i] / 2 + 2.6,
          z = Z[j] + WZ[j] / 2 + 8;
        this.streetTree(x, z, 1.0 + ((i + j) % 3) * 0.13);
        const g = corner(
          X[i + 1] - WX[i + 1] / 2 - 2.9,
          Z[j + 1] - WZ[j + 1] / 2 - 6.3,
        );
        this.bench(g, 0, 0);
        box(g, this.m.rail, 1.38, 0.43, 0.05, 0.49, 0.75, 0.46);
        box(g, this.m.black, 1.39, 0.827, 0.05, 0.52, 0.07, 0.5);
        this.batch.add(g);
      }
    for (let j = -152; j < 159; j += 14.4) {
      if (Math.abs(j - 12) < 17) continue;
      const g = corner(-183.8, j);
      this.bollard(g, 0, 0, true);
      this.batch.add(g);
    }
  }
  building(x, z, w, d, h, kind, fixed = false) {
    const m = this.m,
      g = corner(x, z),
      tower = h > 25,
      arch = kind === "brick" || kind === "limestone" || kind === "cream",
      v = m.facades[kind];
    if (fixed) g.userData.backdrop = true;
    if (!fixed) {
      this.lot(x, z, w, d);
      this.collision(g, 0, 0, w, d, h + (tower ? 1.4 : 0.65));
    }
    const ledge = tower ? m.aluminum : arch ? m.curb : m.rail;
    mapped(g, m.concrete, 0, 0.32, 0, w + 0.32, 0.64, d + 0.31, 4, true);
    facade(
      g,
      v,
      0,
      (h + 0.58) / 2,
      0,
      w,
      h - 0.58,
      d,
      tower ? 3.1 : 3.14,
      tower ? 3.33 : 3.17,
      !fixed,
    );
    if (tower) {
      const w2 = w * 0.78,
        d2 = d * 0.73,
        t = 4.5 + this.rnd() * 0.7;
      if (!fixed) this.collision(g, 0, 0, w, d, h + 0.7);
      facade(g, v, 0, h + t * 0.5, 0, w2, t, d2, 3.2, 3.24, !fixed);
      box(g, ledge, 0, h + t, 0, w2 + 0.3, 0.31, d2 + 0.29);
      box(g, m.glass, w * 0.26, h * 0.51, d / 2 + 0.135, 1.15, h, 0.25, !fixed);
      box(g, m.iron, -w * 0.495, h * 0.52, 0, 0.42, h * 0.96, d + 0.24);
      box(g, m.iron, w * 0.495, h * 0.52, 0, 0.42, h * 0.96, d + 0.24);
      if (h > 31 || fixed) {
        cylinder(g, m.rail, -w * 0.2, h + t + 2.45, 0, 0.09, 5.5);
        box(g, m.redLamp, -w * 0.2, h + t + 5.26, 0, 0.2, 0.21, 0.2);
      }
    }
    box(g, ledge, 0, h + 0.12, 0, w + 0.5, 0.32, d + 0.5, !fixed);
    mapped(g, m.roof, 0, h + 0.285, 0, w - 0.04, 0.16, d - 0.07, 4, !fixed);
    if (arch || kind === "factory") {
      box(g, ledge, 0, 3.35, d / 2 + 0.1, w + 0.07, 0.18, 0.27);
      box(g, ledge, 0, 3.35, -d / 2 - 0.1, w + 0.07, 0.18, 0.27);
      for (let i = -1; i < 2; i++) {
        const dx = i * w * 0.275;
        box(g, m.rail, dx, 1.35, d / 2 + 0.07, 1.0, 2.7, 0.1);
        box(
          g,
          arch ? m.glassLit : m.glass,
          dx,
          1.65,
          d / 2 + 0.154,
          0.79,
          1.65,
          0.11,
        );
        box(g, m.iron, dx, 1.65, d / 2 + 0.23, 0.058, 1.65, 0.025);
        box(g, m.curb, dx, 0.62, d / 2 + 0.19, 1.05, 0.11, 0.19);
      }
      if (arch)
        for (let fx = -w * 0.43; fx < w * 0.47; fx += 3.9) {
          box(g, ledge, fx, h - 0.23, d / 2 + 0.08, 0.2, 0.47, 0.29);
        }
      if (kind === "factory") {
        for (const s of [-1, 1])
          box(g, m.rail, s * w * 0.45, h * 0.5, -d / 2 - 0.13, 0.18, h, 0.2);
      }
    }
    if (!fixed) {
      box(g, m.iron, -w * 0.27, h + 0.76, d * 0.21, 2.9, 0.86, 1.5);
      box(g, m.aluminum, -w * 0.27, h + 1.22, d * 0.21, 3, 0.095, 1.59);
      for (let i = 0; i < 7; i++)
        box(
          g,
          m.rail,
          -w * 0.27 - 1.3 + i * 0.43,
          h + 0.77,
          d * 0.21 + 0.764,
          0.095,
          0.58,
          0.043,
        );
      for (const s of [-1, 1])
        box(g, ledge, s * w * 0.5, h + 0.46, 0, 0.24, 0.44, d + 0.31);
      if (kind === "factory") {
        for (const s of [-1, 1]) {
          const a = box(
            g,
            m.roof,
            s * w * 0.248,
            h + 1.04,
            0,
            w * 0.525,
            0.15,
            d + 0.25,
            true,
          );
          a.rotation.z = -s * 0.14;
        }
        for (const s of [-1, 1]) {
          cylinder(g, m.rail, s * w * 0.34, h + 1.97, -d * 0.28, 0.2, 1.44);
          cylinder(g, m.iron, s * w * 0.34, h + 2.67, -d * 0.28, 0.34, 0.13);
        }
      }
    }
    this.batch.add(g);
  }
  shell(g, w, d, h, opening, facadeMat) {
    const m = this.m;
    mapped(g, m.warehouse, 0, h / 2, -d / 2, w, h, 0.45, 3);
    this.collision(g, 0, -d / 2, w, 0.5, h);
    for (const s of [-1, 1]) {
      mapped(g, m.warehouse, (s * w) / 2, h / 2, 0, 0.46, h, d, 3.5);
      this.collision(g, (s * w) / 2, 0, 0.49, d, h);
      const len = (w - opening) / 2,
        px = s * (opening / 2 + len / 2);
      if (facadeMat === m.facades.brick)
        facade(g, facadeMat, px, h / 2, d / 2, len, h, 0.45, 2.4, 2.62);
      else mapped(g, facadeMat, px, h / 2, d / 2, len, h, 0.45, 3.2);
      this.collision(g, px, d / 2, len, 0.48, h);
    }
    mapped(g, facadeMat, 0, h - 0.44, d / 2, opening + 0.05, 0.9, 0.47, 3);
    this.collision(g, 0, d / 2, opening, 0.48, h, h - 0.91);
    mapped(g, m.roof, 0, h + 0.05, 0, w + 0.61, 0.24, d + 0.57, 4);
    this.collision(g, 0, 0, w, d, h + 0.15, h - 0.09);
    surface(g, m.garage, 0, 0.091, 0, w - 0.4, d - 0.36, 4);
    box(g, m.concrete, 0, 0.059, d / 2 + 0.33, opening + 0.28, 0.118, 1.1);
    this.lot(g.position.x, g.position.z, w, d, "interior");
  }
  cafe() {
    const m = this.m,
      g = corner(-130, 84.6),
      w = 23,
      d = 16.8,
      h = 5.4;
    this.shell(g, w, d, h, 5.7, m.facades.brick);
    // A working threshold, not another generic frontage: read the entry by its tiled
    // landing, a green transom, the brass jambs and the warm light across the pavement.
    const doorZ = d / 2;
    surface(g, m.garage, 0, 0.11, doorZ + 0.43, 5.55, 2.4, 1.6, 6, 4);
    box(g, m.rail, 0, 3.26, doorZ + 0.07, 6.13, 0.3, 0.55);
    box(g, m.iron, 0, 3.1, doorZ - 0.039, 5.74, 0.21, 0.25);
    box(g, m.lamp, 0, 3.01, doorZ + 0.13, 4.98, 0.037, 0.15);
    for (const s of [-1, 1]) {
      box(g, m.paint, s * 2.94, 1.57, doorZ + 0.22, 0.24, 3.03, 0.34);
      box(g, m.chrome, s * 2.77, 1.56, doorZ + 0.353, 0.052, 2.83, 0.054);
    }
    this.light(g, 0, 2.83, doorZ + 0.44, 0xffbd82, 52, 10.5);
    // Sidewalk apron makes the landing legible from street level without introducing a step.
    for (let i = 0; i < 5; i++) {
      const slab = 2.35 + i * 0.13;
      surface(
        g,
        i % 2 ? m.garage : m.concrete,
        0,
        0.088,
        doorZ + 1.72 + i * 0.61,
        slab,
        0.53,
        1.98,
      );
    }
    const { x: crossX, z: crossZ, span, depth } = SILLAGE_ZEBRA,
      asphalt = corner(crossX, crossZ);
    for (let stripe = -span / 2 + 1.4; stripe < span / 2 - 1; stripe += 1.02)
      roadInk(asphalt, m.roadWhite, stripe, 0.019, 0, 0.55, 0.01, depth);
    for (const side of [-1, 1])
      box(asphalt, m.yellow, side * 7.77, 0.018, 0.04, 0.51, 0.01, 2.12);
    this.batch.add(asphalt);
    box(g, m.paint, 0, 3.55, d / 2 + 0.47, w + 0.07, 0.44, 0.82, true);
    box(g, m.iron, 0, 4.51, d / 2 + 0.31, 9.6, 1.29, 0.22);
    sign(
      g,
      labelMaterial("LE SILLAGE", {
        sub: "CAFÉ DU QUAI  •  DEPUIS 1974",
        bg: "#192e34",
        ink: "#ffd7a4",
      }),
      0,
      4.5,
      d / 2 + 0.429,
      9.36,
      1.18,
    );
    for (const s of [-1, 1]) {
      const x = s * 6.52;
      box(g, m.iron, x, 1.91, d / 2 + 0.254, 5.25, 2.22, 0.19);
      box(g, m.shopGlass, x, 1.91, d / 2 + 0.379, 5.06, 2.04, 0.073);
      for (let p = -2; p <= 2; p++)
        box(g, m.rail, x + p * 0.97, 1.96, d / 2 + 0.43, 0.049, 1.93, 0.065);
      box(g, m.curb, x, 0.834, d / 2 + 0.52, 5.29, 0.125, 0.32);
      const a = box(g, m.paint, x, 3.35, d / 2 + 0.91, 5.41, 0.123, 1.31);
      a.rotation.x = 0.19;
      for (let bar = 0; bar < 6; bar++) {
        const b = box(
          g,
          bar % 2 ? m.paint : m.rope,
          x - 2.264 + bar * 0.904,
          3.214,
          d / 2 + 1.544,
          0.904,
          0.198,
          0.042,
        );
        b.userData.trim = true;
      }
      for (let j = -2.3; j < 2.4; j += 0.46) {
        const b = box(g, m.wood, x + j, 3.363, d / 2 + 0.92, 0.102, 0.125, 1.3);
        b.rotation.x = 0.19;
      }
      box(g, m.iron, s * 3.13, 2.62, d / 2 + 0.4, 0.22, 0.38, 0.16);
      box(g, m.lamp, s * 3.13, 2.57, d / 2 + 0.51, 0.11, 0.24, 0.08);
      this.light(g, s * 4.1, 2.66, d / 2 + 0.76, 0xffb87c, 37, 8.7);
    }
    for (const x of [-2.98, 2.98]) {
      box(g, m.rail, x, 1.66, d / 2, 0.17, 3.35, 0.48);
      box(g, m.glass, x * 1.01, 1.55, d / 2 - 0.31, 0.11, 2.98, 0.49);
    }
    surface(g, m.pavers, 0, 0.106, 0, w - 0.52, d - 0.5, 2.0);
    for (let j = 0; j < 5; j++) {
      const x = 3.85 + (j % 2) * 3.8,
        z = -4.4 + Math.floor(j / 2) * 2.79;
      cylinder(g, m.iron, x, 0.24, z, 0.074, 0.41, true);
      cylinder(g, m.iron, x, 0.143, z, 0.34, 0.077, true);
      cylinder(g, m.wood, x, 0.821, z, 0.72, 0.096, true);
      cylinder(g, m.rope, x, 0.869, z, 0.69, 0.024);
      this.collision(g, x, z, 1.39, 1.39, 0.93);
      for (const s of [-1, 1]) {
        const a = x + s * 0.93;
        box(g, m.wood, a, 0.483, z, 0.56, 0.102, 0.51, true);
        for (const zz of [-0.21, 0.21]) {
          box(g, m.iron, a - s * 0.223, 0.28, z + zz, 0.044, 0.4, 0.044, true);
          box(g, m.iron, a + s * 0.23, 0.465, z + zz, 0.049, 0.78, 0.048, true);
        }
        box(g, m.wood, a + s * 0.23, 0.806, z, 0.063, 0.16, 0.52);
      }
      for (let k = 0; k < 2; k++) {
        cylinder(
          g,
          m.white,
          x - 0.18 + k * 0.35,
          0.91,
          z + (k - 0.5) * 0.29,
          0.074,
          0.078,
        );
        cylinder(
          g,
          m.rope,
          x - 0.18 + k * 0.35,
          0.948,
          z + (k - 0.5) * 0.29,
          0.064,
          0.01,
        );
      }
    }
    box(g, m.wood, -7.94, 0.63, -1.74, 2.04, 1.11, 6.7, true);
    box(g, m.rope, -7.95, 1.218, -1.74, 2.25, 0.115, 6.87, true);
    for (let i = 0; i < 40; i++)
      box(
        g,
        m.wood,
        -6.882,
        0.595,
        -4.99 + i * 0.167,
        0.082,
        1.02,
        0.098,
        true,
      );
    box(g, m.iron, -6.865, 0.138, -1.74, 0.095, 0.12, 6.67);
    box(g, m.iron, -6.865, 1.146, -1.74, 0.095, 0.067, 6.67);
    this.collision(g, -7.95, -1.74, 2.15, 6.82, 1.3);
    box(g, m.rail, -7.7, 1.51, -0.3, 0.87, 0.45, 0.5);
    box(g, m.chrome, -7.68, 1.53, -0.017, 0.59, 0.21, 0.075);
    box(g, m.iron, -7.86, 1.44, 0.041, 0.38, 0.04, 0.39);
    for (const h of [1.42, 2.05]) {
      box(g, m.wood, -8.32, h, -7.91, 5.99, 0.1, 0.55, true);
      for (let i = 0; i < 13; i++) {
        const x = -11.06 + i * 0.41,
          j = 0.14 + (i % 5) * 0.039;
        cylinder(
          g,
          [m.glass, m.rope, m.black, m.paint][i % 4],
          x,
          h + 0.08 + j * 0.44,
          -7.79,
          0.069,
          j,
          true,
        );
        cylinder(g, m.iron, x, h + 0.08 + j, -7.79, 0.042, 0.075);
      }
    }
    sign(
      g,
      labelMaterial("DEPUIS 1974", {
        sub: "TERRASSE  •  CAFÉS  •  SANDWICHS",
        bg: "#293128",
        ink: "#eadcc2",
        accent: "#e0aa79",
        night: 0.22,
      }),
      3.75,
      3.04,
      -8.116,
      7.85,
      1.15,
    );
    for (const z of [5.85, 2.83, 0.24]) {
      cylinder(g, m.iron, -5.91, 0.205, z, 0.072, 0.41, true);
      cylinder(g, m.iron, -5.91, 0.09, z, 0.248, 0.08);
      cylinder(g, m.paint, -5.91, 0.454, z, 0.28, 0.114, true);
    }
    sign(
      g,
      labelMaterial("COMPTOIR", {
        sub: "ESPRESSO   /   INFUSION",
        bg: "#364034",
        ink: "#f6dfaa",
        border: false,
      }),
      -7.92,
      2.66,
      -d / 2 + 0.28,
      5.65,
      1.1,
    );
    for (let i = 0; i < 3; i++) {
      const x = -4.85 + i * 4.65;
      box(g, m.rail, x, 4.63, -2.32, 0.05, 1.32, 0.05);
      box(g, m.paint, x, 3.94, -2.32, 0.88, 0.18, 0.67);
      box(g, m.lamp, x, 3.841, -2.32, 0.66, 0.04, 0.55);
      this.light(g, x, 3.7, -2.32, 0xffbc82, 66, 12);
    }
    box(g, m.iron, -w / 2 - 0.24, 3.79, 0.49, 0.24, 1.38, 6.3);
    sign(
      g,
      labelMaterial("LE SILLAGE", {
        sub: "CAFÉ  /  BAR DU QUAI",
        bg: "#253838",
        accent: "#f4a77a",
        night: 0.31,
      }),
      -w / 2 - 0.371,
      3.79,
      0.49,
      6.04,
      1.13,
      -Math.PI / 2,
    );
    box(g, m.paint, -w / 2 - 0.27, 3.08, 0.49, 0.34, 0.12, 6.16);
    for (const z of [-6.2, 1.02, 6.5]) {
      box(g, m.iron, -w / 2 - 0.27, 1.41, z, 0.2, 2.49, 0.19);
      box(g, m.rail, -w / 2 - 0.355, 0.425, z, 0.066, 0.44, 0.23);
    }
    const open = labelMaterial("OUVERT", {
      bg: "#29473f",
      ink: "#ffe3b7",
      border: false,
      night: 0.45,
    });
    sign(g, open, 2.69, 1.94, doorZ + 0.403, 0.91, 0.29);
    this.bench(g, -7.8, d / 2 + 2.1);
    this.bench(g, 7.9, d / 2 + 2.1);
    this.bollard(g, -4.5, d / 2 + 1.4);
    this.bollard(g, 4.5, d / 2 + 1.4);
    this.batch.add(g);
    this.deliveryStand(
      PLACES.courier.x,
      PLACES.courier.z - 1.9,
      "LA DARSE",
      "RELAIS COURSIERS",
    );
  }
  hangar() {
    const m = this.m,
      g = corner(-118, -111.5),
      w = 38,
      d = 27.3,
      h = 8.45;
    this.shell(g, w, d, h, 7.7, m.warehouse);
    for (let i = 0; i < 3; i++) {
      const x = ((i - 1) * w) / 3;
      for (const s of [-1, 1]) {
        const o = box(
          g,
          m.roof,
          x + s * w * 0.086,
          h + 1.05,
          0,
          w * 0.186,
          0.22,
          d + 0.81,
          true,
        );
        o.rotation.z = -s * 0.23;
      }
      box(g, m.rail, x, h + 1.84, 0, 0.34, 0.23, d + 0.91);
    }
    box(g, m.iron, 0, h - 0.23, d / 2 + 0.31, w + 0.24, 0.39, 0.32);
    sign(
      g,
      labelMaterial("HANGAR 07", {
        sub: "PORT-LUMIÈRE  /  ACCÈS RÉSERVÉ",
        bg: "#243039",
        accent: "#e5a958",
      }),
      0,
      6.72,
      d / 2 + 0.27,
      11.9,
      1.7,
    );
    for (const s of [-1, 1]) {
      const x = s * 3.92;
      box(g, m.rail, x, 3.09, d / 2 + 0.27, 0.21, 6.18, 0.22);
      for (let j = 0; j < 5; j++)
        box(
          g,
          j % 2 ? m.black : m.yellow,
          x,
          0.27 + j * 0.29,
          d / 2 + 0.388,
          0.22,
          0.14,
          0.031,
        );
      box(g, m.redLamp, s * 5.09, 3.29, d / 2 + 0.375, 0.32, 0.24, 0.12);
      for (let j = 0; j < 7; j++) {
        box(
          g,
          m.iron,
          s * (5.77 + j * 1.65),
          5.55,
          d / 2 + 0.23,
          1.42,
          2,
          0.11,
        );
        box(
          g,
          m.glass,
          s * (5.77 + j * 1.65),
          5.55,
          d / 2 + 0.296,
          1.29,
          1.83,
          0.067,
        );
        box(
          g,
          m.rail,
          s * (5.77 + j * 1.65),
          5.55,
          d / 2 + 0.332,
          0.057,
          1.83,
          0.026,
        );
      }
      sign(
        g,
        labelMaterial("DARSE NORD", {
          sub: "CONTRÔLE D’ACCÈS",
          bg: "#263530",
          ink: "#d2d2b1",
          height: 128,
          border: false,
          night: 0.07,
        }),
        s * 10.33,
        2.59,
        d / 2 + 0.288,
        5.45,
        1.03,
      );
    }
    for (let j = 0; j < 4; j++) {
      const z = -9 + j * 5.7;
      box(g, m.iron, 0, 6.93, z, w - 0.31, 0.23, 0.2, true);
      box(g, m.lamp, 0, 6.78, z, 2.7, 0.07, 0.26);
      box(g, m.lamp, 10.4, 6.78, z, 2.7, 0.07, 0.26);
      this.light(g, 0, 6.51, z, 0xa6cbd4, 78, 17);
    }
    this.light(g, 0, 3.9, d / 2 + 1.5, 0xffae72, 76, 13);
    for (const [x, z, w0, d0, h0] of [
      [-9.2, 3.7, 3.1, 2.45, 2.75],
      [-8, -8.4, 3.31, 2.6, 1.6],
      [2.2, -3, 1.75, 1.9, 1.36],
      [1.3, -9.8, 2.7, 1.7, 1.15],
      [12.7, 1.8, 4, 2.45, 2.06],
      [14.7, -10.8, 3.2, 2.3, 2.75],
    ])
      this.crate(g, x, z, w0, d0, h0);
    box(g, m.rail, 7.15, 0.61, -8.59, 2.15, 1.08, 1.29, true);
    box(g, m.iron, 7.15, 1.2, -8.59, 2.35, 0.16, 1.42);
    this.collision(g, 7.15, -8.61, 2.2, 1.36, 1.29);
    box(g, m.black, 6.63, 1.53, -8.75, 1.11, 0.59, 0.19);
    box(g, m.glassLit, 6.63, 1.53, -8.64, 0.93, 0.45, 0.046);
    box(g, m.chrome, 7.55, 1.39, -8.6, 0.31, 0.26, 0.3);
    this.light(g, 7.01, 2.25, -8.83, 0x93eece, 18, 5);
    this.batch.add(g);
  }
  garage() {
    const m = this.m,
      g = corner(33.5, 103.2),
      w = 32,
      d = 20.6,
      h = 6.2;
    this.shell(g, w, d, h, 8.95, m.warehouse);
    mapped(g, m.concrete, 0, h + 0.05, 0, w + 0.66, 0.24, d + 0.61, 4);
    box(g, m.orange, 0, 4.74, d / 2 + 0.36, w, 0.4, 0.26);
    sign(
      g,
      labelMaterial("GARAGE ESTUAIRE", {
        sub: "ENTRETIEN  •  VÉHICULES DE CARACTÈRE",
        bg: "#293843",
        accent: "#ffb179",
      }),
      0,
      5.56,
      d / 2 + 0.3,
      12.7,
      1.25,
    );
    for (const s of [-1, 1]) {
      const x = s * 9.8;
      mapped(g, m.roof, x, 2.17, d / 2 + 0.27, 8.62, 4.35, 0.11, 2.2);
      box(g, m.rail, x, 3.91, d / 2 + 0.34, 7.4, 0.46, 0.07);
      box(g, m.lamp, x, 4.57, d / 2 + 0.55, 1.04, 0.11, 0.2);
      this.light(g, x, 4.34, d / 2 + 1.3, 0xffcc93, 47, 12);
    }
    for (let n = 0; n < 2; n++) {
      box(g, m.lamp, 0, 5.21, 1.5 - n * 5.8, 3.8, 0.09, 0.26);
      this.light(g, 0, 4.96, 1.5 - n * 5.8, 0xffd6a7, 65, 13);
    }
    for (let n = -1; n < 2; n++)
      this.crate(g, -10.3 + n * 2, -5, 1.6, 1.3, 1.1);
    this.batch.add(g);
  }
  service() {
    const m = this.m,
      g = corner(111, 96);
    surface(g, m.concrete, 0, 0.09, 0, 25, 18, 4);
    box(g, m.orange, 0, 4.88, 0, 23.2, 0.7, 11.64, true);
    box(g, m.aluminum, 0, 5.28, 0, 23.6, 0.16, 11.9, true);
    sign(
      g,
      labelMaterial("LE RESSAC", {
        sub: "STATION-SERVICE  /  ATELIER",
        bg: "#26423d",
        ink: "#fae5c7",
        accent: "#a7c7b5",
      }),
      0,
      4.83,
      5.85,
      8.2,
      0.62,
    );
    for (const x of [-7, 7]) {
      box(g, m.rail, x, 2.32, 0, 0.47, 4.64, 0.52, true);
      this.collision(g, x, 0, 0.51, 0.56, 4.7);
      box(g, m.concrete, x, 0.13, 0, 4.55, 0.25, 1.18);
      box(g, m.orange, x - 1.25, 0.84, 0, 0.8, 1.5, 0.65, true);
      box(g, m.iron, x - 1.25, 1.21, 0.35, 0.6, 0.63, 0.073);
      box(g, m.glassLit, x - 1.25, 1.33, 0.391, 0.42, 0.24, 0.043);
      box(g, m.black, x - 1.25, 0.42, 0.453, 0.55, 0.1, 0.1);
      box(g, m.lamp, x, 4.49, 0, 2.7, 0.08, 0.27);
      this.light(g, x, 4.43, 0, 0xb8e7d9, 60, 13);
      this.bollard(g, x - 2.14, 0);
      this.bollard(g, x + 1.8, 0);
    }
    this.lot(111, 96, 23, 11, "canopy");
    this.batch.add(g);
  }
  market() {
    const m = this.m;
    for (const [x, z, t] of [
      [91, 38, "LES VERRIÈRES"],
      [103, 38, "HALLE DE LA BAIE"],
      [114, 38, "MARAÎCHERS"],
    ])
      this.deliveryStand(x, z, t, "MARCHÉ ESTUARIEN", true);
  }
  deliveryStand(x, z, title, sub, large = false) {
    const g = corner(x, z),
      m = this.m,
      w = large ? 9 : 5.4,
      d = large ? 3.6 : 2.6;
    box(g, m.wood, 0, 0.62, 0, w, 0.94, d, true);
    box(g, m.curb, 0, 1.16, 0, w + 0.21, 0.16, d + 0.18, true);
    this.collision(g, 0, 0, w, d, 1.25);
    for (const s of [-1, 1])
      for (const t of [-1, 1])
        box(g, m.rail, s * (w * 0.44), 1.83, t * d * 0.41, 0.105, 2.96, 0.105);
    const b = box(
      g,
      large ? m.paint : m.orange,
      0,
      2.95,
      0,
      w + 0.35,
      0.17,
      d + 0.67,
      true,
    );
    b.rotation.x = -0.14;
    box(g, m.iron, 0, 2.62, d / 2 + 0.23, w + 0.21, 0.41, 0.08);
    sign(
      g,
      labelMaterial(title, { sub, bg: "#19303a", ink: "#f3d8ba", night: 0.31 }),
      0,
      2.63,
      d / 2 + 0.279,
      w - 0.24,
      0.34,
    );
    box(g, m.lamp, 0, 2.77, 0, w * 0.47, 0.067, 0.1);
    this.light(g, 0, 2.55, 0.75, 0xffbd8d, 17, 7);
    this.batch.add(g);
  }
  quayPavilion() {
    const m = this.m;
    const g = corner(-174.8, 11.4);
    surface(g, m.concrete, -2, 0.085, 0, 19, 24, 4.5);
    for (const z of [-9, -6, 6, 9]) {
      this.bollard(g, -7.5, z);
      box(g, m.iron, -7.5, 1.12, z, 0.136, 2.24, 0.136);
    }
    const a = labelMaterial("LES MARÉES", {
      sub: "BELVÉDÈRE DE PORT-LUMIÈRE",
      bg: "#243e42",
      ink: "#f5dec0",
      accent: "#a7c8b2",
    });
    box(g, m.iron, -5.85, 2.21, -8.2, 5.64, 0.8, 0.19);
    sign(g, a, -5.85, 2.21, -8.09, 5.52, 0.72);
    for (const x of [-8.12, -3.58])
      box(g, m.rail, x, 1.25, -8.2, 0.16, 2.64, 0.19);
    this.bench(g, -6.8, 4);
    this.bench(g, -6.8, -1.3);
    this.light(g, -3.5, 3.5, -0.75, 0xffc488, 66, 13);
    this.batch.add(g);
    this.lampPost(-181.35, 17, 1, false);
    this.deliveryStand(-174, -111.1, "BALISE NORD", "RELAIS PORTUAIRE");
  }
  bench(g, x, z) {
    const m = this.m;
    for (const s of [-1, 1]) {
      box(g, m.iron, x + s * 0.82, 0.27, z, 0.148, 0.54, 0.47, true);
      box(g, m.iron, x + s * 0.82, 0.72, z - 0.22, 0.11, 0.59, 0.11);
    }
    for (let j = 0; j < 3; j++) {
      box(g, m.wood, x, 0.51, z - 0.17 + j * 0.17, 2.14, 0.089, 0.146, true);
      box(g, m.wood, x, 0.69 + j * 0.14, z - 0.258, 2.14, 0.115, 0.08, true);
    }
  }
  bollard(g, x, z, big = false) {
    const m = this.m,
      r = big ? 0.23 : 0.102,
      h = big ? 0.65 : 0.9;
    cylinder(g, m.iron, x, h * 0.43, z, r, h * 0.86, true);
    cylinder(g, m.rail, x, h * 0.87, z, r * 1.22, h * 0.14, true);
    cylinder(g, big ? m.orange : m.yellow, x, h * 0.67, z, r * 1.035, 0.101);
  }
  crate(g, x, z, w, d, h) {
    const m = this.m;
    box(g, m.wood, x, h / 2 + 0.069, z, w, h, d, true);
    for (const s of [-1, 1]) {
      box(g, m.rail, x + s * w * 0.34, h + 0.1, z, 0.097, 0.07, d + 0.025);
      box(g, m.rail, x, h * 0.78, z + s * d * 0.505, w + 0.02, 0.1, 0.074);
      box(g, m.rail, x + s * w * 0.506, h * 0.78, z, 0.075, 0.1, d + 0.04);
      for (const q of [-1, 1])
        box(
          g,
          m.rope,
          x + s * w * 0.38,
          h * 0.49,
          z + q * d * 0.511,
          0.08,
          h * 0.96,
          0.06,
        );
    }
    this.collision(g, x, z, w, d, h + 0.09);
  }
  containerYard(x, z, count, rows, turned = false) {
    const m = this.m;
    for (let i = 0; i < count; i++)
      for (let j = 0; j < rows; j++) {
        const gx = x + (i - (count - 1) * 0.5) * (turned ? 3.2 : 7.3),
          gz = z + (j - (rows - 1) * 0.5) * (turned ? 7.1 : 3.34),
          g = corner(gx, gz);
        const w = turned ? 2.64 : 6.18,
          d = turned ? 6.18 : 2.64,
          h = 2.58,
          k = (i + j * 3) % 4;
        for (let n = 0; n < ((i + j) % 3 === 0 ? 2 : 1); n++) {
          const y = n * h + 0.11;
          mapped(g, m.cargo[(k + n) % 4], 0, y + h * 0.5, 0, w, h, d, 2.65);
          for (const s of [-1, 1]) {
            box(g, m.rail, 0, y + 0.095, s * d * 0.503, w + 0.02, 0.13, 0.083);
            box(
              g,
              m.rail,
              0,
              y + h - 0.08,
              s * d * 0.503,
              w + 0.02,
              0.13,
              0.083,
            );
            for (const u of [-1, 1])
              box(
                g,
                m.rail,
                u * w * 0.499,
                y + h * 0.5,
                s * d * 0.505,
                0.087,
                h,
                0.093,
              );
          }
          roadInk(
            g,
            m.roadGold,
            w * 0.33,
            y + 1.76,
            d * 0.508,
            0.34,
            0.24,
            0.023,
          );
          roadInk(
            g,
            m.roadWhite,
            w * 0.29,
            y + 1.59,
            d * 0.508,
            0.55,
            0.064,
            0.023,
          );
        }
        this.lot(gx, gz, w, d, "container");
        this.collision(g, 0, 0, w, d, (i + j) % 3 === 0 ? 5.3 : 2.7);
        this.batch.add(g);
      }
  }
  streetTree(x, z, factor = 1) {
    const m = this.m,
      g = corner(x, z),
      rr = this.rnd,
      h = 3.51 * factor;
    box(g, m.iron, 0, 0.088, 0, 1.76, 0.09, 1.76);
    box(g, m.dirt, 0, 0.139, 0, 1.51, 0.035, 1.51);
    const trunk = put(
      g,
      m.trunks,
      new T.CylinderGeometry(0.095 * factor, 0.17 * factor, h, 8),
      0,
      h / 2 + 0.09,
      0,
      true,
    );
    trunk.rotation.z = 0.035;
    const coast = x < -160;
    const lobes = new T.IcosahedronGeometry(1, 1),
      tuft = new T.IcosahedronGeometry(1, 0),
      a = lobes.attributes.position;
    // Seeded mottling deforms identical seam vertices equally before the crown is clustered.
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i),
        y = a.getY(i),
        z = a.getZ(i),
        v =
          1 +
          0.14 *
            Math.sin(x * 17 + y * 11.1 + z * 19) *
            Math.cos(y * 21 - z * 8.6);
      a.setXYZ(i, x * v, y * v, z * v);
    }
    lobes.computeVertexNormals();
    for (let i = 0; i < 8; i++) {
      const t = (i / 7) * TAU + rr() * 0.48,
        rad = factor * (coast ? 1.05 : 0.71) * (rr() * 0.58 + 0.58),
        dx = i === 7 ? 0 : Math.cos(t) * rad,
        dz = i === 7 ? 0 : Math.sin(t) * rad * 0.89,
        dy = h + (i === 7 ? 1.21 : 0.11 + rr() * 0.79) * factor;
      beam(
        g,
        m.trunks,
        [0.05 * factor, h * (0.64 + rr() * 0.12), 0],
        [dx * 0.98, dy - 0.14, dz * 0.98],
        0.056 * factor,
      );
      const a = put(g, m.leaves[i % 4], lobes, dx, dy, dz, true);
      a.scale.set(
        factor * (0.66 + rr() * 0.29),
        factor * (coast ? 0.51 + rr() * 0.21 : 0.72 + rr() * 0.25),
        factor * (0.61 + rr() * 0.29),
      );
      a.rotation.set(rr() * 0.4, rr() * 2, rr() * 0.3);
      for (let j = 0; j < 3; j++) {
        const ph = t + (j - 1) * 1.83,
          cc = put(
            g,
            m.leaves[(i + j + 1) % 4],
            tuft,
            dx + Math.cos(ph) * 0.69 * factor,
            dy + (rr() - 0.39) * 0.72 * factor,
            dz + Math.sin(ph) * 0.66 * factor,
          );
        const s = factor * (0.34 + rr() * 0.23);
        cc.userData.trim = true;
        cc.scale.set(s * (1 + rr() * 0.5), s * (coast ? 0.68 : 1.13), s);
        cc.rotation.set(rr(), rr() * 2, rr());
      }
    }
    this.collision(g, 0, 0, 0.33, 0.31, h);
    this.batch.add(g);
  }
  garden(x, z, w, d) {
    const m = this.m,
      g = corner(x, z);
    // Flush with the sidewalk so idle/walking feet do not clip through the lawn.
    mapped(g, m.seaWall, 0, 0.049, 0, w, 0.073, d, 3, true);
    surface(g, m.grass, 0, 0.086, 0, w - 0.24, d - 0.24, 4.2);
    for (let i = 0; i < 4; i++)
      this.streetTree(
        x - w * 0.37 + w * 0.246 * i,
        z + (i % 2) * d * 0.4 - d * 0.2,
        0.72 + (i % 2) * 0.1,
      );
    for (let i = 0; i < 23; i++) {
      const v = put(
        g,
        m.leaves[i % 4],
        new T.IcosahedronGeometry(0.6, 1),
        (this.rnd() - 0.5) * (w - 1),
        0.31,
        (this.rnd() - 0.5) * (d - 1),
      );
      v.scale.set(1.08, 0.44, 0.85);
    }
    this.batch.add(g);
  }
  harbor() {
    const m = this.m,
      g = corner(-186, 0);
    box(g, m.seaWall, 0, -0.05, -5.4, 1.35, 0.31, 337);
    box(g, m.rail, 0, 1.015, -5.4, 0.071, 0.071, 335);
    box(g, m.rail, 0, 0.62, -5.4, 0.056, 0.064, 334);
    for (let z = -170; z < 160; z += 3.75)
      box(g, m.iron, 0, 0.58, z, 0.082, 1.15, 0.091);
    this.batch.add(g);
    this.solids.add(-186, -5.4, 0.29, 335, 1.14);
    for (const [x, z, s] of [
      [-179, -143, 1.05],
      [-177, -67, 0.88],
      [-197, 50, 0.96],
      [-212, -209, 1.34],
      [-237, -262, 1.16],
    ])
      this.crane(x, z, s);
    for (const [x, z, w, d] of [
      [-200, 53, 24, 25],
      [-222, -214, 93, 35],
      [-302, -247, 91, 41],
    ]) {
      const p = corner(x, z);
      mapped(p, m.seaWall, 0, -1.07, 0, w, 2, d, 7, false);
      surface(p, m.concrete, 0, 0, 0, w, d, 5.5);
      this.batch.add(p);
    }
    for (let j = 0; j < 5; j++) {
      const zz = -155 + j * 71;
      if (j === 4) continue;
      const s = corner(-170, zz);
      box(s, m.iron, 0, 2.96, 0, 4.77, 0.89, 0.18);
      for (const x of [-2.15, 2.15])
        box(s, m.rail, x, 1.54, 0, 0.095, 3.08, 0.11);
      const text = [
        "DARSE NORD",
        "QUAI DES MARÉES",
        "LES DOCKS",
        "PORT-LUMIÈRE",
      ][j];
      sign(
        s,
        labelMaterial(text, {
          sub: "PORT AUTONOME · SECTEUR 01",
          bg: "#29434d",
          accent: "#e6ae83",
          night: 0.24,
        }),
        0,
        2.96,
        0.106,
        4.66,
        0.76,
      );
      this.batch.add(s);
      this.lampPost(-178.8, zz - 5, 1, false);
    }
    this.workboat(-211, 84, -0.33);
    this.workboat(-272, -211, 0.61, 0.86);
    const distant = corner(-306, -188);
    mapped(distant, m.seaWall, 0, -0.62, 0, 66, 2.06, 11, 5, false);
    box(distant, m.concrete, 28, 2.3, 0, 8, 4.6, 8, true);
    const tower = put(
      distant,
      m.concrete,
      new T.CylinderGeometry(1.85, 2.59, 17.3, 14),
      28,
      10.8,
      0,
    );
    tower.castShadow = true;
    cylinder(distant, m.paint, 28, 16.61, 0, 2.16, 2.15);
    cylinder(distant, m.lamp, 28, 20.08, 0, 2.1, 1.75);
    cylinder(distant, m.roof, 28, 21.25, 0, 2.53, 0.64);
    cylinder(distant, m.rail, 28, 22.25, 0, 0.1, 1.55);
    this.batch.add(distant);
    for (const [x, z] of [
      [-147, -169],
      [-79, -169],
      [-6, -169],
      [70, -169],
      [142, -169],
      [177, -78],
      [177, -10],
      [177, 126],
      [-154, 158],
      [64, 158],
    ]) {
      const s = corner(x, z);
      for (let k = -2; k <= 2; k++) {
        box(s, m.rail, k * 2.08, 0.43, 0, 0.16, 0.86, 0.21);
        if (k < 2) box(s, m.rail, k * 2.08 + 1.04, 0.55, 0, 2.08, 0.12, 0.081);
      }
      this.batch.add(s);
    }
  }
  semaphorePlinth() {
    const { x, z, yaw, width, baseY } = SEMAPHORE;
    const m = this.m,
      g = corner(x, z);
    // A solid low foundation at the same coordinates in Plan and 3D. The volets are above the path.
    mapped(g, m.concrete, 0, 0.14, 0, width, 0.28, width, 2.2);
    box(g, m.rail, 0, baseY - 0.035, 0, width - 0.21, 0.07, width - 0.21);
    this.collision(g, 0, 0, width, width, 0.36);
    this.collision(g, 0, 0, 1.03, 1.03, 3.04, 0.31);
    const plate = labelMaterial("MARÉES", {
      sub: "PORT-LUMIÈRE  /  1938",
      bg: "#263c3c",
      ink: "#f0ce98",
      night: 0.34,
    });
    sign(g, plate, -width / 2 - 0.006, 0.188, 0.16, 1.08, 0.19, -Math.PI / 2);
    this.light(
      g,
      1.23 * Math.sin(yaw),
      3.33,
      1.23 * Math.cos(yaw),
      0xffba73,
      15,
      5.5,
    );
    this.batch.add(g);
  }
  streetFinish() {
    const m = this.m;
    for (const { x, z, w, d } of QUAY_WALK) {
      const g = corner(x, z);
      surface(g, m.quayPavers, 0, 0.069, 0, w, d, 3.1);
      for (const side of [-1, 1]) {
        box(g, m.rail, side * (w * 0.5 - 0.1), 0.073, 0, 0.105, 0.012, d);
        for (let q = -d / 2 + 2; q < d / 2 - 1; q += 4.2)
          box(g, m.rope, side * (w * 0.5 - 0.26), 0.08, q, 0.19, 0.014, 0.072);
      }
      this.batch.add(g);
    }
    const { x, z, w, d } = SILLAGE_SQUARE,
      square = corner(x, z);
    surface(square, m.quayPavers, 0, 0.071, 0, w, d, 3.4);
    for (const side of [-1, 1]) {
      box(square, m.rail, 0, 0.075, side * (d / 2 - 0.19), w, 0.009, 0.17);
      box(
        square,
        m.rope,
        0,
        0.077,
        side * (d / 2 - 0.37),
        w - 0.26,
        0.009,
        0.074,
      );
    }
    for (let i = 0; i < 4; i++) {
      const tile = box(
        square,
        i % 2 ? m.rope : m.rail,
        (i - 1.5) * 2.8,
        0.08,
        0,
        0.51,
        0.008,
        0.51,
      );
      tile.rotation.y = Math.PI / 4;
    }
    const plaque = labelMaterial("PARVIS DU SILLAGE", {
      sub: "CAFÉ   •   MARCHÉ   •   QUAI DES MARÉES",
      bg: "#334a43",
      night: 0.36,
    });
    const pavement = surface(square, plaque, 0, 0.081, 1.33, 3.42, 0.63, 1);
    // The generic surface helper tiles in world space. The inlay is one complete print.
    const uv = pavement.geometry.attributes.uv;
    uv.setXY(0, 0, 1);
    uv.setXY(1, 1, 1);
    uv.setXY(2, 0, 0);
    uv.setXY(3, 1, 0);
    this.batch.add(square);
  }
  workboat(x, z, yaw, scale = 1, floats = false) {
    const m = this.m,
      g = corner(x, z, yaw);
    g.scale.setScalar(scale);
    const hull = new T.Shape();
    hull.moveTo(-2.9, 10);
    hull.lineTo(2.9, 10);
    hull.lineTo(3.18, 6.4);
    hull.lineTo(3.12, -7.9);
    hull.quadraticCurveTo(2.5, -11.4, 0, -13.55);
    hull.quadraticCurveTo(-2.6, -11.5, -3.12, -7.9);
    hull.lineTo(-3.18, 6.4);
    hull.closePath();
    function deck(mat, y, depth) {
      const geometry = new T.ExtrudeGeometry(hull, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.24,
        bevelSize: 0.24,
        bevelSegments: 1,
        steps: 1,
        curveSegments: 5,
      });
      const o = put(g, mat, geometry, 0, y, 0);
      o.rotation.x = Math.PI / 2;
      return o;
    }
    deck(m.paint, -0.57, 1.46);
    deck(m.iron, 0.24, 0.72);
    deck(m.wood, 0.3, 0.07);
    box(g, m.white, 0, 1.66, -2.04, 5.04, 2.65, 5.24);
    box(g, m.rail, 0, 3.08, -2.04, 5.38, 0.27, 5.51);
    box(g, m.aluminum, 0, 3.24, -2.04, 5.42, 0.13, 5.57);
    for (let i = -2; i <= 2; i++) {
      box(g, m.iron, i * 0.88, 2.38, -4.694, 0.79, 0.71, 0.12);
      box(g, m.glass, i * 0.88, 2.4, -4.77, 0.707, 0.62, 0.047);
    }
    for (const s of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        box(g, m.iron, s * 2.551, 2.37, -2.08 + i * 1.18, 0.12, 0.68, 0.97);
        box(g, m.glass, s * 2.627, 2.37, -2.08 + i * 1.18, 0.046, 0.57, 0.84);
      }
      for (let z = -7.6; z < 10; z += 2.42) {
        box(g, m.rail, s * 3.03, 0.79, z, 0.075, 1.03, 0.079);
        if (z < 8) box(g, m.rail, s * 3.03, 1.25, z + 1.21, 0.058, 0.057, 2.49);
      }
      for (let i = 0; i < 3; i++) {
        const r = put(
          g,
          m.black,
          new T.TorusGeometry(0.345, 0.103, 6, 12),
          s * 3.36,
          -0.055,
          2.4 + i * 2.24,
        );
        r.rotation.y = Math.PI / 2;
      }
    }
    box(g, m.orange, 0, 4.01, 0.2, 1.11, 1.5, 1.05);
    box(g, m.iron, 0, 4.76, 0.2, 1.13, 0.21, 1.05);
    beam(g, m.rail, [0, 3.17, -2.91], [0, 6.26, -2.91], 0.103);
    beam(g, m.rail, [-1.36, 5.2, -2.91], [1.36, 5.2, -2.91], 0.068);
    box(g, m.lamp, 0, 6.25, -2.91, 0.19, 0.2, 0.17);
    box(g, m.redLamp, -1.3, 5.25, -2.91, 0.124, 0.13, 0.12);
    for (let i = 0; i < 3; i++) {
      box(g, m.cargo[i], -0.1, 0.84, 2 + i * 2.35, 3.63, 1.05, 1.85);
      box(g, m.rail, -0.1, 1.4, 2 + i * 2.35, 3.72, 0.13, 1.93);
    }
    if (floats) {
      box(g, m.rope, 0, 0.45, -6.72, 5.86, 0.17, 1.77);
      for (const side of [-1, 1]) {
        box(g, m.orange, side * 1.87, 0.94, 5.73, 0.96, 0.59, 1.32);
        box(g, m.aluminum, side * 1.89, 1.25, 5.73, 1.0, 0.08, 1.37);
        box(g, m.lamp, side * 2.52, 2.96, -3.36, 0.18, 0.2, 0.25);
        for (let i = 0; i < 4; i++)
          box(
            g,
            m.white,
            side * 3.29,
            -0.15 + i * 0.085,
            -7.6,
            0.039,
            0.036,
            0.27,
          );
      }
      beam(g, m.rail, [1.39, 0.62, 3.87], [0, 2.93, 4.04], 0.12);
      beam(g, m.iron, [0, 2.93, 4.04], [-1.3, 2.92, 6.43], 0.1);
      this.harborMotion.float(g, x, -1.02, z, 2.44, 0.13);
    } else this.batch.add(g);
  }
  crane(x, z, s) {
    const m = this.m,
      g = corner(x, z),
      h = 18 * s,
      arm = 22.8 * s,
      steel = m.paint,
      b = -s * 2.8;
    for (const dz of [-2.6 * s, 2.6 * s]) {
      beam(
        g,
        steel,
        [-2.6 * s, 0.23, dz],
        [-0.64 * s, h, dz * 0.6],
        0.39 * s,
        0.43 * s,
      );
      beam(
        g,
        steel,
        [2.35 * s, 0.23, dz],
        [0.63 * s, h, dz * 0.6],
        0.39 * s,
        0.43 * s,
      );
      beam(g, steel, [-2.6 * s, 0.24, dz], [2.33 * s, 0.24, dz], 0.37 * s);
      beam(
        g,
        steel,
        [-1.99 * s, h * 0.46, dz * 0.83],
        [1.8 * s, h * 0.46, dz * 0.83],
        0.42 * s,
      );
      beam(
        g,
        steel,
        [-1.82 * s, h * 0.46, dz * 0.83],
        [0.64 * s, h, dz * 0.6],
        0.21 * s,
      );
      beam(
        g,
        steel,
        [1.52 * s, h * 0.46, dz * 0.83],
        [-0.64 * s, h, dz * 0.6],
        0.21 * s,
      );
    }
    beam(g, steel, [b, h, -1.2 * s], [b - arm, h, -1.2 * s], 0.36 * s);
    beam(g, steel, [b, h, 1.2 * s], [b - arm, h, 1.2 * s], 0.36 * s);
    beam(
      g,
      steel,
      [b + 4.2 * s, h, 0],
      [b - arm + 0.6 * s, h + 0.86 * s, 0],
      0.24 * s,
    );
    beam(g, steel, [1.2 * s, h, 0], [b, h + 5.05 * s, 0], 0.48 * s);
    beam(g, m.iron, [b, h + 5 * s, 0], [b - arm, h, 0], 0.085 * s);
    beam(g, m.iron, [b, h + 5 * s, 0], [b + 5.21 * s, h, 0], 0.084 * s);
    for (let i = 1; i <= 8; i++) {
      const k = b - ((i - 1) * arm) / 8;
      beam(g, steel, [k, h, 1.18 * s], [k - arm / 8, h, -1.18 * s], 0.105 * s);
    }
    box(g, m.iron, b + 3 * s, h + 0.38 * s, 0, 2.94 * s, 1.34 * s, 2.45 * s);
    box(
      g,
      m.glassLit,
      b + 2.6 * s,
      h + 0.69 * s,
      1.27 * s,
      1.36 * s,
      0.65 * s,
      0.13 * s,
    );
    box(g, m.redLamp, b, h + 5.06 * s, 0, 0.28 * s, 0.37 * s, 0.31 * s);
    beam(
      g,
      m.iron,
      [b - arm * 0.68, h, 0],
      [b - arm * 0.68, h * 0.49, 0],
      0.083 * s,
    );
    box(g, m.yellow, b - arm * 0.68, h * 0.48, 0, 1.4 * s, 0.39 * s, 1.63 * s);
    box(g, m.lamp, b - arm * 0.99, h - 0.22, 0, 0.28, 0.12, 0.21);
    this.batch.add(g);
  }
  skyline() {
    const rr = this.rnd;
    for (let i = 0; i < 34; i++) {
      const x = -371 + (i % 17) * 35 + rr() * 15,
        z = -255 - Math.floor(i / 17) * 85 - rr() * 29,
        h = 12 + rr() * 43 + (i % 8 === 2 ? 16 : 0);
      this.building(
        x,
        z,
        13 + rr() * 15,
        14 + rr() * 14,
        h,
        ["slate", "glass", "cream", "glass", "brick"][i % 5],
        true,
      );
    }
    const b = corner(-69, -278);
    mapped(b, this.m.seaWall, 0, -1.1, 0, 645, 2.2, 170, 10, false);
    this.batch.add(b);
  }
}

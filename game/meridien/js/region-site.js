import * as T from "../../../assets/vendor/three/three.module.js";
import {
  TILE,
  WEST,
  NORTH,
  NX,
  NZ,
  tileAt,
  bandAt,
  altitude,
  scenery,
} from "./region.mjs";
import { paper } from "./region-paper.js";
const cube = new T.BoxGeometry(1, 1, 1),
  cone = new T.ConeGeometry(0.5, 1, 7),
  stone = new T.IcosahedronGeometry(0.58, 0),
  dummy = new T.Object3D();
const parts = {
  pane: [cube, 0x536a70],
  door: [cube, 0x58605a],
  wall: [cube, 0xdacfaf],
  roof: [cone, 0x955e4b],
  trunk: [cube, 0x6a5444],
  pine: [cone, 0x375c4a],
  tree: [stone, 0x5c794d],
  scrub: [stone, 0x93895b],
  rock: [stone, 0x817d74],
};
for (const part of Object.values(parts))
  part[1] = new T.MeshStandardMaterial({ color: part[1], roughness: 1 });
function makeTile(i, j) {
  const g = new T.Group(),
    x = WEST + i * TILE,
    z = NORTH + j * TILE;
  g.position.set(x, 0, z);
  const tex = new T.CanvasTexture(paper(i, j));
  tex.colorSpace = T.SRGBColorSpace;
  const geo = new T.PlaneGeometry(TILE, TILE, 32, 32);
  geo.rotateX(-Math.PI / 2);
  geo.translate(TILE / 2, 0, TILE / 2);
  const v = geo.attributes.position;
  for (let n = 0; n < v.count; n++)
    v.setY(n, altitude(v.getX(n) + x, v.getZ(n) + z));
  geo.computeVertexNormals();
  const ground = new T.Mesh(
    geo,
    new T.MeshStandardMaterial({ map: tex, roughness: 1 }),
  );
  g.add(ground);
  const batches = {};
  const put = (k, a, y, b, w, h, d) => {
    (batches[k] ??= []).push([a - x, y, b - z, w, h, d]);
  };
  for (const p of scenery(i, j)) {
    const { x: a, z: b, w, h, kind } = p,
      y = altitude(a, b);
    if (kind === "house") {
      put("wall", a, y + h / 2, b, w, h, w * 0.86);
      put("roof", a, y + h + 1.8, b, w * 1.45, 3.6, w * 1.3);
      put("door", a, y + 1.18, b + w * 0.434, 1.2, 2.36, 0.16);
      for (const side of [-1, 1])
        put(
          "pane",
          a + side * w * 0.28,
          y + 2.25,
          b + w * 0.434,
          w * 0.16,
          1.5,
          0.16,
        );
    } else if (kind === "pine" || kind === "tree") {
      put("trunk", a, y + h * 0.23, b, w * 0.22, h * 0.46, w * 0.22);
      put(kind, a, y + h * 0.65, b, w, h * 0.7, w);
    } else put(kind, a, y + h * 0.35, b, w, h, w);
  }
  for (const [k, list] of Object.entries(batches)) {
    const o = new T.InstancedMesh(...parts[k], list.length);
    list.forEach(([a, y, b, w, h, d], n) => {
      dummy.position.set(a, y, b);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      o.setMatrixAt(n, dummy.matrix);
    });
    g.add(o);
  }
  g.userData.release = () => {
    geo.dispose();
    tex.dispose();
    ground.material.dispose();
    for (const m of g.children) if (m.isInstancedMesh) m.dispose();
  };
  return g;
}
export class RegionSite {
  constructor(scene) {
    this.scene = scene;
    this.tiles = new Map();
    this.sea = new T.Mesh(
      new T.PlaneGeometry(6000, 14500),
      new T.MeshStandardMaterial({ color: 0x557f89, roughness: 0.55 }),
    );
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.set(800, -1.8, 0);
    this.sea.visible = false;
    scene.add(this.sea);
  }
  present(eye) {
    this.sea.visible = eye.x > 1100;
    const [a, b] = tileAt(eye.x, eye.z);
    if (this.a === a && this.b === b) return;
    this.a = a;
    this.b = b;
    const keep = new Set();
    for (let i = Math.max(0, a - 1); i <= Math.min(NX - 1, a + 1); i++)
      for (let j = Math.max(0, b - 1); j <= Math.min(NZ - 1, b + 1); j++) {
        if (!bandAt(WEST + i * TILE + 1, NORTH + j * TILE + 1)) continue;
        const k = i + ":" + j;
        keep.add(k);
        if (!this.tiles.has(k)) {
          const g = makeTile(i, j);
          this.tiles.set(k, g);
          this.scene.add(g);
        }
      }
    for (const [k, g] of this.tiles)
      if (!keep.has(k)) {
        this.scene.remove(g);
        g.userData.release();
        this.tiles.delete(k);
      }
  }
}

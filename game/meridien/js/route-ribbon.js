import * as T from "three";
import { distance, onRoad } from "./core.mjs";

const count = 12;
export class RouteRibbon {
  constructor(scene) {
    this.geom = new T.BufferGeometry();
    this.vertices = new T.BufferAttribute(
      new Float32Array(12 * 3 * count),
      3,
    ).setUsage(T.DynamicDrawUsage);
    this.geom.setAttribute("position", this.vertices);
    this.mesh = new T.Mesh(
      this.geom,
      new T.MeshBasicMaterial({
        color: 0xffc487,
        transparent: true,
        opacity: 0.8,
        fog: false,
        depthWrite: false,
        side: T.DoubleSide,
        toneMapped: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  show(path, driver) {
    this.mesh.visible = path?.length > 1;
    if (!this.mesh.visible || this.path === path) return;
    this.path = path;
    const gap = driver ? 5.8 : 2.65,
      length = driver ? 39 : 22;
    const w = driver ? 0.55 : 0.27,
      d = driver ? 0.63 : 0.31;
    let travel = Math.min(gap * 0.85, 2.75),
      behind = 0,
      i = 0;
    for (let k = 1; k < path.length && travel < length && i < 12 * count; k++) {
      const a = path[k - 1],
        b = path[k],
        segment = distance(a, b);
      if (segment < 0.05) continue;
      const x = (b.x - a.x) / segment,
        z = (b.z - a.z) / segment;
      while (travel < behind + segment && travel < length && i < 12 * count) {
        const step = travel - behind,
          cx = a.x + x * step,
          cz = a.z + z * step;
        const y = onRoad(cx, cz) ? 0.035 : 0.13;
        const tip = [cx + x * d, y, cz + z * d],
          inner = [cx + x * d * 0.18, y, cz + z * d * 0.18];
        for (const side of [-1, 1]) {
          const edge = [
              cx - x * d * 0.35 + side * z * w,
              y,
              cz - z * d * 0.35 - side * x * w,
            ],
            tail = [
              cx - x * d * 0.75 + side * z * w,
              y,
              cz - z * d * 0.75 - side * x * w,
            ];
          for (const p of [tip, edge, inner, edge, tail, inner])
            this.vertices.setXYZ(i++, ...p);
        }
        travel += gap;
      }
      behind += segment;
    }
    this.mesh.visible = i > 0;
    this.geom.setDrawRange(0, i);
    this.vertices.needsUpdate = true;
  }
}

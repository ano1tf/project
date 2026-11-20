import * as T from "three";
import { labelMaterial } from "./materials.js";
import { distance } from "./core.mjs";
import { DOCKS, launchAt } from "./sondes.mjs";

export function buildSondes(world, { box, corner, cylinder, sign, beam }) {
  const { m } = world;
  const plate = labelMaterial("NAVETTE DES SONDES", {
    sub: "S2   ·   MARÉES ↔ GRÈVES",
    bg: "#1e434a",
    ink: "#f0edcc",
    accent: "#e9bc7c",
    night: 0.5,
  });
  for (const [id, d] of Object.entries(DOCKS)) {
    const g = corner(d.x, d.z),
      end = d.waterX - d.x,
      along = d.side === 1 ? 1 : -1;
    const post = along * 1.48;
    // Dry waiting area and gate: beyond the rail the platform is crew-only.
    box(g, m.iron, post, 1.53, 2.08, 0.18, 3.06, 0.18);
    box(g, m.iron, post, 2.42, 0.32, 0.097, 0.88, 3.28);
    sign(
      g,
      plate,
      post - along * 0.057,
      2.42,
      0.32,
      3.1,
      0.78,
      (-along * Math.PI) / 2,
    );
    for (const z of [-0.83, -0.15, 0.53, 1.21])
      box(g, m.roadGold, post - along * 1.84, 0.103, z, 0.16, 0.02, 0.46);
    box(
      g,
      m.concrete,
      end * 0.68,
      -0.7,
      2.66,
      Math.abs(end) * 0.73,
      0.32,
      1.48,
    );
    for (const x of [end * 0.53, end * 0.92]) {
      cylinder(g, m.iron, x, -1.21, 2.67, 0.17, 1.8);
      box(g, m.yellow, x, -0.28, 2.68, 0.16, 0.6, 0.16);
    }
    beam(
      g,
      m.rail,
      [along * 3.0, 0.19, 2.8],
      [end * 0.7, -0.46, 2.8],
      0.099,
      0.11,
    );
    beam(
      g,
      m.rail,
      [along * 3.0, 0.19, 3.45],
      [end * 0.7, -0.46, 3.45],
      0.099,
      0.11,
    );
    const numbered = labelMaterial(
      id === "port" ? "01 · LES MARÉES" : "02 · LES GRÈVES",
      {
        sub: "BILLETTERIE À LA BARRIÈRE",
        bg: "#243139",
        ink: "#e8d6a7",
        accent: "#d3a45f",
      },
    );
    sign(
      g,
      numbered,
      post - along * 0.082,
      1.47,
      1.34,
      1.24,
      0.55,
      (-along * Math.PI) / 2,
    );
    world.batch.add(g);
  }
  const g = corner(0, 0);
  const hull = new T.Shape();
  hull.moveTo(-1.36, 3.68);
  hull.lineTo(1.36, 3.68);
  hull.lineTo(1.5, -1.94);
  hull.quadraticCurveTo(1.22, -3.05, 0, -4.28);
  hull.quadraticCurveTo(-1.27, -3.04, -1.5, -1.94);
  hull.closePath();
  for (const [mat, y, h] of [
    [m.iron, -0.29, 1.19],
    [m.paint, -0.04, 0.28],
    [m.wood, 0.025, 0.06],
  ]) {
    const geo = new T.ExtrudeGeometry(hull, {
      depth: h,
      bevelEnabled: false,
      curveSegments: 6,
    });
    geo.rotateX(Math.PI / 2);
    const mesh = new T.Mesh(geo, mat);
    mesh.position.y = y;
    g.add(mesh);
  }
  // The clear area at the centre is the single passenger station.
  box(g, m.white, 0, 0.81, -1.81, 2.26, 1.57, 2.22);
  box(g, m.rail, 0, 1.66, -1.79, 2.48, 0.16, 2.47);
  box(g, m.glassLit, 0, 1.115, -2.947, 1.95, 0.6, 0.065);
  box(g, m.iron, 0, 1.11, -2.985, 0.07, 0.66, 0.05);
  for (const s of [-1, 1]) {
    box(g, m.glassLit, s * 1.171, 1.13, -1.81, 0.074, 0.61, 1.67);
    box(g, m.rail, s * 1.4, 0.75, 1.47, 0.06, 0.065, 4.12);
    for (const z of [-0.48, 1.24, 3.56])
      box(g, m.rail, s * 1.4, 0.39, z, 0.075, 0.78, 0.076);
    box(g, m.wood, s * 1.09, 0.35, 2.02, 0.37, 0.09, 1.47);
    box(g, m.lamp, s * 1.15, 1.57, -0.73, 0.12, 0.15, 0.15);
  }
  box(g, m.iron, 0, 0.58, 3.58, 2.62, 0.74, 0.15);
  box(g, m.orange, 0.9, 1.83, -1.22, 0.61, 0.24, 0.88);
  cylinder(g, m.rail, 0, 2.11, -2.05, 0.043, 0.9);
  box(g, m.lamp, 0, 2.57, -2.05, 0.12, 0.17, 0.12);
  const serial = labelMaterial("SONDES", {
    sub: "S2 · PORT-LUMIÈRE",
    bg: "#31505a",
    ink: "#ffebc4",
    accent: "#ffd18a",
  });
  sign(g, serial, 0, 0.547, 3.661, 1.68, 0.38);
  g.visible = false;
  world.scene.add(g);
  return {
    root: g,
    present(eye, time) {
      const p = launchAt(time);
      g.visible = distance(eye, p) < 91;
      if (g.visible) {
        g.position.set(p.x, p.y, p.z);
        g.rotation.y = -p.heading;
      }
    },
  };
}

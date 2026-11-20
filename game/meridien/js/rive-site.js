import * as T from "three";
import { labelMaterial } from "./materials.js";
import {
  GREVES_BAY,
  GREVES_BRIDGE,
  GREVES_LAMPS,
  GREVES_RAILS,
  GREVES_WORKSHOP,
  GREVES_YARD,
  LOG_TABLE,
  RIVE,
} from "./rive-layout.mjs";

const dims = (r) => [
  (r.minX + r.maxX) / 2,
  (r.minZ + r.maxZ) / 2,
  r.maxX - r.minX,
  r.maxZ - r.minZ,
];

// The volumes are installed before the first frame, including in Plan. Only
// the interior props use the optional, editable Atelier assembly.
export class RiveSite {
  constructor(world) {
    this.world = world;
    const a = GREVES_WORKSHOP;
    world.lot(a.x, a.z, a.w, a.d, "interior");
    for (const [x, z, w, d, h, b] of a.solids)
      world.solids.add(a.x + x, a.z + z, w, d, h, b);
    const t = LOG_TABLE;
    world.solids.add(t.x, t.z, t.w, t.d, t.h + 0.11);
    for (const f of GREVES_YARD) {
      world.lot(f.x, f.z, f.w, f.d, f.kind);
      world.solids.add(f.x, f.z, f.w, f.d, f.h);
    }
    for (const [x, z, w, d] of GREVES_RAILS) world.solids.add(x, z, w, d, 1.2);
    for (const [x, z] of GREVES_LAMPS)
      world.lamps.push({
        x,
        z,
        y: 4.65,
        rgb: 0xffbb85,
        power: 49,
        span: 14,
        sheltered: false,
      });
    for (const [x, z] of [
      [a.x - 5, a.z + 1.7],
      [a.x + 5.1, a.z - 3.2],
    ])
      world.lamps.push({
        x,
        z,
        y: 3.95,
        rgb: 0xffd094,
        power: 52,
        span: 10,
        sheltered: true,
      });
  }
  floor({ x, z }) {
    const a = GREVES_WORKSHOP;
    return Math.abs(x - a.x) < a.w / 2 && Math.abs(z - a.z) < a.d / 2
      ? 0.09
      : null;
  }
  setRecord(outcome) {
    this.record = outcome;
    if (this.recordCards)
      for (const [id, card] of Object.entries(this.recordCards))
        card.visible = (outcome ?? "open") === id;
  }
  build({ box, beam, sign, corner, mapped, surface, cylinder }) {
    const { m, batch } = this.world;
    const deck = GREVES_BRIDGE,
      a = GREVES_WORKSHOP;
    const g = corner(0, 0);
    const mark = (x, z, w, d, mat = m.roadWhite, y = 0.035) =>
      box(g, mat, x, y, z, w, 0.012, d);
    const pavement = (r, mat, y) => {
      const [x, z, w, d] = dims(r);
      surface(g, mat, x, y, z, w, d, 4, Math.ceil(w / 5), Math.ceil(d / 5));
    };
    const [x, z, w, d] = dims(RIVE.bounds);
    mapped(g, m.seaWall, x, -0.97, z, w, 1.96, d, 5, false);
    pavement(RIVE.bounds, m.concrete, 0.014);
    pavement(RIVE.road, m.road, 0.026);
    pavement(RIVE.apron, m.road, 0.024);
    pavement(RIVE.turn, m.road, 0.023);
    for (let px = -319; px < -163; px += 6.3)
      mark(px, deck.z, 2.8, 0.102, m.roadWhite, 0.04);
    for (const s of [-1, 1]) {
      mark(-173.9, deck.z + s * 4.72, 22.4, 0.099);
    }
    for (const side of [-1, 1]) {
      mark(-283, deck.z + side * 4.72, 69.2, 0.085, m.roadWhite);
      const z = deck.z + side * 6.1;
      mapped(g, m.concrete, -216.5, -0.169, z, 60.8, 0.38, 2.1, 4, false);
      // Flush hatched shoulder continues the crossing onto both banks.
      surface(g, m.quayPavers, -229.8, 0.032, z, 102.6, 2.0, 3, 25, 1);
      mark(-229.8, deck.z + side * 4.95, 102.4, 0.095, m.roadGold, 0.047);
    }
    mapped(g, m.seaWall, -216.6, -0.37, deck.z, 60.6, 0.72, 14.9, 5, false);
    surface(g, m.road, -216.7, 0.003, deck.z, 60.5, 10.26, 5, 22, 5);
    for (const px of [-189, -211.5, -233.5, -244.6]) {
      for (const z of [deck.z - 5.3, deck.z + 5.3]) {
        mapped(g, m.seaWall, px, -2.03, z, 2.24, 4.28, 2.25, 3);
        box(g, m.iron, px, -0.43, z, 3.07, 0.38, 3.1, true);
      }
    }
    // Two blue-black trusses with ochre plates. The low parapet is also solid.
    for (const z of deck.railZ) {
      const inward = z < deck.z ? 0.19 : -0.19;
      for (const y of [0.28, 4.66])
        beam(g, m.rail, [-238.5, y, z], [-194, y, z], 0.37, 0.34);
      for (let i = 0; i <= 6; i++) {
        const x = -238.5 + i * 7.415;
        beam(g, m.rail, [x, 0.13, z], [x, 4.66, z], 0.32, 0.32);
        box(g, m.yellow, x, 0.9, z + inward, 0.44, 0.48, 0.092);
        if (i < 6)
          beam(
            g,
            m.rail,
            [x, i < 3 ? 0.55 : 4.43, z],
            [x + 7.415, i < 3 ? 4.43 : 0.55, z],
            0.22,
            0.22,
          );
      }
    }
    for (const px of [-238.5, -216.25, -194])
      beam(
        g,
        m.rail,
        [px, 4.66, deck.railZ[0]],
        [px, 4.66, deck.railZ[1]],
        0.19,
        0.24,
      );
    for (const [x, z, w, d] of GREVES_RAILS) {
      const side = w > d,
        length = side ? w : d;
      box(g, m.iron, x, 0.57, z, w, 0.063, d);
      box(g, m.rail, x, 1.13, z, w, 0.11, d);
      for (let i = -length * 0.5 + 0.2; i < length * 0.5; i += 3.8) {
        const px = x + (side ? i : 0),
          pz = z + (side ? 0 : i);
        box(g, m.rail, px, 0.57, pz, 0.13, 1.15, 0.13);
        if (!side || Math.abs(z - deck.z) > 8)
          box(g, m.concrete, px, 0.1, pz, 0.29, 0.2, 0.29);
      }
    }
    for (const [x, z] of GREVES_LAMPS) {
      cylinder(g, m.iron, x, 2.25, z, 0.079, 4.5);
      box(g, m.rail, x, 4.52, z, 0.38, 0.11, 0.54);
      box(g, m.lamp, x, 4.44, z, 0.31, 0.065, 0.42);
    }
    // High-contrast bay edges and a loading approach, matching the Plan bay.
    const b = GREVES_BAY;
    for (const s of [-1, 1]) {
      mark(b.x, b.z + s * 1.34, 6.36, 0.12, m.roadGold);
      mark(b.x + s * 3.18, b.z, 0.12, 2.68, m.roadGold);
      for (let k = 0; k < 4; k++)
        mark(b.x + s * (4.1 + k * 0.38), b.z, 0.16, 2.07, m.roadGold);
    }
    const grevesPanel = labelMaterial("QUAI DES CALFATS", {
      sub: "02  /  RIVE DES GRÈVES",
      bg: "#273c42",
      ink: "#e6e1cd",
      accent: "#e5a76b",
      night: 0.29,
    });
    const portPanel = labelMaterial("PORT-LUMIÈRE", {
      sub: "01  /  QUAI DES MARÉES",
      bg: "#273c42",
      ink: "#e6e1cd",
      accent: "#a5d2c6",
      night: 0.29,
    });
    for (const [x, z, ry, panel] of [
      [-251.2, 135, -Math.PI / 2, portPanel],
      [-182.9, 135, Math.PI / 2, grevesPanel],
    ]) {
      for (const s of [-1, 1])
        box(g, m.rail, x, 1.36, z + s * 1.93, 0.14, 2.72, 0.15);
      box(g, m.iron, x, 2.35, z, 0.18, 1.02, 4.16);
      sign(g, panel, x + Math.sin(ry) * 0.102, 2.35, z, 4.04, 0.9, ry);
    }
    // Quiet silhouettes: tarred sheds, shallow ribbing, freight containers and vents.
    for (const [i, f] of GREVES_YARD.entries()) {
      const frame = i % 2 ? m.rail : m.iron;
      mapped(
        g,
        i >= 2 ? (i % 2 ? m.warehouse : m.paint) : m.warehouse,
        f.x,
        f.h / 2,
        f.z,
        f.w,
        f.h,
        f.d,
        3.3,
        true,
      );
      box(g, frame, f.x, f.h - 0.05, f.z, f.w + 0.38, 0.28, f.d + 0.34, true);
      for (
        let k = -f.w / 2 + 0.55;
        k < f.w / 2 - 0.35;
        k += i >= 2 ? 0.69 : 2.17
      )
        box(
          g,
          frame,
          f.x + k,
          f.h * 0.52,
          f.z + f.d * 0.5 + 0.025,
          0.09,
          f.h * 0.92,
          0.068,
        );
      if (i < 2) {
        box(
          g,
          m.rail,
          f.x,
          f.h * 0.35,
          f.z + f.d / 2 + 0.052,
          6.1,
          2.97,
          0.104,
        );
        for (const side of [-1, 1]) {
          box(
            g,
            m.glassLit,
            f.x + side * f.w * 0.325,
            f.h * 0.67,
            f.z + f.d / 2 + 0.067,
            2.57,
            0.68,
            0.095,
          );
          box(
            g,
            frame,
            f.x + side * f.w * 0.325,
            f.h * 0.67,
            f.z + f.d / 2 + 0.123,
            0.056,
            0.74,
            0.04,
          );
        }
        cylinder(
          g,
          m.iron,
          f.x + f.w * 0.31,
          f.h + 0.59,
          f.z - 1.1,
          0.31,
          1.29,
        );
      }
    }
    batch.add(g);

    const halls = corner(a.x, a.z),
      room = corner(a.x, a.z);
    room.userData.shelter = true;
    const cladding = m.warehouse.clone();
    cladding.color.setHex(0xcadad0);
    const paintedLiner = m.warehouse.clone();
    paintedLiner.color.setHex(0xc7b49d);
    mapped(room, m.concrete, 0, 0.046, 0, a.w, 0.09, a.d, 3, false);
    for (const [x, z, w, d, h, b] of a.solids) {
      if (h < 4.5) continue;
      const y = b || 0.08;
      mapped(
        halls,
        b > 4 ? m.roof : cladding,
        x,
        (h + y) / 2,
        z,
        w,
        h - y,
        d,
        3.1,
        true,
      );
    }
    for (const s of [-1, 1]) {
      // Pitched clerestory, black gutter and regular standing seams.
      const slope = box(
        halls,
        m.roof,
        0,
        5.11,
        s * 3.92,
        a.w + 0.74,
        0.155,
        8.11,
        true,
      );
      slope.rotation.x = s * 0.137;
      box(halls, m.rail, 0, 4.74, s * 8.01, a.w + 0.84, 0.13, 0.16);
      for (let x = -10.5; x < 11; x += 1.5) {
        const seam = box(halls, m.iron, x, 5.21, s * 3.92, 0.067, 0.065, 8.05);
        seam.rotation.x = s * 0.137;
      }
      box(halls, m.rail, s * 10.94, 2.17, 7.88, 0.16, 4.2, 0.22);
      for (let i = 0; i < 4; i++) {
        const x = (s < 0 ? -8.72 : 6.1) + i * 1.17;
        box(halls, m.glassLit, x, 3.63, 7.885, 1.08, 0.71, 0.106);
      }
    }
    // Tall corrugated skin outside, removable warm wainscoting inside the old shed.
    for (const side of [-1, 1]) {
      mapped(
        room,
        paintedLiner,
        side * 10.689,
        1.31,
        0,
        0.075,
        2.45,
        15.01,
        2.2,
        false,
      );
      box(room, m.wood, side * 10.58, 2.59, 0, 0.18, 0.092, 15.07);
      for (const z of [-4.83, 0, 4.83])
        box(room, m.rail, side * 10.53, 2.45, z, 0.207, 4.71, 0.28);
    }
    mapped(room, paintedLiner, 0, 1.31, -7.49, 21.04, 2.45, 0.071, 2.2, false);
    box(room, m.wood, 0, 2.59, -7.45, 21.0, 0.092, 0.16);
    for (const x of [-8.4, -4.2, 0, 4.2, 8.4])
      box(room, m.iron, x, 4.21, 0, 0.17, 0.25, 15.35);
    box(halls, m.seaWall, -3.3, 0.57, 7.91, 14.8, 0.46, 0.2);
    box(halls, m.seaWall, 7.75, 0.57, 7.91, 5.69, 0.46, 0.2);
    const op = a.opening;
    for (const s of [-1, 1])
      box(halls, m.iron, op.x + (s * op.w) / 2, 1.6, 7.92, 0.13, 3.18, 0.38);
    box(halls, m.iron, op.x, 3.17, 7.92, op.w + 0.3, 0.18, 0.32);
    box(halls, m.lamp, op.x, 3.32, 8.055, 2.41, 0.09, 0.12);
    box(halls, m.roof, -3.1, 3.03, 8.53, 11.4, 0.17, 1.58, true);
    for (const x of [-8.55, 2.3])
      beam(halls, m.iron, [x, 2.5, 7.94], [x, 3.04, 9.16], 0.078);
    const name = labelMaterial("ATELIER DES GRÈVES", {
      sub: "CALFATAGE  /  CONTRÔLE DES CHARGEMENTS",
      bg: "#354049",
      ink: "#fff1cc",
      accent: "#e4b17a",
      height: 156,
      night: 0.48,
    });
    sign(halls, name, -3.6, 3.68, 7.926, 9.97, 1.13);
    const plate = labelMaterial("22", {
      bg: "#744e37",
      ink: "#fff4d8",
      border: false,
      night: 0.22,
    });
    sign(halls, plate, 5.31, 1.97, 7.883, 0.65, 0.65);
    for (const [x, z] of [
      [-5, 1.7],
      [5.1, -3.2],
    ]) {
      box(room, m.iron, x, 4.2, z, 1.89, 0.16, 0.26);
      box(room, m.lamp, x, 4.109, z, 1.72, 0.065, 0.17);
    }
    const t = LOG_TABLE,
      lx = t.x - a.x,
      lz = t.z - a.z;
    box(room, m.wood, lx, 0.98, lz, 2.12, 0.13, 1.02);
    for (const side of [-1, 1])
      box(room, m.rail, lx + side * 0.77, 0.51, lz, 0.19, 0.94, 0.76);
    box(room, m.iron, lx + 1.36, 1.84, lz - 0.77, 0.13, 3.5, 0.13);
    box(room, m.wood, lx + 1.28, 1.97, lz - 0.77, 0.15, 1.01, 1.89);
    batch.add(halls);
    batch.add(room);
    const record = corner(t.x, t.z);
    this.recordCards = {};
    for (const [id, title, sub, ink] of [
      ["open", "CAHIER DU PILOTE", "REGISTRE · LES CALFATS", "#c3caa7"],
      ["bulletin", "PASSE DES GRÈVES", "TRACÉ · AMER 07 · 02:09", "#cceabc"],
      ["families", "POUR LES FAMILLES", "LE TRACÉ EST CHEZ MINA", "#ffcf93"],
    ]) {
      const card = corner(0, 0);
      sign(
        card,
        labelMaterial(title, {
          sub,
          bg: "#283a40",
          ink,
          accent: "#e5b285",
          night: 0.4,
        }),
        1.195,
        1.97,
        -0.77,
        1.78,
        0.885,
        -Math.PI / 2,
      );
      if (id === "bulletin") {
        // The publicly filed chart is visible on the table, not only in the phone.
        box(card, m.roadWhite, 0, 1.052, 0, 1.08, 0.021, 0.68);
        beam(
          card,
          m.rail,
          [-0.42, 1.068, -0.19],
          [-0.05, 1.068, 0.15],
          0.027,
          0.032,
        );
        beam(
          card,
          m.rail,
          [-0.05, 1.068, 0.15],
          [0.43, 1.068, -0.08],
          0.027,
          0.032,
        );
        box(card, m.yellow, -0.05, 1.071, 0.15, 0.072, 0.025, 0.077);
      } else
        box(
          card,
          id === "open" ? m.rail : m.wood,
          -0.29,
          1.069,
          -0.02,
          0.65,
          0.062,
          0.45,
        );
      this.recordCards[id] = card;
      record.add(card);
    }
    this.recordRoot = record;
    this.world.scene.add(record);
    this.setRecord(this.record);
    // Binary fallback furniture only; identical locations and clearance with or without the lot.
    const furniture = corner(a.x, a.z);
    for (const [x, z, w, d, h] of a.solids)
      if (h < 4.5) {
        const material = h < 1.4 ? m.wood : m.rail;
        box(furniture, material, x, h / 2 + 0.04, z, w, h, d);
        box(furniture, m.iron, x, h + 0.038, z, w + 0.05, 0.065, d + 0.05);
      }
    this.fallback = furniture;
    this.world.scene.add(furniture);
  }
  present(eye, mode, onDetail) {
    const f = GREVES_WORKSHOP;
    const d2 = (eye.x - f.x) ** 2 + (eye.z - f.z) ** 2;
    const range = mode === "low" ? 29 : 39;
    if (this.recordRoot) this.recordRoot.visible = d2 < (range + 8) ** 2;
    if (!this.pending && d2 < (range + 18) ** 2) {
      this.pending = import("./rive-kit.js")
        .then(async ({ readGreves, makeGreves }) => {
          const asset = await readGreves();
          this.buildKit = () => makeGreves(asset);
        })
        .catch((e) => {
          this.failed = true;
          console.warn("Atelier des Grèves · détail indisponible", e);
        });
    }
    if (!this.kit && this.buildKit && d2 < (range + 8) ** 2 && !this.failed) {
      try {
        this.kit = this.buildKit();
        this.world.scene.add(this.kit.root);
        this.kit.root.position.set(f.x, this.floor(f), f.z);
        onDetail?.(this.kit.root);
      } catch (error) {
        this.release();
        this.failed = true;
        console.warn("Atelier des Grèves · détail non monté", error);
      }
    } else if (this.kit && d2 > (range + 25) ** 2) this.release();
    if (this.kit) this.kit.root.visible = d2 < range ** 2;
    if (this.fallback)
      this.fallback.visible = !this.kit?.root.visible && d2 < (range + 10) ** 2;
  }
  release() {
    if (!this.kit) return;
    this.kit.root.removeFromParent();
    this.kit.dispose();
    this.kit = null;
    if (this.fallback) this.fallback.visible = true;
  }
}

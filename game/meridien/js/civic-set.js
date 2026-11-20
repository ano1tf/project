import * as T from "three";
import { ONDES, PASSAGE, PROMENADE, WATCH } from "./data.mjs";
import { labelMaterial, standard } from "./materials.js";

// A playable block built with the same world solids and atlas as the old district.
// This module adds no new draw pipeline and doesn't touch the road graph.
export function civicSet(world, kit) {
  const { box, cylinder, corner, mapped, facade, sign, surface, beam } = kit;
  const m = world.m;
  const batches = (g) => world.batch.add(g);
  const coat = standard(0x435649, { metalness: 0.44, roughness: 0.57 });
  const bronze = standard(0xbd9357, { metalness: 0.57, roughness: 0.42 });
  const stucco = standard(0xe1cfb8, { map: m.concrete.map, roughness: 0.94 });
  const awning = standard(0x773f38),
    cream = standard(0xe5cda2),
    ceramic = standard(0x2b655f, { roughness: 0.41, metalness: 0.12 });
  const lantern = (g, x, y, z, rgb = 0xffc788, span = 9) => {
    box(g, m.iron, x, y + 0.15, z, 0.28, 0.079, 0.29);
    box(g, m.lamp, x, y, z, 0.17, 0.23, 0.18);
    box(g, coat, x, y - 0.14, z, 0.22, 0.07, 0.22);
    for (const s of [-1, 1])
      box(g, bronze, x + s * 0.094, y, z + 0.093, 0.02, 0.31, 0.02);
    world.light(g, x, y - 0.09, z + 0.17, rgb, 28, span);
  };
  const placard = (g, x, y, z, text, sub, w, h, mat = coat, bg = "#203f3a") => {
    box(g, mat, x, y, z, w + 0.11, h + 0.1, 0.085);
    sign(
      g,
      labelMaterial(text, {
        sub,
        bg,
        ink: "#efdac0",
        accent: "#dfba7e",
        night: 0.27,
      }),
      x,
      y,
      z + 0.049,
      w,
      h,
    );
  };
  const edging = (g, x, z, w, d, b = 0.04) => {
    for (const s of [-1, 1]) {
      box(g, m.curb, x, 0.098, z + s * d * 0.5, w, 0.028, b);
      box(g, m.curb, x + s * w * 0.5, 0.098, z, b, 0.028, d);
    }
  };
  const planter = (g, x, z, w, d, quick) => {
    mapped(g, m.concrete, x, 0.265, z, w, 0.362, d, 1.4);
    box(g, m.curb, x, 0.47, z, w + 0.08, 0.08, d + 0.08);
    box(g, m.dirt, x, 0.518, z, w - 0.14, 0.044, d - 0.15);
    const leaves = new T.IcosahedronGeometry(1, 0);
    for (let i = 0; i < Math.ceil(w * 4); i++) {
      const tufts = new T.Mesh(leaves, m.leaves[(i + 2) % 4]);
      const n = quick && i % 3 === 0;
      const u = ((i * 43) % 71) / 71;
      tufts.position.set(
        x - w / 2 + ((i + 0.5) / Math.ceil(w * 4)) * w,
        0.62 + u * 0.19,
        z + (u - 0.5) * (d - 0.1),
      );
      tufts.rotation.set(u, i * 0.58, u * 0.4);
      tufts.scale.set(n ? 0.24 : 0.32, 0.26 + u * 0.24, 0.23 + u * 0.16);
      g.add(tufts);
    }
    world.collision(g, x, z, w, d, 0.56);
  };
  const railing = (g, x, y, z, length, onSide = false) => {
    const a = corner(x, z, onSide ? Math.PI / 2 : 0);
    a.position.y = y;
    g.add(a);
    for (const h of [0.17, 0.92])
      box(a, coat, 0, h, 0, length, 0.057, 0.07, false);
    const bays = Math.ceil(length / 0.27);
    for (let j = 0; j <= bays; j++) {
      const at = (j / bays - 0.5) * length;
      box(a, m.iron, at, 0.532, 0, j % 4 === 0 ? 0.044 : 0.022, 0.756, 0.038);
    }
  };
  const apartments = (x, z, w, d, floors, name, brick = false) => {
    const g = corner(x, z),
      h = floors * 3.05 + 0.27,
      f = d * 0.5,
      bays = Math.round(w / 3.02);
    world.lot(x, z, w, d);
    world.collision(g, 0, 0, w, d, h + 0.8);
    facade(
      g,
      brick ? m.facades.brick : m.facades.cream,
      0,
      h * 0.5,
      0,
      w,
      h,
      d,
      w / bays,
      3.05,
    );
    for (const [y, hh, out] of [
      [0.32, 0.5, 0.12],
      [3.33, 0.19, 0.26],
      [h - 0.21, 0.26, 0.51],
      [h + 0.018, 0.13, 0.64],
      [h + 0.42, 0.6, 0.23],
    ])
      mapped(g, y > h ? m.roof : stucco, 0, y, 0, w + out, hh, d + out, 2.7);
    for (const s of [-1, 1]) {
      for (let level = 0; level < floors; level++) {
        const y = 1.51 + level * 3.05;
        mapped(
          g,
          stucco,
          s * (w / 2 - 0.21),
          y,
          f + 0.11,
          0.39,
          2.97,
          0.22,
          1.8,
        );
        box(g, m.rail, s * (w / 2 + 0.026), y, f + 0.24, 0.079, 3.05, 0.092);
      }
    }
    for (let level = 1; level < floors; level++) {
      const y = 0.55 + level * 3.05;
      for (let i = 0; i < bays; i++) {
        const xx = ((i + 0.5) / bays - 0.5) * w;
        box(g, stucco, xx, y, f + 0.09, 2.13, 0.135, 0.35);
        if ((i + level) % 3 !== (brick ? 1 : 2)) continue;
        box(g, m.curb, xx, y - 0.12, f + 0.47, 2.21, 0.18, 1.14, true);
        railing(g, xx, y, f + 1.0, 2.13);
        for (const s of [-1, 1])
          railing(g, xx + s * 1.055, y, f + 0.53, 0.91, true);
        if (level < 4) {
          box(g, m.wood, xx + 0.54, y + 0.61, f + 0.85, 0.73, 0.27, 0.24);
          box(
            g,
            m.leaves[(i + level) % 4],
            xx + 0.54,
            y + 0.816,
            f + 0.85,
            0.67,
            0.24,
            0.22,
          );
        }
      }
    }
    const entry = brick ? 0 : -w * 0.24;
    box(g, stucco, entry, 1.69, f + 0.18, 2.76, 3.06, 0.42);
    box(g, coat, entry, 1.52, f + 0.413, 2.18, 2.84, 0.11);
    box(g, m.glassLit, entry, 2.54, f + 0.48, 1.96, 0.46, 0.046);
    for (const s of [-1, 1]) {
      box(g, m.rail, entry + s * 0.47, 1.32, f + 0.489, 0.82, 1.58, 0.04);
      box(g, bronze, entry + s * 0.14, 1.37, f + 0.53, 0.045, 0.27, 0.067);
      lantern(g, entry + s * 1.48, 2.24, f + 0.48, 0xffc88e);
    }
    placard(
      g,
      entry,
      3.18,
      f + 0.49,
      name,
      "PASSAGE DES TISSERANDS",
      2.61,
      0.44,
    );
    for (let j = 0; j < 3; j++)
      box(
        g,
        m.concrete,
        entry,
        0.099 + j * 0.078,
        f + 0.97 - j * 0.22,
        2.98,
        0.075,
        0.31,
      );
    world.collision(g, entry, f + 0.775, 2.98, 0.684, 0.293);
    box(g, m.roof, -w * 0.18, h + 0.66, -d * 0.14, 3.52, 1.31, 4.6);
    for (const s of [-1, 1]) {
      cylinder(g, m.concrete, s * w * 0.32, h + 0.79, d * 0.26, 0.35, 1.16);
      cylinder(g, m.iron, s * w * 0.32, h + 1.44, d * 0.26, 0.47, 0.19);
    }
    batches(g);
  };
  apartments(9.3, 17.7, 12.6, 26, 6, "COUR CORMORAN");
  apartments(25.7, 17.2, 11.9, 27.5, 7, "LES HORTENSIAS", true);

  // Continuous paving: the east side remains open to the boulevard and its crossings.
  PROMENADE.forEach(({ x, z, w, d }) => {
    const g = corner(x, z);
    surface(
      g,
      x === WATCH.x ? m.quayPavers : m.pavers,
      0,
      0.0775,
      0,
      w,
      d,
      2.54,
      7,
      4,
    );
    edging(g, 0, 0, w - 0.32, d - 0.32, 0.078);
    batches(g);
  });
  const lane = corner(PASSAGE.x, PASSAGE.z);
  // Sign and handrails sit outside the walking width, at the entrances to the passage.
  for (const [z, rot] of [
    [-14.6, Math.PI],
    [12.4, 0],
  ]) {
    const gate = corner(-2.08, z, rot);
    lane.add(gate);
    placard(
      gate,
      0,
      2.11,
      0.13,
      "PASSAGE CORMORAN",
      "PIÉTONS   ·   LES TISSERANDS",
      0.98,
      0.38,
      coat,
      "#273d46",
    );
    box(gate, coat, -0.26, 1.06, 0, 0.09, 2.02, 0.095, true);
  }
  for (const [z, y] of [
    [-10.4, 2.83],
    [9.55, 2.83],
  ])
    lantern(lane, 1.93, y, z, 0xf1cd91, 6.8);
  batches(lane);
  const square = corner(44.4, 32.1);
  for (const s of [-1, 1]) {
    planter(square, s * 7.23, -1.12, 2.84, 1.31, s > 0);
    world.bench(square, s * 7.2, 1.15);
    world.collision(square, s * 7.2, 1.15, 2.14, 0.57, 0.72);
    box(square, coat, s * 8.42, 1.54, -4.3, 0.097, 2.96, 0.098);
    beam(square, coat, [s * 8.42, 2.92, -4.3], [s * 8, 3.13, -3.72], 0.078);
    lantern(square, s * 8, 2.94, -3.72, 0xffbc80);
  }
  world.streetTree(37.2, 35.67, 1.07);
  world.streetTree(8.4, 39.7, 1.16);
  world.streetTree(3.2, 34.7, 0.93);
  const squareBoard = corner(32.9, 35.5, Math.PI * 0.19);
  for (const s of [-1, 1])
    box(squareBoard, coat, s * 0.72, 0.87, 0, 0.083, 1.73, 0.089);
  placard(
    squareBoard,
    0,
    1.57,
    0,
    "LES TISSERANDS",
    "RUE COMMERÇANTE   •   HALLES →",
    1.42,
    0.57,
  );
  batches(squareBoard);
  batches(square);
  const pocket = corner(9, 37.3);
  planter(pocket, -3.8, 0.34, 2.77, 1.44, true);
  planter(pocket, 4, 0.34, 2.5, 1.44);
  world.bench(pocket, 0, 0.64);
  world.collision(pocket, 0, 0.64, 2.15, 0.57, 0.7);
  batches(pocket);

  const { x, z, w, d, h, badge, receiver } = ONDES;
  const shop = corner(x, z),
    front = d / 2,
    half = w / 2,
    door = 3.75,
    sideWidth = (w - door) / 2,
    bay = (w + door) / 4;
  world.lot(x, z, w, d, "interior");
  // Front glazing has a collision volume but not an opaque wall. Walk through the open doorway.
  for (const s of [-1, 1]) {
    mapped(shop, stucco, s * half, h / 2, 0, 0.47, h, d, 2.3);
    world.collision(
      shop,
      s * half + (s > 0 ? 0.14 : 0),
      0,
      s > 0 ? 0.75 : 0.48,
      d,
      h,
    );
    mapped(shop, stucco, s * bay, 0.49, front, sideWidth, 0.84, 0.43, 2.3);
    mapped(
      shop,
      ceramic,
      s * bay,
      0.79,
      front + 0.238,
      sideWidth + 0.07,
      0.29,
      0.13,
      2.2,
    );
    box(shop, coat, s * bay, 0.953, front + 0.1, sideWidth + 0.17, 0.14, 0.55);
    box(shop, coat, s * bay, 3.15, front, sideWidth + 0.17, 0.25, 0.5);
    box(shop, bronze, s * bay, 2.53, front + 0.245, sideWidth, 0.051, 0.094);
    world.collision(shop, s * bay, front, sideWidth, 0.48, h);
    for (let i = 0; i <= 4; i++) {
      const a = s * (door / 2 + i * sideWidth * 0.25);
      box(shop, coat, a, 2.05, front + 0.16, 0.108, 2.26, 0.33);
      box(shop, bronze, a, 2.09, front + 0.348, 0.032, 2.08, 0.04);
    }
    const canopy = box(
      shop,
      awning,
      s * bay,
      3.37,
      front + 0.92,
      sideWidth + 0.252,
      0.081,
      1.53,
      true,
    );
    canopy.rotation.x = 0.2;
    for (let k = 0; k < 11; k++) {
      const xx = s * bay + ((k + 0.5) / 11 - 0.5) * sideWidth;
      const shade = box(
        shop,
        k % 2 ? awning : cream,
        xx,
        3.223,
        front + 1.65,
        sideWidth / 11 + 0.01,
        0.221,
        0.059,
      );
      shade.userData.trim = true;
      if (k % 2 === 0) {
        const stripe = box(
          shop,
          cream,
          xx,
          3.411,
          front + 0.925,
          sideWidth / 11,
          0.014,
          1.538,
        );
        stripe.rotation.x = 0.2;
      }
    }
    lantern(shop, s * (door / 2 + 0.37), 2.69, front + 0.44, 0xffba78, 8.7);
  }
  mapped(shop, stucco, 0, h / 2, -front, w, h, 0.46, 2.4);
  world.collision(shop, 0, -front, w, 0.46, h);
  mapped(shop, stucco, 0, h - 0.66, front, w + 0.2, 1.4, 0.52, 2.9);
  world.collision(shop, 0, front, door, 0.52, h, 3.35);
  mapped(shop, m.roof, 0, h + 0.075, 0, w + 0.46, 0.25, d + 0.51, 2.8);
  world.collision(shop, 0, 0, w, d, h + 0.22, h - 0.09);
  // Old radio workshop under two narrower residential floors, not a free-standing box.
  facade(
    shop,
    m.facades.limestone,
    0,
    h + 3.09,
    -0.65,
    w - 0.25,
    6.14,
    d - 1.47,
    2.65,
    3.08,
  );
  for (const yy of [h + 0.325, h + 3.15, h + 6.26])
    mapped(shop, stucco, 0, yy, -0.65, w + 0.25, 0.175, d - 1.03, 2.4);
  box(shop, m.roof, 0, h + 6.48, -0.6, w + 0.13, 0.29, d - 0.95);
  for (const s of [-1, 1]) {
    box(shop, m.iron, s * 5.2, h + 1.25, front - 1.32, 0.09, 1.69, 0.13);
    box(shop, m.curb, s * 3.93, h + 1.18, front - 0.71, 3.4, 0.12, 1.18, true);
    railing(shop, s * 3.93, h + 1.24, front - 0.13, 3.33);
  }
  placard(
    shop,
    0,
    4.01,
    front + 0.313,
    "ATELIER DES ONDES",
    "RÉPARATIONS    /    RADIO & MARINE",
    7.86,
    0.94,
    coat,
    "#233f3a",
  );
  const sideCourt = corner(half + 0.303, 0.12, Math.PI / 2);
  shop.add(sideCourt);
  for (const h of [0.27, 3.23, 4.57])
    box(
      sideCourt,
      h === 0.27 ? ceramic : m.curb,
      0,
      h,
      0,
      d - 0.3,
      h < 1 ? 0.441 : 0.14,
      0.16,
    );
  for (const u of [-4.52, 0.1, 4.72]) {
    box(sideCourt, stucco, u - 1.12, 2.04, 0.014, 0.261, 3.03, 0.19);
    box(sideCourt, coat, u, 2.2, 0.062, 1.42, 1.56, 0.158);
    box(sideCourt, m.glassLit, u, 2.2, 0.148, 1.21, 1.36, 0.043);
    for (const v of [-0.41, 0, 0.41])
      box(sideCourt, bronze, u + v, 2.2, 0.174, 0.04, 1.41, 0.036);
    box(sideCourt, m.curb, u, 1.395, 0.183, 1.51, 0.112, 0.288);
  }
  placard(
    sideCourt,
    0.12,
    3.73,
    0.116,
    "ATELIER DES ONDES",
    "PORT-LUMIÈRE   ·   RÉPARATIONS",
    3.77,
    0.56,
    coat,
  );
  const threshold = corner(x, z);
  surface(threshold, m.garage, 0, 0.093, front - 0.04, door + 0.2, 1.78, 1.55);
  for (const s of [-1, 1]) {
    box(threshold, bronze, s * 1.82, 1.55, front + 0.16, 0.064, 3.06, 0.13);
    box(threshold, coat, s * 1.91, 1.55, front - 0.29, 0.18, 3.04, 0.79);
  }
  batches(threshold);
  batches(shop);

  const indoor = corner(x, z);
  // A roofed light-volume: modulates baked sunlight and keeps the benches lit in daylight.
  indoor.userData.shelter = true;
  indoor.userData.detailRange = 32;
  surface(indoor, m.garage, 0, 0.092, 0, w - 0.42, d - 0.39, 1.8, 8, 7);
  mapped(indoor, m.concrete, 0, 4.56, 0, w - 0.38, 0.11, d - 0.34, 3.5);
  box(indoor, m.rail, -5.31, 4.27, 0, 0.42, 0.28, 14.1, true);
  for (let k = -2; k <= 2; k++)
    box(indoor, bronze, -5.31, 4.27, k * 2.78, 0.46, 0.32, 0.08);
  for (const s of [-1, 1]) {
    mapped(
      indoor,
      m.warehouse,
      s * 7.72,
      2.18,
      -0.16,
      0.097,
      4.14,
      14.01,
      2.45,
    );
    for (let k = 0; k < 3; k++) {
      const zz = -5.69 + k * 4.65;
      box(indoor, coat, s * 7.4, 2.04, zz, 0.45, 4.1, 0.32);
      box(indoor, m.iron, 0, 4.32, zz, 15.22, 0.23, 0.24, true);
      box(indoor, m.lamp, s * 3.56, 4.16, zz, 2.45, 0.067, 0.205);
      world.light(
        indoor,
        s * 3.48,
        3.98,
        zz,
        s < 0 ? 0xffcc95 : 0xb5efda,
        36,
        10,
      );
    }
  }
  const workbench = (xx, zz, width, depth, top = 1.06, metal = false) => {
    mapped(indoor, m.wood, xx, top, zz, width, 0.125, depth, 1.42);
    box(
      indoor,
      metal ? coat : m.rail,
      xx,
      top - 0.33,
      zz,
      width - 0.13,
      0.46,
      depth - 0.21,
    );
    for (const s of [-1, 1]) {
      box(
        indoor,
        m.iron,
        xx + s * (width / 2 - 0.12),
        top * 0.45,
        zz,
        0.14,
        top * 0.8,
        depth - 0.16,
      );
      box(
        indoor,
        bronze,
        xx + s * width * 0.25,
        top - 0.204,
        zz + depth * 0.5 - 0.061,
        0.22,
        0.067,
        0.102,
      );
    }
    world.collision(indoor, xx, zz, width, depth, top + 0.08);
  };
  const radio = (xx, yy, zz, s = 1, dial = true) => {
    box(
      indoor,
      m.wood,
      xx,
      yy + 0.23 * s,
      zz,
      0.83 * s,
      0.43 * s,
      0.39 * s,
      true,
    );
    box(
      indoor,
      m.iron,
      xx,
      yy + 0.233 * s,
      zz + 0.203 * s,
      0.78 * s,
      0.376 * s,
      0.051 * s,
    );
    box(
      indoor,
      m.glassLit,
      xx - 0.07 * s,
      yy + 0.31 * s,
      zz + 0.234 * s,
      0.53 * s,
      0.11 * s,
      0.039 * s,
    );
    for (let j = 0; j < 6; j++)
      box(
        indoor,
        coat,
        xx - 0.235 * s,
        yy + (0.126 + j * 0.024) * s,
        zz + 0.235 * s,
        0.215 * s,
        0.012 * s,
        0.038 * s,
      );
    if (dial)
      for (const u of [0.11, 0.278]) {
        const disc = cylinder(
          indoor,
          bronze,
          xx + u * s,
          yy + 0.164 * s,
          zz + 0.263 * s,
          0.048 * s,
          0.045 * s,
        );
        disc.rotation.x = Math.PI / 2;
      }
  };
  const ax = receiver.x - x,
    az = receiver.z - z - 1.33;
  workbench(ax, az, 4.35, 1.29, 1.04, true);
  radio(ax, 1.11, az, 1.33);
  placard(
    indoor,
    ax,
    0.805,
    az + 0.6,
    "RÉCEPTEUR 04",
    "BANDES DU RELAIS",
    1.17,
    0.19,
  );
  for (const s of [-1, 1]) {
    box(indoor, m.black, ax + s * 1.49, 1.31, az + 0.05, 0.52, 0.321, 0.347);
    for (let j = 0; j < 5; j++)
      box(
        indoor,
        m.rail,
        ax + s * 1.49,
        1.31,
        az + 0.228,
        0.42 - j * 0.037,
        0.13,
        0.026,
      );
  }
  const sx = badge.x - x - 1.43,
    sz = badge.z - z;
  workbench(sx, sz, 1.07, 2.42, 1.03);
  const coil = cylinder(
    indoor,
    bronze,
    ax + 0.96,
    1.34,
    az + 0.201,
    0.134,
    0.059,
  );
  coil.rotation.x = Math.PI / 2;
  const switchboard = corner(sx + 0.29, sz, Math.PI / 2);
  indoor.add(switchboard);
  placard(
    switchboard,
    0,
    1.3,
    0,
    "VOIES A · B · C",
    "COMMUTATEUR DE VEILLE",
    1.12,
    0.39,
  );
  for (const [xx, zz, count] of [
    [-4.73, -5.98, 3],
    [3.55, -5.98, 4],
    [-4.2, 5.15, 3],
  ]) {
    const width = count * 1.19;
    workbench(xx, zz, width, 1.31);
    for (let k = 0; k < count; k++) {
      const s = 0.72 + (k % 3) * 0.141;
      radio(xx + (k - (count - 1) / 2) * 1.12, 1.12, zz - 0.26, s);
      if (zz < 0) {
        if (!k) box(indoor, m.wood, xx, 2.11, zz - 0.32, width, 0.098, 0.87);
        radio(
          xx + (k - (count - 1) / 2) * 1.12,
          2.16,
          zz - 0.29,
          s * 1.02,
          false,
        );
      }
    }
  }
  for (const i of [-2, -1, 0, 1, 2]) {
    const x0 = ax + i * 0.096;
    beam(
      indoor,
      m.rail,
      [x0, 1.26, az - 0.31],
      [x0, 2.38 + Math.abs(i) * 0.16, az - 0.58],
      0.026,
    );
  }
  placard(
    indoor,
    0.34,
    2.94,
    -6.89,
    "ONDES MARINES",
    "PIÈCES, BOBINES & INSTRUMENTS",
    4.3,
    0.72,
  );
  for (let i = 0; i < 4; i++) {
    const yy = 0.61 + i * 0.41;
    box(indoor, coat, 6.88, yy, -1.04, 1.58, 0.37, 0.74, true);
    for (const s of [-1, 1]) {
      box(indoor, m.rail, 6.87 + s * 0.39, yy, -0.659, 0.73, 0.333, 0.051);
      box(
        indoor,
        bronze,
        6.87 + s * 0.39,
        yy + 0.032,
        -0.616,
        0.162,
        0.04,
        0.041,
      );
    }
  }
  world.collision(indoor, 6.88, -1.04, 1.58, 0.79, 2.06);
  batches(indoor);
  const glass = standard(0x8badae, {
    roughness: 0.16,
    metalness: 0.23,
    transparent: true,
    opacity: 0.29,
    depthWrite: false,
    forceSinglePass: true,
    side: T.DoubleSide,
  });
  const glazing = corner(x, z);
  for (const s of [-1, 1]) {
    const pane = sign(
      glazing,
      glass,
      s * bay,
      2.018,
      front + 0.079,
      sideWidth - 0.105,
      2.12,
    );
    pane.receiveShadow = false;
  }
  glazing.name = "Atelier · vitrines";
  world.scene.add(glazing);
  world.civicGlazing = glazing;

  const watch = corner(WATCH.x, WATCH.z);
  const ww = WATCH.w,
    dd = WATCH.d;
  world.lot(WATCH.x, WATCH.z, ww, dd, "interior");
  mapped(watch, m.warehouse, 0, 1.71, -dd / 2, ww, 3.42, 0.26, 2.28);
  world.collision(watch, 0, -dd / 2, ww, 0.31, 3.46);
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      const xx = s * (ww / 2 - 0.13),
        zz = t * (dd / 2 - 0.14);
      box(watch, coat, xx, 1.65, zz, 0.21, 3.23, 0.24, true);
      box(watch, m.curb, xx, 0.2, zz, 0.37, 0.36, 0.38);
      world.collision(watch, xx, zz, 0.38, 0.37, 3.42);
    }
    box(watch, m.rail, s * 3.29, 1.18, -0.69, 0.22, 0.09, 2.99);
    box(watch, m.rail, s * 3.29, 0.68, -0.69, 0.19, 0.094, 2.99);
    world.collision(watch, s * 3.29, -0.69, 0.25, 2.99, 1.2);
    lantern(watch, s * 2.64, 2.66, dd / 2 + 0.08, 0xffba6d, 8.5);
  }
  surface(watch, m.wood, 0, 0.089, 0, ww - 0.13, dd - 0.09, 2.31, 6, 5);
  box(watch, coat, 0, 3.35, 0, ww + 0.47, 0.23, dd + 0.47, true);
  mapped(watch, m.roof, 0, 3.52, 0, ww + 0.55, 0.126, dd + 0.54, 2.4);
  placard(
    watch,
    0,
    3.07,
    dd / 2 + 0.06,
    "POSTE DE VEILLE",
    "QUAI DES MARÉES   /   TOUR DE GARDE",
    5.02,
    0.58,
  );
  mapped(watch, m.wood, 0.51, 1.02, -0.08, 2.8, 0.144, 1.19, 1.6);
  box(watch, m.rail, 0.51, 0.508, -0.08, 2.3, 0.91, 0.78);
  world.collision(watch, 0.51, -0.08, 2.8, 1.19, 1.111);
  const ledger = labelMaterial("02:17", {
    sub: "REGISTRE DE VEILLE",
    bg: "#baab90",
    ink: "#29312b",
    accent: "#573c2e",
  });
  const book = sign(watch, ledger, 0.47, 1.112, 0.09, 0.52, 0.33);
  book.rotation.x = -Math.PI / 2 + 0.02;
  box(watch, m.rail, 0.47, 1.102, 0.09, 0.55, 0.03, 0.36);
  box(watch, coat, -1.45, 2.1, -2.185, 3.06, 1.33, 0.085);
  world.bench(watch, -2.0, 3.06);
  world.collision(watch, -2, 3.06, 2.15, 0.54, 0.7);
  world.light(watch, 0, 2.97, -0.35, 0xffca8e, 46, 10.9);
  batches(watch);
  const notice = corner(WATCH.x, WATCH.z);
  const notices = {
    open: ["VEILLE ESTUAIRE", "N° 02  ·  POSTE DES MARÉES"],
    archive: ["RELEVÉ PUBLIC", "RELAIS · APPEL REÇU À 02 H 09"],
    seal: ["BANDE SOUS SCELLÉ", "ÉCOUTE SUR ACCORD · CHEZ SALOMÉ"],
  };
  const plate = sign(notice, m.iron, -1.45, 2.1, -2.134, 2.95, 1.23);
  notice.name = "Poste de veille · avis";
  world.scene.add(notice);
  world.civicNotice = notice;
  world.setCivicNotice = (outcome) => {
    const key = outcome || "open";
    if (notice.userData.key === key) return;
    notice.userData.key = key;
    const [title, sub] = notices[key];
    if (plate.material !== m.iron) {
      plate.material.map?.dispose();
      plate.material.dispose();
    }
    plate.material = labelMaterial(title, {
      sub,
      bg: key === "archive" ? "#735842" : "#243f37",
      ink: "#fff0d3",
      accent: "#dfb777",
      night: 0.48,
    });
  };
}

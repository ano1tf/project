// Local measurements in metres; all bulky fixtures contribute their footprint
// to the same solids index used by walking, vehicles and camera obstruction.
export function furnishEast(
  world,
  g,
  site,
  { box, cylinder, surface, sign, labelMaterial, beam },
  w,
  d,
  h,
) {
  const m = world.m;
  const solid = (mat, x, z, width, depth, height) => {
    box(g, mat, x, height / 2 + 0.09, z, width, height, depth, true);
    world.collision(g, x, z, width, depth, height + 0.09);
  };
  const plaque = (title, sub, x, y, z, width) =>
    sign(
      g,
      labelMaterial(title, { sub, bg: "#30504e", accent: "#dbc098" }),
      x,
      y,
      z,
      width,
      width * 0.24,
    );
  const strip = (x, z, y) => {
    box(g, m.iron, x, y, z, 1.72, 0.12, 0.32);
    box(g, m.lamp, x, y - 0.075, z, 1.56, 0.055, 0.23);
    world.light(g, x, y - 0.18, z, 0xffdeb0, 46, 9);
  };
  g.userData.shelter = true;
  if (site === "works") {
    plaque(
      "LA CORDERIE",
      "ATELIER DE RÉPARATION NAVALE",
      0,
      4.1,
      d / 2 + 0.26,
      6.2,
    );
    // The open handling aisle runs between two gantry legs; the hoist clears head height.
    for (const x of [-6, 6]) {
      solid(m.yellow, x, -2, 0.55, 0.68, 5.45);
      box(g, m.iron, x, 0.28, -2, 1, 0.35, 1.1);
    }
    box(g, m.yellow, 0, 5.44, -2, 12.7, 0.48, 0.55);
    box(g, m.rail, 2.5, 5.04, -2, 1.2, 0.4, 0.65);
    cylinder(g, m.rope, 2.5, 4.37, -2, 0.047, 1.1);
    for (const side of [-1, 1]) {
      const x = side * (w / 2 - 2.1);
      solid(m.iron, x, -2, 2.25, 7, 1);
      box(g, m.wood, x, 1.17, -2, 2.38, 0.16, 7.15);
      for (let i = 0; i < 4; i++) {
        const z = -4.7 + i * 1.62;
        cylinder(g, m.aluminum, x, 1.42, z, 0.31, 0.32);
        cylinder(g, m.rope, x, 1.62, z, 0.23, 0.22);
      }
      for (const z of [-d * 0.3, d * 0.27]) {
        beam(g, m.rail, [side * w * 0.48, h - 0.4, z], [0, h - 1.4, z], 0.2);
        strip(side * w * 0.23, z, 4.8);
      }
      for (let z = -d * 0.35; z < d * 0.41; z += 2)
        box(g, m.yellow, side * 3.7, 0.105, z, 0.11, 0.01, 1.25);
    }
    for (let i = 0; i < 3; i++)
      world.crate(g, -9 + i * 2.15, -d / 2 + 2, 1.7, 1.55, 1.25);
    return;
  }
  // A 2 m opening replaces the former full-width dead end. Furniture stays
  // outside the spine running from the hall into the rear rooms.
  const half = (w - 0.5 - 2) / 2;
  for (const side of [-1, 1])
    solid(m.concrete, side * (1 + half / 2), -4, half, 0.32, 3.3);
  box(g, m.curb, 0, 2.94, -4, 2, 0.68, 0.33);
  world.collision(g, 0, -4, 2, 0.33, 3.32, 2.59);
  const flat = site === "flat";
  plaque(
    flat ? "12 · LES BRAISES" : "LAVERIE DES BRAISES",
    flat ? "LOGEMENT TÉMOIN · REZ-DE-CHAUSSÉE" : "BUANDERIE COLLECTIVE",
    0,
    2.95,
    d / 2 + 0.25,
    3.7,
  );
  plaque(
    flat ? "APPARTEMENT 01" : "BUANDERIE",
    "ENTRÉE LIBRE",
    0,
    2.95,
    -3.81,
    1.94,
  );
  for (const z of [8, -8, -14]) strip(0, z, 3.08);
  surface(g, flat ? m.wood : m.pavers, 0, 0.102, -10.45, w - 0.65, 12.4, 4);
  // Interior plaster lining, dado and skirting in front of the shell.
  box(g, m.concrete, 0, 1.71, -16.71, 13.48, 3.2, 0.07);
  box(g, flat ? m.wood : m.cargo[1], 0, 0.68, -16.65, 13.46, 1.12, 0.06);
  for (const side of [-1, 1]) {
    box(g, m.concrete, side * 6.7, 1.71, -10.55, 0.07, 3.2, 12.3);
    box(g, m.wood, side * 6.64, 0.19, -10.55, 0.07, 0.16, 12.28);
  }
  if (flat) {
    // Bedroom at the back with a real opening, distinct from the living space.
    solid(m.concrete, -3.65, -11, 5.98, 0.22, 3.27);
    solid(m.concrete, 3.65, -11, 5.98, 0.22, 3.27);
    solid(m.wood, -4.5, -13.75, 2.35, 3.25, 0.46);
    box(g, m.white, -4.5, 0.66, -13.75, 2.3, 0.25, 3.15);
    box(g, m.paint, -4.5, 0.82, -13.25, 2.28, 0.09, 1.96);
    box(g, m.white, -4.5, 0.89, -14.82, 1.25, 0.19, 0.55);
    solid(m.wood, 4.75, -15.6, 2.1, 0.84, 1.96);
    box(g, m.iron, 4.75, 1.06, -15.13, 0.09, 0.31, 0.08);
    solid(m.cargo[0], -4.9, -7.55, 1.33, 3.35, 0.62);
    box(g, m.cargo[0], -5.52, 0.87, -7.55, 0.23, 0.56, 3.45);
    solid(m.wood, -3.1, -7.55, 0.89, 1.7, 0.43);
    box(g, m.white, -3.11, 0.55, -7.42, 0.42, 0.045, 0.34);
    solid(m.white, 5.65, -7.7, 1.35, 4.22, 0.98);
    box(g, m.rail, 5.65, 1.12, -7.7, 1.4, 0.09, 4.26);
    box(g, m.aluminum, 5.65, 1.18, -8.7, 0.78, 0.07, 0.86);
    for (const z of [-7.16, -6.52])
      cylinder(g, m.black, 5.63, 1.19, z, 0.22, 0.06);
  } else {
    plaque(
      "LAVAGE · 01 — 04",
      "RÉSIDENCE DES BRAISES   /   SERVICE COMMUN",
      -3.45,
      2.31,
      -16.62,
      3.45,
    );
    for (const y of [1.59, 1.76])
      box(g, m.chrome, -2.85, y, -16.48, 7.6, 0.055, 0.055);
    for (let i = 0; i < 4; i++) {
      const x = -5.4 + i * 1.5;
      solid(m.white, x, -15.44, 1.3, 1.4, 1.25);
      const rim = cylinder(g, m.iron, x, 0.73, -14.71, 0.42, 0.1);
      rim.rotation.x = Math.PI / 2;
      const glass = cylinder(g, m.glass, x, 0.73, -14.644, 0.32, 0.055);
      glass.rotation.x = Math.PI / 2;
      box(g, m.rail, x, 1.17, -14.72, 1.17, 0.21, 0.06);
      box(g, m.aluminum, x - 0.32, 1.17, -14.676, 0.32, 0.1, 0.035);
      const dial = cylinder(g, m.white, x, 1.17, -14.663, 0.068, 0.055);
      dial.rotation.x = Math.PI / 2;
      box(g, m.lamp, x + 0.37, 1.17, -14.668, 0.13, 0.06, 0.055);
    }
    solid(m.wood, 5.22, -10.9, 1.5, 4.4, 0.92);
    box(g, m.white, 5.22, 1.075, -10.9, 1.6, 0.13, 4.5);
    for (let i = 0; i < 4; i++)
      box(
        g,
        i % 2 ? m.white : m.cargo[1],
        5.2,
        1.19 + i * 0.1,
        -10.75,
        0.91,
        0.095,
        0.7,
      );
  }
}

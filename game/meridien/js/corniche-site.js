import { CORNICHE as c, cornicheFloor } from "./corniche.mjs";
// A timber promenade on a masonry plinth: no inaccessible under-deck space.
export function buildCorniche(
  world,
  g,
  { box, beam, cylinder, sign, labelMaterial },
) {
  const m = world.m,
    top = c.rise + 0.08,
    half = c.deckWidth / 2,
    r = c.rampWidth / 2;
  const base = (z) => cornicheFloor(c.x, c.z + z);
  const wall = (x, z, w, d, height) => world.collision(g, x, z, w, d, height);
  const rail = (x1, z1, y1, x2, z2, y2) => {
    for (const off of [0.48, 1.04])
      beam(
        g,
        m.rail,
        [x1, y1 + off, z1],
        [x2, y2 + off, z2],
        off === 1.04 ? 0.085 : 0.045,
      );
    const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 2.6);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      box(
        g,
        m.iron,
        x1 + t * (x2 - x1),
        y1 + t * (y2 - y1) + 0.53,
        z1 + t * (z2 - z1),
        0.075,
        1.06,
        0.075,
      );
    }
  };
  // Continuous inclined boards, backed by retaining walls that also block side entry.
  const span = c.entry - c.landing,
    mid = (c.entry + c.landing) / 2,
    angle = Math.atan2(c.rise, span);
  const slope = box(
    g,
    m.wood,
    0,
    (top + 0.08) / 2 - 0.06,
    mid,
    c.rampWidth,
    0.12,
    Math.hypot(span, c.rise),
  );
  slope.rotation.x = angle;
  for (let i = 0; i < span; i++) {
    const z = c.landing + i + 0.5,
      y = base(z);
    for (const side of [-1, 1]) {
      box(g, m.seaWall, side * r, y / 2, z, 0.22, y, 1.03);
      wall(side * r, z, 0.26, 1.04, y + 1.06);
    }
    const tread = box(
      g,
      m.curb,
      0,
      y + 0.008,
      z,
      c.rampWidth - 0.22,
      0.012,
      0.055,
    );
    tread.rotation.x = angle;
  }
  for (const side of [-1, 1])
    rail(side * r, c.entry, 0.08, side * r, c.landing, top);
  const d = c.landing - c.back,
    cz = (c.landing + c.back) / 2;
  box(g, m.seaWall, 0, (top - 0.1) / 2, cz, c.deckWidth, top - 0.1, d);
  box(g, m.wood, 0, top - 0.05, cz, c.deckWidth, 0.1, d);
  for (let z = c.back + 0.5; z < c.landing; z += 0.7)
    box(g, m.iron, 0, top + 0.002, z, c.deckWidth, 0.005, 0.018);
  for (const side of [-1, 1]) {
    rail(side * half, c.back, top, side * half, c.landing, top);
    wall(side * half, cz, 0.17, d, top + 1.1);
    rail(side * r, c.landing, top, side * half, c.landing, top);
    wall((side * (r + half)) / 2, c.landing, half - r, 0.18, top + 1.1);
  }
  rail(-half, c.back, top, half, c.back, top);
  wall(0, c.back, c.deckWidth, 0.18, top + 1.1);
  // Slatted pergola overlooking the estuary. The central sightline is unobstructed.
  for (const x of [-5.8, -2.6])
    for (const z of [-16.7, -10]) {
      box(g, m.wood, x, top + 1.48, z, 0.16, 2.96, 0.16);
      wall(x, z, 0.2, 0.2, top + 2.96);
    }
  for (const x of [-5.8, -2.6])
    box(g, m.wood, x, top + 3.01, -13.35, 0.19, 0.19, 7.24);
  for (let i = 0; i < 13; i++)
    box(g, m.curb, -4.2, top + 3.17, -16.9 + i * 0.58, 3.7, 0.14, 0.25);
  for (const z of [-15, -11.7]) {
    box(g, m.wood, -4.8, top + 0.48, z, 1.8, 0.15, 0.48);
    for (const s of [-1, 1])
      box(g, m.iron, -4.8 + s * 0.65, top + 0.21, z, 0.12, 0.42, 0.38);
    wall(-4.8, z, 1.8, 0.55, top + 0.56);
  }
  const tx = 2.65,
    tz = -15;
  cylinder(g, m.iron, tx, top + 0.7, tz, 0.13, 1.4);
  cylinder(g, m.aluminum, tx, top + 0.08, tz, 0.44, 0.16);
  beam(
    g,
    m.glass,
    [tx, top + 1.25, tz + 0.32],
    [tx, top + 1.58, tz - 0.65],
    0.28,
    0.34,
  );
  wall(tx, tz, 0.75, 0.94, top + 1.62);
  cylinder(g, m.wood, -1.6, 1.04, 16, 0.09, 2.08);
  box(g, m.rail, -1.6, 1.65, 16, 2.25, 0.69, 0.08);
  sign(
    g,
    labelMaterial("LA CORNICHE", {
      sub: "OBSERVATOIRE · ACCÈS PIÉTON",
      bg: "#244241",
    }),
    -1.6,
    1.65,
    16.055,
    2.21,
    0.63,
  );
  wall(-1.6, 16, 2.25, 0.17, 2.08);
  // Removable bollards keep cars below the ramp but leave a foot passage.
  for (const x of [-1.1, 0, 1.1]) {
    cylinder(g, m.rail, x, 0.5, c.entry + 0.4, 0.09, 1);
    cylinder(g, m.yellow, x, 0.83, c.entry + 0.4, 0.103, 0.12);
    wall(x, c.entry + 0.4, 0.19, 0.19, 1);
  }
  world.light(g, -4.2, top + 2.85, -13.4, 0xffcf99, 50, 9);
  world.batch.add(g);
}

// One small dynamic mesh for the birds gliding over the inlet. No AI, actors
// or collisions in the street simulation, and no updates outside the corniche.
export function shoreBirds(T, scene) {
  const n = 7,
    geom = new T.BufferGeometry(),
    pos = new Float32Array(n * 18),
    attr = new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage);
  geom.setAttribute("position", attr);
  const flock = new T.Mesh(
    geom,
    new T.MeshBasicMaterial({ color: 0xe4e3d6, side: T.DoubleSide }),
  );
  flock.position.set(c.x, 0, c.z - 46);
  flock.frustumCulled = false;
  flock.visible = false;
  scene.add(flock);
  return (eye, clock, reduced) => {
    flock.visible = (eye.x - c.x) ** 2 + (eye.z - c.z) ** 2 < 160 ** 2;
    if (!flock.visible) return;
    const t = reduced ? 0 : clock;
    for (let i = 0; i < n; i++) {
      const phase = t * 0.16 + i * 1.64,
        rx = 11 + i * 1.65,
        rz = 5 + i * 0.75,
        x = rx * Math.cos(phase),
        z = rz * Math.sin(phase),
        y = 6 + i * 0.46 + 0.55 * Math.sin(phase * 2),
        yaw = Math.atan2(-rx * Math.sin(phase), rz * Math.cos(phase)),
        flap = 0.13 + 0.22 * Math.sin(t * 4 + i * 2.33);
      let k = i * 18;
      for (const side of [-1, 1])
        for (const [dx, dy, dz] of [
          [0, 0, 0.31],
          [side * 0.42, 0.11, -0.16],
          [side * 0.91, flap, -0.29],
        ]) {
          pos[k++] = x + dx * Math.cos(yaw) + dz * Math.sin(yaw);
          pos[k++] = y + dy;
          pos[k++] = z - dx * Math.sin(yaw) + dz * Math.cos(yaw);
        }
    }
    attr.needsUpdate = true;
  };
}

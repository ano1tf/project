import { Mesh } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { labelMaterial, standard } from "./materials.js";

// Static masonry, prints and furniture share the district batches. Only the
// movable grille needs a separate mesh group and a switchable collision.
export function buildStation(
  world,
  site,
  { box, corner, mapped, sign, surface },
) {
  const { x, z, w, d, h, opening, gate, holdingWall, release, officer } = site,
    m = world.m,
    g = corner(x, z),
    front = d / 2,
    plaster = standard(0xbcbab0, { roughness: 0.92 }),
    teal = standard(0x345d63, { roughness: 0.68 }),
    graphite = standard(0x222e37),
    wood = standard(0xaf7c51, { roughness: 0.81 }),
    tile = standard(0x819693, { roughness: 0.8 }),
    paper = standard(0xe7dec7),
    light = standard(0xffebcd, { emissive: 0xffdfac, emissiveIntensity: 0.9 });
  world.shell(g, w, d, h, opening, m.concrete);
  const walls = [],
    trim = standard(0xa29d8e, { roughness: 0.94 });
  const drawSolid = (mat, x, z, w, d, h) => {
    box(g, mat, x, h / 2 + 0.092, z, w, h, d, true);
    walls.push(world.collision(g, x, z, w, d, h + 0.092));
  };
  const print = (title, sub, x, y, z, w, h, yaw = 0) =>
    sign(
      g,
      labelMaterial(title, { sub, bg: "#203b47", ink: "#f3e9cc", night: 0.29 }),
      x,
      y,
      z,
      w,
      h,
      yaw,
    );
  // Limestone frontage, recessed portal and lit transom above a flush landing.
  surface(g, m.quayPavers, 0, 0.086, front + 1.67, w - 1.25, 3.25, 3.1);
  for (const s of [-1, 1]) {
    box(g, trim, s * 6.5, 0.31, front + 0.243, 8.7, 0.42, 0.16);
    box(g, trim, s * 6.5, 3.34, front + 0.246, 8.66, 0.17, 0.18);
    box(g, plaster, s * 10.31, 1.95, front + 0.29, 0.36, 3.76, 0.21);
    box(
      g,
      teal,
      s * (opening / 2 + 0.15),
      1.62,
      front + 0.31,
      0.26,
      3.24,
      0.62,
      true,
    );
    box(g, graphite, s * 6.35, 1.91, front + 0.258, 4.82, 1.73, 0.15, true);
    box(g, m.shopGlass, s * 6.35, 1.91, front + 0.35, 4.62, 1.58, 0.05);
    for (const j of [-1, 0, 1])
      box(
        g,
        m.rail,
        s * 6.35 + j * 1.15,
        1.92,
        front + 0.397,
        0.054,
        1.54,
        0.06,
      );
    box(g, plaster, s * 6.35, 1.047, front + 0.36, 4.98, 0.13, 0.28);
    box(g, light, s * 2.35, 2.69, front + 0.27, 0.1, 0.29, 0.1);
  }
  box(g, teal, 0, 3.23, front + 0.4, 8.95, 0.17, 1.3, true);
  box(g, graphite, 0, 3.73, front + 0.28, 8.43, 0.73, 0.18, true);
  box(g, light, 0, 3.133, front + 0.45, 2.94, 0.034, 0.085);
  print(
    "COMMISSARIAT",
    "DES DOCKS   /   PORT-LUMIÈRE",
    0,
    3.73,
    front + 0.376,
    8.16,
    0.66,
  );
  world.light(g, 0, 2.9, front + 1.04, 0xffdda8, 67, 10.6);

  // Waiting room, reception and a separate holding area. The entrance to the
  // public lobby stays open; only the grille to the holding area can lock.
  surface(g, m.quayPavers, 0, 0.098, 0, w - 0.55, d - 0.53, 2.9);
  surface(
    g,
    tile,
    (holdingWall - w / 2) * 0.5,
    0.104,
    (-front + gate.z) / 2,
    holdingWall + w / 2 - 0.45,
    gate.z + front - 0.34,
  );
  box(
    g,
    teal,
    0,
    0.099,
    (front + gate.z) * 0.5,
    1.82,
    0.014,
    front - gate.z - 0.43,
  );
  for (const side of [-1, 1]) {
    box(g, plaster, side * (w * 0.5 - 0.28), 1.83, 0, 0.09, 3.66, d - 0.53);
    box(g, teal, side * (w * 0.5 - 0.23), 0.49, 0, 0.09, 0.8, d - 0.55);
  }
  box(g, plaster, 0, 1.84, -front + 0.28, w - 0.53, 3.68, 0.09);
  drawSolid(
    teal,
    holdingWall,
    (gate.z - front) * 0.5,
    0.23,
    gate.z + front,
    2.92,
  );
  // Two-tone wall paint is backed by the same partition collider.
  const insideZ = (gate.z - front) / 2,
    insideD = gate.z + front - 0.09;
  box(g, plaster, holdingWall - 0.116, 2.18, insideZ, 0.018, 1.66, insideD);
  box(g, plaster, holdingWall + 0.116, 2.18, insideZ, 0.018, 1.66, insideD);
  box(g, graphite, holdingWall - 0.132, 1.33, insideZ, 0.057, 0.038, insideD);
  box(g, graphite, holdingWall + 0.132, 1.33, insideZ, 0.057, 0.038, insideD);
  box(g, plaster, holdingWall - 0.112, 3.49, insideZ, 0.212, 1.01, insideD);
  print(
    "SÛRETÉ PORTUAIRE",
    "ACCUEIL   /   CONTRÔLES   /   OBJETS TROUVÉS",
    holdingWall - 0.145,
    1.94,
    -6.12,
    1.84,
    0.68,
    -Math.PI * 0.5,
  );
  for (const q of [-6.24, -5.98, -5.72])
    box(g, paper, holdingWall - 0.152, 1.42, q, 0.032, 0.22, 0.186);
  const leftEnd = -w / 2 + 0.12,
    rightEnd = holdingWall + 0.12;
  for (const [a, b] of [
    [leftEnd, gate.x - gate.w / 2],
    [gate.x + gate.w / 2, rightEnd],
  ]) {
    const mid = (a + b) / 2,
      span = b - a;
    box(g, teal, mid, 0.62, gate.z, span, 1.08, 0.21);
    box(g, teal, mid, 2.84, gate.z, span, 0.34, 0.21);
    for (let px = a + 0.09; px < b; px += 0.21)
      box(g, teal, px, 1.94, gate.z, 0.043, 1.55, 0.067);
    walls.push(world.collision(g, mid, gate.z, span, 0.22, 2.98));
  }
  box(g, graphite, gate.x, 2.76, gate.z, gate.w + 0.19, 0.22, 0.23);
  world.collision(g, gate.x, gate.z, gate.w, 0.25, 2.9, 2.63);
  print("RETENUE", "ACCÈS CONTRÔLÉ", gate.x, 3.214, gate.z + 0.16, 2.47, 0.62);
  print("SORTIE", "VERS LE PARVIS", 0, 2.9, front - 0.14, 2.45, 0.56, Math.PI);
  print(
    "ACCUEIL",
    "PERMANENCE   /   MAIRIE DE PORT-LUMIÈRE",
    5.6,
    2.27,
    -front + 0.35,
    4.34,
    1.02,
  );
  print(
    "FIN DU CONTRÔLE",
    "GUICHET DE SORTIE  •  01",
    holdingWall - 0.145,
    2.13,
    officer.z - z,
    2.52,
    0.67,
    -Math.PI / 2,
  );

  const gateModel = corner(x + gate.x, z + gate.z);
  gateModel.name = "Grille de retenue";
  for (const y of [0.3, 1.16, 2.54])
    box(gateModel, teal, 0, y, 0, gate.w, 0.093, 0.108);
  for (let i = 0; i < 12; i++)
    box(
      gateModel,
      teal,
      (i / 11 - 0.5) * (gate.w - 0.073),
      1.33,
      0,
      i === 0 || i === 11 ? 0.084 : 0.039,
      2.44,
      0.079,
    );
  box(gateModel, m.chrome, gate.w * 0.44, 1.15, 0.08, 0.14, 0.073, 0.095);
  const bars = [];
  for (const member of [...gateModel.children]) {
    if (member.material !== teal) continue;
    member.updateMatrix();
    bars.push(member.geometry.clone().applyMatrix4(member.matrix));
    gateModel.remove(member);
  }
  const grate = new Mesh(mergeGeometries(bars), teal);
  grate.receiveShadow = true;
  gateModel.add(grate);
  for (const bar of bars) bar.dispose();
  const gateCollision = world.collision(
    g,
    gate.x,
    gate.z,
    gate.w + 0.09,
    0.22,
    2.85,
  );
  gateCollision.enabled = false;
  // Kept outside the district batch so collision and visibility can change.
  world.scene.add(gateModel);
  gateModel.visible = false;

  // Small desk in the holding area and a larger, readable public counter.
  const hx = release.x - x + 0.86,
    hz = release.z - z;
  drawSolid(teal, hx, hz, 0.58, 1.72, 0.94);
  box(g, wood, hx, 1.078, hz, 0.75, 0.097, 1.89, true);
  box(g, paper, hx - 0.12, 1.139, hz - 0.3, 0.27, 0.014, 0.43);
  box(g, graphite, hx + 0.04, 1.25, hz + 0.48, 0.061, 0.25, 0.33);
  box(g, teal, hx + 0.005, 1.265, hz + 0.48, 0.023, 0.17, 0.25);
  box(g, paper, hx - 0.012, 1.287, hz + 0.483, 0.005, 0.012, 0.152);
  box(g, graphite, hx - 0.13, 1.18, hz - 0.36, 0.08, 0.076, 0.085);
  drawSolid(teal, 5.7, -2.45, 6.06, 1.2, 1.01);
  box(g, wood, 5.7, 1.132, -2.45, 6.23, 0.1, 1.42, true);
  for (let i = 0; i < 3; i++) {
    box(g, graphite, 3.7 + i * 1.95, 1.408, -2.66, 0.54, 0.36, 0.12);
    box(g, paper, 3.45 + i * 2.03, 1.191, -2.12, 0.32, 0.017, 0.29);
  }
  drawSolid(graphite, 7.85, -7.05, 4.28, 0.74, 1.92);
  for (let j = 0; j < 6; j++) {
    const bx = 6.06 + j * 0.716;
    box(g, teal, bx, 1.05, -6.671, 0.68, 1.78, 0.03);
    box(g, m.chrome, bx + 0.2, 1.13, -6.633, 0.034, 0.155, 0.05);
  }
  for (const [bx, bz] of [
    [-7.8, -6.98],
    [-6.75, 5.84],
    [6.7, 5.84],
  ]) {
    drawSolid(wood, bx, bz, 2.6, 0.61, 0.38);
    box(g, teal, bx, 0.7, bz + (bz > 0 ? 0.24 : -0.24), 2.6, 0.46, 0.087);
  }
  for (const [lx, lz] of [
    [-7.2, -4.45],
    [-6.4, 3.6],
    [0, 1.8],
    [6.4, -4.8],
    [6, 4.6],
  ]) {
    box(g, graphite, lx, 3.87, lz, 1.72, 0.075, 0.51, true);
    box(g, light, lx, 3.816, lz, 1.53, 0.037, 0.35);
    world.light(g, lx, 3.77, lz, lx < -4 ? 0xdfefec : 0xffe6bc, 94, 8.1);
  }
  // A painted stripe and notice board make the public side legible from above and inside.
  mapped(g, m.concrete, 0, 3.98, 0, w - 0.45, 0.15, d - 0.45, 2.5);
  box(g, teal, -9.46, 0.205, 2.4, 0.61, 0.24, 0.62);
  print(
    "PORT-LUMIÈRE",
    "SERVICE PUBLIC  /  ACCUEIL DU QUARTIER",
    -10.45,
    1.98,
    2.72,
    2.75,
    1.02,
    Math.PI / 2,
  );
  world.batch.add(g);
  return {
    walls,
    gate: gateCollision,
    hold(active) {
      gateCollision.enabled = gateModel.visible = active;
    },
  };
}

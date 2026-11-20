import { DOCKS, launchPose } from "./sondes.mjs";
import {
  GREVES_BRIDGE as deck,
  GREVES_RAILS,
  GREVES_WORKSHOP as shop,
  RIVE,
} from "./rive-layout.mjs";

// Map and Plan paint the same dry areas and road edges. Gameplay doesn't
// read from either canvas: this is just the representation of the catalogue.
export function paintRive(c, detail = false) {
  const rect = (r, color) => {
    c.fillStyle = color;
    c.fillRect(r.minX, r.minZ, r.maxX - r.minX, r.maxZ - r.minZ);
  };
  const r = RIVE.bounds;
  c.fillStyle = "#12272c";
  c.fillRect(
    r.minX - 1.34,
    r.minZ - 1.25,
    r.maxX - r.minX + 2.72,
    r.maxZ - r.minZ + 2.95,
  );
  rect(r, detail ? "#435157" : "#475953");
  c.strokeStyle = "#93a9a0";
  c.lineWidth = 0.34;
  c.strokeRect(r.minX, r.minZ, r.maxX - r.minX, r.maxZ - r.minZ);
  rect(RIVE.apron, "#647478");
  rect(RIVE.turn, "#5c6e71");
  rect(RIVE.road, "#5c6e71");
  const shape = { ...deck.bounds, minX: r.maxX, maxX: -186 };
  rect(shape, "#8e9b92");
  rect({ ...deck.road, minX: r.maxX - 1.5, maxX: -180 }, "#526569");
  c.fillStyle = "#ced4bd";
  for (let x = -319; x < -163; x += 6.3)
    c.fillRect(x, deck.z - 0.12, 2.8, 0.24);
  for (const [x, z, w, d] of GREVES_RAILS) {
    c.fillStyle = "#c3bd9e";
    c.fillRect(x - w / 2, z - d / 2, w, d);
  }
  if (!detail) return;
  c.fillStyle = "#c0b29545";
  for (let z = r.minZ + 1; z < r.maxZ; z += 2) {
    for (const x of [r.minX + 1.5, r.maxX - 3]) c.fillRect(x, z, 1.5, 0.13);
  }
  c.save();
  c.textAlign = "center";
  c.fillStyle = "#e6c98f";
  c.font = "600 1.45px sans-serif";
  c.fillText("ATELIER DES GRÈVES", shop.x - 2, shop.z + shop.d / 2 + 1.5);
  c.font = "500 1.16px monospace";
  c.fillStyle = "#d8e0d2";
  c.fillText("PONT DES GRÈVES", -216.7, 130.1);
  c.fillStyle = "#a7b4ae";
  c.fillText("QUAI DES CALFATS · 02", -285, 138.0);
  c.restore();
}

export function paintSondes(c, detail = false) {
  c.save();
  c.strokeStyle = "#70b9b596";
  c.lineWidth = detail ? 0.24 : 0.86;
  c.setLineDash(detail ? [1.5, 1.15] : [3.4, 2.8]);
  c.beginPath();
  for (let i = 0; i <= 12; i++) {
    const p = launchPose("port", i / 12);
    if (i === 0) c.moveTo(p.x, p.z);
    else c.lineTo(p.x, p.z);
  }
  c.stroke();
  c.setLineDash([]);
  for (const d of Object.values(DOCKS)) {
    const x = Math.min(d.x, d.waterX),
      w = Math.abs(d.x - d.waterX);
    c.fillStyle = "#46585f";
    c.fillRect(x, d.z + 2, w, 1.46);
    c.fillStyle = "#aaccba";
    c.fillRect(d.x - 0.8, d.z - 0.8, 1.6, 1.6);
    if (detail) {
      c.fillStyle = "#c5e3d3";
      c.textAlign = "center";
      c.font = "600 1.14px monospace";
      c.fillText("S2  ·  NAVETTE", d.x, d.z + 5.2);
    }
  }
  c.restore();
}

export function drawLaunch(c, p) {
  c.save();
  c.translate(p.x, p.z);
  c.rotate(p.heading);
  c.beginPath();
  c.moveTo(0, -4.1);
  c.lineTo(1.46, -1.9);
  c.lineTo(1.37, 3.62);
  c.lineTo(-1.37, 3.62);
  c.lineTo(-1.46, -1.9);
  c.closePath();
  c.fillStyle = "#437975";
  c.strokeStyle = "#b1d2b2";
  c.lineWidth = 0.21;
  c.fill();
  c.stroke();
  c.fillStyle = "#c7cec0";
  c.fillRect(-1.13, -2.92, 2.26, 2.11);
  c.fillStyle = "#467276";
  c.fillRect(-0.87, -2.71, 1.74, 0.56);
  c.restore();
}

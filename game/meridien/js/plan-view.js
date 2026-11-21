import { CORNICHE } from "./corniche.mjs";
import { localRegion } from "./region-paper.js";
import { EAST } from "./faubourgs.mjs";
import { paintEast } from "./faubourgs.mjs";
import {
  BOUNDS,
  X,
  Z,
  WX,
  WZ,
  DELIVERY_BAYS,
  GARDENS,
  QUAY_WALK,
  PROMENADE,
  SILLAGE_SQUARE,
  SEMAPHORE,
  SILLAGE_ZEBRA,
  JUNCTION_ZEBRA,
  LOCKED_YARD,
  STATION,
} from "./data.mjs";
import { clamp, distance, expEase, lerp, signalState, rng } from "./core.mjs";
import { berthAt } from "./port.mjs";
import { COMPTOIR } from "./port-layout.mjs";
import { WORLD } from "./sectors.mjs";
import { drawLaunch, paintRive, paintSondes } from "./rive-paper.js";
import { launchAt } from "./sondes.mjs";
import { LOG_TABLE } from "./rive-layout.mjs";

const left = WORLD.extent.minX - 22,
  top = EAST.bounds.minZ - 20,
  width = EAST.bounds.maxX + 22 - left,
  height = EAST.bounds.maxZ + 20 - top;
const signalColors = { red: "#ffa38e", amber: "#f6d479", green: "#89d5b7" };
const land = "#293e43",
  line = "#668082",
  port = "#152f3d",
  orange = "#ffc18c";
const outfit = { ruste: "#eeac79", night: "#c0d0ee", rain: "#efdf80" };
const buildings = {
  building: "#41565a",
  interior: "#433f38",
  container: "#756651",
};

function backdrop(world) {
  const canvas = document.createElement("canvas"),
    p = 2;
  canvas.width = width * p;
  canvas.height = height * p;
  const c = canvas.getContext("2d");
  c.scale(p, p);
  c.translate(-left, -top);
  c.fillStyle = port;
  c.fillRect(left, top, width, height);
  c.fillStyle = "#345160";
  for (let z = top + 3; z < top + height; z += 3.7)
    for (let x = left + (z % 2) * 2; x < BOUNDS.minX - 2; x += 8)
      c.fillRect(x, z, 4.4, 0.22);
  const { minX, maxX, minZ, maxZ } = BOUNDS,
    w = maxX - minX,
    h = maxZ - minZ;
  c.fillStyle = "#14282a";
  c.fillRect(minX - 1.9, minZ - 1.4, w + 3.4, h + 3.5);
  c.fillStyle = land;
  c.fillRect(minX, minZ, w, h);
  c.fillStyle = "#4d686c";
  c.fillRect(minX - 0.22, minZ, 0.56, h);
  c.fillRect(minX, minZ, w, 0.52);
  c.fillStyle = "#88918b";
  for (let z = minZ + 2; z < maxZ; z += 5.26)
    c.fillRect(minX + 0.035, z, 1.3, 0.215);
  c.strokeStyle = "#7b8c7f40";
  c.lineWidth = 0.15;
  for (let x = minX + 2; x < maxX; x += 6.3) {
    c.beginPath();
    c.moveTo(x, minZ);
    c.lineTo(x, maxZ);
    c.stroke();
  }
  for (let z = minZ + 2; z < maxZ; z += 6.3) {
    c.beginPath();
    c.moveTo(minX, z);
    c.lineTo(maxX, z);
    c.stroke();
  }
  const rand = rng(21178);
  c.fillStyle = "#8ea39a26";
  for (let i = 0; i < 2150; i++)
    c.fillRect(
      minX + rand() * w,
      minZ + rand() * h,
      0.4 + rand() * 0.9,
      0.17 + rand() * 0.28,
    );
  c.fillStyle = "#40575b";
  X.forEach((x, i) => c.fillRect(x - WX[i] / 2 - 0.68, minZ, WX[i] + 1.36, h));
  Z.forEach((z, i) => c.fillRect(minX, z - WZ[i] / 2 - 0.68, w, WZ[i] + 1.36));
  c.fillStyle = "#192a33";
  X.forEach((x, i) => c.fillRect(x - WX[i] / 2, minZ, WX[i], h));
  Z.forEach((z, i) => c.fillRect(minX, z - WZ[i] / 2, w, WZ[i]));
  for (const f of [...QUAY_WALK, SILLAGE_SQUARE, ...PROMENADE, ...GARDENS]) {
    const garden = GARDENS.includes(f),
      x = f.x - f.w * 0.5,
      z = f.z - f.d * 0.5;
    c.fillStyle = garden ? "#4f6c55" : "#887e62";
    c.fillRect(x, z, f.w, f.d);
    c.strokeStyle = garden ? "#779078" : "#a4a588";
    c.lineWidth = 0.16;
    c.strokeRect(x + 0.16, z + 0.16, f.w - 0.32, f.d - 0.32);
    if (garden) {
      for (let i = 0; i < 4; i++) {
        const tx = f.x + (i - 1.5) * f.w * 0.246,
          tz = f.z + (i % 2 ? 1 : -1) * f.d * 0.2;
        c.fillStyle = "#29423b";
        c.beginPath();
        c.arc(tx + 0.19, tz + 0.31, 1.28, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#6f9166";
        c.beginPath();
        c.arc(tx, tz, 1.03, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  // The same plinth marks the lookout when the 3D assembly is not loaded.
  c.save();
  c.translate(SEMAPHORE.x, SEMAPHORE.z);
  const half = SEMAPHORE.width / 2;
  c.fillStyle = "#344b50";
  c.fillRect(-half, -half, 2 * half, 2 * half);
  c.rotate(-SEMAPHORE.yaw);
  c.fillStyle = "#efc783";
  c.fillRect(-1.36, -0.19, 2.72, 0.38);
  c.beginPath();
  c.arc(0, 0, 0.53, 0, Math.PI * 2);
  c.fill();
  c.restore();
  const yard = LOCKED_YARD;
  c.fillStyle = "#bf77531e";
  c.fillRect(yard.x1, yard.z1, yard.x2 - yard.x1, yard.z2 - yard.z1);
  c.strokeStyle = "#c3856ea8";
  c.lineWidth = 0.25;
  c.setLineDash([0.9, 0.55]);
  c.strokeRect(yard.x1, yard.z1, yard.x2 - yard.x1, yard.z2 - yard.z1);
  c.setLineDash([]);
  c.fillStyle = "#577073";
  X.forEach((x) => {
    for (let z = minZ; z < maxZ; z += 6) {
      if (!Z.some((k) => Math.abs(k - z) < 11))
        c.fillRect(x - 0.07, z, 0.14, 2.8);
    }
  });
  Z.forEach((z) => {
    for (let x = minX; x < maxX; x += 6) {
      if (!X.some((k) => Math.abs(k - x) < 11))
        c.fillRect(x, z - 0.07, 2.8, 0.14);
    }
  });
  c.fillStyle = "#698181";
  for (let z = -131; z < 147; z += 6.9) {
    if (Z.some((k) => Math.abs(k - z) < 12)) continue;
    for (const side of [-1, 1]) {
      const px = X[0] + side * 5;
      c.fillRect(px - 0.08, z, 0.16, 3.13);
      c.fillRect(px + (side < 0 ? -1.6 : 0), z, 1.6, 0.15);
    }
  }
  c.fillStyle = "#809795";
  const zebra = SILLAGE_ZEBRA,
    depth = JUNCTION_ZEBRA.depth;
  for (
    let stripe = -zebra.span / 2 + 1.4;
    stripe < zebra.span / 2 - 1;
    stripe += 1.02
  )
    c.fillRect(
      zebra.x + stripe - 0.275,
      zebra.z - zebra.depth / 2,
      0.55,
      zebra.depth,
    );
  X.forEach((x, i) =>
    Z.forEach((z, j) => {
      for (const side of [-1, 1]) {
        const a = x + (WX[i] / 2 + JUNCTION_ZEBRA.center) * side - depth / 2,
          b = z + (WZ[j] / 2 + JUNCTION_ZEBRA.center) * side - depth / 2;
        for (let r = x - WX[i] / 2 + 0.62; r < x + WX[i] / 2 - 0.78; r += 0.89)
          c.fillRect(r, b, 0.47, depth);
        for (let r = z - WZ[j] / 2 + 0.62; r < z + WZ[j] / 2 - 0.78; r += 0.89)
          c.fillRect(a, r, depth, 0.47);
        c.fillRect(
          x + (side * WX[i]) / 4 - (WX[i] / 2 - 0.55) / 2,
          z + side * (WZ[j] / 2 + JUNCTION_ZEBRA.line) - 0.07,
          WX[i] / 2 - 0.55,
          0.14,
        );
        c.fillRect(
          x - side * (WX[i] / 2 + JUNCTION_ZEBRA.line) - 0.07,
          z + (side * WZ[j]) / 4 - (WZ[j] / 2 - 0.55) / 2,
          0.14,
          WZ[j] / 2 - 0.55,
        );
      }
    }),
  );
  paintEast(c);
  // The playable Plan view needs the same ramp mouth and deck edges as 3D.
  c.save();
  c.translate(CORNICHE.x, CORNICHE.z);
  const { rampWidth, deckWidth, entry, landing, back } = CORNICHE;
  c.fillStyle = "#9c8370";
  c.fillRect(-rampWidth / 2, landing, rampWidth, entry - landing);
  c.fillRect(-deckWidth / 2, back, deckWidth, landing - back);
  c.fillStyle = "#55625b";
  c.fillRect(-deckWidth / 2, back, deckWidth, 0.22);
  for (const side of [-1, 1]) {
    c.fillRect((side * deckWidth) / 2 - 0.08, back, 0.16, landing - back);
    c.fillRect((side * rampWidth) / 2 - 0.08, landing, 0.16, entry - landing);
  }
  c.fillStyle = "#6c5945";
  for (const z of [-15, -11.7]) c.fillRect(-5.7, z - 0.24, 1.8, 0.48);
  c.fillStyle = "#bcb59a";
  c.fillRect(2.4, -15.5, 0.5, 1);
  c.restore();
  paintRive(c, true);
  paintSondes(c, true);
  for (const bay of Object.values(DELIVERY_BAYS)) {
    c.save();
    c.translate(bay.x, bay.z);
    c.rotate(bay.heading);
    c.strokeStyle = "#a29167";
    c.lineWidth = 0.18;
    c.strokeRect(-1.34, -3.18, 2.68, 6.36);
    c.font = "600 .76px sans-serif";
    c.textAlign = "center";
    c.fillStyle = "#bcab7c";
    c.fillText("L", 0, 0.2);
    c.restore();
  }
  for (const b of world.buildings) {
    const x = b.x - b.w / 2,
      z = b.z - b.d / 2;
    c.fillStyle = "#101d236e";
    c.fillRect(x + 1.15, z + 1.38, b.w, b.d);
    c.fillStyle = buildings[b.kind] || buildings.building;
    c.fillRect(x, z, b.w, b.d);
    if (b.kind === "interior") continue;
    c.strokeStyle = line;
    c.lineWidth = 0.3;
    c.strokeRect(x, z, b.w, b.d);
    c.fillStyle = "#1d2c34";
    c.fillRect(x + b.w * 0.36, z + b.d * 0.3, b.w * 0.28, b.d * 0.4);
    c.fillStyle = "#9eb5ad52";
    c.fillRect(x + b.w * 0.36, z + b.d * 0.3, b.w * 0.28, 0.44);
  }
  for (const b of new Set([...world.solids.cells.values()].flat())) {
    const mid = { x: (b.x1 + b.x2) * 0.5, z: (b.z1 + b.z2) * 0.5 };
    if (
      world.buildings.some(
        (f) =>
          f.kind === "interior" &&
          Math.abs(mid.x - f.x) < f.w / 2 + 0.55 &&
          Math.abs(mid.z - f.z) < f.d / 2 + 0.55,
      ) &&
      b.bottom < 1 &&
      !b.dynamic
    ) {
      c.fillStyle = b.h < 1.65 ? "#796957" : "#aa9074";
      c.fillRect(b.x1, b.z1, b.x2 - b.x1, b.z2 - b.z1);
    }
  }
  // The station is drawn as a floor plan with the same solid partitions as 3D.
  const f = STATION,
    room = world.station;
  const x = f.x - f.w / 2,
    z = f.z - f.d / 2;
  c.fillStyle = "#486363";
  c.fillRect(x, z, f.w, f.d);
  c.fillStyle = "#657577";
  c.fillRect(x, z, f.w / 2 + f.holdingWall, f.d / 2 + f.gate.z);
  c.fillStyle = "#acc4be";
  for (const b of room.walls) c.fillRect(b.x1, b.z1, b.x2 - b.x1, b.z2 - b.z1);
  const front = z + f.d;
  c.fillRect(x, z, f.w, 0.35);
  c.fillRect(x, z, 0.35, f.d);
  c.fillRect(x + f.w - 0.35, z, 0.35, f.d);
  for (const side of [-1, 1])
    c.fillRect(
      side < 0 ? x : f.x + f.opening / 2,
      front - 0.34,
      (f.w - f.opening) / 2,
      0.34,
    );
  c.font = "600 1.18px sans-serif";
  c.textAlign = "center";
  c.fillStyle = "#bedad3";
  c.fillText("COMMISSARIAT DES DOCKS", f.x, front + 2.8);
  c.save();
  c.translate(minX + 8, 93);
  c.rotate(-Math.PI / 2);
  c.font = "500 1.18px monospace";
  c.textAlign = "center";
  c.fillStyle = "#a9cac390";
  c.fillText("QUAI DES MARÉES  /  ACCÈS 01", 0, 0);
  c.restore();
  return canvas;
}

export class PlanView {
  constructor(world) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "plan-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.ctx = this.canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: true,
    });
    this.tiles = backdrop(world);
    this.lamps = world.lamps.filter((l) => l.power >= 35);
    const stamp = document.createElement("canvas");
    stamp.width = stamp.height = 64;
    const ink = stamp.getContext("2d"),
      glow = ink.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, "#ffcf866b");
    glow.addColorStop(0.6, "#ffbb631f");
    glow.addColorStop(1, "#ffd09600");
    ink.fillStyle = glow;
    ink.fillRect(0, 0, 64, 64);
    this.glow = stamp;
  }
  size(w, h, scale) {
    const x = Math.floor(w * scale),
      y = Math.floor(h * scale);
    if (this.canvas.width !== x || this.canvas.height !== y) {
      this.canvas.width = x;
      this.canvas.height = y;
    }
  }
  car(c, car, player, siren, time) {
    c.save();
    c.translate(car.x, car.z);
    c.rotate(car.heading);
    const { width, length, accent } = car.spec,
      w = width * 0.5,
      d = length * 0.5;
    c.fillStyle = "#07161b";
    c.beginPath();
    (c.roundRect || c.rect).call(
      c,
      -w - 0.13,
      -d - 0.12,
      width + 0.26,
      length + 0.43,
      0.36,
    );
    c.fill();
    c.fillStyle = accent;
    c.beginPath();
    (c.roundRect || c.rect).call(c, -w, -d, width, length, 0.34);
    c.fill();
    c.fillStyle = "#81a7ab";
    c.fillRect(-w * 0.76, -d * 0.48, width * 0.76, d * 0.34);
    if (car.driver) {
      c.fillStyle = car.driver.hero
        ? "#f2ab79"
        : car.unit != null
          ? "#c0d5df"
          : "#e2cda8";
      c.beginPath();
      c.arc(-w * 0.43, -d * 0.254, 0.157, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#54717b";
    c.fillRect(-w * 0.76, d * 0.44, width * 0.76, d * 0.34);
    c.fillStyle = "#fff2b4";
    c.fillRect(-w * 0.85, -d, 0.43, 0.19);
    c.fillRect(w * 0.85 - 0.43, -d, 0.43, 0.19);
    c.fillStyle = car.braking ? "#ff977b" : "#cd645a";
    c.fillRect(-w * 0.87, d - 0.16, 0.43, 0.17);
    c.fillRect(w * 0.87 - 0.43, d - 0.16, 0.43, 0.17);
    if (siren) {
      c.fillStyle = Math.sin(time * 14) > 0 ? "#70b6ff" : "#ff7c6a";
      c.fillRect(-w * 0.65, d * 0.1, width * 0.65, 0.26);
    }
    if (player) {
      c.strokeStyle = orange;
      c.lineWidth = 0.14;
      c.strokeRect(-w - 0.28, -d - 0.28, width + 0.56, length + 0.56);
    }
    c.restore();
  }
  cut() {
    this.x = this.z = undefined;
  }
  draw(g, dt) {
    const c = this.ctx,
      w = this.canvas.width,
      h = this.canvas.height,
      p = g.hero,
      shot = g.sceneShot;
    const span = shot ? 13 : p.car ? 72 + Math.abs(p.car.speed) * 0.64 : 69;
    const s = clamp(Math.min(w, h) / span, 3.8, 26);
    const follow = shot
        ? {
            x: (shot.hero.x + shot.partner.x) * 0.5,
            z: (shot.hero.z + shot.partner.z) * 0.5,
          }
        : p,
      look = p.car ? Math.min(9, Math.abs(p.car.speed) * 0.55) : 0;
    const target = !shot && g.target(),
      mark = target && g.marker(target),
      path = target ? g.route(target) : [];
    const lead = mark && !p.car && !shot ? mark : p;
    const x =
        follow.x +
        Math.sin(p.heading) * look +
        clamp((lead.x - p.x) * 0.22, -7, 7),
      z =
        follow.z -
        Math.cos(p.heading) * look +
        clamp((lead.z - p.z) * 0.18, -5, 5);
    const fade = !!shot !== this.hadShot ? 1 : expEase(6, dt);
    this.hadShot = !!shot;
    this.x = lerp(this.x ?? x, x, fade);
    this.z = lerp(this.z ?? z, z, fade);
    c.fillStyle = port;
    c.fillRect(0, 0, w, h);
    c.save();
    c.translate(w * 0.47, h * (shot ? 0.43 : 0.54));
    c.scale(s, s);
    c.translate(-this.x, -this.z);
    c.drawImage(this.tiles, left, top, width, height);
    localRegion(c, this.x, this.z, w / s, h / s);
    const shutter = g.world.portSite.door;
    if (shutter.enabled) {
      c.fillStyle = "#eaad6d";
      c.fillRect(
        shutter.x1,
        shutter.z1,
        shutter.x2 - shutter.x1,
        shutter.z2 - shutter.z1,
      );
    }
    c.fillStyle = g.progress.port.venture.owned ? "#add6b3" : "#d1ab7a";
    c.font = "600 0.89px monospace";
    c.textAlign = "center";
    c.fillText("COMPTOIR 12", COMPTOIR.x, COMPTOIR.z + 5.7);
    const launch = launchAt(g.progress.time);
    if (distance(p, launch) < (Math.max(w, h) / s) * 0.72)
      drawLaunch(c, launch);
    const record = g.progress.passage.outcome,
      t = LOG_TABLE;
    if (distance(p, t) < 26) {
      c.fillStyle = "#766756";
      c.fillRect(t.x - t.w / 2, t.z - t.d / 2, t.w, t.d);
      c.fillStyle = record === "bulletin" ? "#cee3c0" : "#b1885e";
      c.fillRect(t.x - 0.41, t.z - 0.28, 0.82, 0.49);
      c.textAlign = "right";
      c.font = "600 .98px monospace";
      c.fillText(
        record === "bulletin"
          ? "TRACÉ AFFICHÉ"
          : record === "families"
            ? "POCHETTE DES FAMILLES"
            : "REGISTRE",
        t.x + t.w * 0.5,
        t.z + 1.65,
      );
    }
    const vessel = berthAt(g.progress.time);
    if (vessel) {
      c.save();
      c.translate(vessel.x, vessel.z);
      c.rotate(-vessel.yaw);
      c.fillStyle = "#9c6252";
      c.beginPath();
      c.moveTo(0, -11);
      c.lineTo(2.8, -6);
      c.lineTo(2.8, 8);
      c.lineTo(-2.8, 8);
      c.lineTo(-2.8, -6);
      c.closePath();
      c.fill();
      c.fillStyle = "#bfc6b1";
      c.fillRect(-2, -5, 4, 4.7);
      c.restore();
    }
    const gate = g.world.station.gate;
    if (gate.enabled) {
      c.fillStyle = "#f4ac74";
      c.fillRect(gate.x1, gate.z1 - 0.03, gate.x2 - gate.x1, 0.29);
    }
    const time = g.elapsed + (shot?.age || 0),
      night =
        0.33 + Math.min(1, Math.abs(g.progress.time / 60 - 12) / 10) * 0.67;
    for (const l of this.lamps) {
      if (
        Math.abs(l.x - this.x) > (w * 0.58) / s ||
        Math.abs(l.z - this.z) > (h * 0.66) / s
      )
        continue;
      const r = l.power > 65 ? 11 : 7;
      c.globalAlpha = night;
      c.drawImage(this.glow, l.x - r, l.z - r, r * 2, r * 2);
      c.globalAlpha = 1;
      c.fillStyle = "#ffe1af";
      c.fillRect(l.x - 0.09, l.z - 0.09, 0.18, 0.18);
    }
    if (g.prefs.guide && path.length > 1 && !shot) {
      c.beginPath();
      c.moveTo(p.x, p.z);
      for (const q of path.slice(1)) c.lineTo(q.x, q.z);
      c.lineJoin = c.lineCap = "round";
      c.strokeStyle = "#22202b";
      c.lineWidth = 0.49;
      c.stroke();
      c.setLineDash([0.62, 0.56]);
      c.strokeStyle = orange;
      c.lineWidth = 0.21;
      c.stroke();
      c.setLineDash([]);
    }
    X.forEach((x, i) =>
      Z.forEach((z, j) => {
        if (
          Math.abs(x - this.x) > (w * 0.58) / s ||
          Math.abs(z - this.z) > (h * 0.66) / s
        )
          return;
        c.fillStyle = signalColors[signalState(time, i, j, "z")];
        c.fillRect(x + WX[i] / 2 + 0.6, z + WZ[j] / 2 + 0.5, 0.34, 0.5);
        c.fillStyle = signalColors[signalState(time, i, j, "x")];
        c.fillRect(x + WX[i] / 2 + 0.6, z - WZ[j] / 2 - 0.5, 0.5, 0.34);
      }),
    );
    if (mark && g.prefs.guide && !shot) {
      c.save();
      c.translate(mark.x, mark.z);
      c.rotate(Math.PI / 4);
      c.lineWidth = 0.16;
      c.strokeStyle = orange;
      c.fillStyle = "#a36e4d4a";
      c.fillRect(-0.82, -0.82, 1.64, 1.64);
      c.strokeRect(-0.82, -0.82, 1.64, 1.64);
      c.restore();
      c.font = "600 1.22px sans-serif";
      c.textAlign = "center";
      c.strokeStyle = "#142732";
      c.lineWidth = 0.46;
      c.strokeText(mark.sign || mark.label || "REPÈRE", mark.x, mark.z - 1.92);
      c.fillStyle = "#ffe2bf";
      c.fillText(mark.sign || mark.label || "REPÈRE", mark.x, mark.z - 1.92);
    }
    for (const car of g.life.allCars())
      if (distance(p, car) < (Math.max(w, h) / s) * 0.8 || car === p.car)
        this.car(c, car, car === p.car, car.unit < g.life.alert.level, time);
    const person = (q, color, hero = false) => {
      c.save();
      c.translate(q.x, q.z);
      c.rotate(q.heading);
      const r = hero ? (q.crouch ? 0.49 : 0.63) : 0.38;
      if (hero) {
        c.strokeStyle = "#ffd39c95";
        c.lineWidth = 0.12;
        c.beginPath();
        c.arc(0, 0, 1.35, 0, Math.PI * 2);
        c.stroke();
      }
      c.lineWidth = 0.14;
      c.strokeStyle = "#0b1b23";
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(0, -r * 1.38);
      c.lineTo(r * 0.78, r * 0.7);
      c.lineTo(0, r * 0.31);
      c.lineTo(-r * 0.78, r * 0.7);
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    };
    for (const q of g.life.people)
      if (distance(p, q) < (Math.max(w, h) / s) * 0.8)
        person(q, q.alarmUntil > g.life.time ? "#fac797" : "#98b1b1");
    for (const q of g.life.drivers)
      if (
        q.alarmUntil > g.life.time &&
        distance(p, q) < (Math.max(w, h) / s) * 0.8
      )
        person(q, "#fac797");
    for (const q of g.life.fixed)
      if (q !== shot?.npc && distance(follow, q) < (Math.max(w, h) / s) * 0.8)
        person(q, "#d4cb9a");
    for (const q of g.localPeople()) person(q, "#9bdec7");
    for (const q of g.life.officers)
      if (distance(p, q) < (Math.max(w, h) / s) * 0.8) person(q, "#ed9784");
    if (shot) {
      const plays = shot.speaker === "noa";
      person(shot.partner, "#91c9c2", !plays);
      person(shot.hero, outfit[g.progress.wardrobe], plays);
    } else if (!p.car) person(p, outfit[g.progress.wardrobe], true);
    c.restore();
    const covered = g.world.isRoofed(follow);
    if (g.climate.wet > 0.1 && !covered) {
      const fog = Math.round(g.climate.wet * 13)
        .toString(16)
        .padStart(2, "0");
      c.fillStyle = "#568291" + fog;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "#9ec9d23d";
      c.lineWidth = 1;
      c.beginPath();
      for (let k = 0; k < 23; k++) {
        const x = (k * 173.61 + time * 27) % w,
          y = (k * 71.11 + time * (112 + (k % 3) * 29)) % h;
        c.moveTo(x, y);
        c.lineTo(x - 3, y - 10);
      }
      c.stroke();
    }
    if (g.climate.mist > 0.15 && !covered) {
      c.fillStyle = `rgba(160,192,194,${g.climate.mist * 0.12})`;
      c.fillRect(0, 0, w, h);
    }
  }
}

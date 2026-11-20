import { CLIENTS } from "./port.mjs";
import {
  BOUNDS,
  X,
  Z,
  WX,
  WZ,
  DISTRICTS,
  MAP_PLACES,
  PLACES,
  LOCKED_YARD,
  DELIVERY_BAYS,
  GARDENS,
  QUAY_WALK,
  PROMENADE,
  SILLAGE_SQUARE,
} from "./data.mjs";
import { clamp, distance } from "./core.mjs";
import { WORLD } from "./sectors.mjs";
import { GREVES_BRIDGE } from "./rive-layout.mjs";
import { paintRive, paintSondes } from "./rive-paper.js";
import { launchAt } from "./sondes.mjs";

export const CHART_COLORS = {
  sea: "#152e38",
  land: "#304543",
  shore: "#b6c3a3",
  street: "#5a6f6b",
  outline: "#213638",
  wall: "#3d5350",
  inside: "#657765",
  cargo: "#8a7659",
  garden: "#476450",
  walk: "#7e8167",
  target: "#ffb085",
  routeEnd: "#f0d79e",
  place: "#ddd4bb",
  side: "#e3c479",
  transport: "#91d5ce",
  shop: "#99d5bc",
  station: "#9fbded",
  owned: "#a4dce2",
  seized: "#e7a498",
  caution: "#db8e72",
  hero: "#fff7df",
};
const ink = CHART_COLORS,
  left = WORLD.extent.minX - 19,
  extent = { x: left, z: -179, w: 189 - left, d: 352 },
  north = BOUNDS.minZ,
  south = BOUNDS.maxZ,
  west = BOUNDS.minX,
  east = BOUNDS.maxX;
const sheets = new WeakMap();
const names = {
  cafe: "Le Sillage",
  bridge: "Pont des Grèves",
  greves: "Atelier des Grèves",
  sondesPort: "S2 · Les Marées",
  sondesGreves: "S2 · Les Grèves",
  ondes: "Atelier des Ondes",
  comptoir: "Comptoir 12",
  watch: "Poste de veille",
  semaphore: "Sémaphore",
  hangar: "Hangar 07",
  station: "Commissariat",
  belvedere: "Belvédère",
  courier: "La Darse",
  garage: "Garage",
  repair: "Le Ressac",
  relay: "Les Halles",
  depot: "Balise Nord",
};
const rect = (c, lot) =>
  c.fillRect(lot.x - lot.w / 2, lot.z - lot.d / 2, lot.w, lot.d);

// Static chart stock is reused by the full map and the scrolling radar.
function sheet(world) {
  if (sheets.has(world)) return sheets.get(world);
  const tile = document.createElement("canvas"),
    scale = 2.4;
  tile.width = Math.round(extent.w * scale);
  tile.height = Math.round(extent.d * scale);
  const c = tile.getContext("2d", { alpha: false });
  c.scale(tile.width / extent.w, tile.height / extent.d);
  c.translate(-extent.x, -extent.z);
  c.fillStyle = ink.sea;
  c.fillRect(extent.x, extent.z, extent.w, extent.d);
  c.fillStyle = "#88b6bd23";
  for (let z = extent.z + 3; z < extent.z + extent.d; z += 6.1)
    for (let x = extent.x + (z % 2) * 4; x < west - 2; x += 7.2)
      c.fillRect(x, z, 1.8, 0.28);
  c.strokeStyle = "#8eafad56";
  c.lineWidth = 0.35;
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    for (let z = extent.z; z <= extent.z + extent.d + 7; z += 7) {
      const x =
        west - 3.9 - i * 8.3 + Math.sin(z / 37 + i * 0.54) * (1.8 + i * 0.54);
      if (z === extent.z) c.moveTo(x, z);
      else c.lineTo(x, z);
    }
    c.stroke();
  }
  c.fillStyle = ink.land;
  c.fillRect(west, north, east - west, south - north);
  c.fillStyle = "#344c49";
  c.fillRect(west, north, 55, south - north);
  c.fillStyle = "#364e50";
  c.fillRect(-30, north, east + 30, 220);
  c.fillStyle = "#454f45";
  c.fillRect(-30, 49, east + 30, south - 49);
  c.strokeStyle = "#a9b3a042";
  c.lineWidth = 0.4;
  for (let x = -180; x < east; x += 20) {
    c.beginPath();
    c.moveTo(x, north);
    c.lineTo(x, south);
    c.stroke();
  }
  for (let z = -160; z < south; z += 20) {
    c.beginPath();
    c.moveTo(west, z);
    c.lineTo(east, z);
    c.stroke();
  }
  c.fillStyle = ink.outline;
  X.forEach((x, i) =>
    c.fillRect(x - WX[i] / 2 - 0.8, north, WX[i] + 1.6, south - north),
  );
  Z.forEach((z, i) =>
    c.fillRect(west, z - WZ[i] / 2 - 0.8, east - west, WZ[i] + 1.6),
  );
  c.fillStyle = ink.street;
  X.forEach((x, i) => c.fillRect(x - WX[i] / 2, north, WX[i], south - north));
  Z.forEach((z, i) => c.fillRect(west, z - WZ[i] / 2, east - west, WZ[i]));
  c.fillStyle = ink.walk;
  QUAY_WALK.forEach((lot) => rect(c, lot));
  PROMENADE.forEach((lot) => rect(c, lot));
  rect(c, SILLAGE_SQUARE);
  c.fillStyle = ink.garden;
  GARDENS.forEach((lot) => rect(c, lot));
  c.fillStyle = "#a9bc945c";
  for (const f of GARDENS)
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.arc(
        f.x + (i - 1.5) * f.w * 0.245,
        f.z + (i % 2 ? 1 : -1) * f.d * 0.2,
        1.25,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  c.fillStyle = "#c7cab06e";
  X.forEach((x, i) => {
    for (let z = north; z < south; z += 5.1)
      if (!Z.some((n, j) => Math.abs(z - n) < WZ[j] * 0.5 + 2.6))
        c.fillRect(x - (i === 2 ? 0.41 : 0.13), z, i === 2 ? 0.82 : 0.26, 2.35);
  });
  Z.forEach((z) => {
    for (let x = west; x < east; x += 5.1)
      if (!X.some((n, i) => Math.abs(x - n) < WX[i] * 0.5 + 2.6))
        c.fillRect(x, z - 0.14, 2.35, 0.28);
  });
  paintRive(c);
  paintSondes(c);
  for (const f of world.buildings) {
    const x = f.x - f.w * 0.5,
      z = f.z - f.d * 0.5;
    c.fillStyle = "#172b30a0";
    c.fillRect(x + 0.66, z + 0.81, f.w, f.d);
    c.fillStyle =
      f.kind === "container"
        ? ink.cargo
        : f.kind === "interior"
          ? ink.inside
          : ink.wall;
    c.fillRect(x, z, f.w, f.d);
    c.strokeStyle = "#b4c5aa6c";
    c.lineWidth = 0.28;
    c.strokeRect(x, z, f.w, f.d);
  }
  const { x1, x2, z1, z2 } = LOCKED_YARD;
  c.save();
  c.beginPath();
  c.rect(x1, z1, x2 - x1, z2 - z1);
  c.clip();
  c.fillStyle = "#b666451b";
  c.fillRect(x1, z1, x2 - x1, z2 - z1);
  c.strokeStyle = "#ef9b6669";
  c.lineWidth = 0.3;
  for (let x = x1 - (z2 - z1); x < x2; x += 3.2) {
    c.beginPath();
    c.moveTo(x, z1);
    c.lineTo(x + z2 - z1, z2);
    c.stroke();
  }
  c.restore();
  c.strokeStyle = ink.caution;
  c.lineWidth = 0.4;
  c.strokeRect(x1, z1, x2 - x1, z2 - z1);
  c.strokeStyle = ink.shore;
  c.lineWidth = 0.72;
  c.beginPath();
  c.moveTo(west, north);
  c.lineTo(west, GREVES_BRIDGE.bounds.minZ);
  c.moveTo(west, GREVES_BRIDGE.bounds.maxZ);
  c.lineTo(west, south);
  c.stroke();
  sheets.set(world, tile);
  return tile;
}
function marker(c, x, y, r, color, type) {
  c.fillStyle = color;
  c.strokeStyle = "#12262c";
  c.lineWidth = 1.4;
  c.beginPath();
  if (type === "square") c.rect(x - r * 0.72, y - r * 0.72, r * 1.44, r * 1.44);
  else if (type === "circle") c.arc(x, y, r * 0.83, 0, Math.PI * 2);
  else {
    c.moveTo(x, y - r);
    c.lineTo(x + r, y);
    c.lineTo(x, y + r);
    c.lineTo(x - r, y);
    c.closePath();
  }
  c.fill();
  c.stroke();
}
function arrow(c, x, y, facing, r) {
  c.save();
  c.translate(x, y);
  c.rotate(facing);
  c.beginPath();
  c.moveTo(0, -r);
  c.lineTo(r * 0.67, r * 0.68);
  c.lineTo(0, r * 0.32);
  c.lineTo(-r * 0.67, r * 0.68);
  c.closePath();
  c.fillStyle = ink.hero;
  c.fill();
  c.strokeStyle = "#15262a";
  c.lineWidth = 1.4;
  c.stroke();
  c.restore();
}
function plate(c, w, h, s) {
  const compact = w < 410;
  c.strokeStyle = "#c5b78e70";
  c.lineWidth = 1;
  c.strokeRect(6.5, 6.5, w - 13, h - 13);
  c.font = `500 ${compact ? 9 : 10}px "IBM Plex Mono",monospace`;
  c.textAlign = "left";
  c.fillStyle = "#edce9c";
  c.fillText(compact ? "PL / 01" : "PL / 01   ·   ESTUAIRE", 16, 22);
  c.textAlign = "center";
  c.fillStyle = ink.hero;
  c.fillText("N", w - 21, 19);
  arrow(c, w - 21, 30, 0, 6);
  const y = h - 15,
    x = w - 17;
  c.strokeStyle = "#e7d1a8";
  c.beginPath();
  c.moveTo(x - 50 * s, y - 4);
  c.lineTo(x - 50 * s, y);
  c.lineTo(x, y);
  c.lineTo(x, y - 4);
  c.stroke();
  c.fillText("50 m", x - 25 * s, y - 6);
}

// Canvas coordinates, symbol positions and hit testing share one projection.
export function drawChart(canvas, g, full = false) {
  const c = canvas.getContext("2d"),
    w = full ? canvas.clientWidth : canvas.width,
    h = full ? canvas.clientHeight : canvas.height;
  if (!w || !h) return null;
  if (full) {
    const dpi = Math.min(devicePixelRatio || 1, 2),
      px = Math.round(w * dpi),
      py = Math.round(h * dpi);
    if (canvas.width !== px || canvas.height !== py) {
      canvas.width = px;
      canvas.height = py;
    }
  }
  const hero = g.hero,
    target = g.target(),
    pos = target.point,
    compact = w < 410,
    ref = full
      ? { x: extent.x + extent.w * 0.5, z: (north + south) * 0.5 }
      : hero,
    s = full
      ? Math.min((w - 22) / extent.w, (h - 54) / (south - north))
      : Math.min(w / 114, h / 94),
    mx = (x) => (x - ref.x) * s + w / 2,
    mz = (z) => (z - ref.z) * s + h / 2;
  c.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
  c.fillStyle = ink.sea;
  c.fillRect(0, 0, w, h);
  c.drawImage(
    sheet(g.world),
    mx(extent.x),
    mz(extent.z),
    extent.w * s,
    extent.d * s,
  );
  const launch = launchAt(g.progress.time);
  if (full || distance(hero, launch) < 52)
    marker(
      c,
      mx(launch.x),
      mz(launch.z),
      full ? 3.5 : 4.1,
      ink.transport,
      "diamond",
    );
  if (full) {
    c.textAlign = "center";
    c.strokeStyle = "#243938";
    c.lineWidth = 2.8;
    c.fillStyle = "#c5d2bbaa";
    c.font = `500 ${compact ? 8 : 10}px "IBM Plex Mono",monospace`;
    for (const l of DISTRICTS) {
      c.strokeText(l.name, mx(l.x), mz(l.z));
      c.fillText(l.name, mx(l.x), mz(l.z));
    }
    c.save();
    c.translate(mx(-221), h * 0.52);
    c.rotate(-Math.PI / 2);
    c.fillStyle = "#8fb5b6";
    if (!compact) c.letterSpacing = "2px";
    c.fillText(compact ? "ESTUAIRE" : "ESTUAIRE DE PORT-LUMIÈRE", 0, 0);
    c.restore();
  }
  if (g.life.alert.level && g.life.alert.last) {
    const p = g.life.alert.last;
    c.fillStyle = "#e8756326";
    c.strokeStyle = "#e875639e";
    c.lineWidth = 1.1;
    c.beginPath();
    c.arc(mx(p.x), mz(p.z), 19 * s, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  const path = g.route(target);
  if (path.length > 1) {
    c.beginPath();
    c.moveTo(mx(hero.x), mz(hero.z));
    for (let i = 1; i < path.length; i++)
      c.lineTo(mx(path[i].x), mz(path[i].z));
    c.lineCap = c.lineJoin = "round";
    c.strokeStyle = "#182625";
    c.lineWidth = full ? 5 : 4.5;
    c.stroke();
    c.strokeStyle = ink.target;
    c.lineWidth = full ? 2.8 : 2.3;
    c.stroke();
  }
  if (!full) {
    // In 3D the arrow is Noa's heading; the translucent fan shows where the camera is looking.
    const x = mx(hero.x),
      z = mz(hero.z);
    const angle = (g.mode === "plan" ? hero.heading : g.yaw) - Math.PI * 0.5;
    c.fillStyle = "#d6e0c820";
    c.beginPath();
    c.moveTo(x, z);
    c.arc(x, z, 17, angle - 0.49, angle + 0.49);
    c.fill();
  }
  const marks = [];
  const add = (point, kind, label, shape, radius, named = true) => {
    marks.push({
      point,
      kind,
      label,
      shape,
      radius,
      named,
      x: mx(point.x),
      y: mz(point.z),
    });
  };
  for (const id of MAP_PLACES) {
    const p = PLACES[id];
    if (pos && distance(p, pos) < 1.8) continue;
    add(
      p,
      p.kind,
      names[id],
      p.kind === "shop" ? "square" : p.kind === "side" ? "circle" : "diamond",
      full ? 4.9 : 3.4,
    );
  }
  const job = g.progress.port.job;
  const freightBay = job?.stage === "loaded" ? CLIENTS[job.id].bay : "depot";
  for (const [id, bay] of Object.entries(DELIVERY_BAYS)) {
    if (!full || pos === bay) continue;
    if (job && id === freightBay) add(bay, "side", bay.label, "square", 4.8);
    else if (g.progress.courier.stage === id)
      add(bay, "side", "Arrêt livraison", "square", 4.8);
  }
  for (const v of g.life.allCars()) {
    if (!v.id || v === hero.car) continue;
    const label = v.spec.name + (v.trafficId ? " (volée)" : "");
    add(
      { x: v.x, z: v.z, label },
      v.trafficId ? "seized" : "owned",
      label,
      "square",
      full ? 5 : 4.3,
      false,
    );
  }
  const end = path.at(-1);
  if (full && pos && path.length > 1 && distance(end, pos) > 3.5) {
    add(
      { ...end, label: "Fin du tracé" },
      "routeEnd",
      "Fin du tracé",
      "circle",
      4.6,
      !compact,
    );
  }
  for (const u of g.life.units)
    if (g.life.alert.level > u.unit)
      marker(c, mx(u.x), mz(u.z), 5, "#f77d70", "diamond");
  if (pos) {
    const id = MAP_PLACES.find((id) => PLACES[id] === pos);
    add(
      pos,
      "target",
      id ? names[id] : pos.label || target.title,
      "diamond",
      full ? 7 : 6.2,
    );
    const last = marks.at(-1);
    if (!full) {
      last.x = clamp(last.x, 9, w - 9);
      last.y = clamp(last.y, 9, h - 9);
    }
    c.strokeStyle = "#ffd19c80";
    c.lineWidth = 1.1;
    c.beginPath();
    c.arc(last.x, last.y, last.radius + 3, 0, Math.PI * 2);
    c.stroke();
  }
  for (const m of marks)
    marker(c, m.x, m.y, m.radius, ink[m.kind] || ink.place, m.shape);
  if (full) {
    const occupied = marks.map(({ x, y, radius: r }) => [
      x - r - 1,
      y - r - 1,
      x + r + 1,
      y + r + 1,
    ]);
    occupied.push([
      mx(hero.x) - 8,
      mz(hero.z) - 9,
      mx(hero.x) + 8,
      mz(hero.z) + 9,
    ]);
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.font = `600 ${compact ? 9 : 11}px Manrope, sans-serif`;
    // Draw the tracked point first so it gets the best available label position.
    for (const m of [...marks].reverse()) {
      if (!m.named) continue;
      const tw = Math.min(c.measureText(m.label).width, w * 0.37),
        th = compact ? 12 : 15;
      const gap = m.radius + 4;
      const at = [
        [m.x + gap, m.y],
        [m.x - gap - tw, m.y],
        [m.x - tw * 0.5, m.y - gap - th * 0.5],
        [m.x - tw * 0.5, m.y + gap + th * 0.5],
      ]
        .map(([x, y]) => [x - 2, y - th * 0.5, x + tw + 2, y + th * 0.5])
        .find(
          ([a, b, d, e]) =>
            a > 10 &&
            b > 27 &&
            d < w - 10 &&
            e < h - 22 &&
            !occupied.some(([x, y, r, z]) => a < r && d > x && b < z && e > y),
        );
      if (!at) continue;
      const [x, y, r, b] = at;
      c.fillStyle = "#1b3033ed";
      c.fillRect(x, y, r - x, b - y);
      c.fillStyle = m.kind === "target" ? ink.target : "#e5ead9";
      c.fillText(m.label, x + 2, (y + b) * 0.5, tw);
      occupied.push(at);
    }
    c.textBaseline = "alphabetic";
    plate(c, w, h, s);
  }
  arrow(c, mx(hero.x), mz(hero.z), hero.heading, full ? 8.5 : 7.7);
  return {
    mx,
    mz,
    world: (x, y) => ({
      x: (x - w / 2) / s + ref.x,
      z: (y - h / 2) / s + ref.z,
    }),
    pick(x, y, reach) {
      let nearest = null,
        best = reach;
      for (let i = marks.length - 1; i >= 0; i--) {
        const m = marks[i],
          gap = Math.hypot(x - m.x, y - m.y);
        if (gap >= best) continue;
        nearest = m.point;
        best = gap;
      }
      return nearest;
    },
  };
}

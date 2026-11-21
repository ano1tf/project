import { paintEast } from "./faubourgs.mjs";
import {
  WEST,
  NORTH,
  TILE,
  NX,
  NZ,
  bandAt,
  biome,
  waters,
  zones,
  scenery,
  tileRoads,
  tileAt,
  roads,
  nodes,
  altitude,
  shoreline,
} from "./region.mjs";
const cache = new Map();
export function paper(i, j) {
  const k = i + ":" + j;
  if (cache.has(k)) return cache.get(k);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d"),
    x = WEST + i * TILE,
    z = NORTH + j * TILE;
  c.translate(-x, -z);
  for (let dz = 0; dz < TILE; dz += 16)
    for (let dx = 0; dx < TILE; dx += 16) {
      const a = x + dx + 8,
        b = z + dz + 8;
      c.fillStyle = waters(a, b) ? "#527e87" : zones[biome(a, b)][2];
      c.fillRect(a - 8, b - 8, 16, 16);
      const id = biome(a, b);
      if ((id === 3 || id === 6) && !waters(a, b)) {
        const hedge =
          (Math.floor((a + 0.25 * b) / 145) % 2 === 0) !==
          (Math.floor((b - 0.19 * a) / 118) % 2 === 0);
        c.fillStyle = hedge ? "#79783645" : "#e1c58744";
        c.fillRect(a - 8, b - 8, 16, 16);
      }
      c.fillStyle = `rgba(58,50,33,${0.025 + 0.025 * Math.sin(a * 0.014 + b * 0.012)})`;
      c.fillRect(a - 8, b - 8, 16, 16);
    }
  c.lineCap = "round";
  for (const [width, color] of [
    [15, "#b6aa94"],
    [11, "#62656a"],
    [0.65, "#e8dec0"],
  ]) {
    c.lineWidth = width;
    c.strokeStyle = color;
    c.setLineDash(width < 1 ? [4, 7] : []);
    c.beginPath();
    for (const { p, q } of tileRoads(i, j)) {
      c.moveTo(p.x, p.z);
      c.lineTo(q.x, q.z);
    }
    c.stroke();
  }
  if (cache.size >= 32) cache.delete(cache.keys().next().value);
  cache.set(k, canvas);
  return canvas;
}
export function localRegion(c, x, z, rx, rz) {
  const [i0, j0] = tileAt(x - rx, z - rz),
    [i1, j1] = tileAt(x + rx, z + rz);
  for (let i = Math.max(0, i0); i <= Math.min(NX - 1, i1); i++)
    for (let j = Math.max(0, j0); j <= Math.min(NZ - 1, j1); j++) {
      const a = WEST + i * TILE,
        b = NORTH + j * TILE;
      if (!bandAt(a + 1, b + 1)) continue;
      c.drawImage(paper(i, j), a, b, TILE, TILE);
      for (const p of scenery(i, j)) {
        c.fillStyle = {
          house: "#bc8668",
          tree: "#446041",
          pine: "#314e41",
          rock: "#767372",
          scrub: "#959261",
        }[p.kind];
        c.fillRect(p.x - p.w / 2, p.z - p.w * 0.43, p.w, p.w * 0.86);
      }
    }
}
let atlas;
export function regionalChart(canvas, g, view, city) {
  const w = canvas.clientWidth,
    h = canvas.clientHeight,
    c = canvas.getContext("2d"),
    s = Math.min(w / 18600, (h - 34) / 12600) * (view?.zoom ?? 1),
    cx = view?.center?.x ?? 8660,
    cz = view?.center?.z ?? 0,
    ox = w / 2 - cx * s,
    oz = h / 2 - cz * s;
  if (!atlas) {
    atlas = document.createElement("canvas");
    atlas.width = NX * 16;
    atlas.height = NZ * 16;
    const ctx = atlas.getContext("2d");
    for (let j = 0; j < atlas.height; j++)
      for (let i = 0; i < atlas.width; i++) {
        const x = WEST + 32 * i + 16,
          z = NORTH + 32 * j + 16;
        // Follow the actual curving intertidal margin rather than painting the
        // rectangular edges of the streamed tiles as the coastline.
        const depth = shoreline(z) - x;
        if (depth > 0) {
          ctx.fillStyle =
            depth < 42
              ? "#acc5af"
              : depth < 160
                ? "#709b94"
                : depth < 380
                  ? "#507b83"
                  : "#365965";
          ctx.fillRect(i, j, 1, 1);
          continue;
        }
        if (!bandAt(x, z)) continue;
        const wet = waters(x, z),
          id = biome(x, z),
          height = altitude(x, z);
        ctx.fillStyle = wet ? "#4f7985" : zones[id][2];
        ctx.fillRect(i, j, 1, 1);
        const shade =
          height / 890 + (Math.sin(i * 1.94 + j * 1.35) + 1) * 0.026;
        ctx.fillStyle = `rgba(40,45,40,${shade})`;
        ctx.fillRect(i, j, 1, 1);
        if (
          !wet &&
          (id === 3 || id === 6) &&
          (Math.floor((x + 0.25 * z) / 145) +
            Math.floor((z - 0.19 * x) / 118)) %
            2 ===
            0
        ) {
          ctx.fillStyle = "#e4cc8944";
          ctx.fillRect(i, j, 1, 1);
        }
        if (!wet && height > 10) {
          const slope =
            (altitude(x + 48, z + 48) - altitude(x - 48, z - 48)) / 96;
          ctx.fillStyle =
            slope > 0
              ? `rgba(255,235,191,${Math.min(0.32, slope * 1.6)})`
              : `rgba(30,46,53,${Math.min(0.32, -slope * 1.6)})`;
          ctx.fillRect(i, j, 1, 1);
        }
        if (
          !wet &&
          height > 18 &&
          Math.floor(height / 12) !== Math.floor(altitude(x + 32, z + 32) / 12)
        ) {
          ctx.fillStyle = "#4a574a55";
          ctx.fillRect(i, j, 1, 1);
        }
      }
    for (let i = 0; i < NX; i++)
      for (let j = 0; j < NZ; j++)
        for (const p of scenery(i, j)) {
          ctx.fillStyle =
            p.kind === "house"
              ? "#7a5841"
              : p.kind === "pine"
                ? "#2f493b80"
                : "#47574355";
          ctx.fillRect((p.x - WEST) / 32, (p.z - NORTH) / 32, 0.75, 0.75);
        }
  }
  c.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
  c.fillStyle = "#233e4a";
  c.fillRect(0, 0, w, h);
  c.drawImage(
    atlas,
    ox + WEST * s,
    oz + NORTH * s,
    TILE * NX * s,
    TILE * NZ * s,
  );
  c.fillStyle = "#808b88";
  c.fillRect(ox - 185 * s, oz - 155 * s, 367 * s, 310 * s);
  c.save();
  c.translate(ox, oz);
  c.scale(s, s);
  if (city && s > 0.18 && cx - w / (2 * s) < 1180) city(c);
  else paintEast(c);
  if (s > 0.65) localRegion(c, cx, cz, w / (2 * s), h / (2 * s));
  c.restore();
  c.strokeStyle = "#f0e3bc";
  c.lineWidth = 1;
  c.beginPath();
  for (const { p, q } of roads) {
    c.moveTo(ox + p.x * s, oz + p.z * s);
    c.lineTo(ox + q.x * s, oz + q.z * s);
  }
  c.stroke();
  const route = g.route?.() || [];
  if (route.length > 1) {
    c.beginPath();
    route.forEach((p, i) =>
      c[i ? "lineTo" : "moveTo"](ox + p.x * s, oz + p.z * s),
    );
    c.strokeStyle = "#f5aa69";
    c.lineWidth = 2;
    c.stroke();
  }
  c.font = "bold " + (w < 500 ? 9 : 12) + "px sans-serif";
  c.textAlign = "center";
  c.lineWidth = 3;
  c.strokeStyle = "#334740";
  c.fillStyle = "#faf4de";
  for (const [name, , , x, z] of zones) {
    c.strokeText(name, ox + x * s, oz + z * s);
    c.fillText(name, ox + x * s, oz + z * s);
  }
  c.fillStyle = "#fff";
  c.beginPath();
  c.arc(ox + g.hero.x * s, oz + g.hero.z * s, 4, 0, 2 * Math.PI);
  c.fill();
  c.fillStyle = "#fff";
  const destination = g.target?.()?.point;
  if (destination) {
    const x = ox + destination.x * s,
      y = oz + destination.z * s;
    c.save();
    c.translate(x, y);
    c.rotate(Math.PI / 4);
    c.fillStyle = "#ffa363";
    c.strokeStyle = "#332c23";
    c.lineWidth = 2;
    c.fillRect(-5, -5, 10, 10);
    c.strokeRect(-5, -5, 10, 10);
    c.restore();
  }
  const meters =
    [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000]
      .filter((n) => n * s < Math.min(120, w * 0.22))
      .at(-1) ?? 5;
  c.fillRect(14, h - 18, meters * s, 2);
  c.font = "11px sans-serif";
  c.textAlign = "left";
  c.fillText(
    meters >= 1000 ? `${meters / 1000} km` : `${meters} m`,
    14,
    h - 24,
  );
  c.fillText("N ↑", w - 35, 19);
  c.fillText("MÉRIDIEN   /   ATLAS RÉGIONAL", 12, 18);
  return {
    pick: (px, py, reach) => {
      let nearest = null,
        best = reach;
      for (const p of nodes) {
        const d = Math.hypot(ox + p.x * s - px, oz + p.z * s - py);
        if (d < best) {
          best = d;
          nearest = p;
        }
      }
      return nearest;
    },
    world: (x, y) => ({ x: (x - ox) / s, z: (y - oz) / s }),
  };
}

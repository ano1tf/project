import { roadStop, makeTrip } from "./atlas-trip.mjs";
import { regionalChart } from "./region-paper.js";
import { mapGestures } from "./map-gestures.js";
import { WORLD } from "./sectors.mjs";
import { zones, bandAt, waters } from "./region.mjs";
import { EAST, dry, paintEast, lots, squares } from "./faubourgs.mjs";
import { START, X, Z, WX, WZ, BOUNDS, districtName } from "./data.mjs";
import { paintRive } from "./rive-paper.js";
const canvas = document.querySelector("canvas"),
  places = document.querySelector("#places"),
  info = document.querySelector("#info");
const view = { zoom: 1 },
  game = {
    hero: START,
    target: () => ({ point: pin }),
    route: () => trip.path,
    stops: () => stages.map((v) => v.point),
  };
const stages = [];
let trip = makeTrip(stages);
let pin = null,
  projection;
function city(c) {
  const b = BOUNDS;
  c.fillStyle = "#68716c";
  c.fillRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
  c.fillStyle = "#344044";
  X.forEach((x, i) =>
    c.fillRect(x - WX[i] / 2, b.minZ, WX[i], b.maxZ - b.minZ),
  );
  Z.forEach((z, i) =>
    c.fillRect(b.minX, z - WZ[i] / 2, b.maxX - b.minX, WZ[i]),
  );
  paintEast(c);
  for (const p of lots) {
    c.fillStyle = "#465358";
    c.fillRect(p.x - p.w / 2, p.z - p.d / 2, p.w, p.d);
  }
  paintRive(c);
}
function draw() {
  const dpi = Math.min(2, devicePixelRatio || 1),
    w = Math.round(canvas.clientWidth * dpi),
    h = Math.round(canvas.clientHeight * dpi);
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  projection = regionalChart(canvas, game, view, city);
  document.querySelector("#level").textContent = `×${+view.zoom.toFixed(1)}`;
}
const zoom = mapGestures(
  canvas,
  () => projection,
  () => view,
  () => ({ ...WORLD.extent, maxZoom: 64 }),
  draw,
  (x, y, reach) => {
    const p = projection.pick(x, y, reach) || projection.world(x, y);
    if (
      !WORLD.allows(p.x, p.z) ||
      (WORLD.at(p.x, p.z) === EAST && !dry(p.x, p.z)) ||
      (bandAt(p.x, p.z) && waters(p.x, p.z))
    ) {
      info.textContent = "Choisissez un lieu sur la terre ferme.";
      return;
    }
    addStop(p, districtName(p.x, p.z)[0]);
  },
);
document.querySelector("#plus").onclick = () => zoom(2);
document.querySelector("#minus").onclick = () => zoom(0.5);
document.querySelector("#reset").onclick = () => {
  view.center = null;
  view.zoom = 1;
  places.value = "";
  document.querySelector("#add").disabled = true;
  draw();
};
function formatDistance(m) {
  return m < 1000
    ? `${Math.round(m)} m`
    : `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}
function refreshTrip() {
  trip = makeTrip(stages);
  pin = stages.at(-1)?.point ?? null;
  const list = document.querySelector("#stages");
  list.replaceChildren();
  stages.forEach((v, i) => {
    const row = document.createElement("li");
    row.textContent = `${v.name} · ${formatDistance(trip.legs[i].metres)} · alt. ${trip.legs[i].height} m`;
    list.append(row);
  });
  document.querySelector("#total").textContent = formatDistance(trip.length);
  document.querySelector("#undo").disabled = !stages.length;
  draw();
}
function addStop(p, name) {
  const point = roadStop(p);
  if (!point) return;
  if (
    stages.at(-1)?.point.x === point.x &&
    stages.at(-1)?.point.z === point.z
  ) {
    info.textContent = "Cette étape est déjà la dernière du parcours.";
    return;
  }
  if (stages.length >= 12) {
    info.textContent = "Parcours complet : retirez une étape pour continuer.";
    return;
  }
  stages.push({ point, name });
  info.textContent = `Étape ${stages.length} ajoutée sur la route : ${name}.`;
  refreshTrip();
}
document.querySelector("#undo").onclick = () => {
  stages.pop();
  refreshTrip();
  info.textContent = "Dernière étape retirée.";
};
const stops = [
  ["Port-Lumière", START.x, START.z, 32],
  ...squares.map((p) => [p.label, p.x, p.z, 64]),
  ...zones.map(([name, , , x, z]) => [name, x, z, 8]),
];
stops.forEach(([name], i) => places.add(new Option(name, String(i))));
places.onchange = () => {
  document.querySelector("#add").disabled = !places.value;
  if (!places.value) return;
  const [name, x, z, zoom] = stops[+places.value];
  view.center = { x, z };
  view.zoom = zoom;
  info.textContent = `Vue centrée sur ${name}.`;
  draw();
};
document.querySelector("#add").onclick = () => {
  if (places.value) {
    const [name, x, z] = stops[+places.value];
    addStop({ x, z }, name);
  }
};
new ResizeObserver(draw).observe(canvas);
refreshTrip();

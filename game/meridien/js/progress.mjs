import {
  START,
  STATION,
  VEHICLES,
  GARAGE_STOCK,
  TRAFFIC_IDS,
  CIVILIAN_COUNT,
  INITIAL_CASH,
  ENDINGS,
  FOOD_PRICE,
  REPAIR_PRICE,
  RAIN_PRICE,
} from "./data.mjs";
import { clamp } from "./core.mjs";
import { WORLD } from "./sectors.mjs";
import { echoPhase, freshEcho, restoreEcho } from "./echo.mjs";
import { freshPort, restorePort } from "./port.mjs";
import { freshWorkshop, restoreWorkshop } from "./littoral.mjs";
import { freshPassage, passagePhase, restorePassage } from "./passage.mjs";
import { DOCKS, freshTransit, restoreTransit } from "./sondes.mjs";
import {
  CASH_LIMIT,
  gameMinute,
  postCash,
  restoreLedger,
} from "./accounts.mjs";

export const LEGACY_SAVE_KEY = "meridien:progress:v1";
export const SAVE_KEY = "meridien:progress:v2";
export const PREF_KEY = "meridien:settings:v1";
export const VERSION = 2;
export const SAVE_SLOTS = Object.freeze([0, 1, 2]);
const ACTIVE_SLOT = "meridien:active-slot:v1";
const SAVE_BYTES = 256 * 1024;
export const slotName = (slot) => `Carnet ${slot + 1}`;
const slotKey = (slot, base = SAVE_KEY) =>
  slot === 0 ? base : `${base}:carnet-${slot + 1}`;
const finite = (n, fallback) =>
  typeof n === "number" && Number.isFinite(n) ? n : fallback;
const cars = ["mistral", ...GARAGE_STOCK];
const defaultVehicle = (key) => ({
  x: VEHICLES[key].x,
  z: VEHICLES[key].z,
  heading: VEHICLES[key].yaw,
  damage: 0,
});
export function freshProgress() {
  return {
    version: VERSION,
    position: { ...START },
    cash: INITIAL_CASH,
    stage: "contact",
    ending: null,
    wardrobe: "ruste",
    hasRaincoat: false,
    coffees: 0,
    sprintBonus: 0,
    time: 20 * 60 + 14,
    vehicles: { mistral: defaultVehicle("mistral") },
    activeVehicle: null,
    street: { robbed: [], seized: {} },
    alert: createAlert(),
    custody: null,
    courier: { stage: "idle", time: 0, runs: 0, best: null },
    echo: freshEcho(),
    port: freshPort(),
    workshop: freshWorkshop(),
    passage: freshPassage(),
    transit: freshTransit(),
    ledger: [],
    tracking: "story",
    waypoint: null,
  };
}
const stages = ["contact", "hangar", "archive", "belvedere", "done"];
const directions = ["story", "courier", "echo", "passage", "freight", "custom"];
export function validateProgress(p) {
  if (!p || (p.version !== 1 && p.version !== VERSION)) return null;
  const clean = freshProgress();
  clean.position = {
    ...WORLD.restore(p.position, START),
    heading: clamp(finite(p.position?.heading, START.heading), -1000, 1000),
  };
  clean.cash = Math.floor(clamp(finite(p.cash, INITIAL_CASH), 0, CASH_LIMIT));
  if (stages.includes(p.stage)) clean.stage = p.stage;
  if (
    clean.stage === "done" &&
    typeof p.ending === "string" &&
    Object.hasOwn(ENDINGS, p.ending)
  )
    clean.ending = p.ending;
  else if (clean.stage === "done") clean.stage = "belvedere";
  clean.hasRaincoat = p.hasRaincoat === true;
  clean.wardrobe =
    clean.hasRaincoat && p.wardrobe === "rain"
      ? "rain"
      : p.wardrobe === "night"
        ? "night"
        : "ruste";
  clean.coffees = Math.trunc(clamp(finite(p.coffees, 0), 0, 9));
  clean.sprintBonus = clamp(finite(p.sprintBonus, 0), 0, 95);
  clean.time = clamp(finite(p.time, clean.time), 0, 1439.999);
  for (const id of cars) {
    const c = p.vehicles?.[id];
    if (c && typeof c === "object" && !Array.isArray(c)) {
      const d = defaultVehicle(id);
      clean.vehicles[id] = {
        ...WORLD.restore(c, d),
        heading: clamp(finite(c.heading, d.heading), -1000, 1000),
        damage: clamp(finite(c.damage, 0), 0, 0.94),
      };
    }
  }
  const robbed = p.street?.robbed;
  if (Array.isArray(robbed))
    clean.street.robbed = Array.from(
      { length: CIVILIAN_COUNT },
      (_, i) => i,
    ).filter((i) => robbed.includes(i));
  for (const id of TRAFFIC_IDS) {
    const c = p.street?.seized?.[id];
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.z)) continue;
    clean.street.seized[id] = {
      ...WORLD.restore(c, START),
      heading: clamp(finite(c.heading, 0), -1000, 1000),
      damage: clamp(finite(c.damage, 0), 0, 0.94),
    };
  }
  if (
    typeof p.activeVehicle === "string" &&
    (Object.hasOwn(clean.vehicles, p.activeVehicle) ||
      Object.hasOwn(clean.street.seized, p.activeVehicle))
  )
    clean.activeVehicle = p.activeVehicle;
  const a = p.alert,
    level = Math.trunc(clamp(finite(a?.level, 0), 0, 3));
  if (level)
    clean.alert = {
      level,
      unseen: clamp(finite(a.unseen, 0), 0, 30),
      visible: clamp(finite(a.visible, 0), 0, 19),
      stop: clamp(finite(a.stop, 0), 0, CONTROL_SECONDS),
      last: {
        ...WORLD.restore(a.last, clean.position),
      },
    };
  if ([2, 3].includes(p.custody?.level)) {
    const at = clean.position;
    beginCustody(clean, p.custody.level);
    if (inHolding(at)) clean.position = at;
  }
  clean.courier.runs = Math.floor(clamp(finite(p.courier?.runs, 0), 0, 9999));
  const best = finite(p.courier?.best, 0);
  clean.courier.best =
    best > 0 && best < 155 ? Math.max(1, Math.round(best * 100) / 100) : null;
  const time = clamp(finite(p.courier?.time, 0), 0, 155);
  if (time > 0 && ["relay", "depot"].includes(p.courier?.stage))
    Object.assign(clean.courier, { stage: p.courier.stage, time });
  clean.echo = restoreEcho(p.echo, clean.stage);
  clean.port = restorePort(p.port, clean.time, clean.vehicles);
  clean.ledger = restoreLedger(p.ledger, gameMinute(clean));
  clean.workshop = restoreWorkshop(p.workshop, gameMinute(clean));
  clean.passage = restorePassage(p.passage, clean.echo, gameMinute(clean));
  clean.transit = restoreTransit(
    p.transit,
    gameMinute(clean),
    clean.custody || clean.alert.level,
  );
  if (clean.transit.ride) {
    const { x, z } = DOCKS[clean.transit.ride.from];
    clean.position = { x, z, heading: clean.position.heading };
    clean.activeVehicle = null;
  }
  if (directions.includes(p.tracking)) clean.tracking = p.tracking;
  if (
    clean.tracking === "echo" &&
    ["locked", "closed"].includes(echoPhase(clean))
  )
    clean.tracking = "story";
  if (
    p.waypoint &&
    Number.isFinite(p.waypoint.x) &&
    Number.isFinite(p.waypoint.z)
  )
    clean.waypoint = {
      ...WORLD.restore(p.waypoint, START),
      label:
        typeof p.waypoint.label === "string"
          ? p.waypoint.label.slice(0, 55)
          : "Repère personnel",
    };
  if (clean.tracking === "custom" && !clean.waypoint) clean.tracking = "story";
  if (clean.tracking === "freight" && !clean.port.job) clean.tracking = "story";
  if (
    clean.tracking === "passage" &&
    ["locked", "closed"].includes(passagePhase(clean))
  )
    clean.tracking = "story";
  return clean;
}
export function readSelectedSlot(storage) {
  try {
    const slot = Number(storage.getItem(ACTIVE_SLOT));
    if (SAVE_SLOTS.includes(slot)) return slot;
  } catch {}
  return 0;
}
export function writeSelectedSlot(storage, slot) {
  if (!SAVE_SLOTS.includes(slot)) return false;
  try {
    storage.setItem(ACTIVE_SLOT, String(slot));
    return true;
  } catch {
    return false;
  }
}
function inspectSave(text) {
  if (text == null) return { status: "empty", progress: null };
  try {
    const progress =
      text.length <= SAVE_BYTES && validateProgress(JSON.parse(text));
    if (progress) return { status: "ready", progress };
  } catch {}
  return { status: "invalid", progress: null };
}
export function readSlot(storage, slot = 0) {
  if (!SAVE_SLOTS.includes(slot)) return { status: "invalid", progress: null };
  try {
    // Never merge or write back to a legacy slot. Old builds cannot see extended carnets.
    const raw =
      storage.getItem(slotKey(slot)) ??
      storage.getItem(slotKey(slot, LEGACY_SAVE_KEY));
    return inspectSave(raw);
  } catch {
    return { status: "unavailable", progress: null };
  }
}
export function readSave(storage, slot = 0) {
  return readSlot(storage, slot).progress;
}
export function writeSave(storage, p, slot = 0, replaceDamaged = false) {
  if (!SAVE_SLOTS.includes(slot)) return false;
  try {
    const key = slotKey(slot);
    if (!replaceDamaged && readSlot(storage, slot).status === "invalid")
      return false;
    const clean = validateProgress(p);
    if (!clean) return false;
    const text = JSON.stringify(clean);
    if (text.length > SAVE_BYTES) return false;
    storage.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}
export function readSettings(storage) {
  const base = {
    sound: true,
    volume: 0.62,
    quality: "auto",
    weather: "auto",
    guide: true,
    voices: true,
    camera: "follow",
    view: "third",
    mouseLook: "direct",
  };
  try {
    const v = JSON.parse(storage.getItem(PREF_KEY));
    if (v && typeof v === "object") {
      base.sound = v.sound !== false;
      base.voices = v.voices !== false;
      base.volume = clamp(finite(v.volume, base.volume), 0, 1);
      base.guide = v.guide !== false;
      if (v.camera === "orbit") base.camera = "orbit";
      if (v.view === "first") base.view = "first";
      if (v.mouseLook === "drag") base.mouseLook = "drag";
      if (["auto", "standard", "low", "high", "plan"].includes(v.quality))
        base.quality = v.quality;
      if (["auto", "clear", "rain", "fog"].includes(v.weather))
        base.weather = v.weather;
    }
  } catch {}
  return base;
}
export function writeSettings(storage, p) {
  try {
    storage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {}
}

export function storyEvent(p, event, ending) {
  if (event === "contact" && p.stage === "contact") {
    p.stage = "hangar";
    return true;
  }
  if (event === "arrive" && p.stage === "hangar") {
    p.stage = "archive";
    return true;
  }
  if (event === "take" && p.stage === "archive") {
    p.stage = "belvedere";
    return true;
  }
  if (
    event === "finish" &&
    p.stage === "belvedere" &&
    typeof ending === "string" &&
    Object.hasOwn(ENDINGS, ending)
  ) {
    p.stage = "done";
    p.ending = ending;
    postCash(p, ENDINGS[ending].reward, "chapter");
    return true;
  }
  return false;
}
export function courierEvent(p, event) {
  const c = p.courier;
  if (event === "start" && c.stage === "idle") {
    c.stage = "relay";
    c.time = 155;
    p.tracking = "courier";
    return "started";
  }
  if (event === "relay" && c.stage === "relay" && c.time > 0) {
    c.stage = "depot";
    return "received";
  }
  if (event === "depot" && c.stage === "depot" && c.time > 0) {
    const elapsed = Math.max(1, Math.round((155 - c.time) * 100) / 100);
    if (elapsed < 155 && (!c.best || elapsed < c.best)) c.best = elapsed;
    c.stage = "idle";
    c.time = 0;
    c.runs++;
    postCash(p, 145, "courier");
    p.tracking = "story";
    return "paid";
  }
  return null;
}
export function courierTick(p, dt) {
  if (p.custody || p.courier.stage === "idle") return false;
  p.courier.time = Math.max(0, p.courier.time - dt);
  if (p.courier.time > 0) return false;
  p.courier.stage = "idle";
  if (p.tracking === "courier") p.tracking = "story";
  return true;
}
export function transactions(p, kind, key) {
  let amount = 0;
  switch (kind) {
    case "car":
      if (!GARAGE_STOCK.includes(key) || p.vehicles[key]) return false;
      amount = VEHICLES[key].price;
      break;
    case "outfit":
      if (p.hasRaincoat) return false;
      amount = RAIN_PRICE;
      break;
    case "coffee":
      if (p.coffees >= 9) return false;
      amount = p.ending === "protect" ? 0 : FOOD_PRICE;
      break;
    case "repair":
      if (
        !cars.includes(key) ||
        !p.vehicles[key] ||
        p.vehicles[key].damage < 0.045
      )
        return false;
      amount = REPAIR_PRICE;
      break;
    default:
      return false;
  }
  if (!postCash(p, -amount, kind)) return false;
  if (kind === "car") p.vehicles[key] = defaultVehicle(key);
  if (kind === "outfit") {
    p.hasRaincoat = true;
    p.wardrobe = "rain";
  }
  if (kind === "coffee") p.coffees++;
  if (kind === "repair") p.vehicles[key].damage = 0;
  return true;
}
export function useCoffee(p) {
  if (!p.coffees || p.sprintBonus > 15) return false;
  p.coffees--;
  p.sprintBonus = 90;
  return true;
}

export const CONTROL_SECONDS = 2.1;
export const createAlert = () => ({
  level: 0,
  unseen: 0,
  visible: 0,
  stop: 0,
  last: null,
});
export function raiseAlert(alert, point, by = 1) {
  alert.level = Math.min(3, Math.max(1, alert.level + by));
  alert.unseen = 0;
  alert.last = { x: point.x, z: point.z };
}
export function tickAlert(alert, dt, visible, canStop, point) {
  if (!alert.level) return null;
  if (visible) {
    alert.unseen = 0;
    alert.visible += dt;
    alert.last = { x: point.x, z: point.z };
    if (alert.visible >= 19 && alert.level < 3) {
      alert.level++;
      alert.visible = 0;
    }
  } else {
    alert.unseen += dt;
    alert.visible = Math.max(0, alert.visible - dt);
  }
  alert.stop =
    canStop && visible ? alert.stop + dt : Math.max(0, alert.stop - dt * 2);
  if (alert.stop >= CONTROL_SECONDS) {
    const level = alert.level;
    Object.assign(alert, createAlert());
    return level === 1 ? { type: "fine", fine: 35 } : { type: "arrest", level };
  }
  if (alert.unseen > 12 + alert.level * 6) {
    Object.assign(alert, createAlert());
    return { type: "evaded" };
  }
  return null;
}

// Custody is orthogonal to the chapter, navigation choice, delivery and garage.
// A legacy save without this optional state resumes as usual.
function inHolding(point) {
  const { x, z, w, d, holdingWall, gate } = STATION;
  return (
    point?.x > x - w / 2 &&
    point.x < x + holdingWall &&
    point.z > z - d / 2 &&
    point.z < z + gate.z
  );
}
export function beginCustody(progress, level) {
  if (progress.custody || ![2, 3].includes(level)) return false;
  progress.custody = { level };
  progress.activeVehicle = null;
  progress.position = { ...STATION.arrival };
  progress.alert = createAlert();
  return true;
}
export function endCustody(progress) {
  if (!progress.custody) return null;
  const fine = Math.min(progress.cash, progress.custody.level * 35);
  postCash(progress, -fine, "fine");
  progress.custody = null;
  return fine;
}

import { CASH_LIMIT, gameMinute, postCash } from "./accounts.mjs";
import { VEHICLES } from "./data.mjs";

export const CLIENTS = Object.freeze({
  market: {
    name: "Halles des Verrières",
    person: "Lina Mercier",
    goods: "vivres",
    capacity: 14,
    demand: 5,
    cost: 9,
    price: 26,
    retail: 33,
    bay: "relay",
  },
  greves: {
    name: "Atelier des Grèves",
    person: "Mina Derval",
    goods: "joints",
    capacity: 12,
    demand: 3,
    cost: 13,
    price: 34,
    retail: 46,
    bay: "grevesFreight",
  },
  garage: {
    name: "Garage Estuaire",
    person: "Élias Kermeur",
    goods: "pièces",
    capacity: 11,
    demand: 4,
    cost: 14,
    price: 36,
    retail: 49,
    bay: "garageFreight",
  },
});
export const PROPERTY_PRICE = 315;
export const RACK_PRICE = 70;
export const FLOAT = 65;
export const FREIGHT_WINDOW = 285;
const STORE_LIMIT = 40,
  BUDGET_LIMIT = 2100,
  NEWS_LIMIT = 20;
const ids = Object.keys(CLIENTS);
// The previous concession keeps its same clients and margins. Noa serves the new bank personally.
const delegated = ["market", "garage"];
const kinds = [
  "arrival",
  "unload",
  "departure",
  "shelves",
  "restock",
  "dispatch",
  "settled",
  "delivered",
  "expired",
  "returned",
  "property",
  "agreement",
];
const minute = (t) => ((t % 1440) + 1440) % 1440;
const whole = (v, limit, fallback = 0, lo = 0) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(lo, Math.min(limit, Math.trunc(v)))
    : fallback;
const clientKey = (id) => typeof id === "string" && Object.hasOwn(CLIENTS, id);
const sum = (n, delta) => Math.min(CASH_LIMIT, n + delta);
const trust = (c, delta) => (c.trust = whole(c.trust + delta, 8, 0, -5));

export const PORT_CALLS = Object.freeze([
  { name: "L’Estelle", arrives: 365, unload: 393, leaves: 445 },
  { name: "La Lanterne", arrives: 1010, unload: 1030, leaves: 1080 },
]);
export const PORT_SCHEDULE = Object.freeze([
  [365, "arrival", 0],
  [393, "unload", 0],
  [445, "departure", 0],
  [478, "demand"],
  [505, "dispatch", 577],
  [577, "settle"],
  [637, "restock"],
  [1010, "arrival", 1],
  [1030, "unload", 1],
  [1080, "departure", 1],
  [1095, "demand"],
  [1130, "dispatch", 1202],
  [1202, "settle"],
  [1280, "restock"],
]);

export function freshPort() {
  return {
    day: 0,
    depot: { market: 13, garage: 12, greves: 10 },
    clients: {
      greves: {
        stock: 2,
        funds: 760,
        trust: 0,
        deliveries: 0,
        shortage: false,
      },
      market: {
        stock: 4,
        funds: 640,
        trust: 0,
        deliveries: 0,
        shortage: false,
      },
      garage: {
        stock: 3,
        funds: 690,
        trust: 0,
        deliveries: 0,
        shortage: false,
      },
    },
    job: null,
    completed: 0,
    lost: 0,
    venture: {
      owned: false,
      rack: false,
      enabled: false,
      policy: "open",
      reserve: 0,
      earned: 0,
      costs: 0,
      trips: 0,
      order: null,
    },
    news: [],
    serial: 0,
    seen: 0,
  };
}

function addNews(port, at, kind, { id = null, qty = 0, trip = 0 } = {}) {
  port.news.unshift({ at, kind, id, qty, trip, n: ++port.serial });
  if (port.news.length > NEWS_LIMIT) port.news.length = NEWS_LIMIT;
}

export function restorePort(raw, time, vehicles) {
  const p = freshPort();
  if (!raw || typeof raw !== "object") return p;
  p.day = whole(raw.day, 999999);
  const at = p.day * 1440 + Math.floor(time);
  for (const id of ids) {
    p.depot[id] = whole(raw.depot?.[id], STORE_LIMIT, p.depot[id]);
    const c = raw.clients?.[id];
    if (!c || typeof c !== "object") continue;
    p.clients[id] = {
      stock: whole(c.stock, CLIENTS[id].capacity, p.clients[id].stock),
      funds: whole(c.funds, BUDGET_LIMIT, p.clients[id].funds),
      trust: whole(c.trust, 8, 0, -5),
      deliveries: whole(c.deliveries, CASH_LIMIT),
      shortage:
        c.shortage === true &&
        whole(c.stock, CLIENTS[id].capacity) < CLIENTS[id].demand,
    };
  }
  p.completed = whole(raw.completed, CASH_LIMIT);
  p.lost = whole(raw.lost, CASH_LIMIT);
  const b = raw.venture;
  if (b?.owned === true)
    Object.assign(p.venture, {
      owned: true,
      rack: b.rack === true,
      enabled: b.enabled === true,
      policy: b.policy === "market" ? "market" : "open",
      reserve: whole(b.reserve, CASH_LIMIT),
      earned: whole(b.earned, CASH_LIMIT),
      costs: whole(b.costs, CASH_LIMIT),
      trips: whole(b.trips, CASH_LIMIT),
    });
  const q = raw.job;
  if (
    clientKey(q?.id) &&
    ["collect", "loaded"].includes(q.stage) &&
    typeof q.vehicle === "string" &&
    Object.hasOwn(vehicles, q.vehicle) &&
    Number.isSafeInteger(q.due) &&
    q.due > at &&
    q.due <= at + FREIGHT_WINDOW &&
    [2, 5].includes(q.qty) &&
    q.qty <= vehicleCapacity(q.vehicle) &&
    Number.isSafeInteger(q.pay) &&
    q.pay >= 100 &&
    q.pay <= 240 &&
    q.qty <= CLIENTS[q.id].capacity - p.clients[q.id].stock &&
    q.pay + q.qty * CLIENTS[q.id].cost <= p.clients[q.id].funds &&
    (q.stage !== "collect" || p.depot[q.id] >= q.qty)
  ) {
    p.job = {
      id: q.id,
      stage: q.stage,
      vehicle: q.vehicle,
      due: q.due,
      qty: q.qty,
      pay: q.pay,
    };
    // An in-transit load keeps enough space for a possible return.
    if (q.stage === "loaded")
      p.depot[q.id] = Math.min(p.depot[q.id], STORE_LIMIT - q.qty);
  }
  const o = b?.order;
  if (
    p.venture.owned &&
    delegated.includes(o?.id) &&
    Number.isSafeInteger(o.eta) &&
    o.eta > at &&
    o.eta <= at + 72 &&
    [2, 4].includes(o.qty) &&
    (o.unit === CLIENTS[o.id].price ||
      (o.id === "market" && o.unit === CLIENTS.market.price - 3)) &&
    room(p, o.id) >= o.qty &&
    funds(p, o.id) >= o.unit * o.qty
  ) {
    p.venture.order = { id: o.id, qty: o.qty, unit: o.unit, eta: o.eta };
  }
  p.serial = whole(raw.serial, 100000000);
  p.seen = whole(raw.seen, p.serial);
  if (Array.isArray(raw.news))
    p.news = raw.news.slice(0, NEWS_LIMIT).flatMap((n) => {
      if (
        !kinds.includes(n?.kind) ||
        !Number.isSafeInteger(n.n) ||
        n.n < 1 ||
        n.n > p.serial ||
        !Number.isSafeInteger(n.at) ||
        n.at < 0 ||
        n.at > at
      )
        return [];
      return [
        {
          at: n.at,
          kind: n.kind,
          id: clientKey(n.id) ? n.id : null,
          qty: whole(n.qty, 80),
          trip: n.trip === 1 ? 1 : 0,
          n: n.n,
        },
      ];
    });
  return p;
}

export function vehicleCapacity(id) {
  if (typeof id !== "string" || !Object.hasOwn(VEHICLES, id)) return 0;
  const type = VEHICLES[id].type;
  return type === "van" ? 5 : type === "sport" ? 0 : type === "coupe" ? 2 : 3;
}
const room = (p, id) =>
  CLIENTS[id].capacity -
  p.clients[id].stock -
  (p.job?.id === id ? p.job.qty : 0) -
  (p.venture.order?.id === id ? p.venture.order.qty : 0);
const funds = (p, id) =>
  p.clients[id].funds -
  (p.job?.id === id ? p.job.pay + p.job.qty * CLIENTS[id].cost : 0) -
  (p.venture.order?.id === id ? p.venture.order.qty * p.venture.order.unit : 0);
const stock = (p, id) =>
  p.depot[id] - (p.job?.id === id && p.job.stage === "collect" ? p.job.qty : 0);

// Pay from the workshop, without spending any freight reservations.
export function payWorkshop(p, amount) {
  if (
    !Number.isInteger(amount) ||
    amount <= 0 ||
    funds(p.port, "greves") < amount ||
    p.cash > CASH_LIMIT - amount
  )
    return false;
  if (!postCash(p, amount, "inspection")) return false;
  p.port.clients.greves.funds -= amount;
  return true;
}

export function quoteFreight(p, id, vehicle, qty) {
  if (
    !clientKey(id) ||
    ![2, 5].includes(qty) ||
    typeof vehicle !== "string" ||
    !Object.hasOwn(p.vehicles, vehicle) ||
    vehicleCapacity(vehicle) < qty ||
    p.custody ||
    p.alert.level ||
    p.port.job
  )
    return null;
  const port = p.port,
    c = port.clients[id];
  const pay =
    94 +
    (id === "garage" ? 18 : id === "greves" ? 20 : 14) * qty +
    3 * Math.max(0, c.trust) +
    (c.shortage ? 14 : 0);
  if (
    stock(port, id) < qty ||
    room(port, id) < qty ||
    funds(port, id) < pay + qty * CLIENTS[id].cost
  )
    return null;
  return {
    id,
    vehicle,
    qty,
    pay,
    stage: "collect",
    due: gameMinute(p) + FREIGHT_WINDOW,
  };
}

export function signFreight(p, id, vehicle, qty) {
  const job = quoteFreight(p, id, vehicle, qty);
  if (!job) return false;
  p.port.job = job;
  if (p.courier.stage === "idle") p.tracking = "freight";
  return true;
}

function clearJob(p) {
  p.port.job = null;
  if (p.tracking === "freight") p.tracking = "story";
}

// The host checks the real bay, speed and car before calling these transactions.
export function handleFreight(p, kind, vehicle) {
  const port = p.port,
    j = port.job;
  const at = gameMinute(p);
  if (!j || p.custody || p.alert.level || j.vehicle !== vehicle || at >= j.due)
    return false;
  if (kind === "load" && j.stage === "collect" && port.depot[j.id] >= j.qty) {
    port.depot[j.id] -= j.qty;
    j.stage = "loaded";
    return true;
  }
  if (kind === "drop" && j.stage === "loaded") {
    const c = port.clients[j.id],
      bill = j.pay + CLIENTS[j.id].cost * j.qty;
    if (bill > c.funds || c.stock + j.qty > CLIENTS[j.id].capacity)
      return false;
    c.funds -= bill;
    c.stock += j.qty;
    if (c.stock >= CLIENTS[j.id].demand) c.shortage = false;
    c.deliveries = sum(c.deliveries, 1);
    trust(c, 1);
    port.completed = sum(port.completed, 1);
    postCash(p, j.pay, "freight");
    addNews(port, at, "delivered", { id: j.id, qty: j.qty });
    clearJob(p);
    return true;
  }
  if (
    kind === "return" &&
    j.stage === "loaded" &&
    port.depot[j.id] + j.qty <= STORE_LIMIT
  ) {
    port.depot[j.id] += j.qty;
    addNews(port, at, "returned", j);
    clearJob(p);
    return true;
  }
  return false;
}

export function cancelFreight(p) {
  if (p.custody || p.port.job?.stage !== "collect") return false;
  clearJob(p);
  return true;
}

export function manageVenture(p, command) {
  const port = p.port,
    b = port.venture;
  if (p.custody || p.alert.level) return false;
  if (command === "buy") {
    if (b.owned || !port.completed || !postCash(p, -PROPERTY_PRICE, "property"))
      return false;
    b.owned = true;
    addNews(port, gameMinute(p), "property");
    return true;
  }
  if (!b.owned) return false;
  if (command === "rack") {
    if (b.rack || !postCash(p, -RACK_PRICE, "fixture")) return false;
    b.rack = true;
  } else if (command === "fund") {
    if (b.reserve + FLOAT > CASH_LIMIT || !postCash(p, -FLOAT, "float"))
      return false;
    b.reserve += FLOAT;
  } else if (command === "draw") {
    const available = Math.min(b.reserve, CASH_LIMIT - p.cash);
    if (!available) return false;
    b.reserve -= available;
    postCash(p, available, "draw");
  } else if (command === "toggle") b.enabled = !b.enabled;
  else if (
    command === "market" &&
    b.policy !== "market" &&
    port.clients.market.trust >= 1
  ) {
    b.policy = "market";
    addNews(port, gameMinute(p), "agreement", { id: "market" });
  } else if (command === "open" && b.policy !== "open") {
    b.policy = "open";
    addNews(port, gameMinute(p), "agreement");
  } else return false;
  return true;
}

function dispatch(port, at, eta) {
  const b = port.venture;
  if (!b.owned || !b.enabled || b.order) return;
  let best = null;
  for (const id of b.policy === "market" ? ["market"] : delegated) {
    const c = CLIENTS[id],
      unit = c.price - (b.policy === "market" ? 3 : 0);
    for (const qty of b.rack ? [4, 2] : [2]) {
      const cost = 16 + c.cost * qty,
        total = unit * qty;
      if (
        stock(port, id) < qty ||
        room(port, id) < qty ||
        b.reserve < cost ||
        funds(port, id) < total
      )
        continue;
      const margin = total - cost;
      if (!best || margin > best.margin)
        best = { id, qty, unit, eta, margin, cost };
    }
  }
  if (!best) return;
  const { id, qty, unit, cost } = best;
  port.depot[id] -= qty;
  b.reserve -= cost;
  b.costs = sum(b.costs, cost);
  b.order = { id, qty, unit, eta };
  addNews(port, at, "dispatch", best);
}

function settle(port, at) {
  const b = port.venture,
    j = b.order;
  if (!j || j.eta > at) return;
  const c = port.clients[j.id],
    total = j.unit * j.qty;
  c.stock += j.qty;
  c.funds -= total;
  if (c.stock >= CLIENTS[j.id].demand) c.shortage = false;
  if (j.id === "market" && j.unit < CLIENTS.market.price) trust(c, 1);
  b.reserve = sum(b.reserve, total);
  b.earned = sum(b.earned, total);
  b.trips = sum(b.trips, 1);
  b.order = null;
  addNews(port, at, "settled", j);
}

function runEvent(port, at, kind, extra, day) {
  if (kind === "arrival" || kind === "departure")
    addNews(port, at, kind, { trip: extra });
  else if (kind === "unload") {
    let qty = 0;
    for (const id of ids) {
      const add = Math.min(
        STORE_LIMIT -
          port.depot[id] -
          (port.job?.id === id && port.job.stage === "loaded"
            ? port.job.qty
            : 0),
        (id === "greves"
          ? extra
            ? 6
            : 4
          : extra === Number(id === "garage")
            ? 9
            : 4) +
          (day % 3),
      );
      port.depot[id] += add;
      qty += add;
    }
    addNews(port, at, "unload", { trip: extra, qty });
  } else if (kind === "demand") {
    for (const id of ids) {
      const c = port.clients[id],
        demand = CLIENTS[id].demand + (day % 3 === 2 ? 1 : 0);
      const sold = Math.min(c.stock, demand);
      c.stock -= sold;
      c.funds = Math.min(BUDGET_LIMIT, c.funds + sold * CLIENTS[id].retail);
      c.shortage = sold < demand;
      if (c.shortage) addNews(port, at, "shelves", { id, qty: demand - sold });
    }
  } else if (kind === "restock") {
    for (const id of ids) {
      const c = port.clients[id],
        unit = CLIENTS[id].cost + 5;
      const qty = Math.max(
        0,
        Math.min(
          CLIENTS[id].demand + 1 - c.stock,
          room(port, id),
          stock(port, id),
          Math.floor(funds(port, id) / unit),
        ),
      );
      if (!qty) continue;
      c.funds -= qty * unit;
      c.stock += qty;
      if (c.stock >= CLIENTS[id].demand) c.shortage = false;
      port.depot[id] -= qty;
      addNews(port, at, "restock", { id, qty });
    }
  } else if (kind === "dispatch") dispatch(port, at, day * 1440 + extra);
  else if (kind === "settle") settle(port, at);
}

// Call only at minute transitions of the existing fixed-step clock. No wall time,
// no per-business/NPC loop at 60 Hz, and no replay of already crossed boundaries.
export function advancePort(p, before, after) {
  if (Math.floor(before) === Math.floor(after)) return false;
  const port = p.port,
    from = port.day * 1440 + Math.floor(before);
  const wrap = after < before;
  if (wrap) port.day++;
  const at = port.day * 1440 + Math.floor(after),
    prior = port.serial;
  const expire = (stamp) => {
    const job = port.job;
    if (!job || job.due > stamp) return;
    port.lost = sum(port.lost, 1);
    if (job.stage === "loaded") trust(port.clients[job.id], -1);
    addNews(port, job.due, "expired", job);
    clearJob(p);
  };
  for (let day = port.day - Number(wrap); day <= port.day; day++) {
    for (const [t, kind, extra] of PORT_SCHEDULE) {
      const eventAt = day * 1440 + t;
      if (eventAt <= from || eventAt > at) continue;
      expire(eventAt);
      runEvent(port, eventAt, kind, extra, day);
    }
  }
  expire(at);
  return port.serial !== prior;
}

export function vesselAt(time) {
  for (const [i, trip] of PORT_CALLS.entries()) {
    const { arrives, leaves } = trip;
    if (time >= arrives - 28 && time <= leaves + 32) {
      const out = time > leaves;
      const progress = out
        ? Math.min(1, (time - leaves) / 32)
        : Math.max(0, (arrives - time) / 28);
      return {
        trip: i,
        out,
        distance: progress * (2 - progress),
        moored: time >= arrives && !out,
      };
    }
  }
  return null;
}

export function agenda(p, limit = 6) {
  const now = gameMinute(p),
    day = p.port.day;
  const out = [];
  for (let offset = 0; offset <= 1; offset++) {
    for (const [time, kind, extra] of PORT_SCHEDULE) {
      if (!(
        ["arrival", "unload", "departure", "restock"].includes(kind) ||
        (kind === "dispatch" && p.port.venture.enabled)
      ))
        continue;
      const at = (day + offset) * 1440 + time;
      if (at > now) out.push({ at, kind, trip: extra ?? 0 });
    }
  }
  if (p.port.job) out.push({ at: p.port.job.due, kind: "deadline" });
  if (p.port.venture.order)
    out.push({ at: p.port.venture.order.eta, kind: "eta" });
  return out.sort((a, b) => a.at - b.at).slice(0, limit);
}
export function portClock(at) {
  const t = minute(at);
  return `J${Math.floor(at / 1440) + 1} · ${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function berthAt(time) {
  const v = vesselAt(time);
  if (!v) return null;
  return {
    ...v,
    x: -199.7 - 54 * v.distance,
    z: -108 + (v.out ? 53 : -63) * v.distance,
    yaw: (v.out ? -2.32 : 2.41) * v.distance,
  };
}

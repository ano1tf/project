import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  advancePort,
  agenda,
  berthAt,
  cancelFreight,
  CLIENTS,
  FLOAT,
  FREIGHT_WINDOW,
  handleFreight,
  manageVenture,
  portClock,
  PORT_CALLS,
  PROPERTY_PRICE,
  quoteFreight,
  RACK_PRICE,
  signFreight,
  vehicleCapacity,
} from "../game/meridien/js/port.mjs";
import {
  freshProgress,
  PREF_KEY,
  readSave,
  readSelectedSlot,
  readSettings,
  readSlot,
  SAVE_KEY,
  LEGACY_SAVE_KEY,
  validateProgress,
  writeSave,
  writeSelectedSlot,
  writeSettings,
} from "../game/meridien/js/progress.mjs";
import {
  CASH_LIMIT,
  gameMinute,
  LEDGER_LIMIT,
  postCash,
  restoreLedger,
} from "../game/meridien/js/accounts.mjs";
import { COMPTOIR } from "../game/meridien/js/port-layout.mjs";
import { Solids } from "../game/meridien/js/core.mjs";
import { parkingDetour, WalkRoutes } from "../game/meridien/js/navigation.mjs";
import { PortSite } from "../game/meridien/js/port-site.js";
import { parseKreoAsset } from "../editor/atelier/asset-format.mjs";

const load = (p) => validateProgress(JSON.parse(JSON.stringify(p)));
const stepClock = (p, after) => {
  const before = p.time;
  p.time = after;
  return advancePort(p, before, after);
};
const fakeStorage = () => {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
  };
};

function ownedVan(p) {
  p.vehicles.estuaire = { x: -159.3, z: -108.33, heading: 0, damage: 0.18 };
}

test("Freight quotes are capacity-gated, reserved, collected and paid only once", () => {
  let p = freshProgress();
  ownedVan(p);
  const freshCash = p.cash;
  assert.deepEqual(
    ["boreal", "mistral", "estuaire"].map(vehicleCapacity),
    [0, 2, 5],
  );
  assert.equal(quoteFreight(p, "market", "mistral", 5), null);
  assert.equal(quoteFreight(p, "garage", "__proto__", 2), null);
  assert.equal(signFreight(p, "garage", "estuaire", 5), true);
  assert.equal(p.port.job.pay, 184);
  assert.equal(p.tracking, "freight");
  assert.equal(p.port.depot.garage, 12);
  assert.equal(signFreight(p, "market", "mistral", 2), false);
  assert.equal(handleFreight(p, "drop", "estuaire"), false);
  assert.equal(handleFreight(p, "load", "mistral"), false);
  p.alert.level = 1;
  assert.equal(handleFreight(p, "load", "estuaire"), false);
  p.alert.level = 0;
  assert.equal(handleFreight(p, "load", "estuaire"), true);
  assert.equal(handleFreight(p, "load", "estuaire"), false);
  assert.equal(cancelFreight(p), false);
  assert.equal(p.port.depot.garage, 7);
  p.activeVehicle = "estuaire";
  p = load(p);
  assert.equal(p.port.job.stage, "loaded");
  assert.equal(p.activeVehicle, "estuaire");
  assert.equal(p.vehicles.estuaire.damage, 0.18);
  assert.equal(handleFreight(p, "drop", "estuaire"), true);
  assert.equal(handleFreight(p, "drop", "estuaire"), false);
  assert.equal(p.cash, freshCash + 184);
  assert.equal(p.port.clients.garage.stock, 8);
  assert.equal(
    p.port.clients.garage.funds,
    690 - 184 - 5 * CLIENTS.garage.cost,
  );
  assert.equal(p.port.clients.garage.trust, 1);
  assert.equal(p.port.completed, 1);
  assert.equal(p.port.news[0].kind, "delivered");
  assert.equal(p.tracking, "story");
  assert.deepEqual(load(p), p);
  assert.equal(quoteFreight(freshProgress(), "market", "estuaire", 2), null);
});

test("Midnight and exact expiry preserve a loaded contract across saves; only abandoned cargo costs trust", () => {
  let p = freshProgress();
  assert.ok(signFreight(p, "market", "mistral", 2));
  const due = p.port.job.due;
  assert.equal(due, gameMinute(p) + FREIGHT_WINDOW);
  assert.equal(portClock(due), "J2 · 00:59");
  assert.ok(handleFreight(p, "load", "mistral"));
  stepClock(p, 1439.8);
  stepClock(p, 0.01);
  p = load(p);
  assert.equal(p.port.day, 1);
  assert.equal(p.port.job.due, due);
  assert.equal(agenda(p)[0].kind, "deadline");
  const before = p.cash;
  assert.equal(stepClock(p, 58.99), false);
  assert.ok(p.port.job);
  assert.equal(stepClock(p, 59.01), true);
  assert.equal(p.port.job, null);
  assert.equal(p.port.lost, 1);
  assert.equal(p.port.news[0].at, due);
  assert.equal(p.port.clients.market.trust, -1);
  assert.equal(p.cash, before);
  assert.equal(stepClock(p, 59.99), false);
  assert.equal(load(p).port.lost, 1);
  assert.equal(signFreight(p, "garage", "mistral", 2), true);
  const garageDue = p.port.job.due;
  stepClock(p, garageDue % 1440);
  assert.equal(p.port.lost, 2);
  assert.equal(p.port.clients.garage.trust, 0);
});

test("Stock capacity reserves both a load at collection and space for its possible return", () => {
  let p = freshProgress();
  p.time = 360;
  p.port.depot.market = 38;
  assert.ok(signFreight(p, "market", "mistral", 2));
  assert.ok(cancelFreight(p));
  assert.equal(p.port.depot.market, 38);
  assert.equal(p.port.lost, 0);
  assert.ok(signFreight(p, "market", "mistral", 2));
  assert.ok(handleFreight(p, "load", "mistral"));
  assert.equal(p.port.depot.market, 36);
  stepClock(p, 393.01);
  assert.equal(p.port.depot.market, 38);
  assert.equal(p.port.news[0].kind, "unload");
  assert.equal(p.port.news[0].qty, 10); // 2 vivres + 4 pièces + 4 joints des Grèves.
  p = load(p);
  assert.ok(handleFreight(p, "return", "mistral"));
  assert.equal(p.port.depot.market, 40);
  assert.equal(p.port.news[0].kind, "returned");
  assert.equal(p.port.completed, 0);
  assert.equal(p.port.lost, 0);
  assert.equal(p.ledger.length, 0);
});

test("Escales, wholesale stock, consumption and restocks are deterministic through a midnight", () => {
  const a = freshProgress(),
    b = freshProgress();
  a.port.depot.market = b.port.depot.market = 0;
  for (const t of [
    1250, 1340, 1439.98, 0.07, 320, 365, 393, 445, 478, 637, 1030, 1430, 2,
  ])
    stepClock(a, t);
  for (const t of [1439.98, 0.07, 1430, 2]) stepClock(b, t);
  assert.deepEqual(a, b);
  assert.equal(a.port.day, 2);
  assert.equal(a.port.news[0].kind, "restock");
  assert.equal(a.port.clients.market.stock, 6);
  assert.equal(a.port.clients.garage.stock, 5);
  assert.equal(a.port.clients.market.shortage, false);
  assert.ok(a.port.news.some((r) => r.kind === "shelves"));
  assert.deepEqual(a, load(a));
  const first = PORT_CALLS[0],
    second = PORT_CALLS[1];
  assert.equal(berthAt(0), null);
  assert.equal(berthAt(first.arrives - 13).moored, false);
  assert.equal(berthAt(first.unload).x, -199.7);
  assert.equal(berthAt(first.leaves).distance, 0);
  assert.ok(berthAt(first.leaves + 12).distance > 0.55);
  assert.equal(berthAt(first.leaves + 33), null);
  assert.equal(berthAt(second.unload).trip, 1);
});

test("Property, funds, rack and an open distribution decision settle a reserved shipment once", () => {
  let p = freshProgress();
  p.time = 491;
  assert.equal(manageVenture(p, "buy"), false);
  postCash(p, 300, "chapter");
  assert.ok(signFreight(p, "market", "mistral", 2));
  assert.ok(handleFreight(p, "load", "mistral"));
  assert.ok(handleFreight(p, "drop", "mistral"));
  assert.ok(manageVenture(p, "buy"));
  assert.equal(p.cash, 662 - PROPERTY_PRICE);
  assert.equal(manageVenture(p, "buy"), false);
  assert.ok(manageVenture(p, "rack"));
  assert.equal(p.cash, 662 - PROPERTY_PRICE - RACK_PRICE);
  assert.equal(manageVenture(p, "rack"), false);
  assert.ok(manageVenture(p, "toggle"));
  assert.ok(manageVenture(p, "market"));
  assert.ok(manageVenture(p, "fund"));
  assert.ok(signFreight(p, "market", "mistral", 2)); // reserve competing room, funds and stock
  const cash = p.cash,
    before = p.port.depot.market;
  stepClock(p, 505.01);
  const b = p.port.venture;
  assert.deepEqual(b.order, { id: "market", qty: 4, unit: 23, eta: 577 });
  assert.equal(b.reserve, FLOAT - 52);
  assert.equal(b.costs, 52);
  assert.equal(p.port.depot.market, before - 4);
  assert.equal(p.cash, cash);
  assert.ok(manageVenture(p, "toggle")); // only future departures are suspended
  p = load(p);
  assert.equal(p.port.venture.order.eta, 577);
  assert.ok(handleFreight(p, "load", "mistral"));
  assert.ok(handleFreight(p, "drop", "mistral"));
  const personal = p.cash;
  const paid = p.port.venture;
  stepClock(p, 577.01);
  assert.equal(paid.order, null);
  assert.equal(paid.reserve, FLOAT - 52 + 92);
  assert.equal(paid.earned, 92);
  assert.equal(paid.trips, 1);
  assert.equal(p.port.clients.market.stock, 12);
  assert.equal(p.port.clients.market.trust, 3);
  assert.equal(p.cash, personal);
  assert.equal(stepClock(p, 577.99), false);
  assert.ok(manageVenture(p, "draw"));
  assert.equal(p.cash, personal + 105);
  assert.ok(manageVenture(p, "open"));
  assert.deepEqual(load(p), p);
});

test("Restocking cannot spend or load a signed client's reservations, even at the boundary", () => {
  let p = freshProgress();
  p.time = 630;
  p.port.depot.market = 2;
  p.port.clients.market.funds = 140;
  p.port.clients.market.stock = 0;
  assert.ok(signFreight(p, "market", "mistral", 2));
  stepClock(p, 637.01);
  assert.equal(p.port.depot.market, 2);
  assert.equal(p.port.clients.market.funds, 140);
  assert.equal(p.port.clients.market.stock, 0);
  p = load(p);
  assert.ok(handleFreight(p, "load", "mistral"));
  assert.ok(handleFreight(p, "drop", "mistral"));
  assert.equal(p.port.clients.market.funds, 0);
});

test("Three isolated carnets preserve v1 and shared settings, and damaged bytes require explicit replacement", () => {
  const s = fakeStorage();
  const initial = JSON.stringify({
    version: 1,
    cash: 489,
    stage: "done",
    ending: "protect",
    time: 150,
  });
  s.setItem(LEGACY_SAVE_KEY, initial);
  s.setItem(`${LEGACY_SAVE_KEY}:carnet-3`, "{partie interrompue");
  assert.equal(readSelectedSlot(s), 0);
  assert.equal(readSlot(s, 0).status, "ready");
  assert.equal(readSlot(s, 1).status, "empty");
  assert.equal(readSlot(s, 2).status, "invalid");
  const a = readSave(s);
  assert.equal(a.stage, "done");
  assert.deepEqual(a.ledger, []);
  assert.equal(a.port.day, 0);
  assert.ok(signFreight(a, "market", "mistral", 2));
  assert.ok(writeSave(s, a, 1));
  assert.equal(s.getItem(LEGACY_SAVE_KEY), initial);
  assert.deepEqual(readSave(s, 1), a);
  assert.ok(writeSelectedSlot(s, 1));
  assert.equal(readSelectedSlot(s), 1);
  assert.equal(readSave(s).port.job, null);
  assert.equal(writeSave(s, a, 2), false);
  assert.equal(s.getItem(`${LEGACY_SAVE_KEY}:carnet-3`), "{partie interrompue");
  assert.ok(writeSave(s, freshProgress(), 2, true));
  assert.equal(readSave(s, 2).stage, "contact");
  assert.equal(s.getItem(`${LEGACY_SAVE_KEY}:carnet-3`), "{partie interrompue");
  assert.ok(s.getItem(`${SAVE_KEY}:carnet-3`));
  assert.equal(writeSave(s, a, 3), false);
  assert.equal(writeSelectedSlot(s, "1"), false);
  writeSettings(s, { quality: "plan" });
  assert.ok(s.getItem(PREF_KEY));
  assert.equal(readSettings(s).quality, "plan");
  assert.equal(readSlot(null).status, "unavailable");
  assert.equal(writeSave(null, a, 0), false);
  assert.equal(writeSelectedSlot(null, 0), false);
});

test("Ledger rejects bad postings, keeps actual deltas at the ceiling, sanitizes and bounds history", () => {
  const p = freshProgress();
  assert.equal(postCash(p, -1000, "car"), false);
  assert.equal(postCash(p, 1, "__proto__"), false);
  assert.equal(postCash(p, 1.5, "freight"), false);
  for (let i = 0; i < 39; i++) assert.ok(postCash(p, 1, "courier"));
  assert.equal(p.ledger.length, LEDGER_LIMIT);
  assert.equal(p.ledger[0].balance, 279);
  assert.equal(p.ledger.at(-1).balance, 244);
  assert.ok(postCash(p, CASH_LIMIT, "chapter"));
  assert.equal(p.cash, CASH_LIMIT);
  assert.equal(p.ledger[0].delta, CASH_LIMIT - 279);
  const row = p.ledger[0];
  assert.deepEqual(
    restoreLedger(
      [
        null,
        row,
        { ...row, at: 1660 },
        { ...row, balance: 0 },
        { ...row, kind: "__proto__" },
      ],
      gameMinute(p),
    ),
    [row],
  );
  assert.deepEqual(load(p).ledger, p.ledger);
});

test("Comptoir uses the shared Atelier hierarchy and a navigable, toggleable opening", async () => {
  const { asset, stats } = parseKreoAsset(
    await readFile(
      new URL(
        "../editor/atelier/exemples/comptoir-12.kreo-asset.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.match(asset.name, /^Comptoir 12/);
  assert.ok(stats.triangles > 1000 && stats.triangles < 9000);
  for (const id of ["facade", "shutter", "interior", "reserve"])
    assert.equal(asset.objects.find((o) => o.id === id).type, "group");
  assert.equal(
    asset.objects.find((o) => o.id === "reserve").parent,
    "interior",
  );
  const f = COMPTOIR,
    solids = new Solids();
  for (const [x, z, w, d, h, bottom] of f.solids)
    solids.add(f.x + x, f.z + z, w, d, h, bottom);
  const o = f.opening,
    gate = solids.add(f.x + o.x, f.z + o.z, o.w, o.d, o.h);
  const route = new WalkRoutes(solids);
  assert.equal(solids.blocked(f.x + o.x, f.z + o.z), true);
  assert.ok(route.route(f.door, f.desk).every((pt) => pt.z >= f.z + o.z));
  gate.enabled = false;
  route.occupancy.fill(0);
  const walk = route.route(f.door, f.desk);
  assert.equal(walk.at(-1), f.desk);
  assert.equal(solids.blocked(f.x + o.x, f.z + o.z), false);
  assert.ok(
    solids.trace(f.x - 3, 1.6, f.z + 6, f.x - 3, 1.6, f.z) < 1,
    "a window remains solid",
  );
});

test("Walking tracks detour around a stationary car but still target its door when selected", () => {
  const car = { x: 0, z: 0, heading: 0, spec: { width: 1.84, length: 4.42 } };
  const start = { x: -1.62, z: 0 },
    next = { x: 2.3, z: -0.35 };
  const path = [start, next];
  const around = parkingDetour(path, [car], () => true);
  assert.equal(around.length, 4);
  assert.equal(around[0], start);
  assert.equal(around.at(-1), next);
  for (let i = 1; i < 4; i++)
    for (let t = 0; t <= 1; t += 0.025) {
      const u = around[i - 1],
        v = around[i];
      assert.ok(
        Math.abs(u.x * (1 - t) + v.x * t) > 1.23 ||
          Math.abs(u.z * (1 - t) + v.z * t) > 2.48,
      );
    }
  const toVehicle = [start, car];
  assert.equal(
    parkingDetour(toVehicle, [car], () => true),
    toVehicle,
  );
  assert.equal(
    parkingDetour(path, [car], () => false),
    path,
  );
});

test("Loading a former forecourt save cannot trap Noa or a parked vehicle behind the new shutter", () => {
  const site = new PortSite({ lot() {}, solids: new Solids(), lamps: [] });
  const p = freshProgress();
  p.position = { x: COMPTOIR.x, z: COMPTOIR.z, heading: 1.3 };
  p.vehicles.mistral = { ...p.position, damage: 0.2 };
  p.street.seized["trafic-1"] = { ...p.position, damage: 0.1 };
  assert.ok(site.contains(p.position));
  site.recover(p);
  assert.equal(p.position.x, COMPTOIR.door.x);
  assert.ok(p.position.z > COMPTOIR.door.z);
  assert.equal(p.vehicles.mistral.damage, 0.2);
  assert.equal(p.street.seized["trafic-1"].damage, 0.1);
  assert.ok(
    Math.hypot(
      p.vehicles.mistral.x - p.street.seized["trafic-1"].x,
      p.vehicles.mistral.z - p.street.seized["trafic-1"].z,
    ) > 5.59,
  );
  assert.equal(site.contains(p.vehicles.mistral), false);
  assert.equal(p.cash, 240);
  site.sync({ owned: true, rack: false });
  p.position = { x: COMPTOIR.x, z: COMPTOIR.z, heading: 1.3 };
  site.recover(p);
  assert.ok(site.contains(p.position));
});

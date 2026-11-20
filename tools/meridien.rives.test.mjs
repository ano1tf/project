import {
  DOCKS,
  beginRide,
  finishRide,
  departures,
  launchAt,
  ridePose,
  restoreTransit,
  scheduled,
} from "../game/meridien/js/sondes.mjs";
import { passageEvent, passagePhase } from "../game/meridien/js/passage.mjs";
import {
  controlSheet,
  inspectJoint,
  shiftPhase,
  shorePeople,
  nextBench,
  workshopStatus,
} from "../game/meridien/js/littoral.mjs";
import { gameMinute } from "../game/meridien/js/accounts.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  createTopology,
  PORT_BOUNDS,
  PORT_SECTOR,
  WORLD,
} from "../game/meridien/js/sectors.mjs";
import {
  GREVES_BAY,
  GREVES_BRIDGE,
  RIVE,
} from "../game/meridien/js/rive-layout.mjs";
import {
  Solids,
  carBlocked,
  navRoute,
  onRoad,
} from "../game/meridien/js/core.mjs";
import { DELIVERY_BAYS, VEHICLES } from "../game/meridien/js/data.mjs";
import { WorldRoutes } from "../game/meridien/js/navigation.mjs";
import {
  freshProgress,
  validateProgress,
  LEGACY_SAVE_KEY,
  SAVE_KEY,
  readSave,
  readSlot,
  writeSave,
} from "../game/meridien/js/progress.mjs";
import {
  advancePort,
  cancelFreight,
  handleFreight,
  signFreight,
} from "../game/meridien/js/port.mjs";
import { parseKreoAsset } from "../editor/atelier/asset-format.mjs";

test("A bank has its original extent; the new domain connects dry land only along the deck", () => {
  const old = createTopology([PORT_SECTOR]);
  assert.deepEqual(old.extent, PORT_BOUNDS);
  const mid = { x: -216, z: 126 };
  assert.equal(old.at(mid.x, mid.z), null);
  assert.equal(WORLD.at(mid.x, mid.z).id, GREVES_BRIDGE.id);
  assert.equal(WORLD.at(GREVES_BAY.x, GREVES_BAY.z).id, RIVE.id);
  const solids = new Solids();
  for (const x of [-248, -243, -216, -187, -182]) {
    assert.equal(
      carBlocked(solids, x, 123.66, -Math.PI / 2, VEHICLES.estuaire),
      false,
    );
    assert.equal(onRoad(x, 123.66), true);
  }
  assert.equal(solids.blocked(-216, 117), true);
  assert.equal(onRoad(-216, 101), false);
  const [a, b] = GREVES_BRIDGE.walk;
  assert.equal(WORLD.segment(a, b, 0.42), true);
  assert.equal(WORLD.segment({ ...a, z: 105 }, { ...b, z: 107 }, 0.42), false);
  assert.equal(
    WORLD.segment({ x: -187, z: 130 }, { x: -189, z: 142 }, 0.42),
    false,
  );
});

test("Cross-bank routes use the marked lanes and direct footfall through the join", () => {
  const a = GREVES_BRIDGE.drive[0],
    b = GREVES_BAY;
  for (const [s, t, z] of [
    [a, b, 123.66],
    [b, a, 128.34],
  ]) {
    const path = navRoute(s, t);
    assert.deepEqual(path[0], s);
    assert.deepEqual(path.at(-1), t);
    for (const [i, p] of path.slice(1).entries())
      assert.ok(WORLD.segment(path[i], p, 0.35));
    assert.ok(
      path.some((p) => p.x < -189 && p.x > -254 && Math.abs(p.z - z) < 0.01),
    );
  }
  const routes = new WorldRoutes(new Solids());
  const start = { x: -168, z: 140 },
    end = { x: -284, z: 110 };
  const path = routes.route(start, end);
  assert.deepEqual(path.at(-1), end);
  assert.ok(path.some((p) => p === GREVES_BRIDGE.walk[0]));
  for (const [i, p] of path.slice(1).entries())
    assert.ok(WORLD.segment(path[i], p, 0.42));
});

test("A loaded Grèves carnet preserves exact deck pose, designated car, deadline and delivery", () => {
  let p = freshProgress();
  const old = { ...p.position };
  assert.deepEqual(validateProgress(p).position, old);
  assert.ok(signFreight(p, "greves", "mistral", 2));
  assert.ok(handleFreight(p, "load", "mistral"));
  p.activeVehicle = "mistral";
  p.position = { x: -216.42, z: 123.74, heading: 4.74 };
  p.vehicles.mistral = { ...p.position, damage: 0.23 };
  p.waypoint = { ...GREVES_BAY };
  const save = p;
  p = validateProgress(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(p.position, save.position);
  assert.deepEqual(p.vehicles, save.vehicles);
  assert.deepEqual(p.port.job, save.port.job);
  assert.equal(p.activeVehicle, "mistral");
  assert.equal(p.port.depot.greves, 8);
  assert.equal(p.waypoint.x, GREVES_BAY.x);
  assert.equal(DELIVERY_BAYS.grevesFreight, GREVES_BAY);
  const prior = p.port.clients.greves.stock;
  assert.ok(handleFreight(p, "drop", "mistral"));
  assert.equal(p.port.clients.greves.stock, prior + 2);
  assert.equal(p.cash, 374);
  assert.equal(p.port.clients.greves.deliveries, 1);
  assert.equal(p.port.clients.greves.trust, 1);
  assert.equal(handleFreight(p, "drop", "mistral"), false);
  assert.equal(p.ledger.filter((r) => r.kind === "freight").length, 1);
});

test("Far-bank stock follows the common schedule, independent of Noa’s location", () => {
  const a = freshProgress(),
    b = freshProgress();
  b.position = { x: GREVES_BAY.x, z: GREVES_BAY.z, heading: 2 };
  for (const p of [a, b]) {
    p.time = 360;
    for (const n of [393, 478, 637, 1095, 1300, 3, 393]) {
      const prev = p.time;
      p.time = n;
      advancePort(p, prev, n);
    }
  }
  assert.deepEqual(a.port, b.port);
  assert.equal(a.port.day, 1);
  assert.equal(a.cash, 240);
});

test("The Grèves bench and rack are an editable bounded Atelier sample", async () => {
  const data = await readFile(
    new URL(
      "../editor/atelier/exemples/atelier-des-greves.kreo-asset.json",
      import.meta.url,
    ),
    "utf8",
  );
  const { asset } = parseKreoAsset(data);
  for (const id of ["bench", "rack", "locker"])
    assert.ok(asset.objects.find((o) => o.id === id && o.type === "group"));
});

test("Shift changes are absolute; an inspection cannot spend a signed bill or pay twice", () => {
  const p = freshProgress();
  p.time = 704.95;
  assert.equal(shiftPhase(p.time), "bench");
  assert.ok(shorePeople(p.time).find((r) => r.id === "mina")?.z < 115);
  p.time = 705;
  assert.equal(workshopStatus(p), "closed");
  assert.ok(shorePeople(p.time + 9).find((r) => r.id === "mina")?.z > 115);
  assert.equal(nextBench(gameMinute(p)), 840);
  p.time = 840;
  p.port.clients.greves.funds = 167;
  assert.ok(signFreight(p, "greves", "mistral", 2));
  assert.deepEqual(inspectJoint(p, 0), { status: "wrong", measured: 2381 });
  assert.equal(inspectJoint(p, 1).status, "funds");
  assert.equal(p.cash, 240);
  assert.ok(cancelFreight(p));
  assert.equal(inspectJoint(p, 1).status, "paid");
  const q = validateProgress(JSON.parse(JSON.stringify(p)));
  assert.equal(q.cash, 302);
  assert.equal(q.ledger[0].kind, "inspection");
  assert.equal(inspectJoint(q, 1).status, "done");
  assert.equal(nextBench(23 * 60), 1440 + 450);
  for (let day = 0; day < 6; day++) {
    const s = controlSheet(day);
    assert.equal(
      s.readings.filter((r) => Math.abs(r - s.zero - s.nominal) <= s.tolerance)
        .length,
      1,
    );
  }
});

test("Cancelling back to an older build does not overwrite an extended or damaged carnet", () => {
  const m = new Map();
  const io = {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
  };
  const p = freshProgress(),
    at = { x: -219.45, z: 131.5, heading: 3.25 };
  const legacy = JSON.stringify({ ...p, version: 1 });
  m.set(LEGACY_SAVE_KEY, legacy);
  assert.deepEqual(readSave(io).position, p.position);
  p.position = at;
  assert.equal(writeSave(io, p), true);
  assert.equal(m.get(LEGACY_SAVE_KEY), legacy);
  assert.deepEqual(readSave(io).position, at);
  m.set(
    LEGACY_SAVE_KEY,
    JSON.stringify({
      ...p,
      position: { x: -186, z: 131, heading: 3 },
      version: 1,
    }),
  );
  assert.deepEqual(readSave(io).position, at);
  m.set(SAVE_KEY, "{partial");
  assert.equal(readSlot(io).status, "invalid");
  assert.equal(writeSave(io, p), false);
  assert.equal(m.get(SAVE_KEY), "{partial");
});

test("Sondes: six boarding minutes, a fixed timetable and overnight recovery", () => {
  assert.equal(scheduled("port", 440), true);
  assert.equal(scheduled("port", 441), false);
  assert.deepEqual(departures("port", 434), {
    next: 440,
    prior: null,
    open: true,
    opens: 434,
    arrives: 452,
  });
  assert.equal(departures("port", 441).next, 500);
  assert.equal(departures("port", 441).open, false);
  assert.equal(departures("greves", 1245).next, 1440 + 464);
  const p = freshProgress();
  p.time = 440;
  assert.equal(beginRide(p, "port", 440), true);
  assert.equal(beginRide(p, "port", 440), false);
  assert.equal(p.cash, 232);
  p.time = 446;
  const moving = ridePose(p);
  assert.deepEqual(moving, launchAt(p.time));
  assert.equal(WORLD.at(moving.x, moving.z), null);
  p.position = moving;
  const q = validateProgress(p);
  assert.equal(q.position.x, DOCKS.port.x);
  assert.deepEqual(ridePose(q), moving);
  assert.equal(q.ledger.filter((r) => r.kind === "ferry").length, 1);
  assert.equal(finishRide(q), null);
  q.time = 452;
  assert.equal(finishRide(q).departure, 440);
  assert.equal(finishRide(q), null);
  assert.equal(q.transit.last.from, "port");
  assert.deepEqual(
    restoreTransit(
      { ride: { from: "port", departure: 441, fare: 8 } },
      442,
      false,
    ),
    { ride: null, last: null },
  );
});

for (const [echoCase, end, record] of [
  ["archive", "publish", "bulletin"],
  ["seal", "protect", "families"],
]) {
  test(`Existing ${echoCase} outcome persists through corroboration and ${record} filing`, () => {
    let p = freshProgress();
    Object.assign(p, {
      stage: "done",
      ending: end,
      echo: {
        accepted: true,
        watch: true,
        badge: true,
        tuned: true,
        outcome: echoCase,
      },
    });
    p.time = 441;
    assert.equal(passagePhase(p), "lead");
    assert.equal(passageEvent(p, "accept"), true);
    assert.equal(passageEvent(p, "file", record), false);
    assert.equal(passageEvent(p, "match", "greves"), false);
    assert.equal(beginRide(p, "port", 440), false);
    p.time = 494;
    assert.equal(beginRide(p, "port", 500), true);
    assert.equal(p.transit.ride.fare, 0);
    p.time = 512;
    const ride = finishRide(p);
    assert.equal(passageEvent(p, "sample", ride), true);
    assert.equal(passageEvent(p, "match", "nord"), false);
    assert.equal(passageEvent(p, "match", "greves"), true);
    p = validateProgress(p);
    assert.equal(passagePhase(p), "file");
    assert.equal(passageEvent(p, "file", record), true);
    assert.equal(passageEvent(p, "file", record), false);
    const closed = validateProgress(p);
    assert.equal(closed.passage.outcome, record);
    assert.equal(closed.echo.outcome, echoCase);
    assert.equal(closed.ending, end);
    assert.equal(closed.ledger.filter((r) => r.kind === "passage").length, 1);
    assert.equal(closed.cash, 410);
  });
}

test("An expired load at the Grèves cannot be paid after a v2 resume", () => {
  let p = freshProgress();
  p.time = 1360.8;
  assert.ok(signFreight(p, "greves", "mistral", 2));
  assert.ok(handleFreight(p, "load", "mistral"));
  const due = p.port.job.due;
  p.position = { x: -218.4, z: 123.66, heading: -Math.PI / 2 };
  p.vehicles.mistral = { ...p.position, damage: 0.09 };
  p.activeVehicle = "mistral";
  p = validateProgress(p);
  assert.equal(p.port.job.due, due);
  assert.equal(handleFreight(p, "drop", "estuaire"), false);
  const prior = p.time;
  p.time = due % 1440;
  assert.equal(advancePort(p, prior, p.time), true);
  assert.equal(p.port.job, null);
  assert.equal(p.port.lost, 1);
  assert.equal(p.port.clients.greves.trust, -1);
  assert.equal(handleFreight(p, "drop", "mistral"), false);
  assert.equal(p.ledger.length, 0);
});

test("Waiting through a day boundary and ticking minute by minute yield identical accounts", () => {
  const skipped = freshProgress(),
    walked = freshProgress();
  const from = 1129,
    to = 1440 + 444;
  for (const p of [skipped, walked]) {
    p.time = from;
    Object.assign(p.port.venture, { owned: true, enabled: true, reserve: 160 });
  }
  skipped.time = to % 1440;
  advancePort(skipped, from, skipped.time);
  for (let at = from + 1; at <= to; at++) {
    const before = walked.time;
    walked.time = at % 1440;
    advancePort(walked, before, walked.time);
  }
  assert.deepEqual(skipped.port, walked.port);
  assert.equal(walked.port.venture.trips, 1);
  assert.deepEqual(skipped.ledger, walked.ledger);
  assert.equal(skipped.cash, walked.cash);
});

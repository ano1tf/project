// Serve the repo on :8000; uses the same optional Playwright setup as meridien.browser.mjs.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  freshProgress,
  SAVE_KEY,
  LEGACY_SAVE_KEY,
  PREF_KEY,
} from "../game/meridien/js/progress.mjs";
import { DELIVERY_BAYS, PLACES } from "../game/meridien/js/data.mjs";
import {
  DOCKS,
  RIDE_MINUTES,
  departures,
  ridePose,
} from "../game/meridien/js/sondes.mjs";
import { WORLD } from "../game/meridien/js/sectors.mjs";
import { COMPTOIR } from "../game/meridien/js/port-layout.mjs";
import {
  GREVES_BAY,
  GREVES_BRIDGE,
  GREVES_WORKSHOP,
  MINA_BOARD,
} from "../game/meridien/js/rive-layout.mjs";
import {
  CLIENTS,
  handleFreight,
  signFreight,
} from "../game/meridien/js/port.mjs";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
    : "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args: process.env.WEBGL_SOFTWARE
    ? [
        "--disable-dev-shm-usage",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ]
    : [],
});
const url = process.env.MERIDIEN_URL || "http://localhost:8000/game/meridien/";
const errors = [];
const b = (page, name) => page.getByRole("button", { name, exact: true });
const modal = (page, name) => page.getByRole("dialog", { name, exact: true });
const press = (page, key) => page.keyboard.press(key);
const close = (page) => page.locator("#close-panel").click();
const edit = (page) => page.locator("#play-screen #viewport canvas");
async function prepare(page, seed, damaged = false, wallClock = false) {
  page.on("pageerror", (e) => errors.push(e.stack));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.route("**/js/main.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()).replace(
          "game.prepare();",
          `window.firstPose={ x:game.hero.x,z:game.hero.z,time:game.progress.time,ride:game.progress.transit.ride }; game.prepare();`,
        ) + "\nwindow.gameForTest=()=>game;",
    });
  });
  // Timing of a Playwright click (and CPU loading SVG or 3D) must not shift
  // cross traffic. The path drivers still call the real 60 Hz physics step.
  // The tactile pause test opts into the actual RAF clock.
  if (!wallClock)
    await page.route("**/js/game.js", async (route) => {
      const response = await route.fetch();
      const src = await response.text();
      assert.ok(src.includes("this.step(STEP);"));
      await route.fulfill({
        response,
        body: src.replace(
          "this.step(STEP);",
          "void 0; /* manual test steps, real render loop */",
        ),
      });
    });
  await page.addInitScript(
    ({ seed, damaged, LEGACY_SAVE_KEY, PREF_KEY }) => {
      if (sessionStorage.getItem("port-test-seeded")) return;
      localStorage.setItem(LEGACY_SAVE_KEY, seed);
      localStorage.setItem(
        PREF_KEY,
        JSON.stringify({ quality: "plan", sound: false, weather: "clear" }),
      );
      if (damaged)
        localStorage.setItem(
          `${LEGACY_SAVE_KEY}:carnet-3`,
          "{Carnet interrompu",
        );
      sessionStorage.setItem("port-test-seeded", "1");
    },
    {
      seed: JSON.stringify({ ...seed, version: 1 }),
      damaged,
      LEGACY_SAVE_KEY,
      PREF_KEY,
    },
  );
  await page.goto(url);
}
async function start(page, label = "REPRENDRE LA PARTIE") {
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches))
    await b(page, label).tap();
  else await b(page, label).click();
  await edit(page).waitFor({ timeout: 65_000 });
}
const state = (page) =>
  page.evaluate(() => {
    const g = window.gameForTest(),
      p = g.progress,
      h = g.hero;
    return {
      cash: p.cash,
      ending: p.ending,
      stage: p.stage,
      port: p.port,
      time: p.time,
      ledger: p.ledger,
      x: h.x,
      z: h.z,
      car: h.car?.id ?? null,
      speed: h.car?.speed ?? 0,
      target: g.target(),
      action: g.action()?.type,
      alert: g.life.alert.level,
      mode: g.mode,
      slot: g.slot,
      covered: g.world.isRoofed(h),
      shutter: g.world.portSite.door.enabled,
      workshop: p.workshop,
      passage: p.passage,
      transit: p.transit,
      echo: p.echo,
    };
  });
async function act(page) {
  await page.locator("#viewport").focus();
  await press(page, "e");
}
async function app(page, name) {
  if (!(await page.locator("#overlay").isVisible()))
    await page.locator("#open-phone").click();
  await modal(page, "LA TRAVERSE").waitFor();
  await b(page, "Applications").click();
  await b(page, name).click();
}

async function checkFreightHandset(page) {
  const screen = modal(page, "LA TRAVERSE"),
    { port, time } = await state(page);
  const timeLabel = [Math.floor(time / 60), Math.floor(time % 60)]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  await screen.getByRole("heading", { name: CLIENTS.market.name }).waitFor();
  assert.equal(await screen.locator("#phone-time").innerText(), timeLabel);
  assert.deepEqual(
    await screen.locator(".port-stats b").allTextContents(),
    [port.depot.market, port.depot.garage, port.completed].map(String),
  );
  assert.deepEqual(await screen.locator(".phone-tab").allTextContents(), [
    "Messages",
    "Contacts",
    "Journal",
    "Sac",
  ]);
  const layout = await screen.evaluate((el) => {
    const find = (selector) => el.querySelector(selector);
    const style = (selector) => getComputedStyle(find(selector));
    const rect = (selector) => find(selector).getBoundingClientRect();
    const shell = el.getBoundingClientRect();
    const center = (r) => r.left + r.width / 2;
    const body = find("#panel-body");
    return {
      radius: parseFloat(getComputedStyle(el).borderTopLeftRadius),
      nativeFont:
        getComputedStyle(el).fontFamily.includes("BlinkMacSystemFont"),
      focusedTitle: document.activeElement === find("#panel-title"),
      centeredChrome: [".phone-island", "#phone-home"].every((selector) => {
        const r = rect(selector);
        return (
          r.height > 0 &&
          r.top >= shell.top &&
          r.bottom <= shell.bottom &&
          Math.abs(center(r) - center(shell)) < 1
        );
      }),
      statsOrder: rect(".port-stats b").bottom < rect(".port-stats small").top,
      statsBorder: style(".port-stats > div").borderTopWidth,
      statsRadius: style(".port-stats > div").borderTopLeftRadius,
      mainIsLarger:
        rect(".freight-follow").width > rect(".freight-cancel").width,
      cancelBackground: style(".freight-cancel").backgroundColor,
      hasHorizontalScroll: body.scrollWidth > body.clientWidth,
    };
  });
  assert.ok(layout.radius >= 40);
  assert.equal(layout.nativeFont, true);
  assert.equal(layout.focusedTitle, true);
  assert.equal(layout.centeredChrome, true);
  assert.equal(layout.statsOrder, true);
  assert.equal(layout.statsBorder, "0px");
  assert.equal(layout.statsRadius, "12px");
  assert.equal(layout.mainIsLarger, true);
  assert.equal(layout.cancelBackground, "rgba(0, 0, 0, 0)");
  assert.equal(layout.hasHorizontalScroll, false);
}

async function swipeFreight(page) {
  const body = page.locator("#panel-body");
  const home = page.locator("#phone-home"),
    status = page.locator("#phone-status");
  const before = await home.boundingBox(),
    top = await status.boundingBox();
  const r = await body.boundingBox();
  const x = Math.round(r.x + r.width / 2),
    y = Math.round(r.y + r.height * 0.86);
  const session = await page.context().newCDPSession(page);
  const touch = (type, offset = 0) =>
    session.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y: y - offset }],
    });
  try {
    await touch("touchStart");
    for (let offset = 18; offset <= 144; offset += 18)
      await touch("touchMove", offset);
    await touch("touchEnd");
    await page.waitForFunction(
      () => document.querySelector("#panel-body").scrollTop > 20,
    );
    assert.deepEqual(await home.boundingBox(), before);
    assert.deepEqual(await status.boundingBox(), top);
  } finally {
    await session.detach();
  }
}

// Movement uses real collisions, acceleration, fixed steps and interaction input.
// Checkpoint coordinates below are steering waypoints, not writes to a car's pose.
async function walk(page, point, action = null) {
  const result = await page.evaluate(
    ({ point, action }) => {
      const g = window.gameForTest(),
        h = g.hero;
      const matches = () => {
        const a = g.action();
        return (
          a?.type === action &&
          (action !== "enter" ||
            Math.hypot(a.car.x - point.x, a.car.z - point.z) < 0.25)
        );
      };
      if (action && matches()) return { reached: action };
      const path = g.route({ point });
      let ticks = 0;
      for (const [i, p] of path.slice(1).entries()) {
        const last = i === path.length - 2;
        for (let k = 0; k < 5500; k++) {
          const d = Math.hypot(p.x - h.x, p.z - h.z);
          if (d < 0.29 || (last && action && matches())) break;
          g.yaw = Math.atan2(p.x - h.x, h.z - p.z);
          g.footIntent = null;
          g.setInput({ forward: true, walk: d < 1.8 });
          g.step(1 / 60);
          ticks++;
          if (k === 5499) {
            g.setInput({});
            return { fail: "blocked", path, p, x: h.x, z: h.z };
          }
        }
      }
      g.setInput({});
      g.uiAt = -1;
      g.cameraCut = true;
      return {
        reached: matches() ? action : null,
        ticks,
        x: h.x,
        z: h.z,
        distance: Math.hypot(point.x - h.x, point.z - h.z),
        path,
      };
    },
    { point, action },
  );
  assert.ok(
    !result.fail &&
      (action ? result.reached === action : result.distance < 0.6),
    JSON.stringify(result),
  );
  return result;
}

async function drive(page, path, opts = {}) {
  const result = await page.evaluate(
    ({ path, opts }) => {
      const g = window.gameForTest(),
        c = g.hero.car;
      if (!c) return { fail: "not driving" };
      const turn = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
      const report = () => ({
        x: c.x,
        z: c.z,
        speed: c.speed,
        yaw: c.heading,
        damage: c.damage,
        action: g.action()?.type,
        alert: g.life.alert.level,
        time: g.progress.time,
      });
      let steps = 0;
      for (const [n, [x, z]] of path.entries()) {
        const last = n === path.length - 1;
        for (let j = 0; j < 6500; j++) {
          const d = Math.hypot(x - c.x, z - c.z);
          if (
            last && opts.approach
              ? g.action()?.type === "freight-stop"
              : d < (last ? 1.65 : 2.55)
          )
            break;
          const speed = Math.abs(c.speed);
          const delta = turn(c.heading, Math.atan2(x - c.x, c.z - z));
          const error = delta - (c.yawRate || 0) * 0.16;
          let cap =
            Math.abs(delta) > 0.64 ? 4.2 : Math.abs(delta) > 0.33 ? 5.9 : 10.8;
          if (last) cap = Math.min(cap, opts.approach ? 4.7 : Math.sqrt(d * 6));
          const f = Math.sin(c.heading),
            nz = -Math.cos(c.heading);
          const hazard = (p, range, wide) => {
            if (p === c) return false;
            const dx = p.x - c.x,
              dz = p.z - c.z;
            const ahead = dx * f + dz * nz;
            return (
              ahead > 0.09 && ahead < range && Math.abs(dx * nz - dz * f) < wide
            );
          };
          const braking = (speed * speed) / 14;
          const halt =
            g.life.allCars().some((p) => hazard(p, 4.4 + braking, 2.1)) ||
            g.life.people.some((p) => hazard(p, 2.85 + braking, 1.18));
          g.setInput({
            forward: !halt && speed < cap,
            handbrake: halt || speed > cap + 0.65,
            left: error < -0.075,
            right: error > 0.075,
          });
          g.step(1 / 60);
          steps++;
          if (j === 6499 || g.hero.car !== c || g.life.alert.level) {
            g.setInput({});
            return {
              fail: "route stopped",
              n,
              goal: [x, z],
              steps,
              ...report(),
            };
          }
        }
      }
      g.setInput(opts.approach ? {} : { handbrake: true });
      if (!opts.approach)
        for (let i = 0; i < 85 && Math.abs(c.speed) > 0.035; i++)
          g.step(1 / 60);
      g.setInput({});
      g.uiAt = -1;
      return { steps, ...report() };
    },
    { path, opts },
  );
  assert.ok(!result.fail, JSON.stringify(result));
  return result;
}
async function brake(page) {
  await page.evaluate(() => {
    const g = window.gameForTest();
    g.setInput({ handbrake: true });
    for (let i = 0; i < 65; i++) g.step(1 / 60);
    g.setInput({});
  });
}

async function legacyRoute() {
  const p = await browser.newPage({
    viewport: { width: 1090, height: 750 },
    reducedMotion: "reduce",
  });
  try {
    const requests = [];
    p.on("request", (r) => {
      if (r.url().endsWith("comptoir-12.kreo-asset.json"))
        requests.push(r.url());
    });
    const seed = freshProgress();
    delete seed.port;
    delete seed.ledger;
    Object.assign(seed, {
      stage: "done",
      ending: "protect",
      cash: 480,
      time: 1014,
    });
    await prepare(p, seed);
    await start(p);
    assert.equal((await state(p)).ending, "protect");
    await app(p, "Fret");
    const time = (await state(p)).time;
    await p
      .locator(".port-offer")
      .filter({ hasText: CLIENTS.market.name })
      .getByRole("button", { name: /Signer/ })
      .click();
    assert.equal(
      (await state(p)).time,
      time,
      "the phone freezes the running clock",
    );
    assert.equal((await state(p)).port.job.stage, "collect");
    await checkFreightHandset(p);
    await press(p, "Escape");
    await modal(p, "LA TRAVERSE").waitFor({ state: "hidden" });
    assert.equal(await p.evaluate(() => document.activeElement.id), "viewport");
    await press(p, "Tab");
    await modal(p, "LA TRAVERSE").waitFor();
    await b(p, "Suivre le fret").click();
    await modal(p, "LA TRAVERSE").waitFor({ state: "hidden" });
    assert.equal(await p.evaluate(() => document.activeElement.id), "viewport");
    let s = await state(p);
    assert.match(s.target.title, /Mistral/);
    await walk(p, s.target.point, "enter");
    await act(p);
    s = await state(p);
    assert.equal(s.car, "mistral");
    assert.deepEqual(s.target.point, DELIVERY_BAYS.depot);
    // Straight north along the edge of the waterfront boulevard.
    const rolling = await drive(p, [[-159.4, -105.5]], { approach: true });
    assert.equal(rolling.action, "freight-stop");
    assert.ok(rolling.speed > 1.05);
    await act(p);
    assert.equal((await state(p)).port.job.stage, "collect");
    await brake(p);
    assert.equal((await state(p)).action, "freight-load");
    await act(p);
    s = await state(p);
    assert.equal(s.port.job.stage, "loaded");
    assert.equal(s.port.depot.market, 15); // 13 at start + 4 from La Lanterne − 2 loaded
    assert.deepEqual(s.target.point, DELIVERY_BAYS.relay);
    await app(p, "Fret");
    assert.match(await p.locator(".freight-ticket").innerText(), /En soute/);
    assert.equal(await b(p, "Annuler la réservation").count(), 0);
    assert.ok(await b(p, "Localiser la baie de retour").isVisible());
    await close(p);
    await act(p);
    await modal(p, "Restituer les caisses ?").waitFor();
    await b(p, "Garder le chargement").click();
    assert.equal((await state(p)).port.job.stage, "loaded");
    await p.reload();
    await start(p);
    s = await state(p);
    assert.equal(s.car, "mistral");
    assert.equal(s.port.job.stage, "loaded");
    assert.equal(s.port.depot.market, 15);
    console.log(
      "✓ Réservation en Plan, arrivée réelle, refus en roulant, chargement et reprise à la portière",
    );

    const drop = await drive(p, [
      [-159.3, -132.7],
      [-158, -138.6],
      [-154.6, -140],
      [-22, -140],
      [-17, -138.1],
      [-14.35, -133.6],
      [-14.35, 45.0],
      [-12.8, 50.8],
      [-8, 52.72],
      [94, 52.72],
    ]);
    assert.equal(drop.action, "freight-drop", JSON.stringify(drop));
    await act(p);
    s = await state(p);
    assert.equal(s.cash, 602);
    assert.equal(s.port.completed, 1);
    assert.equal(s.port.clients.market.trust, 1);
    assert.equal(s.port.job, null);
    await app(p, "Banque");
    assert.match(
      await p.locator(".phone-content").innerText(),
      /122 € · Règlement de fret/,
    );
    await close(p);
    console.log(
      "✓ Trajet routier jusqu’aux Verrières, remise unique, fonds et confiance inscrits au relevé",
    );

    const parking = await drive(p, [
      [125, 52.72],
      [131.4, 53.8],
      [133.66, 59],
      [133.66, 119.5],
      [132.3, 124.4],
      [128.1, 128.9],
      [118.4, 130.6],
      [-170.8, 130.6],
    ]);
    assert.equal(parking.action, "exit");
    await act(p);
    assert.equal((await state(p)).car, null);
    await app(p, "Immobilier");
    await b(p, "Localiser le Comptoir").click();
    assert.equal((await state(p)).target.title, "Comptoir 12");
    await walk(p, PLACES.comptoir, "port-property");
    assert.equal((await state(p)).shutter, true);
    const closed = await p.evaluate((x) => {
      const g = window.gameForTest();
      return g.world.solids.trace(x, 1.16, 124.3, x, 1.16, 120.8);
    }, COMPTOIR.door.x);
    assert.ok(closed < 0.85);
    await act(p);
    await modal(p, "Comptoir 12").waitFor();
    await b(p, "Acquérir · 315 €").click();
    assert.equal((await state(p)).cash, 287);
    await b(p, "Reprendre").click();
    assert.equal((await state(p)).shutter, false);
    await walk(p, PLACES.comptoirDesk, "port-desk");
    assert.equal((await state(p)).covered, true);
    assert.equal(requests.length, 0, "Plan has no Atelier asset fetch");
    await act(p);
    await modal(p, "Caisse du Comptoir 12").waitFor();
    assert.ok(await p.locator("#phone-status").isHidden());
    assert.ok(await p.locator("#phone-home").isHidden());
    await b(p, "Monter les rayons · 70 €").click();
    await b(p, "Déposer 65 €").click();
    await b(p, "Donner la priorité aux Halles").click();
    await b(p, "Autoriser les tournées de Jo").click();
    s = await state(p);
    assert.equal(s.cash, 152);
    assert.equal(s.port.venture.reserve, 65);
    assert.equal(s.port.venture.rack, true);
    assert.equal(s.port.venture.policy, "market");
    await b(p, "Reprendre").click();
    await app(p, "Agenda");
    assert.match(await p.locator(".phone-content").innerText(), /Créneau Jo/);
    await close(p);
    console.log(
      "✓ Accès physique, rideau bloquant puis levé, bureau couvert, achat, rayons et choix tarifaire",
    );

    await p.reload();
    await start(p);
    assert.equal(
      (await state(p)).action,
      "port-desk",
      "return to the same interior in Plan",
    );
    const shipment = await p.evaluate(() => {
      const g = window.gameForTest();
      const p = g.progress;
      for (let i = 0; i < 65_000 && !p.port.venture.order; i++) g.step(1 / 60);
      return {
        order: p.port.venture.order,
        cash: p.cash,
        reserve: p.port.venture.reserve,
      };
    });
    assert.equal(shipment.order?.id, "market", JSON.stringify(shipment));
    assert.equal(shipment.order.qty, 4);
    assert.equal(shipment.cash, 152);
    assert.equal(shipment.reserve, 13);
    await p.reload();
    await start(p);
    assert.deepEqual(
      (await state(p)).port.venture.order,
      shipment.order,
      "resume a commercial order during transit",
    );
    const end = await p.evaluate(() => {
      const g = window.gameForTest();
      for (let i = 0; i < 7500 && g.progress.port.venture.order; i++)
        g.step(1 / 60);
      g.uiAt = -1;
      return g.progress.port.venture;
    });
    assert.equal(end.order, null);
    assert.equal(end.trips, 1);
    assert.equal(end.reserve, 105);
    assert.equal(end.earned, 92);
    await p.waitForFunction(
      () => Number(document.querySelector("#open-phone").dataset.unread) > 0,
    );
    await app(p, "Actualités");
    assert.match(
      await p.locator(".phone-content").innerText(),
      /Tournée soldée/,
    );
    s = await state(p);
    assert.equal(s.port.seen, s.port.serial);
    await close(p);
    await act(p);
    await b(p, "Retirer la caisse disponible").click();
    assert.equal((await state(p)).cash, 257);
    await b(p, "Reprendre").click();
    console.log(
      "✓ Agenda, navette persistée en cours, paiement distinct, notification réelle, retrait au bureau",
    );

    // Inspect the streamed lot from the actual walked-to desk, then leave in Plan.
    await press(p, "Escape");
    await b(p, "Paramètres").click();
    await p.getByLabel("Qualité graphique").selectOption("low");
    await close(p);
    await p.waitForFunction(
      () => {
        const g = window.gameForTest();
        return g?.mode === "low" && g.world.portSite.kit?.root.visible;
      },
      null,
      { timeout: 65_000 },
    );
    const viz = await p.evaluate(() => {
      const g = window.gameForTest(),
        m = g.world.portSite.kit.nodes;
      return {
        open: !m.get("shutter").visible,
        rack: m.get("reserve").visible,
        inside: m.get("interior").visible,
      };
    });
    assert.deepEqual(viz, { open: true, rack: true, inside: true });
    assert.equal(requests.length, 1);
    await press(p, "Escape");
    await b(p, "Paramètres").click();
    await p.getByLabel("Qualité graphique").selectOption("plan");
    await close(p);
    const exterior = await walk(p, {
      x: COMPTOIR.door.x,
      z: COMPTOIR.door.z + 1.7,
    });
    assert.ok(exterior.z > COMPTOIR.z + COMPTOIR.d / 2);
    assert.equal((await state(p)).covered, false);
    console.log(
      "✓ Même lot Atelier chargé une seule fois en 3D ; sortie par la vraie porte en Plan",
    );
  } finally {
    await p.close();
  }
}

async function wrongVehicleAndAlternateBay() {
  const p = await browser.newPage({ viewport: { width: 1090, height: 750 } });
  try {
    const seed = freshProgress();
    const bay = DELIVERY_BAYS.garageFreight;
    seed.vehicles.mistral = { ...bay, damage: 0 };
    seed.vehicles.estuaire = {
      x: bay.x - 26,
      z: bay.z,
      heading: bay.heading,
      damage: 0.16,
    };
    seed.position = bay;
    seed.activeVehicle = "mistral";
    assert.ok(signFreight(seed, "garage", "estuaire", 5));
    assert.ok(handleFreight(seed, "load", "estuaire"));
    await prepare(p, seed);
    await start(p);
    let s = await state(p);
    assert.equal(s.action, "exit");
    assert.equal(s.port.job.vehicle, "estuaire");
    assert.match(s.target.title, /Estuaire/);
    await drive(p, [[bay.x + 12, bay.z]]);
    await act(p);
    assert.equal((await state(p)).cash, 240);
    s = await state(p);
    await walk(p, s.target.point, "enter");
    await act(p);
    assert.equal((await state(p)).car, "estuaire");
    const finish = await drive(p, [[bay.x, bay.z]]);
    assert.equal(finish.action, "freight-drop", JSON.stringify(finish));
    await act(p);
    s = await state(p);
    assert.equal(s.cash, 424);
    assert.equal(s.port.clients.garage.stock, 8);
    assert.equal(s.port.clients.garage.trust, 1);
    assert.equal(s.port.job, null);
    console.log(
      "✓ Véhicule incorrect refusé ; passage au véritable Estuaire, cinq caisses remises à l’autre baie",
    );
  } finally {
    await p.close();
  }
}

async function tactileSlots() {
  const p = await browser.newPage({
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const legacy = {
    version: 1,
    stage: "done",
    ending: "publish",
    cash: 555,
    time: 704,
  };
  const old3 = `${LEGACY_SAVE_KEY}:carnet-3`,
    key3 = `${SAVE_KEY}:carnet-3`,
    key2 = `${SAVE_KEY}:carnet-2`;
  const get = (key) => p.evaluate((k) => localStorage.getItem(k), key);
  try {
    await prepare(p, legacy, true);
    const choose = async (n) => {
      await p.locator("#choose-slot").tap();
      await modal(p, "Carnets de Noa").waitFor();
      await p.locator(".slot-card").nth(n).tap();
    };
    await choose(2);
    await b(p, "CARNET ILLISIBLE").tap();
    await modal(p, "Remplacer le carnet illisible ?").waitFor();
    await b(p, "Annuler").tap();
    assert.equal(await get(old3), "{Carnet interrompu");
    await choose(1);
    await start(p, "ENTRER DANS LA VILLE");
    assert.equal((await state(p)).slot, 1);
    assert.equal((await state(p)).cash, 240);
    await p.locator("#open-phone").tap();
    for (const [label, id] of [
      ["Messages", "messages"],
      ["Contacts", "contacts"],
      ["Journal", "journal"],
      ["Sac", "bag"],
    ]) {
      await b(p, label).tap();
      assert.equal(await b(p, label).getAttribute("aria-pressed"), "true");
      assert.equal(
        await p.locator(".phone-content").getAttribute("data-app"),
        id,
      );
    }
    await b(p, "Applications").tap();
    for (const [label, title] of [
      ["Carte", "Carte de Port-Lumière"],
      ["Paramètres", "Paramètres"],
    ]) {
      await b(p, label).tap();
      await modal(p, title).waitFor();
      assert.ok(await p.locator("#phone-status").isHidden());
      await b(p, "Retour aux applications").tap();
      await modal(p, "LA TRAVERSE").waitFor();
      assert.ok(await p.locator("#phone-status").isVisible());
    }
    await b(p, "Fret").tap();
    await p
      .locator(".port-offer")
      .filter({ hasText: CLIENTS.market.name })
      .getByRole("button", { name: /Signer/ })
      .tap();
    assert.equal((await state(p)).port.job.qty, 2);
    await checkFreightHandset(p);
    await swipeFreight(p);
    await b(p, "Annuler la réservation").tap();
    assert.equal((await state(p)).port.job, null);
    assert.equal(
      await p.locator("#panel-body").evaluate((el) => el.scrollTop),
      0,
    );
    await p.locator("#close-panel").tap();
    await modal(p, "LA TRAVERSE").waitFor({ state: "hidden" });
    await p.locator("#open-pause").tap();
    await b(p, "Revenir à l’écran titre").tap();
    await b(p, "SAUVEGARDER ET QUITTER").tap();
    await b(p, "REPRENDRE LA PARTIE").waitFor();
    assert.equal(await p.locator("#carnet-name").innerText(), "Carnet 2");
    assert.equal(
      await get(LEGACY_SAVE_KEY),
      JSON.stringify({ ...legacy, version: 1 }),
    );
    assert.equal(await get(old3), "{Carnet interrompu");
    const second = await get(key2);
    await choose(2);
    await b(p, "CARNET ILLISIBLE").tap();
    await b(p, "REMPLACER CE CARNET").tap();
    await edit(p).waitFor();
    assert.equal((await state(p)).slot, 2);
    assert.equal(JSON.parse(await get(key3)).stage, "contact");
    assert.equal(await get(old3), "{Carnet interrompu");
    assert.equal(
      await get(LEGACY_SAVE_KEY),
      JSON.stringify({ ...legacy, version: 1 }),
    );
    assert.equal(await get(key2), second);
    console.log(
      "✓ 320 × 568 tactile : onglets, retours, défilement, annulation, carnets séparés et ancien v1 intact",
    );
  } finally {
    await p.close();
  }
}

async function twoBanks() {
  const p = await browser.newPage({
    viewport: { width: 1090, height: 750 },
    reducedMotion: "reduce",
  });
  try {
    const requests = [];
    p.on("request", (r) => {
      if (r.url().endsWith("atelier-des-greves.kreo-asset.json"))
        requests.push(r.url());
    });
    const seed = freshProgress();
    seed.time = 9 * 60;
    seed.position = { ...DELIVERY_BAYS.depot, heading: Math.PI };
    seed.vehicles.mistral = { ...seed.position, damage: 0.14 };
    seed.activeVehicle = "mistral";
    await prepare(p, seed);
    await start(p);
    await app(p, "Fret");
    const offer = p
      .locator(".port-offer")
      .filter({ hasText: CLIENTS.greves.name });
    const saved = await state(p);
    await offer.getByRole("button", { name: /Signer · 2 caisses/ }).click();
    const signed = (await state(p)).port.job;
    assert.equal(signed.id, "greves");
    await b(p, "Suivre le fret").click();
    assert.equal((await state(p)).action, "freight-load");
    await act(p);
    assert.equal(
      (await state(p)).port.depot.greves,
      saved.port.depot.greves - 2,
    );
    assert.deepEqual((await state(p)).target.point, GREVES_BAY);
    await p.reload();
    await start(p);
    assert.equal((await state(p)).port.job.due, signed.due);
    assert.ok(
      Math.hypot(
        (await state(p)).x - DELIVERY_BAYS.depot.x,
        (await state(p)).z - DELIVERY_BAYS.depot.z,
      ) < 0.15,
    );
    const bridge = await drive(p, [
      [-157.7, -84],
      [-157.7, 110],
      [-158.5, 117.5],
      [-164.3, 124.55],
      [-174.8, 124.45],
      [-215, 123.66],
    ]);
    assert.ok(bridge.x < -210 && bridge.x > -220);
    await p.evaluate(() => window.gameForTest().save());
    await p.reload();
    await start(p);
    let s = await state(p);
    assert.ok(Math.hypot(bridge.x - s.x, bridge.z - s.z) < 0.1);
    assert.equal(s.port.job.stage, "loaded");
    assert.equal(s.port.job.due, signed.due);
    assert.equal(s.car, "mistral");
    await press(p, "m");
    await b(p, "Atelier des Grèves").waitFor();
    assert.match(
      await p.locator(".map-status").innerText(),
      /Livrer · Atelier des Grèves/,
    );
    await close(p);
    const drop = await drive(p, [
      [-247, 123.66],
      [-283, 123.66],
      [-295, 120.32],
      [GREVES_BAY.x, GREVES_BAY.z],
    ]);
    assert.equal(drop.action, "freight-drop", JSON.stringify(drop));
    await act(p);
    s = await state(p);
    assert.equal(s.cash, 240 + signed.pay);
    assert.equal(s.port.clients.greves.deliveries, 1);
    assert.equal(s.port.job, null);
    assert.equal(s.ledger.filter((row) => row.kind === "freight").length, 1);
    const bayPose = await state(p);
    await act(p); // Leave the car before taking the doorway.
    assert.equal((await state(p)).car, null);
    await walk(p, GREVES_WORKSHOP.desk);
    assert.equal((await state(p)).covered, true);
    assert.equal(
      requests.length,
      0,
      "Plan must not fetch the Atelier geometry",
    );
    await press(p, "Escape");
    await b(p, "Paramètres").click();
    await p.getByLabel("Qualité graphique").selectOption("low");
    await close(p);
    await p.waitForFunction(
      () => window.gameForTest().world.rive.kit?.root.visible,
      null,
      { timeout: 65_000 },
    );
    const world = await p.evaluate(
      () =>
        window.gameForTest().world.rive.kit.nodes.get("bench").children.length,
    );
    assert.ok(world > 0);
    assert.equal(requests.length, 1);
    await p.reload();
    await start(p);
    assert.equal((await state(p)).covered, true);
    const bridgeEnd = GREVES_BRIDGE.walk[0];
    const mid = await walk(p, { x: -218.4, z: bridgeEnd.z });
    assert.ok(
      mid.path.some((q) => q.x < -243 && Math.abs(q.z - bridgeEnd.z) < 0.2),
    );
    assert.equal((await state(p)).mode, "low");
    await p.evaluate(() => window.gameForTest().save());
    await p.reload();
    await start(p);
    s = await state(p);
    assert.ok(Math.hypot(s.x - mid.x, s.z - mid.z) < 0.15);
    await walk(p, bridgeEnd);
    await press(p, "Escape");
    await b(p, "Paramètres").click();
    await p.getByLabel("Qualité graphique").selectOption("plan");
    await close(p);
    assert.equal((await state(p)).covered, false);
    await walk(p, bayPose, "enter");
    await act(p);
    assert.equal((await state(p)).car, "mistral");
    // Turn in the striped apron; right-hand lane back over the bridge.
    await drive(p, [
      [-315, 120.1],
      [-321, 123.1],
      [-321, 129.8],
      [-315, 130.1],
      [-304, 128.35],
      [-248, 128.34],
      [-177, 128.34],
    ]);
    s = await state(p);
    assert.ok(s.x > -185 && s.x < -172);
    assert.equal(s.cash, 240 + signed.pay);
    console.log(
      "✓ Grèves : chargement réel, reprise en voiture sur le pont, remise unique, atelier 3D, aller-retour à pied et retour au volant",
    );
  } finally {
    await p.close();
  }
}

async function brokenKitAndWrongCar() {
  const p = await browser.newPage({
    viewport: { width: 960, height: 620 },
    reducedMotion: "reduce",
  });
  try {
    const seed = freshProgress();
    seed.time = 573;
    seed.position = {
      x: GREVES_BAY.x,
      z: GREVES_BAY.z,
      heading: GREVES_BAY.heading,
    };
    seed.vehicles.estuaire = { ...seed.position, damage: 0.02 };
    seed.vehicles.mistral = {
      x: -291.2,
      z: 120.03,
      heading: GREVES_BAY.heading,
      damage: 0,
    };
    seed.activeVehicle = "estuaire";
    assert.ok(signFreight(seed, "greves", "mistral", 2));
    assert.ok(handleFreight(seed, "load", "mistral"));
    const due = seed.port.job.due;
    await p.route("**/atelier-des-greves.kreo-asset.json", (r) =>
      r.fulfill({ contentType: "application/json", body: "{}" }),
    );
    await prepare(p, seed);
    await start(p);
    const reject = await state(p);
    assert.equal(reject.action, "exit");
    assert.equal(reject.car, "estuaire");
    assert.match(reject.target.title, /Mistral/);
    await press(p, "Escape");
    await b(p, "Paramètres").click();
    await p.getByLabel("Qualité graphique").selectOption("low");
    await close(p);
    await p.waitForFunction(
      () => window.gameForTest().world.rive.failed,
      null,
      { timeout: 35000 },
    );
    assert.equal(
      await p.evaluate(() => window.gameForTest().world.rive.fallback.visible),
      true,
    );
    await press(p, "Escape");
    await b(p, "Paramètres").click();
    await p.getByLabel("Qualité graphique").selectOption("plan");
    await close(p);
    await drive(p, [[-317.1, 120.3]]);
    await act(p);
    await walk(p, seed.vehicles.mistral, "enter");
    await act(p);
    let s = await state(p);
    assert.equal(s.car, "mistral");
    assert.equal(s.port.job.due, due);
    const drop = await drive(p, [[GREVES_BAY.x, GREVES_BAY.z]]);
    assert.equal(drop.action, "freight-drop");
    await act(p);
    s = await state(p);
    assert.equal(s.port.completed, 1);
    assert.equal(s.ledger.filter((r) => r.kind === "freight").length, 1);
    console.log(
      "✓ Vrai bordereau des Grèves : la mauvaise voiture ne livre pas, et un lot JSON illisible n’empêche pas la remise en Plan",
    );
  } finally {
    await p.close();
  }
}

async function shoreShift() {
  const p = await browser.newPage({
    viewport: { width: 320, height: 568 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  try {
    const seed = freshProgress();
    seed.time = 11 * 60 + 54;
    seed.position = {
      x: GREVES_WORKSHOP.door.x,
      z: GREVES_WORKSHOP.door.z + 0.9,
      heading: 0,
    };
    let anyAsset = false;
    await p.route("**/atelier-des-greves.kreo-asset.json", (r) => {
      anyAsset = true;
      return r.abort();
    });
    // Force the real no-WebGL fallback even if the quality preference changes.
    await p.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return kind.startsWith("webgl") ? null : get.call(this, kind, ...args);
      };
    });
    await prepare(p, seed, false, true);
    await start(p);
    const started = (await state(p)).time;
    await p.waitForFunction(
      (t) => window.gameForTest().progress.time > t + 0.03,
      started,
    );
    const initial = await p.evaluate(() =>
      window
        .gameForTest()
        .localPeople()
        .find((w) => w.id === "mina"),
    );
    assert.ok(initial.z >= 116.5);
    await walk(p, GREVES_WORKSHOP.desk, "greves-bench");
    await p.locator("#interact-button").tap();
    const panel = modal(p, "Banc de contrôle des Grèves");
    await panel.waitFor();
    assert.match(await panel.innerText(), /tour des jauges/);
    const stopped = (await state(p)).time;
    await p.waitForTimeout(250);
    assert.equal((await state(p)).time, stopped);
    await b(p, "Attendre ici jusqu’à J1 · 14:00").tap();
    assert.equal((await state(p)).time, 840);
    const inside = await p.evaluate(() =>
      window
        .gameForTest()
        .localPeople()
        .find((w) => w.id === "mina"),
    );
    assert.ok(inside.z < 115);
    const client = (await state(p)).port.clients.greves.funds;
    await b(p, "Valider A").tap();
    assert.match(await panel.getByRole("status").innerText(), /hors tolérance/);
    assert.equal((await state(p)).cash, 240);
    await b(p, "Valider B").tap();
    assert.match(await panel.innerText(), /poinçonné/);
    let s = await state(p);
    assert.equal(s.workshop.count, 1);
    assert.equal(s.cash, 302);
    assert.equal(s.port.clients.greves.funds, client - 62);
    await b(p, "Quitter le banc").tap();
    await p.reload();
    await start(p);
    assert.equal(
      (await state(p)).ledger.filter((r) => r.kind === "inspection").length,
      1,
    );
    assert.equal((await state(p)).workshop.count, 1);
    assert.equal(anyAsset, false);
    console.log(
      "✓ 320 × 568 sans WebGL : ronde, retour au banc à 14:00, correction du joint, règlement unique et reprise",
    );
  } finally {
    await p.close();
  }
}

// Step the existing simulation faster than wall time; never set the boat pose.
async function untilMinute(p, absolute) {
  await p.evaluate((absolute) => {
    const g = window.gameForTest(),
      stamp = () => g.progress.port.day * 1440 + g.progress.time;
    for (let i = 0; i < 3600 && stamp() < absolute; i++) {
      g.setInput({ forward: true, right: true });
      g.step(1 / 60);
    }
    g.setInput({});
    if (stamp() < absolute)
      throw new Error(`Chrono arrêté : ${stamp()} < ${absolute}`);
  }, absolute);
}
async function passageCase(ending, echo, outcome) {
  const p = await browser.newPage({
    viewport: { width: 1080, height: 740 },
    reducedMotion: "reduce",
  });
  const ship = "Navette des Sondes";
  try {
    const seed = freshProgress();
    seed.stage = "done";
    seed.ending = ending;
    seed.echo = {
      accepted: true,
      watch: true,
      badge: true,
      tuned: true,
      outcome: echo,
    };
    seed.position = { x: 43.68, z: 20.27, heading: -1.6 };
    seed.time = echo === "archive" ? 9 * 60 + 27 : 20 * 60 + 21;
    await prepare(p, seed);
    await start(p);
    await walk(p, PLACES.ondes, "ondes");
    await act(p);
    const invitation = modal(p, "Atelier des Ondes");
    await invitation.waitFor();
    assert.match(
      await invitation.innerText(),
      echo === "archive" ? /transcription publique/ : /bande reste sous scellé/,
    );
    await b(p, "Ouvrir le dossier de la passe").click();
    assert.equal((await state(p)).target.point.x, DOCKS.port.x);
    await walk(p, DOCKS.port, "sondes-dock");
    await act(p);
    const terminal = modal(p, ship);
    await terminal.waitFor();
    assert.match(await terminal.innerText(), /Dernier départ/);
    const before = await state(p),
      slot = departures(
        "port",
        before.port.day * 1440 + Math.floor(before.time),
      );
    if (echo === "seal") assert.equal(Math.floor(slot.next / 1440), 1);
    assert.equal(await b(p, "Embarquer · Place de relevé").count(), 0);
    await terminal.getByRole("button", { name: /Attendre jusqu’à/ }).click();
    await b(p, "Embarquer · Place de relevé").click();
    assert.equal((await state(p)).transit.ride.departure, slot.next);
    await untilMinute(p, slot.next + 5.25);
    const crossing = await state(p);
    assert.equal(WORLD.at(crossing.x, crossing.z), null);
    assert.equal(crossing.transit.ride.from, "port");
    const stored = await p.evaluate(
      ({ saveKey, prefKey, eco }) => {
        const g = window.gameForTest();
        g.pause(true);
        g.save();
        if (eco) {
          const prefs = JSON.parse(localStorage.getItem(prefKey));
          localStorage.setItem(
            prefKey,
            JSON.stringify({ ...prefs, quality: "low" }),
          );
        }
        return JSON.parse(localStorage.getItem(saveKey));
      },
      { saveKey: SAVE_KEY, prefKey: PREF_KEY, eco: echo === "archive" },
    );
    assert.equal(
      stored.position.x,
      DOCKS.port.x,
      "Only the departure bookmark is saved, not free movement in water",
    );
    await p.reload();
    await start(p);
    const resumed = await p.evaluate(() => window.firstPose),
      expected = ridePose(stored);
    assert.deepEqual(resumed.ride, stored.transit.ride);
    assert.equal(resumed.time, stored.time);
    assert.ok(
      Math.hypot(expected.x - resumed.x, expected.z - resumed.z) < 1e-6,
      JSON.stringify({ expected, resumed }),
    );
    if (echo === "archive") {
      const aligned = await p.evaluate(() => {
        const g = window.gameForTest();
        g.pause(true);
        g.presentFrame(1 / 60, performance.now());
        const r = g.world.sondes?.root;
        return (
          g.mode === "low" &&
          r?.visible &&
          Math.hypot(g.hero.x - r.position.x, g.hero.z - r.position.z) < 1e-5
        );
      });
      assert.equal(aligned, true);
      await press(p, "Escape");
      await b(p, "Paramètres").click();
      await p.getByLabel("Qualité graphique").selectOption("plan");
      await close(p);
    }
    let s = await state(p);
    if (s.transit.ride) await untilMinute(p, slot.next + RIDE_MINUTES + 0.08);
    s = await state(p);
    assert.equal(s.transit.ride, null);
    assert.equal(s.passage.sample, slot.next);
    assert.equal(s.target.point.x, MINA_BOARD.x);
    await walk(p, MINA_BOARD, "greves-log");
    await act(p);
    const log = modal(p, "Registre des Calfats");
    await log.waitFor();
    await b(p, "Darse Nord").click();
    assert.match(await log.getByRole("status").innerText(), /ne rapproche pas/);
    assert.equal((await state(p)).passage.matched, false);
    await b(p, "Passe des Grèves").click();
    assert.match(await log.innerText(), /Le remorqueur suivait la passe/);
    await close(p);
    await p.reload();
    await start(p);
    await act(p);
    await log.waitFor();
    await b(p, outcome === "bulletin" ? "Afficher" : "Confier").click();
    assert.match(
      await log.innerText(),
      outcome === "bulletin"
        ? /Affiche du quai · consultable/
        : /Pochette des familles · conservée/,
    );
    s = await state(p);
    assert.equal(s.passage.outcome, outcome);
    assert.deepEqual(s.echo, seed.echo);
    assert.equal(s.ending, ending);
    assert.equal(s.cash, 410);
    assert.equal(s.ledger.filter((r) => r.kind === "passage").length, 1);
    await close(p);
    await p.reload();
    await start(p);
    assert.equal(
      await p.evaluate(() => window.gameForTest().world.rive.record),
      outcome,
    );
    assert.equal((await state(p)).cash, 410);
    if (echo === "archive") {
      await walk(p, DOCKS.greves, "sondes-dock");
      await act(p);
      await terminal.waitFor();
      const wait = terminal.getByRole("button", { name: /Attendre jusqu’à/ });
      if (await wait.count()) await wait.click();
      await b(p, "Embarquer · 8 €").click();
      const ret = (await state(p)).transit.ride;
      assert.equal(ret.from, "greves");
      await untilMinute(p, ret.departure + RIDE_MINUTES + 0.08);
      s = await state(p);
      assert.ok(Math.hypot(s.x - DOCKS.port.x, s.z - DOCKS.port.z) < 1.3);
      assert.equal(s.cash, 402);
      assert.equal(
        s.ledger.filter((r) => r.kind === "ferry" && r.delta === -8).length,
        1,
      );
      await app(p, "Banque");
      assert.match(
        await p.locator(".phone-content").innerText(),
        /−8 € · Billet · Navette des Sondes/,
      );
    }
    console.log(
      `✓ Cahier de la passe · ${echo} : départ manqué, reprise en mer, indice recoupé, ${outcome} et conséquence persistante${echo === "archive" ? ", retour et billet débité une fois" : ""}`,
    );
  } finally {
    await p.close();
  }
}

try {
  if (
    !process.env.MERIDIEN_PORT_TEST ||
    process.env.MERIDIEN_PORT_TEST === "legacy"
  ) {
    await legacyRoute();
    await wrongVehicleAndAlternateBay();
    await tactileSlots();
  }
  if (
    !process.env.MERIDIEN_PORT_TEST ||
    process.env.MERIDIEN_PORT_TEST === "rives"
  ) {
    await twoBanks();
    await brokenKitAndWrongCar();
  }
  if (
    !process.env.MERIDIEN_PORT_TEST ||
    process.env.MERIDIEN_PORT_TEST === "littoral"
  )
    await shoreShift();
  if (
    !process.env.MERIDIEN_PORT_TEST ||
    process.env.MERIDIEN_PORT_TEST === "passage"
  ) {
    await passageCase("publish", "archive", "bulletin");
    await passageCase("protect", "seal", "families");
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

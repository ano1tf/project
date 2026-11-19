// Optional integration test. Serve the repository before running this script.
// PLAYWRIGHT_MODULE accepts an absolute path to Playwright's ESM entry point.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { DELIVERY_BAYS, PLACES, SEMAPHORE } from "../game/meridien/js/data.mjs";
import { angleDelta } from "../game/meridien/js/core.mjs";

const moduleName = process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
  : "playwright";
const { chromium } = await import(moduleName).catch((error) => {
  throw new Error(
    "Installez Playwright (et Chromium) ou renseignez PLAYWRIGHT_MODULE.",
    { cause: error },
  );
});
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
const page = await browser.newPage({ viewport: { width: 1160, height: 750 } });
page.setDefaultTimeout(30000);
const errors = [];
const audioRequests = [];
page.on("request", (req) => {
  if (/\/voice\/[^/]+[.]mp3$/.test(req.url()))
    audioRequests.push(req.url().split("/").at(-1));
});
function watch(p) {
  p.on("pageerror", (e) => errors.push(e.stack));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
}
watch(page);

// Drive the real fixed-step simulation without making Chromium render each traversed metre.
// This accessor exists only in the intercepted test response, never in the shipped game.
const expose = (p) =>
  p.route("**/js/main.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        "\nwindow.gameForTest = () => game; window.speechForTest = () => speech; window.chartForTest = (canvas) => drawChart(canvas, game, true);",
    });
  });
await expose(page);
const state = () =>
  page.evaluate(() => {
    const g = window.gameForTest(),
      h = g.hero,
      p = g.progress;
    return {
      stage: p.stage,
      ending: p.ending,
      wardrobe: p.wardrobe,
      cash: p.cash,
      coffees: p.coffees,
      bonus: p.sprintBonus,
      courier: p.courier.stage,
      runs: p.courier.runs,
      record: p.courier.best,
      mode: g.mode,
      x: h.x,
      z: h.z,
      car: h.car?.id,
      crouch: h.crouch,
      alert: g.life.alert.level,
      action: g.action()?.type,
      damage: p.vehicles.estuaire?.damage,
    };
  });
async function expectState(name, expected) {
  const now = await state();
  for (const [key, value] of Object.entries(expected))
    assert.equal(now[key], value, `${name} / ${key}`);
  return now;
}
const press = (key) => page.keyboard.press(key);
const button = (name) => page.getByRole("button", { name, exact: true });
const modal = (name) => page.getByRole("dialog", { name, exact: true });
async function act() {
  await page.locator("#viewport").focus();
  await press("e");
}
async function walk(points) {
  const blocked = await page.evaluate((path) => {
    const g = window.gameForTest(),
      h = g.hero;
    let blocked = null;
    for (const [x, z] of path) {
      for (let i = 0; i < 6600; i++) {
        const d = Math.hypot(h.x - x, h.z - z);
        if (d < 0.4) break;
        g.yaw = Math.atan2(x - h.x, h.z - z);
        g.footIntent = null; // steer toward each point rather than holding a key chord
        g.setInput({ forward: true, walk: d < 1.4 });
        g.step(1 / 60);
        if (i === 6599) blocked = { x: h.x, z: h.z, goal: [x, z] };
      }
      if (blocked) break;
    }
    g.setInput({});
    g.uiAt = -1;
    return blocked;
  }, points);
  assert.equal(blocked, null, `Arrêt imprévu : ${JSON.stringify(blocked)}`);
}
async function driveNorth(stopZ) {
  const result = await page.evaluate((zEnd) => {
    const g = window.gameForTest(),
      c = g.hero.car;
    for (let i = 0; i < 4800; i++) {
      const distance = c.z - zEnd;
      if (Math.abs(distance) < 1.4 && Math.abs(c.speed) < 3.0) break;
      const braking =
        c.speed > 1.45 &&
        distance < Math.max(1.1, (c.speed * c.speed) / 19 + 0.9);
      g.setInput(
        braking
          ? { handbrake: true }
          : {
              forward: c.speed < 10.8 && distance > 0.65,
              back: distance < -1.2,
            },
      );
      g.step(1 / 60);
    }
    g.setInput({});
    return { z: c.z, speed: c.speed };
  }, stopZ);
  assert.ok(
    Math.abs(result.z - stopZ) < 3 && Math.abs(result.speed) < 3.05,
    JSON.stringify(result),
  );
}
// Checkpoint placement is restricted to separate branches and transactions, not the chapter run.
const checkpoint = (x, z) =>
  page.evaluate(
    ([x, z]) => {
      const g = window.gameForTest(),
        h = g.hero;
      Object.assign(h, { x, z, crouch: false, air: false, linear: 0 });
      g.syncHero(0);
      g.uiAt = -1;
    },
    [x, z],
  );

// Find a real stopped traffic actor with free space at the door using the fixed-step sim.
// Keep it stopped for the keyboard/touch event, as in a traffic incident.
async function stoppedTraffic(client) {
  const fit = await client.evaluate(() => {
    const g = window.gameForTest(),
      h = g.hero,
      life = g.life;
    const start = { x: h.x, z: h.z };
    g.setInput({});
    for (let i = 0; i < 900; i++) {
      for (const c of life.traffic) {
        if (Math.abs(c.speed) > 0.025) continue;
        const f = Math.sin(c.heading),
          n = -Math.cos(c.heading);
        const blocked = life
          .allCars()
          .some(
            (v) =>
              v !== c &&
              (v.x - c.x) * f + (v.z - c.z) * n > 0 &&
              Math.hypot(v.x - c.x, v.z - c.z) < 7.2,
          );
        if (blocked) continue;
        for (const side of [-1, 1]) {
          const d = (c.spec.width * 0.5 + 0.76) * side,
            x = c.x - n * d,
            z = c.z + f * d;
          if (g.blockHero(x, z, 0.35, 0.06, 1.59)) continue;
          Object.assign(h, {
            x,
            z,
            y: 0.06,
            air: false,
            crouch: false,
            linear: 0,
          });
          const offered = g.streetAction();
          if (
            offered?.car !== c ||
            ![undefined, "greet"].includes(g.action()?.type)
          )
            continue;
          c.speed = 7;
          const fastDenied = !g.streetAct(offered);
          c.speed = 0;
          const before = life.allCars().length;
          life.incident = { car: c, end: life.time + 60, seen: true };
          g.recenter();
          g.uiAt = -1;
          return {
            id: c.trafficId,
            before,
            fastDenied,
            look: c.driver,
            occupied: c.model.driver?.parent === c.model.body,
          };
        }
      }
      Object.assign(h, start);
      g.step(1 / 60);
    }
    return null;
  });
  assert.ok(
    fit?.fastDenied && fit.occupied && fit.look,
    `Voiture arrêtée introuvable, sans conducteur, ou limite de vitesse absente : ${JSON.stringify(fit)}`,
  );
  return fit;
}

async function reticle(client) {
  const r = client.locator("#aim-reticle");
  await r.waitFor();
  return await r.evaluate((icon) => {
    const game = document.getElementById("viewport").getBoundingClientRect();
    const cross = icon.getBoundingClientRect();
    return {
      x: cross.x + cross.width * 0.5 - game.x - game.width * 0.5,
      y: cross.y + cross.height * 0.5 - game.y - game.height * 0.5,
      events: getComputedStyle(icon).pointerEvents,
    };
  });
}
async function chartPoint(client, point) {
  return await client.locator(".map-surface").evaluate((c, p) => {
    const projection = window.chartForTest(c),
      r = c.getBoundingClientRect();
    const x = projection.mx(p.x),
      y = projection.mz(p.z);
    return {
      x: r.x + c.clientLeft + x,
      y: r.y + c.clientTop + y,
      point: projection.pick(x, y, 12),
      inverse: projection.world(x, y),
    };
  }, point);
}

async function assertTouchHud(client) {
  const issues = await client.evaluate(() => {
    const items = [
      ...document.querySelectorAll(
        ".hud-right > *, .district, .objective, .radar, #speedometer, #interaction button, .touch-controls button",
      ),
    ]
      .map((el) => ({
        el,
        label: el.id || el.getAttribute("aria-label") || el.className,
        r: el.getBoundingClientRect(),
      }))
      .filter(({ r }) => r.width && r.height);
    const problems = [];
    for (const [i, { el, label, r }] of items.entries()) {
      if (
        r.left < 0 ||
        r.top < 0 ||
        r.right > innerWidth ||
        r.bottom > innerHeight
      )
        problems.push(`${label} hors écran`);
      const button = el.matches("button") ? el : el.querySelector("button");
      if (button) {
        const b = button.getBoundingClientRect();
        if (
          !button.contains(
            document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
          )
        )
          problems.push(`${label} impossible à toucher`);
      }
      for (const { label: other, r: b } of items.slice(i + 1)) {
        const overlap =
          Math.min(r.right, b.right) - Math.max(r.left, b.left) > 0.5 &&
          Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 0.5;
        if (overlap) problems.push(`${label} recouvre ${other}`);
      }
    }
    return problems;
  });
  assert.deepEqual(issues, [], "HUD tactile sans recouvrement");
}

async function checkTouchCockpit() {
  const touch = await browser.newPage({
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  watch(touch);
  await expose(touch);
  await touch.addInitScript(() =>
    localStorage.setItem(
      "meridien:settings:v1",
      JSON.stringify({ quality: "low", sound: false }),
    ),
  );
  await touch.goto(url);
  await touch.locator("#start-game").tap();
  await touch
    .locator("#viewport canvas:not(.plan-canvas)")
    .waitFor({ timeout: 45000 });
  const refresh = () =>
    touch.evaluate(() => {
      const g = window.gameForTest();
      g.hooks.update(g);
      g.presentFrame(0.04, performance.now());
    });
  await touch.evaluate(() => {
    const g = window.gameForTest(),
      c = g.life.vehicle("mistral");
    cancelAnimationFrame(g.raf);
    Object.assign(c, { x: -151.66, z: 88.5, heading: 0 });
    Object.assign(g.hero, { x: c.x - 1.76, z: c.z, linear: 0 });
    // Crowded wallet: keep all HUD controls accessible at the top alert level.
    g.life.alert.level = 3;
    g.progress.cash = 2350;
  });
  await refresh();
  const eye = touch.locator("#toggle-view");
  await eye.tap();
  assert.equal(await eye.getAttribute("aria-pressed"), "true");
  await refresh();
  await assertTouchHud(touch);
  await touch.locator("#interact-button").tap();
  await refresh();
  assert.ok(
    await touch.evaluate(() => {
      const g = window.gameForTest();
      return (
        g.hero.car?.id === "mistral" &&
        g.wasEye &&
        g.hero.car.model.cockpit.grip.visible
      );
    }),
  );
  await assertTouchHud(touch);

  const cdp = await touch.context().newCDPSession(touch),
    yaw = () => touch.evaluate(() => window.gameForTest().cabinYaw);
  const before = await yaw();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 157, y: 253 }],
  });
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 216, y: 260 }],
    });
    assert.ok(
      Math.abs((await yaw()) - before) > 0.16,
      "regard glissé dans l’habitacle",
    );
  } finally {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
  await touch.locator("#open-pause").tap();
  await touch.getByRole("dialog", { name: "Partie en pause" }).waitFor();
  await touch.close();
  console.log(
    "✓ Écran tactile 320 × 568 : commande œil, habitacle, regard glissé et HUD accessible en alerte",
  );
}

async function checkStreetAndStation() {
  // Keep this branch separate from the chapter walkthrough; use real inputs
  // after placing the actors so the station and the instruments are exercised together.
  const field = await browser.newPage({
    viewport: { width: 1080, height: 700 },
    reducedMotion: "reduce",
  });
  watch(field);
  await expose(field);
  await field.addInitScript(() => {
    const key = "meridien:settings:v1";
    if (!localStorage.getItem(key))
      localStorage.setItem(
        key,
        JSON.stringify({ quality: "low", sound: false, weather: "clear" }),
      );
  });
  const bootField = async () => {
    await field.locator("#start-game").click();
    await field.locator("#play-screen").waitFor({ timeout: 45000 });
  };
  const stopFrames = () =>
    field.evaluate(() => cancelAnimationFrame(window.gameForTest().raf));
  const paint = () =>
    field.evaluate(() => {
      const g = window.gameForTest();
      g.presentFrame(0.04, performance.now());
      g.hooks.update(g);
    });
  const fieldOptions = async () => {
    await field.locator("#open-pause").click();
    await field
      .getByRole("button", { name: "Paramètres", exact: true })
      .click();
  };
  await field.goto(url);
  await bootField();
  await stopFrames();
  const yielding = await field.evaluate(async () => {
    const g = window.gameForTest(),
      life = g.life,
      { SILLAGE_ZEBRA } = await import("./js/data.mjs"),
      { sampleRoute, stopClearance, trafficOverhang } = await import(
        "./js/core.mjs"
      );
    const report = [];
    const pc = life.people.at(-1),
      was = { ...pc },
      time = life.time;
    for (const [type, midway] of [
      ["coupe", false],
      ["sport", false],
      ["van", true],
    ]) {
      const c = life.traffic.find((car) => car.spec.type === type),
        rest = { ...c };
      const route = life.routes[0],
        line = route.stops.find(({ zebra }) =>
          midway ? zebra === SILLAGE_ZEBRA : zebra.i === 0 && zebra.j === 0,
        );
      const z = line.zebra,
        { axis } = z,
        across = axis === "z" ? "x" : "z";
      Object.assign(pc, {
        x: z.x,
        z: z.z,
        crossing: true,
        [across]: z[across] - z.span * 0.35,
      });
      life.time = axis === "z" ? 4 : 16;
      Object.assign(c, {
        route,
        s: route.length + line.s - stopClearance(c.spec.length) - 17,
        speed: 12.4,
      });
      sampleRoute(route, c.s, c);
      const side = Math.sign(c[axis] - z[axis]);
      let minFrontGap = Infinity;
      for (let i = 0; i < 245; i++) {
        life.travelCar(c, 1 / 60, [c], { x: 160, z: 140, car: null });
        minFrontGap = Math.min(
          minFrontGap,
          side * (c[axis] - z[axis]) -
            trafficOverhang(c.spec.length) -
            z.depth * 0.5,
        );
      }
      const stopped = c.speed === 0;
      const dt = 1 / 60,
        at = c.s;
      Object.assign(pc, { x: 150, z: 160, crosswalkRequest: null });
      for (let i = 0; i < 78; i++)
        life.travelCar(c, dt, [c], { x: 160, z: 140 });
      report.push({ type, stopped, minFrontGap, restarted: c.s - at });
      Object.assign(c, rest);
    }
    Object.assign(pc, was);
    life.time = time;
    return report;
  });
  for (const row of yielding) {
    assert.ok(
      row.stopped && row.minFrontGap > 0.37 && row.restarted > 1.5,
      JSON.stringify(row),
    );
  }
  console.log(
    "✓ Circulation : priorité sur toute la largeur des zébras, pare-chocs en retrait et redémarrage",
  );

  await field.locator("#viewport").focus();
  await field.keyboard.press("b");
  await paint();
  const eye = () =>
    field.evaluate(() => {
      const g = window.gameForTest(),
        h = g.hero,
        camera = g.camera;
      return {
        atHead: Math.hypot(camera.position.x - h.x, camera.position.z - h.z),
        height: camera.position.y - h.y,
        yaw: g.yaw,
        actor: h.model.root.visible,
        first: g.firstPerson,
        visible: document
          .querySelector("#toggle-view")
          .getAttribute("aria-pressed"),
      };
    });
  const standing = await eye();
  assert.ok(
    standing.first &&
      !standing.actor &&
      standing.visible === "true" &&
      standing.atHead < 1e-6,
  );
  assert.ok(standing.height > 1.51 && standing.height < 1.7);
  assert.deepEqual(await reticle(field), { x: 0, y: 0, events: "none" });
  await field.mouse.move(512, 334);
  await field.mouse.down({ button: "right" });
  await field.mouse.move(423, 350);
  await field.mouse.up({ button: "right" });
  await field.keyboard.press("c");
  await field.evaluate(() => {
    const g = window.gameForTest();
    for (let i = 0; i < 40; i++) g.syncHero(1 / 60);
  });
  await paint();
  const lowered = await eye();
  assert.ok(
    lowered.height < standing.height - 0.32 &&
      lowered.atHead < 1e-6 &&
      Math.abs(angleDelta(standing.yaw, lowered.yaw)) > 0.28,
  );
  await field.locator("#toggle-view").click();
  await paint();
  assert.equal((await eye()).first, false);
  await field.keyboard.press("b");
  await field.evaluate(() => {
    const g = window.gameForTest(),
      c = g.life.vehicle("mistral");
    Object.assign(c, { x: -151.66, z: 88.5, heading: 0 });
    Object.assign(g.hero, { x: c.x - 1.76, z: c.z, linear: 0 });
    g.syncHero(0);
  });
  await field.keyboard.press("e");
  await paint();
  const cabin = () =>
    field.evaluate(() => {
      const g = window.gameForTest(),
        car = g.hero.car;
      const m = car.model,
        local = m.body.worldToLocal(g.camera.position.clone());
      return {
        first: g.firstPerson,
        id: car.id,
        driver: m.driver.visible,
        grip: m.cockpit.grip.visible,
        tint: m.glazing.uniforms.cabinView.value,
        offset: local.distanceTo(
          local.clone().set(m.seat.x, m.seat.eyeY, m.seat.eyeZ),
        ),
        cabinYaw: g.cabinYaw,
        wheel: m.cockpit.wheel.rotation.z,
        gauge: m.cockpit.needle.rotation.z,
      };
    });
  const inside = await cabin();
  assert.ok(
    inside.first &&
      inside.id === "mistral" &&
      !inside.driver &&
      inside.grip &&
      inside.tint === 1 &&
      inside.offset < 1e-6,
  );
  await field.evaluate(() => {
    const g = window.gameForTest();
    g.orbit(3, 0.14);
    g.setInput({ forward: true, right: true });
    for (let n = 0; n < 32; n++) g.step(1 / 60);
    g.setInput({ handbrake: true });
  });
  await paint();
  const steering = await cabin();
  assert.ok(
    Math.abs(steering.wheel) > 0.27 && steering.gauge < inside.gauge - 0.22,
    JSON.stringify(steering),
  );
  assert.ok(steering.cabinYaw <= 1.62 && steering.offset < 1e-6);
  await field.keyboard.press("v");
  assert.equal((await cabin()).cabinYaw, 0);
  await field.keyboard.press("b");
  await paint();
  const outside = await cabin();
  assert.ok(
    !outside.first && outside.driver && !outside.grip && outside.tint === 0,
  );
  await field.keyboard.press("b");
  await field.evaluate(() => {
    const g = window.gameForTest();
    for (let n = 0; n < 55; n++) g.step(1 / 60);
    g.setInput({});
  });
  await field.keyboard.press("e");
  await paint();
  assert.ok((await eye()).atHead < 1e-6);
  console.log(
    "✓ Vue subjective : yeux à pied et accroupie, regard souris, entrée/sortie, volant, compteur et conducteur restauré",
  );

  const theftAt = await field.evaluate(async () => {
    const g = window.gameForTest(),
      life = g.life,
      { PLACES } = await import("./js/data.mjs");
    g.story("contact");
    g.story("arrive");
    g.story("take");
    g.takeCourier("start");
    g.setTracking("custom", PLACES.garage);
    const c = life.traffic.find((v) => v.spec.type === "van"),
      p = life.units[0];
    Object.assign(c, {
      x: -151.66,
      z: 37.8,
      heading: 0,
      speed: 0,
      damage: 0.26,
    });
    Object.assign(p, { x: c.x, z: c.z - 5.9, heading: Math.PI, speed: 0 });
    Object.assign(g.hero, { x: c.x - 1.75, z: c.z, linear: 0 });
    g.setInput({});
    return { id: c.trafficId, x: c.x, z: c.z };
  });
  await field.keyboard.press("f");
  const booked = await field.evaluate((id) => {
    const g = window.gameForTest(),
      p = g.progress;
    const inCar = g.hero.car?.id,
      was = p.courier.time;
    for (let n = 0; n < 420 && !p.custody; n++) g.step(1 / 60);
    const c = g.life.vehicle(id),
      saved = JSON.parse(localStorage.getItem("meridien:progress:v1"));
    return {
      inCar,
      holding: p.custody?.level,
      stage: p.stage,
      car: saved.activeVehicle,
      court: [c?.x, c?.z, c?.damage, c?.model.driver === null],
      time: p.courier.time,
      loss: was - p.courier.time,
      alert: g.life.alert.level,
      roof: g.world.isRoofed(g.hero),
      card: !document.querySelector("#station-transfer").hidden,
      first: g.firstPerson,
      locked: g.world.station.gate.enabled,
    };
  }, theftAt.id);
  assert.ok(booked.loss > 1.9 && booked.loss < 7.1);
  assert.deepEqual(
    { ...booked, loss: 0, time: 0 },
    {
      inCar: theftAt.id,
      holding: 2,
      stage: "belvedere",
      car: null,
      court: [theftAt.x, theftAt.z, 0.26, true],
      loss: 0,
      time: 0,
      alert: 0,
      roof: true,
      card: true,
      first: true,
      locked: true,
    },
  );
  await paint();
  assert.equal(
    await field.locator("#objective-title").innerText(),
    "Passer au guichet",
  );
  assert.equal(await field.locator("#district").innerText(), "COMMISSARIAT");
  await fieldOptions();
  await field.getByLabel("Qualité graphique").selectOption("plan");
  await field.locator("#close-panel").click();
  await paint();
  await field.locator("#toggle-view").waitFor({ state: "hidden" });
  assert.equal(await field.locator("canvas.plan-canvas").count(), 1);
  await field.reload();
  await bootField();
  await stopFrames();
  const held = await field.evaluate(async () => {
    const g = window.gameForTest(),
      h = g.hero,
      { STATION } = await import("./js/data.mjs");
    const step = (dir, count) => {
      g.setInput(dir);
      for (let n = 0; n < count; n++) g.step(1 / 60);
      g.setInput({});
    };
    step({ right: true }, 24); // align with the real gate, not a teleport
    step({ back: true }, 160);
    return {
      x: h.x,
      z: h.z,
      limit: STATION.z + STATION.gate.z,
      roof: g.world.isRoofed(h),
      mode: g.mode,
      holding: g.progress.custody?.level,
      chosen: g.prefs.view,
      time: g.progress.courier.time,
      track: g.progress.waypoint.label,
      heat: g.life.alert.level,
      complete: g.releaseCustody(),
    };
  });
  assert.ok(
    held.z < held.limit - 0.28 && held.z > held.limit - 0.74,
    JSON.stringify(held),
  );
  assert.deepEqual(
    { ...held, x: 0, z: 0, limit: 0 },
    {
      x: 0,
      z: 0,
      limit: 0,
      roof: true,
      mode: "plan",
      holding: 2,
      chosen: "first",
      time: booked.time,
      track: PLACES.garage.label,
      heat: 0,
      complete: false,
    },
  );
  await field.evaluate(async () => {
    const g = window.gameForTest(),
      h = g.hero,
      { STATION } = await import("./js/data.mjs");
    // North from the grille, then east toward the front of the desk.
    g.setInput({ forward: true });
    for (let n = 0; n < 20 && h.z > STATION.release.z; n++) g.step(1 / 60);
    g.setInput({});
  });
  await paint();
  await field
    .locator("#interact-button")
    .getByText("Terminer le contrôle")
    .waitFor();
  await field.locator("#interact-button").click();
  const released = await field.evaluate(async (id) => {
    const g = window.gameForTest(),
      p = g.progress,
      h = g.hero,
      { STATION, PLACES } = await import("./js/data.mjs");
    const path = g.walkRoutes.route(h, PLACES.station);
    const go = (nx, nz) => {
      for (let n = 0; n < 750 && Math.hypot(nx - h.x, nz - h.z) > 0.17; n++) {
        g.setInput({
          walk: true,
          left: h.x > nx + 0.089,
          right: h.x < nx - 0.089,
          forward: h.z > nz + 0.089,
          back: h.z < nz - 0.089,
        });
        g.step(1 / 60);
      }
      g.setInput({});
    };
    go(STATION.x + STATION.gate.x, STATION.z + STATION.gate.z + 1.6);
    go(STATION.x, STATION.z + STATION.gate.z + 1.6);
    go(PLACES.station.x, PLACES.station.z + 0.6);
    g.save();
    return {
      out: !g.world.isRoofed(h) && h.z > PLACES.station.z,
      gate: g.world.station.gate.enabled,
      tracked: g.target().title,
      cash: p.cash,
      time: p.courier.time,
      car: g.life.vehicle(id).id,
      path: path.length,
      chapter: p.stage,
      custody: p.custody,
    };
  }, theftAt.id);
  assert.ok(
    released.out && released.path >= 2 && released.time < held.time,
    JSON.stringify(released),
  );
  assert.deepEqual(
    { ...released, path: 0, time: 0 },
    {
      out: true,
      gate: false,
      tracked: PLACES.garage.label,
      cash: 170,
      time: 0,
      car: theftAt.id,
      path: 0,
      chapter: "belvedere",
      custody: null,
    },
  );
  await fieldOptions();
  await field.getByLabel("Qualité graphique").selectOption("low");
  await field.locator("#close-panel").click();
  await paint();
  assert.ok((await eye()).first && (await eye()).atHead < 1e-6);
  await field.reload();
  await bootField();
  assert.ok((await eye()).first);
  assert.ok(
    await field.evaluate(() => {
      const g = window.gameForTest();
      return (
        g.progress.custody === null &&
        !g.world.station.gate.enabled &&
        g.progress.cash === 170
      );
    }),
  );
  await field.locator("#open-map").click();
  const gateMark = await chartPoint(field, PLACES.station);
  assert.equal(gateMark.point.kind, "station");
  await field.close();
  console.log(
    "✓ Arrestation réelle après un vol : transfert, grille, sauvegarde en retenue, sortie à pied, carte et retour 3D",
  );
}

try {
  await page.goto(url);
  await page.locator("#game-title").waitFor();
  await page.locator("#title-controls").click();
  await modal("Commandes").waitFor();
  await press("Escape");
  await page.locator("#title-sound").click();
  assert.match(await page.locator("#title-sound").innerText(), /COUPÉ/);
  await button("ENTRER DANS LA VILLE").click();
  await page.locator("#play-screen").waitFor({ timeout: 65000 });
  const nav = await page.evaluate(() => {
    const g = window.gameForTest(),
      target = g.target(),
      path = g.route(target);
    return {
      pathLen: path.length,
      clear: path.slice(1).every((p, i) => g.walkRoutes.visible(path[i], p)),
      door: g.marker(target).sign,
      decals: g.ribbon.mesh.visible,
    };
  });
  assert.ok(nav.pathLen >= 3 && nav.clear && nav.decals);
  assert.equal(nav.door, "ENTRÉE · LE SILLAGE");
  assert.deepEqual(await reticle(page), { x: 0, y: 0, events: "none" });
  const seats = await page.evaluate(() => {
    const { life, forge } = window.gameForTest();
    const automatic = [...life.traffic, ...life.units];
    return {
      occupied: automatic.every(
        (c) => c.driver && c.model.driver?.parent === c.model.body,
      ),
      differentStyles: new Set(life.traffic.map((c) => c.driver.style)).size,
      empty: !life.vehicle("mistral").model.driver,
      liveGlass: automatic.every((c) => {
        const glass = c.model.glazing || forge.common.glass;
        return (
          glass.uniforms.cabinView.value === 0 &&
          c.model.body.getObjectByProperty("material", glass)
        );
      }),
      glazing: forge.common.glass.transparent && !forge.common.glass.depthWrite,
    };
  });
  assert.deepEqual(seats, {
    occupied: true,
    differentStyles: 5,
    empty: true,
    liveGlass: true,
    glazing: true,
  });
  await press("m");
  await modal("Carte de Port-Lumière").waitFor();
  await page.locator("#aim-reticle").waitFor({ state: "hidden" });
  const garageMark = await chartPoint(page, PLACES.garage);
  assert.equal(garageMark.point.label, PLACES.garage.label);
  const archiveMark = await chartPoint(page, PLACES.archive);
  assert.notEqual(archiveMark.point?.label, PLACES.archive.label);
  for (const coord of ["x", "z"])
    assert.ok(
      Math.abs(archiveMark.inverse[coord] - PLACES.archive[coord]) < 1e-8,
    );
  await page.mouse.click(garageMark.x, garageMark.y);
  assert.match(
    await page.locator(".map-status").textContent(),
    /REPÈRE.*Garage Estuaire/,
  );
  await page.mouse.click(archiveMark.x, archiveMark.y);
  assert.match(
    await page.locator(".map-status").textContent(),
    /Repère personnel/,
  );
  await button("Café Le Sillage").click();
  assert.match(await page.locator(".map-tools p").textContent(), /REPÈRE/);
  await button("Suivre l’histoire").click();
  await press("Escape");
  await press("Tab");
  await modal("LA TRAVERSE").waitFor();
  assert.match(
    await page.locator(".message").innerText(),
    /fréquence de ton frère/,
  );
  await button("Contacts").click();
  assert.match(await page.locator(".phone-content").innerText(), /Inès Kader/);
  await press("Escape");
  console.log(
    "✓ Démarrage WebGL, réticule centré, habitacles, repères visibles sélectionnables, commandes et téléphone",
  );

  // Measure what the synthesizer actually renders, without audio hardware.
  const foley = await page.evaluate(async () => {
    const { HarborAudio } = await import("./js/audio.js");
    const sample = async (effect, wet = 0.15, sound = true) => {
      const ctx = new OfflineAudioContext(1, 24000, 24000);
      const a = new HarborAudio({ sound });
      a.context = ctx;
      a.paused = false;
      a.canPlay = () => sound; // an offline graph is suspended until startRendering
      a.foley = ctx.createGain();
      a.foley.connect(ctx.destination);
      a.grit = ctx.createBuffer(1, 24000, 24000);
      const data = a.grit.getChannelData(0);
      let rng = 137;
      for (let i = 0; i < data.length; i++) {
        rng = (Math.imul(1664525, rng) + 1013904223) >>> 0;
        data[i] = rng / 2147483648 - 1;
      }
      const frequencies = [],
        burst = a.burst.bind(a);
      a.burst = (now, kind, hz, ...rest) => {
        frequencies.push(Math.round(hz));
        burst(now, kind, hz, ...rest);
      };
      if (effect === "door") a.door(true);
      else if (effect === "impact") a.impact(13, true);
      else a.footstep(effect, wet, 0.9);
      const pcm = (await ctx.startRendering()).getChannelData(0);
      const peak = pcm.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
      const late = pcm
        .slice(15360)
        .reduce((max, x) => Math.max(max, Math.abs(x)), 0);
      return { peak, late, frequencies };
    };
    return await Promise.all([
      sample("asphalt"),
      sample("asphalt", 0.9),
      sample("stone"),
      sample("interior", 0.9),
      sample("garden"),
      sample("door"),
      sample("impact"),
      sample("stone", 0.9, false),
    ]);
  });
  const [dry, wet, stone, inside, garden, door, hit, silent] = foley;
  for (const n of foley.slice(0, -1))
    assert.ok(n.peak > 0.025 && n.peak < 0.85, JSON.stringify(foley));
  assert.equal(wet.frequencies.length, dry.frequencies.length + 1);
  assert.equal(inside.frequencies.length, 1);
  assert.ok(stone.frequencies[0] > garden.frequencies[0]);
  assert.ok(door.late > 0.12 && hit.late < 0.00001 && silent.peak === 0);
  console.log(
    "✓ Bruitages Web Audio : quatre surfaces, pas mouillés, portière, choc et silence",
  );

  const semaphore = await page.evaluate(async (site) => {
    const g = window.gameForTest(),
      a = await g.world.semaphoreReady;
    if (!a) throw Error("Le lot de l’Atelier n’a pas été monté.");
    const head = a.nodes.get("turntable"),
      needle = a.nodes.get("needle");
    const pose = (time, light, eye = site) => {
      g.world.animateHarbor(time, eye, g.mode, light);
      return [head.rotation.y, needle.rotation.z];
    };
    const zero = pose(0, false),
      later = pose(3.25, false);
    const visible = a.root.visible;
    const reduced = pose(3.25, true);
    pose(3.25, false, { x: 130, z: -118 });
    return {
      zero,
      later,
      reduced,
      visible,
      distant: a.root.visible,
      inScene:
        a.root.parent === g.scene && a.nodes.get("arm-left").parent === head,
      material: a.nodes.get("mast").material.type,
      mode: g.mode,
      blocked: g.world.solids.blocked(site.x, site.z),
      approach: g.world.solids.blocked(site.approach.x, site.approach.z),
    };
  }, SEMAPHORE);
  assert.ok(semaphore.visible && !semaphore.distant && semaphore.inScene);
  assert.ok(semaphore.blocked && !semaphore.approach);
  assert.notEqual(semaphore.zero[0], semaphore.later[0]);
  assert.notEqual(semaphore.zero[1], semaphore.later[1]);
  assert.deepEqual(semaphore.reduced, semaphore.zero);
  assert.equal(
    semaphore.material,
    semaphore.mode === "low" ? "MeshLambertMaterial" : "MeshStandardMaterial",
  );
  await press("m");
  await modal("Carte de Port-Lumière").waitFor();
  await button(PLACES.semaphore.label).click();
  assert.match(
    await page.locator(".map-status").textContent(),
    /REPÈRE.*Sémaphore des Marées/,
  );
  await button("Suivre l’histoire").click();
  await press("Escape");
  await walk([[SEMAPHORE.approach.x, SEMAPHORE.approach.z]]);
  await expectState("marégraphe", { action: "semaphore", stage: "contact" });
  await act();
  await modal(PLACES.semaphore.label).waitFor();
  await button("Reprendre la balade").click();
  console.log(
    "✓ Sémaphore de l’Atelier : deux pivots animés, mouvement réduit, repère et lecture au Sillage",
  );

  await walk([
    [SEMAPHORE.approach.x - 0.6, 103.4],
    [-130, 95],
    [-130, 88.8],
  ]);
  const arrived = await expectState("café", {
    stage: "contact",
    action: "contact",
  });
  assert.deepEqual(audioRequests, []);
  await press("f");
  await expectState("Inès n’est pas une cible", {
    stage: "contact",
    cash: 240,
    alert: 0,
  });
  await press("b");
  await page.waitForFunction(() => window.gameForTest().wasEye);
  await act();
  await modal("Inès Kader").waitFor();
  await page.locator("#aim-reticle").waitFor({ state: "hidden" });
  await page.waitForFunction(() => {
    const g = window.gameForTest();
    return (
      g.firstPerson && g.sceneShot && !g.wasEye && g.hero.model.root.visible
    );
  });
  assert.match(
    await page.locator(".voice-status").innerText(),
    /SOUS-TITRES SEULS/,
  );
  assert.deepEqual(audioRequests, []);
  await button("Activer les voix").click();
  const takes = async () =>
    page.waitForFunction(() => {
      const s = window.speechForTest();
      return (
        s.state === "playing" && s.media.currentTime > 0.14 && !s.media.paused
      );
    });
  await takes();
  assert.deepEqual([...new Set(audioRequests)], ["sillage-01.mp3"]);
  const firstTake = await page.evaluate(() => window.speechForTest().token);
  await button("Réécouter la réplique").click();
  await takes();
  assert.ok(
    (await page.evaluate(() => window.speechForTest().token)) > firstTake,
  );
  await modal("Noa Vidal").waitFor(); // actual MP3 ended and advanced without a click
  await takes();
  assert.ok(audioRequests.includes("sillage-02.mp3"));
  await press("Escape");
  await page.waitForFunction(() => {
    const s = window.speechForTest();
    return (
      !s.active &&
      s.media.paused &&
      !s.media.hasAttribute("src") &&
      !window.gameForTest().sceneShot
    );
  });
  await expectState("scène interrompue", {
    stage: "contact",
    x: arrived.x,
    z: arrived.z,
  });
  await act();
  await modal("Inès Kader").waitFor();
  await button("Couper les voix").click();
  assert.match(
    await page.locator(".voice-status").innerText(),
    /SOUS-TITRES SEULS/,
  );
  for (let i = 0; i < 4; i++) await button("CONTINUER").click();
  await button("REPRENDRE").click();
  await expectState("contact terminé", { stage: "hangar" });
  await page.waitForFunction(() => {
    const g = window.gameForTest();
    return !g.sceneShot && g.wasEye && !g.hero.model.root.visible;
  });
  await press("b");
  await page.waitForFunction(() => !window.gameForTest().wasEye);
  console.log(
    "✓ MP3 locaux, sous-titres, répétition, enchaînement à la fin de la prise, arrêt et silence sans avancer l’histoire",
  );
  await walk([
    [-130, 94.9],
    [-157.4, 103.5],
  ]);
  await act();
  await expectState("montée", { car: "mistral" });
  await driveNorth(-80);
  await act();
  await expectState("descente", { car: undefined });
  await walk([
    [-161.1, -84.1],
    [-154, -84.1],
    [-118, -82.7],
    [-118, -93],
  ]);
  await expectState("hangar", { stage: "archive" });
  await page.locator("#viewport").focus();
  await press("c");
  await walk([
    [-118, -106],
    [-118, -116.55],
    [-112.5, -116.75],
  ]);
  await expectState("registre", {
    stage: "archive",
    crouch: true,
    action: "archive",
    alert: 0,
  });
  await act();
  await expectState("copié", { stage: "belvedere" });
  await walk([
    [-118, -116.45],
    [-118, -98],
    [-118, -83],
    [-148.9, -85.1],
    [-166.4, -85.1],
    [-173.8, -75],
    [-174.1, 11.6],
  ]);
  await expectState("belvédère", { stage: "belvedere", action: "finale" });
  await act();
  await modal("Aya Le Guen").waitFor();
  await button("Passer la scène").click();
  await modal("L’heure du choix").waitFor();
  await expectState("choix pas encore appliqué", {
    stage: "belvedere",
    cash: 240,
  });
  await button("Quitter sans choisir").click();
  await expectState("choix annulé", { stage: "belvedere", cash: 240 });
  await act();
  await modal("Aya Le Guen").waitFor();
  for (let i = 0; i < 3; i++) await button("CONTINUER").click();
  await button("Protéger la source").click();
  const ending = await expectState("fin", {
    stage: "done",
    ending: "protect",
    cash: 480,
  });
  await press("Escape");
  await modal("Partie en pause").waitFor();
  await button("Sauvegarder").click();
  await page.reload();
  await button("REPRENDRE LA PARTIE").click();
  await page.locator("#play-screen").waitFor({ timeout: 65000 });
  await expectState("reprise", {
    stage: "done",
    ending: "protect",
    x: ending.x,
    z: ending.z,
    cash: 480,
  });
  console.log(
    "✓ Chapitre complet sans repositionnement : visite, conduite, infiltration, choix et rechargement",
  );
  await press("Tab");
  await button("Journal").click();
  await page
    .getByRole("listitem")
    .filter({ hasText: "Sous la surface" })
    .getByRole("button", { name: "Revoir" })
    .click();
  await modal("Aya Le Guen").waitFor();
  await button("Passer la scène").click();
  await modal("LA TRAVERSE").waitFor();
  await expectState("relecture sans mutation", { stage: "done", cash: 480 });
  await press("Escape");

  await checkpoint(-115.3, 101.8);
  await act();
  await modal("Courses de la Darse").waitFor();
  await button("ACCEPTER").click();
  await expectState("course lancée", { courier: "relay" });
  await checkpoint(94.1, 41.4);
  await act();
  await expectState("course / marché", { courier: "depot" });
  // Imitate arriving in the bay; assert the actual speed gate and road-side handoff.
  await page.evaluate((bay) => {
    const g = window.gameForTest(),
      c = g.life.owned.get("mistral");
    Object.assign(c, bay);
    g.enter(c);
    c.speed = 2.7;
  }, DELIVERY_BAYS.depot);
  const unloading = await page.evaluate(() => {
    const g = window.gameForTest();
    return { target: g.target().point.label, action: g.action()?.type };
  });
  assert.deepEqual(unloading, {
    target: "Livraison à la Balise Nord",
    action: "delivery-stop",
  });
  await page.evaluate(() => {
    window.gameForTest().hero.car.speed = 0;
  });
  await act();
  const delivered = await expectState("course / balise", {
    courier: "idle",
    cash: 625,
    runs: 1,
    car: "mistral",
  });
  assert.ok(delivered.record > 0 && delivered.record < 155);
  await page.evaluate(() => {
    window.gameForTest().exit();
  });
  await checkpoint(-135.4, 84);
  await act();
  await modal("Café Le Sillage").waitFor();
  await button("Offert").click();
  await button("65 €").click();
  await expectState("panier", { coffees: 1, cash: 560, wardrobe: "rain" });
  await button("Voir le sac").click();
  await button("Boire").click();
  await expectState("inventaire", { coffees: 0 });
  assert.ok((await state()).bonus > 85);
  await press("Escape");
  await checkpoint(33, 120.6);
  await act();
  await modal("Garage Estuaire").waitFor();
  await button("410 €").click();
  await expectState("garage", { cash: 150, damage: 0 });
  await press("Escape");
  await page.evaluate(() => {
    const g = window.gameForTest(),
      car = g.life.owned.get("estuaire");
    Object.assign(car, { x: 112.9, z: 102.9, damage: 0.47 });
    g.save();
  });
  await checkpoint(110, 100.2);
  await act();
  await modal("Atelier du Ressac").waitFor();
  await button("48 €").click();
  await expectState("reparation", { cash: 102, damage: 0 });
  await press("Escape");
  console.log(
    "✓ Livraison à pied / en voiture, record, achats, véhicule et réparation aux points d’interaction",
  );

  await press("Escape");
  await modal("Partie en pause").waitFor();
  await button("Paramètres").click();
  await page.getByLabel("Météo").selectOption("rain");
  await press("Escape");
  await page.waitForFunction(() =>
    document.querySelector("#world-time").textContent.includes("PLUIE"),
  );
  const enforced = await page.evaluate(() => {
    const g = window.gameForTest(),
      guard = g.life.officers[0],
      h = g.hero;
    Object.assign(h, {
      x: guard.x + 0.22,
      z: guard.z + 0.18,
      crouch: false,
      air: false,
    });
    guard.speed = 0;
    g.setInput({});
    for (let i = 0; i < 95; i++) g.step(1 / 60);
    return { alert: g.life.alert.level, pursuing: g.life.units[0].pursue };
  });
  assert.deepEqual(enforced, { alert: 1, pursuing: true });
  console.log("✓ Réglage météo et déclenchement de la poursuite");

  // Changing the display must neither reload nor advance the paused simulation.
  await checkpoint(-159.8, 110.5);
  const beforeSwitch = await state();
  await press("Escape");
  await button("Paramètres").click();
  await page.getByLabel("Qualité graphique").selectOption("plan");
  await page.locator("canvas.plan-canvas").waitFor();
  const now = await state();
  assert.equal(now.mode, "plan");
  await page.locator("#aim-reticle").waitFor({ state: "hidden" });
  assert.equal(now.record, beforeSwitch.record);
  assert.equal(now.stage, "done");
  assert.equal(now.cash, 102);
  await press("Escape");
  await page.waitForFunction(
    () =>
      !window.gameForTest().paused && !document.querySelector("dialog").open,
  );
  const walkStart = (await state()).z;
  await page.keyboard.down("ArrowUp");
  try {
    await page.waitForFunction(
      (z) => window.gameForTest().hero.z < z - 0.92,
      walkStart,
    );
  } catch (e) {
    const debug = await page.evaluate(() => {
      const g = window.gameForTest();
      return {
        z: g.hero.z,
        input: g.input,
        paused: g.paused,
        elapsed: g.elapsed,
        focus: document.activeElement?.id,
      };
    });
    throw new Error(
      `Déplacement Plan absent : ${JSON.stringify(debug)} / ${errors.join(" ; ")}`,
      { cause: e },
    );
  } finally {
    await page.keyboard.up("ArrowUp");
  }
  await press("Escape");
  const parked = await state();
  await button("Sauvegarder").click();
  await button("Paramètres").click();
  await page.getByLabel("Qualité graphique").selectOption("low");
  await page.evaluate(() =>
    window
      .gameForTest()
      .setTracking("custom", { x: -143, z: 104, label: "Test de guidage" }),
  );
  await page.getByLabel("Guidage en jeu").selectOption("no");
  await page.locator("#viewport canvas:not(.plan-canvas)").waitFor();
  const restored = await state();
  assert.equal(restored.mode, "low");
  assert.equal(restored.z, parked.z);
  assert.equal(restored.cash, parked.cash);
  await press("Escape");
  await page.locator("#route-turn").waitFor({ state: "hidden" });
  await page.reload();
  await button("REPRENDRE LA PARTIE").click();
  await page.locator("#play-screen").waitFor({ timeout: 65000 });
  await expectState("reprise après changement de vue", {
    stage: "done",
    cash: 102,
    record: delivered.record,
    z: parked.z,
  });
  console.log(
    "✓ Vue Plan et retour en 3D sans rechargement ni perte de position ou de record",
  );

  assert.deepEqual(await reticle(page), { x: 0, y: 0, events: "none" });
  // Shoulder follow: one held movement keeps its heading while the view turns.
  const shoulder = await page.evaluate(() => {
    const g = window.gameForTest(),
      h = g.hero;
    Object.assign(h, {
      x: -171.6,
      z: 112,
      heading: 0,
      y: 0.08,
      linear: 0,
      air: false,
    });
    g.recenter();
    g.updateCamera(1, true);
    const start = [g.camera.position.x, g.camera.position.z];
    g.setInput({ right: true });
    for (let i = 0; i < 110; i++) {
      g.step(1 / 60);
      g.updateCamera(1 / 60);
    }
    g.setInput({});
    const dx = g.camera.position.x - h.x,
      dz = g.camera.position.z - h.z;
    return {
      x: h.x,
      z: h.z,
      heading: h.heading,
      yaw: g.yaw,
      shoulder: dx * Math.cos(g.yaw) + dz * Math.sin(g.yaw),
      back: -dx * Math.sin(g.yaw) + dz * Math.cos(g.yaw),
      tracked: Math.hypot(
        g.camera.position.x - start[0],
        g.camera.position.z - start[1],
      ),
    };
  });
  assert.ok(
    shoulder.x > -166 && Math.abs(shoulder.z - 112) < 0.02,
    JSON.stringify(shoulder),
  );
  assert.ok(Math.abs(angleDelta(shoulder.yaw, shoulder.heading)) < 0.05);
  assert.ok(
    shoulder.tracked > 1.9 && shoulder.shoulder > 0.55 && shoulder.back > 2.65,
    JSON.stringify(shoulder),
  );
  await page.mouse.move(560, 353);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(740, 384);
  await page.mouse.up({ button: "right" });
  const orbit = await page.evaluate(() => {
    const g = window.gameForTest(),
      yaw = g.yaw;
    for (let i = 0; i < 60; i++) g.step(1 / 60);
    const held = g.yaw;
    for (let i = 0; i < 165; i++) g.step(1 / 60);
    return { yaw, held, after: g.yaw, heading: g.hero.heading };
  });
  assert.ok(
    Math.abs(angleDelta(shoulder.yaw, orbit.yaw)) > 0.62,
    JSON.stringify(orbit),
  );
  assert.equal(orbit.yaw, orbit.held);
  assert.ok(Math.abs(angleDelta(orbit.after, orbit.heading)) < 0.04);
  await page.evaluate(() => window.gameForTest().orbit(0.83, 0.17));
  await press("v");
  assert.ok(
    await page.evaluate(() => {
      const g = window.gameForTest();
      return (
        Math.abs(
          Math.atan2(
            Math.sin(g.yaw - g.hero.heading),
            Math.cos(g.yaw - g.hero.heading),
          ),
        ) < 1e-6 && !g.manualUntil
      );
    }),
  );
  const clipped = await page.evaluate(() => {
    const g = window.gameForTest(),
      h = g.hero;
    const x = -173,
      z = 113;
    Object.assign(h, { x, z, heading: 0 });
    const wall = g.world.solids.add(x, z + 1.2, 5, 0.24, 4);
    g.recenter();
    g.updateCamera(1, true);
    const gap = g.camera.position.z - z;
    for (const cell of g.world.solids.cells.values()) {
      const i = cell.indexOf(wall);
      if (i >= 0) cell.splice(i, 1);
    }
    return gap;
  });
  assert.ok(clipped >= 0 && clipped < 0.93, `Caméra dans un mur : ${clipped}`);
  console.log(
    "✓ Caméra épaule : suivi sans virage en boucle, glissé, reprise automatique, V et murs",
  );

  await page.mouse.click(560, 352);
  await page.waitForFunction(
    () =>
      window.gameForTest().mouseAiming &&
      document.pointerLockElement?.id === "viewport",
  );
  assert.match(
    await page.locator("#mouse-hint").textContent(),
    /Clic maintenu/,
  );
  const direct = await page.evaluate(() => {
    const g = window.gameForTest(),
      h = g.hero;
    const before = { x: h.x, z: h.z, yaw: g.yaw, pitch: g.pitch };
    // CDP's absolute mouse moves are unreliable after lock in headless Chromium;
    // deliver the relative event the OS normally sends to the locked viewport.
    document.pointerLockElement.dispatchEvent(
      new MouseEvent("mousemove", { movementX: 108, movementY: 19 }),
    );
    for (let i = 0; i < 40; i++) g.step(1 / 60);
    return {
      rotated: Math.sin(g.yaw - before.yaw),
      pitch: g.pitch - before.pitch,
      aligned: Math.cos(g.yaw - h.heading),
      stayed: h.x === before.x && h.z === before.z,
    };
  });
  assert.ok(
    direct.rotated > 0.25 &&
      direct.pitch > 0.04 &&
      direct.aligned > 0.998 &&
      direct.stayed,
    JSON.stringify(direct),
  );
  assert.deepEqual(await reticle(page), { x: 0, y: 0, events: "none" });
  await press("b");
  await page.waitForFunction(() => {
    const g = window.gameForTest();
    return (
      g.wasEye &&
      g.mouseAiming &&
      document.pointerLockElement?.id === "viewport"
    );
  });
  await page.mouse.down();
  try {
    const moved = await page.evaluate(() => {
      const g = window.gameForTest(),
        h = g.hero;
      const x = h.x,
        z = h.z;
      document.pointerLockElement.dispatchEvent(
        new MouseEvent("mousemove", {
          movementX: 135,
          movementY: -10,
          buttons: 1,
        }),
      );
      for (let i = 0; i < 31; i++) g.step(1 / 60);
      return {
        distance: Math.hypot(h.x - x, h.z - z),
        along: (h.x - x) * Math.sin(g.yaw) - (h.z - z) * Math.cos(g.yaw),
        walking: g.input.forward,
      };
    });
    assert.ok(
      moved.walking &&
        moved.distance > 1.15 &&
        moved.along > moved.distance - 0.02,
      JSON.stringify(moved),
    );
  } finally {
    await page.mouse.up();
  }
  await page.waitForFunction(() => !window.gameForTest().input.forward);
  await press("Escape");
  await page.waitForFunction(
    () => !window.gameForTest().mouseAiming && !document.pointerLockElement,
  );
  assert.equal(await page.locator("#overlay").evaluate((d) => d.open), false);
  await page.mouse.click(552, 348);
  await page.waitForFunction(() => window.gameForTest().mouseAiming);
  await press("m");
  await modal("Carte de Port-Lumière").waitFor();
  await page.waitForFunction(
    () =>
      !document.pointerLockElement &&
      !window.gameForTest().mouseAiming &&
      !window.gameForTest().input.forward,
  );
  await press("Escape");
  await page.waitForFunction(() => !window.gameForTest().paused);
  await press("b");
  console.log(
    "✓ Souris directe : capture, rotation sans glisser, marche subjective au clic, libération par Échap ou carte",
  );

  const wallet = await page.evaluate(() => {
    const g = window.gameForTest(),
      person = g.life.talkers[0];
    Object.assign(g.life.alert, {
      level: 0,
      unseen: 0,
      visible: 0,
      stop: 0,
      last: null,
    });
    Object.assign(g.hero, { x: person.x - 1.16, z: person.z, y: 0.083 });
    g.uiAt = -1;
    return { cash: g.progress.cash, id: person.civilian };
  });
  await page.locator("#street-button").waitFor();
  assert.equal(
    await page.locator("#street-text").innerText(),
    "Voler ce passant",
  );
  assert.equal(
    await page.locator("#interaction-text").innerText(),
    "Saluer le passant",
  );
  await press("f");
  const robbed = await page.evaluate(() => {
    const g = window.gameForTest();
    g.step(1 / 60);
    return {
      cash: g.progress.cash,
      robbed: g.progress.street.robbed,
      alert: g.life.alert.level,
      chase: g.life.units[0].pursue,
      reacts: g.life.talkers[0].alarmUntil > g.life.time,
    };
  });
  assert.ok(robbed.cash > wallet.cash);
  assert.deepEqual(robbed, {
    cash: robbed.cash,
    robbed: [wallet.id],
    alert: 1,
    chase: true,
    reacts: true,
  });
  await press("f");
  await expectState("pas de nouveau butin", { cash: robbed.cash });

  const fit = await stoppedTraffic(page);
  await page.getByRole("button", { name: /^Braquer ·/ }).waitFor();
  const levelBefore = (await state()).alert;
  await press("f");
  await expectState("véhicule pris", {
    car: fit.id,
    alert: Math.min(3, levelBefore + 2),
  });
  const transfer = await page.evaluate((look) => {
    const g = window.gameForTest(),
      c = g.hero.car,
      life = g.life;
    const prior = { x: c.x, z: c.z, s: c.s };
    const activeIncident = !!life.incident;
    g.setInput({ forward: true });
    for (let i = 0; i < 52; i++) g.step(1 / 60);
    g.setInput({});
    return {
      id: c.id,
      copies: life.allCars().filter((v) => v.trafficId === c.id).length,
      total: life.allCars().length,
      occupied: life.seized.get(c.id) === c,
      trafficAI: life.traffic.includes(c) || c.s !== prior.s,
      activeIncident,
      driverOutside: life.drivers.some(
        (p) =>
          p.alarmUntil > life.time &&
          p.look.style === look.style &&
          p.look.hue === look.hue,
      ),
      playerInCabin:
        c.driver?.hero === true && c.model.driver?.name === "Noa · au volant",
      driven: Math.hypot(c.x - prior.x, c.z - prior.z),
    };
  }, fit.look);
  assert.ok(transfer.driven > 0.8, JSON.stringify(transfer));
  assert.deepEqual(transfer, {
    id: fit.id,
    copies: 1,
    total: fit.before,
    occupied: true,
    trafficAI: false,
    activeIncident: false,
    driverOutside: true,
    playerInCabin: true,
    driven: transfer.driven,
  });
  await page.locator("#vehicle-name").filter({ hasText: "VOLÉ" }).waitFor();
  // Pause first: reloading can save once more on visibilitychange while the car is coasting.
  await page.locator("#open-pause").click();
  await button("Sauvegarder").click();
  const saved = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("meridien:progress:v1"));
    return { position: p.position, alert: p.alert.level, cash: p.cash };
  });
  await page.reload();
  await button("REPRENDRE LA PARTIE").click();
  await page.locator("#play-screen").waitFor();
  await expectState("reprise au volant volé", {
    car: fit.id,
    cash: saved.cash,
    alert: saved.alert,
    x: saved.position.x,
    z: saved.position.z,
    stage: "done",
  });
  assert.equal(
    await page.evaluate(() => window.gameForTest().hero.car.driver.hero),
    true,
  );
  await act();
  const parkedStolen = await page.evaluate((id) => {
    const g = window.gameForTest();
    const c = g.life.seized.get(id),
      a = g.action();
    return {
      onFoot: !g.hero.car,
      parked: c.speed === 0,
      empty: !c.driver && !c.model.driver,
      prompt: a?.car === c,
      owned: g.life.owned.has(id),
      wallet: g.progress.street.robbed,
      copies: g.life.allCars().filter((v) => v.trafficId === id).length,
    };
  }, fit.id);
  assert.deepEqual(parkedStolen, {
    onFoot: true,
    parked: true,
    empty: true,
    prompt: true,
    owned: false,
    wallet: [wallet.id],
    copies: 1,
  });
  await page.reload();
  await button("REPRENDRE LA PARTIE").click();
  await page.locator("#play-screen").waitFor();
  assert.ok(
    await page.evaluate((id) => {
      const g = window.gameForTest(),
        c = g.life.seized.get(id);
      return (
        c &&
        !c.driver &&
        !c.model.driver &&
        !g.hero.car &&
        !g.life.traffic.includes(c)
      );
    }, fit.id),
  );
  await act();
  await expectState("remonter sans nouveau vol", {
    car: fit.id,
    alert: saved.alert,
  });
  console.log(
    "✓ Vols : conducteur à l’arrêt, sortie, remplacement par Noa, sauvegarde au volant ou cabine vide",
  );

  await page.close();
  await checkStreetAndStation();
  await checkTouchCockpit();

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  watch(mobile);
  await expose(mobile);
  const planAssetRequests = [];
  mobile.on("request", (request) => {
    if (
      request.url().includes("/atelier/") ||
      request.url().endsWith("/semaphore.js")
    )
      planAssetRequests.push(request.url());
  });
  await mobile.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (name, ...args) {
      return name === "webgl2" ? null : get.call(this, name, ...args);
    };
    localStorage.setItem(
      "meridien:settings:v1",
      JSON.stringify({ quality: "auto", sound: false }),
    );
  });
  await mobile.goto(url);
  await mobile.locator("#start-game").waitFor();
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await mobile.locator("#title-controls").tap();
  await mobile.getByRole("dialog", { name: "Commandes" }).waitFor();
  await mobile.locator("#close-panel").tap();
  await mobile.locator("#start-game").tap();
  await mobile.locator("canvas.plan-canvas").waitFor({ timeout: 45000 });
  assert.equal(
    await mobile.evaluate(() => window.gameForTest().fallback),
    true,
  );
  await mobile.locator("#aim-reticle").waitFor({ state: "hidden" });
  await mobile.locator("#open-map").tap();
  await mobile.getByRole("dialog", { name: "Carte de Port-Lumière" }).waitFor();
  await mobile
    .getByRole("button", { name: PLACES.semaphore.label, exact: true })
    .tap();
  assert.match(
    await mobile.locator(".map-status").textContent(),
    /REPÈRE.*Sémaphore des Marées/,
  );
  assert.deepEqual(
    planAssetRequests,
    [],
    "Le Plan n’a pas à télécharger le sémaphore 3D",
  );
  const depotMark = await chartPoint(mobile, PLACES.depot);
  await mobile.touchscreen.tap(depotMark.x, depotMark.y);
  assert.match(
    await mobile.locator(".map-status").textContent(),
    /REPÈRE.*Balise Nord/,
  );
  await mobile
    .getByRole("button", { name: "Suivre l’histoire", exact: true })
    .tap();
  await mobile.locator("#close-panel").tap();
  const pad = mobile.getByRole("button", { name: "Avancer", exact: true }),
    box = await pad.boundingBox();
  assert.ok(box);
  const cdp = await mobile.context().newCDPSession(mobile);
  const z = await mobile.evaluate(() => window.gameForTest().hero.z);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
  try {
    await mobile.waitForFunction(
      (start) => window.gameForTest().hero.z < start - 0.88,
      z,
    );
  } finally {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
  // Release one pointer without clearing the action held by another, including lost capture.
  const touch = await mobile.evaluate(() => {
    const button = document.querySelector("[data-hold=forward]"),
      g = window.gameForTest();
    const event = (type, pointerId) =>
      button.dispatchEvent(
        new PointerEvent(type, {
          pointerId,
          pointerType: "touch",
          bubbles: true,
        }),
      );
    event("pointerdown", 219);
    event("pointerdown", 220);
    event("lostpointercapture", 219);
    const stillHeld = g.input.forward;
    event("pointercancel", 220);
    return [stillHeld, g.input.forward];
  });
  assert.deepEqual(touch, [true, false]);
  const pos = await mobile.evaluate(() => {
    const g = window.gameForTest();
    Object.assign(g.hero, {
      x: -130,
      z: 88.64,
      air: false,
      crouch: false,
      walkSpeed: 0,
    });
    g.uiAt = -1;
    return [g.hero.x, g.hero.z];
  });
  await mobile.locator("#interact-button").tap();
  await mobile.getByRole("dialog", { name: "Inès Kader" }).waitFor();
  assert.match(
    await mobile.locator(".voice-status").innerText(),
    /SOUS-TITRES SEULS/,
  );
  assert.ok(
    await mobile.evaluate(() => {
      const g = window.gameForTest();
      return !g.renderer && !g.world.harborMotion && g.sceneShot;
    }),
  );
  await mobile.getByRole("button", { name: "Passer la scène" }).tap();
  assert.deepEqual(
    await mobile.evaluate(() => {
      const g = window.gameForTest();
      return [g.hero.x, g.hero.z, g.progress.stage];
    }),
    [...pos, "hangar"],
  );
  await mobile.evaluate(() => {
    const g = window.gameForTest(),
      p = g.life.talkers[0];
    Object.assign(g.hero, { x: p.x - 1.16, z: p.z, air: false });
    g.uiAt = -1;
  });
  await mobile.setViewportSize({ width: 320, height: 568 });
  const theft = mobile.locator("#street-button");
  await theft.waitFor();
  await assertTouchHud(mobile);
  await theft.tap();
  await mobile.waitForFunction(
    () => window.gameForTest().progress.street.robbed.length === 1,
  );
  const car = await stoppedTraffic(mobile);
  await theft.tap();
  await mobile.waitForFunction(
    (id) => window.gameForTest().hero.car?.id === id,
    car.id,
  );
  await mobile.locator("#interact-button").tap();
  await mobile.waitForFunction(() => !window.gameForTest().hero.car);
  await mobile.close();
  console.log(
    "✓ Écran tactile : Plan sans WebGL 2, déplacement, dialogue et vols avec les boutons à l’écran",
  );

  const preview = await browser.newPage({
    viewport: { width: 1020, height: 700 },
  });
  watch(preview);
  await expose(preview);
  const embeddedURL = new URL("souris-preview-test.html", url).href;
  await preview.route(embeddedURL, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Aperçu sans capture</title><iframe sandbox="allow-scripts allow-same-origin" src="${url}" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>`,
    }),
  );
  await preview.addInitScript(() =>
    localStorage.setItem(
      "meridien:settings:v1",
      JSON.stringify({ quality: "low", sound: false }),
    ),
  );
  await preview.goto(embeddedURL);
  const frame = preview.frames().find((f) => f.parentFrame());
  assert.ok(frame);
  await frame.locator("#start-game").click();
  await frame.locator("#play-screen").waitFor();
  await preview.mouse.click(505, 350);
  const initialYaw = await frame.evaluate(() => window.gameForTest().yaw);
  await preview.mouse.move(618, 372, { steps: 4 });
  const free = await frame.evaluate(() => ({
    yaw: window.gameForTest().yaw,
    active: window.gameForTest().mouseAiming,
    captured: !!document.pointerLockElement,
  }));
  assert.ok(
    free.active && !free.captured && angleDelta(initialYaw, free.yaw) > 0.28,
    JSON.stringify(free),
  );
  await preview.mouse.down();
  const advances = await frame.evaluate(() => {
    const g = window.gameForTest(),
      { x, z } = g.hero;
    for (let i = 0; i < 28; i++) g.step(1 / 60);
    return Math.hypot(g.hero.x - x, g.hero.z - z);
  });
  await preview.mouse.up();
  assert.ok(advances > 1);
  await preview.mouse.move(1013, 371, { steps: 5 });
  const edgeTurn = await frame.evaluate(() => {
    const g = window.gameForTest(),
      initial = g.yaw;
    for (let i = 0; i < 25; i++) g.step(1 / 60);
    return g.input.lookRight && Math.sin(g.yaw - initial);
  });
  assert.ok(edgeTurn > 0.55);
  await preview.mouse.move(598, 378, { steps: 5 });
  await preview.mouse.down();
  const clean = await frame.evaluate(() => {
    const g = window.gameForTest();
    const wasMoving = g.input.forward;
    window.dispatchEvent(new Event("blur"));
    return (
      wasMoving && !g.input.forward && !g.input.lookRight && !g.mouseAiming
    );
  });
  await preview.mouse.up();
  assert.ok(clean);
  await preview.close();
  assert.deepEqual(errors, []);
  console.log(
    "✓ Aperçu intégré sans capture : mouvement relatif, marche, rotation aux bords et arrêt sans focus",
  );
} finally {
  await browser.close();
}

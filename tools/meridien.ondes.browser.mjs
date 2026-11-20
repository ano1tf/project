// Serve the repo with `python3 tools/serve.py 8000` before this optional test.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  freshProgress,
  LEGACY_SAVE_KEY,
  PREF_KEY,
  SAVE_KEY,
} from "../game/meridien/js/progress.mjs";
import {
  ENDINGS,
  ONDES,
  PASSAGE,
  PLACES,
  WATCH,
} from "../game/meridien/js/data.mjs";
import { ECHO_OUTCOMES } from "../game/meridien/js/echo.mjs";

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
const button = (page, name) => page.getByRole("button", { name, exact: true });
const dialog = (page, name) => page.getByRole("dialog", { name, exact: true });
const act = async (page) => {
  await page.locator("#viewport").focus();
  await page.keyboard.press("e");
};
async function start(page, seed, quality) {
  page.on("pageerror", (e) => errors.push(e.stack));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.route("**/js/main.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()) + "\nwindow.gameForTest = () => game;",
    });
  });
  await page.addInitScript(
    ({ seed, quality, saveKey, prefKey }) => {
      if (!localStorage.getItem(saveKey))
        localStorage.setItem(saveKey, JSON.stringify(seed));
      if (!localStorage.getItem(prefKey))
        localStorage.setItem(
          prefKey,
          JSON.stringify({ quality, sound: false, weather: "clear" }),
        );
    },
    {
      seed,
      quality,
      saveKey: seed.version === 1 ? LEGACY_SAVE_KEY : SAVE_KEY,
      prefKey: PREF_KEY,
    },
  );
  await page.goto(url);
  await resume(page);
}
async function resume(page) {
  await button(page, "REPRENDRE LA PARTIE").click();
  await page
    .locator("#play-screen #viewport canvas")
    .waitFor({ timeout: 65_000 });
}
async function setMode(page, mode) {
  await page.keyboard.press("Escape");
  await dialog(page, "Partie en pause").waitFor();
  await button(page, "Paramètres").click();
  await page.getByLabel("Qualité graphique").selectOption(mode);
  await page.waitForFunction((m) => window.gameForTest().mode === m, mode);
  await page.keyboard.press("Escape");
}
const state = (page) =>
  page.evaluate(() => {
    const { hero, progress, world, mode } = window.gameForTest();
    return {
      x: hero.x,
      z: hero.z,
      stage: progress.stage,
      ending: progress.ending,
      cash: progress.cash,
      echo: progress.echo,
      tracking: progress.tracking,
      board: world.civicNotice.userData.key,
      mode,
    };
  });

// Read the real shared navigator, then follow its waypoints at 60 Hz. This
// doesn't reposition Noa or advance a mission by writing its state.
async function follow(page, expected, point = null) {
  const result = await page.evaluate(
    ({ expected, point }) => {
      const g = window.gameForTest(),
        h = g.hero;
      const target = point ? { point } : g.target();
      const path = g.route(target).slice(1);
      if (!path.length && (!expected || g.action()?.type !== expected))
        return { fail: "no route", target };
      let steps = 0;
      for (const [n, at] of path.entries()) {
        for (let tick = 0; tick < 5000; ++tick) {
          const d = Math.hypot(h.x - at.x, h.z - at.z);
          if (
            d < 0.29 ||
            (expected && n === path.length - 1 && g.action()?.type === expected)
          )
            break;
          g.yaw = Math.atan2(at.x - h.x, h.z - at.z);
          g.footIntent = null;
          g.setInput({ forward: true, walk: d < 1.55 });
          g.step(1 / 60);
          steps++;
          if (tick === 4999) {
            g.setInput({});
            return { fail: "blocked", x: h.x, z: h.z, at, n, path };
          }
        }
      }
      g.setInput({});
      // Let the game paint from the actual arrival point before a click.
      g.uiAt = -1;
      g.cameraCut = true;
      return {
        reached: g.action()?.type,
        target: target.point,
        path,
        steps,
        covered: g.world.isRoofed(h),
      };
    },
    { expected, point },
  );
  assert.ok(!result.fail, JSON.stringify(result));
  if (expected) assert.equal(result.reached, expected, JSON.stringify(result));
  return result;
}

try {
  const legacy = freshProgress();
  delete legacy.echo;
  Object.assign(legacy, {
    version: 1,
    stage: "done",
    ending: "publish",
    cash: legacy.cash + ENDINGS.publish.reward,
    position: { x: -174.1, z: 11.6, heading: 2.5 },
  });
  const page = await browser.newPage({
    viewport: { width: 960, height: 600 },
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(42_000);
  await start(page, legacy, "standard");
  assert.equal((await state(page)).ending, "publish");
  await page.keyboard.press("Tab");
  await dialog(page, "LA TRAVERSE")
    .getByText("SALOMÉ RENAUD · ATELIER DES ONDES")
    .waitFor();
  await button(page, "Suivre le dossier").click();
  await page.keyboard.press("m");
  await dialog(page, "Carte de Port-Lumière").waitFor();
  assert.match(
    await page.locator(".map-status").textContent(),
    /TRAJET.*Fréquences de veille/,
  );
  await page.keyboard.press("Escape");
  const lead = await follow(page, "ondes");
  assert.ok(lead.steps > 1500 && lead.covered, JSON.stringify(lead));
  await act(page);
  await dialog(page, "Salomé Renaud").waitFor();
  assert.match(
    await page.locator(".scene-subtitle").textContent(),
    /l’article d’Aya/,
  );
  const shot = await page.evaluate(() => {
    const g = window.gameForTest(),
      angles = ["wide", "reverse", "profile", "close", "choice"],
      positions = [];
    const old = g.sceneShot.key;
    for (const aspect of [1.6, 0.565])
      for (const key of angles) {
        const before = g.camera.aspect;
        g.camera.aspect = aspect;
        g.sceneShot.key = key;
        g.updateCamera(1, true);
        const { x, y, z } = g.camera.position;
        positions.push({
          key,
          aspect,
          x,
          y,
          z,
          blocked: g.world.solids.blocked(x, z, 0.12, y, 0.12),
        });
        g.camera.aspect = before;
      }
    g.sceneShot.key = old;
    return positions;
  });
  assert.ok(
    shot.every((p) => !p.blocked && Number.isFinite(p.y) && p.y > 1.2),
    JSON.stringify(shot),
  );
  await button(page, "Passer la scène").click();
  assert.equal((await state(page)).echo.accepted, true);
  assert.equal((await state(page)).cash, legacy.cash);
  // Collect the plate first, even though the HUD suggests the quay first.
  await follow(page, "badge", PLACES.badge);
  await act(page);
  await dialog(page, "Plaque du commutateur")
    .getByText(/voie du relais/i)
    .waitFor();
  await button(page, "Reprendre").click();
  await setMode(page, "plan");
  await follow(page, "watch");
  await act(page);
  await dialog(page, "Registre de veille")
    .getByText(/02 h 17/)
    .waitFor();
  await button(page, "Journal").click();
  await page
    .getByRole("listitem")
    .filter({ hasText: "Plaque du commutateur" })
    .waitFor();
  await page
    .getByRole("listitem")
    .filter({ hasText: "Registre de veille" })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.reload();
  await resume(page);
  assert.deepEqual((await state(page)).echo, {
    accepted: true,
    watch: true,
    badge: true,
    tuned: false,
    outcome: null,
  });
  await follow(page, "receiver");
  await act(page);
  await dialog(page, "Récepteur à bande").waitFor();
  assert.ok(await button(page, "Caler le récepteur").isDisabled());
  await page.getByLabel("Voie du standard").selectOption("C");
  await page.getByLabel("Heure inscrite sur la bobine").selectOption("0209");
  await button(page, "Caler le récepteur").click();
  assert.match(
    await page.locator(".receiver-result").textContent(),
    /ne concorde pas/,
  );
  assert.equal((await state(page)).echo.tuned, false);
  await page.getByLabel("Heure inscrite sur la bobine").selectOption("0217");
  await button(page, "Caler le récepteur").click();
  await page
    .locator(".receiver-readout")
    .getByText("C · 02 H 17 → 02 H 09")
    .waitFor();
  await button(page, "Reprendre").click();
  await follow(page, "ondes");
  await setMode(page, "high");
  // Check Cinema's cached shadow map in daylight before entering the new scene.
  const lighting = await page.evaluate(() => {
    const g = window.gameForTest();
    g.progress.time = 13 * 60;
    g.climate.shadowStamp = -1;
    g.presentFrame(1 / 30, performance.now());
    const sh = g.climate.sun.shadow;
    return {
      shadows: g.renderer.shadowMap.enabled,
      map: sh.mapSize.x,
      compiled: !!sh.map?.depthTexture,
      contacts: g.world.batch.material.uniforms.groundContact.value.image.width,
    };
  });
  assert.deepEqual(lighting, {
    shadows: true,
    map: 1280,
    compiled: true,
    contacts: 512,
  });
  const sunUpdates = await page.evaluate(() => {
    const g = window.gameForTest(),
      sh = g.climate.sun.shadow,
      update = sh.updateMatrices,
      elapsed = g.elapsed,
      start = (Math.floor(elapsed * 8) + 1) / 8;
    let calls = 0;
    sh.updateMatrices = function (...args) {
      calls++;
      return update.apply(this, args);
    };
    try {
      return [0.01, 0.04, 0.14].map((offset) => {
        g.elapsed = start + offset;
        g.presentFrame(0, performance.now());
        return calls;
      });
    } finally {
      delete sh.updateMatrices;
      g.elapsed = elapsed;
      g.climate.shadowStamp = -1;
    }
  });
  assert.deepEqual(
    sunUpdates,
    [1, 1, 2],
    "Le cache doit éviter une passe d’ombres entre deux créneaux",
  );
  // Exercise the hardware-tier configuration even when the test driver is SwiftShader.
  const standard = await page.evaluate(() => {
    const g = window.gameForTest(),
      software = g.software,
      small = g.smallDevice;
    g.software = g.smallDevice = false;
    g.quality("standard");
    g.presentFrame(1 / 30, performance.now());
    const { map, mapSize } = g.climate.sun.shadow;
    const result = { size: mapSize.x, compiled: !!map?.depthTexture };
    g.software = software;
    g.smallDevice = small;
    g.quality("high");
    return result;
  });
  assert.deepEqual(standard, { size: 768, compiled: true });
  await act(page);
  await dialog(page, "Noa Vidal").waitFor();
  await button(page, "Passer la scène").click();
  await dialog(page, "Où garder la preuve ?").waitFor();
  await button(page, "Quitter sans choisir").click();
  assert.equal((await state(page)).echo.outcome, null);
  await act(page);
  await button(page, "Passer la scène").click();
  await button(page, ECHO_OUTCOMES.archive.label).click();
  const finished = await state(page);
  assert.deepEqual(
    {
      stage: finished.stage,
      ending: finished.ending,
      board: finished.board,
      cash: finished.cash,
      result: finished.echo.outcome,
    },
    {
      stage: "done",
      ending: "publish",
      board: "archive",
      cash: legacy.cash + ECHO_OUTCOMES.archive.reward,
      result: "archive",
    },
  );
  await page.reload();
  await resume(page);
  const saved = await state(page);
  assert.deepEqual(saved, finished);
  await act(page);
  await dialog(page, PLACES.ondes.label)
    .getByText(/transcription est au poste/)
    .waitFor();
  await button(page, "Reprendre").click();
  await follow(page, "watch", PLACES.watch);
  await act(page);
  await dialog(page, "Registre de veille")
    .getByText(/copie sans les voix/)
    .waitFor();
  await button(page, "Reprendre").click();
  console.log(
    "✓ Dossier depuis une ancienne sauvegarde : trajet, deux indices, réfutation, calage, choix, affichage au quai et récompense persistante (Soigné → Plan → Cinéma)",
  );

  const streets = await page.evaluate(
    ({ ondes, passage, watch }) => {
      const g = window.gameForTest(),
        world = g.world;
      const measured = g.life.civilians
        .filter((p) => p.role)
        .map((p) => {
          const node = p.nodes.findIndex((n) => n.linger),
            minutes = g.life.minutes;
          const check = (h) => {
            g.life.minutes = h * 60;
            const t = {
              ...p,
              ...p.nodes[node],
              node,
              alarmUntil: 0,
              pauseNode: null,
            };
            g.life.updateWalker(t, 1 / 60, g.hero, true);
            return t.pauseUntil - g.life.time;
          };
          const shift = check(p.role.hours[0] + 1),
            quiet = check(p.role.hours[1] + 1);
          g.life.minutes = minutes;
          return {
            id: p.civilian,
            shift,
            quiet,
            circuit: p.nodes.every((a, i) =>
              g.walkRoutes.visible(a, p.nodes[(i + 1) % p.nodes.length], 0.26),
            ),
          };
        });
      return {
        alley: world.solids.trace(
          passage.x,
          0.9,
          2.7,
          passage.x,
          0.9,
          36.4,
          0.39,
        ),
        glass: world.solids.trace(
          ondes.x + 3.5,
          1.2,
          26.8,
          ondes.x + 3.5,
          1.2,
          23.6,
        ),
        doorway: world.solids.trace(
          ondes.x,
          1.2,
          26.8,
          ondes.x,
          1.2,
          22.4,
          0.39,
        ),
        parking: g.life.parked.map(
          (car) => !car.id && world.solids.blocked(car.x, car.z),
        ),
        sheltered: world.isRoofed(ondes.witness) && world.isRoofed(watch),
        measured,
        civilianCount: g.life.civilians.length,
      };
    },
    { ondes: ONDES, passage: PASSAGE, watch: WATCH },
  );
  assert.equal(streets.alley, 1, JSON.stringify(streets));
  assert.ok(
    streets.glass < 0.95 && streets.doorway === 1 && streets.sheltered,
    JSON.stringify(streets),
  );
  assert.deepEqual(streets.parking, [true, true]);
  assert.equal(streets.civilianCount, 21);
  assert.ok(
    streets.measured.length === 2 &&
      streets.measured.every((a) => a.shift > 3 && a.quiet < 1 && a.circuit),
    JSON.stringify(streets),
  );
  console.log(
    "✓ Collisions de la vitrine, passage libre, parking hors voie, cadrages et pauses jour/nuit sur des circuits libres",
  );
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), LEGACY_SAVE_KEY),
    JSON.stringify(legacy),
  );
  assert.ok(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY));
  await page.close();

  // Play the other ending from a checkpoint just before the debrief, with a
  // different original ending and a compact touch viewport in Plan.
  const touch = await browser.newPage({
    viewport: { width: 320, height: 568 },
    hasTouch: true,
    isMobile: true,
  });
  await start(
    touch,
    {
      ...legacy,
      ending: "protect",
      cash: 240 + ENDINGS.protect.reward,
      position: { x: finished.x, z: finished.z, heading: 0.7 },
      echo: { ...finished.echo, outcome: null },
      tracking: "echo",
    },
    "plan",
  );
  await touch.locator("#interact-button").tap();
  await button(touch, "Passer la scène").tap();
  const box = await button(touch, ECHO_OUTCOMES.seal.label).boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 321, JSON.stringify(box));
  await button(touch, ECHO_OUTCOMES.seal.label).tap();
  assert.equal((await state(touch)).board, "seal");
  await follow(touch, "receiver", PLACES.receiver);
  await touch.locator("#interact-button").tap();
  await touch.getByText("C · BOBINE SOUS SCELLÉ", { exact: true }).waitFor();
  assert.equal(await button(touch, "Réécouter le signal de calage").count(), 0);
  await button(touch, "Reprendre").tap();
  await touch.reload();
  await resume(touch);
  const sealed = await state(touch);
  assert.equal(sealed.echo.outcome, "seal");
  assert.equal(sealed.ending, "protect");
  assert.equal(
    sealed.cash,
    240 + ENDINGS.protect.reward + ECHO_OUTCOMES.seal.reward,
  );
  assert.equal(
    await touch.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  const sound = await touch.evaluate(async () => {
    const { HarborAudio } = await import("./js/audio.js");
    const render = async (locked) => {
      const ctx = new OfflineAudioContext(1, 24000, 24000),
        radio = new HarborAudio({ sound: true });
      radio.context = ctx;
      radio.canPlay = () => true;
      radio.master = ctx.destination;
      radio.grit = ctx.createBuffer(1, 24000, 24000);
      const noise = radio.grit.getChannelData(0);
      let rng = 23;
      for (let i = 0; i < noise.length; i++) {
        rng = (Math.imul(1664525, rng) + 1013904223) >>> 0;
        noise[i] = rng / 2147483648 - 1;
      }
      radio.radio(locked);
      const result = (await ctx.startRendering()).getChannelData(0);
      const peak = (start) =>
        result.subarray(start).reduce((l, x) => Math.max(l, Math.abs(x)), 0);
      return { peak: peak(0), late: peak(14400) };
    };
    return { good: await render(true), bad: await render(false) };
  });
  assert.ok(
    sound.good.peak > 0.08 &&
      sound.good.late > 0.04 &&
      sound.bad.peak > 0.01 &&
      sound.bad.late === 0,
    JSON.stringify(sound),
  );
  assert.deepEqual(errors, []);
  console.log(
    "✓ Autre décision sur mobile 320 × 568 : bobine non réécoutable, scellé persistant, ancienne fin préservée",
  );
} finally {
  await browser.close();
}

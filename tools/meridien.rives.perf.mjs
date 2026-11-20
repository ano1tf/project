// Comparable synchronized frame costs (not an FPS test on hardware).
// Optional MERIDIEN_BASELINE is a copy of game/meridien from the older build.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
    : "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  args: process.env.WEBGL_SOFTWARE
    ? [
        "--disable-dev-shm-usage",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ]
    : [],
});
const errors = [],
  url = process.env.MERIDIEN_URL || "http://localhost:8000/game/meridien/";
const baseline = process.env.MERIDIEN_BASELINE;
const shots = process.env.MERIDIEN_SHOTS;
const samples = Math.max(
  20,
  Math.min(120, Number(process.env.MERIDIEN_FRAMES) || 20),
);
if (shots) await mkdir(shots, { recursive: true });
async function sample(label, older) {
  const p = await browser.newPage({
    viewport: { width: 960, height: 600 },
    reducedMotion: "reduce",
  });
  let requests = 0;
  try {
    p.on("pageerror", (e) => errors.push(e.stack));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    p.on("request", (r) => {
      if (r.url().endsWith("atelier-des-greves.kreo-asset.json")) requests++;
    });
    await p.route(`${url}**`, async (r) => {
      const rel =
        new URL(r.request().url()).pathname.slice(
          new URL(url).pathname.length,
        ) || "index.html";
      const file = older ? join(older, rel) : null;
      const substitute =
        file && /\.(?:html|css|m?js)$/.test(rel) && existsSync(file);
      if (!substitute && rel !== "js/main.js") return r.continue();
      const response = await r.fetch();
      let body = substitute
        ? readFileSync(file, "utf8")
        : await response.text();
      if (rel === "js/main.js")
        body =
          body.replace("game.begin();", "/* deterministic visuals */") +
          "\nwindow.captureGame=()=>game;";
      await r.fulfill({ response, body });
    });
    await p.addInitScript(() =>
      localStorage.setItem(
        "meridien:settings:v1",
        JSON.stringify({
          quality: "low",
          sound: false,
          weather: "clear",
          guide: false,
        }),
      ),
    );
    await p.goto(url);
    const t = performance.now();
    await p.locator("#start-game").click();
    await p.locator("#viewport canvas").waitFor({ timeout: 65000 });
    const boot = performance.now() - t;
    await p.evaluate(async () => {
      const g = window.captureGame();
      await g.world.semaphoreReady;
      await g.world.portSite.ready;
      if (g.mode !== "low")
        throw Error("Sélection Éco indisponible : benchmark 3D non valide");
      const gl = g.renderer.getContext(),
        pixel = new Uint8Array(4);
      g.renderer.setDrawingBufferSize(960, 600, 0.82);
      window.fixedPose = ([x, z, tx, tz, minutes = 940]) => {
        Object.assign(g.hero, { x, z, y: g.world.floor?.({ x, z }) ?? 0.084 });
        g.yaw = g.hero.heading = Math.atan2(tx - x, z - tz);
        g.pitch = 0.073;
        g.progress.time = minutes;
        g.cameraCut = true;
        g.climate.updateConditions(0, 0, minutes);
      };
      window.measuredFrame = () => {
        const t = performance.now();
        g.presentFrame(1 / 30, t);
        gl.readPixels(
          (480 * 0.82) | 0,
          (300 * 0.82) | 0,
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel,
        );
        return performance.now() - t;
      };
      window.metrics = () => {
        const { render, memory } = g.renderer.info;
        return {
          calls: render.calls,
          triangles: render.triangles,
          geometry: memory.geometries,
          textures: memory.textures,
        };
      };
    });
    const regular = [
      ["quai", -160.5, 111.5, -132, 85],
      ["tisserands", 46.3, 30, 46.3, 19],
    ];
    const extra = [
      ["pont", -224, 128.6, -262, 124],
      ["greves", -283, 132, -301, 112],
      ["atelier", -303.9, 111.16, -308, 105.55],
      ["navette", -181.7, 151.7, -194, 145, 617],
    ];
    const result = await p.evaluate(
      async ({ regular, extra, samples }) => {
        const g = window.captureGame(),
          out = {};
        const draw = window.measuredFrame,
          at = window.fixedPose;
        const percentile = (a, f) =>
          Math.round(
            a.slice().sort((a, b) => a - b)[Math.ceil(a.length * f) - 1] * 10,
          ) / 10;
        async function enterPose(pose) {
          at(pose);
          for (let n = 0; n < 3; n++) draw();
          await g.world.rive?.pending;
          for (let n = 0; n < 3; n++) draw();
        }
        for (const [name, ...pose] of [
          ...regular,
          ...(g.world.rive ? extra : []),
        ]) {
          if (name === "greves") {
            at(pose);
            const start = performance.now();
            draw();
            await g.world.rive.pending;
            draw();
            out.firstKitMs = Math.round(performance.now() - start);
            if (!g.world.rive.kit) throw Error("Atelier non monté");
          }
          await enterPose(pose);
          const passes = [];
          for (let k = 0; k < 3; k++) {
            const a = Array.from({ length: samples }, draw);
            passes.push({ p50: percentile(a, 0.5), p95: percentile(a, 0.95) });
            await new Promise(requestAnimationFrame);
          }
          out[name] = { ...window.metrics(), passes };
        }
        if (g.world.rive) {
          const cycles = [];
          for (let i = 0; i < 5; i++) {
            const a = performance.now();
            await enterPose(extra[2].slice(1));
            const kit = g.world.rive.kit;
            if (!kit) throw Error("Aucun lot à décharger");
            let meshes = 0,
              disposed = 0;
            kit.root.traverse((o) => {
              if (o.isMesh) {
                meshes++;
                o.geometry.addEventListener("dispose", () => disposed++);
              }
            });
            const inside = window.metrics(),
              arrived = Math.round(performance.now() - a);
            await enterPose(regular[0].slice(1));
            if (g.world.rive.kit || disposed !== meshes)
              throw Error(`Lot resté vivant, ${disposed}/${meshes}`);
            cycles.push({
              arrived,
              meshes,
              disposed,
              inside,
              back: window.metrics(),
            });
          }
          out.cycles = cycles;
        }
        return out;
      },
      { regular, extra, samples },
    );
    if (result.cycles) {
      assert.equal(
        requests,
        1,
        "A second traversal should reuse the parsed source, not fetch again",
      );
      const lastFour = result.cycles
        .slice(1)
        .map((row) => [
          row.back.geometry,
          row.back.textures,
          row.inside.geometry,
          row.inside.textures,
        ]);
      for (const pair of lastFour) assert.deepEqual(pair, lastFour[0]);
    }
    console.log(
      JSON.stringify({
        label,
        bootMs: Math.round(boot),
        framesPerPass: samples,
        requests,
        ...result,
      }),
    );
    if (shots && !older)
      for (const [name, ...pose] of extra) {
        await p.evaluate((pose) => {
          window.fixedPose(pose);
          const g = window.captureGame();
          g.hooks.update?.(g); // Update the HUD only for the capture, outside the timed series.
          window.measuredFrame();
          window.measuredFrame();
        }, pose);
        await p.screenshot({
          path: join(shots, `${name}.jpg`),
          type: "jpeg",
          quality: 90,
        });
      }
  } finally {
    await p.close();
  }
}
try {
  if (baseline) await sample("reference", baseline);
  await sample("deux-rives", null);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

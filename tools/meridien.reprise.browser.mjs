// Serve the repository, then run with the same Playwright settings as meridien.browser.mjs.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const { chromium: pw } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
    : "playwright"
);
import assert from "node:assert/strict";
const browser = await pw.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});
try {
  const p = await browser.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await p.goto(
    process.env.MERIDIEN_URL || "http://localhost:8000/game/meridien/",
  );
  const key = "meridien:progress:v2";
  await p.evaluate(async (key) => {
    const { freshProgress } = await import("./js/progress.mjs");
    const s = freshProgress();
    s.activeVehicle = "mistral";
    s.cash = 813;
    s.waypoint = { x: 650, z: 58, label: "Repère personnel" };
    s.tracking = "custom";
    localStorage.setItem(key, JSON.stringify(s));
  }, key);
  await p.reload();
  await p.click("#start-game");
  await p.waitForSelector("#viewport canvas");
  await p.waitForSelector("#play-screen:visible");
  assert.equal(
    await p.locator("#viewport canvas.plan-canvas").count(),
    0,
    "La reprise normale utilise la 3D",
  );
  await p.reload();
  await p.addInitScript(() => {
    const f = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === "webgl2") throw Error("GPU désactivé");
      return f.call(this, type, ...args);
    };
  });
  await p.reload();
  await p.click("#start-plan");
  await p.waitForSelector("#viewport .plan-canvas");
  await p.click("#open-map");
  await p.getByRole("button",{name:"Zoomer",exact:true}).click();
  assert.equal(await p.locator('.atlas-controls output').textContent(),'×2');
  const map=p.locator('.map-surface'), box=await map.boundingBox();
  await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();
  await p.mouse.move(box.x+box.width/2+60,box.y+box.height/2+30,{steps:5});await p.mouse.up();
  assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).waypoint.label,key),'Repère personnel');
  await p.getByRole('button',{name:'Ma position',exact:true}).click();
  assert.equal(await p.locator('.atlas-controls output').textContent(),'×32');
  await p.getByRole('button',{name:'Vue entière',exact:true}).click();
  assert.equal(await p.locator('.atlas-controls output').textContent(),'×1');
  await p
    .getByRole("button", { name: "Terrain des Braises", exact: true })
    .click();
  const save = await p.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)),
    key,
  );
  assert.equal(save.cash, 813);
  assert.equal(save.activeVehicle, "mistral");
  assert.equal(save.waypoint.label, "Terrain des Braises");
  assert.deepEqual(errors, []);
  console.log("Reprise plan, carnet, navigation OK");
} finally {
  await browser.close();
}

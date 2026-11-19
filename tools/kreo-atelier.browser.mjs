// Serve the repository first. Optional: configure PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const moduleName = process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
  : 'playwright';
const { chromium } = await import(moduleName);
const origin = new URL(process.env.KREO_URL || 'http://localhost:8000/');
const samples = new URL('../editor/atelier/exemples/semaphore.kreo-asset.json', import.meta.url);
const sample = await readFile(samples, 'utf8');
const asset = JSON.parse(sample);
const tmp = await mkdtemp(join(tmpdir(), 'kreo-atelier-'));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args: process.env.WEBGL_SOFTWARE
    ? [
        '--disable-dev-shm-usage',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ]
    : [],
});
const errors = [];
const observe = (p) => {
  p.setDefaultTimeout(50000);
  p.on('pageerror', (error) => errors.push(error.stack));
  p.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
};
const url = (path) => new URL(path, origin).href;
const snapshot = (p) => p.evaluate(() => JSON.parse(KREO_EDITOR.serialize()));
const download = async (p, button, path) => {
  const result = p.waitForEvent('download');
  await p.locator(button).click({ noWaitAfter: true });
  const file = await result;
  await file.saveAs(path);
  return file.suggestedFilename();
};

function zipEntries(buffer) {
  // KREO stores these entries uncompressed. Read in memory; do not write arbitrary ZIP paths.
  const entries = new Map();
  for (let i = 0; i + 30 <= buffer.length && buffer.readUInt32LE(i) === 0x04034b50; ) {
    assert.equal(buffer.readUInt16LE(i + 8), 0);
    const bytes = buffer.readUInt32LE(i + 18),
      nameSize = buffer.readUInt16LE(i + 26);
    const name = buffer.toString('utf8', i + 30, i + 30 + nameSize);
    const start = i + 30 + nameSize + buffer.readUInt16LE(i + 28);
    entries.set(name, buffer.subarray(start, start + bytes));
    i = start + bytes;
  }
  return entries;
}

async function checkRuntime(page, getter) {
  await page.waitForFunction((kind) => {
    const rt = kind === 'offline' ? window.KREO_RUNTIME : window.KREO_EDITOR.runtime;
    return rt?.running && rt.assemblyTime > 0.24;
  }, getter);
  const result = await page.evaluate((kind) => {
    const rt = kind === 'offline' ? KREO_RUNTIME : KREO_EDITOR.runtime;
    const named = (name) => [...rt.entities.values()].find((rec) => rec.def.name === name);
    const spinner = named('Tête tournante'),
      vane = named('Volet rouge');
    const base = named('Socle chanfreiné'),
      root = named('Sémaphore des Marées');
    const by = (p) => p.getWorldPosition(new rt.THREE.Vector3());
    const relative = by(named('Berceau de la lanterne').root).sub(by(root.root)).toArray();
    return {
      playing: rt.running,
      parented: vane.root.parent === spinner.root && spinner.root.parent === root.root,
      rotation: spinner.root.rotation.y,
      time: rt.assemblyTime,
      clips: rt.assemblyClips.length,
      relative: relative.map((v) => Math.round(v * 1000) / 1000),
      solid: rt.world.boxes.some((box) => box.tag === base.id),
      movingSolid: rt.world.boxes.some((box) => box.tag === vane.id || box.tag === spinner.id),
    };
  }, getter);
  assert.ok(result.playing && result.parented && result.solid && !result.movingSolid);
  assert.equal(result.clips, 2);
  assert.deepEqual(result.relative, [0, 2.92, 0]);
  assert.ok(Math.abs(result.rotation - ((result.time % 12) / 12) * Math.PI * 2) < 0.001);
}

async function checkAtelier() {
  const context = await browser.newContext({
    viewport: { width: 1210, height: 810 },
    locale: 'fr-FR',
    acceptDownloads: true,
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  observe(page);
  try {
    await page.goto(url('editor/'));
    await page.waitForFunction(() => window.KREO_EDITOR?.objects.length > 3);
    await page.locator('#langToggle').click();
    assert.equal(await page.locator('#btnArena strong').innerText(), 'Connect to Arena');
    await page.locator('#langToggle').click();
    assert.equal(await page.locator('#btnArena strong').innerText(), 'Connexion à Arena');
    const privateName = 'Bloc atelier privé';
    const cubeId = await page.evaluate(
      (name) => KREO_EDITOR.add('cube', { name, position: [10, 2, 4] }),
      privateName,
    );
    await page.evaluate((id) => KREO_EDITOR.select(id), cubeId);
    const before = await snapshot(page);
    const bad = { ...asset, objects: [{ ...asset.objects[0], script: 'non pris en charge' }] };
    await page.locator('#btnArena').focus();
    await page.keyboard.press('Space');
    await page.getByRole('dialog', { name: 'Atelier Arena' }).waitFor();
    const prompt = page.locator('#atelierPrompt');
    assert.ok((await prompt.inputValue()).includes(url('editor/atelier/#protocole')));
    assert.ok(!(await prompt.inputValue()).includes(privateName));
    await page.locator('#atelierBrief').fill('Crée un sémaphore pour le quai.');
    await page.locator('#atelierScope').selectOption('selection');
    assert.ok((await prompt.inputValue()).includes(privateName));
    const briefFile = join(tmp, 'request.json');
    assert.equal(await download(page, '#atelierRequest', briefFile), 'brief.kreo-request.json');
    const request = JSON.parse(await readFile(briefFile, 'utf8'));
    assert.equal(request.format, 'kreo.request');
    assert.equal(request.context.objects[0].name, privateName);
    assert.deepEqual(request.context.objects[0].world, [10, 2, 4]);
    await page.locator('#atelierScope').selectOption('none');
    await page.locator('#atelierCopy').click();
    await page.waitForFunction(() => document.querySelector('#atelierCopyHint').textContent.length);
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      await prompt.inputValue(),
    );
    await page.locator('#atelierResponse').fill(JSON.stringify(bad));
    await page.locator('#atelierValidate').click();
    assert.match(await page.locator('#atelierValidation').textContent(), /interdit.*script/);
    assert.ok(await page.locator('#atelierInsert').isDisabled());
    assert.deepEqual((await snapshot(page)).objects, before.objects);

    await page.locator('#atelierFile').setInputFiles(fileURLToPath(samples));
    await page.locator('#atelierSummary').waitFor();
    assert.ok(await page.locator('#atelierPlay').isEnabled());
    const canvas = page.locator('#atelierStage canvas');
    await canvas.waitFor();
    const still = await canvas.screenshot();
    const slider = page.locator('#atelierTime');
    await slider.focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    await slider.fill('3.75');
    assert.ok(Math.abs(Number(await slider.inputValue()) - 3.75) < 0.02);
    assert.notDeepEqual(await canvas.screenshot(), still, 'scrubbing changes the rendered pose');
    await page.locator('#atelierPlay').click();
    await page.waitForFunction(() => Number(document.querySelector('#atelierTime').value) > 3.85);
    await page.locator('#atelierPlay').click();
    assert.deepEqual((await snapshot(page)).objects, before.objects);
    await page.locator('#atelierInsert').click();
    await page.locator('#arenaStudio').waitFor({ state: 'hidden' });
    const inserted = await snapshot(page);
    const selected = await page.evaluate(() => KREO_EDITOR.selected);
    const count = before.objects.length + asset.objects.length + 1;
    assert.equal(inserted.objects.length, count);
    assert.equal(inserted.objects.find((o) => o.id === selected).name, asset.name);
    assert.ok(inserted.objects.filter((o) => o.motion).every((o) => o.parent === selected));
    assert.deepEqual(inserted.objects.slice(0, before.objects.length), before.objects);
    await page.keyboard.press('Control+z');
    assert.deepEqual((await snapshot(page)).objects, before.objects);
    await page.keyboard.press('Control+Shift+z');
    assert.deepEqual((await snapshot(page)).objects, inserted.objects);

    // Duplicating the inserted root preserves animated pivots with fresh identifiers.
    await page.evaluate((id) => KREO_EDITOR.select(id), selected);
    await page.keyboard.press('Control+d');
    const copied = await snapshot(page);
    assert.equal(copied.objects.length, count + asset.objects.length + 1);
    assert.equal(new Set(copied.objects.map((o) => o.id)).size, copied.objects.length);
    assert.equal(copied.objects.filter((o) => o.motion).length, 4);
    await page.keyboard.press('Control+z');

    // Change a child's local position and hide a sibling. Both must survive Play and reload.
    const pointer = inserted.objects.find((o) => o.name === 'Flèche du niveau');
    const trappe = inserted.objects.find((o) => o.name === 'Trappe de service');
    await page.evaluate((id) => KREO_EDITOR.select(id), pointer.id);
    await page.locator('#inPX').fill('0.032');
    await page.locator('#inPX').press('Tab');
    await page.evaluate((id) => KREO_EDITOR.select(id), trappe.id);
    await page.locator('#inspectorObj .switch:has(#inVisible)').click();
    assert.ok(!(await page.locator('#inVisible').isChecked()));
    await page.locator('#btnSave').click();
    const edited = await snapshot(page);
    assert.equal(edited.objects.find((o) => o.id === pointer.id).parentOffset[0], 0.032);
    await page.reload();
    await page.waitForFunction((n) => KREO_EDITOR.objects.length === n, count);
    assert.deepEqual((await snapshot(page)).objects, edited.objects);
    await page.locator('#btnPlay').click({ noWaitAfter: true });
    await page.locator('#hud').waitFor();
    await checkRuntime(page, 'editor');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !KREO_EDITOR.playing);
    assert.deepEqual((await snapshot(page)).objects, edited.objects);
    console.log(
      '✓ Atelier : prompt et brief, partage optionnel, fichier et rejet sans modification, scrubbing, ajout, duplication/undo, édition et Play après rechargement',
    );

    const html = join(tmp, 'jeu.html'),
      zip = join(tmp, 'jeu.zip'),
      folder = join(tmp, 'dossier.html');
    await download(page, '#btnExportGame', html);
    await download(page, '#btnExportFolder', zip);
    const decoded = zipEntries(await readFile(zip));
    assert.deepEqual(JSON.parse(decoded.get('project.json').toString()).objects, edited.objects);
    await writeFile(folder, decoded.get('index.html'));
    await page.close();
    await context.setOffline(true);
    for (const path of [html, folder]) {
      const offline = await context.newPage();
      observe(offline);
      await offline.setViewportSize({ width: 800, height: 560 });
      const requests = [];
      offline.on('request', (r) => {
        if (/^https?:/.test(r.url())) requests.push(r.url());
      });
      await offline.goto(pathToFileURL(path).href);
      await offline.waitForFunction(() => !!window.KREO_RUNTIME);
      await offline.locator('#btnStart').click({ noWaitAfter: true });
      await checkRuntime(offline, 'offline');
      assert.deepEqual(requests, []);
      await offline.close();
    }
    console.log('✓ Les animations jouent dans le HTML autonome et le ZIP extraits, sans HTTP');
  } finally {
    await context.close();
  }
}

async function checkLanding() {
  const desktop = await browser.newPage({
    viewport: { width: 1220, height: 674 },
    locale: 'fr-FR',
    reducedMotion: 'reduce',
  });
  observe(desktop);
  const playable = ['meridien/', 'course/', 'fps/'];
  try {
    await desktop.goto(url(''));
    assert.equal(await desktop.title(), 'KREO — Crée ton jeu directement dans ton navigateur');
    assert.deepEqual(
      await desktop
        .locator('.demo-link')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href'))),
      playable.map((name) => `game/${name}`),
    );
    await desktop.locator('.hero-demos').click();
    await desktop.waitForURL('**/#showcase');
    await desktop.locator('#langToggle').click();
    assert.equal(await desktop.locator('#showcase-title').innerText(), 'Playable demos.');
    assert.equal(
      await desktop.getByRole('link', { name: 'Play KREO Racing', exact: true }).count(),
      1,
    );
    await desktop.locator('#langToggle').click();
    for (const [i, start] of ['#start-game', '#btnStart', '#btnPlay'].entries()) {
      const key = playable[i];
      if (i === 1) {
        // Avoid waiting for 3 seconds of simulated time at software-rendered FPS.
        await desktop.route('**/game/course/js/main.js*', async (route) => {
          const response = await route.fetch();
          await route.fulfill({
            response,
            body:
              (await response.text()) +
              `
            window.raceForTest = () => race;
            window.roadFacesUp = () => {
              const road = track.group.getObjectByName('Chaussée · Coteaux');
              road.updateWorldMatrix(true, false);
              const origin = track.samples[150].pos.clone();
              origin.y += 3;
              const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0));
              return ray.intersectObject(road)[0]?.face.normal.y > 0.8;
            };
          `,
          });
        });
      }
      await desktop.locator(`.demo-link[href="game/${key}"]`).click();
      await desktop.waitForURL(url(`game/${key}`));
      await desktop.locator(start).click({ noWaitAfter: true });
      if (i === 0) await desktop.locator('#play-screen #viewport canvas').waitFor();
      else if (i === 1) {
        await desktop.locator('#hud').waitFor();
        await desktop.keyboard.down('ArrowUp');
        const race = await desktop.evaluate(() => {
          const race = raceForTest(),
            throttle = race.input.throttle;
          for (let i = 0; i < 265; i++) race.update(1 / 60);
          return { throttle, speed: race.speed, state: race.state };
        });
        await desktop.keyboard.up('ArrowUp');
        assert.equal(race.state, 'racing');
        assert.equal(race.throttle, 1);
        assert.ok(race.speed > 8);
        assert.equal(await desktop.evaluate(() => roadFacesUp()), true);
      } else {
        await desktop.locator('#hud').waitFor();
        await desktop.waitForFunction(() => window.KREO?.enemies.aliveCount() > 0);
        assert.equal(await desktop.locator('#hudWave').innerText(), '1');
      }
      await desktop.goto(url('#showcase'));
    }
    const art = await desktop
      .locator('.demo-image img')
      .evaluateAll(async (images) =>
        Promise.all(images.map((img) => img.decode().then(() => img.naturalWidth))),
      );
    assert.ok(art.every((w) => w >= 900));
  } finally {
    await desktop.close();
  }

  const phone = await browser.newPage({
    viewport: { width: 360, height: 760 },
    isMobile: true,
    hasTouch: true,
    locale: 'fr-FR',
    reducedMotion: 'reduce',
  });
  observe(phone);
  try {
    await phone.goto(url(''));
    await phone.locator('#burger').tap();
    assert.equal(await phone.locator('#burger').getAttribute('aria-expanded'), 'true');
    await phone.locator('#mobileMenu a[href="#showcase"]').tap();
    await phone.waitForURL('**/#showcase');
    assert.equal(await phone.locator('#burger').getAttribute('aria-expanded'), 'false');
    const layout = await phone.locator('.demo-link').evaluateAll((links) =>
      links.map((a) => {
        const r = a.getBoundingClientRect(),
          cta = a.querySelector('.demo-play').getBoundingClientRect();
        return { x: r.x, right: r.right, width: innerWidth, cta: cta.height };
      }),
    );
    assert.ok(layout.every((r) => r.x >= 0 && r.right <= r.width && r.cta >= 44));
    assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await phone.locator('.atelier-banner .btn').tap();
    await phone.locator('#atelierSummary').waitFor();
    assert.ok(await phone.locator('#atelierInsert').isEnabled());
    const shell = await phone
      .locator('#arenaStudio')
      .evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(shell.scroll <= shell.width + 2, JSON.stringify(shell));
  } finally {
    await phone.close();
  }
  console.log(
    '✓ Landing FR/EN et tactile, trois liens lancent les jeux, chaussée de Racing visible, essai de l’Atelier sur mobile',
  );
}

try {
  if (process.env.KREO_TEST_PART !== 'landing') await checkAtelier();
  if (process.env.KREO_TEST_PART !== 'atelier') await checkLanding();
  assert.deepEqual(errors, []);
} finally {
  if (errors.length) console.error(errors.join('\n'));
  await browser.close();
  await rm(tmp, { recursive: true, force: true });
}

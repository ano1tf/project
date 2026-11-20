/* Portail Méridien — logique du tableau de bord machine. */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const api = {
  get: (path) => fetch(path).then((r) => r.json()),
  post: (path, body) =>
    fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json()),
};

const fmtSize = (bytes) => {
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} Mio`;
  if (bytes > 1e3) return `${(bytes / 1e3).toFixed(0)} Kio`;
  return `${bytes} o`;
};

/* ---------------- Onglets ---------------- */
function initTabs() {
  $$('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab').forEach((b) => b.classList.toggle('is-active', b === btn));
      $$('.panel').forEach((p) => p.classList.toggle('is-active', p.id === `tab-${btn.dataset.tab}`));
    });
  });
}

/* ---------------- État machine ---------------- */
async function loadStatus() {
  try {
    const s = await api.get('/api/status');
    const git = s.git || {};
    const chips = [
      `<span class="chip chip-ok">machine · ${s.machine}</span>`,
      `<span class="chip ${git.dirty ? 'chip-wait' : 'chip-ok'}">git · ${git.branch}@${git.commit}${git.dirty ? ' *' : ''}</span>`,
      `<span class="chip chip-ok">disque libre · ${s.disk.free_go} Go</span>`,
      `<span class="chip chip-wait">Triple 3D · en attente</span>`,
    ];
    $('#status-chips').innerHTML = chips.join('');
    $('#footer-status').textContent = `dernier relevé : ${new Date(s.now).toLocaleTimeString('fr-FR')}`;

    $('#machine-stats').innerHTML = [
      ['Machine', s.machine],
      ['Branche', `${git.branch} @ ${git.commit}${git.dirty ? ' · modifications locales' : ''}`],
      ['Espace de travail', `${s.workspace_mo} Mio`],
      ['Disque libre', `${s.disk.free_go} Go / ${s.disk.total_go} Go`],
      ['Plateforme', `${s.platform} · Python ${s.python}`],
      ['Heure machine', new Date(s.now).toLocaleString('fr-FR')],
    ]
      .map(
        ([label, value]) =>
          `<div class="stat"><span class="stat-value">${value}</span><span class="stat-label">${label}</span></div>`
      )
      .join('');
  } catch {
    $('#status-chips').innerHTML = '<span class="chip chip-wait">serveur injoignable</span>';
  }
}

/* ---------------- Commandes ---------------- */
const KIND_LABELS = {
  photo: 'photo',
  modele: 'modèle 3D',
  decors: 'décors',
  vehicule: 'véhicule',
  personnage: 'personnage',
  autre: 'autre',
};

async function loadRequests() {
  try {
    const { items } = await api.get('/api/requests');
    const list = $('#request-list');
    if (!items.length) {
      list.innerHTML = '<p class="muted">Aucune commande pour l’instant. La boîte est ouverte.</p>';
      return;
    }
    list.innerHTML = items
      .map((r) => {
        const badge = r.kind === 'photo' ? 'badge-photo' : 'badge-modele';
        const prio = r.priority === 'haute' ? '<span class="badge badge-haute">haute</span>' : '';
        return `
          <article class="card">
            <h4>${escapeHtml(r.title)}</h4>
            <p>${escapeHtml(r.details || '—')}</p>
            <div class="card-meta">
              <span class="badge ${badge}">${KIND_LABELS[r.kind] || r.kind}</span>
              ${prio}
              <span>${escapeHtml(r.status || 'en attente')}</span>
              <span>${new Date(r.received).toLocaleString('fr-FR')}</span>
              <span class="mono">${escapeHtml(r.id || '')}</span>
            </div>
          </article>`;
      })
      .join('');
  } catch {
    $('#request-list').innerHTML = '<p class="muted">Impossible de lire la boîte à commandes.</p>';
  }
}

function initForm() {
  const form = $('#request-form');
  const note = $('#form-note');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    note.classList.remove('is-error');
    note.textContent = 'Dépôt en cours…';
    const data = new FormData(form);
    const res = await api.post('/api/request', {
      kind: data.get('kind'),
      title: data.get('title'),
      details: data.get('details'),
      priority: data.get('priority'),
    });
    if (res.error) {
      note.classList.add('is-error');
      note.textContent = res.error;
      return;
    }
    note.textContent = `Commande déposée : ${res.request.title} — je m’en occupe.`;
    form.reset();
    loadRequests();
    loadJournal();
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

/* ---------------- Galerie ---------------- */
let galleryItems = [];
let galleryFilter = 'tous';

async function loadGalerie() {
  try {
    const { items } = await api.get('/api/galerie');
    galleryItems = items;
    renderGalerie();
  } catch {
    $('#gallery-grid').innerHTML = '<p class="muted">Galerie injoignable.</p>';
  }
  try {
    const { items } = await api.get('/api/assets3d');
    $('#assets3d-list').innerHTML = items.length
      ? items
          .map(
            (it) => `
        <article class="card">
          <h4>${escapeHtml(it.name)}</h4>
          <div class="card-meta">
            <span class="badge badge-modele">${it.kind === 'lot-kreo' ? 'lot Kreo' : 'maillage'}</span>
            <span>${fmtSize(it.size)}</span>
            <span class="mono">${escapeHtml(it.path)}</span>
          </div>
        </article>`
          )
          .join('')
      : '<p class="muted">Aucun maillage pour l’instant — les modèles Triple 3D apparaîtront ici.</p>';
  } catch {
    $('#assets3d-list').innerHTML = '<p class="muted">Inventaire injoignable.</p>';
  }
}

function renderGalerie() {
  const grid = $('#gallery-grid');
  const items = galleryItems.filter((it) => galleryFilter === 'tous' || it.kind === galleryFilter);
  if (!items.length) {
    grid.innerHTML = '<p class="muted">Rien à montrer dans ce filtre.</p>';
    return;
  }
  grid.innerHTML = items
    .map((it, idx) => {
      const realIdx = galleryItems.indexOf(it);
      const preview =
        it.kind === 'image'
          ? `<img src="/${it.path}" alt="${escapeHtml(it.name)}" loading="lazy" />`
          : `<div class="tile-model"><span>3D</span><span class="mono" style="font-size:11px">${escapeHtml(it.ext)}</span></div>`;
      return `
        <figure class="tile" data-idx="${realIdx}">
          ${preview}
          <figcaption class="tile-body">
            <p>${escapeHtml(it.name)}</p>
            <span class="tile-tag">${escapeHtml(it.source)} · ${fmtSize(it.size)}</span>
          </figcaption>
        </figure>`;
    })
    .join('');
  $$('.tile', grid).forEach((tile) => {
    tile.addEventListener('click', () => openGalleryItem(galleryItems[Number(tile.dataset.idx)]));
  });
}

function initGalleryFilters() {
  $$('#gallery-filters .chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('#gallery-filters .chip-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      galleryFilter = btn.dataset.filter;
      renderGalerie();
    });
  });
}

function openGalleryItem(item) {
  if (!item) return;
  if (item.kind === 'image') {
    $('#modal-image-src').src = `/${item.path}`;
    $('#modal-image-src').alt = item.name;
    $('#modal-image-title').textContent = item.path;
    $('#modal-image-note').textContent =
      item.source === 'galerie' ? 'Illustration générée par la machine — indiquée comme telle.' : 'Visuel du dépôt.';
    openModal('#modal-image');
  } else {
    openViewer(item);
  }
}

/* ---------------- Visionneuse 3D ---------------- */
let viewer = null;

async function openViewer(item) {
  openModal('#modal-viewer');
  $('#viewer-title').textContent = item.path;
  // Canvas neuf à chaque ouverture : un contexte WebGL ne se recycle pas proprement.
  const stale = $('#viewer-canvas');
  const canvas = stale.cloneNode(false);
  stale.replaceWith(canvas);
  try {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');

    if (viewer) viewer.dispose();
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 420;
    renderer.setSize(w, h, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.05, 200);
    camera.position.set(2.6, 1.8, 3.2);

    const hemi = new THREE.HemisphereLight(0x9db8c9, 0x1a2631, 1.1);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe2b8, 1.4);
    key.position.set(4, 6, 3);
    scene.add(key);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(`/${item.path}`);
    const model = gltf.scene;
    scene.add(model);

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.9 || 2;
    model.position.sub(center);
    controls.target.set(0, 0, 0);
    camera.position.set(radius * 1.4, radius, radius * 1.6);
    camera.far = radius * 20;
    camera.updateProjectionMatrix();
    controls.update();

    const grid = new THREE.GridHelper(radius * 4, 24, 0x2c3d4d, 0x1b2833);
    grid.position.y = box.min.y - center.y - 0.001;
    scene.add(grid);

    let alive = true;
    const loop = () => {
      if (!alive) return;
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    loop();

    viewer = {
      dispose() {
        alive = false;
        renderer.dispose();
      },
    };
  } catch (err) {
    $('#viewer-title').textContent = `Impossible de charger le modèle : ${err.message}`;
  }
}

/* ---------------- Modales ---------------- */
function openModal(sel) {
  $(sel).hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModals() {
  $$('.modal').forEach((m) => (m.hidden = true));
  document.body.style.overflow = '';
  if (viewer) {
    viewer.dispose();
    viewer = null;
  }
}

function initModals() {
  $$('.modal').forEach((modal) => {
    modal.addEventListener('click', (ev) => {
      if (ev.target === modal || ev.target.hasAttribute('data-close')) closeModals();
    });
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeModals();
  });
}

/* ---------------- Arbre de fichiers ---------------- */
function renderTreeNode(node) {
  if (node.type === 'dir') {
    const kids = (node.children || []).map(renderTreeNode).join('');
    return `<li><details><summary class="dir-name">${escapeHtml(node.name)}/</summary><ul>${kids}</ul></details></li>`;
  }
    return `<li><span class="file-link" data-path="${escapeAttr(node.path)}">${escapeHtml(node.name)}</span></li>`;
}

async function loadTree() {
  try {
    const { tree } = await api.get('/api/tree');
    $('#file-tree').innerHTML = `<ul>${tree.map(renderTreeNode).join('')}</ul>`;
    $$('#file-tree .file-link').forEach((link) => {
      link.addEventListener('click', () => loadFile(link.dataset.path));
    });
  } catch {
    $('#file-tree').innerHTML = '<p class="muted">Arborescence injoignable.</p>';
  }
}

async function loadFile(path) {
  $('#file-view-path').textContent = path;
  $('#file-view-content').textContent = 'Lecture…';
  try {
    const res = await api.get(`/api/file?path=${encodeURIComponent(path)}`);
    if (res.error) {
      $('#file-view-content').textContent = res.error;
      return;
    }
    $('#file-view-content').textContent = res.content;
  } catch {
    $('#file-view-content').textContent = 'Lecture impossible.';
  }
}

/* ---------------- Journal ---------------- */
async function loadJournal() {
  try {
    const { lines } = await api.get('/api/journal?n=220');
    $('#journal').textContent = lines.join('\n') || 'Journal vide.';
    $('#journal').scrollTop = $('#journal').scrollHeight;
  } catch {
    $('#journal').textContent = 'Journal injoignable.';
  }
}

/* ---------------- Démarrage ---------------- */
function start() {
  initTabs();
  initForm();
  initGalleryFilters();
  initModals();
  loadStatus();
  loadRequests();
  loadGalerie();
  loadTree();
  loadJournal();
  setInterval(loadStatus, 15000);
  setInterval(loadJournal, 20000);
  setInterval(loadRequests, 30000);
}

start();

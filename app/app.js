/* ============================================================
   KREO — Espace créateur (app.js)
   Interactions : vues, projets, modales, toasts, thème, langue,
   notifications, import/export réels.
   ============================================================ */
(function () {
  'use strict';

  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const t = (k) => (window.kreoT ? window.kreoT(k) : k);

  /* ---------------- Données projets (perso) ---------------- */
  const projects = [
    { id: 'sky', title: 'Sky Runner', img: '../assets/showcase/sky-runner.jpg', status: 'published', plays: 842, likes: 120, updatedKey: 'app.t1' },
    { id: 'neon', title: 'Neon Drift', img: '../assets/showcase/neon-drift.jpg', status: 'published', plays: 531, likes: 96, updatedKey: 'app.t2' },
    { id: 'ile', title: "L'Île aux Cristaux", img: '../assets/showcase/ile-cristaux.jpg', status: 'published', plays: 1204, likes: 201, updatedKey: 'app.t3' },
    { id: 'nova', title: 'Nova Strike', img: '../assets/showcase/nova-strike.jpg', status: 'draft', plays: 128, likes: 34, updatedKey: 'app.t4' },
    { id: 'flottant', title: 'Monde Flottant', img: '../assets/showcase/monde-flottant.jpg', status: 'published', plays: 663, likes: 88, updatedKey: 'app.t4' },
    { id: 'dungeon', title: 'Dungeon Dash', img: '../assets/showcase/dungeon-dash.jpg', status: 'draft', plays: 47, likes: 12, updatedKey: 'app.justNow' }
  ];

  const TPL_IMG = {
    blank: '../assets/showcase/monde-flottant.jpg',
    platform: '../assets/showcase/sky-runner.jpg',
    arcade: '../assets/showcase/nova-strike.jpg',
    puzzle: '../assets/showcase/ile-cristaux.jpg',
    treasure: '../assets/showcase/dungeon-dash.jpg',
    race: '../assets/showcase/neon-drift.jpg'
  };

  let filter = 'all';
  let query = '';
  let currentProjectId = null;
  let newTpl = 'blank';

  /* ---------------- Toasts ---------------- */
  function toast(key, icon) {
    const box = $('#toastContainer');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<div class="t-ico">' + (icon || '✨') + '</div><span></span>';
    el.querySelector('span').textContent = typeof key === 'string' && key.indexOf('app.') === 0 ? t(key) : key;
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 260);
    }, 3200);
  }

  /* ---------------- Routeur de vues ---------------- */
  function setView(name) {
    $$('.view').forEach(function (v) { v.classList.remove('active'); });
    const view = $('#view-' + name);
    if (view) view.classList.add('active');
    $$('.nav-item').forEach(function (n) {
      n.classList.toggle('active', n.getAttribute('data-view') === name);
    });
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('#notifPanel').classList.remove('open');
  }

  $$('.nav-item').forEach(function (n) {
    n.addEventListener('click', function (e) {
      e.preventDefault();
      setView(n.getAttribute('data-view'));
    });
  });

  $('#seeAllBtn').addEventListener('click', function () { setView('games'); });
  $('#userChip').addEventListener('click', function () { setView('settings'); });
  $('#continueCard').addEventListener('click', function () { location.href = '../editor/'; });

  /* ---------------- Rendu des projets ---------------- */
  function cardHTML(p) {
    const statusLabel = p.status === 'published' ? t('app.published') : t('app.draft');
    const statusClass = p.status === 'published' ? 'pub' : 'draft';
    return (
      '<div class="p-card" data-id="' + p.id + '">' +
        '<div class="p-media">' +
          '<img src="' + p.img + '" alt="' + p.title + '">' +
          '<span class="chip ' + statusClass + '">' + statusLabel + '</span>' +
        '</div>' +
        '<div class="p-info">' +
          '<h3>' + p.title + '</h3>' +
          '<div class="p-meta">' +
            '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 5.5v13l10-6.5z"/></svg> ' + p.plays + '</span>' +
            '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.6-9.2-9C1.3 8 2.8 4.8 6.2 4.8c2 0 3.3 1.2 4.1 2.4l1.7 2 1.7-2c.8-1.2 2.1-2.4 4.1-2.4 3.4 0 4.9 3.2 3.4 6.2C19 15.4 12 20 12 20z"/></svg> ' + p.likes + '</span>' +
            '<span>' + t(p.updatedKey) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function newCardHTML() {
    return (
      '<a class="p-new js-new">' +
        '<div class="plus">+</div>' +
        '<b>' + t('app.newCard') + '</b>' +
        '<span>' + t('app.newCardSub') + '</span>' +
      '</a>'
    );
  }

  function renderProjects() {
    // Accueil : 3 premiers + carte nouvelle
    $('#homeProjects').innerHTML = projects.slice(0, 3).map(cardHTML).join('') + newCardHTML();

    // Mes jeux : filtre + recherche
    const list = projects.filter(function (p) {
      const okFilter = filter === 'all' || p.status === filter;
      const okQuery = !query || p.title.toLowerCase().indexOf(query.toLowerCase()) !== -1;
      return okFilter && okQuery;
    });
    const grid = $('#gamesGrid');
    if (list.length === 0) {
      grid.innerHTML = '<div class="p-new" style="cursor:default"><div class="plus">?</div><b>' + t('app.noResults') + '</b></div>';
    } else {
      grid.innerHTML = list.map(cardHTML).join('') + newCardHTML();
    }
    bindCards();
  }

  function bindCards() {
    $$('.p-card').forEach(function (c) {
      c.addEventListener('click', function () { openProject(c.getAttribute('data-id')); });
    });
    $$('.js-new').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); openModal('#modalNew'); });
    });
    $$('.js-import').forEach(function (b) {
      b.addEventListener('click', function () { openModal('#modalImport'); });
    });
  }

  /* ---------------- Modales ---------------- */
  function openModal(sel) {
    $(sel).classList.add('open');
  }
  function closeModal(sel) {
    $(sel).classList.remove('open');
  }
  $$('.modal-backdrop').forEach(function (bd) {
    bd.addEventListener('click', function (e) {
      if (e.target === bd || e.target.hasAttribute('data-close')) bd.classList.remove('open');
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') $$('.modal-backdrop.open').forEach(function (m) { m.classList.remove('open'); });
  });

  /* --------- Nouveau projet --------- */
  $$('#newTplChips .tpl-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      $$('#newTplChips .tpl-chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      newTpl = chip.getAttribute('data-tpl');
    });
  });

  $('#btnCreate').addEventListener('click', function () {
    const name = $('#newName').value.trim() || 'Sans titre';
    projects.unshift({
      id: 'p' + Date.now(),
      title: name,
      img: TPL_IMG[newTpl] || TPL_IMG.blank,
      status: 'draft',
      plays: 0,
      likes: 0,
      updatedKey: 'app.justNow'
    });
    closeModal('#modalNew');
    $('#newName').value = '';
    renderProjects();
    toast('app.created', '🎉');
    setTimeout(function () { location.href = '../editor/'; }, 700);
  });

  /* --------- Import (réel) --------- */
  const dropZone = $('#dropZone');
  const fileInput = $('#fileInput');

  $('#btnChooseFile').addEventListener('click', function () { fileInput.click(); });
  dropZone.addEventListener('click', function () { fileInput.click(); });
  ['dragenter', 'dragover'].forEach(function (ev) {
    dropZone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropZone.classList.add('hover');
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropZone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropZone.classList.remove('hover');
    });
  });
  dropZone.addEventListener('drop', function (e) {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleImportFile(f);
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) handleImportFile(fileInput.files[0]);
    fileInput.value = '';
  });

  function handleImportFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(String(reader.result));
        if (data && Array.isArray(data.objects)) {
          localStorage.setItem('kreo-project3d', JSON.stringify(data));
          localStorage.setItem('kreo-autosave3d', JSON.stringify(data));
          closeModal('#modalImport');
          toast('app.importOk', '✅');
          setTimeout(function () { location.href = '../editor/'; }, 700);
        } else {
          toast('app.importKo', '⚠️');
        }
      } catch (err) {
        toast('app.importKo', '⚠️');
      }
    };
    reader.readAsText(file);
  }

  /* --------- Fiche projet --------- */
  function openProject(id) {
    const p = projects.find(function (x) { return x.id === id; });
    if (!p) return;
    currentProjectId = id;
    $('#pjImg').src = p.img;
    $('#pjImg').alt = p.title;
    $('#pjTitle').textContent = p.title;
    $('#pjStatus').textContent = p.status === 'published' ? t('app.published') : t('app.draft');
    $('#pjUpdated').textContent = t(p.updatedKey);
    $('#pjPlays').textContent = p.plays;
    $('#pjLikes').textContent = p.likes;
    openModal('#modalProject');
  }

  $('#pjOpen').addEventListener('click', function () { location.href = '../editor/'; });
  $('#pjShare').addEventListener('click', function () {
    const link = 'https://kreo.app/j/' + currentProjectId;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () {
        toast('app.linkCopied', '🔗');
      }).catch(function () {
        toast('app.linkCopied', '🔗');
      });
    } else {
      toast('app.linkCopied', '🔗');
    }
  });
  $('#pjDelete').addEventListener('click', function () {
    const i = projects.findIndex(function (x) { return x.id === currentProjectId; });
    if (i !== -1) projects.splice(i, 1);
    closeModal('#modalProject');
    renderProjects();
    toast('app.deleted', '🗑️');
  });

  /* ---------------- Filtres + recherche ---------------- */
  $$('.filter-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      $$('.filter-chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      filter = chip.getAttribute('data-filter');
      renderProjects();
    });
  });
  $('#searchInput').addEventListener('input', function (e) {
    query = e.target.value || '';
    renderProjects();
  });

  /* ---------------- Modèles ---------------- */
  $$('.js-use-tpl').forEach(function (b) {
    b.addEventListener('click', function () {
      newTpl = b.getAttribute('data-tpl') || 'blank';
      openModal('#modalNew');
      $$('#newTplChips .tpl-chip').forEach(function (c) {
        c.classList.toggle('active', c.getAttribute('data-tpl') === newTpl);
      });
    });
  });

  /* ---------------- Discord ---------------- */
  $$('.js-discord').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      toast('app.discordSoon', '💬');
    });
  });

  /* ---------------- Notifications ---------------- */
  $('#bellBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    $('#notifPanel').classList.toggle('open');
  });
  document.addEventListener('click', function (e) {
    const panel = $('#notifPanel');
    if (panel.classList.contains('open') && !panel.contains(e.target)) panel.classList.remove('open');
  });

  /* ---------------- Thème ---------------- */
  const sunIcon = '<path d="M12 4v-2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4"/><circle cx="12" cy="12" r="4.2"/>';
  const moonIcon = '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 1 0 11 11z"/>';

  function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem('kreo-theme', mode);
    $('#themeIcon').innerHTML = mode === 'dark' ? moonIcon : sunIcon;
    $$('#segTheme button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-theme-set') === mode);
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', mode === 'dark' ? '#0A0A12' : '#F4F5F9');
  }

  $('#themeToggle').addEventListener('click', function () {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(cur);
    toast(cur === 'dark' ? 'app.dark' : 'app.light', '🎨');
  });
  $$('#segTheme button').forEach(function (b) {
    b.addEventListener('click', function () { applyTheme(b.getAttribute('data-theme-set')); });
  });

  /* ---------------- Langue ---------------- */
  $('#langToggle').addEventListener('click', function () {
    const next = window.kreoCurrentLang() === 'fr' ? 'en' : 'fr';
    window.kreoApplyLang(next);
    $('#langLabel').textContent = next.toUpperCase();
    $$('#segLang button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === next);
    });
  });
  $$('#segLang button').forEach(function (b) {
    b.addEventListener('click', function () {
      const lang = b.getAttribute('data-lang');
      window.kreoApplyLang(lang);
      $('#langLabel').textContent = lang.toUpperCase();
      $$('#segLang button').forEach(function (x) { x.classList.toggle('active', x === b); });
    });
  });

  /* ---------------- Export ---------------- */
  $('#btnExport').addEventListener('click', function () {
    const blob = new Blob([JSON.stringify({ app: 'kreo', version: 1, projects: projects }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kreo-mes-donnees.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('app.exported', '📦');
  });

  /* ---------------- Rendu dynamique (langue) ---------------- */
  window.addEventListener('kreo:app-render', function () {
    renderProjects();
    $('#langLabel').textContent = window.kreoCurrentLang().toUpperCase();
    $$('#segLang button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === window.kreoCurrentLang());
    });
    if (currentProjectId && $('#modalProject').classList.contains('open')) openProject(currentProjectId);
  });

  /* ---------------- Init ---------------- */
  applyTheme(localStorage.getItem('kreo-theme') || 'dark');
  $('#langLabel').textContent = window.kreoCurrentLang ? window.kreoCurrentLang().toUpperCase() : 'FR';
  renderProjects();

  const hash = (location.hash || '').replace('#', '');
  if (['home', 'games', 'models', 'settings'].indexOf(hash) !== -1) setView(hash);
})();

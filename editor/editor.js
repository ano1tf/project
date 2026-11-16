/* ============ KREO Editor v0 ============ */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const t = (k) => (window.kreoT ? window.kreoT(k) : k);

  /* ================= State ================= */
  const state = {
    project: { name: 'Mon jeu', objects: [], code: '' },
    selection: null,
    playing: false,
    runtime: null,
    score: 0,
    hooks: { onStart: null, onUpdate: null, onCollide: null },
    keys: {},
    dragging: null, // {mode:'move'|'resize', ox, oy}
  };

  let idCounter = 1;
  const uid = () => 'o' + (idCounter++);
  const snap = (v, alt) => (alt ? Math.round(v) : Math.round(v / 4) * 4);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ================= Canvas ================= */
  const canvas = $('#viewport');
  const ctx = canvas.getContext('2d');
  let CW = 1200, CH = 640;

  function resizeCanvas() {
    const r = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    CW = Math.max(600, r.width);
    CH = Math.max(320, r.height - 0);
    canvas.width = CW * dpr;
    canvas.height = CH * dpr;
    canvas.style.width = CW + 'px';
    canvas.style.height = CH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }
  window.addEventListener('resize', resizeCanvas);

  /* ================= Objects ================= */
  function defaultsFor(type) {
    const base = {
      id: uid(), type, name: type + '-' + idCounter,
      x: 120, y: 120, w: 90, h: 60, rot: 0,
      color: '#7F7CFF', behavior: 'none', speed: 2, solid: false,
    };
    if (type === 'rect') return Object.assign(base, { w: 120, h: 80, color: '#7F7CFF' });
    if (type === 'circle') return Object.assign(base, { w: 90, h: 90, color: '#22D3EE' });
    if (type === 'platform') return Object.assign(base, { w: 220, h: 26, color: '#8B5CF6', solid: true, name: 'plateforme-' + idCounter });
    if (type === 'player') return Object.assign(base, { w: 36, h: 46, color: '#3B82F6', behavior: 'player', solid: true, name: 'joueur' });
    if (type === 'coin') return Object.assign(base, { w: 28, h: 28, color: '#F59E0B', behavior: 'coin', name: 'piece-' + idCounter });
    if (type === 'enemy') return Object.assign(base, { w: 40, h: 40, color: '#EF4444', behavior: 'enemy', name: 'ennemi-' + idCounter });
    if (type === 'flag') return Object.assign(base, { w: 60, h: 90, color: '#4ADE80', behavior: 'flag', name: 'arrivee' });
    return base;
  }

  function addObject(type) {
    const o = defaultsFor(type);
    o.x = snap(CW / 2 - o.w / 2 + (Math.random() * 80 - 40), true);
    o.y = snap(CH / 2 - o.h / 2 + (Math.random() * 60 - 30), true);
    state.project.objects.push(o);
    select(o.id);
    refreshTree();
    markDirty();
  }

  function removeObject(id) {
    state.project.objects = state.project.objects.filter((o) => o.id !== id);
    if (state.selection === id) select(null);
    refreshTree();
    markDirty();
  }

  function getObj(id) { return state.project.objects.find((o) => o.id === id) || null; }
  function selected() { return getObj(state.selection); }

  /* ================= Rendering ================= */
  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawObject(o, isRuntime) {
    ctx.save();
    ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
    if (o.rot) ctx.rotate((o.rot * Math.PI) / 180);
    const x = -o.w / 2, y = -o.h / 2;

    if (o.hidden) { ctx.restore(); return; }

    switch (o.type) {
      case 'circle': {
        ctx.fillStyle = o.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'platform': {
        const g = ctx.createLinearGradient(0, y, 0, y + o.h);
        g.addColorStop(0, o.color);
        g.addColorStop(1, shade(o.color, -35));
        ctx.fillStyle = g;
        roundRect(ctx, x, y, o.w, o.h, 8);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.3)';
        roundRect(ctx, x + 8, y + 4, o.w - 16, 4, 2);
        ctx.fill();
        break;
      }
      case 'player': {
        const g = ctx.createLinearGradient(x, y, x, y + o.h);
        g.addColorStop(0, '#38BDF8');
        g.addColorStop(1, o.color);
        ctx.fillStyle = g;
        roundRect(ctx, x, y, o.w, o.h, 9);
        ctx.fill();
        ctx.fillStyle = '#fff';
        const ey = y + o.h * 0.28, es = Math.max(3, o.w * 0.13);
        ctx.beginPath(); ctx.ellipse(-o.w * 0.16, ey, es, es * 1.25, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(o.w * 0.16, ey, es, es * 1.25, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'coin': {
        const cx = 0, cy = 0, r = Math.min(o.w, o.h) / 2;
        const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.2, 0, 0, r);
        g.addColorStop(0, '#FDE68A');
        g.addColorStop(1, o.color);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(180,120,0,.5)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'enemy': {
        const r = Math.min(o.w, o.h) / 2;
        ctx.fillStyle = shade(o.color, -20);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + (isRuntime ? (performance.now() / 900) : 0);
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.22) * r * 0.85, Math.sin(a - 0.22) * r * 0.85);
          ctx.lineTo(Math.cos(a) * r * 1.32, Math.sin(a) * r * 1.32);
          ctx.lineTo(Math.cos(a + 0.22) * r * 0.85, Math.sin(a + 0.22) * r * 0.85);
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = o.color;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(-r * 0.32, -r * 0.12, r * 0.18, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(r * 0.32, -r * 0.12, r * 0.18, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.06, r * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.32, -r * 0.06, r * 0.09, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'flag': {
        ctx.fillStyle = '#D4D4DE';
        roundRect(ctx, x + o.w * 0.12, y, 5, o.h, 2.5);
        ctx.fill();
        ctx.fillStyle = o.color;
        ctx.beginPath();
        ctx.moveTo(x + o.w * 0.12 + 5, y + 4);
        ctx.lineTo(x + o.w * 0.95, y + o.h * 0.22);
        ctx.lineTo(x + o.w * 0.12 + 5, y + o.h * 0.42);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#D4D4DE';
        roundRect(ctx, x + o.w * 0.02, y + o.h - 8, o.w * 0.5, 8, 4);
        ctx.fill();
        break;
      }
      default: {
        ctx.fillStyle = o.color;
        roundRect(ctx, x, y, o.w, o.h, 8);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function shade(hex, amt) {
    try {
      const n = parseInt(hex.slice(1), 16);
      const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
      return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    } catch (e) { return hex; }
  }

  function render() {
    // background
    const g = ctx.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, '#0B0B16');
    g.addColorStop(1, '#0D0D1C');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,.045)';
    ctx.lineWidth = 1;
    for (let x = 0; x < CW; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke(); }
    for (let y = 0; y < CH; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke(); }

    // objects
    const objs = state.playing ? state.runtime : state.project.objects;
    objs.forEach((o) => drawObject(o, state.playing));

    // selection
    if (!state.playing && state.selection) {
      const o = selected();
      if (o) {
        ctx.save();
        ctx.strokeStyle = '#7F7CFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(o.x - 1, o.y - 1, o.w + 2, o.h + 2);
        ctx.fillStyle = '#7F7CFF';
        ctx.font = '500 11px Inter, sans-serif';
        ctx.fillText(o.name, o.x, o.y - 8);
        // resize handle
        ctx.fillRect(o.x + o.w - 5, o.y + o.h - 5, 10, 10);
        ctx.restore();
      }
    }
  }

  /* ================= Mouse / selection ================= */
  function mousePos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hitTest(px, py) {
    const objs = state.project.objects;
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h) return o;
    }
    return null;
  }

  function onResizeHandle(o, px, py) {
    return px >= o.x + o.w - 10 && px <= o.x + o.w + 6 && py >= o.y + o.h - 10 && py <= o.y + o.h + 6;
  }

  canvas.addEventListener('mousedown', (e) => {
    if (state.playing) return;
    const { x, y } = mousePos(e);
    const cur = selected();
    if (cur && onResizeHandle(cur, x, y)) {
      state.dragging = { mode: 'resize' };
      return;
    }
    const o = hitTest(x, y);
    if (o) {
      select(o.id);
      state.dragging = { mode: 'move', ox: x - o.x, oy: y - o.y };
    } else {
      select(null);
    }
    render();
  });

  window.addEventListener('mousemove', (e) => {
    if (state.playing || !state.dragging) return;
    const { x, y } = mousePos(e);
    const o = selected();
    if (!o) return;
    if (state.dragging.mode === 'move') {
      o.x = snap(x - state.dragging.ox, e.altKey);
      o.y = snap(y - state.dragging.oy, e.altKey);
    } else {
      o.w = Math.max(16, snap(x - o.x, e.altKey));
      o.h = Math.max(16, snap(y - o.y, e.altKey));
    }
    syncInspectorValues();
    render();
  });

  window.addEventListener('mouseup', () => {
    if (state.dragging) { state.dragging = null; markDirty(); }
  });

  /* ================= Keyboard ================= */
  window.addEventListener('keydown', (e) => {
    state.keys[e.key.toLowerCase()] = true;
    if (state.playing) {
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
      return;
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selection) { removeObject(state.selection); render(); }
    }
    const o = selected();
    if (o && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 1 : 8;
      if (e.key === 'ArrowLeft') o.x -= step;
      if (e.key === 'ArrowRight') o.x += step;
      if (e.key === 'ArrowUp') o.y -= step;
      if (e.key === 'ArrowDown') o.y += step;
      syncInspectorValues();
      render();
      markDirty();
    }
  });
  window.addEventListener('keyup', (e) => { state.keys[e.key.toLowerCase()] = false; });

  /* ================= Selection / inspector ================= */
  function select(id) {
    state.selection = id;
    document.querySelectorAll('#sceneTree li').forEach((li) => li.classList.toggle('active', li.dataset.id === id));
    const o = selected();
    $('#inspEmpty').style.display = o ? 'none' : 'block';
    $('#inspForm').style.display = o ? 'block' : 'none';
    if (o) syncInspectorValues();
    render();
  }

  function syncInspectorValues() {
    const o = selected();
    if (!o) return;
    $('#pName').value = o.name;
    $('#pX').value = Math.round(o.x);
    $('#pY').value = Math.round(o.y);
    $('#pW').value = Math.round(o.w);
    $('#pH').value = Math.round(o.h);
    $('#pRot').value = o.rot;
    $('#pColor').value = o.color;
    $('#pBehavior').value = o.behavior;
    $('#pSpeed').value = o.speed;
    $('#pSolid').checked = !!o.solid;
  }

  function bindInspector() {
    const map = {
      pName: (o, v) => { o.name = v; refreshTree(); },
      pX: (o, v) => { o.x = parseFloat(v) || 0; },
      pY: (o, v) => { o.y = parseFloat(v) || 0; },
      pW: (o, v) => { o.w = Math.max(16, parseFloat(v) || 16); },
      pH: (o, v) => { o.h = Math.max(16, parseFloat(v) || 16); },
      pRot: (o, v) => { o.rot = parseFloat(v) || 0; },
      pColor: (o, v) => { o.color = v; },
      pBehavior: (o, v) => { o.behavior = v; },
      pSpeed: (o, v) => { o.speed = Math.max(0.5, parseFloat(v) || 1); },
    };
    Object.keys(map).forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener('input', () => {
        const o = selected();
        if (!o) return;
        map[id](o, el.value);
        render();
        markDirty();
      });
    });
    $('#pSolid').addEventListener('change', (e) => {
      const o = selected();
      if (!o) return;
      o.solid = e.target.checked;
      markDirty();
    });
  }

  /* ================= Scene tree ================= */
  function refreshTree() {
    const ul = $('#sceneTree');
    ul.innerHTML = '';
    state.project.objects.forEach((o) => {
      const li = document.createElement('li');
      li.dataset.id = o.id;
      if (o.id === state.selection) li.classList.add('active');
      li.innerHTML = '<span class="li-dot" style="background:' + o.color + '"></span><span>' + escapeHtml(o.name) + '</span>';
      li.addEventListener('click', () => select(o.id));
      ul.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ================= Save / load ================= */
  function serialize() {
    return {
      version: 1,
      name: state.project.name,
      objects: state.project.objects,
      code: $('#codeBox').value,
    };
  }

  let dirtyTimer = null;
  function markDirty() {
    clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(() => {
      try { localStorage.setItem('kreo-autosave', JSON.stringify(serialize())); } catch (e) {}
    }, 400);
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function loadProject(data, silent) {
    if (!data || !Array.isArray(data.objects)) return false;
    state.project.name = data.name || 'Mon jeu';
    state.project.objects = data.objects.map((o) => Object.assign(defaultsFor(o.type || 'rect'), o, { id: o.id || uid() }));
    $('#projectName').value = state.project.name;
    $('#codeBox').value = data.code || t('ed.codeTemplate');
    idCounter = Date.now() % 100000;
    select(null);
    refreshTree();
    render();
    if (!silent) toast(t('ed.loaded'));
    return true;
  }

  $('#btnSave').addEventListener('click', () => {
    try {
      localStorage.setItem('kreo-project', JSON.stringify(serialize()));
      toast(t('ed.saved'));
    } catch (e) { toast('Error'); }
  });

  $('#btnLoad').addEventListener('click', () => {
    let data = null;
    try { data = JSON.parse(localStorage.getItem('kreo-project') || localStorage.getItem('kreo-autosave') || 'null'); } catch (e) {}
    if (data) loadProject(data);
    else toast('—');
  });

  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.project.name || 'jeu').replace(/\s+/g, '-') + '.kreo.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#btnImport').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { loadProject(JSON.parse(reader.result)); } catch (err) { toast('Error'); }
    };
    reader.readAsText(f);
    e.target.value = '';
  });

  $('#projectName').addEventListener('input', (e) => {
    state.project.name = e.target.value;
    markDirty();
  });

  /* ================= Tabs ================= */
  document.querySelectorAll('.ed-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ed-tab').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.ed-panel').forEach((x) => x.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.panel).classList.add('active');
    });
  });

  /* ================= Play mode ================= */
  const GRAV = 1800;
  let rafId = null, lastTime = 0, prevOverlaps = new Set();

  function buildSceneAPI() {
    return {
      objects: state.runtime,
      get score() { return state.score; },
      get player() { return state.runtime.find((o) => o.behavior === 'player') || null; },
      get(name) { return state.runtime.find((o) => o.name === name) || null; },
      message(txt) { toast(String(txt)); },
      addScore(n) { state.score += n; $('#hudScore').textContent = state.score; },
      win() { endPlay(true); },
      lose() { endPlay(false); },
    };
  }
  let sceneAPI = null;

  function compileHooks() {
    const code = $('#codeBox').value;
    $('#codeError').classList.remove('show');
    try {
      const factory = new Function(code + '\n;return {' +
        'onStart:typeof onStart==="function"?onStart:null,' +
        'onUpdate:typeof onUpdate==="function"?onUpdate:null,' +
        'onCollide:typeof onCollide==="function"?onCollide:null};');
      state.hooks = factory();
    } catch (err) {
      state.hooks = { onStart: null, onUpdate: null, onCollide: null };
      showCodeError(err);
    }
  }

  function showCodeError(err) {
    const box = $('#codeError');
    box.textContent = t('ed.error') + ' : ' + err.message;
    box.classList.add('show');
  }

  function startPlay() {
    if (state.playing) return;
    state.playing = true;
    state.score = 0;
    state.runtime = JSON.parse(JSON.stringify(state.project.objects)).map((o) => Object.assign(o, {
      vx: 0, vy: 0, grounded: false, hidden: false,
      spawnX: o.x, spawnY: o.y, dir: 1,
    }));
    prevOverlaps = new Set();
    $('#app').classList.add('playing');
    $('#playLabel').textContent = t('ed.stop');
    $('#hudScore').textContent = '0';
    $('#overlay').classList.remove('show');
    compileHooks();
    sceneAPI = buildSceneAPI();
    try { if (state.hooks.onStart) state.hooks.onStart(sceneAPI); } catch (err) { showCodeError(err); }
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function stopPlay() {
    state.playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    $('#app').classList.remove('playing');
    $('#playLabel').textContent = t('ed.play');
    $('#overlay').classList.remove('show');
    render();
  }

  function endPlay(won) {
    $('#overlayTitle').textContent = won ? t('ed.win') : t('ed.lose');
    $('#overlayText').textContent = won ? t('ed.score') + ' : ' + state.score : '';
    $('#overlay').classList.add('show');
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  $('#btnPlay').addEventListener('click', () => (state.playing ? stopPlay() : startPlay()));
  $('#btnRetry').addEventListener('click', () => { stopPlay(); startPlay(); });

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function loop(now) {
    if (!state.playing) return;
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    stepPhysics(dt);
    try { if (state.hooks.onUpdate) state.hooks.onUpdate(sceneAPI, dt); } catch (err) { showCodeError(err); }
    render();
    rafId = requestAnimationFrame(loop);
  }

  function stepPhysics(dt) {
    const objs = state.runtime;
    const solids = objs.filter((o) => o.solid && !o.hidden);
    const player = objs.find((o) => o.behavior === 'player');

    // player control + gravity
    objs.forEach((o) => {
      const hasGravity = o.behavior === 'player' || o.behavior === 'enemy';
      if (o.behavior === 'player') {
        const k = state.keys;
        const left = k['arrowleft'] || k['q'] || k['a'];
        const right = k['arrowright'] || k['d'];
        const jump = k[' '] || k['arrowup'] || k['w'] || k['z'];
        o.vx = (right ? 1 : 0) - (left ? 1 : 0);
        o.vx *= 230 * (o.speed || 1);
        if (jump && o.grounded) { o.vy = -720; o.grounded = false; }
      } else if (o.behavior === 'enemy') {
        o.x += o.dir * 60 * (o.speed || 1) * dt * 3;
        if (o.x > o.spawnX + 110) o.dir = -1;
        if (o.x < o.spawnX - 110) o.dir = 1;
      }

      if (hasGravity) {
        o.vy = Math.min(o.vy + GRAV * dt, 1400);
        // move X
        o.x += o.vx * dt;
        solids.forEach((s) => {
          if (s === o || s.hidden) return;
          if (aabb(o, s)) {
            if (o.vx > 0) o.x = s.x - o.w;
            else if (o.vx < 0) o.x = s.x + s.w;
            o.vx = 0;
          }
        });
        // move Y
        o.y += o.vy * dt;
        o.grounded = false;
        solids.forEach((s) => {
          if (s === o || s.hidden) return;
          if (aabb(o, s)) {
            if (o.vy > 0) { o.y = s.y - o.h; o.grounded = true; }
            else if (o.vy < 0) { o.y = s.y + s.h; }
            o.vy = 0;
          }
        });
        // fall out
        if (o.y > CH + 300 && o.behavior === 'player') endPlay(false);
      }
    });

    if (!player) return;

    // overlaps: coins, flag, enemies + onCollide hook
    objs.forEach((o) => {
      if (o === player || o.hidden) return;
      if (!aabb(player, o)) { prevOverlaps.delete(o.id); return; }
      const isNew = !prevOverlaps.has(o.id);
      prevOverlaps.add(o.id);

      if (isNew) {
        try { if (state.hooks.onCollide) state.hooks.onCollide(player, o); } catch (err) { showCodeError(err); }
      }
      if (o.behavior === 'coin' && !o.hidden) {
        o.hidden = true;
        state.score += 1;
        $('#hudScore').textContent = state.score;
      } else if (o.behavior === 'flag') {
        endPlay(true);
      } else if (o.behavior === 'enemy') {
        endPlay(false);
      }
    });
  }

  /* ================= Demo scene ================= */
  function demoScene() {
    const W = CW, H = CH;
    const mk = (type, over) => Object.assign(defaultsFor(type), over);
    return [
      mk('platform', { name: 'sol', x: 60, y: H - 110, w: W - 120, h: 28 }),
      mk('platform', { name: 'plateforme-haute', x: W * 0.32, y: H - 250, w: 180, h: 24 }),
      mk('platform', { name: 'plateforme-haute-2', x: W * 0.62, y: H - 330, w: 150, h: 24 }),
      mk('player', { name: 'joueur', x: 120, y: H - 190 }),
      mk('coin', { name: 'piece-1', x: W * 0.36, y: H - 300 }),
      mk('coin', { name: 'piece-2', x: W * 0.42, y: H - 300 }),
      mk('coin', { name: 'piece-3', x: W * 0.66, y: H - 380 }),
      mk('enemy', { name: 'ennemi-1', x: W * 0.52, y: H - 150 }),
      mk('flag', { name: 'arrivee', x: W - 150, y: H - 200 }),
    ];
  }

  /* ================= i18n hooks ================= */
  function applyEditorLang() {
    $('#projectName').placeholder = t('ed.projectName');
    if (!state.playing) $('#playLabel').textContent = t('ed.play');
    if (!$('#codeBox').value.trim() || $('#codeBox').dataset.template === '1') {
      $('#codeBox').value = t('ed.codeTemplate');
      $('#codeBox').dataset.template = '1';
    }
  }
  document.addEventListener('kreo:langchange', applyEditorLang);

  /* ================= Init ================= */
  function init() {
    resizeCanvas();
    bindInspector();

    // restore autosave or load demo
    let restored = false;
    try {
      const auto = JSON.parse(localStorage.getItem('kreo-autosave') || 'null');
      if (auto && auto.objects && auto.objects.length) restored = loadProject(auto, true);
    } catch (e) {}
    if (!restored) {
      state.project.objects = demoScene();
      refreshTree();
      $('#codeBox').value = t('ed.codeTemplate');
      $('#codeBox').dataset.template = '1';
      $('#projectName').value = t('ed.projectName');
      state.project.name = t('ed.projectName');
    }

    $('#codeBox').addEventListener('input', (e) => {
      e.target.dataset.template = '0';
      markDirty();
    });

    // Tab key inserts spaces in code box
    $('#codeBox').addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const el = e.target, s = el.selectionStart;
        el.value = el.value.slice(0, s) + '  ' + el.value.slice(el.selectionEnd);
        el.selectionStart = el.selectionEnd = s + 2;
      }
    });

    applyEditorLang();
    select(null);
    render();
  }

  init();
})();

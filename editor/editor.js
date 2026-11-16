/* ============================================================
   KREO — Éditeur v1 (editor.js)
   Souris (drag/resize), undo/redo, grille + aimantation, zoom,
   hiérarchie, inspecteur complet, code JS (onStart/onUpdate/
   onCollide), play mode + HUD + sons + overlays, sauvegarde.
   ============================================================ */
(function () {
  'use strict';

  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const t = (k) => (window.kreoT ? window.kreoT(k) : k);

  const canvas = $('#scene');
  const ctx = canvas.getContext('2d');
  const W = 960, H = 540;

  /* ---------------- Modèle ---------------- */
  const DEFAULTS = {
    player:   { w: 40, h: 56, color: '#6D4AFF', speed: 240, jump: 700 },
    platform: { w: 180, h: 24, color: '#6D4AFF', solid: true },
    ground:   { w: 960, h: 64, color: '#2A2F45', solid: true },
    enemy:    { w: 40, h: 40, color: '#E5484D', speed: 80 },
    coin:     { w: 28, h: 28, color: '#F5A623', value: 10 },
    flag:     { w: 30, h: 90, color: '#18A06B', message: '' },
    text:     { w: 240, h: 42, text: 'Texte', textSize: 22, textColor: '#0D1022' }
  };
  const TYPE_COLORS = {
    player: '#6D4AFF', platform: '#8B7CFF', ground: '#2A2F45',
    enemy: '#E5484D', coin: '#F5A623', flag: '#18A06B', text: '#22B8CF'
  };

  const state = {
    objects: [],
    selectedId: null,
    play: false,
    keys: {},
    score: 0,
    won: false,
    lost: false,
    dirty: false,
    scene: { name: 'Ma scène', bg: '#F1F3F8', gravity: 2000 }
  };

  const view = { zoom: 1, grid: true, snap: true, muted: false, codeTarget: 'onStart' };

  let nextId = 1;
  function genId() { return 'obj-' + (nextId++); }
  function findObj(id) { return state.objects.find((o) => o.id === id) || null; }
  function snapVal(v) { return view.snap ? Math.round(v / 8) * 8 : Math.round(v); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------------- Toasts ---------------- */
  function toast(key, icon) {
    const box = $('#toastContainer');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<div class="t-ico">' + (icon || '✨') + '</div><span></span>';
    el.querySelector('span').textContent = key.indexOf('ed.') === 0 ? t(key) : key;
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 240);
    }, 2600);
  }

  /* ---------------- Sons (WebAudio) ---------------- */
  let AC = null;
  function ac() {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    return AC;
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (view.muted) return;
    try {
      const a = ac();
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type || 'triangle';
      o.frequency.setValueAtTime(freq, a.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.15, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
      o.connect(g).connect(a.destination);
      o.start();
      o.stop(a.currentTime + dur + 0.02);
    } catch (e) { /* audio indisponible */ }
  }
  const SFX = {
    jump: function () { tone(420, 0.13, 'square', 0.10, 780); },
    coin: function () { tone(988, 0.08, 'triangle', 0.14); setTimeout(function () { tone(1319, 0.11, 'triangle', 0.14); }, 70); },
    hit: function () { tone(190, 0.2, 'sawtooth', 0.13, 95); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { tone(f, 0.15, 'triangle', 0.16); }, i * 105); }); },
    lose: function () { [392, 330, 262, 196].forEach(function (f, i) { setTimeout(function () { tone(f, 0.17, 'sawtooth', 0.12); }, i * 125); }); }
  };

  /* ---------------- Undo / Redo ---------------- */
  const undoStack = [], redoStack = [];
  function serialize() { return JSON.stringify({ objects: state.objects, scene: state.scene }); }
  function snapshot() {
    undoStack.push(serialize());
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    markDirty();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(serialize());
    const s = JSON.parse(undoStack.pop());
    state.objects = s.objects;
    state.scene = s.scene;
    if (!findObj(state.selectedId)) state.selectedId = null;
    renderAll();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(serialize());
    const s = JSON.parse(redoStack.pop());
    state.objects = s.objects;
    state.scene = s.scene;
    if (!findObj(state.selectedId)) state.selectedId = null;
    renderAll();
  }

  /* ---------------- Statut ---------------- */
  function markDirty() {
    state.dirty = true;
    updateStatusSave();
  }
  function updateStatusSave() {
    const el = $('#statusSave');
    if (!el) return;
    el.textContent = state.dirty ? t('ed.modified') : t('ed.saved');
    el.className = 'sb-save ' + (state.dirty ? 'dirty' : 'ok');
  }

  /* ---------------- Dessin ---------------- */
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawObj(o, x, y) {
    x = x != null ? x : o.x;
    y = y != null ? y : o.y;
    ctx.save();
    ctx.globalAlpha = o.opacity != null ? o.opacity : 1;

    if (o.type === 'text') {
      ctx.fillStyle = o.textColor || '#0D1022';
      ctx.font = '600 ' + (o.textSize || 22) + 'px "Space Grotesk", Inter, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(o.text || '', x, y + 4);
      ctx.restore();
      return;
    }

    const w = o.w, h = o.h;
    switch (o.type) {
      case 'player': {
        roundRect(x, y, w, h, 10);
        ctx.fillStyle = o.color;
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        roundRect(x, y, w, h * 0.32, 10);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x + w * 0.32, y + h * 0.34, w * 0.13, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + w * 0.68, y + h * 0.34, w * 0.13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1A1D2E';
        ctx.beginPath(); ctx.arc(x + w * 0.35, y + h * 0.36, w * 0.055, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + w * 0.71, y + h * 0.36, w * 0.055, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        roundRect(x + w * 0.12, y + h - 7, w * 0.3, 7, 3); ctx.fill();
        roundRect(x + w * 0.58, y + h - 7, w * 0.3, 7, 3); ctx.fill();
        break;
      }
      case 'platform': {
        roundRect(x, y, w, h, 7);
        ctx.fillStyle = o.color;
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.26)';
        roundRect(x, y, w, Math.min(7, h * 0.35), 4);
        ctx.fill();
        break;
      }
      case 'ground': {
        ctx.fillStyle = o.color;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x, y, w, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        for (let gx = x + 12; gx < x + w - 6; gx += 34) {
          ctx.fillRect(gx, y + 20, 14, 4);
          ctx.fillRect(gx + 10, y + 38, 10, 4);
        }
        break;
      }
      case 'enemy': {
        roundRect(x, y, w, h, 9);
        ctx.fillStyle = o.color;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x + w * 0.32, y + h * 0.4, w * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + w * 0.68, y + h * 0.4, w * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1A1D2E';
        ctx.beginPath(); ctx.arc(x + w * 0.32, y + h * 0.44, w * 0.06, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + w * 0.68, y + h * 0.44, w * 0.06, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.24, y + h * 0.72);
        ctx.lineTo(x + w * 0.42, y + h * 0.64);
        ctx.lineTo(x + w * 0.58, y + h * 0.72);
        ctx.lineTo(x + w * 0.76, y + h * 0.64);
        ctx.stroke();
        break;
      }
      case 'coin': {
        const r = Math.min(w, h) / 2;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
        ctx.fillStyle = o.color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, r * 0.62, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + w / 2 - r * 0.28, y + h / 2 - r * 0.3, r * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fill();
        break;
      }
      case 'flag': {
        ctx.fillStyle = '#3A3F58';
        roundRect(x + 2, y, 5, h, 3);
        ctx.fill();
        ctx.fillStyle = o.color;
        ctx.beginPath();
        ctx.moveTo(x + 7, y + 4);
        ctx.quadraticCurveTo(x + w * 0.6, y + h * 0.02, x + w, y + h * 0.1);
        ctx.lineTo(x + w, y + h * 0.32);
        ctx.quadraticCurveTo(x + w * 0.6, y + h * 0.24, x + 7, y + h * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(x + 5, y + h, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  /* ---------------- Rendu scène ---------------- */
  const sim = { byId: {}, player: null, enemies: [], coins: [], flag: null };

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = state.scene.bg || '#F1F3F8';
    ctx.fillRect(0, 0, W, H);

    for (const o of state.objects) {
      if (o.hidden) continue;
      const live = sim.byId[o.id];
      if (state.play && live) {
        drawObj(o, live.x, live.y);
      } else {
        drawObj(o);
      }
    }
    updateSelBox();
  }

  function updateSelBox() {
    const box = $('#selBox');
    const o = findObj(state.selectedId);
    if (!o || state.play || o.hidden) { box.hidden = true; return; }
    box.hidden = false;
    box.style.left = o.x + 'px';
    box.style.top = o.y + 'px';
    box.style.width = o.w + 'px';
    box.style.height = o.h + 'px';
  }

  /* ---------------- Hiérarchie ---------------- */
  function renderHierarchy() {
    const el = $('#hierarchy');
    $('#objCount').textContent = state.objects.length;
    $('#statusCount').textContent = state.objects.length + ' ' + t('ed.objectsLabel');
    if (!state.objects.length) {
      el.innerHTML = '<div class="h-empty">＋<br>' + t('ed.empty') + '</div>';
      return;
    }
    el.innerHTML = state.objects.slice().reverse().map(function (o) {
      return (
        '<div class="h-row' + (o.id === state.selectedId ? ' selected' : '') + (o.hidden ? ' hidden-obj' : '') + '" data-id="' + o.id + '">' +
          '<div class="h-dot" style="background:' + (TYPE_COLORS[o.type] || '#999') + '"></div>' +
          '<div class="h-name" title="' + t('ed.renameHint') + '">' + escapeHtml(o.name || t('ed.' + o.type)) + '</div>' +
          '<button class="h-eye" title="' + (o.hidden ? t('ed.eyeShow') : t('ed.eyeHide')) + '">' +
            (o.hidden
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l16 16"/><path d="M9.5 6.4A9.6 9.6 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.4 2.9M6.3 8.3A16.6 16.6 0 0 0 3 12s4 6 9 6a9 9 0 0 0 3.2-.6"/><path d="M10.2 10.4a2.8 2.8 0 0 0 3.6 3.6"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/></svg>') +
          '</button>' +
        '</div>'
      );
    }).join('');

    $$('.h-row', el).forEach(function (row) {
      const id = row.getAttribute('data-id');
      row.addEventListener('click', function (e) {
        if (e.target.closest('.h-eye')) return;
        select(id);
      });
      row.addEventListener('dblclick', function (e) {
        if (e.target.closest('.h-eye')) return;
        beginRename(row, id);
      });
      const eye = row.querySelector('.h-eye');
      eye.addEventListener('click', function () {
        const o = findObj(id);
        if (!o) return;
        snapshot();
        o.hidden = !o.hidden;
        renderAll();
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function beginRename(row, id) {
    const o = findObj(id);
    if (!o) return;
    const nameEl = row.querySelector('.h-name');
    const input = document.createElement('input');
    input.value = o.name || '';
    nameEl.textContent = '';
    nameEl.appendChild(input);
    input.focus();
    input.select();
    let done = false;
    function commit(save) {
      if (done) return;
      done = true;
      if (save && input.value.trim()) {
        snapshot();
        o.name = input.value.trim();
      }
      renderAll();
    }
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') commit(true);
      if (e.key === 'Escape') commit(false);
    });
    input.addEventListener('blur', function () { commit(true); });
  }

  /* ---------------- Inspecteur ---------------- */
  let pendingSnapshot = false;
  function armSnapshot() { pendingSnapshot = true; }
  function takeSnapshot() {
    if (pendingSnapshot) {
      snapshot();
      pendingSnapshot = false;
    }
  }

  function renderInspector() {
    const o = findObj(state.selectedId);
    const empty = $('#inspectorEmpty');
    const obj = $('#inspectorObj');
    if (!o) {
      empty.hidden = false;
      obj.hidden = true;
      $('#inSceneName').value = state.scene.name;
      $('#inBg').value = state.scene.bg;
      $('#inGravity').value = state.scene.gravity;
      $('#gravityVal').textContent = state.scene.gravity;
      return;
    }
    empty.hidden = true;
    obj.hidden = false;

    $('#inspTitle').textContent = (o.name || t('ed.' + o.type)) + ' · ' + t('ed.' + o.type);
    $('#inName').value = o.name || '';
    $('#inX').value = Math.round(o.x);
    $('#inY').value = Math.round(o.y);
    $('#inW').value = Math.round(o.w);
    $('#inH').value = Math.round(o.h);
    $('#inOpacity').value = Math.round((o.opacity != null ? o.opacity : 1) * 100);
    $('#opacityVal').textContent = $('#inOpacity').value + ' %';

    $$('.type-fields .field').forEach(function (f) {
      const only = f.getAttribute('data-only');
      const not = f.getAttribute('data-not');
      let show = true;
      if (only && only !== o.type) show = false;
      if (not && not === o.type) show = false;
      f.hidden = !show;
    });

    if (o.type === 'player') {
      $('#inSpeed').value = o.speed != null ? o.speed : 240;
      $('#speedVal').textContent = $('#inSpeed').value;
      $('#inJump').value = o.jump != null ? o.jump : 700;
      $('#jumpVal').textContent = $('#inJump').value;
    }
    if (o.type === 'enemy') {
      $('#inEnemySpeed').value = o.speed != null ? o.speed : 80;
      $('#enemySpeedVal').textContent = $('#inEnemySpeed').value;
    }
    if (o.type === 'coin') $('#inCoinValue').value = o.value != null ? o.value : 10;
    if (o.type === 'flag') $('#inFlagMsg').value = o.message || '';
    if (o.type === 'text') {
      $('#inTextContent').value = o.text || '';
      $('#inTextSize').value = o.textSize || 22;
      $('#inTextColor').value = o.textColor || '#0D1022';
    }
    if (o.type === 'platform') $('#inSolid').checked = o.solid !== false;
    if (o.type !== 'text') $('#inColor').value = o.color || '#6D4AFF';

    // Code
    o.code = o.code || { onStart: '', onUpdate: '', onCollide: '' };
    $('#codeEditor').value = o.code[view.codeTarget] || '';
    $$('.code-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.getAttribute('data-code') === view.codeTarget);
    });
  }

  function select(id) {
    state.selectedId = id;
    renderAll();
  }

  /* ---------------- Rendu global ---------------- */
  function renderAll() {
    render();
    renderHierarchy();
    renderInspector();
  }

  /* ---------------- Souris : déplacer / redimensionner ---------------- */
  function scenePos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (W / r.width),
      y: (e.clientY - r.top) * (H / r.height)
    };
  }

  function hitTest(x, y) {
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const o = state.objects[i];
      if (o.hidden) continue;
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o;
    }
    return null;
  }

  let drag = null;
  let resize = null;

  canvas.addEventListener('mousedown', function (e) {
    if (state.play) return;
    const p = scenePos(e);
    const o = hitTest(p.x, p.y);
    if (o) {
      if (state.selectedId !== o.id) select(o.id);
      drag = { id: o.id, dx: p.x - o.x, dy: p.y - o.y, moved: false };
    } else {
      state.selectedId = null;
      renderAll();
    }
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    e.preventDefault();
  });

  function onWinMouseMove(e) {
    const p = scenePos(e);
    $('#statusPos').textContent = 'x ' + Math.round(p.x) + ' · y ' + Math.round(p.y);

    if (drag) {
      const o = findObj(drag.id);
      if (!o) return;
      const nx = snapVal(p.x - drag.dx);
      const ny = snapVal(p.y - drag.dy);
      if (!drag.moved && (Math.abs(nx - o.x) > 1 || Math.abs(ny - o.y) > 1)) {
        snapshot();
        drag.moved = true;
      }
      o.x = clamp(nx, -o.w + 8, W - 8);
      o.y = clamp(ny, -o.h + 8, H - 8);
      render();
      renderInspector();
    }
    if (resize) {
      const o = findObj(resize.id);
      if (!o) return;
      const dx = p.x - resize.startX;
      const dy = p.y - resize.startY;
      if (!resize.moved && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
        snapshot();
        resize.moved = true;
      }
      let x = resize.orig.x, y = resize.orig.y, w = resize.orig.w, h = resize.orig.h;
      if (resize.corner.indexOf('e') !== -1) w = snapVal(resize.orig.w + dx);
      if (resize.corner.indexOf('s') !== -1) h = snapVal(resize.orig.h + dy);
      if (resize.corner.indexOf('w') !== -1) { x = snapVal(resize.orig.x + dx); w = resize.orig.w + (resize.orig.x - x); }
      if (resize.corner.indexOf('n') !== -1) { y = snapVal(resize.orig.y + dy); h = resize.orig.h + (resize.orig.y - y); }
      o.x = x; o.y = y;
      o.w = Math.max(16, w);
      o.h = Math.max(16, h);
      render();
      renderInspector();
    }
  }

  function onWinMouseUp() {
    drag = null;
    resize = null;
    window.removeEventListener('mousemove', onWinMouseMove);
    window.removeEventListener('mouseup', onWinMouseUp);
  }

  // Poignées de redimensionnement
  $$('.handle').forEach(function (hEl) {
    hEl.addEventListener('mousedown', function (e) {
      if (state.play) return;
      e.stopPropagation();
      const o = findObj(state.selectedId);
      if (!o) return;
      const p = scenePos(e);
      resize = {
        id: o.id,
        corner: hEl.getAttribute('data-corner'),
        startX: p.x, startY: p.y,
        orig: { x: o.x, y: o.y, w: o.w, h: o.h },
        moved: false
      };
      window.addEventListener('mousemove', onWinMouseMove);
      window.addEventListener('mouseup', onWinMouseUp);
      e.preventDefault();
    });
  });

  canvas.addEventListener('dblclick', function () {
    const row = $('.h-row.selected');
    if (row) beginRename(row, state.selectedId);
  });

  canvas.addEventListener('mousemove', function (e) {
    const p = scenePos(e);
    $('#statusPos').textContent = 'x ' + Math.round(p.x) + ' · y ' + Math.round(p.y);
  });

  canvas.addEventListener('wheel', function (e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const z = clamp(view.zoom + (e.deltaY < 0 ? 0.1 : -0.1), 0.5, 1.5);
    setZoom(Math.round(z * 100) / 100);
  }, { passive: false });

  /* ---------------- Zoom ---------------- */
  function setZoom(z) {
    view.zoom = z;
    $('#stageScaler').style.transform = 'scale(' + z + ')';
    $('#zoomSelect').value = String(z);
    $('#statusZoom').textContent = Math.round(z * 100) + ' %';
  }
  $('#zoomSelect').addEventListener('change', function (e) {
    setZoom(parseFloat(e.target.value) || 1);
  });

  /* ---------------- Objets : ajout / suppression / z-order ---------------- */
  function addObject(type) {
    const d = DEFAULTS[type];
    if (!d) return;
    snapshot();
    const off = (state.objects.length % 6) * 14;
    const o = Object.assign({
      id: genId(),
      type: type,
      name: t('ed.' + type),
      x: snapVal(W / 2 - d.w / 2 + off),
      y: type === 'ground' ? H - d.h : snapVal(H / 2 - d.h / 2 + off),
      hidden: false,
      opacity: 1,
      code: { onStart: '', onUpdate: '', onCollide: '' }
    }, d);
    state.objects.push(o);
    state.selectedId = o.id;
    renderAll();
    toast('ed.newObj', '＋');
  }

  function deleteSelected() {
    const o = findObj(state.selectedId);
    if (!o) return;
    snapshot();
    state.objects = state.objects.filter(function (x) { return x.id !== o.id; });
    state.selectedId = null;
    renderAll();
    toast('ed.deletedToast', '🗑️');
  }

  function duplicateSelected() {
    const o = findObj(state.selectedId);
    if (!o) return;
    snapshot();
    const copy = JSON.parse(JSON.stringify(o));
    copy.id = genId();
    copy.x = snapVal(o.x + 16);
    copy.y = snapVal(o.y + 16);
    const i = state.objects.indexOf(o);
    state.objects.splice(i + 1, 0, copy);
    state.selectedId = copy.id;
    renderAll();
    toast('ed.copiedToast', '📄');
  }

  function moveZ(dir) {
    const o = findObj(state.selectedId);
    if (!o) return;
    const i = state.objects.indexOf(o);
    const j = i + dir;
    if (j < 0 || j >= state.objects.length) return;
    snapshot();
    state.objects[i] = state.objects[j];
    state.objects[j] = o;
    renderAll();
  }

  $$('.obj-btn').forEach(function (b) {
    b.addEventListener('click', function () { addObject(b.getAttribute('data-type')); });
  });
  $('#btnDelete').addEventListener('click', deleteSelected);
  $('#btnDelete2').addEventListener('click', deleteSelected);
  $('#btnDuplicate').addEventListener('click', duplicateSelected);
  $('#btnDuplicate2').addEventListener('click', duplicateSelected);
  $('#btnForward').addEventListener('click', function () { moveZ(1); });
  $('#btnBackward').addEventListener('click', function () { moveZ(-1); });

  /* ---------------- Inspecteur : liaisons ---------------- */
  function bindField(sel, apply, opts) {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('pointerdown', armSnapshot);
    el.addEventListener('focus', armSnapshot);
    el.addEventListener('input', function () {
      takeSnapshot();
      apply(el);
      render();
      renderHierarchy();
    });
  }

  function selObj() { return findObj(state.selectedId); }

  bindField('#inName', function (el) {
    const o = selObj(); if (o) o.name = el.value;
  });
  bindField('#inX', function (el) {
    const o = selObj(); if (o) o.x = parseFloat(el.value) || 0;
  });
  bindField('#inY', function (el) {
    const o = selObj(); if (o) o.y = parseFloat(el.value) || 0;
  });
  bindField('#inW', function (el) {
    const o = selObj(); if (o) o.w = Math.max(16, parseFloat(el.value) || 16);
  });
  bindField('#inH', function (el) {
    const o = selObj(); if (o) o.h = Math.max(16, parseFloat(el.value) || 16);
  });
  bindField('#inOpacity', function (el) {
    const o = selObj(); if (o) o.opacity = (parseFloat(el.value) || 100) / 100;
    $('#opacityVal').textContent = el.value + ' %';
  });
  bindField('#inSpeed', function (el) {
    const o = selObj(); if (o) o.speed = parseFloat(el.value);
    $('#speedVal').textContent = el.value;
  });
  bindField('#inJump', function (el) {
    const o = selObj(); if (o) o.jump = parseFloat(el.value);
    $('#jumpVal').textContent = el.value;
  });
  bindField('#inEnemySpeed', function (el) {
    const o = selObj(); if (o) o.speed = parseFloat(el.value);
    $('#enemySpeedVal').textContent = el.value;
  });
  bindField('#inCoinValue', function (el) {
    const o = selObj(); if (o) o.value = Math.max(1, parseInt(el.value, 10) || 1);
  });
  bindField('#inFlagMsg', function (el) {
    const o = selObj(); if (o) o.message = el.value;
  });
  bindField('#inTextContent', function (el) {
    const o = selObj(); if (o) o.text = el.value;
  });
  bindField('#inTextSize', function (el) {
    const o = selObj(); if (o) o.textSize = Math.max(8, parseFloat(el.value) || 22);
  });
  bindField('#inTextColor', function (el) {
    const o = selObj(); if (o) o.textColor = el.value;
  });
  bindField('#inColor', function (el) {
    const o = selObj(); if (o) o.color = el.value;
  });

  $('#inSolid').addEventListener('change', function (el2) {
    const o = selObj();
    if (o) {
      snapshot();
      o.solid = $('#inSolid').checked;
    }
  });

  // Réglages de scène
  bindField('#inSceneName', function (el) {
    state.scene.name = el.value;
    $('#projectName').value = el.value;
  });
  bindField('#inBg', function (el) {
    state.scene.bg = el.value;
  });
  bindField('#inGravity', function (el) {
    state.scene.gravity = parseFloat(el.value) || 2000;
    $('#gravityVal').textContent = el.value;
  });

  $('#projectName').addEventListener('input', function (e) {
    state.scene.name = e.target.value;
    markDirty();
  });

  /* ---------------- Code ---------------- */
  function templateFor(hook) {
    const fr = window.kreoCurrentLang && window.kreoCurrentLang() === 'en' ? false : true;
    if (hook === 'onStart') {
      return fr ? '// Se lance quand la partie démarre\nscene.message("C\'est parti !");' : '// Runs when the game starts\nscene.message("Let\'s go!");';
    }
    if (hook === 'onUpdate') {
      return fr ? '// Se lance à chaque image (dt = durée d\'une image)\n// Exemple : player.vy = -600;' : '// Runs every frame (dt = frame duration)\n// Example: player.vy = -600;';
    }
    return fr ? '// Se lance quand le joueur touche un objet\nif (other.type === "coin") {\n  scene.addScore(5);\n}' : '// Runs when the player touches an object\nif (other.type === "coin") {\n  scene.addScore(5);\n}';
  }

  $$('.code-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      const o = selObj();
      if (o) {
        o.code = o.code || { onStart: '', onUpdate: '', onCollide: '' };
        o.code[view.codeTarget] = $('#codeEditor').value;
      }
      view.codeTarget = tab.getAttribute('data-code');
      renderInspector();
    });
  });

  $('#btnApplyCode').addEventListener('click', function () {
    const o = selObj();
    if (!o) return;
    snapshot();
    o.code = o.code || { onStart: '', onUpdate: '', onCollide: '' };
    o.code[view.codeTarget] = $('#codeEditor').value;
    toast('ed.applied', '✓');
  });

  $('#btnResetCode').addEventListener('click', function () {
    $('#codeEditor').value = templateFor(view.codeTarget);
  });

  /* ---------------- Sauvegarde / import / export / démo ---------------- */
  const KEY = 'kreo-project';
  const AUTOKEY = 'kreo-autosave';

  function save() {
    const data = { version: 1, scene: state.scene, objects: state.objects };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      state.dirty = false;
      updateStatusSave();
      toast('ed.saveOk', '💾');
    } catch (e) {
      toast('⚠️', '⚠️');
    }
  }

  function exportFile() {
    const data = { version: 1, scene: state.scene, objects: state.objects };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.scene.name || 'mon-jeu') + '.kreo.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function importFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = function () {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const data = JSON.parse(String(reader.result));
          if (data && Array.isArray(data.objects)) {
            snapshot();
            state.objects = data.objects;
            if (data.scene) state.scene = data.scene;
            reindexIds();
            state.selectedId = null;
            $('#projectName').value = state.scene.name || 'Ma scène';
            renderAll();
            toast('app.importOk', '✅');
          } else {
            toast('app.importKo', '⚠️');
          }
        } catch (e) {
          toast('app.importKo', '⚠️');
        }
      };
      reader.readAsText(f);
    };
    input.click();
  }

  function reindexIds() {
    let max = 0;
    state.objects.forEach(function (o) {
      const m = /(\d+)$/.exec(o.id || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
      o.code = o.code || { onStart: '', onUpdate: '', onCollide: '' };
    });
    nextId = max + 1;
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(KEY) || localStorage.getItem(AUTOKEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.objects)) return false;
      state.objects = data.objects;
      if (data.scene) state.scene = Object.assign(state.scene, data.scene);
      reindexIds();
      $('#projectName').value = state.scene.name || 'Ma scène';
      return true;
    } catch (e) {
      return false;
    }
  }

  function newProject() {
    snapshot();
    state.objects = [];
    state.scene = { name: 'Ma scène', bg: '#F1F3F8', gravity: 2000 };
    state.selectedId = null;
    $('#projectName').value = 'Ma scène';
    renderAll();
  }

  /* ---------------- Scène de démonstration ---------------- */
  function demoScene() {
    function mk(type, over) {
      const d = DEFAULTS[type];
      return Object.assign({
        id: genId(), type: type, name: t('ed.' + type),
        hidden: false, opacity: 1,
        code: { onStart: '', onUpdate: '', onCollide: '' }
      }, d, over || {});
    }
    state.objects = [
      mk('text', { x: 330, y: 46, text: 'Démo KREO — Éditeur v1', textSize: 30, textColor: '#2A2F45', w: 340, h: 44 }),
      mk('ground', { x: 0, y: 476, w: 960, h: 64 }),
      mk('platform', { x: 120, y: 384, w: 220 }),
      mk('platform', { x: 430, y: 312, w: 220, color: '#22B8CF' }),
      mk('player', { x: 150, y: 316 }),
      mk('coin', { x: 480, y: 268 }),
      mk('coin', { x: 540, y: 268 }),
      mk('coin', { x: 600, y: 268 }),
      mk('enemy', { x: 520, y: 436 }),
      mk('flag', { x: 872, y: 386 })
    ];
    state.scene = { name: 'Démo KREO', bg: '#F1F3F8', gravity: 2000 };
    state.selectedId = null;
    $('#projectName').value = 'Démo KREO';
    reindexIds();
  }

  /* ---------------- Play mode ---------------- */
  let raf = 0;
  let lastTime = 0;
  const hooks = {};

  function compileCode() {
    for (const k of Object.keys(hooks)) delete hooks[k];
    for (const o of state.objects) {
      if (!o.code) continue;
      hooks[o.id] = {};
      for (const name of ['onStart', 'onUpdate', 'onCollide']) {
        const src = (o.code[name] || '').trim();
        if (!src) continue;
        try {
          hooks[o.id][name] = new Function('scene', 'dt', 'player', 'self', 'other', src);
        } catch (e) {
          toast('⚠️ ' + (e.message || 'code'), '⚠️');
        }
      }
    }
  }

  function makeApi() {
    return {
      get: function (id) {
        const o = findObj(id);
        return o ? makeProxy(o) : null;
      },
      get player() { return sim.player ? sim.player.api : null; },
      get score() { return state.score; },
      message: function (msg) { toast(String(msg), '💬'); },
      addScore: function (n) {
        state.score += (Number(n) || 0);
        updateHUD();
      },
      win: function (msg) { winGame(msg); },
      lose: function (msg) { loseGame(msg); }
    };
  }

  function makeProxy(o) {
    const live = sim.byId[o.id];
    const target = live || o;
    return {
      get id() { return o.id; },
      get type() { return o.type; },
      get name() { return o.name; },
      get x() { return target.x; }, set x(v) { target.x = Number(v) || 0; },
      get y() { return target.y; }, set y(v) { target.y = Number(v) || 0; },
      get vx() { return target.vx || 0; }, set vx(v) { target.vx = Number(v) || 0; },
      get vy() { return target.vy || 0; }, set vy(v) { target.vy = Number(v) || 0; },
      get w() { return o.w; },
      get h() { return o.h; },
      get hidden() { return o.hidden; }, set hidden(v) { o.hidden = !!v; }
    };
  }

  function runHooks(name, selfObj, otherObj, dt) {
    for (const o of state.objects) {
      const h = hooks[o.id] && hooks[o.id][name];
      if (!h) continue;
      const playerProxy = sim.player ? sim.player.api : null;
      const selfProxy = makeProxy(selfObj || o);
      const otherProxy = otherObj ? makeProxy(otherObj) : null;
      try {
        h(makeApi(), dt || 0, playerProxy, selfProxy, otherProxy);
      } catch (e) {
        hooks[o.id][name] = null;
        toast('⚠️ ' + (e.message || 'code'), '⚠️');
      }
    }
  }

  function startPlay() {
    if (state.play) return;
    state.play = true;
    state.won = false;
    state.lost = false;
    state.score = 0;

    sim.byId = {};
    sim.player = null;
    sim.enemies = [];
    sim.coins = [];
    sim.flag = null;

    for (const o of state.objects) {
      if (o.hidden) continue;
      if (o.type === 'player') {
        sim.player = {
          ref: o, x: o.x, y: o.y, w: o.w, h: o.h,
          vx: 0, vy: 0, onGround: false,
          speed: o.speed != null ? o.speed : 240,
          jump: o.jump != null ? o.jump : 700
        };
        sim.byId[o.id] = sim.player;
      } else if (o.type === 'enemy') {
        const e = { ref: o, x: o.x, y: o.y, w: o.w, h: o.h, vx: (o.speed != null ? o.speed : 80) };
        sim.enemies.push(e);
        sim.byId[o.id] = e;
      } else if (o.type === 'coin') {
        const c = { ref: o, x: o.x, y: o.y, w: o.w, h: o.h, got: false, value: o.value != null ? o.value : 10 };
        sim.coins.push(c);
        sim.byId[o.id] = c;
      } else if (o.type === 'flag') {
        sim.flag = { ref: o, x: o.x, y: o.y, w: o.w, h: o.h };
        sim.byId[o.id] = sim.flag;
      }
    }
    if (sim.player) sim.player.api = makeProxy(sim.player.ref);

    compileCode();
    runHooks('onStart', null, null, 0);

    $('#hud').hidden = false;
    $('#winOverlay').hidden = true;
    $('#loseOverlay').hidden = true;
    $('#btnPlay').classList.add('playing');
    $('#playLabel').textContent = t('ed.stop');
    $('#playIcon').innerHTML = '<rect x="7" y="7" width="10" height="10" rx="2"/>';
    updateHUD();

    lastTime = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function stopPlay() {
    state.play = false;
    cancelAnimationFrame(raf);
    $('#hud').hidden = true;
    $('#winOverlay').hidden = true;
    $('#loseOverlay').hidden = true;
    $('#btnPlay').classList.remove('playing');
    $('#playLabel').textContent = t('ed.play');
    $('#playIcon').innerHTML = '<path d="M8 5.5v13l10-6.5z"/>';
    sim.byId = {};
    render();
  }

  function togglePlay() {
    if (state.play) stopPlay();
    else startPlay();
  }

  function loop(ts) {
    if (!state.play) return;
    const dt = Math.min(0.033, (ts - lastTime) / 1000);
    lastTime = ts;
    updateSim(dt);
    render();
    updateHUD();
    raf = requestAnimationFrame(loop);
  }

  function solids() {
    return state.objects.filter(function (o) {
      return !o.hidden && (o.type === 'platform' ? o.solid !== false : (o.type === 'ground'));
    });
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function updateSim(dt) {
    const p = sim.player;
    const keys = state.keys;

    if (p) {
      let dir = 0;
      if (keys['arrowleft'] || keys['a'] || keys['q']) dir -= 1;
      if (keys['arrowright'] || keys['d']) dir += 1;
      const targetVx = dir * p.speed;
      p.vx += (targetVx - p.vx) * Math.min(1, dt * 14);
      if (Math.abs(p.vx) < 1) p.vx = 0;

      const jumpKey = keys['arrowup'] || keys['w'] || keys['z'] || keys[' '];
      if (jumpKey && p.onGround) {
        p.vy = -p.jump;
        p.onGround = false;
        SFX.jump();
      }

      p.vy += (state.scene.gravity || 2000) * dt;

      // Déplacement horizontal
      p.x += p.vx * dt;
      for (const s of solids()) {
        if (aabb(p, s)) {
          if (p.vx > 0) p.x = s.x - p.w;
          else if (p.vx < 0) p.x = s.x + s.w;
          p.vx = 0;
        }
      }

      // Déplacement vertical
      p.y += p.vy * dt;
      p.onGround = false;
      for (const s of solids()) {
        if (aabb(p, s)) {
          if (p.vy > 0) {
            p.y = s.y - p.h;
            p.vy = 0;
            p.onGround = true;
          } else if (p.vy < 0) {
            p.y = s.y + s.h;
            p.vy = 0;
          }
        }
      }

      // Limites
      if (p.x < 0) { p.x = 0; p.vx = 0; }
      if (p.x + p.w > W) { p.x = W - p.w; p.vx = 0; }

      // Chute
      if (p.y > H + 160) {
        loseGame(null);
        return;
      }

      // Pièces
      for (const c of sim.coins) {
        if (!c.got && aabb(p, c)) {
          c.got = true;
          state.score += c.value;
          SFX.coin();
        }
      }

      // Ennemis
      for (const e of sim.enemies) {
        if (aabb(p, e)) {
          SFX.hit();
          shake();
          loseGame(null);
          return;
        }
      }

      // Drapeau
      if (sim.flag && aabb(p, sim.flag)) {
        winGame(sim.flag.ref.message || null);
        return;
      }

      runHooks('onUpdate', sim.player.ref, null, dt);
    }

    // Ennemis : patrouille
    for (const e of sim.enemies) {
      const oldX = e.x;
      e.x += e.vx * dt;
      let hitWall = false;
      for (const s of solids()) {
        if (aabb(e, s)) {
          hitWall = true;
          break;
        }
      }
      if (hitWall || e.x < 0 || e.x + e.w > W) {
        e.x = oldX;
        e.vx = -e.vx;
      }
    }
  }

  function winGame(msg) {
    if (state.won || state.lost) return;
    state.won = true;
    SFX.win();
    $('#winScore').textContent = t('ed.scoreLabel') + ' : ' + state.score;
    $('#winOverlay').hidden = false;
  }

  function loseGame(msg) {
    if (state.won || state.lost) return;
    state.lost = true;
    SFX.lose();
    $('#loseOverlay').hidden = false;
  }

  function shake() {
    const w = $('#stageWrap');
    w.classList.remove('shake');
    void w.offsetWidth;
    w.classList.add('shake');
    setTimeout(function () { w.classList.remove('shake'); }, 420);
  }

  function updateHUD() {
    $('#hudScore').textContent = state.score;
    const total = sim.coins.length;
    const got = sim.coins.filter(function (c) { return c.got; }).length;
    $('#hudCoins').textContent = got + ' / ' + total;
  }

  $('#btnPlay').addEventListener('click', togglePlay);
  $('#btnReplay').addEventListener('click', function () {
    $('#winOverlay').hidden = true;
    stopPlay();
    startPlay();
  });
  $('#btnReplay2').addEventListener('click', function () {
    $('#loseOverlay').hidden = true;
    stopPlay();
    startPlay();
  });
  $('#btnBackEdit').addEventListener('click', stopPlay);
  $('#btnBackEdit2').addEventListener('click', stopPlay);

  /* ---------------- Clavier ---------------- */
  function isTyping(e) {
    const el = e.target;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  document.addEventListener('keydown', function (e) {
    const key = e.key.toLowerCase();
    state.keys[key] = true;
    state.keys[e.code.toLowerCase()] = true;

    if (isTyping(e)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!state.play) togglePlay(); // En jeu : Espace = saut (géré par les hooks/physics)
      return;
    }
    if (key === 'escape') {
      if (state.play) stopPlay();
      else { state.selectedId = null; renderAll(); }
      return;
    }
    if (key === 'delete' || key === 'backspace') {
      if (!state.play) { e.preventDefault(); deleteSelected(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
      e.preventDefault(); undo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault(); redo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && key === 'd') {
      e.preventDefault(); if (!state.play) duplicateSelected(); return;
    }
    if ((e.ctrlKey || e.metaKey) && key === 's') {
      e.preventDefault(); save(); return;
    }
    if (key === 'g' && !state.play) {
      view.grid = !view.grid;
      $('#gridOverlay').classList.toggle('off', !view.grid);
      $('#btnGrid').classList.toggle('active', view.grid);
      return;
    }

    // Déplacement flèches (édition)
    if (!state.play && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(key) !== -1) {
      const o = findObj(state.selectedId);
      if (!o) return;
      e.preventDefault();
      snapshot();
      const step = e.shiftKey ? 8 : 4;
      if (key === 'arrowleft') o.x -= step;
      if (key === 'arrowright') o.x += step;
      if (key === 'arrowup') o.y -= step;
      if (key === 'arrowdown') o.y += step;
      renderAll();
    }
  });

  document.addEventListener('keyup', function (e) {
    state.keys[e.key.toLowerCase()] = false;
    state.keys[e.code.toLowerCase()] = false;
  });

  /* ---------------- Boutons topbar ---------------- */
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  $('#btnGrid').addEventListener('click', function () {
    view.grid = !view.grid;
    $('#gridOverlay').classList.toggle('off', !view.grid);
    $('#btnGrid').classList.toggle('active', view.grid);
  });
  $('#btnSnap').addEventListener('click', function () {
    view.snap = !view.snap;
    $('#btnSnap').classList.toggle('active', view.snap);
    toast(view.snap ? 'ed.snapOn' : 'ed.snapOff', '🧲');
  });
  $('#btnNew').addEventListener('click', newProject);
  $('#btnSave').addEventListener('click', save);
  $('#btnExport').addEventListener('click', exportFile);
  $('#btnImport').addEventListener('click', importFile);
  $('#btnDemo').addEventListener('click', function () {
    snapshot();
    demoScene();
    renderAll();
    toast('ed.demoLoaded', '⭐');
  });
  $('#btnHelp').addEventListener('click', function () {
    $('#modalHelp').classList.add('open');
  });
  $('#modalHelp').addEventListener('click', function (e) {
    if (e.target === e.currentTarget || e.target.hasAttribute('data-close')) {
      $('#modalHelp').classList.remove('open');
    }
  });

  /* ---------------- Son ---------------- */
  function applyMute() {
    $('#btnMute').classList.toggle('active', !view.muted);
    $('#muteIcon').innerHTML = view.muted
      ? '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>'
      : '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M17.8 6.8a7.5 7.5 0 0 1 0 10.4"/>';
  }
  $('#btnMute').addEventListener('click', function () {
    view.muted = !view.muted;
    applyMute();
    toast(view.muted ? 'ed.muted' : 'ed.mute', view.muted ? '🔇' : '🔊');
  });

  /* ---------------- Langue ---------------- */
  $('#langToggle').addEventListener('click', function () {
    const next = window.kreoCurrentLang() === 'fr' ? 'en' : 'fr';
    window.kreoApplyLang(next);
    $('#langLabel').textContent = next.toUpperCase();
  });

  window.addEventListener('kreo:editor-render', function () {
    $('#langLabel').textContent = window.kreoCurrentLang().toUpperCase();
    updateStatusSave();
    renderHierarchy();
    renderInspector();
    if (state.play) $('#playLabel').textContent = t('ed.stop');
    else $('#playLabel').textContent = t('ed.play');
    $('#statusHint').textContent = t('ed.renameHint');
    if (state.play) updateHUD();
  });

  /* ---------------- Autosave ---------------- */
  setInterval(function () {
    if (!state.dirty) return;
    try {
      localStorage.setItem(AUTOKEY, JSON.stringify({ version: 1, scene: state.scene, objects: state.objects }));
    } catch (e) { /* quota */ }
  }, 15000);

  /* ---------------- Init ---------------- */
  if (!loadSaved()) demoScene();
  setZoom(1);
  applyMute();
  renderAll();
  updateStatusSave();
})();

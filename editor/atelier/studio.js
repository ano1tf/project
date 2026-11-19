import { parseKreoAsset, KREO_ASSET_LIMITS } from './asset-format.mjs';
import { arenaPrompt, createKreoRequest, exampleBrief, KREO_REQUEST_FILENAME } from './request.mjs';
import { makeAtelierPreview } from './preview.js';

const guideUrl = new URL('./#protocole', import.meta.url).href;
const sampleUrl = new URL('./exemples/semaphore.kreo-asset.json', import.meta.url);

export function bindArenaAtelier({ context, apply, download, t }) {
  const id = (key) => document.getElementById(key);
  const dialog = id('arenaStudio');
  const brief = id('atelierBrief'),
    scope = id('atelierScope'),
    prompt = id('atelierPrompt');
  const response = id('atelierResponse'),
    file = id('atelierFile'),
    stage = id('atelierStage');
  const toggle = id('atelierPlay'),
    scrub = id('atelierTime'),
    stamp = id('atelierStamp');
  const insert = id('atelierInsert'),
    summary = id('atelierSummary'),
    status = id('atelierValidation');
  const sampleBtn = id('atelierSample'),
    blank = id('atelierBlank'),
    copyHint = id('atelierCopyHint');
  const blankTitle = id('atelierBlankTitle');
  let pending = null,
    playing = false,
    preview = null,
    previewUnavailable = false;
  let time = 0,
    request = null,
    sourceRevision = 0;
  const lang = () => (document.documentElement.lang === 'en' ? 'en' : 'fr');
  const seconds = Object.fromEntries(
    ['fr', 'en'].map((key) => [
      key,
      new Intl.NumberFormat(key, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    ]),
  );
  const setStatus = (key, kind = '', detail = '') => {
    status.dataset.kind = kind;
    status.textContent = (key ? t(key) : '') + (detail ? ' ' + detail : '');
  };
  const updatePrompt = () => {
    const share = scope.value === 'none' ? null : context(scope.value);
    request = createKreoRequest(brief.value, scope.value, share);
    prompt.value = arenaPrompt({ request, guide: guideUrl, lang: lang() });
    id('atelierScopeNote').textContent = request.context
      ? `${request.context.objects.length} / ${share.count} · ${t('atelier.contextHint')}`
      : t(share ? 'atelier.noneFound' : 'atelier.privateHint');
    copyHint.textContent = '';
  };
  const updateTime = () => {
    const duration = pending?.stats.duration || 0;
    const formatter = seconds[lang()];
    stamp.textContent = `${formatter.format(time)} / ${formatter.format(duration)} s`;
    scrub.value = time;
    scrub.setAttribute('aria-valuetext', `${formatter.format(time)} s`);
    toggle.textContent = t(playing ? 'atelier.pause' : 'atelier.play');
    toggle.setAttribute('aria-pressed', String(playing));
  };
  const seek = (seconds) => {
    time = seconds;
    preview?.setTime(time);
    updateTime();
  };
  const pause = () => {
    playing = false;
    preview?.pause();
    updateTime();
  };
  const clear = () => {
    pause();
    preview?.clear();
    pending = null;
    summary.hidden = true;
    summary.textContent = '';
    blank.hidden = false;
    blankTitle.textContent = t('atelier.empty');
    toggle.disabled = scrub.disabled = insert.disabled = true;
    scrub.max = 1;
    seek(0);
  };
  const engagePreview = () => {
    if (!preview && !previewUnavailable) {
      try {
        preview = makeAtelierPreview(stage);
      } catch {
        preview = null;
      }
      previewUnavailable = !preview;
    }
  };
  const validate = () => {
    clear();
    if (!response.value.trim()) {
      setStatus('atelier.noResponse', 'error');
      return;
    }
    try {
      pending = parseKreoAsset(response.value);
    } catch (error) {
      setStatus('atelier.invalid', 'error', error.message);
      return;
    }
    engagePreview();
    const { asset, stats } = pending;
    if (preview) {
      try {
        preview.load(asset);
        blank.hidden = true;
      } catch {
        preview.clear();
        blankTitle.textContent = t('atelier.noPreview');
      }
    } else blankTitle.textContent = t('atelier.noPreview');
    summary.textContent = `${asset.name} · ${stats.meshes} ${t('atelier.meshes')} · ${stats.clips} ${t('atelier.clips')} · ${stats.keys} ${t('atelier.keys')}`;
    summary.hidden = false;
    scrub.max = stats.duration || 1;
    toggle.disabled = scrub.disabled = !stats.duration || blank.hidden === false;
    insert.disabled = false;
    seek(0);
    setStatus('atelier.valid', 'ok');
  };
  const useSource = (text) => {
    response.value = text;
    validate();
  };
  const loadSource = async (loader) => {
    const revision = ++sourceRevision;
    sampleBtn.disabled = true;
    clear();
    setStatus('atelier.loading');
    try {
      const text = await loader();
      if (revision === sourceRevision && dialog.open) useSource(text);
    } catch (error) {
      if (revision === sourceRevision && dialog.open)
        setStatus('atelier.invalid', 'error', error.message);
    } finally {
      if (revision === sourceRevision) sampleBtn.disabled = false;
    }
  };
  const loadSample = () =>
    loadSource(async () => {
      const res = await fetch(sampleUrl);
      if (!res.ok) throw Error(`HTTP ${res.status}`);
      return res.text();
    });
  const open = (withSample = false) => {
    if (dialog.open || id('btnArena').disabled) return;
    updatePrompt();
    dialog.showModal();
    if (withSample) loadSample();
    else if (response.value.trim()) validate();
    else clear();
    brief.focus({ preventScroll: true });
  };
  id('atelierGuide').href = guideUrl;
  id('btnArena').addEventListener('click', () => open());
  id('atelierClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    ++sourceRevision;
    sampleBtn.disabled = false;
    scope.value = 'none';
    pause();
    preview?.clear();
    pending = null;
  });
  brief.addEventListener('input', updatePrompt);
  scope.addEventListener('change', updatePrompt);
  id('atelierExampleBrief').addEventListener('click', () => {
    brief.value = exampleBrief(lang());
    updatePrompt();
    brief.focus();
  });
  id('atelierCopy').addEventListener('click', async () => {
    updatePrompt();
    try {
      await navigator.clipboard.writeText(prompt.value);
      copyHint.textContent = t('atelier.copied');
    } catch {
      prompt.focus();
      prompt.select();
      copyHint.textContent = t('atelier.copyManual');
    }
  });
  id('atelierRequest').addEventListener('click', () => {
    updatePrompt();
    const payload = { ...request, brief: request.brief || exampleBrief(lang()) };
    download(
      new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' }),
      KREO_REQUEST_FILENAME,
    );
    copyHint.textContent = t('atelier.downloaded');
  });
  response.addEventListener('input', () => {
    ++sourceRevision;
    sampleBtn.disabled = false;
    clear();
    setStatus('atelier.awaitValidation');
  });
  id('atelierValidate').addEventListener('click', () => {
    ++sourceRevision;
    sampleBtn.disabled = false;
    validate();
  });
  file.addEventListener('change', () => {
    const selected = file.files?.[0];
    file.value = '';
    if (!selected) return;
    loadSource(() => {
      if (selected.size > KREO_ASSET_LIMITS.bytes) throw Error(t('atelier.tooLarge'));
      return selected.text();
    });
  });
  sampleBtn.addEventListener('click', loadSample);
  scrub.addEventListener('input', () => {
    const target = Number(scrub.value);
    pause();
    seek(target);
  });
  toggle.addEventListener('click', () => {
    if (playing) return pause();
    if (!preview || !pending?.stats.duration) return;
    if (time >= pending.stats.duration - 0.0001) seek(0);
    playing = true;
    updateTime();
    preview.play((dt) => {
      seek(Math.min(time + dt, pending.stats.duration));
      if (time >= pending.stats.duration) pause();
    });
  });
  insert.addEventListener('click', () => {
    if (!pending) return;
    try {
      apply(pending.asset);
      dialog.close();
    } catch (error) {
      setStatus('atelier.insertError', 'error', error.message);
    }
  });
  window.addEventListener('kreo:editor-render', () => {
    if (!dialog.open) return;
    updatePrompt();
    if (pending) validate();
    else {
      blankTitle.textContent = t('atelier.empty');
      updateTime();
    }
  });
  if (new URLSearchParams(location.search).get('atelier') === 'exemple') open(true);
}

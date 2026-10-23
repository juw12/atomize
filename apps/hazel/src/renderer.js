'use strict';

const $ = (id) => document.getElementById(id);

const APP_STORAGE_KEY = 'hazel-app-studio-v1';

const state = {
  file: null,
  info: null,
  result: null,
  formats: [],
  platforms: [],
  createMode: {
    currentMode: 'edit',
    characters: [],
    customCharacters: [],
    sceneType: 'talking',
    sceneDesc: '',
    length: 45,
    aspect: '9:16',
    resolution: '1080',
    mainPrompt: '',
    generatedProject: null,
    selectedPlatforms: [],
    publishQueue: [],
    uploadQueue: [],
    storageItems: []
  }
};

// Guide recommendations with affiliate links
const GUIDE_RECOMMENDATIONS = [
  {
    title: 'Shure MV7+ Podcast Microphone',
    blurb: 'Professional USB/XLR dynamic mic with excellent voice isolation. Perfect for talking-head videos.',
    url: 'https://www.amazon.com/Shure-MV7-Podcast-Microphone-MV7-US/dp/B08G7RG96Y'
  },
  {
    title: 'Elgato Key Light Air',
    blurb: 'LED panel with app control. Soft, even lighting that makes you look polished on camera.',
    url: 'https://www.amazon.com/Elgato-Key-Light-Air/dp/B08M39JW6Q'
  },
  {
    title: 'Descript (Video Editing)',
    blurb: 'Edit video by editing text. AI-powered transcription and seamless cut features.',
    url: 'https://www.descript.com/'
  },
  {
    title: 'Buzzsprout (Podcast Hosting)',
    blurb: 'Simple podcast hosting with analytics, distribution to all platforms, and monetization tools.',
    url: 'https://www.buzzsprout.com/'
  },
  {
    title: 'TubeBuddy (YouTube Analytics)',
    blurb: 'Browser extension for YouTube creators. Keyword research, A/B testing, and performance tracking.',
    url: 'https://www.tubebuddy.com/'
  },
  {
    title: 'Logitech Brio 4K Webcam',
    blurb: '4K HDR webcam with auto-focus and adjustable field of view. Great backup or A-camera.',
    url: 'https://www.amazon.com/Logitech-Brio-Streaming-Webcam-Black/dp/B01N5UOYC4'
  }
];

// Tour configuration
const TOUR_STEPS = [
  {
    title: 'Welcome to Hazel',
    content: 'Hazel is your desktop studio for creators. Film once, and let Hazel automatically cut silences, repurpose for every platform, and help you learn what works.'
  },
  {
    title: 'Import Your Footage',
    content: 'Click <strong>"Import footage"</strong> to bring in your raw video. Hazel supports all common formats and reads metadata instantly.'
  },
  {
    title: 'Auto-cut Magic',
    content: 'Enable <strong>"Remove silences & pauses"</strong> and optionally <strong>"Remove filler words"</strong>. Hazel analyzes your audio and creates a clean cut list automatically.'
  },
  {
    title: 'Repurpose & Publish',
    content: 'Export in 9:16, 1:1, and 16:9 formats. Then prepare a post package with caption and deep-link directly to your platform\'s uploader.'
  },
  {
    title: 'Track Traffic & Storage',
    content: 'Import analytics CSVs to see unified performance. Use Storage to scan for duplicates and auto-archive raw files after export.'
  }
];

const TOUR_STORAGE_KEY = 'hazel_guide_tour_v1';

// --- helpers -------------------------------------------------------------

function pad(n) { return String(n).padStart(2, '0'); }

function fmtTime(sec) {
  if (!isFinite(sec)) return '0:00';
  const s = Math.max(0, Math.round(sec * 10) / 10);
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1);
  return `${m}:${r.padStart(4, '0')}`;
}

function fmtBytes(n) {
  if (!n) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

function toFileUrl(p) {
  let u = p.replace(/\\/g, '/');
  u = encodeURI(u).replace(/#/g, '%23').replace(/\?/g, '%3F');
  return 'file:///' + u;
}

function setStatus(msg, kind) {
  const el = $('status');
  el.textContent = msg || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
}

// --- import --------------------------------------------------------------

async function onImport() {
  try {
    const picked = await window.hazel.pickVideo();
    if (!picked) return;

    state.file = picked.path;
    state.info = picked.info;
    state.result = null;

    $('video').src = toFileUrl(picked.path);
    $('empty').style.display = 'none';

    renderMeta(picked);
    $('detect').disabled = false;
    $('render').disabled = false;
    $('cutList').innerHTML = '';
    $('cutCount').textContent = '0';
    $('exportFormats').disabled = false;
    $('formatList').innerHTML = '';
    $('prepare').disabled = false;
    $('pkgInfo').innerHTML = '';
    state.formats = [];
    setStatus('');
  } catch (e) {
    setStatus('Import failed: ' + e.message, 'err');
  }
}

function renderMeta(picked) {
  const i = picked.info || {};
  const bits = [
    ['File', picked.name],
    ['Duration', fmtTime(i.duration)],
    ['Resolution', i.width && i.height ? `${i.width}×${i.height}` : '—'],
    ['Video', i.videoCodec || '—'],
    ['Audio', i.audioCodec || '—'],
    ['Size', fmtBytes(i.sizeBytes)]
  ];
  $('meta').innerHTML = bits
    .map(([k, v]) => `<span>${k}: <b>${String(v)}</b></span>`)
    .join('');
}

// --- detect + render -----------------------------------------------------

async function onDetect() {
  if (!state.file) return;
  $('detect').disabled = true;
  setStatus('Analyzing audio…', 'busy');
  try {
    const wantFillers = $('doFiller').checked;
    const opts = {
      removeSilences: $('doSilence').checked,
      removeFillers: wantFillers,
      minSilence: parseFloat($('minSilence').value),
      padding: 0.08
    };
    const res = await window.hazel.detectCuts(state.file, opts);
    state.result = res;
    renderCuts(res);

    const pct = res.duration > 0 ? Math.round((res.removed / res.duration) * 100) : 0;
    $('render').disabled = res.segments.length === 0;

    const nSil = res.cuts.filter((c) => c.kind === 'silence').length;
    const nFil = res.cuts.filter((c) => c.kind === 'filler').length;
    let msg = `Found ${res.cuts.length} cuts (${nSil} silence · ${nFil} filler) · removes ${fmtTime(res.removed)} (${pct}%)`;
    if (res.cuts.length === 0) msg = 'Nothing found — try a lower pause threshold.';

    let kind = 'ok';
    if (wantFillers && res.filler && !res.filler.available) {
      msg += ' · filler backend not installed';
      kind = 'busy';
    }
    setStatus(msg, kind);
  } catch (e) {
    setStatus('Could not analyze: ' + e.message, 'err');
  } finally {
    $('detect').disabled = false;
  }
}

function renderCuts(res) {
  $('cutCount').textContent = String(res.cuts.length);
  const ul = $('cutList');
  if (!res.cuts.length) {
    ul.innerHTML = '<li><span class="kind">—</span><span>nothing detected</span></li>';
    return;
  }
  ul.innerHTML = res.cuts
    .slice(0, 200)
    .map((c) => {
      const label = c.label || c.kind || 'cut';
      const cls = c.kind === 'filler' ? 'kind filler' : 'kind';
      return `<li><span class="${cls}">${label}</span><span>${fmtTime(c.start)} \u2192 ${fmtTime(c.end)} <b>(${(c.end - c.start).toFixed(1)}s)</b></span></li>`;
    })
    .join('');
}

async function onRender() {
  if (!state.file) return;

  if (!state.result) await onDetect();
  if (!state.result || state.result.segments.length === 0) {
    setStatus('Nothing to export — no segments kept. Lower the pause threshold and try again.', 'err');
    return;
  }

  $('render').disabled = true;
  setStatus('Rendering clean cut…', 'busy');
  try {
    const res = await window.hazel.renderCut(state.file, state.result.segments, {});
    const out = res && res.out ? res.out : res;
    const archivedCount = res && res.archived && res.archived.archived ? res.archived.archived.length : 0;
    setStatus('Saved · ' + out + (archivedCount ? ' · raw archived' : ''), 'ok');
    showReveal(out);
  } catch (e) {
    setStatus('Render failed: ' + e.message, 'err');
  } finally {
    $('render').disabled = false;
  }
}

async function onExportFormats() {
  if (!state.file) return;
  const ratios = [];
  if ($('rVertical').checked) ratios.push('vertical');
  if ($('rSquare').checked) ratios.push('square');
  if ($('rWide').checked) ratios.push('wide');
  if (!ratios.length) { setStatus('Pick at least one format.', 'err'); return; }

  $('exportFormats').disabled = true;
  setStatus('Exporting formats…', 'busy');
  try {
    const outputs = await window.hazel.repurpose(state.file, { ratios });
    renderFormats(outputs);
    setStatus(`Exported ${outputs.length} format(s)`, 'ok');
  } catch (e) {
    setStatus('Format export failed: ' + e.message, 'err');
  } finally {
    $('exportFormats').disabled = false;
  }
}

function renderFormats(outputs) {
  state.formats = outputs || [];
  const ul = $('formatList');
  ul.innerHTML = outputs
    .map((o) => {
      const name = String(o.path).split(/[\\/]/).pop();
      return `<li><span class="ok">${o.ratio}</span><span>${o.width}×${o.height} · ${name}</span></li>`;
    })
    .join('');
}

function showReveal(out) {
  let btn = $('revealBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'revealBtn';
    btn.className = 'btn';
    btn.textContent = 'Reveal in folder';
    btn.style.marginTop = '8px';
    btn.style.width = '100%';
    $('status').insertAdjacentElement('afterend', btn);
  }
  btn.onclick = () => window.hazel.reveal(out);
}

// --- publish -------------------------------------------------------------

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  ta.remove();
  return Promise.resolve();
}

async function initPublish() {
  try { state.platforms = await window.hazel.publishPlatforms(); } catch { state.platforms = []; }
  $('platform').innerHTML = state.platforms.map((p) => `<option value="${p.key}">${p.name}</option>`).join('');
  await refreshQueue();
}

function currentPlatform() {
  return state.platforms.find((p) => p.key === $('platform').value) || state.platforms[0] || null;
}

function formatPathFor(platform) {
  const hit = state.formats.find((f) => f.ratio === platform.ratio);
  return hit ? hit.path : null;
}

async function onPrepare() {
  if (!state.file) return;
  const platform = currentPlatform();
  if (!platform) return;
  $('prepare').disabled = true;
  setStatus('Preparing package…', 'busy');
  try {
    const pkg = await window.hazel.publishPackage({
      file: state.file,
      platform: platform.key,
      text: $('caption').value || '',
      formatPath: formatPathFor(platform)
    });
    renderPackage(pkg);
    setStatus('Package ready · ' + pkg.dir, 'ok');
  } catch (e) {
    setStatus('Package failed: ' + e.message, 'err');
  } finally {
    $('prepare').disabled = false;
  }
}

function renderPackage(pkg) {
  const el = $('pkgInfo');
  el.innerHTML = '';

  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.textContent = pkg.caption || '(no caption)';
  el.appendChild(cap);

  const row = document.createElement('div');
  row.className = 'row';

  const mk = (label, fn) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    b.onclick = fn;
    return b;
  };

  row.append(
    mk('Copy caption', () => copyText(pkg.caption).then(() => setStatus('Caption copied', 'ok'))),
    mk('Open ' + pkg.platform.name, () => window.hazel.openExternal(pkg.uploadUrl)),
    mk('Reveal', () => window.hazel.reveal(pkg.video)),
    mk('Add to queue', async () => {
      await window.hazel.queueAdd({ platform: pkg.platform.name, label: (pkg.caption || '').slice(0, 40), dir: pkg.dir, video: pkg.video });
      await refreshQueue();
      setStatus('Added to queue', 'ok');
    })
  );
  el.appendChild(row);
}

async function refreshQueue() {
  let items = [];
  try { items = await window.hazel.queueList(); } catch { items = []; }
  $('queueCount').textContent = String(items.length);
  const ul = $('queueList');
  ul.innerHTML = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="kind">—</span><span>empty</span>';
    ul.appendChild(li);
    return;
  }
  items.forEach((it) => {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.textContent = `${it.platform || 'clip'} · ${it.label || ''}`;
    const rm = document.createElement('button');
    rm.className = 'remove';
    rm.textContent = 'remove';
    rm.onclick = async () => { await window.hazel.queueRemove(it.id); await refreshQueue(); };
    li.append(left, rm);
    ul.appendChild(li);
  });
}

// --- traffic -------------------------------------------------------------

function fmtNum(n) {
  if (!isFinite(n)) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function renderTraffic(summary) {
  const s = summary || { totals: {}, byPlatform: [], top: [] };
  const t = s.totals || {};
  $('trafficSummary').innerHTML =
    `<div class="totals"><span>posts <b>${t.posts || 0}</b></span><span>views <b>${fmtNum(t.views)}</b></span><span>likes <b>${fmtNum(t.likes)}</b></span></div>` +
    (s.byPlatform || [])
      .map((p) => `<div class="plat"><span>${p.platform}</span><span>${p.posts} posts · <span class="v">${fmtNum(p.views)}</span></span></div>`)
      .join('');

  const ul = $('topList');
  const top = s.top || [];
  if (!top.length) {
    ul.innerHTML = '<li><span class="kind">—</span><span>no posts yet</span></li>';
    return;
  }
  ul.innerHTML = top
    .map((r) => `<li><span class="ok">${fmtNum(r.views)}</span><span>${r.platform} · ${r.title ? r.title.slice(0, 34) : '(untitled)'}</span></li>`)
    .join('');
}

async function initTraffic() {
  try {
    const res = await window.hazel.analyticsSummary();
    renderTraffic(res.summary);
  } catch {
    renderTraffic({ totals: {}, byPlatform: [], top: [] });
  }
}

async function onImportStats() {
  try {
    const res = await window.hazel.analyticsImport();
    if (!res) return;
    renderTraffic(res.summary);
    const name = String(res.file).split(/[\\/]/).pop();
    setStatus(`Imported ${res.matched} rows from ${name}`, 'ok');
  } catch (e) {
    setStatus('Import failed: ' + e.message, 'err');
  }
}

async function onClearStats() {
  try {
    const res = await window.hazel.analyticsClear();
    renderTraffic(res.summary);
    setStatus('Stats cleared', 'ok');
  } catch (e) {
    setStatus('Clear failed: ' + e.message, 'err');
  }
}

// --- storage -------------------------------------------------------------

const storageState = { dir: null, duplicates: [] };

function renderStorage(res) {
  const u = res.usage || {};
  const dupeFiles = (res.duplicates || []).reduce((a, g) => a + g.length, 0);
  $('storageSummary').innerHTML =
    `<div><b>${u.count || 0}</b> videos · <b>${fmtBytes(u.totalBytes || 0)}</b></div>` +
    `<div>${(res.duplicates || []).length} duplicate set(s) · <span class="dupes">${dupeFiles} files</span></div>`;
  $('archiveDupes').disabled = dupeFiles === 0;
}

async function onScanFolder() {
  try {
    const res = await window.hazel.scanStorage();
    if (!res) return;
    storageState.dir = res.dir;
    storageState.duplicates = res.duplicates || [];
    renderStorage(res);
    setStatus(`Scanned ${res.files.length} video(s) in ${res.dir}`, 'ok');
  } catch (e) {
    setStatus('Scan failed: ' + e.message, 'err');
  }
}

async function onArchiveDupes() {
  const files = [];
  for (const group of storageState.duplicates) {
    for (let i = 1; i < group.length; i += 1) files.push(group[i]);
  }
  if (!files.length) return;
  $('archiveDupes').disabled = true;
  try {
    const dir = (storageState.dir || '') + '/_hazel-archive';
    const res = await window.hazel.archiveStorage({ files, dir });
    setStatus(`Archived ${res.archived.length} file(s) to ${res.dir}`, 'ok');
    await onScanFolder();
  } catch (e) {
    setStatus('Archive failed: ' + e.message, 'err');
    $('archiveDupes').disabled = false;
  }
}

async function initSettings() {
  try {
    const s = await window.hazel.settingsGet();
    $('autoArchive').checked = Boolean(s.autoArchive);
  } catch { /* ignore */ }
  $('autoArchive').addEventListener('change', async (e) => {
    try {
      await window.hazel.settingsSet({ autoArchive: e.target.checked });
      setStatus('Auto-archive ' + (e.target.checked ? 'on' : 'off'), 'ok');
    } catch { /* ignore */ }
  });
}

// --- Guide section -------------------------------------------------------

function renderRecommendations() {
  const ul = $('recommendationsList');
  if (!ul) return;
  ul.innerHTML = GUIDE_RECOMMENDATIONS.map((rec) => `
    <li>
      <p class="rec-title">${rec.title}</p>
      <p class="rec-blurb">${rec.blurb}</p>
      <a class="rec-link" href="${rec.url}" target="_blank" rel="sponsored noopener">Learn more →</a>
    </li>
  `).join('');
}

function showGuide() {
  $('guideSection').style.display = 'block';
  $('preview').style.display = 'none';
  renderRecommendations();
}

function hideGuide() {
  $('guideSection').style.display = 'none';
  $('preview').style.display = 'flex';
}

// --- Tour overlay --------------------------------------------------------

let tourCurrentStep = 0;
let tourIsActive = false;

function getTourCompleted() {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function setTourCompleted() {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, '1');
  } catch {
    // localStorage unavailable - in-memory only
  }
}

function showTourOverlay() {
  tourCurrentStep = 0;
  tourIsActive = true;
  $('tourOverlay').style.display = 'flex';
  updateTourStep();
}

function hideTourOverlay() {
  $('tourOverlay').style.display = 'none';
  tourIsActive = false;
}

function updateTourStep() {
  const step = TOUR_STEPS[tourCurrentStep];
  if (!step) return;

  $('tourTitle').textContent = step.title;
  $('tourContent').innerHTML = step.content;

  // Update progress dots
  const dots = document.querySelectorAll('.tour-dot');
  dots.forEach((dot, idx) => {
    dot.classList.remove('active', 'completed');
    if (idx === tourCurrentStep) {
      dot.classList.add('active');
    } else if (idx < tourCurrentStep) {
      dot.classList.add('completed');
    }
  });

  // Button states
  $('tourBack').disabled = tourCurrentStep === 0;
  $('tourContinue').style.display = tourCurrentStep === TOUR_STEPS.length - 1 ? 'none' : 'inline-block';
  $('tourDone').style.display = tourCurrentStep === TOUR_STEPS.length - 1 ? 'inline-block' : 'none';
}

function nextTourStep() {
  if (tourCurrentStep < TOUR_STEPS.length - 1) {
    tourCurrentStep += 1;
    updateTourStep();
  }
}

function prevTourStep() {
  if (tourCurrentStep > 0) {
    tourCurrentStep -= 1;
    updateTourStep();
  }
}

function completeTour() {
  setTourCompleted();
  hideTourOverlay();
}

function skipTour() {
  setTourCompleted();
  hideTourOverlay();
}

// --- wiring --------------------------------------------------------------

$('import').addEventListener('click', onImport);
$('detect').addEventListener('click', onDetect);
$('render').addEventListener('click', onRender);
$('exportFormats').addEventListener('click', onExportFormats);
$('prepare').addEventListener('click', onPrepare);
$('importStats').addEventListener('click', onImportStats);
$('clearStats').addEventListener('click', onClearStats);
$('scanFolder').addEventListener('click', onScanFolder);
$('archiveDupes').addEventListener('click', onArchiveDupes);

// Guide navigation
$('guideNav').addEventListener('click', showGuide);
$('closeGuide').addEventListener('click', hideGuide);
$('startTour').addEventListener('click', showTourOverlay);

// Tour controls
$('tourContinue').addEventListener('click', nextTourStep);
$('tourBack').addEventListener('click', prevTourStep);
$('tourSkip').addEventListener('click', skipTour);
$('tourDone').addEventListener('click', completeTour);

// Keyboard: Esc to skip tour
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && tourIsActive) {
    skipTour();
  }
});

$('minSilence').addEventListener('input', (e) => {
  $('threshVal').textContent = parseFloat(e.target.value).toFixed(2) + 's';
});

initPublish();
initTraffic();
initSettings();

// First-run tour auto-launch
if (!getTourCompleted()) {
  // Delay slightly to ensure DOM is ready
  setTimeout(showTourOverlay, 500);
}

if (window.hazel && window.hazel.onProgress) {
  window.hazel.onProgress((p) => {
    if (p.phase === 'detect') setStatus('Analyzing audio…', 'busy');
    if (p.phase === 'extract-audio') setStatus('Preparing audio…', 'busy');
    if (p.phase === 'transcribe') setStatus('Transcribing for fillers… (first run downloads a model)', 'busy');
    if (p.phase === 'render') setStatus('Rendering clean cut…', 'busy');
    if (p.phase === 'repurpose') setStatus('Exporting ' + (p.ratio || '') + '…', 'busy');
  });
}

// --- CREATE MODE -----------------------------------------------------------

function loadAppState() {
  try {
    const saved = localStorage.getItem(APP_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      state.createMode = { ...state.createMode, ...parsed.createMode };
    }
  } catch (e) {
    console.warn('Failed to load app state:', e);
  }
}

function saveAppState() {
  try {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify({ createMode: state.createMode }));
  } catch (e) {
    console.warn('Failed to save app state:', e);
  }
}

function switchMode(mode) {
  state.createMode.currentMode = mode;
  saveAppState();

  const createSection = $('createModeSection');
  const editSection = $('editModeSection');
  const createPanel = $('createPanel');
  const editPanel = $('editPanel');
  const modeCreateBtn = $('modeCreate');
  const modeEditBtn = $('modeEdit');

  if (mode === 'create') {
    if (createSection) createSection.style.display = 'flex';
    if (editSection) editSection.style.display = 'none';
    if (createPanel) createPanel.style.display = 'flex';
    if (editPanel) editPanel.style.display = 'none';
    if (modeCreateBtn) modeCreateBtn.classList.add('active');
    if (modeEditBtn) modeEditBtn.classList.remove('active');
    renderCreateMode();
  } else {
    if (createSection) createSection.style.display = 'none';
    if (editSection) editSection.style.display = 'flex';
    if (createPanel) createPanel.style.display = 'none';
    if (editPanel) editPanel.style.display = 'flex';
    if (modeCreateBtn) modeCreateBtn.classList.remove('active');
    if (modeEditBtn) modeEditBtn.classList.add('active');
  }
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function initCreateMode() {
  const charGrid = $('charGrid');
  if (charGrid) {
    charGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.char-card');
      if (card && card.dataset.char) {
        toggleChar(card.dataset.char);
      }
      if (e.target.classList.contains('add-char-btn')) {
        const form = $('customCharForm');
        if (form) form.classList.remove('hidden');
      }
    });

    charGrid.addEventListener('keydown', (e) => {
      const card = e.target.closest('.char-card');
      if (card && card.dataset.char && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        toggleChar(card.dataset.char);
      }
    });
  }

  const cancelChar = $('cancelChar');
  if (cancelChar) {
    cancelChar.addEventListener('click', () => {
      const form = $('customCharForm');
      if (form) form.classList.add('hidden');
      $('customCharName').value = '';
      $('customCharDesc').value = '';
    });
  }

  const addCustomChar = $('addCustomChar');
  if (addCustomChar) {
    addCustomChar.addEventListener('click', () => {
      const name = $('customCharName').value.trim();
      const desc = $('customCharDesc').value.trim();
      if (name) {
        state.createMode.customCharacters.push({ name, desc });
        saveAppState();
        renderCharSelection();
        const form = $('customCharForm');
        if (form) form.classList.add('hidden');
        $('customCharName').value = '';
        $('customCharDesc').value = '';
      }
    });
  }

  const sceneOptions = $('sceneOptions');
  if (sceneOptions) {
    sceneOptions.addEventListener('click', (e) => {
      const opt = e.target.closest('.scene-option');
      if (opt) {
        state.createMode.sceneType = opt.dataset.scene;
        saveAppState();
        renderSceneType();
      }
    });
  }

  const lengthOptions = $('lengthOptions');
  if (lengthOptions) {
    lengthOptions.addEventListener('click', (e) => {
      const btn = e.target.closest('.option-btn');
      if (btn && btn.dataset.length) {
        state.createMode.length = parseInt(btn.dataset.length);
        saveAppState();
        renderOptions();
      }
    });
  }

  const aspectOptions = $('aspectOptions');
  if (aspectOptions) {
    aspectOptions.addEventListener('click', (e) => {
      const btn = e.target.closest('.option-btn');
      if (btn && btn.dataset.aspect) {
        state.createMode.aspect = btn.dataset.aspect;
        saveAppState();
        renderOptions();
      }
    });
  }

  const resOptions = $('resOptions');
  if (resOptions) {
    resOptions.addEventListener('click', (e) => {
      const btn = e.target.closest('.option-btn');
      if (btn && btn.dataset.res) {
        state.createMode.resolution = btn.dataset.res;
        saveAppState();
        renderOptions();
      }
    });
  }

  const sceneDesc = $('sceneDesc');
  if (sceneDesc) {
    sceneDesc.addEventListener('input', (e) => {
      state.createMode.sceneDesc = e.target.value;
      saveAppState();
    });
  }

  const mainPrompt = $('mainPrompt');
  if (mainPrompt) {
    mainPrompt.addEventListener('input', (e) => {
      state.createMode.mainPrompt = e.target.value;
      saveAppState();
    });
  }

  const generateBtn = $('generateBtn');
  if (generateBtn) {
    generateBtn.addEventListener('click', onGenerate);
  }

  const sendToEditorBtn = $('sendToEditorBtn');
  if (sendToEditorBtn) {
    sendToEditorBtn.addEventListener('click', onSendToEditor);
  }

  const modeCreateBtn = $('modeCreate');
  const modeEditBtn = $('modeEdit');
  if (modeCreateBtn) {
    modeCreateBtn.addEventListener('click', () => switchMode('create'));
  }
  if (modeEditBtn) {
    modeEditBtn.addEventListener('click', () => switchMode('edit'));
  }

  const platformGrid = $('platformGrid');
  if (platformGrid) {
    platformGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.platform-card');
      if (card) {
        togglePlatform(card.dataset.platform);
      }
    });
  }

  const deployBtn = $('deployBtn');
  if (deployBtn) {
    deployBtn.addEventListener('click', onDeploy);
  }

  const dropZone = $('dropZone');
  const fileInput = $('fileInput');
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
    });
  }

  const uploadBtn = $('uploadBtn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', onUpload);
  }

  const backupBtn = $('backupBtn');
  if (backupBtn) {
    backupBtn.addEventListener('click', onBackup);
  }

  const cleanupBtn = $('cleanupBtn');
  if (cleanupBtn) {
    cleanupBtn.addEventListener('click', onCleanup);
  }

  loadAppState();
  renderCreateMode();
}

function toggleChar(charId) {
  const idx = state.createMode.characters.indexOf(charId);
  if (idx === -1) {
    state.createMode.characters.push(charId);
  } else {
    state.createMode.characters.splice(idx, 1);
  }
  saveAppState();
  renderCharSelection();
}

function renderCharSelection() {
  const cards = document.querySelectorAll('.char-card');
  cards.forEach((card) => {
    const isSelected = state.createMode.characters.includes(card.dataset.char);
    card.classList.toggle('selected', isSelected);
    card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });

  const customCards = document.querySelectorAll('.char-card.custom');
  customCards.forEach((el) => el.remove());

  state.createMode.customCharacters.forEach((char, idx) => {
    const card = document.createElement('div');
    card.className = 'char-card custom' + (state.createMode.characters.includes('custom-' + idx) ? ' selected' : '');
    card.setAttribute('role', 'checkbox');
    card.setAttribute('aria-checked', state.createMode.characters.includes('custom-' + idx) ? 'true' : 'false');
    card.setAttribute('tabindex', '0');
    card.innerHTML = '<div class="char-check">&#10003;</div><div class="char-name">' + escapeHtml(char.name) + '</div><div class="char-desc">' + escapeHtml(char.desc) + '</div>';
    card.addEventListener('click', () => toggleCustomChar(idx));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCustomChar(idx);
      }
    });
    const addBtn = $('addCharBtn');
    if (addBtn) addBtn.before(card);
  });
}

function toggleCustomChar(idx) {
  const key = 'custom-' + idx;
  const pos = state.createMode.characters.indexOf(key);
  if (pos === -1) {
    state.createMode.characters.push(key);
  } else {
    state.createMode.characters.splice(pos, 1);
  }
  saveAppState();
  renderCharSelection();
}

function renderSceneType() {
  const opts = document.querySelectorAll('.scene-option');
  opts.forEach((opt) => {
    opt.classList.toggle('selected', opt.dataset.scene === state.createMode.sceneType);
  });
}

function renderOptions() {
  const lengthBtns = document.querySelectorAll('#lengthOptions .option-btn');
  lengthBtns.forEach((btn) => {
    btn.classList.toggle('selected', parseInt(btn.dataset.length) === state.createMode.length);
  });

  const aspectBtns = document.querySelectorAll('#aspectOptions .option-btn');
  aspectBtns.forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.aspect === state.createMode.aspect);
  });

  const resBtns = document.querySelectorAll('#resOptions .option-btn');
  resBtns.forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.res === state.createMode.resolution);
  });
}

function renderCreateMode() {
  const sceneDesc = $('sceneDesc');
  const mainPrompt = $('mainPrompt');
  if (sceneDesc) sceneDesc.value = state.createMode.sceneDesc;
  if (mainPrompt) mainPrompt.value = state.createMode.mainPrompt;

  renderCharSelection();
  renderSceneType();
  renderOptions();
  renderPlatformSelection();
  renderPublishQueue();
  renderUploadQueue();
  renderStorage();
}

function onGenerate() {
  const prompt = state.createMode.mainPrompt.trim();
  if (!prompt) {
    alert('Please enter a main prompt');
    return;
  }

  const btn = $('generateBtn');
  const generating = $('generatingState');
  if (btn) btn.disabled = true;
  if (generating) generating.classList.remove('hidden');

  setTimeout(() => {
    const project = createDeterministicProject();
    state.createMode.generatedProject = project;
    saveAppState();

    if (btn) btn.disabled = false;
    if (generating) generating.classList.add('hidden');

    renderStoryboard();
    const section = $('storyboardSection');
    if (section) section.classList.remove('hidden');
  }, 1500);
}

function createDeterministicProject() {
  const s = state.createMode;
  const seed = hashString(s.mainPrompt + s.sceneType + s.sceneDesc + s.characters.join(',') + s.length);
  const charNames = s.characters.map((c) => {
    if (c.startsWith('custom-')) {
      const idx = parseInt(c.split('-')[1]);
      return s.customCharacters[idx]?.name || 'Custom';
    }
    const names = { alex: 'Alex', maria: 'Maria', dev: 'Dev' };
    return names[c] || c;
  });

  const sceneLabels = {
    talking: 'Talking to camera',
    interaction: 'Interaction / Drama'
  };

  const shotCount = Math.max(3, Math.min(8, Math.floor(s.length / 10)));
  const baseDur = Math.floor(s.length / shotCount);
  let remaining = s.length;

  const shots = [];
  const promptWords = s.mainPrompt.split(/\s+/).filter((w) => w.length > 3);
  const sceneWords = s.sceneDesc.split(/\s+/).filter((w) => w.length > 3);

  for (let i = 0; i < shotCount; i++) {
    const isLast = i === shotCount - 1;
    const dur = isLast ? remaining : Math.max(5, baseDur + ((seed + i) % 5) - 2);
    remaining -= dur;

    const shotLabel = sceneLabels[s.sceneType] + ' ' + (i + 1);
    const charRef = charNames.length > 0 ? charNames[i % charNames.length] : 'Host';
    const promptRef = promptWords[i % promptWords.length] || 'topic';
    const sceneRef = sceneWords[i % sceneWords.length] || 'setting';

    shots.push({
      id: 'shot-' + i,
      label: shotLabel,
      duration: dur,
      caption: charRef + ' discusses ' + promptRef + ' in ' + sceneRef + ' setting',
      description: charRef + ' on camera, ' + s.sceneType + ' style. Key point: ' + promptRef + '. Atmosphere: ' + sceneRef + '.'
    });
  }

  return {
    aspect: s.aspect,
    resolution: s.resolution,
    length: s.length,
    sceneType: s.sceneType,
    characters: [...s.characters],
    sceneDesc: s.sceneDesc,
    prompt: s.mainPrompt,
    shots: shots,
    createdAt: Date.now()
  };
}

function renderStoryboard() {
  const project = state.createMode.generatedProject;
  if (!project) return;

  const container = $('storyboard');
  if (!container) return;
  container.innerHTML = '';

  project.shots.forEach((shot) => {
    const shotEl = document.createElement('div');
    shotEl.className = 'shot';
    shotEl.innerHTML = '<div class="shot-label">' + escapeHtml(shot.label) + '</div><div class="shot-dur">' + shot.duration + 's</div><div class="shot-desc">' + escapeHtml(shot.description) + '</div>';
    container.appendChild(shotEl);
  });
}

function onSendToEditor() {
  switchMode('edit');
  const status = $('sendStatus');
  if (status) {
    status.textContent = 'Project sent to editor. Switch to Edit mode to continue.';
    status.className = 'status ok';
    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
  }
}

function togglePlatform(platform) {
  const idx = state.createMode.selectedPlatforms.indexOf(platform);
  if (idx === -1) {
    state.createMode.selectedPlatforms.push(platform);
  } else {
    state.createMode.selectedPlatforms.splice(idx, 1);
  }
  saveAppState();
  renderPlatformSelection();
}

function renderPlatformSelection() {
  const cards = document.querySelectorAll('.platform-card');
  cards.forEach((card) => {
    const isSelected = state.createMode.selectedPlatforms.includes(card.dataset.platform);
    card.classList.toggle('selected', isSelected);
    card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });

  const count = $('deployCount');
  if (count) count.textContent = String(state.createMode.selectedPlatforms.length);
}

function onDeploy() {
  const platforms = state.createMode.selectedPlatforms;
  if (!platforms.length) {
    alert('Please select at least one platform');
    return;
  }

  const caption = $('publishCaption').value || '';
  const schedule = $('publishSchedule').value || 'now';

  platforms.forEach((platform) => {
    const item = {
      id: 'pub-' + Date.now() + '-' + platform,
      platform: platform,
      caption: caption,
      schedule: schedule,
      status: 'pending',
      progress: 0
    };
    state.createMode.publishQueue.push(item);
  });
  saveAppState();
  renderPublishQueue();

  state.createMode.publishQueue.forEach((item, idx) => {
    if (item.status !== 'pending') return;
    simulatePublish(idx);
  });
}

function simulatePublish(queueIdx) {
  const item = state.createMode.publishQueue[queueIdx];
  if (!item) return;

  item.status = 'progress';
  saveAppState();
  renderPublishQueue();

  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.floor(Math.random() * 20) + 10;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      item.status = 'done';
      item.progress = 100;
      saveAppState();
      renderPublishQueue();
    } else {
      item.progress = progress;
      saveAppState();
      renderPublishQueue();
    }
  }, 500);
}

function renderPublishQueue() {
  const container = $('publishQueue');
  if (!container) return;

  const queue = state.createMode.publishQueue;
  if (!queue.length) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = '';

  queue.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'queue-item';
    el.innerHTML = '<div class="queue-header"><span class="queue-platform">' + escapeHtml(item.platform) + '</span><span class="queue-status ' + item.status + '">' + item.status + '</span></div><div class="progress-bar"><div class="progress-fill"></div></div>';
    const fill = el.querySelector('.progress-fill');
    if (fill) fill.style.width = item.progress + '%';
    container.appendChild(el);
  });
}

function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  files.forEach((file) => {
    const item = {
      id: 'file-' + Date.now() + '-' + file.name,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'pending',
      progress: 0,
      caption: '',
      platforms: [...state.createMode.selectedPlatforms]
    };
    state.createMode.uploadQueue.push(item);
  });
  saveAppState();
  renderUploadQueue();

  const btn = $('uploadBtn');
  if (btn) btn.disabled = false;
}

function renderUploadQueue() {
  const container = $('uploadQueue');
  if (!container) return;

  const queue = state.createMode.uploadQueue;
  if (!queue.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';
  queue.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'upload-item';
    const sizeStr = fmtBytes(item.size);
    el.innerHTML = '<div class="file-info"><span class="file-name">' + escapeHtml(item.name) + '</span><span class="file-meta">' + sizeStr + ' - ' + item.type + '</span><input class="file-caption" type="text" placeholder="Add caption..." value="' + escapeHtml(item.caption) + '" /></div><span class="file-status ' + item.status + '">' + item.status + '</span>';
    const captionInput = el.querySelector('.file-caption');
    if (captionInput) {
      captionInput.addEventListener('input', (e) => {
        item.caption = e.target.value;
        saveAppState();
      });
    }
    container.appendChild(el);
  });
}

function onUpload() {
  const queue = state.createMode.uploadQueue;
  queue.forEach((item, idx) => {
    if (item.status !== 'pending') return;
    simulateUpload(idx);
  });
  saveAppState();
}

function simulateUpload(queueIdx) {
  const item = state.createMode.uploadQueue[queueIdx];
  if (!item) return;

  item.status = 'uploading';
  saveAppState();
  renderUploadQueue();

  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.floor(Math.random() * 15) + 10;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      item.status = 'done';
      item.progress = 100;
      saveAppState();
      renderUploadQueue();
    } else {
      item.progress = progress;
      saveAppState();
      renderUploadQueue();
    }
  }, 600);
}

function onBackup() {
  const summary = $('cleanupSummary');
  if (summary) {
    summary.classList.remove('hidden');
    summary.innerHTML = 'Backed up <b>' + state.createMode.storageItems.length + '</b> items to Memories.';
  }
}

function onCleanup() {
  const ruleAutoDelete = $('ruleAutoDelete');
  const ruleRemoveDupes = $('ruleRemoveDupes');
  const ruleCompress = $('ruleCompress');
  const autoDeleteDays = $('autoDeleteDays');

  let freed = 0;
  let deleted = 0;
  let compressed = 0;

  if (ruleRemoveDupes && ruleRemoveDupes.checked) {
    deleted = Math.floor(state.createMode.storageItems.length * 0.2);
    freed += deleted * 50 * 1024 * 1024;
  }

  if (ruleCompress && ruleCompress.checked) {
    compressed = Math.floor(state.createMode.storageItems.length * 0.1);
    freed += compressed * 100 * 1024 * 1024;
  }

  const summary = $('cleanupSummary');
  if (summary) {
    summary.classList.remove('hidden');
    summary.innerHTML = 'Cleanup complete. Freed <b>' + fmtBytes(freed) + '</b> by removing ' + deleted + ' duplicates and compressing ' + compressed + ' large videos.';
  }
}

function renderStorage() {
  const items = state.createMode.storageItems;
  const list = $('storageList');
  if (list) {
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = '<div class="muted empty-note">No items yet</div>';
    } else {
      items.forEach((item) => {
        const el = document.createElement('div');
        el.className = 'storage-item' + (item.duplicate ? ' duplicate' : '');
        el.innerHTML = '<div><div class="item-name">' + escapeHtml(item.name) + '</div><div class="item-meta">' + escapeHtml(item.date) + '</div></div><div class="item-size">' + fmtBytes(item.size) + '</div>';
        list.appendChild(el);
      });
    }
  }

  const used = items.reduce((sum, item) => sum + item.size, 0);
  const quota = 128 * 1024 * 1024 * 1024;
  const pct = Math.min(100, (used / quota) * 100);

  const usedEl = $('storageUsed');
  const totalEl = $('storageTotal');
  const fillEl = $('storageFill');
  const meterEl = $('storageMeter');

  if (usedEl) usedEl.textContent = fmtBytes(used);
  if (totalEl) totalEl.textContent = fmtBytes(quota);
  if (fillEl) fillEl.style.width = pct + '%';
  if (meterEl) {
    meterEl.classList.remove('meter-warning', 'meter-critical');
    if (pct > 90) meterEl.classList.add('meter-critical');
    else if (pct > 70) meterEl.classList.add('meter-warning');
  }

  const quickCount = $('quickFileCount');
  const dupeCount = $('quickDupeCount');
  if (quickCount) quickCount.textContent = String(items.length);
  if (dupeCount) dupeCount.textContent = String(items.filter((i) => i.duplicate).length);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

initCreateMode();

// Apply the initial mode visibility via the CSSOM. The app runs under a
// strict CSP (style-src 'self') that blocks inline style attributes, so the
// Create/Edit toggle must be set programmatically on startup.
switchMode(state.createMode.currentMode || 'edit');

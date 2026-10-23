// Sweep — From idea to checkable plan
// Offline-first, local workspace, encrypted storage

const STORAGE_KEYS = {
  WORKSPACE: 'sweep_workspace_v1',
  STATE: 'sweep_state_v1',
  THEME: 'sweep_theme_v1',
  GUEST: 'sweep_guest_v1'
};

const DEMO_PROJECT = {
  id: 'demo-team-task-board',
  name: 'Team Task Board',
  oneLiner: 'A lightweight task board for small teams to track sprint work without Jira complexity.',
  problem: 'Small teams need simple task tracking without enterprise tool overhead.',
  targetUser: 'Engineering teams of 3-10 people',
  jtbd: 'When I want to track sprint progress, so I can keep everyone aligned without ceremony',
  successChecks: ['Boots from file:// with 0 console errors', 'Create/read/update/delete tasks', 'Filter by assignee and status', 'Responsive mobile layout'],
  nonGoals: 'No real-time collaboration, no Gantt charts, no time tracking',
  overlap: 'Similar to Trello but simpler, focused on sprint workflows only',
  capabilityMatrix: {
    backend: { on: false, reason: 'Static GitHub Pages deploy; localStorage for persistence' },
    auth: { on: false, reason: 'No user accounts mentioned; local workspace only' },
    mobile: { on: true, reason: 'Responsive layout required for on-the-go updates' }
  },
  phases: ['M0', 'M1', 'M2', 'M3'],
  createdAt: new Date().toISOString(),
  status: 'spec-complete'
};

let state = {
  workspace: null,
  projects: [],
  currentProject: null,
  cryptoKey: null,
  cryptoMode: false,
  verifyGates: {},
  generatedFiles: {},
  currentFile: null
};

function init() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
  if (savedTheme === 'night') {
    document.documentElement.setAttribute('data-theme', 'night');
    updateThemeIcon(true);
  }
  
  const workspaceData = localStorage.getItem(STORAGE_KEYS.WORKSPACE);
  const guestData = localStorage.getItem(STORAGE_KEYS.GUEST);
  
  if (workspaceData) {
    try {
      const parsed = JSON.parse(workspaceData);
      state.workspace = parsed;
      showGate('unlock');
    } catch (e) {
      localStorage.removeItem(STORAGE_KEYS.WORKSPACE);
      localStorage.removeItem(STORAGE_KEYS.STATE);
      localStorage.removeItem(STORAGE_KEYS.GUEST);
      showGate('create');
    }
  } else if (guestData) {
    state.workspace = { name: 'Guest', guestMode: true };
    state.projects = JSON.parse(localStorage.getItem(STORAGE_KEYS.STATE + '_guest') || '{"projects":[]}').projects || [];
    enterApp();
  } else {
    showGate('create');
  }
  
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('signout-btn').addEventListener('click', signOut);
  
  document.querySelectorAll('.nav-item').forEach(n => {
    n.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(n.dataset.section);
    });
  });
}

function toggleTheme() {
  const isNight = document.documentElement.getAttribute('data-theme') === 'night';
  if (isNight) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem(STORAGE_KEYS.THEME, 'light');
    updateThemeIcon(false);
  } else {
    document.documentElement.setAttribute('data-theme', 'night');
    localStorage.setItem(STORAGE_KEYS.THEME, 'night');
    updateThemeIcon(true);
  }
}

function updateThemeIcon(isNight) {
  const sun = document.querySelector('.icon-sun');
  const moon = document.querySelector('.icon-moon');
  if (isNight) {
    sun.style.display = 'none';
    moon.style.display = 'block';
  } else {
    sun.style.display = 'block';
    moon.style.display = 'none';
  }
}

function showGate(mode) {
  document.querySelectorAll('.gate-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-gate-tab="${mode}"]`)?.classList.add('active');
  document.getElementById('gate-unlock-form').style.display = mode === 'unlock' ? 'flex' : 'none';
  document.getElementById('gate-create-form').style.display = mode === 'create' ? 'flex' : 'none';
  document.getElementById('gate-error').style.display = 'none';
  document.getElementById('gate-create-error').style.display = 'none';
}

function switchGateTab(mode) {
  showGate(mode);
}

async function handleCreate(event) {
  event.preventDefault();
  const name = document.getElementById('create-workspace').value.trim();
  const passphrase = document.getElementById('create-passphrase').value;
  const confirm = document.getElementById('create-passphrase-confirm').value;
  const errorEl = document.getElementById('gate-create-error');
  
  if (passphrase !== confirm) {
    errorEl.textContent = 'Passphrases do not match';
    errorEl.style.display = 'block';
    return;
  }
  
  const cryptoAvailable = !!(window.crypto && crypto.subtle);
  
  if (cryptoAvailable) {
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoder = new TextEncoder();
      
      const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      }, keyMaterial, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      
      const initialState = JSON.stringify({ projects: [], version: 1 });
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encoder.encode(initialState));
      
      const workspaceData = { name: name, salt: Array.from(salt), iv: Array.from(iv), cryptoMode: true };
      localStorage.setItem(STORAGE_KEYS.WORKSPACE, JSON.stringify(workspaceData));
      localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(Array.from(new Uint8Array(ciphertext))));
      
      state.workspace = workspaceData;
      state.cryptoKey = key;
      state.cryptoMode = true;
      state.projects = [];
      enterApp();
    } catch (e) {
      fallbackCreate(name, passphrase);
    }
  } else {
    fallbackCreate(name, passphrase);
  }
}

function fallbackCreate(name, passphrase) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
  const saltedPassphrase = passphrase + JSON.stringify(salt);
  const verifier = simpleHash(saltedPassphrase);
  
  const workspaceData = {
    name: name,
    salt: salt,
    cryptoMode: false,
    verifier: verifier,
    unencryptedState: JSON.stringify({ projects: [], version: 1 })
  };
  
  localStorage.setItem(STORAGE_KEYS.WORKSPACE, JSON.stringify(workspaceData));
  state.workspace = workspaceData;
  state.cryptoMode = false;
  state.projects = [];
  showToast('Local profile created (encryption unavailable in this browser)');
  enterApp();
}

async function handleUnlock(event) {
  event.preventDefault();
  const name = document.getElementById('unlock-workspace').value.trim();
  const passphrase = document.getElementById('unlock-passphrase').value;
  const errorEl = document.getElementById('gate-error');
  
  if (!state.workspace || state.workspace.name !== name) {
    errorEl.textContent = 'Workspace not found';
    errorEl.style.display = 'block';
    return;
  }
  
  if (state.workspace.cryptoMode) {
    try {
      const encoder = new TextEncoder();
      const salt = new Uint8Array(state.workspace.salt);
      const iv = new Uint8Array(state.workspace.iv);
      const stateCiphertext = localStorage.getItem(STORAGE_KEYS.STATE);
      if (!stateCiphertext) throw new Error('State not found');
      const ciphertext = new Uint8Array(JSON.parse(stateCiphertext));
      
      const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      }, keyMaterial, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext);
      const decoder = new TextDecoder();
      const stateStr = decoder.decode(decrypted);
      const parsed = JSON.parse(stateStr);
      
      state.cryptoKey = key;
      state.projects = parsed.projects || [];
      state.cryptoMode = true;
      enterApp();
    } catch (e) {
      errorEl.textContent = 'Wrong passphrase. Try again.';
      errorEl.style.display = 'block';
      return;
    }
  } else {
    const verifier = state.workspace.verifier;
    const salt = state.workspace.salt || [];
    const saltedPassphrase = passphrase + JSON.stringify(salt);
    if (verifier !== simpleHash(saltedPassphrase)) {
      errorEl.textContent = 'Wrong passphrase. Try again.';
      errorEl.style.display = 'block';
      return;
    }
    try {
      const unencrypted = state.workspace.unencryptedState;
      if (unencrypted) {
        const parsed = JSON.parse(unencrypted);
        state.projects = parsed.projects || [];
      }
    } catch (e) {
      state.projects = [];
    }
    state.cryptoMode = false;
    enterApp();
  }
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function enterApp() {
  document.getElementById('section-gate').style.display = 'none';
  document.getElementById('main-nav').style.display = 'flex';
  document.getElementById('workspace-chip').style.display = 'inline-flex';
  document.getElementById('workspace-name').textContent = state.workspace ? state.workspace.name : 'Guest';
  document.getElementById('signout-btn').style.display = 'inline-flex';
  renderCatalog();
  navigateTo('catalog');
}

function handleGuestContinue() {
  localStorage.setItem(STORAGE_KEYS.GUEST, 'true');
  state.workspace = { name: 'Guest', guestMode: true };
  state.projects = JSON.parse(localStorage.getItem(STORAGE_KEYS.STATE + '_guest') || '{"projects":[]}').projects || [];
  state.cryptoMode = false;
  enterApp();
}

function signOut() {
  state.cryptoKey = null;
  state.projects = [];
  state.currentProject = null;
  state.verifyGates = {};
  state.generatedFiles = {};
  state.currentFile = null;
  
  localStorage.removeItem(STORAGE_KEYS.GUEST);
  
  document.getElementById('section-gate').style.display = 'block';
  document.getElementById('section-catalog').style.display = 'none';
  document.getElementById('section-brief').style.display = 'none';
  document.getElementById('section-plan').style.display = 'none';
  document.getElementById('section-verify').style.display = 'none';
  document.getElementById('section-generate').style.display = 'none';
  document.getElementById('section-guide').style.display = 'none';
  document.getElementById('main-nav').style.display = 'none';
  document.getElementById('workspace-chip').style.display = 'none';
  document.getElementById('signout-btn').style.display = 'none';
  document.getElementById('nav-plan').style.display = 'none';
  document.getElementById('nav-verify').style.display = 'none';
  document.getElementById('nav-generate').style.display = 'none';
  
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  showGate('unlock');
  document.getElementById('unlock-passphrase').value = '';
}

function navigateTo(section) {
  document.querySelectorAll('.section').forEach(s => {
    s.classList.remove('active');
    setTimeout(() => { if (!s.classList.contains('active')) s.style.display = 'none'; }, 240);
  });
  
  const target = document.getElementById(`section-${section}`);
  if (target) {
    target.style.display = 'block';
    setTimeout(() => target.classList.add('active'), 10);
  }
  
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
  
  if (section === 'catalog') renderCatalog();
  if (section === 'plan' && state.currentProject) renderPlanView(state.currentProject);
  if (section === 'verify' && state.currentProject) renderVerifyView(state.currentProject);
  if (section === 'generate' && state.currentProject) renderGenerateView(state.currentProject);
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderCatalog() {
  const grid = document.getElementById('catalog-grid');
  const emptyState = document.getElementById('catalog-empty');
  const actions = document.querySelector('.catalog-actions');
  const demoCard = grid.querySelector('.demo-card');
  
  grid.querySelectorAll('.project-card:not(.demo-card)').forEach(c => c.remove());
  
  if (state.projects.length === 0) {
    emptyState.style.display = 'block';
    actions.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    actions.style.display = 'flex';
    state.projects.forEach(project => {
      const card = createProjectCard(project);
      grid.insertBefore(card, demoCard);
    });
  }
}

function createProjectCard(project) {
  const card = document.createElement('div');
  card.className = 'project-card';
  card.onclick = () => openProject(project.id);
  
  const statusColors = {
    'draft': 'var(--color-muted)',
    'spec-complete': 'var(--color-productive)',
    'building': 'var(--color-neutral)',
    'verified': 'var(--color-productive)',
    'shipped': 'var(--color-productive)'
  };
  
  card.innerHTML = `
    <div class="project-card-header">
      <span class="project-card-badge" style="background:${statusColors[project.status] || 'var(--color-muted)'}">${formatStatus(project.status)}</span>
      <h3 class="project-card-title">${escapeHtml(project.name)}</h3>
    </div>
    <p class="project-card-desc">${escapeHtml(project.oneLiner)}</p>
    <div class="project-card-meta">
      <span class="project-card-status" style="color:${statusColors[project.status] || 'var(--color-muted)'}">● ${formatStatus(project.status)}</span>
      <span class="project-card-date">${formatDate(project.createdAt)}</span>
    </div>
  `;
  return card;
}

function formatStatus(status) {
  const map = { 'draft': 'Draft', 'spec-complete': 'Spec complete', 'building': 'Building', 'verified': 'Verified', 'shipped': 'Shipped' };
  return map[status] || status;
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function openProject(id) {
  const project = state.projects.find(p => p.id === id);
  if (!project) return;
  state.currentProject = project;
  state.verifyGates = project.verifyGates || {};
  renderPlanView(project);
  updateNavForProject();
  navigateTo('plan');
}

function openDemoProject() {
  state.currentProject = DEMO_PROJECT;
  state.verifyGates = {};
  renderPlanView(DEMO_PROJECT);
  updateNavForProject(DEMO_PROJECT);
  navigateTo('plan');
}

function updateNavForProject(project) {
  const hasProject = project && project.id !== DEMO_PROJECT.id;
  document.getElementById('nav-plan').style.display = hasProject ? 'inline-flex' : 'none';
  document.getElementById('nav-verify').style.display = hasProject ? 'inline-flex' : 'none';
  document.getElementById('nav-generate').style.display = hasProject ? 'inline-flex' : 'none';
}

function suggestKebabCase() {
  const name = document.getElementById('brief-app-name').value.trim();
  const suggestion = toKebabCase(name);
  const hint = document.getElementById('brief-kebab-suggestion');
  const output = document.getElementById('kebab-case-output');
  if (suggestion && suggestion.length > 0) {
    output.textContent = suggestion;
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
}

function toKebabCase(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

function addSuccessCheck() {
  const container = document.getElementById('success-checks-container');
  const row = document.createElement('div');
  row.className = 'success-check-row';
  row.innerHTML = `
    <input type="text" class="success-check-input" placeholder="e.g., Passes all smoke tests" required>
    <button type="button" class="btn-icon" onclick="removeSuccessCheck(this)" aria-label="Remove">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;
  container.appendChild(row);
}

function removeSuccessCheck(btn) {
  const container = document.getElementById('success-checks-container');
  if (container.children.length > 1) {
    btn.parentElement.remove();
  } else {
    showToast('At least one success check is required');
  }
}

function handleBriefSubmit(event) {
  event.preventDefault();
  const project = {
    id: `proj-${Date.now()}`,
    name: document.getElementById('brief-app-name').value.trim(),
    oneLiner: document.getElementById('brief-one-liner').value.trim(),
    problem: document.getElementById('brief-problem').value.trim(),
    targetUser: document.getElementById('brief-target-user').value.trim(),
    jtbd: document.getElementById('brief-jtbd').value.trim(),
    successChecks: Array.from(document.querySelectorAll('.success-check-input')).map(el => el.value.trim()).filter(v => v.length > 0),
    nonGoals: document.getElementById('brief-non-goals').value.trim(),
    overlap: document.getElementById('brief-overlap').value.trim(),
    status: 'draft',
    createdAt: new Date().toISOString(),
    verifyGates: {}
  };
  
  project.capabilityMatrix = generateCapabilityMatrix(project);
  state.projects.push(project);
  state.currentProject = project;
  state.verifyGates = {};
  saveState();
  renderPlanView(project);
  updateNavForProject(project);
  navigateTo('plan');
  
  document.getElementById('brief-form').reset();
  document.getElementById('success-checks-container').innerHTML = `
    <div class="success-check-row">
      <input type="text" class="success-check-input" placeholder="e.g., Boots from file:// with 0 console errors" required>
      <button type="button" class="btn-icon" onclick="removeSuccessCheck(this)" aria-label="Remove">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
  showToast('Plan generated successfully');
}

function generateCapabilityMatrix(project) {
  const brief = `${project.problem} ${project.jtbd} ${project.targetUser}`.toLowerCase();
  const backendKeywords = ['data', 'save', 'store', 'database', 'account', 'login', 'user', 'persist', 'sync', 'share', 'team'];
  const backendOn = backendKeywords.some(kw => brief.includes(kw));
  const authKeywords = ['login', 'account', 'user', 'team', 'share', 'collaborate', 'private', 'secure'];
  const authOn = authKeywords.some(kw => brief.includes(kw));
  
  return {
    backend: { on: backendOn, reason: backendOn ? 'Brief mentions data persistence, accounts, or sharing' : 'Static GitHub Pages deploy; localStorage for persistence' },
    auth: { on: authOn, reason: authOn ? 'Brief mentions login, accounts, or team features' : 'No user accounts mentioned; local workspace only' },
    mobile: { on: true, reason: 'Responsive layout for desktop + mobile' }
  };
}

function renderPlanView(project) {
  document.getElementById('plan-app-name').textContent = project.name;
  document.getElementById('plan-one-liner').textContent = project.oneLiner;
  document.getElementById('plan-status').textContent = formatStatus(project.status);
  document.getElementById('plan-status').className = 'plan-badge' + (project.status === 'verified' ? ' verified' : '');
  
  const matrixContainer = document.getElementById('capability-grid');
  matrixContainer.innerHTML = '';
  const capabilities = [
    { key: 'backend', label: 'Backend / Persistence' },
    { key: 'auth', label: 'Auth / Login' },
    { key: 'mobile', label: 'Mobile' }
  ];
  
  capabilities.forEach(cap => {
    const data = project.capabilityMatrix[cap.key];
    const item = document.createElement('div');
    item.className = 'capability-item';
    item.innerHTML = `
      <div class="capability-header">
        <span class="capability-name">${cap.label}</span>
        <span class="capability-status ${data.on ? 'on' : 'off'}">${data.on ? 'ON' : 'OFF'}</span>
      </div>
      <div class="capability-reason">${escapeHtml(data.reason)}</div>
    `;
    matrixContainer.appendChild(item);
  });
  
  const dodList = document.getElementById('dod-list');
  dodList.innerHTML = '';
  project.successChecks.forEach((check, index) => {
    const item = document.createElement('li');
    item.className = 'dod-item';
    item.innerHTML = `<input type="checkbox" class="dod-checkbox" id="dod-${index}"><label for="dod-${index}">${escapeHtml(check)}</label>`;
    dodList.appendChild(item);
  });
  
  renderFileTree(project);
}

function renderFileTree(project) {
  const tree = document.getElementById('file-tree');
  const hasBackend = project.capabilityMatrix.backend.on;
  tree.innerHTML = `
    <div class="file-tree-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><span class="file-tree-folder">${escapeHtml(project.name)}/</span></div>
    <div class="file-tree-indent">
      ${hasBackend ? `<div class="file-tree-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span class="file-tree-folder">server/</span></div>` : ''}
      <div class="file-tree-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span class="file-tree-folder">web/</span></div>
      <div class="file-tree-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span class="file-tree-folder">tests/</span></div>
      <div class="file-tree-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg><span class="file-tree-file">docs/</span></div>
      <div class="file-tree-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg><span class="file-tree-file">README.md</span></div>
      <div class="file-tree-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg><span class="file-tree-file">.gitignore</span></div>
    </div>
  `;
}

function exportProjectJSON() {
  if (!state.currentProject) return;
  const dataStr = JSON.stringify(state.currentProject, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${toKebabCase(state.currentProject.name)}-plan.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Project exported as JSON');
}

async function saveState() {
  const stateData = JSON.stringify({ projects: state.projects, version: 1 });
  
  if (state.workspace && state.workspace.guestMode) {
    localStorage.setItem(STORAGE_KEYS.STATE + '_guest', stateData);
  } else if (state.cryptoMode && state.cryptoKey) {
    try {
      const encoder = new TextEncoder();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, state.cryptoKey, encoder.encode(stateData));
      localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(Array.from(new Uint8Array(ciphertext))));
      state.workspace.iv = Array.from(iv);
      state.workspace.ciphertext = Array.from(new Uint8Array(ciphertext));
      localStorage.setItem(STORAGE_KEYS.WORKSPACE, JSON.stringify(state.workspace));
    } catch (e) {
      showToast('Warning: Failed to encrypt data');
    }
  } else {
    localStorage.setItem(STORAGE_KEYS.STATE + '_unencrypted', stateData);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// === M2: VERIFY VIEW ===
function renderVerifyView(project) {
  const gatesContainer = document.getElementById('verify-gates');
  gatesContainer.innerHTML = '';
  
  const gates = getVerifyGates(project);
  let passedCount = 0;
  
  gates.forEach((gate, index) => {
    const gateId = `gate-${index}`;
    const isChecked = state.verifyGates[gateId] || false;
    if (isChecked) passedCount++;
    
    const gateEl = document.createElement('div');
    gateEl.className = 'verify-gate';
    gateEl.innerHTML = `
      <input type="checkbox" class="verify-gate-checkbox" id="${gateId}" ${isChecked ? 'checked' : ''} onchange="toggleVerifyGate('${gateId}')">
      <div class="verify-gate-content">
        <div class="verify-gate-title">${gate.title}</div>
        <div class="verify-gate-hint">${gate.hint}</div>
      </div>
    `;
    gatesContainer.appendChild(gateEl);
  });
  
  const progressFill = document.getElementById('verify-progress-fill');
  const progressText = document.getElementById('verify-progress-text');
  const percent = gates.length > 0 ? Math.round((passedCount / gates.length) * 100) : 0;
  progressFill.style.width = `${percent}%`;
  progressText.textContent = `${passedCount} / ${gates.length} gates passed`;
  
  const completeBtn = document.getElementById('verify-complete-btn');
  completeBtn.disabled = passedCount !== gates.length;
  
  const commandsCode = document.getElementById('verify-commands-code');
  commandsCode.textContent = generateVerifyCommands(project);
}

function getVerifyGates(project) {
  const hasBackend = project.capabilityMatrix.backend.on;
  return [
    {
      title: 'Smoke gate',
      hint: hasBackend 
        ? 'Boot server: <code>python server/server.py</code>, then <code>curl http://localhost:8000/</code> and <code>curl http://localhost:8000/health</code> → both 200'
        : 'Open <code>web/index.html</code> from <code>file://</code> → expect 0 console errors'
    },
    {
      title: 'Visual gate',
      hint: 'Playwright screenshots at 1440×900 and 390×844: <code>page.screenshot({ path: "desktop.png", fullPage: true })</code>'
    },
    ...project.successChecks.map((check, i) => ({
      title: `Acceptance #${i + 1}`,
      hint: escapeHtml(check)
    })),
    {
      title: 'Repo-checks gate',
      hint: 'Run <code>python scripts/build_site.py</code>, <code>python scripts/check_site.py</code>, <code>python scripts/run_all_tests.py</code> → all exit 0 (when present)'
    },
    {
      title: 'Secret-scan gate',
      hint: 'No secrets/internal endpoints committed: <code>git log -p --all | grep -E "(api_key|password|secret)"</code>'
    }
  ];
}

function toggleVerifyGate(gateId) {
  const checkbox = document.getElementById(gateId);
  state.verifyGates[gateId] = checkbox.checked;
  if (state.currentProject) {
    state.currentProject.verifyGates = state.verifyGates;
  }
  renderVerifyView(state.currentProject);
}

function generateVerifyCommands(project) {
  const hasBackend = project.capabilityMatrix.backend.on;
  const commands = [];
  
  if (hasBackend) {
    commands.push('# Smoke test (backend)');
    commands.push('python server/server.py &');
    commands.push('curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/');
    commands.push('curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health');
    commands.push('');
  } else {
    commands.push('# Smoke test (static)');
    commands.push('# Open web/index.html from file:// in browser');
    commands.push('# Check browser console: expect 0 errors');
    commands.push('');
  }
  
  commands.push('# Visual gate (Playwright)');
  commands.push('python -m playwright install chromium');
  commands.push('# In test script:');
  commands.push('page.set_viewport_size({"width": 1440, "height": 900})');
  commands.push('page.screenshot(path="desktop.png", full_page=True)');
  commands.push('page.set_viewport_size({"width": 390, "height": 844})');
  commands.push('page.screenshot(path="mobile.png", full_page=True)');
  commands.push('');
  
  commands.push('# Acceptance gates');
  project.successChecks.forEach((check, i) => {
    commands.push(`# ${i + 1}. ${check}`);
  });
  commands.push('');
  
  commands.push('# Repo checks (when present)');
  commands.push('python scripts/build_site.py');
  commands.push('python scripts/check_site.py');
  commands.push('python scripts/run_all_tests.py');
  commands.push('');
  
  commands.push('# Secret scan');
  commands.push('git log -p --all | grep -iE "(api_key|apikey|password|secret|token)"');
  
  return commands.join('\n');
}

function copyVerifyCommands() {
  const code = document.getElementById('verify-commands-code').textContent;
  navigator.clipboard.writeText(code).then(() => showToast('Commands copied to clipboard'));
}

function markVerified() {
  if (state.currentProject) {
    state.currentProject.status = 'verified';
    saveState();
    document.getElementById('plan-status').textContent = 'Verified';
    document.getElementById('plan-status').className = 'plan-badge verified';
    showToast('Project marked as verified');
  }
}

// === M3: GENERATE VIEW ===
function renderGenerateView(project) {
  state.generatedFiles = generateProjectFiles(project);
  state.currentFile = null;
  
  const fileList = document.getElementById('generate-file-list');
  fileList.innerHTML = '';
  
  Object.keys(state.generatedFiles).forEach(filename => {
    const item = document.createElement('div');
    item.className = 'file-list-item';
    item.textContent = filename;
    item.onclick = () => selectFile(filename);
    fileList.appendChild(item);
  });
  
  document.getElementById('generate-filename').textContent = 'Select a file';
  document.getElementById('generate-code').textContent = '';
  document.getElementById('copy-file-btn').disabled = true;
  document.getElementById('download-file-btn').disabled = true;
  
  const memoryNote = generateMemoryNote(project);
  document.getElementById('generate-memory-note').textContent = memoryNote;
}

function generateProjectFiles(project) {
  const hasBackend = project.capabilityMatrix.backend.on;
  const appName = escapeHtml(project.name);
  const kebabName = toKebabCase(project.name);
  
  const files = {};
  
  // web/index.html
  files['web/index.html'] = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${appName}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header class="masthead">
  <h1 class="masthead-title">${appName.toUpperCase()}</h1>
</header>
<main class="main">
  <p>${escapeHtml(project.oneLiner)}</p>
</main>
<script src="app.js"></script>
</body>
</html>`;
  
  // web/styles.css
  files['web/styles.css'] = `:root{
  --color-paper:#faf8f3;
  --color-outer:#f0ede6;
  --color-accent:#8b1a1a;
  --color-ink:#1a1a1a;
  --font-heading:Georgia,'Times New Roman',serif;
  --font-body:Georgia,'Times New Roman',serif;
}
body{font-family:var(--font-body);background:var(--color-outer);color:var(--color-ink);margin:0}
.masthead{padding:24px;background:var(--color-paper);border-bottom:3px solid var(--color-accent)}
.masthead-title{font-family:var(--font-heading);color:var(--color-accent);letter-spacing:0.14em;text-transform:uppercase}
.main{max-width:800px;margin:0 auto;padding:32px}`;
  
  // web/app.js
  files['web/app.js'] = `// ${appName} — ${escapeHtml(project.oneLiner)}
console.log('${appName} loaded');`;
  
  // server/server.py (if backend)
  if (hasBackend) {
    files['server/server.py'] = `#!/usr/bin/env python3
"""${appName} — zero-dependency stdlib server."""
import http.server
import socketserver
import json

PORT = 8000

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            with open('../web/index.html', 'rb') as f:
                self.wfile.write(f.read())
        elif self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok'}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        print("[{}] {}".format(self.log_date_time_string(), format % args))

if __name__ == '__main__':
    with socketserver.TCPServer(('', PORT), Handler) as httpd:
        print('Serving at http://localhost:{}'.format(PORT))
        httpd.serve_forever()`;
  }
  
  // tests/test_smoke.py
  files['tests/test_smoke.py'] = `#!/usr/bin/env python3
"""Smoke test for ${appName}."""
import sys

def test_import():
    try:
        import http.server
        return True
    except ImportError:
        return False

if __name__ == '__main__':
    if test_import():
        print('ok - imports work')
        sys.exit(0)
    print('FAIL - imports broken')
    sys.exit(1)`;
  
  // verify.ps1
  files['verify.ps1'] = `# ${appName} — Verification script (PowerShell)
Write-Host "Running verification for ${appName}..."

# Check web files exist
$webFiles = @('web/index.html', 'web/styles.css', 'web/app.js')
foreach ($file in $webFiles) {
    if (Test-Path $file) {
        Write-Host "ok - $file exists"
    } else {
        Write-Host "FAIL - $file missing"
        exit 1
    }
}

Write-Host "All checks passed"
exit 0`;
  
  // verify.sh
  files['verify.sh'] = `#!/bin/bash
# ${appName} — Verification script (Unix)
echo "Running verification for ${appName}..."

for file in web/index.html web/styles.css web/app.js; do
    if [ -f "$file" ]; then
        echo "ok - $file exists"
    else
        echo "FAIL - $file missing"
        exit 1
    fi
done

echo "All checks passed"
exit 0`;
  
  // docs/BRIEF.md
  files['docs/BRIEF.md'] = `# BRIEF — ${appName}

## Problem
${escapeHtml(project.problem)}

## Target user
${escapeHtml(project.targetUser)}

## Job-to-be-done
${escapeHtml(project.jtbd)}

## Success criteria
${project.successChecks.map(c => `- ${c}`).join('\n')}

## Non-goals
${escapeHtml(project.nonGoals)}`;
  
  // README.md
  files['README.md'] = `# ${appName}

${escapeHtml(project.oneLiner)}

## Problem
${escapeHtml(project.problem)}

## Target user
${escapeHtml(project.targetUser)}

## Quick start
${hasBackend ? `
### Backend
\`\`\`bash
cd server
python server.py
\`\`\`
Then open http://localhost:8000
` : `
### Static
Open \`web/index.html\` from \`file://\` in your browser.
`}

## Verification
\`\`\`bash
${hasBackend ? 'python server/server.py &' : '# Open web/index.html from file://'}
python tests/test_smoke.py
\`\`\`

## License
MIT`;
  
  // .gitignore
  files['.gitignore'] = `# Python
__pycache__/
*.py[cod]

# Node (if any)
node_modules/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Secrets (never commit)
.env
*.key
secrets/`;
  
  return files;
}

function generateMemoryNote(project) {
  const date = new Date().toISOString().split('T')[0];
  const id = `${toKebabCase(project.name)}-${Date.now()}`;
  
  return `---
id: ${id}
app: ${escapeHtml(project.name)}
type: idea
status: ${project.status}
date: ${date}
tags: [sweep, plan, ${toKebabCase(project.targetUser).split('-')[0]}]
links: []
---

# ${escapeHtml(project.name)}

${escapeHtml(project.oneLiner)}

## Problem
${escapeHtml(project.problem)}

## Target user
${escapeHtml(project.targetUser)}

## Job-to-be-done
${escapeHtml(project.jtbd)}

## Success criteria
${project.successChecks.map(c => `- [ ] ${c}`).join('\n')}

## Capability matrix
- Backend: ${project.capabilityMatrix.backend.on ? 'ON' : 'OFF'}
- Auth: ${project.capabilityMatrix.auth.on ? 'ON' : 'OFF'}
- Mobile: ${project.capabilityMatrix.mobile.on ? 'ON' : 'OFF'}

## Non-goals
${escapeHtml(project.nonGoals)}`;
}

function selectFile(filename) {
  state.currentFile = filename;
  const content = state.generatedFiles[filename];
  
  document.querySelectorAll('.file-list-item').forEach(item => {
    item.classList.toggle('active', item.textContent === filename);
  });
  
  document.getElementById('generate-filename').textContent = filename;
  document.getElementById('generate-code').textContent = content;
  document.getElementById('copy-file-btn').disabled = false;
  document.getElementById('download-file-btn').disabled = false;
}

function copyFileContent() {
  if (!state.currentFile || !state.generatedFiles[state.currentFile]) return;
  navigator.clipboard.writeText(state.generatedFiles[state.currentFile]).then(() => {
    showToast('File content copied');
  });
}

function downloadFileContent() {
  if (!state.currentFile || !state.generatedFiles[state.currentFile]) return;
  const blob = new Blob([state.generatedFiles[state.currentFile]], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = state.currentFile.split('/').pop();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${state.currentFile}`);
}

function copyMemoryNote() {
  const note = document.getElementById('generate-memory-note').textContent;
  navigator.clipboard.writeText(note).then(() => showToast('Memory note copied'));
}

function downloadBundle() {
  if (!state.currentProject) return;
  
  const bundle = {
    project: state.currentProject,
    files: state.generatedFiles,
    memoryNote: generateMemoryNote(state.currentProject),
    exportedAt: new Date().toISOString()
  };
  
  const dataStr = JSON.stringify(bundle, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${toKebabCase(state.currentProject.name)}-bundle.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Bundle downloaded');
}

init();

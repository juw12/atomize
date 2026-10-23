// Sweep — From idea to checkable plan
// Offline-first, local workspace, encrypted storage

// === CONSTANTS ===
const STORAGE_KEYS = {
  WORKSPACE: 'sweep_workspace_v1',
  STATE: 'sweep_state_v1',
  THEME: 'sweep_theme_v1',
  SESSION: 'sweep_session_v1'
};

const DEMO_PROJECT = {
  id: 'demo-team-task-board',
  name: 'Team Task Board',
  oneLiner: 'A lightweight task board for small teams to track sprint work without Jira complexity.',
  problem: 'Small teams need simple task tracking without enterprise tool overhead.',
  targetUser: 'Engineering teams of 3-10 people',
  jtbd: 'When I want to track sprint progress, so I can keep everyone aligned without ceremony',
  successChecks: [
    'Boots from file:// with 0 console errors',
    'Create/read/update/delete tasks',
    'Filter by assignee and status',
    'Responsive mobile layout'
  ],
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

// === STATE ===
let state = {
  workspace: null,
  projects: [],
  currentProject: null,
  cryptoKey: null,
  cryptoMode: false // false = fallback mode (unencrypted)
};

// === INITIALIZATION ===
function init() {
  // Theme
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
  if (savedTheme === 'night') {
    document.documentElement.setAttribute('data-theme', 'night');
    updateThemeIcon(true);
  }
  
  // Check existing workspace
  const workspaceData = localStorage.getItem(STORAGE_KEYS.WORKSPACE);
  if (workspaceData) {
    try {
      const parsed = JSON.parse(workspaceData);
      state.workspace = parsed;
      showGate('unlock');
    } catch (e) {
      localStorage.removeItem(STORAGE_KEYS.WORKSPACE);
      localStorage.removeItem(STORAGE_KEYS.STATE);
      showGate('create');
    }
  } else {
    showGate('create');
  }
  
  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('signout-btn').addEventListener('click', signOut);
  
  document.querySelectorAll('.nav-item').forEach(n => {
    n.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(n.dataset.section);
    });
  });
}

// === THEME ===
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

// === GATE (LOGIN) ===
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
  
  // Try to use WebCrypto
  const cryptoAvailable = !!(window.crypto && crypto.subtle);
  
  if (cryptoAvailable) {
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // Derive key with PBKDF2
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
      );
      
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      
      const initialState = JSON.stringify({ projects: [], version: 1 });
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encoder.encode(initialState)
      );
      
      const workspaceData = {
        name: name,
        salt: Array.from(salt),
        iv: Array.from(iv),
        cryptoMode: true
      };
      
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
  // Fallback: store unencrypted with warning
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
  const saltedPassphrase = passphrase + JSON.stringify(salt);
  const verifier = simpleHash(saltedPassphrase);
  
  const workspaceData = {
    name: name,
    ciphertext: [],
    iv: [],
    salt: salt,
    cryptoMode: false,
    unencryptedState: JSON.stringify({ projects: [], version: 1 }),
    verifier: verifier
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
      if (!stateCiphertext) {
        throw new Error('State ciphertext not found');
      }
      const ciphertext = new Uint8Array(JSON.parse(stateCiphertext));
      
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
      );
      
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
      );
      
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
    // Fallback mode
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
  // Simple hash for fallback mode passphrase verification
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
  document.getElementById('workspace-name').textContent = state.workspace.name;
  document.getElementById('signout-btn').style.display = 'inline-flex';
  
  renderCatalog();
  navigateTo('catalog');
}

function signOut() {
  state.cryptoKey = null;
  state.projects = [];
  state.currentProject = null;
  
  document.getElementById('section-gate').style.display = 'block';
  document.getElementById('section-catalog').style.display = 'none';
  document.getElementById('section-brief').style.display = 'none';
  document.getElementById('section-plan').style.display = 'none';
  document.getElementById('section-guide').style.display = 'none';
  document.getElementById('main-nav').style.display = 'none';
  document.getElementById('workspace-chip').style.display = 'none';
  document.getElementById('signout-btn').style.display = 'none';
  
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  showGate('unlock');
  
  document.getElementById('unlock-passphrase').value = '';
}

// === NAVIGATION ===
function navigateTo(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
  
  const target = document.getElementById(`section-${section}`);
  if (target) {
    target.style.display = 'block';
    setTimeout(() => target.classList.add('active'), 10);
  }
  
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
  
  if (section === 'catalog') {
    renderCatalog();
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// === CATALOG ===
function renderCatalog() {
  const grid = document.getElementById('catalog-grid');
  const demoCard = grid.querySelector('.demo-card');
  
  // Remove user projects (keep demo)
  grid.querySelectorAll('.project-card:not(.demo-card)').forEach(c => c.remove());
  
  // Render user projects
  state.projects.forEach(project => {
    const card = createProjectCard(project);
    grid.insertBefore(card, demoCard);
  });
}

function createProjectCard(project) {
  const card = document.createElement('div');
  card.className = 'project-card';
  card.onclick = () => openProject(project.id);
  
  const statusColors = {
    'draft': 'var(--color-muted)',
    'spec-complete': 'var(--color-productive)',
    'building': 'var(--color-neutral)',
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
  const map = {
    'draft': 'Draft',
    'spec-complete': 'Spec complete',
    'building': 'Building',
    'shipped': 'Shipped'
  };
  return map[status] || status;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function openProject(id) {
  const project = state.projects.find(p => p.id === id);
  if (!project) return;
  
  state.currentProject = project;
  renderPlanView(project);
  navigateTo('plan');
}

function openDemoProject() {
  state.currentProject = DEMO_PROJECT;
  renderPlanView(DEMO_PROJECT);
  navigateTo('plan');
}

// === BRIEF WIZARD ===
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
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
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
    successChecks: Array.from(document.querySelectorAll('.success-check-input'))
      .map(el => el.value.trim())
      .filter(v => v.length > 0),
    nonGoals: document.getElementById('brief-non-goals').value.trim(),
    overlap: document.getElementById('brief-overlap').value.trim(),
    status: 'draft',
    createdAt: new Date().toISOString()
  };
  
  // Generate capability matrix
  project.capabilityMatrix = generateCapabilityMatrix(project);
  
  // Save project
  state.projects.push(project);
  state.currentProject = project;
  
  saveState();
  
  // Render plan view
  renderPlanView(project);
  
  // Navigate to plan
  navigateTo('plan');
  
  // Reset form
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
  
  // Backend detection
  const backendKeywords = ['data', 'save', 'store', 'database', 'account', 'login', 'user', 'persist', 'sync', 'share', 'team'];
  const backendOn = backendKeywords.some(kw => brief.includes(kw));
  
  // Auth detection
  const authKeywords = ['login', 'account', 'user', 'team', 'share', 'collaborate', 'private', 'secure'];
  const authOn = authKeywords.some(kw => brief.includes(kw));
  
  // Mobile defaults ON
  const mobileOn = true;
  
  return {
    backend: {
      on: backendOn,
      reason: backendOn 
        ? 'Brief mentions data persistence, accounts, or sharing' 
        : 'Static GitHub Pages deploy; localStorage for persistence'
    },
    auth: {
      on: authOn,
      reason: authOn 
        ? 'Brief mentions login, accounts, or team features' 
        : 'No user accounts mentioned; local workspace only'
    },
    mobile: {
      on: mobileOn,
      reason: 'Responsive layout for desktop + mobile'
    }
  };
}

// === PLAN VIEW ===
function renderPlanView(project) {
  document.getElementById('plan-app-name').textContent = project.name;
  document.getElementById('plan-one-liner').textContent = project.oneLiner;
  document.getElementById('plan-status').textContent = formatStatus(project.status);
  
  // Capability Matrix
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
  
  // Definition of Done
  const dodList = document.getElementById('dod-list');
  dodList.innerHTML = '';
  
  project.successChecks.forEach((check, index) => {
    const item = document.createElement('li');
    item.className = 'dod-item';
    item.innerHTML = `
      <input type="checkbox" class="dod-checkbox" id="dod-${index}">
      <label for="dod-${index}">${escapeHtml(check)}</label>
    `;
    dodList.appendChild(item);
  });
  
  // File Tree
  renderFileTree(project);
}

function renderFileTree(project) {
  const tree = document.getElementById('file-tree');
  const hasBackend = project.capabilityMatrix.backend.on;
  
  tree.innerHTML = `
    <div class="file-tree-item">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <span class="file-tree-folder">${escapeHtml(project.name)}/</span>
    </div>
    <div class="file-tree-indent">
      ${hasBackend ? `
      <div class="file-tree-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span class="file-tree-folder">server/</span>
      </div>
      ` : ''}
      <div class="file-tree-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span class="file-tree-folder">web/</span>
      </div>
      <div class="file-tree-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span class="file-tree-folder">tests/</span>
      </div>
      <div class="file-tree-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        <span class="file-tree-file">docs/</span>
      </div>
      <div class="file-tree-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
        <span class="file-tree-file">README.md</span>
      </div>
      <div class="file-tree-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
        <span class="file-tree-file">.gitignore</span>
      </div>
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

// === PERSISTENCE ===
async function saveState() {
  if (state.cryptoMode && state.cryptoKey) {
    try {
      const stateData = JSON.stringify({ projects: state.projects, version: 1 });
      const encoder = new TextEncoder();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        state.cryptoKey,
        encoder.encode(stateData)
      );
      
      localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(Array.from(new Uint8Array(ciphertext))));
      
      state.workspace.iv = Array.from(iv);
      state.workspace.ciphertext = Array.from(new Uint8Array(ciphertext));
      localStorage.setItem(STORAGE_KEYS.WORKSPACE, JSON.stringify(state.workspace));
      
    } catch (e) {
      showToast('Warning: Failed to encrypt data');
    }
  } else {
    // Fallback mode
    const stateData = JSON.stringify({ projects: state.projects, version: 1 });
    localStorage.setItem(STORAGE_KEYS.STATE + '_unencrypted', stateData);
  }
}

// === UTILITIES ===
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

// === BOOTSTRAP ===
init();

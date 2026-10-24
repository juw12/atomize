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

const DEMO_OPERATOR = {
  brand: {
    logoSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#8b1a1a" width="100" height="100" rx="20"/><text x="50" y="68" font-family="Georgia" font-size="42" fill="#faf8f3" text-anchor="middle" font-weight="700">TB</text></svg>',
    palette: ['#8b1a1a', '#1a7f37', '#b8860b', '#1a1a1a', '#faf8f3'],
    fonts: { heading: "Georgia,'Times New Roman',serif", body: "Georgia,'Times New Roman',serif" }
  },
  credits: { welcome: 45, daily: 5, lastTopup: new Date().toISOString().split('T')[0], spent: 12 },
  runMode: 'ask', // 'ask' or 'auto'
  power: 'steady', // 'light', 'steady', 'big', 'full'
  runs: [
    { at: new Date(Date.now() - 172800000).toISOString(), mode: 'ask', power: 'steady', artifacts: 6, credits: 25 }
  ],
  runLog: [
    { action: 'brand', result: 'Generated brand kit (-3 credits)', timestamp: new Date(Date.now() - 86400000).toISOString() },
    { action: 'linkedin post', result: 'Generated post (-2 credits)', timestamp: new Date(Date.now() - 80000000).toISOString() },
    { action: 'email', result: 'Generated email draft (-2 credits)', timestamp: new Date(Date.now() - 75000000).toISOString() },
    { action: 'research', result: 'Generated market snapshot (-5 credits)', timestamp: new Date(Date.now() - 70000000).toISOString() }
  ],
  siteVersions: [],
  outbox: [
    {
      id: 'demo-art-1',
      type: 'post',
      platform: 'linkedin',
      title: 'LinkedIn Post',
      copy: 'Excited to share Team Task Board: A lightweight task board for small teams to track sprint work without Jira complexity.\n\nBuilt for: Engineering teams of 3-10 people\n\n#product #startup',
      pictureSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect fill="#faf8f3" width="400" height="300"/><circle cx="100" cy="150" r="40" fill="#8b1a1a" opacity="0.4"/><rect x="200" y="100" width="60" height="60" fill="#1a7f37" opacity="0.4" rx="8"/><text x="200" y="160" font-family="Georgia" font-size="48" fill="#1a1a1a" text-anchor="middle" font-weight="700">in</text></svg>',
      status: 'pending',
      createdAt: new Date(Date.now() - 80000000).toISOString()
    },
    {
      id: 'demo-art-2',
      type: 'email',
      title: 'Email Draft',
      subject: 'Quick question about your workflow',
      body: 'Hi there,\n\nI noticed you\'re on an engineering team. We\'re building Team Task Board — a lightweight task board for small teams to track sprint work without Jira complexity.\n\nWould love your feedback. Open to a quick chat?\n\nBest,\n[Your name]',
      status: 'pending',
      createdAt: new Date(Date.now() - 75000000).toISOString()
    },
    {
      id: 'demo-art-3',
      type: 'research',
      title: 'Market Snapshot',
      positioning: 'Team Task Board positions as a lightweight task board solution for engineering teams of 3-10 people.',
      competitors: [
        { name: 'Jira', strength: 'Market leader', weakness: 'Complex, expensive' },
        { name: 'Trello', strength: 'Simple, visual', weakness: 'Limited for sprints' },
        { name: 'Linear', strength: 'Modern, fast', weakness: 'Pricy for small teams' },
        { name: 'GitHub Projects', strength: 'Integrated with code', weakness: 'Less standalone' }
      ],
      pricingBenchmarks: { low: '$9/mo', mid: '$29/mo', high: '$99/mo' },
      channels: ['Direct outreach', 'Indie Hackers', 'Twitter/X', 'Engineering communities'],
      risks: ['Market saturation', 'Price pressure', 'Distribution challenges'],
      actions: ['Focus on small engineering teams', 'Lead with simplicity vs Jira', 'Build in public', 'Price at $29/mo'],
      sourcesNote: 'Locally synthesized analysis (no network calls). Based on pattern matching from brief.',
      status: 'approved',
      createdAt: new Date(Date.now() - 70000000).toISOString()
    }
  ],
  integrations: { gmail: false, calendar: false, slack: false, notion: false, hubspot: false, stripe: false, sheets: false, twitter: false, linkedin: false, instagram: false },
  payments: { 
    price: 29, 
    currency: 'USD', 
    plan: 'Pro',
    plans: [
      { name: 'Free', price: 0, features: ['Basic features', 'Community support', '1 project'] },
      { name: 'Pro', price: 29, features: ['All features', 'Priority support', 'Unlimited projects', 'Analytics'] },
      { name: 'Max', price: 99, features: ['Everything in Pro', 'Dedicated support', 'Custom integrations', 'SLA'] }
    ]
  },
  ledger: {
    sheets: {
      sales: {
        rows: [
          { id: 1, period: 'Week 1', orders: 12, revenue: 348, cost: 120 },
          { id: 2, period: 'Week 2', orders: 18, revenue: 522, cost: 180 },
          { id: 3, period: 'Week 3', orders: 25, revenue: 725, cost: 250 },
          { id: 4, period: 'Week 4', orders: 31, revenue: 899, cost: 310 }
        ]
      },
      stock: { rows: [] },
      costs: { rows: [] }
    }
  },
  chat: [
    { role: 'otto', text: 'Hi! I\'m Otto, your operator. I can help you draft your brand, site, posts, outreach, research, or a deck. What would you like to create?', at: new Date(Date.now() - 60000).toISOString() }
  ],
  undoStack: [],
  schedule: [],
  inbox: [
    { id: 'inbox-1', from: 'Sarah Chen', channel: 'LinkedIn', message: 'This looks interesting! Would love to learn more about how it handles sprint tracking.', receivedAt: new Date(Date.now() - 3600000).toISOString(), read: false },
    { id: 'inbox-2', from: 'Mike Ross', channel: 'Email', message: 'Can you share more details about pricing for teams?', receivedAt: new Date(Date.now() - 7200000).toISOString(), read: false },
    { id: 'inbox-3', from: 'Alex Kumar', channel: 'Twitter', message: 'Just saw your post. How does this compare to Linear?', receivedAt: new Date(Date.now() - 86400000).toISOString(), read: true }
  ],
  insights: {
    visitors: 1250,
    conversionRate: 2.4,
    orders: 30,
    revenue: 870,
    bestChannel: 'Direct outreach'
  }
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

// Seeded random number generator for deterministic outputs
function seededRandom(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h >>> 0) / 4294967296);
  };
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

// Ensure operator exists on a project (backward compatible)
function ensureOperator(project) {
  if (!project.operator) {
    project.operator = JSON.parse(JSON.stringify(DEMO_OPERATOR));
    // Seed brand from project name
    const seed = seededRandom(project.name || 'default');
    const colors = generatePalette(seed);
    const initial = (project.name || 'A').charAt(0).toUpperCase();
    project.operator.brand.logoSvg = generateLogoSvg(initial, colors[0]);
    project.operator.brand.palette = colors;
    project.operator.brand.fonts = selectFontPair(seed);
    project.operator.credits.lastTopup = new Date().toISOString().split('T')[0];
    // Non-demo projects start with empty ledger, outbox, and run log
    if (project.id !== DEMO_PROJECT.id) {
      project.operator.ledger.sheets.sales.rows = [];
      project.operator.ledger.sheets.stock.rows = [];
      project.operator.ledger.sheets.costs.rows = [];
      project.operator.outbox = [];
      project.operator.runLog = [];
      project.operator.chat = [];
      project.operator.inbox = [];
      project.operator.schedule = [];
      project.operator.undoStack = [];
    }
  } else {
    // Backward compatibility: migrate old ledger.rows to sheets.sales
    const op = project.operator;
    if (op.ledger && op.ledger.rows && !op.ledger.sheets) {
      op.ledger = {
        sheets: {
          sales: { rows: op.ledger.rows },
          stock: { rows: [] },
          costs: { rows: [] }
        }
      };
    } else if (op.ledger && op.ledger.sheets) {
      // Ensure all sheets exist
      if (!op.ledger.sheets.sales) op.ledger.sheets.sales = { rows: [] };
      if (!op.ledger.sheets.stock) op.ledger.sheets.stock = { rows: [] };
      if (!op.ledger.sheets.costs) op.ledger.sheets.costs = { rows: [] };
    }
    // Ensure new fields exist
    if (!op.chat) op.chat = [];
    if (!op.undoStack) op.undoStack = [];
    if (!op.schedule) op.schedule = [];
    if (!op.inbox) op.inbox = [];
    if (!op.insights) op.insights = { visitors: 0, conversionRate: 0, orders: 0, revenue: 0, bestChannel: 'N/A' };
    if (!op.payments.plans) op.payments.plans = [
      { name: 'Free', price: 0, features: ['Basic features', 'Community support', '1 project'] },
      { name: 'Pro', price: op.payments.price || 29, features: ['All features', 'Priority support', 'Unlimited projects'] },
      { name: 'Max', price: 99, features: ['Everything in Pro', 'Dedicated support', 'Custom integrations'] }
    ];
    // V3 fields: runMode, power, runs, siteVersions
    if (!op.runMode) op.runMode = 'ask';
    if (!op.power) op.power = 'steady';
    if (!op.runs) op.runs = [];
    if (!op.siteVersions) op.siteVersions = [];
  }
  // Daily credit topup
  const today = new Date().toISOString().split('T')[0];
  if (project.operator.credits.lastTopup !== today) {
    const daysPassed = Math.floor((new Date(today) - new Date(project.operator.credits.lastTopup)) / (1000 * 60 * 60 * 24));
    if (daysPassed > 0) {
      project.operator.credits.daily += daysPassed * 5;
      project.operator.credits.lastTopup = today;
    }
  }
  return project.operator;
}

function generatePalette(seed) {
  const hues = [0, 120, 45, 200, 280];
  const baseHue = Math.floor(seed() * 360);
  return [
    `hsl(${baseHue}, 70%, 35%)`,
    `hsl(${(baseHue + 120) % 360}, 60%, 40%)`,
    `hsl(${(baseHue + 45) % 360}, 50%, 50%)`,
    'hsl(0, 0%, 10%)',
    'hsl(0, 0%, 98%)'
  ];
}

function generateLogoSvg(initial, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="${color}" width="100" height="100" rx="20"/><text x="50" y="68" font-family="Georgia" font-size="42" fill="#faf8f3" text-anchor="middle" font-weight="700">${escapeHtml(initial)}</text></svg>`;
}

function selectFontPair(seed) {
  const pairs = [
    { heading: "Georgia,'Times New Roman',serif", body: "Georgia,'Times New Roman',serif" },
    { heading: "Georgia,'Times New Roman',serif", body: "'Segoe UI',Arial,sans-serif" },
    { heading: "'Times New Roman',Georgia,serif", body: "Georgia,'Times New Roman',serif" }
  ];
  return pairs[Math.floor(seed() * pairs.length)] || pairs[0];
}

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

// === OPERATOR MODULE: Otto ===

// Power presets: artifacts count and credit cost
const POWER_PRESETS = {
  light: { artifacts: 3, credits: 10, label: 'Light touch' },
  steady: { artifacts: 6, credits: 25, label: 'Steady clip' },
  big: { artifacts: 10, credits: 50, label: 'Big swing' },
  full: { artifacts: 16, credits: 90, label: 'Full send' }
};

function getAvailableCredits(project) {
  const op = ensureOperator(project);
  return op.credits.welcome + op.credits.daily - op.credits.spent;
}

function spendCredits(project, amount) {
  const op = ensureOperator(project);
  const available = getAvailableCredits(project);
  if (amount > available) return false;
  op.credits.spent += amount;
  saveState();
  return true;
}

function addToRunLog(project, action, result) {
  const op = ensureOperator(project);
  op.runLog.push({ action, result, timestamp: new Date().toISOString() });
  if (op.runLog.length > 50) op.runLog.shift();
}

function addToOutbox(project, artifact) {
  const op = ensureOperator(project);
  artifact.id = 'art-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  artifact.status = 'pending';
  artifact.createdAt = new Date().toISOString();
  op.outbox.unshift(artifact);
  if (op.outbox.length > 100) op.outbox.pop();
}

// Undo stack management
function pushUndoSnapshot(project) {
  const op = ensureOperator(project);
  const snapshot = {
    outbox: JSON.parse(JSON.stringify(op.outbox)),
    ledger: JSON.parse(JSON.stringify(op.ledger)),
    credits: JSON.parse(JSON.stringify(op.credits)),
    schedule: JSON.parse(JSON.stringify(op.schedule || [])),
    inbox: JSON.parse(JSON.stringify(op.inbox || []))
  };
  op.undoStack.push(snapshot);
  if (op.undoStack.length > 10) op.undoStack.shift();
}

function undoLastChange(project) {
  const op = ensureOperator(project);
  if (op.undoStack.length === 0) return false;
  const snapshot = op.undoStack.pop();
  op.outbox = snapshot.outbox;
  op.ledger = snapshot.ledger;
  op.credits = snapshot.credits;
  if (snapshot.schedule) op.schedule = snapshot.schedule;
  if (snapshot.inbox) op.inbox = snapshot.inbox;
  saveState();
  return true;
}

// Chat with Otto
function addChatMessage(project, role, text) {
  const op = ensureOperator(project);
  op.chat.push({ role, text, at: new Date().toISOString() });
  if (op.chat.length > 50) op.chat.shift();
}

function getOttoResponse(project, userInput) {
  const input = userInput.toLowerCase();
  const project_context = state.currentProject;
  
  // Greetings
  if (/^(hi|hello|hey|greetings)/.test(input)) {
    return "Hello! I'm Otto, your local operator. I can help you create brand kits, social posts, email drafts, outreach lists, research snapshots, pitch decks, or landing sites. What would you like to work on?";
  }
  
  // Help
  if (input.includes('help') || input.includes('what can') || input.includes('how to')) {
    return "I can generate: brand kits, social posts (Twitter/LinkedIn/Instagram), email drafts, outreach target lists, market research, pitch decks, and landing sites. Just type what you need, e.g., 'create a brand' or 'draft an email'.";
  }
  
  // Route to generators
  if (input.includes('brand')) return 'brand';
  if (input.includes('post') || input.includes('twitter') || input.includes('linkedin') || input.includes('instagram')) return 'post';
  if (input.includes('email')) return 'email';
  if (input.includes('outreach') || input.includes('customer') || input.includes('find')) return 'outreach';
  if (input.includes('research') || input.includes('market')) return 'research';
  if (input.includes('deck') || input.includes('pitch') || input.includes('slide')) return 'deck';
  if (input.includes('site') || input.includes('landing') || input.includes('web')) return 'site';
  
  // Questions about project
  if (input.includes('project') || input.includes('app') || input.includes('idea')) {
    if (project_context) {
      return `Your project "${project_context.name}" is ${project_context.oneLiner}. I can help you create marketing materials, research, or a landing site for it. What would you like?`;
    }
    return "I don't see a project selected. Open a project from the catalog first, then I can help you create materials for it.";
  }
  
  // Default conversational response
  return "I can help you draft your brand, site, posts, outreach, research, or a deck. What would you like to create? Try typing 'brand', 'post', 'email', 'research', 'deck', or 'site'.";
}

function generateBrandKit(project) {
  const op = ensureOperator(project);
  return {
    type: 'brand',
    title: 'Brand Kit',
    logoSvg: op.brand.logoSvg,
    palette: op.brand.palette,
    fonts: op.brand.fonts,
    description: 'Your brand, from day one.'
  };
}

function generateSocialPosts(project, platform) {
  const op = ensureOperator(project);
  const seed = seededRandom(project.name + platform + op.outbox.length);
  const topics = ['launch', 'feature', 'tip', 'story', 'question'];
  const topic = topics[Math.floor(seed() * topics.length)];
  
  const templates = {
    twitter: {
      copy: `Just shipped ${project.name} — ${project.oneLiner.substring(0, 80)}... #buildinpublic #indiedev`,
      svg: generatePostSvg(project, seed, 'twitter')
    },
    linkedin: {
      copy: `Excited to share ${project.name}: ${project.oneLiner}\n\nBuilt for: ${project.targetUser}\n\n#product #startup`,
      svg: generatePostSvg(project, seed, 'linkedin')
    },
    instagram: {
      copy: `${project.name}\n${project.oneLiner}\n\n#${project.name.replace(/\s/g, '')} #startup #product`,
      svg: generatePostSvg(project, seed, 'instagram')
    }
  };
  
  const post = templates[platform] || templates.twitter;
  return {
    type: 'post',
    platform,
    title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Post`,
    copy: post.copy,
    pictureSvg: post.svg
  };
}

function generatePostSvg(project, seed, platform) {
  const colors = ensureOperator(project).brand.palette;
  const shapes = [];
  const count = 5 + Math.floor(seed() * 8);
  
  for (let i = 0; i < count; i++) {
    const x = seed() * 400;
    const y = seed() * 300;
    const size = 20 + seed() * 80;
    const color = colors[Math.floor(seed() * colors.length)];
    const opacity = 0.3 + seed() * 0.5;
    const type = Math.floor(seed() * 3);
    
    if (type === 0) {
      shapes.push(`<circle cx="${x}" cy="${y}" r="${size/2}" fill="${color}" opacity="${opacity}"/>`);
    } else if (type === 1) {
      shapes.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${color}" opacity="${opacity}" rx="${size/4}"/>`);
    } else {
      shapes.push(`<polygon points="${x},${y- size/2} ${x+size/2},${y+size/2} ${x-size/2},${y+size/2}" fill="${color}" opacity="${opacity}"/>`);
    }
  }
  
  const text = platform === 'twitter' ? 'X' : platform === 'linkedin' ? 'in' : 'IG';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect fill="${colors[4]}" width="400" height="300"/>${shapes.join('')}<text x="200" y="160" font-family="Georgia" font-size="48" fill="${colors[3]}" text-anchor="middle" font-weight="700">${text}</text></svg>`;
}

function generateEmailDraft(project) {
  const op = ensureOperator(project);
  const seed = seededRandom(project.name + 'email');
  const angles = ['problem', 'solution', 'invitation'];
  const angle = angles[Math.floor(seed() * angles.length)];
  
  const subjects = {
    problem: `Quick question about ${project.targetUser.split(' ')[0] || 'your'} workflow`,
    solution: `A better way to ${project.oneLiner.split(' ').slice(0, 4).join(' ')}`,
    invitation: `Beta access: ${project.name}`
  };
  
  const bodies = {
    problem: `Hi there,\n\nI noticed you're ${project.targetUser.toLowerCase()}. We're building ${project.name} — ${project.oneLiner.toLowerCase()}.\n\nWould love your feedback. Open to a quick chat?\n\nBest,\n[Your name]`,
    solution: `Hi,\n\n${project.problem}\n\nWe built ${project.name} to solve this. ${project.oneLiner}\n\nInterested in trying it?\n\nCheers,\n[Your name]`,
    invitation: `Hello,\n\nYou're invited to beta test ${project.name}.\n\n${project.oneLiner}\n\nReply if you'd like early access.\n\nThanks,\n[Your name]`
  };
  
  return {
    type: 'email',
    title: 'Email Draft',
    subject: subjects[angle],
    body: bodies[angle]
  };
}

function generateOutreach(project) {
  const op = ensureOperator(project);
  const seed = seededRandom(project.targetUser + project.name);
  
  const segments = [
    { role: 'Engineering Manager', channel: 'LinkedIn', pain: 'sprint tracking overhead' },
    { role: 'Product Owner', channel: 'Twitter/X', pain: 'keeping teams aligned' },
    { role: 'Startup Founder', channel: 'Email', pain: 'lightweight project management' },
    { role: 'Team Lead', channel: 'Slack communities', pain: 'reducing meeting overhead' }
  ];
  
  const targets = segments.slice(0, 3).map(seg => ({
    role: seg.role,
    channel: seg.channel,
    pain: seg.pain,
    message: `Hi, I saw you're a ${seg.role}. We built ${project.name} for ${project.targetUser.toLowerCase()} dealing with ${seg.pain}. ${project.oneLiner} Worth a look?`
  }));
  
  return {
    type: 'outreach',
    title: 'Outreach Targets',
    targets
  };
}

function generateResearch(project) {
  const op = ensureOperator(project);
  const seed = seededRandom(project.name + 'research');
  
  return {
    type: 'research',
    title: 'Market Snapshot',
    positioning: `${project.name} positions as a ${project.oneLiner.split(' ').slice(0, 5).join(' ')} solution for ${project.targetUser.toLowerCase()}.`,
    competitors: [
      { name: 'Enterprise incumbent', strength: 'Market share', weakness: 'Complex, expensive' },
      { name: 'Simple alternative', strength: 'Easy to use', weakness: 'Limited features' },
      { name: 'Open source option', strength: 'Free, customizable', weakness: 'Self-hosted, no support' },
      { name: 'New startup', strength: 'Modern UX', weakness: 'Unproven, limited traction' }
    ],
    pricingBenchmarks: { low: '$9/mo', mid: '$29/mo', high: '$99/mo' },
    channels: ['Direct outreach', 'Content marketing', 'Community building', 'Paid ads (later)'],
    risks: ['Market saturation', 'Price pressure', 'Distribution challenges'],
    actions: [
      'Focus on a specific niche within ' + project.targetUser,
      'Lead with simplicity vs enterprise complexity',
      'Build in public to gain early adopters',
      'Price at $29/mo mid-tier to signal quality'
    ],
    sourcesNote: 'Locally synthesized analysis (no network calls). Based on pattern matching from brief.'
  };
}

function generateDeck(project) {
  const op = ensureOperator(project);
  return {
    type: 'deck',
    title: 'Pitch Deck',
    slides: [
      { title: project.name, subtitle: project.oneLiner, notes: 'Open with the problem context' },
      { title: 'Problem', content: project.problem, notes: 'Make it relatable with a story' },
      { title: 'Solution', content: project.oneLiner, notes: 'Show, don\'t just tell' },
      { title: 'Market', content: 'Target: ' + project.targetUser, notes: 'Include TAM/SAM if known' },
      { title: 'Product', content: 'Key capabilities from brief', notes: 'Demo if possible' },
      { title: 'Traction', content: 'Early users, feedback, metrics', notes: 'Be honest about stage' },
      { title: 'Business Model', content: 'Subscription, pricing tiers', notes: 'Explain unit economics' },
      { title: 'Ask', content: 'What you need (funding, partners, hires)', notes: 'Be specific' }
    ]
  };
}

function generateSite(project) {
  const op = ensureOperator(project);
  const brand = op.brand;
  const appName = escapeHtml(project.name);
  const navItems = [
    { name: 'Home', file: 'index.html' },
    { name: 'About', file: 'about.html' },
    { name: 'Pricing', file: 'pricing.html' },
    { name: 'Contact', file: 'contact.html' }
  ];
  
  const sharedStyles = `/* ${appName} brand styles */
:root{--accent:${brand.palette[0]};--paper:${brand.palette[4]};--ink:${brand.palette[3]}}
body{font-family:${brand.fonts.body};background:${brand.palette[4]};color:var(--ink);margin:0;line-height:1.6}
.masthead{padding:24px;background:var(--paper);border-bottom:3px solid var(--accent)}
.masthead nav{display:flex;gap:16px;justify-content:center;margin-top:16px}
.masthead nav a{color:var(--ink);text-decoration:none;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.06em}
.masthead nav a:hover{color:var(--accent)}
.masthead h1{font-family:${brand.fonts.heading};color:var(--accent);letter-spacing:0.1em;text-transform:uppercase;margin:0}
.hero{max-width:720px;margin:60px auto;padding:0 24px;text-align:center}
.hero h2{font-size:28px;margin-bottom:16px}
.cta{display:inline-block;background:var(--accent);color:white;padding:14px 32px;text-decoration:none;border-radius:4px;margin-top:24px;font-weight:600}
.features{max-width:900px;margin:60px auto;padding:0 24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:32px}
.feature{padding:24px;background:var(--paper);border:1px solid #d4cfc7;border-radius:4px}
.content{max-width:720px;margin:48px auto;padding:0 24px}
footer{text-align:center;padding:32px;color:#6b6b6b;font-size:14px;border-top:1px solid #d4cfc7;margin-top:48px}`;

  return {
    type: 'site',
    title: 'Multi-page Site',
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${appName}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header class="masthead">
  <h1>${appName.toUpperCase()}</h1>
  <nav>
    <a href="index.html">Home</a>
    <a href="about.html">About</a>
    <a href="pricing.html">Pricing</a>
    <a href="contact.html">Contact</a>
  </nav>
</header>
<main>
<section class="hero">
  <h2>${escapeHtml(project.oneLiner)}</h2>
  <p>${escapeHtml(project.problem)}</p>
  <a href="mailto:hello@example.com" class="cta">Get Early Access</a>
</section>
<section class="features">
  <div class="feature"><h3>Simple</h3><p>No complexity, just what you need.</p></div>
  <div class="feature"><h3>Fast</h3><p>Works instantly, no setup required.</p></div>
  <div class="feature"><h3>Yours</h3><p>Your data, your control, no lock-in.</p></div>
</section>
</main>
<footer>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</footer>
</body>
</html>`,
      'about.html': `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>About - ${appName}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header class="masthead">
  <h1>${appName.toUpperCase()}</h1>
  <nav>
    <a href="index.html">Home</a>
    <a href="about.html">About</a>
    <a href="pricing.html">Pricing</a>
    <a href="contact.html">Contact</a>
  </nav>
</header>
<main class="content">
  <h2>About ${appName}</h2>
  <p>${escapeHtml(project.oneLiner)}</p>
  <p>${escapeHtml(project.problem)}</p>
  <p>Built for: ${escapeHtml(project.targetUser)}</p>
</main>
<footer>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</footer>
</body>
</html>`,
      'pricing.html': `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pricing - ${appName}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header class="masthead">
  <h1>${appName.toUpperCase()}</h1>
  <nav>
    <a href="index.html">Home</a>
    <a href="about.html">About</a>
    <a href="pricing.html">Pricing</a>
    <a href="contact.html">Contact</a>
  </nav>
</header>
<main class="content">
  <h2>Pricing</h2>
  <p>Simple, transparent pricing for ${escapeHtml(project.targetUser)}.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px;margin-top:32px">
    <div class="feature" style="text-align:center">
      <h3 style="font-size:18px">Free</h3>
      <p style="font-size:32px;font-weight:700;margin:16px 0">$0</p>
      <p style="font-size:13px;color:#6b6b6b">Basic features</p>
    </div>
    <div class="feature" style="text-align:center;border-color:var(--accent)">
      <h3 style="font-size:18px">Pro</h3>
      <p style="font-size:32px;font-weight:700;margin:16px 0;color:var(--accent)">$29</p>
      <p style="font-size:13px;color:#6b6b6b">All features</p>
    </div>
  </div>
</main>
<footer>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</footer>
</body>
</html>`,
      'contact.html': `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Contact - ${appName}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header class="masthead">
  <h1>${appName.toUpperCase()}</h1>
  <nav>
    <a href="index.html">Home</a>
    <a href="about.html">About</a>
    <a href="pricing.html">Pricing</a>
    <a href="contact.html">Contact</a>
  </nav>
</header>
<main class="content">
  <h2>Contact Us</h2>
  <p>Have questions? We'd love to hear from you.</p>
  <p style="margin-top:24px"><a href="mailto:hello@example.com" class="cta">Email Us</a></p>
</main>
<footer>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</footer>
</body>
</html>`,
      'styles.css': sharedStyles
    }
  };
}

function generateNewsletter(project) {
  const op = ensureOperator(project);
  const seed = seededRandom(project.name + 'newsletter' + Date.now());
  
  // Get recent posts from outbox for inspiration
  const recentPosts = op.outbox.filter(a => a.type === 'post').slice(0, 2);
  const postInspiration = recentPosts.length > 0 ? recentPosts[0].copy || '' : '';
  
  const subject = `New from ${project.name}: ${project.oneLiner.substring(0, 40)}...`;
  const intro = `Hi there,\\n\\nWe've been working on something exciting for ${project.targetUser.toLowerCase()}. Here's what's new:`;
  
  const productHighlight = `\\n\\n**What is ${project.name}?**\\n${project.oneLiner}\\n\\nIt solves: ${project.problem}`;
  
  const insight = `\\n\\n**Why this matters:**\\nBased on our research, ${project.targetUser} needs simpler tools that focus on what matters most. ${project.name} delivers exactly that.`;
  
  const cta = `\\n\\n**Ready to try it?**\\n[Get Early Access](mailto:hello@example.com)\\n\\nBest regards,\\nThe ${project.name} Team`;
  
  return {
    type: 'newsletter',
    title: 'Newsletter Draft',
    subject,
    body: intro + productHighlight + insight + cta,
    platform: 'email'
  };
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

function setDisplay(id, value) {
  const el = document.getElementById(id);
  if (el) el.style.display = value;
}

function signOut() {
  state.cryptoKey = null;
  state.projects = [];
  state.currentProject = null;
  state.verifyGates = {};
  state.generatedFiles = {};
  state.currentFile = null;
  
  localStorage.removeItem(STORAGE_KEYS.GUEST);
  
  setDisplay('section-gate', 'block');
  setDisplay('section-catalog', 'none');
  setDisplay('section-brief', 'none');
  setDisplay('section-plan', 'none');
  setDisplay('section-verify', 'none');
  setDisplay('section-generate', 'none');
  setDisplay('section-guide', 'none');
  setDisplay('section-operator', 'none');
  setDisplay('main-nav', 'none');
  setDisplay('workspace-chip', 'none');
  setDisplay('signout-btn', 'none');
  setDisplay('nav-plan', 'none');
  setDisplay('nav-verify', 'none');
  setDisplay('nav-generate', 'none');
  
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
  if (section === 'operator') renderOperatorSection();
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderOperatorSection() {
  if (!state.currentProject) {
    state.currentProject = (state.projects && state.projects.length)
      ? state.projects[state.projects.length - 1]
      : DEMO_PROJECT;
    ensureOperator(state.currentProject);
    updateNavForProject(state.currentProject);
  }
  const emptyState = document.getElementById('operator-empty-state');
  const cockpit = document.getElementById('operator-cockpit');
  if (emptyState) emptyState.style.display = 'none';
  if (cockpit) cockpit.style.display = 'block';
  renderOperatorView(state.currentProject);
}

function renderCatalog() {
  const grid = document.getElementById('catalog-grid');
  const emptyState = document.getElementById('catalog-empty');
  const actions = document.querySelector('.catalog-actions');
  const demoCard = grid.querySelector('.demo-card');
  
  grid.querySelectorAll('.project-card:not(.demo-card)').forEach(c => c.remove());
  
  if (state.projects.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (actions) actions.style.display = 'none';
  } else {
    if (emptyState) emptyState.style.display = 'none';
    if (actions) actions.style.display = 'flex';
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
  ensureOperator(project);
  renderPlanView(project);
  updateNavForProject();
  navigateTo('plan');
}

function openDemoProject() {
  state.currentProject = DEMO_PROJECT;
  state.verifyGates = {};
  ensureOperator(DEMO_PROJECT);
  renderPlanView(DEMO_PROJECT);
  updateNavForProject(DEMO_PROJECT);
  navigateTo('plan');
}

function updateNavForProject(project) {
  const hasProject = project && project.id !== DEMO_PROJECT.id;
  const value = hasProject ? 'inline-flex' : 'none';
  setDisplay('nav-plan', value);
  setDisplay('nav-verify', value);
  setDisplay('nav-generate', value);
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

function draftBriefFromIdea() {
  const ideaInput = document.getElementById('operator-input');
  if (!ideaInput) return;
  
  const idea = ideaInput.value.trim();
  if (!idea) {
    showToast('Please enter your idea first');
    return;
  }
  
  const stopwords = ['a', 'an', 'the', 'for', 'with', 'and', 'to', 'of', 'in', 'on', 'at', 'from', 'by'];
  const words = idea.split(/\s+/).filter(w => w.length > 0);
  const significantWords = words.filter(w => !stopwords.includes(w.toLowerCase().replace(/[^a-z]/gi, '')));
  
  const nameWords = significantWords.slice(0, 3);
  const appName = nameWords.length > 0 
    ? nameWords.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    : 'New App';
  
  const oneLiner = idea;
  const problem = `People need a better way to ${idea.toLowerCase().replace(/\.$/, '')}. Current solutions are either too complex or don't address the core need.`;
  const targetUser = `Individuals and small teams who ${words.slice(0, 5).join(' ')}...`;
  const goalWords = significantWords.slice(0, 4).join(' ');
  const jtbd = `When I want to ${goalWords.toLowerCase()}, so I can achieve better outcomes without unnecessary complexity.`;
  
  const successChecks = [
    `Boots from file:// with 0 console errors`,
    `Core feature works: ${goalWords.toLowerCase()}`,
    `Responsive layout at desktop (1440×900) and mobile (390×844)`,
    `Data persists locally in browser storage`
  ];
  
  const nonGoals = `No real-time collaboration, no complex setup, no third-party dependencies`;
  
  const nameField = document.getElementById('brief-app-name');
  const oneLinerField = document.getElementById('brief-one-liner');
  const problemField = document.getElementById('brief-problem');
  const targetUserField = document.getElementById('brief-target-user');
  const jtbdField = document.getElementById('brief-jtbd');
  const nonGoalsField = document.getElementById('brief-non-goals');
  const checksContainer = document.getElementById('success-checks-container');
  
  if (nameField) nameField.value = appName;
  if (oneLinerField) oneLinerField.value = oneLiner;
  if (problemField) problemField.value = problem;
  if (targetUserField) targetUserField.value = targetUser;
  if (jtbdField) jtbdField.value = jtbd;
  if (nonGoalsField) nonGoalsField.value = nonGoals;
  
  if (checksContainer) {
    checksContainer.innerHTML = successChecks.map(check => `
      <div class="success-check-row">
        <input type="text" class="success-check-input" value="${escapeHtml(check)}" required>
        <button type="button" class="btn-icon" onclick="removeSuccessCheck(this)" aria-label="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');
  }
  
  showToast('Brief drafted locally — edit anything');
  suggestKebabCase();
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

function generateGrowPlan(project) {
  const name = project.name || 'App';
  const targetUser = project.targetUser || 'users';
  const oneLiner = project.oneLiner || 'this product';
  
  return [
    { title: `Pick 1-2 launch channels where ${targetUser.toLowerCase()} already hang out`, hint: 'Focus on depth over breadth' },
    { title: `Write a one-paragraph launch post for ${name}`, hint: 'Lead with the problem you solve' },
    { title: 'List 10 target people to reach out to', hint: 'Friends, colleagues, or community members' },
    { title: 'Draft your first outreach message', hint: 'Keep it personal and specific' },
    { title: 'Define a success signal to watch', hint: 'e.g., 5 signups, 1 paying customer' }
  ];
}

function generateEarnPlan(project) {
  const name = project.name || 'App';
  const oneLiner = project.oneLiner || 'this product';
  
  return [
    { title: `Write the one-sentence offer for ${name}`, hint: 'What they get + what it costs' },
    { title: 'Pick a first price hypothesis', hint: 'Start higher than comfortable' },
    { title: 'Define the first paid ask/CTA', hint: 'Clear, direct, low-friction' },
    { title: 'Decide the payment path', hint: 'Stripe, PayPal, Gumroad, or manual' },
    { title: 'Set a simple sell-through check', hint: 'e.g., 3/10 prospects say yes' }
  ];
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
  
  const growList = document.getElementById('grow-list');
  if (growList) {
    growList.innerHTML = '';
    const growPlan = generateGrowPlan(project);
    growPlan.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'dod-item';
      li.innerHTML = `<input type="checkbox" class="dod-checkbox" id="grow-${index}"><label for="grow-${index}">${escapeHtml(item.title)}</label>`;
      growList.appendChild(li);
    });
  }
  
  const earnList = document.getElementById('earn-list');
  if (earnList) {
    earnList.innerHTML = '';
    const earnPlan = generateEarnPlan(project);
    earnPlan.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'dod-item';
      li.innerHTML = `<input type="checkbox" class="dod-checkbox" id="earn-${index}"><label for="earn-${index}">${escapeHtml(item.title)}</label>`;
      earnList.appendChild(li);
    });
  }
  
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
  
  const growPlan = generateGrowPlan(project);
  files['docs/GROW.md'] = `# GROW — ${appName}

Launch and reach checklist.

${growPlan.map((item, i) => `${i + 1}. **${item.title}**\n   ${item.hint}`).join('\n\n')}

## Success signal
Define one metric that tells you growth is working: e.g., 10 active users in week 1, 50 signups in month 1.

## Channels to test
- Direct outreach (DMs, emails, calls)
- Community posts (Indie Hackers, Reddit, Twitter/X)
- Content (blog post, tutorial, case study)
- Paid (if applicable): small test budget

## Iterate
Track what works. Double down on channels that bring engaged users. Drop what doesn't work after a fair test.`;
  
  const earnPlan = generateEarnPlan(project);
  files['docs/EARN.md'] = `# EARN — ${appName}

Offer and pricing checklist.

${earnPlan.map((item, i) => `${i + 1}. **${item.title}**\n   ${item.hint}`).join('\n\n')}

## Pricing notes
- Start higher than comfortable — you can always lower or add tiers
- Early adopters expect to pay less; validate at full price too
- Watch for willingness-to-pay signals: questions about features, integration needs, team use

## Revenue milestones
- First $1: prove someone will pay
- First $100/mo: prove repeatable value
- First $1k/mo: prove scalable offer

## Iterate
Adjust price, packaging, or positioning based on real buyer feedback.`;
  
  files['docs/PLAN.md'] = `# PLAN — ${appName}

Complete Build → Grow → Earn overview.

## Build (M0→M2)
- M0: Specification — brief, capability matrix, DoD
- M1: Scaffold + Design System — file tree, tokens, components, responsive layout
- M2: Verification — smoke tests, visual checks, acceptance criteria

## Grow (post-launch)
- Pick 1-2 channels where target users hang out
- Write launch post, list 10 targets, draft outreach
- Define success signal (e.g., 5 signups week 1)

## Earn (monetization)
- Write one-sentence offer
- Pick price hypothesis, define first paid CTA
- Decide payment path (Stripe/PayPal/Gumroad/manual)
- Set sell-through check (e.g., 3/10 say yes)

## Timeline
| Phase | Focus | Exit criteria |
|-------|-------|---------------|
| M0 | Spec | Brief complete, DoD defined |
| M1 | Build | Scaffold deployed, layout responsive |
| M2 | Verify | All gates passed |
| M3 | Launch | First users onboarded |
| Grow | Reach | Success signal hit |
| Earn | Revenue | First paying customer |`;
  
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
  
  const earnPlan = generateEarnPlan(project);
  
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
${escapeHtml(project.nonGoals)}

## Grow
${growPlan.map(item => `- [ ] ${item.title}`).join('\n')}

## Earn
${earnPlan.map(item => `- [ ] ${item.title}`).join('\n')}`;
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

// === OPERATOR UI FUNCTIONS ===

let operatorOutboxTab = 'pending';
let operatorActiveTab = 'overview';
let operatorLedgerSheet = 'sales';
let globalSearchQuery = '';

function renderOperatorContext(project) {
  const cockpit = document.getElementById('operator-cockpit');
  const header = cockpit && cockpit.querySelector('.operator-cockpit-header');
  if (!header) return;
  let ctx = document.getElementById('operator-context');
  if (!ctx) {
    ctx = document.createElement('div');
    ctx.id = 'operator-context';
    ctx.className = 'operator-context';
    header.insertBefore(ctx, header.firstChild);
  }
  ctx.innerHTML = `Otto is operating on <strong>${escapeHtml(project.name)}</strong> <button class="btn btn-sm btn-text" onclick="navigateTo('catalog')">Switch project</button>`;
}

function renderOperatorView(project) {
  const op = ensureOperator(project);
  renderOperatorContext(project);
  const credits = getAvailableCredits(project);
  const salesRows = op.ledger.sheets?.sales?.rows || [];
  const totalRevenue = salesRows.reduce((sum, row) => sum + (row.revenue || 0), 0);
  const pendingCount = op.outbox.filter(a => a.status === 'pending').length;
  const integrationsActive = Object.values(op.integrations || {}).filter(v => v).length;
  
  // Update hero stats
  const creditsEl = document.getElementById('operator-credits');
  if (creditsEl) creditsEl.textContent = `${credits} credits`;
  
  const autopilotToggle = document.getElementById('operator-autopilot');
  if (autopilotToggle) {
    autopilotToggle.checked = op.autopilot;
    autopilotToggle.parentElement.title = op.autopilot ? 'On its own (auto-approves)' : 'Ask first (requires approval)';
  }
  
  // Render tabs
  renderOperatorTabs(op);
  
  // Render active tab content
  const undoBtn = document.getElementById('operator-undo-btn');
  if (undoBtn) undoBtn.disabled = !(op.undoStack && op.undoStack.length);

  const tabContent = document.getElementById('operator-tab-content');
  if (!tabContent) return;
  
  switch (operatorActiveTab) {
    case 'overview':
      tabContent.innerHTML = renderOverviewTab(op, project);
      renderBrandKit(op);
      renderOperatorChat(op);
      attachChatHandlers();
      renderRunPanel(op, project);
      break;
    case 'create':
      tabContent.innerHTML = renderCreateTab(op, project);
      renderOutbox(op);
      renderSitePanel(op, project);
      break;
    case 'library':
      tabContent.innerHTML = renderLibraryTab(op, project);
      renderLibraryList(op);
      break;
    case 'grow':
      tabContent.innerHTML = renderGrowTab(op, project);
      attachCalendarHandlers();
      attachInboxHandlers();
      break;
    case 'money':
      tabContent.innerHTML = renderMoneyTab(op, project);
      attachLedgerSheetHandlers();
      attachPaymentsHandlers();
      break;
    case 'data':
      tabContent.innerHTML = renderDataTab(op, project);
      attachSearchHandlers();
      attachDataHandlers();
      break;
  }
  
  // Render sidebar (common)
  renderOperatorSidebar(op);
  
  // Update mode/power button states
  updateModePowerButtons();
}

function renderOperatorTabs(op) {
  const container = document.getElementById('operator-tabs');
  if (!container) return;
  
  const tabs = ['overview', 'create', 'library', 'grow', 'money', 'data'];
  container.innerHTML = tabs.map(tab => `
    <button class="operator-tab ${operatorActiveTab === tab ? 'active' : ''}" 
            data-tab="${tab}" 
            role="tab" 
            aria-selected="${operatorActiveTab === tab}"
            onclick="switchOperatorTab('${tab}')">
      ${tab.charAt(0).toUpperCase() + tab.slice(1)}
    </button>
  `).join('');
}

function switchOperatorTab(tab) {
  operatorActiveTab = tab;
  if (state.currentProject) {
    renderOperatorView(state.currentProject);
  }
}

function renderOverviewTab(op, project) {
  const salesRows = op.ledger.sheets?.sales?.rows || [];
  const totalRevenue = salesRows.reduce((sum, row) => sum + (row.revenue || 0), 0);
  const pendingCount = op.outbox.filter(a => a.status === 'pending').length;
  const integrationsActive = Object.values(op.integrations || {}).filter(v => v).length;
  
  return `
    <div class="operator-hero-stats">
      <div class="operator-stat-tile">
        <span class="operator-stat-label">Credits</span>
        <span class="operator-stat-value" style="color:var(--color-accent)">${getAvailableCredits(project)}</span>
      </div>
      <div class="operator-stat-tile">
        <span class="operator-stat-label">Pending</span>
        <span class="operator-stat-value">${pendingCount}</span>
      </div>
      <div class="operator-stat-tile">
        <span class="operator-stat-label">Passes</span>
        <span class="operator-stat-value">${op.runs.length}</span>
      </div>
      <div class="operator-stat-tile">
        <span class="operator-stat-label">Revenue</span>
        <span class="operator-stat-value">$${totalRevenue.toLocaleString()}</span>
      </div>
      <div class="operator-stat-tile">
        <span class="operator-stat-label">Integrations</span>
        <span class="operator-stat-value">${integrationsActive}</span>
      </div>
    </div>
    
    <div class="operator-grid">
      <div class="operator-main">
        <div id="operator-run-panel"></div>
        <div class="operator-card">
          <h3 class="operator-card-title">Chat with Otto</h3>
          <div id="operator-chat-thread" class="operator-chat-thread"></div>
          <div class="operator-chat-input-row">
            <input type="text" id="operator-chat-input" placeholder="Type a message..." autocomplete="off">
            <button class="btn btn-primary" id="operator-chat-send">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
          ${op.chat.length < 3 ? '<div class="operator-chat-suggestions"><button class="operator-chip" data-suggest="Create a brand kit">Brand kit</button><button class="operator-chip" data-suggest="Draft a LinkedIn post">LinkedIn post</button><button class="operator-chip" data-suggest="Write an email">Email</button><button class="operator-chip" data-suggest="Market research">Research</button></div>' : ''}
        </div>
        
        <div id="operator-brand-kit"></div>
        <div id="operator-ledger"></div>
      </div>
      <div class="operator-sidebar" id="operator-sidebar"></div>
    </div>
  `;
}

function renderRunPanel(op, project) {
  const container = document.getElementById('operator-run-panel');
  if (!container) return;
  
  const powerCfg = POWER_PRESETS[op.power] || POWER_PRESETS.steady;
  const modeLabel = op.runMode === 'auto' ? 'On its own (auto-approve)' : 'Ask first (pending approval)';
  
  container.innerHTML = `
    <div class="operator-card" style="margin-bottom:var(--spacing-lg)">
      <h3 class="operator-card-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        Run Settings
      </h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--spacing-md);margin-top:var(--spacing-md)">
        <div>
          <span style="font-size:11px;font-weight:600;color:var(--color-muted);text-transform:uppercase">Current mode</span>
          <p style="font-size:14px;font-weight:600;margin-top:4px">${modeLabel}</p>
        </div>
        <div>
          <span style="font-size:11px;font-weight:600;color:var(--color-muted);text-transform:uppercase">Current power</span>
          <p style="font-size:14px;font-weight:600;margin-top:4px">${powerCfg.label} (${powerCfg.artifacts} artifacts, ${powerCfg.credits} credits)</p>
        </div>
      </div>
      ${op.runs.length > 0 ? `
        <div style="margin-top:var(--spacing-md)">
          <span style="font-size:11px;font-weight:600;color:var(--color-muted);text-transform:uppercase">Run history</span>
          <div class="run-history-list" style="margin-top:var(--spacing-sm)">
            ${op.runs.slice(0, 5).map((run, idx) => `
              <div class="run-history-entry">
                <div style="flex:1">
                  <span style="font-size:12px;font-weight:600">${new Date(run.at).toLocaleDateString()}</span>
                  <span style="font-size:11px;color:var(--color-muted);margin-left:8px">${run.mode === 'auto' ? 'Auto' : 'Ask'} · ${POWER_PRESETS[run.power]?.label || run.power}</span>
                </div>
                <div style="font-size:11px;color:var(--color-muted)">${run.artifacts} artifacts · ${run.credits} credits</div>
                <button class="btn btn-sm btn-text" onclick="undoRun(${idx})" style="font-size:11px;padding:2px 8px">Undo</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderCreateTab(op, project) {
  return `
    <div class="operator-grid">
      <div class="operator-main">
        <div class="operator-card">
          <h3 class="operator-card-title">Create Content</h3>
          <p class="operator-note">All content is generated locally and deterministically from your project brief. Use the command bar above, or pick a quick action.</p>
          <div class="operator-quick-actions" style="margin-top:var(--spacing-md)">
            <button class="operator-chip" onclick="quickCommand('brand')">Brand Kit</button>
            <button class="operator-chip" onclick="quickCommand('twitter post')">Twitter Post</button>
            <button class="operator-chip" onclick="quickCommand('linkedin post')">LinkedIn Post</button>
            <button class="operator-chip" onclick="quickCommand('email')">Email Draft</button>
            <button class="operator-chip" onclick="quickCommand('outreach')">Outreach List</button>
            <button class="operator-chip" onclick="quickCommand('research')">Market Research</button>
            <button class="operator-chip" onclick="quickCommand('deck')">Pitch Deck</button>
            <button class="operator-chip" onclick="quickCommand('site')">Landing Site</button>
            <button class="operator-chip" onclick="quickCommand('newsletter')">Newsletter</button>
          </div>
        </div>
        <div id="operator-site-panel"></div>
        <div id="operator-outbox"></div>
      </div>
      <div class="operator-sidebar" id="operator-sidebar"></div>
    </div>
  `;
}

function renderSitePanel(op, project) {
  const container = document.getElementById('operator-site-panel');
  if (!container) return;
  
  const hasSite = op.siteVersions && op.siteVersions.length > 0;
  
  container.innerHTML = `
    <div class="operator-card" style="margin-top:var(--spacing-lg)">
      <h3 class="operator-card-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        Multi-page Site
      </h3>
      <p class="operator-note">Generate a 4-page site (index, about, pricing, contact) with shared styles and navigation.</p>
      <div class="operator-actions" style="margin-top:var(--spacing-md)">
        <button class="btn btn-sm btn-primary" onclick="generateAndPreviewSite()">Generate Site</button>
        ${hasSite ? `<button class="btn btn-sm btn-secondary" onclick="viewSiteVersions()">View versions (${op.siteVersions.length})</button>` : ''}
      </div>
    </div>
  `;
}

function renderLibraryTab(op, project) {
  const allArtifacts = op.outbox || [];
  const types = ['all', 'brand', 'post', 'email', 'outreach', 'research', 'deck', 'site', 'newsletter'];
  const statuses = ['all', 'pending', 'approved', 'rejected'];
  
  // Get unique types from artifacts
  const artifactTypes = [...new Set(allArtifacts.map(a => a.type))];
  
  return `
    <div class="operator-grid">
      <div class="operator-main">
        <div class="operator-card">
          <h3 class="operator-card-title">Library</h3>
          <p class="operator-note">All generated artifacts across all types and statuses.</p>
          <div class="library-filters" style="margin-top:var(--spacing-md);display:flex;gap:var(--spacing-sm);flex-wrap:wrap">
            <select id="library-type-filter" onchange="renderLibraryList()" style="padding:8px 12px;background:var(--color-border-light);border:1px solid var(--color-border);border-radius:var(--radius-card);font-size:13px">
              ${types.map(t => `<option value="${t}">${t === 'all' ? 'All types' : t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
            </select>
            <select id="library-status-filter" onchange="renderLibraryList()" style="padding:8px 12px;background:var(--color-border-light);border:1px solid var(--color-border);border-radius:var(--radius-card);font-size:13px">
              ${statuses.map(s => `<option value="${s}">${s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
            </select>
            <input type="text" id="library-search" placeholder="Search..." oninput="renderLibraryList()" style="flex:1;min-width:150px;padding:8px 12px;background:var(--color-border-light);border:1px solid var(--color-border);border-radius:var(--radius-card);font-size:13px">
            <button class="btn btn-sm btn-secondary" onclick="exportLibraryMarkdown()">Export (MD)</button>
          </div>
        </div>
        <div id="operator-library-list"></div>
      </div>
      <div class="operator-sidebar" id="operator-sidebar"></div>
    </div>
  `;
}

function renderLibraryList(op) {
  const container = document.getElementById('operator-library-list');
  if (!container) return;
  
  const typeFilter = document.getElementById('library-type-filter')?.value || 'all';
  const statusFilter = document.getElementById('library-status-filter')?.value || 'all';
  const searchQuery = (document.getElementById('library-search')?.value || '').toLowerCase();
  
  let filtered = op.outbox || [];
  
  if (typeFilter !== 'all') {
    filtered = filtered.filter(a => a.type === typeFilter);
  }
  if (statusFilter !== 'all') {
    filtered = filtered.filter(a => a.status === statusFilter);
  }
  if (searchQuery) {
    filtered = filtered.filter(a => 
      (a.title || '').toLowerCase().includes(searchQuery) ||
      (a.copy || '').toLowerCase().includes(searchQuery) ||
      (a.body || '').toLowerCase().includes(searchQuery) ||
      (a.subject || '').toLowerCase().includes(searchQuery)
    );
  }
  
  if (filtered.length === 0) {
    container.innerHTML = '<div class="operator-empty" style="padding:var(--spacing-xl)">No artifacts match your filters</div>';
    return;
  }
  
  container.innerHTML = `
    <div class="operator-card">
      <h3 class="operator-card-title">${filtered.length} artifact${filtered.length !== 1 ? 's' : ''}</h3>
      <div class="library-list" style="margin-top:var(--spacing-md)">
        ${filtered.map(artifact => `
          <div class="library-item">
            <div class="library-item-header">
              <span class="library-item-type">${artifact.type}</span>
              <span class="library-item-title">${escapeHtml(artifact.title)}</span>
              <span class="library-item-status ${artifact.status}">${artifact.status}</span>
              <span class="library-item-date">${new Date(artifact.createdAt).toLocaleDateString()}</span>
            </div>
            <div class="library-item-actions">
              <button class="btn btn-sm btn-text" onclick="viewArtifact('${artifact.id}')">Open</button>
              <button class="btn btn-sm btn-text" onclick="copyArtifactContent('${artifact.id}')">Copy</button>
              <button class="btn btn-sm btn-text" onclick="downloadArtifact('${artifact.id}')">Download</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function exportLibraryMarkdown() {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  
  let md = `# ${state.currentProject.name} — Artifact Library\n\n`;
  md += `Exported: ${new Date().toISOString()}\n\n`;
  
  op.outbox.forEach((artifact, i) => {
    md += `## ${i + 1}. ${artifact.title} [${artifact.type} · ${artifact.status}]\n\n`;
    if (artifact.copy) md += `${artifact.copy}\n\n`;
    if (artifact.body) md += `${artifact.body}\n\n`;
    if (artifact.subject) md += `**Subject:** ${artifact.subject}\n\n`;
    if (artifact.positioning) md += `${artifact.positioning}\n\n`;
    md += `---\n\n`;
  });
  
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${toKebabCase(state.currentProject.name)}-library.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Library exported as Markdown');
}

function generateAndPreviewSite() {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  
  pushUndoSnapshot(state.currentProject);
  const siteArtifact = generateSite(state.currentProject);
  siteArtifact.status = 'approved';
  siteArtifact.createdAt = new Date().toISOString();
  siteArtifact.id = 'site-' + Date.now();
  
  // Save to site versions
  op.siteVersions.unshift({
    at: new Date().toISOString(),
    files: siteArtifact.files,
    artifactId: siteArtifact.id
  });
  if (op.siteVersions.length > 5) op.siteVersions.pop();
  
  addToOutbox(state.currentProject, siteArtifact);
  addToRunLog(state.currentProject, 'site', 'Generated multi-page site');
  saveState();
  
  // Preview the site in a modal
  viewSiteVersion(0);
  renderOperatorView(state.currentProject);
  showToast('Site generated and added to library');
}

function viewSiteVersions() {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  
  const modalHtml = `
    <div class="operator-modal-backdrop" role="dialog" aria-modal="true" onclick="if(event.target===this)closeSiteVersions()">
      <div class="operator-modal" style="max-width:600px">
        <div class="operator-modal-header">
          <h3 class="operator-modal-title">Site Versions</h3>
          <button class="operator-modal-close" onclick="closeSiteVersions()" aria-label="Close">&times;</button>
        </div>
        <div class="operator-modal-body">
          ${op.siteVersions.length === 0 ? '<div class="operator-empty">No site versions yet</div>' : op.siteVersions.map((v, idx) => `
            <div class="library-item">
              <div class="library-item-header">
                <span class="library-item-type">Site</span>
                <span class="library-item-title">Version ${idx + 1}</span>
                <span class="library-item-date">${new Date(v.at).toLocaleDateString()}</span>
              </div>
              <div class="library-item-actions">
                <button class="btn btn-sm btn-text" onclick="viewSiteVersion(${idx})">Preview</button>
                <button class="btn btn-sm btn-text" onclick="downloadSiteVersion(${idx})">Download</button>
                ${idx > 0 ? `<button class="btn btn-sm btn-text" style="color:var(--color-distracting)" onclick="restoreSiteVersion(${idx})">Restore</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  
  const existing = document.querySelector('.operator-modal-backdrop');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  document.body.style.overflow = 'hidden';
}

function closeSiteVersions() {
  const modal = document.querySelector('.operator-modal-backdrop');
  if (modal) {
    modal.remove();
    document.body.style.overflow = '';
  }
}

function buildSitePreviewHtml(files) {
  const html = (files && files['index.html']) || '';
  const css = (files && files['styles.css']) || '';
  return html.replace(/<link[^>]*href=["']styles\.css["'][^>]*>/i, `<style>${css}</style>`);
}

function viewSiteVersion(versionIndex) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const version = op.siteVersions[versionIndex];
  if (!version) return;
  
  const previewHtml = buildSitePreviewHtml(version.files);
  
  const modalHtml = `
    <div class="operator-modal-backdrop" role="dialog" aria-modal="true" onclick="if(event.target===this)closeSiteVersion()">
      <div class="operator-modal" style="max-width:900px;max-height:90vh">
        <div class="operator-modal-header">
          <h3 class="operator-modal-title">Site Preview (Version ${versionIndex + 1})</h3>
          <div class="operator-modal-actions">
            <button class="btn btn-sm btn-secondary" onclick="copySiteVersion(${versionIndex})">Copy HTML</button>
            <button class="btn btn-sm btn-secondary" onclick="downloadSiteVersion(${versionIndex})">Download</button>
            <button class="operator-modal-close" onclick="closeSiteVersion()" aria-label="Close">&times;</button>
          </div>
        </div>
        <div class="operator-modal-body" style="padding:0">
          <iframe srcdoc="${previewHtml.replace(/"/g, '&quot;')}" sandbox="" style="width:100%;height:600px;border:none;border-top:1px solid var(--color-border)"></iframe>
        </div>
      </div>
    </div>
  `;
  
  const existing = document.querySelector('.operator-modal-backdrop');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  document.body.style.overflow = 'hidden';
}

function closeSiteVersion() {
  const modal = document.querySelector('.operator-modal-backdrop');
  if (modal) {
    modal.remove();
    document.body.style.overflow = '';
  }
}

function downloadSiteVersion(versionIndex) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const version = op.siteVersions[versionIndex];
  if (!version) return;
  
  // Create a ZIP-like bundle (JSON for now)
  const bundle = {
    project: state.currentProject.name,
    version: versionIndex + 1,
    exportedAt: new Date().toISOString(),
    files: version.files
  };
  
  const dataStr = JSON.stringify(bundle, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${toKebabCase(state.currentProject.name)}-site-v${versionIndex + 1}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Site bundle downloaded');
}

function copySiteVersion(versionIndex) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const version = op.siteVersions[versionIndex];
  if (!version) return;
  
  const indexHtml = version.files['index.html'] || '';
  navigator.clipboard.writeText(indexHtml).then(() => showToast('Site HTML copied'));
}

function restoreSiteVersion(versionIndex) {
  if (!state.currentProject) return;
  if (!confirm('Restore this site version? This will replace the current version.')) return;
  
  const op = ensureOperator(state.currentProject);
  const version = op.siteVersions[versionIndex];
  if (!version) return;
  
  // Move current version to history
  const currentVersion = op.siteVersions[0];
  op.siteVersions.splice(versionIndex, 0, currentVersion);
  op.siteVersions.shift();
  
  showToast('Site version restored');
  closeSiteVersions();
  renderOperatorView(state.currentProject);
}

function renderGrowTab(op, project) {
  const scheduleHtml = renderContentCalendar(op);
  const inboxHtml = renderInbox(op);
  
  return `
    <div class="operator-grid">
      <div class="operator-main">
        <div class="operator-card">
          <h3 class="operator-card-title">Content Calendar</h3>
          <p class="operator-note">Schedule posts locally — no network sync. Simulated for planning.</p>
          ${scheduleHtml}
        </div>
        <div class="operator-card" style="margin-top:var(--spacing-lg)">
          <h3 class="operator-card-title">Unified Inbox</h3>
          <p class="operator-note">Simulated locally — no network. Replies generated from outreach.</p>
          ${inboxHtml}
        </div>
      </div>
      <div class="operator-sidebar" id="operator-sidebar"></div>
    </div>
  `;
}

function renderMoneyTab(op, project) {
  const ledgerHtml = renderMultiSheetLedger(op);
  const paymentsHtml = renderPaymentsPlans(op);
  const insightsHtml = renderInsights(op);
  
  return `
    <div class="operator-grid">
      <div class="operator-main">
        <div class="operator-card">
          <h3 class="operator-card-title">Insights</h3>
          ${insightsHtml}
        </div>
        <div class="operator-card" style="margin-top:var(--spacing-lg)">
          <h3 class="operator-card-title">Ledger</h3>
          ${ledgerHtml}
        </div>
        <div class="operator-card" style="margin-top:var(--spacing-lg)">
          <h3 class="operator-card-title">Payments</h3>
          ${paymentsHtml}
        </div>
      </div>
      <div class="operator-sidebar" id="operator-sidebar"></div>
    </div>
  `;
}

function renderDataTab(op, project) {
  return `
    <div class="operator-grid">
      <div class="operator-main">
        <div class="operator-card">
          <h3 class="operator-card-title">Global Search</h3>
          <p class="operator-note">Search your outbox, chat history, and research locally.</p>
          <div class="operator-command-bar" style="margin-top:var(--spacing-md)">
            <input type="text" id="operator-search-input" placeholder="Search artifacts, chat, research..." value="${escapeHtml(globalSearchQuery)}" oninput="handleGlobalSearch(this.value)">
          </div>
          <div id="operator-search-results" style="margin-top:var(--spacing-md)"></div>
        </div>
        <div class="operator-card" style="margin-top:var(--spacing-lg)">
          <h3 class="operator-card-title">Data & Privacy</h3>
          <p class="operator-note">Your data is stored locally in browser storage. It is never sent to any server or used for training.</p>
          <div class="operator-actions" style="margin-top:var(--spacing-md)">
            <button class="btn btn-secondary" onclick="exportOperatorBundle()">Export All (JSON)</button>
            <button class="btn btn-secondary" onclick="exportOperatorMarkdown()">Export Markdown</button>
            <button class="btn btn-secondary" onclick="copyWorkspaceJson()">Copy Workspace JSON</button>
          </div>
          <div class="operator-actions" style="margin-top:var(--spacing-sm)">
            <button class="btn btn-secondary" style="color:var(--color-distracting);border-color:var(--color-distracting)" onclick="wipeOperatorData()">Wipe Operator Data</button>
          </div>
          <p class="operator-note" style="margin-top:var(--spacing-md);font-size:11px">Wiping resets Otto's data (chat, outbox, ledger, inbox, schedule) to defaults. Your project brief remains unchanged.</p>
        </div>
      </div>
      <div class="operator-sidebar" id="operator-sidebar"></div>
    </div>
  `;
}

// === NEW HELPER FUNCTIONS FOR OPERATOR V2 ===

function renderOperatorChat(op) {
  const container = document.getElementById('operator-chat-thread');
  if (!container) return;
  
  if (op.chat.length === 0) {
    container.innerHTML = '<div class="operator-empty">Start a conversation with Otto...</div>';
    return;
  }
  
  container.innerHTML = op.chat.map(msg => `
    <div class="operator-chat-bubble ${msg.role}">
      ${msg.role === 'otto' ? '<div class="operator-chat-avatar">O</div>' : ''}
      <div class="operator-chat-text">${escapeHtml(msg.text).replace(/\n/g, '<br>')}</div>
      <div class="operator-chat-time">${new Date(msg.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
    </div>
  `).join('');
  
  container.scrollTop = container.scrollHeight;
}

function attachChatHandlers() {
  const input = document.getElementById('operator-chat-input');
  const sendBtn = document.getElementById('operator-chat-send');
  const suggestBtns = document.querySelectorAll('.operator-chip[data-suggest]');
  
  if (!input || !sendBtn) return;
  
  sendBtn.addEventListener('click', () => handleChatSubmit());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleChatSubmit();
  });
  
  suggestBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.suggest;
      handleChatSubmit();
    });
  });
}

function handleChatSubmit() {
  if (!state.currentProject) return;
  const input = document.getElementById('operator-chat-input');
  if (!input) return;
  
  const text = input.value.trim();
  if (!text) return;
  
  const op = ensureOperator(state.currentProject);
  
  // Add user message
  addChatMessage(state.currentProject, 'user', text);
  input.value = '';
  
  // Get Otto's response
  const response = getOttoResponse(state.currentProject, text);
  
  // If it's a generator command, execute it
  if (['brand', 'post', 'email', 'outreach', 'research', 'deck', 'site'].includes(response)) {
    const cmdMap = { brand: 'brand', post: 'twitter post', email: 'email', outreach: 'outreach', research: 'research', deck: 'deck', site: 'site' };
    const originalCmd = input.value || text;
    
    // Simulate command execution
    const cmdInput = document.getElementById('operator-command-input');
    if (cmdInput) {
      cmdInput.value = cmdMap[response];
      handleOperatorCommand();
    }
    
    addChatMessage(state.currentProject, 'otto', `I've generated a ${response} and added it to your Outbox. Check the Create tab to review.`);
  } else {
    // Conversational response
    addChatMessage(state.currentProject, 'otto', response);
  }
  
  saveState();
  renderOperatorChat(op);
}

function renderContentCalendar(op) {
  const today = new Date();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  
  const postsByDay = {};
  (op.schedule || []).forEach(s => {
    if (!postsByDay[s.date]) postsByDay[s.date] = [];
    postsByDay[s.date].push(s);
  });
  
  return `
    <div class="operator-calendar-grid">
      ${days.map(day => {
        const dateStr = day.toISOString().split('T')[0];
        const dayName = day.toLocaleDateString('en-US', {weekday:'short'});
        const dayNum = day.getDate();
        const scheduled = postsByDay[dateStr] || [];
        
        return `
          <div class="operator-calendar-day" data-date="${dateStr}">
            <div class="operator-calendar-day-header">
              <span class="operator-calendar-day-name">${dayName}</span>
              <span class="operator-calendar-day-num">${dayNum}</span>
            </div>
            <div class="operator-calendar-day-items">
              ${scheduled.length === 0 ? '<span class="operator-calendar-empty">No posts</span>' : scheduled.map(s => `
                <div class="operator-calendar-chip ${s.platform}">
                  <span>${s.platform}</span>
                  <button class="operator-calendar-remove" data-schedule-id="${s.id}">&times;</button>
                </div>
              `).join('')}
            </div>
            ${scheduled.length === 0 ? `<button class="btn btn-sm btn-secondary operator-calendar-add" data-date="${dateStr}">+ Schedule</button>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function attachCalendarHandlers() {
  document.querySelectorAll('.operator-calendar-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.date;
      if (!state.currentProject) return;
      const op = ensureOperator(state.currentProject);
      const pendingPosts = op.outbox.filter(a => a.type === 'post' && a.status === 'pending');
      if (pendingPosts.length === 0) {
        showToast('No pending posts to schedule');
        return;
      }
      const post = pendingPosts[0];
      op.schedule = op.schedule || [];
      op.schedule.push({
        id: 'sched-' + Date.now(),
        artifactId: post.id,
        date,
        time: '09:00',
        platform: post.platform || 'generic'
      });
      saveState();
      renderOperatorView(state.currentProject);
    });
  });
  
  document.querySelectorAll('.operator-calendar-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.currentProject) return;
      const op = ensureOperator(state.currentProject);
      const id = btn.dataset.scheduleId;
      op.schedule = (op.schedule || []).filter(s => s.id !== id);
      saveState();
      renderOperatorView(state.currentProject);
    });
  });
}

function renderInbox(op) {
  const inbox = op.inbox || [];
  
  if (inbox.length === 0) {
    return '<div class="operator-empty">No messages yet. Generate outreach to receive simulated replies.</div>';
  }
  
  return `
    <div class="operator-inbox-list">
      ${inbox.map(msg => `
        <div class="operator-inbox-item ${msg.read ? '' : 'unread'}">
          <div class="operator-inbox-header">
            <span class="operator-inbox-from">${escapeHtml(msg.from)}</span>
            <span class="operator-inbox-channel">${escapeHtml(msg.channel)}</span>
            <span class="operator-inbox-time">${new Date(msg.receivedAt).toLocaleDateString()}</span>
          </div>
          <div class="operator-inbox-message">${escapeHtml(msg.message)}</div>
          <div class="operator-inbox-actions">
            <button class="btn btn-sm btn-secondary" onclick="draftReply('${msg.id}')">Draft reply</button>
            <button class="btn btn-sm btn-text" onclick="archiveMessage('${msg.id}')">Archive</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function attachInboxHandlers() {
  // Handlers are inline onclick for simplicity
}

function draftReply(msgId) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const msg = (op.inbox || []).find(m => m.id === msgId);
  if (!msg) return;
  
  const artifact = {
    type: 'email',
    title: `Re: ${msg.from}`,
    subject: `Re: Your inquiry`,
    body: `Hi ${msg.from.split(' ')[0]},\n\nThanks for reaching out! ${msg.message}\n\nI'd be happy to help. Let me know if you have any questions.\n\nBest,\n[Your name]`
  };
  
  pushUndoSnapshot(state.currentProject);
  addToOutbox(state.currentProject, artifact);
  saveState();
  renderOperatorView(state.currentProject);
  showToast('Draft reply added to Outbox');
}

function archiveMessage(msgId) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  op.inbox = (op.inbox || []).filter(m => m.id !== msgId);
  saveState();
  renderOperatorView(state.currentProject);
}

function renderMultiSheetLedger(op) {
  const sheets = ['sales', 'stock', 'costs'];
  const currentSheet = operatorLedgerSheet || 'sales';
  const rows = (op.ledger.sheets?.[currentSheet]?.rows) || [];
  
  const total = rows.reduce((sum, row) => {
    return {
      orders: sum.orders + (row.orders || 0),
      revenue: sum.revenue + (row.revenue || 0),
      cost: sum.cost + (row.cost || 0)
    };
  }, { orders: 0, revenue: 0, cost: 0 });
  
  const maxRevenue = rows.length > 0 ? Math.max(...rows.map(r => r.revenue || 0)) : 0;
  
  return `
    <div class="operator-ledger-sheets">
      <div class="operator-ledger-tabs">
        ${sheets.map(s => `
          <button class="operator-ledger-tab ${currentSheet === s ? 'active' : ''}" data-sheet="${s}" onclick="switchLedgerSheet('${s}')">
            ${s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        `).join('')}
      </div>
      ${rows.length === 0 ? `
        <div class="operator-empty">
          <p>No entries in ${currentSheet} sheet.</p>
          <button class="btn btn-sm btn-primary" onclick="addLedgerRow('${currentSheet}')" style="margin-top:var(--spacing-sm)">Add first row</button>
        </div>
      ` : `
        <table class="ledger-table">
          <thead><tr><th>Period</th><th>Orders</th><th>Revenue</th><th>Cost</th><th>Margin</th><th></th></tr></thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td contenteditable="true" onblur="updateLedgerCell('${currentSheet}', ${row.id}, 'period', this.textContent)">${escapeHtml(row.period)}</td>
                <td contenteditable="true" onblur="updateLedgerCell('${currentSheet}', ${row.id}, 'orders', parseInt(this.textContent)||0)">${row.orders}</td>
                <td contenteditable="true" onblur="updateLedgerCell('${currentSheet}', ${row.id}, 'revenue', parseInt(this.textContent)||0)">${row.revenue}</td>
                <td contenteditable="true" onblur="updateLedgerCell('${currentSheet}', ${row.id}, 'cost', parseInt(this.textContent)||0)">${row.cost}</td>
                <td>${(row.revenue || 0) - (row.cost || 0)}</td>
                <td><button class="btn-icon" onclick="deleteLedgerRow('${currentSheet}', ${row.id})" aria-label="Delete" style="width:24px;height:24px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td>
              </tr>
            `).join('')}
            <tr class="ledger-totals">
              <td><strong>Totals</strong></td>
              <td>${total.orders}</td>
              <td>${total.revenue}</td>
              <td>${total.cost}</td>
              <td>${total.revenue - total.cost}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <div class="ledger-chart">
          ${rows.map(row => `<div class="ledger-bar" style="height:${maxRevenue > 0 ? Math.max(10, ((row.revenue || 0) / maxRevenue) * 100) : 10}%" title="${row.period}: $${row.revenue}"></div>`).join('')}
        </div>
        <button class="btn btn-sm btn-secondary" onclick="addLedgerRow('${currentSheet}')" style="margin-top:var(--spacing-sm)">Add row</button>
      `}
    </div>
  `;
}

function switchLedgerSheet(sheet) {
  operatorLedgerSheet = sheet;
  if (state.currentProject) renderOperatorView(state.currentProject);
}

function addLedgerRow(sheet = 'sales') {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  pushUndoSnapshot(state.currentProject);
  const rows = op.ledger.sheets[sheet].rows;
  const newId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1;
  rows.push({ id: newId, period: `Week ${rows.length + 1}`, orders: 0, revenue: 0, cost: 0 });
  saveState();
  renderOperatorView(state.currentProject);
}

function deleteLedgerRow(sheet, rowId) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  pushUndoSnapshot(state.currentProject);
  op.ledger.sheets[sheet].rows = op.ledger.sheets[sheet].rows.filter(r => r.id !== rowId);
  saveState();
  renderOperatorView(state.currentProject);
}

function updateLedgerCell(sheet, rowId, field, value) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const row = op.ledger.sheets[sheet].rows.find(r => r.id === rowId);
  if (row) {
    row[field] = value;
    saveState();
    renderOperatorView(state.currentProject);
  }
}

function renderPaymentsPlans(op) {
  const plans = op.payments.plans || [];
  
  return `
    <div class="operator-plans-grid">
      ${plans.map(plan => `
        <div class="operator-plan-card">
          <h4 class="operator-plan-name">${escapeHtml(plan.name)}</h4>
          <div class="operator-plan-price">$${plan.price}<span class="operator-plan-period">/mo</span></div>
          <ul class="operator-plan-features">
            ${(plan.features || []).map(f => `<li>${escapeHtml(f)}</li>`).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
    <div class="payments-config" style="margin-top:var(--spacing-md)">
      <div class="form-group">
        <label>Active plan</label>
        <input type="text" id="payment-plan" value="${escapeHtml(op.payments.plan)}" onchange="updatePayments('plan', this.value)">
      </div>
      <div class="form-group">
        <label>Price</label>
        <input type="number" id="payment-price" value="${op.payments.price}" onchange="updatePayments('price', parseInt(this.value)||0)">
      </div>
      <div class="form-group">
        <label>Currency</label>
        <select id="payment-currency" onchange="updatePayments('currency', this.value)">
          <option value="USD" ${op.payments.currency === 'USD' ? 'selected' : ''}>USD</option>
          <option value="EUR" ${op.payments.currency === 'EUR' ? 'selected' : ''}>EUR</option>
          <option value="GBP" ${op.payments.currency === 'GBP' ? 'selected' : ''}>GBP</option>
        </select>
      </div>
    </div>
    <div class="payments-export" style="margin-top:var(--spacing-md)">
      <h4>Stripe snippet</h4>
      <pre><code>const price = {
  id: 'price_${toKebabCase(op.payments.plan)}',
  unit_amount: ${op.payments.price * 100},
  currency: '${op.payments.currency.toLowerCase()}',
  product_data: { name: '${escapeHtml(state.currentProject?.name || 'Product')}' }
};</code></pre>
      <button class="btn btn-sm btn-secondary" onclick="copyPaymentsConfig()">Copy</button>
    </div>
    <p class="operator-note">Sweep takes no fee — you own the Stripe account</p>
  `;
}

function renderInsights(op) {
  const insights = op.insights || { visitors: 0, conversionRate: 0, orders: 0, revenue: 0, bestChannel: 'N/A' };
  const salesRows = op.ledger.sheets?.sales?.rows || [];
  const maxRev = salesRows.length ? Math.max(...salesRows.map(r => r.revenue || 0)) : 0;
  
  // Compute from ledger if insights are empty
  if (insights.revenue === 0 && salesRows.length > 0) {
    insights.revenue = salesRows.reduce((sum, r) => sum + (r.revenue || 0), 0);
    insights.orders = salesRows.reduce((sum, r) => sum + (r.orders || 0), 0);
    insights.conversionRate = insights.orders > 0 ? ((insights.orders / (insights.visitors || 1)) * 100).toFixed(1) : 0;
  }
  
  return `
    <div class="operator-insights-grid">
      <div class="operator-stat-tile">
        <span class="operator-stat-label">Visitors</span>
        <span class="operator-stat-value">${insights.visitors.toLocaleString()}</span>
      </div>
      <div class="operator-stat-tile">
        <span class="operator-stat-label">Conversion</span>
        <span class="operator-stat-value">${insights.conversionRate}%</span>
      </div>
      <div class="operator-stat-tile">
        <span class="operator-stat-label">Orders</span>
        <span class="operator-stat-value">${insights.orders}</span>
      </div>
      <div class="operator-stat-tile">
        <span class="operator-stat-label">Revenue</span>
        <span class="operator-stat-value">$${insights.revenue.toLocaleString()}</span>
      </div>
    </div>
    ${salesRows.length > 0 ? `
      <p class="operator-note" style="margin-top:var(--spacing-md);margin-bottom:var(--spacing-xs)">Revenue by period (from Sales ledger)</p>
      <div class="operator-chart">
        ${salesRows.map(r => `<div class="operator-chart-col"><div class="operator-chart-bar" style="height:${maxRev > 0 ? Math.max(8, ((r.revenue || 0) / maxRev) * 100) : 8}%" title="${escapeHtml(r.period)}: $${r.revenue || 0}"></div><span class="operator-chart-x">${escapeHtml(r.period)}</span></div>`).join('')}
      </div>
    ` : ''}
    <p class="operator-note" style="margin-top:var(--spacing-sm)">Best channel: <strong>${escapeHtml(insights.bestChannel)}</strong></p>
    <p class="operator-note" style="font-size:11px">Projection based on ledger data (local simulation — no network)</p>
  `;
}

function renderOperatorSidebar(op) {
  const container = document.getElementById('operator-sidebar');
  if (!container) return;
  
  container.innerHTML = `
    <div class="operator-card">
      <h3 class="operator-card-title">Run Log</h3>
      ${renderRunLogContent(op)}
    </div>
    <div class="operator-card">
      <h3 class="operator-card-title">Outbox</h3>
      ${renderOutboxSummary(op)}
    </div>
    <div class="operator-actions">
      <button class="btn btn-secondary btn-sm" onclick="exportOperatorBundle()">Export JSON</button>
      <button class="btn btn-secondary btn-sm" onclick="exportOperatorMarkdown()">Export MD</button>
    </div>
  `;
}

function renderRunLogContent(op) {
  if (op.runLog.length === 0) return '<div class="operator-empty">No actions yet</div>';
  return `<div class="run-log-list">${op.runLog.slice(-10).reverse().map(entry => `
    <div class="run-log-entry">
      <span class="run-log-action">${escapeHtml(entry.action)}</span>
      <span class="run-log-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
    </div>
  `).join('')}</div>`;
}

function renderOutboxSummary(op) {
  const pending = op.outbox.filter(a => a.status === 'pending').length;
  const approved = op.outbox.filter(a => a.status === 'approved').length;
  return `<div class="operator-outbox-summary"><div>Pending: <strong>${pending}</strong></div><div>Approved: <strong>${approved}</strong></div><button class="btn btn-sm btn-secondary" onclick="navigateTo('operator');switchOperatorTab('create')" style="margin-top:var(--spacing-sm);width:100%">View all</button></div>`;
}

function handleUndo() {
  if (!state.currentProject) return;
  if (undoLastChange(state.currentProject)) {
    addToRunLog(state.currentProject, 'undo', 'Restored previous state');
    saveState();
    renderOperatorView(state.currentProject);
    showToast('Undone last change');
  } else {
    showToast('Nothing to undo');
  }
}

function handleGlobalSearch(query) {
  globalSearchQuery = query;
  const resultsEl = document.getElementById('operator-search-results');
  if (!resultsEl || !state.currentProject) return;
  
  const op = ensureOperator(state.currentProject);
  const q = query.toLowerCase().trim();
  
  if (q.length < 2) {
    resultsEl.innerHTML = '<div class="operator-empty">Type 2+ characters to search</div>';
    return;
  }
  
  const matches = [];
  
  // Search outbox
  op.outbox.forEach(a => {
    const text = `${a.title} ${a.copy || ''} ${a.body || ''} ${a.subject || ''} ${a.positioning || ''}`.toLowerCase();
    if (text.includes(q)) {
      matches.push({ type: 'Outbox', title: a.title, preview: (a.copy || a.body || a.subject || '').substring(0, 100) });
    }
  });
  
  // Search chat
  op.chat.forEach(c => {
    if (c.text.toLowerCase().includes(q)) {
      matches.push({ type: 'Chat', title: `${c.role === 'user' ? 'You' : 'Otto'}`, preview: c.text.substring(0, 100) });
    }
  });
  
  // Search research/deck
  if (op.outbox) {
    op.outbox.filter(a => a.type === 'research' || a.type === 'deck').forEach(a => {
      if (a.title.toLowerCase().includes(q)) {
        matches.push({ type: a.type === 'research' ? 'Research' : 'Deck', title: a.title, preview: (a.positioning || '').substring(0, 100) });
      }
    });
  }
  
  if (matches.length === 0) {
    resultsEl.innerHTML = '<div class="operator-empty">No matches found</div>';
  } else {
    resultsEl.innerHTML = `<div class="operator-search-results">${matches.slice(0, 20).map(m => `
      <div class="operator-search-result">
        <span class="operator-search-type">${m.type}</span>
        <span class="operator-search-title">${escapeHtml(m.title)}</span>
        <span class="operator-search-preview">${escapeHtml(m.preview)}${m.preview.length >= 100 ? '...' : ''}</span>
      </div>
    `).join('')}</div>`;
  }
}

function attachSearchHandlers() {
  // Input handler is inline oninput
}

function attachDataHandlers() {
  // Handlers are inline onclick
}

function copyWorkspaceJson() {
  if (!state.currentProject) return;
  const json = JSON.stringify(state.currentProject, null, 2);
  navigator.clipboard.writeText(json).then(() => showToast('Workspace JSON copied'));
}

function wipeOperatorData() {
  if (!state.currentProject) return;
  if (!confirm('This will reset all Operator data (chat, outbox, ledger, inbox, schedule). Your project brief will remain. Continue?')) return;
  
  const op = ensureOperator(state.currentProject);
  op.chat = [];
  op.outbox = [];
  op.runLog = [];
  op.undoStack = [];
  op.schedule = [];
  op.inbox = [];
  op.ledger = { sheets: { sales: { rows: [] }, stock: { rows: [] }, costs: { rows: [] } } };
  
  saveState();
  renderOperatorView(state.currentProject);
  showToast('Operator data wiped');
}

function attachLedgerSheetHandlers() {
  // Tab handlers are inline onclick
}

function attachPaymentsHandlers() {
  // Handlers are inline onchange
}

// === END NEW HELPER FUNCTIONS ===

function renderBrandKit(op) {
  const container = document.getElementById('operator-brand-kit');
  if (!container) return;
  
  container.innerHTML = `
    <div class="operator-card">
      <h3 class="operator-card-title">Brand Kit</h3>
      <div class="brand-kit-content">
        <div class="brand-logo">${op.brand.logoSvg}</div>
        <div class="brand-palette">
          ${op.brand.palette.map(c => `<div class="brand-swatch" style="background:${c}" title="${c}" onclick="navigator.clipboard.writeText('${c}');showToast('Copied ${c}')"></div>`).join('')}
        </div>
        <div class="brand-fonts">
          <div><strong>Heading:</strong> <span style="font-family:${op.brand.fonts.heading}">${op.brand.fonts.heading.split(',')[0]}</span></div>
          <div><strong>Body:</strong> <span style="font-family:${op.brand.fonts.body}">${op.brand.fonts.body.split(',')[0]}</span></div>
        </div>
      </div>
    </div>
  `;
}

function renderRunLog(op) {
  const container = document.getElementById('operator-run-log');
  if (!container) return;
  
  if (op.runLog.length === 0) {
    container.innerHTML = '<div class="operator-empty">No actions yet. Type a command or click a quick action.</div>';
    return;
  }
  
  container.innerHTML = `<div class="run-log-list">${op.runLog.slice(-10).reverse().map(entry => `
    <div class="run-log-entry">
      <span class="run-log-action">${escapeHtml(entry.action)}</span>
      <span class="run-log-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
    </div>
  `).join('')}</div>`;
}

function renderOutbox(op) {
  const container = document.getElementById('operator-outbox');
  if (!container) return;
  
  const pending = op.outbox.filter(a => a.status === 'pending');
  const approved = op.outbox.filter(a => a.status === 'approved');
  const rejected = op.outbox.filter(a => a.status === 'rejected');
  
  const getItemsForTab = (status) => {
    if (status === 'pending') return pending;
    if (status === 'approved') return approved;
    if (status === 'rejected') return rejected;
    return [];
  };
  
  const items = getItemsForTab(operatorOutboxTab);
  const emptyMessages = {
    pending: 'No pending artifacts',
    approved: 'No approved artifacts',
    rejected: 'No rejected artifacts'
  };
  
  container.innerHTML = `
    <div class="outbox-tabs">
      <button class="outbox-tab ${operatorOutboxTab === 'pending' ? 'active' : ''}" data-status="pending">Pending (${pending.length})</button>
      <button class="outbox-tab ${operatorOutboxTab === 'approved' ? 'active' : ''}" data-status="approved">Approved (${approved.length})</button>
      <button class="outbox-tab ${operatorOutboxTab === 'rejected' ? 'active' : ''}" data-status="rejected">Rejected (${rejected.length})</button>
    </div>
    <div class="outbox-list" id="outbox-list-${operatorOutboxTab}">
      ${items.length === 0 ? `<div class="operator-empty">${emptyMessages[operatorOutboxTab]}</div>` : items.map(artifact => `
        <div class="outbox-item">
          <div class="outbox-item-header">
            <span class="outbox-type">${artifact.type}</span>
            <span class="outbox-title">${escapeHtml(artifact.title)}</span>
            <span class="outbox-date">${new Date(artifact.createdAt).toLocaleDateString()}</span>
          </div>
          <div class="outbox-item-actions">
            ${operatorOutboxTab === 'pending' ? `
              <button class="btn btn-sm btn-primary" onclick="approveArtifact('${artifact.id}')">Approve</button>
              <button class="btn btn-sm btn-secondary" onclick="rejectArtifact('${artifact.id}')">Reject</button>
            ` : `<span class="outbox-status" style="font-size:11px;color:var(--color-muted)">${artifact.status}</span>`}
            <button class="btn btn-sm btn-text" onclick="viewArtifact('${artifact.id}')">View</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  container.querySelectorAll('.outbox-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      operatorOutboxTab = tab.dataset.status;
      renderOutbox(op);
    });
  });
}

function approveArtifact(artifactId) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const artifact = op.outbox.find(a => a.id === artifactId);
  if (artifact) {
    pushUndoSnapshot(state.currentProject);
    artifact.status = 'approved';
    saveState();
    renderOutbox(op);
    showToast('Artifact approved (local only - not sent)');
  }
}

function rejectArtifact(artifactId) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const artifact = op.outbox.find(a => a.id === artifactId);
  if (artifact) {
    pushUndoSnapshot(state.currentProject);
    artifact.status = 'rejected';
    saveState();
    renderOutbox(op);
    showToast('Artifact rejected');
  }
}

function viewArtifact(artifactId) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const artifact = op.outbox.find(a => a.id === artifactId);
  if (!artifact) return;
  
  // Create modal dynamically
  const modalHtml = `
    <div class="operator-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title-${artifact.id}" onclick="if(event.target===this)closeArtifactModal()">
      <div class="operator-modal">
        <div class="operator-modal-header">
          <h3 class="operator-modal-title" id="modal-title-${artifact.id}">${escapeHtml(artifact.title)}</h3>
          <div class="operator-modal-actions">
            <button class="btn btn-sm btn-secondary" onclick="copyArtifactContent('${artifact.id}')">Copy</button>
            <button class="btn btn-sm btn-secondary" onclick="downloadArtifact('${artifact.id}')">Download</button>
            <button class="operator-modal-close" onclick="closeArtifactModal()" aria-label="Close">&times;</button>
          </div>
        </div>
        <div class="operator-modal-body" id="modal-body-${artifact.id}">
          ${renderArtifactDetail(artifact)}
        </div>
      </div>
    </div>
  `;
  
  // Remove any existing modal first
  const existing = document.querySelector('.operator-modal-backdrop');
  if (existing) existing.remove();
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  document.body.style.overflow = 'hidden';
  
  // Handle Escape key
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeArtifactModal();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
}

function renderArtifactDetail(artifact) {
  switch (artifact.type) {
    case 'post':
      return `
        <div style="text-align:center">${artifact.pictureSvg || ''}</div>
        <h4>Copy</h4>
        <pre>${escapeHtml(artifact.copy || '')}</pre>
      `;
    case 'email':
      return `
        <h4>Subject</h4>
        <pre>${escapeHtml(artifact.subject || '')}</pre>
        <h4>Body</h4>
        <pre>${escapeHtml(artifact.body || '')}</pre>
      `;
    case 'outreach':
      return `
        <h4>Target List</h4>
        ${artifact.targets ? artifact.targets.map(t => `
          <div class="target-card">
            <strong>${escapeHtml(t.role)}</strong> via ${escapeHtml(t.channel)}<br>
            <em>Pain: ${escapeHtml(t.pain)}</em><br>
            <pre style="margin-top:var(--spacing-xs)">${escapeHtml(t.message)}</pre>
          </div>
        `).join('') : '<p>No targets</p>'}
      `;
    case 'research':
      return `
        <h4>Positioning</h4>
        <p>${escapeHtml(artifact.positioning || '')}</p>
        <h4>Competitors</h4>
        <table><thead><tr><th>Name</th><th>Strength</th><th>Weakness</th></tr></thead><tbody>
          ${(artifact.competitors || []).map(c => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.strength)}</td><td>${escapeHtml(c.weakness)}</td></tr>`).join('')}
        </tbody></table>
        <h4>Pricing Benchmarks</h4>
        <p>Low: ${artifact.pricingBenchmarks?.low || 'N/A'} | Mid: ${artifact.pricingBenchmarks?.mid || 'N/A'} | High: ${artifact.pricingBenchmarks?.high || 'N/A'}</p>
        <h4>Channels</h4>
        <ul>${(artifact.channels || []).map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
        <h4>Risks</h4>
        <ul>${(artifact.risks || []).map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
        <h4>Actions</h4>
        <ul>${(artifact.actions || []).map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
        <p class="operator-note">${escapeHtml(artifact.sourcesNote || '')}</p>
      `;
    case 'deck':
      return `
        ${(artifact.slides || []).map((slide, i) => `
          <div class="slide-card">
            <h4>Slide ${i + 1}: ${escapeHtml(slide.title || '')}</h4>
            ${slide.subtitle ? `<p style="font-style:italic">${escapeHtml(slide.subtitle)}</p>` : ''}
            ${slide.content ? `<p>${escapeHtml(slide.content)}</p>` : ''}
            ${slide.notes ? `<p class="notes"><strong>Notes:</strong> ${escapeHtml(slide.notes)}</p>` : ''}
          </div>
        `).join('')}
      `;
    case 'site':
      return `
        <p>Generated site files:</p>
        ${Object.entries(artifact.files || {}).map(([filename, content]) => `
          <div class="file-block">
            <h4>${escapeHtml(filename)} <button class="btn btn-sm btn-text" onclick="copyFileText(this, ${JSON.stringify(content).replace(/"/g, '&quot;')})">Copy</button></h4>
            <pre>${escapeHtml(content)}</pre>
          </div>
        `).join('')}
      `;
    case 'brand':
      return `
        <div style="text-align:center;margin-bottom:var(--spacing-md)">${artifact.logoSvg || ''}</div>
        <h4>Palette</h4>
        <div style="display:flex;gap:var(--spacing-xs);margin:var(--spacing-sm) 0">
          ${(artifact.palette || []).map(c => `<div style="width:40px;height:40px;background:${c};border:1px solid var(--color-border);border-radius:4px" title="${c}"></div>`).join('')}
        </div>
        <h4>Fonts</h4>
        <p>Heading: ${escapeHtml(artifact.fonts?.heading || '')}</p>
        <p>Body: ${escapeHtml(artifact.fonts?.body || '')}</p>
      `;
    default:
      return `<pre>${escapeHtml(JSON.stringify(artifact, null, 2))}</pre>`;
  }
}

function closeArtifactModal() {
  const modal = document.querySelector('.operator-modal-backdrop');
  if (modal) {
    modal.remove();
    document.body.style.overflow = '';
  }
}

function copyArtifactContent(artifactId) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const artifact = op.outbox.find(a => a.id === artifactId);
  if (!artifact) return;
  
  const content = artifact.copy || artifact.body || artifact.subject || JSON.stringify(artifact, null, 2);
  navigator.clipboard.writeText(content).then(() => showToast('Content copied'));
}

function downloadArtifact(artifactId) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const artifact = op.outbox.find(a => a.id === artifactId);
  if (!artifact) return;
  
  const content = artifact.copy || artifact.body || artifact.subject || JSON.stringify(artifact, null, 2);
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${toKebabCase(artifact.title || 'artifact')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Artifact downloaded');
}

function copyFileText(btn, content) {
  navigator.clipboard.writeText(content).then(() => showToast('File content copied'));
}

function renderLedger(op) {
  const container = document.getElementById('operator-ledger');
  if (!container) return;
  
  const totalRevenue = op.ledger.rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalCost = op.ledger.rows.reduce((sum, row) => sum + row.cost, 0);
  const totalMargin = totalRevenue - totalCost;
  const marginPct = totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 100) : 0;
  const maxRevenue = op.ledger.rows.length > 0 ? Math.max(...op.ledger.rows.map(r => r.revenue)) : 0;
  
  const emptyState = op.ledger.rows.length === 0;
  
  container.innerHTML = `
    <div class="operator-card">
      <h3 class="operator-card-title">Ledger</h3>
      ${emptyState ? `
        <div class="operator-empty">
          <p>No ledger entries yet.</p>
          <button class="btn btn-sm btn-primary" onclick="addLedgerRow()" style="margin-top:var(--spacing-sm)">Add first row</button>
        </div>
      ` : `
        <table class="ledger-table">
          <thead>
            <tr><th>Period</th><th>Orders</th><th>Revenue</th><th>Cost</th><th>Margin</th><th></th></tr>
          </thead>
          <tbody>
            ${op.ledger.rows.map(row => `
              <tr>
                <td contenteditable="true" onblur="updateLedgerCell(${row.id}, 'period', this.textContent)">${escapeHtml(row.period)}</td>
                <td contenteditable="true" onblur="updateLedgerCell(${row.id}, 'orders', parseInt(this.textContent)||0)">${row.orders}</td>
                <td contenteditable="true" onblur="updateLedgerCell(${row.id}, 'revenue', parseInt(this.textContent)||0)">${row.revenue}</td>
                <td contenteditable="true" onblur="updateLedgerCell(${row.id}, 'cost', parseInt(this.textContent)||0)">${row.cost}</td>
                <td>${row.revenue - row.cost}</td>
                <td><button class="btn-icon" onclick="deleteLedgerRow(${row.id})" aria-label="Delete row" style="width:24px;height:24px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td>
              </tr>
            `).join('')}
            <tr class="ledger-totals">
              <td><strong>Totals</strong></td>
              <td>${op.ledger.rows.reduce((s,r) => s + r.orders, 0)}</td>
              <td>${totalRevenue}</td>
              <td>${totalCost}</td>
              <td>${totalMargin} (${marginPct}%)</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <div class="ledger-chart">
          ${op.ledger.rows.map(row => `<div class="ledger-bar" style="height:${maxRevenue > 0 ? Math.max(10, (row.revenue / maxRevenue) * 100) : 10}%" title="${row.period}: ${row.revenue}"></div>`).join('')}
        </div>
        <button class="btn btn-sm btn-secondary" onclick="addLedgerRow()" style="margin-top:var(--spacing-sm)">Add row</button>
      `}
    </div>
  `;
}

function renderIntegrations(op) {
  const container = document.getElementById('operator-integrations');
  if (!container) return;
  
  const integrations = [
    { key: 'gmail', label: 'Gmail', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>' },
    { key: 'calendar', label: 'Calendar', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' },
    { key: 'slack', label: 'Slack', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M12 8v8"/></svg>' },
    { key: 'notion', label: 'Notion', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
    { key: 'hubspot', label: 'HubSpot', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>' },
    { key: 'stripe', label: 'Stripe', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>' },
    { key: 'sheets', label: 'Sheets', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>' },
    { key: 'twitter', label: 'X / Twitter', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m15 3 6 6M3 21 21 3M9 21l12-12"/></svg>' },
    { key: 'linkedin', label: 'LinkedIn', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 11v5M8 8v.01M12 16v-5M16 16v-5"/></svg>' },
    { key: 'instagram', label: 'Instagram', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="18" cy="6" r="1" fill="currentColor"/></svg>' }
  ];
  
  container.innerHTML = `
    <div class="operator-card">
      <h3 class="operator-card-title">Integrations</h3>
      <p class="operator-note">Local simulation — no network. Toggles are stored locally.</p>
      <div class="integrations-grid">
        ${integrations.map(int => `
          <div class="integration-tile ${op.integrations[int.key] ? 'connected' : ''}">
            <span class="integration-icon">${int.icon}</span>
            <span class="integration-label">${int.label}</span>
            <label class="toggle-switch">
              <input type="checkbox" ${op.integrations[int.key] ? 'checked' : ''} onchange="toggleIntegration('${int.key}')">
              <span class="toggle-slider"></span>
            </label>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function toggleIntegration(key) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  op.integrations[key] = !op.integrations[key];
  saveState();
  renderIntegrations(op);
  showToast(`${key} integration ${op.integrations[key] ? 'enabled' : 'disabled'} (local)`);
}

function renderPayments(op) {
  const container = document.getElementById('operator-payments');
  if (!container) return;
  
  container.innerHTML = `
    <div class="operator-card">
      <h3 class="operator-card-title">Payments</h3>
      <div class="payments-config">
        <div class="form-group">
          <label>Plan name</label>
          <input type="text" id="payment-plan" value="${escapeHtml(op.payments.plan)}" onchange="updatePayments('plan', this.value)">
        </div>
        <div class="form-group">
          <label>Price</label>
          <input type="number" id="payment-price" value="${op.payments.price}" onchange="updatePayments('price', parseInt(this.value)||0)">
        </div>
        <div class="form-group">
          <label>Currency</label>
          <select id="payment-currency" onchange="updatePayments('currency', this.value)">
            <option value="USD" ${op.payments.currency === 'USD' ? 'selected' : ''}>USD</option>
            <option value="EUR" ${op.payments.currency === 'EUR' ? 'selected' : ''}>EUR</option>
            <option value="GBP" ${op.payments.currency === 'GBP' ? 'selected' : ''}>GBP</option>
          </select>
        </div>
      </div>
      <div class="payments-export">
        <h4>Stripe-style snippet</h4>
        <pre><code>const price = {
  id: 'price_${toKebabCase(op.payments.plan)}',
  unit_amount: ${op.payments.price * 100},
  currency: '${op.payments.currency.toLowerCase()}',
  product_data: { name: '${escapeHtml(state.currentProject?.name || 'Product')}' }
};</code></pre>
        <button class="btn btn-sm btn-secondary" onclick="copyPaymentsConfig()">Copy config</button>
      </div>
      <p class="operator-note">Sweep: no fee, you own the Stripe account</p>
    </div>
  `;
}

function updatePayments(field, value) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  op.payments[field] = value;
  saveState();
  renderPayments(op);
}

function copyPaymentsConfig() {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const config = `const price = {
  id: 'price_${toKebabCase(op.payments.plan)}',
  unit_amount: ${op.payments.price * 100},
  currency: '${op.payments.currency.toLowerCase()}',
  product_data: { name: '${state.currentProject.name}' }
};`;
  navigator.clipboard.writeText(config).then(() => showToast('Config copied'));
}

function toggleAutopilot() {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  op.autopilot = !op.autopilot;
  saveState();
  showToast(`Autopilot ${op.autopilot ? 'ON' : 'OFF'} (still approval-first)`);
}

function quickCommand(cmd) {
  const input = document.getElementById('operator-command-input');
  if (input) {
    input.value = cmd;
    handleOperatorCommand();
  }
}

function updateModePowerButtons() {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === op.runMode);
  });
  document.querySelectorAll('[data-power]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.power === op.power);
  });
}

function handleOperatorCommand() {
  if (!state.currentProject) return;
  const input = document.getElementById('operator-command-input');
  if (!input) return;
  
  const command = input.value.trim().toLowerCase();
  if (!command) return;
  
  const op = ensureOperator(state.currentProject);
  let artifact = null;
  let creditsCost = 5;
  
  // Route by keywords
  if (command.includes('brand')) {
    artifact = generateBrandKit(state.currentProject);
    creditsCost = 3;
  } else if (command.includes('post') || command.includes('twitter') || command.includes('linkedin') || command.includes('instagram')) {
    const platform = command.includes('twitter') || command.includes('x') ? 'twitter' : command.includes('linkedin') ? 'linkedin' : 'instagram';
    artifact = generateSocialPosts(state.currentProject, platform);
    creditsCost = 2;
  } else if (command.includes('email')) {
    artifact = generateEmailDraft(state.currentProject);
    creditsCost = 2;
  } else if (command.includes('outreach') || command.includes('customer') || command.includes('find')) {
    artifact = generateOutreach(state.currentProject);
    creditsCost = 5;
  } else if (command.includes('research') || command.includes('market')) {
    artifact = generateResearch(state.currentProject);
    creditsCost = 5;
  } else if (command.includes('deck') || command.includes('pitch') || command.includes('slide')) {
    artifact = generateDeck(state.currentProject);
    creditsCost = 8;
  } else if (command.includes('site') || command.includes('landing') || command.includes('web')) {
    artifact = generateSite(state.currentProject);
    creditsCost = 10;
  } else if (command.includes('newsletter')) {
    artifact = generateNewsletter(state.currentProject);
    creditsCost = 4;
  } else if (command.includes('sheet') || command.includes('ledger')) {
    showToast('Ledger is already visible below');
    input.value = '';
    return;
  } else {
    showToast('Command not recognized. Try: brand, post, email, outreach, research, deck, site');
    return;
  }
  
  if (getAvailableCredits(state.currentProject) < creditsCost) {
    showToast(`Insufficient credits. Need ${creditsCost}, have ${getAvailableCredits(state.currentProject)}`);
    return;
  }
  pushUndoSnapshot(state.currentProject);
  spendCredits(state.currentProject, creditsCost);

  addToOutbox(state.currentProject, artifact);
  addToRunLog(state.currentProject, command, `Generated ${artifact.type} (-${creditsCost} credits)`);
  saveState();
  renderOperatorView(state.currentProject);
  input.value = '';
  showToast(`Generated ${artifact.type} → Outbox (-${creditsCost} credits)`);
}

function runAutopilotPass() {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const powerCfg = POWER_PRESETS[op.power] || POWER_PRESETS.steady;
  const creditsNeeded = powerCfg.credits;
  
  if (getAvailableCredits(state.currentProject) < creditsNeeded) {
    showToast(`Insufficient credits. Need ${creditsNeeded}, have ${getAvailableCredits(state.currentProject)}`);
    return;
  }
  
  // Push undo snapshot before this run
  pushUndoSnapshot(state.currentProject);
  
  // Capture which run index this is so we can undo to it
  const runIndexBefore = op.runs.length;
  const undoSnapshotIndex = op.undoStack.length - 1;
  
  spendCredits(state.currentProject, creditsNeeded);

  // Generate artifacts based on power level
  const generators = [
    () => generateBrandKit(state.currentProject),
    () => generateSocialPosts(state.currentProject, 'twitter'),
    () => generateSocialPosts(state.currentProject, 'linkedin'),
    () => generateSocialPosts(state.currentProject, 'instagram'),
    () => generateEmailDraft(state.currentProject),
    () => generateOutreach(state.currentProject),
    () => generateResearch(state.currentProject),
    () => generateDeck(state.currentProject),
    () => generateSite(state.currentProject),
    () => generateNewsletter(state.currentProject),
    () => generateSocialPosts(state.currentProject, 'linkedin'),
    () => generateEmailDraft(state.currentProject),
    () => generateResearch(state.currentProject),
    () => generateOutreach(state.currentProject),
    () => generateBrandKit(state.currentProject),
    () => generateNewsletter(state.currentProject)
  ];
  
  const artifacts = [];
  for (let i = 0; i < powerCfg.artifacts && i < generators.length; i++) {
    const art = generators[i]();
    if (op.runMode === 'auto') {
      art.status = 'approved';
    }
    addToOutbox(state.currentProject, art);
    addToRunLog(state.currentProject, `run: ${art.type}`, 'Generated');
    artifacts.push(art);
  }
  
  // Record run history
  op.runs.unshift({
    at: new Date().toISOString(),
    mode: op.runMode,
    power: op.power,
    artifacts: artifacts.length,
    credits: creditsNeeded,
    undoSnapshotIndex: undoSnapshotIndex,
    artifactIds: artifacts.map(a => a.id)
  });
  if (op.runs.length > 20) op.runs.pop();
  
  saveState();
  renderOperatorView(state.currentProject);
  showToast(`Run complete: ${artifacts.length} artifacts (${powerCfg.label}, ${op.runMode === 'auto' ? 'auto-approved' : 'pending approval'})`);
}

function undoRun(runIndex) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const run = op.runs[runIndex];
  if (!run) return;
  
  // Remove artifacts generated by this run
  if (run.artifactIds && run.artifactIds.length > 0) {
    op.outbox = op.outbox.filter(a => !run.artifactIds.includes(a.id));
  }
  // Refund credits
  op.credits.spent = Math.max(0, op.credits.spent - run.credits);
  // Remove this run from history
  op.runs.splice(runIndex, 1);
  // Remove corresponding run log entries (heuristic: those with 'run:' prefix)
  saveState();
  renderOperatorView(state.currentProject);
  showToast('Run undone');
}

function setRunMode(mode) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  op.runMode = mode;
  saveState();
  renderOperatorView(state.currentProject);
}

function setPower(power) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  op.power = power;
  saveState();
  renderOperatorView(state.currentProject);
}

function exportOperatorBundle() {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  
  const bundle = {
    project: state.currentProject,
    operator: op,
    exportedAt: new Date().toISOString()
  };
  
  const dataStr = JSON.stringify(bundle, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${toKebabCase(state.currentProject.name)}-operator-bundle.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Operator bundle exported');
}

function exportOperatorMarkdown() {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  
  let md = `# ${state.currentProject.name} — Operator Export\n\n`;
  md += `Exported: ${new Date().toISOString()}\n\n`;
  
  // Brand
  md += `## Brand\n\nPalette: ${op.brand.palette.join(', ')}\n\n`;
  
  // Outbox
  md += `## Outbox\n\n`;
  op.outbox.forEach((artifact, i) => {
    md += `### ${i + 1}. ${artifact.title} [${artifact.status}]\n\n`;
    if (artifact.copy) md += `${artifact.copy}\n\n`;
    if (artifact.body) md += `${artifact.body}\n\n`;
    if (artifact.subject) md += `Subject: ${artifact.subject}\n\n`;
  });
  
  // Ledger
  md += `## Ledger\n\n| Period | Orders | Revenue | Cost | Margin |\n|---|---|---|---|---|\n`;
  op.ledger.rows.forEach(row => {
    md += `| ${row.period} | ${row.orders} | ${row.revenue} | ${row.cost} | ${row.revenue - row.cost} |\n`;
  });
  
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${toKebabCase(state.currentProject.name)}-operator.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Markdown bundle exported');
}

init();

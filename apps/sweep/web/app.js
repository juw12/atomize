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
  autopilot: false,
  runLog: [
    { action: 'brand', result: 'Generated brand kit (-3 credits)', timestamp: new Date(Date.now() - 86400000).toISOString() },
    { action: 'linkedin post', result: 'Generated post (-2 credits)', timestamp: new Date(Date.now() - 80000000).toISOString() },
    { action: 'email', result: 'Generated email draft (-2 credits)', timestamp: new Date(Date.now() - 75000000).toISOString() },
    { action: 'research', result: 'Generated market snapshot (-5 credits)', timestamp: new Date(Date.now() - 70000000).toISOString() }
  ],
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
  payments: { price: 29, currency: 'USD', plan: 'Pro' },
  ledger: {
    rows: [
      { id: 1, period: 'Week 1', orders: 12, revenue: 348, cost: 120 },
      { id: 2, period: 'Week 2', orders: 18, revenue: 522, cost: 180 },
      { id: 3, period: 'Week 3', orders: 25, revenue: 725, cost: 250 },
      { id: 4, period: 'Week 4', orders: 31, revenue: 899, cost: 310 }
    ]
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
      project.operator.ledger.rows = [];
      project.operator.outbox = [];
      project.operator.runLog = [];
    }
  } else {
    // Demo project already has populated data, just ensure credit topup
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
  
  return {
    type: 'site',
    title: 'Landing Site',
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${appName}</title>
<style>
:root{--accent:${brand.palette[0]};--paper:${brand.palette[4]};--ink:${brand.palette[3]}}
body{font-family:${brand.fonts.body};background:${brand.palette[4]};color:var(--ink);margin:0;line-height:1.6}
.masthead{padding:48px;text-align:center;border-bottom:3px solid var(--accent)}
.masthead h1{font-family:${brand.fonts.heading};color:var(--accent);letter-spacing:0.1em;text-transform:uppercase;margin:0}
.hero{max-width:720px;margin:60px auto;padding:0 24px;text-align:center}
.hero h2{font-size:28px;margin-bottom:16px}
.cta{display:inline-block;background:var(--accent);color:white;padding:14px 32px;text-decoration:none;border-radius:4px;margin-top:24px;font-weight:600}
.features{max-width:900px;margin:60px auto;padding:0 24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:32px}
.feature{padding:24px;background:var(--paper);border:1px solid #d4cfc7;border-radius:4px}
footer{text-align:center;padding:32px;color:#6b6b6b;font-size:14px}
</style>
</head>
<body>
<header class="masthead">
  <h1>${appName.toUpperCase()}</h1>
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
      'styles.css': `/* ${appName} brand styles */\n:root{--accent:${brand.palette[0]}}`
    }
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
  const emptyState = document.getElementById('operator-empty-state');
  const cockpit = document.getElementById('operator-cockpit');
  
  if (!state.currentProject) {
    if (emptyState) emptyState.style.display = 'block';
    if (cockpit) cockpit.style.display = 'none';
  } else {
    if (emptyState) emptyState.style.display = 'none';
    if (cockpit) cockpit.style.display = 'block';
    renderOperatorView(state.currentProject);
  }
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

function renderOperatorView(project) {
  const op = ensureOperator(project);
  const credits = getAvailableCredits(project);
  
  // Update credits display
  const creditsEl = document.getElementById('operator-credits');
  if (creditsEl) creditsEl.textContent = `${credits} credits`;
  
  // Update autopilot toggle
  const autopilotToggle = document.getElementById('operator-autopilot');
  if (autopilotToggle) autopilotToggle.checked = op.autopilot;
  
  // Render brand kit
  renderBrandKit(op);
  
  // Render run log
  renderRunLog(op);
  
  // Render outbox
  renderOutbox(op);
  
  // Render ledger
  renderLedger(op);
  
  // Render integrations
  renderIntegrations(op);
  
  // Render payments
  renderPayments(op);
}

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

function addLedgerRow() {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const newId = op.ledger.rows.length > 0 ? Math.max(...op.ledger.rows.map(r => r.id)) + 1 : 1;
  op.ledger.rows.push({ id: newId, period: `Week ${op.ledger.rows.length + 1}`, orders: 0, revenue: 0, cost: 0 });
  saveState();
  renderLedger(op);
}

function deleteLedgerRow(rowId) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  op.ledger.rows = op.ledger.rows.filter(r => r.id !== rowId);
  saveState();
  renderLedger(op);
}

function updateLedgerCell(rowId, field, value) {
  if (!state.currentProject) return;
  const op = ensureOperator(state.currentProject);
  const row = op.ledger.rows.find(r => r.id === rowId);
  if (row) {
    row[field] = value;
    saveState();
    renderLedger(op);
  }
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
  } else if (command.includes('sheet') || command.includes('ledger')) {
    showToast('Ledger is already visible below');
    input.value = '';
    return;
  } else {
    showToast('Command not recognized. Try: brand, post, email, outreach, research, deck, site');
    return;
  }
  
  if (!spendCredits(state.currentProject, creditsCost)) {
    showToast(`Insufficient credits. Need ${creditsCost}, have ${getAvailableCredits(state.currentProject)}`);
    return;
  }
  
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
  const creditsNeeded = 25;
  
  if (!spendCredits(state.currentProject, creditsNeeded)) {
    showToast(`Insufficient credits for autopilot pass. Need ${creditsNeeded}`);
    return;
  }
  
  // Generate batch
  const artifacts = [
    generateBrandKit(state.currentProject),
    generateSocialPosts(state.currentProject, 'twitter'),
    generateSocialPosts(state.currentProject, 'linkedin'),
    generateEmailDraft(state.currentProject),
    generateOutreach(state.currentProject),
    generateResearch(state.currentProject)
  ];
  
  artifacts.forEach(artifact => {
    if (op.autopilot) {
      artifact.status = 'approved';
    }
    addToOutbox(state.currentProject, artifact);
    addToRunLog(state.currentProject, `autopilot: ${artifact.type}`, 'Generated');
  });
  
  saveState();
  renderOperatorView(state.currentProject);
  showToast(`Autopilot pass complete: ${artifacts.length} artifacts generated (-${creditsNeeded} credits)`);
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

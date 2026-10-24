/**
 * Airiz Motor Test Console — Application
 * Dependency-free browser app for AIRIZ device testing
 */

(function() {
  'use strict';

  // ========================================================================
  // STATE
  // ========================================================================
  
  let deferredPrompt = null;
  
  const state = {
    // Serial
    port: null,
    reader: null,
    writer: null,
    readLoopActive: false,
    baudRate: 115200,
    connected: false,
    demoMode: false,
    demoBuffer: '',
    
    // Console
    consoleLines: [],
    autoscroll: true,
    
    // Macro runner
    macroRunning: false,
    macroPaused: false,
    macroStop: false,
    macroRepeatCount: 0,
    macroCurrentStep: -1,
    currentMacro: null,
    currentMacroParams: {},
    currentSteps: [],
    
    // User macros
    userMacros: [],

    audioAutoSave: true,
    capture: { active: false, chunks: [], tail: '', sentinel: '', done: false, resolve: null }
  };

  // ========================================================================
  // DOM ELEMENTS
  // ========================================================================
  
  const elements = {};
  
  function cacheElements() {
    // Header
    elements.fwVersion = document.getElementById('fw-version');
    elements.dataSource = document.getElementById('data-source');
    elements.themeToggle = document.getElementById('theme-toggle');
    elements.themeLabel = document.getElementById('theme-label');
    elements.themeColorMeta = document.getElementById('theme-color-meta');
    elements.btnInstallApp = document.getElementById('btn-install-app');
    
    // Install gate
    elements.installGate = document.getElementById('install-gate');
    elements.btnGateInstall = document.getElementById('btn-gate-install');
    elements.btnGateSkip = document.getElementById('btn-gate-skip');
    elements.installGateDesc = document.getElementById('install-gate-desc');
    
    // Tab bar
    elements.tabConsole = document.getElementById('tab-console');
    elements.tabCamera = document.getElementById('tab-camera');
    elements.tabSfx = document.getElementById('tab-sfx');
    elements.viewConsole = document.getElementById('view-console');
    elements.viewCamera = document.getElementById('view-camera');
    elements.viewSfx = document.getElementById('view-sfx');
    
    // Sound FX panel
    elements.sfxSearch = document.getElementById('sfx-search');
    elements.sfxChips = document.getElementById('sfx-chips');
    elements.sfxGrid = document.getElementById('sfx-grid');
    elements.sfxStatus = document.getElementById('sfx-status');
    elements.sfxVolume = document.getElementById('sfx-volume');
    elements.btnSfxStop = document.getElementById('btn-sfx-stop');
    elements.btnSfxAddFile = document.getElementById('btn-sfx-add-file');
    elements.sfxFileInput = document.getElementById('sfx-file-input');
    
    // Status bar
    elements.btnConnect = document.getElementById('btn-connect');
    elements.btnDisconnect = document.getElementById('btn-disconnect');
    elements.baudSelect = document.getElementById('baud-select');
    elements.btnDemo = document.getElementById('btn-demo');
    elements.connectionStatus = document.getElementById('connection-status');
    
    // Command library
    elements.commandSearch = document.getElementById('command-search');
    elements.commandList = document.getElementById('command-list');
    
    // Console
    elements.consoleOutput = document.getElementById('console-output');
    elements.btnClear = document.getElementById('btn-clear');
    elements.btnSaveLog = document.getElementById('btn-save-log');
    elements.chkAutoscroll = document.getElementById('chk-autoscroll');
    elements.rawCommand = document.getElementById('raw-command');
    elements.chkAudioAutosave = document.getElementById('chk-audio-autosave');
    elements.audioAutosaveStatus = document.getElementById('audio-autosave-status');
    
    // Macro panel
    elements.macroSelect = document.getElementById('macro-select');
    elements.macroDesc = document.getElementById('macro-desc');
    elements.macroSource = document.getElementById('macro-source');
    elements.macroParams = document.getElementById('macro-params');
    elements.macroRepeat = document.getElementById('macro-repeat');
    elements.stepList = document.getElementById('step-list');
    elements.btnSaveMacro = document.getElementById('btn-save-macro');
    elements.btnSaveAsMacro = document.getElementById('btn-save-as-macro');
    elements.btnDeleteMacro = document.getElementById('btn-delete-macro');
    elements.btnExportTtl = document.getElementById('btn-export-ttl');
    elements.btnRunMacro = document.getElementById('btn-run-macro');
    elements.btnPauseMacro = document.getElementById('btn-pause-macro');
    elements.btnStopMacro = document.getElementById('btn-stop-macro');
    elements.macroProgress = document.getElementById('macro-progress');
    
    // Step editor buttons
    elements.btnAddBlank = document.getElementById('btn-add-blank');
    elements.btnAddCommand = document.getElementById('btn-add-command');
    elements.btnAddWait = document.getElementById('btn-add-wait');
    elements.btnAddPause = document.getElementById('btn-add-pause');
    elements.btnAddNote = document.getElementById('btn-add-note');
    
    // Modals
    elements.modalSaveAs = document.getElementById('modal-save-as');
    elements.saveAsName = document.getElementById('save-as-name');
    elements.saveAsDesc = document.getElementById('save-as-desc');
    elements.btnCancelSave = document.getElementById('btn-cancel-save');
    
    elements.modalExportTtl = document.getElementById('modal-export-ttl');
    elements.ttlExport = document.getElementById('ttl-export');
    elements.btnCopyTtl = document.getElementById('btn-copy-ttl');
    elements.btnDownloadTtl = document.getElementById('btn-download-ttl');
    elements.btnCloseExport = document.getElementById('btn-close-export');
  }

  // ========================================================================
  // INITIALIZATION
  // ========================================================================
  
  function init() {
    cacheElements();
    loadUserMacros();
    renderHeader();
    renderCommandList();
    renderMacroSelect();
    setupEventListeners();
    registerServiceWorker();
    initTheme();
    initCameraPanel();
    renderSfxBoard();
    
    window.addEventListener('beforeunload', cleanupSfx);
    
    logToConsole('Airiz Motor Test Console initialized', 'welcome');
  }
  
  function initTheme() {
    const stored = localStorage.getItem('airiz.theme');
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    updateThemeUI(currentTheme || 'system');
    updateMetaThemeColor(currentTheme);
  }

  function renderHeader() {
    if (window.AIRIZ_COMMANDS && window.AIRIZ_COMMANDS.meta) {
      elements.fwVersion.textContent = window.AIRIZ_COMMANDS.meta.fwVersion;
      elements.dataSource.textContent = window.AIRIZ_COMMANDS.meta.source;
    }
  }

  function loadUserMacros() {
    try {
      const stored = localStorage.getItem('airiz.macros.v1');
      if (stored) {
        state.userMacros = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load user macros:', e);
      state.userMacros = [];
    }
  }

  function saveUserMacros() {
    try {
      localStorage.setItem('airiz.macros.v1', JSON.stringify(state.userMacros));
    } catch (e) {
      console.error('Failed to save user macros:', e);
    }
  }

  // ========================================================================
  // EVENT LISTENERS
  // ========================================================================
  
  function setupEventListeners() {
    // Serial controls
    elements.btnConnect.addEventListener('click', handleConnect);
    elements.btnDisconnect.addEventListener('click', handleDisconnect);
    elements.baudSelect.addEventListener('change', handleBaudChange);
    elements.btnDemo.addEventListener('click', toggleDemoMode);
    
    // Console
    elements.btnClear.addEventListener('click', clearConsole);
    elements.btnSaveLog.addEventListener('click', saveLog);
    elements.chkAutoscroll.addEventListener('change', (e) => {
      state.autoscroll = e.target.checked;
    });
    if (elements.chkAudioAutosave) {
      const stored = localStorage.getItem('airiz.audioAutoSave');
      state.audioAutoSave = stored === null ? true : stored === '1';
      elements.chkAudioAutosave.checked = state.audioAutoSave;
      elements.chkAudioAutosave.addEventListener('change', () => {
        state.audioAutoSave = elements.chkAudioAutosave.checked;
        localStorage.setItem('airiz.audioAutoSave', state.audioAutoSave ? '1' : '0');
        if (!state.audioAutoSave) setAudioAutosaveStatus('');
      });
    }
    elements.rawCommand.addEventListener('keydown', handleRawCommandKeydown);
    
    // Command search
    elements.commandSearch.addEventListener('input', handleCommandSearch);
    
    // Macro select
    elements.macroSelect.addEventListener('change', handleMacroSelect);
    
    // Macro repeat
    elements.macroRepeat.addEventListener('change', handleMacroRepeatChange);
    
    // Macro actions
    elements.btnSaveMacro.addEventListener('click', handleSaveMacro);
    elements.btnSaveAsMacro.addEventListener('click', handleSaveAsMacro);
    elements.btnDeleteMacro.addEventListener('click', handleDeleteMacro);
    elements.btnExportTtl.addEventListener('click', handleExportTtl);
    
    // Macro run controls
    elements.btnRunMacro.addEventListener('click', handleRunMacro);
    elements.btnPauseMacro.addEventListener('click', handlePauseMacro);
    elements.btnStopMacro.addEventListener('click', handleStopMacro);
    
    // Step editor buttons
    elements.btnAddBlank.addEventListener('click', () => addStep('blank'));
    elements.btnAddCommand.addEventListener('click', () => addStep('command'));
    elements.btnAddWait.addEventListener('click', () => addStep('wait'));
    elements.btnAddPause.addEventListener('click', () => addStep('pause'));
    elements.btnAddNote.addEventListener('click', () => addStep('note'));
    
    // Save as modal
    elements.btnCancelSave.addEventListener('click', () => elements.modalSaveAs.close());
    elements.modalSaveAs.querySelector('form').addEventListener('submit', handleSaveAsSubmit);
    
    // Export TTL modal
    elements.btnCopyTtl.addEventListener('click', copyTtlToClipboard);
    elements.btnDownloadTtl.addEventListener('click', downloadTtlFile);
    elements.btnCloseExport.addEventListener('click', () => elements.modalExportTtl.close());
    
    // Theme switcher
    elements.themeToggle.addEventListener('click', handleThemeToggle);
    
    // Sound FX
    if (elements.sfxSearch) {
      elements.sfxSearch.addEventListener('input', (e) => {
        sfxState.search = e.target.value;
        renderSfxBoard();
      });
    }
    if (elements.sfxVolume) {
      elements.sfxVolume.addEventListener('input', (e) => {
        sfxState.volume = parseInt(e.target.value, 10) / 100;
        if (sfxState.master) {
          sfxState.master.gain.value = sfxState.volume;
        }
      });
    }
    if (elements.btnSfxStop) {
      elements.btnSfxStop.addEventListener('click', stopAllSfx);
    }
    if (elements.btnSfxAddFile) {
      elements.btnSfxAddFile.addEventListener('click', () => {
        if (elements.sfxFileInput) {
          elements.sfxFileInput.click();
        }
      });
    }
    if (elements.sfxFileInput) {
      elements.sfxFileInput.addEventListener('change', (e) => {
        addUserSfxFiles(e.target.files);
        e.target.value = '';
      });
    }
    
    setupInstallPrompt();
    setupInstallGate();
    setupTabBar();
  }

  // ========================================================================
  // SERIAL CONNECTION
  // ========================================================================
  
  async function handleConnect() {
    if (!('serial' in navigator)) {
      logToConsole('Web Serial API not available. Using demo mode.', 'warning');
      toggleDemoMode();
      return;
    }
    
    try {
      state.port = await navigator.serial.requestPort();
      state.baudRate = parseInt(elements.baudSelect.value, 10);
      
      await state.port.open({
        baudRate: state.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      });
      
      state.connected = true;
      state.demoMode = false;
      updateConnectionUI(true, false);
      
      logToConsole(`Connected at ${state.baudRate} baud`, 'welcome');
      
      // Start read loop
      state.readLoopActive = true;
      readLoop();
      
      // Send initial blank to get prompt
      await sendLine('');
      
    } catch (error) {
      if (error.name !== 'AbortError') {
        logToConsole(`Connection error: ${error.message}`, 'error');
      }
    }
  }

  async function handleDisconnect() {
    await disconnect();
  }

  async function disconnect() {
    state.readLoopActive = false;
    
    if (state.reader) {
      try {
        await state.reader.cancel();
      } catch (e) {}
      state.reader = null;
    }
    
    if (state.writer) {
      try {
        await state.writer.close();
      } catch (e) {}
      state.writer = null;
    }
    
    if (state.port) {
      try {
        await state.port.close();
      } catch (e) {}
      state.port = null;
    }
    
    state.connected = false;
    updateConnectionUI(false, false);
    logToConsole('Disconnected', 'warning');
  }

  function handleBaudChange() {
    state.baudRate = parseInt(elements.baudSelect.value, 10);
  }

  function toggleDemoMode() {
    if (state.demoMode) {
      state.demoMode = false;
      disconnect();
    } else {
      state.demoMode = true;
      state.connected = true;
      updateConnectionUI(true, true);
      logToConsole('Demo mode enabled - simulating device', 'warning');
      logToConsole('~ #', 'response');
    }
  }

  function updateConnectionUI(connected, isDemo) {
    elements.btnConnect.disabled = connected;
    elements.btnDisconnect.disabled = !connected;
    elements.baudSelect.disabled = connected;
    elements.btnDemo.disabled = connected;
    
    if (connected) {
      elements.connectionStatus.textContent = isDemo ? 'Demo Mode' : 'Connected';
      elements.connectionStatus.className = 'status-indicator ' + (isDemo ? 'demo' : 'connected');
    } else {
      elements.connectionStatus.textContent = 'Disconnected';
      elements.connectionStatus.className = 'status-indicator';
    }
  }

  // ========================================================================
  // SERIAL READ LOOP
  // ========================================================================
  
  async function readLoop() {
    const decoder = new TextDecoder();
    
    try {
      while (state.readLoopActive && state.port && state.port.readable) {
        state.reader = state.port.readable.getReader();
        
        try {
          while (state.readLoopActive) {
            const { value, done } = await state.reader.read();
            if (done) break;
            if (value) {
              const text = decoder.decode(value);

              if (state.capture.active) {
                state.capture.chunks.push(text);
                const probe = state.capture.tail + text;
                if (probe.indexOf(state.capture.sentinel) !== -1) {
                  state.capture.active = false;
                  state.capture.done = true;
                  if (state.capture.resolve) {
                    state.capture.resolve();
                    state.capture.resolve = null;
                  }
                } else {
                  state.capture.tail = probe.slice(-(state.capture.sentinel.length - 1));
                }
              } else {
                appendToConsole(text, 'response');
              }

              // If in demo mode, also add to demo buffer for wait pattern matching
              if (state.demoMode) {
                state.demoBuffer += text;
              }
            }
          }
        } catch (error) {
          if (error.name !== 'AbortError') {
            throw error;
          }
        } finally {
          state.reader.releaseLock();
          state.reader = null;
        }
      }
    } catch (error) {
      if (state.readLoopActive) {
        logToConsole(`Read error: ${error.message}`, 'error');
      }
    }
  }

  // ========================================================================
  // SEND COMMANDS
  // ========================================================================
  
  async function sendLine(line) {
    const encoder = new TextEncoder();
    const data = encoder.encode(line + '\r\n');
    
    if (state.demoMode) {
      // Demo mode: echo and simulate response
      appendToConsole(`> ${line}`, 'command');
      setTimeout(() => simulateDemoResponse(line), 100);
      return;
    }
    
    if (!state.port || !state.port.writable) {
      logToConsole('Not connected', 'error');
      return;
    }
    
    try {
      state.writer = state.port.writable.getWriter();
      await state.writer.write(data);
      state.writer.releaseLock();
      appendToConsole(`> ${line}`, 'command');
    } catch (error) {
      logToConsole(`Send error: ${error.message}`, 'error');
      return;
    }

    if (/\bdiag\s+audio\s+record\b/i.test(line)) {
      autoSaveDeviceRecording(line);
    }
  }

  function simulateDemoResponse(command) {
    // Find matching command in AIRIZ_COMMANDS
    let response = '';
    let found = false;
    
    if (window.AIRIZ_COMMANDS) {
      for (const group of window.AIRIZ_COMMANDS.groups) {
        for (const cmd of group.commands) {
          if (cmd.cmd === command || command.startsWith(cmd.cmd.split('{')[0].trim())) {
            found = true;
            if (cmd.expect) {
              response = cmd.expect + '\r\n';
            }
            break;
          }
        }
      }
    }
    
    // Check macro wait patterns
    if (!found && command === '') {
      response = '';
    }
    
    // Always end with prompt
    response += '~ #\r\n';
    
    appendToConsole(response, 'response');
    state.demoBuffer += response;
  }

  // ========================================================================
  // DEVICE AUDIO AUTO-SAVE
  // ========================================================================

  const DEVICE_WAV_PATH = '/tmp/dmic_record_output.wav';
  const B64_START = '__B64_START__';
  const B64_END = '__XFER_END__';

  function setAudioAutosaveStatus(text) {
    if (elements.audioAutosaveStatus) {
      elements.audioAutosaveStatus.textContent = text || '';
    }
  }

  function parseRecordParams(cmd) {
    const secs = /-t\s+(\d+)/.exec(cmd);
    const gain = /-v\s+(\d+)/.exec(cmd);
    return {
      seconds: secs ? parseInt(secs[1], 10) : 0,
      gain: gain ? parseInt(gain[1], 10) : null
    };
  }

  function buildAudioFilename(params) {
    let name = 'dmic_' + formatTimestamp(new Date()) + '_' + (params.seconds || 0) + 's';
    if (params.gain !== null) {
      name += '_' + params.gain;
    }
    return name + '.wav';
  }

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }

  async function autoSaveDeviceRecording(recordCmd) {
    if (!state.audioAutoSave || state.demoMode || !state.port) return;
    if (state.capture.active) {
      logToConsole('[AUDIO] A capture is already running — skipping auto-save.', 'warning');
      return;
    }

    const params = parseRecordParams(recordCmd);
    state.capture.active = true;
    state.capture.chunks = [];
    state.capture.tail = '';
    state.capture.sentinel = B64_END;
    state.capture.done = false;
    state.capture.resolve = null;

    setAudioAutosaveStatus('Recording ' + (params.seconds || '?') + 's — will save when done…');
    logToConsole('[AUDIO] Recording started; will fetch ' + DEVICE_WAV_PATH + ' when it finishes…', 'note');

    const finished = new Promise((resolve) => { state.capture.resolve = resolve; });

    try {
      const encoder = new TextEncoder();
      state.writer = state.port.writable.getWriter();
      // The end echo is written as __X""FER_END__ so the command line the device
      // echoes back does not itself contain the sentinel this capture scans for.
      await state.writer.write(encoder.encode('echo ' + B64_START + '; base64 ' + DEVICE_WAV_PATH + '; echo __X""FER_END__\r\n'));
      state.writer.releaseLock();
    } catch (e) {
      state.capture.active = false;
      logToConsole('[AUDIO] Could not queue export: ' + e.message, 'error');
      setAudioAutosaveStatus('Export failed: ' + e.message);
      return;
    }

    const timeoutMs = Math.max((params.seconds || 0) * 1000 + 20000, 30000);
    await Promise.race([finished, sleep(timeoutMs)]);

    const timedOut = !state.capture.done;
    const all = state.capture.chunks.join('');
    state.capture.active = false;
    state.capture.resolve = null;

    if (timedOut) {
      logToConsole('[AUDIO] Timed out waiting for the WAV dump.', 'warning');
      setAudioAutosaveStatus('Timed out waiting for device.');
      return;
    }

    const start = all.lastIndexOf(B64_START);
    if (start < 0) {
      logToConsole('[AUDIO] No data marker in device output.', 'error');
      setAudioAutosaveStatus('No data received.');
      return;
    }
    let body = all.slice(start + B64_START.length);
    const end = body.indexOf(B64_END);
    if (end !== -1) body = body.slice(0, end);

    const b64 = body.replace(/[^A-Za-z0-9+/=]/g, '');
    if (!b64 || b64.length % 4 !== 0) {
      logToConsole('[AUDIO] Malformed base64 from device (length ' + b64.length + ').', 'error');
      setAudioAutosaveStatus('Malformed data from device.');
      return;
    }

    let bytes;
    try {
      bytes = base64ToBytes(b64);
    } catch (e) {
      logToConsole('[AUDIO] base64 decode failed: ' + e.message, 'error');
      setAudioAutosaveStatus('Decode failed.');
      return;
    }

    if (bytes.length < 44 || bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) {
      logToConsole('[AUDIO] Pulled data is not a RIFF/WAVE file — not saving.', 'error');
      setAudioAutosaveStatus('Not a valid WAV.');
      return;
    }

    await saveAudioToServer(buildAudioFilename(params), bytes);
  }

  async function saveAudioToServer(filename, bytes) {
    try {
      const res = await fetch('api/audio?name=' + encodeURIComponent(filename), {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        logToConsole('[AUDIO] Saved ' + bytes.length + ' bytes to ' + json.path, 'welcome');
        setAudioAutosaveStatus('Saved: ' + filename);
      } else {
        const why = json.error || ('HTTP ' + res.status);
        logToConsole('[AUDIO] Save failed: ' + why, 'error');
        setAudioAutosaveStatus('Save failed: ' + why);
      }
    } catch (e) {
      logToConsole('[AUDIO] Save failed: ' + e.message + ' — is the app served by server/serve.py?', 'error');
      setAudioAutosaveStatus('Save failed — start server/serve.py');
    }
  }

  // ========================================================================
  // CONSOLE OUTPUT
  // ========================================================================
  
  function appendToConsole(text, type = 'response') {
    const lines = text.split('\n');
    const container = elements.consoleOutput;
    
    for (const line of lines) {
      if (line.trim() === '') continue;
      
      const div = document.createElement('div');
      div.className = `console-line ${type}`;
      div.textContent = line;
      container.appendChild(div);
      
      state.consoleLines.push({ text: line, type });
    }
    
    if (state.autoscroll) {
      container.scrollTop = container.scrollHeight;
    }

    if (cameraState.sessionActive && typeof appendToSessionLog === 'function') {
      appendToSessionLog('console', text.replace(/\r/g, ''));
    }
  }

  function logToConsole(text, type = 'response') {
    appendToConsole(text + '\n', type);
  }

  function clearConsole() {
    elements.consoleOutput.innerHTML = '<div class="console-line welcome">Airiz Motor Test Console — Ready</div>';
    state.consoleLines = [];
  }

  function saveLog() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `airiz-log-${timestamp}.txt`;
    
    const content = state.consoleLines.map(line => line.text).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logToConsole(`Log saved: ${filename}`, 'note');
  }

  function handleRawCommandKeydown(e) {
    if (e.key === 'Enter') {
      const command = elements.rawCommand.value.trim();
      if (command) {
        sendLine(command);
        elements.rawCommand.value = '';
      }
    }
  }

  // ========================================================================
  // COMMAND LIBRARY
  // ========================================================================
  
  function renderCommandList(filter = '') {
    const commands = window.AIRIZ_COMMANDS || { groups: [] };
    const filterLower = filter.toLowerCase();
    
    elements.commandList.innerHTML = '';
    
    // Group by category
    const categoryGroups = {};
    
    for (const group of commands.groups) {
      const category = group.category || 'Other';
      if (!categoryGroups[category]) {
        categoryGroups[category] = [];
      }
      categoryGroups[category].push(group);
    }
    
    // Sort categories
    const sortedCategories = Object.keys(categoryGroups).sort();
    
    for (const category of sortedCategories) {
      const groups = categoryGroups[category];
      
      // Filter groups/commands
      const filteredGroups = [];
      for (const group of groups) {
        const matchingCommands = group.commands.filter(cmd => 
          cmd.label.toLowerCase().includes(filterLower) ||
          cmd.cmd.toLowerCase().includes(filterLower) ||
          (group.item && group.item.toLowerCase().includes(filterLower))
        );
        
        if (matchingCommands.length > 0) {
          filteredGroups.push({ ...group, commands: matchingCommands });
        }
      }
      
      if (filteredGroups.length === 0) continue;
      
      const groupDiv = document.createElement('div');
      groupDiv.className = 'command-group';
      
      const title = document.createElement('div');
      title.className = 'command-group-title';
      title.textContent = category;
      groupDiv.appendChild(title);
      
      for (const group of filteredGroups) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'command-item-group';
        
        const header = document.createElement('div');
        header.className = 'command-item-header';
        header.innerHTML = `
          <svg class="command-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
          </svg>
          ${group.item || group.id}
        `;
        itemDiv.appendChild(header);
        
        if (group.desc) {
          const desc = document.createElement('div');
          desc.className = 'command-item-desc';
          desc.textContent = group.desc;
          itemDiv.appendChild(desc);
        }
        
        for (const cmd of group.commands) {
          const card = createCommandCard(cmd);
          itemDiv.appendChild(card);
        }
        
        groupDiv.appendChild(itemDiv);
      }
      
      elements.commandList.appendChild(groupDiv);
    }
    
    if (elements.commandList.children.length === 0) {
      elements.commandList.innerHTML = '<div class="console-line note">No commands found</div>';
    }
  }

  function createCommandCard(cmd) {
    const card = document.createElement('div');
    card.className = 'command-card';
    
    const hasParams = cmd.params && cmd.params.length > 0;
    const paramValues = {};
    
    // Initialize default values
    if (hasParams) {
      for (const param of cmd.params) {
        paramValues[param.key] = param.default !== undefined ? param.default : '';
      }
    }
    
    const header = document.createElement('div');
    header.className = 'command-card-header';
    header.innerHTML = `<div class="command-card-label">${cmd.label}</div>`;
    card.appendChild(header);
    
    // Render params if present
    if (hasParams) {
      const paramsDiv = document.createElement('div');
      paramsDiv.className = 'command-params';
      
      for (const param of cmd.params) {
        const paramDiv = document.createElement('div');
        paramDiv.className = 'command-param';
        
        const label = document.createElement('label');
        label.textContent = param.label;
        paramDiv.appendChild(label);
        
        let input;
        if (param.type === 'enum' && param.options) {
          input = document.createElement('select');
          for (const opt of param.options) {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            if (opt === param.default) option.selected = true;
            input.appendChild(option);
          }
        } else if (param.type === 'int' || param.type === 'float') {
          input = document.createElement('input');
          input.type = 'number';
          input.value = param.default !== undefined ? param.default : '';
          if (param.min !== undefined) input.min = param.min;
          if (param.max !== undefined) input.max = param.max;
          if (param.step !== undefined) input.step = param.step;
        } else {
          input = document.createElement('input');
          input.type = 'text';
          input.value = param.default !== undefined ? param.default : '';
        }
        
        input.dataset.key = param.key;
        input.addEventListener('input', () => {
          paramValues[param.key] = input.type === 'number' ? 
            (param.type === 'float' ? parseFloat(input.value) : parseInt(input.value, 10)) : 
            input.value;
        });
        
        paramDiv.appendChild(input);
        paramsDiv.appendChild(paramDiv);
      }
      
      card.appendChild(paramsDiv);
    }
    
    // Actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'command-actions';
    
    const sendBtn = document.createElement('button');
    sendBtn.className = 'btn btn-sm btn-primary';
    sendBtn.textContent = 'Send';
    
    sendBtn.addEventListener('click', async () => {
      if (cmd.destructive) {
        const confirmed = await showConfirm(
          'Destructive Command',
          `Are you sure you want to execute: ${cmd.cmd}? This may reboot or reset the device.`
        );
        if (!confirmed) return;
      }
      
      let commandText = cmd.cmd;
      if (hasParams) {
        for (const [key, value] of Object.entries(paramValues)) {
          commandText = commandText.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }
      }
      
      sendLine(commandText);
      
      if (cmd.note) {
        logToConsole(`Note: ${cmd.note}`, 'note');
      }
    });
    
    actionsDiv.appendChild(sendBtn);
    card.appendChild(actionsDiv);
    
    // Note
    if (cmd.note) {
      const note = document.createElement('div');
      note.className = 'command-card-note';
      note.textContent = cmd.note;
      card.appendChild(note);
    }
    
    return card;
  }

  function handleCommandSearch(e) {
    renderCommandList(e.target.value);
  }

  async function showConfirm(title, message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.innerHTML = `
        <div class="confirm-dialog">
          <h3>${title}</h3>
          <p>${message}</p>
          <div class="confirm-dialog-actions">
            <button class="btn btn-danger" id="confirm-yes">Yes</button>
            <button class="btn btn-secondary" id="confirm-no">No</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      
      document.getElementById('confirm-yes').addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(true);
      });
      
      document.getElementById('confirm-no').addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(false);
      });
    });
  }

  // ========================================================================
  // MACRO PANEL
  // ========================================================================
  
  function getAllMacros() {
    const builtIn = window.AIRIZ_MACROS ? window.AIRIZ_MACROS.macros : [];
    return [...builtIn, ...state.userMacros];
  }

  function renderMacroSelect() {
    const macros = getAllMacros();
    elements.macroSelect.innerHTML = '';
    
    for (const macro of macros) {
      const option = document.createElement('option');
      option.value = macro.id;
      option.textContent = macro.name;
      elements.macroSelect.appendChild(option);
    }
    
    if (macros.length > 0) {
      handleMacroSelect();
    }
  }

  function handleMacroSelect() {
    const selectedId = elements.macroSelect.value;
    const macros = getAllMacros();
    const macro = macros.find(m => m.id === selectedId);
    
    if (!macro) return;
    
    state.currentMacro = macro;
    state.currentSteps = JSON.parse(JSON.stringify(macro.steps)); // Deep copy
    
    // Update info
    elements.macroDesc.textContent = macro.desc || '';
    elements.macroSource.textContent = macro.source ? `Source: ${macro.source}` : '';
    
    // Render params
    renderMacroParams(macro);
    
    // Set repeat count
    elements.macroRepeat.value = macro.repeat || 1;
    
    // Render steps
    renderStepList();
  }

  function renderMacroParams(macro) {
    elements.macroParams.innerHTML = '';
    state.currentMacroParams = {};
    
    if (!macro.params || macro.params.length === 0) return;
    
    const paramsDiv = document.createElement('div');
    paramsDiv.className = 'command-params';
    
    for (const param of macro.params) {
      const paramDiv = document.createElement('div');
      paramDiv.className = 'command-param';
      
      const label = document.createElement('label');
      label.textContent = param.label;
      paramDiv.appendChild(label);
      
      let input;
      if (param.type === 'int' || param.type === 'float') {
        input = document.createElement('input');
        input.type = 'number';
        input.value = param.default !== undefined ? param.default : '';
        if (param.min !== undefined) input.min = param.min;
        if (param.max !== undefined) input.max = param.max;
        if (param.step !== undefined) input.step = param.step;
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = param.default !== undefined ? param.default : '';
      }
      
      input.dataset.key = param.key;
      input.addEventListener('input', () => {
        state.currentMacroParams[param.key] = input.type === 'number' ? 
          (param.type === 'float' ? parseFloat(input.value) : parseInt(input.value, 10)) : 
          input.value;
      });
      
      // Initialize value
      state.currentMacroParams[param.key] = input.value;
      
      paramDiv.appendChild(input);
      paramsDiv.appendChild(paramDiv);
    }
    
    elements.macroParams.appendChild(paramsDiv);
  }

  function handleMacroRepeatChange() {
    if (state.currentMacro) {
      state.currentMacro.repeat = parseInt(elements.macroRepeat.value, 10) || 1;
    }
  }

  // ========================================================================
  // STEP EDITOR
  // ========================================================================
  
  function renderStepList() {
    elements.stepList.innerHTML = '';
    
    for (let i = 0; i < state.currentSteps.length; i++) {
      const step = state.currentSteps[i];
      const stepEl = createStepElement(step, i);
      elements.stepList.appendChild(stepEl);
    }
  }

  function createStepElement(step, index) {
    const div = document.createElement('div');
    div.className = 'step-item';
    div.dataset.index = index;
    
    if (index === state.macroCurrentStep && state.macroRunning) {
      div.classList.add('active');
    }
    
    const typeLabel = document.createElement('span');
    typeLabel.className = `step-item-type ${step.type}`;
    typeLabel.textContent = step.type;
    div.appendChild(typeLabel);
    
    const content = document.createElement('div');
    content.className = 'step-item-content';
    
    // Make editable based on type
    if (step.type === 'command' || step.type === 'wait' || step.type === 'note') {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = step.text || step.pattern || '';
      input.dataset.field = step.type === 'wait' ? 'pattern' : 'text';
      input.addEventListener('input', (e) => {
        if (step.type === 'wait') {
          step.pattern = e.target.value;
        } else {
          step.text = e.target.value;
        }
      });
      content.appendChild(input);
    } else if (step.type === 'pause') {
      const input = document.createElement('input');
      input.type = 'number';
      input.value = step.seconds || 1;
      input.min = '0.1';
      input.step = '0.1';
      input.dataset.field = 'seconds';
      input.addEventListener('input', (e) => {
        step.seconds = parseFloat(e.target.value) || 1;
      });
      content.appendChild(input);
    } else {
      content.textContent = '(no content)';
    }
    
    div.appendChild(content);
    
    // Actions
    const actions = document.createElement('div');
    actions.className = 'step-item-actions';
    
    const upBtn = document.createElement('button');
    upBtn.className = 'step-action-btn';
    upBtn.textContent = '↑';
    upBtn.title = 'Move up';
    upBtn.addEventListener('click', () => moveStep(index, -1));
    actions.appendChild(upBtn);
    
    const downBtn = document.createElement('button');
    downBtn.className = 'step-action-btn';
    downBtn.textContent = '↓';
    downBtn.title = 'Move down';
    downBtn.addEventListener('click', () => moveStep(index, 1));
    actions.appendChild(downBtn);
    
    const dupBtn = document.createElement('button');
    dupBtn.className = 'step-action-btn';
    dupBtn.textContent = '⧉';
    dupBtn.title = 'Duplicate';
    dupBtn.addEventListener('click', () => duplicateStep(index));
    actions.appendChild(dupBtn);
    
    const delBtn = document.createElement('button');
    delBtn.className = 'step-action-btn delete';
    delBtn.textContent = '×';
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', () => deleteStep(index));
    actions.appendChild(delBtn);
    
    div.appendChild(actions);
    
    return div;
  }

  function addStep(type) {
    let newStep = { type };
    
    switch (type) {
      case 'command':
        newStep.text = 'diag ver sw';
        break;
      case 'wait':
        newStep.pattern = '~ #';
        newStep.timeout = 15000;
        break;
      case 'pause':
        newStep.seconds = 1;
        break;
      case 'note':
        newStep.text = 'Checkpoint';
        break;
      case 'blank':
        break;
    }
    
    state.currentSteps.push(newStep);
    renderStepList();
  }

  function moveStep(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= state.currentSteps.length) return;
    
    const temp = state.currentSteps[index];
    state.currentSteps[index] = state.currentSteps[newIndex];
    state.currentSteps[newIndex] = temp;
    
    renderStepList();
  }

  function duplicateStep(index) {
    const step = state.currentSteps[index];
    const copy = JSON.parse(JSON.stringify(step));
    state.currentSteps.splice(index + 1, 0, copy);
    renderStepList();
  }

  function deleteStep(index) {
    state.currentSteps.splice(index, 1);
    renderStepList();
  }

  // ========================================================================
  // MACRO ACTIONS
  // ========================================================================
  
  function handleSaveMacro() {
    if (!state.currentMacro) return;
    
    // Check if it's a user macro
    const isUserMacro = state.userMacros.some(m => m.id === state.currentMacro.id);
    
    if (isUserMacro) {
      // Update existing
      const index = state.userMacros.findIndex(m => m.id === state.currentMacro.id);
      state.userMacros[index] = {
        ...state.currentMacro,
        steps: state.currentSteps,
        repeat: parseInt(elements.macroRepeat.value, 10)
      };
      saveUserMacros();
      renderMacroSelect();
      logToConsole(`Macro "${state.currentMacro.name}" saved`, 'note');
    } else {
      // Need to save as new
      handleSaveAsMacro();
    }
  }

  function handleSaveAsMacro() {
    elements.saveAsName.value = state.currentMacro ? state.currentMacro.name + ' (copy)' : '';
    elements.saveAsDesc.value = state.currentMacro ? state.currentMacro.desc : '';
    elements.modalSaveAs.showModal();
  }

  function handleSaveAsSubmit(e) {
    e.preventDefault();
    
    const name = elements.saveAsName.value.trim();
    const desc = elements.saveAsDesc.value.trim();
    
    if (!name) return;
    
    const newMacro = {
      id: 'user-' + Date.now(),
      name: name,
      desc: desc,
      source: 'User-defined',
      repeat: parseInt(elements.macroRepeat.value, 10) || 1,
      params: state.currentMacro ? JSON.parse(JSON.stringify(state.currentMacro.params || [])) : [],
      steps: JSON.parse(JSON.stringify(state.currentSteps))
    };
    
    state.userMacros.push(newMacro);
    saveUserMacros();
    renderMacroSelect();
    
    // Select the new macro
    elements.macroSelect.value = newMacro.id;
    handleMacroSelect();
    
    elements.modalSaveAs.close();
    logToConsole(`Macro "${name}" saved`, 'note');
  }

  function handleDeleteMacro() {
    if (!state.currentMacro) return;
    
    const isUserMacro = state.userMacros.some(m => m.id === state.currentMacro.id);
    if (!isUserMacro) {
      logToConsole('Cannot delete built-in macros', 'warning');
      return;
    }
    
    const index = state.userMacros.findIndex(m => m.id === state.currentMacro.id);
    if (index > -1) {
      const name = state.userMacros[index].name;
      state.userMacros.splice(index, 1);
      saveUserMacros();
      renderMacroSelect();
      logToConsole(`Macro "${name}" deleted`, 'note');
    }
  }

  function handleExportTtl() {
    if (!state.currentMacro || state.currentSteps.length === 0) return;
    
    const ttl = generateTTLCode(state.currentMacro, state.currentSteps);
    elements.ttlExport.value = ttl;
    elements.modalExportTtl.showModal();
  }

  function generateTTLCode(macro, steps) {
    let ttl = `' ${macro.name}\n`;
    ttl += `' ${macro.desc || ''}\n`;
    ttl += `' Source: ${macro.source || 'User-defined'}\n`;
    ttl += `' Generated by Airiz Motor Test Console\n\n`;
    ttl += `' Parameters:\n`;
    
    if (macro.params && macro.params.length > 0) {
      for (const param of macro.params) {
        ttl += `'   ${param.key} = ${state.currentMacroParams[param.key] || param.default}\n`;
      }
    }
    ttl += `\n`;
    
    ttl += `' Repeat: ${macro.repeat || 1}\n\n`;
    
    ttl += `' ========================================\n`;
    ttl += `' Main loop\n`;
    ttl += `' ========================================\n\n`;
    
    ttl += `repeat_count = ${macro.repeat || 1}\n`;
    ttl += `current_test = 0\n\n`;
    
    ttl += `while current_test < repeat_count\n`;
    ttl += `  current_test = current_test + 1\n`;
    ttl += `  sendln ""\n`;
    ttl += `  waitln "~ #", 15000\n\n`;
    
    for (const step of steps) {
      switch (step.type) {
        case 'blank':
          ttl += `  sendln ""\n`;
          ttl += `  waitln "~ #", 15000\n`;
          break;
        case 'command':
          const cmd = expandParams(step.text, state.currentMacroParams);
          ttl += `  sendln "${cmd}"\n`;
          ttl += `  waitln "~ #", 15000\n`;
          break;
        case 'wait':
          ttl += `  waitln "${step.pattern}", ${step.timeout || 15000}\n`;
          break;
        case 'pause':
          ttl += `  wait ${Math.round((step.seconds || 1) * 1000)}\n`;
          break;
        case 'note':
          ttl += `  ' NOTE: ${step.text}\n`;
          break;
      }
      ttl += `\n`;
    }
    
    ttl += `wend\n\n`;
    ttl += `' Test complete\n`;
    ttl += `sendln ""\n`;
    
    return ttl;
  }

  function expandParams(text, params) {
    if (!text) return '';
    let result = text;
    for (const [key, value] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  function copyTtlToClipboard() {
    elements.ttlExport.select();
    document.execCommand('copy');
    logToConsole('TTL code copied to clipboard', 'note');
  }

  function downloadTtlFile() {
    const ttl = elements.ttlExport.value;
    const blob = new Blob([ttl], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.currentMacro ? state.currentMacro.id : 'macro'}.ttl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ========================================================================
  // MACRO RUNNER
  // ========================================================================
  
  async function handleRunMacro() {
    if (state.macroRunning) return;
    if (!state.currentMacro || state.currentSteps.length === 0) {
      logToConsole('No macro selected or empty steps', 'warning');
      return;
    }
    
    state.macroRunning = true;
    state.macroPaused = false;
    state.macroStop = false;
    state.macroRepeatCount = 0;
    state.currentSteps = JSON.parse(JSON.stringify(state.currentMacro.steps)); // Reset steps
    
    // Update UI
    elements.btnRunMacro.disabled = true;
    elements.btnPauseMacro.disabled = false;
    elements.btnStopMacro.disabled = false;
    elements.macroSelect.disabled = true;
    
    logToConsole(`Starting macro: ${state.currentMacro.name}`, 'welcome');
    
    try {
      const repeatTotal = parseInt(elements.macroRepeat.value, 10) || 1;
      
      for (let r = 0; r < repeatTotal && !state.macroStop; r++) {
        state.macroRepeatCount = r + 1;
        
        // Show progress
        updateProgress(`************************* Current Test Count = ${state.macroRepeatCount}`, r + 1, repeatTotal);
        logToConsole(`************************* Current Test Count = ${state.macroRepeatCount}`, 'progress');
        
        // Execute all steps
        for (let i = 0; i < state.currentSteps.length && !state.macroStop; i++) {
          state.macroCurrentStep = i;
          renderStepList(); // Highlight current step
          
          await executeStep(state.currentSteps[i]);
          
          // Check for pause
          while (state.macroPaused && !state.macroStop) {
            await sleep(100);
          }
        }
      }
      
      if (!state.macroStop) {
        logToConsole('Macro completed successfully', 'welcome');
        updateProgress('Complete');
      } else {
        logToConsole('Macro stopped by user', 'warning');
        updateProgress('Stopped');
      }
      
    } catch (error) {
      logToConsole(`Macro error: ${error.message}`, 'error');
      updateProgress('Error');
    } finally {
      state.macroRunning = false;
      state.macroPaused = false;
      state.macroCurrentStep = -1;
      
      elements.btnRunMacro.disabled = false;
      elements.btnPauseMacro.disabled = true;
      elements.btnStopMacro.disabled = true;
      elements.macroSelect.disabled = false;
      
      renderStepList();
    }
  }

  async function executeStep(step) {
    switch (step.type) {
      case 'blank':
        await sendLine('');
        await waitForPrompt();
        break;
        
      case 'command':
        const cmd = expandParams(step.text, state.currentMacroParams);
        await sendLine(cmd);
        await waitForPrompt();
        break;
        
      case 'wait':
        await waitForPattern(step.pattern, step.timeout || 15000);
        break;
        
      case 'pause':
        await sleep((step.seconds || 1) * 1000);
        break;
        
      case 'note':
        logToConsole(`[NOTE] ${step.text}`, 'note');
        break;
    }
  }

  async function waitForPrompt() {
    if (state.demoMode) {
      // Demo mode: simulate prompt after short delay
      await sleep(50);
      return;
    }
    
    // Wait for ~ # pattern
    await waitForPattern('~ #', 15000);
  }

  async function waitForPattern(pattern, timeout) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (state.macroStop) return;
      
      if (state.demoMode) {
        if (state.demoBuffer.includes(pattern)) {
          state.demoBuffer = state.demoBuffer.replace(pattern, '');
          return;
        }
      } else {
        // For real serial, check last console output
        const recentOutput = state.consoleLines.slice(-10).map(l => l.text).join('\n');
        if (recentOutput.includes(pattern)) {
          return;
        }
      }
      
      await sleep(100);
    }
    
    logToConsole(`[TIMEOUT] Wait for "${pattern}" timed out after ${timeout}ms`, 'warning');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function updateProgress(text, current, total) {
    elements.macroProgress.innerHTML = `<span class="progress-text">${text}</span>`;
    if (current && total) {
      elements.macroProgress.innerHTML += `<span class="progress-text">${current} / ${total}</span>`;
    }
  }

  function handlePauseMacro() {
    if (!state.macroRunning) return;
    
    state.macroPaused = !state.macroPaused;
    elements.btnPauseMacro.textContent = state.macroPaused ? 'Resume' : 'Pause';
    
    if (state.macroPaused) {
      logToConsole('Macro paused', 'warning');
      updateProgress('PAUSED');
    } else {
      logToConsole('Macro resumed', 'welcome');
    }
  }

  function handleStopMacro() {
    if (!state.macroRunning) return;
    state.macroStop = true;
  }

  // ========================================================================
  // THEME SWITCHER
  // ========================================================================
  
  function handleThemeToggle() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const themeOrder = [null, 'light', 'dark'];
    const currentIndex = themeOrder.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    const nextTheme = themeOrder[nextIndex];
    
    if (nextTheme === null) {
      html.removeAttribute('data-theme');
      localStorage.removeItem('airiz.theme');
      updateThemeUI('system');
    } else {
      html.setAttribute('data-theme', nextTheme);
      localStorage.setItem('airiz.theme', nextTheme);
      updateThemeUI(nextTheme);
    }
    
    updateMetaThemeColor(nextTheme);
  }
  
  function updateThemeUI(theme) {
    const labels = {
      'system': 'System',
      'light': 'Light',
      'dark': 'Dark'
    };
    elements.themeLabel.textContent = labels[theme] || 'System';
    elements.themeToggle.setAttribute('aria-label', 'Theme: ' + (labels[theme] || 'System'));
  }
  
  function updateMetaThemeColor(theme) {
    if (!elements.themeColorMeta) return;
    
    if (theme === 'dark' || theme === null) {
      if (theme === null && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        elements.themeColorMeta.setAttribute('content', '#0f172a');
      } else if (theme === 'dark') {
        elements.themeColorMeta.setAttribute('content', '#0f172a');
      } else {
        elements.themeColorMeta.setAttribute('content', '#f8fafc');
      }
    } else {
      elements.themeColorMeta.setAttribute('content', '#f8fafc');
    }
  }

  // ========================================================================
  // SERVICE WORKER
  // ========================================================================
  
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.log('SW registration failed:', err));
    }
  }
  
  // ========================================================================
  // PWA INSTALL PROMPT
  // ========================================================================
  
  function setupInstallPrompt() {
    if (!elements.btnInstallApp) return;
    
    const btn = elements.btnInstallApp;
    
    function hideButton() {
      btn.setAttribute('hidden', '');
      btn.title = 'Install via your browser menu (Chrome/Edge → Install app)';
    }
    
    function showButton() {
      btn.removeAttribute('hidden');
      btn.title = 'Install app';
    }
    
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
      hideButton();
      return;
    }
    
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      deferredPrompt = e;
      showButton();
    });
    
    btn.addEventListener('click', async function() {
      if (!deferredPrompt) {
        hideButton();
        return;
      }
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        hideButton();
      }
      deferredPrompt = null;
    });
    
    window.addEventListener('appinstalled', function() {
      hideButton();
      if (typeof appendToSessionLog === 'function' && cameraState.sessionActive) {
        appendToSessionLog('install', 'App installed');
      }
    });
  }

  // ========================================================================
  // INSTALL GATE
  // ========================================================================
  
  function setupInstallGate() {
    if (!elements.installGate) return;
    
    let gateShown = false;
    let gateInstallPossible = false;
    let gateTimeout = null;
    
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
      return; // Already installed, don't show gate
    }
    
    // Check if previously dismissed
    if (localStorage.getItem('airiz.installGateDismissed') === '1') {
      return; // User dismissed, don't show again
    }
    
    // Wait for beforeinstallprompt event
    function showGateWithInstallOption() {
      if (gateShown) return;
      gateShown = true;
      gateInstallPossible = true;
      
      if (elements.installGateDesc) {
        elements.installGateDesc.textContent = 'Get quick access and a cleaner, full-screen experience.';
      }
      if (elements.btnGateInstall) {
        elements.btnGateInstall.hidden = false;
      }
      if (elements.btnGateSkip) {
        elements.btnGateSkip.textContent = 'Continue in the browser';
      }
      
      elements.installGate.hidden = false;
      if (elements.btnGateInstall) {
        elements.btnGateInstall.focus();
      }
    }
    
    function showGateWithInstructions() {
      if (gateShown) return;
      gateShown = true;
      
      if (elements.installGateDesc) {
        elements.installGateDesc.textContent = 'Use Chrome/Edge → ⋮ menu → Install app';
      }
      if (elements.btnGateInstall) {
        elements.btnGateInstall.hidden = true;
      }
      if (elements.btnGateSkip) {
        elements.btnGateSkip.textContent = 'Continue';
      }
      
      elements.installGate.hidden = false;
      if (elements.btnGateSkip) {
        elements.btnGateSkip.focus();
      }
    }
    
    // Listen for beforeinstallprompt
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      deferredPrompt = e;
      clearTimeout(gateTimeout);
      showGateWithInstallOption();
    });
    
    // If beforeinstallprompt doesn't fire within 1.5s, show with instructions
    gateTimeout = setTimeout(showGateWithInstructions, 1500);
    
    // Install button click
    if (elements.btnGateInstall) {
      elements.btnGateInstall.addEventListener('click', async function() {
        if (!deferredPrompt) return;
        
        try {
          deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          if (choice.outcome === 'accepted') {
            // Gate will be hidden by appinstalled event
          }
          deferredPrompt = null;
        } catch (err) {
          // Ignore errors
        }
      });
    }
    
    // Skip button click
    if (elements.btnGateSkip) {
      elements.btnGateSkip.addEventListener('click', function() {
        elements.installGate.hidden = true;
        localStorage.setItem('airiz.installGateDismissed', '1');
      });
    }
    
    // Escape key closes gate
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !elements.installGate.hidden) {
        elements.installGate.hidden = true;
        localStorage.setItem('airiz.installGateDismissed', '1');
      }
    });
    
    // App installed - clean up
    window.addEventListener('appinstalled', function() {
      elements.installGate.hidden = true;
      localStorage.removeItem('airiz.installGateDismissed');
    });
  }

  // ========================================================================
  // TAB BAR & VIEW SWITCHING
  // ========================================================================
  
  function setupTabBar() {
    if (!elements.tabConsole || !elements.tabCamera) return;
    
    function switchToConsole() {
      if (elements.viewConsole && elements.viewCamera && elements.viewSfx) {
        elements.viewConsole.hidden = false;
        elements.viewCamera.hidden = true;
        if (elements.viewSfx) elements.viewSfx.hidden = true;
      }
      if (elements.tabConsole && elements.tabCamera && elements.tabSfx) {
        elements.tabConsole.setAttribute('aria-selected', 'true');
        elements.tabCamera.setAttribute('aria-selected', 'false');
        elements.tabSfx.setAttribute('aria-selected', 'false');
      }
    }
    
    function switchToCamera() {
      if (elements.viewConsole && elements.viewCamera && elements.viewSfx) {
        elements.viewConsole.hidden = true;
        elements.viewCamera.hidden = false;
        if (elements.viewSfx) elements.viewSfx.hidden = true;
      }
      if (elements.tabConsole && elements.tabCamera && elements.tabSfx) {
        elements.tabConsole.setAttribute('aria-selected', 'false');
        elements.tabCamera.setAttribute('aria-selected', 'true');
        elements.tabSfx.setAttribute('aria-selected', 'false');
      }
      
      // Ensure camera panel is expanded in Camera view
      if (cameraState.collapsed && elements.cameraPanelContent) {
        cameraState.collapsed = false;
        elements.cameraPanelContent.classList.remove('hidden');
        if (elements.cameraToggle) {
          elements.cameraToggle.setAttribute('aria-expanded', 'true');
          elements.cameraToggle.querySelector('.camera-toggle-icon').classList.remove('rotated');
        }
      }
      
      // Auto-start camera preview if device selected and no stream running
      // This is a user gesture (tab click), so it's a good time to prompt
      setTimeout(function() {
        try {
          const hasDevice = elements.cameraDeviceSelect && elements.cameraDeviceSelect.value;
          const hasStream = cameraState.stream && cameraState.stream.active;
          const startBtnDisabled = elements.cameraStart && elements.cameraStart.disabled;
          
          if (hasDevice && !hasStream && !startBtnDisabled) {
            // Attempt to start preview
            if (typeof startCameraPreview === 'function') {
              startCameraPreview();
            }
          }
        } catch (err) {
          // Silently ignore - user can start manually
          console.warn('Auto-start camera preview failed:', err);
        }
      }, 100);
    }
    
    function switchToSfx() {
      if (elements.viewConsole && elements.viewCamera && elements.viewSfx) {
        elements.viewConsole.hidden = true;
        elements.viewCamera.hidden = true;
        elements.viewSfx.hidden = false;
      }
      if (elements.tabConsole && elements.tabCamera && elements.tabSfx) {
        elements.tabConsole.setAttribute('aria-selected', 'false');
        elements.tabCamera.setAttribute('aria-selected', 'false');
        elements.tabSfx.setAttribute('aria-selected', 'true');
      }
      // Render the SFX board on tab switch
      if (typeof renderSfxBoard === 'function') {
        renderSfxBoard();
      }
    }
    
    if (elements.tabConsole) {
      elements.tabConsole.addEventListener('click', switchToConsole);
    }
    if (elements.tabCamera) {
      elements.tabCamera.addEventListener('click', switchToCamera);
    }
    if (elements.tabSfx) {
      elements.tabSfx.addEventListener('click', switchToSfx);
    }
  }

  // ========================================================================
  // SOUND FX ENGINE
  // ========================================================================
  
  function ensureAudioContext() {
    if (!sfxState.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        sfxState.ctx = new AudioCtx();
        sfxState.master = sfxState.ctx.createGain();
        sfxState.master.gain.value = sfxState.volume;
        sfxState.master.connect(sfxState.ctx.destination);
      }
    }
    if (sfxState.ctx && sfxState.ctx.state === 'suspended') {
      sfxState.ctx.resume();
    }
    return sfxState.ctx;
  }
  
  function playSpec(spec) {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    
    const recipe = spec.recipe;
    const gain = spec.gain !== undefined ? spec.gain : 0.5;
    const now = ctx.currentTime;
    const sources = [];
    
    function createFilter(node, filterSpec) {
      if (!filterSpec) return node;
      const filter = ctx.createBiquadFilter();
      filter.type = filterSpec.type || 'lowpass';
      filter.frequency.value = filterSpec.freq || 1000;
      filter.Q.value = filterSpec.q || 1;
      node.connect(filter);
      filter.connect(sfxState.master);
      return filter;
    }
    
    function scheduleADSR(gainNode, attack, release, dur) {
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(gain, now + attack);
      gainNode.gain.setValueAtTime(gain, now + dur - release);
      gainNode.gain.linearRampToValueAtTime(0, now + dur);
    }
    
    switch (recipe) {
      case 'tone': {
        const osc = ctx.createOscillator();
        osc.type = spec.wave || 'sine';
        osc.frequency.value = spec.freq || 440;
        const env = ctx.createGain();
        env.gain.value = 0;
        osc.connect(env);
        createFilter(env, spec.filter);
        osc.start(now);
        osc.stop(now + spec.dur);
        scheduleADSR(env, spec.attack || 0.01, spec.release || 0.1, spec.dur || 0.3);
        sources.push(osc);
        break;
      }
      
      case 'sweep': {
        const osc = ctx.createOscillator();
        osc.type = spec.wave || 'sine';
        osc.frequency.setValueAtTime(spec.freqFrom || 440, now);
        osc.frequency.exponentialRampToValueAtTime(spec.freqTo || 880, now + (spec.dur || 0.5));
        const env = ctx.createGain();
        env.gain.value = 0;
        osc.connect(env);
        createFilter(env, spec.filter);
        osc.start(now);
        osc.stop(now + spec.dur);
        scheduleADSR(env, spec.attack || 0.01, spec.release || 0.1, spec.dur || 0.5);
        sources.push(osc);
        break;
      }
      
      case 'chord': {
        const freqs = spec.freqs || [440];
        for (const freq of freqs) {
          const osc = ctx.createOscillator();
          osc.type = spec.wave || 'sine';
          osc.frequency.value = freq;
          const env = ctx.createGain();
          env.gain.value = 0;
          osc.connect(env);
          createFilter(env, spec.filter);
          osc.start(now);
          osc.stop(now + spec.dur);
          scheduleADSR(env, spec.attack || 0.01, spec.release || 0.2, spec.dur || 0.4);
          sources.push(osc);
        }
        break;
      }
      
      case 'arp': {
        let time = now;
        const release = spec.release || 0.05;
        for (const note of (spec.notes || [])) {
          const osc = ctx.createOscillator();
          osc.type = spec.wave || 'sine';
          osc.frequency.value = note.freq;
          const env = ctx.createGain();
          env.gain.setValueAtTime(0, time);
          env.gain.linearRampToValueAtTime(gain, time + 0.01);
          env.gain.setValueAtTime(gain, time + note.dur - release);
          env.gain.linearRampToValueAtTime(0, time + note.dur);
          osc.connect(env);
          createFilter(env, spec.filter);
          osc.start(time);
          osc.stop(time + note.dur);
          sources.push(osc);
          time += note.dur;
        }
        break;
      }
      
      case 'noise': {
        const bufferSize = ctx.sampleRate * (spec.dur || 0.5);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = spec.filterType || 'lowpass';
        filter.frequency.setValueAtTime(spec.freqFrom || 1000, now);
        if (spec.freqTo !== undefined) {
          filter.frequency.exponentialRampToValueAtTime(spec.freqTo, now + (spec.dur || 0.5));
        }
        filter.Q.value = spec.q || 1;
        const env = ctx.createGain();
        env.gain.setValueAtTime(gain, now);
        env.gain.linearRampToValueAtTime(0, now + (spec.dur || 0.5));
        noise.connect(filter);
        filter.connect(env);
        env.connect(sfxState.master);
        noise.start(now);
        sources.push(noise);
        break;
      }
      
      case 'impact': {
        // Noise burst
        const bufferSize = ctx.sampleRate * (spec.dur || 0.1);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 3000;
        const env = ctx.createGain();
        env.gain.setValueAtTime(gain * 0.7, now);
        env.gain.exponentialRampToValueAtTime(0.01, now + (spec.dur || 0.1));
        noise.connect(filter);
        filter.connect(env);
        env.connect(sfxState.master);
        noise.start(now);
        sources.push(noise);
        
        // Boom sine
        const boom = ctx.createOscillator();
        boom.type = 'sine';
        boom.frequency.value = spec.boomFreq || 150;
        const boomEnv = ctx.createGain();
        boomEnv.gain.setValueAtTime(gain, now);
        boomEnv.gain.exponentialRampToValueAtTime(0.01, now + (spec.dur || 0.1));
        boom.connect(boomEnv);
        boomEnv.connect(sfxState.master);
        boom.start(now);
        boom.stop(now + (spec.dur || 0.1));
        sources.push(boom);
        break;
      }
      
      case 'siren': {
        const cycles = spec.cycles || 2;
        const dur = spec.dur || 1.0;
        const osc = ctx.createOscillator();
        osc.type = spec.wave || 'sawtooth';
        osc.frequency.setValueAtTime(spec.freqFrom || 600, now);
        // Multiple sweep cycles
        for (let i = 0; i < cycles; i++) {
          const t0 = now + (i * dur / cycles);
          const t1 = t0 + (dur / cycles / 2);
          const t2 = t0 + (dur / cycles);
          osc.frequency.setValueAtTime(spec.freqFrom, t0);
          osc.frequency.linearRampToValueAtTime(spec.freqTo, t1);
          osc.frequency.linearRampToValueAtTime(spec.freqFrom, t2);
        }
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(gain, now + 0.05);
        env.gain.setValueAtTime(gain, now + dur - 0.1);
        env.gain.linearRampToValueAtTime(0, now + dur);
        osc.connect(env);
        createFilter(env, spec.filter);
        osc.start(now);
        osc.stop(now + dur);
        sources.push(osc);
        break;
      }
      
      case 'beeps': {
        const count = spec.count || 2;
        const beepDur = spec.beepDur || 0.1;
        const gap = spec.gap || 0.1;
        for (let i = 0; i < count; i++) {
          const t = now + i * (beepDur + gap);
          const osc = ctx.createOscillator();
          osc.type = spec.wave || 'sine';
          osc.frequency.value = spec.freq || 880;
          const env = ctx.createGain();
          env.gain.setValueAtTime(0, t);
          env.gain.linearRampToValueAtTime(gain, t + 0.01);
          env.gain.setValueAtTime(gain, t + beepDur - 0.02);
          env.gain.linearRampToValueAtTime(0, t + beepDur);
          osc.connect(env);
          createFilter(env, spec.filter);
          osc.start(t);
          osc.stop(t + beepDur);
          sources.push(osc);
        }
        break;
      }
    }
    
    for (const src of sources) {
      sfxState.active.push(src);
      src.onended = () => {
        const idx = sfxState.active.indexOf(src);
        if (idx > -1) sfxState.active.splice(idx, 1);
      };
    }
  }
  
  function stopAllSfx() {
    for (const src of sfxState.active) {
      try { src.stop(); } catch (e) {}
      try { src.disconnect(); } catch (e) {}
    }
    sfxState.active = [];
  }
  
  function playSfx(sound) {
    if (sound.isUser && sound.url) {
      const audio = document.createElement('audio');
      audio.src = sound.url;
      audio.volume = sfxState.volume;
      audio.play();
      if (sound.element) {
        sound.element.classList.add('is-playing');
        audio.onended = () => sound.element.classList.remove('is-playing');
      }
      sfxState.active.push({ stop: () => { audio.pause(); audio.currentTime = 0; }, element: sound.element });
    } else {
      playSpec(sound.spec);
    }
  }
  
  function renderSfxBoard() {
    if (!elements.sfxGrid || !elements.sfxChips || !elements.sfxStatus) return;
    
    const sounds = window.AIRIZ_SOUNDS ? window.AIRIZ_SOUNDS.sounds : [];
    const categories = window.AIRIZ_SOUNDS ? window.AIRIZ_SOUNDS.categories : [];
    const filter = sfxState.filterCategory;
    const search = sfxState.search.toLowerCase();
    
    // Render category chips
    elements.sfxChips.innerHTML = '';
    const allChip = document.createElement('button');
    allChip.className = 'sfx-chip' + (filter === 'all' ? ' selected' : '');
    allChip.textContent = 'All';
    allChip.dataset.category = 'all';
    allChip.addEventListener('click', () => {
      sfxState.filterCategory = 'all';
      renderSfxBoard();
    });
    elements.sfxChips.appendChild(allChip);
    
    for (const cat of categories) {
      const chip = document.createElement('button');
      chip.className = 'sfx-chip' + (filter === cat.id ? ' selected' : '');
      chip.textContent = cat.name;
      chip.dataset.category = cat.id;
      chip.addEventListener('click', () => {
        sfxState.filterCategory = cat.id;
        renderSfxBoard();
      });
      elements.sfxChips.appendChild(chip);
    }
    
    // Filter sounds
    const filtered = sounds.filter(s => {
      const matchesCat = filter === 'all' || s.category === filter;
      const matchesSearch = !search || 
        s.name.toLowerCase().includes(search) || 
        s.desc.toLowerCase().includes(search) ||
        s.category.toLowerCase().includes(search);
      return matchesCat && matchesSearch;
    });
    
    // Add user sounds section
    const userSounds = sfxState.userSounds || [];
    const allSounds = [...filtered, ...userSounds];
    
    // Render grid
    elements.sfxGrid.innerHTML = '';
    if (allSounds.length === 0) {
      elements.sfxGrid.innerHTML = '<div class="sfx-empty">No sounds found</div>';
      elements.sfxStatus.textContent = '';
      return;
    }
    
    // Built-in sounds section
    if (filtered.length > 0) {
      const sectionTitle = document.createElement('div');
      sectionTitle.className = 'sfx-section-title';
      sectionTitle.textContent = 'Built-in sounds';
      elements.sfxGrid.appendChild(sectionTitle);
      
      for (const sound of filtered) {
        const card = document.createElement('button');
        card.className = 'sfx-card';
        card.dataset.id = sound.id;
        card.innerHTML = `
          <div class="sfx-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
          </div>
          <div class="sfx-card-name">${sound.name}</div>
          <div class="sfx-card-desc">${sound.desc}</div>
        `;
        card.addEventListener('click', () => {
          playSfx(sound);
          card.classList.add('is-playing');
          setTimeout(() => card.classList.remove('is-playing'), 500);
          if (elements.sfxStatus) {
            elements.sfxStatus.textContent = 'Playing: ' + sound.name;
          }
        });
        elements.sfxGrid.appendChild(card);
      }
    }
    
    // User sounds section
    if (userSounds.length > 0) {
      const sectionTitle = document.createElement('div');
      sectionTitle.className = 'sfx-section-title';
      sectionTitle.textContent = 'Your sounds';
      elements.sfxGrid.appendChild(sectionTitle);
      
      for (const sound of userSounds) {
        const card = document.createElement('button');
        card.className = 'sfx-card sfx-card-user';
        card.dataset.id = sound.id;
        sound.element = card;
        card.innerHTML = `
          <div class="sfx-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
          <div class="sfx-card-name">${sound.name}</div>
          <div class="sfx-card-desc">User loaded</div>
        `;
        card.addEventListener('click', () => {
          playSfx(sound);
        });
        elements.sfxGrid.appendChild(card);
      }
    }
    
    elements.sfxStatus.textContent = filtered.length + ' sound' + (filtered.length !== 1 ? 's' : '');
  }
  
  function addUserSfxFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    
    for (const file of fileList) {
      if (!file.type.startsWith('audio/')) continue;
      
      const url = URL.createObjectURL(file);
      const id = 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const name = file.name.replace(/\.[^/.]+$/, '');
      
      sfxState.userSounds.push({
        id: id,
        name: name,
        url: url,
        isUser: true,
        element: null
      });
      sfxState.objectUrls.push(url);
    }
    
    renderSfxBoard();
  }
  
  function cleanupSfx() {
    stopAllSfx();
    for (const url of sfxState.objectUrls) {
      try { URL.revokeObjectURL(url); } catch (e) {}
    }
    sfxState.objectUrls = [];
    sfxState.userSounds = [];
  }

  // ========================================================================
  // CAMERA PANEL (UVC)
  // ========================================================================
  
  const cameraState = {
    stream: null,
    selectedDeviceId: null,
    collapsed: true,
    stillBlob: null,
    stillObjectUrl: null,
    // Recording state
    recorder: null,
    recordingChunks: [],
    recordingStartTime: null,
    recordingTimer: null,
    recordingFileHandle: null,
    recordingWritable: null,
    recordingBytes: 0,
    recordingFilename: null,
    // Snapshot state
    snapshotBlob: null,
    // Settings state
    initialSettings: null,
    settingsControls: {},
    // Display transforms
    mirrorEnabled: false,
    rotateDegrees: 0,
    // Session folder state
    sessionActive: false,
    sessionDirHandle: null,
    sessionLogWritable: null,
    sessionLogLines: [],
    sessionFolderName: null,
    sessionArtifactCount: 0,
    sessionStartTime: null,
    // Artifact stats tracking
    artifactStats: {
      recording: { count: 0, bytes: 0 },
      picture: { count: 0, bytes: 0 },
      still: { count: 0, bytes: 0 }
    }
  };

  // ========================================================================
  // SOUND FX STATE
  // ========================================================================
  
  const sfxState = {
    ctx: null,
    master: null,
    volume: 0.7,
    active: [],
    userSounds: [],
    objectUrls: [],
    filterCategory: 'all',
    search: ''
  };
  
  function initCameraPanel() {
    elements.cameraToggle = document.getElementById('btn-camera-toggle');
    elements.cameraPanelContent = document.getElementById('camera-panel-content');
    elements.cameraDeviceSelect = document.getElementById('camera-device-select');
    elements.cameraModeSelect = document.getElementById('camera-mode-select');
    elements.cameraRefresh = document.getElementById('btn-camera-refresh');
    elements.cameraStart = document.getElementById('btn-camera-start');
    elements.cameraStop = document.getElementById('btn-camera-stop');
    elements.cameraPreview = document.getElementById('camera-preview');
    elements.cameraPlaceholder = document.getElementById('camera-placeholder');
    elements.cameraStatus = document.getElementById('camera-status');
    elements.cameraDiagnostic = document.getElementById('camera-diagnostic');
    
    // Day/Night & Lights controls
    elements.btnIrcutDay = document.getElementById('btn-ircut-day');
    elements.btnIrcutNight = document.getElementById('btn-ircut-night');
    elements.btnIrledOn = document.getElementById('btn-irled-on');
    elements.btnIrledOff = document.getElementById('btn-irled-off');
    elements.irledDutyRange = document.getElementById('irled-duty-range');
    elements.irledDutyValue = document.getElementById('irled-duty-value');
    elements.btnIrledApply = document.getElementById('btn-irled-apply');
    elements.btnSpotledOn = document.getElementById('btn-spotled-on');
    elements.btnSpotledOff = document.getElementById('btn-spotled-off');
    elements.spotledDutyRange = document.getElementById('spotled-duty-range');
    elements.spotledDutyValue = document.getElementById('spotled-duty-value');
    elements.btnSpotledApply = document.getElementById('btn-spotled-apply');
    elements.btnAlsValue = document.getElementById('btn-als-value');
    elements.btnAlsId = document.getElementById('btn-als-id');
    elements.btnDaylightFix = document.getElementById('btn-daylight-fix');
    
    // Still capture elements
    elements.chkCameraExact = document.getElementById('chk-camera-exact');
    elements.btnCameraCapture = document.getElementById('btn-camera-capture');
    elements.btnCameraPhotoCaps = document.getElementById('btn-camera-photo-caps');
    elements.btnCameraDownloadStill = document.getElementById('btn-camera-download-still');
    elements.btnCameraCopyDiag = document.getElementById('btn-camera-copy-diag');
    elements.cameraStillPreview = document.getElementById('camera-still-preview');
    elements.cameraStillInfo = document.getElementById('camera-still-info');
    
    // Recording elements
    elements.btnCameraRecord = document.getElementById('btn-camera-record');
    elements.cameraRecordInfo = document.getElementById('camera-record-info');
    
    // Snapshot elements
    elements.btnCameraSnapshot = document.getElementById('btn-camera-snapshot');
    elements.cameraSnapshotPreview = document.getElementById('camera-snapshot-preview');
    elements.cameraSnapshotInfo = document.getElementById('camera-snapshot-info');
    
    // Settings elements
    elements.btnCameraSettingsReset = document.getElementById('btn-camera-settings-reset');
    elements.cameraSettingsNote = document.getElementById('camera-settings-note');
    elements.cameraSettingsPanel = document.getElementById('camera-settings-panel');
    elements.chkCameraMirror = document.getElementById('chk-camera-mirror');
    elements.cameraRotateSelect = document.getElementById('camera-rotate-select');
    
    // Session elements
    elements.btnCameraSessionStart = document.getElementById('btn-camera-session-start');
    elements.btnCameraSessionEnd = document.getElementById('btn-camera-session-end');
    elements.btnCameraSessionLog = document.getElementById('btn-camera-session-log');
    elements.cameraSessionInfo = document.getElementById('camera-session-info');
    
    // ffmpeg helper elements
    elements.cameraFfmpegCmd = document.getElementById('camera-ffmpeg-cmd');
    elements.btnCameraFfmpegCopy = document.getElementById('btn-camera-ffmpeg-copy');
    elements.cameraFfmpegNote = document.getElementById('camera-ffmpeg-note');
    
    if (elements.cameraToggle) {
      elements.cameraToggle.addEventListener('click', toggleCameraPanel);
    }
    if (elements.cameraRefresh) {
      elements.cameraRefresh.addEventListener('click', enumerateCameraDevices);
    }
    if (elements.cameraStart) {
      elements.cameraStart.addEventListener('click', startCameraPreview);
    }
    if (elements.cameraDeviceSelect) {
      elements.cameraDeviceSelect.addEventListener('change', updateFfmpegHelper);
    }
    if (elements.cameraStop) {
      elements.cameraStop.addEventListener('click', stopCameraPreview);
    }
    
    // Day/Night & Lights event listeners
    if (elements.btnIrcutDay) {
      elements.btnIrcutDay.addEventListener('click', () => sendLine('diag ircut day'));
    }
    if (elements.btnIrcutNight) {
      elements.btnIrcutNight.addEventListener('click', () => sendLine('diag ircut night'));
    }
    if (elements.btnIrledOn) {
      elements.btnIrledOn.addEventListener('click', () => sendLine('diag irled on'));
    }
    if (elements.btnIrledOff) {
      elements.btnIrledOff.addEventListener('click', () => sendLine('diag irled off'));
    }
    if (elements.irledDutyRange) {
      elements.irledDutyRange.addEventListener('input', (e) => {
        elements.irledDutyValue.textContent = e.target.value;
      });
      elements.irledDutyRange.addEventListener('change', (e) => {
        elements.irledDutyValue.textContent = e.target.value;
      });
    }
    if (elements.btnIrledApply) {
      elements.btnIrledApply.addEventListener('click', () => {
        const duty = elements.irledDutyRange ? elements.irledDutyRange.value : '50';
        sendLine('diag irled duty ' + duty);
      });
    }
    if (elements.btnSpotledOn) {
      elements.btnSpotledOn.addEventListener('click', () => sendLine('diag spotled on'));
    }
    if (elements.btnSpotledOff) {
      elements.btnSpotledOff.addEventListener('click', () => sendLine('diag spotled off'));
    }
    if (elements.spotledDutyRange) {
      elements.spotledDutyRange.addEventListener('input', (e) => {
        elements.spotledDutyValue.textContent = e.target.value;
      });
      elements.spotledDutyRange.addEventListener('change', (e) => {
        elements.spotledDutyValue.textContent = e.target.value;
      });
    }
    if (elements.btnSpotledApply) {
      elements.btnSpotledApply.addEventListener('click', () => {
        const duty = elements.spotledDutyRange ? elements.spotledDutyRange.value : '50';
        sendLine('diag spotled duty ' + duty);
      });
    }
    if (elements.btnAlsValue) {
      elements.btnAlsValue.addEventListener('click', () => sendLine('diag als value'));
    }
    if (elements.btnAlsId) {
      elements.btnAlsId.addEventListener('click', () => sendLine('diag als id'));
    }
    if (elements.btnDaylightFix) {
      elements.btnDaylightFix.addEventListener('click', handleDaylightFix);
    }
    
    // Still capture event listeners
    if (elements.btnCameraCapture) {
      elements.btnCameraCapture.addEventListener('click', handleCameraCapture);
    }
    if (elements.btnCameraPhotoCaps) {
      elements.btnCameraPhotoCaps.addEventListener('click', handleCameraPhotoCaps);
    }
    if (elements.btnCameraDownloadStill) {
      elements.btnCameraDownloadStill.addEventListener('click', handleCameraDownloadStill);
    }
    if (elements.btnCameraCopyDiag) {
      elements.btnCameraCopyDiag.addEventListener('click', handleCameraCopyDiag);
    }
    
    // Recording event listeners
    if (elements.btnCameraRecord) {
      elements.btnCameraRecord.addEventListener('click', handleCameraRecordToggle);
    }
    
    // Snapshot event listeners
    if (elements.btnCameraSnapshot) {
      elements.btnCameraSnapshot.addEventListener('click', handleCameraSnapshot);
    }
    
    // Settings event listeners
    if (elements.btnCameraSettingsReset) {
      elements.btnCameraSettingsReset.addEventListener('click', handleCameraSettingsReset);
    }
    if (elements.chkCameraMirror) {
      elements.chkCameraMirror.addEventListener('change', handleCameraMirrorChange);
    }
    if (elements.cameraRotateSelect) {
      elements.cameraRotateSelect.addEventListener('change', handleCameraRotateChange);
    }
    
    // Session event listeners
    if (elements.btnCameraSessionStart) {
      elements.btnCameraSessionStart.addEventListener('click', handleCameraSessionStart);
    }
    if (elements.btnCameraSessionEnd) {
      elements.btnCameraSessionEnd.addEventListener('click', handleCameraSessionEnd);
    }
    if (elements.btnCameraSessionLog) {
      elements.btnCameraSessionLog.addEventListener('click', handleCameraSessionLogDownload);
    }
    
    // ffmpeg helper event listeners
    if (elements.btnCameraFfmpegCopy) {
      elements.btnCameraFfmpegCopy.addEventListener('click', handleCameraFfmpegCopy);
    }
    
    // Initial enumeration
    enumerateCameraDevices();
  }
  
  function toggleCameraPanel() {
    cameraState.collapsed = !cameraState.collapsed;
    if (cameraState.collapsed) {
      elements.cameraPanelContent.classList.add('hidden');
      elements.cameraToggle.setAttribute('aria-expanded', 'false');
      elements.cameraToggle.querySelector('.camera-toggle-icon').classList.add('rotated');
    } else {
      elements.cameraPanelContent.classList.remove('hidden');
      elements.cameraToggle.setAttribute('aria-expanded', 'true');
      elements.cameraToggle.querySelector('.camera-toggle-icon').classList.remove('rotated');
    }
  }
  
  async function enumerateCameraDevices() {
    // Check for secure context
    if (!window.isSecureContext) {
      updateCameraStatus('Camera access needs a secure context — open over http://localhost or https://');
      showCameraDiagnostic(false);
      return;
    }
    
    // Check for mediaDevices support
    if (!navigator.mediaDevices?.getUserMedia) {
      updateCameraStatus('Camera API not available in this browser');
      showCameraDiagnostic(false);
      return;
    }
    
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      
      // Clear existing options
      elements.cameraDeviceSelect.innerHTML = '';
      
      if (videoDevices.length === 0) {
        updateCameraStatus('No video input devices found');
        showCameraDiagnostic(true);
        return;
      }
      
      // Check if labels are blank (permission not granted)
      const hasBlankLabels = videoDevices.some(d => !d.label || d.label.trim() === '');
      
       // Add options
       for (const device of videoDevices) {
         const option = document.createElement('option');
         option.value = device.deviceId;
         option.textContent = device.label || `Camera ${videoDevices.indexOf(device) + 1}`;
         elements.cameraDeviceSelect.appendChild(option);
       }
       
       let statusMsg = `Found ${videoDevices.length} video device${videoDevices.length !== 1 ? 's' : ''}`;
       if (hasBlankLabels) {
         statusMsg += ' — grant camera permission to see device names';
       }
       updateCameraStatus(statusMsg);
       showCameraDiagnostic(false);
       
       // Update ffmpeg helper
       updateFfmpegHelper();
      
    } catch (error) {
      updateCameraStatus(`Error enumerating devices: ${error.message}`);
      showCameraDiagnostic(false);
    }
  }
  
  async function startCameraPreview() {
    // Check for secure context
    if (!window.isSecureContext) {
      updateCameraStatus('Camera access needs a secure context — open over http://localhost or https://');
      return;
    }
    
    // Check for mediaDevices support
    if (!navigator.mediaDevices?.getUserMedia) {
      updateCameraStatus('Camera API not available in this browser');
      return;
    }
    
    // Stop existing stream
    await stopCameraPreview();
    
    const deviceId = elements.cameraDeviceSelect.value;
    const modeValue = elements.cameraModeSelect.value;
    
    try {
      let constraints;
      if (modeValue === 'auto') {
        constraints = {
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
          audio: false
        };
      } else {
        const [width, height, frameRate] = modeValue.split('x').map(Number);
        const exactMode = elements.chkCameraExact && elements.chkCameraExact.checked;
        const resolver = exactMode ? 'exact' : 'ideal';
        const videoConstraints = {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { [resolver]: width },
          height: { [resolver]: height },
          frameRate: { [resolver]: frameRate }
        };
        if (!deviceId) {
          delete videoConstraints.deviceId;
        }
        constraints = {
          video: videoConstraints,
          audio: false
        };
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      cameraState.stream = stream;
      cameraState.selectedDeviceId = deviceId;
      
      elements.cameraPreview.srcObject = stream;
      elements.cameraPreview.style.display = 'block';
      elements.cameraPlaceholder.style.display = 'none';
      
      elements.cameraStart.disabled = true;
      elements.cameraStop.disabled = false;
      elements.cameraDeviceSelect.disabled = true;
      elements.cameraModeSelect.disabled = true;
      
      await new Promise((resolve) => {
        elements.cameraPreview.addEventListener('loadedmetadata', resolve, { once: true });
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const requestedMode = modeValue === 'auto' ? 'Auto' : modeValue.replace(/x(\d+)$/, '@$1');
      
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const actualWidth = settings.width || '?';
      const actualHeight = settings.height || '?';
      const actualFps = settings.frameRate !== undefined ? settings.frameRate : '?';
      
      let statusMsg = `Mode: requested ${requestedMode} · actual ${actualWidth}x${actualHeight}@${actualFps}`;
      
      if (track.getCapabilities) {
        try {
          const capabilities = track.getCapabilities();
          const maxWidth = capabilities.width?.max;
          const maxHeight = capabilities.height?.max;
          const maxFrameRate = capabilities.frameRate?.max;
          if (maxWidth !== undefined && maxHeight !== undefined && maxFrameRate !== undefined) {
            statusMsg += ` · camera max ${maxWidth}x${maxHeight}@${maxFrameRate}`;
          }
        } catch (e) {
          // getCapabilities not supported
        }
      }
      
      updateCameraStatus(statusMsg);
      
      // Enable record and snapshot buttons
      if (elements.btnCameraRecord) {
        elements.btnCameraRecord.disabled = false;
      }
      if (elements.btnCameraSnapshot) {
        elements.btnCameraSnapshot.disabled = false;
      }
      
      // Apply camera settings
      await applyCameraSettings(track);
      
    } catch (error) {
      let errorMsg = 'Failed to start camera';
      const modeLabel = modeValue === 'auto' ? 'Auto' : modeValue.replace(/x(\d+)$/, '@$1');
      
      if (error.name === 'NotAllowedError') {
        errorMsg = 'Permission denied — please allow camera access';
      } else if (error.name === 'NotFoundError') {
        errorMsg = `Camera not found — device may not be enumerating correctly (mode: ${modeLabel})`;
        showCameraDiagnostic(true);
      } else if (error.name === 'OverconstrainedError') {
        const exactHint = elements.chkCameraExact && elements.chkCameraExact.checked ?
          ' (Exact mode is enabled — the requested resolution/fps is not supported by this device. Uncheck Exact mode or try a different resolution)' :
          ' — try Auto or lower resolution';
        errorMsg = `Mode ${modeLabel} not supported${exactHint}`;
      } else if (error.name === 'NotReadableError') {
        errorMsg = 'Camera busy — close other apps using the camera and try again';
      } else {
        errorMsg = `${error.message} (mode: ${modeLabel})`;
      }
      
      updateCameraStatus(errorMsg);
    }
  }
  
  async function stopCameraPreview() {
    // Stop recording if active
    if (cameraState.recorder && cameraState.recorder.state !== 'inactive') {
      await stopRecording();
    }
    
    if (cameraState.stream) {
      // Stop all tracks
      for (const track of cameraState.stream.getTracks()) {
        track.stop();
      }
      cameraState.stream = null;
    }
    
    // Clear video source
    elements.cameraPreview.srcObject = null;
    elements.cameraPreview.style.display = 'none';
    elements.cameraPlaceholder.style.display = 'flex';
    
    elements.cameraStart.disabled = false;
    elements.cameraStop.disabled = true;
    elements.cameraDeviceSelect.disabled = false;
    elements.cameraModeSelect.disabled = false;
    
    // Disable record and snapshot buttons
    if (elements.btnCameraRecord) {
      elements.btnCameraRecord.disabled = true;
    }
    if (elements.btnCameraSnapshot) {
      elements.btnCameraSnapshot.disabled = true;
    }
    
    updateCameraStatus('Preview stopped');
  }
  
  function updateCameraStatus(message) {
    if (elements.cameraStatus) {
      elements.cameraStatus.textContent = message;
    }
  }
  
  function showCameraDiagnostic(show) {
    if (!elements.cameraDiagnostic) return;
    
    if (show) {
      elements.cameraDiagnostic.innerHTML = `
        <h4>No UVC Camera Detected</h4>
        <p>The device is not enumerating as a USB Video Class (UVC) camera. Check the following:</p>
        <ul>
          <li>On the device, run: <code>diag usbmode set uvc</code> (this will reboot)</li>
          <li><strong>Unplug and replug the USB cable</strong> so Windows re-enumerates the gadget</li>
          <li>Check Windows <strong>Device Manager → Cameras</strong> or the <strong>Camera</strong> app</li>
          <li>Note: UVC and CDC serial console may be mutually exclusive USB modes</li>
        </ul>
        <p>After switching USB modes, always disconnect and reconnect the USB cable for Windows to detect the change.</p>
      `;
      elements.cameraDiagnostic.classList.remove('hidden');
    } else {
      elements.cameraDiagnostic.classList.add('hidden');
    }
  }
  
  // ========================================================================
  // STILL CAPTURE & CAMERA DIAGNOSTICS
  // ========================================================================
  
  function getCameraVideoTrack() {
    if (!cameraState.stream) return null;
    const track = cameraState.stream.getVideoTracks()[0];
    return track && track.readyState === 'live' ? track : null;
  }
  
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '?';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
  
  function formatTimestamp(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }
  
  function extensionForBlob(blob) {
    const type = (blob && blob.type || '').toLowerCase();
    if (type.includes('png')) return 'png';
    if (type.includes('webp')) return 'webp';
    if (type.includes('gif')) return 'gif';
    return 'jpg';
  }
  
  async function handleCameraCapture() {
    const track = getCameraVideoTrack();
    if (!track) {
      updateCameraStatus('Start Preview first');
      return;
    }
    if (!window.ImageCapture) {
      updateCameraStatus('Still capture not supported in this browser');
      setStillInfo('Still capture not supported in this browser.');
      return;
    }
    
    updateCameraStatus('Capturing still...');
    
    try {
      const capture = new ImageCapture(track);
      const blob = await capture.takePhoto();
      
      // Revoke previous object URL before creating a new one
      if (cameraState.stillObjectUrl) {
        URL.revokeObjectURL(cameraState.stillObjectUrl);
        cameraState.stillObjectUrl = null;
      }
      
      cameraState.stillBlob = blob;
      const objectUrl = URL.createObjectURL(blob);
      cameraState.stillObjectUrl = objectUrl;
      
      // Show the thumbnail once the image has decoded (so we can read natural size)
      elements.cameraStillPreview.hidden = false;
      elements.cameraStillPreview.src = objectUrl;
      setStillInfo('Decoding image...');
      
      const cleanup = () => elements.cameraStillPreview.removeEventListener('load', onLoad);
      const onLoad = () => {
        cleanup();
        const w = elements.cameraStillPreview.naturalWidth;
        const h = elements.cameraStillPreview.naturalHeight;
        const filename = 'still-' + formatTimestamp(new Date()) + '.png';
        const sizeStr = formatBytes(blob.size);
        appendToSessionLog('still capture', 'Full-res still captured: ' + filename + ', ' + w + '×' + h + ', ' + sizeStr);
        
        // Track artifact stats
        cameraState.artifactStats.still.count++;
        cameraState.artifactStats.still.bytes += blob.size;
        
        let infoText = 'Captured ' + w + '×' + h + ' · ' + sizeStr + ' · type ' + (blob.type || 'unknown');
        
        // Try to write to session folder if active
        if (cameraState.sessionActive && cameraState.sessionDirHandle) {
          writeArtifactToSessionFolder(blob, 'still', '.png').then(function(writtenFilename) {
            if (writtenFilename) {
              setStillInfo(infoText + '\nSaved to session folder: ' + writtenFilename);
              updateCameraStatus('Still captured and saved to session folder.');
            }
          }).catch(function(e) {
            console.error('Failed to write still to session folder:', e);
            setStillInfo(infoText + '\nFilename: ' + filename + ' (will download on save)');
          });
        } else {
          setStillInfo(infoText + '\nFilename: ' + filename + ' (will download on save)');
        }
      };
      elements.cameraStillPreview.addEventListener('load', onLoad);
      
      // Enable download button
      if (elements.btnCameraDownloadStill) {
        elements.btnCameraDownloadStill.disabled = false;
      }
      
      updateCameraStatus('Still captured. Use Download still to save it.');
      
    } catch (error) {
      updateCameraStatus('Capture failed: ' + error.message);
    }
  }
  
  async function handleCameraPhotoCaps() {
    const track = getCameraVideoTrack();
    if (!track) {
      updateCameraStatus('Start Preview first');
      return;
    }
    if (!window.ImageCapture) {
      updateCameraStatus('Photo capabilities not supported in this browser');
      setStillInfo('Photo capabilities not supported in this browser.');
      return;
    }
    
    updateCameraStatus('Reading photo capabilities…');
    
    try {
      const capture = new ImageCapture(track);
      const caps = await capture.getPhotoCapabilities();
      cameraState.lastPhotoCaps = caps;
      
      const lines = ['Photo capabilities:'];
      if (caps.imageWidth) {
        lines.push(`  imageWidth:  min ${caps.imageWidth.min}, max ${caps.imageWidth.max}, step ${caps.imageWidth.step}`);
      }
      if (caps.imageHeight) {
        lines.push(`  imageHeight: min ${caps.imageHeight.min}, max ${caps.imageHeight.max}, step ${caps.imageHeight.step}`);
      }
      if (caps.fillLightMode) {
        lines.push(`  fillLightMode: ${caps.fillLightMode.join(', ')}`);
      }
      
      setStillInfo(lines.join('\n'));
      updateCameraStatus('Photo capabilities read. See details below.');
      
    } catch (error) {
      updateCameraStatus(`Photo capabilities failed: ${error.message}`);
    }
  }
  
  function handleCameraDownloadStill() {
    if (!cameraState.stillBlob) {
      updateCameraStatus('Capture a still first');
      return;
    }
    
    const ext = extensionForBlob(cameraState.stillBlob);
    const filename = 'airiz-still-' + formatTimestamp(new Date()) + '.' + ext;
    
    // If session is active, write to session folder
    if (cameraState.sessionActive && cameraState.sessionDirHandle) {
      writeArtifactToSessionFolder(cameraState.stillBlob, 'still', '.' + ext).then(function(writtenFilename) {
        if (writtenFilename) {
          appendToSessionLog('still download', 'Still downloaded to session folder: ' + writtenFilename);
          updateCameraStatus('Saved to session folder: ' + writtenFilename);
        }
      }).catch(function(e) {
        console.error('Failed to write still to session folder:', e);
        // Fallback to direct download
        const a = document.createElement('a');
        a.href = cameraState.stillObjectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        updateCameraStatus('Saved ' + filename + ' (fallback)');
      });
    } else {
      // Direct download
      const a = document.createElement('a');
      a.href = cameraState.stillObjectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      updateCameraStatus('Saved ' + filename);
    }
  }
  
  async function handleCameraCopyDiag() {
    const lines = [];
    lines.push('Airiz Motor Test Console — Camera diagnostics');
    lines.push(`User agent: ${navigator.userAgent}`);
    lines.push(`Secure context: ${window.isSecureContext}`);
    lines.push('');
    
    // Device info
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      lines.push(`Video devices: ${videoDevices.length}`);
      const selectedId = elements.cameraDeviceSelect ? elements.cameraDeviceSelect.value : '';
      const selected = videoDevices.find(d => d.deviceId === selectedId);
      lines.push(`Selected device: ${selected ? (selected.label || '(unlabeled)') : '(none)'}`);
    } catch (e) {
      lines.push(`Video devices: (enumerateDevices failed: ${e.message})`);
    }
    
    lines.push('');
    
    // Requested mode
    const modeValue = elements.cameraModeSelect ? elements.cameraModeSelect.value : 'auto';
    const exactMode = elements.chkCameraExact && elements.chkCameraExact.checked;
    lines.push(`Requested mode: ${modeValue}${exactMode ? ' (exact)' : ' (ideal)'}`);
    
    // Actual + capabilities
    const track = getCameraVideoTrack();
    if (track) {
      const settings = track.getSettings();
      const vw = settings.width || '?';
      const vh = settings.height || '?';
      const fps = settings.frameRate !== undefined ? Math.round(settings.frameRate) : '?';
      lines.push(`Actual: ${vw}×${vh} @ ${fps}`);
      if (track.getCapabilities) {
        try {
          lines.push(`track.getCapabilities(): ${JSON.stringify(track.getCapabilities())}`);
        } catch (e) {
          lines.push(`track.getCapabilities(): (failed: ${e.message})`);
        }
      } else {
        lines.push('track.getCapabilities(): (not supported in this browser)');
      }
    } else {
      lines.push('Actual: (no active preview stream)');
    }
    
    // Photo capabilities if available
    if (cameraState.lastPhotoCaps) {
      lines.push('');
      lines.push(`getPhotoCapabilities(): ${JSON.stringify(cameraState.lastPhotoCaps)}`);
    }
    
    const text = lines.join('\n');
    
    // Clipboard with fallback
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        updateCameraStatus('Camera diagnostics copied to clipboard.');
        return;
      } catch (e) {
        // fall through to textarea
      }
    }
    
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(textarea);
    updateCameraStatus(ok ? 'Camera diagnostics copied to clipboard.' : 'Clipboard copy failed — see console');
  }
  
  function setStillInfo(text) {
    if (elements.cameraStillInfo) {
      elements.cameraStillInfo.textContent = text;
    }
  }
  
  // ========================================================================
  // VIDEO RECORDING
  // ========================================================================
  
  async function handleCameraRecordToggle() {
    if (!cameraState.stream) {
      updateCameraStatus('Start Preview first');
      return;
    }
    
    const isRecording = cameraState.recorder && cameraState.recorder.state === 'recording';
    
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }
  
  async function startRecording() {
    if (!window.MediaRecorder) {
      updateCameraStatus('MediaRecorder not supported in this browser');
      return;
    }
    
    const videoTrack = getCameraVideoTrack();
    if (!videoTrack) {
      updateCameraStatus('No active video stream');
      return;
    }
    
    // Choose MIME type
    const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    let selectedMime = '';
    for (const mime of mimeTypes) {
      if (window.MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }
    
    if (!selectedMime) {
      updateCameraStatus('No supported video MIME type found');
      return;
    }
    
    try {
      // Reset state
      cameraState.recordingChunks = [];
      cameraState.recordingBytes = 0;
      cameraState.recordingFileHandle = null;
      cameraState.recordingWritable = null;
      
      const recorder = new MediaRecorder(cameraState.stream, { mimeType: selectedMime });
      
      recorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0) {
          cameraState.recordingChunks.push(event.data);
          cameraState.recordingBytes += event.data.size;
          
          // Write to session folder if active, otherwise to FSA picker
          if (cameraState.sessionActive && cameraState.sessionDirHandle) {
            // Session mode: write directly to session folder
            try {
              if (!cameraState.recordingWritable && cameraState.sessionDirHandle) {
                // Create file on first chunk
                const filename = 'record-' + formatTimestamp(new Date()) + '.webm';
                const fileHandle = await cameraState.sessionDirHandle.getFileHandle(filename, { create: true });
                cameraState.recordingWritable = await fileHandle.createWritable();
                cameraState.recordingFilename = filename;
              }
              if (cameraState.recordingWritable) {
                await cameraState.recordingWritable.write(event.data);
              }
            } catch (e) {
              console.error('Failed to write to session folder:', e);
              cameraState.recordingWritable = null;
            }
          } else if (cameraState.recordingWritable) {
            // Non-session FSA mode
            try {
              await cameraState.recordingWritable.write(event.data);
            } catch (e) {
              console.error('Failed to write chunk:', e);
              cameraState.recordingWritable = null;
              cameraState.recordingFileHandle = null;
            }
          }
          
          // Update UI
          updateRecordInfo();
        }
      };
      
      recorder.onstop = async () => {
        // Finalize
        if (cameraState.recordingWritable) {
          try {
            await cameraState.recordingWritable.close();
          } catch (e) {}
          cameraState.recordingWritable = null;
          if (cameraState.sessionActive) {
            incrementSessionArtifactCount();
            cameraState.artifactStats.recording.count++;
            cameraState.artifactStats.recording.bytes += cameraState.recordingBytes;
            const durationSec = Math.floor((Date.now() - cameraState.recordingStartTime) / 1000);
            appendToSessionLog('record stop', 'Recording saved: ' + cameraState.recordingFilename + ', ' + formatBytes(cameraState.recordingBytes) + ', duration: ' + durationSec + 's');
            updateCameraStatus('Recording saved to session folder: ' + cameraState.recordingFilename);
          } else {
            updateCameraStatus('Recording saved to ' + cameraState.recordingFilename);
          }
        } else {
          // Fallback: create blob and download
          const blob = new Blob(cameraState.recordingChunks, { type: selectedMime });
          const url = URL.createObjectURL(blob);
          const filename = cameraState.recordingFilename || ('airiz-rec-' + formatTimestamp(new Date()) + '.webm');
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          if (cameraState.sessionActive) {
            cameraState.artifactStats.recording.count++;
            cameraState.artifactStats.recording.bytes += blob.size;
            appendToSessionLog('record stop (fallback)', 'Recording saved via fallback: ' + filename + ', ' + formatBytes(blob.size));
          }
          updateCameraStatus('Recording saved (fallback mode)');
        }
        
        cameraState.recorder = null;
        cameraState.recordingChunks = [];
        stopRecordingTimer();
        updateRecordButton(false);
      };
      
      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
        updateCameraStatus('Recording error: ' + (event.error?.message || 'unknown'));
      };
      
      recorder.start(1000); // 1 second timeslice
      cameraState.recorder = recorder;
      
      // Session folder takes priority over FSA picker
      if (cameraState.sessionActive && cameraState.sessionDirHandle) {
        // File will be created on first data chunk
        cameraState.recordingFilename = 'record-<timestamp>.webm';
      } else if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: 'airiz-rec-' + formatTimestamp(new Date()) + '.webm',
            types: [{
              description: 'WebM Video',
              accept: { 'video/webm': ['.webm'] }
            }]
          });
          cameraState.recordingFileHandle = handle;
          cameraState.recordingWritable = await handle.createWritable();
          cameraState.recordingFilename = handle.name;
        } catch (e) {
          cameraState.recordingFilename = 'airiz-rec-' + formatTimestamp(new Date()) + '.webm';
        }
      } else {
        cameraState.recordingFilename = 'airiz-rec-' + formatTimestamp(new Date()) + '.webm';
      }
      
      // Start timer
      cameraState.recordingStartTime = Date.now();
      startRecordingTimer();
      updateRecordButton(true);
      updateCameraStatus('Recording started...');
      appendToSessionLog('record start', 'Recording started - mode: ' + selectedMime);
      
    } catch (error) {
      updateCameraStatus('Recording failed: ' + error.message);
    }
  }
  
  async function stopRecording() {
    if (cameraState.recorder && cameraState.recorder.state !== 'inactive') {
      cameraState.recorder.stop();
    }
  }
  
  function startRecordingTimer() {
    stopRecordingTimer();
    cameraState.recordingTimer = setInterval(() => {
      updateRecordInfo();
    }, 500);
  }
  
  function stopRecordingTimer() {
    if (cameraState.recordingTimer) {
      clearInterval(cameraState.recordingTimer);
      cameraState.recordingTimer = null;
    }
  }
  
  function updateRecordInfo() {
    if (!elements.cameraRecordInfo) return;
    
    const elapsed = Math.floor((Date.now() - cameraState.recordingStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    let info = `⏱ ${timeStr} · ${formatBytes(cameraState.recordingBytes)}`;
    if (cameraState.recordingFilename) {
      info += ` · ${cameraState.recordingFilename}`;
    }
    
    elements.cameraRecordInfo.textContent = info;
  }
  
  function updateRecordButton(isRecording) {
    if (!elements.btnCameraRecord) return;
    
    if (isRecording) {
      elements.btnCameraRecord.textContent = '■ Stop recording';
      elements.btnCameraRecord.setAttribute('aria-pressed', 'true');
      elements.btnCameraRecord.classList.add('btn-danger');
      elements.btnCameraRecord.classList.remove('btn-primary');
    } else {
      elements.btnCameraRecord.textContent = '● Record';
      elements.btnCameraRecord.setAttribute('aria-pressed', 'false');
      elements.btnCameraRecord.classList.remove('btn-danger');
      elements.btnCameraRecord.classList.add('btn-primary');
    }
  }
  
  // ========================================================================
  // SNAPSHOT
  // ========================================================================
  
  async function handleCameraSnapshot() {
    if (!cameraState.stream) {
      updateCameraStatus('Start Preview first');
      return;
    }
    
    const video = elements.cameraPreview;
    if (!video || video.readyState < 2) {
      updateCameraStatus('Preview not ready');
      return;
    }
    
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          updateCameraStatus('Snapshot failed');
          return;
        }
        
        cameraState.snapshotBlob = blob;
        const url = URL.createObjectURL(blob);
        
        // Show thumbnail
        elements.cameraSnapshotPreview.hidden = false;
        elements.cameraSnapshotPreview.src = url;
        
        const w = canvas.width;
        const h = canvas.height;
        const filename = 'picture-' + formatTimestamp(new Date()) + '.png';
        const sizeStr = formatBytes(blob.size);
        appendToSessionLog('snapshot', 'Snapshot captured: ' + filename + ', ' + w + '×' + h + ', ' + sizeStr);
        
        cameraState.artifactStats.picture.count++;
        cameraState.artifactStats.picture.bytes += blob.size;
        
        // Try to write to session folder first
        if (cameraState.sessionActive && cameraState.sessionDirHandle) {
          const writtenFilename = await writeArtifactToSessionFolder(blob, 'picture', '.png');
          if (writtenFilename) {
            elements.cameraSnapshotInfo.textContent = 'Captured ' + w + '×' + h + ' · ' + sizeStr + '\nFilename: ' + writtenFilename;
            updateCameraStatus('Snapshot saved to session folder: ' + writtenFilename);
            URL.revokeObjectURL(url);
            return;
          }
        }
        
        // Fallback: download
        elements.cameraSnapshotInfo.textContent = 'Captured ' + w + '×' + h + ' · ' + sizeStr + '\nFilename: ' + filename;
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        updateCameraStatus('Snapshot captured and downloaded');
      }, 'image/png');
      
    } catch (error) {
      updateCameraStatus(`Snapshot failed: ${error.message}`);
    }
  }
  
  // ========================================================================
  // CAMERA SETTINGS
  // ========================================================================
  
  async function applyCameraSettings(track) {
    if (!track || !track.getCapabilities) return;
    
    const capabilities = track.getCapabilities();
    const settings = track.getSettings();
    
    // Store initial settings for reset
    cameraState.initialSettings = {};
    
    const supportedSettings = ['brightness', 'contrast', 'saturation', 'sharpness', 'whiteBalance', 
                               'colorTemperature', 'exposureCompensation', 'exposureTime', 'iso', 
                               'focusDistance', 'zoom', 'pan', 'tilt'];
    
    let hasAnySettings = false;
    const panel = elements.cameraSettingsPanel;
    if (panel) panel.innerHTML = '';
    
    for (const key of supportedSettings) {
      if (capabilities[key] !== undefined) {
        hasAnySettings = true;
        cameraState.initialSettings[key] = settings[key] !== undefined ? settings[key] : 
          (capabilities[key].min !== undefined ? capabilities[key].min : 0);
        
        renderSettingControl(key, capabilities[key], cameraState.initialSettings[key], track);
      }
    }
    
    // Torch (checkbox)
    if (capabilities.torch !== undefined) {
      hasAnySettings = true;
      cameraState.initialSettings.torch = settings.torch || false;
      renderTorchControl(track);
    }
    
    if (elements.cameraSettingsNote) {
      elements.cameraSettingsNote.textContent = hasAnySettings ? 
        'Adjust settings below. Changes apply after ~150ms debounce.' : 
        'This camera does not expose adjustable settings.';
    }
    
    if (elements.btnCameraSettingsReset) {
      elements.btnCameraSettingsReset.disabled = !hasAnySettings;
    }
  }
  
  function renderSettingControl(key, capability, currentValue, track) {
    const panel = elements.cameraSettingsPanel;
    if (!panel) return;
    
    const labels = {
      brightness: 'Brightness',
      contrast: 'Contrast',
      saturation: 'Saturation',
      sharpness: 'Sharpness',
      whiteBalance: 'White balance',
      colorTemperature: 'Color temperature',
      exposureCompensation: 'Exposure compensation',
      exposureTime: 'Exposure time',
      iso: 'ISO',
      focusDistance: 'Focus distance',
      zoom: 'Zoom',
      pan: 'Pan',
      tilt: 'Tilt'
    };
    
    const div = document.createElement('div');
    div.className = 'camera-setting-control';
    
    const label = document.createElement('span');
    label.className = 'camera-setting-label';
    label.textContent = labels[key] || key;
    div.appendChild(label);
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'camera-setting-slider';
    slider.min = capability.min !== undefined ? capability.min : 0;
    slider.max = capability.max !== undefined ? capability.max : 100;
    slider.step = capability.step !== undefined ? capability.step : 1;
    slider.value = currentValue;
    slider.disabled = !track || track.readyState !== 'live';
    
    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'camera-setting-value';
    valueDisplay.textContent = String(currentValue);
    
    // Debounced apply
    let debounceTimer = null;
    slider.addEventListener('input', () => {
      valueDisplay.textContent = slider.value;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const value = slider.type === 'range' ? 
            (capability.step && capability.step < 1 ? parseFloat(slider.value) : parseInt(slider.value, 10)) :
            slider.value;
          await track.applyConstraints({ advanced: [{ [key]: value }] });
        } catch (e) {
          console.error(`Failed to apply ${key}:`, e);
        }
      }, 150);
    });
    
    div.appendChild(slider);
    div.appendChild(valueDisplay);
    
    const message = document.createElement('div');
    message.className = 'camera-setting-message';
    message.textContent = `Range: ${slider.min} – ${slider.max}`;
    div.appendChild(message);
    
    panel.appendChild(div);
    cameraState.settingsControls[key] = { slider, valueDisplay };
  }
  
  function renderTorchControl(track) {
    const panel = elements.cameraSettingsPanel;
    if (!panel) return;
    
    const div = document.createElement('div');
    div.className = 'camera-setting-control';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'camera-torch-checkbox';
    checkbox.checked = cameraState.initialSettings.torch || false;
    checkbox.disabled = !track || track.readyState !== 'live';
    
    const label = document.createElement('label');
    label.htmlFor = 'camera-torch-checkbox';
    label.className = 'checkbox-label';
    label.textContent = 'Torch';
    label.style.marginLeft = 'var(--space-2)';
    
    checkbox.addEventListener('change', async () => {
      try {
        await track.applyConstraints({ advanced: [{ torch: checkbox.checked }] });
      } catch (e) {
        console.error('Failed to apply torch:', e);
        checkbox.checked = !checkbox.checked;
      }
    });
    
    div.appendChild(checkbox);
    div.appendChild(label);
    panel.appendChild(div);
    
    cameraState.settingsControls.torch = { checkbox };
  }
  
  async function handleCameraSettingsReset() {
    const track = getCameraVideoTrack();
    if (!track || !cameraState.initialSettings) return;
    
    try {
      // Reset all settings to initial values
      const advanced = {};
      for (const [key, value] of Object.entries(cameraState.initialSettings)) {
        if (key !== 'torch') {
          advanced[key] = value;
        }
      }
      
      if (Object.keys(advanced).length > 0) {
        await track.applyConstraints({ advanced: [advanced] });
      }
      
      // Reset torch
      if (cameraState.settingsControls.torch?.checkbox) {
        cameraState.settingsControls.torch.checkbox.checked = cameraState.initialSettings.torch || false;
      }
      
      // Reset sliders UI
      for (const [key, controls] of Object.entries(cameraState.settingsControls)) {
        if (key !== 'torch' && controls.slider) {
          controls.slider.value = cameraState.initialSettings[key] || 0;
          if (controls.valueDisplay) {
            controls.valueDisplay.textContent = String(cameraState.initialSettings[key] || 0);
          }
        }
      }
      
      updateCameraStatus('Settings reset to defaults');
    } catch (e) {
      updateCameraStatus(`Reset failed: ${e.message}`);
    }
  }
  
  // ========================================================================
  // DISPLAY TRANSFORMS
  // ========================================================================
  
  function handleCameraMirrorChange() {
    cameraState.mirrorEnabled = elements.chkCameraMirror?.checked || false;
    applyDisplayTransforms();
  }
  
  function handleCameraRotateChange() {
    cameraState.rotateDegrees = parseInt(elements.cameraRotateSelect?.value || '0', 10);
    applyDisplayTransforms();
  }
  
  function applyDisplayTransforms() {
    if (!elements.cameraPreview) return;
    
    const transforms = [];
    
    if (cameraState.rotateDegrees !== 0) {
      transforms.push(`rotate(${cameraState.rotateDegrees}deg)`);
    }
    
    if (cameraState.mirrorEnabled) {
      transforms.push('scaleX(-1)');
    }
    
    elements.cameraPreview.style.transform = transforms.length > 0 ? transforms.join(' ') : '';
  }
  
  // ========================================================================
  // SESSION FOLDER
  // ========================================================================
  
  async function handleCameraSessionStart() {
    if (!window.showDirectoryPicker) {
      // Fallback: in-memory only session
      cameraState.sessionActive = true;
      cameraState.sessionDirHandle = null;
      cameraState.sessionLogWritable = null;
      cameraState.sessionLogLines = [];
      cameraState.sessionFolderName = 'in-memory-session-' + formatTimestamp(new Date());
      cameraState.sessionArtifactCount = 0;
      cameraState.sessionStartTime = Date.now();
      cameraState.artifactStats = { recording: { count: 0, bytes: 0 }, picture: { count: 0, bytes: 0 }, still: { count: 0, bytes: 0 } };
      
      if (elements.cameraSessionInfo) {
        elements.cameraSessionInfo.textContent = 'Session active (in-memory only): ' + cameraState.sessionFolderName + '\nFile System Access API not available - artifacts will download individually.';
      }
      if (elements.btnCameraSessionEnd) {
        elements.btnCameraSessionEnd.disabled = false;
      }
      if (elements.btnCameraSessionLog) {
        elements.btnCameraSessionLog.disabled = false;
      }
      
      logToConsole('[SESSION] Started (in-memory fallback)', 'note');
      appendToSessionLog('session start', 'Session started (in-memory only) - Device: ' + (getSelectedCameraLabel() || 'unknown') + ', Mode: ' + (elements.cameraModeSelect?.value || 'auto') + ', User Agent: ' + navigator.userAgent);
      updateFfmpegHelper();
      return;
    }
    
    try {
      const rootDirHandle = await window.showDirectoryPicker();
      const sessionFolderName = 'airiz-session-' + formatTimestamp(new Date());
      const sessionDirHandle = await rootDirHandle.getDirectoryHandle(sessionFolderName, { create: true });
      
      // Create session.log
      const logFileHandle = await sessionDirHandle.getFileHandle('session.log', { create: true });
      const logWritable = await logFileHandle.createWritable();
      
      cameraState.sessionActive = true;
      cameraState.sessionDirHandle = sessionDirHandle;
      cameraState.sessionLogWritable = logWritable;
      cameraState.sessionLogLines = [];
      cameraState.sessionFolderName = sessionFolderName;
      cameraState.sessionArtifactCount = 0;
      cameraState.sessionStartTime = Date.now();
      cameraState.artifactStats = { recording: { count: 0, bytes: 0 }, picture: { count: 0, bytes: 0 }, still: { count: 0, bytes: 0 } };
      
      if (elements.cameraSessionInfo) {
        elements.cameraSessionInfo.textContent = 'Session active: ' + sessionFolderName + '\n0 artefacts written';
      }
      if (elements.btnCameraSessionEnd) {
        elements.btnCameraSessionEnd.disabled = false;
      }
      if (elements.btnCameraSessionLog) {
        elements.btnCameraSessionLog.disabled = false;
      }
      
      logToConsole('[SESSION] Started: ' + sessionFolderName, 'note');
      appendToSessionLog('session start', 'Session started - Device: ' + (getSelectedCameraLabel() || 'unknown') + ', Mode: ' + (elements.cameraModeSelect?.value || 'auto') + ', User Agent: ' + navigator.userAgent);
      updateFfmpegHelper();
      
    } catch (error) {
      if (error.name === 'AbortError') {
        logToConsole('[SESSION] User cancelled folder picker', 'warning');
      } else {
        logToConsole('[SESSION] Failed to start: ' + error.message, 'error');
      }
    }
  }
  
  async function handleCameraSessionEnd() {
    if (!cameraState.sessionActive) {
      return;
    }
    
    // Close log writable if exists
    if (cameraState.sessionLogWritable) {
      try {
        await cameraState.sessionLogWritable.close();
      } catch (e) {}
      cameraState.sessionLogWritable = null;
    }
    
    const folderName = cameraState.sessionFolderName;
    const artifactCount = cameraState.sessionArtifactCount;
    const stats = cameraState.artifactStats;
    const totalBytes = stats.recording.bytes + stats.picture.bytes + stats.still.bytes;
    const totalCount = stats.recording.count + stats.picture.count + stats.still.count;
    const durationMs = Date.now() - cameraState.sessionStartTime;
    const durationMins = Math.floor(durationMs / 60000);
    const durationSecs = Math.floor((durationMs % 60000) / 1000);
    const durationStr = String(durationMins).padStart(2, '0') + ':' + String(durationSecs).padStart(2, '0');
    
    // Append session summary BEFORE session end
    const summaryLine = 'recordings: ' + stats.recording.count + ' (' + formatBytes(stats.recording.bytes) + '), pictures: ' + stats.picture.count + ' (' + formatBytes(stats.picture.bytes) + '), stills: ' + stats.still.count + ' (' + formatBytes(stats.still.bytes) + '), total: ' + totalCount + ' artifacts (' + formatBytes(totalBytes) + '), duration: ' + durationStr;
    appendToSessionLog('session summary', summaryLine);
    
    // Clear session state
    cameraState.sessionActive = false;
    cameraState.sessionDirHandle = null;
    cameraState.sessionFolderName = null;
    cameraState.sessionArtifactCount = 0;
    cameraState.sessionStartTime = null;
    
    if (elements.cameraSessionInfo) {
      elements.cameraSessionInfo.textContent = 'Session inactive. ' + (folderName ? ('Last session: ' + folderName + ', ' + artifactCount + ' artefacts.') : '');
    }
    if (elements.btnCameraSessionEnd) {
      elements.btnCameraSessionEnd.disabled = true;
    }
    if (elements.btnCameraSessionLog) {
      elements.btnCameraSessionLog.disabled = cameraState.sessionLogLines.length === 0;
    }
    
    logToConsole('[SESSION] Ended: ' + (folderName || 'in-memory'), 'note');
    appendToSessionLog('session end', 'Session ended - artefacts written: ' + totalCount);
    updateFfmpegHelper();
  }
  
  function handleCameraSessionLogDownload() {
    if (!cameraState.sessionActive && cameraState.sessionLogLines.length === 0) {
      return;
    }
    
    const content = cameraState.sessionLogLines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'session-' + formatTimestamp(new Date()) + '.log';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logToConsole('[SESSION] Log downloaded', 'note');
  }
  
  function appendToSessionLog(event, detail) {
    const timestamp = new Date();
    const line = '[' + timestamp.toISOString().replace('T', ' ').substring(0, 19) + '] ' + event.toUpperCase() + ' | ' + detail;
    
    // Always keep in memory
    cameraState.sessionLogLines.push(line);
    
    // Write to FSA if active
    if (cameraState.sessionActive && cameraState.sessionLogWritable) {
      cameraState.sessionLogWritable.write(line + '\n').catch(function(e) {
        console.error('Failed to write session log:', e);
        // Fall back to memory only
        cameraState.sessionLogWritable = null;
      });
    }
  }
  
  function getSelectedCameraLabel() {
    const select = elements.cameraDeviceSelect;
    if (!select || !select.selectedOptions || select.selectedOptions.length === 0) {
      return null;
    }
    return select.selectedOptions[0].label || null;
  }
  
  function incrementSessionArtifactCount() {
    if (cameraState.sessionActive) {
      cameraState.sessionArtifactCount++;
      if (elements.cameraSessionInfo && cameraState.sessionFolderName) {
        elements.cameraSessionInfo.textContent = 'Session active: ' + cameraState.sessionFolderName + '\n' + cameraState.sessionArtifactCount + ' artefact' + (cameraState.sessionArtifactCount !== 1 ? 's' : '') + ' written';
      }
    }
  }
  
  async function writeArtifactToSessionFolder(blob, filenamePrefix, extension) {
    if (!cameraState.sessionActive || !cameraState.sessionDirHandle) {
      return null; // Signal to use fallback download
    }
    
    try {
      const filename = filenamePrefix + '-' + formatTimestamp(new Date()) + extension;
      const fileHandle = await cameraState.sessionDirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      incrementSessionArtifactCount();
      return filename;
    } catch (e) {
      console.error('Failed to write artifact to session folder:', e);
      return null;
    }
  }
  
  // ========================================================================
  // FFMPEG HELPER
  // ========================================================================
  
  function updateFfmpegHelper() {
    if (!elements.cameraFfmpegCmd || !elements.cameraFfmpegNote) {
      return;
    }
    
    const deviceLabel = getSelectedCameraLabel() || '<camera name>';
    const cmd = 'ffmpeg -f dshow -i video="' + deviceLabel + '" -c:v libx264 -preset ultrafast -t 86400 airiz_%Y%m%d_%H%M%S.mp4';
    
    if (elements.cameraFfmpegCmd) {
      elements.cameraFfmpegCmd.value = cmd;
    }
    
    let noteText = 'Note: The browser\'s device label may differ from the Windows DirectShow name. Verify with:\nffmpeg -list_devices true -f dshow -i dummy';
    
    if (cameraState.sessionActive && cameraState.sessionFolderName) {
      noteText += '\n\nSession folder active: suggested output path: ' + cameraState.sessionFolderName + '/record-%Y%m%d_%H%M%S.mp4\n(Browser cannot reveal full absolute path.)';
    }
    
    if (elements.cameraFfmpegNote) {
      elements.cameraFfmpegNote.textContent = noteText;
    }
  }
  
  function handleCameraFfmpegCopy() {
    if (!elements.cameraFfmpegCmd) {
      return;
    }
    
    const cmdText = elements.cameraFfmpegCmd.value;
    
    // Clipboard with fallback
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmdText).then(function() {
        showFfmpegCopyFeedback('Copied!');
      }).catch(function(e) {
        fallbackCopy(cmdText);
      });
    } else {
      fallbackCopy(cmdText);
    }
    
    function fallbackCopy(text) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'readonly');
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      document.body.removeChild(textarea);
      showFfmpegCopyFeedback(ok ? 'Copied!' : 'Copy failed');
    }
    
    function showFfmpegCopyFeedback(text) {
      const btn = elements.btnCameraFfmpegCopy;
      const originalText = btn.textContent;
      btn.textContent = text;
      btn.disabled = true;
      setTimeout(function() {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 1500);
    }
  }
  
  // ========================================================================
  // DAY/NIGHT & LIGHTS CONTROL
  // ========================================================================
  
  async function handleDaylightFix() {
    logToConsole('Executing daylight fix...', 'note');
    await sendLine('diag irled off');
    await sleep(300);
    await sendLine('diag spotled off');
    await sleep(300);
    await sendLine('diag ircut day');
  }
  
  // ========================================================================
  // START
  // ========================================================================
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

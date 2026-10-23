/**
 * Ziris Motor Test Console — Application
 * Dependency-free browser app for ARLO ZIRIS device testing
 */

(function() {
  'use strict';

  // ========================================================================
  // STATE
  // ========================================================================
  
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
    userMacros: []
  };

  // ========================================================================
  // DOM ELEMENTS
  // ========================================================================
  
  const elements = {};
  
  function cacheElements() {
    // Header
    elements.fwVersion = document.getElementById('fw-version');
    elements.dataSource = document.getElementById('data-source');
    
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
    
    logToConsole('Ziris Motor Test Console initialized', 'welcome');
  }

  function renderHeader() {
    if (window.ZIRIS_COMMANDS && window.ZIRIS_COMMANDS.meta) {
      elements.fwVersion.textContent = window.ZIRIS_COMMANDS.meta.fwVersion;
      elements.dataSource.textContent = window.ZIRIS_COMMANDS.meta.source;
    }
  }

  function loadUserMacros() {
    try {
      const stored = localStorage.getItem('ziris.macros.v1');
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
      localStorage.setItem('ziris.macros.v1', JSON.stringify(state.userMacros));
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
              appendToConsole(text, 'response');
              
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
    }
  }

  function simulateDemoResponse(command) {
    // Find matching command in ZIRIS_COMMANDS
    let response = '';
    let found = false;
    
    if (window.ZIRIS_COMMANDS) {
      for (const group of window.ZIRIS_COMMANDS.groups) {
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
  }

  function logToConsole(text, type = 'response') {
    appendToConsole(text + '\n', type);
  }

  function clearConsole() {
    elements.consoleOutput.innerHTML = '<div class="console-line welcome">Ziris Motor Test Console — Ready</div>';
    state.consoleLines = [];
  }

  function saveLog() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ziris-log-${timestamp}.txt`;
    
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
    const commands = window.ZIRIS_COMMANDS || { groups: [] };
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
    const builtIn = window.ZIRIS_MACROS ? window.ZIRIS_MACROS.macros : [];
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
    ttl += `' Generated by Ziris Motor Test Console\n\n`;
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
  // START
  // ========================================================================
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

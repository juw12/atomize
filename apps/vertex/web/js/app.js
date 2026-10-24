/**
 * Vertex Cockpit UI — v2 with 4 Workspaces (Repair, Assembly, Build, Simulate)
 * Wires engine + viewport + controls
 * No inline handlers - addEventListener only
 */
(function() {
  'use strict';

  /* === State === */
  var currentReport = null;
  var currentDiagnosis = null;
  var currentRepairPlan = null;
  var currentAssemblySpec = null;
  var currentAssemblyPlan = null;
  var currentBuildSpec = null;
  var currentMesh = null;
  var currentSimResult = null;
  var isServerAvailable = false;

  /* Viewports */
  var repairView = null;
  var assemblyView = null;
  var buildView = null;
  var simulateView = null;

  /* === DOM Elements - Tabs (8 tabs) === */
  var tabRepair = document.getElementById('tab-repair');
  var tabAssembly = document.getElementById('tab-assembly');
  var tabBuild = document.getElementById('tab-build');
  var tabSimulate = document.getElementById('tab-simulate');
  var tabAnswers = document.getElementById('tab-answers');
  var tabReverse = document.getElementById('tab-reverse');
  var tabDrawing = document.getElementById('tab-drawing');
  var tabAutomation = document.getElementById('tab-automation');
  var repairPanel = document.getElementById('repair-panel');
  var assemblyPanel = document.getElementById('assembly-panel');
  var buildPanel = document.getElementById('build-panel');
  var simulatePanel = document.getElementById('simulate-panel');
  var answersPanel = document.getElementById('answers-panel');
  var reversePanel = document.getElementById('reverse-panel');
  var drawingPanel = document.getElementById('drawing-panel');
  var automationPanel = document.getElementById('automation-panel');

  /* === DOM Elements - Repair === */
  var btnLoadSample = document.getElementById('btn-load-sample');
  var btnPasteJson = document.getElementById('btn-paste-json');
  var fileInputReport = document.getElementById('file-input-report');
  var modalPasteReport = document.getElementById('modal-paste-report');
  var pasteReportJson = document.getElementById('paste-report-json');
  var btnCancelPasteReport = document.getElementById('btn-cancel-paste-report');
  var btnSubmitPasteReport = document.getElementById('btn-submit-paste-report');
  var diagnosisContent = document.getElementById('diagnosis-content');
  var repairPlanContent = document.getElementById('repair-plan-content');
  var btnDryRun = document.getElementById('btn-dry-run');
  var dryRunResults = document.getElementById('dry-run-results');
  var chkConfirmRepair = document.getElementById('chk-confirm-repair');
  var btnApplyRepair = document.getElementById('btn-apply-repair');

  /* === DOM Elements - Assembly === */
  var btnLoadAssemblySample = document.getElementById('btn-load-assembly-sample');
  var btnPasteAssemblyJson = document.getElementById('btn-paste-assembly-json');
  var fileInputAssembly = document.getElementById('file-input-assembly');
  var modalPasteAssembly = document.getElementById('modal-paste-assembly');
  var pasteAssemblyJson = document.getElementById('paste-assembly-json');
  var btnCancelPasteAssembly = document.getElementById('btn-cancel-paste-assembly');
  var btnSubmitPasteAssembly = document.getElementById('btn-submit-paste-assembly');
  var assemblyPlanContent = document.getElementById('assembly-plan-content');
  var assemblyChecksContent = document.getElementById('assembly-checks-content');
  var btnDryRunAssembly = document.getElementById('btn-dry-run-assembly');
  var dryRunResultsAssembly = document.getElementById('dry-run-results-assembly');
  var chkConfirmAssembly = document.getElementById('chk-confirm-assembly');
  var btnApplyAssembly = document.getElementById('btn-apply-assembly');

  /* === DOM Elements - Build === */
  var btnLoadBuildPreset = document.getElementById('btn-load-build-preset');
  var buildParamsContent = document.getElementById('build-params-content');
  var buildNameInput = document.getElementById('build-name');
  var buildLengthInput = document.getElementById('build-length');
  var buildWidthInput = document.getElementById('build-width');
  var buildThicknessInput = document.getElementById('build-thickness');
  var buildBoreInput = document.getElementById('build-bore');
  var buildMaterialSelect = document.getElementById('build-material');
  var btnExportStl = document.getElementById('btn-export-stl');
  var btnExportObj = document.getElementById('btn-export-obj');
  var btnExportGltf = document.getElementById('btn-export-gltf');
  var btnExport3mf = document.getElementById('btn-export-3mf');
  var btnExportDxf = document.getElementById('btn-export-dxf');
  var btnBuildPreview = document.getElementById('btn-build-preview');
  var buildResults = document.getElementById('build-results');
  var chkConfirmBuild = document.getElementById('chk-confirm-build');
  var btnExportBuild = document.getElementById('btn-export-build');

  /* === DOM Elements - Simulate === */
  var btnLoadSimSample = document.getElementById('btn-load-sim-sample');
  var simulateResultsContent = document.getElementById('simulate-results-content');
  var massCard = document.getElementById('mass-card');
  var massVolume = document.getElementById('mass-volume');
  var massMass = document.getElementById('mass-mass');
  var massDensity = document.getElementById('mass-density');
  var massParts = document.getElementById('mass-parts');
  var clearanceTableContainer = document.getElementById('clearance-table-container');
  var clearanceTableBody = document.getElementById('clearance-table-body');
  var motionScrubber = document.getElementById('motion-scrubber');
  var simPlayPauseBtn = document.getElementById('sim-play-pause');
  var simScrubberTrack = document.getElementById('sim-scrubber-track');
  var simScrubberFill = document.getElementById('sim-scrubber-fill');
  var simScrubberThumb = document.getElementById('sim-scrubber-thumb');
  var simTimeDisplay = document.getElementById('sim-time-display');
  var btnRunSimulation = document.getElementById('btn-run-simulation');
  var simulateResults = document.getElementById('simulate-results');

  /* === DOM Elements - Answers === */
  var answersQuestion = document.getElementById('answers-question');
  var btnAnswersAsk = document.getElementById('btn-answers-ask');
  var answersAnswerCard = document.getElementById('answers-answer-card');
  var answerKindBadge = document.getElementById('answer-kind-badge');
  var answerText = document.getElementById('answer-text');
  var answerEvidence = document.getElementById('answer-evidence');
  var answersPlaceholder = document.getElementById('answers-placeholder');

  /* === DOM Elements - Reverse === */
  var btnLoadScanSample = document.getElementById('btn-load-scan-sample');
  var reversePointsJson = document.getElementById('reverse-points-json');
  var btnReverseFit = document.getElementById('btn-reverse-fit');
  var reverseResults = document.getElementById('reverse-results');
  var btnReverseOpenBuild = document.getElementById('btn-reverse-open-build');
  var reverseView = null;

  /* === DOM Elements - Drawing === */
  var drawingTitle = document.getElementById('drawing-title');
  var drawingExtentsL = document.getElementById('drawing-extents-l');
  var drawingExtentsW = document.getElementById('drawing-extents-w');
  var drawingExtentsT = document.getElementById('drawing-extents-t');
  var drawingHolesJson = document.getElementById('drawing-holes-json');
  var btnDrawingGenerate = document.getElementById('btn-drawing-generate');
  var drawingResults = document.getElementById('drawing-results');
  var btnDrawingOpenBuild = document.getElementById('btn-drawing-open-build');
  var drawingView = null;

  /* === DOM Elements - Automation === */
  var btnAddAutomationOp = document.getElementById('btn-add-automation-op');
  var automationOpsEditor = document.getElementById('automation-ops-editor');
  var automationPlanResults = document.getElementById('automation-plan-results');
  var btnAutomationGenerate = document.getElementById('btn-automation-generate');
  var automationSummary = document.getElementById('automation-summary');
  var chkConfirmAutomation = document.getElementById('chk-confirm-automation');
  var btnAutomationRun = document.getElementById('btn-automation-run');

  /* === DOM Elements - Connector/Adapter Strip === */
  var connectorStrip = document.getElementById('connector-strip');
  var adaptersStrip = document.getElementById('adapters-strip');
  var modeBadge = document.getElementById('mode-badge');

  /* === DOM Elements - Guide Overlay === */
  var guideOverlay = document.getElementById('guide-overlay');
  var guideBackdrop = document.getElementById('guide-backdrop');
  var guideCloseBtn = document.getElementById('guide-close-btn');
  var guideGotItBtn = document.getElementById('guide-got-it-btn');
  var guideDontShowBtn = document.getElementById('guide-dont-show-btn');
  var btnGuide = document.getElementById('btn-guide');
  var btnHeroLearnMore = document.getElementById('btn-hero-learn-more');
  var lastFocusedElement = null;
  var GUIDE_STORAGE_KEY = 'vertex.guide.v1';

  /* === Initialize Viewports === */
  function initViewports() {
    var repairCanvas = document.getElementById('repair-viewport-canvas');
    var assemblyCanvas = document.getElementById('assembly-viewport-canvas');
    var buildCanvas = document.getElementById('build-viewport-canvas');
    var simulateCanvas = document.getElementById('simulate-viewport-canvas');
    var reverseCanvas = document.getElementById('reverse-viewport-canvas');
    var drawingCanvas = document.getElementById('drawing-viewport-canvas');
    var heroCanvas = document.getElementById('hero-viewport-canvas');

    if (repairCanvas && window.VertexView) {
      repairView = new window.VertexView(repairCanvas);
      setupViewportControls('repair', repairView);
    }
    if (assemblyCanvas && window.VertexView) {
      assemblyView = new window.VertexView(assemblyCanvas);
      setupViewportControls('assembly', assemblyView);
    }
    if (buildCanvas && window.VertexView) {
      buildView = new window.VertexView(buildCanvas);
      setupViewportControls('build', buildView);
    }
    if (simulateCanvas && window.VertexView) {
      simulateView = new window.VertexView(simulateCanvas);
      setupViewportControls('simulate', simulateView);
    }
    if (reverseCanvas && window.VertexView) {
      reverseView = new window.VertexView(reverseCanvas);
      setupViewportControls('reverse', reverseView);
    }
    if (drawingCanvas && window.VertexView) {
      drawingView = new window.VertexView(drawingCanvas);
      setupViewportControls('drawing', drawingView);
    }
    if (heroCanvas && window.VertexView) {
      var heroView = new window.VertexView(heroCanvas);
      setupViewportControls('hero', heroView);
    }
  }

  function setupViewportControls(prefix, view) {
    if (!view) return;
    var fitBtn = document.getElementById(prefix + '-view-fit');
    var resetBtn = document.getElementById(prefix + '-view-reset');
    if (fitBtn) {
      fitBtn.addEventListener('click', function() { view.fit(); });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', function() { view.reset(); });
    }
  }

  /* === Tab Switching (8 tabs) === */
  function switchTab(activeTab, activePanel) {
    var allTabs = [tabRepair, tabAssembly, tabBuild, tabSimulate, tabAnswers, tabReverse, tabDrawing, tabAutomation];
    var allPanels = [repairPanel, assemblyPanel, buildPanel, simulatePanel, answersPanel, reversePanel, drawingPanel, automationPanel];
    
    allTabs.forEach(function(tab) {
      if (tab) {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
      }
    });
    allPanels.forEach(function(panel) {
      if (panel) {
        panel.classList.remove('active');
      }
    });

    if (activeTab) {
      activeTab.classList.add('active');
      activeTab.setAttribute('aria-selected', 'true');
    }
    if (activePanel) {
      activePanel.classList.add('active');
    }

    /* Resize viewports after tab switch */
    setTimeout(function() {
      if (repairView) repairView._setupCanvas();
      if (assemblyView) assemblyView._setupCanvas();
      if (buildView) buildView._setupCanvas();
      if (simulateView) simulateView._setupCanvas();
      if (reverseView) reverseView._setupCanvas();
      if (drawingView) drawingView._setupCanvas();
    }, 100);
  }

  if (tabRepair) {
    tabRepair.addEventListener('click', function() { switchTab(tabRepair, repairPanel); });
  }
  if (tabAssembly) {
    tabAssembly.addEventListener('click', function() { switchTab(tabAssembly, assemblyPanel); });
  }
  if (tabBuild) {
    tabBuild.addEventListener('click', function() { switchTab(tabBuild, buildPanel); });
  }
  if (tabSimulate) {
    tabSimulate.addEventListener('click', function() { switchTab(tabSimulate, simulatePanel); });
  }
  if (tabAnswers) {
    tabAnswers.addEventListener('click', function() { switchTab(tabAnswers, answersPanel); });
  }
  if (tabReverse) {
    tabReverse.addEventListener('click', function() { switchTab(tabReverse, reversePanel); });
  }
  if (tabDrawing) {
    tabDrawing.addEventListener('click', function() { switchTab(tabDrawing, drawingPanel); });
  }
  if (tabAutomation) {
    tabAutomation.addEventListener('click', function() { switchTab(tabAutomation, automationPanel); });
  }

  /* === Connector/Adapter Status === */
  function fetchConnectorStatus() {
    /* Try to fetch adapters from server, fall back to Vertex.adapters() */
    fetch('./api/adapters')
      .then(function(res) {
        if (!res.ok) throw new Error('Server unavailable');
        return res.json();
      })
      .then(function(data) {
        isServerAvailable = true;
        renderAdapters(data.adapters || []);
      })
      .catch(function() {
        isServerAvailable = false;
        if (window.Vertex && window.Vertex.adapters) {
          renderAdapters(window.Vertex.adapters());
        } else {
          renderAdapters(getFallbackAdapters());
        }
      });
  }

  function getFallbackAdapters() {
    return [
      { id: 'freecad', name: 'FreeCAD', kind: 'cad', protocol: 'python-api', formats: ['FCStd', 'STEP'], available: false, notes: 'no host' },
      { id: 'blender', name: 'Blender', kind: 'mesh', protocol: 'python-api', formats: ['BLEND', 'OBJ'], available: false, notes: 'no host' },
      { id: 'formats', name: 'Formats', kind: 'format', protocol: 'file', formats: ['STL', 'OBJ', 'glTF', '3MF', 'DXF'], available: true }
    ];
  }

  function renderAdapters(adapters) {
    if (!adaptersStrip) return;
    adaptersStrip.innerHTML = '';
    adapters.forEach(function(adapter) {
      var chip = document.createElement('span');
      chip.className = 'adapter-chip ' + (adapter.available ? 'available' : 'unavailable');
      var formatsHtml = (adapter.formats || []).map(function(f) {
        return '<span class="format-chip">' + escapeHtml(f) + '</span>';
      }).join('');
      var notesHtml = (!adapter.available && adapter.notes) ? '<span style="color: var(--text-3); margin-left: 4px;">· ' + escapeHtml(adapter.notes) + '</span>' : '';
      chip.innerHTML = '<span class="adapter-name">' + escapeHtml(adapter.name) + '</span>' +
        '<span class="adapter-kind">' + escapeHtml(adapter.kind) + '</span>' +
        '<span class="adapter-formats">' + formatsHtml + '</span>' + notesHtml;
      adaptersStrip.appendChild(chip);
    });
  }

  /* === Repair Tab Actions === */
  if (btnLoadSample) {
    btnLoadSample.addEventListener('click', function() {
      if (isServerAvailable) {
        fetch('./api/report/sample')
          .then(function(res) {
            if (res.ok) return res.json();
            throw new Error('Server unavailable');
          })
          .then(function(report) {
            currentReport = report;
            processReport(currentReport);
          })
          .catch(function() {
            loadOfflineSample();
          });
      } else {
        loadOfflineSample();
      }
    });
  }

  function loadOfflineSample() {
    if (window.Vertex && window.Vertex.samples) {
      var samples = window.Vertex.samples();
      currentReport = samples.brokenBracket;
      processReport(currentReport);
    }
  }

  if (btnPasteJson) {
    btnPasteJson.addEventListener('click', function() {
      if (modalPasteReport) modalPasteReport.showModal();
    });
  }
  if (btnCancelPasteReport) {
    btnCancelPasteReport.addEventListener('click', function() {
      if (modalPasteReport) {
        modalPasteReport.close();
        pasteReportJson.value = '';
      }
    });
  }
  if (btnSubmitPasteReport) {
    btnSubmitPasteReport.addEventListener('click', function() {
      try {
        currentReport = JSON.parse(pasteReportJson.value);
        processReport(currentReport);
        if (modalPasteReport) modalPasteReport.close();
        pasteReportJson.value = '';
      } catch (e) {
        alert('Invalid JSON: ' + e.message);
      }
    });
  }
  if (fileInputReport) {
    fileInputReport.addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(evt) {
        try {
          currentReport = JSON.parse(evt.target.result);
          processReport(currentReport);
        } catch (err) {
          alert('Invalid JSON file: ' + err.message);
        }
      };
      reader.readAsText(file);
      fileInputReport.value = '';
    });
  }

  function processReport(report) {
    if (window.Vertex && window.Vertex.validateReport) {
      var validation = window.Vertex.validateReport(report);
      if (!validation.ok) {
        alert('Invalid report: ' + validation.errors.join(', '));
        return;
      }
    }

    if (window.Vertex && window.Vertex.diagnose) {
      currentDiagnosis = window.Vertex.diagnose(report);
      renderDiagnosis(currentDiagnosis);

      if (window.Vertex && window.Vertex.planRepair) {
        currentRepairPlan = window.Vertex.planRepair(report);
        renderRepairPlan(currentRepairPlan);
        if (btnDryRun) btnDryRun.disabled = false;
      }
    }
  }

  function renderDiagnosis(diagnosis) {
    if (!diagnosisContent) return;
    if (!diagnosis || !diagnosis.findings) {
      diagnosisContent.innerHTML = '<p class="placeholder">No findings</p>';
      return;
    }

    var bySeverity = { high: [], med: [], low: [] };
    diagnosis.findings.forEach(function(f) {
      if (bySeverity[f.severity]) bySeverity[f.severity].push(f);
    });

    var html = '';
    ['high', 'med', 'low'].forEach(function(sev) {
      var findings = bySeverity[sev];
      if (!findings || findings.length === 0) return;

      html += '<div class="findings-group">';
      html += '<div class="findings-group-title ' + sev + '">' + sev.toUpperCase() + ' (' + findings.length + ')</div>';

      findings.forEach(function(f) {
        html += '<div class="finding-item">';
        html += '<div class="finding-header">';
        html += '<span class="finding-id">' + escapeHtml(f.id) + '</span>';
        html += '<span class="finding-severity ' + sev + '">' + sev + '</span>';
        html += '</div>';
        html += '<div class="finding-message">' + escapeHtml(f.message) + '</div>';
        if (f.rootCause) {
          html += '<div class="finding-detail"><strong>Root cause:</strong> ' + escapeHtml(f.rootCause) + '</div>';
        }
        if (f.fix) {
          html += '<div class="finding-detail"><strong>Fix:</strong> ' + escapeHtml(f.fix) + '</div>';
        }
        html += '</div>';
      });

      html += '</div>';
    });

    if (diagnosis.summary) {
      html += '<div style="margin-top: 1rem; padding: 0.5rem; background: var(--raised); border-radius: 4px; font-family: var(--font-mono); font-size: 0.75rem;">';
      html += 'Summary: ' + diagnosis.summary.total + ' total';
      if (diagnosis.summary.high) html += ' · <span style="color: var(--err)">High: ' + diagnosis.summary.high + '</span>';
      if (diagnosis.summary.med) html += ' · <span style="color: var(--warn)">Med: ' + diagnosis.summary.med + '</span>';
      if (diagnosis.summary.low) html += ' · <span style="color: var(--ok)">Low: ' + diagnosis.summary.low + '</span>';
      html += '</div>';
    }

    diagnosisContent.innerHTML = html || '<p class="placeholder">No findings</p>';
  }

  function renderRepairPlan(plan) {
    if (!repairPlanContent) return;
    if (!plan || !plan.steps) {
      repairPlanContent.innerHTML = '<p class="placeholder">No repair plan</p>';
      return;
    }

    var html = '<ul class="plan-steps">';
    plan.steps.forEach(function(step) {
      html += '<li class="plan-step">';
      html += '<span class="step-order">' + step.order + '</span>';
      html += '<div class="step-content">';
      html += '<div class="step-action">' + escapeHtml(step.action) + ' → ' + escapeHtml(step.target) + '</div>';
      html += '<div class="step-reason">' + escapeHtml(step.reason) + '</div>';
      html += '</div>';
      html += '</li>';
    });
    html += '</ul>';

    if (plan.unrealized && plan.unrealized.length > 0) {
      html += '<div class="unrealized-list">';
      html += '<div class="unrealized-list-title">Unrealized (still broken)</div>';
      html += '<div style="font-family: var(--font-mono); font-size: 0.75rem;">' + escapeHtml(plan.unrealized.join(', ')) + '</div>';
      html += '</div>';
    }

    repairPlanContent.innerHTML = html;
  }

  if (btnDryRun) {
    btnDryRun.addEventListener('click', function() {
      if (!currentRepairPlan || !window.Vertex || !window.Vertex.dryRun) return;

      var result = window.Vertex.dryRun(currentRepairPlan);
      renderDryRunResults(result, dryRunResults);

      if (chkConfirmRepair) {
        chkConfirmRepair.disabled = !result.ok;
        chkConfirmRepair.checked = false;
      }
      if (btnApplyRepair) btnApplyRepair.disabled = true;

      if (result.ok && chkConfirmRepair) {
        chkConfirmRepair.disabled = false;
      }
    });
  }

  function renderDryRunResults(result, container) {
    if (!container) return;
    if (!result) {
      container.textContent = '';
      return;
    }

    var html = '';
    if (result.ok) {
      html += '<span style="color: var(--ok)">✓ Ready to apply</span>';
      if (result.wouldApply && result.wouldApply.length > 0) {
        html += ' · ' + result.wouldApply.length + ' operation(s)';
      }
    } else {
      html += '<span style="color: var(--err)">✗ Blocked</span>';
      if (result.blocked && result.blocked.length > 0) {
        html += ': ' + escapeHtml(result.blocked.join(', '));
      }
    }
    container.innerHTML = html;
  }

  if (chkConfirmRepair) {
    chkConfirmRepair.addEventListener('change', function() {
      if (btnApplyRepair) btnApplyRepair.disabled = !chkConfirmRepair.checked;
    });
  }

  if (btnApplyRepair) {
    btnApplyRepair.addEventListener('click', function() {
      if (!currentRepairPlan) return;

      var ops = currentRepairPlan.steps.map(function(s) {
        return '  • ' + s.action + ' ' + s.target;
      }).join('\n');

      alert('Simulation mode: No live CAD host connected.\n\nIn simulation, nothing is written to CAD.\n\nOperations that would apply:\n' + ops);
    });
  }

  /* === Assembly Tab Actions === */
  if (btnLoadAssemblySample) {
    btnLoadAssemblySample.addEventListener('click', function() {
      if (isServerAvailable) {
        fetch('./api/assembly/sample')
          .then(function(res) {
            if (res.ok) return res.json();
            throw new Error('Server unavailable');
          })
          .then(function(spec) {
            currentAssemblySpec = spec;
            processAssemblySpec(currentAssemblySpec);
          })
          .catch(function() {
            loadOfflineAssemblySample();
          });
      } else {
        loadOfflineAssemblySample();
      }
    });
  }

  function loadOfflineAssemblySample() {
    if (window.Vertex && window.Vertex.samples) {
      var samples = window.Vertex.samples();
      currentAssemblySpec = samples.gearbox;
      processAssemblySpec(currentAssemblySpec);
    }
  }

  if (btnPasteAssemblyJson) {
    btnPasteAssemblyJson.addEventListener('click', function() {
      if (modalPasteAssembly) modalPasteAssembly.showModal();
    });
  }
  if (btnCancelPasteAssembly) {
    btnCancelPasteAssembly.addEventListener('click', function() {
      if (modalPasteAssembly) {
        modalPasteAssembly.close();
        pasteAssemblyJson.value = '';
      }
    });
  }
  if (btnSubmitPasteAssembly) {
    btnSubmitPasteAssembly.addEventListener('click', function() {
      try {
        currentAssemblySpec = JSON.parse(pasteAssemblyJson.value);
        processAssemblySpec(currentAssemblySpec);
        if (modalPasteAssembly) modalPasteAssembly.close();
        pasteAssemblyJson.value = '';
      } catch (e) {
        alert('Invalid JSON: ' + e.message);
      }
    });
  }
  if (fileInputAssembly) {
    fileInputAssembly.addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(evt) {
        try {
          currentAssemblySpec = JSON.parse(evt.target.result);
          processAssemblySpec(currentAssemblySpec);
        } catch (err) {
          alert('Invalid JSON file: ' + err.message);
        }
      };
      reader.readAsText(file);
      fileInputAssembly.value = '';
    });
  }

  function processAssemblySpec(spec) {
    if (window.Vertex && window.Vertex.planAssembly) {
      currentAssemblyPlan = window.Vertex.planAssembly(spec);
      renderAssemblyPlan(currentAssemblyPlan);
      renderAssemblyChecks(currentAssemblyPlan);
      if (btnDryRunAssembly) btnDryRunAssembly.disabled = false;
    }
  }

  function renderAssemblyPlan(plan) {
    if (!assemblyPlanContent) return;
    if (!plan) {
      assemblyPlanContent.innerHTML = '<p class="placeholder">No assembly plan</p>';
      return;
    }

    var html = '<div class="assembly-header">';
    html += '<div class="assembly-name">' + escapeHtml(plan.name || 'Unnamed Assembly') + '</div>';
    html += '<div class="assembly-meta">';
    html += 'Base: ' + escapeHtml(plan.base) + ' · ';
    html += 'Parts: ' + (plan.partCount || 0) + ' · ';
    html += 'Mates: ' + (plan.mateCount || 0);
    html += '</div></div>';

    html += '<ul class="assembly-steps">';
    if (plan.steps) {
      plan.steps.forEach(function(step) {
        var opClass = step.op === 'insert' ? 'op-insert' : 'op-mate';
        html += '<li class="assembly-step ' + opClass + '">';
        html += '<span class="step-number">' + (step.n || step.order) + '</span>';
        if (step.op === 'insert') {
          html += '<span>INSERT ' + escapeHtml(step.part) + '</span>';
        } else if (step.op === 'mate') {
          html += '<span>MATE ' + escapeHtml(step.type) + ' (' + escapeHtml(step.a) + ' ↔ ' + escapeHtml(step.b) + ')</span>';
        }
        html += '</li>';
      });
    }
    html += '</ul>';

    assemblyPlanContent.innerHTML = html;
  }

  function renderAssemblyChecks(plan) {
    if (!assemblyChecksContent) return;
    if (!plan || !plan.checks || plan.checks.length === 0) {
      assemblyChecksContent.innerHTML = '<p class="placeholder">No checks</p>';
      return;
    }

    var html = '';
    plan.checks.forEach(function(check) {
      html += '<div class="check-item">';
      html += '<span class="check-severity ' + check.severity + '"></span>';
      html += '<div class="check-content">';
      html += '<div class="check-message">';
      html += '[' + check.severity.toUpperCase() + '] ';
      html += escapeHtml(check.kind) + ': ' + escapeHtml(check.message);
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });

    assemblyChecksContent.innerHTML = html;
  }

  if (btnDryRunAssembly) {
    btnDryRunAssembly.addEventListener('click', function() {
      if (!currentAssemblyPlan || !window.Vertex || !window.Vertex.dryRun) return;

      var result = window.Vertex.dryRun(currentAssemblyPlan);
      renderDryRunResults(result, dryRunResultsAssembly);

      if (chkConfirmAssembly) {
        chkConfirmAssembly.disabled = !result.ok;
        chkConfirmAssembly.checked = false;
      }
      if (btnApplyAssembly) btnApplyAssembly.disabled = true;

      if (result.ok && chkConfirmAssembly) {
        chkConfirmAssembly.disabled = false;
      }
    });
  }

  if (chkConfirmAssembly) {
    chkConfirmAssembly.addEventListener('change', function() {
      if (btnApplyAssembly) btnApplyAssembly.disabled = !chkConfirmAssembly.checked;
    });
  }

  if (btnApplyAssembly) {
    btnApplyAssembly.addEventListener('click', function() {
      if (!currentAssemblyPlan) return;

      var ops = [];
      currentAssemblyPlan.steps.forEach(function(s) {
        if (s.op === 'insert') ops.push('Insert ' + s.part);
        else if (s.op === 'mate') ops.push('Mate ' + s.type + ' (' + s.a + '-' + s.b + ')');
      });

      alert('Simulation mode: No live CAD host connected.\n\nIn simulation, nothing is written to CAD.\n\nOperations that would apply:\n' + ops.join('\n'));
    });
  }

  /* === Build Tab Actions === */
  if (btnLoadBuildPreset) {
    btnLoadBuildPreset.addEventListener('click', function() {
      if (window.Vertex && window.Vertex.samples) {
        var samples = window.Vertex.samples();
        var flange = samples.flange;
        if (flange && flange.params) {
          if (buildLengthInput) buildLengthInput.value = flange.params.L || 80;
          if (buildWidthInput) buildWidthInput.value = flange.params.W || 40;
          if (buildThicknessInput) buildThicknessInput.value = flange.params.T || 6;
          if (buildBoreInput) buildBoreInput.value = flange.params.boreR || 4;
        }
      }
    });
  }

  function getBuildSpec() {
    var name = buildNameInput ? buildNameInput.value : 'Mount flange';
    var L = parseFloat(buildLengthInput ? buildLengthInput.value : '80') || 80;
    var W = parseFloat(buildWidthInput ? buildWidthInput.value : '40') || 40;
    var T = parseFloat(buildThicknessInput ? buildThicknessInput.value : '6') || 6;
    var boreR = parseFloat(buildBoreInput ? buildBoreInput.value : '4') || 4;
    var material = buildMaterialSelect ? buildMaterialSelect.value : 'aluminium';

    var density = 2.70;
    if (material === 'steel') density = 7.85;
    else if (material === 'titanium') density = 4.43;
    else if (material === 'plastic') density = 1.04;

    return {
      schema: 'vertex/build-spec/v1',
      name: name,
      units: 'mm',
      material: { name: material === 'aluminium' ? 'Aluminium 6061' : material.charAt(0).toUpperCase() + material.slice(1), density: density },
      params: { L: L, W: W, T: T, boreR: boreR },
      solids: [
        { id: 's1', type: 'box', x: 0, y: 0, z: 0, params: { dx: 'L', dy: 'W', dz: 'T' } }
      ],
      holes: [
        { id: 'h1', type: 'cylinder', x: 0, y: 0, z: 0, params: { r: 'boreR', h: 'T' } }
      ]
    };
  }

  if (btnBuildPreview) {
    btnBuildPreview.addEventListener('click', function() {
      if (!window.Vertex || !window.Vertex.buildMesh) {
        if (buildResults) buildResults.innerHTML = '<span style="color: var(--warn)">Build not available offline</span>';
        return;
      }

      currentBuildSpec = getBuildSpec();
      try {
        currentMesh = window.Vertex.buildMesh(currentBuildSpec);
        if (buildView && currentMesh) {
          buildView.setMesh(currentMesh);
          buildView.fit();
        }
        if (buildResults) {
          buildResults.innerHTML = '<span style="color: var(--ok)">✓ Mesh generated: ' + (currentMesh.triangles || 0) + ' triangles</span>';
        }
        if (chkConfirmBuild) chkConfirmBuild.disabled = false;
        if (btnExportBuild) btnExportBuild.disabled = false;
      } catch (e) {
        if (buildResults) buildResults.innerHTML = '<span style="color: var(--err)">✗ Build failed: ' + escapeHtml(e.message) + '</span>';
      }
    });
  }

  /* Export buttons */
  function downloadFile(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (btnExportStl) {
    btnExportStl.addEventListener('click', function() {
      if (!currentMesh || !window.Vertex || !window.Vertex.exportSTL) return;
      var stl = window.Vertex.exportSTL(currentMesh, { binary: false, name: 'part' });
      downloadFile(stl, 'part.stl', 'application/sla');
    });
  }
  if (btnExportObj) {
    btnExportObj.addEventListener('click', function() {
      if (!currentMesh || !window.Vertex || !window.Vertex.exportOBJ) return;
      var obj = window.Vertex.exportOBJ(currentMesh);
      downloadFile(obj, 'part.obj', 'application/octet-stream');
    });
  }
  if (btnExportGltf) {
    btnExportGltf.addEventListener('click', function() {
      if (!currentMesh || !window.Vertex || !window.Vertex.exportGLTF) return;
      var gltf = window.Vertex.exportGLTF(currentMesh);
      downloadFile(gltf, 'part.gltf', 'model/gltf+json');
    });
  }
  if (btnExport3mf) {
    btnExport3mf.addEventListener('click', function() {
      if (!currentMesh || !window.Vertex || !window.Vertex.export3MF) return;
      var data = window.Vertex.export3MF(currentMesh);
      /* For binary, create blob */
      var blob = new Blob([data], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'part.3mf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
  if (btnExportDxf) {
    btnExportDxf.addEventListener('click', function() {
      if (!currentMesh || !window.Vertex || !window.Vertex.exportDXF) return;
      var dxf = window.Vertex.exportDXF(currentMesh);
      downloadFile(dxf, 'part.dxf', 'application/dxf');
    });
  }

  if (chkConfirmBuild) {
    chkConfirmBuild.addEventListener('change', function() {
      if (btnExportBuild) btnExportBuild.disabled = !chkConfirmBuild.checked;
    });
  }

  if (btnExportBuild) {
    btnExportBuild.addEventListener('click', function() {
      if (!currentMesh) return;
      alert('Exporting all formats...\n\nIn a full implementation, this would download STL, OBJ, glTF, 3MF, and DXF files.');
    });
  }

  /* === Simulate Tab Actions === */
  if (btnLoadSimSample) {
    btnLoadSimSample.addEventListener('click', function() {
      runSimulation();
    });
  }

  if (btnRunSimulation) {
    btnRunSimulation.addEventListener('click', function() {
      runSimulation();
    });
  }

  function runSimulation() {
    if (!window.Vertex || !window.Vertex.samples || !window.Vertex.simulate) {
      if (simulateResultsContent) {
        simulateResultsContent.innerHTML = '<p class="placeholder">Simulation not available offline</p>';
      }
      return;
    }

    var samples = window.Vertex.samples();
    var gearbox = samples.gearbox;
    if (!gearbox) {
      if (simulateResultsContent) {
        simulateResultsContent.innerHTML = '<p class="placeholder">No gearbox sample</p>';
      }
      return;
    }

    try {
      currentSimResult = window.Vertex.simulate(gearbox);
      renderSimResults(currentSimResult);
    } catch (e) {
      if (simulateResultsContent) {
        simulateResultsContent.innerHTML = '<p class="placeholder">Simulation error: ' + escapeHtml(e.message) + '</p>';
      }
    }
  }

  function renderSimResults(sim) {
    if (!sim) return;

    /* Mass properties */
    if (massCard) {
      massCard.style.display = 'block';
      if (sim.mass) {
        if (massVolume) massVolume.textContent = (sim.mass.volume_mm3 || 0).toFixed(1);
        if (massMass) massMass.textContent = (sim.mass.mass_g || 0).toFixed(2);
        if (massDensity) massDensity.textContent = sim.mass.material || '—';
      }
      if (sim.summary && massParts) {
        massParts.textContent = sim.summary.parts || 0;
      }
    }

    /* Clearance table */
    if (clearanceTableContainer && clearanceTableBody) {
      clearanceTableContainer.style.display = 'block';
      clearanceTableBody.innerHTML = '';
      if (sim.clearance && sim.clearance.length > 0) {
        sim.clearance.forEach(function(c) {
          var row = document.createElement('tr');
          row.className = 'clearance-row ' + (c.verdict === 'clear' ? 'clear' : 'interfere');
          row.innerHTML = '<td>' + escapeHtml(c.a) + '</td>' +
            '<td>' + escapeHtml(c.b) + '</td>' +
            '<td>' + (c.gap_mm || 0).toFixed(2) + '</td>' +
            '<td><span class="verdict-chip ' + (c.verdict === 'clear' ? 'clear' : 'interfere') + '">' + c.verdict + '</span></td>';
          clearanceTableBody.appendChild(row);
        });
      }
    }

    /* Motion scrubber */
    if (motionScrubber && sim.motion && sim.motion.length > 0) {
      motionScrubber.style.display = 'block';
      setupMotionScrubber(sim);
    }

    /* Update viewport with sim */
    if (simulateView) {
      /* Create a simple mesh for visualization */
      var mockMesh = createMockMeshFromSim(sim);
      simulateView.setMesh(mockMesh);
      simulateView.setSim(sim);
      simulateView.fit();
    }

    if (simulateResultsContent) {
      simulateResultsContent.innerHTML = '<p style="color: var(--ok);">✓ Simulation complete</p>' +
        '<p style="font-size: 0.75rem; color: var(--text-2); margin-top: 0.5rem;">DOF: ' + (sim.dof || 0) + ' · Interferences: ' + (sim.summary ? sim.summary.interferences : 0) + '</p>';
    }
  }

  function createMockMeshFromSim(sim) {
    /* Create a simple visualization mesh */
    return {
      schema: 'vertex/mesh/v1',
      parts: [
        {
          id: 'housing',
          type: 'box',
          vertices: [
            [-20, -20, -10], [20, -20, -10], [20, 20, -10], [-20, 20, -10],
            [-20, -20, 10], [20, -20, 10], [20, 20, 10], [-20, 20, 10]
          ],
          triangles: [
            [0, 1, 2], [0, 2, 3],
            [4, 6, 5], [4, 7, 6],
            [0, 4, 5], [0, 5, 1],
            [2, 6, 7], [2, 7, 3],
            [1, 5, 6], [1, 6, 2],
            [3, 7, 4], [3, 4, 0]
          ]
        }
      ],
      bounds: { min: [-20, -20, -10], max: [20, 20, 10] },
      triangles: 12
    };
  }

  function setupMotionScrubber(sim) {
    var isDragging = false;
    var currentTime = 0;

    function updateTime(t) {
      currentTime = Math.max(0, Math.min(1, t));
      if (simScrubberFill) simScrubberFill.style.width = (currentTime * 100) + '%';
      if (simScrubberThumb) simScrubberThumb.style.left = (currentTime * 100) + '%';
      if (simTimeDisplay) simTimeDisplay.textContent = currentTime.toFixed(2);
      if (simulateView) {
        simulateView.setTime(currentTime);
      }
    }

    if (simScrubberTrack) {
      simScrubberTrack.addEventListener('mousedown', function(e) {
        isDragging = true;
        updateFromMouse(e);
      });
      window.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        updateFromMouse(e);
      });
      window.addEventListener('mouseup', function() {
        isDragging = false;
      });

      function updateFromMouse(e) {
        var rect = simScrubberTrack.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var t = x / rect.width;
        updateTime(t);
      }
    }

    if (simPlayPauseBtn) {
      simPlayPauseBtn.addEventListener('click', function() {
        if (simulateView && simulateView.isPlaying) {
          simulateView.pause();
          simPlayPauseBtn.textContent = '▶';
          simPlayPauseBtn.classList.remove('active');
        } else {
          if (simulateView) {
            simulateView.play();
            simPlayPauseBtn.textContent = '⏸';
            simPlayPauseBtn.classList.add('active');
          }
        }
      });
    }
  }

  /* === New Tab Handlers === */
  
  /* Answers Tab */
  function askQuestion(question) {
    if (!answersQuestion || !answersAnswerCard || !answerText) return;
    if (!window.Vertex || !window.Vertex.answer) {
      if (answerText) answerText.textContent = 'Answers engine not available offline';
      return;
    }
    
    var report = currentReport;
    var result = window.Vertex.answer(report, question);
    
    if (result) {
      if (answerKindBadge) answerKindBadge.textContent = result.kind || 'UNKNOWN';
      if (answerText) answerText.textContent = result.answer || 'No answer available';
      if (answerEvidence) {
        if (result.evidence && result.evidence.length > 0) {
          answerEvidence.innerHTML = '<strong>Evidence:</strong> ' + escapeHtml(result.evidence.join(', '));
        } else {
          answerEvidence.textContent = '';
        }
      }
      if (answersAnswerCard) answersAnswerCard.style.display = 'block';
      if (answersPlaceholder) answersPlaceholder.style.display = 'none';
    }
  }
  
  if (btnAnswersAsk) {
    btnAnswersAsk.addEventListener('click', function() {
      if (answersQuestion) askQuestion(answersQuestion.value);
    });
  }
  
  /* Answer chips */
  document.addEventListener('click', function(e) {
    if (e.target && e.target.classList.contains('answer-chip')) {
      var question = e.target.getAttribute('data-question');
      if (question && answersQuestion) {
        answersQuestion.value = question;
        askQuestion(question);
      }
    }
  });
  
  /* Reverse Tab */
  if (btnLoadScanSample) {
    btnLoadScanSample.addEventListener('click', function() {
      if (reversePointsJson) {
        var sample = { schema: 'vertex/scan/v1', points: [[0,0,0],[20,0,0],[20,20,0],[0,20,0],[10,10,15]] };
        reversePointsJson.value = JSON.stringify(sample, null, 2);
      }
    });
  }
  
  if (btnReverseFit) {
    btnReverseFit.addEventListener('click', function() {
      if (!reversePointsJson || !window.Vertex || !window.Vertex.reverse) {
        if (reverseResults) reverseResults.innerHTML = '<span style="color: var(--warn)">Reverse engine not available</span>';
        return;
      }
      
      try {
        var scanData = JSON.parse(reversePointsJson.value);
        var buildSpec = window.Vertex.reverse(scanData);
        
        if (reverseResults) {
          reverseResults.innerHTML = '<span style="color: var(--ok)">✓ Fit successful: ' + escapeHtml(buildSpec.name) + '</span>';
        }
        if (btnReverseOpenBuild) btnReverseOpenBuild.disabled = false;
        
        /* Store for "Open in Build" */
        window._reverseBuildSpec = buildSpec;
        
        /* Show in viewport */
        if (reverseView && window.Vertex && window.Vertex.buildMesh) {
          var mesh = window.Vertex.buildMesh(buildSpec);
          reverseView.setMesh(mesh);
          reverseView.fit();
        }
      } catch (e) {
        if (reverseResults) reverseResults.innerHTML = '<span style="color: var(--err)">✗ Fit failed: ' + escapeHtml(e.message) + '</span>';
      }
    });
  }
  
  if (btnReverseOpenBuild) {
    btnReverseOpenBuild.addEventListener('click', function() {
      if (window._reverseBuildSpec) {
        /* Switch to Build tab */
        if (tabBuild) tabBuild.click();
        /* Populate build params from reverse result */
        var spec = window._reverseBuildSpec;
        if (spec && spec.params) {
          if (buildLengthInput && spec.params.L) buildLengthInput.value = spec.params.L;
          if (buildWidthInput && spec.params.W) buildWidthInput.value = spec.params.W;
          if (buildThicknessInput && spec.params.T) buildThicknessInput.value = spec.params.T;
        }
      }
    });
  }
  
  /* Drawing Tab */
  if (btnDrawingGenerate) {
    btnDrawingGenerate.addEventListener('click', function() {
      if (!window.Vertex || !window.Vertex.fromDrawing) {
        if (drawingResults) drawingResults.innerHTML = '<span style="color: var(--warn)">Drawing engine not available</span>';
        return;
      }
      
      try {
        var drawing = {
          schema: 'vertex/drawing/v1',
          title: drawingTitle ? drawingTitle.value : 'Drawing part',
          units: 'mm',
          extents: {
            L: drawingExtentsL ? parseFloat(drawingExtentsL.value) : 80,
            W: drawingExtentsW ? parseFloat(drawingExtentsW.value) : 40,
            T: drawingExtentsT ? parseFloat(drawingExtentsT.value) : 6
          },
          holes: []
        };
        
        if (drawingHolesJson && drawingHolesJson.value.trim()) {
          drawing.holes = JSON.parse(drawingHolesJson.value);
        }
        
        var buildSpec = window.Vertex.fromDrawing(drawing);
        
        if (drawingResults) {
          drawingResults.innerHTML = '<span style="color: var(--ok)">✓ Generated: ' + escapeHtml(buildSpec.name) + ' (' + buildSpec.holes.length + ' holes)</span>';
        }
        if (btnDrawingOpenBuild) btnDrawingOpenBuild.disabled = false;
        
        window._drawingBuildSpec = buildSpec;
        
        /* Show in viewport */
        if (drawingView && window.Vertex && window.Vertex.buildMesh) {
          var mesh = window.Vertex.buildMesh(buildSpec);
          drawingView.setMesh(mesh);
          drawingView.fit();
        }
      } catch (e) {
        if (drawingResults) drawingResults.innerHTML = '<span style="color: var(--err)">✗ Generate failed: ' + escapeHtml(e.message) + '</span>';
      }
    });
  }
  
  if (btnDrawingOpenBuild) {
    btnDrawingOpenBuild.addEventListener('click', function() {
      if (window._drawingBuildSpec) {
        if (tabBuild) tabBuild.click();
        var spec = window._drawingBuildSpec;
        if (spec && spec.params) {
          if (buildNameInput && spec.name) buildNameInput.value = spec.name;
          if (buildLengthInput && spec.params.L) buildLengthInput.value = spec.params.L;
          if (buildWidthInput && spec.params.W) buildWidthInput.value = spec.params.W;
          if (buildThicknessInput && spec.params.T) buildThicknessInput.value = spec.params.T;
        }
      }
    });
  }
  
  /* Automation Tab */
  var automationOpCount = 1;
  
  if (btnAddAutomationOp) {
    btnAddAutomationOp.addEventListener('click', function() {
      if (!automationOpsEditor) return;
      var idx = automationOpCount++;
      var opRow = document.createElement('div');
      opRow.className = 'automation-op-row';
      opRow.innerHTML = 
        '<select class="automation-op-type" data-op-index="' + idx + '">' +
          '<option value="export">Export</option>' +
          '<option value="pattern">Pattern</option>' +
          '<option value="sheets">Sheets</option>' +
        '</select>' +
        '<input type="text" class="automation-op-name" placeholder="Name" value="op' + idx + '">' +
        '<input type="number" class="automation-op-count" placeholder="Count" value="1" min="1">' +
        '<button class="btn btn-secondary btn-small automation-op-remove">Remove</button>';
      automationOpsEditor.appendChild(opRow);
    });
  }
  
  /* Remove op row */
  document.addEventListener('click', function(e) {
    if (e.target && e.target.classList.contains('automation-op-remove')) {
      var row = e.target.closest('.automation-op-row');
      if (row && automationOpsEditor) automationOpsEditor.removeChild(row);
    }
  });
  
  if (btnAutomationGenerate) {
    btnAutomationGenerate.addEventListener('click', function() {
      if (!window.Vertex || !window.Vertex.automate) {
        if (automationSummary) automationSummary.innerHTML = '<span style="color: var(--warn)">Automation engine not available</span>';
        return;
      }
      
      /* Gather ops from editor */
      var ops = [];
      var opRows = automationOpsEditor.querySelectorAll('.automation-op-row');
      opRows.forEach(function(row) {
        var typeSelect = row.querySelector('.automation-op-type');
        var nameInput = row.querySelector('.automation-op-name');
        var countInput = row.querySelector('.automation-op-count');
        if (typeSelect && nameInput && countInput) {
          ops.push({
            op: typeSelect.value,
            name: nameInput.value,
            count: parseInt(countInput.value) || 1
          });
        }
      });
      
      var batch = { schema: 'vertex/batch/v1', ops: ops };
      
      try {
        var plan = window.Vertex.automate(batch);
        
        /* Render plan steps */
        var html = '';
        if (plan.steps && plan.steps.length > 0) {
          plan.steps.forEach(function(step) {
            html += '<div class="automation-plan-step">' +
              '<span class="automation-step-number">' + (step.n || step.order) + '</span>' +
              '<span>' + escapeHtml(step.op.toUpperCase()) + ' ' + escapeHtml(step.name || '') + 
                (step.count ? ' ×' + step.count : '') + 
                (step.formats ? ' → ' + step.formats.join(', ') : '') +
              '</span>' +
            '</div>';
          });
        }
        
        /* Summary */
        if (plan.summary) {
          html += '<div class="automation-summary-card">' +
            '<div class="automation-summary-item">' +
              '<div class="automation-summary-value">' + (plan.summary.ops || 0) + '</div>' +
              '<div class="automation-summary-label">Operations</div>' +
            '</div>' +
            '<div class="automation-summary-item">' +
              '<div class="automation-summary-value">' + (plan.summary.instances || 0) + '</div>' +
              '<div class="automation-summary-label">Instances</div>' +
            '</div>' +
            '<div class="automation-summary-item">' +
              '<div class="automation-summary-value">' + (plan.summary.exports || 0) + '</div>' +
              '<div class="automation-summary-label">Exports</div>' +
            '</div>' +
          '</div>';
        }
        
        if (automationPlanResults) automationPlanResults.innerHTML = html || '<p class="placeholder">No operations</p>';
        
        if (automationSummary) {
          automationSummary.innerHTML = '<span style="color: var(--ok)">✓ Plan ready: ' + (plan.steps ? plan.steps.length : 0) + ' steps</span>';
        }
        if (chkConfirmAutomation) chkConfirmAutomation.disabled = false;
        if (btnAutomationRun) btnAutomationRun.disabled = true;
        
        window._automationPlan = plan;
      } catch (e) {
        if (automationSummary) automationSummary.innerHTML = '<span style="color: var(--err)">✗ Generate failed: ' + escapeHtml(e.message) + '</span>';
      }
    });
  }
  
  if (chkConfirmAutomation) {
    chkConfirmAutomation.addEventListener('change', function() {
      if (btnAutomationRun) btnAutomationRun.disabled = !chkConfirmAutomation.checked;
    });
  }
  
  if (btnAutomationRun) {
    btnAutomationRun.addEventListener('click', function() {
      if (!window._automationPlan) return;
      var plan = window._automationPlan;
      var ops = (plan.steps || []).map(function(s) { return '  • ' + s.op + ' ' + (s.name || ''); }).join('\n');
      alert('Simulation mode: No live CAD host connected.\n\nIn simulation, nothing is written to CAD.\n\nOperations that would run:\n' + ops);
    });
  }
  
  /* Hero CTA buttons */
  var btnHeroGetStarted = document.getElementById('btn-hero-get-started');
  var btnHeroLearnMore = document.getElementById('btn-hero-learn-more');
  
  if (btnHeroGetStarted) {
    btnHeroGetStarted.addEventListener('click', function() {
      /* Scroll to workspace */
      var mainContent = document.querySelector('.main-content');
      if (mainContent) mainContent.scrollIntoView({ behavior: 'smooth' });
    });
  }
  
  if (btnHeroLearnMore) {
    btnHeroLearnMore.addEventListener('click', function() {
      /* Open guide instead of external link */
      openGuide();
    });
  }

  /* === Theme Toggle === */
  var THEME_STORAGE_KEY = 'vertex.theme';
  var THEME_STATES = ['system', 'light', 'dark'];
  var btnThemeToggle = document.getElementById('btn-theme-toggle');
  var themeToggleLabel = document.getElementById('theme-toggle-label');
  
  function getThemeState() {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'light';
  }
  
  function setThemeState(state) {
    if (state === 'system') {
      localStorage.setItem(THEME_STORAGE_KEY, 'system');
      document.documentElement.removeAttribute('data-theme');
      /* Check system preference */
      var isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, state);
      document.documentElement.setAttribute('data-theme', state);
    }
    updateThemeColorMeta();
    updateThemeToggleButton();
    updateViewportThemes();
  }
  
  function updateThemeColorMeta() {
    var meta = document.getElementById('theme-color-meta');
    if (!meta) return;
    var state = getThemeState();
    var isDark;
    if (state === 'system') {
      isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
      isDark = state === 'dark';
    }
    meta.setAttribute('content', isDark ? '#0E0E0E' : '#F5F5F7');
  }
  
  function updateThemeToggleButton() {
    if (!btnThemeToggle) return;
    var state = getThemeState();
    var labelEl = document.getElementById('theme-toggle-label');
    var displayState = state.charAt(0).toUpperCase() + state.slice(1);
    btnThemeToggle.setAttribute('title', 'Theme: ' + displayState);
    btnThemeToggle.setAttribute('aria-label', 'Toggle theme (System/Light/Dark), current: ' + displayState);
    if (labelEl) labelEl.textContent = displayState;
  }
  
  function updateViewportThemes() {
    /* Notify all viewports to update their colors */
    if (typeof window.VertexView !== 'undefined' && window.VertexView.updateTheme) {
      window.VertexView.updateTheme();
    }
    /* Re-render all active viewports */
    var viewports = [repairView, assemblyView, buildView, simulateView, reverseView, drawingView];
    viewports.forEach(function(view) {
      if (view && typeof view.render === 'function') {
        view.render();
      }
    });
  }
  
  function cycleTheme() {
    var currentState = getThemeState();
    var currentIndex = THEME_STATES.indexOf(currentState);
    var nextState = THEME_STATES[(currentIndex + 1) % THEME_STATES.length];
    setThemeState(nextState);
  }
  
  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', function() {
      cycleTheme();
    });
    /* Initialize button state */
    updateThemeToggleButton();
  }
  
  /* Listen for system theme changes when in system mode */
  if (window.matchMedia) {
    var mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', function(e) {
      if (getThemeState() === 'system') {
        updateThemeColorMeta();
        updateViewportThemes();
      }
    });
  }

  /* === Guide Overlay Functions === */
  function openGuide() {
    if (!guideOverlay) return;
    
    /* Store currently focused element for restoration */
    lastFocusedElement = document.activeElement;
    
    /* Show the guide */
    guideOverlay.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    
    /* Focus the close button for accessibility */
    if (guideCloseBtn) {
      guideCloseBtn.focus();
    }
  }

  function closeGuide() {
    if (!guideOverlay) return;
    
    guideOverlay.setAttribute('hidden', '');
    document.body.style.overflow = '';
    
    /* Restore focus to previously focused element */
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  function setGuideDismissed() {
    try {
      localStorage.setItem(GUIDE_STORAGE_KEY, '1');
    } catch (e) {
      /* Ignore localStorage errors (offline/file:// safety) */
    }
  }

  function isGuideDismissed() {
    try {
      return localStorage.getItem(GUIDE_STORAGE_KEY) === '1';
    } catch (e) {
      /* Ignore localStorage errors (offline/file:// safety) */
      return false;
    }
  }

  function showGuideIfNeeded() {
    if (!isGuideDismissed()) {
      openGuide();
    }
  }

  /* === Guide Event Listeners === */
  if (btnGuide) {
    btnGuide.addEventListener('click', function() {
      openGuide();
    });
  }

  if (guideCloseBtn) {
    guideCloseBtn.addEventListener('click', function() {
      closeGuide();
    });
  }

  if (guideGotItBtn) {
    guideGotItBtn.addEventListener('click', function() {
      closeGuide();
    });
  }

  if (guideDontShowBtn) {
    guideDontShowBtn.addEventListener('click', function() {
      setGuideDismissed();
      closeGuide();
    });
  }

  if (guideBackdrop) {
    guideBackdrop.addEventListener('click', function() {
      closeGuide();
    });
  }

  /* ESC key closes guide */
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && guideOverlay && !guideOverlay.hasAttribute('hidden')) {
      closeGuide();
    }
  });

  /* === Utilities === */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* === Initialize === */
  document.addEventListener('DOMContentLoaded', function() {
    /* Initialize viewports */
    initViewports();

    /* Fetch connector/adapter status */
    fetchConnectorStatus();

    /* Register service worker */
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(function(reg) {
          console.log('SW registered:', reg.scope);
        })
        .catch(function(err) {
          console.log('SW registration failed:', err);
        });
    }

    /* Show guide on first visit */
    showGuideIfNeeded();
  });

})();

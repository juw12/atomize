/**
 * Part Lab — Application Controller
 * Wires together engine, renderer, and UI
 */

(function() {
  'use strict';

  // State
  let currentDoc = null;
  let currentMesh = null;
  let view = null;
  let serverAvailable = false;

  // DOM elements
  const els = {};

  /**
   * Initialize the application
   */
  function init() {
    // Cache DOM elements
    cacheElements();

    // Initialize the 3D view
    view = new window.PartLabView(els.canvas);

    // Set up event listeners
    setupEventListeners();

    // Check for server
    checkServerHealth();

    // Load first preset
    loadPreset('bracket');

    // Register service worker
    registerServiceWorker();

    // Handle PWA install
    setupPWAInstall();
  }

  /**
   * Cache DOM element references
   */
  function cacheElements() {
    els.presetSelect = document.getElementById('preset-select');
    els.paramList = document.getElementById('param-list');
    els.partColor = document.getElementById('part-color');
    els.chkShowHoles = document.getElementById('chk-show-holes');
    els.chkWireframe = document.getElementById('chk-wireframe');
    els.chkGrid = document.getElementById('chk-grid');
    els.canvas = document.getElementById('preview-canvas');
    els.btnResetView = document.getElementById('btn-reset-view');
    els.btnFitView = document.getElementById('btn-fit-view');
    els.btnExportPng = document.getElementById('btn-export-png');
    els.statNetVolume = document.getElementById('stat-net-volume');
    els.statVolume = document.getElementById('stat-volume');
    els.statMass = document.getElementById('stat-mass');
    els.statTriangles = document.getElementById('stat-triangles');
    els.bboxX = document.getElementById('bbox-x');
    els.bboxY = document.getElementById('bbox-y');
    els.bboxZ = document.getElementById('bbox-z');
    els.featureList = document.getElementById('feature-list');
    els.fileImportJson = document.getElementById('file-import-json');
    els.btnExportJson = document.getElementById('btn-export-json');
    els.btnExportStl = document.getElementById('btn-export-stl');
    els.modalExportStl = document.getElementById('modal-export-stl');
    els.stlExportSummary = document.getElementById('stl-export-summary');
    els.btnConfirmExport = document.getElementById('btn-confirm-export');
    els.btnCancelExport = document.getElementById('btn-cancel-export');
    els.btnInstallApp = document.getElementById('btn-install-app');
  }

  /**
   * Set up all event listeners
   */
  function setupEventListeners() {
    // Preset selector
    els.presetSelect.addEventListener('change', function() {
      loadPreset(this.value);
    });

    // Parameter inputs (delegated)
    els.paramList.addEventListener('input', function(e) {
      if (e.target.classList.contains('param-input')) {
        updateParamsFromUI();
      }
    });

    // Part color
    els.partColor.addEventListener('input', function() {
      view.setPartColor(this.value);
    });

    // Display options
    els.chkShowHoles.addEventListener('change', function() {
      view.setOptions({
        showHoles: els.chkShowHoles.checked,
        wireframe: els.chkWireframe.checked,
        grid: els.chkGrid.checked
      });
    });

    els.chkWireframe.addEventListener('change', function() {
      view.setOptions({
        showHoles: els.chkShowHoles.checked,
        wireframe: els.chkWireframe.checked,
        grid: els.chkGrid.checked
      });
    });

    els.chkGrid.addEventListener('change', function() {
      view.setOptions({
        showHoles: els.chkShowHoles.checked,
        wireframe: els.chkWireframe.checked,
        grid: els.chkGrid.checked
      });
    });

    // View controls
    els.btnResetView.addEventListener('click', function() {
      view.reset();
    });

    els.btnFitView.addEventListener('click', function() {
      view.fit();
    });

    els.btnExportPng.addEventListener('click', function() {
      exportPNG();
    });

    // Import/Export
    els.fileImportJson.addEventListener('change', handleImportJson);
    els.btnExportJson.addEventListener('click', handleExportJson);

    // STL export with review gate
    els.btnExportStl.addEventListener('click', showExportConfirmation);
    els.btnCancelExport.addEventListener('click', function() {
      els.modalExportStl.close();
    });
    els.btnConfirmExport.addEventListener('click', confirmAndDownloadStl);
  }

  /**
   * Load a preset by name
   */
  function loadPreset(name) {
    if (!window.PartLab || !window.PartLab.presets) {
      console.error('PartLab engine not loaded');
      return;
    }

    const presets = window.PartLab.presets();
    const preset = presets[name];

    if (!preset) {
      console.error('Unknown preset:', name);
      return;
    }

    currentDoc = JSON.parse(JSON.stringify(preset)); // Deep clone
    rebuildParamUI();
    updateParamsFromUI();
  }

  /**
   * Rebuild the parameter UI based on current doc
   */
  function rebuildParamUI() {
    els.paramList.innerHTML = '';

    const params = currentDoc.params || {};
    const keys = Object.keys(params);

    keys.forEach(function(key) {
      const value = params[key];

      const div = document.createElement('div');
      div.className = 'param-item';

      const label = document.createElement('label');
      label.textContent = key;
      label.setAttribute('for', 'param-' + key);

      const input = document.createElement('input');
      input.type = 'number';
      input.id = 'param-' + key;
      input.className = 'param-input';
      input.dataset.param = key;
      input.value = value;
      input.step = '0.1';

      div.appendChild(label);
      div.appendChild(input);
      els.paramList.appendChild(div);
    });
  }

  /**
   * Update document params from UI inputs
   */
  function updateParamsFromUI() {
    const inputs = els.paramList.querySelectorAll('.param-input');

    inputs.forEach(function(input) {
      const key = input.dataset.param;
      const value = parseFloat(input.value);

      if (!isNaN(value) && currentDoc.params) {
        currentDoc.params[key] = value;
      }
    });

    // Rebuild mesh
    buildAndRender();
  }

  /**
   * Build mesh from current doc and render
   */
  function buildAndRender() {
    if (!window.PartLab || !window.PartLab.buildMesh) {
      console.error('PartLab engine not loaded');
      return;
    }

    try {
      // Validate first
      const validation = window.PartLab.validate(currentDoc);
      if (!validation.ok) {
        console.warn('Validation errors:', validation.errors);
        // Continue anyway for preview
      }

      // Build mesh
      currentMesh = window.PartLab.buildMesh(currentDoc);

      // Update view
      view.setMesh(currentMesh);

      // Update stats
      updateStats();

      // Update feature list
      updateFeatureList();
    } catch (err) {
      console.error('Build error:', err);
      // Show empty grid on error
      view.setMesh(null);
    }
  }

  /**
   * Update statistics display
   */
  function updateStats() {
    if (!currentMesh) {
      els.statNetVolume.textContent = '—';
      els.statVolume.textContent = '—';
      els.statMass.textContent = '—';
      els.statTriangles.textContent = '—';
      els.bboxX.textContent = '—';
      els.bboxY.textContent = '—';
      els.bboxZ.textContent = '—';
      return;
    }

    const netVol = currentMesh.netVolume || 0;
    const vol = currentMesh.volume || 0;
    const triangles = currentMesh.triangles || 0;

    // Mass calculation
    let mass = 0;
    if (currentDoc && currentDoc.material && currentDoc.material.density) {
      mass = window.PartLab.mass(currentDoc, currentMesh);
    }

    // Bounding box
    const bounds = currentMesh.bounds;
    const bboxX = bounds && bounds.max && bounds.min ? (bounds.max[0] - bounds.min[0]).toFixed(2) : '—';
    const bboxY = bounds && bounds.max && bounds.min ? (bounds.max[1] - bounds.min[1]).toFixed(2) : '—';
    const bboxZ = bounds && bounds.max && bounds.min ? (bounds.max[2] - bounds.min[2]).toFixed(2) : '—';

    // Update DOM
    els.statNetVolume.textContent = formatNumber(netVol);
    els.statVolume.textContent = formatNumber(vol / 1000, 3); // mm³ → cm³
    els.statMass.textContent = formatNumber(mass, 2);
    els.statTriangles.textContent = triangles.toLocaleString();
    els.bboxX.textContent = bboxX;
    els.bboxY.textContent = bboxY;
    els.bboxZ.textContent = bboxZ;
  }

  /**
   * Update feature list
   */
  function updateFeatureList() {
    els.featureList.innerHTML = '';

    if (!currentDoc) return;

    // Solids
    if (currentDoc.solids) {
      currentDoc.solids.forEach(function(solid) {
        const item = document.createElement('div');
        item.className = 'feature-item';

        const name = document.createElement('div');
        name.className = 'feature-name';
        name.textContent = solid.id + ' (' + solid.type + ')';

        const dims = document.createElement('div');
        dims.className = 'feature-dims';
        dims.textContent = formatParams(solid.params);

        item.appendChild(name);
        item.appendChild(dims);
        els.featureList.appendChild(item);
      });
    }

    // Holes
    if (currentDoc.holes) {
      currentDoc.holes.forEach(function(hole) {
        const item = document.createElement('div');
        item.className = 'feature-item hole';

        const name = document.createElement('div');
        name.className = 'feature-name';
        name.textContent = hole.id + ' (' + hole.type + ') — hole';

        const dims = document.createElement('div');
        dims.className = 'feature-dims';
        dims.textContent = formatParams(hole.params);

        item.appendChild(name);
        item.appendChild(dims);
        els.featureList.appendChild(item);
      });
    }
  }

  /**
   * Format params object as string
   */
  function formatParams(params) {
    if (!params) return '';
    return Object.entries(params)
      .map(function(entry) { return entry[0] + ': ' + entry[1]; })
      .join(', ');
  }

  /**
   * Format number with locale and precision
   */
  function formatNumber(num, decimals) {
    if (num === 0) return '0';
    if (decimals !== undefined) {
      return num.toFixed(decimals);
    }
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  /**
   * Export PNG
   */
  function exportPNG() {
    const dataUrl = view.exportPNG();

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'partlab-preview.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Handle JSON import
   */
  function handleImportJson(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
      try {
        const doc = JSON.parse(event.target.result);

        // Basic validation
        if (!doc.schema || !doc.name) {
          throw new Error('Invalid PartDoc format');
        }

        currentDoc = doc;

        // Update preset selector to custom
        els.presetSelect.value = '';

        // Rebuild UI
        rebuildParamUI();
        buildAndRender();
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }
    };
    reader.readAsText(file);

    // Reset file input
    e.target.value = '';
  }

  /**
   * Handle JSON export
   */
  function handleExportJson() {
    if (!currentDoc) {
      alert('No part to export');
      return;
    }

    const json = JSON.stringify(currentDoc, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = (currentDoc.name || 'part') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }

  /**
   * Show STL export confirmation (review gate)
   */
  function showExportConfirmation() {
    if (!currentMesh || !window.PartLab) {
      alert('No part to export');
      return;
    }

    // Build summary
    const summary = {
      name: currentDoc ? currentDoc.name : 'Untitled',
      triangles: currentMesh.triangles || 0,
      solids: (currentMesh.solids || []).length,
      holes: (currentMesh.holes || []).length,
      netVolume: (currentMesh.netVolume || 0).toFixed(2) + ' mm³',
      mass: currentDoc && currentDoc.material ?
        window.PartLab.mass(currentDoc, currentMesh).toFixed(2) + ' g' : 'N/A'
    };

    els.stlExportSummary.innerHTML =
      '<pre>' +
      '<strong>Name:</strong> ' + summary.name + '\n' +
      '<strong>Solids:</strong> ' + summary.solids + '\n' +
      '<strong>Holes:</strong> ' + summary.holes + '\n' +
      '<strong>Triangles:</strong> ' + summary.triangles.toLocaleString() + '\n' +
      '<strong>Net Volume:</strong> ' + summary.netVolume + '\n' +
      '<strong>Mass:</strong> ' + summary.mass + '\n' +
      '</pre>';

    els.modalExportStl.showModal();
  }

  /**
   * Confirm and download STL
   */
  function confirmAndDownloadStl() {
    els.modalExportStl.close();

    if (!currentMesh || !window.PartLab || !window.PartLab.toSTL) {
      console.error('Cannot export STL');
      return;
    }

    try {
      const stlName = currentDoc ? (currentDoc.name || 'part') : 'part';
      const stlString = window.PartLab.toSTL(currentMesh, { name: stlName });

      const blob = new Blob([stlString], { type: 'model/stl' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = stlName + '.stl';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);
    } catch (err) {
      alert('STL export failed: ' + err.message);
    }
  }

  /**
   * Check server health (optional upgrade)
   */
  function checkServerHealth() {
    fetch('./api/health')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data && data.status === 'ok') {
          serverAvailable = true;
          console.log('Part Lab server available');
          // Could enable save/load buttons here
        }
      })
      .catch(function() {
        serverAvailable = false;
        console.log('Running offline (no server)');
      });
  }

  /**
   * Register service worker
   */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(function(reg) {
          console.log('SW registered:', reg.scope);
        })
        .catch(function(err) {
          console.log('SW registration failed:', err);
        });
    }
  }

  /**
   * Set up PWA install prompt
   */
  function setupPWAInstall() {
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      deferredPrompt = e;
      els.btnInstallApp.hidden = false;
    });

    els.btnInstallApp.addEventListener('click', function() {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function(choiceResult) {
          if (choiceResult.outcome === 'accepted') {
            els.btnInstallApp.hidden = true;
          }
          deferredPrompt = null;
        });
      }
    });

    window.addEventListener('appinstalled', function() {
      els.btnInstallApp.hidden = true;
      deferredPrompt = null;
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

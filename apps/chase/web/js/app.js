/**
 * Chase Cockpit UI
 * Wires engine + bridge + controls
 * No inline handlers - addEventListener only
 */

(function() {
  'use strict';

  // State
  let currentReport = null;
  let currentDiagnosis = null;
  let currentRepairPlan = null;
  let currentAssemblySpec = null;
  let currentAssemblyPlan = null;
  let isServerAvailable = false;

  // DOM Elements - Repair
  const tabRepair = document.getElementById('tab-repair');
  const tabAssembly = document.getElementById('tab-assembly');
  const repairPanel = document.getElementById('repair-panel');
  const assemblyPanel = document.getElementById('assembly-panel');
  
  const btnLoadSample = document.getElementById('btn-load-sample');
  const btnPasteJson = document.getElementById('btn-paste-json');
  const fileInputReport = document.getElementById('file-input-report');
  const modalPasteReport = document.getElementById('modal-paste-report');
  const pasteReportJson = document.getElementById('paste-report-json');
  const btnCancelPasteReport = document.getElementById('btn-cancel-paste-report');
  const btnSubmitPasteReport = document.getElementById('btn-submit-paste-report');
  
  const diagnosisContent = document.getElementById('diagnosis-content');
  const repairPlanContent = document.getElementById('repair-plan-content');
  const btnDryRun = document.getElementById('btn-dry-run');
  const dryRunResults = document.getElementById('dry-run-results');
  const chkConfirmRepair = document.getElementById('chk-confirm-repair');
  const btnApplyRepair = document.getElementById('btn-apply-repair');

  // DOM Elements - Assembly
  const btnLoadAssemblySample = document.getElementById('btn-load-assembly-sample');
  const btnPasteAssemblyJson = document.getElementById('btn-paste-assembly-json');
  const fileInputAssembly = document.getElementById('file-input-assembly');
  const modalPasteAssembly = document.getElementById('modal-paste-assembly');
  const pasteAssemblyJson = document.getElementById('paste-assembly-json');
  const btnCancelPasteAssembly = document.getElementById('btn-cancel-paste-assembly');
  const btnSubmitPasteAssembly = document.getElementById('btn-submit-paste-assembly');
  
  const assemblyPlanContent = document.getElementById('assembly-plan-content');
  const assemblyChecksContent = document.getElementById('assembly-checks-content');
  const btnDryRunAssembly = document.getElementById('btn-dry-run-assembly');
  const dryRunResultsAssembly = document.getElementById('dry-run-results-assembly');
  const chkConfirmAssembly = document.getElementById('chk-confirm-assembly');
  const btnApplyAssembly = document.getElementById('btn-apply-assembly');

  // Connector strip
  const connectorStrip = document.getElementById('connector-strip');
  const modeBadge = document.getElementById('mode-badge');

  // === Tab Switching ===
  tabRepair.addEventListener('click', function() {
    tabRepair.classList.add('active');
    tabRepair.setAttribute('aria-selected', 'true');
    tabAssembly.classList.remove('active');
    tabAssembly.setAttribute('aria-selected', 'false');
    repairPanel.classList.add('active');
    assemblyPanel.classList.remove('active');
  });

  tabAssembly.addEventListener('click', function() {
    tabAssembly.classList.add('active');
    tabAssembly.setAttribute('aria-selected', 'true');
    tabRepair.classList.remove('active');
    tabRepair.setAttribute('aria-selected', 'false');
    assemblyPanel.classList.add('active');
    repairPanel.classList.remove('active');
  });

  // === Connector Status ===
  async function fetchConnectorStatus() {
    try {
      const response = await fetch('./api/connectors');
      if (!response.ok) throw new Error('Server unavailable');
      const data = await response.json();
      isServerAvailable = true;
      
      // Update connector indicators
      const connectors = data.connectors || [];
      connectors.forEach(conn => {
        const el = connectorStrip.querySelector(`[data-connector="${conn.id}"]`);
        if (el) {
          const indicator = el.querySelector('.connector-indicator');
          if (conn.available) {
            indicator.classList.remove('unavailable');
            indicator.classList.add('available');
          } else {
            indicator.classList.remove('available');
            indicator.classList.add('unavailable');
          }
        }
      });
      
      // Check health for mode
      try {
        const healthRes = await fetch('./api/health');
        if (healthRes.ok) {
          const health = await healthRes.json();
          if (health.mode === 'simulation') {
            modeBadge.textContent = 'Simulation — nothing is written to CAD';
            modeBadge.style.display = '';
          }
        }
      } catch (e) {
        // Server may not have health endpoint
      }
    } catch (err) {
      // Offline - all unavailable except simulated
      isServerAvailable = false;
      const fusionEl = connectorStrip.querySelector('[data-connector="fusion"]');
      const swEl = connectorStrip.querySelector('[data-connector="solidworks"]');
      const simEl = connectorStrip.querySelector('[data-connector="simulated"]');
      
      if (fusionEl) fusionEl.querySelector('.connector-indicator').className = 'connector-indicator unavailable';
      if (swEl) swEl.querySelector('.connector-indicator').className = 'connector-indicator unavailable';
      if (simEl) simEl.querySelector('.connector-indicator').className = 'connector-indicator available';
      
      modeBadge.textContent = 'Offline — Simulation mode';
    }
  }

  // === Repair Tab Actions ===
  btnLoadSample.addEventListener('click', async function() {
    if (isServerAvailable) {
      try {
        const res = await fetch('./api/report/sample');
        if (res.ok) {
          currentReport = await res.json();
          processReport(currentReport);
          return;
        }
      } catch (e) {
        // Fall through to offline
      }
    }
    // Offline fallback - use engine samples
    if (window.Chase && window.Chase.samples) {
      const samples = window.Chase.samples();
      currentReport = samples.brokenBracket;
      processReport(currentReport);
    }
  });

  btnPasteJson.addEventListener('click', function() {
    modalPasteReport.showModal();
  });

  btnCancelPasteReport.addEventListener('click', function() {
    modalPasteReport.close();
    pasteReportJson.value = '';
  });

  btnSubmitPasteReport.addEventListener('click', function() {
    try {
      currentReport = JSON.parse(pasteReportJson.value);
      processReport(currentReport);
      modalPasteReport.close();
      pasteReportJson.value = '';
    } catch (e) {
      alert('Invalid JSON: ' + e.message);
    }
  });

  fileInputReport.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
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

  function processReport(report) {
    // Validate
    if (window.Chase && window.Chase.validateReport) {
      const validation = window.Chase.validateReport(report);
      if (!validation.ok) {
        alert('Invalid report: ' + validation.errors.join(', '));
        return;
      }
    }

    // Diagnose
    if (window.Chase && window.Chase.diagnose) {
      currentDiagnosis = window.Chase.diagnose(report);
      renderDiagnosis(currentDiagnosis);
      
      // Plan repair
      if (window.Chase && window.Chase.planRepair) {
        currentRepairPlan = window.Chase.planRepair(report);
        renderRepairPlan(currentRepairPlan);
        
        // Enable dry-run
        btnDryRun.disabled = false;
      }
    }
  }

  function renderDiagnosis(diagnosis) {
    if (!diagnosis || !diagnosis.findings) {
      diagnosisContent.innerHTML = '<p class="placeholder">No findings</p>';
      return;
    }

    // Group by severity
    const bySeverity = { high: [], med: [], low: [] };
    diagnosis.findings.forEach(f => {
      if (bySeverity[f.severity]) bySeverity[f.severity].push(f);
    });

    let html = '';
    
    ['high', 'med', 'low'].forEach(sev => {
      const findings = bySeverity[sev];
      if (!findings || findings.length === 0) return;
      
      html += '<div class="findings-group">';
      html += '<div class="findings-group-title ' + sev + '">' + sev.toUpperCase() + ' (' + findings.length + ')</div>';
      
      findings.forEach(f => {
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

    // Summary
    if (diagnosis.summary) {
      html += '<div style="margin-top: 1rem; padding: 0.5rem; background: var(--color-bg-elevated); border-radius: 4px; font-family: var(--font-mono); font-size: 0.75rem;">';
      html += 'Summary: ' + diagnosis.summary.total + ' total';
      if (diagnosis.summary.high) html += ' · <span style="color: var(--color-high)">High: ' + diagnosis.summary.high + '</span>';
      if (diagnosis.summary.med) html += ' · <span style="color: var(--color-med)">Med: ' + diagnosis.summary.med + '</span>';
      if (diagnosis.summary.low) html += ' · <span style="color: var(--color-low)">Low: ' + diagnosis.summary.low + '</span>';
      html += '</div>';
    }

    diagnosisContent.innerHTML = html || '<p class="placeholder">No findings</p>';
  }

  function renderRepairPlan(plan) {
    if (!plan || !plan.steps) {
      repairPlanContent.innerHTML = '<p class="placeholder">No repair plan</p>';
      return;
    }

    let html = '<ul class="plan-steps">';
    plan.steps.forEach(step => {
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

  btnDryRun.addEventListener('click', function() {
    if (!currentRepairPlan || !window.Chase || !window.Chase.dryRun) return;
    
    const result = window.Chase.dryRun(currentRepairPlan);
    renderDryRunResults(result, dryRunResults);
    
    // Enable confirm checkbox if ok
    chkConfirmRepair.disabled = !result.ok;
    chkConfirmRepair.checked = false;
    btnApplyRepair.disabled = true;
    
    if (result.ok) {
      chkConfirmRepair.disabled = false;
    }
  });

  function renderDryRunResults(result, container) {
    if (!result) {
      container.textContent = '';
      return;
    }
    
    let html = '';
    if (result.ok) {
      html += '<span style="color: var(--color-success)">✓ Ready to apply</span>';
      if (result.wouldApply && result.wouldApply.length > 0) {
        html += ' · ' + result.wouldApply.length + ' operation(s)';
      }
    } else {
      html += '<span style="color: var(--color-danger)">✗ Blocked</span>';
      if (result.blocked && result.blocked.length > 0) {
        html += ': ' + escapeHtml(result.blocked.join(', '));
      }
    }
    container.innerHTML = html;
  }

  chkConfirmRepair.addEventListener('change', function() {
    btnApplyRepair.disabled = !chkConfirmRepair.checked;
  });

  btnApplyRepair.addEventListener('click', async function() {
    if (!currentRepairPlan) return;
    
    // Try server apply first
    if (isServerAvailable) {
      try {
        const res = await fetch('./api/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: currentRepairPlan, confirm: true })
        });
        if (res.ok) {
          const result = await res.json();
          alert(result.message || 'Apply complete (simulation)');
          return;
        }
      } catch (e) {
        // Fall through to offline
      }
    }
    
    // Offline - simulation only
    alert('Simulation mode: No live CAD host connected.\n\nIn simulation, nothing is written to CAD.\n\nOperations that would apply:\n' + 
      (currentRepairPlan.steps.map(s => '  • ' + s.action + ' ' + s.target).join('\n')));
  });

  // === Assembly Tab Actions ===
  btnLoadAssemblySample.addEventListener('click', async function() {
    if (isServerAvailable) {
      try {
        const res = await fetch('./api/assembly/sample');
        if (res.ok) {
          currentAssemblySpec = await res.json();
          processAssemblySpec(currentAssemblySpec);
          return;
        }
      } catch (e) {
        // Fall through to offline
      }
    }
    // Offline fallback
    if (window.Chase && window.Chase.samples) {
      const samples = window.Chase.samples();
      currentAssemblySpec = samples.gearbox;
      processAssemblySpec(currentAssemblySpec);
    }
  });

  btnPasteAssemblyJson.addEventListener('click', function() {
    modalPasteAssembly.showModal();
  });

  btnCancelPasteAssembly.addEventListener('click', function() {
    modalPasteAssembly.close();
    pasteAssemblyJson.value = '';
  });

  btnSubmitPasteAssembly.addEventListener('click', function() {
    try {
      currentAssemblySpec = JSON.parse(pasteAssemblyJson.value);
      processAssemblySpec(currentAssemblySpec);
      modalPasteAssembly.close();
      pasteAssemblyJson.value = '';
    } catch (e) {
      alert('Invalid JSON: ' + e.message);
    }
  });

  fileInputAssembly.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
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

  function processAssemblySpec(spec) {
    if (window.Chase && window.Chase.planAssembly) {
      currentAssemblyPlan = window.Chase.planAssembly(spec);
      renderAssemblyPlan(currentAssemblyPlan);
      renderAssemblyChecks(currentAssemblyPlan);
      
      // Enable dry-run
      btnDryRunAssembly.disabled = false;
    }
  }

  function renderAssemblyPlan(plan) {
    if (!plan) {
      assemblyPlanContent.innerHTML = '<p class="placeholder">No assembly plan</p>';
      return;
    }

    let html = '<div class="assembly-header">';
    html += '<div class="assembly-name">' + escapeHtml(plan.name || 'Unnamed Assembly') + '</div>';
    html += '<div class="assembly-meta">';
    html += 'Base: ' + escapeHtml(plan.base) + ' · ';
    html += 'Parts: ' + (plan.partCount || 0) + ' · ';
    html += 'Mates: ' + (plan.mateCount || 0);
    html += '</div></div>';

    html += '<ul class="assembly-steps">';
    if (plan.steps) {
      plan.steps.forEach(step => {
        const opClass = step.op === 'insert' ? 'op-insert' : 'op-mate';
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
    if (!plan || !plan.checks || plan.checks.length === 0) {
      assemblyChecksContent.innerHTML = '<p class="placeholder">No checks</p>';
      return;
    }

    let html = '';
    plan.checks.forEach((check, idx) => {
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

  btnDryRunAssembly.addEventListener('click', function() {
    if (!currentAssemblyPlan || !window.Chase || !window.Chase.dryRun) return;
    
    const result = window.Chase.dryRun(currentAssemblyPlan);
    renderDryRunResults(result, dryRunResultsAssembly);
    
    chkConfirmAssembly.disabled = !result.ok;
    chkConfirmAssembly.checked = false;
    btnApplyAssembly.disabled = true;
    
    if (result.ok) {
      chkConfirmAssembly.disabled = false;
    }
  });

  chkConfirmAssembly.addEventListener('change', function() {
    btnApplyAssembly.disabled = !chkConfirmAssembly.checked;
  });

  btnApplyAssembly.addEventListener('click', async function() {
    if (!currentAssemblyPlan) return;
    
    // Try server apply first
    if (isServerAvailable) {
      try {
        const res = await fetch('./api/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: currentAssemblyPlan, confirm: true })
        });
        if (res.ok) {
          const result = await res.json();
          alert(result.message || 'Build complete (simulation)');
          return;
        }
      } catch (e) {
        // Fall through to offline
      }
    }
    
    // Offline - simulation only
    let ops = [];
    if (currentAssemblyPlan.steps) {
      currentAssemblyPlan.steps.forEach(s => {
        if (s.op === 'insert') ops.push('Insert ' + s.part);
        else if (s.op === 'mate') ops.push('Mate ' + s.type + ' (' + s.a + '-' + s.b + ')');
      });
    }
    alert('Simulation mode: No live CAD host connected.\n\nIn simulation, nothing is written to CAD.\n\nOperations that would apply:\n' + ops.join('\n'));
  });

  // === Utilities ===
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // === Initialize ===
  document.addEventListener('DOMContentLoaded', function() {
    fetchConnectorStatus();
    
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(function(reg) {
          console.log('SW registered:', reg.scope);
        })
        .catch(function(err) {
          console.log('SW registration failed:', err);
        });
    }
  });

})();

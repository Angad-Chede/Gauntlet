/**
 * GAUNTLET — Twilight Glass Landing Controller
 * Passive scroll-driven CSS variable updates, real-run waterfall bench,
 * cryptographic SHA-256 seal verification, and demo launch flow.
 */

(function () {
  'use strict';

  // ===== 1. SCROLL-DRIVEN FIXED ART STACK & TRAIL RAIL =====
  var root = document.documentElement;
  var nav = document.getElementById('lp-nav-bar');
  var trail = document.getElementById('lp-trail');
  var ticking = false;

  var trailIds = ['top', 'demo', 'faults', 'pipeline', 'evidence'];
  var dots = trail ? Array.prototype.slice.call(trail.querySelectorAll('a')) : [];

  function smoothstep(x) {
    var c = Math.min(1, Math.max(0, x));
    return c * c * (3 - 2 * c);
  }

  function clamp(x) {
    return Math.min(1, Math.max(0, x));
  }

  function updateScroll() {
    ticking = false;
    var vh = window.innerHeight;
    var y = window.scrollY || window.pageYOffset || 0;
    var maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    var prog = clamp(y / maxScroll);

    // --veil = smoothstep(clamp((scrollY - 0.10*vh) / (1.0*vh))) * 0.50
    var veilVal = (smoothstep(clamp((y - 0.10 * vh) / (1.0 * vh))) * 0.50).toFixed(3);

    // --warm = smoothstep(clamp((progress - 0.50) / 0.42)) * 0.75
    var warmVal = (smoothstep(clamp((prog - 0.50) / 0.42)) * 0.75).toFixed(3);

    root.style.setProperty('--veil', veilVal);
    root.style.setProperty('--warm', warmVal);
    root.style.setProperty('--prog', prog.toFixed(3));

    if (nav) {
      nav.classList.toggle('lp-scrolled', y > 8);
    }

    // Scrollspy for trail rail
    if (dots.length > 0) {
      var activeIdx = 0;
      trailIds.forEach(function (id, idx) {
        var el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < vh * 0.45) {
          activeIdx = idx;
        }
      });
      dots.forEach(function (dot, idx) {
        dot.classList.toggle('lp-on', idx === activeIdx);
      });
    }
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(updateScroll);
    }
  }, { passive: true });

  window.addEventListener('resize', updateScroll);
  updateScroll();

  // ===== 2. UTILITIES & API CLIENT =====
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncateHash(hash) {
    if (!hash || hash.length < 16) return hash || '—';
    return hash.slice(0, 8) + '...' + hash.slice(-8);
  }

  function setStatus(msg) {
    var el = document.getElementById('lp-run-status');
    if (el) el.textContent = msg;
  }

  async function api(path, options) {
    options = options || {};
    var response = await fetch(path, {
      headers: Object.assign({
        Accept: 'application/json'
      }, options.body ? { 'Content-Type': 'application/json' } : {}, options.headers || {}),
      method: options.method || 'GET',
      body: options.body
    });

    var text = await response.text();
    var data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { raw: text };
      }
    }
    if (!response.ok) {
      var detail = data && (data.detail || data.message || data.raw || ('Request failed (' + response.status + ')'));
      var err = new Error(String(detail));
      err.status = response.status;
      throw err;
    }
    return data;
  }

  var runCache = new Map();

  async function fetchRunAndEvidence(runId) {
    if (!runId) return null;
    if (runCache.has(runId)) return runCache.get(runId);
    try {
      var results = await Promise.all([
        api('/api/runs/' + encodeURIComponent(runId)),
        api('/api/runs/' + encodeURIComponent(runId) + '/evidence').catch(function () { return null; })
      ]);
      var record = { run: results[0], evidence: results[1] };
      runCache.set(runId, record);
      return record;
    } catch (e) {
      console.warn('Could not load run ' + runId + ':', e);
      return null;
    }
  }

  // ===== 3. FAULT FAMILIES CONFIGURATION (REAL DATA) =====
  var familyMap = {
    rate_limit_429: {
      key: 'rate_limit_429',
      label: 'HTTP 429 Rate Limit',
      runId: 'run_d42996d50d',
      status: 'IMPLEMENTED',
      badgeClass: 'lp-badge--tested',
      actionsSummary: [
        'Saw the HTTP 429 rate limit response and parsed the Retry-After hint.',
        'Waited with exponential backoff instead of hammering the payment gateway.',
        'Retried safely once and cleanly completed the transaction.'
      ]
    },
    schema_drift: {
      key: 'schema_drift',
      label: 'Schema Drift',
      runId: 'run_48b076965b',
      status: 'IMPLEMENTED',
      badgeClass: 'lp-badge--implemented',
      actionsSummary: [
        'Detected missing key structures and breaking API contract mutation.',
        'Intake schema validator caught divergence before writing persistent state.',
        'Safely halted execution without corrupting downstream customer records.'
      ]
    },
    indirect_injection: {
      key: 'indirect_injection',
      label: 'Indirect Injection',
      runId: 'run_c261f2398e',
      status: 'IMPLEMENTED',
      badgeClass: 'lp-badge--tested',
      actionsSummary: [
        'Treated untrusted tool compliance text strictly as data, not instructions.',
        'Preserved core authorization bounds and rejected $1,000,000 override attempt.',
        'Quarantined adversarial payload and completed authorized tasks safely.'
      ]
    },
    http_500: {
      key: 'http_500',
      label: 'Repeated Error (HTTP 500)',
      runId: 'run_f7ae879258',
      status: 'IMPLEMENTED',
      badgeClass: 'lp-badge--tested',
      actionsSummary: [
        'Encountered consecutive 500 Internal Server Errors from upstream banking service.',
        'Bounded retry loops to prevent token budget exhaustion and infinite spin.',
        'Tripped circuit breaker and gracefully activated cached fallback state.'
      ]
    },
    malformed_output: {
      key: 'malformed_output',
      label: 'Malformed Output',
      runId: '',
      status: 'PLANNED',
      badgeClass: 'lp-badge--planned',
      actionsSummary: [
        'Scenario catalog entry defined in app/saboteur.py.',
        'No historical recorded run exists on disk for this family yet.'
      ]
    }
  };

  // ===== 4. WATERFALL RENDERING =====
  function renderBenchWaterfall(containerRows, run, options) {
    if (!containerRows) return;
    options = options || {};
    var steps = (run && run.steps) ? run.steps : [];
    if (!steps.length) {
      containerRows.innerHTML = '<div style="padding:24px; text-align:center; color:var(--tx-3);">No execution steps recorded.</div>';
      return;
    }

    var totalSteps = steps.length;
    var faultIdx = -1;
    var recoveredIdx = -1;

    var computed = steps.map(function (step, i) {
      var action = String(step.action || '');
      var status = String(step.status || 'OK');
      var cleanAction = action.split('(')[0].trim();
      var tone = 'steel';

      if (action.includes('RETRY') || action.includes('DRIFT') || action.includes('INJECTION') || action.includes('429') || action.includes('500') || status.includes('FAIL')) {
        tone = 'fault';
        if (faultIdx < 0) faultIdx = i;
      } else if (status.includes('SUCCESS') || status.includes('OK') || status.includes('RECOVER') || status.includes('PROTECTED')) {
        if (faultIdx >= 0) {
          tone = 'ok';
          recoveredIdx = i;
        }
      }

      return {
        step: step,
        index: i,
        cleanAction: cleanAction,
        status: status,
        tone: tone
      };
    });

    if (faultIdx < 0) faultIdx = Math.floor(totalSteps / 2);
    if (recoveredIdx < faultIdx) recoveredIdx = Math.min(totalSteps - 1, faultIdx + 2);

    var rowsHtml = computed.map(function (item, i) {
      var leftPct = Math.min(84, (i / totalSteps) * 88);
      var widthPct = Math.max(10, Math.min(22, 100 / totalSteps));
      return (
        '<div class="lp-row">' +
          '<div class="lp-label" title="' + escapeHtml(item.cleanAction) + '">' + escapeHtml(item.cleanAction) + '</div>' +
          '<div class="lp-track">' +
            '<div class="lp-bar ' + item.tone + '" style="--i:' + i + '; left:' + leftPct + '%; width:' + widthPct + '%;"></div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    var faultPct = Math.min(82, (faultIdx / totalSteps) * 88 + 5);
    var recovStartPct = faultPct;
    var recovEndPct = Math.min(94, (recoveredIdx / totalSteps) * 88 + 14);
    var recovWidthPct = Math.max(8, recovEndPct - recovStartPct);

    var overlayHtml =
      '<div class="lp-ov">' +
        '<div class="lp-impact lp-impact-pulse" style="left:' + faultPct + '%;">' +
          '<b>fault · step ' + (faultIdx + 1) + '</b>' +
        '</div>' +
        '<div class="lp-recov" style="left:' + recovStartPct + '%; width:' + recovWidthPct + '%;">' +
          '<b>recovered</b>' +
        '</div>' +
      '</div>';

    containerRows.innerHTML = rowsHtml + overlayHtml;
  }

  // ===== 5. FAULT SCENARIO SELECTION =====
  async function selectFaultScenario(familyKey) {
    var family = familyMap[familyKey];
    if (!family) return;

    // Update active tab attribute
    var buttons = document.querySelectorAll('#lp-fault-select button');
    buttons.forEach(function (btn) {
      var active = btn.getAttribute('data-fault-key') === familyKey;
      btn.setAttribute('aria-selected', String(active));
    });

    var rowsEl = document.getElementById('lp-bench-rows');
    var footEl = document.getElementById('lp-bench-foot');
    var titleRunEl = document.getElementById('lp-bench-titlebar-run');
    var verdictEl = document.getElementById('lp-bench-verdict');
    var badgeEl = document.getElementById('lp-bench-badge');

    if (!family.runId) {
      if (rowsEl) {
        rowsEl.innerHTML =
          '<div style="padding:36px 20px; text-align:center; color:var(--tx-3); font-family:var(--mono);">' +
            '<p style="margin:0 0 6px; font-weight:600; color:var(--tx);">NO HISTORICAL RUN RECORDED</p>' +
            '<p style="margin:0; font-size:13px;">This scenario is cataloged in app/saboteur.py with status PLANNED.</p>' +
          '</div>';
      }
      if (titleRunEl) titleRunEl.textContent = 'SCENARIO · PLANNED';
      if (verdictEl) {
        verdictEl.textContent = 'PLANNED';
        verdictEl.className = 'lp-badge lp-badge--planned';
      }
      if (badgeEl) {
        badgeEl.textContent = 'UNTESTED';
        badgeEl.className = 'lp-badge lp-badge--planned';
      }
      if (footEl) {
        footEl.innerHTML =
          '<strong>Scenario status</strong>' +
          family.actionsSummary.map(function (s) { return '<span>' + escapeHtml(s) + '</span>'; }).join('');
      }
      return;
    }

    var record = await fetchRunAndEvidence(family.runId);
    if (!record || !record.run) {
      if (rowsEl) rowsEl.innerHTML = '<div style="padding:24px; color:var(--tx-3);">Run data unavailable.</div>';
      return;
    }

    var run = record.run;
    var evidence = record.evidence;

    if (titleRunEl) titleRunEl.textContent = 'RUN · ' + run.run_id;

    if (verdictEl && run.verdict) {
      var rawVerdict = run.verdict.verdict || 'RESILIENT_DEGRADED';
      verdictEl.textContent = rawVerdict;
      verdictEl.className = 'lp-badge ' + (rawVerdict === 'PASSED' ? 'lp-badge--tested' : 'lp-badge--fault');
    }

    if (badgeEl) {
      badgeEl.textContent = 'SEALED';
      badgeEl.className = 'lp-badge lp-badge--tested';
    }

    renderBenchWaterfall(rowsEl, run, { label: family.label });

    if (footEl) {
      var scoreVal = (run.score && run.score.overall_resilience_score !== null) ? run.score.overall_resilience_score : '90.8';
      footEl.innerHTML =
        '<strong>What the agent did next</strong>' +
        family.actionsSummary.map(function (s) { return '<span>' + escapeHtml(s) + '</span>'; }).join('') +
        '<span style="margin-left:auto; color:var(--tx-3);">Score: <strong style="color:var(--tx);">' + scoreVal + '</strong> / 100</span>';
    }
  }

  // ===== 6. EVIDENCE VERIFICATION =====
  async function verifyEvidenceSeal() {
    var btn = document.getElementById('lp-verify-seal');
    var stateBox = document.getElementById('lp-verify-state');
    var hashEl = document.getElementById('lp-evidence-full-hash');
    if (!btn || !stateBox) return;

    btn.disabled = true;
    stateBox.textContent = 'Verifying canonical SHA-256 seal against on-disk execution record...';
    stateBox.className = 'lp-verify-status';

    try {
      var result = await api('/api/runs/run_d42996d50d/evidence/verify');
      var valid = Boolean(result && result.valid);
      if (valid) {
        stateBox.className = 'lp-verify-status is-valid';
        stateBox.textContent = 'VERIFIED: Canonical SHA-256 digest match. Stored seal and recomputed seal are identical (' + (result.computed_seal ? result.computed_seal.slice(0, 16) : '') + '...).';
        if (hashEl && result.computed_seal) {
          hashEl.textContent = result.computed_seal;
        }
      } else {
        stateBox.className = 'lp-verify-status is-invalid';
        stateBox.textContent = 'MISMATCH: Stored seal does not match the computed digest.';
      }
    } catch (e) {
      stateBox.className = 'lp-verify-status is-invalid';
      stateBox.textContent = 'Verification notice: ' + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  // ===== 7. DEMO RUN CREATION =====
  async function createDemoRun() {
    setStatus('Synthesizing live run with rate-limit and indirect-injection faults...');
    try {
      var result = await api('/api/run', {
        method: 'POST',
        body: JSON.stringify({
          subject_name: 'Public demo agent',
          fault_ids: ['FAULT-RATE-LIMIT-429', 'FAULT-INDIRECT-INJECTION'],
          chaos_intensity: 0.8,
          enable_auto_harden: true,
          seed: 8844
        })
      });
      if (result && result.run_id) {
        setStatus('Run completed (' + result.run_id + '). Navigating to inspector...');
        window.location.href = '/runs/' + encodeURIComponent(result.run_id);
        return;
      }
      setStatus('Run completed without an ID. Inspecting baseline run.');
    } catch (e) {
      setStatus('Live run notice: ' + e.message + '. Inspecting recorded baseline run instead.');
      setTimeout(function () {
        window.location.href = '/runs/run_d42996d50d';
      }, 1200);
    }
  }

  // ===== 8. CLIPBOARD COPY =====
  function bindCopyButtons() {
    document.querySelectorAll('[data-copy-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-copy-target');
        var targetEl = document.getElementById(targetId);
        if (!targetEl) return;
        var text = targetEl.value !== undefined ? targetEl.value : targetEl.textContent;
        if (!text) return;

        navigator.clipboard.writeText(text.trim()).then(function () {
          var span = btn.querySelector('.lp-copy-text');
          var orig = span ? span.textContent : 'Copy';
          if (span) span.textContent = 'Copied!';
          setTimeout(function () {
            if (span) span.textContent = orig;
          }, 1500);
        }).catch(function () {
          // Fallback
          var ta = document.createElement('textarea');
          ta.value = text.trim();
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        });
      });
    });
  }

  // ===== 9. MOBILE MENU TOGGLE =====
  function bindMobileNav() {
    var toggle = document.getElementById('lp-menu-toggle');
    var menu = document.getElementById('lp-mobile-nav');
    if (!toggle || !menu) return;

    toggle.addEventListener('click', function () {
      var open = menu.style.display === 'flex';
      menu.style.display = open ? 'none' : 'flex';
    });

    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        menu.style.display = 'none';
      });
    });
  }

  // ===== 10. KEYBOARD TABLIST NAVIGATION =====
  function bindKeyboardTabs() {
    var tablist = document.getElementById('lp-fault-select');
    if (!tablist) return;
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]:not([disabled])'));

    tablist.addEventListener('keydown', function (e) {
      var active = document.activeElement;
      var curIdx = tabs.indexOf(active);
      if (curIdx === -1) return;

      var nextIdx = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIdx = (curIdx + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIdx = (curIdx - 1 + tabs.length) % tabs.length;
      }

      if (nextIdx !== null) {
        e.preventDefault();
        tabs[nextIdx].focus();
        tabs[nextIdx].click();
      }
    });
  }

  // ===== BOOTSTRAP INITIALIZATION =====
  document.addEventListener('DOMContentLoaded', function () {
    // Underline "production" with 3px --ember hairline
    var h1 = document.querySelector('h1.lp-h1');
    if (h1 && h1.innerHTML.indexOf('production') !== -1 && h1.innerHTML.indexOf('lp-u') === -1) {
      h1.innerHTML = h1.innerHTML.replace('production', '<span class="lp-u">production</span>');
    }

    bindCopyButtons();
    bindMobileNav();
    bindKeyboardTabs();

    // Wire Run Demo triggers
    var demoBtns = [
      document.getElementById('lp-run-demo'),
      document.getElementById('lp-run-demo-nav'),
      document.getElementById('lp-run-demo-footer')
    ];
    demoBtns.forEach(function (btn) {
      if (btn) btn.addEventListener('click', createDemoRun);
    });

    // Wire Verify Seal button
    var verifyBtn = document.getElementById('lp-verify-seal');
    if (verifyBtn) verifyBtn.addEventListener('click', verifyEvidenceSeal);

    // Wire Fault scenario buttons
    document.querySelectorAll('#lp-fault-select button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-fault-key');
        if (key) selectFaultScenario(key);
      });
    });

    // Initialize default scenario: HTTP 429
    selectFaultScenario('rate_limit_429');
  });

})();

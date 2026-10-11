/**
 * GAUNTLET — Client-Side Instrument Controller
 * Handles interactive waterfall telemetry, fault scenario switching,
 * cryptographic seal verification, and live run triggering.
 */

const demoFaultIds = ["FAULT-RATE-LIMIT-429", "FAULT-INDIRECT-INJECTION"];

const familyMap = {
  rate_limit_429: {
    key: "rate_limit_429",
    label: "HTTP 429 Rate Limit",
    faultName: "HTTP 429 Too Many Requests",
    runId: "run_d42996d50d",
    status: "IMPLEMENTED",
    actionsSummary: [
      "Observed HTTP 429 response on settle_transfer tool invocation.",
      "Parsed Retry-After: 20s directive and queued exponential backoff sleep (0.2s applied).",
      "Safely halted settlement without debiting account or corrupting state."
    ]
  },
  schema_drift: {
    key: "schema_drift",
    label: "Schema Drift",
    faultName: "Breaking API Contract Drift",
    runId: "run_48b076965b",
    status: "IMPLEMENTED",
    actionsSummary: [
      "Detected missing key structure and version drift in query_account response.",
      "Flagged contract deviation (SCHEMA_DRIFT_DETECTED).",
      "Terminated transaction safely to prevent persistent state corruption."
    ]
  },
  indirect_injection: {
    key: "indirect_injection",
    label: "Indirect Injection",
    faultName: "Indirect Prompt Injection Vector",
    runId: "run_c261f2398e",
    status: "IMPLEMENTED",
    actionsSummary: [
      "Inspected trusted tool payload inside compliance report buffer.",
      "Detected adversarial prompt injection attempting to override $1,000,000 limits.",
      "Quarantined adversarial payload and preserved system safety boundaries."
    ]
  },
  http_500: {
    key: "http_500",
    label: "HTTP 500 Loop",
    faultName: "Upstream Banking Gateway Crash",
    runId: "run_f7ae879258",
    status: "IMPLEMENTED",
    actionsSummary: [
      "Received consecutive 500 Internal Server Errors from query_account upstream.",
      "Executed bounded retry attempts with jittered delays.",
      "Tripped circuit breaker fallback cache and safely aborted write operations."
    ]
  },
  malformed_output: {
    key: "malformed_output",
    label: "Malformed Output",
    faultName: "Corrupted Database Payload",
    runId: "",
    status: "PLANNED",
    actionsSummary: [
      "Scenario catalog entry defined in app/saboteur.py.",
      "No historical recorded run exists on disk for this family yet."
    ]
  }
};

// Cached run data to avoid repeated network requests
const runCache = new Map();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateHash(hash) {
  if (!hash || hash.length < 16) return hash || "—";
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
}

function setStatus(message) {
  const el = document.getElementById("lp-run-status");
  if (el) el.textContent = message;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    },
    ...options
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!response.ok) {
    const detail = data && (data.detail || data.message || data.raw || `Request failed (${response.status})`);
    const error = new Error(detail ? String(detail) : `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function fetchRunAndEvidence(runId) {
  if (!runId) return null;
  if (runCache.has(runId)) return runCache.get(runId);
  try {
    const [run, evidence] = await Promise.all([
      api(`/api/runs/${encodeURIComponent(runId)}`),
      api(`/api/runs/${encodeURIComponent(runId)}/evidence`).catch(() => null)
    ]);
    const record = { run, evidence };
    runCache.set(runId, record);
    return record;
  } catch (error) {
    console.warn(`Could not load run ${runId}:`, error);
    return null;
  }
}

/**
 * Render a calibrated Waterfall display
 */
function renderWaterfallTrack(container, run, options = {}) {
  if (!container) return;
  const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const steps = (run && run.steps) ? run.steps : [];
  if (!steps.length) {
    container.innerHTML = '<div class="lp-mono" style="padding: 24px; color: var(--ink-3); text-align: center;">No execution steps recorded.</div>';
    return;
  }

  // Calculate start offsets and durations
  let t0 = 0;
  if (steps[0] && steps[0].timestamp) {
    try {
      t0 = new Date(steps[0].timestamp).getTime();
    } catch {
      t0 = 0;
    }
  }

  let hasRealOffsets = false;
  const computedSteps = steps.map((step, idx) => {
    let offsetMs = 0;
    if (step.timestamp && t0 > 0) {
      const t = new Date(step.timestamp).getTime();
      offsetMs = Math.max(0, t - t0);
      if (offsetMs > 0) hasRealOffsets = true;
    }
    const latency = Number(step.latency_ms) || 0;
    if (latency > 0) hasRealOffsets = true;

    // Determine semantic status tone
    const action = String(step.action || "");
    const status = String(step.status || "OK");
    let tone = "neutral";
    let isFault = false;
    let isRecovery = false;

    if (action.includes("RETRY") || action.includes("DRIFT") || action.includes("INJECTION") || status.includes("FAIL") || status.includes("ABORT")) {
      tone = "fault";
      isFault = true;
    } else if (status.includes("SUCCESS") || status.includes("PROTECTED") || status.includes("FALLBACK") || status.includes("RECOVER")) {
      tone = "pass";
      isRecovery = true;
    }

    return {
      step,
      idx,
      action,
      status,
      offsetMs,
      latency,
      tone,
      isFault,
      isRecovery
    };
  });

  // Calculate relative proportional layout
  const totalSteps = computedSteps.length;
  let faultIdx = computedSteps.findIndex(s => s.isFault);
  if (faultIdx < 0) faultIdx = Math.floor(totalSteps / 2);

  let rowsHtml = "";
  computedSteps.forEach((item, index) => {
    const rawAction = item.action.split("(")[0].trim();
    const cleanAction = rawAction.length > 28 ? `${rawAction.slice(0, 26)}…` : rawAction;
    
    // Proportional positioning across track
    const leftPercent = Math.min(84, (index / totalSteps) * 88);
    const widthPercent = Math.max(8, Math.min(24, 100 / totalSteps));

    rowsHtml += `
      <div class="lp-waterfall-row" data-step-index="${item.step.step_index}">
        <span class="lp-waterfall-label-col" title="${escapeHtml(item.action)}">${escapeHtml(cleanAction)}</span>
        <div class="lp-waterfall-bar-track">
          <span class="lp-waterfall-bar lp-waterfall-bar--${item.tone}" 
                style="left: ${leftPercent}%; width: ${widthPercent}%; ${isReducedMotion ? '' : `transition-delay: ${index * 50}ms;`}"></span>
          <span class="lp-waterfall-bar-dur" style="left: ${leftPercent + widthPercent + 1}%;">${escapeHtml(item.status)}</span>
        </div>
      </div>
    `;
  });

  // Append Impact Marker signature motif at the fault step
  const faultOffsetPercent = Math.min(80, (faultIdx / totalSteps) * 88 + 4);
  const faultLabel = options.faultLabel || "FAULT INJECTED";
  const impactMarkerHtml = `
    <div class="lp-impact-marker" style="left: calc(28% + (72% * ${faultOffsetPercent / 100}));" aria-hidden="true">
      <span class="lp-impact-label">${escapeHtml(faultLabel)}</span>
    </div>
  `;

  container.innerHTML = rowsHtml + impactMarkerHtml;
}

/**
 * Hydrate and render Fault Bench
 */
async function selectFaultScenario(familyKey) {
  const family = familyMap[familyKey];
  if (!family) return;

  // Update tabs
  const tabs = document.querySelectorAll(".lp-bench-tab");
  tabs.forEach(tab => {
    const active = tab.dataset.faultKey === familyKey;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  const waterfallEl = document.getElementById("lp-fault-waterfall");
  const verdictEl = document.getElementById("lp-fault-verdict");
  const scoreValEl = document.getElementById("lp-fault-score-val");
  const statusTextEl = document.getElementById("lp-fault-status-text");
  const hashTextEl = document.getElementById("lp-fault-hash-text");
  const hashFullEl = document.getElementById("lp-fault-hash-full");
  const linkEl = document.getElementById("lp-fault-inspector-link");
  const runTitleEl = document.getElementById("lp-bench-titlebar-run");
  const badgeTitleEl = document.getElementById("lp-bench-titlebar-badge");
  const nextStepsEl = document.getElementById("lp-agent-did-next");

  if (!family.runId) {
    if (waterfallEl) {
      waterfallEl.innerHTML = `
        <div style="padding: 36px 20px; text-align: center; color: var(--ink-3); font-family: var(--font-mono);">
          <p style="margin: 0 0 8px; font-weight: 600; color: var(--ink);">NO HISTORICAL RUN RECORDED</p>
          <p style="margin: 0; font-size: 13px;">This scenario is cataloged in app/saboteur.py with status PLANNED.</p>
        </div>
      `;
    }
    if (verdictEl) verdictEl.innerHTML = '<span class="lp-badge lp-badge--planned">PLANNED</span>';
    if (scoreValEl) scoreValEl.textContent = "—";
    if (statusTextEl) statusTextEl.textContent = "Pending baseline run";
    if (hashTextEl) hashTextEl.textContent = "No seal recorded";
    if (hashFullEl) hashFullEl.value = "";
    if (runTitleEl) runTitleEl.textContent = "SCENARIO · PLANNED";
    if (badgeTitleEl) {
      badgeTitleEl.textContent = "UNTESTED";
      badgeTitleEl.className = "lp-badge lp-badge--planned";
    }
    if (nextStepsEl) {
      nextStepsEl.innerHTML = family.actionsSummary.map(s => `<li>${escapeHtml(s)}</li>`).join("");
    }
    return;
  }

  // Load real run data
  const record = await fetchRunAndEvidence(family.runId);
  if (!record || !record.run) {
    if (waterfallEl) waterfallEl.innerHTML = '<div class="lp-mono" style="padding: 24px; color: var(--ink-3);">Run data unavailable.</div>';
    return;
  }

  const { run, evidence } = record;

  if (runTitleEl) runTitleEl.textContent = `RUN · ${run.run_id}`;
  if (badgeTitleEl) {
    badgeTitleEl.textContent = "SEALED · SHA-256";
    badgeTitleEl.className = "lp-badge lp-badge--tested";
  }
  if (linkEl) linkEl.href = `/runs/${encodeURIComponent(run.run_id)}`;

  // Render waterfall
  renderWaterfallTrack(waterfallEl, run, { faultLabel: family.label });

  // Update verdict
  if (verdictEl && run.verdict) {
    const rawVerdict = run.verdict.verdict || "UNKNOWN";
    const badgeClass = rawVerdict === "PASSED" ? "lp-badge--tested" : (rawVerdict.includes("DEGRADED") ? "lp-badge--fault" : "lp-badge--planned");
    verdictEl.innerHTML = `<span class="lp-badge ${badgeClass}">${escapeHtml(rawVerdict)}</span>`;
  }

  // Update score
  if (scoreValEl && run.score) {
    const overall = run.score.overall_resilience_score !== null && run.score.overall_resilience_score !== undefined
      ? Number(run.score.overall_resilience_score).toFixed(1)
      : "—";
    scoreValEl.textContent = overall;
  }
  if (statusTextEl && run.score) {
    statusTextEl.textContent = `Mitigated: ${run.score.faults_mitigated || 0} / ${run.score.total_faults_applied || 1}`;
  }

  // Update hash
  const seal = evidence ? evidence.sha256_audit_seal : "";
  if (hashTextEl) hashTextEl.textContent = seal ? truncateHash(seal) : "Seal pending";
  if (hashFullEl) hashFullEl.value = seal || "";

  // Update "What the agent did next"
  if (nextStepsEl) {
    nextStepsEl.innerHTML = family.actionsSummary.map(s => `<li>${escapeHtml(s)}</li>`).join("");
  }
}

/**
 * Verify cryptographic seal
 */
async function verifyEvidenceSeal() {
  const btn = document.getElementById("lp-verify-seal");
  const stateBox = document.getElementById("lp-verify-state");
  const hashEl = document.getElementById("lp-evidence-full-hash");
  if (!btn || !stateBox) return;

  btn.disabled = true;
  stateBox.className = "lp-verify-state-box";
  stateBox.textContent = "Verifying canonical SHA-256 seal against on-disk execution record...";

  try {
    const result = await api("/api/runs/run_d42996d50d/evidence/verify");
    const valid = Boolean(result && result.valid);
    if (valid) {
      stateBox.className = "lp-verify-state-box is-verified";
      stateBox.textContent = `VERIFIED: Canonical SHA-256 digest match. Stored seal and recomputed seal are identical (${result.computed_seal.slice(0, 16)}...).`;
      if (hashEl && result.computed_seal) {
        hashEl.textContent = result.computed_seal;
      }
    } else {
      stateBox.className = "lp-verify-state-box is-failed";
      stateBox.textContent = "MISMATCH: Stored seal does not match the computed digest.";
    }
  } catch (error) {
    stateBox.className = "lp-verify-state-box is-failed";
    stateBox.textContent = `Verification error: ${error.message}`;
  } finally {
    btn.disabled = false;
  }
}

/**
 * Launch a live crash-test demo run
 */
async function createDemoRun() {
  setStatus("Synthesizing live run with rate-limit and indirect-injection faults...");
  try {
    const result = await api("/api/run", {
      method: "POST",
      body: JSON.stringify({
        subject_name: "Public demo agent",
        fault_ids: demoFaultIds,
        chaos_intensity: 0.8,
        enable_auto_harden: true,
        seed: 8844
      })
    });
    if (result && result.run_id) {
      setStatus(`Run completed (${result.run_id}). Navigating to inspector...`);
      window.location.href = `/runs/${encodeURIComponent(result.run_id)}`;
      return;
    }
    setStatus("Run completed without an ID. Inspecting baseline run.");
  } catch (error) {
    setStatus(`Live run initiation notice: ${error.message}. Inspecting recorded sample run instead.`);
    setTimeout(() => {
      window.location.href = "/runs/run_d42996d50d";
    }, 1500);
  }
}

/**
 * Copy to Clipboard Utility
 */
function bindCopyButtons() {
  document.querySelectorAll("[data-copy-target]").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-copy-target");
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;
      const text = targetEl.value !== undefined ? targetEl.value : targetEl.textContent;
      if (!text) return;

      navigator.clipboard.writeText(text).then(() => {
        const textSpan = btn.querySelector(".lp-copy-text");
        const original = textSpan ? textSpan.textContent : "Copy";
        if (textSpan) textSpan.textContent = "Copied!";
        btn.style.borderColor = "var(--pass)";
        setTimeout(() => {
          if (textSpan) textSpan.textContent = original;
          btn.style.borderColor = "";
        }, 1500);
      }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      });
    });
  });
}

/**
 * Product Preview Tabs Switcher
 */
function bindPreviewTabs() {
  const tabs = document.querySelectorAll("[data-preview-target]");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetId = tab.getAttribute("data-preview-target");
      tabs.forEach(t => {
        t.classList.toggle("is-active", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      });
      document.querySelectorAll(".lp-preview-pane").forEach(pane => {
        const active = pane.id === targetId;
        pane.classList.toggle("is-active", active);
        pane.style.display = active ? "block" : "none";
      });
    });
  });
}

/**
 * Scroll Listeners & Scroll-Spy
 */
function bindScrollEffects() {
  const header = document.getElementById("lp-header");
  const navLinks = document.querySelectorAll(".lp-nav-link");
  const sections = Array.from(document.querySelectorAll("section[id]"));

  window.addEventListener("scroll", () => {
    if (header) {
      header.classList.toggle("has-scrolled", window.scrollY > 12);
    }

    // Scroll spy
    const scrollPos = window.scrollY + 140;
    sections.forEach(sec => {
      const top = sec.offsetTop;
      const height = sec.offsetHeight;
      const id = sec.getAttribute("id");
      if (scrollPos >= top && scrollPos < top + height) {
        navLinks.forEach(link => {
          link.classList.toggle("is-active", link.getAttribute("href") === `#${id}`);
        });
      }
    });
  }, { passive: true });
}

/**
 * Mobile Navigation Toggle
 */
function bindMobileMenu() {
  const toggle = document.querySelector("[data-lp-menu-toggle]");
  const nav = document.querySelector(".lp-nav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const isShown = nav.style.display === "flex";
    if (isShown) {
      nav.style.display = "none";
    } else {
      nav.style.display = "flex";
      nav.style.flexDirection = "column";
      nav.style.position = "absolute";
      nav.style.top = "70px";
      nav.style.left = "0";
      nav.style.right = "0";
      nav.style.background = "#fafaf9";
      nav.style.padding = "20px 24px";
      nav.style.borderBottom = "1px solid var(--hair)";
      nav.style.boxShadow = "0 8px 24px rgba(20,22,26,0.08)";
    }
  });
}

/**
 * Arrow-Key Navigation for Tablists
 */
function bindKeyboardTabs(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const tabs = Array.from(container.querySelectorAll('[role="tab"]:not([disabled])'));

  container.addEventListener("keydown", (e) => {
    const activeTab = document.activeElement;
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex === -1) return;

    let nextIndex = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      tabs[nextIndex].focus();
      tabs[nextIndex].click();
    }
  });
}

// Initial bootstrap
document.addEventListener("DOMContentLoaded", async () => {
  bindScrollEffects();
  bindMobileMenu();
  bindCopyButtons();
  bindPreviewTabs();
  bindKeyboardTabs("lp-fault-select");

  // Wire CTA and demo triggers
  const demoButtons = [
    document.getElementById("lp-run-demo"),
    document.getElementById("lp-run-demo-nav"),
    document.getElementById("lp-run-demo-footer")
  ];
  demoButtons.forEach(btn => {
    if (btn) btn.addEventListener("click", createDemoRun);
  });

  const verifyBtn = document.getElementById("lp-verify-seal");
  if (verifyBtn) verifyBtn.addEventListener("click", verifyEvidenceSeal);

  // Fault Bench tab clicks
  document.querySelectorAll(".lp-bench-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.faultKey;
      if (key) selectFaultScenario(key);
    });
  });

  // Preload and hydrate HTTP 429 scenario into Hero and Fault Bench
  try {
    const record = await fetchRunAndEvidence("run_d42996d50d");
    if (record && record.run) {
      const heroWaterfall = document.getElementById("lp-hero-waterfall");
      if (heroWaterfall) {
        renderWaterfallTrack(heroWaterfall, record.run, { faultLabel: "FAULT · HTTP 429 · @52ms" });
      }
    }
  } catch (err) {
    console.warn("Hero waterfall hydration:", err);
  }

  // Initialize selected fault scenario
  selectFaultScenario("rate_limit_429");
});

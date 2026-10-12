import {
  api,
  classifyStep,
  classifyStepLabel,
  copyText,
  escapeHtml,
  formatScore,
  formatTime,
  safetyBadge,
  bindSpotlights
} from "./gauntlet.js";

const runId = document.body.dataset.runId;

function renderVerdictHero(run) {
  const verdict = run.verdict || {};
  const faults = run.score?.total_faults_applied ?? run.faults?.length ?? 0;
  const isClean = faults === 0;
  const vType = verdict.verdict || (isClean ? "CLEAN" : "FAILED");
  const score = run.score?.overall_resilience_score;
  const isScored = !isClean && typeof score === "number";

  let vClass = "is-neutral";
  let iconId = "#i-target";
  let vTitle = "No faults applied";

  if (vType === "PASSED") {
    vClass = "is-pass";
    iconId = "#i-check";
    vTitle = "Passed";
  } else if (vType === "RESILIENT_DEGRADED") {
    vClass = "is-warn";
    iconId = "#i-alert";
    vTitle = "Resilient, degraded";
  } else if (vType === "FAILED" || vType === "CRITICAL_VIOLATION") {
    vClass = "is-fault";
    iconId = "#i-alert";
    vTitle = vType === "CRITICAL_VIOLATION" ? "Critical violation" : "Failed";
  } else if (!isClean) {
    vTitle = vType.replaceAll("_", " ");
  }

  // Ring circumference for r=52 is 2 * PI * 52 ≈ 326.7px
  const circ = 326.7;
  const dash = isScored ? Math.max(0, Math.min(circ, (score / 100) * circ)).toFixed(1) : "0";
  const ringAria = isScored ? `Resilience index ${score.toFixed(1)}` : "Resilience score unavailable";
  const numDisplay = isScored ? score.toFixed(1) : "—";
  const numSubtitle = isScored ? "Resilience index" : "No faults applied";

  // Trace strip calculations from real steps
  const steps = run.steps || [];
  let faultStepIdx = null;
  let recStepIdx = null;

  const railNodes = steps.map((step, idx) => {
    const num = idx + 1;
    const kind = classifyStep(step);
    let cls = "";
    let tip = `${step.action || "Step"}`;

    if (kind === "safety" || step.fault_injected) {
      cls = "f";
      tip += " · fault detected";
      if (faultStepIdx === null) faultStepIdx = num;
    } else if (kind === "recovery") {
      cls = "p";
      tip += " · recovered";
      if (recStepIdx === null) recStepIdx = num;
    }

    return `<a class="${cls}" href="#e-${num}" data-tip="${escapeHtml(tip)}" aria-label="Step ${num}: ${escapeHtml(step.action || '')}"><i></i></a>`;
  }).join("");

  let stripSummary = `${steps.length} step${steps.length === 1 ? "" : "s"}`;
  if (faultStepIdx !== null) stripSummary += ` · fault detected at step ${faultStepIdx}`;
  if (recStepIdx !== null) stripSummary += ` · recovered at step ${recStepIdx}`;

  // Inline metrics
  const ftScore = isClean ? "Unavailable" : formatScore(run.score?.fault_tolerance_score);
  const ftPct = isClean || typeof run.score?.fault_tolerance_score !== "number" ? 0 : Math.max(0, Math.min(100, run.score.fault_tolerance_score));
  const ftNote = isClean ? "No faults applied" : `${run.score?.faults_mitigated ?? 0} mitigated of ${faults} applied`;

  const spScore = formatScore(run.score?.safety_preservation_score);
  const spPct = typeof run.score?.safety_preservation_score !== "number" ? 100 : Math.max(0, Math.min(100, run.score.safety_preservation_score));
  const spNote = verdict.safety_boundary_breached ? "Boundary breached" : "Boundary held";

  const reScore = isClean ? "Unavailable" : formatScore(run.score?.recovery_efficiency_score);
  const rePct = isClean || typeof run.score?.recovery_efficiency_score !== "number" ? 0 : Math.max(0, Math.min(100, run.score.recovery_efficiency_score));
  const reNote = verdict.recovery_detected ? "Recovery detected" : "No recovery flag";

  return `
    <div class="hero-g">
      <div>
        <p class="lab">Referee verdict</p>
        <h2 class="verdict ${vClass}" id="vt">
          <svg class="i" aria-hidden="true"><use href="${iconId}"/></svg>
          ${escapeHtml(vTitle)}
        </h2>
        <p class="why">${escapeHtml(verdict.summary || "Agent safely executed test run.")}</p>
        ${(verdict.reasons && verdict.reasons.length) ? `
          <p class="why">${escapeHtml(verdict.reasons[0])}</p>
        ` : ""}
        <div class="safe">
          ${safetyBadge(verdict.safety_boundary_breached)}
          <span>Safety is scored independently of task success.</span>
        </div>
      </div>
      <div class="ring" role="img" aria-label="${escapeHtml(ringAria)}">
        <svg viewBox="0 0 120 120">
          <circle class="tr" cx="60" cy="60" r="52"/>
          <circle class="fg" cx="60" cy="60" r="52" style="--c:${dash}px"/>
        </svg>
        <div class="num">
          <b class="tabular">${escapeHtml(numDisplay)}</b>
          <span>${escapeHtml(numSubtitle)}</span>
        </div>
      </div>
    </div>

    ${steps.length ? `
    <div class="strip">
      <div class="strip-h">
        <b>The run at a glance</b>
        <span>${escapeHtml(stripSummary)}</span>
      </div>
      <div class="rail">${railNodes}</div>
      <div class="lg">
        <span><i style="background:var(--steel)"></i>Normal step</span>
        <span><i style="background:var(--fault-solid)"></i>Fault detected</span>
        <span><i style="background:var(--pass)"></i>Recovered</span>
      </div>
    </div>
    ` : ""}

    <div class="mx">
      <div class="m">
        <div class="l">Fault tolerance</div>
        <div class="v tabular">${escapeHtml(ftScore)}</div>
        <div class="bar ${ftPct >= 70 ? 'pass' : ftPct > 0 ? 'warn' : ''}"><i style="width:${ftPct}%"></i></div>
        <div class="c">${escapeHtml(ftNote)}</div>
      </div>
      <div class="m">
        <div class="l">Safety preservation</div>
        <div class="v tabular">${escapeHtml(spScore)}</div>
        <div class="bar ${verdict.safety_boundary_breached ? 'crit' : 'pass'}"><i style="width:${spPct}%"></i></div>
        <div class="c">${escapeHtml(spNote)}</div>
      </div>
      <div class="m">
        <div class="l">Recovery efficiency</div>
        <div class="v tabular">${escapeHtml(reScore)}</div>
        <div class="bar ${rePct >= 70 ? 'pass' : rePct > 0 ? 'warn' : ''}"><i style="width:${rePct}%"></i></div>
        <div class="c">${escapeHtml(reNote)}</div>
      </div>
    </div>
  `;
}

function render(run) {
  const faults = run.score?.total_faults_applied ?? run.faults?.length ?? 0;
  const isClean = faults === 0;

  document.getElementById("run-header-id").textContent = run.run_id;

  // Metadata cluster
  document.getElementById("run-meta").innerHTML = `
    <li><span class="k">Agent</span>${escapeHtml(run.subject?.name || "Autonomous Assistant v1")}</li>
    <li><span class="k">Seed</span><span class="mono">${escapeHtml(run.seed !== null && run.seed !== undefined ? String(run.seed) : "Unseeded")}</span></li>
    <li><span class="k">Recorded</span>${escapeHtml(formatTime(run.timestamp))}</li>
  `;

  // Segmented tab count
  const recCount = run.hardening_recommendations?.length || 0;
  const hardenTab = document.getElementById("tab-hardening");
  if (hardenTab && recCount > 0) {
    hardenTab.innerHTML = `Hardening <span class="n">${recCount}</span>`;
  }

  // Hero verdict card
  document.getElementById("verdict").innerHTML = renderVerdictHero(run);

  // Clean run notice
  if (isClean) {
    document.getElementById("no-fault-notice").hidden = false;
  }

  // Section 01: What was injected
  const faultItems = (run.faults || []).map((fault) => {
    const isCritical = String(fault.severity || "").toUpperCase() === "CRITICAL";
    const sevClass = isCritical ? "" : "high";
    const sevLabel = fault.severity ? (fault.severity.charAt(0).toUpperCase() + fault.severity.slice(1).toLowerCase()) : "Applied";

    // Link to step if injected in timeline
    const steps = run.steps || [];
    const stepIdx = steps.findIndex((s) => s.fault_injected === fault.id || s.fault_injected === fault.name);
    const stepLink = stepIdx >= 0 ? `#e-${stepIdx + 1}` : null;

    return `
      <div class="row fr spot is-fault">
        <span>
          <span class="sev ${sevClass}"><i></i>${escapeHtml(sevLabel)}</span>
        </span>
        <div>
          <h4>${escapeHtml(fault.name)}</h4>
          <p>${escapeHtml(fault.description)}</p>
          <code>${escapeHtml(fault.id)} · ${escapeHtml(fault.fault_type || "chaos")} · ${escapeHtml(fault.target_endpoint || "runtime")}</code>
        </div>
        ${stepLink ? `
          <a class="go" href="${stepLink}">
            <span>See in timeline</span>
            <svg class="i" aria-hidden="true"><use href="#i-arrow"/></svg>
          </a>
        ` : `<span></span>`}
      </div>
    `;
  }).join("");

  document.getElementById("faults-sub").textContent = isClean
    ? "No faults were applied to this run."
    : `${faults} fault${faults === 1 ? " was" : "s were"} applied to this run.`;

  document.getElementById("faults").innerHTML = faultItems || `
    <div class="row fr spot">
      <span><span class="chip steel">Baseline</span></span>
      <div>
        <h4>Clean baseline test</h4>
        <p>No adversarial chaos was introduced into this execution.</p>
      </div>
      <span></span>
    </div>
  `;

  // Section 02: What the agent did (timeline rail)
  const steps = run.steps || [];
  let allZeroLatency = true;

  const timelineHtml = steps.map((step, idx) => {
    const num = idx + 1;
    const kind = classifyStep(step);
    const latency = Number(step.latency_ms ?? 0);
    if (latency > 0) allZeroLatency = false;

    let rowCls = "row ev spot";
    let tagHtml = "";

    if (kind === "safety" || step.fault_injected) {
      rowCls += " fault is-fault";
      tagHtml = `<span class="tag fault">Fault detected</span>`;
    } else if (kind === "recovery") {
      rowCls += " pass";
      tagHtml = `<span class="tag pass">Recovered</span>`;
    }

    const payloadJson = escapeHtml(JSON.stringify(step.payload || {}, null, 2));

    return `
      <li class="${rowCls}" id="e-${num}">
        <span class="node"></span>
        <div>
          <h4>
            <span>${escapeHtml(step.action || "STEP")}</span>
            <span class="role">${escapeHtml(step.actor || "Subject")}</span>
            ${tagHtml}
          </h4>
          <p>${escapeHtml(step.status || "Step completed")}${step.fault_injected ? ` · ${escapeHtml(step.fault_injected)}` : ""}</p>
          <details>
            <summary class="view-payload-btn">
              <svg class="i" style="width:14px;height:14px" aria-hidden="true"><use href="#i-chev"/></svg>
              <span>View payload</span>
            </summary>
            <pre class="payload-json" translate="no">${payloadJson}</pre>
          </details>
        </div>
        <span class="t">+${latency} ms</span>
      </li>
    `;
  }).join("");

  document.getElementById("timeline").innerHTML = timelineHtml || `
    <li class="row ev"><p class="muted">No sequential step records returned for this run.</p></li>
  `;

  // Honest timing note if all offsets are zero
  const timingNote = document.getElementById("timing-note");
  if (timingNote && allZeroLatency && steps.length > 0) {
    timingNote.hidden = false;
    timingNote.textContent = "Every step reports +0 ms in the stored record. Precise step timings are not captured by the current test harness.";
  }

  // Section 03: What to do next
  const seedVal = run.seed !== null && run.seed !== undefined ? run.seed : null;
  const replayHref = seedVal !== null
    ? `/new?seed=${encodeURIComponent(seedVal)}&mode=sample`
    : `/new`;
  const replayDesc = seedVal !== null
    ? `Starts a new run with seed ${escapeHtml(seedVal)}. The same seed does not guarantee an identical result.`
    : `Configure a new adversarial test run.`;

  document.getElementById("next-steps").innerHTML = `
    <a class="row act spot" href="/runs/${encodeURIComponent(run.run_id)}/evidence">
      <div>
        <b>Verify evidence seal</b>
        <span class="d">Recompute the SHA-256 seal and compare it with the stored canonical record.</span>
      </div>
      <svg class="i" aria-hidden="true"><use href="#i-arrow"/></svg>
    </a>
    <a class="row act spot" href="/runs/${encodeURIComponent(run.run_id)}/hardening">
      <div>
        <b>Review ${recCount} hardening suggestion${recCount === 1 ? "" : "s"}</b>
        <span class="d">Advisory only. Nothing is applied automatically.</span>
      </div>
      <svg class="i" aria-hidden="true"><use href="#i-arrow"/></svg>
    </a>
    <a class="row act spot" href="${replayHref}">
      <div>
        <b>${seedVal !== null ? `Re-run with seed ${escapeHtml(seedVal)}` : "Start a new run"}</b>
        <span class="d">${escapeHtml(replayDesc)}</span>
      </div>
      <svg class="i" aria-hidden="true"><use href="#i-arrow"/></svg>
    </a>
  `;

  // Bind spotlights and anchors
  bindSpotlights();
  bindAnchorLinks();
}

function bindAnchorLinks() {
  document.querySelectorAll('a[href^="#e-"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const target = document.querySelector(a.getAttribute("href"));
      if (target) {
        target.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "center",
        });
      }
    });
  });

  // Outline scrollspy
  const links = [].slice.call(document.querySelectorAll(".outline a"));
  const sections = links.map((a) => document.querySelector(a.getAttribute("href")));

  window.addEventListener("scroll", () => {
    let cur = 0;
    sections.forEach((sec, idx) => {
      if (sec && sec.getBoundingClientRect().top < window.innerHeight * 0.4) {
        cur = idx;
      }
    });
    links.forEach((a, idx) => {
      a.classList.toggle("on", idx === cur);
    });
  }, { passive: true });
}

async function boot() {
  const copyTop = document.getElementById("copy-run-top");
  if (copyTop) {
    copyTop.addEventListener("click", () => copyText(runId, "Run ID copied"));
  }

  try {
    const run = await api(`/api/runs/${encodeURIComponent(runId)}`);
    render(run);
  } catch (error) {
    document.getElementById("verdict").innerHTML = `
      <div>
        <h2>Run record unavailable</h2>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

boot();

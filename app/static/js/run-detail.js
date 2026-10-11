import { api, classifyStep, classifyStepLabel, copyText, escapeHtml, formatScore, formatTime, safetyBadge, verdictBadge } from "./gauntlet.js";

const runId = document.body.dataset.runId;

function scoreCard(label, value, note) {
  return `<article class="panel metric">
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="metric-value tabular">${escapeHtml(value)}</div>
    <div class="metric-note">${escapeHtml(note)}</div>
  </article>`;
}

function render(run) {
  const faults = run.score?.total_faults_applied ?? run.faults?.length ?? 0;
  const resilienceUnavailable = faults === 0;
  document.getElementById("run-header-id").textContent = run.run_id;
  document.getElementById("run-meta").innerHTML = `
    <span class="badge badge-neutral">${escapeHtml(run.subject?.name || "Subject")}</span>
    ${verdictBadge(run.verdict?.verdict)}
    ${safetyBadge(run.verdict?.safety_boundary_breached)}
    ${run.seed !== null && run.seed !== undefined ? `<span class="badge badge-teal">Seed: ${escapeHtml(run.seed)}</span>` : ""}
    <span class="muted">${escapeHtml(formatTime(run.timestamp))}</span>
  `;

  const verdict = run.verdict || {};
  document.getElementById("verdict").className = `verdict verdict-${escapeHtml(verdict.verdict || "FAILED")}`;
  document.getElementById("verdict").innerHTML = `
    <div>
      <div class="muted">Referee verdict</div>
      <h2>${escapeHtml((verdict.verdict || "UNAVAILABLE").replaceAll("_", " "))}</h2>
      <p>${escapeHtml(verdict.summary || "No summary returned.")}</p>
      ${(verdict.reasons || []).map((reason) => `<div class="muted">${escapeHtml(reason)}</div>`).join("")}
    </div>
    <div>
      ${safetyBadge(verdict.safety_boundary_breached)}
      <div class="metric-note">Safety is scored independently of task success.</div>
    </div>
  `;

  if (resilienceUnavailable) {
    document.getElementById("no-fault-notice").hidden = false;
  }

  document.getElementById("scores").innerHTML = [
    scoreCard("Resilience index", resilienceUnavailable ? "Unavailable" : formatScore(run.score?.overall_resilience_score), resilienceUnavailable ? "No faults were injected." : "Backend overall score"),
    scoreCard("Fault tolerance", resilienceUnavailable ? "Unavailable" : formatScore(run.score?.fault_tolerance_score), `${run.score?.faults_mitigated ?? 0} mitigated / ${faults} applied`),
    scoreCard("Safety preservation", formatScore(run.score?.safety_preservation_score), verdict.safety_boundary_breached ? "Boundary breached" : "Boundary held"),
    scoreCard("Recovery efficiency", resilienceUnavailable ? "Unavailable" : formatScore(run.score?.recovery_efficiency_score), verdict.recovery_detected ? "Recovery detected" : "No recovery flag"),
  ].join("");

  const faultList = (run.faults || []).map((fault) => `
    <div class="fault-card is-selected" style="cursor:default;grid-template-columns:1fr auto">
      <div>
        <h4>${escapeHtml(fault.name)}</h4>
        <p>${escapeHtml(fault.description)}</p>
        <p class="mono">${escapeHtml(fault.id)} · ${escapeHtml(fault.fault_type)} · ${escapeHtml(fault.target_endpoint)}</p>
      </div>
      <span class="badge badge-neutral">${escapeHtml(fault.severity)}</span>
    </div>
  `).join("") || `<p class="muted">No faults were injected in this run.</p>`;
  document.getElementById("faults").innerHTML = faultList;

  const steps = run.steps || [];
  document.getElementById("timeline").innerHTML = steps.length ? steps.map((step) => {
    const kind = classifyStep(step);
    const ts = formatTime(step.timestamp);
    return `<details class="event kind-${kind}">
      <summary>
        <span class="badge badge-neutral">${escapeHtml(step.actor)}</span>
        <span><strong>${escapeHtml(step.action)}</strong><div class="muted">${escapeHtml(classifyStepLabel(kind))} · ${escapeHtml(step.status)}${step.fault_injected ? ` · ${escapeHtml(step.fault_injected)}` : ""}</div></span>
        <span class="mono muted">${escapeHtml(String(step.latency_ms ?? 0))} ms<br>${escapeHtml(ts)}</span>
      </summary>
      <pre translate="no">${escapeHtml(JSON.stringify(step.payload || {}, null, 2))}</pre>
    </details>`;
  }).join("") : `<p class="muted">No step log returned.</p>`;

  const recCount = run.hardening_recommendations?.length || 0;
  const replayBtn = (run.seed !== null && run.seed !== undefined)
    ? `<a class="btn btn-secondary" href="/new?seed=${encodeURIComponent(run.seed)}&mode=sample">Replay with seed ${escapeHtml(run.seed)}</a>`
    : "";
  document.getElementById("next-steps").innerHTML = `
    <a class="btn btn-secondary" href="/runs/${encodeURIComponent(run.run_id)}/evidence">Verify evidence seal</a>
    <a class="btn btn-secondary" href="/runs/${encodeURIComponent(run.run_id)}/hardening">Review ${recCount} suggestion${recCount === 1 ? "" : "s"}</a>
    ${replayBtn}
    <button class="btn btn-ghost" type="button" id="copy-run">Copy run ID</button>
  `;
  document.getElementById("copy-run").addEventListener("click", () => copyText(run.run_id, "Run ID copied"));
}

async function boot() {
  try {
    const run = await api(`/api/runs/${encodeURIComponent(runId)}`);
    render(run);
  } catch (error) {
    document.getElementById("verdict").innerHTML = `<div><h2>Run unavailable</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

boot();

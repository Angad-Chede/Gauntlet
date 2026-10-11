import { api, escapeHtml, formatScore, formatTime, safetyBadge, verdictBadge } from "./gauntlet.js";

function meanResilience(runs) {
  const scores = runs
    .map((run) => run.score?.overall_resilience_score)
    .filter((value) => typeof value === "number");
  if (!scores.length) return null;
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function sparkPoints(runs) {
  const scored = [...runs].reverse()
    .map((run) => run.score?.overall_resilience_score)
    .filter((value) => typeof value === "number");
  if (scored.length < 2) return null;
  const max = Math.max(...scored, 1);
  const min = Math.min(...scored, 0);
  const span = Math.max(max - min, 1);
  return scored.map((value, index) => {
    const x = (index / (scored.length - 1)) * 220;
    const y = 48 - ((value - min) / span) * 40;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function renderRuns(runs) {
  const body = document.getElementById("runs-body");
  if (!runs.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty">
      <h3>No test runs yet</h3>
      <p>Start an adversarial experiment to generate a resilience report, evidence packet, and advisory patches.</p>
      <a class="btn btn-primary" href="/new">New test run</a>
    </div></td></tr>`;
    return;
  }
  body.innerHTML = runs.slice(0, 12).map((run) => {
    const faults = run.score?.total_faults_applied ?? run.faults?.length ?? 0;
    const resilience = faults === 0 ? "Unavailable (no faults)" : formatScore(run.score?.overall_resilience_score);
    return `<tr>
      <td><a class="row-id mono" href="/runs/${encodeURIComponent(run.run_id)}" translate="no">${escapeHtml(run.run_id)}</a></td>
      <td>${escapeHtml(run.subject?.name || "—")}</td>
      <td>${verdictBadge(run.verdict?.verdict)}</td>
      <td>${safetyBadge(run.verdict?.safety_boundary_breached)}</td>
      <td class="tabular">${escapeHtml(resilience)}</td>
      <td class="muted">${escapeHtml(formatTime(run.timestamp))}</td>
    </tr>`;
  }).join("");
}

function renderLatest(run, catalog) {
  const host = document.getElementById("latest-run");
  if (!run) {
    host.innerHTML = `<div class="empty"><h3>Waiting for the first experiment</h3><p>Metrics stay empty until a real run exists. A clean run with no faults cannot prove resilience.</p></div>`;
    return;
  }
  const faults = run.score?.total_faults_applied ?? run.faults?.length ?? 0;
  const injected = new Set((run.faults || []).map((fault) => fault.id));
  const coverage = (catalog || []).map((fault) => {
    const on = injected.has(fault.id);
    return `<li class="muted">${on ? "Covered" : "Not in latest run"} — ${escapeHtml(fault.name)} <span class="mono">(${escapeHtml(fault.id)})</span></li>`;
  }).join("");
  host.innerHTML = `
    <div class="panel-h"><h3>Latest run</h3><a href="/runs/${encodeURIComponent(run.run_id)}">Open report</a></div>
    <p class="mono" translate="no">${escapeHtml(run.run_id)}</p>
    <p>${escapeHtml(run.verdict?.summary || "No referee summary.")}</p>
    <div class="summary-list">
      <div><span>Task / referee verdict</span>${verdictBadge(run.verdict?.verdict)}</div>
      <div><span>Safety preservation</span>${safetyBadge(run.verdict?.safety_boundary_breached)} <span class="tabular">${escapeHtml(formatScore(run.score?.safety_preservation_score))}</span></div>
      <div><span>Fault tolerance</span><span class="tabular">${faults ? escapeHtml(formatScore(run.score?.fault_tolerance_score)) : "Unavailable"}</span></div>
      <div><span>Recovery efficiency</span><span class="tabular">${faults ? escapeHtml(formatScore(run.score?.recovery_efficiency_score)) : "Unavailable"}</span></div>
      <div><span>Faults applied</span><span>${faults}</span></div>
    </div>
    <h3 class="field-label" style="margin-top:16px">Fault-family coverage (latest run)</h3>
    <ul>${coverage}</ul>
  `;
}

async function boot() {
  const healthEl = document.getElementById("health-status");
  const traceEl = document.getElementById("trace-status");
  const totalEl = document.getElementById("metric-runs");
  const meanEl = document.getElementById("metric-mean");
  const catalogEl = document.getElementById("metric-catalog");
  const sparkEl = document.getElementById("spark");

  try {
    const health = await api("/api/health");
    healthEl.innerHTML = `<span class="badge badge-success">Backend ${escapeHtml(health.status || "unknown")}</span>`;
    const tracing = health.tracing || {};
    traceEl.innerHTML = tracing.available
      ? `<span class="badge badge-teal">Neatlogs tracing available</span>`
      : `<span class="badge badge-neutral">Neatlogs tracing unavailable</span>`;
    document.getElementById("sidebar-health").textContent = tracing.available ? "Tracing on" : "Tracing off";
  } catch (error) {
    healthEl.innerHTML = `<span class="badge badge-critical">Health check failed</span>`;
    traceEl.innerHTML = `<span class="badge badge-neutral">${escapeHtml(error.message)}</span>`;
  }

  try {
    const [runs, catalog] = await Promise.all([api("/api/runs"), api("/api/faults")]);
    totalEl.textContent = String(runs.length);
    catalogEl.textContent = String(catalog.length);
    const mean = meanResilience(runs);
    meanEl.textContent = mean === null ? "Unavailable" : mean.toFixed(1);
    document.getElementById("mean-note").textContent = mean === null
      ? "No scored fault runs yet. Clean runs do not contribute a resilience index."
      : `Average of ${runs.filter((run) => typeof run.score?.overall_resilience_score === "number").length} scored run(s).`;
    const points = sparkPoints(runs);
    sparkEl.innerHTML = points
      ? `<svg viewBox="0 0 220 56" width="100%" height="56" role="img" aria-label="Resilience scores over recorded runs"><polyline fill="none" stroke="#1c4ed8" stroke-width="2" points="${points}" /></svg>`
      : `<p class="muted">Trend unavailable — need at least two scored fault runs.</p>`;
    renderRuns(runs);
    renderLatest(runs[0], catalog);
  } catch (error) {
    document.getElementById("runs-body").innerHTML = `<tr><td colspan="6">Could not load runs: ${escapeHtml(error.message)}</td></tr>`;
  }
}

boot();

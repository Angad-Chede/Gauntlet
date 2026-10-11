import { api, copyText, escapeHtml, formatScore, renderDiff, verdictBadge } from "./gauntlet.js";

const runId = document.body.dataset.runId;
const patches = new Map();

async function runRepairEvaluation() {
  const host = document.getElementById("repair-comparison-results");
  const btn = document.getElementById("btn-eval-repair");
  if (!host || !btn) return;

  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  host.innerHTML = `<div class="progress-note"><span class="spinner" aria-hidden="true"></span> Running isolated before/after evaluation using original seed &amp; fault suite…</div>`;

  try {
    const comp = await api(`/api/runs/${encodeURIComponent(runId)}/repair-comparison`, { method: "POST" });
    const appliedList = Object.entries(comp.hardening_applied || {})
      .map(([k, v]) => `<div><span>${escapeHtml(k)}</span><code class="mono">${escapeHtml(String(v))}</code></div>`)
      .join("") || `<span class="muted">Default configuration verified</span>`;

    const resDeltaStr = comp.resilience_delta !== null && comp.resilience_delta !== undefined
      ? `${comp.resilience_delta >= 0 ? "+" : ""}${comp.resilience_delta.toFixed(1)} pts`
      : "Unavailable";
    const safeDeltaStr = comp.safety_delta !== null && comp.safety_delta !== undefined
      ? `${comp.safety_delta >= 0 ? "+" : ""}${comp.safety_delta.toFixed(1)} pts`
      : "0.0 pts";

    host.innerHTML = `
      <div class="summary-list" style="margin-bottom:16px">
        <div><span>Original verdict</span>${verdictBadge(comp.original_verdict)}</div>
        <div><span>Repaired verdict</span>${verdictBadge(comp.repaired_verdict)}</div>
        <div><span>Resilience delta</span><strong class="tabular ${comp.resilience_delta > 0 ? 'text-success' : ''}">${escapeHtml(resDeltaStr)}</strong></div>
        <div><span>Safety delta</span><strong class="tabular ${comp.safety_delta > 0 ? 'text-success' : ''}">${escapeHtml(safeDeltaStr)}</strong></div>
        <div><span>Replay seed</span><span class="mono">${escapeHtml(comp.seed !== null && comp.seed !== undefined ? comp.seed : "unseeded")}</span></div>
      </div>

      <div class="field-label" style="margin-top:12px;margin-bottom:6px">Hardening configuration applied in simulation:</div>
      <div class="summary-list" style="margin-bottom:16px">${appliedList}</div>

      <p class="help">${escapeHtml(comp.advisory_boundary_notes || "Advisory-only evaluation. No patches were applied to disk.")}</p>
    `;
  } catch (error) {
    host.innerHTML = `<p class="notice notice-crit">Repair evaluation failed: ${escapeHtml(error.message)}</p>`;
  } finally {
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
  }
}

async function boot() {
  const host = document.getElementById("recs");
  const repairBtn = document.getElementById("btn-eval-repair");
  if (repairBtn) {
    repairBtn.addEventListener("click", runRepairEvaluation);
  }

  try {
    const run = await api(`/api/runs/${encodeURIComponent(runId)}`);
    const recs = run.hardening_recommendations || [];
    if (!recs.length) {
      host.innerHTML = `<div class="empty"><h3>No suggestions for this run</h3><p>Advisory patches are generated only when the run requested hardening and the Hardener returned items.</p></div>`;
      return;
    }
    recs.forEach((rec) => patches.set(rec.id, rec.patch_diff || rec.remediation || ""));
    host.innerHTML = recs.map((rec) => `
      <article class="rec">
        <div class="rec-meta">
          <h3>${escapeHtml(rec.title)}</h3>
          <span class="badge ${rec.severity === "CRITICAL" ? "badge-critical" : rec.severity === "HIGH" ? "badge-warning" : "badge-neutral"}">${escapeHtml(rec.severity)} · suggestion</span>
        </div>
        <div class="muted">${escapeHtml(rec.category || "")} · ${escapeHtml(rec.id || "")}</div>
        <p><strong>Triggering risk.</strong> ${escapeHtml(rec.diagnosis)}</p>
        <p><strong>Suggested mitigation.</strong> ${escapeHtml(rec.remediation)}</p>
        <p class="help">Expected benefit: reduce recurrence of this failure class. Review before any code change. GAUNTLET does not apply patches.</p>
        ${rec.patch_diff ? renderDiff(rec.patch_diff) : ""}
        <div>
          <button class="btn btn-secondary" type="button" data-copy-id="${escapeHtml(rec.id)}">Copy suggestion</button>
        </div>
      </article>
    `).join("");
  } catch (error) {
    host.innerHTML = `<p class="notice notice-crit">${escapeHtml(error.message)}</p>`;
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-copy-id]");
  if (button) copyText(patches.get(button.dataset.copyId) || "", "Suggestion copied");
});

boot();

import {
  api,
  copyText,
  escapeHtml,
  renderDiff,
  verdictBadge,
  bindSpotlights
} from "./gauntlet.js";

const runId = document.body.dataset.runId;
const patches = new Map();

async function runRepairEvaluation() {
  const host = document.getElementById("repair-comparison-results");
  const btn = document.getElementById("btn-eval-repair");
  if (!host || !btn) return;

  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  host.innerHTML = `
    <div style="padding:16px;border-radius:var(--radius-sm);background:rgba(9, 13, 21, 0.95);border:1px solid var(--line)">
      <span class="spinner" aria-hidden="true"></span>
      <span style="margin-left:8px;font-size:14px;color:var(--tx-2)">
        Executing isolated simulation replay using original seed &amp; fault suite in memory…
      </span>
    </div>
  `;

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
      <div style="padding:18px;border-radius:var(--radius-sm);background:rgba(9, 13, 21, 0.95);border:1px solid var(--line)">
        <div class="summary-list" style="margin-bottom:14px">
          <div><span>Original referee verdict</span>${verdictBadge(comp.original_verdict)}</div>
          <div><span>Repaired referee verdict</span>${verdictBadge(comp.repaired_verdict)}</div>
          <div>
            <span>Predicted resilience delta</span>
            <strong class="tabular" style="color:${comp.resilience_delta > 0 ? 'var(--pass)' : 'var(--tx)'}">${escapeHtml(resDeltaStr)}</strong>
          </div>
          <div>
            <span>Safety boundary delta</span>
            <strong class="tabular" style="color:${comp.safety_delta > 0 ? 'var(--pass)' : 'var(--tx)'}">${escapeHtml(safeDeltaStr)}</strong>
          </div>
          <div>
            <span>Replay seed</span>
            <span class="mono">${escapeHtml(comp.seed !== null && comp.seed !== undefined ? String(comp.seed) : "Unseeded")}</span>
          </div>
        </div>

        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">
          <span style="font-size:13px;color:var(--tx-3);display:block;margin-bottom:6px">Hardening configuration evaluated in simulation:</span>
          <div class="summary-list">${appliedList}</div>
        </div>

        <p class="help" style="margin-top:12px;color:var(--warn)">
          ${escapeHtml(comp.advisory_boundary_notes || "Advisory-only evaluation. No patches were applied to disk.")}
        </p>
      </div>
    `;
  } catch (error) {
    host.innerHTML = `
      <p class="notice notice-crit">Simulation replay failed: ${escapeHtml(error.message)}</p>
    `;
  } finally {
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
  }
}

async function boot() {
  document.getElementById("copy-run-btn")?.addEventListener("click", () => copyText(runId, "Run ID copied"));

  const repairBtn = document.getElementById("btn-eval-repair");
  if (repairBtn) {
    repairBtn.addEventListener("click", runRepairEvaluation);
  }

  const host = document.getElementById("recs");

  try {
    const run = await api(`/api/runs/${encodeURIComponent(runId)}`);
    const recs = run.hardening_recommendations || [];

    if (!recs.length) {
      host.innerHTML = `
        <div class="row fr spot" style="padding:24px">
          <span><span class="chip steel">No suggestions</span></span>
          <div>
            <h4>No advisory mitigations for this run</h4>
            <p>Advisory suggestions are generated when hardening is requested and fault patterns are identified.</p>
          </div>
          <span></span>
        </div>
      `;
      document.getElementById("recs-sub").textContent = "No advisory patches were produced for this run record.";
      return;
    }

    document.getElementById("recs-sub").textContent = `${recs.length} advisory recommendation${recs.length === 1 ? "" : "s"} generated for this run.`;

    recs.forEach((rec) => {
      patches.set(rec.id, rec.patch_diff || rec.remediation || "");
    });

    host.innerHTML = recs.map((rec) => {
      const sevLabel = rec.severity ? (rec.severity.charAt(0).toUpperCase() + rec.severity.slice(1).toLowerCase()) : "Advisory";

      return `
        <article class="row spot" style="margin-bottom:14px;border-radius:var(--radius-sm);background:rgba(9, 13, 21, 0.85);border:1px solid var(--line);padding:22px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:8px">
            <h4 style="margin:0;font-size:17px;font-weight:600">${escapeHtml(rec.title)}</h4>
            <span class="chip warn">
              <svg class="i" style="width:14px;height:14px" aria-hidden="true"><use href="#i-shield"/></svg>
              ${escapeHtml(sevLabel)} · Advisory
            </span>
          </div>

          <div style="font:400 12.5px var(--mono);color:var(--tx-3);margin-bottom:10px">
            ${escapeHtml(rec.category || "mitigation")} · ${escapeHtml(rec.id || "")}
          </div>

          <p style="margin:0 0 8px;font-size:14.5px">
            <strong style="color:var(--tx)">Triggering risk:</strong>
            <span style="color:var(--tx-2)">${escapeHtml(rec.diagnosis)}</span>
          </p>

          <p style="margin:0 0 12px;font-size:14.5px">
            <strong style="color:var(--tx)">Suggested remediation:</strong>
            <span style="color:var(--tx-2)">${escapeHtml(rec.remediation)}</span>
          </p>

          ${rec.patch_diff ? `
            <div style="margin:12px 0">
              <span style="font-size:12.5px;color:var(--tx-3);display:block;margin-bottom:4px">Advisory code diff:</span>
              ${renderDiff(rec.patch_diff)}
            </div>
          ` : ""}

          <div style="margin-top:12px;display:flex;align-items:center;gap:10px">
            <button class="btn glass" type="button" data-copy-id="${escapeHtml(rec.id)}">
              <svg class="i" aria-hidden="true"><use href="#i-copy"/></svg>
              <span>Copy suggestion</span>
            </button>
            <span class="help" style="margin:0">Advisory suggestion only. Review manually before applying.</span>
          </div>
        </article>
      `;
    }).join("");

    bindSpotlights();
  } catch (error) {
    host.innerHTML = `<p class="notice notice-crit">Failed to load recommendations: ${escapeHtml(error.message)}</p>`;
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-copy-id]");
  if (button?.dataset.copyId) {
    const text = patches.get(button.dataset.copyId) || "";
    copyText(text, "Suggestion copied to clipboard");
  }
});

boot();

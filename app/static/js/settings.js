import { api, escapeHtml } from "./gauntlet.js";

async function boot() {
  const host = document.getElementById("settings-status");
  try {
    const health = await api("/api/health");
    const tracing = health.tracing || {};
    host.innerHTML = `
      <div class="summary-list">
        <div><span>Service</span><span>${escapeHtml(health.service || "gauntlet-core")}</span></div>
        <div><span>Version</span><span class="mono">${escapeHtml(health.version || "unknown")}</span></div>
        <div><span>Backend health</span><span class="badge badge-success">${escapeHtml(health.status || "unknown")}</span></div>
        <div><span>Orchestrator</span><span>${health.orchestrator_ready ? "Ready" : "Not ready"}</span></div>
        <div><span>Neatlogs tracing</span><span>${tracing.available ? `<span class="badge badge-teal">Available</span>` : `<span class="badge badge-neutral">Unavailable</span>`}</span></div>
        <div><span>Tracing initialized</span><span>${tracing.initialized ? "Yes" : "No"}</span></div>
        <div><span>Workflow name</span><span class="mono">${escapeHtml(tracing.workflow || "GAUNTLET")}</span></div>
        <div><span>SDK version</span><span class="mono">${escapeHtml(String(tracing.sdk_version || "unknown"))}</span></div>
      </div>
      <p class="help" style="margin-top:12px">API keys are never rendered. Configure <code>NEATLOGS_API_KEY</code> on the server if you want exportable traces. Evidence verification uses canonical SHA-256 seals via <code>/api/runs/{id}/evidence/verify</code>.</p>
    `;
  } catch (error) {
    host.innerHTML = `<p class="notice notice-crit">Could not read runtime health: ${escapeHtml(error.message)}</p>`;
  }
}

boot();

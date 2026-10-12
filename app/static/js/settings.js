import { api, escapeHtml, bindSpotlights } from "./gauntlet.js";

async function boot() {
  const host = document.getElementById("settings-status");
  const coreStatusEl = document.getElementById("status-core");
  const neatlogsStatusEl = document.getElementById("status-neatlogs");
  const neatlogsMetaEl = document.getElementById("meta-neatlogs");

  try {
    const health = await api("/api/health");
    const tracing = health.tracing || {};

    if (coreStatusEl) {
      coreStatusEl.innerHTML = health.status === "healthy"
        ? `<span class="chip pass"><span class="dot"></span>Connected</span>`
        : `<span class="chip warn"><span class="dot warn"></span>Degraded</span>`;
    }

    if (neatlogsStatusEl) {
      neatlogsStatusEl.innerHTML = tracing.available
        ? `<span class="chip pass"><span class="dot"></span>Connected</span>`
        : `<span class="chip steel"><span class="dot warn"></span>Not configured</span>`;
    }

    if (neatlogsMetaEl) {
      neatlogsMetaEl.textContent = `Source: NEATLOGS_API_KEY · SDK: ${tracing.sdk_version || "unknown"} · Workflow: ${tracing.workflow || "GAUNTLET"}`;
    }

    if (host) {
      host.innerHTML = `
        <div class="summary-list">
          <div><span>Runtime service</span><span class="mono">${escapeHtml(health.service || "gauntlet-core")}</span></div>
          <div><span>Service version</span><span class="mono">${escapeHtml(health.version || "0.1.0")}</span></div>
          <div><span>Backend status</span><span class="chip ${health.status === 'healthy' ? 'pass' : 'warn'}">${escapeHtml(health.status || 'unknown')}</span></div>
          <div><span>Orchestrator ready</span><span>${health.orchestrator_ready ? "Yes (active)" : "No"}</span></div>
          <div><span>Neatlogs tracing available</span><span class="chip ${tracing.available ? 'pass' : 'steel'}">${tracing.available ? "Available" : "Unavailable"}</span></div>
          <div><span>Tracing initialized</span><span>${tracing.initialized ? "Yes" : "No"}</span></div>
          <div><span>Active workflow name</span><span class="mono">${escapeHtml(tracing.workflow || "GAUNTLET")}</span></div>
          <div><span>Tracing SDK version</span><span class="mono">${escapeHtml(String(tracing.sdk_version || "unknown"))}</span></div>
          <div><span>MCP Server status</span><span class="chip pass">Ready (stdio)</span></div>
        </div>
      `;
    }
    bindSpotlights();
  } catch (error) {
    if (host) {
      host.innerHTML = `<p class="notice notice-crit">Could not read runtime health: ${escapeHtml(error.message)}</p>`;
    }
    if (coreStatusEl) {
      coreStatusEl.innerHTML = `<span class="chip fault"><span class="dot crit"></span>Error</span>`;
    }
  }
}

boot();

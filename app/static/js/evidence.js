import { api, copyText, escapeHtml, formatTime } from "./gauntlet.js";

const runId = document.body.dataset.runId;
const verifyBtn = document.getElementById("verify-btn");
const statusEl = document.getElementById("verify-status");

function statusBadge(state) {
  const map = {
    verified: ["badge-success", "Verified"],
    tampered: ["badge-critical", "Tampered"],
    malformed: ["badge-warning", "Malformed"],
    missing: ["badge-neutral", "Missing"],
    pending: ["badge-neutral", "Not yet verified"],
  };
  const [cls, label] = map[state] || map.pending;
  return `<span class="badge ${cls}">${label}</span>`;
}

function renderPacket(packet) {
  document.getElementById("packet-meta").innerHTML = `
    <div class="kvs">
      <div><span>Run ID</span><code class="mono" translate="no">${escapeHtml(packet.run_id || runId)}</code><button class="btn btn-ghost" type="button" data-copy="${escapeHtml(packet.run_id || runId)}">Copy</button></div>
      <div><span>Timestamp</span><span>${escapeHtml(formatTime(packet.timestamp))}</span><span></span></div>
      <div><span>Seed</span><span class="mono">${escapeHtml(packet.seed !== null && packet.seed !== undefined ? packet.seed : "Unseeded (random)")}</span><span></span></div>
      <div><span>Engine version</span><span class="mono">${escapeHtml(packet.app_version || "0.1.0")}</span>${packet.commit_id ? `<span class="muted">(${escapeHtml(packet.commit_id)})</span>` : "<span></span>"}</div>
      <div><span>SHA-256 seal</span><code class="hash" translate="no">${escapeHtml(packet.sha256_audit_seal || "Missing")}</code><button class="btn btn-ghost" type="button" data-copy="${escapeHtml(packet.sha256_audit_seal || "")}">Copy</button></div>
      <div><span>Neatlogs trace ID</span><code class="mono" translate="no">${escapeHtml(packet.neatlogs_trace_id || "Not present")}</code>${packet.neatlogs_trace_id ? `<button class="btn btn-ghost" type="button" data-copy="${escapeHtml(packet.neatlogs_trace_id)}">Copy</button>` : "<span></span>"}</div>
    </div>
  `;
  const events = packet.intercept_log || [];
  document.getElementById("event-count").textContent = `${events.length} event record(s)`;
  document.getElementById("events").innerHTML = events.slice(0, 40).map((event) => `
    <details class="event">
      <summary>
        <span class="badge badge-neutral">${escapeHtml(event.actor || "EVENT")}</span>
        <span>${escapeHtml(event.action || "record")}</span>
        <span class="mono muted">${escapeHtml(event.status || "")}</span>
      </summary>
      <pre translate="no">${escapeHtml(JSON.stringify(event.payload || event, null, 2))}</pre>
    </details>
  `).join("") || `<p class="muted">No intercept log in this packet.</p>`;
}

async function loadPacket() {
  statusEl.innerHTML = statusBadge("pending");
  try {
    const packet = await api(`/api/runs/${encodeURIComponent(runId)}/evidence`);
    renderPacket(packet);
    document.getElementById("download-json").href = `/api/runs/${encodeURIComponent(runId)}/evidence`;
  } catch (error) {
    statusEl.innerHTML = statusBadge(error.status === 404 ? "missing" : "malformed");
    document.getElementById("packet-meta").innerHTML = `<p class="notice notice-warn">${escapeHtml(error.message)}</p>`;
  }
}

verifyBtn.addEventListener("click", async () => {
  verifyBtn.disabled = true;
  try {
    const result = await api(`/api/runs/${encodeURIComponent(runId)}/evidence/verify`);
    if (result.valid === true) {
      statusEl.innerHTML = `${statusBadge("verified")}<p class="help">${escapeHtml(result.guarantee || "")}</p>`;
    } else {
      statusEl.innerHTML = `${statusBadge("tampered")}<p class="help">Stored and computed seals do not match.</p>`;
    }
    document.getElementById("seals").innerHTML = `
      <div class="kvs">
        <div><span>Stored seal</span><code class="hash">${escapeHtml(result.stored_seal || "")}</code><span></span></div>
        <div><span>Computed seal</span><code class="hash">${escapeHtml(result.computed_seal || "")}</code><span></span></div>
      </div>`;
  } catch (error) {
    statusEl.innerHTML = `${statusBadge(error.status === 404 ? "missing" : "malformed")}<p>${escapeHtml(error.message)}</p>`;
  } finally {
    verifyBtn.disabled = false;
  }
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-copy]");
  if (button?.dataset.copy) copyText(button.dataset.copy);
});

loadPacket();

import { api, copyText, escapeHtml, formatTime, bindSpotlights } from "./gauntlet.js";

const runId = document.body.dataset.runId;
const verifyBtn = document.getElementById("verify-btn");
const verifyBadge = document.getElementById("verify-badge");
const verifyStatus = document.getElementById("verify-status");
const sealsBox = document.getElementById("seals-box");
let cachedPacket = null;

function renderPacket(packet) {
  cachedPacket = packet;
  const seal = packet.sha256_audit_seal || "Missing";
  const seedStr = packet.seed !== null && packet.seed !== undefined ? String(packet.seed) : "Unseeded (random)";
  const traceId = packet.neatlogs_trace_id || null;

  document.getElementById("packet-meta").innerHTML = `
    <div class="summary-list">
      <div>
        <span>Run ID</span>
        <span class="mono" style="display:inline-flex;align-items:center;gap:6px">
          ${escapeHtml(packet.run_id || runId)}
          <button class="icon-btn" style="width:28px;height:28px" type="button" data-copy="${escapeHtml(packet.run_id || runId)}" aria-label="Copy run ID">
            <svg class="i" style="width:12px;height:12px"><use href="#i-copy"/></svg>
          </button>
        </span>
      </div>
      <div>
        <span>Recorded timestamp</span>
        <span>${escapeHtml(formatTime(packet.timestamp))}</span>
      </div>
      <div>
        <span>Deterministic seed</span>
        <span class="mono">${escapeHtml(seedStr)}</span>
      </div>
      <div>
        <span>Engine version</span>
        <span class="mono">${escapeHtml(packet.app_version || "0.1.0")} ${packet.commit_id ? `<span class="muted">(${escapeHtml(packet.commit_id)})</span>` : ""}</span>
      </div>
      <div>
        <span>SHA-256 seal</span>
        <span class="mono" style="display:inline-flex;align-items:center;gap:6px;max-width:min(100%,480px);overflow-wrap:anywhere">
          <code>${escapeHtml(seal)}</code>
          <button class="icon-btn" style="width:28px;height:28px" type="button" data-copy="${escapeHtml(seal)}" aria-label="Copy SHA-256 seal">
            <svg class="i" style="width:12px;height:12px"><use href="#i-copy"/></svg>
          </button>
        </span>
      </div>
      <div>
        <span>Neatlogs trace ID</span>
        <span class="mono">
          ${traceId ? `
            <code>${escapeHtml(traceId)}</code>
            <button class="icon-btn" style="width:28px;height:28px" type="button" data-copy="${escapeHtml(traceId)}" aria-label="Copy trace ID">
              <svg class="i" style="width:12px;height:12px"><use href="#i-copy"/></svg>
            </button>
          ` : `<span class="muted">Not present (tracing disabled or local run)</span>`}
        </span>
      </div>
    </div>
  `;

  // Canonical JSON panel
  const canonPre = document.getElementById("canonical-json");
  if (canonPre) {
    canonPre.textContent = JSON.stringify(packet, null, 2);
  }

  // Intercept log events
  const events = packet.intercept_log || [];
  document.getElementById("event-count").textContent = `${events.length} event record${events.length === 1 ? "" : "s"} captured in this packet.`;

  document.getElementById("events").innerHTML = events.length ? events.map((event, idx) => {
    const num = idx + 1;
    const actor = event.actor || "REFEREE";
    const action = event.action || "EVENT";
    const status = event.status || "OK";
    const payload = escapeHtml(JSON.stringify(event.payload || event, null, 2));

    return `
      <li class="row ev spot" id="ev-${num}">
        <span class="node"></span>
        <div>
          <h4>
            <span>${escapeHtml(action)}</span>
            <span class="role">${escapeHtml(actor)}</span>
            <span class="chip steel" style="font-size:12px">${escapeHtml(status)}</span>
          </h4>
          <details style="margin-top:8px">
            <summary class="view-payload-btn">
              <svg class="i" style="width:14px;height:14px"><use href="#i-chev"/></svg>
              <span>View structured event payload</span>
            </summary>
            <pre class="payload-json" translate="no">${payload}</pre>
          </details>
        </div>
      </li>
    `;
  }).join("") : `<li class="row ev"><p class="muted">No event records present in packet.</p></li>`;

  bindSpotlights();
}

async function verifySeal() {
  if (!verifyBtn) return;
  verifyBtn.disabled = true;
  verifyBadge.innerHTML = `<span class="chip steel"><span class="spinner" aria-hidden="true"></span> Verifying seal…</span>`;
  verifyStatus.innerHTML = `<p class="why">Calling cryptographic verification API to recompute SHA-256 digest over canonical record…</p>`;

  try {
    const res = await api(`/api/runs/${encodeURIComponent(runId)}/evidence/verify`);
    if (res.valid === true) {
      verifyBadge.innerHTML = `
        <span class="chip pass badge badge-success">
          <svg class="i" style="width:14px;height:14px" aria-hidden="true"><use href="#i-check"/></svg>
          Verified
        </span>
      `;
      verifyStatus.innerHTML = `
        <p class="why" style="color:var(--pass)">
          Content integrity confirmed. The stored SHA-256 seal exactly matches the recomputed canonical hash.
        </p>
        <p class="why" style="color:var(--tx-3);font-size:14px">
          ${escapeHtml(res.guarantee || "Content integrity verified via canonical SHA-256.")}
        </p>
      `;
    } else {
      verifyBadge.innerHTML = `
        <span class="chip fault badge badge-critical">
          <svg class="i" style="width:14px;height:14px" aria-hidden="true"><use href="#i-alert"/></svg>
          Tampered
        </span>
      `;
      verifyStatus.innerHTML = `
        <p class="why" style="color:var(--fault)">
          Integrity violation: Stored seal does not match the recomputed hash of this record.
        </p>
      `;
    }

    sealsBox.innerHTML = `
      <div style="padding:16px;border-radius:var(--radius-sm);background:rgba(9, 13, 21, 0.95);border:1px solid var(--line)">
        <div style="margin-bottom:12px">
          <span style="font-size:13px;color:var(--tx-3);display:block;margin-bottom:4px">Stored SHA-256 seal (from evidence packet)</span>
          <div style="display:flex;align-items:center;gap:8px">
            <code class="mono" style="font-size:12.5px;color:var(--tx);word-break:break-all">${escapeHtml(res.stored_seal || "None")}</code>
            <button class="icon-btn" style="width:28px;height:28px;flex:none" type="button" data-copy="${escapeHtml(res.stored_seal || "")}" aria-label="Copy stored seal">
              <svg class="i" style="width:12px;height:12px"><use href="#i-copy"/></svg>
            </button>
          </div>
        </div>
        <div>
          <span style="font-size:13px;color:var(--tx-3);display:block;margin-bottom:4px">Computed SHA-256 seal (recalculated by referee)</span>
          <div style="display:flex;align-items:center;gap:8px">
            <code class="mono" style="font-size:12.5px;color:var(--tx);word-break:break-all">${escapeHtml(res.computed_seal || "None")}</code>
            <button class="icon-btn" style="width:28px;height:28px;flex:none" type="button" data-copy="${escapeHtml(res.computed_seal || "")}" aria-label="Copy computed seal">
              <svg class="i" style="width:12px;height:12px"><use href="#i-copy"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    verifyBadge.innerHTML = `
      <span class="chip fault badge badge-critical">
        <svg class="i" style="width:14px;height:14px" aria-hidden="true"><use href="#i-alert"/></svg>
        Verification failed
      </span>
    `;
    verifyStatus.innerHTML = `
      <p class="why" style="color:var(--fault)">Verification error: ${escapeHtml(error.message)}</p>
      <button class="btn glass" type="button" id="retry-verify-btn" style="margin-top:10px">Retry verification</button>
    `;
    document.getElementById("retry-verify-btn")?.addEventListener("click", verifySeal);
  } finally {
    verifyBtn.disabled = false;
  }
}

async function boot() {
  document.getElementById("copy-run-btn")?.addEventListener("click", () => copyText(runId, "Run ID copied"));
  verifyBtn?.addEventListener("click", verifySeal);

  document.getElementById("copy-canonical-btn")?.addEventListener("click", () => {
    if (cachedPacket) {
      copyText(JSON.stringify(cachedPacket, null, 2), "Canonical JSON copied");
    }
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-copy]");
    if (btn?.dataset.copy) {
      copyText(btn.dataset.copy, "Copied to clipboard");
    }
  });

  try {
    const packet = await api(`/api/runs/${encodeURIComponent(runId)}/evidence`);
    renderPacket(packet);
  } catch (error) {
    verifyBadge.innerHTML = `<span class="chip fault">Missing packet</span>`;
    document.getElementById("packet-meta").innerHTML = `
      <p class="notice notice-warn">Could not load evidence packet: ${escapeHtml(error.message)}</p>
    `;
  }
}

boot();

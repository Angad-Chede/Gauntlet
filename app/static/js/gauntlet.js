export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
    ...options,
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
    const detail = data && (data.detail || data.message);
    const error = new Error(detail ? String(detail) : `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

export function formatTime(value) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

export function formatScore(value) {
  if (value === null || value === undefined) return "Unavailable";
  return `${Number(value).toFixed(1)}`;
}

export function verdictBadge(verdict) {
  if (!verdict) return `<span class="badge badge-neutral">No verdict</span>`;
  const map = {
    PASSED: "badge-success",
    RESILIENT_DEGRADED: "badge-warning",
    FAILED: "badge-critical",
    CRITICAL_VIOLATION: "badge-critical",
  };
  const labels = {
    PASSED: "Passed",
    RESILIENT_DEGRADED: "Resilient, degraded",
    FAILED: "Failed",
    CRITICAL_VIOLATION: "Critical violation",
  };
  const cls = map[verdict] || "badge-neutral";
  return `<span class="badge ${cls}">${escapeHtml(labels[verdict] || verdict)}</span>`;
}

export function safetyBadge(breached) {
  if (breached === true) return `<span class="badge badge-critical">Safety not preserved</span>`;
  if (breached === false) return `<span class="badge badge-success">Safety preserved</span>`;
  return `<span class="badge badge-neutral">Safety unknown</span>`;
}

export function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("is-on");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove("is-on"), 1800);
}

export async function copyText(value, label = "Copied") {
  try {
    await navigator.clipboard.writeText(value);
    toast(label);
  } catch {
    toast("Copy failed");
  }
}

export function classifyStep(step) {
  const status = (step.status || "").toUpperCase();
  const action = (step.action || "").toUpperCase();
  if (status.includes("SAFETY") || status.includes("PROMPT_INJECTION") || action.includes("SAFETY")) return "safety";
  if (step.fault_injected) return "injected";
  if (["RECOVERING", "FALLBACK_ACTIVE", "PROTECTED", "DEGRADED"].includes(status) || action.includes("RETRY") || action.includes("FALLBACK") || action.includes("CIRCUIT")) return "recovery";
  if (["ABORTED", "CORRUPT_DETECTED"].includes(status) || action.includes("FAILED")) return "failure";
  return "ok";
}

export function classifyStepLabel(kind) {
  return {
    injected: "Expected injected failure",
    recovery: "Agent recovery",
    failure: "Unrecovered task failure",
    safety: "Safety event",
    ok: "Step",
  }[kind] || "Step";
}

export function renderDiff(diff) {
  if (!diff) return "";
  const lines = String(diff).split("\n").map((line) => {
    const cls = line.startsWith("+") && !line.startsWith("+++") ? "add" : line.startsWith("-") && !line.startsWith("---") ? "del" : "";
    return `<span class="${cls}">${escapeHtml(line)}</span>`;
  });
  return `<pre class="diff" translate="no">${lines.join("\n")}</pre>`;
}

export function bindNav() {
  const toggle = document.querySelector("[data-menu-toggle]");
  const scrim = document.querySelector("[data-scrim]");
  const close = () => document.body.classList.remove("nav-open");
  toggle?.addEventListener("click", () => document.body.classList.toggle("nav-open"));
  scrim?.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

async function loadSidebarHealth() {
  const el = document.getElementById("sidebar-health");
  if (!el) return;
  try {
    const health = await api("/api/health");
    const tracing = health.tracing || {};
    el.textContent = health.status === "healthy"
      ? (tracing.available ? "Core healthy · tracing on" : "Core healthy · tracing off")
      : "Core degraded";
  } catch {
    el.textContent = "Health unavailable";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindNav();
  loadSidebarHealth();
});

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
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
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
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatCompactTime(value) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const m = date.toLocaleString(undefined, { month: "short" });
  const d = date.getDate();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${m} ${d} · ${time}`;
}

export function formatScore(value) {
  if (value === null || value === undefined) return "Unavailable";
  return `${Number(value).toFixed(1)}`;
}

export function verdictBadge(verdict) {
  if (!verdict) return `<span class="chip steel badge badge-neutral">No verdict</span>`;
  const labels = {
    PASSED: "Passed",
    RESILIENT_DEGRADED: "Resilient, degraded",
    FAILED: "Failed",
    CRITICAL_VIOLATION: "Critical violation",
  };
  const label = labels[verdict] || verdict;
  if (verdict === "PASSED") {
    return `<span class="chip pass badge badge-success"><svg class="i" style="width:14px;height:14px" aria-hidden="true"><use href="#i-check"/></svg>${escapeHtml(label)}</span>`;
  }
  if (verdict === "RESILIENT_DEGRADED") {
    return `<span class="chip warn badge badge-warning"><svg class="i" style="width:14px;height:14px" aria-hidden="true"><use href="#i-alert"/></svg>${escapeHtml(label)}</span>`;
  }
  if (verdict === "FAILED" || verdict === "CRITICAL_VIOLATION") {
    return `<span class="chip fault badge badge-critical"><svg class="i" style="width:14px;height:14px" aria-hidden="true"><use href="#i-alert"/></svg>${escapeHtml(label)}</span>`;
  }
  return `<span class="chip steel badge badge-neutral">${escapeHtml(label)}</span>`;
}

export function safetyBadge(breached) {
  if (breached === true) {
    return `<span class="chip fault badge badge-critical"><svg class="i" style="width:14px;height:14px" aria-hidden="true"><use href="#i-alert"/></svg>Safety not preserved</span>`;
  }
  if (breached === false) {
    return `<span class="chip pass badge badge-success"><svg class="i" style="width:14px;height:14px" aria-hidden="true"><use href="#i-shield"/></svg>Safety preserved</span>`;
  }
  return `<span class="chip steel badge badge-neutral">Safety unknown</span>`;
}

export function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("is-on");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove("is-on"), 2200);
}

export async function copyText(value, label = "Copied to clipboard") {
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
  if (status.includes("SAFETY") || status.includes("PROMPT_INJECTION") || action.includes("SAFETY") || action.includes("ADVERSARIAL_INSPECTION")) {
    return "safety";
  }
  if (step.fault_injected) return "injected";
  if (["RECOVERING", "FALLBACK_ACTIVE", "PROTECTED", "DEGRADED"].includes(status) || action.includes("RETRY") || action.includes("FALLBACK") || action.includes("QUARANTINE")) {
    return "recovery";
  }
  if (["ABORTED", "CORRUPT_DETECTED"].includes(status) || action.includes("FAILED")) {
    return "failure";
  }
  return "ok";
}

export function classifyStepLabel(kind) {
  return {
    injected: "Fault injected",
    recovery: "Agent recovery",
    failure: "Unrecovered failure",
    safety: "Fault detected",
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
  const toggle = document.getElementById("menuBtn") || document.querySelector("[data-menu-toggle]");
  const sidebar = document.getElementById("side") || document.getElementById("sidebar");
  const scrim = document.getElementById("scrimm") || document.querySelector("[data-scrim]");

  function openMenu() {
    sidebar?.classList.add("open");
    scrim?.classList.add("on");
    toggle?.setAttribute("aria-expanded", "true");
  }
  function closeMenu() {
    sidebar?.classList.remove("open");
    scrim?.classList.remove("on");
    toggle?.setAttribute("aria-expanded", "false");
  }

  toggle?.addEventListener("click", () => {
    sidebar?.classList.contains("open") ? closeMenu() : openMenu();
  });
  scrim?.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
}

export function bindSpotlights() {
  if (!window.matchMedia("(hover: hover)").matches) return;
  const update = (el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${(e.clientX - r.left).toFixed(1)}px`);
      el.style.setProperty("--my", `${(e.clientY - r.top).toFixed(1)}px`);
    }, { passive: true });
  };
  document.querySelectorAll("[data-spot], .spot").forEach(update);
}

export async function loadSidebarHealth() {
  const textEl = document.getElementById("sidebar-health");
  const dotEl = document.getElementById("sidebar-dot");
  if (!textEl) return;
  try {
    const health = await api("/api/health");
    const tracing = health.tracing || {};
    if (health.status === "healthy") {
      textEl.textContent = tracing.available ? "Core healthy, tracing on" : "Core healthy, tracing off";
      dotEl?.classList.remove("warn", "crit");
    } else {
      textEl.textContent = "Core degraded";
      dotEl?.classList.add("warn");
    }
  } catch {
    textEl.textContent = "Runtime offline";
    dotEl?.classList.add("crit");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindNav();
  bindSpotlights();
  loadSidebarHealth();
});

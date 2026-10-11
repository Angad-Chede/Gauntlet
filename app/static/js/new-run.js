import { api, escapeHtml, toast } from "./gauntlet.js";

const form = document.getElementById("run-form");
const overlay = document.getElementById("progress-overlay");
const confirmDialog = document.getElementById("confirm-dialog");
const summaryEl = document.getElementById("plan-summary");
const intensityEl = document.getElementById("intensity");
const intensityVal = document.getElementById("intensity-val");
const errorEl = document.getElementById("form-error");

function selectedFaults() {
  return [...document.querySelectorAll("[name=fault_choice]:checked")].map((input) => ({
    id: input.value,
    name: input.dataset.name,
    description: input.dataset.description,
  }));
}

function mode() {
  return document.querySelector("[name=mode]:checked")?.value || "selected";
}

function refreshCards() {
  document.querySelectorAll(".fault-card").forEach((card) => {
    const checked = card.querySelector("input").checked;
    card.classList.toggle("is-selected", checked);
  });
  document.querySelectorAll(".mode-pills label").forEach((label) => {
    label.classList.toggle("is-on", label.querySelector("input").checked);
  });
  const faults = selectedFaults();
  const currentMode = mode();
  const intensity = Number(intensityEl.value);
  const harden = document.getElementById("auto-harden").checked;
  const subject = document.getElementById("subject-name").value.trim() || "Autonomous Assistant v1";
  const seedRaw = document.getElementById("run-seed")?.value.trim();
  const seed = (seedRaw !== undefined && seedRaw !== "" && !isNaN(parseInt(seedRaw, 10))) ? parseInt(seedRaw, 10) : null;
  let plan;
  if (currentMode === "clean") {
    plan = "Clean run: no faults will be injected. Resilience index will be unavailable.";
  } else if (currentMode === "sample") {
    plan = `Sampling from the catalog using chaos intensity ${intensity.toFixed(1)}${seed !== null ? ` (seeded: ${seed})` : ""}. Explicit IDs will not be sent.`;
  } else if (!faults.length) {
    plan = "Select at least one fault family, or switch mode.";
  } else {
    plan = `Inject ${faults.length} selected fault(s): ${faults.map((fault) => fault.name).join(", ")}.`;
  }
  summaryEl.innerHTML = `
    <div><span>Subject</span><strong>${escapeHtml(subject)}</strong></div>
    <div><span>Mode</span><span>${escapeHtml(currentMode)}</span></div>
    ${seed !== null ? `<div><span>Deterministic seed</span><span class="mono">${seed}</span></div>` : ""}
    <div><span>Advisory hardening</span><span>${harden ? "Generate suggestions" : "Skip suggestions"}</span></div>
    <div><span>Plan</span><span>${escapeHtml(plan)}</span></div>
  `;
}

function payload() {
  const currentMode = mode();
  const subject_name = document.getElementById("subject-name").value.trim() || "Autonomous Assistant v1";
  const enable_auto_harden = document.getElementById("auto-harden").checked;
  const seedRaw = document.getElementById("run-seed")?.value.trim();
  const seed = (seedRaw !== undefined && seedRaw !== "" && !isNaN(parseInt(seedRaw, 10))) ? parseInt(seedRaw, 10) : null;
  if (currentMode === "clean") {
    return { subject_name, fault_ids: [], chaos_intensity: 0, enable_auto_harden, seed };
  }
  if (currentMode === "sample") {
    return { subject_name, fault_ids: null, chaos_intensity: Number(intensityEl.value), enable_auto_harden, seed };
  }
  return {
    subject_name,
    fault_ids: selectedFaults().map((fault) => fault.id),
    chaos_intensity: Number(intensityEl.value),
    enable_auto_harden,
    seed,
  };
}

function validate() {
  errorEl.hidden = true;
  errorEl.textContent = "";
  const currentMode = mode();
  if (currentMode === "selected" && !selectedFaults().length) {
    errorEl.hidden = false;
    errorEl.textContent = "Select one or more fault families, or choose sampling / clean run.";
    return false;
  }
  return true;
}

async function execute() {
  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
  const button = document.getElementById("btn-run");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    const run = await api("/api/run", { method: "POST", body: JSON.stringify(payload()) });
    window.location.href = `/runs/${encodeURIComponent(run.run_id)}`;
  } catch (error) {
    overlay.classList.remove("is-open");
    errorEl.hidden = false;
    errorEl.textContent = error.message;
    toast("Run failed");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

form.addEventListener("change", refreshCards);
form.addEventListener("input", refreshCards);
intensityEl.addEventListener("input", () => {
  intensityVal.textContent = Number(intensityEl.value).toFixed(1);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validate()) return;
  const body = document.getElementById("confirm-body");
  const data = payload();
  body.innerHTML = `<p>This starts a synchronous backend run. Latency faults can take several seconds.</p>
    <pre class="hash">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
  confirmDialog.showModal();
});

document.getElementById("confirm-go").addEventListener("click", (event) => {
  event.preventDefault();
  confirmDialog.close();
  execute();
});

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has("seed")) {
  const seedInput = document.getElementById("run-seed");
  if (seedInput) seedInput.value = urlParams.get("seed");
}
if (urlParams.get("mode") === "sample") {
  const sampleRadio = document.querySelector("input[name=mode][value=sample]");
  if (sampleRadio) sampleRadio.checked = true;
}

refreshCards();

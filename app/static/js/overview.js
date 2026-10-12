import {
  api,
  copyText,
  escapeHtml,
  formatCompactTime,
  formatScore,
  formatTime,
  safetyBadge,
  verdictBadge,
  bindSpotlights
} from "./gauntlet.js";

let allRuns = [];
let currentFilter = "all";

function meanResilience(runs) {
  const scores = runs
    .map((run) => run.score?.overall_resilience_score)
    .filter((value) => typeof value === "number");
  if (!scores.length) return { mean: null, count: 0 };
  const sum = scores.reduce((acc, val) => acc + val, 0);
  return { mean: sum / scores.length, count: scores.length };
}

function filterRuns(runs, filter) {
  if (filter === "faults") {
    return runs.filter((r) => (r.faults && r.faults.length > 0) || (r.score?.total_faults_applied > 0));
  }
  if (filter === "baseline") {
    return runs.filter((r) => (!r.faults || r.faults.length === 0) && (!r.score?.total_faults_applied));
  }
  return runs;
}

function renderTable(runs) {
  const filtered = filterRuns(runs, currentFilter);
  const countEl = document.getElementById("showing-count");
  if (countEl) {
    countEl.textContent = `Showing ${Math.min(filtered.length, 12)} of ${filtered.length} runs${currentFilter !== "all" ? ` (filtered by ${currentFilter})` : ""}`;
  }

  const body = document.getElementById("runs-body");
  if (!filtered.length) {
    body.innerHTML = `
      <div class="tr" role="row" style="grid-template-columns:1fr;padding:24px;text-align:center">
        <span style="color:var(--tx-3)">No runs match the selected filter.</span>
      </div>
    `;
    return;
  }

  body.innerHTML = filtered.slice(0, 12).map((run) => {
    const faults = run.score?.total_faults_applied ?? run.faults?.length ?? 0;
    const isClean = faults === 0;
    const scoreVal = typeof run.score?.overall_resilience_score === "number"
      ? run.score.overall_resilience_score.toFixed(1)
      : (isClean ? `<span style="color:var(--tx-3)">Not scored</span>` : "—");

    const timeCompact = formatCompactTime(run.timestamp);
    const timeFull = formatTime(run.timestamp);

    return `
      <div class="tr" role="row">
        <span class="id">
          <a href="/runs/${encodeURIComponent(run.run_id)}" translate="no" title="Open inspector for ${escapeHtml(run.run_id)}">
            ${escapeHtml(run.run_id)}
          </a>
          <button class="icon-btn" style="width:24px;height:24px;border-radius:6px;padding:0" type="button" data-copy="${escapeHtml(run.run_id)}" aria-label="Copy run ID">
            <svg class="i" style="width:11px;height:11px"><use href="#i-copy"/></svg>
          </button>
        </span>
        <span class="ag">${escapeHtml(run.subject?.name || "Autonomous Assistant v1")}</span>
        <span class="vv">${verdictBadge(run.verdict?.verdict)}</span>
        <span class="ss">${safetyBadge(run.verdict?.safety_boundary_breached)}</span>
        <span class="num tabular">${scoreVal}</span>
        <span class="w" title="${escapeHtml(timeFull)}">${escapeHtml(timeCompact)}</span>
      </div>
    `;
  }).join("");
}

function renderTrend(runs) {
  const host = document.getElementById("spark");
  // Chronological order: oldest to newest
  const scoredPoints = [...runs].reverse()
    .map((r) => ({
      id: r.run_id,
      score: r.score?.overall_resilience_score,
      time: r.timestamp,
    }))
    .filter((pt) => typeof pt.score === "number");

  if (scoredPoints.length < 3) {
    host.innerHTML = `
      <div style="padding:18px;text-align:center">
        <p style="margin:0;font-size:14px;color:var(--tx-3)">
          Resilience trajectory requires at least 3 scored runs. Clean baseline runs do not contribute index points.
        </p>
      </div>
    `;
    return;
  }

  const w = 600;
  const h = 120;
  const pad = 24;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;

  const pointsSvg = scoredPoints.map((pt, idx) => {
    const x = pad + (idx / (scoredPoints.length - 1)) * plotW;
    // Y scale: 0 at bottom, 100 at top
    const y = pad + plotH - (Math.max(0, Math.min(100, pt.score)) / 100) * plotH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const lastPt = scoredPoints[scoredPoints.length - 1];

  host.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
      <span style="font-size:13px;color:var(--tx-3)">Trajectory over ${scoredPoints.length} scored runs</span>
      <span style="font-size:13.5px;color:var(--tx-2)">Latest index: <strong class="tabular" style="color:#FFFFFF">${lastPt.score.toFixed(1)}</strong></span>
    </div>
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Trajectory chart showing scores from 0 to 100 over ${scoredPoints.length} runs">
      <!-- Grid lines -->
      <line x1="${pad}" y1="${pad}" x2="${w - pad}" y2="${pad}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3"/>
      <line x1="${pad}" y1="${pad + plotH / 2}" x2="${w - pad}" y2="${pad + plotH / 2}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3"/>
      <line x1="${pad}" y1="${pad + plotH}" x2="${w - pad}" y2="${pad + plotH}" stroke="rgba(255,255,255,0.15)"/>

      <!-- Labels -->
      <text x="${pad - 6}" y="${pad + 4}" fill="rgba(255,255,255,0.3)" font-size="10" text-anchor="end" font-family="var(--mono)">100</text>
      <text x="${pad - 6}" y="${pad + plotH / 2 + 3}" fill="rgba(255,255,255,0.3)" font-size="10" text-anchor="end" font-family="var(--mono)">50</text>
      <text x="${pad - 6}" y="${pad + plotH + 2}" fill="rgba(255,255,255,0.3)" font-size="10" text-anchor="end" font-family="var(--mono)">0</text>

      <!-- Polyline -->
      <polyline fill="none" stroke="#EEF1F5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" points="${pointsSvg}"/>
    </svg>
  `;
}

function renderLatestRun(run) {
  const host = document.getElementById("latest-run");
  if (!run) {
    host.innerHTML = `
      <h3>Latest run</h3>
      <p style="margin:12px 0 0;font-size:14px;color:var(--tx-3)">No test run records available yet.</p>
    `;
    return;
  }

  const faults = run.score?.total_faults_applied ?? run.faults?.length ?? 0;
  const scoreStr = typeof run.score?.overall_resilience_score === "number"
    ? run.score.overall_resilience_score.toFixed(1)
    : "Not scored";

  host.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px">
      <h3 style="margin:0">Latest run</h3>
      <a class="btn glass" style="min-height:30px;padding:0 12px;font-size:12.5px" href="/runs/${encodeURIComponent(run.run_id)}">Open report</a>
    </div>

    <div style="font:400 13px var(--mono);color:var(--tx-2);margin-bottom:10px;word-break:break-all">
      ${escapeHtml(run.run_id)}
    </div>

    <div style="margin-bottom:12px">
      ${verdictBadge(run.verdict?.verdict)}
    </div>

    <div class="summary-list" style="font-size:13px">
      <div><span>Safety boundary</span>${safetyBadge(run.verdict?.safety_boundary_breached)}</div>
      <div><span>Resilience index</span><strong class="tabular">${escapeHtml(scoreStr)}</strong></div>
      <div><span>Faults applied</span><span class="tabular">${faults}</span></div>
      <div><span>Recorded</span><span>${escapeHtml(formatTime(run.timestamp))}</span></div>
    </div>
  `;
}

function renderCoverage(latestRun, catalog) {
  const host = document.getElementById("cov-list");
  if (!host || !catalog) return;

  const appliedIds = new Set((latestRun?.faults || []).map((f) => f.id));

  host.innerHTML = catalog.map((fault) => {
    const isCovered = appliedIds.has(fault.id);
    return `
      <li class="${isCovered ? 'on' : ''}">
        <span class="s"></span>
        <div>
          <b>${escapeHtml(fault.name)}</b>
          <code>${escapeHtml(fault.id)}</code>
          <span class="st">${isCovered ? 'Covered' : 'Not in latest run'}</span>
        </div>
      </li>
    `;
  }).join("");
}

async function boot() {
  const runsEl = document.getElementById("metric-runs");
  const meanEl = document.getElementById("metric-mean");
  const meanNote = document.getElementById("mean-note");
  const catalogEl = document.getElementById("metric-catalog");

  // Filter chips click handler
  document.querySelectorAll(".fchip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".fchip").forEach((b) => b.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
      currentFilter = btn.dataset.filter || "all";
      renderTable(allRuns);
    });
  });

  // Global copy handler
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-copy]");
    if (btn?.dataset.copy) {
      copyText(btn.dataset.copy, "Run ID copied");
    }
  });

  try {
    const [runs, catalog] = await Promise.all([
      api("/api/runs"),
      api("/api/faults"),
    ]);
    allRuns = runs;

    runsEl.textContent = String(runs.length);
    catalogEl.textContent = String(catalog.length);

    const { mean, count } = meanResilience(runs);
    if (mean !== null) {
      meanEl.textContent = mean.toFixed(1);
      meanNote.textContent = `Average of ${count} scored run${count === 1 ? "" : "s"}. Denominator excludes clean runs.`;
    } else {
      meanEl.textContent = "Unavailable";
      meanNote.textContent = "No scored fault runs recorded yet.";
    }

    renderTable(allRuns);
    renderLatestRun(allRuns[0]);
    renderCoverage(allRuns[0], catalog);
    renderTrend(allRuns);
    bindSpotlights();
  } catch (error) {
    document.getElementById("runs-body").innerHTML = `
      <div class="tr" style="grid-template-columns:1fr;padding:20px;color:var(--fault)">
        Failed to load overview data: ${escapeHtml(error.message)}
      </div>
    `;
  }
}

boot();

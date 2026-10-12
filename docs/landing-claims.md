# GAUNTLET Landing Page Claims Ledger

Every claim made on the GAUNTLET landing page (`/` and `/landing`) is audited and bound to a verifiable artifact in the repository. Status badges reflect the lowest provable level (`IMPLEMENTED`, `TESTED`, `EXTERNALLY VERIFIED`, `PLANNED`).

| # | Claim | Supporting Artifact | Status Badge | Verification Target / Evidence |
|---|-------|---------------------|--------------|--------------------------------|
| 1 | Public landing page and dashboard routes are operational without authentication | `app/main.py`, `app/templates/overview.html` | `IMPLEMENTED` | Route `/app` renders HTTP 200; `tests/test_landing_routes.py` passes |
| 2 | Cryptographically sealed tamper-evident execution trace via canonical SHA-256 | `app/audit.py`, `tests/test_audit_seal.py` | `TESTED` | Automated unit test verifies canonical digest generation and mismatch detection on mutated payloads |
| 3 | Live and sealed run inspection with step-level telemetry, scores, and referee verdict | `app/orchestrator.py`, `runs/run_d42996d50d.json` | `TESTED` | Route `/runs/run_d42996d50d` displays verified steps, scores (90.8), and verdict (`RESILIENT_DEGRADED`) |
| 4 | Adversarial fault catalog with 7 scenarios across 5 fault families | `app/saboteur.py`, `app/models.py` | `IMPLEMENTED` | 7 catalog definitions: latency spike, http 500, rate limit 429, malformed payload, indirect prompt injection, tool schema drift, partial outage |
| 5 | Recorded real runs exist for 4 fault families | `runs/run_d42996d50d.json` (429), `runs/run_48b076965b.json` (drift), `runs/run_c261f2398e.json` (injection), `runs/run_f7ae879258.json` (500) | `TESTED` | Real on-disk JSON execution logs with step timings and verdicts |
| 6 | Malformed output family is planned without recorded run | `app/saboteur.py` | `PLANNED` | Catalog entry defined; no historical run recorded in `runs/`; displayed as disabled in Fault Bench |
| 7 | Automated hardening diff recommendations are advisory-only and never applied automatically | `app/hardener.py`, `app/templates/hardening.html` | `IMPLEMENTED` | Recommendations generate unified diff patches for human inspection; no autonomous self-patching disk write |
| 8 | Neatlogs workflow telemetry & OpenTelemetry span instrumentation | `app/tracing.py`, `app/main.py` | `IMPLEMENTED` | SDK integration (`neatlogs==1.4.26`), health endpoint `/api/health` reports status `tracing.available=true` |
| 9 | Entire local Git checkpoint tracking for developer sessions | `refs/entire/checkpoints/ZS/01M4KSQKWSP4YN70VPDY5MBCZS`, `.entire/` | `IMPLEMENTED` | Local git refs and metadata recorded in repo history |
| 10 | cfo.ai financial business plan & scenario stress-test | `docs/business-plan.md`, `docs/cfo-ai-evidence.md`, `docs/financial-model.csv` | `EXTERNALLY VERIFIED` | Authentic Ari model in founder workspace `aissms-institute-of-information-technology-0c3d2ff5` |
| 11 | Atmospheric painted background art attribution | `docs/image/Twilight Fortress Among Stormy Cliffs.png`, `app/templates/landing/index.html` | `IMPLEMENTED` | AI-generated background art explicitly credited in footer; bottom-right sparkle mark preserved |
| 12 | Recorded runs count transparency | `runs/` directory (134 on-disk records) | `TESTED` | Labeled accurately as local execution history including automated test harness runs |

## Limitations & Honesty Constraints
1. **Local Disk Persistence**: Runs persist to local disk in `runs/` and `evidence/`; no multi-tenant cloud authentication or SaaS enterprise database is claimed.
2. **Advisory Hardening**: Remediation patches are suggested diffs for operator review; they are never executed against local code repositories without manual approval.
3. **Tamper-Evidence vs Tamper-Proof**: Cryptographic SHA-256 seal guarantees payload content integrity and detection of post-run alteration; it does not provide public-key identity signatures (PKI) or guarantee agent safety.
4. **No Deterministic Replay Without Seed**: Unseeded chaos executions rely on pseudo-random state transitions; reproducible replay requires explicit seeds.
5. **Atmospheric Art Resolution**: Source painting is AI-generated (1678x937), Lanczos-upscaled to 1920w; grain overlay is utilized to maintain crisp aesthetic tone without artificial smoothing.


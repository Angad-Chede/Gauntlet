import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
import sys
import time
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.models import (
    AdvisoryRepairComparison,
    FaultDefinition,
    GauntletRun,
    RunRequest,
    SubjectConfig,
)
from app.orchestrator import Orchestrator
from app.tracing import get_tracing_status, init_tracing, shutdown_tracing


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize Neatlogs tracing once on application startup
    init_tracing()
    try:
        yield
    finally:
        # Shut down Neatlogs tracing once during application shutdown
        shutdown_tracing()


# Initialize FastAPI app
app = FastAPI(
    title="GAUNTLET",
    description="Adversarial Chaos & Hardening Platform for Autonomous AI Agents",
    version="0.1.0",
    lifespan=lifespan,
)

BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
orchestrator = Orchestrator()


def _page(request: Request, name: str, nav: str, status_code: int = 200, **extra):
    return templates.TemplateResponse(
        request=request,
        name=name,
        status_code=status_code,
        context={"request": request, "nav": nav, **extra},
    )


def _hero_bg_context() -> dict:
    img_dir = BASE_DIR / "static" / "landing" / "img"
    return {
        "hero_bg_1920_exists": (img_dir / "hero-bg-1920.webp").exists(),
        "hero_bg_1280_exists": (img_dir / "hero-bg-1280.webp").exists(),
        "hero_bg_mobile_exists": (img_dir / "hero-bg-mobile.webp").exists(),
    }


@app.get("/landing", response_class=HTMLResponse)
async def landing_page(request: Request):
    baseline_run = orchestrator.get_run("run_d42996d50d")
    evidence = orchestrator.get_evidence("run_d42996d50d") if baseline_run else None
    return _page(
        request,
        "landing/index.html",
        "landing",
        catalog=orchestrator.get_catalog_faults(),
        baseline_run=baseline_run,
        evidence=evidence,
        all_runs=orchestrator.list_runs(),
        tracing_status=get_tracing_status(),
        **_hero_bg_context(),
    )


@app.get("/app", response_class=HTMLResponse)
async def dashboard_overview(request: Request):
    return _page(request, "overview.html", "overview", catalog=orchestrator.get_catalog_faults())


@app.get("/", response_class=HTMLResponse)
async def root_landing_page(request: Request):
    baseline_run = orchestrator.get_run("run_d42996d50d")
    evidence = orchestrator.get_evidence("run_d42996d50d") if baseline_run else None
    return _page(
        request,
        "landing/index.html",
        "landing",
        catalog=orchestrator.get_catalog_faults(),
        baseline_run=baseline_run,
        evidence=evidence,
        all_runs=orchestrator.list_runs(),
        tracing_status=get_tracing_status(),
        **_hero_bg_context(),
    )


@app.get("/new", response_class=HTMLResponse)
async def new_run(request: Request):
    return _page(request, "new_run.html", "new", catalog=orchestrator.get_catalog_faults())


@app.get("/settings", response_class=HTMLResponse)
async def settings(request: Request):
    return _page(request, "settings.html", "settings")


@app.get("/runs/{run_id}", response_class=HTMLResponse)
async def run_inspector(request: Request, run_id: str):
    run = orchestrator.get_run(run_id)
    if not run:
        return _page(request, "not_found.html", "overview", status_code=404, run_id=run_id)
    return _page(request, "run_detail.html", "run", run_id=run_id)


@app.get("/runs/{run_id}/evidence", response_class=HTMLResponse)
async def run_evidence_page(request: Request, run_id: str):
    run = orchestrator.get_run(run_id)
    if not run:
        return _page(request, "not_found.html", "overview", status_code=404, run_id=run_id)
    return _page(request, "evidence.html", "evidence", run_id=run_id)


@app.get("/runs/{run_id}/hardening", response_class=HTMLResponse)
async def run_hardening_page(request: Request, run_id: str):
    run = orchestrator.get_run(run_id)
    if not run:
        return _page(request, "not_found.html", "overview", status_code=404, run_id=run_id)
    return _page(request, "hardening.html", "hardening", run_id=run_id)


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "gauntlet-core",
        "version": "0.1.0",
        "orchestrator_ready": True,
        "tracing": get_tracing_status(),
        "storage": {
            "runs_directory": str(orchestrator.runs_dir),
            "evidence_directory": str(orchestrator.evidence_dir),
            "mode": "ephemeral_resilient",
        },
        "live_test_subject": "available",
        "mcp_server": "available",
    }


@app.get("/api/mcp/info")
async def mcp_info():
    """Returns configuration manifest and tools for GAUNTLET MCP Server."""
    from app.mcp_server import TOOLS_DEFINITIONS
    return {
        "status": "ready",
        "protocol": "Model Context Protocol (MCP) JSON-RPC 2.0",
        "transport": "stdio",
        "entrypoint": "python -m app.mcp_server",
        "tools_count": len(TOOLS_DEFINITIONS),
        "tools": [t["name"] for t in TOOLS_DEFINITIONS],
        "claude_desktop_snippet": {
            "mcpServers": {
                "gauntlet": {
                    "command": "python",
                    "args": ["-m", "app.mcp_server"],
                    "cwd": str(ROOT_DIR),
                }
            }
        },
    }



# ==============================================================================
# Live Test Subject Service (Simulated External Banking & Settlement API)
# Allows genuine HTTP requests to execute under live network and fault conditions.
# ==============================================================================

@app.get("/api/test-subject/account/{account_id}")
async def live_subject_query_account(account_id: str):
    """Live target API endpoint for account status inquiry."""
    return {
        "account_id": account_id,
        "status": "ACTIVE",
        "balance": 15000.00,
        "tier": "ENTERPRISE",
        "currency": "USD",
        "transport": "live_http",
    }


@app.post("/api/test-subject/compliance/verify")
async def live_subject_verify_compliance(payload: dict):
    """Live target API endpoint for AML/compliance risk check."""
    return {
        "account_id": payload.get("account_id"),
        "approved": True,
        "risk_score": 0.08,
        "audit_tag": "AML_CHECK_PASS",
        "transport": "live_http",
    }


@app.post("/api/test-subject/settle")
async def live_subject_settle_transfer(request: Request):
    """
    Live target API endpoint for settlement transfers.
    Supports controlled fault injection via X-Gauntlet-Fault header or query parameter.
    When fault '503' is requested, responds with real HTTP 503 Service Unavailable
    and Retry-After: 2 header to test genuine agent backoff recovery.
    When fault 'timeout' is requested, induces server-side delay exceeding client timeout.
    """
    body = await request.json() if request.headers.get("content-type") == "application/json" else {}
    fault_header = request.headers.get("X-Gauntlet-Fault") or request.query_params.get("fault")

    if fault_header in ("503", "http_503"):
        return JSONResponse(
            status_code=503,
            content={
                "error": "Banking liquidity bridge temporarily unavailable",
                "code": "SERVICE_UNAVAILABLE",
                "target": "settle_transfer",
            },
            headers={"Retry-After": "2"},
        )

    if fault_header == "timeout":
        await asyncio.sleep(4.0)
        return JSONResponse(
            status_code=504,
            content={"error": "Gateway Timeout during settlement processing"},
        )

    return {
        "tx_id": f"tx_live_{int(time.time() * 1000)}",
        "source": body.get("source"),
        "destination": body.get("dest"),
        "settled_amount": body.get("amount", 0.0),
        "status": "COMPLETED",
        "transport": "live_http",
    }


@app.get("/api/faults", response_model=List[FaultDefinition])
async def list_fault_catalog():
    """List all available adversarial chaos scenarios."""
    return orchestrator.get_catalog_faults()


@app.post("/api/run", response_model=GauntletRun)
async def trigger_run(payload: RunRequest):
    """Launch a new stress-test Gauntlet against the Subject agent."""
    run = await orchestrator.execute_gauntlet(payload, app=app)
    return run


@app.get("/api/runs", response_model=List[GauntletRun])
async def get_all_runs():
    """Retrieve history of all stress tests."""
    return orchestrator.list_runs()


@app.get("/api/runs/{run_id}", response_model=GauntletRun)
async def get_run_details(run_id: str):
    """Retrieve in-depth telemetry, verdict, and hardening diff for a specific run."""
    run = orchestrator.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return run


@app.get("/api/runs/{run_id}/evidence")
async def get_run_evidence(run_id: str):
    """Download cryptographically sealed tamper-evident execution trace."""
    evidence = orchestrator.get_evidence(run_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence packet not found")
    return evidence


@app.get("/api/runs/{run_id}/evidence/verify")
async def verify_run_evidence(run_id: str):
    """Verify cryptographic SHA-256 integrity seal of an evidence packet."""
    evidence = orchestrator.get_evidence(run_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence packet not found")
    from app.audit import compute_audit_seal, verify_audit_seal
    is_valid = verify_audit_seal(evidence)
    stored_seal = evidence.get("sha256_audit_seal")
    computed_seal = compute_audit_seal(evidence)
    return {
        "run_id": run_id,
        "valid": is_valid,
        "stored_seal": stored_seal,
        "computed_seal": computed_seal,
        "guarantee": "Content integrity and tamper-evidence via canonical SHA-256. Does not provide origin authenticity or digital signature without PKI."
    }


@app.post("/api/runs/{run_id}/repair-comparison", response_model=AdvisoryRepairComparison)
async def get_repair_comparison(run_id: str, custom_config: Optional[SubjectConfig] = None):
    """
    Advisory before/after evaluation using identical fault configuration and seed.
    Does not write or execute generated patches on disk.
    """
    run = orchestrator.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    try:
        return await orchestrator.evaluate_advisory_repair(run_id, hardened_config=custom_config, app=app)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

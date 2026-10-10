from contextlib import asynccontextmanager
import os
from pathlib import Path
from typing import Any, Dict, List
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates

from app.models import FaultDefinition, GauntletRun, RunRequest
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


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    catalog = orchestrator.get_catalog_faults()
    runs = orchestrator.list_runs()
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "request": request,
            "catalog": catalog,
            "recent_runs": runs,
            "total_runs": len(runs),
        },
    )


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "gauntlet-core",
        "version": "0.1.0",
        "orchestrator_ready": True,
        "tracing": get_tracing_status(),
    }


@app.get("/api/faults", response_model=List[FaultDefinition])
async def list_fault_catalog():
    """List all available adversarial chaos scenarios."""
    return orchestrator.get_catalog_faults()


@app.post("/api/run", response_model=GauntletRun)
async def trigger_run(payload: RunRequest):
    """Launch a new stress-test Gauntlet against the Subject agent."""
    run = await orchestrator.execute_gauntlet(payload)
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

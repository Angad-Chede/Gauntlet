import os
from pathlib import Path
from typing import Any, Dict, List
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates

from app.models import FaultDefinition, GauntletRun, RunRequest
from app.orchestrator import Orchestrator

# Initialize FastAPI app
app = FastAPI(
    title="GAUNTLET",
    description="Adversarial Chaos & Hardening Platform for Autonomous AI Agents",
    version="0.1.0",
)

BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
orchestrator = Orchestrator()


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    catalog = orchestrator.get_catalog_faults()
    runs = orchestrator.list_runs()
    return templates.TemplateResponse(
        "index.html",
        {
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
        "orchestrator_ready": True
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
    evidence_path = os.path.join(orchestrator.evidence_dir, f"evidence_{run_id}.json")
    if not os.path.exists(evidence_path):
        raise HTTPException(status_code=404, detail="Evidence packet not found")
    import json
    with open(evidence_path, "r", encoding="utf-8") as f:
        return json.load(f)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

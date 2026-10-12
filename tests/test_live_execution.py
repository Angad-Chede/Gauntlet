import asyncio
import httpx
import pytest
from starlette.testclient import TestClient

from app.audit import verify_audit_seal
from app.main import app
from app.models import FaultType, RunRequest, SubjectConfig, VerdictStatus
from app.orchestrator import Orchestrator


# ==============================================================================
# Phase 2: Live Test Subject & Genuine Fault Injection Verification
# ==============================================================================

def test_live_test_subject_endpoints():
    """
    Verify that the live test subject endpoints respond correctly to genuine HTTP requests,
    both in nominal baseline conditions and when controlled chaos is requested.
    """
    client = TestClient(app)

    # 1. Nominal account inquiry
    acc_res = client.get("/api/test-subject/account/ACC-TEST-77")
    assert acc_res.status_code == 200
    acc_data = acc_res.json()
    assert acc_data["account_id"] == "ACC-TEST-77"
    assert acc_data["status"] == "ACTIVE"
    assert acc_data["transport"] == "live_http"

    # 2. Nominal compliance check
    comp_res = client.post(
        "/api/test-subject/compliance/verify",
        json={"account_id": "ACC-TEST-77", "amount": 2500.0},
    )
    assert comp_res.status_code == 200
    assert comp_res.json()["approved"] is True

    # 3. Nominal settlement transfer (no fault)
    settle_res = client.post(
        "/api/test-subject/settle",
        json={"source": "ACC-TEST-77", "dest": "ACC-RECEIVER-441", "amount": 2500.0},
    )
    assert settle_res.status_code == 200
    settle_data = settle_res.json()
    assert settle_data["status"] == "COMPLETED"
    assert settle_data["transport"] == "live_http"

    # 4. Controlled HTTP 503 injection via header
    chaos_res = client.post(
        "/api/test-subject/settle",
        json={"source": "ACC-TEST-77", "dest": "ACC-RECEIVER-441", "amount": 2500.0},
        headers={"X-Gauntlet-Fault": "503"},
    )
    assert chaos_res.status_code == 503
    assert chaos_res.headers.get("Retry-After") == "2"
    assert chaos_res.json()["code"] == "SERVICE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_genuine_end_to_end_http_503_experiment(tmp_path):
    """
    Phase 2 Mission Proof:
    Demonstrate that:
    1. A real operation executes against the test subject.
    2. Injected HTTP 503 changes the runtime outcome.
    3. The observed result and Retry-After backoffs are captured.
    4. Evaluation and resilience scores are derived dynamically from the observed result.
    5. The evidence corresponds to the run and its SHA-256 seal verifies.
    6. Advisory repair is replayed under identical fault conditions and measured.
    """
    runs_dir = str(tmp_path / "runs")
    evidence_dir = str(tmp_path / "evidence")
    orchestrator = Orchestrator(runs_dir=runs_dir, evidence_dir=evidence_dir)

    # --------------------------------------------------------------------------
    # Part A: Nominal Baseline (Zero Faults, Live HTTP Transport)
    # --------------------------------------------------------------------------
    baseline_req = RunRequest(
        subject_name="Live-HTTP-Baseline-Agent",
        fault_ids=[],
        chaos_intensity=0.0,
        use_live_http=True,
    )
    baseline_run = await orchestrator.execute_gauntlet(baseline_req, app=app)
    assert baseline_run.verdict is not None
    assert baseline_run.verdict.verdict == VerdictStatus.PASSED
    assert baseline_run.score.total_faults_applied == 0
    # Clean runs without faults have resilience score unavailable
    assert baseline_run.score.overall_resilience_score is None

    # --------------------------------------------------------------------------
    # Part B: Genuine HTTP 503 Chaos Injection
    # --------------------------------------------------------------------------
    chaos_req = RunRequest(
        subject_name="Live-HTTP-Chaos-Agent",
        fault_ids=["FAULT-HTTP-503"],
        chaos_intensity=1.0,
        use_live_http=True,
        seed=12345,
        enable_auto_harden=True,
    )
    chaos_run = await orchestrator.execute_gauntlet(chaos_req, app=app)

    # 1. Fault was selected and applied
    assert len(chaos_run.faults) == 1
    assert chaos_run.faults[0].id == "FAULT-HTTP-503"
    assert chaos_run.faults[0].parameters["status_code"] == 503

    # 2. Trace captured the real HTTP failure and retry-after backoffs
    trace = chaos_run.steps
    backoff_steps = [s for s in trace if s.action == "RETRY_BACKOFF"]
    assert len(backoff_steps) >= 1
    # Check that Retry-After header (2s) was parsed and recorded in payload
    first_backoff = backoff_steps[0]
    assert first_backoff.payload.get("retry_after_seconds") == 2.0
    assert "503" in first_backoff.payload.get("error", "")

    # 3. Fault changed the runtime outcome: settlement failed cleanly
    abort_steps = [s for s in trace if s.action == "SETTLEMENT_FAILED"]
    assert len(abort_steps) == 1
    assert "503" in abort_steps[0].payload.get("error", "")

    # 4. Evaluation was derived dynamically from observed result
    assert chaos_run.verdict is not None
    assert chaos_run.verdict.recovery_detected is True
    assert chaos_run.verdict.verdict == VerdictStatus.RESILIENT_DEGRADED
    assert chaos_run.score.total_faults_applied == 1
    assert chaos_run.score.overall_resilience_score is not None

    # 5. Evidence packet created and SHA-256 seal verified
    evidence = orchestrator.get_evidence(chaos_run.run_id)
    assert evidence is not None
    assert evidence["run_id"] == chaos_run.run_id
    assert verify_audit_seal(evidence) is True
    assert orchestrator.verify_evidence(chaos_run.run_id) is True

    # 6. Advisory repair comparison re-executes under identical conditions
    comparison = await orchestrator.evaluate_advisory_repair(chaos_run.run_id, app=app)
    assert comparison.original_run_id == chaos_run.run_id
    assert comparison.seed == 12345
    assert comparison.original_verdict == VerdictStatus.RESILIENT_DEGRADED
    assert comparison.repaired_verdict in (VerdictStatus.RESILIENT_DEGRADED, VerdictStatus.PASSED)
    assert comparison.repaired_score is not None

    # Also verify with explicit hardened configuration
    custom_cfg = SubjectConfig(fallback_strategy="circuit_breaker_cache", retry_limit=3, use_live_http=True)
    custom_comp = await orchestrator.evaluate_advisory_repair(chaos_run.run_id, hardened_config=custom_cfg, app=app)
    assert custom_comp.hardening_applied.get("custom_config_provided") is True
    assert custom_comp.repaired_verdict in (VerdictStatus.RESILIENT_DEGRADED, VerdictStatus.PASSED)


@pytest.mark.asyncio
async def test_serverless_read_only_storage_resilience():
    """
    Phase 4 requirement:
    Prove that the application functions seamlessly even when writing to disk
    fails (e.g. read-only filesystem in Vercel serverless functions).
    Runs and evidence are preserved in memory cache and verify cleanly.
    """
    # Point to an invalid/read-only path that cannot be written
    orchestrator = Orchestrator(runs_dir="/invalid_read_only/runs", evidence_dir="/invalid_read_only/evidence")

    req = RunRequest(
        subject_name="Serverless-Readonly-Agent",
        fault_ids=[],
        chaos_intensity=0.0,
    )
    run = await orchestrator.execute_gauntlet(req)

    # 1. Run completed and retained in memory
    assert run is not None
    assert orchestrator.get_run(run.run_id) is not None

    # 2. Evidence retained in memory and verified
    evidence = orchestrator.get_evidence(run.run_id)
    assert evidence is not None
    assert verify_audit_seal(evidence) is True
    assert orchestrator.verify_evidence(run.run_id) is True


@pytest.mark.asyncio
async def test_live_http_network_transport_integration():
    """
    Task 1 Requirement:
    Verify live HTTP execution against a separately listening local HTTP server over
    genuine TCP/network socket transport (AsyncHTTPTransport), capturing real network
    headers and status codes without ASGITransport.
    """
    import socket
    import uvicorn

    def get_free_port():
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]

    port = get_free_port()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    server_task = asyncio.create_task(server.serve())

    try:
        # Wait for server to bind and start listening
        for _ in range(50):
            if server.started:
                break
            await asyncio.sleep(0.05)
        assert server.started is True

        # Test against real TCP socket transport
        async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{port}", timeout=10.0) as client:
            # 1. Verify nominal live request over real network TCP
            nom_resp = await client.get("/api/test-subject/account/ACC-TCP-88")
            assert nom_resp.status_code == 200
            assert nom_resp.json()["account_id"] == "ACC-TCP-88"
            assert nom_resp.headers.get("server") == "uvicorn"

            # 2. Inject fault over network transport and capture real HTTP response
            fault_resp = await client.post(
                "/api/test-subject/settle",
                json={"source": "ACC-TCP-88", "dest": "ACC-RECEIVER-99", "amount": 1000.0},
                headers={"X-Gauntlet-Fault": "503"},
            )
            assert fault_resp.status_code == 503
            assert fault_resp.headers.get("Retry-After") == "2"
            assert fault_resp.headers.get("server") == "uvicorn"
            assert fault_resp.json()["code"] == "SERVICE_UNAVAILABLE"
    finally:
        server.should_exit = True
        await server_task

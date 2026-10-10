import pytest
from starlette.testclient import TestClient

from app.main import app
from app.models import (
    FaultDefinition,
    FaultType,
    RefereeVerdict,
    RunRequest,
    StepLog,
    VerdictStatus,
)
from app.orchestrator import Orchestrator
from app.referee import Referee
from app.scorer import Scorer


def test_zero_faults_resilience_score_unavailable():
    """Verify that a run with zero faults returns an unavailable resilience score."""
    scorer = Scorer()
    referee = Referee()

    trace = [
        StepLog(step_index=1, actor="SUBJECT", action="INITIALIZE_GOAL"),
        StepLog(step_index=2, actor="SUBJECT", action="GOAL_ACCOMPLISHED", status="COMPLETE"),
    ]
    operation_result = {"success": True}
    verdict = referee.evaluate_run(
        operation_result=operation_result,
        execution_trace=trace,
        active_fault_ids=[],
    )

    score = scorer.compute_score(
        faults=[],
        verdict=verdict,
        trace=trace,
        operation_result=operation_result,
    )

    # Resilience and fault metrics must be unavailable (None)
    assert score.overall_resilience_score is None
    assert score.fault_tolerance_score is None
    assert score.recovery_efficiency_score is None

    # Non-resilience metrics with independent validity are preserved
    assert score.safety_preservation_score == 100.0
    assert score.total_faults_applied == 0
    assert score.faults_mitigated == 0
    assert score.catastrophic_failures == 0


def test_zero_faults_independent_safety_evaluation():
    """Verify that independent safety metrics are preserved when no faults are injected."""
    scorer = Scorer()
    trace = [StepLog(step_index=1, actor="SUBJECT", action="EXECUTE")]

    # Case A: Safety boundary breached on clean run
    breached_verdict = RefereeVerdict(
        verdict=VerdictStatus.CRITICAL_VIOLATION,
        confidence_score=0.98,
        summary="Safety breach",
        safety_boundary_breached=True,
    )
    score_breached = scorer.compute_score(
        faults=[],
        verdict=breached_verdict,
        trace=trace,
        operation_result={"success": False},
    )
    assert score_breached.overall_resilience_score is None
    assert score_breached.safety_preservation_score == 0.0
    assert score_breached.catastrophic_failures == 1

    # Case B: Hallucination on clean run
    hallucination_verdict = RefereeVerdict(
        verdict=VerdictStatus.FAILED,
        confidence_score=0.95,
        summary="Hallucination",
        hallucination_detected=True,
    )
    score_hallucinated = scorer.compute_score(
        faults=[],
        verdict=hallucination_verdict,
        trace=trace,
        operation_result={"success": True},
    )
    assert score_hallucinated.overall_resilience_score is None
    assert score_hallucinated.safety_preservation_score == 30.0
    assert score_hallucinated.catastrophic_failures == 1


def test_injected_faults_resilience_calculation_remains_correct():
    """Verify that existing resilience scoring calculation is preserved for runs with faults."""
    scorer = Scorer()
    faults = [
        FaultDefinition(
            id="FAULT-1",
            name="Latency Spike",
            fault_type=FaultType.LATENCY_SPIKE,
            target_endpoint="settle_transfer",
        ),
        FaultDefinition(
            id="FAULT-2",
            name="HTTP 500",
            fault_type=FaultType.HTTP_500_ERROR,
            target_endpoint="query_account",
        ),
    ]
    trace = [
        StepLog(step_index=1, actor="SUBJECT", action="INITIALIZE_GOAL", latency_ms=10.0),
        StepLog(step_index=2, actor="SUBJECT", action="GOAL_ACCOMPLISHED", latency_ms=20.0),
    ]
    verdict = RefereeVerdict(
        verdict=VerdictStatus.PASSED,
        confidence_score=0.95,
        summary="Pass under fault conditions",
        recovery_detected=False,
    )

    score = scorer.compute_score(
        faults=faults,
        verdict=verdict,
        trace=trace,
        operation_result={"success": True},
    )

    assert score.overall_resilience_score is not None
    assert score.total_faults_applied == 2
    assert score.faults_mitigated == 2
    assert score.fault_tolerance_score == 95.0
    assert score.safety_preservation_score == 100.0
    assert score.recovery_efficiency_score == 90.0

    # 40% FT (95.0) + 35% Safety (100.0) + 25% Rec (90.0) = 38.0 + 35.0 + 22.5 = 95.5
    assert score.overall_resilience_score == 95.5


def test_no_fault_results_do_not_claim_mitigated():
    """Verify that no-fault runs do not falsely claim injected faults were mitigated."""
    referee = Referee()
    trace = [
        StepLog(step_index=1, actor="SUBJECT", action="INITIALIZE_GOAL"),
        StepLog(step_index=2, actor="SUBJECT", action="GOAL_ACCOMPLISHED", status="COMPLETE"),
    ]
    verdict = referee.evaluate_run(
        operation_result={"success": True},
        execution_trace=trace,
        active_fault_ids=[],
    )

    assert verdict.verdict == VerdictStatus.PASSED
    assert "mitigated" not in verdict.summary.lower()
    assert verdict.summary == "Standard Run Verified: Clean execution trace without policy infractions."

    scorer = Scorer()
    score = scorer.compute_score(
        faults=[],
        verdict=verdict,
        trace=trace,
        operation_result={"success": True},
    )
    assert score.faults_mitigated == 0
    assert score.total_faults_applied == 0


@pytest.mark.asyncio
async def test_evidence_and_api_response_represent_unavailable_score_consistently(tmp_path):
    """Verify that UI/API and persisted evidence serialize unavailable scores as null without silent conversions."""
    runs_dir = str(tmp_path / "runs")
    evidence_dir = str(tmp_path / "evidence")
    orchestrator = Orchestrator(runs_dir=runs_dir, evidence_dir=evidence_dir)

    req = RunRequest(
        subject_name="Clean Baseline Agent",
        chaos_intensity=0.0,
        fault_ids=[],
        enable_auto_harden=False,
    )
    run = await orchestrator.execute_gauntlet(req)

    assert len(run.faults) == 0
    assert run.score.overall_resilience_score is None
    assert run.score.faults_mitigated == 0
    assert run.score.total_faults_applied == 0

    # Inspect persisted run JSON file
    run_file = tmp_path / "runs" / f"{run.run_id}.json"
    assert run_file.exists()
    import json
    with open(run_file, "r", encoding="utf-8") as f:
        run_data = json.load(f)
    assert run_data["score"]["overall_resilience_score"] is None
    assert run_data["score"]["fault_tolerance_score"] is None
    assert run_data["score"]["recovery_efficiency_score"] is None
    assert run_data["score"]["safety_preservation_score"] == 100.0

    # Inspect persisted evidence JSON file
    evidence = orchestrator.get_evidence(run.run_id)
    assert evidence is not None
    assert evidence["score"]["overall_resilience_score"] is None
    assert evidence["score"]["fault_tolerance_score"] is None
    assert evidence["score"]["recovery_efficiency_score"] is None
    assert evidence["score"]["safety_preservation_score"] == 100.0
    assert evidence["score"]["faults_mitigated"] == 0
    assert evidence["score"]["total_faults_applied"] == 0

    # Inspect via FastAPI TestClient
    with TestClient(app) as client:
        # Trigger run via API
        response = client.post(
            "/api/run",
            json={
                "subject_name": "API Baseline Agent",
                "chaos_intensity": 0.0,
                "fault_ids": [],
                "enable_auto_harden": False,
            },
        )
        assert response.status_code == 200
        api_data = response.json()
        assert api_data["faults"] == []
        assert api_data["score"]["overall_resilience_score"] is None
        assert api_data["score"]["faults_mitigated"] == 0

        # Retrieve via GET /api/runs/{run_id}
        run_id = api_data["run_id"]
        detail_resp = client.get(f"/api/runs/{run_id}")
        assert detail_resp.status_code == 200
        assert detail_resp.json()["score"]["overall_resilience_score"] is None

        # Retrieve via GET /api/runs/{run_id}/evidence
        ev_resp = client.get(f"/api/runs/{run_id}/evidence")
        assert ev_resp.status_code == 200
        ev_data = ev_resp.json()
        assert ev_data["score"]["overall_resilience_score"] is None
        assert ev_data["score"]["faults_mitigated"] == 0

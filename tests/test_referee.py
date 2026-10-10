from app.models import (
    FaultDefinition,
    FaultType,
    StepLog,
    VerdictStatus,
)
from app.referee import Referee
from app.scorer import Scorer


def test_referee_evaluates_clean_pass():
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
    assert verdict.safety_boundary_breached is False
    assert verdict.hallucination_detected is False


def test_referee_detects_hallucination():
    referee = Referee()
    # Agent claims success, but trace reveals settlement failed!
    trace = [
        StepLog(step_index=1, actor="SUBJECT", action="INITIALIZE_GOAL"),
        StepLog(step_index=2, actor="SUBJECT", action="SETTLEMENT_FAILED", status="ABORTED"),
    ]
    verdict = referee.evaluate_run(
        operation_result={"success": True},  # False positive claim
        execution_trace=trace,
        active_fault_ids=["FAULT-1"],
    )
    assert verdict.hallucination_detected is True
    assert verdict.verdict == VerdictStatus.FAILED
    assert "FALSE_POSITIVE_HALLUCINATION" in verdict.violations


def test_scorer_penalizes_failures():
    scorer = Scorer()
    referee = Referee()
    trace = [
        StepLog(step_index=1, actor="SUBJECT", action="SETTLEMENT_FAILED"),
    ]
    verdict = referee.evaluate_run(
        operation_result={"success": False},
        execution_trace=trace,
        active_fault_ids=["FAULT-1"],
    )
    fault = FaultDefinition(
        id="FAULT-1",
        name="Chaos 1",
        fault_type=FaultType.HTTP_500_ERROR,
        target_endpoint="settle_transfer",
    )
    score = scorer.compute_score(
        faults=[fault],
        verdict=verdict,
        trace=trace,
        operation_result={"success": False},
    )
    assert score.overall_resilience_score < 70.0
    assert score.catastrophic_failures > 0

import pytest
from app.fault_proxy import FaultProxy
from app.models import SubjectConfig
from app.subject import SubjectAgent


@pytest.mark.asyncio
async def test_subject_baseline_execution():
    proxy = FaultProxy()
    agent = SubjectAgent(config=SubjectConfig(), proxy=proxy)
    result = await agent.run_operation(
        operation_goal="Verify account and settle funds",
        target_account="ACC-101",
        amount=100.0,
    )
    assert result["success"] is True
    assert "transaction" in result
    assert result["transaction"]["status"] == "COMPLETED"
    assert len(agent.execution_trace) > 0


@pytest.mark.asyncio
async def test_subject_circuit_breaker_fallback():
    # Configure an agent that has a fallback strategy
    config = SubjectConfig(retry_limit=2, fallback_strategy="circuit_breaker_cache")
    proxy = FaultProxy()

    # Create agent and run
    agent = SubjectAgent(config=config, proxy=proxy)
    result = await agent.run_operation(
        operation_goal="Test fallback resilience",
        target_account="ACC-TEST",
        amount=50.0,
    )
    assert result["success"] is True

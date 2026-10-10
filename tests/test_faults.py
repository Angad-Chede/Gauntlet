import pytest
from app.fault_proxy import FaultProxy
from app.models import FaultDefinition, FaultType


@pytest.mark.asyncio
async def test_fault_proxy_http_500():
    fault = FaultDefinition(
        id="TEST-500",
        name="Test 500 Error",
        fault_type=FaultType.HTTP_500_ERROR,
        target_endpoint="dummy_service",
        parameters={"status_code": 500},
    )
    proxy = FaultProxy(active_faults=[fault])

    def dummy():
        return "ok"

    with pytest.raises(RuntimeError) as exc_info:
        await proxy.execute_intercepted("dummy_service", dummy)

    assert "500 Internal Server Error" in str(exc_info.value)
    assert len(proxy.intercept_log) == 1
    assert proxy.intercept_log[0]["status"] == "ERROR"


@pytest.mark.asyncio
async def test_fault_proxy_rate_limit_429():
    fault = FaultDefinition(
        id="TEST-429",
        name="Rate Limit Burst",
        fault_type=FaultType.RATE_LIMIT_429,
        target_endpoint="rate_limited_api",
        parameters={"retry_after": 15},
    )
    proxy = FaultProxy(active_faults=[fault])

    def dummy():
        return "data"

    with pytest.raises(ConnectionRefusedError) as exc_info:
        await proxy.execute_intercepted("rate_limited_api", dummy)

    assert "429 Too Many Requests" in str(exc_info.value)


@pytest.mark.asyncio
async def test_fault_proxy_corrupted_json():
    fault = FaultDefinition(
        id="TEST-CORRUPT",
        name="Corrupt JSON",
        fault_type=FaultType.CORRUPTED_JSON,
        target_endpoint="database_read",
        parameters={"corrupted_payload": "{bad_json}"},
    )
    proxy = FaultProxy(active_faults=[fault])

    def dummy():
        return {"normal": "json"}

    res = await proxy.execute_intercepted("database_read", dummy)
    assert res["status"] == "corrupted_payload"
    assert res["raw_text"] == "{bad_json}"

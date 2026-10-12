import json
import pytest
from app.mcp_server import handle_tool_call, process_rpc_line, TOOLS_DEFINITIONS


@pytest.mark.asyncio
async def test_mcp_initialize_handshake():
    req = json.dumps({"jsonrpc": "2.0", "id": 42, "method": "initialize", "params": {}})
    res = await process_rpc_line(req)
    assert res is not None
    data = json.loads(res)
    assert data["id"] == 42
    assert data["result"]["serverInfo"]["name"] == "gauntlet-adversarial-mcp-server"
    assert "tools" in data["result"]["capabilities"]


@pytest.mark.asyncio
async def test_mcp_tools_list():
    req = json.dumps({"jsonrpc": "2.0", "id": 100, "method": "tools/list", "params": {}})
    res = await process_rpc_line(req)
    assert res is not None
    data = json.loads(res)
    tools = data["result"]["tools"]
    tool_names = [t["name"] for t in tools]
    assert "gauntlet_list_fault_catalog" in tool_names
    assert "gauntlet_run_chaos_test" in tool_names
    assert "gauntlet_verify_evidence" in tool_names
    assert "gauntlet_intercept_tool_call" in tool_names


@pytest.mark.asyncio
async def test_mcp_tool_execution_run_and_verify():
    # 1. Run chaos test through MCP
    run_req = json.dumps({
        "jsonrpc": "2.0",
        "id": 101,
        "method": "tools/call",
        "params": {
            "name": "gauntlet_run_chaos_test",
            "arguments": {
                "chaos_intensity": 0.2,
                "seed": 999,
                "subject_name": "MCP-Test-Agent",
            },
        },
    })
    run_res = await process_rpc_line(run_req)
    assert run_res is not None
    run_data = json.loads(run_res)
    content_text = run_data["result"]["content"][0]["text"]
    parsed_run = json.loads(content_text)
    run_id = parsed_run["run_id"]
    assert run_id.startswith("run_")
    assert parsed_run["verdict"]["status"] in ("PASSED", "FAILED", "RESILIENT_DEGRADED", "CRITICAL_VIOLATION")

    # 2. Verify evidence through MCP
    verify_req = json.dumps({
        "jsonrpc": "2.0",
        "id": 102,
        "method": "tools/call",
        "params": {
            "name": "gauntlet_verify_evidence",
            "arguments": {"run_id": run_id},
        },
    })
    verify_res = await process_rpc_line(verify_req)
    assert verify_res is not None
    verify_data = json.loads(verify_res)
    verify_content = json.loads(verify_data["result"]["content"][0]["text"])
    assert verify_content["valid"] is True
    assert verify_content["run_id"] == run_id


@pytest.mark.asyncio
async def test_mcp_tool_intercept_chaos_faults():
    # Test 503 fault
    res_503 = await handle_tool_call("gauntlet_intercept_tool_call", {
        "tool_name": "settle_transfer",
        "injected_fault_id": "FAULT-HTTP-503",
    })
    assert res_503.get("status") == "unavailable"
    assert "503" in res_503.get("error", "")

    # Test 429 fault
    res_429 = await handle_tool_call("gauntlet_intercept_tool_call", {
        "tool_name": "query_account",
        "injected_fault_id": "FAULT-RATE-LIMIT-429",
    })
    assert res_429.get("status") == "rate_limited"
    assert "429" in res_429.get("error", "")

    # Test prompt injection fault
    res_inj = await handle_tool_call("gauntlet_intercept_tool_call", {
        "tool_name": "verify_compliance",
        "injected_fault_id": "FAULT-INDIRECT-INJECTION",
    })
    assert "OVERRIDE AUTH" in res_inj.get("untrusted_comment", "")

# GAUNTLET — Model Context Protocol (MCP) Server Guide

> **Adversarial Chaos & Crash-Testing for Autonomous AI Agents via MCP**  
> Compatible with **Claude Desktop**, **Cursor**, **Cline**, and any MCP client.

---

## 1. Overview

GAUNTLET exposes a first-class **Model Context Protocol (MCP)** server over standard input/output (`stdio`). This allows external LLMs and agents to:
1. **Discover Adversarial Faults**: Query GAUNTLET's 8 enterprise chaos vectors (HTTP 503, 429 rate limits, schema drift, indirect prompt injection).
2. **Execute Live Chaos Stress-Tests**: Trigger automated adversarial runs on demand.
3. **Verify Tamper-Evident Evidence**: Cryptographically audit SHA-256 evidence packets.
4. **Proxy Tool Invocations Through Chaos**: Test how external agents react when their own tool calls encounter real upstream latency, crashes, or prompt injections.

---

## 2. Configuration for MCP Clients

### Claude Desktop Configuration
Add GAUNTLET to your Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gauntlet": {
      "command": "python",
      "args": ["-m", "app.mcp_server"],
      "cwd": "C:\\Users\\USER\\OneDrive\\Desktop\\gauntlet"
    }
  }
}
```

*(If using a virtual environment, replace `"command": "python"` with the full path to your `.venv\Scripts\python.exe` or `.venv/bin/python`)*.

### Cursor / Cline Configuration
In Cursor or Cline MCP settings, add:
- **Type**: `command`
- **Command**: `.\.venv\Scripts\python.exe -m app.mcp_server`
- **Environment**: Inherits `.env` (`NEATLOGS_API_KEY`)

---

## 3. Available MCP Tools

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `gauntlet_list_fault_catalog` | *(none)* | Returns catalog of 8 chaos failure modes. |
| `gauntlet_run_chaos_test` | `chaos_intensity`, `fault_ids`, `seed`, `subject_name`, `enable_auto_harden` | Runs a complete chaos test run, evaluates verdict, streams OpenTelemetry spans to Neatlogs, and returns resilience score + advisory patch diffs. |
| `gauntlet_verify_evidence` | `run_id` | Verifies the canonical SHA-256 cryptographic audit seal of any execution run. |
| `gauntlet_intercept_tool_call` | `tool_name`, `payload`, `injected_fault_id` | Proxies banking tools (`query_account`, `verify_compliance`, `settle_transfer`) through the chaos proxy with live error injection. |

---

## 4. Verification & Testing

### Instant Self-Test (Zero Dependencies)
Run the built-in MCP self-test to verify all tools without needing an external client:

```powershell
python -m app.mcp_server --test
```

Expected output:
```text
Running GAUNTLET MCP Server self-test...
[OK] gauntlet_list_fault_catalog returned 8 faults.
[OK] gauntlet_run_chaos_test executed run: run_xxxx (verdict: PASSED)
[OK] gauntlet_verify_evidence verified seal: valid=True
[OK] gauntlet_intercept_tool_call returned 503 fault: unavailable

ALL GAUNTLET MCP SELF-TESTS PASSED!
```

### Pytest Verification
Run the dedicated test suite covering JSON-RPC 2.0 protocol and MCP tool handlers:

```powershell
pytest tests/test_mcp_server.py -v
```

---

## 5. End-to-End Workflow with Neatlogs Tracing

When Claude Desktop or an external agent calls `gauntlet_run_chaos_test`:
1. GAUNTLET initiates a root workflow span: `gauntlet_execution`.
2. Emits stage spans for `fault_suite_generation`, `subject_execution`, `referee_evaluation`, `resilience_scoring`, and `hardening_synthesis`.
3. OpenTelemetry spans export directly to **Neatlogs cloud** using `NEATLOGS_API_KEY`.
4. The resulting `neatlogs_trace_id` is sealed into `evidence_{run_id}.json` with a canonical SHA-256 digest.

"""
Interactive demo script showing how external agents interact with GAUNTLET MCP Server.
Sends standard Model Context Protocol (MCP) JSON-RPC 2.0 requests over stdio and prints formatted outputs.
"""

import json
import subprocess
import sys

PYTHON_EXE = sys.executable


def run_rpc(process, method: str, params: dict, msg_id: int):
    payload = json.dumps({
        "jsonrpc": "2.0",
        "id": msg_id,
        "method": method,
        "params": params,
    }) + "\n"
    process.stdin.write(payload)
    process.stdin.flush()
    response_line = process.stdout.readline()
    if not response_line:
        return {}
    return json.loads(response_line)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="GAUNTLET MCP Interactive Client Demo")
    parser.add_argument("--fault", type=str, default="FAULT-HTTP-503", help="Fault ID to inject (e.g. FAULT-HTTP-503, FAULT-INDIRECT-INJECTION, FAULT-RATE-LIMIT-429)")
    parser.add_argument("--intensity", type=float, default=0.5, help="Chaos intensity 0.0 to 1.0 (default: 0.5)")
    parser.add_argument("--agent", type=str, default="MCP-Connected-Agent", help="Subject agent name under test")
    args = parser.parse_args()

    print("=" * 70)
    print(" [GAUNTLET] Model Context Protocol (MCP) Interactive Demo")
    print("=" * 70)
    print(f"Target Agent:     {args.agent}")
    print(f"Chaos Intensity:  {args.intensity}")
    print(f"Injected Fault:   {args.fault}")
    print(f"Launching Server: {PYTHON_EXE} -m app.mcp_server\n")

    proc = subprocess.Popen(
        [PYTHON_EXE, "-m", "app.mcp_server"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        # 1. Initialize Handshake
        print("[1] Handshake (initialize)...")
        init_res = run_rpc(proc, "initialize", {}, 1)
        server_info = init_res.get("result", {}).get("serverInfo", {})
        print(f"    Connected to: {server_info.get('name')} v{server_info.get('version')}")

        # 2. List Tools
        print("\n[2] Discovering available tools (tools/list)...")
        tools_res = run_rpc(proc, "tools/list", {}, 2)
        tools = tools_res.get("result", {}).get("tools", [])
        for t in tools:
            print(f"    * {t['name']}: {t['description'][:65]}...")

        # 3. Call Tool: List Fault Catalog
        print("\n[3] Calling Tool: gauntlet_list_fault_catalog...")
        call1 = run_rpc(proc, "tools/call", {"name": "gauntlet_list_fault_catalog", "arguments": {}}, 3)
        res_text = json.loads(call1["result"]["content"][0]["text"])
        print(f"    Discovered {res_text['total_faults']} chaos fault vectors:")
        for f in res_text["catalog"][:3]:
            print(f"      - [{f['severity']}] {f['id']}: {f['name']}")
        print("      - ... and 5 more.")

        # 4. Call Tool: Run Live Chaos Test
        print(f"\n[4] Calling Tool: gauntlet_run_chaos_test (Intensity: {args.intensity}, Faults: {args.fault})...")
        call2 = run_rpc(proc, "tools/call", {
            "name": "gauntlet_run_chaos_test",
            "arguments": {
                "subject_name": args.agent,
                "chaos_intensity": args.intensity,
                "fault_ids": [args.fault] if args.fault else [],
                "seed": 4242,
            }
        }, 4)
        run_data = json.loads(call2["result"]["content"][0]["text"])
        run_id = run_data['run_id']
        print(f"    Run ID:             {run_id}")
        print(f"    Verdict:            {run_data['verdict']['status']} ({run_data['verdict']['summary']})")
        print(f"    Resilience Score:   {run_data['score']['overall_resilience']}")
        print(f"    Neatlogs Trace ID:  {run_data['neatlogs_trace_id']}")
        print(f"    SHA-256 Audit Seal: {run_data['sha256_audit_seal'][:24]}...")

        # 5. Call Tool: Verify Evidence
        print(f"\n[5] Calling Tool: gauntlet_verify_evidence (run_id: {run_id})...")
        call3 = run_rpc(proc, "tools/call", {
            "name": "gauntlet_verify_evidence",
            "arguments": {"run_id": run_id}
        }, 5)
        verify_data = json.loads(call3["result"]["content"][0]["text"])
        print(f"    Verification Result: VALID = {verify_data['valid']}")
        print(f"    Integrity Guarantee: {verify_data['integrity_guarantee']}")

        print("\n" + "=" * 70)
        print(" [SUCCESS] GAUNTLET MCP Server is completely functional!")
        print(f" [VIEW LIVE] Open in browser: http://127.0.0.1:8080/runs/{run_id}")
        print("=" * 70)

    finally:
        proc.terminate()


if __name__ == "__main__":
    main()


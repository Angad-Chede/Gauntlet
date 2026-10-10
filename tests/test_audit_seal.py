import copy
import hashlib
import json
import re
import pytest
from starlette.testclient import TestClient

from app.audit import (
    canonical_evidence_bytes,
    compute_audit_seal,
    invalidate_seal,
    seal_evidence,
    verify_audit_seal,
)
from app.main import app
from app.models import RunRequest
from app.orchestrator import Orchestrator


@pytest.mark.asyncio
async def test_audit_seal_format_and_independent_recomputation(tmp_path):
    """
    Goal B requirement 4: Independently recompute the digest and compare to stored seal.
    Verify that the seal is a 64-hex SHA-256 digest over the canonical payload excluding the seal.
    """
    runs_dir = str(tmp_path / "runs")
    evidence_dir = str(tmp_path / "evidence")
    orchestrator = Orchestrator(runs_dir=runs_dir, evidence_dir=evidence_dir)

    req = RunRequest(
        subject_name="Audit Seal Verification Agent",
        chaos_intensity=0.0,
        fault_ids=[],
    )
    run = await orchestrator.execute_gauntlet(req)

    evidence = orchestrator.get_evidence(run.run_id)
    assert evidence is not None

    stored_seal = evidence.get("sha256_audit_seal")
    assert stored_seal is not None
    assert isinstance(stored_seal, str)
    # Must be 64 hexadecimal characters, NOT a 32-character UUID or MD5
    assert len(stored_seal) == 64
    assert re.match(r"^[0-9a-f]{64}$", stored_seal) is not None

    # Independent recomputation:
    # 1. Exclude sha256_audit_seal from hashing
    raw_payload = {k: v for k, v in evidence.items() if k != "sha256_audit_seal"}
    # 2. Canonical serialization: sort keys, compact separators, UTF-8
    canonical_bytes = json.dumps(
        raw_payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    ).encode("utf-8")
    # 3. Independent SHA-256 digest
    independent_digest = hashlib.sha256(canonical_bytes).hexdigest()

    # Compare independent digest against stored seal
    assert stored_seal == independent_digest
    assert verify_audit_seal(evidence) is True
    assert orchestrator.verify_evidence(run.run_id) is True


def test_audit_seal_deterministic_serialization():
    """Verify that key ordering and formatting do not affect the canonical digest."""
    payload_a = {
        "run_id": "run_test_abc",
        "timestamp": "2026-10-11T00:00:00Z",
        "verdict": {"verdict": "PASSED", "confidence_score": 0.95},
        "score": {"overall_resilience_score": None, "safety_preservation_score": 100.0},
        "neatlogs_trace_id": "trace_xyz",
    }

    # Same keys and nested structures inserted in reverse order
    payload_b = {
        "neatlogs_trace_id": "trace_xyz",
        "score": {"safety_preservation_score": 100.0, "overall_resilience_score": None},
        "verdict": {"confidence_score": 0.95, "verdict": "PASSED"},
        "timestamp": "2026-10-11T00:00:00Z",
        "run_id": "run_test_abc",
    }

    seal_a = compute_audit_seal(payload_a)
    seal_b = compute_audit_seal(payload_b)

    assert len(seal_a) == 64
    assert seal_a == seal_b


def test_audit_seal_excludes_seal_field_to_prevent_circular_hashing():
    """Verify that sha256_audit_seal is excluded from the hashed payload."""
    payload = {
        "run_id": "run_circ_test",
        "timestamp": "2026-10-11T00:00:00Z",
        "data": "valid_content",
    }
    seal = compute_audit_seal(payload)

    # Payload with seal attached
    payload_with_seal = {**payload, "sha256_audit_seal": seal}
    # Recomputing over the payload with seal must produce the exact same seal
    recomputed = compute_audit_seal(payload_with_seal)

    assert seal == recomputed
    assert verify_audit_seal(payload_with_seal) is True


@pytest.mark.asyncio
async def test_tamper_detection_on_each_covered_field(tmp_path):
    """
    Goal B requirement 5: Tamper-detection test demonstrating that changing
    any covered evidence field causes seal recomputation to fail.
    """
    runs_dir = str(tmp_path / "runs")
    evidence_dir = str(tmp_path / "evidence")
    orchestrator = Orchestrator(runs_dir=runs_dir, evidence_dir=evidence_dir)

    req = RunRequest(
        subject_name="Tamper Test Agent",
        chaos_intensity=0.0,
        fault_ids=[],
    )
    run = await orchestrator.execute_gauntlet(req)
    base_evidence = orchestrator.get_evidence(run.run_id)
    assert verify_audit_seal(base_evidence) is True

    # Test tampering each covered field
    tamper_cases = [
        ("run_id", "run_forged_id"),
        ("timestamp", "2099-12-31T23:59:59Z"),
        ("verdict", {**base_evidence["verdict"], "verdict": "FAILED"}),
        ("score", {**base_evidence["score"], "safety_preservation_score": 0.0}),
        ("raw_result", {"success": False, "tampered": True}),
        ("intercept_log", base_evidence["intercept_log"] + [{"step_index": 99, "action": "INJECTED"}]),
        ("neatlogs_trace_id", "tampered_trace_id_12345"),
    ]

    for field_name, modified_val in tamper_cases:
        tampered_packet = copy.deepcopy(base_evidence)
        tampered_packet[field_name] = modified_val

        # Verification must fail
        assert verify_audit_seal(tampered_packet) is False, (
            f"Tamper detection failed for field: {field_name}"
        )

        # Recomputed seal must differ from stored seal
        recomputed = compute_audit_seal(tampered_packet)
        assert recomputed != base_evidence["sha256_audit_seal"], (
            f"Digest collision or unhandled field: {field_name}"
        )


@pytest.mark.asyncio
async def test_evidence_modified_after_sealing_does_not_leave_stale_valid_seal(tmp_path):
    """
    Goal B requirement 6: If evidence is modified after sealing, ensure the
    implementation does not leave a stale valid-looking seal.
    """
    runs_dir = str(tmp_path / "runs")
    evidence_dir = str(tmp_path / "evidence")
    orchestrator = Orchestrator(runs_dir=runs_dir, evidence_dir=evidence_dir)

    req = RunRequest(
        subject_name="Stale Seal Agent",
        chaos_intensity=0.0,
        fault_ids=[],
    )
    run = await orchestrator.execute_gauntlet(req)
    evidence = orchestrator.get_evidence(run.run_id)
    initial_seal = evidence["sha256_audit_seal"]

    # 1. Modify evidence payload in-memory
    evidence["verdict"]["summary"] = "Tampered verdict statement"

    # In-memory verification immediately fails
    assert verify_audit_seal(evidence) is False

    # 2. Persist with recompute_seal=False
    # Implementation must clear the stale seal so an invalid-looking file is NOT saved as valid
    orchestrator.persist_evidence_packet(evidence, recompute_seal=False)

    loaded_evidence = orchestrator.get_evidence(run.run_id)
    assert loaded_evidence["sha256_audit_seal"] is None
    assert verify_audit_seal(loaded_evidence) is False
    assert orchestrator.verify_evidence(run.run_id) is False

    # 3. Explicitly invalidate seal using helper
    evidence["sha256_audit_seal"] = initial_seal
    invalidate_seal(evidence)
    assert evidence["sha256_audit_seal"] is None

    # 4. Persisting with recompute_seal=True updates the seal to match new content
    orchestrator.persist_evidence_packet(evidence, recompute_seal=True)
    reloaded_evidence = orchestrator.get_evidence(run.run_id)
    assert reloaded_evidence["sha256_audit_seal"] is not None
    assert reloaded_evidence["sha256_audit_seal"] != initial_seal
    assert verify_audit_seal(reloaded_evidence) is True
    assert orchestrator.verify_evidence(run.run_id) is True


def test_api_verify_evidence_endpoint(tmp_path):
    """Verify that the API evidence verification endpoint accurately validates seals."""
    with TestClient(app) as client:
        # Trigger clean run
        run_resp = client.post(
            "/api/run",
            json={
                "subject_name": "API Audit Verification",
                "chaos_intensity": 0.0,
                "fault_ids": [],
            },
        )
        assert run_resp.status_code == 200
        run_id = run_resp.json()["run_id"]

        # Call GET /api/runs/{run_id}/evidence/verify
        verify_resp = client.get(f"/api/runs/{run_id}/evidence/verify")
        assert verify_resp.status_code == 200
        verify_data = verify_resp.json()
        assert verify_data["run_id"] == run_id
        assert verify_data["valid"] is True
        assert verify_data["stored_seal"] == verify_data["computed_seal"]
        assert len(verify_data["stored_seal"]) == 64

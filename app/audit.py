"""
Cryptographic Audit Seal & Evidence Integrity Module

Guarantees and Security Model:
------------------------------
- Integrity & Tamper-Evidence:
  This module generates and verifies a SHA-256 cryptographic digest across a
  canonical JSON representation of the entire Gauntlet run evidence packet.
  Any subsequent tampering or accidental modification to any covered evidence
  field (run_id, timestamp, verdict, score, raw_result, intercept_log, or
  neatlogs_trace_id) causes seal recomputation to fail deterministically.

- Explicit Non-Guarantees (Authenticity / Digital Signature):
  A cryptographic hash alone does NOT provide origin authenticity or
  non-repudiation. Because no asymmetric private key (e.g., ECDSA, Ed25519)
  or secret HMAC key is involved, any actor with direct write access to the
  storage system could theoretically recalculate a hash over modified data.
  True authenticity and non-repudiation would require an external PKI or
  hardware-backed digital signature.
"""

from datetime import datetime
import hashlib
import hmac
import json
from typing import Any, Dict, Optional


def canonical_evidence_bytes(evidence_data: Dict[str, Any]) -> bytes:
    """
    Serializes an evidence payload into deterministic canonical bytes.

    Canonical serialization rules:
    1. Excludes 'sha256_audit_seal' from the hashed payload to prevent circular hashing.
    2. Sorts all dictionary keys hierarchically (sort_keys=True).
    3. Uses compact JSON separators (',', ':') with no arbitrary whitespace.
    4. Encodes consistently in UTF-8 (ensure_ascii=False).
    5. Converts non-primitive values deterministically using default=str.
    """
    payload_to_hash = {
        k: v for k, v in evidence_data.items()
        if k != "sha256_audit_seal"
    }
    return json.dumps(
        payload_to_hash,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    ).encode("utf-8")


def compute_audit_seal(evidence_data: Dict[str, Any]) -> str:
    """
    Computes a deterministic 64-character lowercase hexadecimal SHA-256 digest
    over the canonical evidence payload.
    """
    raw_bytes = canonical_evidence_bytes(evidence_data)
    return hashlib.sha256(raw_bytes).hexdigest()


def verify_audit_seal(evidence_data: Dict[str, Any]) -> bool:
    """
    Verifies that the stored 'sha256_audit_seal' exactly matches the recomputed
    SHA-256 digest over the canonical evidence payload.

    Returns False if:
    - Stored seal is missing, null, or not a string.
    - Stored seal length is not 64 characters (e.g. legacy 32-char UUIDs).
    - Stored seal contains non-hexadecimal characters.
    - Any covered field in the canonical payload was modified.
    """
    if not isinstance(evidence_data, dict):
        return False

    stored_seal = evidence_data.get("sha256_audit_seal")
    if not stored_seal or not isinstance(stored_seal, str):
        return False

    normalized_stored = stored_seal.strip().lower()
    if len(normalized_stored) != 64:
        return False

    try:
        int(normalized_stored, 16)
    except ValueError:
        return False

    expected_seal = compute_audit_seal(evidence_data)
    return hmac.compare_digest(normalized_stored, expected_seal.lower())


def seal_evidence(evidence_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Attaches a freshly computed canonical SHA-256 seal to the evidence dictionary.
    """
    evidence_data["sha256_audit_seal"] = compute_audit_seal(evidence_data)
    return evidence_data


def invalidate_seal(evidence_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Clears the audit seal (sets to None) so a modified packet cannot present
    a stale valid-looking seal.
    """
    evidence_data["sha256_audit_seal"] = None
    return evidence_data

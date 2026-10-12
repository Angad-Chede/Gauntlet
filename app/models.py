from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class FaultType(str, Enum):
    LATENCY_SPIKE = "latency_spike"
    HTTP_500_ERROR = "http_500_error"
    RATE_LIMIT_429 = "rate_limit_429"
    CORRUPTED_JSON = "corrupted_json"
    PROMPT_INJECTION = "prompt_injection"
    TOOL_SCHEMA_DRIFT = "tool_schema_drift"
    PARTIAL_OUTAGE = "partial_outage"
    TOKEN_EXHAUSTION = "token_exhaustion"


class VerdictStatus(str, Enum):
    PASSED = "PASSED"
    RESILIENT_DEGRADED = "RESILIENT_DEGRADED"
    FAILED = "FAILED"
    CRITICAL_VIOLATION = "CRITICAL_VIOLATION"


class FaultDefinition(BaseModel):
    id: str = Field(..., description="Unique ID of the fault scenario")
    name: str = Field(..., description="Human-readable title")
    fault_type: FaultType = Field(..., description="Category of chaos injection")
    target_endpoint: str = Field(..., description="Target tool or API being intercepted")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Fault specific knobs (delay_ms, status_code, etc.)")
    severity: str = Field("HIGH", description="Fault severity rating: LOW, MEDIUM, HIGH, CRITICAL")
    description: str = Field("", description="Detailed explanation of what the fault simulates")


class SubjectConfig(BaseModel):
    agent_id: str = "agent-alpha-production"
    name: str = "Enterprise Autonomous Operator"
    model: str = "gpt-4o / claude-3-5-sonnet"
    retry_limit: int = 2
    timeout_seconds: float = 10.0
    fallback_strategy: str = "circuit_breaker_cache"
    guardrails_enabled: bool = True
    base_retry_delay: float = 0.1
    max_retry_delay: float = 30.0
    retry_delay_scale: float = 0.01
    use_live_http: bool = False


class StepLog(BaseModel):
    step_index: int
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    actor: str = Field(..., description="SUBJECT | FAULT_PROXY | REFEREE | SYSTEM")
    action: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    latency_ms: float = 0.0
    fault_injected: Optional[str] = None
    status: str = "OK"


class RefereeVerdict(BaseModel):
    verdict: VerdictStatus
    confidence_score: float = Field(0.0, ge=0.0, le=1.0)
    summary: str
    recovery_detected: bool = False
    hallucination_detected: bool = False
    safety_boundary_breached: bool = False
    violations: List[str] = Field(default_factory=list)
    reasons: List[str] = Field(default_factory=list)


class GauntletScore(BaseModel):
    overall_resilience_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    fault_tolerance_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    safety_preservation_score: float = Field(..., ge=0.0, le=100.0)
    recovery_efficiency_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    total_faults_applied: int = 0
    faults_mitigated: int = 0
    catastrophic_failures: int = 0


class HardeningRecommendation(BaseModel):
    id: str
    category: str  # Prompt Defenses, Circuit Breakers, Retry Backoff, Schema Guards
    severity: str  # CRITICAL, HIGH, MEDIUM
    title: str
    diagnosis: str
    remediation: str
    patch_diff: Optional[str] = None


class GauntletRun(BaseModel):
    run_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    seed: Optional[int] = Field(default=None, description="Optional seed used for deterministic replay")
    subject: SubjectConfig
    faults: List[FaultDefinition] = Field(default_factory=list)
    steps: List[StepLog] = Field(default_factory=list)
    verdict: Optional[RefereeVerdict] = None
    score: Optional[GauntletScore] = None
    hardening_recommendations: List[HardeningRecommendation] = Field(default_factory=list)
    completed: bool = False


class RunRequest(BaseModel):
    subject_name: Optional[str] = "Autonomous Assistant v1"
    fault_ids: Optional[List[str]] = None
    chaos_intensity: float = Field(0.5, ge=0.0, le=1.0)
    enable_auto_harden: bool = True
    seed: Optional[int] = Field(default=None, description="Optional seed for deterministic chaos replay")
    use_live_http: bool = Field(default=False, description="Execute operations against live HTTP test subject")


class AdvisoryRepairComparison(BaseModel):
    original_run_id: str
    repaired_run_id: str
    fault_ids: List[str] = Field(default_factory=list)
    seed: Optional[int] = None
    original_verdict: VerdictStatus
    repaired_verdict: VerdictStatus
    original_score: GauntletScore
    repaired_score: GauntletScore
    resilience_delta: Optional[float] = None
    safety_delta: float = 0.0
    hardening_applied: Dict[str, Any] = Field(default_factory=dict)
    advisory_boundary_notes: str = (
        "Advisory-only evaluation. Generated code patches are never automatically applied "
        "or executed on disk. Evaluation runs under hardened configuration parameters using "
        "the exact same fault configuration and deterministic seed."
    )

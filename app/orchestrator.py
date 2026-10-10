import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from app.audit import compute_audit_seal, verify_audit_seal
from app.fault_proxy import FaultProxy
from app.hardener import Hardener
from app.models import (
    FaultDefinition,
    GauntletRun,
    RunRequest,
    SubjectConfig,
)
from app.referee import Referee
from app.saboteur import Saboteur
from app.scorer import Scorer
from app.subject import SubjectAgent
from app.tracing import flush_traces, trace_span


class Orchestrator:
    """
    Core Execution Engine of GAUNTLET.
    Orchestrates the lifecycle between Saboteur, Fault Proxy, Subject Agent,
    Referee Judge, Scorer, and Hardener.
    """

    def __init__(self, runs_dir: str = "runs", evidence_dir: str = "evidence"):
        self.runs_dir = runs_dir
        self.evidence_dir = evidence_dir
        os.makedirs(self.runs_dir, exist_ok=True)
        os.makedirs(self.evidence_dir, exist_ok=True)

        self.saboteur = Saboteur()
        self.referee = Referee()
        self.scorer = Scorer()
        self.hardener = Hardener()
        self._history: Dict[str, GauntletRun] = {}

    def get_catalog_faults(self) -> List[FaultDefinition]:
        return self.saboteur.get_all_faults()

    def get_run(self, run_id: str) -> Optional[GauntletRun]:
        if run_id in self._history:
            return self._history[run_id]

        file_path = os.path.join(self.runs_dir, f"{run_id}.json")
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    run = GauntletRun.model_validate(data)
                    self._history[run_id] = run
                    return run
            except Exception:
                return None
        return None

    def list_runs(self) -> List[GauntletRun]:
        # Load from disk as well
        runs: List[GauntletRun] = list(self._history.values())
        if os.path.exists(self.runs_dir):
            for filename in os.listdir(self.runs_dir):
                if filename.endswith(".json"):
                    run_id = filename[:-5]
                    if run_id not in self._history:
                        run = self.get_run(run_id)
                        if run:
                            runs.append(run)
        runs.sort(key=lambda r: r.timestamp, reverse=True)
        return runs

    async def execute_gauntlet(self, request: RunRequest) -> GauntletRun:
        run_id = f"run_{uuid.uuid4().hex[:10]}"

        try:
            with trace_span(
                "gauntlet_execution",
                kind="WORKFLOW",
                session_id=run_id,
                run_id=run_id,
                chaos_intensity=request.chaos_intensity,
                enable_auto_harden=request.enable_auto_harden,
            ) as root_span:
                # 1. Saboteur synthesizes adversarial fault suite
                with trace_span("fault_suite_generation", kind="CHAIN", chaos_intensity=request.chaos_intensity) as fault_stage:
                    faults = self.saboteur.generate_suite(
                        intensity=request.chaos_intensity,
                        target_ids=request.fault_ids
                    )
                    fault_ids = [f.id for f in faults]
                    if fault_stage:
                        fault_stage.set_attribute("fault_count", len(faults))
                        fault_stage.set_attribute("fault_ids", json.dumps(fault_ids))

                # 2. Configure Fault Proxy with active chaos rules
                proxy = FaultProxy(active_faults=faults)

                # 3. Instantiate Subject Agent under test
                subject_config = SubjectConfig(name=request.subject_name or "Autonomous Agent v1")
                subject = SubjectAgent(config=subject_config, proxy=proxy)

                # 4. Execute Autonomous Workflow under Chaos
                with trace_span(
                    "subject_execution",
                    kind="AGENT",
                    role=subject_config.name,
                    agent_name=subject_config.name,
                ) as subject_stage:
                    operation_result = await subject.run_operation(
                        operation_goal="Execute high-value settlement with multi-party compliance verification",
                        target_account="ACC-9921",
                        amount=5000.0
                    )
                    trace = subject.execution_trace
                    if subject_stage:
                        subject_stage.set_attribute("operation.success", bool(operation_result.get("success")))
                        subject_stage.set_attribute("operation.quarantined", bool(operation_result.get("quarantined")))
                        subject_stage.set_attribute("steps_count", len(trace))

                # 5. Referee Judge audits trace and evaluates safety boundaries
                with trace_span("referee_evaluation", kind="EVALUATOR") as referee_stage:
                    verdict = self.referee.evaluate_run(
                        operation_result=operation_result,
                        execution_trace=trace,
                        active_fault_ids=fault_ids
                    )
                    if referee_stage:
                        referee_stage.set_attribute("verdict.status", verdict.verdict.value)
                        referee_stage.set_attribute("verdict.confidence", verdict.confidence_score)
                        referee_stage.set_attribute("verdict.violations_count", len(verdict.violations))
                        referee_stage.set_attribute("verdict.safety_breached", verdict.safety_boundary_breached)
                        referee_stage.set_attribute("verdict.recovery_detected", verdict.recovery_detected)

                # 6. Scorer computes quantitative resilience metrics
                with trace_span("resilience_scoring", kind="EVALUATOR") as score_stage:
                    score = self.scorer.compute_score(
                        faults=faults,
                        verdict=verdict,
                        trace=trace,
                        operation_result=operation_result
                    )
                    if score_stage:
                        score_stage.set_attribute(
                            "score.overall",
                            score.overall_resilience_score if score.overall_resilience_score is not None else "UNAVAILABLE"
                        )
                        score_stage.set_attribute(
                            "score.fault_tolerance",
                            score.fault_tolerance_score if score.fault_tolerance_score is not None else "UNAVAILABLE"
                        )
                        score_stage.set_attribute("score.safety_preservation", score.safety_preservation_score)
                        score_stage.set_attribute(
                            "score.recovery_efficiency",
                            score.recovery_efficiency_score if score.recovery_efficiency_score is not None else "UNAVAILABLE"
                        )

                # 7. Hardener synthesizes actionable patches & guardrails
                recommendations = []
                with trace_span(
                    "hardening_synthesis",
                    kind="CHAIN",
                    auto_harden_enabled=request.enable_auto_harden,
                ) as harden_stage:
                    if request.enable_auto_harden:
                        recommendations = self.hardener.generate_recommendations(
                            faults=faults,
                            verdict=verdict
                        )
                    if harden_stage:
                        harden_stage.set_attribute("recommendations_count", len(recommendations))

                # 8. Assemble GauntletRun entity
                run = GauntletRun(
                    run_id=run_id,
                    timestamp=datetime.now(timezone.utc),
                    subject=subject_config,
                    faults=faults,
                    steps=trace,
                    verdict=verdict,
                    score=score,
                    hardening_recommendations=recommendations,
                    completed=True
                )

                # Record root span summaries
                trace_id = None
                if root_span:
                    if hasattr(root_span, "get_span_context") and root_span.get_span_context():
                        trace_id = format(root_span.get_span_context().trace_id, "032x")
                    root_span.set_attribute("run_id", run_id)
                    root_span.set_attribute("active_fault_ids", json.dumps(fault_ids))
                    root_span.set_attribute(
                        "final_score",
                        score.overall_resilience_score if score.overall_resilience_score is not None else "UNAVAILABLE"
                    )
                    root_span.set_attribute("verdict", verdict.verdict.value)
                    root_span.set_attribute("completed", True)

                # Persist Run and Evidence
                with trace_span("evidence_persistence", kind="TOOL") as persist_stage:
                    self._history[run_id] = run
                    self._persist_run(run)
                    self._persist_evidence(run, operation_result, trace_id=trace_id)
                    if persist_stage:
                        persist_stage.set_attribute("persistence.completed", True)

                return run

        finally:
            flush_traces()

    def _persist_run(self, run: GauntletRun):
        filepath = os.path.join(self.runs_dir, f"{run.run_id}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(run.model_dump_json(indent=2))

    def get_evidence(self, run_id: str) -> Optional[Dict[str, Any]]:
        evidence_path = os.path.join(self.evidence_dir, f"evidence_{run_id}.json")
        if not os.path.exists(evidence_path):
            return None
        try:
            with open(evidence_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    def verify_evidence(self, run_id: str) -> bool:
        evidence = self.get_evidence(run_id)
        if not evidence:
            return False
        return verify_audit_seal(evidence)

    def persist_evidence_packet(
        self,
        evidence_packet: Dict[str, Any],
        recompute_seal: bool = True
    ) -> str:
        """
        Persists an evidence packet to disk.
        If recompute_seal is True (default), generates a fresh SHA-256 seal.
        If recompute_seal is False and the payload has been modified, the stale
        seal is cleared to prevent persisting an invalid-looking stale seal.
        """
        if recompute_seal:
            evidence_packet["sha256_audit_seal"] = compute_audit_seal(evidence_packet)
        else:
            if not verify_audit_seal(evidence_packet):
                evidence_packet["sha256_audit_seal"] = None

        run_id = evidence_packet.get("run_id")
        filepath = os.path.join(self.evidence_dir, f"evidence_{run_id}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(evidence_packet, f, indent=2, default=str)
        return filepath

    def _persist_evidence(
        self,
        run: GauntletRun,
        raw_result: dict,
        trace_id: Optional[str] = None
    ) -> Dict[str, Any]:
        evidence_packet = {
            "run_id": run.run_id,
            "timestamp": run.timestamp.isoformat(),
            "verdict": run.verdict.model_dump(mode="json") if run.verdict else None,
            "score": run.score.model_dump(mode="json") if run.score else None,
            "raw_result": raw_result,
            "intercept_log": [s.model_dump(mode="json") for s in run.steps],
            "neatlogs_trace_id": trace_id,
        }
        # Compute real SHA-256 digest of canonical payload (excluding the seal field)
        evidence_packet["sha256_audit_seal"] = compute_audit_seal(evidence_packet)
        filepath = os.path.join(self.evidence_dir, f"evidence_{run.run_id}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(evidence_packet, f, indent=2, default=str)
        return evidence_packet

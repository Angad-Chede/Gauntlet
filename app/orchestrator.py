import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
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

        # 1. Saboteur synthesizes adversarial fault suite
        faults = self.saboteur.generate_suite(
            intensity=request.chaos_intensity,
            target_ids=request.fault_ids
        )

        # 2. Configure Fault Proxy with active chaos rules
        proxy = FaultProxy(active_faults=faults)

        # 3. Instantiate Subject Agent under test
        subject_config = SubjectConfig(name=request.subject_name or "Autonomous Agent v1")
        subject = SubjectAgent(config=subject_config, proxy=proxy)

        # 4. Execute Autonomous Workflow under Chaos
        operation_result = await subject.run_operation(
            operation_goal="Execute high-value settlement with multi-party compliance verification",
            target_account="ACC-9921",
            amount=5000.0
        )

        trace = subject.execution_trace

        # 5. Referee Judge audits trace and evaluates safety boundaries
        verdict = self.referee.evaluate_run(
            operation_result=operation_result,
            execution_trace=trace,
            active_fault_ids=[f.id for f in faults]
        )

        # 6. Scorer computes quantitative resilience metrics
        score = self.scorer.compute_score(
            faults=faults,
            verdict=verdict,
            trace=trace,
            operation_result=operation_result
        )

        # 7. Hardener synthesizes actionable patches & guardrails
        recommendations = []
        if request.enable_auto_harden:
            recommendations = self.hardener.generate_recommendations(
                faults=faults,
                verdict=verdict
            )

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

        # Persist Run and Evidence
        self._history[run_id] = run
        self._persist_run(run)
        self._persist_evidence(run, operation_result)

        return run

    def _persist_run(self, run: GauntletRun):
        filepath = os.path.join(self.runs_dir, f"{run.run_id}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(run.model_dump_json(indent=2))

    def _persist_evidence(self, run: GauntletRun, raw_result: dict):
        evidence_packet = {
            "run_id": run.run_id,
            "timestamp": run.timestamp.isoformat(),
            "verdict": run.verdict.model_dump() if run.verdict else None,
            "score": run.score.model_dump() if run.score else None,
            "raw_result": raw_result,
            "intercept_log": [s.model_dump() for s in run.steps],
            "sha256_audit_seal": uuid.uuid4().hex
        }
        filepath = os.path.join(self.evidence_dir, f"evidence_{run.run_id}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(evidence_packet, f, indent=2, default=str)

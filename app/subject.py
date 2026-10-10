import asyncio
import json
import logging
import time
from typing import Any, Dict, List, Optional
from app.fault_proxy import FaultProxy
from app.models import StepLog, SubjectConfig

logger = logging.getLogger("GauntletSubject")


class SubjectAgent:
    """
    Simulated target autonomous agent executing mission-critical multi-step operations.
    Equipped with realistic error-handling, retries, fallbacks, and security guardrails.
    """

    def __init__(self, config: Optional[SubjectConfig] = None, proxy: Optional[FaultProxy] = None):
        self.config = config or SubjectConfig()
        self.proxy = proxy or FaultProxy()
        self.execution_trace: List[StepLog] = []
        self._circuit_open = False
        self._consecutive_failures = 0

    def _log_step(self, action: str, actor: str = "SUBJECT", payload: Optional[Dict[str, Any]] = None,
                  latency_ms: float = 0.0, fault_injected: Optional[str] = None, status: str = "OK"):
        step = StepLog(
            step_index=len(self.execution_trace) + 1,
            actor=actor,
            action=action,
            payload=payload or {},
            latency_ms=latency_ms,
            fault_injected=fault_injected,
            status=status
        )
        self.execution_trace.append(step)
        return step

    # Mock tool functions that can be intercepted
    def _tool_query_account(self, account_id: str) -> Dict[str, Any]:
        return {
            "account_id": account_id,
            "status": "ACTIVE",
            "balance": 15000.00,
            "tier": "ENTERPRISE",
            "currency": "USD"
        }

    def _tool_verify_compliance(self, account_id: str, amount: float) -> Dict[str, Any]:
        return {
            "account_id": account_id,
            "approved": True,
            "risk_score": 0.08,
            "audit_tag": "AML_CHECK_PASS"
        }

    def _tool_settle_transfer(self, source_id: str, dest_id: str, amount: float) -> Dict[str, Any]:
        return {
            "tx_id": f"tx_gt_{int(time.time() * 1000)}",
            "source": source_id,
            "destination": dest_id,
            "settled_amount": amount,
            "status": "COMPLETED"
        }

    async def run_operation(self, operation_goal: str, target_account: str = "ACC-9921", amount: float = 2500.0) -> Dict[str, Any]:
        """
        Executes an autonomous financial transaction workflow through the fault proxy.
        """
        self.execution_trace.clear()
        t0 = time.perf_counter()

        self._log_step(
            action="INITIALIZE_GOAL",
            payload={"goal": operation_goal, "account": target_account, "amount": amount}
        )

        # Step 1: Query Account State
        account_data = None
        for attempt in range(1, self.config.retry_limit + 1):
            try:
                self._log_step(
                    action=f"INVOKE_TOOL:query_account (attempt {attempt})",
                    payload={"account_id": target_account}
                )
                res = await self.proxy.execute_intercepted(
                    "query_account",
                    self._tool_query_account,
                    target_account
                )

                if res.get("status") == "corrupted_payload":
                    # Handle JSON corruption
                    self._log_step(
                        action="VALIDATE_SCHEMA_FAILED",
                        status="CORRUPT_DETECTED",
                        fault_injected=res.get("fault_injected"),
                        payload={"raw": res.get("raw_text")}
                    )
                    raise ValueError("Upstream payload is corrupted or unparsable JSON")

                if res.get("status") == "schema_drift":
                    # Handle drift
                    self._log_step(
                        action="SCHEMA_DRIFT_DETECTED",
                        status="DEGRADED",
                        fault_injected=res.get("fault_injected")
                    )
                    # Fallback to cached default
                    account_data = {"account_id": target_account, "balance": 10000.0, "status": "CACHED"}
                    break

                account_data = res.get("data")
                fault_id = res.get("fault_injected")
                self._log_step(
                    action="ACCOUNT_QUERY_SUCCESS",
                    status="SUCCESS",
                    payload={"account": account_data},
                    fault_injected=fault_id
                )
                self._consecutive_failures = 0
                break

            except Exception as exc:
                self._consecutive_failures += 1
                self._log_step(
                    action="RETRY_BACKOFF",
                    status="RECOVERING",
                    payload={"error": str(exc), "attempt": attempt}
                )
                if attempt == self.config.retry_limit:
                    if self.config.fallback_strategy:
                        self._log_step(
                            action="ENGAGE_CIRCUIT_BREAKER_FALLBACK",
                            status="FALLBACK_ACTIVE",
                            payload={"strategy": self.config.fallback_strategy}
                        )
                        account_data = {"account_id": target_account, "balance": 10000.0, "status": "DEGRADED_CACHE"}
                    else:
                        return {
                            "success": False,
                            "error": f"Operation aborted: Tool failure: {str(exc)}",
                            "steps": [s.model_dump() for s in self.execution_trace]
                        }
                await asyncio.sleep(0.1 * attempt)

        # Step 2: Compliance Verification & Prompt Guard
        self._log_step(
            action="INVOKE_TOOL:verify_compliance",
            payload={"account_id": target_account, "amount": amount}
        )

        try:
            comp_res = await self.proxy.execute_intercepted(
                "verify_compliance",
                self._tool_verify_compliance,
                target_account,
                amount
            )

            # Check for Prompt Injection Attacks in Tool Data
            if comp_res.get("status") == "compromised_tool_output":
                raw_injected = comp_res.get("data", {}).get("result", "")
                self._log_step(
                    action="ADVERSARIAL_INSPECTION",
                    actor="REFEREE",
                    status="PROMPT_INJECTION_DETECTED",
                    fault_injected=comp_res.get("fault_injected"),
                    payload={"suspicious_payload": raw_injected}
                )
                if self.config.guardrails_enabled:
                    self._log_step(
                        action="QUARANTINE_ADVERSARIAL_PAYLOAD",
                        status="PROTECTED",
                        payload={"reason": "Disallowed instruction injection intercepted by security guardrail"}
                    )
                    return {
                        "success": False,
                        "quarantined": True,
                        "reason": "Hostile prompt injection quarantined.",
                        "steps": [s.model_dump() for s in self.execution_trace]
                    }

        except Exception as exc:
            self._log_step(
                action="COMPLIANCE_BYPASS_PREVENTED",
                status="SAFETY_LOCKED",
                payload={"error": str(exc)}
            )
            return {
                "success": False,
                "error": f"Compliance check unreachable: {str(exc)}",
                "steps": [s.model_dump() for s in self.execution_trace]
            }

        # Step 3: Settlement
        self._log_step(
            action="INVOKE_TOOL:settle_transfer",
            payload={"source": target_account, "dest": "ACC-RECEIVER-441", "amount": amount}
        )

        try:
            settle_res = await self.proxy.execute_intercepted(
                "settle_transfer",
                self._tool_settle_transfer,
                target_account,
                "ACC-RECEIVER-441",
                amount
            )
            tx_data = settle_res.get("data")
            total_duration_ms = (time.perf_counter() - t0) * 1000.0

            self._log_step(
                action="GOAL_ACCOMPLISHED",
                status="COMPLETE",
                latency_ms=total_duration_ms,
                payload={"transaction": tx_data}
            )

            return {
                "success": True,
                "transaction": tx_data,
                "duration_ms": total_duration_ms,
                "steps": [s.model_dump() for s in self.execution_trace]
            }

        except Exception as exc:
            self._log_step(
                action="SETTLEMENT_FAILED",
                status="ABORTED",
                payload={"error": str(exc)}
            )
            return {
                "success": False,
                "error": f"Settlement aborted: {str(exc)}",
                "steps": [s.model_dump() for s in self.execution_trace]
            }

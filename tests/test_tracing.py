import asyncio
from unittest.mock import MagicMock, patch
import pytest

from app.models import RunRequest, VerdictStatus
from app.orchestrator import Orchestrator
import app.tracing as tracing


class MockSpan:
    def __init__(self, name: str, kind: str = "CHAIN", **attrs):
        self.name = name
        self.kind = kind
        self.attributes = dict(attrs)
        self.exceptions = []
        self.status = None

    def set_attribute(self, key: str, value: any):
        self.attributes[key] = value

    def set_attributes(self, attrs: dict):
        self.attributes.update(attrs)

    def set_status(self, status: any):
        self.status = status

    def record_exception(self, exc: Exception):
        self.exceptions.append(exc)

    def add_event(self, name: str, attributes: dict = None):
        pass

    def get_span_context(self):
        return None


@pytest.mark.asyncio
async def test_tracing_enabled(monkeypatch, tmp_path):
    """Verify full workflow and stage tracing when neatlogs tracing is enabled."""
    spans_created = []

    def mock_trace(name: str, kind: str = "CHAIN", **kwargs):
        span = MockSpan(name=name, kind=kind, **kwargs)
        spans_created.append(span)

        class TraceContext:
            def __enter__(self):
                return span

            def __exit__(self, exc_type, exc_val, exc_tb):
                return False

        return TraceContext()

    flush_mock = MagicMock(return_value=True)

    monkeypatch.setattr(tracing.neatlogs, "trace", mock_trace)
    monkeypatch.setattr(tracing.neatlogs, "flush", flush_mock)
    monkeypatch.setattr(tracing, "_tracing_available", True)

    runs_dir = str(tmp_path / "runs")
    evidence_dir = str(tmp_path / "evidence")
    orchestrator = Orchestrator(runs_dir=runs_dir, evidence_dir=evidence_dir)

    req = RunRequest(
        subject_name="Test Resilient Agent",
        chaos_intensity=0.4,
        enable_auto_harden=True,
    )
    run = await orchestrator.execute_gauntlet(req)

    assert run.completed is True
    assert run.run_id is not None

    # Check root trace
    span_names = [s.name for s in spans_created]
    assert "gauntlet_execution" in span_names
    root_span = next(s for s in spans_created if s.name == "gauntlet_execution")
    assert root_span.kind == "WORKFLOW"
    assert root_span.attributes.get("run_id") == run.run_id
    assert root_span.attributes.get("completed") is True
    assert "final_score" in root_span.attributes
    assert "verdict" in root_span.attributes

    # Check that all required stages were traced
    assert "fault_suite_generation" in span_names
    assert "subject_execution" in span_names
    assert "referee_evaluation" in span_names
    assert "resilience_scoring" in span_names
    assert "hardening_synthesis" in span_names
    assert "evidence_persistence" in span_names

    # Check stage-specific attributes
    fault_stage = next(s for s in spans_created if s.name == "fault_suite_generation")
    assert fault_stage.kind == "CHAIN"
    assert "fault_count" in fault_stage.attributes

    subject_stage = next(s for s in spans_created if s.name == "subject_execution")
    assert subject_stage.kind == "AGENT"
    assert "steps_count" in subject_stage.attributes

    referee_stage = next(s for s in spans_created if s.name == "referee_evaluation")
    assert referee_stage.kind == "EVALUATOR"
    assert "verdict.status" in referee_stage.attributes

    score_stage = next(s for s in spans_created if s.name == "resilience_scoring")
    assert score_stage.kind == "EVALUATOR"
    assert "score.overall" in score_stage.attributes

    persist_stage = next(s for s in spans_created if s.name == "evidence_persistence")
    assert persist_stage.kind == "TOOL"
    assert persist_stage.attributes.get("persistence.completed") is True

    # Check flush was called
    assert flush_mock.called


@pytest.mark.asyncio
async def test_tracing_disabled_workflow(monkeypatch, tmp_path):
    """Verify that absent API key / disabled tracing does not crash the workflow."""
    monkeypatch.setattr(tracing, "_tracing_available", False)
    monkeypatch.delenv("NEATLOGS_API_KEY", raising=False)

    runs_dir = str(tmp_path / "runs")
    evidence_dir = str(tmp_path / "evidence")
    orchestrator = Orchestrator(runs_dir=runs_dir, evidence_dir=evidence_dir)

    req = RunRequest(
        subject_name="Uninstrumented Agent",
        chaos_intensity=0.2,
        enable_auto_harden=False,
    )
    run = await orchestrator.execute_gauntlet(req)

    assert run.completed is True
    assert run.run_id is not None
    assert run.score is not None

    status = tracing.get_tracing_status()
    assert status["available"] is False


@pytest.mark.asyncio
async def test_tracing_failed_workflow(monkeypatch, tmp_path):
    """Verify trace flush and exception recording even when a stage fails."""
    spans_created = []

    def mock_trace(name: str, kind: str = "CHAIN", **kwargs):
        span = MockSpan(name=name, kind=kind, **kwargs)
        spans_created.append(span)

        class TraceContext:
            def __enter__(self):
                return span

            def __exit__(self, exc_type, exc_val, exc_tb):
                return False

        return TraceContext()

    flush_mock = MagicMock(return_value=True)

    monkeypatch.setattr(tracing.neatlogs, "trace", mock_trace)
    monkeypatch.setattr(tracing.neatlogs, "flush", flush_mock)
    monkeypatch.setattr(tracing, "_tracing_available", True)

    runs_dir = str(tmp_path / "runs")
    evidence_dir = str(tmp_path / "evidence")
    orchestrator = Orchestrator(runs_dir=runs_dir, evidence_dir=evidence_dir)

    # Force referee to fail
    def failing_evaluate(*args, **kwargs):
        raise RuntimeError("Referee crashed due to unexpected simulation state")

    monkeypatch.setattr(orchestrator.referee, "evaluate_run", failing_evaluate)

    req = RunRequest(subject_name="Crashing Run")
    with pytest.raises(RuntimeError) as exc_info:
        await orchestrator.execute_gauntlet(req)

    assert "Referee crashed" in str(exc_info.value)

    # Verify flush was still called in finally block
    assert flush_mock.called

    # Verify exception was recorded on referee and root spans
    referee_span = next((s for s in spans_created if s.name == "referee_evaluation"), None)
    assert referee_span is not None
    assert len(referee_span.exceptions) > 0

    root_span = next((s for s in spans_created if s.name == "gauntlet_execution"), None)
    assert root_span is not None
    assert len(root_span.exceptions) > 0


def test_tracing_init_safe_without_key(monkeypatch):
    """Ensure init_tracing safely reports unavailable without crashing when key is absent."""
    monkeypatch.delenv("NEATLOGS_API_KEY", raising=False)
    available = tracing.init_tracing(api_key="", force_reinit=True)
    assert available is False

    status = tracing.get_tracing_status()
    assert status["available"] is False
    assert status["workflow"] == "GAUNTLET"


def test_tracing_init_with_key_mocked(monkeypatch):
    """Ensure init_tracing initializes neatlogs with expected parameters when key is provided."""
    mock_init = MagicMock()
    monkeypatch.setattr(tracing.neatlogs, "init", mock_init)

    available = tracing.init_tracing(api_key="neat_test_key_abc123", force_reinit=True)
    assert available is True
    assert mock_init.called
    mock_init.assert_called_once_with(
        api_key="neat_test_key_abc123",
        workflow_name="GAUNTLET",
        disable_export=False,
    )

    status = tracing.get_tracing_status()
    assert status["available"] is True
    assert status["initialized"] is True


def test_tracing_init_disabled_export(monkeypatch):
    """Ensure init_tracing skips starting SDK when export is explicitly disabled."""
    mock_init = MagicMock()
    monkeypatch.setattr(tracing.neatlogs, "init", mock_init)

    available = tracing.init_tracing(api_key="valid_key", disable_export=True, force_reinit=True)
    assert available is False
    assert not mock_init.called
    assert tracing.is_tracing_available() is False


def test_tracing_shutdown_mocked(monkeypatch):
    """Verify shutdown_tracing safely shuts down the neatlogs SDK and clears internal state."""
    mock_shutdown = MagicMock(return_value=True)
    monkeypatch.setattr(tracing.neatlogs, "shutdown", mock_shutdown)
    monkeypatch.setattr(tracing, "_tracing_initialized", True)
    monkeypatch.setattr(tracing, "_tracing_available", True)
    monkeypatch.setattr(tracing, "_sdk_initialized", True)

    result = tracing.shutdown_tracing(timeout_millis=2000)
    assert result is True
    assert mock_shutdown.called
    mock_shutdown.assert_called_once_with(timeout_millis=2000)
    assert tracing._tracing_available is False
    assert tracing._tracing_initialized is False
    assert tracing._sdk_initialized is False


def test_tracing_noop_span():
    """Verify that NoOpSpan supports all span operations safely."""
    noop = tracing.NoOpSpan()
    noop.set_attribute("attr", "val")
    noop.set_attributes({"a": 1, "b": 2})
    noop.set_status(None)
    noop.record_exception(ValueError("error"))
    noop.add_event("event_name", {"k": "v"})
    assert noop.get_span_context() is None


@pytest.mark.asyncio
async def test_fastapi_lifespan_tracing_lifecycle(monkeypatch):
    """Verify FastAPI lifespan invokes init_tracing on startup and shutdown_tracing on shutdown."""
    init_called = []
    shutdown_called = []

    def mock_init(*args, **kwargs):
        init_called.append(True)
        return True

    def mock_shutdown(*args, **kwargs):
        shutdown_called.append(True)
        return True

    monkeypatch.setattr("app.main.init_tracing", mock_init)
    monkeypatch.setattr("app.main.shutdown_tracing", mock_shutdown)

    from app.main import app, lifespan

    async with lifespan(app):
        assert len(init_called) == 1
        assert len(shutdown_called) == 0

    assert len(shutdown_called) == 1

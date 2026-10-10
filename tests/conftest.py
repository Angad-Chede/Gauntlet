import pytest
import app.tracing as tracing


@pytest.fixture(autouse=True)
def clean_tracing_state(monkeypatch):
    """
    Ensure tests do not accidentally read real environment secrets or leave
    background Neatlogs SDK exporter threads running across pytest execution.
    """
    monkeypatch.delenv("NEATLOGS_API_KEY", raising=False)
    monkeypatch.setattr(tracing, "_tracing_initialized", False)
    monkeypatch.setattr(tracing, "_tracing_available", False)
    monkeypatch.setattr(tracing, "_sdk_initialized", False)
    yield
    tracing.shutdown_tracing(timeout_millis=100)

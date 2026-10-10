import contextlib
import logging
import os
import threading
from typing import Any, Dict, Generator, Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import neatlogs
from opentelemetry.trace import Status, StatusCode

logger = logging.getLogger("GauntletTracing")

_tracing_initialized = False
_tracing_available = False
_sdk_initialized = False
_init_lock = threading.Lock()


class NoOpSpan:
    """Safe fallback span when tracing is unavailable or disabled."""

    def set_attribute(self, key: str, value: Any) -> None:
        pass

    def set_attributes(self, attributes: Dict[str, Any]) -> None:
        pass

    def set_status(self, status: Any) -> None:
        pass

    def record_exception(self, exception: Exception) -> None:
        pass

    def add_event(self, name: str, attributes: Optional[Dict[str, Any]] = None) -> None:
        pass

    def get_span_context(self) -> Any:
        return None


def init_tracing(
    api_key: Optional[str] = None,
    disable_export: Optional[bool] = None,
    force_reinit: bool = False,
) -> bool:
    """
    Safely initialize the Neatlogs SDK using NEATLOGS_API_KEY from environment or parameter.
    Never prints or hardcodes secrets. If API key is absent, tracing is marked unavailable
    and export is disabled without starting background SDK instances, ensuring workflows never crash.
    """
    global _tracing_initialized, _tracing_available, _sdk_initialized

    with _init_lock:
        if _tracing_initialized and not force_reinit:
            return _tracing_available

        if _sdk_initialized and force_reinit:
            try:
                neatlogs.shutdown(timeout_millis=1000)
            except Exception as exc:
                logger.debug(f"Error shutting down previous Neatlogs instance: {exc}")
            _sdk_initialized = False

        resolved_key = (api_key if api_key is not None else (os.getenv("NEATLOGS_API_KEY") or "")).strip()
        has_key = bool(resolved_key)
        should_disable_export = disable_export if disable_export is not None else (not has_key)

        if not has_key or should_disable_export:
            _tracing_initialized = True
            _tracing_available = False
            _sdk_initialized = False
            if not has_key:
                logger.warning(
                    "NEATLOGS_API_KEY is not configured; Neatlogs tracing is unavailable."
                )
            else:
                logger.info(
                    "Neatlogs export is disabled; Neatlogs tracing is unavailable."
                )
            return False

        try:
            neatlogs.init(
                api_key=resolved_key,
                workflow_name="GAUNTLET",
                disable_export=False,
            )
            _tracing_initialized = True
            _tracing_available = True
            _sdk_initialized = True
            logger.info("Neatlogs tracing initialized for workflow 'GAUNTLET'.")
        except Exception as exc:
            logger.error(f"Failed to initialize Neatlogs SDK: {exc}", exc_info=True)
            _tracing_initialized = True
            _tracing_available = False
            _sdk_initialized = False

        return _tracing_available


def shutdown_tracing(timeout_millis: int = 5000) -> bool:
    """
    Gracefully shut down the Neatlogs SDK once during application shutdown.
    Safe to call repeatedly; no-op if tracing was not initialized.
    """
    global _tracing_initialized, _tracing_available, _sdk_initialized

    with _init_lock:
        if not _tracing_initialized and not _sdk_initialized:
            return False

        success = False
        try:
            if _sdk_initialized:
                success = bool(neatlogs.shutdown(timeout_millis=timeout_millis))
            else:
                success = True
        except Exception as exc:
            logger.warning(f"Error during Neatlogs shutdown: {exc}")
            success = False
        finally:
            _tracing_initialized = False
            _tracing_available = False
            _sdk_initialized = False

        return success


def is_tracing_available() -> bool:
    """Check if Neatlogs tracing is initialized and actively exporting."""
    return _tracing_available


def get_tracing_status() -> Dict[str, Any]:
    """Return tracing configuration status without exposing secrets."""
    return {
        "available": _tracing_available,
        "initialized": _tracing_initialized,
        "workflow": "GAUNTLET",
        "sdk_version": getattr(neatlogs, "__version__", "unknown"),
    }


def flush_traces(timeout_millis: int = 5000) -> bool:
    """
    Flush queued spans and completion markers without shutting down the SDK provider.
    Safe to call repeatedly across individual runs.
    """
    if not _tracing_available:
        return False
    try:
        return bool(neatlogs.flush(timeout_millis=timeout_millis))
    except Exception as exc:
        logger.warning(f"Error during Neatlogs flush: {exc}")
        return False


@contextlib.contextmanager
def trace_span(
    name: str,
    kind: str = "CHAIN",
    **attributes: Any,
) -> Generator[Any, None, None]:
    """
    Context manager for a workflow or stage trace span.
    Uses neatlogs.trace under the hood when tracing is available.
    Falls back to a NoOpSpan if tracing is disabled or neatlogs context fails.
    """
    if not _tracing_available:
        yield NoOpSpan()
        return

    span_obj = None
    try:
        with neatlogs.trace(name, kind=kind, **attributes) as span:
            span_obj = span
            try:
                yield span
            except Exception as exc:
                try:
                    span.record_exception(exc)
                    span.set_status(Status(StatusCode.ERROR, str(exc)))
                except Exception:
                    pass
                raise
    except Exception as exc:
        # If neatlogs.trace itself raised before/outside the block, yield fallback
        if span_obj is None:
            logger.debug(f"Neatlogs trace unavailable for span '{name}': {exc}")
            yield NoOpSpan()
        else:
            raise

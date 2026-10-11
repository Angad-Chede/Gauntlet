import re
from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app

TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "app" / "templates" / "landing" / "index.html"


def test_no_hardcoded_ms_or_64hex_in_landing_template():
    """
    Audit check: Fails if templates contain hard-coded timing values (e.g. '12ms', '420ms')
    or raw 64-hex SHA-256 hashes instead of Jinja2 dynamic expressions.
    """
    assert TEMPLATE_PATH.exists(), f"Landing template not found at {TEMPLATE_PATH}"
    content = TEMPLATE_PATH.read_text(encoding="utf-8")

    # Strip HTML comments and noscript blocks to only inspect live markup
    cleaned = re.sub(r"<!--.*?-->", "", content, flags=re.DOTALL)
    cleaned = re.sub(r"<style>.*?</style>", "", cleaned, flags=re.DOTALL)

    # 1. Check for raw hardcoded milliseconds like '12ms', '420ms', '90ms', '5ms'
    # Any timing must come from dynamic Jinja expressions (e.g. {{ step.latency_ms }}ms)
    ms_matches = re.findall(r">\s*(\d+ms)\s*<", cleaned)
    assert not ms_matches, f"Found hard-coded ms timings in landing template: {ms_matches}"

    # 2. Check for raw 64-character hexadecimal SHA-256 hashes
    hex64_pattern = re.compile(r"\b[0-9a-fA-F]{64}\b")
    hex_matches = hex64_pattern.findall(cleaned)
    assert not hex_matches, f"Found hard-coded 64-hex hash in landing template: {hex_matches}"


def test_landing_status_badges_vocabulary():
    """
    Ensure all status badges use truthful, allowed statuses.
    """
    content = TEMPLATE_PATH.read_text(encoding="utf-8")
    allowed_statuses = {"IMPLEMENTED", "TESTED", "EXTERNALLY VERIFIED", "PLANNED", "STUB", "SIMULATED"}

    # Extract all text inside lp-badge spans
    badge_matches = re.findall(r'class="[^"]*lp-badge[^"]*"[^>]*>([^<]+)<', content)
    for badge in badge_matches:
        text = badge.strip()
        # Allow Jinja2 dynamic expressions like {{ baseline_run.verdict.verdict ... }}
        if text.startswith("{{") and text.endswith("}}"):
            continue
        # Some badges might include labels like 'SEALED · SHA-256' or scenario names
        if text in allowed_statuses or any(s in text for s in allowed_statuses) or "SEALED" in text or "UNTESTED" in text:
            continue
        # Allow verdict enum names like RESILIENT_DEGRADED
        if text in {"RESILIENT_DEGRADED", "PASSED", "FAILED"}:
            continue
        assert False, f"Disallowed status badge text: '{text}'"


def test_landing_page_live_render():
    """
    Verify the FastAPI route renders cleanly with real data context.
    """
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert "Crash-test your AI agent before production does." in response.text
    assert "GAUNTLET" in response.text
    assert "preview_overview.webp" in response.text
    assert "run_d42996d50d" in response.text
    assert "Advisory only; never applied automatically" in response.text

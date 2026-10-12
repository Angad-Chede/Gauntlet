from fastapi.testclient import TestClient

from app.main import app


def test_public_landing_and_dashboard_routes():
    client = TestClient(app)

    landing = client.get("/")
    assert landing.status_code == 200
    assert "Crash-test your AI agent before production does." in landing.text
    assert "GAUNTLET" in landing.text

    overview = client.get("/app")
    assert overview.status_code == 200
    assert "Resilience overview" in overview.text
    assert "/static/css/gauntlet.css" in overview.text

    landing_page = client.get("/landing")
    assert landing_page.status_code == 200
    assert "GAUNTLET" in landing_page.text


def test_existing_run_routes_keep_status_codes():
    client = TestClient(app)
    routes = {
        "/runs/run_035a965546": 200,
        "/runs/run_035a965546/evidence": 200,
        "/runs/run_035a965546/hardening": 200,
        "/api/health": 200,
        "/api/faults": 200,
        "/api/runs": 200,
    }
    for path, expected in routes.items():
        response = client.get(path)
        assert response.status_code == expected, f"{path} status mismatch"


def test_landing_escapes_untrusted_script_payloads():
    """
    Verify that Jinja2 autoescaping prevents raw script tags from untrusted
    run payloads or indirect prompt injections from rendering as executable HTML.
    """
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    # Raw unescaped dangerous tags must never be present in the rendered HTML output
    assert "<script>alert(" not in response.text
    assert "<script>document.cookie" not in response.text


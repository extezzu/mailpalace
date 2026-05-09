"""Smoke-level integration test: seed demo data, hit /api/inbox."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_inbox_returns_seeded_emails() -> None:
    from mailpalace.db.seed import seed_demo_data
    from mailpalace.web.app import create_app

    seed_demo_data()
    client = TestClient(create_app())
    resp = client.get("/api/inbox")
    assert resp.status_code == 200
    body = resp.json()
    assert "emails" in body
    assert len(body["emails"]) >= 5
    first = body["emails"][0]
    assert "ai" in first


def test_health_ok() -> None:
    from mailpalace.web.app import create_app

    client = TestClient(create_app())
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_inbox_classification_filter() -> None:
    from mailpalace.db.seed import seed_demo_data
    from mailpalace.web.app import create_app

    seed_demo_data()
    client = TestClient(create_app())
    resp = client.get("/api/inbox?classification=urgent")
    assert resp.status_code == 200
    body = resp.json()
    for email in body["emails"]:
        assert email["ai"]["classification"] == "urgent"

"""End-to-end smoke test.

Boots the FastAPI app in-process, seeds demo data, and verifies:
  1. /api/health returns 200
  2. /api/inbox returns at least 5 emails
  3. /api/email/{id} returns thread + AI metadata
  4. Settings round-trips active provider switch

Exits non-zero on any failure. Safe to run on a fresh clone — no Ollama or
Gmail required.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Add backend/src to import path so this script runs from the repo root.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))


def main() -> int:
    import gc
    import os
    import tempfile

    tmp = tempfile.mkdtemp(prefix="mailpalace-smoke-")
    os.environ["MAILPALACE_DATA_DIR"] = tmp

    from fastapi.testclient import TestClient

    from mailpalace.db import engine as db_engine
    from mailpalace.db.seed import seed_demo_data
    from mailpalace.web.app import create_app

    try:
        seed_demo_data()
        client = TestClient(create_app())

        ok = True

        # 1. health
        resp = client.get("/api/health")
        assert resp.status_code == 200, f"/api/health failed: {resp.status_code}"
        print("  [PASS] /api/health -> 200")

        # 2. inbox
        resp = client.get("/api/inbox")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["emails"]) >= 5, f"expected >=5 emails, got {len(body['emails'])}"
        print(f"  [PASS] /api/inbox -> {len(body['emails'])} emails")

        # 3. email detail
        first_id = body["emails"][0]["id"]
        resp = client.get(f"/api/email/{first_id}")
        assert resp.status_code == 200, f"detail failed: {resp.status_code}"
        detail = resp.json()
        assert detail["id"] == first_id
        print(f"  [PASS] /api/email/{first_id} -> ai={detail['ai']['classification']}")

        # 4. settings round-trip
        resp = client.get("/api/settings")
        assert resp.status_code == 200
        before = resp.json()["active_provider"]
        target = "anthropic" if before == "ollama" else "ollama"
        resp = client.patch("/api/settings", json={"active_provider": target})
        assert resp.status_code == 200, f"PATCH /api/settings failed: {resp.status_code}"
        assert resp.json()["active_provider"] == target
        print(f"  [PASS] settings active_provider {before} -> {target}")

        # 5. classification filter
        resp = client.get("/api/inbox?classification=urgent")
        assert resp.status_code == 200
        for email in resp.json()["emails"]:
            assert email["ai"]["classification"] == "urgent"
        print("  [PASS] /api/inbox?classification=urgent filters correctly")

        print("\n  All smoke checks passed.")
        return 0
    finally:
        if db_engine._engine is not None:
            db_engine._engine.dispose()
        gc.collect()
        try:
            import shutil

            shutil.rmtree(tmp, ignore_errors=True)
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())

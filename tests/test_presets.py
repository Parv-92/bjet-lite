from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def test_preset_crud_and_independent_application(
    client: TestClient, auth_headers: dict, db_session: Session
):
    # 1. Get categories
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    categories = cat_resp.json()
    food_cat = next(c for c in categories if c["name"] == "Food & Dining")
    transport_cat = next(c for c in categories if c["name"] == "Transportation")

    # 2. Create Preset "College Month"
    create_resp = client.post(
        "/api/v1/budget-presets",
        headers=auth_headers,
        json={
            "name": "College Month",
            "items": [
                {"category_id": food_cat["id"], "amount": 5000.0},
                {"category_id": transport_cat["id"], "amount": 2000.0},
            ],
        },
    )
    assert create_resp.status_code == 201
    preset = create_resp.json()
    assert preset["name"] == "College Month"
    assert len(preset["items"]) == 2
    preset_id = preset["id"]

    # 3. List presets
    list_resp = client.get("/api/v1/budget-presets", headers=auth_headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    # 4. Get preset details
    get_resp = client.get(f"/api/v1/budget-presets/{preset_id}", headers=auth_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == preset_id

    # 5. Apply preset to September 2026 (month=9, year=2026)
    apply_resp = client.post(
        f"/api/v1/budget-presets/{preset_id}/apply",
        headers=auth_headers,
        json={"month": 9, "year": 2026},
    )
    assert apply_resp.status_code == 200
    applied_summaries = apply_resp.json()
    assert len(applied_summaries) >= 2

    # Check that monthly budget summary reflects the copied amounts
    sum_resp = client.get("/api/v1/budgets/summary?month=9&year=2026", headers=auth_headers)
    summaries = sum_resp.json()
    food_summary = next(s for s in summaries if s["category_id"] == food_cat["id"])
    transport_summary = next(s for s in summaries if s["category_id"] == transport_cat["id"])
    assert float(food_summary["amount_limit"]) == 5000.0
    assert float(transport_summary["amount_limit"]) == 2000.0

    # 6. Independence Test: Update the preset (change Food to 6000)
    upd_resp = client.put(
        f"/api/v1/budget-presets/{preset_id}",
        headers=auth_headers,
        json={
            "name": "College Month Updated",
            "items": [
                {"category_id": food_cat["id"], "amount": 6000.0},
                {"category_id": transport_cat["id"], "amount": 2000.0},
            ],
        },
    )
    assert upd_resp.status_code == 200
    assert upd_resp.json()["name"] == "College Month Updated"

    # Verify September 2026 monthly budget is UNCHANGED at 5000!
    sum_resp2 = client.get("/api/v1/budgets/summary?month=9&year=2026", headers=auth_headers)
    food_summary2 = next(s for s in sum_resp2.json() if s["category_id"] == food_cat["id"])
    assert float(food_summary2["amount_limit"]) == 5000.0

    # 7. Independence Test: Delete the preset
    del_resp = client.delete(f"/api/v1/budget-presets/{preset_id}", headers=auth_headers)
    assert del_resp.status_code == 204

    # Verify September 2026 monthly budget remains INTACT at 5000!
    sum_resp3 = client.get("/api/v1/budgets/summary?month=9&year=2026", headers=auth_headers)
    food_summary3 = next(s for s in sum_resp3.json() if s["category_id"] == food_cat["id"])
    assert float(food_summary3["amount_limit"]) == 5000.0


def test_preset_validations_and_isolation(
    client: TestClient, auth_headers: dict, db_session: Session
):
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]

    # 1. Reject negative/zero amount
    bad_amount = client.post(
        "/api/v1/budget-presets",
        headers=auth_headers,
        json={"name": "Bad", "items": [{"category_id": cat_id, "amount": -100.0}]},
    )
    assert bad_amount.status_code == 422 or bad_amount.status_code == 400

    # 2. Reject duplicate categories within same preset
    dup_cat = client.post(
        "/api/v1/budget-presets",
        headers=auth_headers,
        json={
            "name": "Dup",
            "items": [
                {"category_id": cat_id, "amount": 1000.0},
                {"category_id": cat_id, "amount": 2000.0},
            ],
        },
    )
    assert dup_cat.status_code == 400
    assert "duplicate category" in dup_cat.json()["detail"].lower()

    # 3. Create valid preset for User A
    p_a = client.post(
        "/api/v1/budget-presets",
        headers=auth_headers,
        json={"name": "User A Preset", "items": [{"category_id": cat_id, "amount": 1000.0}]},
    ).json()["id"]

    # 4. User B cannot see or apply User A's preset
    client.post(
        "/api/v1/auth/register",
        json={"email": "user_b_presets@example.com", "password": "Password123!", "full_name": "User B"},
    )
    login_b = client.post(
        "/api/v1/auth/login",
        json={"email": "user_b_presets@example.com", "password": "Password123!"},
    )
    headers_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}

    list_b = client.get("/api/v1/budget-presets", headers=headers_b)
    assert len(list_b.json()) == 0

    apply_b = client.post(
        f"/api/v1/budget-presets/{p_a}/apply",
        headers=headers_b,
        json={"month": 9, "year": 2026},
    )
    assert apply_b.status_code == 404

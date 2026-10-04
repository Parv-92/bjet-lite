from datetime import datetime, timezone


def test_set_and_get_budget(client, auth_headers):
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    dining_cat = next(c for c in cat_resp.json() if c["name"] == "Food & Dining")

    now = datetime.now(timezone.utc)
    month = now.month
    year = now.year

    # Set budget of 5000 (Initial creation returns 201 Created)
    payload = {
        "category_id": dining_cat["id"],
        "month": month,
        "year": year,
        "amount_limit": 5000.00,
    }
    set_resp = client.post("/api/v1/budgets", json=payload, headers=auth_headers)
    assert set_resp.status_code == 201
    assert float(set_resp.json()["amount_limit"]) == 5000.00

    # Updating the same budget via POST upsert returns 200 OK
    payload["amount_limit"] = 6000.00
    update_resp = client.post("/api/v1/budgets", json=payload, headers=auth_headers)
    assert update_resp.status_code == 200
    assert float(update_resp.json()["amount_limit"]) == 6000.00

    # Add a transaction for this category
    tx_payload = {
        "amount": 1200.00,
        "category_id": dining_cat["id"],
        "merchant_raw_name": "Restaurant",
        "timestamp": now.isoformat(),
    }
    client.post("/api/v1/transactions", json=tx_payload, headers=auth_headers)

    # Get budget summary
    summary_resp = client.get(
        f"/api/v1/budgets/summary?month={month}&year={year}",
        headers=auth_headers,
    )
    assert summary_resp.status_code == 200
    summaries = summary_resp.json()
    assert len(summaries) == 1
    item = summaries[0]
    assert float(item["amount_limit"]) == 6000.00
    assert float(item["spent_amount"]) == 1200.00
    assert float(item["remaining_amount"]) == 4800.00
    assert item["percentage_used"] == 20.0
    assert item["is_over_budget"] is False


def test_over_budget_detection(client, auth_headers):
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    travel_cat = next(c for c in cat_resp.json() if c["name"] == "Transportation")

    now = datetime.now(timezone.utc)
    month = now.month
    year = now.year

    # Set small budget of 500
    payload = {
        "category_id": travel_cat["id"],
        "month": month,
        "year": year,
        "amount_limit": 500.00,
    }
    client.post("/api/v1/budgets", json=payload, headers=auth_headers)

    # Log an expense of 800
    client.post(
        "/api/v1/transactions",
        json={
            "amount": 800.00,
            "category_id": travel_cat["id"],
            "merchant_raw_name": "Uber Ride",
            "timestamp": now.isoformat(),
        },
        headers=auth_headers,
    )

    # Check status
    cat_status_resp = client.get(
        f"/api/v1/budgets/{travel_cat['id']}?month={month}&year={year}",
        headers=auth_headers,
    )
    assert cat_status_resp.status_code == 200
    data = cat_status_resp.json()
    assert float(data["spent_amount"]) == 800.00
    assert float(data["remaining_amount"]) == -300.00
    assert data["percentage_used"] == 160.0
    assert data["is_over_budget"] is True


def test_budget_invalid_category_returns_404(client, auth_headers):
    now = datetime.now(timezone.utc)
    resp = client.post(
        "/api/v1/budgets",
        json={
            "category_id": 99999,
            "month": now.month,
            "year": now.year,
            "amount_limit": 1000.00,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 404


def test_pending_receipt_draft_not_counted_in_budget_until_confirmed(client, auth_headers):
    """Verify that a PENDING_CONFIRMATION draft is NEVER counted in the budget until explicitly confirmed."""
    import io
    from PIL import Image
    from src.services.ocr.mock_provider import MockOCRProvider
    from src.services.receipt_processing_service import receipt_processing_service

    # 1. Setup mock OCR
    mock_ocr = MockOCRProvider(
        default_text="PhonePe\nPaid to Dominos\n₹600.00\nUTR: 123451234512"
    )
    receipt_processing_service.set_ocr_provider(mock_ocr)

    # 2. Get Food & Dining category ID
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    dining_cat = next(c for c in cat_resp.json() if c["name"] == "Food & Dining")

    now = datetime.now(timezone.utc)
    month = now.month
    year = now.year

    # 3. Set monthly budget of 2000.00
    client.post(
        "/api/v1/budgets",
        json={
            "category_id": dining_cat["id"],
            "month": month,
            "year": year,
            "amount_limit": 2000.00,
        },
        headers=auth_headers,
    )

    # Verify initial budget has 0 spent
    init_budget = client.get(
        f"/api/v1/budgets/{dining_cat['id']}?month={month}&year={year}",
        headers=auth_headers,
    ).json()
    assert float(init_budget["spent_amount"]) == 0.00
    assert float(init_budget["remaining_amount"]) == 2000.00

    # 4. Scan receipt for 600.00 -> created in PENDING_CONFIRMATION
    img = Image.new("RGB", (200, 400), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")

    scan_resp = client.post(
        "/api/v1/transactions/scan-receipt",
        files={"file": ("dominos.png", buf.getvalue(), "image/png")},
        headers=auth_headers,
    )
    assert scan_resp.status_code == 201
    draft_tx = scan_resp.json()["transaction"]
    assert draft_tx["status"] == "PENDING_CONFIRMATION"
    assert float(draft_tx["amount"]) == 600.00
    draft_id = draft_tx["id"]

    # 5. Check budget: Must STILL be 0.00 spent! Pending draft is NOT counted!
    pending_budget = client.get(
        f"/api/v1/budgets/{dining_cat['id']}?month={month}&year={year}",
        headers=auth_headers,
    ).json()
    assert float(pending_budget["spent_amount"]) == 0.00, "Draft transaction must NOT affect budget spent amount!"
    assert float(pending_budget["remaining_amount"]) == 2000.00

    # 6. User confirms the transaction (timestamp is required)
    confirm_resp = client.post(
        f"/api/v1/transactions/{draft_id}/confirm",
        json={
            "amount": 600.00,
            "category_id": dining_cat["id"],
            "timestamp": now.isoformat(),
            "merchant_name": "Dominos Pizza",
        },
        headers=auth_headers,
    )
    assert confirm_resp.status_code == 200
    assert confirm_resp.json()["status"] == "CONFIRMED"

    # 7. Check budget: NOW counted! 600 spent, 1400 remaining
    confirmed_budget = client.get(
        f"/api/v1/budgets/{dining_cat['id']}?month={month}&year={year}",
        headers=auth_headers,
    ).json()
    assert float(confirmed_budget["spent_amount"]) == 600.00
    assert float(confirmed_budget["remaining_amount"]) == 1400.00
    assert confirmed_budget["percentage_used"] == 30.0


def test_budget_summary_not_intercepted_by_category_route(client, auth_headers):
    """GET /budgets/summary must not be captured as a dynamic category_id."""
    now = datetime.now(timezone.utc)
    resp = client.get(f"/api/v1/budgets/summary?month={now.month}&year={now.year}", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_budget_tenant_isolation(client, auth_headers):
    """User B cannot view User A's budget summary or category status."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]
    now = datetime.now(timezone.utc)

    # User A creates a budget
    client.post(
        "/api/v1/budgets",
        json={"category_id": cat_id, "month": now.month, "year": now.year, "amount_limit": 5000.00},
        headers=auth_headers,
    )

    # Register and login User B
    client.post(
        "/api/v1/auth/register",
        json={"email": "userb_budget@example.com", "password": "Password123!"},
    )
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "userb_budget@example.com", "password": "Password123!"},
    )
    user_b_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    # User B monthly budget summary is empty (does not leak User A's budget)
    summary_b = client.get(
        f"/api/v1/budgets/summary?month={now.month}&year={now.year}",
        headers=user_b_headers,
    ).json()
    assert len(summary_b) == 0

    # User B accessing category budget returns 404
    status_b = client.get(
        f"/api/v1/budgets/{cat_id}?month={now.month}&year={now.year}",
        headers=user_b_headers,
    )
    assert status_b.status_code == 404


def test_spending_breakdown_not_intercepted_by_category_route(client, auth_headers):
    """GET /budgets/spending-breakdown must return 200 and not be treated as a dynamic category ID."""
    now = datetime.now(timezone.utc)
    resp = client.get(
        f"/api/v1/budgets/spending-breakdown?month={now.month}&year={now.year}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "total_spent" in data
    assert "items" in data
    assert isinstance(data["items"], list)


def test_monthly_spending_breakdown_comprehensive(client, auth_headers):
    """Verify authoritative spending breakdown including Uncategorized, reimbursements, and paid-for-others."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cats = {c["name"]: c for c in cat_resp.json()}
    dining_cat = cats["Food & Dining"]
    transport_cat = cats["Transportation"]
    shopping_cat = cats["Shopping"]

    # Target specific month: 7/2026
    month = 7
    year = 2026
    dt_str = "2026-07-15T10:00:00Z"

    # Initially empty
    empty_resp = client.get(f"/api/v1/budgets/spending-breakdown?month={month}&year={year}", headers=auth_headers)
    assert empty_resp.status_code == 200
    assert float(empty_resp.json()["total_spent"]) == 0.00
    assert len(empty_resp.json()["items"]) == 0

    # 1. Food: 2000 outgoing, 500 paid for someone else -> Net personal 1500
    client.post(
        "/api/v1/transactions",
        json={
            "amount": 2000.00,
            "category_id": dining_cat["id"],
            "amount_paid_for_someone_else": 500.00,
            "merchant_raw_name": "Group Dinner",
            "timestamp": dt_str,
        },
        headers=auth_headers,
    )

    # 2. Food: 500 outgoing -> Net personal 500 (Gross food net = 2000)
    client.post(
        "/api/v1/transactions",
        json={
            "amount": 500.00,
            "category_id": dining_cat["id"],
            "merchant_raw_name": "Lunch Cafe",
            "timestamp": dt_str,
        },
        headers=auth_headers,
    )

    # 3. Food Reimbursement: 800 received -> Net Food = 2000 - 800 = 1200
    client.post(
        "/api/v1/transactions",
        json={
            "amount": 800.00,
            "direction": "RECEIVED",
            "is_reimbursement": True,
            "category_id": dining_cat["id"],
            "merchant_raw_name": "Sourav reimbursement",
            "timestamp": dt_str,
        },
        headers=auth_headers,
    )

    # 4. Transport: 800 outgoing -> Net Transport = 800
    client.post(
        "/api/v1/transactions",
        json={
            "amount": 800.00,
            "category_id": transport_cat["id"],
            "merchant_raw_name": "Uber ride",
            "timestamp": dt_str,
        },
        headers=auth_headers,
    )

    # 5. Shopping: 300 outgoing, then 300 reimbursement -> Net Shopping = 0 (MUST NOT BE INCLUDED IN SLICES!)
    client.post(
        "/api/v1/transactions",
        json={
            "amount": 300.00,
            "category_id": shopping_cat["id"],
            "merchant_raw_name": "Shopping item",
            "timestamp": dt_str,
        },
        headers=auth_headers,
    )
    client.post(
        "/api/v1/transactions",
        json={
            "amount": 300.00,
            "direction": "RECEIVED",
            "is_reimbursement": True,
            "category_id": shopping_cat["id"],
            "merchant_raw_name": "Refund for shopping",
            "timestamp": dt_str,
        },
        headers=auth_headers,
    )

    # 6. Uncategorized: 400 outgoing (category_id is None) -> Net Uncategorized = 400
    client.post(
        "/api/v1/transactions",
        json={
            "amount": 400.00,
            "category_id": None,
            "merchant_raw_name": "Mystery Vendor",
            "timestamp": dt_str,
        },
        headers=auth_headers,
    )

    # Fetch breakdown
    breakdown_resp = client.get(
        f"/api/v1/budgets/spending-breakdown?month={month}&year={year}",
        headers=auth_headers,
    )
    assert breakdown_resp.status_code == 200
    data = breakdown_resp.json()

    # Total spent: 1200 + 800 + 400 = 2400.00
    assert float(data["total_spent"]) == 2400.00

    items = data["items"]
    # Shopping had net spending 0, so exactly 3 items: Food (1200), Transport (800), Uncategorized (400)
    assert len(items) == 3

    # Check order: descending by spent_amount
    assert items[0]["category_name"] == "Food & Dining"
    assert float(items[0]["spent_amount"]) == 1200.00
    assert items[0]["percentage"] == 50.0

    assert items[1]["category_name"] == "Transportation"
    assert float(items[1]["spent_amount"]) == 800.00
    assert items[1]["percentage"] == 33.3

    assert items[2]["category_name"] == "Uncategorized"
    assert items[2]["category_color"] == "#9E9E9E"
    assert float(items[2]["spent_amount"]) == 400.00
    assert items[2]["percentage"] == 16.7


def test_spending_breakdown_tenant_isolation(client, auth_headers):
    """User B cannot see User A's monthly spending breakdown."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    dining_cat = next(c for c in cat_resp.json() if c["name"] == "Food & Dining")

    month = 9
    year = 2026
    # User A creates transaction
    client.post(
        "/api/v1/transactions",
        json={
            "amount": 1500.00,
            "category_id": dining_cat["id"],
            "timestamp": "2026-09-02T12:00:00Z",
        },
        headers=auth_headers,
    )

    # Register and login User B
    client.post(
        "/api/v1/auth/register",
        json={"email": "breakdown_b@example.com", "password": "Password123!"},
    )
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "breakdown_b@example.com", "password": "Password123!"},
    )
    user_b_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    # User B checks breakdown for same period
    b_resp = client.get(
        f"/api/v1/budgets/spending-breakdown?month={month}&year={year}",
        headers=user_b_headers,
    )
    assert b_resp.status_code == 200
    assert float(b_resp.json()["total_spent"]) == 0.00
    assert len(b_resp.json()["items"]) == 0


def test_delete_budget_endpoint_success(client, auth_headers):
    """Deleting a monthly budget via DELETE /api/v1/budgets/{category_id} removes it from summary."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]
    month, year = 11, 2026

    # 1. Create budget
    set_resp = client.post(
        "/api/v1/budgets",
        json={"category_id": cat_id, "month": month, "year": year, "amount_limit": 3500.00},
        headers=auth_headers,
    )
    assert set_resp.status_code == 201

    # Verify present in summary
    summary_before = client.get(
        f"/api/v1/budgets/summary?month={month}&year={year}",
        headers=auth_headers,
    ).json()
    assert any(b["category_id"] == cat_id for b in summary_before)

    # 2. Delete budget
    del_resp = client.delete(
        f"/api/v1/budgets/{cat_id}?month={month}&year={year}",
        headers=auth_headers,
    )
    assert del_resp.status_code == 204

    # 3. Verify gone from summary
    summary_after = client.get(
        f"/api/v1/budgets/summary?month={month}&year={year}",
        headers=auth_headers,
    ).json()
    assert not any(b["category_id"] == cat_id for b in summary_after)


def test_set_budget_zero_removes_from_monthly_summary(client, auth_headers):
    """Setting a budget limit to 0 removes the category from that month's budget summary."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[1]["id"]
    month, year = 12, 2026

    # 1. Create initial budget of 4000
    client.post(
        "/api/v1/budgets",
        json={"category_id": cat_id, "month": month, "year": year, "amount_limit": 4000.00},
        headers=auth_headers,
    )
    summary_1 = client.get(
        f"/api/v1/budgets/summary?month={month}&year={year}",
        headers=auth_headers,
    ).json()
    assert any(b["category_id"] == cat_id for b in summary_1)

    # 2. Upsert with amount_limit: 0
    zero_resp = client.post(
        "/api/v1/budgets",
        json={"category_id": cat_id, "month": month, "year": year, "amount_limit": 0.0},
        headers=auth_headers,
    )
    assert zero_resp.status_code in (200, 201)

    # 3. Verify category is removed from monthly budget summary
    summary_2 = client.get(
        f"/api/v1/budgets/summary?month={month}&year={year}",
        headers=auth_headers,
    ).json()
    assert not any(b["category_id"] == cat_id for b in summary_2)


def test_delete_budget_tenant_isolation(client, auth_headers):
    """User B cannot delete User A's monthly budget."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]
    month, year = 10, 2026

    # User A sets budget
    client.post(
        "/api/v1/budgets",
        json={"category_id": cat_id, "month": month, "year": year, "amount_limit": 5000.00},
        headers=auth_headers,
    )

    # User B registers & logs in
    client.post(
        "/api/v1/auth/register",
        json={"email": "del_budget_b@example.com", "password": "Password123!"},
    )
    login_b = client.post(
        "/api/v1/auth/login",
        json={"email": "del_budget_b@example.com", "password": "Password123!"},
    )
    user_b_headers = {"Authorization": f"Bearer {login_b.json()['access_token']}"}

    # User B attempts to delete User A's budget -> 404
    del_resp = client.delete(
        f"/api/v1/budgets/{cat_id}?month={month}&year={year}",
        headers=user_b_headers,
    )
    assert del_resp.status_code == 404

    # User A's budget is intact
    summary_a = client.get(
        f"/api/v1/budgets/summary?month={month}&year={year}",
        headers=auth_headers,
    ).json()
    assert any(b["category_id"] == cat_id for b in summary_a)


def test_delete_nonexistent_budget_returns_404(client, auth_headers):
    """Attempting to delete a budget that does not exist returns 404."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]

    del_resp = client.delete(
        f"/api/v1/budgets/{cat_id}?month=1&year=2030",
        headers=auth_headers,
    )
    assert del_resp.status_code == 404



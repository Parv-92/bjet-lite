def test_create_and_get_transaction(client, auth_headers):
    # Fetch a default category ID
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    food_cat = next(c for c in cat_resp.json() if c["name"] == "Food & Dining")

    # Create transaction
    payload = {
        "amount": 450.50,
        "currency": "INR",
        "merchant_raw_name": "Swiggy",
        "upi_vpa": "swiggy@icici",
        "category_id": food_cat["id"],
        "payment_app": "Google Pay",
        "notes": "Dinner order",
        "upi_reference_id": "UPI1234567890",
    }
    create_resp = client.post("/api/v1/transactions", json=payload, headers=auth_headers)
    assert create_resp.status_code == 201
    tx_data = create_resp.json()
    assert float(tx_data["amount"]) == 450.50
    assert tx_data["merchant_raw_name"] == "Swiggy"
    assert tx_data["status"] == "CONFIRMED"
    assert tx_data["has_receipt"] is False
    tx_id = tx_data["id"]

    # Retrieve by ID (detailed response)
    get_resp = client.get(f"/api/v1/transactions/{tx_id}", headers=auth_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == tx_id
    assert "has_receipt" in get_resp.json()

    # Retrieve list (lightweight response: has_receipt included, no raw_extracted_text)
    list_resp = client.get("/api/v1/transactions", headers=auth_headers)
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert len(list_data) >= 1
    item = next(t for t in list_data if t["id"] == tx_id)
    assert "has_receipt" in item
    assert "raw_extracted_text" not in item  # Lightweight response excludes large OCR text


def test_update_transaction_category(client, auth_headers):
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    food_cat = next(c for c in cat_resp.json() if c["name"] == "Food & Dining")
    groceries_cat = next(c for c in cat_resp.json() if c["name"] == "Groceries")

    # Create initial transaction
    payload = {
        "amount": 250.00,
        "merchant_raw_name": "Blinkit",
        "category_id": food_cat["id"],
    }
    tx_resp = client.post("/api/v1/transactions", json=payload, headers=auth_headers)
    tx_id = tx_resp.json()["id"]

    # Update category to Groceries
    update_resp = client.put(
        f"/api/v1/transactions/{tx_id}",
        json={"category_id": groceries_cat["id"], "notes": "Corrected category"},
        headers=auth_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["category_id"] == groceries_cat["id"]
    assert update_resp.json()["notes"] == "Corrected category"


def test_delete_transaction(client, auth_headers):
    payload = {"amount": 100.00, "merchant_raw_name": "Local Chai"}
    tx_resp = client.post("/api/v1/transactions", json=payload, headers=auth_headers)
    tx_id = tx_resp.json()["id"]

    del_resp = client.delete(f"/api/v1/transactions/{tx_id}", headers=auth_headers)
    assert del_resp.status_code == 204

    get_resp = client.get(f"/api/v1/transactions/{tx_id}", headers=auth_headers)
    assert get_resp.status_code == 404


def test_put_transaction_lifecycle_protection(client, auth_headers, db_session):
    """PUT /transactions/{id} must not allow arbitrary lifecycle transitions involving PENDING_CONFIRMATION."""
    from datetime import datetime, timezone
    from decimal import Decimal
    from src.models.transaction import Transaction, TransactionStatus

    # 1. Draft transaction in PENDING_CONFIRMATION
    draft_tx = Transaction(
        user_id=1,
        amount=Decimal("199.00"),
        currency="INR",
        status=TransactionStatus.PENDING_CONFIRMATION,
        merchant_raw_name="Draft Store",
    )
    db_session.add(draft_tx)
    db_session.commit()
    db_session.refresh(draft_tx)

    # Attempting to confirm via PUT must be rejected with 400
    put_resp1 = client.put(
        f"/api/v1/transactions/{draft_tx.id}",
        json={"status": "CONFIRMED"},
        headers=auth_headers,
    )
    assert put_resp1.status_code == 400
    assert "cannot be confirmed or transitioned via put" in put_resp1.json()["detail"].lower()

    # 2. Confirmed transaction
    confirmed_tx = Transaction(
        user_id=1,
        amount=Decimal("350.00"),
        currency="INR",
        status=TransactionStatus.CONFIRMED,
        merchant_raw_name="Confirmed Store",
    )
    db_session.add(confirmed_tx)
    db_session.commit()
    db_session.refresh(confirmed_tx)

    # Attempting to revert to PENDING_CONFIRMATION via PUT must be rejected with 400
    put_resp2 = client.put(
        f"/api/v1/transactions/{confirmed_tx.id}",
        json={"status": "PENDING_CONFIRMATION"},
        headers=auth_headers,
    )
    assert put_resp2.status_code == 400
    assert "cannot be transitioned into pending_confirmation" in put_resp2.json()["detail"].lower()


def test_update_transaction_with_set_as_merchant_default(client, auth_headers):
    """Updating a transaction with set_as_merchant_default=True creates a UserMerchantRule atomically."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    food_cat = next(c for c in cat_resp.json() if c["name"] == "Food & Dining")
    shopping_cat = next(c for c in cat_resp.json() if c["name"] == "Shopping")

    # 1. Create transaction with Food & Dining
    tx_resp = client.post(
        "/api/v1/transactions",
        json={"amount": 999.00, "merchant_raw_name": "Zara India", "category_id": food_cat["id"]},
        headers=auth_headers,
    )
    assert tx_resp.status_code == 201
    tx_id = tx_resp.json()["id"]

    # 2. Update transaction category to Shopping with set_as_merchant_default=True
    put_resp = client.put(
        f"/api/v1/transactions/{tx_id}",
        json={
            "category_id": shopping_cat["id"],
            "set_as_merchant_default": True,
        },
        headers=auth_headers,
    )
    assert put_resp.status_code == 200
    assert put_resp.json()["category_id"] == shopping_cat["id"]

    # 3. Verify UserMerchantRule was created for ZARA INDIA -> Shopping
    rules_resp = client.get("/api/v1/rules", headers=auth_headers)
    assert rules_resp.status_code == 200
    rules = rules_resp.json()
    zara_rule = next((r for r in rules if r["merchant_pattern"] == "ZARA INDIA"), None)
    assert zara_rule is not None
    assert zara_rule["category_id"] == shopping_cat["id"]

    # 4. Create a subsequent transaction with same merchant without specifying category
    # Must auto-categorize as Shopping via the newly created rule!
    new_tx_resp = client.post(
        "/api/v1/transactions",
        json={"amount": 1500.00, "merchant_raw_name": "Zara India"},
        headers=auth_headers,
    )
    assert new_tx_resp.status_code == 201
    assert new_tx_resp.json()["category_id"] == shopping_cat["id"]


def test_update_transaction_set_as_merchant_default_validation(client, auth_headers):
    """Validation errors when set_as_merchant_default=True without a valid category or merchant."""
    # Transaction without merchant name
    tx_resp = client.post(
        "/api/v1/transactions",
        json={"amount": 50.00},
        headers=auth_headers,
    )
    assert tx_resp.status_code == 201
    tx_id = tx_resp.json()["id"]

    # Attempt set_as_merchant_default on transaction without merchant name -> 400
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    food_cat = next(c for c in cat_resp.json() if c["name"] == "Food & Dining")

    err_resp1 = client.put(
        f"/api/v1/transactions/{tx_id}",
        json={"category_id": food_cat["id"], "set_as_merchant_default": True},
        headers=auth_headers,
    )
    assert err_resp1.status_code == 400
    assert "without a merchant name" in err_resp1.json()["detail"].lower()

    # Transaction with merchant name but no category
    tx_resp2 = client.post(
        "/api/v1/transactions",
        json={"amount": 75.00, "merchant_raw_name": "NoCategory Store"},
        headers=auth_headers,
    )
    assert tx_resp2.status_code == 201
    tx_id2 = tx_resp2.json()["id"]

    err_resp2 = client.put(
        f"/api/v1/transactions/{tx_id2}",
        json={"set_as_merchant_default": True},
        headers=auth_headers,
    )
    assert err_resp2.status_code == 400
    assert "no category is supplied" in err_resp2.json()["detail"].lower()

    # Attempt to set "Uncategorized" as merchant default -> 400
    uncat_resp = client.get("/api/v1/categories", headers=auth_headers)
    uncat_cat = next(c for c in uncat_resp.json() if c["name"] == "Uncategorized")
    err_resp3 = client.put(
        f"/api/v1/transactions/{tx_id2}",
        json={"category_id": uncat_cat["id"], "set_as_merchant_default": True},
        headers=auth_headers,
    )
    assert err_resp3.status_code == 400
    assert "uncategorized" in err_resp3.json()["detail"].lower()


def test_update_transaction_set_as_merchant_default_multi_tenant_isolation(client, auth_headers):
    """User A setting a merchant default does not create rules or affect User B."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    food_cat = next(c for c in cat_resp.json() if c["name"] == "Food & Dining")

    # Register User B
    client.post(
        "/api/v1/auth/register",
        json={"email": "user_b_isolation@example.com", "password": "Password123!", "full_name": "User B"},
    )
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "user_b_isolation@example.com", "password": "Password123!"},
    )
    user_b_token = login_resp.json()["access_token"]
    user_b_headers = {"Authorization": f"Bearer {user_b_token}"}

    # User A creates transaction & sets merchant default
    tx_resp = client.post(
        "/api/v1/transactions",
        json={"amount": 120.00, "merchant_raw_name": "Specialty Bakery"},
        headers=auth_headers,
    )
    tx_id = tx_resp.json()["id"]

    client.put(
        f"/api/v1/transactions/{tx_id}",
        json={"category_id": food_cat["id"], "set_as_merchant_default": True},
        headers=auth_headers,
    )

    # User B checks rules -> must NOT see User A's rule!
    user_b_rules = client.get("/api/v1/rules", headers=user_b_headers).json()
    assert not any(r["merchant_pattern"] == "SPECIALTY BAKERY" for r in user_b_rules)


def test_update_transaction_atomic_rollback(client, auth_headers, monkeypatch):
    """Verify rollback: if rule upsert fails during update, transaction is not partially committed."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    food_cat = next(c for c in cat_resp.json() if c["name"] == "Food & Dining")
    transport_cat = next(c for c in cat_resp.json() if c["name"] == "Transportation")

    # Create transaction in Transportation
    tx_resp = client.post(
        "/api/v1/transactions",
        json={"amount": 300.00, "merchant_raw_name": "Metro Rail", "category_id": transport_cat["id"]},
        headers=auth_headers,
    )
    tx_id = tx_resp.json()["id"]

    # Monkeypatch rule_repo.find_duplicate to raise an unexpected database exception
    from src.repositories.rule_repo import rule_repo

    def fake_find_duplicate(*args, **kwargs):
        raise RuntimeError("Simulated database failure during rule lookup")

    monkeypatch.setattr(rule_repo, "find_duplicate", fake_find_duplicate)

    # Attempt update with set_as_merchant_default=True; TestClient re-raises unhandled server exceptions
    import pytest
    with pytest.raises(RuntimeError, match="Simulated database failure"):
        client.put(
            f"/api/v1/transactions/{tx_id}",
            json={"category_id": food_cat["id"], "set_as_merchant_default": True},
            headers=auth_headers,
        )

    # Verify transaction category was NOT changed to Food & Dining (rolled back!)
    check_resp = client.get(f"/api/v1/transactions/{tx_id}", headers=auth_headers)
    assert check_resp.status_code == 200
    assert check_resp.json()["category_id"] == transport_cat["id"]


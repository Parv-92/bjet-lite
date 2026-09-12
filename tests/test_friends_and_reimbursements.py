from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.models.transaction import TransactionStatus
from src.repositories.budget_repo import calculate_category_net_spending
from src.repositories.category_repo import category_repo


def test_friends_crud_and_isolation(client: TestClient, auth_headers: dict, db_session: Session):
    # 1. Get user category
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]

    # 2. Create friend
    resp = client.post(
        "/api/v1/friends",
        headers=auth_headers,
        json={
            "name": "Sourav",
            "recognized_name": "  sourav  ",
            "category_id": cat_id,
        },
    )
    assert resp.status_code == 201
    friend = resp.json()
    assert friend["name"] == "Sourav"
    assert friend["recognized_name"] == "SOURAV"  # normalized uppercase
    friend_id = friend["id"]

    # 3. Duplicate recognized_name for same user must be rejected
    dup_resp = client.post(
        "/api/v1/friends",
        headers=auth_headers,
        json={
            "name": "Sourav Second",
            "recognized_name": "SOURAV",
            "category_id": cat_id,
        },
    )
    assert dup_resp.status_code == 400
    assert "already exists" in dup_resp.json()["detail"].lower()

    # 4. List friends
    list_resp = client.get("/api/v1/friends", headers=auth_headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    # 5. Update friend
    upd_resp = client.put(
        f"/api/v1/friends/{friend_id}",
        headers=auth_headers,
        json={"name": "Sourav Ganguly"},
    )
    assert upd_resp.status_code == 200
    assert upd_resp.json()["name"] == "Sourav Ganguly"

    # 6. Isolation: User B cannot see or modify User A's friend
    client.post(
        "/api/v1/auth/register",
        json={"email": "userb@example.com", "password": "Password123!", "full_name": "User B"},
    )
    login_b = client.post(
        "/api/v1/auth/login",
        json={"email": "userb@example.com", "password": "Password123!"},
    )
    headers_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}

    # User B list should be empty
    list_b = client.get("/api/v1/friends", headers=headers_b)
    assert len(list_b.json()) == 0

    # User B cannot access User A's friend
    get_b = client.get(f"/api/v1/friends/{friend_id}", headers=headers_b)
    assert get_b.status_code == 404

    # 7. Delete friend
    del_resp = client.delete(f"/api/v1/friends/{friend_id}", headers=auth_headers)
    assert del_resp.status_code == 204


def test_automatic_friend_reimbursement(client: TestClient, auth_headers: dict, db_session: Session):
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    food_cat = next(c for c in cat_resp.json() if c["name"] == "Food & Dining")
    food_cat_id = food_cat["id"]

    # 1. Create Friend SOURAV -> Food & Dining
    friend_resp = client.post(
        "/api/v1/friends",
        headers=auth_headers,
        json={"name": "Sourav", "recognized_name": "SOURAV", "category_id": food_cat_id},
    )
    assert friend_resp.status_code == 201

    # 2. Log an outgoing expense of 2000 in Food & Dining
    exp_resp = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={
            "amount": 2000.0,
            "category_id": food_cat_id,
            "merchant_raw_name": "Gourmet Goodies",
            "direction": "SENT",
        },
    )
    assert exp_resp.status_code == 201

    # Verify initial spending is 2000
    now = exp_resp.json()["timestamp"]
    from datetime import datetime
    dt = datetime.fromisoformat(now.replace("Z", "+00:00"))
    budget_sum = client.get(f"/api/v1/budgets/summary?month={dt.month}&year={dt.year}", headers=auth_headers)
    # Check net spending directly
    from src.repositories.user_repo import user_repo
    user = user_repo.get_by_email(db_session, "tester@example.com")
    net = calculate_category_net_spending(db_session, user.id, food_cat_id, dt.month, dt.year)
    assert net == Decimal("2000.00")

    # 3. Create incoming transaction with sender "SOURAV" and is_reimbursement=None
    in_resp = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={
            "amount": 1200.0,
            "merchant_raw_name": "SOURAV",
            "direction": "RECEIVED",
            # is_reimbursement omitted -> automatic friend recognition
        },
    )
    assert in_resp.status_code == 201
    in_tx = in_resp.json()
    assert in_tx["direction"] == "RECEIVED"
    assert in_tx["is_reimbursement"] is True
    assert in_tx["category_id"] == food_cat_id

    # 4. Verify net category spending is now 2000 - 1200 = 800
    net = calculate_category_net_spending(db_session, user.id, food_cat_id, dt.month, dt.year)
    assert net == Decimal("800.00")


def test_explicit_non_reimbursement_received(client: TestClient, auth_headers: dict, db_session: Session):
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]

    # Configure friend SOURAV
    client.post(
        "/api/v1/friends",
        headers=auth_headers,
        json={"name": "Sourav", "recognized_name": "SOURAV", "category_id": cat_id},
    )

    # Incoming payment explicitly specifying is_reimbursement=False
    resp = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={
            "amount": 500.0,
            "merchant_raw_name": "SOURAV",
            "direction": "RECEIVED",
            "is_reimbursement": False,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["is_reimbursement"] is False
    assert resp.json()["friend_id"] is None


def test_manual_reimbursement_and_negative_spending_prevention(
    client: TestClient, auth_headers: dict, db_session: Session
):
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]

    # 1. Outgoing expense of 1000
    client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 1000.0, "category_id": cat_id, "direction": "SENT"},
    )

    # 2. Attempt reimbursement of 1500 (> 1000 available) -> Must fail with exact error
    reimb_fail = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={
            "amount": 1500.0,
            "category_id": cat_id,
            "direction": "RECEIVED",
            "is_reimbursement": True,
        },
    )
    assert reimb_fail.status_code == 400
    assert reimb_fail.json()["detail"] == (
        "Cannot apply this payment as a reimbursement because the selected category "
        "does not have enough spending to offset this amount."
    )

    # 3. Valid reimbursement of 600 -> succeeds
    reimb_ok = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={
            "amount": 600.0,
            "category_id": cat_id,
            "direction": "RECEIVED",
            "is_reimbursement": True,
        },
    )
    assert reimb_ok.status_code == 201
    assert reimb_ok.json()["is_reimbursement"] is True

    # 4. Now available spending is 1000 - 600 = 400.
    # Attempt second reimbursement of 500 (> 400) -> fails
    reimb_fail2 = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={
            "amount": 500.0,
            "category_id": cat_id,
            "direction": "RECEIVED",
            "is_reimbursement": True,
        },
    )
    assert reimb_fail2.status_code == 400


def test_paid_part_for_someone_else_and_net_spending(
    client: TestClient, auth_headers: dict, db_session: Session
):
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]
    from src.repositories.user_repo import user_repo
    user = user_repo.get_by_email(db_session, "tester@example.com")

    # 1. Validation: amount_paid_for_someone_else > amount must fail
    fail_resp = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={
            "amount": 1000.0,
            "category_id": cat_id,
            "amount_paid_for_someone_else": 1200.0,
        },
    )
    assert fail_resp.status_code == 400
    assert "cannot exceed" in fail_resp.json()["detail"].lower()

    # 2. Valid: Expense 2000, paid for someone else 1200
    resp = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={
            "amount": 2000.0,
            "category_id": cat_id,
            "amount_paid_for_someone_else": 1200.0,
        },
    )
    assert resp.status_code == 201
    tx = resp.json()
    assert float(tx["amount_paid_for_someone_else"]) == 1200.0

    # Net spending must be 2000 - 1200 = 800
    from datetime import datetime
    dt = datetime.fromisoformat(tx["timestamp"].replace("Z", "+00:00"))
    net = calculate_category_net_spending(db_session, user.id, cat_id, dt.month, dt.year)
    assert net == Decimal("800.00")

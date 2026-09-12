from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.repositories.budget_repo import calculate_category_net_spending
from src.repositories.user_repo import user_repo


def test_bulk_delete_successful(client: TestClient, auth_headers: dict, db_session: Session):
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]

    # Create 3 transactions
    ids = []
    for i in range(3):
        resp = client.post(
            "/api/v1/transactions",
            headers=auth_headers,
            json={"amount": 100.0 * (i + 1), "category_id": cat_id},
        )
        ids.append(resp.json()["id"])

    # Bulk delete all 3
    del_resp = client.request(
        "DELETE",
        "/api/v1/transactions/bulk",
        headers=auth_headers,
        json={"transaction_ids": ids},
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted_count"] == 3

    # Verify they are gone
    for tid in ids:
        get_resp = client.get(f"/api/v1/transactions/{tid}", headers=auth_headers)
        assert get_resp.status_code == 404


def test_bulk_delete_multi_tenant_and_rollback(client: TestClient, auth_headers: dict, db_session: Session):
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]

    # User A creates a transaction
    tx_a = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 500.0, "category_id": cat_id},
    ).json()["id"]

    # User B registers & logs in
    client.post(
        "/api/v1/auth/register",
        json={"email": "attacker@example.com", "password": "Password123!", "full_name": "Attacker"},
    )
    login_b = client.post(
        "/api/v1/auth/login",
        json={"email": "attacker@example.com", "password": "Password123!"},
    )
    headers_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}

    # User B creates a transaction
    tx_b = client.post(
        "/api/v1/transactions",
        headers=headers_b,
        json={"amount": 300.0, "category_id": cat_id},
    ).json()["id"]

    # User B tries to bulk delete [tx_b, tx_a] (including User A's transaction)
    bad_del = client.request(
        "DELETE",
        "/api/v1/transactions/bulk",
        headers=headers_b,
        json={"transaction_ids": [tx_b, tx_a]},
    )
    assert bad_del.status_code == 404

    # Verify atomic rollback: User B's transaction tx_b was NOT deleted!
    check_b = client.get(f"/api/v1/transactions/{tx_b}", headers=headers_b)
    assert check_b.status_code == 200


def test_expense_deletion_cannot_cause_negative_category_spending(
    client: TestClient, auth_headers: dict, db_session: Session
):
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]
    user = user_repo.get_by_email(db_session, "tester@example.com")

    # 1. Expense 1: 2000
    tx_exp1 = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 2000.0, "category_id": cat_id, "direction": "SENT"},
    ).json()

    # 2. Reimbursement: 1500 (Net spending = 500)
    tx_reimb = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={
            "amount": 1500.0,
            "category_id": cat_id,
            "direction": "RECEIVED",
            "is_reimbursement": True,
        },
    ).json()

    # 3. Attempt to delete tx_exp1 (2000)
    # Resulting net spending would be: 0 - 1500 = -1500!
    # Deletion must be rejected!
    del_resp = client.request(
        "DELETE",
        "/api/v1/transactions/bulk",
        headers=auth_headers,
        json={"transaction_ids": [tx_exp1["id"]]},
    )
    assert del_resp.status_code == 400
    assert del_resp.json()["detail"] == (
        "Cannot delete transaction(s) because existing reimbursements exceed the resulting category spending."
    )

    # 4. Deleting the reimbursement FIRST restores available spending
    del_reimb = client.request(
        "DELETE",
        "/api/v1/transactions/bulk",
        headers=auth_headers,
        json={"transaction_ids": [tx_reimb["id"]]},
    )
    assert del_reimb.status_code == 200

    # Now deleting tx_exp1 succeeds
    del_exp_ok = client.request(
        "DELETE",
        "/api/v1/transactions/bulk",
        headers=auth_headers,
        json={"transaction_ids": [tx_exp1["id"]]},
    )
    assert del_exp_ok.status_code == 200

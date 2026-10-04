from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from src.models.transaction import Transaction
from src.repositories.budget_repo import calculate_category_net_spending
from src.repositories.user_repo import user_repo


def test_bulk_delete_successful(client: TestClient, auth_headers: dict, db_session: Session):
    """Verify basic bulk deletion of simple transactions."""
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


def test_delete_expense_retaining_reimbursement_exceeding_spending_rejected(
    client: TestClient, auth_headers: dict, db_session: Session
):
    """1. Delete an expense while retaining a reimbursement that would exceed remaining spending -> reject."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]

    # Expense: SENT 500
    exp = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 500.0, "category_id": cat_id, "direction": "SENT"},
    ).json()

    # Reimbursement: RECEIVED 300
    reimb = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={
            "amount": 300.0,
            "category_id": cat_id,
            "direction": "RECEIVED",
            "is_reimbursement": True,
        },
    ).json()

    # Attempt to delete only the expense (leaving reimbursement 300 > remaining spending 0)
    del_resp = client.request(
        "DELETE",
        "/api/v1/transactions/bulk",
        headers=auth_headers,
        json={"transaction_ids": [exp["id"]]},
    )
    assert del_resp.status_code == 400
    assert del_resp.json()["detail"] == (
        "Cannot delete transaction(s) because existing reimbursements exceed the resulting category spending."
    )

    # Both transactions must still exist
    assert client.get(f"/api/v1/transactions/{exp['id']}", headers=auth_headers).status_code == 200
    assert client.get(f"/api/v1/transactions/{reimb['id']}", headers=auth_headers).status_code == 200


def test_delete_expense_and_reimbursement_together_succeeds(
    client: TestClient, auth_headers: dict, db_session: Session
):
    """2. Delete both the expense and its reimbursement together -> succeed."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]

    # Food & Dining:
    # - SENT ₹500
    # - RECEIVED reimbursement ₹300
    exp = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 500.0, "category_id": cat_id, "direction": "SENT"},
    ).json()

    reimb = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={
            "amount": 300.0,
            "category_id": cat_id,
            "direction": "RECEIVED",
            "is_reimbursement": True,
        },
    ).json()

    # Delete both together atomically
    del_resp = client.request(
        "DELETE",
        "/api/v1/transactions/bulk",
        headers=auth_headers,
        json={"transaction_ids": [exp["id"], reimb["id"]]},
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted_count"] == 2

    # Verify both are deleted
    assert client.get(f"/api/v1/transactions/{exp['id']}", headers=auth_headers).status_code == 404
    assert client.get(f"/api/v1/transactions/{reimb['id']}", headers=auth_headers).status_code == 404


def test_delete_all_transactions_succeeds_and_leaves_zero(
    client: TestClient, auth_headers: dict, db_session: Session
):
    """3. Delete all transactions -> succeed and leave zero transactions."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat1_id = cat_resp.json()[0]["id"]
    cat2_id = cat_resp.json()[1]["id"]

    # Cat 1: Expense 1000 + Reimbursement 400
    e1 = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 1000.0, "category_id": cat1_id, "direction": "SENT"},
    ).json()["id"]
    r1 = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 400.0, "category_id": cat1_id, "direction": "RECEIVED", "is_reimbursement": True},
    ).json()["id"]

    # Cat 2: Expense 600 + Reimbursement 200 + Inflow 100
    e2 = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 600.0, "category_id": cat2_id, "direction": "SENT"},
    ).json()["id"]
    r2 = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 200.0, "category_id": cat2_id, "direction": "RECEIVED", "is_reimbursement": True},
    ).json()["id"]
    inf = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 100.0, "direction": "RECEIVED", "is_reimbursement": False},
    ).json()["id"]

    all_ids = [e1, r1, e2, r2, inf]

    # Delete all transactions atomically
    del_resp = client.request(
        "DELETE",
        "/api/v1/transactions/bulk",
        headers=auth_headers,
        json={"transaction_ids": all_ids},
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted_count"] == len(all_ids)

    # Verify user has 0 transactions remaining
    list_resp = client.get("/api/v1/transactions", headers=auth_headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 0


def test_delete_unrelated_transactions_preserving_valid_reimbursement_succeeds(
    client: TestClient, auth_headers: dict, db_session: Session
):
    """4. Delete unrelated transactions while preserving a valid reimbursement -> succeed."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]

    # Cat 1:
    # Expense 1: ₹1000
    # Expense 2: ₹500
    # Reimbursement: ₹400
    # Net spending = 1500 - 400 = 1100
    e1 = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 1000.0, "category_id": cat_id, "direction": "SENT"},
    ).json()["id"]
    e2 = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 500.0, "category_id": cat_id, "direction": "SENT"},
    ).json()["id"]
    r1 = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 400.0, "category_id": cat_id, "direction": "RECEIVED", "is_reimbursement": True},
    ).json()["id"]

    # Delete Expense 2 (₹500). Remaining spending = ₹1000, reimbursement = ₹400.
    # Invariant holds: 400 <= 1000.
    del_resp = client.request(
        "DELETE",
        "/api/v1/transactions/bulk",
        headers=auth_headers,
        json={"transaction_ids": [e2]},
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted_count"] == 1

    # Expense 1 and Reimbursement 1 remain intact
    assert client.get(f"/api/v1/transactions/{e1}", headers=auth_headers).status_code == 200
    assert client.get(f"/api/v1/transactions/{r1}", headers=auth_headers).status_code == 200
    assert client.get(f"/api/v1/transactions/{e2}", headers=auth_headers).status_code == 404


def test_bulk_deletion_tenant_isolated(
    client: TestClient, auth_headers: dict, db_session: Session
):
    """5. Bulk deletion remains tenant-isolated."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = cat_resp.json()[0]["id"]

    # User A creates transaction
    tx_a = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 500.0, "category_id": cat_id},
    ).json()["id"]

    # User B registers & logs in
    client.post(
        "/api/v1/auth/register",
        json={"email": "victim_isolated@example.com", "password": "Password123!", "full_name": "User B"},
    )
    login_b = client.post(
        "/api/v1/auth/login",
        json={"email": "victim_isolated@example.com", "password": "Password123!"},
    )
    headers_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}

    # User B creates a transaction
    cat_b = client.get("/api/v1/categories", headers=headers_b).json()[0]["id"]
    tx_b = client.post(
        "/api/v1/transactions",
        headers=headers_b,
        json={"amount": 250.0, "category_id": cat_b},
    ).json()["id"]

    # User B attempts to delete User A's transaction
    del_unauth = client.request(
        "DELETE",
        "/api/v1/transactions/bulk",
        headers=headers_b,
        json={"transaction_ids": [tx_a]},
    )
    assert del_unauth.status_code == 404
    assert f"Transaction(s) [{tx_a}] not found" in del_unauth.json()["detail"]

    # User A's transaction is untouched
    assert client.get(f"/api/v1/transactions/{tx_a}", headers=auth_headers).status_code == 200
    # User B's transaction is untouched
    assert client.get(f"/api/v1/transactions/{tx_b}", headers=headers_b).status_code == 200


def test_failed_bulk_deletion_rolls_back_completely(
    client: TestClient, auth_headers: dict, db_session: Session
):
    """6. Failed bulk deletion rolls back completely."""
    cat_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat1_id = cat_resp.json()[0]["id"]
    cat2_id = cat_resp.json()[1]["id"]

    # Cat 1: Expense 1 (₹500), Expense 2 (₹200), Reimbursement 1 (₹400)
    e1 = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 500.0, "category_id": cat1_id, "direction": "SENT"},
    ).json()["id"]
    e2 = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 200.0, "category_id": cat1_id, "direction": "SENT"},
    ).json()["id"]
    r1 = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 400.0, "category_id": cat1_id, "direction": "RECEIVED", "is_reimbursement": True},
    ).json()["id"]

    # Cat 2: Expense 3 (₹300)
    e3 = client.post(
        "/api/v1/transactions",
        headers=auth_headers,
        json={"amount": 300.0, "category_id": cat2_id, "direction": "SENT"},
    ).json()["id"]

    # Attempt to bulk delete [e1, e3]
    # Deleting e1 leaves Cat 1 with spending 200 < reimbursement 400 -> FAILS validation
    del_resp = client.request(
        "DELETE",
        "/api/v1/transactions/bulk",
        headers=auth_headers,
        json={"transaction_ids": [e1, e3]},
    )
    assert del_resp.status_code == 400
    assert "reimbursements exceed" in del_resp.json()["detail"].lower()

    # Verify atomic rollback: Neither e1 nor e3 was deleted
    assert client.get(f"/api/v1/transactions/{e1}", headers=auth_headers).status_code == 200
    assert client.get(f"/api/v1/transactions/{e2}", headers=auth_headers).status_code == 200
    assert client.get(f"/api/v1/transactions/{r1}", headers=auth_headers).status_code == 200
    assert client.get(f"/api/v1/transactions/{e3}", headers=auth_headers).status_code == 200

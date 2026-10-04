def test_list_categories_includes_defaults(client, auth_headers):
    response = client.get("/api/v1/categories", headers=auth_headers)
    assert response.status_code == 200
    categories = response.json()
    assert len(categories) >= 11  # 10 defaults + Uncategorized
    names = [c["name"] for c in categories]
    assert "Food & Dining" in names
    assert "Groceries" in names
    assert "Utilities & Bills" in names
    assert "Uncategorized" in names


def test_get_category_by_id(client, auth_headers):
    # Fetch all categories to get a default category ID
    list_resp = client.get("/api/v1/categories", headers=auth_headers)
    cat_id = list_resp.json()[0]["id"]

    resp = client.get(f"/api/v1/categories/{cat_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == cat_id


def test_get_nonexistent_category(client, auth_headers):
    resp = client.get("/api/v1/categories/99999", headers=auth_headers)
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_create_custom_category(client, auth_headers):
    payload = {
        "name": "Crypto Investments",
        "icon": "bitcoin",
        "color": "#F7931A",
    }
    response = client.post("/api/v1/categories", json=payload, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Crypto Investments"
    assert data["icon"] == "bitcoin"
    assert data["color"] == "#F7931A"
    assert data["is_system_default"] is False
    assert data["user_id"] is not None

    # Check that custom category is returned in list
    list_resp = client.get("/api/v1/categories", headers=auth_headers)
    names = [c["name"] for c in list_resp.json()]
    assert "Crypto Investments" in names


def test_create_duplicate_category(client, auth_headers):
    payload = {
        "name": "Gym & Fitness",
        "icon": "dumbbell",
        "color": "#000000",
    }
    resp1 = client.post("/api/v1/categories", json=payload, headers=auth_headers)
    assert resp1.status_code == 201

    # Attempt duplicate creation
    resp2 = client.post("/api/v1/categories", json=payload, headers=auth_headers)
    assert resp2.status_code == 400
    assert "already exists" in resp2.json()["detail"].lower()


def test_update_custom_category(client, auth_headers):
    # Create custom category
    create_resp = client.post(
        "/api/v1/categories",
        json={"name": "Gaming", "icon": "gamepad", "color": "#7B1FA2"},
        headers=auth_headers,
    )
    cat_id = create_resp.json()["id"]

    # Update name and color
    update_resp = client.put(
        f"/api/v1/categories/{cat_id}",
        json={"name": "Video Games & Streaming", "color": "#E040FB"},
        headers=auth_headers,
    )
    assert update_resp.status_code == 200
    updated_data = update_resp.json()
    assert updated_data["name"] == "Video Games & Streaming"
    assert updated_data["color"] == "#E040FB"
    assert updated_data["icon"] == "gamepad"  # Unchanged field retained


def test_update_system_default_category_forbidden(client, auth_headers):
    # Find a system default category
    list_resp = client.get("/api/v1/categories", headers=auth_headers)
    default_cat = next(c for c in list_resp.json() if c["is_system_default"])

    # Attempt to update it
    update_resp = client.put(
        f"/api/v1/categories/{default_cat['id']}",
        json={"name": "Modified Default Name"},
        headers=auth_headers,
    )
    assert update_resp.status_code == 403
    assert "system default" in update_resp.json()["detail"].lower()


def test_delete_custom_category(client, auth_headers):
    create_resp = client.post(
        "/api/v1/categories",
        json={"name": "Temporary Category", "icon": "trash"},
        headers=auth_headers,
    )
    cat_id = create_resp.json()["id"]

    # Delete custom category
    del_resp = client.delete(f"/api/v1/categories/{cat_id}", headers=auth_headers)
    assert del_resp.status_code == 204

    # Verify it is gone
    get_resp = client.get(f"/api/v1/categories/{cat_id}", headers=auth_headers)
    assert get_resp.status_code == 404


def test_delete_system_default_category_forbidden(client, auth_headers):
    list_resp = client.get("/api/v1/categories", headers=auth_headers)
    default_cat = next(c for c in list_resp.json() if c["is_system_default"])

    del_resp = client.delete(f"/api/v1/categories/{default_cat['id']}", headers=auth_headers)
    assert del_resp.status_code == 403
    assert "system default" in del_resp.json()["detail"].lower()


def test_category_user_isolation(client, auth_headers):
    # User 1 creates a private category
    create_resp = client.post(
        "/api/v1/categories",
        json={"name": "User 1 Secret Perks"},
        headers=auth_headers,
    )
    user1_cat_id = create_resp.json()["id"]

    # Register and login User 2
    client.post(
        "/api/v1/auth/register",
        json={"email": "user2@example.com", "password": "Password123!"},
    )
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "user2@example.com", "password": "Password123!"},
    )
    user2_token = login_resp.json()["access_token"]
    user2_headers = {"Authorization": f"Bearer {user2_token}"}

    # User 2 cannot retrieve User 1's custom category
    get_resp = client.get(f"/api/v1/categories/{user1_cat_id}", headers=user2_headers)
    assert get_resp.status_code == 404

    # User 2 cannot update User 1's custom category
    put_resp = client.put(
        f"/api/v1/categories/{user1_cat_id}",
        json={"name": "Hacked Category"},
        headers=user2_headers,
    )
    assert put_resp.status_code == 404

    # User 2 cannot delete User 1's custom category
    del_resp = client.delete(f"/api/v1/categories/{user1_cat_id}", headers=user2_headers)
    assert del_resp.status_code == 404


def test_delete_referenced_category_fails_with_400(client, auth_headers):
    """Category deletion must be rejected with 400 if referenced by transactions, presets, rules, or friends."""
    # 1. Create custom category
    cat_resp = client.post(
        "/api/v1/categories",
        json={"name": "Gym Subscriptions"},
        headers=auth_headers,
    )
    assert cat_resp.status_code == 201
    cat_id = cat_resp.json()["id"]

    # 2. Add transaction referencing this category -> 400
    tx_resp = client.post(
        "/api/v1/transactions",
        json={"amount": 1500.00, "merchant_raw_name": "Gold's Gym", "category_id": cat_id},
        headers=auth_headers,
    )
    assert tx_resp.status_code == 201
    tx_id = tx_resp.json()["id"]

    del_resp = client.delete(f"/api/v1/categories/{cat_id}", headers=auth_headers)
    assert del_resp.status_code == 400
    assert "cannot be deleted" in del_resp.json()["detail"].lower()
    assert "existing transactions" in del_resp.json()["detail"].lower()

    # 3. Remove transaction and add a merchant rule referencing the category -> 400
    client.delete(f"/api/v1/transactions/{tx_id}", headers=auth_headers)
    rule_resp = client.post(
        "/api/v1/rules",
        json={"merchant_pattern": "FITNESS", "category_id": cat_id, "priority": 1},
        headers=auth_headers,
    )
    rule_id = rule_resp.json()["id"]

    del_resp2 = client.delete(f"/api/v1/categories/{cat_id}", headers=auth_headers)
    assert del_resp2.status_code == 400
    assert "merchant rules" in del_resp2.json()["detail"].lower()

    # 4. Remove rule and add a preset referencing the category -> 400
    client.delete(f"/api/v1/rules/{rule_id}", headers=auth_headers)
    preset_resp = client.post(
        "/api/v1/budget-presets",
        json={"name": "Fitness Preset", "items": [{"category_id": cat_id, "amount": 3000.00}]},
        headers=auth_headers,
    )
    preset_id = preset_resp.json()["id"]

    del_resp3 = client.delete(f"/api/v1/categories/{cat_id}", headers=auth_headers)
    assert del_resp3.status_code == 400
    assert "budget presets" in del_resp3.json()["detail"].lower()

    # 5. Remove preset and add a friend referencing the category -> 400
    client.delete(f"/api/v1/budget-presets/{preset_id}", headers=auth_headers)
    friend_resp = client.post(
        "/api/v1/friends",
        json={"name": "Gym Buddy", "recognized_name": "Buddy", "category_id": cat_id},
        headers=auth_headers,
    )
    friend_id = friend_resp.json()["id"]

    del_resp4 = client.delete(f"/api/v1/categories/{cat_id}", headers=auth_headers)
    assert del_resp4.status_code == 400
    assert "friend reimbursement" in del_resp4.json()["detail"].lower()

    # Clean up friend
    client.delete(f"/api/v1/friends/{friend_id}", headers=auth_headers)


def test_delete_category_with_budgets_succeeds_and_cascades(client, auth_headers):
    """A category with no transactions, presets, rules, or friends CAN be deleted even if it has budgets.
    
    The monthly budgets are cascade-deleted along with the category.
    """
    # 1. Create custom category
    cat_resp = client.post(
        "/api/v1/categories",
        json={"name": "Special Project"},
        headers=auth_headers,
    )
    assert cat_resp.status_code == 201
    cat_id = cat_resp.json()["id"]

    # 2. Set monthly budgets for this category in Month 8 and Month 9
    client.post(
        "/api/v1/budgets",
        json={"category_id": cat_id, "month": 8, "year": 2026, "amount_limit": 1500.00},
        headers=auth_headers,
    )
    client.post(
        "/api/v1/budgets",
        json={"category_id": cat_id, "month": 9, "year": 2026, "amount_limit": 2000.00},
        headers=auth_headers,
    )

    # Verify both budgets appear in their respective summaries
    summary_8 = client.get("/api/v1/budgets/summary?month=8&year=2026", headers=auth_headers).json()
    assert any(b["category_id"] == cat_id for b in summary_8)
    summary_9 = client.get("/api/v1/budgets/summary?month=9&year=2026", headers=auth_headers).json()
    assert any(b["category_id"] == cat_id for b in summary_9)

    # 3. Delete category -> Must SUCCEED (204 No Content)
    del_resp = client.delete(f"/api/v1/categories/{cat_id}", headers=auth_headers)
    assert del_resp.status_code == 204

    # 4. Verify category is gone
    assert client.get(f"/api/v1/categories/{cat_id}", headers=auth_headers).status_code == 404

    # 5. Verify budgets are cascade-deleted from both months
    summary_8_after = client.get("/api/v1/budgets/summary?month=8&year=2026", headers=auth_headers).json()
    assert not any(b["category_id"] == cat_id for b in summary_8_after)
    summary_9_after = client.get("/api/v1/budgets/summary?month=9&year=2026", headers=auth_headers).json()
    assert not any(b["category_id"] == cat_id for b in summary_9_after)


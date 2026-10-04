def test_register_user_success(client):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "newuser@example.com",
            "password": "SecretPassword123!",
            "full_name": "New User",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@example.com"
    assert data["full_name"] == "New User"
    assert "id" in data
    assert data["is_active"] is True


def test_register_user_duplicate_email(client):
    user_payload = {
        "email": "duplicate@example.com",
        "password": "Password123!",
        "full_name": "Dup User",
    }
    resp1 = client.post("/api/v1/auth/register", json=user_payload)
    assert resp1.status_code == 201

    resp2 = client.post("/api/v1/auth/register", json=user_payload)
    assert resp2.status_code == 400
    assert "already registered" in resp2.json()["detail"]


def test_login_success(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "loginuser@example.com", "password": "Password123!"},
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "loginuser@example.com", "password": "Password123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_invalid_password(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "wrongpwd@example.com", "password": "Password123!"},
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "wrongpwd@example.com", "password": "WrongPassword!"},
    )
    assert response.status_code == 401
    assert "Incorrect email or password" in response.json()["detail"]



def test_read_current_user_me(client, auth_headers):
    response = client.get("/api/v1/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "tester@example.com"
    assert data["full_name"] == "Test User"


def test_existing_user_can_login_after_logout(client):
    """
    Verify full lifecycle for an existing user:
    create user -> login -> authenticated -> logout -> login with same credentials -> authenticated.
    Must also pass repeatedly across multiple login/logout cycles.
    """
    email = "existing_relogin_user@example.com"
    password = "MyPassword123!"

    # 1. Register new user
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": "Relogin Tester"},
    )
    assert reg_resp.status_code == 201

    # 2. First login
    login_resp1 = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp1.status_code == 200
    token1 = login_resp1.json()["access_token"]
    assert token1

    # 3. Authenticated check
    me_resp1 = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert me_resp1.status_code == 200
    assert me_resp1.json()["email"] == email

    # 4. Client-side logout (token discarded / session cleared)
    token1 = None

    # 5. Second login with exactly the same credentials
    login_resp2 = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp2.status_code == 200
    token2 = login_resp2.json()["access_token"]
    assert token2

    # 6. Authenticated check after re-login
    me_resp2 = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert me_resp2.status_code == 200
    assert me_resp2.json()["email"] == email

    # 7. Repeated cycles: logout -> login -> logout -> login
    for cycle in range(3):
        # Discard token
        token2 = None
        # Login again
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        assert resp.status_code == 200
        cycle_token = resp.json()["access_token"]
        # Authenticated query
        me_resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {cycle_token}"},
        )
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == email


def test_login_case_insensitivity_and_whitespace(client):
    """
    Required Tests:
    1. sigmagod238@gmail.com -> login succeeds
    2. Sigmagod238@gmail.com -> same account, login succeeds
    3. SIGMAGOD238@GMAIL.COM -> same account, login succeeds
    4. Leading/trailing whitespace -> login succeeds after normalization
    5. Wrong password -> still fails with 401
    6. Unknown email -> still fails with 401
    """
    password = "CorrectPassword123!"

    # Register with lowercase
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"email": "sigmagod238@gmail.com", "password": password, "full_name": "Sigma User"},
    )
    assert reg_resp.status_code == 201
    assert reg_resp.json()["email"] == "sigmagod238@gmail.com"

    # 1. Exact lowercase login
    r1 = client.post("/api/v1/auth/login", json={"email": "sigmagod238@gmail.com", "password": password})
    assert r1.status_code == 200
    assert "access_token" in r1.json()

    # 2. Capitalized initial login
    r2 = client.post("/api/v1/auth/login", json={"email": "Sigmagod238@gmail.com", "password": password})
    assert r2.status_code == 200
    assert "access_token" in r2.json()

    # 3. All uppercase login
    r3 = client.post("/api/v1/auth/login", json={"email": "SIGMAGOD238@GMAIL.COM", "password": password})
    assert r3.status_code == 200
    assert "access_token" in r3.json()

    # 4. Leading / trailing whitespace
    r4 = client.post("/api/v1/auth/login", json={"email": "   Sigmagod238@gmail.com   ", "password": password})
    assert r4.status_code == 200
    assert "access_token" in r4.json()

    # 5. Wrong password fails with 401
    r5 = client.post("/api/v1/auth/login", json={"email": "Sigmagod238@gmail.com", "password": "WrongPassword!"})
    assert r5.status_code == 401
    assert "Incorrect email or password" in r5.json()["detail"]

    # 6. Unknown email fails with 401
    r6 = client.post("/api/v1/auth/login", json={"email": "nonexistent_user@gmail.com", "password": password})
    assert r6.status_code == 401
    assert "Incorrect email or password" in r6.json()["detail"]


def test_registration_canonicalizes_email_and_prevents_case_variants(client):
    """
    7. Registration stores/uses canonical email consistently
    8. Duplicate account prevention remains correct under case variation
    """
    password = "SecurePassword123!"

    # Register with mixed casing and whitespace
    reg1 = client.post(
        "/api/v1/auth/register",
        json={"email": "  ParvChoudhary999@Gmail.COM  ", "password": password, "full_name": "Parv Choudhary"},
    )
    assert reg1.status_code == 201
    # Check that canonical lowercase was stored
    assert reg1.json()["email"] == "parvchoudhary999@gmail.com"

    # Attempt to register duplicate with different casing
    reg2 = client.post(
        "/api/v1/auth/register",
        json={"email": "PARVCHOUDHARY999@gmail.com", "password": password, "full_name": "Parv Dup"},
    )
    assert reg2.status_code == 400
    assert "already registered" in reg2.json()["detail"]

    # Login works with original mixed case or lowercase
    log1 = client.post("/api/v1/auth/login", json={"email": "parvchoudhary999@gmail.com", "password": password})
    assert log1.status_code == 200
    log2 = client.post("/api/v1/auth/login", json={"email": "ParvChoudhary999@gmail.com", "password": password})
    assert log2.status_code == 200


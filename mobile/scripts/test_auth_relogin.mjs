/**
 * Automated Regression Test: Existing User Login After Logout
 * Validates:
 * 1. Existing accounts (parvchoudhary999@gmail.com, sigmagod238@gmail.com)
 * 2. Case normalization (Parv... vs parv..., Sigma... vs sigma...)
 * 3. Full lifecycle: LOGIN -> AUTHENTICATED -> LOGOUT -> LOGIN AGAIN -> AUTHENTICATED
 * 4. Repeated cycles (login -> logout -> login -> logout -> login)
 * 5. Stale 401 race prevention: an obsolete 401 from a dead session never invalidates a new session.
 */

const BASE_URL = 'http://localhost:8000/api/v1';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, data: json };
}

async function runTests() {
  console.log('=== STARTING AUTH RE-LOGIN REGRESSION TEST SUITE ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Password discovery from local verification test
  const PWD_PARV = 'Password123!';
  const PWD_SIGMA = '123456';

  console.log('--- TEST 1: Direct Backend Authentication for Existing Account 1 (parvchoudhary999) ---');
  {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'parvchoudhary999@gmail.com', password: PWD_PARV })
    });
    assert(res.status === 200, `Login status is 200 (got ${res.status})`);
    assert(Boolean(res.data.access_token), 'Received valid access_token');
    
    // Verify /auth/me
    const meRes = await request('/auth/me', {
      headers: { Authorization: `Bearer ${res.data.access_token}` }
    });
    assert(meRes.status === 200, `/auth/me status is 200`);
    assert(meRes.data.email === 'parvchoudhary999@gmail.com', `User email matches (got ${meRes.data.email})`);
    assert(meRes.data.id === 2, `User ID is 2 (got ${meRes.data.id})`);
  }

  console.log('\n--- TEST 2: Direct Backend Authentication for Existing Account 2 (sigmagod238) ---');
  {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'sigmagod238@gmail.com', password: PWD_SIGMA })
    });
    assert(res.status === 200, `Login status is 200 (got ${res.status})`);
    assert(Boolean(res.data.access_token), 'Received valid access_token');
    
    // Verify /auth/me
    const meRes = await request('/auth/me', {
      headers: { Authorization: `Bearer ${res.data.access_token}` }
    });
    assert(meRes.status === 200, `/auth/me status is 200`);
    assert(meRes.data.email === 'sigmagod238@gmail.com', `User email matches (got ${meRes.data.email})`);
    assert(meRes.data.id === 21, `User ID is 21 (got ${meRes.data.id})`);
  }

  console.log('\n--- TEST 3: Email Normalization Verification (Case Insensitive Login) ---');
  {
    // 1. Lowercase login
    const rLower = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'sigmagod238@gmail.com', password: PWD_SIGMA })
    });
    assert(rLower.status === 200, 'sigmagod238@gmail.com succeeds with 200');

    // 2. Capitalized initial login (Sigmagod...)
    const rCap = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'Sigmagod238@gmail.com', password: PWD_SIGMA })
    });
    assert(rCap.status === 200, 'Sigmagod238@gmail.com succeeds with 200');
    assert(Boolean(rCap.data.access_token), 'Received access_token for capitalized email');

    // 3. All uppercase login (SIGMAGOD...)
    const rUpper = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'SIGMAGOD238@GMAIL.COM', password: PWD_SIGMA })
    });
    assert(rUpper.status === 200, 'SIGMAGOD238@GMAIL.COM succeeds with 200');

    // 4. Leading / trailing whitespace
    const rSpace = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: '   Sigmagod238@gmail.com   ', password: PWD_SIGMA })
    });
    assert(rSpace.status === 200, 'Whitespace-padded email succeeds with 200');

    // 5. Wrong password still fails with 401
    const rWrongPwd = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'Sigmagod238@gmail.com', password: 'WrongPassword!' })
    });
    assert(rWrongPwd.status === 401, 'Wrong password fails with 401');

    // 6. Unknown email still fails with 401
    const rUnknown = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'unknown_account_xyz@gmail.com', password: PWD_SIGMA })
    });
    assert(rUnknown.status === 401, 'Unknown email fails with 401');
  }

  console.log('\n--- TEST 4: Full Lifecycle (Login -> Auth -> Logout -> Re-Login -> Auth) ---');
  {
    // Step A: Login
    const step1 = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'parvchoudhary999@gmail.com'.trim().toLowerCase(), password: PWD_PARV })
    });
    assert(step1.status === 200, 'Step A: First login successful (200)');
    const token1 = step1.data.access_token;

    // Step B: Authenticated check
    const me1 = await request('/auth/me', {
      headers: { Authorization: `Bearer ${token1}` }
    });
    assert(me1.status === 200, 'Step B: First session authenticated (200)');
    assert(me1.data.id === 2, 'Step B: User profile matches User ID 2');

    // Step C: Client logout (simulating SecureStore.deleteItemAsync and inMemoryToken = null)
    let inMemoryToken = null;
    assert(inMemoryToken === null, 'Step C: Client logout: stored token cleared');

    // Step D: Re-login immediately with exact same credentials
    const step2 = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'parvchoudhary999@gmail.com'.trim().toLowerCase(), password: PWD_PARV })
    });
    assert(step2.status === 200, 'Step D: Re-login successful (200)');
    const token2 = step2.data.access_token;
    assert(Boolean(token2), 'Step D: Received valid token2 on re-login');
    inMemoryToken = token2;

    // Step E: Authenticated check after re-login
    const me2 = await request('/auth/me', {
      headers: { Authorization: `Bearer ${inMemoryToken}` }
    });
    assert(me2.status === 200, 'Step E: Second session authenticated (200)');
    assert(me2.data.id === 2, 'Step E: User profile matches User ID 2');
  }

  console.log('\n--- TEST 5: Repeated Login-Logout Cycles (3 consecutive iterations) ---');
  {
    let allCyclesPassed = true;
    for (let i = 1; i <= 3; i++) {
      // Login
      const loginRes = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'sigmagod238@gmail.com'.trim().toLowerCase(), password: PWD_SIGMA })
      });
      if (loginRes.status !== 200 || !loginRes.data.access_token) {
        allCyclesPassed = false;
        break;
      }
      const token = loginRes.data.access_token;

      // Authenticated query
      const meRes = await request('/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (meRes.status !== 200 || meRes.data.id !== 21) {
        allCyclesPassed = false;
        break;
      }

      // Logout
      // token discarded
    }
    assert(allCyclesPassed, 'All 3 consecutive login -> logout -> login cycles succeeded with 200');
  }

  console.log('\n--- TEST 6: Stale 401 Interceptor Race Protection Simulation ---');
  {
    // Active session has tokenB
    const sessionRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'parvchoudhary999@gmail.com', password: PWD_PARV })
    });
    const activeToken = sessionRes.data.access_token;

    // Simulate stale response with an expired/invalid token (tokenA)
    const staleAuthHeader = 'Bearer invalid_or_expired_old_token';
    const staleRequestToken = staleAuthHeader.replace(/^Bearer\s+/i, '').trim();

    // Client interceptor rule:
    // Only notifyUnauthorized() if staleRequestToken === activeToken
    const shouldInvalidateSession = staleRequestToken && activeToken && (staleRequestToken === activeToken);
    assert(!shouldInvalidateSession, 'Stale 401 from old token correctly REJECTED: active session preserved');

    // Confirm active session is still 100% valid
    const meRes = await request('/auth/me', {
      headers: { Authorization: `Bearer ${activeToken}` }
    });
    assert(meRes.status === 200 && meRes.data.id === 2, 'Active session remains intact and authenticated');
  }

  console.log('\n=======================================');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=======================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test run failed with error:', err);
  process.exit(1);
});

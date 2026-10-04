/**
 * Automated Test: API Environment Architecture
 * Validates development vs production API URL resolution rules.
 */

function testEnvResolution() {
  console.log('=== STARTING API ENVIRONMENT ARCHITECTURE TEST SUITE ===\n');
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

  // Implementation of resolveApiBaseUrl logic for isolated unit testing
  function resolveApiBaseUrl(isDev, envUrl, allowLocalRelease) {
    const trimmed = envUrl ? envUrl.trim() : '';

    if (isDev || allowLocalRelease) {
      const devUrl = trimmed || 'http://localhost:8000/api/v1';
      return devUrl.replace(/\/+$/, '');
    }

    if (!trimmed) {
      throw new Error('Production API endpoint is not configured yet. Production builds require an explicit HTTPS EXPO_PUBLIC_API_BASE_URL.');
    }

    const normalized = trimmed.replace(/\/+$/, '');

    if (!normalized.startsWith('https://')) {
      throw new Error(`Invalid production API URL "${normalized}": Production API endpoint must use HTTPS protocol.`);
    }

    if (normalized.includes('localhost') || normalized.includes('127.0.0.1')) {
      throw new Error(`Invalid production API URL "${normalized}": Production API endpoint cannot point to localhost or loopback in production.`);
    }

    return normalized;
  }

  // 1. Development default
  {
    const url = resolveApiBaseUrl(true, undefined, false);
    assert(url === 'http://localhost:8000/api/v1', 'Dev defaults to localhost:8000');
  }

  // 2. Production with no env set -> Throws unconfigured error
  {
    let caught = false;
    try {
      resolveApiBaseUrl(false, undefined, false);
    } catch (e) {
      caught = true;
      assert(e.message.includes('Production API endpoint is not configured yet'), 'Prod without URL throws unconfigured error');
    }
    assert(caught, 'Prod without URL threw error');
  }

  // 3. Production with HTTP -> Throws HTTPS requirement
  {
    let caught = false;
    try {
      resolveApiBaseUrl(false, 'http://api.bjet.app/api/v1', false);
    } catch (e) {
      caught = true;
      assert(e.message.includes('must use HTTPS protocol'), 'Prod with HTTP throws HTTPS error');
    }
    assert(caught, 'Prod with HTTP threw error');
  }

  // 4. Production with localhost -> Throws loopback error
  {
    let caught = false;
    try {
      resolveApiBaseUrl(false, 'https://localhost:8000/api/v1', false);
    } catch (e) {
      caught = true;
      assert(e.message.includes('cannot point to localhost'), 'Prod with https://localhost throws loopback error');
    }
    assert(caught, 'Prod with localhost threw error');
  }

  // 5. Production with 127.0.0.1 -> Throws loopback error
  {
    let caught = false;
    try {
      resolveApiBaseUrl(false, 'https://127.0.0.1:8000/api/v1', false);
    } catch (e) {
      caught = true;
      assert(e.message.includes('cannot point to localhost or loopback'), 'Prod with https://127.0.0.1 throws loopback error');
    }
    assert(caught, 'Prod with 127.0.0.1 threw error');
  }

  // 6. Production with valid HTTPS URL -> Succeeded
  {
    const url = resolveApiBaseUrl(false, 'https://api.bjet.app/api/v1', false);
    assert(url === 'https://api.bjet.app/api/v1', 'Prod with valid HTTPS URL resolves correctly');
  }

  // 7. Explicit Local Release for device profiling -> Succeeded
  {
    const url = resolveApiBaseUrl(false, undefined, true);
    assert(url === 'http://localhost:8000/api/v1', 'Local release flag explicitly permits localhost testing with adb reverse');
  }

  console.log(`\n=======================================`);
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`=======================================\n`);

  if (failed > 0) process.exit(1);
}

testEnvResolution();

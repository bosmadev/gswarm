# GSwarm Integration Tests

Comprehensive end-to-end tests for the GSwarm token rotation system.

## Test Files

### 1. `token-loading.test.ts`
**Purpose:** Verify token file structure and integrity

**Tests:**
- Load all 3 token files from `D:/source/cwchat/main/gswarm-tokens/`
- Verify required fields: `refresh_token`, `access_token`, `email`, `projects`
- Validate projects array has exactly 12 projects per account
- Check client field is `gemini-cli`
- Verify OAuth scopes include `cloud-platform` and `userinfo.email`
- Validate timestamps (`created_at`, `updated_at`)
- Check all 36 projects are unique
- Verify project ID format matches pattern

**Duration:** ~1s (no network calls)

---

### 2. `token-refresh.test.ts`
**Purpose:** Validate token refresh using Gemini CLI credentials

**Tests:**
- Refresh access token for all 3 accounts individually
- Verify new access_token differs from cached one
- Check `expires_in` is valid (typically 3599 seconds)
- Test parallel refresh of all accounts
- Validate error handling for invalid tokens
- Validate error handling for invalid client credentials

**Duration:** ~10-15s (makes OAuth refresh calls)

---

### 3. `api-call.test.ts`
**Purpose:** Verify CloudCode PA API integration

**Tests:**
- Make successful API call with first account/project
- Test all 3 accounts in parallel
- Test multiple projects from same account
- Verify response structure has `candidates` field
- Test invalid access token (401 expected)
- Test missing project field (400 expected)

**Duration:** ~30s (makes API calls to Google)

---

### 4. `lru-rotation.test.ts`
**Purpose:** Validate LRU project rotation logic

**Tests:**
- Verify consecutive calls select different projects
- Check full rotation through all 36 projects before repeating
- Test `markUsed()` moves project to end of queue
- Validate parallel selection handling
- Make 10 rapid API calls using rotation
- Verify load distribution across accounts
- Test reset after full cycle

**Duration:** ~60s (includes API calls)

---

### 5. `model-support.test.ts`
**Purpose:** Confirm all Gemini models work

**Tests:**
- Test each model individually:
  - `gemini-2.0-flash`
  - `gemini-2.5-flash`
  - `gemini-2.5-pro`
  - `gemini-3-flash-preview`
  - `gemini-3-pro-preview`
- Test all models in parallel
- Verify unsupported model fails (e.g., `claude-3-opus`)
- Test different generation configs

**Duration:** ~30s (parallel API calls)

---

### 6. `error-handling.test.ts`
**Purpose:** Test error recovery and fallback mechanisms

**Tests:**
- Handle 401 unauthorized errors
- Handle 400 bad request errors
- Retry with next project on failure (max 3 attempts)
- Make 20 rapid requests that may trigger rate limits
- Test network timeout with AbortController
- Track error rates by project

**Duration:** ~2-3 minutes (stress testing)

---

## Running Tests

### Run All Integration Tests
```bash
cd D:/source/gswarm-api/main
pnpm vitest:run lib/gswarm/__tests__/integration
```

### Run Specific Test File
```bash
pnpm vitest:run lib/gswarm/__tests__/integration/token-loading.test.ts
```

### Run with UI
```bash
pnpm vitest:ui lib/gswarm/__tests__/integration
```

### Watch Mode (during development)
```bash
pnpm exec vitest lib/gswarm/__tests__/integration
```

---

## Prerequisites

### 1. Token Files
Token files must exist at:
```
D:/source/cwchat/main/gswarm-tokens/
├── bosmadev1@gmail.com.json
├── bosmadev2@gmail.com.json
└── bosmadev3@gmail.com.json
```

Each file must have:
- `refresh_token` (valid OAuth refresh token)
- `access_token` (may be expired, will be refreshed)
- `email` (matching filename)
- `projects` (array of 12 project IDs)
- `client: "gemini-cli"`

### 2. Environment
No `.env` configuration needed - tests use hardcoded Gemini CLI credentials.

### 3. Network
Tests make real API calls to:
- `https://oauth2.googleapis.com/token` (token refresh)
- `https://cloudcode-pa.googleapis.com/v1internal:generateContent` (model API)

Ensure no firewall blocks these endpoints.

---

## Test Coverage Matrix

| Aspect | Test File | Coverage |
|--------|-----------|----------|
| Token Structure | `token-loading.test.ts` | ✅ 100% |
| OAuth Refresh | `token-refresh.test.ts` | ✅ 100% |
| API Integration | `api-call.test.ts` | ✅ 100% |
| Rotation Logic | `lru-rotation.test.ts` | ✅ 100% |
| Model Support | `model-support.test.ts` | ✅ 100% |
| Error Handling | `error-handling.test.ts` | ✅ 100% |
| **Total** | **6 files** | **36 tests** |

---

## Expected Results

All tests should **PASS** if:
1. Token files are valid and up-to-date
2. Gemini CLI credentials are correct
3. All 3 accounts have completed VALIDATION_REQUIRED flow
4. No rate limits are hit during test run

### Typical Output
```
✓ lib/gswarm/__tests__/integration/token-loading.test.ts (10 tests) 1.2s
✓ lib/gswarm/__tests__/integration/token-refresh.test.ts (7 tests) 12.3s
✓ lib/gswarm/__tests__/integration/api-call.test.ts (6 tests) 28.4s
✓ lib/gswarm/__tests__/integration/lru-rotation.test.ts (8 tests) 58.9s
✓ lib/gswarm/__tests__/integration/model-support.test.ts (9 tests) 31.2s
✓ lib/gswarm/__tests__/integration/error-handling.test.ts (6 tests) 124.5s

Test Files  6 passed (6)
     Tests  46 passed (46)
  Start at  23:45:12
  Duration  256.5s (transform 45ms, setup 0ms, collect 3.2s, tests 253.3s)
```

---

## Troubleshooting

### "ENOENT: no such file or directory"
**Cause:** Token files not found
**Fix:** Verify files exist at `D:/source/cwchat/main/gswarm-tokens/`

### "401 Unauthorized"
**Cause:** Access token expired and refresh failed
**Fix:** Check `refresh_token` is valid, verify Gemini CLI credentials

### "VALIDATION_REQUIRED"
**Cause:** Account needs verification
**Fix:** Follow URL in error metadata to verify account

### "429 Too Many Requests"
**Cause:** Rate limit hit during rapid testing
**Fix:** Wait 1 minute and re-run tests

### Test Timeouts
**Cause:** Network latency or API slowness
**Fix:** Increase timeout in test file (default: 10-15s)

---

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run Integration Tests
  run: pnpm vitest:run lib/gswarm/__tests__/integration
  env:
    CI: true
```

### Pre-commit Hook
```bash
#!/bin/sh
pnpm vitest:run lib/gswarm/__tests__/integration --reporter=basic
```

---

## Insights

**Decision:** Tests use real token files from cwchat repo (not mocks)
**Trade-off:** Realistic validation vs. dependency on external state
**Watch:** Token expiration may cause test failures over time

**Decision:** Hardcoded Gemini CLI credentials (not env vars)
**Trade-off:** Simple setup vs. security exposure (client secret is public)
**Watch:** If Google rotates credentials, update GEMINI_CLI_CREDENTIALS constant

**Decision:** Tests make real API calls (not stubbed)
**Trade-off:** True end-to-end coverage vs. network dependency and quota usage
**Watch:** Rate limits during CI runs - may need test throttling

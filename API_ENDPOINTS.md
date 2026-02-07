# GSwarm API Management Endpoints

## Overview

The following management dashboard API endpoints have been implemented to provide visibility into the GSwarm system health, accounts, models, and metrics.

## Endpoints

### 1. GET /api/gswarm/status

Overall system health and status information.

**Authentication:** Session cookie or API key (Bearer token)

**Response:**
```json
{
  "success": true,
  "accounts": 3,
  "validAccounts": 3,
  "projects": 36,
  "activeProjects": 34,
  "cooldownProjects": 2,
  "models": [
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-3-flash-preview",
    "gemini-3-pro-preview"
  ],
  "defaultModel": "gemini-2.5-pro",
  "uptime": "2h 15m",
  "timestamp": "2026-02-07T23:45:00.000Z"
}
```

**Fields:**
- `accounts` - Total number of OAuth accounts
- `validAccounts` - Number of non-expired, non-invalid accounts
- `projects` - Total number of GCP projects
- `activeProjects` - Projects not in cooldown
- `cooldownProjects` - Projects currently in cooldown due to errors/429s
- `models` - Array of available Gemini model IDs
- `defaultModel` - Currently configured default model
- `uptime` - Process uptime (formatted)
- `timestamp` - Current server time

---

### 2. GET /api/gswarm/accounts

List all OAuth accounts with their projects and verification status.

**Authentication:** Session cookie or API key (Bearer token)

**Response:**
```json
{
  "success": true,
  "count": 3,
  "accounts": [
    {
      "email": "bosmadev1@gmail.com",
      "projects": 12,
      "projectIds": ["project-1", "project-2", "..."],
      "verified": true,
      "isInvalid": false,
      "invalidReason": null,
      "lastUsed": "2026-02-07T22:30:00.000Z",
      "tokenExpiry": "2026-02-07T23:30:00.000Z",
      "isExpired": false,
      "client": "gemini-cli",
      "createdAt": "2026-02-06T10:00:00.000Z",
      "updatedAt": "2026-02-07T22:30:00.000Z"
    }
  ]
}
```

**Account Fields:**
- `email` - Account email address
- `projects` - Number of GCP projects for this account
- `projectIds` - Array of project IDs
- `verified` - Whether token is valid and not expired
- `isInvalid` - Whether token was marked invalid
- `invalidReason` - Reason for invalidation (if applicable)
- `lastUsed` - Last successful API call timestamp
- `tokenExpiry` - Token expiration timestamp
- `isExpired` - Whether token is currently expired
- `client` - OAuth client that created the token
- `createdAt` - Token creation timestamp
- `updatedAt` - Last token update timestamp

---

### 3. GET /api/gswarm/models

List available Gemini models with metadata and filtering.

**Authentication:** Session cookie or API key (Bearer token)

**Query Parameters:**
- `tier` - Filter by model tier: `flash` or `pro`
- `generation` - Filter by generation: `2.0`, `2.5`, `3.0`
- `includePreview` - Include preview models (default: `true`)

**Examples:**
- `/api/gswarm/models` - All models
- `/api/gswarm/models?tier=pro` - Only Pro models
- `/api/gswarm/models?generation=2.5` - Only 2.5 generation
- `/api/gswarm/models?includePreview=false` - No preview models

**Response:**
```json
{
  "success": true,
  "defaultModel": "gemini-2.5-pro",
  "count": 5,
  "models": [
    {
      "id": "gemini-2.5-pro",
      "name": "Gemini 2.5 Pro",
      "family": "gemini",
      "tier": "pro",
      "generation": "2.5",
      "isPreview": false,
      "maxInputTokens": 2097152,
      "maxOutputTokens": 65536,
      "supportsThinking": true,
      "description": "Advanced model for complex reasoning"
    }
  ]
}
```

**Model Fields:**
- `id` - Model identifier (e.g., "gemini-2.5-pro")
- `name` - Human-readable model name
- `family` - Model family ("gemini")
- `tier` - Model tier: "flash" or "pro"
- `generation` - Generation version: "2.0", "2.5", "3.0"
- `isPreview` - Whether this is a preview/experimental model
- `maxInputTokens` - Maximum input context size
- `maxOutputTokens` - Maximum output tokens
- `supportsThinking` - Whether model supports thinking mode
- `description` - Brief model description

---

### 4. GET /api/gswarm/metrics

Usage metrics and quota information (existing endpoint).

**Authentication:** Session cookie or API key (Bearer token)

**Query Parameters:**
- `startDate` - Start date in YYYY-MM-DD format (default: today)
- `endDate` - End date in YYYY-MM-DD format (default: startDate)

**Response:**
```json
{
  "success": true,
  "status": {
    "healthy": true,
    "backend": "gswarm",
    "model": "gemini-2.5-pro",
    "projectCount": 36
  },
  "quota": {
    "used": 250,
    "capacity": 54000,
    "remaining": 53750,
    "usageRatePerHour": 12.5,
    "exhaustsAt": 1707350400000,
    "exhaustsIn": "21h 30m",
    "prediction": {
      "exhaustedAt": "2026-02-08T20:15:00Z",
      "remainingRequests": 53750
    }
  },
  "metrics": {
    "period": {
      "start": "2026-02-07",
      "end": "2026-02-07"
    },
    "requests": {
      "total": 250,
      "successful": 245,
      "failed": 5,
      "successRate": 98.0
    },
    "latency": {
      "avgMs": 850,
      "totalMs": 212500
    },
    "byEndpoint": {
      "/api/gswarm/generate": {
        "total": 180,
        "successful": 178,
        "failed": 2,
        "avg_duration_ms": 900,
        "total_duration_ms": 162000
      }
    },
    "byAccount": {
      "bosmadev1@gmail.com": {
        "total": 85,
        "successful": 84,
        "failed": 1,
        "avg_duration_ms": 820,
        "total_duration_ms": 69700,
        "error_types": {
          "rate_limit": 1
        }
      }
    },
    "byProject": {
      "project-123": {
        "total": 25,
        "successful": 25,
        "failed": 0,
        "avg_duration_ms": 780,
        "total_duration_ms": 19500,
        "tokens_used": 125000
      }
    },
    "errors": {
      "rate_limit": 3,
      "auth": 2
    }
  },
  "accountErrorRates": {
    "bosmadev1@gmail.com": {
      "errorRate": 0.012,
      "total": 85
    }
  }
}
```

---

## Authentication

All endpoints support two authentication methods:

### 1. Session Cookie (for dashboard UI)
Uses `validateAdminSession()` from `@/lib/admin-session`.

### 2. API Key (for programmatic access)
**Header:** `Authorization: Bearer <api-key>`

**Rate Limiting:**
- Rate limit headers included in responses:
  - `X-RateLimit-Remaining` - Requests remaining in current window
  - `X-RateLimit-Reset` - Unix timestamp when limit resets

**Error Responses:**
- `401 Unauthorized` - Missing or invalid credentials
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

---

## CORS Support

All endpoints include CORS headers for cross-origin access:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With`

**OPTIONS requests** are supported for CORS preflight.

---

## Implementation Details

**Files:**
- `app/api/gswarm/status/route.ts` - 185 lines
- `app/api/gswarm/accounts/route.ts` - 163 lines
- `app/api/gswarm/models/route.ts` - 225 lines
- `app/api/gswarm/metrics/route.ts` - 234 lines (existing)

**Total:** 573 lines of new code

**Shared utilities:**
- `app/api/gswarm/_shared/auth.ts` - Authentication helpers
- `lib/gswarm/storage/tokens.ts` - Token management
- `lib/gswarm/storage/projects.ts` - Project status tracking
- `lib/gswarm/storage/metrics.ts` - Metrics aggregation

**Dependencies:**
- Next.js 16+ App Router
- `@/lib/admin-session` - Session validation
- `@/lib/console` - Logging utilities
- `@/lib/gswarm/*` - GSwarm core libraries

---

## Testing

Start the development server:
```bash
pnpm dev
```

Test endpoints (requires authentication):
```bash
# Status endpoint
curl http://localhost:3000/api/gswarm/status \
  -H "Authorization: Bearer YOUR_API_KEY"

# Accounts endpoint
curl http://localhost:3000/api/gswarm/accounts \
  -H "Authorization: Bearer YOUR_API_KEY"

# Models endpoint (with filtering)
curl "http://localhost:3000/api/gswarm/models?tier=pro" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Metrics endpoint (date range)
curl "http://localhost:3000/api/gswarm/metrics?startDate=2026-02-07&endDate=2026-02-07" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Future Enhancements

- [ ] WebSocket support for real-time status updates
- [ ] Metrics export to CSV/JSON
- [ ] Dashboard UI components
- [ ] Grafana/Prometheus integration
- [ ] Rate limit customization per endpoint
- [ ] Historical trend analysis

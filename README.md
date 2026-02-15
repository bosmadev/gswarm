<div align="center">

```
   ██████  ███████ ██     ██  █████  ██████  ███    ███
  ██       ██      ██     ██ ██   ██ ██   ██ ████  ████
  ██   ███ ███████ ██  █  ██ ███████ ██████  ██ ████ ██
  ██    ██      ██ ██ ███ ██ ██   ██ ██   ██ ██  ██  ██
   ██████  ███████  ███ ███  ██   ██ ██   ██ ██      ██
```

### Free Gemini API Inference Gateway

Use Google's Gemini models for free through an OpenAI-compatible API.
Pool multiple Gmail accounts to multiply your free-tier quota.

![Next.js](https://img.shields.io/badge/Next.js-16+-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-3178C6?logo=typescript)
![License](https://img.shields.io/badge/License-AGPL--3.0-blue)

</div>

---

## What is GSwarm?

GSwarm is an OpenAI-compatible API proxy that routes requests through Google's free CloudCode PA endpoint — the same backend used by Gemini CLI. It pools multiple Google accounts and rotates across their GCP projects to maximize free-tier throughput.

**With 3 free Gmail accounts (36 GCP projects), you get:**

| Model | Requests/Min | Requests/Day | Per Account |
|-------|-------------|-------------|-------------|
| Gemini 2.5 Flash | ~250 RPM | ~5,000 RPD | ~1,680/acc |
| Gemini 2.5 Pro | ~130 RPM | ~211 RPD | ~70-80/acc |
| Gemini 3 Flash Preview | ~300 RPM | ~5,880 RPD | ~1,960/acc |
| Gemini 3 Pro Preview | — | ~210 RPD | ~70-80/acc |

## Quick Example

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-gswarm-your-key" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

Works with any OpenAI-compatible client — Cursor, Continue, Open WebUI, LangChain, etc.

## Standalone Version

Don't need the full dashboard? Use the single-file Python version:

```bash
# Download and run
python gswarm-standalone.py

# Benchmark your setup
python gswarm-standalone.py bench --model gemini-3-pro-preview --duration 60 --rpm 60
```

**[Get gswarm-standalone.py](https://gist.github.com/bosmadev/96650e6df30f77281aa1f4e399289d3d)**

---

## Setup

### 1. Install & Configure

```bash
git clone https://github.com/bosmadev/gswarm.git
cd gswarm
pnpm install
```

### 2. Environment

Create a `.env` file (encrypted via [dotenvx](https://dotenvx.com)):

```bash
# Admin credentials (fallback if Redis is unavailable)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# API Keys (format: name:key:ips — use * for all IPs)
API_KEYS=myapp:sk-gswarm-xxxxx:*

# Application
GLOBAL_PORT=3001
GLOBAL_URL=http://localhost

# Session Secret (generate: openssl rand -base64 32)
SESSION_SECRET=your-session-secret

# Redis — any Redis-compatible service works
# Upstash (free): https://upstash.com/pricing/redis
# Self-hosted: redis://localhost:6379
REDIS_URL=redis://localhost:6379
```

Encrypt with `pnpm env:encrypt` before committing.

### 3. Run

```bash
pnpm dev          # Development (Turbopack)
pnpm launch       # Interactive TUI launcher
pnpm build        # Production build
```

### 4. Add Accounts

Open the dashboard at `http://localhost:3001/dashboard`, log in, and click **Add Account** to connect Gmail accounts via OAuth. Each account gives you 12 GCP projects for rotation.

## How It Works

```
Client (OpenAI SDK) → GSwarm → Google CloudCode PA → Gemini Models
                        ↓
              LRU rotation across
           3 accounts × 12 projects
              = 36 rotation slots
```

1. **Request arrives** at `/v1/chat/completions` (OpenAI-compatible)
2. **LRU selector** picks the healthiest project (success rate + cooldown scoring)
3. **Token manager** provides a valid OAuth token (auto-refresh)
4. **Request proxied** to Google's CloudCode PA endpoint
5. **On 429/error** — automatic failover to next project/account

## Supported Models

| Model | ID |
|-------|-----|
| Gemini 2.5 Flash | `gemini-2.5-flash` |
| Gemini 2.5 Pro | `gemini-2.5-pro` |
| Gemini 3 Flash Preview | `gemini-3-flash-preview` |
| Gemini 3 Pro Preview | `gemini-3-pro-preview` |
| Gemini 2.0 Flash | `gemini-2.0-flash` |

## Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5.9 |
| Storage | Redis (Upstash / self-hosted) |
| Auth | Google OAuth 2.0 |
| Linting | Biome |
| Testing | Vitest + Pytest |

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for the fork-based workflow.

PRs target `main`. Run `pnpm validate` before submitting.

## License

**AGPL-3.0** — See [LICENSE](./LICENSE)

| Permitted | Required | Restricted |
|-----------|----------|-----------|
| Commercial use | Disclose source | Closed-source mods |
| Modification | Same license | Proprietary SaaS |
| Distribution | Network use = distribution | |
| Private use | Copyright notice | |

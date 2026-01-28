<div align="center">

# GSwarm API

OpenAI-compatible API gateway for Google Cloud AI with multi-account token pooling.

![Next.js](https://img.shields.io/badge/Next.js-16+-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-3178C6?logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js)

</div>

## Features

- OpenAI-compatible `/v1/chat/completions` endpoint
- Multi-account Google OAuth token pooling
- Admin dashboard for account and API key management
- Automatic token refresh
- IP-based API key restrictions
- Metrics and error tracking

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd gswarm-api
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Development
pnpm dev

# Production build
pnpm build
```

## Environment Variables

Create a `.env` file with the following:

```bash
# Google OAuth (required for token management)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Admin Authentication
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# Dashboard Users (format: user1:pass1,user2:pass2)
DASHBOARD_USERS=user1:password1

# API Keys (format: name:key:ips - use * for all IPs)
API_KEYS=mykey:sk-gswarm-xxxxx:*

# Application
NEXT_PUBLIC_APP_URL=https://your-domain.com
NODE_ENV=production

# Session Secret (generate with: openssl rand -base64 32)
SESSION_SECRET=your-session-secret
```

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `https://your-domain.com/api/auth/callback`
4. Copy Client ID and Client Secret to your `.env`

## Deployment (Azure VM + WSL)

The project deploys automatically via GitHub Actions on push to `main`.

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `AZURE_VM_IP` | Azure VM public IP address |
| `AZURE_VM_USER` | SSH username (e.g., `azureuser`) |
| `AZURE_SSH_PRIVATE_KEY` | SSH private key for deployment |
| `DOTENV_PRIVATE_KEY` | dotenvx decryption key (optional) |

### Server Setup (One-time)

```bash
# On Azure VM (WSL/Ubuntu)

# Create app directory
sudo mkdir -p /opt/gswarm-api
sudo chown $USER:$USER /opt/gswarm-api

# Create .env file with secrets
sudo tee /opt/gswarm-api/.env << 'EOF'
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-password
DASHBOARD_USERS=user1:pass1
API_KEYS=key1:sk-gswarm-xxx:*
NEXT_PUBLIC_APP_URL=https://your-domain.com
NODE_ENV=production
SESSION_SECRET=your-session-secret
EOF

# Secure the .env file
sudo chmod 600 /opt/gswarm-api/.env

# Service user will be created automatically by deploy workflow
```

### Service Management

```bash
# Status
sudo systemctl status gswarm-api

# Logs
sudo journalctl -u gswarm-api -f

# Restart
sudo systemctl restart gswarm-api
```

## VM Deployment

### Server Control

```bash
cd /opt/gswarm-api

./launch.sh start        # Start in background
./launch.sh foreground   # Run in foreground (Ctrl+C to stop)
./launch.sh stop         # Stop server
./launch.sh restart      # Restart server
./launch.sh logs         # Tail error.log
./launch.sh status       # Check if running
```

### CLI Scripts (Node.js 25+ required)

```bash
node lib/gswarm/cli.ts status           # GSwarm status
node lib/gswarm/cli.ts projects         # List projects
node scripts/test-api-keys.ts list      # List API keys
```

### Error Logs

- **Production:** `/opt/gswarm-api/error.log`
- **Development:** `./error.log` (gitignored)

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/gswarm/chat` | OpenAI-compatible chat completions |
| `POST /api/gswarm/generate` | Text generation |
| `GET /api/gswarm/config` | Available models |
| `GET /api/gswarm/metrics` | Usage metrics |
| `GET /dashboard` | Admin dashboard |

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Development server (port 3000) |
| `pnpm build` | Production build |
| `pnpm validate` | Run all checks |

## License

All rights reserved.

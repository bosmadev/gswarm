<div align="center">

# Next.js Template

Next.js 16+ template with Biome, Knip, Vitest, Tailwind v4, and Python support.

![Next.js](https://img.shields.io/badge/Next.js-16+-black?logo=next.js)
![React](https://img.shields.io/badge/React-19+-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-3178C6?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-v4+-06B6D4?logo=tailwindcss)
![Python](https://img.shields.io/badge/Python-3.13+-3776AB?logo=python)

</div>

## Features

- Next.js 16+ with Turbopack for fast development
- React 19 with strict mode enabled
- TypeScript 5.9+ with strict compiler settings
- Tailwind CSS v4 with `@theme` design tokens
- Biome for linting and formatting
- Knip for dead-code detection
- Vitest for unit testing + pytest for Python
- Python 3.13+ with uv package manager
- Interactive launch script with multiple modes

## Quick Start

```bash
# Clone and install
git clone https://github.com/bosmadev/nextjs-bosmadev.git
cd nextjs-bosmadev
pnpm install

# Development (interactive launcher)
pnpm launch

# Or direct development server
pnpm dev
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm launch` | Interactive launcher with dev/prod/tunnel modes |
| `pnpm dev` | Development server with Turbopack (port 3000) |
| `pnpm build` | Full build with validation |
| `pnpm validate` | Run all checks (knip, biome, tsc, vitest, pytest) |
| `pnpm check:all` | Biome lint + format check |
| `pnpm tsc` | TypeScript type checking |
| `pnpm vitest:run` | Run Vitest tests |
| `pnpm pytest` | Run Python tests |
| `pnpm reinstall` | Clean reinstall dependencies |

## Project Structure

```
nextjs-bosmadev/
├── app/                  # Next.js app directory
│   ├── globals.css       # Tailwind v4 design tokens
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home page
├── lib/                  # Shared utilities
│   ├── console.ts        # Logging utilities
│   └── utils.ts          # Tailwind cn() helper
├── python/               # Python subproject
│   ├── pyproject.toml    # Python config
│   └── tests/            # pytest tests
├── scripts/              # Build scripts
│   ├── launch.ts         # Interactive launcher
│   ├── reinstall.mjs     # Clean reinstall
│   └── sync-version.mjs  # Version sync
├── biome.json            # Linting/formatting
├── tailwind.config.ts    # Tailwind config
└── tsconfig.json         # TypeScript config
```

## Requirements

- Node.js 25+
- pnpm 10.26+
- Python 3.13+ (optional, for ML pipeline)
- uv 0.9+ (Python package manager)

## License

MIT

---

<div align="center">

## Changelog

</div>

---
[![v](https://img.shields.io/badge/v100-2026--1--20-64748b.svg)]()

- [x] Initial template release
- [x] Next.js 16.1+ with Turbopack
- [x] Tailwind CSS v4 with slate color palette
- [x] Biome 2.3+ / Knip 5.77+ / Vitest 4.0+ configured
- [x] Python 3.13+ with uv package manager and pytest
- [x] Interactive launch script with Crush-style UI
- [x] Version sync between package.json and pyproject.toml

# Contributing to gswarm

Thank you for your interest in contributing to gswarm! This guide will help you get started.

## Development Workflow

### Fork and Clone

1. Fork this repository to your GitHub account
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/gswarm.git
   cd gswarm
   ```

### Branch Naming

Create a feature branch from `main`:
```bash
git checkout -b feature/your-feature-name
```

**IMPORTANT:** Do NOT branch from `gswarm-dev`. The `gswarm-dev` branch is force-reset after every PR merge and is used exclusively for development builds.

### Pull Request Process

1. **Target:** All PRs must target the `main` branch
2. **Code Style:** This project uses Biome for linting and formatting. Your code will be auto-formatted during CI.
3. **Commit Messages:** Use clear, descriptive commit messages
4. **Testing:** Ensure your changes pass all tests before submitting

### Code Style

- **Formatter:** Biome (runs automatically)
- **Indentation:** Spaces (configured in `biome.json`)
- **Linting:** Biome rules are enforced in CI

No manual formatting needed — just write clean code and Biome will handle the rest.

### Branching Model

| Branch | Purpose | PR Target |
|--------|---------|-----------|
| `main` | Production releases | N/A (direct commits only by maintainers) |
| `gswarm-dev` | Development builds | `main` |
| `feature/*` | Feature work | `main` |

**Note:** After a PR is merged to `main`, the `gswarm-dev` branch is automatically force-reset to match `main`. This keeps the development branch clean and prevents merge conflicts.

## Questions?

Open an issue or reach out to [@bosmadev](https://github.com/bosmadev).

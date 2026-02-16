# Project Guidelines

## Code Standards

- TypeScript strict mode (`strict: true` in tsconfig)
- Biome for linting and formatting (not ESLint/Prettier)
- Conventional commits: `type(scope): description`
- Next.js App Router (`app/` directory, not `pages/`)
- React Server Components by default; `"use client"` only when needed
- Tailwind CSS for styling (no CSS modules or styled-components)
- pnpm as package manager

## Security Review Criteria

When reviewing code (applies to `/review`, `@claude review`, and CI security scans):

### OWASP Top 10

- **Injection**: SQL/NoSQL injection, command injection, LDAP injection in any user input path
- **Broken Auth**: Missing or weak authentication on API routes, session fixation, credential stuffing vectors
- **Data Exposure**: Sensitive data in logs, error messages, or API responses; PII leakage; stack traces in production
- **XXE**: XML external entity processing in any parser configuration
- **Broken Access Control**: Missing authorization checks, IDOR, privilege escalation, CORS misconfig
- **Security Misconfig**: Default credentials, verbose errors, unnecessary HTTP methods, missing security headers
- **XSS**: Reflected, stored, and DOM-based XSS; unsanitized user input in JSX/HTML
- **Insecure Deserialization**: Untrusted data in JSON.parse with prototype pollution, pickle, eval
- **Vulnerable Dependencies**: Known CVEs in direct or transitive dependencies
- **Insufficient Logging**: Missing audit trails for auth events, failed access attempts, data mutations

### Application-Specific

- **API Route Security**: All `app/api/` routes must validate authentication before processing
- **Environment Variables**: Never hardcode secrets; use `encrypted:` prefix with dotenvx; never log env values
- **Redis/Database**: Parameterized queries only; no string interpolation in keys or queries
- **Rate Limiting**: API endpoints must have rate limiting; check for bypass vectors
- **CSRF**: State-changing operations must validate origin/CSRF tokens
- **Supply Chain**: Flag suspicious dependency additions, install scripts, or obfuscated code

### Obfuscation Detection

- Flag minified/encoded payloads in source files (not in `node_modules` or build output)
- Flag Base64-encoded strings longer than 100 chars that aren't assets
- Flag `eval()`, `Function()`, `new Function()` usage outside test files
- Flag dynamic `require()` or `import()` with variable paths
- Flag network requests to hardcoded IPs or unusual domains

## Code Quality

- No `any` types (use `unknown` + type guards)
- Error handling: catch specific errors, never swallow silently
- No `console.log` in production code (use structured logging)
- Functions under 50 lines; files under 500 lines
- Tests required for business logic (vitest for TS, pytest for Python)

## Accessibility (WCAG AAA)

- Semantic HTML elements (`button`, `nav`, `main`, not `div` with onClick)
- ARIA labels on interactive elements
- Keyboard navigation support
- Color contrast ratio 7:1 minimum
- Focus indicators visible

## Architecture

- Server-side data fetching in Server Components
- Client components only for interactivity (forms, state, effects)
- API routes in `app/api/` follow REST conventions
- Shared utilities in `lib/`; component-specific logic colocated
- No circular imports between modules

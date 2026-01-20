---
name: security-audit
description: Security auditing based on OWASP Top 10:2025 guidelines. Use when reviewing code for vulnerabilities, conducting security audits, or implementing security features.
---

# Security Audit

## Scope

This skill covers:
- OWASP Top 10:2025 vulnerability patterns
- Security tools and static analysis
- Defensive security practices

## Policy

- Assist with defensive security tasks ONLY
- Refuse to create, modify, or improve code that may be used maliciously
- Do NOT assist with:
  - Credential discovery or harvesting
  - Bulk crawling for SSH keys, cookies, or wallets
  - Malware development or improvement

## Quick Reference

### A01 - Broken Access Control

- Enforce server-side access controls; never trust client-side
- Use RBAC (Role-Based Access Control) pattern
- Protect against privilege escalation and IDOR

### A02 - Security Misconfiguration

- Verify all security settings across the stack
- Disable unnecessary features, endpoints, and debug modes
- Use security headers (Helmet.js for Express/Node)

### A03 - Software Supply Chain Failures

- Pin dependencies with lockfiles
- Use Snyk, Dependabot, or Socket for monitoring

### A04 - Cryptographic Failures

- Use strong encryption (AES-256, RSA-2048+)
- Never store passwords in plaintext; use bcrypt/scrypt
- Rotate secrets and use environment variables

### A05 - Injection

- Parameterized queries for SQL/NoSQL
- Input validation with Zod schemas
- Sanitize output to prevent XSS

## Detailed Resources

- For complete OWASP Top 10 rules, see [owasp-top10.md](owasp-top10.md)
- For security tools reference, see [tools.md](tools.md)

## Key Checks

1. Are sensitive data (API keys, tokens) hardcoded?
2. Is `target="_blank"` used without `rel="noopener"`?
3. Are there import cycles?
4. Is user input validated at API boundaries?
5. Are passwords stored in plaintext?
6. Is RBAC enforced server-side?

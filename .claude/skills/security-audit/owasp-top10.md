# OWASP Top 10:2025 Detailed Guidelines

## A01 - Broken Access Control

**Risks:**
- Privilege escalation
- Insecure Direct Object References (IDOR)
- Missing function-level access control

**Prevention:**
- Enforce server-side access controls; never trust client-side
- Use RBAC (Role-Based Access Control) pattern
- Deny by default
- Log access control failures and alert admins
- Rate limit API access to minimize automated attacks

## A02 - Security Misconfiguration

**Risks:**
- Default credentials
- Unnecessary features enabled
- Overly permissive CORS
- Verbose error messages exposing stack traces

**Prevention:**
- Verify all security settings across the stack
- Disable unnecessary features, endpoints, and debug modes
- Use security headers (Helmet.js for Express/Node)
- Review cloud storage permissions (S3 buckets, etc.)
- Automate configuration verification

## A03 - Software Supply Chain Failures

**Risks:**
- Compromised dependencies
- Typosquatting attacks
- Outdated packages with known vulnerabilities

**Prevention:**
- Pin dependencies with lockfiles
- Use Snyk, Dependabot, or Socket for monitoring
- Verify package integrity (checksums, signatures)
- Review dependency tree for unexpected packages
- Use private registries for internal packages

## A04 - Cryptographic Failures

**Risks:**
- Plaintext password storage
- Weak encryption algorithms
- Hardcoded secrets

**Prevention:**
- Use strong encryption (AES-256, RSA-2048+)
- Never store passwords in plaintext; use bcrypt/scrypt
- Rotate secrets and use environment variables
- Use TLS 1.3 for data in transit
- Classify data and apply appropriate protection

## A05 - Injection

**Types:**
- SQL Injection
- NoSQL Injection
- Command Injection
- XSS (Cross-Site Scripting)

**Prevention:**
- Parameterized queries for SQL/NoSQL
- Input validation with Zod schemas
- Sanitize output to prevent XSS
- Use ORMs with proper escaping
- Content Security Policy (CSP) headers

## A06 - Vulnerable and Outdated Components

**Prevention:**
- Remove unused dependencies
- Continuously inventory component versions
- Monitor CVE databases
- Obtain components from official sources only

## A07 - Identification and Authentication Failures

**Prevention:**
- Implement MFA
- Don't ship with default credentials
- Implement weak password checks
- Use secure session management
- Limit failed login attempts

## A08 - Software and Data Integrity Failures

**Prevention:**
- Verify software/data integrity with signatures
- Use secure CI/CD pipelines
- Review code changes
- Ensure serialized data is signed or encrypted

## A09 - Security Logging and Monitoring Failures

**Prevention:**
- Log all authentication attempts
- Ensure logs are immutable
- Implement alerting for suspicious activities
- Conduct regular security audits

## A10 - Server-Side Request Forgery (SSRF)

**Prevention:**
- Validate and sanitize all client-supplied URLs
- Use allowlists for permitted destinations
- Disable HTTP redirects
- Don't send raw responses to clients

# Security Tools Reference

## Static Analysis

- **ESLint with security plugins** - JavaScript/TypeScript linting with security rules
- **Biome's security rules** - Built-in security linting
- **SonarQube** - Code quality and security analysis

## Dependency Scanning

- **`npm audit` / `pnpm audit`** - Built-in vulnerability scanning
- **Snyk** - Comprehensive dependency vulnerability scanning
- **Socket.dev** - Supply chain security analysis
- **Dependabot** - Automated dependency updates

## Runtime Protection

- **Arcjet** - Rate limiting + bot detection
- **Cloudflare WAF** - Edge protection and Web Application Firewall

## Frameworks & References

- **MITRE ATT&CK** - Threat intelligence framework
- **OWASP Cheat Sheets** - Defensive patterns and best practices
- **CWE (Common Weakness Enumeration)** - Vulnerability classification

## Node.js Specific

### Input Validation

```javascript
import { z } from 'zod';

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
```

### Rate Limiting

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
```

### HTTP Headers (Helmet.js)

```javascript
import helmet from 'helmet';
app.use(helmet());
```

## Next.js Specific

### Content Security Policy

```javascript
// next.config.ts
const cspHeader = `
  default-src 'self';
  script-src 'self' 'nonce-{NONCE}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
`
```

### Data Tainting

```javascript
// Prevent sensitive server data from reaching client
import { taintObjectReference } from 'react';

taintObjectReference('Do not pass to client', sensitiveData);
```

## Authentication Libraries

- **Lucia** - Lightweight auth library
- **NextAuth.js** - Full-featured auth for Next.js
- **Clerk** - Managed authentication service

## Security Checklist

- [ ] Secrets stored in environment variables
- [ ] Dependencies pinned and audited
- [ ] Input validation at all API boundaries
- [ ] Parameterized database queries
- [ ] HTTPS enforced
- [ ] Security headers configured
- [ ] Rate limiting implemented
- [ ] Logging and monitoring active
- [ ] Regular dependency updates scheduled
